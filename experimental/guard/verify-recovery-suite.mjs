// Called only by the pinned, collision-checked wallet runner. Never standalone.
import assert from 'node:assert/strict';
export async function runRecoverySuite(t){
 const {request,reconnect,freshSession,freshObserver,channel,enable,preview,execute,record,native,same,counter,change,terminal,pass,run,container,origin,user,role,password,initial,proposed,userResources,check}=t;
 const clear=()=>change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback"),^IrisOpsGuardBoot("executionFault")'],'IRISOPS');
 const recover=(id,mode='reconcile',h)=>request('/operations/'+id+'/'+mode,'POST',{recoveryKey:t.recoveryKeys.get(id)},h);
 const flag=value=>change([`set ^IrisOpsGuardBoot("executionFault")="${value}"`],'IRISOPS');
 const dispatcher=value=>change([`set p("DispatchClass")="${value}"`,'set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
 async function prepare(){await reconnect();const c=await channel();await enable(c);return preview(c);}
 let p=await prepare();change(['set ^IrisOpsGuardBoot("walletFault")="readback"'],'IRISOPS');let r=await execute(p);assert.equal(r.body.state,'UNKNOWN');record(r);clear();
 const original=r.body, originalEvents=JSON.stringify(original.events),n=counter();
 r=await recover(p.id);assert.equal(r.status,200);assert.equal(r.body.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(r.body.receipt.state,'UNKNOWN');assert.equal(JSON.stringify(r.body.receipt.events),originalEvents);assert.equal(counter(),n);
 r=await recover(p.id);assert.equal(r.body.receipt.rechecks.length,2);assert.equal(counter(),n);pass('reconciliation appends observations without rewriting UNKNOWN or resending PUT');
 const snapshot=JSON.stringify(r.body.receipt);
 for(const bad of ['', '0'.repeat(64), 'f'.repeat(63), 'F'.repeat(64)]){
  for(const mode of ['inspect','reconcile']){
   const denied=await request('/operations/'+p.id+'/'+mode,'POST',{recoveryKey:bad});
   assert.equal(denied.status,404);assert.equal(denied.body.receipt,undefined);
  }
  assert.equal((await request('/operations/'+p.id,'GET',undefined,{...t.controls(),'X-IrisOps-Recovery-Key':bad})).status,404);
  assert.equal((await request('/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:bad})).status,404);
 }
 const otherKey=[...t.recoveryKeys].find(([id])=>id!==p.id)[1];
 assert.equal((await request('/operations/'+p.id+'/inspect','POST',{recoveryKey:otherKey})).status,404);
 assert.equal((await request('/operations/'+p.id+'/inspect','POST',{})).status,400);
 assert.equal((await request('/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey,extra:'x'})).status,400);
 assert.equal(JSON.stringify((await recover(p.id,'inspect')).body.receipt),snapshot);assert.equal(counter(),n);
 pass('missing, wrong, malformed and cross-operation keys deny every receipt path without changes');
 await native('PUT',initial);let afterExternal=counter();r=await recover(p.id);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(counter(),afterExternal);
 await native('PUT',{...proposed,EditResource:proposed.UseResource.replace(':READ',':WRITE')});afterExternal=counter();r=await recover(p.id);assert.equal(r.body.currentObservation.outcome,'DIFFERS');assert.equal(r.body.receipt.state,'UNKNOWN');assert.equal(counter(),afterExternal);await native('PUT',initial);pass('later original/different states are observations, not attributed execution outcomes');
 let before=counter();const h=t.controls();
 for(const headers of [{...h,'X-IrisOps-CSRF':'wrong'},{...h,Origin:'https://foreign.invalid'},{Cookie:h.Cookie,'Content-Type':'application/json'}]){
  for(const mode of ['inspect','reconcile'])assert.equal((await recover(p.id,mode,headers)).status,403);
 }
 assert.equal((await request('/operations/'+p.id+'/reconcile','POST',{method:'PUT'})).status,400);assert.equal(counter(),before);pass('recovery controls reject foreign origin, missing/wrong CSRF and extra fields');
 const eventsBefore=(await recover(p.id,'inspect')).body.receipt;
 change(['set ^IrisOpsGuardBoot("denyReadback")=1'],'IRISOPS');r=await recover(p.id);assert.equal(r.status,503);assert.equal(r.body.receipt,undefined);clear();assert.deepEqual((await recover(p.id,'inspect')).body.receipt,eventsBefore);pass('unavailable current read neither leaks receipt nor fabricates a new observation');
 change(['set p("Resources")="%DB_IRISOPSGUARD:R"','set sc=##class(Security.Roles).Modify("IrisOps_GuardStorage",.p)',check]);r=await recover(p.id);assert.equal(r.status,503);assert.equal(counter(),before);
 change(['set p("Resources")="%DB_IRISOPSGUARD:RW"','set sc=##class(Security.Roles).Modify("IrisOps_GuardStorage",.p)',check]);assert.deepEqual((await recover(p.id,'inspect')).body.receipt,eventsBefore);pass('failed observation persistence leaves execution and saved observations unchanged');
 change([`set p("Resources")="${userResources.replace('%Admin_Wallet:U,','')}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);assert.equal((await recover(p.id)).status,404);assert.equal((await request('/operations/'+p.id,'GET',undefined,{...t.controls(),'X-IrisOps-Recovery-Key':p.recoveryKey})).status,404);assert.equal((await execute(p)).status,404);pass('revoked permission denies recovery, legacy GET and execute replay even with correct key');
 change([`set p("Resources")="${userResources}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
 await freshSession();r=await recover(p.id,'inspect');assert.equal(r.status,200);assert.equal(r.body.receipt.id,p.id);assert.equal((await execute(p)).status,404);assert.equal(counter(),before);pass('fresh authorized owner session recovers receipt but cannot replay old execution');
 const other='IrisOps_GuardRecoveryOther';assert.ok(terminal([`write "OTHER=",##class(Security.Users).Exists("${other}"),!`]).includes('OTHER=0'));
 try{
  change([`set sc=##class(Security.Users).Create("${other}","${role}","${password}","Disposable recovery isolation test","USER","","",0,1)`,check]);
  const login=await request('/session','GET',undefined,{Authorization:'Basic '+Buffer.from(other+':'+password).toString('base64')});assert.equal(login.status,200);
  const oh={Cookie:login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':login.body.csrf,'Content-Type':'application/json'};
  assert.equal((await request('/connect','POST',{user:other,password},oh)).status,200);
  for(const mode of ['inspect','reconcile'])assert.equal((await recover(p.id,mode,oh)).status,404);
  assert.equal(counter(),before);await request('/logout','POST',undefined,oh);pass('different equally privileged user cannot inspect or reconcile owner receipt');
 }finally{change([`set sc=##class(Security.Users).Delete("${other}")`,check]);assert.ok(terminal([`write "OTHER=",##class(Security.Users).Exists("${other}"),!`]).includes('OTHER=0'));}
 dispatcher('IrisOps.Guard.FaultApi');
 try{
  for(const fault of ['crash_before','crash_after','final_save']){
   p=await prepare();before=counter();flag(fault);
   let failure;try{failure=await execute(p);}catch{failure={status:0};}
   if(fault==='final_save'){assert.equal(failure.status,503);assert.equal(failure.body.state,'RECEIPT_INCOMPLETE');}
   else assert.ok(terminal([`write "INTERRUPTED=",$get(^IrisOpsGuardBoot("interruption","${p.id}")),!`],'IRISOPS').includes('INTERRUPTED='+ (fault==='crash_before'?'before_dispatch':'after_dispatch')));
   clear();await freshSession();await freshObserver();const count=counter();assert.equal(count,before+(fault==='crash_before'?0:1));
   r=await recover(p.id);assert.equal(r.status,200);assert.equal(r.body.receipt.state,'UNKNOWN');assert.equal(r.body.currentObservation.outcome,fault==='crash_before'?'MATCHES_BEFORE':'MATCHES_EXPECTED');
   assert.equal(r.body.receipt.events.length,1);record({body:r.body.receipt});const replay=await execute(p);assert.equal(replay.status,404);assert.equal(counter(),count);
   pass(fault==='final_save'?'injected final save failure retains reservation, recoverable without another PUT':`actual worker exit ${fault==='crash_before'?'before':'after'} PUT is recovered read-only with no replay`);
   if(fault!=='crash_before'){await native('PUT',initial);same(await native(),initial);}
  }
 }finally{clear();dispatcher('IrisOps.Guard.HttpApi');}
 const saved=await recover(p.id,'inspect');const savedReceipt=saved.body.receipt;
 run(['restart','--time','20',container]);let up=false;
 for(let i=0;i<45;i++){try{if((await request('/session','GET',undefined,{})).status===401){up=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
 assert.ok(up);await freshSession();await freshObserver();const after=await recover(p.id,'inspect');assert.equal(after.status,200);assert.deepEqual(after.body.receipt,savedReceipt);assert.equal(counter(),0);
 r=await recover(p.id);assert.equal(r.body.receipt.state,'UNKNOWN');assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(counter(),0);same(await native(),initial);pass('real restart plus fresh login recovers preserved history and records a read-only current check');
 // Account-incarnation attack: exact same username, password and role are not
 // sufficient without the independently held per-operation possession proof.
 change([`set sc=##class(Security.Users).Delete("${user}")`,check,
   `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Recreated disposable account","USER","","",0,1)`,check]);
 await freshSession();await freshObserver();before=counter();
 for(const mode of ['inspect','reconcile']){
  assert.equal((await request('/operations/'+p.id+'/'+mode,'POST',{recoveryKey:'0'.repeat(64)})).status,404);
  assert.equal((await request('/operations/'+p.id+'/'+mode,'POST',{})).status,400);
 }
 assert.equal((await request('/operations/'+p.id)).status,404);
 assert.equal((await execute(p)).status,404);
 assert.equal(counter(),before);
 pass('deleted and recreated account with same name/password/role cannot recover by ID or replay old execution');
 // Possession is deliberately required in addition to native login/permissions.
 // Sharing that proof with a recreated identity would grant historical reads.
 r=await recover(p.id,'inspect');assert.equal(r.status,200);assert.equal(counter(),before);
 pass('explicit possession of original per-operation proof permits read-only recovery after account recreation');
}
