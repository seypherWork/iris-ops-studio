// Called by the pinned wallet fixture runner, never against a production app.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
export async function runIntegratedUi(t){
 const {run,container,origin,user,password,role,userResources,check,change,native,counter,same,initial,proposed,freshSession,freshObserver,pass}=t;
 const root=new URL('../../',import.meta.url),dir=new URL('integrated-ui-evidence/',import.meta.url);
 const target='/usr/irissys/csp/ops/guard-integrated',url=origin+'/csp/ops/guard-integrated/web/index.html#secrets';
 await mkdir(dir,{recursive:true});
 run(['exec',container,'mkdir','-p',target+'/web/assets',target+'/experimental/guard/ui']);
 const files=['web/index.html',...(await readdir(new URL('web/assets/',root))).map(n=>'web/assets/'+n),'experimental/guard/ui/client.js','experimental/guard/ui/recovery-store.js','experimental/guard/ui/contracts.js'];
 for(const file of files){
  run(['cp',fileURLToPath(new URL(file,root)),container+':'+target+'/'+file]);
  const r=await fetch(origin+'/csp/ops/guard-integrated/'+file,{cache:'no-store'});assert.equal(r.status,200);
  if(file.endsWith('.js'))assert.match(r.headers.get('content-type'),/javascript/i);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),await readFile(new URL(file,root)),'Integrated served bytes: '+file);
 }
 const {chromium}=require(process.env.IRISOPS_PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
 const requests=[],exceptions=[],checks=[],proofs=new Set();let complete=false;
 const passed=s=>{checks.push(s);pass('Integrated UI: '+s);};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 function watch(page){
  page.on('pageerror',()=>exceptions.push('javascript_exception'));
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 }
 try{
  // Missing module must never activate the legacy client or a demo silently.
  const broken=await browser.newPage();watch(broken);
  await broken.route('**/wallet-guard.js',r=>r.abort('failed'));
  await broken.goto(url);await broken.getByText(/Experimental guard could not be loaded/).waitFor();
  assert.ok(!requests.some(r=>r.url.includes('/api/admin')));await broken.close();
  passed('missing integration module leaves operations blocked, without a direct client fallback');
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();watch(page);
  page.on('response',async r=>{
   if(new URL(r.url()).pathname.endsWith('/v1/previews')&&r.status()===200){
    try{const p=await r.json();if(p.recoveryKey)proofs.add(p.recoveryKey);}catch{}
   }
  });
  async function login(p=page){
   await p.locator('#connection-button').click();
   await p.locator('#username').fill(user);await p.locator('#password').fill(password);
   await p.locator('#connect-submit').click();
   await p.getByText('Connected to IRIS guard · wallet only · read-only',{exact:true}).waitFor();
   assert.equal(await p.locator('#password').inputValue(),'');
   assert.equal(await p.locator('#guard-edit').isDisabled(),true);
  }
  async function prepare(use=proposed.UseResource,p=page){
   await p.locator('#guard-enable').click();
   await p.getByText('Write-enabled · temporary',{exact:true}).waitFor();
   await p.locator('#guard-edit').click();await p.locator('#wallet-dialog').waitFor({state:'visible'});
   await p.locator('#wallet-use-resource').fill(use);await p.locator('#wallet-preview').click();
   await p.locator('#confirm-dialog').waitFor({state:'visible'});
  }
  async function confirm(p=page){
   await p.locator('#confirmation-input').fill(await p.locator('#confirmation-phrase').textContent());
   await p.locator('#confirm-submit').click();
   await p.locator('#confirm-dialog').waitFor({state:'hidden'});
   await p.waitForFunction(()=>!document.querySelector('#guard-inspect')?.disabled);
  }
  async function original(value){await page.locator('#guard-original').filter({hasText:value}).waitFor();}
  async function inspect(record=false){await page.locator(record?'#guard-reconcile':'#guard-inspect').click();await page.getByText(record?'Observation recorded; original result preserved':'Receipt inspected; no administrative change sent',{exact:true}).waitFor();}
  await page.goto(url);await page.locator('#guard-edit').waitFor();assert.equal(await page.locator('#guard-edit').isDisabled(),true);
  await login();passed('normal Connection settings logs into guard only and starts read-only');
  await prepare();assert.equal(await page.locator('#confirm-submit').isDisabled(),true);
  await page.locator('#confirmation-input').fill('wrong');assert.equal(await page.locator('#confirm-submit').isDisabled(),true);
  await page.screenshot({path:fileURLToPath(new URL('preview-desktop.png',dir))});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:fileURLToPath(new URL('preview-mobile.png',dir))});
  await page.setViewportSize({width:1440,height:900});
  let before=counter();await confirm();await original('VERIFIED');assert.equal(counter(),before+1);same(await native(),proposed);
  passed('existing wallet and confirmation dialogs execute once with server readback');
  const firstId=await page.locator('#guard-operation-id').inputValue();
  await page.locator('#journal-button').click();await page.getByText('Wallet guard · session journal',{exact:true}).waitFor();
  const journal=await page.locator('#content').innerText();assert.ok(journal.includes('verified'));assert.ok([...proofs].every(k=>!journal.includes(k)));
  await page.locator('[data-view="secrets"]').click();await page.reload();assert.equal(await page.locator('#guard-operation-id').inputValue(),firstId);
  await login();before=counter();await inspect();await original('VERIFIED');assert.equal(counter(),before);
  passed('main journal has no proof; reload and reconnect recover the existing receipt with zero PUTs');
  await prepare(initial.UseResource);await confirm();await original('VERIFIED');same(await native(),initial);
  // Drop the response AFTER the real upstream execute and readback completed.
  await prepare();before=counter();
  await page.route('**/v1/previews/*/execute',async route=>{await route.fetch();await route.abort('failed');});
  await confirm();await page.getByText(/Response unavailable\. The change may have happened/).waitFor();
  assert.equal(counter(),before+1);same(await native(),proposed);
  await page.unroute('**/v1/previews/*/execute');await inspect();await original('VERIFIED');assert.equal(counter(),before+1);
  passed('real completed execution with dropped browser response is recovered without resending');
  await prepare(initial.UseResource);await confirm();await original('VERIFIED');same(await native(),initial);
  // F05: corrupt only the browser response AFTER real execution. The shared
  // validator must prevent a false VERIFIED display or nested-field leakage.
  await prepare();before=counter();
  const marker='SYNTHETIC-REDACTION-CHECK';
  await page.route('**/v1/previews/*/execute',async route=>{
   const response=await route.fetch(),body=await response.json();body.observed.privateKey=marker;
   await route.fulfill({response,json:body});
  });
  await confirm();await page.getByText(/Server evidence is incomplete or inconsistent/).waitFor();
  assert.equal(counter(),before+1);same(await native(),proposed);
  assert.equal(await page.locator('#guard-original').count(),0);
  assert.ok(!(await page.locator('body').innerText()).includes(marker));
  await page.locator('#journal-button').click();await page.getByText('Wallet guard · session journal',{exact:true}).waitFor();
  const invalidJournal=await page.locator('#content').innerText();assert.ok(!invalidJournal.includes(marker));assert.ok(invalidJournal.includes('uncertain'));
  await page.locator('[data-view="secrets"]').click();
  await page.unroute('**/v1/previews/*/execute');await inspect();await original('VERIFIED');assert.equal(counter(),before+1);
  passed('malformed nested execution evidence never reaches UI or journal; genuine receipt recovers without resend');
  await prepare(initial.UseResource);await confirm();await original('VERIFIED');same(await native(),initial);
  await prepare();before=counter();change(['set ^IrisOpsGuardBoot("walletFault")="readback"'],'IRISOPS');
  await confirm();await original('UNKNOWN');assert.equal(counter(),before+1);
  change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback")'],'IRISOPS');
  await inspect(true);await original('UNKNOWN');assert.equal(await page.locator('#guard-observation').textContent(),'MATCHES_EXPECTED');assert.equal(counter(),before+1);
  await page.screenshot({path:fileURLToPath(new URL('recovery-desktop.png',dir)),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:fileURLToPath(new URL('recovery-mobile.png',dir)),fullPage:true});await page.setViewportSize({width:1440,height:900});
  passed('UNKNOWN original and current match remain separate at 1440x900 and 390x844');
  await prepare(initial.UseResource);await confirm();await original('VERIFIED');same(await native(),initial);
  await prepare();await native('PUT',{...initial,EditResource:proposed.UseResource.replace(':READ',':WRITE')});before=counter();
  await confirm();await original('BLOCKED');assert.equal(counter(),before);await native('PUT',initial);
  passed('stale native target blocks the integrated preview with zero guard PUTs');
  await prepare();before=counter();
  change([`set p("Resources")="${userResources.replace('%Admin_Wallet:U,','')}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  await confirm();await original('BLOCKED');assert.equal(counter(),before);
  change([`set p("Resources")="${userResources}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  passed('permission revocation after the visible preview prevents dispatch');
  await login();await prepare();before=counter();
  const second=await context.newPage();watch(second);await second.goto(url);await login(second);
  assert.equal(await second.locator('#guard-edit').isDisabled(),true);
  await confirm();assert.equal(counter(),before);await second.close();
  passed('another tab reconnecting invalidates the old approval and cannot inherit write-enabled mode');
  await login();await prepare();before=counter();
  console.log('Integrated UI waiting for real preview and authorization expiry (31s + 31s)');
  await sleep(31000);assert.equal(await page.locator('#confirm-submit').isDisabled(),true);
  await page.locator('[data-close-dialog="confirm-dialog"]').first().click();
  await sleep(31000);assert.equal(await page.locator('#guard-edit').isDisabled(),true);assert.equal(await page.locator('#guard-inspect').isDisabled(),true);assert.equal(counter(),before);
  const expired=await context.request.get(origin+'/api/irisops-http-guard/v1/wallet?name=IrisOps_GuardProbeWallet');assert.equal(expired.status(),401);
  await login();await freshObserver();same(await native(),initial);
  passed('real preview and native authorization expiry disable controls; explicit reconnect starts locked');
  // A missing server must never cause an automatic native login or PUT.
  await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();
  await page.locator('#guard-edit').click();await page.locator('#wallet-use-resource').fill(proposed.UseResource);before=counter();
  await page.route('**/v1/previews',r=>r.abort('failed'));await page.locator('#wallet-preview').click();
  await page.getByText(/Response unavailable\. The change may have happened/).waitFor();assert.equal(counter(),before);
  await page.unroute('**/v1/previews');await page.locator('[data-close-dialog="wallet-dialog"]').first().click();
  passed('unavailable preview server blocks progress without any native API fallback');
  // Keep this browser's tab storage while restarting only the pinned test IRIS.
  run(['restart','--time','20',container]);let ready=false;
  for(let i=0;i<45;i++){
   try{if((await fetch(origin+'/api/irisops-http-guard/v1/session',{redirect:'manual'})).status===401){ready=true;break;}}catch{}
   await sleep(1000);
  }
  assert.ok(ready);await page.reload();await login();await freshObserver();
  await page.locator('#guard-operation-id').fill(firstId);before=counter();await inspect();await original('VERIFIED');
  assert.equal(counter(),before);same(await native(),initial);
  passed('same browser tab recovers its original receipt after an actual IRIS restart with zero PUTs');
  // Cancel while the server login response is in transit: no late connection.
  let releaseLogin,loginReached,loginDelivered;
  const reached=new Promise(r=>{loginReached=r;});
  const delivered=new Promise(r=>{loginDelivered=r;});
  await page.route('**/v1/connect',async route=>{
   const response=await route.fetch();loginReached();await new Promise(r=>{releaseLogin=r;});await route.fulfill({response});loginDelivered();
  });
  await page.locator('#connection-button').click();await page.locator('#username').fill(user);await page.locator('#password').fill(password);
  await page.locator('#connect-submit').click();await reached;
  await page.locator('[data-close-dialog="connection-dialog"]').first().click();releaseLogin();
  await delivered;await page.unroute('**/v1/connect');
  await page.waitForFunction(()=>document.querySelector('#mode-label').textContent==='Guard · disconnected');
  await page.waitForFunction(()=>!document.querySelector('#guard-disconnect').disabled);
  assert.equal(await page.locator('#guard-edit').isDisabled(),true);assert.equal(await page.locator('#password').inputValue(),'');
  await login();
  passed('cancelled login cannot reconnect later when a delayed server response arrives');
  // Read-only/blocked scopes remain honest through normal navigation.
  for(const view of ['overview','processes','infrastructure','tasks','access','webapps','oauth','explorer']){
   await page.locator('[data-view="'+view+'"]').click();await page.getByText('Not connected in this guard pilot',{exact:true}).waitFor();
   assert.equal(await page.locator('#request-send').count(),0);
  }
  await page.locator('[data-view="secrets"]').click();
  const visible=await page.locator('body').innerText();assert.ok(!visible.includes(password)&&[...proofs].every(k=>!visible.includes(k)));
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
  await page.locator('#guard-disconnect').click();
  await page.waitForFunction(()=>document.querySelector('#guard-edit')?.disabled&&sessionStorage.length===0);
  assert.equal(await page.locator('#guard-receipt-detail').count(),0);
  assert.ok(requests.every(r=>!new URL(r.url).pathname.startsWith('/api/admin')));assert.equal(exceptions.length,0);
  passed('other workspaces are explicitly unavailable; no native API, leaked proof, or retained logout keys');
  complete=true;
 }finally{
  change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback")'],'IRISOPS');
  change([`set p("Resources")="${userResources}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  await browser.close();await freshSession();await freshObserver();
  await writeFile(new URL('result.json',dir),JSON.stringify({timestamp:new Date().toISOString(),complete,releaseReady:false,checks,pageExceptions:exceptions.length,nativeApiRequests:requests.filter(r=>new URL(r.url).pathname.startsWith('/api/admin')).length,viewports:['1440x900','390x844'],files},null,2)+'\n');
 }
}
