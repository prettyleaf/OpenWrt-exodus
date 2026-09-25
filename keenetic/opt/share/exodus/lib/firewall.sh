#!/bin/sh
# shellcheck shell=sh

# transparent proxy rules for keenetic: iptables and ipset instead of nftables
#
# ndm rebuilds its iptables tables on many events and drops everything it does not know,
# so the rules are built from $FIREWALL_ENV_PATH, saved on start, and applied again
# from the netfilter.d hook with iptables-restore --noflush, atomically per table
#
# nat PREROUTING  -> EXODUS_PRE: dns of lan clients to the core, tcp to the redirect port
#                    it is inserted first, before the dns redirects of ndm (internet filter, dns profiles),
#                    so the core resolves regardless of the dns settings of the router
# mangle PREROUTING -> EXODUS_MANGLE: udp (and tcp in tproxy mode) to the tproxy port
# filter INPUT    -> EXODUS_INPUT: accept redirected traffic, guest segments drop it otherwise
# nat/mangle OUTPUT -> router proxy, off by default
#
# dscp like xkeen: 61 forces a separate listener with a chosen proxy, 62 bypasses, 63 proxies the device anyway
# no regex in jq here: jq of entware is built without oniguruma

SET_MAC="exodus_mac"
SET_SRC4="exodus_src4"
SET_SRC6="exodus_src6"
SET_RSV4="exodus_rsv4"
SET_RSV6="exodus_rsv6"
SET_LOCAL4="exodus_local4"
SET_LOCAL6="exodus_local6"
SET_DENY="exodus_deny"

FW_CHAINS_NAT="EXODUS_PRE EXODUS_LAN EXODUS_DNS EXODUS_DNS_DO EXODUS_REDIR EXODUS_REDIR_PORTS EXODUS_REDIR_AC EXODUS_REDIR_DO EXODUS_OUT EXODUS_OUT_PORTS"
FW_CHAINS_MANGLE="EXODUS_MANGLE EXODUS_TP EXODUS_TP_PORTS EXODUS_TP_AC EXODUS_TP_DO EXODUS_MOUT EXODUS_MOUT_PORTS EXODUS_MOUT_DO"
FW_CHAINS_FILTER="EXODUS_INPUT"

# split "80 443 1000-2000" into iptables multiport chunks of at most 15 ports, a range counts twice
# prints nothing when all ports are proxied
fw_port_chunks() {
	case "$1" in
		""|"0-65535"|"1-65535"|"0:65535"|"1:65535") return ;;
	esac
	# shellcheck disable=SC2020
	echo "$1" | tr ', ' '\n\n' | awk '
		/^[0-9]+([-:][0-9]+)?$/ {
			gsub(/-/, ":")
			w = index($0, ":") ? 2 : 1
			if (n + w > 15) { print chunk; chunk = ""; n = 0 }
			chunk = chunk (chunk == "" ? "" : ",") $0
			n += w
		}
		END { if (chunk != "") print chunk }' | tr '\n' ' '
}

fw_load_modules() {
	local dir module path
	dir="/lib/modules/$(uname -r)"
	for module in nf_defrag_ipv6 nf_tproxy_ipv4 nf_tproxy_ipv6 xt_TPROXY xt_socket xt_dscp xt_multiport xt_mark xt_conntrack xt_mac xt_set ip_set ip_set_hash_mac ip_set_hash_net; do
		grep -q "^$module " /proc/modules 2> /dev/null && continue
		for path in "$dir/$module.ko" "$EXODUS_OPT/lib/modules/$(uname -r)/$module.ko"; do
			if [ -f "$path" ]; then
				insmod "$path" > /dev/null 2>&1
				break
			fi
		done
	done
}

fw_has_target() {
	grep -q "^$1$" /proc/net/ip_tables_targets 2> /dev/null
}

