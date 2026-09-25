#!/bin/sh
# shellcheck shell=sh

# profiles, subscriptions and the mixin of the settings into the profile for startup

# field of a subscription, $1 id, $2 field
sub_get() {
	jq -r --arg id "$1" --arg key "$2" '(.subscriptions // [])[] | select(.id == $id) | .[$key] | if . == null then empty else tostring end' "$CONFIG_PATH" 2> /dev/null
}

# subscription info (traffic, expire, last update) is kept next to the file, not in the config
sub_state_path() {
	echo "$SUBSCRIPTIONS_DIR/$1.json"
}

# value of a header in a curl -D dump, the last response wins after redirects, $2 is the name in lower case
header_value() {
	[ -f "$1" ] || return 0
	awk -v name="$2" '
		{ line = $0; sub(/\r$/, "", line) }
		line ~ /^HTTP\// { value = ""; next }
		{
			i = index(line, ":")
			if (i > 0 && tolower(substr(line, 1, i - 1)) == name) {
				value = substr(line, i + 1)
				sub(/^[ \t]+/, "", value)
			}
		}
		END { print value }' "$1"
}

# what the provider tells about the profile in the headers ($1 the subscription, $2 the info address) as json:
# title, announce, support link, logo and the update interval in hours; base64: values are decoded, links are http(s) or tg
provider_meta() {
	local first second
	first="$1"
	second="$2"
	jq -n -c \
		--arg title "$(header_value "$first" profile-title)" \
		--arg title2 "$(header_value "$second" profile-title)" \
		--arg announce "$(header_value "$first" announce)" \
		--arg announce2 "$(header_value "$second" announce)" \
		--arg support "$(header_value "$first" support-url)" \
		--arg support2 "$(header_value "$second" support-url)" \
		--arg logo "$(header_value "$first" profile-logo)" \
		--arg logo2 "$(header_value "$second" profile-logo)" \
		--arg interval "$(header_value "$first" profile-update-interval)" \
		--arg interval2 "$(header_value "$second" profile-update-interval)" '
		def pick($a; $b): if $a != "" then $a else $b end;
		def decode: if startswith("base64:") then ((.[7:] | @base64d)? // "") else . end;
		def text($newlines): explode | map(select(. >= 32 or ($newlines and . == 10))) | implode;
		def safe_url($schemes): . as $v | if any($schemes[]; . as $s | $v | startswith($s)) then $v else "" end;
		def digits: length > 0 and (explode | all(. >= 48 and . <= 57));
		pick($interval; $interval2) as $hours
		| {
			title: (pick($title; $title2) | decode | text(false) | .[0:128]),
			announce: (pick($announce; $announce2) | decode | text(true) | .[0:2000]),
			support_url: (pick($support; $support2) | decode | text(false) | safe_url(["https://", "http://", "tg://"])),
			logo: (pick($logo; $logo2) | decode | text(false) | safe_url(["https://", "http://", "data:image/"])),
			interval: (if ($hours | digits) and ($hours | tonumber) > 0 then ($hours | tonumber) else null end)
		}
		| with_entries(select(.value != "" and .value != null))'
}

update_subscription() {
	local id name info_url url user_agent send_hwid header state now meta title
	id="$1"
	case "$id" in
		""|*/*|.*) return 1 ;;
	esac
	name=$(sub_get "$id" name)
	url=$(sub_get "$id" url)
	[ -n "$url" ] || return 1
	info_url=$(sub_get "$id" info_url)
	user_agent=$(sub_get "$id" user_agent)
	send_hwid=$(sub_get "$id" send_hwid)
	# replace {version} placeholder in user agent with the app version
	case "$user_agent" in
		*"{version}"*) user_agent=$(echo "$user_agent" | sed "s|{version}|$(app_version)|g") ;;
	esac
	# hwid headers, positional parameters are used as extra curl arguments
	set --
	if [ "$send_hwid" != "false" ]; then
		while IFS= read -r header; do
			[ -n "$header" ] && set -- "$@" -H "$header"
		done <<-EOF
			$(hwid_headers)
		EOF
	fi
	log "Profile" "Update subscription: $name."
	local success info_header_tmp header_tmp file_tmp info_file file
	info_header_tmp="$RUN_TMP/$id.info.header"
	header_tmp="$RUN_TMP/$id.header"
	file_tmp="$RUN_TMP/$id.yaml"
	file="$SUBSCRIPTIONS_DIR/$id.yaml"
	info_file=
	# fetch subscription info
	if [ -n "$info_url" ]; then
		log "Profile" "Fetch subscription info."
		if curl -s -f -m 120 --connect-timeout 15 --retry 3 -L -X GET -A "$user_agent" "$@" -D "$info_header_tmp" "$info_url" > /dev/null 2>&1; then
			grep -q -i "subscription-userinfo:" "$info_header_tmp" && info_file="$info_header_tmp"
		fi
	fi
	# download subscription
	log "Profile" "Download subscription."
	if curl -s -f -m 120 --connect-timeout 15 --retry 3 -L -X GET -A "$user_agent" "$@" -D "$header_tmp" -o "$file_tmp" "$url" > /dev/null 2>&1; then
		log "Profile" "Subscription download successful."
		[ -z "$info_file" ] && grep -q -i "subscription-userinfo:" "$header_tmp" && info_file="$header_tmp"
		if "$YQ" -M -p yaml -o yaml -e 'has("proxies") or has("proxy-providers")' "$file_tmp" > /dev/null 2>&1; then
			log "Profile" "Subscription is valid."
			success=1
		else
			log "Profile" "Subscription is not valid."
			success=0
		fi
	else
		log "Profile" "Subscription download failed."
		if grep -q -i "x-hwid-not-supported: true" "$header_tmp" 2> /dev/null; then
			log "Profile" "Subscription requires HWID, enable Send HWID for this subscription."
		fi
		if grep -q -i "x-hwid-max-devices-reached: true" "$header_tmp" 2> /dev/null; then
			log "Profile" "HWID device limit reached, remove an old device in the subscription panel."
		fi
		success=0
	fi
	state=$(sub_state_path "$id")
	now=$(date +%s)
	if [ "$success" = 1 ]; then
		log "Profile" "Subscription update successful."
		local userinfo expire upload download total used available
		expire=
		upload=
		download=
		total=
		if [ -n "$info_file" ]; then
			userinfo=$(grep -i "subscription-userinfo: " "$info_file" | head -n 1)
			expire=$(echo "$userinfo" | grep -i -o -E "expire=[[:digit:]]+" | cut -d '=' -f 2)
			upload=$(echo "$userinfo" | grep -i -o -E "upload=[[:digit:]]+" | cut -d '=' -f 2)
			download=$(echo "$userinfo" | grep -i -o -E "download=[[:digit:]]+" | cut -d '=' -f 2)
			total=$(echo "$userinfo" | grep -i -o -E "total=[[:digit:]]+" | cut -d '=' -f 2)
		fi
		used=
		available=
		if [ -n "$upload" ] && [ -n "$download" ]; then
			used=$((upload + download))
			[ -n "$total" ] && available=$((total - used))
		fi
		# the info address may carry the headers instead of the subscription
		meta=$(provider_meta "$header_tmp" "$info_header_tmp")
		[ -n "$meta" ] || meta='{}'
		jq -n \
			--argjson meta "$meta" \
			--argjson now "$now" \
			--arg expire "$([ -n "$expire" ] && date "+%Y-%m-%d %H:%M:%S" -d "@$expire" 2> /dev/null)" \
			--arg upload "$(format_filesize "$upload")" \
			--arg download "$(format_filesize "$download")" \
			--arg total "$(format_filesize "$total")" \
			--arg used "$(format_filesize "$used")" \
			--arg available "$(format_filesize "$available")" \
			--arg update "$(date "+%Y-%m-%d %H:%M:%S")" \
			'{expire: $expire, upload: $upload, download: $download, total: $total, used: $used, available: $available, update: $update}
			| with_entries(select(.value != ""))
			| . + $meta + {update_ts: $now, checked: $now, success: true}' > "$state"
		rm -f "$info_header_tmp" "$header_tmp"
		mv -f "$file_tmp" "$file"
		# the title of the provider becomes the name of the subscription
		title=$(printf '%s' "$meta" | jq -r '.title // empty')
		if [ -n "$title" ] && [ "$title" != "$name" ]; then
			cfg_update '(.subscriptions[] | select(.id == $id) | .name) = $title' --arg id "$id" --arg title "$title" \
				&& log "Profile" "Subscription name from the provider: $title."
		fi
	else
		log "Profile" "Subscription update failed."
		# the last good state stays: the announce and the traffic are still shown
		{ jq -c 'select(type == "object")' "$state" 2> /dev/null || echo '{}'; } | head -n 1 \
			| jq -c --argjson now "$now" --arg update "$(date "+%Y-%m-%d %H:%M:%S")" \
				'. + {update_failed: $update, failed_ts: $now, checked: $now, success: false}' > "$state.tmp" \
			&& mv -f "$state.tmp" "$state"
		rm -f "$info_header_tmp" "$header_tmp" "$file_tmp"
		return 1
	fi
}

# a subscription is due for a download: its interval passed since the last one, a failed download is tried again after 15 minutes
# the interval is set by hand (hours, 0 is only by hand), or comes from the provider (profile-update-interval), or is an hour
subscription_due() {
	local id interval state
	id="$1"
	[ -f "$SUBSCRIPTIONS_DIR/$id.yaml" ] || return 0
	interval=$(sub_get "$id" update_interval)
	state=$(sub_state_path "$id")
	[ -n "$interval" ] || interval=$(jq -r '.interval // empty' "$state" 2> /dev/null)
	case "$interval" in
		""|*[!0-9]*) interval=1 ;;
	esac
	[ "$interval" = 0 ] && return 1
	[ -f "$state" ] || return 0
	jq -e --argjson now "$(date +%s)" --argjson interval "$interval" \
		'($now - (.update_ts // 0)) >= $interval * 3600 and ($now - (.failed_ts // 0)) >= 900' "$state" > /dev/null 2>&1
}

# ports, dns and ipv6 of the profile for startup: the rules are built from them, a change needs a restart
profile_signature() {
	jq -c '{redir: .["redir-port"], tproxy: .["tproxy-port"], dns: .dns.listen, dns_enable: .dns.enable, mode: .dns["enhanced-mode"],
		fake: .dns["fake-ip-range"], fake6: .dns["fake-ip-range6"], ipv6: .ipv6,
		listeners: [(.listeners // [])[] | select((.name // "") | startswith("exodus-")) | {name, port}]}' "$PROFILE_JSON_PATH" 2> /dev/null
}

# the running core loads the profile for startup through its api, connections and chosen proxies are kept
core_reload() {
	local listen secret
	listen=$(jq -r '.["external-controller"] // empty' "$PROFILE_JSON_PATH" 2> /dev/null)
	secret=$(jq -r '.secret // empty' "$PROFILE_JSON_PATH" 2> /dev/null)
	[ -n "$listen" ] || return 1
	printf 'header = "Authorization: Bearer %s"\n' "$secret" | curl -s -f -m 60 -o /dev/null -X PUT -K - \
		-H 'Content-Type: application/json' -d "$(jq -n -c --arg path "$RUN_PROFILE_PATH" '{path: $path, payload: ""}')" \
		"http://127.0.0.1:${listen##*:}/configs?force=true"
}

# a new subscription goes to the running core; it is checked first, a failed check keeps the running profile
reload_profile() {
	local before
	if ! lock_acquire service 50; then
		log "Profile" "The service is busy, the new subscription applies on the next start."
		return 1
	fi
	log "Profile" "Apply the new subscription."
	before=$(profile_signature)
	cp -f "$RUN_PROFILE_PATH" "$RUN_PROFILE_PATH.bak"
	if prepare_profile && mixin_profile && "$PROG" -d "$RUN_DIR" -t >> "$CORE_LOG_PATH" 2>&1; then
		profile_json
		if [ "$(profile_signature)" != "$before" ]; then
			log "Profile" "Ports, DNS or IPv6 of the profile changed, restart."
			lock_release service
			daemonize "$EXODUS" restart
			return 0
		fi
		if core_reload; then
			log "Profile" "The core reloaded the profile."
		else
			log "Profile" "The core did not reload the profile, restart."
			lock_release service
			daemonize "$EXODUS" restart
			return 0
		fi
	else
		mv -f "$RUN_PROFILE_PATH.bak" "$RUN_PROFILE_PATH"
		log "Profile" "The new subscription failed the check, the core keeps the running profile."
	fi
	lock_release service
}

# download a subscription; when it is the running profile and it changed, the core gets it
refresh_subscription() {
	local id file before
	id="$1"
	file="$SUBSCRIPTIONS_DIR/$id.yaml"
	lock_acquire subscription 1 || return 0
	before=$(sha256sum < "$file" 2> /dev/null)
	if update_subscription "$id" && [ -f "$STARTED_FLAG_PATH" ] && [ "$c_config_profile" = "subscription:$id" ] \
		&& [ "$(sha256sum < "$file")" != "$before" ]; then
		reload_profile
	fi
	lock_release subscription
}

# copy the chosen profile or subscription to the profile for startup
prepare_profile() {
	local profile_type profile_id file name
	profile_type="${c_config_profile%%:*}"
	profile_id="${c_config_profile#*:}"
	case "$profile_id" in
		""|*/*|.*)
			log "Profile" "No profile/subscription selected."
			return 1
			;;
	esac
	if [ "$profile_type" = "file" ]; then
		file="$PROFILES_DIR/$profile_id"
		log "Profile" "Use file: $profile_id."
		if [ ! -f "$file" ]; then
			log "Profile" "File not found."
			return 1
		fi
	elif [ "$profile_type" = "subscription" ]; then
		name=$(sub_get "$profile_id" name)
		file="$SUBSCRIPTIONS_DIR/$profile_id.yaml"
		log "Profile" "Use subscription: $name."
		# the saved file is used until its interval passes, the start does not wait for the provider
		if subscription_due "$profile_id"; then
			update_subscription "$profile_id"
		fi
		if [ ! -f "$file" ]; then
			log "Profile" "Subscription file not found."
			return 1
		fi
	else
		log "Profile" "No profile/subscription selected."
		return 1
	fi
	cp -f "$file" "$RUN_PROFILE_PATH"
}

