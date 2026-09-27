# Staged target policy — native validation

Completed 2026-09-27 Europe/Brussels (resource names retain their 20260926 run
prefix). **Native enrollment gate passed; HTTP/UI integration NOT DONE.**
The public product and portable source bundle c remain unchanged.

## Implemented and tested

[TargetPolicy](IrisOps.Guard.TargetPolicy.cls) supplies terminal-only plans,
enrollment, revocation and conservative selection queries. An administrator
selects existing object names; no wildcard and no demo fallback. It preserves
native objects, permissions, receipts and policy history. Changes require
SUSPENDED mode and use the deployment lock. Policy and a fresh authority
generation are committed together to the journaled guard database.

The final d run passed:

- 41 native assertions in [TestTargetPolicy](IrisOps.Guard.TestTargetPolicy.cls):
  missing/corrupt/altered policy denies; malformed/system target names rejected;
  duplicate resources rejected; required resources/current wallet policy checked;
  READ_ONLY and ACTIVE enrollment refused; exact confirmation, five-minute expiry,
  future-expiry bound, outer-transaction refusal, native metadata drift, no replay,
  generation change, revocation and explicit reenrollment verified.
- Separate native authentication as a newly created restricted `IrisOps_TestUser`
  with only `IrisOps_TestRole` / `%DB_IRISOPS:R`; enrollment rejected because the
  native administrative requirements were missing. Plaintext credentials were
  generated in runner memory and not printed or written to reports.
- Real restart preserved the final policy and SUSPENDED mode.
- Independent native readback confirmed own wallet Edit/Use resources, webapp
  disabled state and original description. Policy methods granted no permissions
  and changed no native target; test-only description drift was restored.
- Native database integrity passed in `%SYS`.
- Existing **204/204 Node tests** passed; the 41 native assertions are separate,
  not added to the Node count or presented as 41 administrative operations.

Final evidence is in sibling directory `irisops-policy-validation-20260926-d`:
`result.json`, preparation/installation receipts, `stop-plan.json` and `stopped.json`.
The runner is [verify-target-policy.mjs](verify-target-policy.mjs).

## Exact source hashes

| File | SHA-256 |
| --- | --- |
| `IrisOps.Guard.TargetPolicy.cls` | `64428F12758A1761E4F12F9747ABA07B8A00851C5C8D850C7B3978DBF17368D0` |
| `IrisOps.Guard.TestTargetPolicy.cls` | `B561D97600B8D485D9DD275B4A223FC244A9B60924577EB6A02E04B3A10C64EB` |
| `verify-target-policy.mjs` | `BCDDE9952E01B916BAA3F2F3EB3F8396F3B4F4671ACCA21F9E13D7CCF3554EF8` |

The immutable portable c archive retains SHA-256
`A9BC10B6C519891E64295DA4A35645FF3760E4D8B8137066C80EC47174956E2C`.
Its installer created each NEW isolated instance. Policy and test classes were
then loaded manually only into that instance; this is NOT an updated packaged
runtime or an upgrade claim.

## Failed attempts, fixes and preserved resources

| Attempt | Result / correction | Container ID |
| --- | --- | --- |
| a | Incorrect ObjectScript arithmetic grouping rejected valid expiry windows; corrected `expires > (now + 300)` | `0a182cceb9b07686300a4d5e03eab5f2cc4a38b4cdb1541e1b2dbf5218f40fa5` |
| b | Cross-namespace call could not resolve the IRISOPS helper from `%SYS`; replaced with the current class's local status helper | `482c66d6d58791dc3bbbffcccd8dc269667a2800662d491c0a97640322d3e327` |
| c | 33 policy assertions and restart passed; runner incorrectly called the native integrity routine from IRISOPS rather than `%SYS` | `76f6b3ab651f64b14db6be0623ee9dec1ce880f294937646a3a1201412ab9aea` |
| d | Full rerun including revocation, reenrollment and integrity passed | `fb6fbbc1c6f767002555adb614cf0c3e39c4b2e08b051c1fddd6b3af973e0584` |

All four `irisops-pilot-policy-20260926-{a,b,c,d}` engines are independently
verified stopped with exit code 0. Their containers, data, certificate volumes,
fixtures and failed-attempt evidence are retained, not deleted. The original
`iris-ops-guard-dev-20260925` remains running with its unchanged ID
`d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
This verifies identity/running state, not a new full backup comparison.

## Limits and next release gate

This class currently enforces enrollment **only when its methods are called**.
The product's existing HTTP transport, execution, recovery and browser contracts
do not call it yet. Authorization-generation change was observed in native state;
new policy-specific stale HTTP requests were not tested. Native public/default
app restrictions exist in code but not every rejection branch has a live fixture.

Before calling this a useful 1.3 feature, integrate every enforcement layer and
prove changes on explicitly enrolled non-hardcoded targets, including denied
targets, concurrent policy changes, pre-dispatch revocation, interrupted responses
and historical recovery. Initial browser trust and native user onboarding remain
separate unfinished work. No public README/version change, commit, push or
publication was performed. No contest ranking is implied by these results.
