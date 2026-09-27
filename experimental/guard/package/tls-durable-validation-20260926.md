# Combined HTTPS, renewable sessions and durable recovery

Status: PASS for the bounded combined laboratory gate — still NOT READY for
production/publication of the experimental guard.
Date: 2026-09-26. Public version 1.2.1 and its release remain unchanged.

## Scope and fixed inputs

This gate combines previously separate TLS/renewal and persistent-storage tests.
It uses the exact already-validated j runtime, not a rebuilt or upgraded image:

- Image: `sha256:e3bf6afaa22a0aca00891927506772b80720b5059403ecf705cca703e88af704`.
- Package: sibling `irisops-guard-tls-package-20260926-j`, 35 manifest entries.
- Content SHA-256: `2be717326bdb6a4a93058f0b02a61811ffbb743c388965b9dd42bad6a036962a`.
- Baseline Git HEAD: `a2d087a8584cf437fc619dc8e4a887c1dd8ba00c`.
- Original 52801 engine and stopped j reference are only checked read-only.
- No product/runtime source, public README, version, commit, push or release was
  changed. Only new isolated test runners and experimental documentation are added.

Runner: `verify-tls-durable.mjs ../irisops-guard-tls-package-20260926-j a`, with
the verified Docker, Node, Playwright and Chrome paths plus `IRISOPS_TLS_UI=1`
and `IRISOPS_RENEWAL=1`. The suffix must be unused. `tls-durable-lifecycle.mjs`
adds replacement and restoration to the existing TLS test sequence.

## Completed evidence sequence

1. Install on a new named data volume, with `ISC_DATA_DIRECTORY=/durable/iris`
   and a separate read-only private certificate volume. Publish only
   `127.0.0.1:52804 -> 52774`. Check native durable mode and exact package hashes.
2. Repeat TLS, native login, explicit renewal, obsolete approvals, revocation,
   real five-minute expiry, browser response-loss and native restart checks.
3. Preserve two real verified receipts and create a pending preview/write grant.
   Cleanly stop the first engine. Start a DIFFERENT container with the same image,
   data volume, certificate and origin; do not rerun installation.
4. Compare deployment state and complete receipt digests. Reject the old session,
   renewal ID, channel and preview. Reconnect and recover using correct proofs
   only; wrong proofs must fail. Check native target metadata and DB integrity.
5. Stop that replacement. Back up its data volume read-only, restore into a NEW
   empty independent volume and compare file bytes/metadata BEFORE first boot.
   Start a third engine using that volume and the retained certificate volume.
6. Repeat authority invalidation, read-only recovery, real browser tests and
   native integrity. Execute two NEW reversible operations on the restored copy,
   restore targets, and verify four unchanged, independently recoverable receipts.
7. Remove only the seven reproducible fixtures in the final restored copy,
   suspend it, stop all new engines and verify preservation of the original lab.

All seven steps completed. Machine evidence:
[complete TLS sequence](tls-durable-evidence-a.json),
[replacement and archive lifecycle](tls-durable-lifecycle-a.json),
[source browser result](clean-ui-tls-durable-a/result.json) and
[restored browser result](clean-ui-tls-durable-restored-a/result.json).
Final evidence timestamp: `2026-09-26T19:15:24.844Z`.

## Observed results

- 24 grouped live checks passed. This includes repeated source/restored browser
  groups; it is not a claim of 24 distinct product operations.
- Seven explicit renewals were exercised across the real five-minute family
  deadline. Renewal could not extend that deadline. Separately, the observed
  native-bounded authorization was 59 seconds and expired despite read activity.
- Old sessions, renewal IDs, enabled write channels and pending previews were
  rejected after replacement and restoration. Fresh native login/renewal worked.
- Two source receipts survived replacement and independent-volume restoration.
  Two additional real operations executed on the restored copy, were verified
  by independent native readback, and their fixture values were restored.
  All four receipts recovered with correct proofs, `dispatchCount=1` and
  `administrativeWrites=0`. Wrong proofs failed. Original receipt digests did
  not change; recovery did not repeat a mutation.
- Native integrity checks passed for the two application databases after
  replacement, restoration and the two new writes.
- Actual browser runs at 1440x900 and 390x844 passed before and after restore:
  zero page exceptions and zero direct native `/api/admin` requests. Both
  desktop/mobile image pairs were visually inspected: readable controls and
  content, wrapped mobile layout, disabled write controls in server read-only
  mode. The mobile navigation intentionally scrolls horizontally; the page body
  does not. This is the guarded pilot, not an audit of every product screen.
- A successful renewal response was intentionally lost in both browser runs:
  the UI disconnected, did not retry, and required explicit reconnection.
