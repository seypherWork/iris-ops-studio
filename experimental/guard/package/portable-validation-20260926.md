# Portable source pilot — validation 2026-09-26

Result: **portable laboratory delivery verified; general production release NOT
READY**. Nothing was committed, pushed or published. This adds packaging and
operator support, not new administrative operations or broader server authority.

## Exact final artifact

Sibling workspace archive `irisops-guard-portable-20260926-c.zip`, 128,030 bytes.

- ZIP SHA-256: `A9BC10B6C519891E64295DA4A35645FF3760E4D8B8137066C80EC47174956E2C`.
- Bundle content SHA-256: `a9757e1db6cb3b28657c30f1a9621b58a2152272d4843eb89231ac16812c089f`.
- Runtime content SHA-256: `b6cf268be024fd9622d2f5d3f29d6963c0e4f1738eecd984fc31188a9043ef71`.
- Built image: `sha256:5888c7352573c8f9fde1f75b65bd59395215316217db6b59b8ecc03f9a34e90f`.
- Base: `intersystemsdc/iris-community@sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.

43 manifest-bound content files plus `bundle.json`. Includes source, operator,
README and project LICENSE, not IRIS image binaries, test credentials, certificate
volumes, private keys or captured evidence. The 36 runtime entries are unchanged
from m except Dockerfile's base tag became an immutable digest; its manifest was
regenerated accordingly. a/b remain historical attempts, not the final candidate.

The ZIP was extracted into `irisops-portable-extracted-c`, separate from the
checkout and original runtime. `verify` passed under Node's permission model
with file reads limited to that extracted directory. Build/install then ran
from that extraction and created a new image, new certificates and new data.
The original official base image was already cached: download-on-empty-cache,
a separate PC, and cross-OS compatibility were NOT exercised.

## Tests and real observations

- **204/204 Node tests**, zero skipped: 193 prior plus 11 new portable checks.
- Fresh preparation and installation receipts in the extracted c directory:
  `prepare-plan.json`, `prepared.json`, `install-plan.json`, `installed.json`
  and its event journal. Initial mode READ_ONLY; TLS identity, key permissions,
  exact runtime files, native bootstrap/integrity and blocked native routes passed.
- [Final live evidence](portable-live-c.json): eight grouped checks, not eight
  distinct operations. Two synthetic mutations verified independently in native
  IRIS, values restored, two persistent receipts retained. Native test-user
  authentication, read-only denial, transition invalidation, session renewal,
  lost renewal response without retry, restart and read-only receipt recovery
  all passed. Recovery reported one dispatch and zero administrative writes.
- [Authenticated UI evidence](clean-ui-portable-c/result.json): no page exceptions
  or direct native-admin requests. Screenshots at
  [1440x900](clean-ui-portable-c/desktop.png) and
  [390x844](clean-ui-portable-c/mobile.png) were visually inspected. Read-only
  controls, disconnect and switching between the two workspaces were checked.
- [Cold/navigation/reload evidence](fresh-cache-portable-c/result.json): six
  desktop/mobile observations; requested UI bytes matched the manifest with
  cache enabled, no-store and zero cache hits.
- Browser tests trusted only this exact leaf public key in their isolated test
  profile. The separate HTTPS client validated the CA and loopback identity.
  No OS/browser-user trust-store changes occurred.
- Native database integrity and sampled Docker/HTTP error logs passed checks
  for the runner's synthetic password, Basic credential, recovery keys and
  private-key markers. This is not an exhaustive secret scan of every IRIS log.
- `stop-plan.json` and `stopped.json` in extracted c record SUSPENDED plus a clean
  stop, retaining everything. b also completed all eight groups before suspension.

Fixture plaintext credentials exist only in runner memory; no plaintext was
written into reports or ZIPs. Native test accounts and their native credential
records remain inside stopped disposable data volumes, alongside test resources.
The historical report field `credentialsPersisted:false` refers to runner
plaintext evidence, not absence of native account records.

## Defects / failed attempts retained

1. Initial functional runner a used new synthetic target/resource names outside
   the unchanged server allowlist. The server refused them. Read-only inspection
   confirmed original wallet value `IrisOps_PortableEdit:READ`, webapp disabled
   and receipt count zero. [Attempt a](portable-live-a.json) remains failed, not
   rewritten as success. It was suspended/stopped before b. The runner was fixed
   to use the exact allowlisted targets; server permissions were not expanded.
2. Bundle validation originally checked declared hashes but did not reject extra
   runtime files. c adds exact inventory matching and rejects symbolic links,
   nonregular inputs, extras, missing paths and duplicates. A separate extraction,
   `irisops-portable-extra-file-negative-c`, contains only an additional inert
   `runtime/classes/UnexpectedTest.cls` marker. Its verification exited 1 before
   Docker access. The clean final c bundle still verifies and passed all live
   checks. This defect concerned packaging input, not public production code.

## Final owned resources

| Engine | Container ID | Result |
| --- | --- | --- |
| `irisops-pilot-portable-20260926-a` | `445bd0005e8ab416a5924bbb1493ed52507d99fe1507df69cf7ff582cdda5057` | SUSPENDED, stopped; failed-run evidence retained |
| `irisops-pilot-portable-20260926-b` | `958b742b0138f970ebc8bc63ba245c885d36ca399b68764c1bb0edb1c38256b7` | SUSPENDED, stopped; two receipts retained |
| `irisops-pilot-portable-20260926-c` | `9b49061d94214a7fc7195e7a57bf6c93e1fa050d63e03b03f93baa256747a8cd` | SUSPENDED, stopped; two receipts retained |

Each engine retains its `<engine>-data` volume and separate
`irisops-guard-portable-20260926-{a,b,c}-cert-private` volume. Each certificate
helper `<engine>-tls-init` is also retained stopped. No cleanup/deletion occurred.
Original `iris-ops-guard-dev-20260925` remained running with ID
`d514da5b609c2bdb19ac13b2818531b42ab0b84087fef1abb154aa0d95212e38`.
This is identity/state preservation, not a fresh full backup/hash comparison.

## Honest publication boundary

This ZIP is suitable only to describe as an experimental, reproducible local
pilot with the documented prerequisites. It does not justify claiming that all
Ops Studio operations are server protected, that customers can manage arbitrary
targets, or that human installation is turnkey.

Before a general release: resolve operator identity and browser trust onboarding;
replace the synthetic target allowlist with an explicitly reviewed real-target
policy; validate that policy and its denied cases; define supported migration
and installation environments. Existing restricted behavior must not simply be
removed to make a demonstration work. Public texts and release approval must
reflect whichever narrower scope is actually selected.

No new real-clock expiry or certificate-rotation matrix was run in this block.
The prior m runtime evidence remains separate; this block repeats packaging,
login, both flows, browser, restart, recovery and suspension with the portable
build. See [operator procedure and limits](portable-operator-guide.md).
