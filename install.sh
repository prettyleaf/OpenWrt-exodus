#!/bin/sh

# Exodus installer and updater
# downloads packages for this router directly from GitHub releases and installs them locally
# VERSION=<tag>   install a specific release instead of the latest one
# LOW_SPACE=1     remove the current core before installing the new one, for routers with little free flash
# CORE=<core>     install this core without asking: prizrak (Prizrak-Core), meta (stable Mihomo Meta), alpha (Mihomo Alpha),
#                 prizrak-kroha (Prizrak-Kroha, the lighter router build of Prizrak-Core) or prizrak-kroha-upx (the same, packed with UPX)
# GH_PROXY=<url>  download from GitHub through gh-proxy (https://github.com/prettyleaf/gh-proxy), e.g. https://example.com/ghproxy/TOKEN, empty to download directly
# SUBSCRIPTION=<url> add this subscription (or choose it if it is added already), download it and use it as the profile,
#                 in a terminal the installer offers to enable Exodus with it; quote the link, it often has & in it
# the core and GH_PROXY are saved in /etc/config/nikki, the next runs and the update page use them

repository="prettyleaf/openwrt-exodus"

# colors only on a terminal, the update page reads the log as plain text; NO_COLOR turns them off
c_reset='' c_bold='' c_dim='' c_step='' c_info='' c_ask='' c_warn='' c_error=''
if [ -t 1 ] && [ "${TERM:-dumb}" != "dumb" ] && [ -z "${NO_COLOR+set}" ]; then
	esc=$(printf '\033')
	c_reset="${esc}[0m" c_bold="${esc}[1m" c_dim="${esc}[90m" c_step="${esc}[1;34m" c_info="${esc}[1;32m" c_ask="${esc}[1;33m" c_warn="${esc}[1;33m" c_error="${esc}[1;31m"
fi

# ==> a stage of the install
step() {
	printf '%s==>%s %s%s%s\n' "$c_step" "$c_reset" "$c_bold" "$1" "$c_reset"
}

# -> what the stage does or finds
info() {
	printf '  %s->%s %s\n' "$c_info" "$c_reset" "$1"
}

# a detail of the stage, dimmed
note() {
	printf '    %s%s%s\n' "$c_dim" "$1" "$c_reset"
}

warn() {
	printf '%swarning:%s %s\n' "$c_warn" "$c_reset" "$1"
}

# the last line is "success" or starts with "error:", the update page relies on it
fail() {
	printf '%serror:%s %s\n' "$c_error" "$c_reset" "$1"
	exit 1
}

success() {
	printf '%ssuccess%s\n' "$c_info" "$c_reset"
}

# the installer is usually piped into the shell, so questions are asked on the terminal
# there is no terminal when it runs from the update page, then nothing is asked
interactive() {
	( exec < /dev/tty ) 2> /dev/null
}

# :: a question, $1 is the question and $2 the hint of the answer
ask() {
	printf '%s::%s %s%s%s %s> ' "$c_ask" "$c_reset" "$c_bold" "$1" "$c_reset" "${2:+[$2] }" > /dev/tty
	answer=
	read -r answer < /dev/tty
}

# github url, through gh-proxy if it is used
gh_url() {
	echo "${gh_proxy:+$gh_proxy/}$1"
}

# download a file of a github release by the route of the access check
# $1 url of the file, $2 output file or - for stdout, the rest are options of wget
# when github.com does not answer but api.github.com does, the file is taken by its id in the release metadata of the api,
# the api redirects it to release-assets.githubusercontent.com
download_github() {
	local url="$1" output="$2" path repo release asset metadata asset_id
	shift 2
	if [ "$use_github_api" != 1 ]; then
		wget "$@" -O "$output" "$(gh_url "$url")"
		return
	fi
	path="${url#https://github.com/}"
	repo="${path%%/releases/*}"
	release="${path#*/releases/}"
	asset="${release##*/}"
	case "$release" in
		latest/download/*) release="latest" ;;
		download/*/*)
			release="${release#download/}"
			release="tags/${release%/*}"
			;;
		*) return 1 ;;
	esac
	# the name goes into the filter of jsonfilter
	case "$asset" in ""|*[!A-Za-z0-9._-]*) return 1 ;; esac
	# the metadata is kept for the run: the index and the archive come from the same release even if latest changes meanwhile
	metadata="$temp_dir/api-$(echo "$repo/$release" | tr '/' '_').json"
	if [ ! -s "$metadata" ] && ! wget -q -T 15 -O "$metadata" "https://api.github.com/repos/$repo/releases/$release"; then
		rm -f "$metadata"
		return 4
	fi
	asset_id=$(jsonfilter -q -i "$metadata" -e "@.assets[@.name=\"$asset\"].id")
	# a file missing in the release, like a 404 of github
	case "$asset_id" in ""|*[!0-9]*) return 8 ;; esac
	# quiet: the redirect prints a signed temporary address
	wget -q "$@" --header 'Accept: application/octet-stream' -O "$output" "https://api.github.com/repos/$repo/releases/assets/$asset_id"
}

