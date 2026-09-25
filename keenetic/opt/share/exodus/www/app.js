'use strict';

// web ui of exodus for keenetic, built after shadcn/ui without any framework
// the config is edited as a draft copy and saved as a whole

(function () {

// ---------- storage and i18n ----------

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

// ---------- icons ----------

// lucide icons (ISC license), only the ones the pages use
const ICONS = {
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'square': '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    'rotate-cw': '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'pencil': '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'circle-alert': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    'triangle-alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'wifi': '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    'network': '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
    'device': '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"/><path d="M10 19v-3.96 3.15"/><path d="M7 19h5"/><rect width="6" height="10" x="16" y="12" rx="2"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'loader': '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'arrow-down': '<path d="M12 17V3"/><path d="m6 11 6 6 6-6"/><path d="M19 21H5"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'list': '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    'git-branch': '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    'hash': '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'cpu': '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    'router': '<rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6.01 18H6"/><path d="M10.01 18H10"/><path d="M15 10v4"/><path d="M17.84 7.17a4 4 0 0 0-5.66 0"/><path d="M20.66 4.34a8 8 0 0 0-11.31 0"/>',
    'github': '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    'arrow-up-circle': '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
    'bug': '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'
};

// the EX mark of exodus, drawn with the current text color
const LOGO = '<path d="M493 317.721L484.279 309H94.7214L86 317.721V387.493L173.214 474.707L164.493 483.429H94.7214L86 492.15V605.529L94.7214 614.25H167.4L184.843 631.693V707.279L193.564 716H484.279L493 707.279V622.971L484.279 614.25H202.286L184.843 596.807V503.779L193.564 495.057L260.429 561.921H484.279L493 553.2V468.893L484.279 460.171H306.943L266.243 419.471L274.964 410.75H484.279L493 402.029V317.721Z"/><path d="M616.307 309H540.721L532 317.721V393.307L682.698 544.479L673.977 553.2H624.555L532 646.229V707.279L540.721 716H604.205L688.512 631.693V564.829H703.048L848.879 716H930.279L939 707.279V631.693L788.302 480.521L797.023 471.8H846.445L939 378.771V317.721L930.279 309H866.795L782.488 393.307V460.171H767.952L616.307 309Z"/>';

function svg(markup) {
    const holder = document.createElement('span');
    holder.innerHTML = markup;
    return holder.firstChild;
}

function icon(name, cls) {
    const el = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
    if (cls) {
        el.setAttribute('class', cls);
    }
    return el;
}

function logo() {
    return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="86 309 853 407" fill="currentColor" aria-hidden="true">${LOGO}</svg>`);
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
        return el;
    }
    if (Array.isArray(children)) {
        children.forEach((child) => append(el, child));
    } else if (children instanceof Node) {
        el.appendChild(children);
    } else {
        el.appendChild(document.createTextNode(String(children)));
    }
    return el;
}

function clear(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
    return el;
}

let uid = 0;

function nextId() {
    return `x${uid++}`;
}

function formatSize(bytes) {
    if (bytes == null) {
        return '—';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${Math.round(bytes * 10) / 10} ${units[i]}`;
}

function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type: type || 'text/plain' }));
    const link = E('a', { href: url, download: name });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- toasts ----------

const TOAST_ICONS = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };

function toast(message, type) {
    type = type || 'success';
    const el = E('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' }, [
        icon(TOAST_ICONS[type] || 'info'),
        E('div', {}, message),
        E('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: _('Close'), onclick: () => el.remove() }, icon('x'))
    ]);
    document.getElementById('toaster').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 10000 : 5000);
    return el;
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
        data = { error: _('Invalid answer of the router (%s)', `${response.status} ${response.statusText}`) };
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
            toast(success);
        }
        return result;
    }).catch((e) => {
        if (e.message !== _('Login required')) {
            toast(e.message, 'error');
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
    interfaces: [],
    proxies: [],
    hwid: {},
    dirs: {},
    files: {},
    invalid: new Set(),
    timers: [],
    statusTimer: null,
    loginShown: false,
    editorFile: null
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
    const dirty = isDirty();
    document.getElementById('savebar').hidden = !dirty;
    document.body.classList.toggle('dirty', dirty);
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

// parts of a page that follow the status, redrawn when their key changes
let liveViews = [];

function live(renderFn, keyFn) {
    const el = E('div', { class: 'contents' });
    let last = null;
    const update = () => {
        const key = keyFn ? JSON.stringify(keyFn()) : null;
        if (keyFn && key === last) {
            return;
        }
        last = key;
        append(clear(el), renderFn());
    };
    update();
    liveViews.push(update);
    return el;
}

function statusBadge() {
    const status = state.status;
    if (!status) {
        return badge(_('Unknown'), 'outline');
    }
    return status.running ? badge(_('Running'), 'success', true) : badge(_('Stopped'), 'secondary', true);
}

async function refreshStatus() {
    try {
        state.status = await api('status');
    } catch (e) {
        return;
    }
    renderAboutButton();
    liveViews.forEach((update) => update());
}

// ---------- components ----------

// variant: default, secondary, outline, ghost, destructive, destructive-outline; size: sm
function btn(label, opts) {
    opts = opts || {};
    const classes = ['btn', `btn-${opts.variant || 'default'}`];
    if (opts.size) {
        classes.push(`btn-${opts.size}`);
    }
    if (!label) {
        classes.push('btn-icon');
    }
    const el = E('button', { type: opts.submit ? 'submit' : 'button', class: classes.join(' '), title: opts.title || null, disabled: opts.disabled || null, 'aria-label': label ? null : opts.title }, [
        opts.icon ? icon(opts.icon) : null,
        label ? E('span', {}, label) : null
    ]);
    if (opts.onClick) {
        el.addEventListener('click', async (ev) => {
            el.disabled = true;
            const spinner = icon('loader', 'spin');
            // a spinner only for actions that take a while
            const timer = setTimeout(() => {
                el.classList.add('loading');
                el.prepend(spinner);
            }, 150);
            try {
                await opts.onClick(ev);
            } catch (e) {
                // errors of api calls are already shown by run()
                console.error(e);
            } finally {
                clearTimeout(timer);
                spinner.remove();
                el.classList.remove('loading');
                el.disabled = false;
            }
        });
    }
    return el;
}

function badge(text, variant, dot) {
    return E('span', { class: `badge badge-${variant || 'secondary'}` }, [dot ? E('span', { class: 'dot' }) : null, text]);
}

function alertBox(variant, title, body) {
    const icons = { destructive: 'circle-alert', warning: 'triangle-alert' };
    return E('div', { class: `alert alert-${variant || 'default'}`, role: 'alert' }, [
        icon(icons[variant] || 'info'),
        title ? E('div', { class: 'alert-title' }, title) : null,
        body ? E('div', { class: title ? 'alert-body' : 'alert-title' }, body) : null
    ]);
}

function card(opts) {
    const header = opts.title || opts.description || opts.action ? E('div', { class: 'card-header' }, [
        opts.title ? E('div', { class: 'card-title' }, [opts.title, opts.info ? infoButton(opts.title, opts.info) : null]) : null,
        opts.description ? E('div', { class: 'card-description' }, opts.description) : null,
        opts.action ? E('div', { class: 'card-action' }, opts.action) : null
    ]) : null;
    return E('section', { class: `card ${opts.class || ''}` }, [
        header,
        opts.content != null ? E('div', { class: 'card-content' }, opts.content) : null,
        opts.footer ? E('div', { class: 'card-footer' }, opts.footer) : null
    ]);
}

function pageHeader(title, description, actions) {
    return E('div', { class: 'page-header' }, [
        E('div', {}, [E('h1', {}, title), description ? E('p', {}, description) : null]),
        actions ? E('div', { class: 'row' }, actions) : null
    ]);
}

function loader() {
    return E('div', { class: 'loader' }, icon('loader', 'spin'));
}

function empty(iconName, text) {
    return E('div', { class: 'empty' }, [icon(iconName), E('div', {}, text)]);
}

function infoList(rows) {
    return E('dl', { class: 'info-list' }, rows.filter(Boolean).map(([title, value]) => [E('dt', {}, title), E('dd', {}, value)]));
}

// ---------- dialog ----------

let dialogClose = null;

function openDialog(opts) {
    const overlay = document.getElementById('dialog');
    const box = E('div', { class: `dialog${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, [
        E('div', { class: 'dialog-header' }, [
            E('h2', { class: 'dialog-title' }, opts.title),
            opts.description ? E('p', { class: 'dialog-description' }, opts.description) : null
        ]),
        opts.content ? E('div', { class: 'stack' }, opts.content) : null,
        opts.footer ? E('div', { class: 'dialog-footer' }, opts.footer) : null,
        E('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm dialog-close', title: _('Close'), onclick: () => closeDialog() }, icon('x'))
    ]);
    append(clear(overlay), box);
    overlay.hidden = false;
    dialogClose = opts.onClose || null;
    const focus = box.querySelector('.stack input, .stack select') || box.querySelector('.dialog-footer .btn:last-child');
    if (focus) {
        focus.focus();
    }
}

function closeDialog(result) {
    const overlay = document.getElementById('dialog');
    if (overlay.hidden) {
        return;
    }
    overlay.hidden = true;
    clear(overlay);
    const callback = dialogClose;
    dialogClose = null;
    if (callback) {
        callback(result);
    }
}

function confirmDialog(title, description, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
        openDialog({
            title: title,
            description: description,
            footer: [
                btn(_('Cancel'), { variant: 'outline', onClick: () => closeDialog(false) }),
                btn(opts.confirm || _('Continue'), { variant: opts.destructive ? 'destructive' : 'default', onClick: () => closeDialog(true) })
            ],
            onClose: (result) => resolve(result === true)
        });
    });
}

// ---------- form widgets ----------

let dependents = [];

function dependOn(el, depends) {
    if (depends) {
        dependents.push({ el: el, depends: depends });
        el.hidden = !depends();
    }
    return el;
}

function changed() {
    for (const dependent of dependents) {
        dependent.el.hidden = !dependent.depends();
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

const validators = {
    port: (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 65535,
    uinteger: (v) => /^\d+$/.test(v),
    dscp: (v) => /^\d+$/.test(v) && +v <= 63,
    mac: (v) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(v),
    ip4: (v) => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(v) && v.split('/')[0].split('.').every((x) => +x <= 255),
    ip6: (v) => /^[0-9a-f:.]*:[0-9a-f:.]*(\/\d{1,3})?$/i.test(v),
    cron: (v) => v.trim().split(/\s+/).length === 5,
    portlist: (v) => /^\d+(-\d+)?([ ,]+\d+(-\d+)?)*$/.test(v.trim())
};

function validate(el, type, value) {
    if (!type) {
        return true;
    }
    const valid = value === '' || value == null || validators[type](String(value));
    if (el.dataset.wid == null) {
        el.dataset.wid = nextId();
    }
    markInvalid(el, el.dataset.wid, !valid);
    return valid;
}

// the control a label points to
function labelTarget(control) {
    const target = control.matches('input, select, textarea, button') ? control : control.querySelector('input, select, textarea');
    if (!target) {
        return null;
    }
    if (!target.id) {
        target.id = nextId();
    }
    return target.id;
}

// label, control and a muted description under it; descriptions are static strings and may hold <code>
// info moves a longer explanation behind an (i) next to the label
function field(label, control, description, depends, info) {
    const title = label ? E('label', { class: 'label', for: labelTarget(control) }, label) : null;
    return dependOn(E('div', { class: 'field' }, [
        info ? E('div', { class: 'label-row' }, [title, infoButton(label, info)]) : title,
        control,
        description ? E('p', { class: 'description', html: description }) : null
    ]), depends);
}

// (i) that opens the explanation in a dialog; paragraphs are static strings or nodes
function infoButton(title, paragraphs) {
    return E('button', { class: 'btn btn-ghost btn-icon info-btn', type: 'button', title: _('More'), 'aria-label': _('More'), onclick: (ev) => {
        ev.preventDefault();
        openDialog({
            title: title,
            content: E('div', { class: 'info-text' }, paragraphs.map((p) => (typeof p === 'string' ? E('p', { html: p }) : p))),
            footer: [btn(_('Got it'), { onClick: () => closeDialog() })]
        });
    } }, icon('info'));
}

function switchControl(r) {
    const el = E('button', { type: 'button', role: 'switch', class: 'switch' }, E('span', { class: 'switch-thumb' }));
    const sync = () => el.setAttribute('aria-checked', r.get() === true ? 'true' : 'false');
    sync();
    el.addEventListener('click', () => {
        r.set(r.get() !== true);
        sync();
        changed();
    });
    return el;
}

// an option that is on or off: text on the left, switch on the right
function switchField(label, description, r, depends) {
    const control = switchControl(r);
    control.id = nextId();
    return dependOn(E('div', { class: 'field-switch' }, [
        E('div', {}, [
            E('label', { class: 'label', for: control.id }, label),
            description ? E('p', { class: 'description', html: description }) : null
        ]),
        control
    ]), depends);
}

function checkbox(r) {
    const el = E('input', { type: 'checkbox', class: 'checkbox' });
    el.checked = r.get() === true;
    el.addEventListener('change', () => {
        r.set(el.checked);
        changed();
    });
    return el;
}

// options: [[value, label]]; opts.optional adds an empty choice (null keeps the value of the profile)
function select(r, options, opts) {
    opts = opts || {};
    const el = E('select', { class: 'select' });
    if (opts.optional) {
        el.appendChild(E('option', { value: '' }, opts.placeholder || _('From profile')));
    }
    const fromValue = (v) => (v == null ? '' : String(v));
    const toValue = (v) => (v === '' ? (opts.empty !== undefined ? opts.empty : null) : (opts.number ? Number(v) : v));
    const current = fromValue(r.get());
    let found = current === '' && opts.optional;
    for (const [value, label] of options) {
        el.appendChild(E('option', { value: value }, label));
        if (value === current) {
            found = true;
        }
    }
    // a value set in the file is shown even when it is not one of the choices
    if (!found && current !== '') {
        el.appendChild(E('option', { value: current }, current));
    }
    el.value = current;
    el.addEventListener('change', () => {
        r.set(toValue(el.value));
        changed();
    });
    return el;
}

function datalist(values) {
    const id = nextId();
    return {
        id: id,
        el: E('datalist', { id: id }, values.map((v) => (Array.isArray(v) ? E('option', { value: v[0] }, v[1]) : E('option', { value: v }))))
    };
}

// text or number, empty is null unless opts.empty is set; a value equal to opts.empty is shown as the placeholder
function input(r, opts) {
    opts = opts || {};
    const attrs = {
        class: 'input',
        type: opts.password ? 'password' : 'text',
        placeholder: opts.placeholder != null ? String(opts.placeholder) : null,
        autocomplete: opts.password ? 'new-password' : 'off',
        spellcheck: 'false',
        inputmode: opts.number ? 'numeric' : null,
        readonly: opts.readonly || null
    };
    let list = null;
    if (opts.values) {
        list = datalist(opts.values);
        attrs.list = list.id;
    }
    const el = E('input', attrs);
    const value = r.get();
    el.value = value == null || (opts.placeholder != null && opts.empty !== undefined && value === opts.empty) ? '' : String(value);
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
        const reveal = E('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: _('Show or hide'), onclick: () => { el.type = el.type === 'password' ? 'text' : 'password'; } }, icon('eye'));
        return E('div', { class: 'input-group' }, [el, reveal]);
    }
    return list ? E('div', {}, [el, list.el]) : el;
}

// a list of short values as removable tags, Enter, space or comma adds what is typed
function tags(r, opts) {
    opts = opts || {};
    const box = E('div', { class: 'tags' });
    const list = opts.values ? datalist(opts.values) : null;
    const entry = E('input', { type: 'text', placeholder: opts.placeholder || _('Add'), spellcheck: 'false', autocomplete: 'off', list: list ? list.id : null });
    const wid = nextId();
    const values = () => (Array.isArray(r.get()) ? r.get() : []);
    const render = () => {
        box.querySelectorAll('.tag').forEach((tag) => tag.remove());
        entry.placeholder = values().length > 0 ? '' : (opts.placeholder || _('Add'));
        values().forEach((value, index) => {
            box.insertBefore(E('span', { class: 'tag' }, [
                E('span', { title: String(value) }, String(value)),
                E('button', { type: 'button', title: _('Delete'), onclick: (ev) => {
                    ev.stopPropagation();
                    const next = values().slice();
                    next.splice(index, 1);
                    r.set(next);
                    render();
                    changed();
                } }, icon('x'))
            ]), entry);
        });
    };
    const add = () => {
        const parts = entry.value.split(/[\s,]+/).filter(Boolean);
        if (parts.length === 0) {
            markInvalid(box, wid, false);
            return;
        }
        if (opts.type && parts.some((v) => !validators[opts.type](v))) {
            markInvalid(box, wid, true);
            updateDirty();
            return;
        }
        const next = values().slice();
        for (const part of parts) {
            const value = opts.number ? Number(part) : part;
            if (!next.includes(value)) {
                next.push(value);
            }
        }
        r.set(next);
        entry.value = '';
        markInvalid(box, wid, false);
        render();
        changed();
    };
    entry.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ',' || ev.key === ' ') {
            ev.preventDefault();
            add();
        } else if (ev.key === 'Backspace' && entry.value === '' && values().length > 0) {
            r.set(values().slice(0, -1));
            render();
            changed();
        }
    });
    entry.addEventListener('input', () => {
        if (entry.value === '') {
            markInvalid(box, wid, false);
        }
        // a choice from the datalist is added at once
        if (opts.values && opts.values.some((v) => (Array.isArray(v) ? v[0] : v) === entry.value)) {
            add();
        }
    });
    entry.addEventListener('blur', add);
    box.addEventListener('click', () => entry.focus());
    append(box, [entry, list && list.el]);
    render();
    return box;
}

// two or three choices like a toggle group
function segmented(r, options) {
    const el = E('div', { class: 'segmented', role: 'radiogroup' });
    const render = () => {
        clear(el);
        for (const [value, label] of options) {
            const active = r.get() === value;
            el.appendChild(E('button', { type: 'button', role: 'radio', 'aria-checked': active ? 'true' : 'false', class: `tabs-trigger${active ? ' active' : ''}`, onclick: () => {
                r.set(value);
                render();
                changed();
            } }, label));
        }
    };
    render();
    return el;
}

// tabs keep their choice while the page is open
const tabChoice = {};

function tabs(id, list) {
    const selected = tabChoice[id] && list.some((t) => t[0] === tabChoice[id]) ? tabChoice[id] : list[0][0];
    const triggers = E('div', { class: 'tabs-list', role: 'tablist' });
    const container = E('div', { class: 'tabs' }, triggers);
    const panes = [];
    for (const [key, title, content] of list) {
        const pane = E('div', { class: 'stack', role: 'tabpanel', hidden: key !== selected }, content);
        const trigger = E('button', { type: 'button', role: 'tab', class: `tabs-trigger${key === selected ? ' active' : ''}`, 'aria-selected': key === selected ? 'true' : 'false' }, title);
        trigger.addEventListener('click', () => {
            tabChoice[id] = key;
            triggers.querySelectorAll('.tabs-trigger').forEach((t) => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            trigger.classList.add('active');
            trigger.setAttribute('aria-selected', 'true');
            panes.forEach((p) => { p.hidden = true; });
            pane.hidden = false;
        });
        triggers.appendChild(trigger);
        panes.push(pane);
        container.appendChild(pane);
    }
    return container;
}

// ---------- saving ----------

function renderSavebar() {
    append(clear(document.getElementById('savebar')), [
        E('div', { class: 'savebar-text' }, [E('span', { class: 'dot' }), _('Unsaved changes')]),
        E('div', { class: 'row' }, [
            btn(_('Reset'), { variant: 'ghost', size: 'sm', onClick: resetDraft }),
            btn(_('Save'), { variant: 'outline', size: 'sm', onClick: () => save('none') }),
            btn(_('Save & Apply'), { size: 'sm', onClick: () => save('restart') })
        ])
    ]);
}

function resetDraft() {
    state.draft = clone(state.config);
    state.invalid.clear();
    render();
}

async function save(apply) {
    if (state.invalid.size > 0) {
        toast(_('Some fields are invalid, fix them before saving.'), 'error');
        return;
    }
    const oldPort = state.config.web && state.config.web.port;
    const newPort = state.draft.web && state.draft.web.port;
    await run(api('config_set', { config: state.draft, apply: apply }), apply === 'restart' ? _('Settings are saved, the service is restarting.') : _('Settings are saved.'));
    state.config = clone(state.draft);
    updateDirty();
    if (apply === 'restart') {
        setTimeout(refreshStatus, 3000);
    }
    // the web ui moves to the new port
    if (newPort && oldPort !== newPort) {
        toast(_('The web UI moves to port %s.', newPort), 'info');
        setTimeout(() => {
            location.href = `${location.protocol}//${location.hostname}:${newPort}/`;
        }, 2500);
    }
}

// ---------- service ----------

async function serviceOp(op) {
    const messages = { start: _('The service is starting.'), stop: _('The service is stopping.'), restart: _('The service is restarting.') };
    await run(api('service', { op: op }), messages[op]);
    [1500, 4000, 8000].forEach((delay) => setTimeout(refreshStatus, delay));
}

function openDashboard() {
    const info = (state.status && state.status.api) || {};
    const listen = info.tls_listen || info.listen;
    if (!listen) {
        toast(_('The dashboard is available when the service is running.'), 'warning');
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

const CORE_TITLES = { meta: 'Mihomo Meta', alpha: 'Mihomo Alpha', prizrak: 'Prizrak-Core' };

function profileTitle(profile) {
    if (!profile) {
        return null;
    }
    const type = profile.substring(0, profile.indexOf(':'));
    const id = profile.substring(profile.indexOf(':') + 1);
    if (type === 'subscription') {
        const sub = (state.draft.subscriptions || []).find((s) => s.id === id);
        return sub ? sub.name : id;
    }
    return id;
}

function profileChoices() {
    const choices = [];
    for (const s of state.draft.subscriptions || []) {
        choices.push([`subscription:${s.id}`, `${_('Subscription')}: ${s.name}`]);
    }
    for (const p of state.profiles) {
        choices.push([`file:${p.name}`, `${_('File')}: ${p.name}`]);
    }
    return choices;
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
        return `${_('Segment')}: ${segment && segment.name ? segment.name : value}`;
    }
    if (type === 'ap') {
        const ap = hosts.aps.find((a) => a.id === value);
        return `Wi-Fi: ${ap ? `${ap.ssid || ap.description || value} (${ap.band})` : value}`;
    }
    if (type === 'mac') {
        const host = hosts.hosts.find((h) => h.mac === value.toUpperCase());
        return host && (host.name || host.hostname) ? host.name || host.hostname : value;
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

async function loadHosts() {
    try {
        state.hosts = await api('hosts');
    } catch (e) {
        state.hosts = { rci: false, segments: [], aps: [], hosts: [], error: e.message };
    }
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

    const option = (item, iconName, title, meta, extra) => {
        const checked = items().includes(item);
        const box = E('input', { type: 'checkbox', class: 'checkbox' });
        box.checked = checked;
        box.addEventListener('change', () => toggle(item, box.checked));
        return E('label', { class: `picker-item${checked ? ' selected' : ''}${extra && extra.inactive ? ' inactive' : ''}` }, [
            box,
            icon(iconName),
            E('div', { class: 'picker-text' }, [
                E('div', { class: 'picker-title' }, [E('span', {}, title), extra && extra.tags]),
                meta ? E('div', { class: 'picker-meta' }, meta) : null
            ])
        ]);
    };

    const group = (title, count, content, action) => E('div', { class: 'picker-group' }, [
        E('div', { class: 'picker-head' }, [E('div', { class: 'label' }, [title, count != null ? badge(String(count), 'secondary') : null]), action]),
        content
    ]);

    const render = () => {
        clear(container);
        const hosts = state.hosts;
        const selected = items();

        container.appendChild(group(_('Selected'), selected.length,
            selected.length === 0
                ? E('p', { class: 'description' }, _('Nothing is selected.'))
                : E('div', { class: 'chips' }, selected.map((item) => E('span', { class: 'tag plain' }, [
                    E('span', { title: itemValue(item) }, describeItem(item)),
                    E('button', { type: 'button', title: _('Delete'), onclick: () => toggle(item, false) }, icon('x'))
                ]))),
            btn(_('Refresh'), { variant: 'outline', size: 'sm', icon: 'refresh-cw', onClick: async () => {
                state.hosts = null;
                render();
                await loadHosts();
                render();
            } })));

        if (!hosts) {
            container.appendChild(loader());
            return;
        }
        if (!hosts.rci) {
            container.appendChild(alertBox('warning', _('The router did not give the list of devices'),
                hosts.error ? `${_('Error')}: ${hosts.error}` : _('Names of devices, Wi-Fi points and parental control are not available: only devices from the ARP table of the router are listed.')));
        }

        // segments, wi-fi points and the manual address on the left, devices on the right
        const left = E('div', { class: 'picker-column' });
        const right = E('div', { class: 'picker-column' });
        container.appendChild(E('div', { class: 'picker-columns' }, [left, right]));

        if (hosts.segments.length > 0) {
            left.appendChild(group(_('Network segments'), null, E('div', { class: 'picker-list scroll short' }, hosts.segments.map((s) =>
                option(`iface:${s.ifname}`, 'network', s.name || s.ifname, [s.ifname, s.address].filter(Boolean).join(' · '))))));
        }

        if (hosts.aps.length > 0) {
            left.appendChild(group(_('Wi-Fi points'), hosts.aps.length, E('div', { class: 'picker-list scroll short' }, hosts.aps.map((ap) =>
                option(`ap:${ap.id}`, 'wifi', ap.ssid || ap.description || ap.id,
                    [ap.band, ap.id, _('clients: %s', ap.clients)].join(' · '),
                    { inactive: ap.state === 'down', tags: ap.state === 'down' ? badge(_('off'), 'outline') : null })))));
        }

        const search = E('input', { class: 'input', type: 'search', placeholder: _('Search by name, MAC or IP'), value: filter });
        const list = E('div', { class: 'picker-list scroll' });
        const segmentNames = {};
        for (const s of hosts.segments) {
            if (s.id) {
                segmentNames[s.id] = s.name || s.ifname;
            }
            segmentNames[s.ifname] = s.name || s.ifname;
        }
        const renderHosts = () => {
            clear(list);
            const needle = filter.toLowerCase();
            const shown = hosts.hosts
                .filter((h) => !needle || [h.name, h.hostname, h.mac, h.ip, h.ssid].some((v) => (v || '').toLowerCase().includes(needle)))
                .sort((a, b) => (b.active - a.active) || (a.name || a.hostname || a.mac).localeCompare(b.name || b.hostname || b.mac));
            if (shown.length === 0) {
                list.appendChild(E('div', { class: 'picker-empty' }, needle ? _('Nothing found') : _('No devices')));
            }
            for (const h of shown) {
                const tagList = [];
                if (!h.active) {
                    tagList.push(badge(_('offline'), 'outline'));
                }
                if (h.access === 'deny') {
                    tagList.push(badge(_('blocked'), 'destructive'));
                }
                list.appendChild(option(`mac:${h.mac}`, h.ssid ? 'wifi' : 'device', h.name || h.hostname || h.mac,
                    [h.mac, h.ip, h.ssid ? `Wi-Fi ${h.ssid}` : (segmentNames[h.segment] || h.segment || null)].filter(Boolean).join(' · '),
                    { inactive: !h.active, tags: tagList }));
            }
        };
        search.addEventListener('input', () => {
            filter = search.value;
            renderHosts();
        });
        renderHosts();
        right.appendChild(group(_('Devices'), hosts.hosts.length, [E('div', { class: 'search' }, [icon('search'), search]), list]));

        const manual = E('input', { class: 'input', type: 'text', placeholder: _('MAC, IPv4 or IPv6 address or network'), spellcheck: 'false' });
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
        left.appendChild(field(_('Add by address'), E('div', { class: 'row', style: { flexWrap: 'nowrap' } }, [manual, btn(_('Add'), { variant: 'outline', icon: 'plus', onClick: addManual })]), null, null, [
            _('For a device the router does not list, or a whole network like <code>192.168.1.0/24</code>.'),
            _('The IP address of a device the router knows is saved as its MAC, so the choice follows the device when its address changes.')
        ]));
    };

    render();
    if (!state.hosts) {
        loadHosts().then(render, render);
    }
    return container;
}

// ---------- pages ----------

function pageStatus() {
    const d = state.draft;
    const status = () => state.status || {};

    const service = card({
        title: _('Service'),
        action: live(statusBadge, () => [status().running, !!state.status]),
        content: [
            state.config.config.enabled !== true ? alertBox('warning', _('The service is disabled'), _('It does not start until Enable is on. Turn it on below and choose Save & Apply.')) : null,
            live(() => {
                const s = status();
                const core = s.core_version ? `${s.core_version} · ${CORE_TITLES[s.core_type] || s.core_type || 'Mihomo'}` : '—';
                let proxy;
                if (!state.config.proxy.enabled) {
                    proxy = badge(_('Off'), 'outline');
                } else if (s.running && s.hijack) {
                    proxy = badge(_('Active'), 'success');
                } else {
                    proxy = badge(_('Inactive'), 'secondary');
                }
                return infoList([
                    [_('Exodus'), E('span', { class: 'mono' }, s.app_version || '—')],
                    [_('Core'), E('span', { class: 'mono' }, core)],
                    [_('Profile'), profileTitle(state.config.config.profile) || '—'],
                    [_('Transparent proxy'), proxy]
                ]);
            }, () => [status().app_version, status().core_version, status().core_type, status().running, status().hijack])
        ],
        footer: live(() => (status().running
            ? [
                btn(_('Restart'), { icon: 'rotate-cw', onClick: () => serviceOp('restart') }),
                btn(_('Stop'), { variant: 'outline', icon: 'square', onClick: () => serviceOp('stop') }),
                btn(_('Dashboard'), { variant: 'outline', icon: 'external-link', onClick: openDashboard })
            ]
            : [btn(_('Start'), { icon: 'play', disabled: state.config.config.enabled !== true, onClick: () => serviceOp('start') })]
        ), () => [status().running])
    });

    const startup = card({
        title: _('Startup'),
        content: [
            switchField(_('Enable'), _('Run the service and start it when the router boots.'), ref('config.enabled')),
            field(_('Profile'), select(ref('config.profile'), profileChoices(), { optional: true, placeholder: _('Not selected') }), null, null, [
                _('A subscription or an uploaded file, they are managed on the Profiles page.'),
                _('On every start the profile is merged with the settings of Exodus and the mixin file, a subscription is downloaded again unless its update is manual.'),
                _('Save & Apply restarts the service with the chosen profile.')
            ])
        ]
    });

    const modeInfo = (key, text) => E('p', {}, [E('strong', {}, key), E('br'), text]);
    const devices = card({
        title: _('Devices'),
        content: [
            d.proxy.enabled !== true ? alertBox('warning', null, _('The transparent proxy is turned off in Settings, the selection has no effect.')) : null,
            field(_('Mode'), segmented(ref('proxy.access_mode'), [['exclude', _('All except selected')], ['include', _('Only selected')]]), null, null, [
                modeInfo(_('All except selected'), _('All devices go through the proxy, the selected ones go directly.')),
                modeInfo(_('Only selected'), _('Only the selected devices go through the proxy, the others go directly.')),
                _('A segment matches all its devices, a Wi-Fi point matches the devices connected to it (synced every 30 seconds), a device is matched by its MAC with IPv4 and IPv6. DNS follows the choice: proxied devices ask the core, the others ask the router.')
            ]),
            devicePicker()
        ]
    });

    return [
        pageHeader(_('Status')),
        E('div', { class: 'stack' }, [E('div', { class: 'grid-2' }, [service, startup]), devices])
    ];
}

function newId() {
    return `sub_${Math.random().toString(16).slice(2, 10)}`;
}

function subscriptionDialog(subscription, onSave) {
    const draft = clone(subscription);
    const saved = dependents;
    dependents = [];
    const content = [
        field(_('Name'), input(objRef(draft, 'name'), { empty: '' })),
        field(_('URL'), input(objRef(draft, 'url'), { empty: '', placeholder: 'https://' })),
        field(_('Info URL'), input(objRef(draft, 'info_url'), { empty: '', placeholder: _('Optional') }), _('Only when traffic and expiry come from another address.')),
        field(_('User agent'), input(objRef(draft, 'user_agent'), { empty: '', values: ['Mihomo/Exodus v{version}', 'clash.meta', 'mihomo', 'clash'] }), _('<code>{version}</code> is replaced with the version of Exodus.')),
        field(_('Update'), select(objRef(draft, 'prefer'), [['remote', _('On every start')], ['local', _('Manually')]]),
            _('Manually: the downloaded file is used until you press Update.')),
        switchField(_('Send HWID'), _('Needed by panels with a device limit, the headers are shown in Settings → Service.'), objRef(draft, 'send_hwid'))
    ];
    dependents = saved;
    openDialog({
        title: subscription.name ? _('Edit subscription') : _('New subscription'),
        content: content,
        footer: [
            btn(_('Cancel'), { variant: 'outline', onClick: () => closeDialog() }),
            btn(_('Done'), { onClick: () => {
                if (!draft.name || !draft.url) {
                    toast(_('Name and URL are required.'), 'error');
                    return;
                }
                closeDialog();
                onSave(draft);
            } })
        ]
    });
}

function pageProfiles() {
    const active = state.draft.config.profile;

    // subscriptions are a part of the config, they are saved with the save bar
    const subsContainer = E('div', { class: 'contents' });
    const renderSubscriptions = () => {
        clear(subsContainer);
        const subscriptions = state.draft.subscriptions || [];
        if (subscriptions.length === 0) {
            subsContainer.appendChild(empty('link', _('No subscriptions yet.')));
            return;
        }
        const tbody = E('tbody');
        subscriptions.forEach((sub, index) => {
            const st = state.subscriptionStates[sub.id] || {};
            let host = '';
            try {
                host = new URL(sub.url).host;
            } catch (e) {
                host = '';
            }
            tbody.appendChild(E('tr', {}, [
                E('td', {}, [
                    E('div', { class: 'cell-title' }, [sub.name, active === `subscription:${sub.id}` ? badge(_('Active'), 'default') : null]),
                    host ? E('div', { class: 'description mono' }, host) : null
                ]),
                E('td', { class: 'nowrap' }, st.used || st.total ? `${st.used || '—'} / ${st.total || '∞'}` : '—'),
                E('td', { class: 'nowrap' }, st.expire || '—'),
                E('td', { class: 'nowrap' }, st.success === false ? badge(_('Failed'), 'destructive') : (st.update || '—')),
                E('td', { class: 'actions' }, E('div', { class: 'row' }, [
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'refresh-cw', title: _('Update'), onClick: async () => {
                        if (JSON.stringify((state.config.subscriptions || []).find((s) => s.id === sub.id)) !== JSON.stringify(sub)) {
                            toast(_('Save the subscription first.'), 'warning');
                            return;
                        }
                        await run(api('subscription_update', { id: sub.id }));
                        const before = st.update || st.update_failed;
                        for (let i = 0; i < 40; i++) {
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                            const data = await api('load');
                            const next = (data.subscription_states || {})[sub.id] || {};
                            if ((next.update || next.update_failed) !== before) {
                                state.subscriptionStates = data.subscription_states || {};
                                renderSubscriptions();
                                toast(next.success ? _('Subscription %s is updated.', sub.name) : _('Subscription update failed, see the app log.'), next.success ? 'success' : 'error');
                                return;
                            }
                        }
                    } }),
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'pencil', title: _('Edit'), onClick: () => subscriptionDialog(sub, (edited) => {
                        subscriptions[index] = edited;
                        renderSubscriptions();
                        changed();
                    }) }),
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'trash', title: _('Delete'), onClick: async () => {
                        if (!await confirmDialog(_('Delete %s?', sub.name), _('The subscription is removed after saving.'), { confirm: _('Delete'), destructive: true })) {
                            return;
                        }
                        subscriptions.splice(index, 1);
                        renderSubscriptions();
                        changed();
                    } })
                ]))
            ]));
        });
        subsContainer.appendChild(E('div', { class: 'table-wrap' }, E('table', { class: 'table' }, [
            E('thead', {}, E('tr', {}, [E('th', {}, _('Name')), E('th', {}, _('Traffic')), E('th', {}, _('Expires')), E('th', {}, _('Updated')), E('th')])),
            tbody
        ])));
    };
    renderSubscriptions();

    const subscriptionsCard = card({
        title: _('Subscriptions'),
        action: btn(_('Add'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => subscriptionDialog(
            { id: newId(), name: '', url: '', info_url: '', user_agent: 'Mihomo/Exodus v{version}', send_hwid: true, prefer: 'remote' },
            (created) => {
                state.draft.subscriptions = (state.draft.subscriptions || []).concat([created]);
                renderSubscriptions();
                changed();
            }) }),
        content: subsContainer
    });

    const filesContainer = E('div', { class: 'contents' });
    const renderFiles = () => {
        clear(filesContainer);
        if (state.profiles.length === 0) {
            filesContainer.appendChild(empty('file-text', _('No files uploaded.')));
            return;
        }
        filesContainer.appendChild(E('div', { class: 'table-wrap' }, E('table', { class: 'table' }, [
            E('thead', {}, E('tr', {}, [E('th', {}, _('Name')), E('th', {}, _('Size')), E('th')])),
            E('tbody', {}, state.profiles.map((p) => E('tr', {}, [
                E('td', {}, E('div', { class: 'cell-title' }, [E('span', { class: 'mono' }, p.name), active === `file:${p.name}` ? badge(_('Active'), 'default') : null])),
                E('td', { class: 'nowrap' }, formatSize(p.size)),
                E('td', { class: 'actions' }, E('div', { class: 'row' }, [
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'download', title: _('Download'), onClick: async () => {
                        const data = await run(api('file_read', { path: `${state.dirs.profiles}/${p.name}` }));
                        download(p.name, data.content, 'application/yaml');
                    } }),
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'trash', title: _('Delete'), onClick: async () => {
                        if (!await confirmDialog(_('Delete %s?', p.name), _('The file is removed from the router.'), { confirm: _('Delete'), destructive: true })) {
                            return;
                        }
                        await run(api('profile_delete', { name: p.name }));
                        state.profiles = state.profiles.filter((x) => x.name !== p.name);
                        renderFiles();
                    } })
                ]))
            ])))
        ])));
    };
    renderFiles();

    const fileInput = E('input', { type: 'file', accept: '.yaml,.yml,.json,.txt', hidden: true });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) {
            return;
        }
        const name = file.name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[._ -]+/, '') || 'profile.yaml';
        const content = await file.text();
        fileInput.value = '';
        await run(api('profile_upload', { name: name, content: content }), _('%s is uploaded.', name));
        const data = await api('load');
        state.profiles = data.profiles || [];
        renderFiles();
    });

    const filesCard = card({
        title: _('Profile files'),
        action: [fileInput, btn(_('Upload'), { variant: 'outline', size: 'sm', icon: 'upload', onClick: () => fileInput.click() })],
        content: filesContainer
    });

    // a compact row: the text on the left, the button on the right
    const hardUpdateCard = card({
        title: _('Hard update'),
        description: _('Remove everything downloaded by the providers of the current profile, download the subscription again and restart. Files of local providers are kept.'),
        action: btn(_('Hard update'), { variant: 'destructive-outline', icon: 'refresh-cw', onClick: async () => {
            if (!await confirmDialog(_('Hard update?'), _('The proxy restarts and all providers are downloaded again.'), { confirm: _('Hard update'), destructive: true })) {
                return;
            }
            await run(api('service', { op: 'hard_update' }), _('Hard update started, the progress is in the app log.'));
        } })
    });

    return [
        pageHeader(_('Profiles'), _('Configs of the core: subscriptions of providers and your own files.')),
        E('div', { class: 'stack' }, [subscriptionsCard, filesCard, hardUpdateCard])
    ];
}

