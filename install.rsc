# Exodus for MikroTik: installs, updates and repairs the container on RouterOS 7.20 or newer
# in the terminal of the router:
#   /tool fetch url="https://raw.githubusercontent.com/prettyleaf/openwrt-exodus/mikrotik/install.rsc" dst-path=exodus-install.rsc; /import exodus-install.rsc
# options are global variables set before the import, for example :global exodusDisk "usb1"
#   exodusDisk      the disk of the container (usb1, nvme1, sata1...), the first ext4 disk by default
#   exodusPassword  the password of the web ui on the first install, generated otherwise
#   exodusNetwork   the first three numbers of the /30 network of the container, 172.31.255 by default
#   exodusIPv6      yes gives the container an IPv6 address (fd65:786f:6475::2), no by default
#   exodusLanList   the interface list of the local network, LAN by default
#   exodusImage     the image on ghcr.io, prettyleaf/exodus-mikrotik:latest by default
#   exodusFile      an image file on the router (exodus-mikrotik-<arch>.tar) instead of the registry, "github" downloads it
#   exodusGhProxy   gh-proxy for GitHub (https://example.com/ghproxy/TOKEN), for the image file and the updates inside the container
# the settings, profiles and subscriptions live in <disk>/exodus/data and are kept, the container is created again from the image

