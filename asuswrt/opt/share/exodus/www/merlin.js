/* Native Merlin forms and authenticated RAM responses. No addon credentials. */
(function (root) {
    'use strict';
    const bytes = value => new TextEncoder().encode(value);
    function encode(value) {
        const data = bytes(value);
        let binary = '';
        for (let i = 0; i < data.length; i += 32768) binary += String.fromCharCode(...data.subarray(i, i + 32768));
        return btoa(binary);
    }
    function decode(value) {
        return new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
    }
    function createTransport(options = {}) {
        const now = options.now || Date.now;
        const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
        const fetcher = options.fetch || root.fetch.bind(root);
        const makeId = options.id || (() => Array.from(root.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
        let closed = false, login = false, active = false;
        const queue = [], reads = new Map();
        let recovery = null, routerOffset = 0, lastRecovery = -Infinity;
        let controller = new AbortController();
        const check = () => { if (login) throw Error('Web Admin session expired. Sign in to the router again; your draft is kept in this tab.'); if (closed) throw Error('Transport closed'); };
        function expire() {
            login = true;
            controller.abort();
            if (options.onLogin) options.onLogin();
            else if (root.dispatchEvent) root.dispatchEvent(new Event('exodus-session-expired'));
            check();
        }
        async function get(url, timing) {
            check();
            const result = await fetcher(url, {credentials:'same-origin', cache:'no-store', signal:controller.signal});
            const text = await result.text();
            if (timing) timing.routerTime = Date.parse(result.headers?.get('date')) / 1000;
            if (result.status === 401 || result.status === 403) expire();
            if (!result.ok) throw Error('Router HTTP ' + result.status);
            if (/^\s*</.test(text)) expire();
            let data;
            try { data = JSON.parse(text); } catch (_) { throw Error('Invalid router response'); }
            check();
            return data;
        }
        function unpack(envelope) {
            const body = JSON.parse(decode(envelope.body));
            if (envelope.status !== 200 || body.error) throw Error(body.error || 'Router operation failed (' + envelope.status + ')');
            return body;
        }
        async function readCache(action, params) {
            const name = params.name;
            if (action === 'log_read' && !['app','core','update','web','debug'].includes(name)) throw Error('Unknown log');
            const key = action === 'log_read' ? 'log-' + name : action;
            const timing = {};
            const envelope = await get('/ext/exodus/cache/' + key + '.json', timing);
            if (envelope.v !== 1 || envelope.key !== key) throw Error('Invalid cache response');
            const live = action === 'status' ? envelope : await get('/ext/exodus/cache/heartbeat.json', timing);
            // httpd Date and generated use the same router clock. Client drift
            // or NTP correction must not make a healthy RAM cache unusable.
            const routerTime = Number.isFinite(timing.routerTime) ? timing.routerTime : now()/1000 + routerOffset;
            const age = routerTime - live.generated;
            if (live.v !== 1 || typeof live.generated !== 'number' || !Number.isFinite(age) || age < -5 || age > 15) throw Error('Router cache is stale');
            return unpack(envelope);
        }
        async function cache(action, params) {
            try { return await readCache(action, params); }
            catch (error) {
                check();
                if (!/Router cache is stale|Router HTTP 404/.test(error.message)) throw error;
                if (!recovery) {
                    if (now() - lastRecovery < 30000) throw error;
                    lastRecovery = now();
                    // All native posts share one firmware iframe. Wait for an
                    // active upload/mutation so health cannot cancel its POST.
                    recovery = new Promise((resolve,reject) => {
                        queue.push({health:true,resolve,reject});
                        drain();
                    }).finally(() => { recovery = null; });
                }
                try { await recovery; }
                catch (failure) { check(); throw Error('Router cache is stale; recovery failed: ' + failure.message); }
                // A running worker can still hold the pre-NTP generation, or
                // be rebuilding a missing file. Allow its next five-second
                // cycle to finish without sending another native event.
                const deadline = now() + 10000;
                while (true) {
                    try { return await readCache(action, params); }
                    catch (pending) {
                        check();
                        if (!/Router cache is stale|Router HTTP 404/.test(pending.message) || now() >= deadline) throw pending;
                        await sleep(500);
                    }
                }
            }
        }
        const submit = options.submit || (async (settings, script = 'restart_exodus_ui') => {
            check();
            const form = root.document.getElementById('exodus_apply');
            if (!form) throw Error('Native apply form is missing');
            form.elements.current_page.value = root.location.pathname.replace(/^\//, '');
            form.elements.next_page.value = form.elements.current_page.value;
            // Merlin start_apply.htm otherwise reloads the parent after every post.
            form.elements.flag.value = 'background';
            form.elements.action_script.value = script;
            // A snapshot event must not invoke firmware's replacement writer.
            form.elements.amng_custom.disabled = settings == null;
            form.elements.amng_custom.value = settings == null ? '' : JSON.stringify(settings);
            form.submit();
        });
        async function recoverCache() {
            const id = makeId(), deadline = now() + 30000;
            // Omit amng_custom: recovery never writes addon settings or starts
            // the proxy. Concurrent reads share this single native event.
            await submit(null, 'restart_exodus_ui_health_' + id);
            while (now() < deadline) {
                check(); await sleep(500);
                let result;
                try { result = await get('/ext/exodus/responses/' + id + '.json'); }
                catch (error) { check(); if (!/HTTP 404|Failed to fetch|network/i.test(error.message)) throw error; }
                if (result && result.v === 1 && result.id === id && result.seq === 0) {
                    if (result.phase === 'error' || result.phase === 'complete') {
                        const body = unpack(result);
                        if (typeof body.router_time !== 'number' || !Number.isFinite(body.router_time)) throw Error('Invalid router clock');
                        routerOffset = body.router_time - now()/1000;
                        return;
                    }
                }
            }
            throw Error('Cache recovery timed out. Run exodus web restart on the router and check the Web log.');
        }
        async function settingsSnapshot() {
            const id = makeId(), script = 'restart_exodus_ui_settings_' + id;
            const deadline = now() + 30000;
            await submit(null, script);
            let sent = now(), retries = 0, polls = 0;
            while (now() < deadline) {
                check(); await sleep(Math.min(500,100+100*polls++));
                let result;
                try { result = await get('/ext/exodus/responses/' + id + '.json'); }
                catch (error) { check(); if (!/HTTP 404|Failed to fetch|network/i.test(error.message)) throw error; }
                if (result && result.v === 1 && result.id === id && result.seq === 0) {
                    if (result.phase === 'error' || result.status !== 200) return unpack(result);
                    if (result.phase === 'complete') return JSON.parse(decode(result.body));
                }
                if (now() - sent >= 10000 && retries < 2) { retries++; await submit(null,script); sent=now(); }
            }
            throw Error('Addon settings snapshot timed out; no packet was submitted.');
        }
        async function sendPacket(packet) {
            // Firmware's getter truncates spaces/empty values; use a fresh encoded snapshot.
            const foreign = await settingsSnapshot();
            if (!foreign || typeof foreign !== 'object' || Array.isArray(foreign)) throw Error('Invalid addon settings');
            const settings = {...foreign, exodus_packet: JSON.stringify(packet)};
            for (const [key, value] of Object.entries(settings)) {
                if (bytes(key).length > 29 || typeof value !== 'string' || bytes(value).length > 2999) throw Error('Addon setting exceeds firmware limit');
            }
            if (bytes(JSON.stringify(settings)).length > 7680) throw Error('Addon settings storage is full');
            check();
            await submit(settings);
        }
        async function perform(raw, progress) {
            const id = makeId(), payload = encode(raw), count = Math.ceil(payload.length/1800);
            for (let seq=0; seq<count; seq++) {
                // Each accepted part advances the transfer; final execution has its own deadline.
                const deadline = now() + 300000;
                const packet = {v:1,id,seq,count,data:payload.slice(seq*1800,(seq+1)*1800)};
                let retries = 0, sent = 0, acknowledged = false, polls = 0;
                await sendPacket(packet); sent = now();
                while (now() < deadline) {
                    check();
                    await sleep(Math.min(500,100+100*polls++));
                    let result;
                    try { result = await get('/ext/exodus/responses/' + id + '.json'); }
                    catch (error) { check(); if (!/HTTP 404|Failed to fetch|network/i.test(error.message)) throw error; }
                    if (result && result.v === 1 && result.id === id && result.seq === seq) {
                        if (result.phase === 'error') return unpack(result);
                        if (result.phase === 'complete' && seq === count-1) {
                            const body = unpack(result);
                            if (progress) progress({completed:count,total:count});
                            return body;
                        }
                        if (result.phase === 'accepted' && seq < count-1) {
                            if (progress) progress({completed:seq+1,total:count});
                            acknowledged = true; break;
                        }
                        if (result.phase === 'running') { sent = now(); continue; }
                    }
                    if (now() - sent >= 10000) {
                        if (retries >= 2) throw Error('Request timed out; operation outcome is unknown. Check router state before retrying.');
                        retries++;
                        await sendPacket(packet); sent = now();
                    }
                }
                if (!acknowledged && seq < count-1) break;
            }
            throw Error('Request timed out; operation outcome is unknown. Check router state before retrying.');
        }
        async function drain() {
            if (active) return;
            active = true;
            while (queue.length) {
                const item = queue.shift();
                try { check(); item.resolve(await (item.health ? recoverCache() : perform(item.raw,item.progress))); }
                catch (error) { item.reject(error); }
            }
            active = false;
        }
        function request(action, params = {}) {
            try {
                check();
                if ((action === 'file_write' || action === 'profile_upload') && bytes(params.content || '').length > 8388608) throw Error('File exceeds 8 MiB');
                if (['status','log_read','load','files','hosts','interfaces','proxies','hwid','about'].includes(action) || (action === 'check_update' && params.force !== true)) {
                    const key = action + ':' + (params.name || '');
                    if (!reads.has(key)) reads.set(key, cache(action,params).finally(()=>reads.delete(key)));
                    return reads.get(key);
                }
                const raw = JSON.stringify({...params,action});
                if (bytes(raw).length > 16777216) throw Error('Request exceeds 16 MiB');
                return new Promise((resolve,reject) => {
                    const item = {raw,resolve,reject,progress:typeof params.onProgress==='function'?params.onProgress:null};
                    if (action === 'check_update' && params.force !== true) queue.push(item);
                    else {
                        const index = queue.findIndex(x=>x.raw && JSON.parse(x.raw).action==='check_update');
                        queue.splice(index < 0 ? queue.length : index,0,item);
                    }
                    drain();
                });
            } catch (error) { return Promise.reject(error); }
        }
        return {request, resume() { if (closed) throw Error('Transport closed'); login=false; controller=new AbortController(); }, dispose() {closed=true; controller.abort(); for (const item of queue.splice(0)) item.reject(Error('Transport closed')); }};
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = {createTransport,encode,decode};
    else root.ExodusMerlin = createTransport();
})(typeof window === 'undefined' ? globalThis : window);
