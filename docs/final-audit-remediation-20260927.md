# Final audit remediation — 1.3.0 evaluation candidate C

Date: 2026-09-27. Status: **the four confirmed audit defects are closed in the
tested scope; publication is pending final approval**. This is not a zero-defect
certification or a production-readiness claim.

## Corrections and evidence

| Audit item | Correction | Regression evidence |
| --- | --- | --- |
| AUD-01, P2: canceling stop prevented retry | Every invocation revalidates engine ownership and writes a fresh, exclusive attempt directory. Declined, expired and failed attempts remain intact. | Unit cases cover decline/retry, expiry, transient failure and failed revalidation. The actual bundled wizard declined, then stopped its exact owned IRIS engine on an approved retry; old receipts and data were retained. |
| AUD-02, P2: logout claimed local keys were cleared when removal failed | Local-storage cleanup and remote logout have separate outcomes; all stores are attempted and local authorization is invalidated. Combined failures have explicit wording. | Throwing and no-effect storage, partial cleanup and simultaneous remote failure are tested. Real-browser checks at both sizes verify the warning, retained synthetic key, other keys removed, disabled write controls and zero API requests. |
| AUD-04, P3: missing startup module left an endless loading screen | A document-level watchdog works independently of module downloads. Missing/late startup shows an error with a reload link and keeps the interface inert. Late arrival cannot reopen it. | Unit tests and browser blocking/delay tests cover missing startup/app modules and startup arriving after timeout. |
| AUD-05, P3: packaged user-profile description was inaccurate | The guide explicitly identifies both user-pilot and user-review profiles, their shared runtime, and their different package inventories. | Documentation contract tests and independent bundle verification. |

AUD-03 was **withdrawn as an operational defect**, not silently fixed: IRIS's
native web-application name limit prevents the hypothetical overlong target
from existing and being enrolled. The final audit retained that distinction.

Source version metadata is synchronized to **1.3.0** in package.json, module.xml
and IrisOps.About. The version-contract test checks all three. Historic versions,
their validation records and unchanged asset cache identifiers are not relabeled.

## Exact artifact

- File: `irisops-guard-enrolled-review-20260927-c.zip`.
- SHA-256: `5AC960134DD8C27002BC163784CB76B782E7052B6E7F95C9ED3EA0407D85B36E`.
- Bundle content digest: `ac131bde2f92c4bf2a378f7f11b9f4ad50a04798f60e2738c674dad08dd20d23`.
- Runtime digest: `d5caaa06347c4215e071308fee536a9ba5c74e6e43e117d868fdb95c10f27b76`.
- Inventory: 55 package entries plus bundle.json; 45 runtime files.

This archive was independently extracted and installed, not overlaid onto an old
instance. The previous B archive remains unchanged, SHA-256
`CE756BBABEB13DA2254366D864C7C3F876789909EE34DEAFA2280616160AB540`.
The C archive is the standalone managed profile, not a full IPM/source archive.

## Measured checks

- Source syntax checks and **269/269 JavaScript tests**, zero failed/skipped;
  14 new tests since the audited 255-test baseline.
- Node experimental coverage: **77.36% lines, 78.17% branches, 73.59% functions**
  over the JavaScript reported by that instrumenter. Not ObjectScript coverage
  and not a claim of 100% functional coverage.
- **20/20 native-log Python tests** on Linux, isolated with no network and
  read-only source mounts; fixture files only, no business logs.
- **32 browser audit checks** with no reported findings or uncaught errors,
  plus **11 simulated console workflows**. Simulation is not native evidence.
- **38 real-IRIS integration checkpoints**, encompassing the four bounded
  workflows and child test suites; these are checkpoints, not an endpoint count.
- **7 additional browser regression scenarios** against the installed C assets:
  two cleanup failure modes at 1440x900 and 390x844, two blocked-module cases,
  and a late module. These seven use synthetic local proofs and no credentials
  or native administrative mutations.

Fresh engine: `irisops-pilot-clean-enrolled-20260927-l`, HTTPS port 52818,
immutable ID `4722c5b63814be39101b46b09b849cbadb085b6b935981531e6dc6625845fcfe`.
Windows host, Docker Linux containers, IRIS Community 2026.2.

The live suite covers native actor authorization, initial READ_ONLY, explicit
target enrollment, separate approvals, stale previews with zero dispatch,
permission/target revocation, native readback and fixture restoration, replay
rejection, eight wallet/web-app fault positions, concurrent lifecycle locking,
interrupted activation, restart persistence, role resources and disabled-user
membership. Recovery does not repeat a possibly completed change. Installed
runtime files remain byte-identical to the extracted package after testing.
Native database integrity passes; sampled logs contain no generated fixture
credentials. These checks do not certify every conceivable secret encoding.

The 125-second idle wait proves access was refused after that wait, not that the
120-second guard timer alone caused refusal: native authorization can expire
earlier. Test-browser certificate exceptions are pinned to the exact lab public
key; strict HTTPS checks separately verify CA, IP and dates. This is not proof
of a new user's manual trust setup.

Visual review includes the actual desktop/mobile cleanup warning, inert startup
failure screen and live wallet confirmation. The warning fits the mobile viewport;
write controls stay disabled after failed cleanup. No credentials or recovery
proofs appear in the reviewed screenshots. Role/user desktop/mobile checks are
also exercised in the live child suites.

## Evidence locations and test-harness corrections

The following are retained local evidence folders beside the checkout, not public
download URLs or required application dependencies:

- `irisops-final-remediation-20260927-b`: checks, coverage, 32 browser checks,
  11 simulated workflows, final result.
- `irisops-enrolled-clean-20260927-l`: exact install, TLS preflight, real native
  checks, faults, runtime hashes and both stop attempts.
- `irisops-role-ui-validation-20260927-clean-user-l`,
  `irisops-user-native-20260927-clean-l`,
  `irisops-user-http-20260927-clean-l`: role and user child-suite evidence.
- `irisops-final-fixes-ui-20260927-d`: final seven browser scenarios and captures.
  Earlier attempts remain intact, including the initial failed harness runs.

One harness attempt used a request transport without the browser's pinned CA;
another overlapped an intentional IRIS restart. Both failed runs were retained,
not counted as passes. The harness was corrected to let the browser perform the
TLS request, rerun while the lab was stable, and made to wait for the toast's
animation before screenshots. No product change was needed for those failures.
An initial source check correctly detected a stale version-contract assertion;
the metadata and assertion were aligned and the entire source check rerun.

After the successful stop-retry test, this exact lab was temporarily restarted
for the independent, credential-free browser checks, then stopped again (exit 0).
Its data and previous receipts remain. The original development instance and
earlier port-52810 laboratory retain their original identities and running state.
No volumes, archives or earlier project versions were deleted.

## Release boundary

Only wallet policy, one eligible enrolled web application, custom test-role
resources and one **disabled test user's** selected membership use this managed
endpoint. Standard console workspaces and other native administration interfaces
are not covered by its server READ_ONLY gate. The standard IPM module does not
install the guard: use the separate review bundle and judge's guide.

Native identity provisioning, target enrollment and CA trust remain deliberate
administrator steps. The installer does not create an operator account or enable
writes automatically. External native administrators can race changes; the
fresh check is not an atomic lock across all native tools.

Not validated: arbitrary active users, production onboarding/certificates,
second-host/OS deployment, fresh-host image download, IRIS for Health, customer
database upgrades or every crash position. Earlier videos remain version-labeled.
Do not market this as universally safe, flawless, or guaranteed to win a contest.

No commit, push, release or Open Exchange change is performed by this remediation.
Final public approval must identify the version, artifact and text to publish.