- Known synthetic password/recovery values and private-key markers were checked
  in responses and the final engine's Apache/Docker logs. Browser diagnostics
  were checked by the harness. This is bounded detection, not proof against all
  possible secret formats or a full inspection of every native log database.
- The three new engines are stopped with exit code 0. The final restored guard
  is SUSPENDED and its seven synthetic fixtures were removed; its four receipts
  remain. Fixtures in the stopped source checkpoint/archive remain intentionally
  preserved. They are test-only and can be regenerated, not real user objects.
- Original 52801 identity/running state, deployment snapshot and receipt count
  matched the initial observation. Reference j stayed stopped. No prior image,
  volume, container, archive, public file or release was removed or changed.

## Exact retained identities

All engine names share prefix `irisops-guard-tls-durable-20260926-a-`:

| Suffix | Container ID | Data-volume suffix |
| --- | --- | --- |
| source | `9c21624be044f42121383aab39a7cdb9d915948c686d7b2ac492eae223a503b0` | data |
| replacement | `4a968cb9e661986db689cac533f12ed8badfec7f6b30e37ddde283e5546d7151` | data |
| restored | `6beac3fb3b17fb1914bf5a670e9c28943059ebdf9710bf7169485fd60fec9720` | restored-data |

The source and replacement share data but were never running concurrently.
Read-only final inspection confirmed the exact durable and certificate mounts
on all three engines. Helpers and volume names are recorded in the JSON files.

Archive: `/checkpoint.tar` inside volume
`irisops-guard-tls-durable-20260926-a-archives`, 280,360,960 bytes.
Archive SHA-256:
`4e1ab02840fe36bf0f53cf2c58c64f15a3a58262f739be8985876e8c77384d2a`.

Source checkpoint and restored volume BEFORE first restored boot both had
logical fingerprint
`1a6005e16abf5aaf3ae6889b37b413cc8bd5577efebc6af4e8c3270bd39bf96f`.
The stopped source retained this fingerprint through the end of the run. The
restored volume is expected to diverge after boot, new operations and cleanup;
no claim of post-boot byte equality is made.

No runtime defect was observed within this combined gate, and no runtime source
was modified to obtain the result. The newly added runners are laboratory
verification tools, not production deployment or backup utilities.

## Checks completed before the live sequence

- 35 immutable artifact entries verified against their hashes.
- 174/174 existing Node tests pass; no skipped tests. These do not by themselves
  test Docker/IRIS persistence. Native/live evidence is recorded separately.
- Syntax checks pass for 54 JS/MJS files, including both new runners.
- Experimental README backed up and compared by SHA-256 in sibling
  `iris-ops-guard-pre-tls-durable-docs-20260926` before documentation changes.

## Storage, confidentiality and recovery limits

All new names begin `irisops-guard-tls-durable-20260926-a`. Existing volumes,
images, engines, earlier archives and failed-attempt evidence are preserved.
Exactly one engine may write a data volume. Backup/restore helpers have no
network, no capabilities, a read-only root filesystem, native UID/GID 51773,
and explicit read-only source mounts. A restore refuses a nonempty target.

The checkpoint archive is retained ONLY in a new Docker archive volume. It is
not exported to Windows, GitHub or Open Exchange. It is NOT encrypted and may
contain native account/session data; it must not be treated as a public asset.
The certificate private key never leaves its new private Docker volume. The
restored engine REUSES that volume: certificate backup/restore is not claimed.

The logical fingerprint binds paths, types, file contents, owner/group, mode,
mtime and symlink targets. It does not assert identical sparse allocation,
inodes, atime/ctime, ACLs/xattrs or physical disk layout. The archive hash protects
this exact archive's bytes, not reproducibility of newly generated TAR files.

This is same-image, same-host, clean-shutdown recovery. It does NOT prove
power-loss recovery, off-host disaster recovery, archive encryption/key recovery,
production certificate lifecycle, an IRIS/package upgrade, or general safe mode
for every Ops Studio operation. Native integrity covers the two explicit
application databases, not all native system databases.

## Recommended next bounded gate

Validate certificate replacement and failure handling on a separate disposable
copy: trusted replacement, wrong identity, expired/untrusted certificate and
safe rollback, preserving receipts and requiring fresh authorization. Keep
private keys out of source control and diagnostic output. Encrypted off-host
backup plus independent key/certificate recovery is a separate later gate;
neither is demonstrated by the present same-host data-volume restoration.

## Official basis

[InterSystems container and durable SYS documentation](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ADOCK)
requires persistent storage together with the durable directory setting. The
test checks actual mounts and native deployment state rather than treating the
environment variable or a running container alone as evidence of persistence.
