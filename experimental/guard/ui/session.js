// A fixed same-origin session, not a generic proxy. No upstream token in JS.
import {GuardError} from './client.js';
import {WALLET,WEBAPP,isId,targetContext} from './contracts.js';
export class GuardSession {
 #fetch;#clock;#epoch=0;#csrf='';#actor='';#until=0;#idleUntil=0;#idleMs=0;#tls=false;#profile;#root;#deployment=null;
 #renewalId='';#renewUntil=0;#renewing=false;
 #targets=undefined;#policySignature='';
 constructor(fetcher=(...args)=>fetch(...args),clock=()=>Date.now(),profile='combined',tls=false){
  if(!['combined','managed'].includes(profile))throw new GuardError('invalid_profile');
  if(typeof tls!=='boolean'||(tls&&profile!=='managed'))throw new GuardError('invalid_profile');
  this.#tls=tls;
  this.#fetch=fetcher;this.#clock=clock;this.#profile=profile;
  this.#root=profile==='managed'?'/api/irisops-managed-guard/v1':'/api/irisops-combined-guard/v1';
 }
 get epoch(){return this.#epoch;}
 get actor(){return this.#actor;}
 get connected(){return !!this.#actor&&this.#clock()<this.#until&&this.#clock()<this.#idleUntil;}
 get remainingSeconds(){return Math.max(0,Math.floor((this.#until-this.#clock())/1000));}
 get renewable(){return this.#tls&&this.connected&&!this.#renewing&&isId(this.#renewalId)&&this.#clock()<this.#renewUntil;}
 get deploymentMode(){return this.#profile==='managed'?(this.#deployment?.mode||'UNAVAILABLE'):null;}
 get targets(){return this.#targets===undefined?undefined:structuredClone(this.#targets);}
 reset(){this.#epoch++;this.#csrf='';this.#actor='';this.#until=0;this.#idleUntil=0;this.#idleMs=0;this.#deployment=null;this.#renewalId='';this.#renewUntil=0;this.#renewing=false;this.#targets=undefined;this.#policySignature='';}
 async request(path,method='POST',data={},authorization){
  if(!/^\/(?:session|connect|logout|renew|capabilities|deployment|(?:wallet|webapp|role|user)\/(?:state|channels|previews|operations)(?:[/?].*)?)$/.test(path)||path.includes('..')||path.includes('\\')||(/^\/(role|user)\//.test(path)&&this.#profile!=='managed')||(path==='/deployment'&&this.#profile!=='managed')||(path==='/renew'&&!this.#tls))throw new GuardError('invalid_request');
  const epoch=this.#epoch,started=this.#clock(),headers={Accept:'application/json'};
  if(this.#actor&&!this.connected&&path!=='/logout'){this.reset();throw new GuardError('reconnect_required');}
  if(method!=='GET'){headers['Content-Type']='application/json';headers['X-IrisOps-CSRF']=this.#csrf;}
  if(authorization)headers.Authorization=authorization;
  let r,body;
  try{r=await this.#fetch(this.#root+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});body=await r.json();}
  catch{throw new GuardError('connection_or_response_lost');}
  if(epoch!==this.#epoch)throw new GuardError('connection_changed');
  if(!body||typeof body!=='object'||Array.isArray(body))throw new GuardError('invalid_response');
  if(r.status===401){this.reset();throw new GuardError('reconnect_required',401);}
  if(!r.ok&&!['BLOCKED','UNKNOWN','RECEIPT_INCOMPLETE','FAILED_BEFORE_DISPATCH'].includes(body.state))throw new GuardError(typeof body.error==='string'?body.error:'request_rejected',r.status);
  // Deployment/session polling cannot keep a native authorization alive.
  if(r.ok&&this.#actor&&(path==='/capabilities'||/^\/(wallet|webapp|role|user)\//.test(path)))this.#idleUntil=Math.min(this.#until,started+this.#idleMs);
  return body;
 }
 async login(user,password){
  this.reset();const epoch=this.#epoch;
  if(typeof user!=='string'||!user||user.includes(':')||typeof password!=='string'||!password)throw new GuardError('credentials_required');
  try{
   const basic='Basic '+btoa(Array.from(new TextEncoder().encode(user+':'+password),b=>String.fromCharCode(b)).join(''));
   const s=await this.request('/session','GET',undefined,basic);
   if(s.actor!==user||typeof s.csrf!=='string'||!s.csrf)throw new GuardError('invalid_session');
   this.#csrf=s.csrf;const started=this.#clock();
   const info=await this.request('/connect','POST',{user,password});
   this.#accept(info,user,started);
   await this.deploymentState();
   return {actor:user,authorizationSeconds:this.remainingSeconds};
  }catch(e){if(epoch===this.#epoch)this.reset();throw e;}
 }
 #accept(info,user,started,renewal=false){
  const cap=this.#tls?300:60,seconds=info.authorizationSeconds,idle=Math.min(this.#tls?120:60,seconds);
  if(info.actor!==user||info.connected!==true||info.mode!=='read-only'||!Number.isInteger(seconds)||seconds<1||seconds>cap||(this.#tls&&info.idleSeconds!==idle))throw new GuardError('invalid_session');
  if(this.#tls){
   if(!isId(info.renewalId)||!Number.isInteger(info.renewalSeconds)||info.renewalSeconds<seconds||info.renewalSeconds>300)throw new GuardError('invalid_session');
   const deadline=started+info.renewalSeconds*1000;
   if(renewal&&deadline>this.#renewUntil+1000)throw new GuardError('invalid_session');
   this.#renewUntil=renewal?Math.min(this.#renewUntil,deadline):deadline;this.#renewalId=info.renewalId;
  }
  this.#actor=user;this.#until=Math.min(started+seconds*1000,this.#tls?this.#renewUntil:Infinity);this.#idleMs=idle*1000;this.#idleUntil=Math.min(this.#until,started+this.#idleMs);
  if(!this.connected)throw new GuardError('reconnect_required');
 }
 async renew(){
  if(!this.renewable)throw new GuardError('reconnect_required');
  const id=this.#renewalId,user=this.#actor,started=this.#clock(),epoch=++this.#epoch;
  this.#renewing=true;this.#renewalId='';
  try{
   const info=await this.request('/renew','POST',{confirmation:'RENEW READ ONLY',renewalId:id});
   if(info.renewalId===id)throw new GuardError('invalid_session');
   this.#accept(info,user,started,true);await this.deploymentState();
   return {actor:user,authorizationSeconds:this.remainingSeconds};
  }catch(e){if(epoch===this.#epoch)this.reset();throw e;}
  finally{if(epoch===this.#epoch)this.#renewing=false;}
 }
 async deploymentState(){
  if(this.#profile!=='managed')return null;
  if(!this.connected)throw new GuardError('reconnect_required');
  let value;
  try{value=await this.request('/deployment','GET');}catch(e){this.reset();if(e.code==='connection_or_response_lost')throw new GuardError('deployment_unavailable');throw e;}
  if(Object.keys(value).sort().join(',')!=='build,generation,mode'||!['READ_ONLY','ACTIVE'].includes(value.mode)||!['managed-lab-a','managed-lab-b'].includes(value.build)||!isId(value.generation)){this.reset();throw new GuardError('invalid_response');}
  if(this.#deployment&&['generation','mode','build'].some(k=>this.#deployment[k]!==value[k])){this.reset();throw new GuardError('deployment_changed_reconnect_required');}
  this.#deployment={...value};return {...value};
 }
 async capabilities(){
  if(!this.connected)throw new GuardError('reconnect_required');
  const value=await this.request('/capabilities','GET'),out={};
  if(this.#profile==='managed'){
   try{
    const keys=Object.keys(value).sort().join(',');
    if(!['policy,wallet,webapp','policy,role,wallet,webapp','policy,role,user,wallet,webapp'].includes(keys)||!value.policy||Array.isArray(value.policy)||Object.keys(value.policy).sort().join(',')!=='generation,resources')throw Error();
    const configured=value.policy.generation!=='';
    if(configured&&!isId(value.policy.generation))throw Error();
    const context=configured?targetContext({wallet:value.wallet?.target,webapp:value.webapp?.target,resources:value.policy.resources,...(value.role?.target?{role:value.role.target}:{}),...(value.user?.target?{user:value.user.target}:{})}):null;
    if(!configured&&(!Array.isArray(value.policy.resources)||value.policy.resources.length))throw Error();
    for(const kind of ['wallet','webapp']){
     const v=value[kind];
     if(!v||Array.isArray(v)||Object.keys(v).sort().join(',')!=='available,reason,target'||typeof v.available!=='boolean')throw Error();
     if(!configured?(v.target!==''||v.available||v.reason!=='target_policy_required'):v.reason!==(v.available?'available':'native_permission_required'))throw Error();
     out[kind]={available:v.available,target:v.target,reason:v.reason};
    }
    const role=value.role||{available:false,target:'',reason:'target_policy_required'};
    if(Object.keys(role).sort().join(',')!=='available,reason,target'||typeof role.available!=='boolean')throw Error();
    if(!configured||role.target===''){
      if(role.target!==''||role.available||role.reason!=='target_policy_required')throw Error();
    }else if(role.reason!==(role.available?'available':'native_permission_required'))throw Error();
    if(role.target!==''&&context?.role!==role.target)throw Error();
    out.role={available:role.available,target:role.target,reason:role.reason};
    const user=value.user||{available:false,target:'',reason:'target_policy_required'};
    if(Object.keys(user).sort().join(',')!=='available,reason,target'||typeof user.available!=='boolean')throw Error();
    if(!configured||user.target===''){
      if(user.target!==''||user.available||user.reason!=='target_policy_required')throw Error();
    }else if(user.reason!==(user.available?'available':'native_permission_required'))throw Error();
    if(user.target!==''&&context?.user!==user.target)throw Error();
    out.user={available:user.available,target:user.target,reason:user.reason};
    const signature=JSON.stringify({generation:value.policy.generation,context});
    if(this.#policySignature&&this.#policySignature!==signature){this.reset();throw new GuardError('target_policy_changed');}
    this.#policySignature=signature;this.#targets=context;
    return out;
   }catch(e){this.reset();throw e instanceof GuardError?e:new GuardError('invalid_response');}
  }
  if(Object.keys(value).sort().join(',')!=='wallet,webapp')throw new GuardError('invalid_response');
  for(const [kind,target] of [['wallet',WALLET],['webapp',WEBAPP]]){
   const v=value[kind];
   if(!v||Object.keys(v).sort().join(',')!=='available,reason,target'||typeof v.available!=='boolean'||v.target!==target||v.reason!==(v.available?'available':'native_permission_required'))throw new GuardError('invalid_response');
   out[kind]={available:v.available,target,reason:v.reason};
  }
  return out;
 }
 async logout(){try{if(this.#csrf)await this.request('/logout');}finally{this.reset();}}
}
