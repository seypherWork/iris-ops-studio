import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoleResourceMutation,
  buildUserRoleMutation,
  captureVerificationBaseline,
  createJournalEntry,
  evaluatePrecondition,
  evaluateVerification,
  filterTimeline,
  inferVerification,
  mergeTimeline,
  normalizeAuditRecords,
  normalizeJournalEntries,
  normalizePermissions,
  normalizeTaskHistory,
  normalizeUtcTimestamp,
  reconcileUserSummary,
  reconcileWebAppSummary,
  reconcileTaskSummary,
  redactOperationPath,
} from "../web/assets/operations.js";

test("user-role plans preserve documented fields and discard response-only data", () => {
  assert.deepEqual(
    reconcileUserSummary(
      { name: "_SYSTEM", enabled: false, namespace: "" },
      { result: { Enabled: true, NameSpace: "%SYS" } },
    ),
    { name: "_SYSTEM", enabled: true, namespace: "%SYS" },
  );
  assert.equal(reconcileUserSummary({ name: "operator", enabled: false }, null).enabled, "Unknown");
  assert.deepEqual(
    reconcileWebAppSummary(
      { name: "/api/admin", enabled: false, namespace: "" },
      { result: { Enabled: true, NameSpace: "%SYS", DispatchClass: "%Api.Admin", Resource: "%Development" } },
    ),
    { name: "/api/admin", enabled: true, namespace: "%SYS", dispatch: "%Api.Admin", resource: "%Development" },
  );
  assert.equal(reconcileWebAppSummary({ name: "/csp/ops", enabled: false }, null).enabled, "Unknown");
  assert.deepEqual(
    reconcileTaskSummary({ id: 1000, status: "Ready", lastResult: "" }, { result: { Suspended: true, LastFinished: "2026-09-22 18:00:00" } }),
    { id: 1000, status: "Suspended", lastResult: "2026-09-22 18:00:00" },
  );
  assert.equal(reconcileTaskSummary({ id: 1000, status: "Ready" }, null).status, "Unknown");
  assert.equal(reconcileTaskSummary({ id: 1000, status: "Ready" }, { result: { Suspended: "false" } }).status, "Unknown");

  const change = buildUserRoleMutation({
    result: { Name: "operator", Enabled: true, NameSpace: "USER", Roles: ["AuditRead"], token: "must-not-survive" },
  }, "AppRuntime", "assign");
  assert.equal(change.changed, true);
  assert.deepEqual(change.body, { Enabled: true, NameSpace: "USER", Roles: ["AuditRead", "AppRuntime"] });
  assert.deepEqual(change.verification.expectedValues, ["AppRuntime", "AuditRead"]);
  assert.equal("Name" in change.body, false);
  assert.equal("token" in change.body, false);
});

test("user-role plans detect no-op grants and build revocations", () => {
  const user = { Roles: ["AuditRead", "AppRuntime"] };
  assert.equal(buildUserRoleMutation(user, "AppRuntime", "assign").changed, false);
  const revoke = buildUserRoleMutation(user, "AppRuntime", "revoke");
  assert.equal(revoke.changed, true);
  assert.deepEqual(revoke.body.Roles, ["AuditRead"]);
  assert.equal(evaluateVerification(revoke.verification, { result: revoke.body }).status, "verified");
});

test("access mutation plans fail closed on incomplete or ambiguous readbacks", () => {
  assert.throws(() => buildUserRoleMutation({}, "AuditRead", "assign"), /Roles must be an array/);
  assert.throws(() => buildUserRoleMutation({ Roles: "AuditRead,AppRuntime" }, "AuditRead", "assign"), /array/);
  assert.throws(() => buildUserRoleMutation({ Roles: ["AuditRead", "AuditRead"] }, "AppRuntime", "assign"), /duplicates/);
  assert.throws(() => buildRoleResourceMutation({}, "%DB_APP", "R", "grant"), /Resources must be an array/);
  assert.throws(() => buildRoleResourceMutation({ Resources: [{ Name: "%DB_APP", Permissions: "read" }] }, "%DB_APP", "R", "grant"), /only R, W, and U/);
  assert.throws(() => normalizePermissions("read"), /only R, W, and U/);
});

