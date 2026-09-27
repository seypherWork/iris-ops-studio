# Recovery and browser pilot — NOT READY for public release

This report preserves the standalone-pilot milestone. Subsequent integration
into the main frontend is documented in
[integration-validation.md](integration-validation.md), with separate evidence.

Date: 2026-09-25. Same isolated IRIS Community 2026.2 Build 221U lab as
[wallet validation](wallet-validation.md), loopback 52801. No production files,
module manifest, release number or published repository content changed.

## Implemented

- `POST /v1/operations/{id}/inspect`: current native read plus authorized receipt
  retrieval. No receipt mutation and no administrative PUT.
- `POST /v1/operations/{id}/reconcile`: same current read; append a bounded,
  timestamped observation to the receipt. No administrative PUT.
- Explicit fresh session recovery for the original IRIS username with current
  wallet and both before/expected policy resource permissions. Native API read
  denial still blocks recovery. Origin, CSRF, exact ID and an exact single-field
  body containing the per-operation recoveryKey are required.
- Legacy receipt GET stays session-bound and now also requires current native
  authorization and the proof in X-IrisOps-Recovery-Key. Execute replay requires
  its original session, proof and current authorization; neither is a bypass.
- A preview issues a new cryptographically random 256-bit recovery key once.
  Server-owned preview and durable receipt store only its SHA-256 digest, bound
  to the actor and operation ID. Empty legacy hashes fail closed; keys are not
  reissued, put in URLs, returned in receipts, or exposed in visible UI content.
  Execute also requires this proof alongside the existing confirmation and
  server-owned approval; a key by itself grants no mutation authority.
- Browser sessionStorage holds at most 64 operation/key pairs in this tab.
  Reload and reconnect preserve them; explicit Disconnect removes them and
  verifies removal. Closing a tab normally removes sessionStorage, but browser
  session restoration/duplication can retain or copy it. No claim of secure erase.
  The UI refuses to submit if it cannot persist and read back the proof first.
  No password, administrative token or receipt content is persisted there.
- The original execution State, Reason, Events and Observed fields are never
  replaced by a recovery observation. Results are MATCHES_EXPECTED, MATCHES_BEFORE
  or DIFFERS, with `causality: not_proven`. UNKNOWN does not become VERIFIED merely
  because a later state matches. Upstream unavailability records no fabricated
  observation. After 20 recorded observations, inspection remains available but
  further observation appends are blocked; no evidence is deleted.
- Experimental browser view at `/csp/ops/guard/index.html`: native login,
  default read-only channel, explicit temporary enabling, server preview,
  confirmation, one execution attempt, recovery and logout. It only communicates
  with the guard; no direct administrative API fallback exists in this view.

This is a separate pilot screen, not migration of the ten existing product
areas. It cannot operate arbitrary wallets, users, processes or tasks.

## Evidence

`wallet-recovery-evidence.json` records the initial successful recovery run.
`wallet-ui-evidence.json` records the latest combined run and exact completion,
restoration and release-readiness flags. Do not treat a failed intermediate run
or an old evidence file as a passing final run. `ui-evidence/result.json` contains
browser results; screenshots show only test account names/policies and nonsecret
operation IDs, never login credentials.

Observed with real native HTTP and disposable objects:

1. Repeated reconciliation sends zero additional PUTs and preserves original
   events, even when the current state later returns to the before-state or differs.
2. Wrong origin/CSRF, extra fields, permission revocation and another equally
   privileged user cannot recover the owner's receipt.
3. Failed current read and failed observation persistence do not replace saved
   execution evidence or create a successful-looking observation.
4. A real request worker exits via HALT immediately after the committed reservation
   and before PUT. Recovery observes the before-state; zero PUTs were counted.
5. A real worker exits after native PUT returns, before readback/final save.
   Recovery observes expected state and original UNKNOWN; exactly one native PUT.
6. Injected final receipt save failure returns RECEIPT_INCOMPLETE; the saved
   reservation remains UNKNOWN and is recovered through reads. This is a simulated
   save error, not a physical disk failure.
7. After actual lab restart and fresh login, authorized recovery retrieves unchanged
   original history and appends a current read observation without executing again.
8. Browser: successful typed confirmation and readback, stale preview sends no PUT,
  reload retains tab-scoped operation proofs, reconnect recovers its receipt,
   uncertain original and current match are displayed separately.
9. Browser request interception aborts one execute request. The local preview is
   consumed, no retry occurs and no native API fallback occurs. This specifically
   tests a browser transport failure, not a proven dropped response after commit.
10. Desktop 1440x900 and mobile 390x844 used; no page overflow or JS exceptions in
    the passing run. Exact served asset bytes and JavaScript MIME types are checked.

The automated JavaScript suite now contains the unchanged 103 baseline tests
plus 10 guard-client and 3 recovery-storage tests (116 total). This count does not include or replace
real-IRIS integration evidence, Python native-reader tests or visual review.

## Defects caught during implementation

- Native CSP hosting served `.mjs` as application/octet-stream, so browsers did
  not run the modules. The screen uses standard `.js` module files; deployment
  checks MIME and actual bytes. No global server MIME configuration was changed.
