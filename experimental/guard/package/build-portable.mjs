import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {candidate} from './pilot-plan.mjs';
import {sha256,manifestFor} from './build.mjs';
import {base,verifyBundle,safePath} from './portable.mjs';

export async function buildPortable(destination){
 const here=fileURLToPath(new URL('./',import.meta.url)),checkout=resolve(here,'../../..'),parent=dirname(checkout),source=await realpath(join(parent,'irisops-guard-tls-package-20260926-m'));
 destination=resolve(destination);assert.equal(dirname(destination),parent);assert.match(destination.slice(parent.length+1),/^irisops-guard-portable-[a-z0-9-]+$/);
 const reference=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));assert.equal(reference.entries.length,36);assert.equal(reference.contentSha256,candidate.packageHash);assert.equal(sha256(JSON.stringify(reference.entries)),candidate.packageHash);
 const runtime=[];for(const e of reference.entries){safePath(e.path);const path=await realpath(join(source,e.path));assert.ok(path.startsWith(source+sep));let bytes=await readFile(path);assert.equal(bytes.length,e.bytes);assert.equal(sha256(bytes),e.sha256);if(e.path==='Dockerfile'){const content=bytes.toString('utf8');assert.equal(content.split(/\r?\n/).filter(l=>l.startsWith('FROM ')).join(''),'FROM intersystemsdc/iris-community:2026.2-zpm');bytes=Buffer.from(content.replace('FROM intersystemsdc/iris-community:2026.2-zpm','FROM '+base));}runtime.push([e.path,bytes]);}
 const runtimeManifest=manifestFor(runtime),files=runtime.map(([path,bytes])=>['runtime/'+path,bytes]);files.push(['runtime/manifest.json',Buffer.from(JSON.stringify(runtimeManifest,null,2)+'\n')]);
 for(const name of ['portable.mjs','pilot-install.mjs','pilot-plan.mjs','build.mjs'])files.push([name,await readFile(join(here,name))]);
 files.push(['README.md',await readFile(join(here,'portable-operator-guide.md'))],['LICENSE',await readFile(join(checkout,'LICENSE'))]);
 const bundle={...manifestFor(files),version:'portable-pilot-1',base};assert.equal(bundle.entries.length,43);
 await mkdir(destination);for(const [path,bytes] of files){const target=join(destination,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});}await writeFile(join(destination,'bundle.json'),JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
 await verifyBundle(destination);return {destination,bundleHash:bundle.contentSha256,runtimeHash:runtimeManifest.contentSha256,files:43,productionReady:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert.equal(process.argv.length,3);console.log(JSON.stringify(await buildPortable(process.argv[2])));}
