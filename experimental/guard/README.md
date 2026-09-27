# Server guard: optional bounded evaluation package in 1.3.0

Updated: 2026-09-27. Based on public 1.2.1 commit
`a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`.

This directory remains an **optional, bounded evaluation profile**. Local source
metadata is now 1.3.0; the historical 1.2.1 release has not been changed. The standard
IPM module does not install this guard. Its separate review bundle includes the
managed frontend, native classes and interactive installer. Only its four
declared workflows use server-owned approvals and persistent receipts; it does
not impose a server safe mode on every workspace or other IRIS interfaces.

## Final local evaluation package

The corrected review bundle C passed fresh installation, strict TLS/public-only
certificate preflight, all four bounded native workflows, interruption/restart
and authenticated desktop/mobile checks. It includes a guided installer and
judge walkthrough. Source checks pass 269/269; Linux log-reader regression passes
20/20. The final audit's four confirmed defects have been corrected and tested.
See the [current report and exact artifact hashes](../../docs/final-audit-remediation-20260927.md)
and [judge guide](package/judge-guide.md).

Published as an optional evaluation package with 1.3.0, **not production-ready**.
The immutable review ZIP and audit reports retain their pre-publication labels.
Active real-user administration, all-workspace migration and in-place
upgrades are not included. Native identity, browser CA trust and explicit target
enrollment remain administrator setup steps.
The new validation engine was suspended/stopped, preserving all data and the
previous project instances. [Candidate B](../../docs/judge-review-candidate-20260927.md)
and historical NOT READY entries below describe earlier
milestones; their artifacts have not been rewritten or relabeled.

## Historical milestone: enrolled-user portable clean installation verified

See [user-package-validation-20260927.md](user-package-validation-20260927.md):
a new versioned ZIP installed on fresh IRIS without runtime overlays, all four
guarded workflows, real limited-operator HTTP and desktop/mobile interaction,
interruption/restart recovery, native integrity and 245 passing Node tests.
The original [UI milestone](user-ui-validation-20260927.md) is retained as history.
Earlier packages and public 1.2.1 are unchanged. The new laboratory was suspended
and stopped without deleting its data. Next is release-scope/documentation review,
not another clean-install gate. Status remains NOT READY / UNPUBLISHED; this does
not migrate every management workspace or support arbitrary live-user editing.

## Historical milestone: enrolled-runtime faults, replay and transitions verified

Human-onboarding follow-up: [certificate preflight](onboarding-preflight-validation-20260927.md)
now passes with 220 Node tests, strict CA/IP/date validation, public-only export
and real rejection by a browser without exceptions. No trust or accounts changed.
User approval and a user-performed trust decision in a new isolated Firefox profile
are still pending; do not describe human login as completed.

The same independent ZIP now passes the expanded interruption gate on fresh IRIS:
eight wallet/web-app fault cases, same-session replay without a second native PUT,
recovery preserving UNKNOWN, concurrent lifecycle rejection, interrupted activation,
dispatcher replacement/return and instrumented restart. All 216 Node tests pass.
An outdated test-helper signature was corrected; distributed runtime bytes did not
change. See [fault evidence and precise upgrade limits](enrolled-fault-validation-20260927.md).

Human TLS trust/identity onboarding and final release audit remain pending. This
does not establish a customer schema upgrade or all possible failure positions.
Nothing was published; test engines and their data are retained, stopped.

## Previous milestone: independent enrolled-target ZIP clean-installed in real IRIS

The new experimental `portable-enrolled-pilot-1` bundle was built from current
source, zipped, independently extracted, verified and installed in a fresh owned
IRIS container without runtime/frontend overlays. All 215 Node tests pass; the
clean installation passed 45 native policy assertions, real HTTP/browser changes
on both workflows, stale/revoked-target rejection, native restoration, restart
recovery, strict TLS HTTP checks, asset hashes and database integrity.

The test engine is suspended/stopped with all data retained; the original lab and
old m/c packages remain unchanged. See [artifact hashes and full clean-install
evidence](enrolled-clean-validation-20260927.md). This is not a public 1.3 release.
The later interruption/dispatcher gate is documented above. Human trust/login
onboarding and a final release audit remain pending. Only two workflows are
server-guarded; an in-place customer schema upgrade remains unverified.

## Previous milestone: enrolled targets integrated and exercised through the real UI

