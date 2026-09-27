import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardSession} from './ui/session.js';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
const generation='a'.repeat(32);
function fixture({tls=true}={}){
 let now=0,extra=()=>null,sequence=0;const calls=[];
 const fetcher=async(url,o)=>{calls.push(url);const override=await extra(url,o);if(override)return override;
  const remaining=3600-Math.floor(now/1000);
  const body=url.endsWith('/session')?{actor:'Tester',csrf:'synthetic'}:/\/(connect|renew)$/.test(url)?{actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:tls?Math.min(59,remaining):60,...(tls?{idleSeconds:remaining,renewalId:String(++sequence).padStart(32,'0'),renewalSeconds:remaining}:{})}:url.endsWith('/deployment')?{mode:'ACTIVE',generation,build:'managed-lab-a'}:url.endsWith('/capabilities')?{wallet:{available:true,target:'IrisOps_GuardProbeWallet',reason:'available'},webapp:{available:true,target:'/csp/irisops-guard-testweb',reason:'available'}}:url.endsWith('/channels')?{channel:generation,mode:'read-only'}:url.endsWith('/write-access')?{mode:'write-enabled',expiresIn:60}:{ok:true};
  if(url.endsWith('/capabilities'))body.policy={generation,resources:['IRISOPS_GUARDPROBERESOURCE','IRISOPS_GUARDPROBEALTERNATE']};
  return {ok:true,status:200,json:async()=>body};};
 return {fetcher,clock:()=>now,at:n=>{now=n*1000;},override:f=>{extra=f;},calls};
}
test('TLS session has an absolute one-hour cap despite permitted activity',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');
 for(const second of [40,80,900,1800,3599]){t.at(second);await s.renew();assert.ok(s.connected);}
 t.at(3600);assert.equal(s.connected,false);const before=t.calls.length;await assert.rejects(s.capabilities(),e=>e.code==='reconnect_required');assert.equal(t.calls.length,before);
});
test('deployment polling cannot renew expired native authorization',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');t.at(58);await s.deploymentState();assert.ok(s.connected);t.at(59);assert.equal(s.connected,false);await assert.rejects(s.request('/wallet/channels'),e=>e.code==='renewal_required');
});
test('a lost read response cannot extend native access or the family cap',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');t.at(40);t.override(()=>{throw Error('lost');});await assert.rejects(s.capabilities());t.at(59);assert.equal(s.connected,false);assert.equal(s.renewable,true);
});
test('TLS metadata must exactly match the fixed policy and does not alter HTTP policy',async()=>{
 for(const fields of [{authorizationSeconds:301,idleSeconds:3600,renewalId:generation,renewalSeconds:3600},{authorizationSeconds:300},{authorizationSeconds:300,idleSeconds:3601,renewalId:generation,renewalSeconds:3600},{authorizationSeconds:60,idleSeconds:59,renewalId:generation,renewalSeconds:3600}]){
  const t=fixture();t.override(url=>url.endsWith('/connect')?{ok:true,status:200,json:async()=>({actor:'Tester',connected:true,mode:'read-only',...fields})}:null);
  const s=new GuardSession(t.fetcher,t.clock,'managed',true);await assert.rejects(s.login('Tester','synthetic'),e=>e.code==='invalid_session');assert.equal(s.connected,false);
 }
 const t=fixture({tls:false}),s=new GuardSession(t.fetcher,t.clock,'managed');await s.login('Tester','synthetic');t.at(60);assert.equal(s.connected,false);
 assert.throws(()=>new GuardSession(t.fetcher,t.clock,'combined',true));
});
test('TLS combined UI retains sixty-second write grants and session logout',async()=>{
 const t=fixture(),storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}},g=new CombinedGuard({origin:'https://127.0.0.1:52804',fetcher:t.fetcher,clock:t.clock,storage,profile:'managed'});
 await g.login('Tester','synthetic');await g.enable();assert.ok(g.status.writing);t.at(61);assert.equal(g.status.writing,false);assert.equal(g.status.connected,false);assert.equal(g.status.renewable,true);await g.renew();assert.equal(g.status.connected,true);assert.equal(g.status.writing,false);await g.logout();assert.equal(g.status.connected,false);
});
test('native expiry can shorten TLS authorization and takes precedence over the longer policy cap',async()=>{
 const t=fixture();t.override(url=>url.endsWith('/connect')?{ok:true,status:200,json:async()=>({actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:58,idleSeconds:3600,renewalId:generation,renewalSeconds:3600})}:null);
 const s=new GuardSession(t.fetcher,t.clock,'managed',true);const info=await s.login('Tester','synthetic');assert.equal(info.authorizationSeconds,58);t.at(57);await s.capabilities();t.at(58);assert.equal(s.connected,false);
});