test("role-resource plans normalize permissions and preserve unrelated grants", () => {
  const change = buildRoleResourceMutation({
    Description: "Application role",
    Resources: [{ Name: "%DB_APP", Permissions: "R" }, { Name: "%Admin_Operate", Permissions: "R" }],
    CreatedBy: "_SYSTEM",
  }, "%Admin_Operate", "uwr", "grant");
  assert.equal(change.changed, true);
  assert.equal(normalizePermissions("uwr"), "RWU");
  assert.deepEqual(change.body.Resources, [
    { Name: "%DB_APP", Permissions: "R" },
    { Name: "%Admin_Operate", Permissions: "RWU" },
  ]);
  assert.equal("CreatedBy" in change.body, false);
  assert.equal(evaluateVerification(change.verification, { result: change.body }).status, "verified");
});

test("role-resource revocation verifies absence", () => {
  const change = buildRoleResourceMutation({ Resources: [{ Name: "%DB_APP", Permissions: "RW" }] }, "%DB_APP", "R", "revoke");
  assert.deepEqual(change.body.Resources, []);
  assert.equal(evaluateVerification(change.verification, { result: change.body }).status, "verified");
});

test("access verification rejects collateral loss outside the requested grant", () => {
  const userChange = buildUserRoleMutation({ Roles: ["AuditRead"] }, "AppRuntime", "assign");
  assert.equal(evaluateVerification(userChange.verification, { result: { Roles: ["AppRuntime"] } }).status, "mismatch");

  const roleChange = buildRoleResourceMutation({
    Resources: [{ Name: "%DB_APP", Permissions: "R" }, { Name: "%Admin_Operate", Permissions: "R" }],
  }, "%Admin_Operate", "RW", "grant");
  assert.equal(evaluateVerification(roleChange.verification, {
    result: { Resources: [{ Name: "%Admin_Operate", Permissions: "RW" }] },
  }).status, "mismatch");
});

test("access preconditions allow harmless ordering changes and block stale state", () => {
  const userChange = buildUserRoleMutation({ Enabled: true, Roles: ["AuditRead", "AppRuntime"], EscalationRoles: [] }, "%DB_USER", "assign");
  assert.equal(evaluatePrecondition(userChange.precondition, { result: { Enabled: true, Roles: ["AppRuntime", "AuditRead"], EscalationRoles: [] } }).status, "current");
  assert.equal(evaluatePrecondition(userChange.precondition, { result: { Enabled: false, Roles: ["AuditRead", "AppRuntime"], EscalationRoles: [] } }).status, "stale");

  const roleChange = buildRoleResourceMutation({ Resources: [{ Name: "B", Permissions: "W" }, { Name: "A", Permissions: "R" }] }, "C", "U", "grant");
  assert.equal(evaluatePrecondition(roleChange.precondition, { result: { Resources: [{ Name: "A", Permissions: "R" }, { Name: "B", Permissions: "W" }] } }).ok, true);
  assert.equal(evaluatePrecondition(roleChange.precondition, { result: { Resources: [{ Name: "A", Permissions: "R" }] } }).status, "stale");
  assert.equal(evaluatePrecondition(null, {}).status, "invalid");
  assert.equal(evaluatePrecondition(roleChange.precondition, { result: { Resources: "invalid" } }).status, "invalid");
});

test("known process and task operations receive deterministic readback plans", () => {
  assert.deepEqual(inferVerification("POST", "/v2/process/suspend?id=41"), {
    kind: "processState",
    readPath: "/v2/process?id=41",
    state: "suspended",
    description: "Process state is suspended",
  });
  assert.equal(inferVerification("POST", "/v2/process/terminate?id=41").kind, "notFound");
  assert.equal(inferVerification("POST", "/v2/task/resume?id=17").value, false);
  assert.equal(inferVerification("PUT", "/v2/web-app"), null);
});

test("process and task readbacks distinguish verified and mismatched states", () => {
  const suspend = inferVerification("POST", "/v2/process/suspend?id=41");
  assert.equal(evaluateVerification(suspend, { result: { State: "SUSP" } }).status, "verified");
  assert.equal(evaluateVerification(suspend, { result: { State: "RUN" } }).status, "mismatch");
  const terminate = inferVerification("POST", "/v2/process/terminate?id=41");
  assert.equal(evaluateVerification(terminate, null, { status: 404 }).status, "verified");
  assert.equal(evaluateVerification(terminate, { result: { State: "RUN" } }).status, "mismatch");
  const task = inferVerification("POST", "/v2/task/suspend?id=17");
  assert.equal(evaluateVerification(task, { result: { Suspended: true } }).status, "verified");
});

