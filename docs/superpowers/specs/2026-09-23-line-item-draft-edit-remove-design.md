# Draft editing from Line item recommendation rules

Date: 2026-09-23
Status: Proposed follow-up specification. No application code or task plan changed in this stage.

## Goal

From the Recommendations & Exclusions scope-rule panel shown by the user, an authorized user can rename the selected Sub-Basket and edit or permanently remove a selected draft related item without recreating it. These controls remain available until the relevant catalog content is frozen through the main Configuration workspace. Preserve all existing work and the open recommendation draft.

Example: change `Functional lights Supply` to `False Ceiling Lights` using the appropriate Sub-Basket-name or item-name action, retaining the same entity ID and its references.

This is an additive extension to the current implementation and the earlier [draft Sub-Basket design](2026-09-23-draft-sub-basket-edit-remove-design.md) and [temporary-item/basket management design](2026-09-23-temporary-items-basket-management-design.md). It does not replace their implemented behavior or overwrite their documents.

## Current behavior and evidence

The supplied screenshot shows `Addition type: Line item`, with no basket or related item selected. Catalog edit controls need a real selected entity; the screenshot establishes the relevant mode, not the identity or lifecycle of the named example.

Current source establishes the missing controls:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.tsx:373` only collects selected group children when `targetKind === "sub_basket"`.
- The same file at line 690 places the group-name Edit action and all child Edit/Remove actions inside the Whole Sub-Basket-only section. The Line item branch renders selectors and creation actions, but no selected-item rename/removal controls.
- Selecting an existing item, or completing related-item creation, already retains authoritative Main Basket, Sub-Basket, and item IDs. The new controls can operate on those identities.
- `KnowledgeDraftSubBasketDialogs.tsx` already supplies accessible name and permanent-removal dialogs, although some wording and last-child behavior are specific to Whole Sub-Basket rules.
- The Main-Line PATCH/DELETE routes already accept `expectedVersion` and `draftSubBasketGuard: { subBasketId, expectedVersion }`. `ai-estimator-knowledge-item.service.ts:2452` verifies membership, group version, and that every direct child remains Draft. These operations do not depend on the recommendation target kind.
- Sub-Basket PATCH without `managementContext` retains the draft-only freeze guard. Configuration management deliberately has a broader rename context; inline editing must not use it.
- Direct-parent temporary items are supported by the preceding implementation, but there is no draft-only mutation guard for an item with no Sub-Basket. Omitting the existing group guard permits broader main-workspace edits, so UI-only status checks would be insufficient.
- Item creation maps normalized-name collisions to `DUPLICATE_IDENTITY`; Main-Line rename currently lacks equivalent duplicate-key translation.

The backend findings were independently checked read-only. No tests or live mutations were performed for this follow-up. Prior passing tests are background, not verification of the proposed controls.

## Scope and preservation boundaries

Included:

- Sub-Basket name editing from Line item mode when a real group is selected.
- Selected-item name editing and confirmed permanent removal in Line item mode for both catalog and temporary draft items.
- Draft-only enforcement for groupless temporary items.
- Clear frozen/loading/unavailable/permission states, draft preservation, cache refresh, conflict recovery, and accessible interactions.
- Narrow duplicate-name error handling for item rename.
- Existing Whole Sub-Basket actions retained with the same behavior.

Excluded:

- Changing which items a Line item rule includes, converting it to a Whole Sub-Basket rule, or moving items between parents.
- Changing freeze/activation semantics, completion rules, pricing, estimates, or immutable approval history.
- Deleting an entire Sub-Basket from this drawer. That remains the existing impact-confirmed Configuration action.
- Renaming Main Baskets within this drawer, redesigning the screen, or correcting unrelated Mode-editor tests.
- Live catalog changes, migrations, seeds, dependency additions, deployment, staging, commits, or pushes.

The current worktree contains the completed basket changes, earlier draft-group editing, and unrelated administration/dashboard edits. Capture a fresh baseline and inspect per-target diffs before implementation. Modify only the bounded integration paths; do not restore older file versions or rewrite unrelated work. Interpret the user's “without overight” as preserving those existing changes and data.

## Proposed behavior

### Selection and available actions

1. With no selected entity, retain the existing selection guidance; never offer a mutation against a placeholder or infer identity from a name.
2. Once a Sub-Basket is selected in Line item mode, show an accessible **Edit Sub-Basket name** action beside its selected context. This can work before a related item is selected, including an empty group.
3. Once a related item is selected, show its name, type, and lifecycle with **Edit item name** and **Remove item** actions according to permissions and draft eligibility. Newly created items receive the same actions after the authoritative catalog/version refresh.
4. Selecting an item through All Sub-Baskets resolves its actual parent by stable ID. Never use a blank filter as evidence that an item is groupless.
5. The existing top-level removal control remains rule removal and is labelled clearly as **Remove rule**. Item removal opens a separate permanent Configuration confirmation.
6. Line item mode continues targeting only the selected item. Group-name editing does not add sibling items to the rule.

### Freeze semantics

- A grouped item and its Sub-Basket are editable inline only when every direct child is Draft. Any active, inactive, or archived child freezes inline group and item editing/removal, matching the established guarded backend behavior.
- A groupless temporary item is editable/removable inline only while that item is Draft. Unrelated items in the same Main Basket do not freeze it.
- Item type and “Must be completed” indicators do not determine editability. Temporary content that left Draft is frozen; draft catalog children follow the existing draft-group rule.
- Catalog membership and lifecycle must be authoritative and fully loaded before mutation controls are enabled. Pending, partial, failed, or stale refreshes must not make a group appear editable.
- Frozen content shows **Frozen in Configuration** with a short explanation and an Open in Configuration action when permitted. A server-side freeze/version conflict must leave no partial mutation and must not automatically retry.

### Rename and removal

- Rename is prefilled, changes only the name, and preserves stable item/group IDs, parentage, type, lifecycle, revisions, and references.
- Duplicate normalized names receive an actionable conflict. Do not translate unrelated database errors into duplicate-name errors.
- Permanent item removal names the item, explains that the real catalog record and its references will be removed, and requires an explicit destructive confirmation. Cancelling leaves the catalog and rule draft unchanged.
- After removing a Line item target, preserve the rule and unrelated fields. Show the target as unavailable and block saving an active invalid rule until the user selects a replacement or removes the rule. Never silently select another item, convert the target kind, or autosave.
- Keep the existing Whole Sub-Basket last-child behavior: the group remains selected and empty, with explicit repair guidance. Removal copy must reflect the actual rule context.

### Draft and recovery behavior

- Catalog rename/removal saves immediately. Recommendation saving remains a separate explicit action.
- Preserve the open drawer, trigger, action, requirement, reason, enabled state, other rules, and unaffected target IDs across successful edits, cancellation, and recoverable failure.
- Keep submitted versions tied to the entity/version shown when the edit or confirmation opened. If a newer name, parent, or lifecycle is discovered, require review of the refreshed state rather than overwriting it.
- Preserve the entered proposed name through recoverable errors. Do not silently save it against a newly loaded version.
- Once the server confirms success, record it locally before refreshing. A later refresh error offers read-only refresh retry, not another mutation.
- Deletion can advance surviving source-section versions through reference cleanup. Respect those versions; never overwrite newer saved content to hide a conflict or discard unrelated local draft fields during refresh.

## Data, API, authorization, and compatibility

Reuse the existing grouped requests:

| Operation | Request requirements |
| --- | --- |
| Sub-Basket rename | Existing parent-scoped PATCH with group `expectedVersion` and `name`; omit `managementContext` |
| Grouped item rename | Existing item PATCH with item `expectedVersion`, `name`, and `draftSubBasketGuard` |
| Grouped item removal | Existing item DELETE with item `expectedVersion`, reason, and `draftSubBasketGuard` |

For groupless temporary items, add an explicit optional inline draft-only guard/context to the existing item mutation contract. It must validate the expected Main Basket identity, absence of a Sub-Basket, draft lifecycle, and item version within the same transaction as the mutation. It must be mutually exclusive with the grouped guard and must not change existing main-workspace behavior when absent. Settle its exact additive request shape in the task plan before writers start. No new route or persisted schema is required.

Continue operation-specific read/update/lifecycle permissions and the sole-active-Super-Admin actor guard. Read/create permissions alone must not expose rename/removal. Main-workspace Configuration rename privileges must not bypass the inline freeze check. Preserve actor/reason/version audit evidence, scoped cascades, dependency coordination, and immutable approval history.

Synchronize item details, item/basket/group lists, relationship catalogs, context projections, incoming references, deletion previews, and local created-item bridges. Cancel or suppress stale reads that could restore a removed item. Names remain presentation, never join keys.

Extend runtime request validation, frontend request types, service interfaces, and OpenAPI for any new guard; keep existing requests compatible. No data migration is needed. Rollback removes the added UI/context support without rewriting catalog or recommendation records.

## Approach and risks

Recommended approach: extend the current rule-row actions and shared dialogs, reusing existing mutation/cache helpers and grouped guards. Add only the draft-only guard missing for groupless items. The existing architecture already establishes a suitable approach; a second editor or a lifecycle redesign is unnecessary.

Principal risks are freezing during an open edit, incomplete sibling data, deleting a referenced target while the source rule is unsaved, stale responses restoring removed rows, and confusing rule removal with catalog deletion. Transactional guards, explicit confirmation, complete catalogs, version checks, distinct labels, and focused recovery tests address these risks.

## Acceptance and verification

1. In Line item mode, a selected draft Sub-Basket can be renamed from `Functional lights Supply` to `False Ceiling Lights` without recreation or loss of the rule draft.
2. Every selected eligible catalog/temporary child, including one just created, offers item-name editing and confirmed removal; direct-parent temporary items also support this flow.
3. Renames preserve stable IDs and update visible names across the drawer, recommendation summary, and Configuration.
4. Grouped controls freeze when any sibling leaves Draft; direct-parent controls freeze when that item leaves Draft. The backend rejects a racing/stale edit or removal.
5. Missing, mismatched, incomplete, or failed catalog data never permits an unsafe mutation. Same-name groups in two Main Baskets cannot be confused.
6. Cancelling removal preserves all records. Confirmed removal deletes only the intended item through the existing cascade and leaves an unavailable target that requires explicit repair.
7. Rule removal and catalog removal have distinct labels and behavior; unsaved trigger/action/reason/enabled state and other rules survive catalog operations.
8. Duplicate-name, permission, missing-resource, version/freeze conflict, and successful-mutation/failed-refresh paths remain actionable without repeated writes.
9. Existing Whole Sub-Basket editing, last-child removal, independent creation, main Configuration management, and freeze behavior remain unchanged.
10. Focused frontend interactions and backend contract/replica-set regressions cover grouped and groupless cases, including activation races. Typechecks/builds and repository diff checks pass; pre-existing unrelated failures are reported separately.
11. Rendered desktop and mobile checks confirm reachable actions, keyboard focus/return, status announcements, and readable loading/frozen/error states.

## Assumptions and open decisions

The requested label could refer to the selected Sub-Basket or child item; both receive distinct name-editing actions. Removal retains the established meaning of permanent draft catalog deletion with confirmation, while Remove rule remains available separately. The established Draft lifecycle is the freeze boundary. No user choice is needed before specification approval; the task plan will fix the additive groupless guard shape and ownership before implementation.
