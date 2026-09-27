# Web app server guard — implementation and validation status

Status: **LIVE PILOT VALIDATED — all final regression gates passed; NOT READY for general release**.
Date: 2026-09-26. Public baseline remains 1.2.1. No commit, push or publication.

## Scope implemented locally

- One operation: change Enabled on the exclusively disposable
  `/csp/irisops-guard-testweb`. Fixed local IRIS 52801, same pinned container
  `d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
- Separate native session application `/api/irisops-web-guard`, with
  %Admin_Secure:U required for the operation. The native security API also needs
  %DB_IRISSYS:R; only the temporary test role was adjusted. No privileged
  service identity or substitution with an administrator account.
- Shared hardened execution lifecycle: default read-only, explicit expiring
  channel, server preview, current authorization checks after waits, per-target
  serialization, durable reservation, at-most-one dispatch per operation ID,
  readback and independent read-only recovery.
- Fixed official GET/PUT `/api/admin/v2/web-app`. Only Enabled is sent in PUT.
  Preview compares Enabled plus a deterministic digest of the other documented
  configuration. Full upstream metadata is not sent to the browser or receipt
  database. An unexpected schema or ineligible configuration fails closed.
- Native API is an upsert endpoint. A fresh valid read is mandatory; disappearance
  before that read prevents dispatch. There is no claim of an atomic conditional
  update against other native clients or deletion/recreation racing after it.
  A real missing-target experiment passed: no PUT and no implicit recreation.
- Existing wallet receipts retain their schema layout; new fields are appended.
  Empty historical Kind is interpreted as wallet. The public wallet receipt
  format is unchanged. Pre-existing public receipt snapshots were compared
  before and after recompilation/testing and were preserved. Empty Kind fallback
  was checked separately. This is NOT a general installation-upgrade test.
- New browser profile at `/csp/ops/guard-webapp/web/index.html#webapps`.
  Real Ops Studio dialogs/controller, isolated webapp recovery-key storage,
  strict nested evidence validation, no direct /api/admin fallback.
  This is not yet a general multi-workspace release.

## Evidence completed

- **142/142 JavaScript tests**: existing 133 plus 9 webapp tests.
- **4 offline browser groups** in `webapp-ui-local-evidence/result.json`:
  simulated login/readonly/preview, desktop/mobile confirmation, simulated
  execution and receipt recovery, journal proof filtering, no page exceptions
  or direct native requests. **These are not real IRIS tests.**
- Offline screenshots at 1440x900 and 390x844. A mobile header overflow
  (407px content in a 390px viewport) was reproduced and fixed with wrapping
  scoped to experimental guard profiles; the complete offline run then passed.
- The final ObjectScript sources compiled and executed against IRIS Community
  2026.2.0.221U in the pinned laboratory. An early compilation from the previous
  day is not used as evidence for the final sources.
- Final complete webapp pass: **34 groups**, including 10 real main-UI groups;
  `2026-09-26T15:10:14.135Z`, `complete=true`, `restored=true`,
  `releaseReady=false`. After visual review, the stale read-warning issue was
  reproduced by a new assertion; its first correction was insufficient because
  the controller omitted the observed availability. Only that validated boolean
  is now forwarded. The entire webapp suite then passed again.
- Main web UI evidence: `2026-09-26T15:10:12.437Z`, 10 groups included above,
  zero page exceptions and zero browser requests to /api/admin. Desktop/mobile
  screenshots were inspected after the correction; the stale warning is gone,
  the observed state carries a timestamp, and UNKNOWN remains separate.
- Transport/custody: **38 groups**, `2026-09-26T15:10:21.678Z`,
  `completed=true`, `featureReady=false`.
- Full wallet regression after the shared-engine refactor: **68 groups**, final
  `2026-09-26T15:15:52.391Z`, `complete=true`, `restored=true`.
  This final repeat includes the last shared-controller correction. The 15
  main-UI groups are included, not additional; final UI evidence is
  `2026-09-26T15:15:11.948Z`, with zero page exceptions and zero native API calls
  from the browser.
- JavaScript syntax: **32 files** checked. All **142 tests** passed again.
  npm.cmd is not bundled here; the syntax and test commands are run directly
  with the bundled Node runtime, covering the package's check script and the
  additional experimental JavaScript files. No new percentage coverage claim.

## Live scenarios exercised

`verify-webapp-execution.mjs` pins the container and collision-checks all
fixtures. It creates only its own user/role/resource/application, uses a generated
in-memory password, restores the full initial application state and removes
its disposable fixtures afterward. It retains persistent receipts.
It covers read-only bypass attempts, exact schema/Origin/CSRF, target restrictions,
same/different-ID concurrency, stale description, permission revocation before
and during native read, cancellation, channel relock, failed readback, real
worker interruption before/after dispatch, failed final receipt persistence,
actual preview expiry, container restart and recovery without resend.

