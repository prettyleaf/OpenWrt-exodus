#!/bin/sh

# Exodus for Keenetic uninstaller
# KEEP_CONFIG=1 keeps /opt/etc/exodus (settings, profiles and subscriptions)
# packages of entware (curl, jq, ipset, iptables, ip-full, lighttpd) are kept, other applications may use them

export PATH="/opt/bin:/opt/sbin:/sbin:/bin:/usr/sbin:/usr/bin"

# stop the proxy first, it removes the rules and the routes
if [ -x /opt/share/exodus/exodus ]; then
	/opt/share/exodus/exodus stop
	/opt/share/exodus/exodus web stop
fi

rm -f /opt/etc/init.d/S99exodus
rm -f /opt/etc/ndm/netfilter.d/50-exodus.sh
rm -f /opt/etc/ndm/schedule.d/50-exodus.sh
rm -f /opt/bin/exodus
rm -rf /opt/share/exodus
rm -rf /opt/libexec/exodus
rm -rf /tmp/exodus
if [ "$KEEP_CONFIG" != 1 ]; then
	rm -rf /opt/etc/exodus
fi

echo "success"
