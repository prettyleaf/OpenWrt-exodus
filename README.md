![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

[Русский](README.RU.md) | English
[Documentation](https://prettyleaf.github.io/OpenWrt-exodus/en/install/asuswrt/)

# Exodus for Asuswrt-Merlin

Proxy with [Mihomo](https://github.com/MetaCubeX/mihomo) for Asus routers with [Asuswrt-Merlin](https://www.asuswrt-merlin.net/) and Entware. This is the `asuswrt` branch of [Exodus](https://github.com/prettyleaf/openwrt-exodus): the OpenWrt version lives in `main`, the Keenetic one in `keenetic`.

It borrows ideas from [XKeen](https://github.com/jameszeroX/XKeen).

## Requirements

- Asuswrt-Merlin on a Broadcom model: **384.15 or newer** on the `3004` family, or **3006.102.1 or newer** on the `3006` family, with Addons API (`am_addons`), `/usr/sbin/helper.sh` and writable `/jffs/addons`.
- Architectures: `arm64` (RT-AX86U, RT-AX88U, GT-AX6000 and other HND models) and `armv7` (RT-AX58U, RT-AC68U and others). Models without an FPU, like RT-AC68U, get the `armv5` build of the core.
- Entware on a USB drive, installed with [amtm](https://github.com/decoderman/amtm) (`amtm` → `ep`), and about 70 MB free on it: the Mihomo core is about 40 MB, yq about 15 MB.
- Other transparent proxies (XRAYUI and similar addons) must be stopped and removed from autostart, they intercept the same traffic.
- UDP through the proxy needs the TPROXY module of the firmware. Without it UDP goes directly, the app log tells about it.

### Before the installation

1. **SSH.** Administration → System → Enable SSH: LAN only.
2. **Entware.** Run `amtm` in the SSH console and install Entware (`ep`) on a USB drive formatted as ext4.
3. **JFFS custom scripts and configs** (Administration → System) must be on. The installer turns it on when it is off.

## Install & Update

In the SSH console of the router:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/install.sh | sh
```

At the end it prints the address of the Exodus page in the router's Web Admin. Sign in to the router and open **VPN → Exodus**. Exodus uses the native router interface and administrator session; requests are handled through Merlin's Addons API.

Options can be passed as environment variables before `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/install.sh | CORE=alpha sh
```

| Variable | Meaning |
| --- | --- |
| `CORE` | `meta` (stable Mihomo), `alpha` (Mihomo Alpha) or `prizrak` ([Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core)), asked otherwise |
| `GH_PROXY` | download from GitHub through [gh-proxy](https://github.com/prettyleaf/gh-proxy): `https://example.com/ghproxy/TOKEN` |
| `LOW_SPACE=1` | remove the current core before writing the new one |
| `REF` | another branch or tag |

### Versions

Exodus has one version for all routers, the version of the [releases](https://github.com/prettyleaf/openwrt-exodus/releases) of the project: it is in `/opt/share/exodus/VERSION`, on the **Updates** page and in the build info. The **Updates** page offers an update when the code of the `asuswrt` branch changes, a change of the readme does not count.

## Migrating from Another Proxy

Two transparent proxies can not intercept the same traffic.

1. Stop the other addon (XRAYUI, a Clash or sing-box addon) and turn off its autostart, or remove it by its instructions.
2. Install Exodus, see [Install & Update](#install--update).
3. **Profiles**: add the subscription of your provider. A Mihomo (Clash Meta) config of the other addon can be uploaded as a profile as it is: Exodus sets its ports, the DNS listener, the API and the dashboard over it, TUN of the profile is turned off. An Xray config does not fit, Exodus needs a subscription or a config for Mihomo.
4. **Devices**: choose the devices that go through the proxy, then **Save & Apply**.

## How To Use

1. Sign in to the router's Web Admin and open **VPN → Exodus**. The interface follows Merlin's styling and uses Russian when the router language is Russian, otherwise English.
2. **Profiles**: add a subscription or upload a profile.
3. **Devices**: turn on **Autostart**, choose the profile, choose the mode and the devices / Wi-Fi networks / segments, then **Save & Apply**. Device names come from the client list of the router, DHCP and its network map.
4. **Settings** holds only what makes sense to change on the router: proxy modes, ports and exclusions, DSCP, a few Mihomo options, your own rules, the service. Everything else (DNS servers, hosts, sniffer, rule providers) goes to the profile or to the mixin file on the **Editor** page, it is merged into the profile on every start.

The **Dashboard** button opens Zashboard, the core downloads it on the first start.

## How It Works

1. The settings are merged into the profile; a subscription is downloaded when its interval passed. `router.asus.com` resolves to the router, names of the local domain are asked from the router.
2. Mihomo starts and is restarted if it crashes. The memory limit is set on Settings → Mihomo: `GOMEMLIMIT` is half of the RAM by default, the file limit is 40000 on arm64 and 10000 on other models.
3. When the core listens on its ports, the iptables and ipset rules and the TPROXY route are turned on. They use iptables and ipset of the firmware, they match its kernel.
4. The firmware restores its iptables tables without the rules of addons on every restart of the firewall: a reconnect of the WAN, a change in the web interface. The rules are restored by a line in `/jffs/scripts/firewall-start` and `/jffs/scripts/nat-start`, and every 15 seconds they are checked by the watcher (`watch`), which also syncs the clients of the chosen Wi-Fi networks, updates the subscription, runs the scheduled restart and clears the logs over the size limit.
5. The proxied traffic goes to the router itself, past the filtering of forwarded traffic. With **Respect parental control** on, it is checked by the parental control chain of the firmware (`PControls`), so blocked devices and time scheduling apply to it too.
6. `/jffs/scripts/unmount` stops the proxy before its USB drive is unmounted: the rules must not stay without the core.

## Uninstall

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/uninstall.sh | sh
```

The lines of Exodus are removed from `/jffs/scripts`, the lines of other addons are kept. With `KEEP_CONFIG=1` the settings, profiles and subscriptions in `/opt/etc/exodus` are kept. Entware packages are not removed, other applications may use them.

## Command Line

```shell
exodus start | stop | restart | status
exodus update_subscription <id>   # download a subscription, the running core gets it when it is in use
exodus hard_update     # remove downloaded providers, update the subscription and restart
exodus debug           # report for an issue, server addresses and passwords are hidden
exodus web restart     # restore the native Exodus page and refresh its cache
exodus passwd          # shows where to change the router administrator password
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
| `/opt/etc/init.d/S99exodus` | start with Entware |
| `/jffs/scripts/firewall-start`, `nat-start`, `unmount`, `services-start`, `service-event` | one line marked `# exodus` in each |
| `/jffs/addons/exodus/` | native Web Admin page and boot recovery script |
| `/tmp/exodus/run/webui/` | RAM caches and Addons API request/response files |
| `/tmp/exodus/log/` | logs of the app, the core and the update |

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) for the transparent proxy on iptables and the DSCP marks
- [Asuswrt-Merlin](https://github.com/RMerl/asuswrt-merlin.ng) for the user scripts and [amtm](https://github.com/decoderman/amtm) for Entware
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