# global ipv6 addresses exist, otherwise the clients have no ipv6 internet and ipv6 rules are skipped
fw_ipv6_active() {
	[ -r /proc/net/if_inet6 ] && awk '$4 == "00" && $6 != "lo" { found = 1 } END { exit !found }' /proc/net/if_inet6
}

# words of a list matching a regex, values end up in iptables rules and in a sourced file
fw_words() {
	# shellcheck disable=SC2086
	[ -n "$2" ] && printf '%s\n' $2 | grep -E "^($1)\$" | tr '\n' ' ' | sed 's/ $//'
}

FW_IFACE='[A-Za-z0-9_.+-]{1,15}'
FW_NUMBER='[0-9]{1,5}'

# a line of the env file, the value is quoted for the shell
fw_var() {
	printf "%s='%s'\n" "$1" "$(printf '%s' "$2" | sed "s/'/'\\\\''/g")"
}

# compute everything the rules need and save it, the hooks apply exactly what the start computed
# expects cfg_load and profile_params (p_* variables) to be done
fw_prepare() {
	local item items_mac items_ip4 items_ip6 items_iface items_ap tp_protos v4 v6 v6_nat mac_set
	v4=0
	v6=0
	v6_nat=0
	command -v iptables > /dev/null 2>&1 && v4=1
	if [ "$c_proxy_ipv6" = 1 ] && command -v ip6tables > /dev/null 2>&1 && fw_ipv6_active; then
		v6=1
		ip6tables -w -t nat -S > /dev/null 2>&1 && v6_nat=1
	fi

	for item in $c_proxy_access_items; do
		case "$item" in
			mac:*) items_mac="$items_mac ${item#mac:}" ;;
			ip:*) items_ip4="$items_ip4 ${item#ip:}" ;;
			ip6:*) items_ip6="$items_ip6 ${item#ip6:}" ;;
			iface:*) items_iface="$items_iface ${item#iface:}" ;;
			ap:*) items_ap="$items_ap ${item#ap:}" ;;
		esac
	done
	items_mac=$(fw_list "$items_mac" | fw_filter_mac | tr '\n' ' ')
	items_ip4=$(fw_list "$items_ip4" | fw_filter_ip4 | tr '\n' ' ')
	items_ip6=$(fw_list "$items_ip6" | fw_filter_ip6 | tr '\n' ' ')
	items_iface=$(fw_words "$FW_IFACE" "$items_iface")
	items_ap=$(fw_words '[A-Za-z0-9]+/[A-Za-z0-9]+' "$items_ap")

	tp_protos=
	[ "$c_proxy_udp_mode" = "tproxy" ] && tp_protos="udp"
	[ "$c_proxy_tcp_mode" = "tproxy" ] && tp_protos="${tp_protos:+$tp_protos }tcp"

	# hash:mac needs a recent kernel, without it macs of devices are matched one by one and wi-fi points are not supported
	mac_set=0
	if ipset create "$SET_MAC" hash:mac -exist > /dev/null 2>&1; then
		mac_set=1
	fi

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
		fake4=$(echo "${p_fake_ip_range:-198.18.0.1/16}" | fw_filter_ip4)
		fake6=$(echo "$p_fake_ip6_range" | fw_filter_ip6)
	fi
	local mode; mode="exclude"
	[ "$c_proxy_access_mode" = "include" ] && mode="include"
	local tcp_mode udp_mode
	tcp_mode=
	udp_mode=
	case "$c_proxy_tcp_mode" in redirect|tproxy) tcp_mode="$c_proxy_tcp_mode" ;; esac
	[ "$c_proxy_udp_mode" = "tproxy" ] && udp_mode="tproxy"

	{
		fw_var fw_v4 "$v4"
		fw_var fw_v6 "$v6"
		fw_var fw_v6_nat "$v6_nat"
		fw_var fw_proxy4 1
		fw_var fw_proxy6 "$c_proxy_ipv6"
		fw_var fw_dns4 "$c_proxy_dns_hijack"
		fw_var fw_dns6 "$c_proxy_dns_hijack"
		fw_var fw_ping 1
		fw_var fw_router "$c_proxy_router_proxy"
		fw_var fw_lan 1
		fw_var fw_inbound "br+"
		fw_var fw_mode "$mode"
		fw_var fw_items_mac "$items_mac"
		fw_var fw_items_ip4 "$items_ip4"
		fw_var fw_items_ip6 "$items_ip6"
		fw_var fw_items_iface "$items_iface"
		fw_var fw_items_ap "$items_ap"
		fw_var fw_mac_set "$mac_set"
		fw_var fw_parental "$c_proxy_respect_parental_control"
		fw_var fw_tcp_mode "$tcp_mode"
		fw_var fw_udp_mode "$udp_mode"
		fw_var fw_tp_protos "$tp_protos"
		fw_var fw_tcp_ports "$(fw_port_chunks "$c_proxy_proxy_tcp_dport")"
		fw_var fw_udp_ports "$(fw_port_chunks "$c_proxy_proxy_udp_dport")"
		fw_var fw_dscp_force "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_force")"
		fw_var fw_dscp_bypass "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_bypass")"
		fw_var fw_dscp_proxy "$(fw_words '[0-9]|[1-5][0-9]|6[0-3]' "$c_proxy_dscp_proxy")"
		fw_var fw_reserved4 "$c_proxy_reserved_ip"
		fw_var fw_reserved6 "$c_proxy_reserved_ip6"
		fw_var fw_mark "$TPROXY_MARK"
		fw_var fw_mask "$TPROXY_MASK"
		fw_var fw_pref "$TPROXY_RULE_PREF"
		fw_var fw_table "$TPROXY_TABLE"
		fw_var fw_core_mark "$CORE_MARK"
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

