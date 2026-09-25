![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

Русский | [English](README.md)

# Exodus для Keenetic

Прозрачный прокси на [Mihomo](https://github.com/MetaCubeX/mihomo) для роутеров Keenetic / Netcraze с Entware. Это ветка `keenetic` проекта [Exodus](https://github.com/prettyleaf/openwrt-exodus), версия для OpenWrt живёт в ветке `main`.

Идеи взяты из [XKeen](https://github.com/jameszeroX/XKeen).

## Требования

- KeeneticOS 4.x или новее. Компоненты роутера: **«Поддержка открытых пакетов» (OPKG)** и **«Модули ядра подсистемы Netfilter»**, для IPv6 — «Протокол IPv6».
- Установленный [Entware](https://help.keenetic.com/hc/ru/articles/360021214160) (USB-накопитель или встроенная память) и ~70 МБ свободного места: ядро Mihomo ~40 МБ, yq ~15 МБ.
- Архитектуры: `aarch64` (arm64), `mipsel` и `mips` (softfloat).
- XKeen должен быть остановлен и убран из автозапуска: оба перехватывают трафик.

## Установка и обновление

В SSH-консоли Entware:

```shell
opkg update && opkg install curl
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | sh
```

Установщик ставит пакеты Entware (`curl jq ipset iptables ip-full lighttpd lighttpd-mod-cgi ca-bundle`), проверяет доступ к GitHub, спрашивает ядро и пароль веб-интерфейса, скачивает Mihomo и yq. В конце он печатает адрес веб-интерфейса, по умолчанию `http://192.168.1.1:9099/`.

Параметры можно передать переменными окружения перед `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | CORE=alpha PASSWORD=secret sh
```

## Как пользоваться

1. Откройте `http://<адрес роутера>:9099/` и войдите. Веб-интерфейс на русском и английском, со светлой и тёмной темой.
2. **Профили**: добавьте подписку или загрузите файл профиля. Заголовки HWID для панелей с лимитом устройств отправляются по умолчанию, их значения видны в «Настройки» → «Сервис».
3. **Статус**: включите сервис, выберите профиль, в разделе «Устройства» выберите режим и устройства / точки Wi-Fi / сегменты, затем нажмите **«Сохранить и применить»**.
4. **Настройки**: только то, что имеет смысл менять на Keenetic, — режимы прокси, порты и исключения, DSCP, несколько параметров Mihomo, свои правила, сервис. Всё остальное (DNS-серверы, hosts, сниффер, провайдеры правил) задаётся в профиле или в mixin-файле на странице **«Редактор»**, он объединяется с профилем при каждом запуске.

Кнопка **«Панель»** открывает Zashboard, ядро скачивает его при первом запуске.

## Как это работает

1. Настройки объединяются с профилем, подписка обновляется.
2. Запускается Mihomo, при падении он перезапускается. Ограничение памяти задаётся в «Настройки» → «Mihomo»: по умолчанию `GOMEMLIMIT` — половина ОЗУ, лимит файлов — 40000 на arm64 и 10000 на mips.
3. Когда ядро слушает свои порты, включаются правила iptables и ipset и маршрут для TPROXY.
4. NDM пересобирает iptables при многих событиях. Правила восстанавливает хук `/opt/etc/ndm/netfilter.d/50-exodus.sh`, а раз в 15 секунд их проверяет сторож (`watch`), он же выполняет перезапуск по расписанию и очищает логи, превысившие предел размера.

## Удаление

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/uninstall.sh | sh
```

С `KEEP_CONFIG=1` настройки, профили и подписки в `/opt/etc/exodus` сохраняются. Пакеты Entware не удаляются, ими могут пользоваться другие приложения.

## Командная строка

```shell
exodus start | stop | restart | status
exodus update_subscription <id>
exodus hard_update     # удалить скачанные провайдеры, обновить подписку и перезапустить
exodus debug           # отчёт для issue, адреса серверов и пароли скрыты
exodus web restart     # перезапустить веб-интерфейс
exodus passwd          # сменить пароль веб-интерфейса
```

## Файлы

| Путь | Назначение |
| --- | --- |
| `/opt/etc/exodus/config.json` | настройки |
| `/opt/etc/exodus/mixin.yaml` | mixin-файл, объединяется с профилем при каждом запуске |
| `/opt/etc/exodus/profiles/`, `subscriptions/` | профили и подписки |
| `/opt/etc/exodus/run/` | рабочий каталог ядра: профиль запуска, провайдеры, панель |
| `/opt/share/exodus/` | скрипты и веб-интерфейс |
| `/opt/libexec/exodus/` | `mihomo` и `yq` |
| `/tmp/exodus/log/` | логи приложения, ядра и обновления |

## Благодарности

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) и его [участники](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) — за исследование особенностей Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) и его [участники](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
