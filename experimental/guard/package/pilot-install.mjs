// Terminal-only operator workflow. No downloads, deletion, credentials or ACTIVE mode.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,open,lstat,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,X509Certificate} from 'node:crypto';
import {createServer} from 'node:net';
import {request} from 'node:https';
import {candidate as referenceCandidate,options,makePlan,validatePlan,revalidate,assertOwned,digest} from './pilot-plan.mjs';
import {sha256,runtimePaths} from './build.mjs';
const referenceArtifact=fileURLToPath(new URL('../../../../irisops-guard-tls-package-20260926-m/',import.meta.url));
function fail(code){throw Error(code);}
async function jsonFile(path){const info=await lstat(path);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size<131072);return JSON.parse(await readFile(path,'utf8'));}
async function saveNew(path,value){const f=await open(path,'wx');try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}}
export function operator({docker=process.env.IRISOPS_DOCKER_EXECUTABLE,run:provided,target=referenceCandidate,artifactDirectory=referenceArtifact,runtimeProfile='fixed-targets-v1'}={}){
 const expectedPaths=runtimePaths(runtimeProfile);
 const candidate=Object.freeze({...target}),artifact=artifactDirectory;
 assert.ok(docker||provided,'Explicit Docker executable required');
 const run=provided||((args,input)=>{try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{fail('docker_step_failed_raw_output_suppressed');}});
 // Select only ownership/topology fields; never dump arbitrary container env.
 const inspectFormat='{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Config":{"Labels":{"irisops.pilot.owner":{{json (index .Config.Labels "irisops.pilot.owner")}}},"Env":[{{range .Config.Env}}{{if eq . "ISC_DATA_DIRECTORY=/durable/iris"}}{{json .}}{{end}}{{end}}]},"HostConfig":{"Privileged":{{json .HostConfig.Privileged}},"NetworkMode":{{json .HostConfig.NetworkMode}},"PortBindings":{{json .HostConfig.PortBindings}}},"Mounts":{{json .Mounts}},"State":{"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}}}}';
 const inspect=id=>JSON.parse(run(['inspect','--type','container','--format',inspectFormat,id]));
 async function packageCheck(){const root=await realpath(artifact),manifest=await jsonFile(join(root,'manifest.json'));assert.equal(manifest.contentSha256,candidate.packageHash);assert.equal(sha256(JSON.stringify(manifest.entries)),candidate.packageHash);assert.deepEqual(manifest.entries.map(e=>e.path).sort(),expectedPaths);for(const e of manifest.entries){const path=join(root,e.path),actual=await realpath(path);assert.ok(actual.startsWith(root+sep));const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.size,e.bytes);assert.equal(sha256(await readFile(actual)),e.sha256);}return manifest;}
 async function portAvailable(port){return await new Promise(resolve=>{const s=createServer();s.on('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
 async function snapshot(config){options(config);await packageCheck();const imageId=run(['image','inspect','--format','{{.Id}}',candidate.image]).trim();const v=JSON.parse(run(['volume','inspect',config.certificateVolume]))[0];assert.equal(v.Options===null||Object.keys(v.Options||{}).length===0,true,'Custom volume mount refused');
  const names=run(['ps','-a','--format','{{.Names}}']).trim().split(/\r?\n/),volumes=run(['volume','ls','--format','{{.Name}}']).trim().split(/\r?\n/);
  return {daemonId:run(['info','--format','{{.ID}}']).trim(),imageId,packageHash:candidate.packageHash,certificate:{Name:v.Name,Driver:v.Driver,Scope:v.Scope,CreatedAt:v.CreatedAt},containerAbsent:!names.includes(config.name),dataAbsent:!volumes.includes(config.name+'-data'),portAvailable:await portAvailable(config.port)};
 }
 function term(id,lines,namespace='%SYS'){assert.match(id,/^[a-f0-9]{64}$/);const out=run(['exec','-i',id,'iris','session','IRIS','-U',namespace],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'native_step_failed');return out;}
 function call(id,expression,namespace='%SYS'){const out=term(id,['try { set r='+expression+' write "RESULT=",r.%ToJSON(),! } catch e { write "STEP_FAILED",! }'],namespace);const m=out.match(/RESULT=(\{.*\})/);assert.ok(m,'native_result_missing');return JSON.parse(m[1]);}
 function deployment(id){return call(id,'##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');}
 async function ready(id){for(let i=0;i<90;i++){try{if(term(id,['write "READY",!']).includes('READY'))return;}catch{}await new Promise(r=>setTimeout(r,500));}fail('native_ready_timeout');}
 function get(port,ca,path){return new Promise((resolve,reject)=>{const q=request({hostname:'127.0.0.1',servername:'',port,path,ca,rejectUnauthorized:true,agent:false,timeout:15000},r=>{const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>resolve({status:r.statusCode,body:Buffer.concat(chunks),cacheControl:r.headers['cache-control']}));});q.on('error',()=>reject(Error('strict_TLS_validation_failed')));q.on('timeout',()=>q.destroy(Error('timeout')));q.end();});}
 function verifyVolume(plan){const v=JSON.parse(run(['volume','inspect',plan.config.name+'-data']))[0];assert.equal(v.Driver,'local');assert.equal(v.Scope,'local');assert.equal(v.Labels?.['irisops.pilot.owner'],plan.nonce);assert.ok(!v.Options||Object.keys(v.Options).length===0);return v;}
 function owned(plan,id){const c=inspect(id);assertOwned(c,plan,id,candidate);verifyVolume(plan);return c;}
 async function plan(config){return makePlan(config,await snapshot(config),{nonce:randomBytes(16).toString('hex'),target:candidate});}
 async function apply(p,confirmation,receiptPath){
  validatePlan(p,confirmation,{target:candidate});revalidate(p,await snapshot(p.config),candidate);const manifest=await packageCheck();
  const receipt=await open(receiptPath,'wx');let events;
  try{events=await open(receiptPath+'.events.jsonl','wx');}catch(e){await receipt.close();throw e;}
  const record=async value=>{await events.write(JSON.stringify({at:new Date().toISOString(),...value})+'\n');await events.sync();};
  let id,complete=false,phase='revalidate';const results=[];
  try{
   // Repeat immediately before mutation; labels fence Docker's idempotent volume create.
   revalidate(p,await snapshot(p.config),candidate);validatePlan(p,confirmation,{target:candidate});await record({phase,planFingerprint:p.fingerprint,name:p.config.name});
   phase='volume';run(['volume','create','--driver','local','--label','irisops.pilot.owner='+p.nonce,p.config.name+'-data']);verifyVolume(p);await record({phase,volume:p.config.name+'-data'});
   phase='container';id=run(['create','--name',p.config.name,'--label','irisops.pilot.owner='+p.nonce,'--network','bridge','--mount','type=volume,source='+p.config.name+'-data,target=/durable','--mount','type=volume,source='+p.config.certificateVolume+',target=/run/irisops-tls,readonly','-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:'+p.config.port+':52774',candidate.image]).trim();assert.match(id,/^[a-f0-9]{64}$/);await record({phase,id});owned(p,id);
   phase='start';run(['start',id]);await ready(id);owned(p,id);await record({phase,id});
   phase='verify_image_TLS';for(const e of manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',id,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
   assert.equal(run(['exec',id,'stat','-c','%a|%u|%g','/run/irisops-tls/server.key']).trim(),'600|51773|51773');
   const ca=run(['exec',id,'cat','/run/irisops-tls/ca.crt']),leaf=run(['exec',id,'cat','/run/irisops-tls/server.crt']);assert.equal(new X509Certificate(leaf).checkIP('127.0.0.1'),'127.0.0.1');assert.equal((await get(p.config.port,ca,'/')).status,403);results.push('exact image files and strict TLS identity verified before bootstrap');
   phase='bootstrap';const origin='https://127.0.0.1:'+p.config.port;term(id,['set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")','if $system.Status.IsError(sc) write "STEP_FAILED",! halt']);const before=call(id,'##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")');assert.equal(before.action,'INSTALL_READ_ONLY');assert.match(before.fingerprint,/^[a-fA-F0-9]{64}$/);await record({phase,bootstrapFingerprint:before.fingerprint});const installed=call(id,'##class(IrisOps.Guard.Bootstrap).Install("'+before.fingerprint+'","'+origin+'")');assert.equal(installed.action,'NO_CHANGE');assert.equal(deployment(id).mode,'READ_ONLY');results.push('native bootstrap installed new resources READ_ONLY; repeat plan NO_CHANGE');
   phase='readback';const response=await get(p.config.port,ca,'/csp/ops/guard-managed/web/index.html?release=guard-cache-m1');assert.equal(response.status,200);assert.equal(response.cacheControl,'no-store');assert.equal(sha256(response.body),manifest.entries.find(e=>e.path==='ui/guard-managed/web/index.html').sha256);
   for(const path of ['/api/admin/login','/csp/sys/UtilHome.csp','/csp/ops/index.html'])assert.equal((await get(p.config.port,ca,path)).status,403);
   assert.ok(term(id,['set dirs=$listbuild("/durable/irisops-code/","/durable/irisops-guard-state/")','set sc=$$CheckList^Integrity(,dirs,0,,1)','write "INTEGRITY=",$system.Status.IsOK(sc),!']).includes('INTEGRITY=1'));
   const count=term(id,['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS');assert.ok(count.includes('COUNT=0'));results.push('exact no-store UI, blocked native routes, empty receipt store and native database integrity verified');
   owned(p,id);complete=true;phase='complete';await record({phase,id});
  }catch{await record({phase,status:'FAILED',id});if(id){owned(p,id);run(['stop','--timeout','30',id]);assert.equal(inspect(id).State.Running,false);await record({phase:'failed_instance_stopped',id});}}
  finally{const result={schema:1,complete,phase,plan:p,containerId:id||null,results,credentialsCreated:false,productionReady:false,retained:true};await receipt.writeFile(JSON.stringify(result,null,2)+'\n');await receipt.sync();await receipt.close();await events.close();}
  assert.ok(complete,'installation_failed_preserved_for_inspection');return {complete,containerId:id,mode:'READ_ONLY',url:'https://127.0.0.1:'+p.config.port+'/csp/ops/guard-managed/web/index.html?release=guard-cache-m1'};
 }
 async function rollbackPlan(installation){assert.equal(installation.schema,1);assert.equal(installation.complete,true);const p=installation.plan;validatePlan(p,p.fingerprint,{now:p.createdAt,target:candidate});const c=owned(p,installation.containerId);assert.equal(c.State.Running,true,'Installation is not running; do not start it automatically');const state=deployment(c.Id);const body={schema:1,action:'SUSPEND_AND_STOP_RETAIN_ALL',installation,daemonId:run(['info','--format','{{.ID}}']).trim(),state,createdAt:Date.now()};return {...body,fingerprint:digest(body)};}
 async function rollback(p,confirmation,output){const {fingerprint,...body}=p;assert.equal(p.schema,1);assert.equal(p.action,'SUSPEND_AND_STOP_RETAIN_ALL');assert.equal(digest(body),fingerprint);assert.equal(confirmation,fingerprint,'Exact rollback confirmation required');assert.ok(Date.now()>=p.createdAt-30000&&Date.now()<p.createdAt+900000,'Rollback plan expired');assert.equal(run(['info','--format','{{.ID}}']).trim(),p.daemonId);
  const original=p.installation,config=original.plan;validatePlan(config,config.fingerprint,{now:config.createdAt,target:candidate});const id=original.containerId;const c=owned(config,id);assert.equal(c.State.Running,true);assert.deepEqual(deployment(id),p.state,'Native state drift; prepare a new rollback plan');assert.match(p.state.fingerprint,/^[a-fA-F0-9]{64}$/);
  const f=await open(output,'wx');let complete=false,phase='suspend';try{owned(config,id);assert.deepEqual(deployment(id),p.state);const after=call(id,'##class(IrisOps.Guard.Deployment).Apply("'+p.state.fingerprint+'","SUSPENDED","managed-lab-a")','IRISOPS');assert.equal(after.mode,'SUSPENDED');phase='stop';run(['stop','--timeout','30',id]);const stopped=owned(config,id);assert.equal(stopped.State.Running,false);assert.equal(stopped.State.ExitCode,0);complete=true;phase='complete';}finally{await f.writeFile(JSON.stringify({complete,phase,containerId:id,volume:config.config.name+'-data',retained:true,deleted:false},null,2)+'\n');await f.sync();await f.close();}return {complete,retained:true,deleted:false};
 }
 return {plan,apply,rollbackPlan,rollback,snapshot};
}
async function cli(){const [command,...args]=process.argv.slice(2),op=operator();if(command==='plan'&&args.length===4){const p=await op.plan({name:args[0],port:Number(args[1]),certificateVolume:args[2]});await saveNew(args[3],p);console.log(JSON.stringify({action:p.action,name:p.config.name,dataVolume:p.config.name+'-data',certificateVolume:p.config.certificateVolume,origin:'https://127.0.0.1:'+p.config.port,initialMode:'READ_ONLY',expiresAt:new Date(p.expiresAt).toISOString(),fingerprint:p.fingerprint,planFile:resolve(args[3]),dockerWritesPerformed:false}));}
 else if(command==='apply'&&args.length===3)console.log(JSON.stringify(await op.apply(await jsonFile(args[0]),args[1],args[2])));
 else if(command==='plan-rollback'&&args.length===2){const p=await op.rollbackPlan(await jsonFile(args[0]));await saveNew(args[1],p);console.log(JSON.stringify({action:p.action,containerId:p.installation.containerId,retainsAllData:true,fingerprint:p.fingerprint,planFile:resolve(args[1])}));}
 else if(command==='rollback'&&args.length===3)console.log(JSON.stringify(await op.rollback(await jsonFile(args[0]),args[1],args[2])));
 else fail('Usage: plan NAME PORT CERT_VOLUME OUT | apply PLAN FINGERPRINT RECEIPT | plan-rollback RECEIPT OUT | rollback PLAN FINGERPRINT OUT');}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)cli().catch(e=>{console.error(e instanceof assert.AssertionError?'Operator validation failed; no raw diagnostic data printed':e.message);process.exitCode=1;});
