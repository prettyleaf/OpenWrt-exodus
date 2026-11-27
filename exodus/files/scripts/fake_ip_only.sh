#!/bin/sh

# fake-ip only: the networks the core must still get besides the fake-ip addresses, from the running profile,
# into the sets fake_ip_only_* of the hijack; started after the hijack and by cron, provider files change on their own interval
# the same parsing as the keenetic, asuswrt and mikrotik branches, with yq instead of jq: openwrt has no jq

. "$IPKG_INSTROOT/etc/nikki/scripts/include.sh"

PROG="/usr/libexec/mihomo"
CACHE_DIR="$TEMP_DIR/fake_ip_only"

fw_filter_ip4() {
	grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$'
}

fw_filter_ip6() {
	grep -E '^[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*(/[0-9]{1,3})?$'
}

# fake-ip only: what the core must still get besides the fake-ip addresses, from the running profile
# rules to a proxy or a group give their IP-CIDR, IP-CIDR6 and SRC-IP-CIDR and their rule sets, so do the rule sets of dns.fake-ip-filter
# prints "dst <network>", "src <network>" and "set <name>" lines, one rule per input line
fw_wl_rules() {
	awk -F ',' '
		function trim(s) { gsub(/^[ \t"'\'']+|[ \t"'\'']+$/, "", s); return s }
		function direct(t) { t = toupper(trim(t)); return t == "" || t == "DIRECT" || t == "REJECT" || t == "REJECT-DROP" || t == "PASS" || t == "COMPATIBLE" }
		function one(type, value) {
			type = toupper(trim(type))
			value = trim(value)
			if (value == "") return
			if (type == "IP-CIDR" || type == "IP-CIDR6") print "dst " value
			else if (type == "SRC-IP-CIDR") print "src " value
			else if (type == "RULE-SET") print "set " value
		}
		{
			type = toupper(trim($1))
			if (type == "AND" || type == "OR") {
				# OR,((IP-CIDR,1.2.3.0/24),(RULE-SET,name)),PROXY
				last = 0
				for (i = length($0); i > 0; i--) if (substr($0, i, 1) == ")") { last = i; break }
				if (!last) next
				split(substr($0, last + 1), tail, ",")
				if (direct(tail[2])) next
				n = split(substr($0, 1, last), parts, /[()]/)
				for (i = 1; i <= n; i++) if (index(parts[i], ",")) { split(parts[i], kv, ","); one(kv[1], kv[2]) }
			} else if (NF >= 3 && !direct($3)) {
				one($1, $2)
			}
		}'
}

