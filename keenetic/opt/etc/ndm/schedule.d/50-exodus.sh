#!/bin/sh

# a schedule of the router started or stopped, parental control may block or unblock devices

[ "$1" = "start" ] || [ "$1" = "stop" ] || exit 0
[ -x /opt/share/exodus/exodus ] || exit 0
exec /opt/share/exodus/exodus hook schedule
