#!/bin/sh

# Exodus for Asuswrt-Merlin installer and updater
# installs into entware: the service, the web ui, the mihomo core and yq, settings and profiles are kept
# adds a line to the user scripts firewall-start, nat-start and unmount in /jffs/scripts, other lines there are kept
# REF=<branch|tag>  install another version, the asuswrt branch by default
# REPOSITORY=<owner/repo> download application files from this fork
# LOW_SPACE=1       remove the current core before installing the new one, for routers with little free space
# CORE=<core>       install this core without asking: meta (stable), alpha (Mihomo Alpha) or prizrak (Prizrak-Core)
# ALLOW_RUNNING_MIHOMO=1 confirm a conflicting Mihomo without a terminal (automation only)
# GH_PROXY=<url>    download from GitHub through gh-proxy (https://github.com/prettyleaf/gh-proxy), e.g. https://example.com/ghproxy/TOKEN, empty to download directly
# SOURCE_DIR=<dir>  install application files from a local source tree; dependencies still need internet
# the core and GH_PROXY are saved in $EXODUS_OPT/etc/exodus/config.json, the next runs and the update page use them

repository="${REPOSITORY:-prettyleaf/openwrt-exodus}"
ref="${REF:-asuswrt}"

EXODUS_OPT="${EXODUS_OPT:-/opt}"
EXODUS_JFFS="${EXODUS_JFFS:-/jffs}"
EXODUS_HELPER="${EXODUS_HELPER:-/usr/sbin/helper.sh}"
export EXODUS_OPT EXODUS_JFFS EXODUS_HELPER
export PATH="$EXODUS_OPT/bin:$EXODUS_OPT/sbin:/sbin:/bin:/usr/sbin:/usr/bin"

