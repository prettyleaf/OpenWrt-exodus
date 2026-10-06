import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createTransport, encode, decode} = require('../../asuswrt/opt/share/exodus/www/merlin.js');
test('firmware jQuery bundle loads before state.js installs RequireJS', ()=>{
    const asp = readFileSync(new URL('../../asuswrt/opt/share/exodus/www/Exodus.asp', import.meta.url), 'utf8');
    const scripts = [...asp.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
    assert.ok(scripts.indexOf('/js/jquery.js') < scripts.indexOf('/state.js'));
    assert.equal(scripts.filter(path=>path==='/js/jquery.js').length, 1);
});
const json = value => ({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(value)});
function fixture(options={}) {
    let packet, snapshot, calls=[], counter=0, settings={other:'initial'}, clock=100000;
    const transport = createTransport({
        now:()=>clock, sleep:async ms=>{clock+=ms;}, id:()=> (++counter).toString(16).padStart(32,'0'),
        submit:async(value,script)=>{
            if(value==null) {snapshot=script.slice('restart_exodus_ui_settings_'.length); return;}
            calls.push(value); packet=JSON.parse(value.exodus_packet); settings.other='new-'+packet.seq;
        },
        fetch:async url=>{
            if(url.includes('appGet')) return json({get_custom_settings:{...settings}});
            if(url.includes(snapshot+'.json')) return json({v:1,id:snapshot,seq:0,phase:'complete',status:200,body:encode(JSON.stringify(settings))});
            if(url.includes('cache')) return json(url.includes('heartbeat') ? {v:1,generated:clock/1000} :
                {v:1,key:url.includes('status')?'status':'log-app',generated:clock/1000,status:200,body:encode(JSON.stringify({running:true}))});
            const first=packet.id==='1'.padStart(32,'0');
            return json({v:1,id:packet.id,seq:packet.seq,phase:packet.seq===packet.count-1?'complete':'accepted',status:options.failFirst && first?400:200,body:encode(options.failFirst && first?'{"error":"rejected"}':'{"success":true}')});
        }, ...options
    });
    return {transport,calls};
}
test('unicode codec', ()=>assert.equal(decode(encode('Привет 😀 <% x %>')), 'Привет 😀 <% x %>'));
test('packet limit and fresh foreign settings before each post', async()=>{
    const f=fixture(), progress=[]; await f.transport.request('file_write',{path:'/opt/etc/exodus/profiles/demo.yaml',content:'Привет 😀'.repeat(400),onProgress:part=>progress.push(part)});
    assert.ok(f.calls.length>1);
    for(let i=0;i<f.calls.length;i++) {
        assert.ok(JSON.parse(f.calls[i].exodus_packet).data.length<=1800);
        assert.ok(Buffer.byteLength(JSON.stringify(f.calls[i]))<=7680);
        assert.equal(f.calls[i].other, i===0?'initial':'new-'+(i-1));
    }
    assert.equal(progress.length,f.calls.length);
    assert.equal(progress.at(-1).completed,progress.at(-1).total);
    assert.ok(progress.every((part,index)=>part.completed===index+1));
});
test('8 MiB upload keeps progressing beyond five minutes', async()=>{
    const f=fixture();
    assert.equal((await f.transport.request('profile_upload',{name:'large.yaml',content:'x'.repeat(8388608)})).success,true);
    assert.ok(f.calls.length>6000);
});
test('response id and seq mismatch is not success', async()=>{
    const f=fixture({fetch:async url=>url.includes('appGet')?json({get_custom_settings:{}}):json({v:1,id:'f'.repeat(32),seq:7,phase:'complete',status:200,body:encode('{}')})});
    await assert.rejects(f.transport.request('service',{op:'start'}), /unknown|timed out/i);
});
test('failed request does not poison queue', async()=>{
    const f=fixture({failFirst:true});
    await assert.rejects(f.transport.request('service',{op:'start'}));
    assert.equal((await f.transport.request('service',{op:'start'})).success,true);
    f.transport.dispose();
});
test('frequent reads never post and coalesce during upload', async()=>{
    const f=fixture(); const results=await Promise.all(Array.from({length:100},()=>f.transport.request('status')));
    assert.equal(f.calls.length,0); assert.ok(results.every(x=>x.running));
});
test('navigation and passive update checks use RAM without apply posts', async()=>{
    let posts=0, clock=Date.now();
    const f=createTransport({now:()=>clock,submit:async()=>{posts++;throw Error('unexpected apply event');},
        fetch:async url=>{
            const key=url.split('/').at(-1).replace('.json','');
            return json(key==='heartbeat'?{v:1,generated:clock/1000}:{v:1,key,generated:clock/1000,status:200,body:encode('{"success":true}')});
        }});
    for(const action of ['load','files','hosts','interfaces','proxies','hwid','about','check_update']) assert.equal((await f.request(action)).success,true);
    assert.equal(posts,0);
});
test('stale cache is not running', async()=>{
    const f=fixture({fetch:async()=>json({v:1,key:'status',generated:1,status:200,body:encode('{"running":true}')})});
    await assert.rejects(f.transport.request('status'),/stale/i);
});
test('cache freshness uses router HTTP Date despite client clock skew', async()=>{
    for (const offset of [-86400000,86400000]) {
        const routerTime=1791223895;
        const f=createTransport({now:()=>routerTime*1000+offset,
            submit:async()=>{throw Error('healthy cache must not post');},
            fetch:async url=>({...json({v:1,key:url.includes('heartbeat')?undefined:'status',generated:routerTime,status:200,body:encode('{"running":true}')}),
                headers:{get:name=>name==='date'?new Date(routerTime*1000).toUTCString():null}})});
        assert.equal((await f.request('status')).running,true);
    }
});
test('parallel stale reads share one read-only cache recovery event', async()=>{
    let repaired=false, posts=0, clock=100000;
    const id='a'.repeat(32);
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=>id,
        submit:async(settings,script)=>{assert.equal(settings,null);assert.equal(script,'restart_exodus_ui_health_'+id);posts++;repaired=true;},
        fetch:async url=>{
            if(url.includes('/responses/')) return json({v:1,id,seq:0,phase:'complete',status:200,body:encode(JSON.stringify({router_time:clock/1000}))});
            const key=url.split('/').at(-1).replace('.json','');
            return json({v:1,key,generated:repaired?clock/1000:1,status:200,body:encode('{"running":true}')});
        }});
    const result=await Promise.all([f.request('status'),f.request('load'),f.request('hosts')]);
    assert.ok(result.every(value=>value.running));assert.equal(posts,1);
});
test('recovery cannot hide cache that remains stale', async()=>{
    let clock=100000, posts=0;const id='b'.repeat(32);
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=>id,
        submit:async()=>posts++, fetch:async url=>url.includes('/responses/')?
            json({v:1,id,seq:0,phase:'complete',status:200,body:encode(JSON.stringify({router_time:clock/1000}))}):
            json({v:1,key:'status',generated:1,status:200,body:encode('{"running":true}')})});
    await assert.rejects(f.request('status'),/stale/i);assert.equal(posts,1);
});
test('recovery waits for the next cache cycle after a router clock correction', async()=>{
    let clock=100000,reads=0;const id='e'.repeat(32);
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=>id,submit:async()=>{},
        fetch:async url=>url.includes('/responses/')?
            json({v:1,id,seq:0,phase:'complete',status:200,body:encode(JSON.stringify({router_time:clock/1000}))}):
            json({v:1,key:'status',generated:++reads<3?1:clock/1000,status:200,body:encode('{"running":true}')})});
    assert.equal((await f.request('status')).running,true);
});
test('stale read waits for active native mutation before submitting recovery', async()=>{
    let clock=100000,serial=0,snapshot,packet,repaired=false,healthPosted=false,release;
    const hold=new Promise(resolve=>{release=resolve;});
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=> (++serial).toString(16).padStart(32,'0'),
        submit:async(settings,script)=>{
            if(script?.includes('_settings_')) {snapshot=script.split('_settings_')[1];await hold;}
            else if(script?.includes('_health_')) {healthPosted=true;repaired=true;}
            else packet=JSON.parse(settings.exodus_packet);
        },fetch:async url=>{
            if(url.includes('/cache/')) return json({v:1,key:'status',generated:repaired?clock/1000:1,status:200,body:encode('{"running":true}')});
            const id=url.match(/([0-9a-f]{32})\.json/)[1];
            return json({v:1,id,seq:0,phase:'complete',status:200,body:encode(id===snapshot?'{}':id===packet?.id?'{"success":true}':JSON.stringify({router_time:clock/1000}))});
        }});
    const write=f.request('service',{op:'start'}),read=f.request('status');
    await new Promise(resolve=>setImmediate(resolve));
    const raced=healthPosted;release();
    await Promise.all([write,read]);
    assert.equal(raced,false,'health must not replace an in-flight native form navigation');
    assert.equal(healthPosted,true);
});
test('oversize rejected before post', async()=>{
    const f=fixture(); await assert.rejects(f.transport.request('file_write',{content:'я'.repeat(4194305)}), /8 MiB/);
    assert.equal(f.calls.length,0);
});
test('html login response stops queue', async()=>{
    const f=fixture({fetch:async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>'<html>Login</html>'})});
    await assert.rejects(f.transport.request('load'),/Web Admin/);
    await assert.rejects(f.transport.request('load'),/Web Admin/);
    assert.equal(f.calls.length,0);
});
test('dispose stops requests', async()=>{
    const f=fixture(); f.transport.dispose(); await assert.rejects(f.transport.request('load'),/closed/i);
});
test('firmware HTML 404 while pending does not expire session', async()=>{
    let packet, polls=0, clock=0, expired=0, snapshot=false;
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=> '1'.repeat(32),
        onLogin:()=>expired++, submit:async settings=>{snapshot=settings==null;if(settings) packet=JSON.parse(settings.exodus_packet);},
        fetch:async url=>{
            if(url.includes('appGet')) return json({get_custom_settings:{}});
            if(++polls===1) return {ok:false,status:404,text:async()=>'<html><body>404 Not Found</body></html>'};
            return json({v:1,id:packet?.id || '1'.repeat(32),seq:0,phase:'complete',status:200,body:encode(snapshot?'{}':'{"success":true}')});
        }});
    await f.request('service',{op:'start'}); await f.request('service',{op:'start'}); assert.equal(expired,0);
});
function settingsFixture(foreign, missing=false) {
    let packet, snapshotId, clock=0, serial=0, submissions=[];
    const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=> (++serial).toString(16).padStart(32,'0'),
        submit:async(settings,script)=>{
            if(!settings) snapshotId=script.slice('restart_exodus_ui_settings_'.length);
            else {submissions.push(settings); packet=JSON.parse(settings.exodus_packet);}
        }, fetch:async url=>{
            // Actual minimum firmware getter loses spaces/empty values or returns invalid JSON.
            if(url.includes('appGet')) return missing ? {ok:true,status:200,text:async()=>'{"get_custom_settings": new Object()}'} : json({get_custom_settings:{addon_title:'Cool'}});
            const id=url.match(/([0-9a-f]{32})\.json/)[1];
            return json({v:1,id,seq:0,phase:'complete',status:200,body:encode(JSON.stringify(id===snapshotId?foreign:{success:true}))});
        }});
    return {transport:f,submissions};
}
test('complete foreign settings including spaces and empty values are preserved', async()=>{
    const foreign={addon_title:'Cool Addon 1.0',empty:'',literal:'"Привет 😀" <% test %>',spaced:'  keep  ',error:'ordinary foreign setting'};
    const f=settingsFixture(foreign); await f.transport.request('service',{op:'start'});
    for(const [key,value] of Object.entries(foreign)) assert.equal(f.submissions[0][key],value);
});
test('missing shared settings starts from empty object without firmware eval', async()=>{
    const f=settingsFixture({},true); assert.equal((await f.transport.request('service',{op:'start'})).success,true);
    assert.deepEqual(Object.keys(f.submissions[0]),['exodus_packet']);
});
test('native snapshot form omits amng_custom and packet form restores it', async()=>{
    const previousDocument=globalThis.document, previousLocation=globalThis.location;
    let clock=0, serial=0;
    const posts=[], fields=Object.fromEntries(['flag','current_page','next_page','action_script','amng_custom'].map(key=>[key,{value:'',disabled:false}]));
    const form={elements:fields,submit(){posts.push(Object.fromEntries(Object.entries(fields).filter(([,field])=>!field.disabled).map(([name,field])=>[name,field.value])));}};
    globalThis.document={getElementById:()=>form}; globalThis.location={pathname:'/user3.asp'};
    try {
        const f=createTransport({now:()=>clock,sleep:async ms=>{clock+=ms;},id:()=> (++serial).toString(16).padStart(32,'0'),
            fetch:async url=>{
                const current=posts.at(-1), snapshot=!('amng_custom' in current);
                const id=snapshot?current.action_script.slice('restart_exodus_ui_settings_'.length):JSON.parse(current.amng_custom).exodus_packet;
                return json({v:1,id:snapshot?id:JSON.parse(id).id,seq:0,phase:'complete',status:200,body:encode(snapshot?'{"other":"Cool Addon 1.0"}':'{"success":true}')});
            }});
        assert.equal((await f.request('service',{op:'start'})).success,true);
        assert.equal(posts.length,2);
        assert.ok(posts.every(post=>post.flag==='background'), 'native requests must not redirect or show firmware Loading');
        assert.ok(!('amng_custom' in posts[0]));
        assert.equal(posts[1].action_script,'restart_exodus_ui');
        assert.equal(JSON.parse(posts[1].amng_custom).other,'Cool Addon 1.0');
        assert.equal(posts[1].current_page,'user3.asp');
    } finally {globalThis.document=previousDocument;globalThis.location=previousLocation;}
});