const DASHBOARDS = [
    ['https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard'],
    ['https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD'],
    ['https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD']
];

const RULE_TYPES = [
    ['DOMAIN-SUFFIX', _('Domain and subdomains')], ['DOMAIN', _('Domain')], ['DOMAIN-KEYWORD', _('Domain keyword')],
    ['GEOSITE', _('Geosite category')], ['IP-CIDR', _('Destination network')], ['GEOIP', _('Geoip country')],
    ['SRC-IP-CIDR', _('Source network')], ['DST-PORT', _('Destination port')], ['RULE-SET', _('Rule provider')], ['MATCH', _('Everything else')]
];

function rulesEditor() {
    const r = ref('mixin.rules');
    const container = E('div', { class: 'stack' });
    const rows = () => (Array.isArray(r.get()) ? r.get() : []);
    const targets = ['DIRECT', 'REJECT', 'REJECT-DROP', 'GLOBAL'].concat(state.proxies || []);
    const update = (next) => {
        r.set(next);
        render();
        changed();
    };
    const render = () => {
        clear(container);
        const list = rows();
        if (list.length === 0) {
            container.appendChild(empty('list', _('No rules yet.')));
        } else {
            container.appendChild(E('div', { class: 'table-wrap' }, E('table', { class: 'table' }, [
                E('thead', {}, E('tr', {}, [E('th', {}, _('On')), E('th', {}, _('Type')), E('th', {}, _('Value')), E('th', {}, _('Target')), E('th', { title: 'no-resolve' }, _('No resolve')), E('th')])),
                E('tbody', {}, list.map((rule, index) => E('tr', {}, [
                    E('td', {}, switchControl({ get: () => rule.enabled !== false, set: (v) => { rule.enabled = v; } })),
                    E('td', {}, input(objRef(rule, 'type'), { empty: '', values: RULE_TYPES })),
                    E('td', {}, input(objRef(rule, 'matcher'), { empty: '', placeholder: rule.type === 'MATCH' ? '' : 'example.com' })),
                    E('td', {}, input(objRef(rule, 'node'), { empty: '', values: targets })),
                    E('td', {}, checkbox(objRef(rule, 'no_resolve'))),
                    E('td', { class: 'actions' }, E('div', { class: 'row' }, [
                        btn(null, { variant: 'ghost', size: 'sm', icon: 'chevron-up', title: _('Up'), disabled: index === 0, onClick: () => {
                            const next = list.slice();
                            next.splice(index - 1, 0, next.splice(index, 1)[0]);
                            update(next);
                        } }),
                        btn(null, { variant: 'ghost', size: 'sm', icon: 'chevron-down', title: _('Down'), disabled: index === list.length - 1, onClick: () => {
                            const next = list.slice();
                            next.splice(index + 1, 0, next.splice(index, 1)[0]);
                            update(next);
                        } }),
                        btn(null, { variant: 'ghost', size: 'sm', icon: 'trash', title: _('Delete'), onClick: () => update(list.filter((_x, i) => i !== index)) })
                    ]))
                ])))
            ])));
        }
        container.appendChild(E('div', {}, btn(_('Add rule'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => update(rows().concat([
            { enabled: true, type: 'DOMAIN-SUFFIX', matcher: '', node: 'DIRECT', no_resolve: false }
        ])) })));
    };
    render();
    return container;
}

