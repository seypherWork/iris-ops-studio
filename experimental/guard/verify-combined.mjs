// One native identity, two independently authorized operations. Pinned lab only.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {preview as readPreview,receipt as readReceipt,recovery as readRecovery} from './ui/contracts.js';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const container='iris-ops-guard-dev-20260925',id='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52801',app='/api/irisops-combined-guard',user='IrisOps_GuardCombinedUser',role='IrisOps_GuardCombinedRole';
const wallet='IrisOps_GuardProbeWallet',target='/csp/irisops-guard-testweb',resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const walletRights='%Admin_Wallet:U,%DB_IRISOPS:R,'+resources.slice(0,2).map(r=>r+':RW').join(',');
const webRights='%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,'+resources[2]+':U',rights=walletRights+','+webRights.replace('%DB_IRISOPS:R,','');
const initialWallet={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'},proposed={...initialWallet,UseResource:resources[1]+':READ'};
const description='Owned disposable guard webapp fixture',password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const started=new Date().toISOString(),checks=[],proofs=new Map();let controls,token,initialWeb,owned=false,complete=false,restored=false,cleanupComplete=false;
const check='if sc\'=1 write "FIXTURE_FAILED",! halt';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Pinned lab command failed; raw output suppressed');}}
function terminal(lines,ns='%SYS'){const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('FIXTURE_FAILED')&&!/Detected \d+ errors/.test(out),'IRIS fixture failure; raw output suppressed');return out;}
function change(lines,ns='%SYS'){assert.ok(terminal([...lines,'write "DONE",!'],ns).includes('DONE'));}
function pass(name){checks.push(name);console.log('PASS '+name);}
function absent(){assert.ok(terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${target}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`]).includes('ABSENT=0000000'));}
function counter(){const out=terminal(['write "COUNTS=",$get(^IrisOpsGuardBoot("observedPuts"),0),"|",$get(^IrisOpsGuardBoot("webPuts"),0),!'],'IRISOPS').match(/COUNTS=(\d+)\|(\d+)/);assert.ok(out);return [+out[1],+out[2]];}
function setRole(value=rights){change([`set p("Resources")="${value}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);}
function fault(kind=''){change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("webFault"),^IrisOpsGuardBoot("denyReadback"),^IrisOpsGuardBoot("webDenyReadback")',...(kind?[`set ^IrisOpsGuardBoot("${kind==='wallet'?'walletFault':'webFault'}")="readback"`]:[])],'IRISOPS');}
function restore(){change([`set p("EditResource")="${initialWallet.EditResource}",p("UseResource")="${initialWallet.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("Description")="${description}"`,`set sc=##class(Security.Applications).Modify("${target}",.p)`,check]);}
function receiptSnapshot(){const out=terminal(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set id=q.%Get("OperationId"),r=##class(IrisOps.Guard.Receipt).%OpenId(id) write "ROW=",id,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,r.Public().%ToJSON())),! }'],'IRISOPS');return new Map([...out.matchAll(/ROW=([a-f0-9]{32})\|([A-Fa-f0-9]{64})/g)].map(m=>[m[1],m[2]]));}
async function request(path,method='GET',body,h=controls){
 const r=await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)}),text=await r.text();
 assert.ok(!text.includes(password)&&!text.includes(basic)&&(!token||!text.includes(token)),'Secret exposed');let value;try{value=JSON.parse(text);}catch{value=null;}
 if(path.endsWith('/previews')&&r.status===200)proofs.set(value.id,value.recoveryKey);else for(const k of proofs.values())assert.ok(!text.includes(k),'Proof exposed outside preview');
 return {status:r.status,body:value,headers:r.headers};
}
async function session(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);assert.equal(r.body.actor,user);assert.ok(r.headers.getSetCookie().some(c=>c.toLowerCase().includes('path='+app+'/')&&/HttpOnly/i.test(c)));controls={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};assert.equal((await request('/connect','POST',{user,password})).status,200);}
async function observer(){const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(r.status,200);const j=await r.json();token=(j.result||j).access_token;assert.equal(typeof token,'string');}
async function native(kind){const r=await fetch(origin+'/api/admin/v2/'+(kind==='wallet'?'wallet/collection?name='+wallet:'web-app?name='+encodeURIComponent(target)),{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return (await r.json()).result;}
async function assertOriginal(){const w=await native('wallet');for(const k of Object.keys(initialWallet))assert.equal(w[k].toUpperCase(),initialWallet[k].toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);}
async function channel(kind){const r=await request('/'+kind+'/channels','POST',{});assert.equal(r.status,200);assert.equal(r.body.mode,'read-only');return r.body.channel;}
async function enable(kind,c){const r=await request('/'+kind+'/channels/'+c+'/write-access','POST',{confirmation:'ENABLE WRITES'});assert.equal(r.status,200);}
function intent(kind,c,reverse=false){return kind==='wallet'?{channel:c,action:'wallet.policy.update',name:wallet,...(reverse?initialWallet:proposed)}:{channel:c,action:'webapp.availability.update',name:target,Enabled:String(!reverse)};}
async function preview(kind,c,reverse=false){const r=await request('/'+kind+'/previews','POST',intent(kind,c,reverse));assert.equal(r.status,200,'Preview '+kind+': '+r.body?.error);return readPreview(r.body,kind);}
async function execute(kind,p){const r=await request('/'+kind+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey});assert.ok([200,409].includes(r.status),'Execute '+kind+': '+r.status);return readReceipt(r.body,{id:p.id,actor:user,kind,approved:p,allowIncomplete:true});}
async function recover(kind,p,record=false){const r=await request('/'+kind+'/operations/'+p.id+(record?'/reconcile':'/inspect'),'POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);return readRecovery(r.body,{id:p.id,actor:user,kind,record});}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),id);absent();
assert.ok(terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "BASE=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),!']).includes('BASE=1||%Api.Admin'));
const historical=receiptSnapshot();assert.ok(historical.size>0);
for(const cls of ['Protocol','Receipt','Vault','HttpTransport','Execution','Recovery','HttpApi','WebTransport','WebExecution','WebRecovery','WebApi','CombinedApi','CountingAdmin']){
 run(['cp',fileURLToPath(new URL('IrisOps.Guard.'+cls+'.cls',import.meta.url)),container+':/tmp/IrisOps.Guard.'+cls+'.cls']);
 change(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.'+cls+'.cls","ck")',check],'IRISOPS');
}
const exists=terminal([`write "APP=",##class(Security.Applications).Exists("${app}"),!`]).includes('APP=1');
if(exists)assert.ok(terminal([`set sc=##class(Security.Applications).Get("${app}",.p)`,check,'write "OWN=",(p("DispatchClass")="IrisOps.Guard.CombinedApi")&&(p("NameSpace")="IRISOPS")&&(p("MatchRoles")=":IrisOps_GuardStorage")&&(p("AutheEnabled")=32),!']).includes('OWN=1'));
else change([`set p("NameSpace")="IRISOPS",p("DispatchClass")="IrisOps.Guard.CombinedApi",p("Enabled")=1,p("AutheEnabled")=32,p("UseCookies")=2,p("CookiePath")="${app}/",p("Timeout")=600,p("SessionScope")=2,p("UserCookieScope")=2,p("MatchRoles")=":IrisOps_GuardStorage"`,`set sc=##class(Security.Applications).Create("${app}",.p)`,check]);
try{
 owned=true;
 change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned combined guard fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned combined guard operator","${rights}","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned combined guard operator","USER","","",0,1)`,check,`set p("EditResource")="${initialWallet.EditResource}",p("UseResource")="${initialWallet.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("IsNameSpaceDefault")=0,p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="${description}",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${target}",.p)`,check]);
 change(['set p("DispatchClass")="IrisOps.Guard.CountingAdmin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);fault();
 assert.equal((await request('/session','GET',undefined,{})).status,401);await session();await observer();initialWeb=await native('webapp');assert.equal(initialWeb.Enabled,false);await assertOriginal();
 let capabilities=(await request('/capabilities')).body;assert.equal(capabilities.wallet.available,true);assert.equal(capabilities.webapp.available,true);
 assert.equal((await request('/wallet/state?name='+wallet)).status,200);assert.equal((await request('/webapp/state')).status,200);
 pass('one scoped native session reads both fixed targets and reports two native permissions');
 let w=await channel('wallet'),a=await channel('webapp'),n=counter();
 for(const [kind,c] of [['wallet',w],['webapp',a]])assert.equal((await request('/'+kind+'/previews','POST',intent(kind,c))).status,403);
 for(const [kind,c] of [['wallet',a],['webapp',w]])for(const method of ['POST','DELETE'])assert.equal((await request('/'+kind+'/channels/'+c+'/write-access',method,method==='POST'?{confirmation:'ENABLE WRITES'}:{})).status,404);
 for(const kind of ['other','Execution','%25Api.Admin'])assert.equal((await request('/'+kind+'/channels','POST',{})).status,404);
 assert.equal((await request('/wallet/state?name=Other')).status,400);assert.deepEqual(counter(),n);pass('readonly and cross-kind channel actions reject with zero native PUTs');
 await enable('wallet',w);assert.equal((await request('/webapp/previews','POST',intent('webapp',a))).status,403);await enable('webapp',a);
 assert.equal((await request('/wallet/previews','POST',intent('wallet',a))).status,403);assert.equal((await request('/webapp/previews','POST',intent('webapp',w))).status,403);
 const originals={};
 for(const [kind,c,other] of [['wallet',w,'webapp'],['webapp',a,'wallet']]){
  const p=await preview(kind,c);n=counter();
  assert.equal((await request('/'+other+'/previews/'+p.id,'DELETE',{})).status,404);
  const wrong=await request('/'+other+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey});assert.ok([400,404].includes(wrong.status));assert.deepEqual(counter(),n);
  assert.equal((await execute(kind,p)).state,'VERIFIED');const after=counter();assert.equal(after[kind==='wallet'?0:1],n[kind==='wallet'?0:1]+1);assert.equal(after[kind==='wallet'?1:0],n[kind==='wallet'?1:0]);
  for(const action of ['inspect','reconcile'])assert.equal((await request('/'+other+'/operations/'+p.id+'/'+action,'POST',{recoveryKey:p.recoveryKey})).status,404);
  assert.equal((await request('/'+other+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey})).status,404);
  assert.equal((await execute(kind,p)).state,'VERIFIED');assert.equal((await recover(kind,p,true)).receipt.state,'VERIFIED');assert.deepEqual(counter(),after);originals[kind]=p;
 }
 pass('cross-kind cancel, execute, replay and recovery denied; each correct action dispatches exactly once');
 assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});
 for(const [kind,c] of [['wallet',w],['webapp',a]])assert.equal((await execute(kind,await preview(kind,c,true))).state,'VERIFIED');await assertOriginal();pass('both reverse guarded mutations restore original policy and full native web configuration');
 for(const [kind,c] of [['wallet',w],['webapp',a]]){
  const p=await preview(kind,c);fault(kind);n=counter();assert.equal((await execute(kind,p)).state,'UNKNOWN');fault();
  const r=await recover(kind,p,true);assert.equal(r.receipt.state,'UNKNOWN');assert.equal(r.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(counter()[kind==='wallet'?0:1],n[kind==='wallet'?0:1]+1);restore();
 }
 pass('both failed readbacks preserve UNKNOWN and reconciliation does not repeat either PUT');
 for(const [only,perms,denied] of [['wallet',walletRights,'webapp'],['webapp',webRights,'wallet']]){
  setRole(perms);await session();const caps=(await request('/capabilities')).body;assert.equal(caps[only].available,true);assert.equal(caps[denied].available,false);
  const allowed=await channel(only),blocked=await channel(denied);await enable(only,allowed);n=counter();assert.equal((await request('/'+denied+'/channels/'+blocked+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,403);
  assert.equal((await request('/'+denied+'/previews','POST',intent(denied,blocked))).status,403);assert.deepEqual(counter(),n);
 }
 setRole();await session();w=await channel('wallet');a=await channel('webapp');await enable('wallet',w);await enable('webapp',a);
 pass('limited native roles enable only their own kind; direct HTTP cannot bypass missing permission');
 const wp=await preview('wallet',w),ap=await preview('webapp',a);n=counter();setRole(walletRights);
 assert.equal((await request('/capabilities')).body.webapp.available,false);assert.equal((await execute('webapp',ap)).state,'BLOCKED');assert.deepEqual(counter(),n);assert.equal((await execute('wallet',wp)).state,'VERIFIED');setRole();restore();
 pass('permission revoked after approval blocks webapp, without revoking the independent wallet authority');
 await session();w=await channel('wallet');a=await channel('webapp');await enable('wallet',w);await enable('webapp',a);const pending=[await preview('wallet',w),await preview('webapp',a)];n=counter();
 assert.equal((await request('/logout','POST',{})).status,200);for(const [i,kind] of ['wallet','webapp'].entries())assert.equal((await request('/'+kind+'/previews/'+pending[i].id+'/execute','POST',{confirmation:pending[i].confirmation,recoveryKey:pending[i].recoveryKey})).status,401);assert.deepEqual(counter(),n);
 await session();for(const [kind,p] of Object.entries(originals))assert.equal((await recover(kind,p)).receipt.state,'VERIFIED');assert.deepEqual(counter(),n);pass('one logout invalidates both approvals; reconnect recovers historical receipts read-only');
 if(process.env.IRISOPS_COMBINED_FAST!=='1'){
  await session();w=await channel('wallet');a=await channel('webapp');await enable('wallet',w);await enable('webapp',a);n=counter();console.log('Waiting for actual shared authorization expiry');await new Promise(r=>setTimeout(r,61000));
  for(const kind of ['wallet','webapp'])assert.equal((await request('/'+kind+'/previews','POST',intent(kind,kind==='wallet'?w:a))).status,401);assert.deepEqual(counter(),n);pass('actual 60-second shared authorization expiry rejects both operations with zero PUTs');
 }
 await session();await observer();
 if(process.env.IRISOPS_COMBINED_UI==='1'){const {runCombinedUi}=await import('./verify-combined-ui.mjs');await runCombinedUi({run,container,origin,user,password,wallet,target,initialWallet,initialWeb,proposed,native,counter,restore,setRole,walletRights,change,check,pass,session,observer,fault});}
 fault();setRole();restore();await observer();await assertOriginal();restored=true;
 const after=receiptSnapshot();for(const [k,hash] of historical)assert.equal(after.get(k),hash);pass('both fixtures restored and all pre-existing durable receipt hashes preserved');complete=true;
}finally{
 fault();change(['set p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 if(owned){
  setRole();restore();
  change([`set sc=##class(Security.Applications).Delete("${target}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();cleanupComplete=true;pass('only seven owned disposable fixtures removed; receipts and original native dispatcher preserved');
 }
 const logs=run(['logs','--since',started,container]);assert.ok(!logs.includes(password)&&(!token||!logs.includes(token))&&[...proofs.values()].every(k=>!logs.includes(k)));pass('known random credentials, native token and recovery proofs absent from container logs');
 await writeFile(new URL('combined-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,complete,restored,cleanupComplete,releaseReady:false,checks},null,2)+'\n');
}
