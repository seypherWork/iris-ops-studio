# Authorized HTTP transport experiment — 2026-09-25

The user authorized replacing the failed in-process adapter with the official
API over fixed loopback HTTP, using the current user's server-held token.
No publication or privilege expansion is included.

## Bounded first implementation

- Independent experimental endpoint; old negative probe remains reproducible.
- Native authenticated CSP session, HttpOnly cookie; no SysAdmin JWT returned.
- CSRF and exact configured origin required to attach upstream authorization.
- Credentials must name the native session actor. Password exists only while
  forwarding that login request; no password field is stored by our code.
- `%Net.HttpRequest` connects only to `127.0.0.1:52773` inside the container.
  Exact hardcoded login and wallet-read paths; redirects and proxies disabled.
  This is trusted local gateway configuration, not a general user-controlled proxy.
- Access token encrypted with native AES-256-GCM, random 96-bit nonce and AAD
  binding actor, native session identifier and a nonsecret IRIS boot epoch.
  Encryption key derived from the native server-side CSP session key. Token
  plaintext is never stored in session Data, ordinary globals or diagnostics.
- This protects against incidental session-Data disclosure and ciphertext
  tampering. It does NOT protect against an administrator able to inspect native
  CSP keys or server memory. Native session storage remains in the trust boundary.
- Initially cap the authorization to 60 seconds and discard refresh tokens.
  Expiration/rejection requires explicit reconnection. No hidden re-login,
  token refresh, or request retry. This is a feasibility limit, not finished UX.
- Session token envelopes are unusable after logout, actor/session change,
  envelope corruption or IRIS restart. A nonsecret boot marker is mapped to
  IRISTEMP and is not reconstituted from durable receipts.
- The only allowed administrative operation remains a wallet metadata GET.
  No mutation route, arbitrary Explorer passthrough or browser fallback exists.
- HTTP is accepted only for the exact loopback laboratory deployment. Remote
  deployment requires separately verified HTTPS and cookie settings.

## Required evidence

Same actor gets same allow/deny as official API; denied app resource and disabled
native app are respected; same session observes role revocation; no JWT/password
in HTTP results; ciphertext bound to session and tamper rejected; expiry and
logout block further reads; boot marker disappears on restart; all owned
fixtures removed; original production files/containers unchanged.

References: native `%CSP.Session.Key` and `%SYSTEM.Encryption.AESGCMEncrypt` /
`AESGCMDecrypt` in the IRIS 2026.2 class reference. Compatibility outside the
tested image and a complete product safe mode are not asserted.
