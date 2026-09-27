# Frontend update, rollback and legacy browser cache

Date: 2026-09-26. Experimental, unpublished; NOT READY for general release.
Status: original defect reproduced; candidate m migration PASS; full functional
regression PASS. The exact tested pilot remains unpublished.

## Reproduced product defect (P2)

[Attempt c](upgrade-cache-c/result.json) completed the j -> k -> j sequence in
a new volume while preserving the same desktop/mobile Chrome contexts. Both
contexts first registered 15 real cache hits; request interception was not used
and browser caching was explicitly enabled. Independent strict-TLS requests
confirmed the server served the exact current package bytes.

- Normal navigation after j -> k retained the old HTML, app.js and stylesheet.
- Normal reload obtained the new HTML but retained the old stylesheet.
- Returning to j could retain k HTML, startup.js and app.js even on normal reload.
- No credentials or API requests were involved. Four historical receipts and
  native deployment/installation configuration remained unchanged throughout.

The conclusion is narrower than data corruption: browser and server versions can
disagree after replacement. A successful server hash check alone is insufficient
to claim the user's interface was upgraded or reverted. Candidate k remains a
valid fresh-install checkpoint but fails this warm-cache migration gate.

## Candidate m correction

Only `web/index.html` and `experimental/guard/package/tls/httpd-local.conf` change
relative to k. The stylesheet now uses `?v=1.2.1-startup1`, distinct from the
pre-gate stylesheet. On the experimental managed HTTPS static path only, the
server replaces the cache policy with `Cache-Control: no-store` and strips
`If-Modified-Since` / `If-None-Match` from static requests. This avoids reusing
older representations or returning a date-validator-based 304 after a rollback.
The API routes, authentication, permissions, native classes and stored schema
are unchanged. There is a deliberate small bandwidth cost for newly fetched
assets: they are downloaded on navigation rather than stored by this pilot.

Earlier cached responses cannot be retroactively invalidated by a new server
header. Migration therefore requires a new entry URL or a full browser reload;
normal reload is explicitly NOT accepted as the migration procedure. No global
cache clearing, personal browser access, host trust changes or secret handling
was introduced.

The two original files were backed up with SHA-256 readback in sibling
`iris-ops-guard-pre-cache-fix-20260926`. Original j/k packages and all previous
containers, volumes and evidence were preserved. Intermediate package/image l
used a revalidation-only draft and was never installed or validated; m supersedes
it, without overwriting it.

## Exact candidate

- Directory: sibling `irisops-guard-tls-package-20260926-m`.
- Manifest: 36 entries; content SHA-256
  `41f42b7ad6c80d8569880aca0c8a726f137fe421ed7daf048a5ab1757f77328b`.
- Image: `iris-ops-guard:tls-lab-20260926-m`, ID
  `sha256:760c51184a9ccac3f99cf18410e8b726dc4de292a2ef4886807ba98311f2eb93`.
