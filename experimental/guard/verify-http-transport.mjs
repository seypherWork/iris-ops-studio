// Isolated integration probe; never prints passwords, tokens, cookies or CSRF.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker,'Set Docker executable explicitly');
const container='iris-ops-guard-dev-20260925';
const id='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52801', app='/api/irisops-http-guard';
const user='IrisOps_GuardProbeUser',role='IrisOps_GuardProbeRole',wallet='IrisOps_GuardProbeWallet',resource='IrisOps_GuardProbeResource';
const password=randomBytes(32).toString('base64url')+'aA1!';
const basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const evidence=[]; let owns=false,completed=false;
const check='if sc\'=1 write "FIXTURE_FAILED",! halt';
function run(args,input) { try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:45000});}catch{throw new Error('Lab command failed; raw output suppressed');} }
function terminal(lines,ns='%SYS') {
 const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));
 assert.ok(!out.includes('FIXTURE_FAILED')&&!out.includes('<')&&!out.includes('Detected 1 errors'),'IRIS command failed; raw output suppressed');return out;
}
function change(lines,ns='%SYS'){assert.ok(terminal([...lines,'write "DONE",!'],ns).includes('DONE'));}
function pass(name){evidence.push(name);console.log('PASS '+name);}
async function request(path,headers={},method='GET',body) {
 const r=await fetch(origin+app+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 const text=await r.text();
 assert.ok(!text.includes(password)&&!text.includes(basic)&&!text.includes('TEST-SECRET-MUST-NOT-LEAK')&&!text.includes('TEST SECRET VALUE MUST NOT LEAK')&&!text.includes('private_stack_trace')&&!/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text),'Credential exposed in HTTP response');
 let data;try{data=JSON.parse(text);}catch{data=null;}
 return {status:r.status,headers:r.headers,data};
}
function assertAbsence(marker){assert.ok(terminal([`write "${marker}=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Resources).Exists("${resource}"),!`]).includes(marker+'=0000'),'Owned fixtures absent');}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),id);
const baseline=terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "BASE=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),"|",p("NameSpace"),!']);
assert.ok(baseline.includes('BASE=1||%Api.Admin|%SYS'),'Unexpected source app configuration');
assertAbsence('ABSENT');
for(const cls of ['Api','HttpTransport','Vault','HttpApi','TestSession','FaultEndpoint']){
 run(['cp',fileURLToPath(new URL(`IrisOps.Guard.${cls}.cls`,import.meta.url)),container+`:/tmp/IrisOps.Guard.${cls}.cls`]);
 change([`set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.${cls}.cls","ck")`,check],'IRISOPS');
}
const map=terminal(['set sc=##class(Config.MapGlobals).Get("IRISOPS","IrisOpsGuardBoot",.p) write "MAP=",$select(sc=1:p("Database"),1:"ABSENT"),!']);
if(map.includes('MAP=ABSENT'))change(['set p("Database")="IRISTEMP"','set sc=##class(Config.MapGlobals).Create("IRISOPS","IrisOpsGuardBoot",.p)',check]);
else assert.ok(map.includes('MAP=IRISTEMP'),'Refusing unrelated global mapping');
const custody=terminal(['do ##class(IrisOps.Guard.TestSession).Run()'],'IRISOPS');
assert.ok(custody.includes('CUSTODY_TESTS_COMPLETE'),'Custody test completion');
for(const line of custody.split(/\r?\n/).filter(l=>l.startsWith('PASS '))) pass('custody: '+line.slice(5));
const existing=terminal([`write "APP=",##class(Security.Applications).Exists("${app}"),!`]);
if(existing.includes('APP=0'))change([
 'set p("NameSpace")="IRISOPS",p("DispatchClass")="IrisOps.Guard.HttpApi",p("Enabled")=1,p("AutheEnabled")=32,p("UseCookies")=2,p("CookiePath")="/api/irisops-http-guard/",p("Timeout")=600,p("SessionScope")=2,p("UserCookieScope")=2',
 `set sc=##class(Security.Applications).Create("${app}",.p)`,check]);