// the device id and the headers subscriptions get with it
function hwidCard() {
    const hwid = state.hwid || {};
    const headers = hwid.headers || {};
    const detected = (value) => (value ? E('span', { class: 'mono' }, value) : E('span', { class: 'muted' }, _('not detected')));
    return card({
        title: 'HWID',
        description: _('Panels with a device limit tell the router from other devices by these headers.'),
        content: [
            field(_('Device ID'), input(ref('config.hwid'), { empty: '', placeholder: hwid.generated || _('Automatic') }),
                _('Made from the hardware of the router, it stays the same after a reinstall.')),
            infoList([
                [E('span', { class: 'mono' }, 'x-device-os'), detected(headers['x-device-os'])],
                [E('span', { class: 'mono' }, 'x-ver-os'), detected(headers['x-ver-os'])],
                [E('span', { class: 'mono' }, 'x-device-model'), detected(headers['x-device-model'])]
            ])
        ]
    });
}

function pageSettings() {
    const d = () => state.draft;
    const proxyOn = () => d().proxy.enabled === true;
    const interfaces = (state.interfaces || []).map((i) => [i, i]);
    const proxies = state.proxies || [];

    const proxyTab = [
        card({
            title: _('Transparent proxy'),
            description: _('How the traffic of the local network gets to the core.'),
            content: [
                switchField(_('Enable'), _('Intercept the traffic of the devices chosen on the Status page. When off, only the core runs: its proxy port and the dashboard.'), ref('proxy.enabled')),
                dependOn(E('div', { class: 'grid-2' }, [
                    field('TCP', select(ref('proxy.tcp_mode'), [['redirect', 'Redirect'], ['tproxy', 'TPROXY']], { optional: true, placeholder: _('Off'), empty: '' }),
                        _('Redirect works everywhere. TPROXY for TCP needs port 443 of the router free: move the web interface of the router to another port.')),
                    field('UDP', select(ref('proxy.udp_mode'), [['tproxy', 'TPROXY']], { optional: true, placeholder: _('Off'), empty: '' }),
                        _('For QUIC, games and calls. Needs the Netfilter kernel modules component of the router.'))
                ]), proxyOn),
                switchField(_('DNS through the core'), _('DNS queries of the proxied devices go to the core, whatever DNS the router uses. Required for Fake-IP and domain rules.'), ref('proxy.dns_hijack'), proxyOn),
                switchField(_('Traffic of the router'), _('Proxy the connections of the router itself, for example of Entware applications. DNS of the router is not intercepted.'), ref('proxy.router_proxy'), proxyOn),
                switchField(_('Respect parental control'), _('Devices blocked in the router (no internet access, schedules) are not proxied, otherwise they would get internet through the core.'), ref('proxy.respect_parental_control'), proxyOn)
            ]
        }),
        card({
            title: _('Ports and exclusions'),
            description: _('Traffic that goes directly, past the core.'),
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('TCP ports to proxy'), input(ref('proxy.proxy_tcp_dport'), { type: 'portlist', empty: '0-65535', placeholder: _('All ports'), values: [
                        ['0-65535', _('All ports')], ['80 443 8080 8443', _('Web only')], ['21 22 80 110 143 194 443 465 853 993 995 8080 8443', _('Common ports')]
                    ] }), _('Ports and ranges separated by spaces, the other ports go directly.')),
                    field(_('UDP ports to proxy'), input(ref('proxy.proxy_udp_dport'), { type: 'portlist', empty: '0-65535', placeholder: _('All ports'), values: [
                        ['0-65535', _('All ports')], ['443 8443', _('QUIC only')]
                    ] }))
                ]),
                field(_('Direct IPv4 networks'), tags(ref('proxy.reserved_ip'), { type: 'ip4', placeholder: '203.0.113.0/24' }),
                    _('Destinations that never go through the proxy. Local and special networks are here by default.')),
                field(_('Direct IPv6 networks'), tags(ref('proxy.reserved_ip6'), { type: 'ip6', placeholder: '2001:db8::/32' }),
                    _('Used when IPv6 is on in the profile and the router has an IPv6 address.'))
            ]
        })
    ];

    const dscpTab = [
        card({
            title: _('DSCP marks'),
            info: [
                E('p', {}, E('strong', {}, _('How to mark traffic on Windows'))),
                _('gpedit.msc → Computer Configuration → Windows Settings → Policy-based QoS → Create new policy: choose the DSCP value and the application. Outside of a domain also set <code>HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS</code> "Do not use NLA" = "1" and reboot.')
            ],
            description: _('A device can mark its traffic with DSCP to choose the route per application. The marks are the same as in XKeen.'),
            content: [
                field(_('Direct'), tags(ref('proxy.dscp_bypass'), { type: 'dscp', number: true, placeholder: '62' }), _('Traffic with these marks goes directly (62 in XKeen).')),
                field(_('Proxy'), tags(ref('proxy.dscp_proxy'), { type: 'dscp', number: true, placeholder: '63' }), _('Traffic with these marks goes through the proxy even from excluded devices and on any port (63 in XKeen).')),
                E('div', { class: 'grid-2' }, [
                    field(_('Mark of the chosen proxy'), input(ref('proxy.dscp_force'), { number: true, type: 'dscp', placeholder: _('Off') }),
                        _('Traffic with this mark goes to one proxy, past the rules of the profile (61 in XKeen).')),
                    field(_('Chosen proxy'), input(ref('proxy.force_proxy'), { empty: '', values: proxies, placeholder: _('Off') }),
                        _('A proxy or a group of the running profile. Empty turns the mark off.'), () => d().proxy.dscp_force != null)
                ])
            ]
        })
    ];

    const coreTab = [
        card({
            title: 'Mihomo',
            description: _('Options merged over the profile. Mode, DNS mode and IPv6 always come from the profile.'),
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('Log level'), select(ref('mixin.log_level'), ['silent', 'error', 'warning', 'info', 'debug'].map((v) => [v, v]), { optional: true })),
                    field(_('Outbound interface'), select(ref('mixin.outbound_interface'), interfaces, { optional: true, placeholder: _('Automatic') }),
                        _('Linux name of the interface for the connections of the core: ppp0, eth3, nwg0 and so on.'))
                ]),
                field(_('Memory limit'), input(ref('core.gomemlimit'), { empty: '', placeholder: _('Half of RAM') }),
                    _('For example <code>128MiB</code>, <code>off</code> removes the limit. Without a limit the router may kill the core when memory runs out.'))
            ]
        }),
        card({
            title: _('Proxy port'),
            description: _('HTTP and SOCKS5 on one port, for devices and applications set up by hand.'),
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('Port'), input(ref('mixin.mixed_port'), { number: true, type: 'port', placeholder: _('From profile') }))
                ]),
                switchField(_('Authentication'), _('Ask for a username and password on the proxy port.'), ref('mixin.authentication')),
                dependOn(E('div', { class: 'grid-2' }, [
                    field(_('Username'), input(ref('mixin.username'), { empty: '' })),
                    field(_('Password'), input(ref('mixin.password'), { password: true, empty: '' }))
                ]), () => d().mixin.authentication === true)
            ]
        }),
        card({
            title: _('Dashboard'),
            description: _('Web panel of the core: choose proxies, watch connections and logs.'),
            action: [
                btn(_('Open'), { variant: 'outline', size: 'sm', icon: 'external-link', onClick: openDashboard }),
                btn(_('Update'), { variant: 'outline', size: 'sm', icon: 'download', onClick: () => run(api('update_dashboard'), _('The dashboard is updated.')) })
            ],
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('Panel'), select(ref('mixin.ui_url'), DASHBOARDS, { optional: true })),
                    field(_('API port'), input(ref('mixin.api_port'), { number: true, type: 'port', empty: 9090, placeholder: '9090' }))
                ]),
                field(_('API secret'), input(ref('mixin.api_secret'), { password: true, empty: '' }), _('The dashboard and other applications connect to the core with it.'))
            ]
        })
    ];

    const rulesTab = [
        card({
            title: _('Rules'),
            description: _('Added before the rules of the profile, they are checked from top to bottom. Target is DIRECT, REJECT or a proxy or group of the profile.'),
            content: rulesEditor()
        }),
        card({
            title: _('Mixin file'),
            description: _('Anything else — DNS servers, hosts, sniffer, rule providers — goes to the mixin file. It is merged into the profile on every start.'),
            footer: btn(_('Open in Editor'), { variant: 'outline', icon: 'file-text', onClick: () => {
                state.editorFile = 'mixin';
                location.hash = '#/editor';
            } })
        })
    ];

    const passwordOld = E('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
    const passwordNew = E('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
    const passwordRepeat = E('input', { class: 'input', type: 'password', autocomplete: 'new-password' });

    const serviceTab = [
        card({
            title: _('Service'),
            content: [
                field(_('Start delay, seconds'), input(ref('config.start_delay'), { number: true, type: 'uinteger', empty: 0, placeholder: '0' }),
                    _('Wait after the router boots, for example until the USB drive or the internet is ready.')),
                switchField(_('Scheduled restart'), _('Restart the service on a schedule, for example every night.'), ref('config.scheduled_restart')),
                field(_('Schedule'), input(ref('config.scheduled_restart_cron'), { type: 'cron', empty: '', placeholder: '0 3 * * *' }),
                    _('Cron format: minute hour day month weekday. <code>0 3 * * *</code> is every day at 3:00.'), () => d().config.scheduled_restart === true)
            ]
        }),
        hwidCard(),
        card({
            title: _('Logs'),
            content: [
                switchField(_('Clear logs at stop'), null, ref('log.clear_at_stop')),
                field(_('Log size limit, MB'), input(ref('log.max_size'), { number: true, type: 'uinteger', empty: 0, placeholder: _('No limit') }),
                    _('Logs are kept in RAM, a log over the limit is cleared.'))
            ]
        }),
        card({
            title: _('Web UI'),
            content: [
                field(_('Port'), input(ref('web.port'), { number: true, type: 'port', empty: 9099, placeholder: '9099' }), _('The web UI moves to the new port after saving.'))
            ]
        }),
        card({
            title: _('Password'),
            description: _('Password of this web UI. It can also be reset with exodus passwd over SSH.'),
            content: E('div', { class: 'grid-3' }, [
                field(_('Current password'), passwordOld),
                field(_('New password'), passwordNew),
                field(_('Repeat'), passwordRepeat)
            ]),
            footer: btn(_('Change password'), { variant: 'outline', onClick: async () => {
                if (passwordNew.value !== passwordRepeat.value) {
                    toast(_('Passwords do not match.'), 'error');
                    return;
                }
                if (passwordNew.value.length < 4) {
                    toast(_('The password is too short, at least 4 characters.'), 'error');
                    return;
                }
                await run(api('password', { old: passwordOld.value, new: passwordNew.value }), _('The password is changed.'));
                passwordOld.value = passwordNew.value = passwordRepeat.value = '';
            } })
        })
    ];

    return [
        pageHeader(_('Settings'), _('Only what makes sense to change on Keenetic, everything else is in the profile and the mixin file.')),
        tabs('settings', [
            ['proxy', _('Proxy'), proxyTab],
            ['dscp', 'DSCP', dscpTab],
            ['core', 'Mihomo', coreTab],
            ['rules', _('Rules'), rulesTab],
            ['service', _('Service'), serviceTab]
        ])
    ];
}

function pageEditor() {
    const files = state.files || {};
    const dirs = files.dirs || {};
    const choose = E('select', { class: 'select' });
    choose.appendChild(E('option', { value: '' }, _('Choose a file')));
    const group = (label, list, dir, title) => {
        if (!list || list.length === 0) {
            return;
        }
        choose.appendChild(E('optgroup', { label: label }, list.map((f) => E('option', { value: `${dir}/${f.name}` }, title ? title(f) : f.name))));
    };
    const subscriptionNames = {};
    for (const s of state.config.subscriptions || []) {
        subscriptionNames[`${s.id}.yaml`] = s.name;
    }
    choose.appendChild(E('optgroup', { label: 'Exodus' }, [
        E('option', { value: files.mixin }, _('Mixin file')),
        E('option', { value: files.run_profile }, _('Profile for startup (read only on restart)'))
    ]));
    group(_('Profile files'), files.profiles, dirs.profiles);
    group(_('Subscriptions'), files.subscriptions, dirs.subscriptions, (f) => subscriptionNames[f.name] || f.name);
    group(_('Rule providers'), files.rule_providers, dirs.rule_providers);
    group(_('Proxy providers'), files.proxy_providers, dirs.proxy_providers);

    const text = E('textarea', { class: 'textarea log', wrap: 'off', spellcheck: 'false', placeholder: _('Choose a file to edit.') });
    const load = async () => {
        text.value = '';
        if (choose.value) {
            text.value = (await run(api('file_read', { path: choose.value }))).content;
        }
    };
    choose.addEventListener('change', load);
    if (state.editorFile === 'mixin' && files.mixin) {
        choose.value = files.mixin;
        load();
    }
    state.editorFile = null;

    const saveFile = async (restart) => {
        if (!choose.value) {
            toast(_('Choose a file first.'), 'warning');
            return;
        }
        await run(api('file_write', { path: choose.value, content: text.value }), _('The file is saved.'));
        if (restart) {
            await serviceOp('restart');
        }
    };

    return [
        pageHeader(_('Editor'), _('The mixin file, profiles, subscriptions and providers as plain text.')),
        card({
            content: [field(_('File'), choose), text],
            footer: E('div', { class: 'row end', style: { width: '100%' } }, [
                btn(_('Save'), { variant: 'outline', onClick: () => saveFile(false) }),
                btn(_('Save & Restart'), { onClick: () => saveFile(true) })
            ])
        })
    ];
}

function pageLogs() {
    const logView = (name) => {
        const text = E('textarea', { class: 'textarea log', wrap: 'off', readonly: true, spellcheck: 'false' });
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
                /* the next poll tries again */
            }
        };
        text.addEventListener('scroll', () => {
            follow = text.scrollTop + text.clientHeight >= text.scrollHeight - 20;
        });
        load();
        state.timers.push(setInterval(load, 5000));
        return card({
            content: [
                E('div', { class: 'row end' }, [
                    btn(_('Scroll to bottom'), { variant: 'ghost', size: 'sm', icon: 'arrow-down', onClick: () => {
                        follow = true;
                        text.scrollTop = text.scrollHeight;
                    } }),
                    btn(_('Clear'), { variant: 'outline', size: 'sm', icon: 'trash', onClick: async () => {
                        await run(api('log_clear', { name: name }));
                        text.value = '';
                    } })
                ]),
                text
            ]
        });
    };

    return [
        pageHeader(_('Logs'), _('Logs of Exodus and the core, kept in RAM.'), [
            btn(_('Debug report'), { variant: 'outline', icon: 'bug', onClick: async () => {
                const data = await run(api('debug'));
                download('exodus-debug.md', data.content, 'text/markdown');
                toast(_('The report hides server addresses, passwords and subscription links. Check it before you share it.'), 'info');
            } })
        ]),
        tabs('logs', [
            ['app', _('Exodus'), logView('app')],
            ['core', _('Core'), logView('core')]
        ])
    ];
}

