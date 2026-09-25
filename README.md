![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

[Русский](README.RU.md) | English

# Exodus for Keenetic

Proxy with [Mihomo](https://github.com/MetaCubeX/mihomo) for Keenetic / Netcraze routers with Entware. This is the `keenetic` branch of [Exodus](https://github.com/prettyleaf/openwrt-exodus), the OpenWrt version lives in `main`.

It borrows ideas from [XKeen](https://github.com/jameszeroX/XKeen).

## Requirements

- KeeneticOS 4.x or newer.
- Architectures: `aarch64` (arm64), `mipsel` and `mips` (softfloat).
- About 70 MB free on the Entware storage: the Mihomo core is about 40 MB, yq about 15 MB.
- XKeen must be stopped and removed from autostart, both intercept the traffic.

### Before the installation

**1. Components of KeeneticOS.** Install them in the web interface of the router (General settings → Component options), the router reboots.

| Component | Why |
| --- | --- |
| **Open Package support** (OPKG) | required, Entware runs on it |
| **Kernel modules for Netfilter** | required: TPROXY (UDP, and TCP in the TPROXY mode) and the DSCP marks |
| **IPv6 protocol** | for IPv6 through the proxy, always on in KeeneticOS 5 |
| USB drives and the **Ext** file system | when Entware is on a USB drive |

**2. Entware.** Install it by the [Keenetic guide](https://help.keenetic.com/hc/en-us/articles/360021214160) on a USB drive or on the internal storage of models that have one, and log in to its SSH console.

## Install & Update

In the SSH console of Entware:

```shell
opkg update && opkg install curl
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | sh
```

At the end it prints the address of the web UI, `http://192.168.1.1:9099/` by default.

Options can be passed as environment variables before `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | CORE=alpha PASSWORD=secret sh
```

## How To Use

1. Open `http://<router address>:9099/` and log in. The web UI is in English and Russian, with light and dark themes.
2. **Profiles**: add a subscription or upload a profile.
3. **Status**: enable the service, choose the profile, choose the mode and the devices / Wi-Fi points / segments in the Devices section, then **Save & Apply**.
4. **Settings** holds only what makes sense to change on Keenetic: proxy modes, ports and exclusions, DSCP, a few Mihomo options, your own rules, the service. Everything else (DNS servers, hosts, sniffer, rule providers) goes to the profile or to the mixin file on the **Editor** page, it is merged into the profile on every start.

The **Dashboard** button opens Zashboard, the core downloads it on the first start.

## How It Works

1. The settings are merged into the profile; a subscription is downloaded when its interval passed.
2. Mihomo starts and is restarted if it crashes. The memory limit is set on Settings → Mihomo: `GOMEMLIMIT` is half of the RAM by default, the file limit is 40000 on arm64 and 10000 on mips.
3. When the core listens on its ports, the iptables and ipset rules and the TPROXY route are turned on.
4. NDM rebuilds iptables on many events. The rules are restored by the hook `/opt/etc/ndm/netfilter.d/50-exodus.sh`, and every 15 seconds they are checked by the watcher (`watch`), which also updates the subscription, runs the scheduled restart and clears the logs over the size limit.

## Uninstall

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/uninstall.sh | sh
```

With `KEEP_CONFIG=1` the settings, profiles and subscriptions in `/opt/etc/exodus` are kept. Entware packages are not removed, other applications may use them.

## Command Line

```shell
exodus start | stop | restart | status
exodus update_subscription <id>   # download a subscription, the running core gets it when it is in use
exodus hard_update     # remove downloaded providers, update the subscription and restart
exodus debug           # report for an issue, server addresses and passwords are hidden
exodus web restart     # restart the web UI
exodus passwd          # change the password of the web UI
```

## Files

| Path | Purpose |
| --- | --- |
| `/opt/etc/exodus/config.json` | settings |
| `/opt/etc/exodus/mixin.yaml` | mixin file, merged into the profile on every start |
| `/opt/etc/exodus/profiles/` | uploaded profiles |
| `/opt/etc/exodus/subscriptions/` | subscriptions and what the provider told about them |
| `/opt/etc/exodus/run/` | working directory of the core: profile for startup, providers, dashboard |
| `/opt/share/exodus/` | scripts and the web UI |
| `/opt/libexec/exodus/` | `mihomo` and `yq` |
| `/tmp/exodus/log/` | logs of the app, the core and the update |

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) for the research of Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
