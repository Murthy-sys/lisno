# Restore direct Sub Basket browsing in Sales estimation

Date: 2026-11-05
Status: Approved. Task plan approved and Mode A selected; implementation and verification tracked in the separate task plan.

## Goal

After Sales selects Main Baskets and continues to Estimate Builder, show those Main Baskets' Sub Baskets and available item rows directly for the active room, as in the earlier Sales workflow. Sales must not open a separate Add items picker to discover items already within the selected Main Baskets.

Showing an available item does not include it in the estimate. Sales explicitly selects the required items; only included items affect totals and publication. Preserve existing saved selections, manual values, exclusions, current Configuration rules and approval restrictions.

## Current behavior and evidence

The user supplied a Sales estimate with POP / Gypsum and Painting selected, two rooms, zero selected items, and only an Add items button where Sub Baskets and item rows were expected.

Verified source/history evidence:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` filters active-room lines by `included`, removes Main Basket groups with no included lines, and removes empty Sub Basket groups. A new estimate therefore has no browseable groups even though Main Baskets have been selected.
- The same component initializes `pickerOpen` to false and supplies the catalogue through `EstimateItemPicker`. Its top search filters selected rows; available items are discoverable through a second picker/search.
- `frontend/src/features/leads/configuredEstimate.ts:buildConfiguredLines` refreshes only existing draft lines. It does not create rows for the available catalogue. `createConfiguredLine` creates a specific room/item draft with `included: false`.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx:buildLines` calls that refresh helper and opens the builder. For an empty draft, selecting Main Baskets does not create any item rows.
- Git history identifies commit `7fb325f5` (`assign flow correction`, 2026-11-05) as introducing the selected-only display and closed item picker. The preceding builder displayed available unselected rows under Main Basket/Sub Basket groups, with explicit item inclusion controls.
- `ConfiguredEstimateBuilder.test.tsx` and `EstimateItemPicker.test.tsx` intentionally test the newer picker-first behavior. Those 20 existing tests passed during diagnosis, confirming that tests encoded the unwanted flow rather than detecting this UX regression.
- The completed Client pre-submission visibility fix changed only `ClientProject.tsx`, `ClientQuotation.tsx`, `ProjectWorkflowPanel.tsx` and their tests. It did not modify the Sales builder or its line construction. Those Client changes remain required and must be preserved.

The previous explanation that Sales should simply use Add items did not match the user's intended workflow. This specification corrects the Sales presentation expectation.

## Worktree baseline

At investigation start, the six source/test files from the completed Client visibility fix are modified, and its approved specification/task plan are untracked. They are understood, in-progress repository work owned by this conversation. No Sales targets have local diffs.

Preserve all existing Client changes and documents. Do not revert commit `7fb325f5` wholesale: it includes other changes and safeguards that this request does not supersede.

## Scope and non-goals

In scope:

- The current Sales estimation workspace, including new drafts and reopened editable saved drafts using configured Main Baskets.
- The selected Main Basket > Sub Basket > item presentation, room changes, top search/filter, inline item selection and deselection, draft overlays and relevant empty/error states.
- Minimal Sales-scoped integration in the existing staff builder and workspace, with focused regression and rendered browser verification.

Out of scope:

- Client quotation browsing, the completed Client pre-submission fix, Designer-only presentation or other staff roles' behavior.
- Historical/submitted snapshot presentation, Sales assignment or permissions, approval/publication behavior, backend APIs, Configuration editing, finance calculations or stored estimate migrations.
- Reverting inline recommendations, compact dimensions, save/navigation guards, removal confirmations or current Configuration freshness behavior.
- New dependencies, global styling, a visual redesign, live data mutations, seeding, customer communication, commits, pushes or deployment.

## Recommended approach and alternatives

**Recommended:** derive the active room's available item presentation from the already-authorized current catalogue and selected Main Basket IDs. Overlay existing draft/saved lines by stable room and Main Line identity, while preserving their grouping compatibility checks. Use the established item row and hierarchy components. Store a new draft line only when Sales deliberately edits or selects that item; browsing itself must not alter draft state or totals.