# the busybox of asuswrt-merlin has no command builtin: a program is looked up in PATH by hand
have() {
	local dir IFS
	case "$1" in
		*/*) [ -x "$1" ] && [ ! -d "$1" ]; return ;;
	esac
	IFS=:
	for dir in $PATH; do
		[ -n "$dir" ] && [ -x "$dir/$1" ] && [ ! -d "$dir/$1" ] && return 0
	done
	return 1
}

# Keep this entrypoint self-contained: it is also downloaded directly into sh.
# Logs and the updater stay plain; terminal output follows the Exodus palette.
ui_reset='' ui_bold='' ui_accent='' ui_info='' ui_ok='' ui_warn='' ui_error='' ui_muted=''
if [ -t 1 ] && [ "${TERM:-dumb}" != dumb ] && [ "${NO_COLOR+set}" != set ]; then
	ui_reset='\033[0m'; ui_bold='\033[1m'; ui_accent='\033[96m'
	ui_info='\033[96m'; ui_ok='\033[92m'; ui_warn='\033[93m'; ui_error='\033[91m'; ui_muted='\033[90m'
fi
info() { printf '  %b[INFO]%b %s\n' "$ui_info" "$ui_reset" "$1"; }
warn() { printf '  %b[WARN]%b %s\n' "$ui_warn" "$ui_reset" "$1"; }
done_message() { printf '  %b[ OK ]%b %s\n' "$ui_ok" "$ui_reset" "$1"; }
step() { printf '\n%b%s  %s%b\n' "$ui_bold$ui_accent" "$1" "$2" "$ui_reset"; }
banner() {
	printf '\n%bExodus%b  /  %s\n' "$ui_bold$ui_accent" "$ui_reset" "$1"
	printf '%bAsuswrt-Merlin + Entware%b\n\n' "$ui_muted" "$ui_reset"
}

share_dir="$EXODUS_OPT/share/exodus"
libexec_dir="$EXODUS_OPT/libexec/exodus"
home_dir="$EXODUS_OPT/etc/exodus"
config="$home_dir/config.json"
core_path="$libexec_dir/mihomo"
yq_path="$libexec_dir/yq"

# The update page recognizes the final completion message or an "error:" line.
fail() {
	rollback
	[ -z "$ui_error" ] || printf '  %b[FAIL]%b %s\n' "$ui_error" "$ui_reset" "$1"
	echo "error: $1${rollback_failed:+; recovery files kept in $temp_dir}${core_lost:+; previous core unavailable in LOW_SPACE mode}"
	exit 1
}

# Keep the old code and byte-for-byte settings until native registration succeeds.
rollback() {
 [ "$migration_pending" = 1 ] || return 0
 migration_pending=0
 if [ -x "$share_dir/exodus" ]; then
  [ "$service_attempted" != 1 ] || "$share_dir/exodus" stop > /dev/null 2>&1
  "$share_dir/exodus" web stop > /dev/null 2>&1 || :
 fi
 if [ "$code_changed" = 1 ]; then
  if rm -rf "$share_dir"; then
   [ ! -d "$share_dir.old" ] || mv "$share_dir.old" "$share_dir" || rollback_failed=1
  else rollback_failed=1; fi
 fi
 for name in mihomo yq; do
  if [ -e "$temp_dir/backup/$name" ] || [ -L "$temp_dir/backup/$name" ]; then
   mv -f "$temp_dir/backup/$name" "$libexec_dir/$name" || rollback_failed=1
  elif [ -f "$temp_dir/backup/$name.absent" ]; then rm -f "$libexec_dir/$name" || rollback_failed=1; fi
 done
 for name in config.json mixin.yaml; do
  if [ -f "$temp_dir/backup/$name" ]; then cp -p "$temp_dir/backup/$name" "$home_dir/$name" || rollback_failed=1;
  elif [ -f "$temp_dir/backup/$name.absent" ]; then rm -f "$home_dir/$name" || rollback_failed=1; fi
 done
 for name in firewall-start nat-start unmount services-start service-event; do
  if [ -f "$temp_dir/backup/$name" ]; then cp -p "$temp_dir/backup/$name" "$EXODUS_JFFS/scripts/$name" || rollback_failed=1;
  else rm -f "$EXODUS_JFFS/scripts/$name" || rollback_failed=1; fi
 done
 rm -rf "$EXODUS_JFFS/addons/exodus" || rollback_failed=1
 [ ! -d "$temp_dir/backup/addon" ] || cp -Rp "$temp_dir/backup/addon" "$EXODUS_JFFS/addons/exodus" || rollback_failed=1
 if [ -f "$temp_dir/backup/S99exodus" ]; then cp -p "$temp_dir/backup/S99exodus" "$EXODUS_OPT/etc/init.d/S99exodus" || rollback_failed=1;
 else rm -f "$EXODUS_OPT/etc/init.d/S99exodus" || rollback_failed=1; fi
 [ ! -f "$temp_dir/backup/home.absent" ] || rm -rf "$home_dir" || rollback_failed=1
 if [ -x "$share_dir/exodus" ]; then
  ln -sf "$share_dir/exodus" "$EXODUS_OPT/bin/exodus" || rollback_failed=1
  [ "$was_web_running" != 1 ] || "$share_dir/exodus" web start > /dev/null 2>&1 || rollback_failed=1
  if [ "$service_attempted" = 1 ] && [ "$was_running" = 1 ]; then
   "$share_dir/exodus" restart > /dev/null 2>&1 || rollback_failed=1
  fi
 else
  rm -f "$EXODUS_OPT/bin/exodus" || rollback_failed=1
 fi
 if [ -n "$rollback_failed" ]; then warn "Rollback incomplete; recovery files: $temp_dir";
 else done_message 'Previous Exodus code and settings restored.'; fi
}

# Rename on Entware's filesystem retains the old inode without another full copy.
backup_binary() {
 local name="$1"
 if [ -e "$libexec_dir/$name" ] || [ -L "$libexec_dir/$name" ]; then
  mv "$libexec_dir/$name" "$temp_dir/backup/$name" || fail "can not preserve previous $name"
 else touch "$temp_dir/backup/$name.absent" || fail "can not stage $name backup"; fi
}

# the installer is usually piped into the shell, so questions are asked on the terminal
# there is no terminal when it runs from the update page, then nothing is asked
interactive() {
	( exec < /dev/tty ) 2> /dev/null
}

ask() {
	printf '\n%b%s%b' "$ui_bold" "$1" "$ui_reset" > /dev/tty
	answer=
	read -r answer < /dev/tty
}

confirm_mihomo() {
	warn 'Another Mihomo is running and may intercept the same traffic.'
	info 'Stop the other addon and disable its autostart to avoid routing conflicts.'
	if [ "$ALLOW_RUNNING_MIHOMO" = 1 ]; then
		warn 'Continuing with explicit ALLOW_RUNNING_MIHOMO=1 confirmation.'
		return
	fi
	interactive || fail 'another Mihomo is running; stop it or set ALLOW_RUNNING_MIHOMO=1 to confirm installation without a terminal'
	while :; do
		ask 'Continue installation? / Продолжить установку? [y/N, Да/Нет]: ' || fail 'installation cancelled before dependency checks'
		case "$answer" in
			y|Y|yes|Yes|YES|д|Д|да|Да|ДА) done_message 'Installation confirmed.'; return ;;
			''|n|N|no|No|NO|н|Н|нет|Нет|НЕТ) info 'Installation cancelled. No dependencies were checked or downloaded.'; fail 'installation cancelled before dependency checks' ;;
			*) warn 'Enter Yes / Да to continue or No / Нет to cancel. Enter cancels.' ;;
		esac
	done
}

# github url, through gh-proxy if it is used
gh_url() {
	echo "${gh_proxy:+$gh_proxy/}$1"
}

download() {
	curl -s -f -L --connect-timeout 15 -m "${3:-600}" -o "$2" "$(gh_url "$1")"
}

# fetch the version file of the branch to check access to github
# returns 0 on success, 22 if github answered with an error (a wrong ref or token), other codes if it is unreachable
check_github() {
	local version ret
	version=$(curl -s -f -L --connect-timeout 15 -m 30 "$(gh_url "$version_url")" 2> /dev/null)
	ret=$?
	# a wrong gh-proxy address may answer with some web page
	if [ "$ret" = 0 ] && ! echo "$version" | head -n 1 | grep -q -E '^[0-9][0-9.]+$'; then
		ret=1
	fi
	return "$ret"
}

# hash of the code in a source tree, the update page compares it with the latest one: a change of the readme is not an update
# the same as code_hash in lib/common.sh
code_hash() {
	(cd "$1" && find asuswrt install.sh uninstall.sh -type f 2> /dev/null | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done 2> /dev/null) | sha256sum | cut -d ' ' -f 1
}

# github writes the commit into the pax header of an archive of a branch, the same as archive_commit in lib/common.sh
archive_commit() {
	gzip -dc "$1" 2> /dev/null | head -c 1024 | tr -d '\000' | sed -n 's/.*comment=\([0-9a-f]\{40\}\).*/\1/p' | head -n 1
}

