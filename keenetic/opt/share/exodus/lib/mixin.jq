# mihomo options from config.json, merged over the profile on start
# null keeps the value of the profile; the ports, dns and api the transparent proxy relies on are always set
# ipv6, mode and the dns mode always come from the profile
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
| {
	"log-level": $m.log_level,
	"interface-name": $m.outbound_interface,
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
		"listen": "[::]:1053"
	},

	# the core marks its own connections, the router proxy lets them out
	"routing-mark": (if $p.enabled == true and $p.router_proxy == true then 255 else null end),

	# a rule needs a type and a target, and a value unless it is MATCH
	"nikki-rules": (
		[($m.rules // [])[] | select(.enabled != false)
			| select((.type // "") != "" and (.node // "") != "" and (.type == "MATCH" or (.matcher // "") != ""))
			| [.type, .matcher, .node, (if .no_resolve == true then "no-resolve" else null end)]
			| map(select(. != null and . != "") | tostring)
			| select(length >= 2)
			| join(",")]
		| if length == 0 then null else . end
	)
}
| drop_nulls // {}
