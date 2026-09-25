#!/bin/sh

# backend of the web ui: POST json {"action": "...", ...}, answers json
# a session cookie is required for everything except login, the X-Exodus header keeps other sites out

# lighttpd runs cgi with a clean environment, the tree is found from the path of the script
case "$SCRIPT_FILENAME" in
	*/share/exodus/www/api.cgi) [ -n "$EXODUS_OPT" ] || EXODUS_OPT="${SCRIPT_FILENAME%/share/exodus/www/api.cgi}" ;;
esac

. "${EXODUS_OPT:-/opt}/share/exodus/lib/common.sh"

SESSION_TTL=43200
cookie=

reply() {
	printf 'Status: %s\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n' "$1"
	[ -n "$cookie" ] && printf 'Set-Cookie: %s; Path=/; HttpOnly; SameSite=Strict\r\n' "$cookie"
	printf '\r\n'
	cat
}

ok() {
	reply "200 OK"
}

fail() {
	jq -n --arg error "$2" '{error: $error}' | reply "$1"
	cleanup
	exit 0
}

cleanup() {
	rm -f "$req"
}

# field of the request as raw text
arg() {
	jq -j --arg key "$1" '.[$key] // "" | tostring' "$req"
}

session_token() {
	echo "$HTTP_COOKIE" | tr ';' '\n' | sed -n 's/^ *exodus_session=\([0-9a-f]\{32\}\) *$/\1/p' | head -n 1
}

session_valid() {
	local token expires now
	token=$(session_token)
	[ -n "$token" ] && [ -f "$SESSIONS_DIR/$token" ] || return 1
	expires=$(cat "$SESSIONS_DIR/$token" 2> /dev/null)
	now=$(date +%s)
	if [ -z "$expires" ] || [ "$expires" -lt "$now" ] 2> /dev/null; then
		rm -f "$SESSIONS_DIR/$token"
		return 1
	fi
	echo "$((now + SESSION_TTL))" > "$SESSIONS_DIR/$token"
}

password_valid() {
	local stored salt hash
	stored=$(cat "$AUTH_PATH" 2> /dev/null)
	[ -n "$stored" ] || return 1
	salt="${stored%%:*}"
	hash="${stored#*:}"
	[ "$( { printf '%s' "$salt"; jq -j ".$1 // \"\"" "$req"; } | sha256sum | cut -d ' ' -f 1)" = "$hash" ]
}

# files the editor may read and write: profiles, subscriptions, providers, the mixin file and the profile for startup
allowed_path() {
	local path dir real
	path="$1"
	case "$path" in
		""|*..*|*//*) return 1 ;;
		"$MIXIN_FILE_PATH"|"$RUN_PROFILE_PATH") ;;
		"$PROFILES_DIR"/*|"$RULE_PROVIDERS_DIR"/*|"$PROXY_PROVIDERS_DIR"/*|"$SUBSCRIPTIONS_DIR"/*.yaml)
			dir="${path%/*}"
			case "$dir" in
				"$PROFILES_DIR"|"$RULE_PROVIDERS_DIR"|"$PROXY_PROVIDERS_DIR"|"$SUBSCRIPTIONS_DIR") ;;
				*) return 1 ;;
			esac
			;;
		*) return 1 ;;
	esac
	# a symlink must not lead outside of the home dir
	if [ -e "$path" ]; then
		real=$(readlink -f "$path")
		case "$real" in
			"$(readlink -f "$HOME_DIR")"/*) ;;
			*) return 1 ;;
		esac
	fi
	return 0
}

valid_name() {
	echo "$1" | grep -q -E '^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$'
}

# the profile for startup as json, converted by the service on start
profile_value() {
	jq -r "$1 // empty" "$PROFILE_JSON_PATH" 2> /dev/null
}

file_list() {
	local dir
	dir="$1"
	[ -d "$dir" ] || { echo '[]'; return; }
	find "$dir" -maxdepth 1 -type f ! -name '.*' 2> /dev/null | while read -r path; do
		printf '%s\t%s\n' "${path##*/}" "$(wc -c < "$path")"
	done | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {name: .[0], size: (.[1] | tonumber)}) | sort_by(.name)'
}