# version of the core binary, e.g. v1.19.31 or alpha-3c947c7, empty if there is no working core
core_binary_version() {
	"$1" -v 2> /dev/null | head -n 1 | cut -d ' ' -f 3
}

core_title() {
	case "$1" in
		meta) echo "Mihomo Meta" ;;
		alpha) echo "Mihomo Alpha" ;;
		prizrak) echo "Prizrak-Core" ;;
	esac
}

config_get() {
	[ -f "$config" ] && jq -r "($1) // empty" "$config" 2> /dev/null
}

# $1 url of the gzipped binary
install_core() {
	local file="$temp_dir/core.gz"
	info 'Downloading and validating the selected core...'
	if ! download "$1" "$file" || ! gzip -t "$file" 2> /dev/null; then
		fail "core download failed"
	fi
	mkdir -p "$libexec_dir" || fail "can not create core directory"
	if [ "$LOW_SPACE" = 1 ]; then
		warn 'Low space mode: stopping Exodus and removing the current core before extraction.'
		# the running core keeps its file allocated, stop it first
		[ -x "$share_dir/exodus" ] && "$share_dir/exodus" stop
		core_lost=1
		rm -f "$core_path"
		gzip -dc "$file" > "$core_path" || fail "core install failed, the proxy does not work until the installer succeeds"
		chmod 755 "$core_path"
		[ -n "$(core_binary_version "$core_path")" ] || fail "the new core does not run on this router"
	else
		# the current core is kept until the new one is written and runs
		if ! gzip -dc "$file" > "$core_path.new"; then
			rm -f "$core_path.new"
			fail "core install failed, not enough free space? run the installer with LOW_SPACE=1 or enable the low flash space mode on the update page"
		fi
		chmod 755 "$core_path.new"
		if [ -z "$(core_binary_version "$core_path.new")" ]; then
			rm -f "$core_path.new"
			fail "the new core does not run on this router"
		fi
		backup_binary mihomo
		mv -f "$core_path.new" "$core_path" || fail "core activation failed"
	fi
	rm -f "$file"
	done_message "$(core_title "$core") installed and verified."
}

prepare_yq() {
	local file="$temp_dir/yq.tar.gz"
	info 'Downloading and validating yq...'
	if ! download "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_$yq_arch.tar.gz" "$file" || ! gzip -t "$file" 2> /dev/null; then
		fail "yq download failed"
	fi
	mkdir -p "$temp_dir/yq" || fail "can not stage yq"
	tar -xzf "$file" -C "$temp_dir/yq" || fail "yq install failed, not enough free space?"
	rm -f "$file"
	[ -f "$temp_dir/yq/yq_linux_$yq_arch" ] || fail "yq archive has no yq_linux_$yq_arch"
	chmod 755 "$temp_dir/yq/yq_linux_$yq_arch"
	if ! "$temp_dir/yq/yq_linux_$yq_arch" --version > /dev/null 2>&1; then
		rm -rf "$temp_dir/yq"
		# the release of yq for arm needs an fpu, a yq of entware would be built for the cpu
		if [ "$core_arch" = "armv5" ] && opkg install yq > /dev/null 2>&1 && "$EXODUS_OPT/bin/yq" --version 2> /dev/null | grep -q mikefarah; then
			mkdir -p "$temp_dir/yq" || fail "can not stage yq"
			staged_yq_path="$temp_dir/yq/yq_linux_$yq_arch"
			ln -sf "$EXODUS_OPT/bin/yq" "$staged_yq_path" || fail "yq staging failed"
			done_message 'Entware yq verified and ready.'
			return
		fi
		fail "yq does not run on this router"
	fi
	staged_yq_path="$temp_dir/yq/yq_linux_$yq_arch"
	done_message 'yq downloaded and verified.'
}

# a line of exodus in a user script of asuswrt-merlin, right after the shebang: a script may end with exit
# the lines of other addons are kept, the old line of exodus is replaced
hook_add() {
	local file line first
	file="$EXODUS_JFFS/scripts/$1"
	line="$2 # exodus"
	first='#!/bin/sh'
	[ ! -f "$file" ] || first=$(head -n 1 "$file") || return 1
	case "$first" in '#!'*) ;; *) first='#!/bin/sh' ;; esac
	printf '%s\n%s\n' "$first" "$line" > "$file.new" || return 1
	if [ -f "$file" ]; then
		# sed returns success for empty output and failure for a failed read/write.
		sed '1{ /^#!/d; }; /# exodus$/d' "$file" >> "$file.new" || return 1
	fi
	mv -f "$file.new" "$file" && chmod 755 "$file"
}

