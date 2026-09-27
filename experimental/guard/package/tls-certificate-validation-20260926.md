# Certificate replacement, invalid-certificate rejection and rollback

Status: PASS for the bounded certificate gate with initialized UI. OPEN P2
startup usability finding below. NOT READY for production/publication.
Date: 2026-09-26. Public release 1.2.1 is unchanged.

## Scope

An isolated same-image IRIS Community 2026.2 lab, with NEW durable storage and
separate private certificate volumes. No original lab, archive or certificate
is reused as writable storage. No operating-system trust-store or clock changes.
No commit, push, release or public description change.

Exact runtime image:
`sha256:e3bf6afaa22a0aca00891927506772b80720b5059403ecf705cca703e88af704`.
Immutable package: sibling `irisops-guard-tls-package-20260926-j`.
35-entry content SHA-256:
`2be717326bdb6a4a93058f0b02a61811ffbb743c388965b9dd42bad6a036962a`.

Runner: `verify-tls-certificates.mjs ../irisops-guard-tls-package-20260926-j e`.
Requires the verified Node/Docker/Playwright/Chrome paths and `IRISOPS_TLS_UI=1`,
`IRISOPS_RENEWAL=1`. Never reuse an occupied suffix. The new
`tls-certificate-lifecycle.mjs` extends the proven TLS baseline. Neither modifies
runtime source. Current-run resource names start `irisops-guard-tls-cert-20260926-e`.
Attempt a is retained separately and is not a successful certificate validation.

## Corrected harness failure and retained attempt

Attempt a stopped during the first replacement-certificate generation. Its
non-root generator mounted the empty destination at `/dest`, which was not
owned by UID 51773, so even copying the PUBLIC CA certificate failed with
permission denied. No replacement key/certificate was created and no certificate
rotation occurred. Its 16 baseline live groups had passed, but the overall
attempt is correctly recorded `complete:false`. The source engine is stopped
with exit code 0, test fixtures/receipts retained, and original labs unchanged.

The test harness now mounts the fresh destination at the image's existing
UID-owned `/durable` directory, retaining its non-root user, no network, dropped
capabilities, read-only root filesystem and read-only CA source. Certificate
generation is performed before starting IRIS, so fixture errors fail early.
Three new harness tests cover directory/mount constraints, collision refusal
and stopping after generator failure without deleting or proceeding further.
The b repeat used entirely new resources and repeated the complete TLS baseline.

## Browser failure investigation and OPEN product finding

Attempt b passed the complete baseline, trusted replacement, native fresh login
and receipt recovery, then failed browser automation. The deliberately redacted
browser error did not initially identify a precise step. Diagnostic c reproduced
a pre-login form failure without TLS errors, page exceptions or administrative
requests. Diagnostic d, with safe phase/status diagnostics and a pre-credential
screenshot, passed the full certificate lifecycle but intentionally omitted the
long real-clock baseline. It is NOT the final acceptance run. All attempts are
retained; failed attempts remain stopped with their synthetic fixtures intact.

**OPEN / P2 usability: connection controls are enabled before guard initialization.**
`web/assets/app.js` awaits the dynamic guard imports near lines 67-72 before
binding connection listeners near lines 1556-1557. The static buttons in
`web/index.html` (lines 39 and 52) are already enabled. The early static frame can
also briefly show the default Safe demo label before the guarded UI renders.

This is reproducible without credentials: `probe-guard-startup.mjs` holds the
dynamic import, clicks the visible enabled button and observes a closed dialog;
after releasing the import and waiting for the guard to render, a fresh click
opens it. Zero API requests were made. See
[controlled observation](guard-startup-observation-e.json).

The certificate functional harness now waits for the actual rendered guard
before clicking, rather than using an arbitrary delay, and waits for toast
opacity zero before screenshots. This fixes test synchronization, NOT the
product's early-click issue. It remains open and blocks a blanket readiness
claim. Recommended repair: disable/mark loading on initial connection controls,
enable only after listeners and profile are ready, and keep a clear disabled
failure state if import fails. Test delayed and failed imports plus keyboard use.

