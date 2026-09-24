import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assets = fileURLToPath(new URL("../web/assets/", import.meta.url));
const reply = (payload, status = 200, headers = {}, url = "") => {
  const response = new Response(JSON.stringify(payload), { status, headers });
  if (url) Object.defineProperty(response, "url", { value: url });
  return response;
};
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function loadApp() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: "", textContent: "", innerHTML: "", disabled: false, checked: false,
      className: "", dataset: {}, open: false, listeners: new Map(),
      classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
      addEventListener(type, fn) { this.listeners.set(type, fn); },
      showModal() { this.open = true; },
      close() { this.open = false; this.listeners.get("close")?.(); },
    });
    return nodes.get(selector);
  };
  const document = { querySelector: node, querySelectorAll: () => [], getElementById: (id) => node(`#${id}`) };
  const context = vm.createContext({
    document, window: { addEventListener() {} },
    location: { hash: "", href: "http://127.0.0.1:9999/" }, history: { replaceState() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    URL, URLSearchParams, AbortController, Response, structuredClone, performance,
    fetch: async () => { throw new Error("Unexpected network call"); },
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
  });
  const modules = new Map();
  for (const name of ["api.js", "app.js", "explorer.js", "operations.js", "rest-discovery.js", "sanitization.js"]) {
    const filename = path.join(assets, name);
    let source = await fs.readFile(filename, "utf8");
    if (name === "app.js") source += "\nexport { state, prepareAccessOperation, prepareWebAppOperation, prepareOperation, runOperation, executeExplorerRequest, renderAccess, navigate };";
    modules.set(filename, new vm.SourceTextModule(source, { context, identifier: filename }));
  }
  const app = modules.get(path.join(assets, "app.js"));
  await app.link((specifier, referencing) => modules.get(path.resolve(path.dirname(referencing.identifier), specifier.split("?")[0])));
  await app.evaluate();
  await new Promise((resolve) => setImmediate(resolve));
  return { ...app.namespace, node };
}
function live(app, base = "https://instance-a.invalid/api/admin") {
  app.state.demo = false;
  app.state.client.setConnection({ baseUrl: base, token: "synthetic-test-token" });
  app.state.connectionContext = { mode: "live", instance: base, actor: "Test operator" };
}

test("a task POST with audit text in the query still requires preview", async () => {
  const app = await loadApp();
  live(app);
  app.state.view = "explorer";
  app.node("#request-method").value = "POST";
  app.node("#request-path").value = "/v2/task/run?id=17&note=/security/audit/records";
  app.node("#request-body").value = '{"RunNow":true}';
  const methods = [];
  app.state.client.fetchImpl = async (_url, options) => {
    methods.push(options.method);
    return reply({ result: { LastStarted: "", LastFinished: "", Status: "1", Error: "Success" } });
  };
  await app.executeExplorerRequest();
  assert.equal(app.node("#confirm-dialog").open, true);
  assert.equal(methods.includes("POST"), false);
});

test("late Access and web-app preflights from A cannot open a preview on B", async () => {
  for (const kind of ["access", "webapp"]) {
    const app = await loadApp();
    live(app);
    app.node("#access-user").value = "IrisOps_TestUser";
    app.node("#access-user-role").value = "IrisOps_TestRole";
    const gate = deferred();
    const calls = [];
    app.state.client.fetchImpl = (url, options) => { calls.push({ url, method: options.method }); return gate.promise; };
    const preparing = kind === "access" ? app.prepareAccessOperation("assign-role")
      : app.prepareWebAppOperation("/csp/irisops-testweb");
    live(app, "https://instance-b.invalid/api/admin");
    gate.resolve(reply({ result: kind === "access"
      ? { Enabled: false, Roles: [], EscalationRoles: [] }
      : { Enabled: false, NameSpace: "USER", IsNameSpaceDefault: false } }));
    await assert.rejects(preparing, /connection changed/);
    assert.equal(app.state.pendingOperation, null);
    assert.equal(app.node("#confirm-dialog").open, false);
    assert.equal(calls.some((call) => call.method === "PUT"), false);
  }
});

test("an older preparation cannot replace a newer preview on the same instance", async () => {
  const app = await loadApp();
  live(app);
  app.node("#access-user").value = "IrisOps_TestUser";
  app.node("#access-user-role").value = "IrisOps_TestRole";
  const gate = deferred();
  let reads = 0;
  const before = () => reply({ result: { Enabled: false, Roles: [], EscalationRoles: [] } });
  app.state.client.fetchImpl = async () => ++reads === 1 ? gate.promise : before();
  const older = app.prepareAccessOperation("assign-role");
  await app.prepareAccessOperation("assign-role");
  const latest = app.state.pendingOperation;
  gate.resolve(before());
  await assert.rejects(older, /newer operation/);
  assert.equal(app.state.pendingOperation, latest);
});