# Bootstrap check uses firmware tools only; staged helper checks again before replacement.
merlin_preflight() {
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

# check env
banner 'Install & update'
step '1/6' 'Firmware and running services'
merlin_preflight || fail "native WebUI preflight: $MERLIN_PREFLIGHT_ERROR"
# other transparent proxies intercept the same traffic
for name in xray sing-box v2ray clash; do
	if pidof "$name" > /dev/null 2>&1; then
		warn "$name is running: if it intercepts the traffic (XRAYUI and similar addons), stop it and disable its autostart"
	fi
done
for pid in $(pidof mihomo 2> /dev/null); do
	executable=$(readlink "${EXODUS_INSTALL_PROC:-/proc}/$pid/exe" 2> /dev/null)
	executable=${executable% (deleted)}
	[ "$executable" = "$(readlink -f "$core_path" 2> /dev/null)" ] && continue
	confirm_mihomo
	break
done
done_message 'Firmware preflight complete.'

# No dependency probing or downloading happens before Mihomo confirmation.
step '2/6' 'Dependencies and architecture'
[ -x "$EXODUS_OPT/bin/opkg" ] || fail 'Entware is not installed: install it with amtm on a USB drive first'
for tool in iptables iptables-save iptables-restore ipset; do
	[ -x "/usr/sbin/$tool" ] || have "$tool" || fail "$tool of the firmware is not found"
done
# Firmware OpenSSL provides checksums when BusyBox does not.
if ! printf '' | sha256sum > /dev/null 2>&1; then
	sha256sum() { openssl dgst -sha256 -r "$@" | sed 's/ \*/  /'; }
fi
if ! printf '' | md5sum > /dev/null 2>&1; then
	md5sum() { openssl dgst -md5 -r "$@" | sed 's/ \*/  /'; }
fi

# the core and yq are static builds, they follow the cpu and the kernel: an arm64 kernel runs arm64 builds whatever entware is
arch=$(opkg print-architecture | awk '$2 != "all" && $2 != "noarch" { arch = $2 } END { print arch }')
machine=$(uname -m)
case "$machine" in
	aarch64*) core_arch="arm64"; yq_arch="arm64" ;;
	armv7*)
		# broadcom northstar (rt-ac68u, rt-ac88u, rt-ac3100 and others) has no fpu, go needs armv5 builds there
		if grep -q -w -E 'vfp|vfpv3|vfpv4' /proc/cpuinfo 2> /dev/null; then
			core_arch="armv7"
		else
			core_arch="armv5"
		fi
		yq_arch="arm"
		;;
	mips*)
		case "$arch" in
			mipsel*) core_arch="mipsle-softfloat"; yq_arch="mipsle" ;;
			*) core_arch="mips-softfloat"; yq_arch="mips" ;;
		esac
		;;
	x86_64*) core_arch="amd64-compatible"; yq_arch="amd64" ;;
	*) fail "unsupported architecture: $machine" ;;
esac
info "Architecture: $machine; core: $core_arch; Entware: $arch"

# temp dir
temp_dir="$EXODUS_OPT/tmp/exodus-install"
install_lock="$EXODUS_OPT/tmp/exodus-install.lock"
if [ -n "$SOURCE_DIR" ]; then
 source_path=$(cd "$SOURCE_DIR" 2>/dev/null && pwd -P) || fail "SOURCE_DIR is not readable"
 stage_path=$(readlink -f "$temp_dir" 2>/dev/null)
 case "$source_path/" in "$temp_dir/"*|"${stage_path:-$temp_dir}/"*) fail "SOURCE_DIR must be outside installer staging" ;; esac
fi
# A failed rollback keeps its backup for manual recovery instead of overwriting it.
[ ! -f "$temp_dir/recovery-required" ] || fail "resolve the previous recovery backup in $temp_dir first"
mkdir -p "$EXODUS_OPT/tmp" || fail "can not create installer storage"
mkdir "$install_lock" 2>/dev/null || fail "another installation owns $install_lock; resolve stale locks before retrying"
trap 'rollback; if [ -n "$rollback_failed" ]; then touch "$temp_dir/recovery-required"; else rm -rf "$temp_dir"; fi; rm -f "$install_lock/pid"; rmdir "$install_lock"' EXIT
echo "$$" > "$install_lock/pid" || fail "can not write installer lock"
rm -rf "$temp_dir" || fail "can not clean staging directory"
mkdir -p "$temp_dir" || fail "can not create $temp_dir"
trap 'fail "installation interrupted by HUP"' HUP
trap 'fail "installation interrupted by INT"' INT
trap 'fail "installation interrupted by TERM"' TERM