`verify-webapp-ui.mjs` deploys/verifies served file bytes and tests the real UI
with live IRIS: forward/reverse availability, stale block with a native PUT
counter, dropped response, UNKNOWN vs current match, malformed nested receipt,
unsupported navigation without fallback, desktop/mobile screenshots, secret
filtering and logout. The final full live run completed successfully after the
last visual correction. The full wallet regression was then repeated against
the final shared controller and also passed before closing this report.

Reproduction order, always sequential (fixtures are shared):

1. Full `verify-webapp-execution.mjs`, with IRISOPS_WEB_FAST unset and
   IRISOPS_WEB_UI=1.
2. Full prior wallet regression with all audit/recovery/UI/extended flags.
3. `verify-http-transport.mjs`.
4. All unit tests and visual review of the newly generated **real** screenshots.
5. Verify native dispatchers restored, fixtures absent, original configuration
   restored, secrets absent from inspected output and public files unchanged.

## Docker recovery history — resolved for this session

On 2026-09-26 at 14:30 UTC Docker Desktop failed before starting its Linux engine:

`sailor-ingest.sock -> sailor-ingest.sock.stale: The file cannot be accessed by the system`

Source: local Docker backend log. The attempted live webapp runner failed at its
initial container inspection, before fixture creation or mutation. Docker was
started normally; no reset, disk/volume deletion or configuration change was used.
The socket is a zero-length reparse point dated 2026-09-25.
The user approved the exact socket quarantine. Normal Docker stop failed in
the crashed state; only residual Docker Desktop/backend processes with verified
executable paths were stopped. The literal-path move of the single socket also
failed with "The file cannot be accessed by the system". Independent checks
confirmed source present and destination absent: nothing was deleted or backed
up by that attempt. Moving the containing run directory instead is a different
method and awaits confirmation. It was inspected: four zero-byte communication
reparse points only, no container, volume or disk data.

Subsequent user confirmation: the containing run directory was moved to the
exact approved workspace quarantine and all four entries were verified there
(names, sizes, attributes and modification times). No deletion occurred.
Normal Docker startup then failed on a second stale socket, engine.sock under
docker-secrets-engine. Read-only inspection found only that zero-byte socket;
no secret contents were read. Separate confirmation is requested for that
directory and the newly generated two-socket run directory. Live validation
was blocked at that point; no live test claim was made until recovery succeeded.

After explicit confirmation of both additional directory moves, all destination
entries were verified and Docker started normally. IRIS was observed running
from 2026-09-26 14:46:58 UTC. Persistent project/container/volume data were not
deleted, reset or moved. Quarantined runtime socket directories remain saved.
The workaround is not proof that future cold starts are permanently repaired.
See the sibling workspace `docker-socket-quarantine-20260926/inventory.md` for exact
paths, timestamps and pre/post-move checks.

## Defects found and corrected by real validation

1. Dynamic arrays passed as scalar conversion types caused an ILLEGAL VALUE
   exception. Object/array references are now assigned without scalar conversion.
2. The observed 2026.2 response differs from the official OpenAPI snapshot:
   ServeFiles is `No` instead of `Never`, WSGIType is `WSGI` instead of an integer,
   and Type is omitted. Only the documented/observed bounded forms are accepted;
   all returned configuration remains in the digest. Unexpected fields, malformed
   arrays, missing expected fields and unsafe fixture configurations fail closed.
3. An extra negation in the preview permission check rejected authorized users.
   The comparison was corrected; the positive native path and revoked-permission
   paths both passed afterward.
4. A temporary fixture role lacked the native API's IRISSYS read permission.
   This was corrected in the disposable role, not by broadening guard authority.
5. The cookie-path test originally assumed case-sensitive attribute spelling;
   its assertion now compares attribute names case-insensitively.
6. Visual review found the former read error still shown after a successful
   recovery. The UI now uses the validated current observation, labels its time,
   and removes that obsolete warning without making an extra administrative call.

The earlier 390px header overflow was corrected before the live pass. Tests
include reordered metadata keys, arrays, international text, rejected partial
responses, missing native target and unchanged historical public receipts.

## Explicit limits

- This is an isolated pilot for the single disposable webapp and wallet, not a
  claim that every workspace or the published 1.2.1 is server-guarded.
- No administrator identity substitution. Native IRIS authorization remains
  independent. Users allowed to access native /api/admin directly are not
  prevented from doing so by this separate guard.
- No atomic compare-and-swap with external/native clients. Delete/recreate or
  configuration changes after the last GET remain a native API race limitation.
