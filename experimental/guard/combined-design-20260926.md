# One session, two bounded guarded workspaces

Status: COMBINED LAB PILOT VALIDATED, NOT READY for general release. 2026-09-26.
Final evidence: [combined-validation-20260926.md](combined-validation-20260926.md).

Scope: integrate the two already validated disposable operations into a single
explicit lab profile. Keep public 1.2.1, existing profiles and receipts intact.
No general target allowlist, production installer, TLS claim or publication.

- New native CSP session application `/api/irisops-combined-guard`, same fixed local IRIS.
  The original `/api/irisops-guard` feasibility probe is preserved unchanged;
  the initial ownership check detected that name collision before any replacement.
- One current-user upstream login. No privileged service account or credential
  copy between CSP applications. Common logout invalidates both workflows.
- Fixed server route prefixes `wallet` and `webapp`. They map to constant classes,
  never a class/path/host supplied by a client. Unknown prefixes are rejected.
- Each channel is bound to its operation kind. Unlocking wallet cannot authorize
  webapp writes; neither operation can cancel/consume the other's preview.
- Existing persistent receipt kinds and per-operation recovery proofs remain
  authoritative. Cross-kind inspection/execute/recovery must fail closed.
- Server-reported capability checks guide disabled controls; native permissions
  are checked again at preview/execution/recovery. Capabilities are not authority.
- Browser shares login, not approvals. Controllers, recovery storage, receipts
  and write timers stay separated; navigation never silently enables writes.
- No direct native browser fallback. Other workspaces remain clearly unavailable.

Required gates: direct HTTP cross-kind tests; one login for two real operations;
limited-role capability denial; common expiry/logout; navigation/preview races;
lost response recovery without resend; secret-free UI; 1440x900 and 390x844;
full previous wallet, webapp and transport regressions. Fixtures restored and
removed, receipt history retained, original native dispatcher restored.

Source backup before edits: sibling `iris-ops-guard-pre-combined-20260926`.
Four core file hashes compared. No database/volume backup is claimed.
