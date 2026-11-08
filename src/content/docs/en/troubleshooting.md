---
title: Troubleshooting
description: Common problems and what to do about them.
---

## The installer says GitHub is unreachable

`github.com is unreachable, but cdn.jsdelivr.net is reachable` — GitHub is blocked by the provider: install through [gh-proxy](/en/install/options/#if-github-is-blocked). If jsDelivr is unreachable too, check the internet connection and DNS of the router.

## Not enough space for the core

Run the installer with `LOW_SPACE=1` or enable the low flash space mode on the update page: the current core is removed before the new one is installed. The proxy does not work until the new core is installed.

## The installer on Keenetic stops because of XKeen

Exodus does not install while XKeen is running: `xkeen -stop` and `xkeen -auto off`, see [migrating from XKeen](/en/install/migration/#from-xkeen-keenetic).

## UDP goes directly

UDP is proxied through TPROXY. Keenetic needs the Kernel modules for Netfilter component, Asus needs the TPROXY module of the firmware; without it Exodus writes about it to its log.

## TPROXY for TCP does not work on Keenetic

It needs port 443 of the router free: move the web interface of the router to another port (Users and access) or keep TCP in the Redirect mode.

## A device does not go through the proxy

- Status → Devices: check the mode (All except selected or Only selected) and the selection, then Save & Apply.
- Settings → Proxy → Enable must be on, otherwise the device selection has no effect.
- Check TCP / UDP ports to proxy and the direct networks in Ports and exclusions.
- Domain rules need DNS through the core.
- On Asus clients of AiMesh nodes are not in Wi-Fi networks — choose the segment or the device itself.

## Devices have no names

The router did not give the list of devices (through RCI on Keenetic), so only the neighbours from its ARP table are shown. Devices can be added by hand: Add by address.

## The core crashes or the router kills it

Most likely memory runs out. Set the Memory limit on Settings → Mihomo, for example `128MiB`, or make the profile lighter (fewer rule providers).

## The service on OpenWrt does not start

With Test Profile on, the core checks the profile before the start: the reason of the failure is in the core log (Log).

## The web UI does not open or the password is forgotten

`exodus web restart` restarts the web UI, `exodus passwd` changes the password, `exodus passwd -d` removes it and the UI opens without a login (Keenetic and MikroTik). The port of the web UI is on Settings → Service (9099 by default).

## A subscription is not updated

The error is in the Exodus log. The interval `0` means updates only by the Update button. If the panel of the provider limits the number of devices, keep Send HWID on.

## How to report a problem

Build a report: Logs → Debug report (Keenetic, Asus), `exodus debug` over SSH or Log → Debug Log in LuCI. Server addresses, passwords and subscription links are hidden in it, but check it before you share it. Then open an [issue](https://github.com/prettyleaf/openwrt-exodus/issues/new/choose).
