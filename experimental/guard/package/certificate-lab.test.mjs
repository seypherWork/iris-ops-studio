import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCertificates} from './tls-certificate-lifecycle.mjs';

// Harness contract tests, not substitutes for native TLS validation.
const prefix='isolated-cert-contract',image='sha256:fixture',certVolume=prefix+'-original';
function mock(existing=[]){const calls=[],volumes=new Set(existing);return {calls,run(args,input){calls.push({args,input});if(args[0]==='volume'&&args[1]==='ls')return [...volumes].join('\n');if(args[0]==='volume'&&args[1]==='create'){volumes.add(args.at(-1));return args.at(-1);}if(args[0]==='inspect')return '0';return '';}};}
test('certificate generator keeps source read-only and uses UID-owned durable destination',()=>{
 const m=mock(),result=prepareCertificates({prefix,image,certVolume,run:m.run});assert.equal(Object.keys(result.certs).length,4);
 const generators=m.calls.filter(c=>c.args[0]==='run');assert.equal(generators.length,4);
 for(const {args,input} of generators){
  assert.equal(args[args.indexOf('--network')+1],'none');assert.equal(args[args.indexOf('--user')+1],'51773:51773');assert.ok(args.includes('--read-only'));assert.equal(args[args.indexOf('--cap-drop')+1],'ALL');
  const mounts=args.flatMap((arg,i)=>arg==='--mount'?[args[i+1]]:[]);assert.equal(mounts.length,2);assert.ok(mounts.includes(`type=volume,source=${certVolume},target=/source,readonly`));
  assert.ok(mounts.some(s=>s.startsWith('type=volume,source='+prefix+'-cert-')&&s.endsWith(',target=/durable')));
  assert.match(input,/umask 077/);assert.match(input,/-keyout \/durable\/server.key/);assert.doesNotMatch(input,/\/dest\//);assert.match(input,/chmod 600 \/durable\/server.key/);assert.doesNotMatch(input,/cat .*\.key/);
 }
 const scripts=generators.map(c=>c.input);assert.ok(scripts.some(s=>s.includes('DNS:wrong.invalid')));assert.ok(scripts.some(s=>s.includes('-startdate 20200101000000Z -enddate 20200102000000Z')));assert.ok(scripts.some(s=>s.includes('-signkey /durable/server.key')));
});
test('certificate generation refuses an existing volume before writing anything',()=>{
 const m=mock([prefix+'-cert-trusted']);assert.throws(()=>prepareCertificates({prefix,image,certVolume,run:m.run}));assert.equal(m.calls.filter(c=>c.args[0]==='run'||c.args[1]==='create').length,0);
});
test('generation failure stops the sequence without deleting resources or attempting later variants',()=>{
 const m=mock();assert.throws(()=>prepareCertificates({prefix,image,certVolume,run(args,input){if(args[0]==='run')throw Error('synthetic generator failure');return m.run(args,input);}}),/synthetic generator failure/);
 assert.equal(m.calls.filter(c=>c.args[0]==='volume'&&c.args[1]==='create').length,1);assert.ok(!m.calls.some(c=>c.args.includes('rm')||c.args.includes('prune')));
});
