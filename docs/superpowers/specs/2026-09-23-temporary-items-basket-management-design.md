# Temporary-item creation and Main/Sub-Basket management

Date: 2026-09-23
Status: Proposed; specification approval pending. Application code has not been changed for this request.

## Goal

An authorized Super Admin can create a temporary item from a Main Line's recommendation flow, create Main Baskets and Sub-Baskets without abandoning that flow, and manage both basket levels from Estimation Configuration. Creation failures must be actionable and must not leave partial catalog records or lose the user's form.

## Current behavior and evidence

The user reported `INTERNAL_ERROR` at the basket-scoped `/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/main-lines` endpoint while creating a temporary item. The endpoint supports GET and POST; the exact failing request body, method, and server exception have not been captured. POST is the working hypothesis based on the reported action. The reported instance has not yet been reproduced, so the original cause remains unconfirmed.

Current source establishes the following:

- `backend/src/routes/ai-estimator-knowledge-admin.ts` accepts `itemType: "temporary"`, an optional `subBasketId` or `subBasketName`, and a name on POST. A successful creation returns 201 with item detail.
- `backend/src/services/ai-estimator-knowledge-item.service.ts#createMainLine` creates the item, draft revision, sections, optional new Sub-Basket, and audit records within a Mongo transaction. It then reads item detail after commit. A failure of this final read can therefore report failure after creation has committed.
- `backend/src/models/AiEstimatorKnowledgeMainLine.ts` enforces unique normalized non-archived item names within the Main Basket. This applies across both item types and all Sub-Baskets in that Main Basket.
- Main-line creation does not translate Mongo duplicate-key exceptions into `ApiError`. Its route forwards exceptions, and `backend/src/middleware/errors.ts` turns non-`ApiError` exceptions into the generic 500 reported by the user. This is a confirmed error-handling gap, but does not prove a duplicate caused the reported request.
- `CreateKnowledgeItemDialog.tsx` already supports temporary items and attempts catalog reconciliation after ambiguous failures in related-item flows. Ordinary Configuration creation does not use that same recovery path. Inline Main Basket creation is controlled by a prop and is not enabled at every entry point.
- The dialog represents Sub-Basket selection primarily as free text. The backend can create or reuse the typed name in the item transaction, but the UI does not provide a general Sub-Basket manager.
- `KnowledgeBaseIndexPage.tsx` already exposes Add main basket and Manage main baskets. Its manager supports versioned editing and confirmed permanent deletion. Current Main Basket deletion cascades through contained Main Lines and Sub-Baskets, even when populated; historical specifications describing empty-only deletion are not current behavior.
- The reference service supports independent Sub-Basket creation. Existing uncommitted work adds versioned Sub-Basket rename restricted to groups whose children are all Draft, plus draft child editing/removal in `KnowledgeBudgetAlterationBuilder.tsx` and `KnowledgeDraftSubBasketDialogs.tsx`.
- There is currently no Sub-Basket deletion endpoint or general Configuration manager for Sub-Baskets.
- `ai-estimator-knowledge-cascade.ts` removes references by Main Basket and Main Line IDs, but has no Sub-Basket-ID target support. Sub-Basket deletion must cover whole-group references as well as child-item references.
- The actor guard requires the sole active Super Admin. The route-operation registry separately enforces read, create, update, and lifecycle permissions.

### Existing worktree

The initial `git status --short` showed existing modifications in backend knowledge services/routes/contracts/tests, frontend recommendation editing and query synchronization, and unrelated user-administration work. Existing specification/plan files and `KnowledgeDraftSubBasketDialogs.tsx` are also untracked. These are prior work, not changes made by this request.

Relevant service and route diffs were inspected. Existing draft-group guards and aggregate-version coordination must be preserved. Before implementation writers start, recapture the dirty-path set and inspect each assigned target's full current diff. Do not revert, stage, reformat, or absorb unrelated changes. The new specification is the only repository artifact created in this stage.

## Scope and non-goals

Included:

- Reproduce and fix the temporary-item creation failure at its actual source.
- Complete Main Basket and Sub-Basket selection/creation in the Main Line temporary-item flow.
- Extend the existing Configuration basket manager to cover both levels, including empty baskets.
- Expose Main Basket creation, existing editing/deletion, Sub-Basket creation, rename, and confirmed deletion.
- Preserve recommendation drafts while catalog changes save independently.
- Complete authorization, validation, audit, concurrency, reference cleanup, and query synchronization for these actions.