# fetch the package index of the release to check access to github
# returns 0 on success, 8 if github answered with an error (the file is missing), other codes if github is unreachable
check_github() {
	local index ret
	index=$(download_github "$index_url" - -T 15 2> /tmp/exodus-github.err)
	ret=$?
	# a wrong gh-proxy address may answer with some web page
	if [ "$ret" = 0 ] && ! echo "$index" | grep -q '"packages"'; then
		ret=1
		echo "the answer is not the expected file" > /tmp/exodus-github.err
	fi
	# the last line of the error, progress lines of wget end with \r
	check_error=$(tr '\r' '\n' < /tmp/exodus-github.err 2> /dev/null | grep . | tail -n 1)
	rm -f /tmp/exodus-github.err
	# older releases have no tag in the index
	release_tag=$(echo "$index" | jsonfilter -q -e '@.tag' 2> /dev/null)
	return "$ret"
}

# check github directly, then through its api when github.com does not answer
# direct_error keeps the reason of the failed direct check
check_direct_github() {
	local ret
	gh_proxy=""
	use_github_api=0
	check_github
	ret=$?
	# on success the last line of wget is its progress, not an error
	direct_error=""
	[ "$ret" = 0 ] || direct_error="$check_error"
	# 8 is an answer of github, the api would not find the file either
	if [ "$ret" != 0 ] && [ "$ret" != 8 ]; then
		use_github_api=1
		check_github && return 0
		use_github_api=0
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

# version of the core binary, e.g. v1.19.31, alpha-3c947c7 or v1.19.34-r4-kroha, empty if there is no working core
core_binary_version() {
	"$1" -v 2> /dev/null | head -n 1 | cut -d ' ' -f 3
}

# the release a core binary comes from: Prizrak-Kroha marks its version with -kroha, version.txt has the plain tag
core_release_version() {
	local version
	version=$(core_binary_version "$1")
	echo "${version%-kroha}"
}

core_title() {
	case "$1" in
		prizrak) echo "Prizrak-Core" ;;
		meta) echo "Mihomo Meta" ;;
		alpha) echo "Mihomo Alpha" ;;
		prizrak-kroha) echo "Prizrak-Kroha" ;;
		prizrak-kroha-upx) echo "Prizrak-Kroha UPX" ;;
	esac
}

core_description() {
	case "$1" in
		prizrak) echo "mihomo fork by legiz-ru" ;;
		meta) echo "latest stable release of MetaCubeX/mihomo" ;;
		alpha) echo "development build of MetaCubeX/mihomo" ;;
		prizrak-kroha) echo "lighter Prizrak-Core for routers, about 35-40 MB on flash" ;;
		prizrak-kroha-upx) echo "Prizrak-Kroha packed with UPX: about 8-10 MB on flash, unpacked into RAM at start" ;;
	esac
}

# the choices of the core, numbered in the order of the list
core_menu() {
	local number=0 type
	for type in prizrak meta alpha prizrak-kroha prizrak-kroha-upx; do
		number=$((number + 1))
		printf '    %s%s)%s %-17s %s' "$c_bold" "$number" "$c_reset" "$(core_title "$type")" "$(core_description "$type")"
		[ "$type" = "$current_core" ] && printf '  %s[%s]%s' "$c_info" "$current_core_tag" "$c_reset"
		printf '\n'
	done
}

# write the core binary from github releases, it belongs to no package
# $1 url of the gzipped binary
install_core() {
	local file="$temp_dir/core.gz"
	info "download ${1##*/}"
	if ! download_github "$1" "$file" -q || ! gzip -t "$file" 2> /dev/null; then
		fail "core download failed"
	fi
	if [ "$LOW_SPACE" = 1 ]; then
		warn "low space mode: remove current core"
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
	info "$(core_title "$core") $(core_binary_version /usr/libexec/mihomo) runs on this router"
}

