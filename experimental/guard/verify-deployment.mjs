// Pinned laboratory only. Own fixture accounts use random in-memory passwords.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {preview as checkedPreview,receipt as checkedReceipt,recovery as checkedRecovery} from './ui/contracts.js';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const container='iris-ops-guard-dev-20260925',containerId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52801',app='/api/irisops-managed-guard';
const user='IrisOps_GuardDeployUser',role='IrisOps_GuardDeployRole',wallet='IrisOps_GuardProbeWallet',target='/csp/irisops-guard-testweb';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const rights='%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,'+resources.slice(0,2).map(r=>r+':RW').join(',')+','+resources[2]+':U';
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'},proposed={...initial,UseResource:resources[1]+':READ'};
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const started=new Date().toISOString(),checks=[],proofs=new Set();let controls,token,owned=false,complete=false,restored=false,suspended=false,initialWeb;
const check='if sc\'=1 write "FIXTURE_FAILED",! halt';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Pinned laboratory command failed; raw output suppressed');}}
function terminal(lines,ns='IRISOPS'){const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('FIXTURE_FAILED')&&!/Detected \d+ errors/.test(out),'IRIS command failed; raw output suppressed');return out;}
function change(lines,ns='%SYS'){assert.ok(terminal([...lines,'write "DONE",!'],ns).includes('DONE'));}
function call(code){const out=terminal(['try { set value='+code+' write "RESULT=",value.%ToJSON(),! } catch e { write "ERROR=",e.Name,! }']);const error=out.match(/ERROR=([a-zA-Z0-9_]+)/);if(error)return {error:error[1]};const m=out.match(/RESULT=(\{.*\})/);assert.ok(m,'No deployment result');return JSON.parse(m[1]);}
function plan(){const p=call('##class(IrisOps.Guard.Deployment).Plan()');assert.ok(!p.error,'Deployment plan: '+p.error);return p;}
function apply(mode,build='managed-lab-a',expected=plan().fingerprint,cls='Deployment'){return call(`##class(IrisOps.Guard.${cls}).Apply("${expected}","${mode}","${build}")`);}
function transition(mode,build='managed-lab-a'){const p=apply(mode,build);assert.ok(!p.error,'Deployment transition: '+p.error);assert.equal(p.mode,mode);return p;}
function pass(s){checks.push(s);console.log('PASS '+s);}
function setRole(value=rights){change([`set p("Resources")="${value}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);}
function appSnapshot(name){const out=terminal([`set sc=##class(Security.Applications).Get("${name}",.p)`,check,'set key="",obj={}','for { set key=$order(p(key)) quit:key=""  do obj.%Set(key,p(key)) }','write "HASH=",$system.Encryption.ToHex($system.Encryption.SHAHash(256,obj.%ToJSON())),!'],'%SYS');return out.match(/HASH=([A-F0-9]{64})/)[1];}
function receiptSnapshot(){const out=terminal(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set id=q.%Get("OperationId"),r=##class(IrisOps.Guard.Receipt).%OpenId(id) write "ROW=",id,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,r.Public().%ToJSON())),! }']);return new Map([...out.matchAll(/ROW=([a-f0-9]{32})\|([A-Fa-f0-9]{64})/g)].map(m=>[m[1],m[2]]));}
function counter(){return +terminal(['write "COUNT=",$get(^IrisOpsGuardBoot("observedPuts"),0)+$get(^IrisOpsGuardBoot("webPuts"),0),!']).match(/COUNT=(\d+)/)[1];}
function absent(){assert.ok(terminal([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${target}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`],'%SYS').includes('ABSENT=0000000'));}
function restore(){change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0`,`set sc=##class(Security.Applications).Modify("${target}",.p)`,check]);}
function fault(kind=''){change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback"),^IrisOpsGuardBoot("webFault"),^IrisOpsGuardBoot("webDenyReadback"),^IrisOpsGuardBoot("deploymentFault")',...(kind?[`set ^IrisOpsGuardBoot("${kind==='wallet'?'walletFault':'webFault'}")="readback"`]:[])],'IRISOPS');}
async function request(path,method='GET',body,h=controls){const r=await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)}),text=await r.text();assert.ok(!text.includes(password)&&!text.includes(basic)&&(!token||!text.includes(token)));let data;try{data=JSON.parse(text);}catch{data=null;}if(path.endsWith('/previews')&&r.status===200)proofs.add(data.recoveryKey);else for(const k of proofs)assert.ok(!text.includes(k));return {status:r.status,body:data,headers:r.headers};}
async function session(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200,'Managed session: '+r.body?.error);assert.equal(r.body.actor,user);assert.ok(r.headers.getSetCookie().some(c=>c.toLowerCase().includes('path='+app+'/')&&/HttpOnly/i.test(c)));controls={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};const c=await request('/connect','POST',{user,password});assert.equal(c.status,200,'Managed connect: '+c.body?.error);}
async function observer(){const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(r.status,200);const b=await r.json();token=(b.result||b).access_token;}
async function native(kind){const r=await fetch(origin+'/api/admin/v2/'+(kind==='wallet'?'wallet/collection?name='+wallet:'web-app?name='+encodeURIComponent(target)),{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return (await r.json()).result;}
async function channel(kind,enabled=true){const r=await request('/'+kind+'/channels','POST',{});assert.equal(r.status,200);if(enabled)assert.equal((await request('/'+kind+'/channels/'+r.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);return r.body.channel;}
async function preview(kind,c){const body=kind==='wallet'?{channel:c,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c,action:'webapp.availability.update',name:target,Enabled:'true'};const r=await request('/'+kind+'/previews','POST',body);assert.equal(r.status,200,'Managed preview: '+r.body?.error);return checkedPreview(r.body,kind);}
async function execute(kind,p){const r=await request('/'+kind+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey});assert.ok([200,409].includes(r.status),'Managed execute: '+r.status+' '+r.body?.error);return checkedReceipt(r.body,{id:p.id,actor:user,kind,approved:p,allowIncomplete:true});}
async function recover(kind,p){const r=await request('/'+kind+'/operations/'+p.id+'/reconcile','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200,'Managed recovery: '+r.body?.error);return checkedRecovery(r.body,{id:p.id,actor:user,kind,record:true});}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),containerId);absent();
const originals=new Map(['/api/admin','/api/irisops-guard','/api/irisops-http-guard','/api/irisops-web-guard','/api/irisops-combined-guard'].map(name=>[name,appSnapshot(name)]));
const historical=receiptSnapshot();assert.ok(historical.size>0);
for(const cls of ['Deployment','ManagedApi','ManagedNextApi','TestDeployment']){run(['cp',fileURLToPath(new URL('IrisOps.Guard.'+cls+'.cls',import.meta.url)),container+':/tmp/IrisOps.Guard.'+cls+'.cls']);change(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.'+cls+'.cls","ck")',check],'IRISOPS');}
let first=plan();assert.ok(!first.installed||first.mode==='SUSPENDED','Existing managed application must be suspended before testing');
try{
 // New registration requires readonly. Repeat runs preserve own deployment history.
 if(!first.installed){assert.equal(apply('ACTIVE','managed-lab-a',first.fingerprint).error,'initial_readonly_required');assert.equal(plan().installed,false);}
 let readonly=transition('READ_ONLY');assert.equal(apply('READ_ONLY','managed-lab-a',readonly.fingerprint).generation,readonly.generation);
 assert.equal(apply('ACTIVE','managed-lab-a','0'.repeat(64)).error,'stale_deployment_plan');assert.equal(plan().mode,'READ_ONLY');
 pass('readonly registration, same-state idempotence and stale-plan refusal verified');
 const savedHash=appSnapshot(app);change([`set p("Description")="Owned installer drift test"`,`set sc=##class(Security.Applications).Modify("${app}",.p)`,check]);assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').error,'native_configuration_drift');assert.equal(apply('ACTIVE','managed-lab-a',readonly.fingerprint).error,'native_configuration_drift');change([`set p("Description")="irisops-managed-lab-v1"`,`set sc=##class(Security.Applications).Modify("${app}",.p)`,check]);assert.equal(appSnapshot(app),savedHash);pass('native configuration drift refuses overwrite; restored exact prior native properties');
 owned=true;change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned deployment fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned deployment operator","${rights}","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned deployment operator","USER","","",0,1)`,check,`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("IsNameSpaceDefault")=0,p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="Owned disposable guard webapp fixture",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${target}",.p)`,check]);
 change(['set p("DispatchClass")="IrisOps.Guard.CountingAdmin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);fault();await observer();initialWeb=await native('webapp');await session();
 const deniedAdmin=call(`##class(IrisOps.Guard.TestDeployment).CheckInstallerDenied("${user}","${password}")`);
 assert.deepEqual(deniedAdmin,{authenticated:true,correctActor:true,manage:false,denied:true});assert.equal(plan().mode,'READ_ONLY');
 for(const path of ['/install','/deployment','/Deployment.Apply'])assert.equal((await request(path,'POST',{})).status,path==='/deployment'?405:404);
 pass('native operation permissions do not grant installer authority; no HTTP deployment-write route exists');
 let n=counter(),w=await channel('wallet',false),a=await channel('webapp',false);
 for(const [kind,c] of [['wallet',w],['webapp',a]]){
  assert.equal((await request('/'+kind+'/channels/'+c+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,403);
  assert.equal((await request('/'+kind+'/previews/'+'a'.repeat(32)+'/execute','POST',{confirmation:'APPLY aaaaaaaa',recoveryKey:'b'.repeat(64)})).status,403);
 }
 assert.deepEqual(counter(),n);pass('native login succeeds in readonly mode; direct enable/execute cannot bypass deployment gate');
 const old=controls;transition('ACTIVE');assert.equal((await request('/capabilities','GET',undefined,old)).status,401);await session();w=await channel('wallet');a=await channel('webapp');
 const receipts={};for(const [kind,c] of [['wallet',w],['webapp',a]]){const p=await preview(kind,c);n=counter();assert.equal((await execute(kind,p)).state,'VERIFIED');assert.equal(counter(),n+1);receipts[kind]=p;}
 assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});restore();pass('explicit activation invalidates old session; both guarded mutations verify on real IRIS');
 const wp=await preview('wallet',w),ap=await preview('webapp',a);n=counter();transition('READ_ONLY');
 for(const [kind,p] of [['wallet',wp],['webapp',ap]])assert.equal((await request('/'+kind+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey})).status,401);
 await session();for(const [kind,p] of Object.entries(receipts))assert.equal((await recover(kind,p)).receipt.state,'VERIFIED');assert.equal(counter(),n);pass('return to readonly invalidates both approvals while receipt recovery remains available without PUT');
 assert.equal(apply('READ_ONLY','managed-lab-b').error,'suspend_before_replacement');transition('SUSPENDED');n=counter();const stopped=await request('/session','GET',undefined,{Authorization:basic});assert.notEqual(stopped.status,200);
 transition('READ_ONLY','managed-lab-b');await session();for(const [kind,p] of Object.entries(receipts))await recover(kind,p);assert.equal(counter(),n);
 transition('ACTIVE','managed-lab-b');await session();w=await channel('wallet');const concurrent=await preview('wallet',w),fence=plan().fingerprint;change(['set ^IrisOpsGuardBoot("auditFault")="delay_reservation"'],'IRISOPS');const pending=execute('wallet',concurrent);
 let observed=false;for(let i=0;i<30;i++){const s=terminal([`set r=##class(IrisOps.Guard.Receipt).%OpenId("${concurrent.id}") write "WAIT=",$select($isobject(r):r.State,1:""),!`]);if(s.includes('WAIT=DISPATCHING')){observed=true;break;}await new Promise(r=>setTimeout(r,25));}
 assert.ok(observed,'Actual dispatch reservation must be observed');assert.equal(apply('SUSPENDED','managed-lab-b',fence).error,'deployment_busy');assert.equal((await pending).state,'VERIFIED');change(['kill ^IrisOpsGuardBoot("auditFault")'],'IRISOPS');restore();
 pass('actual guarded dispatch holds deployment lock; a concurrent suspension fails busy without interrupting the operation');
 transition('SUSPENDED','managed-lab-b');transition('READ_ONLY','managed-lab-a');await session();await recover('wallet',receipts.wallet);pass('real dispatcher replacement and rollback require suspension and retain readonly recovery history');
 transition('ACTIVE');await session();w=await channel('wallet');let p=await preview('wallet',w);fault('wallet');n=counter();assert.equal((await execute('wallet',p)).state,'UNKNOWN');fault();transition('SUSPENDED');transition('READ_ONLY');await session();const observation=await recover('wallet',p);assert.equal(observation.receipt.state,'UNKNOWN');assert.equal(observation.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(counter(),n+1);restore();pass('uncertain native result survives disable/reenable and recovery never redispatches');
 // Actual terminal process exit between disabling native route and activation.
 transition('SUSPENDED');change(['set ^IrisOpsGuardBoot("deploymentFault")="crash"'],'IRISOPS');let planned=plan();terminal([`set result=##class(IrisOps.Guard.TestDeployment).Apply("${planned.fingerprint}","READ_ONLY","managed-lab-a")`]);fault();
 const interrupted=call('##class(IrisOps.Guard.Deployment).State()');assert.equal(interrupted.mode,'TRANSITION');assert.notEqual((await request('/session','GET',undefined,{Authorization:basic})).status,200);
 const fingerprint=terminal(['write "PRINT=",##class(IrisOps.Guard.Deployment).Fingerprint(),!']).match(/PRINT=([A-F0-9]{64})/)[1];const repaired=call(`##class(IrisOps.Guard.Deployment).RecoverInterrupted("${fingerprint}")`);assert.ok(!repaired.error,'Interrupted recovery: '+repaired.error);assert.equal(repaired.mode,'SUSPENDED');pass('actual installer process exit leaves service blocked; explicit recovery only suspends and preserves data');
 planned=plan();const failure=apply('READ_ONLY','managed-lab-a',planned.fingerprint,'TestDeployment');assert.equal(failure.error,'synthetic_activation_failure');assert.equal(plan().mode,'SUSPENDED');assert.notEqual((await request('/session','GET',undefined,{Authorization:basic})).status,200);pass('activation exception fails closed instead of restoring previous write-enabled mode');
 transition('READ_ONLY');await session();await observer();for(const [kind,p] of Object.entries(receipts))await recover(kind,p);restore();
 const beforeRestart=plan(),oldControls=controls;run(['restart','--time','20',container]);
 let ready=false;for(let i=0;i<40;i++){try{if((await request('/session','GET',undefined,{})).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Restarted managed application ready');
 assert.equal(plan().mode,'READ_ONLY');assert.equal(plan().generation,beforeRestart.generation);assert.notEqual((await request('/capabilities','GET',undefined,oldControls)).status,200);await session();await observer();n=counter();for(const [kind,p] of Object.entries(receipts))await recover(kind,p);assert.equal(counter(),n);
 pass('actual IRIS restart preserves deployment/receipts but invalidates old upstream authorization; fresh recovery sends no PUT');
 if(process.env.IRISOPS_DEPLOYMENT_UI==='1'){
  const {runCombinedUi}=await import('./verify-combined-ui.mjs');
  await runCombinedUi({run,container,origin,user,password,wallet,target,initialWallet:initial,initialWeb,proposed,native,counter:()=>{const v=terminal(['write "COUNTS=",$get(^IrisOpsGuardBoot("observedPuts"),0),"|",$get(^IrisOpsGuardBoot("webPuts"),0),!']).match(/COUNTS=(\d+)\|(\d+)/);return [+v[1],+v[2]];},restore,setRole,walletRights:'%Admin_Wallet:U,%DB_IRISOPS:R,'+resources.slice(0,2).map(r=>r+':RW').join(','),change,check,pass,session,observer,fault,transition,profile:'managed'});
 }
 assert.equal((await native('wallet')).UseResource.toUpperCase(),initial.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);restored=true;
 const after=receiptSnapshot();for(const [id,hash] of historical)assert.equal(after.get(id),hash);pass('all historical receipt hashes and full original native fixture state preserved');complete=true;
}finally{
 fault();change(['kill ^IrisOpsGuardBoot("auditFault")'],'IRISOPS');const current=call('##class(IrisOps.Guard.Deployment).Plan()');if(!current.error&&current.installed){const r=apply('SUSPENDED',current.build,current.fingerprint);assert.ok(!r.error);suspended=r.mode==='SUSPENDED';}
 change(['set p("DispatchClass")="%Api.Admin"','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
 if(owned){restore();change([`set sc=##class(Security.Applications).Delete("${target}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();}
 for(const [name,hash] of originals)assert.equal(appSnapshot(name),hash);pass('old native/prototype applications unchanged; only owned fixtures removed; managed deployment left suspended');
 const logs=run(['logs','--since',started,container]);assert.ok(!logs.includes(password)&&(!token||!logs.includes(token))&&[...proofs].every(k=>!logs.includes(k)));pass('known random password, native token and recovery proofs absent from container logs');
 await writeFile(new URL('deployment-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,complete,restored,suspended,productionReady:false,checks},null,2)+'\n');
}
