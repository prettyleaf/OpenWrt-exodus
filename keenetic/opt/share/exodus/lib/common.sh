#!/bin/sh
# shellcheck shell=sh disable=SC2034

# Exodus for Keenetic: paths and helpers shared by the service, the hooks and the web ui
# EXODUS_OPT and EXODUS_TMP move the whole tree, only used for tests

EXODUS_OPT="${EXODUS_OPT:-/opt}"
EXODUS_TMP="${EXODUS_TMP:-/tmp/exodus}"

# entware binaries first, the firmware ones are older or limited
export PATH="$EXODUS_OPT/bin:$EXODUS_OPT/sbin:/sbin:/bin:/usr/sbin:/usr/bin"

REPOSITORY="prettyleaf/openwrt-exodus"
BRANCH="keenetic"

# code, replaced on update
SHARE_DIR="$EXODUS_OPT/share/exodus"
LIB_DIR="$SHARE_DIR/lib"
EXODUS="$SHARE_DIR/exodus"
VERSION_PATH="$SHARE_DIR/VERSION"
MIXIN_JQ="$LIB_DIR/mixin.jq"
LIGHTTPD_CONF="$SHARE_DIR/lighttpd.conf"

# binaries downloaded by the installer
LIBEXEC_DIR="$EXODUS_OPT/libexec/exodus"
PROG="$LIBEXEC_DIR/mihomo"
YQ="$LIBEXEC_DIR/yq"

# settings and profiles, kept on update
HOME_DIR="$EXODUS_OPT/etc/exodus"
CONFIG_PATH="$HOME_DIR/config.json"
AUTH_PATH="$HOME_DIR/web.auth"
PROFILES_DIR="$HOME_DIR/profiles"
SUBSCRIPTIONS_DIR="$HOME_DIR/subscriptions"
MIXIN_FILE_PATH="$HOME_DIR/mixin.yaml"
RUN_DIR="$HOME_DIR/run"
RUN_PROFILE_PATH="$RUN_DIR/config.yaml"
PROVIDERS_DIR="$RUN_DIR/providers"
RULE_PROVIDERS_DIR="$PROVIDERS_DIR/rule"
PROXY_PROVIDERS_DIR="$PROVIDERS_DIR/proxy"

# logs and runtime state live in ram
LOG_DIR="$EXODUS_TMP/log"
APP_LOG_PATH="$LOG_DIR/app.log"
CORE_LOG_PATH="$LOG_DIR/core.log"
UPDATE_LOG_PATH="$LOG_DIR/update.log"
DEBUG_LOG_PATH="$LOG_DIR/debug.log"
WEB_LOG_PATH="$LOG_DIR/web.log"
RUN_TMP="$EXODUS_TMP/run"
SUPERVISOR_PID_PATH="$RUN_TMP/supervisor.pid"
CORE_PID_PATH="$RUN_TMP/core.pid"
WATCH_PID_PATH="$RUN_TMP/watch.pid"
WEB_PID_PATH="$RUN_TMP/web.pid"
STARTED_FLAG_PATH="$RUN_TMP/started.flag"
STOP_FLAG_PATH="$RUN_TMP/stop.flag"
FIREWALL_ENV_PATH="$RUN_TMP/firewall.env"
PROFILE_JSON_PATH="$RUN_TMP/profile.json"
API_JSON_PATH="$RUN_TMP/api.json"
SESSIONS_DIR="$RUN_TMP/sessions"
KEENETIC_VERSION_PATH="$RUN_TMP/keenetic_version.json"

# keenetic rci on localhost, it answers without authorization on keeneticos 4 and 5
RCI_URL="${EXODUS_RCI_URL:-http://127.0.0.1:79/rci}"

# listeners of dscp 61, the mark and the route table of tproxy like in xkeen
# the core marks its own connections with 255 (routing-mark in mixin.jq), the router proxy lets them out
FORCE_REDIR_PORT=7893
FORCE_TPROXY_PORT=7894
TPROXY_MARK=0x111
TPROXY_MASK=0xffffffff
TPROXY_RULE_PREF=100
TPROXY_TABLE=111
CORE_MARK=255

prepare_files() {
	mkdir -p "$LOG_DIR" "$RUN_TMP" "$SESSIONS_DIR" "$PROFILES_DIR" "$SUBSCRIPTIONS_DIR" "$RULE_PROVIDERS_DIR" "$PROXY_PROVIDERS_DIR"
	[ -f "$APP_LOG_PATH" ] || : > "$APP_LOG_PATH"
	[ -f "$CORE_LOG_PATH" ] || : > "$CORE_LOG_PATH"
}

log() {
	echo "[$(date "+%Y-%m-%d %H:%M:%S")] [$1] $2" >> "$APP_LOG_PATH"
}

msleep() {
	usleep "$(($1 * 1000))" 2> /dev/null || sleep 1
}

