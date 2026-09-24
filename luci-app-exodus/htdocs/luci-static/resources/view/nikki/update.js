'use strict';
'require view';
'require ui';
'require poll';
'require tools.nikki as nikki';

function formatSize(bytes) {
    return bytes == null ? '-' : '%1024.1mB'.format(bytes);
}

// the installer ends with "success" or a line starting with "error:"
function isFinished(log) {
    const lines = log.trim().split('\n');
    const last = lines[lines.length - 1] ?? '';
    return last === 'success' || last.startsWith('error:');
}

return view.extend({
    load: function () {
        return Promise.all([
            L.resolveDefault(nikki.checkUpdate(), {}),
            nikki.getUpdateLog()
        ]);
    },
    render: function (data) {
        const info = data[0];
        const installed = info.installed ?? {};
        const latest = info.latest ?? {};
        const core = info.core ?? {};
        const coreTitles = { meta: 'Mihomo Meta', alpha: 'Mihomo Alpha', prizrak: 'Prizrak-Core' };

        let updateAvailable = false;
        const row = function (title, current, next) {
            let status;
            if (next == null) {
                status = '-';
            } else if (current == null) {
                status = E('strong', {}, _('Not installed'));
                updateAvailable = true;
            } else if (current !== next) {
                status = E('strong', { style: 'color: orange' }, _('Update available'));
                updateAvailable = true;
            } else {
                status = E('span', { style: 'color: green' }, _('Up to date'));
            }
            return [title, current ?? '-', next ?? '-', status];
        };
        const rows = [
            row(`${_('App')} (luci-app-exodus)`, installed['luci-app-exodus'], latest['luci-app-exodus']),
            row(`${_('Service')} (exodus)`, installed['exodus'], latest['exodus']),
        ];
        // an alternative core replaces the binary of mihomo-meta, the installer keeps the package only as a dependency
        if (core.type === 'alpha' || core.type === 'prizrak') {
            rows.push(row(`${_('Core')} (${coreTitles[core.type]})`, core.installed, core.latest));
        } else {
            rows.push(row(`${_('Core')} (mihomo-meta)`, installed['mihomo-meta'], latest['mihomo-meta']));
        }

        const table = E('table', { class: 'table' }, [
            E('tr', { class: 'tr table-titles' }, [
                E('th', { class: 'th' }, _('Package')),
                E('th', { class: 'th' }, _('Installed')),
                E('th', { class: 'th' }, _('Latest')),
                E('th', { class: 'th' }, _('Status')),
            ])
        ]);
        cbi_update_table(table, rows);

        const notes = [];
        if (info.error) {
            notes.push(E('div', { class: 'alert-message warning' }, `${_('Failed to check for updates:')} ${info.error}`));
        }
        if (installed['mihomo-alpha'] != null) {
            notes.push(E('div', { class: 'alert-message warning' }, _('mihomo-alpha is installed, it will be replaced by mihomo-meta.')));
        }

        // suggest low space mode when the new core may not fit next to the current one
        const lowSpaceSuggested = info.free_space != null && info.core_size != null && info.free_space < info.core_size * 1.2;
        const lowSpace = E('input', { type: 'checkbox', id: 'low_space', checked: lowSpaceSuggested ? '' : null });

        const logView = E('textarea', { class: 'cbi-input-textarea', style: 'width: 100%; font-family: monospace;', rows: 15, readonly: '', wrap: 'off' });
        logView.value = data[1] ?? '';

        const pollLog = function () {
            return nikki.getUpdateLog().then(function (log) {
                logView.value = log;
                logView.scrollTop = logView.scrollHeight;
                if (isFinished(log)) {
                    poll.remove(pollLog);
                    ui.addNotification(null, E('p', [
                        _('Update finished.'), ' ',
                        E('a', { href: '#', click: function (ev) { ev.preventDefault(); location.reload(); } }, _('Reload the page'))
                    ]), 'info');
                }
            });
        };

        const updateButton = E('button', {
            class: 'btn cbi-button cbi-button-apply',
            disabled: updateAvailable ? null : '',
            click: ui.createHandlerFn(this, function () {
                const message = lowSpace.checked
                    ? _('The current core will be removed before the new one is installed. If the update fails, the proxy will not work until the update is done again. Continue?')
                    : _('The proxy will be restarted during the update. Continue?');
                if (!confirm(message)) {
                    return;
                }
                return nikki.update(lowSpace.checked).then(function () {
                    logView.value = '';
                    poll.add(pollLog, 2);
                });
            })
        }, _('Update'));

        return E([], [
            E('h2', {}, _('Update')),
            E('div', { class: 'cbi-map-descr' }, [
                _('Packages are downloaded from GitHub releases of Exodus for this router and installed with the package manager. Settings, profiles and subscriptions are kept.'), ' ',
                _('The core and the gh-proxy chosen in the installer are kept, run the installer again to change them.'), ' ',
                E('a', { href: 'https://github.com/prettyleaf/openwrt-exodus#install--update', target: '_blank' }, _('How To Use'))
            ]),
            ...notes,
            E('div', { class: 'cbi-section' }, [
                E('p', {}, [
                    `${_('Release')}: `, E('strong', {}, info.tag ?? '-'), ' · ',
                    `${_('Download')}: ${info.gh_proxy ? _('through gh-proxy at %s').format(info.gh_proxy) : _('directly from GitHub')}`, ' · ',
                    `${_('Architecture')}: ${info.arch ?? '-'} (${info.branch ?? '-'})`, ' · ',
                    `${_('Free flash space')}: ${formatSize(info.free_space)}`, ' · ',
                    `${_('Core size')}: ${formatSize(info.core_size)}`
                ]),
                table,
                E('p', {}, [
                    E('label', {}, [lowSpace, ' ', _('Low flash space mode: remove the current core before installing the new one')])
                ]),
                E('div', { class: 'cbi-value-description' }, _('Use it when the update fails because there is not enough free space. The proxy does not work until the new core is installed.')),
                E('div', { class: 'cbi-page-actions' }, [
                    E('button', { class: 'btn cbi-button', click: function () { location.reload(); } }, _('Check for Updates')),
                    ' ',
                    updateButton
                ])
            ]),
            E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('Update Log')),
                logView
            ])
        ]);
    },
    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
