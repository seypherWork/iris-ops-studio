import test from "node:test";
import assert from "node:assert/strict";
import {
  loadRestCatalog, loadRestSpec, managementOrigin, normalizeRestCatalog,
  safeSpecPath, summarizeOpenApi,
} from "../web/assets/rest-discovery.js";

test("REST discovery runs only beside its own IRIS instance", () => {
  const page = "http://127.0.0.1:52780/csp/ops/index.html";
  assert.equal(managementOrigin("/api/admin", page), "http://127.0.0.1:52780");
  assert.equal(managementOrigin("http://127.0.0.1:52780/api/admin", page), "http://127.0.0.1:52780");
  assert.equal(managementOrigin("http://127.0.0.1:52781/api/admin", page), null);
  assert.equal(managementOrigin("/api/other", page), null);
  assert.equal(managementOrigin("/api/adminevil", page), null);
});

test("REST specification paths refuse cross-origin, traversal, and encoded separators", () => {
  assert.equal(safeSpecPath("/api/mgmnt/v1/%25SYS/spec/api/mgmnt"), "/api/mgmnt/v1/%25SYS/spec/api/mgmnt");
  assert.equal(safeSpecPath("/api/mgmnt/v2/IRISAPP/App.REST"), "/api/mgmnt/v2/IRISAPP/App.REST");
  for (const path of [
    "https://evil.example/api/mgmnt/v2/IRISAPP/App", "//evil.example/api/mgmnt/v2/IRISAPP/App",
    "/api/admin/v2/security/user", "/api/mgmnt/v2/../secrets",
    "/api/mgmnt/v2/%2e%2e/secrets", "/api/mgmnt/v2/IRISAPP%2Fother/App",
    "/api/mgmnt/v2/%252e%252e/secrets", "/api/mgmnt/v2/IRISAPP%252fother/App",
    "/api/mgmnt/v2/%25252e%25252e/secrets",
    "/api/mgmnt/v2/IRISAPP\\other/App", "/api/mgmnt/v2/IRISAPP/App?token=value",
  ]) assert.throws(() => safeSpecPath(path), TypeError);
});

test("REST catalog normalizes both official discovery shapes", () => {
  const legacy = normalizeRestCatalog([{
    name: "/api/app", namespace: "USER", dispatchClass: "App.REST", enabled: true,
    swaggerSpec: "/api/mgmnt/v1/USER/spec/api/app",
  }], "REST web apps");
  const modern = normalizeRestCatalog([{
    name: "App", namespace: "USER", dispatchClass: "App.REST", webApplications: "/api/app",
    swaggerSpec: "/api/mgmnt/v2/USER/App",
  }], "REST services");
  assert.equal(legacy[0].webApplications, "/api/app");
  assert.equal(modern[0].specPath, "/api/mgmnt/v2/USER/App");
  assert.equal(normalizeRestCatalog([{ name: "unsafe", swaggerSpec: "https://evil.example/spec" }], "REST services")[0].specPath, "");
  assert.throws(() => normalizeRestCatalog({}, "REST services"), /array/);
});

test("REST discovery reads only fixed same-origin GET endpoints and degrades per source", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/mgmnt/v2/")) return { ok: false, status: 403 };
    return { ok: true, text: async () => JSON.stringify([{
      name: "/api/app", namespace: "USER", swaggerSpec: "/api/mgmnt/v1/USER/spec/api/app",
    }]) };
  };
  const result = await loadRestCatalog(fetchImpl, "http://127.0.0.1:52780");
  assert.equal(result.entries.length, 1);
  assert.match(result.status[1], /permission denied/);
  assert.deepEqual(requests.map((request) => request.url), [
    "http://127.0.0.1:52780/api/mgmnt/", "http://127.0.0.1:52780/api/mgmnt/v2/",
  ]);
  assert.ok(requests.every(({ options }) => options.method === "GET" && options.credentials === "same-origin" && options.redirect === "error" && !options.headers.Authorization));
});

test("OpenAPI inspection is documentation-only and limits rendered operations", async () => {
  const fetchImpl = async (_url, options) => {
    assert.equal(options.method, "GET");
    return { ok: true, text: async () => JSON.stringify({ info: { title: "App API", version: "2" }, paths: {
      "/status": { get: { summary: "Read status" } },
      "/jobs": { post: { summary: "Create job" }, delete: { summary: "Delete job" } },
    } }) };
  };
  const spec = await loadRestSpec(fetchImpl, "http://127.0.0.1:52780", "/api/mgmnt/v2/USER/App");
  const summary = summarizeOpenApi(spec, 2);
  assert.equal(summary.title, "App API");
  assert.equal(summary.total, 3);
  assert.equal(summary.operations.length, 2);
  assert.throws(() => summarizeOpenApi({ info: {} }), /paths/);
});
