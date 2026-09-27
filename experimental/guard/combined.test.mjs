import test from 'node:test';
import assert from 'node:assert/strict';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
import {guardMessage} from '../../web/assets/wallet-guard.js';
import {GuardSession} from './ui/session.js';
import {WALLET,WEBAPP} from './ui/contracts.js';
import {validReceipt} from './synthetic-metadata.mjs';
const wid='a'.repeat(32),aid='d'.repeat(32),key='b'.repeat(64),hash='c'.repeat(64),at='2026-09-26T00:00:00Z';
const before={EditResource:'IRISOPS_GUARDPROBERESOURCE:WRITE',UseResource:'IRISOPS_GUARDPROBERESOURCE:READ'},expected={...before,UseResource:'IRISOPS_GUARDPROBEALTERNATE:READ'};
const response=(body,status=200)=>({status,ok:status<400,json:async()=>structuredClone(body)});
function fixture(){
 let now=1000,override=()=>null;const calls=[],data=new Map([['irisops-guard-recovery-v1','legacy-untouched']]);
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const caps={wallet:{target:WALLET,available:true,reason:'available'},webapp:{target:WEBAPP,available:true,reason:'available'}};
 const fetcher=async(url,o)=>{
  calls.push({url,o});const custom=await override(url,o);if(custom)return custom;
  const web=url.includes('/webapp/'),id=web?aid:wid;
  let body={ok:true};
  if(url.endsWith('/session'))body={actor:'Tester',csrf:'synthetic'};
  else if(url.endsWith('/connect'))body={actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:60};
  else if(url.endsWith('/capabilities'))body=caps;
  else if(url.endsWith('/channels'))body={channel:id,mode:'read-only'};
  else if(url.endsWith('/write-access'))body={mode:o.method==='DELETE'?'read-only':'write-enabled',expiresIn:60};
  else if(url.includes('/wallet/state'))body={name:WALLET,...before};
  else if(url.endsWith('/webapp/state'))body={Enabled:false,configurationHash:hash};
  else if(url.endsWith('/previews'))body={id,recoveryKey:key,target:web?WEBAPP:WALLET,confirmation:'APPLY '+id.slice(0,8),expiresIn:30,before:web?{Enabled:false,configurationHash:hash}:before,expected:web?{Enabled:true,configurationHash:hash}:expected};
  else if(url.endsWith('/execute'))body=web?{id,actor:'Tester',target:WEBAPP,state:'VERIFIED',reason:'availability_and_configuration_match',dispatchCount:1,before:{Enabled:false,configurationHash:hash},expected:{Enabled:true,configurationHash:hash},observed:{Enabled:true,configurationHash:hash},events:[{state:'DISPATCHING',reason:'submitted_once',at},{state:'VERIFIED',reason:'availability_and_configuration_match',at}],rechecks:[],createdUTC:at}:validReceipt();
  return response(body);
 };
 const guard=new CombinedGuard({origin:'http://127.0.0.1:52801',fetcher,storage,clock:()=>now});
 return {guard,caps,calls,data,storage,fetcher,time:n=>{now=n;},override:f=>{override=f;},prepare:async()=>{await guard.login('Tester','synthetic');await guard.enable();return guard.preview(WALLET,expected.EditResource,expected.UseResource);}};
}
test('combined login establishes one native connection and two distinct readonly channels',async()=>{
 const t=fixture();await t.guard.login('Tester','synthetic');assert.ok(t.guard.status.connected);assert.equal(t.guard.status.writing,false);
 assert.equal(t.calls.filter(c=>c.url.endsWith('/connect')).length,1);assert.equal(t.calls.filter(c=>c.url.endsWith('/session')).length,1);
 assert.deepEqual(t.calls.filter(c=>c.url.endsWith('/channels')).map(c=>c.url),['/api/irisops-combined-guard/v1/wallet/channels','/api/irisops-combined-guard/v1/webapp/channels']);
 assert.deepEqual(await t.guard.wallet(WALLET),before);await t.guard.select('webapp');assert.equal((await t.guard.webapp()).Enabled,false);
 assert.ok(t.calls.every(c=>c.url.startsWith('/api/irisops-combined-guard/v1/')));
});
test('combined write grants and pending previews never cross operation kinds',async()=>{
 const t=fixture(),p=await t.prepare();await t.guard.select('webapp');assert.equal(t.guard.status.writing,false);assert.equal(t.guard.status.pendingId,'');
 assert.ok(t.calls.some(c=>c.url.endsWith('/wallet/previews/'+p.id)&&c.o.method==='DELETE'));
 await assert.rejects(t.guard.previewWebapp(true),e=>e.code==='read_only_or_expired_channel');await t.guard.enable();
 const a=await t.guard.previewWebapp(true);await t.guard.select('wallet');assert.ok(t.guard.status.writing);assert.equal(t.guard.status.pendingId,'');
 await assert.rejects(t.guard.execute(a.id,a.confirmation));assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,0);
});
test('combined receipts, proofs and last IDs stay separate; common logout forgets only combined keys',async()=>{
 const t=fixture(),p=await t.prepare();await t.guard.execute(p.id,p.confirmation);await t.guard.select('webapp');assert.equal(t.guard.status.lastId,'');
 await t.guard.enable();const a=await t.guard.previewWebapp(true);await t.guard.execute(a.id,a.confirmation);assert.equal(t.guard.status.lastId,aid);
 assert.equal(t.guard.result.receipt.target,WEBAPP);await t.guard.select('wallet');assert.equal(t.guard.status.lastId,wid);assert.equal(t.guard.result.receipt.target,WALLET);
 assert.ok(!JSON.stringify([p,a,t.guard.status,t.guard.result]).includes(key));assert.equal(t.data.size,3);
 await t.guard.logout();assert.equal(t.calls.filter(c=>c.url.endsWith('/logout')).length,1);assert.deepEqual([...t.data.entries()],[['irisops-guard-recovery-v1','legacy-untouched']]);
 for(const kind of ['wallet','webapp']){await t.guard.select(kind);assert.equal(t.guard.status.connected,false);assert.equal(t.guard.status.lastId,'');}
});
test('partial capabilities permit independent login but never enable the unavailable kind',async()=>{
 const t=fixture();t.caps.webapp={target:WEBAPP,available:false,reason:'native_permission_required'};await t.guard.login('Tester','synthetic');await t.guard.enable();
 await t.guard.select('webapp');assert.equal(t.guard.status.capability,false);const n=t.calls.length;
 await assert.rejects(t.guard.enable(),e=>e.code==='operation_denied');assert.equal(t.calls.length,n+1);assert.ok(t.calls.at(-1).url.endsWith('/capabilities'));
});
test('malformed capability maps fail closed before channel attachment',async()=>{
 for(const value of [{},null,{wallet:{available:true}}, {wallet:{target:WALLET,available:true,reason:'available'},webapp:{target:'/api/admin',available:true,reason:'available'}}]){
  const t=fixture();t.override(url=>url.endsWith('/capabilities')?response(value):null);await assert.rejects(t.guard.login('Tester','synthetic'));
  assert.equal(t.guard.status.connected,false);assert.equal(t.calls.filter(c=>c.url.endsWith('/channels')).length,0);
 }
});
test('shared expiry and unauthorized response invalidate both operation connections',async()=>{
 for(const failure of ['clock','401']){
  const t=fixture();await t.prepare();await t.guard.select('webapp');await t.guard.enable();
  if(failure==='clock')t.time(62000);
  else{t.override(url=>url.endsWith('/webapp/state')?response({error:'expired'},401):null);await assert.rejects(t.guard.webapp());}
  assert.equal(t.guard.status.connected,false);await t.guard.select('wallet');assert.equal(t.guard.status.connected,false);
  await assert.rejects(t.guard.preview(WALLET,expected.EditResource,expected.UseResource));
 }
});
test('cancelling shared login discards late responses at every attach stage',async()=>{
 for(const ending of ['/connect','/capabilities','/wallet/channels','/webapp/channels']){
  const t=fixture();let release,started;const seen=new Promise(r=>{started=r;});
  t.override(async url=>{if(url.endsWith(ending)){started();await new Promise(r=>{release=r;});}});
  const pending=t.guard.login('Tester','synthetic');await seen;t.guard.invalidate();release();await assert.rejects(pending);
  for(const kind of ['wallet','webapp']){await t.guard.select(kind);assert.equal(t.guard.status.connected,false);}
 }
});
test('uncertain dispatch blocks switching and repeated sends, while retaining recovery identity',async()=>{
 const t=fixture(),p=await t.prepare();let release,started;const seen=new Promise(r=>{started=r;});
 t.override(async url=>{if(url.endsWith('/execute')){started();await new Promise(r=>{release=r;});throw Error('synthetic lost response');}});
 const pending=t.guard.execute(p.id,p.confirmation);await seen;await assert.rejects(t.guard.select('webapp'),e=>e.code==='guard_busy');assert.equal(t.guard.kind,'wallet');
 release();await assert.rejects(pending);await assert.rejects(t.guard.execute(p.id,p.confirmation));assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,1);
 await t.guard.select('webapp');await t.guard.select('wallet');assert.equal(t.guard.status.lastId,p.id);assert.equal(t.guard.status.pendingId,'');
});
test('shared route allowlist and wrong-kind methods reject before network',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher);
 for(const path of ['https://evil.invalid','/api/admin','/wallet/../connect','/wallet\\channels','/other/channels'])await assert.rejects(s.request(path));
 assert.throws(()=>t.guard.webapp());await t.guard.select('webapp');assert.throws(()=>t.guard.wallet(WALLET));assert.equal(t.calls.length,0);
});
test('failed shared logout invalidates both local authorizations and never retries',async()=>{
 const t=fixture();await t.prepare();t.override(url=>{if(url.endsWith('/logout'))throw Error('lost');});await assert.rejects(t.guard.logout(),e=>e.code==='logout_unconfirmed');
 for(const kind of ['wallet','webapp']){await t.guard.select(kind);assert.equal(t.guard.status.connected,false);assert.equal(t.guard.status.writing,false);}
 assert.equal(t.calls.filter(c=>c.url.endsWith('/logout')).length,1);
});

