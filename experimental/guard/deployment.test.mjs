import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardSession} from './ui/session.js';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
const id='a'.repeat(32);
function fixture(){
 let state={mode:'READ_ONLY',generation:id,build:'managed-lab-a'},override=()=>null;const calls=[],data=new Map();
 const fetcher=async(url,o)=>{
  calls.push({url,o});const custom=await override(url,o);if(custom)return custom;
  const body=url.endsWith('/session')?{actor:'Tester',csrf:'synthetic'}:url.endsWith('/connect')?{actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:60}:url.endsWith('/deployment')?state:url.endsWith('/channels')?{channel:id,mode:'read-only'}:url.endsWith('/capabilities')?{wallet:{target:'IrisOps_GuardProbeWallet',available:true,reason:'available'},webapp:{target:'/csp/irisops-guard-testweb',available:true,reason:'available'}}:url.endsWith('/write-access')?{mode:'write-enabled',expiresIn:60}:{ok:true};
  if(url.endsWith('/capabilities'))body.policy={generation:id,resources:['IRISOPS_GUARDPROBERESOURCE','IRISOPS_GUARDPROBEALTERNATE']};
  return {status:200,ok:true,json:async()=>structuredClone(body)};
 };
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 return {fetcher,calls,data,storage,state:v=>{state=v;},override:f=>{override=f;}};
}
test('managed session allows only the fixed profile and strictly validates deployment metadata',async()=>{
 const t=fixture();assert.throws(()=>new GuardSession(t.fetcher,()=>0,'https://other.invalid'));
 const s=new GuardSession(t.fetcher,()=>0,'managed');await s.login('Tester','synthetic');assert.equal(s.deploymentMode,'READ_ONLY');assert.ok(t.calls.every(c=>c.url.startsWith('/api/irisops-managed-guard/v1/')));
 for(const bad of [{},{mode:'ACTIVE',generation:id,build:'other'},{mode:'ACTIVE',generation:id,build:'managed-lab-a',secret:'synthetic'}]){
  t.state(bad);await assert.rejects(s.login('Tester','synthetic'));assert.equal(s.connected,false);assert.equal(s.deploymentMode,'UNAVAILABLE');
 }
});
test('managed readonly denies enabling locally even when native capabilities permit both kinds',async()=>{
 const t=fixture(),g=new CombinedGuard({origin:'http://127.0.0.1:52801',fetcher:t.fetcher,storage:t.storage,profile:'managed',clock:()=>0});await g.login('Tester','synthetic');
 for(const kind of ['wallet','webapp']){await g.select(kind);assert.ok(g.status.capability);await assert.rejects(g.enable(),e=>e.code==='deployment_read_only');assert.equal(g.status.writing,false);}
 assert.equal(t.calls.filter(c=>c.url.endsWith('/write-access')).length,0);
});
test('changed deployment generation or inconsistent same-generation state requires reconnect',async()=>{
 for(const change of [{generation:'b'.repeat(32)},{mode:'ACTIVE'},{build:'managed-lab-b'}]){
  const t=fixture(),s=new GuardSession(t.fetcher,()=>0,'managed');await s.login('Tester','synthetic');t.state({mode:'READ_ONLY',generation:id,build:'managed-lab-a',...change});await assert.rejects(s.deploymentState(),e=>e.code==='deployment_changed_reconnect_required');assert.equal(s.connected,false);
 }
});
test('active managed deployment still requires separate readonly channels and explicit enabling',async()=>{
 const t=fixture();t.state({mode:'ACTIVE',generation:id,build:'managed-lab-a'});const g=new CombinedGuard({origin:'http://127.0.0.1:52801',fetcher:t.fetcher,storage:t.storage,profile:'managed',clock:()=>0});await g.login('Tester','synthetic');assert.equal(g.status.writing,false);await g.enable();assert.ok(g.status.writing);await g.select('webapp');assert.equal(g.status.writing,false);
 t.data.set('combined:wallet:irisops-guard-recovery-v1','unchanged');await g.logout();assert.equal(t.data.get('combined:wallet:irisops-guard-recovery-v1'),'unchanged');
});
test('late deployment status cannot revive a cancelled login',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,()=>0,'managed');let release,started;const seen=new Promise(r=>{started=r;});
 t.override(async url=>{if(url.endsWith('/deployment')){started();await new Promise(r=>{release=r;});}});const p=s.login('Tester','synthetic');await seen;s.reset();release();await assert.rejects(p);assert.equal(s.connected,false);
});
test('managed UI accepts only bounded loopback ports while original profiles retain their exact lab boundary',async()=>{
 const t=fixture();const g=new CombinedGuard({origin:'http://127.0.0.1:52802',fetcher:t.fetcher,storage:t.storage,profile:'managed',clock:()=>0});await g.login('Tester','synthetic');assert.ok(g.status.connected);
 for(const origin of ['https://example.com','http://127.0.0.1:80','http://127.0.0.1:99999','http://127.0.0.1:052802','http://127.0.0.1:52802/','http://127.0.0.1:52802.evil'])assert.throws(()=>new CombinedGuard({origin,fetcher:t.fetcher,storage:t.storage,profile:'managed'}));
 assert.throws(()=>new CombinedGuard({origin:'http://127.0.0.1:52802',fetcher:t.fetcher,storage:t.storage,profile:'combined'}));
});
