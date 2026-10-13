#!/bin/sh
# shellcheck shell=sh

# the rest api of routeros, the router is the default gateway of the container
# everything exodus keeps in the router has a comment starting with "exodus:", the installer marks its part with "exodus setup"

# the interface of the container (the veth) and its addresses
net_iface() {
	local iface
	iface=$(ip -4 route show default 2> /dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')
	[ -n "$iface" ] || iface=$(ip -o link show 2> /dev/null | awk -F ': ' '$2 != "lo" { split($2, a, "@"); print a[1]; exit }')
	echo "$iface"
}

net_gateway() {
	ip "-$1" route show default 2> /dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "via") { print $(i + 1); exit } }'
}

# the address of the container on its interface, $1 family, $2 the interface
net_address() {
	ip -o "-$1" addr show dev "$2" scope global 2> /dev/null | awk '{ split($4, a, "/"); print a[1]; exit }'
}

# the address, the user and the password of the rest api
# the installer passes them in /container/envs, the container writes them to the config on every start
ros_load() {
	eval "$(jq -r '.routeros // {} | "ros_url=\(.url // "" | @sh) ros_user=\(.username // "" | @sh) ros_password=\(.password // "" | @sh)"' "$CONFIG_PATH" 2> /dev/null)"
	[ -n "$ros_url" ] || ros_url="http://$(net_gateway 4)"
	ros_url="${ros_url%/}"
	ros_url="${ros_url%/rest}"
}

# a request to the rest api: $1 method, $2 path under /rest with the query, $3 json body
# prints the answer; the error of routeros is {"error": code, "message": ..., "detail": ...}, it is printed too and the call fails
ros_call() {
	local method path body answer code
	method="$1"
	path="$2"
	body="$3"
	[ -n "$ros_url" ] || ros_load
	set -- -s -k -m "${ROS_TIMEOUT:-20}" --connect-timeout 5 -K - -X "$method" -w '\n%{http_code}'
	[ -n "$body" ] && set -- "$@" -H 'Content-Type: application/json' --data-binary "$body"
	# the password goes through the config of curl, not the command line
	answer=$(printf 'user = "%s"\n' "$(printf '%s' "$ros_user:$ros_password" | sed 's/[\\"]/\\&/g')" | curl "$@" "$ros_url/rest/$path" 2> /dev/null)
	code=$(printf '%s' "$answer" | tail -n 1)
	answer=$(printf '%s' "$answer" | sed '$d')
	case "$code" in
		2??)
			printf '%s\n' "$answer"
			return 0
			;;
		""|000)
			jq -n -c --arg url "$ros_url" '{error: 0, message: "RouterOS does not answer at \($url)"}'
			;;
		*)
			if printf '%s' "$answer" | jq -e 'type == "object"' > /dev/null 2>&1; then
				printf '%s\n' "$answer"
			else
				jq -n -c --arg code "$code" '{error: ($code | tonumber), message: "HTTP \($code)"}'
			fi
			;;
	esac
	return 1
}

# the text of an error answer
ros_error() {
	printf '%s' "$1" | jq -r '[.message, .detail] | map(select(. != null and . != "")) | join(": ")' 2> /dev/null
}

# an answer that is json, or $2 when the request failed
ros_json() {
	local answer
	if answer=$(ros_call GET "$1") && printf '%s' "$answer" | jq -e 'type == "object" or type == "array"' > /dev/null 2>&1; then
		printf '%s\n' "$answer"
	else
		printf '%s\n' "${2:-null}"
	fi
}

