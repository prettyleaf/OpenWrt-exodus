![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

Русский | [English](README.md)

# Exodus для MikroTik

Прокси на [Mihomo](https://github.com/MetaCubeX/mihomo) для роутеров MikroTik, в контейнере RouterOS. Это ветка `mikrotik` проекта [Exodus](https://github.com/prettyleaf/openwrt-exodus): тот же веб-интерфейс, те же профили, подписки и Zashboard, что на Keenetic, версия для OpenWrt живёт в ветке `main`.

## Как это работает

В контейнере — ядро Mihomo, веб-интерфейс и панель. RouterOS отправляет в него трафик выбранных устройств, а правила роутера контейнер поддерживает сам через REST API:

1. **mangle prerouting**: TCP и UDP выбранных устройств получают routing mark `exodus`, таблица маршрутизации `exodus` ведёт в контейнер. Сам роутер, локальные и зарезервированные сети идут напрямую.
2. **nat dstnat**: DNS выбранных устройств уходит в ядро (это нужно для Fake-IP и правил по доменам).
3. **filter forward**: два правила `accept` перед fasttrack — fasttrack пропустил бы routing mark.
4. Внутри контейнера nftables отправляет трафик на TPROXY-порт ядра (Redirect для TCP — по выбору).
5. Правила проверяются каждые 30 секунд и применяются снова, если их удалили, изменили или выключили. Когда контейнер не отвечает, маршрут с `check-gateway=ping` становится неактивным, а **netwatch** выключает правила: устройства идут напрямую, без прокси, пока контейнер не вернётся.

У каждого правила контейнера комментарий начинается с `exodus:`, свою часть установщик помечает `exodus setup`.

## Требования

- RouterOS **7.20** или новее: в её контейнерах есть nftables с TPROXY.
- Архитектуры: `arm64`, `arm` (armv7) и `x86` (включая CHR). На роутерах MIPS и SMIPS контейнеров нет.
- Пакет `container` и режим устройства с контейнерами, см. ниже.
- Накопитель для контейнера в **ext4** (USB, NVMe, SATA): образ занимает около 100 МБ. Встроенная память подойдёт на роутерах, где её хватает, но изнашивается.
- Около 100 МБ свободной RAM для ядра.
- REST API через сервис `www` (HTTP) или `www-ssl`. Если оба выключены, установщик включает `www` только для контейнера. Трафик между роутером и контейнером не выходит за пределы роутера.

### Перед установкой

**1. Пакет container.** Скачайте *Extra packages* своей версии и архитектуры с [mikrotik.com/download](https://mikrotik.com/download), загрузите `container-*.npk` в **Files** и перезагрузите роутер. Проверка: `/system package print`.

**2. Режим устройства.** Выполните в терминале и подтвердите кнопкой reset (или выключением питания) в течение 5 минут:

```routeros
/system/device-mode/update container=yes
```

**3. Накопитель.** Отформатируйте его в ext4 в **System → Disks**.

## Установка и обновление

В терминале роутера (WinBox → New Terminal или SSH):

```routeros
/tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/install.rsc" dst-path=exodus-install.rsc; /import exodus-install.rsc
```

Установщик:

- создаёт veth `veth-exodus` (`172.31.255.2/30` у контейнера, `172.31.255.1` у роутера), NAT для контейнера и правило `input` для него;
- создаёт таблицу маршрутизации `exodus`, пользователя и группу `exodus` для REST API (входит только из контейнера);
- ставит `registry-url` в `/container/config` на `https://ghcr.io` и скачивает `prettyleaf/exodus-mikrotik:latest`;
- создаёт контейнер с mount `<диск>/exodus/data` → `/opt/etc/exodus` и запускает его, автозапуск вместе с роутером включён.

В конце он покажет пароль веб-интерфейса. Веб-интерфейс открывается по адресу `http://<адрес роутера>:9099/` (контейнер пробрасывает порт с адресов роутера на списке интерфейсов `LAN`) и `http://172.31.255.2:9099/`.

Параметры задаются глобальными переменными перед импортом:

```routeros
:global exodusDisk "usb1"; :global exodusPassword "secret"; /import exodus-install.rsc
```

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `exodusDisk` | первый диск ext4 | накопитель контейнера: `usb1`, `nvme1`, `sata1` |
| `exodusPassword` | генерируется | пароль веб-интерфейса при первой установке |
| `exodusLanList` | `LAN` | список интерфейсов локальной сети |
| `exodusNetwork` | `172.31.255` | сеть /30 контейнера |
| `exodusIPv6` | `no` | `yes` даёт контейнеру `fd65:786f:6475::2/64` и NAT66, тогда проксируется и IPv6 |
| `exodusImage` | `prettyleaf/exodus-mikrotik:latest` | образ на ghcr.io |
| `exodusFile` | — | файл образа на роутере вместо реестра, `github` скачивает `exodus-mikrotik-<arch>.tar` из релиза [mikrotik-image](https://github.com/prettyleaf/openwrt-exodus/releases/tag/mikrotik-image) |
| `exodusGhProxy` | — | [gh-proxy](https://github.com/prettyleaf/gh-proxy) для GitHub: файл образа и обновления внутри контейнера |

### Обновления

- **Код Exodus и ядро** обновляются на странице **«Обновления»** веб-интерфейса, прямо в работающем контейнере, как на Keenetic. Версия Exodus — версия [релизов](https://github.com/prettyleaf/openwrt-exodus/releases), одна на всех роутерах; обновление предлагается, когда меняется код ветки `mikrotik`.
- **Образ** (Alpine и его пакеты) обновляется установщиком: запустите его снова. Он пересоздаст контейнер из нового образа, настройки, профили и подписки в `<диск>/exodus/data` сохранятся.

Ядро меняется в оболочке контейнера:

```routeros
/container shell exodus cmd="sh /opt/share/exodus/install.sh"
```

### Без доступа к ghcr.io

Скачайте файл образа через gh-proxy и установите из него:

```routeros
:global exodusFile "github"; :global exodusGhProxy "https://example.com/ghproxy/TOKEN"; /import exodus-install.rsc
```

## Использование

1. Откройте веб-интерфейс и войдите. Он на русском и английском, со светлой и тёмной темой.
2. **«Настройки» → RouterOS**: проверьте подключение. Пользователя REST API установщик передаёт в `/container/envs`, контейнер записывает его в свои настройки при каждом запуске.
3. **«Профили»**: добавьте подписку или загрузите профиль.
4. **«Состояние»**: включите **«Автозапуск»**, выберите профиль, режим и устройства: сегменты (интерфейсы с адресом — бриджи, VLAN), точки Wi-Fi (интерфейсы wifi, wireless и CAPsMAN) и устройства из DHCP-аренд и ARP. Затем **«Сохранить и применить»**.
5. В **«Настройках»** — режимы прокси, порты и исключения, DSCP, несколько опций Mihomo, свои правила и сервис. Всё остальное задаётся в профиле или в mixin-файле на странице **«Редактор»**.

Кнопка **«Панель»** открывает Zashboard, ядро скачивает её при первом запуске.

### Замечания

- Проксируемые пакеты останавливаются в `mangle prerouting` на правилах Exodus (`passthrough=no`), последующие правила mangle prerouting их не видят.
- Цепочка `forward` роутера по-прежнему действует на новые проксируемые соединения. Строгой цепочке `forward`, которая отбрасывает всё, кроме WAN, нужен `accept` для `out-interface=veth-exodus`.
- `router.lan` и другие имена `.lan` и `.home.arpa` резолвит роутер, его DNS должен принимать удалённые запросы (`/ip dns set allow-remote-requests=yes`, включено в конфигурации по умолчанию).
- DSCP: 62 идёт напрямую, 63 — через прокси с любого устройства и порта, 61 — в один выбранный прокси.

## Удаление

```routeros
/tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/uninstall.rsc" dst-path=exodus-uninstall.rsc; /import exodus-uninstall.rsc
```

`:global exodusKeepData yes` перед импортом сохранит `<диск>/exodus/data`. `registry-url` и сервис `www` остаются как есть.

## Командная строка

В оболочке контейнера, `/container shell exodus`:

```shell
exodus start | stop | restart | status
exodus routeros        # проверить подключение к REST API RouterOS
exodus apply           # применить правила контейнера и RouterOS заново
exodus update_subscription <id>   # скачать подписку, запущенное ядро получит её, если она используется
exodus hard_update     # удалить скачанные провайдеры, обновить подписку и перезапустить
exodus debug           # отчёт для issue, адреса серверов и пароли скрыты
exodus web restart     # перезапустить веб-интерфейс
exodus passwd          # сменить пароль веб-интерфейса
```

Логи контейнера в RouterOS: `/log print where topics~"container"`.

## Файлы

| Путь в контейнере | Назначение |
| --- | --- |
| `/opt/etc/exodus/` | mount `<диск>/exodus/data`: настройки, профили, подписки, mixin-файл |
| `/opt/etc/exodus/config.json` | настройки |
| `/opt/etc/exodus/run/` | рабочий каталог ядра: профиль для запуска, провайдеры, панель |
| `/opt/share/exodus/` | скрипты и веб-интерфейс |
| `/opt/libexec/exodus/` | `mihomo` и `yq` |
| `/tmp/exodus/log/` | логи приложения, ядра и обновления |

## Благодарности

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) и его [участникам](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) за исследование Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) и его [участникам](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
