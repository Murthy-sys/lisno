# Move recommendation rules between sections

Date: 2026-10-21
Status: Approved and implemented on 2026-10-21 in Mode A. Focused verification and browser QA completed; the plan records the unrelated baseline test failures and verification limits.

Follow-up correction, 2026-10-21: the user requested holding and dragging the item itself instead of a specific handle. The existing Mode A implementation was corrected locally to use the whole row. Destination semantics, permissions, API contracts, and explicit saving are unchanged. Verification is recorded in the task plan.

## Goal

In the web Configuration workspace, allow an existing recommendation rule to move between Non-Negotiable Additions, Probable Additions, Exclusions, and Other scope rules using drag and drop. Preserve the current section layout, styling, item editor, and save workflow.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.tsx` renders four sections from one `budgetAlterations` array. The first three are always visible; Other scope rules is a disclosure. Each rule already has Edit/View, Enable/Disable, and Remove actions, but no move or drag interaction.
- `shared/knowledge/knowledgeRecommendationPresentation.ts` derives the section from `trigger`, `action`, and `requirement`. These are meaningful rule fields, not presentation-only categories. All valid rules triggered by removal appear under Other scope rules; malformed rules can also appear there for review.
- `shared/knowledge/knowledgeBudgetAlterations.ts` validates stable rule IDs and one active rule per target kind, target ID, and trigger. Backend validation enforces the same uniqueness in `backend/src/domain/ai-estimator-knowledge-validation.ts:1240`.
- Rules can target either a Main Line or a whole Sub-Basket. They carry target IDs, a reason, and an enabled state. Existing warnings identify unavailable targets, incomplete groups, and overlapping targets.
- `KnowledgeSectionEditor.tsx` passes edits through its existing `budgetAlterations` change handler. `KnowledgeItemWorkspacePage.tsx` owns explicit section saving, version checks, pending changes, and save errors. Moving must use this path.
- Repository search found no existing reusable item drag-and-drop component or installed drag-and-drop library. The existing chat file-drop handler is unrelated.
- The worktree contains the preceding multiple-brand implementation. Initial status and relevant target diffs were inspected. The recommendation builder, its tests/styles, presentation helper, and workspace screen tests are currently clean. `KnowledgeSectionEditor.tsx` and several backend files already have brand-related edits and should not need changes for this feature.

## Scope and assumptions

- This request applies to the web application's Recommendations & Exclusions editor, including narrow browser widths. Native mobile implementation is outside this task.
- “Any section” is interpreted as all four existing grouped rule sections, including Other scope rules. Its different trigger is made explicit below.
- Move one complete rule at a time within the currently open Main Line and draft. A whole Sub-Basket rule moves as one row, retaining its target kind.
- Legacy free-text recommendation/exclusion lists are separate data and are not convertible through this interaction.
- No redesign of section headers, tables, item forms, dialogs, existing add/edit/remove controls, or the specification brand dropdown.
- No same-section sorting, multi-row dragging, cross-Main-Line transfers, catalog mutation, automatic saving, new endpoint, schema migration, or native mobile changes.

## Destination semantics

The destination changes only the rule fields needed to put the row in that section:

| Destination | Trigger | Action | Requirement |
| --- | --- | --- | --- |
| Non-Negotiable Additions | added | add | must |
| Probable Additions | added | add | can |
| Exclusions | added | remove | Preserve the existing must/can value |
| Other scope rules | removed | Preserve the existing add/remove value | Preserve the existing must/can value |

For example, a probable addition moved to Exclusions becomes an optional removal. A non-negotiable addition moved there becomes a required removal. Moving to Other scope rules makes the existing action apply when the source item is removed. It does not create a paired rule.

Preserve the rule ID, Main Basket/Sub-Basket/Main Line IDs, target kind/type, reason, enabled state, and all other stored fields. Use the existing legacy target-kind normalization for edited rows without overwriting malformed target information. Do not copy, delete/recreate, automatically enable, or merge rules.

## Interaction requirements

1. Make the editable item row the drag surface, including the item name, text cells, and free space. The user's follow-up corrects the original handle-only implementation: holding and moving the row must work without finding a specific point. A normal item-name click still opens Edit; the Actions menu and its controls remain independently operable and do not start a drag. Remove the dedicated handle and reuse existing theme tokens and table structure. Do not add an icon dependency.
2. Support desktop browser drag and drop onto a section header or body, including empty sections. Show a restrained destination outline and a short move hint during dragging. Clear feedback after completion or cancellation.
3. Treat the collapsed Other scope rules summary as a drop target. A successful move there expands the section so the moved row is visible. Explain the removal trigger in the destination hint.
4. Add a keyboard- and touch-operable “Move to” choice within the existing row action menu. Offer the other sections by their full names. Use the same transition and validation logic as drag and drop. Touch users can use this action without relying on browser-native dragging.
5. A successful move updates section counts and the rule's action/relationship immediately. Place the moved rule at the end of the destination's displayed rows; retain the relative order of unaffected rows. Mark it as an unsaved edit through the existing workflow.
6. Announce the item and destination using an accessible status message. Restore keyboard focus to the moved row's action control. Announce rejected moves without losing the row or its current focus.
7. Dropping outside a valid destination, pressing Escape, or dropping into the current section makes no data change. External drags and drags from another editor are ignored.
8. Preserve all current loading, unavailable-target, empty, validation, read-only, and responsive states. Existing edit, enable/disable, remove, Add Item, and nested catalog dialogs continue to work.

## Identity, validation, permissions, and failure handling

- Bind drag state to this editor instance, Main Line ID, reset/version key, and a unique stable rule ID. Resolve the current row by ID at the time of the move; never use a captured array index as identity or overwrite newer unrelated fields with a drag-start snapshot.
- Cancel pending movement when the owner/reset key changes, permission becomes read-only, the source disappears, or its ID is no longer unique. Existing invalid-array protection remains authoritative.
- A row with missing/duplicate identity or an invalid trigger/action/requirement is not movable. Keep its existing review/edit path and show an understandable reason. Do not silently repair malformed rule semantics through dragging.
- Missing target details or a missing explanation remain visible and subject to existing save validation. Moving must not erase those issues or fabricate catalog data.
- Before changing the draft, reject a move that would create another active rule for the same target kind, target ID, and destination trigger. Explain that an active rule already exists for that target and trigger. Leave both rules untouched. Disabled rules retain their existing duplicate allowance.
- Preserve existing whole-Sub-Basket/Main-Line overlap diagnostics and backend validation. Do not weaken validation to permit a move.
- Movement requires the same edit permission as the existing rule editor. Read-only views expose no enabled move or drag controls; handlers also guard against late permission changes.
- Moving only calls the existing local change handler. Saving retains current authorization, version/CAS conflict handling, audit behavior, query updates, and retry/error handling. A failed save keeps the user's local draft for correction/retry.

## Implementation approach and compatibility

Use the browser's native drag events for desktop and the existing row action menu for the accessible/touch alternative. Keep the rule transition and rejection checks in a focused, testable frontend helper so both interaction paths are identical. This fits the current React editor and avoids adding a drag framework for cross-section movement only.

Keep the persisted `budgetAlterations` shape unchanged. No backend or native mobile contract changes are expected. Previously saved rows continue to load unchanged; saved movements are ordinary rule-field edits interpreted by existing consumers. Published, issued, or approved historical artifacts remain governed by existing immutable workflow rules.

No new telemetry is required. Existing save errors and audit events remain in use; local move feedback is UI state. Rollback consists of reverting this frontend feature, with existing editors still able to read every saved rule.

## Risks and mitigation

- A move changes business behavior. Destination labels, explicit field mapping, immediate relationship/action updates, and accessible announcements make that effect visible.
- Moving into or out of Other scope rules can collide with a separately configured rule for the same trigger. Reject collisions before changing the draft and retain backend validation.
- Native drag behavior differs across touch browsers. The full-featured Move to action provides an equivalent supported path at every width.
- Row relocation can invalidate focus or index-based callbacks. Resolve mutations using stable IDs and restore focus after rendering.
- Long sections may require scrolling to a destination. Verify normal browser scrolling during desktop dragging and ensure Move to remains usable without scrolling to a destination.
- Existing dirty brand-related work must be preserved. Keep implementation bounded to recommendation files unless an evidenced integration defect requires an explicitly reviewed adjustment.

## Acceptance criteria and verification

- **AC1:** Every directed move between the four groups works for a valid rule, with the destination fields matching the table. Cover required and optional exclusions and every valid action in Other scope rules.
- **AC2:** Main Line and whole-Sub-Basket targets, explanation, identity, enabled state, and unrelated row data survive repeated moves, section save, and reload.
- **AC3:** Empty destinations and collapsed Other scope rules accept moves. Counts, unsaved state, ordering, and action/relationship text update correctly.
- **AC4:** Keyboard and touch users can perform every move through the action menu, receive feedback, and retain useful focus. Desktop dragging starts from the row body or item name without opening Edit; ordinary item-name clicks and Actions controls retain their existing behavior.
- **AC5:** Same-section, cancelled, external, stale-owner, removed-source, duplicate-ID, malformed-semantic, and read-only attempts cannot mutate data.
- **AC6:** Duplicate active target/trigger moves are rejected without field loss; disabled rules and existing catalog/overlap diagnostics retain their current behavior.
- **AC7:** No API write occurs on moving alone. Explicit Save persists the intended edit through the current API; discard restores the saved rule and failed saves retain the local draft.
- **AC8:** Existing add/edit/enable/disable/remove flows and themed desktop/narrow layouts remain intact, without new horizontal overflow or console errors.

Verification after implementation will include focused transition/validation tests, rendered builder interaction and keyboard tests, workspace save/discard/error coverage, frontend typecheck/build, and browser checks at desktop and narrow widths using synthetic local records. Include an accessibility check and inspect the final scoped diff with `git diff --check`. No new tests or build checks have been run at this specification stage.

## Open decisions and approval boundary

No additional product decision is required to review this specification. Approval accepts the four-section scope and destination semantics above, including preserving must/can when entering Exclusions and changing the trigger when entering Other scope rules.

The user approved this specification, approved the [task plan](../plans/2026-10-21-recommendation-section-drag-drop.md), and selected Mode A. Local implementation and verification are authorized. No deployment, production mutation, commit, or push is authorized.
