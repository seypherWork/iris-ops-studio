# Managed guard — final local evaluation candidate

Date: 2026-09-27. **Final B validation PASSED; bounded evaluation candidate;
UNPUBLISHED.** The parent, native-user and HTTP/UI reports all show complete=true;
the parent shows no runtime overlay, fault injection, original identity preserved
and stopped=true. The stop receipt and Docker independently confirm exit code 0
with all data retained. This does not declare production readiness or a released
1.3.0.

## Deliverable identity

All artifact paths below are relative to the repository root.

- Final source bundle: `../irisops-guard-enrolled-review-20260927-b`.
- ZIP: `../irisops-guard-enrolled-review-20260927-b.zip`.
- Independent extraction used for testing: `../irisops-review-extracted-20260927-b`.
- ZIP SHA-256: `CE756BBABEB13DA2254366D864C7C3F876789909EE34DEAFA2280616160AB540`.
- Bundle: `bf285db093aaf9e0bcf475df43e5cc7cb5ca834e1c63b61f594d44adf859632e`.
- Runtime: `fc323cdd00f8b9b7d82d3404ec2dd97ea2e6e176a71395cebd8e85522d61f5c8`.
- Profile: `portable-enrolled-user-review-1` / `enrolled-user-v1`.
- 55 manifest entries plus bundle.json; 45 runtime files, including 25 normal
  guard classes. Fault/test helpers are not shipped in the runtime archive.

Use `JUDGE-GUIDE.md` inside the ZIP. The standalone bundle includes the native
runtime, managed frontend, installer and README; it does not require an older
archive, a pre-existing project image or the author's checkout. The official
Community image is pinned by digest and may need downloading.

## Corrections made in this closure

1. User membership now calls the documented native AddRoles/RemoveRoles for the
   selected role, not Modify with a replacement of the entire membership list.
   Admin option is false. The fresh eligibility/hash check and native readback
   remain; unrelated membership drift is still refused, not silently adopted.
2. Public-certificate onboarding now recognizes the optional user profile and
   is included in a distinct, exact-inventory review bundle.
3. New interactive installer displays fingerprint-bound preparation/installation
   plans, supports declining, retains receipts, checks TLS, exports only public
   certificates, and never imports trust or handles operator passwords.
4. Failed post-install certificate inspection suspends/stops only the installed,
   ownership-verified engine and retains data. This added failure branch has a
   unit test; the normal real-TLS installer path is independently exercised live.
5. A test's dependency on an older archive outside the repository was removed.
   The replacement checks historical source consistency, not unverifiable
   historical runtime behavior. A separate source copy passes without that file.
6. README/changelog explicitly separate the unpublished guard from public 1.2.1.
   The guide explains real versus demo login, target enrollment, privileged
   provisioning versus operator identity, rollback and untested boundaries.

## Automated source verification

- Exact commands making up `npm run check`, executed with the available Node
  runtime: **255/255 pass, zero skipped/failed**, including syntax checks.
- Independent source-only copies (initial 258 files; final 260 files, excluding
  historical evidence files): **255/255 pass** in both. Final copy:
  `../irisops-review-source-check-20260927-b`. This is an independence check,
  not a second-host test.
- Node experimental coverage: **77.31% lines, 77.98% branches, 73.42% functions**
  over its reported loaded JavaScript files. Not ObjectScript coverage, not every
  browser branch, and not equivalent to an earlier version's coverage figure.
- POSIX/native-log regression suite: **20/20 pass**, run in the new Linux IRIS
  container using separate temporary fixture files, not business logs.
- `git diff --check` passes. No commit, push, public release or external account change.
- The normal console's ten navigation sections also pass a separate browser
  smoke check at both widths: **20 view checks**, no uncaught page errors or
  horizontal overflow, using labeled **Safe demo** only. This is not native
  integration evidence. Evidence: `../irisops-public-review-ui-20260927-b`.

That smoke check's first attempt used an ambiguous mobile-button selector and
stopped before the mobile checks; the test selector was corrected, the failed
evidence retained, and the complete check repeated. No product change was needed.

