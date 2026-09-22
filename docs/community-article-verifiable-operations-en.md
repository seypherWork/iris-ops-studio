# Beyond HTTP 200: verifiable administrative workflows for InterSystems IRIS

An administrative request returning HTTP 200 tells us that the server accepted
and processed a request. It does not, by itself, prove that the target reached
the state the operator intended.

That distinction matters when the request suspends a process, runs a scheduled
task, changes a user's roles, or modifies a role's resource permissions. The
1.1.0 release of IRIS Ops Studio therefore treats the response as the middle
of the workflow, not the end.

> Validation note: the implementation and automated/mock checks described
> here passed. User-role, role-resource, process, and task workflows were also
> checked on a disposable IRIS 2026.2 instance. These browser-side safeguards
> do not replace IRIS server authorization; see the validation report.

## The workflow: Preview → Confirm → Execute → Readback

For a supported mutation, Ops Studio now performs four explicit stages:

1. **Preview** — read the current object and calculate the expected state.
2. **Confirm** — require a phrase bound to the selected target, such as
   `SUSPEND PROCESS 8421`.
3. **Execute** — send the documented SysAdmin API request.
4. **Readback** — issue a second GET and compare the observed state with the
   expected state.

The operation journal records a precise outcome:

- `verified` when the second read matches;
- `pending` when a task was accepted but completion was not observed within the
  bounded polling window;
- `mismatch` when the resource remains readable but differs from the expected
  state;
- `error` when readback itself fails;
- `unverified` for a custom API Explorer mutation with no known safe readback;
- `demo-verified` when the same state transition runs against the stateful demo
  fixtures rather than live IRIS.

A permission update can instead be `blocked / stale` when the object changes
after preview. That outcome is recorded without sending the `PUT`.

This vocabulary is intentionally conservative. A green HTTP response never
silently becomes a green verification result.

## Readback contracts for processes and tasks

The readback rule depends on the operation:

| Operation | Execution | Verification |
| --- | --- | --- |
| Suspend process | `POST /v2/process/suspend?id=…` | `GET /v2/process?id=…` reports a suspended state |
| Resume process | `POST /v2/process/resume?id=…` | The process state is no longer suspended |
| Terminate process | `POST /v2/process/terminate?id=…` | `GET /v2/process?id=…` returns HTTP 404 |
| Suspend/resume task | `POST /v2/task/{suspend,resume}?id=…` | `GET /v2/task/info?id=…` reports the expected `Suspended` boolean |
| Run task | `POST /v2/task/run?id=…` | A refreshed pre-run baseline is followed by a new `LastFinished`, without running or failure status |

Termination is a useful example: for this operation, “not found” is not an
error to hide. It is positive evidence that the process no longer exists.

## Permission changes without echoing an entire response

The Access control workspace also moves beyond inventory.

For a user-role change, the client:

1. reads `GET /v2/security/user?name=…`;
2. extracts only fields documented as mutable by the official User schema;
3. adds or removes the selected value from `Roles`;
4. reads the object again immediately before execution and blocks if it changed;
5. sends `PUT /v2/security/user?name=…`;
6. reads the user again and verifies the complete resulting Roles collection.

Role-resource changes follow the same pattern with
`GET, PUT /v2/security/role`. Existing unrelated grants are preserved, the
entire result set is verified, and permission strings are normalized to the
documented `R`, `W`, and `U` order. Missing, malformed, or duplicate source
collections fail closed.

The guided workflow excludes built-in administrator identities and prevents
direct edits to roles beginning with `%`. Advanced custom requests remain
possible through the Explorer, but they are not misrepresented as automatically
verified.

## One Incident Timeline, three evidence sources

Verification is useful only if an operator can review it later in the same
session. The new Incident Timeline normalizes three sources:

- asynchronous security audit records;
- scheduled-task execution history;
- the in-memory Ops Studio operation journal.

Each event receives a common shape:

`time · severity · source · subsystem · entity · actor · message · correlation`

The view can filter by source, severity, free text, entity, actor, or correlation
identifier. Source loading is independent: if an account cannot read one source,
the available sources remain visible and the unavailable one reports its own
status.

The journal is deliberately ephemeral. It is not written to local storage or
session storage. Passwords, tokens, credentials, private keys, and secret-bearing
query parameters are redacted before evidence is rendered.

## Validation and reproducibility

The candidate remains dependency-free in production. The local mock server is
now stateful enough to exercise mutation followed by readback for processes,
tasks, users, and roles.

The current suite contains 57 tests with zero failures. The testable API,
explorer, operation, and sanitization modules have 98.75–98.98% line coverage
across repeated runs; this does not include the browser application. The 34
catalogued endpoint/method pairs were also checked against the official
SysAdmin API v2 specification.

The new permission mutations, process and task workflows, partial log-source
failures, and desktop/mobile layouts were checked against disposable IRIS 2026.2
fixtures. The test instance is stopped and its volume is retained for a possible
recheck. Publication is a separate decision; see the validation report for the
current evidence and remaining release steps.

## Try the safe demo

```bash
git clone https://github.com/seypherWork/iris-ops-studio.git
cd iris-ops-studio
npm start
```

Open `http://127.0.0.1:4173`, keep **Safe demo** enabled, and follow the
90-second jury route in the README.

- Repository: https://github.com/seypherWork/iris-ops-studio
- Public demo: https://seypherwork.github.io/iris-ops-studio/
- Official SysAdmin API specification:
  https://github.com/intersystems-community/sysadmin-api-specification

IRIS Ops Studio does not replace IRIS authorization. IRIS roles and privileges
remain the enforcement boundary. The portal's job is narrower and practical:
make operator intent explicit, verify what can be verified, and label everything
else honestly.