else assert.ok(terminal([`set sc=##class(Security.Applications).Get("${app}",.p)`,check,'write "OWN=",(p("DispatchClass")="IrisOps.Guard.HttpApi")&&(p("NameSpace")="IRISOPS"),!']).includes('OWN=1'));
try{
 owns=true;
 change([
 `set sc=##class(Security.Resources).Create("${resource}","Disposable HTTP guard probe","")`,check,
 `set sc=##class(Security.Roles).Create("${role}","Disposable HTTP guard probe","%Admin_Wallet:U,%DB_IRISOPS:R","")`,check,
 `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable HTTP guard probe","USER","","",0,1)`,check,
 `set p("EditResource")="${resource}:WRITE",p("UseResource")="${resource}:READ"`,
 `set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check]);
 assert.equal((await request('/v1/session')).status,401);pass('anonymous rejected');
 const login=await request('/v1/session',{Authorization:basic});assert.equal(login.status,200);assert.equal(login.data?.actor,user);
 const cookies=login.headers.getSetCookie();assert.ok(cookies.some(c=>/HttpOnly/i.test(c)));
 assert.ok(cookies.some(c=>/Path=\/api\/irisops-http-guard\//i.test(c)),'Cookie scoped to guard');
 const headers={Cookie:cookies.map(c=>c.split(';')[0]).join('; ')};
 const controls={...headers,Origin:origin,'X-IrisOps-CSRF':login.data.csrf,'Content-Type':'application/json'};
 assert.equal((await request('/v1/session',headers)).data.actor,user);pass('native HttpOnly session and scoped cookie');
 assert.equal((await request('/v1/wallet?name='+wallet,headers)).status,401);pass('wallet blocked before upstream connection');
 for(const h of [headers,{...controls,Origin:'https://foreign.invalid'},{...controls,'X-IrisOps-CSRF':'wrong'}])assert.equal((await request('/v1/connect',h,'POST',{user,password})).status,403);
 pass('connection requires correct origin and CSRF');
 assert.equal((await request('/v1/connect',controls,'POST',{user:'_SYSTEM',password})).status,400);
 assert.equal((await request('/v1/connect',controls,'POST',{user,password,host:'evil.invalid'})).status,400);
 pass('actor substitution and arbitrary target rejected');
 async function connect(){const r=await request('/v1/connect',controls,'POST',{user,password});console.log('CONNECT status='+r.status+' reason='+(r.data?.error||'none'));assert.equal(r.status,200,'Server-held upstream authorization');assert.deepEqual(Object.keys(r.data).sort(),['actor','authorizationSeconds','connected','experimental','mode']);}
 await connect();pass('official API login token sealed on server, no credentials in response');
 const nl=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(nl.status,200);
 const auth=await nl.json(),token=(auth.result||auth).access_token;assert.equal(typeof token,'string');
 async function native(){const r=await fetch(origin+'/api/admin/v2/wallet/collection?name='+wallet,{headers:{Authorization:'Bearer '+token}});let d;try{d=await r.json();}catch{d=null;}return{status:r.status,data:d?.result||d};}
 async function guarded(){return request('/v1/wallet?name='+wallet,headers);}
 const initial=await native(),read=await guarded();console.log('READ native='+initial.status+' guard='+read.status+' reason='+(read.data?.error||'none'));
 assert.equal(read.status,200);assert.equal(read.data.EditResource,initial.data.EditResource);assert.equal(read.data.UseResource,initial.data.UseResource);pass('wallet metadata matches independent official API read');
 change([`set p("Resources")="%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
 assert.equal((await native()).status,403);assert.equal((await guarded()).status,403);assert.equal((await guarded()).status,401);pass('revoked role denied and sealed authorization cleared');
 change([`set p("Resources")="%Admin_Wallet:U,%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
 assert.equal((await guarded()).status,401);await connect();assert.equal((await guarded()).status,200);pass('restoring permission does not silently reconnect');
 change(['set p("Enabled")=0','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 const disabled=await guarded(),nativeDisabled=await native();assert.ok(disabled.status>=400&&nativeDisabled.status>=400);pass('disabled source application blocks both HTTP paths');
 change(['set p("Enabled")=1','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);await connect();
 change([`set p("Resource")="${resource}"`,'set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 const denied=await guarded(),nativeDenied=await native();assert.ok(denied.status>=400&&nativeDenied.status>=400);pass('source application resource denial respected');
 change(['set p("Resource")=""','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);await connect();
 for(const method of ['POST','PUT','PATCH','DELETE']){const r=await request('/v1/wallet?name='+wallet,controls,method,{EditResource:'%All'});assert.ok(r.status>=400&&r.status<500);}
 assert.equal((await native()).data.EditResource,initial.data.EditResource);assert.equal((await native()).data.UseResource,initial.data.UseResource);pass('no direct wallet mutation route and independent state unchanged');
 const second=await request('/v1/session',{Authorization:basic});assert.equal(second.status,200);
 const secondHeaders={Cookie:second.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
 assert.equal((await request('/v1/wallet?name='+wallet,secondHeaders)).status,401);pass('second session cannot reuse first session upstream authorization');
 assert.equal((await request('/v1/wallet?name=IrisOps_AbsentProbe',headers)).status,404);assert.equal((await guarded()).status,200);pass('not-found response sanitized without losing valid identity');
 change(['set p("DispatchClass")="IrisOps.Guard.FaultEndpoint"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 for(const [mode,status] of [['redirect',302],['extra',200],['missing',502],['invalidpolicy',502],['wrongtarget',502],['oversized',502],['error',500],['invalid',503]]){
   change([`set ^IrisOpsGuardFixture("fault")="${mode}"`],'IRISOPS');
   const r=await guarded();assert.equal(r.status,status,'Controlled upstream fault '+mode);
   if(mode==='extra')assert.deepEqual(Object.keys(r.data).sort(),['EditResource','UseResource','name']);
   else assert.deepEqual(Object.keys(r.data||{}),['error']);
   pass('upstream '+mode+' handled without redirect or raw data leak');
 }
 change(['set p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 change(['kill ^IrisOpsGuardFixture("fault")'],'IRISOPS');
 assert.equal((await guarded()).status,200);pass('upstream fault recovery remains same actor without automatic login');
 if(process.env.IRISOPS_EXTENDED_GUARD_TEST==='1'){
   await connect();console.log('Waiting for real 60-second authorization expiry');
   await new Promise(resolve=>setTimeout(resolve,61000));
   assert.equal((await guarded()).status,401);assert.equal((await request('/v1/session',headers)).data.actor,user);pass('real-time token expiry blocks reads while native session remains authenticated');
   await connect();assert.equal((await guarded()).status,200);
   assert.ok(terminal(['write "BOOT_PRESENT=",$data(^IrisOpsGuardBoot("epoch")),!'],'IRISOPS').includes('BOOT_PRESENT=1'));
   run(['restart','--time','20',container]);
   let up=false;
   for(let i=0;i<45;i++){try{if((await request('/v1/session')).status===401){up=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
   assert.ok(up,'Lab did not restart');
   assert.ok(terminal(['write "BOOT_EMPTY=",$data(^IrisOpsGuardBoot("epoch")),!'],'IRISOPS').includes('BOOT_EMPTY=0'));
   assert.equal((await guarded()).status,401);pass('real IRIS restart clears boot epoch and old authorization is unusable');
   // The old native session may itself have expired; use a fresh one to prove recovery.
   const fresh=await request('/v1/session',{Authorization:basic});assert.equal(fresh.status,200);
   const h={Cookie:fresh.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':fresh.data.csrf,'Content-Type':'application/json'};
   assert.equal((await request('/v1/connect',h,'POST',{user,password})).status,200);
   assert.equal((await request('/v1/wallet?name='+wallet,h)).status,200);
   assert.equal((await request('/v1/logout',h,'POST')).status,200);pass('explicit fresh login works after real restart');
 }else{
 assert.equal((await request('/v1/logout',{...controls,Origin:'https://foreign.invalid'},'POST')).status,403);
 assert.equal((await request('/v1/logout',controls,'POST')).status,200);assert.equal((await request('/v1/session',headers)).status,401);pass('logout invalidates native session and upstream access');
 await request('/v1/logout',{...secondHeaders,Origin:origin,'X-IrisOps-CSRF':second.data.csrf},'POST');
 }
 completed=true;
}finally{
 change(['set p("Enabled")=1,p("Resource")="",p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 change(['kill ^IrisOpsGuardFixture("fault")'],'IRISOPS');
 const restored=terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "RESTORED=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),"|",p("NameSpace"),!']);
 assert.ok(restored.includes('RESTORED=1||%Api.Admin|%SYS'),'Source app restoration readback failed');
 if(owns){change([
 `set sc=1 if ##class(%Wallet.Collection).Exists("${wallet}") set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,
 `set sc=1 if ##class(Security.Users).Exists("${user}") set sc=##class(Security.Users).Delete("${user}")`,check,
 `set sc=1 if ##class(Security.Roles).Exists("${role}") set sc=##class(Security.Roles).Delete("${role}")`,check,
 `set sc=1 if ##class(Security.Resources).Exists("${resource}") set sc=##class(Security.Resources).Delete("${resource}")`,check]);assertAbsence('CLEAN');pass('fixtures removed and source application restored');}
 await writeFile(new URL(process.env.IRISOPS_EXTENDED_GUARD_TEST==='1'?'http-transport-extended-evidence.json':'http-transport-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,completed,featureReady:false,checks:evidence},null,2)+'\n');
}
