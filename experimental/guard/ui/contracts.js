// Shared by both browser UIs. Rebuild nested values from exact metadata schemas;
// a server label alone is never sufficient evidence of a verified operation.
export const WALLET='IrisOps_GuardProbeWallet';
export const WEBAPP='/csp/irisops-guard-testweb';
export function webState(value,empty=false){
 if(empty&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)return {};
 shape(value,['Enabled','configurationHash']);
 if(typeof value.Enabled!=='boolean'||typeof value.configurationHash!=='string'||!/^[a-f0-9]{64}$/.test(value.configurationHash))fail();
 return {Enabled:value.Enabled,configurationHash:value.configurationHash};
}
export function roleState(value,empty=false,resources=[]){
 if(empty&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)return {};
 shape(value,['resource','permissions','configurationHash']);
 if(typeof value.resource!=='string'||!resources.includes(value.resource)||
   !['','R','RW','RWU','U'].includes(value.permissions)||
   typeof value.configurationHash!=='string'||!/^[a-f0-9]{64}$/.test(value.configurationHash))fail();
 return {resource:value.resource,permissions:value.permissions,configurationHash:value.configurationHash};
}
const defaults={wallet:WALLET,webapp:WEBAPP,resources:['IRISOPS_GUARDPROBERESOURCE','IRISOPS_GUARDPROBEALTERNATE']};
export function userState(value,empty=false,role=''){
 if(empty&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)return {};
 shape(value,['role','assigned','configurationHash']);
 if(!role||value.role!==role||typeof value.assigned!=='boolean'||typeof value.configurationHash!=='string'||!/^[a-f0-9]{64}$/.test(value.configurationHash))fail();
 return {role:value.role,assigned:value.assigned,configurationHash:value.configurationHash};
}
export function targetContext(value){
 shape(value,['wallet','webapp','resources',...(Object.hasOwn(value||{},'role')?['role']:[]),...(Object.hasOwn(value||{},'user')?['user']:[])]);
 if(typeof value.wallet!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.wallet)||typeof value.webapp!=='string'||!/^\/csp\/[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.webapp))fail();
 if(['sys','ops','docbook','broker','healthshare','ensportal','oauth2','irisops-managed-guard'].includes(value.webapp.slice(5).toLowerCase()))fail();
 if(!Array.isArray(value.resources)||value.resources.length<1||value.resources.length>8||new Set(value.resources).size!==value.resources.length||value.resources.some(r=>typeof r!=='string'||!/^[A-Z][A-Z0-9_-]{0,57}$/.test(r)))fail();
 if(Object.hasOwn(value,'role')&&(typeof value.role!=='string'||(value.role!==''&&!/^IrisOps_[A-Za-z0-9_-]{1,56}$/.test(value.role))))fail();
 if(Object.hasOwn(value,'user')&&(typeof value.user!=='string'||!/^IrisOps_[A-Za-z0-9_-]{1,56}$/.test(value.user)||!value.role||value.user.toUpperCase()===value.role.toUpperCase()))fail();
 return structuredClone(value);
}
function codec(kind,context){
 const targets=context===undefined?defaults:targetContext(context);
 if(kind==='wallet')return {target:targets.wallet,read:(v,e)=>policy(v,e,targets.resources),same,empty:v=>v.EditResource==='',reason:'both_policy_fields_match'};
 if(kind==='webapp')return {target:targets.webapp,read:webState,same:(a,b)=>a.Enabled===b.Enabled&&a.configurationHash===b.configurationHash,empty:v=>Object.keys(v).length===0,reason:'availability_and_configuration_match'};
 if(kind==='role'&&typeof targets.role==='string'&&targets.role)return {target:targets.role,read:(v,e)=>roleState(v,e,targets.resources),same:(a,b)=>a.resource===b.resource&&a.permissions===b.permissions&&a.configurationHash===b.configurationHash,empty:v=>Object.keys(v).length===0,reason:'role_grant_set_matches'};
 if(kind==='user'&&targets.user)return {target:targets.user,read:(v,e)=>userState(v,e,targets.role),same:(a,b)=>a.role===b.role&&a.assigned===b.assigned&&a.configurationHash===b.configurationHash,empty:v=>Object.keys(v).length===0,reason:'user_membership_matches'};
 fail();
}
export const isId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export const isKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=()=>{throw new TypeError('invalid_response');};
function shape(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||
   Object.keys(value).sort().join(',')!==[...keys].sort().join(','))fail();
}
function stamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))fail();
 return value;
}
export function policy(value,empty=false,resources=defaults.resources){
 shape(value,['EditResource','UseResource']);
 if(empty&&value.EditResource===''&&value.UseResource==='')return {EditResource:'',UseResource:''};
 for(const field of ['EditResource','UseResource'])if(typeof value[field]!=='string'||
   !/^[A-Z][A-Z0-9_-]{0,57}:(READ|WRITE|USE)$/.test(value[field])||!resources.includes(value[field].split(':')[0]))fail();
 return {EditResource:value.EditResource,UseResource:value.UseResource};
}
const same=(a,b)=>a.EditResource===b.EditResource&&a.UseResource===b.UseResource;
// Native inventory can use original resource casing and R/W/U abbreviations.
// Normalize ONLY that read contract; server-owned previews/receipts stay canonical.
export function walletMetadata(value,target,resources=defaults.resources){
 shape(value,['name','EditResource','UseResource']);
 if(value.name!==target)fail();
 const normalized={};
 for(const field of ['EditResource','UseResource']){
  const v=value[field];
  if(typeof v!=='string'||v.length>64)fail();
  const m=/^([A-Za-z][A-Za-z0-9_-]{0,57})(?::(R|READ|W|WRITE|U|USE))?$/i.exec(v);
  if(!m)fail();
  const permission=m[2]?.toUpperCase()||(field==='EditResource'?'WRITE':'READ');
  normalized[field]=m[1].toUpperCase()+':'+({R:'READ',W:'WRITE',U:'USE'}[permission]||permission);
 }
 return {name:target,...policy(normalized,false,resources)};
}
const blocked=new Set(['read_only_or_expired_channel','channel_changed','preview_expired','permission_revoked',
 'recovery_permission_required','target_not_readable','stale','target_busy','authorization_expired','authorization_changed','target_policy_changed']);
