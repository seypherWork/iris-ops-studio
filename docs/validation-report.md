# Validation report

Date: 2026-09-22

## Current 1.1.0 status after the final audit

**LOCAL SOURCE AND LIVE CANDIDATE VALIDATED; PUBLICATION STATUS TRACKED SEPARATELY.**
The audit found and corrected misleading Safe demo responses, GET/HEAD body
carry-over, stale explorer output after invalid JSON, an out-of-sync endpoint
selector, missing accessible names, follow-up status/metric inconsistencies,
and a live-data layout defect. The last defect let the Access control page
expand to 1783 px in a 1440 px browser because the grid inherited the roles
table's intrinsic width. The shell and access grids now use bounded tracks;
wide tables scroll inside their panels. A CSS regression check was added.

All 57 Node tests and source syntax checks pass. Repeated coverage runs reported
98.75–98.98% aggregate line coverage across `api.js`, `explorer.js`,
`operations.js`, and `sanitization.js`; this is **not** whole-application
coverage and cannot establish that no defects remain. On an isolated,
mount-free IRIS Community 2026.2 instance at port 52780, Live IRIS login and
all ten navigation areas loaded after the CSS correction. A real `GET /info`
completed, while a cross-origin URL was rejected without sending a request.
The Incident Timeline showed 136 normalized events from three healthy sources;
source and free-text filters, including the empty-result case, worked.
Desktop 1440×900 and mobile 390×844 checks of all ten live views found no
page-level horizontal overflow. Actual Access control and Incident Timeline
screens were inspected at both sizes, including table-local scrolling and
disabled controls. The browser console had zero warning/error entries. The
latest 250 container-log lines had zero fatal/error matches and one known
journal-directory warning. No passwords, tokens, or secret values were saved
in screenshots or this report.

The corrected CSS in the running validation container matches the source
SHA-256. A separate image, `iris-ops-studio-v110-audited:20260922`, was built
from the corrected source and its installed CSS hash also matches. The earlier
52775 instance supplied the isolated user/role/resource mutation and stale
preview evidence below; its four disposable fixtures were removed and verified
absent. The earlier 50-file prepublication source package was extracted, all
its files were hash-compared with that source snapshot, and its 57 tests passed
again. Presentation-only README changes and three new Safe demo screenshots
were added afterward, so that ZIP does not represent the final presentation
and must not be used for this release. The still older 1.1.0 ZIP also predates
the code fixes and must not be used.

### 1.1.0 isolated live mutation evidence (port 52775)

- Before testing, `IrisOps_TestUser`, `IrisOps_TestRole`,
  `IrisOps_TestResource`, and `IrisOps_TestResource2` were confirmed absent.
  They were created only in this disposable, mount-free instance. The test user
  remained disabled throughout and had no permanent role assignment.
- Assigning and revoking `IrisOps_TestRole` on `IrisOps_TestUser` each returned
  a verified readback. An external assignment between preview and execution
  caused `blocked / stale`; the incident journal records that block, with no
  subsequent IRIS modify event from the blocked operation. The external
  assignment was revoked and the user returned to no roles.
- Granting `RWU`, reducing to `R`, and revoking `IrisOps_TestResource` on
  `IrisOps_TestRole` each returned a verified readback. Independent IRIS reads
  confirmed that the unrelated `IrisOps_TestResource2:R` grant survived.
  Changing that unrelated grant to `RW` after a preview caused `blocked /
  stale` rather than overwriting it. The incident journal showed the external
  modify event before the block and no later modify from the blocked action.
  The unrelated grant was restored to `R`.
- An independent final read confirmed the disabled user had no roles and the
  role again had only `IrisOps_TestResource2:R`. After inspection of their
  exact names and properties, all four disposable objects were deleted from
  this new instance as authorized; four independent `Exists()` checks returned
  false. The earlier public release, prior IRIS containers, and persistent
  volumes were not changed.

