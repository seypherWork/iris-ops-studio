import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
const container='iris-ops-guard-dev-20260925',user='IrisOps_GuardIdentityProbe',role='IrisOps_GuardIdentityRole';
const password=randomBytes(32).toString('base64url')+'aA1!';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:30000});}catch{throw Error('Lab command failed; raw output suppressed');}}
function terminal(lines,ns='%SYS'){const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('ERROR #')&&!out.includes('FAILED'));return out;}
const check='if sc\'=1 write "FAILED",! halt';
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),'d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38');
assert.ok(terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),!`]).includes('ABSENT=0'));
assert.ok(terminal([`write "ROLE=",##class(Security.Roles).Exists("${role}"),!`]).includes('ROLE=0'));
assert.ok(terminal(['set sc=##class(Security.Applications).Get("/api/irisops-http-guard",.p)',check,'write "BASE=",p("DispatchClass"),!']).includes('BASE=IrisOps.Guard.HttpApi'));
run(['cp',fileURLToPath(new URL('IrisOps.Guard.IdentityProbe.cls',import.meta.url)),container+':/tmp/IrisOps.Guard.IdentityProbe.cls']);
terminal(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.IdentityProbe.cls","ck")',check],'IRISOPS');
try{
 terminal([`set sc=##class(Security.Roles).Create("${role}","Only existing application database read","%DB_IRISOPS:R","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable metadata probe","USER","","",0,1)`,check,'set p("DispatchClass")="IrisOps.Guard.IdentityProbe"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
 const r=await fetch('http://127.0.0.1:52801/api/irisops-http-guard/v1/identity-probe',{headers:{Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')},signal:AbortSignal.timeout(10000)});
 const j=await r.json();console.log('HTTP',r.status,'AVAILABLE',j.available,'KIND',j.kind);
 terminal(['set p("NameSpace")="%SYS"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
 const s=await fetch('http://127.0.0.1:52801/api/irisops-http-guard/v1/identity-probe',{headers:{Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')},signal:AbortSignal.timeout(10000)});
 const k=await s.json();console.log('SYS_HTTP',s.status,'AVAILABLE',k.available,'KIND',k.kind);
}finally{
 terminal(['set p("DispatchClass")="IrisOps.Guard.HttpApi",p("NameSpace")="IRISOPS"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check]);
 assert.ok(terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),!`]).includes('ABSENT=0'));console.log('PROBE_RESTORED');
}
