#!/bin/sh
# shellcheck shell=sh disable=SC2034
# Caller sources common.sh. Only files marked page:exodus belong to us.
webui_preflight() {
	local firm build ext firm_raw build_raw ext_raw vendor
	MERLIN_PREFLIGHT_ERROR=
	have nvram || { MERLIN_PREFLIGHT_ERROR='nvram utility is unavailable'; return 1; }
	[ -r "$EXODUS_HELPER" ] || { MERLIN_PREFLIGHT_ERROR="firmware helper is unreadable: $EXODUS_HELPER"; return 1; }
	vendor=$(nvram get '3rd-party')
	[ "$vendor" = merlin ] || { MERLIN_PREFLIGHT_ERROR="firmware is not Merlin (3rd-party=$vendor)"; return 1; }
	nvram get rc_support | grep -qw am_addons || { MERLIN_PREFLIGHT_ERROR='Addons API flag am_addons is missing from rc_support'; return 1; }
	[ -d "$EXODUS_JFFS/addons" ] || { MERLIN_PREFLIGHT_ERROR="JFFS addons directory is missing: $EXODUS_JFFS/addons"; return 1; }
	[ -w "$EXODUS_JFFS/addons" ] || { MERLIN_PREFLIGHT_ERROR="JFFS addons directory is not writable: $EXODUS_JFFS/addons"; return 1; }
	firm_raw=$(nvram get firmver)
	build_raw=$(nvram get buildno)
	ext_raw=$(nvram get extendno)
	firm=$(printf '%s' "$firm_raw" | tr -d '.')
	build=${build_raw%%.*}
	# Keep both preflights in sync: buildno=388/extendno=12_2 or buildno=388.12/extendno=2.
	case "$build_raw" in
		*.*) ext=${build_raw#*.} ;;
		*) ext=$(printf '%s' "$ext_raw" | sed 's/[^0-9].*//') ;;
	esac
	case "$firm:$build:$ext" in
		*[!0-9:]*|:*|*::*|*:) MERLIN_PREFLIGHT_ERROR="invalid firmware version (firmver=$firm_raw, buildno=$build_raw, extendno=$ext_raw)"; return 1 ;;
	esac
	if case "$firm" in
		3004) [ "$build" -gt 384 ] || { [ "$build" -eq 384 ] && [ "$ext" -ge 15 ]; } ;;
		3006) [ "$build" -gt 102 ] || { [ "$build" -eq 102 ] && [ "$ext" -ge 1 ]; } ;;
		*) [ "$firm" -gt 3006 ] ;;
	esac; then return 0; fi
	MERLIN_PREFLIGHT_ERROR="unsupported firmware (firmver=$firm_raw, buildno=$build_raw, extendno=$ext_raw); Merlin 384.15+ or 3006.102.1+ is required"
	return 1
}

webui_owned_page() {
	local file
	for file in "$EXODUS_WWW"/user/user*.asp; do
		[ -f "$file" ] && grep -q 'page:exodus' "$file" && { echo "${file##*/}"; return 0; }
	done
	return 1
}

webui_menu() {
	local page target
	page="$1"
	target="$EXODUS_WWW/require/modules/menuTree.js"
	[ -r "$target" ] || return 1
	awk -v page="$page" '
		/exodus:menu/ { next }
		/index:[[:space:]]*"menu_VPN"/ { vpn=1 }
		/index:/ && !/"menu_VPN"/ { vpn=0 }
		vpn && /url:[[:space:]]*"NULL"/ && page != "" {
			print "    { url: \"" page "\", tabName: \"Exodus\" }, // exodus:menu"; added=1
		}
		{ print }
		END { if(page != "" && !added) exit 1 }
	' "$target" > "$EXODUS_MENU.exodus" || { rm -f "$EXODUS_MENU.exodus"; return 1; }
	mv -f "$EXODUS_MENU.exodus" "$EXODUS_MENU" || return 1
	umount "$target" 2> /dev/null || :
	mount -o bind "$EXODUS_MENU" "$target"
}