An initial coverage run could not create its Windows TEMP directory under the
sandbox; all 255 tests passed, but coverage was unavailable. Re-running with a
writable task-local temporary directory produced the measurements above. This
was not suppressed or counted as a successful coverage run.

## Fresh IRIS evidence

Final B container: `irisops-pilot-clean-enrolled-20260927-j`, HTTPS 52816.
Immutable ID: `169e082c9bc3feb3ffa3e9fd5e1e263bc907fc7364a720f4a2f977e490e72aae`.

Evidence roots:

- `../irisops-enrolled-clean-20260927-j`: installation plans/receipts,
  public-certificate preflight, wallet/web-app UI, faults, final result and stop.
- `../irisops-role-ui-validation-20260927-clean-user-j`: role UI.
- `../irisops-user-native-20260927-clean-j/result.json`: native membership and
  synthetic-session interruption tests (not by themselves HTTP identity proof).
- `../irisops-user-http-20260927-clean-j`: real authenticated HTTP/user browser
  checks, native cleanup and desktop/mobile screenshots.

Earlier review archive A also completed the full gate in fresh instance `i` and
was stopped with data retained. B keeps the exact same runtime hash; it adds the
installer's TLS-failure stop handling and clarifies native provisioning authority.
The full B gate is nevertheless repeated, not inferred from A.

Live checks cover initial READ_ONLY, missing/revoked enrollment, selected-target
binding, two different target sets, stale preview with zero dispatch, real native
readback and restoration, eight wallet/web-app fault positions, no repeat PUT on
recovery/replay, interrupted activation, lock contention, restart persistence,
limited-operator role/user changes, permission revocation, malformed/CSRF/cross-kind
requests, actual preview expiration, native integrity and runtime file hashes.

The 125-second idle wait demonstrates rejection after that interval. Native
administrative authorization may expire earlier (typically about 60 seconds),
so this does not isolate the guard's 120-second idle timer as the cause.

Browser work uses 1440x900 and 390x844. Programmatic checks cover overflow,
uncaught errors, direct admin fallback, separate write approval and confirmed
operations. Browser TLS test exceptions are pinned to that lab's exact public
certificate SPKI; strict HTTPS requests separately validate the CA, date and IP.
This does **not** prove a new user's manual browser trust ceremony.

Visual inspection of final B covers the wallet preview, role controls and
disabled state, web-app mobile view, and the user's actual 390x844 confirmation
viewport. An extra assertion verifies the confirmation button fits entirely
inside that viewport. No credential field values or recovery proofs appear in
the inspected screenshots; operation IDs and confirmation phrases are not
authentication credentials. The public Safe demo explorer was also inspected.

## Scope to present honestly

The managed endpoint protects four **bounded** workflows: wallet policy,
eligible web-app availability, one custom test role's resource grants and one
separate disabled test user's selected membership. It is not a general user
editor and does not enable active accounts, change passwords, grant system roles,
protect external native admin interfaces or migrate every existing workspace.

The installer intentionally does not create a login identity, import CA trust,
enroll business targets or enable writes. A native administrator must perform
those steps. The guide makes them explicit; this is not a one-click credential-
free demo. The disabled target user is not the operator who logs in.

Native identity remains authoritative. External administrators can race changes:
pre-write comparison is not an atomic lock over all native tools. Existing native
processes may retain privilege state; immediate revocation of every process is
not claimed. Recovery observes current state without rewriting historical facts.

Not verified: a second machine/OS, a fresh-host image download, IRIS for Health,
production certificates/identity onboarding, in-place/schema upgrades, arbitrary
active-user management, or every possible crash position. No zero-defect,
100%-reliability or contest-ranking guarantee is made.

## Publication boundary

The public version, old ZIPs, source history, original development container and
its volumes are preserved. The judge package is a separately identified local
candidate, not a silently relabeled public 1.2.1 or a published 1.3.0.
Publishing GitHub/Open Exchange and selecting the public release label require
the user's final confirmation. Do not upload the entire experimental directory
or historical evidence indiscriminately; use the exact reviewed artifact.