The experimental dispatcher, recovery and browser now use the administrator's
enrolled targets/resources rather than hardcoded probe names. The final run passed
212 Node tests, 45 native enrollment assertions, HTTP mutations on two distinct
target sets, stale-preview and revocation checks, real browser execution in both
workspaces, restoration, restart recovery and native integrity checks.

A real casing/permission-alias mismatch in wallet inventory prevented opening the
editor; it was fixed and the expanded gate repeated successfully. See
[complete evidence, failed attempts and release limits](enrolled-integration-validation-20260927.md).

That run used a development overlay. The clean-install milestone above now has
its own experimental artifact; the old m/c artifacts remain unchanged. Human
trust/login onboarding and renewed fault/upgrade regression are still required.
Other workspaces are not migrated. No commit, push or publication occurred.

## Previous milestone: staged target enrollment validated natively

On 2026-09-27 Brussels time, a terminal-only `TargetPolicy` component passed 41
native assertions plus a restricted-identity check, real restart, native-state
preservation and integrity checks in a new disposable IRIS instance. The existing
204 Node tests remain green. Enrollment requires native administrative permissions,
a suspended deployment, fresh metadata and exact confirmation. Revocation retains
objects/history and changes the authorization generation without enabling writes.

At that earlier milestone HTTP execution/recovery and browser contracts still
used fixed lab targets. The integration above supersedes that local-source status,
but the new class is still absent from the immutable portable c ZIP and public
package. Human trust/login onboarding remains pending.

See [native evidence and failed attempts](target-policy-validation-20260927.md)
and [integration/access design](target-policy-design-20260926.md). All four new
policy-test engines are stopped; data is retained. Public files and portable c
are unchanged. No commit, push or publication occurred.

## Previous milestone: portable source bundle and live regression verified

The source ZIP now includes its runtime, dependency-free Node operator and
instructions. It builds from a digest-pinned official IRIS base and generates
new laboratory certificates in its own private volume; it no longer requires
the original checkout, candidate-m image or previous certificate volumes.
Node and Docker remain prerequisites. Initial registry retrieval on a fresh
host has not been tested; the official base was cached on this host.

204 Node tests pass. The final c archive was extracted and verified with filesystem
read permission limited to that directory, then built and installed on real IRIS.
Both allowlisted synthetic changes, independent native readback/restoration,
session renewal, lost-response behavior, restart recovery, integrity and real
desktop/mobile UI checks passed. The three new pilot engines and certificate
helpers are stopped; all their data is retained and the original lab still runs.

Packaging validation now rejects extra runtime files, including unlisted test
classes. The initial functional runner used targets outside the deliberate
allowlist and was safely refused; the corrected runner did not widen server
permissions. See [portable evidence, exact ZIP and outstanding release gates](package/portable-validation-20260926.md).

This is a transportable **laboratory pilot**, not a general production server:
only `IrisOps_GuardProbeWallet` and `/csp/irisops-guard-testweb` are eligible.
Human credential/trust onboarding and real-target policy remain unresolved for
a general release. No public README/version, commit, push or publication changed.

## Previous milestone: guided fresh-pilot installation and suspension verified

The terminal operator now produces an expiring review plan, requires its exact
fingerprint, and repeats environment checks before creating a new isolated lab.
It pins candidate m, verifies its files and TLS, and bootstraps READ_ONLY only.
Ownership checks bind subsequent actions to the exact new container and volume.
Nothing is deleted or published. This is not a general customer installer.

193 Node tests pass. Real IRIS checks cover installation, six rejected operator
requests, desktop/mobile navigation, a controlled partial failure before
bootstrap, and suspension/stop with all data retained. Both new engines are
stopped; the original development engine remains running with the same ID.
No new authenticated workflow regression was performed in this block: the
unchanged m runtime's earlier 31-group regression remains the reference below.

See the [operator guide](package/pilot-operator-guide.md) and
[validation evidence and limits](package/pilot-guided-validation-20260926.md).
General release remains NOT READY; local prerequisites and two-workflow scope
still apply.

## Previous milestone: browser-cache migration and rollback verified

The warm-cache gate found a second P2: j -> k could leave old HTML/app/CSS in the
browser; normal reload still retained the old CSS. Rolling back could likewise
leave newer frontend files visible. Native configuration and historical receipts
were intact. Candidate m fixes the changed stylesheet identity and prevents
storage/conditional reuse of newly fetched managed HTTPS static responses.

