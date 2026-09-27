import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {X509Certificate,createHash} from 'node:crypto';
import {operator} from './pilot-install.mjs';
import {makePlan} from './pilot-plan.mjs';
import {runFreshCacheUi} from './verify-fresh-cache-ui.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);const trial=process.argv[2];assert.match(trial||'',/^[a-z]$/);
const dir=new URL('./',import.meta.url),p=JSON.parse(await readFile(new URL('pilot-guided-a.plan.json',dir),'utf8')),receipt=JSON.parse(await readFile(new URL('pilot-guided-a.receipt.json',dir),'utf8'));
assert.equal(receipt.complete,true);const id=receipt.containerId,checks=[],op=operator();let complete=false;
const run=(args,input)=>{try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Isolated test command failed; raw output suppressed');}};
const state=()=>run(['inspect','--format','{{.Id}}|{{.State.Running}}',id]).trim();const before=state();assert.equal(before,id+'|true');
const original=run(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim();assert.equal(original,'d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38|true');
const reportName='guided-negative-'+trial+'.json',never=new URL('must-not-exist-'+trial+'.json',dir);await assert.rejects(access(never));
const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 await assert.rejects(op.apply(p,'wrong',never));await assert.rejects(access(never));pass('wrong confirmation rejected before mutation/output creation');
 const expired=makePlan(p.config,p.observed,{now:Date.now()-900001,nonce:p.nonce});await assert.rejects(op.apply(expired,expired.fingerprint,never));await assert.rejects(access(never));pass('expired plan rejected before mutation/output creation');
 await assert.rejects(op.apply(p,p.fingerprint,never));await assert.rejects(access(never));pass('replayed valid install plan refused because owned container/volume now exist');
 await assert.rejects(op.plan({...p.config,name:'irisops-pilot-guided-port-conflict-'+trial}));pass('new installation name with occupied 52805 port rejected');
 await assert.rejects(op.rollbackPlan({...receipt,plan:{...p,nonce:'0'.repeat(32)}}));pass('tampered installation receipt rejected before rollback');
 const r=await op.rollbackPlan(receipt);await assert.rejects(op.rollback(r,'wrong',never));await assert.rejects(access(never));pass('unconfirmed rollback leaves running installation untouched');
 assert.equal(state(),before);assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}','iris-ops-guard-dev-20260925']).trim(),original);
 const leaf=run(['exec',id,'cat','/run/irisops-tls/server.crt']),spki=createHash('sha256').update(new X509Certificate(leaf).publicKey.export({type:'spki',format:'der'})).digest('base64');const manifest=JSON.parse(await readFile(new URL('../../../../irisops-guard-tls-package-20260926-m/manifest.json',import.meta.url),'utf8'));
 await runFreshCacheUi({origin:'https://127.0.0.1:'+p.config.port,tlsSpki:spki,manifest,suffix:'guided-'+trial,pass});complete=true;
}finally{assert.equal(state(),before);await writeFile(new URL(reportName,dir),JSON.stringify({complete,checks,containerId:id,originalPreserved:true,credentialsEntered:false},null,2)+'\n',{flag:'wx'});}
