---
title: Settings
description: Every option of the Settings page of the web UI on Keenetic, Asus and MikroTik.
---

The **Settings** page holds only what makes sense to change on the router. Everything else (DNS servers, hosts, sniffer, rule providers) goes to the profile or to the [mixin file](/en/usage/overrides/#mixin-file). On changes a bar appears at the bottom: Save only saves, Save & Apply also restarts the service. On OpenWrt the similar options are on the [Advanced](/en/usage/luci/#advanced) page of LuCI.

## Proxy

| Option | Default | What it does |
| --- | --- | --- |
| Enable | on | intercept the traffic of the devices chosen on the Status page. When off, only the core runs: its proxy port and the dashboard |
| TCP | Redirect | Redirect works everywhere and is recommended. TPROXY for TCP needs port 443 of the router free on Keenetic, the TPROXY module of the firmware on Asus (without it TCP is redirected). On MikroTik TPROXY is the default, Redirect needs NAT of nftables in the kernel of RouterOS |
| UDP | TPROXY | for QUIC, games and calls. Needs the Kernel modules for Netfilter component on Keenetic or the TPROXY module on Asus, without it UDP goes directly. Empty — UDP is not proxied |
| DNS through the core | on | DNS queries of the proxied devices go to the core, whatever DNS the router uses. Required for Fake-IP and domain rules |
| Traffic of the router | off | proxy the connections of the router itself, for example of Entware applications. DNS of the router is not intercepted |
| Respect parental control | on | devices blocked in the router and schedules apply to the proxied traffic too, otherwise blocked devices would get internet through the core. Not on MikroTik: the `forward` chain of the router applies to proxied connections by itself |

### Ports and exclusions

| Option | Default | What it does |
| --- | --- | --- |
| TCP ports to proxy | all (`0-65535`) | ports and ranges separated by spaces, the other ports go directly. Presets: Web only (`80 443 8080 8443`), Common ports |
| UDP ports to proxy | all (`0-65535`) | the same for UDP. Preset QUIC only (`443 8443`) |
| Direct IPv4 networks | local and special networks | destinations that never go through the proxy |
| Direct IPv6 networks | local and special networks | the same for IPv6, used when IPv6 is on in the profile and the router has an IPv6 address |

## DSCP

A device can mark its traffic with DSCP to choose the route per application. The marks are the same as in XKeen.

| Option | Default | What it does |
| --- | --- | --- |
| Direct | 62 | traffic with these marks goes directly |
| Proxy | 63 | traffic with these marks goes through the proxy even from excluded devices and on any port |
| Mark of the chosen proxy | 61 | traffic with this mark goes to one proxy, past the rules of the profile |
| Chosen proxy | — | a group or a proxy of the running profile for the mark above. Exodus adds a separate listener for it to the profile itself. The list fills after the first start |

**How to mark traffic on Windows:** `gpedit.msc` → Computer Configuration → Windows Settings → Policy-based QoS → Create new policy: choose the DSCP value and the application. Outside of a domain set this in the registry first and reboot:

```
[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\QoS]
"Do not use NLA"="1"
```

## Mihomo

Options merged over the profile. Mode, DNS mode and IPv6 always come from the profile.

| Option | Default | What it does |
| --- | --- | --- |
| Log level | from profile | `silent`, `error`, `warning`, `info`, `debug` |
| Outbound interface | automatic | Linux name of the interface for the connections of the core: `ppp0`, `eth3`, `nwg0` and so on |
| Memory limit | half of RAM | `GOMEMLIMIT`, e.g. `128MiB`; `off` removes the limit. Without a limit the router may kill the core when memory runs out |
| Proxy port | from profile, otherwise 7890 | HTTP and SOCKS5 on one port, for devices and applications set up by hand |
| Authentication | on, user `exodus` | username and password on the proxy port |
| Panel | Zashboard | Zashboard, MetaCubeXD or YACD. Update downloads it again |
| API port | 9090 | port of the API of the core, the dashboard works through it |
| API secret | — | the dashboard and other applications connect to the core with it |

The open files limit of the core is 40000 on arm64 and 10000 on other models.

## Rules

Rules of Exodus are checked from top to bottom **before** the rules of the profile, the first matching rule wins. Put `REJECT` rules first, then `DIRECT`, then the proxy groups: a block or a direct exception is then not caught by a wider proxy rule.

**Target:** `DIRECT` goes directly, `REJECT` blocks (`REJECT-DROP` silently), or a group of the profile (hidden groups are not offered). A rule without a type, a target or a value is skipped.

| Type | Matches | Example |
| --- | --- | --- |
| `DOMAIN` | domain | `example.com` |
| `DOMAIN-SUFFIX` | domain and subdomains | `example.com` |
| `DOMAIN-KEYWORD` | domain keyword | `google` |
| `DOMAIN-WILDCARD` | domain by a pattern with `*` and `?` | `*.example.com` |
| `DOMAIN-REGEX` | domain by a regular expression | `^ads?\.` |
| `GEOSITE` | geosite category | `youtube` |
| `IP-CIDR`, `IP-CIDR6` | destination IPv4 / IPv6 network | `1.1.1.0/24` |
| `IP-ASN` | destination autonomous system | `13335` |
| `GEOIP` | geoip country | `ru` |
| `SRC-IP-CIDR` | source network, a device of the local network | `192.168.1.10/32` |
| `DST-PORT`, `SRC-PORT` | destination / source port | `443` |
| `NETWORK` | `tcp` or `udp` | `udp` |
| `RULE-SET` | rule provider of the profile | `my-rules` |
| `MATCH` | everything else | — |

**No resolve** is for rules by IP (`IP-CIDR`, `IP-ASN`, `GEOIP`): the domain is not resolved to check the rule, it matches only connections to an IP address. More — [rules in the Mihomo documentation](https://wiki.metacubex.one/en/config/rules/).

## RouterOS

MikroTik only. The connection of the container to the REST API of the router, more on the [MikroTik](/en/install/mikrotik/#connection-to-routeros) page.

| Option | Default | What it does |
| --- | --- | --- |
| REST API address | the gateway of the container over HTTP | the router as the container sees it, for example `http://172.31.255.1` |
| User, password | from the installer | the user `exodus`, the installer passes it in `/container/envs`, the container writes it here on every start |
| Interface list of the local network | `LAN` | only the traffic from these interfaces goes to the container, the web UI is forwarded from the addresses of the router on them. Empty: any interface but the container, without the forwarding |

Check asks the router at once and shows its name, model and RouterOS version, or the error.

## Service

| Option | Default | What it does |
| --- | --- | --- |
| Start delay, seconds | 0 | wait after the router boots, for example until the USB drive or the internet is ready |
| Scheduled restart | off | restart the service on a cron schedule: `minute hour day month weekday`. `0 3 * * *` is every day at 3:00 |
| Device ID (HWID) | automatic | made from the hardware of the router, it stays the same after a reinstall. The `x-device-os`, `x-ver-os`, `x-device-model` headers are shown next to it, see [HWID](/en/usage/subscriptions/#hwid) |
| Log size limit, MB | 1 | logs are kept in RAM, a log over the limit is cleared. Empty — no limit |
| Clear logs at stop | on | |
| Web UI: port | 9099 | the web UI moves to the new port after saving |
| Web UI: password | — | change the password, at least 4 characters. It can also be reset with `exodus passwd` over SSH |
