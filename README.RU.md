![GitHub License](https://img.shields.io/github/license/prettyleaf/openwrt-exodus?style=for-the-badge&logo=github)

Русский | [English](README.md)
[Документация](https://prettyleaf.github.io/OpenWrt-exodus/install/keenetic/)

# Exodus для Keenetic

Прокси на [Mihomo](https://github.com/MetaCubeX/mihomo) для роутеров Keenetic / Netcraze с Entware. Это ветка `keenetic` проекта [Exodus](https://github.com/prettyleaf/openwrt-exodus), версия для OpenWrt живёт в ветке `main`.

Идеи взяты из [XKeen](https://github.com/jameszeroX/XKeen).

## Требования

- KeeneticOS 4.x или новее.
- Архитектуры: `aarch64` (arm64), `mipsel` и `mips` (softfloat).
- ~70 МБ свободного места на накопителе Entware: ядро Mihomo ~40 МБ, yq ~15 МБ.
- XKeen должен быть остановлен и убран из автозапуска: оба перехватывают трафик.

### Перед установкой

**1. Компоненты KeeneticOS.** Устанавливаются в веб-интерфейсе роутера («Общие настройки» → «Изменить набор компонентов»), роутер перезагрузится.

| Компонент | Зачем |
| --- | --- |
| **«Поддержка открытых пакетов»** (OPKG) | обязательно, на нём работает Entware |
| **«Модули ядра подсистемы Netfilter»** | обязательно: TPROXY (UDP и TCP в режиме TPROXY) и метки DSCP |
| **«Протокол IPv6»** | для IPv6 через прокси, в KeeneticOS 5 включён всегда |
| **«Интерфейс USB»** и **«Файловая система Ext»** | если Entware стоит на USB-накопителе |

**2. Entware.** Установите по [инструкции Keenetic](https://help.keenetic.com/hc/ru/articles/360021214160) на USB-накопитель или во встроенную память моделей, где она есть, и зайдите в его SSH-консоль.

## Установка и обновление

В SSH-консоли Entware:

```shell
opkg update && opkg install curl
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | sh
```

В конце он печатает адрес веб-интерфейса, по умолчанию `http://192.168.1.1:9099/`.

Параметры можно передать переменными окружения перед `sh`:

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/install.sh | CORE=alpha PASSWORD=secret sh
```

### Версии

У Exodus одна версия для всех роутеров — версия [релизов](https://github.com/prettyleaf/openwrt-exodus/releases) проекта: она в `/opt/share/exodus/VERSION`, на странице **«Обновления»** и в информации о сборке. Страница **«Обновления»** предлагает обновление, когда меняется код ветки `keenetic`, изменения README не считаются.

## Переход с XKeen

Exodus заменяет XKeen с ядром Mihomo: оба перехватывают один и тот же трафик и вместе работать не могут.

1. Остановите XKeen и выключите его автозапуск или удалите его полностью:

   ```shell
   xkeen -stop
   xkeen -auto off
   # или: xkeen -remove
   ```

   Пока XKeen запущен, установщик Exodus останавливается с ошибкой.
2. Установите Exodus, см. [Установка и обновление](#установка-и-обновление).
3. **«Профили»**: добавьте подписку провайдера — ту же ссылку, что в `proxy-providers` у XKeen. Или возьмите весь конфиг XKeen как профиль и выберите `Файл: xkeen.yaml` на странице **«Статус»**:

   ```shell
   cp /opt/etc/mihomo/config.yaml /opt/etc/exodus/profiles/xkeen.yaml
   ```

   Exodus задаёт поверх профиля свои порты, DNS-листенер, API и панель, TUN профиля выключается.
4. **«Статус» → «Устройства»**: XKeen проксирует устройства политики доступа `XKeen`, в Exodus они выбираются здесь. Чтобы проксировать только их, выберите режим **«Только выбранные»** и эти устройства или их сегмент. Политику после этого можно удалить в роутере.
5. **«Настройки»**: метки DSCP 61, 62 и 63 те же, что в XKeen. Порты из `port_proxying.lst` и `port_exclude.lst` и сети из `ip_exclude.lst` в `/opt/etc/xkeen` переносятся в **«Порты и исключения»**.

Вернуться на XKeen: остановите сервис и выключите **«Автозапуск»** на странице **«Статус»** или [удалите](#удаление) Exodus, затем `xkeen -auto on` и `xkeen -start`.

## Как пользоваться

1. Откройте `http://<адрес роутера>:9099/` и войдите. Веб-интерфейс на русском и английском, со светлой и тёмной темой.
2. **Профили**: добавьте подписку или загрузите файл профиля.
3. **Статус**: включите **«Автозапуск»**, выберите профиль, в разделе «Устройства» выберите режим и устройства / точки Wi-Fi / сегменты, затем нажмите **«Сохранить и применить»**.
4. **Настройки**: только то, что имеет смысл менять на Keenetic, — режимы прокси, порты и исключения, DSCP, несколько параметров Mihomo, свои правила, сервис. Всё остальное (DNS-серверы, hosts, сниффер, провайдеры правил) задаётся в профиле или в mixin-файле на странице **«Редактор»**, он объединяется с профилем при каждом запуске.

Кнопка **«Панель»** открывает Zashboard, ядро скачивает его при первом запуске.

## Как это работает

1. Настройки объединяются с профилем; подписка скачивается, если прошёл её интервал.
2. Запускается Mihomo, при падении он перезапускается. Ограничение памяти задаётся в «Настройки» → «Mihomo»: по умолчанию `GOMEMLIMIT` — половина ОЗУ, лимит файлов — 40000 на arm64 и 10000 на mips.
3. Когда ядро слушает свои порты, включаются правила iptables и ipset и маршрут для TPROXY.
4. NDM пересобирает iptables при многих событиях. Правила восстанавливает хук `/opt/etc/ndm/netfilter.d/50-exodus.sh`, а раз в 15 секунд их проверяет сторож (`watch`), он же обновляет подписку, выполняет перезапуск по расписанию и очищает логи, превысившие предел размера.
5. Имена устройств, точки Wi-Fi и родительский контроль берутся из RCI роутера. KeeneticOS 5.2 требует для него токен доступа: Exodus выпускает свой через `ndmc` (токен `exodus` в **«Пользователи и доступ»**) и выпускает новый, если его удалили. Деинсталлятор его удаляет.

## Удаление

```shell
curl -fsSL https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/keenetic/uninstall.sh | sh
```

С `KEEP_CONFIG=1` настройки, профили и подписки в `/opt/etc/exodus` сохраняются. Пакеты Entware не удаляются, ими могут пользоваться другие приложения.

## Командная строка

```shell
exodus start | stop | restart | status
exodus update_subscription <id>   # скачать подписку, работающее ядро получит её, если она используется
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
| `/opt/etc/exodus/profiles/` | загруженные профили |
| `/opt/etc/exodus/subscriptions/` | подписки и то, что о них сообщил провайдер |
| `/opt/etc/exodus/rci.token` | токен доступа к RCI на KeeneticOS 5.2 |
| `/opt/etc/exodus/run/` | рабочий каталог ядра: профиль запуска, провайдеры, панель |
| `/opt/share/exodus/` | скрипты и веб-интерфейс |
| `/opt/libexec/exodus/` | `mihomo` и `yq` |
| `/tmp/exodus/log/` | логи приложения, ядра и обновления |

## Благодарности

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) и его [участники](https://github.com/nikkinikki-org/OpenWrt-nikki/graphs/contributors)
- [XKeen](https://github.com/jameszeroX/XKeen) — за исследование особенностей Keenetic
- [Prizrak-Core](https://github.com/legiz-ru/Prizrak-Core) и его [участники](https://github.com/legiz-ru/Prizrak-Core/graphs/contributors)
