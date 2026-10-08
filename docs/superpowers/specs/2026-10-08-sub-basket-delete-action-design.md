# Delete Sub-Basket from the Configuration hierarchy

## Goal and scope

Add a direct **Delete Sub-Basket** action at **Configuration → Main Basket → Sub Basket**.

The user deferred requirement 2 (the Modify details side panel and bulk pricing) on 2026-10-08. It is excluded from this specification. Individual Main Line settings, pricing, margins, UOM and estimation/Procurement calculations remain unchanged.

This is a small UI integration of the existing deletion workflow. Initial worktree inspection was clean.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx` renders each Sub-Basket header with expansion, rename and an item count. Deletion is missing from this location.
- `KnowledgeBasketManagementDialog.tsx` already exposes **Delete** for Sub Baskets.
- `KnowledgeSubBasketDialogs.tsx` provides `KnowledgeSubBasketDeleteDialog`, including a fresh deletion-impact preview, exact-name confirmation, required reason, stale-version/impact handling, duplicate-submit protection and refresh-only recovery after a committed deletion.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts` implements the protected transactional deletion. It validates the exact parent/child IDs, version and impact token; blocks retained vendor references; deletes the Sub Basket and its contained Configuration records; handles incoming references; and audits the result.
- `knowledgeMutationSync.ts` already refreshes the affected catalogue and removes deleted records. Reuse it through the existing dialog.

## Requirements and UX

1. Add a compact **Delete Sub-Basket** action beside the current Sub-Basket header controls. Its accessible name includes the Sub-Basket name. Preserve expansion, rename, counts and existing layout.
2. Offer the action only to the Super Admin with the existing `ai_estimator_knowledge.configuration.lifecycle` capability, with valid loaded parent/child records and a non-archived parent. Existing backend authorization remains authoritative.
3. Resolve the selected Sub Basket by stable ID and verify its parent ID. Do not use names as keys or infer a target from the items visible on the current catalogue page. Same-named Sub Baskets must remain distinct.
4. Open the existing `KnowledgeSubBasketDeleteDialog`. Preserve its permanent-deletion semantics and all safeguards. The preview makes clear whether the group is empty or contains Configuration items that will also be deleted.
5. Keep the current exact-name confirmation, required reason, retained-vendor blocker, impact/version conflict handling and audit behavior. This is not a new deletion mechanism and does not loosen existing restrictions.
6. After success, remove the group and affected child cards through the existing query synchronization. Preserve the Main Basket, sibling groups and their expansion states where practical. Restore focus to a surviving parent/header if the triggering button no longer exists.
7. If deletion succeeds but catalogue refresh fails, show the existing refresh-only recovery state and never resubmit the deletion. If impact cannot load or access is lost, block submission and expose the existing error/retry treatment.
8. Support keyboard activation, accessible dialog focus, cancellation and narrow/mobile header wrapping. Keep controls compact and prevent action clicks from toggling the Sub-Basket accordion.

## Data, API and compatibility

Reuse the current endpoints:

- `GET /admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId/deletion-impact`
- `DELETE /admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId`

No new API, schema, permission, financial formula or dependency is expected. Preserve request identity/version/impact fields and the existing result contract. Existing deletion from the basket-management dialog remains available.

The existing deletion flow permanently removes the Sub Basket and its Configuration children; it is not archive-only or deletion of the heading alone. Draft references are cleaned according to the current service contract, retained history continues to show unavailable targets, and parent/sibling groups remain. This implementation task does not authorize executing deletion against live user data.

## Acceptance criteria

1. An authorized Super Admin can open deletion directly from a populated or empty Sub-Basket header under the correct Main Basket.
2. An unauthorized actor, missing/error parent catalogue or archived parent does not expose a working delete action. Backend denial behavior remains unchanged.
3. Same-named groups and paginated/filtered item lists still target the exact selected Sub-Basket ID and parent ID.
4. The existing impact/name/reason/vendor/conflict protections remain intact, cancellation does not mutate, and repeated clicks do not duplicate a request.
5. Success removes the correct group and children, refreshes related views and restores focus without disturbing siblings. Refresh failure offers recovery without another deletion.
6. Existing rename, expansion, Main Line editing and basket-management deletion regressions pass. Desktop/mobile rendered checks confirm usable controls and dialog keyboard behavior.
7. Focused frontend tests, frontend typecheck/build and `git diff --check` pass. Reuse the existing backend deletion tests if implementation touches that boundary; no backend behavior change is intended. There is no repository lint script.

## Assumptions, risks and open decisions

- The requested change is to expose the already-implemented delete operation at the hierarchy location the user uses.
- Primary risks are targeting a same-named sibling, bypassing the existing impact preview, losing focus after the trigger disappears and reporting a committed deletion as failed because refresh failed. Reusing the dialog and stable IDs addresses these risks.
- There are no material open decisions for this bounded integration. Bulk pricing is deferred and requires its own future specification.
- No migration, seed, backfill, commit, deployment or production mutation is included. Rollback is removal of the new UI entry point; actual deleted data is subject to the existing permanent-deletion policy.

## Status

Specification and separate task plan approved on 2026-10-08. The user selected Mode A. The scoped implementation, integrity review and deletion-flow verification are complete. The task plan records passing checks and 15 broader screen-test failures reproduced unchanged at the baseline commit. Requirement 2 remains deferred.
