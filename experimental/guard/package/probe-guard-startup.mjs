// Read-only reproduction on the currently owned e laboratory. No credentials.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {X509Certificate,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {request} from 'node:https';
const container='irisops-guard-tls-cert-20260926-e-source';
function docker(args){try{return execFileSync(process.env.IRISOPS_DOCKER_EXECUTABLE,args,{encoding:'utf8',stdio:'pipe',timeout:20000});}catch{throw Error('Read-only startup probe command failed; raw output suppressed');}}
assert.equal(docker(['inspect','--format','{{.State.Running}}',container]).trim(),'true');
const ca=docker(['exec',container,'cat','/run/irisops-tls/ca.crt']);
const certificate=new X509Certificate(docker(['exec',container,'cat','/run/irisops-tls/server.crt']));
const spki=createHash('sha256').update(certificate.publicKey.export({type:'spki',format:'der'})).digest('base64');
const origin='https://127.0.0.1:52804';
await new Promise((resolve,reject)=>{const q=request(origin+'/csp/ops/guard-managed/web/index.html',{ca,rejectUnauthorized:true,timeout:5000},r=>{r.resume();r.on('end',()=>r.statusCode===200?resolve():reject(Error('Document unavailable')));});q.on('error',()=>reject(Error('Strict TLS validation failed')));q.on('timeout',()=>q.destroy());q.end();});
const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:['--ignore-certificate-errors-spki-list='+spki]});
let release,observed=false;const held=new Promise(r=>release=r);let intercepted;const seen=new Promise(r=>intercepted=r);const apiRequests=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);page.on('request',r=>{if(r.url().includes('/api/'))apiRequests.push('api_request');});
 await page.route('**/wallet-guard.js',async route=>{intercepted();await held;await route.continue();});
 await page.goto(origin+'/csp/ops/guard-managed/web/index.html#secrets',{waitUntil:'commit'});
 await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Guard import was not intercepted')),10000))]);
 await page.locator('#connection-button').waitFor();assert.equal(await page.locator('#connection-button').isEnabled(),true);await page.locator('#connection-button').click();
 const before={dialogOpen:await page.locator('#connection-dialog').evaluate(e=>e.open),guardRendered:await page.locator('#guard-mode').count()!==0};
 assert.deepEqual(before,{dialogOpen:false,guardRendered:false});
 release();await page.locator('#guard-mode').waitFor();await page.locator('#connection-button').click();assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),true);assert.equal(apiRequests.length,0);observed=true;
 await writeFile(new URL('guard-startup-observation-e.json',import.meta.url),JSON.stringify({reproduced:true,method:'hold dynamic guard import before first click, then release and click again',earlyButtonEnabled:true,earlyClickOpensDialog:false,readyClickOpensDialog:true,apiRequests:0,credentialsEntered:false,runtimeModified:false},null,2)+'\n',{flag:'wx'});
 console.log('REPRODUCED: connection button accepts a click before handlers exist; ready click opens dialog; no API requests or credentials.');
}catch{throw Error('Startup probe failed; raw browser diagnostics suppressed');}
finally{release?.();await browser.close();if(!observed)console.log('Startup observation incomplete');}