action_status() {
	local running started api
	running=false
	pid_alive "$SUPERVISOR_PID_PATH" && running=true
	started=false
	[ -f "$STARTED_FLAG_PATH" ] && started=true
	api=$(cat "$API_JSON_PATH" 2> /dev/null)
	[ -n "$api" ] || api='{}'
	jq -n \
		--argjson running "$running" \
		--argjson started "$started" \
		--arg app "$(app_version)" \
		--arg core "$(core_version)" \
		--arg core_type "$(cfg_get .update.core)" \
		--argjson api "$api" \
		--argjson hijack "$([ -f "$FIREWALL_ENV_PATH" ] && echo true || echo false)" \
		'{running: $running, started: $started, app_version: $app, core_version: $core, core_type: $core_type, hijack: $hijack, api: $api}' | ok
}

action_load() {
	local states file name
	states=$(for file in "$SUBSCRIPTIONS_DIR"/*.json; do
		[ -f "$file" ] || continue
		name="${file##*/}"
		jq -c --arg id "${name%.json}" '{($id): .}' "$file" 2> /dev/null
	done | jq -s 'add // {}')
	jq -n \
		--slurpfile config "$CONFIG_PATH" \
		--argjson states "$states" \
		--argjson profiles "$(file_list "$PROFILES_DIR")" \
		'{config: $config[0], subscription_states: $states, profiles: $profiles}' | ok
}

# the whole config is replaced by the one of the web ui, it keeps the keys it does not know
action_config_set() {
	local tmp apply old_port new_port
	tmp="$CONFIG_PATH.web"
	if ! jq -e '(.config | type == "object") and (.config.config | type == "object") and (.config.proxy | type == "object") and (.config.mixin | type == "object")' "$req" > /dev/null 2>&1; then
		fail "400 Bad Request" "invalid config"
	fi
	old_port=$(cfg_get .web.port)
	lock_acquire config || fail "503 Service Unavailable" "config is locked"
	if jq '.config' "$req" > "$tmp" && [ -s "$tmp" ]; then
		mv -f "$tmp" "$CONFIG_PATH"
	else
		rm -f "$tmp"
		lock_release config
		fail "500 Internal Server Error" "failed to save the config"
	fi
	lock_release config
	apply=$(arg apply)
	case "$apply" in
		restart) daemonize "$EXODUS" restart ;;
	esac
	new_port=$(cfg_get .web.port)
	[ "$old_port" != "$new_port" ] && daemonize "$EXODUS" web restart
	echo '{"success": true}' | ok
}

action_service() {
	case "$(arg op)" in
		start) daemonize "$EXODUS" start ;;
		stop) daemonize "$EXODUS" stop ;;
		restart) daemonize "$EXODUS" restart ;;
		hard_update) daemonize "$EXODUS" hard_update ;;
		sync) daemonize "$EXODUS" sync ;;
		*) fail "400 Bad Request" "unknown operation" ;;
	esac
	echo '{"success": true}' | ok
}

action_subscription_update() {
	local id
	id=$(arg id)
	echo "$id" | grep -q -E '^[A-Za-z0-9_-]+$' || fail "400 Bad Request" "invalid subscription"
	daemonize "$EXODUS" update_subscription "$id"
	echo '{"success": true}' | ok
}

