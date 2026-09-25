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
const base = `http://127.0.0.1:${port}/csp/ops/index.html`;
const password = randomBytes(32).toString("base64url") + "aA1!";
const fixtureUser = "IrisOps_TestUser";
const fixtureRole = "IrisOps_TestRole";
const artifactDir = path.resolve(container.includes("-r3-candidate-") ? "artifacts/native-logs-121-r3-candidate"
  : container.includes("-candidate-") ? "artifacts/native-logs-121-candidate"
  : container.includes("-final-") ? "artifacts/native-logs-final" : "artifacts/native-logs");
await mkdir(artifactDir, { recursive: true });

function terminal(lines) {
  try {
    return execFileSync(docker, ["exec", "-i", container, "iris", "session", "IRIS", "-U", "%SYS"], {
      input: [...lines, "halt", ""].join("\n"), encoding: "utf8", stdio: "pipe", timeout: 30000,
    });
  } catch {
    throw new Error("Disposable IRIS terminal check failed; no credential output retained");
  }
}

const identity = execFileSync(docker, ["inspect", "--format", "{{.Config.Hostname}}", container], { encoding: "utf8" }).trim();
assert.equal(identity, container.includes("-candidate-") ? "iris-ops-candidate" : "iris-ops-native-logs");
const exists = terminal([
  `write "FIXTURES=",##class(Security.Users).Exists("${fixtureUser}"),##class(Security.Roles).Exists("${fixtureRole}"),!`,
]);
assert.match(exists, /FIXTURES=00/);
let fixtures = false;
let browser;
const failures = [];
const evidence = [];
try {
  fixtures = true;
  const created = terminal([
    `set sc=##class(Security.Roles).Create("${fixtureRole}","Disposable browser validation","%Admin_Operate:U,%DB_IRISOPS:R","")`,
    'if sc\'=1 write "FIXTURE_FAILED",! halt',
    `set sc=##class(Security.Users).Create("${fixtureUser}","${fixtureRole}","${password}","Disposable browser validation","USER","","",0,1)`,
    'if sc\'=1 write "FIXTURE_FAILED",! halt',
    'do ##class(%SYS.System).WriteToConsoleLog("IRISOPS_VALIDATION password=SYNTHETIC-REDACTION-CHECK")',
    'write "FIXTURE_READY",!',
  ]);
  assert.ok(created.includes("FIXTURE_READY") && !created.includes("FIXTURE_FAILED"), "fixture creation failed");
  browser = await chromium.launch({ headless: true, executablePath: process.env.IRISOPS_BROWSER_EXECUTABLE || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", () => failures.push("browser JavaScript exception"));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#connection-button").click();
  await page.locator("#demo-mode").uncheck();
  await page.locator("#native-logs-mode").check();
  await page.locator("#username").fill(fixtureUser);
  await page.locator("#password").fill(password);
  await page.locator("#connect-submit").click();
  await page.waitForFunction(() => document.querySelector("#mode-label")?.textContent === "Live IRIS");
  assert.equal(await page.locator("#password").inputValue(), "");
  await page.locator('[data-view="logs"]').click();
  await page.locator(".native-log-source").first().waitFor();
  assert.equal(await page.locator(".native-log-source").count(), 3);
  for (const card of await page.locator(".native-log-source").all()) {
    assert.match(await card.textContent(), /\d+ records loaded/);
  }
  evidence.push("live login and three native log sources visible");
  await page.locator("#timeline-source").selectOption("Messages");
  await page.locator("#timeline-query").fill("IRISOPS_VALIDATION");
  await page.locator("#timeline-results tbody tr").first().waitFor();
  assert.ok(!(await page.locator("#content").textContent()).includes("SYNTHETIC-REDACTION-CHECK"));
  assert.match(await page.locator("#timeline-results").textContent(), /REDACTED/);
  evidence.push("synthetic log credential redacted in live timeline");
  await page.locator("#timeline-query").fill("");
  let firstRecord = await page.locator("#timeline-results .correlation").first().textContent();
  terminal(['do ##class(%SYS.System).WriteToConsoleLog("IRISOPS_PAGINATION_CHANGED")']);
  await page.locator('[data-native-older="messages"]').click();
  await page.getByText("Source changed — refresh latest page", { exact: true }).waitFor();
  assert.equal(await page.locator("#timeline-results .correlation").count(), 0);
  await page.locator('[data-native-latest="messages"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#timeline-results .correlation").length > 0);
  firstRecord = await page.locator("#timeline-results .correlation").first().textContent();
  evidence.push("real log append invalidates the old snapshot visibly; Latest recovers");
  await page.screenshot({ path: path.join(artifactDir, "native-logs-live-desktop.png"), fullPage: false });
  const older = page.locator('[data-native-older="messages"]');
  assert.ok(await older.isEnabled());
  await older.click();
  await page.waitForFunction((previous) => {
    const current = document.querySelector("#timeline-results .correlation");
    return current && current.textContent !== previous;
  }, firstRecord);
  evidence.push("older native page changes the source records");
  await page.locator('[data-native-latest="messages"]').click();
  await page.waitForFunction((expected) => document.querySelector("#timeline-results .correlation")?.textContent === expected, firstRecord);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".toast.show").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(artifactDir, "native-logs-live-mobile.png"), fullPage: false });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile page overflow");
  const nativeCard = page.locator(".native-log-source").first();
  await nativeCard.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.screenshot({ path: path.join(artifactDir, "native-logs-mobile-controls.png"), fullPage: false });
  for (const button of await nativeCard.locator("button").all()) {
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 391, "mobile native log control clipped");
  }
  evidence.push("390x844 page and native controls remain within viewport");
  await page.locator('[data-open-connection]').filter({ visible: true }).first().click();
  await page.locator("#demo-mode").check();
  await page.locator("#connect-submit").click();
  await page.waitForFunction(() => document.querySelector("#mode-label")?.textContent === "Safe demo");
  await page.locator(".native-log-source").first().waitFor();
  assert.ok(!(await page.locator("#timeline-results").textContent()).includes("IRISOPS_VALIDATION"));
  assert.ok(await page.locator('[data-native-older="messages"]').isDisabled());
  evidence.push("switching to Safe demo discards live log pages and disables paging");
  assert.equal(failures.length, 0);
  await writeFile(path.join(artifactDir, "browser-evidence.json"), JSON.stringify({ evidence, pageErrors: failures.length }, null, 2));
  console.log(JSON.stringify({ evidence, pageErrors: failures.length }));
} finally {
  await browser?.close();
  if (fixtures) {
    const cleanup = terminal([
      `if ##class(Security.Users).Exists("${fixtureUser}") do ##class(Security.Users).Delete("${fixtureUser}")`,
      `if ##class(Security.Roles).Exists("${fixtureRole}") do ##class(Security.Roles).Delete("${fixtureRole}")`,
      `write "FIXTURES=",##class(Security.Users).Exists("${fixtureUser}"),##class(Security.Roles).Exists("${fixtureRole}"),!`,
    ]);
    assert.match(cleanup, /FIXTURES=00/, "disposable fixture cleanup failed");
    console.log("PASS disposable browser account and role removed");
  }
}
