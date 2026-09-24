#!/bin/sh

# Exodus installer and updater
# downloads packages for this router directly from GitHub releases and installs them locally
# VERSION=<tag>   install a specific release instead of the latest one
# LOW_SPACE=1     remove the current core before installing the new one, for routers with little free flash
# CORE=<core>     install this core without asking: meta (stable, packaged), alpha (Mihomo Alpha) or prizrak (Prizrak-Core)
# GH_PROXY=<url>  download from GitHub through gh-proxy (https://github.com/prettyleaf/gh-proxy), e.g. https://example.com/ghproxy/TOKEN, empty to download directly
# the core and GH_PROXY are saved in /etc/config/nikki, the next runs and the update page use them

repository="prettyleaf/openwrt-exodus"

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

# fetch the package index of the release to check access to github
# returns 0 on success, 8 if github answered with an error (the file is missing), other codes if github is unreachable
check_github() {
	local index ret
	index=$(wget -q -T 15 -O - "$(gh_url "$index_url")" 2> /dev/null)
	ret=$?
	# a wrong gh-proxy address may answer with some web page
	if [ "$ret" = 0 ] && ! echo "$index" | grep -q '"packages"'; then
		ret=1
	fi
	return "$ret"
}

# installed version of a package, empty if it is not installed
package_version() {
	if [ "$package_manager" = "opkg" ]; then
		opkg list-installed "$1" | cut -d ' ' -f 3
	elif [ "$package_manager" = "apk" ]; then
		apk list -I "$1" 2> /dev/null | grep "^$1-[0-9]" | cut -d ' ' -f 1 | sed "s/^$1-//"
	fi
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

# replace the binary of mihomo-meta with a core build from github releases
# $1 url of the gzipped binary
install_core() {
	local file="$temp_dir/core.gz"
	echo "download $1"
	if ! wget -q -O "$file" "$(gh_url "$1")" || ! gzip -t "$file" 2> /dev/null; then
		fail "core download failed"
	fi
	if [ "$LOW_SPACE" = 1 ]; then
		echo "low space mode: remove current core"
		# the running core keeps its file allocated, stop it first
		[ -x "/etc/init.d/nikki" ] && /etc/init.d/nikki stop
		rm -f "/usr/libexec/mihomo"
		gzip -dc "$file" > "/usr/libexec/mihomo" || fail "core install failed, the proxy does not work until the installer succeeds"
		chmod 755 "/usr/libexec/mihomo"
		[ -n "$(core_binary_version /usr/libexec/mihomo)" ] || fail "the new core does not run on this router"
	else
		# the current core is kept until the new one is written and runs
		if ! gzip -dc "$file" > "/usr/libexec/mihomo.new"; then
			rm -f "/usr/libexec/mihomo.new"
			fail "core install failed, not enough free flash space? run the installer with LOW_SPACE=1 or enable the low flash space mode on the update page"
		fi
		chmod 755 "/usr/libexec/mihomo.new"
		if [ -z "$(core_binary_version /usr/libexec/mihomo.new)" ]; then
			rm -f "/usr/libexec/mihomo.new"
			fail "the new core does not run on this router"
		fi
		mv -f "/usr/libexec/mihomo.new" "/usr/libexec/mihomo"
	fi
	rm -f "$file"
}

# check env
if [ ! -x "/sbin/fw4" ]; then
	fail "only supports OpenWrt build with firewall4"
fi
if [ -x "/bin/opkg" ]; then
	package_manager="opkg"
elif [ -x "/usr/bin/apk" ]; then
	package_manager="apk"
else
	fail "no supported package manager (opkg/apk) found"
fi

# include openwrt_release
. /etc/openwrt_release

# get branch/arch
arch="$DISTRIB_ARCH"
branch=
case "$DISTRIB_RELEASE" in
	*"24.10"*)
		branch="openwrt-24.10"
		;;
	*"25.12"*)
		branch="openwrt-25.12"
		;;
	"SNAPSHOT")
		branch="SNAPSHOT"
		;;
	*)
		fail "unsupported release: $DISTRIB_RELEASE"
		;;
esac

