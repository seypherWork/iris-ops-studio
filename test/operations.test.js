import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoleResourceMutation,
  buildUserRoleMutation,
  buildWebAppAvailabilityMutation,
  captureProcessPrecondition,
  captureVerificationBaseline,
  createJournalEntry,
  evaluatePrecondition,
  evaluateVerification,
  filterTimeline,
  inferVerification,
  isProtectedUser,
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
  sameOperationContext,
  verificationPollPolicy,
  webAppGuidedEligibility,
} from "../web/assets/operations.js";

test("task runs allow the documented scheduler delay without slowing other readbacks", () => {
  assert.deepEqual(verificationPollPolicy("taskRun"), { attempts: 75, intervalMs: 1000 });
  assert.deepEqual(verificationPollPolicy("taskSuspended"), { attempts: 6, intervalMs: 500 });
  assert.deepEqual(verificationPollPolicy("taskRun", true), { attempts: 1, intervalMs: 0 });
});

test("guided user-role workflow excludes all built-in and installer identities", () => {
  for (const name of ["Admin", "CSPSystem", "IAM", "SuperUser", "UnknownUser", "_PUBLIC", "_SYSTEM", "_Ensemble", "irisowner"]) {
    assert.equal(isProtectedUser(name), true, name);
  }
  assert.equal(isProtectedUser("IrisOps_TestUser"), false);
});

test("incident normalization avoids false alarms and redacts credential-shaped text", () => {
  const audit = normalizeAuditRecords({ result: [
    { AuditIndex: 1, Description: "Create section Map.USER Global EnsAlert", Username: "operator", EventType: "%System" },
    { AuditIndex: 2, Description: "login failure password=honey-audit", Username: "operator", EventType: "%Security" },
  ] });
  const tasks = normalizeTaskHistory({ result: [
    { TaskId: 9, Name: "Purge errors and log files", Result: "Create Purge errors and log files" },
    { TaskId: 10, Name: "Validate", Result: "Failed token=honey-task", ErrNumber: 1 },
  ] });
  assert.equal(audit[0].severity, "info");
  assert.equal(audit[1].severity, "critical");
  assert.doesNotMatch(audit[1].message, /honey-audit/);
  assert.equal(tasks[0].severity, "info");
  assert.equal(tasks[1].severity, "critical");
  assert.doesNotMatch(tasks[1].message, /honey-task/);
});

test("guided web-app change preserves documented configuration and verifies the whole readback", () => {
  const before = { result: {
    NameSpace: "IRISAPP", IsNameSpaceDefault: false, Enabled: true,
    DispatchClass: "IrisOps.Test.REST", Resource: "%DB_IRISOPS", Description: "Test service",
    CorsAllowlist: ["https://example.test"], MatchRoles: [{ MatchRole: "", TargetRoles: ["IrisOps_TestRole"] }],
  } };
  const plan = buildWebAppAvailabilityMutation(before, "/api/IrisOps_TestWeb", false);
  assert.equal(plan.changed, true);
  assert.equal(plan.body.Enabled, false);
  assert.equal(plan.body.Description, "Test service");
  assert.deepEqual(plan.body.CorsAllowlist, ["https://example.test"]);
  assert.equal("Name" in plan.body, false);
  assert.equal(evaluatePrecondition(plan.precondition, before).status, "current");
  assert.equal(evaluateVerification(plan.verification, { result: { ...before.result, Enabled: false } }).status, "verified");
  assert.equal(evaluateVerification(plan.verification, { result: { ...before.result, Enabled: false, Resource: "" } }).status, "mismatch");
  assert.equal(evaluateVerification(plan.verification, { result: { ...before.result, Name: "/api/another", Enabled: false } }).status, "mismatch");
});

