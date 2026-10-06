#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2030,SC2031
# Each function scopes its runtime directory locally; EXIT traps use that scope.
# Native Addons API transport. All user content stays in RAM files.
webui_encode() (
	local source encoded
	source="$1"; encoded="$source.base64.$$"
	trap 'rm -f "$encoded"' EXIT
	# Do not hide a failed encoder behind tr's successful pipeline exit status.
	base64 < "$source" > "$encoded" || { echo 'Exodus WebUI: base64 encoding failed; check coreutils-base64' >&2; exit 1; }
	tr -d '\n' < "$encoded"
)

webui_emit() {
	local id seq phase status body target
	id="$1"; seq="$2"; phase="$3"; status="$4"; body="$5"
	target="$WEBUI_DIR/responses/$id.json"
	[ -d "$WEBUI_DIR/responses" ] || mkdir -p "$WEBUI_DIR/responses"
	# Base64 keeps do_ej from evaluating template delimiters in user content.
	webui_encode "$body" > "$target.body" || { rm -f "$target.body"; return 1; }
	if ! { jq -cn --arg id "$id" --argjson seq "$seq" --arg phase "$phase" --argjson status "$status" \
		--rawfile body "$target.body" '{v:1,id:$id,seq:$seq,phase:$phase,status:$status,body:$body}' > "$target.tmp" && mv -f "$target.tmp" "$target"; }; then
		rm -f "$target.body" "$target.tmp"; return 1
	fi
	rm -f "$target.body"
}

webui_error() {
	local body
	body="$WEBUI_DIR/error.$$"
	jq -cn --arg error "$4" '{error:$error}' > "$body"
	webui_emit "$1" "$2" error "$3" "$body"
	rm -f "$body"
}

webui_gc() (
	local dir touched now age
	[ -d "$WEBUI_DIR/requests" ] || [ -d "$WEBUI_DIR/snapshots" ] || exit 0
	lock_acquire webui-transfer 2 || exit 0
	trap 'lock_release webui-transfer' EXIT
	now=$(date +%s)
	for dir in "$WEBUI_DIR"/requests/* "$WEBUI_DIR"/snapshots/*; do
		[ -d "$dir" ] || continue
		touched=$(cat "$dir/touched" 2> /dev/null)
		case "$touched" in ''|*[!0-9]*) continue ;; esac
		age=$((now - touched))
		[ "$age" -ge 300 ] || continue
		# A running worker cannot be replayed or removed underneath it.
		if [ -f "$dir/running" ] && pid_alive "$dir/pid"; then continue; fi
		rm -f "$WEBUI_DIR/responses/${dir##*/}.json"
		rm -rf "$dir"
	done
)