{
:global exodusDisk
:global exodusPassword
:global exodusNetwork
:global exodusIPv6
:global exodusLanList
:global exodusImage
:global exodusFile
:global exodusGhProxy

# not "name": in [find where name=$name] routeros takes $name for the property of the item, and every item matches
:local appName "exodus"
:local veth "veth-exodus"
:local setup "exodus setup"
:local image "prettyleaf/exodus-mikrotik:latest"
:local registry "https://ghcr.io"
:local net "172.31.255"
:local lan "LAN"
:local v6 false
:local rip6 "fd65:786f:6475::1"
:local cip6 "fd65:786f:6475::2"

:if ([:len $exodusImage] > 0) do={ :set image $exodusImage }
:if ([:len $exodusNetwork] > 0) do={ :set net $exodusNetwork }
:if ([:len $exodusLanList] > 0) do={ :set lan $exodusLanList }
:if ($exodusIPv6 = "yes" || $exodusIPv6 = true) do={ :set v6 true }
:local rip ($net . ".1")
:local cip ($net . ".2")

:put "Exodus for MikroTik: install"

# ---------- checks ----------

# 7.20.4 (stable): the major and the minor number
:local version [/system resource get version]
:local dot [:find $version "."]
:local major [:tonum [:pick $version 0 $dot]]
:local minor ""
:local i ($dot + 1)
:while ($i < [:len $version] && [:pick $version $i] ~ "[0-9]") do={
	:set minor ($minor . [:pick $version $i])
	:set i ($i + 1)
}
:set minor [:tonum $minor]
:put ("RouterOS " . $version . ", " . [/system resource get architecture-name])
:if ($major < 7 || ($major = 7 && $minor < 20)) do={
	:error "error: RouterOS 7.20 or newer is needed, its containers have nftables with TPROXY"
}

:if ([:len [/system package find where name="container"]] = 0) do={
	:error "error: the container package is not installed: download the extra packages of your version from mikrotik.com, upload container-*.npk to Files and reboot"
}

:local mode
:do { :set mode [/system device-mode get container] } on-error={ :set mode false }
:if ($mode != true && $mode != "yes") do={
	:error "error: containers are not allowed: run /system/device-mode/update container=yes and press the reset button (or power off the router) within 5 minutes, then import this script again"
}

# the disk: the given one, or the first ext4 disk; the internal flash wears out and is small, it is the last choice
:local disk ""
:if ([:len $exodusDisk] > 0) do={
	:set disk $exodusDisk
} else={
	:foreach d in=[/disk find] do={
		:if ([:len $disk] = 0) do={
			:local fs ""
			:local slot ""
			:do { :set fs [/disk get $d fs] } on-error={}
			:do { :set slot [/disk get $d slot] } on-error={}
			:if ($fs = "ext4" && [:len $slot] > 0) do={ :set disk $slot }
		}
	}
}
:local base "exodus"
:if ([:len $disk] > 0) do={
	:set base ($disk . "/exodus")
	:put ("disk: " . $disk)
} else={
	:put "warning: no ext4 disk is found, the container goes to the internal flash: it needs about 100 MB, a USB or NVMe disk formatted as ext4 is better"
}
:local rootDir ($base . "/root")
:local dataDir ($base . "/data")
:local tmpDir ($base . "/tmp")

:if ([:len [/interface list find where name=$lan]] = 0) do={
	:put ("warning: the interface list " . $lan . " is not found, choose the list of the local network in Settings of the web UI")
}

# ---------- the container is stopped and removed, its data stays ----------

# the state of the container by its flags: 7.24 has no status property
:local isRunning do={
	:return ([:len [/container find where name=$1 and running]] > 0)
}

:local existing [/container find where name=$appName]
:local firstInstall true
:if ([:len [/file find where name=($dataDir . "/web.auth")]] > 0) do={ :set firstInstall false }
:if ([:len $existing] > 0) do={
	:set firstInstall false
	:put "stop the container"
	:do { /container stop $existing } on-error={}
	:local n 0
	:while ([$isRunning $appName] && $n < 60) do={
		:delay 1s
		:set n ($n + 1)
	}
	:put "remove the container, the settings are kept"
	/container remove $existing
	:set n 0
	:while ([:len [/container find where name=$appName]] > 0 && $n < 60) do={
		:delay 1s
		:set n ($n + 1)
	}
}
# a root dir left from a removed container stops the extraction of the new one
:do { /file remove [find where name=$rootDir] } on-error={}
:if ([:len [/file find where name=$dataDir]] = 0) do={
	:do { /file add type=directory name=$dataDir } on-error={}
}

# ---------- network of the container ----------

:local addresses ($cip . "/30")
:if ($v6) do={ :set addresses ($addresses . "," . $cip6 . "/64") }
:if ([:len [/interface veth find where name=$veth]] = 0) do={
	/interface veth add name=$veth address=$addresses gateway=$rip comment=$setup
} else={
	/interface veth set [find where name=$veth] address=$addresses gateway=$rip
}
:if ($v6) do={
	/interface veth set [find where name=$veth] gateway6=$rip6
} else={
	:do { /interface veth set [find where name=$veth] gateway6="" } on-error={}
}
/ip address remove [find where comment=$setup]
/ip address add address=($rip . "/30") interface=$veth comment=$setup
/ipv6 address remove [find where comment=$setup]
:if ($v6) do={
	/ipv6 address add address=($rip6 . "/64") interface=$veth advertise=no comment=$setup
}

# the container reaches the internet through the nat of the router, the rest api and the dns of the router through input
/ip firewall nat remove [find where comment=$setup]
/ip firewall nat add chain=srcnat action=masquerade src-address=$cip comment=$setup
/ipv6 firewall nat remove [find where comment=$setup]
:if ($v6) do={
	/ipv6 firewall nat add chain=srcnat action=masquerade src-address=($cip6 . "/128") comment=$setup
}
/ip firewall filter remove [find where comment=$setup]
:local first [/ip firewall filter find where dynamic=no]
:if ([:len $first] > 0) do={
	/ip firewall filter add chain=input action=accept in-interface=$veth src-address=$cip comment=$setup place-before=[:pick $first 0]
} else={
	/ip firewall filter add chain=input action=accept in-interface=$veth src-address=$cip comment=$setup
}
/ipv6 firewall filter remove [find where comment=$setup]
:if ($v6) do={
	:local first6 [/ipv6 firewall filter find where dynamic=no]
	:if ([:len $first6] > 0) do={
		/ipv6 firewall filter add chain=input action=accept in-interface=$veth src-address=($cip6 . "/128") comment=$setup place-before=[:pick $first6 0]
	} else={
		/ipv6 firewall filter add chain=input action=accept in-interface=$veth src-address=($cip6 . "/128") comment=$setup
	}
}

# the routing table of the proxied traffic, the container fills it
:if ([:len [/routing table find where name=$appName]] = 0) do={
	/routing table add name=$appName fib comment=$setup
}

# ---------- the rest api ----------

# http on the veth: the traffic does not leave the router; https when only it is on
:local url ""
:local www [/ip service find where name="www"]
:local wwwSsl [/ip service find where name="www-ssl"]
:if ([/ip service get $www disabled] = false) do={
	:set url ("http://" . $rip . ":" . [/ip service get $www port])
} else={
	:if ([/ip service get $wwwSsl disabled] = false) do={
		:set url ("https://" . $rip . ":" . [/ip service get $wwwSsl port])
	} else={
		:put "the rest api needs the www service, it is turned on for the container only"
		/ip service set $www disabled=no address=($cip . "/32")
		:set url ("http://" . $rip . ":" . [/ip service get $www port])
	}
}
# a service limited to some addresses gets the address of the container
:foreach s in=($www, $wwwSsl) do={
	:local allowed [/ip service get $s address]
	:if ([/ip service get $s disabled] = false && [:len $allowed] > 0) do={
		:local found false
		:foreach a in=$allowed do={
			:if ([:tostr $a] = ($cip . "/32") || [:tostr $a] = $cip || [:tostr $a] = ($net . ".0/30")) do={ :set found true }
		}
		:if (!$found) do={
			/ip service set $s address=($allowed, ($cip . "/32"))
		}
	}
}
:put ("rest api: " . $url)

# the user of the container: rules, routes and the lists of devices; it logs in only from the container
:local password [:rndstr length=24 from="abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"]
:if ([:len [/user group find where name=$appName]] = 0) do={
	/user group add name=$appName policy=read,write,api,rest-api comment=$setup
} else={
	/user group set [find where name=$appName] policy=read,write,api,rest-api
}
:if ([:len [/user find where name=$appName]] = 0) do={
	/user add name=$appName group=$appName password=$password address=($cip . "/32") comment=$setup
} else={
	/user set [find where name=$appName] group=$appName password=$password address=($cip . "/32")
}

# ---------- the container ----------

:local oldRegistry [/container config get registry-url]
:if ([:len $exodusFile] = 0 && $oldRegistry != $registry) do={
	:put ("registry-url was " . $oldRegistry . ", it is set to " . $registry . ": other containers pull from it too")
	/container config set registry-url=$registry
}
/container config set tmpdir=$tmpDir

# envs and mounts: "list" since 7.21, "name" before
:local addEnv do={
	:do { /container envs add list=$1 key=$2 value=$3 } on-error={ /container envs add name=$1 key=$2 value=$3 }
}
:do { /container envs remove [find where list=$appName] } on-error={
	:do { /container envs remove [find where name=$appName] } on-error={}
}
$addEnv $appName "ROS_URL" $url
$addEnv $appName "ROS_USER" $appName
$addEnv $appName "ROS_PASSWORD" $password
$addEnv $appName "ROS_LAN_LIST" $lan
:local tz ""
:do { :set tz [/system clock get time-zone-name] } on-error={}
:if ([:len $tz] > 0 && $tz != "manual") do={ $addEnv $appName "TZ" $tz }
:if ([:len $exodusGhProxy] > 0) do={ $addEnv $appName "GH_PROXY" $exodusGhProxy }
:local webPassword ""
:if ($firstInstall) do={
	:set webPassword $exodusPassword
	:if ([:len $webPassword] < 4) do={ :set webPassword [:rndstr length=12 from="abcdefghijkmnopqrstuvwxyz23456789"] }
	$addEnv $appName "PASSWORD" $webPassword
}

:do { /container mounts remove [find where list=$appName] } on-error={
	:do { /container mounts remove [find where name=$appName] } on-error={}
}
:do { /container mounts add list=$appName src=$dataDir dst="/opt/etc/exodus" } on-error={
	/container mounts add name=$appName src=$dataDir dst="/opt/etc/exodus"
}

# the image file for the architecture of the router from the releases of github
:local file $exodusFile
:if ($file = "github") do={
	:local arch [/system resource get architecture-name]
	:local tag "amd64"
	:if ($arch = "arm64") do={ :set tag "arm64" }
	:if ($arch = "arm") do={ :set tag "armv7" }
	:set file ($base . "/exodus-mikrotik-" . $tag . ".tar")
	:local fileUrl ("https://github.com/prettyleaf/openwrt-exodus/releases/download/mikrotik-image/exodus-mikrotik-" . $tag . ".tar")
	:if ([:len $exodusGhProxy] > 0) do={ :set fileUrl ($exodusGhProxy . "/" . $fileUrl) }
	:put ("download " . $fileUrl)
	/tool fetch url=$fileUrl dst-path=$file
}

:put "add the container"
:if ([:len $file] > 0) do={
	:do {
		/container add file=$file interface=$veth root-dir=$rootDir mountlists=$appName envlists=$appName start-on-boot=yes logging=yes name=$appName
	} on-error={
		/container add file=$file interface=$veth root-dir=$rootDir mounts=$appName envlist=$appName start-on-boot=yes logging=yes name=$appName
	}
} else={
	:do {
		/container add remote-image=$image interface=$veth root-dir=$rootDir mountlists=$appName envlists=$appName start-on-boot=yes logging=yes name=$appName
	} on-error={
		/container add remote-image=$image interface=$veth root-dir=$rootDir mounts=$appName envlist=$appName start-on-boot=yes logging=yes name=$appName
	}
}

# the image is pulled and extracted, then the container is stopped
# the state is read by the flags, 7.24 has no status property; before it the status tells an error of the extraction
:local container [/container find where name=$appName]
:local ready false
:local failed false
:local n 0
:while (!$ready && !$failed && $n < 900) do={
	:if ([:len [/container find where name=$appName and stopped]] > 0) do={ :set ready true }
	:do { :if ([/container get $container status] = "error") do={ :set failed true } } on-error={}
	:if (!$ready && !$failed) do={
		:if (($n % 15) = 0) do={ :put "waiting for the image" }
		:delay 1s
		:set n ($n + 1)
	}
}
:if (!$ready) do={
	:error "error: the image is not extracted, see /log print where topics~\"container\""
}
:if ([:len $file] > 0 && $exodusFile = "github") do={ /file remove [find where name=$file] }

:put "start the container"
/container start $container
:set n 0
:while (![$isRunning $appName] && $n < 30) do={
	:delay 1s
	:set n ($n + 1)
}
:if (![$isRunning $appName]) do={
	:put "warning: the container is not running, see /log print where topics~\"container\""
}

:put ""
:put "Exodus is installed"
:put ("web ui: http://<address of the router>:9099/ or http://" . $cip . ":9099/")
:if ([:len $webPassword] > 0) do={
	:put ("password of the web ui: " . $webPassword)
} else={
	:put "the password of the web ui is kept, reset it with: /container shell exodus cmd=\"exodus passwd\""
}
:put "logs: /log print where topics~\"container\""
:put "success"
}
