// Read-only request diagnostics; resets only this failed lab's disposable password.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {request} from 'node:https';
import assert from 'node:assert/strict';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE,container='iris-ops-guard-tls-20260926-g',id='e36bb0103175e11a12c1ef55d3126bc167c4fbf7c94535578f9c1bda3049a675';
const user='IrisOps_GuardTLSUser',password=randomBytes(32).toString('base64url')+'aA1!';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Diagnostic command failed; raw output suppressed');}}
function term(lines,ns='%SYS'){return run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));}
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',container]).trim(),id+'|false');run(['start',container]);
try{
 for(let i=0;i<60;i++){try{if(term(['write "OK",!']).includes('OK'))break;}catch{}await new Promise(r=>setTimeout(r,500));}
 const out=term([`set p("Password")="${password}",p("PasswordNeverExpires")=1,p("ChangePassword")=0`,`set sc=##class(Security.Users).Modify("${user}",.p)`,'write "STATUS=",$system.Status.IsError(sc),!']);assert.match(out,/STATUS=0/);
 const internal=term([`set r=##class(IrisOps.Guard.HttpTransport).Request("login","${password}","${user}",.s)`,'write "DIAGNOSTIC=",s,"/",r.%Get("error","none"),!'],'IRISOPS');const m=internal.match(/^DIAGNOSTIC=(\d+\/[a-z_]+)$/m);console.log('Internal transport '+(m?.[1]||'unavailable'));
 const ca=run(['exec',container,'cat','/run/irisops-tls/ca.crt']);
 function req(path,headers,body){return new Promise((res,rej)=>{const payload=body?JSON.stringify(body):undefined;const q=request({host:'127.0.0.1',servername:'',port:52804,path:'/api/irisops-managed-guard/v1/'+path,method:body?'POST':'GET',ca,headers:{...headers,...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{try{res({status:r.statusCode,headers:r.headers,body:JSON.parse(text)});}catch{rej(Error('Invalid JSON; raw output suppressed'));}});});q.on('error',()=>rej(Error('HTTPS diagnostic failed')));q.end(payload);});}
 const s=await req('session',{Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')});assert.equal(s.status,200);
 const h={Cookie:s.headers['set-cookie'].map(c=>c.split(';')[0]).join('; '),Origin:'https://127.0.0.1:52804','X-IrisOps-CSRF':s.body.csrf};const r=await req('connect',h,{user,password});console.log('Guard connect '+r.status+' '+(/^[a-z_]+$/.test(r.body.error||'')?r.body.error:'no_safe_error_code'));
}finally{run(['stop','--time','20',container]);assert.equal(run(['inspect','--format','{{.State.Running}}',container]).trim(),'false');}
