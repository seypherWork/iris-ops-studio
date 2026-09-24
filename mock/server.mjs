import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../web/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const restDiscoveryDelayMs = Math.max(0, Math.min(10_000, Number(process.env.REST_DISCOVERY_DELAY_MS || 0) || 0));
// Local QA only: simulate an endpoint denied by IRIS without touching a live instance.
const unavailableRoutes = new Set((process.env.MOCK_UNAVAILABLE_ROUTES || "").split(",").map((route) => route.trim()).filter(Boolean));

const processes = [
  { Pid: 8421, Nspace: "IRISAPP", Routine: "%SYS.Task.RunLegacyTask", Username: "SYSTEM", State: "RUN", CPUTime: 1842, ElapsedTime: "03:04:33", CanBeSuspended: true, CanBeTerminated: true },
  { Pid: 8407, Nspace: "%SYS", Routine: "%MONLBL", Username: "SYSTEM", State: "RUN", CPUTime: 422, ElapsedTime: "01:14:08", CanBeSuspended: false, CanBeTerminated: false },
  { Pid: 8388, Nspace: "USER", Routine: "%CSP.Session", Username: "demo-operator", State: "READ", CPUTime: 81, ElapsedTime: "00:22:41", CanBeSuspended: true, CanBeTerminated: true },
];

const tasks = [
  { Id: 17, Name: "PurgeAudit", Namespace: "%SYS", Type: "System", Suspended: false, LastStarted: "2026-09-14 02:00:00", LastFinished: "2026-09-14 02:01:00", NextScheduled: "2026-09-15 02:00:00" },
  { Id: 24, Name: "BackupCheck", Namespace: "IRISAPP", Type: "User", Suspended: true, LastStarted: "2026-09-14 12:00:00", LastFinished: "2026-09-14 12:00:30", NextScheduled: "2026-09-15 12:30:00" },
];

const users = {
  "ops-admin": { Enabled: true, FullName: "Operations administrator", NameSpace: "%SYS", Roles: ["%Manager"], EscalationRoles: [] },
  IrisOps_TestUser: { Enabled: true, FullName: "IRIS Ops validation user", NameSpace: "USER", Roles: ["IrisOps_TestRole"], EscalationRoles: [] },
};

const roles = {
  "%Manager": { Description: "IRIS system manager", GrantedRoles: ["%All"], EscalationOnly: false, Resources: [{ Name: "%Admin_Operate", Permissions: "RWU" }] },
  IrisOps_TestRole: { Description: "Disposable validation role", GrantedRoles: [], EscalationOnly: false, Resources: [{ Name: "%DB_IRISOPS", Permissions: "R" }] },
};

const webApps = {
  "/csp/ops": { Name: "/csp/ops", NameSpace: "IRISOPS", IsNameSpaceDefault: false, Enabled: true, DispatchClass: "", Resource: "%DB_IRISOPS" },
  "/api/IrisOps_TestWeb": {
    Name: "/api/IrisOps_TestWeb", NameSpace: "IRISAPP", IsNameSpaceDefault: false, Enabled: false,
    DispatchClass: "IrisOps.Test.REST", Resource: "%DB_IRISOPS", Description: "Disposable mock REST service",
  },
};

