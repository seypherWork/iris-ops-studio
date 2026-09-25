import {
  IrisAdminClient,
  IrisApiError,
  appendQuery,
  classifySafety,
  confirmationPhrase,
  endpointCatalog,
  redactSensitive,
  redactSensitiveText,
  unwrapIrisResult,
} from "./api.js?v=1.2.1";
import {
  buildRoleResourceMutation,
  buildUserRoleMutation,
  buildWebAppAvailabilityMutation,
  captureProcessPrecondition,
  captureVerificationBaseline,
  createJournalEntry,
  evaluatePrecondition,
  evaluateVerification,
  filterTimeline,
  inferVerification,
  isProtectedUser,
  mergeTimeline,
  normalizeAuditRecords,
  normalizeJournalEntries,
  normalizeTaskHistory,
  reconcileUserSummary,
  reconcileWebAppSummary,
  reconcileTaskSummary,
  redactOperationPath,
  sameOperationContext,
  summarizeReadback,
  verificationPollPolicy,
  webAppGuidedEligibility,
} from "./operations.js?v=1.2.1";
import { loadRestCatalog, loadRestSpec, managementOrigin, summarizeOpenApi } from "./rest-discovery.js?v=1.2.1";
import { NativeLogClient, NATIVE_SOURCES, nativeLogStatus, nativePageNotice, normalizeNativePage } from "./native-logs.js?v=1.2.1";
import { walletEditable, walletSnapshot, buildWalletPolicyMutation } from "./wallet-policy.js?v=1.2.1";
import {
  catalogSelectionValue,
  explorerOutcomeLabel,
  methodAcceptsBody,
  prepareExplorerRequest,
  verifiedJournalCount,
} from "./explorer.js?v=1.2.1";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const demo = {
  info: { server: "iris-ops-demo", version: "IRIS 2026.2", namespace: "%SYS", user: "ops-admin", api: "SysAdmin v2" },
  overview: {
    cpu: 31, memory: 64, database: 47, license: 22,
    uptime: "18d 07h 42m", activeProcesses: 84, queuedTasks: 3, warnings: 2,
    history: [42, 39, 44, 48, 46, 54, 57, 51, 49, 53, 61, 58, 55, 59, 64, 62, 67, 63, 60, 65, 68, 66, 64, 61],
  },
  processes: [
    { pid: 2184, namespace: "%SYS", routine: "%SYS.MONLBL", user: "SYSTEM", state: "RUN", cpu: "00:18:42", elapsed: "03:04:33", canSuspend: false, canTerminate: false },
    { pid: 2218, namespace: "IRISAPP", routine: "Ens.Job", user: "service", state: "RUN", cpu: "00:07:16", elapsed: "01:48:10", canSuspend: true, canTerminate: true },
    { pid: 2237, namespace: "%SYS", routine: "%DMN", user: "SYSTEM", state: "SLEEP", cpu: "00:01:03", elapsed: "18:07:42", canSuspend: false, canTerminate: false },
    { pid: 2311, namespace: "IRISAPP", routine: "Portal.Session", user: "ops-admin", state: "RUN", cpu: "00:02:51", elapsed: "00:34:08", canSuspend: true, canTerminate: true },
  ],
  databases: [
    { name: "IRISSYS", directory: "/usr/irissys/mgr/", server: "Local", status: "Mounted/RW", startup: true },
    { name: "IRISAPP", directory: "/usr/irissys/mgr/irisapp/", server: "Local", status: "Mounted/RW", startup: true },
    { name: "IRISTEMP", directory: "/usr/irissys/mgr/iristemp/", server: "Local", status: "Mounted/RW", startup: true },
  ],
  devices: [
    { name: "|PRN|", physical: "/dev/null", type: "OTH", subtype: "", description: "Default print device" },
    { name: "|TRM|", physical: "/dev/pts", type: "TRM", subtype: "C-IRIS Terminal", description: "Interactive terminal" },
  ],
  tasks: [
    { id: 17, name: "PurgeAudit", namespace: "%SYS", type: "System", next: "Today, 02:00", status: "Ready", lastResult: "Yesterday, 02:01" },
    { id: 24, name: "IntegrityCheck", namespace: "%SYS", type: "System", next: "Sunday, 01:00", status: "Ready", lastResult: "Sunday, 01:47" },
    { id: 31, name: "Backup", namespace: "%SYS", type: "User", next: "Today, 03:30", status: "Suspended", lastResult: "Yesterday, 03:58" },
  ],
  users: [
    { name: "ops-admin", enabled: true, roles: ["%Manager"], lastLogin: "4 min ago", source: "Local" },
    { name: "service", enabled: true, roles: ["AppRuntime"], lastLogin: "18 min ago", source: "LDAP" },
    { name: "audit-reader", enabled: true, roles: ["AuditRead"], lastLogin: "2 days ago", source: "Local" },
  ],
  roles: [
    { name: "%Manager", members: 2, resources: 38, inherited: "%All" },
    { name: "AppRuntime", members: 4, resources: 7, inherited: "AppBase" },
    { name: "AuditRead", members: 3, resources: 2, inherited: "\u2014" },
  ],
  resources: [
    { name: "%Admin_Operate", description: "Operate and monitor IRIS", publicPermission: "" },
    { name: "%Admin_Secure", description: "Manage IRIS security", publicPermission: "" },
    { name: "%DB_IRISAPP", description: "Application database", publicPermission: "R" },
  ],
  userDetails: {
    "ops-admin": { Enabled: true, FullName: "Operations administrator", NameSpace: "%SYS", Roles: ["%Manager"], EscalationRoles: [] },
    service: { Enabled: true, FullName: "Application service", NameSpace: "IRISAPP", Roles: ["AppRuntime"], EscalationRoles: [] },
    "audit-reader": { Enabled: true, FullName: "Audit reader", NameSpace: "%SYS", Roles: ["AuditRead"], EscalationRoles: [] },
  },
  roleDetails: {
    "%Manager": { Description: "IRIS system manager", GrantedRoles: ["%All"], EscalationOnly: false, Resources: [{ Name: "%Admin_Operate", Permissions: "RWU" }, { Name: "%Admin_Secure", Permissions: "RWU" }] },
    AppRuntime: { Description: "Application runtime", GrantedRoles: ["AppBase"], EscalationOnly: false, Resources: [{ Name: "%DB_IRISAPP", Permissions: "RW" }] },
    AuditRead: { Description: "Audit review", GrantedRoles: [], EscalationOnly: false, Resources: [{ Name: "%Admin_Secure", Permissions: "R" }] },
  },
  webapps: [
    { name: "/api/admin", namespace: "%SYS", isDefault: false, enabled: true, auth: "Password, JWT", dispatch: "%Api.Admin" },
    { name: "/csp/ops", namespace: "IRISAPP", isDefault: false, enabled: true, auth: "Password", dispatch: "Static files" },
    { name: "/api/app", namespace: "IRISAPP", isDefault: false, enabled: true, auth: "Delegated", dispatch: "App.REST" },
  ],
  webappDetails: {
    "/api/admin": { Name: "/api/admin", NameSpace: "%SYS", IsNameSpaceDefault: false, Enabled: true, DispatchClass: "%Api.Admin", Resource: "%Admin_Secure" },
    "/csp/ops": { Name: "/csp/ops", NameSpace: "IRISAPP", IsNameSpaceDefault: false, Enabled: true, DispatchClass: "", Resource: "%DB_IRISAPP" },
    "/api/app": { Name: "/api/app", NameSpace: "IRISAPP", IsNameSpaceDefault: false, Enabled: true, DispatchClass: "App.REST", Resource: "%DB_IRISAPP", Description: "Disposable demonstration service" },
  },
  restCatalog: [
    { name: "/api/app", namespace: "IRISAPP", dispatchClass: "App.REST", webApplications: "/api/app", enabled: true, specPath: "/api/mgmnt/v1/IRISAPP/spec/api/app", source: "Demo fixture" },
  ],
  restSpec: { info: { title: "Demo application API", version: "1.0" }, paths: { "/appointments": { get: { summary: "List demonstration appointments" }, post: { summary: "Create a demonstration appointment" } } } },
  secrets: [
    { name: "production-services", type: "Wallet collection", items: 4, state: "Active", rotated: "12 days ago" },
    { name: "web-tls", type: "X509 credential", items: 1, state: "Valid", rotated: "41 days ago" },
    { name: "oauth-client", type: "OAuth configuration", items: 2, state: "Active", rotated: "7 days ago" },
  ],
  walletPolicies: { "production-services": { EditResource: "IrisOps_TestEdit:WRITE", UseResource: "IrisOps_TestUse:READ" } },
  oauthServers: [
    { id: "auth0-prod", issuer: "https://identity.example/", clients: 2, resources: 1 },
  ],
  oauthResources: [
    { name: "iris-operations-api", server: "auth0-prod" },
  ],
  oauthClients: [
    { name: "Operations portal", clientId: "iris-ops", type: "confidential", description: "Administrative portal client", redirects: "https://ops.example/callback" },
  ],
  logs: [
    { time: "03:12:08", level: "WARN", source: "Backup", message: "Backup window approaching configured limit", user: "SYSTEM" },
    { time: "03:08:41", level: "INFO", source: "Security", message: "Access token refreshed", user: "ops-admin" },
    { time: "02:55:19", level: "INFO", source: "Task", message: "PurgeAudit completed", user: "SYSTEM" },
    { time: "02:47:02", level: "WARN", source: "Database", message: "IRISTEMP usage above 70%", user: "SYSTEM" },
  ],
  auditRecords: [
    { AuditIndex: 1042, UTCTimeStamp: "2026-09-21T23:12:08Z", EventType: "%System", EventSource: "Backup", Description: "Backup window approaching configured limit", Username: "SYSTEM", Namespace: "%SYS", Status: "Warning" },
    { AuditIndex: 1041, UTCTimeStamp: "2026-09-21T23:08:41Z", EventType: "%Security", EventSource: "%System", Description: "Successful login", Username: "ops-admin", Namespace: "%SYS", Status: "Success" },
    { AuditIndex: 1039, UTCTimeStamp: "2026-09-21T22:47:02Z", EventType: "%System", EventSource: "Database", Description: "IRISTEMP usage above configured threshold", Username: "SYSTEM", Namespace: "%SYS", Status: "Warning" },
  ],
  taskHistory: [
    { TaskId: 17, Name: "PurgeAudit", Completed: "2026-09-21T22:55:19Z", Status: "Completed", Result: "Success", Namespace: "%SYS", Username: "SYSTEM" },
    { TaskId: 31, Name: "Backup", Completed: "2026-09-21T22:31:04Z", Status: "Suspended", Result: "Operator review required", Namespace: "%SYS", Username: "ops-admin" },
  ],
};

