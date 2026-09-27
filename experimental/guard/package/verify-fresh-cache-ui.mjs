import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {sha256} from './build.mjs';

// A clean browser, normal caching ENABLED, no request interception or credentials.
export async function runFreshCacheUi({origin,tlsSpki,manifest,suffix,pass}){
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:['--ignore-certificate-errors-spki-list='+tlsSpki]});
 const dir=new URL('fresh-cache-'+suffix+'/',import.meta.url);await mkdir(dir,{recursive:false});
 const expected=new Map(manifest.entries.map(e=>[e.path,e.sha256])),results=[];let complete=false;
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block'}),page=await context.newPage(),cdp=await context.newCDPSession(page);
   await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});let stage='',cacheHits=0,exceptions=0,api=0;const pending=[],assets=[];
   cdp.on('Network.requestServedFromCache',()=>cacheHits++);page.on('pageerror',()=>exceptions++);page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api++;});
   page.on('response',r=>{const path=new URL(r.url()).pathname;if(!path.startsWith('/csp/ops/guard-managed/'))return;const label=stage;pending.push((async()=>{const headers=await r.allHeaders();assets.push({stage:label,path,status:r.status(),hash:sha256(await r.body()),cacheControl:headers['cache-control']||''});})().catch(()=>assets.push({stage:label,path,error:'body-unavailable'})));});
   for(const label of ['cold','normal-navigation','normal-reload']){
    stage=label;const start=cacheHits;if(label==='normal-reload')await page.reload({waitUntil:'networkidle'});else{await page.goto('about:blank');await page.goto(origin+'/csp/ops/guard-managed/web/index.html#secrets',{waitUntil:'networkidle'});}
    await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');await Promise.all(pending);const current=assets.filter(a=>a.stage===stage);assert.ok(current.length>=17);
    for(const a of current){assert.equal(a.status,200);assert.equal(a.cacheControl,'no-store');assert.equal(a.hash,expected.get('ui'+a.path.slice('/csp/ops'.length)));}
    assert.equal(cacheHits-start,0);assert.equal(exceptions,0);assert.equal(api,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));results.push({width,stage,assets:current,cacheHits:0,pageExceptions:0,apiRequests:0});
   }
   await page.screenshot({path:fileURLToPath(new URL(width+'.png',dir)),fullPage:true});await context.close();
  }
  complete=true;pass('fresh desktop/mobile browsers fetch exact current no-store assets on normal navigation and reload, with caching enabled and zero cache hits');
 }catch{throw Error('Fresh browser cache policy failed; raw diagnostics suppressed');}
 finally{await browser.close();await writeFile(new URL('result.json',dir),JSON.stringify({complete,results,credentialsEntered:false},null,2)+'\n',{flag:'wx'});}
}
