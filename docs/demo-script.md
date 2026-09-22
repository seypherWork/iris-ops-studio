# IRIS Ops Studio — 90-second demonstration script

This script is designed for a concise contest video. Record the application at
1440p or 1080p with the browser zoom at 100%. Keep the **Safe demo** label visible
whenever demo fixtures are on screen.

## 0:00–0:10 — The problem

**Screen:** Open the Overview workspace.

**Voice-over:**

> IRIS Ops Studio is a focused operational console for the InterSystems IRIS
> SysAdmin API. It brings common monitoring and administration workflows into
> one responsive interface.

## 0:10–0:24 — Operational overview

**Screen:** Point to resource posture, processes, storage, tasks, and security
summary cards. Briefly open and close the navigation on a narrow viewport.

**Voice-over:**

> Operators can review system posture, workload, licensing, storage, scheduled
> tasks, and security signals without moving between unrelated tools. The
> built-in safe demo is clearly labelled and needs no credentials.

## 0:24–0:40 — Incident Timeline

**Screen:** Open Logs & audit. Filter first by Tasks and then by Critical. Show
the source health row and correlation identifiers.

**Voice-over:**

> Incident Timeline normalizes security audit records, task execution history,
> and Ops Studio's own session journal. Operators can filter across subsystem,
> severity, entity, actor, message, and correlation ID from one view.

## 0:40–1:02 — Verifiable safety controls

**Screen:** Open Processes, choose Suspend, and show the current state, expected
state, target-bound phrase, and readback endpoint. Enter the exact phrase and
execute the safe-demo transition. Click Journal and show the `demo-verified`
entry.

**Voice-over:**

> A successful HTTP response is not treated as proof. Built-in changes follow
> Preview, Confirm, Execute, and Readback. Only a matching second read is marked
> verified; custom operations remain explicitly unverified.

## 1:02–1:18 — Permission management

**Screen:** Open Access control. Select a user and role, choose Assign role, and
show the schema-limited before/after preview. Cancel before execution, then show
the role-resource workflow.

**Voice-over:**

> Access control is no longer inventory-only. User-role and role-resource
> changes preserve unrelated settings, send only documented mutable fields,
> require an exact confirmation, and verify the result with a second GET.

## 1:18–1:27 — Coverage and evidence

**Screen:** Briefly show the API Explorer's 34 known operations and then the
validation report/test result.

**Voice-over:**

> The same zero-dependency client connects to the official IRIS SysAdmin REST
> API. The public release was validated on IRIS Community 2026.2, and the new
> permission, readback, journal, and timeline contracts are covered by 57
> automated tests.

## 1:27–1:30 — Close

**Screen:** Return to the Overview and finish on the product name.

**Voice-over:**

> IRIS Ops Studio: operational changes with evidence, not assumptions.

## Recording checklist

- Use only disposable demo or test data; never expose real credentials or tokens.
- Keep demo and live footage clearly distinguishable.
- Do not claim publication, contest acceptance, or an award before confirmation.
- Check that small text remains readable after the video platform compresses it.
- Add the final Open Exchange listing URL after publication.
