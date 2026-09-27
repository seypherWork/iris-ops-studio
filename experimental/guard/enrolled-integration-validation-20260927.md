# Enrolled targets: native HTTP and browser integration validation

Date: 2026-09-27 (Europe/Brussels). **Experimental development integration passed;
NOT a published 1.3 release or a production-readiness certification.**

## Result and provenance

- 212/212 Node tests pass, including legacy profiles and eight new target-policy
  tests. No coverage percentage is claimed by this run.
- 45 native enrollment assertions pass on the integrated runtime, plus actual
  authentication of `IrisOps_TestUser` and denial of enrollment without the
  required native management permission.
- Final full run: [machine-readable result](../../../irisops-enrolled-live-20260927-f/result.json),
  `complete: true`, `phase: complete`, `stopped: true`.
- Final isolated container:
  `41365350f5118f7c19f815dbfc55530f07bc5dd604710a5ed13b551dbf5f056b`.
- Test code: `verify-enrolled-live.mjs f`. Seventeen runtime class hashes are in
  the result. This was a development overlay on a freshly bootstrapped portable-c
  lab, NOT a clean installation of a new distributable artifact.

The existing immutable portable c ZIP is unchanged:
`A9BC10B6C519891E64295DA4A35645FF3760E4D8B8137066C80EC47174956E2C`.
The public README, package version and module.xml were not changed. No commit,
push, release, account change or public submission was performed.

## What now works

1. A native administrator explicitly enrolls an existing wallet, a non-system
   web application and one to eight wallet resources while the deployment is
   suspended. No automatic object discovery or old demo-target fallback.
2. The native transport, preview, immediate authorization checks, execution,
   readback and recovery use the enrolled selection. Previews bind its generation.
3. Capabilities report the selection and allowed resources, or a distinct missing
   policy state. The browser validates the complete response, pins that context,
   and disconnects when it changes. It does not trust a receipt's target as its
   own allowlist.
4. Server READ_ONLY and missing/revoked policy prevent managed writes. Native
   permissions remain necessary. Changing the policy rotates deployment authority
   and invalidates old connections and pending previews.
5. Historical recovery uses the original receipt target. Switching to a different
   enrolled object cannot silently make a receipt read the replacement object.

Only wallet access-policy changes and web-app availability are integrated.
No wallet secret values are requested. Web-app PUT sends only Enabled, with
precondition and readback of the full known configuration digest.

## Real validation performed

- Strict CA/IP-validated HTTPS requests to the new localhost instance.
- Empty enrollment, foreign target, foreign resource and system-app rejection.
- Server READ_ONLY refusal despite otherwise valid native permissions.
- Both real mutations on `IrisOps_EnrolledWallet` and
  `/csp/irisops-enrolled-app`, with independent native readback and restoration.
- Changed web-app description after preview: `409 / BLOCKED / stale`, recorded
  dispatch count zero, application remains disabled, description restored.
- Policy revoked between preview and execute: prior session rejected with 401,
  no receipt reservation created for that operation, fixture unchanged.
- Removed target denies historical recovery. Explicit re-enrollment permits a
  fresh read without replacing the original VERIFIED outcome.
- A second pair, `IrisOps_AlternateWallet` and `/csp/irisops-alternate-app`, also
  executes successfully. Old receipts cannot inspect these replacement targets.
  Both alternate restorations were independently read back. The first pair stays
  unchanged.
- Real browser at 1440x900 and 390x844: enrolled labels, read-only controls,
  wallet editor, before/after dialog, initially disabled confirmation, separate
  write approvals, wallet and web-app execution, receipt inspection and recording
  a read-only observation after restoring native values.
- The UI retains VERIFIED as historical evidence while displaying MATCHES_BEFORE
  for current restored state. No direct browser `/api/admin` fallback, no browser
  page exception, and no known fixture secret found in sampled console output.
- Real restart: enrollment and receipts survive; fresh authorized recovery
  reports dispatch count one and zero new administrative writes.
- Native database integrity passes. Sampled container/Apache error logs did not
  contain generated fixture passwords, Basic credentials, known HTTP-test
  recovery proofs or private-key markers. This is not an exhaustive leakage proof.

The test-browser certificate exception is restricted to the exact lab leaf key.
It does not change Windows trust and is not a finished human onboarding solution.
Passwords are random test-only values held in runner memory, not report files.

## Failures found, preserved and resolved

- Runs a/b stopped before the stale-preview test because the runner had already
  opened four channels. The server correctly refused a fifth. The runner now
  asserts that limit and reconnects explicitly; the server limit was not weakened.
- Runs c/d passed their narrower gates (HTTP operations and read-only browser).
- Expanded run e found a real frontend regression: native wallet metadata preserves
  resource casing and may use documented permission aliases, but the new inventory
  validator accepted only canonical uppercase. The editor would not open.
- `walletMetadata` now validates and normalizes only the inventory-read contract.
  Preview/receipt contracts remain strict and canonical. A dedicated regression
  test uses actual native-style resource casing and tests foreign/extra fields.
- Run f repeated the complete expanded gate successfully after that correction.

Screenshots in the final evidence directory were visually inspected, including
desktop/mobile confirmation dialogs. Long policy JSON wraps inside its panels;
turning that text into clearer field rows remains a presentation improvement.

## Preservation and remaining release gates

All six enrolled-test containers a–f are stopped with exit code zero; their
volumes and evidence remain. Nothing was deleted. The original
`iris-ops-guard-dev-20260925` retained its exact ID and remained running. That is
an identity/running-state check, not a full hash audit of its databases.

Before a release:

1. Build an independent, immutable package containing this policy/runtime/UI.
   The old portable builder still pins the historical m/c runtime and its counts;
   it must not be represented as containing these new changes.
2. Repeat clean installation and the expanded live gate from that new package,
   without this development overlay. Bind frontend hashes as well as native
   class hashes to the new artifact.
3. Finish native-operator and trusted-TLS onboarding without blanket permissions,
   global certificate bypasses or exposure of the native administrative port.
4. Re-run/migrate prior interruption, renewal-loss and upgrade/recovery suites
   against this target-policy profile. Their earlier fixed-target evidence is
   historical, not proof for the changed runtime.
5. Clearly disclose that other workspaces are not migrated and independent direct
   access to IRIS is outside the guard's boundary. Existing-instance upgrade and
   cross-machine operation are not established by this run.

No claim of zero defects, universal server protection or contest placement follows
from these results. Public publication still requires the user's final approval.