const state = {
  view: "overview",
  demo: true,
  busy: false,
  renderRevision: 0,
  explorerRequestRevision: 0,
  operationPreparationRevision: 0,
  connectionEpoch: 0,
  client: new IrisAdminClient(),
  pendingOperation: null,
  operationJournal: [],
  timelineEvents: [],
  timelineFilters: { source: "all", severity: "all", query: "" },
  nativeLogs: null,
  nativeLogPages: {},
  nativeLogErrors: {},
  nativeLogRevision: 0,
  nativeLogRequests: {},
  nativeLogConnectionStatus: "Enable native logs in Connection settings",
  accessCatalog: null,
  restCatalog: [],
  restOrigin: null,
  connectionContext: { mode: "demo", instance: "demo", actor: "Demo operator" },
};

const titles = {
  overview: "Operational overview",
  processes: "Process control",
  infrastructure: "Storage and devices",
  logs: "Logs and audit trail",
  tasks: "Task management",
  access: "Access control",
  webapps: "Web applications",
  secrets: "Secrets inventory",
  oauth: "OAuth 2.0 management",
  explorer: "SysAdmin API explorer",
};

function escapeHtml(value) {
  return String(value ?? "\u2014").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char]);
}

function rowsFrom(payload, fallbacks = []) {
  const result = unwrapIrisResult(payload);
  if (Array.isArray(result)) return result;
  for (const key of fallbacks) if (Array.isArray(result?.[key])) return result[key];
  if (Array.isArray(result?.items)) return result.items;
  if (result && typeof result === "object") return [result];
  return [];
}

async function mapLimited(items, worker, shouldContinue = () => true, limit = 8) {
  const results = [...items];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && shouldContinue()) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function field(row, ...aliases) {
  for (const alias of aliases) if (row?.[alias] !== undefined) return row[alias];
  const lookup = new Map(Object.keys(row || {}).map((key) => [key.toLowerCase(), key]));
  for (const alias of aliases) {
    const actual = lookup.get(String(alias).toLowerCase());
    if (actual) return row[actual];
  }
  return undefined;
}

function mappedRows(payload, schema, fallbacks = []) {
  return rowsFrom(payload, fallbacks).map((row) => Object.fromEntries(Object.entries(schema).map(([name, aliases]) => {
    const value = field(row, ...aliases);
    return [name, Array.isArray(value) ? value.join(", ") : value];
  })));
}

function isSystemRole(name) {
  return String(name || "").startsWith("%");
}

