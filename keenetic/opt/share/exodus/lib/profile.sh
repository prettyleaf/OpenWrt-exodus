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

update_subscription() {
	local id name info_url url user_agent send_hwid header state
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
		jq -n \
			--arg expire "$([ -n "$expire" ] && date "+%Y-%m-%d %H:%M:%S" -d "@$expire" 2> /dev/null)" \
			--arg upload "$(format_filesize "$upload")" \
			--arg download "$(format_filesize "$download")" \
			--arg total "$(format_filesize "$total")" \
			--arg used "$(format_filesize "$used")" \
			--arg available "$(format_filesize "$available")" \
			--arg update "$(date "+%Y-%m-%d %H:%M:%S")" \
			'{expire: $expire, upload: $upload, download: $download, total: $total, used: $used, available: $available, update: $update, success: true}
			| with_entries(select(.value != ""))' > "$state"
		rm -f "$info_header_tmp" "$header_tmp"
		mv -f "$file_tmp" "$file"
	else
		log "Profile" "Subscription update failed."
		jq -n --arg update "$(date "+%Y-%m-%d %H:%M:%S")" '{update_failed: $update, success: false}' > "$state"
		rm -f "$info_header_tmp" "$header_tmp" "$file_tmp"
		return 1
	fi
}

# copy the chosen profile or subscription to the profile for startup
prepare_profile() {
	local profile_type profile_id file prefer name
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
		prefer=$(sub_get "$profile_id" prefer)
		file="$SUBSCRIPTIONS_DIR/$profile_id.yaml"
		log "Profile" "Use subscription: $name."
		if [ "$prefer" != "local" ] || [ ! -f "$file" ]; then
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
	local expr mixin_gen force_proxy
	log "Mixin" "Mixin config."
	# options with overwrite enabled replace the lists of the profile instead of merging with them
	expr="."
	[ "$c_mixin_authentication" = 1 ] && expr="$expr | del(.authentication)"
	[ "$c_mixin_fake_ip_filter" = 1 ] && expr="$expr | del(.dns.fake-ip-filter)"
	[ "$c_mixin_hosts" = 1 ] && expr="$expr | del(.hosts)"
	[ "$c_mixin_dns_nameserver" = 1 ] && expr="$expr | del(.dns.default-nameserver) | del(.dns.proxy-server-nameserver) | del(.dns.direct-nameserver) | del(.dns.nameserver) | del(.dns.fallback)"
	[ "$c_mixin_dns_proxy_server_nameserver_policy" = 1 ] && expr="$expr | del(.dns.proxy-server-nameserver-policy)"
	[ "$c_mixin_dns_nameserver_policy" = 1 ] && expr="$expr | del(.dns.nameserver-policy)"
	[ "$c_mixin_sniffer_force_domain_name" = 1 ] && expr="$expr | del(.sniffer.force-domain)"
	[ "$c_mixin_sniffer_ignore_domain_name" = 1 ] && expr="$expr | del(.sniffer.skip-domain)"
	[ "$c_mixin_sniffer_sniff" = 1 ] && expr="$expr | del(.sniffer.sniff)"
	if [ "$expr" != "." ]; then
		"$YQ" -M -i "$expr" "$RUN_PROFILE_PATH" || return 1
	fi
	mixin_gen="$RUN_TMP/mixin.gen.yaml"
	jq -f "$MIXIN_JQ" "$CONFIG_PATH" | "$YQ" -M -p json -o yaml > "$mixin_gen" || return 1
	set -- "$RUN_PROFILE_PATH"
	[ "$c_mixin_mixin_file_content" = 1 ] && set -- "$@" "$MIXIN_FILE_PATH"
	set -- "$@" "$mixin_gen"
	"$YQ" -M -i eval-all '... comments="" | . as $item ireduce ({}; . * $item ) | .proxies = .nikki-proxies + .proxies | del(.nikki-proxies) | .proxy-groups = .nikki-proxy-groups + .proxy-groups | del(.nikki-proxy-groups) | .rules = .nikki-rules + .rules | del(.nikki-rules) | explode(.)' "$@" || return 1
	rm -f "$mixin_gen"

	# numbers go into the expression, anything else falls back to the defaults
	local force_redir_port force_tproxy_port router_mark
	force_redir_port="${c_proxy_force_redir_port:-7893}"
	force_tproxy_port="${c_proxy_force_tproxy_port:-7894}"
	router_mark="${c_routing_router_proxy_mark:-255}"
	case "$force_redir_port" in *[!0-9]*) force_redir_port=7893 ;; esac
	case "$force_tproxy_port" in *[!0-9]*) force_tproxy_port=7894 ;; esac
	case "$router_mark" in *[!0-9]*) router_mark=255 ;; esac

	# keenetic has no tun in the transparent proxy, a tun of the profile would change the routes of the router
	expr="."
	if [ "$c_proxy_enabled" = 1 ]; then
		expr="$expr | .tun.enable = false | .listeners = ((.listeners // []) | map(select(.type != \"tun\")))"
		# dscp 61 of xkeen: separate listeners that send everything to one proxy, without rules
		force_proxy="$c_proxy_force_proxy"
		if [ -n "$c_proxy_dscp_force" ] && [ -n "$force_proxy" ]; then
			expr="$expr | .listeners = (.listeners | map(select(.name != \"exodus-force-redir\" and .name != \"exodus-force-tproxy\")))"
			if [ "$c_proxy_tcp_mode" = "redirect" ]; then
				expr="$expr | .listeners += [{\"name\": \"exodus-force-redir\", \"type\": \"redir\", \"listen\": \"::\", \"port\": $force_redir_port, \"proxy\": strenv(EXODUS_FORCE_PROXY)}]"
			fi
			if [ "$c_proxy_udp_mode" = "tproxy" ] || [ "$c_proxy_tcp_mode" = "tproxy" ]; then
				expr="$expr | .listeners += [{\"name\": \"exodus-force-tproxy\", \"type\": \"tproxy\", \"listen\": \"::\", \"port\": $force_tproxy_port, \"udp\": true, \"proxy\": strenv(EXODUS_FORCE_PROXY)}]"
			fi
		fi
		# the core marks its own connections, the router proxy lets them out
		if [ "$c_proxy_router_proxy" = 1 ]; then
			expr="$expr | .routing-mark = $router_mark"
		fi
		# my.keenetic.net and keendns names must resolve to real addresses, the router answers them itself
		if [ "$c_keenetic_fake_ip_filter" = 1 ]; then
			expr="$expr | with(select((.dns.fake-ip-filter-mode // \"blacklist\") == \"blacklist\"); .dns.fake-ip-filter = ((.dns.fake-ip-filter // []) + [\"my.keenetic.net\", \"+.keenetic.pro\", \"+.keenetic.link\", \"+.keenetic.name\", \"+.keenetic.io\", \"my.netcraze.net\", \"+.netcraze.pro\", \"+.netcraze.link\", \"+.netcraze.io\"] | unique))"
		fi
	fi
	if [ "$expr" != "." ]; then
		EXODUS_FORCE_PROXY="$force_proxy" "$YQ" -M -i "$expr" "$RUN_PROFILE_PATH" || return 1
	fi
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
	eval "$(jq -r --arg rl "$c_core_redirect_listener_name" --arg tl "$c_core_tproxy_listener_name" '
		def listener(n; t): [(.listeners // [])[] | select(.name == n and .type == t)][0] // {};
		def port_of(listen): (listen // "" | tostring) as $l | if ($l | test(":[0-9]+$")) then ($l | sub("^.*:"; "")) else "" end;
		{
			redir_port: (.["redir-port"] // listener($rl; "redir").port // ""),
			tproxy_port: (.["tproxy-port"] // listener($tl; "tproxy").port // ""),
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
	if { [ "$c_proxy_ipv4_dns_hijack" = 1 ] || [ "$c_proxy_ipv6_dns_hijack" = 1 ]; } && [ -z "$p_dns_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "DNS should be enabled and listen should be defined."
		return 1
	fi
	if [ "$c_proxy_tcp_mode" = "redirect" ] && [ -z "$p_redir_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "Redirect Port/Listener should be defined."
		return 1
	fi
	if { [ "$c_proxy_tcp_mode" = "tproxy" ] || [ "$c_proxy_udp_mode" = "tproxy" ]; } && [ -z "$p_tproxy_port" ]; then
		log "Profile" "Check failed."
		log "Profile" "TPROXY Port/Listener should be defined."
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
