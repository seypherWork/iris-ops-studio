import test from "node:test";
import assert from "node:assert/strict";
import { buildWebAppAvailabilityMutation } from "../web/assets/operations.js";
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
  redactSensitiveText,
  resolveApiUrl,
  resolveServerLocation,
  unwrapIrisResult,
} from "../web/assets/api.js?v=1.2.1";

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
  for (const disguised of ["/https://attacker.example/collect", "/http://attacker.example/collect", "/ https://attacker.example/collect", "/\thttps://attacker.example/collect"]) {
    assert.throws(() => resolveApiUrl("https://iris.example/api/admin", disguised), /unsafe|cross-origin/);
  }
  assert.equal(appendQuery("/v2/process/suspend", { id: 41 }), "/v2/process/suspend?id=41");
  assert.equal(appendQuery("/v2/tasks?maxRows=20", { filter: "READ WRITE" }), "/v2/tasks?maxRows=20&filter=READ+WRITE");
  assert.deepEqual(unwrapIrisResult({ status: {}, result: [{ Id: 1 }] }), [{ Id: 1 }]);
});

test("classifies read, mutation, and destructive operations", () => {
  assert.equal(classifySafety("GET", "/v2/processes"), "read");
  assert.equal(classifySafety("POST", "/v2/security/audit/records"), "read");
  assert.equal(classifySafety("POST", "/v2/task/run?id=17&note=/security/audit/records"), "mutation");
  assert.equal(classifySafety("POST", "/v2/security/audit/records/other"), "mutation");
  assert.equal(classifySafety("POST", "/v2/security/audit/records?maxRows=20"), "read");
  assert.equal(classifySafety("POST", "/v2/task/run"), "mutation");
  assert.equal(classifySafety("POST", "/v2/process/terminate"), "destructive");
  assert.equal(classifySafety("POST", "/v2/async-result/cancel?id=7"), "destructive");
  assert.equal(classifySafety("DELETE", "/v2/web-app"), "destructive");
  assert.equal(confirmationPhrase("post", "/v2/process/terminate?pid=41"), "POST PROCESS TERMINATE");
  assert.notEqual(confirmationPhrase("POST", "/v2/task/run?id=1000"), confirmationPhrase("POST", "/v2/task/run?id=2000"));
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

test("redacts credential-shaped text embedded in otherwise safe messages", () => {
  const safe = redactSensitiveText("Denied Bearer abc.def access_token=top-secret password:guess eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvcHMifQ.signature");
  assert.doesNotMatch(safe, /abc\.def|top-secret|guess|eyJhbGci/);
  assert.match(safe, /\[REDACTED\]/);
  assert.doesNotMatch(redactSensitiveText("client_secret=FAKE-ONLY auth_header=FAKE-HEADER"), /FAKE-ONLY|FAKE-HEADER/);
});

test("API keys and authorization headers are redacted before an explorer response can be copied", async () => {
  const client = new IrisAdminClient({
    token: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ result: {
      ApiKey: "FAKE-KEY-123", Authorization: "Basic FAKE-BASE64", ClientSecret: "FAKE-SECRET",
    } }), { status: 200 }),
  });
  const response = await client.request("/v2/example");
  assert.deepEqual(response.result, {
    ApiKey: "••••••••", Authorization: "••••••••", ClientSecret: "••••••••",
  });
  assert.doesNotMatch(redactSensitiveText("Authorization: Basic FAKE-BASE64"), /FAKE-BASE64/);
});

