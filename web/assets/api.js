import { redactSensitiveText } from "./sanitization.js?v=1.1.0";

export { redactSensitiveText } from "./sanitization.js?v=1.1.0";

export class IrisApiError extends Error {
  constructor(message, { status = 0, payload = null, path = "" } = {}) {
    super(message);
    this.name = "IrisApiError";
    this.status = status;
    this.payload = payload;
    this.path = path;
  }
}

export function normalizeBaseUrl(value = "/api/admin") {
  const trimmed = String(value).trim() || "/api/admin";
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new TypeError("IRIS base URL cannot contain credentials, a query, or a fragment");
    }
    return trimmed.length > parsed.origin.length ? trimmed.replace(/\/+$/, "") : trimmed;
  }
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\") || /[?#]/.test(trimmed)) {
    throw new TypeError("IRIS base URL must be an HTTP(S) URL or a root-relative path");
  }
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

export function joinApiPath(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  return base === "/" ? suffix : `${base}${suffix}`;
}

export function resolveApiUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl);
  const target = String(path || "").trim();
  const schemeAfterSeparators = target.replace(/^[\s/]+/, "");
  if (!target || target.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(target)
    || (/^[a-z][a-z0-9+.-]*:/i.test(schemeAfterSeparators) && !/^https?:\/\//i.test(target))) {
    throw new TypeError("Refusing an unsafe or cross-origin IRIS request URL");
  }
  if (/^https?:\/\//i.test(target)) {
    const parsedTarget = new URL(target);
    if (!/^https?:\/\//i.test(base) || parsedTarget.origin !== new URL(base).origin || parsedTarget.username || parsedTarget.password) {
      throw new TypeError("Refusing to send an IRIS access token to a cross-origin URL");
    }
    return parsedTarget.toString();
  }
  if (/^https?:\/\//i.test(base)) {
    const parsedBase = new URL(base);
    let resolved;
    if (target === parsedBase.pathname || target.startsWith(`${parsedBase.pathname}/`) || target.startsWith(`${parsedBase.pathname}?`)) {
      resolved = new URL(target, parsedBase.origin);
    } else {
      resolved = new URL(target.replace(/^\/+/, ""), `${base}/`);
    }
    if (resolved.origin !== parsedBase.origin || resolved.username || resolved.password || !/^https?:$/.test(resolved.protocol)) {
      throw new TypeError("Refusing to send an IRIS access token to a cross-origin URL");
    }
    return resolved.toString();
  }
  if (target === base || target.startsWith(`${base}/`) || target.startsWith(`${base}?`)) return target;
  return joinApiPath(base, target);
}

export function resolveServerLocation(baseUrl, location, responseUrl = "") {
  const base = normalizeBaseUrl(baseUrl);
  const target = String(location || "").trim();
  if (target.startsWith("//") || target.includes("\\") || (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^https?:\/\//i.test(target))) {
    throw new TypeError("Refusing an unsafe or cross-origin IRIS task location");
  }
  const source = /^https?:\/\//i.test(responseUrl) ? new URL(responseUrl) : null;
  const configured = /^https?:\/\//i.test(base) ? new URL(base) : null;
  const trustedOrigin = source?.origin || configured?.origin || "";

  if (/^https?:\/\//i.test(target)) {
    const parsed = new URL(target);
    if (!trustedOrigin || parsed.origin !== trustedOrigin) throw new TypeError("Refusing a cross-origin IRIS task location");
    return parsed.toString();
  }
  if (target.startsWith("/")) return trustedOrigin ? new URL(target, trustedOrigin).toString() : target;
  if (source) return new URL(target, source).toString();
  return resolveApiUrl(base, target);
}

export function appendQuery(path, values = {}) {
  const [route, existing = ""] = String(path).split("?", 2);
  const params = new URLSearchParams(existing);
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}

export function unwrapIrisResult(payload) {
  return payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
}

export function classifySafety(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const route = String(path || "").toLowerCase();
  if (verb === "GET" || verb === "HEAD") return "read";
  if (verb === "POST" && /\/security\/audit\/records(?:\?|$)/.test(route)) return "read";
  if (verb === "DELETE" || /(terminate|purge|truncate|revoke|deactivate|clear-count|\/cancel(?:\?|$))/.test(route)) return "destructive";
  return "mutation";
}

const SECRET_KEY = /(password|secret|token|private.?key|credential)/i;

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === "string") return redactSensitiveText(value);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) && !(key.toLowerCase() === "credentials" && Array.isArray(item) && item.every((entry) => entry && typeof entry === "object"))
      ? redactSecretValue(item) : redactSensitive(item),
  ]));
}

