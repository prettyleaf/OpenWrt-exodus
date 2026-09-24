'use strict';

// web ui of exodus for keenetic, a small imitation of luci-app-exodus
// the config is edited as a draft copy and saved as a whole, like form.Map in luci

(function () {

// ---------- i18n ----------

function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}

const lang = storageGet('exodus.lang') || ((navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');
document.documentElement.lang = lang;

function _(text) {
    let result = (lang === 'ru' && window.I18N_RU && window.I18N_RU[text]) || text;
    for (let i = 1; i < arguments.length; i++) {
        result = result.replace('%s', arguments[i]);
    }
    return result;
}

// ---------- dom ----------

function E(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs && (Array.isArray(attrs) || attrs instanceof Node || typeof attrs !== 'object')) {
        children = attrs;
        attrs = null;
    }
    for (const key in (attrs || {})) {
        const value = attrs[key];
        if (value == null || value === false) {
            continue;
        }
        if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.substring(2), value);
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key === 'html') {
            el.innerHTML = value;
        } else if (value === true) {
            el.setAttribute(key, '');
        } else {
            el.setAttribute(key, value);
        }
    }
    append(el, children);
    return el;
}

function append(el, children) {
    if (children == null || children === false) {
        return;
    }
    if (Array.isArray(children)) {
        children.forEach((child) => append(el, child));
    } else if (children instanceof Node) {
        el.appendChild(children);
    } else {
        el.appendChild(document.createTextNode(String(children)));
    }
}

function clear(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
    return el;
}