# name of core builds for this architecture, the same variant as in mihomo-meta
case "$arch" in
	aarch64_*) core_arch="arm64" ;;
	arm_arm1176jzf-s_vfp) core_arch="armv6" ;;
	arm_*_neon*|arm_*_vfp*) core_arch="armv7" ;;
	arm_*) core_arch="armv5" ;;
	i386_pentium-mmx) core_arch="386-softfloat" ;;
	i386_*) core_arch="386" ;;
	x86_64) core_arch="amd64-v1" ;;
	mips_*) core_arch="mips-softfloat" ;;
	mipsel_24kc_24kf) core_arch="mipsle-hardfloat" ;;
	mipsel_*) core_arch="mipsle-softfloat" ;;
	mips64_*) core_arch="mips64" ;;
	mips64el_*) core_arch="mips64le" ;;
	riscv64_*) core_arch="riscv64" ;;
	loongarch64_*) core_arch="loong64-abi2" ;;
	*) core_arch="" ;;
esac

# release url, set VERSION to install a specific release tag instead of the latest one
if [ -n "$VERSION" ]; then
	release_url="https://github.com/$repository/releases/download/$VERSION"
else
	release_url="https://github.com/$repository/releases/latest/download"
fi
archive_url="$release_url/exodus_${arch}-${branch}.tar.gz"
index_url="$release_url/exodus_${arch}-${branch}.json"

# temp dir
temp_dir="/tmp/exodus-install"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"
trap 'rm -rf "$temp_dir"' EXIT

# access to github: through the given or the saved gh-proxy, then directly
saved_gh_proxy=$(uci -q get nikki.update.gh_proxy)
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
	[ "$status" = 8 ] && github_status=8
done
if [ "$github_status" = 8 ]; then
	fail "no prebuilt packages for $arch-$branch in release ${VERSION:-latest}, see README for supported architectures (gh-proxy also answers 404 to a wrong token and to repositories outside GHP_ALLOW_LIST)"
fi
if [ "$github_status" != 0 ]; then
	[ -n "$GH_PROXY" ] && fail "gh-proxy does not work: check the address and the token"
	[ -n "$saved_gh_proxy" ] && echo "the saved gh-proxy does not work"
	# jsDelivr tells a blocked github from a router without internet, it does not serve release files, so it can not replace github
	if wget -q -T 15 -O /dev/null "https://cdn.jsdelivr.net/gh/$repository@main/install.sh" 2> /dev/null; then
		echo "github.com is unreachable, but cdn.jsdelivr.net is reachable: GitHub is blocked by the provider"
	else
		echo "github.com and cdn.jsdelivr.net are unreachable: check the internet connection and DNS of the router, or the provider blocks both"
	fi
	echo "packages and cores are published only in GitHub releases, jsDelivr does not serve them"
	echo "deploy gh-proxy on a server with access to GitHub and install through it: https://github.com/prettyleaf/gh-proxy"
	interactive || fail "github is unreachable, run the installer with GH_PROXY=https://<gh-proxy address>/<token>, see README"
	for attempt in 1 2 3; do
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

# choose the core: meta is the mihomo-meta package, alpha and prizrak replace its binary with a build from github releases
# the current core is saved in the config, the alpha core installed by hand is detected by its version
current_core=$(uci -q get nikki.update.core)
if [ -z "$current_core" ]; then
	case "$(core_binary_version /usr/libexec/mihomo)" in
		alpha-*) current_core="alpha" ;;
		*) current_core="meta" ;;
	esac
fi
core="$CORE"
if [ -z "$core" ] && interactive; then
	{
		echo "choose the core:"
		echo "  1) Mihomo Meta   latest stable release of MetaCubeX/mihomo, packaged with Exodus"
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
	meta|alpha|prizrak) ;;
	*) fail "unknown core: $core, use meta, alpha or prizrak" ;;
esac
echo "core: $(core_title "$core")"

# find the latest build of an alternative core before anything is changed, the releases publish its version in version.txt
if [ "$core" != "meta" ]; then
	[ -n "$core_arch" ] || fail "no $(core_title "$core") build for $arch"
	if [ "$core" = "alpha" ]; then
		core_release="https://github.com/MetaCubeX/mihomo/releases/download/Prerelease-Alpha"
		core_asset="mihomo-linux-$core_arch"
	else
		core_release="https://github.com/legiz-ru/Prizrak-Core/releases/latest/download"
		core_asset="prizrak-core-linux-$core_arch"
	fi
	core_latest=$(wget -q -T 15 -O - "$(gh_url "$core_release/version.txt")" 2> /dev/null | head -n 1)
	if ! echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$'; then
		fail "failed to get the latest version of $(core_title "$core") from $core_release"
	fi
	echo "latest $(core_title "$core"): $core_latest"