function redactSecretValue(value) {
  if (typeof value === "string" || typeof value === "number") return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  if (Array.isArray(value)) return value.map(redactSecretValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecretValue(item)]));
  return value;
}

export function confirmationPhrase(method, path) {
  const segment = String(path).split("?")[0].split("/").filter(Boolean).slice(-2).join(" ").toUpperCase();
  return `${String(method).toUpperCase()} ${segment || "RESOURCE"}`;
}

export class IrisAdminClient {
  constructor({ baseUrl = "/api/admin", token = "", refreshToken = "", fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 15000 } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.refreshToken = refreshToken;
    this.refreshPromise = null;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.connectionRevision = 0;
  }

  setConnection(connection = {}) {
    const nextBaseUrl = normalizeBaseUrl(connection.baseUrl ?? this.baseUrl);
    const baseChanged = nextBaseUrl !== this.baseUrl;
    const tokenSpecified = Object.hasOwn(connection, "token");
    const nextToken = tokenSpecified ? connection.token : (baseChanged ? "" : this.token);
    const refreshSpecified = Object.hasOwn(connection, "refreshToken");
    const nextRefreshToken = refreshSpecified
      ? connection.refreshToken
      : (baseChanged || (tokenSpecified && !nextToken) ? "" : this.refreshToken);
    if (baseChanged || nextToken !== this.token || nextRefreshToken !== this.refreshToken) {
      this.connectionRevision += 1;
      this.refreshPromise = null;
    }
    this.baseUrl = nextBaseUrl;
    this.token = nextToken;
    this.refreshToken = nextRefreshToken;
  }

  async login(user, password, role = "") {
    const connectionRevision = this.connectionRevision;
    const baseUrl = this.baseUrl;
    const payload = { user, password };
    if (role) payload.role = role;
    const response = await this.request("/login", {
      method: "POST", body: payload, authenticated: false, redactResponse: false, baseUrl, authToken: "",
    });
    if (connectionRevision !== this.connectionRevision) {
      throw new IrisApiError("IRIS connection changed while login was in progress", { path: "/login" });
    }
    const result = unwrapIrisResult(response) || {};
    const token = result.access_token || result.accessToken || result.token;
    if (!token) throw new IrisApiError("IRIS did not return an access token", { path: "/login", payload: redactSensitive(response) });
    this.token = token;
    this.refreshToken = result.refresh_token || result.refreshToken || "";
    this.refreshPromise = null;
    this.connectionRevision += 1;
    return redactSensitive(response);
  }

