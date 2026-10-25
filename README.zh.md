![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Tag](https://img.shields.io/github/v/release/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/prettyleaf/openwrt-exodus/total?style=for-the-badge&logo=github)

中文 | [English](README.md)
[文档 (English / Русский)](https://prettyleaf.github.io/OpenWrt-exodus/en/)

> [!CAUTION]
> Exodus 是一个纯粹出于娱乐目的而开发的项目，无意“盖过其他项目”或贬低其他项目。本项目按“原样”提供；只要反馈和关于漏洞及/或错误的报告以适当方式提出，并且理解本声明的内容，我们将予以倾听。本项目从未且永远不会成为“付费使用”的服务。请将本项目用于教育目的，并充分意识到所有可能的风险。

# Exodus

在 OpenWrt 上使用 Mihomo 进行透明代理。[OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) 的分支。

其他路由器有各自的分支：[Keenetic / Netcraze](https://github.com/prettyleaf/openwrt-exodus/tree/keenetic)（基于 Entware，替代 XKeen）和 [运行 Asuswrt-Merlin 的华硕路由器](https://github.com/prettyleaf/openwrt-exodus/tree/asuswrt)（基于 Entware）。

## 环境要求

- OpenWrt >= 24.10
- Linux Kernel >= 5.13
- firewall4

## 功能

- 透明代理 (Redirect/TPROXY/TUN, IPv4 和/或 IPv6)，默认 TCP Redirect + UDP TPROXY
- 官方 Mihomo 内核：`mihomo-meta` 打包 [MetaCubeX 发行版](https://github.com/MetaCubeX/mihomo/releases) 中的预编译二进制文件，并校验 sha256
- 在安装脚本和更新页面中选择内核：[Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core)、稳定版 Mihomo Meta 或 Mihomo Alpha
- 运营商屏蔽 GitHub 时，可通过自建的 [gh-proxy](https://github.com/prettyleaf/gh-proxy) 安装
- 按设备选择代理：代理除所选设备外的所有设备，或仅代理所选设备
- 订阅 HWID 请求头，默认启用
- 订阅提供商的响应头：`profile-title` 作为订阅名称，`announce` 和 `support-url` 显示在状态页，`profile-logo` 显示在订阅旁
- 按提供商的 `profile-update-interval` 或自定义间隔自动更新订阅，正在使用的订阅通过重载服务生效
- 配置文件混入
- 配置文件编辑器
- 定时重启

## 安装和更新

软件包为 `exodus`、`luci-app-exodus` 和 `luci-i18n-exodus-*`。如果已安装 `nikki` / `luci-app-nikki`，安装脚本会替换它们并保留配置、配置文件和订阅（两者共用，配置仍位于 `/etc/config/nikki`）。

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | ash
```

安装脚本首先检查路由器能否从 GitHub 下载，然后询问要安装哪个[内核](https://prettyleaf.github.io/OpenWrt-exodus/en/install/options/#core)。运行参数[可以](https://prettyleaf.github.io/OpenWrt-exodus/en/install/options/#variables)以环境变量的形式写在 `ash` 之前。

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | VERSION=v1.26.1 CORE=alpha ash
```

已安装的软件包也可以在 LuCI 中更新：`服务 → Exodus → 更新`。该页面使用上次选择的内核和 gh-proxy 运行同一个安装脚本，也可以在该页面选择其他内核：`Change Core` 会安装它的最新版本。闪存空间较小的路由器请在该页面启用低空间模式，它会在安装新内核之前删除当前内核。

### 版本

Exodus 所有路由器使用同一个版本号，即[发行版](https://github.com/prettyleaf/openwrt-exodus/releases)的版本：标签 `v1.27.0` 构建出 `exodus` 和 `luci-app-exodus` 1.27.0，Keenetic 和 Asuswrt-Merlin 分支显示相同的版本号。`mihomo-meta` 的版本是其打包的 Mihomo 内核版本。1.27.0 之前 `exodus` 使用日期作为版本（`2026.04.08`），安装脚本会将其替换为发行版的版本。

## 从 Nikki 迁移

Exodus 是 Nikki 的分支，直接沿用其设置，迁移即安装：

1. 运行[安装和更新](#安装和更新)中的安装脚本。它会删除 `nikki`、`luci-app-nikki`、`luci-i18n-nikki-*` 以及 Nikki 的软件源，然后安装 Exodus。
2. `/etc/config/nikki` 中的设置、`/etc/nikki` 中的混入文件、配置文件和订阅都会保留，服务使用它们启动，服务仍为 `/etc/init.d/nikki`。
3. 页面从 `服务 → Nikki` 移到 `服务 → Exodus`。请在 `应用配置` 中检查订阅和设备：默认发送 HWID 请求头，不需要的订阅可以在 `配置文件` 中关闭。

回退：使用包管理器删除软件包（`opkg remove luci-app-exodus exodus` 或 `apk del luci-app-exodus exodus`），再按 Nikki 的说明安装 Nikki，设置会保留。`uninstall.sh` 会同时删除设置。

## 卸载并重置

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/uninstall.sh | ash
```

## 如何使用

1. 在 LuCI 中打开 `服务 → Exodus → 配置文件` 并添加订阅。
2. 在 `服务 → Exodus → 应用配置` 中选择订阅、启用应用，并选择哪些设备走代理。
3. 其他设置都在 `高级` 页面中，如果不清楚其作用请不要修改。

服务运行时，主页面上 `重启服务` 旁边的 `打开面板` 按钮可以打开面板。内核会在首次启动时下载面板（默认为 [Zashboard](https://github.com/Zephyruso/zashboard)，见 `高级 → 外部控制配置`）。

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

## 特别感谢

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) 及其[贡献者](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [Prizrak-core](https://github.com/legiz-ru/Prizrak-Core/releases) 及其[贡献者](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
- [@ApoisL](https://github.com/apoiston)
- [@xishang0128](https://github.com/xishang0128)
