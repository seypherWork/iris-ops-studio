# Enrolled-user portable package — clean-install validation

Status: **EXPERIMENTAL / NOT READY / UNPUBLISHED**.
**Clean-install laboratory gate PASSED.** All three result files report
complete=true; the parent reports developmentOverlay=false, faultInjection=true,
originalIdentityPreserved=true and stopped=true. This is not production readiness.

## Immutable artifact

New source bundle: `../irisops-guard-enrolled-user-20260927-a`.
ZIP: `../irisops-guard-enrolled-user-20260927-a.zip`.
Independently extracted test input: `../irisops-user-extracted-20260927-a`.
Paths here are relative to the repository root.

- ZIP SHA-256: `0E31696CED792F9649721760CE3BEE520B503062457D3FBAF368C59170EC81C3`.
- Bundle: `0c7eb3bdf13d099011b0767b89aac11c879c4ad6d675470d4e3dd21dace99f56`.
- Runtime: `0a07045572889326e416d4379a65800577d3f1f18458be326968311543e76703`.
- Versioned profile: `portable-enrolled-user-pilot-1` / `enrolled-user-v1`.
- 52 manifest entries plus bundle.json; 45 runtime files including 25 normal
  classes. Four new user classes; no test/fault helpers in the artifact.
- Official IRIS Community 2026.2 image remains pinned by digest.

The older role bundle B was independently reverified against its own manifest:
`0bffa54b942afe9880c1239d2092b3287df91e5458b0db44d47357e41af8603c`.
It was not replaced. Historical runtime profile counts are unchanged.

## Test instance and evidence

New container `irisops-pilot-clean-enrolled-20260927-h`, loopback HTTPS 52814,
ID `5be7b0b48e026fdf79b33eb3917f5cd7808a46548ffadc998bcd63e32996a836`.
Fresh data and certificate volumes; no reused project database or certificates.
No private key exported or host/browser trust store modified.

Evidence roots:

- `../irisops-enrolled-clean-20260927-h`: preparation/installation/stop receipts,
  baseline UI captures, interruption evidence and final result.
- `../irisops-role-ui-validation-20260927-clean-user-h`: role browser captures.
- `../irisops-user-native-20260927-clean-h/result.json`: native membership and
  simulated-session interruption cases.
- `../irisops-user-http-20260927-clean-h`: authenticated HTTP, browser and cleanup.

The clean installer loads exclusively the extracted runtime. Subsequent fault
tests install separate test-only helper subclasses, never replace runtime
classes, and verify installed runtime file hashes after the child test stages.
These helpers remain only in the disposable stopped test database, not the ZIP.

## Verified outcomes

- New immutable image built from the extracted ZIP, no runtime overlay, exact
  class inventory compiled and installed hashes verified before/after testing.
- Fresh native bootstrap starts READ_ONLY; repeat plan is NO_CHANGE. Native
  admin/portal routes are blocked on the exposed HTTPS listener.
- Fresh desktop/mobile browser navigation and reload fetch exact no-store assets
  with normal browser caching enabled; no stale cache hits or startup exceptions.
- 45 native enrollment assertions, no-policy denial, foreign target rejection,
  revocation and distinct replacement-target isolation.
- Wallet and webapp changes read back from native IRIS, then restored. Changed
  web configuration yields BLOCKED/stale with dispatchCount=0.
- Eight wallet/webapp interruption cases: before dispatch, after dispatch,
  failed final receipt save and failed readback. Actual native PUT counters
  verify recovery/replay never repeat a write.
- Live operation holds its deployment lock; concurrent suspension is refused.
  Dispatcher activation failure and worker exit fail closed; rollback/restart
  preserve receipt history. Native admin dispatcher is restored.
- Role grant/revoke, stale-preview denial, restart recovery and desktop/mobile
  UI run under a separately created limited native operator; those fixtures removed.
- Disabled-user native tests reject target drift, extra membership, inherited or
  system/admin grants and enabled-account state. Synthetic-session exception tests
  exercise real native mutations/durable receipts but are not HTTP identity proof.
- Separate authenticated HTTPS/user browser tests supply that identity proof:
  READ_ONLY, revoked permission, schema/CSRF/cross-kind checks, confirmed
  assignment/removal, replay protection, actual preview expiration and restart
  recovery. Four exact temporary user-test entities are removed afterwards.
- Desktop 1440x900 and mobile 390x844 captures inspected for wallet confirmation,
  webapp state, role grant controls and user membership confirmation. Browser
  checks find no horizontal overflow, uncaught page errors, direct admin fallback
  requests or fixture credential text in sampled console/HTTP response output.
- Sampled container/native web logs contain no parent-fixture password/recovery
  proofs or private-key blocks; both guard databases pass native integrity checks.
  This is a scoped secret check, not a proof against every possible leak.
- The complete installed runtime and extracted bundle remain byte-identical
  after mutations, fault tests and restarts.

Node regression: **245 passed, 0 failed**. All commands declared by package.json
check were run with bundled Node because npm is unavailable. git diff --check
also passed. No product-runtime fix or ZIP replacement was needed in this run.

## Final laboratory state

The original three-target enrollment was restored. The new lab was suspended
and stopped via its ownership-checked installation receipt. No Docker volume,
container or earlier artifact was deleted. Baseline wallet/webapp fixtures and
their laboratory operator remain in the **stopped isolated lab**, along with
test helper classes and durable evidence. The temporary role/user workflow
operators and targets were explicitly removed by their successful runners.
The original development instance was verified unchanged/running.

## Next delivery step

Freeze this exact artifact for release-scope review and prepare the candidate's
documentation. Any distribution must clearly identify the optional experimental
guard, its four narrow workflows and disabled-user restriction. Do not claim
that the public management console is fully migrated or production-ready. A
public release still requires final user approval; no publication was performed.

## Release boundary

Evidence precision: the HTTP test waits 125 real seconds without requests and
then verifies rejection. This proves stale authorization is refused after that
inactivity, but does not isolate the idle timer from an earlier native-token
expiration. Its historical check label mentions idle expiry; do not interpret
that label as proof that the 120-second idle timer alone caused the rejection.

This is not public 1.3, not an in-place upgrade, and not universal protection of
every Ops Studio operation or native IRIS administration path. User mutation is
restricted to one explicitly enrolled disabled test account and its enrolled
role. No password editor or complete effective-access calculation is claimed.
Cross-machine installation, production TLS/identity setup and general live-user
administration remain outside this evidence. No commit, push or publication.
