'use strict';
'require form';
'require view';
'require uci';
'require poll';
'require network';
'require ui';
'require tools.nikki as nikki';

// the look of the status page like the web ui of the other platforms, colors work with light and dark themes
const STYLE = `
.exodus-provider { text-align: center; }
.exodus-provider h3 { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; }
.exodus-provider-announce { max-width: 760px; margin: 0 auto 1em; white-space: pre-line; overflow-wrap: anywhere; opacity: .85; }

.exodus-service { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1em 2em; padding: .5em 0; }
@media (max-width: 767px) { .exodus-service { grid-template-columns: minmax(0, 1fr); } }
.exodus-service-info { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-content: space-between; gap: .7em 1.5em; margin: 0; }
.exodus-service-info dt { margin: 0; font-weight: normal; opacity: .65; }
.exodus-service-info dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.exodus-badge { display: inline-block; padding: 0 .6em; border-radius: 999px; font-size: 90%; line-height: 1.7; background: rgba(127, 127, 127, .15); }
.exodus-badge-on { color: #22a55a; background: rgba(34, 165, 90, .14); }

.exodus-service-side { display: grid; grid-template-rows: auto 1fr; gap: 1em; min-width: 0; }
.exodus-service-side .cbi-section-node { margin: 0; padding: 0; border: 0; background: none; box-shadow: none; }
.exodus-service-side .cbi-value { display: block; margin: 0; padding: 0; border: 0; }
.exodus-service-side .cbi-value .cbi-value-title { float: none; display: block; width: auto; max-width: none; flex: none; margin: 0; padding: 0 0 .4em; text-align: left; }
.exodus-service-side .cbi-value-field { float: none; display: block; width: auto; max-width: none; margin: 0; padding: 0; }
.exodus-service-side .cbi-value-field select { width: 100%; max-width: none; }

.exodus-service-power { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-auto-rows: 1fr; gap: .5em; align-self: end; }
.exodus-service-power > .exodus-autostart, .exodus-service-power > .btn { grid-column: 2; width: 100%; margin: 0; }
.exodus-autostart { display: flex; align-items: center; justify-content: space-between; gap: 1em; padding: 0 .8em; border: 1px solid rgba(127, 127, 127, .35); border-radius: 6px; white-space: nowrap; cursor: pointer; }
.exodus-autostart input { margin: 0; }

.exodus-power { grid-row: 1 / span 2; display: flex; align-items: center; justify-content: center; gap: .6em; min-width: 0; margin: 0; padding: .4em 1em;
    border: 1px solid rgba(127, 127, 127, .35); border-radius: 6px; background: rgba(127, 127, 127, .12); color: inherit; opacity: .75;
    font: inherit; font-weight: 600; text-align: center; line-height: 1.2; cursor: pointer; transition: opacity .2s, background-color .2s, border-color .2s, color .2s; }
.exodus-power:hover:not(:disabled) { opacity: 1; }
.exodus-power:disabled { cursor: default; }
.exodus-power-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 1.8em; height: 1.8em; border-radius: 50%; background: color-mix(in srgb, currentColor 14%, transparent); }
.exodus-power-icon svg { width: 1em; height: 1em; }
.exodus-power-on, .exodus-power-on:hover:not(:disabled) { opacity: 1; color: #22a55a; background: rgba(34, 165, 90, .12); border-color: rgba(34, 165, 90, .5); }
.exodus-power-on .exodus-power-icon { box-shadow: 0 0 0 3px rgba(34, 165, 90, .2), 0 0 12px rgba(34, 165, 90, .45); }
.exodus-power-starting, .exodus-power-stopping { opacity: 1; background-image: linear-gradient(90deg, transparent, color-mix(in srgb, currentColor 16%, transparent), transparent);
    background-size: 50% 100%; background-repeat: no-repeat; animation: exodus-power-sweep 1.2s ease-in-out infinite; }
.exodus-power-starting { color: #22a55a; border-color: rgba(34, 165, 90, .3); }
.exodus-power-starting .exodus-power-icon, .exodus-power-stopping .exodus-power-icon { animation: exodus-power-pulse 1.2s ease-in-out infinite; }
@keyframes exodus-power-sweep { from { background-position: -100% 0; } to { background-position: 200% 0; } }
@keyframes exodus-power-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 40%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
@media (prefers-reduced-motion: reduce) { .exodus-power-starting, .exodus-power-stopping, .exodus-power-icon { animation: none !important; } }
`;

