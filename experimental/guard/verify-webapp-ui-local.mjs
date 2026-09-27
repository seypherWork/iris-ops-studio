// OFFLINE browser simulation, not live IRIS evidence. Every request intercepted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.IRISOPS_PLAYWRIGHT_MODULE);
const base=fileURLToPath(new URL('../../',import.meta.url)),dir=new URL('webapp-ui-local-evidence/',import.meta.url);
await mkdir(dir,{recursive:true});
const origin='http://127.0.0.1:52801',prefix='/csp/ops/guard-webapp/',id='a'.repeat(32),key='b'.repeat(64),hash='c'.repeat(64),at='2026-09-26T00:00:00Z';
const before={Enabled:false,configurationHash:hash},expected={Enabled:true,configurationHash:hash};
let enabled=false,writes=0;const failures=[],requests=[],checks=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(7000);
 page.on('pageerror',e=>failures.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.pathname);
  if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/api/irisops-web-guard/v1')){
   const endpoint=url.pathname.slice('/api/irisops-web-guard/v1'.length);
   const receipt={id,actor:'Tester',target:'/csp/irisops-guard-testweb',state:'VERIFIED',reason:'availability_and_configuration_match',dispatchCount:1,before,expected,observed:expected,events:[{state:'DISPATCHING',reason:'submitted_once',at},{state:'VERIFIED',reason:'availability_and_configuration_match',at}],rechecks:[],createdUTC:at};
   let body;
   if(endpoint==='/session')body={actor:'Tester',csrf:'synthetic-csrf'};
   else if(endpoint==='/connect')body={connected:true,actor:'Tester',authorizationSeconds:60};
   else if(endpoint==='/channels')body={channel:id,mode:'read-only'};
   else if(endpoint.endsWith('/write-access'))body={mode:req.method()==='DELETE'?'read-only':'write-enabled',expiresIn:60};
   else if(endpoint==='/webapp')body={Enabled:enabled,configurationHash:hash};
   else if(endpoint==='/previews')body={id,recoveryKey:key,target:'/csp/irisops-guard-testweb',confirmation:'APPLY aaaaaaaa',expiresIn:30,before,expected};
   else if(endpoint.endsWith('/execute')){enabled=true;writes++;body=receipt;}
   else if(endpoint.endsWith('/inspect'))body={receipt,currentObservation:{at,outcome:'MATCHES_EXPECTED',...expected,causality:'not_proven'},observationPersisted:false,administrativeWrites:0};
   else body={ok:true};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  }
  if(!url.pathname.startsWith(prefix))return route.abort();
  const relative=decodeURIComponent(url.pathname.slice(prefix.length)),file=path.resolve(base,relative);
  if(!file.startsWith(path.resolve(base)+path.sep))return route.abort();
  try{const body=await readFile(file);return route.fulfill({status:200,body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});}catch{return route.fulfill({status:404,body:'Not found'});}
 });
 await page.goto(origin+prefix+'web/index.html#webapps');assert.ok(await page.locator('#guard-edit').isDisabled());
 await page.locator('#connection-button').click();await page.locator('#username').fill('Tester');await page.locator('#password').fill('synthetic');
 await page.locator('#connect-submit').click();await page.getByText('Connected to IRIS guard · Web app only · read-only',{exact:true}).waitFor();
 await page.locator('#guard-enable').click();await page.getByText('Write-enabled · temporary',{exact:true}).waitFor();await page.locator('#guard-edit').click();
 await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.ok(await page.locator('#confirm-submit').isDisabled());
 await page.locator('#confirmation-input').fill('wrong');assert.ok(await page.locator('#confirm-submit').isDisabled());
 await page.screenshot({path:fileURLToPath(new URL('preview-desktop.png',dir))});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:fileURLToPath(new URL('preview-mobile.png',dir))});
 if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))console.log(JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('*')].filter(n=>!n.closest('nav')).map(n=>({tag:n.tagName,id:n.id,cls:n.className,x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width})).filter(n=>n.width&&n.x+n.width>innerWidth+1).slice(0,40)}))));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('desktop/mobile preview and disabled confirmation controls');
 await page.locator('#confirmation-input').fill('APPLY aaaaaaaa');await page.locator('#confirm-submit').click();await page.locator('#guard-original').filter({hasText:'VERIFIED'}).waitFor();assert.equal(writes,1);
 await page.locator('#guard-inspect').click();await page.locator('#guard-observation').filter({hasText:'MATCHES_EXPECTED'}).waitFor();assert.equal(writes,1);
 checks.push('simulated execute, strict receipt rendering and read-only recovery');
 await page.locator('#journal-button').click();await page.getByText('Web app guard · session journal',{exact:true}).waitFor();assert.ok(!(await page.locator('#content').innerText()).includes(key));checks.push('journal does not expose recovery proof');
 assert.deepEqual(failures,[]);assert.ok(requests.every(p=>!p.startsWith('/api/admin')));checks.push('zero page exceptions and zero native API requests');
 console.log('PASS offline Web app UI: '+checks.length+' groups (not live IRIS)');
 await writeFile(new URL('result.json',dir),JSON.stringify({timestamp:new Date().toISOString(),source:'OFFLINE_SIMULATION_NOT_IRIS',complete:true,checks},null,2)+'\n');
}finally{await browser.close();}
