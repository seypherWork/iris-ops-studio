# Local one-hour session correction and jury navigation — 2026-09-27

Status: prepublication validation record for the separate 1.3.1 maintenance
candidate. It does not replace the immutable GitHub/Open Exchange 1.3.0
artifact. The older `irisops-guard-enrolled-review-20260927-c.zip` and its
published SHA-256 must not be used to identify the 1.3.1 candidate.

## Scope and observed result

- Disposable IRIS Community 2026.2 instance:
  `irisops-pilot-clean-enrolled-20260927-l`, loopback HTTPS port 52818.
- The native managed application Timeout was changed from 600 to 3600 seconds.
  Its deployment mode was restored to READ_ONLY. No protected target or
  production instance was changed.
- The guard family/idle deadline is at most one hour after login. Short native
  access is renewed read-only while the visible tab is idle; renewal clears
  workflow approvals and does not retry a change. A normal API request still
  rejects expired native access. The one-hour family cannot be extended by a
  renewal.
- Per-workflow write approval remains 60 seconds. Preview validity remains
  30 seconds. These were not lengthened to an hour.
- Unsupported workspaces are hidden in the managed guard's navigation. An
  independently opened browser tab showed only Secrets inventory, Web apps,
  Access control and Session journal. The full direct SysAdmin console is
  separate and is not installed by this guarded review bundle. The live
  Overview does not claim a host CPU percentage; CPU/memory gauges are demo.
- A manually authenticated laboratory operator displayed `Live IRIS` and a
  session countdown. Later observations showed approximately 47, 29, 22, 16,
  13, 11, 8, 6, 5, 3, 2 and 1 minutes remaining, with repeated short read-only
  renewals. At **2026-09-27 13:22:09 UTC**, the same browser tab displayed
  `Guard · disconnected`, `Disconnected / reconnect required` and a disabled
  `Session ended · reconnect required` control. Its browser error log contained
  zero error entries. This is a real elapsed browser observation of the session
  reaching its one-hour family boundary; the initial login timestamp was not
  independently captured to the second, and no write was attempted at expiry.

## Verification

- JavaScript suite after the navigation adjustment: **270/270 pass**, no skips.
- Native `IrisOps.Guard.TestRenewal` in the disposable IRIS instance: 18 PASS,
  including a fixed one-hour family and read-only refresh after expired native
  access; this is controlled test state, not a full-hour elapsed test.
- `app.js`, `combined-guard.js`, `styles.css` and `index.html` installed in the
  laboratory match the final local bundle by SHA-256. An independent Brave tab
  visibly loaded the corrected navigation. Direct host-shell HTTPS probing
  returned no HTTP status in this environment; do not count it as a pass.
- The real browser session reached its displayed one-hour boundary as recorded
  above. The separate scripted long wall-clock renewal check has **not** been
  run to completion; do not report it as passed. Controlled native tests and
  this live browser observation are distinct kinds of evidence.

The bundle used for this elapsed-browser validation (not production-ready):

`../irisops-guard-enrolled-onehour-juryroute-v2-20260927`

- Bundle content SHA-256:
  `ff24f15b03de32fc555078526d9c8a812dd8e23adceea5b7b9ca3d73261b6f1b`
- Runtime content SHA-256:
  `bbe53c688bdb8e939e31f7fa9a76ef6e1a86c75154d2e0373b1a9a68926afa87`
- 55 bundle files; builder reports `productionReady: false`.

The later 1.3.1 package was rebuilt from the same corrected guard source plus
the 1.3.1 cache identity and updated guide. Its ZIP
`../irisops-guard-enrolled-review-v1.3.1-20260927.zip` was extracted to a new
directory and passed `node portable.mjs verify` independently:

- ZIP SHA-256:
  `748A1B361198AA6AEA850E6AA32CB538724C9A47C21C25D0364E662571B655DE`
- Bundle content SHA-256:
  `6cb115882a4cea63f0d7b74854daeed168e8280585a7434db6728f8fcbe7a6f0`
- Runtime content SHA-256:
  `0cf34e28f113d2c3987bfac95724304891d23b974203cc1881debde2683d5d01`

The elapsed-browser observation above was made against the preceding local
bundle, not by reinstalling this newly packaged archive. The new archive has
passed structural and source tests; do not claim a fresh live-install pass for
its exact ZIP.

The original laboratory class/UI tree was copied before the change to
`../irisops-session-hour-20260927-l-backup`. Previous candidate bundles remain
untouched. At the time of the elapsed-browser test, no commit, push, release
or Open Exchange change had been made.

## Jury route and limitation

Read `README.md` as two installations, not one. The standard IPM/Docker path
provides the full direct SysAdmin console. The attached managed-guard package
provides only four enrolled administrative workflows with server READ_ONLY.
No reviewer should infer that the protected URL serves Overview, processes,
storage, tasks, native logs, OAuth or Explorer. The videos show earlier
versions. The managed review still requires a new instance, private operator,
owned disposable targets and explicit certificate trust; that setup friction
is part of the product evaluation, not something to conceal.
