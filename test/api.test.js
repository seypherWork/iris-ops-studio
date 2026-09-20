import test from "node:test";
import assert from "node:assert/strict";
import {
  IrisAdminClient,
  IrisApiError,
  appendQuery,
  classifySafety,
  confirmationPhrase,
  endpointCatalog,
  joinApiPath,
  normalizeBaseUrl,
  redactSensitive,
  resolveApiUrl,
  resolveServerLocation,
  unwrapIrisResult,
} from "../web/assets/api.js";

test("catalog includes unique read workflows for infrastructure and OAuth", () => {
  const pairs = endpointCatalog.map(({ method, path }) => `${method} ${path}`);
  assert.equal(new Set(pairs).size, pairs.length);
  for (const pair of [
    "GET /v2/databases",
    "GET /v2/devices",
    "GET /v2/security/oauth2/client/server-definitions",
    "GET /v2/security/oauth2/resource-servers",
    "GET /v2/security/oauth2/server/clients",
  ]) assert.ok(pairs.includes(pair), `Missing ${pair}`);
});

test("normalizes and joins API paths", () => {
  assert.equal(normalizeBaseUrl(" /api/admin/// "), "/api/admin");
  assert.equal(normalizeBaseUrl(""), "/api/admin");
  assert.equal(normalizeBaseUrl("https://iris.example/api/admin/"), "https://iris.example/api/admin");
  assert.equal(joinApiPath("/", "/login"), "/login");
  assert.throws(() => normalizeBaseUrl("//attacker.example/api"), /HTTP/);
  assert.throws(() => normalizeBaseUrl("https://user:secret@iris.example/api/admin"), /credentials/);
  assert.throws(() => normalizeBaseUrl("javascript:alert(1)"), /HTTP/);
  assert.equal(joinApiPath("https://iris.example/api/admin/", "v2/processes"), "https://iris.example/api/admin/v2/processes");
  assert.equal(resolveApiUrl("/api/admin", "/api/admin/v2/async-result?id=7"), "/api/admin/v2/async-result?id=7");
  assert.equal(resolveApiUrl("https://iris.example/api/admin", "/api/admin/v2/processes"), "https://iris.example/api/admin/v2/processes");
  assert.equal(resolveApiUrl("https://iris.example/api/admin", "/login"), "https://iris.example/api/admin/login");
  assert.equal(resolveApiUrl("https://iris.example/api/admin", "/v2/processes"), "https://iris.example/api/admin/v2/processes");
  assert.equal(resolveServerLocation("/api/admin", "/iris/api/admin/v2/async-result?id=7"), "/iris/api/admin/v2/async-result?id=7");
  assert.equal(resolveServerLocation("https://iris.example/api/admin", "/iris/api/admin/v2/async-result?id=7"), "https://iris.example/iris/api/admin/v2/async-result?id=7");
  assert.throws(() => resolveServerLocation("https://iris.example/api/admin", "https://attacker.example/result"), /cross-origin/);
  assert.equal(resolveApiUrl("https://iris.example/api/admin", "https://iris.example/api/admin/v2/tasks"), "https://iris.example/api/admin/v2/tasks");
  assert.throws(() => resolveApiUrl("https://iris.example/api/admin", "https://attacker.example/collect"), /cross-origin/);
  assert.throws(() => resolveApiUrl("https://iris.example/api/admin", "//attacker.example/collect"), /cross-origin/);
  assert.throws(() => resolveApiUrl("https://iris.example/api/admin", "\\\\attacker.example/collect"), /cross-origin/);
  assert.equal(appendQuery("/v2/process/suspend", { id: 41 }), "/v2/process/suspend?id=41");
  assert.equal(appendQuery("/v2/tasks?maxRows=20", { filter: "READ WRITE" }), "/v2/tasks?maxRows=20&filter=READ+WRITE");
  assert.deepEqual(unwrapIrisResult({ status: {}, result: [{ Id: 1 }] }), [{ Id: 1 }]);
});

test("classifies read, mutation, and destructive operations", () => {
  assert.equal(classifySafety("GET", "/v2/processes"), "read");
  assert.equal(classifySafety("POST", "/v2/security/audit/records"), "read");
  assert.equal(classifySafety("POST", "/v2/task/run"), "mutation");
  assert.equal(classifySafety("POST", "/v2/process/terminate"), "destructive");
  assert.equal(classifySafety("POST", "/v2/async-result/cancel?id=7"), "destructive");
  assert.equal(classifySafety("DELETE", "/v2/web-app"), "destructive");
  assert.equal(confirmationPhrase("post", "/v2/process/terminate?pid=41"), "POST PROCESS TERMINATE");
});

test("redacts nested sensitive strings without hiding safe metadata", () => {
  const value = { user: "ops", token: "abc", nested: { privateKey: "pem", hasPrivateKey: true, count: 2 }, credentials: [{ Alias: "web", HasPrivateKey: false }], rows: [{ password: "pw" }] };
  assert.deepEqual(redactSensitive(value), {
    user: "ops",
    token: "••••••••",
    nested: { privateKey: "••••••••", hasPrivateKey: true, count: 2 },
    credentials: [{ Alias: "web", HasPrivateKey: false }],
    rows: [{ password: "••••••••" }],
  });
});

