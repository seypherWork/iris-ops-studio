# Managed guard: laboratory operator guide

Status: isolated prepared-instance pilot; NOT READY for public installation.
Do not run these commands on a customer instance. No public package installs
these classes, and no production version or existing application is upgraded.

## Exact boundary and prerequisites

- Container `iris-ops-guard-dev-20260925`, immutable ID
  `d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
- IRIS Community 2026.2.0.221U, local host port 52801, namespace IRISOPS.
- Existing nonpublic, journalled IRISOPSGUARD receipt database and exact
  IrisOps_GuardStorage role/global mappings. Plan validates these; it does not
  bootstrap databases, replace roles or loosen their permissions.
- Prepared and compiled own guard classes. The deployment registry adds only
  its own IrisOpsGuardDeploy mapping to that existing database if absent.
- A terminal administrator with `%Admin_Secure:U` and `%Admin_Manage:U`, plus
  the native access needed for the prepared namespace and configuration APIs.
  This is not an exhaustive least-privilege administrator-role recipe. An
  operation user without Admin_Manage is explicitly denied installer control.
- New native application `/api/irisops-managed-guard`; no reuse of older probes.
  Public passwords are never provisioned by this installer. Enter any real
  credentials directly into the local login UI, not source files or chat.

## Plan, review, then apply

These are ObjectScript commands inside an already authenticated IRISOPS terminal.
`Plan()` is read-only. Review its application, mode, build and fingerprint before
the separate `Apply()` command. If anything changed, obtain and review a new plan;
do not silently retry stale plans. The fingerprint detects native configuration
and class revision changes, not signed provenance of software binaries.

```objectscript
set p=##class(IrisOps.Guard.Deployment).Plan()
write p.%ToJSON(),!
```

First registration is allowed only in READ_ONLY. In this lab, `managed-lab-a` is
the regular managed dispatcher; `managed-lab-b` is a test-only fault-injection
dispatcher, not a customer release.

```objectscript
set result=##class(IrisOps.Guard.Deployment).Apply(p.fingerprint,"READ_ONLY","managed-lab-a")
write result.%ToJSON(),!
```

After reviewing another fresh plan, an administrator may explicitly change
READ_ONLY to ACTIVE. Native user permissions, separate wallet/webapp write
channels and individual previews/confirmations/readbacks still apply.

```objectscript
set p=##class(IrisOps.Guard.Deployment).Plan()
write p.%ToJSON(),!
// Stop here to review the plan before permitting writes.
set result=##class(IrisOps.Guard.Deployment).Apply(p.fingerprint,"ACTIVE",p.build)
write result.%ToJSON(),!
```

No installer endpoint is exposed over HTTP. POST /v1/deployment is rejected;
the existing GET route returns only mode, generation and build for the UI.

## Suspend without deleting data

Review a fresh plan, then apply SUSPENDED to its existing build:

```objectscript
set p=##class(IrisOps.Guard.Deployment).Plan()
write p.%ToJSON(),!
// Review first: only /api/irisops-managed-guard will be disabled.
set result=##class(IrisOps.Guard.Deployment).Apply(p.fingerprint,"SUSPENDED",p.build)
write result.%ToJSON(),!
```

Verify result.mode = SUSPENDED and the native application's Enabled = false.
Receipts, nonsecret configuration history, database, classes and source files
remain. This is suspension of exposure, NOT destructive uninstall or rollback
of an operation that already reached IRIS. The runner leaves the profile in
this state and removes only its collision-checked disposable test fixtures.

If a guarded write is already in progress, the installer waits at most two
seconds for the shared lock and may report `deployment_busy`. It does not kill
the worker or pretend to undo the write. Inspect/recover the operation first,
then explicitly re-plan the deployment action.

## Replacement, rollback and interruption

Changing dispatcher builds is refused until SUSPENDED. Review a plan in that
state, then use Apply(...,"READ_ONLY","managed-lab-b") in tests. To roll back,
suspend that build, review again and activate managed-lab-a in READ_ONLY.
The live test changes the actual dispatcher and reads preserved receipts. It
does not validate package replacement, schema migrations or a full IPM upgrade.

If the installer process exits in the middle, state can remain TRANSITION.
Managed requests then fail closed. Do not edit globals or enable the native
application manually to bypass recovery. Inspect the owned state and native
configuration first; then capture and review the current fingerprint:

```objectscript
set state=##class(IrisOps.Guard.Deployment).State()
write state.%ToJSON(),!
set expected=##class(IrisOps.Guard.Deployment).Fingerprint()
write expected,!
// Review ownership/configuration before this separate recovery action.
set result=##class(IrisOps.Guard.Deployment).RecoverInterrupted(expected)
write result.%ToJSON(),!
```

Recovery refuses non-TRANSITION state, stale fingerprints and foreign ownership.
It only returns to SUSPENDED; a separate reviewed plan is required to re-enable
reads. Configuration drift is a stop-and-inspect condition, not permission to
overwrite somebody else's application.

## Session and evidence lifecycle

- The isolated UI path is `/csp/ops/guard-managed/web/index.html#secrets`; the
  live UI runner verifies every deployed asset byte against the source. It is
  not a permanent customer demo: test accounts and targets are removed afterward.
- READ_ONLY permits authenticated reads/recovery but rejects write enabling,
  previews and execution server-side. ACTIVE permits only the two fixed
  disposable actions, subject to all their existing permission gates.
- Mode/build changes rotate deployment generation. Old sessions and previews
  must reconnect; neither operation's write grant is restored automatically.
- Upstream authorization still lasts 60 seconds, without silent renewal. The
  native CSP session timeout is separate (600 seconds); a surviving cookie is
  not surviving administrative authorization.
- IRIS restart retains deployment metadata and receipts but invalidates the
  sealed upstream authorization. Fresh login is required to inspect results.
- Recovery also requires the per-operation proof, retained privately in that
  tab's session storage across reload. Disconnect forgets it. A lost proof is
  not reissued just because the username matches. Never print/export proofs.
- UNKNOWN plus a later current match remains UNKNOWN. Reconciliation observes
  current state, does not prove causality and never sends another native PUT.
- The browser learns a suspension on its next request/status check; there is
  no push notification or promise of an instantaneous visual change.

## Reproduce and inspect

With the pinned Docker executable and isolated Playwright/browser runtimes,
run `node experimental/guard/verify-deployment.mjs` with
`IRISOPS_DEPLOYMENT_UI=1`. Run no other IRIS runner simultaneously: the tests
share owned fixtures and temporarily instrument /api/admin. They verify its
restoration afterward. Do not use this integration runner as a customer installer.

The proof is `deployment-evidence.json`: require complete, restored and
suspended to all be true. `productionReady` deliberately remains false.
Review `managed-ui-evidence/result.json`, screenshots and the validation report.
Rerun older combined, wallet, webapp and transport suites after shared changes.

Still open: clean-instance bootstrap and actual package upgrade/uninstall,
HTTPS and cookie/transport topology, usable production session lifetime,
general target policy, full product migration and final independent review.
Direct native clients/administrators remain outside this managed guard.

Native configuration is changed through the
[official Security.Applications API](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Security.Applications),
not by editing security tables.