function formatSize(bytes) {
    if (bytes == null) {
        return '-';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${Math.round(bytes * 10) / 10} ${units[i]}`;
}

function notify(message, type) {
    const el = E('div', { class: `alert-message ${type || ''}` }, [
        E('button', { class: 'close', type: 'button', onclick: () => el.remove() }, '×'),
        message
    ]);
    document.getElementById('notifications').appendChild(el);
    if (type !== 'error' && type !== 'warning') {
        setTimeout(() => el.remove(), 6000);
    }
    return el;
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type: type || 'text/plain' }));
    const link = E('a', { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- api ----------

async function api(action, params) {
    let response;
    try {
        response = await fetch('api.cgi', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Exodus': '1' },
            body: JSON.stringify(Object.assign({ action: action }, params || {}))
        });
    } catch (e) {
        throw new Error(_('The router does not answer'));
    }
    let data;
    try {
        data = await response.json();
    } catch (e) {
        data = { error: response.statusText };
    }
    if (response.status === 401 && action !== 'login') {
        showLogin();
        throw new Error(_('Login required'));
    }
    if (!response.ok || data.error) {
        throw new Error(data.error || response.statusText);
    }
    return data;
}

function run(promise, success) {
    return Promise.resolve(promise).then((result) => {
        if (success) {
            notify(success);
        }
        return result;
    }).catch((e) => {
        if (e.message !== _('Login required')) {
            notify(e.message, 'error');
        }
        throw e;
    });
}

// ---------- state ----------

const state = {
    config: null,
    draft: null,
    subscriptionStates: {},
    profiles: [],
    status: null,
    hosts: null,
    interfaces: null,
    proxies: null,
    invalid: new Set(),
    timers: [],
    statusTimer: null,
    loginShown: false
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getPath(obj, path) {
    return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') {
            o[keys[i]] = {};
        }
        o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
}

// a binding of a widget to a value: the draft by path, or a field of an object (a row of a table)
function ref(path) {
    return { get: () => getPath(state.draft, path), set: (value) => setPath(state.draft, path, value) };
}

function objRef(obj, key) {
    return { get: () => obj[key], set: (value) => { obj[key] = value; } };
}

function isDirty() {
    return state.config != null && JSON.stringify(state.config) !== JSON.stringify(state.draft);
}

function updateDirty() {
    const badge = document.getElementById('dirty');
    badge.hidden = !isDirty();
    badge.textContent = _('Unsaved changes');
}

async function loadAll() {
    const data = await api('load');
    state.config = data.config;
    state.draft = clone(data.config);
    state.subscriptionStates = data.subscription_states || {};
    state.profiles = data.profiles || [];
    state.invalid.clear();
    updateDirty();
}

async function refreshStatus() {
    try {
        state.status = await api('status');
    } catch (e) {
        return;
    }
    const indicator = document.getElementById('indicator');
    indicator.hidden = false;
    indicator.classList.toggle('running', !!state.status.running);
    indicator.title = state.status.running ? _('Running') : _('Not Running');
    document.querySelectorAll('[data-status]').forEach((el) => {
        el.textContent = state.status.running ? _('Running') : _('Not Running');
        el.className = state.status.running ? 'status-running' : 'status-stopped';
    });
    document.querySelectorAll('[data-running-only]').forEach((el) => {
        el.hidden = !state.status.running;
    });
}

// ---------- form widgets ----------

let dependents = [];

function changed() {
    for (const dependent of dependents) {
        dependent.el.style.display = dependent.depends() ? '' : 'none';
    }
    updateDirty();
}

function markInvalid(el, id, invalid) {
    el.classList.toggle('invalid', invalid);
    if (invalid) {
        state.invalid.add(id);
    } else {
        state.invalid.delete(id);
    }
}

let widgetId = 0;

const validators = {
    port: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 65535,
    uinteger: (v) => /^\d+$/.test(v),
    dscp: (v) => /^\d+$/.test(v) && +v <= 63,
    mac: (v) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(v),
    ip4: (v) => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v) && v.split('/')[0].split('.').every((x) => +x <= 255),
    ip6: (v) => /^[0-9a-f:.]*:[0-9a-f:.]*(\/\d{1,3})?$/i.test(v),
    hostport: (v) => /^(\[[0-9a-f:.]*\]|[0-9a-z.-]*):\d{1,5}$/i.test(v),
    fwmark: (v) => /^(0x[0-9a-f]+|\d+)(\/(0x[0-9a-f]+|\d+))?$/i.test(v),
    cron: (v) => v.trim().split(/\s+/).length === 5,
    portlist: (v) => /^\d+(-\d+)?([ ,]+\d+(-\d+)?)*$/.test(v.trim())
};

function validate(el, type, value) {
    if (!type) {
        return true;
    }
    const valid = value === '' || value == null || validators[type](String(value));
    if (el.dataset.wid == null) {
        el.dataset.wid = String(widgetId++);
    }
    markInvalid(el, el.dataset.wid, !valid);
    return valid;
}

function flag(r) {
    const input = E('input', { type: 'checkbox' });
    input.checked = r.get() === true;
    input.addEventListener('change', () => {
        r.set(input.checked);
        changed();
    });
    return input;
}

// null (profile value is kept), false or true
function tri(r) {
    return select(r, [['0', _('Disable')], ['1', _('Enable')]], {
        optional: true,
        toValue: (v) => (v === '' ? null : v === '1'),
        fromValue: (v) => (v == null ? '' : (v ? '1' : '0'))
    });
}

function select(r, options, opts) {
    opts = opts || {};
    const el = E('select');
    if (opts.optional) {
        el.appendChild(E('option', { value: '' }, opts.placeholder || _('Unmodified')));
    }
    const fromValue = opts.fromValue || ((v) => (v == null ? '' : String(v)));
    const toValue = opts.toValue || ((v) => (v === '' ? (opts.empty !== undefined ? opts.empty : null) : (opts.number ? Number(v) : v)));
    const current = fromValue(r.get());
    let found = current === '';
    for (const [value, label] of options) {
        el.appendChild(E('option', { value: value }, label));
        if (value === current) {
            found = true;
        }
    }
    // a value set in the file is shown even when it is not one of the choices
    if (!found) {
        el.appendChild(E('option', { value: current }, current));
    }
    el.value = current;
    el.addEventListener('change', () => {
        r.set(toValue(el.value));
        changed();
    });
    return el;
}

let datalistId = 0;

function datalist(values) {
    const id = `dl${datalistId++}`;
    return {
        id: id,
        el: E('datalist', { id: id }, values.map((v) => (Array.isArray(v) ? E('option', { value: v[0] }, v[1]) : E('option', { value: v }))))
    };
}

// text or number, empty is null unless opts.empty is set
function input(r, opts) {
    opts = opts || {};
    const attrs = { type: opts.password ? 'password' : 'text', placeholder: opts.placeholder || null, autocomplete: 'off', spellcheck: 'false' };
    let list = null;
    if (opts.values) {
        list = datalist(opts.values);
        attrs.list = list.id;
    }
    if (opts.readonly) {
        attrs.readonly = true;
    }
    const el = E('input', attrs);
    const value = r.get();
    // the default value is shown as the placeholder, like an empty option of luci
    el.value = value == null || (opts.placeholder && opts.empty !== undefined && value === opts.empty) ? '' : String(value);
    validate(el, opts.type, el.value);
    el.addEventListener('input', () => {
        const text = el.value.trim();
        if (!validate(el, opts.type, text)) {
            updateDirty();
            return;
        }
        if (text === '') {
            r.set(opts.empty !== undefined ? opts.empty : null);
        } else if (opts.number) {
            r.set(Number(text));
        } else {
            r.set(opts.password ? el.value : text);
        }
        changed();
    });
    if (opts.password) {
        const toggle = E('button', { class: 'btn btn-small', type: 'button', title: _('Reveal/hide password'), onclick: () => { el.type = el.type === 'password' ? 'text' : 'password'; } },
            E('span', { html: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>' }));
        return E('div', { class: 'inline-actions' }, [el, toggle, list && list.el]);
    }
    return list ? E('div', {}, [el, list.el]) : el;
}

// list of strings like DynamicList of luci
function dynlist(r, opts) {
    opts = opts || {};
    const container = E('div', { class: 'dynlist' });
    let list = null;
    if (opts.values) {
        list = datalist(opts.values);
    }
    const values = () => (Array.isArray(r.get()) ? r.get() : []);
    const render = () => {
        clear(container);
        values().forEach((value, index) => {
            const el = E('input', { type: 'text', value: String(value), spellcheck: 'false' });
            validate(el, opts.type, String(value));
            el.addEventListener('input', () => {
                const text = el.value.trim();
                if (!validate(el, opts.type, text)) {
                    updateDirty();
                    return;
                }
                const next = values().slice();
                next[index] = opts.number ? Number(text) : text;
                r.set(next);
                changed();
            });
            container.appendChild(E('div', { class: 'item' }, [
                el,
                E('button', { class: 'btn btn-small', type: 'button', title: _('Delete'), onclick: () => {
                    if (el.dataset.wid != null) {
                        state.invalid.delete(el.dataset.wid);
                    }
                    const next = values().slice();
                    next.splice(index, 1);
                    r.set(next);
                    render();
                    changed();
                } }, '✕')
            ]));
        });
        const add = E('input', { type: 'text', placeholder: opts.placeholder || _('Add'), list: list ? list.id : null, spellcheck: 'false' });
        const addValue = () => {
            const text = add.value.trim();
            if (text === '') {
                return;
            }
            if (opts.type && !validators[opts.type](text)) {
                add.classList.add('invalid');
                return;
            }
            r.set(values().concat([opts.number ? Number(text) : text]));
            render();
            changed();
            container.querySelector('.add input').focus();
        };
        add.addEventListener('keydown', (ev) => {
            add.classList.remove('invalid');
            if (ev.key === 'Enter') {
                ev.preventDefault();
                addValue();
            }
        });
        add.addEventListener('change', () => {
            // a choice from the datalist is added at once
            if (opts.values && opts.values.some((v) => (Array.isArray(v) ? v[0] : v) === add.value)) {
                addValue();
            }
        });
        container.appendChild(E('div', { class: 'add' }, [add, E('button', { class: 'btn btn-small', type: 'button', onclick: addValue }, '+'), list && list.el]));
    };
    render();
    return container;
}

// a row of a section: title, widget, description; depends hides it like depends() of luci
function row(title, widget, description, depends) {
    const el = E('div', { class: 'cbi-value' }, [
        E('label', { class: 'cbi-value-title' }, title || ''),
        E('div', { class: 'cbi-value-field' }, [widget, description ? E('div', { class: 'cbi-value-description', html: description }) : null])
    ]);
    if (depends) {
        dependents.push({ el: el, depends: depends });
        el.style.display = depends() ? '' : 'none';
    }
    return el;
}

function section(title, children, description) {
    return E('div', { class: 'cbi-section' }, [
        title ? E('h3', {}, title) : null,
        description ? E('div', { class: 'cbi-section-descr', html: description }) : null,
        children
    ]);
}

// tabs keep their choice while the page is open
const tabChoice = {};

function tabs(id, list) {
    const menu = E('ul', { class: 'cbi-tabmenu' });
    const panes = E('div');
    const selected = tabChoice[id] && list.some((t) => t[0] === tabChoice[id]) ? tabChoice[id] : list[0][0];
    for (const [key, title, content] of list) {
        const pane = E('div', { style: { display: key === selected ? '' : 'none' } }, content);
        const link = E('a', { class: key === selected ? 'active' : null }, title);
        link.addEventListener('click', () => {
            tabChoice[id] = key;
            menu.querySelectorAll('a').forEach((a) => a.classList.remove('active'));
            link.classList.add('active');
            Array.from(panes.children).forEach((p) => { p.style.display = 'none'; });
            pane.style.display = '';
        });
        menu.appendChild(E('li', {}, link));
        panes.appendChild(pane);
    }
    return E('div', {}, [menu, panes]);
}

// table of objects like TableSection of luci, columns: [key, title, widget(ref, row)]
function table(r, columns, opts) {
    opts = opts || {};
    const container = E('div');
    const rows = () => (Array.isArray(r.get()) ? r.get() : []);
    const move = (index, delta) => {
        const next = rows().slice();
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        r.set(next);
        render();
        changed();
    };
    const actions = (index, length) => E('span', { class: 'inline-actions' }, [
        opts.sortable !== false ? E('button', { class: 'btn btn-small', type: 'button', disabled: index === 0, onclick: () => move(index, -1) }, '↑') : null,
        opts.sortable !== false ? E('button', { class: 'btn btn-small', type: 'button', disabled: index === length - 1, onclick: () => move(index, 1) }, '↓') : null,
        opts.addremove !== false ? E('button', { class: 'btn btn-small cbi-button-negative', type: 'button', onclick: () => {
            const next = rows().slice();
            next.splice(index, 1);
            r.set(next);
            render();
            changed();
        } }, _('Delete')) : null
    ]);
    const render = () => {
        clear(container);
        const list = rows();
        if (opts.cards) {
            const cards = E('div', { class: 'cards' });
            list.forEach((item, index) => {
                const saved = dependents;
                dependents = [];
                const fields = columns.map(([key, title, widget, description, depends]) =>
                    row(title, widget(objRef(item, key), item), description, depends ? () => depends(item) : null));
                const local = dependents;
                dependents = saved;
                const refresh = () => local.forEach((d) => { d.el.style.display = d.depends() ? '' : 'none'; });
                const card = E('div', { class: 'card' }, [E('div', { class: 'card-head' }, actions(index, list.length)), fields]);
                card.addEventListener('change', refresh);
                card.addEventListener('input', refresh);
                cards.appendChild(card);
            });
            container.appendChild(cards);
        } else {
            const tbl = E('table', { class: 'table' }, [
                E('tr', {}, columns.map((c) => E('th', {}, c[1])).concat([E('th')]))
            ]);
            list.forEach((item, index) => {
                tbl.appendChild(E('tr', {}, columns.map(([key, , widget]) => E('td', {}, widget(objRef(item, key), item)))
                    .concat([E('td', { class: 'row-actions' }, actions(index, list.length))])));
            });
            if (list.length === 0) {
                tbl.appendChild(E('tr', {}, E('td', { colspan: columns.length + 1, class: 'muted' }, _('This section contains no values yet'))));
            }
            container.appendChild(E('div', { class: 'table-wrap' }, tbl));
        }
        if (opts.addremove !== false) {
            container.appendChild(E('div', { style: { marginTop: '8px' } }, E('button', { class: 'btn cbi-button-positive', type: 'button', onclick: () => {
                r.set(rows().concat([opts.create ? opts.create() : { enabled: true }]));
                render();
                changed();
            } }, _('Add'))));
        }
    };
    render();
    return container;
}

function button(title, onclick, style) {
    const el = E('button', { class: `btn ${style || ''}`, type: 'button' }, title);
    el.addEventListener('click', async () => {
        el.disabled = true;
        try {
            await onclick();
        } catch (e) {
            // errors of api calls are already shown by run()
            console.error(e);
        } finally {
            el.disabled = false;
        }
    });
    return el;
}

// Save & Apply, Save, Reset at the bottom like luci
function pageActions() {
    return E('div', { class: 'cbi-page-actions' }, [
        button(_('Save & Apply'), () => save('restart'), 'cbi-button-apply'),
        button(_('Save'), () => save('none'), 'cbi-button-save'),
        button(_('Reset'), () => {
            state.draft = clone(state.config);
            state.invalid.clear();
            render();
        })
    ]);
}

async function save(apply) {
    if (state.invalid.size > 0) {
        notify(_('Some fields are invalid, cannot save values!'), 'error');
        throw new Error('invalid');
    }
    await run(api('config_set', { config: state.draft, apply: apply }), apply === 'restart' ? _('Settings are saved, the service is restarting.') : _('Settings are saved.'));
    state.config = clone(state.draft);
    updateDirty();
    if (apply === 'restart') {
        setTimeout(refreshStatus, 3000);
    }
}

// ---------- dashboard ----------

function openDashboard() {
    const info = (state.status && state.status.api) || {};
    const listen = info.tls_listen || info.listen;
    if (!listen) {
        notify(_('API has not been configured'), 'error');
        return;
    }
    const protocol = info.tls_listen ? 'https' : 'http';
    const port = listen.substring(listen.lastIndexOf(':') + 1);
    const host = window.location.hostname;
    const query = new URLSearchParams({ host: host, hostname: host, port: port, secret: info.secret || '' }).toString();
    const path = info.ui_name ? `/ui/${info.ui_name}/` : '/ui/';
    const url = `${protocol}://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${port}${path}?${query}`;
    window.open(url, '_blank', 'noopener');
}

// ---------- device selection ----------

function itemType(item) {
    return item.substring(0, item.indexOf(':'));
}

function itemValue(item) {
    return item.substring(item.indexOf(':') + 1);
}

function describeItem(item) {
    const hosts = state.hosts || { segments: [], aps: [], hosts: [] };
    const type = itemType(item);
    const value = itemValue(item);
    if (type === 'iface') {
        const segment = hosts.segments.find((s) => s.ifname === value);
        return `${_('Segment')}: ${segment && segment.name ? `${segment.name} (${value})` : value}`;
    }
    if (type === 'ap') {
        const ap = hosts.aps.find((a) => a.id === value);
        return `${_('Wi-Fi')}: ${ap ? `${ap.ssid || ap.description || value} (${ap.band})` : value}`;
    }
    if (type === 'mac') {
        const host = hosts.hosts.find((h) => h.mac === value.toUpperCase());
        return host && host.name ? `${host.name} (${value})` : value;
    }
    return value;
}

// a typed item from what the user entered, an address of a known device becomes its mac
function parseItem(text) {
    text = text.trim();
    if (validators.mac(text)) {
        return `mac:${text.toUpperCase()}`;
    }
    const known = state.hosts && state.hosts.hosts.find((h) => h.ip === text);
    if (known) {
        return `mac:${known.mac}`;
    }
    if (validators.ip4(text)) {
        return `ip:${text}`;
    }
    if (validators.ip6(text)) {
        return `ip6:${text.toLowerCase()}`;
    }
    return null;
}

function devicePicker() {
    const container = E('div', { class: 'picker' });
    const items = () => {
        if (!Array.isArray(state.draft.proxy.access_items)) {
            state.draft.proxy.access_items = [];
        }
        return state.draft.proxy.access_items;
    };
    const toggle = (item, on) => {
        const list = items().filter((i) => i !== item);
        if (on) {
            list.push(item);
        }
        state.draft.proxy.access_items = list;
        render();
        changed();
    };
    let filter = '';

    const option = (item, title, meta, extra) => {
        const checkbox = E('input', { type: 'checkbox' });
        checkbox.checked = items().includes(item);
        checkbox.addEventListener('change', () => toggle(item, checkbox.checked));
        return E('label', { class: `picker-item ${extra && extra.inactive ? 'inactive' : ''}` }, [
            checkbox,
            E('div', {}, [E('div', { class: 'title' }, [title, extra && extra.tags]), meta ? E('div', { class: 'meta' }, meta) : null])
        ]);
    };

    const render = () => {
        clear(container);
        const hosts = state.hosts;
        const selected = items();

        container.appendChild(E('div', { class: 'chips' }, selected.length === 0
            ? E('span', { class: 'muted' }, _('Nothing is selected'))
            : selected.map((item) => E('span', { class: 'chip' }, [describeItem(item), E('button', { type: 'button', title: _('Delete'), onclick: () => toggle(item, false) }, '×')]))));

        if (!hosts) {
            container.appendChild(E('div', { class: 'spinning' }));
            return;
        }
        if (!hosts.rci) {
            container.appendChild(E('div', { class: 'alert-message warning' }, _('The router did not answer to RCI requests, names of devices and Wi-Fi points are not available. On KeeneticOS 5.2 and newer create an RCI access token in the web interface of the router and enter it on the Advanced page.')));
        }

        if (hosts.segments.length > 0) {
            container.appendChild(E('div', { class: 'picker-group' }, [
                E('h4', {}, _('Network segments')),
                E('div', { class: 'picker-list' }, hosts.segments.map((s) =>
                    option(`iface:${s.ifname}`, s.name || s.ifname, [s.ifname, s.address].filter(Boolean).join(' · '))))
            ]));
        }

        if (hosts.aps.length > 0) {
            container.appendChild(E('div', { class: 'picker-group' }, [
                E('h4', {}, _('Wi-Fi points')),
                E('div', { class: 'picker-list' }, hosts.aps.map((ap) =>
                    option(`ap:${ap.id}`, ap.ssid || ap.description || ap.id,
                        [ap.band, ap.id, _('%s clients', ap.clients)].join(' · '),
                        { inactive: ap.state === 'down', tags: ap.state === 'down' ? E('span', { class: 'tag' }, _('off')) : null })))
            ]));
        }

        const search = E('input', { type: 'search', placeholder: _('Search by name, MAC or IP'), value: filter });
        const list = E('div', { class: 'picker-list' });
        const renderHosts = () => {
            clear(list);
            const needle = filter.toLowerCase();
            const shown = hosts.hosts
                .filter((h) => !needle || [h.name, h.hostname, h.mac, h.ip, h.ssid].some((v) => (v || '').toLowerCase().includes(needle)))
                .sort((a, b) => (b.active - a.active) || (a.name || a.mac).localeCompare(b.name || b.mac));
            if (shown.length === 0) {
                list.appendChild(E('div', { class: 'picker-item muted' }, _('No devices')));
            }
            const segmentNames = {};
            for (const s of hosts.segments) {
                if (s.id) {
                    segmentNames[s.id] = s.name || s.ifname;
                }
                segmentNames[s.ifname] = s.name || s.ifname;
            }
            for (const h of shown) {
                const tags = [];
                if (!h.active) {
                    tags.push(E('span', { class: 'tag' }, _('offline')));
                }
                if (h.access === 'deny') {
                    tags.push(E('span', { class: 'tag red' }, _('blocked')));
                }
                list.appendChild(option(`mac:${h.mac}`, h.name || h.hostname || h.mac,
                    [h.mac, h.ip, h.ssid ? `${_('Wi-Fi')}: ${h.ssid}` : (segmentNames[h.segment] || h.segment || null)].filter(Boolean).join(' · '),
                    { inactive: !h.active, tags: tags }));
            }
        };
        search.addEventListener('input', () => {
            filter = search.value;
            renderHosts();
        });
        renderHosts();
        container.appendChild(E('div', { class: 'picker-group' }, [E('h4', {}, _('Devices')), E('div', { style: { marginBottom: '6px' } }, search), list]));

        const manual = E('input', { type: 'text', placeholder: _('MAC, IPv4 or IPv6 address or network'), spellcheck: 'false' });
        const addManual = () => {
            const item = parseItem(manual.value);
            if (!item) {
                manual.classList.add('invalid');
                return;
            }
            toggle(item, true);
        };
        manual.addEventListener('keydown', (ev) => {
            manual.classList.remove('invalid');
            if (ev.key === 'Enter') {
                ev.preventDefault();
                addManual();
            }
        });
        container.appendChild(E('div', { class: 'inline-actions' }, [
            manual,
            E('button', { class: 'btn', type: 'button', onclick: addManual }, _('Add')),
            button(_('Refresh'), async () => {
                state.hosts = null;
                render();
                await loadHosts();
                render();
            })
        ]));
    };

    render();
    if (!state.hosts) {
        loadHosts().then(render, render);
    }
    return container;
}

async function loadHosts() {
    try {
        state.hosts = await api('hosts');
    } catch (e) {
        state.hosts = { rci: false, segments: [], aps: [], hosts: [] };
    }
}

// ---------- pages ----------

function pageStatus() {
    const status = state.status || {};
    const coreTitles = { alpha: 'Mihomo Alpha', prizrak: 'Prizrak-Core' };
    const coreTitle = coreTitles[status.core_type];
    const subscriptions = state.draft.subscriptions || [];

    const statusSection = section(_('Status'), [
        row(_('App Version'), E('span', { class: 'mono' }, status.app_version || '-')),
        row(_('Core Version'), E('span', { class: 'mono' }, status.core_version ? (coreTitle ? `${status.core_version} (${coreTitle})` : status.core_version) : '-')),
        row(_('Core Status'), E('span', { 'data-status': true, class: status.running ? 'status-running' : 'status-stopped' }, status.running ? _('Running') : _('Not Running'))),
        row('', E('div', { class: 'inline-actions' }, [
            button(_('Restart Service'), async () => {
                await run(api('service', { op: 'restart' }), _('The service is restarting.'));
                setTimeout(refreshStatus, 3000);
            }, 'cbi-button-negative'),
            button(_('Stop Service'), async () => {
                await run(api('service', { op: 'stop' }), _('The service is stopping.'));
                setTimeout(refreshStatus, 2000);
            }),
            E('span', { 'data-running-only': true, hidden: !status.running }, E('button', { class: 'btn', type: 'button', onclick: openDashboard }, _('Open Dashboard')))
        ]))
    ]);

    const profile = [];
    for (const p of state.profiles) {
        profile.push([`file:${p.name}`, `${_('File:')}${p.name}`]);
    }
    for (const s of subscriptions) {
        profile.push([`subscription:${s.id}`, `${_('Subscription:')}${s.name}`]);
    }

    const appSection = section(_('App Config'), [
        row(_('Enable'), flag(ref('config.enabled'))),
        row(_('Choose Profile'), select(ref('config.profile'), profile, { optional: true, placeholder: '-' })),
        row(_('Start Delay'), input(ref('config.start_delay'), { number: true, type: 'uinteger', placeholder: _('Start Immidiately'), empty: 0 })),
        row(_('Scheduled Restart'), flag(ref('config.scheduled_restart'))),
        row(_('Scheduled Restart Cron'), input(ref('config.scheduled_restart_cron'), { type: 'cron', empty: '' }), null, () => state.draft.config.scheduled_restart === true),
        row(_('Test Profile'), flag(ref('config.test_profile'))),
        row(_('Core Only'), flag(ref('config.core_only')), _('Start only the core, without the transparent proxy and the mixin.'))
    ]);

    const notes = [];
    if (state.draft.proxy.enabled !== true || state.draft.proxy.lan_proxy !== true) {
        notes.push(E('div', { class: 'alert-message warning' }, _('LAN Proxy is disabled on the Advanced page, device selection has no effect.')));
    }
    const devicesSection = section(_('Devices'), [
        notes,
        row(_('Mode'), select(ref('proxy.access_mode'), [
            ['exclude', _('Exclude: proxy all devices except the selected ones')],
            ['include', _('Include: proxy only the selected devices')]
        ])),
        row(_('Devices'), devicePicker(), _('A segment matches all its devices, a Wi-Fi point matches the devices connected to it at the moment (synced with the router every 30 seconds), a device is matched by its MAC with IPv4 and IPv6. DNS of the selected devices follows the choice: proxied devices ask the core, the others ask the router.'))
    ]);

    return [statusSection, appSection, devicesSection, pageActions()];
}

function newId() {
    return `sub_${Math.random().toString(16).slice(2, 10)}`;
}

function subscriptionModal(subscription, onSave) {
    const draft = clone(subscription);
    const saved = dependents;
    dependents = [];
    const body = [
        E('h3', {}, _('Edit Subscription')),
        row(_('Subscription Name'), input(objRef(draft, 'name'), { empty: '' })),
        row(_('Subscription Info Url'), input(objRef(draft, 'info_url'), { empty: '' })),
        row(_('Subscription Url'), input(objRef(draft, 'url'), { empty: '' })),
        row(_('User Agent'), input(objRef(draft, 'user_agent'), { empty: '', values: ['Mihomo/Exodus v{version}', 'clash', 'clash.meta', 'mihomo'] }), _('{version} is replaced with the installed app version.')),
        row(_('Send HWID'), flag(objRef(draft, 'send_hwid')), _('Send x-hwid, x-device-os, x-ver-os and x-device-model headers, required by panels with HWID device limit.')),
        row(_('Prefer'), select(objRef(draft, 'prefer'), [['remote', _('Remote')], ['local', _('Local')]])),
        E('div', { class: 'inline-actions', style: { justifyContent: 'flex-end', marginTop: '12px' } }, [
            E('button', { class: 'btn', type: 'button', onclick: closeModal }, _('Dismiss')),
            E('button', { class: 'btn cbi-button-save', type: 'button', onclick: () => {
                if (!draft.name || !draft.url) {
                    notify(_('Name and URL are required.'), 'error');
                    return;
                }
                closeModal();
                onSave(draft);
            } }, _('Save'))
        ])
    ];
    dependents = saved;
    openModal(body);
}

function openModal(content) {
    const overlay = document.getElementById('modal');
    append(clear(document.getElementById('modal-body')), content);
    overlay.hidden = false;
}

function closeModal() {
    document.getElementById('modal').hidden = true;
}

function pageProfile() {
    const filesList = E('div');
    const renderFiles = () => {
        clear(filesList);
        const tbl = E('table', { class: 'table' }, E('tr', {}, [E('th', {}, _('Name')), E('th', {}, _('Size')), E('th')]));
        for (const p of state.profiles) {
            tbl.appendChild(E('tr', {}, [
                E('td', { class: 'mono' }, p.name),
                E('td', {}, formatSize(p.size)),
                E('td', { class: 'row-actions' }, E('span', { class: 'inline-actions' }, [
                    button(_('Download'), async () => {
                        const data = await run(api('file_read', { path: `${state.dirs.profiles}/${p.name}` }));
                        download(p.name, data.content, 'application/yaml');
                    }),
                    button(_('Delete'), async () => {
                        if (!confirm(_('Delete %s?', p.name))) {
                            return;
                        }
                        await run(api('profile_delete', { name: p.name }));
                        state.profiles = state.profiles.filter((x) => x.name !== p.name);
                        renderFiles();
                    }, 'cbi-button-negative')
                ]))
            ]));
        }
        if (state.profiles.length === 0) {
            tbl.appendChild(E('tr', {}, E('td', { colspan: 3, class: 'muted' }, _('No profiles uploaded'))));
        }
        filesList.appendChild(E('div', { class: 'table-wrap' }, tbl));
    };
    renderFiles();

    const fileInput = E('input', { type: 'file', accept: '.yaml,.yml,.json,.txt', style: { display: 'none' } });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) {
            return;
        }
        const name = file.name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[._ -]+/, '') || 'profile.yaml';
        const content = await file.text();
        await run(api('profile_upload', { name: name, content: content }), _('Profile %s is uploaded.', name));
        const data = await api('load');
        state.profiles = data.profiles || [];
        fileInput.value = '';
        renderFiles();
    });

    const profileSection = section(_('Profile'), [
        row(_('Upload Profile'), E('div', {}, [fileInput, E('button', { class: 'btn cbi-button-positive', type: 'button', onclick: () => fileInput.click() }, _('Upload...'))])),
        row(_('Profiles'), filesList),
        row(_('Hard Update'), button(_('Hard Update'), async () => {
            if (!confirm(_('The proxy will be restarted and all providers will be downloaded again. Continue?'))) {
                return;
            }
            await run(api('service', { op: 'hard_update' }), _('Hard update started, see the Log page for progress.'));
        }, 'cbi-button-negative'), _('Remove everything downloaded from providers of the current profile (proxy and rule providers), download the subscription again and restart. Files of local providers are kept.'))
    ]);

    const subsContainer = E('div');
    const renderSubscriptions = () => {
        clear(subsContainer);
        const subscriptions = state.draft.subscriptions || [];
        const tbl = E('table', { class: 'table' }, E('tr', {}, [
            E('th', {}, _('Subscription Name')), E('th', {}, _('Used')), E('th', {}, _('Total')), E('th', {}, _('Expire At')), E('th', {}, _('Update At')), E('th')
        ]));
        subscriptions.forEach((sub, index) => {
            const st = state.subscriptionStates[sub.id] || {};
            const updated = st.success === false ? E('span', { class: 'status-stopped' }, `${_('Failed')} ${st.update_failed || ''}`) : (st.update || '-');
            tbl.appendChild(E('tr', {}, [
                E('td', {}, sub.name),
                E('td', {}, st.used || '-'),
                E('td', {}, st.total || '-'),
                E('td', {}, st.expire || '-'),
                E('td', {}, updated),
                E('td', { class: 'row-actions' }, E('span', { class: 'inline-actions' }, [
                    button(_('Update'), async () => {
                        if (JSON.stringify((state.config.subscriptions || []).find((s) => s.id === sub.id)) !== JSON.stringify(sub)) {
                            notify(_('Save the subscription first.'), 'warning');
                            return;
                        }
                        await run(api('subscription_update', { id: sub.id }), _('Subscription update started.'));
                        const before = st.update || st.update_failed;
                        for (let i = 0; i < 30; i++) {
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                            const data = await api('load');
                            const next = (data.subscription_states || {})[sub.id] || {};
                            if ((next.update || next.update_failed) !== before) {
                                state.subscriptionStates = data.subscription_states || {};
                                renderSubscriptions();
                                notify(next.success ? _('Subscription is updated.') : _('Subscription update failed, see the Log page.'), next.success ? '' : 'error');
                                return;
                            }
                        }
                    }, 'cbi-button-positive'),
                    E('button', { class: 'btn', type: 'button', onclick: () => subscriptionModal(sub, (edited) => {
                        subscriptions[index] = edited;
                        renderSubscriptions();
                        changed();
                    }) }, _('Edit')),
                    E('button', { class: 'btn cbi-button-negative', type: 'button', onclick: () => {
                        if (!confirm(_('Delete %s?', sub.name))) {
                            return;
                        }
                        subscriptions.splice(index, 1);
                        renderSubscriptions();
                        changed();
                    } }, _('Delete'))
                ]))
            ]));
        });
        if (subscriptions.length === 0) {
            tbl.appendChild(E('tr', {}, E('td', { colspan: 6, class: 'muted' }, _('This section contains no values yet'))));
        }
        subsContainer.appendChild(E('div', { class: 'table-wrap' }, tbl));
        subsContainer.appendChild(E('div', { style: { marginTop: '8px' } }, E('button', { class: 'btn cbi-button-positive', type: 'button', onclick: () => {
            subscriptionModal({ id: newId(), name: '', url: '', info_url: '', user_agent: 'Mihomo/Exodus v{version}', send_hwid: true, prefer: 'remote' }, (created) => {
                state.draft.subscriptions = (state.draft.subscriptions || []).concat([created]);
                renderSubscriptions();
                changed();
            });
        } }, _('Add'))));
    };
    renderSubscriptions();

    return [profileSection, section(_('Subscription'), subsContainer), pageActions()];
}

