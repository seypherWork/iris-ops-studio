# Changelog

## 1.2.0 — 2026-09-24

- Final remediation closes race conditions in access/web-app
  previews, connection changes, login, Explorer responses, and inventory
  rendering. Guided mutations recheck current state before sending a write.
  Task runs no longer treat a changed start time plus historical completion as
  new success. Error summaries remain useful while sensitive text is redacted;
  uncertain write outcomes are marked for attention.
- A fresh disposable IRIS Community 2026.2 installation was exercised with
  live Access Control and a stale-preview block; desktop 1440x900 and mobile
  390x844 navigation were checked. A disposable on-demand task was executed
  and suspended through the final image; IRIS independently confirmed a new
  successful finish and the suspended final state. The latest suite passed
  84/84 tests.
  Coverage now includes VM-executed browser `app.js`; aggregate line coverage
  is about 79%, not the earlier imported-module-only 99% figure. See
  `docs/final-remediation-validation-2026-09-24.md` for exact scope and limits.

- Post-audit hardening: secret-shaped API fields
  and authorization text are redacted; guided access changes fail closed on
  redacted input and verify the entire documented record. Process actions
  require a second identity/state read, and resume no longer accepts an
  arbitrary non-suspended state as proof of success.
- Operation previews are bound to their connection; stale connection results
  are discarded. Independent inventory sources show explicit partial data
  instead of blanking whole views. Server-local timestamps without a timezone
  are not silently ordered as browser-local time. Explorer requests remain
  inside the selected Admin API base path.
- Guided enable/disable for eligible non-system web applications, with exact
  target confirmation, fresh preflight, stale-state block, and full-config
  readback verification. Management and Ops Studio applications are excluded.
- Read-only REST service and OpenAPI catalog from the same IRIS origin; the
  browser does not forward its SysAdmin token to discovery endpoints.
- Mobile web-application and REST table actions remain visible while columns
  scroll horizontally.
- The guided registry renders before independently loaded REST documentation;
  a slow or unauthorized Management API does not hold the registry open.
- Browser-facing CSS and JavaScript asset URLs now carry the 1.2.0 version
  rather than an earlier release or temporary development label.
- Final QA excluded the remaining built-in and installer users from guided
  role assignment, removed keyword-substring false alarms from the incident
  timeline, and redacted credential-shaped audit/task text before display.
- Live QA found that task `Run` was left pending after a three-second readback
  window even when IRIS completed it on the next scheduler poll. Task runs now
  wait up to 75 seconds for a successful new `LastFinished`; other operations
  retain short readbacks. A new in-progress notice prevents a previous success
  message from appearing to certify the current operation.
- Fresh IRIS Community 2026.2 installation passed a disposable web-app
  enable/disable round trip with full-config readback. A stale preview was
  blocked, and the test fixture's original Disabled state and description
  were restored. System and default apps remained inventory-only.
- The REST catalog was unavailable under the tested browser session's
  separate Management API permissions; it does not bypass authorization.

## 1.1.0 — 2026-09-22

First public update after 1.0.0. Builds on the separately validated 0.2.0
candidate without replacing its original archive.

### Added

- Incident Timeline combining IRIS audit records, task history, and the current
  browser session's operation journal.
- Source, severity, text, entity, actor, and correlation filtering.
- Preview → target-bound confirmation → execute → readback verification for
  supported process and task operations.
- User-role assignment/revocation and role-resource grant/update/revocation.
- Schema-based allowlists for permission mutation bodies and preservation of
  unrelated role-resource grants.
- Fail-closed permission collection validation, exact full-set postconditions,
  and last-moment precondition reads that block stale `PUT` requests.
- Explicit `verified`, `pending`, `mismatch`, `error`, `unverified`, and
  `demo-verified` operation outcomes.
- Stateful mock readback routes and a dedicated operation/timeline test module.
- A 90-second jury route, v0.2 live-validation gate, and second technical article
  draft in English and Spanish.

### Changed

- Expanded the known SysAdmin API catalog from 27 to 34 endpoint/method pairs.
- Process rows now expose Resume when the current state is suspended.
- Process controls now honor the official `CanBeSuspended` and
  `CanBeTerminated` capability flags.
- Confirmation phrases for built-in workflows identify the selected target.
- Built-in administrator identities and `%` system roles are protected from the
  guided permission-editing workflow.
- Version metadata is aligned at 1.1.0.
- CI targets Node.js 22 and 24 LTS; Node.js 20 is no longer supported.
- Explorer GET/HEAD fields no longer send a retained JSON body; invalid JSON
  clears stale success output; known endpoint selection stays synchronized.
- Safe demo rejects unsupported or unsafe destinations and explicitly labels
  responses and previews as simulations. Method and path fields have accessible
  names, and the Timeline counts both live and demo-verified session changes.

### Security

- Secret-bearing query parameters are redacted before operation paths enter the
  session journal.
- Error payloads are redacted before a server-provided message is selected.
- Credential-shaped values embedded in free-text messages are redacted before
  display or journaling.
- Slash-disguised absolute URLs are rejected, async polling keeps its original
  connection/token context, and connection changes cancel stale login/polling
  results.
- The journal stays in page memory and is discarded on reload.

### Validation status

- 57 automated tests pass with zero failures, including a regression check for
  live security tables enlarging the page grid.
- Testable API, explorer, operation, and sanitization modules: 98.75–98.98% line
  coverage; the browser application module is not included in this figure.
- All 34 catalogued method/path pairs exist in the official SysAdmin API v2
  specification.
- Earlier 0.2.0 live permission, process, and task mutations passed on
  disposable IRIS 2026.2 fixtures. Revised 1.1.0 user-role and role-resource
  mutations, readbacks, and stale-preview blocks passed on separate disposable
  fixtures, which were subsequently removed and independently checked. A fresh
  IRIS 2026.2 installation passed authenticated read-only and responsive UI
  checks. The candidate ZIP was extracted and retested separately. See
  `docs/validation-report.md` for evidence and limitations; this release does
  not implement a server-enforced per-tab read-only mode.