# dependencies from entware, curl and jq are needed by the installer itself
# iptables and ipset are of the firmware, they match its kernel
info 'Updating Entware package index...'
opkg update > /dev/null 2>&1 || warn 'opkg update failed; trying the available package index.'
info 'Installing packages: curl, jq, ca-bundle, coreutils-base64'
opkg install curl jq ca-bundle coreutils-base64 || fail "package install failed"
have base64 || fail "base64 is unavailable after installing coreutils-base64"
[ "$(printf 'Exodus' | base64 2> /dev/null | tr -d '\n')" = RXhvZHVz ] || fail "base64 encoding failed; check coreutils-base64"
[ "$(printf RXhvZHVz | base64 -d 2> /dev/null)" = Exodus ] || fail "base64 decoding failed; check coreutils-base64"
# secrets, the password and the update check need sha-256: sha256sum or openssl of the firmware
printf '' | sha256sum 2> /dev/null | grep -q '^[0-9a-f]\{64\}' || fail "sha256sum is not found and openssl can not compute sha-256"
[ ! -f "$config" ] || jq -e 'type == "object"' "$config" > /dev/null 2>&1 || fail "existing config.json is not a valid JSON object"
done_message 'Entware and checksum/base64 tools verified.'

# access to github: through the given or the saved gh-proxy, then directly
version_url="https://github.com/$repository/raw/$ref/asuswrt/opt/share/exodus/VERSION"
saved_gh_proxy=$(config_get .update.gh_proxy)
if [ "${GH_PROXY+set}" = "set" ]; then
	case "$GH_PROXY" in
		""|http://*|https://*) ;;
		*) fail "GH_PROXY must start with https://" ;;
	esac
	routes="${GH_PROXY:-direct}"
	save_gh_proxy=1
else
	routes="$saved_gh_proxy direct"
fi
info 'Checking access to GitHub...'
github_status=1
for route in $routes; do
	gh_proxy="${route%/}"
	[ "$route" = "direct" ] && gh_proxy=""
	check_github
	status=$?
	if [ "$status" = 0 ]; then
		github_status=0
		break
	fi
	[ "$status" = 22 ] && github_status=22
done
if [ "$github_status" = 22 ]; then
	fail "$ref of $repository is not found on GitHub (gh-proxy also answers 404 to a wrong token and to repositories outside GHP_ALLOW_LIST)"
fi
if [ "$github_status" != 0 ]; then
	[ -n "$GH_PROXY" ] && fail "gh-proxy does not work: check the address and the token"
	[ -n "$saved_gh_proxy" ] && warn 'The saved gh-proxy does not work.'
	# jsDelivr tells a blocked github from a router without internet, it does not serve release files, so it can not replace github
	if curl -s -f -m 15 -o /dev/null "https://cdn.jsdelivr.net/gh/$repository@$ref/install.sh" 2> /dev/null; then
		warn 'github.com is unreachable, but cdn.jsdelivr.net is reachable: the router cannot reach GitHub directly.'
	else
		warn 'github.com and cdn.jsdelivr.net are unreachable: check router connectivity and DNS.'
	fi
	info 'The core and yq are published only in GitHub releases; jsDelivr does not serve them.'
	info 'Use a gh-proxy server with access to GitHub: https://github.com/prettyleaf/gh-proxy'
	interactive || fail "github is unreachable, run the installer with GH_PROXY=https://<gh-proxy address>/<token>, see README"
	for _ in 1 2 3; do
		ask "gh-proxy address with the token, e.g. https://example.com/ghproxy/TOKEN (empty to exit): "
		[ -z "$answer" ] && break
		case "$answer" in
			http://*|https://*) ;;
			*)
				warn 'The address must start with https://'
				continue
				;;
		esac
		gh_proxy="${answer%/}"
		if check_github; then
			github_status=0
			save_gh_proxy=1
			break
		fi
		warn 'gh-proxy does not work: check the address and the token.'
	done
	[ "$github_status" = 0 ] || fail "github is unreachable"
fi
if [ -n "$gh_proxy" ]; then
	# the token is a part of the address, only the host is shown
	gh_proxy_host="${gh_proxy#*://}"
	info "Downloading through gh-proxy at ${gh_proxy_host%%/*}"
fi

# Stage yq with the dependencies; activate it only inside the rollback transaction.
staged_yq_path=''
if [ -z "$("$yq_path" --version 2> /dev/null)" ]; then
	prepare_yq
else
	done_message 'yq is already installed and working.'
fi
done_message 'Dependencies verified.'
step '3/6' 'Download source and select core'

# choose the core, the current one is saved in the config
current_core=$(config_get .update.core)
if [ -z "$current_core" ]; then
	case "$(core_binary_version "$core_path")" in
		alpha-*) current_core="alpha" ;;
		*) current_core="meta" ;;
	esac
fi
core="$CORE"
if [ -z "$core" ] && interactive; then
	{
	printf '\n%bChoose the core%b\n' "$ui_bold$ui_accent" "$ui_reset"
	printf '  %b1%b  Mihomo Meta    Latest stable release\n' "$ui_accent" "$ui_reset"
	printf '  %b2%b  Mihomo Alpha   Development build\n' "$ui_accent" "$ui_reset"
	printf '  %b3%b  Prizrak-Core   Mihomo fork by legiz-ru\n' "$ui_accent" "$ui_reset"
	printf '\n  Current: %b%s%b\n' "$ui_bold" "$(core_title "$current_core")" "$ui_reset"
	} > /dev/tty
	while [ -z "$core" ]; do
		ask "Select [1-3], Enter keeps $(core_title "$current_core"): " || fail 'core selection cancelled'
		case "$answer" in
			"") core="$current_core" ;;
			1|meta) core="meta" ;;
			2|alpha) core="alpha" ;;
			3|prizrak) core="prizrak" ;;
			*) warn 'Choose 1, 2 or 3, or press Enter to keep the current core.' ;;
		esac
	done