# check the connection, the status of the web ui reads the result; logged only when it changes
ros_check() {
	local answer resource identity ok error before
	ros_load
	ok=false
	error=
	identity='{}'
	if answer=$(ROS_TIMEOUT=10 ros_call GET system/resource); then
		ok=true
		identity=$(ros_json system/identity '{}')
	else
		error=$(ros_error "$answer")
		[ -n "$error" ] || error="no answer"
	fi
	resource=$(printf '%s' "$answer" | jq -c 'select(type == "object")' 2> /dev/null)
	[ -n "$resource" ] || resource='{}'
	before=$(jq -r '"\(.ok)|\(.error // "")"' "$ROUTEROS_STATE_PATH" 2> /dev/null)
	mkdir -p "$RUN_TMP"
	jq -n -c --argjson ok "$ok" --arg error "$error" --arg url "$ros_url" --arg user "$ros_user" \
		--argjson resource "$resource" --argjson identity "$identity" --argjson time "$(date +%s)" '
		{ok: $ok, error: (if $error == "" then null else $error end), url: $url, user: $user, time: $time,
		 identity: ($identity.name // null), version: (if $ok then ($resource.version // null) else null end)}' > "$ROUTEROS_STATE_PATH.tmp" \
		&& mv -f "$ROUTEROS_STATE_PATH.tmp" "$ROUTEROS_STATE_PATH"
	if [ "$before" != "$ok|$error" ]; then
		if [ "$ok" = true ]; then
			log "RouterOS" "Connected to $ros_url as ${ros_user:-<no user>}."
		else
			log "RouterOS" "No connection to $ros_url: $error."
		fi
	fi
	[ "$ok" = true ]
}

# model, version and serial number of the router, cached while the container runs
# nothing is cached when the router does not answer, the next call asks again
router_info() {
	local resource board license identity
	if [ -s "$ROUTER_INFO_PATH" ]; then
		cat "$ROUTER_INFO_PATH"
		return
	fi
	resource=$(ros_json system/resource)
	if [ "$resource" = "null" ]; then
		echo '{}'
		return
	fi
	board=$(ros_json system/routerboard '{}')
	license=$(ros_json system/license '{}')
	identity=$(ros_json system/identity '{}')
	mkdir -p "$RUN_TMP"
	jq -n -c --argjson r "$resource" --argjson b "$board" --argjson l "$license" --argjson i "$identity" '
		def text: if . == null then "" else tostring end;
		{
			version: ($r.version | text),
			board: ($r["board-name"] | text),
			arch: ($r["architecture-name"] | text),
			model: (if ($b.routerboard | text) == "true" and ($b.model | text) != "" then $b.model else ($r["board-name"] | text) end),
			serial: ($b["serial-number"] | text),
			software_id: ($l["software-id"] | text),
			identity: ($i.name | text)
		}' > "$ROUTER_INFO_PATH.tmp" && mv -f "$ROUTER_INFO_PATH.tmp" "$ROUTER_INFO_PATH"
	cat "$ROUTER_INFO_PATH" 2> /dev/null || echo '{}'
}

# the name of the veth of the container in routeros: the one with the address of the container
# routeros names the interface inside the container after the veth, older versions call it eth0
ros_veth() {
	local address
	address=$(net_address 4 "$(net_iface)")
	ros_json 'interface/veth?.proplist=name,address' '[]' | jq -r --arg address "$address" '
		[.[]? | select((.address // "") | split(",") | map(split("/")[0]) | index($address))][0].name // empty' 2> /dev/null
}

# names of the interface lists of the router
ros_lists() {
	ros_json 'interface/list?.proplist=name' '[]' | jq -c '[.[]? | .name | select(type == "string")]' 2> /dev/null || echo '[]'
}

# the data of the router for the device selection: segments, wi-fi points and devices
# routeros gives names of the dhcp leases, wi-fi clients of the wifi and wireless packages and of capsman
ros_hosts() {
	local dir ok
	dir="$RUN_TMP/hosts.$$"
	rm -rf "$dir"
	mkdir -p "$dir"
	ros_load
	ok=true
	ros_json 'ip/dhcp-server/lease?.proplist=address,mac-address,host-name,comment,status,active-address,active-mac-address,disabled' > "$dir/leases.json"
	[ "$(cat "$dir/leases.json")" = "null" ] && ok=false
	ros_json 'ip/arp?.proplist=address,mac-address,interface,status,disabled' > "$dir/arp.json"
	ros_json 'interface/bridge/host?.proplist=mac-address,on-interface,bridge,local' > "$dir/bridge.json"
	ros_json 'interface/wifi' > "$dir/wifi.json"
	ros_json 'interface/wifi/configuration?.proplist=name,ssid' > "$dir/wifi_conf.json"
	ros_json 'interface/wifi/registration-table?.proplist=interface,mac-address,ssid,band' > "$dir/wifi_reg.json"
	ros_json 'interface/wireless?.proplist=name,ssid,band,running,disabled,mode' > "$dir/wireless.json"
	ros_json 'interface/wireless/registration-table?.proplist=interface,mac-address' > "$dir/wireless_reg.json"
	ros_json 'caps-man/registration-table?.proplist=interface,mac-address,ssid' > "$dir/capsman_reg.json"
	ros_json 'ip/address?.proplist=address,interface,disabled,invalid' > "$dir/addresses.json"
	ros_json 'interface?.proplist=name,type,comment,running,disabled' > "$dir/interfaces.json"
	ros_json 'interface/list/member?.proplist=list,interface' > "$dir/members.json"
	jq -n -c \
		--argjson ok "$ok" \
		--slurpfile leases "$dir/leases.json" \
		--slurpfile arp "$dir/arp.json" \
		--slurpfile bridge "$dir/bridge.json" \
		--slurpfile wifi "$dir/wifi.json" \
		--slurpfile wifi_conf "$dir/wifi_conf.json" \
		--slurpfile wifi_reg "$dir/wifi_reg.json" \
		--slurpfile wireless "$dir/wireless.json" \
		--slurpfile wireless_reg "$dir/wireless_reg.json" \
		--slurpfile capsman_reg "$dir/capsman_reg.json" \
		--slurpfile addresses "$dir/addresses.json" \
		--slurpfile interfaces "$dir/interfaces.json" \
		--slurpfile members "$dir/members.json" '
		def list: if type == "array" then . else [] end;
		def yes: . == true or . == "true";
		def mac: ascii_upcase;
		def band: if . == null then null
			elif startswith("2") then "2.4 GHz" elif startswith("5") then "5 GHz" elif startswith("6") then "6 GHz" else . end;
		($leases[0] | list) as $leases
		| ($arp[0] | list | map(select((.disabled | yes) | not))) as $arp
		| ($interfaces[0] | list) as $ifaces
		| ([$members[0] | list | .[] | select(.list == "WAN") | .interface]) as $wan
		| ([$ifaces[] | select(.type == "veth") | .name]) as $veths
		| ($wifi_conf[0] | list | map({(.name): (.ssid // "")}) | add // {}) as $conf
		| ([$wifi_reg[0] | list | .[] | {mac: (.["mac-address"] // "" | mac), ap: (.interface // ""), ssid: (.ssid // ""), band: (.band // null)}]
			+ [$wireless_reg[0] | list | .[] | {mac: (.["mac-address"] // "" | mac), ap: (.interface // ""), ssid: "", band: null}]
			+ [$capsman_reg[0] | list | .[] | {mac: (.["mac-address"] // "" | mac), ap: (.interface // ""), ssid: (.ssid // ""), band: null}]
			| map(select(.mac != "" and .ap != ""))) as $stations
		| ([$wifi[0] | list | .[] | select((.disabled | yes) | not) | {
				id: .name,
				ssid: (.["configuration.ssid"] // $conf[.configuration // ""] // ""),
				description: (.comment // ""),
				state: (if (.running | yes) then "up" else "down" end),
				band: ((.["configuration.band"] // .["channel.band"] // .band) | band)
			}]
			+ [$wireless[0] | list | .[] | select((.disabled | yes) | not) | {
				id: .name, ssid: (.ssid // ""), description: "", state: (if (.running | yes) then "up" else "down" end), band: (.band | band)
			}]) as $points
		| ([$stations[] | select(.ap as $ap | $points | map(.id) | index($ap) | not) | {id: .ap, ssid: .ssid, description: "", state: "up", band: (.band | band)}]
			| unique_by(.id)) as $remote
		| {
			router: $ok,
			segments: ([$addresses[0] | list | .[] | select(((.disabled | yes) or (.invalid | yes)) | not)
				| select(.interface as $i | ($wan | index($i) | not) and ($veths | index($i) | not))
				| {ifname: .interface, address: (.address // "")}]
				| unique_by(.ifname)
				| map(. as $s | ([$ifaces[] | select(.name == $s.ifname)][0] // {}) as $i | $s + {name: ($i.comment // ""), id: $s.ifname})),
			aps: (($points + $remote) | map(. as $p | . + {
				band: (.band // ([$stations[] | select(.ap == $p.id) | .band | band][0]) // ""),
				ssid: (if .ssid != "" then .ssid else ([$stations[] | select(.ap == $p.id) | .ssid | select(. != "")][0] // "") end),
				clients: ([$stations[] | select(.ap == $p.id)] | length)
			}) | sort_by(.id)),
			hosts: (
				[$leases[] | select(((.disabled | yes) | not) and (.["mac-address"] // .["active-mac-address"] // "") != "")
					| (.["active-mac-address"] // .["mac-address"] | mac) as $m
					| ([$stations[] | select(.mac == $m)][0] // {}) as $st
					| ([$arp[] | select((.["mac-address"] // "" | mac) == $m)][0] // {}) as $a
					| {
						mac: $m,
						ip: (.["active-address"] // .address // ""),
						name: (.comment // ""),
						hostname: (.["host-name"] // ""),
						active: (.status == "bound"),
						ap: ($st.ap // ""),
						ssid: ($st.ssid // ""),
						segment: ($a.interface // ""),
						access: ""
					}] as $known
				| $known + [$arp[] | select((.["mac-address"] // "") != "") | (.["mac-address"] | mac) as $m
					| select($known | map(.mac) | index($m) | not)
					| select(.interface as $i | $veths | index($i) | not)
					| ([$stations[] | select(.mac == $m)][0] // {}) as $st
					| {mac: $m, ip: (.address // ""), name: "", hostname: "", active: ((.status // "") != "failed"),
						ap: ($st.ap // ""), ssid: ($st.ssid // ""), segment: (.interface // ""), access: ""}]
				| unique_by(.mac)
			)
		}'
	rm -rf "$dir"
}

# addresses of the clients of wi-fi points, $1 the names of the interfaces as a json list; prints "4 address" and "6 address" lines
# the macs come from the registration tables, the addresses from the leases, arp and the ipv6 neighbors
ros_ap_addresses() {
	local dir aps
	dir="$RUN_TMP/aps.$$"
	rm -rf "$dir"
	mkdir -p "$dir"
	aps="$1"
	{
		ros_json 'interface/wifi/registration-table?.proplist=interface,mac-address' '[]'
		ros_json 'interface/wireless/registration-table?.proplist=interface,mac-address' '[]'
		ros_json 'caps-man/registration-table?.proplist=interface,mac-address' '[]'
	} > "$dir/stations.json"
	ros_json 'ip/dhcp-server/lease?.proplist=active-address,address,mac-address,active-mac-address,status' '[]' > "$dir/leases.json"
	ros_json 'ip/arp?.proplist=address,mac-address,status' '[]' > "$dir/arp.json"
	ros_json 'ipv6/neighbor?.proplist=address,mac-address,status' '[]' > "$dir/neighbors.json"
	jq -n -r --argjson aps "$aps" \
		--slurpfile stations "$dir/stations.json" \
		--slurpfile leases "$dir/leases.json" \
		--slurpfile arp "$dir/arp.json" \
		--slurpfile neighbors "$dir/neighbors.json" '
		def list: if type == "array" then . else [] end;
		([$stations[] | list | .[] | select(.interface as $i | $aps | index($i)) | .["mac-address"] // "" | ascii_upcase | select(. != "")] | unique) as $macs
		| def ours: (.["mac-address"] // .["active-mac-address"] // "" | ascii_upcase) as $m | $macs | index($m);
		([$leases[0] | list | .[] | select(.status == "bound" and ours) | .["active-address"] // .address]
			+ [$arp[0] | list | .[] | select((.status // "") != "failed" and ours) | .address]
			| map(select(. != null and . != "")) | unique | .[] | "4 \(.)"),
		([$neighbors[0] | list | .[] | select((.status // "") != "failed" and ours) | .address // ""
			| select(. != "" and (startswith("fe80") | not))] | unique | .[] | "6 \(.)")'
	rm -rf "$dir"
}