test("completion of A preserves a newer confirmation dialog B", async () => {
  const app = await loadApp();
  live(app);
  app.state.view = "explorer";
  const gate = deferred();
  app.state.client.fetchImpl = () => gate.promise;
  await app.prepareOperation({ method: "PUT", path: "/v2/example-a", fromExplorer: true });
  app.node("#confirmation-input").value = app.node("#confirmation-phrase").textContent;
  const submitting = app.node("#confirm-form").listeners.get("submit")({ preventDefault() {} });
  await app.prepareOperation({ method: "PUT", path: "/v2/example-b", fromExplorer: true });
  gate.resolve(reply({ result: {} }));
  await submitting;
  assert.equal(app.node("#confirm-dialog").open, true);
  assert.equal(app.state.pendingOperation?.path, "/v2/example-b");
});

test("Explorer waits for an accepted audit job to finish", async () => {
  const app = await loadApp();
  live(app);
  app.state.view = "explorer";
  const calls = [];
  app.state.client.fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return reply({ result: { GUID: "synthetic-job" } }, 202,
      { Location: "/api/admin/v2/async-result?id=synthetic-job" },
      "https://instance-a.invalid/api/admin/v2/security/audit/records");
    return reply({ result: { State: "finished", Result: [{ AuditIndex: 41 }] } });
  };
  await app.runOperation({ method: "POST", path: "/v2/security/audit/records", fromExplorer: true, explorerRevision: 0 });
  assert.equal(calls.length, 2);
  assert.match(app.node("#response-output").textContent, /AuditIndex/);
  assert.doesNotMatch(app.node("#response-output").textContent, /synthetic-job/);
});

test("closing Connection settings invalidates a pending login", async () => {
  const app = await loadApp();
  app.node("#connection-dialog").showModal();
  app.node("#demo-mode").checked = false;
  app.node("#base-url").value = "/api/admin";
  app.node("#username").value = "synthetic-user";
  app.node("#password").value = "synthetic-only";
  const originalClient = app.state.client;
  const gate = deferred();
  originalClient.fetchImpl = async () => gate.promise;
  const submitting = app.node("#connection-form").listeners.get("submit")({ preventDefault() {} });
  app.node("#connection-dialog").close();
  gate.resolve(reply({ result: { access_token: "synthetic-token" } }));
  await submitting;
  assert.equal(app.state.client, originalClient);
  assert.equal(app.state.demo, true);
  assert.equal(app.node("#mode-label").textContent, "Safe demo");
});

test("late Explorer response cannot replace the latest displayed response", async () => {
  const app = await loadApp();
  live(app);
  app.state.view = "explorer";
  const gate = deferred();
  app.node("#request-method").value = "GET";
  app.node("#request-path").value = "/info";
  app.state.client.fetchImpl = async (url) => url.endsWith("/info") ? gate.promise : reply({ result: { marker: "LATEST" } });
  const older = app.executeExplorerRequest();
  app.node("#request-path").value = "/v2/tasks";
  await app.executeExplorerRequest();
  gate.resolve(reply({ result: { marker: "OLDER" } }));
  await older;
  assert.match(app.node("#response-output").textContent, /LATEST/);
  assert.doesNotMatch(app.node("#response-output").textContent, /OLDER/);
});

test("a local Explorer render cannot mark an offline instance connected", async () => {
  const app = await loadApp();
  live(app);
  app.state.client.fetchImpl = async () => { throw new Error("Synthetic offline instance"); };
  await app.navigate("processes");
  assert.equal(app.node("#health-label").textContent, "Connection issue");
  await app.navigate("explorer");
  assert.equal(app.node("#health-label").textContent, "Connection issue");
});

test("inventory detail reads are bounded to eight in-flight requests", async () => {
  const app = await loadApp();
  live(app);
  app.state.view = "access";
  let active = 0, peak = 0, reads = 0;
  app.state.client.fetchImpl = async (url) => {
    if (url.endsWith("/v2/security/users")) return reply({ result: Array.from({ length: 40 }, (_, i) => ({ Name: `SyntheticUser${i}` })) });
    if (url.includes("/v2/security/user?")) {
      reads++; active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return reply({ result: { Enabled: true, Roles: [], NameSpace: "USER" } });
    }
    return reply({ result: [] });
  };
  await app.renderAccess();
  assert.equal(reads, 40);
  assert.ok(peak <= 8, `Expected at most eight detail reads; saw ${peak}`);
});
