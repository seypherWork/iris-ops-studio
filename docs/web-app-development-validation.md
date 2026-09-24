# Version 1.2.0: web-app availability and REST discovery validation

Status: **scoped release validation completed, with documented limitations**.
The 23 September entries below record how the previously unpublished working
copy was tested. They are not claims of exhaustive testing or a server-enforced
read-only mode.

## Implemented

- A guided `Enabled` change for non-system web applications through the
  documented SysAdmin API v2 `GET/PUT /v2/web-app` endpoint.
- The preview identifies the exact application and state change. Before any
  `PUT`, the client reads the same application again, verifies its name and
  documented configuration, and blocks if anything changed or is invalid.
- The `PUT` body preserves the reviewed documented configuration; a final
  `GET` checks both `Enabled` and the other documented fields. A successful
  HTTP response alone is not reported as verified.
- `/api/admin`, `/api/mgmnt`, `/csp/ops`, `/csp/sys`, unknown namespaces and
  `%SYS` applications are not eligible for guided changes.
- REST discovery uses only same-origin `GET /api/mgmnt/`,
  `GET /api/mgmnt/v2/`, and returned, validated OpenAPI paths. It never invokes
  an operation described by an OpenAPI document or forwards the SysAdmin token.
- Mobile table actions remain visible while the other columns scroll.

## Evidence gathered on 2026-09-23

- 65/65 automated tests passed against the local code and stateful mock.
- Node's earlier measured line coverage was 98.74% for the imported API, explorer,
  operation, REST-discovery and sanitization modules. This figure does **not**
  cover the browser `app.js` module, live IRIS, or all UI interactions.
- The local browser demo showed an exact-phrase disable preview, a simulated
  change with readback and journal result, a read-only OpenAPI list, protected
  management rows, and no console warnings/errors during this route.
- The web-app page and confirmation dialog were inspected at 1440 x 900 and
  390 x 844. A mobile action-visibility issue was found and fixed.
- After Docker recovery, this working copy was built and installed in a new
  mount-free IRIS Community 2026.2 container at local port 52781. Its running
  `app.js` hash initially matched the local source exactly; the live fixes
  below were then installed in that disposable container with in-container
  backups and matching hashes. No earlier container or volume was modified.
- A real Live IRIS connection and web-app inventory succeeded. IRIS 2026.2
  omits `Name` from `GET /v2/web-app` detail responses, although the mock had
  included it. The initial guided plan would therefore fail for every live
  target. The client now accepts omitted `Name` while rejecting any present,
  mismatching name, and the mock reproduces the omission.
- The built-in `/csp/user` appeared actionable before the fix. Its live detail
  has `IsNameSpaceDefault=true`; the new guard disables default or unknown
  applications. A dedicated `/csp/irisops-testweb` fixture was created in the
  disposable instance with `IsNameSpaceDefault=false`, password authentication,
  and no dispatch class; its live detail was read successfully.
- A stale static-file cache initially kept serving the previous `index.html`
  even after the file in the disposable container had been replaced. A
  query-versioned entry URL confirmed the updated module loaded. The current
  earlier ZPM manifest used `ServeFiles="2"` and a 3600-second timeout; the
  unpublished manifest now requests `ServeFiles="1"` and timeout `0` for
  predictable upgrades. InterSystems documents these two cache controls in its
  [installation manifest reference](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GIEMISC_manifest).
- The first live guided preview exposed a redaction/data-integrity bug: the
  default API read masks fields such as `ChangePasswordPage` and JWT timeouts,
  and the masked values would have been sent in a full `PUT`. The guided flow
  now uses an unredacted internal read only for planning, stale-state checks,
  and readback, while the dialog and journal remain redacted. Planning fails
  closed if a redaction marker is present. A dedicated regression test checks
  both the masked display response and preserved internal values.
- With the corrected module confirmed loaded in the browser, `/csp/user` and
  `/csp/ops` were disabled in the live action table. Only the disposable
  `/csp/irisops-testweb` was used for a live mutation. Disabling and then
  enabling it each produced `executed / verified` readbacks for the complete
  documented configuration. Its original enabled state was restored.
- A portal edit changed only the disposable fixture description after a
  Disable preview. Execution then reported `blocked / stale`; the fixture
  remained enabled and the journal recorded the block. The IRIS audit view
  showed no separate application-modification event at that blocked operation,
  though this is not a packet-level proof that no `PUT` was sent. The original
  description was restored and confirmed after reloading the portal.
