// REAL IRIS, disposable target ONLY. Credentials never appear in artifacts/output.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker,'Set Docker executable explicitly');
const container='iris-ops-guard-dev-20260925',expectedId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52801',app=origin+'/api/irisops-http-guard/v1';
const user='IrisOps_GuardProbeUser',role='IrisOps_GuardProbeRole',wallet='IrisOps_GuardProbeWallet';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate'];
const userResources='%Admin_Wallet:U,%DB_IRISOPS:R,'+resources.map(r=>r+':RW').join(',');
const password=randomBytes(32).toString('base64url')+'aA1!';
const startedAt=new Date().toISOString();
const basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'};
const proposed={...initial,UseResource:resources[1]+':READ'};
const evidence=[],operations=[],recoveryKeys=new Map();let owns=false,complete=false,restored=false,headers,controls,nativeToken;
const check='if sc\'=1 write "FIXTURE_FAILED",! halt';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:45000});}catch{throw new Error('Lab command failed; raw terminal output suppressed');}}
function terminal(lines,ns='%SYS'){
 const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));
 assert.ok(!out.includes('FIXTURE_FAILED')&&!out.includes('<')&&!/Detected \d+ errors/.test(out),'Lab command failed; output suppressed');return out;
}
function change(lines,ns='%SYS'){assert.ok(terminal([...lines,'write "DONE",!'],ns).includes('DONE'));}
function pass(name){evidence.push(name);console.log('PASS '+name);}
function counter(){const out=terminal(['write "PUT_COUNT=",$get(^IrisOpsGuardBoot("observedPuts"),0),!'],'IRISOPS');const m=out.match(/PUT_COUNT=(\d+)/);assert.ok(m);return +m[1];}
async function request(path,method='GET',data,h=controls,raw=false){
 const r=await fetch(app+path,{method,headers:h,body:data===undefined?undefined:raw?data:JSON.stringify(data),redirect:'manual',signal:AbortSignal.timeout(15000)});
 const text=await r.text();assert.ok(!text.includes(password)&&!text.includes(basic)&&(!nativeToken||!text.includes(nativeToken))&&!/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text),'Secret in response');
 let body;try{body=JSON.parse(text);}catch{body=null;}
 if(path==='/previews'&&r.status===200){assert.match(body.recoveryKey,/^[a-f0-9]{64}$/);recoveryKeys.set(body.id,body.recoveryKey);}
 else for(const key of recoveryKeys.values())assert.ok(!text.includes(key),'Recovery key leaked outside preview');
 return{status:r.status,body,headers:r.headers};
}
async function native(method='GET',body){const r=await fetch(origin+'/api/admin/v2/wallet/collection?name='+wallet,{method,headers:{Authorization:'Bearer '+nativeToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200,'Independent API operation');const j=await r.json();return j.result||j;}
function same(actual,expected){for(const k of ['EditResource','UseResource'])assert.equal(actual[k].toUpperCase(),expected[k].toUpperCase(),k+' policy comparison');}
async function reconnect(){const r=await request('/connect','POST',{user,password});assert.equal(r.status,200,'Guard upstream connect');}
async function freshSession(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);headers={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};controls={...headers,Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};await reconnect();}
async function freshObserver(){const n=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(n.status,200);const j=await n.json();nativeToken=(j.result||j).access_token;assert.equal(typeof nativeToken,'string');}
async function channel(){const r=await request('/channels','POST',{});assert.equal(r.status,200,'New channel');assert.equal(r.body.mode,'read-only');return r.body.channel;}
async function enable(c){assert.equal((await request('/channels/'+c+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);}
async function preview(c,policy=proposed){const r=await request('/previews','POST',{channel:c,action:'wallet.policy.update',name:wallet,...policy});console.log('PREVIEW '+r.status+' '+(r.body?.error||'ok'));assert.equal(r.status,200,'Server preview');return r.body;}
async function execute(p,h=controls){return request('/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey},h);}
function record(r){if(r.body?.id)operations.push({id:r.body.id,state:r.body.state,reason:r.body.reason});}
function absent(){const out=terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),!`,...resources.map((r,i)=>`write "R${i}=",##class(Security.Resources).Exists("${r}"),!`)]);assert.ok(out.includes('ABSENT=000'));resources.forEach((r,i)=>assert.ok(out.includes(`R${i}=0`)));}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),expectedId);
const baseline=terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "BASE=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),!']);assert.ok(baseline.includes('BASE=1||%Api.Admin'));
absent();
for(const cls of ['Protocol','Receipt','Execution','Vault','HttpTransport','Recovery','HttpApi','CountingAdmin','LabStore','TestExecution','FaultApi']){
 run(['cp',fileURLToPath(new URL(`IrisOps.Guard.${cls}.cls`,import.meta.url)),container+`:/tmp/IrisOps.Guard.${cls}.cls`]);
 change([`set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.${cls}.cls","ck")`,check],'IRISOPS');
}
assert.ok(terminal(['do ##class(IrisOps.Guard.LabStore).Install()'],'IRISOPS').includes('GUARD_STORE_INSTALLED'));
const transaction=terminal(['tstart',`set r=##class(IrisOps.Guard.Execution).Execute("${'a'.repeat(32)}",{},"",.status)`,
 'write "TRANSACTION=",status,"|",r.error,"|",$tlevel,!','trollback'],'IRISOPS');
assert.ok(transaction.includes('TRANSACTION=503|ambient_transaction_not_allowed|1'));
pass('ambient transaction rejected without dispatch or rollback of caller transaction');
try{
 owns=true;
 change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Disposable guard wallet policy","")`,check]),
 `set sc=##class(Security.Roles).Create("${role}","Disposable guard operator","${userResources}","")`,check,
 `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable guard operator","USER","","",0,1)`,check,
 `set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check]);
 const outside=terminal([`write "NO_STORE=",'$system.Security.CheckUserPermission("${user}","%DB_IRISOPSGUARD","R"),!`]);assert.ok(outside.includes('NO_STORE=1'));pass('operator account has no standalone receipt database privilege');
 change(['set p("DispatchClass")="IrisOps.Guard.CountingAdmin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 change(['set ^IrisOpsGuardBoot("observedPuts")=0'],'IRISOPS');
 const login=await request('/session','GET',undefined,{Authorization:basic});assert.equal(login.status,200);assert.equal(login.body.actor,user);
 headers={Cookie:login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
 controls={...headers,Origin:origin,'X-IrisOps-CSRF':login.body.csrf,'Content-Type':'application/json'};
 await reconnect();
 const n=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(n.status,200);const j=await n.json();nativeToken=(j.result||j).access_token;assert.equal(typeof nativeToken,'string');
 same(await native(),initial);
 let c=await channel();let before=counter();
 assert.equal((await request('/previews','POST',{channel:c,action:'wallet.policy.update',name:wallet,...proposed})).status,403);
 assert.equal((await request('/previews/'+'a'.repeat(32)+'/execute','POST',{confirmation:'anything'})).status,400);
 assert.equal(counter(),before);pass('default read-only rejects preview and direct execute with zero PUTs');
 await enable(c);
 for(const body of [JSON.stringify({channel:c,action:'wallet.policy.update',name:wallet,...proposed,method:'PUT'}),`{"channel":"${c}","channel":"${c}","action":"wallet.policy.update","name":"${wallet}","EditResource":"${proposed.EditResource}","UseResource":"${proposed.UseResource}"}`,`{"chann\\u0065l":"${c}","channel":"${c}","action":"wallet.policy.update","name":"${wallet}","EditResource":"${proposed.EditResource}","UseResource":"${proposed.UseResource}"}`])assert.equal((await request('/previews','POST',body,controls,true)).status,400);
 assert.equal((await request('/previews','POST',{channel:c,action:'wallet.policy.update',name:'%SYSTEM',...proposed})).status,400);
 assert.equal((await request('/previews','POST',{channel:c,action:'wallet.policy.update',name:wallet,...proposed,UseResource:'*'})).status,400);
 assert.equal(counter(),before);pass('extra fields, duplicate/escaped duplicate keys, system target and wildcard rejected');
 let p=await preview(c);same(p.before,initial);same(p.expected,proposed);
 assert.equal((await request('/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey,name:'wrong'})).status,400);
 const wrongPhrase=await request('/previews/'+p.id+'/execute','POST',{confirmation:'wrong',recoveryKey:p.recoveryKey});
 assert.equal(wrongPhrase.status,400);assert.equal(wrongPhrase.body.error,'confirmation_mismatch');
 assert.equal((await request('/previews/'+p.id+'/execute','POST',{recoveryKey:p.recoveryKey})).status,400);
 assert.equal(counter(),before);pass('confirmation cannot replace stored target or policy');
 const both=await Promise.all([execute(p),execute(p)]);
 console.log('EXECUTE '+both[0].status+' '+(both[0].body?.state||both[0].body?.error||'non-JSON'));
 for(const r of both){assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');assert.equal(r.body.id,p.id);}record(both[0]);
 assert.equal(counter(),before+1);same(await native(),proposed);pass('two concurrent execute requests produce one observed native PUT and verified readback');
 const repeated=await execute(p);assert.equal(repeated.body.id,p.id);assert.equal(counter(),before+1);pass('replaying consumed preview returns same receipt without PUT');
 const digest=createHash('sha256').update('IrisOps-recovery-v1|'+user+'|'+p.id+'|'+p.recoveryKey).digest('hex').toUpperCase();
 assert.ok(terminal([`set r=##class(IrisOps.Guard.Receipt).%OpenId("${p.id}") write "HASH_ONLY=",r.RecoveryHash="${digest}",!`],'IRISOPS').includes('HASH_ONLY=1'));
 pass('durable proof is the expected actor/operation-bound SHA-256 hash, not the key');
 assert.equal((await request('/operations/'+p.id)).status,404);
 const receipt=await request('/operations/'+p.id,'GET',undefined,{...controls,'X-IrisOps-Recovery-Key':p.recoveryKey});assert.equal(receipt.status,200);assert.equal(receipt.body.state,'VERIFIED');assert.equal(receipt.body.events.length,2);pass('durable receipt requires possession proof even on legacy GET');
 p=await preview(c,initial);const restore=await execute(p);assert.equal(restore.body.state,'VERIFIED');same(await native(),initial);record(restore);pass('restore operation independently verified');
 p=await preview(c);before=counter();change(['set ^IrisOpsGuardBoot("walletFault")="readback"'],'IRISOPS');const uncertain=await execute(p);assert.equal(uncertain.status,200);assert.equal(uncertain.body.state,'UNKNOWN');assert.equal(uncertain.body.reason,'readback_unavailable');assert.equal(counter(),before+1);record(uncertain);change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback")'],'IRISOPS');same(await native(),proposed);const uncertainReplay=await execute(p);assert.equal(uncertainReplay.body.state,'UNKNOWN');assert.equal(counter(),before+1);p=await preview(c,initial);assert.equal((await execute(p)).body.state,'VERIFIED');same(await native(),initial);pass('applied change with failed readback remains UNKNOWN and replay never resends');
 p=await preview(c);before=counter();assert.equal((await request('/previews/'+p.id,'DELETE',{})).status,200);assert.equal((await execute(p)).status,400);assert.equal(counter(),before);pass('cancelled preview cannot execute');
 p=await preview(c);await native('PUT',{...initial,EditResource:resources[1]+':WRITE'});before=counter();const stale=await execute(p);assert.equal(stale.status,409);assert.equal(stale.body.reason,'stale');assert.equal(counter(),before);record(stale);await native('PUT',initial);same(await native(),initial);pass('concurrent external change blocks stale preview with zero guard PUTs');
 p=await preview(c);before=counter();assert.equal((await request('/channels/'+c+'/write-access','DELETE',{})).status,200);const disabled=await execute(p);assert.equal(disabled.body.state,'BLOCKED');assert.equal(counter(),before);record(disabled);await enable(c);pass('revoked write channel blocks pending preview');
 p=await preview(c);before=counter();await enable(c);const generation=await execute(p);assert.equal(generation.body.reason,'channel_changed');assert.equal(counter(),before);record(generation);pass('reenabling channel does not revive an old approval');
 p=await preview(c);before=counter();change([`set p("Resources")="${userResources.replace('%Admin_Wallet:U,','')}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);const revoked=await execute(p);assert.equal(revoked.body.reason,'permission_revoked');assert.equal(counter(),before);record(revoked);change([`set p("Resources")="${userResources}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);pass('role revoked after preview prevents dispatch');
 p=await preview(c);before=counter();change([`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check]);const missing=await execute(p);assert.equal(missing.body.reason,'target_not_readable');assert.equal(counter(),before);record(missing);assert.ok(terminal([`write "MISSING=",##class(%Wallet.Collection).Exists("${wallet}"),!`]).includes('MISSING=0'));change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check]);pass('deleted collection is blocked and never recreated by PUT');
 p=await preview(c);before=counter();change(['set p("Resources")="%DB_IRISOPSGUARD:R"','set sc=##class(Security.Roles).Modify("IrisOps_GuardStorage",.p)',check]);const storage=await execute(p);assert.equal(storage.status,503);assert.equal(counter(),before);change(['set p("Resources")="%DB_IRISOPSGUARD:RW"','set sc=##class(Security.Roles).Modify("IrisOps_GuardStorage",.p)',check]);assert.equal((await request('/previews/'+p.id,'DELETE',{})).status,200);pass('unwritable receipt storage fails before any PUT');
 const second=await request('/session','GET',undefined,{Authorization:basic});const h={Cookie:second.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':second.body.csrf,'Content-Type':'application/json'};assert.equal((await request('/connect','POST',{user,password},h)).status,200);p=await preview(c);before=counter();assert.equal((await execute(p,h)).status,400);assert.equal((await request('/operations/'+operations[0].id,'GET',undefined,h)).status,404);assert.equal(counter(),before);assert.equal((await request('/previews/'+p.id,'DELETE',{})).status,200);pass('other session cannot consume preview or read receipt');await request('/logout','POST',undefined,h);
 const interruptedId=randomBytes(16).toString('hex');before=counter();
 change([`set source=##class(IrisOps.Guard.Receipt).%OpenId("${operations[0].id}"),r=##class(IrisOps.Guard.Receipt).%New()`,
 `set r.OperationId="${interruptedId}",r.Actor=source.Actor,r.Binding=source.Binding,r.Target=source.Target,r.BeforeEdit=source.BeforeEdit,r.BeforeUse=source.BeforeUse,r.ExpectedEdit=source.ExpectedEdit,r.ExpectedUse=source.ExpectedUse,r.CreatedUTC=##class(IrisOps.Guard.Protocol).Stamp(),r.DispatchCount=1`,
 'set sc=r.Transition("DISPATCHING","synthetic_interrupted_dispatch")',check],'IRISOPS');
 const interrupted=await request('/previews/'+interruptedId+'/execute','POST',{confirmation:'anything',recoveryKey:'0'.repeat(64)});assert.equal(interrupted.status,404);assert.equal(counter(),before);pass('historical receipt without a recovery hash fails closed and is never resent');
 if(process.env.IRISOPS_AUDIT_TEST==='1'){
   const {runAuditSuite}=await import('./verify-audit-suite.mjs');
   await runAuditSuite({request,reconnect,freshSession,freshObserver,channel,enable,preview,execute,native,same,counter,change,terminal,pass,origin,user,role,password,initial,proposed,userResources,controls:()=>controls,check});
 }
 if(process.env.IRISOPS_RECOVERY_TEST==='1'){
   const {runRecoverySuite}=await import('./verify-recovery-suite.mjs');
   await runRecoverySuite({request,reconnect,freshSession,freshObserver,channel,enable,preview,execute,record,native,same,counter,change,terminal,pass,run,container,origin,user,role,password,initial,proposed,userResources,recoveryKeys,controls:()=>controls,check});
 }
 if(process.env.IRISOPS_UI_TEST==='1'){
   await freshSession();await freshObserver();
   const {runUiSuite}=await import('./verify-ui-suite.mjs');
   await runUiSuite({request,reconnect,freshObserver,native,same,counter,change,pass,run,container,origin,user,password,initial,proposed,check});
 }
 if(process.env.IRISOPS_INTEGRATED_UI_TEST==='1'){
   await freshSession();await freshObserver();
   const {runIntegratedUi}=await import('./verify-integrated-ui.mjs');
   await runIntegratedUi({run,container,origin,user,password,role,userResources,check,change,native,counter,same,initial,proposed,freshSession,freshObserver,pass});
 }
 if(process.env.IRISOPS_EXTENDED_WALLET_TEST==='1'){
   await reconnect();c=await channel();await enable(c);p=await preview(c);before=counter();console.log('Waiting for real preview expiration');await new Promise(r=>setTimeout(r,31000));const expired=await execute(p);assert.equal(expired.body.reason,'preview_expired');assert.equal(counter(),before);record(expired);pass('real preview expiry prevents PUT while authorization remains valid');
 }
 same(await native(),initial);restored=true;pass('final independent policy equals original');
 assert.equal((await request('/logout','POST')).status,200);
 if(process.env.IRISOPS_EXTENDED_WALLET_TEST==='1'){
   function receiptHashes(){const out=terminal(operations.map(o=>`set r=##class(IrisOps.Guard.Receipt).%OpenId("${o.id}") if $isobject(r) write "RECEIPT=${o.id} ",$system.Encryption.ToHex($system.Encryption.SHAHash(256,r.Public().%ToJSON())),!`),'IRISOPS');return out.split(/\r?\n/).filter(l=>l.startsWith('RECEIPT='));}
   const hashes=receiptHashes();assert.equal(hashes.length,operations.length);run(['restart','--time','20',container]);let up=false;
   for(let i=0;i<45;i++){try{if((await request('/session','GET',undefined,{})).status===401){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
   assert.ok(up,'Lab restart failed');assert.deepEqual(receiptHashes(),hashes);pass('actual IRIS restart preserves every recorded receipt and event unchanged');
 }
 complete=true;
}finally{
 change(['set p("Enabled")=1,p("Resource")="",p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check,
 'kill p set p("Resources")="%DB_IRISOPSGUARD:RW"','set sc=##class(Security.Roles).Modify("IrisOps_GuardStorage",.p)',check]);
 change(['set p("DispatchClass")="IrisOps.Guard.HttpApi"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
 change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback"),^IrisOpsGuardBoot("executionFault"),^IrisOpsGuardBoot("auditFault"),^IrisOpsGuardBoot("auditSnapshots")'],'IRISOPS');
 if(owns){
   // Independent test-fixture restoration, even if the HTTP suite failed.
   change([`if ##class(%Wallet.Collection).Exists("${wallet}") { set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}" set sc=##class(%Wallet.Collection).Modify("${wallet}",.p) } else {set sc=1}`,check]);
   change([`set sc=1 if ##class(%Wallet.Collection).Exists("${wallet}") set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,
   `set sc=1 if ##class(Security.Users).Exists("${user}") set sc=##class(Security.Users).Delete("${user}")`,check,
   `set sc=1 if ##class(Security.Roles).Exists("${role}") set sc=##class(Security.Roles).Delete("${role}")`,check,
   ...resources.flatMap(r=>[`set sc=1 if ##class(Security.Resources).Exists("${r}") set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();pass('owned fixtures removed; receipts retained, no historical evidence deleted');
 }
 const config=terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "RESTORED=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),!']);assert.ok(config.includes('RESTORED=1||%Api.Admin'));
 const logs=run(['logs','--since',startedAt,container]);
 assert.ok(!logs.includes(password)&&(!nativeToken||!logs.includes(nativeToken))&&[...recoveryKeys.values()].every(k=>!logs.includes(k)),'Sensitive value in container logs');
 pass('container logs for this run contain none of its known password, observer token or recovery keys');
 await writeFile(new URL(process.env.IRISOPS_INTEGRATED_UI_TEST==='1'?'wallet-integrated-evidence.json':process.env.IRISOPS_UI_TEST==='1'?'wallet-ui-evidence.json':process.env.IRISOPS_RECOVERY_TEST==='1'?'wallet-recovery-evidence.json':process.env.IRISOPS_EXTENDED_WALLET_TEST==='1'?'wallet-execution-extended-evidence.json':'wallet-execution-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,complete,restored,releaseReady:false,checks:evidence,operations},null,2)+'\n');
}
