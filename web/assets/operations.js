import { redactSensitiveText } from "./sanitization.js?v=1.2.1";
import { walletSnapshot } from "./wallet-policy.js?v=1.2.1";

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
// Application properties come from the official SysAdmin API v2 Application schema.
// The guided workflow changes Enabled only, but sends the reviewed configuration
// back intact so a PUT cannot silently discard unrelated application settings.
const WEB_APP_FIELDS = [
  "AutheEnabled", "AutoCompile", "ChangePasswordPage", "CookiePath", "CorsAllowlist",
  "CorsCredentialsAllowed", "CorsHeadersList", "CSPZENEnabled", "CSRFToken",
  "DeepSeeEnabled", "Description", "DispatchClass", "Enabled", "ErrorPage",
  "EventClass", "GroupById", "iKnowEnabled", "InbndWebServicesEnabled",
  "IsNameSpaceDefault", "JWTAuthEnabled", "JWTAccessTokenTimeout",
  "JWTRefreshTokenTimeout", "LockCSPName", "LoginPage", "MatchRoles",
  "NameSpace", "Package", "Path", "PermittedClasses", "Recurse",
  "RedirectEmptyPath", "Resource", "ServeFiles", "ServeFilesTimeout",
  "SuperClass", "Timeout", "TraceEnabled", "TwoFactorEnabled", "Type",
  "UseCookies", "SessionScope", "UserCookieScope", "WSGIAppLocation",
  "WSGIAppName", "WSGICallable", "WSGIDebug", "WSGIType",
];
const WEB_APP_READONLY_FIELDS = ["Name", "AuthenticationMethods"];
const SECRET_QUERY_KEY = /^(?:password|secret|token|private.?key|credential|authorization|auth[_. -]?header|client[_. -]?secret|api.?key|access.?key|access.?token|refresh.?token|id.?token)$/i;
const SECRET_PATH_LABEL = SECRET_QUERY_KEY;
const ACTIVE_PROCESS_STATES = new Set([
  "LOCK", "OPEN", "CLOS", "USE", "READ", "WRT", "GET", "GSET", "GKLL", "GORD", "GQRY",
  "GDEF", "ZF", "HANG", "JOB", "EXAM", "BRD", "INCR", "BSET", "BGET", "EVT",
  "SLCT", "SEM", "IPQ", "DEQ", "VSET", "VKLL", "RUN",
]);

// IRIS Task Manager can take up to 60 seconds to pick up a Run request. Other
// mutations should keep the short readback window so they fail promptly.
export function verificationPollPolicy(kind, demo = false) {
  if (demo) return { attempts: 1, intervalMs: 0 };
  if (kind === "taskRun") return { attempts: 75, intervalMs: 1000 };
  return { attempts: 6, intervalMs: 500 };
}

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

