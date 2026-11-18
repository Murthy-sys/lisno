# Copy previous details when adding a specification

Date: 2026-11-18
Status: Approved and implemented in Mode A. Local verification passed; exact checks and limits are recorded in the [task plan](../plans/2026-11-18-add-specification-copy-previous.md). No deployment or saved-data mutation was performed.
Classification: Bounded frontend workflow change; existing local draft and validation contracts remain authoritative.

## Goal

Clicking **Add Specification** creates a new editable specification with the previous item's **Item name**, selected **Brands**, and **Brief description** already filled. The user explicitly chose a new copy rather than reopening the original, and confirmed that fields must remain enabled/editable.

## Current behavior and evidence

- `KnowledgeSpecificationBuilder.tsx:addSpecification` always calls `createKnowledgeSpecification()`, appends its empty result, and opens Add Specification. This explains the blank Item name and Brands on opening.
- `shared/knowledge/knowledgeSpecificationConfiguration.ts:createKnowledgeSpecification` returns a fresh ID, empty name/Brand selections/description, and no compatibility fields.
- The existing saved-item Brand feature runs only after explicit item selection. It does not choose an initial item when Add Specification opens.
- `KnowledgeModePanel.tsx` supplies the current tier's pricing draft and Brand definitions, then persists through Save Mode. Done only closes the editor.
- Shared `validateKnowledgeSpecifications` rejects duplicate normalized item names and duplicate IDs. The item picker also prevents selecting another row's name. A new copy may start with the original name, but it must be changed before Save Mode can succeed.
- Specification IDs are referenced by pricing and quantity data. Copying an item must not duplicate its ID or references.

## Scope and assumptions

“Previous” means the last filled specification in the current Main Line/tier's displayed list, using current draft values, including unsaved edits. Skip trailing rows whose item name is blank; do not use global browser history or another tier/Main Line. This deterministic rule also works after saving and reloading.

“Filled details” means the three visible specification fields: Item name, selected Brands, and Brief description. This includes description when present, as part of the requested previous details. A valid empty Brand selection remains empty.

In scope: Add Specification initialization, concise duplicate-name guidance, and regression checks for the existing draft/save workflow. Keep the shared editor's local behavior consistent without adding Configuration reads to isolated proposal editors.

Non-goals: changing the saved-item catalogue, permitting duplicate saved item names, changing Brand definitions or synchronization, copying prices/quantity rules, cross-tier copying, altering existing rows, schema/API/permission changes, deployment, migration, or restarting services.

## Requirements

1. On Add Specification, take the last named row from the currently supplied list. If no named row exists, preserve the empty new-row behavior.
2. For a valid source, create a fresh specification ID and copy its name, selected Brand IDs in their current order, and brief description into the new local row. Open the panel immediately with all three visible fields filled and editable under the existing permissions.
3. Reuse Brand definitions from this same pricing scope. Do not import foreign IDs or create duplicate Brand definitions. Keep the original specification and all other rows unchanged.
4. Copy visible field values only. Do not copy hidden typed compatibility fields, original specification identity, budgeting entries, slab references, or other financial/workflow data.
5. A malformed or unresolved source association must not become an apparently valid partial copy. Preserve the draft and show concise guidance to correct the previous item's details before copying. Never fall back to an older named row to hide this problem.
6. Preserve unique-name validation. Initially show the exact copied item name, with brief guidance that a different name is required before saving. The picker stays enabled so the user can choose or add a different name. Do not silently suffix or rename the copied item or weaken shared validation.
7. Editing the copy's name, description, or selected Brand IDs affects only the new specification. Existing shared Brand-definition editing behavior remains unchanged. Preserve the existing rule that choosing a different saved item does not replace a nonempty Brand selection automatically.
8. Add creates only a local draft. Done closes the panel; Save Mode persists through existing preflight/version checks. Discard restores saved state; failed saves retain pending edits. A successful save/reload preserves both distinct specifications and their IDs.
9. Preserve read-only behavior, the 50-specification limit, existing add-button availability, keyboard focus and return focus, and the compact panel layout. Do not refill a row on query refresh or rerender after the user edits/clears it.

## Decisions, risks, and compatibility

The recommended behavior is to copy into the existing draft and retain current validation. Allowing duplicate saved names would require a separate shared-contract decision and is outside this change. Reopening the original would not create the copy the user requested.

Principal risks are copying from the wrong tier, unintentionally sharing a specification ID, mutating the original, and leaving the reason for the duplicate-name error unclear. Use the existing scoped draft, fresh-ID factory, copied Brand-ID array, and explicit inline naming guidance to address them.

No new API fields, storage, dependencies, permissions, or migrations are needed. Rollback removes the new Add initialization; already saved rows remain ordinary specifications. Preserve all current uncommitted GST, tier-description, and Brand-prefill work.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Add opens a new row containing the last filled item's name, Brands, and description before any further selection. | Rendered Add-panel test with multiple unequal rows, trailing blank row, and fresh ID assertions. |
| AC2 | The first item starts empty; source selection remains within the current tier/Main Line and uses current draft values. | Empty, unsaved-edit, tier-change, and reload cases. |
| AC3 | The new row remains editable; its changes do not mutate the original or duplicate Brand definitions, hidden fields, prices, or references. | Payload assertions with different row IDs, compatibility data, and referenced source. |
| AC4 | Duplicate copied name is clearly explained and cannot be saved; selecting a unique name allows normal save and reload. | Picker interaction and Mode save integration test. |
| AC5 | Invalid source, limits, read-only access, discard, failed save, and deliberate clearing preserve existing guarantees. | Focused builder and pending/save regression checks. |
| AC6 | The integrated change compiles and remains accessible and compact. | Frontend typecheck/build, relevant rendered interaction/accessibility tests, local panel visual check when available, and git diff --check. |

## Approval state and open decisions

The user approved the source rule and preserved duplicate-name requirement, approved the separate task plan, and selected Mode A. No open decision remains. This change is separate from saved-item Brand prefill because it changes what happens on Add itself. Implementation and verification are recorded in the linked task plan.