Excluded:

- Changing pricing, tax, margin, Estimate/Design approval records, or recommendation semantics.
- Moving existing items between baskets, converting item types, or changing activation/completion rules.
- A broad Configuration redesign, new dependencies, mobile-app changes, or unrelated administration fixes.
- Live deletion of the user's catalog, migrations, seeds, deployment, commits, or pushes.

## Recommended approach and material choices

Extend the existing service/API/dialog architecture and basket manager. Reuse the established stable IDs, expected versions, transaction handling, audit conventions, and related-item reconciliation.

For Sub-Basket deletion, use the current Main Basket convention: show the impact and require an exact-name confirmation and reason before deleting the selected group and its contents. This makes Delete consistent across both hierarchy levels. An empty-only alternative would reduce the deletion footprint but require users to remove each child separately and would differ from current Main Basket behavior. Approval of this specification accepts confirmed cascading deletion; no existing catalog is deleted during implementation.

For rename, distinguish full Configuration management from the existing recommendation editor. The Configuration manager may rename a Sub-Basket under a non-archived Main Basket without changing its children's lifecycle. Recommendation-editor rename retains its current all-children-Draft rule. This preserves the earlier inline workflow while giving the authoritative Configuration workspace the requested management controls.

## Functional and UX requirements

### Temporary-item creation

1. The Main Line recommendation flow opens a temporary-item dialog with the relevant Main Basket preselected. The item saves as `itemType: "temporary"`, `status: "draft"`, with the existing completion-required behavior.
2. Offer existing active Main Baskets and Add Main Basket, using the existing inline creation fields. Successfully created baskets become selected without clearing the item name or open recommendation draft.
3. Offer existing Sub-Baskets for the selected Main Basket and Add Sub-Basket. Independent Sub-Basket creation must be possible without inventing a placeholder Main Line. Existing whole-group recommendation creation may continue creating the group's first temporary child in the same transaction.
   Independently saved Main/Sub-Baskets remain in Configuration if subsequent item creation is cancelled or fails; state this in the form. A group created within the combined group-and-item transaction rolls back if that transaction fails.
4. A temporary item may remain directly under its Main Basket when that flow permits no Sub-Basket. A whole-group recommendation or Add sub-item flow requires a valid Sub-Basket. Retain the existing required-group rule for ordinary estimation-item creation.
5. Selecting another Main Basket clears an incompatible Sub-Basket selection and loads the new parent's groups. Submit stable IDs for existing groups; never join on displayed names.
6. Save the related catalog item immediately, then select the authoritative returned item in the open recommendation. Keep unsaved rule fields intact. Saving the recommendation remains a separate action.
7. Retain field values after validation, permission, conflict, and server failures. Prevent duplicate submission while pending.
8. Distinguish confirmed failure, ambiguous outcome, successful creation, and failed refresh. An ambiguous outcome must be reconciled before another create; a matching item may be reused only through explicit selection after checking type and parent identity. Never silently substitute an unrelated same-name item.
9. A successful mutation followed by failed detail/list refresh must explain that the catalog change was saved and provide recovery. Do not show an ordinary create retry that could duplicate the record.

### Configuration basket manager

1. Evolve Manage main baskets into Manage baskets with a clear Main Basket list and an on-demand Sub-Basket list for the selected parent. Keep the page's existing layout and contextual-panel conventions.
2. Main Basket rows expose Edit, Delete, and Manage Sub-Baskets according to permissions. Retain existing Main Basket editable fields and archive/status rules.
3. Sub-Basket rows expose Add, Edit name, and Delete. Empty groups remain visible and manageable; groups are loaded from the Sub-Basket catalog, not inferred from the current page of Main Lines.
4. Paginate or collect all required catalog pages. Do not omit parents or children after the first 100 results.
5. Sub-Basket rename preserves its ID, parent, child membership, lifecycle, and recommendation targets. Show updated names wherever those identities appear.
6. Preserve recommendation-editor draft-only mutation restrictions. Configuration rename does not activate or complete items and does not enable inline mutations on frozen groups.
7. Delete opens an accessible confirmation showing the selected name, child-item count, affected reference count, permanent effect, exact-name input, and reason. A failed impact load prevents confirmation. Cancellation makes no mutation.
8. A Main Basket deletion retains current cascade behavior. A Sub-Basket deletion removes only that group and its owned catalog records, leaving its parent and sibling groups/items intact.
9. After deletion, close only affected editors, remove stale selections, and return to a valid Configuration location if the current item was deleted. Preserve unrelated unsaved fields; if an open rule targets a deleted group, mark its target unavailable and require explicit repair before save.
10. New actions use clear text labels, keyboard focus, accessible names, status announcements, and the existing visual language. Add no icon dependency or decorative redesign. At narrow widths, actions wrap without clipping names or causing horizontal overflow.