fi
core="${core:-$current_core}"
case "$core" in
	meta)
		core_release="https://github.com/MetaCubeX/mihomo/releases/latest/download"
		core_asset="mihomo-linux-$core_arch"
		;;
	alpha)
		core_release="https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha"
		core_asset="mihomo-linux-$core_arch"
		;;
	prizrak)
		core_release="https://github.com/legiz-ru/Prizrak-Core/releases/latest/download"
		core_asset="prizrak-core-linux-$core_arch"
		;;
	*) fail "unknown core: $core, use meta, alpha or prizrak" ;;
esac
info "Selected core: $(core_title "$core")"

# the releases publish their version in version.txt, it is a part of the file names
core_latest=$(curl -s -f -L -m 30 "$(gh_url "$core_release/version.txt")" 2> /dev/null | head -n 1 | tr -d '\r')
if ! echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$'; then
	fail "failed to get the latest version of $(core_title "$core") from $core_release"
fi
info "Latest $(core_title "$core"): $core_latest"
if [ "$core" = "meta" ]; then
	# stable releases are in their own tag, the latest redirect does not serve the versioned file names through every gh-proxy
	core_release="https://github.com/MetaCubeX/mihomo/releases/download/$core_latest"
fi

if [ -n "$SOURCE_DIR" ]; then
 src=$(cd "$SOURCE_DIR" 2>/dev/null && pwd -P) || fail "SOURCE_DIR is not readable"
 case "$src/" in "$temp_dir/"*) fail "SOURCE_DIR must be outside installer staging" ;; esac
 info "Local Exodus source: $src"
 payload_source="$src"
else
 # The application archive is small and staged on Entware storage.
 info "Downloading Exodus ($ref)..."
 mkdir -p "$temp_dir/app" || fail "can not stage application"
 download "https://github.com/$repository/archive/$ref.tar.gz" "$temp_dir/app.tar.gz" 300 || fail "application download failed"
 tar -xzf "$temp_dir/app.tar.gz" -C "$temp_dir/app" 2> /dev/null || fail "application extraction failed"
 commit=$(archive_commit "$temp_dir/app.tar.gz")
 rm -f "$temp_dir/app.tar.gz"
 src=$(find "$temp_dir/app" -mindepth 1 -maxdepth 1 -type d | head -n 1)
 payload_source="$repository@$ref"
fi
if [ -z "$src" ] || [ ! -f "$src/asuswrt/opt/share/exodus/exodus" ]; then
	fail "download failed, if the provider slows down GitHub, install through gh-proxy, see README"
fi
for file in install.sh uninstall.sh asuswrt/opt/etc/init.d/S99exodus asuswrt/opt/etc/exodus/config.json asuswrt/opt/etc/exodus/mixin.yaml asuswrt/opt/share/exodus/VERSION asuswrt/opt/share/exodus/www/Exodus.asp asuswrt/opt/share/exodus/www/app.js asuswrt/opt/share/exodus/www/merlin.js asuswrt/opt/share/exodus/www/i18n.js asuswrt/opt/share/exodus/www/style.css; do
 [ -s "$src/$file" ] || fail "incomplete application payload: $file (source: $payload_source); use a source revision containing the native WebUI"
done
for file in "$src/install.sh" "$src/uninstall.sh" "$src/asuswrt/opt/share/exodus/exodus" "$src/asuswrt/opt/etc/init.d/S99exodus" "$src/asuswrt/opt/share/exodus/lib/"*.sh; do
 sh -n "$file" || fail "invalid shell payload: $file"
done
jq -e 'type == "object"' "$src/asuswrt/opt/etc/exodus/config.json" > /dev/null || fail "invalid default config"
done_message "Exodus $(cat "$src/asuswrt/opt/share/exodus/VERSION")${commit:+ ($(echo "$commit" | cut -c 1-7))} payload verified."
code=$(code_hash "$src")

was_running=0
[ -x "$share_dir/exodus" ] && "$share_dir/exodus" status > /dev/null 2>&1 && was_running=1

# installs before the build info forced the proxy port and the log level by default, now the profile decides; reset once
legacy=0
if [ -f "$config" ] && ! jq -e '.code // empty' "$share_dir/BUILD" > /dev/null 2>&1; then
	legacy=1
fi

# Validate the downloaded registration helper, independently of the installed version.
(
 # The staged library is isolated in this child shell and checked separately by CI.
 # shellcheck source=/dev/null
 . "$src/asuswrt/opt/share/exodus/lib/common.sh"
 . "$src/asuswrt/opt/share/exodus/lib/webui.sh"
 webui_preflight || { printf '%s\n' "$MERLIN_PREFLIGHT_ERROR" >&2; exit 1; }
) || fail "downloaded WebUI helper rejected this firmware"
mkdir -p "$temp_dir/backup" || fail "can not stage migration backup"
[ -d "$home_dir" ] || touch "$temp_dir/backup/home.absent" || fail "backup failed"
[ ! -d "$EXODUS_JFFS/addons/exodus" ] || cp -Rp "$EXODUS_JFFS/addons/exodus" "$temp_dir/backup/addon" || fail "native registration backup failed"
for name in config.json mixin.yaml; do
 if [ -f "$home_dir/$name" ]; then cp -p "$home_dir/$name" "$temp_dir/backup/$name" || fail "backup failed";
 else touch "$temp_dir/backup/$name.absent"; fi