const POWER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>';

// a start or a stop sent to the router: the button shows it until the state changes or for a while
let powerPending = null;

function profileTitle(profile) {
    if (profile?.startsWith('subscription:')) {
        const section_id = profile.substring('subscription:'.length);
        return uci.get('nikki', section_id, 'name') ?? section_id;
    }
    if (profile?.startsWith('file:')) {
        return profile.substring('file:'.length);
    }
    return '—';
}

// the state of the service on the left; the power, autostart and the dashboard go to the right, under the profile
// state: { running, enabled } of nikki.serviceState()
function serviceView(versions, state) {
    const info = E('dl', { class: 'exodus-service-info' });
    const side = E('div', { class: 'exodus-service-power' });

    const autostartInput = E('input', { type: 'checkbox', id: 'exodus_autostart', class: 'cbi-input-checkbox' });
    autostartInput.checked = state.enabled;
    autostartInput.addEventListener('change', async function () {
        const on = autostartInput.checked;
        autostartInput.disabled = true;
        try {
            await nikki.setAutostart(on);
            state.enabled = on;
        } catch (e) {
            autostartInput.checked = !on;
            ui.addNotification(null, E('p', [e.message]), 'error');
        }
        autostartInput.disabled = false;
    });
    const autostart = E('label', { class: 'exodus-autostart', for: 'exodus_autostart' }, [E('span', [_('Autostart')]), autostartInput]);

    const dashboard = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action' }, [_('Open Dashboard')]);
    // the dashboard has its own page of exodus
    dashboard.addEventListener('click', () => { window.location.href = L.url('admin/services/nikki/dashboard'); });

    const refresh = function () {
        return L.resolveDefault(nikki.serviceState(), null).then(function (next) {
            if (next) {
                state.running = next.running;
                state.enabled = next.enabled;
                if (!autostartInput.disabled) {
                    autostartInput.checked = next.enabled;
                }
                draw();
            }
        });
    };

    const draw = function () {
        const running = state.running;
        if (powerPending && (Date.now() > powerPending.until || powerPending.on === running)) {
            powerPending = null;
        }
        let view = running ? 'on' : 'off';
        if (powerPending) {
            view = powerPending.on ? 'starting' : 'stopping';
        }
        const labels = { off: _('Turned off'), on: _('Turned on'), starting: _('Turning on…'), stopping: _('Turning off…') };

        const proxyEnabled = uci.get('nikki', 'proxy', 'enabled') === '1';
        const proxy = !proxyEnabled ? E('span', { class: 'exodus-badge' }, [_('Off')])
            : running ? E('span', { class: 'exodus-badge exodus-badge-on' }, [_('Active')])
                : E('span', { class: 'exodus-badge' }, [_('Inactive')]);
        info.replaceChildren(
            E('dt', [_('Exodus')]), E('dd', [versions.app || '—']),
            E('dt', [_('Core')]), E('dd', [versions.core || '—']),
            E('dt', [_('Profile')]), E('dd', [profileTitle(uci.get('nikki', 'config', 'profile'))]),
            E('dt', [_('Proxy')]), E('dd', [proxy])
        );

        const power = E('button', {
            type: 'button',
            class: `exodus-power exodus-power-${view}`,
            title: running ? _('Turn off the service') : _('Turn on the service'),
            'aria-pressed': running ? 'true' : 'false'
        }, [E('span', { class: 'exodus-power-icon' }, POWER_ICON), E('span', [labels[view]])]);
        power.disabled = !!powerPending;
        power.addEventListener('click', async function () {
            const on = !running;
            powerPending = { on: on, until: Date.now() + 30000 };
            draw();
            // a state that does not change in time brings the button back
            setTimeout(draw, 30500);
            try {
                await nikki.power(on);
            } catch (e) {
                powerPending = null;
                draw();
                ui.addNotification(null, E('p', [e.message]), 'error');
                return;
            }
            [1500, 4000, 8000].forEach((delay) => setTimeout(refresh, delay));
        });

        dashboard.disabled = !running;
        side.replaceChildren(power, autostart, dashboard);
    };

    draw();
    poll.add(refresh);
    return { info: info, side: side };
}

