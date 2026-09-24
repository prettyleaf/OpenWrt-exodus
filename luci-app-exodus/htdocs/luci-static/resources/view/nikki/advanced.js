'use strict';
'require form';
'require view';
'require uci';
'require network';
'require tools.nikki as nikki';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('nikki'),
            network.getHostHints(),
            network.getNetworks(),
            nikki.getIdentifiers(),
            L.resolveDefault(nikki.hwid(), {}),
        ]);
    },
    render: function (data) {
        const hosts = data[1].hosts;
        const networks = data[2];
        const users = data[3]?.users ?? [];
        const groups = data[3]?.groups ?? [];
        const cgroups = data[3]?.cgroups ?? [];
        const hwidHeaders = data[4]?.headers ?? {};
        const generatedHwid = data[4]?.generated;

        let m, s, o, so;

        m = new form.Map('nikki', _('Advanced'), `<div class="alert-message warning">${_('These settings are for experienced users only. Do not change anything here unless you know exactly what you are doing: wrong values can break the proxy or the internet access of the whole network.')}</div>`);

        s = m.section(form.NamedSection, 'proxy', 'proxy', _('Proxy Config'));

        s.tab('proxy', _('Proxy Config'));

        o = s.taboption('proxy', form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;

        o = s.taboption('proxy', form.ListValue, 'tcp_mode', _('TCP Mode'));
        o.optional = true;
        o.placeholder = _('Disable');
        o.value('redirect', _('Redirect Mode'));
        o.value('tproxy', _('TPROXY Mode'));
        o.value('tun', _('TUN Mode'));

        o = s.taboption('proxy', form.ListValue, 'udp_mode', _('UDP Mode'));
        o.optional = true;
        o.placeholder = _('Disable');
        o.value('tproxy', _('TPROXY Mode'));
        o.value('tun', _('TUN Mode'));

        o = s.taboption('proxy', form.Flag, 'ipv4_dns_hijack', _('IPv4 DNS Hijack'));
        o.rmempty = false;

        o = s.taboption('proxy', form.Flag, 'ipv6_dns_hijack', _('IPv6 DNS Hijack'));
        o.rmempty = false;

        o = s.taboption('proxy', form.Flag, 'ipv4_proxy', _('IPv4 Proxy'));
        o.rmempty = false;

        o = s.taboption('proxy', form.Flag, 'ipv6_proxy', _('IPv6 Proxy'));
        o.rmempty = false;

        o = s.taboption('proxy', form.Flag, 'fake_ip_ping_hijack', _('Fake-IP Ping Hijack'));
        o.rmempty = false;

        s.tab('router', _('Router Proxy'));

        o = s.taboption('router', form.Flag, 'router_proxy', _('Enable'));
        o.rmempty = false;

        o = s.taboption('router', form.SectionValue, '_router_access_control', form.TableSection, 'router_access_control', _('Access Control'));
        o.retain = true;
        o.depends('router_proxy', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = '1';
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'user', _('User'));

        for (const user of users) {
            so.value(user);
        };

        so = o.subsection.option(form.DynamicList, 'group', _('Group'));

        for (const group of groups) {
            so.value(group);
        };

        so = o.subsection.option(form.DynamicList, 'cgroup', _('CGroup'));

        for (const cgroup of cgroups) {
            so.value(cgroup);
        };

        so = o.subsection.option(form.Flag, 'dns', _('DNS'));
        so.rmempty = false;

        so = o.subsection.option(form.Flag, 'proxy', _('Proxy'));
        so.rmempty = false;

        s.tab('lan', _('LAN Proxy'));

        o = s.taboption('lan', form.Flag, 'lan_proxy', _('Enable'));
        o.rmempty = false;

        o = s.taboption('lan', form.DynamicList, 'lan_inbound_interface', _('Inbound Interface'));
        o.retain = true;
        o.rmempty = false;
        o.depends('lan_proxy', '1');

        for (const network of networks) {
            if (network.getName() === 'loopback') {
                continue;
            }
            o.value(network.getName());
        }

        o = s.taboption('lan', form.SectionValue, '_lan_access_control', form.TableSection, 'lan_access_control', _('Access Control'));
        o.retain = true;
        o.depends('lan_proxy', '1');

        o.subsection.description = _('Rules are matched from top to bottom. The device selection on the main page is stored here, changing it there replaces these rules.');
        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = '1';
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'ip', 'IP');
        so.datatype = 'ip4addr';

        for (const mac in hosts) {
            const host = hosts[mac];
            for (const ip of host.ipaddrs) {
                const hint = host.name ?? mac;
                so.value(ip, hint ? '%s (%s)'.format(ip, hint) : ip);
            };
        };

        so = o.subsection.option(form.DynamicList, 'ip6', 'IP6');
        so.datatype = 'ip6addr';

        for (const mac in hosts) {
            const host = hosts[mac];
            for (const ip of host.ip6addrs) {
                const hint = host.name ?? mac;
                so.value(ip, hint ? '%s (%s)'.format(ip, hint) : ip);
            };
        };

        so = o.subsection.option(form.DynamicList, 'mac', 'MAC');
        so.datatype = 'macaddr';

        for (const mac in hosts) {
            const host = hosts[mac];
            const hint = host.name ?? host.ipaddrs[0];
            so.value(mac, hint ? '%s (%s)'.format(mac, hint) : mac);
        };

        so = o.subsection.option(form.Flag, 'dns', _('DNS'));
        so.rmempty = false;

        so = o.subsection.option(form.Flag, 'proxy', _('Proxy'));
        so.rmempty = false;

        s.tab('bypass', _('Bypass'));

        o = s.taboption('bypass', form.Flag, 'bypass_china_mainland_ip', _('Bypass China Mainland IP'));
        o.rmempty = false;

        o = s.taboption('bypass', form.Flag, 'bypass_china_mainland_ip6', _('Bypass China Mainland IP6'));
        o.rmempty = false;

        o = s.taboption('bypass', form.Value, 'proxy_tcp_dport', _('Destination TCP Port to Proxy'));
        o.rmempty = false;
        o.value('0-65535', _('All Port'));
        o.value('21 22 80 110 143 194 443 465 853 993 995 8080 8443', _('Commonly Used Port'));

        o = s.taboption('bypass', form.Value, 'proxy_udp_dport', _('Destination UDP Port to Proxy'));
        o.rmempty = false;
        o.value('0-65535', _('All Port'));
        o.value('123 443 8443', _('Commonly Used Port'));

        o = s.taboption('bypass', form.DynamicList, 'bypass_dscp', _('Bypass DSCP'));
        o.datatype = 'range(0, 63)';

        o = s.taboption('bypass', form.DynamicList, 'bypass_fwmark', _('Bypass FWMark'));

        s.tab('misc', _('Misc'));

        o = s.taboption('misc', form.DynamicList, 'reserved_ip', _('Reserved IP'));
        o.datatype = 'ip4addr';

        o = s.taboption('misc', form.DynamicList, 'reserved_ip6', _('Reserved IP6'));
        o.datatype = 'ip6addr';

        o = s.taboption('misc', form.Value, 'tun_timeout', _('TUN Timeout'));
        o.datatype = 'uinteger';
        o.rmempty = false;

        o = s.taboption('misc', form.Value, 'tun_interval', _('TUN Interval'));
        o.datatype = 'uinteger';
        o.rmempty = false;

        // hwid is an option of the app config, the other headers are read from the router
        o = s.taboption('misc', form.Value, 'hwid', _('HWID'), _('Device identifier sent to subscriptions with HWID enabled (device limit). Generated from the router hardware when empty.'));
        o.ucisection = 'config';
        o.placeholder = generatedHwid ?? _('Auto');

        for (const [header, title] of [['x-device-os', _('Device OS')], ['x-ver-os', _('OS Version')], ['x-device-model', _('Device Model')]]) {
            o = s.taboption('misc', form.DummyValue, `_${header.replaceAll('-', '_')}`, title, _('Sent in the %s header, read from the router.').format(header));
            o.cfgvalue = function () {
                return hwidHeaders[header] || '-';
            };
        }

        s = m.section(form.NamedSection, 'mixin', 'mixin', _('Mixin Option'));

        s.tab('general', _('General Config'));

        o = s.taboption('general', form.ListValue, 'log_level', _('Log Level'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('silent');
        o.value('error');
        o.value('warning');
        o.value('info');
        o.value('debug');

        o = s.taboption('general', form.ListValue, 'mode', _('Mode'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('global', _('Global Mode'));
        o.value('rule', _('Rule Mode'));
        o.value('direct', _('Direct Mode'));

        o = s.taboption('general', form.ListValue, 'match_process', _('Match Process'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('off');
        o.value('strict');
        o.value('always');

        o = s.taboption('general', form.ListValue, 'outbound_interface', _('Outbound Interface'));
        o.optional = true;
        o.placeholder = _('Unmodified');

        for (const network of networks) {
            if (network.getName() === 'loopback') {
                continue;
            }
            o.value(network.getName());
        }

        o = s.taboption('general', form.ListValue, 'ipv6', 'IPv6');
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'unify_delay', _('Unify Delay'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'tcp_concurrent', _('TCP Concurrent'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.ListValue, 'disable_tcp_keep_alive', _('Disable TCP Keep Alive'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('general', form.Value, 'tcp_keep_alive_idle', _('TCP Keep Alive Idle'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('general', form.Value, 'tcp_keep_alive_interval', _('TCP Keep Alive Interval'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        s.tab('external_control', _('External Control Config'));

        o = s.taboption('external_control', form.Button, '_open_dashboard', _('Dashboard'));
        o.inputtitle = _('Open Dashboard');
        o.onclick = function () {
            return nikki.openDashboard();
        };

        o = s.taboption('external_control', form.Button, '_update_dashboard');
        o.inputstyle = 'positive';
        o.inputtitle = _('Update Dashboard');
        o.onclick = function () {
            return nikki.updateDashboard();
        };

        o = s.taboption('external_control', form.Value, 'ui_path', _('UI Path'));
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'ui_name', _('UI Name'));
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'ui_url', _('UI Url'));
        o.placeholder = _('Unmodified');
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard (CDN Fonts)');
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip', 'Zashboard');
        o.value('https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD');
        o.value('https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD');
        o.value('https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip', 'Razord');

        o = s.taboption('external_control', form.Value, 'api_listen', _('API Listen'));
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'api_tls_listen', _('API TLS Listen'));
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'api_tls_cert', _('API TLS Cert'));
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'api_tls_key', _('API TLS Key'));
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'api_tls_ech_key', _('API TLS ECH Key'));
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.Value, 'api_secret', _('API Secret'));
        o.password = true;
        o.placeholder = _('Unmodified');

        o = s.taboption('external_control', form.ListValue, 'selection_cache', _('Save Proxy Selection'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        s.tab('inbound', _('Inbound Config'));

        o = s.taboption('inbound', form.ListValue, 'allow_lan', _('Allow Lan'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('inbound', form.Value, 'http_port', _('HTTP Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'socks_port', _('SOCKS Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'mixed_port', _('Mixed Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'redir_port', _('Redirect Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Value, 'tproxy_port', _('TPROXY Port'));
        o.datatype = 'port';
        o.placeholder = _('Unmodified');

        o = s.taboption('inbound', form.Flag, 'authentication', _('Overwrite Authentication'));
        o.rmempty = false;

        o = s.taboption('inbound', form.SectionValue, '_authentications', form.TableSection, 'authentication', _('Edit Authentications'));
        o.retain = true;
        o.depends('authentication', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'username', _('Username'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'password', _('Password'));
        so.password = true;
        so.rmempty = false;

        s.tab('tun', _('TUN Config'));

        o = s.taboption('tun', form.ListValue, 'tun_enabled', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('tun', form.Value, 'tun_device', _('Device Name'));
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.ListValue, 'tun_stack', _('Stack'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('system', 'System');
        o.value('gvisor', 'gVisor');
        o.value('mixed', 'Mixed');

        o = s.taboption('tun', form.Value, 'tun_mtu', _('MTU'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.ListValue, 'tun_gso', _('GSO'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('tun', form.Value, 'tun_gso_max_size', _('GSO Max Size'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('tun', form.Flag, 'tun_dns_hijack', _('Overwrite DNS Hijack'));
        o.rmempty = false;

        o = s.taboption('tun', form.DynamicList, 'tun_dns_hijacks', _('Edit DNS Hijacks'));
        o.retain = true;
        o.depends('tun_dns_hijack', '1');
        o.value('tcp://any:53');
        o.value('udp://any:53');

        s.tab('dns', _('DNS Config'));

        o = s.taboption('dns', form.ListValue, 'dns_enabled', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_cache_algorithm', _('DNS Cache Algorithm'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('lru', _('Least Recently Used (LRU)'));
        o.value('arc', _('Adaptive Replacement Cache (ARC)'));

        o = s.taboption('dns', form.Value, 'dns_listen', _('DNS Listen'));
        o.datatype = 'ipaddrport(1)';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.ListValue, 'dns_ipv6', 'IPv6');
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_mode', _('DNS Mode'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('redir-host', 'Redir-Host');
        o.value('fake-ip', 'Fake-IP');

        o = s.taboption('dns', form.Value, 'fake_ip_range', _('Fake-IP Range'));
        o.datatype = 'cidr4';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Value, 'fake_ip6_range', _('Fake-IP6 Range'));
        o.datatype = 'cidr6';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Value, 'fake_ip_ttl', _('Fake-IP TTL'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        o = s.taboption('dns', form.Flag, 'fake_ip_filter', _('Overwrite Fake-IP Filter'));
        o.rmempty = false;

        o = s.taboption('dns', form.DynamicList, 'fake_ip_filters', _('Edit Fake-IP Filters'));
        o.retain = true;
        o.depends('fake_ip_filter', '1');

        o = s.taboption('dns', form.ListValue, 'fake_ip_filter_mode', _('Fake-IP Filter Mode'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('blacklist', _('Block Mode'));
        o.value('whitelist', _('Allow Mode'));
        o.value('rule', _('Rule Mode'));

        o = s.taboption('dns', form.ListValue, 'fake_ip_cache', _('Fake-IP Cache'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_respect_rules', _('Respect Rules'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_doh_prefer_http3', _('DoH Prefer HTTP/3'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_system_hosts', _('Use System Hosts'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.ListValue, 'dns_hosts', _('Use Hosts'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.Flag, 'hosts', _('Overwrite Hosts'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_hosts', form.TableSection, 'hosts', _('Edit Hosts'));
        o.retain = true;
        o.depends('hosts', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'domain_name', _('Domain Name'));
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'ip', 'IP');

        o = s.taboption('dns', form.Flag, 'dns_nameserver', _('Overwrite Nameserver'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_dns_nameservers', form.TableSection, 'nameserver', _('Edit Nameservers'));
        o.retain = true;
        o.depends('dns_nameserver', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'type', _('Type'));
        so.value('default-nameserver');
        so.value('proxy-server-nameserver');
        so.value('direct-nameserver');
        so.value('nameserver');
        so.value('fallback');

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        o = s.taboption('dns', form.Flag, 'dns_proxy_server_nameserver_policy', _('Overwrite Proxy Server Nameserver Policy'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_dns_proxy_server_nameserver_policies', form.TableSection, 'proxy_server_nameserver_policy', _('Edit Proxy Server Nameserver Policies'));
        o.retain = true;
        o.depends('dns_proxy_server_nameserver_policy', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        o = s.taboption('dns', form.ListValue, 'dns_direct_nameserver_follow_policy', _('Direct Nameserver Follow Policy'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('dns', form.Flag, 'dns_nameserver_policy', _('Overwrite Nameserver Policy'));
        o.rmempty = false;

        o = s.taboption('dns', form.SectionValue, '_dns_nameserver_policies', form.TableSection, 'nameserver_policy', _('Edit Nameserver Policies'));
        o.retain = true;
        o.depends('dns_nameserver_policy', '1');

        o.subsection.addremove = true;
        o.subsection.anonymous = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;

        so = o.subsection.option(form.DynamicList, 'nameserver', _('Nameserver'));

        s.tab('sniffer', _('Sniffer Config'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer', _('Enable'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer_sniff_dns_mapping', _('Sniff Redir-Host'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.ListValue, 'sniffer_sniff_pure_ip', _('Sniff Pure IP'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('sniffer', form.Flag, 'sniffer_force_domain_name', _('Overwrite Force Sniff Domain Name'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_force_domain_names', _('Force Sniff Domain Name'));
        o.retain = true;
        o.depends('sniffer_force_domain_name', '1');

        o = s.taboption('sniffer', form.Flag, 'sniffer_ignore_domain_name', _('Overwrite Ignore Sniff Domain Name'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.DynamicList, 'sniffer_ignore_domain_names', _('Ignore Sniff Domain Name'));
        o.retain = true;
        o.depends('sniffer_ignore_domain_name', '1');

        o = s.taboption('sniffer', form.Flag, 'sniffer_sniff', _('Overwrite Sniff By Protocol'));
        o.rmempty = false;

        o = s.taboption('sniffer', form.SectionValue, '_sniffer_sniffs', form.TableSection, 'sniff', _('Sniff By Protocol'));
        o.retain = true;
        o.depends('sniffer_sniff', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = false;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'protocol', _('Protocol'));
        so.value('HTTP');
        so.value('TLS');
        so.value('QUIC');
        so.readonly = true;

        so = o.subsection.option(form.DynamicList, 'port', _('Port'));
        so.datatype = 'portrange';

        so = o.subsection.option(form.Flag, 'overwrite_destination', _('Overwrite Destination'));
        so.rmempty = false;

        s.tab('rule', _('Rule Config'));

        o = s.taboption('rule', form.Flag, 'rule_provider', _('Append Rule Provider'));
        o.rmempty = false;

        o = s.taboption('rule', form.SectionValue, '_rule_providers', form.GridSection, 'rule_provider', _('Edit Rule Providers'));
        o.retain = true;
        o.depends('rule_provider', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = 1;
        so.editable = true;
        so.modalonly = false;
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'name', _('Name'));
        so.rmempty = false;

        so = o.subsection.option(form.ListValue, 'type', _('Type'));
        so.default = 'http';
        so.rmempty = false;
        so.value('http');
        so.value('file');

        so = o.subsection.option(form.Value, 'url', _('Url'));
        so.modalonly = true;
        so.rmempty = false;
        so.depends('type', 'http');

        so = o.subsection.option(form.Value, 'node', _('Node'));
        so.default = 'DIRECT';
        so.modalonly = true;
        so.depends('type', 'http');
        so.value('GLOBAL');
        so.value('DIRECT');

        so = o.subsection.option(form.Value, 'file_size_limit', _('File Size Limit'));
        so.datatype = 'uinteger';
        so.default = 0;
        so.modalonly = true;
        so.depends('type', 'http');

        so = o.subsection.option(form.FileUpload, 'file_path', _('File Path'));
        so.modalonly = true;
        so.rmempty = false;
        so.root_directory = nikki.ruleProvidersDir;
        so.depends('type', 'file');

        so = o.subsection.option(form.ListValue, 'file_format', _('File Format'));
        so.default = 'yaml';
        so.value('mrs');
        so.value('yaml');
        so.value('text');

        so = o.subsection.option(form.ListValue, 'behavior', _('Behavior'));
        so.default = 'classical';
        so.rmempty = false;
        so.value('classical');
        so.value('domain');
        so.value('ipcidr');

        so = o.subsection.option(form.Value, 'update_interval', _('Update Interval'));
        so.datatype = 'uinteger';
        so.default = 0;
        so.modalonly = true;
        so.depends('type', 'http');

        o = s.taboption('rule', form.Flag, 'rule', _('Append Rule'));
        o.rmempty = false;

        o = s.taboption('rule', form.SectionValue, '_rules', form.TableSection, 'rule', _('Edit Rules'));
        o.retain = true;
        o.depends('rule', '1');

        o.subsection.anonymous = true;
        o.subsection.addremove = true;
        o.subsection.sortable = true;

        so = o.subsection.option(form.Flag, 'enabled', _('Enable'));
        so.default = 1;
        so.rmempty = false;

        so = o.subsection.option(form.Value, 'type', _('Type'));
        so.rmempty = false;
        so.value('RULE-SET', _('Rule Set'));
        so.value('DOMAIN', _('Domain Name'));
        so.value('DOMAIN-SUFFIX', _('Domain Name Suffix'));
        so.value('DOMAIN-WILDCARD', _('Domain Name Wildcard'));
        so.value('DOMAIN-KEYWORD', _('Domain Name Keyword'));
        so.value('DOMAIN-REGEX', _('Domain Name Regex'));
        so.value('IP-CIDR', _('Destination IP'));
        so.value('DST-PORT', _('Destination Port'));
        so.value('PROCESS-NAME', _('Process Name'));
        so.value('GEOSITE', _('Domain Name Geo'));
        so.value('GEOIP', _('Destination IP Geo'));

        so = o.subsection.option(form.Value, 'matcher', _('Matcher'));
        so.rmempty = false;
        so.depends({ 'type': /MATCH/i, '!reverse': true });

        so = o.subsection.option(form.Value, 'node', _('Node'));
        so.default = 'GLOBAL';
        so.value('GLOBAL');
        so.value('DIRECT');
        so.value('REJECT');
        so.value('REJECT-DROP');

        so = o.subsection.option(form.Flag, 'no_resolve', _('No Resolve'));
        so.rmempty = false;
        so.depends('type', /IP-CIDR6?/i);
        so.depends('type', /IP-ASN/i);
        so.depends('type', /GEOIP/i);

        s.tab('geox', _('GeoX Config'));

        o = s.taboption('geox', form.ListValue, 'geoip_format', _('GeoIP Format'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('dat', 'DAT');
        o.value('mmdb', 'MMDB');

        o = s.taboption('geox', form.ListValue, 'geodata_loader', _('GeoData Loader'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('standard', _('Standard Loader'));
        o.value('memconservative', _('Memory Conservative Loader'));

        o = s.taboption('geox', form.Value, 'geosite_url', _('GeoSite Url'));
        o.placeholder = _('Unmodified');

        o = s.taboption('geox', form.Value, 'geoip_mmdb_url', _('GeoIP(MMDB) Url'));
        o.placeholder = _('Unmodified');

        o = s.taboption('geox', form.Value, 'geoip_dat_url', _('GeoIP(DAT) Url'));
        o.placeholder = _('Unmodified');

        o = s.taboption('geox', form.Value, 'geoip_asn_url', _('GeoIP(ASN) Url'));
        o.placeholder = _('Unmodified');

        o = s.taboption('geox', form.ListValue, 'geox_auto_update', _('GeoX Auto Update'));
        o.optional = true;
        o.placeholder = _('Unmodified');
        o.value('0', _('Disable'));
        o.value('1', _('Enable'));

        o = s.taboption('geox', form.Value, 'geox_update_interval', _('GeoX Update Interval'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unmodified');

        s.tab('mixin_file_content', _('Mixin File Content'));

        o = s.taboption('mixin_file_content', form.Flag, 'mixin_file_content', _('Enable'), _('Please go to the editor tab to edit the file for mixin'));
        o.rmempty = false;

        s = m.section(form.NamedSection, 'procd', 'procd', _('procd Config'));

        s.tab('general', _('General Config'));

        o = s.taboption('general', form.Flag, 'fast_reload', _('Fast Reload'));
        o.rmempty = false;

        s.tab('rlimit', _('RLIMIT Config'));

        o = s.taboption('rlimit', form.Value, 'rlimit_nproc_soft', _('Number of Processes Soft Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_nproc_hard', _('Number of Processes Hard Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_address_space_soft', _('Address Space Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_address_space_hard', _('Address Space Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_data_soft', _('Heap Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_data_hard', _('Heap Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_stack_soft', _('Stack Size Soft Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_stack_hard', _('Stack Size Hard Limit'));
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('rlimit', form.Value, 'rlimit_nofile_soft', _('Number of Open Files Soft Limit'));
        o.datatype = 'uinteger';

        o = s.taboption('rlimit', form.Value, 'rlimit_nofile_hard', _('Number of Open Files Hard Limit'));
        o.datatype = 'uinteger';

        s.tab('environment_variable', _('Environment Variable Config'));

        o = s.taboption('environment_variable', form.Value, 'env_go_max_procs', 'GOMAXPROCS');
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('environment_variable', form.Value, 'env_go_mem_limit', 'GOMEMLIMIT');
        o.datatype = 'uinteger';
        o.placeholder = _('Unlimited');

        o = s.taboption('environment_variable', form.DynamicList, 'env_safe_paths', _('Safe Paths'));
        o.load = function (section_id) {
            return this.super('load', section_id)?.split(':');
        };
        o.write = function (section_id, formvalue) {
            this.super('write', section_id, formvalue?.join(':'));
        };

        o = s.taboption('environment_variable', form.Flag, 'env_disable_loopback_detector', _('Disable Loopback Detector'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_disable_quic_go_gso', _('Disable GSO of quic-go'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_disable_quic_go_ecn', _('Disable ECN of quic-go'));
        o.rmempty = false;

        o = s.taboption('environment_variable', form.Flag, 'env_skip_system_ipv6_check', _('Skip System IPv6 Check'));
        o.rmempty = false;

        return m.render();
    }
});