Twenty desktop/mobile migration observations, six upgraded startup scenarios,
and 183 Node tests pass. A separate clean-browser check confirms exact bytes and
no-store on all 17 requested UI files over repeated navigation/reload, with
caching enabled and zero cache hits. The legacy transition still needs a versioned
entry or forced reload; new headers cannot purge already cached old responses.
The unchanged legacy modules reused in the first transition were hash-verified.

See [cache defect, exact m candidate, evidence and operator procedure](package/upgrade-cache-validation-20260926.md).
The original source was cloned read-only and rehashed unchanged; the three new
migration engines are stopped, four historical receipts and configuration remain
intact. This tests exact frontend/cache-policy replacement, not a schema/IRIS
upgrade. Full fresh-install mutation/session/certificate regression on m passed
31 grouped checks, including real clocks, TLS negatives, certificate rollback,
independent readback and four receipts recovered without replay. All six new
functional-test engines are stopped; their own fixtures were removed and their
receipts/data retained. No commit, push, public README/version or publication has changed.
General release remains NOT READY; the guard is still a two-workflow pilot.

## Previous milestone: startup readiness repair and complete regression

Candidate k closes the early-click P2 found in candidate j. Initial controls stay
disabled inside an inert root until imports, listeners and the first render finish.
Slow or failed imports show an explicit blocked state with manual reload; a late
import cannot reopen the application after the 15-second timeout. Initial labels
are neutral rather than prematurely claiming a healthy demo connection.

181 Node tests, six real-browser startup scenarios and 30 grouped real-IRIS checks
passed. The live groups repeat the complete HTTPS, actual-clock renewal/expiry,
restart, certificate replacement/negative cases and rollback regression; they are
not 30 distinct administrative operations. Both limited guard workflows still
produce independently checked results, and all four receipts recover without
replaying a change. Desktop/mobile and the separate ordinary demo were reviewed.

See [startup repair, exact candidate and evidence](package/startup-validation-20260926.md).
All six new engines are stopped; their data and certificate volumes are retained.
The original 52801 lab and previous references are preserved. Only seven owned
synthetic fixtures were removed from the new successful lab. No public release,
commit or push occurred. General release remains NOT READY: this is still a
two-workflow pilot, not a migration of the whole product or production deployment.

## Previous milestone: certificate replacement and rollback; startup issue found

The unchanged j runtime passed trusted certificate/key replacement, strict
rejection of wrong-identity/expired/untrusted certificates, and rollback to the
exact original certificate on real IRIS. Historical results survived; two new
post-rollback operations were independently verified and restored. Four receipts
recover without mutation replay. 177 Node tests and 29 grouped live checks passed,
including full real-clock renewal/expiry and desktop/mobile browser checks.

See [certificate validation, failed attempts and limitations](package/tls-certificate-validation-20260926.md).
The complete final attempt e and all earlier attempts are retained stopped;
original 52801 and previous backups/labs remain preserved. No runtime/product
source or public release changed. Only reproducible fixtures in successful new
test labs were removed; failed-attempt fixtures remain. Certificate rotation uses
a clean stop, not hot reload, and keeps
the original private certificate volume for rollback.

**P2 startup usability issue found in candidate j (fixed in k above):** connection buttons were enabled before the
guard's dynamic imports finish, so an early click can be lost; the static page
can also briefly display its default demo label. A read-only controlled browser
probe reproduced this without credentials or API calls. Functional certificate
tests waited for actual guard initialization; that workaround did NOT fix j.
The subsequent k gate above implements and tests the actual repair. Earlier j
artifacts/evidence remain unchanged. General release remains NOT READY.

## Previous milestone: combined HTTPS, renewal and durable recovery

The exact validated TLS/renewal runtime now also passes same-image container
replacement and cold backup/restoration into independent storage on real IRIS.
Old sessions, renewal IDs, write channels and pending previews are rejected;
fresh native authentication recovers the retained results without replay.
Two additional operations on the restored copy were independently verified and
restored, leaving four proof-bound receipts. Native application-DB integrity
checks and actual desktop/mobile browser review passed before/after restoration.

174 Node tests and 24 grouped live checks passed (the latter include repeated
browser groups, not 24 different operations). See
[combined validation, exact archive identity and limitations](package/tls-durable-validation-20260926.md).
The three new engines are stopped; the final copy is SUSPENDED and its synthetic
fixtures removed. Source checkpoint, archive, private certificate volume,
original 52801 and all prior labs remain preserved. No runtime/product changes
were needed for this gate; no public files, commit or publication were changed.

