# Security policy

IRIS Ops Studio is an operator interface and must be deployed behind the same
network and identity controls as the IRIS SysAdmin API it accesses.

## Reporting a vulnerability

Do not publish credentials, tokens, private keys, customer data, or an active
exploit in a public issue. Contact the repository maintainer privately with a
minimal reproduction and the affected version. Allow time for triage before
public disclosure.

## Deployment expectations

- Use TLS between the browser and IRIS.
- Grant the connected user only the privileges needed for its role.
- Keep `/api/admin` and `/csp/ops` off the public Internet unless protected by
  appropriate authentication, authorization, and network controls.
- Rotate credentials according to organizational policy.
- Review administrative actions in the IRIS audit log.
- Build from a pinned, supported IRIS image for production deployments.

The UI confirmation mechanism reduces accidental actions; it is not an
authorization boundary and does not replace server-side IRIS security.

The client refuses cross-origin request and async-status URLs before attaching
an access token. Changing the selected connection cancels in-flight login or
async polling results. Guided access updates also repeat their precondition read
immediately before `PUT` and block stale or malformed state. These controls are
defense in depth; they do not make an untrusted browser environment safe.
