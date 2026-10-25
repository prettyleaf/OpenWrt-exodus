![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Tag](https://img.shields.io/github/v/release/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/prettyleaf/openwrt-exodus/total?style=for-the-badge&logo=github)

English | [中文](README.zh.md)  
[Documentation](https://prettyleaf.github.io/OpenWrt-exodus/en/)

> [!CAUTION]
> Exodus is a project, which was made _for fun_ without the intention of “overshadowing other projects” or casting other projects in a negative light. The project is provided “as is”; we will listen to feedback and reports of bugs and/or errors, provided they are presented appropriately and with an understanding of this message. This project has never been and will never be a “pay to use” service. Please use the project for educational purposes and with full awareness of all possible risks.

# Exodus

Transparent Proxy with Mihomo on OpenWrt. Fork of [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki).

Other routers have their own branches: [Keenetic / Netcraze](https://github.com/prettyleaf/openwrt-exodus/tree/keenetic) with Entware, in place of XKeen, and [Asus with Asuswrt-Merlin](https://github.com/prettyleaf/openwrt-exodus/tree/asuswrt) with Entware.

## Prerequisites

- OpenWrt >= 24.10
- Linux Kernel >= 5.13
- firewall4

## Feature

- Transparent Proxy (Redirect/TPROXY/TUN, IPv4 and/or IPv6), TCP Redirect + UDP TPROXY by default
- Official Mihomo core: `mihomo-meta` packages the prebuilt binary from [MetaCubeX releases](https://github.com/MetaCubeX/mihomo/releases), verified by sha256
- Choice of the core in the installer and on the update page: [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core), stable Mihomo Meta or Mihomo Alpha
- Installation through your own [gh-proxy](https://github.com/prettyleaf/gh-proxy) when GitHub is blocked by the provider
- Per-device proxy selection: proxy everyone except the selected devices, or only the selected devices
- HWID headers for subscriptions, enabled by default
- Provider headers of subscriptions: `profile-title` names the subscription, `announce` and `support-url` are shown on the status page, `profile-logo` next to the subscription
- Subscription auto update by `profile-update-interval` of the provider or your own interval, the subscription in use is applied with a service reload
- Profile Mixin
- Profile Editor
- Scheduled Restart

## Install & Update

The packages are `exodus`, `luci-app-exodus` and `luci-i18n-exodus-*`. If `nikki` / `luci-app-nikki` are installed, the installer replaces them and keeps the config, profiles and subscriptions (they are shared, the config stays at `/etc/config/nikki`).

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | ash
```

The installer first checks that the router can download from GitHub, then asks which [core](https://prettyleaf.github.io/OpenWrt-exodus/en/install/options/#core) to install. Settings for a run [can be](https://prettyleaf.github.io/OpenWrt-exodus/en/install/options/#variables) passed as environment variables before `ash`.

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | VERSION=v1.26.1 CORE=alpha ash
```

Installed packages can also be updated from LuCI: `Services → Exodus → Update`. It runs the same installer with the core and the gh-proxy chosen last time, another core is chosen there too: `Change Core` installs its latest build. On routers with little free flash enable the low flash space mode there, it removes the current core before installing the new one.

### Versions

Exodus has one version for all routers, the version of the [release](https://github.com/prettyleaf/openwrt-exodus/releases): the tag `v1.27.0` builds `exodus` and `luci-app-exodus` 1.27.0, the Keenetic and Asuswrt-Merlin branches show the same numbers. `mihomo-meta` has the version of the Mihomo core it packages. Before 1.27.0 `exodus` had versions by date (`2026.04.08`), the installer replaces them with the release one.

## Migrating from Nikki

Exodus is a fork of Nikki and takes its settings as they are, the migration is the install:

1. Run the installer from [Install & Update](#install--update). It removes `nikki`, `luci-app-nikki`, `luci-i18n-nikki-*` and the feed of Nikki, then installs Exodus in their place.
2. The settings in `/etc/config/nikki`, the mixin file, profiles and subscriptions in `/etc/nikki` are kept, the service starts with them. It is still `/etc/init.d/nikki`.
3. The pages move from `Services → Nikki` to `Services → Exodus`. Check the subscription and the devices on `App Config`: HWID headers are sent by default, they are turned off on `Profile` for a subscription that does not need them.

Going back: remove the packages with the package manager (`opkg remove luci-app-exodus exodus` or `apk del luci-app-exodus exodus`) and install Nikki by its instructions, the settings stay. `uninstall.sh` removes the settings too.

## Uninstall & Reset

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/uninstall.sh | ash
```

## How To Use

1. Open `Services → Exodus → Profile` in LuCI and add your subscription.
2. On `Services → Exodus → App Config` choose the subscription, enable the app and choose which devices go through the proxy.
3. Everything else is on the `Advanced` page. Do not change it unless you know what you are doing.

When the service is running, `Open Dashboard` next to `Restart Service` on the main page opens the dashboard. The core downloads it on the first start ([Zashboard](https://github.com/Zephyruso/zashboard) by default, see `Advanced → External Control Config`).

## How does it work

1. Mixin and Update profile.
2. Run mihomo.
3. Set scheduled restart.
4. Set ip rule/route
5. Generate nftables and apply it.

Note that the steps above may change base on config.

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
- [Prizrak-core](https://github.com/legiz-ru/Prizrak-Core/releases) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
- [@ApoisL](https://github.com/apoiston)
- [@xishang0128](https://github.com/xishang0128)
