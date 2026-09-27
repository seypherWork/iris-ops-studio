// Actual Ops Studio UI, isolated Chromium, fixed disposable native target.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
export async function runWebappUi(t){
 const {run,container,origin,user,password,initial,native,counter,restore,change,check,pass,session,fault}=t;
 const root=new URL('../../',import.meta.url),dir=new URL('webapp-ui-evidence/',import.meta.url);
 const target='/usr/irissys/csp/ops/guard-webapp',url=origin+'/csp/ops/guard-webapp/web/index.html#webapps';
 await mkdir(dir,{recursive:true});run(['exec',container,'mkdir','-p',target+'/web/assets',target+'/experimental/guard/ui']);
 const files=['web/index.html',...(await readdir(new URL('web/assets/',root))).map(n=>'web/assets/'+n),...['client.js','contracts.js','recovery-store.js'].map(n=>'experimental/guard/ui/'+n)];
 for(const f of files){
  run(['cp',fileURLToPath(new URL(f,root)),container+':'+target+'/'+f]);
  const r=await fetch(origin+'/csp/ops/guard-webapp/'+f,{cache:'no-store'});assert.equal(r.status,200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),await readFile(new URL(f,root)));
  if(f.endsWith('.js'))assert.match(r.headers.get('content-type'),/javascript/i);
 }
 const {chromium}=require(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
 const checks=[],requests=[],errors=[],proofs=new Set();let complete=false;
 const passed=s=>{checks.push(s);pass('Web UI: '+s);};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(12000);
  page.on('pageerror',()=>errors.push('page_exception'));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  page.on('response',async r=>{if(r.url().endsWith('/v1/previews')&&r.status()===200)try{proofs.add((await r.json()).recoveryKey);}catch{}});
  async function login(){
   await page.locator('#connection-button').click();await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#connect-submit').click();
   await page.getByText('Connected to IRIS guard · Web app only · read-only',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent==='Read-only');
   assert.equal(await page.locator('#password').inputValue(),'');assert.ok(await page.locator('#guard-edit').isDisabled());
  }
  async function prepare(){
   await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();
   await page.locator('#guard-edit').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});
  }
  async function confirm(){
   await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());await page.locator('#confirm-submit').click();
   await page.locator('#confirm-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#guard-inspect')?.disabled);
  }
  async function inspect(record=false){
   await page.locator(record?'#guard-reconcile':'#guard-inspect').click();
   await page.getByText(record?'Observation recorded; original result preserved':'Receipt inspected; no administrative change sent',{exact:true}).waitFor();
  }
  await page.goto(url);assert.ok(await page.locator('#guard-edit').isDisabled());await login();
  assert.match(await page.locator('#guard-web-current').innerText(),/Disabled/);
  passed('real Connection settings logs into web guard, readonly, no browser admin token');
  await prepare();assert.ok(await page.locator('#confirm-submit').isDisabled());
  await page.locator('#confirmation-input').fill('wrong');assert.ok(await page.locator('#confirm-submit').isDisabled());
  await page.screenshot({path:fileURLToPath(new URL('preview-desktop.png',dir))});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const box=await page.locator('#confirm-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390.5);
  await page.screenshot({path:fileURLToPath(new URL('preview-mobile.png',dir))});await page.setViewportSize({width:1440,height:900});
  let n=counter();await confirm();await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();
  assert.equal(counter(),n+1);assert.deepEqual(await native(),{...initial,Enabled:true});passed('existing UI confirmation enables once, full independent native configuration unchanged');
  const op=await page.locator('#guard-operation-id').inputValue();await page.reload();assert.equal(await page.locator('#guard-operation-id').inputValue(),op);
  await login();n=counter();await inspect();assert.equal(counter(),n);passed('reload and reconnect recover existing receipt without sending PUT');
  await prepare();await confirm();assert.deepEqual(await native(),initial);passed('normal reverse UI operation returns application to original disabled state');
  await prepare();n=counter();change(['set p("Description")="UI stale fixture"','set sc=##class(Security.Applications).Modify("/csp/irisops-guard-testweb",.p)',check]);
  await confirm();await page.locator('#guard-original').filter({hasText:'BLOCKED'}).waitFor();assert.equal(counter(),n);restore();passed('actual UI stale preview blocks with zero native PUTs');
  await prepare();n=counter();await page.route('**/v1/previews/*/execute',async r=>{await r.fetch();await r.abort('failed');});
  await confirm();assert.equal(counter(),n+1);await page.unroute('**/v1/previews/*/execute');await inspect();
  await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();assert.equal(counter(),n+1);restore();passed('lost browser response recovered without repeat');
  await page.reload();await login();await prepare();n=counter();fault('readback');await confirm();await page.locator('#guard-original').filter({hasText:'UNKNOWN'}).waitFor();fault();
  await inspect(true);await page.locator('#guard-observation').filter({hasText:'MATCHES_EXPECTED'}).waitFor();
  assert.equal(await page.locator('#guard-original').textContent(),'UNKNOWN');assert.equal(counter(),n+1);
  assert.match(await page.locator('#guard-web-current').innerText(),/Enabled · Observed/);
  assert.equal(await page.locator('#guard-web-read-warning').count(),0);
  await page.screenshot({path:fileURLToPath(new URL('recovery-desktop.png',dir)),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:fileURLToPath(new URL('recovery-mobile.png',dir)),fullPage:true});await page.setViewportSize({width:1440,height:900});restore();
  passed('UNKNOWN and read-only current match stay distinct; recovery remains usable during native failure');
  await page.reload();await login();await prepare();n=counter();const marker='SYNTHETIC-SECRET-MUST-NOT-RENDER';
  await page.route('**/v1/previews/*/execute',async route=>{const response=await route.fetch(),json=await response.json();json.observed.password=marker;await route.fulfill({response,json});});
  await confirm();assert.equal(counter(),n+1);assert.equal(await page.locator('#guard-original').count(),0);assert.ok(!(await page.locator('body').innerText()).includes(marker));
  await page.unroute('**/v1/previews/*/execute');await inspect();await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();assert.equal(counter(),n+1);restore();
  passed('invalid receipt is not shown as VERIFIED and nested sensitive field never renders');
  await page.locator('#journal-button').click();await page.getByText('Web app guard · session journal',{exact:true}).waitFor();const journal=await page.locator('#content').innerText();assert.ok(!journal.includes(marker)&&!journal.includes(password));for(const proof of proofs)assert.ok(!journal.includes(proof));
  for(const view of ['secrets','access','explorer','tasks','processes']){await page.locator('[data-view="'+view+'"]').click();await page.getByText('Not connected in this guard pilot',{exact:true}).waitFor();}
  assert.equal(requests.filter(r=>r.url.includes('/api/admin')).length,0);assert.equal(errors.length,0);passed('unsupported workspaces never fall back to direct native API; no page exceptions or secrets in journal');
  await page.locator('[data-view="webapps"]').click();await page.locator('#guard-disconnect').click();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent.includes('Disconnected'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('webapp:irisops-guard-recovery-v1')),null);passed('disconnect clears only the webapp recovery store');
  complete=true;
 }finally{
  await browser.close();fault();restore();await session();
  await writeFile(new URL('result.json',dir),JSON.stringify({timestamp:new Date().toISOString(),complete,checks,pageExceptions:errors.length,directNativeRequests:requests.filter(r=>r.url.includes('/api/admin')).length},null,2)+'\n');
 }
}
