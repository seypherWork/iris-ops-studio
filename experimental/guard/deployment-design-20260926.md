# Reversible registration and deployment-bound sessions

Scope: next isolated milestone, not a production installer or public release.
Public 1.2.1 and the existing probes remain unchanged. Source backup is the
sibling checkout directory `iris-ops-guard-pre-deployment-20260926`
(experimental and web, selected hashes checked).

## Decisions

- Use a new `/api/irisops-managed-guard` native application. Refuse collisions.
- Registration requires the previously prepared IRISOPS namespace and journalled
  guard receipt database; it must not create/replace arbitrary databases.
- Preflight is read-only. Applying a plan requires its exact current fingerprint.
  Native application properties are changed with Security.Applications APIs,
  not direct writes to security tables. Source and native configuration drift
  must not be overwritten silently.
- Initial installation serves reads only. A separate explicit administrator
  transition enables the two existing disposable operations; native user
  permissions and per-operation channels/approvals still apply.
- Persist only nonsecret deployment metadata in the own receipt database.
  Every mode/build transition rotates deployment generation. Old sessions and
  approvals cannot resume after disable/re-enable or rollback. No passwords
  are generated for real users, retained or rotated by installation.
- Serialize administrative deployment transitions with in-flight guarded
  dispatch/login. If busy, leave state untouched and report busy. No forced
  worker termination and no false claim that an already dispatched PUT was undone.
- Rollback of exposure disables only the owned application; it retains receipts,
  configuration history and data. This is not destructive uninstall.
- Validate dispatcher replacement/rollback with two distinct lab builds. Do
  not describe that as a complete IPM/schema/data-migration upgrade test.
- Keep the existing 60-second authorization and fixed 52801 loopback boundary.
  HTTPS, arbitrary ports, longer user sessions and full product packaging require
  their own acceptance tests; do not quietly relax them for this milestone.

## Required evidence

New install readonly; idempotent same-state apply; collision and stale-plan
refusal; native properties unchanged outside owned application; server readonly
cannot be bypassed by calling execute directly; distinct native users retain
their permissions; suspend/reenable/build replacement invalidate old cookies and
approvals; reconnect starts readonly channels; lost outcome remains recoverable
without redispatch; rollback preserves receipt hashes; concurrent deployment
versus dispatch cannot race; failed activation leaves runtime fail-closed;
old pilots regressions pass and all disposable test users/targets are removed.

Reference: [official Security.Applications API](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Security.Applications).
