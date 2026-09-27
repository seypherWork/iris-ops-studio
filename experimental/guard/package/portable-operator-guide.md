# IRIS Ops Studio — portable source pilot

EXPERIMENTAL / NOT READY FOR PRODUCTION. This independent source bundle installs
only the two-workflow managed-guard pilot into a NEW disposable local IRIS
Community 2026.2 container. It is not the public Ops Studio release, not a customer
upgrade, and does not protect other native IRIS access paths or every UI operation.

The server deliberately allowlists ONLY wallet `IrisOps_GuardProbeWallet`, web
application `/csp/irisops-guard-testweb`, and wallet permission resource names
`IrisOps_GuardProbeResource` / `IrisOps_GuardProbeAlternate`. These synthetic
fixtures are NOT created by the installer. Other targets are rejected. This is
a demonstrable laboratory pilot, not permission to manage arbitrary real assets.

## Requirements and boundaries

- Node.js 22+ and Docker Desktop using Linux containers, with sufficient disk.
- Docker access to the official base image if it is not already cached. The base
  is pinned by digest, not a floating tag. Source is bundled; the third-party
  IRIS image is NOT redistributed in this archive. Its terms still apply.
- Set `IRISOPS_DOCKER_EXECUTABLE` to your Docker executable. No npm install,
  original checkout, old Docker image, volume or certificate is required.
- Commands below run from this extracted directory; all result files must be NEW.
  Preserve this exact directory and receipts for later suspension.
- The local Docker operator is trusted. Fingerprints are review/drift checks,
  not signatures or a boundary against a hostile local administrator.

## 1. Verify and review preparation

```text
node portable.mjs verify
node portable.mjs prepare-plan irisops-pilot-example prepare-plan.json
```

Review the new container name, certificate-volume/helper names, Docker daemon,
bundle hash, and fingerprint. This plan performs no Docker writes. Preparation
builds a new image, may download the pinned official base if absent, and creates
a new private certificate volume plus a stopped certificate-generation helper.
After approving the exact plan (valid for 15 minutes):

```text
node portable.mjs prepare prepare-plan.json PREPARATION_FINGERPRINT prepared.json
```

Certificates are generated inside that NEW Docker volume, valid for two days,
for loopback 127.0.0.1 only. No existing certificate or private key is copied or
exported; the host trust store is unchanged. This is lab TLS, not a production
certificate service. Browsers do not automatically trust the new CA. Automated
tests validate it explicitly; do not disable TLS checks globally to open the UI.
Human browser trust/login onboarding remains a separate deployment decision.

## 2. Review and apply the fresh READ_ONLY installation

Choose an unused loopback port, such as 52807:

```text
node portable.mjs plan prepared.json 52807 install-plan.json
node portable.mjs apply prepared.json install-plan.json INSTALL_FINGERPRINT installed.json
```

Read and approve the installation plan before the second command. It expires
after 15 minutes. The new data volume, certificate volume, exact built image,
artifact hashes and daemon are revalidated. Installation is READ_ONLY, never
ACTIVE. HTTPS is bound only to 127.0.0.1; no native portal/admin HTTP port is
published. An independent readback checks bootstrap, UI bytes, native integrity
and blocked paths. The returned URL identifies the new managed UI.

No password or operator user is created. Image defaults are not a production
identity setup. Do not enter secrets into command arguments, logs or chat. This
bundle intentionally does not automate personal credentials or host trust.

## 3. Suspend and stop, without deleting anything

```text
node portable.mjs plan-rollback prepared.json installed.json stop-plan.json
node portable.mjs rollback prepared.json stop-plan.json STOP_FINGERPRINT stopped.json
```

Review/approve the exact fresh stop plan before applying. The pilot is set to
SUSPENDED and its immutable container ID is stopped. All data, certificates,
helper, build image and evidence remain. This is deactivation, not an image or
database-schema downgrade. Never delete a volume merely because the pilot is
stopped; retained volumes are not independent backups.

## Errors and limitations

Plans, receipts and files are created exclusively and never overwritten. A
failed preparation retains its result and any created resources. A caught
installation failure stops only its ownership-verified new engine. Inspect
`phase`, IDs and the installation `.events.jsonl` file before any retry. Power
loss/process termination may leave partial state; automatic crash recovery and
all failure positions have not been established. Do not reuse names blindly.

The source bundle is transportable between directories and builds locally;
cross-machine/OS compatibility is not established merely by that fact. This
pilot still has two managed workflows, local-only exposure and separate
credential/trust onboarding. It is not a general production installation path.
