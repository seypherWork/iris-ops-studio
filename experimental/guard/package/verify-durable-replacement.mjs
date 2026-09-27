// Isolated same-image replacement. Never remove a container, volume or receipt.
// One IRIS writer per volume; stop and preserve everything on any failure.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve,join} from 'node:path';
import {sha256} from './build.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const suffix=process.argv[2];assert.match(suffix||'',/^[f-z]$/);
const root=resolve('..','irisops-guard-clean-package-20260926-e');
const image='sha256:d657acb6445cae0a7b96f917dcbc7fdcf4007d2a9d43b22cfbe5a654660e75a4';
const volume='irisops-guard-durable-20260926-'+suffix;
const names=['a','b'].map(n=>'iris-ops-guard-durable-20260926-'+suffix+'-'+n);
const previous='iris-ops-guard-dev-20260925',previousId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const reference='iris-ops-guard-clean-20260926-e',referenceId='08a583220056cf85c3dab431e370488285989ecdf6e281ebab7c3e205797d30d';
const origin='http://127.0.0.1:52803',app='/api/irisops-managed-guard';
const user='IrisOps_GuardDurableUser',role='IrisOps_GuardDurableRole';
const wallet='IrisOps_GuardProbeWallet',web='/csp/irisops-guard-testweb';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'};
const proposed={...initial,UseResource:resources[1]+':READ'};
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const secrets=new Set([password,basic]),checks=[],ids=[],receipts=[];
const started=new Date().toISOString();let target=names[0],controls,token,owned=false,complete=false,restored=false,cleanup=false,oldState;
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Isolated command failed; raw output suppressed');}}
function term(lines,ns='%SYS',container=target){const out=run(['exec','-i',container,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'IRIS step failed; raw output suppressed');return out;}
const check='if $system.Status.IsError(sc) write "STEP_FAILED",! halt';
function change(lines,ns='%SYS'){assert.ok(term([...lines,'write "DONE",!'],ns).includes('DONE'));}
function call(code,ns='%SYS'){const out=term(['try { set result='+code+' write "RESULT=",result.%ToJSON(),! } catch e { write "ERROR=",e.Name,! }'],ns);const err=out.match(/ERROR=([A-Za-z0-9_]+)/);assert.ok(!err,'Native call rejected: '+err?.[1]);const m=out.match(/RESULT=(\{.*\})/);assert.ok(m);return JSON.parse(m[1]);}
const plan=()=>call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")');
function transition(mode){const p=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');const r=call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${mode}","managed-lab-a")`,'IRISOPS');assert.equal(r.mode,mode);return r;}
function pass(s){checks.push(s);console.log('PASS '+s);}
const snapshot=()=>term(['write "OLD=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',previous).split(/\r?\n/).filter(s=>/^(OLD|COUNT)=/.test(s));
function secretCheck(text){assert.ok([...secrets].every(s=>!text.includes(s)),'Sensitive fixture value found; output suppressed');}
async function request(path,method='GET',body,h=controls){const r=await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});const text=await r.text();secretCheck(text);let data;try{data=JSON.parse(text);}catch{data=null;}if(path.endsWith('/previews')&&r.status===200)secrets.add(data.recoveryKey);return {status:r.status,body:data,headers:r.headers};}
async function login(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);assert.equal(r.body.actor,user);const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');secrets.add(cookie);secrets.add(r.body.csrf);controls={Cookie:cookie,Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};assert.equal((await request('/connect','POST',{user,password})).status,200);}
async function observer(){const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(r.status,200);const d=await r.json();token=(d.result||d).access_token;secrets.add(token);}
async function native(kind){const path=kind==='wallet'?'wallet/collection?name='+wallet:'web-app?name='+encodeURIComponent(web);const r=await fetch(origin+'/api/admin/v2/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const text=await r.text();secretCheck(text);return JSON.parse(text).result;}
function absent(){assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${web}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`]).includes('ABSENT=0000000'));}
function restore(){change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0`,`set sc=##class(Security.Applications).Modify("${web}",.p)`,check]);}
async function ready(){let ok=false;for(let i=0;i<60;i++){try{if(term(['write "IRIS_READY",!']).includes('IRIS_READY')){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ok,'Container did not reach native terminal readiness');}
function stop(name){run(['stop','--time','30',name]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',name]).trim(),'false|0','Clean shutdown required; no replacement after failed stop');}
function receiptSnapshot(){return term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set r=##class(IrisOps.Guard.Receipt).%OpenId(q.%Get("OperationId")),p=r.Public() write "ROW=",r.OperationId,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,p.%ToJSON()_r.RecoveryHash_r.Binding)),! }'],'IRISOPS').split(/\r?\n/).filter(s=>s.startsWith('ROW='));}
async function launch(name){for(const n of names.filter(n=>ids.some(i=>i.name===n)))assert.equal(run(['inspect','--format','{{.State.Running}}',n]).trim(),'false');target=name;const id=run(['run','-d','--name',name,'--label','irisops.durable-lab=20260926','--mount',`type=volume,source=${volume},target=/durable`,'-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52803:52773',image]).trim();assert.match(id,/^[a-f0-9]{64}$/);ids.push({name,id});const info=JSON.parse(run(['inspect','--format','{{json .Mounts}}',name]));assert.equal(info.length,1);assert.equal(info[0].Name,volume);assert.equal(info[0].Destination,'/durable');assert.equal(info[0].RW,true);await ready();assert.ok(term(['write "DURABLE=",$system.Container.IsDeployed(),!']).includes('DURABLE=1'));}
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));assert.equal(manifest.contentSha256,'fb369cd54e365a1069bb2946b8b86f395a3a83bc5770e65b7cf37716690fc2cf');assert.equal(manifest.contentSha256,sha256(JSON.stringify(manifest.entries)));
for(const e of manifest.entries)assert.equal(sha256(await readFile(join(root,e.path))),e.sha256);
assert.equal(run(['image','inspect','--format','{{.Id}}',image]).trim(),image);
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',previous]).trim(),previousId+'|true');
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',reference]).trim(),referenceId+'|false');oldState=snapshot();
const existing=run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/);assert.ok(names.every(n=>!existing.includes(n)),'Names already exist: retained evidence must not be reused');assert.ok(!run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).includes(volume));
await new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(52803,'127.0.0.1',()=>s.close(res));});
try{
 assert.equal(run(['volume','create','--label','irisops.durable-lab=20260926',volume]).trim(),volume);
 await launch(names[0]);assert.ok(term(['write "CLEAN=",##class(Config.Namespaces).Exists("IRISOPS"),!']).includes('CLEAN=0'));
 for(const e of manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',target,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
 change(['set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")',check]);let p=plan();assert.equal(p.installed,false);assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Install("${p.fingerprint}","${origin}")`).installed,true);
 pass('native durable %SYS and both private stores installed on a new verified volume using exact reference image');
 absent();owned=true;change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned durable test fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned durable test operator","%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,${resources[0]}:RW,${resources[1]}:RW,${resources[2]}:U","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned durable installation user","USER","","",0,1)`,check,`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="Owned durable fixture",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${web}",.p)`,check]);
 transition('ACTIVE');await observer();const initialWeb=await native('webapp');await login();
 for(const kind of ['wallet','webapp']){const c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const body=kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'};p=await request('/'+kind+'/previews','POST',body);assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});}
 assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});restore();assert.equal((await native('wallet')).UseResource.toUpperCase(),initial.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);
 pass('two genuine verified operations independently read back and reverted before replacement');
 // Pending preview and live grants are also invalidated, not only old bearer custody.
 const c=await request('/wallet/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const pending=await request('/wallet/previews','POST',{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed});assert.equal(pending.status,200);
 const before=receiptSnapshot(),deployment=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS'),prior=controls;assert.equal(before.length,2);
 stop(names[0]);await launch(names[1]);assert.notEqual(ids[0].id,ids[1].id);assert.equal(plan().action,'NO_CHANGE');assert.deepEqual(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS'),deployment);assert.deepEqual(receiptSnapshot(),before);
 pass('different container reuses durable namespace, private mappings, deployment generation and complete receipt rows without reinstallation');
 assert.ok(term(['write "BOOT_EMPTY=",($data(^IrisOpsGuardBoot("epoch"))=0),!'],'IRISOPS').includes('BOOT_EMPTY=1'));
 assert.notEqual((await request('/capabilities','GET',undefined,prior)).status,200);await login();await observer();assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,404);
 const rejected=await request('/wallet/previews/'+pending.body.id+'/execute','POST',{confirmation:pending.body.confirmation,recoveryKey:pending.body.recoveryKey});assert.equal(rejected.status,400);assert.deepEqual(rejected.body,{error:'invalid_preview'});
 for(const p of receipts){const r=await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.receipt.dispatchCount,1);}
 assert.deepEqual(receiptSnapshot(),before);assert.equal((await native('wallet')).UseResource.toUpperCase(),initial.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);restored=true;
 pass('old authorization, grants and pending preview rejected; fresh native login recovers original receipts with unchanged count and native state');
 if(process.env.IRISOPS_DURABLE_UI==='1'){const {runCleanUi}=await import('./verify-clean-ui.mjs');await runCleanUi({origin,user,password,transition,pass,suffix:'durable-'+suffix,keys:secrets});}
 restore();change([`set sc=##class(Security.Applications).Delete("${web}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();owned=false;cleanup=true;transition('SUSPENDED');assert.deepEqual(receiptSnapshot(),before);complete=true;
 pass('all seven owned fixtures removed; durable service suspended with original receipts retained');
}finally{
 // A failed test retains partial resources for inspection instead of destructive repair.
 for(const {name} of ids){if(run(['inspect','--format','{{.State.Running}}',name]).trim()==='true'){target=name;if(owned){try{restore();restored=true;}catch{}}try{transition('SUSPENDED');}catch{}stop(name);}secretCheck(run(['logs','--since',started,name]));}
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',previous]).trim(),previousId+'|true');assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',reference]).trim(),referenceId+'|false');assert.deepEqual(snapshot(),oldState);
 await writeFile(new URL('durable-replacement-evidence-'+suffix+'.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),image,volume,containers:ids,packageSha256:manifest.contentSha256,complete,restored,fixturesRemoved:cleanup,previousLabsPreserved:true,sameImageOnly:true,backupRestoreTested:false,productionReady:false,checks},null,2)+'\n',{flag:'wx'});
}
