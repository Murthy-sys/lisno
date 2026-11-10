# Common Description for PMC and Execution

## Goal and scope

In Configuration → Main Lines → Mode, move the existing Description out of PMC into one shared section for both PMC and Execution. Apply the same layout to the default, Signature, Premium and Functional editors through the existing shared builder.

This is a small presentation and validation-navigation change. Do not alter pricing, mode availability, tier radio behavior, description generation, save contracts or other screens.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx:430` places the Description editor inside the PMC section and its collapsible body. Hiding or collapsing PMC also hides Description.
- The builder already saves a single `payload.modeDescription` for the current editor scope; it does not save a separate PMC description. The editor already receives both PMC and In-house scope data.
- Description validation currently calls `showMode("pmc")`, including from validation-summary links.
- `knowledgeModePendingChanges.ts:155` labels the pending description as `Mode · PMC · Description`.
- `KnowledgeModeSectionStateRemoval.test.tsx:458` currently asserts that Description belongs inside PMC.

## Requirements and UX

1. Render the existing Description heading and editor once, immediately below the PMC/Execution selector and above their separate panels.
2. Keep Description visible whether PMC, Execution, both or neither panel is selected, and regardless of either panel's collapsed state.
3. Retain the existing edit, preview, Save, Cancel, validation, dirty-state and read-only behavior. Toggling panels must preserve an in-progress description edit.
4. Description errors must focus the common field without selecting or expanding PMC. PMC-specific errors continue using their current behavior.
5. Label pending description changes `Mode · Description` so the review matches its shared placement.
6. Preserve the separate saved description for each default/tier editor. “Common” means shared between PMC and Execution within the currently selected mode, not shared across tiers.

## Data, constraints and risks

Reuse the existing `modeDescription` field and editor. No API, persistence, migration, permissions, calculation or dependency change is needed. No real Configuration records will be modified for verification.

The main regression risks are hidden validation targets, lost local edits on panel toggles, duplicate editors, and accidental merging of independent tier settings. Keep the editor mounted outside both collapsible panels and retain its existing reset key and callbacks.

Initial worktree has nine modified frontend files and the two previous grouped-mode documents. Preserve all existing work; the principal new product targets are currently clean. Inspect any affected dirty test diff before updating it.

## Acceptance criteria and verification

- Exactly one Description appears outside both PMC and Execution, in all four panel-selection combinations and when panels collapse.
- Editing, cancellation, local save, final Mode save and read-only access keep their existing behavior; toggling PMC/Execution retains unsaved text.
- Description validation reaches the common editor without enabling PMC, and pending-change review uses the common label.
- Default and tier-specific descriptions remain independent; no pricing or save-payload changes.
- Run the relevant builder, Mode panel and pending-change regressions, frontend typecheck/build, rendered keyboard checks and a desktop/mobile visual check. Run `git diff --check` and confirm no unrelated edits.

## Open decisions

None. Keep the existing Description label and styling; only relocate it and remove PMC-specific navigation/label coupling. Implementation awaits the repository's specification and plan gates.