webui_accept() (
	local packet id seq count data dir next digest previous other free total status action pending new=0
	packet="$1"
	[ -f "$packet" ] && [ "$(wc -c < "$packet")" -le 2999 ] || exit 1
	jq -e 'type == "object" and .v == 1 and (.id|type == "string") and
		(.seq|type == "number" and floor == . and . >= 0) and
		(.count|type == "number" and floor == . and . > 0) and (.data|type == "string")' "$packet" > /dev/null 2>&1 || exit 1
	id=$(jq -r .id "$packet"); seq=$(jq -r .seq "$packet"); count=$(jq -r .count "$packet")
	case "$id" in *[!0-9a-f]*|'') exit 1 ;; esac
	[ "${#id}" -eq 32 ] || exit 1
	[ "$seq" -lt 12428 ] 2> /dev/null || exit 1
	umask 077
	mkdir -p "$WEBUI_DIR/responses" "$WEBUI_DIR/requests"
	if ! { [ "$count" -le 12428 ] && [ "$seq" -lt "$count" ]; }; then
		webui_error "$id" "$seq" 413 'request is too large'; exit 1
	fi
	data=$(jq -r .data "$packet")
	case "$data" in ''|*[!A-Za-z0-9+/=]*) webui_error "$id" "$seq" 400 'invalid base64'; exit 1 ;; esac
	if ! { [ "${#data}" -le 1800 ] && [ "$((${#data} % 4))" -eq 0 ]; }; then
		webui_error "$id" "$seq" 413 'invalid chunk size'; exit 1
	fi
	if [ "$seq" -lt "$((count - 1))" ]; then
		case "$data" in *=*) webui_error "$id" "$seq" 400 'padding before final chunk'; exit 1 ;; esac
	fi
	free=$(awk '/MemAvailable:/ { print $2; found=1 } END { if(!found) print 0 }' /proc/meminfo)
	[ "$free" -ge 16384 ] || { webui_error "$id" "$seq" 503 'not enough free RAM'; exit 1; }
	lock_acquire webui-transfer 10 || { webui_error "$id" "$seq" 503 'transfer is busy'; exit 1; }
	trap 'if [ "$new" = 1 ] && [ "$(cat "$dir/next" 2>/dev/null)" = 0 ]; then rm -rf "$dir"; fi; lock_release webui-transfer' EXIT
	dir="$WEBUI_DIR/requests/$id"
	digest=$(printf '%s' "$data" | sha256sum | cut -d ' ' -f 1)
	if [ -f "$dir/$seq.digest" ]; then
		previous=$(cat "$dir/$seq.digest")
		if [ "$previous" != "$digest" ] || [ "$(cat "$dir/count")" != "$count" ]; then
			webui_error "$id" "$seq" 409 'chunk differs from accepted data'; exit 1
		fi
		# Only the final chunk can return complete; earlier retries get their own ack.
		if [ -f "$dir/complete" ] && [ "$seq" -eq "$((count - 1))" ]; then
			cp "$dir/result.json" "$WEBUI_DIR/responses/$id.json.tmp" && mv -f "$WEBUI_DIR/responses/$id.json.tmp" "$WEBUI_DIR/responses/$id.json"
		elif [ -f "$dir/running" ]; then
			pid_alive "$dir/pid" || webui_error "$id" "$seq" 500 'operation outcome is unknown; inspect state before retrying'
		else
			printf '{}\n' > "$dir/ack"
			webui_emit "$id" "$seq" accepted 200 "$dir/ack"
		fi
		exit 0
	fi
	if [ ! -d "$dir" ]; then
		[ "$seq" -eq 0 ] || { webui_error "$id" "$seq" 409 'out of order chunk'; exit 1; }
		# Request IDs have independent buffers. An abandoned upload or a legacy
		# settings snapshot must not prevent a new request from completing.
		pending=0
		for other in "$WEBUI_DIR"/requests/*; do
			if [ ! -f "$other/count" ] || [ -f "$other/complete" ]; then continue; fi
			pending=$((pending + 1))
		done
		[ "$pending" -lt 4 ] || { webui_error "$id" "$seq" 503 'too many unfinished uploads; retry after they expire'; exit 1; }
		mkdir "$dir" || exit 1
		new=1
		printf '%s\n' "$count" > "$dir/count"
		echo 0 > "$dir/next"
		date +%s > "$dir/touched"
	fi
	next=$(cat "$dir/next")
	if ! { [ "$seq" -eq "$next" ] && [ "$count" = "$(cat "$dir/count")" ]; }; then
		webui_error "$id" "$seq" 409 'out of order chunk'; exit 1
	fi
	printf '%s' "$data" > "$dir/chunk"
	base64 -d "$dir/chunk" > "$dir/decoded" 2> /dev/null || { webui_error "$id" "$seq" 400 'invalid base64'; exit 1; }
	total=$(( $(wc -c < "$dir/decoded") + $(wc -c < "$dir/request" 2> /dev/null || echo 0) ))
	[ "$total" -le 16777216 ] || { webui_error "$id" "$seq" 413 'request is too large'; exit 1; }
	cat "$dir/decoded" >> "$dir/request" || exit 1
	rm -f "$dir/chunk" "$dir/decoded"
	printf '%s\n' "$digest" > "$dir/$seq.digest"
	echo "$((seq + 1))" > "$dir/next"
	date +%s > "$dir/touched"
	printf '{}\n' > "$dir/ack"
	if [ "$((seq + 1))" -lt "$count" ]; then webui_emit "$id" "$seq" accepted 200 "$dir/ack"; exit 0; fi
	jq -e 'type == "object" and (.action|type == "string")' "$dir/request" > /dev/null 2>&1 || { webui_error "$id" "$seq" 400 'invalid request'; touch "$dir/complete"; exit 1; }
	# JSON stores Unicode code points; encoded UTF-8 bytes are the actual file limit.
	action=$(jq -r .action "$dir/request")
	case "$action" in
		file_write|profile_upload)
			jq -j '.content // ""' "$dir/request" > "$dir/content"
			[ "$(wc -c < "$dir/content")" -le 8388608 ] || { webui_error "$id" "$seq" 413 'file exceeds 8 MiB'; touch "$dir/complete"; exit 1; }
			rm -f "$dir/content" ;;
	esac
	touch "$dir/running"
	echo "$$" > "$dir/pid"
	webui_emit "$id" "$seq" running 200 "$dir/ack"
	lock_release webui-transfer
	trap '' EXIT
	# Receiving files is independent; serialize operations that change router state.
	case "$action" in
		load|status|hosts|interfaces|proxies|files|file_read|log_read|debug|hwid|about|check_update) ;;
		*)
			if ! lock_acquire webui-operation 60; then
				webui_error "$id" "$seq" 503 'router operation is busy; retry later'
				cp "$WEBUI_DIR/responses/$id.json" "$dir/result.json"
				touch "$dir/complete"; rm -f "$dir/running"; exit 1
			fi
			trap 'lock_release webui-operation' EXIT ;;
	esac
	# All library functions are already loaded into this stable worker process.
	if ! api_run "$dir/request" "$dir/api-result"; then
		webui_error "$id" "$seq" 500 'operation failed internally'
	else
		status=$(jq -r .status "$dir/api-result")
		jq -c .data "$dir/api-result" > "$dir/body"
		case "$action" in
			load|status|hosts|interfaces|proxies|files|file_read|log_read|debug|hwid|about) ;;
			check_update) webui_cache_write check_update "$dir/api-result" || : ;;
			*) webui_cache_views_refresh || : ;;
		esac
		webui_emit "$id" "$seq" complete "$status" "$dir/body"
	fi
	cp "$WEBUI_DIR/responses/$id.json" "$dir/result.json"
	touch "$dir/complete"
	rm -f "$dir/running" "$dir/request" "$dir/api-result" "$dir/body"
	date +%s > "$dir/touched"
)

webui_settings_snapshot() (
	local id dir
	id="$1"
	case "$id" in ''|*[!0-9a-f]*) exit 1 ;; esac
	[ "${#id}" -eq 32 ] || exit 1
	umask 077
	mkdir -p "$WEBUI_DIR/snapshots" "$WEBUI_DIR/responses"
	lock_acquire webui-transfer 10 || exit 1
	trap 'lock_release webui-transfer' EXIT
	dir="$WEBUI_DIR/snapshots/$id"
	if [ -d "$dir" ]; then
		[ -f "$dir/settings-snapshot" ] && [ -f "$dir/result.json" ] || exit 1
		cp "$dir/result.json" "$WEBUI_DIR/responses/$id.json.tmp" && mv -f "$WEBUI_DIR/responses/$id.json.tmp" "$WEBUI_DIR/responses/$id.json"
		exit
	fi
	mkdir "$dir" || exit 1
	date +%s > "$dir/touched"
	if [ -f "$WEBUI_SETTINGS" ]; then
		cp "$WEBUI_SETTINGS" "$dir/shared" || { rm -rf "$dir"; exit 1; }
	else
		: > "$dir/shared"
	fi
	# Only the first space is structural. Keep empty values and all remaining bytes.
	jq -Rn '
		reduce inputs as $line ({}; ($line | index(" ")) as $space |
		if $space == null or $space == 0 then . else .[$line[:$space]] = $line[$space+1:] end)
	' < "$dir/shared" > "$dir/body" || { rm -rf "$dir"; exit 1; }
	webui_emit "$id" 0 complete 200 "$dir/body" || exit 1
	cp "$WEBUI_DIR/responses/$id.json" "$dir/result.json" || exit 1
	touch "$dir/settings-snapshot" "$dir/complete"
	rm -f "$dir/body" "$dir/shared"
)

webui_health() (
	local id body uptime heartbeat age dir
	id="$1"
	case "$id" in ''|*[!0-9a-f]*) exit 1 ;; esac
	[ "${#id}" -eq 32 ] || exit 1
	mkdir -p "$WEBUI_DIR/responses"
	lock_acquire webui-health 30 || { webui_error "$id" 0 503 'cache recovery is busy'; exit 1; }
	body="$WEBUI_DIR/health.$$"
	trap 'rm -f "$body"; lock_release webui-health' EXIT
	# Reuse the RAM snapshot lifetime so abandoned recovery responses expire.
	dir="$WEBUI_DIR/snapshots/$id"
	mkdir -p "$dir" || exit 1
	date +%s > "$dir/touched"
	# Uptime survives NTP corrections. Give a busy local refresh a full minute
	# before restarting a verified worker, and never touch the proxy service.
	uptime=$(awk '{print int($1)}' "$EXODUS_PROC/uptime" 2>/dev/null)
	heartbeat=$(jq -r '.uptime // empty' "$WEBUI_DIR/cache/heartbeat.json" 2>/dev/null)
	case "$uptime:$heartbeat" in
		*[!0-9:]*|:*|*:) ;;
		*) age=$((uptime - heartbeat))
			if [ "$age" -gt 60 ] && webui_cache_alive; then
				log WARN "WebUI cache stalled for ${age}s; restarting cache worker"
				webui_cache_stop || { webui_error "$id" 0 503 'cache worker did not stop'; exit 1; }
			fi ;;
	esac
	if ! webui_cache_start; then
		log ERROR 'WebUI cache recovery failed; inspect the Web log'
		webui_error "$id" 0 503 'cache recovery failed; run exodus web restart and check the Web log'; exit 1
	fi
	jq -cn --argjson now "$(date +%s)" '{router_time:$now}' > "$body" || exit 1
	webui_emit "$id" 0 complete 200 "$body"
)

webui_event() (
	local snapshot worker mode=packet id=
	[ "$1" = restart ] || exit 0
	case "$2" in
		exodus_ui) ;;
		exodus_ui_settings_*)
			mode=settings; id="${2#exodus_ui_settings_}"
			case "$id" in ''|*[!0-9a-f]*) exit 1 ;; esac
			[ "${#id}" -eq 32 ] || exit 1 ;;
		exodus_ui_health_*)
			mode=health; id="${2#exodus_ui_health_}"
			case "$id" in ''|*[!0-9a-f]*) exit 1 ;; esac
			[ "${#id}" -eq 32 ] || exit 1 ;;
		*) exit 0 ;;
	esac
	umask 077
	mkdir -p "$WEBUI_DIR/workers"
	lock_acquire webui-event 10 || exit 1
	trap 'lock_release webui-event' EXIT
	worker="$WEBUI_DIR/workers/$(random_hex 8)"
	mkdir "$worker" || exit 1
	snapshot="$worker/packet.json"
	if [ "$mode" = packet ]; then
		sed -n 's/^exodus_packet //p' "$WEBUI_SETTINGS" > "$snapshot"
		[ -s "$snapshot" ] || { rm -rf "$worker"; exit 0; }
	fi
	# Snapshot every sourced function before launching: updates can replace /opt.
	cp "$LIB_DIR/common.sh" "$LIB_DIR/api.sh" "$LIB_DIR/webui.sh" "$LIB_DIR/webui-api.sh" "$worker/" || exit 1
	cat > "$worker/run.sh" <<'WORKER'
#!/bin/sh
worker="${0%/*}"
. "$worker/common.sh"
. "$worker/api.sh"
. "$worker/webui.sh"
. "$worker/webui-api.sh"
case "$1" in
 settings) webui_settings_snapshot "$2" ;;
 health) webui_health "$2" ;;
 *) webui_accept "$worker/packet.json" ;;
esac
rm -rf "$worker"
WORKER
	# start-stop-daemon -x does not search PATH when setsid is unavailable.
	daemonize /bin/sh "$worker/run.sh" "$mode" "$id"
)

webui_cache_write() (
	local key result target body now
	key="$1"; result="$2"; target="$WEBUI_DIR/cache/$key.json"
	body="$target.body.$$"; now=$(date +%s)
	trap 'rm -f "$body" "$body.base64" "$target.tmp.$$"' EXIT
	mkdir -p "$WEBUI_DIR/cache" || exit 1
	jq -c .data "$result" > "$body" || exit 1
	webui_encode "$body" > "$body.base64" || exit 1
	jq -cn --arg key "$key" --argjson now "$now" --argjson status "$(jq -r .status "$result")" --rawfile body "$body.base64" \
		'{v:1,key:$key,generated:$now,status:$status,body:$body}' > "$target.tmp.$$" && mv -f "$target.tmp.$$" "$target"
)

# Local navigation reads do not need an apply event or a JFFS write.
# Refresh on startup, after mutations, and periodically for changes made by CLI.
webui_cache_views_refresh() (
	local key req result
	lock_acquire webui-views 30 || exit 1
	req="$WEBUI_DIR/views-request.$$"; result="$WEBUI_DIR/views-result.$$"
	trap 'rm -f "$req" "$result"; lock_release webui-views' EXIT
	for key in load files hosts interfaces proxies hwid about check_update; do
		jq -cn --arg action "$key" '{action:$action,cached:true}' > "$req" || exit 1
		api_run "$req" "$result" && webui_cache_write "$key" "$result" || exit 1
	done
)

# Cancel only the API worker we spawned and its descendants. Freeze each parent
# before discovering children so it cannot create another network process.
webui_updates_cancel() {
	local pid child
	pid="$1"
	[ -n "$pid" ] || return 0
	kill -STOP "$pid" 2>/dev/null || return 0
	awk -v parent="$pid" '$1 == "Pid:" { pid=$2 } $1 == "PPid:" && $2 == parent { print pid }' "$EXODUS_PROC"/[0-9]*/status 2>/dev/null |
	while read -r child; do
		webui_updates_cancel "$child"
	done
	kill -KILL "$pid" 2>/dev/null || :
}