test("guided web-app change blocks stale, incomplete, protected, or ambiguous state", () => {
  const detail = { Name: "/api/IrisOps_TestWeb", NameSpace: "IRISAPP", IsNameSpaceDefault: false, Enabled: false, Resource: "%DB_IRISOPS" };
  const plan = buildWebAppAvailabilityMutation(detail, detail.Name, true);
  assert.equal(evaluatePrecondition(plan.precondition, { result: { ...detail, Resource: "%DB_OTHER" } }).status, "stale");
  assert.equal(evaluatePrecondition(plan.precondition, { result: { ...detail, Enabled: "false" } }).status, "invalid");
  assert.equal(evaluatePrecondition(plan.precondition, { result: { ...detail, Name: "/api/another" } }).status, "invalid");
  assert.equal(buildWebAppAvailabilityMutation(detail, detail.Name, false).changed, false);
  assert.throws(() => buildWebAppAvailabilityMutation(detail, "/api/other", true), /does not match/);
  assert.equal(buildWebAppAvailabilityMutation({ ...detail, Name: undefined }, detail.Name, true).changed, true);
  assert.throws(() => buildWebAppAvailabilityMutation({ ...detail, IsNameSpaceDefault: true }, detail.Name, true), /inventory-only/);
  assert.throws(() => buildWebAppAvailabilityMutation({ ...detail, IsNameSpaceDefault: undefined }, detail.Name, true), /default status is required/);
  assert.throws(() => buildWebAppAvailabilityMutation({ Enabled: false, IsNameSpaceDefault: false }, detail.Name, true), /NameSpace is required/);
  assert.throws(() => buildWebAppAvailabilityMutation({ ...detail, Undocumented: "value" }, detail.Name, true), /outside the documented/);
  assert.throws(() => buildWebAppAvailabilityMutation({ ...detail, ChangePasswordPage: "••••••••" }, detail.Name, true), /redacted/);
  assert.throws(() => buildWebAppAvailabilityMutation({ ...detail, MatchRoles: [{ TargetRoles: ["[REDACTED]"] }] }, detail.Name, true), /redacted/);
  assert.equal(webAppGuidedEligibility("/api/admin", "IRISAPP").ok, false);
  assert.equal(webAppGuidedEligibility("/csp/ops", "IRISAPP").ok, false);
  assert.equal(webAppGuidedEligibility("/api/irisops-logs", "IRISAPP", false).ok, false);
  assert.equal(webAppGuidedEligibility("/api/%61dmin", "IRISAPP").ok, false);
  assert.equal(webAppGuidedEligibility("/api/../admin", "IRISAPP").ok, false);
  assert.equal(webAppGuidedEligibility("/api/IrisOps_TestWeb", "%SYS").ok, false);
  assert.equal(webAppGuidedEligibility("/csp/user", "USER", true).ok, false);
  assert.equal(webAppGuidedEligibility("/api/IrisOps_TestWeb", "IRISAPP").ok, false);
  assert.equal(webAppGuidedEligibility("/api/IrisOps_TestWeb", "IRISAPP", false).ok, true);
});

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
      { result: { Enabled: true, IsNameSpaceDefault: false, NameSpace: "%SYS", DispatchClass: "%Api.Admin", Resource: "%Development" } },
    ),
    { name: "/api/admin", enabled: true, isDefault: false, namespace: "%SYS", dispatch: "%Api.Admin", resource: "%Development" },
  );
  assert.equal(reconcileWebAppSummary({ name: "/csp/ops", enabled: false }, null).enabled, "Unknown");
  assert.equal(reconcileWebAppSummary({ name: "/csp/user" }, { result: { Enabled: true, IsNameSpaceDefault: true } }).isDefault, true);
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
  assert.throws(() => buildUserRoleMutation({ Roles: [], HOTPKeyDisplay: "••••••••" }, "AuditRead", "assign"), /redacted/);
  assert.throws(() => buildRoleResourceMutation({ Description: "[REDACTED]", Resources: [] }, "%DB_APP", "R", "grant"), /redacted/);
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

  const completeUser = buildUserRoleMutation({ Enabled: true, NameSpace: "USER", Roles: ["Base"], EscalationRoles: [] }, "Extra", "assign");
  assert.equal(evaluateVerification(completeUser.verification, {
    result: { Enabled: false, NameSpace: "OTHER", Roles: ["Base", "Extra"], EscalationRoles: [] },
  }).status, "mismatch");
  const completeRole = buildRoleResourceMutation({ Description: "Before", GrantedRoles: [], EscalationOnly: false, Resources: [{ Name: "A", Permissions: "R" }] }, "B", "U", "grant");
  assert.equal(evaluateVerification(completeRole.verification, {
    result: { Description: "After", GrantedRoles: ["Unexpected"], EscalationOnly: true, Resources: [{ Name: "A", Permissions: "R" }, { Name: "B", Permissions: "U" }] },
  }).status, "mismatch");
});

