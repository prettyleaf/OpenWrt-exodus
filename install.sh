#!/bin/sh

# Exodus for Keenetic installer and updater
# installs into entware: the service, the web ui, the mihomo core and yq, settings and profiles are kept
# REF=<branch|tag>  install another version, the keenetic branch by default
# LOW_SPACE=1       remove the current core before installing the new one, for routers with little free space
# CORE=<core>       install this core without asking: meta (stable), alpha (Mihomo Alpha) or prizrak (Prizrak-Core)
# GH_PROXY=<url>    download from GitHub through gh-proxy (https://github.com/prettyleaf/gh-proxy), e.g. https://example.com/ghproxy/TOKEN, empty to download directly
# PASSWORD=<text>   password of the web ui on the first install, asked or generated otherwise
# the core and GH_PROXY are saved in /opt/etc/exodus/config.json, the next runs and the update page use them

repository="prettyleaf/openwrt-exodus"
ref="${REF:-keenetic}"

export PATH="/opt/bin:/opt/sbin:/sbin:/bin:/usr/sbin:/usr/bin"

share_dir="/opt/share/exodus"
libexec_dir="/opt/libexec/exodus"
home_dir="/opt/etc/exodus"
config="$home_dir/config.json"
core_path="$libexec_dir/mihomo"
yq_path="$libexec_dir/yq"

# the last line is "success" or starts with "error:", the update page relies on it
fail() {
	echo "error: $1"
	exit 1
}

# the installer is usually piped into the shell, so questions are asked on the terminal
# there is no terminal when it runs from the update page, then nothing is asked
interactive() {
	( exec < /dev/tty ) 2> /dev/null
}

ask() {
	printf '%s' "$1" > /dev/tty
	answer=
	read -r answer < /dev/tty
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
	(cd "$1" && find keenetic install.sh -type f 2> /dev/null | LC_ALL=C sort | xargs sha256sum 2> /dev/null) | sha256sum | cut -d ' ' -f 1
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
	echo "download $1"
	if ! download "$1" "$file" || ! gzip -t "$file" 2> /dev/null; then
		fail "core download failed"
	fi
	mkdir -p "$libexec_dir"
	if [ "$LOW_SPACE" = 1 ]; then
		echo "low space mode: remove current core"
		# the running core keeps its file allocated, stop it first
		[ -x "$share_dir/exodus" ] && "$share_dir/exodus" stop
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
		mv -f "$core_path.new" "$core_path"
	fi
	rm -f "$file"
}

install_yq() {
	local file="$temp_dir/yq.tar.gz"
	echo "download yq"
	if ! download "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_$yq_arch.tar.gz" "$file" || ! gzip -t "$file" 2> /dev/null; then
		fail "yq download failed"
	fi
	mkdir -p "$temp_dir/yq" "$libexec_dir"
	tar -xzf "$file" -C "$temp_dir/yq" || fail "yq install failed, not enough free space?"
	rm -f "$file"
	[ -f "$temp_dir/yq/yq_linux_$yq_arch" ] || fail "yq archive has no yq_linux_$yq_arch"
	chmod 755 "$temp_dir/yq/yq_linux_$yq_arch"
	"$temp_dir/yq/yq_linux_$yq_arch" --version > /dev/null 2>&1 || fail "yq does not run on this router"
	mv -f "$temp_dir/yq/yq_linux_$yq_arch" "$yq_path" || fail "yq install failed, not enough free space?"
	rm -rf "$temp_dir/yq"
}

# check env
if [ ! -x "/opt/bin/opkg" ]; then
	fail "Entware is not installed: install the OPKG component of the router and Entware first"
fi
if [ ! -x "/bin/ndmc" ] && [ ! -d "/proc/ndm" ]; then
	echo "warning: this does not look like a Keenetic router, continue anyway"
fi
if [ -x "/opt/sbin/xkeen" ] || [ -f "/opt/etc/init.d/S05xkeen" ]; then
	if pidof xray > /dev/null 2>&1 || pidof mihomo > /dev/null 2>&1; then
		fail "XKeen is running, both can not intercept the traffic: stop it (xkeen -stop) and disable its autostart (xkeen -auto) or remove it (xkeen -remove)"
	fi
	echo "warning: XKeen is installed, keep it stopped and its autostart disabled"
fi

# architecture of entware and names of builds for it, keenetic has no fpu on mips
arch=$(opkg print-architecture | awk '$2 != "all" && $2 != "noarch" { arch = $2 } END { print arch }')
case "$arch" in
	aarch64*) core_arch="arm64"; yq_arch="arm64" ;;
	mipsel*) core_arch="mipsle-softfloat"; yq_arch="mipsle" ;;
	mips*) core_arch="mips-softfloat"; yq_arch="mips" ;;
	armv7*) core_arch="armv7"; yq_arch="arm" ;;
	x86_64*) core_arch="amd64-compatible"; yq_arch="amd64" ;;
	*) fail "unsupported architecture: $arch" ;;
esac
echo "architecture: $arch"