Still NOT READY for general release. This is clean-shutdown, same-image,
same-host recovery and reuses the retained certificate. The archive stays in a
private Docker volume, is NOT encrypted and is not a public release asset.
The later certificate gate above covers replacement/failure handling and rollback
within its stated scope. Encrypted off-host backup with independent key recovery
remains unverified, separately from the new startup-interface finding.

## Previous milestone: explicit bounded session renewal

The managed HTTPS pilot now exposes an explicit renewal button. It uses native
IRIS refresh, keeps upstream credentials encrypted on the server, cancels both
workspaces' old channels/previews, and always returns to read-only. It never
retries a change or renews automatically. The original five-minute session-family
deadline cannot move, and native expiry still requires renewal before about 59
seconds in the tested configuration. Expired authorization requires login again.

174 Node tests, 14 native custody assertions and 16 grouped live checks passed
in a fresh Community IRIS 2026.2 TLS lab. Real clock expiry, permission revocation,
lost renewal response in the real browser, desktop/mobile review, logout and
restart/recovery passed. See [renewal validation and limitations](package/renewal-validation-20260926.md).

The report also discloses a corrected time-comparison defect and a test-harness
diagnostic that exposed disposable session headers in failed attempt i. That
instance was stopped and must not be casually restarted. The successful j run
used fresh credentials and protected diagnostics. j is SUSPENDED/stopped with
its temporary fixtures removed; original 52801 and all backups remain intact.

Still NOT READY for general release. The combined gate above now covers this
HTTPS package with persistent storage and same-image replacement/restore.
No public README, release version, module.xml, commit or publication was changed.

## Previous milestone: HTTPS and native-expiry-bounded sessions

A new isolated TLS package was built and installed on real Community IRIS
2026.2. TLS 1.2/1.3, native secure cookies, exact-origin controls, server READ_ONLY,
both genuine reversible mutations, logout and restart/recovery passed. The
browser was reviewed at desktop/mobile sizes. 166 unit tests and nine grouped
live checks passed; see the [TLS validation report](package/tls-validation-20260926.md).

The long-duration test found a real defect: native IRIS tokens expire in about
60 seconds, while the first TLS candidate advertised five minutes. This is now
fixed: custody and UI deadlines respect the native absolute expiration with a
safety margin. The five-minute ceiling does **not** mean a usable five-minute
session. That checkpoint had no token renewal or write replay. The explicit
renewal addition above supersedes that earlier session milestone; there is still
no automatic refresh or administrative write replay.

The new TLS reference f is SUSPENDED/stopped and retained; original 52801 and
all backups are preserved. No Windows trusted roots or public files/version were
changed. This uses a test certificate and bundled private web server, not a
validated production gateway. The later combined gate above covers durable
storage with this TLS topology; certificate lifecycle and full-product migration
remain open. NOT READY still applies.

## Previous milestone: cold backup and independent-volume restore

The retained durable source g was never started or modified. A read-only cold
archive was exported outside Docker and this checkout, then restored into new
storage. The restored installation starts without Bootstrap reinstallation and
both application databases pass native IRIS integrity checks. A second checkpoint
contains two new real verified operations plus the two historical receipts; a
second independent restoration preserves all four. Fresh native login and the
correct per-operation proofs recover the new results without replay. Wrong proofs
are rejected; prior authorization does not survive restoration.

See [cold-backup validation, archive identity and limitations](package/cold-backup-validation-20260926.md).
Seven live check groups, 160 unit tests and actual desktop/mobile review passed.
The source's logical file bytes and metadata match before/after. All new engines
are stopped and retained. Archives include native account data: they are local,
outside Git, NOT publication assets and NOT encrypted/off-site backups. Same-image
restoration is not a cross-host disaster recovery or package upgrade test. The
experimental guard remains NOT READY for production/publication.

## Previous milestone: durable same-image container replacement

The exact clean-install reference image now has real validation with a NEW named
volume mounted at `/durable` and native `ISC_DATA_DIRECTORY=/durable/iris`.
After cleanly stopping container A, a distinct container B reused that volume.
Namespace, private database mappings, deployment generation and both genuine
operation receipts survived without reinstalling. Old authorization/grants and
an unexecuted preview were rejected; fresh native login recovered the original
receipts without changing their dispatch count or reapplying the changes.

