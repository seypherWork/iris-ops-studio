import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {reviewInputs,confirmPlan,installReview,stopReview} from './review.mjs';
import {onboardingProfile} from './onboarding-preflight.mjs';
import {saveNew,bundleProfile} from './portable.mjs';
const fingerprint='a'.repeat(64);
test('review profile supports all four bounded workflows without changing historical profile names',()=>{
 assert.equal(bundleProfile('portable-enrolled-user-review-1'),'enrolled-user-v1');
 for(const profile of ['enrolled-targets-v1','enrolled-role-v1','enrolled-user-v1'])onboardingProfile(profile);
 for(const profile of ['fixed-targets-v1','unknown',null])assert.throws(()=>onboardingProfile(profile));
});
test('review destinations cannot write receipts into the verified bundle',()=>{
 const root=join(tmpdir(),'review-input-bundle');
 for(const output of [root,join(root,'receipts')])assert.throws(()=>reviewInputs(root,'irisops-pilot-test',52820,output));
 assert.throws(()=>reviewInputs(root,'foreign',52820,root+'-receipts'));
 assert.throws(()=>reviewInputs(root,'irisops-pilot-test',80,root+'-receipts'));
 assert.equal(reviewInputs(root,'irisops-pilot-test',52820,root+'-receipts').port,52820);
});
test('review approval is exact and displays the entire fingerprint-bound plan',async()=>{
 let displayed;assert.equal(await confirmPlan({fingerprint,name:'owned'},'INSTALL',async()=>'',s=>displayed=s),false);
 assert.equal(JSON.parse(displayed).fingerprint,fingerprint);
 for(const answer of ['install','yes','INSTALL '])assert.equal(await confirmPlan({fingerprint},'INSTALL',async()=>answer,()=>{}),false);
 assert.equal(await confirmPlan({fingerprint},'INSTALL',async()=>'INSTALL',()=>{}),true);
});
async function fixture(){
 const parent=await mkdtemp(join(resolve(process.env.IRISOPS_TEST_TMPDIR||'../'),'irisops-review-unit-')),root=join(parent,'bundle'),output=join(parent,'receipts');
 await mkdir(root);const calls=[],prepared={complete:true},installed={containerId:'b'.repeat(64)};
 const op={plan:async config=>({fingerprint,config}),apply:async(p,f,path)=>{calls.push('apply');assert.equal(f,fingerprint);await saveNew(path,installed);},rollbackPlan:async()=>({fingerprint}),rollback:async()=>{calls.push('stop');return {stopped:true};}};
 const api={plan:async name=>({fingerprint,resources:{name,certificateVolume:'private'}}),prepare:async(p,f,path)=>{calls.push('prepare');assert.equal(f,fingerprint);await saveNew(path,prepared);},installedOperator:async()=>op};
 const options={root,output,name:'irisops-pilot-unit',port:52820,api,show:()=>{},verify:async()=>calls.push('verify'),inspect:async args=>{calls.push('inspect');assert.deepEqual(args.installed,installed);return {url:'https://127.0.0.1:52820/csp/ops/guard-managed/web/index.html'};}};
 return {options,calls};
}
test('declining preparation makes no Docker mutation and retains only the plan',async()=>{
 const {options,calls}=await fixture();const result=await installReview({...options,ask:async()=>''});
 assert.equal(result.phase,'preparation_declined');assert.deepEqual(calls,['verify']);
 assert.equal(JSON.parse(await readFile(join(options.output,'prepare-plan.json'))).fingerprint,fingerprint);
});
test('declining installation retains preparation and never starts an engine',async()=>{
 const {options,calls}=await fixture();let i=0;const result=await installReview({...options,ask:async()=>i++===0?'PREPARE':''});
 assert.equal(result.phase,'installation_declined');assert.deepEqual(calls,['verify','prepare']);
});
test('review setup requires both approvals, then checks public TLS without identities or trust',async()=>{
 const {options,calls}=await fixture();let i=0;const result=await installReview({...options,ask:async()=>i++===0?'PREPARE':'INSTALL'});
 assert.deepEqual(calls,['verify','prepare','apply','inspect']);
 assert.equal(result.complete,true);for(const key of ['trustInstalled','accountsCreated','targetsEnrolled'])assert.equal(result[key],false);
 assert.deepEqual(JSON.parse(await readFile(join(options.output,'review-install.json'))),result);
});
test('existing receipt directories refuse before prepare; no implicit overwrite',async()=>{
 const {options,calls}=await fixture();await mkdir(options.output);
 await assert.rejects(installReview({...options,ask:async()=>'PREPARE'}));assert.deepEqual(calls,['verify']);
});
test('preparation failure cannot fall through into installation',async()=>{
 const {options,calls}=await fixture();options.api.prepare=async()=>{calls.push('failed');throw Error('failure');};
 await assert.rejects(installReview({...options,ask:async()=>'PREPARE'}));assert.deepEqual(calls,['verify','failed']);
});
test('failed post-install TLS inspection suspends only the owned engine and retains its plan',async()=>{
 const {options,calls}=await fixture();let i=0;
 await assert.rejects(installReview({...options,ask:async()=>i++===0?'PREPARE':'INSTALL',inspect:async()=>{throw Error('TLS mismatch');}}),/suspended and stopped/);
 assert.deepEqual(calls,['verify','prepare','apply','stop']);
 assert.equal(JSON.parse(await readFile(join(options.output,'preflight-stop-plan.json'))).fingerprint,fingerprint);
});
test('stop is bound to retained identity and requires a new explicit approval',async()=>{
 const {options,calls}=await fixture();let i=0;await installReview({...options,ask:async()=>i++===0?'PREPARE':'INSTALL'});
 const result=await stopReview({...options,ask:async()=>''});assert.equal(result.phase,'stop_declined');assert.ok(!calls.includes('stop'));
});

