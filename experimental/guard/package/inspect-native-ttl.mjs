// Read only token TIMING metadata in process; never serialize the token itself.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE,name='iris-ops-guard-tls-20260926-e',id='b473e44607a44619c0972092a699387e206fb46fc675cc49fe3289f6a3ca97fa';
const user='IrisOps_GuardTLSInspect',password=randomBytes(32).toString('base64url')+'aA1!';let owned=false;
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Diagnostic command failed; raw output suppressed');}}
function term(lines){return run(['exec','-i',name,'iris','session','IRIS','-U','%SYS'],[...lines,'halt',''].join('\n'));}
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',name]).trim(),id+'|false');
try{
 run(['start',name]);let ready=false;for(let i=0;i<60;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),!`]).includes('ABSENT=0'));
 const made=term([`set sc=##class(Security.Users).Create("${user}","IrisOps_GuardTLSRole","${password}","Owned TTL diagnostic","USER","","",0,1)`,'write "MADE=",$system.Status.IsOK(sc),!']);assert.ok(made.includes('MADE=1'));owned=true;
 const out=term(['set r=##class(%Net.HttpRequest).%New(),r.Server="127.0.0.1",r.Port=52773,r.Timeout=5,r.OpenTimeout=3,r.ContentType="application/json"',`do r.EntityBody.Write({"user":"${user}","password":"${password}"}.%ToJSON())`,'set sc=r.Post("/api/admin/login")','write "STATUS=",r.HttpResponse.StatusCode,!','set raw={}.%FromJSON(r.HttpResponse.Data.Read()),b=raw','if raw.%GetTypeOf("result")="object" set b=raw.result','set now=$piece($ztimestamp,",",1)*86400+$piece($ztimestamp,",",2)-($zdateh("1970-01-01",3)*86400)','if b.%GetTypeOf("exp")="number" write "TTL=",b.exp-now,!','if (b.%GetTypeOf("exp")="number")&&(b.%GetTypeOf("iat")="number") write "ISSUED_LIFETIME=",b.exp-b.iat,!']);
 for(const marker of ['STATUS','TTL','ISSUED_LIFETIME']){const m=out.match(new RegExp('^'+marker+'=([0-9.\\-]+)','m'));console.log(marker+'='+(m?.[1]||'unavailable'));}
 const names=[...out.matchAll(/<([A-Z ]+)>/g)].map(m=>m[1]);if(names.length)console.log('Diagnostic error classes='+names.join(','));
}finally{
 if(owned){assert.ok(term([`set sc=##class(Security.Users).Delete("${user}")`,'write "REMOVED=",$system.Status.IsOK(sc),!']).includes('REMOVED=1'));assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),!`]).includes('ABSENT=0'));}
 run(['stop','--time','20',name]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',name]).trim(),'false|0');
}
