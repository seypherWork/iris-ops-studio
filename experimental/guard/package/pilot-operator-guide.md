# Guided pilot operator — experimental, local-only

Validated 2026-09-26 against a new disposable IRIS Community 2026.2 instance.
This is not a production installer, an existing-instance upgrade, or a public
release. It does not enable ACTIVE mode or migrate the whole Ops Studio product.

## Prerequisites and exact target

Run from the server-guard checkout with Node 22+ and local Docker access.
Set `IRISOPS_DOCKER_EXECUTABLE` to the verified Docker executable path.
The operator requires the existing sibling directory
`irisops-guard-tls-package-20260926-m`, its 36-entry manifest, and the already
built local image `iris-ops-guard:tls-lab-20260926-m`.

- Manifest content SHA-256: `41f42b7ad6c80d8569880aca0c8a726f137fe421ed7daf048a5ab1757f77328b`.
- Image ID: `sha256:760c51184a9ccac3f99cf18410e8b726dc4de292a2ef4886807ba98311f2eb93`.

An existing dedicated laboratory certificate volume is also required. It must
have the validated CA/certificate/key layout and private-key permissions. The
operator mounts it read-only, reads only public certificates, and checks key
permissions without reading key content. It does not generate certificates,
install host trust, download software, or change Docker configuration.
The test certificate is short-lived: strict TLS validation may reject it later.

## Review, then install

Choose a NEW name beginning `irisops-pilot-`, a free loopback port, and an existing
certificate volume named `irisops-guard-...-cert-private`. Never target a customer
instance or a preserved lab. All output filenames must be new.

```text
node experimental/guard/package/pilot-install.mjs plan NAME PORT CERT_VOLUME PLAN.json
```

This writes a plan file but performs no Docker mutation. Review the name, new
data volume, certificate volume, pinned image, loopback origin, READ_ONLY mode,
expiry and fingerprint. Plans expire after 15 minutes. Only after approving that
exact plan, substitute the printed fingerprint into:

```text
node experimental/guard/package/pilot-install.mjs apply PLAN.json FINGERPRINT RECEIPT.json
```

The operator rechecks the Docker daemon, image, certificate-volume identity,
target absence and port before creating resources. It creates only a new data
volume and new container, verifies ownership, checks exact image files and TLS,
then performs native READ_ONLY bootstrap and independent readback. Only HTTPS
on `127.0.0.1` is exposed; native portal/admin routes on that listener are blocked.
It creates no user credentials and makes no promise that image-default accounts
are a production-ready identity setup. Any later login must use credentials
entered directly into the application, never a chat or command-line argument.

## Suspend and stop, retaining everything

```text
node experimental/guard/package/pilot-install.mjs plan-rollback RECEIPT.json ROLLBACK.json
```

Review the exact container ID and native state. After approving the fresh
fingerprint:

```text
node experimental/guard/package/pilot-install.mjs rollback ROLLBACK.json FINGERPRINT RESULT.json
```

The operator revalidates ownership and native state, changes only this pilot to
SUSPENDED, then stops its exact container ID. Both volumes and container remain.
Here rollback means deactivation of the newly installed pilot, not an image,
schema or IRIS-version downgrade. Separate cache replacement tests are documented
in [the cache validation report](upgrade-cache-validation-20260926.md).

## Failure handling and limits

- On a caught installation failure, the operator stops only an identified,
  ownership-verified new container and retains data plus receipt/event evidence.
  If ownership cannot be established, it refuses to act on that resource.
- Inspect `RECEIPT.json` and its `.events.jsonl` companion after failure. Do not
  blindly retry or reuse the target name. A power loss, terminated process or
  journal write failure can leave partial resources; automatic crash recovery
  and every interruption point have NOT been verified by this installer gate.
- A failed result or an empty reserved output is not proof that nothing changed.
  Stop and inspect exact resource identities before any further action.
- Fingerprints and labels detect mistakes/drift, not hostile local Docker
  administrators. This operator requires trusted local Docker authority.
- The plan binds certificate-volume identity, not immutable certificate bytes.
  Apply validates current strict TLS before bootstrap; it cannot prevent a
  separately privileged actor changing that volume later.
- Retained volumes are not independent encrypted backups. No volume is deleted,
  no key is exported and no existing project is cleaned up by this procedure.
- The package/image/certificate prerequisites are local. This is not yet a
  portable, self-contained installation bundle or a general deployment tool.

See [recorded verification](pilot-guided-validation-20260926.md). Do not infer
production readiness or authenticated application coverage from installer tests.
