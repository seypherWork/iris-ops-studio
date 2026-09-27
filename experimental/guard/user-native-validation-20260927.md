# User membership — native and durable workflow validation

Status: **EXPERIMENTAL / NOT READY / UNPUBLISHED**.

Subsequent HTTP-stage evidence and the newer integration boundary are tracked
in [user-http-validation-20260927.md](user-http-validation-20260927.md).
The no-HTTP-route statement below describes this earlier native checkpoint.

## Authorization and isolation

The user authorized testing the three named temporary entities and proceeding
to the next implementation step. Only disposable lab
`irisops-pilot-policy-20260926-e` was changed:
`3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236`.

The account `IrisOps_UserRoleProbeUser` and roles `IrisOps_UserRoleProbeRole` and
`IrisOps_UserRoleProbeExtra` were absent before each fresh run. The target was
disabled except for the short enabled-state rejection test; no login was made
with that account. Its generated password stayed within the test process/native
input and was not printed or saved as evidence. No other user or role was edited.

## Defects found

1. **Real implementation defect:** custom guard class calls were attempted after
   switching to `%SYS`, where those classes do not exist. Native user/role reads
   now occur in a helper that restores the caller namespace before guard logic.
   Policy enrollment likewise calls the guard snapshot before entering `%SYS`.
2. **Test defect:** native IRIS canonicalizes role ordering. Assertions now
   compare complete membership sets, not insertion order.
3. **Invalid test assumption:** clearing `$roles` on a privileged terminal does
   not remove the native administrator's authority. This is not accepted as a
   non-admin test. That boundary remains explicitly unverified.

Failed runs stopped without automatic retries. Their exact policy/fixture state
was inspected and restored before new runs. Earlier evidence directories remain.

## Real IRIS evidence

Native transport suite:
`../irisops-user-native-20260927-e/result.json`.

Full native suite plus durable execution/recovery:
`../irisops-user-native-20260927-f-durable/result.json`.

The latter contains source hashes for all newly loaded runtime and lab classes,
including UserTransport, UserExecution, UserRecovery, Receipt and Deployment.

Passed native checks:

- Preview does not mutate the account; only enrolled user/role are allowed.
- Assign and remove modify only direct Roles, followed by full state readback.
- User and selected-role metadata drift reject old previews without native writes.
- Extra memberships are rejected rather than overwritten; system resource,
  inherited-role and enabled-account changes are refused.
- No-op operations and revoked enrollment are rejected.
- Disabled state, namespace and non-superuser status remain unchanged.

The next implementation stage is also present and tested:

- UserExecution inherits the durable dispatch reservation and replay protection.
- Read-only and wrong-kind synthetic channels refuse preview.
- Wrong confirmation does not write; stale execution has BLOCKED/stale and
  dispatchCount=0; successful execution has VERIFIED and dispatchCount=1.
- Simulated exceptions immediately before and after dispatch preserve durable
  uncertainty. The after-dispatch case performs a real native membership change.
- Wrong recovery proof is rejected. A new synthetic session can reconcile using
  the original operation proof, without rewriting original events or status.
- Recovery reports MATCHES_BEFORE or MATCHES_EXPECTED with administrativeWrites=0.
- Repeating an uncertain operation returns its record and does not dispatch again.

## Restoration

Both successful runners verified deletion of exactly their three temporary
security entities, restored the original three-target policy, and confirmed
deployment SUSPENDED. Durable test receipts are retained as evidence; those
receipts are not recoverable through a now-unenrolled/deleted target.

## Boundaries and next gate

- These are real native mutations and durable receipts, but **synthetic session
  custody under an administrator terminal**, not real HTTP authentication tests.
- No HTTP route, capability, browser control or portable package exposes the
  unfinished user workflow. The public release and frozen bundle B are unchanged.
- No complete effective-access/SQL privilege analysis, process crash/restart
  validation for this workflow, concurrent external CAS guarantee or non-admin
  caller proof is claimed.
- Next: isolated HTTP integration with authenticated limited identities, server
  READ_ONLY enforcement, expired/revoked authorization, cross-kind/session proof
  rejection and restart recovery; then strict UI contracts and visual validation.
- Do not publish or mark production-ready on this evidence alone.