const fixtures = {
  "/api/admin/info": { server: "local-mock", version: "IRIS 2026.2", namespace: "%SYS", user: "demo-operator", api: "SysAdmin v2" },
  "/api/admin/v2/monitor/dashboard/main": { status: {}, result: { Performance: { GlobalRefsPerSecond: 18420, CacheEfficiency: 98.7, DiskReads: 1832, DiskWrites: 642 }, Status: { UpTime: "18d 07h 42m", SystemMonitor: true }, SystemUsage: { DatabaseSpace: "Normal", DatabaseJournal: "Normal", JournalSpace: "Normal", LockTable: "Normal", WriteDaemon: "Normal", Processes: 142, CSPSessions: 12 }, Alerts: { SeriousAlerts: 0, ApplicationErrors: 1 }, Licensing: { LicenseLimit: 100, LicenseUse: 22 }, UpcomingTasks: [{ Task: "PurgeAudit", Time: "02:00", Status: "Scheduled" }] } },
  "/api/admin/v2/monitor/dashboard/system-resources": { status: {}, result: [{ Name: "Global", Seize: 8, Nseize: 0, Aseize: 0, Bseize: 0, BusySet: 1 }] },
  "/api/admin/v2/monitor/system-usage": { status: {}, result: { AllGlobalReferences: 982102, GlobalUpdateReferences: 18201, RoutineCalls: 73142, LastUpdate: "2026-09-15 10:00:00" } },
  "/api/admin/v2/processes": { status: {}, result: processes },
  "/api/admin/v2/databases": { status: {}, result: [
    { Name: "IRISSYS", Directory: "/usr/irissys/mgr/", Server: "", MountAtStartup: true, Status: "Mounted/RW" },
    { Name: "IRISAPP", Directory: "/usr/irissys/mgr/irisapp/", Server: "", MountAtStartup: true, Status: "Mounted/RW" },
  ] },
  "/api/admin/v2/devices": { status: {}, result: [
    { Name: "|TRM|", PhysicalDevice: "/dev/pts", Type: "TRM", SubType: "C-IRIS Terminal", Description: "Interactive terminal" },
  ] },
  "/api/admin/v2/tasks": { status: {}, result: tasks },
  "/api/admin/v2/task/history": { status: {}, result: [{ TaskId: 17, Name: "PurgeAudit", LastStart: "2026-09-15 02:00:00", Completed: "2026-09-15 02:01:00", Status: "Completed", Result: "Success", Namespace: "%SYS", Username: "SYSTEM", LogDatetime: "2026-09-15 02:01:00" }] },
  "/api/admin/v2/security/users": { status: {}, result: [{ Name: "ops-admin", FullName: "Operations administrator", Enabled: true, Type: "Password user", NameSpace: "%SYS", Roles: ["%Manager"], Routine: "" }, { Name: "IrisOps_TestUser", FullName: "IRIS Ops validation user", Enabled: true, Type: "Password user", NameSpace: "USER", Roles: ["IrisOps_TestRole"], Routine: "" }] },
  "/api/admin/v2/security/roles": { status: {}, result: [{ Name: "%Manager", Description: "IRIS system manager", CreatedBy: "_SYSTEM", EscalationOnly: false, ResourceCount: 1 }, { Name: "IrisOps_TestRole", Description: "Disposable validation role", CreatedBy: "demo-operator", EscalationOnly: false, ResourceCount: 1 }] },
  "/api/admin/v2/security/resources": { status: {}, result: [{ Name: "%Admin_Operate", Description: "Operate and monitor IRIS", PublicPermission: "" }, { Name: "%Admin_Secure", Description: "Manage security", PublicPermission: "" }, { Name: "%DB_IRISOPS", Description: "Validation database", PublicPermission: "" }] },
  "/api/admin/v2/wallet/collections": { status: {}, result: [{ Name: "Integration secrets", EditResource: "%Admin_Wallet", UseResource: "%DB_IRISOPS" }] },
  "/api/admin/v2/security/x509-credentials": { status: {}, result: [{ Alias: "mTLS gateway", HasPrivateKey: true, OwnerList: ["ops-admin"], PeerNames: ["gateway.example"] }] },
  "/api/admin/v2/security/oauth2/client/server-definitions": { status: {}, result: [{ ID: "auth0-prod", IssuerEndpoint: "https://identity.example/", ClientCount: 2, ResourceCount: 1 }] },
  "/api/admin/v2/security/oauth2/resource-servers": { status: {}, result: [{ Name: "iris-operations-api", ServerDefinition: "auth0-prod" }] },
  "/api/admin/v2/security/oauth2/server/clients": { status: {}, result: [{ Name: "Operations portal", ClientId: "iris-ops", ClientType: "confidential", Description: "Administrative portal client", RedirectURL: ["https://ops.example/callback"] }] },
};

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": mime[".json"], "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", ...headers });
  res.end(body);
}

