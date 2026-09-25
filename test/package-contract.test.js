import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("ZPM resource directory matches the ObjectScript source layout", async () => {
  const moduleXml = await readFile(new URL("module.xml", root), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const aboutClass = await readFile(new URL("src/cls/IrisOps/About.cls", root), "utf8");
  const ciWorkflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
  const compose = await readFile(new URL("compose.yaml", root), "utf8");
  const dockerfile = await readFile(new URL("Dockerfile", root), "utf8");
  assert.match(moduleXml, /<SourcesRoot>src<\/SourcesRoot>/);
  assert.match(moduleXml, /<Resource Directory="cls" Name="IrisOps\.PKG"\/>/);
  assert.equal(packageJson.version, "1.2.1");
  assert.equal(packageJson.engines.node, ">=22");
  assert.match(moduleXml, /<Version>1\.2\.1<\/Version>/);
  assert.match(aboutClass, /Quit "1\.2\.1"/);
  assert.match(ciWorkflow, /node: \[22, 24\]/);
  assert.match(compose, /ISC_DATA_DIRECTORY:\s*\/durable\/iris/);
  assert.match(compose, /iris-data:\/durable/);
  assert.match(compose, /hostname:\s*iris-ops-studio/);
  assert.match(dockerfile, /mkdir -p \/durable\/iris && chown -R 51773:51773 \/durable/);
  assert.match(dockerfile, /ENTRYPOINT \["\/tini", "--", "\/iris-main"\]/);
  assert.match(dockerfile, /CMD \["--ISCAgent", "false"\]/);
  await access(new URL("src/cls/IrisOps/About.cls", root));
  await access(new URL("web/assets/operations.js", root));
  await access(new URL("web/assets/sanitization.js", root));
  await assert.rejects(access(new URL("src/IrisOps/About.cls", root)));
});

test("static CSP assets load without bypassing SysAdmin API authorization", async () => {
  const moduleXml = await readFile(new URL("module.xml", root), "utf8");
  assert.match(moduleXml, /<WebApplication [^>]*Name="\/csp\/ops"/);
  assert.match(moduleXml, /AutheEnabled="64"/);
  assert.match(moduleXml, /<WebApplication [^>]*ServeFiles="1" ServeFilesTimeout="0"/);
  assert.match(moduleXml, /MatchRoles=":\{\$globalsDbRole\}"/);
  assert.match(moduleXml, /<FileCopy Name="\/web\/" Target="\$\{cspdir\}ops\/"\/>/);
  assert.doesNotMatch(moduleXml, /<CSPApplication|\{\$dbrole\}|\$\{dbrole\}/);
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /SysAdmin data and actions remain protected/);
  assert.match(readme, /optional `\/api\/irisops-logs` endpoint has independent/);
});

test("IRIS terminal installer avoids compile-time macros", async () => {
  const script = await readFile(new URL("iris.script", root), "utf8");
  assert.doesNotMatch(script, /\$\$\$/);
  assert.match(script, /\$SYSTEM\.Status\.IsError\(sc\)/);
  assert.match(script, /zpm "load \/home\/irisowner\/irisbuild\//);
});

test("native log reader remains installed after durable manager migration", async () => {
  const logApi = await readFile(new URL("src/cls/IrisOps/LogApi.cls", root), "utf8");
  assert.match(logApi, /\$System\.Util\.ManagerDirectory\(\),\$System\.Util\.InstallDirectory\(\)/);
  assert.match(logApi, /os\.path\.join\(install, "mgr", "irisops", "python", "irisops_logs\.py"\)/);
});