// These built-in and installer identities must never be offered by the guided
// user-role workflow. The advanced API remains subject to IRIS authorization.
export function isProtectedUser(name) {
  return /^_/.test(String(name || ""))
    || /^(?:admin|cspsystem|iam|superuser|unknownuser|irisowner)$/i.test(String(name || ""));
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
    return { ...summary, enabled: "Unknown", isDefault: "Unknown" };
  }
  const enabled = field(detail, "Enabled");
  const isDefault = field(detail, "IsNameSpaceDefault");
  const namespace = field(detail, "NameSpace") ?? field(detail, "Namespace");
  const dispatch = field(detail, "DispatchClass");
  const resource = field(detail, "Resource");
  return {
    ...summary,
    enabled: typeof enabled === "boolean" ? enabled : "Unknown",
    isDefault: typeof isDefault === "boolean" ? isDefault : "Unknown",
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

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function containsRedactionMarker(value) {
  if (typeof value === "string") return value.includes("••••••••") || value.includes("[REDACTED");
  if (Array.isArray(value)) return value.some(containsRedactionMarker);
  if (value && typeof value === "object") return Object.values(value).some(containsRedactionMarker);
  return false;
}

function canonicalWebApp(payload) {
  const app = unwrap(payload);
  if (!app || typeof app !== "object" || Array.isArray(app)) throw new TypeError("Web application detail must be an object");
  const allowed = new Set([...WEB_APP_FIELDS, ...WEB_APP_READONLY_FIELDS].map((name) => name.toLowerCase()));
  const unknown = Object.keys(app).filter((name) => !allowed.has(name.toLowerCase()));
  if (unknown.length) throw new TypeError("Web application detail contains fields outside the documented update schema");
  if (containsRedactionMarker(app)) throw new TypeError("Web application detail is redacted and cannot be used for an update");
  if (typeof field(app, "Enabled") !== "boolean") throw new TypeError("Web application Enabled must be a boolean");
  if (typeof field(app, "IsNameSpaceDefault") !== "boolean") {
    throw new TypeError("Web application default status is required for a safe update");
  }
  if (typeof field(app, "NameSpace") !== "string" || !field(app, "NameSpace").trim()) {
    throw new TypeError("Web application NameSpace is required for a safe update");
  }
  return stableValue(pickCanonical(app, WEB_APP_FIELDS));
}

export function webAppGuidedEligibility(name, namespace, isDefault) {
  const appName = String(name || "").trim();
  const ns = String(namespace || "").trim();
  if (!appName.startsWith("/") || appName.includes("//")
    || /[?#\\%\u0000-\u001f]/.test(appName)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(appName)) {
    return { ok: false, reason: "Application name is not a safe web path" };
  }
  if (!ns || ns.toUpperCase() === "%SYS") return { ok: false, reason: "System or unknown namespace is inventory-only" };
  if (isDefault !== false) return { ok: false, reason: "Default or unknown namespace application is inventory-only" };
  if (/^\/(?:api\/admin|api\/mgmnt|api\/irisops-logs|csp\/ops|csp\/sys)(?:\/|$)/i.test(appName)) {
    return { ok: false, reason: "Management and Ops Studio applications are protected" };
  }
  return { ok: true, reason: "" };
}

export function buildWebAppAvailabilityMutation(payload, name, enabled) {
  if (typeof enabled !== "boolean") throw new TypeError("Requested availability must be a boolean");
  const app = unwrap(payload);
  const before = canonicalWebApp(app);
  const appName = String(name || "").trim();
  const actualName = field(app, "Name");
  // IRIS 2026.2 identifies the detail by the GET query and omits Name from
  // its result. If a server does return Name, it must still match exactly.
  if (actualName !== undefined && actualName !== appName) throw new TypeError("Web application detail does not match the selected name");
  const eligibility = webAppGuidedEligibility(appName, before.NameSpace, before.IsNameSpaceDefault);
  if (!eligibility.ok) throw new TypeError(eligibility.reason);
  const body = clone(before);
  body.Enabled = enabled;
  const expected = stableValue(body);
  return {
    body,
    changed: before.Enabled !== enabled,
    beforeSummary: `${appName}: ${before.Enabled ? "Enabled" : "Disabled"}`,
    expectedSummary: `${appName}: ${enabled ? "Enabled" : "Disabled"}; other documented settings unchanged`,
    precondition: { kind: "webAppSnapshot", name: appName, expected: before },
    verification: { kind: "webAppSnapshot", name: appName, expected, description: "Availability changed; other documented settings unchanged" },
  };
}

function canonicalSnapshot(kind, payload) {
  const entity = unwrap(payload) || {};
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new TypeError("Readback must contain an object");
  const fields = kind === "userSnapshot" ? USER_MUTABLE_FIELDS : ROLE_MUTABLE_FIELDS;
  const snapshot = pickCanonical(entity, fields);
  if (containsRedactionMarker(snapshot)) throw new TypeError("Security detail is redacted and cannot be used for an update or verification");
  for (const name of kind === "userSnapshot" ? ["Roles", "EscalationRoles"] : ["GrantedRoles"]) {
    if (snapshot[name] !== undefined) snapshot[name] = sortedStrings(requireStringList(snapshot[name], name));
  }
  if (kind === "roleSnapshot" && snapshot.Resources !== undefined) snapshot.Resources = sortedResources(requireResources(snapshot.Resources));
  return Object.fromEntries(Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)));
}

function canonicalProcessSnapshot(payload, expectedPid) {
  const process = unwrap(payload);
  if (!process || typeof process !== "object" || Array.isArray(process)) throw new TypeError("Process detail must be an object");
  const pid = field(process, "Pid");
  const namespace = field(process, "Nspace") ?? field(process, "Namespace");
  const username = field(process, "Username") ?? field(process, "User");
  if (!/^\d+$/.test(String(pid ?? "")) || String(pid) !== String(expectedPid)
    || typeof namespace !== "string" || !namespace || typeof username !== "string" || !username) {
    throw new TypeError("Process identity is incomplete or does not match the selected PID");
  }
  const snapshot = { Pid: String(pid), Nspace: namespace, Username: username };
  for (const name of ["Routine", "Job", "ParentPid", "State"]) {
    const value = field(process, name);
    if (value !== undefined) snapshot[name] = String(value);
  }
  return snapshot;
}

export function captureProcessPrecondition(plan, payload) {
  if (!plan || !new Set(["processState", "notFound"]).has(plan.kind)) return null;
  const id = new URL(plan.readPath, "https://iris.invalid").searchParams.get("id");
  return { kind: "processSnapshot", readPath: plan.readPath, id, expected: canonicalProcessSnapshot(payload, id) };
}

export function sameOperationContext(expected, current) {
  return Boolean(expected && current && expected.revision === current.revision
    && expected.demo === current.demo && expected.epoch === current.epoch);
}

