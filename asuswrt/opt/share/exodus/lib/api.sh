#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2030,SC2031
# req is set in api_run's subshell; every action is called within that scope.
# Operations independent of HTTP. Caller sources common.sh first.
arg() { jq -j --arg key "$1" '.[$key] // "" | tostring' "$req"; }

api_run() (
	req="$1"
	response="$2"
	umask 077
	reply() { jq -c --argjson status "${1%% *}" '{status: $status, data: .}' > "$response.tmp" && mv -f "$response.tmp" "$response"; }
	ok() { reply "200 OK"; }
	fail() { jq -n --arg error "$2" '{error: $error}' | reply "$1"; exit $?; }
	jq -e 'type == "object"' "$req" > /dev/null 2>&1 || fail "400 Bad Request" "invalid request"
	action=$(arg action)
	case "$action" in
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
	*) fail "400 Bad Request" "unknown action" ;;
	esac
)

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
	# Resolve the parent even when the destination does not exist.
	real=$(readlink -f "${path%/*}") || return 1
	case "$real/" in
		"$(readlink -f "$HOME_DIR")"/*) ;;
		*) return 1 ;;
	esac
	[ ! -L "$path" ] || return 1
	[ ! -L "$path.tmp" ] || return 1
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
	local tmp apply
	tmp="$CONFIG_PATH.web"
	if ! jq -e '(.config | type == "object") and (.config.config | type == "object") and (.config.proxy | type == "object") and (.config.mixin | type == "object")' "$req" > /dev/null 2>&1; then
		fail "400 Bad Request" "invalid config"
	fi
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

# segments, wi-fi networks and devices for the device selection
# names come from the client list of the router (custom_clientlist), dhcp and its network map, wi-fi clients from the drivers,
# parental control from nvram; without nvram only the neighbours of the router are shown
# no regex in jq: jq of entware is built without oniguruma, test() and sub() fail there
action_hosts() {
	local dir iface id ifname file
	dir="$RUN_TMP/hosts.$$"
	mkdir -p "$dir"
	if have nvram; then
		nvram show 2> /dev/null | grep -E '^(wl[0-9](\.[0-9])?_(ssid|nband|radio)|custom_clientlist|MULTIFILTER_(ALL|ENABLE|MAC)|lan_ifname)=' \
			| jq -R -s 'split("\n") | map(select(length > 0) | index("=") as $i | {(.[:$i]): .[$i + 1:]}) | add // {}' > "$dir/nvram.json"
	fi
	wifi_networks > "$dir/wifi.txt"
	while read -r id ifname; do
		wifi_stations "$ifname" | sed "s/^/$id /"
	done < "$dir/wifi.txt" > "$dir/stations.txt"
	jq -R -s 'split("\n") | map(select(length > 0) | split(" ") | {id: .[0], ifname: .[1]})' "$dir/wifi.txt" > "$dir/wifi.json"
	jq -R -s 'split("\n") | map(select(length > 0) | split(" ") | {ap: .[0], mac: .[1]})' "$dir/stations.txt" > "$dir/stations.json"
	awk 'length($2) == 17 && NF >= 4 { print $2 "\t" $3 "\t" ($4 == "*" ? "" : $4) }' /var/lib/misc/dnsmasq.leases 2> /dev/null \
		| jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {mac: (.[0] | ascii_upcase), ip: .[1], hostname: .[2]})' > "$dir/leases.json"
	ip -4 neigh show 2> /dev/null | awk '{ for (i = 1; i <= NF; i++) { if ($i == "dev") dev = $(i + 1); if ($i == "lladdr") mac = $(i + 1) } if (mac != "") print $1 "\t" dev "\t" mac; mac = "" }' \
		| jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {ip: .[0], dev: .[1], mac: (.[2] | ascii_upcase)})' > "$dir/neigh.json"
	# the network map of the firmware keeps the devices it has seen, with names and addresses
	jq -c '[if type == "object" then .[] else empty end | select(type == "object" and ((.mac // "") | length) == 17)
		| {mac: (.mac | ascii_upcase), name: ((.nickName // .name // "") | tostring), ip: ((.ip // "") | tostring)}]' /jffs/nmp_cl_json.js > "$dir/nmp.json" 2> /dev/null
	for iface in /sys/class/net/br*; do
		[ -e "$iface" ] || continue
		iface="${iface##*/}"
		printf '%s\t%s\n' "$iface" "$(ip -o -4 addr show dev "$iface" 2> /dev/null | awk '{ print $4; exit }')"
	done | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {ifname: .[0], address: .[1]})' > "$dir/segments.json"
	for file in "$dir"/*.json; do
		jq -e . "$file" > /dev/null 2>&1 || echo 'null' > "$file"
	done
	[ -f "$dir/nvram.json" ] || echo 'null' > "$dir/nvram.json"
	jq -n \
		--slurpfile nvram "$dir/nvram.json" \
		--slurpfile wifi "$dir/wifi.json" \
		--slurpfile stations "$dir/stations.json" \
		--slurpfile leases "$dir/leases.json" \
		--slurpfile neigh "$dir/neigh.json" \
		--slurpfile nmp "$dir/nmp.json" \
		--slurpfile segments "$dir/segments.json" '
		def list: if type == "array" then . else [] end;
		def mac: type == "string" and length == 17;
		($nvram[0] | if type == "object" then . else {} end) as $nv
		| ($nv.lan_ifname // "br0") as $lan
		| ($wifi[0] | list) as $nets
		| ($stations[0] | list | map(select(.mac | mac))) as $stations
		| ($leases[0] | list | map(select(.mac | mac))) as $leases
		| ($neigh[0] | list | map(select(.mac | mac))) as $neigh
		| ($nmp[0] | list) as $nmp
		# the client list of the router: <name>MAC>...<name>MAC>...
		| (($nv.custom_clientlist // "") | split("<") | map(split(">") | select(length >= 2 and (.[1] | mac) and .[0] != "")
			| {key: (.[1] | ascii_upcase), value: .[0]}) | from_entries) as $names
		# parental control: MULTIFILTER_ENABLE is 1 for time scheduling and 2 for blocked devices
		| (if ($nv.MULTIFILTER_ALL // "0") == "1" then
			[(($nv.MULTIFILTER_MAC // "") | split(">")), (($nv.MULTIFILTER_ENABLE // "") | split(">"))] | transpose
			| map(select(.[0] | mac) | {key: (.[0] | ascii_upcase), value: (if .[1] == "2" then "deny" elif .[1] == "1" then "schedule" else "" end)})
			| from_entries
		   else {} end) as $parental
		| ([$stations[] | {key: .mac, value: .ap}] | from_entries) as $assoc
		| {
			router: ($nvram[0] != null),
			segments: ($segments[0] | list | map(. + {name: (if .ifname == $lan then "LAN" else "" end), id: ""}) | sort_by(.ifname)),
			aps: [$nets[] | .id as $id | ($id | split(".")[0]) as $radio | {
				id: $id,
				ssid: ($nv[$id + "_ssid"] // ""),
				description: "",
				state: (if ($id | index(".")) == null and ($nv[$id + "_radio"] // "1") == "0" then "down" else "up" end),
				segment: $lan,
				guest: (($id | index(".")) != null),
				band: (($nv[$radio + "_nband"] // "") | if . == "1" then "5 GHz" elif . == "2" then "2.4 GHz" elif . == "4" then "6 GHz" else "" end),
				clients: ([$stations[] | select(.ap == $id)] | length)
			}] | sort_by(.id),
			hosts: (
				([$leases[].mac] + [$neigh[].mac] + [$stations[].mac] + ($names | keys) + [$nmp[].mac] | unique)
				| map(. as $mac
					| ([$leases[] | select(.mac == $mac)][0] // {}) as $lease
					| ([$neigh[] | select(.mac == $mac)][0] // {}) as $n
					| ([$nmp[] | select(.mac == $mac)][0] // {}) as $m
					| ($assoc[$mac] // "") as $ap
					| {
						mac: $mac,
						ip: ($n.ip // $lease.ip // (if ($m.ip // "") != "" then $m.ip else null end) // ""),
						name: ($names[$mac] // (if ($m.name // "") != "" then $m.name else null end) // ""),
						hostname: ($lease.hostname // ""),
						active: (($n.mac != null) or ($ap != "")),
						ap: $ap,
						ssid: (if $ap == "" then "" else ($nv[$ap + "_ssid"] // "") end),
						segment: ($n.dev // $lan),
						access: ($parental[$mac] // "")
					})
			)
		}' | ok
	rm -rf "$dir"
}

action_interfaces() {
	ip -o link show 2> /dev/null | awk -F ': ' '{ split($2, a, "@"); print a[1] }' \
		| grep -v -E '^(lo|ip6tnl0|sit0|gre0|gretap0|erspan0|ip6gre0|ifb[0-9]+|imq[0-9]+|teql0|dummy[0-9]*|bcmsw.*|dpsta|spu_.*|blog)$' \
		| jq -R -s '{interfaces: (split("\n") | map(select(length > 0)))}' | ok
}

# groups and proxies of the running profile for the choices of the web ui, groups hidden in the profile are left out
action_proxies() {
	local list
	list=$(jq -c '{
		groups: [(.["proxy-groups"] // [])[] | select(.hidden != true) | .name | select(type == "string")],
		proxies: [(.proxies // [])[] | .name | select(type == "string")]
	}' "$PROFILE_JSON_PATH" 2> /dev/null)
	[ -n "$list" ] || list='{"groups": [], "proxies": []}'
	printf '%s\n' "$list" | ok
}

action_profile_upload() {
	local name
	name=$(arg name)
	valid_name "$name" || fail "400 Bad Request" "invalid file name"
	mkdir -p "$PROFILES_DIR"
	allowed_path "$PROFILES_DIR/$name" || fail "403 Forbidden" "path is not allowed"
	if ! jq -j '.content // ""' "$req" > "$PROFILES_DIR/$name.tmp" || ! mv -f "$PROFILES_DIR/$name.tmp" "$PROFILES_DIR/$name"; then
		fail "500 Internal Server Error" "failed to save file"
	fi
	echo '{"success": true}' | ok
}

action_profile_delete() {
	local name
	name=$(arg name)
	valid_name "$name" || fail "400 Bad Request" "invalid file name"
	allowed_path "$PROFILES_DIR/$name" || fail "403 Forbidden" "path is not allowed"
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
	if ! jq -j '.content // ""' "$req" > "$path.tmp" || ! mv -f "$path.tmp" "$path"; then
		fail "500 Internal Server Error" "failed to save file"
	fi
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

# the latest code of the installed branch: its archive is small, the hash of the code tells an update from a change of the readme
# prints "version|commit|hash", nothing when github does not answer
latest_code() {
	local dir src
	dir="$RUN_TMP/latest.$$"
	rm -rf "$dir"
	mkdir -p "$dir/src"
	if curl -s -f -L --connect-timeout 15 -m 60 -o "$dir/app.tar.gz" "$(gh_url "https://github.com/${2:-$REPOSITORY}/archive/$1.tar.gz")" \
		&& tar -xzf "$dir/app.tar.gz" -C "$dir/src" 2> /dev/null; then
		src=$(find "$dir/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)
		if [ -n "$src" ] && [ -f "$src/asuswrt/opt/share/exodus/VERSION" ]; then
			printf '%s|%s|%s' "$(head -n 1 "$src/asuswrt/opt/share/exodus/VERSION" | tr -d '\r|')" "$(archive_commit "$dir/app.tar.gz")" "$(code_hash "$src")"
		fi
	fi
	rm -rf "$dir"
}

# there is no versioning of the branch: exodus is up to date when its code equals the code of the branch
# github is asked at most every 6 hours, force asks now; failed checks are not kept
action_check_update() {
	local core_type release build repository ref cache now latest app core_latest free core_size proxy_host
	core_type=$(cfg_get .update.core)
	case "$core_type" in
		alpha) release="https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha" ;;
		prizrak) release="https://github.com/legiz-ru/Prizrak-Core/releases/latest/download" ;;
		*) core_type=meta; release="https://github.com/MetaCubeX/mihomo/releases/latest/download" ;;
	esac
	build=$(cat "$BUILD_PATH" 2> /dev/null)
	printf '%s' "$build" | jq -e 'type == "object"' > /dev/null 2>&1 || build='{}'
	repository=$(printf '%s' "$build" | jq -r '.repository // empty')
	[ -n "$repository" ] || repository="$REPOSITORY"
	ref=$(printf '%s' "$build" | jq -r '.ref // empty')
	[ -n "$ref" ] || ref="$BRANCH"
	cache="$RUN_TMP/update_check.json"
	now=$(date +%s)
	latest=
	if [ "$(arg force)" != "true" ]; then
		latest=$(jq -c --arg core "$core_type" --arg repository "$repository" --arg ref "$ref" --argjson now "$now" \
			'select(.core_type == $core and .repository == $repository and .ref == $ref and ($now - .time) < 21600 and ($now - .time) >= 0)' "$cache" 2> /dev/null)
	fi
	if [ -z "$latest" ] && [ "$(arg cached)" != "true" ]; then
		app=$(latest_code "$ref" "$repository")
		core_latest=$(curl -s -f -L -m 20 "$(gh_url "$release/version.txt")" 2> /dev/null | head -n 1 | tr -d '\r')
		echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$' || core_latest=
		latest=$(printf '%s' "$app" | jq -R -s -c --argjson time "$now" --arg core "$core_type" --arg repository "$repository" --arg ref "$ref" --arg core_latest "$core_latest" '
			split("|") as $a
			| {time: $time, core_type: $core, repository: $repository, ref: $ref, app_latest: ($a[0] // ""), app_latest_commit: ($a[1] // ""), app_latest_code: ($a[2] // ""), core_latest: $core_latest}')
		if [ -n "$app" ] && [ -n "$core_latest" ]; then
			printf '%s\n' "$latest" > "$cache"
		fi
	fi
	[ -n "$latest" ] || latest='{}'
	free=$(df -k "$EXODUS_OPT" 2> /dev/null | tail -n 1 | awk '{ print $(NF - 2) }')
	core_size=$(wc -c < "$PROG" 2> /dev/null)
	proxy_host=$(cfg_get .update.gh_proxy | sed -n 's|^[a-z]*://\([^/]*\).*|\1|p')
	jq -n \
		--argjson latest "$latest" \
		--argjson build "$build" \
		--arg app "$(app_version)" \
		--arg core_type "$core_type" \
		--arg core "$(core_version)" \
		--arg arch "$(entware_arch)" \
		--arg free "$free" \
		--arg core_size "$core_size" \
		--arg gh_proxy "$proxy_host" \
		'def text: if . == null or . == "" then null else . end;
		{app: $app, app_commit: ($build.commit | text), app_latest: ($latest.app_latest | text), app_latest_commit: ($latest.app_latest_commit | text),
		  app_update: (
			if ($latest.app_latest_code // "") == "" then null
			elif ($build.code // "") != "" then $build.code != $latest.app_latest_code
			elif ($build.commit // "") != "" and ($latest.app_latest_commit // "") != "" then $build.commit != $latest.app_latest_commit
			else true end),
		  core_type: $core_type, core: $core, core_latest: ($latest.core_latest | text), arch: $arch,
		  free_space: (if $free == "" then null else ($free | tonumber * 1024) end),
		  core_size: (if $core_size == "" then null else ($core_size | tonumber) end),
		  gh_proxy: (if $gh_proxy == "" then null else $gh_proxy end)}' | ok
}

# build info of the web ui: version, branch and commit of the install, the core and the router
action_about() {
	local build
	build=$(cat "$BUILD_PATH" 2> /dev/null)
	printf '%s' "$build" | jq -e 'type == "object"' > /dev/null 2>&1 || build='{}'
	jq -n \
		--argjson build "$build" \
		--argjson router "$(router_info)" \
		--arg app "$(app_version)" \
		--arg branch "$BRANCH" \
		--arg repository "$REPOSITORY" \
		--arg installed "$(date -r "$VERSION_PATH" '+%Y-%m-%d %H:%M:%S' 2> /dev/null)" \
		--arg core "$(core_version)" \
		--arg core_type "$(cfg_get .update.core)" \
		--arg arch "$(entware_arch)" \
		'{app: $app, ref: ($build.ref // $branch), commit: ($build.commit // ""), installed: ($build.installed // $installed),
		  repository: ($build.repository // $repository), core: $core, core_type: (if $core_type == "" then "meta" else $core_type end),
		  model: ($router.model // ""), os: ($router.os // ""), firmware: ($router.firmware // ""), arch: $arch}' | ok
}

action_update() {
	local low_space build repository ref
	low_space=0
	[ "$(arg low_space)" = "true" ] && low_space=1
	build=$(cat "$BUILD_PATH" 2> /dev/null)
	repository=$(printf '%s' "$build" | jq -r '.repository // empty' 2> /dev/null)
	[ -n "$repository" ] || repository="$REPOSITORY"
	ref=$(printf '%s' "$build" | jq -r '.ref // empty' 2> /dev/null)
	[ -n "$ref" ] || ref="$BRANCH"
	cp -f "$SHARE_DIR/install.sh" "$RUN_TMP/exodus-update.sh" || fail "500 Internal Server Error" "installer not found"
	: > "$UPDATE_LOG_PATH"
	export LOW_SPACE="$low_space" REPOSITORY="$repository" REF="$ref"
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
