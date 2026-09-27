# Human onboarding: certificate preflight, no trust change

2026-09-27 Europe/Brussels. **Read-only certificate preflight PASSED. Human browser
trust and user-login onboarding remain PENDING.** This is not a production release.

## Verified

- 220/220 Node tests pass (four new bounded certificate/origin/path checks).
- The existing stopped fault-test lab c was ownership/image/mount checked, started
  temporarily with the guard still SUSPENDED, inspected and returned to stopped.
  No deployment mode, accounts, passwords or native permissions were changed.
- The public CA and server certificates were checked for signatures, issuer,
  validity, bounded lab lifetime, RSA strength, server-auth usage and the exact
  loopback SAN. Certificates were copied as PUBLIC `.crt` files only. No `.key`
  file, browser secret store or credential was read or exported.
- HTTPS verified the CA, IP identity and time without bypassing certificate checks.
  The served leaf matched the inspected SHA-256. The UI body matched the immutable
  bundle and returned `no-store`; native portal/API paths returned 403.
- Negative checks reject expiry (simulated validation time; host clock unchanged),
  swapped CA/leaf, and concatenated certificate input.
- A clean Chrome test browser, with no certificate exception, actually rejected
  the site with `ERR_CERT_AUTHORITY_INVALID`. This expected result demonstrates
  that automated strict-client success has NOT silently established browser trust.
- Export readback passed. Deployment state stayed identical during inspection;
  the original development container retained its ID and running state.

Evidence: [preflight](../../../irisops-onboarding-preflight-20260927-a/preflight.json)
and [completed validation/restored stop](../../../irisops-onboarding-preflight-20260927-a/validation.json).

CA SHA-256:
`2127ea87c2847451b6e7f1a7c3d063fe62194144bc1a8f0fda9631ab76af0fc0`.
Leaf SHA-256:
`cf705a2d56131f69a253b28f911c90f6e45328c5392a1e46070d5e9a49c734c3`.
Both expire **2026-09-28 22:56:29 UTC**. Revalidate immediately before any import;
do not import an expired certificate or use old reports as current authority.

The source ZIP remains unchanged:
`D0BFAC2C5AA174E3649CF37E97485090E96753679AD08CC309283D8872C2AEBA`.
The preflight tool is experimental operator tooling in this checkout, not added
retroactively to that immutable ZIP. No publication/commit/push occurred.

## Decision required before browser trust

Firefox is already installed. The proposed minimum-scope route is a NEW profile:
`../irisops-onboarding-firefox-20260927-a`, used only for this lab. It has not been
created and no certificate has been imported. The user was asked for approval.
The final UI decision to trust the certificate must be performed by the user,
not by Windows Computer Use automation. Existing browser profiles and the Windows
trust stores must remain untouched.

Importing a CA is a trust grant, not just opening a file. Within the chosen profile,
that CA could identify other sites it signs; the CA itself has no loopback name
constraint. Do not use this profile for ordinary browsing or import the authority
into Windows merely to suppress warnings. Closing the dedicated profile isolates
its use; removing this exact CA from that profile's certificate manager reverses
the grant. Do not delete unrelated certificates or profile data.

## Proposed user-assisted steps (not executed)

1. After approval, create/open only the new profile. Verify its actual profile path
   before importing anything; do not reuse or reset an existing profile.
2. In that profile's certificate manager, import only the public file
   `../irisops-onboarding-preflight-20260927-a/ca-public.crt`. Inspect its full
   SHA-256 and expiration against a fresh preflight.
3. The user personally decides whether to trust it for websites. Do not bypass
   the HTTPS warning or disable certificate validation.
4. Start only the ownership-verified lab. Verify its page loads without a bypass,
   then address identity setup separately. The guard is still SUSPENDED, so this
   report is NOT evidence that a human can already sign in. Test-runner passwords
   were random/in-memory; they are not a usable human account setup.
5. Any subsequent account setup, read-only activation or trust cleanup needs its
   own exact authorized scope and readback. Credentials are entered directly by
   the user, never in chat or reports.

## Official references checked

- [Chrome local trust stores and certificate manager](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md).
- [Microsoft Import-Certificate](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate?view=windowsserver2025-ps).
- [Mozilla: setting certificate authorities in Firefox](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox).

These documents establish supported trust mechanisms, not proof that the proposed
new Firefox profile has been configured or tested. That remains the next gate.
