import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,X509Certificate,createHash} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';

// Disposable, independently identified lab only. Never use the existing 52810 instance.
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;
assert.ok(docker);
const id=process.env.IRISOPS_ROLE_LAB_ID||'3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
const name=process.env.IRISOPS_ROLE_LAB_NAME||'irisops-pilot-policy-20260926-e';
const port=process.env.IRISOPS_ROLE_LAB_PORT?Number(process.env.IRISOPS_ROLE_LAB_PORT):52808;
assert.match(id,/^[a-f0-9]{64}$/);assert.match(name,/^irisops-pilot-[a-z0-9-]+$/);
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
const origin='https://127.0.0.1:'+port;
const base='/api/irisops-managed-guard/v1';
const user='IrisOps_RoleHttpUser',operator='IrisOps_RoleHttpOperator',target='IrisOps_RoleHttpTarget';
const first='IrisOps_EnrolledOne',second='IrisOps_EnrolledTwo';
const legacy={wallet:'IrisOps_EnrolledWallet',webapp:'/csp/irisops-enrolled-app',resources:`${first},${second}`};
const password=randomBytes(32).toString('base64url')+'aA1!';
const basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const run=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim(),`${id}|true|/${name}`);
function term(lines,ns='IRISOPS'){
  const out=run(['exec','-i',id,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));
  assert.ok(!/ERROR #|<PROTECT>|STEP_FAILED|TEST_ERROR=/.test(out),'Native step failed; output suppressed');
  return out;
}
function call(expression){
  const out=term([`try { set r=${expression} write "RESULT=",r.%ToJSON(),! } catch e { write "TEST_ERROR=",e.Name,! }`]);
  const m=out.match(/^RESULT=(\{.*\})$/m);assert.ok(m,'Native JSON result missing');return JSON.parse(m[1]);
}
function mode(value){
  const p=call('##class(IrisOps.Guard.Deployment).Plan()');
  return call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${value}","managed-lab-a")`);
}
function enroll(config){
  assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'SUSPENDED');
  const p=call('##class(IrisOps.Guard.TargetPolicy).Plan('+JSON.stringify(config)+')');
  return call('##class(IrisOps.Guard.TargetPolicy).Apply('+JSON.stringify(config)+',"'+p.fingerprint+'",'+p.expires+')');
}
function native(){
  const out=term([`set sc=##class(Security.Roles).Get("${target}",.p)`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt','write "RESOURCES=",p("Resources"),"|",p("Description"),!'],'%SYS');
  const m=out.match(/^RESOURCES=(.*)$/m);assert.ok(m);return m[1].trim();
}
let ca=run(['exec',id,'cat','/run/irisops-tls/ca.crt']);
function raw(path,method='GET',body,headers={}){
  return new Promise((resolve,reject)=>{
    const payload=body===undefined?undefined:JSON.stringify(body);
    const req=httpsRequest({hostname:'127.0.0.1',servername:'',port,path:base+path,method,ca,rejectUnauthorized:true,agent:false,
      headers:{...headers,...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})},timeout:15000},res=>{
      let text='';res.setEncoding('utf8');res.on('data',part=>text+=part);res.on('end',()=>{
        if(text.includes(password)||text.includes(basic)){reject(Error('Secret in response'));return;}
        try{resolve({status:res.statusCode,body:JSON.parse(text),headers:res.headers});}catch{reject(Error('Invalid JSON response'));}
      });
    });req.on('error',()=>reject(Error('TLS request failed')));req.on('timeout',()=>req.destroy());req.end(payload);
  });
}
let controls={};
const http=(path,method='GET',body)=>raw(path,method,body,controls);
async function login(){
  const session=await raw('/session','GET',undefined,{Authorization:basic});
  assert.equal(session.status,200);assert.equal(session.body.actor,user);
  const cookie=session.headers['set-cookie']||[];assert.ok(cookie.some(x=>x.startsWith('CSPSESSIONID')));
  controls={Cookie:cookie.map(x=>x.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':session.body.csrf,'Content-Type':'application/json'};
  const connected=await http('/connect','POST',{user,password});assert.equal(connected.status,200);
}
function checkAbsence(){
  const out=term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${operator}"),##class(Security.Roles).Exists("${target}"),!`],'%SYS');
  assert.ok(out.includes('ABSENT=000'));
}
let complete=false,phase='preflight';
try{
  checkAbsence();assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'SUSPENDED');
  assert.equal(call('##class(IrisOps.Guard.TargetPolicy).Current()').config.role,undefined);
  phase='fixtures';
  term([`set sc=##class(Security.Roles).Create("${target}","Owned HTTP access probe","${first}:R","")`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
    `set sc=##class(Security.Roles).Create("${operator}","Owned HTTP operator","%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R","")`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
    `set sc=##class(Security.Users).Create("${user}","${operator}","${password}","Owned HTTP user","USER","","",0,1)`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
  assert.equal(native(),`${first}:R|Owned HTTP access probe`);
  phase='read-only';enroll({...legacy,role:target});mode('READ_ONLY');await login();
  let r=await http(`/role/state?name=${target}&resource=${first}`);assert.equal(r.status,200);assert.equal(r.body.permissions,'R');
  r=await http('/role/channels','POST',{});assert.equal(r.status,200);const roChannel=r.body.channel;
  r=await http(`/role/channels/${roChannel}/write-access`,'POST',{confirmation:'ENABLE WRITES'});
  assert.equal(r.status,403);assert.equal(r.body.error,'deployment_read_only');
  r=await http('/role/previews','POST',{channel:roChannel,action:'role.resource.grant',name:target,resource:second,permissions:'U'});
  assert.equal(r.status,403);assert.equal(native(),`${first}:R|Owned HTTP access probe`);
  console.log('PASS limited user reads enrolled role; server rejects write enable and preview in READ_ONLY');
  phase='active';mode('ACTIVE');await login();
  r=await http('/role/channels','POST',{});assert.equal(r.status,200);const ch=r.body.channel;
  r=await http(`/role/channels/${ch}/write-access`,'POST',{confirmation:'ENABLE WRITES'});assert.equal(r.status,200);
  let p=await http('/role/previews','POST',{channel:ch,action:'role.resource.grant',name:target,resource:second,permissions:'U'});
  assert.equal(p.status,200);assert.equal(native(),`${first}:R|Owned HTTP access probe`);
  const grant={id:p.body.id,recoveryKey:p.body.recoveryKey};
  r=await http(`/role/previews/${p.body.id}/execute`,'POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');assert.equal(r.body.dispatchCount,1);
  assert.equal(native(),`${first}:R,${second}:U|Owned HTTP access probe`);
  r=await http(`/role/operations/${grant.id}/inspect`,'POST',{recoveryKey:grant.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');
  assert.equal(r.body.currentObservation.outcome,'MATCHES_EXPECTED');assert.equal(r.body.administrativeWrites,0);
  console.log('PASS limited user executes one enrolled grant with native readback');
  phase='stale';
  p=await http('/role/previews','POST',{channel:ch,action:'role.resource.grant',name:target,resource:first,permissions:'RW'});assert.equal(p.status,200);
  term([`set p("Description")="Owned external drift",sc=##class(Security.Roles).Modify("${target}",.p)`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
  r=await http(`/role/previews/${p.body.id}/execute`,'POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});
  assert.equal(r.status,409);assert.equal(r.body.state,'BLOCKED');assert.equal(r.body.reason,'stale');assert.equal(r.body.dispatchCount,0);
  assert.equal(native(),`${first}:R,${second}:U|Owned external drift`);
  term([`set p("Description")="Owned HTTP access probe",sc=##class(Security.Roles).Modify("${target}",.p)`,
    'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
  console.log('PASS externally changed role blocks stale preview with zero dispatch');
  phase='revoke';
  p=await http('/role/previews','POST',{channel:ch,action:'role.resource.revoke',name:target,resource:second,permissions:''});assert.equal(p.status,200);
  r=await http(`/role/previews/${p.body.id}/execute`,'POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');assert.equal(native(),`${first}:R|Owned HTTP access probe`);
  console.log('PASS limited user revokes the test grant and native state is restored');
  phase='recovery';
  r=await http(`/role/operations/${grant.id}/inspect`,'POST',{recoveryKey:grant.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');
  assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.administrativeWrites,0);
  r=await http(`/role/operations/${grant.id}/reconcile`,'POST',{recoveryKey:grant.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');
  assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.administrativeWrites,0);
  assert.equal(r.body.observationPersisted,1);
  run(['restart','--timeout','20',id]);
  let ready=false;
  for(let attempt=0;attempt<90;attempt++){
    try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready);await login();
  r=await http(`/role/operations/${grant.id}/inspect`,'POST',{recoveryKey:grant.recoveryKey});
  assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');
  assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');assert.equal(r.body.administrativeWrites,0);
  assert.equal(native(),`${first}:R|Owned HTTP access probe`);
  console.log('PASS role receipt survives restart; inspection and recorded recheck never repeat administrative writes');
  if(process.env.IRISOPS_PLAYWRIGHT_MODULE&&process.env.IRISOPS_BROWSER_EXECUTABLE){
    phase='browser';
    const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
    const cert=run(['exec',id,'cat','/run/irisops-tls/server.crt']);
    const spki=createHash('sha256').update(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'})).digest('base64');
    const suffix=process.env.IRISOPS_ROLE_RUN_ID||String(port);
    assert.match(suffix,/^[a-z0-9-]+$/);
    const out=resolve('../irisops-role-ui-validation-20260927-'+suffix);
    await mkdir(out);
    const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,
      args:['--ignore-certificate-errors-spki-list='+spki]});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],urls=[],logs=[];
      page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.name));
      page.on('request',req=>urls.push(req.url()));page.on('console',m=>logs.push(m.text()));
      await page.goto(origin+'/csp/ops/guard-managed/web/index.html#access');
      await page.locator('#connection-button').click();
      await page.locator('#username').fill(user);await page.locator('#password').fill(password);
      await page.locator('#connect-submit').click();
      await page.getByText('Connected to IRIS guard · three workspaces · read-only',{exact:true}).waitFor();
      assert.equal(await page.locator('#password').inputValue(),'');
      assert.equal(await page.locator('#guard-role-resource option').count(),2);
      await page.locator('#guard-role-read').click();
      await page.locator('#guard-role-current').filter({hasText:'R · current configuration checked'}).waitFor();
      await page.screenshot({path:join(out,'desktop-role-read.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:join(out,'mobile-role-read.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:900});
      await page.locator('#guard-enable').click();
      await page.locator('#guard-role-resource').selectOption(second.toUpperCase());
      await page.locator('#guard-role-permission').selectOption('U');
      await page.locator('#guard-edit').click();
      await page.locator('#confirm-dialog').waitFor({state:'visible'});
      assert.match(await page.locator('#confirm-description').textContent(),/Before: no grant. Expected: U/);
      await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());
      await page.locator('#confirm-submit').click();
      await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();
      assert.equal(native(),`${first}:R,${second}:U|Owned HTTP access probe`);
      await page.locator('#guard-role-revoke').click();
      await page.locator('#confirm-dialog').waitFor({state:'visible'});
      await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());
      await page.locator('#confirm-submit').click();
      await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();
      assert.equal(native(),`${first}:R|Owned HTTP access probe`);
      assert.equal(errors.length,0);assert.equal(urls.filter(x=>x.includes('/api/admin')).length,0);
      assert.ok(!logs.join('\n').includes(password));
      await page.locator('#guard-disconnect').click();
      console.log('PASS desktop/mobile role UI and two confirmed mutations; no browser exceptions, secret console text or direct admin fallback');
    }finally{await browser.close();}
  }
  phase='cleanup';mode('SUSPENDED');enroll(legacy);
  term([`set sc=##class(Security.Users).Delete("${user}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
    `set sc=##class(Security.Roles).Delete("${operator}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt',
    `set sc=##class(Security.Roles).Delete("${target}")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt'],'%SYS');
  checkAbsence();assert.equal(call('##class(IrisOps.Guard.Deployment).Plan()').mode,'SUSPENDED');
  assert.equal(call('##class(IrisOps.Guard.TargetPolicy).Current()').config.role,undefined);
  complete=true;console.log('PASS lab identities removed, legacy policy restored and guard suspended');
}finally{
  if(!complete)console.error(`STOPPED in ${phase}; disposable lab retained for exact-state inspection`);
  console.log(`LAB=${name} COMPLETE=${complete}`);
}
