"""Bounded, read-only native log pages. No IRIS dependency in the reader itself."""

import base64
import datetime
import hashlib
import json
import os
import re
import stat

SOURCES = {"messages": "messages.log", "monitor": "SystemMonitor.log", "alerts": "alerts.log"}
MAX_BYTES = 65536
MAX_LINES = 150
MAX_LINE_BYTES = 8192
MAX_CURSOR = 512


class LogError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.status = code, status


def redact(text):
    # Normalize controls before matching so removing them cannot reveal a
    # previously hidden key such as pass\x00word=value after redaction.
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)
    # Remove recognizable PEM material even when the page starts within a block.
    text = re.sub(r"-----BEGIN [^-]*PRIVATE KEY-----.*?(?:-----END [^-]*PRIVATE KEY-----|\Z)",
                  "[REDACTED PRIVATE KEY]", text, flags=re.S)
    text = re.sub(r"(?m)^\s*[A-Za-z0-9+/=_-]{40,}\s*$", "[REDACTED OPAQUE VALUE]", text)
    text = re.sub(r"\b(?:Bearer|Basic)\s+[^\s,;\"']+", "[REDACTED AUTHORIZATION]", text, flags=re.I)
    text = re.sub(r"(https?://)[^\s/:@]+:[^\s/@]+@", r"\1[REDACTED]@", text, flags=re.I)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[REDACTED JWT]", text)
    text = re.sub(
        r"\b(password|secret|token|private[_. -]?key|credential|access[_. -]?token|refresh[_. -]?token|"
        r"id[_. -]?token|api[_. -]?key|client[_. -]?secret|authorization|auth[_. -]?header)"
        r"([\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;&}]+)",
        r"\1\2[REDACTED]", text, flags=re.I)
    return text


def redact_lines(lines):
    """Redact PEM continuation lines, including a short tail before its footer."""
    key_rows = set()
    in_key = False
    for index, text in enumerate(lines):
        if re.search(r"-----BEGIN [^-]*PRIVATE KEY-----", text):
            in_key = True
        if in_key:
            key_rows.add(index)
        if re.search(r"-----END [^-]*PRIVATE KEY-----", text):
            key_rows.add(index)
            # A selected page may start inside a PEM block, with a tail shorter
            # than the standalone opaque-value threshold. Suppress that tail.
            previous = index - 1
            while previous >= 0 and re.fullmatch(r"\s*[A-Za-z0-9+/=]+\s*", lines[previous]):
                key_rows.add(previous)
                previous -= 1
            in_key = False
    return ["[REDACTED PRIVATE KEY]" if index in key_rows else redact(text)
            for index, text in enumerate(lines)]


def fingerprint(st):
    value = [st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns]
    return hashlib.sha256(json.dumps(value).encode()).hexdigest()


def encode_cursor(source, snapshot, end):
    value = json.dumps([1, source, snapshot, end], separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def decode_cursor(value, source):
    if not isinstance(value, str) or not value or len(value) > MAX_CURSOR or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise LogError("invalid_cursor", "Invalid log page cursor")
    try:
        data = json.loads(base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True))
    except (ValueError, UnicodeError):
        raise LogError("invalid_cursor", "Invalid log page cursor") from None
    if (not isinstance(data, list) or len(data) != 4 or type(data[0]) is not int or data[0] != 1
            or data[1] != source or not isinstance(data[2], str) or not re.fullmatch(r"[a-f0-9]{64}", data[2])
            or type(data[3]) is not int or data[3] < 0):
        raise LogError("invalid_cursor", "Invalid log page cursor")
    return data[2], data[3]