export function evaluatePrecondition(plan, payload) {
  if (!plan || !new Set(["userSnapshot", "roleSnapshot", "webAppSnapshot", "processSnapshot", "walletPolicy"]).has(plan.kind)) {
    return { ok: false, status: "invalid", summary: "No valid concurrency precondition is defined" };
  }
  try {
    if (plan.kind === "webAppSnapshot" && field(unwrap(payload), "Name") !== undefined
      && field(unwrap(payload), "Name") !== plan.name) {
      return { ok: false, status: "invalid", summary: "Latest readback is for a different application" };
    }
    const actual = plan.kind === "walletPolicy" ? walletSnapshot(payload, plan.name)
      : plan.kind === "webAppSnapshot" ? canonicalWebApp(payload)
      : plan.kind === "processSnapshot" ? canonicalProcessSnapshot(payload, plan.id)
        : canonicalSnapshot(plan.kind, payload);
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
  const parts = route.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    let label = parts[index - 1];
    try { label = decodeURIComponent(label); } catch {}
    if (SECRET_PATH_LABEL.test(label) && parts[index]) parts[index] = "REDACTED";
  }
  const safeRoute = redactSensitiveText(parts.join("/"));
  if (!query) return safeRoute;
  const safeQuery = query.split("&").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return part;
    const key = part.slice(0, separator);
    let decodedKey = key;
    try { decodedKey = decodeURIComponent(key); } catch {}
    return SECRET_QUERY_KEY.test(decodedKey) ? `${key}=REDACTED` : part;
  }).join("&");
  return `${safeRoute}?${safeQuery}`;
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
  const beforeSnapshot = canonicalSnapshot("userSnapshot", user);
  const expectedSnapshot = canonicalSnapshot("userSnapshot", body);
  return {
    body,
    changed: action === "assign" ? !exists : exists,
    beforeSummary: `Roles: ${beforeRoles.join(", ") || "none"}`,
    expectedSummary: `Roles: ${afterRoles.join(", ") || "none"}`,
    precondition: { kind: "userSnapshot", expected: beforeSnapshot },
    verification: {
      kind: "arrayExact",
      field: "Roles",
      expectedValues: sortedStrings(afterRoles),
      expectedSnapshot,
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
  const beforeSnapshot = canonicalSnapshot("roleSnapshot", role);
  const expectedSnapshot = canonicalSnapshot("roleSnapshot", body);
  const currentPermissions = current ? safePermissions(field(current, "Permissions")) : "";
  return {
    body,
    changed: action === "grant" ? currentPermissions !== permissionSet : Boolean(current),
    beforeSummary: `${resource}: ${currentPermissions || "not granted"}`,
    expectedSummary: `${resource}: ${action === "grant" ? permissionSet : "not granted"}`,
    precondition: { kind: "roleSnapshot", expected: beforeSnapshot },
    verification: {
      kind: "resourceSetExact",
      field: "Resources",
      expectedResources: sortedResources(afterResources),
      expectedSnapshot,
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
    return { ...plan, before: Object.fromEntries([...plan.fields, "Status", "Error"].map((name) => [name, field(result, name) ?? ""])) };
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
  if (plan.kind === "webAppSnapshot") return `Enabled: ${String(field(result, "Enabled"))}; configuration readback compared`;
  if (plan.kind === "walletPolicy") return "Both wallet access-policy fields compared";
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
    const actual = String(field(result, "State") || "").trim().toUpperCase();
    const baseState = actual.match(/^[A-Z]+/)?.[0] || "";
    verified = plan.state === "suspended" ? baseState === "SUSP"
      : ACTIVE_PROCESS_STATES.has(baseState) && !/\b(?:D|H)\b|DEAD|HALT/.test(actual);
  } else if (plan.kind === "boolean") {
    verified = field(result, plan.field) === plan.value;
  } else if (plan.kind === "taskRun") {
    const statusText = String(field(result, "Status") ?? "").trim();
    const errorText = String(field(result, "Error") ?? "").trim();
    const finishedChanged = Boolean(field(result, "LastFinished"))
      && String(field(result, "LastFinished")) !== String(plan.before?.LastFinished ?? "");
    const startedChanged = Boolean(field(result, "LastStarted"))
      && String(field(result, "LastStarted")) !== String(plan.before?.LastStarted ?? "");
    if (!finishedChanged) {
      return { status: "pending", summary: startedChanged
        ? "Task started, but its new completion has not yet been observed"
        : "A result from this task run has not yet been observed" };
    }
    const failedStatus = /^-\d+$/.test(statusText) && statusText !== "-1";
    const failedMessage = Boolean(errorText) && !/^success$/i.test(errorText);
    if (failedStatus || failedMessage) {
      return { status: "error", summary: `Task reported failure: ${redactSensitiveText(errorText || `status ${statusText}`)}` };
    }
    if (statusText === "-1") {
      return { status: "pending", summary: "Task started, but successful completion has not been observed" };
    }
    if (/^[1-9]\d*$/.test(statusText)) return { status: "verified", summary: plan.description };
    return { status: "pending", summary: "Task finished, but a successful status was not reported" };
  } else if (plan.kind === "arrayExact") {
    try {
      verified = JSON.stringify(sortedStrings(requireStringList(field(result, plan.field), plan.field))) === JSON.stringify(plan.expectedValues);
      if (verified && plan.expectedSnapshot) verified = JSON.stringify(canonicalSnapshot("userSnapshot", payload)) === JSON.stringify(plan.expectedSnapshot);
    } catch { verified = false; }
  } else if (plan.kind === "resourceSetExact") {
    try {
      verified = JSON.stringify(sortedResources(requireResources(field(result, plan.field)))) === JSON.stringify(plan.expectedResources);
      if (verified && plan.expectedSnapshot) verified = JSON.stringify(canonicalSnapshot("roleSnapshot", payload)) === JSON.stringify(plan.expectedSnapshot);
    } catch { verified = false; }
  } else if (plan.kind === "walletPolicy") {
    try { verified = JSON.stringify(walletSnapshot(payload, plan.name)) === JSON.stringify(plan.expected); }
    catch { verified = false; }
  } else if (plan.kind === "webAppSnapshot") {
    try { verified = (field(result, "Name") === undefined || field(result, "Name") === plan.name)
      && JSON.stringify(canonicalWebApp(result)) === JSON.stringify(plan.expected); }
    catch { verified = false; }
  }
  return {
    status: verified ? "verified" : "mismatch",
    summary: verified ? plan.description : `Expected: ${plan.description}; complete documented record did not match. Observed: ${summarizeReadback(plan, payload)}`,
  };
}

function severityFrom(value) {
  const text = String(value || "").toLowerCase();
  // Match whole status words, not substrings in names such as EnsAlert or
  // "Purge errors and log files" (both normal installation events).
  if (/\b(?:critical|fatal|severe|error|failed|failure|denied|panic)\b/.test(text)) return "critical";
  if (/\b(?:warn(?:ing)?|suspend(?:ed)?|timeout|degraded|alert)\b/.test(text)) return "warning";
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
      subsystem: redactSensitiveText(field(row, "EventSource") ?? field(row, "EventType") ?? "Security"),
      entity: redactSensitiveText(field(row, "Namespace") || (field(row, "Pid") ? `PID ${field(row, "Pid")}` : "IRIS")),
      actor: redactSensitiveText(field(row, "Username") ?? "SYSTEM"),
      message: redactSensitiveText(field(row, "Description") ?? field(row, "Event") ?? "Audit event"),
      correlation: `AUD-${field(row, "AuditIndex") ?? index}`,
    };
  });
}

