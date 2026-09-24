const MANAGEMENT_ROOT = "/api/mgmnt/";
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export function managementOrigin(adminBaseUrl, pageUrl) {
  const page = new URL(pageUrl);
  const admin = new URL(adminBaseUrl, page);
  if (!/^https?:$/.test(page.protocol) || admin.origin !== page.origin || !/^\/api\/admin(?:\/|$)/.test(admin.pathname)) {
    return null;
  }
  return page.origin;
}

export function safeSpecPath(path) {
  const raw = String(path || "");
  if (!/^\/api\/mgmnt\/v[12]\//.test(raw) || /[?#\\\u0000-\u001f]/.test(raw) || /%(?:2f|5c|00)/i.test(raw)) {
    throw new TypeError("REST specification path is not a same-instance management path");
  }
  let decoded = raw;
  for (let depth = 0; depth < 5; depth += 1) {
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded) || /%(?:2f|5c|00)/i.test(decoded)
      || /[?#\\\u0000-\u001f]/.test(decoded) || decoded.includes("//")) {
      throw new TypeError("REST specification path contains traversal or an unsafe separator");
    }
    if (!/%[0-9a-f]{2}/i.test(decoded)) return raw;
    try { decoded = decodeURIComponent(decoded); }
    catch { throw new TypeError("REST specification path has invalid encoding"); }
  }
  throw new TypeError("REST specification path has excessive encoding");
}

export function normalizeRestCatalog(payload, source) {
  if (!Array.isArray(payload)) throw new TypeError("REST catalog response must be an array");
  return payload.slice(0, 300).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const name = String(item.name || "").trim();
    const specPath = String(item.swaggerSpec || "").trim();
    if (!name || !specPath) return null;
    let safePath = "";
    try { safePath = safeSpecPath(specPath); } catch {}
    return {
      name,
      namespace: String(item.namespace || ""),
      dispatchClass: String(item.dispatchClass || ""),
      webApplications: String(item.webApplications || (source === "REST web apps" ? name : "")),
      enabled: typeof item.enabled === "boolean" ? item.enabled : null,
      specPath: safePath,
      source,
    };
  }).filter(Boolean);
}

async function fetchManagementJson(fetchImpl, origin, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(new URL(path, origin).toString(), {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("REST response exceeds the inspection limit");
    try { return JSON.parse(text); }
    catch { throw new Error("REST endpoint did not return JSON"); }
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadRestCatalog(fetchImpl, origin) {
  const sources = [
    { path: MANAGEMENT_ROOT, name: "REST web apps" },
    { path: `${MANAGEMENT_ROOT}v2/`, name: "REST services" },
  ];
  const results = await Promise.allSettled(sources.map((source) => fetchManagementJson(fetchImpl, origin, source.path)));
  const entries = [];
  const status = [];
  results.forEach((result, index) => {
    const name = sources[index].name;
    if (result.status === "fulfilled") {
      try {
        const rows = normalizeRestCatalog(result.value, name);
        entries.push(...rows);
        status.push(`${name}: ${rows.length}`);
      } catch {
        status.push(`${name}: invalid response`);
      }
    } else {
      status.push(`${name}: ${result.reason?.message === "HTTP 401" || result.reason?.message === "HTTP 403" ? "permission denied" : "unavailable"}`);
    }
  });
  return { entries, status };
}

export async function loadRestSpec(fetchImpl, origin, path) {
  return fetchManagementJson(fetchImpl, origin, safeSpecPath(path));
}

export function summarizeOpenApi(document, maxOperations = 120) {
  if (!document || typeof document !== "object" || Array.isArray(document)
    || !document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) {
    throw new TypeError("REST specification has no valid paths object");
  }
  const operations = [];
  let total = 0;
  for (const [path, methods] of Object.entries(document.paths)) {
    if (!methods || typeof methods !== "object" || Array.isArray(methods)) continue;
    for (const method of METHODS) {
      if (!methods[method]) continue;
      total += 1;
      if (operations.length < maxOperations) {
        operations.push({ method: method.toUpperCase(), path, summary: String(methods[method].summary || "").slice(0, 180) });
      }
    }
  }
  return {
    title: String(document.info?.title || "REST API").slice(0, 180),
    version: String(document.info?.version || "").slice(0, 80),
    operations,
    total,
  };
}