- Base image unchanged:
  `sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.
- Built locally with `--pull=false --network=none`.

## Retained source and isolation

The stopped j reference is `irisops-guard-tls-cert-20260926-e-rollback`, ID
`8ebed68bce88f8b9b5c602f6caf33fb3eb1ddab9988c4b89e3ac4db18a89d4ff`.
Its volume `irisops-guard-tls-cert-20260926-e-data` is mounted read-only by the
copy helpers, never started or modified. Its retained certificate volume is
mounted read-only in each new test engine; no private key is exported.

Source logical file/metadata fingerprint:
`e184b2833286e3ae4db7e6002cf5826959c9d0917f65693ed839c73a8c9560f4`.
The new volume matches before first boot and the source is rehashed after each
run. Only one engine can consume the new writable volume at a time. Each engine
is stopped before image replacement. The original development instance on 52801
is only checked for identity/state and a read-only deployment/receipt snapshot.

This is an exact frontend/cache-policy update on identical IRIS engine and native
classes, not a schema migration, IRIS engine upgrade or customer installation.

## Validation

183/183 Node tests pass, including two new cache-policy contract tests.
The original failure and corrected candidate use the same pinned source and
manifest/body-hash comparisons. Corrected run:
`node experimental/guard/package/verify-upgrade-cache.mjs d m`.
Evidence and final results are recorded below.

[Corrected migration attempt d](upgrade-cache-d/result.json) completed at
`2026-09-26T20:50:28.130Z`, with no findings. Twenty desktop/mobile page observations
matched every received file body against the expected package, including the
versioned entry, forced reload, subsequent normal navigation/reload and rollback.
Six additional startup scenarios passed on the upgraded installation. Independent
strict-TLS requests checked every packaged static file: even future modification
dates and wildcard ETag conditions returned 200, exact current bytes and a single
`no-store` policy. Native portal/API routes remained denied.

The legacy browser still reused 13 unchanged modules cached under j in the first
migration. Their hashes match both releases; this is NOT evidence that a server
can purge old client cache. The versioned entry and changed CSS identity resolve
the changed representations for this exact migration. The forced-reload probe
uses CDP `Page.reload(ignoreCache:true)`; it is not a claim that all cached
dependencies disappeared. A new-browser test separately checks new no-store
responses without inheriting legacy cache.

All three d engines are retained stopped with exit code 0, with no credentials
entered and no API requests in this migration test. The original source's full
logical fingerprint remained identical. Four receipt hashes, installation and
deployment configuration, and native database integrity passed before upgrade,
after upgrade and after rollback. No synthetic account or resource was created
or deleted in d. The final j rollback remains SUSPENDED.

Desktop/mobile upgraded and rollback screenshots in `upgrade-cache-d/` were visually reviewed;
the interface is readable, the disconnected status is explicit, keyboard
connection-dialog access works and the page has no horizontal body overflow.

Final functional regression uses fresh native installation, own fixtures and the
exact m image: `verify-startup-live.mjs ../irisops-guard-tls-package-20260926-m e`,
with both TLS UI and renewal flags enabled. Its separate fresh-browser cache
check has already passed all six observations (two widths, three navigations):
all 17 requested files per page have the exact current bytes and `no-store`, zero
cache hits with browser caching enabled, zero API requests and zero page exceptions.
The full [fresh-install live regression](startup-live-evidence-e.json) completed
at `2026-09-26T21:01:08.788Z`: 31 passing grouped checks, not 31 distinct operations.
This repeats both native mutations with independent readback/restoration,
server-enforced read-only, origin/CSRF/nonce controls, discarded response handling,
permission revocation/restoration, seven renewals across the real five-minute
clock, native short expiry, logout, restart, receipt recovery, strict TLS negative
cases, certificate replacement and exact certificate rollback. The additional
31st group is the fresh-browser cache test, containing six page observations.

[Certificate lifecycle](startup-certificate-lifecycle-e.json) also completed:
two new verified operations after rollback were restored, all four receipts
recovered without replay and both application databases passed integrity checks.
The six e engines are stopped with exit code 0; final engine is
`irisops-guard-startup-20260926-e-rollback`, ID
`2107e76df2b4b7675f741823ad0c6bd9ef989fd8ec810ca7e74b7c837ef0a2a1`.
The final guard is SUSPENDED. Only the seven runner-owned synthetic fixtures
(web app, wallet, user, role and three resources) were removed from this new e
lab; its four receipts and data/private-certificate volumes remain retained.
All earlier sources, backups and failed-attempt volumes are preserved.

Source/trusted-replacement/rollback screenshots in `clean-ui-startup-*-e/` were
visually reviewed at 1440x900 and 390x844, with readable content and no visible
credential values. Browser results report zero page exceptions and zero direct
native administrative requests. The deliberately discarded renewal response is
an expected network failure, not an unexplained application fault. The runner's
known-fixture-secret checks on responses and final engine logs passed; this is
not a universal proof that arbitrary free-text logs can never contain secrets.

The 183-test Node suite passed with zero skips, and 66 JavaScript modules passed
syntax checks. Exact k-versus-m manifests differ only in HTML and TLS config.
Original-file backups were checked again against the k package. No public
version/README/module, commit, push, host clock or trust-store changes occurred.

## Harness issues disclosed

- Attempt a stopped before IRIS boot: default tar format rounded modification
  timestamps to whole seconds. Read-only comparison proved all file bytes,
  paths, types, permissions and links identical, while timestamps differed.
  The clone now uses POSIX/PAX format, preserving fractional timestamps; full
  fingerprints subsequently match. Attempt a and its volume remain retained.
- Attempt b stopped on its expected startup-ready wait because the browser still
  had the old HTML without a startup gate. Attempt c records the stale bytes
  explicitly and completes the rollback instead of treating it only as a timeout.
  Neither failure modified the reference or original instance.

## Deployment limits and operator procedure

1. Pin and verify the exact tested package/image. Create and verify a cold backup
   of an installation before any real replacement; these tests use disposable copies.
2. Stop the old engine cleanly. Never attach the same writable IRIS data volume
   to two running engines. This candidate does not migrate native classes/data.
3. Start the exact new image with the same owned configuration and private TLS
   certificate mount. Verify installation plan, database integrity and receipts.
4. Enter through the versioned URL
   `/csp/ops/guard-managed/web/index.html?release=guard-cache-m1`, or perform a
   hard reload (Ctrl+Shift+R in tested Chrome). A normal reload is not sufficient
   evidence. Verify delivered asset hashes/readiness, not only server files.
5. For rollback, stop the engine, select the exact earlier image, and use its
   distinct entry URL (`?release=guard-rollback-j1`) or hard reload. Verify again.
   Rolling back to j intentionally restores its known early-click limitation.

No hot upgrade, all-browser support, production gateway, schema migration,
encrypted off-host recovery or full-product guard coverage is claimed. No public
README/version, commit, push or release is changed by this experiment.

## Protocol references

[MDN HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
explains cache reuse, reload and revalidation; a changed response policy cannot
reach a client that is still reusing a previously cached response.
[Apache mod_headers](https://httpd.apache.org/docs/2.4/mod/mod_headers.html)
documents separate response-header tables and request/response header directives.
The tests verify actual behavior rather than relying on configuration text alone.