done
for name in firewall-start nat-start unmount services-start service-event; do
 [ ! -f "$EXODUS_JFFS/scripts/$name" ] || cp -p "$EXODUS_JFFS/scripts/$name" "$temp_dir/backup/$name" || fail "hook backup failed"
done
[ ! -f "$EXODUS_OPT/etc/init.d/S99exodus" ] || cp -p "$EXODUS_OPT/etc/init.d/S99exodus" "$temp_dir/backup/S99exodus" || fail "init backup failed"
# code is replaced, settings and profiles are kept
step '4/6' 'Install Exodus and migrate settings'
info 'Preserving existing settings and staging application files...'
rm -rf "$share_dir.new"
mkdir -p "$share_dir.new" || fail "can not create $share_dir"
cp -R "$src/asuswrt/opt/share/exodus/." "$share_dir.new/" || fail "install failed, not enough free space?"
# the installer from the repository root, used by the update page
cp -f "$src/install.sh" "$share_dir.new/install.sh" || fail "installer staging failed"
cp -f "$src/uninstall.sh" "$share_dir.new/uninstall.sh" || fail "uninstaller staging failed"
jq -n --arg repository "$repository" --arg ref "$ref" --arg commit "$commit" --arg code "$code" --arg installed "$(date '+%Y-%m-%d %H:%M:%S')" \
	'{repository: $repository, ref: $ref, commit: $commit, code: $code, installed: $installed}' > "$share_dir.new/BUILD" || fail "build metadata staging failed"
was_web_running=0
migration_pending=1
touch "$temp_dir/recovery-required" || fail "can not mark migration recovery backup"
# Never trust a stale PID file to stop another addon's server.
(
 # Keep the staged library's variables out of the parent installer.
 # shellcheck source=/dev/null
 . "$src/asuswrt/opt/share/exodus/lib/common.sh"
 . "$src/asuswrt/opt/share/exodus/lib/webui.sh"
 if webui_status; then touch "$temp_dir/backup/web-active"; webui_cache_stop || exit 1; fi
 if [ -f "$WEB_PID_PATH" ]; then
  webui_stop_legacy
  [ -f "$WEB_PID_PATH" ] || touch "$temp_dir/backup/web-active"
 fi
)
web_stop_result=$?
[ ! -f "$temp_dir/backup/web-active" ] || was_web_running=1
[ "$web_stop_result" = 0 ] || fail "previous WebUI did not stop"

rm -rf "$share_dir.old" || fail "can not clean previous code staging"
if [ -d "$share_dir" ]; then mv "$share_dir" "$share_dir.old" || fail "can not preserve previous code"; fi
code_changed=1
mv "$share_dir.new" "$share_dir" || fail "install failed"
chmod 755 "$share_dir/exodus" "$share_dir/install.sh" "$share_dir/uninstall.sh" || fail "code permission update failed"

mkdir -p "$EXODUS_OPT/etc/init.d" "$EXODUS_OPT/bin" "$home_dir/profiles" "$home_dir/subscriptions" "$home_dir/run/providers/rule" "$home_dir/run/providers/proxy" || fail "data directory creation failed"
cp -f "$src/asuswrt/opt/etc/init.d/S99exodus" "$EXODUS_OPT/etc/init.d/S99exodus" || fail "init script install failed"
chmod 755 "$EXODUS_OPT/etc/init.d/S99exodus" || fail "init script permissions failed"
ln -sf "$share_dir/exodus" "$EXODUS_OPT/bin/exodus" || fail "CLI link install failed"

# the firmware restores its tables without the rules of addons on every restart of the firewall, the user scripts apply them again
# they run only with "Enable JFFS custom scripts and configs" (Administration - System)
if [ -d "$EXODUS_JFFS" ] && [ -n "$(nvram get productid 2> /dev/null)" ]; then
	if [ "$(nvram get jffs2_scripts)" != "1" ]; then
		info 'Enabling JFFS custom scripts and configs...'
		nvram set jffs2_scripts=1
		nvram commit
	fi
	mkdir -p "$EXODUS_JFFS/scripts" || fail "hook directory creation failed"
	hook_add firewall-start "[ -x \"$share_dir/exodus\" ] && \"$share_dir/exodus\" hook firewall" || fail "firewall hook install failed"
	hook_add nat-start "[ -x \"$share_dir/exodus\" ] && \"$share_dir/exodus\" hook nat" || fail "NAT hook install failed"
	hook_add unmount "[ -x \"$share_dir/exodus\" ] && \"$share_dir/exodus\" hook unmount \"\$1\"" || fail "unmount hook install failed"
	hook_add services-start "[ ! -x \"$EXODUS_JFFS/addons/exodus/boot.sh\" ] || \"$EXODUS_JFFS/addons/exodus/boot.sh\" > /dev/null 2>&1 &" || fail "boot hook install failed"
	hook_add service-event "[ ! -x \"$EXODUS_JFFS/addons/exodus/boot.sh\" ] || \"$EXODUS_JFFS/addons/exodus/boot.sh\" event \"\$1\" \"\$2\"" || fail "service event hook install failed"
