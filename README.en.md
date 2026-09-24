![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

[Русский](README.md) | English

# Exodus for Keenetic

Transparent proxy with [Mihomo](https://github.com/MetaCubeX/mihomo) for Keenetic / Netcraze routers with Entware. This is the `keenetic` branch of [Exodus](https://github.com/prettyleaf/openwrt-exodus), the OpenWrt version lives in `main`.

It borrows ideas from [XKeen](https://github.com/jameszeroX/XKeen), but works differently:

- **No access policies.** The devices to proxy are chosen in its own web UI on a separate port (after the LuCI page of the OpenWrt version): "everyone except the selected" or "only the selected", and the choice can be devices, **Wi-Fi access points** (2.4 / 5 GHz, guest) and whole **network segments**.
- **DNS goes to Mihomo, not to the DNS of the router**, whatever the Internet filter (AdGuard DNS, Cloudflare, NextDNS...), DNS profiles or the servers of the Internet page are. Requests of proxied devices are intercepted before the redirects of NDM, `opkg dns-override` is not needed.
- **DSCP marks like XKeen**: `61` forces the traffic through a chosen proxy bypassing the rules of the profile, `62` bypasses the proxy, `63` proxies even from excluded devices and on all ports. Works for Wi-Fi and wired clients alike.
- Parental control of the router is respected, blocked devices do not get internet through the core.

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

The installer installs Entware packages (`curl jq ipset iptables ip-full lighttpd lighttpd-mod-cgi ca-bundle`), checks access to GitHub, asks for the core and the password of the web UI, downloads Mihomo and yq and prints the address of the web UI, `http://192.168.1.1:9099/` by default.

Settings are passed as environment variables before `sh`: `CORE=meta|alpha|prizrak`, `GH_PROXY=https://example.com/ghproxy/TOKEN` ([gh-proxy](https://github.com/prettyleaf/gh-proxy) when GitHub is blocked), `PASSWORD=...`, `LOW_SPACE=1`, `REF=<branch or tag>`. The core and gh-proxy are remembered. Updates are done by the same script or on the **Updates** page of the web UI, settings, profiles and subscriptions are kept.

## How To Use

1. Open `http://<router address>:9099/` and log in.
2. **Profile**: add a subscription or upload a profile. HWID headers for panels with a device limit (Remnawave) are sent by default.
3. **Status**: enable the app, choose the profile, choose the mode and the devices / Wi-Fi points / segments, then **Save & Apply**.
4. Everything else is on the **Advanced** page.

Names of devices, Wi-Fi points and parental control are read from RCI of the router (`127.0.0.1:79`). **KeeneticOS 5.2 and newer** need an RCI access token: create it in the web interface of the router and enter it on Advanced → Keenetic.

DSCP marks are set by the devices, on Windows with QoS policies (`gpedit.msc` → Policy-based QoS), outside of a domain set `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\QoS` `"Do not use NLA"="1"` first. For mark 61 choose a proxy or a group of the profile on Advanced → DSCP / QoS, Exodus adds the listeners itself.

TCP goes through Redirect and UDP through TPROXY by default. TPROXY for TCP on Keenetic needs port 443 of the router free. TUN is not supported. Proxied traffic leaves from the router itself, so per-device speed limits of IntelliQoS do not apply to it, bypassed traffic keeps hardware acceleration and QoS.

## Uninstall

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/uninstall.sh | sh
```

`KEEP_CONFIG=1` keeps `/opt/etc/exodus`. Entware packages are kept.

## Command line

`exodus start|stop|restart|status`, `exodus update_subscription <id>`, `exodus hard_update`, `exodus debug`, `exodus web restart`, `exodus passwd`.

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) for the research of Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
