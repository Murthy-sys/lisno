# Delete Main Line directly from the Configuration hierarchy

## Goal and interpretation

Add a compact direct **Delete** action to Main Line cards in **Configuration → Main Basket → Sub Basket → Main Line**, following the direct Sub-Basket deletion action.

Interpret “mini line” as **Main Line**, the item inside a Sub-Basket. There is no separately named Mini Line entity in the inspected Configuration hierarchy. This interpretation is explicit for specification approval; it does not introduce a new nested item type.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeIndexItemCard.tsx` exposes the linked item name, a rename control and a menu containing Open item. It has no direct delete action.
- `KnowledgeItemWorkspacePage.tsx` already supports permanent deletion using `permanentlyDeleteKnowledgeMainLine`, an expected version and a required reason. The workspace offers Delete when the backend's `allowedActions` includes `archive`, the existing internal command name.
- `KnowledgeLifecycleDialogs.tsx` supplies the existing Delete this Main Line confirmation, irreversible-deletion explanation and reason field. It does not currently require typed-name confirmation or a deletion-impact token; those belong to the separate Sub-Basket contract.
- `backend/src/services/ai-estimator-knowledge-item.service.ts` validates the stored mutation actor and current version in a transaction, rejects active Main Lines until deactivated, deletes the line and its revisions/sections/price versions, cleans existing Configuration references and writes the audit event. Parent groups and other Main Lines are retained.
- The existing endpoint is `DELETE /admin/ai-estimator-knowledge/main-lines/:mainLineId`, protected by `ai_estimator_knowledge.configuration.lifecycle`. Request fields are `expectedVersion` and `reason` for the normal workspace flow.
- `knowledgeMutationSync.ts` already contains `commitKnowledgeMainLineRemoval` for immediate stable-ID cache removal and `syncKnowledgeMainLineDeletion` for downstream invalidation. Preserve these shared cache families, including estimation and Procurement.

## Scope and non-goals

Expose the existing Main Line deletion operation from its hierarchy card, including ordinary Main Lines directly under a Main Basket. Preserve the existing workspace entry point and the completed Sub-Basket action.

No changes to temporary-item workflows, price calculations, UOM, estimation modes, approval history, published artifacts, bulk pricing or the deferred Modify details requirement. No new API, permission, schema, dependency or deletion semantics are expected. Do not automatically deactivate active Main Lines.

## Requirements and UX

1. Add a compact text Delete action beside the Main Line name/rename controls, with an accessible name including the Main Line name. Preserve the link, overflow menu, metrics and card size. Support wrapping and mobile touch targets without adding a new card section.
2. Expose a working action only for the Super Admin with lifecycle permission and the backend-provided allowed deletion action. Do not enable deletion from an errored or unresolved catalogue or an archived/mismatched parent. Active Main Lines retain the existing deactivate-before-delete rule.
3. On opening, load current detail by stable `mainLineId` before enabling confirmation. Validate returned ID and original parent/Sub-Basket identity; names are presentation only. Use the reviewed current version, status, name and allowed actions. A moved or unavailable line must be reviewed again from its current location.
4. Reuse the existing permanent-deletion confirmation presentation and API. Identify the selected Main Line and parent context, retain the required reason, and explain that its owned Configuration records will also be deleted. Do not delete immediately on the card click.
5. Cancellation makes no mutation and returns focus to the triggering action. Confirm submits the exact reviewed ID/version and trimmed reason, with synchronous duplicate-submit protection and pending-state controls.
6. Preserve backend rejection handling for active items, version conflicts, missing items and authorization failure. A conflict requires fresh detail and another explicit confirmation, never an automatic destructive retry. Loss of permission or target validity while open must block confirmation.
7. After committed deletion, immediately remove only that Main Line from relevant caches, refresh dependent views and announce success. Keep its Main Basket, Sub-Basket, siblings, filters and expansion state. Deleting the last child leaves its Sub-Basket present and empty; adjust an empty final item page if needed.
8. Treat catalogue refresh as a separate step after committed deletion. A refresh failure must clearly retain the successful deletion state and offer refresh-only recovery; it must never send a second DELETE. Use explicit refresh-error propagation where necessary rather than assuming cache invalidation throws on read failure.
9. Restore focus to the surviving Sub-Basket or Main Basket header after deletion, with a stable page fallback if filtering removes those controls. Keep keyboard operation and existing dialog focus behavior.

## Compatibility and worktree constraints

The previous Sub-Basket task is present as uncommitted modifications in `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx` and `knowledge-index.css`, plus its specification and task plan. These changes are understood and must be preserved. Capture their latest per-target diffs again before implementation ownership is assigned.

Any optional props added to the shared lifecycle dialog must preserve existing activation, deactivation and workspace deletion consumers. Keep backend authorization authoritative. Current Configuration consumers refresh by stable ID; approved financial/customer artifacts are not rewritten by this UI action.

## Acceptance criteria

1. An authorized user can start deletion from a draft/inactive Main Line card without opening its workspace. Unauthorized users and active/nondeletable items cannot perform the operation through the new control.
2. Same-named lines in different groups, filtered/paginated lists and a line with changed parent/version target only the reviewed stable ID and enforce the existing conflict policy.
3. Confirmation identifies the correct line, requires a reason and supports keyboard cancellation. Duplicate submission sends one mutation. Request failure preserves the visible line and provides a useful error.
4. Success removes the correct card and stale detail/history caches, preserves siblings and its parent groups, updates dependent catalogue views and restores focus safely. The final child and final page cases remain usable.
5. Failed refresh after committed deletion offers retry without another DELETE. Lost access or an invalid current target blocks an already-open confirmation.
6. Existing Sub-Basket deletion, rename, card navigation, workspace deletion and lifecycle behavior remain intact. Focused tests, frontend typecheck/build, desktop/mobile rendered checks and `git diff --check` pass for this change.

## Verification, risks and limits

Verification should cover index/card integration, deletion redirect regressions, query synchronization and any changed shared lifecycle props. Include actual rendered dialog interactions and narrow-width checks using synthetic data. Run backend deletion tests only if implementation changes that boundary.

The prior task established 15 pre-existing failures in `KnowledgeScreens.test.tsx` at baseline `684a2c22b09e91a61310953d68837de87861ad3d`. Do not mistake these for new regressions or silently alter unrelated expectations; compare any rerun with that evidence. There is no repository lint script.

Principal risks are wrong-line targeting, stale detail/version confirmation, duplicate deletion after a failed refresh, loss of keyboard focus and accidental regression of the existing Sub-Basket work. Stable IDs, reviewed detail, one-shot mutation state, existing cache helpers and focused tests address these risks.

No migration, seed, deployment, commit, push or deletion of live user records is authorized by this implementation request. Code rollback removes the new entry point; actual deletion retains the existing permanent-deletion semantics.

## Status and open decisions

Specification and separate task plan approved on 2026-10-08. The user selected Mode A. “Mini line” is confirmed as the existing Main Line entity. Implementation, integrity review and focused automated checks are finished. Functional desktop/mobile checks were performed with synthetic data; a final browser accessibility rerun after a scoped caption contrast correction was denied and remains unverified. See the [task-plan delivery record](../plans/2026-10-08-main-line-delete-action.md) for exact checks, baseline failures and exclusions.
