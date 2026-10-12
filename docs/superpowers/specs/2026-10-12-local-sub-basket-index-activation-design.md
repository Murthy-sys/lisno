# Enable Sub-Basket configuration in the local app

Date: 2026-10-12
Status: Specification and plan approved; Mode A selected. Local index transition completed and verified on 2026-10-12.

## Goal

Allow Procurement to create a Sub-Basket configuration draft under the selected existing Main Basket in the local app, preserving all existing local records and Configuration behavior.

## Confirmed behavior and evidence

- The user confirmed this error occurs locally. The screenshot shows `Configure Sub-Basket` returning the setup-unavailable message when creating a draft.
- `vendor-basket-request-indexes.ts` emits that exact message with code `PROPOSAL_TARGET_SETUP_UNAVAILABLE` when recognized legacy indexes remain, replacement indexes are missing, or index definitions conflict. Draft creation calls this guard before proceeding.
- A read-only native-driver inspection of the loopback database `lisno_demo`, collection `vendorBasketRequests`, confirmed both replacement indexes are already present and correct, but both obsolete indexes remain.
- There are four request documents, zero legacy duplicate groups, zero target duplicate groups and zero conflicting index definitions. Read-only report: `/tmp/lisno-sub-basket-local-index-dry-run.json`. No documents or indexes were changed.
- The earlier feature implementation prepared and tested an explicit index migration, but did not apply it to configured databases. This outstanding local setup step causes the reported failure; the recent CSS change does not cause it.

## Scope and exact target

Use the existing `backend/src/migrations/vendor-basket-request-target-index.ts` procedure against **loopback `lisno_demo.vendorBasketRequests` only**. Verify the two existing target indexes, then remove only these recognized legacy indexes:

1. `vendorKey_1_proposedNameNormalized_1`
2. `vendorNameNormalized_1_proposedNameNormalized_1`

Retain these replacements and all unrelated indexes:

1. `vendor_basket_request_pending_vendor_target`
2. `vendor_basket_request_pending_name_target`

The replacements include `targetParentBasketId` in pending-request uniqueness, allowing the same Sub-Basket name under different Main Baskets while preventing duplicates within the same parent.

## Requirements and invariants

- Preserve every existing request, vendor, basket, proposal and other local document. No document update, deletion, seed, import, restore into the app database, or backfill.
- No production connection, database synchronization, Configuration screen change, authorization change, deployment, dependency change or application-source rewrite.
- Refuse any connection that is not the explicit loopback database named above; do not print credentials or database contents.
- Before writes, identify and temporarily pause local application writers, capture a private logical backup and exact index metadata, and verify backup readability/completeness using an isolated disposable restore or equivalent strong evidence. Resume only the identified local processes afterward.
- Run the migration's final read-only inspection immediately before applying it. Stop on changed inventory, unexpected indexes, duplicates, backup failure or unverified writer quiescence.
- Preserve both replacement uniqueness protections throughout the transition. Never use broad `syncIndexes`, collection drops or a general reset.
- Verify request document counts and deterministic content hashes before/after, unchanged unrelated indexes, and success of the exact readiness guard against the local collection.
- Verify draft creation through disposable integration tests. Do not create a throwaway vendor/request in the user's local database. The user's actual draft can be retried after setup is ready.

## Safety, rollback and failure handling

This is an index-only database change. No API or UI contract changes are needed. Users should see the existing configuration workspace after successfully retrying creation.

The existing procedure checks duplicate groups and exact index definitions, captures metadata, validates again before writes, and supports retry after a partial transition. If any prerequisite fails, do not force the migration or rewrite data.

Rollback uses the prepared `--rollback` procedure only while paused writers and a fresh inspection prove legacy uniqueness remains valid. Once valid requests with equal names under different parents exist, restoring the old indexes would be unsafe; the procedure must refuse rather than deleting those requests. The verified backup is retained privately as a recovery artifact, not committed.

## Acceptance criteria

- **AC1:** The local setup guard succeeds and Sub-Basket draft creation is no longer blocked by the obsolete indexes.
- **AC2:** Exactly the two named legacy indexes are removed; both correct replacements and all other indexes remain.
- **AC3:** Existing request count and content hashes are unchanged; no records in any collection are modified by this operation.
- **AC4:** Backup verification, final dry run, apply result and postflight evidence are recorded without secrets or record content.
- **AC5:** The focused disposable migration/creation tests pass. Local application writers are resumed, and database sync and production remain untouched.

## Assumptions and open decisions

The user wants the local blocker fixed; production is out of scope. No material product decision remains. The user approved this specification, the separate task plan, and Mode A. The exact local index operation has now been performed under that authorization.

## Verified outcome

- The existing migration removed exactly the two named legacy indexes. Both replacements and all unrelated indexes retain their original definitions.
- All 3,150 documents across 141 collections, including all four basket requests, retain identical BSON content hashes. Collection options are unchanged.
- A full private logical backup was restored into an isolated disposable server and compared against the source before applying the migration. Final dry-run inspection found zero conflicts or duplicate groups.
- The local readiness guard passed before and after resuming the original backend. The backend returned HTTP 200 after a 21.6-second pause.
- The two focused disposable replica-set suites passed all 40 tests, including existing-parent Sub-Basket creation. No throwaway records were created in the user's database.
- No application source, Configuration behavior, production database or sync setting changed. The user can retry the actual configuration draft.
- Detailed evidence, recovery artifact location and verification limitations are recorded in the [task plan](../plans/2026-10-12-local-sub-basket-index-activation.md).
