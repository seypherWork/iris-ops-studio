import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../web/", import.meta.url);

test("HTML exposes unique controls and safe dialog actions", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Every element ID must be unique");
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.match(html, /class="ghost mobile-only" data-open-connection/);
  assert.equal((html.match(/type="button" data-close-dialog=/g) || []).length, 4);
  assert.equal((html.match(/type="submit"/g) || []).length, 2);
  assert.match(html, /id="confirm-submit"[^>]+disabled/);
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
  assert.match(app, /revision !== state\.renderRevision/);
  assert.match(app, /if \(submit\.disabled\) return/);
  assert.match(app, /aria-current/);
  assert.match(app, /renderInfrastructure/);
  assert.match(app, /renderOAuth/);
  assert.match(app, /\/v2\/databases/);
  assert.match(app, /\/v2\/devices/);
  assert.match(app, /\/v2\/security\/oauth2\/client\/server-definitions/);
});

test("navigation exposes every mandatory management area", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const view of ["overview", "processes", "infrastructure", "logs", "tasks", "access", "webapps", "secrets", "oauth", "explorer"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
});