function pageUpdates() {
    const container = E('div', { class: 'contents' }, loader());
    const logView = E('textarea', { class: 'textarea', rows: 14, wrap: 'off', readonly: true, spellcheck: 'false' });
    const pollLog = async () => {
        const data = await api('log_read', { name: 'update' });
        logView.value = data.content;
        logView.scrollTop = logView.scrollHeight;
        const lines = data.content.trim().split('\n');
        const last = lines[lines.length - 1] || '';
        return last === 'success' || last.startsWith('error:');
    };
    pollLog().catch(() => {});

    const force = state.forceUpdateCheck === true;
    state.forceUpdateCheck = false;
    api('check_update', force ? { force: true } : {}).then((info) => {
        state.update = info;
        renderAboutButton();
        clear(container);
        let available = false;
        const status = (current, next) => {
            if (next == null) {
                return badge(_('Unknown'), 'outline');
            }
            if (!current) {
                available = true;
                return badge(_('Not installed'), 'warning');
            }
            if (newer(current, next)) {
                available = true;
                return badge(_('Update available'), 'warning');
            }
            return badge(_('Up to date'), 'success');
        };
        const rows = [
            ['Exodus', info.app, info.app_latest],
            [`${_('Core')} · ${CORE_TITLES[info.core_type] || info.core_type}`, info.core, info.core_latest]
        ];
        const table = E('div', { class: 'table-wrap' }, E('table', { class: 'table' }, [
            E('thead', {}, E('tr', {}, [E('th', {}, _('Component')), E('th', {}, _('Installed')), E('th', {}, _('Latest')), E('th', {}, _('Status'))])),
            E('tbody', {}, rows.map(([name, current, next]) => E('tr', {}, [
                E('td', {}, E('div', { class: 'cell-title' }, name)), E('td', { class: 'mono' }, current || '—'), E('td', { class: 'mono' }, next || '—'), E('td', {}, status(current, next))
            ])))
        ]));
        const lowSpace = { value: info.free_space != null && info.core_size != null && info.free_space < info.core_size * 1.2 };
        const updateButton = btn(_('Update'), { icon: 'download', disabled: !available, onClick: async () => {
            const message = lowSpace.value
                ? _('The current core is removed before the new one is installed. If the update fails, the proxy does not work until the update is done again.')
                : _('The proxy restarts during the update.');
            if (!await confirmDialog(_('Update now?'), message, { confirm: _('Update') })) {
                return;
            }
            await run(api('update', { low_space: lowSpace.value }));
            logView.value = '';
            const timer = setInterval(async () => {
                try {
                    if (await pollLog()) {
                        clearInterval(timer);
                        toast(E('span', {}, [_('Update finished.'), ' ', E('a', { href: '#', onclick: (ev) => { ev.preventDefault(); location.reload(); } }, _('Reload the page'))]));
                    }
                } catch (e) {
                    /* the web ui restarts during the update */
                }
            }, 2000);
            state.timers.push(timer);
        } });
        append(container, card({
            title: _('Versions'),
            description: _('Exodus and the core are downloaded from GitHub into Entware. Settings, profiles and subscriptions are kept.'),
            action: btn(_('Check again'), { variant: 'outline', size: 'sm', icon: 'refresh-cw', onClick: () => {
                state.forceUpdateCheck = true;
                render();
            } }),
            content: [
                table,
                infoList([
                    [_('Downloads'), info.gh_proxy ? _('through gh-proxy at %s', info.gh_proxy) : _('directly from GitHub')],
                    [_('Architecture'), E('span', { class: 'mono' }, info.arch || '—')],
                    [_('Free space'), `${formatSize(info.free_space)} · ${_('core')} ${formatSize(info.core_size)}`]
                ]),
                E('p', { class: 'description' }, _('The core and the gh-proxy chosen in the installer are kept, run the installer again to change them.')),
                switchField(_('Low flash space mode'), _('Remove the current core before installing the new one, when the update fails for lack of space. The proxy does not work until the new core is installed.'), objRef(lowSpace, 'value'))
            ],
            footer: E('div', { class: 'row end', style: { width: '100%' } }, updateButton)
        }));
    }).catch((e) => {
        clear(container);
        container.appendChild(alertBox('destructive', _('Failed to check for updates'), e.message));
    });

    return [
        pageHeader(_('Updates'), _('New versions of Exodus and the core.')),
        E('div', { class: 'stack' }, [container, card({ title: _('Update log'), content: logView })])
    ];
}

