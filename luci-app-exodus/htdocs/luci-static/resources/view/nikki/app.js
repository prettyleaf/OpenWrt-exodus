'use strict';
'require form';
'require view';
'require uci';
'require poll';
'require network';
'require tools.nikki as nikki';

function renderStatus(running) {
    return updateStatus(E('input', { id: 'core_status', style: 'border: unset; font-style: italic; font-weight: bold;', readonly: '' }), running);
}

function updateStatus(element, running) {
    if (element) {
        element.style.color = running ? 'green' : 'red';
        element.value = running ? _('Running') : _('Not Running');
    }
    return element;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('nikki'),
            nikki.version(),
            nikki.status(),
            nikki.listProfiles(),
            network.getHostHints()
        ]);
    },
    render: function (data) {
        const subscriptions = uci.sections('nikki', 'subscription');
        const appVersion = data[1].app ?? '';
        const coreVersion = data[1].core ?? '';
        const running = data[2];
        const profiles = data[3];
        const hosts = data[4].hosts;

        let m, s, o;

        m = new form.Map('nikki', _('Exodus'), `${_('Transparent Proxy with Mihomo on OpenWrt.')} <a href="https://github.com/prettyleaf/openwrt-exodus" target="_blank">${_('How To Use')}</a>`);

        s = m.section(form.TableSection, 'status', _('Status'));
        s.anonymous = true;

        o = s.option(form.Value, '_app_version', _('App Version'));
        o.readonly = true;
        o.load = function () {
            return appVersion;
        };
        o.write = function () { };

        o = s.option(form.Value, '_core_version', _('Core Version'));
        o.readonly = true;
        o.load = function () {
            return coreVersion;
        };
        o.write = function () { };

        o = s.option(form.DummyValue, '_core_status', _('Core Status'));
        o.cfgvalue = function () {
            return renderStatus(running);
        };
        poll.add(function () {
            return L.resolveDefault(nikki.status()).then(function (running) {
                updateStatus(document.getElementById('core_status'), running);
            });
        });

        o = s.option(form.Button, 'restart');
        o.inputstyle = 'negative';
        o.inputtitle = _('Restart Service');
        o.onclick = function () {
            return nikki.restart();
        };

        s = m.section(form.NamedSection, 'config', 'config', _('App Config'));

        o = s.option(form.Flag, 'enabled', _('Enable'));
        o.rmempty = false;

        o = s.option(form.ListValue, 'profile', _('Choose Profile'));
        o.optional = true;

        for (const profile of profiles) {
            o.value('file:' + profile.name, _('File:') + profile.name);
        };

        for (const subscription of subscriptions) {
            o.value('subscription:' + subscription['.name'], _('Subscription:') + subscription.name);
        };

        o = s.option(form.Value, 'start_delay', _('Start Delay'));
        o.datatype = 'uinteger';
        o.placeholder = _('Start Immidiately');

        o = s.option(form.Flag, 'scheduled_restart', _('Scheduled Restart'));
        o.rmempty = false;

        o = s.option(form.Value, 'scheduled_restart_cron', _('Scheduled Restart Cron'));
        o.retain = true;
        o.rmempty = false;
        o.depends('scheduled_restart', '1');

        o = s.option(form.Flag, 'test_profile', _('Test Profile'));
        o.rmempty = false;

        o = s.option(form.Flag, 'core_only', _('Core Only'));
        o.rmempty = false;

        s = m.section(form.NamedSection, 'proxy', 'proxy', _('Devices'));
        s.render = function () {
            const notes = [];
            if (uci.get('nikki', 'proxy', 'enabled') !== '1' || uci.get('nikki', 'proxy', 'lan_proxy') !== '1') {
                notes.push(_('LAN Proxy is disabled on the Advanced page, device selection has no effect.'));
            }
            if (nikki.readLanAccessControl().custom) {
                notes.push(_('LAN Access Control rules were customized on the Advanced page. Changing the mode or the devices here will replace them.'));
            }
            this.description = notes.map((note) => `<div class="alert-message warning">${note}</div>`).join('');
            return form.NamedSection.prototype.render.apply(this, arguments);
        };

        o = s.option(form.ListValue, 'access_mode', _('Mode'));
        o.default = 'exclude';
        o.rmempty = false;
        o.value('exclude', _('Exclude: proxy all devices except the selected ones'));
        o.value('include', _('Include: proxy only the selected devices'));

        o = s.option(form.DynamicList, '_access_devices', _('Devices'), _('MAC or IP address. Kept in sync with LAN Access Control on the Advanced page.'));
        o.datatype = 'or(macaddr, ip4addr, ip6addr)';
        o.forcewrite = true;

        for (const mac in hosts) {
            const host = hosts[mac];
            const hint = [host.name, host.ipaddrs?.[0]].filter(Boolean).join(', ');
            o.value(mac, hint ? '%s (%s)'.format(mac, hint) : mac);
        };

        o.load = function () {
            return nikki.readLanAccessControl().devices;
        };
        // rewrite lan access control only when the mode or the devices were changed here, to keep rules customized on the advanced page
        o.syncDevices = function (section_id, devices) {
            const mode = this.section.formvalue(section_id, 'access_mode');
            const modeChanged = mode !== (this.section.cfgvalue(section_id, 'access_mode') ?? 'exclude');
            const devicesChanged = devices.join(' ') !== L.toArray(this.cfgvalue(section_id)).join(' ');
            if (modeChanged || devicesChanged) {
                nikki.writeLanAccessControl(mode, [...new Set(devices)]);
            }
        };
        o.write = function (section_id, formvalue) {
            this.syncDevices(section_id, L.toArray(formvalue));
        };
        o.remove = function (section_id) {
            this.syncDevices(section_id, []);
        };

        return m.render();
    }
});
