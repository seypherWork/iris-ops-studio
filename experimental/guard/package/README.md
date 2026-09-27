# Clean-install package — isolated laboratory operator guide

Historical clean-install guide. For the latest portable source pilot, use
[portable-operator-guide.md](portable-operator-guide.md) and its
[validation report](portable-validation-20260926.md). For the prior candidate m
operator, see [pilot-operator-guide.md](pilot-operator-guide.md). The older artifact and
transport instructions below are retained as evidence, not the current target.

Experimental, NOT READY for production. This is a fresh-instance terminal
bootstrap and static runtime bundle, not an IPM release or an automatic upgrade.
Use only a new disposable IRIS Community 2026.2 instance. Do not run against a
customer instance or the preserved 52801 development laboratory.

## Reference artifact

Sibling workspace artifact: `irisops-guard-clean-package-20260926-e`.
Archive: `irisops-guard-clean-install-lab-20260926-e.zip`.

- ZIP SHA-256: `F0CE63DCF621CF759ECDB55E0172A342A988B35A7D464BF3F37315E4FBD03EFA`.
- Manifest content SHA-256: `fb369cd54e365a1069bb2946b8b86f395a3a83bc5770e65b7cf37716690fc2cf`.
- 34 hashed content files plus manifest.json. The ZIP also has directory entries.
- 16 normal runtime classes plus the separate terminal Bootstrap class. No
  TestBootstrap, ManagedNextApi, FaultApi, CountingAdmin or test credentials.
- The preserved negative Transport class is still a base-class compile dependency;
  the only installed guard dispatcher is ManagedApi, which uses the fixed HTTP
  transport instead. No historical probe endpoint is registered by this package.

The archive contains runtime, bootstrap, UI, Dockerfile and manifest; this guide
and validation runners remain in the source checkout. It is not a customer ZIP
with a one-click launcher. Versions a–d are retained development attempts, not
the reference artifact; do not deploy them.

## Rebuild without overwriting an artifact

From the checkout, with Node 22+:

```text
node experimental/guard/package/build.mjs ../NEW-SIBLING-ARTIFACT-DIRECTORY
```

The destination must be a new direct sibling of the checkout. Existing directories
are refused. The builder copies only enumerated classes and UI files, hashes every
file, and reads the written bytes back. Same content produces the same manifest
hash; Docker attestations/ZIP timestamps are not claimed to be byte-reproducible.

Verify the locally installed base image ID before building the image:
`sha256:68bc1d43c98ca816f2e98a185edc1250bebb6b763f8159da35c8543b09c0df70`.
The Dockerfile uses the existing `intersystemsdc/iris-community:2026.2-zpm` tag;
the tested build used `--pull=false --network=none`. Do not substitute a newer
tag/digest and assume this validation still applies.

## Install into the prepared package container

Start a NEW uniquely named container from the built package image. Publish its
web port on loopback only, for example `127.0.0.1:52802:52773`. Verify that no
container or process already owns the selected name/port. Do not reuse an old
data volume. The test runner pins names and checks previous-lab identity/state.

The image contains package files under `/opt/irisops-guard/` but intentionally
does not mutate a customer's existing database automatically on startup.
In an already authenticated %SYS terminal, load the bootstrap and review a plan:

```objectscript
set sc=$system.OBJ.Load("/opt/irisops-guard/bootstrap/IrisOps.Guard.Bootstrap.cls","ck")
// Check sc before continuing; stop on compilation errors.
set p=##class(IrisOps.Guard.Bootstrap).Plan("http://127.0.0.1:52802")
write p.%ToJSON(),!
```

Review `installed`, `origin`, `action` and `fingerprint`. Only after that review:

```objectscript
set r=##class(IrisOps.Guard.Bootstrap).Install(p.fingerprint,"http://127.0.0.1:52802")
write r.%ToJSON(),!
```

The administrator must have native configuration/database authority, including
%Admin_Secure and %Admin_Manage. This guide is not a proven minimal administrator
role recipe. Bootstrap creates no users/passwords. Tests use a disposable account
whose random password lives only in runner memory and is removed afterward.

New owned resources:

