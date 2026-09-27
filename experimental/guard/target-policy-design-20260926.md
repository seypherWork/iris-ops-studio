# Target enrollment and initial access — staged 1.3 work

Historical design snapshot. The local runtime/browser integration was subsequently
validated on 2026-09-27; see
[current evidence and remaining gates](enrolled-integration-validation-20260927.md).
The fixed-target comments below describe the starting milestone, not current
development source. The public package and immutable portable c remain unchanged.

The competitive objective is useful server enforcement with evidence, not a
higher test count. Public 1.2.1 and portable pilot c remain unchanged. The policy
class in this checkout is staged and NOT used by current HTTP dispatchers.

## Enrollment implemented in the staged native class

One explicitly chosen existing wallet, one existing web application and at most
eight explicitly named wallet-policy resources. There is no wildcard, discovery
of all customer objects, permissive default or legacy-target fallback.

`TargetPolicy.Plan` requires the same native administrative resources as deployment
control (`%Admin_Secure:U` and `%Admin_Manage:U`) and a SUSPENDED deployment. The
five-minute plan binds normalized selection, current native metadata, deployment
state, previous policy and policy-class revision. Its output contains names and
hashes, not native configuration values or credentials.

`Apply` repeats those checks while holding the deployment lock. A single journaled
transaction records the selection, a new authorization generation and history.
It does not change a wallet or application, grant a role, create an operator,
enable the service, or enable writes. Corrupt/absent/revoked configuration denies
selection. `RevokePlan`/`Revoke` retain history and objects, invalidate the generation
and remain SUSPENDED; revocation does not require a missing target to reappear.

The current class conservatively rejects system/admin paths, wildcard/URL aliases,
system namespaces, namespace-default applications, public wallet resources,
authentication profiles other than password-only, and application-role elevation.
These are enrollment restrictions, not proof that every business application is
supported. Native permissions remain independently authoritative for execution.

## Required integration — not completed here

1. Replace fixed targets in transport, previews, immediate pre-dispatch checks,
   readback and recovery with one policy generation. Do not weaken only one layer.
2. Native metadata validation must remain conservative for the enrolled app;
   switching the target must never switch which object a historical receipt reads.
3. Capabilities return the enrolled targets and permitted policy choices only
   after native authentication. With no valid enrollment they state that setup
   is required; no implicit demo target or direct native API fallback.
4. Browser contracts bind previews, results and recovery to that exact target and
   generation. Revocation or changes clear earlier channels/previews and require
   an explicit new connection. Historical receipts are retained, not rewritten.
5. Test two distinct non-hardcoded target sets, cross-target attempts, policy
   changes between preview and execute, revocation during recovery, permissions
   removed after preview and interrupted requests. Verify zero unauthorized PUTs.

Do not mark the staged policy as enforcing any of these paths until tested through
the actual HTTP API. Current compiled native tests establish enrollment behavior,
not complete runtime integration.

## Initial user access — selected direction, not yet automated

Use an existing native IRIS operator identity and permissions. Do not create a
service identity with broader authority, collect a personal password in the CLI,
reuse image defaults silently, or grant `%All` for convenience. A new installation
must clearly explain that READ_ONLY/enrollment are separate from native login.

For a normal deployment, TLS must be trusted by the user's browser through an
explicit operator-managed certificate choice. The current self-signed two-day
lab CA and exact-leaf test-browser exception are not finished human onboarding.
Do not change Windows trust or bypass TLS globally without a separate reviewed
action. A setup screen is usable only after this trust boundary is resolved.

The UI should report missing setup, native authentication rejection, unavailable
native permissions and server READ_ONLY distinctly. Credential entry stays in
the application, and neither logs nor setup reports may contain it. An expired
initial IRIS password must have an explicit native password-change procedure;
the guard must not publish another administrative port to work around it.

## Release gate

1.3 may claim server enforcement only for the integrated, real-target workflows
that pass the end-to-end gate. It must retain the direct-IRIS-access limitation:
the guard does not revoke privileges or protect administrative endpoints outside
its own route. Cross-machine install, browser onboarding, supported target
profiles and migration limitations must be stated separately from test evidence.
