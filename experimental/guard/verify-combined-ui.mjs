import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
export async function runCombinedUi(t){
 const {run,container,origin,user,password,wallet,initialWallet,initialWeb,proposed,native,counter,restore,setRole,walletRights,pass,session,observer,fault}=t;
 const profile=t.profile||'combined';assert.ok(['combined','managed'].includes(profile));
 const api=profile==='managed'?'/api/irisops-managed-guard/':'/api/irisops-combined-guard/';
 const root=new URL('../../',import.meta.url),dir=new URL(profile+'-ui-evidence/',import.meta.url),target='/usr/irissys/csp/ops/guard-'+profile,base=origin+'/csp/ops/guard-'+profile+'/';
 await mkdir(dir,{recursive:true});run(['exec',container,'mkdir','-p',target+'/web/assets',target+'/experimental/guard/ui']);
 const files=['web/index.html',...(await readdir(new URL('web/assets/',root))).map(n=>'web/assets/'+n),...['client.js','contracts.js','recovery-store.js','session.js'].map(n=>'experimental/guard/ui/'+n)];
 for(const f of files){run(['cp',fileURLToPath(new URL(f,root)),container+':'+target+'/'+f]);const r=await fetch(base+f,{cache:'no-store'});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),await readFile(new URL(f,root)));if(f.endsWith('.js'))assert.match(r.headers.get('content-type'),/javascript/i);}
 const {chromium}=require(process.env.IRISOPS_PLAYWRIGHT_MODULE),browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
 const checks=[],requests=[],errors=[],consoleMessages=[],proofs=new Set();let complete=false;
 const passed=s=>{checks.push(s);pass('Combined UI: '+s);};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(12000);
  page.on('pageerror',()=>errors.push('page_exception'));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  page.on('console',message=>consoleMessages.push(message.text()));
  page.on('response',async r=>{if(/\/v1\/(wallet|webapp)\/previews$/.test(r.url())&&r.status()===200)try{proofs.add((await r.json()).recoveryKey);}catch{}});
  async function nav(view){await page.locator('[data-view="'+view+'"]').click();await page.waitForFunction(v=>location.hash==='#'+v,view);if(['webapps','secrets'].includes(view))await page.locator('#guard-edit').waitFor();}
  async function login(){await page.locator('#connection-button').click();await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.locator('#connect-submit').click();await page.getByText('Connected to IRIS guard · two workspaces · read-only',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent==='Read-only');assert.equal(await page.locator('#password').inputValue(),'');}
  async function prepare(kind,reverse=false){
   await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();await page.locator('#guard-edit').click();
   if(kind==='wallet'){await page.locator('#wallet-dialog').waitFor({state:'visible'});await page.locator('#wallet-use-resource').fill(reverse?initialWallet.UseResource:proposed.UseResource);await page.locator('#wallet-preview').click();}
   await page.locator('#confirm-dialog').waitFor({state:'visible'});
  }
  async function confirm(){await page.locator('#confirmation-input').fill(await page.locator('#confirmation-phrase').textContent());await page.locator('#confirm-submit').click();await page.locator('#confirm-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('#guard-inspect')?.disabled);}
  async function original(state){await page.locator('#guard-original').filter({hasText:state}).waitFor();}
  async function recover(record=false){await page.locator(record?'#guard-reconcile':'#guard-inspect').click();await page.getByText(record?'Observation recorded; original result preserved':'Receipt inspected; no administrative change sent',{exact:true}).waitFor();}
  async function viewportScreenshot(name,mobile=false){await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL(name+'.png',dir)),fullPage:true});}
  let priorLogins=0;
  if(profile==='managed'){
   t.transition('READ_ONLY');await page.goto(base+'web/index.html#secrets');await login();assert.ok(await page.locator('#guard-enable').isDisabled());
   await page.getByText('Server deployment: read-only. Only its administrator can enable writes.',{exact:true}).waitFor();
   await viewportScreenshot('deployment-readonly-desktop');await viewportScreenshot('deployment-readonly-mobile',true);await nav('webapps');assert.ok(await page.locator('#guard-enable').isDisabled());await page.setViewportSize({width:1440,height:900});
   t.transition('ACTIVE');priorLogins=requests.filter(r=>r.url.endsWith('/v1/connect')).length;
   passed('native capabilities do not override administrator-enforced readonly state in either workspace');
  }
  await page.goto(base+'web/index.html#secrets');assert.ok(await page.locator('#guard-edit').isDisabled());await login();await nav('webapps');assert.ok(await page.locator('#guard-edit').isDisabled());await nav('secrets');
  assert.equal(requests.filter(r=>r.url.endsWith('/v1/connect')).length,priorLogins+1);passed('one visible login serves both native workspaces and starts both read-only');
  await prepare('wallet');assert.ok(await page.locator('#confirm-submit').isDisabled());await page.locator('#confirmation-input').fill('wrong');assert.ok(await page.locator('#confirm-submit').isDisabled());
  await viewportScreenshot('wallet-preview-desktop');await viewportScreenshot('wallet-preview-mobile',true);await page.setViewportSize({width:1440,height:900});let n=counter();await confirm();await original('VERIFIED');assert.deepEqual(counter(),[n[0]+1,n[1]]);
  const walletId=await page.locator('#guard-operation-id').inputValue();await nav('webapps');assert.ok(await page.locator('#guard-edit').isDisabled());assert.equal(await page.locator('#guard-operation-id').inputValue(),'');await prepare('webapp');
  await viewportScreenshot('webapp-preview-desktop');await viewportScreenshot('webapp-preview-mobile',true);await page.setViewportSize({width:1440,height:900});n=counter();await confirm();await original('VERIFIED');assert.deepEqual(counter(),[n[0],n[1]+1]);
  const webId=await page.locator('#guard-operation-id').inputValue();assert.notEqual(walletId,webId);assert.deepEqual(await native('webapp'),{...initialWeb,Enabled:true});assert.equal((await native('wallet')).UseResource.toUpperCase(),proposed.UseResource.toUpperCase());
  await nav('secrets');assert.equal(await page.locator('#guard-operation-id').inputValue(),walletId);await original('VERIFIED');await nav('webapps');assert.equal(await page.locator('#guard-operation-id').inputValue(),webId);await original('VERIFIED');
  passed('wallet grant does not unlock webapp; both real mutations and receipts remain independent');
  await prepare('webapp',true);await confirm();await original('VERIFIED');await nav('secrets');await prepare('wallet',true);await confirm();await original('VERIFIED');assert.deepEqual(await native('webapp'),initialWeb);assert.equal((await native('wallet')).UseResource.toUpperCase(),initialWallet.UseResource.toUpperCase());
  passed('both inverse operations through the combined UI restore the native initial state');
  // Hash reload preserves per-kind recovery, never old write authority.
  const lastWallet=await page.locator('#guard-operation-id').inputValue();await page.reload();assert.equal(await page.locator('#guard-operation-id').inputValue(),lastWallet);await login();n=counter();await recover();await nav('webapps');assert.ok(await page.locator('#guard-edit').isDisabled());await recover();assert.deepEqual(counter(),n);
  passed('one reconnect after reload recovers both independent stored receipts with zero PUTs');
  // No navigation can change which controller owns an in-flight request.
  await nav('secrets');let release,started;const seen=new Promise(r=>{started=r;});
  await page.route('**/v1/wallet/state?*',async route=>{started();await new Promise(r=>{release=r;});await route.continue();});
  await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();await page.locator('#guard-edit').click();await seen;
  await page.locator('[data-view="webapps"]').click();assert.equal(new URL(page.url()).hash,'#secrets');release();await page.locator('#wallet-dialog').waitFor({state:'visible'});await page.unroute('**/v1/wallet/state?*');
  await page.locator('[data-close-dialog="wallet-dialog"]').first().click();await nav('webapps');passed('navigation during a pending wallet read cannot switch the action to the other workspace');
  await prepare('webapp');n=counter();await page.route('**/v1/webapp/previews/*/execute',async route=>{await route.fetch();await route.abort('failed');});await confirm();assert.deepEqual(counter(),[n[0],n[1]+1]);await page.unroute('**/v1/webapp/previews/*/execute');
  const lostId=await page.locator('#guard-operation-id').inputValue();await nav('secrets');await nav('webapps');assert.equal(await page.locator('#guard-operation-id').inputValue(),lostId);await recover();await original('VERIFIED');assert.deepEqual(counter(),[n[0],n[1]+1]);restore();
  passed('lost response survives workspace switching and recovers without a second dispatch');
  await prepare('webapp');n=counter();fault('webapp');await confirm();await original('UNKNOWN');fault();await recover(true);await original('UNKNOWN');await page.locator('#guard-observation').filter({hasText:'MATCHES_EXPECTED'}).waitFor();assert.deepEqual(counter(),[n[0],n[1]+1]);
  await viewportScreenshot('recovery-desktop');await viewportScreenshot('recovery-mobile',true);await page.setViewportSize({width:1440,height:900});restore();
  passed('uncertain original execution and later current match remain visibly distinct');
  await page.locator('#journal-button').click();await page.getByText('Combined guard · session journal',{exact:true}).waitFor();const journal=await page.locator('#content').innerText();assert.ok(!journal.includes(password));for(const key of proofs)assert.ok(!journal.includes(key));
  for(const view of ['access','explorer','tasks','processes','oauth']){await nav(view);await page.getByText('Not connected in this guard pilot',{exact:true}).waitFor();}
  passed('journal omits recovery proofs and unsupported workspaces do not use native API fallback');
  await nav('secrets');await page.locator('#guard-disconnect').click();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent.includes('Disconnected'));await nav('webapps');assert.ok(await page.locator('#guard-enable').isDisabled());
  const keys=await page.evaluate(prefix=>Object.keys(sessionStorage).filter(k=>k.startsWith(prefix+':')),profile);assert.deepEqual(keys,[]);passed('one explicit disconnect locks both workspaces and clears both private recovery stores');
  setRole(walletRights);await login();await page.getByText('Unavailable: required native permission is missing. Reconnect after permission changes.',{exact:true}).waitFor();assert.ok(await page.locator('#guard-enable').isDisabled());await viewportScreenshot('limited-role-mobile',true);
  await nav('secrets');assert.ok(await page.locator('#guard-enable').isEnabled());await nav('webapps');assert.ok(await page.locator('#guard-enable').isDisabled());await page.setViewportSize({width:1440,height:900});
  await nav('secrets');assert.ok(await page.locator('#guard-enable').isEnabled());await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();setRole();passed('limited native role visibly disables webapp only, wallet remains usable');
  if(profile==='managed'){
   t.transition('SUSPENDED');await page.locator('#guard-enable').click();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent.includes('Disconnected'));assert.ok(await page.locator('#guard-edit').isDisabled());await nav('webapps');assert.ok(await page.locator('#guard-enable').isDisabled());
   t.transition('ACTIVE');await login();assert.ok(await page.locator('#guard-edit').isDisabled());passed('suspension is reflected after a failed status check; reactivation requires login and does not restore write grants');
  }
  for(const text of consoleMessages){assert.ok(!text.includes(password));for(const key of proofs)assert.ok(!text.includes(key));}
  assert.equal(errors.length,0);assert.equal(requests.filter(r=>r.url.includes('/api/admin')).length,0);assert.ok(requests.filter(r=>r.url.includes('/api/irisops-')).every(r=>r.url.includes(api)));passed('zero browser exceptions, direct native requests or calls to the old separate sessions; known secrets absent from console');complete=true;
 }finally{
  await browser.close();fault();setRole();restore();if(profile==='managed')t.transition('ACTIVE');await session();await observer();
  await writeFile(new URL('result.json',dir),JSON.stringify({timestamp:new Date().toISOString(),complete,checks,pageExceptions:errors.length,directNativeRequests:requests.filter(r=>r.url.includes('/api/admin')).length},null,2)+'\n');
 }
}
