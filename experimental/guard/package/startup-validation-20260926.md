# Startup readiness gate: early-click repair

Status: six native-browser startup cases PASS; full regression PASS.
Experimental guard remains NOT READY for general release. No publication.
Date: 2026-09-26. Public version remains 1.2.1.

## Change and previous defect

The earlier [certificate report](tls-certificate-validation-20260926.md) records
the reproducible P2 startup issue: static connection buttons were enabled while
dynamic imports had not yet bound their listeners. The first click could be lost,
and the initial frame misleadingly showed the default demo status.

The source now has an inert application root and disabled connection buttons in
the initial HTML, with neutral `Not connected` / `Loading` labels. A small startup
module imports the application and enables the root only after imports, listener
binding and the initial render finish. Guard import failure propagates to this
gate instead of continuing partial initialization. A failed import or actual
15-second timeout leaves the application blocked and offers a manual page reload.
Late completion cannot turn a failed gate back into ready. No automatic retry,
login, fallback to the direct API or credentials are introduced.

If the startup module itself is unavailable, its own JavaScript error handler
cannot run: the static blocked state and reload instructions remain. With
JavaScript disabled, a visible noscript message explains the requirement.
The gate is a usability control, not a new authorization/security boundary.

Modified runtime files: `web/index.html`, `web/assets/app.js`,
`web/assets/styles.css`; new `web/assets/startup.js`. Existing unrelated guard
work was preserved. Before modification, five affected existing files were
copied to sibling `iris-ops-guard-pre-startup-fix-20260926` with SHA-256 readback.

## Exact candidate, separate from earlier references

NEW artifact: sibling `irisops-guard-tls-package-20260926-k`, 36 manifest entries.
Content SHA-256:
`d90e20a67c63f2fe71ab36708fa835d2b43ad5f57797f44e75bab6949c742c61`.
NEW image: `iris-ops-guard:tls-lab-20260926-k`, ID
`sha256:0f4595c23041c0b60deccca075f7b49428163547e36a13f886ffa8b508a499f3`.
Base image ID verified before build:
`sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.
Built locally using `--pull=false --network=none`; earlier j package/image and
all pre-existing labs, volumes and archives are preserved.

Runner: `verify-startup-live.mjs ../irisops-guard-tls-package-20260926-k b`, with
`IRISOPS_TLS_UI=1` and `IRISOPS_RENEWAL=1` and the verified executable paths.
It repeats the full TLS/renewal/certificate sequence after startup tests. New
resources start `irisops-guard-startup-20260926-b`. It does not upgrade the original
52801 instance or any previous image/data volume. Certificates and native
synthetic credentials stay in the disposable lab, not public assets.

## Startup evidence

[Six cases on real IRIS](startup-ui-iris-b/result.json):

| Case | Expected and observed |
| --- | --- |
| Delayed guard import, 1440x900 | Root inert, button disabled, no early click; ready state then keyboard login dialog works |
| Delayed guard import, 390x844 | Same behavior using the unique mobile connection button |
| Failed guard module | Clear failed state, blocked controls, keyboard reload recovers |
| Failed static dependency | Same blocked state and manual recovery |
| Failed startup module itself | Static blocked state/reload instructions preserved; keyboard reload recovers |
| Actual 15-second timeout then late successful import | Failed state remains blocked; only manual reload recovers |

Every startup case recorded zero API requests, zero page exceptions and no
credentials entered. Enter opens and Escape closes the connection dialog only
after readiness; inert controls cannot acquire focus or accept an early click.

[Separate demo regression](startup-demo-validation-b/result.json) passed desktop
and mobile initialization, keyboard dialog interaction, navigation through tasks,
web apps and overview, no API requests, no page exceptions and no body overflow.
The JavaScript-disabled document remains inert with a visible explanation.

181/181 Node tests pass, zero skipped, including four new behavioral tests for
pending load, import failure, late success and late rejection after timeout.
The existing HTML contract was updated to require the disabled/inert initial state.

## Completed real-IRIS regression

[Full live evidence](startup-live-evidence-b.json) completed at
`2026-09-26T20:15:53.815Z`, with 30 passing grouped checks. These include repeated
browser groups, not 30 distinct administrative operations. The startup group
contains the six cases listed above. The run repeated strict TLS 1.2/1.3 and
negative protocol/origin checks, native login, server read-only enforcement,
both real reversible writes with independent native readback, seven explicit
renewals across the actual five-minute family limit, actual native expiry,
permission revocation/restoration, lost-response handling, logout and restart.

[Certificate lifecycle evidence](startup-certificate-lifecycle-b.json) confirms
trusted leaf/key replacement, rejection of wrong-identity/expired/untrusted
certificates before authenticated use, and exact original-certificate rollback.
Old authority and approvals were rejected after restart. Historical receipts
were unchanged; two more verified operations after rollback were restored, and
all four receipts were recovered without administrative replay. Native integrity
checks passed for both application databases.

Actual desktop/mobile screenshots were visually reviewed for initial source,
trusted replacement and rollback (`clean-ui-startup-source-b`,
`clean-ui-startup-trusted-b`, `clean-ui-startup-rollback-b`). They show readable
layouts, disabled write controls and no credential values. Each browser group
recorded zero page exceptions and zero direct native administrative requests;
the recorded `net::ERR_FAILED` is the deliberately discarded renewal response,
not an unexplained application failure. Startup loading/failure/timeout captures
and both ordinary-demo captures were also visually reviewed.

All six new engines are retained stopped with exit code 0. Final engine:
`irisops-guard-startup-20260926-b-rollback`, ID
`8683cdb3862ae4fa0539d817105a2b4aca1f779bc8308819213dd563189227c0`.
The exact IDs and owned volume names are in the evidence above. The final
deployment is SUSPENDED. Only the seven runner-owned synthetic fixtures were
removed: one web app, wallet, user, role and three resources. Four receipts and
all new data/certificate volumes remain retained, as do failed attempt a and
all earlier labs. The runner verified the original 52801 lab's identity, running
state and original snapshot unchanged, plus the stopped j reference identity.
No host trust store/clock, public README/version, commit or publication changed.

The 181-test suite was run again during the final live regression, with zero failures/skips.
All 65 selected JavaScript modules passed syntax checks. Both j and k manifests
were rechecked: only the four intended frontend paths differ, and native IRIS
classes, bootstrap and Dockerfile are identical between these candidates.

## Harness interruptions disclosed

First native attempt a stopped at the mobile slow-load test. Its locator selected
`[data-open-connection]`, which matches both connection buttons after application
initialization adds that attribute to the desktop button. The harness now targets
`.mobile-only[data-open-connection]`; the entire sequence is repeated in fresh b
resources. Attempt a is retained stopped; it failed before native test-account
creation, so `fixturesRemoved:false` does not mean a user fixture was leaked.

The first demo harness launch could not create Chrome temporary artifacts under
the sandbox. It did not run browser tests. The approved retry used a fresh output
directory and temporary test browser profile, not the user's browser/session.

## Limits

This repair does not expand the two-workflow guard pilot, rotate trust roots,
prove hot upgrades or production deployment, or provide encrypted off-host backup.
Browser tests use the exact lab leaf's SPKI exception; separate native clients
validate CA/IP/time strictly. No Windows trust or clock settings changed.
The original runtime remains untouched; this new candidate is not published.
Existing-browser cache migration and all-browser compatibility are not asserted;
the new entrypoint/application use a distinct startup query version. The CSS
URL remains on the existing release query, so in-place upgrade cache behavior
is still outside this fresh-install validation.
