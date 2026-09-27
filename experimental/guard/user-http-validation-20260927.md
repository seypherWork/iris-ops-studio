# Enrolled user membership — authenticated HTTP validation

Status: **EXPERIMENTAL / NOT READY / UNPUBLISHED**.

Historical HTTP milestone (run c). The subsequent authenticated browser milestone
is recorded in [user-ui-validation-20260927.md](user-ui-validation-20260927.md).
The implementation boundary and remaining gates below describe run c, not the
newer source integration. No frozen package has been replaced.

## Scope and authorization

The user explicitly authorized the fourth temporary identity
`IrisOps_UserHttpOperator` in disposable lab `irisops-pilot-policy-20260926-e`,
alongside `IrisOps_UserRoleProbeUser`, `IrisOps_UserRoleProbeRole` and
`IrisOps_UserRoleProbeExtra`, with removal and policy restoration afterwards.
Only lab container
`3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236`
on loopback HTTPS port 52808 was modified or restarted.

## Implementation boundary

`UserApi` exposes only the enrolled disabled-user membership reader and exact
four-field preview schema. ManagedApi routes it only when the module is compiled
and the user target is enrolled. Writes use the existing managed deployment lock
and ACTIVE gate. There is no direct generic SysAdmin user editor, frontend
capability or portable-package inclusion yet.

## Evidence

Runner: `verify-user-http.mjs`, with certificate validation enabled. Passwords
are random, ephemeral, never included in saved results, and compared against
response text to detect accidental echoes. Recovery proofs stay in memory.

Run c: `../irisops-user-http-20260927-c/result.json` reports **complete=true**.
It includes SHA-256 hashes of the eight loaded runtime source files.

Verified stages:

- Real native authentication as a non-superuser operator, with bounded native
  administrative permissions needed by this workflow.
- READ_ONLY permits the scoped read but refuses enabling writes and preview.
- Unrecognized preview fields, invalid CSRF and cross-kind channel/preview use
  are rejected.
- Assignment has VERIFIED readback and one dispatch; replay does not repeat it.
- With native Admin_Secure removed, an existing approval cannot change the user;
  a fresh authenticated session cannot read or enable this operation either.
- Actual 31-second preview expiration produces BLOCKED/preview_expired with zero
  dispatch. No simulated clock or overwritten expiration was used.
- Removal restores the disabled target; reconciliation of the earlier assignment
  reports MATCHES_BEFORE without rewriting its original VERIFIED result.
- Restart rejects old session custody. A fresh authenticated session recovers
  the durable receipt without administrative writes. A wrong proof is rejected.

- Actual 125-second inactivity expiration denies the next read with HTTP 401.
- Exactly the four temporary identities were removed; absence was checked.
  Original three-target policy and SUSPENDED deployment were restored.

Node regression: **235 passed, 0 failed**. The operator's native SuperUser
property was directly verified as 0. No real user credential was used.

## Test harness corrections

The first attempt started before native IRIS readiness, and stopped before
creating any fixture. A bounded readiness check was added.

The second attempt reached restart. Native IRIS correctly returned HTTP 401
for the old session, but its native response was not JSON. The harness now
accepts non-JSON **only for that explicit old-session denial check and only
status 401/403**. Successful and other responses still require JSON. The exact
four fixtures and previous policy were inspected and restored before rerunning.

These were test-harness defects, not evidence of an authentication bypass.

## Remaining gates

- UI contracts, capability advertisement, actual browser interaction and visual QA.
- Versioned portable bundle, fresh clean installation and complete regression.
- Production/multi-user rollout, SQL/effective privilege analysis, and concurrent
  external changes are not validated by this narrow lab exercise.
- Native membership targets remain restricted to explicitly enrolled disabled
  test accounts. Do not advertise generic live-user administration.

No commit, push, public release, Open Exchange change or competition submission.
