# Enrolled user membership — authenticated browser validation

Status: **EXPERIMENTAL / NOT READY / UNPUBLISHED**.

Historical development-container milestone. The subsequent clean portable gate
is recorded in [user-package-validation-20260927.md](user-package-validation-20260927.md);
the remaining-gate statements below describe this earlier UI run.

## Outcome and scope

The development managed profile now exposes an optional User membership view
inside Access Control, alongside Role resources. Both an installed UserApi module
and an explicitly enrolled disabled test user/role are required. Older deployments
without an enrolled user keep the three existing channels.

This is not a general user editor: it cannot enable accounts, change passwords,
manage arbitrary users, calculate effective/SQL privileges or protect direct
native administration outside this guard. The generic SysAdmin user PUT stays
blocked in the managed profile. Public 1.2.1 and frozen bundles are unchanged.

## Evidence

Successful run: `../irisops-user-http-20260927-h-ui/result.json` (relative to the
repository root). It reports complete=true, uiVerified=true, certificate-validated
HTTPS, real native authentication and published=false. SHA-256 values cover nine
loaded ObjectScript classes and nine UI files; copied UI files were compared to
their installed container hashes before testing.

Runner: `experimental/guard/verify-user-http.mjs`. Exact disposable container:
`3788ecb2c2d461792e7eef7fcdcfb589d6cd7e1f4c7249012c651b36e5698236`,
`irisops-pilot-policy-20260926-e`, loopback HTTPS 52808.

The runner repeated server READ_ONLY rejection, bounded non-superuser native
authentication, strict fields/CSRF/cross-kind rejection, assign and remove with
readback, no second dispatch on replay, revoked native permissions, real preview
expiration, restart recovery and real 125-second idle expiration.

Browser checks used headless Chrome at 1440x900 and 390x844. The exception for
the local certificate was pinned to that exact public certificate SPKI; this was
not an unrestricted ignore-HTTPS-errors session and did not change system trust.
This does not establish the user-managed Firefox trust flow for this new feature.

- Login creates four separate read-only operation channels; password input clears.
- User view reads the exact enrolled target and role; writes start disabled.
- Explicitly enabling writes permits a server-owned assignment preview.
- Mobile confirmation shows before/expected membership and disabled-account limit.
- Assignment reaches VERIFIED and native IRIS membership matches.
- Switching to roles does not inherit the user's write approval or operation ID.
- Switching back preserves the user receipt without crossing kinds.
- Removal reaches VERIFIED; native membership is empty again.
- Reconciliation reports MATCHES_EXPECTED without another administrative change.
- Disconnect disables previews.
- No uncaught page errors, no direct /api/admin requests, and no generated fixture
  credentials in sampled browser console output or HTTP response bodies.

Full-page captures made at those viewport sizes and visually inspected:
`user-desktop.png`, `user-mobile.png`, `user-mobile-preview.png`,
`user-desktop-receipt.png`, beside result.json. No horizontal document overflow at
390 pixels; labels, disabled controls, confirmation and receipt were readable.
Captures contain synthetic actor names, operation IDs and configuration hashes,
not passwords or recovery possession proofs. Toasts and sticky navigation in
full-page captures reflect the current scroll position, not a separate viewport.

## Defects and interrupted attempts

- Attempt d stopped before any role assignment because HTTPS was not running.
  Native readiness alone was insufficient; a bounded verified-TLS preflight was
  added. The original image httpd config could not write its PID directory. The
  actual persistent config was identified from local runtime logs and the service
  started without changing permissions/files. Successful h also restarted normally
  without this manual step. This does not prove the original startup cause fixed.
- Preflight attempts e/f wrongly expected anonymous 401/403 while SUSPENDED
  deliberately disables the application and returns 404. Readiness now accepts
  this TLS response only for readiness; it is never authentication success.
  Those attempts created no fixtures.
- Attempt g reproduced a real frontend defect: a single-element selector was
  treated as an array when wiring the two Access Control buttons. Rendering
  failed. It now uses the collection helper; a regression test covers this and
  the complete HTTP/browser run h was repeated after the fix.
- The guarded-user navigation fallback label was also corrected.

After failures with fixtures, exact names, descriptions, roles and disabled
target state were checked before scoped restoration. No unrelated account,
application, Docker volume or historical evidence was removed.

## Restoration and regression

The successful runner removed exactly the four authorized temporary entities:
IrisOps_UserHttpOperator, IrisOps_UserRoleProbeUser, IrisOps_UserRoleProbeExtra,
IrisOps_UserRoleProbeRole. Absence was checked, the original three-target policy
restored and deployment set to SUSPENDED. Temporary credentials existed only in
process memory. The lab is retained for future work, not deleted.
After cleanup, lab e was stopped again; its container and volume were preserved.
The clean-enrolled lab c and original development lab remained running.

Node regression: **244 passed, 0 failed**. New tests cover exact user schemas,
preview/receipt binding, separate recovery, optional capability compatibility,
permission denial, substituted targets and dynamic selector wiring. Passing
tests are evidence for these cases, not a claim of zero defects.
The workspace has no npm executable. Every Node command declared by the
package.json check script was therefore executed with the bundled Node runtime;
all passed. git diff --check passed. All 18 recorded runtime source hashes were
rechecked against the final files and still matched successful run h.

## Next gate

Build a NEW versioned portable artifact containing the optional user classes and
updated UI, verify its manifest, install it into a fresh disposable IRIS instance,
and repeat enrollment, lifecycle, interrupted-result, browser and cleanup tests.
Do not overwrite the prior bundle or mark this production-ready from this
development-container validation alone. No commit, push or publication was done.
