// This runner may modify ONLY its named disposable lab and its own fixtures.
// Credentials, bearer tokens and cookies stay in memory and are never reported.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

const docker = process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker, 'Set the Docker executable explicitly');
const container = 'iris-ops-guard-dev-20260925';
const expectedId = 'd514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin = 'http://127.0.0.1:52801';
const prefix = origin + '/api/irisops-guard';
const user = 'IrisOps_GuardProbeUser', role = 'IrisOps_GuardProbeRole';
const wallet = 'IrisOps_GuardProbeWallet', resource = 'IrisOps_GuardProbeResource';
const password = randomBytes(32).toString('base64url') + 'aA1!';
const basic = 'Basic ' + Buffer.from(user + ':' + password).toString('base64');
const evidence = [];
const failures = [];
function run(args, input) {
  try { return execFileSync(docker, args, { input, encoding:'utf8', stdio:'pipe', timeout:45000 }); }
  catch { throw new Error('Lab command failed; sensitive terminal output suppressed'); }
}
function terminal(lines, ns='%SYS') {
  const output=run(['exec','-i',container,'iris','session','IRIS','-U',ns], [...lines,'halt',''].join('\n'));
  // Do not propagate the terminal buffer, which may echo a setup credential.
  assert.ok(!output.includes('FIXTURE_FAILED') && !output.includes('<'), 'IRIS lab command rejected; raw output suppressed');
  return output;
}
const check = 'if sc\'=1 write "FIXTURE_FAILED",! halt';
function adminChange(lines) { const out=terminal([...lines,'write "DONE",!']); assert.ok(out.includes('DONE')); }
function pass(name) { evidence.push(name); console.log('PASS '+name); }
async function request(path, headers={}, method='GET') {
  const response=await fetch(prefix+path,{method,headers,redirect:'manual'});
  const text=await response.text();
  let data; try { data=JSON.parse(text); } catch { data=null; }
  return {status:response.status,headers:response.headers,data};
}
assert.equal(run(['inspect','--format','{{.Id}}',container]).trim(),expectedId,'Wrong lab instance');
const baseline=terminal(['set sc=##class(Security.Applications).Get("/api/admin",.p)',check,'write "BASELINE=",p("Enabled"),"|",p("Resource"),"|",p("DispatchClass"),"|",p("NameSpace"),!']);
assert.ok(baseline.includes('BASELINE=1||%Api.Admin|%SYS'),'Unexpected native configuration; refusing to change it');
for (const cls of ['Transport','Api']) {
  run(['cp',fileURLToPath(new URL(`IrisOps.Guard.${cls}.cls`,import.meta.url)),`${container}:/tmp/IrisOps.Guard.${cls}.cls`]);
  const compiled=terminal([`set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.${cls}.cls","ck")`,check,'write "COMPILED",!'],'IRISOPS');
  assert.ok(compiled.includes('COMPILED'),'Class not compiled');
}
const absent=terminal([
  `write "COLLISION=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Resources).Exists("${resource}"),!`,
]);
assert.ok(absent.includes('COLLISION=0000'),'Fixture already exists; will not replace it');
const map=terminal(['set sc=##class(Config.MapPackages).Get("%SYS","IrisOps.Guard",.p) write "MAP=",$select(sc=1:p("Database"),1:"ABSENT"),!']);
if(map.includes('MAP=ABSENT')) adminChange(['set p("Database")="IRISOPS"','set sc=##class(Config.MapPackages).Create("%SYS","IrisOps.Guard",.p)',check]);
else assert.ok(map.includes('MAP=IRISOPS'),'Refusing unrelated mapping');
let owns=false, completed=false;
try {
  // Lab endpoint is not installed by module.xml and has no write capability.
  const app=terminal(['write "APP_EXISTS=",##class(Security.Applications).Exists("/api/irisops-guard"),!']);
  if (app.includes('APP_EXISTS=0')) {
    adminChange([
      'set p("NameSpace")="IRISOPS",p("DispatchClass")="IrisOps.Guard.Api",p("Enabled")=1,p("AutheEnabled")=32,p("UseCookies")=2,p("CookiePath")="/api/irisops-guard/",p("Timeout")=600,p("SessionScope")=2,p("UserCookieScope")=2',
      'set sc=##class(Security.Applications).Create("/api/irisops-guard",.p)',check,
    ]);
  } else {
    const appCheck=terminal(['set sc=##class(Security.Applications).Get("/api/irisops-guard",.p)',check,'write "OWN_APP=",(p("DispatchClass")="IrisOps.Guard.Api")&&((p("NameSpace")="IRISOPS")||(p("NameSpace")="%SYS")),!']);
    assert.ok(appCheck.includes('OWN_APP=1'),'Refusing unrelated endpoint');
  }
  adminChange(['set p("NameSpace")="%SYS"','set sc=##class(Security.Applications).Modify("/api/irisops-guard",.p)',check]);
  terminal([`set ^IrisOpsGuardConfig("origin")="${origin}"`],'IRISOPS');
  owns=true;
  adminChange([
    `set sc=##class(Security.Resources).Create("${resource}","Disposable guard probe","")`,check,
    `set sc=##class(Security.Roles).Create("${role}","Disposable guard probe","%Admin_Wallet:U,%DB_IRISOPS:R","")`,check,
    `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable guard probe","USER","","",0,1)`,check,
    `set p("EditResource")="${resource}:WRITE",p("UseResource")="${resource}:READ"`,
    `set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,
  ]);
  const anonymous=await request('/v1/session');
  assert.equal(anonymous.status,401,'Anonymous request must be rejected');
  pass('anonymous request rejected');
  const login=await request('/v1/session',{Authorization:basic});
  assert.equal(login.status,200,'Native CSP session login');
  assert.equal(login.data?.actor,user,'Native session identity');
  assert.equal(login.data.mode,'read-only');
  assert.equal(typeof login.data.csrf,'string');
  const cookies=login.headers.getSetCookie();
  assert.ok(cookies.length>0,'Native session cookie expected');
  assert.ok(cookies.some(c=>/HttpOnly/i.test(c)),'Session cookie must be HttpOnly');
  const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const sessionHeaders={Cookie:cookie};
  const session=await request('/v1/session',sessionHeaders);
  assert.equal(session.status,200,'Cookie-only session');
  assert.equal(session.data.actor,user);
  assert.ok(session.data.csrf===login.data.csrf,'Session continuity');
  pass('native HttpOnly cookie session preserves actor without browser JWT');
  const nativeLogin=await fetch(origin+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,password})});
  assert.equal(nativeLogin.status,200,'Independent observer login');
  const nativeAuth=await nativeLogin.json();
  const token=(nativeAuth.result||nativeAuth).access_token;
  assert.equal(typeof token,'string');
  async function nativeRead() {
    const r=await fetch(origin+`/api/admin/v2/wallet/collection?name=${wallet}`,{headers:{Authorization:'Bearer '+token}});
    let data; try { data=await r.json(); } catch { data=null; }
    return {status:r.status,data:data?.result||data};
  }
  const original=await nativeRead();
  assert.equal(original.status,200,'Native positive-control read');
  adminChange([`set p("Resources")="%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  const nativeDenied=await nativeRead();
  assert.equal(nativeDenied.status,403,'Official API sees role revocation with the same token');
  adminChange([`set p("Resources")="%Admin_Wallet:U,%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  assert.equal((await nativeRead()).status,200);
  pass('official API positive control: same token sees permission removal and restoration');
  for (const headers of [sessionHeaders,{...sessionHeaders,Origin:origin},{...sessionHeaders,Origin:'https://untrusted.invalid','X-IrisOps-CSRF':login.data.csrf},{...sessionHeaders,Origin:origin,'X-IrisOps-CSRF':'wrong'}]) {
    assert.equal((await request('/v1/logout',headers,'POST')).status,403);
  }
  assert.equal((await request('/v1/session',sessionHeaders)).data.actor,user);
  pass('missing/foreign origin and missing/wrong CSRF rejected without logout');
  for (const method of ['POST','PUT','PATCH','DELETE']) {
    const denied=await request('/v1/wallet?name='+wallet,sessionHeaders,method);
    assert.ok(denied.status>=400 && denied.status<500,'No wallet mutation route');
  }
  assert.equal((await nativeRead()).data.UseResource,original.data.UseResource);
  assert.equal((await nativeRead()).data.EditResource,original.data.EditResource);
  pass('all four direct mutation verbs rejected; independent wallet state unchanged');
  assert.equal((await request('/v1/wallet?name=%25SYS',sessionHeaders)).status,400);
  pass('invalid wallet identifier rejected before transport');
  const adapted=await request('/v1/wallet?name='+wallet,sessionHeaders);
  console.log('READ_STATUS native='+original.status+' adapter='+adapted.status+' reason='+(adapted.data?.error||'none'));
  if (adapted.status!==200) {
    failures.push({id:'A02',case:'permission-equivalent internal transport',nativeStatus:original.status,adapterStatus:adapted.status,reason:adapted.data?.error||'non_json_error'});
    assert.deepEqual(Object.keys(adapted.data||{}),['error'],'Generic error must not expose diagnostics');
    assert.equal((await request('/v1/session',sessionHeaders)).data.actor,user);
    pass('rejected transport returns a generic error and preserves session identity');
  } else {
  assert.equal(adapted.status,original.status,'Native vs adapter authorization');
  assert.equal(adapted.status,200);
  assert.equal(adapted.data.EditResource,original.data.EditResource);
  assert.equal(adapted.data.UseResource,original.data.UseResource);
  pass('restricted wallet operator gets same allowlisted metadata via adapter and SysAdmin');
  adminChange([`set p("Resources")="%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  const revoked=await request('/v1/wallet?name='+wallet,sessionHeaders);
  const nativeRevoked=await nativeRead();
  console.log('REVOKED_STATUS native='+nativeRevoked.status+' adapter='+revoked.status+' reason='+(revoked.data?.error||'none'));
  assert.equal(revoked.status,403,'Existing native session must see revoked role');
  pass('role revocation denies an already authenticated session');
  adminChange([`set p("Resources")="%Admin_Wallet:U,%DB_IRISOPS:R"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  assert.equal((await request('/v1/wallet?name='+wallet,sessionHeaders)).status,200);
  pass('restored role takes effect without replacing user identity');
  // Scoped changes to native entrypoint only in this empty disposable lab.
  adminChange(['set p("Enabled")=0','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
  assert.equal((await request('/v1/wallet?name='+wallet,sessionHeaders)).status,403);
  adminChange(['set p("Enabled")=1','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
  pass('disabled original SysAdmin application blocks internal adapter');
  adminChange([`set p("Resource")="${resource}"`,'set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
  assert.equal((await request('/v1/wallet?name='+wallet,sessionHeaders)).status,403);
  adminChange(['set p("Resource")=""','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
  pass('denied original application resource blocks internal adapter');
  assert.equal((await request('/v1/wallet?name=IrisOps_AbsentProbe',sessionHeaders)).status,404);
  assert.equal((await request('/v1/session',sessionHeaders)).data.actor,user);
  pass('upstream failure restores request, response, namespace and actor');
  }
  const badLogout=await request('/v1/logout',sessionHeaders,'POST');
  assert.equal(badLogout.status,403);
  const logout=await request('/v1/logout',{...sessionHeaders,Origin:origin,'X-IrisOps-CSRF':login.data.csrf},'POST');
  assert.equal(logout.status,200);
  assert.equal((await request('/v1/session',sessionHeaders)).status,401);
  pass('logout requires CSRF and invalidates the native session');
  completed=true;
} finally {
  // Restore native entrypoint even on failure. No production configuration is touched.
  adminChange(['set p("Enabled")=1,p("Resource")=""','set sc=##class(Security.Applications).Modify("/api/admin",.p)',check]);
  if (owns) {
    adminChange([
      `set sc=1 if ##class(%Wallet.Collection).Exists("${wallet}") set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,
      `set sc=1 if ##class(Security.Users).Exists("${user}") set sc=##class(Security.Users).Delete("${user}")`,check,
      `set sc=1 if ##class(Security.Roles).Exists("${role}") set sc=##class(Security.Roles).Delete("${role}")`,check,
      `set sc=1 if ##class(Security.Resources).Exists("${resource}") set sc=##class(Security.Resources).Delete("${resource}")`,check,
    ]);
    const cleaned=terminal([`write "CLEAN=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Resources).Exists("${resource}"),!`]);
    assert.ok(cleaned.includes('CLEAN=0000'),'Fixture cleanup incomplete');
    pass('owned fixtures removed and original SysAdmin settings restored');
  }
  await writeFile(new URL('read-transport-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container,base:'a2d087a8584cf437fc619dc8e4a887c1dd8ba00c',experimental:true,suiteCompleted:completed,ready:completed&&failures.length===0,completedChecks:evidence,failures},null,2)+'\n');
}
if(failures.length) { console.error('NOT READY: internal transport permission-equivalence gate failed. No administrative writes enabled.'); process.exitCode=1; }
