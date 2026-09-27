import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Terminal-only validation in the exact, previously owned development lab.
// No real account is used or modified; the target cannot log in.
const cleanRoot=process.env.IRISOPS_USER_CLEAN_ROOT;
const name=cleanRoot?process.env.IRISOPS_USER_LAB_NAME:'irisops-pilot-policy-20260926-e';
const id=cleanRoot?process.env.IRISOPS_USER_LAB_ID:'3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
assert.match(id??'',/^[a-f0-9]{64}$/);if(cleanRoot)assert.match(name??'',/^irisops-pilot-clean-enrolled-20260927-[a-z]$/);
const user='IrisOps_UserRoleProbeUser',role='IrisOps_UserRoleProbeRole',extra='IrisOps_UserRoleProbeExtra';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const suffix=process.env.IRISOPS_USER_RUN_ID;assert.match(suffix??'',/^[a-z0-9-]{1,40}$/);
const directory=resolve('../irisops-user-native-20260927-'+suffix);
const checks=[];
const run=(args,input)=>{
 try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}
 catch{throw Error('Docker/native operation failed; raw output suppressed to protect ephemeral test credentials');}
};
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim(),`${id}|true|/${name}`);
const term=(lines,namespace='IRISOPS')=>{
 const out=run(['exec','-i',id,'iris','session','IRIS','-U',namespace],[...lines,'halt',''].join('\n'));
 assert.ok(!/ERROR #|<PROTECT>|STEP_FAILED|TEST_ERROR=/.test(out),'Native request failed (raw output suppressed)');
 return out;
};
const value=(out,label)=>{const m=out.match(new RegExp('^'+label+'=(.*)$','m'));assert.ok(m,'Missing '+label);return m[1].trim();};
const call=expr=>JSON.parse(value(term([`try { set r=${expr} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR=",e.Name,! }`]),'RESULT'));
const legacy={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:'IrisOps_EnrolledOne,IrisOps_EnrolledTwo'};
const config={...legacy,role,user};
const enroll=config=>{
 const p=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(config)+')');assert.equal(p.mode,'SUSPENDED');
 return call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(config)+',"'+p.fingerprint+'",'+p.expires+')');
};
const state=(action='',target=user,selected=role)=>JSON.parse(value(term([
 `set b=##class(IrisOps.Guard.UserTransport).State("${target}","${selected}","${action}",.status,.expected,.next)`,
 'set r={"status":(status),"before":(b),"expected":(expected)}','write "STATE=",r.%ToJSON(),!'
]),'STATE'));
const write=(action,p)=>Number(value(term([
 `do ##class(IrisOps.Guard.UserTransport).Write("${user}","${role}","${action}","${p.before.configurationHash}","${p.expected.configurationHash}",.status)`,
 'write "STATUS=",status,!'
]),'STATUS'));
const native=()=>JSON.parse(value(term([
 `set found=##class(Security.Users).Exists("${user}",.u,.sc)`,
 'if (\'found)!($system.Status.IsError(sc)) write "STEP_FAILED",! halt',
 'set roles="" for i=1:1:u.Roles.Count() { set roles=roles_$select(roles="":"",1:",")_u.Roles.GetAt(i) }',
 'set r={"roles":(roles),"enabled":(u.Enabled),"superUser":(u.SuperUser),"namespace":(u.NameSpace)}',
 'write "NATIVE=",r.%ToJSON(),!'
],'%SYS'),'NATIVE'));
const modifyUser=fields=>term([
 'kill p',...Object.entries(fields).map(([k,v])=>`set p("${k}")=${JSON.stringify(v)}`),
 `set sc=##class(Security.Users).Modify("${user}",.p)`,
 'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'
],'%SYS');
const modifyRole=fields=>term([
 'kill p',...Object.entries(fields).map(([k,v])=>`set p("${k}")=${JSON.stringify(v)}`),
 `set sc=##class(Security.Roles).Modify("${role}",.p)`,
 'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'
],'%SYS');
let complete=false;
await mkdir(directory); // Refuse overwriting any earlier evidence.
try{
 assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'SUSPENDED');
 const old=call('##class(IrisOps.Guard.TargetPolicy).Current()');
 assert.deepEqual(old.config,{...legacy,resources:legacy.resources.toUpperCase()});
 assert.equal(value(term([`write "ABSENT=",##class(Security.Users).Exists("${user}")+##class(Security.Roles).Exists("${role}")+##class(Security.Roles).Exists("${extra}"),!`],'%SYS'),'ABSENT'),'0');
 const durable=process.env.IRISOPS_USER_DURABLE==='1';
 const sources=['Deployment','TargetPolicy','UserTransport',...(durable?['Receipt','UserExecution','UserRecovery','TestSession','UserTestExecution','TestUserWorkflow']:[])];
 const hashes={};
 if(cleanRoot){const {verifyBundle}=await import('./package/portable.mjs');const b=await verifyBundle(resolve(cleanRoot));assert.equal(b.runtimeProfile,'enrolled-user-v1');for(const e of b.runtime.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',id,'sha256sum','/opt/irisops-guard/'+e.path]).split(/\s/)[0],e.sha256);}
 for(const cls of sources){
  const file=resolve('experimental/guard/IrisOps.Guard.'+cls+'.cls');
  hashes[cls]=createHash('sha256').update(await readFile(file)).digest('hex');
  if(cleanRoot&&!['TestSession','UserTestExecution','TestUserWorkflow'].includes(cls)){
   assert.equal(run(['exec',id,'sha256sum','/opt/irisops-guard/classes/IrisOps.Guard.'+cls+'.cls']).split(/\s/)[0],hashes[cls]);continue;
  }
  // Existing source is recoverable from the prior immutable bundle B.
  const dest='/tmp/irisops-user-native-'+suffix+'-'+cls+'.cls';
  run(['cp',file,id+':'+dest]);
  term([`set sc=$system.OBJ.Load("${dest}","ck")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt']);
 }
 checks.push('native_classes_compile');
 // Source-revision fencing is independently exercised by verify-revision-fence;
 // merely reloading identical source must not be mistaken for a source change.
 const password=randomBytes(32).toString('base64url')+'aA1!';
 term([
  `set sc=##class(Security.Roles).Create("${role}","Owned disabled-user role probe","IrisOps_EnrolledOne:R","")`,
  'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
  `set sc=##class(Security.Roles).Create("${extra}","Owned extra membership probe","","")`,
  'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
  `set sc=##class(Security.Users).Create("${user}","","${password}","Owned disabled user probe","USER","","",0,0)`,
  'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'
 ],'%SYS');
 assert.equal(state().status,403);enroll(config);
 let p=state('assign');assert.equal(p.status,200);assert.equal(p.before.assigned,false);assert.equal(p.expected.assigned,true);
 assert.equal(native().roles,'');checks.push('preview_has_no_native_write');
 assert.equal(state('',user,extra).status,403);assert.equal(state('','_SYSTEM').status,403);
 assert.equal(state('enable').status,400);checks.push('off_target_and_unlisted_actions_refused');
 assert.equal(write('assign',p),200);assert.deepEqual(state().before,p.expected);
 assert.deepEqual(native(),{roles:role,enabled:0,superUser:0,namespace:'USER'});
 assert.equal(state('assign').status,400);checks.push('assign_full_membership_readback_disabled_account_preserved');
 p=state('remove');modifyRole({Description:'External role drift'});
 assert.equal(write('remove',p),409);assert.equal(native().roles,role);
 modifyRole({Description:'Owned disabled-user role probe'});checks.push('role_drift_blocks_write');
 p=state('remove');modifyUser({NameSpace:'IRISOPS'});
 assert.equal(write('remove',p),409);assert.equal(native().roles,role);
 modifyUser({NameSpace:'USER'});checks.push('user_drift_blocks_write');
 modifyUser({Roles:role+','+extra});assert.equal(state().status,503);assert.deepEqual(native().roles.split(',').sort(),[role,extra].sort());
 modifyUser({Roles:role});checks.push('extra_membership_refused_not_overwritten');
 for(const resource of ['%Admin_Operate:U','%DB_IRISSYS:R']){
  modifyRole({Resources:'IrisOps_EnrolledOne:R,'+resource});assert.equal(state().status,503);
 }
 modifyRole({Resources:'IrisOps_EnrolledOne:R'});checks.push('admin_and_system_database_grants_refused');
 modifyRole({GrantedRoles:extra});assert.equal(state().status,503);modifyRole({GrantedRoles:''});
 checks.push('inherited_role_refused');
 // No login attempt is made during this brief enabled-state refusal test.
 modifyUser({Enabled:1});assert.equal(state().status,503);modifyUser({Enabled:0});
 checks.push('enabled_account_refused');
 // Clearing $roles on an administrator terminal does NOT remove its native
 // superuser authority. Do not present that simulation as a negative actor test.
 const admin=value(term([`write "HAS_ADMIN=",$system.Security.CheckUserPermission("${user}","%Admin_Secure","U"),!`],'%SYS'),'HAS_ADMIN');
 assert.equal(admin,'0');checks.push('target_account_has_no_admin_secure_permission');
 p=state('remove');assert.equal(p.status,200);assert.equal(write('remove',p),200);
 assert.deepEqual(state().before,p.expected);assert.equal(state('remove').status,400);
 assert.deepEqual(native(),{roles:'',enabled:0,superUser:0,namespace:'USER'});checks.push('remove_readback_and_noop_refusal');
 let durableResult=null;
 if(durable){
  durableResult=call('##class(IrisOps.Guard.TestUserWorkflow).Run()');assert.equal(durableResult.complete,true);
  assert.deepEqual(native(),{roles:'',enabled:0,superUser:0,namespace:'USER'});
  checks.push('durable_workflow_synthetic_session_real_native_mutations_and_receipts');
 }
 enroll(legacy);assert.equal(state().status,403);checks.push('revoked_enrollment_blocks_access');
 // Only exact fixtures created above; deletion was authorized for temporary tests.
 term([`set sc=##class(Security.Users).Delete("${user}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
  `set sc=##class(Security.Roles).Delete("${role}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
  `set sc=##class(Security.Roles).Delete("${extra}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(value(term([`write "ABSENT=",##class(Security.Users).Exists("${user}")+##class(Security.Roles).Exists("${role}")+##class(Security.Roles).Exists("${extra}"),!`],'%SYS'),'ABSENT'),'0');
 assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'SUSPENDED');
 checks.push('exact_fixtures_removed_legacy_policy_restored');
 const result={complete:true,lab:name,containerId:id,scope:'terminal-only-disabled-test-user',checks,sourceSha256:hashes,durableResult,credentialValuesRecorded:false,published:false,httpAndUiVerified:false,nonAdminCallerVerified:false};
 await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 complete=true;console.log(JSON.stringify(result));
}finally{
 if(!complete)console.error('FAILED: preserve exact lab for inspection; do not retry or delete evidence blindly. Completed checks: '+checks.join(', '));
}
