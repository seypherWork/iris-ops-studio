import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const name='irisops-pilot-policy-20260926-e';
const id='3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
const role='IrisOps_RoleHttpTarget',operator='IrisOps_RoleHttpOperator',user='IrisOps_RoleHttpUser';
const legacy={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:'IrisOps_EnrolledOne,IrisOps_EnrolledTwo'};
const run=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim(),id+'|true|/'+name);
function term(lines,ns='IRISOPS'){
 const out=run(['exec','-i',id,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));
 assert.ok(!/ERROR #|<PROTECT>|STEP_FAILED|TEST_ERROR=/.test(out),'Native step failed; output suppressed');return out;
}
function call(expression){
 const out=term([`try { set r=${expression} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR=",e.Name,! }`]);
 const m=out.match(/^RESULT=(\{.*\})$/m);assert.ok(m);return JSON.parse(m[1]);
}
const native=()=>{const out=term([`set sc=##class(Security.Roles).Get("${role}",.p)`,
 'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
 'write "ROLE=",p("Resources"),"|",p("Description"),!'],'%SYS');
 return out.match(/^ROLE=(.*)$/m)?.[1].trim();
};
assert.equal(native(),'IrisOps_EnrolledTwo:U|Owned HTTP access probe');
assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'ACTIVE');
assert.equal(call('##class(IrisOps.Guard.TargetPolicy).Current()').config.role,role);
const p=call('##class(IrisOps.Guard.Deployment).Plan()');
assert.equal(call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","SUSPENDED","managed-lab-a")`).mode,'SUSPENDED');
term([`set p("Resources")="IrisOps_EnrolledOne:R",sc=##class(Security.Roles).Modify("${role}",.p)`,
 'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
assert.equal(native(),'IrisOps_EnrolledOne:R|Owned HTTP access probe');
const policy=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(legacy)+')');
call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(legacy)+',"'+policy.fingerprint+'",'+policy.expires+')');
assert.equal(call('##class(IrisOps.Guard.TargetPolicy).Current()').config.role,undefined);
term([`set sc=##class(Security.Users).Delete("${user}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
 `set sc=##class(Security.Roles).Delete("${operator}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
 `set sc=##class(Security.Roles).Delete("${role}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
const out=term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${operator}"),##class(Security.Roles).Exists("${role}"),!`],'%SYS');
assert.ok(out.includes('ABSENT=000'));assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'SUSPENDED');
console.log('PASS exact temporary role restored, policy reverted, all three test identities removed and guard suspended');