## Historical 0.2.0 validation used for 1.1.0 planning

The following evidence belongs to the earlier 0.2.0 candidate, not the revised
1.1.0 tree. Live IRIS 2026.2 validation and its visual/evidence review passed on an
isolated disposable container. The previously published release was not
changed during validation. With the user's approval, the container was stopped
cleanly and its persistent volume retained for possible rechecking. The volume
contains only validation fixtures, is excluded from the source package, and
will not be deleted without a separate explicit decision.

- Automated suite: 49 passed, 0 failed.
- Testable `api.js`, `operations.js`, and `sanitization.js` modules: 98.68%
  aggregate line coverage under Node.js 24.19.0.
- New operation-planning tests cover field allowlists, no-op detection,
  permission normalization, process/task verification, 404 termination proof,
  timeline normalization/filtering, and secret-bearing query redaction.
- The stateful mock integration covers process mutation + readback, user-role
  mutation + readback, role-resource mutation + readback, task history, and the
  asynchronous audit flow.
- Incident Timeline merges Audit, Tasks, and the in-memory Ops Studio journal;
  partial source failures do not hide healthy sources.
- Built-in process/task and access-control confirmations now identify the exact
  target, and supported operations receive a bounded second-read verification.
- Cross-origin and slash-disguised absolute request targets are rejected before
  fetch; a connection change cancels login or asynchronous polling before a
  token or stale result can cross instance context.
- Permission plans reject missing or malformed collections, compare the entire
  resulting role/resource collection, and repeat their preflight immediately
  before `PUT` to block lost updates.
- Task runs are not verified merely because `LastStarted` changed: running and
  failure states remain pending/error, and success requires a new
  `LastFinished` value.
- IRIS 2026.2 live validation exposed a collection/detail disagreement for
  task `Suspended`. Live task rows now reconcile with `/v2/task/info` and
  fail closed when detail is unavailable. The corrected view displayed the
  disposable task as Suspended, then Ready after a verified Resume.
- Browser-style absolute `response.url` values are covered for the default
  root-relative API base, preserving same-origin asynchronous polling.
- Process actions honor the official `CanBeSuspended` and `CanBeTerminated`
  flags, and journal entries retain their live/demo instance and actor context.
- All 34 catalogued method/path pairs and the user, role, process, and task
  fields used by these workflows were rechecked against the official v2
  specification snapshot at commit `f764aea`.
- The controlled local browser confirmed `Live IRIS`. Desktop 1440×900 and
  mobile 390×844 checks of Access control, Incident Timeline, navigation,
  connection and confirmation dialogs found no page-level horizontal overflow;
  wide tables scroll within their panels. The expanded confirmation body also
  remained usable at 390×844. Browser console had no error or warning entries.

Live evidence completed on the disposable instance:

1. User-role assignment and revocation of `IrisOps_TestRole` on
   `IrisOps_TestUser` produced verified readbacks. An independently changed
   user made an old preview `blocked / stale`; unrelated user fields survived.
2. Grant `RWU`, change to `R`, and revoke `IrisOps_TestResource` on
   `IrisOps_TestRole` produced verified readbacks. An unrelated grant remained
   intact. A stale preview was blocked before `PUT`; independent role readback
   and the audit sequence corroborated that no mutation followed it.
3. A dedicated `IrisOps.ValidationProcess` changed from `HANG` to `SUSP` and
   back to `HANG` through the UI. A fresh disposable instance of that routine,
   PID 1282, was terminated after explicit user confirmation. The UI reported
   `Operation executed and readback verified`, the process disappeared from the
   list, and the journal count increased. Rows with `CanBeSuspended=false` or
   `CanBeTerminated=false` exposed disabled actions.
4. Disposable task ID 1000 was suspended, resumed, and run. The live task
   detail confirmed `Suspended=false`, a new `LastFinished`, non-failure status,
   and `Error=Success` after Run; the journal recorded verified operations.