Attempt e completed the real-clock and certificate sequence with this
explicit initialized-UI precondition. Native TLS checks still use strict CA/IP
validation; invalid certificates are not exempted or retried insecurely.

## Completed acceptance sequence

1. Repeat installation, native TLS login, renewal/expiry and two real operations
   in the fresh durable lab. Preserve two independently verified receipts.
2. Generate independent keys/certificates in new volumes: trusted replacement
   signed by the lab CA; wrong identity signed by that CA; expired certificate
   signed by that CA; and self-signed untrusted certificate. Private keys never
   leave Docker. Retain the original certificate unchanged for rollback.
3. Cleanly stop the engine before every change. A new engine reuses only this
   run's durable data, mounts the selected certificate volume READ-ONLY and
   exposes only loopback TLS port 52804. One data-volume writer at a time.
4. Accept the different valid certificate and key with strict CA/IP validation.
   Require fresh login, reject old session/renewal/channel/preview and recover
   existing receipts with correct proofs only, without mutation replay.
5. Boot the three invalid variants and require specific TLS client errors.
   Do not send credentials to these endpoints, disable verification or fall back
   to HTTP. Native metadata and receipt digests must remain unchanged.
6. Roll back by mounting the retained original certificate volume in a new
   engine. Verify exact certificate identity, fresh login, recovery and native
   integrity. Perform real browser QA on valid replacement and rollback.
7. Execute two new reversible operations after rollback, restore fixture values
   and verify all four receipts. Remove only the seven new reproducible fixtures,
   suspend the final guard and stop all new engines; retain volumes/evidence.

## Final measured results (attempt e)

Completed at `2026-09-26T19:55:05.057Z` with process exit code 0.
[Full sequence evidence](tls-certificate-evidence-e.json) and
[certificate lifecycle evidence](tls-certificate-lifecycle-e.json) both have
`complete:true`. 29 grouped live checks passed; repeated browser groups are
included and this is NOT 29 distinct product operations.

| Certificate state | Actual result |
| --- | --- |
| New trusted leaf and key, same lab CA and IP | Strict HTTPS accepted, new native login and renewal succeeded |
| Wrong identity | `ERR_TLS_CERT_ALTNAME_INVALID` |
| Expired (validity ended 2020-01-02 UTC) | `CERT_HAS_EXPIRED` |
| Untrusted self-signed | `DEPTH_ZERO_SELF_SIGNED_CERT` |
| Retained original certificate restored | Exact certificate bytes/fingerprint matched, HTTPS/login/recovery succeeded |

Original/rollback SHA-256 certificate fingerprint:
`59:4F:32:37:1E:0E:FA:07:9E:C8:BF:84:7D:9D:CC:32:2E:BD:FA:1A:31:C3:DD:1D:BF:B5:74:26:3E:CD:7F:EE`.
Trusted replacement fingerprint:
`AA:EB:84:B0:65:6B:51:DB:B6:F9:D0:10:85:80:1B:BC:EE:F9:51:B5:9B:2C:92:10:A5:93:38:BD:83:47:AA:E5`.

- All three invalid deployments preserved native target metadata and original
  receipt digests. The strict client rejected TLS before authenticated use;
  no credentials were sent to those endpoints and no HTTP fallback was used.
- Replacement and rollback rejected the earlier session, renewal ID, write
  channel and preview. Two historical receipts recovered with correct proofs;
  wrong proofs were rejected. Each result retained `dispatchCount=1`, and each
  inspection reported `administrativeWrites=0`.
- After rollback, two additional actual changes passed guard verification and
  independent native readback. Native fixture values were restored; all four
  receipts recovered without replay and original receipt digests were unchanged.
- Native integrity passed for both application databases after trusted
  replacement, rollback and post-rollback changes.
- Real seven-renewal/five-minute deadline and separate 59-second native-expiry
  checks passed again. Renewal did not extend the original family deadline.