# add the subscription of SUBSCRIPTION or find the same link among the added ones, sets subscription_section
# a new install has a placeholder subscription, it becomes this one
add_subscription() {
	local section
	subscription_section=""
	for section in $(uci -q -X show nikki | sed -n 's/^nikki\.\([^.=]*\)=subscription$/\1/p'); do
		if [ "$(uci -q get "nikki.$section.url")" = "$SUBSCRIPTION" ]; then
			subscription_section="$section"
			info "already added: $(uci -q get "nikki.$section.name")"
			return
		fi
	done
	if [ "$(uci -q get nikki.subscription.url)" = "http://example.com/default.yaml" ]; then
		subscription_section="subscription"
	else
		subscription_section=$(uci -q add nikki subscription) || fail "failed to add the subscription"
	fi
	# the name of the provider replaces the host on the first download
	uci -q set "nikki.$subscription_section.name=$subscription_host"
	uci -q set "nikki.$subscription_section.url=$SUBSCRIPTION"
	uci -q set "nikki.$subscription_section.user_agent=Exodus/{version} {platform}"
	uci -q set "nikki.$subscription_section.send_hwid=1"
	info "add the subscription from $subscription_host"
}

# add the subscription, download it once to check the link and choose it as the profile
# a link that does not download is kept for a fix on the Profile page, a running proxy keeps its profile then
setup_subscription() {
	local previous_profile enabled log_lines line name expire
	step "Adding the subscription"
	previous_profile=$(uci -q get nikki.config.profile)
	enabled=$(uci -q get nikki.config.enabled)
	add_subscription
	uci -q set nikki.config.profile="subscription:$subscription_section"
	uci -q commit nikki
	info "download the subscription"
	# the service writes the reasons of a failure to its log, only the lines of this download are shown
	log_lines=$(wc -l < /var/log/nikki/app.log 2> /dev/null || echo 0)
	if /etc/init.d/nikki update_subscription "$subscription_section" && [ "$(uci -q get "nikki.$subscription_section.success")" = 1 ]; then
		name=$(uci -q get "nikki.$subscription_section.name")
		expire=$(uci -q get "nikki.$subscription_section.expire")
		info "$name${expire:+, expires $expire}, it is the profile now"
	else
		warn "the subscription was not downloaded, check the link on the Profile page"
		tail -n +$((log_lines + 1)) /var/log/nikki/app.log 2> /dev/null | sed -n 's/^\[[^]]*\] \[Profile\] //p' | while IFS= read -r line; do
			note "$line"
		done
		if [ "$enabled" = 1 ] && [ -n "$previous_profile" ]; then
			uci -q set nikki.config.profile="$previous_profile"
			uci -q commit nikki
			note "the running proxy keeps its profile"
		fi
		return
	fi
	[ "$enabled" = 1 ] && return
	# a new install is disabled until a profile is chosen
	if interactive; then
		ask "Enable Exodus with this subscription?" "Y/n"
		case "$answer" in
			""|[Yy]*)
				uci -q set nikki.config.enabled=1
				uci -q commit nikki
				info "Exodus is enabled, the devices that go through the proxy are chosen on Services → Exodus → App Config"
				return
				;;
		esac
	fi
	note "enable Exodus on Services → Exodus → App Config"
}

