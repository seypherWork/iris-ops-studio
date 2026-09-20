import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../web/", import.meta.url));
const port = Number(process.env.PORT || 4173);

const processes = [
  { Pid: 8421, Nspace: "IRISAPP", Routine: "%SYS.Task.RunLegacyTask", Username: "SYSTEM", State: "RUN", CPUTime: 1842, ElapsedTime: "03:04:33" },
  { Pid: 8407, Nspace: "%SYS", Routine: "%MONLBL", Username: "SYSTEM", State: "RUN", CPUTime: 422, ElapsedTime: "01:14:08" },
  { Pid: 8388, Nspace: "USER", Routine: "%CSP.Session", Username: "demo-operator", State: "READ", CPUTime: 81, ElapsedTime: "00:22:41" },
];

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
  "/api/admin/v2/tasks": { status: {}, result: [
    { Id: 17, Name: "PurgeAudit", Namespace: "%SYS", Type: "System", Suspended: false, LastFinished: "2026-09-14 02:01:00", NextScheduled: "2026-09-15 02:00:00" },
    { Id: 24, Name: "BackupCheck", Namespace: "IRISAPP", Type: "User", Suspended: true, LastFinished: "2026-09-14 12:00:00", NextScheduled: "2026-09-15 12:30:00" },
  ] },
  "/api/admin/v2/security/users": { status: {}, result: [{ Name: "ops-admin", FullName: "Operations administrator", Enabled: true, Type: "Password user", Namespace: "%SYS", Routine: "" }] },
  "/api/admin/v2/security/roles": { status: {}, result: [{ Name: "%Manager", Description: "IRIS system manager", CreatedBy: "_SYSTEM", EscalationOnly: false }] },
  "/api/admin/v2/web-apps": { status: {}, result: [{ Name: "/csp/ops", Namespace: "IRISOPS", Enabled: true, AuthenticationMethods: ["Password", "JWT"], DispatchClass: "", Resource: "%DB_IRISOPS" }] },
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

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    await consumeJson(req);
    return json(res, 200, { result: { access_token: "local-demo-token", refresh_token: "local-refresh-token", sub: "demo-operator", exp: 9999999999 } });
  }

  if (url.pathname.startsWith("/api/admin/")) {
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
  process.stdout.write(`IRIS Ops Studio mock: http://127.0.0.1:${port}\n`);
});
