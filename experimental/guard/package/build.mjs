import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const runtimeNames=['Api','Transport','Protocol','Vault','HttpTransport','Execution','Recovery','Receipt','HttpApi','WebTransport','WebExecution','WebRecovery','WebApi','CombinedApi','ManagedApi','Deployment','TargetPolicy','RoleTransport','RoleExecution','RoleRecovery','RoleApi'];
const roleNames=new Set(['RoleTransport','RoleExecution','RoleRecovery','RoleApi']);
export const userRuntimeNames=['UserTransport','UserExecution','UserRecovery','UserApi'];
// Versioned, exact inventories: adding a runtime file requires an explicit profile change.
export function runtimePaths(profile){
 if(!['fixed-targets-v1','enrolled-targets-v1','enrolled-role-v1','enrolled-user-v1'].includes(profile))throw Error('Unknown runtime profile');
 const names=profile==='enrolled-user-v1'?[...runtimeNames,...userRuntimeNames]:profile==='fixed-targets-v1'?runtimeNames.filter(n=>n!=='TargetPolicy'&&!roleNames.has(n)):profile==='enrolled-targets-v1'?runtimeNames.filter(n=>!roleNames.has(n)):runtimeNames;
 return [...names.map(n=>'classes/IrisOps.Guard.'+n+'.cls'),'bootstrap/IrisOps.Guard.Bootstrap.cls','Dockerfile','tls/httpd-local.conf','ui/guard-managed/web/index.html',
 ...['api.js','app.js','combined-guard.js','explorer.js','native-logs.js','operations.js','rest-discovery.js','sanitization.js','startup.js','styles.css','wallet-guard.js','wallet-policy.js'].map(n=>'ui/guard-managed/web/assets/'+n),
 ...['client.js','contracts.js','recovery-store.js','session.js'].map(n=>'ui/guard-managed/experimental/guard/ui/'+n)].sort();
}
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function manifestFor(files){
 const entries=[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>{
  if(!/^[A-Za-z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw Error('Unsafe package path');
  return {path,bytes:bytes.length,sha256:sha256(bytes)};
 });
 if(new Set(entries.map(e=>e.path)).size!==entries.length)throw Error('Duplicate package path');
 return {schema:1,version:'clean-install-lab-1',experimental:true,productionReady:false,contentSha256:sha256(JSON.stringify(entries)),entries};
}
export async function build(destination,{tls=false,users=false}={}){
 if(typeof tls!=='boolean')throw Error('Invalid TLS profile');
 const root=fileURLToPath(new URL('../../../',import.meta.url)),parent=dirname(root.replace(/[\\/]$/,''));
 destination=resolve(destination);const rel=relative(parent,destination);
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||dirname(destination)!==parent)throw Error('Package must be a new sibling of the checkout');
 if(typeof users!=='boolean')throw Error('Invalid user profile');
 const files=[];
 for(const name of [...runtimeNames,...(users?userRuntimeNames:[])])files.push(['classes/IrisOps.Guard.'+name+'.cls',await readFile(join(root,'experimental/guard/IrisOps.Guard.'+name+'.cls'))]);
 for(const [source,target] of [['package/IrisOps.Guard.Bootstrap.cls','bootstrap/IrisOps.Guard.Bootstrap.cls'],[tls?'package/Dockerfile.tls':'package/Dockerfile','Dockerfile']])files.push([target,await readFile(join(root,'experimental/guard',source))]);
 if(tls)files.push(['tls/httpd-local.conf',await readFile(join(root,'experimental/guard/package/tls/httpd-local.conf'))]);
 files.push(['ui/guard-managed/web/index.html',await readFile(join(root,'web/index.html'))]);
 for(const name of await readdir(join(root,'web/assets'))){
  if(!/^[A-Za-z0-9_.-]+$/.test(name))throw Error('Unexpected asset name');
  files.push(['ui/guard-managed/web/assets/'+name,await readFile(join(root,'web/assets',name))]);
 }
 for(const name of ['client.js','contracts.js','recovery-store.js','session.js'])files.push(['ui/guard-managed/experimental/guard/ui/'+name,await readFile(join(root,'experimental/guard/ui',name))]);
 const manifest=manifestFor(files);
 // Refuse replacing an existing artifact. Every write is inside this new root.
 await mkdir(destination);
 for(const [name,bytes] of files){const path=join(destination,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});}
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 for(const entry of manifest.entries)if(sha256(await readFile(join(destination,entry.path)))!==entry.sha256)throw Error('Package readback mismatch');
 return {destination,files:manifest.entries.length,contentSha256:manifest.contentSha256,productionReady:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length<3||process.argv.length>4||(process.argv[3]&&process.argv[3]!=='--tls'))throw Error('Pass a new sibling artifact directory, optionally --tls');
 console.log(JSON.stringify(await build(process.argv[2],{tls:process.argv[3]==='--tls'})));
}
