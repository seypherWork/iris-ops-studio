import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {endpointCatalog} from '../web/assets/api.js';

const inventory=JSON.parse(await readFile(new URL('../experimental/guard/mutation-inventory.json',import.meta.url),'utf8'));
const source=await readFile(new URL('../web/assets/app.js',import.meta.url),'utf8');

test('all catalogued non-GET operations have an explicit guard migration status',()=>{
  const actual=endpointCatalog.filter(entry=>entry.method!=='GET').map(entry=>`${entry.method} ${entry.path}`).sort();
  const declared=[...inventory.catalogueMutationsNotMigrated,...inventory.readOnlyPost].sort();
  assert.deepEqual(declared,actual);
  assert.equal(new Set(declared).size,declared.length);
  assert.deepEqual(inventory.backendOnlyWorkflows,[]);
  assert.ok(inventory.catalogueMutationsNotMigrated.includes('PUT /v2/security/user'));
  assert.equal(inventory.nextMigrationCandidate,'No additional migration in this evaluation candidate; publication requires final approval');
  assert.equal(inventory.releaseStatus,'evaluation-candidate-unpublished');
});

test('managed guard profile refuses direct administrative reads and writes',()=>{
  assert.match(source,/request:async\(\)=>\{throw new IrisApiError\("Direct administrative API disabled/);
  assert.match(source,/requestAsync:async\(\)=>\{throw new IrisApiError\("Direct administrative API disabled/);
  assert.match(source,/if\(guardProfile\)throw new Error\("Generic administrative operations are unavailable/);
  assert.match(source,/Not connected in this guard pilot/);
  assert.match(source,/No demo data or direct administrative API fallback is used/);
});

test('guard navigation does not advertise unsupported live workspaces',async()=>{
  const css=await readFile(new URL('../web/assets/styles.css',import.meta.url),'utf8');
  assert.match(source,/function configureGuardNavigation\(\)/);
  assert.match(source,/const available = new Set\(\["logs", webGuardProfile \? "webapps" : "secrets"\]\)/);
  assert.match(source,/button\.hidden = !available\.has\(button\.dataset\.view\)/);
  assert.match(source,/label\.hidden = !hasAvailableItem/);
  assert.match(source,/\.brand"\)\.setAttribute\("href", `#\$\{guardHome\}`\)/);
  assert.match(source,/configureGuardNavigation\(\)/);
  assert.match(css,/\.nav-item\[hidden\] \{ display: none; \}/);
  assert.match(css,/\.nav-label\[hidden\] \{ display: none; \}/);
});

test('guided direct mutations remain explicitly outside the managed guard',()=>{
  assert.deepEqual(inventory.guardedWorkflows,['wallet.policy.update','webapp.availability.update','role.resource.grant','role.resource.revoke','user.membership.assign','user.membership.remove']);
  assert.ok(inventory.migrationNote.includes('generic SysAdmin PUT /v2/security/role remains unavailable'));
  assert.deepEqual(inventory.guidedMutationsNotMigrated,['PUT /v2/web-app']);
  assert.match(source,/if\(guardProfile\)throw new Error\("Direct administrative reads are disabled/);
  assert.equal(inventory.arbitraryExplorerMutations.startsWith('blocked'),true);
});
