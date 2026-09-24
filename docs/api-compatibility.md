# IRIS SysAdmin API compatibility

The portal targets the official IRIS SysAdmin API v2 specification. This table
records the response and request details that the UI handles explicitly.

| Workflow | Endpoint | Contract detail handled |
| --- | --- | --- |
| Login and renewal | `POST /login`, `POST /refresh` | Stores access and refresh tokens only in page memory; retries one authenticated request after safe same-instance token rotation |
| Overview | `GET /v2/monitor/dashboard/main` | Reads nested `Performance`, `Status`, `SystemUsage`, `Alerts`, and `Licensing` objects |
| Processes | `GET /v2/processes` | Unwraps the top-level `result` array; maps canonical fields such as `Pid`, `Nspace`, and `CPUTime`; disables actions when `CanBeSuspended` or `CanBeTerminated` is false |
| Process control | `POST /v2/process/{suspend,resume,terminate}` | Sends the required process `id` as a query parameter |
| Process verification | `GET /v2/process` | Reads the selected process after suspend/resume; an HTTP 404 is the expected proof after terminate |
| Database storage | `GET /v2/databases` | Maps database directory, server, mount status, and startup mount policy |
| Devices | `GET /v2/devices` | Maps physical device, type, subtype, and administrative description |
| Tasks | `GET /v2/tasks` | Maps `Id`, `Name`, `Suspended`, `LastFinished`, and `NextScheduled` |
| Task history | `GET /v2/task/history` | Normalizes completed executions into Incident Timeline |
| Task verification | `GET /v2/task/info` | Refreshes the run baseline immediately before execution and evaluates `Suspended`, `LastStarted`, `LastFinished`, `Status`, and `Error`; running and failed tasks cannot be marked verified |
| Run task | `POST /v2/task/run` | Sends task `id` in the query and `RunNow` in JSON |
| Suspend task | `POST /v2/task/suspend` | Sends task `id` in the query and `LeaveInQueue` in JSON |
| Access inventory | `GET /v2/security/{users,roles,resources}`, `GET /v2/security/user` | Preserves IRIS field casing while displaying normalized columns; reconciles each user's enabled state and namespace with the authoritative detail endpoint, and reports `Unknown` rather than a false disabled state if detail cannot be read |
| User-role management | `GET, PUT /v2/security/user` | Requires a valid Roles array, builds only documented mutable fields, repeats preflight before `PUT`, and verifies the complete resulting role set |
| Role-resource management | `GET, PUT /v2/security/role` | Requires a valid resource collection, preserves unrelated grants, normalizes `R`, `W`, and `U`, blocks stale preflight state, and verifies the complete resulting grant set |
| Web apps | `GET /v2/web-apps`, `GET, PUT /v2/web-app` | Maps authentication methods, dispatch class, namespace, and resource; reconciles enabled state with the authoritative detail endpoint; the guided availability workflow preserves documented configuration, blocks protected or stale targets, and checks complete post-write readback. An earlier 1.2.0 build passed a disposable live-IRIS round trip; the final remediation image has a fresh-install and read-only live-IRIS check, while its guided web-app mutation has not been repeated on that image. |
| REST discovery | `GET /api/mgmnt/`, `GET /api/mgmnt/v2/`, `GET` of returned same-instance OpenAPI paths | Read-only browser-session catalog; no SysAdmin token is forwarded, cross-origin or unsafe specification paths are refused, and unavailable sources are shown honestly. The tested live session lacked the separate Management API browser permission, so a populated live catalog remains unverified. |
| Protected assets | `GET /v2/wallet/collections`, `GET /v2/security/x509-credentials` | Displays metadata without rendering secret strings |
| OAuth client servers | `GET /v2/security/oauth2/client/server-definitions` | Maps issuer endpoints and client/resource counts without requesting tokens |
| OAuth resources | `GET /v2/security/oauth2/resource-servers` | Maps resource-server names to their server definitions |
| OAuth server clients | `GET /v2/security/oauth2/server/clients` | Displays client identifiers and redirect metadata while redacting secret fields |
| Audit | `POST /v2/security/audit/records` | Treats the query as read-only, follows its asynchronous status URL, and normalizes `UTCTimeStamp` as UTC |
| Async jobs | `GET /v2/async-result` | Polls only on the accepted request's origin with a pinned connection context; connection changes cancel polling before stale results are returned |

## Verification outcomes

Built-in state changes are never reduced to a successful HTTP response alone.
The client records one of these explicit outcomes in the in-memory operation
journal:

- `verified`: the post-operation GET matches the expected state;
- `pending`: execution succeeded but task completion did not appear during the
  bounded readback window;
- `mismatch`: the resource was readable but did not reach the expected state;
- `error`: the readback request itself failed;
- `unverified`: a custom Explorer mutation has no known safe readback contract;
- `demo-verified`: the same transition was reproduced against stateful demo
  fixtures rather than a live IRIS instance.

A permission update may instead have execution result `blocked` with
verification status `stale` or `invalid`. In that case the fresh precondition
read no longer matches the reviewed object, or the latest response is unsafe to
update, and no `PUT` is sent.

The repository does not vendor or modify the API specification. The canonical
source is the
[InterSystems SysAdmin API specification](https://github.com/intersystems-community/sysadmin-api-specification).
