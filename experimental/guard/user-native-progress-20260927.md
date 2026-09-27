# User membership migration — native development checkpoint

Status: **EXPERIMENTAL / NOT READY / UNPUBLISHED**.

Historical checkpoint: the subsequent authorized run, corrections and durable
workflow results are recorded in [user-native-validation-20260927.md](user-native-validation-20260927.md).
The pending-approval section below describes the earlier state, not the latest result.

## Implemented locally

- Optional explicit fifth policy target `user`, requiring the existing enrolled
  `role`. Existing three/four-field policies remain valid. Unknown fields fail
  closed through the strict field count/type checks.
- `UserTransport`: selective account metadata reads and a Roles-only native
  write. It admits only an enrolled disabled local `IrisOps_` test account with
  no escalation roles and either zero direct roles or exactly the enrolled role.
  It refuses the current actor, other memberships, inherited roles and resource
  grants outside the explicitly enrolled private resources.
- Before write, the native reader rechecks the policy, user metadata and selected
  role metadata; both before and expected digests must match.
- No HTTP route, frontend control, portable runtime entry or durable execution
  handler exposes this unfinished transport. Do not describe it as a delivered
  guarded user workflow.

## Defect corrected and verified

The deployment revision fence omitted `Transport` and the four optional role
classes. It now includes them, represents absent optional classes explicitly,
and includes the native user prototype when present. A test compares this fence
against every packaged runtime class.

On disposable lab `irisops-pilot-policy-20260926-e`, adding a harmless temporary
class parameter to RoleTransport changed the administrator plan fingerprint.
The original class source was restored and the probe parameter was confirmed
absent. Deployment remained SUSPENDED throughout. No security identity was
modified by this test.

Evidence: `../irisops-revision-fence-20260927-a/result.json`.
This is a dictionary revision fence, not a software-signing guarantee.

## Checks actually completed

- 230 Node tests passed, 0 failed.
- Deployment, TargetPolicy and UserTransport compiled successfully on real IRIS.
- The optional-class revision regression passed on real IRIS, with restoration.
- Existing user/role fixtures were not created or deleted in this checkpoint.
- The public 1.2.1 and frozen role bundle B were not modified. No commit, push,
  release or public documentation update was performed.

## Pending approval and evidence

The automatic permission review rejected `verify-user-transport.mjs` before
execution: earlier temporary-identity approval covered two entities, while this
test requires a user and two roles to exercise unexpected-membership refusal.
Explicit approval was requested for these exact names in lab e:

- `IrisOps_UserRoleProbeUser`
- `IrisOps_UserRoleProbeRole`
- `IrisOps_UserRoleProbeExtra`

The runner is prepared, but **assignment, removal, user-policy enrollment and
their native readbacks have not run**. Its future result must not be inferred
from the Node source-contract tests or successful compilation.

After this gate: run the native test, resolve defects, implement the durable
preview/execute/inspect/reconcile layer, then HTTP READ_ONLY and identity tests,
then UI and clean-package validation. Keep the workflow inaccessible meanwhile.

## Explicit limits

- Target account is disabled; this is not general administration of live users.
- Direct membership and selected resource metadata are not a complete effective
  authorization analysis. SQL grants, grants through other applications, and
  session behavior after membership changes remain unverified.
- No claim of atomic compare-and-swap against native changes outside the guard.
- No claim yet of durable receipts, uncertain-outcome recovery or browser support
  for the new user workflow.

API basis: documented selective object access and Roles-only Modify in the
[InterSystems Security.Users reference](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Security.Users&LIBRARY=%25SYS).
The broad Get method returns credential-related properties, so this prototype
does not call it or export the native user object.
