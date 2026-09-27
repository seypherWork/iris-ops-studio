import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const id='3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236';
const name='irisops-pilot-policy-20260926-e';
const run=(args,input)=>execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});
assert.equal(run(['inspect','--format','{{.Id}}|{{.State.Running}}|{{.Name}}',name]).trim(),`${id}|true|/${name}`);
const term=lines=>{
 const out=run(['exec','-i',id,'iris','session','IRIS','-U','IRISOPS'],[...lines,'halt',''].join('\n'));
 assert.ok(!/ERROR #|STEP_FAILED|<PROTECT>/.test(out),'Native class check failed');return out;
};
const value=(out,label)=>{const m=out.match(new RegExp('^'+label+'=(.*)$','m'));assert.ok(m);return m[1].trim();};
const fingerprint=()=>value(term(['write "FINGERPRINT=",##class(IrisOps.Guard.Deployment).Plan().fingerprint,!']),'FINGERPRINT');
const mode=()=>value(term(['write "MODE=",##class(IrisOps.Guard.Deployment).State().mode,!']),'MODE');
assert.equal(mode(),'SUSPENDED');
const suffix=process.env.IRISOPS_FENCE_RUN_ID;assert.match(suffix??'',/^[a-z0-9-]{1,30}$/);
const folder=resolve('../irisops-revision-fence-20260927-'+suffix);await mkdir(folder);
const file=resolve('experimental/guard/IrisOps.Guard.RoleTransport.cls');
const source=await readFile(file,'utf8');
const fixture=source.replace(/(Class IrisOps\.Guard\.RoleTransport[^\r\n]*\r?\n\{)/,'$1\nParameter RevisionFenceProbe = "'+suffix+'";');
assert.notEqual(fixture,source);
const fixtureFile=resolve(folder,'RoleTransport-revision-probe.cls');
await writeFile(fixtureFile,fixture,{flag:'wx'});
const dest='/tmp/irisops-revision-fence-'+suffix+'.cls';
const load=local=>{
 run(['cp',local,id+':'+dest]);
 const out=term([`set sc=$system.OBJ.Load("${dest}","ck")`,'if $system.Status.IsError(sc) write "STEP_FAILED",! halt']);
 assert.ok(out.includes('Load finished successfully.'));
};
const original=fingerprint();let restored=false;
try{
 load(fixtureFile);const changed=fingerprint();
 assert.notEqual(changed,original,'A real change to the optional class must invalidate earlier plans');
 assert.equal(mode(),'SUSPENDED');
}finally{
 load(file);
 const absent=value(term(['set c=##class(%Dictionary.ClassDefinition).%OpenId("IrisOps.Guard.RoleTransport")','write "PROBE_ABSENT=",\'c.Parameters.FindObjectId("RevisionFenceProbe"),!']),'PROBE_ABSENT');
 assert.equal(absent,'1');assert.equal(mode(),'SUSPENDED');restored=true;
}
const result={complete:true,optionalRoleSourceChangeDetected:true,sourceRestored:restored,mode:'SUSPENDED',nativeIdentitiesModified:false};
await writeFile(resolve(folder,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