  async refreshAccessToken({ baseUrl = this.baseUrl, expectedRevision = this.connectionRevision } = {}) {
    if (baseUrl !== this.baseUrl || expectedRevision !== this.connectionRevision) {
      throw new IrisApiError("IRIS connection changed while token refresh was in progress", { path: "/refresh" });
    }
    if (this.refreshPromise) return this.refreshPromise;
    const refreshToken = this.refreshToken;
    if (!refreshToken) throw new IrisApiError("IRIS session expired; reconnect to continue", { status: 401, path: "/refresh" });

    const pending = (async () => {
      const response = await this.request("/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken, grant_type: "refresh_token" },
        authenticated: false,
        redactResponse: false,
        baseUrl,
        authToken: "",
        allowRefresh: false,
      });
      if (baseUrl !== this.baseUrl || expectedRevision !== this.connectionRevision || refreshToken !== this.refreshToken) {
        throw new IrisApiError("IRIS connection changed while token refresh was in progress", { path: "/refresh" });
      }
      const result = unwrapIrisResult(response) || {};
      const token = result.access_token || result.accessToken || result.token;
      if (!token) throw new IrisApiError("IRIS refresh did not return an access token", { path: "/refresh", payload: redactSensitive(response) });
      this.token = token;
      this.refreshToken = result.refresh_token || result.refreshToken || "";
      return token;
    })();
    this.refreshPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.refreshPromise === pending) this.refreshPromise = null;
    }
  }

  async request(path, {
    method = "GET", body, authenticated = true, redactResponse = true, includeMeta = false,
    baseUrl = this.baseUrl, authToken = this.token, allowRefresh = true,
  } = {}) {
    if (["GET", "HEAD"].includes(String(method).toUpperCase()) && body !== undefined) {
      throw new IrisApiError("GET and HEAD requests cannot include a body", { path });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const requestRevision = this.connectionRevision;
    let activeAuthToken = authToken;
    let recoveryAttempted = false;

    try {
      const requestUrl = resolveApiUrl(baseUrl, path);
      while (true) {
        const headers = { Accept: "application/json" };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (authenticated && activeAuthToken) headers.Authorization = `Bearer ${activeAuthToken}`;
        const response = await this.fetchImpl(requestUrl, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
          redirect: "error",
        });
        const text = await response.text();
        let payload = null;
        if (text) {
          try { payload = JSON.parse(text); } catch { payload = { message: text }; }
        }
        if (!response.ok) {
          const sameConnection = requestRevision === this.connectionRevision && baseUrl === this.baseUrl;
          if (response.status === 401 && authenticated && allowRefresh && !recoveryAttempted && sameConnection) {
            recoveryAttempted = true;
            if (this.token && activeAuthToken !== this.token) {
              activeAuthToken = this.token;
              continue;
            }
            if (this.refreshToken) {
              activeAuthToken = await this.refreshAccessToken({ baseUrl, expectedRevision: requestRevision });
              continue;
            }
          }
          const safePayload = redactSensitive(payload);
          const message = redactSensitiveText(safePayload?.message || safePayload?.error || `IRIS request failed with HTTP ${response.status}`);
          throw new IrisApiError(message, { status: response.status, payload: safePayload, path });
        }
        const safePayload = redactResponse ? redactSensitive(payload) : payload;
        if (includeMeta) return { payload: safePayload, status: response.status, location: response.headers.get("location"), responseUrl: response.url };
        return safePayload;
      }
    } catch (error) {
      if (error instanceof IrisApiError) throw error;
      if (error?.name === "AbortError") throw new IrisApiError("IRIS request timed out", { path });
      throw new IrisApiError(redactSensitiveText(error?.message || "Unable to reach IRIS"), { path });
    } finally {
      clearTimeout(timeout);
    }
  }

  async requestAsync(path, { method = "POST", body, pollIntervalMs = 750, maxPolls = 40 } = {}) {
    const connectionRevision = this.connectionRevision;
    const baseUrl = this.baseUrl;
    let authToken = this.token;
    const accepted = await this.request(path, { method, body, includeMeta: true, baseUrl, authToken });
    if (connectionRevision !== this.connectionRevision) {
      throw new IrisApiError("IRIS connection changed while the asynchronous operation was in progress", { path });
    }
    authToken = this.token;
    if (accepted.status !== 202) return unwrapIrisResult(accepted.payload);

    const result = unwrapIrisResult(accepted.payload) || {};
    const location = accepted.location || (result.GUID ? appendQuery("/v2/async-result", { id: result.GUID }) : "");
    if (!location) throw new IrisApiError("IRIS accepted the task but did not provide a status URL", { status: 202, path });
    const statusUrl = resolveServerLocation(baseUrl, location, accepted.responseUrl);
    const pollBaseUrl = /^https?:\/\//i.test(baseUrl) || !/^https?:\/\//i.test(accepted.responseUrl)
      ? baseUrl : new URL(baseUrl, accepted.responseUrl).toString();

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      if (connectionRevision !== this.connectionRevision) {
        throw new IrisApiError("IRIS connection changed; asynchronous polling was canceled", { path });
      }
      const taskPayload = await this.request(statusUrl, { baseUrl: pollBaseUrl, authToken });
      if (connectionRevision !== this.connectionRevision) {
        throw new IrisApiError("IRIS connection changed; asynchronous polling was canceled", { path });
      }
      authToken = this.token;
      const task = unwrapIrisResult(taskPayload) || {};
      const state = String(task.State || task.state || "").toLowerCase();
      if (state === "finished") return task.Result ?? task.result ?? null;
      if (state === "failed" || state === "canceled") {
        throw new IrisApiError(task.FailureReason || `IRIS asynchronous task ${state}`, { path, payload: taskPayload });
      }
    }
    throw new IrisApiError("IRIS asynchronous task did not finish before the polling limit", { status: 202, path });
  }
}

