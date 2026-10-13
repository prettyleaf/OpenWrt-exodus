#!/bin/sh
# shellcheck shell=sh

# transparent proxy for mikrotik: routeros sends the traffic of the chosen devices to the container, the core takes it there
#
# in routeros, through the rest api; every rule has the comment "exodus:<group> <n>/<count> <hash>",
# the hash is of the whole list: a list that differs in anything is removed and added again
#   mangle prerouting -> exodus-pre: tcp and udp of the chosen devices get the routing mark exodus,
#                        the routing table exodus leads to the container, local and reserved destinations stay
#   mangle output     -> exodus-out: the router proxy, off by default
#   nat dstnat        -> exodus-dns: dns of the chosen devices goes to the core
#   filter forward    -> the proxied connections are kept out of fasttrack, fasttrack would skip the routing mark
#   address lists     -> exodus-direct (reserved destinations), exodus-ap (clients of the chosen wi-fi points)
#   routes            -> the default route of the table exodus to the container, with check-gateway
#   netwatch          -> turns the rules off when the container does not answer, the traffic goes directly then
# in the container, nftables: what the router sends goes to the tproxy (or redirect) port of the core
#
# dscp like xkeen: 61 forces a separate listener with a chosen proxy, 62 bypasses, 63 proxies the device anyway

LIST_DIRECT="exodus-direct"
LIST_AP="exodus-ap"
ROS_PROXY_PATHS4="ip/firewall/mangle ip/firewall/nat ip/firewall/filter ip/firewall/address-list ip/route tool/netwatch"
ROS_PROXY_PATHS6="ipv6/firewall/mangle ipv6/firewall/nat ipv6/firewall/filter ipv6/firewall/address-list ipv6/route"
TAB=$(printf '\t')

# split "80 443 1000-2000" into lists of routeros of at most 15 ports, a range counts twice
# prints nothing when all ports are proxied
fw_port_chunks() {
	case "$1" in
		""|"0-65535"|"1-65535"|"0:65535"|"1:65535") return ;;
	esac
	# shellcheck disable=SC2020
	echo "$1" | tr ', ' '\n\n' | awk '
		/^[0-9]+([-:][0-9]+)?$/ {
			gsub(/:/, "-")
			w = index($0, "-") ? 2 : 1
			if (n + w > 15) { print chunk; chunk = ""; n = 0 }
			chunk = chunk (chunk == "" ? "" : ",") $0
			n += w
		}
		END { if (chunk != "") print chunk }' | tr '\n' ' '
}

# words of a list matching a regex, values end up in rules and in a sourced file
fw_words() {
	# shellcheck disable=SC2086
	[ -n "$2" ] && printf '%s\n' $2 | grep -E "^($1)\$" | tr '\n' ' ' | sed 's/ $//'
}

FW_NUMBER='[0-9]{1,5}'

# a line of the env file, the value is quoted for the shell
fw_var() {
	printf "%s='%s'\n" "$1" "$(printf '%s' "$2" | sed "s/'/'\\\\''/g")"
}

fw_list() {
	# shellcheck disable=SC2086
	[ -n "$1" ] && printf '%s\n' $1
}

fw_filter_mac() {
	tr 'a-f' 'A-F' | grep -E '^([0-9A-F]{2}:){5}[0-9A-F]{2}$'
}

fw_filter_ip4() {
	grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$'
}

# a network by its first address, like routeros shows it: 198.18.0.1/16 is 198.18.0.0/16, a /32 is the address alone
fw_network4() {
	awk -F '[./]' '
		NF == 5 {
			ip = (($1 * 256 + $2) * 256 + $3) * 256 + $4
			size = 2 ^ (32 - $5)
			ip = int(ip / size) * size
			if ($5 == 32) printf "%d.%d.%d.%d\n", int(ip / 16777216) % 256, int(ip / 65536) % 256, int(ip / 256) % 256, ip % 256
			else printf "%d.%d.%d.%d/%d\n", int(ip / 16777216) % 256, int(ip / 65536) % 256, int(ip / 256) % 256, ip % 256, $5
			next
		}
		{ print }'
}

fw_filter_ip6() {
	grep -E '^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*(/[0-9]{1,3})?$'
}

# names of interfaces of routeros may have spaces, one per line; tabs and quotes are not allowed in the rules
fw_filter_name() {
	tr -d '\t\r"' | grep -v -E '^ *$'
}

# compute everything the rules need and save it, the watcher applies exactly what the start computed
# expects cfg_load and profile_params (p_* variables) to be done
fw_prepare() {
	local item items_mac items_ip4 items_ip6 items_iface items_ap tp_protos iface ip4 ip6 v6
	iface=$(net_iface)
	ip4=$(net_address 4 "$iface")
	ip6=$(net_address 6 "$iface")
	# ipv6 follows the profile, mihomo has it on unless the profile turns it off; the veth needs an ipv6 address and a gateway
	v6=0
	if [ "$p_ipv6" = 1 ] && [ -n "$ip6" ] && [ -n "$(net_gateway 6)" ]; then
		v6=1
	fi

	items_mac=
	items_ip4=
	items_ip6=
	items_iface=
	items_ap=
	while IFS= read -r item; do
		case "$item" in
			mac:*) items_mac="$items_mac ${item#mac:}" ;;
			ip:*) items_ip4="$items_ip4 ${item#ip:}" ;;
			ip6:*) items_ip6="$items_ip6 ${item#ip6:}" ;;
			iface:*) items_iface="$items_iface${item#iface:}
