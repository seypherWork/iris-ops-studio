import test from "node:test";
import assert from "node:assert/strict";
import { IrisAdminClient } from "../web/assets/api.js?v=1.1.0";
import {
  catalogSelectionValue,
  explorerOutcomeLabel,
  methodAcceptsBody,
  prepareExplorerRequest,
  verifiedJournalCount,
} from "../web/assets/explorer.js";

test("explorer keeps catalog selection aligned with method and path", () => {
  assert.equal(catalogSelectionValue("GET", "/info"), "GET|/info");
  assert.equal(catalogSelectionValue("get", "/v2/process?id=41"), "GET|/v2/process");
  assert.equal(catalogSelectionValue("PUT", "/v2/web-app"), "");
  assert.equal(catalogSelectionValue("GET", "/v2/does-not-exist"), "");
});

test("GET and HEAD never carry an explorer JSON body", () => {
  assert.equal(methodAcceptsBody("GET"), false);
  assert.equal(methodAcceptsBody("head"), false);
  assert.equal(methodAcceptsBody("POST"), true);
  assert.deepEqual(prepareExplorerRequest({
    method: "GET", path: "/info", rawBody: '{"probe":true}', demo: true,
  }), { method: "GET", path: "/info", body: undefined });
  assert.deepEqual(prepareExplorerRequest({
    method: "HEAD", path: "/info", rawBody: "{bad json", demo: false,
  }), { method: "HEAD", path: "/info", body: undefined });
});

test("explorer rejects unsafe destinations and unsupported demo requests", () => {
  assert.throws(() => prepareExplorerRequest({ method: "GET", path: "/v2/does-not-exist", demo: true }), /not simulated/);
  assert.throws(() => prepareExplorerRequest({ method: "GET", path: "https://example.invalid/", demo: true }), /cross-origin/);
  assert.throws(() => prepareExplorerRequest({ method: "GET", path: "https://example.invalid/", demo: false }), /cross-origin/);
  assert.throws(() => prepareExplorerRequest({ method: "GET", path: "//example.invalid/", demo: true }), /unsafe|cross-origin/);
  assert.throws(() => prepareExplorerRequest({ method: "POST", path: "/v2/task", demo: true }), /not simulated/);
  assert.deepEqual(prepareExplorerRequest({ method: "GET", path: "/info?x=1", demo: true }), {
    method: "GET", path: "/info?x=1", body: undefined,
  });
  assert.deepEqual(prepareExplorerRequest({ method: "GET", path: "https://iris.example/api/admin/info", baseUrl: "https://iris.example/api/admin", demo: true }), {
    method: "GET", path: "https://iris.example/api/admin/info", body: undefined,
  });
  assert.deepEqual(prepareExplorerRequest({ method: "GET", path: "/v2/does-not-exist", demo: false }), {
    method: "GET", path: "/v2/does-not-exist", body: undefined,
  });
});

test("explorer parses JSON only for body-capable methods and rejects malformed JSON", () => {
  assert.deepEqual(prepareExplorerRequest({ method: "POST", path: "/v2/security/audit/records", rawBody: '{"probe":true}', demo: true }), {
    method: "POST", path: "/v2/security/audit/records", body: { probe: true },
  });
  assert.throws(() => prepareExplorerRequest({ method: "POST", path: "/v2/security/audit/records", rawBody: "{bad json", demo: true }), /valid JSON/);
});

test("API client refuses accidental bodies on GET and HEAD before fetch", async () => {
  let calls = 0;
  const client = new IrisAdminClient({ fetchImpl: async () => { calls += 1; return new Response("{}"); } });
  await assert.rejects(client.request("/info", { method: "GET", body: { probe: true } }), /cannot include a body/);
  await assert.rejects(client.request("/info", { method: "HEAD", body: {} }), /cannot include a body/);
  assert.equal(calls, 0);
  await client.request("/info");
  assert.equal(calls, 1);
});

test("explorer distinguishes simulated, read, verified and unverified outcomes", () => {
  assert.equal(explorerOutcomeLabel({ demo: true, safety: "read", verificationStatus: "not-required" }), "Simulated request");
  assert.equal(explorerOutcomeLabel({ demo: false, safety: "read", verificationStatus: "not-required" }), "Read complete");
  assert.equal(explorerOutcomeLabel({ demo: false, safety: "mutation", verificationStatus: "verified" }), "Verified change");
  assert.equal(explorerOutcomeLabel({ demo: false, safety: "mutation", verificationStatus: "mismatch" }), "Change sent; not verified");
  assert.equal(verifiedJournalCount([{ verificationStatus: "verified" }, { verificationStatus: "demo-verified" }, { verificationStatus: "unverified" }]), 2);
});