# merge the settings into the profile for startup
mixin_profile() {
	local mixin_gen expr
	log "Mixin" "Mixin config."
	mixin_gen="$RUN_TMP/mixin.gen.yaml"
	jq -f "$MIXIN_JQ" "$CONFIG_PATH" | "$YQ" -M -p json -o yaml > "$mixin_gen" || return 1
	# the mixin file is all comments until it is edited, then it applies
	# the proxy port of the profile is kept, a profile without one gets 7890
	set -- "$RUN_PROFILE_PATH"
	[ -f "$MIXIN_FILE_PATH" ] && set -- "$@" "$MIXIN_FILE_PATH"
	set -- "$@" "$mixin_gen"
	"$YQ" -M -i eval-all '... comments="" | . as $item ireduce ({}; . * $item ) | .proxies = .nikki-proxies + .proxies | del(.nikki-proxies) | .proxy-groups = .nikki-proxy-groups + .proxy-groups | del(.nikki-proxy-groups) | .rules = .nikki-rules + .rules | del(.nikki-rules) | explode(.) | .mixed-port = (.mixed-port // 7890)' "$@" || return 1
	rm -f "$mixin_gen"

	[ "$c_proxy_enabled" = 1 ] || return 0
	# keenetic has no tun in the transparent proxy, a tun of the profile would change the routes of the router
	expr='.tun.enable = false | .listeners = ((.listeners // []) | map(select(.type != "tun")))'
	# dscp 61 of xkeen: separate listeners that send everything to one proxy, without rules
	expr="$expr | .listeners = (.listeners | map(select(.name != \"exodus-force-redir\" and .name != \"exodus-force-tproxy\")))"
	if [ -n "$c_proxy_dscp_force" ] && [ -n "$c_proxy_force_proxy" ]; then
		if [ "$c_proxy_tcp_mode" = "redirect" ]; then
			expr="$expr | .listeners += [{\"name\": \"exodus-force-redir\", \"type\": \"redir\", \"listen\": \"::\", \"port\": $FORCE_REDIR_PORT, \"proxy\": strenv(EXODUS_FORCE_PROXY)}]"
		fi
		if [ "$c_proxy_udp_mode" = "tproxy" ] || [ "$c_proxy_tcp_mode" = "tproxy" ]; then
			expr="$expr | .listeners += [{\"name\": \"exodus-force-tproxy\", \"type\": \"tproxy\", \"listen\": \"::\", \"port\": $FORCE_TPROXY_PORT, \"udp\": true, \"proxy\": strenv(EXODUS_FORCE_PROXY)}]"
		fi
	fi
	# my.keenetic.net and keendns names must resolve to real addresses, the router answers them itself
	expr="$expr | with(select((.dns.fake-ip-filter-mode // \"blacklist\") == \"blacklist\"); .dns.fake-ip-filter = ((.dns.fake-ip-filter // []) + [\"my.keenetic.net\", \"+.keenetic.pro\", \"+.keenetic.link\", \"+.keenetic.name\", \"+.keenetic.io\", \"my.netcraze.net\", \"+.netcraze.pro\", \"+.netcraze.link\", \"+.netcraze.io\"] | unique))"
	EXODUS_FORCE_PROXY="$c_proxy_force_proxy" "$YQ" -M -i "$expr" "$RUN_PROFILE_PATH"
}

