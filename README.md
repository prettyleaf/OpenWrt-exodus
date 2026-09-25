![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

[Русский](README.RU.md) | English

# Exodus for Keenetic

Transparent proxy with [Mihomo](https://github.com/MetaCubeX/mihomo) for Keenetic / Netcraze routers with Entware. This is the `keenetic` branch of [Exodus](https://github.com/prettyleaf/openwrt-exodus), the OpenWrt version lives in `main`.

It borrows ideas from [XKeen](https://github.com/jameszeroX/XKeen)

## Requirements

- KeeneticOS 4.x or newer with the **OPKG** and **Netfilter subsystem kernel modules** components, and the IPv6 component for IPv6.
- [Entware](https://help.keenetic.com/hc/en-us/articles/360021214160) installed (USB drive or internal storage) and about 70 MB free: the Mihomo core is about 40 MB, yq about 15 MB.
- Architectures: `aarch64` (arm64), `mipsel` and `mips` (softfloat).
- XKeen must be stopped and removed from autostart, both intercept the traffic.

## Install & Update

In the SSH console of Entware:

```shell
opkg update && opkg install curl
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | sh
```

The installer installs Entware packages (`curl jq ipset iptables ip-full lighttpd lighttpd-mod-cgi ca-bundle`), checks access to GitHub, asks for the [core](#core) and the password of the web UI, downloads Mihomo and yq. At the end it prints the address of the web UI, `http://192.168.1.1:9099/` by default.

Options can be passed as environment variables before `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | CORE=alpha PASSWORD=secret sh
```

## How To Use

1. Open `http://<router address>:9099/` and log in. The web UI is in English and Russian, with light and dark themes.
2. **Profiles**: add a subscription or upload a profile. HWID headers for panels with a device limit (Remnawave) are sent by default, their values are shown on the same page.
3. **Status**: enable the service, choose the profile, choose the mode and the devices / Wi-Fi points / segments in the Devices section, then **Save & Apply**.
4. **Settings** holds only what makes sense to change on Keenetic: proxy modes, ports and exclusions, DSCP, a few Mihomo options, your own rules, the service. Everything else (DNS servers, hosts, sniffer, rule providers) goes to the profile or to the mixin file on the **Editor** page, it is merged into the profile on every start.

The **Dashboard** button opens Zashboard, the core downloads it on the first start.

## How It Works

1. The settings are merged into the profile, the subscription is updated.
2. Mihomo starts and is restarted if it crashes. The memory limit is set on Settings → Mihomo: `GOMEMLIMIT` is half of the RAM by default, the file limit is 40000 on arm64 and 10000 on mips.
3. When the core listens on its ports, the iptables and ipset rules and the TPROXY route are turned on.
4. NDM rebuilds iptables on many events. The rules are restored by the hook `/opt/etc/ndm/netfilter.d/50-exodus.sh`, and every 15 seconds they are checked by the watcher (`watch`), which also runs the scheduled restart and clears the logs over the size limit.

## Uninstall

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/uninstall.sh | sh
```

With `KEEP_CONFIG=1` the settings, profiles and subscriptions in `/opt/etc/exodus` are kept. Entware packages are not removed, other applications may use them.

## Command Line

```shell
exodus start | stop | restart | status
exodus update_subscription <id>
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
| `/opt/etc/exodus/profiles/`, `subscriptions/` | profiles and subscriptions |
| `/opt/etc/exodus/run/` | working directory of the core: profile for startup, providers, dashboard |
| `/opt/share/exodus/` | scripts and the web UI |
| `/opt/libexec/exodus/` | `mihomo` and `yq` |
| `/tmp/exodus/log/` | logs of the app, the core and the update |

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) for the research of Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