# This function runs in the owning CLI, so $$ is the actual registered PID.
# Keep wait interruptible and cancel network descendants before releasing it.
webui_updates_refresh() {
	local req result update_child
	lock_acquire webui-updates 2 || return 0
	req="$WEBUI_DIR/update-request.$$"; result="$WEBUI_DIR/update-result.$$"
	update_child=
	echo "$$" > "$WEBUI_DIR/update.pid"
	trap 'webui_updates_cancel "$update_child"; wait "$update_child" 2>/dev/null; rm -f "$req" "$result" "$result.tmp" "$WEBUI_DIR/update.pid" "$WEBUI_DIR/cache/check_update.json.body.$$" "$WEBUI_DIR/cache/check_update.json.body.$$.base64" "$WEBUI_DIR/cache/check_update.json.tmp.$$"; rm -rf "$RUN_TMP/latest.$$"; lock_release webui-updates' EXIT
	trap 'exit 0' TERM INT HUP
	date +%s > "$WEBUI_DIR/update-checked"
	printf '{"action":"check_update"}\n' > "$req"
	api_run "$req" "$result" &
	update_child=$!
	if wait "$update_child"; then
		webui_cache_write check_update "$result" &
		update_child=$!
		wait "$update_child"
		exit $?
	fi
	exit 1
}

