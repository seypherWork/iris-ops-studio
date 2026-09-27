# Enrolled guard: interruption, replay and dispatcher-transition regression

2026-09-27, Europe/Brussels. **Bounded real-IRIS fault gate PASSED.**
Experimental; not a production certification or permission to publish 1.3.

## Artifact and scope

The unchanged independent enrolled-target ZIP was extracted and clean-installed
in two NEW isolated IRIS Community instances, with full baseline browser/native
tests repeated on each. Public 1.2.1, old bundles and the original development
container were not modified. No runtime/frontend file in the ZIP was changed.

- ZIP SHA-256: `D0BFAC2C5AA174E3649CF37E97485090E96753679AD08CC309283D8872C2AEBA`.
- Runtime hash: `671e64db7e93d9dbe96c03377e9f64dc9192f50500c623a29be7dd3f7ecca57e`.
- Final run: `verify-enrolled-live.mjs c ../irisops-enrolled-extracted-20260927-a`,
  with `IRISOPS_ENROLLED_FAULTS=1`.
- Final container ID: `a520628da67fa13142e10f76e2ec743e665bffbb06cc5bf7b6726f2d8a3ebd05`.
- [Full result](../../../irisops-enrolled-clean-20260927-c/result.json),
  [fault matrix and helper hashes](../../../irisops-enrolled-clean-20260927-c/faults.json),
  [retained-data shutdown](../../../irisops-enrolled-clean-20260927-c/stopped.json).
- Earlier run b also passed. Run c expanded it with same-session replay and an
  instrumented restart; b is retained, not represented as a failed attempt.

Instrumentation is explicitly laboratory-only: separate fault-injection subclasses
call the real runtime, and a test dispatcher counts requests reaching the native
administrative API. Test helpers are not distributed in the ZIP. Worker exit is
an actual ObjectScript HALT at a selected test seam, not a fabricated HTTP error.
No real user, application or production process was targeted.

## Results

**216/216 Node tests**, including the helper-contract regression below, pass.
The fresh-install baseline also passes: 45 native enrollment assertions, both
browser workflows, desktop/mobile assets, stale/revoked-target rejection,
independent native restoration, logs and database integrity checks.

For EACH of wallet policy and web-application availability:

| Injected failure | Native PUTs observed | Preserved result | Current-state observation |
| --- | ---: | --- | --- |
| Worker exit before native dispatch | 0 | UNKNOWN | MATCHES_BEFORE |
| Worker exit after native dispatch | 1 | UNKNOWN | MATCHES_EXPECTED |
| Failure persisting final result | 1 | UNKNOWN | MATCHES_EXPECTED |
| Native readback unavailable | 1 | UNKNOWN | MATCHES_EXPECTED after reads restored |

All eight cases passed. Restoring each fixture was independently read back.
Importantly, the durable receipt's `dispatchCount: 1` is a reservation before I/O,
not proof that IRIS received a PUT. The test distinguishes that reservation from
the independent native request counter (zero in the first row).

Re-sending the **exact execute request in the same session** returned HTTP 200 with
the existing UNKNOWN receipt in every case, without another native PUT. The server
does not falsely convert uncertainty into VERIFIED. Two subsequent reconciliations
append observations without altering the original events/state. After reconnecting,
the old execute binding is rejected with 404; a wrong recovery proof also gets 404.
After restoration, observations become MATCHES_BEFORE, not a rewritten history.

## Lifecycle and concurrency

- Initial/read-only transitions are idempotent; stale plans are rejected.
- Changing to the separate laboratory dispatcher build is rejected unless the
  deployment is first suspended. Verified and uncertain receipts remain readable.
- A real in-flight operation holds the deployment lock. A concurrent suspension
  returns `deployment_busy`; the operation completes exactly once.
- Returning to the original dispatcher preserves receipts and read-only recovery
  causes zero native PUTs.
- An actual activation-worker exit leaves TRANSITION and the HTTP service blocked.
  A stale recovery fingerprint is rejected. Explicit fresh recovery changes only
  to SUSPENDED, never ACTIVE.
- An injected activation exception also leaves SUSPENDED. Previous write authority
  is not silently restored.
- With native PUT counting still active, a real IRIS restart preserves every public
  receipt hash and the read-only deployment. Recovery and old execute requests cause
  **zero native PUTs**, even after deliberately reactivating the service and logging
  in again. A second restart after restoring the normal native dispatcher passes
  the ordinary recovery, integrity and source-file hash checks too.

This verifies dispatcher replacement/return in an owned laboratory, **not** an
in-place 1.2-to-1.3 data-schema upgrade or downgrade on a customer's instance.

## Finding corrected in the test infrastructure

`WebTestExecution.ReadState` still had the old two-argument signature, while the
real runtime now passes the enrolled target as a third argument. It was corrected
to forward that target. A new Node test compares the declarations and checks the
forwarding call. This was an outdated fault helper, not a shipped-runtime defect.
The replacement test dispatcher now exercises both workflows, and the web crash
helper records its interruption point so the runner verifies actual worker exit.

No new runtime defect was exposed by this bounded matrix. That is not evidence
of universal absence of defects or coverage of every possible crash instant.

## Preservation and remaining work

The native admin dispatcher and full property hash were restored. Original
receipt hashes were preserved. Temporary fault flags were cleared. Both new test
engines were suspended/stopped; all data and evidence were retained, none deleted.
Known test-secret checks passed on sampled logs. No private keys or credentials
were written to reports; only public evidence and hashes were saved.

Still pending: human TLS trust/identity onboarding and final release scope/artifact
audit. No host trust-store change, public documentation change, commit, push or
publication occurred. Machine power loss, every installation crash point,
cross-host deployment and customer schema migration remain outside this evidence.
