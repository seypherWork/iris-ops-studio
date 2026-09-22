# Release validation checklist

Use this checklist against the exact IRIS version used in the contest demo.

## Automated checks

- [ ] `npm run check` passes.
- [ ] No token, password, certificate material, private key, or local `.env`
      file is present in the repository or Git history.
- [ ] Docker image builds without modifying the source tree.
- [ ] `/csp/ops/index.html` serves the HTML, CSS, and JavaScript assets.

## Authentication

- [ ] Correct credentials return a token through `/api/admin/login`.
- [ ] Incorrect credentials produce a useful error without echoing the password.
- [ ] Reloading the page discards the in-memory token.
- [ ] A user lacking a privilege receives the original HTTP status and a redacted
      error response.

## Read workflows

- [ ] Overview populates from the three monitor endpoints.
- [ ] Processes and tasks display representative rows.
- [ ] Database storage and configured devices display representative rows.
- [ ] Users, roles, web applications, wallet collections, and X.509 credentials
      display without exposing protected values.
- [ ] OAuth server definitions, resource servers, and clients display without
      exposing client secrets, tokens, or private-key passwords.
- [ ] Audit-record query is treated as read-only even though the API uses POST.
- [ ] Empty collections show an intentional empty state.

## Protected operations

- [ ] Suspend process cannot be submitted without the exact confirmation phrase.
- [ ] Terminate process is labeled destructive.
- [ ] Task run/suspend/resume requests include the selected task identifier.
- [ ] Process suspend/terminate controls are disabled when the API capability
      flags are false.
- [ ] User-role and role-resource updates block stale preflight state before
      sending `PUT` and verify the complete resulting collections.
- [ ] Task run remains pending while status is `-1` and is not verified unless
      a new successful `LastFinished` value is observed.
- [ ] Arbitrary POST, PUT, and DELETE requests in the explorer require typed
      confirmation.
- [ ] Cancel, purge, revoke, deactivate, and clear-count routes are labeled
      destructive.

## Browser and responsive review

- [ ] Chromium desktop at 1440×900.
- [ ] Chromium mobile at 390×844.
- [ ] Keyboard navigation reaches every primary control.
- [ ] Dialog focus, close actions, and disabled confirmation state work.
- [ ] Tables remain usable on narrow screens without breaking the page.

## Contest submission

- [ ] Public GitHub or GitLab repository contains the source and MIT license.
- [ ] README installation instructions have been reproduced from a clean clone.
- [ ] Demo video shows demo mode, live connection, a read workflow, a protected
      mutation, and secret redaction.
- [ ] Open Exchange application page links the repository and video.
- [ ] Submission is completed before the published deadline.
