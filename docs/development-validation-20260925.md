# Development validation — 2026-09-25

Status: **VERSION 1.2.1 TESTED ON DISPOSABLE IRIS; PUBLICATION STATUS MUST BE VERIFIED SEPARATELY**.
The work began without modifying the earlier public 1.2.0 release. At the time
of these local tests, no commit, push, release or Open Exchange edit had been
performed.

## Verified today

- `pnpm run check`: 103 JavaScript tests passed; syntax checks passed.
- Node 24 coverage run: 103 passed, 0 skipped, aggregate line coverage 81.17%,
  branches 71.03%, functions 78.57%. This is the measured Node test-run coverage,
  not complete browser coverage or a claim of correctness. It includes app.js
  and VM regression loading; do not reuse older releases' coverage percentages.
- Python on the Windows host: 5 tests passed and 15 POSIX reader tests explicitly
  skipped. The reader requires POSIX no-follow and directory-relative opens;
  Windows does not supply the required contract. Unsupported platforms return
  a clear 503 without opening a file. Subsequently, all **20/20 passed without
  skips on Linux in both disposable IRIS instances**. Windows skips are not
  counted as passes.
- `scripts/verify-wallet-demo.mjs`: actual headless Chrome, 1440×900 and 390×844.
  Unchanged policy blocked, typed confirmation required, local fixture changed
  and reread, journal says `demo-verified`, zero mutation HTTP requests and zero
  browser JavaScript exceptions. Both screenshots were visually inspected.
- `git diff --check`: no whitespace errors.

Generated local evidence (ignored by Git):
`artifacts/wallet-demo/evidence.json`, `wallet-preview-desktop.png`, and
`wallet-editor-mobile.png` in that directory.

## New checks and corrections

- Wallet validates documented collection-name syntax and 64-character limits.
- Canonical comparison includes both access-policy fields, normalizes permission
  abbreviations/defaults, and treats resource names case-insensitively.
- Tests prove stale, deleted and malformed fresh snapshots send no PUT.
- Tests prove both a late draft read and an already prepared operation are
  invalidated by connection changes. Cancel discards the draft without writing.
- Complete normal sequence is GET (draft), GET (fresh guard), PUT, GET (readback).
- Native-log card identifies its separate read-only extension, not SysAdmin API.
- Live browser runner prepared at `scripts/verify-wallet-browser.mjs` for
  test-only collection, resources, user and role, with collision checks and
  cleanup. Subsequently executed successfully on development and fresh-install
  instances, as detailed below.

## Docker blocker — resolved for this run, not permanently

Docker was initially stopped. Normal startup failed before the Linux engine
pipe appeared. Today's backend log again reports the stale runtime socket
`C:/Users/ilyas/AppData/Local/Docker/run/sailor-ingest.sock` could not be renamed.

Read-only inspection found four zero-byte runtime entries in Docker/run and
one in docker-secrets-engine. The Docker data disk remains present, but mere
presence is not a database integrity check.

A new exact-path reversible quarantine was confirmed by the user and completed.
Both runtime directories and all five zero-byte entries were verified at their
quarantine destinations. No deletion or relocation of container data, volumes,
disks, previous quarantines or project files occurred. Docker server 29.7.2 now
responds; existing containers and all eight named volumes remain listed.
The complete inventory/rollback report is `../docker-recovery-20260925.md`
outside this repository. This workaround is not a permanent startup fix.

## Real IRIS evidence after recovery

IRIS Community **2026.2.0.221.0com**, localhost only:

- Development: `iris-ops-native-logs-20260924`, port 52788.
- Fresh build/install: `iris-ops-native-logs-final-20260924`, port 52789.
- New image: `iris-ops-studio-native-logs:validation-20260925`.
- Image config: `sha256:bc0c515e573be21a0800d644aae11e6a8ffe15129b014fec34356a3f31ef71b4`.
- Both instances reported running/healthy. Fresh build showed successful
  installer, package validation, compilation and activation of both web apps.
- The fresh container received no manual application-asset corrections.
  Installed `index.html`, `app.js`, `wallet-policy.js` and `irisops_logs.py`
  SHA-256 values matched the working-tree originals exactly.

Both instances passed wallet browser tests: cancel/no write, wildcard refusal,
real concurrent change causing stale preview and **zero browser PUTs**, normal
PUT with both-field readback and independent API confirmation, desktop/mobile
layout, and IRIS403 for both GET and PUT without `%Admin_Wallet:U`.
Zero secret-value requests and zero browser JavaScript exceptions were observed.
Original fixture policy restored, then test collection, three test resources,
user and role removed; absence verified.

