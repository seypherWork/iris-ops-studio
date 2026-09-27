import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardClient} from './ui/client.js';
import {validRecovery} from './synthetic-metadata.mjs';
const id='a'.repeat(32), key='b'.repeat(64), csrf='synthetic-test-control';
function harness(extra){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});let status=200,body;
  if(url.endsWith('/session'))body={actor:'Tester',csrf};
  else if(url.endsWith('/connect'))body={connected:true,actor:'Tester',authorizationSeconds:60};
  else if(url.endsWith('/channels'))body={channel:id,mode:'read-only'};
  else ({status=200,body}=(await extra?.(url,options))||{body:url.endsWith('/inspect')||url.endsWith('/reconcile')?validRecovery(url.endsWith('/reconcile')):{ok:true}});
  return {ok:status>=200&&status<300,status,json:async()=>body};
 };
 return {calls,client:new GuardClient(fetcher)};
}
test('guard client sends only fixed same-origin paths and never receives an admin token',async()=>{
 const {client,calls}=harness(url=>url.includes('/wallet?')?{body:{name:'IrisOps_GuardProbeWallet',EditResource:'IRISOPS_GUARDPROBERESOURCE:WRITE',UseResource:'IRISOPS_GUARDPROBERESOURCE:READ'}}:undefined);await client.login('Tester','synthetic-password');await client.enable();await client.wallet();
 assert.ok(calls.every(c=>c.url.startsWith('/api/irisops-http-guard/v1/')));
 assert.ok(calls.every(c=>c.options.redirect==='error'&&c.options.credentials==='same-origin'&&c.options.cache==='no-store'));
 assert.equal(calls.filter(c=>c.options.headers.Authorization).length,1);
 assert.equal(calls[1].options.headers['X-IrisOps-CSRF'],csrf);
});
test('guard client starts locked and rejects malformed server channel',async()=>{
 const c=new GuardClient(async(url)=>({ok:true,status:200,json:async()=>url.endsWith('/session')?{actor:'Tester',csrf}:url.endsWith('/connect')?{connected:true,actor:'Tester'}:{channel:id,mode:'write-enabled'}}));
 await assert.rejects(c.login('Tester','synthetic'),e=>e.code==='invalid_channel');assert.equal(c.connected,false);
});
test('guard client rejects unsafe username and invalid receipt identifiers before request',async()=>{
 const {client,calls}=harness();await assert.rejects(client.login('bad:user','x'));await assert.rejects(client.recover('../other'));assert.equal(calls.length,0);
});
test('guard client no retries or direct fallback after uncertain execute response',async()=>{
 const {client,calls}=harness(()=>{throw new Error('synthetic network failure');});await client.login('Tester','synthetic');
 await assert.rejects(client.execute(id,'APPLY aaaaaaaa',key),e=>e.code==='connection_or_response_lost');assert.equal(calls.filter(c=>c.url.endsWith('/execute')).length,1);
});
test('guard client preserves server blocked or incomplete states for review',async()=>{
 const {client}=harness(()=>({status:503,body:{id,state:'RECEIPT_INCOMPLETE',error:'result_could_not_be_persisted'}}));await client.login('Tester','synthetic');assert.equal((await client.execute(id,'APPLY aaaaaaaa',key)).state,'RECEIPT_INCOMPLETE');
});
test('guard recovery sends per-operation proof only in exact POST bodies, never in URLs',async()=>{
 const {client,calls}=harness();await client.login('Tester','synthetic');await client.recover(id,key);await client.recover(id,key,true);
 for(const c of calls.slice(-2)){assert.equal(c.options.method,'POST');assert.deepEqual(JSON.parse(c.options.body),{recoveryKey:key});assert.ok(!c.url.includes(key));}
 assert.ok(calls.at(-2).url.endsWith('/inspect'));assert.ok(calls.at(-1).url.endsWith('/reconcile'));
});
test('guard denies missing or malformed proof before any execute or recovery request',async()=>{
 const {client,calls}=harness();
 for(const k of [undefined,'', 'a'.repeat(63),'F'.repeat(64)]){
  await assert.rejects(client.execute(id,'APPLY aaaaaaaa',k),e=>e.code==='recovery_key_required');
  await assert.rejects(client.recover(id,k),e=>e.code==='recovery_key_required');
 }
 assert.equal(calls.length,0);
});
test('guard client discards authorization on expiry and does not refresh invisibly',async()=>{
 const {client,calls}=harness(()=>({status:401,body:{error:'upstream_reconnect_required'}}));await client.login('Tester','synthetic');await assert.rejects(client.wallet(),e=>e.code==='reconnect_required');assert.equal(client.connected,false);assert.equal(calls.length,4);
});
test('guard client rejects preview target/phrase substitution',async()=>{
 const {client}=harness(()=>({body:{id,target:'Other',confirmation:'APPLY aaaaaaaa',before:{},expected:{}}}));await client.login('Tester','synthetic');await assert.rejects(client.preview('a','b'),e=>e.code==='invalid_preview');
});
test('guard logout clears client state even when server response is lost',async()=>{
 const {client}=harness(()=>{throw new Error('test');});await client.login('Tester','synthetic');await assert.rejects(client.logout());assert.equal(client.connected,false);
});