function pageAdvanced() {
    const segments = (state.hosts && state.hosts.segments) || [];
    const interfaces = (state.interfaces || []).map((i) => [i, i]);
    const proxies = state.proxies || [];
    const hwid = state.hwid || {};
    const d = () => state.draft;
    const unmodified = { optional: true };

    const proxySection = section(_('Proxy Config'), tabs('proxy', [
        ['proxy', _('Proxy Config'), [
            row(_('Enable'), flag(ref('proxy.enabled'))),
            row(_('TCP Mode'), select(ref('proxy.tcp_mode'), [['redirect', _('Redirect Mode')], ['tproxy', _('TPROXY Mode')]], { optional: true, placeholder: _('Disable'), empty: '' }),
                _('TPROXY for TCP on Keenetic needs port 443 of the router free: move the web interface of the router to another port on the Users and access page. Redirect has no such limit.')),
            row(_('UDP Mode'), select(ref('proxy.udp_mode'), [['tproxy', _('TPROXY Mode')]], { optional: true, placeholder: _('Disable'), empty: '' })),
            row(_('IPv4 DNS Hijack'), flag(ref('proxy.ipv4_dns_hijack')), _('DNS requests of the proxied devices go to the core, whatever DNS is set on the router: Internet filter, DNS profiles or servers of the Internet page.')),
            row(_('IPv6 DNS Hijack'), flag(ref('proxy.ipv6_dns_hijack'))),
            row(_('IPv4 Proxy'), flag(ref('proxy.ipv4_proxy'))),
            row(_('IPv6 Proxy'), flag(ref('proxy.ipv6_proxy'))),
            row(_('Fake-IP Ping Hijack'), flag(ref('proxy.fake_ip_ping_hijack')))
        ]],
        ['router', _('Router Proxy'), [
            row(_('Enable'), flag(ref('proxy.router_proxy')), _('Proxy the traffic of the router itself: Entware applications and the services of the router. DNS of the router is not hijacked.')),
            row(_('Core Routing Mark'), input(ref('routing.router_proxy_mark'), { number: true, type: 'uinteger', empty: 255 }), _('The core marks its connections with it, they are not proxied again.'), () => d().proxy.router_proxy === true)
        ]],
        ['lan', _('LAN Proxy'), [
            row(_('Enable'), flag(ref('proxy.lan_proxy'))),
            row(_('Inbound Interface'), dynlist(ref('proxy.lan_inbound_interface'), { values: [['br+', _('All segments')]].concat(segments.map((s) => [s.ifname, s.name || s.ifname])) }),
                _('br+ matches all segments of the router, the devices are chosen on the main page.'), () => d().proxy.lan_proxy === true),
            row(_('Respect Parental Control'), flag(ref('proxy.respect_parental_control')), _('Devices blocked in the router (no internet access, schedules) are not proxied, otherwise they would get internet through the core.'), () => d().proxy.lan_proxy === true)
        ]],
        ['bypass', _('Bypass'), [
            row(_('Destination TCP Port to Proxy'), input(ref('proxy.proxy_tcp_dport'), { type: 'portlist', empty: '0-65535', values: [['0-65535', _('All Port')], ['21 22 80 110 143 194 443 465 853 993 995 8080 8443', _('Commonly Used Port')]] })),
            row(_('Destination UDP Port to Proxy'), input(ref('proxy.proxy_udp_dport'), { type: 'portlist', empty: '0-65535', values: [['0-65535', _('All Port')], ['123 443 8443', _('Commonly Used Port')]] })),
            row(_('Bypass FWMark'), dynlist(ref('proxy.bypass_fwmark'), { type: 'fwmark', placeholder: '0x100/0xff00' }))
        ]],
        ['dscp', 'DSCP / QoS', [
            row(_('Bypass DSCP'), dynlist(ref('proxy.dscp_bypass'), { type: 'dscp', number: true }), _('Traffic with these DSCP marks goes directly, like DSCP 62 of XKeen.')),
            row(_('Proxy DSCP'), dynlist(ref('proxy.dscp_proxy'), { type: 'dscp', number: true }), _('Traffic with these DSCP marks is proxied even from excluded devices and on all ports, like DSCP 63 of XKeen.')),
            row(_('Force Proxy DSCP'), input(ref('proxy.dscp_force'), { number: true, type: 'dscp', placeholder: _('Disable') }), _('Traffic with this DSCP mark goes to the chosen proxy, bypassing the rules of the profile, like DSCP 61 of XKeen.')),
            row(_('Force Proxy'), input(ref('proxy.force_proxy'), { empty: '', values: proxies, placeholder: _('Disable') }), _('A proxy or a proxy group of the profile, exodus adds listeners with it. Empty disables the force proxy DSCP.'), () => d().proxy.dscp_force != null),
            row(_('Force Redirect Port'), input(ref('proxy.force_redir_port'), { number: true, type: 'port', empty: 7893 }), null, () => d().proxy.dscp_force != null && !!d().proxy.force_proxy),
            row(_('Force TPROXY Port'), input(ref('proxy.force_tproxy_port'), { number: true, type: 'port', empty: 7894 }), null, () => d().proxy.dscp_force != null && !!d().proxy.force_proxy),
            row('', E('div', { class: 'cbi-value-description', html: _('DSCP marks are set by the devices, for example with QoS policies of Windows: gpedit.msc → Policy-based QoS → Create new policy with a DSCP value for an application. On a Windows outside of a domain set HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS "Do not use NLA" = "1" and reboot. Works for Wi-Fi and wired devices alike.') }))
        ]],
        ['misc', _('Misc'), [
            row(_('Reserved IP'), dynlist(ref('proxy.reserved_ip'), { type: 'ip4' })),
            row(_('Reserved IP6'), dynlist(ref('proxy.reserved_ip6'), { type: 'ip6' })),
            row(_('TPROXY FWMark'), input(ref('routing.tproxy_fw_mark'), { type: 'fwmark', empty: '0x111' })),
            row(_('TPROXY FWMark Mask'), input(ref('routing.tproxy_fw_mask'), { type: 'fwmark', empty: '0xffffffff' })),
            row(_('TPROXY Rule Priority'), input(ref('routing.tproxy_rule_pref'), { number: true, type: 'uinteger', empty: 100 })),
            row(_('TPROXY Route Table'), input(ref('routing.tproxy_route_table'), { number: true, type: 'uinteger', empty: 111 })),
            row(_('HWID'), input(ref('config.hwid'), { empty: '', placeholder: hwid.generated || _('Auto') }), _('Device identifier sent to subscriptions with HWID enabled (device limit). Generated from the router hardware when empty.')),
            [['x-device-os', _('Device OS')], ['x-ver-os', _('OS Version')], ['x-device-model', _('Device Model')]].map(([header, title]) =>
                row(title, E('span', { class: 'mono' }, (hwid.headers || {})[header] || '-'), _('Sent in the %s header, read from the router.', header)))
        ]]
    ]));

    const passwordOld = E('input', { type: 'password', autocomplete: 'current-password' });
    const passwordNew = E('input', { type: 'password', autocomplete: 'new-password' });
    const passwordRepeat = E('input', { type: 'password', autocomplete: 'new-password' });
    const keeneticSection = section('Keenetic', [
        row(_('RCI Access Token'), input(ref('keenetic.rci_token'), { password: true, empty: '' }), _('Needed on KeeneticOS 5.2 and newer to read devices, Wi-Fi points and parental control from the router. Create it in the web interface of the router.')),
        row(_('Keep Router Domains Real'), flag(ref('keenetic.fake_ip_filter')), _('my.keenetic.net and KeenDNS names get real addresses instead of Fake-IP, so the router stays reachable by name.')),
        row(_('Web UI Port'), input(ref('web.port'), { number: true, type: 'port', empty: 9099 }), _('The web UI moves to the new port after saving.')),
        row(_('Current Password'), passwordOld),
        row(_('New Password'), passwordNew),
        row(_('Repeat Password'), passwordRepeat),
        row('', button(_('Change Password'), async () => {
            if (passwordNew.value !== passwordRepeat.value) {
                notify(_('Passwords do not match.'), 'error');
                return;
            }
            await run(api('password', { old: passwordOld.value, new: passwordNew.value }), _('The password is changed.'));
            passwordOld.value = passwordNew.value = passwordRepeat.value = '';
        }))
    ]);

    const nameserverTypes = ['default-nameserver', 'proxy-server-nameserver', 'direct-nameserver', 'nameserver', 'fallback'].map((t) => [t, t]);
    const enabledColumn = ['enabled', _('Enable'), (r) => flag(r)];
    const nameserverColumn = ['nameserver', _('Nameserver'), (r) => dynlist(r)];

    const mixinSection = section(_('Mixin Option'), tabs('mixin', [
        ['general', _('General Config'), [
            row(_('Log Level'), select(ref('mixin.log_level'), ['silent', 'error', 'warning', 'info', 'debug'].map((v) => [v, v]), unmodified)),
            row(_('Mode'), select(ref('mixin.mode'), [['global', _('Global Mode')], ['rule', _('Rule Mode')], ['direct', _('Direct Mode')]], unmodified)),
            row(_('Match Process'), select(ref('mixin.match_process'), ['off', 'strict', 'always'].map((v) => [v, v]), unmodified)),
            row(_('Outbound Interface'), select(ref('mixin.outbound_interface'), interfaces, unmodified), _('A Linux name of the interface: ppp0, eth3, nwg0 and so on.')),
            row('IPv6', tri(ref('mixin.ipv6'))),
            row(_('Unify Delay'), tri(ref('mixin.unify_delay'))),
            row(_('TCP Concurrent'), tri(ref('mixin.tcp_concurrent'))),
            row(_('Disable TCP Keep Alive'), tri(ref('mixin.disable_tcp_keep_alive'))),
            row(_('TCP Keep Alive Idle'), input(ref('mixin.tcp_keep_alive_idle'), { number: true, type: 'uinteger', placeholder: _('Unmodified') })),
            row(_('TCP Keep Alive Interval'), input(ref('mixin.tcp_keep_alive_interval'), { number: true, type: 'uinteger', placeholder: _('Unmodified') }))
        ]],
        ['external_control', _('External Control Config'), [
            row(_('Dashboard'), E('div', { class: 'inline-actions' }, [
                E('button', { class: 'btn', type: 'button', onclick: openDashboard }, _('Open Dashboard')),
                button(_('Update Dashboard'), () => run(api('update_dashboard'), _('Dashboard is updated.')), 'cbi-button-positive')
            ])),
            row(_('UI Path'), input(ref('mixin.ui_path'), { placeholder: _('Unmodified') })),
            row(_('UI Name'), input(ref('mixin.ui_name'), { placeholder: _('Unmodified') })),
            row(_('UI Url'), input(ref('mixin.ui_url'), { placeholder: _('Unmodified'), values: [
                ['https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard (CDN Fonts)'],
                ['https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip', 'Zashboard'],
                ['https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD'],
                ['https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD'],
                ['https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip', 'Razord']
            ] })),
            row(_('API Listen'), input(ref('mixin.api_listen'), { type: 'hostport', placeholder: _('Unmodified') })),
            row(_('API TLS Listen'), input(ref('mixin.api_tls_listen'), { type: 'hostport', placeholder: _('Unmodified') })),
            row(_('API TLS Cert'), input(ref('mixin.api_tls_cert'), { placeholder: _('Unmodified') })),
            row(_('API TLS Key'), input(ref('mixin.api_tls_key'), { placeholder: _('Unmodified') })),
            row(_('API TLS ECH Key'), input(ref('mixin.api_tls_ech_key'), { placeholder: _('Unmodified') })),
            row(_('API Secret'), input(ref('mixin.api_secret'), { password: true, placeholder: _('Unmodified') })),
            row(_('Save Proxy Selection'), tri(ref('mixin.selection_cache')))
        ]],
        ['inbound', _('Inbound Config'), [
            row(_('Allow Lan'), tri(ref('mixin.allow_lan'))),
            row(_('HTTP Port'), input(ref('mixin.http_port'), { number: true, type: 'port', placeholder: _('Unmodified') })),
            row(_('SOCKS Port'), input(ref('mixin.socks_port'), { number: true, type: 'port', placeholder: _('Unmodified') })),
            row(_('Mixed Port'), input(ref('mixin.mixed_port'), { number: true, type: 'port', placeholder: _('Unmodified') })),
            row(_('Redirect Port'), input(ref('mixin.redir_port'), { number: true, type: 'port', placeholder: _('Unmodified') })),
            row(_('TPROXY Port'), input(ref('mixin.tproxy_port'), { number: true, type: 'port', placeholder: _('Unmodified') })),
            row(_('Overwrite Authentication'), flag(ref('mixin.authentication'))),
            row(_('Edit Authentications'), table(ref('mixin.authentications'), [
                enabledColumn,
                ['username', _('Username'), (r) => input(r, { empty: '' })],
                ['password', _('Password'), (r) => input(r, { password: true, empty: '' })]
            ], { create: () => ({ enabled: true, username: '', password: '' }) }), null, () => d().mixin.authentication === true)
        ]],
        ['dns', _('DNS Config'), [
            row(_('Enable'), tri(ref('mixin.dns_enabled'))),
            row(_('DNS Cache Algorithm'), select(ref('mixin.dns_cache_algorithm'), [['lru', _('Least Recently Used (LRU)')], ['arc', _('Adaptive Replacement Cache (ARC)')]], unmodified)),
            row(_('DNS Listen'), input(ref('mixin.dns_listen'), { type: 'hostport', placeholder: _('Unmodified') })),
            row('IPv6', tri(ref('mixin.dns_ipv6'))),
            row(_('DNS Mode'), select(ref('mixin.dns_mode'), [['redir-host', 'Redir-Host'], ['fake-ip', 'Fake-IP']], unmodified)),
            row(_('Fake-IP Range'), input(ref('mixin.fake_ip_range'), { type: 'ip4', placeholder: _('Unmodified') })),
            row(_('Fake-IP6 Range'), input(ref('mixin.fake_ip6_range'), { type: 'ip6', placeholder: _('Unmodified') })),
            row(_('Fake-IP TTL'), input(ref('mixin.fake_ip_ttl'), { number: true, type: 'uinteger', placeholder: _('Unmodified') })),
            row(_('Overwrite Fake-IP Filter'), flag(ref('mixin.fake_ip_filter'))),
            row(_('Edit Fake-IP Filters'), dynlist(ref('mixin.fake_ip_filters')), null, () => d().mixin.fake_ip_filter === true),
            row(_('Fake-IP Filter Mode'), select(ref('mixin.fake_ip_filter_mode'), [['blacklist', _('Block Mode')], ['whitelist', _('Allow Mode')], ['rule', _('Rule Mode')]], unmodified)),
            row(_('Fake-IP Cache'), tri(ref('mixin.fake_ip_cache'))),
            row(_('Respect Rules'), tri(ref('mixin.dns_respect_rules'))),
            row(_('DoH Prefer HTTP/3'), tri(ref('mixin.dns_doh_prefer_http3'))),
            row(_('Use System Hosts'), tri(ref('mixin.dns_system_hosts'))),
            row(_('Use Hosts'), tri(ref('mixin.dns_hosts'))),
            row(_('Overwrite Hosts'), flag(ref('mixin.hosts'))),
            row(_('Edit Hosts'), table(ref('mixin.hosts_entries'), [
                enabledColumn,
                ['domain_name', _('Domain Name'), (r) => input(r, { empty: '' })],
                ['ip', 'IP', (r) => dynlist(r)]
            ], { create: () => ({ enabled: true, domain_name: '', ip: [] }) }), null, () => d().mixin.hosts === true),
            row(_('Overwrite Nameserver'), flag(ref('mixin.dns_nameserver'))),
            row(_('Edit Nameservers'), table(ref('mixin.nameservers'), [
                enabledColumn,
                ['type', _('Type'), (r) => select(r, nameserverTypes)],
                nameserverColumn
            ], { create: () => ({ enabled: true, type: 'nameserver', nameserver: [] }) }), null, () => d().mixin.dns_nameserver === true),
            row(_('Overwrite Proxy Server Nameserver Policy'), flag(ref('mixin.dns_proxy_server_nameserver_policy'))),
            row(_('Edit Proxy Server Nameserver Policies'), table(ref('mixin.proxy_server_nameserver_policies'), [
                enabledColumn,
                ['matcher', _('Matcher'), (r) => input(r, { empty: '' })],
                nameserverColumn
            ], { create: () => ({ enabled: true, matcher: '', nameserver: [] }) }), null, () => d().mixin.dns_proxy_server_nameserver_policy === true),
            row(_('Direct Nameserver Follow Policy'), tri(ref('mixin.dns_direct_nameserver_follow_policy'))),
            row(_('Overwrite Nameserver Policy'), flag(ref('mixin.dns_nameserver_policy'))),
            row(_('Edit Nameserver Policies'), table(ref('mixin.nameserver_policies'), [
                enabledColumn,
                ['matcher', _('Matcher'), (r) => input(r, { empty: '' })],
                nameserverColumn
            ], { create: () => ({ enabled: true, matcher: '', nameserver: [] }) }), null, () => d().mixin.dns_nameserver_policy === true)
        ]],
        ['sniffer', _('Sniffer Config'), [
            row(_('Enable'), tri(ref('mixin.sniffer'))),
            row(_('Sniff Redir-Host'), tri(ref('mixin.sniffer_sniff_dns_mapping'))),
            row(_('Sniff Pure IP'), tri(ref('mixin.sniffer_sniff_pure_ip'))),
            row(_('Overwrite Force Sniff Domain Name'), flag(ref('mixin.sniffer_force_domain_name'))),
            row(_('Force Sniff Domain Name'), dynlist(ref('mixin.sniffer_force_domain_names')), null, () => d().mixin.sniffer_force_domain_name === true),
            row(_('Overwrite Ignore Sniff Domain Name'), flag(ref('mixin.sniffer_ignore_domain_name'))),
            row(_('Ignore Sniff Domain Name'), dynlist(ref('mixin.sniffer_ignore_domain_names')), null, () => d().mixin.sniffer_ignore_domain_name === true),
            row(_('Overwrite Sniff By Protocol'), flag(ref('mixin.sniffer_sniff'))),
            row(_('Sniff By Protocol'), table(ref('mixin.sniffs'), [
                enabledColumn,
                ['protocol', _('Protocol'), (r) => input(r, { readonly: true })],
                ['port', _('Port'), (r) => dynlist(r)],
                ['overwrite_destination', _('Overwrite Destination'), (r) => flag(r)]
            ], { addremove: false, sortable: false }), null, () => d().mixin.sniffer_sniff === true)
        ]],
        ['rule', _('Rule Config'), [
            row(_('Append Rule Provider'), flag(ref('mixin.rule_provider'))),
            row(_('Edit Rule Providers'), table(ref('mixin.rule_providers'), [
                ['enabled', _('Enable'), (r) => flag(r)],
                ['name', _('Name'), (r) => input(r, { empty: '' })],
                ['type', _('Type'), (r) => select(r, [['http', 'http'], ['file', 'file']])],
                ['url', _('Url'), (r) => input(r, { empty: '' }), null, (item) => item.type !== 'file'],
                ['node', _('Node'), (r) => input(r, { values: ['GLOBAL', 'DIRECT'].concat(proxies) }), null, (item) => item.type !== 'file'],
                ['file_size_limit', _('File Size Limit'), (r) => input(r, { number: true, type: 'uinteger' }), null, (item) => item.type !== 'file'],
                ['file_path', _('File Path'), (r) => input(r, { empty: '' }), _('A file in %s.', `${(state.dirs || {}).rule_providers || ''}`), (item) => item.type === 'file'],
                ['file_format', _('File Format'), (r) => select(r, [['mrs', 'mrs'], ['yaml', 'yaml'], ['text', 'text']])],
                ['behavior', _('Behavior'), (r) => select(r, [['classical', 'classical'], ['domain', 'domain'], ['ipcidr', 'ipcidr']])],
                ['update_interval', _('Update Interval'), (r) => input(r, { number: true, type: 'uinteger' }), null, (item) => item.type !== 'file']
            ], { cards: true, create: () => ({ enabled: true, name: '', type: 'http', url: '', node: 'DIRECT', file_size_limit: 0, file_format: 'yaml', behavior: 'classical', update_interval: 0 }) }),
            null, () => d().mixin.rule_provider === true),
            row(_('Append Rule'), flag(ref('mixin.rule'))),
            row(_('Edit Rules'), table(ref('mixin.rules'), [
                enabledColumn,
                ['type', _('Type'), (r) => input(r, { empty: '', values: [
                    ['RULE-SET', _('Rule Set')], ['DOMAIN', _('Domain Name')], ['DOMAIN-SUFFIX', _('Domain Name Suffix')], ['DOMAIN-WILDCARD', _('Domain Name Wildcard')],
                    ['DOMAIN-KEYWORD', _('Domain Name Keyword')], ['DOMAIN-REGEX', _('Domain Name Regex')], ['IP-CIDR', _('Destination IP')], ['DST-PORT', _('Destination Port')],
                    ['SRC-IP-CIDR', _('Source IP')], ['GEOSITE', _('Domain Name Geo')], ['GEOIP', _('Destination IP Geo')], ['MATCH', 'MATCH']
                ] })],
                ['matcher', _('Matcher'), (r) => input(r, { empty: '' })],
                ['node', _('Node'), (r) => input(r, { empty: '', values: ['GLOBAL', 'DIRECT', 'REJECT', 'REJECT-DROP'].concat(proxies) })],
                ['no_resolve', _('No Resolve'), (r) => flag(r)]
            ], { create: () => ({ enabled: true, type: 'DOMAIN-SUFFIX', matcher: '', node: 'DIRECT', no_resolve: false }) }), null, () => d().mixin.rule === true)
        ]],
        ['geox', _('GeoX Config'), [
            row(_('GeoIP Format'), select(ref('mixin.geoip_format'), [['dat', 'DAT'], ['mmdb', 'MMDB']], unmodified)),
            row(_('GeoData Loader'), select(ref('mixin.geodata_loader'), [['standard', _('Standard Loader')], ['memconservative', _('Memory Conservative Loader')]], unmodified)),
            row(_('GeoSite Url'), input(ref('mixin.geosite_url'), { placeholder: _('Unmodified') })),
            row(_('GeoIP(MMDB) Url'), input(ref('mixin.geoip_mmdb_url'), { placeholder: _('Unmodified') })),
            row(_('GeoIP(DAT) Url'), input(ref('mixin.geoip_dat_url'), { placeholder: _('Unmodified') })),
            row(_('GeoIP(ASN) Url'), input(ref('mixin.geoip_asn_url'), { placeholder: _('Unmodified') })),
            row(_('GeoX Auto Update'), tri(ref('mixin.geox_auto_update'))),
            row(_('GeoX Update Interval'), input(ref('mixin.geox_update_interval'), { number: true, type: 'uinteger', placeholder: _('Unmodified') }))
        ]],
        ['mixin_file_content', _('Mixin File Content'), [
            row(_('Enable'), flag(ref('mixin.mixin_file_content')), _('Please go to the editor tab to edit the file for mixin'))
        ]]
    ]));

    const coreSection = section(_('Core Config'), tabs('core', [
        ['general', _('General Config'), [
            row(_('Redirect Listener Name'), input(ref('core.redirect_listener_name'), { empty: '' }), _('Used when the profile has no redir-port.')),
            row(_('TPROXY Listener Name'), input(ref('core.tproxy_listener_name'), { empty: '' }), _('Used when the profile has no tproxy-port.'))
        ]],
        ['limits', _('Limits'), [
            row(_('Number of Open Files'), input(ref('core.nofile'), { type: 'uinteger', empty: '', placeholder: _('Auto') }), _('Entware allows 1024 files, the core gets 40000 on arm64 and 10000 on mips by default.')),
            row('GOMEMLIMIT', input(ref('core.gomemlimit'), { empty: '', placeholder: _('Half of RAM') }), _('For example 128MiB, off disables the limit. Without a limit the router may kill the core when memory runs out.')),
            row('GOMAXPROCS', input(ref('core.gomaxprocs'), { empty: '', type: 'uinteger', placeholder: _('Unlimited') }))
        ]],
        ['environment_variable', _('Environment Variable Config'), [
            row(_('Safe Paths'), dynlist(ref('core.safe_paths'))),
            row(_('Disable Loopback Detector'), flag(ref('core.disable_loopback_detector'))),
            row(_('Disable GSO of quic-go'), flag(ref('core.disable_quic_go_gso'))),
            row(_('Disable ECN of quic-go'), flag(ref('core.disable_quic_go_ecn'))),
            row(_('Skip System IPv6 Check'), flag(ref('core.skip_system_ipv6_check')))
        ]]
    ]));

    return [
        E('div', { class: 'alert-message warning' }, _('These settings are for experienced users only. Do not change anything here unless you know exactly what you are doing: wrong values can break the proxy or the internet access of the whole network.')),
        proxySection, keeneticSection, mixinSection, coreSection, pageActions()
    ];
}

