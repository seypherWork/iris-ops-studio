# IRIS Ops Studio 1.2.0 — post-audit candidate review

Status: **local fixes validated; not yet cleared for publication**. This review
applies to the unpublished 1.2.0 development tree after the earlier IRIS 2026.2
checks in `web-app-development-validation.md`. Those earlier live checks do not
automatically validate the code changed here. No public repository, Open
Exchange listing, or real IRIS instance was changed during this review.

## Defects corrected

1. API-key and authorization-shaped fields and Basic authorization text are
   redacted before Explorer display/copy; secret-bearing route segments are
   redacted in the operation journal.
2. Guided user-role and role-resource readback compares the complete documented
   mutable record, not just the requested role or resource. Redacted fields
   block these write plans rather than being copied back into a `PUT`.
3. Process actions capture the selected PID's observable identity and state,
   then re-read before sending the change. Resume requires a documented active
   process state; an arbitrary non-`SUSP` value no longer counts as verified.
4. A preview is tied to the selected connection revision and demo/live mode.
   Connection changes block preflight execution and discard stale read-only
   responses. Asynchronous Access and REST catalogs do not replace a newer
   page's state.
5. Overview, storage, Access, Secrets, and OAuth retain available sources when
   a separate source fails; affected controls are disabled and an explicit
   partial-data notice is shown.
6. Explorer destinations remain inside the selected Admin API base path.
   Timeline events with server-local timestamps of unknown timezone are not
   silently treated as browser-local instants.
7. Mock integration tests request an ephemeral local port, so two candidate
   copies no longer fail spuriously when their suites run at the same time.

## Evidence collected after the fixes

- Six JavaScript syntax checks passed. Node's test runner passed **69/69**
  automated tests, including redaction, complete-record verification, process
  identity, URL confinement, and mock partial-source responses. The development
  and publication-staging copies also passed concurrently after the port fix.
- Measured line coverage is **98.81%** for imported `api.js`, `explorer.js`,
  `operations.js`, `rest-discovery.js`, and `sanitization.js`. Branch coverage is
  79.45%. These numbers **exclude `app.js`** and cannot certify browser
  interactions.
- A browser connected with fictitious credentials to a local mock, not IRIS,
  loaded all ten areas without a page-level failure or captured console error.
  Access and storage were also checked against a mock that deliberately denied
  one source: available tables remained visible, the unavailable source was
  labeled, and its dependent access controls were disabled.
- The mock now serves the project's mobile QA fixture. Its iframe measured
  390 × 844; the content viewport measured 373 CSS pixels after scrollbar and
  border. Overview, Access Control, Web apps, and the Access confirmation dialog
  were inspected inside it. The dialog fit horizontally, required the typed
  phrase, and kept Execute disabled until entry; management and Ops Studio web
  application controls remained disabled. One browser-console message about a
  `MutationObserver` appeared in this iframe harness without a source URL. The
  project code contains no `MutationObserver`; attribution is unconfirmed.
- Earlier in this same local review, Safe demo simulated a process suspend and
  a user-role assignment, both reporting demo-verified readbacks and journal
  entries. No request was sent to IRIS for those actions.

## Remaining release gates and limits

- Reinstall this post-audit build in a **disposable** IRIS Community 2026.2
  instance and re-run authenticated read and approved test-fixture mutation
  checks. Do not infer those results from the earlier 1.2.0 image.
- Repeat exact-size 1440 × 900 desktop review and a full-area mobile review if
  the browser environment supports them. This review inspected the normal
  1280 × 720 browser and selected views in a measured 390 × 844 mobile iframe;
  the browser's global viewport override did not take effect. Earlier exact
  desktop evidence pertains to a pre-audit build.
- The second process read is best-effort, not an atomic server compare-and-set;
  a PID could theoretically be reused between that read and the request.
  Task-run verification lacks a per-run correlation identifier.
- The per-tab safe mode remains a browser-side workflow, **not** a server-
  enforced read-only policy. IRIS authorization is the server-side boundary.
  The optional REST catalog still requires its own Management API session.
- No claim is made that every endpoint or every failure mode has been tested,
  that all defects are absent, or that an in-place upgrade is verified.
