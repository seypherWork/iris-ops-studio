// Fault ONLY in this test adapter. Installer/runtime has no fault switch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {operator} from './pilot-install.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE,trial=process.argv[2];assert.ok(docker);assert.match(trial||'',/^[a-z]$/);
const name='irisops-pilot-guided-failure-'+trial,dir=new URL('./',import.meta.url),receiptPath=fileURLToPath(new URL('guided-failure-'+trial+'.receipt.json',dir));
let injected=false,bootstrapCalls=0;
function raw(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Isolated command failed; raw diagnostics suppressed');}}
const op=operator({run(args,input){if(input?.includes('$system.OBJ.Load('))bootstrapCalls++;if(args[0]==='exec'&&args[2]==='sha256sum'&&!injected){injected=true;throw Error('synthetic pre-bootstrap interruption');}return raw(args,input);}});
const original=raw(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim();assert.equal(original,'d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38|true');
const p=await op.plan({name,port:52806,certificateVolume:'irisops-guard-startup-20260926-e-cert-private'});await writeFile(new URL('guided-failure-'+trial+'.plan.json',dir),JSON.stringify(p,null,2)+'\n',{flag:'wx'});
await assert.rejects(op.apply(p,p.fingerprint,receiptPath),/installation_failed_preserved/);assert.equal(injected,true);assert.equal(bootstrapCalls,0);
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));assert.equal(receipt.complete,false);assert.equal(receipt.phase,'verify_image_TLS');assert.equal(raw(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',receipt.containerId]).trim(),'false|0');assert.equal(raw(['volume','inspect','--format','{{index .Labels "irisops.pilot.owner"}}',name+'-data']).trim(),p.nonce);
const events=(await readFile(receiptPath+'.events.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.ok(events.some(e=>e.phase==='failed_instance_stopped'&&e.id===receipt.containerId));
assert.equal(raw(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim(),original);
await writeFile(new URL('guided-failure-'+trial+'.result.json',dir),JSON.stringify({complete:true,expectedInstallationFailure:true,injectedPhase:'first image hash before native bootstrap',containerId:receipt.containerId,stopped:true,exitCode:0,bootstrapCalls,volumeRetained:true,eventJournalVerified:true,originalPreserved:true},null,2)+'\n',{flag:'wx'});
console.log('PASS injected pre-bootstrap failure stops only the owned new engine, retains data and records durable evidence; original preserved');