test("client sends bearer authentication, refreshes an expired token, and parses JSON", async () => {
  const observed = [];
  const client = new IrisAdminClient({
    baseUrl: "/api/admin/",
    token: "expired-token",
    refreshToken: "refresh-one",
    fetchImpl: async (url, options) => {
      observed.push({ url, options });
      if (url === "/api/admin/info" && observed.length === 1) {
        return new Response(JSON.stringify({ message: "Expired" }), { status: 401 });
      }
      if (url === "/api/admin/refresh") {
        assert.equal(options.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(options.body), { refresh_token: "refresh-one", grant_type: "refresh_token" });
        return new Response(JSON.stringify({ result: { access_token: "renewed-token", refresh_token: "refresh-two" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(await client.request("/info"), { ok: true });
  assert.deepEqual(observed.map(({ url }) => url), ["/api/admin/info", "/api/admin/refresh", "/api/admin/info"]);
  assert.equal(observed[0].options.headers.Authorization, "Bearer expired-token");
  assert.equal(observed[2].options.headers.Authorization, "Bearer renewed-token");
  assert.equal(client.token, "renewed-token");
  assert.equal(client.refreshToken, "refresh-two");
});

test("relative-base async polling renews the token without changing origins", async () => {
  const calls = [];
  const client = new IrisAdminClient({ baseUrl: "/api/admin", token: "FAKE-EXPIRED", refreshToken: "FAKE-REFRESH", fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method });
    if (url.endsWith("/v2/security/audit/records")) {
      const accepted = new Response(JSON.stringify({ result: { GUID: "fake-job" } }), {
        status: 202, headers: { Location: "/api/admin/v2/async-result?id=fake-job" },
      });
      Object.defineProperty(accepted, "url", { value: "https://iris.example/api/admin/v2/security/audit/records" });
      return accepted;
    }
    if (url.endsWith("/refresh")) return new Response(JSON.stringify({ result: { access_token: "FAKE-NEW", refresh_token: "FAKE-NEW-REFRESH" } }));
    if (url.includes("/async-result")) return calls.filter((call) => call.url.includes("/async-result")).length === 1
      ? new Response(JSON.stringify({ message: "Expired" }), { status: 401 })
      : new Response(JSON.stringify({ result: { State: "finished", Result: [{ AuditIndex: 1 }] } }));
    throw new Error(`Unexpected URL: ${url}`);
  } });
  assert.deepEqual(await client.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0 }), [{ AuditIndex: 1 }]);
  assert.ok(calls.some((call) => call.url === "/api/admin/refresh"));
  assert.equal(calls.length, 4);
});

test("official structured errors retain a redacted useful summary", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({
    status: { summary: "Missing test privilege; client_secret=FAKE-ONLY", Errors: ["More test detail"] },
  }), { status: 403 }) });
  await assert.rejects(client.request("/v2/task/info?id=1000"), (error) => {
    assert.match(error.message, /Missing test privilege/);
    assert.doesNotMatch(error.message, /FAKE-ONLY/);
    return true;
  });
});

test("guided web-app updates never write redacted configuration values", async () => {
  const appName = "/api/IrisOps_TestWeb";
  const response = { result: {
    NameSpace: "USER", IsNameSpaceDefault: false, Enabled: true,
    ChangePasswordPage: "change-page.csp", JWTAccessTokenTimeout: 120,
    Description: "Disposable fixture",
  } };
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify(response)) });
  const path = `/v2/web-app?name=${encodeURIComponent(appName)}`;
  const display = await client.request(path);
  assert.equal(display.result.ChangePasswordPage, "••••••••");
  assert.throws(() => buildWebAppAvailabilityMutation(display, appName, false), /redacted/);
  const internal = await client.request(path, { redactResponse: false });
  const plan = buildWebAppAvailabilityMutation(internal, appName, false);
  assert.equal(plan.body.ChangePasswordPage, "change-page.csp");
  assert.equal(plan.body.JWTAccessTokenTimeout, 120);
  assert.equal(plan.body.Enabled, false);
});

test("client refuses disguised absolute targets before fetch can receive a token", async () => {
  let calls = 0;
  const client = new IrisAdminClient({
    baseUrl: "https://iris.example/api/admin",
    token: "must-not-leak",
    fetchImpl: async () => { calls += 1; return new Response("{}"); },
  });
  await assert.rejects(client.request("/https://attacker.example/collect"), /unsafe|cross-origin/);
  await assert.rejects(client.request("https://attacker.example/collect", { resolvedUrl: true }), /cross-origin/);
  assert.equal(calls, 0);
});

test("changing an instance without an explicit token clears the previous credential", async () => {
  const client = new IrisAdminClient({ baseUrl: "https://one.example/api/admin", token: "old-token", refreshToken: "old-refresh", fetchImpl: async () => new Response("{}") });
  client.setConnection({ baseUrl: "https://two.example/api/admin" });
  assert.equal(client.token, "");
  assert.equal(client.refreshToken, "");
  await assert.rejects(
    client.refreshAccessToken({ baseUrl: "https://one.example/api/admin", expectedRevision: 0 }),
    /connection changed/,
  );

  let refreshClient;
  refreshClient = new IrisAdminClient({
    baseUrl: "https://old.example/api/admin",
    token: "expired-token",
    refreshToken: "old-refresh",
    fetchImpl: async (url) => {
      if (url.endsWith("/refresh")) {
        refreshClient.setConnection({ baseUrl: "https://new.example/api/admin", token: "new-session-token" });
        return new Response(JSON.stringify({ result: { access_token: "stale-token", refresh_token: "stale-refresh" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "Expired" }), { status: 401 });
    },
  });
  await assert.rejects(refreshClient.request("/v2/processes"), /connection changed/);
  assert.equal(refreshClient.baseUrl, "https://new.example/api/admin");
  assert.equal(refreshClient.token, "new-session-token");
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
  assert.equal(client.refreshToken, "refresh-value");
  assert.equal(response.result.access_token, "••••••••");
  assert.equal(response.result.refresh_token, "••••••••");
});

test("login rejects a successful response that contains no access token", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({ result: { sub: "operator" } }), { status: 200 }) });
  await assert.rejects(client.login("operator", "password"), /did not return an access token/);
  assert.equal(client.token, "");
});

