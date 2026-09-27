# Combined guard validation — one identity, separate operation authority

Status: COMBINED LAB PILOT VALIDATED; all listed regression gates passed.
NOT READY for general production release.
Date: 2026-09-26. Public baseline 1.2.1 is unchanged; no commit/push/publication.

## Implemented scope

One current-user native login serves wallet policy and Web application
availability through `/api/irisops-combined-guard`. The dispatcher maps only
constant `wallet` and `webapp` prefixes to our two existing implementations.
Channel kind is validated on the server, including enable/disable. Preview
cancellation, execution, receipt access and reconciliation enforce kind too.
The browser keeps separate controllers, write timers and recovery keys. A
shared logout/expiry invalidates both; switching workspaces never enables a
write. Reconnection starts both channels read-only.

Fixed targets remain `IrisOps_GuardProbeWallet` and
`/csp/irisops-guard-testweb` on the pinned 52801 laboratory. No new target,
production installer, service identity, cross-instance proxy or direct native
browser fallback was added. Other workspaces are explicitly unavailable here.

The native capability map guides UI controls but does not authorize dispatch.
Wallet requires its native permission; Web applications additionally require
%Admin_Secure:U and %DB_IRISSYS:R. The original permission and fresh readback
checks remain in each operation. Revocation is tested independently.

## Findings while integrating

1. The intended `/api/irisops-guard` path was already owned by the original
   read-only feasibility probe in %SYS. The runner stopped on its ownership
   check before replacing anything. A new isolated path was used instead.
2. The original per-application channel isolation was insufficient once both
   operations shared a session. Explicit server-side channel kind binding and
   cancellation-kind checks were added before enabling the combined profile.
   Existing sessions require reconnection after this lab code update.
3. Capability labels needed refresh when connection/permission state changed;
   unavailable Web application reads are now skipped in the UI. The server
   continues to enforce permission independently of this presentation.
4. Navigation during an outstanding request could otherwise change the active
   operation controller. A shared busy guard prevents switching then; pending
   previews are cancelled on normal workspace change. Late login/attach
   responses are discarded by the common session generation.

Two first-run test assertions also required correction: cookie attribute names
are case-insensitive, and a percent sign in a URL test must be encoded. These
were test-harness defects, not relaxed authentication or target checks.

## Verification

- 152/152 JavaScript tests, including 10 new combined-controller/session groups.
- Direct real-IRIS tests cover shared authentication, independent readonly
  channels, cross-kind enable/disable/preview/cancel/execute/replay/recovery,
  forward/reverse writes, unknown readbacks, current native permission changes,
  common logout and readonly recovery after reconnect.
- Real main-UI tests cover one login, separate approvals/results, inverses,
  recovery after reload, navigation while a request is pending, lost responses,
  UNKNOWN versus current match, limited-role controls, common disconnect,
  secret-free journal and no direct administrative API requests.
- Real screenshots at 1440x900 and 390x844 are under `combined-ui-evidence/`.
  Screenshots were inspected for dialogs, layout, disabled controls and explicit
  uncertainty. Recovery proofs and credentials are not displayed.
- Final syntax checks passed for all 37 JavaScript/MJS files in web, mock and
  experimental/guard; all 152 tests passed again. npm.cmd is not available in
  this runtime, so its check commands were executed directly with bundled Node.
- Actual shared authorization expiry passed: both operations returned 401
  after the real 60-second lifetime, with zero additional native PUTs.
- The final mobile run also navigated between both workspaces at 390x844;
  the limited-role controls stayed independently enabled/disabled. Known random
  credentials and recovery proofs were absent from browser console messages,
  the visible journal and inspected container logs. Network-error messages from
  deliberately aborted requests are expected, not application exceptions.

### Final live evidence (UTC, 2026-09-26)

| Suite | Check groups | Final timestamp | Result |
| --- | ---: | --- | --- |
| Combined operations and UI | 23 (includes 11 UI) | 15:49:40.512Z | complete/restored/cleanupComplete true |
| Full existing wallet regression | 68 (includes 15 main UI) | 15:46:26.733Z | complete/restored true |
| Full existing webapp regression | 34 (includes 10 main UI) | 15:48:07.981Z | complete/restored true |
| HTTP transport and custody | 38 | 15:48:15.478Z | completed true, featureReady false |

