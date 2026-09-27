# Judge evaluation route

IRIS Ops Studio has **two independent entry points**. The standard console
offers broader SysAdmin coverage and connects directly from the browser to
IRIS. The optional managed guard offers four narrowly enrolled workflows with
server-enforced READ_ONLY. Installing either one does not install or protect the
other. Please evaluate them separately.

## First five minutes: understand the product

1. From the repository root, run `npm run check` with Node.js 22 or newer.
   Read the final test counts; they are not a claim that every IRIS operation
   was exercised live.
2. Run `npm start` and open `http://127.0.0.1:4173`. This is **Safe demo**.
   Inspect a process preview, a target-bound permission preview and Incident
   Timeline. Changes here are simulated and visibly labeled as such.
3. Review the screenshots and the three existing videos. They illustrate
   earlier console releases, not a live test of this guard candidate.

## Standard console: broad, direct API

Follow the root README's **Run with InterSystems IRIS** section on a new,
disposable IRIS Community 2026.2 instance. Turn Safe demo off in Connection
settings and enter the disposable operator's credentials directly in the page.
Inspect Overview, processes, tasks, storage, access, web applications and
Incident Timeline. Enable the optional native log source separately only if
the operator has its stated native permissions.

The real Overview displays IRIS performance, license and session metrics;
the CPU and memory percentage gauges are demo-only. This direct console has
browser-side operation safeguards and native IRIS authorization, but **does
not** impose a server READ_ONLY mode on every SysAdmin route. Do not test a
mutation against a production instance or an unrelated account.

## Managed guard: narrow, server-enforced workflow

Use the exact-hash review ZIP attached to the corresponding GitHub release.
Extract into a new directory, run `node portable.mjs verify` there, then follow
its `JUDGE-GUIDE.md`. The interactive installer asks for an isolated container
name, unused loopback port and new receipt directory. It creates no login user,
imports no certificate trust and does not enroll targets automatically.

Provision a separate local operator and owned disposable wallet, web app,
custom role/private resources and disabled test user as described in the guide.
Never use the login operator as the user-membership target. Compare the public
certificate fingerprint before choosing whether to trust the laboratory CA.
Enter private passwords only in IRIS or the connection form.

Evaluate in this order:

1. Connect with Safe demo disabled. Confirm that the server reports READ_ONLY.
2. Check that an attempted write is denied by the server before any workflow
   approval; a disabled button alone is not sufficient evidence.
3. On one owned fixture, use a separately approved workflow, inspect the exact
   target, before/after preview and typed confirmation, then inspect native
   readback and the durable receipt. Reverse it through a **new** preview.
4. Alter only a test fixture after preview to check that a stale preview is
   blocked. Restore the fixture and verify its final state.
5. Disconnect/reconnect and inspect an existing receipt. Observation or
   reconciliation must not resend a possibly completed write.

Only Wallet, Web apps, Access control and the local Session journal are served
in the managed UI. Overview, processes, tasks, storage, native logs, OAuth and
Explorer are intentionally outside this server boundary. A missing enrollment
or native privilege disables the corresponding workflow; it is not silently
simulated. Per-workflow write approval and previews are short-lived. The
[local validation record](session-hour-validation-20260927.md) documents one
real browser session reaching the one-hour boundary; it does not establish a
scripted long-duration pass for the eventual release archive.

## Decision evidence

The [official contest](https://openexchange.intersystems.com/contest/48)
names Complexity, Clarity of Instructions, Developer Experience,
Applicability and Usability as judging criteria. The strongest technical
evidence here is server-enforced denial for a deliberately narrow surface,
fresh preconditions, readback and durable uncertain-result recovery. The
trade-off is extra setup and less guarded feature coverage. A successful Safe
demo, a passing test count or a polished video alone is not proof that the
managed guard works in a new IRIS instance.
