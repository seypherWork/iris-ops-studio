// Real cold backup/restore on new volumes only. Source g is NEVER started/written.
// Sensitive database archives live outside this checkout, never in release assets.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve,join} from 'node:path';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const suffix=process.argv[2];assert.match(suffix||'',/^[a-z]$/);
const image='sha256:d657acb6445cae0a7b96f917dcbc7fdcf4007d2a9d43b22cfbe5a654660e75a4';
const source='irisops-guard-durable-20260926-g';
const prefix='irisops-guard-cold-20260926-'+suffix;
const archiveVolume=prefix+'-archives',seedVolume=prefix+'-seed-data',restoredVolume=prefix+'-restored-data';
const volumes=[archiveVolume,seedVolume,restoredVolume];
const seed=prefix+'-seed',restored=prefix+'-restored';
const privateDir=resolve('..','irisops-guard-cold-backup-private-20260926-'+suffix);
const original='iris-ops-guard-dev-20260925',originalId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='http://127.0.0.1:52803',app='/api/irisops-managed-guard';
const user='IrisOps_GuardColdUser',role='IrisOps_GuardColdRole';
const wallet='IrisOps_GuardProbeWallet',web='/csp/irisops-guard-testweb';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'},proposed={...initial,UseResource:resources[1]+':READ'};
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const secrets=new Set([password,basic]),checks=[],engines=[],helpers=[],archives=[];
let target=seed,controls,token,complete=false,fixturesRemoved=false,sourceHash,oldState,owned=false;
const started=new Date().toISOString();
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Isolated Docker/IRIS step failed; raw output suppressed');}}
function noSecrets(text){assert.ok([...secrets].filter(Boolean).every(s=>!text.includes(s)),'Fixture secret detected; output suppressed');}
function term(lines,ns='%SYS',name=target){const out=run(['exec','-i',name,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'Native test step failed; raw output suppressed');return out;}
const check='if $system.Status.IsError(sc) write "STEP_FAILED",! halt';
function change(lines,ns='%SYS'){assert.ok(term([...lines,'write "DONE",!'],ns).includes('DONE'));}
function call(code,ns='%SYS'){const out=term(['try { set result='+code+' write "RESULT=",result.%ToJSON(),! } catch e { write "ERROR=",e.Name,! }'],ns);const err=out.match(/ERROR=([A-Za-z0-9_]+)/);assert.ok(!err,'Native call rejected: '+err?.[1]);const m=out.match(/RESULT=(\{.*\})/);assert.ok(m);return JSON.parse(m[1]);}
const plan=()=>call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")');
function transition(mode){const p=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');const r=call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${mode}","managed-lab-a")`,'IRISOPS');assert.equal(r.mode,mode);return r;}
function pass(s){checks.push(s);console.log('PASS '+s);}
function historical(name=target){return term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set r=##class(IrisOps.Guard.Receipt).%OpenId(q.%Get("OperationId")),p=r.Public() write "ROW=",r.OperationId,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,p.%ToJSON()_r.RecoveryHash_r.Binding)),! }'],'IRISOPS',name).split(/\r?\n/).filter(s=>s.startsWith('ROW='));}
function originalSnapshot(){return term(['write "STATE=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',original).split(/\r?\n/).filter(s=>/^(STATE|COUNT)=/.test(s));}
function cold(volume){assert.equal(run(['ps','-q','--filter','volume='+volume]).trim(),'','Volume has a running consumer; refuse backup/restore');}
function helper(label,mounts,script){const name=prefix+'-'+label;assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(name));helpers.push(name);const out=run(['run','-i','--name',name,'--label','irisops.backup-lab=20260926','--network','none','--read-only','--user','51773:51773','--cap-drop','ALL','--security-opt','no-new-privileges',...mounts.flatMap(m=>['--mount',m]),'--entrypoint','/bin/bash',image,'-s'],'set -euo pipefail\numask 077\n'+script+'\n');assert.equal(run(['inspect','--format','{{.State.ExitCode}}',name]).trim(),'0');return {name,out};}
const ro=(volume,dest)=>`type=volume,source=${volume},target=${dest},readonly`;
const rw=volume=>`type=volume,source=${volume},target=/durable`;
const tarFlags='--sort=name --numeric-owner --sparse --format=posix --pax-option=delete=atime,delete=ctime';
// A TAR digest verifies transport, not sparse-file layout or round-trip equality.
// Bind logical file bytes, every path/type, owner/group/mode, exact modification
// timestamp and symlink target. Exclude inode, allocation, access/change times.
const fingerprint=String.raw`
export LC_ALL=C TZ=UTC
fingerprint() (
 cd "$1"
 find . -print0 | sort -z | while IFS= read -r -d '' path; do
  printf '%s\0' "$path"
  stat --printf='%F\0%u\0%g\0%a\0%y\0' -- "$path"
  if [ -L "$path" ]; then readlink -z -- "$path"
  elif [ -f "$path" ]; then sha256sum --zero -- "$path"
  elif [ ! -d "$path" ]; then echo 'Unsupported archive object' >&2; exit 1
  fi
 done | sha256sum
)
`;
function volumeHash(volume,label){cold(volume);const {out}=helper(label,[ro(volume,'/source')],fingerprint+'\nfingerprint /source');const hash=out.split(' ')[0];assert.match(hash,/^[a-f0-9]{64}$/);return hash;}
async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function backup(volume,file,label){cold(volume);cold(archiveVolume);const {name,out}=helper(label,[ro(volume,'/source'),rw(archiveVolume)],`test ! -e /durable/${file}\ntar ${tarFlags} -cf /durable/${file} -C /source .\nchmod 600 /durable/${file}\ntar --compare --numeric-owner -f /durable/${file} -C /source\nsha256sum /durable/${file}`);const hash=out.split(' ')[0];assert.match(hash,/^[a-f0-9]{64}$/);const path=join(privateDir,file);assert.ok(!(await readdir(privateDir)).includes(file));run(['cp',name+':/durable/'+file,path]);assert.equal(await fileHash(path),hash);const item={file,sha256:hash,bytes:(await stat(path)).size};archives.push(item);return hash;}
function restoreArchive(file,dest,label,archiveHash,contentHash){cold(dest);cold(archiveVolume);const {out}=helper(label,[ro(archiveVolume,'/archives'),rw(dest)],fingerprint+`\ntest -z "$(find /durable -mindepth 1 -print -quit)"\ntest "$(sha256sum /archives/${file} | cut -d ' ' -f 1)" = '${archiveHash}'\ntar --extract --numeric-owner --same-owner --same-permissions --delay-directory-restore -f /archives/${file} -C /durable\ntar --compare --numeric-owner -f /archives/${file} -C /durable\nfingerprint /durable`);assert.equal(out.split(' ')[0],contentHash,'Restored content/metadata differs before first boot');}
async function launch(name,volume){cold(volume);target=name;const id=run(['run','-d','--name',name,'--label','irisops.backup-lab=20260926','--mount',rw(volume),'-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52803:52773',image]).trim();assert.match(id,/^[a-f0-9]{64}$/);engines.push({name,id,volume});let ready=false;for(let i=0;i<60;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);const m=JSON.parse(run(['inspect','--format','{{json .Mounts}}',name]));assert.equal(m.length,1);assert.equal(m[0].Name,volume);assert.equal(m[0].Destination,'/durable');assert.ok(term(['write "DURABLE=",$system.Container.IsDeployed(),!']).includes('DURABLE=1'));assert.equal(plan().action,'NO_CHANGE');}
function stop(name){run(['stop','--time','30',name]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',name]).trim(),'false|0');}
async function request(path,method='GET',body,h=controls){const r=await fetch(origin+app+'/v1'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});const text=await r.text();noSecrets(text);let data;try{data=JSON.parse(text);}catch{data=null;}if(path.endsWith('/previews')&&r.status===200)secrets.add(data.recoveryKey);return {status:r.status,body:data,headers:r.headers};}
async function login(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);assert.equal(r.body.actor,user);const cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');secrets.add(cookie);secrets.add(r.body.csrf);controls={Cookie:cookie,Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};assert.equal((await request('/connect','POST',{user,password})).status,200);}
async function observer(){const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});assert.equal(r.status,200);const d=await r.json();token=(d.result||d).access_token;secrets.add(token);}
async function native(kind){const path=kind==='wallet'?'wallet/collection?name='+wallet:'web-app?name='+encodeURIComponent(web);const r=await fetch(origin+'/api/admin/v2/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);const text=await r.text();noSecrets(text);return JSON.parse(text).result;}
function absent(){assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${web}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`]).includes('ABSENT=0000000'));}
function resetTargets(){change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p','set p("Enabled")=0',`set sc=##class(Security.Applications).Modify("${web}",.p)`,check]);}
function integrity(){const out=term(['set dirs=$listbuild("/durable/irisops-code/","/durable/irisops-guard-state/")','set sc=$$CheckList^Integrity(,dirs,0,,1)','write "INTEGRITY_OK=",$system.Status.IsOK(sc),!']);assert.ok(out.includes('INTEGRITY_OK=1'),'Native integrity check failed; preserve restored copy');}
assert.equal(run(['image','inspect','--format','{{.Id}}',image]).trim(),image);assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',original]).trim(),originalId+'|true');oldState=originalSnapshot();
const sourceContainers=[['iris-ops-guard-durable-20260926-g-a','9369d6c651fde8dc088fc73ee4827a15ee1ca4411d8a801cc4b81aa5f07366c2'],['iris-ops-guard-durable-20260926-g-b','b1f9d6ba0869d8e0495d9ada7fa2218276ee62388232bfe220ce9ca4412e261c']];
for(const [name,id] of sourceContainers)assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.State.ExitCode}}',name]).trim(),id+'|false|0');cold(source);
const existingVolumes=run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/);assert.ok(volumes.every(v=>!existingVolumes.includes(v)));assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).some(n=>n.startsWith(prefix)));
assert.deepEqual((await readdir(privateDir)).sort(),['.gitignore','README.txt']);assert.equal((await readFile(join(privateDir,'.gitignore'),'utf8')).trim(),'*');
await new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(52803,'127.0.0.1',()=>s.close(res));});
try{
 sourceHash=volumeHash(source,'source-before');for(const v of volumes)assert.equal(run(['volume','create','--label','irisops.backup-lab=20260926',v]).trim(),v);
 const archiveHash=await backup(source,'source-g.tar','backup-original');restoreArchive('source-g.tar',seedVolume,'restore-original',archiveHash,sourceHash);
 pass('cold source copied read-only to archive and host; all restored bytes, paths, owners and modes match before first boot');
 await launch(seed,seedVolume);assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS').mode,'SUSPENDED');const oldReceipts=historical();assert.equal(oldReceipts.length,2);integrity();
 pass('restored original installation and two historical receipts start without reinstall; both application databases pass native integrity check');
 absent();owned=true;change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned cold restore fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned cold restore operator","%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,${resources[0]}:RW,${resources[1]}:RW,${resources[2]}:U","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned cold restore user","USER","","",0,1)`,check,`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="Owned cold restore fixture",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${web}",.p)`,check]);
 transition('ACTIVE');await observer();const initialWeb=await native('webapp');await login();const receipts=[];
 for(const kind of ['wallet','webapp']){const c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const p=await request('/'+kind+'/previews','POST',kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'});assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});}
 assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});resetTargets();
 transition('READ_ONLY');await login();const prior=controls;const before=historical();assert.equal(before.length,4);assert.ok(oldReceipts.every(row=>before.includes(row)));const deployment=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');
 stop(seed);const checkpointContentHash=volumeHash(seedVolume,'checkpoint-before');const checkpointHash=await backup(seedVolume,'checkpoint.tar','backup-checkpoint');restoreArchive('checkpoint.tar',restoredVolume,'restore-checkpoint',checkpointHash,checkpointContentHash);
 pass('two new genuine operations plus historical receipts cold-backed-up and restored to a second empty independent volume');
 await launch(restored,restoredVolume);assert.deepEqual(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS'),deployment);assert.deepEqual(historical(),before);assert.ok(term(['write "BOOT_EMPTY=",($data(^IrisOpsGuardBoot("epoch"))=0),!'],'IRISOPS').includes('BOOT_EMPTY=1'));assert.notEqual((await request('/capabilities','GET',undefined,prior)).status,200);await login();await observer();
 for(const p of receipts){assert.equal((await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:'0'.repeat(64)})).status,404);const r=await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.receipt.dispatchCount,1);assert.equal(r.body.administrativeWrites,0);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');}
 assert.deepEqual(historical(),before);assert.equal((await native('wallet')).UseResource.toUpperCase(),initial.UseResource.toUpperCase());assert.deepEqual(await native('webapp'),initialWeb);
 pass('fresh native login recovers both original verified results with correct proof only; all four receipts and native target states unchanged, no replay');
 integrity();pass('both restored application databases pass a second native integrity check');
 if(process.env.IRISOPS_COLD_UI==='1'){const {runCleanUi}=await import('./verify-clean-ui.mjs');await runCleanUi({origin,user,password,transition,pass,suffix:'cold-'+suffix,keys:secrets});}
 resetTargets();change([`set sc=##class(Security.Applications).Delete("${web}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();owned=false;fixturesRemoved=true;transition('SUSPENDED');assert.deepEqual(historical(),before);stop(restored);
 assert.equal(volumeHash(source,'source-after'),sourceHash);for(const a of archives)assert.equal(await fileHash(join(privateDir,a.file)),a.sha256);
 pass('source volume bit-for-bit unchanged; final restored guard suspended, test fixtures removed and all archives retained outside checkout');complete=true;
}finally{
 for(const engine of engines){if(run(['inspect','--format','{{.State.Running}}',engine.name]).trim()==='true'){target=engine.name;if(owned){try{resetTargets();}catch{}}try{transition('SUSPENDED');}catch{}stop(engine.name);}noSecrets(run(['logs','--since',started,engine.name]));}
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',original]).trim(),originalId+'|true');assert.deepEqual(originalSnapshot(),oldState);for(const [name,id] of sourceContainers)assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',name]).trim(),id+'|false');
 const evidence={timestamp:new Date().toISOString(),complete,fixturesRemoved,sourceVolume:source,sourceHash,sourceHashKind:'logical-files-metadata-v1',image,archives,archiveVolume,engines,helpers,previousLabsPreserved:true,sourceWasNeverStarted:true,hostExport:true,encrypted:false,sameImageOnly:true,productionReady:false,checks};
 await writeFile(new URL('cold-backup-evidence-'+suffix+'.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});await writeFile(join(privateDir,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
}
