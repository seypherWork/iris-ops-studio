// New named LAB only. No host trust changes; no secrets in artifacts or output.
import assert from 'node:assert/strict';
import {runDurableLifecycle} from './tls-durable-lifecycle.mjs';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {basename,resolve,join} from 'node:path';
import {randomBytes,createHash,X509Certificate} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {createServer} from 'node:net';
import {sha256} from './build.mjs';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const artifact=resolve(process.argv[2]),suffix=basename(artifact).match(/^irisops-guard-tls-package-20260926-([a-z])$/)?.[1];assert.ok(suffix);
const trial=process.argv[3];assert.match(trial||'',/^[a-z]$/);
const prefix='irisops-guard-tls-durable-20260926-'+trial;
let container=prefix+'-source';const image='sha256:e3bf6afaa22a0aca00891927506772b80720b5059403ecf705cca703e88af704';
const dataVolume=prefix+'-data',restoredVolume=prefix+'-restored-data',archiveVolume=prefix+'-archives',engines=[];
const certVolume=prefix+'-cert-private',helper=prefix+'-certificate';
const reference='iris-ops-guard-tls-20260926-j',referenceId='35f835a745f26af65c1324d42c9a1a6181e83194724f134b3b2f35132d04d79f';
const previous='iris-ops-guard-dev-20260925',previousId='d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38';
const origin='https://127.0.0.1:52804',app='/api/irisops-managed-guard',user='IrisOps_GuardTLSUser',role='IrisOps_GuardTLSRole';
const wallet='IrisOps_GuardProbeWallet',web='/csp/irisops-guard-testweb';
const resources=['IrisOps_GuardProbeResource','IrisOps_GuardProbeAlternate','IrisOps_GuardWebResource'];
const initial={EditResource:resources[0]+':WRITE',UseResource:resources[0]+':READ'},proposed={...initial,UseResource:resources[1]+':READ'};
const password=randomBytes(32).toString('base64url')+'aA1!',basic='Basic '+Buffer.from(user+':'+password).toString('base64');
const checks=[],secrets=new Set([password,basic]),keys=new Set(),lifetimes=new WeakMap(),metadata=new WeakMap(),started=new Date().toISOString();let ca,leaf,spki,controls,containerId,complete=false,fixturesRemoved=false;
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Isolated command failed; raw output suppressed');}}
function term(lines,ns='%SYS',target=container){const out=run(['exec','-i',target,'iris','session','IRIS','-U',ns],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('STEP_FAILED')&&!/Detected \d+ errors/.test(out),'IRIS step failed; raw output suppressed');return out;}
const check='if $system.Status.IsError(sc) write "STEP_FAILED",! halt';
function change(lines,ns='%SYS'){assert.ok(term([...lines,'write "DONE",!'],ns).includes('DONE'));}
function call(code,ns='%SYS'){const out=term(['try { set result='+code+' write "RESULT=",result.%ToJSON(),! } catch e { write "ERROR=",e.Name,! }'],ns);const err=out.match(/ERROR=([A-Za-z0-9_]+)/);if(err)return {error:err[1]};const m=out.match(/RESULT=(\{.*\})/);assert.ok(m,'No result');return JSON.parse(m[1]);}
function transition(mode){const p=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');assert.ok(!p.error);const r=call(`##class(IrisOps.Guard.Deployment).Apply("${p.fingerprint}","${mode}","managed-lab-a")`,'IRISOPS');assert.equal(r.mode,mode);return r;}
function pass(s){checks.push(s);console.log('PASS '+s);}
function oldSnapshot(){return term(['write "OLD=",$get(^IrisOpsGuardDeploy("state")),!','set q=##class(%SQL.Statement).%ExecDirect(,"SELECT COUNT(*) AS Total FROM IrisOps_Guard.Receipt")','if q.%Next() write "COUNT=",q.%Get("Total"),!'],'IRISOPS',previous).split(/\r?\n/).filter(s=>/^(OLD|COUNT)=/.test(s));}
function safe(text){for(const secret of secrets)assert.ok(!text.includes(secret),'A response/log contains a fixture secret');assert.ok(!text.includes('PRIVATE KEY'),'Private key in observable output');}
function raw(path,method='GET',body,headers={},options={}){return new Promise((resolve,reject)=>{
 const payload=body===undefined?undefined:JSON.stringify(body);
 // Pin TLS identity separately from the deliberate HTTP Host-header negatives.
 const q=httpsRequest({hostname:'127.0.0.1',servername:'',port:52804,path,method,ca,agent:false,rejectUnauthorized:true,headers:{...headers,...(payload?{'Content-Length':Buffer.byteLength(payload)}:{})},timeout:15000,...options},r=>{
  let text='';const protocol=r.socket.getProtocol();r.setEncoding('utf8');r.on('data',s=>{text+=s;});r.on('end',()=>{try{safe(text);let data;try{data=JSON.parse(text);}catch{data=null;}resolve({status:r.statusCode,body:data,headers:r.headers,protocol});}catch(e){reject(e);}});
 });q.on('error',e=>reject(Error(e.code||'TLS transport failed')));q.on('timeout',()=>q.destroy(Error('Fixed TLS socket timeout')));q.end(payload);
});}
async function request(path,method='GET',body,h=controls){const r=await raw(app+'/v1'+path,method,body,h);if(path.endsWith('/previews')&&r.status===200){assert.equal(typeof r.body.recoveryKey,'string');keys.add(r.body.recoveryKey);secrets.add(r.body.recoveryKey);}return r;}
async function login(){const r=await request('/session','GET',undefined,{Authorization:basic});assert.equal(r.status,200,'Native TLS session rejected');assert.equal(r.body.actor,user);
 const cookies=r.headers['set-cookie']||[];assert.ok(cookies.some(c=>c.startsWith('CSPSESSIONID')),'Native session cookie missing');
 for(const c of cookies.filter(c=>c.startsWith('CSPSESSIONID'))){assert.match(c,/;\s*Secure(?:;|$)/i);assert.match(c,/;\s*HttpOnly(?:;|$)/i);assert.match(c,/;\s*SameSite=Strict(?:;|$)/i);assert.match(c,/;\s*Path=\/api\/irisops-managed-guard\/(?:;|$)/i);}
 const h={Cookie:cookies.map(c=>c.split(';')[0]).join('; '),Origin:origin,'X-IrisOps-CSRF':r.body.csrf,'Content-Type':'application/json'};
 const info=await request('/connect','POST',{user,password},h);assert.equal(info.status,200,'Native login via fixed loopback rejected');assert.ok(Number.isInteger(info.body.authorizationSeconds)&&info.body.authorizationSeconds>0&&info.body.authorizationSeconds<=60);assert.equal(info.body.idleSeconds,info.body.authorizationSeconds);lifetimes.set(h,info.body.authorizationSeconds);metadata.set(h,info.body);return h;
}
function absent(){assert.ok(term([`write "ABSENT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),##class(%Wallet.Collection).Exists("${wallet}"),##class(Security.Applications).Exists("${web}"),${resources.map(r=>'##class(Security.Resources).Exists("'+r+'")').join(',')},!`]).includes('ABSENT=0000000'));}
function native(){const out=term([`set found=##class(%Wallet.Collection).Exists("${wallet}",.w,.sc)`,'if \'found write "STEP_FAILED",! halt','write "WALLET=",w.UseResource,!','kill p',`set sc=##class(Security.Applications).Get("${web}",.p)`,check,'write "WEB=",p("Enabled"),!']);return {use:out.match(/^WALLET=(.*)$/m)?.[1].trim().toUpperCase(),enabled:+out.match(/^WEB=(\d+)/m)?.[1]};}
function restore(){change([`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Modify("${wallet}",.p)`,check,'kill p','set p("Enabled")=0',`set sc=##class(Security.Applications).Modify("${web}",.p)`,check]);assert.deepEqual(native(),{use:initial.UseResource.toUpperCase(),enabled:0});}
async function ready(){for(let i=0;i<90;i++){try{if(term(['write "IRIS_READY",!']).includes('IRIS_READY'))return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Fresh IRIS not ready');}
async function waitUntil(deadline,label){while(Date.now()<deadline){console.log('WAIT '+label+' '+Math.ceil((deadline-Date.now())/1000)+'s');await new Promise(r=>setTimeout(r,Math.min(30000,deadline-Date.now())));}}
const manifest=JSON.parse(await readFile(join(artifact,'manifest.json'),'utf8'));assert.equal(manifest.contentSha256,'2be717326bdb6a4a93058f0b02a61811ffbb743c388965b9dd42bad6a036962a');assert.equal(run(['image','inspect','--format','{{.Id}}',image]).trim(),image);assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',reference]).trim(),referenceId+'|false');assert.equal(manifest.contentSha256,sha256(JSON.stringify(manifest.entries)));for(const e of manifest.entries)assert.equal(sha256(await readFile(join(artifact,e.path))),e.sha256);
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',previous]).trim(),previousId+'|true');const old=oldSnapshot();
assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).some(n=>n.startsWith(prefix)));
for(const v of [dataVolume,restoredVolume,archiveVolume])assert.ok(!run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).includes(v));
for(const name of [container,helper])assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(name),'Container collision');assert.ok(!run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).includes(certVolume),'Volume collision');
await new Promise((res,rej)=>{const s=createServer();s.on('error',rej);s.listen(52804,'127.0.0.1',()=>s.close(res));});
try{
 for(const v of [certVolume,dataVolume,restoredVolume,archiveVolume])run(['volume','create','--label','irisops.tls-durable-lab=20260926',v]);
 // Generation is entirely inside the new private volume; only public certs leave it.
 run(['run','--name',helper,'--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--user','51773:51773','--mount','type=volume,src='+certVolume+',dst=/durable','--entrypoint','bash',image,'-c',`set -euo pipefail
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -keyout /durable/ca.key -out /durable/ca.crt -days 2 -subj /CN=IrisOps-Private-Lab-CA -addext basicConstraints=critical,CA:TRUE >/dev/null 2>&1
openssl req -newkey rsa:3072 -nodes -keyout /durable/server.key -out /durable/server.csr -subj /CN=127.0.0.1 >/dev/null 2>&1
openssl x509 -req -in /durable/server.csr -CA /durable/ca.crt -CAkey /durable/ca.key -CAcreateserial -out /durable/server.crt -days 2 -extfile <(printf '%s\n' 'subjectAltName=IP:127.0.0.1' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth') >/dev/null 2>&1
openssl verify -CAfile /durable/ca.crt -verify_ip 127.0.0.1 /durable/server.crt >/dev/null
printf CERTIFICATE_READY`]);
 assert.equal(run(['inspect','--format','{{.State.ExitCode}}',helper]).trim(),'0');
 containerId=run(['run','-d','--name',container,'--label','irisops.tls-lab=20260926','--mount','type=volume,src='+certVolume+',dst=/run/irisops-tls,readonly','--mount','type=volume,src='+dataVolume+',dst=/durable','-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52804:52774',image]).trim();assert.match(containerId,/^[a-f0-9]{64}$/);engines.push({name:container,id:containerId,volume:dataVolume});await ready();assert.ok(term(['write "DURABLE=",$system.Container.IsDeployed(),!']).includes('DURABLE=1'));
 ca=run(['exec',container,'cat','/run/irisops-tls/ca.crt']);leaf=run(['exec',container,'cat','/run/irisops-tls/server.crt']);const x509=new X509Certificate(leaf);assert.equal(x509.checkIP('127.0.0.1'),'127.0.0.1');spki=createHash('sha256').update(x509.publicKey.export({type:'spki',format:'der'})).digest('base64');
 assert.equal(run(['exec',container,'stat','-c','%a|%u|%g','/run/irisops-tls/server.key']).trim(),'600|51773|51773');
 const bindings=JSON.parse(run(['inspect','--format','{{json .HostConfig.PortBindings}}',container]));assert.deepEqual(bindings,{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:'52804'}]});
 run(['exec',container,'/usr/irissys/httpd/bin/httpd','-t','-f','/usr/irissys/httpd/conf/httpd.conf','-c','Listen 52773']);
 for(const e of manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',container,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
 assert.ok(term(['write "CLEAN=",##class(Config.Namespaces).Exists("IRISOPS"),##class(Security.Applications).Exists("'+app+'"),!']).includes('CLEAN=00'));
 change(['set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")',check]);const p=call(`##class(IrisOps.Guard.Bootstrap).Plan("${origin}")`);assert.equal(p.installed,false);const installed=call(`##class(IrisOps.Guard.Bootstrap).Install("${p.fingerprint}","${origin}")`);assert.equal(installed.installed,true,'Bootstrap: '+installed.error);
 pass('fresh image hashes, native install, private key permissions and sole loopback HTTPS port verified');
 if(process.env.IRISOPS_RENEWAL==='1'){
  for(const name of ['TestSession','TestRenewal']){
   const path=resolve(artifact,'../iris-ops-studio-server-guard-20260925/experimental/guard/IrisOps.Guard.'+name+'.cls');
   run(['cp',path,container+':/tmp/IrisOps.Guard.'+name+'.cls']);
   change(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.'+name+'.cls","ck")',check],'IRISOPS');
  }
  assert.ok(term(['do ##class(IrisOps.Guard.TestRenewal).Run()'],'IRISOPS').includes('RENEWAL_CUSTODY_TESTS_COMPLETE'));
  pass('native synthetic custody tests: encrypted pair, nonce consumption, approval clearing and original family bound');
 }
 const tls12=await raw('/csp/ops/guard-managed/web/index.html','GET',undefined,{}, {minVersion:'TLSv1.2',maxVersion:'TLSv1.2'});assert.equal(tls12.status,200);assert.equal(tls12.protocol,'TLSv1.2');assert.equal((await raw('/csp/ops/guard-managed/web/index.html')).protocol,'TLSv1.3');
 await assert.rejects(raw('/','GET',undefined,{}, {ca:undefined}));await assert.rejects(raw('/','GET',undefined,{}, {servername:'wrong.invalid'}));await assert.rejects(raw('/','GET',undefined,{}, {minVersion:'TLSv1.1',maxVersion:'TLSv1.1'}));
 for(const path of ['/api/admin/login','/api/admin/v2/web-apps','/csp/sys/UtilHome.csp','/csp/ops/index.html','/api/irisops-combined-guard/v1/session'])assert.equal((await raw(path)).status,403,'Unexpected exposed route');
 const plain=await new Promise(resolve=>{const q=httpRequest({hostname:'127.0.0.1',port:52804,path:app+'/v1/session',timeout:5000},r=>{r.resume();resolve(r.statusCode);});q.on('error',()=>resolve(0));q.on('timeout',()=>{q.destroy();resolve(0);});q.end();});assert.notEqual(plain,200);
 pass('real TLS 1.2/1.3 certificate validation; untrusted CA, wrong identity, TLS 1.1, plaintext and native routes rejected');
 absent();change([...resources.flatMap(r=>[`set sc=##class(Security.Resources).Create("${r}","Owned TLS fixture","")`,check]),`set sc=##class(Security.Roles).Create("${role}","Owned TLS operator","%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,${resources[0]}:RW,${resources[1]}:RW,${resources[2]}:U","")`,check,`set sc=##class(Security.Users).Create("${user}","${role}","${password}","Owned TLS user","USER","","",0,1)`,check,`set p("EditResource")="${initial.EditResource}",p("UseResource")="${initial.UseResource}"`,`set sc=##class(%Wallet.Collection).Create("${wallet}",.p)`,check,'kill p',`set p("Enabled")=0,p("NameSpace")="IRISOPS",p("AutheEnabled")=32,p("Resource")="${resources[2]}",p("ServeFiles")=0,p("Description")="Owned TLS fixture",p("Path")="/tmp/irisops-guard-empty/",p("PermittedClasses")="0A"`,`set sc=##class(Security.Applications).Create("${web}",.p)`,check]);
 assert.deepEqual(native(),{use:initial.UseResource.toUpperCase(),enabled:0});controls=await login();assert.equal((await request('/capabilities')).status,200);
 for(const h of [{...controls,Host:'other.invalid'},{...controls,Origin:'http://127.0.0.1:52804'}])assert.equal((await request('/capabilities','GET',undefined,h)).status,403);
 pass('native login, secure scoped cookie attributes and wrong Host/Origin checked');
 // Native HttpRequest.Server is calculated from Host; it cannot test independent
 // destination/Host values. A stdlib socket fixes the destination explicitly.
 const forwarded=JSON.parse(run(['exec','-i',container,'python3','-c','import http.client,json,sys; c=http.client.HTTPConnection("127.0.0.1",52773,timeout=5); c.request("GET","/api/irisops-managed-guard/v1/session",headers=json.load(sys.stdin)); r=c.getresponse(); body=r.read(4096).decode(); print(json.dumps({"status":r.status,"tlsRejected":"https_required" in body})); c.close()'],JSON.stringify({Authorization:basic,Host:'127.0.0.1:52804','X-Forwarded-Proto':'https',Forwarded:'proto=https'})));assert.deepEqual(forwarded,{status:403,tlsRejected:true});
 let c=await request('/wallet/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,403);
 pass('native Secure/HttpOnly/Strict scoped cookies, false forwarded TLS, wrong Host/Origin and readonly writes tested');
 const before=controls;transition('ACTIVE');assert.equal((await request('/capabilities','GET',undefined,before)).status,401);controls=await login();const receipts=[];
 for(const kind of ['wallet','webapp']){c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);
  const body=kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'};
  const p=await request('/'+kind+'/previews','POST',body);assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});
 }
 assert.deepEqual(native(),{use:proposed.UseResource.toUpperCase(),enabled:1});restore();pass('both real TLS mutations verified by guard and independent native readback; original fixture values restored');
 if(process.env.IRISOPS_TLS_UI==='1'){
  const {runCleanUi}=await import('./verify-clean-ui.mjs');await runCleanUi({origin,user,password,transition,pass,suffix:'tls-durable-'+trial,keys,tlsSpki:spki,renewal:process.env.IRISOPS_RENEWAL==='1',renewWithTrustedTls:(body,headers)=>raw(app+'/v1/renew','POST',body,headers)});
  transition('ACTIVE');
 }
 if(process.env.IRISOPS_RENEWAL==='1'){
  const {runRenewal}=await import('./verify-renewal.mjs');
  const rights=`%Admin_Wallet:U,%Admin_Secure:U,%DB_IRISSYS:R,%DB_IRISOPS:R,${resources[0]}:RW,${resources[1]}:RW,${resources[2]}:U`;
  const setRole=walletPermission=>change([`set p("Resources")="${walletPermission?rights:rights.replace('%Admin_Wallet:U,','')}"`,`set sc=##class(Security.Roles).Modify("${role}",.p)`,check]);
  await runRenewal({request,login,metadata,native,initial,proposed,wallet,web,pass,waitUntil,setRole,user});
 }
 // Separate sessions allow testing real clocks without editing server timestamps.
 controls=await login();const active=controls,idle=await login(),clock=Date.now();c=await request('/wallet/channels','POST',{},active);const channel=c.body.channel;assert.equal((await request('/wallet/channels/'+channel+'/write-access','POST',{confirmation:'ENABLE WRITES'},active)).status,200);
 console.log('OBSERVED native-bounded session '+lifetimes.get(active)+' seconds');
 await waitUntil(clock+30000,'native-bounded authorization');assert.equal((await request('/wallet/state?name='+wallet,'GET',undefined,active)).status,200);assert.equal((await request('/deployment','GET',undefined,idle)).status,200);
 await waitUntil(clock+(Math.max(lifetimes.get(active),lifetimes.get(idle))+3)*1000,'real native expiry');
 for(const h of [active,idle]){const expired=await request('/capabilities','GET',undefined,h);assert.equal(expired.status,401);assert.equal(expired.body.error,'upstream_reconnect_required');}
 const expired=await request('/wallet/previews','POST',{channel,action:'wallet.policy.update',name:wallet,...proposed},active);assert.equal(expired.status,401);assert.equal(expired.body.error,'upstream_reconnect_required');assert.deepEqual(native(),{use:initial.UseResource.toUpperCase(),enabled:0});pass('real native expiry overrides longer guard policy and write grants; reads work before expiry, polling/activity cannot prolong authority');
 controls=await login();assert.equal((await request('/connect','POST',{user,password:'synthetic-wrong-test-password'})).status,401);assert.equal((await request('/capabilities')).status,401);controls=await login();const logged=controls;assert.equal((await request('/logout','POST',{})).status,200);assert.notEqual((await request('/capabilities','GET',undefined,logged)).status,200);pass('wrong-password reauthentication clears custody; logout rejects prior cookie');
 transition('READ_ONLY');controls=await login();const prior=controls;run(['restart','--time','20',container]);await ready();assert.notEqual((await request('/capabilities','GET',undefined,prior)).status,200);controls=await login();
 for(const r of receipts){const recovered=await request('/'+r.kind+'/operations/'+r.id+'/inspect','POST',{recoveryKey:r.recoveryKey});assert.equal(recovered.status,200);assert.equal(recovered.body.receipt.state,'VERIFIED');}assert.deepEqual(native(),{use:initial.UseResource.toUpperCase(),enabled:0});pass('real restart invalidates authorization but both proof-bound receipts remain recoverable without replay');
 await runDurableLifecycle({prefix,image,dataVolume,restoredVolume,archiveVolume,certVolume,engines,manifest,run,term,change,call,transition,pass,request,login,native,restore,receipts,initial,proposed,wallet,web,origin,app,metadata,check,ready,
  getTarget:()=>container,setTarget:(name,id)=>{container=name;containerId=id;},getControls:()=>controls,setControls:h=>{controls=h;},getLeaf:()=>leaf,
  raw,spki,user,password,keys,trial});
 restore();change([`set sc=##class(Security.Applications).Delete("${web}")`,check,`set sc=##class(%Wallet.Collection).Delete("${wallet}")`,check,`set sc=##class(Security.Users).Delete("${user}")`,check,`set sc=##class(Security.Roles).Delete("${role}")`,check,...resources.flatMap(r=>[`set sc=##class(Security.Resources).Delete("${r}")`,check])]);absent();fixturesRemoved=true;transition('SUSPENDED');complete=true;
}finally{
 if(containerId){try{
  for(const path of ['/usr/irissys/httpd/logs/error.log']){try{safe(run(['exec',container,'cat',path]));}catch(e){if(e.message!=='Isolated command failed; raw output suppressed')throw e;}}
  safe(run(['logs','--since',started,container]));
 }finally{run(['stop','--time','20',container]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',container]).trim(),'false|0');}}
 assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',previous]).trim(),previousId+'|true');assert.deepEqual(oldSnapshot(),old);assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}',reference]).trim(),referenceId+'|false');
 for(const e of engines)assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',e.name]).trim(),'false|0');
 await writeFile(new URL('tls-durable-evidence-'+trial+'.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),complete,container,containerId,image,engines,dataVolume,restoredVolume,archiveVolume,certificateVolume:certVolume,hostExport:false,encryptedArchive:false,certificateRestoredFromBackup:false,sameImageOnly:true,packageSha256:manifest.contentSha256,fixturesRemoved,previousLabPreserved:true,productionReady:false,osTrustChanged:false,browserCertificateHandling:process.env.IRISOPS_TLS_UI==='1'?'exact-leaf-SPKI-test-profile':'not-tested',checks},null,2)+'\n',{flag:'wx'});
}
