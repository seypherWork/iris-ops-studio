// Synthetic malformed-response cases: not evidence of a native IRIS secret leak.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {WalletGuard,GUARDED_WALLET} from '../../web/assets/wallet-guard.js';
import {RecoveryStore} from './ui/recovery-store.js';
const id='a'.repeat(32),key='b'.repeat(64);
const before={EditResource:'IRISOPS_GUARDPROBERESOURCE:WRITE',UseResource:'IRISOPS_GUARDPROBERESOURCE:READ'};
const expected={...before,UseResource:'IRISOPS_GUARDPROBEALTERNATE:READ'};
const observations=[];
function fixture(receipt){
 const values=new Map();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const fetcher=async(url)=>{
   let body;
   if(url.endsWith('/session'))body={actor:'Tester',csrf:'synthetic'};
   else if(url.endsWith('/connect'))body={actor:'Tester',connected:true,authorizationSeconds:60};
   else if(url.endsWith('/channels'))body={channel:id,mode:'read-only'};
   else if(url.endsWith('/write-access'))body={mode:'write-enabled',expiresIn:60};
   else if(url.endsWith('/previews'))body={id,recoveryKey:key,target:GUARDED_WALLET,confirmation:'APPLY aaaaaaaa',before,expected,expiresIn:30};
   else if(url.endsWith('/execute'))body=receipt;
   return {status:200,ok:true,json:async()=>body};
 };
 return new WalletGuard({origin:'http://127.0.0.1:52801',storage,fetcher});
}
for(const [name,receipt] of [
 ['verified_without_evidence',{id,state:'VERIFIED'}],
 ['verified_wrong_actor_target_and_readback',{id,state:'VERIFIED',actor:'Other',target:'Other',before,expected,observed:before,events:[]}],
 ['nested_sensitive_fields',{id,state:'VERIFIED',actor:'Tester',target:GUARDED_WALLET,before,expected,observed:{...expected,password:'SYNTHETIC-SENSITIVE-MARKER'},events:[{state:'VERIFIED',privateKey:'SYNTHETIC-SENSITIVE-MARKER'}]}],
]){
 const guard=fixture(receipt);await guard.login('Tester','synthetic');await guard.enable();
 const p=await guard.preview(GUARDED_WALLET,expected.EditResource,expected.UseResource);
 let accepted=false;
 try{await guard.execute(p.id,p.confirmation);accepted=true;}catch{}
 observations.push({name,accepted,visibleState:guard.result.receipt?.state||null,
   nestedMarkerReachesUi:JSON.stringify(guard.result).includes('SYNTHETIC-SENSITIVE-MARKER')});
}
const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
const store=new RecoveryStore(storage);
let arrayAccepted=false;
try{store.remember(id,[key]);arrayAccepted=true;}catch{}
observations.push({name:'non_string_recovery_key',accepted:arrayAccepted,keyType:typeof store.get(id)});
assert.equal(observations.length,4);
for(const o of observations){assert.equal(o.accepted,false,o.name);assert.notEqual(o.nestedMarkerReachesUi,true,o.name);}
await writeFile(new URL('audit-client-remediation.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),complete:true,mode:'synthetic contracts only',observations},null,2)+'\n');
console.log(JSON.stringify(observations,null,2));