def _open_source(manager_dir, source):
    if source not in SOURCES:
        raise LogError("invalid_source", "Unknown native log source")
    # O_NOFOLLOW + dir_fd prevents file replacement with a link between check/open.
    # Platforms without this guarantee are explicitly unsupported.
    if not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
        raise LogError("unsupported_platform", "Native log reader requires a supported POSIX IRIS installation", 503)
    directory = os.open(manager_dir, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fd = os.open(SOURCES[source], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    finally:
        os.close(directory)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise LogError("unsafe_source", "Native log source is not a regular file", 403)
    return fd


def read_page(manager_dir, source, cursor=""):
    if not isinstance(source, str) or source not in SOURCES:
        raise LogError("invalid_source", "Unknown native log source")
    previous = decode_cursor(cursor, source) if cursor else None
    try:
        fd = _open_source(manager_dir, source)
    except LogError:
        raise
    except FileNotFoundError:
        raise LogError("source_absent", "This native log source is absent on this instance", 404) from None
    except OSError:
        raise LogError("source_unavailable", "This native log source cannot be read safely", 403) from None
    try:
        before = os.fstat(fd)
        snapshot = fingerprint(before)
        if previous and (previous[0] != snapshot or previous[1] > before.st_size):
            raise LogError("source_changed", "Log changed since this page was captured; refresh the latest page", 409)
        end = previous[1] if previous else before.st_size
        start = max(0, end - MAX_BYTES)
        offset = max(0, start - 1)
        os.lseek(fd, offset, os.SEEK_SET)
        block = os.read(fd, end - offset)
        if len(block) != end - offset:
            raise LogError("source_changed", "Log changed while reading; refresh the latest page", 409)
        data = block[start - offset:]
        leading = start > 0 and block[0:1] != b"\n"
        incomplete = bool(data and not data.endswith(b"\n"))
        first = data.find(b"\n") + 1 if leading else 0
        if leading and first == 0:
            first = len(data)
        last = data.rfind(b"\n") + 1 if incomplete else len(data)
        last = max(first, last)
        rows = []
        position = start + first
        for part in data[first:last].split(b"\n")[:-1]:
            line = part + b"\n"
            rows.append((position, line))
            position += len(line)
        selected = rows[-MAX_LINES:]
        next_end = selected[0][0] if len(rows) > MAX_LINES else start
        # If a leading fragment was skipped, the next page ends before it; its
        # remaining prefix will also be skipped. No fragment is rendered as a log.
        oversized = sum(len(line) > MAX_LINE_BYTES for _, line in selected)
        safe_rows = [(pos, line) for pos, line in selected if len(line) <= MAX_LINE_BYTES]
        # Track PEM blocks across this page; opaque standalone lines are also
        # suppressed when a page begins inside a block. Record offsets remain
        # offsets of the original file, never of the redacted message.
        messages = []
        invalid_encoding = False
        shortened = 0
        decoded = []
        for pos, line in safe_rows:
            try:
                text = line.decode("utf-8").rstrip("\r\n")
            except UnicodeDecodeError:
                invalid_encoding = True
                text = line.decode("utf-8", errors="replace").rstrip("\r\n")
            decoded.append(text)
        for (pos, _), message in zip(safe_rows, redact_lines(decoded)):
            if len(message) > MAX_LINE_BYTES:
                message = message[:MAX_LINE_BYTES - 20] + " [RECORD SHORTENED]"
                shortened += 1
            messages.append({"offset": pos, "message": message})
        after = os.fstat(fd)
        try:
            current = os.stat(os.path.join(manager_dir, SOURCES[source]), follow_symlinks=False)
        except OSError:
            raise LogError("source_changed", "Log rotated while reading; refresh the latest page", 409) from None
        if fingerprint(after) != snapshot or fingerprint(current) != snapshot:
            raise LogError("source_changed", "Log changed while reading; refresh the latest page", 409)
        return {
            "source": source, "label": SOURCES[source], "records": messages,
            "snapshot": snapshot,
            "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "nextCursor": encode_cursor(source, snapshot, next_end) if next_end > 0 else "",
            "limits": {"bytes": MAX_BYTES, "lines": MAX_LINES, "lineBytes": MAX_LINE_BYTES},
            "partial": {"leadingFragment": leading, "incompleteTail": incomplete, "oversizedLines": oversized,
                        "invalidEncoding": invalid_encoding, "shortenedRecords": shortened},
        }
    finally:
        os.close(fd)


def response(manager_dir, source, cursor=""):
    try:
        return json.dumps({"httpStatus": 200, "result": read_page(manager_dir, source, cursor)}, ensure_ascii=True)
    except LogError as error:
        return json.dumps({"httpStatus": error.status, "code": error.code, "message": str(error)})
    except Exception:
        # Never return raw filesystem paths, exception text, or log contents.
        return json.dumps({"httpStatus": 503, "code": "reader_unavailable", "message": "Native log reader unavailable"})