test("process actions reject a replaced PID and operations remain bound to their preview connection", () => {
  const plan = inferVerification("POST", "/v2/process/terminate?id=41");
  const before = { result: { Pid: 41, Nspace: "USER", Username: "tester", Routine: "IrisOps.Test", State: "RUN" } };
  const guard = captureProcessPrecondition(plan, before);
  assert.equal(evaluatePrecondition(guard, before).status, "current");
  assert.equal(evaluatePrecondition(guard, { result: { ...before.result, Username: "other" } }).status, "stale");
  assert.equal(evaluatePrecondition(guard, { result: { Pid: 41, State: "RUN" } }).status, "invalid");
  assert.throws(() => captureProcessPrecondition(plan, { result: { Pid: 42 } }), /identity/);
  assert.equal(sameOperationContext({ revision: 3, demo: false }, { revision: 3, demo: false }), true);
  assert.equal(sameOperationContext({ revision: 3, demo: false }, { revision: 4, demo: false }), false);
  assert.equal(sameOperationContext({ revision: 3, demo: true }, { revision: 3, demo: false }), false);
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
  const resume = inferVerification("POST", "/v2/process/resume?id=41");
  assert.equal(evaluateVerification(resume, { result: { State: "READ" } }).status, "verified");
  assert.equal(evaluateVerification(resume, { result: { State: "DEAD" } }).status, "mismatch");
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
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:08", Status: "1", Error: "Success" } }).status, "verified");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:08" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 01:00:10", Status: "-1", Error: "" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:01", Status: "-1", Error: "" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 01:00:10", Status: "-3", Error: "Previous failure" } }).status, "pending");
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:02", Status: "-3", Error: "Password=must-not-leak" } }).status, "error");
  assert.doesNotMatch(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 02:00:00", LastFinished: "2026-09-21 02:00:02", Status: "-3", Error: "Bearer must-not-leak" } }).summary, /must-not-leak/);
  assert.equal(evaluateVerification(plan, { result: { LastStarted: "2026-09-21 01:00:00", LastFinished: "2026-09-21 01:00:10", Status: "-3", Error: "Previous failure" } }).status, "pending");
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

test("unknown server-local timestamps are not treated as the browser timezone", () => {
  const local = normalizeTaskHistory({ result: [{ TaskId: 1, LogDatetime: "2026-09-21 03:00:00" }] })[0];
  const utc = normalizeAuditRecords({ result: [{ AuditIndex: 2, UTCTimeStamp: "2026-09-21T02:00:00Z" }] })[0];
  assert.equal(local.sortTime, null);
  assert.match(local.timeBasis, /timezone unknown/);
  assert.equal(mergeTimeline([local], [utc])[0].source, "Audit");
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
  assert.equal(redactOperationPath("/v2/apiKey/FAKE-KEY-123"), "/v2/apiKey/REDACTED");
  assert.doesNotMatch(redactOperationPath("/v2/%74oken/FAKE-ONLY?client_secret=FAKE-TWO&auth_header=FAKE-THREE"), /FAKE-ONLY|FAKE-TWO|FAKE-THREE/);
});

test("uncertain writes require attention in the incident timeline", () => {
  for (const [resultStatus, verificationStatus] of [["uncertain", "not-run"], ["blocked", "connection-changed"]]) {
    const entry = createJournalEntry({ method: "PUT", path: "/v2/web-app", resultStatus, verificationStatus });
    assert.equal(normalizeJournalEntries([entry])[0].severity, "warning");
  }
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
