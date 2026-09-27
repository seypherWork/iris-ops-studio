import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const trial=process.argv[2];assert.match(trial||'',/^[a-z]$/);const web=new URL('../../../web/',import.meta.url),dir=new URL('startup-demo-validation-'+trial+'/',import.meta.url);await mkdir(dir,{recursive:false});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(req.method!=='GET'||(path!=='/'&&!/^\/assets\/[A-Za-z0-9_.-]+$/.test(path))){res.writeHead(404).end();return;}const name=path==='/'?'index.html':path.slice(1),body=await readFile(new URL(name,web));res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});const results=[];let complete=false;
try{
 for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:width===390?844:900}});const errors=[],api=[];page.on('pageerror',()=>errors.push('exception'));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push('api');});
  await page.goto(origin);await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');assert.equal(await page.locator('#mode-label').textContent(),'Safe demo');assert.equal(await page.locator('#app-root').evaluate(e=>e.inert),false);
  const button=width===390?page.locator('.mobile-only[data-open-connection]'):page.locator('#connection-button');await button.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');
  for(const view of ['tasks','webapps','overview']){await page.locator('[data-view="'+view+'"]').click();await page.waitForFunction(v=>location.hash==='#'+v,view);}
  assert.equal(errors.length,0);assert.equal(api.length,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL(width+'.png',dir)),fullPage:true});results.push({width,pass:true,pageExceptions:0,apiRequests:0});await page.close();
 }
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();await page.goto(origin);assert.equal(await page.locator('#app-root').getAttribute('inert'),'');assert.ok(await page.locator('#connection-button').isDisabled());assert.ok(await page.locator('noscript').isVisible());await context.close();complete=true;console.log('PASS demo desktop/mobile keyboard, navigation and no-JavaScript fail-closed document');
}catch{throw Error('Demo startup verification failed; raw browser diagnostics suppressed');}
finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(new URL('result.json',dir),JSON.stringify({complete,results,noJavascriptBlocked:complete},null,2)+'\n',{flag:'wx'});}
