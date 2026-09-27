import test from 'node:test';
import assert from 'node:assert/strict';
import {receipt,recovery,preview,isId,isKey,WALLET} from './ui/contracts.js';
import {GuardClient} from './ui/client.js';
import {RecoveryStore} from './ui/recovery-store.js';
import {id,key,at,before,expected,validReceipt,validRecovery} from './synthetic-metadata.mjs';
const options={id,actor:'Tester',approved:{before,expected}};
const validPreview=()=>({id,recoveryKey:key,target:WALLET,confirmation:'APPLY aaaaaaaa',before:{...before},expected:{...expected},expiresIn:30});
test('receipt requires full evidence, exact actor/target and a matching verified readback',()=>{
 for(const change of [r=>delete r.events,r=>r.actor='Other',r=>r.target='Other',r=>r.observed={...before},r=>r.dispatchCount=0,r=>r.events=[]]){
  const r=validReceipt();change(r);assert.throws(()=>receipt(r,options));
 }
 assert.throws(()=>receipt({id,state:'VERIFIED'},options));
 assert.deepEqual(receipt(validReceipt(),options),validReceipt());
});
test('receipt rejects a self-consistent result for a different approved policy',()=>{
 const r=validReceipt();r.expected={EditResource:expected.UseResource.replace(':READ',':WRITE'),UseResource:before.UseResource};r.observed={...r.expected};
 assert.throws(()=>receipt(r,options));
});
test('nested credentials and unknown fields fail closed at every receipt depth',()=>{
 const mutations=[r=>r.password='SYNTHETIC',r=>r.before.token='SYNTHETIC',r=>r.expected.privateKey='SYNTHETIC',
  r=>r.observed.clientSecret='SYNTHETIC',r=>r.events[0].password='SYNTHETIC',
  r=>r.rechecks.push({...validRecovery().currentObservation,privateKey:'SYNTHETIC'})];
 for(const mutate of mutations){const r=validReceipt();mutate(r);assert.throws(()=>receipt(r,options));}
});
test('receipt rejects credential text in reasons, invalid timestamps and impossible histories',()=>{
 for(const mutate of [r=>r.reason='token=SYNTHETIC',r=>r.createdUTC='invalid',r=>r.events[0].reason='password=SYNTHETIC',
  r=>r.events.reverse(),r=>r.events.push({...r.events[1]}),r=>r.before.EditResource='SYNTHETIC']){
  const r=validReceipt();mutate(r);assert.throws(()=>receipt(r,options));
 }
});
test('valid blocked, uncertain, interrupted and mismatched evidence stays distinct',()=>{
 for(const state of ['BLOCKED','UNKNOWN','MISMATCH'])assert.equal(receipt(validReceipt(state),options).state,state);
 const interrupted=validReceipt('UNKNOWN');interrupted.events.pop();interrupted.reason='submitted_once';
 assert.equal(receipt(interrupted,options).state,'UNKNOWN');
 const late=validReceipt('BLOCKED');late.events.unshift({state:'DISPATCHING',reason:'submitted_once',at});
 assert.equal(receipt(late,options).dispatchCount,0);
});
test('incomplete execution envelopes cannot masquerade as complete verification',()=>{
 for(const [state,error] of [['RECEIPT_INCOMPLETE','result_could_not_be_persisted'],['UNKNOWN','execution_unavailable'],['FAILED_BEFORE_DISPATCH','execution_unavailable']]){
  assert.equal(receipt({id,state,error},{...options,allowIncomplete:true}).incomplete,true);
  assert.throws(()=>receipt({id,state,error},options));
 }
 assert.throws(()=>receipt({id,state:'VERIFIED',error:'execution_unavailable'},{...options,allowIncomplete:true}));
});
test('recovery verifies observation semantics and never rewrites original uncertainty',()=>{
 for(const record of [false,true]){
  const r=recovery(validRecovery(record),{...options,record});assert.equal(r.receipt.state,'UNKNOWN');assert.equal(r.currentObservation.outcome,'MATCHES_EXPECTED');
 }
 for(const mutate of [r=>r.currentObservation.outcome='MATCHES_BEFORE',r=>r.currentObservation.causality='proven',
  r=>r.currentObservation.secret='SYNTHETIC',r=>r.administrativeWrites=1,r=>r.observationPersisted=true]){
  const r=validRecovery();mutate(r);assert.throws(()=>recovery(r,{...options,record:false}));
 }
 const missing=validRecovery(true);missing.receipt.rechecks=[];assert.throws(()=>recovery(missing,{...options,record:true}));
});
test('response types and nested preview metadata do not coerce arrays or missing values',()=>{
 for(const value of [null,undefined,1,[id],{toString:()=>id}])assert.equal(isId(value),false);
 for(const value of [null,undefined,1,[key],{toString:()=>key}])assert.equal(isKey(value),false);
 for(const mutate of [p=>p.id=[id],p=>p.recoveryKey=[key],p=>p.before.password='SYNTHETIC',p=>p.expiresIn='30',p=>p.expected={...p.before}]){
  const p=validPreview();mutate(p);assert.throws(()=>preview(p));
 }
});
test('storage rejects non-string keys before write and tampered entries on reload',()=>{
 const data=new Map(),s={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},store=new RecoveryStore(s);
 for(const value of [[key],null,1,{toString:()=>key}])assert.throws(()=>store.remember(id,value));
 assert.equal(data.size,0);
 for(const entries of [[[id,[key]]],[[[id],key]]]){
  s.setItem('irisops-guard-recovery-v1',JSON.stringify({last:id,entries}));assert.throws(()=>store.get(id));
 }
});
test('client refuses non-string IDs/proofs without a network request',async()=>{
 let calls=0;const client=new GuardClient(async()=>{calls++;throw new Error('must not send');});
 for(const value of [[id],null,1,{toString:()=>id}])await assert.rejects(client.execute(value,'APPLY aaaaaaaa',key));
 for(const value of [[key],null,1,{toString:()=>key}])await assert.rejects(client.recover(id,value));
 assert.equal(calls,0);
});
test('both UIs share receipt validation and the client binds it to the stored preview',async()=>{
 let response=validReceipt();const client=new GuardClient(async url=>({ok:true,status:200,json:async()=>
  url.endsWith('/session')?{actor:'Tester',csrf:'synthetic'}:url.endsWith('/connect')?{connected:true,actor:'Tester',authorizationSeconds:60}:
  url.endsWith('/channels')?{channel:id,mode:'read-only'}:url.endsWith('/previews')?validPreview():response}));
 await client.login('Tester','synthetic');
 const p=await client.preview(before.EditResource,expected.UseResource);
 // Mutating the caller's returned object cannot replace the stored approval.
 p.expected.EditResource='IRISOPS_GUARDPROBEALTERNATE:WRITE';
 response.expected.EditResource=p.expected.EditResource;response.observed.EditResource=p.expected.EditResource;
 await assert.rejects(client.execute(id,p.confirmation,key),e=>e.code==='invalid_response');
 response=validReceipt();response.events[0].privateKey='SYNTHETIC';
 await assert.rejects(client.execute(id,p.confirmation,key),e=>e.code==='invalid_response');
});
