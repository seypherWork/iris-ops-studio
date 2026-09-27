# IRIS Ops Studio — guarded Access Control pilot validation

Status: **EXPERIMENTAL / NOT READY FOR PRODUCTION OR PUBLICATION**.
No commit, push, release, Open Exchange change or in-place upgrade was performed.
The public 1.2.1 installation was not modified.

## Exact candidate

- Source package: `../irisops-guard-enrolled-role-20260927-b`
- Bundle SHA-256 inventory digest: `0bffa54b942afe9880c1239d2092b3287df91e5458b0db44d47357e41af8603c`
- Runtime inventory digest: `da85f19043f7c5579e31eaa3889209c045d04e27560b9cf3261dc7079ba3856d`
- 48 exclusively created, verified bundle files; productionReady=false.
- Historical bundles and published releases remain untouched. The earlier local
  `...-a` candidate was superseded by `...-b` after guide and copy corrections;
  neither was deleted.

## Evidence

- Node test suite: 226 passed, 0 failed. Syntax check: 99 JS/MJS files, 0 errors.
- Fresh IRIS Community 2026.2 installation of the exact B bundle in the new,
  loopback-only lab `irisops-pilot-clean-enrolled-20260927-g` (port 52812):
  result `../irisops-enrolled-clean-20260927-g/result.json` reports complete and
  stopped. Exact class/UI hashes, browser cache behavior, 45 native policy
  assertions, wallet/Web app workflows, stale preview rejection, restart,
  receipt recovery, sampled log secrecy and database integrity passed.
- On that same clean installation, a separate limited native user exercised the
  optional enrolled role workflow. The server rejected write-enable and preview
  while READ_ONLY. Under ACTIVE it granted and revoked one private resource,
  verified the complete grant-set readback, blocked an externally changed role
  with zero dispatch, and recovered the original receipt after restart without
  administrative writes. Desktop 1440×900 and mobile 390×844 UI steps passed.
- An additional native test refused a role that gained an administrative grant
  after enrollment. The exact temporary role, operator and user were removed.
  The legacy target policy and SUSPENDED deployment were restored.
- Visual evidence: `../irisops-role-ui-validation-20260927-52812-recovery/`.
  Captures contain no credentials. The temporary test username is visible.
- Existing labs `irisops-pilot-clean-enrolled-20260927-c` and
  `iris-ops-guard-dev-20260925` remained running. New labs e, f and g were
  stopped, not deleted; their containers and volumes remain recoverable.

## Defects found and corrected

1. The Access Control view reset the selected resource after a successful
   operation. A subsequent revoke could target another resource. The selection
   is now preserved across renders, and the complete two-operation UI test
   passed with native readback.
2. Initial enrollment alone did not protect against a target role later gaining
   administrative or inherited authority. Native state is now checked again
   before preview and immediately before Modify. A test confirms fail-closed
   behavior after an external administrative grant.

## Boundaries

- Only one explicitly enrolled `IrisOps_` test role and its listed private
  resources are exposed. This is not a generic user/role administration API.
- Native IRIS interfaces remain available to administrators; the guard is not
  an atomic compare-and-swap against concurrent changes outside the guard.
- The UI does not calculate affected users or effective access.
- The other catalogued process, task, user-role and Explorer mutations remain
  unavailable in the managed profile; see `mutation-inventory.json`.
- Existing-instance upgrades, production certificate/identity management,
  cross-machine installation and full security review remain unverified.
  Keep this pilot unpublished until these limits are deliberately addressed.
