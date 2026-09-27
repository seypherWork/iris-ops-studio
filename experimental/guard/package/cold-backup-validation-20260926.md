# Cold backup / independent-volume restore — 2026-09-26

Status: VERIFIED FOR THIS ISOLATED LAB AND EXACT IRIS IMAGE.
Still NOT READY for production or publication. Public version remains 1.2.1.

## Outcome

The stopped g source volume was read-only throughout; neither g engine was
started. An archive was restored into a NEW seed volume and booted with the exact
reference image, without reinstalling. Two historical operation receipts survived.
Two further real operations were performed only on that disposable seed copy,
read back independently, and reverted. After clean shutdown, a second archive was
restored into a DIFFERENT NEW volume. All four receipt payloads/hashes remained
unchanged. Fresh native login recovered both new receipts using their correct
private proofs, with dispatchCount 1, administrativeWrites 0 and current state
MATCHES_BEFORE. No native change was replayed.

Both application databases passed the native structural integrity checker in
each restored instance, using `$$CheckList^Integrity(,dirs,0,,1)` with explicit
IRISOPS and IRISOPSGUARD directories and one worker. A successful IRIS startup or
archive hash alone was not treated as proof of database integrity.

## Evidence and immutable identity

`cold-backup-evidence-b.json`, 2026-09-26T17:35:29.257Z:
complete, fixturesRemoved, previousLabsPreserved, sourceWasNeverStarted and
hostExport true. encrypted and productionReady false; sameImageOnly true.

- Exact image: `sha256:d657acb6445cae0a7b96f917dcbc7fdcf4007d2a9d43b22cfbe5a654660e75a4`.
- Original volume: `irisops-guard-durable-20260926-g`.
- Original content/metadata fingerprint before AND after:
  `0b9255284819ff2c226365965cbf24813dcc605b6c1947f208210179d9cf4406`.
- Archive volume: `irisops-guard-cold-20260926-b-archives`.
- Seed volume: `irisops-guard-cold-20260926-b-seed-data`.
- Restored volume: `irisops-guard-cold-20260926-b-restored-data`.
- Seed engine: `irisops-guard-cold-20260926-b-seed`, ID
  `56e734f3e945904c7fa0f858a876da9f4a15ab605109e584a973088c992e4cc3`.
- Restored engine: `irisops-guard-cold-20260926-b-restored`, ID
  `31e850c1ce23ad1fd73f18eb56f9d95ead2e8dc1e326b868aa3f006c89bcdb5a`.

The archives are NOT inside the source checkout. Host directory:
`C:\Users\ilyas\Documents\Codex\2026-09-21\files-pasted-by-the-user-act\work\irisops-guard-cold-backup-private-20260926-b`.

| Archive | Bytes | SHA-256 |
| --- | ---: | --- |
| source-g.tar | 280268800 | 99565c829d72b01b527af1c8daa49c7e2aaba1b2ff3b1a31b8940def48d1f163 |
| checkpoint.tar | 280227840 | ebe507d41feed66568ded362c774b404b51c6c03402f7e2d7addf015ab43a220 |

The matching host files were read and hashed after Docker export and again at
completion. Restoration used the archive-volume copies; the exported host bytes
are proven identical, but a host bind-mount or different-PC restore was not run.

Seven live check groups cover archive creation/readback, original restore and
integrity, second checkpoint restore, proof-bound read-only receipt recovery,
second integrity check, packaged browser smoke test, and preservation/cleanup.
The unchanged JavaScript suite passed 160/160 tests, and all 46 JS/MJS files
under web, mock and the experiment passed syntax checks. Independent final host
hashes match both exported archives and the unchanged reference package ZIP.
Independent Docker inspection confirmed the old lab running, e/g stopped, and
both new engines stopped with exit code 0. These are scoped check
counts, not a claim of universal coverage or absence of all defects.

## What the file fingerprint proves

Every path is enumerated and sorted with NUL separators. The fingerprint binds
file type, numeric owner/group, permission mode, exact modification timestamp,
symlink target and SHA-256 of the logical bytes of EVERY regular file. It includes
the root directory metadata. Special object types are refused. Source and restored
fingerprints must match before starting either restored engine.

The fingerprint does not compare allocation/sparse-hole placement, inode numbers,
access/change timestamps, filesystem block layout, extended ACLs or xattrs. Thus
the evidence phrase "source volume bit-for-bit unchanged" refers to logical file
content, not an image of the physical volume/device. This is not a disk forensic
image. TAR SHA-256 separately protects archive transport; archives are not claimed
to rebuild deterministically or to be cryptographically signed.

## Defects found in the backup test and corrected

Attempt a was stopped BEFORE starting any restored IRIS engine. Its raw re-tar
digest did not match. Read-only diagnosis showed equal regular-file content, but
the existing target root kept a new modification time; GNU archive format also
did not preserve nanosecond modification times. Comparing regenerated sparse TAR
bytes is not a reliable logical-file equivalence test.

