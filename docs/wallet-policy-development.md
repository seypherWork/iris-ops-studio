# Wallet access-policy editor — 1.2.1 design and validation notes

The tested scope and limits are recorded in
`development-validation-20260925.md`.

## Deliberately narrow scope

Only the `EditResource` and `UseResource` metadata of an existing non-system
collection can be edited. The guided workflow never requests secret values,
creates collections, or exposes collection deletion. X.509 and OAuth guided
views remain metadata-only. Advanced Explorer is a separate workflow and does
not acquire these automatic verification guarantees.

Collection names and policy lengths follow the documented IRIS 2026.2
`%Wallet.Collection` constraints. Unsupported policy expressions, wildcard or
empty access, incomplete snapshots and unknown metadata fields fail closed.
Resource names are compared case-insensitively; permission abbreviations and
documented defaults are normalized before comparison.

The dialog explains that a policy change can broaden or remove access to all
secrets in the collection. It does not enumerate effective users or claim a
complete dependency graph. IRIS enforces `%Admin_Wallet:U`; the browser cannot
grant itself that privilege.

## Execution and limits

1. GET collection metadata before allowing edits.
2. Show both existing and proposed policies and require a typed confirmation.
3. GET again immediately before PUT. Changed, missing or invalid metadata
   blocks the operation without sending PUT.
4. PUT only the two reviewed policy fields.
5. GET independently afterwards and compare both fields. An HTTP success alone
   is not a verified outcome. Journal records execution and verification apart.

The precondition is not an atomic compare-and-swap: the SysAdmin API describes
PUT as create/edit and supplies no conditional-write contract here. Another
administrator could modify/delete the collection between the final GET and PUT;
the latter could recreate a concurrently deleted collection. Do not describe
this as transaction isolation, a server-enforced safe mode, or elimination of
all concurrent changes. Restrict overlapping administration operationally.

Connection changes invalidate both drafts and prepared operations. Canceling a
draft discards it without a write. No credentials or policies are persisted by
the editor outside the in-memory session journal's redacted summaries.

## Evidence gate

Local tests cover normalization, malformed snapshots, both-field verification,
cancel, connection changes and GET/PUT ordering, including stale/404 no-PUT.
Real IRIS API, restricted-account and desktop/mobile browser validation passed
on the development and fresh-install instances on 2026-09-25. See
[the validation report](development-validation-20260925.md) for evidence and
remaining release gates. Docker availability alone is not proof of these tests.

Sources:
- Official SysAdmin API v2: `/v2/wallet/collection`, `WalletCollection` schema.
- https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=%25Wallet.Collection&LIBRARY=%25SYS
- https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Security.Resources&LIBRARY=%25SYS
