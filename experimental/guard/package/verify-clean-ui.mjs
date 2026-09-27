import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function runCleanUi(t){
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 if(t.tlsSpki)assert.match(t.tlsSpki,/^[A-Za-z0-9+/]{43}=$/);
 // Test-profile-only exception for this exact leaf public key, no OS trust edits.
 // The HTTPS runner independently validates the CA, hostname and TLS protocol.
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:t.tlsSpki?['--ignore-certificate-errors-spki-list='+t.tlsSpki]:[]});
 const dir=new URL('clean-ui-'+t.suffix+'/',import.meta.url);await mkdir(dir,{recursive:true});const errors=[],requests=[],messages=[];let complete=false;
 try{
  t.transition('READ_ONLY');const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
  page.on('pageerror',()=>errors.push('page_exception'));page.on('request',r=>requests.push(r.url()));page.on('console',m=>messages.push(m.text()));
  await page.goto(t.origin+'/csp/ops/guard-managed/web/index.html#secrets');await page.locator('#connection-button').click();await page.locator('#username').fill(t.user);await page.locator('#password').fill(t.password);await page.locator('#connect-submit').click();await page.getByText('Connected to IRIS guard · two workspaces · read-only',{exact:true}).waitFor();
  assert.equal(await page.locator('#password').inputValue(),'');await page.getByText('Server deployment: read-only. Only its administrator can enable writes.',{exact:true}).waitFor();assert.ok(await page.locator('#guard-enable').isDisabled());
  if(t.renewal){
   assert.ok(await page.locator('#guard-renew').isEnabled());await page.locator('#guard-renew').click();await page.getByText('Session renewed · both workspaces read-only',{exact:true}).waitFor();assert.ok(await page.locator('#guard-enable').isDisabled());
   const renewals=requests.filter(u=>u.endsWith('/v1/renew'));assert.equal(renewals.length,1);t.pass('real browser explicit renewal returns both workspaces to read-only with no automatic repeat');
   const renewalRoute='**/api/irisops-managed-guard/v1/renew';let rotations=0,relayFailed=false;
   // Use the runner's CA/IP-validated fixed TLS client, not Playwright's separate
   // request context. Never let routing errors print cookies or request headers.
   await page.route(renewalRoute,async route=>{
    try{const r=await t.renewWithTrustedTls(route.request().postDataJSON(),route.request().headers());if(r.status!==200)relayFailed=true;else rotations++;}
    catch{relayFailed=true;}
    finally{try{await route.abort('failed');}catch{relayFailed=true;}}
   });
   await page.locator('#guard-renew').click();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent.includes('Disconnected'));
   assert.ok(await page.locator('#guard-renew').isDisabled());await page.waitForTimeout(500);assert.equal(relayFailed,false,'Fixed TLS renewal relay failed; raw diagnostic suppressed');assert.equal(rotations,1);assert.equal(requests.filter(u=>u.endsWith('/v1/renew')).length,2);
   await page.unroute(renewalRoute);await page.locator('#connection-button').click();await page.locator('#username').fill(t.user);await page.locator('#password').fill(t.password);await page.locator('#connect-submit').click();await page.getByText('Connected to IRIS guard · two workspaces · read-only',{exact:true}).waitFor();assert.equal(await page.locator('#password').inputValue(),'');
   t.pass('real browser loses a successful renewal response, disconnects without retry and reconnects explicitly');
  }
  await page.waitForFunction(()=>!document.querySelector('#toast')?.classList.contains('show'));
  for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile']]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL(label+'.png',dir)),fullPage:true});}
  await page.locator('[data-view="webapps"]').click();await page.waitForFunction(()=>location.hash==='#webapps');await page.locator('#guard-edit').waitFor();assert.ok(await page.locator('#guard-enable').isDisabled());
  await page.locator('#guard-disconnect').click();await page.waitForFunction(()=>document.querySelector('#guard-mode')?.textContent.includes('Disconnected'));assert.equal(errors.length,0);assert.equal(requests.filter(u=>u.includes('/api/admin')).length,0);
  for(const value of messages){assert.ok(!value.includes(t.password));for(const key of t.keys)assert.ok(!value.includes(key));}
  t.pass('packaged real UI works at 1440x900 and 390x844 with server-readonly controls, two workspaces and no direct native requests');complete=true;
 }catch{throw Error('Browser verification failed; raw diagnostic suppressed to protect test-session headers');}
 finally{await browser.close();await writeFile(new URL('result.json',dir),JSON.stringify({complete,pageExceptions:errors.length,directNativeRequests:requests.filter(u=>u.includes('/api/admin')).length},null,2)+'\n');}
}