test("client sends bearer authentication and parses JSON", async () => {
  let observed;
  const client = new IrisAdminClient({
    baseUrl: "/api/admin/",
    token: "test-token",
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(await client.request("/info"), { ok: true });
  assert.equal(observed.url, "/api/admin/info");
  assert.equal(observed.options.headers.Authorization, "Bearer test-token");
});

test("default browser fetch keeps its required global receiver", async () => {
  const originalFetch = globalThis.fetch;
  let receiver;
  try {
    globalThis.fetch = function () {
      receiver = this;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };
    const client = new IrisAdminClient();
    assert.deepEqual(await client.request("/info"), { ok: true });
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login does not return a readable token", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({ result: { access_token: "secret-value", refresh_token: "refresh-value" } }), { status: 200 }) });
  const response = await client.login("operator", "password");
  assert.equal(client.token, "secret-value");
  assert.equal(response.result.access_token, "••••••••");
  assert.equal(response.result.refresh_token, "••••••••");
});

test("login rejects a successful response that contains no access token", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({ result: { sub: "operator" } }), { status: 200 }) });
  await assert.rejects(client.login("operator", "password"), /did not return an access token/);
  assert.equal(client.token, "");
});

test("client wraps non-success responses in a redacted typed error", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({ message: "Denied", token: "leak" }), { status: 403 }) });
  await assert.rejects(
    client.request("/v2/security/users"),
    (error) => error instanceof IrisApiError && error.status === 403 && error.payload.token === "••••••••",
  );
});

test("client converts aborted requests to a timeout error", async () => {
  const client = new IrisAdminClient({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
  });
  await assert.rejects(client.request("/slow"), /timed out/);
});

test("client follows IRIS asynchronous task locations and returns the result", async () => {
  const observed = [];
  const responses = [
    new Response(JSON.stringify({ result: { GUID: "task-7" } }), { status: 202, headers: { Location: "/api/admin/v2/async-result?id=task-7" } }),
    new Response(JSON.stringify({ result: { GUID: "task-7", State: "Running" } }), { status: 200 }),
    new Response(JSON.stringify({ result: { GUID: "task-7", State: "Finished", Result: [{ AuditIndex: 4 }] } }), { status: 200 }),
  ];
  const client = new IrisAdminClient({ fetchImpl: async (url) => { observed.push(url); return responses.shift(); } });
  const result = await client.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0 });
  assert.deepEqual(result, [{ AuditIndex: 4 }]);
  assert.deepEqual(observed, ["/api/admin/v2/security/audit/records", "/api/admin/v2/async-result?id=task-7", "/api/admin/v2/async-result?id=task-7"]);
});

test("client rejects cross-origin asynchronous task locations before polling", async () => {
  let calls = 0;
  const client = new IrisAdminClient({
    baseUrl: "https://iris.example/api/admin",
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ result: { GUID: "task-8" } }), { status: 202, headers: { Location: "https://attacker.example/collect" } });
    },
  });
  await assert.rejects(client.requestAsync("/v2/security/audit/records"), /cross-origin/);
  assert.equal(calls, 1);
});

test("async locations reject protocol-relative, backslash and non-HTTP destinations without sending the token", async () => {
  for (const location of ["//outside.example/collect", "/\\outside.example/collect", "javascript:alert(1)"]) {
    let calls = 0;
    const client = new IrisAdminClient({ baseUrl: "https://iris.example/api/admin", token: "test-only", fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 202, headers: { Location: location } });
    } });
    await assert.rejects(client.requestAsync("/v2/security/audit/records"), /unsafe|cross-origin/);
    assert.equal(calls, 1);
  }
});

test("secret containers and numeric secrets are redacted", () => {
  assert.deepEqual(redactSensitive({ tokens: ["test-only"], secret: { value: "test-only" }, password: 123456, HasPrivateKey: true }), {
    tokens: ["••••••••"], secret: { value: "••••••••" }, password: "••••••••", HasPrivateKey: true,
  });
});

test("requests refuse HTTP redirects, including credential-bearing login redirects", async () => {
  const client = new IrisAdminClient({ fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "error");
    throw new TypeError("redirect refused");
  } });
  await assert.rejects(client.login("test-user", "test-only"), /redirect refused/);
});

test("client reports failed and overlong asynchronous tasks", async () => {
  const failedResponses = [
    new Response(JSON.stringify({ result: { GUID: "task-9" } }), { status: 202, headers: { Location: "/api/admin/v2/async-result?id=task-9" } }),
    new Response(JSON.stringify({ result: { State: "Failed", FailureReason: "Audit index unavailable" } }), { status: 200 }),
  ];
  const failedClient = new IrisAdminClient({ fetchImpl: async () => failedResponses.shift() });
  await assert.rejects(failedClient.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0 }), /Audit index unavailable/);

  const queuedClient = new IrisAdminClient({ fetchImpl: async (_url, options) => options.method === "POST"
    ? new Response(JSON.stringify({ result: { GUID: "task-10" } }), { status: 202, headers: { Location: "/api/admin/v2/async-result?id=task-10" } })
    : new Response(JSON.stringify({ result: { State: "Queued" } }), { status: 200 }) });
  await assert.rejects(queuedClient.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0, maxPolls: 2 }), /polling limit/);
});