" ;;
			ap:*) items_ap="$items_ap${item#ap:}
" ;;
		esac
	done <<-EOF
		$(jq -r '.proxy.access_items // [] | .[] | select(type == "string")' "$CONFIG_PATH" 2> /dev/null)
	EOF
	items_mac=$(fw_list "$items_mac" | fw_filter_mac | sort -u | tr '\n' ' ')
	items_ip4=$(fw_list "$items_ip4" | fw_filter_ip4 | fw_network4 | sort -u | tr '\n' ' ')
	items_ip6=$(fw_list "$items_ip6" | fw_filter_ip6 | sed 's|/128$||' | sort -u | tr '\n' ' ')
	items_iface=$(printf '%s' "$items_iface" | fw_filter_name | sort -u)
	items_ap=$(printf '%s' "$items_ap" | fw_filter_name | sort -u)

	tp_protos=
	[ "$c_proxy_udp_mode" = "tproxy" ] && tp_protos="udp"
	[ "$c_proxy_tcp_mode" = "tproxy" ] && tp_protos="${tp_protos:+$tp_protos }tcp"

	# dscp 61 goes to listeners with a fixed proxy, they are added by the mixin only when a proxy is chosen
	local force_redir force_tproxy
	force_redir=
	force_tproxy=
	if [ -n "$c_proxy_dscp_force" ] && [ -n "$c_proxy_force_proxy" ]; then
		[ "$c_proxy_tcp_mode" = "redirect" ] && force_redir="$p_force_redir_port"
		[ -n "$tp_protos" ] && force_tproxy="$p_force_tproxy_port"
	fi

	# fake-ip addresses are always proxied, the core knows the real destination
	local fake4 fake6
	fake4=
	fake6=
	if [ "$p_dns_mode" = "fake-ip" ]; then
		fake4=$(echo "${p_fake_ip_range:-198.18.0.1/16}" | fw_filter_ip4 | fw_network4)
		fake6=$(echo "$p_fake_ip6_range" | fw_filter_ip6)
	fi
	local mode; mode="exclude"
	[ "$c_proxy_access_mode" = "include" ] && mode="include"
	local tcp_mode udp_mode
	tcp_mode=
	udp_mode=
	case "$c_proxy_tcp_mode" in redirect|tproxy) tcp_mode="$c_proxy_tcp_mode" ;; esac
	[ "$c_proxy_udp_mode" = "tproxy" ] && udp_mode="tproxy"
	local dns; dns=0
	[ "$c_proxy_dns_hijack" = 1 ] && [ -n "$p_dns_port" ] && dns=1

	{
		fw_var fw_if "$iface"
		fw_var fw_ip4 "$ip4"
		fw_var fw_ip6 "$ip6"
		fw_var fw_v6 "$v6"
		fw_var fw_dns "$dns"
		fw_var fw_router "$c_proxy_router_proxy"
		fw_var fw_lan_list "$(printf '%s\n' "$c_routeros_lan_list" | fw_filter_name | head -n 1)"
		fw_var fw_mode "$mode"
		fw_var fw_items_mac "$items_mac"
		fw_var fw_items_ip4 "$items_ip4"
		fw_var fw_items_ip6 "$items_ip6"
		fw_var fw_items_iface "$items_iface"
		fw_var fw_items_ap "$items_ap"
		fw_var fw_tcp_mode "$tcp_mode"
		fw_var fw_udp_mode "$udp_mode"
		fw_var fw_tp_protos "$tp_protos"
		fw_var fw_tcp_ports "$(fw_port_chunks "$c_proxy_proxy_tcp_dport")"
		fw_var fw_udp_ports "$(fw_port_chunks "$c_proxy_proxy_udp_dport")"
		fw_var fw_dscp_force "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_force")"
		fw_var fw_dscp_bypass "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_bypass")"
		fw_var fw_dscp_proxy "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_proxy")"
		fw_var fw_reserved4 "$(fw_list "$c_proxy_reserved_ip" | fw_filter_ip4 | fw_network4 | tr '\n' ' ')"
		fw_var fw_reserved6 "$(fw_list "$c_proxy_reserved_ip6" | fw_filter_ip6 | sed 's|/128$||' | tr '\n' ' ')"
		fw_var fw_mark "$TPROXY_MARK"
		fw_var fw_mask "$TPROXY_MASK"
		fw_var fw_pref "$TPROXY_RULE_PREF"
		fw_var fw_table "$TPROXY_TABLE"
		fw_var fw_redir_port "$(fw_words "$FW_NUMBER" "$p_redir_port")"
		fw_var fw_tproxy_port "$(fw_words "$FW_NUMBER" "$p_tproxy_port")"
		fw_var fw_dns_port "$(fw_words "$FW_NUMBER" "$p_dns_port")"
		fw_var fw_force_redir_port "$(fw_words "$FW_NUMBER" "$force_redir")"
		fw_var fw_force_tproxy_port "$(fw_words "$FW_NUMBER" "$force_tproxy")"
		fw_var fw_fake4 "$fake4"
		fw_var fw_fake6 "$fake6"
	} > "$FIREWALL_ENV_PATH"
}