export function normalizeTaskHistory(payload) {
  const rows = Array.isArray(unwrap(payload)) ? unwrap(payload) : [];
  return rows.map((row, index) => {
    const errorNumber = Number(field(row, "ErrNumber") || 0);
    const time = field(row, "LogDatetime") ?? field(row, "Completed") ?? field(row, "LastStart") ?? "";
    return {
      id: `task-${field(row, "TaskId") ?? index}-${field(row, "LastStart") ?? ""}`,
      time,
      sortTime: sortableTime(time),
      timeBasis: sortableTime(time) === null ? "IRIS server time · timezone unknown" : "Explicit timezone",
      severity: errorNumber ? "critical" : severityFrom([field(row, "Status"), field(row, "Result")].join(" ")),
      source: "Tasks",
      subsystem: "Task manager",
      entity: redactSensitiveText(`${field(row, "Name") || "Task"} #${field(row, "TaskId") ?? "?"}`),
      actor: redactSensitiveText(field(row, "Username") ?? "SYSTEM"),
      message: redactSensitiveText(field(row, "Result") ?? field(row, "Status") ?? "Task execution"),
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
    severity: entry.resultStatus === "failed" ? "critical" : entry.resultStatus === "uncertain"
      || ["mismatch", "error", "pending", "unverified", "stale", "invalid", "not-run", "connection-changed"].includes(entry.verificationStatus)
      ? "warning" : "info",
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
  const text = String(value || "");
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export function mergeTimeline(...groups) {
  return groups.flat().filter(Boolean).sort((left, right) => {
    const leftTime = left.sortTime ?? sortableTime(left.time);
    const rightTime = right.sortTime ?? sortableTime(right.time);
    if (leftTime === null) return rightTime === null ? 0 : 1;
    if (rightTime === null) return -1;
    return rightTime - leftTime;
  });
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
