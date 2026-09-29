# Mode Quick Review margins and scope options

## Goal

In Configuration → Mode, show the margins saved for PMC and Execution in Quick Review, and restore the familiar Inclusion/Exclusion starter options while preventing one scope item from being selected on both sides. Apply the same behavior to web and mobile.

## Current behavior and evidence

- `shared/knowledge/knowledgeSavedSummary.ts` reads the saved Advanced payload and projects three Quick Review rows, but every complete Mode becomes only `Configured`. The shared projection feeds web and mobile, so valid saved basis-point margins are available but hidden from the review.
- `shared/knowledge/knowledgePmcMargin.ts` defines PMC and Sub-Vendor minimum/maximum ranges and the legacy single-rate fallback. In-house labor and material store separate minimum/starting gross margins in `modeCalculations`.
- Web `KnowledgeModeConfigurationBuilder.tsx` and mobile `KnowledgeModeEditor.tsx` currently show an empty Sub-Vendor checklist when no scope configuration exists. The former six-item starter list was intentionally removed in the approved 2026-09-14 backend-owned-lists change. This request changes that initial presentation.
- Web `KnowledgePmcScopeChecklist.tsx` already disables an unchecked item when its normalized name is selected in the opposite list. Shared and backend validation reject a saved both-selected value. Mobile `NativeScopeList` currently allows that tap, leaving the save to fail validation.
- The worktree contains unrelated in-progress vendor induction changes. These Mode targets were clean at investigation start and must be edited without disturbing that work.

## Behavior and scope

1. Quick Review displays the **saved**, validated margin values: PMC minimum–maximum; Execution → Sub-Vendor minimum–maximum Lisno margin; Execution → In-house labor and material minimum/starting gross margins. Format basis points as percentages with up to two decimals. Show a single percentage for an equal or legacy single-rate range. Keep `Not configured` for incomplete or invalid settings; do not imply that a draft was saved. Retain the three existing row labels and the compact preview on web and mobile.
2. For a **new Sub-Vendor scope with no saved scope configuration**, show the former six starter names in both Inclusion and Exclusion checklists: Transport, Shifting, Unloading, ESIC/ PF, Mathadi, and Damage during. They start unchecked. Create distinct stable IDs per list and materialize the displayed options into the Mode draft only when the user edits that scope. Save Mode remains the only persistence action.
3. A saved Sub-Vendor configuration is authoritative. Preserve its exact rows, IDs, order, selections, and explicit empty arrays. Do not refill a deleted item, an empty saved list, or a missing list on an existing saved configuration. Discard restores the saved state. Do not backfill or migrate historical records.
4. On web and mobile, selecting a normalized name in one list makes the unchecked counterpart unavailable in the other list, with an accessible reason. Uncheck or delete the selected item to make the counterpart available. A legacy record with both selected remains visible and repairable by unchecking either side. Matching unchecked entries can coexist. Keep existing frontend and backend validation as the final guard, including case, whitespace, and Unicode-normalized equivalents.
5. Preserve current Mode styling, read-only permissions, save/version behavior, paragraph synchronization, and pending-change review. No changes to margin calculations, prices, APIs, or persisted data shapes.

## Key decisions and compatibility

The recommended interpretation of “default exclusions” is the previously used six-item set in **both** checklists, since the same values were offered on both sides and the requested conflict rule depends on a counterpart being visible. Restricting the starter presentation to a never-saved scope preserves the later requirement that a deliberate deletion or empty saved list stays empty. Existing saved values always take precedence over starter options. The shared Quick Review projection remains the source for both clients.

## Risks and acceptance criteria

- **AC1:** Saving different PMC and Sub-Vendor ranges shows each saved percentage in web and mobile Quick Review after reload; unsaved edits do not appear. In-house shows distinct labor/material gross margin values. Equal and legacy single-rate values appear once; zero is rendered as `0%`.
- **AC2:** Incomplete/invalid saved Mode data does not display an invented margin. Long Quick Review values remain readable in compact and expanded states.
- **AC3:** A new Sub-Vendor scope shows the six unchecked options on both clients. Opening it alone does not write data; first edit, Save Mode, reload, and Discard behave consistently.
- **AC4:** A previously saved `[]`, a removed final item, and a saved configuration with a missing list remain empty after reload; arbitrary backend items render unchanged.
- **AC5:** In both selection directions and on both clients, the same normalized value cannot become selected in both lists. An unavailable row explains why; unchecking/deleting re-enables it. Legacy conflicts can be repaired. Direct backend submissions remain rejected without persistence or version changes.
- **AC6:** Focused shared projection, web checklist/Mode save, mobile Mode editor, and backend validation regression checks pass; web/mobile rendered interaction and `git diff --check` complete. Scope work does not alter the unrelated vendor induction changes.

## Open decisions

No blocking decisions. Approval confirms the six former starter names in both checklists for a never-saved Sub-Vendor scope, with saved empty lists remaining empty.
