import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash,X509Certificate} from 'node:crypto';
import {createRequire} from 'node:module';
import {request} from 'node:https';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const cleanRoot=process.env.IRISOPS_USER_CLEAN_ROOT;
const id=cleanRoot?process.env.IRISOPS_USER_LAB_ID:'3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236',name=cleanRoot?process.env.IRISOPS_USER_LAB_NAME:'irisops-pilot-policy-20260926-e';
const port=cleanRoot?Number(process.env.IRISOPS_USER_LAB_PORT):52808,origin='https://127.0.0.1:'+port,base='/api/irisops-managed-guard/v1';
assert.match(id??'',/^[a-f0-9]{64}$/);if(cleanRoot)assert.match(name??'',/^irisops-pilot-clean-enrolled-20260927-[a-z]$/);
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535&&!([52801,52810].includes(port)));
const target='IrisOps_UserRoleProbeUser',role='IrisOps_UserRoleProbeRole',operatorRole='IrisOps_UserRoleProbeExtra',actor='IrisOps_UserHttpOperator';
const legacy={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:'IrisOps_EnrolledOne,IrisOps_EnrolledTwo'};
const full='%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R',limited='%DB_IRISSYS:R,%DB_IRISOPS:R';
const password=randomBytes(32).toString('base64url')+'aA1!',targetPassword=randomBytes(32).toString('base64url')+'aA1!';
const basic='Basic '+Buffer.from(actor+':'+password).toString('base64');
const run=(args,input)=>{try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Docker/native step failed; raw output withheld');}};
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim(),`${id}|true|/${name}`);
const suffix=process.env.IRISOPS_USER_HTTP_RUN_ID;assert.match(suffix??'',/^[a-z0-9-]{1,30}$/);
const directory=resolve('../irisops-user-http-20260927-'+suffix);await mkdir(directory);
const term=(lines,ns='IRISOPS')=>{const out=run(['exec','-i',id,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!/ERROR #|<PROTECT>|STEP_FAILED|TEST_ERROR=/.test(out),'Native step failed; output withheld');return out;};
const value=(out,label)=>{const m=out.match(new RegExp('^'+label+'=(.*)$','m'));assert.ok(m,'Missing '+label);return m[1].trim();};
const call=expr=>JSON.parse(value(term([`try { set r=${expr} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR=",e.Name,! }`]),'RESULT'));
const mode=next=>{const p=call('##class(IrisOps.Guard.Deployment).Plan()');return call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${next}")`);};
const enroll=c=>{const p=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(c)+')');return call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(c)+',"'+p.fingerprint+'",'+p.expires+')');};
const requireStatus='if $system.Status.IsError(sc) write "STEP_FAILED",! halt';
const absent=()=>assert.equal(value(term([`write "ABSENT=",##class(Security.Users).Exists("${target}")+##class(Security.Users).Exists("${actor}")+##class(Security.Roles).Exists("${role}")+##class(Security.Roles).Exists("${operatorRole}"),!`],'%SYS'),'ABSENT'),'0');
const native=()=>JSON.parse(value(term([`set ok=##class(Security.Users).Exists("${target}",.u,.sc)`,requireStatus,'set roles="" for i=1:1:u.Roles.Count() { set roles=roles_$select(roles="":"",1:",")_u.Roles.GetAt(i) }','set r={"roles":(roles),"enabled":(u.Enabled),"superUser":(u.SuperUser)}','write "NATIVE=",r.%ToJSON(),!'],'%SYS'),'NATIVE'));
const modifyOperator=resources=>term([`set p("Resources")="${resources}",sc=##class(Security.Roles).Modify("${operatorRole}",.p)`,requireStatus],'%SYS');
const ca=run(['exec',id,'cat','/run/irisops-tls/ca.crt']);
const secrets=[password,targetPassword,basic];
const raw=(path,method='GET',body,headers={},allowNativeDenial=false,readinessOnly=false)=>new Promise((res,rej)=>{
 const data=body===undefined?undefined:JSON.stringify(body);
 const req=request({hostname:'127.0.0.1',servername:'',port,path:base+path,method,ca,rejectUnauthorized:true,agent:false,timeout:15000,headers:{...headers,...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},r=>{
  let text='';r.setEncoding('utf8');r.on('data',part=>{text+=part;if(text.length>262144)req.destroy();});r.on('end',()=>{
   if(secrets.some(s=>text.includes(s))){rej(Error('Credential in response'));return;}
   try{res({status:r.statusCode,body:JSON.parse(text),headers:r.headers});}catch{
    if((allowNativeDenial&&[401,403].includes(r.statusCode))||(readinessOnly&&r.statusCode===404))res({status:r.statusCode,body:null,nativeDenial:true});
    else rej(Error('Non-JSON response, status '+r.statusCode));
   }
  });
 });req.on('error',e=>rej(Error('TLS request failed: '+(e.code||'unknown'))));req.on('timeout',()=>req.destroy());req.end(data);
});
let controls={};const http=(p,m='GET',b)=>raw(p,m,b,controls);
async function httpsReady(){
 for(let i=0;i<40;i++){
  // SUSPENDED deliberately disables the application; a verified TLS 404 is ready,
  // not evidence of successful authentication or of a usable guard endpoint.
  try{const r=await raw('/session','GET',undefined,{},true,true);if([401,403,404].includes(r.status))return;}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error('Verified HTTPS readiness failed; no automatic service changes');
}
async function login(){
 const r=await raw('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200);assert.equal(r.body.actor,actor);
 const cookies=r.headers['set-cookie']||[];assert.ok(cookies.some(c=>c.startsWith('CSPSESSIONID')));
 controls={Cookie:cookies.map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};
 const c=await http('/connect','POST',{user:actor,password});assert.equal(c.status,200);assert.equal(c.body.actor,actor);
}
async function channel(write=true){let r=await http('/user/channels','POST',{});assert.equal(r.status,200);const c=r.body.channel;if(write){r=await http(`/user/channels/${c}/write-access`,'POST',{confirmation:'ENABLE WRITES'});assert.equal(r.status,200);}return c;}
const preview=(ch,action='assign',extra={})=>http('/user/previews','POST',{channel:ch,action:'user.membership.'+action,name:target,role,...extra});
const execute=p=>http(`/user/previews/${p.id}/execute`,'POST',{confirmation:p.confirmation,recoveryKey:p.recoveryKey});
const inspect=(p,record=false)=>http(`/user/operations/${p.id}/${record?'reconcile':'inspect'}`,'POST',{recoveryKey:p.recoveryKey});
const checks=[],hashes={};let phase='preflight',complete=false;
try{
 let bootReady=false;for(let i=0;i<80;i++){try{if(term(['write "READY",!']).includes('READY')){bootReady=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(bootReady,'IRIS native runtime readiness');
 absent();assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'SUSPENDED');
 await httpsReady();
 assert.deepEqual(call('##class(IrisOps.Guard.TargetPolicy).Current()').config,{...legacy,resources:legacy.resources.toUpperCase()});
 if(cleanRoot){
  const {verifyBundle}=await import('./package/portable.mjs');const b=await verifyBundle(resolve(cleanRoot));assert.equal(b.runtimeProfile,'enrolled-user-v1');
  for(const e of b.runtime.entries.filter(e=>e.path!=='Dockerfile')){assert.equal(run(['exec',id,'sha256sum','/opt/irisops-guard/'+e.path]).split(/\s/)[0],e.sha256);hashes[e.path]=e.sha256;}
 }else for(const cls of ['Deployment','TargetPolicy','UserTransport','Receipt','UserExecution','UserRecovery','UserApi','CombinedApi','ManagedApi']){
  const file=resolve('experimental/guard/IrisOps.Guard.'+cls+'.cls');hashes[cls]=createHash('sha256').update(await readFile(file)).digest('hex');
  const dest='/tmp/irisops-user-http-'+suffix+'-'+cls+'.cls';run(['cp',file,id+':'+dest]);term([`set sc=$system.OBJ.Load("${dest}","ck")`,requireStatus]);
 }
 if(process.env.IRISOPS_USER_UI==='1'&&!cleanRoot){
  run(['cp',resolve('web')+'/.',id+':/opt/irisops-guard/ui/guard-managed/web/']);
  for(const file of ['client.js','contracts.js','recovery-store.js','session.js'])run(['cp',resolve('experimental/guard/ui/'+file),id+':/opt/irisops-guard/ui/guard-managed/experimental/guard/ui/'+file]);
  for(const file of ['web/index.html','web/assets/app.js','web/assets/styles.css','web/assets/combined-guard.js','web/assets/wallet-guard.js','experimental/guard/ui/client.js','experimental/guard/ui/contracts.js','experimental/guard/ui/recovery-store.js','experimental/guard/ui/session.js']){
   hashes[file]=createHash('sha256').update(await readFile(resolve(file))).digest('hex');
   assert.equal(run(['exec',id,'sha256sum','/opt/irisops-guard/ui/guard-managed/'+file]).split(/\s/)[0],hashes[file]);
  }
 }
 phase='fixtures';term([
  `set sc=##class(Security.Roles).Create("${role}","Owned user HTTP target role","IrisOps_EnrolledOne:R","")`,requireStatus,
  `set sc=##class(Security.Roles).Create("${operatorRole}","Owned user HTTP operator role","${full}","")`,requireStatus,
  `set sc=##class(Security.Users).Create("${target}","","${targetPassword}","Owned disabled HTTP target","USER","","",0,0)`,requireStatus,
  `set sc=##class(Security.Users).Create("${actor}","${operatorRole}","${password}","Owned HTTP operator","USER","","",0,1)`,requireStatus
 ],'%SYS');
 assert.equal(value(term([`set found=##class(Security.Users).Exists("${actor}",.u,.sc)`,requireStatus,'write "SUPERUSER=",u.SuperUser,!'],'%SYS'),'SUPERUSER'),'0');
 phase='read-only';enroll({...legacy,role,user:target});mode('READ_ONLY');await login();
 let r=await http(`/user/state?name=${target}&role=${role}`);assert.equal(r.status,200);assert.equal(r.body.assigned,false);
 let ch=await channel(false);
 r=await http(`/user/channels/${ch}/write-access`,'POST',{confirmation:'ENABLE WRITES'});assert.equal(r.status,403);assert.equal(r.body.error,'deployment_read_only');
 r=await preview(ch);assert.equal(r.status,403);assert.equal(native().roles,'');
 checks.push('authenticated_non_superuser_reads_server_readonly_denies_writes');console.log('PASS authenticated read and server READ_ONLY');
 phase='active';mode('ACTIVE');await login();ch=await channel();
 r=await preview(ch,'assign',{password:'forbidden-field'});assert.equal(r.status,400);
 r=await raw('/user/previews','POST',{channel:ch,action:'user.membership.assign',name:target,role},{...controls,'X-IrisOps-CSRF':'wrong'});assert.equal(r.status,403);
 r=await http('/role/channels','POST',{});assert.equal(r.status,200);const other=r.body.channel;
 r=await preview(other);assert.equal(r.status,403);
 let p=await preview(ch);assert.equal(p.status,200);const grant=p.body;
 r=await http(`/role/previews/${grant.id}/execute`,'POST',{confirmation:grant.confirmation,recoveryKey:grant.recoveryKey});assert.equal(r.status,400);
 r=await execute(grant);assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');assert.equal(r.body.actor,actor);assert.equal(r.body.dispatchCount,1);
 assert.deepEqual(native(),{roles:role,enabled:0,superUser:0});
 r=await execute(grant);assert.equal(r.status,200);assert.equal(r.body.dispatchCount,1);
 r=await inspect(grant);assert.equal(r.status,200);assert.equal(r.body.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(r.body.administrativeWrites,0);
 checks.push('strict_schema_csrf_cross_kind_refusal_assign_readback_replay');console.log('PASS narrow authenticated assign and replay protection');
 phase='permission-revocation';p=await preview(ch,'remove');assert.equal(p.status,200);
 modifyOperator(limited);
 r=await execute(p.body);assert.ok([401,403,409].includes(r.status));assert.equal(native().roles,role);
 await login();r=await http(`/user/state?name=${target}&role=${role}`);assert.equal(r.status,403);
 const denied=await channel(false);r=await http(`/user/channels/${denied}/write-access`,'POST',{confirmation:'ENABLE WRITES'});assert.equal(r.status,403);
 checks.push('native_permission_revoked_blocks_existing_approval_and_fresh_non_admin_session');
 modifyOperator(full);await login();ch=await channel();
 phase='expiry';p=await preview(ch,'remove');assert.equal(p.status,200);
 console.log('WAIT real preview expiry (31 seconds)');await new Promise(r=>setTimeout(r,31000));
 r=await execute(p.body);assert.equal(r.status,409);assert.equal(r.body.reason,'preview_expired');assert.equal(r.body.dispatchCount,0);assert.equal(native().roles,role);
 checks.push('real_preview_expiry_zero_dispatch');
 phase='remove';p=await preview(ch,'remove');assert.equal(p.status,200);r=await execute(p.body);assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');assert.equal(native().roles,'');
 r=await inspect(grant,true);assert.equal(r.status,200);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.administrativeWrites,0);
 checks.push('remove_and_reconcile_preserve_original_result');
 phase='restart';const oldControls={...controls};run(['restart','--timeout','20',id]);
 let ready=false;for(let i=0;i<80;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 await httpsReady();
 r=await raw(`/user/operations/${grant.id}/inspect`,'POST',{recoveryKey:grant.recoveryKey},oldControls,true);assert.ok([401,403].includes(r.status));
 await login();r=await inspect(grant);assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.administrativeWrites,0);assert.equal(native().roles,'');
 r=await http(`/user/operations/${grant.id}/inspect`,'POST',{recoveryKey:'0'.repeat(64)});assert.equal(r.status,404);
 checks.push('restart_invalidates_old_custody_receipt_survives_fresh_login_proof_required');console.log('PASS restart and authenticated recovery without repeat writes');
 phase='idle-expiry';console.log('WAIT real idle-session expiry (125 seconds)');
 for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,25000));console.log('Idle-expiry wait '+(i+1)+'/5');}
 r=await http(`/user/state?name=${target}&role=${role}`);assert.equal(r.status,401);assert.equal(native().roles,'');
 checks.push('real_idle_session_expiry_denies_read');
 let uiVerified=false;
 if(process.env.IRISOPS_USER_UI==='1'){
  phase='browser';
  const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
  const cert=run(['exec',id,'cat','/run/irisops-tls/server.crt']);
  const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
  const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:['--ignore-certificate-errors-spki-list='+spki]});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],requests=[],logs=[];
   page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.name));page.on('request',r=>requests.push(r.url()));page.on('console',m=>logs.push(m.text()));
   await page.goto(origin+'/csp/ops/guard-managed/web/index.html#access');
   await page.locator('#connection-button').click();await page.locator('#username').fill(actor);await page.locator('#password').fill(password);await page.locator('#connect-submit').click();
   await page.getByText('Connected to IRIS guard · four workspaces · read-only',{exact:true}).waitFor();
   assert.equal(await page.locator('#password').inputValue(),'');
   await page.locator('[data-guard-access="user"]').click();
   await page.locator('#guard-user-target').filter({hasText:target}).waitFor();
   assert.ok(await page.locator('#guard-edit').isDisabled());await page.locator('#guard-user-read').click();
   await page.locator('#guard-user-current').filter({hasText:'Not assigned'}).waitFor();
   await page.screenshot({path:resolve(directory,'user-desktop.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:resolve(directory,'user-mobile.png'),fullPage:true});
   await page.locator('#guard-enable').click();await page.locator('#guard-edit').click();
   await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.match(await page.locator('#confirm-description').textContent(),/account stays disabled/);
   await page.screenshot({path:resolve(directory,'user-mobile-preview.png'),fullPage:true});
   await page.screenshot({path:resolve(directory,'user-mobile-preview-viewport.png'),fullPage:false});
   const confirmationBox=await page.locator('#confirm-submit').boundingBox();
   assert.ok(confirmationBox&&confirmationBox.x>=0&&confirmationBox.y>=0&&confirmationBox.x+confirmationBox.width<=390&&confirmationBox.y+confirmationBox.height<=844,'Confirmation button must fit the actual mobile viewport');
   await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());await page.locator('#confirm-submit').click();
   await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();assert.equal(native().roles,role);
   const operation=await page.locator('#guard-operation-id').inputValue();assert.match(operation,/^[a-f0-9]{32}$/);
   await page.locator('[data-guard-access="role"]').click();assert.ok(await page.locator('#guard-edit').isDisabled());assert.equal(await page.locator('#guard-operation-id').inputValue(),'');
   await page.locator('[data-guard-access="user"]').click();assert.equal(await page.locator('#guard-operation-id').inputValue(),operation);
   await page.locator('#guard-user-remove').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});
   await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());await page.locator('#confirm-submit').click();
   await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();assert.equal(native().roles,'');
   await page.locator('#guard-reconcile').click();await page.locator('#guard-observation').filter({hasText:'MATCHES_EXPECTED'}).waitFor();
   await page.setViewportSize({width:1440,height:900});await page.screenshot({path:resolve(directory,'user-desktop-receipt.png'),fullPage:true});
   assert.equal(errors.length,0);assert.equal(requests.filter(u=>u.includes('/api/admin')).length,0);assert.ok(!secrets.some(s=>logs.join('\n').includes(s)));
   await page.locator('#guard-disconnect').click();assert.ok(await page.locator('#guard-edit').isDisabled());
   uiVerified=true;checks.push('desktop_mobile_user_ui_confirmed_assign_remove_recovery_and_kind_isolation');
  }finally{await browser.close();}
 }
 phase='cleanup';mode('SUSPENDED');enroll(legacy);
 term([`set sc=##class(Security.Users).Delete("${actor}")`,requireStatus,`set sc=##class(Security.Users).Delete("${target}")`,requireStatus,`set sc=##class(Security.Roles).Delete("${operatorRole}")`,requireStatus,`set sc=##class(Security.Roles).Delete("${role}")`,requireStatus],'%SYS');
 absent();assert.equal(call('##class(IrisOps.Guard.Deployment).State()').mode,'SUSPENDED');
 checks.push('four_exact_fixtures_removed_legacy_policy_restored');
 const result={complete:true,lab:name,containerId:id,checks,sourceSha256:hashes,realHttps:true,tlsVerification:true,realNativeAuthentication:true,uiVerified,published:false};
 await writeFile(resolve(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});complete=true;console.log(JSON.stringify(result));
}finally{if(!complete)console.error('FAILED phase='+phase+'; preserve exact lab and evidence; inspect before restoring or retrying. Completed: '+checks.join(', '));}
