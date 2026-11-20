![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Tag](https://img.shields.io/github/v/release/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github) ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/prettyleaf/openwrt-exodus/total?style=for-the-badge&logo=github)

Русский | [English](README.md)  
[Документация](https://prettyleaf.github.io/OpenWrt-exodus/)

> [!CAUTION]
> Exodus сделан _ради интереса_, без намерения «затмить другие проекты» или выставить их в плохом свете. Проект предоставляется «как есть»; мы выслушаем отзывы и сообщения об ошибках, если они изложены корректно и с пониманием этого предупреждения. Проект никогда не был и не будет платным сервисом. Используйте его в образовательных целях и с полным пониманием всех возможных рисков.

# Exodus

Прозрачный прокси на Mihomo для OpenWrt. Форк [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki).

У других роутеров свои ветки: [Keenetic / Netcraze](https://github.com/prettyleaf/openwrt-exodus/tree/keenetic) с Entware вместо XKeen, [MikroTik](https://github.com/prettyleaf/openwrt-exodus/tree/mikrotik) в контейнере RouterOS и [Asus с Asuswrt-Merlin](https://github.com/prettyleaf/openwrt-exodus/tree/asuswrt) с Entware.

## Требования

- OpenWrt >= 24.10
- Ядро Linux >= 5.13
- firewall4

## Возможности

- Прозрачный прокси (Redirect/TPROXY/TUN, IPv4 и/или IPv6), по умолчанию TCP Redirect + UDP TPROXY
- Ядро скачивает установщик из его релизов на GitHub под архитектуру роутера, пакетом оно не ставится: флеш занимает только выбранное ядро
- Выбор ядра в установщике и на странице обновлений: [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core), стабильный Mihomo Meta, Mihomo Alpha или Prizrak-Kroha — облегчённая сборка Prizrak-Core для роутеров с малым флешем (amd64, arm64, armv7, mips и mipsle; `prizrak-kroha-upx` — та же сборка, сжатая UPX)
- Установка, даже если GitHub не отвечает роутеру: через GitHub API, публичные зеркала `gh-proxy.com` и `ghfast.top` или свой [gh-proxy](https://github.com/prettyleaf/gh-proxy)
- Выбор устройств для прокси: проксировать всех, кроме выбранных, или только выбранные устройства
- Заголовки HWID для подписок, включены по умолчанию
- Заголовки провайдера подписки: `profile-title` задаёт название подписки, `announce` и `support-url` показываются на странице статуса, `profile-logo` — рядом с подпиской
- Автообновление подписки по `profile-update-interval` провайдера или своему интервалу, используемая подписка применяется перезагрузкой сервиса
- Mixin профиля
- Редактор профиля
- Перезапуск по расписанию

## Установка и обновление

Пакеты: `exodus`, `luci-app-exodus` и `luci-i18n-exodus-*`. Если установлены `nikki` / `luci-app-nikki`, установщик заменит их и сохранит настройки, профили и подписки (они общие, настройки остаются в `/etc/config/nikki`).

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | ash
```

Сначала установщик проверяет, может ли роутер скачивать с GitHub. Если GitHub напрямую не отвечает, он показывает причину и скачивает через GitHub API (`api.github.com`, если заблокирован только `github.com`), затем через публичные зеркала `gh-proxy.com` и `ghfast.top`, затем спрашивает адрес своего [gh-proxy](https://prettyleaf.github.io/OpenWrt-exodus/install/options/#если-github-заблокирован). Потом спрашивает, какое [ядро](https://prettyleaf.github.io/OpenWrt-exodus/install/options/#ядро) поставить. Настройки для запуска [можно передать](https://prettyleaf.github.io/OpenWrt-exodus/install/options/#переменные) переменными окружения перед `ash`.

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | VERSION=v1.30.7 CORE=alpha ash
```

`SUBSCRIPTION` сразу добавляет вашу подписку: установщик скачивает её, чтобы проверить ссылку, делает её профилем и в терминале предлагает сразу включить с ней Exodus. Ссылку возьмите в кавычки.

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/install.sh | SUBSCRIPTION='https://example.com/sub/TOKEN' ash
```

Установленные пакеты можно обновить и из LuCI: `Службы → Exodus → Обновить`. Там запускается тот же установщик с ядром и gh-proxy, выбранными в прошлый раз; там же выбирается другое ядро: `Сменить ядро` ставит его последнюю сборку. На роутерах с малым свободным флешем включите там режим «мало места»: он удаляет текущее ядро перед установкой нового.

### Версии

У Exodus одна версия для всех роутеров — версия [релиза](https://github.com/prettyleaf/openwrt-exodus/releases): тег `v1.27.0` собирает `exodus` и `luci-app-exodus` 1.27.0, ветки Keenetic, MikroTik и Asuswrt-Merlin показывают те же номера.

## Переход с Nikki

Exodus — форк Nikki и берёт его настройки как есть, переход — это установка:

1. Запустите установщик из раздела [Установка и обновление](#установка-и-обновление). Он удалит `nikki`, `luci-app-nikki`, `luci-i18n-nikki-*` и фид Nikki и поставит Exodus на их место.
2. Настройки в `/etc/config/nikki`, mixin-файл, профили и подписки в `/etc/nikki` сохраняются, сервис запускается с ними. Это по-прежнему `/etc/init.d/nikki`.
3. Страницы переезжают из `Службы → Nikki` в `Службы → Exodus`. Проверьте подписку и устройства в `Настройки приложения`: заголовки HWID отправляются по умолчанию, для подписки, которой они не нужны, они отключаются в `Профиль`.

Возврат: удалите пакеты менеджером пакетов (`opkg remove luci-app-exodus exodus` или `apk del luci-app-exodus exodus`) и поставьте Nikki по его инструкции, настройки останутся. `uninstall.sh` удаляет и настройки.

## Удаление и сброс

```shell
wget -O - https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/main/uninstall.sh | ash
```

## Как пользоваться

1. Откройте в LuCI `Службы → Exodus → Профиль` и добавьте подписку, если установщик не добавил её через `SUBSCRIPTION`.
2. В `Службы → Exodus → Настройки приложения` выберите подписку, включите приложение и выберите, какие устройства идут через прокси.
3. Всё остальное — на странице `Расширенные`. Не меняйте там ничего, если не уверены.

Когда сервис запущен, страница `Панель управления` в Exodus показывает панель, к ней ведёт `Открыть панель` на главной странице. Ядро скачивает панель при первом запуске (по умолчанию [MIBoard](https://github.com/blagodaren/miboard), другую можно выбрать в `Расширенные → Настройки внешнего управления`, ядро скачает её при следующем запуске).

## Как это работает

1. Mixin и обновление профиля.
2. Запуск mihomo.
3. Настройка перезапуска по расписанию.
4. Настройка ip rule/route.
5. Генерация и применение правил nftables.

Шаги выше могут меняться в зависимости от настроек.

## Сборка

```shell
# добавить фид
echo "src-git exodus https://github.com/prettyleaf/openwrt-exodus.git;main" >> "feeds.conf.default"
# обновить и установить фиды
./scripts/feeds update -a
./scripts/feeds install -a
# собрать пакет
make package/luci-app-exodus/compile
```

Пакеты появятся в `bin/packages/your_architecture/exodus`. Ядра в пакетах нет: его скачивает установщик, или соберите ещё `make package/mihomo-meta/compile` — он кладёт официальный бинарник Mihomo Meta в `/usr/libexec/mihomo`.

## Зависимости

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

## Благодарности

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) и его [участникам](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [Prizrak-core](https://github.com/legiz-ru/Prizrak-Core/releases) и его [участникам](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
- [@ApoisL](https://github.com/apoiston)
- [@xishang0128](https://github.com/xishang0128)