# refill an ipset atomically from stdin, one entry per line
# $1 name, the rest is the set type and options
fw_set_load() {
	local name; name="$1"
	shift
	ipset create "$name" "$@" -exist 2> /dev/null || return 1
	ipset create "${name}_new" "$@" -exist 2> /dev/null || return 1
	ipset flush "${name}_new"
	awk -v set="${name}_new" 'NF { print "add " set " " $1 " -exist" }' | ipset restore -exist 2> /dev/null
	ipset swap "${name}_new" "$name"
	ipset destroy "${name}_new"
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

fw_filter_ip6() {
	grep -E '^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*(/[0-9]{1,3})?$'
}

# static sets: reserved destinations and selected devices
fw_sets_static() {
	fw_list "$fw_reserved4" | fw_filter_ip4 | fw_set_load "$SET_RSV4" hash:net family inet
	fw_list "$fw_items_ip4" | fw_filter_ip4 | fw_set_load "$SET_SRC4" hash:net family inet
	if [ "$fw_v6" = 1 ]; then
		fw_list "$fw_reserved6" | fw_filter_ip6 | fw_set_load "$SET_RSV6" hash:net family inet6
		fw_list "$fw_items_ip6" | fw_filter_ip6 | fw_set_load "$SET_SRC6" hash:net family inet6
	fi
}

# addresses of the router, the wan address changes on reconnect
fw_sets_local() {
	ip -o -4 addr show 2> /dev/null | awk '{ split($4, a, "/"); print a[1] }' | fw_filter_ip4 | fw_set_load "$SET_LOCAL4" hash:net family inet
	if [ "$fw_v6" = 1 ]; then
		ip -o -6 addr show 2> /dev/null | awk '{ split($4, a, "/"); print a[1] }' | fw_filter_ip6 | fw_set_load "$SET_LOCAL6" hash:net family inet6
	fi
}

# sets from the router: devices on the chosen wi-fi points, devices blocked by parental control
# $1 is "init" on start, then a failed rci request fills the sets without the rci part instead of keeping them
fw_sets_rci() {
	local hotspot associations aps
	hotspot=
	associations=
	if [ -n "$fw_items_ap" ] || [ "$fw_parental" = 1 ]; then
		hotspot=$(rci_get "show/ip/hotspot")
	fi
	if [ -n "$fw_items_ap" ]; then
		associations=$(rci_get "show/associations")
	fi

	if [ "$fw_mac_set" = 1 ]; then
		if [ -z "$fw_items_ap" ] || [ -n "$hotspot$associations" ] || [ "$1" = "init" ]; then
			aps=$(fw_list "$fw_items_ap" | jq -R . | jq -s -c .)
			{
				fw_list "$fw_items_mac"
				if [ -n "$fw_items_ap" ]; then
					echo "$hotspot" | jq -r --argjson aps "$aps" '
						((.host // .) | if type == "array" then .[] else empty end)
						| select((.ap // "") as $ap | $aps | index($ap))
						| select(.active != false and .link != "down")
						| .mac // empty' 2> /dev/null
					echo "$associations" | jq -r --argjson aps "$aps" '
						((.station // .) | if type == "array" then .[] else empty end)
						| select((.ap // "") as $ap | $aps | index($ap))
						| .mac // empty' 2> /dev/null
				fi
			} | fw_filter_mac | sort -u | fw_set_load "$SET_MAC" hash:mac
		fi
	fi

	if [ "$fw_parental" = 1 ] && [ "$fw_mac_set" = 1 ]; then
		# keep the set when rci does not answer, otherwise blocked devices get internet through the core
		if [ -n "$hotspot" ] || [ "$1" = "init" ]; then
			echo "$hotspot" | jq -r '
				((.host // .) | if type == "array" then .[] else empty end)
				| select(.access == "deny")
				| .mac // empty' 2> /dev/null | fw_filter_mac | sort -u | fw_set_load "$SET_DENY" hash:mac
		fi
	fi
}

# rules matching the selected devices, $1 chain, $2 family (4/6), $3 target
# exclude: selected devices return, everyone else goes to the target; include: only selected devices go to the target
fw_access_control() {
	local chain family target match mac iface
	chain="$1"
	family="$2"
	target="$3"
	match="$target"
	[ "$fw_mode" = "include" ] || match="RETURN"
	if [ "$fw_mac_set" = 1 ]; then
		if [ -n "$fw_items_mac$fw_items_ap" ]; then
			echo "-A $chain -m set --match-set $SET_MAC src -j $match"
		fi
	else
		for mac in $fw_items_mac; do
			echo "-A $chain -m mac --mac-source $mac -j $match"
		done
	fi
	if [ "$family" = 4 ] && [ -n "$fw_items_ip4" ]; then
		echo "-A $chain -m set --match-set $SET_SRC4 src -j $match"
	fi
	if [ "$family" = 6 ] && [ -n "$fw_items_ip6" ]; then
		echo "-A $chain -m set --match-set $SET_SRC6 src -j $match"
	fi
	for iface in $fw_items_iface; do
		echo "-A $chain -i $iface -j $match"
	done
	[ "$fw_mode" = "include" ] || echo "-A $chain -j $target"
}

# destinations never proxied: the router itself and reserved networks
# fake-ip destinations are never bypassed, only the core knows the real address
fw_reserved() {
	echo "-A $1 -m set --match-set exodus_local$2 dst -j RETURN"
	echo "-A $1 -m set --match-set exodus_rsv$2 dst $3 -j RETURN"
}

# traffic marked by the devices to bypass the proxy
fw_bypass() {
	local dscp
	for dscp in $fw_dscp_bypass; do
		echo "-A $1 -m dscp --dscp $dscp $2 -j RETURN"
	done
}

# ports to proxy, $1 chain, $2 proto, $3 chunks, $4 target, $5 fake range
fw_ports() {
	local chunk
	if [ -z "$3" ]; then
		echo "-A $1 -p $2 -j $4"
		return
	fi
	for chunk in $3; do
		echo "-A $1 -p $2 -m multiport --dports $chunk -j $4"
	done
	[ -n "$5" ] && echo "-A $1 -p $2 -d $5 -j $4"
}

# print the iptables-restore input for one table, $1 family (4/6), $2 table
fw_build() {
	local family table ipt fake not_fake lo proxy dns icmp chain iface dscp proto deletes
	family="$1"
	table="$2"
	if [ "$family" = 4 ]; then
		ipt="iptables"
		fake="$fw_fake4"
		lo="127.0.0.1"
		proxy="$fw_proxy4"
		dns="$fw_dns4"
		icmp="-p icmp --icmp-type echo-request"
	else
		ipt="ip6tables"
		fake="$fw_fake6"
		lo="::1"
		proxy="$fw_proxy6"
		dns="$fw_dns6"
		icmp="-p ipv6-icmp --icmpv6-type echo-request"
	fi
	not_fake=
	[ -n "$fake" ] && not_fake="! -d $fake"
	[ -n "$fw_dns_port" ] || dns=0
	[ -n "$fw_redir_port" ] || [ "$fw_tcp_mode" != "redirect" ] || proxy=0
	[ -n "$fw_tproxy_port" ] || [ -z "$fw_tp_protos" ] || proxy=0

	echo "*$table"
	case "$table" in
		nat) for chain in $FW_CHAINS_NAT; do echo ":$chain - [0:0]"; done ;;
		mangle) for chain in $FW_CHAINS_MANGLE; do echo ":$chain - [0:0]"; done ;;
		filter) for chain in $FW_CHAINS_FILTER; do echo ":$chain - [0:0]"; done ;;
	esac
	# jumps are inserted first, remove the ones left from the previous run
	deletes=$("$ipt-save" -t "$table" 2> /dev/null | grep -E '^-A (PREROUTING|INPUT|OUTPUT) .*-j EXODUS_[A-Z_]+ *$' | sed 's/^-A /-D /')
	[ -n "$deletes" ] && echo "$deletes"

	case "$table" in
	nat)
		if [ "$fw_lan" = 1 ]; then
			echo "-I PREROUTING 1 -j EXODUS_PRE"
			[ "$fw_parental" = 1 ] && [ "$fw_mac_set" = 1 ] && echo "-A EXODUS_PRE -m set --match-set $SET_DENY src -j RETURN"
			for iface in $fw_inbound; do
				echo "-A EXODUS_PRE -i $iface -j EXODUS_LAN"
			done
			if [ "$dns" = 1 ]; then
				echo "-A EXODUS_LAN -p udp --dport 53 -j EXODUS_DNS"
				echo "-A EXODUS_LAN -p tcp --dport 53 -j EXODUS_DNS"
				fw_access_control EXODUS_DNS "$family" EXODUS_DNS_DO
				echo "-A EXODUS_DNS_DO -p udp -j REDIRECT --to-ports $fw_dns_port"
				echo "-A EXODUS_DNS_DO -p tcp -j REDIRECT --to-ports $fw_dns_port"
			fi
			if [ "$fw_ping" = 1 ] && [ "$proxy" = 1 ] && [ -n "$fake" ]; then
				echo "-A EXODUS_LAN $icmp -d $fake -j REDIRECT"
			fi
			if [ "$fw_tcp_mode" = "redirect" ] && [ "$proxy" = 1 ]; then
				echo "-A EXODUS_LAN -p tcp -j EXODUS_REDIR"
				fw_reserved EXODUS_REDIR "$family" "$not_fake"
				if [ -n "$fw_force_redir_port" ]; then
					echo "-A EXODUS_REDIR -p tcp -m dscp --dscp $fw_dscp_force -j REDIRECT --to-ports $fw_force_redir_port"
				fi
				fw_bypass EXODUS_REDIR "$not_fake"
				for dscp in $fw_dscp_proxy; do
					echo "-A EXODUS_REDIR -m dscp --dscp $dscp -j EXODUS_REDIR_DO"
				done
				if [ -n "$fw_tcp_ports" ]; then
					echo "-A EXODUS_REDIR -j EXODUS_REDIR_PORTS"
					fw_ports EXODUS_REDIR_PORTS tcp "$fw_tcp_ports" EXODUS_REDIR_AC "$fake"
				else
					echo "-A EXODUS_REDIR -j EXODUS_REDIR_AC"
				fi
				fw_access_control EXODUS_REDIR_AC "$family" EXODUS_REDIR_DO
				echo "-A EXODUS_REDIR_DO -p tcp -j REDIRECT --to-ports $fw_redir_port"
			fi
		fi
		if [ "$fw_router" = 1 ] && [ "$fw_tcp_mode" = "redirect" ] && [ "$proxy" = 1 ]; then
			echo "-I OUTPUT 1 -j EXODUS_OUT"
			echo "-A EXODUS_OUT -m mark --mark $fw_core_mark -j RETURN"
			echo "-A EXODUS_OUT -p tcp --dport 53 -j RETURN"
			fw_reserved EXODUS_OUT "$family" "$not_fake"
			fw_bypass EXODUS_OUT "$not_fake"
			fw_ports EXODUS_OUT tcp "$fw_tcp_ports" EXODUS_REDIR_DO "$fake"
			[ "$fw_lan" = 1 ] || echo "-A EXODUS_REDIR_DO -p tcp -j REDIRECT --to-ports $fw_redir_port"
		fi
		;;
	mangle)
		if [ -n "$fw_tp_protos" ] && [ "$proxy" = 1 ]; then
			echo "-I PREROUTING 1 -j EXODUS_MANGLE"
			for proto in $fw_tp_protos; do
				echo "-A EXODUS_TP_DO -p $proto -j TPROXY --on-port $fw_tproxy_port --on-ip $lo --tproxy-mark $fw_mark/$fw_mask"
			done
			if [ "$fw_router" = 1 ]; then
				# packets of the router marked in OUTPUT come back through lo
				echo "-A EXODUS_MANGLE -i lo -m mark --mark $fw_mark/$fw_mask -j EXODUS_TP_DO"
				echo "-I OUTPUT 1 -j EXODUS_MOUT"
				echo "-A EXODUS_MOUT -m mark --mark $fw_core_mark -j RETURN"
				echo "-A EXODUS_MOUT -p udp --dport 53 -j RETURN"
				echo "-A EXODUS_MOUT -p tcp --dport 53 -j RETURN"
				fw_reserved EXODUS_MOUT "$family" "$not_fake"
				fw_bypass EXODUS_MOUT "$not_fake"
				for proto in $fw_tp_protos; do
					if [ "$proto" = "tcp" ]; then
						fw_ports EXODUS_MOUT tcp "$fw_tcp_ports" EXODUS_MOUT_DO "$fake"
					else
						fw_ports EXODUS_MOUT udp "$fw_udp_ports" EXODUS_MOUT_DO "$fake"
					fi
					echo "-A EXODUS_MOUT_DO -p $proto -j MARK --set-mark $fw_mark/$fw_mask"
				done
			fi
			if [ "$fw_lan" = 1 ]; then
				[ "$fw_parental" = 1 ] && [ "$fw_mac_set" = 1 ] && echo "-A EXODUS_MANGLE -m set --match-set $SET_DENY src -j RETURN"
				for iface in $fw_inbound; do
					echo "-A EXODUS_MANGLE -i $iface -j EXODUS_TP"
				done
				echo "-A EXODUS_TP -m conntrack --ctdir REPLY -j RETURN"
				if [ "$dns" = 1 ]; then
					# dns is redirected to the core in nat
					echo "-A EXODUS_TP -p udp --dport 53 -j RETURN"
					echo "-A EXODUS_TP -p tcp --dport 53 -j RETURN"
				fi
				fw_reserved EXODUS_TP "$family" "$not_fake"
				if [ -n "$fw_force_tproxy_port" ]; then
					for proto in $fw_tp_protos; do
						echo "-A EXODUS_TP -p $proto -m dscp --dscp $fw_dscp_force -j TPROXY --on-port $fw_force_tproxy_port --on-ip $lo --tproxy-mark $fw_mark/$fw_mask"
					done
				fi
				fw_bypass EXODUS_TP "$not_fake"
				for dscp in $fw_dscp_proxy; do
					echo "-A EXODUS_TP -m dscp --dscp $dscp -j EXODUS_TP_DO"
				done
				if [ -n "$fw_tcp_ports$fw_udp_ports" ]; then
					echo "-A EXODUS_TP -j EXODUS_TP_PORTS"
					for proto in $fw_tp_protos; do
						if [ "$proto" = "tcp" ]; then
							fw_ports EXODUS_TP_PORTS tcp "$fw_tcp_ports" EXODUS_TP_AC "$fake"
						else
							fw_ports EXODUS_TP_PORTS udp "$fw_udp_ports" EXODUS_TP_AC "$fake"
						fi
					done
				else
					echo "-A EXODUS_TP -j EXODUS_TP_AC"
				fi
				fw_access_control EXODUS_TP_AC "$family" EXODUS_TP_DO
			fi
		fi
		;;
	filter)
		if [ "$fw_lan" = 1 ]; then
			echo "-I INPUT 1 -j EXODUS_INPUT"
			if [ "$dns" = 1 ]; then
				echo "-A EXODUS_INPUT -p udp --dport $fw_dns_port -m conntrack --ctstate DNAT -j ACCEPT"
				echo "-A EXODUS_INPUT -p tcp --dport $fw_dns_port -m conntrack --ctstate DNAT -j ACCEPT"
			fi
			if [ "$proxy" = 1 ]; then
				if [ "$fw_tcp_mode" = "redirect" ]; then
					echo "-A EXODUS_INPUT -p tcp --dport $fw_redir_port -m conntrack --ctstate DNAT -j ACCEPT"
					[ -n "$fw_force_redir_port" ] && echo "-A EXODUS_INPUT -p tcp --dport $fw_force_redir_port -m conntrack --ctstate DNAT -j ACCEPT"
				fi
				[ -n "$fw_tp_protos" ] && echo "-A EXODUS_INPUT -m mark --mark $fw_mark/$fw_mask -j ACCEPT"
				[ "$fw_ping" = 1 ] && [ -n "$fake" ] && echo "-A EXODUS_INPUT ${icmp%% --*} -m conntrack --ctstate DNAT -j ACCEPT"
			fi
		fi
		;;
	esac
	echo "COMMIT"
}

# apply one table, or all of them, $1 family (4/6/empty), $2 table (empty for all)
fw_apply() {
	local family table ipt blob error failed
	failed=0
	for family in 4 6; do
		[ -z "$1" ] || [ "$1" = "$family" ] || continue
		if [ "$family" = 4 ]; then
			[ "$fw_v4" = 1 ] || continue
			ipt="iptables"
		else
			[ "$fw_v6" = 1 ] || continue
			ipt="ip6tables"
		fi
		for table in nat mangle filter; do
			[ -z "$2" ] || [ "$2" = "$table" ] || continue
			[ "$family" = 6 ] && [ "$table" = "nat" ] && [ "$fw_v6_nat" != 1 ] && continue
			blob=$(fw_build "$family" "$table")
			# iptables-restore of entware (1.4.21) has no -w, the hook lock serializes the runs of exodus
			if ! error=$(echo "$blob" | "$ipt-restore" --noflush 2>&1); then
				log "Proxy" "Failed to apply $ipt $table rules: $(echo "$error" | head -n 1)"
				failed=1
			fi
		done
	done
	return "$failed"
}

fw_route_apply() {
	local family
	[ -n "$fw_tp_protos" ] || return 0
	for family in 4 6; do
		[ "$family" = 4 ] && [ "$fw_v4" != 1 ] && continue
		[ "$family" = 6 ] && [ "$fw_v6" != 1 ] && continue
		ip -"$family" route replace local default dev lo table "$fw_table" 2> /dev/null
		if ! ip -"$family" rule show 2> /dev/null | grep -q "lookup $fw_table *$"; then
			ip -"$family" rule add pref "$fw_pref" fwmark "$fw_mark/$fw_mask" table "$fw_table" 2> /dev/null
		fi
	done
}

# the jump is the first rule of the chain, ndm may insert its own rules above it
fw_first() {
	[ "$("$1" -w -t "$2" -S "$3" 2> /dev/null | sed -n '2p')" = "-A $3 -j $4" ]
}

# is the jump of every table still in place and first, ndm removes the rules on rebuild
fw_intact() {
	local family ipt
	for family in 4 6; do
		if [ "$family" = 4 ]; then
			[ "$fw_v4" = 1 ] || continue
			ipt="iptables"
		else
			[ "$fw_v6" = 1 ] || continue
			ipt="ip6tables"
		fi
		if [ "$fw_lan" = 1 ]; then
			fw_first "$ipt" filter INPUT EXODUS_INPUT || return 1
			if [ "$family" = 4 ] || [ "$fw_v6_nat" = 1 ]; then
				fw_first "$ipt" nat PREROUTING EXODUS_PRE || return 1
			fi
		fi
		if [ -n "$fw_tp_protos" ]; then
			fw_first "$ipt" mangle PREROUTING EXODUS_MANGLE || return 1
		fi
	done
	return 0
}

# start: modules, sets, routes and all tables
fw_start() {
	fw_env || return 1
	fw_load_modules
	if [ -n "$fw_tp_protos" ] && ! fw_has_target TPROXY; then
		log "Proxy" "TPROXY target is not available, install the Netfilter kernel modules component of the router."
	fi
	fw_sets_static
	fw_sets_local
	fw_sets_rci init
	fw_route_apply
	fw_apply
}

fw_clean() {
	local ipt table chain rules set family table_id
	for ipt in iptables ip6tables; do
		command -v "$ipt" > /dev/null 2>&1 || continue
		for table in nat mangle filter; do
			rules=$("$ipt-save" -t "$table" 2> /dev/null) || continue
			echo "$rules" | grep -E '^-A (PREROUTING|INPUT|OUTPUT) .*-j EXODUS_[A-Z_]+ *$' | sed 's/^-A //' | while read -r rule; do
				# shellcheck disable=SC2086
				"$ipt" -w -t "$table" -D $rule > /dev/null 2>&1
			done
			for chain in $(echo "$rules" | grep -o -E '^:EXODUS_[A-Z_]+'); do
				"$ipt" -w -t "$table" -F "${chain#:}" > /dev/null 2>&1
			done
			for chain in $(echo "$rules" | grep -o -E '^:EXODUS_[A-Z_]+'); do
				"$ipt" -w -t "$table" -X "${chain#:}" > /dev/null 2>&1
			done
		done
	done
	table_id="$TPROXY_TABLE"
	for family in 4 6; do
		while ip -"$family" rule del table "$table_id" > /dev/null 2>&1; do :; done
		ip -"$family" route flush table "$table_id" > /dev/null 2>&1
	done
	if command -v ipset > /dev/null 2>&1; then
		for set in $SET_MAC $SET_SRC4 $SET_SRC6 $SET_RSV4 $SET_RSV6 $SET_LOCAL4 $SET_LOCAL6 $SET_DENY; do
			ipset destroy "$set" > /dev/null 2>&1
			ipset destroy "${set}_new" > /dev/null 2>&1
		done
	fi
}
