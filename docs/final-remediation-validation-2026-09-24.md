# IRIS Ops Studio 1.2.0 — final remediation validation

Date: 24 September 2026. Status at validation: **pre-publication candidate**. This report applies
only to the isolated source tree used for the final remediation build, not to
the previously prepared ZIP or the public 1.1.0 release. No commit, push,
release, or Open Exchange edit was made as part of this validation.

## Remediation scope

The 14 defects F01–F12, F14 and F15 in the independent final audit were
corrected. Regression tests cover safety classification, cross-instance and
same-instance operation races, asynchronous polling and login cancellation,
task freshness and positive success, Explorer 202 and response ordering,
journal severity, connection health, structured errors, credential redaction,
and responsive navigation. The additional observations F13, F16 and F17 led
to target-bound confirmation, bounded inventory detail reads, and recursive
served-file hash checks in the Windows validation script. The old candidate
and its ZIP were preserved unchanged.

## Automated evidence

- The corrected tree passed **84/84** Node tests and JavaScript syntax checks.
  The test command uses Node's experimental VM modules to include interaction
  tests for browser `app.js`.
- A repeat coverage run reported approximately **79.4% aggregate line
  coverage**, including `app.js` (62.1%). This cannot be compared directly to
  the earlier 99% imported-module-only figure and does not prove absence of
  defects.
- Synthetic browser regressions reproduced the former connection/preflight
  race and required zero writes on the newly selected instance. They also
  exercised cancellation, out-of-order Explorer results, async audit polling,
  and credential-shaped text redaction. Synthetic results are not presented as
  IRIS server evidence.

## Docker and real IRIS evidence

Docker Desktop initially could not start because a stale per-user socket
endpoint prevented engine initialization. Only the two affected runtime
socket directories were moved to dated quarantine siblings after confirming
the engine and WSL were stopped. The Docker data VHDX, existing containers,
named volumes, and prior release artifacts were not moved or deleted. The
official Docker Desktop start command then restored a working engine. This is
an observed recovery, **not** proof that the startup problem is permanently
fixed; Docker may need a separate root-cause repair if it recurs.

The corrected application was installed on a fresh, mount-free disposable
IRIS Community 2026.2 container exposed only on 127.0.0.1:52786. The test
account password was intentionally weak for this local disposable validation;
it is not in this report or any release file and must not be reused. Browser
login showed Live IRIS and authenticated server data, not Safe demo.

Observed against that live instance:

- All ten portal areas loaded. The API Explorer returned real IRIS server
  information, and the asynchronous audit query reached a result rather than
  stopping at a pending-job identifier.
- The disabled disposable `IrisOps_TestUser` gained, then lost, only
  `IrisOps_TestRole`. Independent API reads found the user disabled with no
  roles afterward.
- `IrisOps_TestRole` gained `R` on the disposable
  `IrisOps_TestResource`, then lost it. Independent API reads found no resource
  grants afterward.
- A grant preview was opened, the disposable role description was changed
  independently, and the old preview was submitted. Ops Studio displayed the
  stale-state block; an independent read found no resource grant. The original
  description was restored and verified. The browser observation and final
  state establish the block, but an HTTP-level capture of zero PUT requests
  was not taken in this live run; the zero-write assertion is covered by the
  synthetic regression test and the precondition-before-request code path.
- Desktop **1440×900** and mobile **390×844** viewports were measured in the
  browser. All ten areas opened without a page-level horizontal overflow or
  page error. The mobile confirmation dialog and Incident Timeline were
  inspected visually. No warning/error console entries were observed.

The final image `iris-ops-studio-v12-remediation-final:20260924` was rebuilt
from the corrected source, including the final task-verification fix, and
installed into a second fresh, mount-free container on 127.0.0.1:52787.
Installation succeeded, the container was healthy with zero restarts, the
portal returned HTTP 200, all eight served HTML/CSS/JavaScript files matched
source SHA-256 values, and a SysAdmin security request without a token returned
HTTP 401. It was then connected to Ops Studio in Live IRIS mode for a final
authenticated task-run test. A disposable, on-demand, no-op task
(`IrisOps QA Final 52787`, ID 1000, namespace USER) was created only in that
container. Before the run, IRIS reported `LastStarted=0` and `LastFinished=0`.
The UI marked the operation verified only after the new run completed. An
independent `%SYS.Task` read reported fresh `LastStarted` and `LastFinished`,
`Status=1`, and `Error=Success`. Guided Suspend also returned a verified
readback, and an independent read confirmed `Suspended=1`. The task class is
excluded from the source package and the task cannot run on a schedule.
The first container's final task-verification asset
was updated in place and its served hash matched the corrected source before
the live browser checks.

## Limits and release gate

- The final rebuilt image passed fresh installation, static-file identity,
  authorization-boundary and authenticated task Run/Suspend checks. Access
  mutations and the stale-preview block were exercised on the first corrected
  container with matching runtime assets, not repeated on the final image.
  Prior process and web-app mutation tests are documented in the earlier
  `final-qa-2026-09-24.md`; they are not presented as tests of this exact image.
- In-place upgrade on an existing IRIS installation is still unverified.
  The separate Management REST catalog remains permission-dependent.
- The portal is a static client: its guided safeguards do not impose a
  server-enforced read-only mode. IRIS authorization is the server-side
  boundary. Do not claim perfect security or complete API behavior coverage.
- Both disposable test containers are retained for inspection. They have no
  mounted volumes; no cleanup of existing user containers or volumes was
  performed. Their intentionally weak test passwords must not be reused or
  exposed publicly.

The candidate is suitable for a publication decision with these explicit
limits, but publication still requires the owner's fresh confirmation.
