# Judge's guide — managed guard review candidate

This is an **unpublished, local evaluation package**, based on Ops Studio 1.2.1.
It is not an in-place upgrade or a production deployment recipe. The public
console and this managed profile are different entry points: only the workflows
listed below go through this server guard. Other workspaces are disabled here,
not silently routed to the unguarded administration API.

## What to evaluate

| Workflow | Deliberately bounded target | Evidence to look for |
| --- | --- | --- |
| Wallet access policy | One enrolled collection; EditResource/UseResource only | Both fields previewed, fresh check, native readback; no secret value |
| Web application | One eligible non-management application | Enable/disable, complete configuration digest, stale rejection |
| Role resources | One enrolled custom test role and private resources | Grant/revoke with full grant-set digest; no inherited/admin role |
| User membership | One separate **disabled** local test account | Assign/remove only the enrolled role; account stays disabled |

The server requires native user permissions, deployment mode and separate write
approval for each workflow. Confirmation is target-bound. Durable operation
receipts distinguish verified, blocked, failed and uncertain results. Inspection
and reconciliation observe state; they do not repeat a possibly completed write.
This is not a system-wide restriction on administrators, general live-user
management, a full dependency graph or a guarantee of zero defects.

## 1. Install an isolated evaluation instance

Requirements: Node.js 22+, Docker Desktop/Engine using Linux containers, the
ability to download the digest-pinned IRIS Community image, and an unused local
port. No npm dependencies are needed. Keep the extracted bundle unchanged.

On Windows PowerShell, set the actual Docker executable, for example:

```powershell
$env:IRISOPS_DOCKER_EXECUTABLE = (Get-Command docker.exe).Source
node portable.mjs verify
node review.mjs install irisops-pilot-jury-review 52820 ../irisops-jury-review-receipts
```

Use a new name and receipt directory. The assistant displays two exact plans:
`PREPARE` creates a new image and certificate volume; `INSTALL` creates a new
data volume and engine. Press Enter to decline either. It does not delete old
instances, import trust, create login accounts or enroll assets. Review names,
loopback port and fingerprints before approving. The final output gives the
actual URL and immutable container ID. Installation starts **READ_ONLY**.

If interrupted, do not repeat the command blindly: inspect the exclusive-create
receipt directory. `prepared.json` and `installed.json` identify completed phases.
The lower-level commands in README.md support explicit inspection/stop. A failure
does not mean all resources were removed; retained resources are intentional.

## 2. Trust and identity are explicit administrator decisions

The installer verifies the served certificate, CA, IP and asset bytes, and exports
only `public-certificates/ca-public.crt` and `server-public.crt`. Compare the
fingerprint with `preflight.json`. Use a **separate browser profile** if you choose
to trust this CA: a CA trust grant is not limited to this port. Never disable TLS
verification globally. The lab certificate expires after two days; prepare a new
lab for a later evaluation rather than reusing an expired certificate.

Native portal and direct `/api/admin` routes are intentionally blocked on this
HTTPS listener. Do not expose port 52773 as a workaround. Set up your native IRIS
identity in its interactive terminal instead:

```text
docker exec -it irisops-pilot-jury-review iris session IRIS -U %SYS
do ^SECURITY
```

Run that utility as a native provisioning administrator (the documented utility
requires at least the `%Manager` role), not as the restricted review operator.
Use the native security utility's user-management prompts to set a private local
operator password and change initial/default credentials if required. Enter
passwords only in the interactive utility or the application's sign-in form,
never command arguments, source files, issue reports or chat. Do not use a
production password. Native security-utility menu numbers can vary.

Prefer a dedicated local operator. The workflows require `%Admin_Wallet:U`,
`%Admin_Secure:U`, `%DB_IRISSYS:R`, `%DB_IRISOPS:R` plus access to the selected
wallet resources. Those are meaningful native privileges, not merely UI access.
The installer does not grant them. Target enrollment additionally requires
`%Admin_Manage:U`; keep that provisioning authority separate from the operator.
Native authorization remains authoritative, even after enrollment.

