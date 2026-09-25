import { endpointCatalog, normalizeBaseUrl, resolveApiUrl } from "./api.js?v=1.2.1";

const NO_BODY_METHODS = new Set(["GET", "HEAD"]);

export function methodAcceptsBody(method) {
  return !NO_BODY_METHODS.has(String(method || "GET").toUpperCase());
}

export function catalogSelectionValue(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const route = String(path || "").trim().split("?", 1)[0];
  return endpointCatalog.some((entry) => entry.method === verb && entry.path === route)
    ? `${verb}|${route}` : "";
}

function demoCatalogRoute(resolvedUrl, baseUrl) {
  const origin = "https://iris-ops-demo.invalid";
  const basePath = new URL(normalizeBaseUrl(baseUrl), origin).pathname.replace(/\/+$/, "");
  const pathname = new URL(resolvedUrl, origin).pathname;
  if (basePath && !pathname.startsWith(`${basePath}/`)) return "";
  return pathname.slice(basePath.length);
}

export function prepareExplorerRequest({ method = "GET", path = "", rawBody = "", baseUrl = "/api/admin", demo = false } = {}) {
  const verb = String(method).toUpperCase();
  const target = String(path).trim();
  const resolvedUrl = resolveApiUrl(baseUrl, target);
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const base = new URL(normalizedBase, "https://iris-ops.invalid");
  const resolved = new URL(resolvedUrl, base.origin);
  const basePath = base.pathname.replace(/\/+$/, "") || "/";
  if (resolved.origin !== base.origin || (basePath !== "/" && resolved.pathname !== basePath
    && !resolved.pathname.startsWith(`${basePath}/`))) {
    throw new TypeError("Explorer requests must remain inside the selected IRIS Admin API base path");
  }
  let body;
  if (methodAcceptsBody(verb) && String(rawBody).trim()) {
    try { body = JSON.parse(rawBody); }
    catch { throw new TypeError("Request body is not valid JSON"); }
  }
  if (demo && !catalogSelectionValue(verb, demoCatalogRoute(resolvedUrl, baseUrl))) {
    throw new TypeError("This endpoint is not simulated in Safe demo; connect to a disposable IRIS instance to test it");
  }
  return { method: verb, path: target, body };
}

export function explorerOutcomeLabel({ demo, safety, verificationStatus }) {
  if (demo) return "Simulated request";
  if (safety === "read") return "Read complete";
  if (verificationStatus === "verified") return "Verified change";
  return "Change sent; not verified";
}

export function verifiedJournalCount(entries) {
  return entries.filter((entry) => ["verified", "demo-verified"].includes(entry.verificationStatus)).length;
}