webui_updates_start() {
	local last now
	pid_alive "$WEBUI_DIR/update.pid" && return 0
	last=$(cat "$WEBUI_DIR/update-checked" 2>/dev/null); now=$(date +%s)
	case "$last" in ''|*[!0-9]*) last=0 ;; esac
	[ "$((now - last))" -lt 300 ] && [ "$now" -ge "$last" ] && return 0
	daemonize "$EXODUS" web updates
}

webui_cache_refresh() (
	local name key req result target fingerprint previous now body path
	umask 077
	mkdir -p "$WEBUI_DIR/cache" || exit 1
	trap 'rm -f "$req" "$result" "$result.body" "$body"' EXIT
	for name in status app core update debug web; do
		if [ "$name" = status ]; then key=status; else key="log-$name"; fi
		target="$WEBUI_DIR/cache/$key.json"
		now=$(date +%s)
		if [ "$name" != status ]; then
			path=$(log_path "$name")
			if [ -f "$path" ]; then
				# An unavailable/limited firmware stat must not freeze a live log
				# behind the same fingerprint used for genuinely missing files.
				fingerprint=$(stat -c '%i:%s:%Y' "$path" 2> /dev/null) || fingerprint=
			else
				fingerprint=absent
			fi
			previous=$(cat "$target.fingerprint" 2> /dev/null)
			if [ -n "$fingerprint" ] && [ "$fingerprint" = "$previous" ] && [ -f "$target" ] &&
				jq -e '.v == 1 and (.body | type == "string" and length > 0)' "$target" > /dev/null 2>&1; then
				# Refresh the liveness timestamp separately; unchanged log payload is not rewritten.
				continue
			fi
		fi
		req="$WEBUI_DIR/cache/request.$$"; result="$WEBUI_DIR/cache/result.$$"
		if [ "$name" = status ]; then echo '{"action":"status"}' > "$req";
		else jq -cn --arg name "$name" '{action:"log_read",name:$name}' > "$req"; fi
		api_run "$req" "$result" || exit 1
		body="$result.data"
		jq -c .data "$result" > "$body" || exit 1
		webui_encode "$body" > "$result.body" || exit 1
		jq -cn --arg key "$key" --argjson now "$now" --argjson status "$(jq -r .status "$result")" --rawfile body "$result.body" \
			'{v:1,key:$key,generated:$now,status:$status,body:$body}' > "$target.tmp" && mv -f "$target.tmp" "$target" || exit 1
		[ "$name" = status ] || printf '%s\n' "$fingerprint" > "$target.fingerprint"
		rm -f "$req" "$result" "$result.body" "$body"
	done
	[ -f "$WEBUI_DIR/cache/load.json" ] || webui_cache_views_refresh || exit 1
	jq -cn --argjson now "$(date +%s)" --argjson uptime "$(awk '{print int($1)}' "$EXODUS_PROC/uptime")" \
		'{v:1,generated:$now,uptime:$uptime}' > "$WEBUI_DIR/cache/heartbeat.json.tmp" && mv -f "$WEBUI_DIR/cache/heartbeat.json.tmp" "$WEBUI_DIR/cache/heartbeat.json"
)