Both instances passed native-log browser tests: three real sources, synthetic
credential redaction before display, append-invalidated snapshot409 with clear
recovery, older/latest paging, mobile controls, and live-cache removal when
switching to Safe demo. Zero browser JavaScript exceptions.

Both instances passed native-log HTTP tests: unauthenticated/restricted denial,
authenticated reads, no-store header, POST/PUT/PATCH/DELETE405, path-source and
duplicate-source400, token renewal, and explicit observation of IRIS JWT sharing
across applications (not an application-scoped credential claim).

### Defect found only in the real visual review

IRIS served the static HTML with a charset that corrupted literal UTF-8 symbols
in the new wallet dialog. Changed these static symbols to HTML entities,
added an ASCII-only static-HTML regression check and live DOM assertions for the
close symbol and label dash. Repeated wallet live tests successfully and visually
inspected the corrected mobile screenshot. Fresh installation used the fix.

Evidence directories (ignored by Git): `artifacts/wallet-policy/`,
`artifacts/native-logs/`, `artifacts/wallet-policy-final/`,
`artifacts/native-logs-final/`. Each contains sanitized JSON and screenshots.
Final native-log desktop/mobile and wallet mobile screenshots were inspected.
Test runner changes after image build only separated artifact destinations;
deployed application sources did not change afterwards.

## Versioned archive and newly detected runtime defect

The 1.2.1 `r2` archive was integrity-checked, extracted, built and installed
in an additional no-volume disposable instance (port 52790). Static assets,
native reader and installed version matched the extracted archive; 102/102
JavaScript and 20/20 Linux Python tests passed. However, the live authenticated
native-log read returned HTTP 503. The temporary `IrisOps_TestUser` and
`IrisOps_TestRole` were removed by the test's `finally` cleanup.

Diagnosis from the installed IRIS class: `ManagerDirectory()` changed to the
durable runtime manager path, while ZPM's `FileCopy` had installed the Python
reader under the original installation manager path. `LogApi.ReadPage` now
checks the runtime manager location and then the fixed installation-manager
location. A packaging regression test covers both paths. This is a real defect
found only by installing and exercising the versioned archive, not just by
running unit tests.

The corrected `r3` archive was SHA-256 verified with a 77-file manifest,
extracted, and passed 103/103 JavaScript tests. Its fresh build installed
version 1.2.1 in another isolated, zero-mount IRIS Community 2026.2 instance
(port 52791). The installed HTML, CSS, JavaScript and Python reader hashes
matched the extracted files. Linux Python tests passed 20/20. Live HTTP checks
passed real `messages.log`, System Monitor and Alerts reads, unauthenticated
and restricted denial, `no-store`, GET-only rejection of POST/PUT/PATCH/DELETE,
invalid/duplicate source rejection, JWT renewal and honest shared-token
behavior. The temporary account and role were removed.

Fresh browser runs on that corrected installation passed the native-log
desktop/mobile, redaction, pagination/invalidation, demo-switch and no-console-
exception checks. The wallet run passed cancel/no PUT, wildcard refusal,
stale-preview/no PUT, successful PUT plus readback, permission denial,
restoration and fixture cleanup. The 1440×900 and 390×844 screenshots were
visually inspected. Evidence (ignored by Git) is in
`artifacts/native-logs-121-r3-candidate/` and
`artifacts/wallet-policy-121-r3-candidate/`.

The subsequent `r4` archive (`SHA-256
352eb25289603a20cff02ef639f6f71a03b7a7b406a374310cb5d6593b613c56`)
contained 77 manifest-verified files. Its extraction passed 103/103 JavaScript
and 20/20 Linux Python tests. A fresh zero-mount IRIS Community 2026.2
installation on port 52792 reported version 1.2.1 and healthy. Installed HTML,
CSS, JavaScript and the Python reader matched the extracted files by SHA-256.
Live HTTP checks again passed all three native-log reads, permission denials,
GET-only enforcement, invalid-source rejection, token renewal and temporary
fixture cleanup. The executable IRIS module, class, Python reader, HTML, CSS
and JavaScript files were hash-identical between `r3` and `r4`; `r4` changed
only documentation and browser-test target lists.

## Publication integrity and limits

Before publication, the source descriptions and release text were reviewed
against the evidence above; the two 1.2.1 screenshots show only disposable
fixture data. Documentation wording may be updated for the public release,
but no untested executable change should be included. Compare the final
source archive's executable-file hashes to `r4`, rerun its tests, and verify
the public GitHub and Open Exchange states after publication.

These tests are evidence for the exercised flows, not an exhaustive audit of
every IRIS feature or all deployment variants. No in-place upgrade or IRIS for
Health compatibility claim is added by these clean-install checks.

No claim of portal-wide server-enforced read-only mode, atomic conditional
wallet writes, complete dependency analysis, or zero remaining defects is made.
