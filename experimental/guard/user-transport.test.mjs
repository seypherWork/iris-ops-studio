import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runtimeNames} from './package/build.mjs';
const source=await readFile(new URL('./IrisOps.Guard.UserTransport.cls',import.meta.url),'utf8');
const code=source.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
test('user transport reads an allowlisted set of native properties without credential exports',()=>{
 assert.doesNotMatch(code,/Security\.Users\)\.(Get|Export)\(/);
 const properties=[...new Set([...code.matchAll(/\buser\.([A-Za-z]+)/g)].map(m=>m[1]))].sort();
 assert.deepEqual(properties,['CreateDateTime','Enabled','EscalationRoles','Flags','Name','NameSpace','Roles','Routine','SuperUser'].sort());
 assert.doesNotMatch(code,/Password|HOTP|Salt|%Save|%SQL/);
});
test('user transport changes only the selected membership after a fresh policy-bound check',()=>{
 assert.doesNotMatch(code,/Security\.Users\)\.Modify\(|changed\("Roles"\)/);
 const write=code.split('ClassMethod Write(')[1];
 for(const method of ['AddRoles','RemoveRoles']){
  assert.ok(write.indexOf('..State(')<write.indexOf('Security.Users).'+method));
  assert.ok(write.indexOf('expected.configurationHash\'=expectedHash')<write.indexOf('Security.Users).'+method));
 }
 assert.ok(write.includes('set selected=role'));
 assert.ok(write.includes('AddRoles(username,.selected,0)'));
 assert.ok(write.includes('RemoveRoles(username,.selected)'));
 assert.ok(code.includes('Permits("user",username)'));
 assert.ok(code.includes('Permits("role",role)'));
});
test('optional user route requires enrollment and installed code; no portable or generic exposure',async()=>{
 for(const name of ['UserTransport','UserExecution','UserRecovery','UserApi'])assert.ok(!runtimeNames.includes(name));
 const generic=await readFile(new URL('./IrisOps.Guard.CombinedApi.cls',import.meta.url),'utf8');
 assert.doesNotMatch(generic,/UserApi|\/v1\/user/);
 const managed=await readFile(new URL('./IrisOps.Guard.ManagedApi.cls',import.meta.url),'utf8');
 const routing=managed.split('ClassMethod ApiClass(')[1].split('ClassMethod DeploymentStatus(')[0];
 assert.ok(routing.includes('Target("user")="" quit ""'));
 assert.ok(routing.includes('%ExistsId(..#UserApi) quit ""'));
 assert.ok(routing.includes('if class="" quit ..Reply(404'));
});
test('native namespace switching cannot hide the custom guard classes',async()=>{
 const snapshot=code.split('ClassMethod Snapshot(')[1].split('ClassMethod State(')[0];
 assert.doesNotMatch(snapshot,/new \$namespace/);
 assert.ok(snapshot.includes('..NativeMetadata('));
 const policy=await readFile(new URL('./IrisOps.Guard.TargetPolicy.cls',import.meta.url),'utf8');
 const native=policy.split('ClassMethod NativeSnapshot(')[1].split('ClassMethod PrivateResource(')[0];
 assert.ok(native.indexOf('UserTransport).Snapshot')<native.indexOf('new $namespace'));
});
test('user uncertainty recovery is observation-only and uses actor and proof binding',async()=>{
 const recovery=await readFile(new URL('./IrisOps.Guard.UserRecovery.cls',import.meta.url),'utf8');
 const executable=recovery.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
 assert.doesNotMatch(executable,/Security\.Users|\.Write\(|\.Dispatch\(|\.Execute\(|\.Modify\(/);
 assert.ok(executable.includes('r.Actor\'=$username'));
 assert.ok(executable.includes('RecoveryMatches(r.OperationId,key,r.RecoveryHash)'));
 assert.ok(executable.includes('"administrativeWrites":0'));
 assert.doesNotMatch(executable,/set r\.(State|Events|Reason)=/);
});
test('new user workflow inherits durable reservation and repeat-dispatch protection',async()=>{
 const execution=await readFile(new URL('./IrisOps.Guard.UserExecution.cls',import.meta.url),'utf8');
 assert.match(execution,/Extends IrisOps.Guard.Execution/);
 assert.doesNotMatch(execution,/ClassMethod Execute\(/);
 assert.ok(execution.includes('Parameter TargetKind = "user"'));
 assert.ok(execution.includes('Parameter RecoveryClass = "IrisOps.Guard.UserRecovery"'));
 assert.ok(execution.includes('current.configurationHash\'=p.before.configurationHash'));
 assert.ok(execution.includes('current.configurationHash=p.expected.configurationHash'));
});
test('user HTTP preview accepts exactly the narrow membership schema',async()=>{
 const api=await readFile(new URL('./IrisOps.Guard.UserApi.cls',import.meta.url),'utf8');
 assert.ok(api.includes('Body("channel,action,name,role",.body)'));
 assert.ok(api.includes('Parameter TargetKind = "user"'));
 assert.ok(api.includes('Parameter WriteResource = "%Admin_Secure"'));
 assert.doesNotMatch(api,/Security\.Users|Password|PasswordHash|Salt|\.Modify\(/);
 assert.ok(api.includes('if status=200 {'));
 assert.ok(api.includes('Vault).Open(.current)'));
});
test('managed user dispatch goes through the same server write gate as other operations',async()=>{
 const managed=await readFile(new URL('./IrisOps.Guard.ManagedApi.cls',import.meta.url),'utf8');
 const write=managed.split('ClassMethod InvokeWrite(')[1];
 assert.ok(write.includes('set class=..ApiClass(kind)'));
 assert.ok(write.includes('if ..Gate(1)'));
 for(const [method,dispatch] of [['Enable','EnableChannel'],['Preview','Preview'],['Execute','Execute']]){
  assert.match(write,new RegExp('ClassMethod Scoped'+method+'[^\\n]+InvokeWrite\\(kind,"'+dispatch+'"'));
 }
});
