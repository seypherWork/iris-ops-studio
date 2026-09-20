import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { IrisAdminClient, unwrapIrisResult } from "../web/assets/api.js";

test("mock server serves the portal and representative API operations", async (t) => {
  const port = 43173;
  const child = spawn(process.execPath, ["mock/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());

  const ready = once(child.stdout, "data");
  const failed = once(child, "exit").then(([code]) => { throw new Error(`Mock server exited before readiness (${code})`); });
  await Promise.race([ready, failed]);

  const page = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /IRIS Ops Studio/);

  const info = await fetch(`http://127.0.0.1:${port}/api/admin/info`);
  assert.equal(info.status, 200);
  assert.equal((await info.json()).api, "SysAdmin v2");

  const client = new IrisAdminClient({ baseUrl: `http://127.0.0.1:${port}/api/admin`, pollIntervalMs: 0 });
  const login = await client.login("demo-operator", "not-a-real-password");
  assert.equal(client.token, "local-demo-token");
  assert.equal(login.result.access_token, "••••••••");

  const processPayload = await client.request("/v2/processes");
  assert.equal(unwrapIrisResult(processPayload)[0].Pid, 8421);

  const databases = unwrapIrisResult(await client.request("/v2/databases"));
  assert.equal(databases[0].Status, "Mounted/RW");
  const devices = unwrapIrisResult(await client.request("/v2/devices"));
  assert.equal(devices[0].Type, "TRM");
  const oauthServers = unwrapIrisResult(await client.request("/v2/security/oauth2/client/server-definitions"));
  assert.equal(oauthServers[0].ID, "auth0-prod");

  const operation = unwrapIrisResult(await client.request("/v2/process/suspend?id=2184", { method: "POST" }));
  assert.equal(operation.accepted, true);
  assert.equal(operation.path, "/api/admin/v2/process/suspend?id=2184");

  const audit = await client.requestAsync("/v2/security/audit/records?maxRows=100", { pollIntervalMs: 0 });
  assert.equal(audit[0].AuditIndex, 7);
});
