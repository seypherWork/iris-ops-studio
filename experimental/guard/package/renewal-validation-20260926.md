# Explicit session renewal — bounded TLS laboratory

Status: BOUNDED RENEWAL LAB VALIDATED — NOT READY for publication/production.
Date: 2026-09-26. Public 1.2.1 is unchanged; no commit, push or release.

## Implemented contract

- The managed HTTPS profile offers an explicit “Renew session · read-only” button.
  There is no background refresh and no automatic retry of an administrative write.
- Login uses native IRIS authentication. Subsequent renewal uses only the official
  fixed-loopback `/api/admin/refresh` endpoint with its refresh-token grant. It
  never accepts a client-selected upstream URL, account, token or expiry.
- Access and refresh tokens are encrypted together using the native session key,
  bound to actor, session, instance boot and installer-owned exact origin. Tokens
  are not returned to JavaScript. The guard does not retain the login password
  for renewal. This is not a claim about IRIS's own internal credential storage.
- A renewal requires the same authenticated native session, exact Origin, CSRF,
  strict request schema, the explicit phrase, and a single-use renewal ID. This
  ID is not an upstream credential and is insufficient without those controls.
- The original five-minute family deadline never moves. Every access period also
  respects native JWT expiry minus a safety margin and the two-minute idle cap.
  In this IRIS configuration, native access periods are approximately 59 seconds:
  the operator must renew before they expire. After expiration, reconnect.
- Before contacting native refresh, the guard consumes old custody and removes
  both workspaces' channels/previews. Renewal shares the deployment/dispatch lock.
  A successful response creates fresh read-only channels in the UI. It does not
  restore any write grant or preview. Recovery evidence is not erased by renewal.
- A lost renewal response is not retried. The old renewal ID cannot consume the
  newly rotated refresh credential. The UI disconnects and requires login again.
  This does not claim that a response discarded by a client instantly revokes the
  server's newly issued read-only authorization: it remains bounded and cannot be
  renewed using the discarded ID. Explicit logout clears native guard custody.
- HTTP pilot profiles retain their original short-session behavior; they do not
  receive a renewal route or store refresh tokens.

## Completed evidence

- 174/174 Node tests, no skipped tests. Eight new renewal tests cover explicit
  request contents, the original cap, expiry, response loss/no retry, malformed
  replies, concurrent renewal/reset, both workspace approvals and HTTP exclusion.
- Node line coverage: 79.79% overall; `ui/session.js` and `combined-guard.js` 100%
  of executed source lines. Branch coverage overall 76.50%. This is NOT 100%
  functional coverage, and does not measure ObjectScript or the real browser.
- Fourteen native synthetic custody assertions execute in IRIS separately from the
  production package. They cover encrypted token pair roundtrip, nonce handling,
  approval removal, cancellation marker and family-deadline clamping.
- Actual native refresh, rejected cross-session nonce and CSRF/schema violations,
  both obsolete channels/previews, and permission revocation passed in i and j.
- The complete j run passed all 16 grouped live checks at
  `2026-09-26T18:54:41.314Z`; see [machine evidence](tls-evidence-j.json).
  Seven explicit refreshes across a real five-minute clock could not extend the
  original family deadline. Native expiry, failed reauthentication and logout
  rejected former authority. A real restart invalidated the previous session,
  while both original proof-bound receipts were recovered without replay.
- Browser renewal, injected loss of a successful response, explicit reconnection
  and desktop/mobile checks passed in j. [Browser evidence](clean-ui-tls-j/result.json)
  records zero page exceptions and zero direct browser `/api/admin` requests.
  The intentional aborted renewal produces an expected network-failure diagnostic;
  this is not a claim of zero console messages. Known fixture passwords and
  recovery proofs were checked against collected console and server log output.
- The successful browser loss test uses the runner's CA/IP-validated fixed HTTPS
  client to relay the one real renewal, then aborts delivery to the page. The page
  disconnects, disables renewal and does not retry. This does not require turning
  off TLS verification for the relay or installing a Windows trust root.
- Actual [desktop](clean-ui-tls-j/desktop.png) and
  [mobile](clean-ui-tls-j/mobile.png) captures were visually inspected at 1440x900
  and 390x844 browser viewports. Renewal fits both layouts, write controls remain
  disabled in server READ_ONLY, and the mobile page remains vertically scrollable
  without body-width overflow. The desktop toast is briefly visible while fading;
  no password, upstream token or recovery proof appears in these captures.
- Syntax checks pass for all 52 JS/MJS files. Source, package and image match the
  35-entry runtime manifest. Synthetic/fault/diagnostic helpers are excluded.
