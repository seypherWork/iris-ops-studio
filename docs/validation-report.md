# Validation report

Date: 2026-09-20

## Current result

**READY TO SUBMIT from a technical validation perspective.** Publication and
contest submission remain separate, deliberate actions.

- `scripts/validate-windows.ps1`: PASS.
- Automated suite: 25 passed, 0 failed.
- IRIS Community: 2026.2.0.221.0, container healthy during validation.
- Static application assets: HTTP 200 from `/csp/ops/`.
- Live authentication: HTTP 200 and bearer token received, then redacted.
- Live reads: `/info`, monitor dashboard, processes, and databases returned
  HTTP 200 with JSON.
- Visual checks: desktop 1440x900 and mobile 390x844 passed without page
  overflow; connection and confirmation dialogs remained usable.
- Browser live mode: login completed, the UI displayed `Live IRIS`, and the
  Processes view rendered rows returned by the real SysAdmin API.
- Runtime logs: no fatal, panic, segmentation, or access-violation patterns in
  the isolated live-API run.

Evidence is stored in `artifacts/windows-validation.txt` and
`artifacts/live-api-validation.txt`. No real mutation was sent to IRIS.

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

- Record the final demo video if the contest requires one.
- Publish the repository and Open Exchange page only after explicit approval.
- Send the contest submission only after explicit approval.
