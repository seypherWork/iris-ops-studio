import {
  IrisAdminClient,
  appendQuery,
  classifySafety,
  confirmationPhrase,
  endpointCatalog,
  redactSensitive,
  unwrapIrisResult,
} from "./api.js?v=0.1.1";

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
    { pid: 2184, namespace: "%SYS", routine: "%SYS.MONLBL", user: "SYSTEM", state: "RUN", cpu: "00:18:42", elapsed: "03:04:33" },
    { pid: 2218, namespace: "IRISAPP", routine: "Ens.Job", user: "service", state: "RUN", cpu: "00:07:16", elapsed: "01:48:10" },
    { pid: 2237, namespace: "%SYS", routine: "%DMN", user: "SYSTEM", state: "SLEEP", cpu: "00:01:03", elapsed: "18:07:42" },
    { pid: 2311, namespace: "IRISAPP", routine: "Portal.Session", user: "ops-admin", state: "RUN", cpu: "00:02:51", elapsed: "00:34:08" },
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
    { name: "ops-admin", enabled: true, roles: "%Manager", lastLogin: "4 min ago", source: "Local" },
    { name: "service", enabled: true, roles: "AppRuntime", lastLogin: "18 min ago", source: "LDAP" },
    { name: "audit-reader", enabled: true, roles: "AuditRead", lastLogin: "2 days ago", source: "Local" },
  ],
  roles: [
    { name: "%Manager", members: 2, resources: 38, inherited: "%All" },
    { name: "AppRuntime", members: 4, resources: 7, inherited: "AppBase" },
    { name: "AuditRead", members: 3, resources: 2, inherited: "\u2014" },
  ],
  webapps: [
    { name: "/api/admin", namespace: "%SYS", enabled: true, auth: "Password, JWT", dispatch: "%Api.Admin" },
    { name: "/csp/ops", namespace: "IRISAPP", enabled: true, auth: "Password", dispatch: "Static files" },
    { name: "/api/app", namespace: "IRISAPP", enabled: true, auth: "Delegated", dispatch: "App.REST" },
  ],
  secrets: [
    { name: "production-services", type: "Wallet collection", items: 4, state: "Active", rotated: "12 days ago" },
    { name: "web-tls", type: "X509 credential", items: 1, state: "Valid", rotated: "41 days ago" },
    { name: "oauth-client", type: "OAuth configuration", items: 2, state: "Active", rotated: "7 days ago" },
  ],
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
};

