# Enrolled-target guard: independent ZIP and clean IRIS installation

Date: 2026-09-27 Europe/Brussels. **Clean local laboratory installation PASSED.**
Experimental / NOT READY for production or publication as 1.3.

## What changed in this milestone

The historical portable installer validated only the 36-file fixed-target runtime.
It could not install the new target-policy runtime without a development overlay.
The new `build-enrolled.mjs` snapshots current source into a separate artifact;
`portable-enrolled-pilot-1` requires the exact 37-file runtime inventory, including
all 17 native classes and the corresponding frontend. Unknown profiles, missing,
substituted or extra runtime files fail validation. The installer binds its profile
to the validated bundle, not to an arbitrary file-count option.

Historical `portable-pilot-1` retains its exact 36-file inventory. The new verifier
also successfully verified the immutable portable-c directory. The old m/c
artifacts were neither replaced nor retargeted. A new operator guide describes
explicit enrollment, default denial, separate activation and retained-data shutdown.
No native runtime or browser product code was changed during this packaging gate.

## Artifact identity

- [ZIP](../../../irisops-guard-enrolled-20260927-a.zip), source-only, 44 bound files
  plus `bundle.json`; no test fixtures, credentials, certificates or private keys.
- ZIP SHA-256: `D0BFAC2C5AA174E3649CF37E97485090E96753679AD08CC309283D8872C2AEBA`.
- Bundle hash: `6b9d2b02e4b5f9c20bee5dc8b5c963053b8a6137c7ea3e7aa3610234bd47e64c`.
- Runtime hash: `671e64db7e93d9dbe96c03377e9f64dc9192f50500c623a29be7dd3f7ecca57e`.
- Built image: `sha256:946c343b62e5fb1bd3277263db42b86d0ef57f5a7a631e1ec1bb49d7c5a00fa5`.
- Pinned official base: `intersystemsdc/iris-community@sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.

The ZIP was extracted into `irisops-enrolled-extracted-20260927-a`. Its verifier
passed with Node filesystem permissions restricted to that extracted directory:
verification needs no original checkout or historical package. Docker construction,
bootstrap and all runtime loading used this extracted artifact; no runtime classes
or frontend files were overlaid afterward. Only the separate native assertion
helper was loaded into the disposable instance for testing, never into the ZIP.

## Evidence and results

- **215/215 Node tests** pass, including three new version/inventory/profile tests.
  The runner syntax and Git whitespace checks also pass. No new coverage
  percentage is claimed.
- Clean-run command: `node experimental/guard/verify-enrolled-live.mjs a ../irisops-enrolled-extracted-20260927-a`.
- [Machine-readable result](../../../irisops-enrolled-clean-20260927-a/result.json):
  `complete: true`, `phase: complete`, `developmentOverlay: false`, `stopped: true`.
- Container: `irisops-pilot-clean-enrolled-20260927-a`, immutable ID
  `28b7a759e9515e574c7db6e3dc8239608a101662394d38efc520d2784ed67014`, HTTPS 52810.
- Clean bootstrap in READ_ONLY; exact native/frontend file hashes; all 17 compiled
  classes present; empty receipt store and native database integrity verified.
- Fresh Chrome at 1440x900 and 390x844, normal cache enabled, cold load/navigation/
  reload: every observed app asset matched the manifest, returned `no-store`, and
  produced zero cache hits, script exceptions or unauthenticated API requests.
  See [asset evidence](package/fresh-cache-enrolled-clean-20260927-a/result.json).
- Missing enrollment has no historical probe fallback. Forty-five native
  enrollment assertions and authentication of a restricted operator passed;
  enrollment without management permission was denied.
- READ_ONLY denies write activation on the server. Both enrolled workflows execute
  once, with independent native readback and subsequent fixture restoration.
  Foreign targets/resources are denied. The four-channel bound remains enforced.
- A changed web configuration blocks a stale preview (`409`, `BLOCKED`,
  `dispatchCount: 0`). Revocation invalidates pending sessions and removed-target
  recovery. Re-enrollment allows authorized observation without rewriting history.
- A second target pair works independently; old receipts cannot inspect a replacement
  target. Both alternate fixtures were restored with native readback, and the first
  pair stayed unchanged.
- Real browser execution passed in both workspaces, with separate write approvals,
  confirmation, native verification and recovery after fixture restoration.
  No direct `/api/admin` browser fallback or script exceptions were observed.
- A real container restart retained enrollment and receipts. Recovery returned
  original dispatch counts of one and zero administrative writes. Native integrity
  and sampled server/browser logs passed the known-test-secret checks.
- Runtime source files and extracted-bundle hashes were rechecked after mutations
  and restart and remained unchanged. These are source/served-byte checks, not a
  claim of reproducible compiled IRIS binary hashes.

Desktop wallet, mobile web-app and mobile confirmation screenshots were visually
inspected: dialogs and disabled controls fit; no horizontal page overflow or
credentials were visible. The compact JSON policy comparison still wraps densely
on mobile; readability polish remains an optional usability improvement.

## Preservation

[Shutdown receipt](../../../irisops-enrolled-clean-20260927-a/stopped.json) confirms
SUSPENDED then stopped, with retained data and `deleted: false`. No existing engine,
volume, package or personal file was removed. Generated test credentials stayed in
runner memory; certificates/private keys stayed in the new Docker volume.

The original development instance was checked before/after by immutable ID and
running state (`d514da5b...12e38`, running). This is not a database snapshot comparison.
The historical portable-c ZIP retains SHA-256
`A9BC10B6C519891E64295DA4A35645FF3760E4D8B8137066C80EC47174956E2C`.
No public README, package/module version, Git commit, push, release or account
setting was changed.

## Still required before release

Follow-up: [enrolled interruption and dispatcher-transition regression](enrolled-fault-validation-20260927.md)
now passes against this exact artifact. The list below records the next work at
the time of the original clean-install run; it does not imply that an in-place
customer schema upgrade has since been validated.

1. Renew interruption/uncertain-result and transition/upgrade regression against
   this enrolled runtime. A normal restart is not all crash positions.
2. Resolve and verify human TLS trust and identity onboarding. Automated strict-CA
   HTTP checks and a disposable browser's exact leaf-SPKI exception are not a
   production certificate-management workflow.
3. Define the release boundary honestly: two server-guarded workflows only, not
   every management screen; local fresh-instance installer, not an in-place upgrade.
4. Re-audit source, documentation and final release artifact together before asking
   for publication approval. Do not label 1.3 READY based on this milestone alone.

The pinned base was already available locally. Fresh-host image download,
cross-machine/OS installation, production workloads, all crash points and in-place
upgrade/downgrade were not established by this run.
