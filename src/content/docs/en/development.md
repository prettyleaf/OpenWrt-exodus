---
title: Development
description: Releases, versions, building the OpenWrt packages and this documentation.
---

## Branches

| Branch | What is in it |
| --- | --- |
| `main` | OpenWrt: the `exodus`, `luci-app-exodus`, `mihomo-meta` packages and the installer |
| `keenetic` | Keenetic / Netcraze: the Entware version and its installer |
| `asuswrt` | Asuswrt-Merlin: the Entware version and its installer |
| `mikrotik` | MikroTik: the container of RouterOS, its image, `install.rsc` and `uninstall.rsc` |
| `docs` | this documentation (Astro Starlight) |

## Releases and versions

A release is a tag `vMAJOR.MINOR.PATCH` (for example `v1.27.0`). The `release-packages` workflow writes the version of the tag into `exodus` and `luci-app-exodus`, builds the packages for every supported architecture and attaches `exodus_<arch>-<branch>.tar.gz` to the release, which is what the installer downloads. A tag of another form fails the release.

| Router | Where the version is |
| --- | --- |
| OpenWrt | the tag: `v1.27.0` builds `exodus` and `luci-app-exodus` 1.27.0-r1; `PKG_VERSION` in their Makefiles is for local builds |
| Keenetic / Netcraze | `keenetic/opt/share/exodus/VERSION` of the `keenetic` branch |
| Asus / Asuswrt-Merlin | `asuswrt/opt/share/exodus/VERSION` of the `asuswrt` branch |
| MikroTik | `mikrotik/opt/share/exodus/VERSION` of the `mikrotik` branch |

The Keenetic, Asuswrt-Merlin and MikroTik branches are installed from the branch itself, their version is raised together with their code; CI checks that it is `MAJOR.MINOR.PATCH`. The `image` workflow of the `mikrotik` branch builds the image `ghcr.io/prettyleaf/exodus-mikrotik` (arm64, armv7, amd64) on every change of the code and once a week, the image files are in the `mikrotik-image` pre-release. `mihomo-meta` has the version of the Mihomo core it packages.

Before 1.27.0 `exodus` had versions by date (`2026.04.08`), they are higher than 1.27.0 for the package managers: the installer installs the packages of the release with `opkg install --force-downgrade`, `apk add` installs the given files as they are.

The Mihomo core is not compiled: `mihomo-meta` downloads the official binary for the target architecture and checks its sha256. The `dependabot` workflow checks MetaCubeX releases daily and opens a pull request that bumps the version and the hashes in `mihomo-meta/Makefile`.

## Building from source

For architectures without prebuilt packages — in the OpenWrt SDK or buildroot:

```shell
# add the feed
echo "src-git exodus https://github.com/prettyleaf/openwrt-exodus.git;main" >> "feeds.conf.default"
# update and install the feeds
./scripts/feeds update -a
./scripts/feeds install -a
# build the package
make package/luci-app-exodus/compile
```

The packages are in `bin/packages/<architecture>/exodus`.

Dependencies of `exodus`: `ca-bundle`, `curl`, `yq`, `firewall4`, `ip-full`, `kmod-inet-diag`, `kmod-nft-socket`, `kmod-nft-tproxy`, `kmod-tun`, `kmod-dummy`.

## Documentation

The site is built from the `docs` branch and published to GitHub Pages by the `deploy` workflow on every push to it.

```shell
git switch docs
npm install
npm run dev      # http://localhost:4321/OpenWrt-exodus/
npm run build    # build into ./dist
```

Russian is the default language (`src/content/docs/`), English is in `src/content/docs/en/`. Links inside the docs are written from the root without the base: `/install/openwrt/`, `/en/install/openwrt/`.
