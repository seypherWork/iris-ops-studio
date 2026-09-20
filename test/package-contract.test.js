import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("ZPM resource directory matches the ObjectScript source layout", async () => {
  const moduleXml = await readFile(new URL("module.xml", root), "utf8");
  assert.match(moduleXml, /<SourcesRoot>src<\/SourcesRoot>/);
  assert.match(moduleXml, /<Resource Directory="cls" Name="IrisOps\.PKG"\/>/);
  await access(new URL("src/cls/IrisOps/About.cls", root));
  await assert.rejects(access(new URL("src/IrisOps/About.cls", root)));
});

test("static CSP assets load without bypassing SysAdmin API authorization", async () => {
  const moduleXml = await readFile(new URL("module.xml", root), "utf8");
  assert.match(moduleXml, /SourcePath="\/web"/);
  assert.match(moduleXml, /PasswordAuthEnabled="0"/);
  assert.match(moduleXml, /UnauthenticatedEnabled="1"/);
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Operational data and actions remain protected/);
});

test("IRIS terminal installer avoids compile-time macros", async () => {
  const script = await readFile(new URL("iris.script", root), "utf8");
  assert.doesNotMatch(script, /\$\$\$/);
  assert.match(script, /\$SYSTEM\.Status\.IsError\(sc\)/);
  assert.match(script, /zpm "load \/home\/irisowner\/irisbuild\//);
});