fi

# remove legacy upstream feed, otherwise the package manager may replace these packages with upstream ones
if [ -f "/etc/opkg/customfeeds.conf" ] && grep -q "nikkinikki" "/etc/opkg/customfeeds.conf"; then
	echo "remove legacy upstream feed"
	sed -i '/nikkinikki/d' "/etc/opkg/customfeeds.conf"
fi
if [ -f "/etc/apk/repositories.d/customfeeds.list" ] && grep -q "nikkinikki" "/etc/apk/repositories.d/customfeeds.list"; then
	echo "remove legacy upstream feed"
	sed -i '/nikkinikki/d' "/etc/apk/repositories.d/customfeeds.list"
fi

# download and extract packages, streamed to avoid keeping the archive in ram
echo "download $archive_url"
wget -q -O - "$(gh_url "$archive_url")" | tar -x -z -f - -C "$temp_dir"
if ! ls "$temp_dir"/exodus[_-][0-9]* > /dev/null 2>&1; then
	fail "download failed, if the provider slows down GitHub, install through gh-proxy, see README"
fi

# an alternative core replaces the binary of mihomo-meta, the package stays only as a dependency and is not updated
meta_version=$(package_version mihomo-meta)
update_meta=1
if [ "$core" != "meta" ] && [ -n "$meta_version" ]; then
	update_meta=0
fi

