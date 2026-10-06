'use strict';

// Exodus controls inside the native Merlin Web Admin.
// the config is edited as a draft copy and saved as a whole

(function () {

// ---------- native language and canvas ----------

const firmwareLang = ((window.ExodusBootstrap || {}).lang || '').toLowerCase();
const lang = firmwareLang === 'ru' ? 'ru' : 'en';
const exodusRoot = document.getElementById('exodus-root');
exodusRoot.lang = lang;

function syncCanvasHeight() {
    const top = exodusRoot.getBoundingClientRect().top + window.scrollY;
    const footer = document.getElementById('footer');
    let height = Math.max(0, window.innerHeight - top - (footer ? footer.offsetHeight : 0) - 20);
    // Merlin state.js sizes native FormTitle from the menu, minus a 15px footer gap.
    for (const id of ['mainMenu', 'subMenu']) {
        const menu = document.getElementById(id);
        if (menu) height = Math.max(height, menu.getBoundingClientRect().bottom + window.scrollY - top - 15);
    }
    exodusRoot.style.setProperty('--exodus-canvas-min-height', Math.ceil(height) + 'px');
}

let canvasFrame = null;
function scheduleCanvasHeight() {
    if (canvasFrame !== null) return;
    canvasFrame = requestAnimationFrame(() => { canvasFrame = null; syncCanvasHeight(); });
}
window.addEventListener('load', scheduleCanvasHeight);
window.addEventListener('resize', scheduleCanvasHeight);
if (typeof ResizeObserver !== 'undefined') {
    const canvasObserver = new ResizeObserver(scheduleCanvasHeight);
    const firmwareIds = ['TopBanner', 'mainMenu', 'subMenu', 'tabMenu', 'footer'];
    function observeFirmware() {
        for (const id of firmwareIds) {
            const element = document.getElementById(id);
            if (element) canvasObserver.observe(element);
        }
    }
    observeFirmware();
    window.addEventListener('pagehide', () => canvasObserver.disconnect());
    window.addEventListener('pageshow', () => { observeFirmware(); scheduleCanvasHeight(); });
}
syncCanvasHeight();

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
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
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
    // Errors and messages with links remain available until dismissed.
    if (type !== 'error' && !el.querySelector('a')) setTimeout(() => el.remove(), 5000);
    return el;
}

// ---------- api ----------

async function api(action, params) {
    return window.ExodusMerlin.request(action, params || {});
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
    groups: [],
    nodes: [],
    hwid: {},
    dirs: {},
    files: {},
    invalid: new Set(),
    timers: [],
    pagePollers: [],
    statusTimer: null,
    sessionExpired: false,
    editorFile: null
};

function pollPage(callback) {
    state.pagePollers.push(callback);
    state.timers.push(setInterval(callback, 5000));
}

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

// subscriptions are updated in the background: their state and names are read again, a draft with changes stays
async function reloadStates() {
    const data = await api('load');
    state.subscriptionStates = data.subscription_states || {};
    state.profiles = data.profiles || [];
    if (!isDirty()) {
        state.config = data.config;
        state.draft = clone(data.config);
    }
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
        state.status = null;
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
    const refreshing = ['refresh-cw', 'rotate-cw'].includes(opts.icon)
        || (opts.icon === 'download' && /update|обнов/i.test(label || opts.title || ''));
    const actionIcon = opts.icon ? icon(refreshing && opts.icon === 'download' ? 'refresh-cw' : opts.icon) : null;
    if (refreshing) actionIcon.classList.add('refresh-icon');
    const el = E('button', { type: opts.submit ? 'submit' : 'button', class: classes.join(' '), title: opts.title || null, disabled: opts.disabled || null, 'aria-label': label ? null : opts.title }, [
        actionIcon,
        label ? E('span', {}, label) : null
    ]);
    if (opts.onClick) {
        el.addEventListener('click', async (ev) => {
            el.disabled = true;
            el.setAttribute('aria-busy', 'true');
            if (refreshing) { el.classList.add('loading'); actionIcon.classList.add('spin'); }
            const spinner = icon('loader', 'spin');
            // a spinner only for actions that take a while
            const timer = setTimeout(() => {
                el.classList.add('loading');
                if (!refreshing) el.prepend(spinner);
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
                if (actionIcon) actionIcon.classList.remove('spin');
                el.setAttribute('aria-busy', 'false');
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
        opts.title ? E('h2', { class: 'card-title' }, [opts.title, opts.info ? infoButton(opts.title, opts.info) : null]) : null,
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
    return E('div', { class: 'loader skeleton', role: 'status', 'aria-label': _('Loading…') }, [
        E('span', { class: 'visually-hidden' }, _('Loading…')),
        E('div', { class: 'skeleton-line' }), E('div', { class: 'skeleton-line' }), E('div', { class: 'skeleton-line' })
    ]);
}

function empty(iconName, text, description, actions) {
    return E('div', { class: 'empty' }, [icon(iconName), E('div', {}, [
        E('strong', {}, text), description ? E('p', { class: 'empty-description' }, description) : null,
        actions ? E('div', { class: 'empty-actions' }, actions) : null
    ])]);
}

function infoList(rows) {
    return E('dl', { class: 'info-list' }, rows.filter(Boolean).map(([title, value]) => [E('dt', {}, title), E('dd', {}, value)]));
}

// ---------- dialog ----------

let dialogClose = null;
let dialogTrigger = null;

function openDialog(opts) {
    hideHelp();
    const overlay = document.getElementById('dialog');
    if (overlay.hidden) dialogTrigger = document.activeElement;
    const titleId = nextId();
    const box = E('div', { class: `dialog${opts.wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, [
        E('div', { class: 'dialog-header' }, [
            E('h2', { class: 'dialog-title', id: titleId }, opts.title),
            opts.description ? E('p', { class: 'dialog-description' }, opts.description) : null
        ]),
        opts.content ? E('div', { class: 'stack' }, opts.content) : null,
        opts.footer ? E('div', { class: 'dialog-footer' }, opts.footer) : null,
        E('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm dialog-close', title: _('Close'), onclick: () => closeDialog() }, icon('x'))
    ]);
    append(clear(overlay), box);
    overlay.hidden = false;
    for (const id of ['content','menu','savebar']) document.getElementById(id).inert = true;
    dialogClose = opts.onClose || null;
    const focus = box.querySelector('.stack input, .stack select') || box.querySelector('.dialog-footer .btn:last-child') || box.querySelector('.dialog-close');
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
    for (const id of ['content','menu','savebar']) document.getElementById(id).inert = false;
    clear(overlay);
    if (dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus();
    dialogTrigger = null;
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
    liveViews.forEach(update => update());
}

function markInvalid(el, id, invalid) {
    el.classList.toggle('invalid', invalid);
    el.setAttribute('aria-invalid', String(invalid));
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
    if (control.getAttribute('role') === 'radiogroup') control.setAttribute('aria-label', label);
    const title = label ? E('label', { class: 'label', for: labelTarget(control) }, label) : null;
    const descriptionId = description ? nextId() : null;
    const targetId = labelTarget(control);
    if (descriptionId && targetId) {
        const target = control.id === targetId ? control : control.querySelector('#' + targetId);
        if (target) target.setAttribute('aria-describedby', descriptionId);
    }
    return dependOn(E('div', { class: 'field' }, [E('div', {class: 'label-row'}, [title, info ? infoButton(label, info) : null]),
        E('div', { class: 'field-control' }, [control, description ? E('p', { id: descriptionId, class: 'description', html: description }) : null])
    ]), depends);
}

// One viewport-bound help popup; hover and keyboard focus share the same copy.
let helpPopup = null, helpAnchor = null, helpCloseTimer = null;
function hideHelp() {
    clearTimeout(helpCloseTimer);
    if (helpPopup) helpPopup.hidden = true;
    if (helpAnchor) helpAnchor.setAttribute('aria-expanded', 'false');
    helpAnchor = null;
}

function positionHelp() {
    if (!helpPopup || helpPopup.hidden || !helpAnchor) return;
    const rect = helpAnchor.getBoundingClientRect();
    if (!helpAnchor.isConnected || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
        hideHelp(); return;
    }
    const scale = exodusRoot.getBoundingClientRect().width / exodusRoot.offsetWidth || 1;
    helpPopup.style.maxWidth = (innerWidth - 24) / scale + 'px';
    helpPopup.style.maxHeight = (innerHeight - 24) / scale + 'px';
    const bounds = helpPopup.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, innerWidth - bounds.width - 12));
    const top = rect.bottom + bounds.height + 10 <= innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - bounds.height - 8);
    helpPopup.style.left = left / scale + 'px'; helpPopup.style.top = top / scale + 'px';
}

function infoButton(title, paragraphs) {
    const source = E('div', {class: 'help-source', hidden: true, id: nextId()}, paragraphs.map(p => typeof p === 'string' ? E('p', {html: p}) : p));
    const marker = E('button', {class: 'info-btn', type: 'button', 'aria-label': _('Help: %s', title || _('Settings')), 'aria-describedby': source.id, 'aria-expanded': 'false'}, icon('info'));
    const interactive = !!source.querySelector('a[href]');
    if (interactive) marker.setAttribute('aria-haspopup', 'dialog');
    const show = () => {
        clearTimeout(helpCloseTimer);
        if (!helpPopup) {
            helpPopup = E('div', {id: 'help-popover', class: 'help-popover', role: 'tooltip', hidden: true});
            exodusRoot.appendChild(helpPopup);
            helpPopup.addEventListener('mouseenter', () => clearTimeout(helpCloseTimer));
            helpPopup.addEventListener('mouseleave', () => {helpCloseTimer = setTimeout(hideHelp, 140);});
            helpPopup.addEventListener('focusin', () => clearTimeout(helpCloseTimer));
            helpPopup.addEventListener('focusout', event => {
                if (!helpPopup.contains(event.relatedTarget)) helpCloseTimer = setTimeout(hideHelp, 140);
            });
        }
        if (helpAnchor && helpAnchor !== marker) helpAnchor.setAttribute('aria-expanded', 'false');
        helpAnchor = marker; marker.setAttribute('aria-expanded', 'true');
        helpPopup.setAttribute('role', interactive ? 'dialog' : 'tooltip');
        helpPopup.setAttribute('aria-label', title || _('Settings'));
        append(clear(helpPopup), [E('strong', {}, title), E('div', {class: 'info-text'}, Array.from(source.children, node => node.cloneNode(true)))]);
        helpPopup.hidden = false;
        positionHelp();
    };
    marker.addEventListener('mouseenter', show); marker.addEventListener('focus', show);
    marker.addEventListener('click', show);
    marker.addEventListener('mouseleave', () => {helpCloseTimer = setTimeout(hideHelp, 140);});
    marker.addEventListener('blur', () => {helpCloseTimer = setTimeout(hideHelp, 140);});
    marker.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {ev.stopPropagation(); hideHelp();}
        if (ev.key === 'ArrowDown' && helpAnchor === marker) {
            const link = helpPopup.querySelector('a[href]');
            if (link) {ev.preventDefault(); link.focus();}
        }
    });
    return E('span', {class: 'help-tip'}, [marker, source]);
}

function compactDescriptions(section, except = []) {
    for (const item of section.querySelectorAll('.field, .field-switch')) {
        const label = item.querySelector('.label');
        const description = item.querySelector('.field-control > .description');
        if (!description || except.includes(label?.textContent)) continue;
        description.hidden = true;
        item.querySelector('.label-row').appendChild(infoButton(label?.textContent, [description.innerHTML]));
    }
}

function switchControl(r) {
    const el = E('input', { type: 'checkbox', class: 'checkbox switch' });
    el.checked = r.get() === true;
    el.addEventListener('change', () => { r.set(el.checked); changed(); });
    return el;
}

// an option that is on or off: text on the left, switch on the right
function switchField(label, description, r, depends, compact = false) {
    const control = switchControl(r);
    control.id = nextId();
    return dependOn(E('div', { class: 'field-switch' }, [
        E('div', {class: 'label-row switch-label'}, [control, E('label', { class: 'label', for: control.id }, label), compact && description ? infoButton(label, [description]) : null]),
        E('div', { class: 'field-control' }, [
            description && !compact ? E('p', { class: 'description', html: description }) : null
        ])
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

// options: [[value, label]] or {group, options}; opts.optional adds an empty choice (null keeps the value of the profile)
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
    const add = (parent, value, label) => {
        parent.appendChild(E('option', { value: value }, label));
        if (value === current) {
            found = true;
        }
    };
    // an entry is [value, label] or {group, options} for an optgroup
    for (const entry of options) {
        if (Array.isArray(entry)) {
            add(el, entry[0], entry[1]);
        } else if (entry.options.length > 0) {
            const group = E('optgroup', { label: entry.group });
            entry.options.forEach(([value, label]) => add(group, value, label));
            el.appendChild(group);
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
    return list ? E('div', { class: 'input-list' }, [el, list.el]) : el;
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
    const buttons = options.map(([value, label]) => E('button', {type:'button',role:'radio',class:'tabs-trigger',onclick:()=>{
        r.set(value); sync(); changed();
    }}, label));
    const sync = () => {
        buttons.forEach((button, i) => {
            const active = r.get() === options[i][0];
            button.classList.toggle('active', active);
            button.setAttribute('aria-checked', String(active));
            button.tabIndex = active ? 0 : -1;
        });
    };
    append(el, buttons);
    compositeKeys(el, buttons);
    sync();
    return el;
}

function compositeKeys(group, buttons) {
    group.addEventListener('keydown', event => {
        const index = buttons.indexOf(document.activeElement);
        if (index < 0) return;
        let target;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = (index + 1) % buttons.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = (index + buttons.length - 1) % buttons.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = buttons.length - 1;
        if (target == null) return;
        event.preventDefault(); buttons[target].click(); buttons[target].focus();
    });
}

// tabs keep their choice while the page is open
const tabChoice = {};

function tabs(id, list) {
    const selected = tabChoice[id] && list.some((t) => t[0] === tabChoice[id]) ? tabChoice[id] : list[0][0];
    const triggers = E('div', { class: 'tabs-list', role: 'tablist', 'aria-label': _(id === 'settings' ? 'Settings' : 'Logs') });
    const container = E('div', { class: 'tabs' }, triggers);
    const panes = [];
    for (const [key, title, content] of list) {
        const paneId=nextId(), triggerId=nextId();
        const pane = E('div', { id:paneId, class: 'stack', role: 'tabpanel', 'aria-labelledby':triggerId, hidden: key !== selected }, content);
        const trigger = E('button', { id:triggerId, type: 'button', role: 'tab', tabindex:key===selected?0:-1, 'aria-controls':paneId, class: `tabs-trigger${key === selected ? ' active' : ''}`, 'aria-selected': key === selected ? 'true' : 'false' }, title);
        trigger.addEventListener('click', () => {
            tabChoice[id] = key;
            triggers.querySelectorAll('.tabs-trigger').forEach((t) => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
                t.tabIndex=-1;
            });
            trigger.classList.add('active');
            trigger.setAttribute('aria-selected', 'true');
            trigger.tabIndex=0;
            panes.forEach((p) => { p.hidden = true; });
            pane.hidden = false;
            hideHelp();
            if (id === 'logs') state.pagePollers.forEach(poll => poll());
        });
        triggers.appendChild(trigger);
        panes.push(pane);
        container.appendChild(pane);
    }
    compositeKeys(triggers, Array.from(triggers.children));
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

async function resetDraft() {
    if (!await confirmDialog(_('Discard unsaved changes?'), _('Your saved settings will be restored.'), {confirm: _('Reset'), destructive: true})) return;
    state.draft = clone(state.config);
    state.invalid.clear();
    render();
}

async function save(apply) {
    if (state.invalid.size > 0) {
        toast(_('Some fields are invalid, fix them before saving.'), 'error');
        const search = document.getElementById('settings-search');
        if (search && search.value) { search.value = ''; search.dispatchEvent(new Event('input')); }
        const invalid = document.querySelector('#content .invalid');
        if (invalid) {
            const pane = invalid.closest('[role="tabpanel"]');
            if (pane?.hidden) document.getElementById(pane.getAttribute('aria-labelledby'))?.click();
            invalid.focus();
        }
        return;
    }
    await run(api('config_set', { config: state.draft, apply: apply }), apply === 'restart' ? _('Settings are saved, the service is restarting.') : _('Settings are saved.'));
    state.config = clone(state.draft);
    updateDirty();
    if (apply === 'restart') {
        setTimeout(refreshStatus, 3000);
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
    // zashboard and metacubexd keep the backends they know and take a new secret of the link only on their setup page, yacd reads the query
    const setup = /yacd/i.test(info.ui_url || '') ? '' : `#/setup?${query}`;
    const url = `${protocol}://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${port}${path}?${query}${setup}`;
    window.open(url, '_blank', 'noopener');
}

// the expire date of the provider: 0 and dates from 2099 on mean no expiry, a state of an older version has the date as text
function expireText(st) {
    if (typeof st.expire_ts !== 'number') {
        return st.expire || '—';
    }
    if (st.expire_ts === 0 || st.expire_ts >= 4070908800) {
        return '∞';
    }
    const date = new Date(st.expire_ts * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
        return `Wi-Fi: ${ap ? `${ap.ssid || ap.description || value}${ap.band ? ` (${ap.band})` : ''}` : value}`;
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
        state.hosts = { router: false, segments: [], aps: [], hosts: [], error: e.message };
    }
}

function devicePicker() {
    const container = E('div', {class: 'picker'});
    const countFormat = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US');
    const countText = value => value == null ? _('Unknown') : countFormat.format(value);
    let choices = [], refreshSelected = () => {}, searchBox = null, filter = '';
    const items = () => {
        if (!Array.isArray(state.draft.proxy.access_items)) state.draft.proxy.access_items = [];
        return state.draft.proxy.access_items;
    };
    const toggle = (item, on) => {
        state.draft.proxy.access_items = items().filter(value => value !== item).concat(on ? [item] : []);
        choices.forEach(({item: key, box, row}) => {box.checked = items().includes(key); row.classList.toggle('selected', box.checked);});
        const focused = document.activeElement;
        refreshSelected();
        if (focused && !focused.isConnected && searchBox) searchBox.focus();
        changed();
    };
    const option = (item, iconName, title, meta, extra) => {
        const states = (extra?.tags || []).filter(Boolean);
        const box = E('input', {type: 'checkbox', class: 'checkbox', 'data-item': item});
        box.checked = items().includes(item);
        box.addEventListener('change', () => toggle(item, box.checked));
        const row = E('label', {class: `picker-item${box.checked ? ' selected' : ''}${extra?.inactive ? ' inactive' : ''}`}, [
            box, icon(iconName), E('div', {class: 'picker-text'}, [
                E('div', {class: 'picker-title'}, [E('span', {class: 'picker-name'}, title), states.length ? E('div', {class: 'row picker-statuses'}, states) : null]),
                meta ? E('div', {class: 'picker-meta'}, meta) : null])]);
        choices.push({item, box, row});
        return row;
    };
    const render = () => {
        clear(container); choices = [];
        const hosts = state.hosts ? {...state.hosts, segments: state.hosts.segments || [], aps: state.hosts.aps || [], hosts: state.hosts.hosts || []} : null;
        const count = badge(countText(items().length), 'secondary');
        const summary = E('div', {class: 'picker-summary'});
        const clearSelection = btn(_('Clear selection'), {variant: 'ghost', size: 'sm', onClick: async () => {
            if (!await confirmDialog(_('Clear selection?'), _('Remove all selected devices and networks from the draft?'), {confirm: _('Clear selection')})) return;
            state.draft.proxy.access_items = [];
            choices.forEach(({box, row}) => {box.checked = false; row.classList.remove('selected');});
            refreshSelected(); changed();
        }});
        refreshSelected = () => {
            count.textContent = countText(items().length);
            clearSelection.disabled = items().length === 0;
            append(clear(summary), items().length ? E('div', {class: 'chips'}, items().map(item => E('span', {class: 'tag plain'}, [
                E('span', {title: itemValue(item)}, describeItem(item)),
                E('button', {type: 'button', 'aria-label': _('Remove %s', describeItem(item)), title: _('Remove %s', describeItem(item)), onclick: () => toggle(item, false)}, icon('x'))])))
                : E('p', {class: 'description'}, _('Select devices below or add an address.')));
        };
        const manual = E('input', {class: 'input', type: 'text', placeholder: _('MAC, IPv4 or IPv6 address or network'), spellcheck: 'false'});
        const manualError = E('p', {class: 'description', role: 'status', hidden: true, id: nextId()});
        manual.setAttribute('aria-describedby', manualError.id);
        const addManual = () => {
            const item = parseItem(manual.value);
            if (!item) {
                manual.classList.add('invalid'); manual.setAttribute('aria-invalid', 'true');
                manualError.textContent = _('Enter a valid MAC, IP address or network.'); manualError.hidden = false; manual.focus(); return;
            }
            toggle(item, true); manual.value = ''; manual.classList.remove('invalid');
            manual.removeAttribute('aria-invalid'); manualError.hidden = true; manual.focus();
        };
        manual.addEventListener('input', () => {manual.classList.remove('invalid'); manual.removeAttribute('aria-invalid'); manualError.hidden = true;});
        manual.addEventListener('keydown', ev => {if (ev.key === 'Enter') {ev.preventDefault(); addManual();}});
        const mode = field(_('Mode'), segmented(ref('proxy.access_mode'), [['exclude', _('All except selected')], ['include', _('Only selected')]]), null, null, [
            _('All devices go through the proxy, the selected ones go directly.'),
            _('Only the selected devices go through the proxy, the others go directly.'),
            _('A segment matches all its devices, a Wi-Fi network matches the devices connected to it on this router, not on AiMesh nodes (synced every 30 seconds), a device is matched by its MAC with IPv4 and IPv6. DNS follows the choice: proxied devices ask the core, the others ask the router.')]);
        const manualField = field(_('Add by address'), E('div', {class: 'manual-address'}, [E('div', {class: 'input-group'}, [manual, btn(_('Add'), {variant: 'outline', icon: 'plus', onClick: addManual})]), manualError]), null, null, [
            _('For a device the router does not list, or a whole network like <code>192.168.1.0/24</code>.'),
            _('The IP address of a device the router knows is saved as its MAC, so the choice follows the device when its address changes.')]);
        refreshSelected();
        container.appendChild(card({class: 'selected-routing', title: E('span', {class: 'row'}, [_('Selected'), count]), action: clearSelection,
            content: [E('div', {class: 'selection-settings'}, [mode, manualField]),
                live(() => E('p', {class: 'selection-consequence description'}, state.draft.proxy.access_mode === 'include'
                    ? _('Only the selected devices use the proxy. Every other device connects directly.')
                    : _('Selected devices connect directly. Every other device uses the proxy.')), () => state.draft.proxy.access_mode),
                state.draft.proxy.enabled !== true ? alertBox('warning', null, _('The proxy is turned off in Settings, the selection has no effect.')) : null, summary]}));
        if (!hosts) {container.appendChild(loader()); return;}
        if (!hosts.router) container.appendChild(alertBox('warning', _('The router did not give the list of devices'), hosts.error
            ? `${_('Error')}: ${hosts.error}` : _('Names of devices, Wi-Fi networks and parental control are not available: only devices from the ARP table of the router are listed.')));

        const search = E('input', {class: 'input', type: 'search', 'aria-label': _('Search by name, MAC or IP'), placeholder: _('Name, MAC or IP address'), value: filter});
        searchBox = search;
        const list = E('div', {class: 'picker-list scroll'});
        const resultCount = E('p', {class: 'description', role: 'status'});
        let hostLimit = 50;
        const more = btn(_('Show more'), {variant: 'outline', size: 'sm', onClick: () => {hostLimit += 50; renderHosts();}});
        const segmentNames = {};
        for (const segment of hosts.segments) {if (segment.id) segmentNames[segment.id] = segment.name || segment.ifname; segmentNames[segment.ifname] = segment.name || segment.ifname;}
        const renderHosts = () => {
            choices = choices.filter(choice => !list.contains(choice.row)); clear(list);
            const needle = filter.toLocaleLowerCase();
            const shown = hosts.hosts.filter(host => !needle || [host.name, host.hostname, host.mac, host.ip, host.ssid].some(value => (value || '').toLocaleLowerCase().includes(needle)))
                .sort((a,b) => (b.active - a.active) || (a.name || a.hostname || a.mac).localeCompare(b.name || b.hostname || b.mac));
            if (!shown.length) list.appendChild(E('div', {class: 'picker-empty'}, needle ? _('Nothing found') : _('No devices')));
            resultCount.textContent = _(shown.length === 1 ? 'Showing %s of %s device' : 'Showing %s of %s devices', countText(Math.min(shown.length, hostLimit)), countText(shown.length));
            more.hidden = shown.length <= hostLimit;
            for (const host of shown.slice(0,hostLimit)) list.appendChild(option(`mac:${host.mac}`, host.ssid ? 'wifi' : 'device', host.name || host.hostname || host.mac,
                [host.mac, host.ip, host.ssid ? `Wi-Fi ${host.ssid}` : (segmentNames[host.segment] || host.segment || null)].filter(Boolean).join(' · '),
                {inactive: !host.active, tags: [!host.active ? badge(_('offline'), 'outline') : null, host.access === 'deny' ? badge(_('blocked'), 'destructive') : null,
                    host.access === 'schedule' ? badge(_('on schedule'), 'outline') : null]}));
        };
        search.addEventListener('input', () => {filter = search.value; hostLimit = 50; renderHosts();});
        renderHosts();
        const devices = card({class: 'devices-discovery', title: E('span', {class: 'row'}, [_('Devices'), badge(countText(hosts.hosts.length))]),
            action: btn(_('Refresh'), {variant: 'outline', size: 'sm', icon: 'refresh-cw', onClick: async () => {await loadHosts(); render();}}),
            content: [E('label', {class: 'search'}, [E('span', {class: 'visually-hidden'}, _('Search by name, MAC or IP')), icon('search'), search]), list],
            footer: E('div', {class: 'discovery-footer'}, [resultCount, more])});
        const networkContent = [];
        if (hosts.segments.length) networkContent.push(E('section', {class: 'network-section'}, [E('h3', {class: 'section-title'}, _('Network segments')),
            E('div', {class: 'picker-list'}, hosts.segments.map(segment => option(`iface:${segment.ifname}`, 'network', segment.name || segment.ifname, [segment.ifname, segment.address].filter(Boolean).join(' · '))))]));
        if (hosts.aps.length) networkContent.push(E('section', {class: 'network-section'}, [E('h3', {class: 'section-title'}, _('Wi-Fi networks')),
            E('div', {class: 'picker-list'}, hosts.aps.map(ap => option(`ap:${ap.id}`, 'wifi', ap.ssid || ap.description || ap.id,
                [ap.band, ap.id, _('clients: %s', countText(ap.clients))].filter(Boolean).join(' · '), {inactive: ap.state === 'down', tags: [ap.guest ? badge(_('guest')) : null, ap.state === 'down' ? badge(_('off'), 'outline') : null]})))]));
        container.appendChild(E('div', {class: 'discovery-grid'}, [card({class: 'networks-discovery', title: _('Networks'),
            content: networkContent.length ? networkContent : empty('network', _('No networks'))}), devices]));
    };
    render();
    if (!state.hosts) loadHosts().then(render, render);
    return container;
}


// ---------- pages ----------

// a logo of the provider, it disappears when it does not load
function providerLogo(src, cls) {
    if (!src) {
        return null;
    }
    const img = E('img', { class: cls, src: src, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    return img;
}

// the announce of the provider of the running subscription: logo and title, the text, a link to the support
function providerCard() {
    const profile = state.config.config.profile || '';
    if (!profile.startsWith('subscription:')) {
        return null;
    }
    const id = profile.substring('subscription:'.length);
    const st = state.subscriptionStates[id] || {};
    if (!st.announce) {
        return null;
    }
    const sub = (state.config.subscriptions || []).find((s) => s.id === id) || {};
    return E('section', { class: 'card provider' }, E('div', { class: 'card-content' }, [
        E('div', { class: 'provider-head' }, [providerLogo(st.logo, 'provider-logo'), E('div', { class: 'provider-title' }, st.title || sub.name || id)]),
        E('p', { class: 'provider-announce' }, st.announce),
        st.support_url ? E('div', {}, E('a', { class: 'btn btn-outline btn-sm', href: st.support_url, target: '_blank', rel: 'noopener noreferrer' }, [icon('message-circle'), _('Support')])) : null
    ]));
}

function pageStatus() {
    const status = () => state.status || {};
    const service = card({class: 'service-panel', title: _('Service'), content: [
        live(() => {
            const s = status();
            const proxy = !state.status ? _('Unknown') : !s.running ? _('Stopped') : !state.config.proxy.enabled ? _('Off') : s.hijack ? _('Active') : _('Inactive');
            return E('dl', {class: 'service-facts'}, [
                E('div', {}, [E('dt', {}, _('Core')), E('dd', {class: 'service-core-details'}, [E('span', {class: 'service-core-type'}, CORE_TITLES[s.core_type] || s.core_type || 'Mihomo'), E('span', {class: 'fact-meta'}, s.core_version || '—')])]),
                E('div', {}, [E('dt', {}, _('Proxy')), E('dd', {}, E('span', {id: 'service-status', class: `badge status-block ${s.running && s.hijack && state.config.proxy.enabled ? 'badge-success' : 'badge-secondary'}`}, proxy))])]);
        }, () => [status().core_version, status().core_type, status().running, status().hijack, !!state.status, state.config.proxy.enabled]),
        E('div', {class: 'service-settings'}, [
            field(_('Profile'), select(ref('config.profile'), profileChoices(), {optional: true, placeholder: _('Not selected')}), null, null, [
                _('A subscription or an uploaded file, they are managed on the Profiles page.'),
                _('On every start the profile is merged with the settings of Exodus and the mixin file, a subscription is downloaded again unless its update is manual.'),
                _('Save & Apply restarts the service with the chosen profile.')]),
            switchField(_('Autostart'), _('Start the service when the router boots.'), ref('config.enabled'), null, true)]),
        E('div', {class: 'service-actions'}, live(() => [
            btn(status().running ? _('Restart') : _('Start'), {icon: status().running ? 'rotate-cw' : 'play', onClick: () => serviceOp(status().running ? 'restart' : 'start')}),
            btn(_('Stop'), {variant: 'destructive', icon: 'square', disabled: !status().running, onClick: () => serviceOp('stop')}),
            btn(_('Dashboard'), {variant: 'outline', icon: 'external-link', disabled: !status().running, onClick: openDashboard})
        ], () => [status().running]))
    ]});
    return [pageHeader(_('Devices'), _('Choose who uses the proxy. Changes take effect after Save & Apply.')),
        E('div', {class: 'stack'}, [service, devicePicker(), providerCard()])];
}


function newId() {
    return `sub_${Math.random().toString(16).slice(2, 10)}`;
}

// how often a subscription is downloaded: set by hand, from the provider (profile-update-interval) or every hour
function intervalHours(sub) {
    const st = state.subscriptionStates[sub.id] || {};
    return sub.update_interval != null ? sub.update_interval : (st.interval || 1);
}

function intervalText(sub) {
    const hours = intervalHours(sub);
    return hours === 0 ? _('by hand') : _('every %s h', hours);
}

function subscriptionDialog(subscription, onSave) {
    const draft = clone(subscription);
    const st = state.subscriptionStates[subscription.id] || {};
    const saved = dependents;
    dependents = [];
    const content = [
        field(_('Name'), input(objRef(draft, 'name'), { empty: '' }), _('Replaced with the title of the provider when it sends one.')),
        field(_('URL'), input(objRef(draft, 'url'), { empty: '', placeholder: 'https://' })),
        field(_('Info URL'), input(objRef(draft, 'info_url'), { empty: '', placeholder: _('Optional') }), _('Only when traffic and expiry come from another address.')),
        field(_('User agent'), input(objRef(draft, 'user_agent'), { empty: '', values: ['Mihomo/Exodus v{version}', 'clash.meta', 'mihomo', 'clash'] }), _('<code>{version}</code> is replaced with the version of Exodus.')),
        field(_('Update interval, hours'), input(objRef(draft, 'update_interval'), { number: true, type: 'uinteger',
            placeholder: st.interval ? _('Automatically: every %s h, as the provider says', st.interval) : _('Automatically: as the provider says, otherwise every hour') }),
            _('Empty: the interval of the provider (profile-update-interval), otherwise every hour. 0: only by the Update button. The running core gets a changed subscription without a restart.')),
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
    const profileBadge = value => state.config.config.profile === value ? badge(_('Active'), 'default')
        : state.draft.config.profile === value ? badge(_('Selected · unsaved'), 'default') : null;
    const useProfile = value => btn(_('Use profile'), {variant: 'outline', size: 'sm', disabled: state.draft.config.profile === value, onClick: () => {
        state.draft.config.profile = value;
        renderSubscriptions(); renderFiles(); changed();
        toast(_('Profile selected. Save & Apply to use it.'), 'info');
    }});

    // subscriptions are a part of the config, they are saved with the save bar
    const subsContainer = E('div', { class: 'contents' });
    const renderSubscriptions = () => {
        clear(subsContainer);
        const subscriptions = state.draft.subscriptions || [];
        if (subscriptions.length === 0) {
            subsContainer.appendChild(empty('link', _('No subscriptions yet.')));
            return;
        }
        const entries = E('div', {class: 'profile-list'});
        subscriptions.forEach((sub, index) => {
            const st = state.subscriptionStates[sub.id] || {};
            let host = '';
            try {
                host = new URL(sub.url).host;
            } catch (e) {
                host = '';
            }
            entries.appendChild(E('article', {class: 'profile-entry'}, [
                E('div', {class: 'profile-entry-top'}, [E('div', {class: 'profile-entry-name'}, [
                    E('div', { class: 'cell-title' }, [providerLogo(st.logo, 'sub-logo'), sub.name, profileBadge(`subscription:${sub.id}`)]),
                    host ? E('div', { class: 'description' }, host) : null
                ]), useProfile(`subscription:${sub.id}`)]),
                E('div', {class: 'profile-entry-bottom'}, [
                E('dl', {class: 'profile-meta'}, [
                    E('div', {}, [E('dt', {}, _('Traffic')), E('dd', {}, st.used || st.total ? `${st.used || '—'} / ${st.total || '∞'}` : '—')]),
                    E('div', {}, [E('dt', {}, _('Expires')), E('dd', {}, expireText(st))]),
                    E('div', {}, [E('dt', {}, _('Updated')), E('dd', {}, [st.success === false ? badge(_('Failed'), 'destructive') : (st.update || '—'),
                        E('span', {class: 'description'}, intervalText(sub))])])
                ]),
                E('div', { class: 'row profile-actions' }, [
                    btn(null, { variant: 'ghost', size: 'sm', icon: 'refresh-cw', title: _('Update'), onClick: async () => {
                        if (JSON.stringify((state.config.subscriptions || []).find((s) => s.id === sub.id)) !== JSON.stringify(sub)) {
                            toast(_('Save the subscription first.'), 'warning');
                            return;
                        }
                        await run(api('subscription_update', { id: sub.id }));
                        const before = st.checked || 0;
                        for (let i = 0; i < 40; i++) {
                            await new Promise((resolve) => setTimeout(resolve, 3000));
                            const data = await api('load');
                            const next = (data.subscription_states || {})[sub.id] || {};
                            if ((next.checked || 0) !== before) {
                                state.subscriptionStates = data.subscription_states || {};
                                // the title of the provider became the name, the saved config and the draft take it alike
                                const named = (data.config.subscriptions || []).find((s) => s.id === sub.id);
                                if (named) {
                                    [state.config.subscriptions, state.draft.subscriptions].forEach((list) => {
                                        const item = (list || []).find((s) => s.id === sub.id);
                                        if (item) {
                                            item.name = named.name;
                                        }
                                    });
                                }
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
                ])])
            ]));
        });
        subsContainer.appendChild(entries);
    };
    renderSubscriptions();

    const subscriptionsCard = card({
        title: _('Subscriptions'),
        action: btn(_('Add'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => subscriptionDialog(
            { id: newId(), name: '', url: '', info_url: '', user_agent: 'Mihomo/Exodus v{version}', send_hwid: true, update_interval: null },
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
        filesContainer.appendChild(E('div', {class: 'profile-list'}, state.profiles.map(p => E('article', {class: 'profile-entry'}, [
                E('div', {class: 'profile-entry-top'}, [E('div', { class: 'cell-title profile-entry-name' }, [E('span', {}, p.name), profileBadge(`file:${p.name}`)]), useProfile(`file:${p.name}`)]),
                E('div', {class: 'profile-entry-bottom'}, [
                E('p', {class: 'description'}, `${_('Size')}: ${formatSize(p.size)}`),
                E('div', { class: 'row profile-actions' }, [
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
                ])])
            ]))));
    };
    renderFiles();

    const fileInput = E('input', { type: 'file', accept: '.yaml,.yml,.json,.txt', hidden: true });
    const uploadProgress = E('span', { class: 'muted', role: 'status', 'aria-live': 'polite', hidden: true });
    const uploadButton = btn(_('Upload'), { variant: 'outline', size: 'sm', icon: 'upload', onClick: () => fileInput.click() });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) {
            return;
        }
        const name = file.name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[._ -]+/, '') || 'profile.yaml';
        if (file.size > 8388608) { toast(_('File exceeds 8 MiB.'), 'error'); fileInput.value = ''; return; }
        fileInput.value = '';
        uploadButton.disabled = true;
        uploadProgress.hidden = false;
        uploadProgress.textContent = _('Uploading %s…', name);
        try {
            const content = await file.text();
            await api('profile_upload', { name, content, onProgress: ({completed,total}) => {
                uploadProgress.textContent = _('Uploading %s…', name) + ' ' + Math.floor(completed/total*100) + '%';
            } });
            const data = await api('load');
            state.profiles = data.profiles || [];
            renderFiles();
            toast(_('%s is uploaded.', name));
        } catch (e) {
            // Async DOM listeners have no caller to catch a rejected upload.
            toast(e.message, 'error');
        } finally {
            uploadButton.disabled = false;
            uploadProgress.hidden = true;
        }
    });

    const filesCard = card({
        title: _('Profile files'),
        content: [filesContainer, E('div', {class: 'profile-import'}, [fileInput, uploadButton, uploadProgress,
            E('p', {class: 'description'}, _('Add a local configuration file.'))])]
    });

    // a compact row: the text on the left, the button on the right
    const hardUpdateCard = card({
        content: [E('div', {class: 'inline-task-copy'}, [E('h2', {class: 'card-title'}, _('Hard update')),
            E('p', {class: 'description'}, _('Remove everything downloaded by the providers of the current profile, download the subscription again and restart. Files of local providers are kept.'))]),
        btn(_('Hard update'), { variant: 'destructive-outline', icon: 'refresh-cw', onClick: async () => {
            if (!await confirmDialog(_('Hard update?'), _('The proxy restarts and all providers are downloaded again.'), { confirm: _('Hard update'), destructive: true })) {
                return;
            }
            await run(api('service', { op: 'hard_update' }), _('Hard update started, the progress is in the app log.'));
        } })]
    });
    hardUpdateCard.classList.add('inline-task');

    return [
        pageHeader(_('Profiles'), _('Add a subscription or upload a configuration, then select the profile to use.')),
        E('div', { class: 'stack' }, [subscriptionsCard, filesCard, hardUpdateCard])
    ];
}

const DASHBOARDS = [
    ['https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard'],
    ['https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD'],
    ['https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD']
];

// rule types of mihomo that make sense on a router: [type, description, example value]
const RULE_TYPES = [
    ['DOMAIN', _('Domain'), 'example.com'],
    ['DOMAIN-SUFFIX', _('Domain and subdomains'), 'example.com'],
    ['DOMAIN-KEYWORD', _('Domain keyword'), 'google'],
    ['DOMAIN-WILDCARD', _('Domain by a pattern with * and ?'), '*.example.com'],
    ['DOMAIN-REGEX', _('Domain by a regular expression'), '^ads?\\.'],
    ['GEOSITE', _('Geosite category'), 'youtube'],
    ['IP-CIDR', _('Destination network'), '1.1.1.0/24'],
    ['IP-CIDR6', _('Destination IPv6 network'), '2606:4700::/32'],
    ['IP-ASN', _('Destination autonomous system'), '13335'],
    ['GEOIP', _('Geoip country'), 'ru'],
    ['SRC-IP-CIDR', _('Source network, a device of the local network'), '192.168.1.10/32'],
    ['DST-PORT', _('Destination port'), '443'],
    ['SRC-PORT', _('Source port'), '50000-60000'],
    ['NETWORK', _('Network: tcp or udp'), 'udp'],
    ['RULE-SET', _('Rule provider of the profile'), 'my-rules'],
    ['MATCH', _('Everything else'), '']
];

const BUILTIN_TARGETS = ['DIRECT', 'REJECT', 'REJECT-DROP'];

function rulesInfo() {
    return [
        _('Rules of Exodus are checked from top to bottom before the rules of the profile, the first matching rule wins.'),
        E('p', {}, [E('strong', {}, _('Order')), E('br'), _('Put REJECT rules first, then DIRECT, then the proxy groups: a block or a direct exception is not caught by a wider proxy rule.')]),
        E('p', {}, [E('strong', {}, _('Target')), E('br'), _('DIRECT goes directly, REJECT blocks (REJECT-DROP silently), or a group of the profile. Hidden groups are not offered.')]),
        E('p', {}, E('strong', {}, _('Types'))),
        E('ul', { class: 'rule-types' }, RULE_TYPES.map(([type, title, example]) => E('li', {}, [
            E('code', {}, type), ` — ${title}`, example ? [': ', E('code', {}, example)] : null
        ]))),
        _('<strong>No resolve</strong> is for rules by IP (IP-CIDR, IP-ASN, GEOIP): the domain is not resolved to check the rule, it matches only connections to an IP address.'),
        E('p', {}, E('a', { href: 'https://wiki.metacubex.one/en/config/rules/', target: '_blank', rel: 'noopener' }, _('Rules in the Mihomo documentation')))
    ];
}

// a rule is complete with a type, a target and a value (MATCH has no value); an incomplete one is skipped on start
function ruleComplete(rule) {
    return !!rule.type && !!rule.node && (rule.type === 'MATCH' || !!rule.matcher);
}

function rulesEditor() {
    const r = ref('mixin.rules');
    const container = E('div', { class: 'stack' });
    const rows = () => (Array.isArray(r.get()) ? r.get() : []);
    const targets = BUILTIN_TARGETS.concat(state.groups || []);
    const types = RULE_TYPES.map(([type, title]) => [type, title]);
    const update = (next) => {
        r.set(next);
        render();
        changed();
    };
    const row = (rule, index, list) => {
        const matcher = input(objRef(rule, 'matcher'), { empty: '' });
        const named = (control, label) => {
            (control.matches('input,select,textarea') ? control : control.querySelector('input,select,textarea')).setAttribute('aria-label', `${label} · ${index + 1}`);
            return control;
        };
        named(matcher, _('Value'));
        const incomplete = badge(_('Incomplete'), 'warning');
        incomplete.title = _('Skipped until the type, the value and the target are filled.');
        // the example follows the type, a finished rule loses the warning
        const refresh = () => {
            const known = RULE_TYPES.find((t) => t[0] === rule.type);
            matcher.placeholder = known ? known[2] : '';
            matcher.disabled = rule.type === 'MATCH';
            incomplete.hidden = ruleComplete(rule);
        };
        const tr = E('tr', {}, [
            E('td', {}, named(switchControl({ get: () => rule.enabled !== false, set: (v) => { rule.enabled = v; } }), _('On'))),
            E('td', {}, named(input(objRef(rule, 'type'), { empty: '', values: types, placeholder: _('Choose') }), _('Type'))),
            E('td', {}, E('div', {class: 'rule-value'}, [matcher, incomplete])),
            E('td', {}, named(input(objRef(rule, 'node'), { empty: '', values: targets, placeholder: _('Choose') }), _('Target'))),
            E('td', {}, named(checkbox(objRef(rule, 'no_resolve')), _('No resolve'))),
            E('td', { class: 'actions' }, E('div', { class: 'row' }, [
                btn(null, { variant: 'outline', size: 'sm', icon: 'chevron-up', title: _('Up'), disabled: index === 0, onClick: () => {
                    const next = list.slice();
                    next.splice(index - 1, 0, next.splice(index, 1)[0]);
                    update(next);
                } }),
                btn(null, { variant: 'outline', size: 'sm', icon: 'chevron-down', title: _('Down'), disabled: index === list.length - 1, onClick: () => {
                    const next = list.slice();
                    next.splice(index + 1, 0, next.splice(index, 1)[0]);
                    update(next);
                } }),
                btn(null, { variant: 'destructive-outline', size: 'sm', icon: 'trash', title: _('Delete'), onClick: () => update(list.filter((_x, i) => i !== index)) })
            ]))
        ]);
        tr.addEventListener('input', refresh);
        refresh();
        return tr;
    };
    const render = () => {
        clear(container);
        const list = rows();
        if (list.length === 0) {
            container.appendChild(empty('list', _('No rules yet.')));
        } else {
            container.appendChild(E('div', { class: 'table-wrap' }, E('table', { class: 'table rules' }, [
                E('thead', {}, E('tr', {}, [E('th', {}, _('On')), E('th', {}, _('Type')), E('th', {}, _('Value')), E('th', {}, _('Target')), E('th', { title: 'no-resolve' }, _('No resolve')), E('th')])),
                E('tbody', {}, list.map((rule, index) => row(rule, index, list)))
            ])));
        }
        // a new rule is empty: a prefilled type or target would hide the other choices of the list
        container.appendChild(E('div', { class: 'toolbar row' }, btn(_('Add rule'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => update(rows().concat([
            { enabled: true, type: '', matcher: '', node: '', no_resolve: false }
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
        info: [_('Panels with a device limit tell the router from other devices by these headers.')],
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

function searchableSettings(list) {
    const tabset = tabs('settings', list);
    const tablist = tabset.querySelector('[role="tablist"]');
    const panels = Array.from(tabset.querySelectorAll('[role="tabpanel"]'));
    const search = E('input', {id: 'settings-search', type: 'search', class: 'input', placeholder: _('Search by setting or description'), 'aria-label': _('Search settings')});
    const summary = E('p', {class: 'settings-search-summary description', role: 'status', hidden: true});
    const noResults = empty('search', _('Nothing found'), _('Try another keyword or clear the search.'));
    noResults.hidden = true;
    const groups = panels.map((panel, index) => {
        const heading = E('h2', {class: 'search-result-group', hidden: true}, list[index][1]);
        panel.prepend(heading);
        return {panel, heading, cards: Array.from(panel.querySelectorAll('.card')), key: list[index][0]};
    });
    const clearSearch = btn(_('Clear search'), {variant: 'ghost', size: 'sm', icon: 'x', onClick: () => {search.value = ''; filter(); search.focus();}});
    clearSearch.hidden = true;
    const filter = () => {
        const query = search.value.trim().toLocaleLowerCase(lang === 'ru' ? 'ru-RU' : 'en-US');
        const selected = tabChoice.settings || list[0][0];
        let found = 0;
        tablist.hidden = !!query; summary.hidden = !query; clearSearch.hidden = !query;
        for (const {panel, heading, cards, key} of groups) {
            let groupMatches = 0;
            heading.hidden = !query;
            panel.setAttribute('role', query ? 'region' : 'tabpanel');
            for (const section of cards) {
                const categoryMatch = !!query && `${heading.textContent} ${section.querySelector('.card-header')?.textContent || ''}`.toLocaleLowerCase().includes(query);
                const matches = !query || categoryMatch || section.textContent.toLocaleLowerCase().includes(query);
                section.classList.toggle('search-filtered', !matches);
                if (matches) groupMatches++;
                for (const item of section.querySelectorAll('.field, .field-switch')) {
                    item.classList.toggle('search-filtered', !!query && !categoryMatch && !item.textContent.toLocaleLowerCase().includes(query));
                }
            }
            panel.hidden = query ? groupMatches === 0 : key !== selected;
            found += groupMatches;
        }
        summary.textContent = _('Matching groups: %s', found);
        noResults.hidden = !query || found > 0;
    };
    search.addEventListener('input', filter);
    return E('div', {class: 'stack'}, [E('div', {class: 'settings-search'}, [
        E('label', {class: 'label', for: search.id}, _('Search settings')),
        E('div', {class: 'row search-input-row'}, [search, clearSearch]), summary]), noResults, tabset]);
}

function pageSettings() {
    const d = () => state.draft;
    const proxyOn = () => d().proxy.enabled === true;
    const interfaces = (state.interfaces || []).map((i) => [i, i]);
    const choices = (list) => list.map((name) => [name, name]);

    const proxyTab = [
        card({
            title: _('General'),
            content: [
                switchField(_('Enable'), _('Intercept the traffic of the devices chosen on the Devices page. When off, only the core runs: its proxy port and the dashboard.'), ref('proxy.enabled')),
                dependOn(E('div', { class: 'grid-2' }, [
                    field('TCP', select(ref('proxy.tcp_mode'), [['redirect', 'Redirect'], ['tproxy', 'TPROXY']], { optional: true, placeholder: _('Off'), empty: '' }),
                        _('Redirect works everywhere and is recommended. TPROXY for TCP needs the TPROXY module of the firmware, without it TCP is redirected.')),
                    field('UDP', select(ref('proxy.udp_mode'), [['tproxy', 'TPROXY']], { optional: true, placeholder: _('Off'), empty: '' }),
                        _('For QUIC, games and calls. Needs the TPROXY module of the firmware, without it UDP goes directly.'))
                ]), proxyOn),
                dependOn(E('div', { class: 'grid-3' }, [
                    switchField(_('DNS through the core'), _('DNS queries of the proxied devices go to the core, whatever DNS the router uses. Required for Fake-IP and domain rules.'), ref('proxy.dns_hijack')),
                    switchField(_('Traffic of the router'), _('Proxy the connections of the router itself, for example of Entware applications. DNS of the router is not intercepted.'), ref('proxy.router_proxy')),
                    switchField(_('Respect parental control'), _('The parental control of the router (Block Internet Access, Time Scheduling) applies to the proxied traffic too, otherwise blocked devices would get internet through the core. Content filters of AiProtection do not see inside the proxied traffic.'), ref('proxy.respect_parental_control'))
                ]), proxyOn)
            ]
        }),
        card({
            title: _('Ports and exclusions'),
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('TCP ports to proxy'), input(ref('proxy.proxy_tcp_dport'), { type: 'portlist', empty: '0-65535', placeholder: _('All ports'), values: [
                        ['0-65535', _('All ports')], ['80 443 8080 8443', _('Web only')], ['21 22 80 110 143 194 443 465 853 993 995 8080 8443', _('Common ports')]
                    ] }), _('Ports and ranges separated by spaces, the other ports go directly.')),
                    field(_('UDP ports to proxy'), input(ref('proxy.proxy_udp_dport'), { type: 'portlist', empty: '0-65535', placeholder: _('All ports'), values: [
                        ['0-65535', _('All ports')], ['443 8443', _('QUIC only')]
                    ] }))
                ]),
                E('div', { class: 'grid-2' }, [
                    field(_('Direct IPv4 networks'), tags(ref('proxy.reserved_ip'), { type: 'ip4', placeholder: '203.0.113.0/24' }),
                        _('Destinations that never go through the proxy. Local and special networks are here by default.')),
                    field(_('Direct IPv6 networks'), tags(ref('proxy.reserved_ip6'), { type: 'ip6', placeholder: '2001:db8::/32' }),
                        _('Used when IPv6 is on in the profile and the router has an IPv6 address.'))
                ])
            ]
        })
    ];

    const dscpTab = [
        card({
            title: _('DSCP marks'),
            info: [
                _('A device can mark its traffic with DSCP to choose the route per application. The marks are the same as in XKeen.'),
                E('p', {}, E('strong', {}, _('How to mark traffic on Windows'))),
                _('gpedit.msc → Computer Configuration → Windows Settings → Policy-based QoS → Create new policy: choose the DSCP value and the application. Outside of a domain also set <code>HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\QoS</code> "Do not use NLA" = "1" and reboot.')
            ],
            content: [
                E('div', { class: 'grid-2' }, [
                    field(_('Direct'), tags(ref('proxy.dscp_bypass'), { type: 'dscp', number: true, placeholder: '62' }), _('Traffic with these marks goes directly (62 in XKeen).')),
                    field(_('Proxy'), tags(ref('proxy.dscp_proxy'), { type: 'dscp', number: true, placeholder: '63' }), _('Traffic with these marks goes through the proxy even from excluded devices and on any port (63 in XKeen).'))
                ]),
                E('div', { class: 'grid-2' }, [
                    field(_('Mark of the chosen proxy'), input(ref('proxy.dscp_force'), { number: true, type: 'dscp', placeholder: _('Off') }),
                        _('Traffic with this mark goes to one proxy, past the rules of the profile (61 in XKeen).')),
                    field(_('Chosen proxy'), select(ref('proxy.force_proxy'), [
                        { group: _('Groups'), options: choices(state.groups) },
                        { group: _('Proxies'), options: choices(state.nodes) }
                    ], { optional: true, placeholder: _('Off'), empty: '' }),
                        _('A group or a proxy of the running profile, hidden groups are not offered. The list fills after the first start.'), () => d().proxy.dscp_force != null)
                ])
            ]
        })
    ];

    const coreTab = [
        card({
            title: 'Mihomo',
            info: [_('Options merged over the profile. Mode, DNS mode and IPv6 always come from the profile.')],
            content: E('div', { class: 'grid-3' }, [
                field(_('Log level'), select(ref('mixin.log_level'), ['silent', 'error', 'warning', 'info', 'debug'].map((v) => [v, v]), { optional: true })),
                field(_('Outbound interface'), select(ref('mixin.outbound_interface'), interfaces, { optional: true, placeholder: _('Automatic') }),
                    _('Linux name of the interface for the connections of the core: ppp0, eth3, nwg0 and so on.')),
                field(_('Memory limit'), input(ref('core.gomemlimit'), { empty: '', placeholder: _('Half of RAM') }),
                    _('For example <code>128MiB</code>, <code>off</code> removes the limit. Without a limit the router may kill the core when memory runs out.'))
            ])
        }),
        card({
            title: _('Proxy port'),
            info: [_('HTTP and SOCKS5 on one port, for devices and applications set up by hand.')],
            content: [
                E('div', { class: 'grid-2 align-end' }, [
                    field(_('Port'), input(ref('mixin.mixed_port'), { number: true, type: 'port', placeholder: _('From profile, otherwise 7890') })),
                    switchField(_('Authentication'), _('Ask for a username and password on the proxy port.'), ref('mixin.authentication'))
                ]),
                dependOn(E('div', { class: 'grid-2' }, [
                    field(_('Username'), input(ref('mixin.username'), { empty: '' })),
                    field(_('Password'), input(ref('mixin.password'), { password: true, empty: '' }))
                ]), () => d().mixin.authentication === true)
            ]
        }),
        card({
            title: _('Dashboard'),
            action: [
                btn(_('Open'), { variant: 'outline', size: 'sm', icon: 'external-link', onClick: openDashboard }),
                btn(_('Update'), { variant: 'outline', size: 'sm', icon: 'download', onClick: () => run(api('update_dashboard'), _('The dashboard is updated.')) })
            ],
            content: E('div', { class: 'grid-3' }, [
                field(_('Panel'), select(ref('mixin.ui_url'), DASHBOARDS, { optional: true })),
                field(_('API port'), input(ref('mixin.api_port'), { number: true, type: 'port', empty: 9090, placeholder: '9090' })),
                field(_('API secret'), input(ref('mixin.api_secret'), { password: true, empty: '' }), _('The dashboard and other applications connect to the core with it.'))
            ])
        })
    ];

    const rulesTab = [
        card({
            title: _('Rules'),
            info: rulesInfo(),
            content: rulesEditor()
        }),
        card({
            title: _('Mixin file'),
            description: _('Anything else — DNS servers, hosts, sniffer, rule providers — goes to the mixin file. It is merged into the profile on every start.'),
            action: btn(_('Open in Editor'), { variant: 'outline', size: 'sm', icon: 'file-text', onClick: () => {
                state.editorFile = 'mixin';
                location.hash = '#/editor';
            } })
        })
    ];

    const serviceTab = [
        card({
            title: _('Service'),
            content: [
                E('div', { class: 'grid-2 align-end' }, [
                    field(_('Start delay, seconds'), input(ref('config.start_delay'), { number: true, type: 'uinteger', empty: 0, placeholder: '0' }), null, null,
                        [_('Wait after the router boots, for example until the USB drive or the internet is ready.')]),
                    switchField(_('Scheduled restart'), _('Restart the service on a schedule, for example every night.'), ref('config.scheduled_restart'))
                ]),
                field(_('Schedule'), input(ref('config.scheduled_restart_cron'), { type: 'cron', empty: '', placeholder: '0 3 * * *' }),
                    _('Cron format: minute hour day month weekday. <code>0 3 * * *</code> is every day at 3:00.'), () => d().config.scheduled_restart === true)
            ]
        }),
        hwidCard(),
        card({
            title: _('Logs'),
            content: E('div', { class: 'grid-2 align-end' }, [
                field(_('Log size limit, MB'), input(ref('log.max_size'), { number: true, type: 'uinteger', empty: 0, placeholder: _('No limit') }), null, null,
                    [_('Logs are kept in RAM, a log over the limit is cleared.')]),
                switchField(_('Clear logs at stop'), null, ref('log.clear_at_stop'))
            ])
        })
    ];

    compactDescriptions(proxyTab[0], ['TCP', 'UDP']);
    coreTab.forEach(section => compactDescriptions(section));
    return [
        pageHeader(_('Settings'), _('Find an option or explore the categories. Your changes remain a draft until you save.')),
        searchableSettings([
            ['proxy', _('Proxy'), proxyTab],
            ['dscp', 'DSCP', dscpTab],
            ['core', 'Mihomo', coreTab],
            ['rules', _('Rules'), rulesTab],
            ['service', _('Service'), serviceTab]
        ])
    ];
}

function hasEditorChanges() {
    return Object.values(state.editorBuffers || {}).some(buffer => buffer.content !== buffer.saved);
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

    const buffers = state.editorBuffers || (state.editorBuffers = Object.create(null));
    const pageToken = renderToken;
    const text = E('textarea', { class: 'textarea log', wrap: 'off', spellcheck: 'false', disabled: true, placeholder: _('Choose a file to edit.') });
    const status = E('p', { class: 'editor-status', role: 'status', id: nextId() }, _('Choose a file to edit.'));
    text.setAttribute('aria-describedby', status.id);
    let loadedPath = '', requestToken = 0, loading = false, saving = false, fileError = '';
    const isCurrent = () => pageToken === renderToken;
    const sync = () => {
        const buffer = buffers[loadedPath];
        text.disabled = !buffer || loading;
        text.setAttribute('aria-busy', String(loading));
        saveButton.disabled = restartButton.disabled = !buffer || loading || saving;
        reloadButton.disabled = !choose.value || loading || saving;
        downloadButton.disabled = !buffer || loading;
        if (fileError) status.textContent = fileError;
        else if (!loading && !saving && buffer) status.textContent = buffer.content !== buffer.saved ? _('Unsaved changes. This draft stays here while you navigate.') : _('Saved to the router.');
    };
    const load = async (reload = false) => {
        const path = choose.value;
        const token = ++requestToken;
        fileError = '';
        state.editorSelected = path;
        if (!path) {
            loadedPath = '';
            text.value = '';
            loading = false;
            status.textContent = _('Choose a file to edit.');
            sync();
            return;
        }
        if (buffers[path] && !reload) {
            loadedPath = path;
            text.value = buffers[path].content;
            loading = false;
            sync();
            return;
        }
        loading = true;
        status.textContent = _('Loading file…');
        sync();
        try {
            const result = await api('file_read', { path });
            // A late response never replaces the currently selected file or a retained draft.
            if (token !== requestToken || !isCurrent()) return;
            buffers[path] = { content: result.content, saved: result.content };
            loadedPath = path;
            text.value = result.content;
        } catch (error) {
            if (token !== requestToken || !isCurrent()) return;
            choose.value = loadedPath;
            state.editorSelected = loadedPath;
            fileError = _('Could not load the file. Your previous draft is intact. %s', error.message);
            toast(error.message, 'error');
        } finally {
            if (token === requestToken && isCurrent()) {
                loading = false;
                sync();
            }
        }
    };
    choose.addEventListener('change', () => load());
    text.addEventListener('input', () => {
        if (buffers[loadedPath]) buffers[loadedPath].content = text.value;
        fileError = '';
        sync();
    });
    const saveFile = async (restart) => {
        if (!loadedPath || !buffers[loadedPath] || loading || saving) return;
        const path = loadedPath, content = buffers[path].content;
        saving = true;
        fileError = '';
        status.textContent = _('Saving file…');
        sync();
        try {
            await api('file_write', { path, content });
            buffers[path].saved = content;
            toast(_('The file is saved.'));
            if (restart) await serviceOp('restart');
        } catch (error) {
            if (isCurrent()) fileError = _('Could not save the file. Your draft is intact. %s', error.message);
            toast(error.message, 'error');
        } finally {
            saving = false;
            if (isCurrent()) {
                sync();
                // The shared button wrapper settles after this callback.
                setTimeout(sync, 0);
            }
        }
    };
    const saveButton = btn(_('Save'), { variant: 'outline', disabled: true, onClick: () => saveFile(false) });
    state.saveEditor = () => saveFile(false);
    const restartButton = btn(_('Save & Restart'), { disabled: true, onClick: () => saveFile(true) });
    const reloadButton = btn(_('Reload'), { variant: 'outline', icon: 'refresh-cw', disabled: true, onClick: async () => {
        const buffer = buffers[choose.value];
        if (buffer && buffer.content !== buffer.saved && !await confirmDialog(_('Discard this file draft?'), _('Reloading replaces your unsaved edits with the file on the router.'), { confirm: _('Reload'), destructive: true })) return;
        await load(true);
        setTimeout(sync, 0);
    } });
    const downloadButton = btn(_('Download'), { variant: 'ghost', icon: 'download', disabled: true, onClick: () => download(loadedPath.split('/').pop(), text.value) });
    const wrap = E('input', { type: 'checkbox', class: 'checkbox' });
    wrap.addEventListener('change', () => { text.wrap = wrap.checked ? 'soft' : 'off'; });
    if (state.editorFile === 'mixin' && files.mixin) {
        choose.value = files.mixin;
        load();
    } else if (state.editorSelected && Array.from(choose.options).some(option => option.value === state.editorSelected)) {
        choose.value = state.editorSelected;
        load();
    }
    state.editorFile = null;

    return [
        pageHeader(_('Editor'), _('Edit configuration files. File drafts stay in this tab until you reload the page.')),
        card({
            content: [field(_('File'), choose), E('div', { class: 'editor-toolbar row wrap' }, [reloadButton, downloadButton, E('label', { class: 'checkbox-label' }, [wrap, _('Wrap lines')])]), status,
                field(_('File contents'), E('div', { class: 'text-surface' }, text))],
            footer: E('div', { class: 'row end', style: { width: '100%' } }, [
                saveButton, restartButton
            ])
        })
    ];
}

function pageLogs() {
    const retained = state.logBuffers || (state.logBuffers = Object.create(null));
    const logView = (name) => {
        const title = { app: _('Exodus'), core: _('Core'), web: _('Integration') }[name];
        const text = E('textarea', { class: 'textarea log', wrap: 'off', readonly: true, spellcheck: 'false', 'aria-label': _('%s log', title) });
        let loaded = typeof retained[name] === 'string';
        text.value = loaded ? retained[name] : '';
        text.placeholder = loaded ? _('No log entries yet.') : _('Loading log…');
        const status = E('p', { class: 'log-status', role: 'status', id: nextId() }, loaded && !text.value ? _('No log entries yet.') : _('Refreshing log…'));
        text.setAttribute('aria-describedby', status.id);
        let paused = false, pending = false, clearing = false, generation = 0;
        let follow = true;
        const followButton = btn(_('Follow latest'), { variant: 'ghost', size: 'sm', icon: 'arrow-down', onClick: () => {
            follow = !follow;
            followButton.setAttribute('aria-pressed', String(follow));
            if (follow) text.scrollTop = text.scrollHeight;
        } });
        followButton.setAttribute('aria-pressed', 'true');
        const load = async (manual = false) => {
            if (pending || clearing || (!manual && (paused || !text.isConnected || !text.getClientRects().length))) return;
            const token = generation;
            pending = true;
            text.setAttribute('aria-busy', 'true');
            status.textContent = _('Refreshing log…');
            if (!loaded) text.placeholder = _('Loading log…');
            try {
                const data = await api('log_read', { name: name });
                if (token !== generation || !text.isConnected) return;
                if (!data || typeof data.content !== 'string') throw Error(_('Router response does not contain log text.'));
                loaded = true;
                retained[name] = data.content;
                text.placeholder = _('No log entries yet.');
                if (text.value !== data.content) {
                    text.value = data.content;
                    if (follow) {
                        text.scrollTop = text.scrollHeight;
                    }
                }
                status.textContent = paused ? _('Refresh paused') : data.content.length ? _('Updated at %s', new Date().toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US')) : _('No log entries yet.');
            } catch (e) {
                if (token === generation && text.isConnected) {
                    status.textContent = loaded ? _('Could not refresh. Previous log is retained. %s', e.message) : _('Could not load the log. %s', e.message);
                    text.placeholder = status.textContent;
                }
            } finally {
                pending = false;
                text.setAttribute('aria-busy', 'false');
            }
        };
        text.addEventListener('scroll', () => {
            follow = text.scrollTop + text.clientHeight >= text.scrollHeight - 20;
            followButton.setAttribute('aria-pressed', String(follow));
        });
        const pauseButton = btn(_('Pause refresh'), { variant: 'outline', size: 'sm', onClick: () => {
            paused = !paused;
            pauseButton.querySelector('span').textContent = paused ? _('Resume refresh') : _('Pause refresh');
            pauseButton.setAttribute('aria-pressed', String(paused));
            status.textContent = paused ? _('Refresh paused') : _('Refreshing log…');
            if (!paused) load(true);
        } });
        pauseButton.setAttribute('aria-pressed', 'false');
        // Render first, then poll only the visible pane. Hidden panes start when selected.
        setTimeout(load, 0);
        pollPage(load);
        return card({
            content: [
                E('div', { class: 'row wrap toolbar log-toolbar' }, [
                    btn(_('Refresh'), { variant: 'outline', size: 'sm', icon: 'refresh-cw', onClick: () => load(true) }), pauseButton, followButton,
                    btn(_('Download'), { variant: 'ghost', size: 'sm', icon: 'download', onClick: () => download(`exodus-${name}.log`, text.value) }),
                    btn(_('Clear'), { variant: 'outline', size: 'sm', icon: 'trash', onClick: async () => {
                        if (!await confirmDialog(_('Clear %s log?', title), _('This removes the log from the router. Download a copy first if you need it.'), { confirm: _('Clear'), destructive: true })) return;
                        generation++;
                        clearing = true;
                        try {
                            await api('log_clear', { name: name });
                            loaded = true;
                            retained[name] = text.value = '';
                            text.placeholder = _('No log entries yet.');
                            status.textContent = _('Log cleared.');
                        } catch (error) {
                            status.textContent = _('Could not clear the log. %s', error.message);
                            toast(error.message, 'error');
                        } finally {
                            clearing = false;
                        }
                    } })
                ]),
                status,
                E('div', { class: 'text-surface' }, text)
            ]
        });
    };

    return [
        pageHeader(_('Logs'), _('Inspect the latest events, pause refresh or download a copy for diagnosis.'), [
            btn(_('Debug report'), { variant: 'outline', icon: 'bug', onClick: async () => {
                const data = await run(api('debug'));
                download('exodus-debug.md', data.content, 'text/markdown');
                toast(_('The report hides server addresses, passwords and subscription links. Check it before you share it.'), 'info');
            } })
        ]),
        tabs('logs', [
            ['app', _('Exodus'), logView('app')],
            ['core', _('Core'), logView('core')],
            ['web', _('Integration'), logView('web')]
        ])
    ];
}

function pageUpdates() {
    const pageToken = renderToken;
    const container = E('div', { class: 'contents' });
    const lowSpace = { value: null };
    const logStatus = E('p', { class: 'log-status', role: 'status', id: nextId() }, _('Loading log…'));
    const logView = E('textarea', { class: 'textarea', 'aria-label': _('Update log'), 'aria-describedby': logStatus.id, placeholder: _('Loading log…'), rows: 10, wrap: 'off', readonly: true, spellcheck: 'false' });
    let logLoaded = false;
    const pollLog = async () => {
        logView.setAttribute('aria-busy', 'true');
        logStatus.textContent = _('Refreshing log…');
        try {
            const data = await api('log_read', { name: 'update' });
            if (pageToken !== renderToken) return false;
            if (!data || typeof data.content !== 'string') throw Error(_('Router response does not contain log text.'));
            logLoaded = true;
            logView.value = data.content;
            logView.placeholder = _('No log entries yet.');
            logView.scrollTop = logView.scrollHeight;
            logStatus.textContent = data.content.length ? _('Updated at %s', new Date().toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US')) : _('No log entries yet.');
            const lines = data.content.trim().split('\n');
            const last = (lines[lines.length - 1] || '').trim();
            return last === 'success' || last === '[ OK ] Installation complete.' || last.startsWith('error:');
        } catch (error) {
            if (pageToken === renderToken) {
                logStatus.textContent = logLoaded ? _('Could not refresh. Previous log is retained. %s', error.message) : _('Could not load the log. %s', error.message);
                logView.placeholder = logStatus.textContent;
            }
            throw error;
        } finally {
            logView.setAttribute('aria-busy', 'false');
        }
    };
    pollLog().catch(() => {});

    let shown = null;
    const renderVersions = (info) => {
        shown = JSON.stringify(info);
        clear(container);
        const available = updateAvailable(info);
        // update is true, false, or null when github did not answer
        const status = (update, installed) => {
            if (update == null) {
                return badge(_('Unknown'), 'outline');
            }
            if (!installed) {
                return badge(_('Not installed'), 'warning');
            }
            return update ? badge(_('Update available'), 'warning') : badge(_('Up to date'), 'success');
        };
        const version = (label, value, commit) => E('div', {}, [E('dt', {}, label), E('dd', {}, [
            E('span', {class: 'version-value'}, value || '—'),
            value && commit ? E('span', {class: 'version-commit'}, `${_('Commit')} ${commit.substring(0, 7)}`) : null])]);
        const component = (name, subtitle, current, next, badgeEl, currentCommit, nextCommit) => {
            badgeEl.classList.add('update-status', 'status-block');
            return E('article', {class: 'update-component', 'aria-label': name}, [
                E('div', {class: 'update-component-main'}, [
                    E('div', {class: 'update-component-header'}, E('div', {class: 'update-component-name'}, [
                        E('h3', {class: 'update-component-title'}, [name, subtitle ? E('span', {class: 'update-component-subtitle'}, ` | ${subtitle}`) : null])])),
                    E('dl', {class: 'update-versions'}, [version(_('Installed'), current, currentCommit), version(_('Latest'), next, nextCommit)])]),
                badgeEl]);
        };
        const components = E('div', {class: 'update-components'}, [
            component('Exodus', null, info.app, info.app_latest, status(info.app_update, info.app), info.app_commit, info.app_latest_commit),
            component(_('Core'), CORE_TITLES[info.core_type] || info.core_type, info.core, info.core_latest,
                status(info.core_latest == null ? null : newer(info.core, info.core_latest), info.core))]);
        const environment = E('div', {class: 'update-environment'}, [
            E('h3', {class: 'update-component-title'}, _('Downloads')),
            E('dl', {class: 'update-environment-details'}, [
                E('div', {class: 'update-source'}, [E('dt', {class: 'visually-hidden'}, _('Downloads')), E('dd', {}, info.gh_proxy ? _('through gh-proxy at %s', info.gh_proxy) : _('directly from GitHub'))]),
                E('div', {class: 'update-architecture'}, [E('dt', {}, _('Architecture')), E('dd', {}, info.arch || '—')]),
                E('div', {}, [E('dt', {class: 'visually-hidden'}, _('Free space')), E('dd', {class: 'status-block update-space-summary'}, [formatSize(info.free_space), info.core_size != null
                    ? E('span', {class: 'update-space-note'}, `${_('Core')}: ${formatSize(info.core_size)}`) : null])])])]);
        if (lowSpace.value === null) {
            lowSpace.value = info.free_space != null && info.core_size != null && info.free_space < info.core_size * 1.2;
        }
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
            class: 'updates-panel',
            title: _('Versions'),
            info: [
                _('Exodus and the core are downloaded from GitHub into Entware. Settings, profiles and subscriptions are kept.'),
                _('Exodus has the version of the releases of the project, the same on every router. An update is offered when the code of its branch changes, a change of the readme does not count. The core is compared by its version.'),
                _('The core and the gh-proxy chosen in the installer are kept, run the installer again to change them.'),
                _('GitHub is asked at most every 6 hours, Check again asks now.')
            ],
            action: btn(_('Check again'), { variant: 'outline', size: 'sm', icon: 'refresh-cw', onClick: async () => {
                renderVersions(await run(fetchUpdate(true)));
            } }),
            content: [
                components,
                environment,
                switchField(_('Low flash space mode'), _('Remove the current core before installing the new one, when the update fails for lack of space. The proxy does not work until the new core is installed.'), objRef(lowSpace, 'value'), null, true)
            ],
            footer: E('div', { class: 'row end', style: { width: '100%' } }, updateButton)
        }));
    };

    // the last answer is shown at once, the router answers again from its cache unless GitHub has to be asked
    if (state.update) {
        renderVersions(state.update);
    } else {
        container.appendChild(loader());
    }
    const refreshVersions = () => {
        if (pageToken !== renderToken || state.sessionExpired) return;
        return fetchUpdate().then((info) => {
            if (pageToken === renderToken && !state.sessionExpired && JSON.stringify(info) !== shown) {
                renderVersions(info);
            }
        }).catch((e) => {
            if (pageToken === renderToken && !state.sessionExpired && !shown) {
                clear(container);
                container.appendChild(alertBox('destructive', _('Failed to check for updates'), e.message));
            }
        });
    };
    // Read the RAM result when the background GitHub check finishes; never force a check here.
    refreshVersions();
    pollPage(refreshVersions);

    return [
        pageHeader(_('Updates'), _('Check available versions and update Exodus or the core. Profiles and settings are kept.')),
        E('div', { class: 'stack' }, [container, card({ title: _('Update log'), content: [logStatus, E('div', { class: 'text-surface' }, logView)] })])
    ];
}

// ---------- build info ----------

function newer(current, next) {
    return next != null && (!current || (current !== next && current.replace(/^v/, '') !== next.replace(/^v/, '')));
}

// the branch has no versions: exodus is updated when its code differs from the code of the branch, the core by its version
function updateAvailable(info) {
    return !!info && (info.app_update === true || newer(info.core, info.core_latest));
}

// version and short commit of exodus, like 2026.09.25 · e39aa58
function appBuild(version, commit) {
    return [version, commit ? commit.substring(0, 7) : null].filter(Boolean).join(' · ');
}

// one check at a time: the check at the start and the updates page share the request
function fetchUpdate(force) {
    if (!force && state.updateRequest) {
        return state.updateRequest;
    }
    const request = api('check_update', force ? { force: true } : {}).then((info) => {
        state.update = info;
        renderAboutButton();
        return info;
    }).finally(() => {
        if (state.updateRequest === request) {
            state.updateRequest = null;
        }
    });
    state.updateRequest = request;
    return request;
}

// github is asked at most every few hours, the router keeps the answer
async function checkUpdates() {
    try {
        await fetchUpdate();
    } catch (e) {
        /* the updates page shows the error */
    }
}

let aboutKey = null;

// Build information is available without a persistent status or version badge.
function renderAboutButton() {
    const button = document.getElementById('about');
    const key = lang;
    if (key === aboutKey) {
        return;
    }
    aboutKey = key;
    button.hidden = false;
    button.title = _('Build info');
    button.setAttribute('aria-label', _('Build info'));
    append(clear(button), icon('info'));
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
    const firmware = info.firmware ? `${info.os || 'Asuswrt'} ${info.firmware}` : '';
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
        update.app_update === true ? `Exodus ${appBuild(update.app, update.app_commit) || '—'} → ${appBuild(update.app_latest, update.app_latest_commit)}` : null,
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
                E('a', { class: 'btn btn-outline', href: `${repo}/tree/${info.ref || 'asuswrt'}`, target: '_blank', rel: 'noopener' }, [icon('github'), 'GitHub'])
            ])
        ]
    });
}

// ---------- router ----------

const pages = [
    ['status', _('Devices'), pageStatus, async () => {
        await Promise.all([reloadStates(), refreshStatus()]);
    }],
    ['profiles', _('Profiles'), pageProfiles, async () => {
        const [files] = await Promise.all([api('files'), reloadStates()]);
        state.dirs = files.dirs || {};
    }],
    ['settings', _('Settings'), pageSettings, async () => {
        const [interfaces, proxies, hwid] = await Promise.all([
            api('interfaces').catch(() => ({ interfaces: [] })),
            api('proxies').catch(() => ({})),
            api('hwid').catch(() => ({}))
        ]);
        state.interfaces = interfaces.interfaces || [];
        state.groups = proxies.groups || [];
        state.nodes = proxies.proxies || [];
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
    hideHelp();
    // the login form stays until the password is entered, start() renders the page then
    if (state.sessionExpired) {
        return;
    }
    const token = ++renderToken;
    state.timers.forEach((t) => clearInterval(t));
    state.timers = [];
    state.pagePollers = [];
    dependents = [];
    liveViews = [];
    state.saveEditor = null;
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
            clear(content).appendChild(alertBox('destructive', _('Failed to load the page'), [
                E('p', {}, e.message), E('p', {}, _('Check the connection to the router and try again.')),
                btn(_('Try again'), {variant: 'outline', icon: 'refresh-cw', onClick: render})
            ]));
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
    if (isDirty() || hasEditorChanges()) {
        ev.preventDefault();
        ev.returnValue = '';
    }
});

// ---------- native session ----------

async function start() {
    state.sessionExpired = false;
    document.getElementById('menu').hidden = false;
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

renderSavebar();
window.addEventListener('resize', hideHelp);
window.addEventListener('scroll', event => {
    if (!helpPopup || (event.target instanceof Node && helpPopup.contains(event.target))) return;
    // Scrolling a marker into view can deliver its scroll event after mouseenter.
    // Preserve anchored help while hovered or focused, without rebuilding its links.
    if (helpAnchor && (helpAnchor.matches(':hover,:focus') || helpPopup.matches(':hover') || helpPopup.contains(document.activeElement))) positionHelp();
    else hideHelp();
}, true);
const brandMark = document.getElementById('brand-mark');
if (brandMark) brandMark.appendChild(logo());
const workspaceLabel = document.getElementById('workspace-label');
if (workspaceLabel) workspaceLabel.textContent = _('Device routing workspace');
document.getElementById('about').addEventListener('click', openAbout);
setInterval(() => {
    if (!state.sessionExpired) {
        checkUpdates();
    }
}, 3 * 3600 * 1000);
document.getElementById('dialog').addEventListener('mousedown', (ev) => {
    if (ev.target.id === 'dialog') {
        closeDialog();
    }
});
document.addEventListener('keydown', (ev) => {
    const overlay = document.getElementById('dialog');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's' && overlay.hidden && !state.sessionExpired && exodusRoot.contains(document.activeElement)) {
        ev.preventDefault();
        const operation = currentPage()[0] === 'editor' ? state.saveEditor : isDirty() ? () => save('none') : null;
        if (operation) Promise.resolve(operation()).catch(() => {});
    }
    if (ev.key === 'Tab' && !overlay.hidden) {
        const nodes = Array.from(overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
    if (ev.key === 'Escape') {
        if (helpPopup && !helpPopup.hidden) {hideHelp(); return;}
        closeDialog();
    }
});

window.addEventListener('exodus-session-expired', () => {
    hideHelp();
    state.sessionExpired = true;
    state.timers.forEach(clearInterval);
    state.timers = [];
    clearInterval(state.statusTimer);
    state.statusTimer = null;
    const banner = document.getElementById('session-warning');
    banner.hidden = false;
    append(clear(banner), [
        E('p', {}, _('Web Admin session expired. Your unsaved changes are kept in this tab.')),
        E('a', {href:'/Main_Login.asp', target:'_blank', rel:'noopener', class:'btn btn-outline'}, _('Sign in to Web Admin')),
        btn(_('Continue after signing in'), {onClick: () => {
            window.ExodusMerlin.resume(); state.sessionExpired = false; banner.hidden = true;
            state.statusTimer = setInterval(refreshStatus, 5000); refreshStatus();
            for (const poll of state.pagePollers) {
                state.timers.push(setInterval(poll, 5000));
                poll();
            }
        }})
    ]);
});
window.addEventListener('pagehide', () => window.ExodusMerlin.dispose());

start();

})();
