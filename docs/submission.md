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
audit events, and direct SysAdmin API exploration.

The differentiator is operational safety. Every request is classified before it
is sent. State changes require a generated confirmation phrase, destructive
routes receive stronger visual treatment, and sensitive response fields are
redacted at the transport boundary. A dependency-free demo mode makes the full
workflow reviewable without credentials.

## What to demonstrate

1. Open the overview in demo mode and show the responsive navigation.
2. Open Processes and compare Suspend with the clearly destructive Terminate
   action.
3. Attempt an action and show that it remains disabled until the exact phrase is
   entered.
4. Open the API explorer and show automatic read/mutation/destructive labels.
5. Open Storage & devices and show database mount state and configured devices.
6. Open OAuth 2.0 and show client, resource, and authorization-server metadata.
7. Connect to a disposable IRIS 2026.2 instance and load live process and task
   data.
8. Run the audit query and show its asynchronous result handling.
9. Show that token, password, private-key, and secret strings never appear in
   rendered responses.

## Technical highlights

- Static browser application with zero production JavaScript dependencies.
- Official IRIS SysAdmin API v2 paths and response envelopes.
- Polling support for `202 Accepted` administrative jobs through the returned
  `Location` header.
- Query-parameter encoding for process and task identifiers.
- Same-origin enforcement before an access token follows an asynchronous task
  URL.
- ZPM package, IRIS namespace installer, and container build.
- Verified with IRIS Community 2026.2.0.221.0 on Windows and Docker Desktop.
- 25 automated syntax, client, redaction, timeout, async-job, UI-contract, and
  mock-server tests.

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

## Final factual checks

- State the exact tested IRIS version.
- Report the final automated test count.
- Do not describe demo fixtures as live IRIS measurements.
- Do not claim a prize, acceptance, or payment before official confirmation.
