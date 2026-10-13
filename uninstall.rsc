# Exodus for MikroTik: removes the container and everything it and the installer added to RouterOS
#   /tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/uninstall.rsc" dst-path=exodus-uninstall.rsc; /import exodus-uninstall.rsc
# :global exodusKeepData yes keeps <disk>/exodus/data: settings, profiles and subscriptions
# the registry-url of /container/config and the www service are left as they are

{
:global exodusKeepData

:local name "exodus"
:local veth "veth-exodus"
:local setup "exodus setup"

:put "Exodus for MikroTik: uninstall"

# the container removes its rules on stop, the rest is removed below anyway
:local container [/container find where name=$name]
:local rootDir ""
:if ([:len $container] > 0) do={
	:do { :set rootDir [/container get $container root-dir] } on-error={}
	:put "stop the container"
	:do { /container stop $container } on-error={}
	:local n 0
	:local running true
	:while ($running && $n < 60) do={
		:set running false
		:do { :set running ([/container get $container status] = "running") } on-error={
			:do { :set running ([/container get $container running] = true) } on-error={}
		}
		:if ($running) do={ :delay 1s }
		:set n ($n + 1)
	}
	/container remove $container
	:set n 0
	:while ([:len [/container find where name=$name]] > 0 && $n < 60) do={
		:delay 1s
		:set n ($n + 1)
	}
}

# the rules of the container: comments start with "exodus:"
:put "remove the rules"
/ip firewall mangle remove [find where comment~"^exodus:"]
/ip firewall nat remove [find where comment~"^exodus:" or comment=$setup]
/ip firewall filter remove [find where comment~"^exodus:" or comment=$setup]
/ip firewall address-list remove [find where comment~"^exodus:"]
/ip route remove [find where comment~"^exodus:"]
/ipv6 firewall mangle remove [find where comment~"^exodus:"]
/ipv6 firewall nat remove [find where comment~"^exodus:" or comment=$setup]
/ipv6 firewall filter remove [find where comment~"^exodus:" or comment=$setup]
/ipv6 firewall address-list remove [find where comment~"^exodus:"]
/ipv6 route remove [find where comment~"^exodus:"]
/tool netwatch remove [find where comment~"^exodus:"]
:do { /routing table remove [find where name=$name] } on-error={ :put "warning: the routing table exodus is still in use, remove it later" }

:put "remove the container settings, the user and the veth"
:do { /container envs remove [find where list=$name] } on-error={
	:do { /container envs remove [find where name=$name] } on-error={}
}
:do { /container mounts remove [find where list=$name] } on-error={
	:do { /container mounts remove [find where name=$name] } on-error={}
}
/user remove [find where name=$name]
/user group remove [find where name=$name]
/ip address remove [find where comment=$setup]
/ipv6 address remove [find where comment=$setup]
/interface veth remove [find where name=$veth]

# the files: the image is gone with the container, the data is kept on request
:local base ""
:if ([:len $rootDir] > 0 && [:find $rootDir "/root"] > 0) do={
	:set base [:pick $rootDir 0 [:find $rootDir "/root"]]
}
:if ([:len $base] > 0) do={
	:do { /file remove [find where name=($base . "/root")] } on-error={}
	:do { /file remove [find where name=($base . "/tmp")] } on-error={}
	:if ($exodusKeepData = "yes" || $exodusKeepData = true) do={
		:put ("the data is kept in " . $base . "/data")
	} else={
		:do { /file remove [find where name=($base . "/data")] } on-error={}
		:do { /file remove [find where name=$base] } on-error={}
	}
}
:put "success"
}