See [durable replacement validation and operator rules](package/durable-replacement-validation-20260926.md).
Six live check groups, actual desktop/mobile browser review and 160 unit tests
passed. The two new reference containers and their volume are retained stopped;
the pre-existing labs and public version are untouched. Same-image replacement
is not backup/restore, a version upgrade, crash recovery or production readiness.
That milestone's next storage gate was a verified cold backup and restore to a
separate volume; the later evidence above covers it within its stated lab scope.

## Previous milestone: clean-instance package and bootstrap

The guard can now be installed from a hash-checked, explicit runtime bundle on
a fresh upstream IRIS Community 2026.2 container, without the previously prepared
IRISOPS namespace or receipt database. The bundle excludes fault/test dispatchers.
Its installer creates private journalled stores, mappings and a READ_ONLY managed
application, refuses collisions, and performs no changes on a valid repeat install.
The managed UI accepts a separately configured loopback port; the server owns the
exact allowed origin. Original prepared-lab profiles retain their fixed boundary.

See [clean-install validation](package/clean-install-validation-20260926.md) and
[package operator guide](package/README.md). Current evidence: 160 unit tests,
9 clean-install live check groups plus a separately injected late-install failure,
real browser inspection and actual restart. Production readiness remains false:
At that milestone, HTTPS, production sessions, durable container replacement and
upgrades remained open; the separate replacement evidence above advances only
the same-image replacement boundary.
The original 52801 laboratory was not modified; new test containers were preserved
and stopped. No release, public metadata or package version was changed.

## Previous milestone: reversible lab deployment and generation-bound sessions

The separate `/api/irisops-managed-guard` profile adds administrator-controlled
READ_ONLY / ACTIVE / SUSPENDED deployment states. Registration starts read-only.
Changing mode or dispatcher invalidates previous authorizations; reactivation
does not reinstate operation write grants. Interrupted installation can only be
recovered to a suspended state, without deleting receipts or deployment history.
These controls are enforced by the managed server, not just disabled buttons.
They do not constrain an administrator using IRIS directly or the old profiles.

See [bounded design](deployment-design-20260926.md),
[operator and recovery guide](deployment-operator-guide.md), and
[real validation and remaining gates](deployment-validation-20260926.md).
The current JavaScript suite has 157 tests. Live installation, interruption,
restart and desktop/mobile results are in `deployment-evidence.json` and
`managed-ui-evidence/result.json`. This is a prepared-namespace laboratory
installer, not a supported IPM/HTTPS/general-target production deployment.

## Previous milestone: one login, two independently guarded workspaces

The new opt-in `/csp/ops/guard-combined/web/index.html#secrets` profile uses
`/api/irisops-combined-guard`. Wallet and Web applications share native identity
and logout, but not write channels, approvals or private recovery stores.
Only the same two disposable targets are allowed. The old probes and both
separate profiles are preserved. This is not a general production migration.

See [design and acceptance gates](combined-design-20260926.md) and
[validation status](combined-validation-20260926.md). That milestone had
152 unit tests; real combined evidence is recorded in `combined-evidence.json`
and `combined-ui-evidence/result.json`. A success in this isolated pilot must
not be advertised as server protection for the entire published application.

## Previous milestone: second guarded operation, webapp availability

See [implementation, real validation and limits](webapp-progress-20260926.md).
Only the disposable `/csp/irisops-guard-testweb` is eligible. The separate
`/api/irisops-web-guard` application uses the same current-user HTTP transport
principle and hardened execution lifecycle. The native request changes only
Enabled; before dispatch and on readback, all returned configuration is checked
through a canonical digest. Recovery remains read-only and retains UNKNOWN.

The actual main UI is used at the explicitly isolated
`/csp/ops/guard-webapp/web/index.html#webapps` profile. Other workspaces do not
fall back to the browser native client. The lab fixture is removed after tests;
this URL is not an installed production feature or a permanent customer demo.

At that milestone the unit suite had 142 tests. Live evidence and completion flags
are recorded in `webapp-execution-evidence.json` and `webapp-ui-evidence/result.json`.
Real runs cover concurrency, stale/missing targets, revocation, worker exits,
lost responses, expiry, restart, unchanged historical receipts and desktop/mobile
layout. Unknown results are not silently reclassified as successful.

