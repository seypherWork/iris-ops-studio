// Pinned, disposable REAL IRIS. No passwords/tokens/proofs in stdout/artifacts.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {preview as validatePreview,receipt as validateReceipt,recovery as validateRecovery} from './ui/contracts.js';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const container='iris-ops-guard-dev-20260925',id='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52801',app='/api/irisops-web-guard',target='/csp/irisops-guard-testweb';
const user='IrisOps_GuardWebUser',role='IrisOps_GuardWebRole',resource='IrisOps_GuardWebResource';
// Native security APIs additionally require read access to IRISSYS (2025.2+).
const rights='%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,'+resource+':U',description='Owned disposable guard webapp fixture';
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const started=new Date().toISOString(),checks=[],proofs=new Map();let owned=false,complete=false,restored=false,controls,token,initial;
const check='if sc\'=1 write "FIXTURE_FAILED",! halt';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw new Error('Pinned lab command failed; raw output suppressed');}}
function terminal(lines,ns='%SYS'){
 const text=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));
 assert.ok(!text.includes('<')&&!text.includes('FIXTURE_FAILED')&&!/Detected \d+ errors/.test(text),'IRIS fixture failure; raw output suppressed');return text;
}
function change(lines,ns='%SYS'){assert.ok(terminal([...lines,'write "DONE",!'],ns).includes('DONE'));}
function pass(s){checks.push(s);console.log('PASS '+s);}
function absent(){assert.ok(terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(Security.Resources).Exists("${resource}"),##class(Security.Applications).Exists("${target}"),!`]).includes('ABSENT=0000'));}
function counter(){return Number(terminal(['write "COUNT=",$get(^IrisOpsGuardBoot("webPuts"),0),!'],'IRISOPS').match(/COUNT=(\d+)/)[1]);}
function fault(value=''){change([`set ^IrisOpsGuardBoot("webFault")="${value}"`,'kill ^IrisOpsGuardBoot("webDenyReadback"),^IrisOpsGuardBoot("webWaiting")'],'IRISOPS');}
function dispatcher(value='IrisOps.Guard.WebApi'){change([`set p("DispatchClass")="${value}"`,`set sc=##class(Security.Applications).Modify("${app}",.p)`,check]);}
function setRole(value=rights){change([`set p("Resources")="${value}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);}
async function request(path,method='GET',body,h=controls,raw=false){
 const r=await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:raw?body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});
 const text=await r.text();assert.ok(!text.includes(password)&&!text.includes(basic)&&(!token||!text.includes(token)),'Known secret exposed');
 let data;try{data=JSON.parse(text);}catch{data=null;}
 if(path==='/previews'&&r.status===200)proofs.set(data.id,data.recoveryKey);
 else for(const key of proofs.values())assert.ok(!text.includes(key),'Recovery proof exposed');
 return {status:r.status,body:data,headers:r.headers};
}
async function session(){
 const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);
 assert.ok(r.headers.getSetCookie().some(c=>c.toLowerCase().includes('path='+app+'/')&&/HttpOnly/i.test(c)));
 controls={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};
 assert.equal((await request('/connect','POST',{user,password})).status,200);
 const n=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});
 assert.equal(n.status,200);const j=await n.json();token=(j.result||j).access_token;return controls;
}
async function native(){const r=await fetch(origin+'/api/admin/v2/web-app?name='+encodeURIComponent(target),{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);const j=await r.json();return j.result;}
async function channel(enabled=true){
 const r=await request('/channels','POST',{});assert.equal(r.status,200);const c=r.body.channel;
 if(enabled)assert.equal((await request('/channels/'+c+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);return c;
}
async function preview(c,enabled=true){const r=await request('/previews','POST',{channel:c,action:'webapp.availability.update',name:target,Enabled:String(enabled)});assert.equal(r.status,200,'Webapp preview: '+r.body?.error);return validatePreview(r.body,'webapp');}
async function execute(p,h=controls){return request('/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey},h);}
function receipt(r,p){return validateReceipt(r.body,{id:p.id,actor:user,kind:'webapp',approved:p,allowIncomplete:true});}
async function recover(p,record=false){const r=await request('/operations/'+p.id+(record?'/reconcile':'/inspect'),'POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200,'Web recovery');return validateRecovery(r.body,{id:p.id,actor:user,record,kind:'webapp'});}
function restore(){change([`set p("Enabled")=0,p("Description")="${description}"`,`set sc=##class(Security.Applications).Modify("${target}",.p)`,check]);}
function createWeb(){change([
 `set p("Enabled")=0,p("NameSpace")="IRISOPS",p("IsNameSpaceDefault")=0,p("AutheEnabled")=32,p("Resource")="${resource}",p("ServeFiles")=0,p("Description")="${description}",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,
 `set sc=##class(Security.Applications).Create("${target}",.p)`,check]);}
function receiptSnapshot(){
 const text=terminal(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")',
 'while q.%Next() { set id=q.%Get("OperationId"),r=##class(IrisOps.Guard.Receipt).%OpenId(id) write "ROW=",id,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,r.Public().%ToJSON())),! }'],'IRISOPS');
 return new Map([...text.matchAll(/ROW=([a-f0-9]{32})\|([A-Fa-f0-9]{64})/g)].map(m=>[m[1],m[2]]));
}
async function waitUp(){for(let n=0;n<45;n++){try{if((await request('/session','GET',undefined,{})).status===401)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('IRIS restart not ready');}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),id);absent();
const historical=receiptSnapshot();assert.ok(historical.size>0,'Existing durable lab receipts must remain');
assert.ok(terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "BASE=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),!']).includes('BASE=1||%Api.Admin'));
for(const cls of ['Receipt','Protocol','Vault','HttpTransport','Execution','Recovery','HttpApi','WebTransport','WebExecution','WebRecovery','WebApi','WebTestExecution','WebFaultApi','CountingAdmin']){
 run(['cp',fileURLToPath(new URL('IrisOps.Guard.'+cls+'.cls',import.meta.url)),container+':/tmp/IrisOps.Guard.'+cls+'.cls']);
 change(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.'+cls+'.cls","ck")',check],'IRISOPS');
}
const exists=terminal([`write "APP=",##class(Security.Applications).Exists("${app}"),!`]).includes('APP=1');
if(exists){
 assert.ok(terminal([`set sc=##class(Security.Applications).Get("${app}",.p)`,check,'write "OWN=",(p("DispatchClass")="IrisOps.Guard.WebApi")&&(p("NameSpace")="IRISOPS")&&(p("MatchRoles")=":IrisOps_GuardStorage")&&(p("AutheEnabled")=32),!']).includes('OWN=1'));
}else change([
 `set p("NameSpace")="IRISOPS",p("DispatchClass")="IrisOps.Guard.WebApi",p("Enabled")=1,p("AutheEnabled")=32,p("UseCookies")=2,p("CookiePath")="${app}/",p("Timeout")=600,p("SessionScope")=2,p("UserCookieScope")=2,p("MatchRoles")=":IrisOps_GuardStorage"`,
 `set sc=##class(Security.Applications).Create("${app}",.p)`,check]);
try{
 owned=true;
 change([`set sc=##class(Security.Resources).Create("${resource}","Owned disposable web guard fixture","")`,check,
 `set sc=##class(Security.Roles).Create("${role}","Owned disposable web guard operator","${rights}","")`,check,
 `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned disposable web guard operator","USER","","",0,1)`,check]);
 createWeb();
 change(['set p("DispatchClass")="IrisOps.Guard.CountingAdmin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 change(['set ^IrisOpsGuardBoot("webPuts")=0'],'IRISOPS');fault();
 assert.equal((await request('/session','GET',undefined,{})).status,401);await session();initial=await native();assert.equal(initial.Enabled,false);
 const read=await request('/webapp');
 assert.equal(read.status,200,'Web metadata read: '+read.body?.error);assert.equal(read.body.Enabled,false);
 pass('native identity, scoped HttpOnly session, fixed target metadata and documented permission');
 const metadata=value=>{
  const out=terminal(['set raw='+JSON.stringify(value),'set ok=##class(IrisOps.Guard.WebTransport).Metadata(raw,.safe)','write "META=",ok,"|",safe.%Get("configurationHash"),!'],'IRISOPS');
  const m=out.match(/META=([01])\|([a-f0-9]*)/);assert.ok(m);return {valid:m[1]==='1',hash:m[2]};
 };
 assert.deepEqual(metadata(Object.fromEntries(Object.entries(initial).reverse())),{valid:true,hash:read.body.configurationHash});
 assert.deepEqual(metadata({...initial,Enabled:true}),{valid:true,hash:read.body.configurationHash});
 assert.notEqual(metadata({...initial,Description:'Changed fixture'}).hash,read.body.configurationHash);
 assert.ok(metadata({...initial,Description:'Studio café — اختبار'}).valid);
 assert.ok(metadata({...initial,CorsAllowlist:['https://example.invalid']}).valid);
 for(const value of [{...initial,unexpected:true},{...initial,Enabled:1},{...initial,MatchRoles:[{}]},{...initial,Path:'/usr/irissys/csp'},{...initial,Type:1},{...initial,WSGIType:'unknown'},{...initial,CorsHeadersList:[3]}])assert.equal(metadata(value).valid,false);
 const missing={...initial};delete missing.Description;assert.equal(metadata(missing).valid,false);
 pass('real metadata canonicalization preserves types/arrays, detects changed config and rejects partial/unsafe schemas');
 let c=await channel(false),n=counter();
 assert.equal((await request('/previews','POST',{channel:c,action:'webapp.availability.update',name:target,Enabled:'true'})).status,403);
 assert.equal(counter(),n);pass('server read-only blocks direct preview with no PUT');
 await session();c=await channel();
 for(const body of [{channel:c,action:'webapp.availability.update',name:'/api/admin',Enabled:'false'},{channel:c,action:'webapp.availability.update',name:target,Enabled:true},{channel:c,action:'webapp.availability.update',name:target,Enabled:'true',Resource:'%All'},{channel:c,action:'wallet.policy.update',name:target,Enabled:'true'}])assert.equal((await request('/previews','POST',body)).status,400);
 const body=JSON.stringify({channel:c,action:'webapp.availability.update',name:target,Enabled:'true'});
 assert.equal((await request('/previews','POST',body.replace('"Enabled":','"Enabled":"false","Enabled":'),controls,true)).status,400);
 for(const h of [{...controls,Origin:'https://foreign.invalid'},{...controls,'X-IrisOps-CSRF':'bad'}])assert.equal((await request('/previews','POST',JSON.parse(body),h)).status,403);
 assert.equal(counter(),n);pass('protected/foreign targets, extra fields, booleans-as-command, duplicate keys, CSRF and Origin rejected');
 let p=await preview(c);let results=await Promise.all([execute(p),execute(p)]);
 for(const r of results){assert.equal(r.status,200);assert.equal(receipt(r,p).state,'VERIFIED');}
 assert.equal(counter(),n+1);assert.deepEqual(await native(),{...initial,Enabled:true});pass('concurrent replay sends exactly one native PUT; complete config preserved');
 n=counter();await execute(p);await recover(p,true);assert.equal(counter(),n);pass('execute replay and recorded recovery never dispatch again');
 p=await preview(c,false);assert.equal(receipt(await execute(p),p).state,'VERIFIED');assert.deepEqual(await native(),initial);pass('reverse operation restores full original configuration');
 p=await preview(c);change([`set p("Description")="Changed after preview"`,`set sc=##class(Security.Applications).Modify("${target}",.p)`,check]);n=counter();
 const stale=receipt(await execute(p),p);assert.equal(stale.state,'BLOCKED');assert.equal(stale.reason,'stale');assert.equal(counter(),n);restore();pass('description change makes preview stale, observed zero native PUTs');
 p=await preview(c);change([`set sc=##class(Security.Applications).Delete("${target}")`,check]);n=counter();
 try{
  assert.equal(receipt(await execute(p),p).reason,'target_not_readable');assert.equal(counter(),n);
  assert.ok(terminal([`write "MISSING=",##class(Security.Applications).Exists("${target}"),!`]).includes('MISSING=0'));
 }finally{createWeb();}
 assert.deepEqual(await native(),initial);pass('missing target before fresh read blocks upsert with zero PUTs and no recreation');
 p=await preview(c);setRole('%DB_IRISOPS:R');n=counter();const revoked=receipt(await execute(p),p);assert.equal(revoked.reason,'permission_revoked');assert.equal(counter(),n);assert.equal((await request('/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey})).status,404);setRole();pass('revoked native permission blocks execution and receipt disclosure');
 await session();c=await channel();p=await preview(c);await request('/channels/'+c+'/write-access','DELETE',{});n=counter();assert.equal(receipt(await execute(p),p).reason,'read_only_or_expired_channel');assert.equal(counter(),n);pass('server relock invalidates existing approval');
 await session();c=await channel();p=await preview(c);await request('/previews/'+p.id,'DELETE',{});n=counter();assert.equal((await execute(p)).status,400);assert.equal(counter(),n);pass('cancelled preview cannot dispatch');
 await session();c=await channel();const one=await preview(c),h1=controls;await session();c=await channel();const two=await preview(c),h2=controls;n=counter();
 results=await Promise.all([execute(one,h1),execute(two,h2)]);assert.equal(results.filter(r=>r.body?.state==='VERIFIED').length,1);assert.equal(results.filter(r=>r.body?.state==='BLOCKED').length,1);assert.equal(counter(),n+1);restore();pass('different previews and sessions serialize same target, one PUT only');
 dispatcher('IrisOps.Guard.WebFaultApi');await session();c=await channel();p=await preview(c);fault('readback');n=counter();const unknown=receipt(await execute(p),p);assert.equal(unknown.state,'UNKNOWN');assert.equal(counter(),n+1);fault();
 const observation=await recover(p,true);assert.equal(observation.receipt.state,'UNKNOWN');assert.equal(observation.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(counter(),n+1);restore();pass('failed readback remains UNKNOWN; reconciliation records current match without rewrite or PUT');
 for(const failure of ['crash_before','crash_after','final_save']){
  fault();await session();c=await channel();p=await preview(c);n=counter();fault(failure);
  try{const r=await execute(p);assert.ok(r.body?.state!=='VERIFIED');}catch(e){if(e.name==='AssertionError')throw e;}
  fault();await session();const r=await recover(p,true);assert.equal(r.receipt.state,'UNKNOWN');assert.equal(r.currentObservation.outcome,failure==='crash_before'?'MATCHES_BEFORE':'MATCHES_EXPECTED');assert.equal(counter(),n+(failure==='crash_before'?0:1));restore();pass(failure+': durable uncertainty recovered with no resend');
 }
 fault();await session();c=await channel();p=await preview(c);n=counter();fault('delay_read');
 const pending=execute(p);for(let i=0;i<30;i++){if(terminal(['write "WAIT=",$get(^IrisOpsGuardBoot("webWaiting"),0),!'],'IRISOPS').includes('WAIT=1'))break;await new Promise(r=>setTimeout(r,100));}
 setRole('%DB_IRISOPS:R');const late=receipt(await pending,p);assert.equal(late.reason,'permission_revoked');assert.equal(counter(),n);fault();setRole();pass('permission revoked during actual native read is rechecked before dispatch');
 if(process.env.IRISOPS_WEB_FAST!=='1'){
  await session();c=await channel();p=await preview(c);n=counter();console.log('Waiting for real preview expiry');await new Promise(r=>setTimeout(r,31000));assert.equal(receipt(await execute(p),p).reason,'preview_expired');assert.equal(counter(),n);pass('real preview expiry causes zero PUTs');
  await session();c=await channel();p=await preview(c);fault('crash_after');try{await execute(p);}catch{}fault();await session();const beforeRestart=(await recover(p)).receipt;
  run(['restart','--time','20',container]);await waitUp();await session();n=counter();const afterRestart=await recover(p);assert.deepEqual(afterRestart.receipt,beforeRestart);assert.equal(counter(),n);restore();pass('actual container restart preserves receipt and recovery sends zero PUTs');
 }
 dispatcher();fault();await session();
 if(process.env.IRISOPS_WEB_UI==='1'){const {runWebappUi}=await import('./verify-webapp-ui.mjs');await runWebappUi({run,container,origin,user,password,target,initial,native,counter,restore,change,check,pass,session,dispatcher,fault});}
 assert.deepEqual(await native(),initial);restored=true;pass('final native detail equals the complete initial application configuration');
 const after=receiptSnapshot();for(const [id,hash] of historical)assert.equal(after.get(id),hash);
 assert.ok(terminal(['set r=##class(IrisOps.Guard.Receipt).%New(),r.Kind="",r.Events="[]",r.Rechecks="[]"','set before=r.Public().%ToJSON(),ok=(r.OperationKind()="wallet"),r.Kind="wallet"','write "COMPAT=",ok&&(before=r.Public().%ToJSON()),!'],'IRISOPS').includes('COMPAT=1'));
 pass('pre-existing durable receipt snapshots preserved; empty historical kind keeps wallet public schema');
 complete=true;
}finally{
 dispatcher();fault();setRole();
 change(['set p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 if(owned){
  restore();
  change([`set sc=##class(Security.Applications).Delete("${target}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,`set sc=##class(Security.Resources).Delete("${resource}")`,check]);absent();
  pass('only owned disposable fixtures removed after restoration; receipts retained');
 }
 const logs=run(['logs','--since',started,container]);assert.ok(!logs.includes(password)&&(!token||!logs.includes(token))&&[...proofs.values()].every(k=>!logs.includes(k)));
 pass('known test secrets absent from container logs');
 await writeFile(new URL('webapp-execution-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,complete,restored,releaseReady:false,checks},null,2)+'\n');
}
