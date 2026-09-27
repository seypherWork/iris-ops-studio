import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {X509Certificate,createHash} from 'node:crypto';
import {sha256} from './build.mjs';

export function prepareCertificates({prefix,image,certVolume,run}){
 const certs={},helpers=[];
 const ro=(v,p)=>`type=volume,source=${v},target=${p},readonly`;
 function makeCertificate(kind){
  const volume=prefix+'-cert-'+kind,helper=prefix+'-generate-'+kind;
  assert.ok(!run(['volume','ls','--format','{{.Name}}']).split(/\r?\n/).includes(volume));assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(helper));
  run(['volume','create','--label','irisops.certificate-lab=20260926',volume]);helpers.push(helper);
  const san=kind==='wrong-identity'?'DNS:wrong.invalid':'IP:127.0.0.1';
  let script=`set -euo pipefail\numask 077\ncp /source/ca.crt /durable/ca.crt\nopenssl req -newkey rsa:3072 -nodes -keyout /durable/server.key -out /tmp/server.csr -subj /CN=IrisOps-Lab-${kind} >/dev/null 2>&1\nprintf '%s\\n' 'subjectAltName=${san}' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature,keyEncipherment' 'extendedKeyUsage=serverAuth' > /tmp/ext\n`;
  if(kind==='expired'){
   script+=`touch /tmp/index\nprintf '01\\n' > /tmp/serial\nprintf '%s\\n' '[ca]' 'default_ca=local' '[local]' 'database=/tmp/index' 'serial=/tmp/serial' 'new_certs_dir=/tmp' 'certificate=/source/ca.crt' 'private_key=/source/ca.key' 'default_md=sha256' 'policy=local_policy' '[local_policy]' 'commonName=supplied' > /tmp/ca.conf\nopenssl ca -batch -notext -config /tmp/ca.conf -in /tmp/server.csr -out /durable/server.crt -startdate 20200101000000Z -enddate 20200102000000Z -extfile /tmp/ext >/dev/null 2>&1\n`;
  }else if(kind==='untrusted'){
   script+='openssl x509 -req -in /tmp/server.csr -signkey /durable/server.key -out /durable/server.crt -days 2 -extfile /tmp/ext >/dev/null 2>&1\n';
  }else{
   script+='openssl x509 -req -in /tmp/server.csr -CA /source/ca.crt -CAkey /source/ca.key -set_serial 0x$(openssl rand -hex 16) -out /durable/server.crt -days 2 -extfile /tmp/ext >/dev/null 2>&1\n';
  }
  script+='chmod 600 /durable/server.key\nopenssl x509 -in /durable/server.crt -noout -dates\n';
  if(kind==='trusted')script+='openssl verify -CAfile /source/ca.crt -verify_ip 127.0.0.1 /durable/server.crt >/dev/null\n';
  run(['run','-i','--name',helper,'--network','none','--read-only','--user','51773:51773','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,size=8m,uid=51773,gid=51773,mode=700','--mount',ro(certVolume,'/source'),'--mount',`type=volume,source=${volume},target=/durable`,'--entrypoint','bash',image,'-s'],script);
  assert.equal(run(['inspect','--format','{{.State.ExitCode}}',helper]).trim(),'0');certs[kind]={volume};
 }

 for(const kind of ['trusted','wrong-identity','expired','untrusted'])makeCertificate(kind);
 return {certs,helpers};
}

