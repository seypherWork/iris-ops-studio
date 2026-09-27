// Exact j -> k -> j frontend-only upgrade. NEVER writes the retained source.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {createServer} from 'node:net';
import {sha256} from './build.mjs';
import {runStartupUi} from './verify-startup-ui.mjs';
const trial=process.argv[2];assert.match(trial||'',/^[a-z]$/);
const upgradeKey=process.argv[3]||'k';assert.ok(['k','m'].includes(upgradeKey));
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const prefix='irisops-guard-upgrade-20260926-'+trial,volume=prefix+'-data';
const source='irisops-guard-tls-cert-20260926-e-data';
const sourceEngine='irisops-guard-tls-cert-20260926-e-rollback';
const sourceId='8ebed68bce88f8b9b5c602f6caf33fb3eb1ddab9988c4b89e3ac4db18a89d4ff';
const cert='irisops-guard-tls-cert-20260926-e-cert-private';
const original='iris-ops-guard-dev-20260925',originalId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const candidates={
 j:{image:'sha256:e3bf6afaa22a0aca00891927506772b80720b5059403ecf705cca703e88af704',hash:'2be717326bdb6a4a93058f0b02a61811ffbb743c388965b9dd42bad6a036962a'},
 k:{image:'sha256:0f4595c23041c0b60deccca075f7b49428163547e36a13f886ffa8b508a499f3',hash:'d90e20a67c63f2fe71ab36708fa835d2b43ad5f57797f44e75bab6949c742c61'},
 m:{image:'sha256:760c51184a9ccac3f99cf18410e8b726dc4de292a2ef4886807ba98311f2eb93',hash:'41f42b7ad6c80d8569880aca0c8a726f137fe421ed7daf048a5ab1757f77328b'}
};
const origin='https://127.0.0.1:52804',pagePath='/csp/ops/guard-managed/web/index.html';
const dir=new URL('upgrade-cache-'+trial+'/',import.meta.url);
const checks=[],engines=[],helpers=[],observations=[],issues=[];
let target,browser,complete=false,phase='preflight',sourceHash,clonedHash,sourceFinalHash,originalBefore,ca,spki;
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:4*1024*1024});}catch{throw Error('Isolated Docker step failed; raw diagnostics suppressed');}}
function pass(s){checks.push(s);console.log('PASS '+s);}
function term(lines,ns='%SYS',name=target){const out=run(['exec','-i',name,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'Native step failed; raw diagnostics suppressed');return out;}
function call(code,ns='%SYS'){const out=term(['try { set r='+code+' write "RESULT=",r.%ToJSON(),! } catch e { write "STEP_FAILED",! }'],ns);const m=out.match(/RESULT=(\{.*\})/);assert.ok(m);return JSON.parse(m[1]);}
function oldSnapshot(){return term(['write "STATE=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',original).split(/\r?\n/).filter(s=>/^(STATE|COUNT)=/.test(s));}
function cold(v){assert.equal(run(['ps','-q','--filter','volume='+v]).trim(),'','Refuse a volume with any running consumer');}
const ro=(v,p)=>`type=volume,source=${v},target=${p},readonly`;
function helper(label,mounts,script){const name=prefix+'-'+label;helpers.push(name);const out=run(['run','-i','--name',name,'--network','none','--read-only','--user','51773:51773','--cap-drop','ALL','--security-opt','no-new-privileges',...mounts.flatMap(m=>['--mount',m]),'--entrypoint','bash',candidates.j.image,'-s'],'set -euo pipefail\numask 077\n'+script+'\n');assert.equal(run(['inspect','--format','{{.State.ExitCode}}',name]).trim(),'0');return out;}
const fingerprint=String.raw`
export LC_ALL=C TZ=UTC
fingerprint() (
 cd "$1"
 find . -print0 | sort -z | while IFS= read -r -d '' path; do
  printf '%s\0' "$path"
  stat --printf='%F\0%u\0%g\0%a\0%y\0' -- "$path"
  if [ -L "$path" ]; then readlink -z -- "$path"
  elif [ -f "$path" ]; then sha256sum --zero -- "$path"
  elif [ ! -d "$path" ]; then exit 1
  fi
 done | sha256sum
)
`;
function hashVolume(v,label){cold(v);const hash=helper(label,[ro(v,'/source')],fingerprint+'\nfingerprint /source').split(' ')[0];assert.match(hash,/^[a-f0-9]{64}$/);return hash;}
function stop(){if(target){run(['stop','--timeout','30',target]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',target]).trim(),'false|0');}}
function receiptHashes(){return term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set r=##class(IrisOps.Guard.Receipt).%OpenId(q.%Get("OperationId")),p=r.Public() write "ROW=",r.OperationId,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,p.%ToJSON()_r.RecoveryHash_r.Binding)),! }'],'IRISOPS').split(/\r?\n/).filter(s=>s.startsWith('ROW='));}
function state(){return {installation:call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")'),deployment:call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS'),receipts:receiptHashes()};}
function integrity(){assert.ok(term(['set dirs=$listbuild("/durable/irisops-code/","/durable/irisops-guard-state/")','set sc=$$CheckList^Integrity(,dirs,0,,1)','write "INTEGRITY_OK=",$system.Status.IsOK(sc),!']).includes('INTEGRITY_OK=1'));}
async function launch(label,key){cold(volume);for(const e of engines)assert.equal(run(['inspect','--format','{{.State.Running}}',e.name]).trim(),'false');target=prefix+'-'+label;const image=candidates[key].image;const id=run(['run','-d','--name',target,'--label','irisops.upgrade-lab=20260926','--mount','type=volume,source='+volume+',target=/durable','--mount',ro(cert,'/run/irisops-tls'),'-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52804:52774',image]).trim();assert.match(id,/^[a-f0-9]{64}$/);engines.push({name:target,id,image,volume});let ready=false;for(let i=0;i<90;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'IRIS did not become ready');
 assert.deepEqual(JSON.parse(run(['inspect','--format','{{json .HostConfig.PortBindings}}',target])),{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:'52804'}]});
 const mounts=JSON.parse(run(['inspect','--format','{{json .Mounts}}',target]));assert.equal(mounts.length,2);assert.ok(mounts.some(m=>m.Name===volume&&m.RW));assert.ok(mounts.some(m=>m.Name===cert&&!m.RW));
 for(const e of candidates[key].manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',target,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
 assert.equal(call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")').action,'NO_CHANGE');integrity();
}
function get(path,headers={}){return new Promise((resolve,reject)=>{const q=httpsRequest({hostname:'127.0.0.1',servername:'',port:52804,path,headers,ca,rejectUnauthorized:true,agent:false,timeout:15000},r=>{const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>resolve({status:r.statusCode,bytes:Buffer.concat(chunks),cacheControl:r.headers['cache-control']||''}));});q.on('error',e=>reject(Error(e.code||'TLS error')));q.on('timeout',()=>q.destroy(Error('Timeout')));q.end();});}
const contexts=[];
async function newViewer(width){const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block'}),page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});const viewer={context,page,cdp,width,stage:'',assets:[],pending:[],errors:[],api:[],cacheEvents:[],requests:new Map()};page.setDefaultTimeout(20000);
 page.on('pageerror',()=>viewer.errors.push(viewer.stage));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))viewer.api.push(viewer.stage);});
 cdp.on('Network.requestWillBeSent',e=>viewer.requests.set(e.requestId,new URL(e.request.url).pathname));
 cdp.on('Network.requestServedFromCache',e=>viewer.cacheEvents.push({stage:viewer.stage,path:viewer.requests.get(e.requestId)||'unknown'}));
 page.on('response',r=>{const u=new URL(r.url());if(!u.pathname.startsWith('/csp/ops/guard-managed/'))return;const stage=viewer.stage;viewer.pending.push((async()=>{try{const headers=await r.allHeaders();viewer.assets.push({stage,path:u.pathname,query:u.search,status:r.status(),hash:sha256(await r.body()),cacheControl:headers['cache-control']||'',etag:headers.etag||'',lastModified:headers['last-modified']||''});}catch{viewer.assets.push({stage,path:u.pathname,bodyUnavailable:true});}})());});contexts.push(viewer);return viewer;}
async function observe(viewer,stage,key,{reload=false,force=false,query=''}={}){const {page,width}=viewer;viewer.stage=stage;if(force){await Promise.all([page.waitForEvent('load'),viewer.cdp.send('Page.reload',{ignoreCache:true})]);await page.waitForLoadState('networkidle');}else if(reload){await page.reload({waitUntil:'networkidle'});}else{await page.goto('about:blank');await page.goto(origin+pagePath+query+'#secrets',{waitUntil:'networkidle'});}await page.locator('#guard-mode').waitFor();const hasStartupRoot=await page.locator('#app-root').count();if(key!=='j'&&hasStartupRoot)await page.waitForFunction(()=>document.documentElement.dataset.startup==='ready');if(key!=='j'&&!hasStartupRoot)issues.push({stage,width,kind:'old-document-without-startup-gate'});
 const button=width===390?page.locator('.mobile-only[data-open-connection]'):page.locator('#connection-button');await button.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#connection-dialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await Promise.all(viewer.pending);
 const assets=viewer.assets.filter(a=>a.stage===stage),map=new Map(candidates[key].manifest.entries.map(e=>[e.path,e.sha256]));const mismatches=[];
 for(const a of assets){const path='ui'+a.path.slice('/csp/ops'.length);if(a.bodyUnavailable){issues.push({stage,width,path,kind:'body-unavailable'});continue;}const expected=map.get(path);if(!expected||a.hash!==expected)mismatches.push({path,expected:expected||'not-in-manifest',observed:a.hash});}
 assert.ok(assets.some(a=>a.path===pagePath));assert.ok(assets.some(a=>a.path.endsWith('/styles.css')));assert.ok(assets.some(a=>a.path.endsWith('/app.js')));
 if(mismatches.length)issues.push({stage,width,kind:'stale-or-mixed-assets',mismatches});
 assert.equal(viewer.errors.length,0);assert.equal(viewer.api.length,0);
 await page.screenshot({path:fileURLToPath(new URL(stage+'-'+width+'.png',dir)),fullPage:true});
 observations.push({stage,width,reload,force,query,hasStartupRoot:!!hasStartupRoot,assets,cacheEvents:viewer.cacheEvents.filter(e=>e.stage===stage),mismatches,pageExceptions:viewer.errors.length,apiRequests:viewer.api.length,credentialsEntered:false});
 console.log((mismatches.length?'FINDING':'PASS')+' browser '+stage+' '+width+' asset hashes; '+viewer.cacheEvents.filter(e=>e.stage===stage).length+' cache hits');
}
await mkdir(dir,{recursive:false});
for(const [key,c] of Object.entries(candidates)){c.path=resolve('..','irisops-guard-tls-package-20260926-'+key);c.manifest=JSON.parse(await readFile(join(c.path,'manifest.json'),'utf8'));assert.equal(c.manifest.contentSha256,c.hash);assert.equal(sha256(JSON.stringify(c.manifest.entries)),c.hash);for(const e of c.manifest.entries)assert.equal(sha256(await readFile(join(c.path,e.path))),e.sha256);assert.equal(run(['image','inspect','--format','{{.Id}}',c.image]).trim(),c.image);}
const oldEntries=new Map(candidates.j.manifest.entries.map(e=>[e.path,e.sha256])),newEntries=new Map(candidates[upgradeKey].manifest.entries.map(e=>[e.path,e.sha256]));const changed=[...new Set([...oldEntries.keys(),...newEntries.keys()])].filter(p=>oldEntries.get(p)!==newEntries.get(p)).sort();assert.deepEqual(changed,[...(upgradeKey==='m'?['tls/httpd-local.conf']:[]),'ui/guard-managed/web/assets/app.js','ui/guard-managed/web/assets/startup.js','ui/guard-managed/web/assets/styles.css','ui/guard-managed/web/index.html']);
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.State.ExitCode}}',sourceEngine]).trim(),sourceId+'|false|0');assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',original]).trim(),originalId+'|true');originalBefore=oldSnapshot();cold(source);
assert.ok(!run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).includes(volume));assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).some(n=>n.startsWith(prefix)));
await new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(52804,'127.0.0.1',()=>s.close(res));});
try{
 phase='cold clone';sourceHash=hashVolume(source,'source-before');run(['volume','create','--label','irisops.upgrade-lab=20260926',volume]);helper('clone',[ro(source,'/source'),'type=volume,source='+volume+',target=/durable'],`test -z "$(find /durable -mindepth 1 -print -quit)"\ntar --numeric-owner --sparse --format=posix --pax-option=delete=atime,delete=ctime -cpf - -C /source . | tar --extract --numeric-owner --same-owner --same-permissions --delay-directory-restore -pf - -C /durable`);clonedHash=hashVolume(volume,'clone-before');assert.equal(clonedHash,sourceHash);pass('read-only cold source cloned to new volume with matching logical bytes and metadata');
 phase='old image';await launch('before','j');const baseline=state();assert.equal(baseline.deployment.mode,'SUSPENDED');assert.equal(baseline.receipts.length,4);
 ca=run(['exec',target,'cat','/run/irisops-tls/ca.crt']);const leaf=run(['exec',target,'cat','/run/irisops-tls/server.crt']);spki=createHash('sha256').update(new X509Certificate(leaf).publicKey.export({type:'spki',format:'der'})).digest('base64');assert.equal((await get(pagePath)).status,200);
 const {chromium}=createRequire(import.meta.url)(process.env.IRISOPS_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,executablePath:process.env.IRISOPS_BROWSER_EXECUTABLE,args:['--ignore-certificate-errors-spki-list='+spki]});
 for(const width of [1440,390]){const v=await newViewer(width);await observe(v,'before-cold','j');await observe(v,'before-warm','j');}pass('existing install and four retained receipts start on original image without reinstall');
 phase='upgrade';stop();await launch('upgraded',upgradeKey);assert.deepEqual(state(),baseline);assert.equal(sha256((await get(pagePath)).bytes),newEntries.get('ui/guard-managed/web/index.html'));pass('new image serves exact '+upgradeKey+' files over verified TLS; installed configuration and historical receipts unchanged');
 if(upgradeKey==='m'){
  for(const e of candidates.m.manifest.entries.filter(e=>e.path.startsWith('ui/'))){const response=await get('/csp/ops'+e.path.slice(2),{'If-Modified-Since':'Thu, 01 Jan 2099 00:00:00 GMT','If-None-Match':'*'});assert.equal(response.status,200);assert.equal(response.cacheControl,'no-store');assert.equal(sha256(response.bytes),e.sha256);}
  for(const path of ['/api/admin/login','/csp/sys/UtilHome.csp','/csp/ops/index.html'])assert.equal((await get(path)).status,403);
  pass('every static UI file returns exact current bytes and no-store even with stale/future validators; native routes still denied');
  for(const v of contexts){await observe(v,'upgraded-versioned-entry','m',{query:'?release=guard-cache-m1'});v.stage='unversioned-before-hard-reload';await v.page.goto(origin+pagePath+'#secrets',{waitUntil:'networkidle'});await observe(v,'upgraded-hard-reload','m',{force:true});await observe(v,'upgraded-warm','m');await observe(v,'upgraded-reload','m',{reload:true});}
 }else for(const v of contexts){await observe(v,'upgraded-warm','k');await observe(v,'upgraded-reload','k',{reload:true});}
 await runStartupUi({origin,tlsSpki:spki,suffix:'upgraded-'+trial,pass});
 phase='rollback';stop();await launch('rollback','j');assert.deepEqual(state(),baseline);assert.equal(sha256((await get(pagePath)).bytes),oldEntries.get('ui/guard-managed/web/index.html'));for(const v of contexts){if(upgradeKey==='m'){await observe(v,'rollback-hard-reload','j',{force:true});await observe(v,'rollback-versioned-entry','j',{query:'?release=guard-rollback-j1'});}await observe(v,'rollback-warm','j');await observe(v,'rollback-reload','j',{reload:true});}
 pass('old image restored over same owned volume, no reinstall, configuration and all four receipt hashes unchanged');assert.deepEqual(state(),baseline);integrity();
 complete=issues.length===0;phase=complete?'complete':'cache findings';
}catch(e){issues.push({phase,kind:'run-interrupted',message:e instanceof assert.AssertionError?'assertion failed':String(e.message).slice(0,160)});throw Error('Upgrade/cache check interrupted in '+phase+'; sanitized evidence retained');}
finally{
 if(browser)await browser.close();if(target)stop();
 if(sourceHash){sourceFinalHash=hashVolume(source,'source-final');assert.equal(sourceFinalHash,sourceHash);}
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',original]).trim(),originalId+'|true');assert.deepEqual(oldSnapshot(),originalBefore);assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',sourceEngine]).trim(),sourceId+'|false');
 for(const e of engines)assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',e.name]).trim(),'false|0');
 await writeFile(new URL('result.json',dir),JSON.stringify({timestamp:new Date().toISOString(),complete,phase,upgradeKey,checks,issues,engines,helpers,source,volume,certificateVolume:cert,sourceHash,clonedHash,sourceFinalHash,sourcePreserved:sourceHash===sourceFinalHash,originalPreserved:true,changed,observations,credentialsEntered:false,productionReady:false,limits:['frontend-only plus HTTP cache policy, identical native classes and IRIS engine','no schema migration or production gateway','Chrome exact-leaf test-profile exception; independent strict CA validation','rollback intentionally restores the known j early-click limitation','legacy cache requires versioned entry or hard reload; normal reload alone is not a migration guarantee']},null,2)+'\n',{flag:'wx'});
}
if(!complete)process.exitCode=1;