function table(rows, columns, { empty = "No records returned", actions = null } = {}) {
  if (!rows.length) return `<div class="empty"><strong>${escapeHtml(empty)}</strong><span>Refresh the view or verify privileges for this API.</span></div>`;
  const head = columns.map(([key, label]) => `<th scope="col">${escapeHtml(label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map(([key]) => {
    const value = row?.[key];
    if (typeof value === "boolean") return `<td><span class="pill ${value ? "ok" : "muted"}">${value ? "Enabled" : "Disabled"}</span></td>`;
    if (key === "status" || key === "state" || key === "level" || key === "lastResult") {
      const tone = /run|ready|complete|active|valid|info/i.test(value) ? "ok" : /warn|suspend/i.test(value) ? "warn" : "muted";
      return `<td><span class="pill ${tone}">${escapeHtml(redactSensitiveText(value))}</span></td>`;
    }
    return `<td>${escapeHtml(redactSensitiveText(value))}</td>`;
  }).join("")}${actions ? `<td class="row-actions">${actions(row)}</td>` : ""}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}${actions ? '<th scope="col">Actions</th>' : ""}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function metric(label, value, sub, tone = "") {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(sub)}</small></article>`;
}

function gauge(label, value, tone = "teal") {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="gauge"><div class="gauge-ring ${tone}" style="--value:${safe}"><strong>${safe}%</strong></div><span>${escapeHtml(label)}</span></div>`;
}

function sparkline(values) {
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${38 - (v / 100) * 32}`).join(" ");
  return `<svg class="sparkline" viewBox="0 0 100 42" preserveAspectRatio="none" role="img" aria-label="Recent utilization trend"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#48e5c2" stop-opacity=".35"/><stop offset="1" stop-color="#48e5c2" stop-opacity="0"/></linearGradient></defs><polygon points="0,42 ${points} 100,42" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#48e5c2" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
}

function shellCard(title, body, action = "", source = "IRIS SysAdmin API") {
  return `<article class="card"><header><div><p class="eyebrow">${escapeHtml(source)}</p><h2>${escapeHtml(title)}</h2></div>${action}</header>${body}</article>`;
}

function unavailableSource(name) {
  return `<div class="empty"><strong>${escapeHtml(name)} unavailable</strong><span>This source could not be read with the current connection. Other sections remain usable.</span></div>`;
}

function partialSourceNote(names) {
  return names.length ? `<div class="security-note"><span>!</span><div><strong>Partial data</strong><p>${escapeHtml(names.join(", "))} could not be loaded. No missing source is being shown as an empty result.</p></div></div>` : "";
}

async function request(path, fallbackKey, options = {}) {
  if (state.demo) return structuredClone(demo[fallbackKey]);
  return state.client.request(path, options);
}

async function loadOverview() {
  if (state.demo) return { ...demo.overview, demo: true };
  const [main, resources, usage] = await Promise.allSettled([
    state.client.request("/v2/monitor/dashboard/main"),
    state.client.request("/v2/monitor/dashboard/system-resources"),
    state.client.request("/v2/monitor/system-usage"),
  ]);
  if (main.status !== "fulfilled") throw main.reason;
  const dashboard = unwrapIrisResult(main.value) || {};
  const performance = dashboard.Performance || {};
  const system = dashboard.SystemUsage || {};
  const status = dashboard.Status || {};
  const alerts = dashboard.Alerts || {};
  const licensing = dashboard.Licensing || {};
  return {
    demo: false,
    uptime: status.UpTime ?? "Available",
    activeProcesses: system.Processes ?? 0,
    queuedTasks: Array.isArray(dashboard.UpcomingTasks) ? dashboard.UpcomingTasks.length : 0,
    warnings: Number(alerts.SeriousAlerts || 0) + Number(alerts.ApplicationErrors || 0),
    performance,
    system,
    licensing,
    resources: resources.status === "fulfilled" ? unwrapIrisResult(resources.value) : null,
    counters: usage.status === "fulfilled" ? unwrapIrisResult(usage.value) : null,
    unavailableSources: [resources.status !== "fulfilled" ? "System resources" : "", usage.status !== "fulfilled" ? "System usage" : ""].filter(Boolean),
  };
}

async function renderOverview() {
  const data = await loadOverview();
  const recent = demo.logs.slice(0, 3);
  const posture = data.demo
    ? `<div class="gauges">${gauge("CPU", data.cpu)}${gauge("Memory", data.memory, "blue")}${gauge("Database", data.database, "violet")}${gauge("License", data.license, "amber")}</div>`
    : `<div class="metrics-grid compact">${metric("Global refs/sec", data.performance.GlobalRefsPerSecond ?? 0, "latest sample")}${metric("Cache efficiency", data.performance.CacheEfficiency ?? 0, "global cache ratio")}${metric("License use", data.licensing.LicenseUse === "" ? "Unlimited" : `${data.licensing.LicenseUse ?? 0}%`, "available units")}${metric("Web sessions", data.system.CSPSessions ?? 0, "current CSP sessions")}</div>`;
  const secondary = data.demo
    ? `${shellCard("Utilization trend", `<div class="chart-meta"><strong>${data.cpu}%</strong><span>current CPU</span></div>${sparkline(data.history)}<div class="chart-axis"><span>24h ago</span><span>Now</span></div>`)}`
    : `${shellCard("System safeguards", table([
      { area: "Database space", status: data.system.DatabaseSpace },
      { area: "Database journal", status: data.system.DatabaseJournal },
      { area: "Journal space", status: data.system.JournalSpace },
      { area: "Write daemon", status: data.system.WriteDaemon },
    ], [["area", "Area"], ["status", "Status"]]))}`;
  return `${partialSourceNote(data.unavailableSources || [])}
    <div class="metrics-grid">
      ${metric("Uptime", data.uptime, "continuous availability", "teal")}
      ${metric("Active processes", data.activeProcesses, "current workload")}
      ${metric("Queued tasks", data.queuedTasks, "scheduled operations")}
      ${metric("Warnings", data.warnings, "requires review", data.warnings ? "amber" : "")}
    </div>
    <div class="dashboard-grid">
      ${shellCard(data.demo ? "Resource posture" : "Performance snapshot", posture)}
      ${secondary}
    </div>
    ${data.demo ? shellCard("Recent signals", table(recent, [["time","Time"],["level","Level"],["source","Source"],["message","Message"],["user","Actor"]]), '<button class="text-button" data-go="logs">Open audit view \u2192</button>') : ""}
  `;
}

async function renderProcesses() {
  const payload = await request("/v2/processes", "processes");
  const rows = mappedRows(payload, {
    pid: ["Pid", "pid", "Job"], namespace: ["Nspace", "namespace"], routine: ["Routine", "routine"],
    user: ["Username", "user"], state: ["State", "state"], cpu: ["CPUTime", "cpu"], elapsed: ["ElapsedTime", "elapsed"],
    canSuspend: ["CanBeSuspended", "canSuspend"], canTerminate: ["CanBeTerminated", "canTerminate"],
  }, ["processes", "content"]);
  return shellCard("Runtime processes", table(rows, [["pid","PID"],["namespace","Namespace"],["routine","Routine"],["user","User"],["state","State"],["cpu","CPU time"],["elapsed","Elapsed"]], {
    actions: (row) => {
      const suspended = /susp/i.test(String(row.state));
      const stateButton = suspended
        ? `<button class="mini" data-operation="POST|/v2/process/resume|${escapeHtml(row.pid)}">Resume</button>`
        : `<button class="mini" data-operation="POST|/v2/process/suspend|${escapeHtml(row.pid)}"${row.canSuspend === true ? "" : ' disabled title="IRIS reports that this process cannot be suspended"'}>Suspend</button>`;
      return `${stateButton}<button class="mini danger-text" data-operation="POST|/v2/process/terminate|${escapeHtml(row.pid)}"${row.canTerminate === true ? "" : ' disabled title="IRIS reports that this process cannot be terminated"'}>Terminate</button>`;
    },
  }), '<span class="caption">Mutations require explicit typed confirmation</span>');
}

async function renderInfrastructure() {
  let databases = demo.databases;
  let devices = demo.devices;
  if (!state.demo) {
    const [databasePayload, devicePayload] = await Promise.allSettled([
      state.client.request("/v2/databases"),
      state.client.request("/v2/devices"),
    ]);
    databases = databasePayload.status === "fulfilled" ? mappedRows(databasePayload.value, {
      name: ["Name", "name"], directory: ["Directory", "directory"], server: ["Server", "server"],
      status: ["Status", "status"], startup: ["MountAtStartup", "startup"],
    }, ["databases"])
      .map((row) => ({ ...row, server: row.server || "Local" })) : null;
    devices = devicePayload.status === "fulfilled" ? mappedRows(devicePayload.value, {
      name: ["Name", "name"], physical: ["PhysicalDevice", "physical"], type: ["Type", "type"],
      subtype: ["SubType", "subtype"], description: ["Description", "description"],
    }, ["devices"]) : null;
  }
  return `${partialSourceNote([databases === null ? "Databases" : "", devices === null ? "Devices" : ""].filter(Boolean))}<div class="security-note"><span>\u25a4</span><div><strong>Operating-system coverage</strong><p>Database mount state and configured I/O devices are retrieved from SysAdmin API v2. Overview shows performance counters; CPU and memory gauges are demo-only.</p></div></div>
    <div class="tabbed-cards">
      ${shellCard("Database storage", databases === null ? unavailableSource("Databases") : table(databases, [["name","Database"],["directory","Directory"],["server","Server"],["status","Mount state"],["startup","Mount at startup"]]), '<button class="primary" data-open-explorer="/v2/database|PUT">Configure database</button>')}
      ${shellCard("Configured devices", devices === null ? unavailableSource("Devices") : table(devices, [["name","Device"],["physical","Physical device"],["type","Type"],["subtype","Subtype"],["description","Description"]]), '<button class="primary" data-open-explorer="/v2/device|PUT">Configure device</button>')}
    </div>`;
}

async function renderTasks() {
  const revision = state.renderRevision;
  const payload = await request("/v2/tasks", "tasks");
  let rows = mappedRows(payload, { id: ["Id", "id"], name: ["Name", "name"], namespace: ["Namespace", "namespace"], type: ["Type", "type"], next: ["NextScheduled", "next"], status: ["Suspended", "status"], lastResult: ["LastFinished", "lastResult"] }, ["tasks", "content"])
    .map((row) => ({ ...row, status: typeof row.status === "boolean" ? (row.status ? "Suspended" : "Ready") : row.status }));
  if (!state.demo) {
    rows = await mapLimited(rows, async (row) => {
      try {
        const detail = await state.client.request(appendQuery("/v2/task/info", { id: row.id }));
        return reconcileTaskSummary(row, detail);
      } catch {
        return reconcileTaskSummary(row, null);
      }
    }, () => state.renderRevision === revision && state.view === "tasks");
  }
  return `<div class="split-heading"><div><h2>Scheduled work</h2><p>Inspect, trigger, suspend, and resume background tasks.</p></div><button class="primary" data-open-explorer="/v2/task|POST">Create task</button></div>${shellCard("Task definitions", table(rows, [["id","ID"],["name","Task"],["namespace","Namespace"],["type","Type"],["next","Next run"],["status","Status"],["lastResult","Last finished"]], { actions: (row) => row.status === "Unknown" ? '<button class="mini" disabled title="Task detail is unavailable">Run</button><button class="mini" disabled title="Task detail is unavailable">Suspend / resume</button>' : `<button class="mini" data-operation="POST|/v2/task/run|${escapeHtml(row.id)}">Run</button>${row.status === "Suspended" ? `<button class="mini" data-operation="POST|/v2/task/resume|${escapeHtml(row.id)}">Resume</button>` : `<button class="mini" data-operation="POST|/v2/task/suspend|${escapeHtml(row.id)}">Suspend</button>`}` }))}`;
}

async function renderAccess() {
  const revision = state.renderRevision;
  let users;
  let roles;
  let resources;
  let usersUnavailable = false;
  let rolesUnavailable = false;
  let resourcesUnavailable = false;
  if (state.demo) {
    users = demo.users;
    roles = demo.roles;
    resources = demo.resources;
  } else {
    const [usersPayload, rolesPayload, resourcesPayload] = await Promise.allSettled([
      state.client.request("/v2/security/users"),
      state.client.request("/v2/security/roles"),
      state.client.request("/v2/security/resources"),
    ]);
    usersUnavailable = usersPayload.status !== "fulfilled";
    rolesUnavailable = rolesPayload.status !== "fulfilled";
    resourcesUnavailable = resourcesPayload.status !== "fulfilled";
    users = usersUnavailable ? [] : mappedRows(usersPayload.value, {
      name: ["Name", "name"], enabled: ["Enabled", "enabled"], type: ["Type", "type"],
      namespace: ["NameSpace", "Namespace", "namespace"], roles: ["Roles", "roles"],
    }, ["users"]);
    // IRIS 2026.2 can return stale Enabled=false values from the collection
    // endpoint.  The single-user endpoint is authoritative and is already the
    // source used by mutation preflight/readback, so reconcile the inventory
    // with it rather than presenting an active account as disabled.
    users = await mapLimited(users, async (user) => {
      try {
        const detail = await state.client.request(appendQuery("/v2/security/user", { name: user.name }));
        return reconcileUserSummary(user, detail);
      } catch {
        return reconcileUserSummary(user, null);
      }
    }, () => state.renderRevision === revision && state.view === "access");
    roles = rolesUnavailable ? [] : mappedRows(rolesPayload.value, {
      name: ["Name", "name"], description: ["Description", "description"], createdBy: ["CreatedBy", "createdBy"],
      escalationOnly: ["EscalationOnly", "escalationOnly"], resources: ["ResourceCount", "resources"],
    }, ["roles"]);
    resources = resourcesUnavailable ? [] : mappedRows(resourcesPayload.value, {
      name: ["Name", "name"], description: ["Description", "description"], publicPermission: ["PublicPermission", "publicPermission"],
    }, ["resources"]);
  }
  if (state.view === "access" && state.renderRevision === revision) state.accessCatalog = { users, roles, resources };
  const mutableUsers = users.filter((user) => !isProtectedUser(user.name));
  const editableRoles = roles.filter((role) => !isSystemRole(role.name));
  const userOptions = mutableUsers.map((user) => `<option value="${escapeHtml(user.name)}">${escapeHtml(user.name)}</option>`).join("");
  const roleOptions = roles.map((role) => `<option value="${escapeHtml(role.name)}">${escapeHtml(role.name)}</option>`).join("");
  const editableRoleOptions = editableRoles.map((role) => `<option value="${escapeHtml(role.name)}">${escapeHtml(role.name)}</option>`).join("");
  const resourceOptions = resources.map((resource) => `<option value="${escapeHtml(resource.name)}">${escapeHtml(resource.name)}</option>`).join("");
  const userWorkflowDisabled = usersUnavailable || rolesUnavailable || !mutableUsers.length || !roles.length ? " disabled" : "";
  const resourceWorkflowDisabled = rolesUnavailable || resourcesUnavailable || !editableRoles.length || !resources.length ? " disabled" : "";
  const userColumns = state.demo
    ? [["name","User"],["enabled","State"],["roles","Roles"],["lastLogin","Last login"],["source","Directory"]]
    : [["name","User"],["enabled","State"],["type","Authentication"],["namespace","Startup namespace"]];
  const roleColumns = state.demo
    ? [["name","Role"],["members","Members"],["resources","Resources"],["inherited","Inherited"]]
    : [["name","Role"],["description","Description"],["createdBy","Created by"],["escalationOnly","Escalation only"]];
  return `${partialSourceNote([usersUnavailable ? "Users" : "", rolesUnavailable ? "Roles" : "", resourcesUnavailable ? "Resources" : ""].filter(Boolean))}<div class="security-note"><span>\u25c7</span><div><strong>Preview \u2192 confirm \u2192 execute \u2192 readback</strong><p>Every access change starts by reading the current security object and repeats that preflight before execution. Stale or malformed state is blocked; only documented mutable fields are sent, and the complete result is verified before it is marked complete.</p></div></div>
    <div class="tabbed-cards">
      ${shellCard("Users", usersUnavailable ? unavailableSource("Users") : table(users, userColumns))}
      ${shellCard("Roles", rolesUnavailable ? unavailableSource("Roles") : table(roles, roleColumns))}
    </div>
    <div class="access-workflows">
      ${shellCard("User role assignment", `<div class="workflow-form"><label>User<select id="access-user"${userWorkflowDisabled}>${userOptions}</select></label><label>Role<select id="access-user-role"${userWorkflowDisabled}>${roleOptions}</select></label><div class="workflow-actions"><button class="primary" data-access-action="assign-role"${userWorkflowDisabled}>Assign role</button><button class="ghost" data-access-action="revoke-role"${userWorkflowDisabled}>Revoke role</button></div><p class="workflow-help">The complete user record is fetched first, then the Roles array is changed and verified. Built-in administrator identities are excluded from this guided workflow.</p></div>`)}
      ${shellCard("Role resource privilege", `<div class="workflow-form"><label>Custom role<select id="access-resource-role"${resourceWorkflowDisabled}>${editableRoleOptions}</select></label><label>Resource<select id="access-resource"${resourceWorkflowDisabled}>${resourceOptions}</select></label><label>Permissions<select id="access-permissions"${resourceWorkflowDisabled}><option value="R">R \u00b7 Read</option><option value="RW">RW \u00b7 Read/write</option><option value="RWU" selected>RWU \u00b7 Read/write/use</option><option value="U">U \u00b7 Use</option></select></label><div class="workflow-actions"><button class="primary" data-access-action="grant-resource"${resourceWorkflowDisabled}>Grant / update</button><button class="ghost" data-access-action="revoke-resource"${resourceWorkflowDisabled}>Revoke resource</button></div><p class="workflow-help">Resource changes preserve unrelated grants. System roles beginning with <code>%</code> are inventory-only here and remain available through the advanced Explorer.</p></div>`)}
    </div>`;
}

function renderRestDiscovery(discovery) {
  const restRows = discovery.entries.map((entry, index) => ({
    ...entry,
    name: redactSensitiveText(entry.name),
    namespace: redactSensitiveText(entry.namespace),
    dispatchClass: redactSensitiveText(entry.dispatchClass),
    webApplications: redactSensitiveText(entry.webApplications),
    index,
  }));
  const discoveryStatus = discovery.status.map((item) => `<span class="source-chip${/unavailable|denied|invalid/i.test(item) ? " bad" : ""}"><i></i>${escapeHtml(item)}</span>`).join("");
  return `<div class="source-health">${discoveryStatus}</div>
    ${shellCard("REST service catalog", `<div class="webapp-table">${table(restRows, [["name","Service"],["namespace","Namespace"],["dispatchClass","Dispatch class"],["webApplications","Web application"],["source","Source"]], { empty: discovery.pending ? "Loading REST documentation independently" : "No REST services available to this session", actions: (entry) => `<button class="mini" data-rest-spec-index="${entry.index}"${entry.specPath ? "" : ' disabled title="No safe OpenAPI path was returned"'}>Inspect OpenAPI</button>` })}</div>`, '<span class="caption">Documentation only; inspecting a specification never invokes its operations.</span>')}
    <div id="rest-spec-results" aria-live="polite"></div>`;
}

function bindRestSpecButtons(root = document) {
  $$('[data-rest-spec-index]', root).forEach((button) => button.addEventListener("click", () => {
    inspectRestSpec(Number(button.dataset.restSpecIndex));
  }));
}

async function renderWebapps() {
  const revision = state.renderRevision;
  const payload = await request("/v2/web-apps", "webapps");
  let rows = mappedRows(payload, { name: ["Name", "name"], namespace: ["NameSpace", "Namespace", "namespace"], isDefault: ["IsNameSpaceDefault", "isDefault"], enabled: ["Enabled", "enabled"], auth: ["AuthenticationMethods", "auth"], dispatch: ["DispatchClass", "dispatch"], resource: ["Resource", "resource"] }, ["applications", "webApps"]);
  if (!state.demo) {
    // IRIS 2026.2 can return stale Enabled=false values from the collection
    // endpoint. Reconcile each row with the authoritative single-app read.
    rows = await mapLimited(rows, async (webapp) => {
      try {
        const detail = await state.client.request(appendQuery("/v2/web-app", { name: webapp.name }));
        return reconcileWebAppSummary(webapp, detail);
      } catch {
        return reconcileWebAppSummary(webapp, null);
      }
    }, () => state.renderRevision === revision && state.view === "webapps");
  }
  const actions = (row) => {
    const eligibility = webAppGuidedEligibility(row.name, row.namespace, row.isDefault);
    const reason = row.enabled === "Unknown" ? "Application detail is unavailable" : eligibility.reason;
    const disabled = row.enabled !== true && row.enabled !== false || !eligibility.ok;
    const next = row.enabled === true ? "Disable" : "Enable";
    return `<button class="mini ${row.enabled === true ? "danger-text" : ""}" data-webapp-action="${escapeHtml(row.name)}"${disabled ? ` disabled title="${escapeHtml(reason)}"` : ""}>${next}</button>`;
  };
  let discovery;
  if (state.demo) {
    discovery = { entries: demo.restCatalog, status: ["Demo fixture: no IRIS request"] };
    if (state.view === "webapps" && state.renderRevision === revision) state.restOrigin = null;
  } else {
    const origin = managementOrigin(state.client.baseUrl, location.href);
    if (state.view === "webapps" && state.renderRevision === revision) state.restOrigin = origin;
    discovery = origin
      ? { entries: [], status: ["REST documentation: loading independently"], pending: true }
      : { entries: [], status: ["Unavailable: REST discovery requires the portal and IRIS API on the same origin"] };
    if (origin) {
      setTimeout(async () => {
        let result;
        try { result = await loadRestCatalog(fetch.bind(globalThis), origin); }
        catch { result = { entries: [], status: ["REST documentation: unavailable"] }; }
        if (state.demo || state.view !== "webapps" || state.renderRevision !== revision) return;
        const target = $("#rest-discovery");
        if (!target) return;
        state.restCatalog = result.entries;
        target.innerHTML = renderRestDiscovery(result);
        bindRestSpecButtons(target);
      }, 0);
    }
  }
  if (state.view === "webapps" && state.renderRevision === revision) state.restCatalog = discovery.entries;
  return `<div class="security-note"><span>⌘</span><div><strong>Guided availability and read-only REST discovery</strong><p>Only non-system applications can use the guided enable/disable flow. IRIS authorization still applies. REST discovery uses the official same-origin /api/mgmnt service and the existing browser session; no admin token is forwarded to it.</p></div></div>
    ${shellCard("Web application registry", `<div class="webapp-table">${table(rows, [["name","Application"],["namespace","Namespace"],["enabled","State"],["auth","Authentication"],["dispatch","Dispatch"],["resource","Resource"]], { actions })}</div>`, '<button class="ghost" data-open-explorer="/v2/web-app|GET">Advanced API</button>')}
    <div id="rest-discovery">${renderRestDiscovery(discovery)}</div>`;
}

async function renderSecrets() {
  let rows = demo.secrets;
  let unavailable = [];
  if (!state.demo) {
    const [wallets, certificates] = await Promise.allSettled([state.client.request("/v2/wallet/collections"), state.client.request("/v2/security/x509-credentials")]);
    unavailable = [wallets.status !== "fulfilled" ? "Wallet collections" : "", certificates.status !== "fulfilled" ? "X509 credentials" : ""].filter(Boolean);
    const walletRows = wallets.status === "fulfilled" ? mappedRows(wallets.value, { name: ["Name", "name"], type: ["type"], editResource: ["EditResource"], useResource: ["UseResource"] }, ["collections"])
      .map((row) => ({ ...row, type: row.type || "Wallet collection", state: "Protected", details: `${row.editResource || "\u2014"} / ${row.useResource || "\u2014"}` })) : [];
    const certificateRows = certificates.status === "fulfilled" ? mappedRows(certificates.value, { name: ["Alias", "name"], hasPrivateKey: ["HasPrivateKey"], owners: ["OwnerList"], peers: ["PeerNames"] }, ["credentials"])
      .map((row) => ({ ...row, type: "X509 credential", state: row.hasPrivateKey ? "Private key present" : "Certificate only", details: row.owners || "All users" })) : [];
    rows = [...walletRows, ...certificateRows];
  }
  const columns = state.demo ? [["name","Asset"],["type","Type"],["items","Items"],["state","State"],["rotated","Last rotation"]] : [["name","Asset"],["type","Type"],["state","State"],["details","Access / ownership"]];
  const actions = (row) => row.type === "Wallet collection" && walletEditable(row.name)
    ? `<button class="ghost" data-wallet-policy="${escapeHtml(row.name)}">Edit access policy</button>` : '<span class="pill">Inventory only</span>';
  return `${partialSourceNote(unavailable)}<div class="security-note"><span>\u25c8</span><div><strong>Wallet access policy · secret values stay out of this workflow</strong><p>Edit or use permissions can be changed for existing non-system collections, with preview, a fresh precondition and readback of both fields. X.509 and OAuth remain metadata-only. No secret values are requested by this workflow.</p></div></div>${shellCard("Protected assets", unavailable.length === 2 ? unavailableSource("Protected assets") : table(rows, columns, { actions }))}`;
}

async function renderOAuth() {
  let servers = demo.oauthServers;
  let resources = demo.oauthResources;
  let clients = demo.oauthClients;
  let unavailable = [];
  if (!state.demo) {
    const [serverPayload, resourcePayload, clientPayload] = await Promise.allSettled([
      state.client.request("/v2/security/oauth2/client/server-definitions"),
      state.client.request("/v2/security/oauth2/resource-servers"),
      state.client.request("/v2/security/oauth2/server/clients"),
    ]);
    unavailable = [serverPayload.status !== "fulfilled" ? "Client authorization servers" : "", resourcePayload.status !== "fulfilled" ? "Resource servers" : "", clientPayload.status !== "fulfilled" ? "Authorization-server clients" : ""].filter(Boolean);
    servers = serverPayload.status === "fulfilled" ? mappedRows(serverPayload.value, {
      id: ["ID", "id"], issuer: ["IssuerEndpoint", "issuer"], clients: ["ClientCount", "clients"], resources: ["ResourceCount", "resources"],
    }, ["serverDefinitions"]) : null;
    resources = resourcePayload.status === "fulfilled" ? mappedRows(resourcePayload.value, {
      name: ["Name", "name"], server: ["ServerDefinition", "server"],
    }, ["resourceServers"]) : null;
    clients = clientPayload.status === "fulfilled" ? mappedRows(clientPayload.value, {
      name: ["Name", "name"], clientId: ["ClientId", "clientId"], type: ["ClientType", "type"],
      description: ["Description", "description"], redirects: ["RedirectURL", "redirects"],
    }, ["clients"]) : null;
  }
  return `${partialSourceNote(unavailable)}<div class="security-note"><span>\u25ce</span><div><strong>OAuth metadata without credential exposure</strong><p>Client IDs, server relationships, and redirect metadata are visible. Known client-secret, token, and private-key password fields are redacted before display.</p></div></div>
    ${shellCard("Client authorization servers", servers === null ? unavailableSource("Client authorization servers") : table(servers, [["id","Definition"],["issuer","Issuer endpoint"],["clients","Clients"],["resources","Resources"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/client/server-definition|POST">Add server definition</button>')}
    <div class="tabbed-cards">
      ${shellCard("Resource servers", resources === null ? unavailableSource("Resource servers") : table(resources, [["name","Resource server"],["server","Server definition"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/resource-server|PUT">Configure resource</button>')}
      ${shellCard("Authorization-server clients", clients === null ? unavailableSource("Authorization-server clients") : table(clients, [["name","Client"],["clientId","Client ID"],["type","Type"],["description","Description"],["redirects","Redirect URLs"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/server/client|POST">Register client</button>')}
    </div>`;
}

function formatTimelineTime(value) {
  const text = String(value || "");
  if (!/(?:z|[+-]\d{2}:?\d{2})$/i.test(text)) return text || "\u2014";
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text || "\u2014";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function timelineTable(events) {
  if (!events.length) return '<div class="empty"><strong>No matching events</strong><span>Change the filters or refresh the source data.</span></div>';
  const rows = events.map((event) => `<tr>
    <td>${escapeHtml(formatTimelineTime(event.time))}${event.timeBasis ? `<small class="cell-detail">${escapeHtml(event.timeBasis)}</small>` : ""}</td>
    <td><span class="pill ${event.severity === "critical" ? "danger" : event.severity === "warning" ? "warn" : event.severity === "unknown" ? "" : "ok"}">${event.severity === "unknown" ? "unclassified" : escapeHtml(event.severity)}</span></td>
    <td><strong>${escapeHtml(event.source)}</strong><small class="cell-detail">${escapeHtml(event.subsystem)}</small></td>
    <td>${escapeHtml(event.entity)}</td>
    <td>${escapeHtml(event.actor)}</td>
    <td class="message-cell">${escapeHtml(event.message)}${event.detail ? `<small class="cell-detail">${escapeHtml(event.detail)}</small>` : ""}</td>
    <td><code class="correlation">${escapeHtml(event.correlation)}</code></td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="timeline-table"><thead><tr><th scope="col">Time</th><th scope="col">Severity</th><th scope="col">Source</th><th scope="col">Entity</th><th scope="col">Actor</th><th scope="col">Message</th><th scope="col">Correlation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function loadIncidentTimeline() {
  let auditEvents = [];
  let taskEvents = [];
  const sources = [];
  if (state.demo) {
    auditEvents = normalizeAuditRecords(demo.auditRecords);
    taskEvents = normalizeTaskHistory(demo.taskHistory);
    sources.push({ name: "Audit", status: "Demo fixture", ok: true }, { name: "Tasks", status: "Demo fixture", ok: true });
  } else {
    const [auditResult, taskResult] = await Promise.allSettled([
      state.client.requestAsync("/v2/security/audit/records?maxRows=100&ascending=0", { method: "POST" }),
      state.client.request("/v2/task/history?maxRows=100"),
    ]);
    if (auditResult.status === "fulfilled") {
      auditEvents = normalizeAuditRecords(auditResult.value);
      sources.push({ name: "Audit", status: `${auditEvents.length} events`, ok: true });
    } else sources.push({ name: "Audit", status: "Unavailable in this session", ok: false });
    if (taskResult.status === "fulfilled") {
      taskEvents = normalizeTaskHistory(taskResult.value);
      sources.push({ name: "Tasks", status: `${taskEvents.length} runs`, ok: true });
    } else sources.push({ name: "Tasks", status: "Unavailable in this session", ok: false });
  }
  const nativeEvents = await loadNativeLogEvents(sources);
  const journalEvents = normalizeJournalEntries(state.operationJournal);
  sources.push({ name: "Ops Studio", status: `${journalEvents.length} session operations`, ok: true });
  return { events: mergeTimeline(auditEvents, taskEvents, journalEvents, nativeEvents), sources };
}

function demoNativePage(source) {
  return {
    source, snapshot: "d".repeat(64), nextCursor: "", observedAt: "2026-09-24T12:00:00Z", partial: {},
    records: [{ offset: 0, message: {
      messages: "2026-09-24T11:58:00Z Demo fixture: warning — scheduled backup is taking longer than expected",
      monitor: "2026-09-24T11:59:00Z Demo fixture: System Monitor sample completed",
      alerts: "2026-09-24T12:00:00Z Demo fixture: alert — review available database space",
    }[source] }],
  };
}

async function fetchNativeLogPage(source, cursor = "") {
  const client = state.nativeLogs;
  const epoch = state.connectionEpoch;
  const revision = state.nativeLogRevision;
  if (!client || state.demo) return;
  const request = (state.nativeLogRequests[source] || 0) + 1;
  state.nativeLogRequests[source] = request;
  try {
    const page = await client.page(source, cursor);
    if (client !== state.nativeLogs || epoch !== state.connectionEpoch || revision !== state.nativeLogRevision || request !== state.nativeLogRequests[source]) return;
    state.nativeLogPages[source] = page;
    delete state.nativeLogErrors[source];
  } catch (error) {
    if (client !== state.nativeLogs || epoch !== state.connectionEpoch || revision !== state.nativeLogRevision || request !== state.nativeLogRequests[source]) return;
    delete state.nativeLogPages[source];
    state.nativeLogErrors[source] = nativeLogStatus(error);
  }
}

async function loadNativeLogEvents(sources) {
  const demoMode = state.demo;
  const epoch = state.connectionEpoch;
  if (!demoMode && state.nativeLogs) {
    await Promise.all(Object.keys(NATIVE_SOURCES).filter((source) => !state.nativeLogPages[source] && !state.nativeLogErrors[source])
      .map((source) => fetchNativeLogPage(source)));
  }
  if (epoch !== state.connectionEpoch) return [];
  const events = [];
  for (const [source, name] of Object.entries(NATIVE_SOURCES)) {
    const page = demoMode ? demoNativePage(source) : state.nativeLogPages[source];
    sources.push({ name, ok: Boolean(page), status: demoMode ? "Demo fixture"
      : page ? `${page.records.length} records · current page` : state.nativeLogErrors[source] || state.nativeLogConnectionStatus });
    if (page) events.push(...normalizeNativePage(page));
  }
  return events;
}

function nativeLogControls() {
  return `<div class="native-log-controls">${Object.entries(NATIVE_SOURCES).map(([source, name]) => {
    const page = state.demo ? demoNativePage(source) : state.nativeLogPages[source];
    const note = nativePageNotice(page);
    return `<section class="native-log-source"><strong>${name}</strong><span>${state.demo ? "Demo fixture"
      : page ? `${page.records.length} records loaded` : escapeHtml(state.nativeLogErrors[source] || state.nativeLogConnectionStatus)}</span>
      <div><button class="ghost" data-native-latest="${source}"${state.demo || !state.nativeLogs ? " disabled" : ""}>Latest</button>
      <button class="ghost" data-native-older="${source}"${state.demo || !page?.nextCursor ? " disabled" : ""}>Older records</button></div>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}</section>`;
  }).join("")}</div><p class="dialog-copy">Search filters the loaded pages only. Native timestamps without a timezone remain in server-local time and are not positioned as UTC. Standard IRIS severity codes are used when present; otherwise severity is inferred from text. Known credential patterns are redacted; free-text logs still require care before sharing.</p>`;
}

async function renderLogs() {
  const revision = state.renderRevision;
  const { events, sources } = await loadIncidentTimeline();
  if (revision === state.renderRevision && state.view === "logs") state.timelineEvents = events;
  const filters = state.timelineFilters;
  const filtered = filterTimeline(events, filters);
  const warnings = events.filter((event) => ["warning", "critical"].includes(event.severity)).length;
  const verified = verifiedJournalCount(state.operationJournal);
  const sourceBadges = sources.map((source) => `<span class="source-chip ${source.ok ? "" : "bad"}"><i></i><strong>${escapeHtml(source.name)}</strong>${escapeHtml(source.status)}</span>`).join("");
  const sourceOptions = ["all", "Audit", "Tasks", "Ops Studio", ...Object.values(NATIVE_SOURCES)].map((source) => `<option value="${source}"${filters.source === source ? " selected" : ""}>${source === "all" ? "All sources" : source}</option>`).join("");
  const severityOptions = ["all", "info", "warning", "critical", "unknown"].map((severity) => `<option value="${severity}"${filters.severity === severity ? " selected" : ""}>${severity === "all" ? "All severities" : severity === "unknown" ? "Unclassified" : severity}</option>`).join("");
  return `<div class="metrics-grid compact">
      ${metric("Timeline events", events.length, "normalized records", "teal")}
      ${metric("Signals to review", warnings, "warning or critical", warnings ? "amber" : "")}
      ${metric("Sources online", `${sources.filter((source) => source.ok).length}/${sources.length}`, "native logs, audit, tasks, session")}
      ${metric("Verified changes", verified, "live + demo this session")}
    </div>
    <div class="source-health">${sourceBadges}</div>
    ${shellCard("Native IRIS logs", nativeLogControls(), "", "Read-only IRIS extension")}
    ${shellCard("Incident Timeline", `<div class="timeline-controls"><label>Search<input id="timeline-query" type="search" value="${escapeHtml(filters.query)}" placeholder="Entity, actor, message, correlation\u2026" /></label><label>Source<select id="timeline-source">${sourceOptions}</select></label><label>Severity<select id="timeline-severity">${severityOptions}</select></label></div><div id="timeline-results">${timelineTable(filtered)}</div>`, '<button class="ghost" data-open-explorer="/v2/security/audit/records|POST">Advanced audit query</button>')}
    <div class="security-note"><span>\u2318</span><div><strong>Session Operation Journal</strong><p>Every state-changing request is recorded here with its execution result, readback status, instance, and actor. Known sensitive fields and credential-shaped values are redacted before entries are kept in memory.</p></div></div>`;
}

function demoReadback(path) {
  const url = new URL(path, "https://iris.invalid");
  const id = url.searchParams.get("id");
  const name = url.searchParams.get("name");
  if (url.pathname === "/v2/process") {
    const process = demo.processes.find((item) => String(item.pid) === String(id));
    if (!process) throw new IrisApiError("Demo process not found", { status: 404, path });
    return { result: { Pid: process.pid, State: process.state, Namespace: process.namespace, Username: process.user, Routine: process.routine } };
  }
  if (url.pathname === "/v2/task/info") {
    const task = demo.tasks.find((item) => String(item.id) === String(id));
    if (!task) throw new IrisApiError("Demo task not found", { status: 404, path });
    return { result: { Suspended: task.status === "Suspended", LastFinished: task.lastResult, Status: "1", Error: "Success" } };
  }
  if (url.pathname === "/v2/security/user") {
    const user = demo.userDetails[name];
    if (!user) throw new IrisApiError("Demo user not found", { status: 404, path });
    return { result: structuredClone(user) };
  }
  if (url.pathname === "/v2/security/role") {
    const role = demo.roleDetails[name];
    if (!role) throw new IrisApiError("Demo role not found", { status: 404, path });
    return { result: structuredClone(role) };
  }
  if (url.pathname === "/v2/web-app") {
    const app = demo.webappDetails[name];
    if (!app) throw new IrisApiError("Demo web application not found", { status: 404, path });
    return { result: structuredClone(app) };
  }
  if (url.pathname === "/v2/wallet/collection") {
    const policy = demo.walletPolicies[name];
    if (!policy) throw new IrisApiError("Demo wallet collection not found", { status: 404, path });
    return { result: structuredClone(policy) };
  }
  throw new IrisApiError("No demo readback is defined", { status: 404, path });
}

async function readback(path, { unredacted = false } = {}) {
  // Guided web-app PUTs must compare and preserve the real configuration.
  // Redacted values are only suitable for display, never for a write body.
  return state.demo ? demoReadback(path) : state.client.request(path, { redactResponse: !unredacted });
}

function applyDemoOperation(operation) {
  if (operation.demoApply) {
    operation.demoApply();
    return;
  }
  const url = new URL(operation.path, "https://iris.invalid");
  const id = url.searchParams.get("id");
  if (url.pathname === "/v2/process/suspend") {
    const process = demo.processes.find((item) => String(item.pid) === String(id));
    if (process) process.state = "SUSP";
  } else if (url.pathname === "/v2/process/resume") {
    const process = demo.processes.find((item) => String(item.pid) === String(id));
    if (process) process.state = "RUN";
  } else if (url.pathname === "/v2/process/terminate") {
    const index = demo.processes.findIndex((item) => String(item.pid) === String(id));
    if (index >= 0) demo.processes.splice(index, 1);
  } else if (url.pathname === "/v2/task/suspend" || url.pathname === "/v2/task/resume") {
    const task = demo.tasks.find((item) => String(item.id) === String(id));
    if (task) task.status = url.pathname.endsWith("/suspend") ? "Suspended" : "Ready";
  } else if (url.pathname === "/v2/task/run") {
    const task = demo.tasks.find((item) => String(item.id) === String(id));
    if (task) task.lastResult = new Date().toISOString();
  }
}

async function prepareAccessOperation(action) {
  const origin = operationOrigin();
  if (action === "assign-role" || action === "revoke-role") {
    const userName = $("#access-user").value;
    const roleName = $("#access-user-role").value;
    if (isProtectedUser(userName)) throw new TypeError("Built-in user is inventory-only in the guided workflow");
    const path = appendQuery("/v2/security/user", { name: userName });
    const beforePayload = await readback(path);
    assertOperationContext({ ...origin, path });
    assertPreparationCurrent(origin);
    const change = buildUserRoleMutation(beforePayload, roleName, action === "assign-role" ? "assign" : "revoke");
    if (!change.changed) {
      toast(action === "assign-role" ? "Role is already assigned" : "Role is not assigned", "error");
      return;
    }
    await prepareOperation({
      ...origin,
      method: "PUT",
      path,
      body: change.body,
      label: `${action === "assign-role" ? "Assign" : "Revoke"} ${roleName}`,
      target: `User ${userName}`,
      risk: action === "revoke-role" || isSystemRole(roleName) ? "destructive" : "mutation",
      confirmation: `${action === "assign-role" ? "ASSIGN" : "REVOKE"} ${roleName} ${userName}`.toUpperCase(),
      verification: { ...change.verification, readPath: path },
      precondition: { ...change.precondition, readPath: path },
      beforePayload,
      beforeSummary: change.beforeSummary,
      expectedSummary: change.expectedSummary,
      demoApply: () => {
        demo.userDetails[userName] = structuredClone(change.body);
        const row = demo.users.find((item) => item.name === userName);
        if (row) row.roles = [...change.body.Roles];
      },
    });
    return;
  }

  const roleName = $("#access-resource-role").value;
  const resourceName = $("#access-resource").value;
  const permissions = $("#access-permissions").value;
  const path = appendQuery("/v2/security/role", { name: roleName });
  const beforePayload = await readback(path);
  assertOperationContext({ ...origin, path });
  assertPreparationCurrent(origin);
  const change = buildRoleResourceMutation(beforePayload, resourceName, permissions, action === "grant-resource" ? "grant" : "revoke");
  if (!change.changed) {
    toast(action === "grant-resource" ? "This exact privilege is already granted" : "Resource is not granted", "error");
    return;
  }
  await prepareOperation({
    ...origin,
    method: "PUT",
    path,
    body: change.body,
    label: `${action === "grant-resource" ? "Grant" : "Revoke"} ${resourceName}`,
    target: `Role ${roleName}`,
    risk: action === "revoke-resource" || resourceName.startsWith("%") ? "destructive" : "mutation",
    confirmation: `${action === "grant-resource" ? "GRANT" : "REVOKE"} ${resourceName} ${roleName}`.toUpperCase(),
    verification: { ...change.verification, readPath: path },
    precondition: { ...change.precondition, readPath: path },
    beforePayload,
    beforeSummary: change.beforeSummary,
    expectedSummary: change.expectedSummary,
    demoApply: () => {
      demo.roleDetails[roleName] = structuredClone(change.body);
      const row = demo.roles.find((item) => item.name === roleName);
      if (row) row.resources = change.body.Resources.length;
    },
  });
}

async function openWalletPolicy(name) {
  const origin = operationOrigin();
  const path = appendQuery("/v2/wallet/collection", { name });
  const beforePayload = await readback(path);
  assertOperationContext({ ...origin, path });
  assertPreparationCurrent(origin);
  if (state.view !== "secrets") return;
  const policy = walletSnapshot(beforePayload, name);
  state.walletDraft = { ...origin, path, name, beforePayload };
  $("#wallet-target").textContent = `${name} · ${origin.context.mode} · ${origin.context.instance}`;
  $("#wallet-edit-resource").value = policy.EditResource;
  $("#wallet-use-resource").value = policy.UseResource;
  $("#wallet-dialog").showModal();
}

async function prepareWalletPolicy() {
  const draft = state.walletDraft;
  if (!draft) throw new TypeError("Open a collection policy first");
  assertOperationContext(draft);
  assertPreparationCurrent(draft);
  const change = buildWalletPolicyMutation(draft.beforePayload, draft.name, $("#wallet-edit-resource").value, $("#wallet-use-resource").value);
  if (!change.changed) throw new TypeError("Policy is unchanged");
  $("#wallet-dialog").close();
  await prepareOperation({
    ...draft, method: "PUT", body: change.body, label: `Update wallet policy ${draft.name}`,
    target: `Wallet collection ${draft.name}`, risk: "destructive",
    confirmation: `UPDATE WALLET POLICY ${draft.name}`.toUpperCase(),
    beforeSummary: change.beforeSummary,
    expectedSummary: `${change.expectedSummary}. Accounts without these privileges may lose access; effective user access is not enumerated. %Admin_Wallet:U remains privileged.`,
    precondition: { ...change.precondition, readPath: draft.path },
    verification: { ...change.verification, readPath: draft.path },
    demoApply: () => { demo.walletPolicies[draft.name] = structuredClone(change.body); },
  });
}

async function prepareWebAppOperation(name) {
  const origin = operationOrigin();
  const path = appendQuery("/v2/web-app", { name });
  const beforePayload = await readback(path, { unredacted: true });
  assertOperationContext({ ...origin, path });
  assertPreparationCurrent(origin);
  const current = unwrapIrisResult(beforePayload);
  const change = buildWebAppAvailabilityMutation(beforePayload, name, !current.Enabled);
  if (!change.changed) throw new TypeError("Application state has already changed; refresh the view");
  await prepareOperation({
    ...origin,
    method: "PUT", path, body: change.body,
    label: `${change.body.Enabled ? "Enable" : "Disable"} ${name}`,
    target: `Web application ${name}`,
    risk: change.body.Enabled ? "mutation" : "destructive",
    confirmation: `${change.body.Enabled ? "ENABLE" : "DISABLE"} WEB APP ${name}`.toUpperCase(),
    verification: { ...change.verification, readPath: path },
    precondition: { ...change.precondition, readPath: path },
    beforePayload,
    beforeSummary: change.beforeSummary,
    expectedSummary: change.expectedSummary,
    demoApply: () => {
      demo.webappDetails[name] = { ...demo.webappDetails[name], ...change.body };
      const row = demo.webapps.find((item) => item.name === name);
      if (row) row.enabled = change.body.Enabled;
      const rest = demo.restCatalog.find((item) => item.name === name);
      if (rest) rest.enabled = change.body.Enabled;
    },
  });
}

async function inspectRestSpec(index) {
  const entry = state.restCatalog[index];
  const output = $("#rest-spec-results");
  if (!entry || !output || !entry.specPath) return;
  output.innerHTML = '<div class="loading"><span></span><p>Reading OpenAPI documentation…</p></div>';
  try {
    const payload = state.demo ? demo.restSpec : await loadRestSpec(fetch.bind(globalThis), state.restOrigin, entry.specPath);
    const spec = summarizeOpenApi(payload);
    output.innerHTML = shellCard(`${redactSensitiveText(spec.title)}${spec.version ? ` · ${redactSensitiveText(spec.version)}` : ""}`,
      `<p class="rest-caption">${escapeHtml(redactSensitiveText(entry.name))} · ${spec.total} documented operations${spec.total > spec.operations.length ? `; showing the first ${spec.operations.length}` : ""}. This is read-only documentation.</p>${table(spec.operations.map((item) => ({ method: item.method, path: redactSensitiveText(item.path), summary: redactSensitiveText(item.summary) })), [["method","Method"],["path","Path"],["summary","Summary"]], { empty: "This specification contains no operations" })}`);
  } catch (error) {
    output.innerHTML = `<div class="error-state"><span>!</span><h2>OpenAPI unavailable</h2><p>${escapeHtml(redactSensitiveText(error.message))}</p></div>`;
  }
}

function bindTimelineFilters() {
  const apply = () => {
    state.timelineFilters = {
      query: $("#timeline-query").value,
      source: $("#timeline-source").value,
      severity: $("#timeline-severity").value,
    };
    $("#timeline-results").innerHTML = timelineTable(filterTimeline(state.timelineEvents, state.timelineFilters));
  };
  $("#timeline-query")?.addEventListener("input", apply);
  $("#timeline-source")?.addEventListener("change", apply);
  $("#timeline-severity")?.addEventListener("change", apply);
}

function renderExplorer() {
  const options = `<option value="">Custom endpoint</option>${endpointCatalog.map((entry) => `<option value="${escapeHtml(entry.method)}|${escapeHtml(entry.path)}">${escapeHtml(entry.method.padEnd(6))} ${escapeHtml(entry.path)} \u2014 ${escapeHtml(entry.label)}</option>`).join("")}`;
  return `<div class="explorer-grid">
    ${shellCard("Request builder", `<label>Known endpoint<select id="endpoint-select">${options}</select></label><div class="method-path"><select id="request-method" aria-label="HTTP method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>HEAD</option></select><input id="request-path" aria-label="API request path" value="/info" spellcheck="false" /></div><label>JSON body<textarea id="request-body" rows="10" spellcheck="false" placeholder='{ "name": "value" }' disabled></textarea></label><div class="request-footer"><span id="safety-badge" class="pill ok">Read only</span><button class="primary" id="execute-request">Send request</button></div>`)}
    ${shellCard("Response", `<div class="response-toolbar"><span id="response-status">Waiting for request</span><button class="text-button" id="copy-response">Copy JSON</button></div><pre id="response-output">{
  "tip": "Choose an endpoint and send a request. Sensitive fields are redacted before display."
}</pre>`)}
  </div>`;
}

async function render() {
  const revision = ++state.renderRevision;
  const view = state.view;
  const successfulBefore = state.client.successfulRequests;
  state.busy = true;
  $("#refresh-button").disabled = true;
  const content = $("#content");
  content.innerHTML = '<div class="loading"><span></span><p>Loading IRIS operational data\u2026</p></div>';
  $("#page-title").textContent = titles[view];
  $$(".nav-item").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  try {
    const renderer = { overview: renderOverview, processes: renderProcesses, infrastructure: renderInfrastructure, tasks: renderTasks, access: renderAccess, webapps: renderWebapps, secrets: renderSecrets, oauth: renderOAuth, logs: renderLogs, explorer: renderExplorer }[view];
    const markup = await renderer();
    if (revision !== state.renderRevision) return;
    content.innerHTML = markup;
    bindDynamicControls();
    if (state.demo || state.client.successfulRequests > successfulBefore) setHealth(true);
    else if (view !== "explorer") setHealth(false);
  } catch (error) {
    if (revision !== state.renderRevision) return;
    content.innerHTML = `<div class="error-state"><span>!</span><h2>Unable to load this view</h2><p>${escapeHtml(error.message)}</p><button class="primary" id="retry-button">Try again</button></div>`;
    $("#retry-button")?.addEventListener("click", render);
    setHealth(false);
  } finally {
    if (revision === state.renderRevision) {
      state.busy = false;
      $("#refresh-button").disabled = false;
    }
  }
}

function bindDynamicControls() {
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  $$('[data-open-explorer]').forEach((button) => button.addEventListener("click", () => {
    const [path, method] = button.dataset.openExplorer.split("|");
    navigate("explorer").then(() => { $("#request-path").value = path; $("#request-method").value = method; updateSafetyBadge(); });
  }));
  $$('[data-operation]').forEach((button) => button.addEventListener("click", () => {
    const [method, path, target] = button.dataset.operation.split("|");
    const requestPath = appendQuery(path, { id: Number(target) });
    const body = path === "/v2/task/run" ? { RunNow: true } : path === "/v2/task/suspend" ? { LeaveInQueue: true } : undefined;
    const entity = path.startsWith("/v2/process") ? "PROCESS" : "TASK";
    prepareOperation({ method, path: requestPath, body, label: button.textContent.trim(), target: `${entity[0]}${entity.slice(1).toLowerCase()} ${target}`, confirmation: `${button.textContent.trim()} ${entity} ${target}`.toUpperCase() }).catch((error) => toast(error.message, "error"));
  }));
  $$('[data-access-action]').forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try { await prepareAccessOperation(button.dataset.accessAction); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  $$('[data-webapp-action]').forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try { await prepareWebAppOperation(button.dataset.webappAction); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  bindRestSpecButtons();
  $$('[data-wallet-policy]').forEach((button) => button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try { await openWalletPolicy(button.dataset.walletPolicy); }
    catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  }));
  if (state.view === "logs") {
    bindTimelineFilters();
    $$('[data-native-latest], [data-native-older]').forEach((button) => button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "Loading\u2026";
      const source = button.dataset.nativeLatest || button.dataset.nativeOlder;
      const cursor = button.dataset.nativeOlder ? state.nativeLogPages[source]?.nextCursor : "";
      await fetchNativeLogPage(source, cursor);
      if (state.view === "logs") await render();
    }));
  }
  if (state.view === "explorer") bindExplorer();
}

function bindExplorer() {
  const selector = $("#endpoint-select");
  selector.addEventListener("change", () => {
    if (!selector.value) return;
    const [method, path] = selector.value.split("|");
    $("#request-method").value = method;
    $("#request-path").value = path;
    updateSafetyBadge();
  });
  $("#request-method").addEventListener("change", updateSafetyBadge);
  $("#request-path").addEventListener("input", updateSafetyBadge);
  $("#execute-request").addEventListener("click", () => executeExplorerRequest().catch(() => {}));
  $("#copy-response").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#response-output").textContent);
      toast("Response copied");
    } catch {
      toast("Clipboard access is unavailable", "error");
    }
  });
  updateSafetyBadge();
}

function updateSafetyBadge() {
  const badge = $("#safety-badge");
  if (!badge) return;
  const method = $("#request-method").value;
  const path = $("#request-path").value;
  $("#endpoint-select").value = catalogSelectionValue(method, path);
  $("#request-body").disabled = !methodAcceptsBody(method);
  try { prepareExplorerRequest({ method, path, baseUrl: state.client.baseUrl, demo: state.demo }); }
  catch (error) {
    badge.className = "pill danger";
    badge.textContent = /not simulated/.test(error.message) ? "Unavailable in demo" : "Invalid destination";
    return;
  }
  const safety = classifySafety(method, path);
  badge.className = `pill ${safety === "read" ? "ok" : safety === "mutation" ? "warn" : "danger"}`;
  badge.textContent = safety === "read" ? "Read only" : safety === "mutation" ? "State change" : "Destructive";
}

async function executeExplorerRequest() {
  const explorerRevision = ++state.explorerRequestRevision;
  let request;
  try {
    request = prepareExplorerRequest({
      method: $("#request-method").value,
      path: $("#request-path").value,
      rawBody: $("#request-body").value,
      baseUrl: state.client.baseUrl,
      demo: state.demo,
    });
  } catch (error) {
    const message = redactSensitiveText(error.message || "Invalid request");
    $("#response-status").textContent = "Invalid request";
    $("#response-output").textContent = JSON.stringify({ error: message }, null, 2);
    toast(message, "error");
    return;
  }
  const { method, path, body } = request;
  if (classifySafety(method, path) !== "read") {
    await prepareOperation({ method, path, body, fromExplorer: true, explorerRevision, label: `${method} ${path}`, target: "API explorer target" });
    return;
  }
  await runOperation({ method, path, body, fromExplorer: true, explorerRevision });
}

async function prepareOperation(input) {
  const operation = { ...input };
  operation.preparationId ||= ++state.operationPreparationRevision;
  operation.context = input.context || { ...state.connectionContext };
  operation.boundConnection = input.boundConnection || currentOperationContext();
  assertOperationContext(operation);
  assertPreparationCurrent(operation);
  const inferred = operation.verification || inferVerification(operation.method, operation.path);
  if (inferred) {
    const beforePayload = operation.beforePayload ?? await readback(inferred.readPath);
    assertOperationContext(operation);
    operation.verification = captureVerificationBaseline(inferred, beforePayload);
    if (!operation.precondition) operation.precondition = captureProcessPrecondition(inferred, beforePayload);
    operation.beforeSummary = operation.beforeSummary || summarizeReadback(operation.verification, beforePayload);
    operation.expectedSummary = operation.expectedSummary || operation.verification.description;
  }
  operation.label = redactOperationPath(operation.label || `${operation.method} ${operation.path}`);
  operation.target = operation.target || "IRIS resource";
  assertOperationContext(operation);
  assertPreparationCurrent(operation);
  state.pendingOperation = operation;
  const phrase = operation.confirmation || confirmationPhrase(operation.method, operation.path);
  const risk = operation.risk || classifySafety(operation.method, operation.path);
  const requestBody = JSON.stringify(redactSensitive(operation.body ?? {}), null, 2);
  $("#confirm-title").textContent = operation.label;
  $("#confirm-description").innerHTML = `<strong>${risk === "destructive" ? "Destructive operation" : "State-changing operation"}</strong>
    <div class="operation-flow"><span class="active">1 · Preview</span><span>2 · Confirm</span><span>3 · Execute</span><span>4 · Verify</span></div>
    <div class="preview-grid"><div><small>Target</small><b>${escapeHtml(operation.target)}</b></div><div><small>Risk</small><b>${escapeHtml(risk)}</b></div><div><small>Current state</small><b>${escapeHtml(operation.beforeSummary || "Automatic preflight unavailable")}</b></div><div><small>Expected readback</small><b>${escapeHtml(operation.expectedSummary || "Manual verification required")}</b></div></div>
    <p>${state.demo ? "This operation runs only against local demo data after the exact phrase is entered; no request is sent to IRIS." : "The request will be sent only after the exact phrase is entered."} ${operation.verification ? `A second ${state.demo ? "demo-fixture read" : "GET"} at <code>${escapeHtml(operation.verification.readPath)}</code> will verify the result.` : "This custom operation has no automatic readback and will remain marked unverified."}</p>
    <details><summary>Sanitized request body</summary><pre>${escapeHtml(requestBody)}</pre></details>`;
  $("#confirmation-phrase").textContent = phrase;
  $("#confirmation-input").value = "";
  $("#confirm-submit").disabled = true;
  $("#confirm-dialog").showModal();
}

function currentOperationContext() {
  return { revision: state.client.connectionRevision, demo: state.demo, epoch: state.connectionEpoch };
}

function operationOrigin() {
  return { context: { ...state.connectionContext }, boundConnection: currentOperationContext(), preparationId: ++state.operationPreparationRevision };
}

function assertPreparationCurrent(operation) {
  if (operation.preparationId === state.operationPreparationRevision) return;
  const error = new IrisApiError("A newer operation has replaced this preview; review it before continuing", { path: operation.path });
  error.operationBlocked = true;
  error.guardStatus = "stale";
  throw error;
}

function assertOperationContext(operation) {
  if (sameOperationContext(operation.boundConnection, currentOperationContext())) return;
  const error = new IrisApiError("IRIS connection changed after preview; reopen and review this operation", { path: operation.path });
  error.operationBlocked = true;
  error.guardStatus = "connection-changed";
  throw error;
}

function recordJournal(operation, { resultStatus, verificationStatus, verificationSummary, durationMs }) {
  state.operationJournal.unshift(createJournalEntry({
    method: operation.method,
    path: operation.path,
    label: operation.label,
    target: operation.target,
    resultStatus,
    verificationStatus,
    verificationSummary,
    durationMs,
    ...operation.context,
  }));
  state.operationJournal = state.operationJournal.slice(0, 100);
  updateJournalUi();
}

async function verifyOperation(operation) {
  if (!operation.verification) return { status: "unverified", summary: "No automatic readback is defined" };
  let last = { status: "error", summary: "Readback did not run" };
  const { attempts, intervalMs } = verificationPollPolicy(operation.verification.kind, operation.boundConnection.demo);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!sameOperationContext(operation.boundConnection, currentOperationContext())) {
      return { status: "error", summary: "Connection changed after execution; readback was canceled" };
    }
    try {
      const payload = await readback(operation.verification.readPath, {
        unredacted: operation.verification.kind === "webAppSnapshot",
      });
      if (!sameOperationContext(operation.boundConnection, currentOperationContext())) {
        return { status: "error", summary: "Connection changed during readback; result cannot be verified" };
      }
      last = evaluateVerification(operation.verification, payload);
    } catch (error) {
      last = evaluateVerification(operation.verification, null, { status: error.status || 0 });
      if (operation.verification.kind !== "notFound" || error.status !== 404) {
        last = { status: "error", summary: error.message || "Readback failed" };
      }
    }
    if (["verified", "error"].includes(last.status)) break;
  }
  if (!operation.boundConnection.demo && operation.verification.kind === "taskRun" && ["mismatch", "pending"].includes(last.status)) {
    return { status: "pending", summary: "Request succeeded; task completion was not observed within the readback window" };
  }
  if (operation.boundConnection.demo && last.status === "verified") return { ...last, status: "demo-verified", summary: `Demo fixture: ${last.summary}` };
  return last;
}

async function runOperation(operation) {
  const { method, path, body, fromExplorer = false } = operation;
  operation.boundConnection ||= currentOperationContext();
  const executionDemo = operation.boundConnection.demo;
  const started = performance.now();
  let requestStarted = false;
  try {
    assertOperationContext(operation);
    if (operation.precondition) {
      let latest;
      try {
        latest = await readback(operation.precondition.readPath, {
          unredacted: operation.precondition.kind === "webAppSnapshot",
        });
      } catch (cause) {
        assertOperationContext(operation);
        const error = new IrisApiError("Precondition could not be read; no change was sent", { path, status: cause.status || 0 });
        error.operationBlocked = true;
        error.guardStatus = "invalid";
        throw error;
      }
      assertOperationContext(operation);
      const guard = evaluatePrecondition(operation.precondition, latest);
      if (!guard.ok) {
        const elapsed = Math.round(performance.now() - started);
        recordJournal(operation, {
          resultStatus: "blocked",
          verificationStatus: guard.status,
          verificationSummary: guard.summary,
          durationMs: elapsed,
        });
        const error = new IrisApiError(guard.summary, { path });
        error.journalRecorded = true;
        throw error;
      }
    }
    if (operation.verification?.kind === "taskRun") {
      const latestBaseline = await readback(operation.verification.readPath);
      assertOperationContext(operation);
      operation.verification = captureVerificationBaseline(operation.verification, latestBaseline);
      operation.beforeSummary = summarizeReadback(operation.verification, latestBaseline);
    }
    assertOperationContext(operation);
    requestStarted = !executionDemo;
    const result = executionDemo
      ? { demo: true, simulated: true, sentToIris: false, method, path, body: redactSensitive(body ?? null) }
      : classifySafety(method, path) === "read" && method.toUpperCase() === "POST"
        ? await state.client.requestAsync(path, { method, body })
        : await state.client.request(path, { method, body });
    if (classifySafety(method, path) === "read") assertOperationContext(operation);
    if (executionDemo && classifySafety(method, path) !== "read") applyDemoOperation(operation);
    const verification = classifySafety(method, path) === "read"
      ? { status: "not-required", summary: "Read-only request" }
      : await verifyOperation(operation);
    const elapsed = Math.round(performance.now() - started);
    if (classifySafety(method, path) !== "read") {
      recordJournal(operation, {
        resultStatus: executionDemo ? "simulated" : "executed",
        verificationStatus: verification.status,
        verificationSummary: verification.summary,
        durationMs: elapsed,
      });
    }
    if (fromExplorer && state.view === "explorer" && operation.explorerRevision === state.explorerRequestRevision && $("#response-output")) {
      $("#response-status").textContent = `${explorerOutcomeLabel({ demo: executionDemo, safety: classifySafety(method, path), verificationStatus: verification.status })} · ${verification.status} · ${elapsed} ms`;
      $("#response-output").textContent = JSON.stringify(redactSensitive({ response: result, verification }), null, 2);
    }
    if (!fromExplorer || operation.explorerRevision === state.explorerRequestRevision && state.view === "explorer") {
      if (verification.status === "verified") toast("Operation executed and readback verified");
      else if (verification.status === "demo-verified") toast("Demo operation simulated with verified readback");
      else if (verification.status === "unverified") toast(executionDemo ? "Demo operation simulated; no automatic readback" : "Operation executed; manual readback required", "error");
      else if (verification.status === "pending") toast("Operation executed; verification is still pending", "error");
      else if (verification.status === "not-required") toast(executionDemo ? "Demo request simulated; no IRIS request was sent" : "Request completed");
      else toast(`Operation executed; ${verification.summary}`, "error");
    }
    return result;
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    if (classifySafety(method, path) !== "read" && !error.journalRecorded) {
      recordJournal(operation, {
        resultStatus: error.operationBlocked ? "blocked" : requestStarted && !error.status ? "uncertain" : "failed",
        verificationStatus: error.operationBlocked ? error.guardStatus : "not-run",
        verificationSummary: redactSensitiveText(error.message),
        durationMs: elapsed,
      });
    }
    if (fromExplorer && state.view === "explorer" && operation.explorerRevision === state.explorerRequestRevision && $("#response-output")) {
      $("#response-status").textContent = `Error${error.status ? ` \u00b7 HTTP ${error.status}` : ""}`;
      $("#response-output").textContent = JSON.stringify(redactSensitive({ message: error.message, payload: error.payload }), null, 2);
    }
    if (!fromExplorer || operation.explorerRevision === state.explorerRequestRevision && state.view === "explorer") toast(error.message, "error");
    throw error;
  }
}

async function navigate(view) {
  if (!titles[view]) return;
  if (view !== state.view) state.explorerRequestRevision++;
  state.view = view;
  history.replaceState(null, "", `#${view}`);
  await render();
}

function setHealth(healthy) {
  $("#health-dot").className = `status-dot ${healthy ? "" : "bad"}`;
  $("#health-label").textContent = healthy ? (state.demo ? "Demo healthy" : "IRIS connected") : "Connection issue";
}

function setModeUi() {
  $("#mode-dot").className = `status-dot ${state.demo ? "demo" : ""}`;
  $("#mode-label").textContent = state.demo ? "Safe demo" : "Live IRIS";
}

function updateJournalUi() {
  const count = $("#journal-count");
  if (count) count.textContent = String(state.operationJournal.length);
}

let toastTimer;
function toast(message, tone = "ok", durationMs = 3200) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.className = "toast"; }, durationMs);
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (titles[view] && view !== state.view) navigate(view);
});
$("#refresh-button").addEventListener("click", () => {
  if (state.view === "logs") {
    state.nativeLogRevision++;
    state.nativeLogPages = {};
    state.nativeLogErrors = {};
  }
  return render();
});
$("#journal-button").addEventListener("click", () => navigate("logs"));
$("#connection-button").setAttribute("data-open-connection", "");
$$('[data-open-connection]').forEach((button) => button.addEventListener("click", () => $("#connection-dialog").showModal()));
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
  const dialog = document.getElementById(button.dataset.closeDialog);
  if (button.dataset.closeDialog === "confirm-dialog") state.pendingOperation = null;
  dialog?.close();
}));
let nextLoginAttempt = 0;
$("#wallet-dialog").addEventListener("close", () => { if (!$("#wallet-dialog").open) state.walletDraft = null; });
$("#wallet-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await prepareWalletPolicy(); }
  catch (error) { toast(error.message, "error"); }
});
let pendingLoginAttempt = null;
$("#connection-dialog").addEventListener("close", () => {
  if ($("#connection-dialog").open) return;
  pendingLoginAttempt = null;
  $("#password").value = "";
  $("#connect-submit").disabled = false;
  $("#connect-submit").textContent = "Apply";
});
$("#confirm-dialog").addEventListener("cancel", () => { state.pendingOperation = null; });
$("#confirm-dialog").addEventListener("close", () => {
  if ($("#confirm-dialog").open) return;
  $("#confirmation-input").value = "";
  $("#confirm-submit").disabled = true;
});
$("#connection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#connect-submit");
  if (submit.disabled) return;
  const attempt = ++nextLoginAttempt;
  pendingLoginAttempt = attempt;
  submit.disabled = true;
  submit.textContent = "Connecting\u2026";
  const useDemo = $("#demo-mode").checked;
  const baseUrl = $("#base-url").value;
  const username = $("#username").value;
  const password = $("#password").value;
  const role = $("#role").value;
  let nativeCandidate = null;
  let nativeStatus = "Enable native logs in Connection settings";
  try {
    const candidate = new IrisAdminClient({ baseUrl, fetchImpl: state.client.fetchImpl, timeoutMs: state.client.timeoutMs });
    if (!useDemo) {
      if (!username || !password) throw new Error("Username and password are required for a live connection");
      await candidate.login(username, password, role);
      if (pendingLoginAttempt !== attempt || !$("#connection-dialog").open) return;
      if ($("#native-logs-mode").checked) {
        try {
          nativeCandidate = new NativeLogClient({ adminBase: baseUrl, pageUrl: location.href,
            fetchImpl: state.client.fetchImpl, timeoutMs: state.client.timeoutMs });
          await nativeCandidate.login(username, password, role);
          nativeStatus = "Connected";
        } catch (error) {
          nativeCandidate?.close();
          nativeCandidate = null;
          nativeStatus = error instanceof TypeError ? error.message : nativeLogStatus(error);
        }
      }
    }
    if (pendingLoginAttempt !== attempt || !$("#connection-dialog").open) return;
    state.client = candidate;
    state.walletDraft = null;
    $("#wallet-dialog").close();
    state.nativeLogs?.close();
    state.nativeLogs = nativeCandidate;
    nativeCandidate = null;
    state.nativeLogConnectionStatus = nativeStatus;
    state.nativeLogRevision++;
    state.nativeLogPages = {};
    state.nativeLogErrors = {};
    state.connectionEpoch++;
    state.demo = useDemo;
    state.connectionContext = useDemo
      ? { mode: "demo", instance: "demo", actor: "Demo operator" }
      : { mode: "live", instance: state.client.baseUrl, actor: username };
    pendingLoginAttempt = null;
    $("#connection-dialog").close();
    setModeUi();
    setHealth(true);
    toast(useDemo ? "Safe demo enabled" : "Connected to IRIS");
    await render();
  } catch (error) {
    if (pendingLoginAttempt === attempt) toast(error.message, "error");
  }
  finally {
    nativeCandidate?.close();
    if (pendingLoginAttempt === attempt) {
      pendingLoginAttempt = null;
      $("#password").value = "";
      submit.disabled = false;
      submit.textContent = "Apply";
    }
  }
});
$("#confirmation-input").addEventListener("input", () => {
  $("#confirm-submit").disabled = $("#confirmation-input").value !== $("#confirmation-phrase").textContent;
});
$("#confirm-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const operation = state.pendingOperation;
  if (!operation || $("#confirmation-input").value !== (operation.confirmation || confirmationPhrase(operation.method, operation.path))) return;
  state.pendingOperation = null;
  $("#confirm-dialog").close();
  if (operation) {
    toast("Operation in progress; result not yet verified", "info", operation.verification?.kind === "taskRun" ? 90000 : 15000);
    try {
      await runOperation(operation);
      if (!operation.fromExplorer) await render();
    } catch {}
  }
  if (state.pendingOperation === operation) state.pendingOperation = null;
});

const initial = location.hash.slice(1);
if (titles[initial]) state.view = initial;
setModeUi();
updateJournalUi();
render();
