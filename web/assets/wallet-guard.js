// LAB integration, dynamically loaded only by the explicit wallet-lab profile.
// Imports intentionally stay experimental; this is not part of module.xml.
import {GuardClient, GuardError} from '../../experimental/guard/ui/client.js';
import {RecoveryStore} from '../../experimental/guard/ui/recovery-store.js';
import {walletSnapshot} from './wallet-policy.js?v=1.2.1';

export const GUARDED_WALLET='IrisOps_GuardProbeWallet';
// UI allowlist only. The server independently checks its installer-owned origin.
export function isManagedLoopbackOrigin(origin){const m=/^https?:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})$/.exec(origin);return !!m&&Number(m[1])>=1024&&Number(m[1])<=65535;}
export class WalletGuard {
  #client; #store; #clock; #epoch=0; #busy=false;
  #authUntil=0; #writeUntil=0; #pending=null; #receipt=null; #observation=null;
  #actor=''; #lastId='';
  #kind;#maxAuthorization=60;
  constructor({origin,fetcher,storage,clock=()=>Date.now(),kind='wallet',client=null,managed=false}){
    if(managed?!isManagedLoopbackOrigin(origin):origin!=='http://127.0.0.1:52801')throw new GuardError('lab_origin_required');
    this.#maxAuthorization=managed&&origin.startsWith('https://')?300:60;
    this.#kind=kind;this.#client=client||new GuardClient(fetcher,kind);
    // Keep wallet/webapp recovery stores isolated, including logout.
    const scoped=kind==='webapp'?{getItem:k=>storage.getItem('webapp:'+k),setItem:(k,v)=>storage.setItem('webapp:'+k,v),removeItem:k=>storage.removeItem('webapp:'+k)}:storage;
    this.#store=new RecoveryStore(scoped);this.#clock=clock;
    try{this.#lastId=this.#store.last();}catch{/* Execution still fails closed if storage is invalid. */}
  }
  get status(){
    const connected=this.#client.connected&&this.#clock()<this.#authUntil;
    return {connected,busy:this.#busy,writing:connected&&this.#clock()<this.#writeUntil,
      actor:this.#actor,lastId:this.#lastId,pendingId:this.#pending?.id||'',
      previewValid:connected&&!!this.#pending&&this.#clock()<this.#pending.deadline};
  }
  get result(){return {receipt:this.#receipt?structuredClone(this.#receipt):null,observation:this.#observation?structuredClone(this.#observation):null};}
  get target(){return this.#client.target;}
  get resources(){return this.#client.resources;}
  get enrolledRole(){return this.#client.enrolledRole;}
  invalidate(){
    this.#epoch++;this.#client.reset();this.#authUntil=0;this.#writeUntil=0;
    this.#pending=null;this.#actor='';this.#receipt=null;this.#observation=null;
  }
  async #perform(work){
    if(this.#busy)throw new GuardError('guard_busy');
    const epoch=this.#epoch;this.#busy=true;
    try{const result=await work();if(epoch!==this.#epoch)throw new GuardError('connection_changed');return result;}
    catch(e){
      if(!this.#client.connected||['request_controls_rejected','recovery_permission_denied','channel_not_found'].includes(e.code))this.invalidate();
      if(e.code==='read_only_or_expired_channel'){this.#writeUntil=0;this.#pending=null;}
      throw e;
    }finally{this.#busy=false;}
  }
  #require(writing=false){
    if(!this.status.connected)throw new GuardError('reconnect_required');
    if(writing&&!this.status.writing)throw new GuardError('read_only_or_expired_channel');
  }
  async login(user,password){
    if(this.#busy)throw new GuardError('guard_busy');
    this.invalidate();
    const info=await this.#perform(()=>this.#client.login(user,password));
    this.#actor=info.actor;this.#authUntil=this.#clock()+Math.min(this.#maxAuthorization,Math.max(0,Number(info.authorizationSeconds)||0))*1000;
    return info;
  }
  async enable(){
    this.#require();this.#pending=null;
    const result=await this.#perform(()=>this.#client.enable());
    if(result.mode!=='write-enabled'){this.#writeUntil=0;throw new GuardError('invalid_response');}
    this.#writeUntil=this.#clock()+Math.min(60,Math.max(0,Number(result.expiresIn)||0))*1000;
  }
  async attach(info){
    if(this.#busy)throw new GuardError('guard_busy');
    this.invalidate();
    const connected=await this.#perform(()=>this.#client.attach(info));
    this.#actor=connected.actor;this.#authUntil=this.#clock()+Math.min(this.#maxAuthorization,Math.max(0,Number(connected.authorizationSeconds)||0))*1000;
  }
  async disable(){
    this.#writeUntil=0;this.#pending=null;this.#require();
    await this.#perform(()=>this.#client.disable());
  }
  async wallet(name){
    this.#require();if(!name||name!==this.target)throw new GuardError('target_not_allowed');
    const result=await this.#perform(()=>this.#client.wallet());
    if(result.name!==name||Object.keys(result).sort().join(',')!=='EditResource,UseResource,name')throw new GuardError('invalid_response');
    return walletSnapshot({Name:result.name,EditResource:result.EditResource,UseResource:result.UseResource},name);
  }
  async preview(name,edit,use){
    this.#require(true);if(!name||name!==this.target)throw new GuardError('target_not_allowed');
    this.#pending=null;
    const p=await this.#perform(()=>this.#client.preview(edit,use));
    const before=walletSnapshot(p.before,name),expected=walletSnapshot(p.expected,name);
    this.#pending={id:p.id,recoveryKey:p.recoveryKey,confirmation:p.confirmation,deadline:this.#clock()+Math.min(30,Math.max(0,Number(p.expiresIn)||0))*1000};
    // The main application and its journal never receive the possession proof.
    return {id:p.id,confirmation:p.confirmation,before,expected,target:name};
  }
  async cancel(){
    const p=this.#pending;this.#pending=null;
    if(p&&this.status.connected)await this.#perform(()=>this.#client.cancel(p.id));
  }
  async webapp(){this.#require();return this.#perform(()=>this.#client.webapp());}
  async role(resource){this.#require();return this.#perform(()=>this.#client.role(resource));}
  async user(){this.#require();return this.#perform(()=>this.#client.user());}
  async previewUser(action){
    this.#require(true);this.#pending=null;
    const p=await this.#perform(()=>this.#client.previewUser(action));
    this.#pending={id:p.id,recoveryKey:p.recoveryKey,confirmation:p.confirmation,deadline:this.#clock()+30000};
    return {id:p.id,confirmation:p.confirmation,before:p.before,expected:p.expected,target:p.target};
  }
  async previewRole(action,resource,permissions=''){
    this.#require(true);this.#pending=null;
    const p=await this.#perform(()=>this.#client.previewRole(action,resource,permissions));
    this.#pending={id:p.id,recoveryKey:p.recoveryKey,confirmation:p.confirmation,deadline:this.#clock()+30000};
    return {id:p.id,confirmation:p.confirmation,before:p.before,expected:p.expected,target:p.target};
  }
  async previewWebapp(enabled){
    this.#require(true);this.#pending=null;
    const p=await this.#perform(()=>this.#client.previewWebapp(enabled));
    this.#pending={id:p.id,recoveryKey:p.recoveryKey,confirmation:p.confirmation,deadline:this.#clock()+30000};
    return {id:p.id,confirmation:p.confirmation,before:p.before,expected:p.expected,target:p.target};
  }
  async execute(id,confirmation){
    this.#require(true);
    if(this.#busy)throw new GuardError('guard_busy');
    const p=this.#pending;
    if(!p||p.id!==id||!this.status.previewValid)throw new GuardError('preview_expired');
    if(p.confirmation!==confirmation)throw new GuardError('confirmation_mismatch');
    try{this.#store.remember(p.id,p.recoveryKey);}catch{throw new GuardError('recovery_storage_unavailable');}
    this.#lastId=p.id;this.#pending=null;this.#receipt=null;this.#observation=null;
    // Consumed BEFORE awaiting. An uncertain request cannot be sent again here.
    const r=await this.#perform(()=>this.#client.execute(p.id,confirmation,p.recoveryKey));
    // Shared GuardClient validates identity, nested metadata and approved policy.
    this.#receipt=r;return this.result.receipt;
  }
  async recover(id,record=false){
    this.#require();let key;
    try{key=this.#store.get(id);}catch{throw new GuardError('recovery_storage_unavailable');}
    if(!key)throw new GuardError('recovery_key_required');
    const r=await this.#perform(()=>this.#client.recover(id,key,record));
    if(r.administrativeWrites!==0||r.currentObservation?.causality!=='not_proven')throw new GuardError('invalid_response');
    this.#receipt=r.receipt;
    this.#observation={outcome:r.currentObservation.outcome,at:r.currentObservation.at,causality:'not_proven'};
    // Only this validated boolean is needed to refresh the webapp status label.
    // Do not forward raw metadata, possession proof or arbitrary response fields.
    if(this.#kind==='webapp')this.#observation.Enabled=r.currentObservation.Enabled;
    this.#lastId=id;return this.result;
  }
  async logout(){
    if(this.#busy)throw new GuardError('guard_busy');
    let failure;
    try{await this.#perform(()=>this.#client.logout());}catch(e){failure=e;}
    this.invalidate();this.#lastId='';
    try{this.#store.clear();}catch{throw new GuardError('recovery_forget_failed');}
    if(failure)throw new GuardError('logout_unconfirmed');
  }
}

const messages={
  target_policy_required:'No targets enrolled. A native administrator must configure the server policy while suspended; nothing is enabled by default.',
  target_policy_changed:'The server target policy changed. Reconnect and review again. Do not resend an uncertain change.',
  deployment_read_only:'This server deployment is read-only. Only its administrator can enable guarded writes.',
  deployment_changed_reconnect_required:'The server deployment changed. Reconnect and review again; never resend an uncertain operation.',
  deployment_unavailable:'The server deployment is suspended or unavailable. No fallback or retry was made.',
  deployment_busy:'A deployment transition or guarded operation is running. No automatic retry was made.',
  reconnect_required:'Guard authorization expired or disconnected. Reconnect; do not resend an uncertain change.',
  connection_or_response_lost:'Response unavailable. The change may have happened. Recover the existing receipt; never resend.',
  connection_changed:'Connection changed. The old result or approval was discarded.',
  guard_busy:'Another guard request is running. Wait for it to finish.',
  read_only_or_expired_channel:'Server write access is locked or expired.',
  channel_not_found:'This channel was invalidated, possibly by another tab. Reconnect and review again.',
  request_controls_rejected:'Session controls changed. Reconnect; no automatic retry was made.',
  preview_expired:'The server preview is no longer valid. Review a new preview.',
  operation_not_found:'Receipt unavailable for this user, operation or recovery key.',
  recovery_key_required:'This tab has no recovery key for that operation. Its ID alone is insufficient.',
  recovery_storage_unavailable:'Recovery storage is unavailable. No automatic retry was made.',
  recovery_forget_failed:'Recovery keys could not be removed. Clear this site’s session storage before sharing the browser.',
  logout_and_recovery_forget_failed:'Recovery keys could not be removed and server logout was not confirmed. Local authorization is disabled. Clear this site’s session storage before sharing the browser.',
  logout_unconfirmed:'Local authorization and keys cleared; server logout was not confirmed.',
  current_state_unavailable:'Current state is unavailable. The original execution result is unchanged.',
  invalid_response:'Server evidence is incomplete or inconsistent. Do not repeat the change; inspect the existing operation after reconnecting.',
  recovery_permission_required:'Current permissions cannot recover this operation. Nothing was submitted.',
};
export function guardMessage(error){return messages[error?.code]||'Guard request rejected or unavailable. No direct IRIS fallback or automatic retry was made.';}
