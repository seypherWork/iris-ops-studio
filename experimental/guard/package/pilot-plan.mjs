import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const candidate=Object.freeze({image:'sha256:760c51184a9ccac3f99cf18410e8b726dc4de292a2ef4886807ba98311f2eb93',packageHash:'41f42b7ad6c80d8569880aca0c8a726f137fe421ed7daf048a5ab1757f77328b'});
const keys=(o,wanted)=>assert.deepEqual(Object.keys(o||{}).sort(),[...wanted].sort(),'Unexpected plan fields');
export function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function options(value){
 keys(value,['name','port','certificateVolume']);
 assert.match(value.name,/^irisops-pilot-[a-z0-9][a-z0-9-]{0,35}$/);
 assert.ok(Number.isInteger(value.port)&&value.port>=1024&&value.port<=65535);
 assert.match(value.certificateVolume,/^irisops-guard-[a-z0-9-]{1,85}-cert-private$/);
 return {name:value.name,port:value.port,certificateVolume:value.certificateVolume};
}
export function observed(value,target=candidate){
 keys(value,['daemonId','imageId','packageHash','certificate','containerAbsent','dataAbsent','portAvailable']);
 assert.match(target.image,/^sha256:[a-f0-9]{64}$/);assert.match(target.packageHash,/^[a-f0-9]{64}$/);
 assert.equal(value.imageId,target.image);assert.equal(value.packageHash,target.packageHash);
 assert.ok(typeof value.daemonId==='string'&&value.daemonId.length>0&&value.daemonId.length<160);
 keys(value.certificate,['Name','Driver','Scope','CreatedAt']);
 assert.equal(value.certificate.Driver,'local');assert.equal(value.certificate.Scope,'local');assert.ok(Number.isFinite(Date.parse(value.certificate.CreatedAt)));
 for(const k of ['containerAbsent','dataAbsent','portAvailable'])assert.equal(value[k],true,k+' required');
 return value;
}
export function makePlan(request,snapshot,{now=Date.now(),nonce,target=candidate}={}){
 const config=options(request);observed(snapshot,target);assert.equal(snapshot.certificate.Name,config.certificateVolume);assert.match(nonce,/^[a-f0-9]{32}$/);
 const body={schema:1,action:'INSTALL_NEW_READ_ONLY',config,observed:snapshot,nonce,createdAt:now,expiresAt:now+900000};return {...body,fingerprint:digest(body)};
}
export function validatePlan(plan,confirmation,{now=Date.now(),target=candidate}={}){
 keys(plan,['schema','action','config','observed','nonce','createdAt','expiresAt','fingerprint']);
 assert.equal(plan.schema,1);assert.equal(plan.action,'INSTALL_NEW_READ_ONLY');options(plan.config);observed(plan.observed,target);assert.equal(plan.observed.certificate.Name,plan.config.certificateVolume);
 assert.match(plan.nonce,/^[a-f0-9]{32}$/);assert.ok(Number.isSafeInteger(plan.createdAt));assert.equal(plan.expiresAt,plan.createdAt+900000);assert.ok(now>=plan.createdAt-30000&&now<plan.expiresAt,'Plan expired or future dated');
 const {fingerprint,...body}=plan;assert.equal(fingerprint,digest(body),'Changed plan');assert.match(fingerprint,/^[a-f0-9]{64}$/);assert.equal(confirmation,fingerprint,'Exact plan confirmation required');return plan;
}
export function revalidate(plan,snapshot,target=candidate){observed(snapshot,target);assert.deepEqual(snapshot,plan.observed,'Environment changed; prepare a new plan');}
export function assertOwned(container,plan,id,target=candidate){
 assert.match(id,/^[a-f0-9]{64}$/);assert.equal(container.Id,id);assert.equal(container.Name,'/'+plan.config.name);assert.equal(container.Image,target.image);
 assert.equal(container.Config.Labels?.['irisops.pilot.owner'],plan.nonce);
 assert.deepEqual(container.HostConfig.PortBindings,{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:String(plan.config.port)}]});
 assert.equal(container.Mounts.length,2);
 assert.ok(container.Mounts.some(m=>m.Type==='volume'&&m.Name===plan.config.name+'-data'&&m.Destination==='/durable'&&m.RW));
 assert.ok(container.Mounts.some(m=>m.Type==='volume'&&m.Name===plan.config.certificateVolume&&m.Destination==='/run/irisops-tls'&&!m.RW));
 assert.ok(container.Config.Env.includes('ISC_DATA_DIRECTORY=/durable/iris'));
 assert.equal(container.HostConfig.Privileged,false);assert.equal(container.HostConfig.NetworkMode,'bridge');
}
