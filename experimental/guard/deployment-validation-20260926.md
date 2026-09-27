# Managed deployment and session lifecycle — real IRIS validation

Date: 2026-09-26. Status: MANAGED LAB LIFECYCLE AND ALL LISTED REGRESSIONS PASSED.
NOT READY for general production release.
Public baseline remains 1.2.1; no commit, push, release or public text changes.

## What changed

The new `/api/irisops-managed-guard` wraps the two existing disposable operations
with terminal-admin-controlled deployment state: READ_ONLY, ACTIVE, SUSPENDED.
Initial registration is read-only. Every mode/build change rotates generation;
old authentication and approvals cannot resume. Mode changes and native dispatch
share a bounded lock. There is no HTTP installer/update route.

The own durable database retains nonsecret state/history and operation receipts.
The browser's opt-in managed profile displays server deployment state separately
from native user capabilities and each operation's temporary write grant.
Old combined and separate profiles remain independent, not silently migrated.

Scope and commands: [design](deployment-design-20260926.md),
[operator/recovery guide](deployment-operator-guide.md).

## Real findings and corrections

1. The first native application configuration had CSPZENEnabled = 0, which
   prevented the REST dispatcher from being served (404). The owned application
   now uses CSPZENEnabled = 1 while ServeFiles = 0 and the fixed REST route map
   remain. A successful compile alone did not detect this; live HTTP did.
2. Interruption recovery initially risked continuing in %SYS after an inline
   namespace switch. Native application changes now use the scoped helper;
   actual installer process exit and subsequent recovery were re-tested.
3. The UI needed to distinguish native permissions from a deployment-wide
   read-only gate. It now shows the reason, disables write enabling and discards
   authorization on failed/changed deployment status. Server enforcement remains
   independent of UI controls, including calls sent directly to execute.
4. Strict response tests corrected numeric installed to a real JSON boolean.

The test harness also needed two corrections, not permission relaxations:
the native user-switch probe must execute within one class call rather than
depend on subsequent interactive terminal lines; POST to an existing GET-only
route is 405, whereas nonexistent installer paths are 404. The final limited
user test confirms correct native identity, no Admin_Manage, and installer denial.
Its random credential is kept only in memory and never emitted in evidence.

## Completed managed evidence

`deployment-evidence.json`, 2026-09-26T16:25:30.768Z:
28 grouped scenario checks, including 13 UI groups, with complete/restored/
suspended all true and productionReady false.

- Idempotent read-only apply; stale plan and native-property drift refuse
  overwrite. The final rerun preserves an already registered suspended lab
  application; it is not a second clean-instance bootstrap. Initial registration
  was exercised earlier while implementing this milestone.
- Correct native user without installation authority denied by the installer;
  no HTTP deployment mutation endpoint. Native permissions alone do not turn
  server READ_ONLY into ACTIVE.
- Direct write-enable/execute attempts denied with zero native PUTs in READ_ONLY.
- Activation invalidates the old session. Both guarded native mutations and
  inverse operations verify real state, not just an HTTP success response.
- Returning to read-only invalidates both pending approvals. Existing receipts
  remain inspectable with fresh native login and the private operation proof.
- Actual delayed native dispatch holds the deployment lock. Concurrent suspension
  returns deployment_busy without terminating the operation; that operation
  completes VERIFIED once.
- Actual dispatcher replacement and rollback between two bounded lab classes
  require suspension and retain receipts. This is not an IPM/schema upgrade test.
- Failed readback produces UNKNOWN; suspension, reactivation and reconciliation
  do not resend a PUT or silently promote the original result to VERIFIED.
- Actual installer terminal process HALT leaves TRANSITION and blocks the route.
  Explicit recovery only sets SUSPENDED. An injected activation exception also
  fails closed instead of restoring prior write-enabled state.
- Actual restart of the named IRIS container preserves deployment generation
  and receipt hashes but invalidates previous upstream authorization. Fresh
  receipt recovery sends no administrative PUT.
- Old native/prototype application property hashes are unchanged; full native
  fixture state restored; only seven owned disposable fixtures removed. All
  preexisting receipt hashes retained. Managed application left suspended.
- Known random password, native token and private recovery proofs absent from
  inspected container logs. This is a targeted secret-leak check, not a guarantee
  against a privileged memory/database reader.

`managed-ui-evidence/result.json`, 2026-09-26T16:25:28.219Z: complete true,
13 UI groups, zero page exceptions, zero browser requests to native /api/admin.
The live UI runner also compares every deployed source asset byte-for-byte.

Visual review used actual 1440x900 and 390x844 browser viewports: read-only state,
wallet/webapp preview dialogs, disabled confirmation, limited-role controls,
recovery and distinct UNKNOWN / MATCHES_EXPECTED evidence. Full-page images may
be taller than the viewport. Text/control layout was readable with no horizontal
page overflow; transient toasts may overlay part of the page while visible.
There are no password/token/recovery-proof fields displayed in these captures.

## Regression evidence