The backup runner now uses POSIX/PAX timestamps, delays directory metadata
restoration, and compares the explicit logical-content/metadata fingerprint.
Extraction occurs only after verifying a NEW, empty destination volume. It does
not keep pre-existing directory metadata as if it were a restored copy. The entire
workflow was rerun on new b volumes and new engines. Attempt a's archives, partial
restored volume and complete=false evidence remain retained; no overwritten or
deleted attempt was used to hide the initial failure. Runtime/product code did
not need a change for this milestone.

An initial read-only helper running as root with all capabilities dropped could
not traverse the private IRIS directory. It was replaced by a helper using native
owner UID/GID 51773, with no added capabilities or network. A diagnostic command
also needed Windows line-ending normalization; it never changed either volume.

## Browser and confidentiality checks

`clean-ui-cold-b/result.json`: complete true, pageExceptions 0,
directNativeRequests 0. Desktop 1440x900 and mobile 390x844 screenshots were
visually reviewed. Both guarded workspaces remain server-read-only with disabled
write controls and explicit reasons. No horizontal page overflow, shown password
or recovery proof. The existing temporary toast overlays helper text on mobile;
this is a known presentation limitation, not claimed fixed by backup testing.

Passwords/proofs/cookies/tokens used for the two NEW test operations lived only
in runner memory and normal native session/database handling. They are not printed
or exported as test credentials, and are not present in evidence or screenshots.
Docker logs were checked in memory against the generated secret values. This is
not a claim that the whole native IRIS database archive contains no sensitive data.

**Whole-system backups include native account configuration and session data.**
They must not be uploaded to GitHub, Open Exchange, public attachments or a public
release. The host folder is outside every Git repository inspected here, includes
`.gitignore` with `*`, and has a do-not-publish warning. No special Windows ACL or
encryption was installed. "Private" in its name means local/unpublished, not a
cryptographic access guarantee. The immutable checkpoint contains test fixtures;
that is expected for the recorded restore point.

## Final state and preservation

The final restored instance is SUSPENDED with its managed route disabled; its
seven owned test fixtures (user, role, wallet, webapp, three resources) were removed
after restoring target values. They are synthetic and recreable, not customer data.
All four receipts remain. Its container is stopped, not deleted. The stopped seed
remains the READ_ONLY checkpoint with fixtures intact; do not start it casually
and mistake it for a production installation or the cleaned final copy.

Both g source containers remained stopped, and the complete source fingerprint
is unchanged. The original 52801 lab retained its ID/running state, deployment
JSON and receipt count. All newly created helpers, volumes and engines remain
available for inspection. No Windows/Docker setting, existing DB, container,
volume, image or previous artifact was deleted. No commit/push/publication.

Documentation-only backup: sibling `iris-ops-guard-pre-cold-docs-20260926`, with
source/copy hashes verified before editing the two experimental README files.

## Operator boundary and next gate

Runner: `verify-cold-backup.mjs`, with verified Docker/Playwright/Chrome runtime
paths and optional IRISOPS_COLD_UI=1. A new run requires unused names/volumes and
a new matching sibling private folder containing only its warning and `.gitignore`.
The runner refuses existing names, a nonempty restore volume and any running
consumer of the volume it is about to copy. Mounts are explicit. Backup helpers
have no network, no capabilities and a read-only root filesystem; their source is
read-only. Engines expose only 127.0.0.1:52803 during the test. Run tests sequentially.
Do not weaken preconditions, auto-delete a failed target, restore over a live
instance or substitute a different image. Native /opt image files are prerequisites.

Remaining gates: archive encryption/access/retention policy, off-host/off-site
copy and actual cross-host recovery; saving/reloading the exact image for host-loss
recovery; corrupt-archive injection; abrupt crash/power-loss recovery; complete
system-DB integrity checks beyond the two explicit application DBs; supported
package/schema/IRIS upgrades; HTTPS/cookie topology and realistic bounded sessions;
general target policy and migration of the remaining product operations.

The practical next development block is HTTPS and session lifecycle, while keeping
this backup/restore procedure as a repeatable laboratory gate. Per-operation
recovery proofs are intentionally NOT reconstructed from a database backup: losing
the tab's proof still prevents HTTP receipt recovery, even when native records
are intact. No promise of a contest placement or production readiness follows.

## Official procedure references

- [InterSystems cold backup and full-system restore](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GCDI_backup): normal shutdown, complete relevant state and matching environment.
- [Durable %SYS and container storage](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=ADOCK): instance state outside the ephemeral container, still dependent on the correct image and mount topology.
- [Native integrity-check API](https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=GCDI_integrity): CheckList result checked explicitly, not inferred from launch success.
- [Docker volume backup/restore](https://docs.docker.com/engine/storage/volumes/): separate archive and destination volume; this test adds read-only sources and content/metadata validation.