- Both `/api/mgmnt/` and `/api/mgmnt/v2/` responded HTTP 401 without a
  separate Management API browser authentication, even while the SysAdmin API
  connection was live. The REST catalog honestly showed unavailable; no
  password fallback, public access, or forwarded admin token was added.
- The demo application action was unintentionally disabled because the table
  mapping dropped `isDefault`. The local development copy now retains that
  field; the browser mock confirmed an enabled action and a simulated,
  readback-verified change. The REST catalog's dynamically inserted OpenAPI
  inspection also worked in the local mock.
- To prevent an independently authenticated REST catalog from holding the
  whole web-app page in a loading state, the latest local code renders the
  registry first and refreshes REST documentation in the background. This
  final UI change is tested in the local mock, **not yet redeployed to live
  IRIS**. With a four-second delay injected into both mock REST catalog
  endpoints, the registry and its actions appeared first; the catalog then
  appeared without a page reload. Navigating away during the delayed request
  did not insert REST results into the Processes view. The browser console
  showed no warnings/errors in the tested sessions.
- The final local Web apps registry and confirmation dialog were inspected at
  browser-reported viewports of exactly 390 x 844 and 1440 x 900. The action
  column stayed visible on mobile, and the dialog remained usable. This was
  the local mock, not the final rebuilt IRIS installation.
- After the local fixes, 65/65 tests and 98.74% measured module line coverage
  pass. This coverage does not include browser `app.js`.
- The final local source was built and installed afresh in disposable IRIS
  Community 2026.2 container `iris-ops-v12-final-qa-20260923` at
  `127.0.0.1:52782`. Its image ID is
  `sha256:791497fcecad1fd557c9132ba5616f78c201b75bcd46051ebc6d5aa318a344ff`.
  The install log reported ZPM activation with `ServeFiles=1` and
  `ServeFilesTimeout=0`. Docker inspection showed zero mounts and only a
  loopback-bound port. Direct unversioned HTTP responses for `index.html`,
  `app.js`, `operations.js` and `styles.css` all returned 200, exactly matched
  the current source text, and carried `Cache-Control: no-store, no-cache`.
  This verifies a fresh install, **not** upgrade behavior over an old install.
- The fresh installation rendered its built-in safe-demo Web apps registry;
  protected rows were disabled and the eligible demo row was actionable.
  Automated syntax checks passed for all six JavaScript entry points, the
  full suite passed 65/65, and imported-module coverage remained 98.74% lines,
  78.17% branches and 98.20% functions. The user then established a real
  `Live IRIS` session in Ops Studio on port 52782; the authenticated web-app
  inventory loaded, and default/system applications remained disabled in the
  guided action column. With explicit approval, the user-created
  `/csp/irisops-testweb` fixture was saved initially disabled in the `USER`
  namespace with password authentication and no dispatch class. The final
  fresh-install test enabled **only this fixture** through Ops Studio;
  execution returned `executed / verified`, and the inventory showed Enabled.
  The same guided flow then disabled it; execution again returned
  `executed / verified`, journal count reached 2, and the inventory showed
  Disabled. After reloading the IRIS portal, its Enabled checkbox was false.
  The final browser session reported zero console warnings/errors. This
  verifies the guided two-way mutation and restoration in fresh live IRIS,
  but not an exhaustive production audit.
- On the final 52782 installation, an Enable preview was opened while the
  fixture was Disabled. The user-approved portal edit then changed **only**
  its description. Submitting the older preview recorded `blocked / stale`
  in the Ops Studio journal (three entries total); the registry still showed
  Disabled. The original description was restored in the portal and, after
  reload, matched `Disposable IRIS Ops Studio validation - 52782` with
  Enabled still false. The IRIS audit timeline showed the two portal edits
  and the separate blocked Ops Studio entry. This does not by itself prove
  at network level that no `PUT` was transmitted.
- A separate, credential-free Safe demo tab served by the **final 52782
  installation** was visually inspected at browser-reported viewports of
  exactly 390 x 844 and 1440 x 900. At both sizes the Web apps registry,
  protected disabled controls, eligible demo action, REST catalog, and
  confirmation dialog remained visible and usable; the mobile action column
  stayed on screen. No demo action was executed and no request was sent to
  IRIS. That tab and the live tab both reported zero browser console
  warnings/errors in these checks. This is final-install visual evidence,
  but the exact-size review used Safe demo rather than a Live IRIS session.
