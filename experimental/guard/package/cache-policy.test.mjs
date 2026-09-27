import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('managed static assets refuse stale storage and date validators without broadening permitted routes',async()=>{
 const config=await readFile(new URL('tls/httpd-local.conf',import.meta.url),'utf8');
 const block=config.match(/<LocationMatch "\^\/csp\/ops\/guard-managed\/">([\s\S]*?)<\/LocationMatch>/)?.[1];
 assert.ok(block);assert.match(block,/Header onsuccess unset Cache-Control/);
 assert.match(block,/Header always set Cache-Control "no-store"/);
 assert.match(block,/RequestHeader unset If-Modified-Since/);
 assert.match(block,/RequestHeader unset If-None-Match/);
 assert.doesNotMatch(block,/Require all granted/);
 assert.match(config,/<Location \/>\s*Require all denied/);
});
test('changed startup stylesheet has its own cache identity, separate from pre-gate releases',async()=>{
 const html=await readFile(new URL('../../../web/index.html',import.meta.url),'utf8');
 assert.match(html,/href="assets\/styles\.css\?v=1\.2\.1-startup1"/);
 assert.doesNotMatch(html,/href="assets\/styles\.css\?v=1\.2\.1"/);
});
