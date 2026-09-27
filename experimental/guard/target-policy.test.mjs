import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardSession} from './ui/session.js';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
import {preview,receipt,recovery,targetContext,walletMetadata} from './ui/contracts.js';
const id='a'.repeat(32),key='b'.repeat(64),hash='c'.repeat(64),at='2026-09-27T12:00:00Z';
const context={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:['IRISOPS_ENROLLEDONE','IRISOPS_ENROLLEDTWO']};
const before={EditResource:context.resources[0]+':WRITE',UseResource:context.resources[0]+':READ'},expected={...before,UseResource:context.resources[1]+':READ'};
const caps=()=>({policy:{generation:id,resources:[...context.resources]},wallet:{target:context.wallet,available:true,reason:'available'},webapp:{target:context.webapp,available:true,reason:'available'}});
const p=()=>({id,recoveryKey:key,target:context.wallet,confirmation:'APPLY '+id.slice(0,8),expiresIn:30,before,expected});
const r=()=>({id,actor:'Tester',target:context.wallet,state:'VERIFIED',reason:'both_policy_fields_match',dispatchCount:1,before,expected,observed:expected,events:[{state:'DISPATCHING',reason:'submitted_once',at},{state:'VERIFIED',reason:'both_policy_fields_match',at}],rechecks:[],createdUTC:at});
function fixture(){
 let capabilities=caps();const calls=[],map=new Map();
 const fetcher=async(url,o)=>{calls.push({url,o});let body={};
  if(url.endsWith('/session'))body={actor:'Tester',csrf:'synthetic'};
  else if(url.endsWith('/connect'))body={actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:60};
  else if(url.endsWith('/deployment'))body={mode:'ACTIVE',generation:id,build:'managed-lab-a'};
  else if(url.endsWith('/capabilities'))body=capabilities;
  else if(url.endsWith('/channels'))body={channel:id,mode:'read-only'};
  else if(url.endsWith('/write-access'))body={mode:'write-enabled',expiresIn:60};
  else if(url.includes('/wallet/state'))body={name:context.wallet,EditResource:'IrisOps_EnrolledOne:WRITE',UseResource:'IrisOps_EnrolledOne:READ'};
  else if(url.includes('/webapp/state'))body={Enabled:false,configurationHash:hash};
  else if(url.endsWith('/previews'))body=p();
  else if(url.endsWith('/execute'))body=r();
  return {ok:true,status:200,json:async()=>structuredClone(body)};
 };
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 return {calls,fetcher,setCaps:v=>{capabilities=v;},session:new GuardSession(fetcher,()=>0,'managed'),guard:new CombinedGuard({origin:'http://127.0.0.1:52808',fetcher,storage,clock:()=>0,profile:'managed'})};
}
test('managed target enrollment binds actual wallet, resources, preview and receipt; legacy names are refused',async()=>{
 const t=fixture(),g=t.guard;await g.login('Tester','synthetic');assert.equal(g.target,context.wallet);assert.deepEqual(g.resources,context.resources);
 assert.deepEqual(await g.wallet(context.wallet),before);await assert.rejects(g.wallet('IrisOps_GuardProbeWallet'));
 await g.enable();const v=await g.preview(context.wallet,expected.EditResource,expected.UseResource);assert.equal(v.target,context.wallet);
 assert.equal((await g.execute(v.id,v.confirmation)).target,context.wallet);
 assert.equal(JSON.parse(t.calls.find(c=>c.url.endsWith('/previews')).o.body).name,context.wallet);
 await g.select('webapp');await g.webapp();assert.ok(t.calls.at(-1).url.endsWith('/webapp/state?name='+encodeURIComponent(context.webapp)));
});
test('managed missing policy connects read-only and cannot use hardcoded fallback targets',async()=>{
 const t=fixture();t.setCaps({policy:{generation:'',resources:[]},wallet:{target:'',available:false,reason:'target_policy_required'},webapp:{target:'',available:false,reason:'target_policy_required'}});
 await t.guard.login('Tester','synthetic');assert.ok(t.guard.status.connected);assert.equal(t.guard.target,'');assert.equal(t.guard.status.capability,false);
 await assert.rejects(t.guard.enable());await assert.rejects(t.guard.wallet('IrisOps_GuardProbeWallet'));await t.guard.select('webapp');await assert.rejects(t.guard.webapp());
 assert.equal(t.calls.filter(c=>c.url.includes('state?')||c.url.endsWith('/write-access')).length,0);
});
test('changed policy generation, target or resource set disconnects both workspaces',async()=>{
 for(const mutate of [c=>{c.policy.generation='d'.repeat(32);},c=>{c.wallet.target='OtherWallet';},c=>{c.policy.resources.push('OTHER');}]){
  const t=fixture();await t.guard.login('Tester','synthetic');await t.guard.enable();const c=caps();mutate(c);t.setCaps(c);
  await assert.rejects(t.guard.enable(),e=>e.code==='target_policy_changed');assert.equal(t.guard.status.connected,false);await t.guard.select('webapp');assert.equal(t.guard.status.connected,false);
 }
});
test('managed capabilities reject downgrade, malformed configuration and nested extra fields before attachment',async()=>{
 for(const mutate of [c=>{delete c.policy;},c=>{c.policy.secret='unexpected';},c=>{c.policy.resources.push(c.policy.resources[0]);},c=>{c.webapp.target='/csp/sys';},c=>{c.wallet.target='bad?name';},c=>{c.policy.generation='';},c=>{c.wallet.available='true';}]){
  const t=fixture(),c=caps();mutate(c);t.setCaps(c);await assert.rejects(t.guard.login('Tester','synthetic'));assert.equal(t.guard.status.connected,false);assert.equal(t.calls.filter(c=>c.url.endsWith('/channels')).length,0);
 }
});
test('capability context is a copy; callers cannot broaden future permissions by mutation',async()=>{
 const t=fixture();await t.session.login('Tester','synthetic');const c=await t.session.capabilities();c.wallet.target='Other';const copy=t.session.targets;copy.resources.push('OTHER');assert.deepEqual(t.session.targets,context);
});
test('dynamic contract never trusts a response target or resource as its own allowlist',()=>{
 assert.equal(preview(p(),'wallet',context).target,context.wallet);assert.equal(receipt(r(),{id,actor:'Tester',context}).target,context.wallet);
 for(const value of [{...p(),target:'OtherWallet'},{...p(),expected:{...expected,UseResource:'OTHER:READ'}},{...p(),expected:{...expected,token:'unexpected'}}])assert.throws(()=>preview(value,'wallet',context));
 assert.throws(()=>receipt({...r(),target:'OtherWallet'},{id,actor:'Tester',context}));
 const observation={at,outcome:'MATCHES_EXPECTED',...expected,causality:'not_proven'};
 const rec={receipt:r(),currentObservation:observation,observationPersisted:false,administrativeWrites:0};
 assert.equal(recovery(rec,{id,actor:'Tester',record:false,context}).receipt.target,context.wallet);
 assert.throws(()=>recovery({...rec,currentObservation:{...observation,UseResource:'OTHER:READ'}},{id,actor:'Tester',record:false,context}));
});
test('dynamic context bounds names and resource sizes without accepting paths, reserved names or duplicates',()=>{
 assert.deepEqual(targetContext(context),context);
 for(const c of [{...context,wallet:'évil'},{...context,wallet:'A'.repeat(65)},{...context,webapp:'/csp/app/nested'},{...context,webapp:'/csp/OPS'},{...context,resources:['A'.repeat(59)]},{...context,resources:['LOWER','lower']},{...context,resources:[]},{...context,resources:['A','A']}])assert.throws(()=>targetContext(c));
});
test('native wallet inventory normalizes casing and documented permission aliases without relaxing evidence',()=>{
 const raw={name:context.wallet,EditResource:'IrisOps_EnrolledOne:W',UseResource:'IrisOps_EnrolledOne'};
 assert.deepEqual(walletMetadata(raw,context.wallet,context.resources),{name:context.wallet,...before});
 for(const bad of [{...raw,name:'Other'},{...raw,UseResource:'Other:READ'},{...raw,EditResource:'*:WRITE'},{...raw,UseResource:'IRISOPS_ENROLLEDONE:EXECUTE'},{...raw,token:'unexpected'}])assert.throws(()=>walletMetadata(bad,context.wallet,context.resources));
 assert.throws(()=>preview({...p(),before:{EditResource:raw.EditResource,UseResource:raw.UseResource}},'wallet',context));
});
