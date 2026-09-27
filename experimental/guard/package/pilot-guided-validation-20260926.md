# Guided pilot validation — 2026-09-26

Outcome: guided fresh installation, conservative rejection paths, one controlled
partial failure, and reversible suspension/stop passed on real IRIS Community
2026.2. General release remains **NOT READY**. No commit, push or publication.

## Change boundary

Added the terminal operator, plan/ownership checks and test runners. Runtime m,
native classes, public README, version files and candidate content were not
changed in this block. The target is pinned in
[the operator guide](pilot-operator-guide.md). Existing working-tree edits belong
to earlier blocks and were preserved.

## Evidence

- Node suite: **193/193 passed**, zero skipped; includes ten new plan/operator
  tests. These are test cases, not 193 administrative operations.
- [Successful installation receipt](pilot-guided-a.receipt.json) and
  [event sequence](pilot-guided-a.receipt.json.events.jsonl): exact image files,
  strict TLS, new READ_ONLY bootstrap, repeat native plan NO_CHANGE, exact UI
  bytes/no-store, blocked native routes, empty operation receipt store and native
  database integrity. Completion was recorded at 21:11:38.970 UTC.
- [Negative checks](guided-negative-a.json): wrong confirmation, expired plan,
  repeated installation, occupied port, altered installation receipt and
  unconfirmed rollback all rejected without the requested mutation.
- [Browser evidence](fresh-cache-guided-a/result.json): 1440x900 and 390x844,
  cold load/navigation/reload, all 17 requested UI files matched current hashes
  and no-store, cache enabled but zero cache hits. Zero API calls or page
  exceptions. [Desktop](fresh-cache-guided-a/1440.png) and
  [mobile](fresh-cache-guided-a/390.png) screenshots were visually reviewed.
  This is the disconnected UI served by real IRIS, not an authenticated UI test.
- [Controlled failure proof](guided-failure-a.result.json): a test adapter
  interrupted the first image-hash check after startup and before bootstrap.
  The installer correctly reported failure, stopped only its new engine with
  exit code 0, retained the owned volume and journal, and made zero bootstrap
  calls. This does not simulate power loss or every failure location.
- [Rollback result](pilot-guided-a.rollback-result.json): native SUSPENDED
  readback followed by stop, exit code 0, container and volumes retained.

The unchanged m runtime's prior 31-group authenticated functional regression is
documented in [cache validation](upgrade-cache-validation-20260926.md). It was
not rerun in this installer-only block and is not relabelled as new evidence.

## Final resource state, independently checked

| Resource | Exact identity / state |
| --- | --- |
| `irisops-pilot-guided-20260926-a` | `a22949af17a0f9f5313d5eb2763334102a8d15e966eedb8ae93c477a00a20c8b`, stopped, exit 0 |
| `irisops-pilot-guided-failure-a` | `8c62e12ada2016394ae56e3f30cf480d0ba0df5f980f94ce894187f154d0b329`, stopped, exit 0 |
| `iris-ops-guard-dev-20260925` | `d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`, still running |

New data volumes are respectively `irisops-pilot-guided-20260926-a-data` and
`irisops-pilot-guided-failure-a-data`. Both used the existing
`irisops-guard-startup-20260926-e-cert-private` volume read-only. No data, container
or volume was deleted. Original preservation here means unchanged container ID
and running state with no intentional writes to it, not a new full storage hash
comparison or backup verification.

## Remaining limits

Local prerequisites are not a portable distribution. Only fresh disposable
instances, two guard workflows and loopback are supported. The installer does
not provision identities, activate write mode, replace production accounts,
upgrade a customer instance or defend against local Docker administrators.
Failure recovery is conservative but not fully crash-atomic. Read the
[operator limits](pilot-operator-guide.md#failure-handling-and-limits) before use.
