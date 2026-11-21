# Amehnities migration safety assessment

## Status: comparison incomplete; backups not yet verified

Cloud was confirmed running. This session's database tools are bound to Cloud only, not the user's destination. No records, settings, files, permissions or app connections were changed.

The destination already contains Amehnities data according to the user. Its current contents cannot be inferred from its address. A workspace search for owned projects named Amehnities returned no match; this does not establish whether another project is connected to it. Code checkout would not grant private database access.

## Verified Cloud baseline

Exact count statement observed **21 November 2026, 05:37:36 UTC**. Other checks were separate read-only statements moments later; this is a live baseline, not one cross-system frozen snapshot. Ongoing submissions can change counts.

| Dataset | Cloud count | Destination |
|---|---:|---|
| Public base tables | 276 | Not inspected |
| User accounts | 778 | Not inspected |
| Profiles | 776 | Not inspected |
| Projects | 16 | Not inspected |
| Beneficiaries | 8 | Not inspected |
| Microplan entries (rows, not unique communities) | 14,028 | Not inspected |
| Eye daily reports (all projects) | 64 | Not inspected |
| Eye daily patients | 1,266 | Not inspected |
| Forms | 16 | Not inspected |
| Form submissions | 2,107 | Not inspected |
| Kobo form configurations | 1 | Not inspected |
| Storage buckets | 14 | Not inspected |
| Stored file objects | 11,925 | Not inspected |

Account consistency checks confirmed **2 accounts without profiles**, **0 profiles without an account**, **0 profiles with missing user IDs**, and **0 duplicated profile user IDs**. This is a review finding, not proof of corruption or permission to create/delete accounts. No identities were exported and no repair was attempted.

## Cloud file inventory

All 14 buckets are configured private. File availability and file-content checksums were not verified; these are database metadata counts and sizes only.

| Bucket | Objects | Metadata bytes |
|---|---:|---:|
| audio-verification | 2,962 | 1,153,833,935 |
| avatars | 16 | 17,734,491 |
| beneficiary-media | 59 | 87,315,247 |
| bloomberg-device-audit | 12 | 537,072 |
| bloomberg-evidence | 7,180 | 24,533,661,218 |
| ces-captures | 0 | 0 |
| chat-attachments | 3 | 16,497,906 |
| dashboard-uploads | 0 | 0 |
| facility-logos | 1 | 9,959 |
| irf-evidence | 1,683 | 874,386,910 |
| seeclear-evidence | 0 | 0 |
| uprp-uploads | 4 | 5,232,298 |
| voice-samples | 0 | 0 |
| vr-simulations | 5 | 121,815,574 |

No objects lacked numeric size metadata. The database export does **not** contain these file contents. Preserve bucket names and paths when downloading separately.

## Safe comparison procedure

1. Obtain the destination aggregate inventory through its own authorized administrator session. The companion `migration-read-only-inventory.sql` contains SELECT statements only. Do not change the live app connection to run it, share private keys in chat or use public keys to bypass access controls. If the destination is connected to another Lovable project, run the inventory from that project's chat and upload the results here.
2. Compare table availability, exact counts, column types and policy metadata. Missing/denied results remain unknown, never zero. Matching counts do not prove matching data or permissions.
3. Use isolated, restored copies for detailed row comparisons. Compare records by stable IDs and project scope; classify source-only, destination-only, identical and conflicting rows. Check deleted-record tombstones before replaying or merging data. Do not choose a winner solely from timestamps or name spelling.
4. Reconcile account IDs and dependent grants before records; matching email addresses alone do not justify replacing user IDs or roles. Review facility/programme scopes, donor/beneficiary associations and integration configuration without exposing secret values.
5. Compare file manifests by bucket/path, size and SHA-256 of downloaded contents; verify referenced private files can be opened by an authorized user and are blocked for an unauthorized one.

## Required backups and verification gates

**Cloud database:** In **More → Database → Manage → Settings → Export project data**, select **Export data → Database → Export → Start export**. Download from the emailed link or **More → Storage**. Cloud must be running; only one export is available every 24 hours. The export includes schema, records and user accounts with password hashes.

**Cloud files:** Download storage files separately through **More → Storage**. Keep private backups outside a public repository. The main file inventory is large, especially Bloomberg evidence; plan enough disk space and do not treat an interrupted download as complete.

**Destination database and files:** Take its own supported database backup and separate file copy through an authorized account administrator before any merge. Backup availability, scope and restoration support depend on its configuration and have not been inspected here.

**Verify, do not just download:**

- Record source, capture time, artifact size and SHA-256 for each archive; retain an untouched copy securely.
- Inspect archive integrity and included schemas using trusted tools without printing account hashes or secrets.
- Restore each database separately into disposable isolated test environments, never over either production database.
- Compare restored counts and schema to a baseline captured at backup time; explain writes between baseline and export rather than treating them as lost data automatically.
- Check retained account IDs, authentication, dependent relationships, scoped access and representative dashboards. Disable outbound jobs/webhooks in test environments so restore testing does not send notifications or duplicate external submissions.
- Verify separate file downloads against manifests and content hashes, then test protected photo retrieval.
- Mark each backup verified only when its isolated restoration and checks have passed. A SHA-256 alone proves an artifact's identity, not recoverability.

## Backup verification register

| Item | Status | Evidence needed |
|---|---|---|
| Cloud daily backup timestamps | Unverified | Backups page timestamps; unavailable to this chat |
| Cloud database export | Not supplied | Downloaded artifact, capture time, checksum |
| Cloud file backup | Not supplied | Complete downloads and verified manifest |
| Destination database backup | Unverified | Artifact and isolated restore results |
| Destination file backup | Unverified | Complete downloads and verified manifest |
| Cloud isolated restore | Not performed | Readback, account and access checks |
| Destination isolated restore | Not performed | Readback, account and access checks |
| Cross-system record differences | Unknown | Authorized destination inventory and isolated row comparison |

No database backup-like archive was found among the mounted upload filenames. This does not establish whether backups exist elsewhere. This assessment and its SQL are **not backups** and contain no beneficiary records, account credentials or password hashes.

## Hold point

Do not import, merge, change connection settings, delete Cloud, enable duplicate scheduled jobs or clear offline device storage. Next required evidence is the authorized destination inventory and securely retained database/file backups. An isolated restore still needs a disposable environment supplied or authorized by the user.