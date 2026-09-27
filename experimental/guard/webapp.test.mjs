import test from 'node:test';
import assert from 'node:assert/strict';
import {WEBAPP,webState,preview,receipt,recovery} from './ui/contracts.js';
import {GuardClient} from './ui/client.js';
import {WalletGuard} from '../../web/assets/wallet-guard.js';
const id='a'.repeat(32),key='b'.repeat(64),hash='c'.repeat(64),at='2026-09-26T00:00:00Z';
const before={Enabled:false,configurationHash:hash},expected={Enabled:true,configurationHash:hash};
const p=()=>({id,recoveryKey:key,target:WEBAPP,confirmation:'APPLY aaaaaaaa',expiresIn:30,before:{...before},expected:{...expected}});
function r(state='VERIFIED'){
 const reason=state==='VERIFIED'?'availability_and_configuration_match':state==='UNKNOWN'?'readback_unavailable':'stale';
 return {id,actor:'Tester',target:WEBAPP,state,reason,dispatchCount:state==='BLOCKED'?0:1,before:{...before},expected:{...expected},observed:state==='VERIFIED'?{...expected}:{},
 events:state==='BLOCKED'?[{state,reason,at}]:[{state:'DISPATCHING',reason:'submitted_once',at},{state,reason,at}],rechecks:[],createdUTC:at};
}
const options={id,actor:'Tester',kind:'webapp',approved:p()};
test('web metadata requires boolean state, exact digest and no unexpected/sensitive fields',()=>{
 assert.deepEqual(webState(before),before);
 for(const value of [{...before,Enabled:0},{...before,configurationHash:['c'.repeat(64)]},{...before,password:'synthetic'},[],{},null])assert.throws(()=>webState(value));
});
test('web preview changes Enabled only and pins the target and configuration digest',()=>{
 assert.deepEqual(preview(p(),'webapp'),p());
 for(const mutate of [v=>v.target='/api/admin',v=>v.expected.Enabled=false,v=>v.expected.configurationHash='d'.repeat(64),v=>v.before.Enabled='false',v=>v.expected.Secret='synthetic']){
  const v=p();mutate(v);assert.throws(()=>preview(v,'webapp'));
 }
 assert.throws(()=>preview(p(),'wallet'));
});
test('web verified receipt requires unchanged configuration as well as expected availability',()=>{
 assert.equal(receipt(r(),options).state,'VERIFIED');
 for(const mutate of [v=>v.observed.Enabled=false,v=>v.observed.configurationHash='d'.repeat(64),v=>v.reason='both_policy_fields_match',v=>v.actor='Other',v=>v.observed.token='synthetic',v=>delete v.events]){
  const v=r();mutate(v);assert.throws(()=>receipt(v,options));
 }
});
test('web UNKNOWN remains separate from a current match and recovered observations cannot invent certainty',()=>{
 const value={receipt:r('UNKNOWN'),currentObservation:{at,outcome:'MATCHES_EXPECTED',...expected,causality:'not_proven'},observationPersisted:false,administrativeWrites:0};
 assert.equal(recovery(value,{...options,record:false}).receipt.state,'UNKNOWN');
 value.currentObservation.Enabled=false;assert.throws(()=>recovery(value,{...options,record:false}));
 value.currentObservation.outcome='MATCHES_BEFORE';assert.equal(recovery(value,{...options,record:false}).currentObservation.outcome,'MATCHES_BEFORE');
 value.receipt.observed={...before};assert.throws(()=>recovery(value,{...options,record:false}));
});
function fixture(){
 const calls=[],data=new Map([['irisops-guard-recovery-v1','wallet-store-untouched']]);let override=()=>null,now=0;
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const fetcher=async(url,o)=>{
  calls.push({url,o});const custom=await override(url,o);if(custom)return custom;
  const body=url.endsWith('/session')?{actor:'Tester',csrf:'synthetic'}:url.endsWith('/connect')?{connected:true,actor:'Tester',authorizationSeconds:60}:url.endsWith('/channels')?{channel:id,mode:'read-only'}:url.endsWith('/write-access')?{mode:o.method==='DELETE'?'read-only':'write-enabled',expiresIn:60}:url.endsWith('/webapp')?before:url.endsWith('/previews')?p():url.endsWith('/execute')?r():{};
  return {ok:true,status:200,json:async()=>structuredClone(body)};
 };
 const guard=new WalletGuard({origin:'http://127.0.0.1:52801',kind:'webapp',fetcher,storage,clock:()=>now});
 return {guard,calls,data,fetcher,time:v=>{now=v;},override:f=>{override=f;},prepare:async()=>{await guard.login('Tester','synthetic');await guard.enable();return guard.previewWebapp(true);}};
}
test('web client uses separate fixed guard only and refuses non-boolean intent before network',async()=>{
 const t=fixture(),client=new GuardClient(t.fetcher,'webapp');await client.login('Tester','synthetic');const n=t.calls.length;
 for(const value of ['true',1,null,{},[]])await assert.rejects(client.previewWebapp(value));assert.equal(t.calls.length,n);
 const result=await client.previewWebapp(true);await client.execute(result.id,result.confirmation,result.recoveryKey);
 assert.ok(t.calls.every(c=>c.url.startsWith('/api/irisops-web-guard/v1/')));assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,1);
});
test('web integration isolates recovery storage and never exposes proof to the main UI',async()=>{
 const t=fixture(),result=await t.prepare();assert.equal(result.recoveryKey,undefined);assert.ok(!JSON.stringify(result).includes(key));
 await t.guard.execute(result.id,result.confirmation);assert.ok(t.data.has('webapp:irisops-guard-recovery-v1'));assert.ok(!JSON.stringify(t.guard.result).includes(key));
 await t.guard.logout();assert.equal(t.data.has('webapp:irisops-guard-recovery-v1'),false);assert.equal(t.data.get('irisops-guard-recovery-v1'),'wallet-store-untouched');
});
test('web integration consumes the preview before an uncertain send and expiry prevents execution',async()=>{
 const t=fixture(),result=await t.prepare();t.override(async url=>{if(url.endsWith('/execute'))throw Error('synthetic loss');});
 await assert.rejects(t.guard.execute(result.id,result.confirmation));await assert.rejects(t.guard.execute(result.id,result.confirmation));
 assert.equal(t.calls.filter(c=>c.url.endsWith('/execute')).length,1);
 const u=fixture(),fresh=await u.prepare();u.time(31000);await assert.rejects(u.guard.execute(fresh.id,fresh.confirmation));assert.equal(u.calls.filter(c=>c.url.endsWith('/execute')).length,0);
});
test('web client refuses a valid server preview for the opposite requested direction',async()=>{
 const t=fixture(),client=new GuardClient(t.fetcher,'webapp');await client.login('Tester','synthetic');
 await assert.rejects(client.previewWebapp(false),e=>e.code==='invalid_preview');
});

test('web recovery forwards only validated availability needed for the current status label',async()=>{
 const t=fixture(),p=await t.prepare();await t.guard.execute(p.id,p.confirmation);
 t.override(async url=>url.endsWith('/inspect')?{ok:true,status:200,json:async()=>({receipt:r(),currentObservation:{at,outcome:'MATCHES_EXPECTED',...expected,causality:'not_proven'},observationPersisted:false,administrativeWrites:0})}:null);
 const result=await t.guard.recover(p.id);
 assert.deepEqual(result.observation,{at,outcome:'MATCHES_EXPECTED',Enabled:true,causality:'not_proven'});
 assert.ok(!JSON.stringify(result).includes(key));
});
