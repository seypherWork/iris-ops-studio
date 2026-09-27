import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {sha256} from './build.mjs';
// Extends the proven TLS runner, using only its NEW owned instance and volumes.
export async function runDurableLifecycle(t){
 const {prefix,image,dataVolume,restoredVolume,archiveVolume,certVolume,engines,run,term,change,call,transition,pass,request,login,native,restore,receipts,initial,proposed,wallet,web,origin,metadata,check}=t;
 const helpers=[],names=[prefix+'-replacement',prefix+'-restored'];let complete=false,phase='replacement',sourceHash,archiveHash,archiveBytes,restoredHash;
 const plan=()=>call('##class(IrisOps.Guard.Bootstrap).Plan("'+origin+'")');
 const state=()=>call('##class(IrisOps.Guard.Deployment).Plan()','IRISOPS');
 const cold=v=>assert.equal(run(['ps','-q','--filter','volume='+v]).trim(),'','Refuse any running volume consumer');
 const ro=(v,d)=>`type=volume,source=${v},target=${d},readonly`,rw=v=>`type=volume,source=${v},target=/durable`;
 function helper(label,mounts,script){const name=prefix+'-'+label;assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(name));helpers.push(name);const out=run(['run','-i','--name',name,'--network','none','--read-only','--user','51773:51773','--cap-drop','ALL','--security-opt','no-new-privileges',...mounts.flatMap(m=>['--mount',m]),'--entrypoint','bash',image,'-s'],'set -euo pipefail\numask 077\n'+script+'\n');assert.equal(run(['inspect','--format','{{.State.ExitCode}}',name]).trim(),'0');return out;}
 const fingerprint=String.raw`
export LC_ALL=C TZ=UTC
fingerprint() (
 cd "$1"
 find . -print0 | sort -z | while IFS= read -r -d '' path; do
  printf '%s\0' "$path"
  stat --printf='%F\0%u\0%g\0%a\0%y\0' -- "$path"
  if [ -L "$path" ]; then readlink -z -- "$path"
  elif [ -f "$path" ]; then sha256sum --zero -- "$path"
  elif [ ! -d "$path" ]; then echo 'Unsupported archive object' >&2; exit 1
  fi
 done | sha256sum
)
`;
 function volumeHash(v,label){cold(v);const hash=helper(label,[ro(v,'/source')],fingerprint+'\nfingerprint /source').split(' ')[0];assert.match(hash,/^[a-f0-9]{64}$/);return hash;}
 function stop(name){run(['stop','--timeout','30',name]);assert.equal(run(['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',name]).trim(),'false|0');}
 function history(){return term(['set q=##class(%SQL.Statement).%ExecDirect(,"SELECT OperationId FROM IrisOps_Guard.Receipt ORDER BY OperationId")','while q.%Next() { set r=##class(IrisOps.Guard.Receipt).%OpenId(q.%Get("OperationId")),p=r.Public() write "ROW=",r.OperationId,"|",$system.Encryption.ToHex($system.Encryption.SHAHash(256,p.%ToJSON()_r.RecoveryHash_r.Binding)),! }'],'IRISOPS').split(/\r?\n/).filter(s=>s.startsWith('ROW='));}
 function nativeHash(){const out=term(['kill p',`set sc=##class(Security.Applications).Get("${web}",.p)`,check,'set text="",key=""','for { set key=$order(p(key)) quit:key=""  set text=text_$length(key)_":"_key_":"_$length(p(key))_":"_p(key)_"|" }',`set found=##class(%Wallet.Collection).Exists("${wallet}",.w,.sc)`,'if \'found write "STEP_FAILED",! halt','set text=text_w.EditResource_"|"_w.UseResource','write "DIGEST=",$system.Encryption.ToHex($system.Encryption.SHAHash(256,text)),!']);const m=out.match(/^DIGEST=([A-Fa-f0-9]{64})/m);assert.ok(m);return m[1];}
 function integrity(){const out=term(['set dirs=$listbuild("/durable/irisops-code/","/durable/irisops-guard-state/")','set sc=$$CheckList^Integrity(,dirs,0,,1)','write "INTEGRITY_OK=",$system.Status.IsOK(sc),!']);assert.ok(out.includes('INTEGRITY_OK=1'));}
 async function launch(name,volume){cold(volume);for(const e of engines)assert.equal(run(['inspect','--format','{{.State.Running}}',e.name]).trim(),'false');const id=run(['run','-d','--name',name,'--label','irisops.tls-durable-lab=20260926','--mount',rw(volume),'--mount',ro(certVolume,'/run/irisops-tls'),'-e','ISC_DATA_DIRECTORY=/durable/iris','-p','127.0.0.1:52804:52774',image]).trim();assert.match(id,/^[a-f0-9]{64}$/);engines.push({name,id,volume});t.setTarget(name,id);await t.ready();
  const mounts=JSON.parse(run(['inspect','--format','{{json .Mounts}}',name]));assert.equal(mounts.length,2);assert.ok(mounts.some(m=>m.Name===volume&&m.Destination==='/durable'&&m.RW));assert.ok(mounts.some(m=>m.Name===certVolume&&m.Destination==='/run/irisops-tls'&&!m.RW));assert.ok(term(['write "DURABLE=",$system.Container.IsDeployed(),!']).includes('DURABLE=1'));
  assert.deepEqual(JSON.parse(run(['inspect','--format','{{json .HostConfig.PortBindings}}',name])),{'52774/tcp':[{HostIp:'127.0.0.1',HostPort:'52804'}]});
  assert.equal(sha256(run(['exec',name,'cat','/run/irisops-tls/server.crt'])),sha256(t.getLeaf()));assert.equal(run(['exec',name,'stat','-c','%a|%u|%g','/run/irisops-tls/server.key']).trim(),'600|51773|51773');
  for(const e of t.manifest.entries.filter(e=>e.path!=='Dockerfile'))assert.equal(run(['exec',name,'sha256sum','/opt/irisops-guard/'+e.path]).split(' ')[0],e.sha256);
  assert.equal(plan().action,'NO_CHANGE');assert.equal((await t.raw('/csp/ops/guard-managed/web/index.html')).status,200);
 }
 async function renew(){const h=t.getControls(),info=metadata.get(h);const r=await request('/renew','POST',{confirmation:'RENEW READ ONLY',renewalId:info.renewalId});assert.equal(r.status,200);assert.equal(r.body.mode,'read-only');assert.notEqual(r.body.renewalId,info.renewalId);metadata.set(h,r.body);}
 async function fence(){transition('ACTIVE');t.setControls(await login());await renew();const c=await request('/wallet/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/wallet/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const p=await request('/wallet/previews','POST',{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed});assert.equal(p.status,200);const h=t.getControls();return {headers:h,renewalId:metadata.get(h).renewalId,channel:c.body.channel,preview:p.body};}
 async function rejectPrevious(f){assert.ok(term(['write "EMPTY=",($data(^IrisOpsGuardBoot("epoch"))=0),!'],'IRISOPS').includes('EMPTY=1'));assert.notEqual((await request('/renew','POST',{confirmation:'RENEW READ ONLY',renewalId:f.renewalId},f.headers)).status,200);assert.notEqual((await request('/capabilities','GET',undefined,f.headers)).status,200);t.setControls(await login());assert.equal((await request('/wallet/channels/'+f.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,404);const r=await request('/wallet/previews/'+f.preview.id+'/execute','POST',{confirmation:f.preview.confirmation,recoveryKey:f.preview.recoveryKey});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_preview');await renew();}
 async function recoverAll(){for(const p of receipts){assert.equal((await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:'0'.repeat(64)})).status,404);const r=await request('/'+p.kind+'/operations/'+p.id+'/inspect','POST',{recoveryKey:p.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.receipt.state,'VERIFIED');assert.equal(r.body.receipt.dispatchCount,1);assert.equal(r.body.administrativeWrites,0);assert.equal(r.body.currentObservation.outcome,'MATCHES_BEFORE');}}
 const expected=native(),expectedHash=nativeHash();assert.deepEqual(expected,{use:initial.UseResource.toUpperCase(),enabled:0});
 try{
  const f=await fence(),before=history(),beforeState=state();assert.equal(before.length,2);stop(t.getTarget());await launch(names[0],dataVolume);assert.notEqual(engines[0].id,engines[1].id);assert.deepEqual(state(),beforeState);assert.deepEqual(history(),before);await rejectPrevious(f);await recoverAll();assert.deepEqual(history(),before);assert.deepEqual(native(),expected);assert.equal(nativeHash(),expectedHash);integrity();
  pass('same-volume replacement over HTTPS preserves installation and receipts; old session, renewal id, grant and pending preview rejected without replay');
  phase='cold archive and independent restore';const f2=await fence(),checkpoint=history(),checkpointState=state();stop(t.getTarget());sourceHash=volumeHash(dataVolume,'source-before');cold(archiveVolume);
  const out=helper('backup',[ro(dataVolume,'/source'),rw(archiveVolume)],`test ! -e /durable/checkpoint.tar
tar --sort=name --numeric-owner --sparse --format=posix --pax-option=delete=atime,delete=ctime -cf /durable/checkpoint.tar -C /source .
chmod 600 /durable/checkpoint.tar
tar --compare --numeric-owner -f /durable/checkpoint.tar -C /source
sha256sum /durable/checkpoint.tar
stat -c '%s' /durable/checkpoint.tar`);archiveHash=out.split(' ')[0];assert.match(archiveHash,/^[a-f0-9]{64}$/);archiveBytes=Number(out.trim().split(/\r?\n/).at(-1));assert.ok(archiveBytes>0);
  cold(restoredVolume);cold(archiveVolume);restoredHash=helper('restore',[ro(archiveVolume,'/archives'),rw(restoredVolume)],fingerprint+`\ntest -z "$(find /durable -mindepth 1 -print -quit)"\ntest "$(sha256sum /archives/checkpoint.tar | cut -d ' ' -f 1)" = '${archiveHash}'\ntar --extract --numeric-owner --same-owner --same-permissions --delay-directory-restore -f /archives/checkpoint.tar -C /durable\ntar --compare --numeric-owner -f /archives/checkpoint.tar -C /durable\nfingerprint /durable`).split(' ')[0];assert.equal(restoredHash,sourceHash);assert.equal(volumeHash(dataVolume,'source-after-copy'),sourceHash);
  pass('cold archive restores into an empty independent volume with matching logical file bytes, paths and preserved metadata');
  await launch(names[1],restoredVolume);assert.deepEqual(state(),checkpointState);assert.deepEqual(history(),checkpoint);await rejectPrevious(f2);await recoverAll();assert.deepEqual(history(),checkpoint);assert.deepEqual(native(),expected);assert.equal(nativeHash(),expectedHash);integrity();
  pass('independent restoration preserves HTTPS identity and original receipts; old authority rejected, fresh login and renewal succeed');
  phase='restored browser and fresh writes';if(process.env.IRISOPS_TLS_UI==='1'){const {runCleanUi}=await import('./verify-clean-ui.mjs');await runCleanUi({origin,user:t.user,password:t.password,transition,pass,suffix:'tls-durable-restored-'+t.trial,keys:t.keys,tlsSpki:t.spki,renewal:true,renewWithTrustedTls:(body,headers)=>t.raw(t.app+'/v1/renew','POST',body,headers)});}
  transition('ACTIVE');t.setControls(await login());await renew();for(const kind of ['wallet','webapp']){const c=await request('/'+kind+'/channels','POST',{});assert.equal(c.status,200);assert.equal((await request('/'+kind+'/channels/'+c.body.channel+'/write-access','POST',{confirmation:'ENABLE WRITES'})).status,200);const p=await request('/'+kind+'/previews','POST',kind==='wallet'?{channel:c.body.channel,action:'wallet.policy.update',name:wallet,...proposed}:{channel:c.body.channel,action:'webapp.availability.update',name:web,Enabled:'true'});assert.equal(p.status,200);const r=await request('/'+kind+'/previews/'+p.body.id+'/execute','POST',{confirmation:p.body.confirmation,recoveryKey:p.body.recoveryKey});assert.equal(r.status,200);assert.equal(r.body.state,'VERIFIED');receipts.push({kind,...p.body});}
  assert.deepEqual(native(),{...expected,use:proposed.UseResource.toUpperCase(),enabled:1});restore();assert.equal(nativeHash(),expectedHash);const finalRows=history();assert.equal(finalRows.length,4);assert.ok(checkpoint.every(row=>finalRows.includes(row)));await recoverAll();assert.deepEqual(history(),finalRows);integrity();
  pass('restored instance performs two new verified changes; all four original results recover without replay and native integrity passes');
  phase='preservation';assert.equal(volumeHash(dataVolume,'source-final'),sourceHash);const hash=helper('archive-final',[ro(archiveVolume,'/archives')],'sha256sum /archives/checkpoint.tar').split(' ')[0];assert.equal(hash,archiveHash);pass('stopped source checkpoint remains unchanged; database archive retained only in Docker, no certificate private key exported');complete=true;
 }finally{
  await writeFile(new URL('tls-durable-lifecycle-'+t.trial+'.json',import.meta.url),JSON.stringify({complete,phase,image,engines,helpers,dataVolume,restoredVolume,archiveVolume,certVolume,sourceHash,restoredHash,sourceHashKind:'logical-files-metadata-v1',archiveHash,archiveBytes,certificateRestoredFromBackup:false,hostExport:false,encryptedArchive:false,productionReady:false},null,2)+'\n',{flag:'wx'});
 }
}
