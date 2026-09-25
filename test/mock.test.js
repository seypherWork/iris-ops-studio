import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { IrisAdminClient, unwrapIrisResult } from "../web/assets/api.js?v=1.2.1";
import { buildRoleResourceMutation, buildUserRoleMutation, buildWebAppAvailabilityMutation, captureVerificationBaseline, evaluatePrecondition, evaluateVerification, inferVerification } from "../web/assets/operations.js";
import { loadRestCatalog, loadRestSpec, summarizeOpenApi } from "../web/assets/rest-discovery.js";

test("mock server serves the portal and representative API operations", async (t) => {
  const child = spawn(process.execPath, ["mock/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());

  const ready = once(child.stdout, "data").then(([chunk]) => {
    const port = Number(chunk.toString().match(/127\.0\.0\.1:(\d+)/)?.[1]);
    if (!port) throw new Error("Mock server did not report its assigned port");
    return port;
  });
  const failed = once(child, "exit").then(([code]) => { throw new Error(`Mock server exited before readiness (${code})`); });
  const port = await Promise.race([ready, failed]);

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /IRIS Ops Studio/);
  const mobileFixture = await fetch(`http://127.0.0.1:${port}/fixtures/mobile-preview.html`);
  assert.equal(mobileFixture.status, 200);
  assert.match(await mobileFixture.text(), /iframe[^>]+src="\.\.\/index\.html#overview"/);
  for (const asset of ["styles.css", "api.js", "sanitization.js", "operations.js", "rest-discovery.js", "app.js"]) {
    const response = await fetch(`http://127.0.0.1:${port}/assets/${asset}`);
    assert.equal(response.status, 200, asset);
  }

  const info = await fetch(`http://127.0.0.1:${port}/api/admin/info`);
  assert.equal(info.status, 200);
  assert.equal((await info.json()).api, "SysAdmin v2");

  const client = new IrisAdminClient({ baseUrl: `http://127.0.0.1:${port}/api/admin`, pollIntervalMs: 0 });
  const login = await client.login("demo-operator", "not-a-real-password");
  assert.equal(client.token, "local-demo-token");
  assert.equal(login.result.access_token, "••••••••");

  const processPayload = await client.request("/v2/processes");
  assert.equal(unwrapIrisResult(processPayload)[0].Pid, 8421);
  assert.equal(unwrapIrisResult(processPayload)[0].CanBeSuspended, true);
  await assert.rejects(client.request("/v2/process/suspend?id=8407", { method: "POST" }), (error) => error.status === 409);

  const databases = unwrapIrisResult(await client.request("/v2/databases"));
  assert.equal(databases[0].Status, "Mounted/RW");
  const devices = unwrapIrisResult(await client.request("/v2/devices"));
  assert.equal(devices[0].Type, "TRM");
  const oauthServers = unwrapIrisResult(await client.request("/v2/security/oauth2/client/server-definitions"));
  assert.equal(oauthServers[0].ID, "auth0-prod");

  const operation = unwrapIrisResult(await client.request("/v2/process/suspend?id=8421", { method: "POST" }));
  assert.equal(operation.accepted, true);
  const readback = unwrapIrisResult(await client.request("/v2/process?id=8421"));
  assert.equal(readback.State, "SUSP");
  await client.request("/v2/process/resume?id=8421", { method: "POST" });
  assert.equal(unwrapIrisResult(await client.request("/v2/process?id=8421")).State, "RUN");

  const taskPlan = captureVerificationBaseline(inferVerification("POST", "/v2/task/run?id=17"), await client.request("/v2/task/info?id=17"));
  await client.request("/v2/task/run?id=17", { method: "POST", body: { RunNow: true } });
  assert.equal(evaluateVerification(taskPlan, await client.request("/v2/task/info?id=17")).status, "verified");

  const userPath = "/v2/security/user?name=IrisOps_TestUser";
  const userBefore = await client.request(userPath);
  const userChange = buildUserRoleMutation(userBefore, "AuditRead", "assign");
  assert.equal(evaluatePrecondition(userChange.precondition, await client.request(userPath)).ok, true);
  await client.request(userPath, { method: "PUT", body: userChange.body });
  assert.equal(evaluateVerification(userChange.verification, await client.request(userPath)).status, "verified");

  const rolePath = "/v2/security/role?name=IrisOps_TestRole";
  const roleBefore = await client.request(rolePath);
  const roleChange = buildRoleResourceMutation(roleBefore, "%Admin_Secure", "RUW", "grant");
  assert.equal(evaluatePrecondition(roleChange.precondition, await client.request(rolePath)).ok, true);
  await client.request(rolePath, { method: "PUT", body: roleChange.body });
  assert.equal(evaluateVerification(roleChange.verification, await client.request(rolePath)).status, "verified");

  const webPath = "/v2/web-app?name=%2Fapi%2FIrisOps_TestWeb";
  const webBefore = await client.request(webPath);
  const webChange = buildWebAppAvailabilityMutation(webBefore, "/api/IrisOps_TestWeb", true);
  assert.equal(evaluatePrecondition(webChange.precondition, await client.request(webPath)).ok, true);
  await client.request(webPath, { method: "PUT", body: webChange.body });
  assert.equal(evaluateVerification(webChange.verification, await client.request(webPath)).status, "verified");
  assert.equal(unwrapIrisResult(await client.request(webPath)).Resource, "%DB_IRISOPS");
  const stalePlan = buildWebAppAvailabilityMutation(await client.request(webPath), "/api/IrisOps_TestWeb", false);
  await client.request(webPath, { method: "PUT", body: { ...stalePlan.body, Enabled: true, Description: "External change" } });
  assert.equal(evaluatePrecondition(stalePlan.precondition, await client.request(webPath)).status, "stale");
  assert.equal(unwrapIrisResult(await client.request(webPath)).Enabled, true);

  const origin = `http://127.0.0.1:${port}`;
  const restCatalog = await loadRestCatalog(fetch, origin);
  assert.equal(restCatalog.entries.length, 2);
  const spec = await loadRestSpec(fetch, origin, restCatalog.entries[0].specPath);
  assert.equal(summarizeOpenApi(spec).total, 2);

  const taskHistory = unwrapIrisResult(await client.request("/v2/task/history?maxRows=10"));
  assert.equal(taskHistory[0].TaskId, 17);

  await client.request("/v2/process/terminate?id=8421", { method: "POST" });
  await assert.rejects(client.request("/v2/process?id=8421"), (error) => error.status === 404);

  const audit = await client.requestAsync("/v2/security/audit/records?maxRows=100", { pollIntervalMs: 0 });
  assert.equal(audit[0].AuditIndex, 7);
});

test("mock can deny one inventory source while leaving peers available", async (t) => {
  const child = spawn(process.execPath, ["mock/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0", MOCK_UNAVAILABLE_ROUTES: "/api/admin/v2/security/resources" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  const port = await Promise.race([
    once(child.stdout, "data").then(([chunk]) => {
      const assigned = Number(chunk.toString().match(/127\.0\.0\.1:(\d+)/)?.[1]);
      if (!assigned) throw new Error("Mock server did not report its assigned port");
      return assigned;
    }),
    once(child, "exit").then(([code]) => { throw new Error(`Mock server exited before readiness (${code})`); }),
  ]);
  const base = `http://127.0.0.1:${port}/api/admin`;
  assert.equal((await fetch(`${base}/v2/security/resources`)).status, 403);
  assert.equal((await fetch(`${base}/v2/security/users`)).status, 200);
  assert.equal((await fetch(`${base}/v2/security/roles`)).status, 200);
});
