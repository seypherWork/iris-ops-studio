// Creates a NEW isolated container. Never deletes containers, volumes or artifacts.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,basename,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {request as httpRequest} from 'node:http';
import {sha256} from './build.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const artifact=resolve(process.argv[2]),suffix=basename(artifact).match(/^irisops-guard-clean-package-20260926-([a-z])$/)?.[1];assert.ok(suffix);
const container='iris-ops-guard-clean-20260926-'+suffix,image='iris-ops-guard:clean-install-lab-20260926-'+suffix;
const previous='iris-ops-guard-dev-20260925',previousId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52802',app='/api/irisops-managed-guard';
const user='IrisOps_GuardCleanUser',role='IrisOps_GuardCleanRole',wallet='IrisOps_GuardProbeWallet',web='/csp/irisops-guard-testweb';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'},proposed={...initial,UseResource:resources[1]+':READ'};
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const checks=[],keys=new Set(),started=new Date().toISOString();let controls,token,owned=false,complete=false,restored=false,containerId='',initialWeb;
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Isolated command failed; raw output suppressed');}}
function term(lines,ns='%SYS',target=container){const out=run(['exec','-i',target,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'IRIS step failed; raw output suppressed');return out;}
const check='if $system.Status.IsError(sc) write "STEP_FAILED",! halt';
function change(lines,ns='%SYS'){assert.ok(term([...lines,'write "DONE",!'],ns).includes('DONE'));}
function call(code,ns='%SYS'){const out=term(['try { set result='+code+' write "RESULT=",result.%ToJSON(),! } catch e { write "ERROR=",e.Name,! }'],ns);const err=out.match(/ERROR=([A-Za-z0-9_]+)/);if(err)return {error:err[1]};const m=out.match(/RESULT=(\{.*\})/);assert.ok(m,'No installer result');return JSON.parse(m[1]);}
function plan(){const p=call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")');assert.ok(!p.error,'Plan: '+p.error);return p;}
function transition(mode){const p=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');assert.ok(!p.error);const r=call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${mode}","managed-lab-a")`,'IRISOPS');assert.equal(r.mode,mode);return r;}
function pass(s){checks.push(s);console.log('PASS '+s);}
// Node fetch discards a caller-provided Host; use a fixed-destination HTTP socket
// for those negative controls so the intended header is actually transmitted.
function forcedHost(path,method,body,headers){return new Promise((resolve,reject)=>{const q=httpRequest({hostname:'127.0.0.1',port:52802,path:app+'/v1'+path,method,headers,timeout:15000},r=>{let text='';r.setEncoding('utf8');r.on('data',s=>{text+=s;});r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,text:async()=>text}));});q.on('error',reject);q.on('timeout',()=>q.destroy(Error('Fixed test socket timeout')));q.end(body===undefined?undefined:JSON.stringify(body));});}
async function request(path,method='GET',body,h=controls){const r=h?.Host?await forcedHost(path,method,body,h):await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});const text=await r.text();assert.ok(!text.includes(password)&&!text.includes(basic)&&(!token||!text.includes(token)));let data;try{data=JSON.parse(text);}catch{data=null;}if(path.endsWith('/previews')&&r.status===200)keys.add(data.recoveryKey);else for(const key of keys)assert.ok(!text.includes(key));return {status:r.status,body:data,headers:r.headers};}
async function login(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);assert.equal(r.body.actor,user);controls={Cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};assert.equal((await request('/connect','POST',{user,password})).status,200);}
async function observer(){const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(r.status,200);const d=await r.json();token=(d.result||d).access_token;}
async function native(kind){const path=kind==='wallet'?'wallet/collection?name='+wallet:'web-app?name='+encodeURIComponent(web);const r=await fetch(origin+'/api/admin/v2/'+path,{headers:{Authorization:'Bearer '+token}});assert.equal(r.status,200);return (await r.json()).result;}
function absent(){assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${web}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`]).includes('ABSENT=0000000'));}
function restore(){change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0`,`set sc=##class(Security.Applications).Modify("${web}",.p)`,check]);}
const manifest=JSON.parse(await readFile(join(artifact,'manifest.json'),'utf8'));assert.equal(manifest.contentSha256,sha256(JSON.stringify(manifest.entries)));
for(const e of manifest.entries)assert.equal(sha256(await readFile(join(artifact,e.path))),e.sha256);
assert.equal(run(['inspect','--format','{{.Id}}',previous]).trim(),previousId);
const oldState=term(['write "OLD=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',previous).split(/\r?\n/).filter(s=>/^(OLD|COUNT)=/.test(s));
const resume=process.env.IRISOPS_CLEAN_RESUME;
if(resume){assert.equal(run(['inspect','--format','{{.Id}}|{{index .Config.Labels "irisops.clean-lab"}}',container]).trim(),resume+'|20260926');assert.equal(run(['inspect','--format','{{.Image}}',container]).trim(),run(['image','inspect','--format','{{.Id}}',image]).trim());}
else {assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(container),'Container collision');await new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(52802,'127.0.0.1',()=>s.close(res));});}
try{
 containerId=resume||run(['run','-d','--name',container,'--label','irisops.clean-lab=20260926','-p','127.0.0.1:52802:52773',image]).trim();assert.match(containerId,/^[a-f0-9]{64}$/);
 let ready=false;for(let i=0;i<50;i++){try{if(term(['write "IRIS_READY",!']).includes('IRIS_READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Fresh IRIS did not accept a terminal session');
 assert.ok(term(['write "CLEAN=",##class(Config.Namespaces).Exists("IRISOPS"),##class(Config.Databases).Exists("IRISOPSGUARD"),##class(Security.Applications).Exists("/api/irisops-managed-guard"),!']).includes('CLEAN=000'));
 for(const entry of manifest.entries.filter(e=>e.path!=='Dockerfile')){const installed='/opt/irisops-guard/'+entry.path;assert.equal(run(['exec',container,'sha256sum',installed]).split(' ')[0],entry.sha256);}
 pass('fresh upstream base has no old namespace, receipt database or guard; all package file hashes match');
 change(['set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")',check]);
 for(const bad of ['https://other.invalid','http://127.0.0.1:80','http://127.0.0.1:052802'])assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Plan("${bad}")`).error,'loopback_origin_required');
 let p=plan();assert.equal(p.installed,false);assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Install("stale","${origin}")`).error,'stale_bootstrap_plan');assert.equal(plan().installed,false);
 change(['set sc=##class(Security.Resources).Create("%DB_IRISOPS","Owned collision fixture","")',check]);assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Plan("${origin}")`).error,'resource_collision');change(['set sc=##class(Security.Resources).Delete("%DB_IRISOPS")',check]);assert.equal(plan().installed,false);
 pass('invalid origins, stale plans and resource collisions refused before database creation');
 p=plan();const installed=call(`##class(IrisOps.Guard.Bootstrap).Install("${p.fingerprint}","${origin}")`);assert.ok(!installed.error,'Install: '+installed.error);assert.equal(installed.installed,true);
 const deployment=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');assert.equal(deployment.mode,'READ_ONLY');p=plan();assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Install("${p.fingerprint}","${origin}")`).action,'NO_CHANGE');assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS').generation,deployment.generation);
 assert.ok(term(['write "NO_TEST=",##class(%Dictionary.CompiledClass).%ExistsId("IrisOps.Guard.FaultApi"),##class(%Dictionary.CompiledClass).%ExistsId("IrisOps.Guard.ManagedNextApi"),##class(%Dictionary.CompiledClass).%ExistsId("IrisOps.Guard.CountingAdmin"),!'],'IRISOPS').includes('NO_TEST=000'));
 pass('package alone creates private journalled storage, mappings and readonly runtime; repeat installation is a no-op without test classes');
 absent();owned=true;change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned clean install fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned clean test operator","%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,${resources[0]}:RW,${resources[1]}:RW,${resources[2]}:U","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned clean installation user","USER","","",0,1)`,check,`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="Owned clean fixture",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${web}",.p)`,check]);
 await observer();initialWeb=await native('webapp');await login();let c=await request('/wallet/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,403);
 for(const wrong of ['http://127.0.0.1:52801','http://other.invalid',origin+'.evil'])assert.equal((await request('/connect','POST',{user,password},{...controls,Origin:wrong})).status,403);
 assert.equal((await request('/connect','POST',{user,password},{...controls,Host:'other.invalid'})).status,403);
 try {
  change(['kill ^IrisOpsGuardDeploy("install","origin")'],'IRISOPS');
  assert.equal((await request('/connect','POST',{user,password},{...controls,Origin:'http://127.0.0.1:52801',Host:'127.0.0.1:52801'})).status,200);
  for(const invalid of ['', 'http://other.invalid:52802','http://127.0.0.1:99999']){change([`set ^IrisOpsGuardDeploy("install","origin")="${invalid}"`],'IRISOPS');assert.equal((await request('/connect','POST',{user,password})).status,403);}
 }finally{change([`set ^IrisOpsGuardDeploy("install","origin")="${origin}"`],'IRISOPS');}
 await login();pass('legacy fixed-origin default preserved; malformed installed origin fails closed rather than trusting request headers');
 pass('actual native login on separately configured loopback origin; readonly and wrong-origin/Host requests blocked');
 const old=controls;transition('ACTIVE');assert.equal((await request('/capabilities','GET',undefined,old)).status,401);await login();
 assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Install("stale","${origin}")`).error,'stale_bootstrap_plan');assert.equal((await request('/capabilities')).status,200);assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS').mode,'ACTIVE');
 pass('rejected stale reinstall leaves an existing active installation and its authorization unchanged');const receipts=[];
 for(const kind of ['wallet','webapp']){
  c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);
  const body=kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'};
  const p=await request('/'+kind+'/previews','POST',body);assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});
 }
 assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});restore();
 pass('both genuine operations verify on the clean installed runtime, with independent native readback and restored fixtures');
 if(process.env.IRISOPS_CLEAN_UI==='1'){
  const {runCleanUi}=await import('./verify-clean-ui.mjs');await runCleanUi({origin,user,password,transition,pass,suffix,keys});
 }
 transition('READ_ONLY');await login();const prior=controls;run(['restart','--time','20',container]);let up=false;
 for(let i=0;i<45;i++){try{if((await request('/session','GET',undefined,{})).status===401){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(up);assert.notEqual((await request('/capabilities','GET',undefined,prior)).status,200);await login();await observer();
 for(const p of receipts){const r=await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');}
 assert.equal((await native('wallet')).UseResource.toUpperCase(),initial.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);restored=true;assert.equal(plan().action,'NO_CHANGE');
 pass('actual clean-instance restart retains installation and receipts; fresh login recovers both original results without replay');complete=true;
}finally{
 if(containerId){
  if(owned){restore();change([`set sc=##class(Security.Applications).Delete("${web}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();}
  try{if(plan().installed)transition('SUSPENDED');}catch{}
  const logs=run(['logs','--since',started,container]);assert.ok(!logs.includes(password)&&(!token||!logs.includes(token))&&[...keys].every(k=>!logs.includes(k)));
 }
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',previous]).trim(),previousId+'|true');
 const preserved=term(['write "OLD=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',previous).split(/\r?\n/).filter(s=>/^(OLD|COUNT)=/.test(s));assert.deepEqual(preserved,oldState);
 await writeFile(new URL('clean-install-evidence-'+suffix+'.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,containerId,packageSha256:manifest.contentSha256,complete,restored,previousLabPreserved:true,productionReady:false,checks},null,2)+'\n');
}
