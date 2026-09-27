import test from 'node:test';
import assert from 'node:assert/strict';
import {GuardSession} from './ui/session.js';
import {CombinedGuard} from '../../web/assets/combined-guard.js';
function fixture(){
 let now=0,serial=1,extra=()=>null;const calls=[],data=new Map();
 const id=()=>String(serial++).padStart(32,'0');
 const auth=()=>({actor:'Tester',connected:true,mode:'read-only',authorizationSeconds:Math.min(59,300-now),idleSeconds:Math.min(59,300-now),renewalId:id(),renewalSeconds:300-now});
 const response=body=>{if(body.wallet&&body.webapp)body.policy={generation:'a'.repeat(32),resources:['IRISOPS_GUARDPROBERESOURCE','IRISOPS_GUARDPROBEALTERNATE']};return {ok:true,status:200,json:async()=>body};};
 const fetcher=async(url,o)=>{calls.push({url,...o});const r=await extra(url,o);if(r)return r;
  return response(url.endsWith('/session')?{actor:'Tester',csrf:'synthetic'}:/\/(connect|renew)$/.test(url)?auth():url.endsWith('/deployment')?{mode:'ACTIVE',generation:'a'.repeat(32),build:'managed-lab-a'}:url.endsWith('/capabilities')?{wallet:{available:true,target:'IrisOps_GuardProbeWallet',reason:'available'},webapp:{available:true,target:'/csp/irisops-guard-testweb',reason:'available'}}:url.endsWith('/channels')?{channel:id(),mode:'read-only'}:url.endsWith('/write-access')?{mode:'write-enabled',expiresIn:60}:{});
 };
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 return {fetcher,clock:()=>now*1000,at:t=>{now=t;},override:f=>{extra=f;},calls,data,storage,response,auth};
}
test('explicit renewal sends no password or upstream token, rotates nonce and invalidates old client epochs',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');const epoch=s.epoch;t.at(40);await s.renew();assert.ok(s.connected);assert.ok(s.epoch>epoch);assert.equal(s.remainingSeconds,59);
 const sent=t.calls.filter(c=>c.url.endsWith('/renew'));assert.equal(sent.length,1);assert.deepEqual(Object.keys(JSON.parse(sent[0].body)).sort(),['confirmation','renewalId']);assert.equal(sent[0].headers.Authorization,undefined);assert.equal(sent[0].body.includes('synthetic'),false);assert.equal(JSON.parse(sent[0].body).confirmation,'RENEW READ ONLY');
});
test('continuous explicit renewals cannot extend the original five-minute family',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');for(const second of [40,80,120,160,200,240,280,299]){t.at(second);await s.renew();assert.ok(s.connected);}t.at(300);assert.equal(s.connected,false);const n=t.calls.length;await assert.rejects(s.renew());assert.equal(t.calls.length,n);
});
test('native expiry and idle stop renewal without even sending an HTTP request',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');t.at(59);const n=t.calls.length;await assert.rejects(s.renew());assert.equal(t.calls.length,n);assert.equal(s.renewable,false);
});
test('lost renewal response consumes local permission to renew; no retry',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');t.override(url=>{if(url.endsWith('/renew'))throw Error('lost');});await assert.rejects(s.renew());assert.equal(s.connected,false);await assert.rejects(s.renew());assert.equal(t.calls.filter(c=>c.url.endsWith('/renew')).length,1);
});
test('malformed or extended renewal metadata cannot reactivate a session',async()=>{
 for(const change of [{actor:'other'},{mode:'write-enabled'},{renewalSeconds:300},{renewalId:'not-an-id'},{renewalId:'1'.padStart(32,'0')},{authorizationSeconds:60,idleSeconds:120}]){
  const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');t.at(40);t.override(url=>url.endsWith('/renew')?t.response({...t.auth(),...change}):null);await assert.rejects(s.renew());assert.equal(s.connected,false);
 }
});
test('overlapping renewal is rejected and logout/reset prevents late reactivation',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed',true);await s.login('Tester','synthetic');let release,seen;const started=new Promise(r=>{seen=r;});t.override(async url=>{if(url.endsWith('/renew')){seen();await new Promise(r=>{release=r;});}});const p=s.renew();await started;await assert.rejects(s.renew());s.reset();release();await assert.rejects(p);assert.equal(s.connected,false);assert.equal(t.calls.filter(c=>c.url.endsWith('/renew')).length,1);
});
test('renewal resets both workspaces to read-only and retains stored recovery evidence',async()=>{
 const t=fixture(),g=new CombinedGuard({origin:'https://127.0.0.1:52804',fetcher:t.fetcher,storage:t.storage,clock:t.clock,profile:'managed'});await g.login('Tester','synthetic');await g.enable();await g.select('webapp');await g.enable();assert.ok(g.status.writing);t.data.set('preserved-evidence','synthetic-proof');await g.renew();assert.ok(g.status.connected);assert.equal(g.status.writing,false);await g.select('wallet');assert.equal(g.status.writing,false);assert.equal(t.data.get('preserved-evidence'),'synthetic-proof');assert.equal(t.calls.filter(c=>c.url.endsWith('/write-access')).length,2);
});
test('non-TLS profiles cannot request renewal',async()=>{
 const t=fixture(),s=new GuardSession(t.fetcher,t.clock,'managed');await assert.rejects(s.request('/renew'));assert.equal(t.calls.length,0);
});