This does not migrate the whole product. General targets, installation/upgrade,
HTTPS/session lifecycle, multi-instance management and atomicity against external
native clients remain outside this validation. No public version was changed.

## Previous milestone: main-interface wallet integration

**Wallet remediation baseline:** the six findings from the
[2026-09-25 adversarial audit](audit-report-20260925.md) are corrected in this
local pilot. See [remediation and evidence](remediation-validation-20260926.md):
133 JavaScript tests, 68 combined real-IRIS check groups (including 15 main-UI
groups), and 38 transport/custody checks. These are not coverage percentages.
The guard remains **NOT READY for public release**: broader operations,
production deployment and lifecycle gates have not been completed. No Web apps
operation was added or public version changed in this correction.

The development frontend now reuses its real wallet and confirmation dialogs
with the guard, receipt recovery and a journal. The isolated profile disables
the native browser client and clearly marks other workspaces unavailable.
See [integration validation](integration-validation.md) and
`wallet-integrated-evidence.json`. It is wallet-only, lab-only, not a production
safe mode or a migration of all workflows.

## Previous milestone: disposable wallet execution

**Subsequent milestone:** read-only receipt recovery, actual request-worker
interruption tests, and a separate experimental browser screen now exist.
See [recovery validation](recovery-validation.md) and `wallet-ui-evidence.json`.
Neither this milestone nor the wallet prototype is integrated into the published
product. The latest pilot requires a separate recovery proof per operation;
username and permissions alone cannot recover old receipts. See the possession,
account-lifecycle and deployment limits in the recovery report.

See [wallet validation](wallet-validation.md) and
`wallet-execution-extended-evidence.json` for the executed tests and limitations.
Only `IrisOps_GuardProbeWallet` and two disposable policy resources are eligible.
The server checks its own channel and preview, stores a dispatch reservation,
issues one native PUT, reads back both policy fields and retains an operation
receipt. Failed readback is UNKNOWN, never an automatic retry.

Real tests include stale-preview rejection with zero PUTs, concurrent requests,
revocation, cancellation, deleted target, storage denial, genuine preview expiry
and receipt preservation across a restart of the named lab. The interrupted
DISPATCHING fixture is synthetic, not a real crash during a write.

Run `verify-wallet-execution.mjs` with `IRISOPS_DOCKER_EXECUTABLE` set explicitly.
Set `IRISOPS_EXTENDED_WALLET_TEST=1` for expiry and restart evidence. Do not run
any integration runners concurrently: they share collision-checked fixtures and
temporarily instrument the lab's native API. The subsequent pilot adds a separate
screen and recovery routes, not full product integration or a production installer.

## Update: authorized HTTP transport now implemented

The internal adapter described below remains a preserved negative experiment.
After explicit user authorization, a **separate fixed-loopback HTTP adapter**
was implemented. See [custody design](http-custody-design.md) and
[validation report](http-validation.md). It authenticates as the current user,
seals the access token on the server and uses the official SysAdmin HTTP route.
Its endpoint is `/api/irisops-http-guard`, not the old internal probe.

Do not run integration scripts simultaneously: they deliberately use
the same collision-checked fixture names and temporary source-app fault tests.
`verify-read-transport.mjs` still exits 1 for the rejected internal approach;
`verify-http-transport.mjs` is the positive HTTP transport suite.

To include actual expiration and an actual restart of **only the named lab**,
set `IRISOPS_EXTENDED_GUARD_TEST=1` before running the HTTP suite. These runs
produce `http-transport-extended-evidence.json`. Standard runs produce
`http-transport-evidence.json`. Both explicitly keep `featureReady: false`.

The browser UI, full mutation catalogue, IPM packaging, HTTPS deployment and final
product review remain incomplete. The native
CSP trust boundary and lack of protection against a privileged memory/session
database reader remain explicit.

## Isolated validation target

