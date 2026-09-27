// Interactive local review installer. No credentials, trust changes or deletion.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {portable,verifyBundle,saveNew,namesFor} from './portable.mjs';
import {localOrigin,preflight} from './onboarding-preflight.mjs';

export function reviewInputs(root,name,port,output){
 root=resolve(root);output=resolve(output);namesFor(name);localOrigin(port);
 assert.ok(output!==root&&!output.startsWith(root+sep),'Keep receipts outside the immutable bundle');
 return {root,name,port,output};
}
export async function confirmPlan(plan,verb,ask,show){
 assert.match(plan.fingerprint,/^[a-f0-9]{64}$/);
 show(JSON.stringify(plan,null,2));
 const accepted=(await ask(`Review this exact plan. Type ${verb} to approve, or Enter to stop: `))===verb;
 return accepted;
}
export async function installReview({root,name,port,output,ask,show=console.log,api:provided,inspect=preflight,verify=verifyBundle}){
 ({root,name,port,output}=reviewInputs(root,name,port,output));
 await verify(root);const api=provided||portable({root});
 // Exact-create: never reuse another run's receipts or partially installed engine.
 await mkdir(output);
 const p=await api.plan(name);await saveNew(join(output,'prepare-plan.json'),p);
 if(!await confirmPlan(p,'PREPARE',ask,show))return {complete:false,phase:'preparation_declined'};
 await api.prepare(p,p.fingerprint,join(output,'prepared.json'));
 const prepared=JSON.parse(await readFile(join(output,'prepared.json'),'utf8'));
 const op=await api.installedOperator(prepared);
 const plan=await op.plan({name,port,certificateVolume:p.resources.certificateVolume});
 await saveNew(join(output,'install-plan.json'),plan);
 if(!await confirmPlan(plan,'INSTALL',ask,show))return {complete:false,phase:'installation_declined',retained:true};
 await op.apply(plan,plan.fingerprint,join(output,'installed.json'));
 const installed=JSON.parse(await readFile(join(output,'installed.json'),'utf8'));
 let checked;
 try{checked=await inspect({root,prepared,installed,output:join(output,'public-certificates')});}
 catch{
  // The engine exists now. Fail closed using its immutable ownership receipt,
  // not a guessed name. Retain data and partial evidence; never retry install.
  const stop=await op.rollbackPlan(installed);
  await saveNew(join(output,'preflight-stop-plan.json'),stop);
  await op.rollback(stop,stop.fingerprint,join(output,'preflight-stopped.json'));
  throw Error('Public certificate verification failed; owned engine suspended and stopped; evidence retained');
 }
 const result={complete:true,phase:'installed_read_only',url:checked.url,containerId:installed.containerId,trustInstalled:false,accountsCreated:false,targetsEnrolled:false};
 await saveNew(join(output,'review-install.json'),result);
 show(JSON.stringify(result,null,2));
 show('Installation is READ_ONLY, not configured for writes. Continue with JUDGE-GUIDE.md: public CA, native identity, explicit target enrollment. Never use production credentials.');
 return result;
}
export async function stopReview({root,output,ask,show=console.log,api:provided}){
 const prepared=JSON.parse(await readFile(join(output,'prepared.json'),'utf8'));
 const installed=JSON.parse(await readFile(join(output,'installed.json'),'utf8'));
 const api=provided||portable({root}),op=await api.installedOperator(prepared);
 const plan=await op.rollbackPlan(installed);
 // Every invocation uses a newly validated plan and an exclusive receipt folder.
 // Declined, expired and failed attempts must remain inspectable, not block retry.
 const attempt=await mkdtemp(join(output,'review-stop-attempt-'));
 await saveNew(join(attempt,'plan.json'),plan);
 show('Stop attempt receipts: '+attempt);
 if(!await confirmPlan(plan,'STOP',ask,show))return {complete:false,phase:'stop_declined'};
 return op.rollback(plan,plan.fingerprint,join(attempt,'stopped.json'));
}
async function cli(){
 assert.ok(process.stdin.isTTY&&process.stdout.isTTY,'Use an interactive terminal; never pipe automatic confirmation');
 const root=dirname(fileURLToPath(import.meta.url)),[command,...args]=process.argv.slice(2);
 assert.ok((command==='install'&&args.length===3)||(command==='stop'&&args.length===1),'Usage: node review.mjs install NAME PORT NEW_RECEIPT_DIRECTORY | stop RECEIPT_DIRECTORY');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{const ask=q=>rl.question(q);if(command==='install')await installReview({root,name:args[0],port:Number(args[1]),output:args[2],ask});else await stopReview({root,output:resolve(args[0]),ask});}
 finally{rl.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)cli().catch(()=>{console.error('Review setup stopped. No automatic retry or deletion. Inspect retained receipts and JUDGE-GUIDE.md; raw diagnostics suppressed to avoid secrets.');process.exitCode=1;});