test("login cannot install a token after the selected connection changes", async () => {
  let client;
  client = new IrisAdminClient({
    baseUrl: "https://old.example/api/admin",
    fetchImpl: async () => {
      client.setConnection({ baseUrl: "https://new.example/api/admin", token: "NEW_TOKEN" });
      return new Response(JSON.stringify({ result: { access_token: "OLD_TOKEN" } }), { status: 200 });
    },
  });
  await assert.rejects(client.login("operator", "password"), /connection changed/);
  assert.equal(client.baseUrl, "https://new.example/api/admin");
  assert.equal(client.token, "NEW_TOKEN");
});

test("client wraps non-success responses in a redacted typed error", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response(JSON.stringify({ message: "Denied", token: "leak" }), { status: 403 }) });
  await assert.rejects(
    client.request("/v2/security/users"),
    (error) => error instanceof IrisApiError && error.status === 403 && error.payload.token === "••••••••",
  );
});

test("client redacts credentials embedded in a server error message", async () => {
  const client = new IrisAdminClient({ fetchImpl: async () => new Response("Denied Bearer server-secret; access_token=also-secret", { status: 403 }) });
  await assert.rejects(client.request("/v2/security/users"), (error) => {
    assert.ok(error instanceof IrisApiError);
    assert.doesNotMatch(error.message, /server-secret|also-secret/);
    assert.doesNotMatch(error.payload.message, /server-secret|also-secret/);
    return true;
  });
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

test("relative-base async polling accepts the browser's absolute response URL on the same origin", async () => {
  const observed = [];
  const accepted = new Response(JSON.stringify({ result: { GUID: "task-browser" } }), {
    status: 202,
    headers: { Location: "/api/admin/v2/async-result?id=task-browser" },
  });
  Object.defineProperty(accepted, "url", { value: "https://iris.example/api/admin/v2/security/audit/records" });
  const responses = [
    accepted,
    new Response(JSON.stringify({ result: { State: "Finished", Result: ["ok"] } }), { status: 200 }),
  ];
  const client = new IrisAdminClient({ baseUrl: "/api/admin", token: "same-origin-token", fetchImpl: async (url) => {
    observed.push(url);
    return responses.shift();
  } });
  assert.deepEqual(await client.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0 }), ["ok"]);
  assert.deepEqual(observed, [
    "/api/admin/v2/security/audit/records",
    "https://iris.example/api/admin/v2/async-result?id=task-browser",
  ]);
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

test("connection changes cancel async polling without reusing a token on another instance", async () => {
  const observed = [];
  let client;
  client = new IrisAdminClient({
    baseUrl: "https://old.example/api/admin",
    token: "OLD_TOKEN",
    fetchImpl: async (url, options) => {
      observed.push({ url, authorization: options.headers.Authorization });
      if (observed.length === 1) {
        return new Response(JSON.stringify({ result: { GUID: "task-race" } }), {
          status: 202,
          headers: { Location: "https://old.example/api/admin/v2/async-result?id=task-race" },
        });
      }
      client.setConnection({ baseUrl: "https://new.example/api/admin", token: "NEW_TOKEN" });
      return new Response(JSON.stringify({ result: { State: "Finished", Result: "stale-result" } }), { status: 200 });
    },
  });
  await assert.rejects(
    client.requestAsync("/v2/security/audit/records", { pollIntervalMs: 0, maxPolls: 3 }),
    /connection changed|polling was canceled/i,
  );
  assert.equal(observed.length, 2);
  assert.ok(observed.every((request) => request.url.startsWith("https://old.example/")));
  assert.ok(observed.every((request) => request.authorization === "Bearer OLD_TOKEN"));
});

test("connection changes cancel an async request immediately after acceptance", async () => {
  let client;
  let calls = 0;
  client = new IrisAdminClient({
    baseUrl: "https://old.example/api/admin",
    token: "OLD_TOKEN",
    fetchImpl: async () => {
      calls += 1;
      client.setConnection({ baseUrl: "https://new.example/api/admin", token: "NEW_TOKEN" });
      return new Response(JSON.stringify({ result: { GUID: "old-task" } }), { status: 202 });
    },
  });
  await assert.rejects(client.requestAsync("/v2/security/audit/records"), /connection changed/);
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