# entries of a rule set: one network per line (ipcidr) or classical rules
fw_wl_payload() {
	awk -v behavior="$1" '
		{
			line = $0
			sub(/#.*/, "", line)
			gsub(/^[ \t]*(- )?[ \t"'\'']*|[ \t"'\''\r]+$/, "", line)
			if (line == "") next
			if (behavior == "ipcidr") { print "dst " line; next }
			split(line, kv, ",")
			type = toupper(kv[1])
			gsub(/[ \t]/, "", kv[2])
			if (type == "IP-CIDR" || type == "IP-CIDR6") print "dst " kv[2]
			else if (type == "SRC-IP-CIDR") print "src " kv[2]
		}'
}

# the file of a rule provider as the core saves it, http providers without a path are kept by the md5 of the url
fw_wl_file() {
	local type path url
	type="$1"
	path="$2"
	url="$3"
	if [ -z "$path" ] && [ "$type" = "http" ] && [ -n "$url" ]; then
		path="rules/$(printf '%s' "$url" | md5sum | cut -d ' ' -f 1)"
	fi
	case "$path" in
		"") return 1 ;;
		/*) echo "$path" ;;
		*) echo "$RUN_DIR/${path#./}" ;;
	esac
}

# networks the sets of the kernel take: a broken line stops ipset restore, hash:net has no /0 and gets its two halves
fw_wl_valid() {
	awk -v family="$1" '
		{
			net = $1
			prefix = ""
			if (index(net, "/")) { prefix = substr(net, index(net, "/") + 1); net = substr(net, 1, index(net, "/") - 1) }
			if (prefix == "0") { print (family == 4 ? "0.0.0.0/1\n128.0.0.0/1" : "::/1\n8000::/1"); next }
			if (prefix != "" && (prefix !~ /^[0-9]+$/ || prefix + 0 < 1 || prefix + 0 > (family == 4 ? 32 : 128))) next
			if (family == 4) {
				if (split(net, o, ".") != 4) next
				for (i = 1; i <= 4; i++) if (o[i] !~ /^[0-9]+$/ || o[i] + 0 > 255) next
			}
			print $1
		}'
}

fw_wl_entries() {
	local mode lines name info type behavior format path url file cache
	[ -f "$RUN_PROFILE_PATH" ] || return 0
	mode=$(yq -M '.dns.fake-ip-filter-mode // "blacklist"' "$RUN_PROFILE_PATH" 2> /dev/null)
	lines=$({
		yq -M '(.rules // [])[] | select(tag == "!!str")' "$RUN_PROFILE_PATH" 2> /dev/null | fw_wl_rules
		# whitelist: RULE-SET:a,b gets fake-ip; rule: RULE-SET,name,fake-ip
		yq -M '(.dns.fake-ip-filter // [])[] | select(tag == "!!str")' "$RUN_PROFILE_PATH" 2> /dev/null | awk -v mode="$mode" '
			mode == "whitelist" && toupper(substr($0, 1, 9)) == "RULE-SET:" { n = split(substr($0, 10), s, ","); for (i = 1; i <= n; i++) print "set " s[i] }
			mode == "rule" { n = split($0, f, ","); for (i = 1; i <= n; i++) gsub(/^[ \t]+|[ \t]+$/, "", f[i]); if (n >= 3 && toupper(f[1]) == "RULE-SET" && tolower(f[n]) == "fake-ip") print "set " f[2] }'
	})
	echo "$lines" | grep -v '^set '
	mkdir -p "$CACHE_DIR"
	echo "$lines" | sed -n 's/^set //p' | sort -u | while read -r name; do
		info=$(NAME="$name" yq -M '.rule-providers[strenv(NAME)] | select(. != null) | [.type // "", .behavior // "classical", .format // "", .path // "", .url // ""] | join("|")' "$RUN_PROFILE_PATH" 2> /dev/null)
		[ -n "$info" ] || continue
		# not a tab: empty fields between tabs would merge, a | of the url stays in the last field
		IFS='|' read -r type behavior format path url <<-EOT
			$info
		EOT
		case "$behavior" in ipcidr|classical) ;; *) continue ;; esac
		if [ "$type" = "inline" ]; then
			NAME="$name" yq -M '(.rule-providers[strenv(NAME)].payload // [])[] | select(tag == "!!str")' "$RUN_PROFILE_PATH" 2> /dev/null | fw_wl_payload "$behavior"
			continue
		fi
		file=$(fw_wl_file "$type" "$path" "$url") || continue
		[ -f "$file" ] || continue
		[ -n "$format" ] || case "$file" in *.mrs) format="mrs" ;; *.txt|*.list) format="text" ;; esac
		case "$format" in
			mrs)
				# the core turns a binary rule set into text, kept until the file changes: a second core is heavy for the router
				cache="$CACHE_DIR/$(md5sum < "$file" | cut -d ' ' -f 1)"
				if [ ! -f "$cache" ]; then
					"$PROG" convert-ruleset "$behavior" mrs "$file" "$cache.tmp" > /dev/null 2>&1 && mv -f "$cache.tmp" "$cache"
					rm -f "$cache.tmp"
				fi
				[ -f "$cache" ] && touch "$cache" && fw_wl_payload "$behavior" < "$cache"
				;;
			text) fw_wl_payload "$behavior" < "$file" ;;
			*) { yq -M '.payload[]' "$file" 2> /dev/null || cat "$file"; } | fw_wl_payload "$behavior" ;;
		esac
	done
	# converted rule sets nobody used for a day
	find "$CACHE_DIR" -type f -mtime +0 -exec rm -f {} \; 2> /dev/null
}

# refill a set of the hijack from stdin in one transaction, a set nft does not take stays as it was
# $1 set
fw_wl_load() {
	awk -v set="$1" '
		BEGIN { print "flush set inet nikki " set }
		NF { line = line (n ? ", " : "") $1; n++ }
		n >= 1000 { print "add element inet nikki " set " { " line " }"; line = ""; n = 0 }
		END { if (n) print "add element inet nikki " set " { " line " }" }' | nft -f - 2> /dev/null \
		|| log "Proxy" "Fake-IP only: nftables did not take the networks of $1."
}

main() {
	local entries count
	[ "$(uci -q get nikki.proxy.fake_ip_only)" = 1 ] || return 0
	# the hijack is off or was made without fake-ip only
	nft list set inet nikki fake_ip_only_ip > /dev/null 2>&1 || return 0
	entries=$(fw_wl_entries)
	echo "$entries" | sed -n 's/^dst //p' | fw_filter_ip4 | fw_wl_valid 4 | sort -u > "$TEMP_DIR/fake_ip_only.4"
	echo "$entries" | sed -n 's/^dst //p' | fw_filter_ip6 | fw_wl_valid 6 | sort -u > "$TEMP_DIR/fake_ip_only.6"
	fw_wl_load fake_ip_only_ip < "$TEMP_DIR/fake_ip_only.4"
	fw_wl_load fake_ip_only_ip6 < "$TEMP_DIR/fake_ip_only.6"
	echo "$entries" | sed -n 's/^src //p' | fw_filter_ip4 | fw_wl_valid 4 | fw_wl_load fake_ip_only_src
	echo "$entries" | sed -n 's/^src //p' | fw_filter_ip6 | fw_wl_valid 6 | fw_wl_load fake_ip_only_src6
	count=$(cat "$TEMP_DIR/fake_ip_only.4" "$TEMP_DIR/fake_ip_only.6" | wc -l)
	rm -f "$TEMP_DIR/fake_ip_only.4" "$TEMP_DIR/fake_ip_only.6"
	if [ "$count" != "$(cat "$TEMP_DIR/fake_ip_only.count" 2> /dev/null)" ]; then
		log "Proxy" "Fake-IP only: $count networks go to the core besides the domains of fake-ip."
		echo "$count" > "$TEMP_DIR/fake_ip_only.count"
	fi
}

# sourced by a test: only the functions
[ -n "$FAKE_IP_ONLY_LIB" ] || main
