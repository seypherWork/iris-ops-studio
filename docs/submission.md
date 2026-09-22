# Contest submission record

## Application name

IRIS Ops Studio

## Tagline

A safety-first operational console for the InterSystems IRIS SysAdmin API.

## Short description

IRIS Ops Studio gives operators a focused, responsive interface for monitoring
an IRIS deployment and performing controlled administrative actions. It covers
processes, database storage, operating-system devices, scheduled tasks, access
control, web applications, protected-asset metadata, OAuth 2.0 configuration,
an Incident Timeline spanning audit/task/session evidence, and direct SysAdmin
API exploration.

The differentiator is operational safety with evidence. Supported state changes
follow Preview → target-bound confirmation → Execute → Readback and receive an
explicit verification result in the in-memory operation journal. User-role and
role-resource updates are rebuilt from documented mutable fields. Sensitive
response and query fields are redacted before evidence is rendered. A
dependency-free, stateful demo makes the workflow reviewable without
credentials.

## What to demonstrate

1. Open the overview in demo mode and show the responsive navigation.
2. Open Processes and compare Suspend with the clearly destructive Terminate
   action.
3. Attempt an action and show its current/expected state, target-bound phrase,
   readback endpoint, and verified journal result.
4. Open Access control and preview a user-role or role-resource change.
5. Open Logs & audit and filter Incident Timeline across Audit, Tasks, and Ops
   Studio events.
6. Open the API explorer and show automatic read/mutation/destructive labels.
7. Open Storage & devices and OAuth 2.0 to show infrastructure and security
   metadata.
8. Connect to a disposable IRIS 2026.2 instance and load live process and task
   data.
9. Run the audit query and show its asynchronous result handling.
10. Show that known token, password, private-key, credential, and secret fields
    plus credential-shaped free text are redacted from rendered responses.

## Technical highlights

- Static browser application with zero production JavaScript dependencies.
- Official IRIS SysAdmin API v2 paths and response envelopes.
- Polling support for `202 Accepted` administrative jobs through the returned
  `Location` header.
- Query-parameter encoding for process and task identifiers.
- Same-origin enforcement before an access token follows an asynchronous task
  URL, with polling canceled if the connection context changes.
- Readback verification for process, task, user-role, and role-resource changes.
- Fail-closed access updates with stale-preview blocking and exact full-set
  verification.
- Three-source Incident Timeline with source, severity, free-text, entity, and
  correlation filtering.
- ZPM package, IRIS namespace installer, and container build.
- Earlier 0.2.0 workflows were verified with IRIS Community 2026.2.0.221.0
  on Windows and Docker Desktop. Revised 1.1.0 user-role and role-resource
  mutations, readbacks, and stale-preview blocks passed on dedicated disposable
  fixtures, which were then removed and independently checked. Its fresh
  installation passed authenticated read-only and visual checks on another
  disposable IRIS instance. The browser controls do not replace IRIS's
  server-side authorization; there is no server-enforced per-tab read-only mode.
- 57 automated syntax, client, explorer, permission-plan, readback, journal, timeline,
  redaction, timeout, async-job, UI-contract, and mock-server tests.
- 98.75–98.98% line coverage observed across repeated runs of the testable API,
  explorer, operation, and sanitization modules; this does not include the
  browser application module.

## Submission links

- Public repository: https://github.com/seypherWork/iris-ops-studio
- Public demonstration: https://seypherwork.github.io/iris-ops-studio/
- Video demonstration: https://www.youtube.com/watch?v=Vxn_usXOEPU
- Open Exchange application: https://openexchange.intersystems.com/package/IRIS-Ops-Studio

## Submission status

- Published on InterSystems Open Exchange on 21 September 2026.
- Contest participation was selected for **InterSystems Programming Contest:
  Build Your Own Management Portal**.
- The Open Exchange application and final YouTube demonstration are public.
  The video-link edit was sent to Open Exchange for approval on 21 September
  2026.
- Version 1.1.0 has completed local regression, desktop/mobile visual review,
  authenticated live read-only checks, and isolated user-role and role-resource
  mutation testing. A fresh candidate package was extracted, hash-compared,
  and retested. The validation report records the exact evidence and remaining
  limitations.
  Contest and Open Exchange publication statuses must be checked separately;
  do not infer approval or a prize from a local test result.

## Final factual checks

- State the exact tested IRIS version.
- Report the final automated test count.
- Do not describe demo fixtures as live IRIS measurements.
- Do not claim a prize, acceptance, or payment before official confirmation.
