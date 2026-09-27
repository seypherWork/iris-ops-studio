import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Only the disposable policy-validation container created by our own runner.
const name='irisops-pilot-policy-20260926-e';
const id='3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
const role='IrisOps_AccessProbeRole';
const root=resolve('../irisops-policy-validation-20260926-e');
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker);
const run=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});
const inspect=()=>run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim();
assert.equal(inspect(),`${id}|true|/${name}`);
assert.equal(JSON.parse(await readFile(resolve(root,'result.json'),'utf8')).testIdentitiesRemoved,true);
const term=(lines,namespace='IRISOPS')=>{
 const output=run(['exec','-i',id,'iris','session','IRIS','-U',namespace],[...lines,'halt',''].join('\n'));
 assert.ok(!/ERROR #|<PROTECT>|STEP_FAILED|TEST_ERROR=/.test(output),'Native request failed');
 return output;
};
const value=(output,label)=>{const match=output.match(new RegExp('^'+label+'=(.*)$','m'));assert.ok(match,'Missing '+label);return match[1].trim();};
const call=(expression)=>JSON.parse(value(term([`try { set r=${expression} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR=",e.Name,! }`]),'RESULT'));
const current=()=>call('##class(IrisOps.Guard.TargetPolicy).Current()');
const legacy={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:'IrisOps_EnrolledOne,IrisOps_EnrolledTwo'};
const enrolled={...legacy,role};
const enroll=(config)=>{const plan=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(config)+')');assert.equal(plan.mode,'SUSPENDED');assert.deepEqual(plan.config,{...config,resources:config.resources.toUpperCase()});return call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(config)+',"'+plan.fingerprint+'",'+plan.expires+')');};
const state=(resource,action='',permission='')=>{
 const output=term([`set b=##class(IrisOps.Guard.RoleTransport).State("${role}","${resource}","${action}","${permission}",.status,.expected,.next)`,'set result={"status":(status),"before":(b),"expected":(expected)}','write "STATE=",result.%ToJSON(),!']);
 return JSON.parse(value(output,'STATE'));
};
const write=(resource,action,permission,preview)=>Number(value(term([`do ##class(IrisOps.Guard.RoleTransport).Write("${role}","${resource}","${action}","${permission}","${preview.before.configurationHash}","${preview.expected.configurationHash}",.status)`,'write "WRITE_STATUS=",status,!']),'WRITE_STATUS'));
const native=()=>value(term([`set sc=##class(Security.Roles).Get("${role}",.p)`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt','write "RESOURCES=",p("Resources"),!'],'%SYS'),'RESOURCES');
let complete=false;
try{
 assert.equal(value(term([`write "ABSENT=",##class(Security.Roles).Exists("${role}"),!`],'%SYS'),'ABSENT'),'0');
 assert.equal(current().config.role,undefined);
 term([`set sc=##class(Security.Roles).Create("${role}","Owned access probe role","IrisOps_EnrolledOne:R","")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(native(),'IrisOps_EnrolledOne:R');
 assert.equal(state('IrisOps_EnrolledTwo').status,403);
 enroll(enrolled);
 term([`set p("Resources")="IrisOps_EnrolledOne:R,%Admin_Operate:U",sc=##class(Security.Roles).Modify("${role}",.p)`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(state('IrisOps_EnrolledTwo').status,503,'A role that gained admin authority after enrollment is unavailable');
 term([`set p("Resources")="IrisOps_EnrolledOne:R",sc=##class(Security.Roles).Modify("${role}",.p)`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(native(),'IrisOps_EnrolledOne:R');
 let preview=state('IrisOps_EnrolledTwo','grant','U');assert.equal(preview.status,200);
 assert.equal(preview.before.permissions,'');assert.equal(preview.expected.permissions,'U');
 assert.equal(native(),'IrisOps_EnrolledOne:R','Preview alone must not mutate IRIS');
 assert.equal(write('IrisOps_EnrolledTwo','grant','U',preview),200);
 assert.equal(native(),'IrisOps_EnrolledOne:R,IrisOps_EnrolledTwo:U');
 let observed=state('IrisOps_EnrolledTwo');assert.equal(observed.status,200);assert.deepEqual(observed.before,preview.expected);
 preview=state('IrisOps_EnrolledOne','grant','RW');assert.equal(preview.status,200);
 term([`set p("Description")="External disposable drift",sc=##class(Security.Roles).Modify("${role}",.p)`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(write('IrisOps_EnrolledOne','grant','RW',preview),409,'Stale preview must not dispatch');
 assert.equal(native(),'IrisOps_EnrolledOne:R,IrisOps_EnrolledTwo:U');
 term([`set p("Description")="Owned access probe role",sc=##class(Security.Roles).Modify("${role}",.p)`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 preview=state('IrisOps_EnrolledTwo','revoke','');assert.equal(preview.status,200);
 assert.equal(write('IrisOps_EnrolledTwo','revoke','',preview),200);
 assert.equal(native(),'IrisOps_EnrolledOne:R');
 observed=state('IrisOps_EnrolledTwo');assert.deepEqual(observed.before,preview.expected);
 enroll(legacy);
 assert.equal(state('IrisOps_EnrolledTwo').status,403);
 term([`set sc=##class(Security.Roles).Delete("${role}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
 assert.equal(value(term([`write "ABSENT=",##class(Security.Roles).Exists("${role}"),!`],'%SYS'),'ABSENT'),'0');
 complete=true;
 console.log('PASS exact owned role enrollment, post-enrollment admin-grant refusal, grant, complete-set readback, stale zero-write, revoke and cleanup');
}finally{
 if(!complete)console.error('FAILED: preserve this disposable lab for inspection; no automatic retry or broad cleanup');
 console.log('LAB='+name+' COMPLETE='+complete);
}
