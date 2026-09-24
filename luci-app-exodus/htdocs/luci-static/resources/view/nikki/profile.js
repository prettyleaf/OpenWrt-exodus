'use strict';
'require form';
'require view';
'require uci';
'require ui';
'require tools.nikki as nikki';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('nikki')
        ]);
    },
    render: function (data) {
        let m, s, o, so;

        m = new form.Map('nikki');

        s = m.section(form.NamedSection, 'config', 'config', _('Profile'));

        o = s.option(form.FileUpload, '_upload_profile', _('Upload Profile'));
        o.browser = true;
        o.enable_download = true;
        o.root_directory = nikki.profilesDir;
        o.write = function (section_id, formvalue) {
            return true;
        };

        o = s.option(form.Button, '_hard_update', _('Hard Update'), _('Remove everything downloaded from providers of the current profile (proxy and rule providers), download the subscription again and restart. Files of local providers are kept.'));
        o.inputstyle = 'negative';
        o.inputtitle = _('Hard Update');
        o.onclick = function () {
            if (!confirm(_('The proxy will be restarted and all providers will be downloaded again. Continue?'))) {
                return;
            }
            return nikki.hardUpdate().then(function () {
                ui.addNotification(null, E('p', _('Hard update started, see the Log page for progress.')), 'info');
            });
        };

        s = m.section(form.GridSection, 'subscription', _('Subscription'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;
        s.modaltitle = _('Edit Subscription');

        o = s.option(form.Value, 'name', _('Subscription Name'));
        o.rmempty = false;

        o = s.option(form.Value, 'used', _('Used'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'total', _('Total'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'expire', _('Expire At'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Value, 'update', _('Update At'));
        o.modalonly = false;
        o.optional = true;
        o.readonly = true;

        o = s.option(form.Button, 'update_subscription');
        o.editable = true;
        o.inputstyle = 'positive';
        o.inputtitle = _('Update');
        o.modalonly = false;
        o.onclick = function (_, section_id) {
            return nikki.updateSubscription(section_id);
        };

        o = s.option(form.Value, 'info_url', _('Subscription Info Url'));
        o.modalonly = true;

        o = s.option(form.Value, 'url', _('Subscription Url'));
        o.modalonly = true;
        o.rmempty = false;

        o = s.option(form.Value, 'user_agent', _('User Agent'), _('{version} is replaced with the installed app version.'));
        o.default = 'Mihomo/Exodus v{version}';
        o.modalonly = true;
        o.rmempty = false;
        o.value('Mihomo/Exodus v{version}');
        o.value('clash');
        o.value('clash.meta');
        o.value('mihomo');

        o = s.option(form.Flag, 'send_hwid', _('Send HWID'), _('Send x-hwid, x-device-os, x-ver-os and x-device-model headers, required by panels with HWID device limit.'));
        o.default = '1';
        o.modalonly = true;
        o.rmempty = false;

        o = s.option(form.ListValue, 'prefer', _('Prefer'));
        o.default = 'remote';
        o.modalonly = true;
        o.rmempty = false;
        o.value('remote', _('Remote'));
        o.value('local', _('Local'));

        return m.render();
    }
});