- A directory-copy helper nested UI files instead of replacing the intended
  owned experimental assets. It now copies the four named files explicitly and
  verifies served bytes against current local files.
- Receipt access through the older GET route could otherwise avoid new recovery
  permission checks. It now honors native read authorization and revocation.
- Reconnecting must clear old visible receipt/current-policy content. The page
  clears it before starting a new login, including a failed login attempt.

## Isolation and boundaries

`FaultApi` and `TestExecution` are explicit LAB-ONLY subclasses. Normal execution
uses no-op test seams; request input cannot select a class or fault. The runner
temporarily installs the fault dispatcher only in the pinned lab and restores
`IrisOps.Guard.HttpApi` afterward. Native counting instrumentation is also restored
to `%Api.Admin`. All mutation targets remain the existing collision-checked
disposable wallet and two resources. Owned accounts are removed after tests;
receipts and storage are retained. No project container or volume is deleted.

## Per-operation recovery proof evidence

Final combined run: 2026-09-25T21:05:37.590Z, **50 check groups passed**,
complete=true, restored=true, releaseReady=false. The separate custody/native
transport regression passed **38 checks** at 21:06:42.970Z. JavaScript: **116/116**
passed; syntax checked in 20 files. These are different test scopes, not an
aggregate coverage percentage or a claim that all product workflows are tested.
Final read-only inspection confirms native dispatcher %Api.Admin, guard dispatcher
IrisOps.Guard.HttpApi in IRISOPS, and absence of the named temporary accounts,
operator role and wallet. No tracked production files or Git HEAD changed.
Latest desktop and mobile captures were visually inspected after the run.

User selected this model instead of restricting recovery to the original session.
The limited-account identity probe found that Security.Users.CreateDateTimeGetStored
was unavailable in IRISOPS (CLASS DOES NOT EXIST) and denied in %SYS (PROTECT).
No additional system-database or security-administration rights were granted.
The probe restored the guard namespace and dispatcher and removed its own fixtures.

The updated combined runner checks:

- Missing, wrong, malformed and cross-operation proofs fail on inspect/reconcile,
  legacy GET and execute replay; responses expose neither proof nor digest.
- Repeated observation, interruption recovery and actual IRIS restart retain the
  original evidence and never repeat an administrative PUT.
- A correctly possessed key does not bypass current native permission revocation
  or permit another equally privileged username to read the receipt.
- A disposable account is actually deleted/recreated with the same username,
  password and role. Its fresh session cannot recover by ID or replay execution.
  Deliberately supplying the old correct proof DOES permit read-only recovery:
  this is possession-based continuity, not native account-incarnation identity.
- Persisted RecoveryHash equals the independently calculated actor/ID-bound
  digest. Old receipts without this property are retained but inaccessible here.
- Browser reload/reconnect works; keys remain out of visible text/screenshots;
  multiple keys persist independently; absent storage blocks execution; explicit
  logout removes them. No localStorage, direct admin API or auto-retry is used.
- Container logs from the run are checked against its known fixture password,
  observer token and programmatically issued proof values. This is not a claim
  about arbitrary external reverse-proxy, trace or third-party logging systems.

Recovery proofs are sensitive read capabilities, not administrative credentials.
Same-origin scripts, browser developer tools, extensions or someone controlling
this tab can read them. Copying the key to a recreated same-name account with
the necessary permissions permits historical reads by design. Do not transfer
them or add analytics/request-body logging. A lost key cannot be reconstructed
from the stored hash. There is no key reset, cross-user override or export here.

## Remaining release gates

- **Identity/lifecycle limits:** username-only recovery is closed by the chosen
  possession proof, not by an immutable native account identifier. Automatic
  account-deletion revocation, transferred/copied keys, browser compromise and
  independent proof revocation/retention policy remain production design gates.
  Pilot receipts contain no administrative secrets, but their metadata is private.
- A cloned database/instance identity, lock contention across distinct workers,
  power loss/journal recovery, actual disk-full/final-save I/O errors, delayed
  upstream completion and network loss after native application require more tests.
- Native read-then-PUT still cannot prevent an external administrator racing
  the final precondition read. Current-state coincidence is not causal proof.
- Other product workflows are not yet connected to the guard. The published
  frontend still uses its existing client-side controls, not this server mode.
- Clean installation/upgrade, native audit linking, practical credential renewal,
  HTTPS deployment, licence lifecycle and IRIS for Health remain unvalidated.

## Reproduce

From this worktree, set `IRISOPS_DOCKER_EXECUTABLE` to Docker,
`IRISOPS_RECOVERY_TEST=1`, `IRISOPS_UI_TEST=1`,
`IRISOPS_EXTENDED_WALLET_TEST=1`, `IRISOPS_PLAYWRIGHT_MODULE` to Playwright, and
`IRISOPS_BROWSER_EXECUTABLE` to an installed Chrome binary. Run
`node experimental/guard/verify-wallet-execution.mjs`.
The runner pins the existing lab ID and prerequisites; this is not a general
installer. Do not run concurrently with any other lab integration runner.
