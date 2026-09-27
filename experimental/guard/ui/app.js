import {GuardClient} from './client.js';
import {RecoveryStore} from './recovery-store.js';
const client=new GuardClient(),$=id=>document.getElementById(id);
// Lazy storage access lets the page load even when the browser blocks storage.
const recovery=new RecoveryStore({getItem:k=>sessionStorage.getItem(k),setItem:(k,v)=>sessionStorage.setItem(k,v),removeItem:k=>sessionStorage.removeItem(k)});
let busy=false,writingUntil=0,pending=null,previewUntil=0,authUntil=0;
const captions={MATCHES_EXPECTED:'Matches expected state',MATCHES_BEFORE:'Matches previous state',DIFFERS:'Differs from both',UNKNOWN:'Uncertain',VERIFIED:'Verified at execution',BLOCKED:'Blocked',MISMATCH:'Readback mismatch',RECEIPT_INCOMPLETE:'Final receipt incomplete'};
const errors={reconnect_required:'Authorization expired. Reconnect; do not repeat an uncertain change.',upstream_reconnect_required:'Reconnect to inspect the existing operation.',connection_or_response_lost:'Response unavailable. A submitted change may have happened. Recover its receipt; do not resend.',operation_not_found:'Receipt unavailable for this operator or ID.',operation_busy:'Operation still in progress. Inspect it again later; do not resend.',stale:'The target changed. This preview cannot execute.',no_change:'Policy is unchanged.',recheck_limit:'The 20-observation limit was reached. Inspection remains available.',read_only_or_expired_channel:'Write access is locked or expired.',permission_revoked:'IRIS permission was revoked.',current_state_unavailable:'Current state could not be read. The original result is unchanged.',recheck_not_persisted:'Observation could not be saved. No administrative change was sent.',confirmation_mismatch:'Confirmation does not match.',invalid_id:'Enter a valid 32-character operation ID.'};
function status(text,error=false){$('status').textContent=text;$('status').dataset.error=String(error);}
function update(){
 const connected=client.connected&&Date.now()<authUntil,write=connected&&Date.now()<writingUntil;
 $('connection-state').textContent=connected?'Live IRIS · experimental':client.connected?'Reconnect required':'Disconnected';
 $('write-state').textContent=write?'Write-enabled · temporary':'Read-only';
 for(const id of ['connect','username','password'])$(id).disabled=busy;
 $('logout').disabled=busy||!client.connected;
 for(const id of ['enable','read','inspect','reconcile'])$(id).disabled=busy||!connected;
 $('disable').disabled=busy||!write;$('preview').disabled=busy||!write;
 $('execute').disabled=busy||!write||!pending||Date.now()>=previewUntil||$('confirmation').value!==pending.confirmation;
 $('cancel').disabled=busy||!pending;
 $('edit').disabled=busy||!!pending;$('use').disabled=busy||!!pending;
}
async function action(work){if(busy)return;busy=true;update();try{await work();}catch(e){status(errors[e.code]||'Request was not completed. No automatic retry was made.',true);}finally{busy=false;update();}}
function clearPreview(){pending=null;$('preview-panel').hidden=true;$('confirmation').value='';}
function remember(id,key){recovery.remember(id,key);$('operation-id').value=id;}
function renderReceipt(receipt,observation){
 $('receipt-panel').hidden=false;$('original-state').textContent=captions[receipt.state]||receipt.state||'Unknown';
 $('observation-state').textContent=observation?captions[observation.outcome]||'Unavailable':'No later check';
 $('causality').textContent='Current state is an observation, not proof of who caused a change. The original execution history is retained. Recovery sends no administrative write.';
 const details={id:receipt.id,actor:receipt.actor,target:receipt.target,originalState:receipt.state,reason:receipt.reason,before:receipt.before,expected:receipt.expected,originalReadback:receipt.observed,events:receipt.events,laterChecks:receipt.rechecks||[]};
 $('receipt-detail').textContent=JSON.stringify(details,null,2);
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
 clearPreview();$('receipt-panel').hidden=true;$('receipt-detail').textContent='';$('current').textContent='Current policy has not been read.';writingUntil=0;authUntil=0;const user=$('username').value.trim(),password=$('password').value;$('password').value='';
 const info=await client.login(user,password);authUntil=Date.now()+Math.min(60,info.authorizationSeconds||0)*1000;$('actor').textContent='Operator: '+info.actor;
 status('Connected to Live IRIS. New channel is read-only.');
});});
$('logout').addEventListener('click',()=>action(async()=>{
 clearPreview();writingUntil=0;authUntil=0;
 let logoutFailed=false,forgetFailed=false;
 try{await client.logout();}catch{logoutFailed=true;}
 try{recovery.clear();}catch{forgetFailed=true;}
 $('operation-id').value='';$('receipt-detail').textContent='';$('current').textContent='Current policy has not been read.';$('actor').textContent='No active operator';$('receipt-panel').hidden=true;
 if(forgetFailed){status('Disconnected locally, but recovery keys could not be removed. Clear this site’s session storage before sharing the browser.',true);return;}
 if(logoutFailed){status('Recovery keys forgotten and local approval cleared. Server logout was not confirmed.',true);return;}
 status('Disconnected. Recovery keys forgotten; no pending approval remains.');
}));
$('enable').addEventListener('click',()=>action(async()=>{clearPreview();await client.enable();writingUntil=Date.now()+60000;status('Server write channel enabled temporarily for the disposable wallet only.');}));
$('disable').addEventListener('click',()=>action(async()=>{clearPreview();writingUntil=0;await client.disable();status('Server channel is read-only. Old previews cannot execute.');}));
$('read').addEventListener('click',()=>action(async()=>{const r=await client.wallet();$('current').textContent='Edit: '+r.EditResource+' · Use: '+r.UseResource;status('Current wallet policy read from IRIS.');}));
$('policy-form').addEventListener('submit',e=>{e.preventDefault();action(async()=>{
 clearPreview();pending=await client.preview($('edit').value,$('use').value);previewUntil=Date.now()+30000;$('preview-panel').hidden=false;$('phrase').textContent=pending.confirmation;
 $('preview-diff').textContent=JSON.stringify({before:pending.before,expected:pending.expected},null,2);$('confirmation').focus();status('Preview created by the server. Review both fields before confirming.');
});});
$('confirmation').addEventListener('input',update);
$('cancel').addEventListener('click',()=>action(async()=>{const p=pending;clearPreview();if(p)await client.cancel(p.id);status('Preview cancelled. No change sent.');}));
$('execute').addEventListener('click',()=>action(async()=>{
 if(!pending||$('confirmation').value!==pending.confirmation||Date.now()>=previewUntil)return;
 const p=pending;
 try{remember(p.id,p.recoveryKey);}catch{status('Recovery key could not be saved in this tab. Nothing was submitted. Keep this page open and check browser storage.',true);return;}
 clearPreview();status('Submitted once. Waiting for server verification…');
 // Never restore this preview after any failure. Recovery is a separate read.
 const r=await client.execute(p.id,p.confirmation,p.recoveryKey);renderReceipt(r);status(r.state==='VERIFIED'?'Change verified by the server.':r.state==='BLOCKED'?'Server blocked the change.':'Outcome requires review. Inspect the receipt; do not repeat the change.',r.state!=='VERIFIED');
}));
for(const [id,record] of [['inspect',false],['reconcile',true]])$(id).addEventListener('click',()=>action(async()=>{
 const id=$('operation-id').value.trim(),key=recovery.get(id);
 if(!key){status('This tab has no recovery key for that operation. Its ID alone cannot recover the receipt. No change was sent.',true);return;}
 const r=await client.recover(id,key,record);renderReceipt(r.receipt,r.currentObservation);remember(id,key);status(record?'Read-only observation recorded. Original execution result preserved.':'Receipt and current state inspected. No administrative write sent.');
}));
try{const id=recovery.last();if(id)$('operation-id').value=id;}catch{status('Recovery storage is unavailable. No change will be submitted until a key can be saved.',true);}
setInterval(update,500);update();
