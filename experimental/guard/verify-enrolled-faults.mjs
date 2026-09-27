// Called only after the NEW clean installation has passed its normal browser gate.
// Test-only subclasses are installed separately; the distributed runtime is not replaced.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {sha256} from './package/build.mjs';

export async function runEnrolledFaults(t){
 const {id,run,term,call,request,preview,execute,reconnect,restore,native,expected,pass,check,receipts}=t;
 const helpers=['TestExecution','WebTestExecution','FaultApi','WebFaultApi','ManagedNextApi','TestDeployment'];
 const helperHashes=[];let complete=false,phase='helpers',restored=false;
 const faultCases=[];
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const plan=()=>call('##class(IrisOps.Guard.Deployment).Plan()');
 function attempt(expression){const s=term(['try { set r='+expression+' write "RESULT=",r.%ToJSON(),! } catch e { write "EXPECTED_ERROR=",e.Name,! }']);const e=s.match(/EXPECTED_ERROR=([A-Za-z0-9_]+)/);if(e)return {error:e[1]};const m=s.match(/RESULT=(\{.*\})/);assert.ok(m);return JSON.parse(m[1]);}
 const apply=(mode,build='managed-lab-a',fingerprint=plan().fingerprint,cls='Deployment')=>attempt(`##class(IrisOps.Guard.${cls}).Apply("${fingerprint}","${mode}","${build}")`);
 function transition(mode,build='managed-lab-a'){const r=apply(mode,build);assert.equal(r.error,undefined);assert.equal(r.mode,mode);assert.equal(r.build,build);return r;}
 function clear(){term(['kill ^IrisOpsGuardBoot("executionFault"),^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback"),^IrisOpsGuardBoot("webFault"),^IrisOpsGuardBoot("webDenyReadback"),^IrisOpsGuardBoot("auditFault"),^IrisOpsGuardBoot("deploymentFault")']);}
 function counter(){const s=term(['write "COUNTS=",$get(^IrisOpsGuardBoot("observedPuts"),0),"|",$get(^IrisOpsGuardBoot("webPuts"),0),!']);const m=s.match(/COUNTS=(\d+)\|(\d+)/);assert.ok(m);return [+m[1],+m[2]];}
 function appHash(){const s=term(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'set key="",obj={}','for { set key=$order(p(key)) quit:key=""  do obj.%Set(key,p(key)) }','write "HASH=",$system.Encryption.ToHex($system.Encryption.SHAHash(256,obj.%ToJSON())),!'],'%SYS');return s.match(/HASH=([A-F0-9]{64})/)[1];}
 function dispatcher(name){term([`set p("DispatchClass")="${name}"`,'set sc=##class(Security.Applications).Modify("/api/admin",.p)',check],'%SYS');}
 const recover=(kind,p,record=false)=>request('/'+kind+'/operations/'+p.id+(record?'/reconcile':'/inspect'),'POST',{recoveryKey:p.recoveryKey});
 function receiptHashes(){const s=term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set id=q.%Get("OperationId"),r=##class(IrisOps.Guard.Receipt).%OpenId(id) write "ROW=",id,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,r.Public().%ToJSON())),! }']);return new Map([...s.matchAll(/ROW=([a-f0-9]{32})\|([A-Fa-f0-9]{64})/g)].map(m=>[m[1],m[2]]));}
 function nativeExpected(kind,wrote){const e={...expected};if(wrote){if(kind==='wallet')e.use=t.proposed.UseResource.toUpperCase();else e.web='1|Owned enrollment fixture';}assert.deepEqual(native(),e);}
 async function newPreview(kind){await reconnect();const r=await preview(kind);assert.equal(r.status,200);return r.body;}
 const originalAdminHash=appHash(),historical=receiptHashes();
 const originalDispatcher=term(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "DISPATCH=",p("DispatchClass"),!'],'%SYS').match(/DISPATCH=([^\r\n]+)/)[1].trim();assert.equal(originalDispatcher,'%Api.Admin');
 transition('SUSPENDED');
 try{
  for(const name of [...helpers,'CountingAdmin']){
   const file='IrisOps.Guard.'+name+'.cls',src=resolve('experimental/guard/'+file);helperHashes.push({path:file,sha256:sha256(await readFile(src))});
   run(['cp',src,id+':/tmp/'+file]);term(['set sc=$system.OBJ.Load("/tmp/'+file+'","ck")',check],name==='CountingAdmin'?'%SYS':'IRISOPS');
  }
  clear();dispatcher('IrisOps.Guard.CountingAdmin');transition('READ_ONLY');
  phase='replacement';const old=plan();assert.equal(apply('READ_ONLY').generation,old.generation);assert.equal(apply('ACTIVE','managed-lab-a','0'.repeat(64)).error,'stale_deployment_plan');assert.equal(plan().mode,'READ_ONLY');
  assert.equal(apply('READ_ONLY','managed-lab-b').error,'suspend_before_replacement');transition('SUSPENDED');transition('READ_ONLY','managed-lab-b');await reconnect();
  const noWrites=counter();for(const p of receipts){const r=await recover(p.kind,p);assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');}assert.deepEqual(counter(),noWrites);
  pass('new dispatcher requires suspension, preserves prior receipts and starts read-only; stale plan and unsuspended replacement refused');
  transition('ACTIVE','managed-lab-b');
  phase='interruption matrix';
  for(const kind of ['wallet','webapp']){
   for(const fault of ['crash_before','crash_after','final_save','readback']){
    restore();clear();const p=await newPreview(kind),before=counter();
    const flag=kind==='webapp'?'webFault':fault==='readback'?'walletFault':'executionFault';term([`set ^IrisOpsGuardBoot("${flag}")="${fault}"`]);
    let r;try{r=await execute(kind,p);}catch{r={status:0};}
    if(fault.startsWith('crash_'))assert.ok(term([`write "INTERRUPTED=",$get(^IrisOpsGuardBoot("interruption","${p.id}")),!`]).includes('INTERRUPTED='+(fault==='crash_before'?'before_dispatch':'after_dispatch')));
    else if(fault==='final_save'){assert.equal(r.status,503);assert.equal(r.body.state,'RECEIPT_INCOMPLETE');}
    else{assert.equal(r.status,200);assert.equal(r.body.state,'UNKNOWN');}
    clear();const count=counter(),wanted=[...before];if(fault!=='crash_before')wanted[kind==='wallet'?0:1]++;assert.deepEqual(count,wanted);nativeExpected(kind,fault!=='crash_before');
    // Retry the exact captured request BEFORE reconnecting: tests the durable
    // reservation, not merely the different-session binding rejection below.
    const sameSessionReplay=await execute(kind,p);assert.ok([200,401,404].includes(sameSessionReplay.status));if(sameSessionReplay.status===200)assert.equal(sameSessionReplay.body.state,'UNKNOWN');assert.deepEqual(counter(),count);
    await reconnect();r=await recover(kind,p);assert.equal(r.status,200);const original=r.body.receipt;assert.equal(original.state,'UNKNOWN');assert.equal(r.body.currentObservation.outcome,fault==='crash_before'?'MATCHES_BEFORE':'MATCHES_EXPECTED');assert.equal(r.body.administrativeWrites,0);
    for(let i=0;i<2;i++){const later=await recover(kind,p,true);assert.equal(later.status,200);assert.equal(later.body.receipt.state,'UNKNOWN');assert.deepEqual(later.body.receipt.events,original.events);assert.equal(later.body.administrativeWrites,0);}
    assert.equal((await execute(kind,p)).status,404);
    const denied=await request('/'+kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:'0'.repeat(64)});assert.equal(denied.status,404);assert.equal(denied.body.receipt,undefined);
    assert.deepEqual(counter(),count);restore();r=await recover(kind,p);assert.equal(r.status,200);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.receipt.state,'UNKNOWN');assert.deepEqual(counter(),count);
    receipts.push({kind,...p});faultCases.push({kind,fault,id:p.id,observedPuts:count[kind==='wallet'?0:1]-before[kind==='wallet'?0:1],originalState:'UNKNOWN',sameSessionReplayStatus:sameSessionReplay.status,replayed:false,fixtureRestored:true});
    pass(kind+' '+fault+': native PUT count verified; read-only recovery preserves uncertainty; replay denied; fixture restored');
   }
  }
  phase='concurrent transition';clear();const pendingPreview=await newPreview('wallet'),before=counter(),fence=plan().fingerprint;
  term(['set ^IrisOpsGuardBoot("auditFault")="hold_reservation"']);const pending=execute('wallet',pendingPreview);let waiting=false;
  for(let i=0;i<30;i++){await delay(80);const s=term([`set r=##class(IrisOps.Guard.Receipt).%OpenId("${pendingPreview.id}") write "WAIT=",$select($isobject(r):r.State,1:""),!`]);if(s.includes('WAIT=DISPATCHING')){waiting=true;break;}}
  assert.ok(waiting);assert.equal(apply('SUSPENDED','managed-lab-b',fence).error,'deployment_busy');assert.equal((await pending).body.state,'VERIFIED');clear();assert.deepEqual(counter(),[before[0]+1,before[1]]);restore();
  pass('real in-flight operation holds deployment lock; concurrent suspension returns busy without interrupting or duplicating the write');
  phase='return to production dispatcher';transition('SUSPENDED','managed-lab-b');transition('READ_ONLY');await reconnect();const beforeRecovery=counter();
  for(const p of receipts){const r=await recover(p.kind,p);assert.equal(r.status,200);assert.equal(r.body.administrativeWrites,0);}assert.deepEqual(counter(),beforeRecovery);
  pass('rollback to original dispatcher retains verified and uncertain receipts; read-only recovery sends no native PUT');
  phase='interrupted activation';transition('SUSPENDED');term(['set ^IrisOpsGuardBoot("deploymentFault")="crash"']);const p=plan();term([`set r=##class(IrisOps.Guard.TestDeployment).Apply("${p.fingerprint}","READ_ONLY","managed-lab-a")`]);clear();
  assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'TRANSITION');assert.notEqual((await request('/capabilities')).status,200);
  const fingerprint=term(['write "FINGERPRINT=",##class(IrisOps.Guard.Deployment).Fingerprint(),!']).match(/FINGERPRINT=([A-F0-9]{64})/)[1];
  assert.equal(attempt('##class(IrisOps.Guard.Deployment).RecoverInterrupted("'+'0'.repeat(64)+'")').error,'stale_deployment_plan');assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'TRANSITION');
  assert.equal(call(`##class(IrisOps.Guard.Deployment).RecoverInterrupted("${fingerprint}")`).mode,'SUSPENDED');assert.notEqual((await request('/capabilities')).status,200);
  pass('actual activation-worker exit leaves service unavailable; stale recovery denied; explicit recovery only suspends');
  phase='activation exception';assert.equal(apply('READ_ONLY','managed-lab-a',plan().fingerprint,'TestDeployment').error,'synthetic_activation_failure');assert.equal(plan().mode,'SUSPENDED');assert.notEqual((await request('/capabilities')).status,200);
  transition('READ_ONLY');await reconnect();for(const p of receipts){const r=await recover(p.kind,p);assert.equal(r.status,200);assert.equal(r.body.administrativeWrites,0);}assert.deepEqual(counter(),beforeRecovery);
  const after=receiptHashes();for(const [id,hash] of historical)assert.equal(after.get(id),hash);restore();
  pass('activation exception fails closed; all pre-existing public receipt hashes remain unchanged');
  phase='instrumented restart';const beforeRestart=receiptHashes(),generation=plan().generation;run(['restart','--time','20',id]);let ready=false;
  for(let i=0;i<90;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await delay(500);}assert.ok(ready);assert.equal(plan().mode,'READ_ONLY');assert.equal(plan().generation,generation);assert.deepEqual(counter(),[0,0]);await reconnect();
  for(const p of receipts){const r=await recover(p.kind,p);assert.equal(r.status,200);assert.equal(r.body.administrativeWrites,0);assert.equal((await execute(p.kind,p)).status,403);}
  // Even deliberately reactivated service must not replay pre-restart approvals.
  transition('ACTIVE');await reconnect();for(const p of receipts)assert.equal((await execute(p.kind,p)).status,404);
  assert.deepEqual(counter(),[0,0]);assert.deepEqual(native(),expected);const afterRestart=receiptHashes();assert.deepEqual(afterRestart,beforeRestart);transition('READ_ONLY');
  pass('instrumented real restart preserves all receipt hashes; recovery and old execute requests cause zero actual native PUTs even after explicit reactivation');complete=true;phase='complete';
 }finally{
  clear();restore();dispatcher(originalDispatcher);assert.equal(appHash(),originalAdminHash);
  const s=call('##class(IrisOps.Guard.Deployment).State()');if(s.mode==='TRANSITION'){const f=term(['write "FINGERPRINT=",##class(IrisOps.Guard.Deployment).Fingerprint(),!']).match(/FINGERPRINT=([A-F0-9]{64})/)[1];call(`##class(IrisOps.Guard.Deployment).RecoverInterrupted("${f}")`);}
  const current=plan();if(current.build!=='managed-lab-a')transition('SUSPENDED',current.build);transition('READ_ONLY');
  assert.deepEqual(native(),expected);restored=true;
  await t.save({complete,phase,helperHashes,faultCases,nativeAdminRestored:restored,testClassesDistributed:false,scope:'two enrolled workflows and dispatcher transitions; not a database schema upgrade'});
 }
}