// ---------- build info ----------

function newer(current, next) {
    return next != null && (!current || (current !== next && current.replace(/^v/, '') !== next.replace(/^v/, '')));
}

function updateAvailable(info) {
    return !!info && (newer(info.app, info.app_latest) || newer(info.core, info.core_latest));
}

// github is asked at most every few hours, the router keeps the answer
async function checkUpdates() {
    try {
        state.update = await api('check_update');
    } catch (e) {
        return;
    }
    renderAboutButton();
}

let aboutKey = null;

// the version in the navbar, it pulses when an update is available
function renderAboutButton() {
    const button = document.getElementById('about');
    const version = (state.status && state.status.app_version) || (state.update && state.update.app);
    const update = updateAvailable(state.update);
    const key = JSON.stringify([state.loginShown, version, update]);
    if (key === aboutKey) {
        return;
    }
    aboutKey = key;
    button.hidden = state.loginShown || !version;
    button.classList.toggle('update', update);
    button.title = update ? _('Update available') : _('Build info');
    append(clear(button), [update ? E('span', { class: 'dot' }) : icon('git-branch'), version || '']);
}

// the clipboard api needs https, the web ui of the router is http
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        /* falls back to a selection */
    }
    const area = E('textarea', { style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (e) {
        copied = false;
    }
    area.remove();
    return copied;
}

async function openAbout() {
    let info;
    try {
        info = await api('about');
    } catch (e) {
        if (e.message !== _('Login required')) {
            toast(e.message, 'error');
        }
        return;
    }
    const repo = `https://github.com/${info.repository}`;
    const core = CORE_TITLES[info.core_type] || info.core_type;
    const firmware = info.firmware ? `KeeneticOS ${info.firmware}` : '';
    const text = [
        `Exodus ${info.app} (${[info.ref, info.commit.substring(0, 12)].filter(Boolean).join(', ')})`,
        `${_('Installed')}: ${info.installed || '—'}`,
        `${_('Core')}: ${core} ${info.core || '—'}`,
        `${_('Router')}: ${[info.model, firmware, info.arch].filter(Boolean).join(', ') || '—'}`
    ].join('\n');
    const tile = (iconName, title, value) => E('div', { class: 'build-tile' }, [
        E('div', { class: 'build-tile-title' }, [icon(iconName), title]),
        E('div', { class: 'build-tile-value' }, value)
    ]);
    const missing = () => E('span', { class: 'muted' }, '—');
    const update = state.update;
    const versions = update ? [
        newer(update.app, update.app_latest) ? `Exodus ${update.app || '—'} → ${update.app_latest}` : null,
        newer(update.core, update.core_latest) ? `${core} ${update.core || '—'} → ${update.core_latest}` : null
    ].filter(Boolean) : [];
    const logoBadge = E('span', { class: 'badge badge-default' }, [logo(), info.app || '—']);
    logoBadge.firstChild.setAttribute('class', 'badge-logo');

    openDialog({
        title: [E('span', { class: 'logo-tile' }, logo()), _('Build info')],
        wide: true,
        content: [
            E('div', { class: 'build-panel' }, [
                E('div', { class: 'build-head' }, [
                    logoBadge,
                    E('span', { class: 'badge badge-outline' }, [icon('git-branch'), (info.ref || '—').toUpperCase()]),
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'copy', title: _('Copy'), onClick: async () => {
                        const copied = await copyText(text);
                        toast(copied ? _('Copied.') : _('Copying is not available in this browser.'), copied ? 'success' : 'warning');
                    } })
                ]),
                E('div', { class: 'separator' }),
                E('div', { class: 'build-tiles' }, [
                    tile('calendar', _('Installed'), info.installed || missing()),
                    tile('hash', _('Commit'), info.commit
                        ? E('a', { href: `${repo}/commit/${info.commit}`, target: '_blank', rel: 'noopener', title: info.commit }, info.commit.substring(0, 12))
                        : missing())
                ])
            ]),
            E('div', { class: 'build-tiles' }, [
                tile('cpu', _('Core'), info.core ? [E('div', {}, core), E('div', {}, info.core)] : missing()),
                tile('router', _('Router'), info.model || firmware ? [E('div', {}, info.model || '—'), E('div', {}, [firmware, info.arch ? ` · ${info.arch}` : ''])] : missing())
            ]),
            versions.length > 0 ? alertBox('warning', _('Update available'), E('div', { class: 'stack', style: { gap: '8px' } }, [
                E('div', { class: 'mono' }, versions.map((v) => E('div', {}, v))),
                E('div', {}, btn(_('Open Updates'), { variant: 'outline', size: 'sm', icon: 'arrow-up-circle', onClick: () => {
                    closeDialog();
                    location.hash = '#/updates';
                } }))
            ])) : null,
            E('div', { class: 'build-links' }, [
                E('a', { class: 'btn btn-outline', href: `${repo}/issues`, target: '_blank', rel: 'noopener' }, [icon('bug'), _('Issues')]),
                E('a', { class: 'btn btn-outline', href: `${repo}/tree/${info.ref || 'keenetic'}`, target: '_blank', rel: 'noopener' }, [icon('github'), 'GitHub'])
            ])
        ]
    });
}

