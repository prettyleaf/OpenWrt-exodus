---
title: Subscriptions and profiles
description: Subscriptions, provider headers and HWID — the same on every platform.
---

A profile is a Mihomo config: a subscription (downloaded by its URL) or an uploaded file. On every start the profile is merged with the settings of Exodus and the mixin file, the result is the profile for startup. How to change the profile over the subscription — on the [Overrides](/en/usage/overrides/) page.

## The profile in use

- A new install has the placeholder subscription `default` (`http://example.com/default.yaml`) as the profile. A subscription added or edited on the Profile page, or an uploaded file, becomes the profile by itself when the chosen one cannot start: none is chosen, it was removed, or it is the placeholder. A profile that works is not replaced, another one is chosen by hand. Since 1.31.1.
- The change is saved like the other settings: Save & Apply on the Profile page of LuCI, the save bar on Keenetic, MikroTik and Asus.
- The power button saves a profile chosen in the list and not saved yet before the start. Without a profile to start it says `No profile to start` and does not start the service.

## Subscription fields

| Field | What it sets |
| --- | --- |
| Name | replaced with the title of the provider (`profile-title`) when it sends one |
| URL | the subscription link |
| Info URL | only when traffic and expiry come from another address |
| User agent | `Mihomo/Exodus v{version}` by default, `{version}` is replaced with the version of Exodus |
| Update interval, hours | empty — the interval of the provider (`profile-update-interval`), otherwise every hour; `0` — only by the Update button |
| Send HWID | the [HWID](#hwid) headers, on by default |

- The saved subscription file is used until its interval passes: the start does not wait for the provider.
- The running core gets a changed subscription without a restart (on OpenWrt by reloading the service), connections and chosen proxies are kept. A subscription that fails the check is not applied.
- **Hard update** removes everything downloaded by the rule and proxy providers of the current profile, downloads the subscription again and restarts the service. Files of local providers are kept.

## Provider headers

| Header | What Exodus shows |
| --- | --- |
| `profile-title` | the name of the subscription |
| `announce` | the announce block on the status page |
| `profile-logo` | the logo next to the subscription and in the announce |
| `support-url` | the Support button |
| `subscription-userinfo` | traffic and expiry |
| `profile-update-interval` | the update interval, unless it is set by hand |
| `global-mode` | `false` hides the rule / global / direct mode switch of MIBoard in the Dashboard tab (Keenetic, MikroTik) and on the Dashboard page of LuCI: the mode comes from the profile. Remnawave, for example, sends it |

## HWID

Panels with a device limit (Remnawave, for example) tell the router from other devices by the `x-hwid`, `x-device-os`, `x-ver-os` and `x-device-model` headers. Exodus sends them by default, turn off Send HWID for a subscription that does not need them.

`x-hwid` is made from the model and the MAC of the router (on MikroTik from its serial number) and stays the same after a reinstall or a reset of the settings. It can not be changed in the UI: with another HWID the panel would count the router as a new device. The other headers are read from the firmware. Where to see the values: Settings → Service → HWID on Keenetic, Asus and MikroTik, Advanced → Proxy Config → Misc on OpenWrt.
