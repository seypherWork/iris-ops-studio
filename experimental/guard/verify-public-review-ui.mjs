// Baseline UI smoke check: only synthetic Safe demo data, never IRIS credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const suffix=process.argv[2]||'a';assert.match(suffix,/^[a-z]$/);
const out=resolve('../irisops-public-review-ui-20260927-'+suffix);await mkdir(out);
const server=spawn(process.execPath,['mock/server.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
let browser,complete=false;const views=[],errors=[];
try{
 const origin=await new Promise((res,rej)=>{let text='';const timer=setTimeout(()=>rej(Error('Local demo did not start')),10000);server.on('error',rej);server.on('exit',()=>{clearTimeout(timer);rej(Error('Local demo stopped'));});server.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);res(m[0]);}});});
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===390?844:900}});
  page.on('pageerror',e=>errors.push(e.name));
  await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
  await page.locator(width===390?'button.mobile-only[data-open-connection]':'#connection-button').click();await page.locator('#demo-mode').check();await page.locator('#connect-submit').click();
  const targets=await page.locator('.nav-item[data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view));assert.equal(targets.length,10);
  for(const view of targets){
   await page.locator(`.nav-item[data-view="${view}"]`).click();
   await page.waitForFunction(expected=>location.hash==='#'+expected,view);
   assert.ok((await page.locator('#content').innerText()).trim().length>30);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+view);
   views.push({width,view});
  }
  await page.screenshot({path:join(out,width+'.png'),fullPage:false});await page.close();
 }
 assert.deepEqual(errors,[]);complete=true;
}finally{
 if(browser)await browser.close();server.kill();
 await writeFile(join(out,'result.json'),JSON.stringify({complete,views,pageErrors:errors,syntheticDemoOnly:true,liveIrisEvidence:false},null,2),{flag:'wx'});
}
console.log(JSON.stringify({complete,viewChecks:views.length,pageErrors:errors.length,syntheticDemoOnly:true}));