export const endpointCatalog = [
  { group: "General", method: "GET", path: "/info", label: "Server information" },
  { group: "Monitor", method: "GET", path: "/v2/monitor/dashboard/main", label: "Main dashboard" },
  { group: "Monitor", method: "GET", path: "/v2/monitor/dashboard/system-resources", label: "System resources" },
  { group: "Monitor", method: "GET", path: "/v2/monitor/system-usage", label: "System usage" },
  { group: "Processes", method: "GET", path: "/v2/processes", label: "List processes" },
  { group: "Processes", method: "GET", path: "/v2/process", label: "Process readback" },
  { group: "Processes", method: "POST", path: "/v2/process/suspend", label: "Suspend process" },
  { group: "Processes", method: "POST", path: "/v2/process/resume", label: "Resume process" },
  { group: "Processes", method: "POST", path: "/v2/process/terminate", label: "Terminate process" },
  { group: "Infrastructure", method: "GET", path: "/v2/databases", label: "List databases and storage" },
  { group: "Infrastructure", method: "GET", path: "/v2/devices", label: "List configured devices" },
  { group: "Tasks", method: "GET", path: "/v2/tasks", label: "List tasks" },
  { group: "Tasks", method: "GET", path: "/v2/task/info", label: "Task execution readback" },
  { group: "Tasks", method: "GET", path: "/v2/task/history", label: "Task execution history" },
  { group: "Tasks", method: "GET", path: "/v2/task/upcoming", label: "Upcoming tasks" },
  { group: "Tasks", method: "POST", path: "/v2/task/run", label: "Run task" },
  { group: "Tasks", method: "POST", path: "/v2/task/suspend", label: "Suspend task" },
  { group: "Tasks", method: "POST", path: "/v2/task/resume", label: "Resume task" },
  { group: "Access", method: "GET", path: "/v2/security/users", label: "List users" },
  { group: "Access", method: "GET", path: "/v2/security/user", label: "User security details" },
  { group: "Access", method: "PUT", path: "/v2/security/user", label: "Update user roles" },
  { group: "Access", method: "GET", path: "/v2/security/roles", label: "List roles" },
  { group: "Access", method: "GET", path: "/v2/security/role", label: "Role security details" },
  { group: "Access", method: "PUT", path: "/v2/security/role", label: "Update role resources" },
  { group: "Access", method: "GET", path: "/v2/security/resources", label: "List resources" },
  { group: "Web apps", method: "GET", path: "/v2/web-apps", label: "List web applications" },
  { group: "Secrets", method: "GET", path: "/v2/wallet/collections", label: "Wallet collections" },
  { group: "Secrets", method: "GET", path: "/v2/security/x509-credentials", label: "X509 credentials" },
  { group: "OAuth 2.0", method: "GET", path: "/v2/security/oauth2/client/server-definitions", label: "OAuth client server definitions" },
  { group: "OAuth 2.0", method: "GET", path: "/v2/security/oauth2/resource-servers", label: "OAuth resource servers" },
  { group: "OAuth 2.0", method: "GET", path: "/v2/security/oauth2/server/clients", label: "OAuth authorization-server clients" },
  { group: "Audit", method: "POST", path: "/v2/security/audit/records", label: "Query audit records" },
  { group: "Operations", method: "GET", path: "/v2/async-results", label: "Async operations" },
  { group: "Operations", method: "POST", path: "/v2/async-result/cancel", label: "Cancel async operation" }
];