# mkdir is atomic, a lock left by a killed process is taken over
lock_acquire() {
	local dir attempts pid
	dir="$RUN_TMP/$1.lock"
	attempts="${2:-300}"
	mkdir -p "$RUN_TMP"
	while ! mkdir "$dir" 2> /dev/null; do
		pid=$(cat "$dir/pid" 2> /dev/null)
		if [ -n "$pid" ] && ! kill -0 "$pid" 2> /dev/null; then
			rm -rf "$dir"
			continue
		fi
		attempts=$((attempts - 1))
		[ "$attempts" -le 0 ] && return 1
		msleep 100
	done
	echo "$$" > "$dir/pid"
}

lock_release() {
	rm -rf "$RUN_TMP/$1.lock"
}

# run a command detached from the caller, the web ui must not wait for it
daemonize() {
	if command -v setsid > /dev/null 2>&1; then
		setsid "$@" < /dev/null > /dev/null 2>&1 &
	elif command -v start-stop-daemon > /dev/null 2>&1; then
		local exe; exe="$1"
		shift
		start-stop-daemon -S -b -x "$exe" -- "$@"
	else
		( trap '' HUP; "$@" < /dev/null > /dev/null 2>&1 & )
	fi
}

pid_alive() {
	local pid; pid=$(cat "$1" 2> /dev/null)
	[ -n "$pid" ] && kill -0 "$pid" 2> /dev/null
}

# config is a json file, every section.option is loaded as c_<section>_<option>
# booleans become 1/0, lists of scalars are joined with spaces, null is empty
# jq of entware has no regex (test, sub, capture), names are checked by their characters
cfg_load() {
	eval "$(jq -r '
		def sh:
			if type == "boolean" then (if . then "1" else "0" end)
			elif type == "array" then map(select(type != "object" and type != "array") | tostring) | join(" ")
			elif . == null then ""
			else tostring end;
		def word: explode | all(. == 95 or (. >= 48 and . <= 57) or (. >= 65 and . <= 90) or (. >= 97 and . <= 122));
		paths(type != "object") as $p
		| select(($p | length) == 2 and ($p[0] | type) == "string" and ($p[1] | type) == "string")
		| select(($p[0] + $p[1]) | word)
		| "c_\($p[0])_\($p[1])=\(getpath($p) | sh | @sh)"
	' "$CONFIG_PATH" 2> /dev/null)"
}

# print a value of the config, $1 is a jq path like .proxy.tcp_mode
cfg_get() {
	jq -r "($1) | if . == null then empty elif type == \"array\" then join(\" \") else tostring end" "$CONFIG_PATH" 2> /dev/null
}

# change the config with a jq filter, extra arguments are passed to jq
cfg_update() {
	local filter; filter="$1"
	shift
	lock_acquire config || return 1
	if jq "$@" "$filter" "$CONFIG_PATH" > "$CONFIG_PATH.tmp" 2> /dev/null && [ -s "$CONFIG_PATH.tmp" ]; then
		mv -f "$CONFIG_PATH.tmp" "$CONFIG_PATH"
		lock_release config
		return 0
	fi
	rm -f "$CONFIG_PATH.tmp"
	lock_release config
	return 1
}

app_version() {
	cat "$VERSION_PATH" 2> /dev/null
}

# the core is a big binary, its version is cached until the file changes
core_version() {
	local cache stamp version
	cache="$RUN_TMP/core_version"
	stamp=$(stat -c '%Y.%s' "$PROG" 2> /dev/null)
	if [ -n "$stamp" ] && [ "$(sed -n 1p "$cache" 2> /dev/null)" = "$stamp" ]; then
		sed -n 2p "$cache"
		return
	fi
	version=$("$PROG" -v 2> /dev/null | head -n 1 | cut -d ' ' -f 3)
	if [ -n "$stamp" ] && [ -n "$version" ]; then
		printf '%s\n%s\n' "$stamp" "$version" > "$cache" 2> /dev/null
	fi
	echo "$version"
}

# keenetic rci, the path follows the cli: show/ip/hotspot is "show ip hotspot"
rci_get() {
	curl -s -f -m 5 --connect-timeout 2 "$RCI_URL/$1" 2> /dev/null
}

# "show version" through ndmc, it talks to ndm over a unix socket and works when the rci does not
# the text answer has "key: value" lines, the fields of the header are taken
ndmc_version() {
	command -v ndmc > /dev/null 2>&1 || return 1
	ndmc -c "show version" 2> /dev/null | awk '
		{
			line = $0
			sub(/^[ \t]+/, "", line)
			i = index(line, ": ")
			if (i < 2) next
			key = substr(line, 1, i - 1)
			value = substr(line, i + 2)
			sub(/[ \t\r]+$/, "", value)
			if (key ~ /^(title|release|model|device|hw_id)$/ && !(key in seen) && value != "") {
				seen[key] = 1
				print key "\t" value
			}
		}' | jq -R -s -c 'split("\n") | map(select(length > 0) | split("\t") | {(.[0]): .[1]}) | add // empty'
}

