import { IrisAdminClient, IrisApiError, normalizeBaseUrl, redactSensitiveText, unwrapIrisResult } from "./api.js?v=1.2.1";

export const NATIVE_SOURCES = Object.freeze({ messages: "Messages", monitor: "System Monitor", alerts: "Alerts" });

export function nativeLogBase(adminBase, pageUrl) {
  const page = new URL(pageUrl);
  const admin = new URL(normalizeBaseUrl(adminBase), page);
  if (!["http:", "https:"].includes(page.protocol) || admin.origin !== page.origin
    || admin.pathname !== "/api/admin" || admin.username || admin.password) {
    throw new TypeError("Native logs require Ops Studio on the same IRIS origin with /api/admin");
  }
  if (page.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(page.hostname)) {
    throw new TypeError("Native log authentication requires HTTPS outside localhost");
  }
  return new URL("/api/irisops-logs", page).toString();
}

export class NativeLogClient {
  constructor({ adminBase, pageUrl, fetchImpl, timeoutMs } = {}) {
    this.client = new IrisAdminClient({ baseUrl: nativeLogBase(adminBase, pageUrl), fetchImpl, timeoutMs });
    this.active = false;
    this.revision = 0;
  }

  async login(user, password, role = "") {
    const revision = this.revision;
    await this.client.login(user, password, role);
    if (revision !== this.revision) throw new IrisApiError("Native log connection changed");
    this.active = true;
  }

  close() {
    this.active = false;
    this.revision++;
    this.client.setConnection({ token: "", refreshToken: "" });
  }

  async page(source, cursor = "") {
    if (!Object.hasOwn(NATIVE_SOURCES, source)) throw new TypeError("Unknown native log source");
    if (typeof cursor !== "string" || cursor.length > 512 || (cursor && !/^[A-Za-z0-9_-]+$/.test(cursor))) {
      throw new TypeError("Invalid native log page cursor");
    }
    if (!this.active) throw new IrisApiError("Connect native logs in Connection settings", { status: 401 });
    const revision = this.revision;
    const query = new URLSearchParams({ source });
    if (cursor) query.set("cursor", cursor);
    const payload = await this.client.request(`/logs?${query}`);
    if (revision !== this.revision || !this.active) throw new IrisApiError("Native log connection changed");
    const page = unwrapIrisResult(payload);
    if (!page || page.source !== source || !Array.isArray(page.records) || page.records.length > 150
      || !/^[a-f0-9]{64}$/.test(page.snapshot)
      || typeof page.nextCursor !== "string" || page.nextCursor.length > 512
      || (page.nextCursor && !/^[A-Za-z0-9_-]+$/.test(page.nextCursor))
      || page.records.some((record) => !record || !Number.isSafeInteger(record.offset) || record.offset < 0
        || typeof record.message !== "string" || record.message.length > 8192)) {
      throw new IrisApiError("Native log reader returned an invalid page");
    }
    return page;
  }
}

export function nativeLogStatus(error) {
  if (error?.status === 401) return "Session expired — reconnect native logs";
  if (error?.status === 403) return "Access denied or source refused by IRIS";
  if (error?.status === 404) return "Source or extension absent";
  if (error?.status === 409) return "Source changed — refresh latest page";
  return "Native source unavailable";
}

export function normalizeNativePage(page) {
  if (!page || !Object.hasOwn(NATIVE_SOURCES, page.source)) return [];
  return [...page.records].reverse().map((record) => {
    const message = redactSensitiveText(record.message);
    const iso = message.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/)?.[1] || "";
    const local = message.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})-(\d{2}:\d{2}:\d{2})(?::(\d{3}))?/);
    const time = iso || (local ? `${local[3].length === 2 ? `20${local[3]}` : local[3]}-${local[1]}-${local[2]} ${local[4]}${local[5] ? `.${local[5]}` : ""}` : "");
    const explicit = /(?:Z|[+-]\d{2}:?\d{2})$/.test(time);
    const native = local && message.slice(local[0].length).match(/^\s+\((\d+)\)\s+(-2|-1|0|1|2|3)\s+\[([^\]\r\n]+)\]/);
    const pid = native?.[1] || message.match(/\bPID[=: ]+(\d+)\b/i)?.[1];
    const severity = native ? Number(native[2]) >= 2 ? "critical" : Number(native[2]) === 1 ? "warning" : "info"
      : /\b(?:fatal|critical|error|failed|panic)\b/i.test(message) ? "critical"
      : /\b(?:warning|warn|alert|degraded)\b/i.test(message) ? "warning" : "unknown";
    return {
      id: `native-${page.source}-${page.snapshot}-${record.offset}`,
      time, sortTime: explicit && Number.isFinite(Date.parse(time)) ? Date.parse(time) : null,
      timeBasis: explicit ? "Explicit timezone" : time ? "IRIS server time · timezone unknown" : "Timestamp not identified",
      source: NATIVE_SOURCES[page.source], subsystem: native ? `${native[3]} · IRIS severity ${native[2]}` : "Native IRIS log · severity inferred from text",
      severity, entity: pid ? `PID ${pid}` : "IRIS", actor: "Not identified",
      message, correlation: `${page.source}:${record.offset}`,
    };
  });
}

export function nativePageNotice(page) {
  const notices = [];
  if (page?.partial?.leadingFragment) notices.push("A partial record at the page boundary was omitted");
  if (page?.partial?.incompleteTail) notices.push("An unfinished record was omitted");
  if (page?.partial?.oversizedLines) notices.push(`${page.partial.oversizedLines} oversized records omitted`);
  if (page?.partial?.invalidEncoding) notices.push("Invalid UTF-8 bytes were replaced");
  if (page?.partial?.shortenedRecords) notices.push(`${page.partial.shortenedRecords} redacted records shortened`);
  return notices.join(". ");
}
