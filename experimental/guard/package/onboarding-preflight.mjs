// Read-only inspection. Exports PUBLIC certificates only; never installs trust,
// starts/stops IRIS, creates users, accepts passwords or changes native settings.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';
import {request} from 'node:https';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyBundle,portable,saveNew} from './portable.mjs';
import {sha256} from './build.mjs';

export function publicCertificate(pem){
 assert.ok(typeof pem==='string'&&pem.length<16384,'Invalid certificate size');
 assert.match(pem.trim(),/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----$/,'Expected exactly one public certificate');
 return new X509Certificate(pem);
}
export function localOrigin(port){assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535);return 'https://127.0.0.1:'+port;}
export function onboardingProfile(profile){assert.ok(['enrolled-targets-v1','enrolled-role-v1','enrolled-user-v1'].includes(profile),'Unsupported onboarding runtime');}
export function validWindow(from,to,now=Date.now()){
 const a=Date.parse(from),b=Date.parse(to);assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Number.isSafeInteger(now));
 assert.ok(a<=now&&b>now+600000,'Certificate not currently valid for at least ten more minutes');assert.ok(b>a&&b-a<=72*3600000,'Not the bounded disposable certificate profile');
}
export function inspectCertificates(caPem,leafPem,now=Date.now()){
 const ca=publicCertificate(caPem),leaf=publicCertificate(leafPem);
 assert.ok(ca.ca&&ca.subject===ca.issuer&&ca.verify(ca.publicKey),'Root must be a self-signed CA');
 assert.ok(!leaf.ca&&leaf.checkIssued(ca)&&leaf.verify(ca.publicKey),'Leaf must be signed by the expected CA');
 for(const cert of [ca,leaf]){validWindow(cert.validFrom,cert.validTo,now);assert.equal(cert.publicKey.asymmetricKeyType,'rsa');assert.ok(cert.publicKey.asymmetricKeyDetails.modulusLength>=2048);}
 assert.equal(leaf.checkIP('127.0.0.1'),'127.0.0.1');assert.equal(leaf.subjectAltName,'IP Address:127.0.0.1');assert.ok(leaf.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
 return {ca:{sha256:sha256(ca.raw),sha1:ca.fingerprint.replaceAll(':',''),subject:ca.subject,expires:ca.validTo},leaf:{sha256:sha256(leaf.raw),subject:leaf.subject,expires:leaf.validTo,san:leaf.subjectAltName},trustScope:'A CA trust grant is not limited to this port. Prefer a separate browser profile.',privateKeyExported:false};
}
export function strictGet({port,ca,leafHash,path}){
 localOrigin(port);assert.ok(['/csp/ops/guard-managed/web/index.html','/api/admin/login','/csp/sys/UtilHome.csp'].includes(path));assert.match(leafHash,/^[a-f0-9]{64}$/);
 return new Promise((resolve,reject)=>{
  const q=request({hostname:'127.0.0.1',servername:'',port,path,ca,rejectUnauthorized:true,agent:false,timeout:10000},r=>{
   try{assert.equal(sha256(r.socket.getPeerCertificate().raw),leafHash);}catch{r.destroy();reject(Error('Served leaf differs from inspected certificate'));return;}
   const chunks=[];let size=0;r.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)r.destroy(Error('Response too large'));else chunks.push(chunk);});r.on('error',()=>reject(Error('TLS response failed')));r.on('end',()=>resolve({status:r.statusCode,hash:sha256(Buffer.concat(chunks)),cacheControl:r.headers['cache-control']}));
  });q.on('error',()=>reject(Error('Strict TLS request failed')));q.on('timeout',()=>q.destroy(Error('TLS timeout')));q.end();
 });
}
export async function preflight({root,prepared,installed,output,run:provided,docker=process.env.IRISOPS_DOCKER_EXECUTABLE}){
 root=await realpath(root);const bundle=await verifyBundle(root);onboardingProfile(bundle.runtimeProfile);
 const run=provided||((args,input)=>{assert.ok(docker);try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000,maxBuffer:1024*1024});}catch{throw Error('Read-only Docker inspection failed; raw output suppressed');}});
 const op=await portable({root,run}).installedOperator(prepared),owned=await op.rollbackPlan(installed);
 assert.ok(['SUSPENDED','READ_ONLY'].includes(owned.state.mode),'Refuse onboarding inspection while writes are active');
 const id=installed.containerId,port=installed.plan.config.port,origin=localOrigin(port);
 // Fixed .crt paths only. Neither key file, process environment nor account data is read.
 const ca=run(['exec',id,'cat','/run/irisops-tls/ca.crt']),leaf=run(['exec',id,'cat','/run/irisops-tls/server.crt']);
 const certificates=inspectCertificates(ca,leaf);
 // Actual DER certificates exercise the negative validators without clock changes.
 assert.throws(()=>inspectCertificates(ca,leaf,Date.parse(certificates.leaf.expires)+1));assert.throws(()=>inspectCertificates(leaf,ca));assert.throws(()=>publicCertificate(ca+leaf));
 const page=await strictGet({port,ca,leafHash:certificates.leaf.sha256,path:'/csp/ops/guard-managed/web/index.html'});assert.equal(page.status,200);assert.equal(page.cacheControl,'no-store');assert.equal(page.hash,bundle.runtime.entries.find(e=>e.path==='ui/guard-managed/web/index.html').sha256);
 for(const path of ['/api/admin/login','/csp/sys/UtilHome.csp'])assert.equal((await strictGet({port,ca,leafHash:certificates.leaf.sha256,path})).status,403);
 assert.deepEqual((await op.rollbackPlan(installed)).state,owned.state,'Deployment changed during inspection');
 output=resolve(output);await mkdir(output);await writeFile(join(output,'ca-public.crt'),ca,{flag:'wx'});await writeFile(join(output,'server-public.crt'),leaf,{flag:'wx'});
 const readback=inspectCertificates(await readFile(join(output,'ca-public.crt'),'utf8'),await readFile(join(output,'server-public.crt'),'utf8'));assert.deepEqual(readback,certificates);
 const report={schema:1,complete:true,checkedAt:new Date().toISOString(),containerId:id,origin,url:origin+'/csp/ops/guard-managed/web/index.html',deployment:owned.state,bundleHash:bundle.manifest.contentSha256,certificates,strictTlsVerified:true,servedUiHash:page.hash,nativeRoutesBlocked:true,negativeCertificateChecks:3,trustInstalled:false,accountsChanged:false,credentialsRead:false,productionReady:false};
 await saveNew(join(output,'preflight.json'),report);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,6);const [root,p,i,output]=process.argv.slice(2);const result=await preflight({root,prepared:JSON.parse(await readFile(p,'utf8')),installed:JSON.parse(await readFile(i,'utf8')),output});console.log(JSON.stringify({complete:result.complete,origin:result.origin,mode:result.deployment.mode,certificates:result.certificates,trustInstalled:false}));}
 catch{console.error('Onboarding preflight failed; trust and accounts were not changed. Inspect retained output before retrying.');process.exitCode=1;}
}
