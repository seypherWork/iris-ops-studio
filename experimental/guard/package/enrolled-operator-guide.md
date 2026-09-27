# IRIS Ops Studio — enrolled-target source pilot

EXPERIMENTAL / NOT READY FOR PRODUCTION. This independent source bundle installs
the managed guard into a **NEW disposable local IRIS Community 2026.2 instance**.
It is not the standard 1.3.1 IPM/Docker package or an in-place upgrade.
Verify the exact 1.3.1 review-bundle hash before evaluation. The normal
console and this guard use separate entry points.
Only the enrolled workflows are served here. In particular, Overview and its
demo-only CPU gauge are not live guard features.
It protects wallet access-policy changes, web-application availability and
an optional, narrowly enrolled role-resource grant workflow through its own
endpoint. It does not restrict administrators
using other IRIS interfaces and does not migrate the other Ops Studio workspaces.

Unlike the historical portable pilot, there are **no fallback probe targets**.
The administrator must enroll one wallet, one eligible application and 1–8 private
resource names. One existing test role may optionally be enrolled; it must have
an `IrisOps_` name, no inherited roles, no escalation-only setting and no
administrative resource. Missing or revoked enrollment blocks these operations. Native
IRIS authorization remains required; enrollment does not grant permissions.

## Optional user bundle profile

Both `portable-enrolled-user-pilot-1` and `portable-enrolled-user-review-1`
include the four additional UserTransport/UserExecution/UserRecovery/UserApi
classes and the same 45-file runtime inventory. The pilot has 52 bundle entries;
the review profile has 55; each also has bundle.json. The role-only profile
remains separate; do not mix their files.

In this profile, `config.user="IrisOps_OwnedDisabledUser"` may be enrolled
alongside `config.role="IrisOps_OwnedTestRole"`. The target must be a separate,
disabled local test account, non-superuser, with either no direct role or only
that enrolled role, no disallowed inherited/system privileges. The native
enrollment plan rechecks eligibility; it does not create accounts or grant access.
Never enroll your operator or an enabled real user. Native operators require
`%Admin_Secure:U`, `%DB_IRISSYS:R` and access to the guard code database; granting
these native permissions is an explicit administrator decision, not installer work.

Access Control / User membership offers exact-role assignment/removal with
server preview, explicit confirmation, native readback and durable recovery.
It does not enable the account, edit a password or calculate effective access.
Each operation type has independent write approval and recovery keys. The
following role-workflow limits refer to role-resource editing, not this optional
user workflow. A previous user pilot passed its own clean-install gate; see the
source repository's user-package-validation-20260927.md. That evidence is bound
to its exact hash, not automatically to a new archive.

## Guided evaluation bundle

The `portable-enrolled-user-review-1` profile includes the same 45 runtime files
and three additional delivery files: `review.mjs`, `onboarding-preflight.mjs`
and `JUDGE-GUIDE.md` (55 manifest entries plus bundle.json). Start with
**JUDGE-GUIDE.md**. The interactive installer presents exact plans for approval,
retains receipts, checks real TLS and exports only public certificates. It does
not install trust, create operator accounts, enroll targets or enable writes.
The lower-level commands below remain available. Earlier profiles and archives
are not upgraded or overwritten.

## Requirements and preparation

- Node.js 22+, Docker with Linux containers, and sufficient local disk.
- The official Community image is pinned by digest. Docker may retrieve it if
  absent; its terms apply. The archive contains source, not the third-party image.
- Set `IRISOPS_DOCKER_EXECUTABLE` to the Docker executable. No npm install,
  original checkout, old pilot image, volumes or certificates are required.
- Run the commands below in the extracted bundle. Use NEW output paths and
  unique names; preserve the bundle and receipts. Nothing is deleted automatically.
- Docker/native administrators are trusted. Hashes detect drift, not hostile
  administrator changes or publisher impersonation; this bundle is not signed.

```text
node portable.mjs verify
node portable.mjs prepare-plan irisops-pilot-example prepare-plan.json
```

Review the names, daemon, bundle hash and exact fingerprint. The plan is read-only
and valid for 15 minutes. After approving it, preparation builds the pinned image
and creates a new private TLS volume and stopped certificate helper:

```text
node portable.mjs prepare prepare-plan.json PREPARATION_FINGERPRINT prepared.json
```

Certificates are generated **inside the new volume**, valid for two days for
127.0.0.1 only. Private keys are not exported; host trust is unchanged. This is
laboratory TLS, not certificate lifecycle management. Browsers do not automatically
trust its CA. Human trust/login onboarding is not automated. Never disable TLS
validation globally or paste credentials into chat, logs or command arguments.

