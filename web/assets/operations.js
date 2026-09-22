import { redactSensitiveText } from "./sanitization.js?v=1.1.0";

const USER_MUTABLE_FIELDS = [
  "AccountNeverExpires",
  "AutheEnabled",
  "ChangePassword",
  "Comment",
  "EmailAddress",
  "Enabled",
  "ExpirationDate",
  "FullName",
  "HOTPKeyDisplay",
  "NameSpace",
  "PasswordNeverExpires",
  "PhoneNumber",
  "PhoneProvider",
  "Roles",
  "EscalationRoles",
  "Routine",
];

const ROLE_MUTABLE_FIELDS = ["Description", "GrantedRoles", "EscalationOnly", "Resources"];
const SECRET_QUERY_KEY = /^(?:password|secret|token|private.?key|credential|authorization|api.?key|access.?key|access.?token|refresh.?token|id.?token)$/i;

function unwrap(payload) {
  return payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function field(value, name) {
  if (!value || typeof value !== "object") return undefined;
  if (value[name] !== undefined) return value[name];
  const actual = Object.keys(value).find((key) => key.toLowerCase() === String(name).toLowerCase());
  return actual ? value[actual] : undefined;
}

function toList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function requireStringList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const normalized = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) throw new TypeError(`${label} must contain only non-empty strings`);
    return item.trim();
  });
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} must not contain duplicates`);
  return normalized;
}

function pickCanonical(value, fields) {
  const output = {};
  for (const name of fields) {
    const item = field(value, name);
    if (item !== undefined) output[name] = clone(item);
  }
  return output;
}

function queryPath(path, values) {
  const url = new URL(path, "https://iris.invalid");
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return `${url.pathname}${url.search}`;
}

export function reconcileUserSummary(summary, detailPayload) {
  const detail = unwrap(detailPayload);
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return { ...summary, enabled: "Unknown" };
  }
  const enabled = field(detail, "Enabled");
  const namespace = field(detail, "NameSpace") ?? field(detail, "Namespace");
  return {
    ...summary,
    enabled: typeof enabled === "boolean" ? enabled : "Unknown",
    ...(namespace !== undefined ? { namespace } : {}),
  };
}

export function reconcileWebAppSummary(summary, detailPayload) {
  const detail = unwrap(detailPayload);
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return { ...summary, enabled: "Unknown" };
  }
  const enabled = field(detail, "Enabled");
  const namespace = field(detail, "NameSpace") ?? field(detail, "Namespace");
  const dispatch = field(detail, "DispatchClass");
  const resource = field(detail, "Resource");
  return {
    ...summary,
    enabled: typeof enabled === "boolean" ? enabled : "Unknown",
    ...(namespace !== undefined ? { namespace } : {}),
    ...(dispatch !== undefined ? { dispatch } : {}),
    ...(resource !== undefined ? { resource } : {}),
  };
}

export function reconcileTaskSummary(summary, detailPayload) {
  const detail = unwrap(detailPayload);
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return { ...summary, status: "Unknown" };
  }
  const suspended = field(detail, "Suspended");
  const lastFinished = field(detail, "LastFinished");
  return {
    ...summary,
    status: typeof suspended === "boolean" ? (suspended ? "Suspended" : "Ready") : "Unknown",
    ...(typeof lastFinished === "string" ? { lastResult: lastFinished } : {}),
  };
}

function pathParts(path) {
  const url = new URL(String(path || ""), "https://iris.invalid");
  return { route: url.pathname, id: url.searchParams.get("id") };
}

export function normalizePermissions(value) {
  const source = String(value || "").trim().toUpperCase();
  if (!/^[RWU]+$/.test(source)) throw new TypeError("Permissions must contain only R, W, and U");
  return ["R", "W", "U"].filter((permission) => source.includes(permission)).join("");
}

function safePermissions(value) {
  try { return normalizePermissions(value); } catch { return ""; }
}

function requireResources(value) {
  if (!Array.isArray(value)) throw new TypeError("Resources must be an array");
  const normalized = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Resources must contain objects");
    const name = String(field(item, "Name") ?? "").trim();
    if (!name) throw new TypeError("Every resource must have a non-empty Name");
    return { Name: name, Permissions: normalizePermissions(field(item, "Permissions")) };
  });
  if (new Set(normalized.map((item) => item.Name)).size !== normalized.length) throw new TypeError("Resources must not contain duplicate names");
  return normalized;
}

function sortedStrings(value) {
  return [...value].sort((left, right) => left.localeCompare(right));
}

function sortedResources(value) {
  return [...value].sort((left, right) => left.Name.localeCompare(right.Name) || left.Permissions.localeCompare(right.Permissions));
}

function canonicalSnapshot(kind, payload) {
  const entity = unwrap(payload) || {};
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new TypeError("Readback must contain an object");
  const fields = kind === "userSnapshot" ? USER_MUTABLE_FIELDS : ROLE_MUTABLE_FIELDS;
  const snapshot = pickCanonical(entity, fields);
  for (const name of kind === "userSnapshot" ? ["Roles", "EscalationRoles"] : ["GrantedRoles"]) {
    if (snapshot[name] !== undefined) snapshot[name] = sortedStrings(requireStringList(snapshot[name], name));
  }
  if (kind === "roleSnapshot" && snapshot.Resources !== undefined) snapshot.Resources = sortedResources(requireResources(snapshot.Resources));
  return Object.fromEntries(Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)));
}

export function evaluatePrecondition(plan, payload) {
  if (!plan || !new Set(["userSnapshot", "roleSnapshot"]).has(plan.kind)) {
    return { ok: false, status: "invalid", summary: "No valid concurrency precondition is defined" };
  }
  try {
    const actual = canonicalSnapshot(plan.kind, payload);
    const expected = plan.expected;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    return {
      ok,
      status: ok ? "current" : "stale",
      summary: ok ? "Preflight state is unchanged" : "Target changed after preview; reopen the operation and review the new state",
    };
  } catch (error) {
    return { ok: false, status: "invalid", summary: `Latest readback is unsafe to update: ${error.message}` };
  }
}

export function redactOperationPath(value) {
  const text = String(value || "");
  const [route, query = ""] = text.split("?", 2);
  if (!query) return route;
  const safeQuery = query.split("&").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return part;
    const key = part.slice(0, separator);
    let decodedKey = key;
    try { decodedKey = decodeURIComponent(key); } catch {}
    return SECRET_QUERY_KEY.test(decodedKey) ? `${key}=REDACTED` : part;
  }).join("&");
  return `${route}?${safeQuery}`;
}

export function buildUserRoleMutation(userPayload, roleName, action) {
  if (!new Set(["assign", "revoke"]).has(action)) throw new TypeError("Unsupported user-role action");
  const user = unwrap(userPayload) || {};
  const role = String(roleName || "").trim();
  if (!role) throw new TypeError("A role is required");
  const beforeRoles = requireStringList(field(user, "Roles"), "Roles");
  const escalationRoles = field(user, "EscalationRoles") === undefined
    ? undefined : requireStringList(field(user, "EscalationRoles"), "EscalationRoles");
  const exists = beforeRoles.includes(role);
  const afterRoles = action === "assign"
    ? [...beforeRoles, ...(exists ? [] : [role])]
    : beforeRoles.filter((item) => item !== role);
  const body = { ...pickCanonical(user, USER_MUTABLE_FIELDS), Roles: afterRoles };
  if (escalationRoles !== undefined) body.EscalationRoles = escalationRoles;
  return {
    body,
    changed: action === "assign" ? !exists : exists,
    beforeSummary: `Roles: ${beforeRoles.join(", ") || "none"}`,
    expectedSummary: `Roles: ${afterRoles.join(", ") || "none"}`,
    precondition: { kind: "userSnapshot", expected: canonicalSnapshot("userSnapshot", user) },
    verification: {
      kind: "arrayExact",
      field: "Roles",
      expectedValues: sortedStrings(afterRoles),
      description: `Roles exactly match: ${afterRoles.join(", ") || "none"}`,
    },
  };
}

export function buildRoleResourceMutation(rolePayload, resourceName, permissions, action) {
  if (!new Set(["grant", "revoke"]).has(action)) throw new TypeError("Unsupported role-resource action");
  const role = unwrap(rolePayload) || {};
  const resource = String(resourceName || "").trim();
  if (!resource) throw new TypeError("A resource is required");
  const permissionSet = normalizePermissions(permissions);
  const beforeResources = requireResources(field(role, "Resources"));
  const grantedRoles = field(role, "GrantedRoles") === undefined
    ? undefined : requireStringList(field(role, "GrantedRoles"), "GrantedRoles");
  const current = beforeResources.find((item) => String(field(item, "Name")) === resource);
  const remaining = beforeResources.filter((item) => String(field(item, "Name")) !== resource);
  const afterResources = action === "grant"
    ? [...remaining, { Name: resource, Permissions: permissionSet }]
    : remaining;
  const body = { ...pickCanonical(role, ROLE_MUTABLE_FIELDS), Resources: afterResources };
  if (grantedRoles !== undefined) body.GrantedRoles = grantedRoles;
  const currentPermissions = current ? safePermissions(field(current, "Permissions")) : "";
  return {
    body,
    changed: action === "grant" ? currentPermissions !== permissionSet : Boolean(current),
    beforeSummary: `${resource}: ${currentPermissions || "not granted"}`,
    expectedSummary: `${resource}: ${action === "grant" ? permissionSet : "not granted"}`,
    precondition: { kind: "roleSnapshot", expected: canonicalSnapshot("roleSnapshot", role) },
    verification: {
      kind: "resourceSetExact",
      field: "Resources",
      expectedResources: sortedResources(afterResources),
      description: `Resource grants exactly match the reviewed update`,
    },
  };
}

export function inferVerification(method, path) {
  if (String(method).toUpperCase() !== "POST") return null;
  const { route, id } = pathParts(path);
  if (!id) return null;
  if (route === "/v2/process/suspend") {
    return { kind: "processState", readPath: queryPath("/v2/process", { id }), state: "suspended", description: "Process state is suspended" };
  }
  if (route === "/v2/process/resume") {
    return { kind: "processState", readPath: queryPath("/v2/process", { id }), state: "running", description: "Process is no longer suspended" };
  }
  if (route === "/v2/process/terminate") {
    return { kind: "notFound", readPath: queryPath("/v2/process", { id }), description: "Process no longer exists" };
  }
  if (route === "/v2/task/suspend" || route === "/v2/task/resume") {
    return {
      kind: "boolean",
      readPath: queryPath("/v2/task/info", { id }),
      field: "Suspended",
      value: route.endsWith("/suspend"),
      description: `Task reports Suspended=${route.endsWith("/suspend")}`,
    };
  }
  if (route === "/v2/task/run") {
    return {
      kind: "taskRun",
      readPath: queryPath("/v2/task/info", { id }),
      fields: ["LastFinished", "LastStarted"],
      description: "Task completed successfully after this request",
    };
  }
  return null;
}

export function captureVerificationBaseline(plan, payload) {
  if (!plan) return null;
  const result = unwrap(payload) || {};
  if (plan.kind === "taskRun") {
    return { ...plan, before: Object.fromEntries(plan.fields.map((name) => [name, field(result, name) ?? ""])) };
  }
  return { ...plan };
}

export function summarizeReadback(plan, payload) {
  const result = unwrap(payload) || {};
  if (!plan) return "No automatic readback";
  if (plan.kind === "notFound") return "Resource exists";
  if (plan.kind === "processState") return `State: ${field(result, "State") ?? "unknown"}`;
  if (plan.kind === "boolean") return `${plan.field}: ${String(field(result, plan.field))}`;
  if (plan.kind === "taskRun") return [...plan.fields, "Status", "Error"].map((name) => `${name}: ${field(result, name) || "none"}`).join(" · ");
  if (plan.kind === "arrayExact") return `${plan.field}: ${toList(field(result, plan.field)).join(", ") || "none"}`;
  if (plan.kind === "resourceSetExact") return `Resources: ${Array.isArray(field(result, plan.field)) ? field(result, plan.field).map((item) => `${field(item, "Name")}:${field(item, "Permissions")}`).join(", ") || "none" : "invalid"}`;
  return "Readback available";
}

export function evaluateVerification(plan, payload, { status = 200 } = {}) {
  if (!plan) return { status: "unverified", summary: "No automatic readback is defined" };
  if (plan.kind === "notFound") {
    const verified = status === 404;
    return { status: verified ? "verified" : "mismatch", summary: verified ? plan.description : "Resource still exists" };
  }
  if (status < 200 || status >= 300) return { status: "error", summary: `Readback failed with HTTP ${status}` };
  const result = unwrap(payload) || {};
  let verified = false;
  if (plan.kind === "processState") {
    const actual = String(field(result, "State") || "").toUpperCase();
    verified = plan.state === "suspended" ? actual.includes("SUSP") : Boolean(actual) && !actual.includes("SUSP");
  } else if (plan.kind === "boolean") {
    verified = field(result, plan.field) === plan.value;
  } else if (plan.kind === "taskRun") {
    const statusText = String(field(result, "Status") ?? "").trim();
    const errorText = String(field(result, "Error") ?? "").trim();
    const failedStatus = /^-\d+$/.test(statusText) && statusText !== "-1";
    const failedMessage = Boolean(errorText) && !/^success$/i.test(errorText);
    if (failedStatus || failedMessage) {
      return { status: "error", summary: `Task reported failure: ${redactSensitiveText(errorText || `status ${statusText}`)}` };
    }
    const finishedChanged = Boolean(field(result, "LastFinished"))
      && String(field(result, "LastFinished")) !== String(plan.before?.LastFinished ?? "");
    const startedChanged = Boolean(field(result, "LastStarted"))
      && String(field(result, "LastStarted")) !== String(plan.before?.LastStarted ?? "");
    if (statusText === "-1" || startedChanged) {
      if (statusText !== "-1" && finishedChanged) return { status: "verified", summary: plan.description };
      return { status: "pending", summary: "Task started, but successful completion has not been observed" };
    }
    if (finishedChanged) return { status: "verified", summary: plan.description };
  } else if (plan.kind === "arrayExact") {
    try {
      verified = JSON.stringify(sortedStrings(requireStringList(field(result, plan.field), plan.field))) === JSON.stringify(plan.expectedValues);
    } catch { verified = false; }
  } else if (plan.kind === "resourceSetExact") {
    try {
      verified = JSON.stringify(sortedResources(requireResources(field(result, plan.field)))) === JSON.stringify(plan.expectedResources);
    } catch { verified = false; }
  }
  return {
    status: verified ? "verified" : "mismatch",
    summary: verified ? plan.description : `Expected: ${plan.description}; observed: ${summarizeReadback(plan, payload)}`,
  };
}

function severityFrom(value) {
  const text = String(value || "").toLowerCase();
  if (/critical|fatal|severe|error|failed|failure|denied|panic/.test(text)) return "critical";
  if (/warn|suspend|timeout|degraded|alert/.test(text)) return "warning";
  return "info";
}

export function normalizeAuditRecords(payload) {
  const rows = Array.isArray(unwrap(payload)) ? unwrap(payload) : [];
  return rows.map((row, index) => {
    const utcTime = field(row, "UTCTimeStamp");
    const time = utcTime === undefined ? (field(row, "TimeStamp") ?? "") : normalizeUtcTimestamp(utcTime);
    return {
      id: `audit-${field(row, "AuditIndex") ?? index}`,
      time,
      sortTime: sortableTime(time),
      timeBasis: utcTime === undefined ? "IRIS server time" : "UTC",
      severity: severityFrom([field(row, "Status"), field(row, "EventType"), field(row, "Description")].join(" ")),
      source: "Audit",
      subsystem: field(row, "EventSource") ?? field(row, "EventType") ?? "Security",
      entity: field(row, "Namespace") || (field(row, "Pid") ? `PID ${field(row, "Pid")}` : "IRIS"),
      actor: field(row, "Username") ?? "SYSTEM",
      message: field(row, "Description") ?? field(row, "Event") ?? "Audit event",
      correlation: `AUD-${field(row, "AuditIndex") ?? index}`,
    };
  });
}

export function normalizeTaskHistory(payload) {
  const rows = Array.isArray(unwrap(payload)) ? unwrap(payload) : [];
  return rows.map((row, index) => {
    const errorNumber = Number(field(row, "ErrNumber") || 0);
    return {
      id: `task-${field(row, "TaskId") ?? index}-${field(row, "LastStart") ?? ""}`,
      time: field(row, "LogDatetime") ?? field(row, "Completed") ?? field(row, "LastStart") ?? "",
      timeBasis: "IRIS server time",
      severity: errorNumber ? "critical" : severityFrom([field(row, "Status"), field(row, "Result")].join(" ")),
      source: "Tasks",
      subsystem: "Task manager",
      entity: `${field(row, "Name") || "Task"} #${field(row, "TaskId") ?? "?"}`,
      actor: field(row, "Username") ?? "SYSTEM",
      message: field(row, "Result") ?? field(row, "Status") ?? "Task execution",
      correlation: `TASK-${field(row, "TaskId") ?? index}`,
    };
  });
}