These are grouped scenario checks, not independent coverage percentages; UI
groups are included in their parent suites, not additional totals. Source JSON:
`combined-evidence.json`, `wallet-integrated-evidence.json`,
`webapp-execution-evidence.json`, `http-transport-evidence.json`.
Final combined UI evidence is `combined-ui-evidence/result.json` at
15:49:38.638Z: complete true, zero page exceptions and zero browser requests to
the native /api/admin endpoint. The final run's screenshots were reviewed too.

## Preservation and limits

Before edits, `experimental/` and `web/` were copied into the sibling
`iris-ops-guard-pre-combined-20260926` backup; four key hashes were compared.
This is a source backup, not a database backup. The runners pin the container
ID, reject fixture collisions, compare historical public receipt hashes,
restore both native fixtures and the original native dispatcher, then remove
only their own seven temporary fixtures. Persistent receipts remain.

Final read-only inspection additionally confirmed: original /api/admin enabled,
empty application Resource and %Api.Admin dispatcher; original feasibility
probe unchanged in %SYS; combined application bound to our IRISOPS dispatcher;
all combined/wallet/webapp test users, roles, resources and targets absent.
The pinned container remains running. No disk, volume, project folder or
historical receipt was deleted. The temporary fixtures can be recreated by
their runners, not recovered as user data. Public README.md, package.json and
module.xml have no Git diff; web/index.html and styles.css match the pre-combined
backup. Existing development edits remain uncommitted and unpublished.

Still NOT READY for general release: only two disposable targets, HTTP loopback
lab, 60-second authorization, no supported production deployment/upgrade,
no full-product migration, no cross-instance management or server protection
of direct native clients. Native GET/PUT is not an atomic compare-and-swap;
an outside client may race after the final read. Current-state reconciliation
does not prove causality or rewrite an uncertain original result.

## Reproduce, sequentially

1. Set IRISOPS_DOCKER_EXECUTABLE, IRISOPS_PLAYWRIGHT_MODULE and
   IRISOPS_BROWSER_EXECUTABLE to the verified local runtimes.
2. `node experimental/guard/verify-combined.mjs` with
   IRISOPS_COMBINED_UI=1 and IRISOPS_COMBINED_FAST unset (real expiry included).
3. Full separate wallet regression with audit/recovery/UI/extended flags.
4. Full separate webapp regression with IRISOPS_WEB_UI=1 and fast flag unset.
5. Positive HTTP transport/custody suite, unit/syntax tests, visual review and
   final fixture/configuration/public-file preservation checks.

Never run live runners simultaneously; they temporarily instrument the same
isolated native API and use the same collision-checked disposable targets.

## Validated implementation fingerprints (SHA-256)

These identify the local code under test, not a new public release archive.

| File | SHA-256 |
| --- | --- |
| IrisOps.Guard.CombinedApi.cls | 65688CF0B602E5D1C575208807490D3443BA130114F3422CBA58AAA0BFCAEA8C |
| IrisOps.Guard.HttpApi.cls | DFEF48BE63E9A7DEFE5579CA079BDA14A8D59F965BE8DE55178A9FA41E3297DC |
| IrisOps.Guard.Execution.cls | 27DC501E46D3D468C43191B7A46E8AE7037C305853E52787B3D57B1C2DFB921E |
| experimental/guard/ui/client.js | 5AFA6856F70C63E7C41A121061983EDCE366A59574CDFCCE779D7C9A819392CF |
| experimental/guard/ui/session.js | 52123D5C209ABD5201BCE10618E0C9A0ED5641E299F1CAA0F8F3E567F682365C |
| web/assets/combined-guard.js | BCBEC6FBB9DE3F21C9BD671751B4D433189230297779B93AD3FC7CE862E3D046 |
| web/assets/wallet-guard.js | 7D3F94078F44BBF01A7BAE48A2012A28FEBF6FC2730B9E19BF74F24BF51C2D2D |
| web/assets/app.js | 2F1BC1902DB8C576C057BE41A5AD438C0275D852FC36E4797E32402623452AC2 |
