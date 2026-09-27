# HTTPS and bounded sessions — isolated IRIS laboratory

Status: **BOUNDED TLS LAB VALIDATED — NOT READY for publication/production**.
Date: 2026-09-26. Public 1.2.1 remains unchanged. No commit, push or release.

## Implemented boundary

The optional `build.mjs NEW_SIBLING --tls` bundle adds an isolated Apache TLS
configuration. The default HTTP bundle still uses the original Dockerfile.
Only `127.0.0.1:52804 -> 52774` is published. This is NOT a public internet server.
The certificate/key are generated inside a new private Docker volume, not in
Git or the package. Files are owned by uid/gid 51773, private key mode 0600,
mounted read-only into the IRIS container. No Windows root certificates,
Docker host settings, user credentials, or existing containers were changed.

This lab uses the Apache bundled with Community IRIS. It is **not** a validated
supported production Web Gateway deployment. Self-managed two-day test
certificates are not a customer certificate issuance/renewal solution.

TLS allows only the managed API and its separate static UI. Direct `/api/admin`,
the management portal and original/combined UI routes are denied on this port.
The fixed native API transport still uses HTTP loopback 127.0.0.1:52773 **inside
the same container**. Port 52773 is not published; its HTTP virtual host accepts
only requests from 127.0.0.1. Do not call this encryption of every internal hop.

The server checks its installer-owned exact Host and optional Origin on every
guard request. Mutations still require matching Origin and CSRF. An HTTPS
installation additionally requires the native gateway CGI HTTPS indicator;
forwarded headers do not satisfy it. Vault authenticated encryption now binds
custody to the installed origin as well as actor/session/boot.

## Session policy

| Limit | HTTPS managed lab | Legacy HTTP lab |
| --- | --- | --- |
| Guard authorization, absolute | Native expiry, capped at 300 seconds | Native expiry, capped at 60 seconds |
| Guard API inactivity | At most 120 seconds, bounded by native expiry | At most 60 seconds, bounded by native expiry |
| Explicit write channel | 60 seconds | 60 seconds |
| Preview | 30 seconds | 30 seconds |

The larger ceiling does not promise a longer native session or confer write authority. Native IRIS authorization
is still required; original native tokens are never refreshed or replayed by
the guard. Permitted activity can extend only the idle deadline, never the
encrypted absolute deadline. Deployment/session polling cannot extend it.
Native CSP application session timeout (600 seconds) is a separate mechanism;
possession of that cookie after guard expiry does not restore API authority.
New credentials must be submitted through Connect. The browser mirrors these
limits conservatively and clears state on unauthorized responses.

**Real defect found and corrected:** the initial e candidate advertised 300s
custody while its native JWT expired in about 60s. Capabilities could still look
available while an actual Wallet read returned 401 at 210s. A separate isolated
native login confirmed about 59.7s from the official response's `exp` and `iat`;
only timing numbers were observed, not the token. Do not count candidate e as
passing prolonged-session validation.

The corrected transport requires numeric `exp` from the official native login
response. Seal clamps its encrypted deadline to the native absolute expiry,
with a one-second safety margin, as well as the policy ceiling. It recomputes
remaining seconds at seal time, so transport delay cannot extend that deadline.
The browser receives only the reduced duration and respects it. No JWT decoding,
automatic refresh, native token-policy change, password retention or write retry
was introduced. A genuinely longer session remains a separate design milestone.

## Artifact identity

Validated reference package: `irisops-guard-tls-package-20260926-f`.
35 manifested content files plus manifest. Content manifest SHA-256:

`e35da0038a09246389cd39cc6140ae46601c1040db9d84ee2d21400b41554d4b`

Image: `iris-ops-guard:tls-lab-20260926-f`.
Container: `iris-ops-guard-tls-20260926-f`.
Private volume: `irisops-guard-tls-20260926-f-private`.
Image ID: `sha256:e914a2c8d3e4cd937a8b67ea4b2dc742c3bb7c65eed5ceff6fba6867ee8b68f5`.
Container ID: `3159f9811630a1fdac5a7edb5a42897f89cfbb8ddef84308378a541953e38816`.
The TLS certificate volume is **not** an IRIS database backup. This particular
TLS run stores database state in its retained container. The earlier same-image
durable replacement/cold-backup evidence belongs to the earlier HTTP image;
combining that storage topology with this TLS configuration remains a new gate.

## Final evidence

`tls-evidence-f.json` completed at 2026-09-26T18:15:51.320Z: nine grouped
checks, `complete=true`, `fixturesRemoved=true`. All 166 Node tests passed;
49 JavaScript/module files passed syntax checks. These counts are not code
coverage percentages or a claim that every product function was tested in IRIS.

- Every packaged content hash matched the installed image file; clean Bootstrap
  compilation/installation succeeded on native Community IRIS 2026.2.
- Actual TLS 1.2 and TLS 1.3 connections validated using the explicitly supplied
  private CA and expected IP identity. Missing CA, wrong identity and TLS 1.1
  failed. Plain HTTP to the TLS port did not authenticate or return success.
- Native session cookies are Secure, HttpOnly, SameSite=Strict, with path
  `/api/irisops-managed-guard/`. Wrong Host and Origin returned 403.
- An authenticated internal HTTP request with the expected Host and spoofed
  X-Forwarded-Proto/Forwarded returned 403 with `https_required`.
- Independent no-credential helper `iris-ops-guard-tls-20260926-e-peer` attempted
  the owned engine's internal port through its Docker bridge address; HTTP 403.
  That helper is stopped with exit code 0 and retained.
