// Fixed same-origin guard only. Standard .js MIME support on native CSP hosting.
import {isId,isKey,WALLET,WEBAPP,webState,roleState,userState,walletMetadata,preview as readPreview,receipt as readReceipt,recovery as readRecovery} from './contracts.js';
const ROOT='/api/irisops-http-guard/v1';
function checked(read,code='invalid_response'){try{return read();}catch{throw new GuardError(code);}}
export class GuardError extends Error {
  constructor(code,status=0){super(code);this.name='GuardError';this.code=code;this.status=status;}
}
export class GuardClient {
  #fetch; #csrf=''; #channel=''; #generation=0; #actor=''; #approvals=new Map();
  #kind; #root; #session; #sessionEpoch=-1;
  #context=undefined;
  constructor(fetcher=(...args)=>globalThis.fetch(...args),kind='wallet',session=null){
    if(!['wallet','webapp','role','user'].includes(kind)||['role','user'].includes(kind)&&!session)throw new GuardError('invalid_profile');
    this.#kind=kind;this.#root=kind==='webapp'?'/api/irisops-web-guard/v1':ROOT;this.#fetch=fetcher;this.#session=session;
  }
  get connected(){return Boolean(this.#channel)&&(!this.#session||(this.#session.connected&&this.#sessionEpoch===this.#session.epoch));}
  get target(){return this.#context===null?'':this.#context?.[this.#kind]??(this.#kind==='wallet'?WALLET:this.#kind==='webapp'?WEBAPP:'');}
  get resources(){return this.#context===null?[]:this.#context?.resources?.slice()??['IRISOPS_GUARDPROBERESOURCE','IRISOPS_GUARDPROBEALTERNATE'];}
  get enrolledRole(){return this.#context?.role||'';}
  reset(){this.#generation++;this.#csrf='';this.#channel='';this.#actor='';this.#approvals.clear();this.#context=undefined;}
  #requireTarget(){if(!this.target)throw new GuardError('target_policy_required');}
  async #call(path,method='POST',data={},authorization){
    const generation=this.#generation;
    if(this.#session){
      if(this.#sessionEpoch!==this.#session.epoch)throw new GuardError('connection_changed');
      const scoped=path.replace(/^\/(wallet|webapp|role|user)(?=\?|$)/,'/state');
      const result=await this.#session.request('/'+this.#kind+scoped,method,data);
      if(generation!==this.#generation)throw new GuardError('connection_changed');
      return result;
    }
    const headers={'Accept':'application/json'};
    if(method!=='GET'){headers['Content-Type']='application/json';headers['X-IrisOps-CSRF']=this.#csrf;}
    if(authorization)headers.Authorization=authorization;
    let r,body;
    try {
      r=await this.#fetch(this.#root+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data),
        credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
      body=await r.json();
    } catch {throw new GuardError('connection_or_response_lost');}
    if(generation!==this.#generation)throw new GuardError('connection_changed');
    if(!body||typeof body!=='object'||Array.isArray(body))throw new GuardError('invalid_response');
    if(r.status===401){this.reset();throw new GuardError('reconnect_required',401);}
    if(!r.ok&&!['BLOCKED','UNKNOWN','RECEIPT_INCOMPLETE','FAILED_BEFORE_DISPATCH'].includes(body.state))
      throw new GuardError(typeof body.error==='string'?body.error:'request_rejected',r.status);
    return body;
  }
  async login(user,password){
    if(this.#session)throw new GuardError('shared_login_required');
    this.reset();
    if(typeof user!=='string'||!user||user.includes(':')||typeof password!=='string'||!password)throw new GuardError('credentials_required');
    const generation=this.#generation;
    const basic='Basic '+btoa(Array.from(new TextEncoder().encode(user+':'+password),b=>String.fromCharCode(b)).join(''));
    try {
      const session=await this.#call('/session','GET',undefined,basic);
      if(typeof session.csrf!=='string'||!session.csrf||session.actor!==user)throw new GuardError('invalid_session');
      this.#csrf=session.csrf;
      const connected=await this.#call('/connect','POST',{user,password});
      if(connected.connected!==true||connected.actor!==user)throw new GuardError('invalid_session');
      const channel=await this.#call('/channels');
      if(!isId(channel.channel)||channel.mode!=='read-only')throw new GuardError('invalid_channel');
      this.#channel=channel.channel;this.#actor=session.actor;
      return {actor:session.actor,authorizationSeconds:connected.authorizationSeconds};
    }catch(e){if(generation===this.#generation)this.reset();throw e;}
  }
  async attach(info){
    this.reset();
    if(!this.#session?.connected||info.actor!==this.#session.actor)throw new GuardError('reconnect_required');
    this.#sessionEpoch=this.#session.epoch;
    this.#context=this.#session.targets;
    const channel=await this.#call('/channels');
    if(!isId(channel.channel)||channel.mode!=='read-only')throw new GuardError('invalid_channel');
    this.#channel=channel.channel;this.#actor=info.actor;
    return {actor:info.actor,authorizationSeconds:this.#session.remainingSeconds};
  }
  async logout(){try{if(!this.#session&&this.#csrf)await this.#call('/logout');}finally{this.reset();}}
  async enable(){if(!this.connected)throw new GuardError('reconnect_required');this.#requireTarget();return this.#call('/channels/'+this.#channel+'/write-access','POST',{confirmation:'ENABLE WRITES'});}
  async disable(){if(!this.connected)throw new GuardError('reconnect_required');return this.#call('/channels/'+this.#channel+'/write-access','DELETE',{});}
  async wallet(){
    if(!this.connected)throw new GuardError('reconnect_required');this.#requireTarget();
    const target=this.target,value=await this.#call('/wallet?name='+encodeURIComponent(target),'GET');
    return checked(()=>walletMetadata(value,target,this.resources));
  }
  async preview(EditResource,UseResource){
    if(!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();
    const p=await this.#call('/previews','POST',{channel:this.#channel,action:'wallet.policy.update',name:this.target,EditResource,UseResource});
    const value=checked(()=>readPreview(p,'wallet',this.#context),'invalid_preview');
    this.#approvals.set(value.id,structuredClone({before:value.before,expected:value.expected}));
    return value;
  }
  async webapp(){
    if(this.#kind!=='webapp'||!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();
    const value=await this.#call('/webapp'+(this.#context===undefined?'':'?name='+encodeURIComponent(this.target)),'GET');return checked(()=>webState(value));
  }
  async role(resource){
    if(this.#kind!=='role'||!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();
    if(!this.resources.includes(resource))throw new GuardError('target_not_allowed');
    const value=await this.#call('/role?name='+encodeURIComponent(this.target)+'&resource='+encodeURIComponent(resource),'GET');
    const checkedValue=checked(()=>roleState(value,false,this.resources));
    if(checkedValue.resource!==resource)throw new GuardError('invalid_response');
    return checkedValue;
  }
  async user(){
    if(this.#kind!=='user'||!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();
    const value=await this.#call('/user?name='+encodeURIComponent(this.target)+'&role='+encodeURIComponent(this.enrolledRole),'GET');
    return checked(()=>userState(value,false,this.enrolledRole));
  }
  async previewUser(action){
    if(this.#kind!=='user'||!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();if(!['assign','remove'].includes(action))throw new GuardError('invalid_request');
    const p=await this.#call('/previews','POST',{channel:this.#channel,action:'user.membership.'+action,name:this.target,role:this.enrolledRole});
    const value=checked(()=>readPreview(p,'user',this.#context),'invalid_preview');
    if(value.expected.assigned!==(action==='assign'))throw new GuardError('invalid_preview');
    this.#approvals.set(value.id,structuredClone({before:value.before,expected:value.expected}));return value;
  }
  async previewRole(action,resource,permissions=''){
    if(this.#kind!=='role'||!this.connected)throw new GuardError('reconnect_required');
    this.#requireTarget();
    if(!['grant','revoke'].includes(action)||!this.resources.includes(resource)||
      !['','R','RW','RWU','U'].includes(permissions)||action==='grant'&&permissions==='')throw new GuardError('invalid_request');
    const p=await this.#call('/previews','POST',{channel:this.#channel,action:'role.resource.'+action,name:this.target,resource,permissions});
    const value=checked(()=>readPreview(p,'role',this.#context),'invalid_preview');
    if(value.before.resource!==resource||value.expected.permissions!==(action==='revoke'?'':permissions))throw new GuardError('invalid_preview');
    this.#approvals.set(value.id,structuredClone({before:value.before,expected:value.expected}));return value;
  }
  async previewWebapp(enabled){
    if(this.#kind!=='webapp'||!this.connected)throw new GuardError('reconnect_required');
    if(typeof enabled!=='boolean')throw new GuardError('invalid_enabled');
    this.#requireTarget();
    const p=await this.#call('/previews','POST',{channel:this.#channel,action:'webapp.availability.update',name:this.target,Enabled:String(enabled)});
    const value=checked(()=>readPreview(p,'webapp',this.#context),'invalid_preview');
    if(value.expected.Enabled!==enabled)throw new GuardError('invalid_preview');
    this.#approvals.set(value.id,structuredClone({before:value.before,expected:value.expected}));return value;
  }
  async execute(id,confirmation,recoveryKey){
    if(!isId(id))throw new GuardError('invalid_id');if(!isKey(recoveryKey))throw new GuardError('recovery_key_required');
    const approved=this.#approvals.get(id),actor=this.#actor;this.#approvals.delete(id);
    const value=await this.#call('/previews/'+id+'/execute','POST',{confirmation,recoveryKey});
    return checked(()=>readReceipt(value,{id,actor,approved,allowIncomplete:true,kind:this.#kind,context:this.#context}));
  }
  async cancel(id){if(!isId(id))throw new GuardError('invalid_id');this.#approvals.delete(id);return this.#call('/previews/'+id,'DELETE',{});}
  async recover(id,recoveryKey,record=false){
    if(!isId(id))throw new GuardError('invalid_id');if(!isKey(recoveryKey))throw new GuardError('recovery_key_required');
    if(typeof record!=='boolean')throw new GuardError('invalid_request');
    const actor=this.#actor,value=await this.#call('/operations/'+id+(record?'/reconcile':'/inspect'),'POST',{recoveryKey});
    return checked(()=>readRecovery(value,{id,actor,record,kind:this.#kind,context:this.#context}));
  }
}
