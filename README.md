![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Tag](https://img.shields.io/github/v/release/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/prettyleaf/openwrt-exodus/total?style=for-the-badge&logo=github)

English | [中文](README.zh.md)

# Exodus

Transparent Proxy with Mihomo on OpenWrt. Fork of [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki).

## Prerequisites

- OpenWrt >= 24.10
- Linux Kernel >= 5.13
- firewall4

## Feature

- Transparent Proxy (Redirect/TPROXY/TUN, IPv4 and/or IPv6), TCP Redirect + UDP TPROXY by default
- Official Mihomo core: `mihomo-meta` packages the prebuilt binary from [MetaCubeX releases](https://github.com/MetaCubeX/mihomo/releases), verified by sha256
- Per-device proxy selection: proxy everyone except the selected devices, or only the selected devices
- HWID headers for subscriptions (Remnawave HWID device limit), enabled by default
- Profile Mixin
- Profile Editor
- Scheduled Restart

## Install & Update

Packages are downloaded directly from [GitHub Releases](https://github.com/prettyleaf/openwrt-exodus/releases) for the architecture and OpenWrt version of the router, then installed locally. Dependencies are installed from the official OpenWrt feeds. Run the same command again to update.

The packages are `exodus`, `luci-app-exodus` and `luci-i18n-exodus-*`. If `nikki` / `luci-app-nikki` are installed, the installer replaces them and keeps the config, profiles and subscriptions (they are shared, the config stays at `/etc/config/nikki`).

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | ash
```

To install a specific release instead of the latest one:

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | VERSION=v1.26.1 ash
```

If the router can not reach GitHub, download `exodus_<arch>-<branch>.tar.gz` for your router from the releases page on another machine, copy it to `/tmp` on the router and install the packages from it:

```shell
# <arch> is DISTRIB_ARCH from /etc/openwrt_release, <branch> is openwrt-24.10, openwrt-25.12 or SNAPSHOT
# if nikki is installed, remove it first (the config is kept): opkg remove luci-app-nikki nikki / apk del luci-app-nikki nikki
mkdir -p /tmp/exodus && tar -x -z -f /tmp/exodus_<arch>-<branch>.tar.gz -C /tmp/exodus
# for opkg (OpenWrt 24.10)
opkg update && opkg install /tmp/exodus/mihomo-meta_*.ipk /tmp/exodus/exodus_*.ipk /tmp/exodus/luci-app-exodus_*.ipk
# for apk (OpenWrt 25.12 and SNAPSHOT)
apk update && apk add --allow-untrusted /tmp/exodus/mihomo-meta-[0-9]*.apk /tmp/exodus/exodus-[0-9]*.apk /tmp/exodus/luci-app-exodus-[0-9]*.apk
```

Installed packages can also be updated from LuCI: `Services → Exodus → Update`. On routers with little free flash enable the low flash space mode there, it removes the current core before installing the new one.

## Mihomo Alpha Core

Only the stable core (`mihomo-meta`) is shipped. To run the Alpha core, replace the core binary with the official Alpha build from [MetaCubeX releases](https://github.com/MetaCubeX/mihomo/releases/tag/Prerelease-Alpha):

```shell
# asset name for your router, see the table below
ASSET=arm64
# find the latest alpha build
url=$(wget -q -O - https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/Prerelease-Alpha | jsonfilter -e '@.assets[*].browser_download_url' | grep "/mihomo-linux-${ASSET}-alpha-[0-9a-f]*\.gz$")
echo "$url"
# stop the service, the running core keeps its file allocated
/etc/init.d/nikki stop
# remove the current core first, so it works with little free flash space
rm -f /usr/libexec/mihomo
wget -q -O - "$url" | gzip -dc > /usr/libexec/mihomo && chmod +x /usr/libexec/mihomo
mihomo -v
/etc/init.d/nikki start
```

| `DISTRIB_ARCH` from `/etc/openwrt_release` | `ASSET` |
| --- | --- |
| `aarch64_*` | `arm64` |
| `arm_*` with `vfp`/`neon` in the name, e.g. `arm_cortex-a7_neon-vfpv4` | `armv7` |
| `arm_arm1176jzf-s_vfp` | `armv6` |
| `arm_*` without FPU, e.g. `arm_cortex-a9`, `arm_arm926ej-s` | `armv5` |
| `mips_24kc`, `mips_4kec`, `mips_mips32` | `mips-softfloat` |
| `mipsel_24kc`, `mipsel_74kc`, `mipsel_mips32` | `mipsle-softfloat` |
| `mipsel_24kc_24kf` | `mipsle-hardfloat` |
| `mips64_octeonplus` | `mips64` |
| `x86_64` | `amd64-v1` |
| `i386_pentium4` | `386` |
| `riscv64_*` | `riscv64` |
| `loongarch64_*` | `loong64-abi2` |

If the download fails, the router is left without a core: run the commands again. The Alpha core stays until a new `mihomo-meta` version is installed (from the Update page or the installer), which brings back the stable core. To return to the stable core earlier, run the same commands, but find the latest stable build instead:

```shell
url=$(wget -q -O - https://api.github.com/repos/MetaCubeX/mihomo/releases/latest | jsonfilter -e '@.assets[*].browser_download_url' | grep "/mihomo-linux-${ASSET}-v[0-9.]*\.gz$")
```

## Uninstall & Reset

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/uninstall.sh | ash
```

## How To Use

1. Open `Services → Exodus → Profile` in LuCI and add your subscription.
2. On `Services → Exodus → App Config` choose the subscription, enable the app and choose which devices go through the proxy.
3. Everything else is on the `Advanced` page. Do not change it unless you know what you are doing.

## How does it work

1. Mixin and Update profile.
2. Run mihomo.
3. Set scheduled restart.
4. Set ip rule/route
5. Generate nftables and apply it.

Note that the steps above may change base on config.

## Release

Push a tag starting with `v` (for example `v1.26.1`). The `release-packages` workflow builds the packages for every supported architecture and attaches `exodus_<arch>-<branch>.tar.gz` to the GitHub release, which is what the installer downloads.

The Mihomo core is not compiled: `mihomo-meta` downloads the official binary for the target architecture and checks its sha256. The `dependabot` workflow checks MetaCubeX releases daily and opens a pull request that bumps the version and the hashes in `mihomo-meta/Makefile`.

## Compilation

```shell
# add feed
echo "src-git exodus https://github.com/prettyleaf/openwrt-exodus.git;main" >> "feeds.conf.default"
# update & install feeds
./scripts/feeds update -a
./scripts/feeds install -a
# make package
make package/luci-app-exodus/compile
```

The package files will be found under `bin/packages/your_architecture/exodus`.

## Dependencies

- ca-bundle
- curl
- yq
- firewall4
- ip-full
- kmod-inet-diag
- kmod-nft-socket
- kmod-nft-tproxy
- kmod-tun
- kmod-dummy

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [@ApoisL](https://github.com/apoiston)
- [@xishang0128](https://github.com/xishang0128)
