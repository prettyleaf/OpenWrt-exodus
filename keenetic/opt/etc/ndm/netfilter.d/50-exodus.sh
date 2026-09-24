#!/bin/sh

# ndm rebuilt an iptables table ($type, $table) and removed the rules of exodus, apply them again

[ -x /opt/share/exodus/exodus ] || exit 0
exec /opt/share/exodus/exodus hook netfilter "$type" "$table"