This restores direct browsing while preserving the current sparse draft model. It avoids generating draft objects for every catalogue item in every room and keeps the Client/Designer behavior isolated through an explicit Sales presentation choice.

**Alternative:** restore the old eager room-by-catalogue draft generation. This resembles the former implementation but broadens changes to shared draft construction, creates unnecessary state for large catalogues and increases regression risk around hydration, pricing and saving. Do not use this approach merely to recreate the visual result.

Automatically opening the existing picker is insufficient: it still presents a separate item-selection list instead of restoring the requested Sub Basket hierarchy.

## Requirements

### R1. Immediate hierarchy

- In the current Sales working draft, entering Estimate Builder displays selected Main Baskets and their authorized Sub Basket headings for the active room, even when zero lines are included.
- Show available Main Lines and temporary items directly within their proper Sub Basket; preserve supported direct-Main-Basket temporary items in their existing group.
- Use the established expanded hierarchy initially, respecting later user collapse choices. Main Basket jump controls must target a rendered section even before its first inclusion.
- Remove the separate mandatory Add items step for this Sales presentation. Do not show duplicate catalogue rows or a second picker containing the same available items.
- Keep rooms navigable when empty and preserve the user's existing room context.

### R2. Explicit selection and stable state

- New available items start unchecked. Simply opening the builder, changing rooms, searching, collapsing groups or refreshing must not include items, write data, mark an unchanged saved estimate dirty, generate recommendations or inflate totals.
- Reuse current inline inclusion controls and quantity/dimension/rate fields. A deliberate edit to an unselected row may create a local draft, remaining excluded until Sales explicitly selects it. Preserve that local edit when changing rooms or filtering.
- Selecting an item creates/updates only its own room/Main Line draft. Deselecting it leaves the row available in its Sub Basket and preserves its existing local values for re-selection under the current save rules.
- Saved included/excluded lines retain quantities, dimensions, classification, pricing mode, tier, component choices, manual rates and stable IDs. Display-only catalogue defaults must never overwrite those values.
- Keep save payload rules intact: included lines and persisted exclusions remain eligible for serialization; merely displayed catalogue rows must not be serialized.
- Existing group removal and recommendation-source cleanup retain their current room/scope boundaries. Removing a Sub Basket must not automatically re-include its rows on refresh or reload.

### R3. Search, navigation and accurate states

- The main builder search and Main Basket filter work across all available and saved rows in the active room's selected Main Baskets. Sales should be able to locate an item that has never been included without opening another search surface.
- Keep selected-item counts and totals based on included rows only. Where group counts describe available rows, label them clearly so zero selected items does not imply that the catalogue is empty.
- If a selected basket or Sub Basket truly has no eligible catalogue items, show an explicit empty state and the existing refresh action where appropriate. Do not use the current message instructing Sales to use Add items for a populated catalogue.
- Loading, failed refresh, stale sources, incomplete pricing and incompatible Configuration grouping remain visible and prevent unsafe additions through the existing guards. Missing prices must not become fabricated zero prices.
- Current names, UOM, rates and mode rules come from the same current Configuration source already used by Sales. Do not substitute another Main Line or an older revision to fill an unavailable row.

### R4. Role and lifecycle boundaries

- Select the restored browsing mode explicitly for Sales in the current working draft. Keep presentation stable while a transient fetch/save disables editing; do not hide all unselected rows merely because controls are temporarily disabled.
- Published, approved, closed and historical views retain their existing immutable/saved-source presentation and action restrictions. Do not project unsaved current catalogue rows into historical snapshots.
- Preserve the Client picker, Client data filtering and the three-panel pre-submission gate. Designer-only and other staff presentation remain unchanged.
- Keep backend authorization authoritative. This is a frontend presentation/state adaptation, not an expansion of catalogue access or mutation permissions.

### R5. Performance and accessibility