fw_env() {
	[ -f "$FIREWALL_ENV_PATH" ] || return 1
	# shellcheck disable=SC1090
	. "$FIREWALL_ENV_PATH"
}

# ---------- the container: nftables ----------

# the core takes the tcp and udp the router sends, $1 is the table: exodus (tproxy) or exodus_nat (redirect and ping)
fw_nft_build() {
	local table tp local4 local6
	table="$1"
	local4="127.0.0.0/8${fw_ip4:+, $fw_ip4}"
	local6="::1, fe80::/10${fw_ip6:+, $fw_ip6}"
	tp=$(echo "$fw_tp_protos" | sed 's/ /, /g')
	echo "table inet $table"
	echo "delete table inet $table"
	echo "table inet $table {"
	echo "	set local4 { type ipv4_addr; flags interval; elements = { $local4 } }"
	echo "	set local6 { type ipv6_addr; flags interval; elements = { $local6 } }"
	if [ "$table" = "exodus" ]; then
		echo "	chain prerouting {"
		echo "		type filter hook prerouting priority mangle; policy accept;"
	else
		echo "	chain prerouting {"
		echo "		type nat hook prerouting priority dstnat; policy accept;"
	fi
	# only what the router sends, the web ui, the api and the dns of the core are the container itself
	echo "		iifname != \"$fw_if\" return"
	echo "		ip daddr @local4 return"
	echo "		ip6 daddr @local6 return"
	if [ "$table" = "exodus" ]; then
		if [ -n "$tp" ] && [ -n "$fw_tproxy_port" ]; then
			if [ -n "$fw_force_tproxy_port" ]; then
				echo "		ip dscp $fw_dscp_force meta l4proto { $tp } tproxy ip to :$fw_force_tproxy_port meta mark set $fw_mark accept"
				echo "		ip6 dscp $fw_dscp_force meta l4proto { $tp } tproxy ip6 to :$fw_force_tproxy_port meta mark set $fw_mark accept"
			fi
			echo "		meta nfproto ipv4 meta l4proto { $tp } tproxy ip to :$fw_tproxy_port meta mark set $fw_mark accept"
			echo "		meta nfproto ipv6 meta l4proto { $tp } tproxy ip6 to :$fw_tproxy_port meta mark set $fw_mark accept"
		fi
	else
		if [ "$fw_tcp_mode" = "redirect" ] && [ -n "$fw_redir_port" ]; then
			if [ -n "$fw_force_redir_port" ]; then
				echo "		ip dscp $fw_dscp_force meta l4proto tcp redirect to :$fw_force_redir_port"
				echo "		ip6 dscp $fw_dscp_force meta l4proto tcp redirect to :$fw_force_redir_port"
			fi
			echo "		meta l4proto tcp redirect to :$fw_redir_port"
		fi
		# ping of fake-ip addresses is answered by the container
		[ -n "$fw_fake4" ] && echo "		ip daddr $fw_fake4 icmp type echo-request redirect"
		[ -n "$fw_fake6" ] && echo "		ip6 daddr $fw_fake6 icmpv6 type echo-request redirect"
	fi
	echo "	}"
	echo "}"
}

# the nat table is needed by redirect and the ping of fake-ip, nat of nftables may be missing in the kernel of the router
fw_nft_nat_needed() {
	{ [ "$fw_tcp_mode" = "redirect" ] && [ -n "$fw_redir_port" ]; } || [ -n "$fw_fake4$fw_fake6" ]
}

fw_route_apply() {
	local family
	[ -n "$fw_tp_protos" ] || return 0
	for family in 4 6; do
		[ "$family" = 6 ] && [ "$fw_v6" != 1 ] && continue
		ip -"$family" route replace local default dev lo table "$fw_table" 2> /dev/null
		if ! ip -"$family" rule show 2> /dev/null | grep -q "lookup $fw_table *$"; then
			ip -"$family" rule add pref "$fw_pref" fwmark "$fw_mark/$fw_mask" table "$fw_table" 2> /dev/null
		fi
	done
}

