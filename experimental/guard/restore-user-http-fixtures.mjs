// Exact authorized disposable fixtures only. Never a general account cleaner.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker);
const id='3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
const run=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});
assert.equal(run(['inspect','--format','{{.Id}}|{{.Name}}|{{.State.Running}}',id]).trim(),id+'|/irisops-pilot-policy-20260926-e|true');
const term=(lines,ns='IRISOPS')=>{const out=run(['exec','-i',id,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!/ERROR #|<PROTECT>|FAILED|TEST_ERROR/.test(out),'Native restoration failed; output withheld');return out;};
const status='if $system.Status.IsError(sc) write "FAILED",! halt';
const metadata=term([
 'set ok=##class(Security.Users).Exists("IrisOps_UserRoleProbeUser",.u,.sc)',status,
 'write "TARGET=",ok,"|",u.FullName,"|",u.Enabled,"|",u.SuperUser,"|",u.Roles.Count(),"|",$select(u.Roles.Count()=1:u.Roles.GetAt(1),1:""),!',
 'set ok=##class(Security.Users).Exists("IrisOps_UserHttpOperator",.u,.sc)',status,
 'write "ACTOR=",ok,"|",u.FullName,"|",u.SuperUser,"|",u.Roles.Count(),"|",u.Roles.GetAt(1),!',
 'set sc=##class(Security.Roles).Get("IrisOps_UserRoleProbeRole",.p)',status,
 'write "ROLE=",p("Description"),"|",p("Resources"),!','kill p',
 'set sc=##class(Security.Roles).Get("IrisOps_UserRoleProbeExtra",.p)',status,
 'write "EXTRA=",p("Description"),"|",p("Resources"),!'
],'%SYS');
assert.match(metadata,/TARGET=1\|Owned disabled HTTP target\|0\|0\|(?:0\||1\|IrisOps_UserRoleProbeRole)\r?\n/);
assert.match(metadata,/ACTOR=1\|Owned HTTP operator\|0\|1\|IrisOps_UserRoleProbeExtra/);
assert.match(metadata,/ROLE=Owned user HTTP target role\|IrisOps_EnrolledOne:R/);
assert.match(metadata,/EXTRA=Owned user HTTP operator role\|(?:%Admin_Secure:U,)?%DB_IRISOPS:R,%DB_IRISSYS:R/);
const call=expr=>{const out=term([`try { set r=${expr} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR",! }`]);return JSON.parse(out.match(/^RESULT=(.*)$/m)[1]);};
const plan=call('##class(IrisOps.Guard.Deployment).Plan()');
call(`##class(IrisOps.Guard.Deployment).Apply("${plan.fingerprint}","SUSPENDED")`);
assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'SUSPENDED');
const c={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:'IrisOps_EnrolledOne,IrisOps_EnrolledTwo'};
const p=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(c)+')');
call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(c)+',"'+p.fingerprint+'",'+p.expires+')');
assert.deepEqual(call('##class(IrisOps.Guard.TargetPolicy).Current()').config,{...c,resources:c.resources.toUpperCase()});
term(['set sc=##class(Security.Users).Delete("IrisOps_UserHttpOperator")',status,'set sc=##class(Security.Users).Delete("IrisOps_UserRoleProbeUser")',status,'set sc=##class(Security.Roles).Delete("IrisOps_UserRoleProbeExtra")',status,'set sc=##class(Security.Roles).Delete("IrisOps_UserRoleProbeRole")',status],'%SYS');
const after=term(['write "REMAINING=",##class(Security.Users).Exists("IrisOps_UserHttpOperator")+##class(Security.Users).Exists("IrisOps_UserRoleProbeUser")+##class(Security.Roles).Exists("IrisOps_UserRoleProbeExtra")+##class(Security.Roles).Exists("IrisOps_UserRoleProbeRole"),!'],'%SYS');
assert.match(after,/REMAINING=0/);
console.log('Verified: four owned fixtures removed; legacy policy restored; SUSPENDED. No file or volume removed.');
