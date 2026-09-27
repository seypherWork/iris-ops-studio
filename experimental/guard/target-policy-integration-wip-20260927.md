# Target policy integration — WORK IN PROGRESS, NOT VALIDATED

Historical interruption checkpoint, superseded by
[the completed development integration validation](enrolled-integration-validation-20260927.md).
The public-release gate is still open; this checkpoint must not be read as the
current local-source validation status.

Checkpoint while answering the user's deadline question on 2026-09-27.

Local experimental source changes only. No Docker/container changes, deployment,
commit, push, release or public-description changes in this step. Previous bundles
and the original lab were not modified. This is NOT a ready installation.

## Implemented but not compiled/tested in IRIS yet

- TargetPolicy name bounds aligned to wallet transport (64 characters, ASCII-style
  alphanumeric/underscore/hyphen) and resource policy length (58 characters).
- Target/Generation/CheckPreview helpers, default deny, private web-resource check.
- Execution preview binds policy generation; repeated authorization checks it.
- Wallet transport and recovery require enrolled target/resources.
- Web transport takes an explicit enrolled target; execution/readback/recovery use
  the preview/receipt target, not a global hardcoded web app.
- Selected non-system CSP/REST app metadata still requires native password auth,
  no MatchRoles, no namespace default/admin dispatcher, private custom resource,
  no WSGI runtime. Full configuration digest and Enabled-only PUT retained.
- Combined capabilities now return policy generation/resources plus enrolled
  targets, or target_policy_required with empty targets for default-deny setup.
- Deployment SourceStamp and build runtimeNames include TargetPolicy.
- Browser contracts accept an explicit validated target/resource context, keeping
  legacy defaults for old isolated profiles. Syntax check passed ONLY.

## Next required work before running any new build

1. Update ui/session.js to strictly validate/store the new capabilities contract,
   bind it to deployment/session generation, detect change and disconnect.
2. Update ui/client.js to capture that context at attach, send actual targets,
   and pass context into preview/receipt/recovery validation.
3. Update web/assets/wallet-guard.js, combined-guard.js and app.js: remove fixed
   names/selectors for managed profile, show setup-required, use enrolled resources.
4. Add unit tests for foreign target/resource responses, policy changes, missing
   configuration, malformed contracts, and old-profile compatibility.
5. Compile all changed native classes together in a NEW disposable lab, test
   real HTTP mutations/readback/restoration on IrisOps_Enrolled* fixtures, revoked
   and stale previews causing zero PUT, current recovery target isolation, restart,
   permissions, browser desktop/mobile, logs/redaction/integrity.
6. Current portable builder still references immutable old m/c bundles with fixed
   manifest counts. Do not label those as the new source build. Create a distinct
   validated artifact/profile rather than replacing prior evidence.

Potential review points: native Name uses ObjectScript 1A (ensure cross-language
ASCII consistency), resource checks across namespaces, revoked policy recovery
behavior, stricter metadata profile matching enrollment, and frontend legacy
fallback isolation. No claim of complete safety or production readiness.

## Contest timing verified separately

Open Exchange contest/48: registration closes 2026-09-27 23:59:59 EST.
Announcement explicitly allows improving applications during submission AND
voting (through October 4). EST literal conversion to Belgium: September 28
06:59:59 CEST; if organizers use Eastern daylight time while labeling EST, it is
05:59:59 CEST. Do not wait for either boundary. Existing IRIS Ops Studio entry
was visible in the official registered-applications list today.
