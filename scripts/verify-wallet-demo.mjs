import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.IRISOPS_PLAYWRIGHT_MODULE || "playwright");
const server = spawn(process.execPath, ["mock/server.mjs"], {
  env: { ...process.env, PORT: "4179" }, stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const artifacts = path.resolve("artifacts/wallet-demo");
const errors = [], mutations = [];
try {
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw new Error("Preview server did not start"); })]);
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.IRISOPS_BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", () => errors.push("JavaScript exception"));
  page.on("request", (r) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method())) mutations.push(r.method()); });
  await page.goto("http://127.0.0.1:4179/#secrets", { waitUntil: "networkidle" });
  const edit = page.locator('[data-wallet-policy="production-services"]');
  await edit.click();
  await page.locator("#wallet-preview").click();
  await page.getByText("Policy is unchanged", { exact: true }).waitFor();
  assert.ok(await page.locator("#wallet-dialog").isVisible());
  await page.locator("#wallet-use-resource").fill("IrisOps_TestAlternate:R");
  await page.locator("#wallet-preview").click();
  assert.ok(await page.locator("#confirm-submit").isDisabled());
  await page.locator(".toast.show").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(artifacts, "wallet-preview-desktop.png") });
  await page.locator("#confirmation-input").fill(await page.locator("#confirmation-phrase").textContent());
  await page.locator("#confirm-submit").click();
  await page.getByText("Demo operation simulated with verified readback", { exact: true }).waitFor();
  await page.locator("#journal-button").click();
  await page.locator("#timeline-results").getByText(/simulated \/ demo-verified/).first().waitFor();
  await page.locator('[data-view="secrets"]').click();
  await edit.click();
  assert.equal(await page.locator("#wallet-use-resource").inputValue(), "IRISOPS_TESTALTERNATE:READ");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".toast.show").waitFor({ state: "hidden" });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "page overflow");
  for (const selector of ["#wallet-edit-resource", "#wallet-use-resource", "#wallet-preview"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 391, "clipped mobile control");
  }
  await page.screenshot({ path: path.join(artifacts, "wallet-editor-mobile.png") });
  await page.locator('#wallet-dialog [data-close-dialog="wallet-dialog"]').last().click();
  assert.equal(mutations.length, 0, "demo must not send mutations");
  assert.equal(errors.length, 0);
  const result = { mode: "Safe demo only, not real IRIS", unchangedBlocked: true, typedConfirmation: true,
    simulatedReadback: true, viewportDesktop: "1440x900", viewportMobile: "390x844", pageErrors: 0, mutationRequests: 0 };
  await writeFile(path.join(artifacts, "evidence.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.kill();
}
