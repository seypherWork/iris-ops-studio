// Reuse only the known, stopped, retained fault lab. Restore it to stopped.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {portable,saveNew} from './portable.mjs';
import {assertOwned,validatePlan} from './pilot-plan.mjs';
import {preflight} from './onboarding-preflight.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);assert.equal(process.argv.length,3);
const out=resolve(process.argv[2]),root=resolve('../irisops-enrolled-extracted-20260927-a'),evidence=resolve('../irisops-enrolled-clean-20260927-c');
const installed=JSON.parse(await readFile(join(evidence,'installed.json'),'utf8')),prepared=JSON.parse(await readFile(join(evidence,'prepared.json'),'utf8'));
assert.equal(installed.complete,true);assert.equal(installed.containerId,'a520628da67fa13142e10f76e2ec743e665bffbb06cc5bf7b6726f2d8a3ebd05');
const id=installed.containerId,run=(args,input)=>{try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:1024*1024});}catch{throw Error('Owned lab command failed; raw output suppressed');}};
const original=run(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim();assert.equal(original,'d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38|true');
await portable({root,run}).installedOperator(prepared);
const fmt='{"Id":{{json .Id}},"Name":{{json .Name}},"Image":{{json .Image}},"Config":{"Labels":{"irisops.pilot.owner":{{json (index .Config.Labels "irisops.pilot.owner")}}},"Env":[{{range .Config.Env}}{{if eq . "ISC_DATA_DIRECTORY=/durable/iris"}}{{json .}}{{end}}{{end}}]},"HostConfig":{"Privileged":{{json .HostConfig.Privileged}},"NetworkMode":{{json .HostConfig.NetworkMode}},"PortBindings":{{json .HostConfig.PortBindings}}},"Mounts":{{json .Mounts}},"State":{"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}}}}';
function inspect(){const c=JSON.parse(run(['inspect','--format',fmt,id]));const target={image:prepared.image,packageHash:prepared.packageHash};validatePlan(installed.plan,installed.plan.fingerprint,{now:installed.plan.createdAt,target});assertOwned(c,installed.plan,id,target);return c;}
assert.equal(inspect().State.Running,false);let started=false,complete=false,untrustedBrowserRejected=false,report;
try{
 run(['start',id]);started=true;assert.equal(inspect().State.Running,true);
 let ready=false;for(let i=0;i<90;i++){try{const s=run(['exec','-i',id,'iris','session','IRIS','-U','IRISOPS'],'write "READY",!\nhalt\n');if(s.includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 report=await preflight({root,prepared,installed,output:out,run});assert.equal(report.deployment.mode,'SUSPENDED');
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
 try{const page=await browser.newPage();let reason='';try{await page.goto(report.url,{timeout:15000});}catch(e){reason=String(e.message);}assert.ok(reason.includes('ERR_CERT_AUTHORITY_INVALID'),'Untrusted browser must reject the local CA');untrustedBrowserRejected=true;}finally{await browser.close();}
 complete=true;
}finally{
 if(started){inspect();run(['stop','--timeout','30',id]);assert.equal(inspect().State.Running,false);assert.equal(inspect().State.ExitCode,0);}
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim(),original);
 if(report)await saveNew(join(out,'validation.json'),{complete,untrustedBrowserRejected,containerId:id,mode:report.deployment.mode,restoredStopped:true,originalIdentityPreserved:true,trustInstalled:false,accountsChanged:false,credentialsRead:false});
}
console.log(JSON.stringify({complete,untrustedBrowserRejected,restoredStopped:true,trustInstalled:false}));
