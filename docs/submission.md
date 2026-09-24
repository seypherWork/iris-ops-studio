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
an Incident Timeline spanning audit/task/session evidence, direct SysAdmin API
exploration, and optional read-only REST documentation discovery.

The differentiator is operational safety with evidence. Supported state changes
follow Preview → target-bound confirmation → Execute → Readback and receive an
explicit verification result in the in-memory operation journal. User-role and
role-resource updates are rebuilt from documented mutable fields. Sensitive
response and query fields are redacted before evidence is rendered. A
dependency-free, stateful demo makes the workflow reviewable without
credentials.

Version 1.2.0 adds guided availability changes for eligible non-system web
applications. It re-reads the complete documented configuration immediately
before the update and verifies the complete readback afterward. A separate
same-origin REST catalog reads documentation only when the browser session is
independently authorized; it does not reuse the SysAdmin token.

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
11. In Web apps, show protected system/default rows, an eligible Safe demo
    application, its target-bound preview, and the separate REST catalog's
    explicit permission-denied state when Management API access is unavailable.

## Technical highlights

- Static browser application with zero production JavaScript dependencies.
- Official IRIS SysAdmin API v2 paths and response envelopes.
- Polling support for `202 Accepted` administrative jobs through the returned
  `Location` header.
- Query-parameter encoding for process and task identifiers.
- Same-origin enforcement before an access token follows an asynchronous task
  URL, with polling canceled if the connection context changes.
- Readback verification for process, task, user-role, and role-resource changes.
- Task `Run` waits through the documented scheduler delay and requires a new
  successful `LastFinished` before claiming verification; a timeout remains
  explicitly pending.
- Full-configuration preflight and readback for eligible web-application
  availability changes, with stale-preview blocking.
- Read-only, same-origin REST/OpenAPI documentation discovery that never
  invokes listed operations or forwards the SysAdmin token.
- Fail-closed access updates with stale-preview blocking and exact full-set
  verification.
- Three-source Incident Timeline with source, severity, free-text, entity, and
  correlation filtering.
- ZPM package, IRIS namespace installer, and container build.
- Fresh IRIS Community 2026.2 installation of the 1.2.0 image passed
  authenticated read-only navigation and cache-header checks. A separate
  disposable installation passed an eligible web-app enable/disable round
  trip and stale-preview block; the fixture was restored afterward. Exact
  scope and limits are in `docs/web-app-development-validation.md`.
- On the final corrected static assets, another isolated IRIS 2026.2 instance
  verified dedicated Access, process, task, and web-app fixtures, including
  task completion after a scheduler delay. The fixtures were left disabled,
  suspended, or without grants as applicable. A freshly rebuilt image with
  those same assets became healthy and passed unauthenticated boundary and
  file-hash checks; authenticated mutations were not repeated in that second
  container. A subsequent final image was tested with an authenticated,
  on-demand task Run/Suspend and independent IRIS readback; see
  `docs/final-remediation-validation-2026-09-24.md`. Earlier evidence is in
  `docs/final-qa-2026-09-24.md`.
- Earlier 0.2.0 workflows were verified with IRIS Community 2026.2.0.221.0
  on Windows and Docker Desktop. Revised 1.1.0 user-role and role-resource
  mutations, readbacks, and stale-preview blocks passed on dedicated disposable
  fixtures, which were then removed and independently checked. Its fresh
  installation passed authenticated read-only and visual checks on another
  disposable IRIS instance. The browser controls do not replace IRIS's
  server-side authorization; there is no server-enforced per-tab read-only mode.
- 84 automated tests covering the client, browser coordination, explorer, permission plans,
  readback, journal, timeline, REST discovery, redaction, timeouts,
  asynchronous jobs, UI contracts, and mock server; JavaScript syntax checks
  are separate.
- Approximately 79.4% aggregate line coverage in the latest run, including
  browser `app.js` through a VM harness. This does not establish coverage of
  all UI interactions or live IRIS behavior; the previous 99.00% figure used
  a narrower imported-module-only denominator.

## Submission links

- Public repository: https://github.com/seypherWork/iris-ops-studio
- Public demonstration: https://seypherwork.github.io/iris-ops-studio/
- Original overview video: https://www.youtube.com/watch?v=Vxn_usXOEPU
- Guided Operations video: https://www.youtube.com/watch?v=ezfg4a-BCUk
- Incident Timeline video: https://www.youtube.com/watch?v=CCJjEhDIXYQ
- Open Exchange application: https://openexchange.intersystems.com/package/IRIS-Ops-Studio

## Submission status

- Published on InterSystems Open Exchange on 21 September 2026.
- Contest participation was selected for **InterSystems Programming Contest:
  Build Your Own Management Portal**.
- The original application and three video walkthroughs are public; verify
  the current Open Exchange listing version and media independently.
- Version 1.1.0 has completed local regression, desktop/mobile visual review,
  authenticated live read-only checks, and isolated user-role and role-resource
  mutation testing. A fresh candidate package was extracted, hash-compared,
  and retested. The validation report records the exact evidence and remaining
  limitations.
  Contest and Open Exchange publication statuses must be checked separately;
  do not infer approval or a prize from a local test result.
- Version 1.2.0 completed scoped validation on disposable IRIS Community
  2026.2 instances, plus a separate fresh image install and local automated
  checks. The final post-audit corrections and their distinct live/synthetic
  evidence are in `docs/final-remediation-validation-2026-09-24.md`. Version
  1.2.0 publication status must be checked independently. The limits above remain;
  do not claim the app is error-free or that
  its browser controls enforce server-side read-only policy.

## Final factual checks

- State the exact tested IRIS version.
- Report the final automated test count.
- Do not describe demo fixtures as live IRIS measurements.
- Do not claim a prize, acceptance, or payment before official confirmation.