- `dispatchCount=1` is a durable reservation, not proof the network delivered a
  PUT. The tests count native PUT arrivals separately. UNKNOWN remains UNKNOWN
  even when a later read matches the expected state.
- No user-impact/active-session dependency graph is claimed. Enabling/disabling
  real customer applications, production deployment, TLS, arbitrary targets,
  installation upgrades and multi-instance support have not been validated here.
- Known test secrets are checked in responses/logs and proof-free UI state;
  this is not a certificate of absence of every possible unknown secret or defect.

## Backup / boundaries

Before this change, experimental/ and web/ were copied to:

`C:\Users\ilyas\Documents\Codex\2026-09-21\files-pasted-by-the-user-act\work\iris-ops-guard-pre-webapp-20260926`

The execution source hash was compared successfully. This is a source backup,
not a Docker database snapshot. No old source or persistent receipt was deleted.
Public README, package version and module manifest are not updated because the
feature is an unreleased, limited pilot. No guarantee of contest ranking or
absence of all defects is made.

## Independent final restoration check

After all runners exited successfully, an additional read-only check confirmed:

- Native `/api/admin`: Enabled=1, empty Resource, `%Api.Admin`, namespace %SYS.
- Wallet guard: `IrisOps.Guard.HttpApi`; webapp guard: `IrisOps.Guard.WebApi`.
  Neither is left using a fault-injection dispatcher.
- Temporary ProbeUser, WebUser, RecoveryOther, both temporary roles, all three
  temporary policy resources, the probe wallet and the disposable webapp are
  absent. These owned test fixtures were restored then removed; no historical
  operation receipts were deleted.
- `IrisOps_GuardStorage` is restored to `%DB_IRISOPSGUARD:RW`.
- The exact original lab container/image is running. All eight existing named
  volumes are still listed, including the earlier hardening volume.
- Both source backups and all three approved socket-quarantine directories
  remain present. No factory reset, prune, data-volume deletion or publication.
- Public README.md, package.json and module.xml equal HEAD. HEAD remains
  `a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`; branch is still
  `feature/iris-server-guard-20260925`. Existing working changes are preserved.
- Final source hashes match the table below; diff whitespace check passed.

The bounded implementation/testing milestone is complete. Before a public
release, define the production target/installation/session lifecycle and audit
the resulting deployment boundary. Do not ship this laboratory setup, fault
classes or synthetic fixtures as a production-ready safe mode.

## Contract reference

The local previously retrieved official mainspec_v2.json identifies both GET and
PUT /v2/web-app as %Admin_Secure:U; Application.NameSpace is required for creation
and optional for updates. Current repository existence was checked online;
fetching its raw JSON failed this session, so the earlier official snapshot was
used for field/type review:
[InterSystems specification](https://github.com/intersystems-community/sysadmin-api-specification).

The deviations described above were verified against our actual IRIS build,
not inferred from the snapshot. Minimum native security API privilege reference:
[InterSystems IRISSECURITY advisory](https://www.intersystems.com/product-alerts-advisories/advisory-for-irissecurity-in-intersystems-iris-2025-2/).

## SHA-256 of the validated logic

These are local source hashes, not a release asset or a publication claim.

| File | SHA-256 |
| --- | --- |
| IrisOps.Guard.Execution.cls | E2DB29692B83C5064C082C521EEBA077A4EA50450E4D3976AE6E11313CDDDCE8 |
| IrisOps.Guard.WebTransport.cls | D14DDAD576D7207AD08028D5E453CB5E7BD24EABE68ACEF521E8F9DC4130EC8A |
| IrisOps.Guard.WebExecution.cls | 77EF0810D264BB6762A4F51D65F3078544DDE0154D5FC499989969EEE97BCD7D |
| IrisOps.Guard.WebRecovery.cls | F8B00B26EFFFCC33189B61E1CBB97C656ACCE5D4725DCCC0E76F88C5DB4F7611 |
| IrisOps.Guard.WebApi.cls | 803F8D0F3E0C1352430C51F24143CDBBCC975037B76BA218DDB5D9F741A0F9AB |
| IrisOps.Guard.Receipt.cls | 4FE2B2E3684F07DCFFE5AB8B6FF79D76C41593CF163FE846844114F26C7BAA2E |
| ui/contracts.js | 901650F74D7F4080A1FDA7C7068BCA99E96552DD12D14C0E3DBC49F39F0439BC |
| ui/client.js | FE7BE9327ACAEA39A5B25A3EFE9528257055C84EC72CB02E6474874608A019AA |
| web/assets/wallet-guard.js | A1677817C9CF53EE9D183021CBDC398EECCB9F59F7D51FA1A5917F0C2A1A1C43 |
| web/assets/app.js | 8EC97C06D6509EEF4892BF031E7E32EE9BFE57152F5827C6EED5E20FA742D770 |
