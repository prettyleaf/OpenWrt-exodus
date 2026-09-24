# mihomo options from the mixin section of config.json, merged over the profile on start
# null means unmodified, the profile value is kept; empty strings, lists and objects are dropped as well

def trim_all:
	if type == "object" then
		with_entries(.value |= trim_all) | with_entries(select(.value != null))
		| if length == 0 then null else . end
	elif type == "array" then
		if length == 0 then null else . end
	elif type == "string" then
		if length == 0 then null else . end
	else . end;

def enabled_entries: (. // []) | map(select(.enabled == true));

def int_or_null: if . == null or . == "" then null else (tonumber? // null) end;

.mixin as $m
| {
	"log-level": $m.log_level,
	"mode": $m.mode,
	"find-process-mode": $m.match_process,
	"interface-name": $m.outbound_interface,
	"ipv6": $m.ipv6,
	"unified-delay": $m.unify_delay,
	"tcp-concurrent": $m.tcp_concurrent,
	"disable-keep-alive": $m.disable_tcp_keep_alive,
	"keep-alive-idle": ($m.tcp_keep_alive_idle | int_or_null),
	"keep-alive-interval": ($m.tcp_keep_alive_interval | int_or_null),

	"external-ui": $m.ui_path,
	"external-ui-name": $m.ui_name,
	"external-ui-url": $m.ui_url,
	"external-controller": $m.api_listen,
	"external-controller-tls": $m.api_tls_listen,
	"tls": {
		"certificate": $m.api_tls_cert,
		"private-key": $m.api_tls_key,
		"ech-key": $m.api_tls_ech_key
	},
	"secret": $m.api_secret,

	"allow-lan": $m.allow_lan,
	"port": ($m.http_port | int_or_null),
	"socks-port": ($m.socks_port | int_or_null),
	"mixed-port": ($m.mixed_port | int_or_null),
	"redir-port": ($m.redir_port | int_or_null),
	"tproxy-port": ($m.tproxy_port | int_or_null),

	"authentication": (
		if $m.authentication == true then
			[$m.authentications | enabled_entries | .[] | "\(.username):\(.password)"]
		else null end
	),

	"dns": ({
		"enable": $m.dns_enabled,
		"cache-algorithm": $m.dns_cache_algorithm,
		"listen": $m.dns_listen,
		"ipv6": $m.dns_ipv6,
		"enhanced-mode": $m.dns_mode,
		"fake-ip-range": $m.fake_ip_range,
		"fake-ip-range6": $m.fake_ip6_range,
		"fake-ip-ttl": ($m.fake_ip_ttl | int_or_null),
		"fake-ip-filter": (if $m.fake_ip_filter == true then $m.fake_ip_filters else null end),
		"fake-ip-filter-mode": $m.fake_ip_filter_mode,
		"respect-rules": $m.dns_respect_rules,
		"prefer-h3": $m.dns_doh_prefer_http3,
		"use-system-hosts": $m.dns_system_hosts,
		"use-hosts": $m.dns_hosts,
		"proxy-server-nameserver-policy": (
			if $m.dns_proxy_server_nameserver_policy == true then
				reduce ($m.proxy_server_nameserver_policies | enabled_entries | .[]) as $x ({}; .[$x.matcher] = ($x.nameserver // []))
			else null end
		),
		"direct-nameserver-follow-policy": $m.dns_direct_nameserver_follow_policy,
		"nameserver-policy": (
			if $m.dns_nameserver_policy == true then
				reduce ($m.nameserver_policies | enabled_entries | .[]) as $x ({}; .[$x.matcher] = ($x.nameserver // []))
			else null end
		)
	} + (
		if $m.dns_nameserver == true then
			reduce ($m.nameservers | enabled_entries | .[]) as $x ({}; .[$x.type] += ($x.nameserver // []))
		else {} end
	)),

	"hosts": (
		if $m.hosts == true then
			reduce ($m.hosts_entries | enabled_entries | .[]) as $x ({}; .[$x.domain_name] = ($x.ip // []))
		else null end
	),

	"sniffer": {
		"enable": $m.sniffer,
		"force-dns-mapping": $m.sniffer_sniff_dns_mapping,
		"parse-pure-ip": $m.sniffer_sniff_pure_ip,
		"force-domain": (if $m.sniffer_force_domain_name == true then $m.sniffer_force_domain_names else null end),
		"skip-domain": (if $m.sniffer_ignore_domain_name == true then $m.sniffer_ignore_domain_names else null end),
		"sniff": (
			if $m.sniffer_sniff == true then
				reduce ($m.sniffs | enabled_entries | .[]) as $x ({}; .[$x.protocol] = {
					"ports": ($x.port // []),
					"override-destination": $x.overwrite_destination
				})
			else null end
		)
	},

	"profile": {
		"store-selected": $m.selection_cache,
		"store-fake-ip": $m.fake_ip_cache
	},

	"rule-providers": (
		if $m.rule_provider == true then
			reduce ($m.rule_providers | enabled_entries | .[]) as $x ({}; .[$x.name] = (
				if $x.type == "http" then {
					"type": "http",
					"url": $x.url,
					"proxy": $x.node,
					"size-limit": ($x.file_size_limit | int_or_null),
					"format": $x.file_format,
					"behavior": $x.behavior,
					"interval": ($x.update_interval | int_or_null)
				} else {
					"type": "file",
					"path": $x.file_path,
					"format": $x.file_format,
					"behavior": $x.behavior
				} end
			))
		else null end
	),

	"nikki-rules": (
		if $m.rule == true then
			[$m.rules | enabled_entries | .[]
				| [.type, .matcher, .node, (if .no_resolve == true then "no-resolve" else null end)]
				| map(select(. != null and . != "") | tostring)
				| join(",")]
		else null end
	),

	"geodata-mode": (if $m.geoip_format == null then null else $m.geoip_format == "dat" end),
	"geodata-loader": $m.geodata_loader,
	"geox-url": {
		"geosite": $m.geosite_url,
		"mmdb": $m.geoip_mmdb_url,
		"geoip": $m.geoip_dat_url,
		"asn": $m.geoip_asn_url
	},
	"geo-auto-update": $m.geox_auto_update,
	"geo-update-interval": ($m.geox_update_interval | int_or_null)
}
| trim_all // {}
