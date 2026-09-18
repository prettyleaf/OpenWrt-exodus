#!/bin/sh

# Exodus installer and updater
# downloads packages for this router directly from GitHub releases and installs them locally
# VERSION=<tag>  install a specific release instead of the latest one
# LOW_SPACE=1    remove the current core before installing the new one, for routers with little free flash

repository="prettyleaf/openwrt-exodus"

# the last line is "success" or starts with "error:", the update page relies on it
fail() {
	echo "error: $1"
	exit 1
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

# release url, set VERSION to install a specific release tag instead of the latest one
if [ -n "$VERSION" ]; then
	release_url="https://github.com/$repository/releases/download/$VERSION"
else
	release_url="https://github.com/$repository/releases/latest/download"
fi
archive_url="$release_url/exodus_${arch}-${branch}.tar.gz"

# temp dir
temp_dir="/tmp/exodus-install"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"
trap 'rm -rf "$temp_dir"' EXIT

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
wget -q -O - "$archive_url" | tar -x -z -f - -C "$temp_dir"
if ! ls "$temp_dir"/exodus[_-][0-9]* > /dev/null 2>&1; then
	fail "download failed: no prebuilt packages for $arch-$branch or github.com is unreachable, see README for supported architectures"
fi

# update feeds for dependencies, collect packages to install and legacy nikki packages to replace
echo "update feeds"
if [ "$package_manager" = "opkg" ]; then
	opkg update
	languages=$(opkg list-installed 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	packages="$(ls "$temp_dir"/mihomo-meta_*.ipk "$temp_dir"/exodus_*.ipk "$temp_dir"/luci-app-exodus_*.ipk 2>/dev/null)"
	for lang in $languages; do
		packages="$packages $(ls "$temp_dir"/luci-i18n-exodus-${lang}_*.ipk 2>/dev/null)"
	done
	legacy_packages="$(opkg list-installed 'luci-i18n-nikki-*' | cut -d ' ' -f 1) $(opkg list-installed luci-app-nikki | cut -d ' ' -f 1) $(opkg list-installed nikki | cut -d ' ' -f 1)"
elif [ "$package_manager" = "apk" ]; then
	apk update
	languages=$(apk list --installed --manifest 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	packages="$(ls "$temp_dir"/mihomo-meta-[0-9]*.apk "$temp_dir"/exodus-[0-9]*.apk "$temp_dir"/luci-app-exodus-[0-9]*.apk 2>/dev/null)"
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
if [ "$LOW_SPACE" = 1 ] && [ -f "/usr/libexec/mihomo" ]; then
	core_file=$(ls "$temp_dir"/mihomo-meta[_-][0-9]* 2>/dev/null | head -n 1)
	core_file=${core_file##*/}
	if [ "$package_manager" = "opkg" ]; then
		new_core_version=${core_file#mihomo-meta_}
		new_core_version=${new_core_version%%_*}
		core_version=$(opkg list-installed mihomo-meta | cut -d ' ' -f 3)
	elif [ "$package_manager" = "apk" ]; then
		new_core_version=${core_file#mihomo-meta-}
		new_core_version=${new_core_version%.apk}
		core_version=$(apk list -I mihomo-meta 2>/dev/null | cut -d ' ' -f 1)
		core_version=${core_version#mihomo-meta-}
	fi
	if [ -n "$new_core_version" ] && [ "$core_version" != "$new_core_version" ]; then
		echo "low space mode: remove current core $core_version"
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

# restart to run the new core
if [ -x "/etc/init.d/nikki" ]; then
	echo "restart service"
	/etc/init.d/nikki restart
fi

echo "success"