## Data and API impacts

Existing Main Basket routes remain canonical. Reuse existing Sub-Basket list/create and Main-Line create routes.

### Sub-Basket rename

Extend the existing PATCH `/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId` input:

```ts
{
  expectedVersion: number;
  name: string;
  managementContext?: "configuration";
}
```

Omitting `managementContext` preserves the current draft-only behavior for existing callers. The general Configuration manager explicitly supplies `configuration`. This context chooses lifecycle validation, not authorization: both branches require the same backend update permission and sole-active-Super-Admin guard.

Both branches validate parent membership, non-archived parent, current version, normalized name, and parent-scoped name uniqueness. Both increment the Sub-Basket version and audit old/new names and versions. The omitted-context branch also enforces the all-children-Draft guard transactionally, including activation races.

### Sub-Basket deletion

Add protected routes:

- GET `/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId/deletion-impact`
- DELETE `/api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId`

The preview returns stable parent/group IDs, current name/version, child count, reference count, and a concurrency token for the confirmed impact. The DELETE input contains `expectedVersion`, `confirmationName`, `reason`, and that impact token. If membership or affected references changed since preview, return a conflict requiring a fresh preview. A stale confirmation must not delete additional unseen contents.

Delete validates the selected parent, current identity/version, exact name, actor authority, and preview token in the transaction. Coordinate against parent deletion, child creation/lifecycle mutation, group rename, and new references. Perform the group deletion, child cascade, targeted reference cleanup, and audit atomically. Failure rolls back every owned write.

Extend reference-cleanup targets with Sub-Basket IDs. Match `targetSubBasketId` directly for whole-group references and child IDs for item references; never treat the parent Basket ID as a deletion target when deleting only one Sub-Basket. Reuse existing cascade behavior for revisions, sections, and price versions. Keep surviving mutable drafts versioned/coordinated so stale saves cannot restore deleted targets. Preserve existing approved Estimate/Design history and audit records.

Return a deletion result containing deleted group ID, child IDs or equivalent reconciliation data, counts, and timestamp. Add the new operations to the route registry, OpenAPI inventory, frontend types/client, audit action inventory, and tests.

### Creation errors

Known validation/name-conflict/parent/version failures use stable 4xx errors with actionable safe messages. Specifically, map normalized item-name conflicts to 409 `DUPLICATE_IDENTITY` with a name-field message. Do not map every database exception to a duplicate, swallow unknown failures, or weaken transaction requirements.

Reproduction must check both failures inside the create transaction and failures during post-commit detail retrieval. Capture sanitized exception class/code and request correlation where needed, without logging tokens, full bodies, or private catalog contents. If environment or legacy-data repair is actually required, document the evidence and stop before any unapproved live repair or migration.

## Permissions and invariants

| Action | Route permission | Additional invariant |
| --- | --- | --- |
| List baskets/groups | `ai_estimator_knowledge.configuration.read` | Current actor guard |
| Create baskets/groups/items | `ai_estimator_knowledge.configuration.create` | Active creation parent; unique identities |
| Rename/edit | `ai_estimator_knowledge.configuration.update` | Expected version; correct parent; contextual draft rule |
| Preview/delete basket/group | `ai_estimator_knowledge.configuration.lifecycle` | Confirmed impact; exact identity; transaction and audit |

All operations retain the sole-active-Super-Admin rule. UI visibility follows capabilities but is never enforcement. Names remain presentation; stored relationships use stable IDs. Catalog writes remain independent from recommendation-section saves. Direct-Mongoose knowledge paths remain in place; no repository abstraction rewrite is required.

## Query and state synchronization