const state = {
  view: "overview",
  demo: true,
  busy: false,
  renderRevision: 0,
  client: new IrisAdminClient(),
  pendingOperation: null,
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

function table(rows, columns, { empty = "No records returned", actions = null } = {}) {
  if (!rows.length) return `<div class="empty"><strong>${escapeHtml(empty)}</strong><span>Refresh the view or verify privileges for this API.</span></div>`;
  const head = columns.map(([key, label]) => `<th scope="col">${escapeHtml(label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map(([key]) => {
    const value = row?.[key];
    if (typeof value === "boolean") return `<td><span class="pill ${value ? "ok" : "muted"}">${value ? "Enabled" : "Disabled"}</span></td>`;
    if (key === "status" || key === "state" || key === "level" || key === "lastResult") {
      const tone = /run|ready|complete|active|valid|info/i.test(value) ? "ok" : /warn|suspend/i.test(value) ? "warn" : "muted";
      return `<td><span class="pill ${tone}">${escapeHtml(value)}</span></td>`;
    }
    return `<td>${escapeHtml(value)}</td>`;
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

function shellCard(title, body, action = "") {
  return `<article class="card"><header><div><p class="eyebrow">IRIS SysAdmin API</p><h2>${escapeHtml(title)}</h2></div>${action}</header>${body}</article>`;
}

async function request(path, fallbackKey, options = {}) {
  if (state.demo) return structuredClone(demo[fallbackKey]);
  return state.client.request(path, options);
}

async function loadOverview() {
  if (state.demo) return { ...demo.overview, demo: true };
  const [main, resources, usage] = await Promise.all([
    state.client.request("/v2/monitor/dashboard/main"),
    state.client.request("/v2/monitor/dashboard/system-resources"),
    state.client.request("/v2/monitor/system-usage"),
  ]);
  const dashboard = unwrapIrisResult(main) || {};
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
    resources: unwrapIrisResult(resources),
    counters: unwrapIrisResult(usage),
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
  return `
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
  const rows = mappedRows(payload, { pid: ["Pid", "pid", "Job"], namespace: ["Nspace", "namespace"], routine: ["Routine", "routine"], user: ["Username", "user"], state: ["State", "state"], cpu: ["CPUTime", "cpu"], elapsed: ["ElapsedTime", "elapsed"] }, ["processes", "content"]);
  return shellCard("Runtime processes", table(rows, [["pid","PID"],["namespace","Namespace"],["routine","Routine"],["user","User"],["state","State"],["cpu","CPU time"],["elapsed","Elapsed"]], {
    actions: (row) => `<button class="mini" data-operation="POST|/v2/process/suspend|${escapeHtml(row.pid)}">Suspend</button><button class="mini danger-text" data-operation="POST|/v2/process/terminate|${escapeHtml(row.pid)}">Terminate</button>`,
  }), '<span class="caption">Mutations require explicit typed confirmation</span>');
}

async function renderInfrastructure() {
  let databases = demo.databases;
  let devices = demo.devices;
  if (!state.demo) {
    const [databasePayload, devicePayload] = await Promise.all([
      state.client.request("/v2/databases"),
      state.client.request("/v2/devices"),
    ]);
    databases = mappedRows(databasePayload, {
      name: ["Name", "name"], directory: ["Directory", "directory"], server: ["Server", "server"],
      status: ["Status", "status"], startup: ["MountAtStartup", "startup"],
    }, ["databases"])
      .map((row) => ({ ...row, server: row.server || "Local" }));
    devices = mappedRows(devicePayload, {
      name: ["Name", "name"], physical: ["PhysicalDevice", "physical"], type: ["Type", "type"],
      subtype: ["SubType", "subtype"], description: ["Description", "description"],
    }, ["devices"]);
  }
  return `<div class="security-note"><span>\u25a4</span><div><strong>Operating-system coverage</strong><p>Database mount state and configured I/O devices are retrieved from SysAdmin API v2. Overview shows performance counters; CPU and memory gauges are demo-only.</p></div></div>
    <div class="tabbed-cards">
      ${shellCard("Database storage", table(databases, [["name","Database"],["directory","Directory"],["server","Server"],["status","Mount state"],["startup","Mount at startup"]]), '<button class="primary" data-open-explorer="/v2/database|PUT">Configure database</button>')}
      ${shellCard("Configured devices", table(devices, [["name","Device"],["physical","Physical device"],["type","Type"],["subtype","Subtype"],["description","Description"]]), '<button class="primary" data-open-explorer="/v2/device|PUT">Configure device</button>')}
    </div>`;
}

async function renderTasks() {
  const payload = await request("/v2/tasks", "tasks");
  const rows = mappedRows(payload, { id: ["Id", "id"], name: ["Name", "name"], namespace: ["Namespace", "namespace"], type: ["Type", "type"], next: ["NextScheduled", "next"], status: ["Suspended", "status"], lastResult: ["LastFinished", "lastResult"] }, ["tasks", "content"])
    .map((row) => ({ ...row, status: typeof row.status === "boolean" ? (row.status ? "Suspended" : "Ready") : row.status }));
  return `<div class="split-heading"><div><h2>Scheduled work</h2><p>Inspect, trigger, suspend, and resume background tasks.</p></div><button class="primary" data-open-explorer="/v2/task|POST">Create task</button></div>${shellCard("Task definitions", table(rows, [["id","ID"],["name","Task"],["namespace","Namespace"],["type","Type"],["next","Next run"],["status","Status"],["lastResult","Last finished"]], { actions: (row) => `<button class="mini" data-operation="POST|/v2/task/run|${escapeHtml(row.id)}">Run</button>${row.status === "Suspended" ? `<button class="mini" data-operation="POST|/v2/task/resume|${escapeHtml(row.id)}">Resume</button>` : `<button class="mini" data-operation="POST|/v2/task/suspend|${escapeHtml(row.id)}">Suspend</button>`}` }))}`;
}

async function renderAccess() {
  if (state.demo) {
    return `<div class="tabbed-cards">${shellCard("Users", table(demo.users, [["name","User"],["enabled","State"],["roles","Roles"],["lastLogin","Last login"],["source","Directory"]]))}${shellCard("Roles", table(demo.roles, [["name","Role"],["members","Members"],["resources","Resources"],["inherited","Inherited"]]))}</div>`;
  }
  const [usersPayload, rolesPayload] = await Promise.all([state.client.request("/v2/security/users"), state.client.request("/v2/security/roles")]);
  const users = mappedRows(usersPayload, { name: ["Name", "name"], enabled: ["Enabled", "enabled"], type: ["Type", "type"], namespace: ["Namespace", "namespace"] }, ["users"]);
  const roles = mappedRows(rolesPayload, { name: ["Name", "name"], description: ["Description", "description"], createdBy: ["CreatedBy", "createdBy"], escalationOnly: ["EscalationOnly", "escalationOnly"] }, ["roles"]);
  return `<div class="tabbed-cards">${shellCard("Users", table(users, [["name","User"],["enabled","State"],["type","Authentication"],["namespace","Startup namespace"]]))}${shellCard("Roles", table(roles, [["name","Role"],["description","Description"],["createdBy","Created by"],["escalationOnly","Escalation only"]]))}</div>`;
}

async function renderWebapps() {
  const payload = await request("/v2/web-apps", "webapps");
  const rows = mappedRows(payload, { name: ["Name", "name"], namespace: ["Namespace", "namespace"], enabled: ["Enabled", "enabled"], auth: ["AuthenticationMethods", "auth"], dispatch: ["DispatchClass", "dispatch"], resource: ["Resource", "resource"] }, ["applications", "webApps"]);
  return shellCard("Web application registry", table(rows, [["name","Application"],["namespace","Namespace"],["enabled","State"],["auth","Authentication"],["dispatch","Dispatch"],["resource","Resource"]]), '<button class="primary" data-open-explorer="/v2/web-app|PUT">Configure app</button>');
}

async function renderSecrets() {
  let rows = demo.secrets;
  if (!state.demo) {
    const [wallets, certificates] = await Promise.all([state.client.request("/v2/wallet/collections"), state.client.request("/v2/security/x509-credentials")]);
    const walletRows = mappedRows(wallets, { name: ["Name", "name"], type: ["type"], editResource: ["EditResource"], useResource: ["UseResource"] }, ["collections"])
      .map((row) => ({ ...row, type: row.type || "Wallet collection", state: "Protected", details: `${row.editResource || "\u2014"} / ${row.useResource || "\u2014"}` }));
    const certificateRows = mappedRows(certificates, { name: ["Alias", "name"], hasPrivateKey: ["HasPrivateKey"], owners: ["OwnerList"], peers: ["PeerNames"] }, ["credentials"])
      .map((row) => ({ ...row, type: "X509 credential", state: row.hasPrivateKey ? "Private key present" : "Certificate only", details: row.owners || "All users" }));
    rows = [...walletRows, ...certificateRows];
  }
  const columns = state.demo ? [["name","Asset"],["type","Type"],["items","Items"],["state","State"],["rotated","Last rotation"]] : [["name","Asset"],["type","Type"],["state","State"],["details","Access / ownership"]];
  return `<div class="security-note"><span>\u25c8</span><div><strong>Inventory only</strong><p>Secret values are never rendered. Fields matching password, token, private key, secret, or credential are redacted in the client before display.</p></div></div>${shellCard("Protected assets", table(rows, columns), '<button class="primary" data-open-explorer="/v2/wallet/secret|PUT">Manage secret</button>')}`;
}

async function renderOAuth() {
  let servers = demo.oauthServers;
  let resources = demo.oauthResources;
  let clients = demo.oauthClients;
  if (!state.demo) {
    const [serverPayload, resourcePayload, clientPayload] = await Promise.all([
      state.client.request("/v2/security/oauth2/client/server-definitions"),
      state.client.request("/v2/security/oauth2/resource-servers"),
      state.client.request("/v2/security/oauth2/server/clients"),
    ]);
    servers = mappedRows(serverPayload, {
      id: ["ID", "id"], issuer: ["IssuerEndpoint", "issuer"], clients: ["ClientCount", "clients"], resources: ["ResourceCount", "resources"],
    }, ["serverDefinitions"]);
    resources = mappedRows(resourcePayload, {
      name: ["Name", "name"], server: ["ServerDefinition", "server"],
    }, ["resourceServers"]);
    clients = mappedRows(clientPayload, {
      name: ["Name", "name"], clientId: ["ClientId", "clientId"], type: ["ClientType", "type"],
      description: ["Description", "description"], redirects: ["RedirectURL", "redirects"],
    }, ["clients"]);
  }
  return `<div class="security-note"><span>\u25ce</span><div><strong>OAuth metadata without credential exposure</strong><p>Client IDs, server relationships, and redirect metadata are visible. Client secrets, access tokens, initial-access tokens, and private-key passwords are always redacted.</p></div></div>
    ${shellCard("Client authorization servers", table(servers, [["id","Definition"],["issuer","Issuer endpoint"],["clients","Clients"],["resources","Resources"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/client/server-definition|POST">Add server definition</button>')}
    <div class="tabbed-cards">
      ${shellCard("Resource servers", table(resources, [["name","Resource server"],["server","Server definition"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/resource-server|PUT">Configure resource</button>')}
      ${shellCard("Authorization-server clients", table(clients, [["name","Client"],["clientId","Client ID"],["type","Type"],["description","Description"],["redirects","Redirect URLs"]]), '<button class="primary" data-open-explorer="/v2/security/oauth2/server/client|POST">Register client</button>')}
    </div>`;
}

async function renderLogs() {
  if (state.demo) return shellCard("Unified event stream", table(demo.logs, [["time","Time"],["level","Level"],["source","Subsystem"],["message","Message"],["user","Actor"]]), '<button class="ghost" data-open-explorer="/v2/security/audit/records|POST">Advanced query</button>');
  const payload = await state.client.requestAsync("/v2/security/audit/records?maxRows=100", { method: "POST" });
  const rows = mappedRows(payload, { time: ["TimeStamp", "time"], level: ["EventType", "level"], source: ["EventSource", "source"], message: ["Description", "Event", "message"], user: ["Username", "user"], namespace: ["Namespace", "namespace"] }, ["records", "events"]);
  return shellCard("Unified event stream", table(rows, [["time","Time"],["level","Type"],["source","Source"],["message","Description"],["user","Actor"],["namespace","Namespace"]]));
}

function renderExplorer() {
  const options = endpointCatalog.map((entry) => `<option value="${escapeHtml(entry.method)}|${escapeHtml(entry.path)}">${escapeHtml(entry.method.padEnd(6))} ${escapeHtml(entry.path)} \u2014 ${escapeHtml(entry.label)}</option>`).join("");
  return `<div class="explorer-grid">
    ${shellCard("Request builder", `<label>Known endpoint<select id="endpoint-select">${options}</select></label><div class="method-path"><select id="request-method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>HEAD</option></select><input id="request-path" value="/info" spellcheck="false" /></div><label>JSON body<textarea id="request-body" rows="10" spellcheck="false" placeholder='{ "name": "value" }'></textarea></label><div class="request-footer"><span id="safety-badge" class="pill ok">Read only</span><button class="primary" id="execute-request">Send request</button></div>`)}
    ${shellCard("Response", `<div class="response-toolbar"><span id="response-status">Waiting for request</span><button class="text-button" id="copy-response">Copy JSON</button></div><pre id="response-output">{
  "tip": "Choose an endpoint and send a request. Sensitive fields are redacted before display."
}</pre>`)}
  </div>`;
}

async function render() {
  const revision = ++state.renderRevision;
  const view = state.view;
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
    setHealth(true);
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
    prepareOperation({ method, path: requestPath, body });
  }));
  if (state.view === "explorer") bindExplorer();
}

function bindExplorer() {
  const selector = $("#endpoint-select");
  selector.addEventListener("change", () => {
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
  const safety = classifySafety($("#request-method").value, $("#request-path").value);
  badge.className = `pill ${safety === "read" ? "ok" : safety === "mutation" ? "warn" : "danger"}`;
  badge.textContent = safety === "read" ? "Read only" : safety === "mutation" ? "State change" : "Destructive";
}

async function executeExplorerRequest() {
  const method = $("#request-method").value;
  const path = $("#request-path").value.trim();
  let body;
  try { body = $("#request-body").value.trim() ? JSON.parse($("#request-body").value) : undefined; }
  catch { toast("Request body is not valid JSON", "error"); return; }
  if (classifySafety(method, path) !== "read") { prepareOperation({ method, path, body, fromExplorer: true }); return; }
  await runOperation({ method, path, body, fromExplorer: true });
}

function prepareOperation(operation) {
  state.pendingOperation = operation;
  const phrase = confirmationPhrase(operation.method, operation.path);
  $("#confirm-title").textContent = `${operation.method} ${operation.path}`;
  $("#confirm-description").innerHTML = `<strong>${classifySafety(operation.method, operation.path) === "destructive" ? "Destructive operation" : "State-changing operation"}</strong><p>Review the target and request body. The action will be sent to the connected IRIS instance and may affect availability or access.</p><pre>${escapeHtml(JSON.stringify(redactSensitive(operation.body ?? {}), null, 2))}</pre>`;
  $("#confirmation-phrase").textContent = phrase;
  $("#confirmation-input").value = "";
  $("#confirm-submit").disabled = true;
  $("#confirm-dialog").showModal();
}

async function runOperation({ method, path, body, fromExplorer = false }) {
  const started = performance.now();
  try {
    const result = state.demo ? { demo: true, accepted: true, method, path, body: redactSensitive(body ?? null) } : await state.client.request(path, { method, body });
    const elapsed = Math.round(performance.now() - started);
    if (fromExplorer && $("#response-output")) {
      $("#response-status").textContent = `Success \u00b7 ${elapsed} ms`;
      $("#response-output").textContent = JSON.stringify(redactSensitive(result), null, 2);
    }
    toast(state.demo ? "Demo operation simulated safely" : "Operation completed");
    return result;
  } catch (error) {
    if (fromExplorer && $("#response-output")) {
      $("#response-status").textContent = `Error${error.status ? ` \u00b7 HTTP ${error.status}` : ""}`;
      $("#response-output").textContent = JSON.stringify(redactSensitive({ message: error.message, payload: error.payload }), null, 2);
    }
    toast(error.message, "error");
    throw error;
  }
}

async function navigate(view) {
  if (!titles[view]) return;
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

let toastTimer;
function toast(message, tone = "ok") {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.className = "toast"; }, 3200);
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
window.addEventListener("hashchange", () => {
  const view = location.hash.slice(1);
  if (titles[view] && view !== state.view) navigate(view);
});
$("#refresh-button").addEventListener("click", render);
$("#connection-button").setAttribute("data-open-connection", "");
$$('[data-open-connection]').forEach((button) => button.addEventListener("click", () => $("#connection-dialog").showModal()));
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
  const dialog = document.getElementById(button.dataset.closeDialog);
  dialog?.close();
}));
$("#connection-dialog").addEventListener("close", () => { $("#password").value = ""; });
$("#confirm-dialog").addEventListener("close", () => {
  state.pendingOperation = null;
  $("#confirmation-input").value = "";
  $("#confirm-submit").disabled = true;
});
$("#connection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#connect-submit");
  if (submit.disabled) return;
  submit.disabled = true;
  submit.textContent = "Connecting\u2026";
  const useDemo = $("#demo-mode").checked;
  const baseUrl = $("#base-url").value;
  const username = $("#username").value;
  const password = $("#password").value;
  const role = $("#role").value;
  try {
    if (!useDemo) {
      if (!username || !password) throw new Error("Username and password are required for a live connection");
      state.client.setConnection({ baseUrl, token: "" });
      await state.client.login(username, password, role);
    } else {
      state.client.setConnection({ baseUrl, token: "" });
    }
    state.demo = useDemo;
    $("#connection-dialog").close();
    setModeUi();
    toast(useDemo ? "Safe demo enabled" : "Connected to IRIS");
    await render();
  } catch (error) { toast(error.message, "error"); }
  finally {
    $("#password").value = "";
    submit.disabled = false;
    submit.textContent = "Apply";
  }
});
$("#confirmation-input").addEventListener("input", () => {
  $("#confirm-submit").disabled = $("#confirmation-input").value !== $("#confirmation-phrase").textContent;
});
$("#confirm-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const operation = state.pendingOperation;
  if (!operation || $("#confirmation-input").value !== confirmationPhrase(operation.method, operation.path)) return;
  state.pendingOperation = null;
  $("#confirm-dialog").close();
  if (operation) {
    try {
      await runOperation(operation);
      if (!operation.fromExplorer) await render();
    } catch {}
  }
  state.pendingOperation = null;
});

const initial = location.hash.slice(1);
if (titles[initial]) state.view = initial;
setModeUi();
render();