async function consumeJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/fixtures/mobile-preview.html") {
    const fixture = await readFile(new URL("../test/fixtures/mobile-preview.html", import.meta.url));
    res.writeHead(200, { "Content-Type": mime[".html"], "Content-Length": fixture.length, "Cache-Control": "no-store" });
    return res.end(fixture);
  }

  if (req.method === "GET" && url.pathname === "/api/mgmnt/") {
    if (restDiscoveryDelayMs) await new Promise((resolve) => setTimeout(resolve, restDiscoveryDelayMs));
    return json(res, 200, [{
      name: "/api/IrisOps_TestWeb", namespace: "IRISAPP", dispatchClass: "IrisOps.Test.REST",
      resource: "%DB_IRISOPS", enabled: webApps["/api/IrisOps_TestWeb"].Enabled,
      swaggerSpec: "/api/mgmnt/v1/IRISAPP/spec/api/IrisOps_TestWeb",
    }]);
  }
  if (req.method === "GET" && url.pathname === "/api/mgmnt/v2/") {
    if (restDiscoveryDelayMs) await new Promise((resolve) => setTimeout(resolve, restDiscoveryDelayMs));
    return json(res, 200, [{
      name: "IrisOps.Test", namespace: "IRISAPP", dispatchClass: "IrisOps.Test.REST",
      webApplications: "/api/IrisOps_TestWeb", swaggerSpec: "/api/mgmnt/v2/IRISAPP/IrisOps.Test",
    }]);
  }
  if (req.method === "GET" && ["/api/mgmnt/v1/IRISAPP/spec/api/IrisOps_TestWeb", "/api/mgmnt/v2/IRISAPP/IrisOps.Test"].includes(url.pathname)) {
    return json(res, 200, { swagger: "2.0", info: { title: "Disposable mock API", version: "1.0" }, paths: {
      "/status": { get: { summary: "Read mock status" } },
      "/jobs": { post: { summary: "Create mock job" } },
    } });
  }

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    await consumeJson(req);
    return json(res, 200, { result: { access_token: "local-demo-token", refresh_token: "local-refresh-token", sub: "demo-operator", exp: 9999999999 } });
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (req.method === "GET" && unavailableRoutes.has(url.pathname)) {
      return json(res, 403, { error: "Mock source unavailable for partial-view validation" });
    }
    if (url.pathname === "/api/admin/v2/web-apps" && req.method === "GET") {
      return json(res, 200, { status: {}, result: Object.values(webApps) });
    }
    if (url.pathname === "/api/admin/v2/web-app") {
      const name = url.searchParams.get("name");
      if (!webApps[name]) return json(res, 404, { error: "Web application not found" });
      if (req.method === "GET") {
        // IRIS 2026.2 uses the query parameter to identify the application;
        // the detail result itself does not contain a Name property.
        const { Name: _name, ...detail } = webApps[name];
        return json(res, 200, { status: {}, result: detail });
      }
      if (req.method === "PUT") {
        const input = await consumeJson(req);
        if (!input || typeof input.Enabled !== "boolean") return json(res, 400, { error: "Enabled must be a boolean" });
        webApps[name] = { ...webApps[name], ...input, Name: name };
        return json(res, 200, { status: {}, result: webApps[name] });
      }
    }
    if (url.pathname === "/api/admin/v2/process" && req.method === "GET") {
      const process = processes.find((item) => String(item.Pid) === url.searchParams.get("id"));
      return process ? json(res, 200, { status: {}, result: process }) : json(res, 404, { error: "Process not found" });
    }
    if (["/api/admin/v2/process/suspend", "/api/admin/v2/process/resume", "/api/admin/v2/process/terminate"].includes(url.pathname) && req.method === "POST") {
      const index = processes.findIndex((item) => String(item.Pid) === url.searchParams.get("id"));
      if (index < 0) return json(res, 404, { error: "Process not found" });
      if (url.pathname.endsWith("/suspend") && !processes[index].CanBeSuspended) return json(res, 409, { error: "Process cannot be suspended" });
      if (url.pathname.endsWith("/terminate") && !processes[index].CanBeTerminated) return json(res, 409, { error: "Process cannot be terminated" });
      if (url.pathname.endsWith("/terminate")) processes.splice(index, 1);
      else {
        processes[index].State = url.pathname.endsWith("/suspend") ? "SUSP" : "RUN";
        processes[index].CanBeSuspended = !url.pathname.endsWith("/suspend");
      }
      return json(res, 200, { status: {}, result: { accepted: true } });
    }
    if (url.pathname === "/api/admin/v2/task/info" && req.method === "GET") {
      const task = tasks.find((item) => String(item.Id) === url.searchParams.get("id"));
      return task ? json(res, 200, { status: {}, result: { Suspended: task.Suspended, LastStarted: task.LastStarted, LastFinished: task.LastFinished, Status: "1", Error: "Success" } }) : json(res, 404, { error: "Task not found" });
    }
    if (["/api/admin/v2/task/run", "/api/admin/v2/task/suspend", "/api/admin/v2/task/resume"].includes(url.pathname) && req.method === "POST") {
      const task = tasks.find((item) => String(item.Id) === url.searchParams.get("id"));
      if (!task) return json(res, 404, { error: "Task not found" });
      await consumeJson(req);
      if (url.pathname.endsWith("/run")) {
        task.LastStarted = new Date().toISOString();
        task.LastFinished = new Date(Date.now() + 1).toISOString();
      }
      else task.Suspended = url.pathname.endsWith("/suspend");
      return json(res, 200, { status: {}, result: { accepted: true } });
    }
    if (url.pathname === "/api/admin/v2/security/user") {
      const name = url.searchParams.get("name");
      if (!users[name]) return json(res, 404, { error: "User not found" });
      if (req.method === "GET") return json(res, 200, { status: {}, result: users[name] });
      if (req.method === "PUT") {
        const input = await consumeJson(req);
        users[name] = { ...users[name], ...(input || {}) };
        return json(res, 200, { status: {}, result: users[name] });
      }
    }
    if (url.pathname === "/api/admin/v2/security/role") {
      const name = url.searchParams.get("name");
      if (!roles[name]) return json(res, 404, { error: "Role not found" });
      if (req.method === "GET") return json(res, 200, { status: {}, result: roles[name] });
      if (req.method === "PUT") {
        const input = await consumeJson(req);
        roles[name] = { ...roles[name], ...(input || {}) };
        return json(res, 200, { status: {}, result: roles[name] });
      }
    }
    if (url.pathname === "/api/admin/v2/security/audit/records" && req.method === "POST") {
      await consumeJson(req);
      return json(res, 202, { status: {}, result: { GUID: "mock-audit-1" } }, { Location: "/api/admin/v2/async-result?id=mock-audit-1" });
    }
    if (url.pathname === "/api/admin/v2/async-result" && req.method === "GET") {
      return json(res, 200, { status: {}, result: { GUID: url.searchParams.get("id"), State: "Finished", Result: [{ AuditIndex: 7, TimeStamp: "2026-09-15 10:04:21", EventType: "%Security", EventSource: "%System", Description: "Successful login", Username: "ops-admin", Namespace: "%SYS" }] } });
    }
    const payload = fixtures[url.pathname];
    if (payload) return json(res, 200, payload);
    if (["POST", "PUT", "DELETE"].includes(req.method)) {
      const input = await consumeJson(req);
      return json(res, 200, { status: {}, result: { accepted: true, operation: req.method, path: `${url.pathname}${url.search}`, request: input } });
    }
    return json(res, 404, { error: "Mock endpoint not found" });
  }

  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return json(res, 403, { error: "Forbidden" });
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[extname(filePath)] || "application/octet-stream", "Content-Length": data.length });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`IRIS Ops Studio mock: http://127.0.0.1:${server.address().port}\n`);
});