5. Incident Timeline showed Audit, Tasks, and Ops Studio healthy (3/3), with
   source, severity, fixture-name, and correlation-ID filtering exercised.
6. The last 250 container-log lines contained journal recovery, the warning
   that primary and alternate journal directories coincide, and old-error
   purging; no fatal/panic/segmentation pattern appeared. IRIS audit also
   recorded `Previous shutdown failed` after container recreation. This is
   documented, not treated as a clean shutdown.
7. A restricted live login showed `Live IRIS`, an expected HTTP 403 for the
   overview, and Incident Timeline source health of 1/3: Audit and Tasks were
   marked unavailable independently while the local Ops Studio source and
   filtering controls remained available. No browser-console warnings or
   errors were recorded.
8. After explicit approval, `IrisOps_TestRole` temporarily received
   `%Admin_Operate:U` and was assigned only to `IrisOps_TestUser` in the
   disposable instance. A fresh login yielded 2/3 source health: Audit stayed
   unavailable, Tasks displayed 47 real history records, and the Ops Studio
   source remained healthy. The role assignment was then removed and both
   objects were independently read back at their original role/permission
   values. The browser was returned to Safe demo, which clears its in-memory
   live connection. The test user remains enabled pending fixture cleanup.
9. A final Safe demo review at 1440×900 and 390×844 covered the Incident
   Timeline, Access control inventory and both mutation cards, the Journal
   panel, and mobile table-local scrolling. The document width stayed within
   both viewports and the browser console had no warning/error entries. The
   live-mode dialog checks above remain the evidence for connection and
   confirmation behavior; no new credentials were entered for this review.
10. The 49 tests and 98.68% aggregate line coverage were rerun after that
    review. The available Node runtime passed the same syntax checks and test
    suite as `npm run check`; the `npm` wrapper was unavailable in this shell.
    A fresh read-only fixture inventory found the test user enabled with only
    `IrisOps_TestRole2`, the original `IrisOps_TestResource2:R` on
    `IrisOps_TestRole`, both resources and both roles, task ID 1000 unsuspended,
    and no running validation process. The isolated container and its `/durable`
    named volume are still present. Other IRIS containers and volumes were
    inventoried only and must not be included in cleanup.
11. With user approval, only the isolated v0.2 validation container was
    stopped gracefully (`Exited (0)`). Its named volume remains present and
    mounted in the stopped container configuration; the local app endpoint is
    unavailable until this container is restarted. No container or volume was
    deleted.

Post-validation environment disposition:

1. Retain only the stopped container
   `iris-ops-studio-hardening-2026-09-22-iris-1` and its named volume
   `iris-ops-studio-hardening-2026-09-22_iris-data` as an isolated recovery
   environment until the user explicitly approves their deletion. Neither is
   included in the 1.1.0 source package.
2. Keep other containers and volumes, the earlier public release, and the
   candidate's Git state untouched except through separately approved release
   actions. No publication or contest submission is implied by validation.

## Public v0.1 result

**READY TO SUBMIT from a technical validation perspective.** Publication and
contest submission remain separate, deliberate actions.

- `scripts/validate-windows.ps1`: PASS.
- Automated suite: 25 passed, 0 failed.
- IRIS Community: 2026.2.0.221.0, container healthy during validation.
- Static application assets: HTTP 200 from `/csp/ops/`.
- Live authentication: HTTP 200 and bearer token received, then redacted.
- Live reads: `/info`, monitor dashboard, processes, and databases returned
  HTTP 200 with JSON.
- Live task execution: a disposable task ran through
  `POST /v2/task/run`; its counter changed from 0 to 1 and `LastFinished` was
  populated.
- Live process control: a dedicated disposable job changed from `HANG` to
  `SUSP`, returned to `HANG`, and disappeared after the suspend, resume, and
  terminate endpoints each returned HTTP 200.
- Invalid input: a non-numeric process identifier was rejected with HTTP 404
  without a sensitive response body.