# print a line as if it is typed, 12 characters at a time: each pause forks sleep, so the steps are few
type_line() {
	local rest="$1" chunk
	while [ -n "$rest" ]; do
		chunk="${rest%"${rest#????????????}"}"
		[ -z "$chunk" ] && chunk="$rest"
		rest="${rest#"$chunk"}"
		printf '%s' "$chunk"
		sleep 0.015
	done
	printf '\n'
}

# the welcome banner, only on a terminal: the update page shows the log as plain text
banner() {
	local line
	step "Welcome to"
	# typing needs fractional sleep, busybox may be built without it
	if sleep 0.01 2> /dev/null; then
		while IFS= read -r line; do
			type_line "$line"
		done
	else
		cat
	fi << 'EOF'

  :#@@@@@@@@@@@@@@@@@@@@@@#. #@@@@%-.         .-%@@@#:
  :#@@@@@@@@@@@@@@@@@@@@@@%. #@@@@@@#:.     .:#@@@@@%:
  .*@@@@@@@@@@@@@@@@@@@@@@%. #@@@@@@@@*:   .*@@@@@@@+.
   .-%@@@@@@@@------------:. .=%@@@@@@@@+. .@@@@@@*:.
     .=%@@@@@@@+::::::::::.    .+@@@@@@@@%=:@@@@#-.
  .-===*@@@@@@@@@@@@@@@@@@%.    .:*@@@@@@@@@#--:.
  :#@@@@#-*@@@@@@@@@@@@@@@%.      .-#@@@@@@@@%-.
  :#@@@@#: :#@@@@@@@@@@@@@%.     ..::*@@@@@@@@@#:.
  :#@@@@#:   ..............    ..+@@@@++%@@@@@@@@*:
  .*%%%%%=:::::::::::::::::.  .=@@@@@@-..+@@@@@@@@@+.
        =%@@@@@@@@@@@@@@@@%. -%@@@@@@%:   .#@@@@@@@@#:
        -%@@@@@@@@@@@@@@@@%. #@@@@@%=.      :%@@@@@@%:
        -%@@@@@@@@@@@@@@@@%. #@@@@+.         .-%@@@@#:

EOF
}

[ -t 1 ] && banner

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

# name of core builds for this architecture, the same variant as in the mihomo-meta package of the feed
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

# Prizrak-Kroha is built for fewer targets: amd64 (v1), arm64, armv7 and softfloat mips/mipsle, which runs on hardfloat too
case "$core_arch" in
	amd64-v1) kroha_arch="amd64" ;;
	arm64|armv7|mips-softfloat|mipsle-softfloat) kroha_arch="$core_arch" ;;
	mipsle-hardfloat) kroha_arch="mipsle-softfloat" ;;
	*) kroha_arch="" ;;
esac

# release url, set VERSION to install a specific release tag instead of the latest one
if [ -n "$VERSION" ]; then
	release_url="https://github.com/$repository/releases/download/$VERSION"
else
	release_url="https://github.com/$repository/releases/latest/download"
fi
archive_url="$release_url/exodus_${arch}-${branch}.tar.gz"
index_url="$release_url/exodus_${arch}-${branch}.json"

step "Exodus installer"
note "${DISTRIB_DESCRIPTION:-OpenWrt $DISTRIB_RELEASE}, $arch, $package_manager"

# temp dir
temp_dir="/tmp/exodus-install"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"
# a proxy stopped for the downloads is started again if the installer fails
trap 'rm -rf "$temp_dir"; [ "$proxy_stopped" = 1 ] && [ -x "/etc/init.d/nikki" ] && /etc/init.d/nikki start' EXIT

# the subscription link is checked before anything is changed, only its host is shown: the link carries the token of the subscription
if [ -n "$SUBSCRIPTION" ]; then
	case "$SUBSCRIPTION" in
		http://*|https://*) ;;
		*) fail "SUBSCRIPTION must start with https://" ;;
	esac
	case "$SUBSCRIPTION" in
		*[[:space:]]*) fail "SUBSCRIPTION has a space or a line break in it, copy the link again" ;;
	esac
	subscription_host="${SUBSCRIPTION#*://}"
	subscription_host="${subscription_host%%[/?#]*}"
	subscription_host="${subscription_host##*@}"
	note "subscription from $subscription_host"
fi

# access to github: through the given or the saved gh-proxy, then directly or through the api of github, then through public mirrors
# public gh-proxy mirrors, tried when github does not answer directly
public_mirrors="https://gh-proxy.com https://ghfast.top"
saved_gh_proxy=$(uci -q get nikki.update.gh_proxy)
if [ "${GH_PROXY+set}" = "set" ]; then
	case "$GH_PROXY" in
		""|http://*|https://*) ;;
		*) fail "GH_PROXY must start with https://" ;;
	esac
	routes="${GH_PROXY:-direct}"
	save_gh_proxy=1
else
	routes="$saved_gh_proxy direct $public_mirrors"