function pageEditor() {
    const files = state.files || {};
    const dirs = files.dirs || {};
    const choose = E('select');
    choose.appendChild(E('option', { value: '' }, '-'));
    const group = (label, list, dir, suffix) => {
        if (!list || list.length === 0) {
            return;
        }
        const g = E('optgroup', { label: label });
        for (const f of list) {
            g.appendChild(E('option', { value: `${dir}/${f.name}` }, suffix ? suffix(f) : f.name));
        }
        choose.appendChild(g);
    };
    const subscriptionNames = {};
    for (const s of state.config.subscriptions || []) {
        subscriptionNames[`${s.id}.yaml`] = s.name;
    }
    choose.appendChild(E('option', { value: files.mixin }, _('File for Mixin')));
    choose.appendChild(E('option', { value: files.run_profile }, _('Profile for Startup')));
    group(_('Profile'), files.profiles, dirs.profiles);
    group(_('Subscription'), files.subscriptions, dirs.subscriptions, (f) => subscriptionNames[f.name] || f.name);
    group(_('Rule Provider'), files.rule_providers, dirs.rule_providers);
    group(_('Proxy Provider'), files.proxy_providers, dirs.proxy_providers);

    const text = E('textarea', { rows: 25, wrap: 'off', spellcheck: 'false' });
    choose.addEventListener('change', async () => {
        text.value = '';
        if (choose.value) {
            text.value = (await run(api('file_read', { path: choose.value }))).content;
        }
    });

    const saveFile = async (restart) => {
        if (!choose.value) {
            notify(_('Choose a file first.'), 'warning');
            return;
        }
        await run(api('file_write', { path: choose.value, content: text.value }), _('File is saved.'));
        if (restart) {
            await run(api('service', { op: 'restart' }), _('The service is restarting.'));
        }
    };

    return [
        section(_('Editor'), [row(_('Choose File'), choose), text]),
        E('div', { class: 'cbi-page-actions' }, [
            button(_('Save & Apply'), () => saveFile(true), 'cbi-button-apply'),
            button(_('Save'), () => saveFile(false), 'cbi-button-save')
        ])
    ];
}

