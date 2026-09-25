// Restricted to disposable local containers; random credentials never leave memory.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IRISOPS_PLAYWRIGHT_MODULE || "playwright");
const docker = process.env.IRISOPS_DOCKER_EXECUTABLE || "docker";
const container = process.env.IRISOPS_TEST_CONTAINER || "iris-ops-native-logs-20260924";
const port = process.env.IRISOPS_TEST_PORT || "52788";
const allowedTargets = new Map([
  ["iris-ops-native-logs-20260924", "52788"],
  ["iris-ops-native-logs-final-20260924", "52789"],
  ["iris-ops-121-candidate-20260925", "52790"],
  ["iris-ops-121-r3-candidate-20260925", "52791"],
]);
assert.equal(allowedTargets.get(container), port, "Refusing an unlisted disposable container or port");
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(32).toString("base64url") + "aA1!";
const user = "IrisOps_TestUser", role = "IrisOps_TestRole", wallet = "IrisOps_TestWallet";
const resources = ["IrisOps_TestEdit", "IrisOps_TestUse", "IrisOps_TestAlternate"];
const initial = { EditResource: resources[0] + ":WRITE", UseResource: resources[1] + ":READ" };
const proposed = { ...initial, UseResource: resources[2] + ":READ" };
const endpoint = `/api/admin/v2/wallet/collection?name=${wallet}`;
const artifactDir = path.resolve(container.includes("-r3-candidate-") ? "artifacts/wallet-policy-121-r3-candidate"
  : container.includes("-candidate-") ? "artifacts/wallet-policy-121-candidate"
  : container.includes("-final-") ? "artifacts/wallet-policy-final" : "artifacts/wallet-policy");
await mkdir(artifactDir, { recursive: true });
function terminal(lines) {
  try {
    return execFileSync(docker, ["exec", "-i", container, "iris", "session", "IRIS", "-U", "%SYS"], {
      input: [...lines, "halt", ""].join("\n"), encoding: "utf8", stdio: "pipe", timeout: 30000,
    });
  } catch { throw new Error("Disposable IRIS terminal failed; credential output not retained"); }
}
const existsCommands = [
  `write "ACCOUNT=",##class(Security.Users).Exists("${user}"),##class(Security.Roles).Exists("${role}"),!`,
  `write "WALLET=",##class(%Wallet.Collection).Exists("${wallet}"),!`,
  ...resources.map((name, i) => `write "RESOURCE${i}=",##class(Security.Resources).Exists("${name}"),!`),
];
function absent(output) {
  assert.match(output, /ACCOUNT=00/);
  assert.match(output, /WALLET=0/);
  for (let i = 0; i < resources.length; i++) assert.match(output, new RegExp(`RESOURCE${i}=0`));
}
assert.equal(execFileSync(docker, ["inspect", "--format", "{{.Config.Hostname}}", container], { encoding: "utf8" }).trim(),
  container.includes("-candidate-") ? "iris-ops-candidate" : "iris-ops-native-logs");