# temp dir
temp_dir="/opt/tmp/exodus-install"
rm -rf "$temp_dir"
mkdir -p "$temp_dir" || fail "can not create $temp_dir"
trap 'rm -rf "$temp_dir"' EXIT

# dependencies from entware, curl and jq are needed by the installer itself
echo "install packages"
opkg update > /dev/null 2>&1 || echo "warning: opkg update failed"
opkg install curl jq ca-bundle ipset iptables ip-full lighttpd lighttpd-mod-cgi || fail "package install failed"

# access to github: through the given or the saved gh-proxy, then directly
version_url="https://github.com/$repository/raw/$ref/keenetic/opt/share/exodus/VERSION"
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
echo "check access to github"
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
	[ -n "$saved_gh_proxy" ] && echo "the saved gh-proxy does not work"
	# jsDelivr tells a blocked github from a router without internet, it does not serve release files, so it can not replace github
	if curl -s -f -m 15 -o /dev/null "https://cdn.jsdelivr.net/gh/$repository@$ref/install.sh" 2> /dev/null; then
		echo "github.com is unreachable, but cdn.jsdelivr.net is reachable: GitHub is blocked by the provider"
	else
		echo "github.com and cdn.jsdelivr.net are unreachable: check the internet connection and DNS of the router, or the provider blocks both"
	fi
	echo "the core and yq are published only in GitHub releases, jsDelivr does not serve them"
	echo "deploy gh-proxy on a server with access to GitHub and install through it: https://github.com/prettyleaf/gh-proxy"
	interactive || fail "github is unreachable, run the installer with GH_PROXY=https://<gh-proxy address>/<token>, see README"
	for _ in 1 2 3; do
		ask "gh-proxy address with the token, e.g. https://example.com/ghproxy/TOKEN (empty to exit): "
		[ -z "$answer" ] && break
		case "$answer" in
			http://*|https://*) ;;
			*)
				echo "the address must start with https://"
				continue
				;;
		esac
		gh_proxy="${answer%/}"
		if check_github; then
			github_status=0
			save_gh_proxy=1
			break
		fi
		echo "gh-proxy does not work: check the address and the token"
	done
	[ "$github_status" = 0 ] || fail "github is unreachable"
fi
if [ -n "$gh_proxy" ]; then
	# the token is a part of the address, only the host is shown
	gh_proxy_host="${gh_proxy#*://}"
	echo "download through gh-proxy at ${gh_proxy_host%%/*}"
fi

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
		echo "choose the core:"
		echo "  1) Mihomo Meta   latest stable release of MetaCubeX/mihomo"
		echo "  2) Mihomo Alpha  development build of MetaCubeX/mihomo"
		echo "  3) Prizrak-Core  mihomo fork by legiz-ru"
	} > /dev/tty
	while [ -z "$core" ]; do
		ask "core [1-3], Enter keeps $(core_title "$current_core"): "
		case "$answer" in
			"") core="$current_core" ;;
			1|meta) core="meta" ;;
			2|alpha) core="alpha" ;;
			3|prizrak) core="prizrak" ;;
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
echo "core: $(core_title "$core")"

# the releases publish their version in version.txt, it is a part of the file names
core_latest=$(curl -s -f -L -m 30 "$(gh_url "$core_release/version.txt")" 2> /dev/null | head -n 1 | tr -d '\r')
if ! echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$'; then
	fail "failed to get the latest version of $(core_title "$core") from $core_release"
fi
echo "latest $(core_title "$core"): $core_latest"
if [ "$core" = "meta" ]; then
	# stable releases are in their own tag, the latest redirect does not serve the versioned file names through every gh-proxy
	core_release="https://github.com/MetaCubeX/mihomo/releases/download/$core_latest"
fi

# download the app, the archive is small and the temp dir is on the storage of entware
echo "download exodus ($ref)"
mkdir -p "$temp_dir/app"
download "https://github.com/$repository/archive/$ref.tar.gz" "$temp_dir/app.tar.gz" 300 && tar -xzf "$temp_dir/app.tar.gz" -C "$temp_dir/app" 2> /dev/null
commit=$(archive_commit "$temp_dir/app.tar.gz")
rm -f "$temp_dir/app.tar.gz"
src=$(find "$temp_dir/app" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -z "$src" ] || [ ! -f "$src/keenetic/opt/share/exodus/exodus" ]; then
	fail "download failed, if the provider slows down GitHub, install through gh-proxy, see README"
fi
echo "exodus $(cat "$src/keenetic/opt/share/exodus/VERSION")${commit:+ ($(echo "$commit" | cut -c 1-7))}"
code=$(code_hash "$src")

was_running=0
[ -x "$share_dir/exodus" ] && "$share_dir/exodus" status > /dev/null 2>&1 && was_running=1

# installs before the build info forced the proxy port and the log level by default, now the profile decides; reset once
legacy=0
if [ -f "$config" ] && ! jq -e '.code // empty' "$share_dir/BUILD" > /dev/null 2>&1; then
	legacy=1
fi