# update feeds for dependencies, collect packages to install and legacy nikki packages to replace
echo "update feeds"
if [ "$package_manager" = "opkg" ]; then
	opkg update
	languages=$(opkg list-installed 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	packages="$(ls "$temp_dir"/exodus_*.ipk "$temp_dir"/luci-app-exodus_*.ipk 2>/dev/null)"
	if [ "$update_meta" = 1 ]; then
		packages="$(ls "$temp_dir"/mihomo-meta_*.ipk 2>/dev/null) $packages"
	fi
	for lang in $languages; do
		packages="$packages $(ls "$temp_dir"/luci-i18n-exodus-${lang}_*.ipk 2>/dev/null)"
	done
	legacy_packages="$(opkg list-installed 'luci-i18n-nikki-*' | cut -d ' ' -f 1) $(opkg list-installed luci-app-nikki | cut -d ' ' -f 1) $(opkg list-installed nikki | cut -d ' ' -f 1)"
elif [ "$package_manager" = "apk" ]; then
	apk update
	languages=$(apk list --installed --manifest 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	packages="$(ls "$temp_dir"/exodus-[0-9]*.apk "$temp_dir"/luci-app-exodus-[0-9]*.apk 2>/dev/null)"
	if [ "$update_meta" = 1 ]; then
		packages="$(ls "$temp_dir"/mihomo-meta-[0-9]*.apk 2>/dev/null) $packages"
	fi
	for lang in $languages; do
		packages="$packages $(ls "$temp_dir"/luci-i18n-exodus-${lang}-[0-9]*.apk 2>/dev/null)"
	done
	legacy_packages="$(apk list --installed --manifest 'luci-i18n-nikki-*' | cut -d ' ' -f 1) $(apk list --installed --manifest luci-app-nikki | cut -d ' ' -f 1) $(apk list --installed --manifest nikki | cut -d ' ' -f 1)"
fi

# replace legacy nikki packages, exodus uses the same config and profiles so they are kept
# shellcheck disable=SC2086
legacy_packages=$(echo $legacy_packages)
if [ -n "$legacy_packages" ]; then
	echo "replace legacy packages: $legacy_packages"
	[ -f "/etc/config/nikki" ] && cp -f "/etc/config/nikki" "$temp_dir/config.bak"
	[ -f "/etc/nikki/mixin.yaml" ] && cp -f "/etc/nikki/mixin.yaml" "$temp_dir/mixin.yaml.bak"
	if [ "$package_manager" = "opkg" ]; then
		# shellcheck disable=SC2086
		opkg remove $legacy_packages
	elif [ "$package_manager" = "apk" ]; then
		# shellcheck disable=SC2086
		apk del $legacy_packages
	fi
	# restore config if the package manager removed it
	if [ ! -f "/etc/config/nikki" ] && [ -f "$temp_dir/config.bak" ]; then
		cp -f "$temp_dir/config.bak" "/etc/config/nikki"
	fi
	if [ ! -f "/etc/nikki/mixin.yaml" ] && [ -f "$temp_dir/mixin.yaml.bak" ]; then
		mkdir -p "/etc/nikki"
		cp -f "$temp_dir/mixin.yaml.bak" "/etc/nikki/mixin.yaml"
	fi
fi

# mihomo-alpha is no longer shipped and conflicts with mihomo-meta, replace it
if [ "$package_manager" = "opkg" ] && opkg list-installed mihomo-alpha | grep -q "^mihomo-alpha"; then
	echo "replace mihomo-alpha with mihomo-meta"
	opkg remove --force-depends mihomo-alpha
elif [ "$package_manager" = "apk" ] && apk list -I mihomo-alpha 2>/dev/null | grep -q "^mihomo-alpha"; then
	echo "replace mihomo-alpha with mihomo-meta"
	apk del mihomo-alpha
fi

# low space mode, the old and the new core may not fit together, so remove the old one if the core is updated
if [ "$LOW_SPACE" = 1 ] && [ "$update_meta" = 1 ] && [ -f "/usr/libexec/mihomo" ]; then
	core_file=$(ls "$temp_dir"/mihomo-meta[_-][0-9]* 2>/dev/null | head -n 1)
	core_file=${core_file##*/}
	if [ "$package_manager" = "opkg" ]; then
		new_core_version=${core_file#mihomo-meta_}
		new_core_version=${new_core_version%%_*}
	elif [ "$package_manager" = "apk" ]; then
		new_core_version=${core_file#mihomo-meta-}
		new_core_version=${new_core_version%.apk}
	fi
	if [ -n "$new_core_version" ] && [ "$meta_version" != "$new_core_version" ]; then
		echo "low space mode: remove current core $meta_version"
		# the running core keeps its file allocated, stop it first
		[ -x "/etc/init.d/nikki" ] && /etc/init.d/nikki stop
		rm -f "/usr/libexec/mihomo"
	fi
fi

# install packages
echo "install packages"
if [ "$package_manager" = "opkg" ]; then
	# shellcheck disable=SC2086
	opkg install $packages || fail "install failed"
elif [ "$package_manager" = "apk" ]; then
	# shellcheck disable=SC2086
	apk add --allow-untrusted $packages || fail "install failed"
fi

# install the chosen core, the packages are installed, free the ram for the core download
rm -f "$temp_dir"/*.ipk "$temp_dir"/*.apk
new_meta_version=$(package_version mihomo-meta)
if [ "$core" = "meta" ]; then
	# mihomo-meta writes its binary only when the package version changes, restore it after another core or a failed update
	if [ "$new_meta_version" = "$meta_version" ] && { [ "$current_core" != "meta" ] || [ -z "$(core_binary_version /usr/libexec/mihomo)" ]; }; then
		[ -n "$core_arch" ] || fail "no Mihomo Meta build for $arch"
		meta_release=${new_meta_version%-r*}
		install_core "https://github.com/MetaCubeX/mihomo/releases/download/v$meta_release/mihomo-linux-$core_arch-v$meta_release.gz"
	fi
elif [ "$current_core" != "$core" ] || [ "$new_meta_version" != "$meta_version" ] || [ "$(core_binary_version /usr/libexec/mihomo)" != "$core_latest" ]; then
	install_core "$core_release/$core_asset-$core_latest.gz"
else
	echo "$(core_title "$core") $core_latest is already installed"
fi

# remember the core and the gh-proxy for the next runs and the update page
uci -q set nikki.update=update
uci -q set nikki.update.core="$core"
if [ "$save_gh_proxy" = 1 ]; then
	if [ -n "$gh_proxy" ]; then
		uci -q set nikki.update.gh_proxy="$gh_proxy"
	else
		uci -q delete nikki.update.gh_proxy
	fi
fi
uci -q commit nikki

# restart to run the new core
if [ -x "/etc/init.d/nikki" ]; then
	echo "restart service"
	/etc/init.d/nikki restart
fi

echo "success"