- Release metadata in the **unpublished working copy** is aligned at 1.2.0
  in `package.json`, `module.xml`, and `IrisOps.About`; the README and package
  contract test now distinguish this candidate from the unchanged public
  1.1.0 release. These documentation/metadata edits were made after the
  fresh IRIS installation. The complete suite was rerun and a new candidate
  image was built rather than replacing the live-test image.
- After those metadata and documentation edits, all six JavaScript syntax
  checks and 65/65 tests passed again. A separate coverage run also passed
  65/65, measuring 98.56% lines, 78.06% branches and 98.20% functions for
  the imported modules; this run did not cover browser `app.js`. The earlier
  98.74% line result reflects a separate run, not a guaranteed fixed figure.
- The candidate 1.2.0 image was built from this development tree as
  `iris-ops-studio-v12-candidate:20260923`, image ID
  `sha256:8508589aeb6557fce2a30062334fc0c7f7d22cf1ea2a867ea579c7683563f287`.
  Its ZPM installation compiled `IrisOps.About`, seeded update steps for
  version 1.2.0, and activated `/csp/ops` with `ServeFiles=1` and
  `ServeFilesTimeout=0`. It was subsequently started and checked on 24
  September as recorded below. The 52781 and 52782 disposable containers
  remained healthy after the build, and no container or volume was removed.

## Final isolated-image checks on 2026-09-24

- The SHA-256 of the extracted 1.2.0 candidate ZIP was verified before use;
  all 56 extracted files matched the candidate source and the extracted copy
  passed 65/65 tests. The ZIP and its exact hash are retained in the local
  release evidence; documentation-only edits after this check require a new
  final archive and verification before publication.
- The exact 1.2.0 candidate image above was started as a new, mount-free IRIS
  Community 2026.2 container on loopback port 52783, with a 6 GiB memory
  limit. The container became healthy. Its installed `IrisOps.About` returned
  `1.2.0`; six unversioned HTML/CSS/JavaScript responses returned HTTP 200,
  matched their extracted source text and carried no-cache headers.
- Safe demo loaded all ten portal areas on this installation with no browser
  console warnings or errors. The Web apps table and dialog were inspected at
  1440×900 and 390×844 in Safe demo; protected controls stayed disabled and
  mobile actions remained visible. No demo mutation was executed.
- The operator then established a Live IRIS session on port 52783 without
  sharing credentials. The real web-app registry loaded; system, management,
  Ops Studio, and default applications were inventory-only. The other portal
  areas were navigated in read-only mode and the browser console remained
  free of warnings and errors. No live mutation was made on this final image;
  the disposable live enable/disable and stale-preview checks remain the
  separately documented 52782 evidence above.
- The Management API still answered permission denied for independent REST
  discovery. The interface showed that limitation and did not forward the
  SysAdmin token or weaken authentication.
- The pre-publication review found that several browser asset URLs still
  carried 1.1.0 or development cache labels. They were changed to 1.2.0,
  and a UI contract assertion was added before the final archive and image
  were rebuilt. The prior local ZIP and image remain historical evidence,
  not the publication artifact.
- After that correction, the six syntax checks and all 65 tests passed again.
  The final measured imported-module coverage was 98.74% lines, 78.17%
  branches, and 98.20% functions; browser `app.js` remains outside it.

## Known limits at release

1. The 1.2.0 guided web-app mutation was tested on a disposable fixture in
   52782 and its original state restored; the final 52783 image was checked
   with authenticated read-only IRIS. This is not a claim that every portal
   workflow is free of defects or was exercised again on 52783.
2. Fresh-install static assets and no-cache headers were verified. An in-place
   upgrade over an older installation has not been reproduced; do not claim
   upgrade-cache behavior is proven.
3. Stale previews were blocked on two disposable IRIS installations and in
   automated precondition tests. There is no packet-level evidence that a
   blocked stale preview sent zero `PUT` requests; avoid that stronger claim.
4. The REST service catalog requires an independently authorized Management
   API browser session. It remained unavailable under the tested session and
   should be presented as an optional read-only capability, not as universally
   functional with SysAdmin login.
5. Exact-size visual review of the installed Web apps route was completed in
   Safe demo. The full Live IRIS interface was navigated but was not visually
   reviewed at both exact viewport sizes in the final 52783 installation.
6. Test coverage numbers apply to imported modules, not browser `app.js` or
   all user interactions. No automated result proves the absence of all bugs.

The current safeguards are client-side. IRIS permissions remain the server
authorization boundary; this change does not add a server-enforced read-only
mode and should never be presented as one.
