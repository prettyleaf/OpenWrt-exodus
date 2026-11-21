import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../asuswrt/opt/share/exodus/www/app.js', import.meta.url), 'utf8');
function load(name, next, globals = {}) {
    let start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} exists`);
    if (source.slice(start - 6, start) === 'async ') start -= 6;
    let end = source.indexOf(`\nfunction ${next}(`, start);
    if (end === -1) end = source.indexOf(`\nasync function ${next}(`, start);
    return vm.runInNewContext(`${source.slice(start, end)}; ${name}`, globals);
}

test('update results distinguish failure, interruption, running and success', () => {
    const result = load('updateLogState', 'pageUpdates');
    assert.equal(result({content:'success\n', running:true}), 'running');
    assert.equal(result({content:'error: network\n', running:false}), 'error');
    assert.equal(result({content:'[ OK ] Installation complete.\n', running:false}), 'success');
    assert.equal(result({content:'downloading\n', running:false}), 'interrupted');
    assert.equal(result({content:'', running:false}), 'idle');
});

test('save retains submitted snapshot, later edits stay dirty, and failure leaves baseline unchanged', async()=>{
    const state={invalid:new Set(),config:{nested:{value:'original'}},draft:{nested:{value:'submitted'}}};
    let release, submitted, dirty;
    const save=load('save','serviceOp',{state,clone:value=>JSON.parse(JSON.stringify(value)),
        api:async(_,params)=>{submitted=params.config;return new Promise((resolve,reject)=>{release={resolve,reject};});},
        run:p=>p,_:s=>s,updateDirty:()=>{dirty=JSON.stringify(state.config)!==JSON.stringify(state.draft);}});
    const saving=save('none');
    state.draft.nested.value='later';
    assert.equal(submitted.nested.value,'submitted','API receives an isolated snapshot');
    release.resolve({});await saving;
    assert.equal(state.config.nested.value,'submitted');
    assert.equal(state.draft.nested.value,'later');
    assert.equal(dirty,true);
    const failed=save('none');release.reject(Error('failed'));
    await assert.rejects(failed,/failed/);
    assert.equal(state.config.nested.value,'submitted');
});

function statusHarness() {
    let now=0, id=0, calls=0;
    const timers=new Map(), pending=[];
    const state={sessionExpired:false,statusTimer:null,statusFastTimer:null,statusRequest:null,statusGeneration:0};
    const schedule=(fn,delay,repeat)=>{timers.set(++id,{fn,at:now+delay,delay,repeat});return id;};
    const globals={state,api:()=>{calls++;return new Promise(resolve=>pending.push(resolve));},
        renderAboutButton:()=>{},liveViews:[],
        setInterval:(fn,d)=>schedule(fn,d,true),setTimeout:(fn,d)=>schedule(fn,d,false),
        clearInterval:i=>timers.delete(i),clearTimeout:i=>timers.delete(i)};
    const begin=source.indexOf('async function refreshStatus('), end=source.indexOf('\nfunction btn(',begin);
    const polling=vm.runInNewContext(`${source.slice(begin,end)}
; ({refreshStatus,startStatusPolling,stopStatusPolling,fastStatusPolling})`,globals);
    return {state,polling,get calls(){return calls;},get timers(){return timers.size;},
        async settle(value={running:true}) {pending.shift()?.(value);await Promise.resolve();await Promise.resolve();},
        async tick(ms) {const until=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;if(next[1].repeat)next[1].at+=next[1].delay;else timers.delete(next[0]);next[1].fn();await Promise.resolve();}now=until;}};
}

test('service status fast polling lasts 30 seconds then resumes five-second polling',async()=>{
    const h=statusHarness();h.polling.fastStatusPolling();
    await h.tick(1000);assert.equal(h.calls,1);await h.settle();
    await h.tick(1000);assert.equal(h.calls,2);await h.settle();
    await h.tick(28000);await h.settle();const atExpiry=h.calls;
    await h.tick(4999);assert.equal(h.calls,atExpiry);
    await h.tick(1);assert.equal(h.calls,atExpiry+1);
});

test('status requests never overlap and repeated actions extend one bounded fast window',async()=>{
    const h=statusHarness();h.polling.fastStatusPolling();
    await h.tick(20000);assert.equal(h.calls,1);
    h.polling.fastStatusPolling();assert.equal(h.timers,2);
    await h.tick(15000);assert.equal(h.calls,1);await h.settle();
    await h.tick(1000);assert.equal(h.calls,2);await h.settle();
    await h.tick(14000);await h.settle();const expired=h.calls;
    await h.tick(4999);assert.equal(h.calls,expired);
    await h.tick(1);assert.equal(h.calls,expired+1);
});

test('status teardown clears fast timers and ignores late session results',async()=>{
    const h=statusHarness();h.polling.fastStatusPolling();await h.tick(1000);
    h.state.sessionExpired=true;h.polling.stopStatusPolling();assert.equal(h.timers,0);
    await h.settle();assert.equal(h.state.status,undefined);
    await h.tick(60000);assert.equal(h.calls,1);
    h.state.sessionExpired=false;h.polling.startStatusPolling();
    await h.tick(5000);assert.equal(h.calls,2);
    h.polling.stopStatusPolling();assert.equal(h.timers,0);
    assert.match(source,/pagehide[^\n]*|pagehide/);
    assert.match(source,/addEventListener\('pagehide',[^]*?stopStatusPolling\(\)/);
});

test('service actions and config apply enter fast polling only after dispatch succeeds',async()=>{
    let release, fast=0;
    const globals={api:()=>new Promise((resolve,reject)=>{release={resolve,reject};}),run:p=>p,_:s=>s,
        fastStatusPolling:()=>fast++,state:{invalid:new Set(),draft:{config:{profile:'file:a'}},config:{config:{profile:'file:a'}}},clone:v=>({...v}),updateDirty:()=>{},
        missing:false,profileMissing:()=>globals.missing,toast:()=>{}};
    const service=load('serviceOp','openDashboard',globals);
    const action=service('start');assert.equal(fast,0);release.resolve({});await action;assert.equal(fast,1);
    const failed=service('stop');release.reject(Error('dispatch failed'));await assert.rejects(failed);assert.equal(fast,1);
    // a start without a profile is not dispatched
    globals.missing=true;release=null;
    await assert.rejects(load('serviceOp','openDashboard',globals)('start'));assert.equal(release,null);globals.missing=false;
    const save=load('save','serviceOp',globals);
    const apply=save('restart');assert.equal(fast,1);release.resolve({});await apply;assert.equal(fast,2);
    assert.match(source.slice(source.indexOf("window.addEventListener('exodus-session-expired'")),/stopStatusPolling\(\)/);
});