fw_nft_start() {
	local error failed
	failed=0
	if ! command -v nft > /dev/null 2>&1; then
		log "Proxy" "nft is not found in the container, take the image again."
		return 1
	fi
	fw_route_apply
	if ! error=$(fw_nft_build exodus | nft -f - 2>&1); then
		log "Proxy" "Failed to apply the nftables rules: $(echo "$error" | grep -v '^ *$' | head -n 2 | tr '\n' ' ')"
		failed=1
	fi
	if fw_nft_nat_needed; then
		if ! error=$(fw_nft_build exodus_nat | nft -f - 2>&1); then
			log "Proxy" "Failed to apply the nftables nat rules, TCP redirect and the ping of fake-ip do not work, choose TPROXY for TCP: $(echo "$error" | grep -v '^ *$' | head -n 1)"
			failed=1
		fi
	else
		nft delete table inet exodus_nat > /dev/null 2>&1
	fi
	return "$failed"
}

fw_nft_intact() {
	nft list table inet exodus > /dev/null 2>&1 || return 1
	if fw_nft_nat_needed; then
		nft list table inet exodus_nat > /dev/null 2>&1 || return 1
	fi
	return 0
}

fw_nft_clean() {
	local family
	nft delete table inet exodus > /dev/null 2>&1
	nft delete table inet exodus_nat > /dev/null 2>&1
	for family in 4 6; do
		while ip -"$family" rule del table "$TPROXY_TABLE" > /dev/null 2>&1; do :; done
		ip -"$family" route flush table "$TPROXY_TABLE" > /dev/null 2>&1
	done
}

# ---------- routeros: the rules ----------

# a line of a rule: $1 the menu (ip/firewall/mangle), $2 where it goes, then key=value
# top: before the other rules of its chain, fasttrack: before the fasttrack rule (dropped when there is none), empty: at the end
fw_rule() {
	local line arg
	line="$1$TAB$2"
	shift 2
	for arg in "$@"; do
		line="$line$TAB$arg"
	done
	printf '%s\n' "$line"
}

# rules matching the selected devices, $1 menu, $2 chain, $3 target chain, $4 family (4/6)
# exclude: selected devices return, everyone else goes to the target; include: only selected devices go to the target
fw_ros_access() {
	local menu chain target family action jump item
	menu="$1"
	chain="$2"
	target="$3"
	family="$4"
	if [ "$fw_mode" = "include" ]; then
		action="action=jump"
		jump="jump-target=$target"
	else
		action="action=return"
		jump=
	fi
	for item in $fw_items_mac; do
		fw_rule "$menu" "" "chain=$chain" "$action" ${jump:+"$jump"} "src-mac-address=$item"
	done
	if [ "$family" = 4 ]; then
		for item in $fw_items_ip4; do
			fw_rule "$menu" "" "chain=$chain" "$action" ${jump:+"$jump"} "src-address=$item"
		done
	else
		for item in $fw_items_ip6; do
			fw_rule "$menu" "" "chain=$chain" "$action" ${jump:+"$jump"} "src-address=$item"
		done
	fi
	[ -n "$fw_items_ap" ] && fw_rule "$menu" "" "chain=$chain" "$action" ${jump:+"$jump"} "src-address-list=$LIST_AP"
	if [ -n "$fw_items_iface" ]; then
		while IFS= read -r item; do
			fw_rule "$menu" "" "chain=$chain" "$action" ${jump:+"$jump"} "in-interface=$item"
		done <<-EOF
			$fw_items_iface
		EOF
	fi
	[ "$fw_mode" = "include" ] || fw_rule "$menu" "" "chain=$chain" "action=jump" "jump-target=$target"
}

# devices are chosen: in the include mode nothing goes to the container without them
fw_ros_any() {
	[ "$fw_mode" != "include" ] || [ -n "$fw_items_mac$fw_items_ap$fw_items_iface" ] \
		|| { [ "$1" = 4 ] && [ -n "$fw_items_ip4" ]; } || { [ "$1" = 6 ] && [ -n "$fw_items_ip6" ]; }
}

# tcp and udp on the ports to proxy jump to $3, $1 menu, $2 chain
fw_ros_ports() {
	local menu chain target proto chunks chunk
	menu="$1"
	chain="$2"
	target="$3"
	for proto in tcp udp; do
		if [ "$proto" = "tcp" ]; then
			[ -n "$fw_tcp_mode" ] || continue
			chunks="$fw_tcp_ports"
		else
			[ -n "$fw_udp_mode" ] || continue
			chunks="$fw_udp_ports"
		fi
		if [ -z "$chunks" ]; then
			fw_rule "$menu" "" "chain=$chain" "action=jump" "jump-target=$target" "protocol=$proto"
		fi
		for chunk in $chunks; do
			fw_rule "$menu" "" "chain=$chain" "action=jump" "jump-target=$target" "protocol=$proto" "dst-port=$chunk"
		done
	done
}

