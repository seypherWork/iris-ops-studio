import {WalletGuard,isManagedLoopbackOrigin} from './wallet-guard.js?v=1.3.1';
import {GuardClient,GuardError} from '../../experimental/guard/ui/client.js';
import {GuardSession} from '../../experimental/guard/ui/session.js?v=1.3.1';
export class CombinedGuard {
 #session;#guards;#kind='wallet';#busy=false;#capabilities=null;
 constructor({origin,fetcher,storage,clock=()=>Date.now(),profile='combined'}){
  if(profile==='managed'?!isManagedLoopbackOrigin(origin):origin!=='http://127.0.0.1:52801')throw new GuardError('lab_origin_required');
  this.#session=new GuardSession(fetcher,clock,profile,origin.startsWith('https://'));this.#guards={};
  for(const kind of profile==='managed'?['wallet','webapp','role','user']:['wallet','webapp']){
   const scoped={getItem:k=>storage.getItem(profile+':'+kind+':'+k),setItem:(k,v)=>storage.setItem(profile+':'+kind+':'+k,v),removeItem:k=>storage.removeItem(profile+':'+kind+':'+k)};
   this.#guards[kind]=new WalletGuard({origin,storage:scoped,clock,kind,managed:profile==='managed',client:new GuardClient(fetcher,kind,this.#session)});
  }
 }
 get kind(){return this.#kind;}
 get status(){const s=this.#guards[this.#kind].status;return {...s,busy:this.#busy||s.busy,connected:s.connected&&this.#session.connected,renewable:this.#session.renewable,remainingSeconds:this.#session.remainingSeconds,sessionRemainingSeconds:this.#session.sessionRemainingSeconds,capability:this.#capabilities?.[this.#kind]?.available===true,deploymentMode:this.#session.deploymentMode};}
 get result(){return this.#guards[this.#kind].result;}
 get target(){return this.#session.connected?this.#guards[this.#kind].target:'';}
 get resources(){return this.#session.connected?this.#guards[this.#kind].resources:[];}
 get enrolledRole(){return this.#session.connected?this.#guards[this.#kind].enrolledRole:'';}
 get capabilities(){return this.#capabilities?structuredClone(this.#capabilities):null;}
 invalidate(){this.#session.reset();this.#capabilities=null;for(const g of Object.values(this.#guards))g.invalidate();}
 async #perform(work){if(this.#busy)throw new GuardError('guard_busy');this.#busy=true;try{return await work();}finally{this.#busy=false;}}
 async select(kind){
  if(!Object.hasOwn(this.#guards,kind))throw new GuardError('invalid_profile');
  if(kind===this.#kind)return;
  await this.#perform(async()=>{await this.#guards[this.#kind].cancel();this.#kind=kind;});
 }
 async login(user,password){return this.#perform(async()=>{
  this.invalidate();
  try{const info=await this.#session.login(user,password);this.#capabilities=await this.#session.capabilities();for(const [kind,g] of Object.entries(this.#guards))if(kind!=='user'||this.#capabilities.user?.target)await g.attach(info);return info;}
  catch(e){this.invalidate();throw e;}
 });}
 async renew(){return this.#perform(async()=>{
  if(Object.values(this.#guards).some(g=>g.status.busy))throw new GuardError('guard_busy');
  for(const g of Object.values(this.#guards))g.invalidate();
  this.#capabilities=null;
  try{const info=await this.#session.renew();this.#capabilities=await this.#session.capabilities();for(const [kind,g] of Object.entries(this.#guards))if(kind!=='user'||this.#capabilities.user?.target)await g.attach(info);return info;}
  catch(e){this.invalidate();throw e;}
 });}
 async enable(){return this.#perform(async()=>{
  const deployment=await this.#session.deploymentState();if(deployment&&deployment.mode!=='ACTIVE')throw new GuardError('deployment_read_only');
  this.#capabilities=await this.#session.capabilities();
  if(!this.#capabilities[this.#kind].available)throw new GuardError('operation_denied');
  return this.#guards[this.#kind].enable();
 });}
 disable(){return this.#perform(()=>this.#guards[this.#kind].disable());}
 cancel(){return this.#perform(()=>this.#guards[this.#kind].cancel());}
 wallet(name){if(this.#kind!=='wallet')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.wallet.wallet(name));}
 preview(...args){if(this.#kind!=='wallet')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.wallet.preview(...args));}
 webapp(){if(this.#kind!=='webapp')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.webapp.webapp());}
 previewWebapp(enabled){if(this.#kind!=='webapp')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.webapp.previewWebapp(enabled));}
 role(resource){if(this.#kind!=='role')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.role.role(resource));}
 previewRole(action,resource,permissions){if(this.#kind!=='role')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.role.previewRole(action,resource,permissions));}
 user(){if(this.#kind!=='user')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.user.user());}
 previewUser(action){if(this.#kind!=='user')throw new GuardError('target_not_allowed');return this.#perform(()=>this.#guards.user.previewUser(action));}
 execute(...args){return this.#perform(()=>this.#guards[this.#kind].execute(...args));}
 recover(...args){return this.#perform(()=>this.#guards[this.#kind].recover(...args));}
 async logout(){return this.#perform(async()=>{
  let remoteFailed=false,cleanupFailed=false;
  try{await this.#session.logout();}catch{remoteFailed=true;}
  // Try every local store even if another one fails. Never report it cleared
  // merely because local authorization was invalidated or remote logout worked.
  for(const g of Object.values(this.#guards))try{await g.logout();}catch(e){
   if(e.code==='recovery_forget_failed')cleanupFailed=true;else remoteFailed=true;
  }
  this.invalidate();
  if(cleanupFailed)throw new GuardError(remoteFailed?'logout_and_recovery_forget_failed':'recovery_forget_failed');
  if(remoteFailed)throw new GuardError('logout_unconfirmed');
 });}
}