# The cache worker remains active with the proxy stopped, so it owns the bound
# on its diagnostic RAM log. Keep the tail and the inode used by stderr.
webui_log_limit() (
	local limit bytes tail_file
	limit=$(cfg_get .log.max_size); limit="${limit:-1}"
	case "$limit" in *[!0-9]*|0) exit 0 ;; esac
	bytes=$((limit * 1024 * 1024))
	[ -f "$WEB_LOG_PATH" ] && [ "$(wc -c < "$WEB_LOG_PATH")" -ge "$bytes" ] || exit 0
	tail_file="$WEB_LOG_PATH.tail.$$"
	trap 'rm -f "$tail_file"' EXIT
	tail -c 65536 "$WEB_LOG_PATH" > "$tail_file" && cat "$tail_file" > "$WEB_LOG_PATH"
)

webui_cache_loop() {
	. "$LIB_DIR/api.sh"
	. "$LIB_DIR/webui.sh"
	local tick=0 failed=0
	while :; do
		webui_log_limit
		if webui_cache_refresh; then
			[ "$failed" = 0 ] || log INFO 'WebUI cache refresh recovered'
			failed=0
		else
			[ "$failed" = 1 ] || log ERROR 'WebUI cache refresh failed; inspect the Web log'
			failed=1
		fi
		webui_gc
		if [ "$tick" -gt 0 ] && [ "$((tick % 6))" -eq 0 ]; then webui_cache_views_refresh; fi
		webui_updates_start
		# Firmware menu rebuilds need recovery, even while the proxy is stopped.
		if [ "$tick" -ge 12 ]; then webui_status || webui_mount; tick=0; fi
		tick=$((tick + 1)); sleep 5
	done
}
