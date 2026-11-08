---
title: LuCI (OpenWrt)
description: The pages of Exodus in LuCI on OpenWrt.
---

On OpenWrt Exodus is set up in LuCI: **Services → Exodus**. Two pages are enough to get it working — Profile and App Config.

## App Config

- The announce of the provider of the subscription is shown on top, in the middle.
- **Service**: the versions of the app and the core, the profile and the state of the proxy on the left, the profile, the power button, Autostart and Open Dashboard on the right.
  - **Profile** — a subscription or an uploaded file, saved with Save & Apply.
  - **The power button** shows the state: Turned off, Turning on…, Turned on. A press starts or stops the service at once and keeps it so in the config (the `enabled` flag), so a service turned off does not start after a reboot either. It replaced the Enable checkbox and the Restart Service button.
  - **Autostart** — start on boot, the same as `/etc/init.d/nikki enable` / `disable` and System → Startup. Applied at once.
- **Start Delay** — seconds to wait after the router boots.
- **Scheduled Restart** — by cron, `0 3 * * *` (every day at 3:00) by default.
- **Test Profile** — check the profile with the core before the start (on). If the check fails, the service does not start, the reason is in the core log.
- **Core Only** — run the core with the profile as it is: without the mixin and without the interception rules.
- **Devices**: the mode Exclude: proxy all devices except the selected ones (the default) or Include: proxy only the selected devices, and the devices themselves — by MAC or IP. The IP of a known device is saved as its MAC, so both IPv4 and IPv6 traffic of the device is matched; the IP of an unknown device matches only that address. The selection is stored in Advanced → LAN Proxy → Access Control.

## Profile

Subscriptions (name, subscription URL, subscription info URL, user agent, update interval, Send HWID), the Update and Hard Update buttons, uploading your own profiles. The fields are the same on every platform — see [Subscriptions and profiles](/en/usage/subscriptions/).

## Editor

Editing files: the file for mixin, the profile for startup, profiles, subscriptions, rule and proxy providers.

## Log

The app log and the core log, clearing at stop and scheduled clearing by size. **Debug Log → Generate & Download** builds a report for an issue.

## Update

Installed and latest versions of the packages and the core, free flash space. Update runs the [installer](/en/install/openwrt/#install--update) with the core and the gh-proxy chosen last time; settings, profiles and subscriptions are kept. The low flash space mode removes the current core before installing the new one.

## Advanced

:::caution
For experienced users. Wrong values can break the proxy or the internet access of the whole network.
:::

| Section | What is inside |
| --- | --- |
| **Proxy Config** | the interception switch; TCP and UDP modes (Redirect, TPROXY, TUN; TCP Redirect and UDP TPROXY by default); DNS hijack and proxy for IPv4 and IPv6 |
| ↳ Router Proxy | proxying the traffic of the router itself and its access control |
| ↳ LAN Proxy | inbound interfaces (`lan` by default) and access control — the device selection rules, matched from top to bottom |
| ↳ Bypass | TCP and UDP ports to proxy, bypass by DSCP and fwmark, bypass of China mainland IP |
| ↳ Misc | reserved IPv4 and IPv6 networks (go directly), TUN timeouts, [HWID](/en/usage/subscriptions/#hwid) and the headers sent to subscriptions |
| **Mixin Option** | what Exodus sets over the profile, see [Overrides](/en/usage/overrides/) |
| ↳ General Config | log level, mode, outbound interface, IPv6, TCP keep-alive |
| ↳ External Control Config | the dashboard (Zashboard by default) and its update, the API address and secret |
| ↳ Inbound Config | HTTP, SOCKS, mixed (7890), Redirect (7891) and TPROXY (7892) ports, authentication |
| ↳ TUN, DNS, Sniffer | TUN options; DNS (Fake-IP `198.18.0.1/16` and the `[::]:1053` listener by default), hosts, DNS servers and policies; the sniffer |
| ↳ Rule, GeoX | your own rules and rule providers over the profile; GeoIP/GeoSite databases and their auto update |
| ↳ Mixin File Content | Enable — apply the [mixin file](/en/usage/overrides/#mixin-file) (off by default), the file itself is edited on the Editor page |
| **Environment, procd, RLIMIT** | environment variables of the core, fast reload, process limits |