// Owned disposable lab only. No in-place key replacement, host trust or clock edits.
export async function runCertificateLifecycle(t){
 const {prefix,image,dataVolume,certVolume,engines,run,term,call,transition,pass,request,login,native,restore,receipts,initial,proposed,wallet,web,origin,metadata,check}=t;
 const {certs,helpers}=t.preparedCertificates;const failures=[];let complete=false,phase='trusted replacement';
 const originalLeaf=t.getLeaf(),originalFingerprint=new X509Certificate(originalLeaf).fingerprint256;
 const expected={use:initial.UseResource.toUpperCase(),enabled:0};
 const ro=(v,p)=>`type=volume,source=${v},target=${p},readonly`;
 const cold=v=>assert.equal(run(['ps','-q','--filter','volume='+v]).trim(),'','Refuse running volume consumer');
 const stop=()=>{const n=t.getTarget();run(['stop','--timeout','30',n]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',n]).trim(),'false|0');};
 function history(){return term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set r=##class(IrisOps.Guard.Receipt).%OpenId(q.%Get("OperationId")),p=r.Public() write "ROW=",r.OperationId,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,p.%ToJSON()_r.RecoveryHash_r.Binding)),! }'],'IRISOPS').split(/\r?\n/).filter(s=>s.startsWith('ROW='));}
 function nativeHash(){const out=term(['kill p',`set sc=##class(Security.Applications).Get("${web}",.p)`,check,'set text="",key=""','for { set key=$order(p(key)) quit:key=""  set text=text_$length(key)_":"_key_":"_$length(p(key))_":"_p(key)_"|" }',`set found=##class(%Wallet.Collection).Exists("${wallet}",.w,.sc)`,'if \'found write "STEP_FAILED",! halt','set text=text_w.EditResource_"|"_w.UseResource','write "DIGEST=",$system.Encryption.ToHex($system.Encryption.SHAHash(256,text)),!']);const m=out.match(/^DIGEST=([A-Fa-f0-9]{64})/m);assert.ok(m);return m[1];}
 function integrity(){assert.ok(term(['set dirs=$listbuild("/durable/irisops-code/","/durable/irisops-guard-state/")','set sc=$$CheckList^Integrity(,dirs,0,,1)','write "INTEGRITY_OK=",$system.Status.IsOK(sc),!']).includes('INTEGRITY_OK=1'));}
 async function renew(){const h=t.getControls(),info=metadata.get(h);const r=await request('/renew','POST',{confirmation:'RENEW READ ONLY',renewalId:info.renewalId});assert.equal(r.status,200);assert.equal(r.body.mode,'read-only');assert.notEqual(r.body.renewalId,info.renewalId);metadata.set(h,r.body);}
 async function fence(){transition('ACTIVE');t.setControls(await login());await renew();const c=await request('/wallet/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const p=await request('/wallet/previews','POST',{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed});assert.equal(p.status,200);const h=t.getControls();return {headers:h,renewalId:metadata.get(h).renewalId,channel:c.body.channel,preview:p.body};}
 async function rejectPrevious(f){assert.ok(term(['write "EMPTY=",($data(^IrisOpsGuardBoot("epoch"))=0),!'],'IRISOPS').includes('EMPTY=1'));assert.notEqual((await request('/renew','POST',{confirmation:'RENEW READ ONLY',renewalId:f.renewalId},f.headers)).status,200);assert.notEqual((await request('/capabilities','GET',undefined,f.headers)).status,200);t.setControls(await login());assert.equal((await request('/wallet/channels/'+f.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,404);const r=await request('/wallet/previews/'+f.preview.id+'/execute','POST',{confirmation:f.preview.confirmation,recoveryKey:f.preview.recoveryKey});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_preview');await renew();}
 async function recover(){for(const p of receipts){assert.equal((await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:'0'.repeat(64)})).status,404);const r=await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.receipt.dispatchCount,1);assert.equal(r.body.administrativeWrites,0);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');}}
 async function launch(label,certificateVolume){cold(dataVolume);for(const e of engines)assert.equal(run(['inspect','--format','{{.State.Running}}',e.name]).trim(),'false');const name=prefix+'-'+label;assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(name));const id=run(['run','-d','--name',name,'--label','irisops.certificate-lab=20260926','--mount',`type=volume,source=${dataVolume},target=/durable`,'--mount',ro(certificateVolume,'/run/irisops-tls'),'-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52804:52774',image]).trim();assert.match(id,/^[a-f0-9]{64}$/);engines.push({name,id,volume:dataVolume,certificateVolume});t.setTarget(name,id);await t.ready();
  const mounts=JSON.parse(run(['inspect','--format','{{json .Mounts}}',name]));assert.equal(mounts.length,2);assert.ok(mounts.some(m=>m.Name===dataVolume&&m.Destination==='/durable'&&m.RW));assert.ok(mounts.some(m=>m.Name===certificateVolume&&m.Destination==='/run/irisops-tls'&&!m.RW));assert.ok(term(['write "DURABLE=",$system.Container.IsDeployed(),!']).includes('DURABLE=1'));
  assert.deepEqual(JSON.parse(run(['inspect','--format','{{json .HostConfig.PortBindings}}',name])),{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:'52804'}]});assert.equal(run(['exec',name,'stat','-c','%a|%u|%g','/run/irisops-tls/server.key']).trim(),'600|51773|51773');
  for(const e of t.manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',name,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
  assert.equal(call(`##class(IrisOps.Guard.Bootstrap).Plan("${origin}")`).action,'NO_CHANGE');
  run(['exec',name,'/usr/irissys/httpd/bin/httpd','-t','-f','/usr/irissys/httpd/conf/httpd.conf','-c','Listen 52773']);
  const leaf=run(['exec',name,'cat','/run/irisops-tls/server.crt']),x=new X509Certificate(leaf);return {leaf,fingerprint:x.fingerprint256,validFrom:x.validFrom,validTo:x.validTo,spki:createHash('sha256').update(x.publicKey.export({type:'spki',format:'der'})).digest('base64')};
 }
 async function ui(label,certificate){if(process.env.IRISOPS_TLS_UI!=='1')throw Error('Browser verification is required');const {runCleanUi}=await import('./verify-certificate-ui.mjs');await runCleanUi({origin,user:t.user,password:t.password,transition,pass,suffix:(t.uiPrefix||'tls-cert')+'-'+label+'-'+t.trial,keys:t.keys,tlsSpki:certificate.spki,renewal:true,renewWithTrustedTls:(body,headers)=>t.raw(t.app+'/v1/renew','POST',body,headers)});}
 const before=history(),expectedHash=nativeHash();assert.equal(before.length,2);assert.deepEqual(native(),expected);
 try{
  pass('four separate certificate fixtures generated inside private Docker volumes; original key never overwritten or exported');
  phase='trusted replacement';const old=await fence(),deployment=call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');stop();const replacement=await launch('trusted',certs.trusted.volume);Object.assign(certs.trusted,replacement,{leaf:undefined,spki:undefined});assert.notEqual(replacement.fingerprint,originalFingerprint);assert.notEqual(replacement.spki,t.spki);
  assert.equal((await t.raw('/csp/ops/guard-managed/web/index.html')).status,200);assert.deepEqual(call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS'),deployment);await rejectPrevious(old);await recover();assert.deepEqual(history(),before);assert.equal(nativeHash(),expectedHash);integrity();
  pass('different trusted leaf and key accepted by CA/IP-validating client; fresh login required and old authority rejected; receipts preserved');
  await ui('trusted',replacement);const f=await fence();stop();
  phase='invalid certificates';
  const expectedErrors={'wrong-identity':['ERR_TLS_CERT_ALTNAME_INVALID'],expired:['CERT_HAS_EXPIRED'],untrusted:['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE']};
  for(const kind of Object.keys(expectedErrors)){
   const certificate=await launch(kind,certs[kind].volume);Object.assign(certs[kind],certificate,{leaf:undefined,spki:undefined});if(kind==='expired')assert.ok(Date.parse(certificate.validTo)<Date.now());
   let code='';try{await t.raw('/csp/ops/guard-managed/web/index.html');}catch(e){code=e.message;}
   assert.ok(expectedErrors[kind].includes(code),'Unexpected certificate failure category');failures.push({kind,code});
   assert.deepEqual(history(),before);assert.deepEqual(native(),expected);assert.equal(nativeHash(),expectedHash);
   // No authentication payload is sent to a known-invalid TLS endpoint.
   pass(kind+' certificate rejected by strict TLS before authenticated application use; targets and receipts unchanged');stop();
  }
  phase='rollback';const rollback=await launch('rollback',certVolume);assert.equal(rollback.fingerprint,originalFingerprint);assert.equal(rollback.leaf,originalLeaf);assert.equal((await t.raw('/csp/ops/guard-managed/web/index.html')).status,200);await rejectPrevious(f);await recover();assert.deepEqual(history(),before);assert.equal(nativeHash(),expectedHash);integrity();
  pass('rollback remounts original certificate unchanged; native login and read-only recovery work without repeating operations');
  await ui('rollback',rollback);
  phase='new operations after rollback';transition('ACTIVE');t.setControls(await login());await renew();
  for(const kind of ['wallet','webapp']){const c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const p=await request('/'+kind+'/previews','POST',kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'});assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});}
  assert.deepEqual(native(),{use:proposed.UseResource.toUpperCase(),enabled:1});restore();assert.equal(nativeHash(),expectedHash);const final=history();assert.equal(final.length,4);assert.ok(before.every(row=>final.includes(row)));await recover();assert.deepEqual(history(),final);integrity();pass('two new verified operations work after rollback; native targets restored and all four receipts recover without replay');complete=true;phase='complete';
 }finally{
  await writeFile(new URL((t.evidencePrefix||'tls-certificate-lifecycle')+'-'+t.trial+'.json',import.meta.url),JSON.stringify({complete,phase,image,engines,helpers,dataVolume,originalCertificateVolume:certVolume,originalFingerprint,certificates:certs,failures,hostTrustChanged:false,hostClockChanged:false,privateKeyExported:false,productionReady:false,rotationMethod:'clean-stop and new container with read-only certificate volume',invalidationMechanism:'IRIS restart boot epoch; not certificate rotation alone'},null,2)+'\n',{flag:'wx'});
 }
}
