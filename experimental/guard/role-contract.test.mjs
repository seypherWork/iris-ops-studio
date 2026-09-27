import test from 'node:test';
import assert from 'node:assert/strict';
import {roleState,targetContext,preview,receipt} from './ui/contracts.js';

const context={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',
  resources:['IRISOPS_ENROLLEDONE','IRISOPS_ENROLLEDTWO'],role:'IrisOps_AccessProbeRole'};
const first='IRISOPS_ENROLLEDONE',before={resource:first,permissions:'R',configurationHash:'a'.repeat(64)};
const expected={resource:first,permissions:'RW',configurationHash:'b'.repeat(64)};
const id='1'.repeat(32),key='2'.repeat(64),actor='IrisOps_RoleHttpUser',at='2026-09-27T00:00:00Z';
test('enrolled role context and native metadata have exact shape',()=>{
 assert.deepEqual(targetContext(context),context);
 assert.deepEqual(roleState(before,false,context.resources),before);
 for(const bad of [{...before,secret:'x'},{...before,resource:'%Admin_Operate'},{...before,configurationHash:'bad'},{...before,permissions:'ALL'}])
   assert.throws(()=>roleState(bad,false,context.resources));
 assert.throws(()=>targetContext({...context,role:'%SYS'}));
});
test('role preview is bound to enrolled target, selected resource and changed complete-set digest',()=>{
 const p={id,recoveryKey:key,target:context.role,confirmation:'APPLY '+id.slice(0,8),expiresIn:30,before,expected};
 assert.deepEqual(preview(p,'role',context).expected,expected);
 for(const bad of [{...p,target:'IrisOps_Other'},{...p,expected:{...expected,resource:'IRISOPS_ENROLLEDTWO'}},
   {...p,expected:{...expected,configurationHash:before.configurationHash}}])
   assert.throws(()=>preview(bad,'role',context));
});
test('role receipt requires native verified readback of complete grant digest',()=>{
 const valid={id,actor,target:context.role,state:'VERIFIED',reason:'role_grant_set_matches',dispatchCount:1,
   before,expected,observed:expected,events:[{state:'DISPATCHING',reason:'submitted_once',at},
     {state:'VERIFIED',reason:'role_grant_set_matches',at}],rechecks:[],createdUTC:at};
 assert.equal(receipt(valid,{id,actor,kind:'role',context}).state,'VERIFIED');
 assert.throws(()=>receipt({...valid,observed:{...expected,configurationHash:'c'.repeat(64)}},{id,actor,kind:'role',context}));
 assert.throws(()=>receipt({...valid,reason:'both_policy_fields_match'},{id,actor,kind:'role',context}));
});