function pageLog() {
    const logView = (name) => {
        const text = E('textarea', { rows: 25, wrap: 'off', readonly: true, spellcheck: 'false' });
        let follow = true;
        const load = async () => {
            try {
                const data = await api('log_read', { name: name });
                if (text.value !== data.content) {
                    text.value = data.content;
                    if (follow) {
                        text.scrollTop = text.scrollHeight;
                    }
                }
            } catch (e) {
                /* ignore */
            }
        };
        text.addEventListener('scroll', () => {
            follow = text.scrollTop + text.clientHeight >= text.scrollHeight - 20;
        });
        load();
        state.timers.push(setInterval(load, 5000));
        return [
            E('div', { class: 'inline-actions', style: { marginBottom: '8px' } }, [
                button(_('Clear Log'), async () => {
                    await run(api('log_clear', { name: name }));
                    text.value = '';
                }, 'cbi-button-negative'),
                E('button', { class: 'btn', type: 'button', onclick: () => { follow = true; text.scrollTop = text.scrollHeight; } }, _('Scroll To Bottom'))
            ]),
            text
        ];
    };

    return [
        section(_('Log'), tabs('log', [
            ['log_config', _('Log Config'), [
                row(_('Clear At Stop'), flag(ref('log.clear_at_stop'))),
                row(_('Scheduled Clear'), flag(ref('log.scheduled_clear'))),
                row(_('Scheduled Clear Cron'), input(ref('log.scheduled_clear_cron'), { type: 'cron', empty: '' }), null, () => state.draft.log.scheduled_clear === true),
                row(_('Scheduled Clear Size Limit'), input(ref('log.scheduled_clear_size_limit'), { number: true, type: 'uinteger', empty: 1 }), null, () => state.draft.log.scheduled_clear === true),
                row(_('Scheduled Clear Size Limit Unit'), select(ref('log.scheduled_clear_size_limit_unit'), [['KB', 'KB'], ['MB', 'MB'], ['GB', 'GB']]), null, () => state.draft.log.scheduled_clear === true),
                E('div', { style: { marginTop: '8px' } }, pageActions())
            ]],
            ['app_log', _('App Log'), logView('app')],
            ['core_log', _('Core Log'), logView('core')],
            ['debug_log', _('Debug Log'), [
                E('p', { class: 'muted' }, _('The report hides addresses of servers, passwords and subscription links. Check it before you share it.')),
                button(_('Generate & Download'), async () => {
                    const data = await run(api('debug'));
                    download('debug.log', data.content, 'text/markdown');
                }, 'cbi-button-negative')
            ]]
        ]))
    ];
}

