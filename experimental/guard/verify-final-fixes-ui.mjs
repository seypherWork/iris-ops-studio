// Independent real-browser regressions against the installed candidate.
// No credentials or native mutations: synthetic tab-local recovery proofs only.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,X509Certificate} from 'node:crypto';
const [portText,certificatePath,outputPath]=process.argv.slice(2),port=Number(portText);
assert.equal(process.argv.length,5);assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);
const origin='https://127.0.0.1:'+port,out=resolve(outputPath);await mkdir(out);
const certificate=new X509Certificate(await readFile(certificatePath));assert.equal(certificate.checkIP('127.0.0.1'),'127.0.0.1');
const spki=createHash('sha256').update(certificate.publicKey.export({format:'der',type:'spki'})).digest('base64');
const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:['--ignore-certificate-errors-spki-list='+spki]});
const results=[];let complete=false;
try{
 for(const width of [1440,390]){
  for(const mode of ['throw','no-effect']){
   const context=await browser.newContext({viewport:{width,height:width===390?844:900}});
   await context.addInitScript(({origin,mode})=>{
    if(location.origin!==origin)return;
    const keys=['managed:wallet:irisops-guard-recovery-v1','managed:webapp:webapp:irisops-guard-recovery-v1','managed:role:irisops-guard-recovery-v1','managed:user:irisops-guard-recovery-v1'];
    for(const key of keys)sessionStorage.setItem(key,JSON.stringify({last:'a'.repeat(32),entries:[['a'.repeat(32),'b'.repeat(64)]]}));
    const remove=Storage.prototype.removeItem;
    Storage.prototype.removeItem=function(key){if(key===keys[0]){if(mode==='throw')throw new DOMException('Synthetic test denial','SecurityError');return;}return remove.call(this,key);};
   },{origin,mode});
   const page=await context.newPage();let api=0;const errors=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api++;});page.on('pageerror',()=>errors.push('exception'));
   await page.goto(origin+'/csp/ops/guard-managed/web/index.html#secrets');await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');
   await page.locator('#guard-disconnect').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Recovery keys could not be removed'));
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='1');
   for(const selector of ['#guard-enable','#guard-reconcile','#guard-edit'])assert.ok(await page.locator(selector).isDisabled());
   const local=await page.evaluate(()=>({remaining:Object.keys(sessionStorage).filter(k=>k.startsWith('managed:')).length,walletRemaining:sessionStorage.getItem('managed:wallet:irisops-guard-recovery-v1')!==null,message:document.querySelector('#toast').textContent,mode:document.querySelector('#mode-label').textContent}));
   assert.equal(local.remaining,1);assert.ok(local.walletRemaining);assert.doesNotMatch(local.message,/keys cleared/);assert.match(local.mode,/disconnected/);assert.equal(api,0);assert.deepEqual(errors,[]);
   await page.screenshot({path:join(out,`cleanup-${mode}-${width}.png`)});results.push({case:'cleanup-'+mode,width,...local,apiRequests:api,pageErrors:errors.length});await context.close();
  }
 }
 for(const script of ['startup.js','app.js']){
  const context=await browser.newContext(),page=await context.newPage();await page.route('**/assets/'+script+'*',r=>r.abort('failed'));
  await page.goto(origin+'/csp/ops/guard-managed/web/index.html');await page.waitForFunction(()=>document.documentElement.dataset.startup==='failed');
  const locked=await page.evaluate(()=>document.querySelector('#app-root').inert);assert.ok(locked);await page.screenshot({path:join(out,'blocked-'+script+'.png')});results.push({case:'missing-'+script,failedVisible:true,locked});await context.close();
 }
 {
  const context=await browser.newContext(),page=await context.newPage();let release;
  const delayed=new Promise(r=>{release=r;});
  await page.route('**/assets/startup.js*',async route=>{await delayed;await route.continue();});
  const navigation=page.goto(origin+'/csp/ops/guard-managed/web/index.html');
  try{await page.waitForFunction(()=>document.documentElement.dataset.startup==='failed',null,{timeout:20000});}finally{release();}
  await navigation;await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.startup),'failed');assert.ok(await page.locator('#app-root').evaluate(e=>e.inert));results.push({case:'late-startup-module',lockedAfterArrival:true});await context.close();
 }
 complete=true;
}finally{await browser.close();await writeFile(join(out,'result.json'),JSON.stringify({complete,results,credentialsUsed:false,nativeMutations:false},null,2),{flag:'wx'});}
console.log(JSON.stringify({complete,checks:results.length,credentialsUsed:false,nativeMutations:false}));
