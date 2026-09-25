# Native logs development

Development and safety contract for version 1.2.1. Work began from public
1.2.0 commit `2743f2614227697980f793583d5959d2a1fc6a27`; the final tested
scope and limits are recorded in `development-validation-20260925.md`.

## Contract

- An optional IRIS REST extension exposes read-only, bounded pages from the
  manager-directory `messages.log`, `SystemMonitor.log`, and `alerts.log`.
- IRIS authenticates the extension independently using its built-in JWT
  support. Every log request additionally checks `%Admin_Operate:U`. The user
  also needs read access to the installation namespace database (the container
  uses `%DB_IRISOPS:R`). No roles
  are granted by the extension. The SysAdmin access token is never forwarded.
- The browser can opt into this second authentication during connection;
  passwords are transient and the extension tokens remain in page memory.
- Live IRIS 2026.2 accepts a valid JWT identity across these REST applications.
  Separate token issuance is not application-scoped or reduced-privilege
  authentication. The browser never forwards the SysAdmin token to the extension;
  server access is enforced by the authenticated user's real IRIS privileges.
  The extension rejects log writes; this does not make the whole portal or an
  administrator's IRIS identity read-only.
- The browser sends a fixed source identifier and a bounded cursor, never a
  filename. Unsupported sources, symlinks, nonregular files, malformed cursors,
  changed snapshots, and unauthorized requests fail explicitly.
- Native log pages join the existing timeline with honest timestamp/source
  labels. A source absent from the instance is unavailable, not empty or healthy.
- Each read is bounded in bytes and lines; incomplete and oversized records
  are identified. Known credential patterns are removed on the server and again
  before browser display. This is not a guarantee that arbitrary log prose is
  free of sensitive information.

## Acceptance evidence required

1. Reader tests: page boundaries, UTF-8, CRLF, large lines, incomplete writes,
   rotation/truncation/concurrent change, missing sources, link refusal,
   malformed cursors, and credential-shaped text across boundaries.
2. HTTP on disposable IRIS: authenticated operator access, restricted-account
   denial, unauthenticated denial, write-method refusal, observed JWT sharing,
   and token renewal.
3. Browser: optional login, partial source availability, older-page navigation,
   connection changes during reads, filtering, and desktop/mobile rendering.
4. Full existing JavaScript suite and an installation test from the final
   working tree. Capture only sanitized evidence.

The extension does not decode binary journal records or interoperability
message bodies. Custom log directories and rotated archives are not in this
first implementation. The separate wallet-policy workflow is documented in
[wallet-policy-development.md](wallet-policy-development.md).

## Validation status

On 2026-09-25, the development and independently built fresh IRIS 2026.2
installations passed all 20 Python reader tests, native-log HTTP permission and
method checks, and real-browser paging/redaction/desktop/mobile checks.
See [the validation report](development-validation-20260925.md) for exact scope
and remaining versioned release gates. These results are not publication.