# code is replaced, settings and profiles are kept
echo "install exodus"
rm -rf "$share_dir.new"
mkdir -p "$share_dir.new" || fail "can not create $share_dir"
cp -R "$src/keenetic/opt/share/exodus/." "$share_dir.new/" || fail "install failed, not enough free space?"
# the installer from the repository root, used by the update page
cp -f "$src/install.sh" "$share_dir.new/install.sh"
jq -n --arg ref "$ref" --arg commit "$commit" --arg code "$code" --arg installed "$(date '+%Y-%m-%d %H:%M:%S')" \
	'{ref: $ref, commit: $commit, code: $code, installed: $installed}' > "$share_dir.new/BUILD"
rm -rf "$share_dir.old"
[ -d "$share_dir" ] && mv "$share_dir" "$share_dir.old"
mv "$share_dir.new" "$share_dir" || fail "install failed"
rm -rf "$share_dir.old"
chmod 755 "$share_dir/exodus" "$share_dir/www/api.cgi" "$share_dir/install.sh"

mkdir -p /opt/etc/init.d /opt/etc/ndm/netfilter.d /opt/etc/ndm/schedule.d /opt/bin "$home_dir/profiles" "$home_dir/subscriptions" "$home_dir/run/providers/rule" "$home_dir/run/providers/proxy"
cp -f "$src/keenetic/opt/etc/init.d/S99exodus" /opt/etc/init.d/S99exodus
cp -f "$src/keenetic/opt/etc/ndm/netfilter.d/50-exodus.sh" /opt/etc/ndm/netfilter.d/50-exodus.sh
cp -f "$src/keenetic/opt/etc/ndm/schedule.d/50-exodus.sh" /opt/etc/ndm/schedule.d/50-exodus.sh
chmod 755 /opt/etc/init.d/S99exodus /opt/etc/ndm/netfilter.d/50-exodus.sh /opt/etc/ndm/schedule.d/50-exodus.sh
ln -sf "$share_dir/exodus" /opt/bin/exodus
[ -f "$home_dir/mixin.yaml" ] || cp -f "$src/keenetic/opt/etc/exodus/mixin.yaml" "$home_dir/mixin.yaml"
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
	| $defaults | known($user)'
if [ -f "$config" ]; then
	if jq -s --argjson legacy "$legacy" "$config_merge" "$src/keenetic/opt/etc/exodus/config.json" "$config" > "$config.new" 2> /dev/null && [ -s "$config.new" ]; then
		mv -f "$config.new" "$config"
	else
		rm -f "$config.new"
		echo "warning: the config is not valid json, it is kept as is"
	fi
else
	cp -f "$src/keenetic/opt/etc/exodus/config.json" "$config"
fi
chmod 600 "$config"
rm -rf "$temp_dir/app"

# yq merges the settings into the profile, it is installed once
if [ -z "$("$yq_path" --version 2> /dev/null)" ]; then
	install_yq
fi

# the core
if [ "$current_core" != "$core" ] || [ "$(core_binary_version "$core_path")" != "$core_latest" ]; then
	install_core "$core_release/$core_asset-$core_latest.gz"
else
	echo "$(core_title "$core") $core_latest is already installed"
fi

# remember the core and the gh-proxy for the next runs and the update page
if [ "$save_gh_proxy" = 1 ]; then
	jq --arg core "$core" --arg proxy "$gh_proxy" '.update.core = $core | .update.gh_proxy = $proxy' "$config" > "$config.new" && mv -f "$config.new" "$config"
else
	jq --arg core "$core" '.update.core = $core' "$config" > "$config.new" && mv -f "$config.new" "$config"
fi

# secrets of the core api and the proxy ports, the hwid
"$share_dir/exodus" init

# password of the web ui
if [ ! -f "$home_dir/web.auth" ]; then
	password="$PASSWORD"
	if [ -z "$password" ] && interactive; then
		while [ -z "$password" ]; do
			stty -echo < /dev/tty 2> /dev/null
			ask "password of the web ui (at least 4 characters, empty to generate): "
			stty echo < /dev/tty 2> /dev/null
			echo > /dev/tty
			[ -z "$answer" ] && break
			[ "${#answer}" -ge 4 ] && password="$answer"
		done
	fi
	if [ -z "$password" ]; then
		password=$(head -c 32 /dev/urandom | sha256sum | cut -c 1-12)
		echo "generated password of the web ui: $password"
	fi
	printf '%s\n' "$password" | "$share_dir/exodus" passwd > /dev/null || fail "failed to set the password"
fi

# the web ui and the service run the new code
echo "restart web ui"
"$share_dir/exodus" web restart
if [ "$was_running" = 1 ] || [ "$(config_get .config.enabled)" = "true" ]; then
	echo "restart service"
	"$share_dir/exodus" restart
fi

port=$(config_get .web.port)
address=$(ip -o -4 addr show dev br0 2> /dev/null | awk '{ split($4, a, "/"); print a[1]; exit }')
echo "web ui: http://${address:-<router address>}:${port:-9099}/"
echo "success"