fi
step "Checking access to GitHub"
github_status=1
use_github_api=0
for route in $routes; do
	if [ "$route" = "direct" ]; then
		check_direct_github
	else
		gh_proxy="${route%/}"
		check_github
	fi
	status=$?
	if [ "$status" = 0 ]; then
		github_status=0
		break
	fi
	# a public mirror may refuse by its own limits, only github and the own gh-proxy tell a missing file
	case " $public_mirrors " in *" $route "*) ;; *) [ "$status" = 8 ] && github_status=8 ;; esac
done
if [ -n "$direct_error" ]; then
	warn "github does not answer directly: $direct_error"
	case "$direct_error" in
		*[Cc]ertificate*|*SSL*) note "the clock of the router is $(date '+%Y-%m-%d %H:%M'): a wrong clock or a missing CA bundle fails the certificate check" ;;
	esac
fi
if [ "$github_status" = 0 ] && [ -n "$gh_proxy" ] && [ "$gh_proxy" != "${saved_gh_proxy%/}" ]; then
	case " $public_mirrors " in
		*" $gh_proxy "*)
			# saved for the update page, the installer with GH_PROXY= returns to github directly
			save_gh_proxy=1
			note "downloading through the public mirror $gh_proxy, run the installer with GH_PROXY= to download directly again"
			;;
	esac
fi
# the running nikki (or exodus) proxies the router itself, a broken route of its profile hides a reachable github
if [ "$github_status" = 1 ] && [ -z "$GH_PROXY" ] && [ -x "/etc/init.d/nikki" ] && /etc/init.d/nikki running > /dev/null 2>&1; then
	warn "github is unreachable through the running proxy, stopping it and trying directly"
	/etc/init.d/nikki stop
	proxy_stopped=1
	check_direct_github
	github_status=$?
	[ "$github_status" = 0 ] || [ "$github_status" = 8 ] || github_status=1
fi
if [ "$github_status" = 8 ]; then
	fail "no prebuilt packages for $arch-$branch in release ${VERSION:-latest}, see README for supported architectures (gh-proxy also answers 404 to a wrong token and to repositories outside GHP_ALLOW_LIST)"
fi
if [ "$github_status" != 0 ]; then
	[ -n "$GH_PROXY" ] && fail "gh-proxy does not work: check the address and the token"
	[ -n "$saved_gh_proxy" ] && warn "the saved gh-proxy does not work"
	# jsDelivr tells a blocked github from a router without internet, it does not serve release files, so it can not replace github
	if wget -q -T 15 -O /dev/null "https://cdn.jsdelivr.net/gh/$repository@main/install.sh" 2> /dev/null; then
		warn "github.com is unreachable, but cdn.jsdelivr.net is reachable: GitHub is blocked by the provider"
	else
		warn "github.com and cdn.jsdelivr.net are unreachable: check the internet connection and DNS of the router, or the provider blocks both"
	fi
	note "packages and cores are published only in GitHub releases, jsDelivr does not serve them"
	note "deploy gh-proxy on a server with access to GitHub and install through it: https://github.com/prettyleaf/gh-proxy"
	interactive || fail "github is unreachable, run the installer with GH_PROXY=https://<gh-proxy address>/<token>, see README"
	for attempt in 1 2 3; do
		ask "gh-proxy address with the token" "https://example.com/ghproxy/TOKEN, empty to exit"
		[ -z "$answer" ] && break
		case "$answer" in
			http://*|https://*) ;;
			*)
				warn "the address must start with https://"
				continue
				;;
		esac
		gh_proxy="${answer%/}"
		if check_github; then
			github_status=0
			save_gh_proxy=1
			break
		fi
		warn "gh-proxy does not work: check the address and the token"
	done
	[ "$github_status" = 0 ] || fail "github is unreachable"
fi
if [ "$use_github_api" = 1 ]; then
	info "through the GitHub API${release_tag:+, release $release_tag}"
elif [ -n "$gh_proxy" ]; then
	# the token is a part of the address, only the host is shown
	gh_proxy_host="${gh_proxy#*://}"
	info "through gh-proxy at ${gh_proxy_host%%/*}${release_tag:+, release $release_tag}"
else
	info "directly${release_tag:+, release $release_tag}"
fi

# choose the core: the installer downloads it from its github releases, no package carries it
# the current core is saved in the config, the alpha and prizrak-kroha cores installed by hand are detected by their versions
step "Choosing the core"
current_core=$(uci -q get nikki.update.core)
current_core_tag="current"
if [ -z "$current_core" ]; then
	case "$(core_binary_version /usr/libexec/mihomo)" in
		alpha-*) current_core="alpha" ;;
		*-kroha) current_core="prizrak-kroha" ;;
		"") current_core="prizrak"; current_core_tag="default" ;;
		*) current_core="meta" ;;
	esac