- Derive catalogue rows for the active room rather than building the full rooms × items draft state. Preserve collapse behavior and avoid expensive pricing requests for unselected display-only rows.
- Keep item discovery responsive for a synthetic 1,000-item catalogue. If rendering needs bounding, use group-local rendering/pagination that leaves Sub Basket headings and initial item choices visible; do not reintroduce a global Add items barrier.
- Retain semantic hierarchy, keyboard selection, visible focus, accessible labels, responsive controls and existing reduced-motion behavior. Deselecting a displayed item should not unexpectedly remove its focus target in the Sales browse mode.

## Data/API, compatibility and operations

No backend DTO, endpoint, schema, migration or permission change is expected. Stable Main Basket, Sub Basket, Main Line and room IDs remain the joins. Integer-paise totals, GST handling, manual overrides, version/CAS guards and immutable approval history remain unchanged. No real email, file or database operations are needed for verification.

The current selected-only behavior is documented in `2026-11-04-estimation-inline-recommendations-design.md` and referenced by the compact-dimensions specification. This user correction supersedes only the Sales picker-first/selected-only presentation requirement, preserving the other recommendation, performance and validation safeguards.

Rollback is the bounded frontend correction and its tests, with no data rollback. Keep the completed Client fix independent.

## Assumptions, risks and open decisions

- The user's expected “as before” behavior means browsing available rows under selected Main Baskets and Sub Baskets, with explicit per-item selection. It does not mean automatically charging for every available item.
- Existing selection/deselection, save and historical behavior should remain intact; the change is to Sales item discovery and its local draft adaptation.
- Main risks: catalogue previews leaking into save payloads or totals; overwriting manual/saved values; old grouping silently being reassigned; missed drafts during room switches; duplicate rows in excluded-review sections; accidental changes to other roles; and excessive rendering for large catalogues.
- The read-only investigation establishes a frontend cause. If implementation reveals a backend contract change is necessary, stop and revise the affected specification/plan before expanding scope.
- No unresolved product choice requires a separate question before specification approval.

## Acceptance criteria and verification

1. **AC1: Empty draft discovery.** With POP / Gypsum and Painting selected, Sales sees their Sub Baskets and available items immediately in Estimate Builder, with no Add items click, zero selected count and unchanged total.
2. **AC2: Search and room scope.** Top search/filter locates an unselected item, basket jump/collapse works, and switching between two unequal rooms preserves independent selections and local edits.
3. **AC3: Explicit inclusion.** Selecting one row affects only that room/item and the authoritative calculated total. Deselecting/reselecting preserves values, and neither browsing nor refresh auto-selects siblings.
4. **AC4: Save/reopen.** Existing manual rate, tier, pricing-mode, dimension and component selections survive save, reload, catalogue refresh and basket navigation. Display-only rows never enter save payloads or dirty-state comparisons.
5. **AC5: Exclusions and freshness.** Persisted exclusions/group removals stay excluded; current Configuration and incompatibility checks remain authoritative; excluded rows needing correction remain discoverable without duplicate actionable copies.
6. **AC6: Failure and empty states.** Loading/error/stale/incomplete/grouping-conflict fixtures show honest status and preserve drafts; truly empty Sub Baskets are distinguishable from populated but unselected ones.
7. **AC7: Boundaries.** Client pre-submission visibility and Client quotation behavior pass existing regressions; Designer and historical/submitted views do not gain catalogue previews or editing rights.
8. **AC8: Rendered quality.** Desktop/mobile browser checks show immediate hierarchy, no horizontal overflow, usable keyboard focus/selection and accessible controls. The 1,000-item fixture stays bounded to active-room display and explicitly edited/selected draft state.

Verification after implementation will cover the Sales builder and `LeadEstimateWorkspace` interaction suites, configured-line state/pricing/dimensions tests affected by the chosen adaptation, and existing Client visibility/quotation tests. Use unequal rooms, distinct stable IDs and a large catalogue fixture. Run frontend typecheck/build, focused regression checks, rendered desktop/mobile/keyboard/accessibility checks, `git diff --check` and final status review. No lint script exists. Record exact executed checks and any remaining limits in the separate task plan after approval.

The repository's specification gate applies: create the task plan only after this specification is approved, then request execution mode after plan approval.