// ---------- router ----------

const pages = [
    ['status', _('Status'), pageStatus, async () => {
        await refreshStatus();
    }],
    ['profiles', _('Profiles'), pageProfiles, async () => {
        const files = await api('files');
        state.dirs = files.dirs || {};
    }],
    ['settings', _('Settings'), pageSettings, async () => {
        const [interfaces, proxies, hwid] = await Promise.all([
            api('interfaces').catch(() => ({ interfaces: [] })),
            api('proxies').catch(() => ({ proxies: [] })),
            api('hwid').catch(() => ({}))
        ]);
        state.interfaces = interfaces.interfaces || [];
        state.proxies = proxies.proxies || [];
        state.hwid = hwid;
    }],
    ['editor', _('Editor'), pageEditor, async () => {
        state.files = await api('files');
    }],
    ['logs', _('Logs'), pageLogs, null],
    ['updates', _('Updates'), pageUpdates, null]
];

function currentPage() {
    const name = (location.hash || '').replace(/^#\/?/, '');
    return pages.find((p) => p[0] === name) || pages[0];
}

function renderMenu() {
    const menu = clear(document.getElementById('menu'));
    const current = currentPage()[0];
    for (const [name, title] of pages) {
        menu.appendChild(E('a', { href: `#/${name}`, class: name === current ? 'active' : null, 'aria-current': name === current ? 'page' : null }, title));
    }
}

let renderToken = 0;

async function render() {
    // the login form stays until the password is entered, start() renders the page then
    if (state.loginShown) {
        return;
    }
    const token = ++renderToken;
    state.timers.forEach((t) => clearInterval(t));
    state.timers = [];
    dependents = [];
    liveViews = [];
    const content = clear(document.getElementById('content'));
    content.appendChild(loader());
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
        if (token === renderToken && e.message !== _('Login required')) {
            clear(content).appendChild(alertBox('destructive', _('Failed to load the page'), e.message));
        }
        return;
    }
    // a newer navigation started while this one was loading
    if (token !== renderToken) {
        return;
    }
    append(clear(content), page[2]());
    changed();
}