# the profile for startup as json, read by the rules and the web ui
# the api of the core is saved apart, the status of the web ui reads it every few seconds
profile_json() {
	"$YQ" -M -p yaml -o json "$RUN_PROFILE_PATH" > "$PROFILE_JSON_PATH.tmp" 2> /dev/null && mv -f "$PROFILE_JSON_PATH.tmp" "$PROFILE_JSON_PATH"
	jq -c '{listen: (.["external-controller"] // ""), tls_listen: (.["external-controller-tls"] // ""), secret: (.secret // ""), ui_name: (.["external-ui-name"] // "")}' \
		"$PROFILE_JSON_PATH" > "$API_JSON_PATH" 2> /dev/null
}

# ports and dns of the profile for startup as p_* variables
profile_params() {
	eval "$(jq -r '
		def listener(n; t): [(.listeners // [])[] | select(.name == n and .type == t)][0] // {};
		def digits: length > 0 and (explode | all(. >= 48 and . <= 57));
		def port_of(listen): (listen // "" | tostring | split(":") | last // "") | if digits then . else "" end;
		{
			ipv6: (if .ipv6 == false then "0" else "1" end),
			redir_port: (.["redir-port"] // ""),
			tproxy_port: (.["tproxy-port"] // ""),
			dns_port: (if .dns.enable == true then port_of(.dns.listen) else "" end),
			dns_mode: (.dns["enhanced-mode"] // ""),
			fake_ip_range: (.dns["fake-ip-range"] // ""),
			fake_ip6_range: (.dns["fake-ip-range6"] // ""),
			force_redir_port: (listener("exodus-force-redir"; "redir").port // ""),
			force_tproxy_port: (listener("exodus-force-tproxy"; "tproxy").port // "")
		}
		| to_entries[] | "p_\(.key)=\(.value | tostring | @sh)"
	' "$PROFILE_JSON_PATH" 2> /dev/null)"
}

# checks of the profile before start, the same as on openwrt
check_profile() {
	log "Profile" "Checking..."
	if [ "$c_proxy_dns_hijack" = 1 ] && [ -z "$p_dns_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "DNS should be enabled and listen should be defined."
		return 1
	fi
	if [ "$c_proxy_tcp_mode" = "redirect" ] && [ -z "$p_redir_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "Redirect port should be defined."
		return 1
	fi
	if { [ "$c_proxy_tcp_mode" = "tproxy" ] || [ "$c_proxy_udp_mode" = "tproxy" ]; } && [ -z "$p_tproxy_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "TPROXY port should be defined."
		return 1
	fi
	log "Profile" "Check passed."
}

# remove files of http providers of the current profile, they are downloaded again on start
remove_provider_files() {
	local profile_type profile_id profile_file run_dir file path real_path
	profile_type="${c_config_profile%%:*}"
	profile_id="${c_config_profile#*:}"
	profile_file=
	[ "$profile_type" = "file" ] && profile_file="$PROFILES_DIR/$profile_id"
	[ "$profile_type" = "subscription" ] && profile_file="$SUBSCRIPTIONS_DIR/$profile_id.yaml"
	run_dir=$(readlink -f "$RUN_DIR")
	for file in "$RUN_PROFILE_PATH" "$profile_file"; do
		if [ -f "$file" ]; then
			"$YQ" -M '(.proxy-providers // {}, .rule-providers // {}) | .[] | select(.type == "http" and has("path")) | .path' "$file" 2> /dev/null
		fi
	done | while read -r path; do
		case "$path" in
			/*) ;;
			*) path="$RUN_DIR/$path" ;;
		esac
		real_path=$(readlink -f "$path" 2> /dev/null)
		# only inside the run dir, a profile must not be able to remove anything else
		case "$real_path" in
			"$run_dir"/*)
				if [ -f "$real_path" ]; then
					rm -f "$real_path"
					log "Profile" "Remove provider file: ${real_path#"$run_dir"/}."
				fi
				;;
		esac
	done
	# http providers without path are cached by hash in these dirs
	rm -rf "$RUN_DIR/proxies" "$RUN_DIR/rules"
}