- Checkout branch: `feature/iris-server-guard-20260925`.
- Container: `iris-ops-guard-dev-20260925`, loopback port 52801.
- Immutable container ID:
  `d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
- Image ID: `sha256:5c02f86186a42aad59c7c32b00b7d64feb015104edd5b03f9d00907191a22f0c`.
- No host bind mounts or existing production volume attached by the launch command.
- All commands are pinned to this container. The runner rejects another ID.

## Historical internal read probe: implemented and observed

The read-only REST probe compiles in real IRIS. Native CSP authenticates the
fixture account and returns an HttpOnly cookie; subsequent cookie-only requests
retain that account without any SysAdmin JWT in the guard response. The server
defaults to read-only. CSRF/origin checks protect logout; logout invalidates the
observed session. Unknown wallet mutation verbs are rejected by the route map.

`read-transport-evidence.json` records nine completed grouped checks and one
**failed acceptance gate**. These groups are not nine completed entries of the
full product acceptance matrix. In particular, rejecting all writes in a probe
with no write routes is NOT proof that a future mutation engine is safe.

The existing application also passed all **103 JavaScript tests**, plus the
syntax checks from `npm run check`, executed directly with the bundled Node
runtime because `npm.cmd` was unavailable. Python tests, visual QA, HTTPS cookie
configuration, session expiry/licence release and production upgrade were not
validated in this milestone.

## Historical finding: A02, internal transport is not permission-equivalent

With only `%Admin_Wallet:U` and `%DB_IRISOPS:R`:

| Request | Observed result |
| --- | --- |
| Official SysAdmin wallet read | HTTP 200 |
| Read-only guard, same user | HTTP 503, generic `transport_unavailable` |

Three distinct experiments narrowed the cause:

1. Switching from IRISOPS to `%SYS` under the limited user raises `<PROTECT>`.
2. Hosting the dispatcher in `%SYS` initially required the default page/database
   access check. An explicit authenticated REST `AccessCheck`, like the official
   dispatcher uses, allows session creation without granting database rights.
3. Mapping **only our own** `IrisOps.Guard` package from IRISOPS into `%SYS`
   does not solve the remaining problem: fetching `/api/admin` configuration
   through `Security.Applications.Get` raises `<PROTECT>` for this operator.

The configuration check is required to preserve the original application's
enabled/resource/authentication boundary. It has **not** been removed. We have
not granted `%Admin_Secure`, `%All`, or additional system database permissions
to make the test pass. Detailed diagnostics used locally during development
were removed from HTTP responses before the final run.

Independent positive control: with the same native SysAdmin token, revoking
the fixture role's wallet permission changes HTTP 200 to 403; restoring the
permission restores 200. This supports evaluating the official HTTP route as
an alternative; it does not yet validate a server HTTP adapter.

## Historical gate decision (HTTP alternative subsequently authorized)

Do not implement administrative mutations on top of the failed internal adapter.
Do not turn a native permission check into a privileged bypass. Keep this
executable negative result as evidence, not as production transport.

Recommended next design decision: fixed-loopback HTTP to the official API,
using **the current user's** token held only on the server. This introduces a
new sensitive-state custody requirement and must be explicitly agreed and
designed before implementation:

- no administrative service account and no browser-readable SysAdmin token;
- fixed instance target, no user-selected host/path/headers or redirects;
- no plaintext token in diagnostics, receipts, exports or ordinary globals;
- bounded lifetime, logout/revocation cleanup, controlled refresh and no write retry;
- explicit storage/encryption design for CSP sessions crossing worker processes;
- instance restart must not reconstruct an authorization from durable receipts;
- verify that native application denial and permission revocation still apply.

Do not introduce token custody implicitly as a workaround for this failed gate.

## Repeat the probe

With Node 22+ and Docker permission, set `IRISOPS_DOCKER_EXECUTABLE` to the
Docker executable and run `node experimental/guard/verify-read-transport.mjs`.
An **exit status of 1 is currently expected**, because A02 remains failed.
The JSON artifact explicitly reports `ready: false`; a completed probe is not a
successful feature implementation.

The runner creates only collision-checked `IrisOps_GuardProbe*` account, role,
resource and wallet fixtures, then verifies their removal. It verifies the
native application's known baseline before any temporary configuration tests
and restores that baseline in `finally`. It retains the lab app, mapped package
and two experimental classes for diagnosis. Early unsuccessful experiments also
left our own prototype class definitions in `%SYS`; they are not production
classes and no broad cleanup has been attempted.

## References

- [Native REST authentication and authorization](https://irisdocs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GREST_securing).
- [Package mappings](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=RACS_Package).
- Runtime inspection of `%Api.Admin`, `%Api.Admin.Dispatch.v2`, and
  `%Api.Admin.Endpoints.Wallet.Collection` in the named isolated instance.
  These internal classes remain version-dependent, not a public extension API.