function pageUpdate() {
    const container = E('div', {}, E('div', { class: 'spinning' }));
    const logView = E('textarea', { rows: 15, wrap: 'off', readonly: true, spellcheck: 'false' });
    const pollLog = async () => {
        const data = await api('log_read', { name: 'update' });
        logView.value = data.content;
        logView.scrollTop = logView.scrollHeight;
        const lines = data.content.trim().split('\n');
        const last = lines[lines.length - 1] || '';
        return last === 'success' || last.startsWith('error:');
    };
    pollLog().catch(() => {});

    api('check_update').then((info) => {
        clear(container);
        const coreTitles = { meta: 'Mihomo Meta', alpha: 'Mihomo Alpha', prizrak: 'Prizrak-Core' };
        let available = false;
        const status = (current, next) => {
            if (next == null) {
                return '-';
            }
            if (!current) {
                available = true;
                return E('strong', {}, _('Not installed'));
            }
            if (current !== next && current.replace(/^v/, '') !== next.replace(/^v/, '')) {
                available = true;
                return E('strong', { style: { color: 'orange' } }, _('Update available'));
            }
            return E('span', { class: 'status-running', style: { fontStyle: 'normal' } }, _('Up to date'));
        };
        const tbl = E('table', { class: 'table' }, [
            E('tr', {}, [E('th', {}, _('Package')), E('th', {}, _('Installed')), E('th', {}, _('Latest')), E('th', {}, _('Status'))]),
            E('tr', {}, [E('td', {}, 'Exodus'), E('td', {}, info.app || '-'), E('td', {}, info.app_latest || '-'), E('td', {}, status(info.app, info.app_latest))]),
            E('tr', {}, [E('td', {}, `${_('Core')} (${coreTitles[info.core_type] || info.core_type})`), E('td', {}, info.core || '-'), E('td', {}, info.core_latest || '-'), E('td', {}, status(info.core, info.core_latest))])
        ]);
        const lowSpace = E('input', { type: 'checkbox' });
        lowSpace.checked = info.free_space != null && info.core_size != null && info.free_space < info.core_size * 1.2;
        const updateButton = button(_('Update'), async () => {
            const message = lowSpace.checked
                ? _('The current core will be removed before the new one is installed. If the update fails, the proxy will not work until the update is done again. Continue?')
                : _('The proxy will be restarted during the update. Continue?');
            if (!confirm(message)) {
                return;
            }
            await run(api('update', { low_space: lowSpace.checked }));
            logView.value = '';
            const timer = setInterval(async () => {
                try {
                    if (await pollLog()) {
                        clearInterval(timer);
                        notify(E('span', {}, [_('Update finished.'), ' ', E('a', { href: '#', onclick: (ev) => { ev.preventDefault(); location.reload(); } }, _('Reload the page'))]));
                    }
                } catch (e) {
                    /* the web ui restarts during the update */
                }
            }, 2000);
            state.timers.push(timer);
        }, 'cbi-button-apply');
        updateButton.disabled = !available;
        append(container, [
            E('p', {}, [
                `${_('Downloads')}: ${info.gh_proxy ? _('through gh-proxy at %s', info.gh_proxy) : _('directly from GitHub')}`, ' · ',
                `${_('Architecture')}: ${info.arch || '-'}`, ' · ',
                `${_('Free space')}: ${formatSize(info.free_space)}`, ' · ',
                `${_('Core size')}: ${formatSize(info.core_size)}`
            ]),
            E('div', { class: 'table-wrap' }, tbl),
            E('p', {}, E('label', {}, [lowSpace, ' ', _('Low flash space mode: remove the current core before installing the new one')])),
            E('div', { class: 'cbi-value-description' }, _('Use it when the update fails because there is not enough free space. The proxy does not work until the new core is installed.')),
            E('div', { class: 'inline-actions', style: { marginTop: '12px', justifyContent: 'flex-end' } }, [
                E('button', { class: 'btn', type: 'button', onclick: () => render() }, _('Check for Updates')),
                updateButton
            ])
        ]);
    }).catch((e) => {
        clear(container);
        container.appendChild(E('div', { class: 'alert-message warning' }, `${_('Failed to check for updates:')} ${e.message}`));
    });

    return [
        E('h2', {}, _('Updates')),
        E('div', { class: 'cbi-map-descr' }, [
            _('Exodus and the core are downloaded from GitHub and installed into Entware. Settings, profiles and subscriptions are kept.'), ' ',
            _('The core and the gh-proxy chosen in the installer are kept, run the installer again to change them.')
        ]),
        section(null, container),
        section(_('Update Log'), logView)
    ];
}