webui_mount() (
	local page file
	webui_preflight || { printf 'Exodus native WebUI: %s\n' "$MERLIN_PREFLIGHT_ERROR" >&2; exit 1; }
	[ -r "$SHARE_DIR/www/Exodus.asp" ] || exit 1
	mkdir -p "$WEBUI_DIR" "$WEBUI_ADDON" "$WEBUI_PUBLIC" || exit 1
	# Serialize Exodus registrations; always edit the current shared menu.
	lock_acquire webui || exit 1
	trap 'lock_release webui' EXIT
	page=$(webui_owned_page)
	if [ -z "$page" ]; then
		# shellcheck disable=SC1090
		. "$EXODUS_HELPER"
		am_get_webui_page "$SHARE_DIR/www/Exodus.asp"
		page="$am_webui_page"
	fi
	case "$page" in user[1-9].asp|user1[0-9].asp|user20.asp) ;; *) exit 1 ;; esac
	file="$EXODUS_WWW/user/$page"
	[ ! -e "$file" ] || grep -q 'page:exodus' "$file" || exit 1
	cp "$SHARE_DIR/www/Exodus.asp" "$WEBUI_ADDON/Exodus.asp.new" && mv -f "$WEBUI_ADDON/Exodus.asp.new" "$WEBUI_ADDON/Exodus.asp" || exit 1
	ln -sf "$WEBUI_ADDON/Exodus.asp" "$file" || exit 1
	printf 'Exodus\n' > "$EXODUS_WWW/user/${page%.asp}.title"
	if ! webui_menu "$page"; then
		rm -f "$file" "$EXODUS_WWW/user/${page%.asp}.title"
		exit 1
	fi
	for file in app.js merlin.js i18n.js style.css favicon.svg; do
		[ ! -f "$SHARE_DIR/www/$file" ] || ln -sf "$SHARE_DIR/www/$file" "$WEBUI_PUBLIC/$file" || exit 1
	done
	mkdir -p "$WEBUI_DIR/responses" "$WEBUI_DIR/cache"
	chmod 700 "$WEBUI_DIR"
	ln -sf "$WEBUI_DIR/responses" "$WEBUI_PUBLIC/responses"
	ln -sf "$WEBUI_DIR/cache" "$WEBUI_PUBLIC/cache"
	printf '%s\n' "$page" > "$WEBUI_DIR/page"
	cat > "$WEBUI_ADDON/boot.sh" <<'BOOT'
#!/bin/sh
# Exodus boot recovery: Entware can mount after services-start.
EXODUS="${EXODUS_OPT:-/opt}/share/exodus/exodus"
boot_root="${EXODUS_TMP:-/tmp/exodus}"
case "$1" in
 event) [ -x "$EXODUS" ] && "$EXODUS" web event "$2" "$3"; exit ;;
esac
mkdir -p "$boot_root"
mkdir "$boot_root/webui-boot.lock" 2>/dev/null || exit 0
trap 'rmdir "$boot_root/webui-boot.lock"' EXIT
i=0
while [ "$i" -lt 120 ]; do
 if [ -x "$EXODUS" ]; then "$EXODUS" web start && exit 0; fi
 i=$((i + 1)); sleep 5
done
BOOT
	chmod 755 "$WEBUI_ADDON/boot.sh"
)

webui_unmount() (
	local page
	lock_acquire webui || exit 1
	trap 'lock_release webui' EXIT
	page=$(webui_owned_page)
	if [ -n "$page" ]; then rm -f "$EXODUS_WWW/user/$page" "$EXODUS_WWW/user/${page%.asp}.title"; fi
	[ ! -f "$EXODUS_WWW/require/modules/menuTree.js" ] || webui_menu '' || exit 1
	rm -f "$WEBUI_DIR/page"
	rm -rf "$WEBUI_PUBLIC"
)

webui_status() {
	local page
	page=$(cat "$WEBUI_DIR/page" 2> /dev/null)
	[ -n "$page" ] && [ -r "$EXODUS_WWW/user/$page" ] && grep -q 'page:exodus' "$EXODUS_WWW/user/$page" && grep -q 'exodus:menu' "$EXODUS_WWW/require/modules/menuTree.js"
}

webui_url() {
	local scheme port host page
	page=$(cat "$WEBUI_DIR/page" 2> /dev/null)
	[ -n "$page" ] || return 1
	host=$(nvram get lan_ipaddr)
	case "$(nvram get http_enable)" in
		1|2) scheme=https; port=$(nvram get https_lanport); [ "$port" = 443 ] && port= ;;
		*) scheme=http; port=$(nvram get http_lanport); [ "$port" = 80 ] && port= ;;
	esac
	[ -z "$port" ] || port=":$port"
	printf '%s://%s%s/%s\n' "$scheme" "$host" "$port" "$page"
}

