# IRIS SysAdmin API compatibility

The portal targets the official IRIS SysAdmin API v2 specification. This table
records the response and request details that the UI handles explicitly.

| Workflow | Endpoint | Contract detail handled |
| --- | --- | --- |
| Login | `POST /login` | Stores the returned access token only in page memory |
| Overview | `GET /v2/monitor/dashboard/main` | Reads nested `Performance`, `Status`, `SystemUsage`, `Alerts`, and `Licensing` objects |
| Processes | `GET /v2/processes` | Unwraps the top-level `result` array and maps canonical fields such as `Pid`, `Nspace`, and `CPUTime` |
| Process control | `POST /v2/process/{suspend,resume,terminate}` | Sends the required process `id` as a query parameter |
| Database storage | `GET /v2/databases` | Maps database directory, server, mount status, and startup mount policy |
| Devices | `GET /v2/devices` | Maps physical device, type, subtype, and administrative description |
| Tasks | `GET /v2/tasks` | Maps `Id`, `Name`, `Suspended`, `LastFinished`, and `NextScheduled` |
| Run task | `POST /v2/task/run` | Sends task `id` in the query and `RunNow` in JSON |
| Suspend task | `POST /v2/task/suspend` | Sends task `id` in the query and `LeaveInQueue` in JSON |
| Access | `GET /v2/security/{users,roles,resources}` | Preserves IRIS field casing while displaying normalized columns |
| Web apps | `GET /v2/web-apps` | Maps authentication methods, dispatch class, namespace, and resource |
| Protected assets | `GET /v2/wallet/collections`, `GET /v2/security/x509-credentials` | Displays metadata without rendering secret strings |
| OAuth client servers | `GET /v2/security/oauth2/client/server-definitions` | Maps issuer endpoints and client/resource counts without requesting tokens |
| OAuth resources | `GET /v2/security/oauth2/resource-servers` | Maps resource-server names to their server definitions |
| OAuth server clients | `GET /v2/security/oauth2/server/clients` | Displays client identifiers and redirect metadata while redacting secret fields |
| Audit | `POST /v2/security/audit/records` | Treats the query as read-only and follows its asynchronous status URL |
| Async jobs | `GET /v2/async-result` | Polls until Finished, Failed, Canceled, or the bounded timeout |

The repository does not vendor or modify the API specification. The canonical
source is the
[InterSystems SysAdmin API specification](https://github.com/intersystems-community/sysadmin-api-specification).
