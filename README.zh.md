![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Tag](https://img.shields.io/github/v/release/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/prettyleaf/openwrt-exodus/total?style=for-the-badge&logo=github)

中文 | [English](README.md)

# Exodus

在 OpenWrt 上使用 Mihomo 进行透明代理。[OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) 的分支。

## 环境要求

- OpenWrt >= 24.10
- Linux Kernel >= 5.13
- firewall4

## 功能

- 透明代理 (Redirect/TPROXY/TUN, IPv4 和/或 IPv6)，默认 TCP Redirect + UDP TPROXY
- 官方 Mihomo 内核：`mihomo-meta` 打包 [MetaCubeX 发行版](https://github.com/MetaCubeX/mihomo/releases) 中的预编译二进制文件，并校验 sha256
- 按设备选择代理：代理除所选设备外的所有设备，或仅代理所选设备
- 订阅 HWID 请求头（Remnawave HWID 设备限制），默认启用
- 配置文件混入
- 配置文件编辑器
- 定时重启

## 安装和更新

直接从 [GitHub Releases](https://github.com/prettyleaf/openwrt-exodus/releases) 下载适合路由器架构和 OpenWrt 版本的软件包并在本地安装，依赖从 OpenWrt 官方软件源安装。再次运行同一命令即可更新。

软件包为 `exodus`、`luci-app-exodus` 和 `luci-i18n-exodus-*`。如果已安装 `nikki` / `luci-app-nikki`，安装脚本会替换它们并保留配置、配置文件和订阅（两者共用，配置仍位于 `/etc/config/nikki`）。

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | ash
```

安装指定版本而不是最新版本：

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | VERSION=v1.26.1 ash
```

如果路由器无法访问 GitHub，请在其他设备上从发行版页面下载对应的 `exodus_<arch>-<branch>.tar.gz`，复制到路由器的 `/tmp` 并从中安装：

```shell
# <arch> 为 /etc/openwrt_release 中的 DISTRIB_ARCH，<branch> 为 openwrt-24.10、openwrt-25.12 或 SNAPSHOT
# 如果已安装 nikki，请先卸载（配置会保留）：opkg remove luci-app-nikki nikki / apk del luci-app-nikki nikki
mkdir -p /tmp/exodus && tar -x -z -f /tmp/exodus_<arch>-<branch>.tar.gz -C /tmp/exodus
# for opkg (OpenWrt 24.10)
opkg update && opkg install /tmp/exodus/mihomo-meta_*.ipk /tmp/exodus/exodus_*.ipk /tmp/exodus/luci-app-exodus_*.ipk
# for apk (OpenWrt 25.12 and SNAPSHOT)
apk update && apk add --allow-untrusted /tmp/exodus/mihomo-meta-[0-9]*.apk /tmp/exodus/exodus-[0-9]*.apk /tmp/exodus/luci-app-exodus-[0-9]*.apk
```

已安装的软件包也可以在 LuCI 中更新：`服务 → Exodus → 更新`。闪存空间较小的路由器请在该页面启用低空间模式，它会在安装新内核之前删除当前内核。

## Mihomo Alpha 内核

仅提供稳定版内核（`mihomo-meta`）。如需使用 Alpha 内核，请用 [MetaCubeX 发行版](https://github.com/MetaCubeX/mihomo/releases/tag/Prerelease-Alpha) 中的官方 Alpha 构建替换内核文件，命令和 `ASSET` 对照表见 [English README](README.md#mihomo-alpha-core)。

## 卸载并重置

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/uninstall.sh | ash
```

## 如何使用

1. 在 LuCI 中打开 `服务 → Exodus → 配置文件` 并添加订阅。
2. 在 `服务 → Exodus → 应用配置` 中选择订阅、启用应用，并选择哪些设备走代理。
3. 其他设置都在 `高级` 页面中，如果不清楚其作用请不要修改。

## 如何工作

1. 混入并更新配置文件。
2. 启动 Mihomo。
3. 设置定时重启。
4. 配置 IP 规则/路由。
5. 生成防火墙配置并应用。

注意上述步骤可能因配置而变动。

## 编译

```shell
# 添加源
echo "src-git exodus https://github.com/prettyleaf/openwrt-exodus.git;main" >> "feeds.conf.default"
# 更新并安装源
./scripts/feeds update -a
./scripts/feeds install -a
# 编译
make package/luci-app-exodus/compile
```

编译结果可以在`bin/packages/your_architecture/exodus`内找到。

## 依赖

- ca-bundle
- curl
- yq
- firewall4
- ip-full
- kmod-inet-diag
- kmod-nft-socket
- kmod-nft-tproxy
- kmod-tun
- kmod-dummy

## 贡献者

[![贡献者](https://contrib.rocks/image?repo=nikkinikki-org/OpenWrt-nikki)](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)

## 特别感谢

- [@ApoisL](https://github.com/apoiston)
- [@xishang0128](https://github.com/xishang0128)