- 157/157 JavaScript tests passed, including five new deployment-session groups.
- Syntax checks passed for all 39 JS/MJS files under web, mock and the guard
  experiment, including its seven test modules. Bundled Node ran the check
  commands directly; npm.cmd is not available in this runtime.
- Combined operations/UI: 23 groups, 2026-09-26T16:27:26.263Z,
  complete/restored/cleanupComplete true. Includes real 60-second expiry.
- Existing wallet: 68 groups, 2026-09-26T16:32:57.314Z,
  complete/restored true. Includes 15 main-UI groups, adversarial expiry,
  permission changes, real worker exits, restarts and recovery.
- Existing webapp: 34 groups, 2026-09-26T16:34:29.368Z,
  complete/restored true. Includes 10 main-UI groups and actual restart.
- HTTP transport/custody: 38 groups, 2026-09-26T16:34:59.127Z,
  completed true, featureReady false.

Sources: `combined-evidence.json`, `wallet-integrated-evidence.json`,
`webapp-execution-evidence.json`, `http-transport-evidence.json`. UI groups are
already included in their parent suite, not extra checks to add again.

Scenario groups overlap and are not independent coverage percentages. No claim
of 100% reliability, absence of all defects or exhaustive endpoint coverage.

## Preservation

Source backup: sibling `iris-ops-guard-pre-deployment-20260926`, experimental/
and web/ copied before implementation; selected hashes compared. It is a source
backup, not a database backup. Original files were not moved or deleted.

web/index.html, styles.css, CombinedApi, HttpApi and Execution match that backup.
Public README.md, package.json and module.xml have no Git diff. Existing local
development changes remain uncommitted. Persistent receipts, deployment history,
container disks/volumes and the old probes were not removed.

Final independent read-only inspection after all five live suites confirms:

- Exact pinned container still running, IRIS 2026.2 build 221U.
- Managed state SUSPENDED, managed-lab-a; native Enabled = 0 and dispatcher
  IrisOps.Guard.ManagedApi in IRISOPS. 61 deployment history entries retained.
- 743 accumulated laboratory operation receipts present; this is retained test
  evidence, not 743 customer operations or an independent quality metric.
- /api/admin enabled in %SYS with %Api.Admin and empty Resource. The original
  read-only feasibility probe remains IrisOps.Guard.Api in %SYS. Separate wallet,
  webapp and combined probes remain their respective own IRISOPS dispatchers.
- All four runner users and roles, the separate recovery-isolation test user,
  three test resources, test wallet and test webapp absent. No live customer
  object was used. All five live runners exited successfully and their browser
  fixtures awaited close in finally. An independent Windows process inventory
  was denied by the host permission boundary, so absence of detached host
  processes is not separately certified.

The seven deleted objects are runner-owned test user, role, wallet, webapp and
three disposable resources, created only after absence checks. They can be
recreated by the runner; they were not user data or a customer installation.

## Remaining acceptance gates

1. Clean-instance bootstrap and actual supported package installation,
   upgrade/recovery/uninstall without assuming prepared namespaces or mappings.
2. HTTPS/cookie/transport deployment topology and a usable bounded production
   session lifetime. The pilot still uses fixed localhost:52801 and 60 seconds.
3. General-target policy and migration of remaining application operations.
4. Final review of the integrated production artifact, documentation and media
   before any separate publication decision.

The guard protects only its managed route; native administration and old profiles
are not blocked globally. It is single-instance, not a central multi-instance
console. Native GET/PUT is not atomic compare-and-swap against outside clients.
SourceStamp is a dictionary-revision fence, not cryptographic software signing.
Receipt recovery needs the private operation proof; losing it is not repaired
by reinstalling, and a current match does not establish historical causality.

## Validated implementation SHA-256

These identify local source, not a published package or signed binary.

| File | SHA-256 |
| --- | --- |
| IrisOps.Guard.Deployment.cls | FE77EE8D5D656040FA32571A495C02CBB66BA4BEF8C4B30C5AAE5DA8C9DEC681 |
| IrisOps.Guard.ManagedApi.cls | CA398E0C0E7237857D60F2F8F5FC3841D4947CF5AFB280B214EE822147B6D633 |
| IrisOps.Guard.ManagedNextApi.cls (test build) | EC15B7A36AEA360A503825EA7A69CBB0B690376B11FD803CA99314C11FCF582B |
| IrisOps.Guard.TestDeployment.cls (test helper) | BC2DA1129A215FCFB29F251FCC20E84E184EC5BF280F235751091730E7C8D5F8 |
| experimental/guard/ui/session.js | AEF980F4FC23ABF7BD0D1A973C6A22E31E2ACBF74EFB701E5A4317F9D3ECA4ED |
| web/assets/combined-guard.js | 3976702BF447FB74D62A8954DB8D0D2A902D155362206862821CC68C58EADE79 |
| web/assets/wallet-guard.js | E307F7B87A07AFE25AE9163E5A922426853121E11ECB39E5D5BB336A6A54BB39 |
| web/assets/app.js | 6BAE2F34A6CABCBB3A6DCC19539809FBF4E9E8136986600FC6D599A581B6AC81 |
