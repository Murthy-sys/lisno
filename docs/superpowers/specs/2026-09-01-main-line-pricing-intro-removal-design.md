# Main Line Pricing Intro Removal Specification

## Goal

Remove the highlighted introductory Pricing form from **Configuration → Main Basket → Main Line → Mode** so the Pricing block starts directly with its reusable pricing-specification and price-version controls.

## Current behavior and evidence

- `KnowledgeModePanel.tsx` renders the `pricing` section through `KnowledgeSectionEditor` inside the Mode workspace.
- `KnowledgeSectionEditor.tsx` currently gives every section a heading and helper paragraph. For Pricing this produces **Pricing** and **Maintain specifications, immutable price-version commands, and internal pricing notes. Enter price amounts in rupees.**
- The same Pricing branch renders three fields before the structured pricing controls:
  - **Technical description**
  - **Internal vendor notes**
  - **Quality level**
- Pricing specifications and immutable price-version commands are rendered separately by the section's structured-array editors and are not part of the highlighted introductory field group.
- The relevant production and test files are already modified in the user's dirty worktree. Their unrelated changes must be preserved.

## Scope

- Hide/remove the Pricing section heading and helper paragraph within the consolidated Mode panel.
- Hide/remove Technical description, Internal vendor notes, and Quality level from the rendered Pricing editor.
- Keep Pricing block metadata, errors, conflicts, loading states, pricing specifications, price-entry/version commands, and Mode save behavior intact.
- Update focused frontend tests that currently expect or edit the removed fields.

## Non-goals

- Do not remove the Pricing block itself from Mode.
- Do not remove pricing specifications, price entries, immutable price versions, vendor/UOM/tax/specification selection, or the Overview Pricing specifications summary.
- Do not delete or rewrite previously saved `technicalDescription`, `internalVendorNotes`, or `qualityLevel` payload values.
- Do not change backend schemas, APIs, validation contracts, persistence, CAS versions, query keys, permissions, activation readiness, or migration behavior.
- Do not change Quantity & margin or any other tab/section.
- Do not add dependencies, stage, commit, push, deploy, or mutate production data.

## Requirements

1. The Mode Pricing block must no longer render the **Pricing** editor heading or its helper sentence.
2. The Mode Pricing block must no longer render Technical description, Internal vendor notes, or Quality level controls in editable, read-only, archived, loading-recovery, or conflict-recovery states.
3. Pricing specifications and price-entry/version controls must remain visible and operable according to their existing permissions and revision state.
4. Existing hidden Pricing payload keys must remain preserved when another Pricing value is saved; hiding the fields must not manufacture deletion updates.
5. Mode must retain exactly one **Save Mode** action and the established Pricing → Quantity & margin ordered CAS behavior for dirty sections.
6. Pricing block version, dirty, partial-failure, and conflict attribution must remain intact.
7. Human-readable server conflict review may still display meaningful saved Pricing values, but must continue to hide raw JSON and stable IDs.
8. Read-only and archived Pricing controls must remain non-mutable.

## Assumptions

- “Remove this section” refers to the highlighted introductory Pricing content shown in the screenshot, not to the pricing-specification and price-version functionality below it.
- Existing stored values for the three removed fields may still be used by backend consumers or historical revisions, so this is a presentation removal only.
- The Pricing Mode block toolbar already provides enough section identity after the duplicate inner **Pricing** heading is removed.

## Constraints

- Preserve existing frontend permission plus backend `allowedActions` gating.
- Preserve aggregate and section CAS semantics.
- Preserve the broad dirty worktree and do not reformat or revert unrelated changes in shared files.
- Use existing components and styling; no shared primitive change is required.

## Risks and mitigations

- **Accidental pricing-data deletion:** retain the complete loaded payload when saving remaining Pricing controls and add a preservation regression test.
- **Mode save regression:** keep Pricing as a Mode-owned backend section and retain ordered multi-section save tests.
- **Test coupling to removed fields:** replace field-based dirty/conflict fixtures with pricing-specification or price-entry interactions where the behavior under test still applies.
- **Loss of Pricing identity:** retain the existing Pricing Mode block toolbar/version label.

## Acceptance criteria

1. The highlighted Pricing heading, helper text, Technical description, Internal vendor notes, and Quality level are absent from Mode.
2. Pricing specifications and price-entry/version controls remain present.
3. Saving a remaining Pricing change preserves previously stored hidden introductory values.
4. Mode's single-save, ordered CAS, partial-failure, conflict, dirty-navigation, read-only, and archived behaviors remain correct.
5. Overview's configured-only Pricing specifications summary is unchanged.
6. Focused Pricing/Mode/workspace tests, frontend typecheck, full frontend tests, production build, and `git diff --check` pass.
7. No backend, API, persistence, authorization, cache, migration, dependency, or shared-primitive change is introduced.

## Data, API, and UX impact

- **Data/API:** no contract change and no stored-value deletion.
- **Persistence/migration:** none.
- **Authorization:** unchanged.
- **UX:** removes the redundant introductory Pricing form while retaining the actionable pricing configuration beneath it.
- **External actions:** none authorized.

## Open decisions

No open decision remains if the screenshot refers to the introductory fields only. Removing the entire Pricing block or its specification/version controls would be a materially different scope.