# firmware version and model, cached for the uptime
keenetic_version() {
	local version
	if [ ! -s "$KEENETIC_VERSION_PATH" ]; then
		version=$(rci_get "show/version" | jq -c 'select(type == "object" and (.title // .release // .model) != null)' 2> /dev/null)
		[ -n "$version" ] || version=$(ndmc_version)
		if [ -z "$version" ]; then
			echo '{}'
			return
		fi
		mkdir -p "$RUN_TMP"
		echo "$version" > "$KEENETIC_VERSION_PATH"
	fi
	cat "$KEENETIC_VERSION_PATH"
}

format_filesize() {
	local size; size="$1"
	[ -n "$size" ] || return
	awk -v size="$size" 'BEGIN {
		split("B KB MB GB TB PB", units, " ")
		i = 1
		while (size >= 1024 && i < 6) { size /= 1024; i++ }
		printf "%g %s\n", size, units[i]
	}'
}

# random lowercase hex, $1 is the number of bytes
# busybox od has no -A and -t, so random bytes are hashed into hex instead
random_hex() {
	local chars out
	chars=$(( $1 * 2 ))
	out=
	while [ "${#out}" -lt "$chars" ]; do
		out="$out$(head -c 32 /dev/urandom | sha256sum | cut -d ' ' -f 1)"
	done
	printf '%s' "$out" | cut -c "1-$chars"
}

generate_hwid() {
	# derive from the model and the mac of the first ethernet interface, so reinstall or config reset keeps the same hwid
	local board mac dev
	board=$(keenetic_version | jq -r '.hw_id // .model // empty' 2> /dev/null)
	for dev in /sys/class/net/eth* /sys/class/net/*; do
		[ -e "$dev/address" ] || continue
		case "${dev##*/}" in
			lo|br*|ezcfg*|nwg*|t2s*|tun*|ppp*|sit*|ip6tnl*|dummy*|opkgtun*) continue ;;
		esac
		mac=$(cat "$dev/address" 2> /dev/null)
		[ -n "$mac" ] && [ "$mac" != "00:00:00:00:00:00" ] && break
		mac=
	done
	if [ -n "$mac" ]; then
		printf '%s' "$board$mac" | md5sum | cut -d ' ' -f 1
	else
		tr -d '-' < /proc/sys/kernel/random/uuid
	fi
}

# headers for subscriptions with a hwid device limit (remnawave), one "name: value" per line, the web ui shows them too
# a field the router did not give is not sent at all
hwid_headers() {
	local hwid
	hwid=$(cfg_get .config.hwid)
	[ -n "$hwid" ] || hwid=$(generate_hwid)
	keenetic_version | jq -r --arg hwid "$hwid" '
		["x-hwid", $hwid], ["x-device-os", "KeeneticOS"], ["x-ver-os", (.title // .release // "")], ["x-device-model", (.model // .device // "")]
		| select(.[1] != "") | "\(.[0]): \(.[1])"' 2> /dev/null
}

# check a 5 field cron expression against the current minute
# supports *, lists, ranges and steps, day of month and day of week are or-ed when both are set
cron_match() {
	date '+%M %H %d %m %w' | awk -v expr="$1" '
		function field_match(f, v, lo, hi,   parts, n, i, p, step, a, from, to) {
			n = split(f, parts, ",")
			for (i = 1; i <= n; i++) {
				p = parts[i]
				step = 1
				if (index(p, "/")) {
					split(p, a, "/")
					p = a[1]
					step = a[2] + 0
					if (step < 1) step = 1
				}
				if (p == "*") {
					from = lo; to = hi
				} else if (index(p, "-")) {
					split(p, a, "-")
					from = a[1] + 0; to = a[2] + 0
				} else {
					from = p + 0
					to = (step > 1) ? hi : from
				}
				if (v >= from && v <= to && (v - from) % step == 0) return 1
			}
			return 0
		}
		{
			if (split(expr, f, " ") != 5) exit 1
			time_ok = field_match(f[1], $1 + 0, 0, 59) && field_match(f[2], $2 + 0, 0, 23) && field_match(f[4], $4 + 0, 1, 12)
			dom_ok = field_match(f[3], $3 + 0, 1, 31)
			dow_ok = field_match(f[5], $5 + 0, 0, 7) || ($5 + 0 == 0 && field_match(f[5], 7, 0, 7))
			if (f[3] != "*" && f[5] != "*") day_ok = dom_ok || dow_ok
			else day_ok = dom_ok && dow_ok
			exit !(time_ok && day_ok)
		}'
}

# is a local port listened, $1 tcp or udp, $2 port
port_listening() {
	local hex; hex=$(printf '%04X' "$2")
	# tcp sockets must be in the listen state (0A), udp sockets are unconnected (07)
	case "$1" in
		tcp) cat /proc/net/tcp /proc/net/tcp6 2> /dev/null | awk -v port=":$hex" '$2 ~ port"$" && $4 == "0A" { found = 1 } END { exit !found }' ;;
		udp) cat /proc/net/udp /proc/net/udp6 2> /dev/null | awk -v port=":$hex" '$2 ~ port"$" && $4 == "07" { found = 1 } END { exit !found }' ;;
	esac
}