webui_stop_legacy() {
	local pid command owner executable
	pid=$(cat "$WEB_PID_PATH" 2> /dev/null)
	case "$pid" in ''|*[!0-9]*) return 0 ;; esac
	[ -r "$EXODUS_PROC/$pid/cmdline" ] || { rm -f "$WEB_PID_PATH"; return 0; }
	command=$(tr '\000' '\n' < "$EXODUS_PROC/$pid/cmdline")
	owner=$(awk '/^Uid:/ { print $2 }' "$EXODUS_PROC/$pid/status" 2> /dev/null)
	executable=$(readlink -f "$EXODUS_PROC/$pid/exe" 2> /dev/null)
	[ "$owner" = 0 ] && [ "$executable" = "$(readlink -f "$EXODUS_OPT/sbin/lighttpd")" ] || return 0
	printf '%s\n' "$command" | grep -Fxq "$RUN_TMP/lighttpd.conf" || return 0
	printf '%s\n' "$command" | grep -Fxq -- '-f' || return 0
	kill "$pid" 2> /dev/null || :
	rm -f "$WEB_PID_PATH"
}

# PID reuse must not make another process look like our cache worker.
webui_worker_alive() {
	local pid="$1" role="$2" owner current
	case "$pid" in ''|*[!0-9]*) return 1 ;; esac
	[ -r "$EXODUS_PROC/$pid/cmdline" ] || return 1
	owner=$(awk '/^Uid:/ {print $3}' "$EXODUS_PROC/$pid/status" 2>/dev/null)
	current=$(awk '/^Uid:/ {print $3}' "$EXODUS_PROC/$$/status" 2>/dev/null)
	[ -n "$owner" ] && [ "$owner" = "$current" ] || return 1
	grep -q '^State:.*Z' "$EXODUS_PROC/$pid/status" && return 1
	tr '\000' '\n' < "$EXODUS_PROC/$pid/cmdline" | grep -Fxq "$EXODUS" &&
		tr '\000' '\n' < "$EXODUS_PROC/$pid/cmdline" | grep -Fxq "$role" && kill -0 "$pid" 2>/dev/null
}

webui_cache_alive() { webui_worker_alive "$(cat "$WEBUI_DIR/cache.pid" 2>/dev/null)" cache; }

# Only called after validating the root worker. Freeze each parent before
# discovering its children, as with the update worker's network cancellation.
webui_cache_cancel_tree() {
	local pid="$1" child
	kill -STOP "$pid" 2>/dev/null || return 0
	awk -v parent="$pid" '$1 == "Pid:" {pid=$2} $1 == "PPid:" && $2 == parent {print pid}' "$EXODUS_PROC"/[0-9]*/status 2>/dev/null |
	while read -r child; do webui_cache_cancel_tree "$child"; done
	kill -KILL "$pid" 2>/dev/null || :
}

webui_cache_start() (
	lock_acquire webui-cache 10 || exit 1
	trap 'lock_release webui-cache' EXIT
	webui_cache_alive && exit 0
	. "$LIB_DIR/api.sh"
	. "$LIB_DIR/webui-api.sh"
	# Refresh local state after installation/update even if old RAM caches remain.
	webui_cache_views_refresh || exit 1
	webui_cache_refresh || exit 1
	# A separate CLI process owns this loop, independently of proxy stop.
	daemonize /bin/sh -c 'exec "$1" web cache >> "$2" 2>&1' sh "$EXODUS" "$WEB_LOG_PATH"
	# Keep the start lock until the child advertises its PID.
	local i=0
	while [ "$i" -lt 5 ]; do
		webui_cache_alive && exit 0
		i=$((i + 1)); sleep 1
	done
	exit 1
)

webui_cache_stop() {
	local pid file role i dir
	for role in cache updates; do
		if [ "$role" = cache ]; then file="$WEBUI_DIR/cache.pid"; else file="$WEBUI_DIR/update.pid"; fi
		pid=$(cat "$file" 2> /dev/null); i=0
		case "$pid" in ''|*[!0-9]*) continue ;; esac
		if webui_worker_alive "$pid" "$role"; then
			kill "$pid" 2> /dev/null || :
			while kill -0 "$pid" 2> /dev/null && [ "$(cat "$file" 2>/dev/null)" = "$pid" ]; do
				if [ "$i" -ge 60 ]; then
					[ "$role" = cache ] || return 1
					if webui_worker_alive "$pid" cache; then
						log WARN 'WebUI cache did not stop gracefully; cancelling its descendants'
						webui_cache_cancel_tree "$pid"
						# A killed shell cannot release its locks; PID zombies can
						# otherwise keep kill -0 succeeding until init reaps them.
						for dir in "$RUN_TMP"/*.lock; do
							[ "$(cat "$dir/pid" 2>/dev/null)" != "$pid" ] || rm -rf "$dir"
						 done
					fi
					break
				fi
				i=$((i + 1)); msleep 100
			done
		fi
		rm -f "$file"
	done
}
