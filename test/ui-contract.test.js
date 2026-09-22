import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../web/", import.meta.url);

test("HTML exposes unique controls and safe dialog actions", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Every element ID must be unique");
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.match(html, /class="ghost mobile-only" data-open-connection>Connection<\/button>/);
  assert.equal((html.match(/type="button" data-close-dialog=/g) || []).length, 4);
  assert.equal((html.match(/type="submit"/g) || []).length, 2);
  assert.match(html, /id="confirm-submit"[^>]+disabled/);
  assert.match(html, /assets\/styles\.css\?v=1\.1\.0/);
});

test("responsive CSS preserves mobile navigation, connection, and dialog access", async () => {
  const css = await readFile(new URL("assets/styles.css", root), "utf8");
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.shell \{ display: block; \}/);
  assert.match(css, /nav \{ display: flex;[^}]+overflow-x: auto;/);
  assert.match(css, /\.mobile-only \{ display: inline-flex; \}/);
  assert.match(css, /dialog \{ width: calc\(100vw - 22px\); \}/);
  assert.match(css, /max-height: calc\(100vh - 22px\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*min-width:\s*[1-9]\d{3}px/);
});

test("live security tables cannot enlarge the page grid", async () => {
  const css = await readFile(new URL("assets/styles.css", root), "utf8");
  assert.match(css, /\.shell \{[^}]*grid-template-columns: 246px minmax\(0, 1fr\)/);
  assert.match(css, /\.content \{[^}]*width: 100%/);
  assert.match(css, /\.tabbed-cards \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.access-workflows \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.table-wrap \{ overflow-x: auto; \}/);
});

test("public QA fixture renders the portal at the target mobile viewport", async () => {
  const fixture = await readFile(new URL("../test/fixtures/mobile-preview.html", root), "utf8");
  assert.match(fixture, /width: 390px/);
  assert.match(fixture, /height: 844px/);
  assert.match(fixture, /src="\.\.\/index\.html#overview"/);
});

test("interaction bindings cover mobile connection and dialog cleanup", async () => {
  const app = await readFile(new URL("assets/app.js", root), "utf8");
  assert.match(app, /\$\$\('\[data-open-connection\]'\)/);
  assert.match(app, /\$\$\('\[data-close-dialog\]'\)/);
  assert.match(app, /connection-dialog"\)\.addEventListener\("close"/);
  assert.match(app, /confirm-dialog"\)\.addEventListener\("close"/);
  assert.match(app, /finally\s*\{\s*\$\("#password"\)\.value = "";/);
  assert.match(app, /executeExplorerRequest\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(app, /addEventListener\("hashchange"/);
  assert.match(app, /\/v2\/task\/resume/);
  assert.match(app, /\/v2\/process\/resume/);
  assert.match(app, /revision !== state\.renderRevision/);
  assert.match(app, /if \(submit\.disabled\) return/);
  assert.match(app, /const previousConnection = \{[\s\S]*baseUrl: state\.client\.baseUrl,[\s\S]*token: state\.client\.token,[\s\S]*refreshToken: state\.client\.refreshToken,[\s\S]*\};/);
  assert.match(app, /state\.client\.setConnection\(previousConnection\)/);
  assert.match(app, /aria-current/);
  assert.match(app, /renderInfrastructure/);
  assert.match(app, /renderOAuth/);
  assert.match(app, /\/v2\/databases/);
  assert.match(app, /\/v2\/devices/);
  assert.match(app, /\/v2\/security\/oauth2\/client\/server-definitions/);
  assert.match(app, /CanBeSuspended/);
  assert.match(app, /CanBeTerminated/);
  assert.match(app, /row\.canSuspend === true/);
  assert.match(app, /row\.canTerminate === true/);
  assert.match(app, /reconcileUserSummary/);
  assert.match(app, /appendQuery\("\/v2\/security\/user", \{ name: user\.name \}\)/);
  assert.match(app, /reconcileWebAppSummary/);
  assert.match(app, /appendQuery\("\/v2\/web-app", \{ name: webapp\.name \}\)/);
});

test("navigation exposes every mandatory management area", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const view of ["overview", "processes", "infrastructure", "logs", "tasks", "access", "webapps", "secrets", "oauth", "explorer"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
});

test("explorer exposes named controls and honest demo and error states", async () => {
  const app = await readFile(new URL("assets/app.js", root), "utf8");
  assert.match(app, /aria-label="HTTP method"/);
  assert.match(app, /aria-label="API request path"/);
  assert.match(app, /Custom endpoint/);
  assert.match(app, /prepareExplorerRequest\(/);
  assert.match(app, /prepareExplorerRequest\(\{ method, path, baseUrl: state\.client\.baseUrl, demo: state\.demo \}\)/);
  assert.match(app, /response-status"\)\.textContent = "Invalid request"/);
  assert.match(app, /no request is sent to IRIS/);
});

test("verified operations and incident timeline expose their reviewer controls", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("assets/app.js", root), "utf8"),
    readFile(new URL("assets/styles.css", root), "utf8"),
  ]);
  assert.match(html, /id="journal-button"/);
  assert.match(html, /id="journal-count"/);
  assert.match(html, /Execute &amp; verify/);
  assert.match(app, /Incident Timeline/);
  assert.match(app, /data-access-action="assign-role"/);
  assert.match(app, /data-access-action="revoke-resource"/);
  assert.match(app, /verifyOperation/);
  assert.match(app, /evaluatePrecondition/);
  assert.match(app, /resultStatus: "blocked"/);
  assert.match(app, /connectionContext/);
  assert.match(app, /operation\.verification\?\.kind === "taskRun"/);
  const runOperation = app.slice(app.indexOf("async function runOperation"), app.indexOf("async function navigate"));
  assert.ok(runOperation.indexOf("evaluatePrecondition") < runOperation.indexOf("await state.client.request(path"));
  assert.match(app, /normalizeJournalEntries/);
  assert.match(css, /\.timeline-controls/);
  assert.match(css, /\.operation-flow/);
  assert.match(css, /\.access-workflows/);
});
