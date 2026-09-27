// Explicit renewal in the NEW disposable TLS instance only; never prints auth.
import assert from 'node:assert/strict';
export async function runRenewal(t){
 const {request,login,metadata,native,initial,proposed,wallet,web,pass,waitUntil,setRole}=t;
 const expected={use:initial.UseResource.toUpperCase(),enabled:0};
 const body=id=>({confirmation:'RENEW READ ONLY',renewalId:id});
 function valid(value){
  assert.deepEqual(Object.keys(value).sort(),['actor','authorizationSeconds','connected','idleSeconds','mode','renewalId','renewalSeconds']);
  assert.equal(value.connected,true);assert.equal(value.mode,'read-only');assert.equal(value.actor,t.user);assert.match(value.renewalId,/^[a-f0-9]{32}$/);assert.ok(value.authorizationSeconds>0&&value.authorizationSeconds<=60);assert.equal(value.idleSeconds,value.authorizationSeconds);assert.ok(value.renewalSeconds>=value.authorizationSeconds&&value.renewalSeconds<=300);
 }
 let h=await login(),first=metadata.get(h);const plans=[];
 for(const kind of ['wallet','webapp']){
  const c=await request('/'+kind+'/channels','POST',{},h);assert.equal(c.status,200);
  assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'},h)).status,200);
  const p=await request('/'+kind+'/previews','POST',kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'},h);assert.equal(p.status,200);plans.push({kind,channel:c.body.channel,...p.body});
 }
 for(const headers of [{...h,'X-IrisOps-CSRF':''},{...h,Origin:'https://other.invalid'}])assert.equal((await request('/renew','POST',body(first.renewalId),headers)).status,403);
 assert.equal((await request('/renew','POST',{...body(first.renewalId),extra:'forbidden'},h)).status,400);
 const other=await login();assert.equal((await request('/renew','POST',body(first.renewalId),other)).status,409);
 let renewed=await request('/renew','POST',body(first.renewalId),h);assert.equal(renewed.status,200,'Explicit native refresh failed');valid(renewed.body);assert.notEqual(renewed.body.renewalId,first.renewalId);
 assert.equal((await request('/renew','POST',body(first.renewalId),h)).status,409);
 for(const p of plans){
  assert.equal((await request('/'+p.kind+'/channels/'+p.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'},h)).status,404);
  const r=await request('/'+p.kind+'/previews/'+p.id+'/execute','POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey},h);assert.equal(r.status,400);assert.equal(r.body.error,'invalid_preview');assert.notEqual(r.body.state,'VERIFIED');
  const c=await request('/'+p.kind+'/channels','POST',{},h);assert.equal(c.body.mode,'read-only');
  const q=await request('/'+p.kind+'/previews','POST',p.kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'},h);assert.equal(q.status,403);
 }
 assert.deepEqual(native(),expected);pass('explicit native refresh, session-bound nonce, CSRF/schema checks; both old channels and previews rejected with unchanged native targets');
 // Simulate an acknowledged server rotation whose response the client discards.
 const discardedId=renewed.body.renewalId;
 assert.equal((await request('/renew','POST',body(discardedId),h)).status,200);
 assert.equal((await request('/renew','POST',body(discardedId),h)).status,409);
 pass('discarded renewal response cannot replay the consumed renewal id');
 // A refreshed JWT must not preserve a permission revoked on the native role.
 h=await login();first=metadata.get(h);setRole(false);
 try{
  const r=await request('/renew','POST',body(first.renewalId),h);assert.equal(r.status,200);valid(r.body);
  const cap=await request('/capabilities','GET',undefined,h);assert.equal(cap.status,200);assert.equal(cap.body.wallet.available,false);
  const c=await request('/wallet/channels','POST',{},h);assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'},h)).status,403);
 }finally{setRole(true);}
 assert.deepEqual(native(),expected);pass('native permission revocation survives refresh and blocks wallet writes; disposable role restored');
 // Real wall-clock evidence: do not shorten/edit any server timestamp.
 const began=Date.now();h=await login();first=metadata.get(h);let current=first,last=current.renewalId;
 for(const second of [40,80,120,160,200,240,280]){
  await waitUntil(began+second*1000,'explicit renewal family cap');
  const r=await request('/renew','POST',body(current.renewalId),h);assert.equal(r.status,200,'Renewal failed at '+second+'s');valid(r.body);assert.ok(r.body.renewalSeconds<=first.renewalSeconds-second+2);last=current.renewalId;current=r.body;
  assert.equal((await request('/wallet/state?name='+wallet,'GET',undefined,h)).status,200);
 }
 assert.ok(current.authorizationSeconds<=21,'Final JWT custody must be clamped to original family cap');
 await waitUntil(began+303000,'absolute family expiry');
 assert.equal((await request('/renew','POST',body(current.renewalId),h)).status,401);
 assert.equal((await request('/capabilities','GET',undefined,h)).status,401);assert.deepEqual(native(),expected);
 pass('seven explicit native refreshes across real five-minute clock; original family cap expires despite activity and cannot be renewed');
}
