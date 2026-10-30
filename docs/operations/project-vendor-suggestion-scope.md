# Main Line vendor suggestion index preparation

This runbook prepares the existing `projectVendorSuggestions` collection for one vendor to be recommended on separate Main Lines. It changes indexes only. It never deletes, merges, backfills or assigns scope to records.

The implementation and its tests do not authorize running these commands against any persistent database. Choose the exact environment/database, obtain explicit authorization for that target, and retain the approved change record before executing a live apply or rollback.

## Preconditions

1. Deploy compatible readers and validators to every application instance. New Main Line writes must remain unavailable until index readiness passes. Disable automatic index creation/synchronization for the suggestion model; an old instance must not recreate `project_vendor_suggestion_source_unique`.
2. Secure a verified data backup with a tested recovery procedure. The metadata backup written by this script is **not a data backup**. Record backup location, restore evidence, target, application version and operator in the operational change record, not source control.
3. Run read-only inventory for the exact target. Resolve every index-definition, malformed-source/scope and uniqueness conflict explicitly. Existing project-wide records missing Main Line fields remain project-wide. Null historical review rounds are reported, not rewritten.
4. Quiesce suggestion writes across **all** instances during the final inventory and cutover. This includes Admin project-wide writes. Mongo index metadata does not participate in application transactions, so a transaction fence alone cannot make an index cutover safe.
5. Repeat the dry run after writes are quiesced. Confirm target identity, backup evidence, absence of conflicts and recognized index definitions immediately before the authorized write operation.

## Read-only inventory

From `backend/`, with `MONGODB_URI` supplied through the approved secret mechanism, run:

```text
npx tsx src/migrations/project-vendor-suggestion-scope.ts --database=EXACT_DATABASE --dry-run
```

The target database must be explicit; the URI's default database is not selected implicitly. Inventory uses native collection reads and does not initialize Mongoose models or create missing collections. Save the report in an access-controlled location outside the repository. It contains record identifiers and index metadata, but no recommendation notes, vendor names, credentials or request tokens.

Review `indexConflicts`, `invalidRecords`, `projectDuplicateGroups`, `mainLineDuplicateGroups`, `requestDuplicateGroups` and `rollbackDuplicateGroups`. Rollback conflicts can legitimately exist after successful scoped use; they prohibit restoring old uniqueness. Other conflicts prohibit apply and rollback. A missing collection is not runtime-ready; explicit authorized apply can prepare it without inserting records.

## Authorized apply

After the preconditions and target-specific approval are complete:

```text
npx tsx src/migrations/project-vendor-suggestion-scope.ts --database=EXACT_DATABASE --apply --writes-quiesced --backup=/ABSOLUTE/SECURE/PATH/suggestion-indexes-before.json
```

The metadata file is created exclusively with permissions `0600`; use a new path for each operation. Backup failure stops the operation. A final inventory after backup precedes all index writes. The tool:

1. Builds/validates `project_vendor_suggestion_project_source_unique_v2`, using the old project/source/vendor key with partial filter `{ mainLineId: null }`. This covers both absent and null Main Line fields and preserves project-wide duplicate semantics.
2. Builds/validates `project_vendor_suggestion_main_line_source_unique_v2`, including immutable review-round and Main Line identity with partial filter `{ mainLineId: { $type: "string" } }`.
3. Preserves the existing creator/idempotency unique index, or creates that exact protection if missing after verifying no request-key collisions. Unrelated nonunique indexes remain unchanged; unknown unique constraints are reported and never removed.
4. Verifies all replacement protection before dropping only the recognized old conflicting `project_vendor_suggestion_source_unique` index.
5. Returns a fresh inventory. Require `ready: true` and no conflicts before reopening writes.

If the operation stops after either build, keep writes quiesced, inspect the resulting indexes and rerun the dry run. Valid partial progress is supported: reapplying is idempotent. A failed new index build leaves old protection intact. Never manually remove the old index to bypass a conflict.

After reopening writes, verify an assigned PM can read the correct approved source, recommend the same saved vendor independently for two Main Lines, and cannot create a duplicate for the same line/source/vendor. Confirm project-wide Admin behavior and request-key uniqueness. Use authorized test records or a designated validation environment; no seed script is part of this procedure.

## Rollback and recovery

First disable new scoped writes and retain the compatible reader/schema deployment. Do not roll application code back to a version that rejects valid zero-Design collaborative records or flattens Main Line suggestions into project-wide endorsements.

Run a fresh inventory. If `rollbackDuplicateGroups` is nonempty, restoring the old global unique index is impossible without losing valid scope. The tool refuses rollback. Retain the compatible indexes/readers, preserve all suggestions/audits, and resolve operational recovery through the approved change process. Never delete records to force old uniqueness.

Only when a fresh inventory proves old uniqueness satisfiable, backup/recovery is verified, writes are quiesced and this exact target rollback is approved:

```text
npx tsx src/migrations/project-vendor-suggestion-scope.ts --database=EXACT_DATABASE --rollback --writes-quiesced --backup=/ABSOLUTE/SECURE/PATH/suggestion-indexes-rollback.json
```

Rollback builds/verifies the old guard while retaining both replacement indexes and all data. Its presence deliberately makes runtime scoped-write readiness false. Keeping replacement protection permits a later safe reapply without a protection gap. This is an index rollback, not a downgrade of readers or source validation.

## Runtime availability

Each scoped write verifies exact index keys, uniqueness, partial filters and incompatible options through a native metadata read. Successful readiness is not permanently cached. Missing collection, incomplete preparation, unknown unique constraints, old conflicting uniqueness or an unavailable metadata read fail closed with a safe `503 PM_VENDOR_SUGGESTION_INDEXES_UNAVAILABLE` response. The application never applies this migration automatically.

## Local verification

The focused regression suite creates a disposable Mongo replica set and checks dry-run immutability, missing/null legacy filters, scoped and request uniqueness, valid collaborative zero-Design records, malformed/conflicting records, interrupted/idempotent apply, readiness refresh, active transaction callers, backup refusal and safe rollback/refusal:

```text
npm test -- tests/project-vendor-suggestion-scope-index.replica-set.test.ts
```

Do not point this test at a persistent local, staging or production database.
