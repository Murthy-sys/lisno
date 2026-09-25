# Remove a draft Sub-Basket from the recommendation drawer

Date: 2026-09-23
Status: Proposed specification; awaiting approval. No implementation or task plan created for this extension.

## Goal and clarified request

The user confirmed that the missing Remove action belongs beside the Sub-Basket name `test-sub1`, where Edit name is already present. The `Lights` child already has its own Remove action.

Add an accessible, red outlined trash-icon **Remove** button beside the existing pencil **Edit name** action. It removes the selected draft Sub-Basket and its contents after an explicit impact confirmation. Preserve the existing child actions, temporary-item creation, draft editing, and freeze rules.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.tsx` renders Sub-Basket Edit name in both Line item and Whole Sub-Basket modes, but no group Remove action. Child removal is implemented separately.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSubBasketDialogs.tsx` already provides a Configuration deletion dialog with impact counts, exact-name confirmation, audit reason, conflict recovery, and refresh-only retry after success.
- `backend/src/routes/ai-estimator-knowledge-admin.ts:199` defines the existing group DELETE request: expected version, confirmation name, reason, and impact token.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts:517` transactionally removes the group, all child items, their sections/revisions/prices, and incoming group/item references. It coordinates through the parent dependency epoch, verifies the group version and impact token, and writes an audit record.
- That DELETE currently permits children outside Draft. Sub-Basket rename and existing inline child mutations have Draft-only checks, so simply exposing the Configuration deletion dialog would not enforce the requested freeze boundary.
- Group names are required and child Sub-Basket membership is immutable. Removing only the text while retaining an unnamed group or moving children to the Main Basket is not supported by the existing contract.
- The prior [Line item edit/remove specification](2026-09-23-line-item-draft-edit-remove-design.md) explicitly excludes entire Sub-Basket deletion from this drawer. This document adds that bounded behavior without replacing the earlier work.

These findings are from read-only source inspection, including an independent backend audit. No live records were deleted or changed and no new verification has run in this specification stage.

## Scope and assumptions

Included:

- Group Remove next to Edit name in the displayed Whole Sub-Basket header and the corresponding selected Sub-Basket context in Line item mode.
- Both empty groups and groups whose every direct child remains Draft.
- Explicit impact confirmation, backend freeze enforcement, stable identity/version checks, query synchronization, preservation of the open rule draft, and actionable recovery.

Assumption: Remove uses the established catalog meaning: permanent deletion of the Sub-Basket and its contents. The confirmation clearly names the group and says which items and references are affected. This feature does not immediately delete the user's actual `test-sub1` record during development.

Excluded:

- Clearing a required name, removing only a visual heading, reparenting/preserving children after deleting their group, or merely detaching a rule from its target.
- Changing Configuration's existing broader deletion policy, freeze/activation semantics, financial calculations, approved histories, or unrelated UI.
- Live catalog mutation, migrations, backfills, seeds, dependency additions, deployment, staging, commits, or pushes.

## Required behavior

### Controls and eligibility

1. Render **Remove** beside **Edit name** using the existing trash icon and destructive-outline button style. Keep a distinct accessible name such as `Remove Sub-Basket test-sub1`.
2. Show the action only with the applicable catalog read and lifecycle permissions, a real selected group under the correct Main Basket, a complete authoritative catalog, and no pending catalog mutation or failed refresh.
3. Any direct child outside Draft, including inactive or archived children, freezes inline group removal. An empty group remains eligible. Enforce the same rule in the deletion transaction, including changes made after confirmation opened.
4. Preserve loading, unavailable, frozen, and permission states. Never infer membership or eligibility from a matching label or a filtered list of visible children.
5. If the current recommendation's source item itself belongs to the selected group, block inline group removal with an explanation and a Configuration link when permitted. This drawer must not delete its own source while claiming to preserve its draft.

### Confirmation and deletion

1. Open a confirmation naming the selected Sub-Basket and its Main Basket. Fetch the current deletion impact using stable IDs.
2. Clearly explain that the Sub-Basket and all its items will be permanently deleted from Configuration immediately, with incoming references removed. Show item/reference counts, including a clear empty-group state.
3. Retain the established exact Sub-Basket-name confirmation and nonblank audit reason. Use **Remove permanently** for the destructive confirmation; default focus must not activate deletion.
4. Cancel leaves the catalog and rule unchanged. A successful confirmation deletes only the reviewed group and its descendants through the existing transaction/cascade. Main Basket, sibling groups, unrelated items, and unrelated references remain.
5. Stale group versions, changed impact, newly frozen children, wrong parent, missing group, or denied permissions cause an actionable failure without partial deletion. Never automatically retry a destructive request against refreshed state.

### Open draft and recovery

1. Catalog deletion and saving Recommendations & Exclusions remain separate actions. Preserve the open drawer, local trigger/action/reason/enabled fields, other rules, and unaffected IDs.
2. Preserve the affected rule as an unavailable target after deletion; show repair guidance and block saving an enabled invalid rule until explicitly retargeted or removed. Do not silently choose another group, clear fields, or convert the rule kind.
3. For Line item mode, a deleted selected child becomes unavailable along with its group. Keep the same explicit repair behavior.
4. Reference cleanup can advance the saved source-section version. Preserve the existing version-review/CAS behavior rather than overwriting a newer section or discarding local edits.
5. Record successful deletion before refreshing. Refresh failure offers refresh-only retry; it must not send a second DELETE. Cancel in-flight stale reads and remove deleted group/child cache entries so they cannot reappear from stale responses.
6. Restore focus to a surviving control or section heading after deletion; preserve focus containment and return on cancellation/errors. Announce success, conflicts, and unavailable states accessibly.

## API, persistence, authorization, and compatibility

Recommended approach: extend the existing group DELETE with an explicit additive inline Draft-only context/guard, and reuse the existing impact-confirmation and cache synchronization behavior. A new endpoint, alternate delete implementation, or data migration is unnecessary. The task plan will settle the exact additive request shape and ownership before implementation.

The backend must validate the guard and recheck all direct children in the same coordinated transaction as impact verification and cascade deletion. Preserve existing parent/group identity checks, expected version, exact confirmation name, impact token, actor/reason audit evidence, and rollback semantics. A refreshed preview must never bypass the inline freeze rule. Requests from the existing Configuration manager retain their current behavior when the new context is absent.

Keep operation-specific backend authorization authoritative and frontend visibility aligned with it. No additional permission or broad mutation authority is introduced. Update runtime schemas, service request types, frontend request types, and OpenAPI together. Existing route inventory remains unchanged unless source inspection demonstrates otherwise.

Synchronize group lists, child lists/details, relationship catalogs, context projections, source sections, and affected deletion previews through existing helpers. Names remain display values; stable IDs identify all reads and writes.

Rollback means reverting the additive UI/context support. No persisted shape or migration changes are planned. Actual confirmed catalog deletion retains the existing irreversible semantics and must be clearly presented as such.

## Risks and constraints

- Deleting children when the user expects only a label change: address through explicit group/contents wording and impact confirmation.
- Activation or membership/reference changes during confirmation: reject through transactional Draft checks, parent coordination, version/CAS, and fresh impact validation.
- Losing an unsaved rule through reference-cleanup refresh: preserve the existing draft/version-review safeguards and test a clean saved rule as well as a dirty local rule.
- Stale caches restoring removed entities or replaying a delete after refresh failure: retain success state, cancel stale queries, and test retry behavior.
- Concurrent unrelated work is present in the repository. Before implementation, capture the current dirty paths and relevant file snapshots and preserve all existing edits.

## Acceptance criteria and verification

1. `test-sub1` has a styled Remove action beside Edit name in both applicable group contexts; child Edit/Remove actions remain intact.
2. Cancel changes nothing. Confirmed removal deletes the reviewed eligible group and all its descendants, preserving Main Basket/sibling data and unrelated references.
3. Empty groups are removable; any non-Draft child blocks inline removal in both UI and backend. A racing activation cannot bypass the guard.
4. Complete-catalog, identity, permission, wrong-parent, stale-version, changed-impact, and missing-resource cases cannot delete the wrong group or cause partial changes. Cover same-named groups in two Main Baskets.
5. The current source cannot be deleted through this inline group action. Existing Configuration deletion remains compatible.
6. Whole-group and Line item drafts retain their fields after deletion and expose unavailable targets that require explicit repair. Source-section version conflicts remain reviewable and do not overwrite newer content.
7. A confirmed successful DELETE followed by failed refresh is never replayed. Stale query responses cannot restore deleted groups or children.
8. Focused service/route/contract and transactional replica-set tests cover the new context and races; frontend tests cover controls, confirmation, conflicts, draft/cache preservation, and Configuration compatibility.
9. Frontend/backend typechecks and builds, applicable focused regressions, and `git diff --check` pass or report exact baseline failures. No lint script exists. Broaden checks only where shared-contract impact warrants it.
10. Rendered desktop/mobile interaction and accessibility checks verify action layout, focus/return, readable confirmation/error/frozen states, and no overflow. Use synthetic fixtures without changing the user's catalog.

## Open decisions and workflow

No further product choice is required for this specification: the user identified the Sub-Basket header, and the existing deletion semantics establish the proposed behavior. Implementation must not start until this extension's specification and separate task plan are approved and execution mode is selected, as required by the repository's AGENTS.md. This stage creates only this specification.