- Namespace/code database IRISOPS at `/durable/irisops-code/`.
- Receipt database IRISOPSGUARD at `/durable/irisops-guard-state/`.
- Nonpublic `%DB_IRISOPS`, `%DB_IRISOPSGUARD`, narrowly scoped IrisOps_GuardStorage.
- Guard receipt/lock/deployment mappings to IRISOPSGUARD; boot binding to IRISTEMP.
- `/api/irisops-managed-guard`, initially READ_ONLY; `/csp/ops` static file hosting.

Existing resource names, directories, namespaces or applications are not adopted
or overwritten blindly. A valid repeat install returns NO_CHANGE and does not
restore old write grants. A stale reinstall must not suspend an existing service.

UI: `/csp/ops/guard-managed/web/index.html#secrets` on the configured loopback
origin. Only the two named disposable operation targets remain supported. The
UI chooses neither the backend destination nor its allowed origin: both are
server-controlled. Arbitrary hosts, proxy headers and HTTPS are not enabled here.

## Failure and suspension

If a late native step fails after creation begins, the installer attempts to
disable only its exact owned managed application and retains partial resources.
It does NOT delete databases to hide a failure. An incomplete namespace causes
subsequent installation to stop for inspection; automated partial-bootstrap
repair is not implemented. Do not edit the marker to bypass that check.

After successful installation, use the existing
[deployment lifecycle guide](../deployment-operator-guide.md) for reviewed
READ_ONLY / ACTIVE / SUSPENDED transitions and operation receipt recovery.
Those commands operate in IRISOPS. Changing the mode requires a fresh plan.

Final reference container `iris-ops-guard-clean-20260926-e` was verified SUSPENDED
with its native guard app disabled, then stopped, not deleted. Its receipts and
data remain in that container. Do not delete/recreate it to restart the service.

## Evidence and limits

See [validation report](clean-install-validation-20260926.md). The runner
`verify-clean-install.mjs` builds no image and makes no network downloads. It
expects the matching local artifact/image, creates an isolated container and
checks native results. Set IRISOPS_CLEAN_UI=1 with verified Playwright/Chrome
runtime paths for actual browser checks. Never run integration suites together.

Reference e was started without a volume: its engine configuration and database
registration still belong to that retained container. Keep it; do not treat its
image alone as a backup of installed state. Do NOT attach an empty volume to e
and assume its existing data will be migrated.

A later independent run used the EXACT SAME image on a NEW named volume with
`ISC_DATA_DIRECTORY=/durable/iris`. Same-image replacement now passes: a different
container reuses installed configuration, private databases and operation receipts.
See [durable replacement report](durable-replacement-validation-20260926.md) for
the tested names, safety checks and explicit limitations. The image itself still
does not declare a default volume or durable environment variable; the launch
configuration must supply and verify both. A subsequent
[cold-backup/restore test](cold-backup-validation-20260926.md) now passes for the
same exact image and separate new volumes, including native integrity checks and
receipt recovery. Abrupt crash recovery, cross-host restoration, package/schema
upgrades and recovery from a partially initialized volume remain untested. Never
run two IRIS engines against the same volume simultaneously.

An optional isolated TLS profile is now built with `build.mjs NEW_SIBLING --tls`.
See [TLS validation and limits](tls-validation-20260926.md): real native cookies,
two operations, browser review and restart passed. A native-expiry mismatch was
found and fixed: the guard follows the actual native expiry, approximately 60s
in this fresh IRIS instance, even though its HTTPS policy ceiling is larger.
No native token policy was increased and no hidden renewal was introduced.

Next gates include explicit bounded authorization renewal, a supported production
gateway/certificate lifecycle, combining TLS with the durable topology,
encrypted/off-host recovery, general target policy and full-product migration.
The TLS profile is LAB ONLY and its private volume is not an IRIS database backup.
Nothing here constitutes protection of arbitrary native administration outside
this guard. The default HTTP artifact instructions above remain historical;
do not substitute an older artifact for the latest TLS-tested source.

Configuration uses the documented
[Config.Namespaces API](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=Config.Namespaces)
and [SYS.Database API](https://docs.intersystems.com/irislatest/csp/documatic/%25CSP.Documatic.cls?CLASSNAME=SYS.Database).
