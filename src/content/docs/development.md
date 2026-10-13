---
title: Разработка
description: Релизы, версии, сборка пакетов OpenWrt и эта документация.
---

## Ветки

| Ветка | Что в ней |
| --- | --- |
| `main` | OpenWrt: пакеты `exodus`, `luci-app-exodus`, `mihomo-meta` и установщик |
| `keenetic` | Keenetic / Netcraze: Entware-версия и её установщик |
| `asuswrt` | Asuswrt-Merlin: Entware-версия и её установщик |
| `mikrotik` | MikroTik: контейнер RouterOS, его образ, `install.rsc` и `uninstall.rsc` |
| `docs` | эта документация (Astro Starlight) |

## Релизы и версии

Релиз — это тег `vMAJOR.MINOR.PATCH` (например, `v1.27.0`). Workflow `release-packages` записывает версию тега в `exodus` и `luci-app-exodus`, собирает пакеты для всех поддерживаемых архитектур и прикладывает к релизу `exodus_<arch>-<branch>.tar.gz` — их и скачивает установщик. Тег другого вида роняет релиз.

| Роутер | Где версия |
| --- | --- |
| OpenWrt | тег: `v1.27.0` собирает `exodus` и `luci-app-exodus` 1.27.0-r1; `PKG_VERSION` в их Makefile — для локальных сборок |
| Keenetic / Netcraze | `keenetic/opt/share/exodus/VERSION` в ветке `keenetic` |
| Asus / Asuswrt-Merlin | `asuswrt/opt/share/exodus/VERSION` в ветке `asuswrt` |
| MikroTik | `mikrotik/opt/share/exodus/VERSION` в ветке `mikrotik` |

Ветки Keenetic, Asuswrt-Merlin и MikroTik ставятся прямо из ветки, их версия поднимается вместе с кодом; CI проверяет, что она вида `MAJOR.MINOR.PATCH`. Workflow `image` ветки `mikrotik` собирает образ `ghcr.io/prettyleaf/exodus-mikrotik` (arm64, armv7, amd64) при каждом изменении кода и раз в неделю, файлы образа лежат в pre-release `mikrotik-image`. `mihomo-meta` имеет версию упакованного ядра Mihomo.

До 1.27.0 у `exodus` были версии-даты (`2026.04.08`), для пакетных менеджеров они выше 1.27.0: установщик ставит пакеты релиза с `opkg install --force-downgrade`, `apk add` ставит переданные файлы как есть.

Ядро Mihomo не компилируется: `mihomo-meta` скачивает официальный бинарник под целевую архитектуру и проверяет его sha256. Workflow `dependabot` ежедневно проверяет релизы MetaCubeX и открывает pull request с новой версией и хешами в `mihomo-meta/Makefile`.

## Сборка из исходников

Для архитектур без готовых пакетов — в дереве OpenWrt SDK или buildroot:

```shell
# добавить фид
echo "src-git exodus https://github.com/prettyleaf/openwrt-exodus.git;main" >> "feeds.conf.default"
# обновить и установить фиды
./scripts/feeds update -a
./scripts/feeds install -a
# собрать пакет
make package/luci-app-exodus/compile
```

Пакеты появятся в `bin/packages/<архитектура>/exodus`.

Зависимости `exodus`: `ca-bundle`, `curl`, `yq`, `firewall4`, `ip-full`, `kmod-inet-diag`, `kmod-nft-socket`, `kmod-nft-tproxy`, `kmod-tun`, `kmod-dummy`.

## Документация

Сайт собирается из ветки `docs` и публикуется на GitHub Pages workflow `deploy` при каждом push в неё.

```shell
git switch docs
npm install
npm run dev      # http://localhost:4321/OpenWrt-exodus/
npm run build    # сборка в ./dist
```

Русский — язык по умолчанию (`src/content/docs/`), английский — в `src/content/docs/en/`. Ссылки внутри доки пишутся от корня без базы: `/install/openwrt/`, `/en/install/openwrt/`.