async function installedFixture(){
 const t=await fixture();let i=0;
 await installReview({...t.options,ask:async()=>i++===0?'PREPARE':'INSTALL'});
 const op=await t.options.api.installedOperator();let plans=0;
 op.rollbackPlan=async installed=>{assert.equal(installed.containerId,'b'.repeat(64));return {fingerprint:(++plans).toString(16).padStart(64,'0'),containerId:installed.containerId};};
 op.rollback=async(plan,confirmation,path)=>{assert.equal(confirmation,plan.fingerprint);assert.equal(plan.containerId,'b'.repeat(64));await saveNew(path,{complete:true});return {complete:true};};
 return {...t,op};
}
async function stopPlans(output){
 const dirs=(await readdir(output)).filter(n=>n.startsWith('review-stop-attempt-')).sort();
 return Promise.all(dirs.map(async dir=>({dir,plan:JSON.parse(await readFile(join(output,dir,'plan.json'),'utf8'))})));
}
test('declined stop can be retried with a fresh plan while legacy and new receipts remain untouched',async()=>{
 const {options}=await installedFixture();
 await saveNew(join(options.output,'review-stop-plan.json'),{historical:true});
 assert.equal((await stopReview({...options,ask:async()=>''})).phase,'stop_declined');
 const before=await stopPlans(options.output);assert.equal(before.length,1);
 assert.ok((await stopReview({...options,ask:async()=>'STOP'})).complete);
 const after=await stopPlans(options.output);assert.equal(after.length,2);
 assert.deepEqual(after.find(x=>x.dir===before[0].dir),before[0]);
 assert.notEqual(after[0].plan.fingerprint,after[1].plan.fingerprint);
 assert.deepEqual(JSON.parse(await readFile(join(options.output,'review-stop-plan.json'))),{historical:true});
});
for(const reason of ['plan expired','transient stop failure'])test('a '+reason+' does not prevent a freshly approved stop attempt',async()=>{
 const {options,op}=await installedFixture();const rollback=op.rollback;let attempts=0;
 op.rollback=async(p,f,path)=>{if(attempts++===0){await saveNew(path,{complete:false,reason});throw Error(reason);}return rollback(p,f,path);};
 await assert.rejects(stopReview({...options,ask:async()=>'STOP'}),new RegExp(reason));
 const first=(await stopPlans(options.output))[0];const failed=await readFile(join(options.output,first.dir,'stopped.json'),'utf8');
 assert.ok((await stopReview({...options,ask:async()=>'STOP'})).complete);
 assert.equal(await readFile(join(options.output,first.dir,'stopped.json'),'utf8'),failed);
 assert.equal((await stopPlans(options.output)).length,2);
});
test('failed identity revalidation refuses before creating a stop attempt or requesting approval',async()=>{
 const {options,op}=await installedFixture();op.rollbackPlan=async()=>{throw Error('identity mismatch');};
 let asked=false;await assert.rejects(stopReview({...options,ask:async()=>{asked=true;return 'STOP';}}),/identity mismatch/);
 assert.equal(asked,false);assert.deepEqual(await stopPlans(options.output),[]);
});
test('review documentation identifies both user profiles without an exclusive pilot claim',async()=>{
 const guide=await readFile(new URL('enrolled-operator-guide.md',import.meta.url),'utf8');
 assert.match(guide,/Both `portable-enrolled-user-pilot-1` and `portable-enrolled-user-review-1`/);
 assert.doesNotMatch(guide,/Only a bundle whose manifest version/);
 assert.match(guide,/pilot has 52 bundle entries/);assert.match(guide,/review profile has 55/);
});