- j's seven owned fixture objects were removed and their absence checked after
  restoring the target values. They are reproducible fixtures, not personal data.
  j is SUSPENDED and stopped with exit 0. Its two receipts and private certificate
  volume remain. The original lab's identity, running state, deployment snapshot
  and receipt count match before/after. No older lab or backup was removed.

## Defects and failed attempts retained

1. Candidate g failed login: ObjectScript evaluates arithmetic/comparison in
   left-to-right order. `renewUntil > now + 300` needed explicit parentheses
   around `now + 300`. The old expression rejected every renewable envelope.
   Corrected and covered by native synthetic tests, not just mocked JS tests.
2. Candidate h passed native renewal but the test expected HTTP 404/409 for an
   erased preview. The existing documented implementation returns HTTP 400
   `invalid_preview`. The assertion now checks that exact status/error and native
   target state. The runtime bytes of h and i are identical; this was a test
   expectation error, not a reason to weaken application protections.
3. The first Node coverage run could not create its temporary directory in the
   restricted Windows Temp location. It was repeated successfully with only
   process-local TEMP/TMP directed to a new workspace directory. No Windows
   environment settings or privileges were widened for coverage.
4. The original browser fault-injection helper used Playwright `route.fetch`,
   whose separate request context did not trust the private lab CA. An unhandled
   diagnostic printed the disposable native session cookie and CSRF header. This
   is a test-harness privacy defect, not a clean secret-leak test pass. No header
   value is reproduced here. The i container was immediately stopped and its
   stopped state/zero exit verified; original 52801 stayed running. Keep i stopped
   until its disposable account/session state is separately reset or disposed of.
   The corrected helper uses the existing CA/IP-validating client, catches route
   errors without printing request context, and sanitizes browser exceptions.
   The new j run uses fresh certificates, native storage and random credentials.
   Its real response-loss test has now passed. The runner also guarantees a stop
   in a `finally` if a normal log-privacy assertion fails.

## Identities and preservation

- Working candidate: `../irisops-guard-tls-package-20260926-j`, 35 manifest entries.
  Content SHA-256: `2be717326bdb6a4a93058f0b02a61811ffbb743c388965b9dd42bad6a036962a`.
- Image: `iris-ops-guard:tls-lab-20260926-j`.
  ID: `sha256:e3bf6afaa22a0aca00891927506772b80720b5059403ecf705cca703e88af704`.
- Container j ID:
  `35f835a745f26af65c1324d42c9a1a6181e83194724f134b3b2f35132d04d79f`.
- g: `e36bb0103175e11a12c1ef55d3126bc167c4fbf7c94535578f9c1bda3049a675`.
  h: `cd2e0b113f498f374e6294d5cfd730e75cb942035be37fd396e52e9c71860e26`.
  i: `1a26c4c3c5f010c3167c690f1196844e3380720d50f74e9289fda5cce20d3aa1`.
- Runner: `verify-tls-install.mjs` with `IRISOPS_RENEWAL=1` and `IRISOPS_TLS_UI=1`.
  `verify-renewal.mjs` adds the bounded renewal and real-clock gates.
- Pre-change backup: sibling `iris-ops-guard-pre-renewal-20260926`, 185 files copied
  and compared by SHA-256 before editing. No restore/overwrite was performed.
- g and h are stopped, retained failed-attempt laboratories. Their disposable
  fixtures remain. h's two administrative changes were independently read back
  and restored before the harness assertion. g never reached a mutation test.
- i is also stopped with fixtures retained. Its runtime matches h/j; only the
  test harness changed. See `tls-interruption-i.json`; it is not a completed run.
- Original 52801 laboratory and earlier f reference remain preserved. Nothing
  changed Windows trust roots, Docker settings, the public version or release.

## Remaining scope limits

Still an isolated pilot for two fixed disposable targets, not a general-purpose
server guard for all Ops Studio operations. Test certificates expire after two
days. This does not validate production gateway/certificate lifecycle, combined
TLS plus durable-volume recovery, public/remote topology, HA, generalized target
policy, all race schedules or migration of the rest of the UI. The real-clock
test is not accelerated by changing timestamps or native token policy.

Official contract reviewed:
[IRIS native JWT login and refresh](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ROARS_iam_jwt).
The endpoint rotates tokens; guarded writes never invoke it automatically.

## Recommended next gate

Combine this exact HTTPS/renewal package with the previously validated durable
storage layout in a NEW lab, then test container replacement and independent
backup restoration with the same certificates/origin and proof-bound receipts.
Do not presume that separate TLS and durability successes prove their combination.
Production gateway/certificate lifecycle and generalized target policy remain
separate decisions; this gate does not authorize publication or broad migration.