absent(terminal(existsCommands));
const assertStatus = 'if sc\'=1 write "FIXTURE_FAILED",! halt';
let ownsFixtures = false, browser;
const evidence = [], errors = [], walletRequests = [];
try {
  ownsFixtures = true;
  const created = terminal([
    ...resources.flatMap((name) => [`set sc=##class(Security.Resources).Create("${name}","Disposable wallet validation","")`, assertStatus]),
    `set sc=##class(Security.Roles).Create("${role}","Disposable wallet validation","%Admin_Wallet:U,%DB_IRISOPS:R","")`, assertStatus,
    `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable wallet validation","USER","","",0,1)`, assertStatus,
    `set props("EditResource")="${initial.EditResource}",props("UseResource")="${initial.UseResource}"`,
    `set sc=##class(%Wallet.Collection).Create("${wallet}",.props)`, assertStatus,
    'write "FIXTURE_READY",!',
  ]);
  assert.ok(created.includes("FIXTURE_READY") && !created.includes("FIXTURE_FAILED"), "fixture creation failed");
  browser = await chromium.launch({ headless: true, executablePath: process.env.IRISOPS_BROWSER_EXECUTABLE || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Independent API observer for readback and deliberate test-only concurrent changes.
  const login = await context.request.post(origin + "/api/admin/login", { data: { user, password } });
  assert.equal(login.status(), 200, "wallet-only operator login");
  const auth = await login.json();
  const token = (auth.result || auth).access_token;
  assert.ok(typeof token === "string" && token.length > 0);
  const headers = { Authorization: "Bearer " + token };
  async function policy() {
    const response = await context.request.get(origin + endpoint, { headers });
    assert.equal(response.status(), 200, "independent collection read");
    const json = await response.json();
    return json.result || json;
  }
  function same(actual, expected) {
    for (const key of ["EditResource", "UseResource"]) assert.equal(actual[key]?.toUpperCase(), expected[key].toUpperCase(), `${key} independent readback`);
  }
  async function setPolicy(body) {
    const response = await context.request.put(origin + endpoint, { headers, data: body });
    assert.equal(response.status(), 200, "test-only concurrent change/restore");
    same(await policy(), body);
  }
  same(await policy(), initial);
  evidence.push("real collection exposes both documented resource fields");
  const page = await context.newPage();
  page.on("pageerror", () => errors.push("browser JavaScript exception"));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/admin/v2/wallet/")) {
      walletRequests.push({ path: new URL(request.url()).pathname, method: request.method() });
    }
  });
  await page.goto(origin + "/csp/ops/index.html#secrets", { waitUntil: "networkidle" });
  await page.locator("#connection-button").click();
  await page.locator("#demo-mode").uncheck();
  await page.locator("#native-logs-mode").uncheck();
  await page.locator("#username").fill(user);
  await page.locator("#password").fill(password);
  await page.locator("#connect-submit").click();
  await page.waitForFunction(() => document.querySelector("#mode-label")?.textContent === "Live IRIS");
  assert.equal(await page.locator("#password").inputValue(), "");
  await page.locator('[data-view="secrets"]').click();
  const edit = page.locator(`[data-wallet-policy="${wallet}"]`);
  await edit.waitFor();
  async function preview() {
    await edit.click();
    await page.locator("#wallet-use-resource").fill(proposed.UseResource);
    await page.locator("#wallet-preview").click();
    await page.locator("#confirm-dialog").waitFor({ state: "visible" });
    assert.ok(await page.locator("#confirm-submit").isDisabled());
  }
  async function confirm() {
    await page.locator("#confirmation-input").fill(await page.locator("#confirmation-phrase").textContent());
    await page.locator("#confirm-submit").click();
  }
  await edit.click();
  await page.locator('#wallet-dialog [data-close-dialog="wallet-dialog"]').last().click();
  assert.equal(walletRequests.filter((r) => r.method === "PUT").length, 0);
  evidence.push("cancel closes live wallet editor without PUT");
  await edit.click();
  await page.locator("#wallet-use-resource").fill("*");
  await page.locator("#wallet-preview").click();
  assert.ok(await page.locator("#wallet-dialog").isVisible());
  assert.equal(walletRequests.filter((r) => r.method === "PUT").length, 0);
  await page.locator('#wallet-dialog [data-close-dialog="wallet-dialog"]').last().click();
  evidence.push("wildcard policy rejected before confirmation and PUT");
  await preview();
  await setPolicy({ ...initial, EditResource: resources[2] + ":WRITE" });
  await confirm();
  await page.getByText("Target changed after preview; reopen the operation and review the new state", { exact: true }).waitFor();
  assert.equal(walletRequests.filter((r) => r.method === "PUT").length, 0, "stale preview sent PUT");
  same(await policy(), { ...initial, EditResource: resources[2] + ":WRITE" });
  await setPolicy(initial);
  evidence.push("real concurrent policy change blocks stale preview with zero browser PUTs");
  await preview();
  await page.screenshot({ path: path.join(artifactDir, "wallet-preview-desktop.png") });
  await confirm();
  await page.getByText("Operation executed and readback verified", { exact: true }).waitFor();
  same(await policy(), proposed);
  assert.equal(walletRequests.filter((r) => r.method === "PUT").length, 1);
  await page.locator("#journal-button").click();
  await page.locator("#timeline-results").getByText(/executed \/ verified/).first().waitFor();
  evidence.push("live PUT followed by verified readback and independent API verification");
  await page.locator('[data-view="secrets"]').click();
  await edit.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await edit.click();
  assert.equal(await page.locator('#wallet-dialog [aria-label="Close wallet policy"]').textContent(), "×");
  assert.match(await page.locator('#wallet-dialog label').first().textContent(), /Edit secrets — resource:permission/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile page overflow");
  for (const selector of ["#wallet-edit-resource", "#wallet-use-resource", "#wallet-preview"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 391, "wallet control clipped");
  }
  await page.screenshot({ path: path.join(artifactDir, "wallet-editor-mobile.png") });
  evidence.push("390x844 wallet dialog controls fit and remain accessible");
  await page.locator('#wallet-dialog [data-close-dialog="wallet-dialog"]').last().click();
  await setPolicy(initial);
  evidence.push("original disposable collection policy restored and reread");
  assert.equal(walletRequests.some((r) => r.path.includes("/wallet/secret")), false);
  assert.equal(errors.length, 0);
  // Remove the test privilege, issue fresh credentials, and prove server denial.
  await context.close();
  const restricted = terminal([
    `set sc=##class(Security.Users).Delete("${user}")`, assertStatus,
    `set sc=##class(Security.Roles).Delete("${role}")`, assertStatus,
    `set sc=##class(Security.Roles).Create("${role}","Disposable restricted wallet validation","%DB_IRISOPS:R","")`, assertStatus,
    `set sc=##class(Security.Users).Create("${user}","${role}","${password}","Disposable restricted wallet validation","USER","","",0,1)`, assertStatus,
    'write "RESTRICTED_READY",!',
  ]);
  assert.ok(restricted.includes("RESTRICTED_READY") && !restricted.includes("FIXTURE_FAILED"));
  const restrictedContext = await browser.newContext();
  const restrictedLogin = await restrictedContext.request.post(origin + "/api/admin/login", { data: { user, password } });
  assert.equal(restrictedLogin.status(), 200);
  const restrictedAuth = await restrictedLogin.json();
  const restrictedHeaders = { Authorization: "Bearer " + (restrictedAuth.result || restrictedAuth).access_token };
  for (const method of ["GET", "PUT"]) {
    const response = await restrictedContext.request.fetch(origin + endpoint, { method, headers: restrictedHeaders, ...(method === "PUT" ? { data: proposed } : {}) });
    assert.equal(response.status(), 403, `restricted ${method} must be rejected by IRIS`);
  }
  await restrictedContext.close();
  evidence.push("IRIS rejects collection GET and PUT without Admin_Wallet privilege");
  await writeFile(path.join(artifactDir, "browser-evidence.json"), JSON.stringify({ evidence, pageErrors: errors.length, secretValueRequests: 0 }, null, 2));
  console.log(JSON.stringify({ evidence, pageErrors: errors.length, secretValueRequests: 0 }));
} finally {
  await browser?.close();
  if (ownsFixtures) {
    const cleaned = terminal([
      `if ##class(%Wallet.Collection).Exists("${wallet}") do ##class(%Wallet.Collection).Delete("${wallet}")`,
      `if ##class(Security.Users).Exists("${user}") do ##class(Security.Users).Delete("${user}")`,
      `if ##class(Security.Roles).Exists("${role}") do ##class(Security.Roles).Delete("${role}")`,
      ...resources.map((name) => `if ##class(Security.Resources).Exists("${name}") do ##class(Security.Resources).Delete("${name}")`),
      ...existsCommands,
    ]);
    absent(cleaned);
    console.log("PASS disposable wallet, user, role and three resources removed");
  }
}