fi
core="$CORE"
if [ -z "$core" ] && interactive; then
	core_menu > /dev/tty
	while [ -z "$core" ]; do
		ask "Core" "1-5, Enter keeps $(core_title "$current_core")"
		case "$answer" in
			"") core="$current_core" ;;
			1|prizrak) core="prizrak" ;;
			2|meta) core="meta" ;;
			3|alpha) core="alpha" ;;
			4|prizrak-kroha) core="prizrak-kroha" ;;
			5|prizrak-kroha-upx) core="prizrak-kroha-upx" ;;
			*) warn "choose 1, 2, 3, 4 or 5" ;;
		esac
	done
fi
core="${core:-$current_core}"
case "$core" in
	prizrak|meta|alpha|prizrak-kroha|prizrak-kroha-upx) ;;
	*) fail "unknown core: $core, use prizrak, meta, alpha, prizrak-kroha or prizrak-kroha-upx" ;;
esac

# find the latest build of the core before anything is changed, the releases publish its version in version.txt
[ -n "$core_arch" ] || fail "no $(core_title "$core") build for $arch"
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
	prizrak-kroha|prizrak-kroha-upx)
		# Prizrak-Kroha is published in the releases of Prizrak-Core, the UPX build has -compressed before the version
		[ -n "$kroha_arch" ] || fail "no $(core_title "$core") build for $arch, choose Prizrak-Core"
		core_release="https://github.com/legiz-ru/Prizrak-Core/releases/latest/download"
		core_asset="prizrak-kroha-linux-$kroha_arch"
		[ "$core" = "prizrak-kroha-upx" ] && core_asset="$core_asset-compressed"
		;;
esac
core_latest=$(download_github "$core_release/version.txt" - -q -T 15 2> /dev/null | head -n 1)
if ! echo "$core_latest" | grep -q -E '^[A-Za-z0-9._-]+$'; then
	fail "failed to get the latest version of $(core_title "$core") from $core_release"
fi
info "$(core_title "$core") $core_latest"

# remove legacy upstream feed, otherwise the package manager may replace these packages with upstream ones
step "Downloading Exodus${release_tag:+ $release_tag}"
if [ -f "/etc/opkg/customfeeds.conf" ] && grep -q "nikkinikki" "/etc/opkg/customfeeds.conf"; then
	info "remove legacy upstream feed"
	sed -i '/nikkinikki/d' "/etc/opkg/customfeeds.conf"
fi
if [ -f "/etc/apk/repositories.d/customfeeds.list" ] && grep -q "nikkinikki" "/etc/apk/repositories.d/customfeeds.list"; then
	info "remove legacy upstream feed"
	sed -i '/nikkinikki/d' "/etc/apk/repositories.d/customfeeds.list"
fi

# download and extract packages, streamed to avoid keeping the archive in ram
info "download ${archive_url##*/}"
download_github "$archive_url" - -q | tar -x -z -f - -C "$temp_dir"
if ! ls "$temp_dir"/exodus[_-][0-9]* > /dev/null 2>&1; then
	fail "download failed, if the provider slows down GitHub, install through gh-proxy, see README"
fi

