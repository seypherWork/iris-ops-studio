export function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [REDACTED]")
    .replace(/\b(password|secret|token|private[_. -]?key|credential|access[_. -]?token|refresh[_. -]?token|id[_. -]?token|api[_. -]?key|client[_. -]?secret|authorization|auth[_. -]?header)(?=["']?\s*[:=])(["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "$1$2[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]");
}