export function createJournalEntry({
  id, time = new Date().toISOString(), method, path, label, target, resultStatus, verificationStatus,
  verificationSummary, durationMs, instance = "demo", actor = "Demo operator", mode = "demo",
}) {
  const safePath = redactOperationPath(path);
  const safeLabel = redactSensitiveText(redactOperationPath(label || `${String(method || "").toUpperCase()} ${path}`));
  return {
    id: id || `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time,
    method: String(method || "").toUpperCase(),
    path: safePath,
    label: safeLabel,
    target: redactSensitiveText(target || "IRIS"),
    resultStatus,
    verificationStatus,
    verificationSummary: redactSensitiveText(verificationSummary || ""),
    durationMs: Number(durationMs) || 0,
    instance: redactSensitiveText(instance || "unknown"),
    actor: redactSensitiveText(actor || "unknown"),
    mode: mode === "live" ? "live" : "demo",
  };
}

export function normalizeJournalEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id,
    time: entry.time,
    timeBasis: "UTC",
    severity: entry.resultStatus === "failed" ? "critical" : ["mismatch", "error", "pending", "unverified", "stale", "invalid"].includes(entry.verificationStatus) ? "warning" : "info",
    source: "Ops Studio",
    subsystem: `${["verified", "demo-verified"].includes(entry.verificationStatus) ? "Verified operation" : "Operation journal"} · ${entry.mode === "live" ? "Live" : "Demo"} · ${entry.instance}`,
    entity: entry.target,
    actor: entry.actor,
    message: `${entry.label} — ${entry.resultStatus}${entry.verificationStatus ? ` / ${entry.verificationStatus}` : ""}`,
    correlation: entry.id,
    detail: entry.verificationSummary,
  }));
}

export function normalizeUtcTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const explicit = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const candidate = explicit ? raw.replace(" ", "T") : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(" ", "T")}Z` : raw;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

function sortableTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeTimeline(...groups) {
  return groups.flat().filter(Boolean).sort((left, right) => (right.sortTime ?? sortableTime(right.time)) - (left.sortTime ?? sortableTime(left.time)));
}

export function filterTimeline(events, { source = "all", severity = "all", query = "" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return events.filter((event) => {
    if (source !== "all" && event.source !== source) return false;
    if (severity !== "all" && event.severity !== severity) return false;
    if (!needle) return true;
    return [event.source, event.subsystem, event.entity, event.actor, event.message, event.correlation, event.detail]
      .some((value) => String(value || "").toLowerCase().includes(needle));
  });
}
