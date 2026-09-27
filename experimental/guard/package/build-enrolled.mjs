// Independent current-source bundle. Never retarget the historical m/c builder or archives.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build,sha256,manifestFor,runtimePaths} from './build.mjs';
import {base,verifyBundle,exactRuntimeInventory} from './portable.mjs';

export async function buildEnrolled(destination,{users=false,review=false}={}){
 assert.equal(typeof users,'boolean');
 assert.equal(typeof review,'boolean');assert.ok(!review||users,'Review package requires all four bounded workflows');
 const here=fileURLToPath(new URL('./',import.meta.url)),checkout=resolve(here,'../../..'),parent=dirname(checkout);
 destination=resolve(destination);assert.equal(dirname(destination),parent);assert.match(destination.slice(parent.length+1),/^irisops-guard-enrolled-[a-z0-9-]+$/);
 try{await access(destination);throw Error('Destination exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const source=destination+'-runtime-source';await build(source,{tls:true,users});
 const reference=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));exactRuntimeInventory(reference.entries.map(e=>e.path),runtimePaths(users?'enrolled-user-v1':'enrolled-role-v1'));assert.equal(sha256(JSON.stringify(reference.entries)),reference.contentSha256);
 const runtime=[];for(const e of reference.entries){let bytes=await readFile(join(source,e.path));assert.equal(bytes.length,e.bytes);assert.equal(sha256(bytes),e.sha256);if(e.path==='Dockerfile'){const content=bytes.toString('utf8');assert.equal(content.split(/\r?\n/).filter(l=>l.startsWith('FROM ')).join(''),'FROM intersystemsdc/iris-community:2026.2-zpm');bytes=Buffer.from(content.replace('FROM intersystemsdc/iris-community:2026.2-zpm','FROM '+base));}runtime.push([e.path,bytes]);}
 const runtimeManifest=manifestFor(runtime),files=runtime.map(([path,bytes])=>['runtime/'+path,bytes]);files.push(['runtime/manifest.json',Buffer.from(JSON.stringify(runtimeManifest,null,2)+'\n')]);
 for(const name of ['portable.mjs','pilot-install.mjs','pilot-plan.mjs','build.mjs'])files.push([name,await readFile(join(here,name))]);
 files.push(['README.md',await readFile(join(here,'enrolled-operator-guide.md'))],['LICENSE',await readFile(join(checkout,'LICENSE'))]);
 if(review)for(const [source,target] of [['review.mjs','review.mjs'],['onboarding-preflight.mjs','onboarding-preflight.mjs'],['judge-guide.md','JUDGE-GUIDE.md']])files.push([target,await readFile(join(here,source))]);
 const count=(users?52:48)+(review?3:0);
 const bundle={...manifestFor(files),version:review?'portable-enrolled-user-review-1':users?'portable-enrolled-user-pilot-1':'portable-enrolled-role-pilot-1',base};assert.equal(bundle.entries.length,count);
 await mkdir(destination);for(const [path,bytes] of files){const target=join(destination,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}await writeFile(join(destination,'bundle.json'),JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
 await verifyBundle(destination);return {destination,bundleHash:bundle.contentSha256,runtimeHash:runtimeManifest.contentSha256,files:count,productionReady:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.ok(process.argv.length===3||(process.argv.length===4&&['--users','--review'].includes(process.argv[3])));console.log(JSON.stringify(await buildEnrolled(process.argv[2],{users:['--users','--review'].includes(process.argv[3]),review:process.argv[3]==='--review'})));}
