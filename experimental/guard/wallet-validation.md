# Wallet execution pilot — NOT READY for product release

Date: 2026-09-25. IRIS Community 2026.2 Build 221U, lab loopback port 52801.
Public base: 1.2.1, `a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`.
Lab container: `iris-ops-guard-dev-20260925`, immutable ID
`d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
Image: `sha256:5c02f86186a42aad59c7c32b00b7d64feb015104edd5b03f9d00907191a22f0c`.

This report preserves the first execution milestone. Its then-pending recovery
and browser work has since advanced; see [recovery-validation.md](recovery-validation.md)
for fresh-session/restart recovery, real worker interruptions and pilot UI tests.
The limitations below describe that original milestone unless superseded there.

## Implemented boundary

Only `wallet.policy.update` on `IrisOps_GuardProbeWallet` is accepted. Both
policy fields must refer to `IrisOps_GuardProbeResource` or
`IrisOps_GuardProbeAlternate`. No secret values are read or changed.

The native CSP caller creates a server-owned channel (read-only initially),
explicitly enables writes, and requests a preview. Execute accepts only the
preview ID and confirmation: the browser cannot replace its target or payload.
The server rechecks channel, generation, expiry, caller permissions and both
current policy fields. The preview lifetime is 30 seconds; channel and upstream
authorization are capped at 60 seconds. Reconnection clears approvals/channels.

Execution reserves the operation durably in an independent transaction before
the single HTTP PUT. Ambient transactions are rejected without rolling back
the caller's transaction. A bounded operation lock and persisted ID suppress
replay. The same user's native SysAdmin token is used; there is no privileged
administrative service account. Native HTTP still performs its access checks.

Both policy fields are read back. Only a matching readback with successfully
saved receipt is reported VERIFIED. Failed readback is UNKNOWN. A persisted
DISPATCHING record is exposed as UNKNOWN, never automatically sent again.
`dispatchCount` counts **reserved sends**, not proof that a packet reached IRIS.
The independent test dispatcher counts actual native PUT requests separately.

## Direct observations

The extended runner completed and restored its fixture state:

- Read-only, invalid targets/policies, extra fields and duplicate keys: zero PUTs.
- Browser attempts to substitute execution fields and wrong confirmation: rejected.
- Two concurrent HTTP requests for one preview: same verified operation and exactly
  one observed native PUT; repeated execution adds no PUT.
- Both changed fields independently checked, then restored through the guard.
- Real PUT followed by injected readback failure: UNKNOWN; independent read
  confirms the change happened; repeating execute sends nothing. Restored afterward.
- External change after preview: BLOCKED/stale and zero guard PUTs.
- Cancellation, disabled/re-enabled channel, permission revocation and deleted
  target: no mutation; deleted wallet is not recreated by the guard.
- Receipt storage denied: failure before any PUT; original access restored.
- Another CSP session of the same actor cannot use the preview or read its receipt.
- Synthetic interrupted DISPATCHING receipt: UNKNOWN, no replay.
- Actual 31-second wait: preview expired while upstream authorization remains valid.
- Actual lab restart: hashes of every recorded public receipt and event unchanged.
- Ambient transaction: HTTP-equivalent execution method rejects at entry and
  preserves caller transaction level. This particular check is a terminal unit test.
- Existing JavaScript regression: 103/103 tests pass; package syntax checks pass.

See `wallet-execution-extended-evidence.json` for the latest extended run and
`wallet-execution-evidence.json` for an earlier fast run (their recorded checks
and timestamps may differ). The short artifact must not be treated as evidence
of restart/expiry. Read/custody regression is separate in `http-validation.md`.

## Storage, instrumentation and cleanup

Lab installer creates `IRISOPSGUARD` at `/durable/irisops-guard-state/`, maps only
own receipt/index/lock globals, and requires private `%DB_IRISOPSGUARD` plus enabled
database journaling. The actual database resource and journaling settings are
verified on reuse; mismatches are rejected rather than repaired implicitly.
The lab size cap is 64 MB, not a proven production retention/quota policy.

`IrisOps_GuardStorage` grants only this database's RW access as an application
role. The test operator has no standalone access to the receipt database and
receives no extra administrative permissions through this role. Native audit
configuration is unchanged. These application records do not replace IRIS audit.

`CountingAdmin` is test-only. It temporarily subclasses the native dispatcher
to count exact wallet PUTs and inject a failed readback, then the runner restores
`/api/admin` to `%Api.Admin`, enabled, with its original empty resource. Never
install this instrumented dispatcher in production.

The test wallet is restored, then the runner removes only its owned disposable
account, role, wallet and two resources and verifies absence. Receipts and the
own protected storage/database/mappings are retained. No historical evidence,
production container or reference volume is deleted.

## Limits and remaining gates

- No browser integration, no protected mode for the existing product, no IPM
  installer, no clean install/upgrade/rollback certification for these classes.
- Same-session concurrent requests can be serialized by CSP. The observed
  one-PUT result is not a distributed-lock/load or exactly-once proof.
- A fresh read followed by PUT is not an atomic conditional native update;
  an external administrator can still race in that interval. A matching readback
  proves observed state, not unique causal attribution.
- No actual process crash between PUT and final save, lost PUT response test,
  forced failure of final receipt persistence, or full disk/quota exhaustion test.
  The synthetic DISPATCHING case does not close those gates.
- No reconciliation route and no cross-session/restart receipt recovery UI/API:
  receipts survive, but the current read API requires the original session/boot
  binding. The persistence check reads them independently from the test terminal.
- Two different users, cross-instance isolation, broad malformed body matrix,
  channel-expiry alone and all control-route CSRF cases remain to be expanded.
- Native audit integration, retention, practical login renewal, licence lifecycle,
  production HTTPS/cookies, other gateway ports/builds and IRIS for Health untested.
- Token custody trusts native server session keys/storage; it is not protection
  against an administrator reading server memory or session databases.

Next gate: strengthen uncertain-result recovery and read-only reconciliation,
then integrate the browser with **no direct SysAdmin write fallback**. Do not
generalize the allowlist or announce server enforcement for the published app.

## Reproduction

Set `IRISOPS_DOCKER_EXECUTABLE` explicitly and
`IRISOPS_EXTENDED_WALLET_TEST=1`, then run
`node experimental/guard/verify-wallet-execution.mjs` from this worktree.
The pinned lab must already have the native CSP app, namespace and boot mapping
from the read-transport setup. This is not a clean-install product test.
Never run the integration runners concurrently.

Database settings reference: [SYS.Database](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=SYS.Database&LIBRARY=%25SYS).