## Fresh read-only installation

Choose an unused loopback port and review the plan before applying:

```text
node portable.mjs plan prepared.json 52812 install-plan.json
node portable.mjs apply prepared.json install-plan.json INSTALL_FINGERPRINT installed.json
```

The installer checks the exact source inventory, image identity, new data and
certificate volumes, daemon and file hashes. The initial mode is READ_ONLY,
never ACTIVE. Only HTTPS is exposed on 127.0.0.1; native admin/portal HTTP routes
are blocked at this listener. Bootstrap, served UI bytes, database integrity and
the empty receipt store are independently checked. No operator credentials,
wallets, test users or business applications are created. Image defaults are
not a production identity setup. This installer refuses existing namespaces;
it is not an existing-instance or schema-upgrade tool.

## Explicit terminal-only enrollment

Prepare only assets you own in this disposable instance. Enrollment requires
`%Admin_Secure:U` and `%Admin_Manage:U` in `IRISOPS`, and a SUSPENDED deployment.
The web application must be a nonreserved `/csp/name`, with a nondefault namespace,
password-only authentication, private custom resource, no matched roles, WSGI,
system dispatcher or guard dispatcher. Wallet resources must be private custom
resources and both existing wallet policy fields must refer to enrolled resources.
The server rechecks native metadata just before accepting the plan.

In the authenticated IRIS terminal (not in shell arguments), review the result of
each plan **before** executing its following Apply. Replace the example names with
the exact pre-existing disposable objects; these examples do not create them:

```objectscript
zn "IRISOPS"
set d=##class(IrisOps.Guard.Deployment).Plan()
write d.%ToJSON(),!
// After reviewing d and approving suspension:
set r=##class(IrisOps.Guard.Deployment).Apply(d.fingerprint,"SUSPENDED","managed-lab-a")
set config={"wallet":"OwnedWallet","webapp":"/csp/owned-app","resources":"OwnedOne,OwnedTwo"}
// Optional, only after creating and inspecting a separate owned test role:
// set config.role="IrisOps_OwnedTestRole"
set p=##class(IrisOps.Guard.TargetPolicy).Plan(config)
write p.%ToJSON(),!
// After reviewing p and approving this exact enrollment (expires in 5 minutes):
set r=##class(IrisOps.Guard.TargetPolicy).Apply(config,p.fingerprint,p.expires)
write r.%ToJSON(),!
// Separately review deployment Plan again before returning to READ_ONLY.
```

Enrollment keeps the deployment SUSPENDED, invalidates old sessions/previews and
preserves history without modifying native assets. A reviewed Deployment.Plan /
Apply with READ_ONLY permits inspection. ACTIVE requires a separate deliberate
administrative transition and does not bypass per-workspace write approval,
operation preview, exact confirmation, current authorization or readback.
An uncertain result is inspected/reconciled using its receipt, never blindly retried.
The optional Access Control view can change only R, RW, RWU or U on one of the
enrolled private resources for that one role. It reads the full role grant set,
rechecks native permission and role eligibility immediately before modifying
only Resources, then verifies the complete grant-set digest. It does not edit
users, role membership, system resources, descriptions, wallet secrets or
arbitrary roles. It does not calculate which users would be affected. External
administrators remain able to change the same role through native IRIS, so the
pre-write check is not an atomic compare-and-swap against such outside changes.

Revocation also requires suspension and a fresh exact plan: `RevokePlan()` followed
after review by `Revoke(p.fingerprint,p.expires)`. It removes authority, not native
objects or receipts. Re-enrollment does not grant access to another actor's receipts.

## Suspend and stop without deletion

```text
node portable.mjs plan-rollback prepared.json installed.json stop-plan.json
node portable.mjs rollback prepared.json stop-plan.json STOP_FINGERPRINT stopped.json
```

Review the stop plan first. It suspends and stops only the ownership-verified
immutable container ID, retaining all volumes, images and evidence. This is not
a downgrade or a backup. Existing project containers and packages are untouched.

## Failure and release limits

Output files are exclusive-create. A failed step retains its result and resources;
inspect the phase and installation events before retrying with a new name. Caught
installation errors stop only the new owned engine. Power loss can leave partial
state; complete crash recovery at every installation point is not established.

Cross-machine/OS installation, downloading the base on a fresh host, production
TLS/identity onboarding and in-place upgrades remain unverified. Do not infer
readiness or general management coverage from these narrow guarded workflows.
