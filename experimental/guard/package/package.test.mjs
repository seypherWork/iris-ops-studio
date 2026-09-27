import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runtimeNames,userRuntimeNames,manifestFor,sha256} from './build.mjs';
test('administrator plan revision fence covers every packaged runtime class',async()=>{
 const source=await readFile(new URL('../IrisOps.Guard.Deployment.cls',import.meta.url),'utf8');
 const method=source.split('ClassMethod SourceStamp()')[1].split('ClassMethod Plan()')[0];
 const names=[...method.matchAll(/for name=([^\r\n]+) \{/g)].flatMap(m=>[...m[1].matchAll(/"([A-Za-z]+)"/g)].map(n=>n[1]));
 for(const name of [...runtimeNames,...userRuntimeNames])assert.ok(names.includes(name),'Missing revision fence: '+name);
 assert.ok(method.includes(':absent|'),'Optional class additions must invalidate an old plan');
});
test('web fault helper preserves the exact target-aware native reader contract',async()=>{
 const runtime=await readFile(new URL('../IrisOps.Guard.WebExecution.cls',import.meta.url),'utf8');
 const helper=await readFile(new URL('../IrisOps.Guard.WebTestExecution.cls',import.meta.url),'utf8');
 const declaration=text=>text.match(/^ClassMethod ReadState\([^\r\n]+/m)?.[0];
 assert.ok(declaration(runtime));assert.equal(declaration(helper),declaration(runtime));
 assert.ok(helper.includes('##super(token,.status,target)'));
});
test('clean package includes both normal operations without fault or historical installer helpers',()=>{
 assert.ok(runtimeNames.includes('ManagedApi'));assert.ok(runtimeNames.includes('WebExecution'));assert.ok(runtimeNames.includes('Execution'));
 assert.equal(new Set(runtimeNames).size,runtimeNames.length);
 assert.ok(runtimeNames.every(name=>!/Test|Fault|Counting|Next|LabStore|Probe/.test(name)));
});
test('package manifest is deterministic and binds every byte and relative path',()=>{
 const files=[['b',Buffer.from('two')],['a',Buffer.from('one')]];
 const a=manifestFor(files),b=manifestFor([...files].reverse());assert.deepEqual(a,b);assert.equal(a.productionReady,false);
 assert.equal(a.entries[0].sha256,sha256('one'));assert.notEqual(manifestFor([['a',Buffer.from('changed')]]).contentSha256,a.contentSha256);
 for(const path of ['../escape','/root','a/../b','C:/absolute','a\\b'])assert.throws(()=>manifestFor([[path,Buffer.from('')]]));
 assert.throws(()=>manifestFor([files[0],files[0]]));
});