// ---------- router ----------

const pages = [
    ['status', _('Status'), pageStatus, async () => {
        await refreshStatus();
    }],
    ['profile', _('Profile'), pageProfile, async () => {
        const files = await api('files');
        state.dirs = files.dirs;
    }],
    ['advanced', _('Advanced'), pageAdvanced, async () => {
        const [interfaces, proxies, hwid, files] = await Promise.all([
            api('interfaces').catch(() => ({ interfaces: [] })),
            api('proxies').catch(() => ({ proxies: [] })),
            api('hwid').catch(() => ({})),
            api('files').catch(() => ({})),
            state.hosts ? null : loadHosts()
        ]);
        state.interfaces = interfaces.interfaces;
        state.proxies = proxies.proxies;
        state.hwid = hwid;
        state.dirs = files.dirs;
    }],
    ['editor', _('Editor'), pageEditor, async () => {
        state.files = await api('files');
    }],
    ['log', _('Log'), pageLog, null],
    ['update', _('Updates'), pageUpdate, null]
];

function currentPage() {
    const name = (location.hash || '').replace(/^#\/?/, '');
    return pages.find((p) => p[0] === name) || pages[0];
}

function renderMenu() {
    const menu = clear(document.getElementById('menu'));
    const current = currentPage()[0];
    for (const [name, title] of pages) {
        menu.appendChild(E('a', { href: `#/${name}`, class: name === current ? 'active' : null }, title));
    }
}

async function render() {
    state.timers.forEach((t) => clearInterval(t));
    state.timers = [];
    dependents = [];
    const content = clear(document.getElementById('content'));
    content.appendChild(E('div', { class: 'spinning' }));
    renderMenu();
    const page = currentPage();
    try {
        if (!state.config) {
            await loadAll();
        }
        if (page[3]) {
            await page[3]();
        }
    } catch (e) {
        if (e.message !== _('Login required')) {
            clear(content).appendChild(E('div', { class: 'alert-message error' }, e.message));
        }
        return;
    }
    clear(content);
    append(content, page[2]());
    changed();
}

let lastHash = location.hash;
window.addEventListener('hashchange', () => {
    if (isDirty() && !confirm(_('There are unsaved changes. Leave the page?'))) {
        history.replaceState(null, '', lastHash || '#/status');
        return;
    }
    if (isDirty()) {
        state.draft = clone(state.config);
        state.invalid.clear();
        updateDirty();
    }
    lastHash = location.hash;
    render();
});

window.addEventListener('beforeunload', (ev) => {
    if (isDirty()) {
        ev.preventDefault();
        ev.returnValue = '';
    }
});

// ---------- login ----------

function showLogin() {
    state.timers.forEach((t) => clearInterval(t));
    state.timers = [];
    clearInterval(state.statusTimer);
    state.statusTimer = null;
    if (state.loginShown) {
        return;
    }
    state.loginShown = true;
    closeModal();
    document.getElementById('indicator').hidden = true;
    document.getElementById('logout').hidden = true;
    document.getElementById('menu').hidden = true;
    const password = E('input', { type: 'password', placeholder: _('Password'), autocomplete: 'current-password', autofocus: true });
    const form = E('form', { class: 'cbi-section login' }, [
        E('h3', {}, _('Authorization Required')),
        E('p', { class: 'muted' }, _('Enter the password of the Exodus web UI. It is set by the installer, reset it with exodus passwd over SSH.')),
        password,
        E('button', { class: 'btn cbi-button-apply', type: 'submit' }, _('Log in'))
    ]);
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
            await api('login', { password: password.value });
        } catch (e) {
            notify(e.message === 'wrong password' ? _('Invalid password') : e.message, 'error');
            password.select();
            return;
        }
        clear(document.getElementById('notifications'));
        start();
    });
    append(clear(document.getElementById('content')), form);
    password.focus();
}

async function start() {
    state.loginShown = false;
    document.getElementById('menu').hidden = false;
    document.getElementById('logout').hidden = false;
    state.config = null;
    state.hosts = null;
    await render();
    if (state.config && !state.statusTimer) {
        state.statusTimer = setInterval(refreshStatus, 5000);
        refreshStatus();
    }
}

// ---------- init ----------

document.getElementById('lang').textContent = lang === 'ru' ? 'EN' : 'RU';
document.getElementById('lang').addEventListener('click', () => {
    storageSet('exodus.lang', lang === 'ru' ? 'en' : 'ru');
    location.reload();
});
document.getElementById('logout').textContent = _('Logout');
document.getElementById('logout').addEventListener('click', async () => {
    if (isDirty() && !confirm(_('There are unsaved changes. Leave the page?'))) {
        return;
    }
    await api('logout').catch(() => {});
    state.config = null;
    state.draft = null;
    updateDirty();
    showLogin();
});
document.getElementById('modal').addEventListener('click', (ev) => {
    if (ev.target.id === 'modal') {
        closeModal();
    }
});
document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
        closeModal();
    }
});

start();

})();
