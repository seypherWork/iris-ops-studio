# Clean installation validation — 2026-09-26

Status: CLEAN-INSTANCE PACKAGE VALIDATED WITHIN THE LAB SCOPE.
Still NOT READY for production or publication. Public baseline 1.2.1 unchanged.

## Reference and provenance

- Base: installed IRIS Community 2026.2, image
  `sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.
- Artifact e: content manifest
  `fb369cd54e365a1069bb2946b8b86f395a3a83bc5770e65b7cf37716690fc2cf`.
- ZIP: `irisops-guard-clean-install-lab-20260926-e.zip`, SHA-256
  `F0CE63DCF621CF759ECDB55E0172A342A988B35A7D464BF3F37315E4FBD03EFA`.
- Clean reference container: `iris-ops-guard-clean-20260926-e`, ID
  `08a583220056cf85c3dab431e370488285989ecdf6e281ebab7c3e205797d30d`.
- Every one of the 34 packaged content files was hash-checked against its source,
  installed image copy and ZIP entry; sizes and exact ZIP inventory checked too.
  manifest.json is additional metadata, not a self-hashed entry or signature.

No previously prepared database, source volume, admin account from another
instance, fault dispatcher or old installed Ops Studio package was copied into
the new instance. The base's own system components remain normal prerequisites.

## Confirmed evidence

`clean-install-evidence-e.json`, 2026-09-26T16:57:44.777Z:
complete/restored/previousLabPreserved true; productionReady false.
Nine grouped checks cover:

1. Fresh base absence of IRISOPS, IRISOPSGUARD and the managed application;
   verification of all packaged file hashes.
2. Invalid origins, stale initial plan and pre-existing resource collision
   rejected before database creation.
3. Package-only creation of private journalled databases, namespace, mappings,
   storage role and READ_ONLY runtime; repeat install NO_CHANGE; test/fault
   dispatchers absent from the installed namespace.
4. Original prepared-lab origin fallback preserved; empty, nonlocal and malformed
   installed origin configuration fails closed.
5. Real current-user native login on 52802. READ_ONLY denies write enabling;
   wrong Origin and actually transmitted wrong Host are rejected.
6. A stale reinstall against an ACTIVE installation rejects without disabling
   its service or invalidating its current native authorization.
7. Both real guarded operations return VERIFIED and match an independent native
   readback. The entire initial webapp detail and wallet policy are restored.
8. Packaged UI at actual 1440x900 and 390x844 viewports, both workspaces,
   server-readonly controls, cleared password field, no page exceptions and no
   browser requests to the direct native administrative API.
9. Actual restart of the new container, invalidation of prior authorization,
   fresh login and recovery of both original operation receipts without replay.

`clean-ui-e/result.json` has complete true, pageExceptions 0 and directNativeRequests
0. Both screenshots were manually reviewed: readable layout, usable navigation,
no horizontal page overflow and visible explanation of disabled write controls.
Transient toast text can overlay help text while visible; not a secret field.

`bootstrap-failure-single-evidence.json`, 2026-09-26T17:02:18.562Z:
complete true, namespaceRetained true, routeDisabled true, collisionPreserved
true. A terminal-only, separately loaded test subclass inserts a real native UI
application collision AFTER runtime compilation. The installer then fails its
native create, disables its own guard, preserves the conflicting application
and partial databases, writes no success marker and rejects blind re-adoption.
The test subclass is NOT in the artifact. This is an injected late failure, not
a successful two-process concurrency test or automatic recovery of partial setup.

The earlier two-terminal version hit LICENSE LIMIT EXCEEDED during compilation;
its evidence remains incomplete. No licence limit or licence configuration was
changed. Repeating the late-failure boundary in one session passed.

160/160 JavaScript tests passed, including package inventory/hash determinism
and managed-origin UI validation. All 44 JS/MJS files in web, mock and the guard
experiment passed syntax checks. These counts are not coverage percentages or
proof of absence of all defects. Older full live suites were not rerun against
the untouched 52801 installation; their earlier results remain historical, not
new evidence for this package. The current new-instance checks exercise the
changed installer/origin boundary and both existing operation engines.

## Findings corrected in this step

- Raw `FROM sha256:...` was interpreted as an image repository by BuildKit.
  The verified local base tag with no pull is used instead; original images kept.
- `qlist` running alone did not mean a terminal was ready. The runner now waits
  for an actual successful native terminal command before attempting installation.
- An ObjectScript comparison needed parentheses around the concatenated database
  resource name; it previously rejected valid private journalled databases.
- Failure cleanup must only run AFTER this invocation started creating resources.
  A changed flag prevents a stale reinstall from disabling an existing service.
- A success marker is now written only after final validation; full native static
  UI configuration is fingerprinted to detect subsequent drift.
- Both frontend controllers still assumed port 52801. The explicitly managed
  profile now accepts canonical loopback ports, while old profiles keep their
  original bound. The server independently uses its installer-owned exact origin.
- The optional ManagedNextApi failure dispatcher was an accidental dependency
  of SourceStamp. It is no longer required or packaged; present test builds still
  contribute their revision stamp in the older prepared laboratory.
- Node fetch discards a supplied Host header. A local echo probe demonstrated it;
  the negative test now uses a fixed-destination native HTTP socket to send it.

## Preservation and final state

The original container `iris-ops-guard-dev-20260925` retained its ID, running
state, deployment JSON and receipt count (743) through the clean-install tests.
Its runtime classes were not replaced. Public README.md, package.json and
module.xml remain unchanged; no commit, push, publish or public version bump.

Source backup: sibling `iris-ops-guard-pre-clean-install-20260926`, experimental/
and web/ copied before editing with selected hashes checked. Source originals
were not moved/deleted. New source changes are limited to bootstrap/packaging,
origin handling, the optional class dependency, tests and documentation.

Final independent inspection of container e found SUSPENDED / managed-lab-a,
native Enabled = 0, two retained operation receipts and no temporary test user,
role, wallet or webapp. The runner also removed its three disposable resources.
The container was then stopped, not deleted. Other new attempts b/c/d and both
late-failure labs were preserved stopped for diagnosis. No disk, volume, project
directory or historical receipt was deleted. Removed test fixtures are recreable
by their runners; they were never customer data.

## Remaining gates

This completes **fresh installation from a bounded runtime bundle**, not the
whole production deployment story. Still required:

- Durable engine/configuration persistence across container replacement and
  verified backup/restore, not merely restarting the same container.
- HTTPS with verified certificate/cookie topology; realistic, bounded sessions.
- Supported package update/schema migration and inspection-driven repair of a
  partial bootstrap. Partial objects are deliberately not auto-deleted or adopted.
- General target policy, integration of remaining operations, final artifact
  review and a separate publication decision.

Only the same two disposable targets are eligible. Native administration outside
this managed route remains outside its protection. No claim of multi-instance
management, exactly-once native delivery, atomic external compare-and-swap, or a
guaranteed contest result is made.

See [operator guide](README.md) for the exact package and safe installation steps.
