import test from "node:test";
import assert from "node:assert/strict";
import { NativeLogClient, nativeLogBase, normalizeNativePage, nativeLogStatus, nativePageNotice } from "../web/assets/native-logs.js";

const location = "http://127.0.0.1:52788/csp/ops/index.html";
const fixture = () => ({ source: "messages", snapshot: "a".repeat(64), nextCursor: "", records: [
  { offset: 0, message: "09/24/26-10:20:30:123 warning PID=41 password=synthetic-private" },
] });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("native logs stay on the selected same-origin IRIS and require remote TLS", () => {
  assert.equal(nativeLogBase("/api/admin", location), "http://127.0.0.1:52788/api/irisops-logs");
  for (const base of ["https://other.invalid/api/admin", "/custom/admin", "//evil.invalid", "/api/admin?token=abc"]) {
    assert.throws(() => nativeLogBase(base, location));
  }
  assert.throws(() => nativeLogBase("/api/admin", "http://iris.example.invalid/csp/ops/"), /HTTPS/);
});

test("native logs authenticate independently and can only request allowlisted pages", async () => {
  const calls = [];
  const client = new NativeLogClient({ adminBase: "/api/admin", pageUrl: location, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return reply(url.endsWith("/login") ? { access_token: "synthetic-native-token" } : { result: fixture() });
  } });
  await client.login("synthetic-user", "synthetic-password");
  await client.page("messages");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, "Bearer synthetic-native-token");
  assert.equal(calls[1].options.method, "GET");
  assert.ok(calls.every(({ url }) => url.startsWith("http://127.0.0.1:52788/api/irisops-logs/")));
  await assert.rejects(client.page("../private"), /Unknown/);
  await assert.rejects(client.page("messages", "?path=private"), /cursor/);
  assert.equal(calls.length, 2);
});

test("late native log pages are discarded after disconnect", async () => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const client = new NativeLogClient({ adminBase: "/api/admin", pageUrl: location,
    fetchImpl: async (url) => url.endsWith("/login") ? reply({ access_token: "synthetic-native-token" }) : gate });
  await client.login("synthetic-user", "synthetic-password");
  const reading = client.page("messages");
  client.close();
  finish(reply({ result: fixture() }));
  await assert.rejects(reading, /connection changed/);
  assert.equal(client.client.token, "");
  assert.equal(client.client.refreshToken, "");
});

test("native reader rejects mismatched, oversized and malformed responses", async () => {
  for (const mutate of [
    (page) => { page.source = "alerts"; },
    (page) => { page.records = Array(151).fill(page.records[0]); },
    (page) => { page.records[0].message = "a".repeat(8193); },
    (page) => { page.records[0].offset = -1; },
    (page) => { page.nextCursor = "?bad"; },
  ]) {
    const page = fixture(); mutate(page);
    const client = new NativeLogClient({ adminBase: "/api/admin", pageUrl: location,
      fetchImpl: async (url) => reply(url.endsWith("/login") ? { access_token: "synthetic-token" } : { result: page }) });
    await client.login("synthetic-user", "synthetic-password");
    await assert.rejects(client.page("messages"), /invalid page/);
  }
});

test("native events preserve unknown timezone and redact before timeline display", () => {
  const [event] = normalizeNativePage(fixture());
  assert.equal(event.time, "2026-09-24 10:20:30.123");
  assert.equal(event.sortTime, null);
  assert.equal(event.severity, "warning");
  assert.equal(event.entity, "PID 41");
  assert.ok(!event.message.includes("synthetic-private"));
  const page = fixture();
  page.records[0].message = "2026-09-24T10:20:30Z routine sample";
  assert.equal(normalizeNativePage(page)[0].sortTime, Date.parse("2026-09-24T10:20:30Z"));
  assert.equal(normalizeNativePage(page)[0].severity, "unknown");
});

test("native log omissions and partial availability are visible", () => {
  assert.match(nativeLogStatus({ status: 403 }), /denied/);
  assert.match(nativeLogStatus({ status: 404 }), /absent/);
  assert.match(nativeLogStatus({ status: 409 }), /changed/);
  assert.match(nativePageNotice({ partial: { incompleteTail: true, oversizedLines: 1 } }), /unfinished.*1 oversized/);
});

test("native IRIS numeric severity and PID take precedence over message wording", () => {
  for (const [code, severity] of [[-2, "info"], [-1, "info"], [0, "info"], [1, "warning"], [2, "critical"], [3, "critical"]]) {
    const page = fixture();
    page.records[0].message = `09/24/26-10:20:30:123 (631) ${code} [Utility.Event] error counter reset to zero`;
    const [event] = normalizeNativePage(page);
    assert.equal(event.severity, severity);
    assert.equal(event.entity, "PID 631");
    assert.equal(event.subsystem, `Utility.Event · IRIS severity ${code}`);
  }
});

test("native pages preserve newest-first byte order without inventing UTC", () => {
  const page = fixture();
  page.records.push({ offset: 80, message: "09/24/26-10:21:30:123 (631) 0 [Utility.Event] Latest" });
  const events = normalizeNativePage(page);
  assert.equal(events[0].correlation, "messages:80");
  assert.equal(events[0].sortTime, null);
  assert.equal(page.records[0].offset, 0);
});
