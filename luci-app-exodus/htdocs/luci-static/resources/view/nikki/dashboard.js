'use strict';
'require view';
'require ui';
'require tools.nikki as nikki';

// the dashboard of the core (MIBoard by default) in a frame of its own page
// the core serves it on its api port, so it is shown while the service runs

// the frame reaches the bottom of the window, whatever the theme puts over it
function fitFrame(frame) {
    const fit = function () {
        if (!frame.isConnected) {
            window.removeEventListener('resize', fit);
            return;
        }
        const top = frame.getBoundingClientRect().top + window.scrollY;
        frame.style.height = `${Math.max(480, window.innerHeight - top - 16)}px`;
    };
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
}

return view.extend({
    load: function () {
        return Promise.all([
            L.resolveDefault(nikki.serviceState(), { running: false, enabled: false }),
            L.resolveDefault(nikki.dashboardUrl(), null)
        ]);
    },

    render: function (data) {
        const running = data[0].running;
        const url = data[1];

        const open = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action', disabled: !running || !url ? '' : null }, [_('Open in a new tab')]);
        open.addEventListener('click', () => nikki.openDashboard());
        const update = E('button', { type: 'button', class: 'btn cbi-button cbi-button-positive', disabled: !running ? '' : null }, [_('Update Dashboard')]);
        update.addEventListener('click', ui.createHandlerFn(this, function () {
            return nikki.updateDashboard();
        }));

        const header = E('div', { style: 'display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5em; margin-bottom: .75em' }, [
            E('h2', { name: 'content', style: 'margin: 0' }, [_('Dashboard')]),
            E('div', { style: 'display: flex; flex-wrap: wrap; gap: .5em' }, [update, open])
        ]);

        let body;
        if (!running) {
            const power = E('button', { type: 'button', class: 'btn cbi-button cbi-button-apply' }, [_('Turn on the service')]);
            power.addEventListener('click', ui.createHandlerFn(this, async function () {
                await nikki.power(true);
                // the core starts and downloads the dashboard the first time
                setTimeout(() => window.location.reload(), 3000);
            }));
            body = E('div', { class: 'cbi-section' }, [
                E('p', [_('The dashboard is available when the service is running.')]),
                E('p', [power])
            ]);
        } else if (!url) {
            body = E('div', { class: 'cbi-section' }, [E('p', [_('API has not been configured')])]);
        } else if (window.location.protocol === 'https:' && url.startsWith('http:')) {
            // a page over https can not show the http page of the core
            body = E('div', { class: 'cbi-section' }, [
                E('p', [_('LuCI is opened over HTTPS, the core serves the dashboard over HTTP. Open it in a new tab.')])
            ]);
        } else {
            const frame = E('iframe', {
                src: url,
                title: _('Dashboard'),
                allow: 'clipboard-read; clipboard-write; fullscreen',
                referrerpolicy: 'no-referrer',
                style: 'display: block; width: 100%; height: 640px; border: 1px solid rgba(127, 127, 127, .3); border-radius: 6px; background: transparent'
            });
            fitFrame(frame);
            body = frame;
        }

        return E([], [header, body]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
