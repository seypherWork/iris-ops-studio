# Durable container replacement — 2026-09-26

Status: SAME-IMAGE REPLACEMENT VALIDATED IN AN ISOLATED IRIS LAB.
Production/publication readiness remains false. Public baseline 1.2.1 unchanged.

## Exact scope and provenance

This step changes the laboratory launch configuration and adds a verification
runner/documentation. It does not change the shipped runtime, Bootstrap, browser
code, package ZIP, public version or any previous instance's configuration.

- Artifact: `irisops-guard-clean-package-20260926-e`, 34 hashed content files.
- Content SHA-256: `fb369cd54e365a1069bb2946b8b86f395a3a83bc5770e65b7cf37716690fc2cf`.
- Exact image: `sha256:d657acb6445cae0a7b96f917dcbc7fdcf4007d2a9d43b22cfbe5a654660e75a4`.
- IRIS Community 2026.2; no image pull or runtime upgrade.
- New named volume: `irisops-guard-durable-20260926-g`, mounted read/write at `/durable`.
- Explicit launch environment: `ISC_DATA_DIRECTORY=/durable/iris`.
- Only host exposure: `127.0.0.1:52803:52773` during the live test.
- Container A: `iris-ops-guard-durable-20260926-g-a`, ID
  `9369d6c651fde8dc088fc73ee4827a15ee1ca4411d8a801cc4b81aa5f07366c2`.
- Different container B: `iris-ops-guard-durable-20260926-g-b`, ID
  `b1f9d6ba0869d8e0495d9ada7fa2218276ee62388232bfe220ce9ca4412e261c`.

The documented native [durable %SYS mechanism](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ADOCK)
keeps system configuration on the mounted storage. Both application database
directories are also under that same mount: `/durable/irisops-code/` and
`/durable/irisops-guard-state/`. Native
[`$system.Container.IsDeployed()`](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25SYSTEM.Container&LIBRARY=%25SYS)
returned 1 in A and B. Merely naming a directory `/durable` is not persistence.

## Evidence

`durable-replacement-evidence-g.json`, 2026-09-26T17:19:13.981Z:
complete, restored, fixturesRemoved and previousLabsPreserved are true.
sameImageOnly true; backupRestoreTested and productionReady false.

Six grouped checks passed:

1. New empty volume, exact image and manifest bytes, native durable %SYS,
   clean Bootstrap creates private stores and the read-only managed application.
2. Actual wallet policy and webapp availability changes return VERIFIED, then
   independent native reads confirm the result. Original native state is restored
   BEFORE replacing the container, making an accidental reapplication observable.
3. Clean shutdown of A verified stopped/exit 0. B is a distinct new container,
   using the same exact image and volume, never concurrent with A. Bootstrap Plan
   returns NO_CHANGE with no install call. Deployment plan/generation, namespace
   and private mappings survive. Hashes of both complete public receipt payloads
   plus their recovery hash/binding match the originals.
4. The volatile boot epoch is absent before new login. Old authorization does not
   succeed; fresh native login works with the preserved temporary account/role.
   The former channel is not found. The unexecuted old preview returns exactly
   HTTP 400 / invalid_preview. Both original receipts recover as VERIFIED with
   dispatchCount = 1, unchanged evidence hashes/count and unchanged native state.
5. Actual packaged UI in B at 1440x900 and 390x844: both guarded workspaces,
   read-only server explanation, disabled enabling/editing controls, password
   cleared, no page exceptions and no browser requests to `/api/admin`.
6. Both targets restored; seven collision-checked owned fixtures removed; managed
   service SUSPENDED, original receipts retained, B stopped cleanly. A was already
   stopped. Logs were checked in memory for this run's fixture secrets.

`clean-ui-durable-g/result.json`: complete true, pageExceptions 0,
directNativeRequests 0. Desktop/mobile screenshots were visually inspected:
readable content and no horizontal page overflow. The existing transient toast
overlays some helper text on mobile while displayed; that known presentation
limitation remains and was not hidden by retaking the screenshot. No credentials
or recovery proofs are shown. This was a focused replacement/UI smoke test, not
a new audit of every screen of the public application.

The unchanged JavaScript suite also passed 160/160 tests; all 45 JS/MJS files
under web, mock and the experiment passed syntax checks. The reference ZIP hash
was rechecked unchanged. Final independent Docker inspection confirmed old lab
running and all f/g replacement containers stopped with exit code 0 and their
expected volumes retained. No percentage of all
possible failures, universal exactly-once delivery, or complete production
coverage is claimed.

## Incomplete first attempt retained

Attempt f preserved installation and receipts across replacement, then its test
expected 404/409 for a missing session preview. The existing Execution contract
returns 400 / invalid_preview before any reservation/write. Only that incorrect
test expectation was corrected; production/runtime code was not changed to make
the test pass. The whole test was repeated on new g storage and both new g
containers, with the exact error and unchanged native state checked.

Attempt f's evidence remains complete=false. Its two containers and volume remain
stopped, with partial test fixtures retained for inspection; they are not the
reference result. Original target values were restored and the guard suspended.
Do not silently reuse or delete f to conceal the incomplete run.

## Safe operator rules

The runner is `verify-durable-replacement.mjs`. Run only one integration runner
at a time from the checkout with a verified Docker executable and a NEW suffix
f–z. Existing names/volume are refused; reruns need a new suffix. Optional browser
checks require IRISOPS_DURABLE_UI=1 and verified Playwright/Chrome paths. The
runner does not download images, delete volumes/containers, or persist passwords.

1. Inspect image ID, target names, free loopback port and mounted volume identity.
2. For a fresh installation, use a NEW dedicated volume; never attach it over
   the prepared labs' existing writable data and claim migration.
3. Set the durable directory to a subdirectory of the mount. Verify actual native
   durable state AND both database paths, not just environment variables.
4. Stop the old writer and verify clean shutdown before starting its replacement.
   Two stopped containers referencing a volume are not two independent backups.
5. Reuse only the tested exact image here: `/opt/irisops-guard` UI/runtime assets
   remain image files, not a substitute for the external system and receipt DBs.
6. If startup/initialization is incomplete, stop and inspect. Do not blindly retry
   against populated storage: durable-manager incomplete-copy handling may remove
   an incomplete target directory on retry. Preserve failed volumes separately.
7. Keep previous containers/volumes until an independently verified backup and
   explicit cleanup decision exist. Never use volume deletion as a repair step.

## Preservation and remaining work

The runner rechecked original 52801 container ID/running state/deployment JSON
and receipt count unchanged; the earlier clean reference e remained stopped with
the same ID. No old IRIS database, Windows setting or Docker configuration changed.
No public README/version, commit, push, release or Open Exchange update.

Documentation pre-edit copies are in sibling
`iris-ops-guard-pre-durable-docs-20260926`, with both source/copy hashes verified.
These are documentation backups, NOT IRIS database backups.

Still unverified: cold backup and restoration into a DIFFERENT volume; recovery
from disk/host loss or an abrupt engine crash; package/schema/IRIS version upgrade;
encrypted external backups/retention; supported production HTTPS/cookie topology;
realistic session lifetime and migration of the full product to guarded routes.

Next recommended gate: preserve g, create and verify a consistent cold backup,
restore it to separate fresh storage with no source writes, then prove native
configuration and receipt recovery there. Do not call this replacement result
backup/restore or production readiness.
