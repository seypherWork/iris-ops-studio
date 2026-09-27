# HTTP guard validation — prototype, not a release

Date: 2026-09-25. Isolated IRIS Community 2026.2 Build 221U.
Public base remains 1.2.1 / `a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`.

## Read-transport scope (subsequently extended)

The subsequent server-controlled wallet write pilot is documented separately in
[wallet-validation.md](wallet-validation.md). The observations below concern the
read/identity/custody suite, not the complete protected product.

`HttpApi` exposes native session information, explicit connection, one wallet
metadata read, and logout. `HttpTransport` uses only the official local login
and wallet read routes. `Vault` seals the token with AES-256-GCM using the native
server-side session key and binds it to actor, session and boot epoch.

The user's password and the native refresh token are not retained by our code.
Authorization expires after 60 seconds; there is no automatic refresh/replay.
This deliberately short pilot lifetime is **not finished login UX**.

## Observed results

- Anonymous requests denied. Native actor retained by a scoped HttpOnly cookie.
- Wallet read denied until explicit server-side upstream connection.
- Connect rejects missing/wrong CSRF, foreign origin, a different username and
  caller-selected host fields.
- Same limited fixture operator receives HTTP 200 through both the native API
  and the new adapter, with identical two-field wallet policy metadata.
- Native API and adapter both reject after role permission removal. The adapter
  clears its upstream authorization and requires explicit reconnection after
  permissions are restored.
- Native application disabled or denied by its application resource prevents
  the adapter from reading; it does not bypass the HTTP gateway.
- A separate native session for the same actor cannot reuse the first session's
  upstream authorization. No shared administrator service account is used.
- Direct POST/PUT/PATCH/DELETE to the wallet route are rejected and independent
  native readback confirms no fixture policy change. Guided preview/execute
  routes are separate and are exercised by the wallet suite, not this check.
- No token/password returned by the HTTP responses. Errors are generic and
  metadata is allowlisted. Synthetic upstream secret fields/errors are withheld.
- Controlled upstream redirects are not followed. Missing policy fields,
  malformed policies, wrong target name, oversized data and invalid JSON are
  rejected. Recovery after restoring the native dispatcher keeps the same actor.
- Synthetic custody checks: ciphertext roundtrip; plaintext absent from session
  Data envelope; fresh nonce; tamper rejected and envelope cleared; session and
  boot binding; expired envelope rejected.
- Actual 61-second wait: guard access expires while native session remains valid.
- Actual restart of the named disposable IRIS container: temporary boot epoch
  is absent, old access is rejected and an explicit new login restores access.
- Fixture account, role, resource and wallet removed and absence verified.
  Native source app restored to enabled, empty resource, `%Api.Admin` dispatcher.
- Existing JavaScript regression suite: **103/103 passed**. Its syntax checks
  and both new Node runners also passed syntax validation. No existing tracked
  production file changed; all new code is under `experimental/guard`.

Artifacts are observations for their recorded runs, not a promise of defect-free
code. The extended evidence JSON records its completion flag; helper assertions
such as resealing a synthetic envelope are not separate product features.

## Test isolation and retained lab objects

Only `iris-ops-guard-dev-20260925` / loopback 52801 was modified or restarted.
The HTTP app dispatches in IRISOPS. `IrisOpsGuardBoot` maps to IRISTEMP and contains
only a nonsecret epoch and laboratory test counters/flags. The earlier package mapping into `%SYS` is used by the
preserved internal experiment and the test-only fault endpoint; it is not a
dependency of the new HTTP transport in normal operation.

`TestSession` and `FaultEndpoint` are explicit test fixtures. They are not
installed by the product module. Fault injection temporarily changes the
disposable lab's native dispatcher and restores it in `finally`; it must never
be used on a production instance. The runner validates the container ID, source
configuration and absent fixture names before proceeding.

## Review of the architecture feedback

1. **Single instance is the chosen scope.** Being hosted in IRIS does not make
   remote communication technically impossible, but multi-instance support
   requires its own target allowlist, identity/custody boundaries and tests. It
   is not implemented or implicitly promised by this service.
2. **Loopback is intentional.** It costs an extra HTTP hop while retaining the
   official endpoint's authentication and application-access boundary. The
   in-process alternative failed the limited-user comparison and was not fixed
   by granting extra system permissions.
3. **The actor stays the caller.** Native CSP authenticates the caller; upstream
   login must name that actor and uses that user's supplied password just for
   the request. Native SysAdmin evaluates the resulting token for every read.
4. **Operational receipts and audit events have different jobs.**
   One-use approval consumption and dispatch state require atomic application
   records. They cannot be replaced by a best-effort audit event. IRIS supports
   user-defined audit events, but they and auditing must be enabled. Emit linked,
   sanitized native events in addition to receipt state, without overwriting
   history when current-state reconciliation observes something different.

No changes to global audit configuration were made. Audit integration remains
pending and is not described as implemented.

## Still required before public feature claims

- Extend the now-tested disposable wallet channel, server-owned previews and
  durable dispatch/verification receipts to the actual product. Complete crash,
  lost-write-response, final-persistence-failure and reconciliation tests; the
  pilot's failed-readback and synthetic-interruption cases are not substitutes.
- Migration of guided operations; no direct-write browser fallback; UI and
  protected-mode Explorer restrictions.
- Broader authentication configurations, production HTTPS/SameSite/Secure
  cookies, session/license lifecycle, quotas and practical authorization renewal.
- Installation/upgrade/rollback validation without prototype mappings or fault
  classes; nonstandard gateway ports, multiple workers/load and other IRIS builds.
- Native audit events with checked configuration/availability and failure policy.

## Official references

- [CSP sessions and server-side Key](https://irisdocs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25CSP.Session&LIBRARY=%25SYS).
- [Native AES-GCM](https://irisdocs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25SYSTEM.Encryption&LIBRARY=%25SYS).
- [User-defined native audit events and enablement](https://irisdocs.intersystems.com/irisforhealthlatest/csp/docbook/DocBook.UI.Page.cls?KEY=AAUDIT).