else
	warn '/jffs is not available; rules are restored only by the watcher.'
fi
[ -f "$home_dir/mixin.yaml" ] || cp -f "$src/asuswrt/opt/etc/exodus/mixin.yaml" "$home_dir/mixin.yaml" || fail "mixin install failed"
# new options get their defaults, the values of the user win, options removed from exodus are dropped
# renamed options keep their values; no regex in jq, the jq of entware has none
config_merge='
	def moved($from; $to): if getpath($to) == null and getpath($from) != null then setpath($to; getpath($from)) else . end;
	def known($user):
		if type == "object" then
			if ($user | type) == "object" then with_entries(.key as $k | if ($user | has($k)) then .value |= known($user[$k]) else . end) else . end
		else $user end;
	.[0] as $defaults
	| .[1]
	| moved(["proxy", "ipv4_dns_hijack"]; ["proxy", "dns_hijack"])
	| moved(["mixin", "authentications", 0, "username"]; ["mixin", "username"])
	| moved(["mixin", "authentications", 0, "password"]; ["mixin", "password"])
	| if .mixin.api_port == null and (.mixin.api_listen | type) == "string" then .mixin.api_port = (.mixin.api_listen | split(":") | last | tonumber? // null) else . end
	| if .mixin.rule == false then .mixin.rules = ((.mixin.rules // []) | map(.enabled = false)) else . end
	# subscriptions were downloaded on every start or by hand, now by an interval: null follows the provider, 0 is by hand
	| if (.subscriptions | type) == "array" then
		.subscriptions |= map(if has("update_interval") then . else .update_interval = (if .prefer == "local" then 0 else null end) end | del(.prefer))
	  else . end
	| if $legacy == 1 and (.mixin | type) == "object" then
		.mixin.log_level |= (if . == "warning" then null else . end)
		| .mixin.mixed_port |= (if . == 7890 then null else . end)
	  else . end
	| . as $user
	| $defaults | known($user) | if ($user | has("web")) then .web = $user.web else . end'
if [ -f "$config" ]; then
	if jq -s --argjson legacy "$legacy" "$config_merge" "$src/asuswrt/opt/etc/exodus/config.json" "$config" > "$config.new" 2> /dev/null && [ -s "$config.new" ]; then
		mv -f "$config.new" "$config" || fail "config activation failed"
	else
		rm -f "$config.new"
		fail "config migration failed"
	fi
else
	cp -f "$src/asuswrt/opt/etc/exodus/config.json" "$config" || fail "config install failed"
fi
chmod 600 "$config" || fail "config permissions failed"
rm -rf "$temp_dir/app"
# The previous yq stays in place until all source and migration checks pass.
if [ -n "$staged_yq_path" ]; then
	backup_binary yq
	mv -f "$staged_yq_path" "$yq_path" || fail "yq activation failed"
	done_message 'yq activated.'
fi
done_message 'Exodus files, hooks and settings installed.'
step '5/6' 'Verify Mihomo'

# the core
if [ "$current_core" != "$core" ] || [ "$(core_binary_version "$core_path")" != "$core_latest" ]; then
	install_core "$core_release/$core_asset-$core_latest.gz"
else
	done_message "$(core_title "$core") $core_latest is already installed."
fi

# remember the core and the gh-proxy for the next runs and the update page
if [ "$save_gh_proxy" = 1 ]; then
	jq --arg core "$core" --arg proxy "$gh_proxy" '.update.core = $core | .update.gh_proxy = $proxy' "$config" > "$config.new" || fail "update settings save failed"
else
	jq --arg core "$core" '.update.core = $core' "$config" > "$config.new" || fail "update settings save failed"
fi
mv -f "$config.new" "$config" || fail "update settings activation failed"

# secrets of the core api and the proxy ports, the hwid
step '6/6' 'Activate and check services'
"$share_dir/exodus" init || fail "Exodus initialization failed"

# the web ui and the service run the new code
info 'Registering WebUI and starting its cache...'
"$share_dir/exodus" web restart || fail "native WebUI registration failed"
if [ "$was_running" = 1 ] || [ "$(config_get .config.enabled)" = "true" ]; then
	info 'Restarting Exodus service...'
	service_attempted=1
	"$share_dir/exodus" restart || fail "service activation failed"
	"$share_dir/exodus" status > /dev/null 2>&1 || fail "service is not running after activation"
fi

web_url=$("$share_dir/exodus" web url) || fail "native WebUI URL unavailable"
[ -n "$web_url" ] || fail "native WebUI URL unavailable"
done_message "WebUI: $web_url"
migration_pending=0
rm -rf "$share_dir.old"
done_message 'Installation complete.'