for(const failure of ['throw','no-effect'])for(const remoteFailure of [false,true])test(`combined logout preserves ${failure} cleanup failure with remote failure=${remoteFailure}`,async()=>{
 const t=fixture(),p=await t.prepare();await t.guard.execute(p.id,p.confirmation);
 await t.guard.select('webapp');await t.guard.enable();const w=await t.guard.previewWebapp(true);await t.guard.execute(w.id,w.confirmation);
 const walletKey=[...t.data.keys()].find(k=>k.startsWith('combined:wallet:'));
 const webKey=[...t.data.keys()].find(k=>k.startsWith('combined:webapp:'));
 assert.ok(walletKey&&webKey);
 const remove=t.storage.removeItem;t.storage.removeItem=k=>{if(k===walletKey){if(failure==='throw')throw Error('storage denied');return;}return remove(k);};
 if(remoteFailure)t.override(url=>{if(url.endsWith('/logout'))throw Error('remote lost');});
 let error;try{await t.guard.logout();}catch(e){error=e;}
 assert.equal(error?.code,remoteFailure?'logout_and_recovery_forget_failed':'recovery_forget_failed');
 assert.match(guardMessage(error),/keys could not be removed/);assert.doesNotMatch(guardMessage(error),/keys cleared/);
 assert.equal(t.data.has(walletKey),true);assert.equal(t.data.has(webKey),false);assert.equal(t.data.get('irisops-guard-recovery-v1'),'legacy-untouched');
 assert.equal(t.guard.status.connected,false);assert.equal(t.guard.status.writing,false);
 await t.guard.select('wallet');assert.equal(t.guard.status.connected,false);
 assert.equal(t.calls.filter(c=>c.url.endsWith('/logout')).length,1);
});
