// Isolated late-installation collision. Never changes an existing laboratory.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const docker=process.env.IRISOPS_DOCKER_EXECUTABLE;assert.ok(docker);
const name='iris-ops-guard-clean-failure-single-20260926',image='iris-ops-guard:clean-install-lab-20260926-e';
function run(args,input){try{return execFileSync(docker,args,{input,encoding:'utf8',stdio:'pipe',timeout:60000});}catch{throw Error('Isolated command failed; raw output suppressed');}}
function term(lines){const out=run(['exec','-i',name,'iris','session','IRIS','-U','%SYS'],[...lines,'halt',''].join('\n'));assert.ok(!out.includes('<')&&!out.includes('FAILED'),'Isolated terminal failed; raw output suppressed');return out;}
const check='if $system.Status.IsError(sc) write "FAILED",! halt';
assert.ok(!run(['ps','-a','--format','{{.Names}}']).split(/\r?\n/).includes(name));
let containerId='',complete=false,code='',namespaceRetained=false,routeDisabled=false,collisionPreserved=false;
try{
 containerId=run(['run','-d','--name',name,'--label','irisops.clean-lab=20260926',image]).trim();
 let ready=false;for(let i=0;i<50;i++){try{if(term(['write "READY",!']).includes('READY')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 term(['set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")',check]);
 run(['cp',fileURLToPath(new URL('IrisOps.Guard.TestBootstrap.cls',import.meta.url)),name+':/tmp/IrisOps.Guard.TestBootstrap.cls']);term(['set sc=$system.OBJ.Load("/tmp/IrisOps.Guard.TestBootstrap.cls","ck")',check]);
 const output=term(['try { set p=##class(IrisOps.Guard.Bootstrap).Plan("http://127.0.0.1:52802") set r=##class(IrisOps.Guard.TestBootstrap).Install(p.fingerprint,"http://127.0.0.1:52802") write "UNEXPECTED_SUCCESS",! } catch e { write "CODE=",e.Name,! }']);code=output.match(/CODE=([a-zA-Z0-9_]+)/)?.[1]||'missing';assert.equal(code,'bootstrap_native_step_failed');
 const proof=term(['write "NS=",##class(Config.Namespaces).Exists("IRISOPS"),!', 'set sc=##class(Security.Applications).Get("/api/irisops-managed-guard",.p)',check,'write "GUARD=",p("Enabled"),!', 'kill p set sc=##class(Security.Applications).Get("/csp/ops",.p)',check,'write "COLLISION=",p("Description"),"|",p("Enabled"),!', 'write "MARKER=",$get(^|"IRISOPS"|IrisOpsGuardDeploy("install","version")),!', 'try { set p=##class(IrisOps.Guard.Bootstrap).Plan("http://127.0.0.1:52802") write "ADOPTED",! } catch e { write "RETRY=",e.Name,! }']);
 namespaceRetained=proof.includes('NS=1');routeDisabled=proof.includes('GUARD=0');collisionPreserved=proof.includes('COLLISION=Owned late installation collision|0');assert.ok(namespaceRetained&&routeDisabled&&collisionPreserved);assert.ok(proof.includes('MARKER=\n')||proof.includes('MARKER=\r\n'));assert.ok(proof.includes('RETRY=namespace_collision_or_partial_install'));complete=true;
 console.log('PASS late native installation collision preserves the conflicting app and partial databases, disables the guard and refuses blind adoption');
}finally{
 if(containerId){assert.equal(run(['inspect','--format','{{.Id}}',name]).trim(),containerId);run(['stop','--timeout','20',name]);}
 await writeFile(new URL('bootstrap-failure-single-evidence.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),container:name,containerId,complete,code,namespaceRetained,routeDisabled,collisionPreserved,injected:true,concurrent:false,containerRetained:true,productionReady:false},null,2)+'\n');
}