function eventState(state,reason,verifiedReason){
 if(state==='DISPATCHING')return reason==='submitted_once';
 if(state==='BLOCKED')return blocked.has(reason);
 if(state==='VERIFIED')return reason===verifiedReason;
 if(state==='MISMATCH')return reason==='readback_differs';
 if(state==='UNKNOWN')return ['write_outcome_not_verified','readback_unavailable'].includes(reason);
 return false;
}
export function preview(value,kind='wallet',context){
 const c=codec(kind,context);
 shape(value,['id','recoveryKey','target','confirmation','expiresIn','before','expected']);
 if(!isId(value.id)||!isKey(value.recoveryKey)||value.target!==c.target||value.confirmation!=='APPLY '+value.id.slice(0,8)||value.expiresIn!==30)fail();
 const before=c.read(value.before),expected=c.read(value.expected);if(c.same(before,expected))fail();
 if(kind==='webapp'&&(before.Enabled===expected.Enabled||before.configurationHash!==expected.configurationHash))fail();
 if(kind==='role'&&(before.resource!==expected.resource||before.permissions===expected.permissions||before.configurationHash===expected.configurationHash))fail();
 if(kind==='user'&&(before.role!==expected.role||before.assigned===expected.assigned||before.configurationHash===expected.configurationHash))fail();
 return {id:value.id,recoveryKey:value.recoveryKey,target:c.target,confirmation:value.confirmation,expiresIn:30,before,expected};
}
export function observation(value,receipt,kind='wallet',context){
 const c=codec(kind,context),fields=kind==='wallet'?['EditResource','UseResource']:kind==='webapp'?['Enabled','configurationHash']:kind==='user'?['role','assigned','configurationHash']:['resource','permissions','configurationHash'];
 shape(value,['at','outcome',...fields,'causality']);
 const current=c.read(Object.fromEntries(fields.map(k=>[k,value[k]])));
 const outcome=c.same(current,receipt.expected)?'MATCHES_EXPECTED':c.same(current,receipt.before)?'MATCHES_BEFORE':'DIFFERS';
 if(value.causality!=='not_proven'||value.outcome!==outcome)fail();
 return {at:stamp(value.at),outcome,...current,causality:'not_proven'};
}
export function receipt(value,{id,actor,approved,allowIncomplete=false,kind='wallet',context}){
 const c=codec(kind,context);
 if(!value||!isId(id)||value.id!==id)fail();
 if(allowIncomplete&&Object.hasOwn(value,'error')){
   shape(value,['id','state','error']);
   if(!((value.state==='RECEIPT_INCOMPLETE'&&value.error==='result_could_not_be_persisted')||
     (['UNKNOWN','FAILED_BEFORE_DISPATCH'].includes(value.state)&&value.error==='execution_unavailable')))fail();
   return {id,state:value.state,reason:value.error,incomplete:true};
 }
 shape(value,['id','actor','target','state','reason','dispatchCount','before','expected','observed','events','rechecks','createdUTC']);
 if(typeof actor!=='string'||!actor||value.actor!==actor||value.target!==c.target||
   !['VERIFIED','BLOCKED','UNKNOWN','MISMATCH'].includes(value.state))fail();
 const before=c.read(value.before),expected=c.read(value.expected),observed=c.read(value.observed,true);
 if(c.same(before,expected))fail();
 if(kind==='webapp'&&(before.Enabled===expected.Enabled||before.configurationHash!==expected.configurationHash))fail();
 if(kind==='role'&&(before.resource!==expected.resource||before.permissions===expected.permissions||before.configurationHash===expected.configurationHash))fail();
 if(approved&&(!c.same(before,approved.before)||!c.same(expected,approved.expected)))fail();
 if(kind==='user'&&(before.role!==expected.role||before.assigned===expected.assigned||before.configurationHash===expected.configurationHash))fail();
 if(value.dispatchCount!==(value.state==='BLOCKED'?0:1))fail();
 if(!Array.isArray(value.events)||value.events.length<1||value.events.length>2||
   !Array.isArray(value.rechecks)||value.rechecks.length>20)fail();
 const events=value.events.map(e=>{
   shape(e,['state','reason','at']);if(!eventState(e.state,e.reason,c.reason))fail();
   return {state:e.state,reason:e.reason,at:stamp(e.at)};
 });
 const first=events[0],last=events.at(-1);
 if(!['DISPATCHING','BLOCKED'].includes(first.state)||
   (first.state==='BLOCKED'&&events.length!==1)||
   (events.length===2&&last.state==='DISPATCHING'))fail();
 if(last.reason!==value.reason||!(last.state===value.state||(value.state==='UNKNOWN'&&last.state==='DISPATCHING')))fail();
 if(value.state==='VERIFIED'&&!c.same(observed,expected))fail();
 if(value.state==='MISMATCH'&&(c.empty(observed)||c.same(observed,expected)))fail();
 if(['UNKNOWN','BLOCKED'].includes(value.state)&&!c.empty(observed))fail();
 const result={id,actor,target:c.target,state:value.state,reason:value.reason,dispatchCount:value.dispatchCount,
   before,expected,observed,events,rechecks:[],createdUTC:stamp(value.createdUTC)};
 result.rechecks=value.rechecks.map(value=>observation(value,result,kind,context));
 return result;
}
export function recovery(value,{id,actor,record,kind='wallet',context}){
 shape(value,['receipt','currentObservation','observationPersisted','administrativeWrites']);
 if(value.administrativeWrites!==0||![record,Number(record)].includes(value.observationPersisted))fail();
 const r=receipt(value.receipt,{id,actor,kind,context}),current=observation(value.currentObservation,r,kind,context);
 if(record&&JSON.stringify(r.rechecks.at(-1))!==JSON.stringify(current))fail();
 return {receipt:r,currentObservation:current,observationPersisted:record,administrativeWrites:0};
}
