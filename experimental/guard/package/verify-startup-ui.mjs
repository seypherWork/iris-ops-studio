import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export async function runStartupUi({origin,tlsSpki,suffix,pass}){
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:tlsSpki?['--ignore-certificate-errors-spki-list='+tlsSpki]:[]});
 const dir=new URL('startup-ui-'+suffix+'/',import.meta.url);await mkdir(dir,{recursive:true});const results=[];let complete=false,phase='begin';
 async function scenario(kind,width){
  phase=kind+'-'+width;const context=await browser.newContext({viewport:{width,height:width===390?844:900}}),page=await context.newPage();page.setDefaultTimeout(20000);
  const api=[],errors=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push('api');});page.on('pageerror',()=>errors.push('exception'));
  let release;const held=new Promise(r=>release=r);let seen;const intercepted=new Promise(r=>seen=r);
  const path=kind==='static-failure'?'**/api.js?*':kind==='entry-failure'?'**/startup.js?*':'**/wallet-guard.js';
  await page.route(path,async route=>{seen();if(['slow','timeout'].includes(kind)){await held;await route.continue();}else await route.abort('failed');});
  try{
   await page.goto(origin+'/csp/ops/guard-managed/web/index.html#secrets',{waitUntil:'commit'});
   let timeout;try{await Promise.race([intercepted,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Expected module request not observed')),10000);})]);}finally{clearTimeout(timeout);}
   const root=page.locator('#app-root'),button=width===390?page.locator('.mobile-only[data-open-connection]'):page.locator('#connection-button');
   assert.equal(await root.evaluate(e=>e.inert),true);assert.ok(await button.isDisabled());
   await page.keyboard.press('Tab');assert.equal(await page.locator('#startup-reload').evaluate(e=>e===document.activeElement),true);
   await button.focus();assert.equal(await button.evaluate(e=>e===document.activeElement),false);
   await assert.rejects(button.click({timeout:250}));assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),false);
   if(kind==='slow'){
    assert.equal(await page.locator('#mode-label').textContent(),'Not connected');assert.equal(await page.locator('#health-label').textContent(),'Loading');
    await page.screenshot({path:fileURLToPath(new URL('loading-'+width+'.png',dir)),fullPage:true});release();
    await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
   }else if(kind==='entry-failure'){
    assert.equal(await page.locator('#startup-status').isVisible(),true);assert.match(await page.locator('#startup-message').textContent(),/reload the page/);
    await page.unroute(path);await page.locator('#startup-reload').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
   }else{
    await page.waitForFunction(()=>document.documentElement.dataset.startup==='failed');assert.equal(await root.evaluate(e=>e.inert),true);assert.ok(await button.isDisabled());
    if(kind==='timeout'){
     release();await page.locator('#guard-mode').waitFor();assert.equal(await root.evaluate(e=>e.inert),true);assert.equal(await page.evaluate(()=>document.documentElement.dataset.startup),'failed');assert.ok(await button.isDisabled());
    }
    await page.screenshot({path:fileURLToPath(new URL(kind+'-'+width+'.png',dir)),fullPage:true});
    await page.unroute(path);await page.locator('#startup-reload').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
   }
   assert.equal(await root.evaluate(e=>e.inert),false);assert.equal(await page.locator('#startup-status').isVisible(),false);assert.ok(await button.isEnabled());
   await button.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),false);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(api.length,0);assert.equal(errors.length,0);
   await page.screenshot({path:fileURLToPath(new URL('ready-'+kind+'-'+width+'.png',dir)),fullPage:true});results.push({kind,width,passed:true,apiRequests:api.length,pageExceptions:errors.length,credentialsEntered:false});
  }finally{release();await context.close();}
 }
 try{
  for(const width of [1440,390])await scenario('slow',width);
  for(const kind of ['guard-failure','static-failure','entry-failure'])await scenario(kind,390);
  await scenario('timeout',1440);
  pass('real browser startup: delayed imports desktop/mobile, three module failures, real timeout and late completion stay blocked; keyboard reload recovers without credentials or API calls');complete=true;
 }catch{throw Error('Startup browser validation failed at '+phase+'; raw diagnostics suppressed');}
 finally{await browser.close();await writeFile(new URL('result.json',dir),JSON.stringify({complete,phase,results},null,2)+'\n',{flag:'wx'});}
}