# update feeds for dependencies, collect packages to install and legacy nikki packages to replace
step "Installing packages"
info "update feeds"
if [ "$package_manager" = "opkg" ]; then
	opkg update
	languages=$(opkg list-installed 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	# releases before 1.31.0 depend on mihomo-meta and carry it in the archive, the later ones have no package of the core
	meta_package="$(ls "$temp_dir"/mihomo-meta_*.ipk 2>/dev/null)"
	packages="$meta_package $(ls "$temp_dir"/exodus_*.ipk "$temp_dir"/luci-app-exodus_*.ipk 2>/dev/null)"
	for lang in $languages; do
		packages="$packages $(ls "$temp_dir"/luci-i18n-exodus-${lang}_*.ipk 2>/dev/null)"
	done
	legacy_packages="$(opkg list-installed 'luci-i18n-nikki-*' | cut -d ' ' -f 1) $(opkg list-installed luci-app-nikki | cut -d ' ' -f 1) $(opkg list-installed nikki | cut -d ' ' -f 1)"
elif [ "$package_manager" = "apk" ]; then
	apk update
	languages=$(apk list --installed --manifest 'luci-i18n-base-*' | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	meta_package="$(ls "$temp_dir"/mihomo-meta-[0-9]*.apk 2>/dev/null)"
	packages="$meta_package $(ls "$temp_dir"/exodus-[0-9]*.apk "$temp_dir"/luci-app-exodus-[0-9]*.apk 2>/dev/null)"
	for lang in $languages; do
		packages="$packages $(ls "$temp_dir"/luci-i18n-exodus-${lang}-[0-9]*.apk 2>/dev/null)"
	done
	legacy_packages="$(apk list --installed --manifest 'luci-i18n-nikki-*' | cut -d ' ' -f 1) $(apk list --installed --manifest luci-app-nikki | cut -d ' ' -f 1) $(apk list --installed --manifest nikki | cut -d ' ' -f 1)"
fi

# replace legacy nikki packages, exodus uses the same config and profiles so they are kept
# shellcheck disable=SC2086
legacy_packages=$(echo $legacy_packages)
if [ -n "$legacy_packages" ]; then
	info "replace legacy packages: $legacy_packages"
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

# mihomo-alpha is no longer shipped and conflicts with mihomo-meta of older releases, remove it, the core is installed below
if [ "$package_manager" = "opkg" ] && opkg list-installed mihomo-alpha | grep -q "^mihomo-alpha"; then
	info "remove mihomo-alpha"
	opkg remove --force-depends mihomo-alpha
elif [ "$package_manager" = "apk" ] && apk list -I mihomo-alpha 2>/dev/null | grep -q "^mihomo-alpha"; then
	info "remove mihomo-alpha"
	apk del mihomo-alpha
fi

# install packages
# the packages of the release are installed whatever version is installed: VERSION may choose an older release,
# and exodus had versions by date (2026.04.08) before it took the versions of the releases
# apk installs the given files as they are, opkg needs --force-downgrade for it
info "install $(echo "$packages" | tr ' ' '\n' | sed -n 's|.*/||p' | tr '\n' ' ')"
if [ "$package_manager" = "opkg" ]; then
	# shellcheck disable=SC2086
	opkg install --force-downgrade $packages || fail "install failed"
elif [ "$package_manager" = "apk" ]; then
	# shellcheck disable=SC2086
	apk add --allow-untrusted $packages || fail "install failed"
fi

# exodus no longer depends on mihomo-meta: the package is removed, its file is kept for the core step,
# moved aside meanwhile, the package manager deletes the files of a package
if [ -z "$meta_package" ] && [ -n "$(package_version mihomo-meta)" ]; then
	info "remove the mihomo-meta package, the core is installed by the installer now"
	[ -f "/usr/libexec/mihomo" ] && mv -f "/usr/libexec/mihomo" "/usr/libexec/mihomo.keep"
	if [ "$package_manager" = "opkg" ]; then
		opkg remove mihomo-meta
	elif [ "$package_manager" = "apk" ]; then
		apk del mihomo-meta
	fi
	[ -f "/usr/libexec/mihomo.keep" ] && mv -f "/usr/libexec/mihomo.keep" "/usr/libexec/mihomo"
fi

# install the chosen core, the packages are installed, free the ram for the core download
rm -f "$temp_dir"/*.ipk "$temp_dir"/*.apk
step "Installing the core"
# the binary tells its version, mihomo-meta of an older release may have replaced it
if [ "$current_core" != "$core" ] || [ "$(core_release_version /usr/libexec/mihomo)" != "$core_latest" ]; then
	install_core "$core_release/$core_asset-$core_latest.gz"
else
	info "$(core_title "$core") $core_latest is already installed"
fi
# mihomo in PATH, like the link of mihomo-meta: apk points it at busybox when that package goes, a file of another package stays
[ -L "/usr/bin/mihomo" ] || [ ! -e "/usr/bin/mihomo" ] && ln -sf "/usr/libexec/mihomo" "/usr/bin/mihomo"

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

[ -n "$SUBSCRIPTION" ] && setup_subscription

# restart to run the new core
proxy_stopped=0
if [ -x "/etc/init.d/nikki" ]; then
	step "Restarting the service"
	/etc/init.d/nikki restart
fi

success