# the rules of one family, $1 family (4/6), $2 the veth of the container in routeros
fw_ros_family() {
	local family veth ip any cip fake reserved to from mangle nat filter net dscp
	family="$1"
	veth="$2"
	if [ "$family" = 4 ]; then
		ip="ip"
		any="0.0.0.0/0"
		cip="$fw_ip4"
		fake="$fw_fake4"
		reserved="$fw_reserved4"
		to="to-addresses"
	else
		ip="ipv6"
		any="::/0"
		cip="$fw_ip6"
		fake="$fw_fake6"
		reserved="$fw_reserved6"
		to="to-address"
	fi
	[ -n "$cip" ] || return 0
	mangle="$ip/firewall/mangle"
	nat="$ip/firewall/nat"
	filter="$ip/firewall/filter"
	# from the local network: the interface list, or anything but the container
	if [ -n "$fw_lan_list" ]; then
		from="in-interface-list=$fw_lan_list"
	else
		from="in-interface=!$veth"
	fi

	for net in $reserved; do
		fw_rule "$ip/firewall/address-list" "" "list=$LIST_DIRECT" "address=$net"
	done
	# an unreachable container makes the route inactive, the marked traffic falls back to the main table
	fw_rule "$ip/route" "" "dst-address=$any" "gateway=$cip" "routing-table=$ROS_TABLE" "check-gateway=ping"

	if fw_ros_any "$family" || [ -n "$fake$fw_dscp_proxy$fw_dscp_force" ]; then
		fw_rule "$mangle" top "chain=prerouting" "action=jump" "jump-target=exodus-pre" "$from"
		fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "in-interface=$veth"
		fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "dst-address-type=local"
		if [ "$fw_dns" = 1 ]; then
			# dns goes to the core in nat
			fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "protocol=udp" "dst-port=53"
			fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "protocol=tcp" "dst-port=53"
		fi
		[ -n "$fake" ] && fw_rule "$mangle" "" "chain=exodus-pre" "action=jump" "jump-target=exodus-do" "dst-address=$fake"
		[ -n "$reserved" ] && fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "dst-address-list=$LIST_DIRECT"
		if [ -n "$fw_force_redir_port$fw_force_tproxy_port" ]; then
			fw_rule "$mangle" "" "chain=exodus-pre" "action=jump" "jump-target=exodus-do" "dscp=$fw_dscp_force"
		fi
		for dscp in $fw_dscp_bypass; do
			fw_rule "$mangle" "" "chain=exodus-pre" "action=return" "dscp=$dscp"
		done
		for dscp in $fw_dscp_proxy; do
			fw_rule "$mangle" "" "chain=exodus-pre" "action=jump" "jump-target=exodus-do" "dscp=$dscp"
		done
		if fw_ros_any "$family"; then
			fw_ros_ports "$mangle" exodus-pre exodus-ac
			fw_ros_access "$mangle" exodus-ac exodus-do "$family"
		fi
		fw_rule "$mangle" "" "chain=exodus-do" "action=mark-routing" "new-routing-mark=$ROS_TABLE" "passthrough=no"
	fi

	if [ "$fw_router" = 1 ]; then
		fw_rule "$mangle" top "chain=output" "action=jump" "jump-target=exodus-out"
		fw_rule "$mangle" "" "chain=exodus-out" "action=return" "dst-address-type=local"
		fw_rule "$mangle" "" "chain=exodus-out" "action=return" "dst-address=$cip"
		fw_rule "$mangle" "" "chain=exodus-out" "action=return" "protocol=udp" "dst-port=53"
		fw_rule "$mangle" "" "chain=exodus-out" "action=return" "protocol=tcp" "dst-port=53"
		[ -n "$fake" ] && fw_rule "$mangle" "" "chain=exodus-out" "action=mark-routing" "new-routing-mark=$ROS_TABLE" "passthrough=no" "dst-address=$fake"
		[ -n "$reserved" ] && fw_rule "$mangle" "" "chain=exodus-out" "action=return" "dst-address-list=$LIST_DIRECT"
		for dscp in $fw_dscp_bypass; do
			fw_rule "$mangle" "" "chain=exodus-out" "action=return" "dscp=$dscp"
		done
		fw_ros_ports "$mangle" exodus-out exodus-out-do
		fw_rule "$mangle" "" "chain=exodus-out-do" "action=mark-routing" "new-routing-mark=$ROS_TABLE" "passthrough=no"
	fi

	if [ "$fw_dns" = 1 ] && fw_ros_any "$family"; then
		fw_rule "$nat" top "chain=dstnat" "action=jump" "jump-target=exodus-dns" "protocol=udp" "dst-port=53" "$from"
		fw_rule "$nat" top "chain=dstnat" "action=jump" "jump-target=exodus-dns" "protocol=tcp" "dst-port=53" "$from"
		fw_rule "$nat" "" "chain=exodus-dns" "action=return" "in-interface=$veth"
		fw_ros_access "$nat" exodus-dns exodus-dns-do "$family"
		fw_rule "$nat" "" "chain=exodus-dns-do" "action=dst-nat" "$to=$cip" "to-ports=$fw_dns_port"
	fi

	# both directions of a proxied connection pass before fasttrack: a fasttracked packet skips mangle and the routing mark
	fw_rule "$filter" fasttrack "chain=forward" "action=accept" "connection-state=established,related" "routing-mark=$ROS_TABLE"
	fw_rule "$filter" fasttrack "chain=forward" "action=accept" "connection-state=established,related" "in-interface=$veth" "src-address=!$cip"
}

