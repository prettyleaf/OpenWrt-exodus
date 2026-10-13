![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

[Русский](README.RU.md) | English

# Exodus for MikroTik

Proxy with [Mihomo](https://github.com/MetaCubeX/mihomo) for MikroTik routers, in a container of RouterOS. This is the `mikrotik` branch of [Exodus](https://github.com/prettyleaf/openwrt-exodus): the same web UI, the same profiles, subscriptions and Zashboard as on Keenetic, the OpenWrt version lives in `main`.

## How It Works

The container holds the Mihomo core, the web UI and the dashboard. RouterOS sends it the traffic of the chosen devices, the container keeps the rules of the router itself through the REST API:

1. **mangle prerouting**: TCP and UDP of the chosen devices get the routing mark `exodus`, the routing table `exodus` leads to the container. The router itself, local and reserved networks stay direct.
2. **nat dstnat**: DNS of the chosen devices goes to the core (Fake-IP and the rules by domain need it).
3. **filter forward**: two `accept` rules before fasttrack, a fasttracked connection would skip the routing mark.
4. Inside the container nftables takes the traffic to the TPROXY port of the core (Redirect for TCP is an option).
5. The rules are checked every 30 seconds and applied again when they are missing, changed or turned off. When the container does not answer, the route `check-gateway=ping` becomes inactive and **netwatch** turns the rules off: the devices go directly, without a proxy, until the container is back.

Every rule of the container has a comment starting with `exodus:`, the installer marks its part with `exodus setup`.

## Requirements

- RouterOS **7.20** or newer: its containers have nftables with TPROXY.
- Architectures: `arm64`, `arm` (armv7) and `x86` (CHR included). MIPS and SMIPS routers have no containers.
- The `container` package and the container device mode, see below.
- A disk for the container formatted as **ext4** (USB, NVMe, SATA): the image takes about 100 MB. The internal flash works on routers with enough of it, but wears out.
- About 100 MB of free RAM for the core.
- The REST API over the `www` (HTTP) or `www-ssl` service. The installer turns `www` on for the container only if both are off. The traffic between the router and the container does not leave the router.

### Before the installation

**1. The container package.** Download *Extra packages* of your version and architecture from [mikrotik.com/download](https://mikrotik.com/download), upload `container-*.npk` to **Files** and reboot. Check: `/system package print`.

**2. The device mode.** Run in the terminal and confirm it with the reset button (or a power cycle) within 5 minutes:

```routeros
/system/device-mode/update container=yes
```

**3. The disk.** Format it as ext4 in **System → Disks**.

## Install & Update

In the terminal of the router (WinBox → New Terminal, or SSH):

```routeros
/tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/install.rsc" dst-path=exodus-install.rsc; /import exodus-install.rsc
```

The installer:

- creates the veth `veth-exodus` (`172.31.255.2/30` for the container, `172.31.255.1` for the router), NAT for the container and an `input` rule for it;
- creates the routing table `exodus`, the user and the group `exodus` for the REST API (it logs in only from the container);
- sets `registry-url` of `/container/config` to `https://ghcr.io` and pulls `prettyleaf/exodus-mikrotik:latest`;
- creates the container with the mount `<disk>/exodus/data` → `/opt/etc/exodus` and starts it, autostart with the router is on.

At the end it prints the password of the web UI. The web UI is at `http://<router address>:9099/` (the container forwards the port from the addresses of the router on the interface list `LAN`) and at `http://172.31.255.2:9099/`.

Options are global variables set before the import:

```routeros
:global exodusDisk "usb1"; :global exodusPassword "secret"; /import exodus-install.rsc
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `exodusDisk` | the first ext4 disk | the disk of the container: `usb1`, `nvme1`, `sata1` |
| `exodusPassword` | generated | the password of the web UI on the first install |
| `exodusLanList` | `LAN` | the interface list of the local network |
| `exodusNetwork` | `172.31.255` | the /30 network of the container |
| `exodusIPv6` | `no` | `yes` gives the container `fd65:786f:6475::2/64` and NAT66 for it, IPv6 is proxied then |
| `exodusImage` | `prettyleaf/exodus-mikrotik:latest` | the image on ghcr.io |
| `exodusFile` | — | an image file on the router instead of the registry, `github` downloads `exodus-mikrotik-<arch>.tar` of the [mikrotik-image](https://github.com/prettyleaf/openwrt-exodus/releases/tag/mikrotik-image) release |
| `exodusGhProxy` | — | [gh-proxy](https://github.com/prettyleaf/gh-proxy) for GitHub: the image file and the updates inside the container |

### Updates

- **The code of Exodus and the core** are updated on the **Updates** page of the web UI, inside the running container, like on Keenetic. The version of Exodus is the version of the [releases](https://github.com/prettyleaf/openwrt-exodus/releases), the same on every router; an update is offered when the code of the `mikrotik` branch changes.
- **The image** (Alpine and its packages) is updated by the installer: run it again. It recreates the container from the new image, settings, profiles and subscriptions in `<disk>/exodus/data` are kept.

The core is changed in the shell of the container:

```routeros
/container shell exodus cmd="sh /opt/share/exodus/install.sh"
```

### Without access to ghcr.io

Download the image file through gh-proxy and install from it:

```routeros
:global exodusFile "github"; :global exodusGhProxy "https://example.com/ghproxy/TOKEN"; /import exodus-install.rsc
```

## How To Use

1. Open the web UI and log in. It is in English and Russian, with light and dark themes.
2. **Settings → RouterOS**: check the connection. The installer passes the REST API user in `/container/envs`, the container writes it to its settings on every start.
3. **Profiles**: add a subscription or upload a profile.
4. **Status**: turn on **Autostart**, choose the profile, the mode and the devices: segments (interfaces with an address: bridges, VLANs), Wi-Fi points (wifi, wireless and CAPsMAN interfaces) and devices from the DHCP leases and ARP. Then **Save & Apply**.
5. **Settings** holds proxy modes, ports and exclusions, DSCP, a few Mihomo options, your own rules, the service. Everything else goes to the profile or to the mixin file on the **Editor** page.

The **Dashboard** button opens Zashboard, the core downloads it on the first start.

### Notes

- Proxied packets stop in `mangle prerouting` at the rules of Exodus (`passthrough=no`), later mangle rules of prerouting do not see them.
- The `forward` chain of the router still applies to new proxied connections. A strict `forward` chain that drops everything except the WAN needs an `accept` for `out-interface=veth-exodus`.
- `router.lan` and other `.lan` and `.home.arpa` names are resolved by the router, the DNS of the router has to allow remote requests (`/ip dns set allow-remote-requests=yes`, on in the default configuration).
- DSCP: 62 goes directly, 63 goes through the proxy from any device and port, 61 goes to one chosen proxy.

## Uninstall

```routeros
/tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/uninstall.rsc" dst-path=exodus-uninstall.rsc; /import exodus-uninstall.rsc
```

`:global exodusKeepData yes` before the import keeps `<disk>/exodus/data`. The `registry-url` and the `www` service are left as they are.

## Command Line

In the shell of the container, `/container shell exodus`:

```shell
exodus start | stop | restart | status
exodus routeros        # check the connection to the REST API of RouterOS
exodus apply           # apply the rules of the container and of RouterOS again
exodus update_subscription <id>   # download a subscription, the running core gets it when it is in use
exodus hard_update     # remove downloaded providers, update the subscription and restart
exodus debug           # report for an issue, server addresses and passwords are hidden
exodus web restart     # restart the web UI
exodus passwd          # change the password of the web UI
```

Logs of the container in RouterOS: `/log print where topics~"container"`.

## Files

| Path in the container | Purpose |
| --- | --- |
| `/opt/etc/exodus/` | the mount `<disk>/exodus/data`: settings, profiles, subscriptions, the mixin file |
| `/opt/etc/exodus/config.json` | settings |
| `/opt/etc/exodus/run/` | working directory of the core: profile for startup, providers, dashboard |
| `/opt/share/exodus/` | scripts and the web UI |
| `/opt/libexec/exodus/` | `mihomo` and `yq` |
| `/tmp/exodus/log/` | logs of the app, the core and the update |

## Special Thanks

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) and its [contributors](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) for the research of Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) and its [contributors](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
