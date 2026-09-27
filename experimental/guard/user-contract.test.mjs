import test from 'node:test';
import assert from 'node:assert/strict';
import {targetContext,userState,preview,receipt,recovery} from './ui/contracts.js';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
const context={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:['IRISOPS_ENROLLEDONE'],role:'IrisOps_UserRoleProbeRole',user:'IrisOps_UserRoleProbeUser'};
const before={role:context.role,assigned:false,configurationHash:'a'.repeat(64)},expected={...before,assigned:true,configurationHash:'b'.repeat(64)};
const id='1'.repeat(32),key='2'.repeat(64),actor='Tester',at='2026-09-27T00:00:00Z';
const p={id,recoveryKey:key,target:context.user,confirmation:'APPLY '+id.slice(0,8),expiresIn:30,before,expected};
const r={id,actor,target:context.user,state:'VERIFIED',reason:'user_membership_matches',dispatchCount:1,before,expected,observed:expected,events:[{state:'DISPATCHING',reason:'submitted_once',at},{state:'VERIFIED',reason:'user_membership_matches',at}],rechecks:[],createdUTC:at};
test('user state only accepts enrolled role and exact non-secret metadata',()=>{
 assert.deepEqual(userState(before,false,context.role),before);assert.deepEqual(targetContext(context),context);
 for(const bad of [{...before,assigned:1},{...before,role:'%All'},{...before,password:'x'},{...before,configurationHash:'bad'}])assert.throws(()=>userState(bad,false,context.role));
 assert.throws(()=>targetContext({...context,role:''}));assert.throws(()=>targetContext({...context,user:context.role}));
});
test('user preview binds changed membership and both digests to the intended target',()=>{
 assert.deepEqual(preview(p,'user',context).expected,expected);
 for(const bad of [{...p,target:'IrisOps_Other'},{...p,expected:{...expected,assigned:false}},{...p,expected:{...expected,configurationHash:before.configurationHash}}])assert.throws(()=>preview(bad,'user',context));
});
test('verified user result requires exact native readback, actor and reason',()=>{
 assert.equal(receipt(r,{id,actor,kind:'user',context}).state,'VERIFIED');
 for(const bad of [{...r,observed:before},{...r,actor:'Other'},{...r,reason:'role_grant_set_matches'},{...r,observed:{...expected,secret:'x'}}])assert.throws(()=>receipt(bad,{id,actor,kind:'user',context}));
});
test('user recovery validates observation independently of the original result',()=>{
 const observation={at,outcome:'MATCHES_BEFORE',...before,causality:'not_proven'};
 const body={receipt:r,currentObservation:observation,observationPersisted:0,administrativeWrites:0};
 assert.equal(recovery(body,{id,actor,record:false,kind:'user',context}).receipt.state,'VERIFIED');
 assert.throws(()=>recovery({...body,administrativeWrites:1},{id,actor,record:false,kind:'user',context}));
});
function fixture(withUser=true){
 const calls=[],store=new Map();let assigned=false;
 const caps={policy:{generation:'9'.repeat(32),resources:context.resources},...Object.fromEntries(['wallet','webapp','role','user'].map(k=>[k,{target:k==='user'&&!withUser?'':context[k],available:k==='user'?!(!withUser):true,reason:k==='user'&&!withUser?'target_policy_required':'available'}]))};
 const fetcher=async(url,options)=>{
  calls.push({url,options});let body={};
  if(url.endsWith('/session'))body={actor,csrf:'synthetic'};
  else if(url.endsWith('/connect'))body={actor,connected:true,mode:'read-only',authorizationSeconds:60};
  else if(url.endsWith('/deployment'))body={mode:'ACTIVE',generation:'8'.repeat(32),build:'managed-lab-a'};
  else if(url.endsWith('/capabilities'))body=caps;
  else if(url.endsWith('/channels'))body={channel:String(calls.length%10).repeat(32),mode:'read-only'};
  else if(url.endsWith('/write-access'))body={mode:'write-enabled',expiresIn:60};
  else if(url.includes('/user/state'))body=assigned?expected:before;
  else if(url.endsWith('/previews'))body=p;
  else if(url.endsWith('/execute')){assigned=true;body=r;}
  return {status:200,ok:true,json:async()=>structuredClone(body)};
 };
 const guard=new CombinedGuard({origin:'http://127.0.0.1:52808',profile:'managed',fetcher,storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
 return {guard,calls,store,caps};
}
test('four scoped channels support user workflow without exposing its recovery proof',async()=>{
 const t=fixture();await t.guard.login(actor,'synthetic');assert.equal(t.calls.filter(c=>c.url.endsWith('/channels')).length,4);
 await t.guard.select('user');assert.equal(t.guard.status.writing,false);assert.deepEqual(await t.guard.user(),before);
 await t.guard.enable();const approval=await t.guard.previewUser('assign');assert.ok(!JSON.stringify(approval).includes(key));
 await t.guard.execute(approval.id,approval.confirmation);assert.equal(t.guard.result.receipt.state,'VERIFIED');
 await t.guard.select('role');assert.equal(t.guard.status.writing,false);assert.equal(t.guard.status.lastId,'');
 assert.throws(()=>t.guard.previewUser('assign'));await t.guard.select('user');assert.equal(t.guard.status.lastId,id);
});
test('older deployments without enrolled user retain three channels',async()=>{
 const t=fixture(false);await t.guard.login(actor,'synthetic');assert.equal(t.calls.filter(c=>c.url.endsWith('/channels')).length,3);
 assert.equal(t.guard.capabilities.user.available,false);
});

test('user capability denial does not grant writes or disable an independent role capability',async()=>{
 const t=fixture();t.caps.user.available=false;t.caps.user.reason='native_permission_required';
 await t.guard.login(actor,'synthetic');await t.guard.select('user');
 await assert.rejects(t.guard.enable(),/operation_denied/);
 assert.equal(t.guard.status.writing,false);
 assert.equal(t.calls.filter(c=>c.url.includes('/user/')&&c.url.endsWith('/write-access')).length,0);
 await t.guard.select('role');await t.guard.enable();assert.equal(t.guard.status.writing,true);
});

test('substituted user capability target invalidates the shared session before channel creation',async()=>{
 const t=fixture();t.caps.user.target=context.role;
 await assert.rejects(t.guard.login(actor,'synthetic'),/invalid_response/);
 assert.equal(t.guard.status.connected,false);assert.equal(t.guard.capabilities,null);
 assert.equal(t.calls.filter(c=>c.url.endsWith('/channels')).length,0);
});