- Browser source/replacement/rollback runs passed at 1440x900 and 390x844 with
  zero page exceptions and zero direct native API calls. Both screenshots for
  EACH phase were visually inspected: readable/wrapped content, disabled write
  controls in server read-only, no body overflow or obscuring toast. Mobile
  navigation remains an intentionally horizontal scroller. These initialized-UI
  results DO NOT close the independently reproduced startup finding.
- All six final engines are stopped, exit code 0. The final deployment is
  SUSPENDED. Only seven newly created, reproducible test fixtures were deleted;
  four receipts remain. No old container, volume, backup or personal object was
  deleted. Original 52801 identity/state and deployment/receipt snapshot matched
  the initial observation; reference j and previous durable lab remained stopped.

Final engine: `irisops-guard-tls-cert-20260926-e-rollback`, ID
`8ebed68bce88f8b9b5c602f6caf33fb3eb1ddab9988c4b89e3ac4db18a89d4ff`.
All six engine IDs and five certificate-volume identities are in lifecycle JSON.
The shared NEW data volume is `irisops-guard-tls-cert-20260926-e-data`; only one
engine consumed it at a time. Certificate volumes were mounted read-only into
engines and no private keys were exported to host files or tool output.

Browser evidence:
[source](clean-ui-tls-cert-source-e/result.json),
[replacement](clean-ui-tls-cert-trusted-e/result.json),
[rollback](clean-ui-tls-cert-rollback-e/result.json).

## Next action

Fix and verify the OPEN startup-control issue before expanding the pilot or
calling the interface release-ready. Then add operator-side certificate
preflight before service interruption; encrypted off-host backup with independent
key recovery remains a separate future gate. Do not publish this experimental
guard based on certificate success alone.

## Baseline checks completed

- Existing Node suite initially passed 174/174. With three new harness regression
  tests, the complete suite passes 177/177, zero skipped. These harness tests do
  not replace native certificate checks.
- Syntax validation passes 60 JS/MJS files, including the new runners, diagnostic
  helper, read-only startup reproduction and harness regression tests.
- All 35 immutable package entries match their manifest hashes.
- Public README, package version and module.xml remain identical to Git HEAD.
- Experimental README content was snapshotted into sibling
  `iris-ops-guard-pre-certificate-docs-20260926/README.md` and compared before
  any documentation update (line endings normalized for that content comparison).

## Boundaries that must remain explicit

- This is a clean-stop/manual volume-selection rotation, NOT hot reload, zero
  downtime, automated renewal, public PKI issuance or CA rotation/revocation.
- Authorization invalidation comes from the native restart/boot epoch. It must
  not be attributed to certificate replacement alone.
- Invalid-certificate acceptance is tested by Node's strict CA/IP/time-validating
  HTTPS client. Browser functional QA uses an exact-leaf-SPKI test-profile
  exception only for known valid lab leaves. It does NOT validate browser trust
  distribution or certificate-error behavior, and does not change Windows trust.
- The bad-certificate cases intentionally demonstrate availability loss while
  preserving data. They are negative lab deployments, not a production installer
  that preflights and refuses all bad certificates before stopping service.
- Native integrity covers the two application databases only. Known synthetic
  values are scanned in responses and final-engine diagnostics; no exhaustive
  secret-format or every-system-log guarantee is made.
- The server guard still covers only the two isolated pilot workflows. This is
  not full-product server safe mode or a production-readiness declaration.
- Private certificate volumes are local, retained and not exported or encrypted
  by this test. Independent key recovery and encrypted off-host backup remain
  separate work; rollback assumes the retained original certificate is usable.

## Official basis

OpenSSL supports explicit start/end validity dates when issuing test certificates:
[openssl ca reference](https://docs.openssl.org/3.5/man1/openssl-ca/).
This permits an actually expired certificate without altering the host clock.
The strict client uses certificate validation and reports specific rejection
codes as described in the [Node TLS reference](https://nodejs.org/api/tls.html).