- Connection failure: the UI reported `Failed to fetch` for an unused local
  endpoint and cleared the password field.
- Visual checks: desktop 1440x900 and mobile 390x844 passed without page
  overflow; connection and confirmation dialogs remained usable.
- Confirmation safety: an incorrect phrase kept execution disabled and the
  exact generated phrase enabled it; the dialog was canceled without sending
  the demo operation.
- Browser live mode: login completed, the UI displayed `Live IRIS`, and the
  Processes view rendered rows returned by the real SysAdmin API.
- Runtime logs: no fatal, panic, segmentation, or access-violation patterns in
  the isolated mutation run.
- Cleanup: the disposable container had no persistent mounts and was removed;
  both pre-existing IRIS containers and both named volumes remain present.

Evidence is stored in `artifacts/windows-validation.txt` and
`artifacts/live-api-validation.txt`, with the final mutation evidence in
`artifacts/live-mutation-validation-2026-09-21.txt`. The artifact directory is
intentionally excluded from Git because it contains machine-specific runtime
evidence.

## Historical automated result

The table below records the earlier September 15 review. It is retained for
traceability; the current result above supersedes its environment limitations.

## Automated result

| Check | Result | Evidence |
| --- | --- | --- |
| JavaScript syntax | Pass | `node --check` for the API client and application |
| Unit and integration suite | Pass | 21 tests, 0 failures |
| API client line coverage | Pass | 97.65% line coverage in the release review |
| Official API catalog | Pass | 27 endpoint/method pairs found in the SysAdmin API v2 specification |
| Live-style authentication fixture | Pass | Official `result.access_token` envelope accepted and redacted |
| Live-style data envelopes | Pass | Processes, storage, devices, tasks, monitor, access, web app, wallet, X.509, and OAuth fixtures use canonical IRIS field names |
| Asynchronous audit workflow | Pass | `202`, `Location`, polling, and finished result exercised end to end |
| Protected mutations | Pass | Query identifiers, risk classification, confirmation state, and response handling covered |
| Mobile contract | Pass | Viewport, horizontal navigation, mobile connection control, responsive dialog width, and bounded dialog height asserted |
| Dialog cancellation | Pass | Cancel/close controls cannot submit either form and close handlers clear transient values |
| Token destination | Pass | Cross-origin request and async-location URLs are rejected |
| Password lifecycle | Pass | Password is cleared on success, failure, cancellation, and dialog close |

## Defects found and corrected during release review

1. Mobile navigation hid the only connection-settings button.
2. Dialog cancel buttons were implicit submit controls.
3. Failed authentication left the entered password in the form.
4. The official login response envelope was not unwrapped before reading the
   access token.
5. Full API base URLs resolved `/login` against the server root instead of the
   configured `/api/admin` path.
6. Explorer and clipboard failures could produce unhandled promise errors.
7. Async-task cancellation was not classified as destructive.
8. Returning to demo mode did not discard an existing in-memory token.
9. Successful process and task mutations did not refresh the active view.
10. The `IrisOps.About` class did not follow the ZPM `src/cls` resource layout.
11. The brand link changed the URL hash without returning the rendered view to
    Overview.
12. Suspended tasks did not expose their documented Resume operation.
13. Root-relative asynchronous `Location` headers outside the configured API
    prefix were resolved incorrectly.
14. Slow, out-of-order IRIS responses could overwrite a newer navigation view.
15. Repeated Apply clicks could initiate duplicate authentication requests.
16. Static frontend delivery required a second IRIS login before the portal's
    own API authentication screen could be used.
17. Database storage and configured devices were only indirectly represented by
    overview metrics instead of using their dedicated v2 APIs.
18. OAuth appeared only in demo protected assets and had no live API workflow.

## Remaining submission work

- The Open Exchange description edit containing the public video URL was sent
  for approval on 21 September 2026.
- Confirm that the approved contest entry contains the final repository, live
  demo, and video URLs before the published deadline.
