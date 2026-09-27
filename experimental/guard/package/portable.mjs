// Local disposable pilot only. Source bundle; no pre-existing image or certificates required.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,open,mkdtemp,readdir} from 'node:fs/promises';
import {resolve,join,sep,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {sha256,runtimePaths} from './build.mjs';
import {digest} from './pilot-plan.mjs';
import {operator} from './pilot-install.mjs';

export const base='intersystemsdc/iris-community@sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70';
const rootDefault=fileURLToPath(new URL('./',import.meta.url));
export function safePath(path){assert.ok(typeof path==='string'&&/^[A-Za-z0-9_.\/-]+$/.test(path));assert.ok(!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..'));return path;}
export function exactRuntimeInventory(actual,expected){for(const p of actual)safePath(p);assert.equal(new Set(actual).size,actual.length);assert.deepEqual([...actual].sort(),[...expected].sort(),'Unexpected or missing runtime build input');}
export function bundleProfile(version){
 if(version==='portable-pilot-1')return 'fixed-targets-v1';
 if(version==='portable-enrolled-pilot-1')return 'enrolled-targets-v1';
 if(version==='portable-enrolled-role-pilot-1')return 'enrolled-role-v1';
 if(version==='portable-enrolled-user-pilot-1')return 'enrolled-user-v1';
 if(version==='portable-enrolled-user-review-1')return 'enrolled-user-v1';
 throw Error('Unknown portable bundle version');
}
async function inventory(root,prefix=''){const files=[];for(const e of await readdir(root,{withFileTypes:true})){assert.ok(!e.isSymbolicLink(),'Symlink build input refused');const path=prefix+e.name;safePath(path);if(e.isDirectory())files.push(...await inventory(join(root,e.name),path+'/'));else{assert.ok(e.isFile(),'Non-regular build input refused');files.push(path);}}return files;}
async function json(path){const s=await lstat(path);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size<131072);return JSON.parse(await readFile(path,'utf8'));}
export async function saveNew(path,value){const f=await open(path,'wx');try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}}
export async function verifyBundle(root){
 root=await realpath(root);const manifest=await json(join(root,'bundle.json'));
 assert.equal(manifest.schema,1);assert.equal(manifest.base,base);assert.equal(manifest.productionReady,false);
 const runtimeProfile=bundleProfile(manifest.version),expected=runtimePaths(runtimeProfile);
 const extras=manifest.version==='portable-enrolled-user-review-1'?['review.mjs','onboarding-preflight.mjs','JUDGE-GUIDE.md']:[];
 assert.ok(Array.isArray(manifest.entries)&&manifest.entries.length===expected.length+7+extras.length);
 assert.equal(manifest.contentSha256,sha256(JSON.stringify(manifest.entries)));
 const names=new Set();for(const e of manifest.entries){safePath(e.path);assert.ok(!names.has(e.path));names.add(e.path);const path=join(root,e.path);const actual=await realpath(path),s=await lstat(path);assert.ok(actual.startsWith(root+sep)&&s.isFile()&&!s.isSymbolicLink());assert.equal(s.size,e.bytes);assert.equal(sha256(await readFile(actual)),e.sha256);}
 for(const required of ['portable.mjs','pilot-install.mjs','pilot-plan.mjs','build.mjs','README.md','LICENSE','runtime/manifest.json','runtime/Dockerfile'])assert.ok(names.has(required));
 for(const required of extras)assert.ok(names.has(required));
 exactRuntimeInventory([...names],[...expected.map(p=>'runtime/'+p),'runtime/manifest.json','portable.mjs','pilot-install.mjs','pilot-plan.mjs','build.mjs','README.md','LICENSE',...extras]);
 const runtime=await json(join(root,'runtime/manifest.json'));exactRuntimeInventory(runtime.entries.map(e=>e.path),expected);assert.equal(runtime.contentSha256,sha256(JSON.stringify(runtime.entries)));
 for(const e of runtime.entries){safePath(e.path);const bundled=manifest.entries.find(x=>x.path==='runtime/'+e.path);assert.deepEqual(bundled,{...e,path:'runtime/'+e.path});}
 exactRuntimeInventory(await inventory(join(root,'runtime')),['manifest.json',...runtime.entries.map(e=>e.path)]);
 assert.equal((await readFile(join(root,'runtime/Dockerfile'),'utf8')).split(/\r?\n/).find(l=>l.startsWith('FROM ')),'FROM '+base);
 return {root,manifest,runtime,runtimeProfile};
}
export function namesFor(name){assert.match(name,/^irisops-pilot-[a-z0-9][a-z0-9-]{0,35}$/);return {name,certificateVolume:'irisops-guard-'+name.slice(14)+'-cert-private',helper:name+'-tls-init'};}
export function validatePreparation(p,confirmation,now=Date.now()){
 const {fingerprint,...body}=p;assert.equal(p.schema,1);assert.equal(p.action,'BUILD_AND_CREATE_NEW_LAB_TLS');assert.equal(digest(body),fingerprint);assert.match(fingerprint,/^[a-f0-9]{64}$/);assert.equal(confirmation,fingerprint);
 assert.deepEqual(p.resources,namesFor(p.resources.name));assert.match(p.nonce,/^[a-f0-9]{32}$/);assert.match(p.bundleHash,/^[a-f0-9]{64}$/);assert.ok(typeof p.daemonId==='string'&&p.daemonId.length>0);
 assert.ok(Number.isSafeInteger(p.createdAt)&&now>=p.createdAt-30000&&now<p.createdAt+900000,'Preparation plan expired');
}
const certificateScript=`set -euo pipefail
umask 077
test ! -e /durable/ca.key && test ! -e /durable/server.key && test ! -e /durable/server.crt
openssl req -x509 -newkey rsa:3072 -nodes -keyout /durable/ca.key -out /durable/ca.crt -days 2 -subj /CN=IrisOps-Disposable-CA -addext basicConstraints=critical,CA:TRUE >/dev/null 2>&1
openssl req -newkey rsa:3072 -nodes -keyout /durable/server.key -out /tmp/server.csr -subj /CN=127.0.0.1 >/dev/null 2>&1
printf '%s\\n' 'subjectAltName=IP:127.0.0.1' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' > /tmp/ext
openssl x509 -req -in /tmp/server.csr -CA /durable/ca.crt -CAkey /durable/ca.key -set_serial 0x$(openssl rand -hex 16) -out /durable/server.crt -days 2 -extfile /tmp/ext >/dev/null 2>&1
openssl verify -CAfile /durable/ca.crt -verify_ip 127.0.0.1 /durable/server.crt >/dev/null
test "$(stat -c '%a|%u|%g' /durable/server.key)" = '600|51773|51773'
printf 'CERTIFICATE_READY\\n'
`;
export function portable({root=rootDefault,docker=process.env.IRISOPS_DOCKER_EXECUTABLE,run:provided}={}){
 assert.ok(docker||provided,'Set IRISOPS_DOCKER_EXECUTABLE to your Docker executable');
 const run=provided||((args,input)=>{try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:600000,maxBuffer:4*1024*1024});}catch{throw Error('Docker step failed; raw output suppressed; inspect retained receipt');}});
 const daemon=()=>run(['info','--format','{{.ID}}']).trim();
 function absent(resources){const cs=run(['ps','-a','--format','{{.Names}}']).trim().split(/\r?\n/),vs=run(['volume','ls','--format','{{.Name}}']).trim().split(/\r?\n/);assert.ok(!cs.includes(resources.name)&&!cs.includes(resources.helper));assert.ok(!vs.includes(resources.certificateVolume)&&!vs.includes(resources.name+'-data'));}
 function volume(resources,nonce){const v=JSON.parse(run(['volume','inspect',resources.certificateVolume]))[0];assert.equal(v.Driver,'local');assert.equal(v.Scope,'local');assert.equal(v.Labels?.['irisops.pilot.owner'],nonce);assert.ok(!v.Options||Object.keys(v.Options).length===0);return {Name:v.Name,Driver:v.Driver,Scope:v.Scope,CreatedAt:v.CreatedAt};}
 async function plan(name){const bundle=await verifyBundle(root),resources=namesFor(name);absent(resources);const body={schema:1,action:'BUILD_AND_CREATE_NEW_LAB_TLS',resources,daemonId:daemon(),bundleHash:bundle.manifest.contentSha256,nonce:randomBytes(16).toString('hex'),createdAt:Date.now()};return {...body,fingerprint:digest(body)};}
 async function prepare(p,confirmation,output){
  validatePreparation(p,confirmation);const b=await verifyBundle(root);assert.equal(b.manifest.contentSha256,p.bundleHash);assert.equal(daemon(),p.daemonId);absent(p.resources);
  const f=await open(output,'wx');let complete=false,phase='build',image,helperId,certificate,staging;
  try{
   validatePreparation(p,confirmation);absent(p.resources);assert.equal(daemon(),p.daemonId);
   staging=await mkdtemp(join(dirname(resolve(output)),'irisops-build-'));
   // Digest-pinned official base; Docker may retrieve it if it is not cached.
   run(['build','--network','none','--pull=false','--label','irisops.portable.bundle='+b.manifest.contentSha256,'--iidfile',join(staging,'image.id'),join(b.root,'runtime')]);image=(await readFile(join(staging,'image.id'),'utf8')).trim();assert.match(image,/^sha256:[a-f0-9]{64}$/);assert.equal(run(['image','inspect','--format','{{.Id}}',image]).trim(),image);
   phase='certificate_volume';absent(p.resources);run(['volume','create','--driver','local','--label','irisops.pilot.owner='+p.nonce,p.resources.certificateVolume]);certificate=volume(p.resources,p.nonce);
   phase='certificate_helper';helperId=run(['create','-i','--name',p.resources.helper,'--label','irisops.pilot.owner='+p.nonce,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','51773:51773','--tmpfs','/tmp:rw,noexec,nosuid,size=8m,uid=51773,gid=51773,mode=700','--mount','type=volume,source='+p.resources.certificateVolume+',target=/durable','--entrypoint','bash',image,'-s']).trim();assert.match(helperId,/^[a-f0-9]{64}$/);
   assert.equal(run(['inspect','--format','{{.Id}}|{{index .Config.Labels "irisops.pilot.owner"}}|{{.HostConfig.NetworkMode}}',helperId]).trim(),helperId+'|'+p.nonce+'|none');
   assert.equal(run(['start','-a','-i',helperId],certificateScript).trim(),'CERTIFICATE_READY');assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',helperId]).trim(),'false|0');volume(p.resources,p.nonce);
   complete=true;phase='complete';
  }catch(e){if(helperId){assert.equal(run(['inspect','--format','{{.Id}}|{{index .Config.Labels "irisops.pilot.owner"}}',helperId]).trim(),helperId+'|'+p.nonce);if(run(['inspect','--format','{{.State.Running}}',helperId]).trim()==='true')run(['stop','--timeout','10',helperId]);}throw e;
  }finally{const result=JSON.parse(JSON.stringify({schema:1,complete,phase,plan:p,image,packageHash:b.runtime.contentSha256,helperId,certificate,staging,productionReady:false,retained:true,privateKeyExported:false}));await f.writeFile(JSON.stringify({...result,fingerprint:digest(result)},null,2)+'\n');await f.sync();await f.close();}
  return {complete,image,certificateVolume:p.resources.certificateVolume,privateKeyExported:false};
 }
 async function installedOperator(receipt){
  const {fingerprint,...body}=receipt;assert.equal(fingerprint,digest(body),'Preparation receipt changed');assert.equal(receipt.schema,1);assert.equal(receipt.complete,true);validatePreparation(receipt.plan,receipt.plan.fingerprint,receipt.plan.createdAt);const b=await verifyBundle(root);assert.equal(b.manifest.contentSha256,receipt.plan.bundleHash);assert.equal(b.runtime.contentSha256,receipt.packageHash);assert.equal(daemon(),receipt.plan.daemonId);assert.deepEqual(volume(receipt.plan.resources,receipt.plan.nonce),receipt.certificate);assert.match(receipt.image,/^sha256:[a-f0-9]{64}$/);assert.equal(run(['image','inspect','--format','{{index .Config.Labels "irisops.portable.bundle"}}',receipt.image]).trim(),b.manifest.contentSha256);
  return operator({run,target:{image:receipt.image,packageHash:receipt.packageHash},artifactDirectory:join(b.root,'runtime'),runtimeProfile:b.runtimeProfile});
 }
 return {plan,prepare,installedOperator};
}
async function cli(){const [command,...args]=process.argv.slice(2);if(command==='verify'&&args.length===0){const b=await verifyBundle(rootDefault);console.log(JSON.stringify({verified:true,bundleHash:b.manifest.contentSha256,runtimeHash:b.runtime.contentSha256}));return;}const api=portable();
 if(command==='prepare-plan'&&args.length===2){const p=await api.plan(args[0]);await saveNew(args[1],p);console.log(JSON.stringify(p));}
 else if(command==='prepare'&&args.length===3)console.log(JSON.stringify(await api.prepare(await json(args[0]),args[1],args[2])));
 else if(command==='plan'&&args.length===3){const r=await json(args[0]),op=await api.installedOperator(r),p=await op.plan({name:r.plan.resources.name,port:Number(args[1]),certificateVolume:r.plan.resources.certificateVolume});await saveNew(args[2],p);console.log(JSON.stringify(p));}
 else if(command==='apply'&&args.length===4){const op=await api.installedOperator(await json(args[0]));console.log(JSON.stringify(await op.apply(await json(args[1]),args[2],args[3])));}
 else if(command==='plan-rollback'&&args.length===3){const op=await api.installedOperator(await json(args[0])),p=await op.rollbackPlan(await json(args[1]));await saveNew(args[2],p);console.log(JSON.stringify(p));}
 else if(command==='rollback'&&args.length===4){const op=await api.installedOperator(await json(args[0]));console.log(JSON.stringify(await op.rollback(await json(args[1]),args[2],args[3])));}
 else throw Error('Usage: verify | prepare-plan NAME OUT | prepare PLAN FINGERPRINT OUT | plan PREPARED PORT OUT | apply PREPARED PLAN FINGERPRINT OUT | plan-rollback PREPARED INSTALL_RECEIPT OUT | rollback PREPARED PLAN FINGERPRINT OUT');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)cli().catch(()=>{console.error('Portable pilot step failed; raw diagnostics suppressed. Inspect retained result files; do not retry blindly.');process.exitCode=1;});