# segments, wi-fi points and devices for the device selection
# rci gives names, wi-fi points and parental control; without it only the neighbours of the router are shown
# no regex in jq: jq of entware is built without oniguruma, test() and sub() fail there
action_hosts() {
	local dir file iface
	dir="$RUN_TMP/hosts.$$"
	mkdir -p "$dir"
	rci_get "show/ip/hotspot" > "$dir/hotspot.json"
	rci_get "show/interface" > "$dir/interface.json"
	rci_get "show/associations" > "$dir/associations.json"
	for file in "$dir"/*.json; do
		jq -e . "$file" > /dev/null 2>&1 || echo 'null' > "$file"
	done
	ip -4 neigh show 2> /dev/null | awk '{ for (i = 1; i <= NF; i++) { if ($i == "dev") dev = $(i + 1); if ($i == "lladdr") mac = $(i + 1) } if (mac != "") print $1 "\t" dev "\t" mac; mac = "" }' \
		| jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {ip: .[0], dev: .[1], mac: (.[2] | ascii_upcase)})' > "$dir/neigh.json"
	for iface in /sys/class/net/br*; do
		[ -e "$iface" ] || continue
		iface="${iface##*/}"
		printf '%s\t%s\n' "$iface" "$(ip -o -4 addr show dev "$iface" 2> /dev/null | awk '{ print $4; exit }')"
	done | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {ifname: .[0], address: .[1]})' > "$dir/segments.json"
	jq -n \
		--slurpfile hotspot "$dir/hotspot.json" \
		--slurpfile interface "$dir/interface.json" \
		--slurpfile associations "$dir/associations.json" \
		--slurpfile neigh "$dir/neigh.json" \
		--slurpfile segments "$dir/segments.json" '
		def list: if type == "array" then . elif type == "object" then [.] else [] end;
		def pick(k): if type == "object" and has(k) then .[k] else . end;
		def digits: length > 0 and (explode | all(. >= 48 and . <= 57));
		def bridge: startswith("Bridge") and (ltrimstr("Bridge") | digits);
		def access_point: startswith("WifiMaster") and (index("/AccessPoint") != null);
		($interface[0] // {}) as $if
		| (if ($if | type) == "object" then [$if | to_entries[] | select(.value | type == "object") | .value + {id: (.value.id // .key)}]
		   elif ($if | type) == "array" then $if else [] end) as $ifaces
		| ($hotspot[0] | pick("host") | list) as $hosts
		| ($associations[0] | pick("station") | list) as $stations
		| ([$ifaces[] | select((.id // "") | bridge)]) as $bridges
		| ($segments[0] + [$bridges[] | ("br" + (.id | ltrimstr("Bridge"))) as $ifname
			| select($segments[0] | map(.ifname) | index($ifname) | not) | {ifname: $ifname, address: (.address // "")}]
		  | map(
			. as $s
			| ($s.ifname | ltrimstr("br")) as $n
			| ([$ifaces[] | select(.id == ("Bridge" + $n))][0] // {}) as $b
			| $s + {name: ($b.description // $b["interface-name"] // ""), id: ($b.id // "")}
		  ) | sort_by(.ifname)) as $segs
		| ([$ifaces[] | select((.id // "") | access_point)
			| {id, ssid: (.ssid // ""), description: (.description // ""), state: (.state // .link // ""),
			   segment: (.group // ((.usedby // []) | if type == "array" then .[0] else . end) // "")}]) as $points
		| ([$hosts[] | select((.ap // "") != "") | {id: .ap, ssid: (.ssid // ""), description: "", state: "", segment: ""}]
			| map(select(.id as $id | $points | map(.id) | index($id) | not)) | unique_by(.id)) as $extra
		| {
			rci: (($hotspot[0] != null) or ($interface[0] != null)),
			segments: $segs,
			aps: (($points + $extra) | map(. + {
				band: (if (.id | startswith("WifiMaster1/")) then "5 GHz" elif (.id | startswith("WifiMaster2/")) then "6 GHz" else "2.4 GHz" end),
				clients: ((.id) as $id | [$stations[] | select(.ap == $id)] | length)
			}) | sort_by(.id)),
			hosts: (
				[$hosts[] | select((.mac // "") != "") | {
					mac: (.mac | ascii_upcase),
					ip: (.ip // ""),
					name: (.name // .hostname // ""),
					hostname: (.hostname // ""),
					active: (if .active == null then (.link == "up") else .active end),
					ap: (.ap // ""),
					ssid: (.ssid // ""),
					segment: (.interface | if type == "object" then (.id // .name // "") else (. // "") end),
					access: (.access // "")
				}] as $known
				| $known + [$neigh[0][] | select(.mac as $m | $known | map(.mac) | index($m) | not)
					| {mac, ip, name: "", hostname: "", active: true, ap: "", ssid: "", segment: .dev, access: ""}]
				| unique_by(.mac)
			)
		}' | ok
	rm -rf "$dir"
}

action_interfaces() {
	ip -o link show 2> /dev/null | awk -F ': ' '{ split($2, a, "@"); print a[1] }' | grep -v -E '^(lo|ip6tnl0|sit0|gre0|gretap0|ifb[0-9]+|teql0|dummy[0-9]*)$' \
		| jq -R -s '{interfaces: (split("\n") | map(select(length > 0)))}' | ok
}

action_proxies() {
	local names
	names=$(jq -c '[(.["proxy-groups"] // [])[].name] + [(.proxies // [])[].name] | map(select(. != null))' "$PROFILE_JSON_PATH" 2> /dev/null)
	jq -n --argjson names "${names:-[]}" '{proxies: $names}' | ok
}

action_profile_upload() {
	local name
	name=$(arg name)
	valid_name "$name" || fail "400 Bad Request" "invalid file name"
	mkdir -p "$PROFILES_DIR"
	jq -j '.content // ""' "$req" > "$PROFILES_DIR/$name.tmp" && mv -f "$PROFILES_DIR/$name.tmp" "$PROFILES_DIR/$name"
	echo '{"success": true}' | ok
}

action_profile_delete() {
	local name
	name=$(arg name)
	valid_name "$name" || fail "400 Bad Request" "invalid file name"
	rm -f "$PROFILES_DIR/$name"
	echo '{"success": true}' | ok
}

action_files() {
	jq -n \
		--argjson profiles "$(file_list "$PROFILES_DIR")" \
		--argjson subscriptions "$(file_list "$SUBSCRIPTIONS_DIR" | jq 'map(select(.name | endswith(".yaml")))')" \
		--argjson rule_providers "$(file_list "$RULE_PROVIDERS_DIR")" \
		--argjson proxy_providers "$(file_list "$PROXY_PROVIDERS_DIR")" \
		--arg profiles_dir "$PROFILES_DIR" \
		--arg subscriptions_dir "$SUBSCRIPTIONS_DIR" \
		--arg rule_providers_dir "$RULE_PROVIDERS_DIR" \
		--arg proxy_providers_dir "$PROXY_PROVIDERS_DIR" \
		--arg mixin "$MIXIN_FILE_PATH" \
		--arg run_profile "$RUN_PROFILE_PATH" \
		'{profiles: $profiles, subscriptions: $subscriptions, rule_providers: $rule_providers, proxy_providers: $proxy_providers,
		  dirs: {profiles: $profiles_dir, subscriptions: $subscriptions_dir, rule_providers: $rule_providers_dir, proxy_providers: $proxy_providers_dir},
		  mixin: $mixin, run_profile: $run_profile}' | ok
}

action_file_read() {
	local path
	path=$(arg path)
	allowed_path "$path" || fail "403 Forbidden" "path is not allowed"
	if [ -f "$path" ]; then
		jq -n --rawfile content "$path" '{content: $content}' | ok
	else
		echo '{"content": ""}' | ok
	fi
}

action_file_write() {
	local path
	path=$(arg path)
	allowed_path "$path" || fail "403 Forbidden" "path is not allowed"
	jq -j '.content // ""' "$req" > "$path.tmp" && mv -f "$path.tmp" "$path"
	echo '{"success": true}' | ok
}

log_path() {
	case "$1" in
		app) echo "$APP_LOG_PATH" ;;
		core) echo "$CORE_LOG_PATH" ;;
		update) echo "$UPDATE_LOG_PATH" ;;
		web) echo "$WEB_LOG_PATH" ;;
		debug) echo "$DEBUG_LOG_PATH" ;;
	esac
}

action_log_read() {
	local path
	path=$(log_path "$(arg name)")
	[ -n "$path" ] || fail "400 Bad Request" "unknown log"
	if [ -f "$path" ]; then
		tail -c 1048576 "$path" | jq -R -s '{content: .}' | ok
	else
		echo '{"content": ""}' | ok
	fi
}

action_log_clear() {
	local path
	path=$(log_path "$(arg name)")
	[ -n "$path" ] || fail "400 Bad Request" "unknown log"
	: > "$path"
	echo '{"success": true}' | ok
}

action_debug() {
	"$EXODUS" debug > "$DEBUG_LOG_PATH" 2>&1
	jq -n --rawfile content "$DEBUG_LOG_PATH" '{content: $content}' | ok
}

# the hwid and the headers sent with it, the web ui shows what the subscriptions get
action_hwid() {
	hwid_headers | jq -R -s --arg generated "$(generate_hwid)" '
		{headers: (split("\n") | map(select(index(": ") != null) | index(": ") as $i | {(.[:$i]): .[$i + 2:]}) | add // {}), generated: $generated}' | ok
}

gh_url() {
	local proxy
	proxy=$(cfg_get .update.gh_proxy)
	proxy="${proxy%/}"
	case "$proxy" in
		http://*|https://*) echo "$proxy/$1" ;;
		*) echo "$1" ;;
	esac
}

# architecture of entware, the builds of the core and yq follow it
entware_arch() {
	opkg print-architecture 2> /dev/null | awk '$2 != "all" && $2 != "noarch" { arch = $2 } END { print arch }'
}

# latest versions are asked from github at most every 6 hours, force asks now; failed checks are not kept
action_check_update() {
	local latest core_type core_latest release free core_size proxy_host cache cached now
	core_type=$(cfg_get .update.core)
	case "$core_type" in
		alpha) release="https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha" ;;
		prizrak) release="https://github.com/legiz-ru/Prizrak-Core/releases/latest/download" ;;
		*) core_type=meta; release="https://github.com/MetaCubeX/mihomo/releases/latest/download" ;;
	esac
	cache="$RUN_TMP/update_check.json"
	now=$(date +%s)
	cached=
	if [ "$(arg force)" != "true" ]; then
		cached=$(jq -r --arg core "$core_type" --argjson now "$now" \
			'select(.core_type == $core and ($now - .time) < 21600 and ($now - .time) >= 0) | "\(.app_latest)\t\(.core_latest)"' "$cache" 2> /dev/null)
	fi
	if [ -n "$cached" ]; then
		latest="${cached%%	*}"
		core_latest="${cached#*	}"
	else
		latest=$(curl -s -f -L -m 20 "$(gh_url "https://raw.githubusercontent.com/$REPOSITORY/$BRANCH/keenetic/opt/share/exodus/VERSION")" 2> /dev/null | head -n 1 | tr -d '\r')
		echo "$latest" | grep -q -E '^[A-Za-z0-9._-]+$' || latest=
		core_latest=$(curl -s -f -L -m 20 "$(gh_url "$release/version.txt")" 2> /dev/null | head -n 1 | tr -d '\r')
		echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$' || core_latest=
		if [ -n "$latest" ] && [ -n "$core_latest" ]; then
			jq -n --argjson time "$now" --arg core "$core_type" --arg app "$latest" --arg core_latest "$core_latest" \
				'{time: $time, core_type: $core, app_latest: $app, core_latest: $core_latest}' > "$cache" 2> /dev/null
		fi
	fi
	free=$(df -k "$EXODUS_OPT" 2> /dev/null | tail -n 1 | awk '{ print $(NF - 2) }')
	core_size=$(wc -c < "$PROG" 2> /dev/null)
	proxy_host=$(cfg_get .update.gh_proxy | sed -n 's|^[a-z]*://\([^/]*\).*|\1|p')
	jq -n \
		--arg app "$(app_version)" \
		--arg app_latest "$latest" \
		--arg core_type "$core_type" \
		--arg core "$(core_version)" \
		--arg core_latest "$core_latest" \
		--arg arch "$(entware_arch)" \
		--arg free "$free" \
		--arg core_size "$core_size" \
		--arg gh_proxy "$proxy_host" \
		'{app: $app, app_latest: (if $app_latest == "" then null else $app_latest end), core_type: $core_type, core: $core,
		  core_latest: (if $core_latest == "" then null else $core_latest end), arch: $arch,
		  free_space: (if $free == "" then null else ($free | tonumber * 1024) end),
		  core_size: (if $core_size == "" then null else ($core_size | tonumber) end),
		  gh_proxy: (if $gh_proxy == "" then null else $gh_proxy end)}' | ok
}

# build info of the web ui: version, branch and commit of the install, the core and the router
action_about() {
	local build
	build=$(cat "$BUILD_PATH" 2> /dev/null)
	echo "$build" | jq -e 'type == "object"' > /dev/null 2>&1 || build='{}'
	jq -n \
		--argjson build "$build" \
		--argjson router "$(keenetic_version)" \
		--arg app "$(app_version)" \
		--arg branch "$BRANCH" \
		--arg repository "$REPOSITORY" \
		--arg installed "$(date -r "$VERSION_PATH" '+%Y-%m-%d %H:%M:%S' 2> /dev/null)" \
		--arg core "$(core_version)" \
		--arg core_type "$(cfg_get .update.core)" \
		--arg arch "$(entware_arch)" \
		'{app: $app, ref: ($build.ref // $branch), commit: ($build.commit // ""), installed: ($build.installed // $installed),
		  repository: $repository, core: $core, core_type: (if $core_type == "" then "meta" else $core_type end),
		  model: ($router.model // $router.device // ""), firmware: ($router.title // $router.release // ""), arch: $arch}' | ok
}

action_update() {
	local low_space
	low_space=0
	[ "$(arg low_space)" = "true" ] && low_space=1
	cp -f "$SHARE_DIR/install.sh" "$RUN_TMP/exodus-update.sh" || fail "500 Internal Server Error" "installer not found"
	: > "$UPDATE_LOG_PATH"
	export LOW_SPACE="$low_space"
	daemonize sh -c "exec sh '$RUN_TMP/exodus-update.sh' >> '$UPDATE_LOG_PATH' 2>&1"
	echo '{"success": true}' | ok
}

action_update_dashboard() {
	local listen tls secret url
	listen=$(profile_value '.["external-controller"]')
	tls=$(profile_value '.["external-controller-tls"]')
	secret=$(profile_value '.secret')
	if [ -n "$tls" ]; then
		url="https://127.0.0.1:${tls##*:}/upgrade/ui"
	elif [ -n "$listen" ]; then
		url="http://127.0.0.1:${listen##*:}/upgrade/ui"
	else
		fail "400 Bad Request" "API has not been configured"
	fi
	printf 'header = "Authorization: Bearer %s"\n' "$secret" | curl -s -k -m 120 -X POST -K - "$url" > /dev/null 2>&1
	echo '{"success": true}' | ok
}

action_password() {
	local salt
	password_valid old || { sleep 2; fail "403 Forbidden" "wrong password"; }
	[ "$(jq -r '.new // "" | length' "$req")" -ge 4 ] || fail "400 Bad Request" "the password is too short"
	salt=$(random_hex 8)
	umask 077
	echo "$salt:$( { printf '%s' "$salt"; jq -j '.new' "$req"; } | sha256sum | cut -d ' ' -f 1)" > "$AUTH_PATH"
	# other sessions end, this one stays
	token=$(session_token)
	find "$SESSIONS_DIR" -type f ! -name "$token" -exec rm -f {} + 2> /dev/null
	echo '{"success": true}' | ok
}

[ "$REQUEST_METHOD" = "POST" ] || { echo '{"error": "method not allowed"}' | reply "405 Method Not Allowed"; exit 0; }
[ "$HTTP_X_EXODUS" = "1" ] || { echo '{"error": "forbidden"}' | reply "403 Forbidden"; exit 0; }

mkdir -p "$SESSIONS_DIR" "$LOG_DIR"
req="$RUN_TMP/request.$$"
trap cleanup EXIT
head -c "${CONTENT_LENGTH:-0}" > "$req"
jq -e 'type == "object"' "$req" > /dev/null 2>&1 || fail "400 Bad Request" "invalid request"
action=$(arg action)

case "$action" in
	login)
		[ -f "$AUTH_PATH" ] || fail "403 Forbidden" "no password is set, run exodus passwd on the router"
		if ! password_valid password; then
			sleep 2
			fail "403 Forbidden" "wrong password"
		fi
		token=$(random_hex 16)
		echo "$(($(date +%s) + SESSION_TTL))" > "$SESSIONS_DIR/$token"
		cookie="exodus_session=$token"
		echo '{"success": true}' | ok
		exit 0
		;;
esac

session_valid || fail "401 Unauthorized" "unauthorized"

case "$action" in
	logout)
		token=$(session_token)
		rm -f "$SESSIONS_DIR/$token"
		cookie="exodus_session=; Max-Age=0"
		echo '{"success": true}' | ok
		;;
	status) action_status ;;
	load) action_load ;;
	config_set) action_config_set ;;
	service) action_service ;;
	subscription_update) action_subscription_update ;;
	hosts) action_hosts ;;
	interfaces) action_interfaces ;;
	proxies) action_proxies ;;
	profile_upload) action_profile_upload ;;
	profile_delete) action_profile_delete ;;
	files) action_files ;;
	file_read) action_file_read ;;
	file_write) action_file_write ;;
	log_read) action_log_read ;;
	log_clear) action_log_clear ;;
	debug) action_debug ;;
	hwid) action_hwid ;;
	check_update) action_check_update ;;
	about) action_about ;;
	update) action_update ;;
	update_dashboard) action_update_dashboard ;;
	password) action_password ;;
	*) fail "400 Bad Request" "unknown action" ;;
esac
