#!/bin/sh

# Native Exodus for Asuswrt-Merlin uninstaller
# Works both from the fork's raw URL piped into sh and as a saved local file.
# KEEP_CONFIG=1 keeps /opt/etc/exodus (settings, profiles and subscriptions)
# packages of entware (curl, jq, lighttpd) are kept, other applications may use them

EXODUS_OPT="${EXODUS_OPT:-/opt}"
EXODUS_JFFS="${EXODUS_JFFS:-/jffs}"
EXODUS_WWW="${EXODUS_WWW:-/www}"
EXODUS_TMP="${EXODUS_TMP:-/tmp/exodus}"
EXODUS_MENU="${EXODUS_MENU:-/tmp/menuTree.js}"
export PATH="$EXODUS_OPT/bin:$EXODUS_OPT/sbin:/sbin:/bin:/usr/sbin:/usr/bin"

# Standalone entrypoint, including when piped into sh. Keep logs ANSI-free.
ui_reset='' ui_bold='' ui_accent='' ui_info='' ui_ok='' ui_warn='' ui_error='' ui_muted=''
if [ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && [ "${NO_COLOR+set}" != set ]; then
	ui_reset='\033[0m'; ui_bold='\033[1m'; ui_accent='\033[96m'
	ui_info='\033[96m'; ui_ok='\033[92m'; ui_warn='\033[93m'; ui_error='\033[91m'; ui_muted='\033[90m'
fi
info() { printf '  %b[INFO]%b %s\n' "$ui_info" "$ui_reset" "$1"; }
done_message() { printf '  %b[ OK ]%b %s\n' "$ui_ok" "$ui_reset" "$1"; }
step() { printf '\n%b%s  %s%b\n' "$ui_bold$ui_accent" "$1" "$2" "$ui_reset"; }
fail() {
	[ -z "$ui_error" ] || printf '  %b[FAIL]%b %s\n' "$ui_error" "$ui_reset" "$1"
	echo "error: $1"; exit 1
}
printf '\n%bExodus%b  /  Remove\n' "$ui_bold$ui_accent" "$ui_reset"
printf '%bAsuswrt-Merlin + Entware%b\n\n' "$ui_muted" "$ui_reset"
if [ "$KEEP_CONFIG" = 1 ]; then
	info 'Settings, profiles and subscriptions will be kept.'
else
	printf '  %b[WARN]%b Settings, profiles and subscriptions will be removed.\n' "$ui_warn" "$ui_reset"
fi
info 'Shared Entware packages are kept for other applications.'
case "$EXODUS_TMP" in /*/exodus) ;; *) fail "EXODUS_TMP must be an absolute Exodus directory" ;; esac
# Merlin does not necessarily provide id. Compare effective UIDs from procfs.
current_uid=$(awk '/^Uid:/ {print $3}' "/proc/$$/status" 2>/dev/null)
case "$current_uid" in ''|*[!0-9]*) fail "can not determine process owner from /proc; installation kept" ;; esac
install_lock="$EXODUS_OPT/tmp/exodus-install.lock"
mkdir -p "$EXODUS_OPT/tmp" || fail "can not create lock storage"
mkdir "$install_lock" 2>/dev/null || fail "another installation or removal owns $install_lock; resolve stale locks before retrying"
trap 'rm -f "$install_lock/pid"; rmdir "$install_lock"' EXIT
trap 'fail "removal interrupted"' HUP INT TERM
echo "$$" > "$install_lock/pid" || fail "can not write removal lock"
[ ! -d "$EXODUS_TMP/run" ] || touch "$EXODUS_TMP/run/stop.flag" || fail "can not prevent core respawn"
step '1/4' 'Stop Exodus processes'

# Do not rely on the installed CLI or a PID alone during emergency cleanup.
proc_root="${EXODUS_PROC:-/proc}"
owned_process() {
 local pid="$1" role="$2" cmd owner exe
 [ -r "$proc_root/$pid/cmdline" ] || return 1
 owner=$(awk '/^Uid:/ {print $3}' "$proc_root/$pid/status" 2>/dev/null)
 [ "$owner" = "$current_uid" ] || return 1
 cmd=$(tr '\000' '\n' < "$proc_root/$pid/cmdline")
 if [ "$role" = core ]; then
  exe=$(readlink "$proc_root/$pid/exe" 2>/dev/null)
  exe=${exe% (deleted)}
  # /opt commonly points into the USB mount; /proc reports its physical path.
  case "$exe" in "$(readlink -f "$EXODUS_OPT/libexec/exodus/mihomo")"|"$(readlink -f "$EXODUS_OPT/tmp/exodus-install/backup/mihomo")") ;; *) return 1 ;; esac
  printf '%s\n' "$cmd" | grep -Fxq "$EXODUS_OPT/etc/exodus/run" && printf '%s\n' "$cmd" | grep -Fxq -- '-d'
 elif [ "$role" = legacy ]; then
  [ "$(readlink -f "$proc_root/$pid/exe" 2>/dev/null)" = "$(readlink -f "$EXODUS_OPT/sbin/lighttpd" 2>/dev/null)" ] || return 1
  printf '%s\n' "$cmd" | grep -Fxq "$EXODUS_TMP/run/lighttpd.conf" && printf '%s\n' "$cmd" | grep -Fxq -- '-f'
 else
  printf '%s\n' "$cmd" | grep -Fxq "$EXODUS_OPT/share/exodus/exodus" && printf '%s\n' "$cmd" | grep -Fxq "$role"
 fi
}
stop_owned() {
 local file="$1" role="$2" pid attempt=0
 pid=$(cat "$file" 2>/dev/null)
 case "$pid" in ''|*[!0-9]*) rm -f "$file"; return ;; esac
 if owned_process "$pid" "$role"; then
  info "Stopping $role..."
  kill "$pid" 2>/dev/null || :
  while owned_process "$pid" "$role"; do
   [ "$attempt" -lt 12 ] || fail "$role did not stop; installation kept"
   attempt=$((attempt + 1)); sleep 1
  done
 fi
 # Clear stale foreign PIDs before the old CLI can use them without verification.
 rm -f "$file" || fail "can not clear $role PID"
}
stop_owned "$EXODUS_TMP/run/webui/cache.pid" cache
stop_owned "$EXODUS_TMP/run/webui/update.pid" updates
stop_owned "$EXODUS_TMP/run/watch.pid" watch
stop_owned "$EXODUS_TMP/run/core.pid" core
stop_owned "$EXODUS_TMP/run/supervisor.pid" supervise
stop_owned "$EXODUS_TMP/run/web.pid" legacy

# stop the proxy first, it removes the rules and the routes
if [ -x "$EXODUS_OPT/share/exodus/exodus" ]; then
	"$EXODUS_OPT/share/exodus/exodus" stop
	"$EXODUS_OPT/share/exodus/exodus" web stop
fi
done_message 'Exodus processes stopped.'
step '2/4' 'Clean firewall rules and routes'

# the rules once more, also when the stop failed or exodus is broken: rules without the core cut the internet of the network
# the same as fw_clean in lib/firewall.sh, with the iptables and ipset of the firmware
for name in iptables ip6tables; do
	ipt="/usr/sbin/$name"
	[ -x "$ipt" ] || ipt="/sbin/$name"
	[ -x "$ipt" ] || continue
	for table in nat mangle filter; do
		rules=$("$ipt-save" -t "$table" 2> /dev/null) || continue
		echo "$rules" | grep -E '^-A (PREROUTING|INPUT|OUTPUT) .*-j EXODUS_[A-Z_]+ *$' | sed 's/^-A //' | while read -r rule; do
			# shellcheck disable=SC2086
			"$ipt" -t "$table" -D $rule > /dev/null 2>&1
		done
		chains=$(echo "$rules" | grep -o -E '^:EXODUS_[A-Z_]+' | tr -d ':')
		for chain in $chains; do
			"$ipt" -t "$table" -F "$chain" > /dev/null 2>&1
		done
		for chain in $chains; do
			"$ipt" -t "$table" -X "$chain" > /dev/null 2>&1
		done
	done
done
for family in 4 6; do
	while ip -"$family" rule del table 7892 > /dev/null 2>&1; do :; done
	ip -"$family" route flush table 7892 > /dev/null 2>&1
done
ipset="/usr/sbin/ipset"
[ -x "$ipset" ] || ipset=ipset
for set in exodus_mac exodus_src4 exodus_src6 exodus_rsv4 exodus_rsv6 exodus_local4 exodus_local6; do
	"$ipset" destroy "$set" > /dev/null 2>&1
	"$ipset" destroy "${set}_new" > /dev/null 2>&1
done
info 'Firewall and route cleanup attempted for Exodus entries.'
step '3/4' 'Remove WebUI and startup hooks'

# Marker-based cleanup also works when the installed CLI is broken.
for page in "$EXODUS_WWW"/user/user*.asp; do
	if [ ! -f "$page" ] || ! grep -q 'page:exodus' "$page"; then continue; fi
	rm -f "$page" "${page%.asp}.title" || fail "can not remove owned WebUI page"
done
menu_target="$EXODUS_WWW/require/modules/menuTree.js"
if [ -f "$menu_target" ] && grep -q 'exodus:menu' "$menu_target"; then
	sed '/exodus:menu/d' "$menu_target" > "$EXODUS_MENU.exodus" || fail "can not prepare menu cleanup; installation kept"
	mv -f "$EXODUS_MENU.exodus" "$EXODUS_MENU" || fail "can not save menu cleanup; installation kept"
	umount "$EXODUS_WWW/require/modules/menuTree.js" 2> /dev/null || :
	mount -o bind "$EXODUS_MENU" "$EXODUS_WWW/require/modules/menuTree.js" || fail "can not publish menu cleanup; installation kept"
fi
settings="$EXODUS_JFFS/addons/custom_settings.txt"
if [ -f "$settings" ] && grep -q '^exodus_packet ' "$settings"; then
	sed '/^exodus_packet /d' "$settings" > "$settings.exodus" || fail "can not clean addon settings; installation kept"
	mv -f "$settings.exodus" "$settings" || fail "can not save addon settings; installation kept"
fi
rm -rf "$EXODUS_WWW/user/exodus" "$EXODUS_JFFS/addons/exodus" || fail "can not remove native registration; installation kept"

# the lines of exodus in the user scripts, the lines of other addons are kept
for name in firewall-start nat-start unmount services-start service-event; do
	file="$EXODUS_JFFS/scripts/$name"
	[ -f "$file" ] || continue
	sed '/# exodus$/d' "$file" > "$file.new" || fail "can not clean $name hook; installation kept"
	mv -f "$file.new" "$file" || fail "can not save $name hook; installation kept"
	chmod 755 "$file" || fail "can not set $name hook permissions; installation kept"
done
done_message 'Exodus WebUI and hooks removed.'
step '4/4' 'Remove application files'

rm -f "$EXODUS_OPT/etc/init.d/S99exodus" "$EXODUS_OPT/bin/exodus" || fail "can not remove startup files"
rm -rf "$EXODUS_OPT/share/exodus" "$EXODUS_OPT/share/exodus.old" "$EXODUS_OPT/share/exodus.new" "$EXODUS_OPT/libexec/exodus" "$EXODUS_TMP" || fail "can not remove runtime files"
if [ "$KEEP_CONFIG" != 1 ]; then
	rm -rf "$EXODUS_OPT/etc/exodus" || fail "can not remove configuration files"
else
	done_message "Configuration kept in $EXODUS_OPT/etc/exodus"
fi

done_message 'Removal complete.'
echo "success"
