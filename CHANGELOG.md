# Changelog

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