# the script of netwatch: the rules are turned off, the container turns them on again when it is back
fw_netwatch_script() {
	local menu script
	script=
	for menu in "/ip firewall mangle" "/ip firewall nat" "/ip firewall filter" "/ip route" "/ipv6 firewall mangle" "/ipv6 firewall nat" "/ipv6 firewall filter" "/ipv6 route"; do
		script="$script$menu disable [find where comment~\"^$ROS_COMMENT:proxy \"]; "
	done
	printf '%s' "${script% }"
}

# all rules of the proxy, $1 the veth of the container in routeros
fw_ros_proxy_rules() {
	fw_ros_family 4 "$1"
	[ "$fw_v6" = 1 ] && fw_ros_family 6 "$1"
	[ -n "$fw_ip4" ] && fw_rule tool/netwatch "" "host=$fw_ip4" "type=simple" "interval=10s" "down-script=$(fw_netwatch_script)"
}

# the web ui, the api of the core and the proxy port on the addresses of the router, kept while the container runs
fw_ros_web_rules() {
	local ip4 lan ports
	ip4=$(net_address 4 "$(net_iface)")
	lan=$(cfg_get .routeros.lan_list | fw_filter_name | head -n 1)
	[ -n "$ip4" ] && [ -n "$lan" ] || return 0
	ports=$(jq -r --slurpfile profile "$PROFILE_JSON_PATH" '
		[(.web.port // 9099), (.mixin.api_port // 9090), (.mixin.mixed_port // ($profile[0] // {})["mixed-port"] // 7890)]
		| map(tostring | select(length > 0)) | unique | join(",")' "$CONFIG_PATH" 2> /dev/null) \
		|| ports=$(jq -r '[(.web.port // 9099), (.mixin.api_port // 9090), (.mixin.mixed_port // 7890)] | map(tostring) | unique | join(",")' "$CONFIG_PATH" 2> /dev/null)
	[ -n "$ports" ] || return 0
	fw_rule ip/firewall/nat top "chain=dstnat" "action=dst-nat" "protocol=tcp" "dst-address-type=local" "dst-port=$ports" "in-interface-list=$lan" "to-addresses=$ip4"
}

# rule lines into json: [{path, place, rule}]
fw_ros_json() {
	jq -R -s -c --arg tab "$TAB" '
		split("\n") | map(select(length > 0) | split($tab)
			| {path: .[0], place: .[1], rule: (.[2:] | map(index("=") as $i | {(.[:$i]): .[$i + 1:]}) | add // {})})'
}

# errors of the rules are logged once until they change
fw_ros_report() {
	local path before
	path="$RUN_TMP/routeros_rules.err"
	before=$(cat "$path" 2> /dev/null)
	if [ -z "$1" ]; then
		[ -n "$before" ] && log "RouterOS" "The rules are applied."
		rm -f "$path"
		return 0
	fi
	if [ "$1" != "$before" ]; then
		printf '%s' "$1" > "$path"
		log "RouterOS" "$1"
	fi
}

# the query that keeps a request small: address lists and routes of a router may have hundreds of thousands of entries
fw_ros_query() {
	case "$1" in
		*/address-list) echo "list=$LIST_DIRECT&" ;;
		*/route) echo "routing-table=$ROS_TABLE&" ;;
	esac
}

# remove the rules of a menu by their ids, several at once, one by one when the router does not take a list
fw_ros_remove() {
	local path ids id
	path="$1"
	ids="$2"
	[ -n "$ids" ] || return 0
	ros_call POST "$path/remove" "$(jq -n -c --arg ids "$ids" '{".id": $ids}')" > /dev/null && return 0
	for id in $(echo "$ids" | tr ',' ' '); do
		ros_call DELETE "$path/$id" > /dev/null
	done
}

# bring the rules of a group in one menu to the desired ones; $1 group, $2 menu, $3 desired rules (json), $4 "check" only checks
fw_ros_sync_path() {
	local group path desired current want hash plan ok ids first fasttrack count i item answer error
	group="$1"
	path="$2"
	desired="$3"
	if ! current=$(ros_call GET "$path?$(fw_ros_query "$path").proplist=.id,comment,disabled,dynamic,chain,action"); then
		error=$(ros_error "$current")
		# a menu of a package that is not installed, ipv6 turned off: nothing to keep there
		if [ "$(printf '%s' "$desired" | jq --arg path "$path" '[.[] | select(.path == $path)] | length' 2> /dev/null)" = 0 ]; then
			return 0
		fi
		echo "$path: $error"
		return 1
	fi
	printf '%s' "$current" | jq -e 'type == "array"' > /dev/null 2>&1 || current='[]'
	want=$(printf '%s' "$desired" | jq -c --arg path "$path" --argjson current "$current" '
		([$current[] | select(.action == "fasttrack-connection" and (.dynamic // "false") != "true" and (.disabled // "false") != "true")] | length > 0) as $fasttrack
		| [.[] | select(.path == $path and (.place != "fasttrack" or $fasttrack))]')
	hash=$(printf '%s' "$want" | md5sum | cut -c 1-8)
	plan=$(jq -n -c --argjson want "$want" --argjson current "$current" --arg prefix "$ROS_COMMENT:$group " --arg any "$ROS_COMMENT:" --arg hash "$hash" '
		def ours: (.comment // "") | startswith($prefix);
		def mine: (.comment // "") | startswith($any);
		def static: (.dynamic // "false") != "true";
		($want | length) as $n
		| [range(0; $n) | "\($prefix)\(. + 1)/\($n) \($hash)"] as $comments
		| ($current | to_entries) as $all
		| [$all[] | select(.value | ours)] as $have
		| ($all | map(select((.value | mine | not) and (.value | static)))) as $foreign
		| ([$all[] | select(.value.action == "fasttrack-connection" and (.value | static))][0].key // null) as $fasttrack
		| (($have | map(.value.comment)) == $comments) as $same
		| ($same and ($have | all((.value.disabled // "false") != "true"))
			and ([range(0; $n) | . as $i | $want[$i] as $w | $have[$i].key as $at
				| if $w.place == "top" then all($foreign[]; .value.chain != $w.rule.chain or .key > $at)
				  elif $w.place == "fasttrack" then ($fasttrack == null or $at < $fasttrack)
				  else true end] | all)) as $ok
		| {ok: $ok, remove: ($have | map(.value[".id"]) | join(",")), comments: $comments,
		   first: ($foreign[0].value[".id"] // null), fasttrack: (if $fasttrack == null then null else $current[$fasttrack][".id"] end)}')
	ok=$(printf '%s' "$plan" | jq -r '.ok')
	[ "$ok" = true ] && return 0
	[ "$4" = "check" ] && return 1

	fw_ros_remove "$path" "$(printf '%s' "$plan" | jq -r '.remove')"
	count=$(printf '%s' "$want" | jq 'length')
	[ "$count" -gt 0 ] || return 0
	# the ids of the other rules stay, the removed ones are not among them
	first=$(printf '%s' "$plan" | jq -r '.first // empty')
	fasttrack=$(printf '%s' "$plan" | jq -r '.fasttrack // empty')
	error=
	i=0
	while [ "$i" -lt "$count" ]; do
		item=$(printf '%s' "$want" | jq -c --argjson i "$i" --argjson plan "$plan" --arg first "$first" --arg fasttrack "$fasttrack" '
			.[$i] as $w
			| $w.rule + {comment: $plan.comments[$i]}
			+ (if $w.place == "top" and $first != "" then {"place-before": $first}
			   elif $w.place == "fasttrack" and $fasttrack != "" then {"place-before": $fasttrack}
			   else {} end)')
		if ! answer=$(ros_call POST "$path/add" "$item"); then
			[ -n "$error" ] || error="$path: $(ros_error "$answer") ($(printf '%s' "$item" | jq -r 'del(.comment) | to_entries | map("\(.key)=\(.value)") | join(" ")'))"
		fi
		i=$((i + 1))
	done
	if [ -n "$error" ]; then
		echo "$error"
		return 1
	fi
	return 0
}

# bring a group to the desired rules, $1 group, $2 desired rules (json), $3 menus, $4 "check" only checks
fw_ros_sync() {
	local path error errors
	errors=
	for path in $3; do
		if ! error=$(fw_ros_sync_path "$1" "$path" "$2" "$4"); then
			[ "$4" = "check" ] && return 1
			errors="${errors:+$errors; }$error"
		fi
	done
	if [ -n "$errors" ]; then
		echo "$errors"
		return 1
	fi
	return 0
}

# remove everything of a group from the menus, $1 group, $2 menus
fw_ros_clean() {
	local path current
	for path in $2; do
		current=$(ros_json "$path?$(fw_ros_query "$path").proplist=.id,comment" '[]')
		fw_ros_remove "$path" "$(printf '%s' "$current" | jq -r --arg prefix "$ROS_COMMENT:$1 " '[.[]? | select((.comment // "") | startswith($prefix)) | .[".id"]] | join(",")' 2> /dev/null)"
	done
}

# the routing table of exodus, the installer adds it; an install without it gets one
fw_ros_table() {
	local tables
	tables=$(ros_json "routing/table?name=$ROS_TABLE&.proplist=name" '[]')
	[ "$(printf '%s' "$tables" | jq 'length' 2> /dev/null)" = 0 ] || return 0
	ros_call POST routing/table/add "{\"name\": \"$ROS_TABLE\", \"fib\": \"\", \"comment\": \"$ROS_COMMENT setup\"}" > /dev/null \
		|| ros_call POST routing/table/add "{\"name\": \"$ROS_TABLE\", \"fib\": \"yes\", \"comment\": \"$ROS_COMMENT setup\"}" > /dev/null
}

fw_ros_paths() {
	if [ "$fw_v6" = 1 ] || [ "$1" = "all" ]; then
		echo "$ROS_PROXY_PATHS4 $ROS_PROXY_PATHS6"
	else
		echo "$ROS_PROXY_PATHS4"
	fi
}

# the rules of the proxy in routeros, $1 "check" only checks them
fw_ros_start() {
	local veth desired error
	ros_load
	veth=$(ros_veth)
	[ -n "$veth" ] || veth=$(net_iface)
	if [ "$1" = "check" ]; then
		desired=$(fw_ros_proxy_rules "$veth" | fw_ros_json)
		fw_ros_sync proxy "$desired" "$(fw_ros_paths)" check > /dev/null
		return
	fi
	if ! ros_check; then
		fw_ros_report "The rules are not applied, no connection to RouterOS: $(jq -r '.error // empty' "$ROUTEROS_STATE_PATH" 2> /dev/null)."
		return 1
	fi
	fw_ros_table
	desired=$(fw_ros_proxy_rules "$veth" | fw_ros_json)
	# ipv6 turned off: its menus are cleaned too
	if ! error=$(fw_ros_sync proxy "$desired" "$(fw_ros_paths all)"); then
		fw_ros_report "Failed to apply the rules: $error"
		return 1
	fi
	fw_ap_sync init
	fw_ros_report ""
}

fw_ros_intact() {
	fw_ros_start check
}

# the web ui on the addresses of the router
fw_ros_web() {
	local desired error
	ros_load
	desired=$(fw_ros_web_rules | fw_ros_json)
	if ! error=$(fw_ros_sync web "$desired" ip/firewall/nat); then
		log "RouterOS" "Failed to forward the web UI: $error"
		return 1
	fi
}

# the clients of the chosen wi-fi points in the address list exodus-ap; $1 is "init" on start, it removes what is left without points
fw_ap_sync() {
	local addresses family ip want current add remove address
	if [ -z "$fw_items_ap" ] && [ "$1" != "init" ]; then
		return 0
	fi
	addresses=
	if [ -n "$fw_items_ap" ]; then
		addresses=$(ros_ap_addresses "$(printf '%s\n' "$fw_items_ap" | jq -R . | jq -s -c 'map(select(length > 0))')")
	fi
	for family in 4 6; do
		[ "$family" = 6 ] && [ "$fw_v6" != 1 ] && [ "$1" != "init" ] && continue
		if [ "$family" = 4 ]; then ip="ip"; else ip="ipv6"; fi
		want=$(printf '%s\n' "$addresses" | awk -v f="$family" '$1 == f { print $2 }' | sort -u | jq -R . | jq -s -c .)
		[ "$family" = 6 ] && [ "$fw_v6" != 1 ] && want='[]'
		current=$(ros_json "$ip/firewall/address-list?list=$LIST_AP&.proplist=.id,address,comment" '[]')
		remove=$(printf '%s' "$current" | jq -r --argjson want "$want" --arg comment "$ROS_COMMENT:ap" \
			'[.[]? | select(.comment == $comment and ((.address // "") as $a | $want | index($a) | not)) | .[".id"]] | join(",")' 2> /dev/null)
		add=$(printf '%s' "$current" | jq -r --argjson want "$want" --arg comment "$ROS_COMMENT:ap" \
			'[.[]? | select(.comment == $comment) | .address] as $have | $want[] | select(. as $a | $have | index($a) | not)' 2> /dev/null)
		fw_ros_remove "$ip/firewall/address-list" "$remove"
		for address in $add; do
			ros_call POST "$ip/firewall/address-list/add" "$(jq -n -c --arg list "$LIST_AP" --arg address "$address" --arg comment "$ROS_COMMENT:ap" \
				'{list: $list, address: $address, comment: $comment}')" > /dev/null
		done
	done
}

fw_ap_clean() {
	local ip current
	for ip in ip ipv6; do
		current=$(ros_json "$ip/firewall/address-list?list=$LIST_AP&.proplist=.id,comment" '[]')
		fw_ros_remove "$ip/firewall/address-list" "$(printf '%s' "$current" | jq -r --arg comment "$ROS_COMMENT:ap" '[.[]? | select(.comment == $comment) | .[".id"]] | join(",")' 2> /dev/null)"
	done
}

# ---------- start and stop ----------

# the container and the router; the rules of the router go last, the container must take the traffic first
fw_start() {
	local failed
	fw_env || return 1
	failed=0
	fw_nft_start || failed=1
	fw_ros_start || failed=1
	return "$failed"
}

fw_intact() {
	fw_nft_intact && fw_ros_intact
}

# the rules of the router go first, the traffic must not wait for a stopped core
# an unreachable router is not waited for, its netwatch turns the rules off
fw_clean() {
	if ros_check > /dev/null; then
		fw_ros_clean proxy "$ROS_PROXY_PATHS4 $ROS_PROXY_PATHS6"
		fw_ap_clean
	fi
	fw_nft_clean
}