After mutations, reconcile affected basket lists, Sub-Basket lists, Main-Line lists, item lists/details, relationship catalogs, incoming references, deletion previews, and context projections. Include existing dirty-worktree synchronization helpers rather than duplicating them. Cache invalidation must cover both changed labels and deleted identities. Separate mutation success from refresh success and offer Retry catalog refresh where appropriate.

## Compatibility, risks, and rollback

- No stored schema migration is expected. Existing IDs, item types, recommendation payloads, and lifecycle statuses remain compatible.
- Optional rename context preserves old callers. New routes are additive. Any newly discovered need to change an approved contract must be reflected in this specification before implementation proceeds.
- Temporary creation's original failure remains an open diagnostic risk; completion requires an observed reproducer or clear evidence tying the fix to the reported path, not merely replacing the error message.
- Populated-group deletion is destructive and requires explicit in-product confirmation. UI rollback cannot restore deleted catalog data; implementation and QA use isolated fixtures only.
- Concurrent child/reference writes must be tested against deletion and draft-only rename. A preview alone is insufficient without a transactional guard.
- Existing uncommitted work overlaps this feature and must be reconciled before assigning implementation ownership.
- Code rollback can remove the new controls/routes and restore old caller behavior without migrating retained data. No production or local-user catalog mutation is part of this development request.

## Acceptance criteria and verification

1. A temporary item can be created from a Main Line's recommendation flow, saved under the chosen parent/group, and selected without losing unsaved rule fields. Verify the actual POST and returned item through isolated API integration and rendered frontend interaction tests.
2. Reproduce the reported failure path or document the precise remaining reproduction limitation. Valid unique creation returns 201; duplicate-name creation returns actionable 409; invalid/wrong-parent inputs return 4xx. Verify rollback leaves no partial group, item, revision, section, or audit writes.
3. Inline Main Basket and Sub-Basket creation/selection works from the temporary-item flow. Verify existing groups, new groups, optional direct-parent temporary items, parent changes, and complete paginated catalogs.
4. Main Basket and Sub-Basket add/edit/delete controls are reachable from Configuration, including empty groups. Verify names refresh across manager, item details, selectors, and recommendation summaries.
5. Configuration Sub-Basket rename preserves IDs and works with non-Draft children, while recommendation-editor rename remains frozen outside Draft. Verify both contexts, duplicate names, wrong parents, stale versions, and activation races.
6. Main Basket deletion retains existing behavior. Sub-Basket deletion handles empty/populated groups and whole-group/child references without altering its parent or siblings. Use two parents with same-named groups and unequal child/reference counts to detect scope leakage.
7. Deletion requires a successful impact preview, confirmation, reason, and current concurrency token. Verify cancel, mutation failure, stale preview, concurrent child/reference creation, and rollback with Mongo replica-set integration tests.
8. Successful creation plus failed response/refresh does not cause duplicate submission. Verify reconciliation, wrong-type/wrong-parent matches, safe explicit reuse, and refresh-only recovery.
9. Direct API calls enforce create/update/lifecycle authority and sole-Super-Admin identity; denied calls produce no mutation/audit. Verify route-operation, authorization, and OpenAPI inventories remain synchronized.
10. Keyboard/focus behavior, form errors, pending/empty states, and narrow-screen layouts work. Include rendered desktop and mobile-width checks of the manager and temporary-item flow, and inspect console/network failures.
11. Run focused service/route/replica-set and frontend interaction/API/cache tests, followed by relevant backend/frontend typechecks and builds. Broaden authorization/docs/shared-cascade regressions according to affected contracts. Run `git diff --check` and report actual results and any unrun checks. There is no lint script.

## Assumptions and open decisions

- “From Main line” means creating related temporary catalog content while editing a Main Line, with the Configuration temporary-item entry point kept consistent.
- “Edit Sub-Basket” means rename; membership moves and a new independent Sub-Basket lifecycle are outside scope.
- General basket management belongs in Estimation Configuration; the recommendation drawer keeps its existing draft-only catalog-editing restrictions.
- Delete includes contents after impact confirmation, consistent with the current Main Basket manager.
- The original runtime exception and any environment-specific cause remain to be established during approved implementation. No business-choice question blocks specification review.

## Approval boundary

This is the specification stage required by `AGENTS.md`: “Create or update only the durable specification.” No task plan, implementation, application test run, or live catalog mutation has been performed for this request. Task planning follows specification approval; implementation follows task-plan approval and execution-mode selection.