// the announce of the provider of the subscription in use: logo and title in the middle, the text, a link to the support
function renderProviderCard(meta) {
    const profile = uci.get('nikki', 'config', 'profile') ?? '';
    if (!profile.startsWith('subscription:')) {
        return '';
    }
    const section_id = profile.substring('subscription:'.length);
    const provider = meta[section_id] ?? {};
    if (!provider.announce) {
        return '';
    }
    return E('div', { class: 'cbi-section exodus-provider' }, [
        E('h3', {}, [nikki.providerLogo(provider.logo, 32), provider.title ?? uci.get('nikki', section_id, 'name') ?? section_id]),
        E('div', { class: 'exodus-provider-announce' }, [provider.announce]),
        provider.support_url ? E('a', { class: 'btn cbi-button cbi-button-action', href: provider.support_url, target: '_blank', rel: 'noopener noreferrer' }, [_('Support')]) : ''
    ]);
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('nikki'),
            nikki.version(),
            L.resolveDefault(nikki.serviceState(), { running: false, enabled: false }),
            nikki.listProfiles(),
            network.getHostHints(),
            nikki.subscriptionMeta()
        ]);
    },
    render: function (data) {
        const subscriptions = uci.sections('nikki', 'subscription');
        const appVersion = data[1].app ?? '';
        const coreVersion = data[1].core ?? '';
        // the installer saves an alternative core, Prizrak-Core reports the same version as Mihomo Meta
        const coreTitle = { alpha: 'Mihomo Alpha', prizrak: 'Prizrak-Core' }[uci.get('nikki', 'update', 'core')] ?? 'Mihomo Meta';
        const service = serviceView({ app: appVersion, core: coreVersion ? `${coreVersion} · ${coreTitle}` : '' }, data[2]);
        const profiles = data[3];
        const hosts = data[4].hosts;
        const meta = data[5];

        let m, s, o;

        m = new form.Map('nikki', _('Exodus'), `${_('Transparent Proxy with Mihomo on OpenWrt.')} <a href="https://github.com/prettyleaf/openwrt-exodus" target="_blank">${_('How To Use')}</a>`);

        s = m.section(form.NamedSection, 'config', 'config');
        s.render = function () {
            return renderProviderCard(meta);
        };

        // the state on the left, the profile with the power, autostart and the dashboard on the right;
        // the profile stays an option of the form, it is saved with Save & Apply
        s = m.section(form.NamedSection, 'config', 'config', _('Service'));
        s.render = function () {
            return form.NamedSection.prototype.render.apply(this, arguments).then(function (node) {
                const fields = node.querySelector('.cbi-section-node');
                if (fields) {
                    // the layout takes the place of the fields first, then the fields move into it
                    const layout = E('div', { class: 'exodus-service' });
                    fields.replaceWith(layout);
                    layout.append(service.info, E('div', { class: 'exodus-service-side' }, [fields, service.side]));
                }
                return node;
            });
        };

        o = s.option(form.ListValue, 'profile', _('Profile'));
        o.optional = true;

        for (const profile of profiles) {
            o.value('file:' + profile.name, _('File:') + profile.name);
        };

        for (const subscription of subscriptions) {
            o.value('subscription:' + subscription['.name'], _('Subscription:') + subscription.name);
        };

        s = m.section(form.NamedSection, 'config', 'config', _('App Config'));

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

        o = s.option(form.DynamicList, '_access_devices', _('Devices'), _('MAC or IP address. An IP address of a known device is saved as its MAC, so both IPv4 and IPv6 traffic of the device is matched, an IP address of an unknown device matches only that address. Kept in sync with LAN Access Control on the Advanced page.'));
        o.datatype = 'or(macaddr, ip4addr, ip6addr)';
        o.forcewrite = true;

        // an ip matches only one address family, the other one would still go through the core
        const macByIp = {};
        for (const mac in hosts) {
            const host = hosts[mac];
            const hint = [host.name, host.ipaddrs?.[0]].filter(Boolean).join(', ');
            o.value(mac, hint ? '%s (%s)'.format(mac, hint) : mac);
            for (const ip of [...(host.ipaddrs ?? []), ...(host.ip6addrs ?? [])]) {
                macByIp[ip.toLowerCase()] = mac;
            }
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
                nikki.writeLanAccessControl(mode, [...new Set(devices.map((device) => macByIp[device.toLowerCase()] ?? device))]);
            }
        };
        o.write = function (section_id, formvalue) {
            this.syncDevices(section_id, L.toArray(formvalue));
        };
        o.remove = function (section_id) {
            this.syncDevices(section_id, []);
        };

        return m.render().then(function (node) {
            node.prepend(E('style', {}, STYLE));
            return node;
        });
    }
});
