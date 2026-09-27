import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
export async function runUiSuite(t){
 const {request,reconnect,freshObserver,native,same,counter,change,pass,run,container,origin,user,password,initial,proposed,check}=t;
 const {chromium}=require(process.env.IRISOPS_PLAYWRIGHT_MODULE||'playwright');
 const dir=new URL('ui-evidence/',import.meta.url);await mkdir(dir,{recursive:true});
 // The destination is the already-created owned experimental directory only.
 for(const name of ['index.html','app.js','client.js','recovery-store.js','contracts.js','guard.css']){
   run(['cp',fileURLToPath(new URL('ui/'+name,import.meta.url)),container+':/usr/irissys/csp/ops/guard/'+name]);
   const asset=await fetch(origin+'/csp/ops/guard/'+name,{cache:'no-store'});
   assert.equal(asset.status,200,'Deployed '+name);
   if(name.endsWith('.js'))assert.match(asset.headers.get('content-type'),/javascript/i,'Script MIME');
   assert.deepEqual(Buffer.from(await asset.arrayBuffer()),await readFile(new URL('ui/'+name,import.meta.url)),'Served bytes must match current source');
 }
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE||undefined});
 const errors=[],requests=[],checks=[];
 const checked=label=>{checks.push(label);pass('UI: '+label);};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',()=>errors.push('browser_exception'));
  page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  async function login(){await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#connect').click();await page.getByText('Connected to Live IRIS. New channel is read-only.',{exact:true}).waitFor();assert.equal(await page.locator('#password').inputValue(),'');}
  async function prepare(use=proposed.UseResource){await page.locator('#enable').click();await page.getByText('Server write channel enabled temporarily for the disposable wallet only.',{exact:true}).waitFor();await page.locator('#use').selectOption(use);await page.locator('#preview').click();await page.locator('#preview-panel').waitFor({state:'visible'});}
  async function confirm(){await page.locator('#confirmation').fill(await page.locator('#phrase').textContent());await page.locator('#execute').click();}
  await page.goto(origin+'/csp/ops/guard/index.html',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#preview').isDisabled(),true);await login();assert.equal(await page.locator('#preview').isDisabled(),true);checked('login clears password and starts server channel read-only');
  await prepare();assert.equal(await page.locator('#execute').isDisabled(),true);await page.locator('#confirmation').fill('wrong');assert.equal(await page.locator('#execute').isDisabled(),true);
  await page.screenshot({path:fileURLToPath(new URL('preview-desktop.png',dir))});
  const before=counter();await confirm();await page.getByText('Change verified by the server.',{exact:true}).waitFor();assert.equal(counter(),before+1);same(await native(),proposed);checked('typed preview executes once and real IRIS readback matches');
  const op=await page.locator('#operation-id').inputValue();await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#operation-id').inputValue(),op);assert.equal(await page.locator('#enable').isDisabled(),true);
  await login();await page.locator('#inspect').click();await page.getByText('Receipt and current state inspected. No administrative write sent.',{exact:true}).waitFor();assert.equal(await page.locator('#original-state').textContent(),'Verified at execution');assert.equal(counter(),before+1);checked('tab proof survives reload; fresh login recovers receipt without PUT');
  await prepare(initial.UseResource);await confirm();await page.getByText('Change verified by the server.',{exact:true}).waitFor();same(await native(),initial);
  await prepare();await native('PUT',{...initial,EditResource:proposed.UseResource.replace(':READ',':WRITE')});const staleCount=counter();await confirm();await page.getByText('Server blocked the change.',{exact:true}).waitFor();assert.equal(counter(),staleCount);await native('PUT',initial);checked('stale preview is visibly blocked with zero guard PUTs');
  await prepare();change(['set ^IrisOpsGuardBoot("walletFault")="readback"'],'IRISOPS');const unknownCount=counter();await confirm();await page.getByText('Outcome requires review. Inspect the receipt; do not repeat the change.',{exact:true}).waitFor();assert.equal(counter(),unknownCount+1);
  change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback")'],'IRISOPS');
  await page.locator('#reconcile').click();await page.getByText('Read-only observation recorded. Original execution result preserved.',{exact:true}).waitFor();
  assert.equal(await page.locator('#original-state').textContent(),'Uncertain');assert.equal(await page.locator('#observation-state').textContent(),'Matches expected state');assert.equal(counter(),unknownCount+1);
  await page.screenshot({path:fileURLToPath(new URL('recovery-desktop.png',dir)),fullPage:true});checked('uncertain original and matching current observation are displayed separately');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const id of ['operation-id','inspect','reconcile']){await page.locator('#'+id).scrollIntoViewIfNeeded();const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=391);}
  await page.locator('#receipt-panel').scrollIntoViewIfNeeded();
  assert.ok((await page.locator('#receipt-detail').textContent()).includes('UNKNOWN'));
  await page.locator('#receipt-detail').evaluate(el=>{el.scrollTop=0;});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:fileURLToPath(new URL('recovery-mobile.png',dir))});
  await page.screenshot({path:fileURLToPath(new URL('recovery-mobile-full.png',dir)),fullPage:true});checked('390x844 controls remain in viewport without horizontal page overflow');
  await page.setViewportSize({width:1440,height:900});await prepare(initial.UseResource);await confirm();await page.getByText('Change verified by the server.',{exact:true}).waitFor();same(await native(),initial);
  // A request fails at transport: no retry, native API path or unlocked execute.
  await prepare();const executeCount=requests.filter(r=>r.url.endsWith('/execute')).length;
  // A write cannot proceed until its recovery proof is demonstrably retained.
  await page.evaluate(()=>{globalThis.savedStorageSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('test storage blocked');};});
  const persistenceCount=counter();await confirm();await page.getByText(/Recovery key could not be saved in this tab/).waitFor();
  assert.equal(requests.filter(r=>r.url.endsWith('/execute')).length,executeCount);assert.equal(counter(),persistenceCount);
  assert.equal(await page.locator('#preview-panel').isVisible(),true);
  await page.evaluate(()=>{Storage.prototype.setItem=globalThis.savedStorageSetItem;delete globalThis.savedStorageSetItem;});
  checked('unavailable tab storage blocks submission before any execute request or native PUT');
  await page.route('**/v1/previews/*/execute',route=>route.abort('failed'));await confirm();await page.getByText(/Response unavailable\. A submitted change may have happened/).waitFor();assert.equal(requests.filter(r=>r.url.endsWith('/execute')).length,executeCount+1);assert.equal(await page.locator('#preview-panel').isHidden(),true);same(await native(),initial);await page.unroute('**/v1/previews/*/execute');checked('lost transport response consumes local preview and never retries or falls back');
  assert.ok(requests.every(r=>!new URL(r.url).pathname.startsWith('/api/admin')));assert.equal(errors.length,0);
  const stored=await page.evaluate(()=>{
   const raw=sessionStorage.getItem('irisops-guard-recovery-v1'),v=JSON.parse(raw),html=document.body.innerText;
   return {local:Object.keys(localStorage),session:Object.keys(sessionStorage),html,keyCount:v.entries.length,keysHidden:v.entries.every(e=>!html.includes(e[1])),onlyProofFields:Object.keys(v).sort().join(',')==='entries,last'};
  });assert.deepEqual(stored.local,[]);assert.deepEqual(stored.session,['irisops-guard-recovery-v1']);assert.ok(!stored.html.includes(password));assert.ok(stored.keyCount>1&&stored.keysHidden&&stored.onlyProofFields);
  // An unrelated ID cannot silently use another operation's saved key.
  await page.locator('#operation-id').fill('f'.repeat(32));const requestsBefore=requests.length;
  await page.locator('#inspect').click();await page.getByText(/This tab has no recovery key/).waitFor();assert.equal(requests.length,requestsBefore);
  await page.locator('#logout').click();await page.getByText('Disconnected. Recovery keys forgotten; no pending approval remains.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>Object.keys(sessionStorage)),[]);assert.equal(await page.locator('#receipt-detail').textContent(),'');
  checked('multiple private tab proofs stay out of visible content; explicit logout forgets all keys');
  checked('no direct native API requests, password or admin-token storage, or browser exceptions');
  await writeFile(new URL('result.json',dir),JSON.stringify({complete:true,releaseReady:false,checks,requestCount:requests.length,nativeApiRequests:0,pageErrors:0,viewports:['1440x900','390x844']},null,2)+'\n');
 }finally{change(['kill ^IrisOpsGuardBoot("walletFault"),^IrisOpsGuardBoot("denyReadback")'],'IRISOPS');await browser.close();await reconnect();await freshObserver();}
}