## 3. Enroll only owned disposable assets

This package does not discover and automatically authorize existing business
objects. Provision an empty test wallet, a disabled custom web application, two
private resources and, optionally, an `IrisOps_` test role/user using native IRIS
administration in the disposable instance. The user target must remain disabled
and have no roles or only the selected role; **it is not the login operator**.

Follow the exact eligibility and enrollment commands in README.md. An example
selection, after those objects exist, is:

```objectscript
set config={"wallet":"OwnedWallet","webapp":"/csp/owned-app","resources":"OwnedOne,OwnedTwo","role":"IrisOps_OwnedTestRole","user":"IrisOps_OwnedDisabledUser"}
```

Terminal provisioning sequence: review Deployment.Plan; suspend using its exact
fingerprint; review TargetPolicy.Plan(config); apply that exact, unexpired plan;
review Deployment.Plan again and return to READ_ONLY. Every result must indicate
success before continuing. Enrollment does **not** edit assets or grant native
permissions. If eligibility fails, do not loosen system permissions to bypass it.

## 4. Five-minute review after provisioning

1. Open the exact HTTPS URL printed by setup. Connect with the separate operator;
   do not choose **Use safe demo data**. Confirm the managed/live connection.
2. In READ_ONLY, inspect capabilities and enrolled targets. Write approval must
   be denied by the server, not just hidden by the interface.
3. In the terminal, explicitly review a fresh Deployment.Plan and Apply ACTIVE.
   Reconnect. Approve writes for **one** workflow, preview a reversible change,
   inspect its exact target/before/after and type the displayed confirmation.
4. Confirm **VERIFIED** and inspect the receipt. Other workflows must still need
   their own approval. Reverse the change through a new preview; do not replay
   the old operation to undo it. For the user fixture, test assignment/removal
   without ever enabling the account.
5. Retain the recovery proof locally if offered. Reconnect and inspect the
   original receipt: observation is separate from its historical outcome.
   An uncertain result is **not** an instruction to submit the change again.

For a stale-preview demonstration, change only a fixture's description through
native IRIS after preview and before confirmation. Execution should be BLOCKED;
restore the fixture afterward. Do not perform this on real business objects.

## 5. Finish without data loss

```text
node review.mjs stop ../irisops-jury-review-receipts
```

Review the exact plan and type STOP. Only the ownership-verified engine is
suspended/stopped; volumes, images and receipts remain. This is not a backup or
an uninstall. Remove browser trust through that browser's own settings when the
lab is no longer needed. Do not delete unknown Docker volumes.

Each stop attempt gets a separate `review-stop-attempt-*` directory inside your
receipt directory, containing its `plan.json` and, on success, `stopped.json`.
If you decline, a plan expires or an attempt fails, inspect its receipts and
current engine state before invoking the same stop command again. A new attempt
creates a fresh plan and asks for fresh approval; previous evidence is retained.
If the engine is already stopped, do not restart it just to repeat this command.

## Honest boundaries

- Tests on one Windows/Docker host and fresh IRIS Community 2026.2 do not prove
  other operating systems, IRIS for Health, production TLS or in-place upgrades.
- Native administrators can change assets outside this guard. Fresh comparison
  is not an atomic lock against every outside administrator. User membership
  uses a selected-role delta, not replacement of unrelated roles.
- User/session access revocation is not guaranteed instantaneous in already
  running native processes. Test new authentication separately.
- Recovery proofs are sensitive. Losing one can prevent UI recovery; the tool
  does not bypass actor/proof checks to make a demonstration succeed.
- The three published videos describe earlier versions, not proof of this
  candidate. Evaluate the exact hashed package and current validation report.

Native reference: [InterSystems command-line security utilities](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GSTU_seccli).
Membership delta operations use the documented
[Security.Users API](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Security.Users).