- READ_ONLY blocked writes despite sufficient native privileges. Mode transition
  invalidated old custody. Both genuine Wallet policy and Web app availability
  mutations returned VERIFIED. Independent native reads matched, and both
  disposable values were restored before timeout testing.
- The initial longer-custody run exercised 62s write and 123s idle checks but is
  superseded by the native-expiry defect above. Those observations do NOT prove
  usable 120s/300s native sessions. Policy-ceiling behavior is covered by clocked
  unit tests; final live evidence must respect the native approximately 60s limit.

- Corrected f advertised 59 seconds, reflecting native expiry rather than the
  larger policy ceiling. Actual native Wallet reads succeeded after 30 seconds.
  After the advertised lifetime plus a safety interval, active and idle sessions
  returned 401 `upstream_reconnect_required`; pending write access also returned
  that exact error, with native target values unchanged.
- Wrong-password reauthentication invalidated existing custody. Logout rejected
  the prior cookie. No automatic re-login/refresh occurred.
- Real browser UI at 1440x900 and 390x844: native login, cleared password input,
  server READ_ONLY controls disabled, both workspaces and logout. No horizontal
  page overflow, page exceptions or direct browser `/api/admin` requests.
  Screenshots were visually inspected. A transient success toast overlaps help
  text on mobile while visible; this existing cosmetic behavior is not claimed
  fixed or pixel-perfect. It does not cover the tested action controls.
- Actual container restart invalidated previous authorization. Fresh login and
  the two private operation proofs recovered the original VERIFIED receipts;
  native values remained restored, with no reapplication of either change.
- Fixture user, role, collection, web app and three resources were removed only
  from the final new laboratory; absence was checked. Managed deployment was
  set SUSPENDED, then its container stopped and independently verified exit 0.
  The container, certificate volume, receipts and all earlier attempts remain.
  Docker and Apache error logs were checked in memory against known test secrets.
- Original lab ID, running status, deployment-state JSON and receipt count were
  compared before/after. Only original 52801 remains running. README.md,
  package.json, module.xml and HEAD remain unchanged; no public action occurred.

## Validation-runner corrections and retained attempts

No failed attempt is counted as a completed validation. All a–e containers,
certificate helper containers and private volumes were retained; engines are
stopped with exit code 0. The a–e runtime/package content hashes are identical:
these retries corrected the instrumentation, not an unreported runtime patch.

- a: Node derived TLS server identity from a deliberately false HTTP Host.
  The negative request was rejected client-side before reaching IRIS. Fix:
  keep socket/certificate identity fixed independently from HTTP Host.
- b/c: native `%Net.HttpRequest.Server` is calculated from Host. Changing Host
  changed the destination, invalidating the simulated forwarded-HTTPS test.
  A read-only diagnosis confirmed `127.0.0.1` became `127.0.0.1:52804` while
  Port remained 52773. Replace this test with a fixed stdlib HTTP socket;
  private fixture authorization stays in process memory/stdin, never argv.
- d: independent Wallet readback incorrectly called nonexistent `Get`.
  The documented `Exists(name, .object, .status)` returns the collection object;
  use its metadata properties. Native state is now checked before any mutation.
  d contains two applied disposable mutations and their receipts; it is stopped,
  not cleaned/restored. e's target values were restored before its long wait,
  but its disposable fixtures remain. a–e still contain disposable fixtures. Do not start them
  casually or treat them as the accepted reference. Nothing was deleted to retry.

Source rollback: `../iris-ops-guard-pre-https-20260926` contains the pre-change
`experimental/` and `web/` trees: 170 copied files compared by SHA-256. Restoring
is a separate reviewed action, not an automatic overwrite of later work.

## Reproduction and limits

Use `verify-tls-install.mjs NEW_TLS_PACKAGE` with a fresh matching suffix/image
and verified Docker executable. Do not run integration runners concurrently.
For browser checks supply the verified Playwright/Chrome paths and
`IRISOPS_TLS_UI=1`. The temporary browser profile pins the **exact leaf public
key** using Chrome's SPKI certificate exception; it does not install a trusted
root in Windows and does not globally disable HTTPS verification. Real CA/IP
certificate validation is tested independently by the Node HTTPS client.
Thus browser screenshots alone do not prove OS-trusted certificate deployment.

The pilot still has exactly two fixed disposable targets. It is not protection
for every Ops Studio operation, every native admin endpoint or other clients.
No production/domain topology, external gateway, certificate rotation, HA,
cross-host recovery, in-place schema upgrade, generalized target policy or
full-product migration is claimed. Keep NOT READY until those relevant gates
are separately defined and evidenced.

## Official references checked

- [IRIS HttpRequest](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25Net.HttpRequest&LIBRARY=%25SYS): Server/Host behavior and fixed native HTTP transport.
- [Wallet Collection](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25Wallet.Collection&LIBRARY=%25SYS): independent metadata-only readback via Exists/object properties.
- [Native CSP session](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25CSP.Session&LIBRARY=%25SYS): session timeout versus guard authorization and native cookie handling.
- [Native JWT authentication](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ROARS_iam_jwt): login response expiration metadata and the distinct refresh flow.
- [Web Gateway configuration](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GCGI_config_overviews): TLS belongs to the web-server/gateway topology.
- [Apache SSL](https://httpd.apache.org/docs/2.4/mod/mod_ssl.html): protocol/certificate directives and native SSL environment.