let lastHash = location.hash;
window.addEventListener('hashchange', async () => {
    if (location.hash === lastHash) {
        return;
    }
    if (isDirty()) {
        const target = location.hash;
        history.replaceState(null, '', lastHash || '#/status');
        if (!await confirmDialog(_('Leave the page?'), _('There are unsaved changes, they will be lost.'), { confirm: _('Leave'), destructive: true })) {
            return;
        }
        state.draft = clone(state.config);
        state.invalid.clear();
        updateDirty();
        history.replaceState(null, '', target);
    }
    lastHash = location.hash;
    closeDialog();
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
    closeDialog();
    renderAboutButton();
    document.getElementById('logout').hidden = true;
    document.getElementById('menu').hidden = true;
    document.getElementById('savebar').hidden = true;
    const password = E('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
    const form = E('form', { class: 'card' }, [
        E('div', { class: 'card-header' }, [
            E('span', { class: 'logo-tile large' }, logo()),
            E('div', { class: 'card-title' }, 'Exodus'),
            E('div', { class: 'card-description' }, _('Enter the password of the web UI. It is set by the installer, reset it with exodus passwd over SSH.'))
        ]),
        E('div', { class: 'card-content' }, field(_('Password'), password)),
        E('div', { class: 'card-footer' }, E('button', { class: 'btn btn-default', type: 'submit', style: { width: '100%' } }, _('Sign in')))
    ]);
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
            await api('login', { password: password.value });
        } catch (e) {
            toast(e.message === 'wrong password' ? _('Invalid password') : e.message, 'error');
            password.select();
            return;
        }
        clear(document.getElementById('toaster'));
        start();
    });
    append(clear(document.getElementById('content')), E('div', { class: 'login' }, form));
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
        checkUpdates();
    }
}

// ---------- init ----------

function effectiveTheme() {
    const chosen = document.documentElement.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') {
        return chosen;
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function renderThemeButton() {
    const button = document.getElementById('theme');
    append(clear(button), icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'));
    button.title = effectiveTheme() === 'dark' ? _('Light theme') : _('Dark theme');
}

document.querySelectorAll('[data-logo]').forEach((el) => el.appendChild(logo()));
renderThemeButton();
document.getElementById('theme').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    storageSet('exodus.theme', next);
    renderThemeButton();
});
if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) {
        media.addEventListener('change', renderThemeButton);
    }
}

const langButton = document.getElementById('lang');
langButton.textContent = lang === 'ru' ? 'EN' : 'RU';
langButton.title = lang === 'ru' ? 'English' : 'Русский';
langButton.addEventListener('click', () => {
    storageSet('exodus.lang', lang === 'ru' ? 'en' : 'ru');
    location.reload();
});

const logoutButton = document.getElementById('logout');
logoutButton.title = _('Log out');
logoutButton.setAttribute('aria-label', _('Log out'));
logoutButton.appendChild(icon('log-out'));
logoutButton.addEventListener('click', async () => {
    if (isDirty() && !await confirmDialog(_('Log out?'), _('There are unsaved changes, they will be lost.'), { confirm: _('Log out'), destructive: true })) {
        return;
    }
    await api('logout').catch(() => {});
    state.config = null;
    state.draft = null;
    updateDirty();
    showLogin();
});

renderSavebar();
document.getElementById('about').addEventListener('click', openAbout);
setInterval(() => {
    if (!state.loginShown) {
        checkUpdates();
    }
}, 3 * 3600 * 1000);
document.getElementById('dialog').addEventListener('mousedown', (ev) => {
    if (ev.target.id === 'dialog') {
        closeDialog();
    }
});
document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
        closeDialog();
    }
});

start();

})();
