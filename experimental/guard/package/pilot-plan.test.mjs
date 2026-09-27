import test from 'node:test';
import assert from 'node:assert/strict';
import {candidate,digest,makePlan,validatePlan,revalidate,assertOwned} from './pilot-plan.mjs';
import {operator} from './pilot-install.mjs';
const now=1790456400000,request={name:'irisops-pilot-example',port:52805,certificateVolume:'irisops-guard-example-cert-private'};
const snapshot=()=>({daemonId:'test-daemon',imageId:candidate.image,packageHash:candidate.packageHash,certificate:{Name:request.certificateVolume,Driver:'local',Scope:'local',CreatedAt:'2026-09-26T18:00:00Z'},containerAbsent:true,dataAbsent:true,portAvailable:true});
const plan=()=>makePlan(request,snapshot(),{now,nonce:'a'.repeat(32)});
test('pilot plan binds exact new resources, image and package; defaults only to read-only',()=>{const p=plan();assert.equal(validatePlan(p,p.fingerprint,{now}),p);assert.equal(p.action,'INSTALL_NEW_READ_ONLY');revalidate(p,snapshot());});
test('pilot plan rejects occupied names, volume or port',()=>{for(const k of ['containerAbsent','dataAbsent','portAvailable'])assert.throws(()=>makePlan(request,{...snapshot(),[k]:false},{now,nonce:'a'.repeat(32)}));});
test('pilot plan refuses unsafe resource names, non-loopback port input and extra switches',()=>{
 for(const name of ['iris-ops-guard-dev-20260925','../escape','irisops-pilot-;rm','irisops-pilot-a\n'])assert.throws(()=>makePlan({...request,name},snapshot(),{now,nonce:'a'.repeat(32)}));
 for(const port of [80,65536,'52805',NaN,1.5])assert.throws(()=>makePlan({...request,port},snapshot(),{now,nonce:'a'.repeat(32)}));
 assert.throws(()=>makePlan({...request,privileged:true},snapshot(),{now,nonce:'a'.repeat(32)}));
});
test('pilot plan requires exact confirmation, rejects tampering, expiry and future dating',()=>{const p=plan();for(const confirmation of ['',undefined,'b'.repeat(64)])assert.throws(()=>validatePlan(p,confirmation,{now}));assert.throws(()=>validatePlan({...p,nonce:'b'.repeat(32)},p.fingerprint,{now}));assert.throws(()=>validatePlan(p,p.fingerprint,{now:now+900000}));assert.throws(()=>validatePlan(p,p.fingerprint,{now:now-30001}));});
test('even rehashed plans cannot change authority, image, action or lifetime',()=>{
 for(const change of [p=>p.action='ACTIVE',p=>p.schema=2,p=>p.expiresAt++,p=>p.observed.imageId='sha256:'+'0'.repeat(64),p=>p.config.name='original-container']){const p=plan();change(p);const {fingerprint,...body}=p;p.fingerprint=digest(body);assert.throws(()=>validatePlan(p,p.fingerprint,{now}));}
});
test('fresh revalidation rejects changed daemon or certificate volume identity',()=>{for(const change of [s=>s.daemonId='other',s=>s.certificate.CreatedAt='2026-09-26T19:00:00Z']){const s=snapshot();change(s);assert.throws(()=>revalidate(plan(),s));}});
const owned=()=>({Id:'c'.repeat(64),Name:'/'+request.name,Image:candidate.image,Config:{Labels:{'irisops.pilot.owner':'a'.repeat(32)},Env:['ISC_DATA_DIRECTORY=/durable/iris']},HostConfig:{Privileged:false,NetworkMode:'bridge',PortBindings:{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:'52805'}]}},Mounts:[{Type:'volume',Name:request.name+'-data',Destination:'/durable',RW:true},{Type:'volume',Name:request.certificateVolume,Destination:'/run/irisops-tls',RW:false}]});
test('ownership fence validates immutable container ID, exact mounts and loopback-only exposure',()=>assertOwned(owned(),plan(),'c'.repeat(64)));
test('ownership fence rejects replacement, foreign labels, extra mounts and broader ports',()=>{
 for(const change of [c=>c.Id='d'.repeat(64),c=>c.Name='/other',c=>c.Config.Labels={},c=>c.Mounts[1].RW=true,c=>c.Mounts.push({}),c=>c.HostConfig.Privileged=true,c=>c.HostConfig.NetworkMode='host',c=>c.HostConfig.PortBindings['52774/tcp'][0].HostIp='0.0.0.0']){const c=owned();change(c);assert.throws(()=>assertOwned(c,plan(),'c'.repeat(64)));}
});
test('unconfirmed apply refuses before Docker or filesystem mutation',async()=>{const calls=[],op=operator({run:args=>{calls.push(args);throw Error('Unexpected Docker call');}});const p=makePlan(request,snapshot(),{nonce:'a'.repeat(32)});await assert.rejects(op.apply(p,'wrong','must-not-be-created.json'));assert.equal(calls.length,0);});
test('expired apply refuses before Docker or filesystem mutation',async()=>{const calls=[],op=operator({run:args=>{calls.push(args);throw Error('Unexpected Docker call');}});const p=makePlan(request,snapshot(),{now:Date.now()-900001,nonce:'a'.repeat(32)});await assert.rejects(op.apply(p,p.fingerprint,'must-not-be-created.json'));assert.equal(calls.length,0);});
