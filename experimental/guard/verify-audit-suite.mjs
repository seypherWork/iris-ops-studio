// Adversarial, bounded checks in the pinned disposable IRIS only.
// Regression acceptance: every historical defect must now fail closed.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
export async function runAuditSuite(ctx){
 const {request,reconnect,freshSession,freshObserver,channel,enable,preview,execute,native,same,counter,change,terminal,pass,user,role,password,initial,proposed,userResources,controls,check}=ctx;
 const findings=[];let complete=false;
 const note=(name,details)=>{findings.push({name,...details});console.log('AUDIT '+name+' '+JSON.stringify(details));};
 const resetFault=()=>change(['kill ^IrisOpsGuardBoot("auditFault"),^IrisOpsGuardBoot("auditSnapshots")'],'IRISOPS');
 const fault=(value)=>change([`set ^IrisOpsGuardBoot("auditFault")="${value}",^IrisOpsGuardBoot("auditSnapshots")=0`],'IRISOPS');
 const fixture=async()=>{resetFault();await freshObserver();await native('PUT',initial);await freshSession();const c=await channel();await enable(c);return c;};
 const setRole=(resources)=>change([`set p("Resources")="${resources}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
 try{
   change(['set p("DispatchClass")="IrisOps.Guard.FaultApi"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
   await freshSession();
   const loginCount=()=>Number(terminal(['write "LOGIN_COUNT=",$get(^IrisOpsGuardBoot("observedLogins"),0),!'],'IRISOPS').match(/LOGIN_COUNT=(\d+)/)[1]);
   const loginsBefore=loginCount();
   const duplicate='{"user":'+JSON.stringify(user)+',"us\\u0065r":'+JSON.stringify(user)+',"password":'+JSON.stringify(password)+'}';
   const duplicateReply=await request('/connect','POST',duplicate,controls(),true);
   note('duplicate_login_keys',{status:duplicateReply.status,accepted:duplicateReply.status===200});
   assert.equal(duplicateReply.status,400,'F04: duplicate login keys must be rejected');
   const credentials=JSON.stringify({user,password});
   const invalidBodies=[`{"user":${JSON.stringify(user)},"user":${JSON.stringify(user)},"password":${JSON.stringify(password)}}`,
     JSON.stringify({user,password,extra:'x'}),JSON.stringify({user,password:[password]}),JSON.stringify({user,password:null}),
     JSON.stringify([{user,password}]),credentials+'x',credentials+' '.repeat(4097)];
   for(const raw of invalidBodies)assert.equal((await request('/connect','POST',raw,controls(),true)).status,400);
   assert.equal(loginCount(),loginsBefore,'Malformed login bodies must not reach native login');
   await reconnect();
   assert.equal(loginCount(),loginsBefore+1,'Positive control: transport login counter must observe a valid connect');
   pass('audit remediation: invalid login schemas never call upstream transport; positive counter control passed');
   // Identity/CSRF/method boundaries, using a genuine session but invalid controls.
   let count=counter();
   for(const bad of [{...controls(),Origin:'https://untrusted.invalid'},{...controls(),'X-IrisOps-CSRF':'wrong'}]){
     assert.equal((await request('/channels','POST',{},bad)).status,403);
     assert.equal((await request('/logout','POST',{},bad)).status,403);
   }
   for(const method of ['PUT','PATCH','DELETE'])assert.notEqual((await request('/wallet',method,{})).status,200);
   assert.equal(counter(),count);pass('audit: wrong Origin/CSRF and unsupported mutation routes never dispatch');

   let c,p,r;
   if(process.env.IRISOPS_AUDIT_FAST!=='1'){
   c=await fixture();p=await preview(c);
   count=counter();fault('delay_snapshot');
   console.log('AUDIT waiting 28s for a real preview boundary, then adding a bounded 3s snapshot delay');
   await new Promise(r=>setTimeout(r,28000));
   r=await execute(p);
   note('preview_expires_during_snapshot',{status:r.status,state:r.body?.state,reason:r.body?.reason,nativePuts:counter()-count});
   assert.equal(r.body?.state,'BLOCKED');assert.equal(r.body?.reason,'preview_expired');assert.equal(counter(),count,'F01: expired preview must not send');
   resetFault();

   c=await fixture();p=await preview(c);count=counter();fault('delay_reservation');
   console.log('AUDIT waiting 28s before a bounded post-reservation delay');
   await new Promise(r=>setTimeout(r,28000));r=await execute(p);
   note('preview_expires_during_reservation',{status:r.status,state:r.body?.state,reason:r.body?.reason,nativePuts:counter()-count});
   assert.equal(r.body?.state,'BLOCKED');assert.equal(r.body?.reason,'preview_expired');assert.equal(r.body?.dispatchCount,0);assert.equal(counter(),count);
   assert.deepEqual(r.body.events.map(e=>e.state),['DISPATCHING','BLOCKED']);
   resetFault();

   c=await fixture();
   console.log('AUDIT waiting 40s then 18s within one authorization to cross its real deadline');
   await new Promise(r=>setTimeout(r,40000));p=await preview(c);
   await new Promise(r=>setTimeout(r,18000));
   count=counter();fault('delay_snapshot');r=await execute(p);
   note('authorization_expires_during_snapshot',{status:r.status,state:r.body?.state,reason:r.body?.reason,nativePuts:counter()-count});
   assert.equal(r.body?.state,'BLOCKED');assert.equal(r.body?.reason,'authorization_expired');assert.equal(r.body?.dispatchCount,0);assert.equal(counter(),count);
   resetFault();
   }

   c=await fixture();p=await preview(c);count=counter();fault('delay_snapshot');
   const inFlight=execute(p);
   let reached=false;
   for(let attempt=0;attempt<20;attempt++){
     if(terminal(['write "SNAPSHOTS=",$get(^IrisOpsGuardBoot("auditSnapshots")),!'],'IRISOPS').includes('SNAPSHOTS=1')){reached=true;break;}
     await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.ok(reached,'Real snapshot scheduling point was not reached');
   setRole(userResources.replace(',IrisOps_GuardProbeAlternate:RW',''));
   r=await inFlight;
   note('proposed_permission_revoked_during_snapshot',{status:r.status,state:r.body?.state,reason:r.body?.reason,nativePuts:counter()-count});
   assert.equal(r.body?.state,'BLOCKED');assert.equal(r.body?.reason,'permission_revoked');assert.equal(counter(),count,'F01: revoked proposed permission must not send');
   setRole(userResources);resetFault();

   c=await fixture();p=await preview(c);count=counter();
   setRole(userResources.replace('IrisOps_GuardProbeResource:RW','IrisOps_GuardProbeResource:W'));
   r=await execute(p);
   note('before_policy_permission_revoked_after_preview',{status:r.status,state:r.body?.state,reason:r.body?.reason,nativePuts:counter()-count});
   assert.equal(r.body?.state,'BLOCKED');assert.equal(r.body?.reason,'recovery_permission_required');assert.equal(counter(),count);
   setRole(userResources);

   // Distinct native sessions, distinct approvals, same initial target state.
   c=await fixture();const p1=await preview(c),h1=controls();
   await freshSession();const c2=await channel();await enable(c2);
   const p2=await preview(c2,{EditResource:'IrisOps_GuardProbeAlternate:WRITE',UseResource:initial.UseResource}),h2=controls();
   fault('snapshot_barrier');count=counter();
   const race=await Promise.all([execute(p1,h1),execute(p2,h2)]);
   note('distinct_approvals_same_target',{nativePuts:counter()-count,outcomes:race.map(x=>({status:x.status,state:x.body?.state,reason:x.body?.reason}))});
   assert.equal(counter()-count,1,'F02: distinct previews of the same state must not overwrite');
   assert.equal(race.filter(x=>x.body?.state==='VERIFIED').length,1);
   assert.equal(race.filter(x=>x.body?.state==='BLOCKED'&&['stale','target_busy'].includes(x.body.reason)).length,1);
   resetFault();

   c=await fixture();
   // The old UseResource permission is deliberately absent, proposed policies
   // remain allowed. Native Admin_Wallet is never replaced by a service account.
   setRole(userResources.replace('IrisOps_GuardProbeResource:RW','IrisOps_GuardProbeResource:W'));
   await reconnect();c=await channel();await enable(c);
   const pr=await request('/previews','POST',{channel:c,action:'wallet.policy.update',name:'IrisOps_GuardProbeWallet',...proposed});
   let recoveryStatus=null,executionState=null;count=counter();
   if(pr.status===200){r=await execute(pr.body);executionState=r.body?.state;
     recoveryStatus=(await request('/operations/'+pr.body.id+'/inspect','POST',{recoveryKey:pr.body.recoveryKey})).status;}
   note('before_policy_permission_missing',{previewStatus:pr.status,executionState,recoveryStatus,nativePuts:counter()-count});
   assert.equal(pr.status,403);assert.equal(pr.body?.error,'recovery_permission_required');assert.equal(counter(),count,'F03: unrecoverable policy must not send');
   setRole(userResources);
   complete=true;pass('audit remediation: all selected real-IRIS regression gates passed');
 }finally{
   resetFault();setRole(userResources);
   change(['set p("DispatchClass")="IrisOps.Guard.HttpApi"','set sc=##class(Security.Applications).Modify("/api/irisops-http-guard",.p)',check]);
   await freshSession();await freshObserver();await native('PUT',initial);same(await native(),initial);
   await writeFile(new URL(process.env.IRISOPS_AUDIT_FAST==='1'?'audit-remediation-fast.json':'audit-remediation-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),complete,releaseReady:false,findings},null,2)+'\n');
 }
}
