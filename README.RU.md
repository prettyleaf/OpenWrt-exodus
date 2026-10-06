![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

Русский | [English](README.md)
[Документация](https://prettyleaf.github.io/OpenWrt-exodus/install/asuswrt/)

# Exodus для Asuswrt-Merlin

Прокси на [Mihomo](https://github.com/MetaCubeX/mihomo) для роутеров Asus с [Asuswrt-Merlin](https://www.asuswrt-merlin.net/) и Entware. Это ветка `asuswrt` проекта [Exodus](https://github.com/prettyleaf/openwrt-exodus): версия для OpenWrt живёт в ветке `main`, для Keenetic — в `keenetic`.

Идеи взяты из [XKeen](https://github.com/jameszeroX/XKeen).

## Требования

- Asuswrt-Merlin на модели с Broadcom: **384.15 или новее** в ветках `3004` либо **3006.102.1 или новее** в ветке `3006`, с Addons API (`am_addons`), `/usr/sbin/helper.sh` и доступным для записи `/jffs/addons`.
- Архитектуры: `arm64` (RT-AX86U, RT-AX88U, GT-AX6000 и другие модели HND) и `armv7` (RT-AX58U, RT-AC68U и другие). Модели без FPU, как RT-AC68U, получают сборку ядра `armv5`.
- Entware на USB-накопителе, установленный через [amtm](https://github.com/decoderman/amtm) (`amtm` → `ep`), и ~70 МБ свободного места на нём: ядро Mihomo ~40 МБ, yq ~15 МБ.
- Другие прозрачные прокси (XRAYUI и похожие аддоны) должны быть остановлены и убраны из автозапуска: они перехватывают тот же трафик.
- Для UDP через прокси нужен модуль TPROXY в прошивке. Без него UDP идёт напрямую, об этом пишется в лог Exodus.

### Перед установкой

1. **SSH.** «Администрирование» → «Система» → «Включить SSH»: только LAN.
2. **Entware.** Запустите `amtm` в SSH-консоли и установите Entware (`ep`) на USB-накопитель с ext4.
3. **«Enable JFFS custom scripts and configs»** («Администрирование» → «Система») должен быть включён. Установщик включает его, если он выключен.

## Установка и обновление

В SSH-консоли роутера:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/install.sh | sh
```

В конце он печатает адрес страницы Exodus в панели роутера. Войдите в панель и откройте **VPN → Exodus**. Exodus использует встроенный интерфейс роутера и сессию администратора; запросы обрабатываются через Addons API прошивки Merlin.

Параметры можно передать переменными окружения перед `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/install.sh | CORE=alpha sh
```

| Переменная | Значение |
| --- | --- |
| `CORE` | `meta` (стабильный Mihomo), `alpha` (Mihomo Alpha) или `prizrak` ([Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core)), иначе спрашивается |
| `GH_PROXY` | скачивать с GitHub через [gh-proxy](https://github.com/prettyleaf/gh-proxy): `https://example.com/ghproxy/TOKEN` |
| `LOW_SPACE=1` | удалить текущее ядро перед записью нового |
| `REF` | другая ветка или тег |

### Версии

У Exodus одна версия для всех роутеров — версия [релизов](https://github.com/prettyleaf/openwrt-exodus/releases) проекта: она в `/opt/share/exodus/VERSION`, на странице **«Обновления»** и в информации о сборке. Страница **«Обновления»** предлагает обновление, когда меняется код ветки `asuswrt`, изменения README не считаются.

## Переход с другого прокси

Два прозрачных прокси не могут перехватывать один и тот же трафик.

1. Остановите другой аддон (XRAYUI, аддон Clash или sing-box) и выключите его автозапуск или удалите его по его инструкции.
2. Установите Exodus, см. [Установка и обновление](#установка-и-обновление).
3. **«Профили»**: добавьте подписку провайдера. Конфиг Mihomo (Clash Meta) другого аддона можно загрузить как профиль как есть: Exodus задаёт поверх него свои порты, DNS-листенер, API и панель, TUN профиля выключается. Конфиг Xray не подойдёт, Exodus нужна подписка или конфиг для Mihomo.
4. **«Устройства»**: выберите устройства, которые идут через прокси, затем **«Сохранить и применить»**.

## Как пользоваться

1. Войдите в панель роутера и откройте **VPN → Exodus**. Интерфейс оформлен в стиле Merlin и использует русский язык, если он выбран в настройках роутера, иначе — английский.
2. **Профили**: добавьте подписку или загрузите файл профиля.
3. **Устройства**: включите **«Автозапуск»**, выберите профиль, режим и устройства / сети Wi-Fi / сегменты, затем нажмите **«Сохранить и применить»**. Имена устройств берутся из списка клиентов роутера, DHCP и его карты сети.
4. **Настройки**: только то, что имеет смысл менять на роутере, — режимы прокси, порты и исключения, DSCP, несколько параметров Mihomo, свои правила, сервис. Всё остальное (DNS-серверы, hosts, сниффер, провайдеры правил) задаётся в профиле или в mixin-файле на странице **«Редактор»**, он объединяется с профилем при каждом запуске.

Кнопка **«Панель»** открывает Zashboard, ядро скачивает его при первом запуске.

## Как это работает

1. Настройки объединяются с профилем; подписка скачивается, если прошёл её интервал. `router.asus.com` резолвится в адрес роутера, имена локального домена спрашиваются у роутера.
2. Запускается Mihomo, при падении он перезапускается. Ограничение памяти задаётся в «Настройки» → «Mihomo»: по умолчанию `GOMEMLIMIT` — половина ОЗУ, лимит файлов — 40000 на arm64 и 10000 на остальных моделях.
3. Когда ядро слушает свои порты, включаются правила iptables и ipset и маршрут для TPROXY. Используются iptables и ipset прошивки, они соответствуют её ядру.
4. Прошивка восстанавливает свои таблицы iptables без правил аддонов при каждом перезапуске файрвола: переподключении WAN, изменении настроек в веб-интерфейсе. Правила восстанавливает строка в `/jffs/scripts/firewall-start` и `/jffs/scripts/nat-start`, а раз в 15 секунд их проверяет сторож (`watch`), он же синхронизирует клиентов выбранных сетей Wi-Fi, обновляет подписку, выполняет перезапуск по расписанию и очищает логи, превысившие предел размера.
5. Проксируемый трафик идёт на сам роутер, мимо фильтрации транзитного трафика. С включённым **«Учитывать родительский контроль»** его проверяет цепочка родительского контроля прошивки (`PControls`), так что блокировка устройств и расписания действуют и на него.
6. `/jffs/scripts/unmount` останавливает прокси перед отключением его USB-накопителя: правила не должны оставаться без ядра.

## Удаление

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/asuswrt/uninstall.sh | sh
```

Строки Exodus удаляются из `/jffs/scripts`, строки других аддонов остаются. С `KEEP_CONFIG=1` настройки, профили и подписки в `/opt/etc/exodus` сохраняются. Пакеты Entware не удаляются, ими могут пользоваться другие приложения.

## Командная строка

```shell
exodus start | stop | restart | status
exodus update_subscription <id>   # скачать подписку, работающее ядро получит её, если она используется
exodus hard_update     # удалить скачанные провайдеры, обновить подписку и перезапустить
exodus debug           # отчёт для issue, адреса серверов и пароли скрыты
exodus web restart     # восстановить встроенную страницу Exodus и обновить её кэш
exodus passwd          # показать, где сменить пароль администратора роутера
```

## Файлы

| Путь | Назначение |
| --- | --- |
| `/opt/etc/exodus/config.json` | настройки |
| `/opt/etc/exodus/mixin.yaml` | mixin-файл, объединяется с профилем при каждом запуске |
| `/opt/etc/exodus/profiles/` | загруженные профили |
| `/opt/etc/exodus/subscriptions/` | подписки и то, что о них сообщил провайдер |
| `/opt/etc/exodus/run/` | рабочий каталог ядра: профиль запуска, провайдеры, панель |
| `/opt/share/exodus/` | скрипты и веб-интерфейс |
| `/opt/libexec/exodus/` | `mihomo` и `yq` |
| `/opt/etc/init.d/S99exodus` | запуск вместе с Entware |
| `/jffs/scripts/firewall-start`, `nat-start`, `unmount`, `services-start`, `service-event` | по одной строке с пометкой `# exodus` |
| `/jffs/addons/exodus/` | страница в панели роутера и скрипт восстановления при загрузке |
| `/tmp/exodus/run/webui/` | кэш в RAM и файлы запросов и ответов Addons API |
| `/tmp/exodus/log/` | логи приложения, ядра и обновления |

## Благодарности

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) и его [участники](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) — за прозрачный прокси на iptables и метки DSCP
- [Asuswrt-Merlin](https://github.com/RMerl/asuswrt-merlin.ng) — за пользовательские скрипты, и [amtm](https://github.com/decoderman/amtm) — за Entware
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) и его [участники](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
