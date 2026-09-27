import test from 'node:test';
import assert from 'node:assert/strict';
import {WalletGuard,GUARDED_WALLET} from '../../web/assets/wallet-guard.js';
import {validReceipt,validRecovery} from './synthetic-metadata.mjs';
const id='a'.repeat(32),key='b'.repeat(64);
const before={EditResource:'IRISOPS_GUARDPROBERESOURCE:WRITE',UseResource:'IRISOPS_GUARDPROBERESOURCE:READ'};
const expected={...before,UseResource:'IRISOPS_GUARDPROBEALTERNATE:READ'};
function fixture(){
 let now=1000,override=null;const calls=[],data=new Map();
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const fetcher=async(url,o)=>{
  calls.push({url,o});let body;
  if(override){const custom=await override(url,o);if(custom)return custom;}
  if(url.endsWith('/session'))body={actor:'Tester',csrf:'synthetic-csrf'};
  else if(url.endsWith('/connect'))body={connected:true,actor:'Tester',authorizationSeconds:60};
  else if(url.endsWith('/channels'))body={channel:id,mode:'read-only'};
  else if(url.endsWith('/write-access'))body={mode:o.method==='DELETE'?'read-only':'write-enabled',expiresIn:60};
  else if(url.includes('/wallet?'))body={name:GUARDED_WALLET,...before};
  else if(url.endsWith('/previews'))body={id,recoveryKey:key,target:GUARDED_WALLET,confirmation:'APPLY aaaaaaaa',expiresIn:30,before,expected};
  else if(url.endsWith('/execute'))body=validReceipt();
  else if(url.endsWith('/inspect')||url.endsWith('/reconcile'))body=validRecovery(url.endsWith('/reconcile'));
  else body={ok:true};
  return {status:200,ok:true,json:async()=>body};
 };
 const guard=new WalletGuard({origin:'http://127.0.0.1:52801',fetcher,storage,clock:()=>now});
 return {guard,calls,storage,data,time:n=>{now=n;},override:fn=>{override=fn;},
  prepare:async()=>{await guard.login('Tester','synthetic');await guard.enable();return guard.preview(GUARDED_WALLET,expected.EditResource,expected.UseResource);}};
}
test('integration rejects another origin and remains readonly until explicit enabling',async()=>{
 assert.throws(()=>new WalletGuard({origin:'https://other.invalid'}));
 const t=fixture();await t.guard.login('Tester','synthetic');assert.equal(t.guard.status.writing,false);
 await assert.rejects(t.guard.preview(GUARDED_WALLET,'a','b'),e=>e.code==='read_only_or_expired_channel');
 await t.guard.enable();await assert.rejects(t.guard.wallet('Other'),e=>e.code==='target_not_allowed');
 assert.equal(t.calls.some(c=>c.url.startsWith('/api/admin')),false);
});
test('integration never exposes proof to preview, result, status or journal consumer',async()=>{
 const t=fixture(),p=await t.prepare();assert.equal(p.recoveryKey,undefined);assert.ok(!JSON.stringify(p).includes(key));
 await t.guard.execute(p.id,p.confirmation);
 assert.ok(!JSON.stringify([t.guard.status,t.guard.result]).includes(key));
 assert.ok(t.data.size===1);
 await t.guard.recover(id);assert.equal(t.guard.result.receipt.state,'UNKNOWN');
 assert.equal(t.guard.result.observation.outcome,'MATCHES_EXPECTED');
 await t.guard.logout();assert.equal(t.data.size,0);assert.equal(t.guard.result.receipt,null);
});
test('integration maps the actual guard wallet name contract and rejects wrong or extra fields',async()=>{
 const t=fixture();await t.guard.login('Tester','synthetic');
 assert.deepEqual(await t.guard.wallet(GUARDED_WALLET),before);
 for(const body of [{name:'Other',...before},{name:GUARDED_WALLET,...before,Secret:'synthetic'},before]){
  t.override(async url=>url.includes('/wallet?')?{ok:true,status:200,json:async()=>body}:null);
  await assert.rejects(t.guard.wallet(GUARDED_WALLET),e=>e.code==='invalid_response');
 }
});
test('integration consumes approval before awaiting and refuses parallel or repeated sends',async()=>{
 const t=fixture(),p=await t.prepare();let release,started;
 const seen=new Promise(r=>{started=r;});
 t.override(async(url)=>{if(url.endsWith('/execute')){started();await new Promise(r=>{release=r;});throw new Error('lost');}});
 const sending=t.guard.execute(p.id,p.confirmation);await seen;
 await assert.rejects(t.guard.execute(p.id,p.confirmation),e=>e.code==='guard_busy');
 release();await assert.rejects(sending,e=>e.code==='connection_or_response_lost');
 await assert.rejects(t.guard.execute(p.id,p.confirmation),e=>e.code==='preview_expired');
 assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,1);assert.equal(t.guard.status.lastId,id);
});
test('integration storage failure, wrong phrase, and actual clock deadlines block dispatch',async()=>{
 const t=fixture(),p=await t.prepare();
 await assert.rejects(t.guard.execute(p.id,'wrong'),e=>e.code==='confirmation_mismatch');
 t.storage.setItem=()=>{throw new Error('storage disabled');};
 await assert.rejects(t.guard.execute(p.id,p.confirmation),e=>e.code==='recovery_storage_unavailable');
 t.time(32000);await assert.rejects(t.guard.execute(p.id,p.confirmation),e=>e.code==='preview_expired');
 t.time(62000);assert.equal(t.guard.status.connected,false);
 await assert.rejects(t.guard.wallet(GUARDED_WALLET),e=>e.code==='reconnect_required');
 assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,0);
});
test('integration cancellation discards late login and late preview responses',async()=>{
 for(const endpoint of ['/connect','/previews']){
  const t=fixture();let release,started;const seen=new Promise(r=>{started=r;});
  if(endpoint==='/previews'){await t.guard.login('Tester','synthetic');await t.guard.enable();}
  t.override(async(url)=>{if(url.endsWith(endpoint)){started();await new Promise(r=>{release=r;});}});
  const work=endpoint==='/connect'?t.guard.login('Tester','synthetic'):t.guard.preview(GUARDED_WALLET,expected.EditResource,expected.UseResource);
  await seen;t.guard.invalidate();release();await assert.rejects(work,e=>e.code==='connection_changed');
  assert.equal(t.guard.status.connected,false);assert.equal(t.guard.status.previewValid,false);
 }
});