test("task execution verification compares readback timestamps", () => {
  const plan = captureVerificationBaseline(
    inferVerification("POST", "/v2/task/run?id=17"),
    { result: { LastStarted: "2026-09-21 01:00:00", LastFinished: "2026-09-21 01:00:10" } },
  );
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:08" } }).status, "verified");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 01:00:10", Status: "-1", Error: "" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:01", Status: "-1", Error: "" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 01:00:10", Status: "-3", Error: "Password=must-not-leak" } }).status, "error");
  assert.doesNotMatch(evaluateVerification(plan, { result: { Status: "-3", Error: "Bearer must-not-leak" } }).summary, /must-not-leak/);
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 01:00:00", LastFinished: "2026-09-21 01:00:10" } }).status, "mismatch");
});

test("UTC audit timestamps are normalized independently of the browser timezone", () => {
  assert.equal(normalizeUtcTimestamp("2026-09-21 03:00:00.000"), "2026-09-21T03:00:00.000Z");
  const [event] = normalizeAuditRecords({ result: [{ AuditIndex: 1, UTCTimeStamp: "2026-09-21 03:00:00.000" }] });
  assert.equal(event.time, "2026-09-21T03:00:00.000Z");
  assert.equal(event.timeBasis, "UTC");
});

test("timeline normalizes audit, task, and operation-journal sources", () => {
  const audit = normalizeAuditRecords({ result: [{ AuditIndex: 9, UTCTimeStamp: "2026-09-21T03:00:00Z", EventType: "%Security", EventSource: "%System", Description: "Login denied", Username: "operator", Namespace: "%SYS" }] });
  const tasks = normalizeTaskHistory({ result: [{ TaskId: 17, Name: "Backup", Completed: "2026-09-21T02:00:00Z", Status: "Completed", Result: "Success", Username: "SYSTEM" }] });
  const journal = normalizeJournalEntries([createJournalEntry({ id: "OP-1", time: "2026-09-21T04:00:00Z", method: "POST", path: "/v2/task/run?id=17", label: "Run task", target: "Task 17", resultStatus: "executed", verificationStatus: "verified", verificationSummary: "Timestamp changed", durationMs: 23 })]);
  const events = mergeTimeline(audit, tasks, journal);
  assert.equal(events.length, 3);
  assert.equal(events[0].source, "Ops Studio");
  assert.equal(audit[0].severity, "critical");
  assert.equal(tasks[0].correlation, "TASK-17");
});

test("timeline filters across source, severity, and free-text correlation", () => {
  const events = [
    { source: "Audit", severity: "critical", subsystem: "Security", entity: "%SYS", actor: "operator", message: "Login denied", correlation: "AUD-9" },
    { source: "Tasks", severity: "info", subsystem: "Task manager", entity: "Backup #17", actor: "SYSTEM", message: "Success", correlation: "TASK-17" },
  ];
  assert.equal(filterTimeline(events, { source: "Audit" }).length, 1);
  assert.equal(filterTimeline(events, { severity: "info" })[0].source, "Tasks");
  assert.equal(filterTimeline(events, { query: "task-17" })[0].entity, "Backup #17");
});

test("operation journal paths redact secret-bearing query parameters", () => {
  assert.equal(redactOperationPath("/v2/custom?id=7&access_token=secret&name=demo"), "/v2/custom?id=7&access_token=REDACTED&name=demo");
  const entry = createJournalEntry({ method: "POST", path: "/v2/custom?password=secret", resultStatus: "executed", verificationStatus: "unverified" });
  assert.equal(entry.path, "/v2/custom?password=REDACTED");
  assert.doesNotMatch(entry.label, /secret/);
});

test("operation journal records connection context and redacts free-text credentials", () => {
  const [event] = normalizeJournalEntries([createJournalEntry({
    id: "OP-LIVE",
    method: "PUT",
    path: "/v2/custom",
    label: "Update credential",
    target: "Role Demo",
    resultStatus: "failed",
    verificationStatus: "not-run",
    verificationSummary: "Denied Bearer live-token; access_token=second-token",
    mode: "live",
    instance: "https://iris.example/api/admin",
    actor: "operator",
  })]);
  assert.match(event.subsystem, /Live · https:\/\/iris\.example\/api\/admin/);
  assert.equal(event.actor, "operator");
  assert.doesNotMatch(event.detail, /live-token|second-token/);
});
