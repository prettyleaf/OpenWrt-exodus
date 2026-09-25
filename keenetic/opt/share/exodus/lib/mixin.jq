# mihomo options from config.json, merged over the profile on start
# null keeps the value of the profile; the ports, dns and api the transparent proxy relies on are always set
# no regex here: jq of entware is built without oniguruma

def int_or_null: if . == null or . == "" then null else (tonumber? // null) end;

def drop_nulls:
	if type == "object" then
		with_entries(.value |= drop_nulls) | with_entries(select(.value != null))
		| if length == 0 then null else . end
	elif type == "string" then
		if length == 0 then null else . end
	else . end;

.mixin as $m
| .proxy as $p
| ($p.ipv6 != false) as $ipv6
| {
	"log-level": $m.log_level,
	"mode": $m.mode,
	"interface-name": $m.outbound_interface,
	"ipv6": $ipv6,
	"allow-lan": true,

	"mixed-port": ($m.mixed_port | int_or_null),
	"redir-port": 7891,
	"tproxy-port": 7892,
	"authentication": (
		if $m.authentication == true and ($m.username // "") != "" then ["\($m.username):\($m.password // "")"]
		elif $m.authentication == false then []
		else null end
	),

	"external-controller": "[::]:\(($m.api_port | int_or_null) // 9090)",
	"external-ui": "ui",
	"external-ui-url": $m.ui_url,
	"secret": $m.api_secret,

	"profile": {
		"store-selected": true,
		"store-fake-ip": true
	},

	"dns": {
		"enable": true,
		"listen": "[::]:1053",
		"ipv6": $ipv6,
		"enhanced-mode": $m.dns_mode
	},

	# the core marks its own connections, the router proxy lets them out
	"routing-mark": (if $p.enabled == true and $p.router_proxy == true then 255 else null end),

	"nikki-rules": (
		[($m.rules // [])[] | select(.enabled != false)
			| [.type, .matcher, .node, (if .no_resolve == true then "no-resolve" else null end)]
			| map(select(. != null and . != "") | tostring)
			| select(length >= 2)
			| join(",")]
		| if length == 0 then null else . end
	)
}
| drop_nulls // {}
