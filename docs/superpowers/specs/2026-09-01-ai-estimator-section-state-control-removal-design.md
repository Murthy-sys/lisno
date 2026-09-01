# AI Estimator Section State Control Removal

## Goal

Remove the low-value **Section state** selectors from every visible tab in the
Super Admin AI Estimator item workspace, while preserving the existing backend
section state and all save/version behavior.

## Current behavior and evidence

- `KnowledgeItemWorkspacePage.tsx` renders a **Section state** selector for each
  standalone workspace section: Overview, Scope, Recommendations, Quality,
  Execution, and Advanced.
- `KnowledgeModePanel.tsx` renders the same control separately for the UOM,
  Pricing, and Quantity & margin blocks grouped inside the Mode tab. This is the
  source of the **UOM section state** row shown in the supplied screenshot.
- Each control exposes the backend section envelope's `applicability` value as
  Configured, Not configured, or Not applicable and marks the section dirty when
  changed.
- Both save paths already hold the loaded `applicability` value in local state
  and include it when updating a section. Therefore, removing the control does
  not require removing the value from the update request.
- The Overview editor also contains **Section applicability rules**. Those are
  item configuration data, not the section-envelope state control targeted by
  this request.
- The relevant frontend files already contain uncommitted work for the Mode-tab
  consolidation. The implementation must make a narrow additive change without
  reverting or reformatting that work.

## Proposed behavior

- No AI Estimator item-workspace tab displays a **Section state** selector.
- The Mode tab does not display a section-state selector in its UOM, Pricing, or
  Quantity & margin blocks.
- Existing section state remains backend-owned. When another field is saved, the
  frontend sends back the state loaded for that section rather than manufacturing
  or changing it.
- Section version metadata, unsaved/saving feedback, save actions, conflict
  handling, and the contents of every editor remain available.

## Scope

- Remove the section-envelope applicability selector markup and its change
  handlers from the standalone-section and Mode-block toolbars.
- Remove CSS that is used only to lay out those toolbar controls if it has no
  remaining consumers.
- Add focused frontend regression coverage proving the controls are absent from
  all visible workspace sections and that saves preserve loaded applicability.
- Verify the affected item workspace at desktop and mobile widths.

## Non-goals

- No backend contract, schema, persistence, completeness, activation, or
  authorization change.
- No data migration or rewrite of existing section applicability values.
- No removal or redesign of the Overview editor's **Section applicability
  rules**.
- No removal of section version metadata, save controls, dirty/saving status,
  conflict review, or other tab content.
- No change to reusable-value applicability fields such as tax applicability.
- No deployment, production mutation, dependency addition, commit, or push.

## Requirements

1. Overview, Scope, Recommendations, Quality, Execution, and Advanced render no
   **Section state** label or Configured/Not configured/Not applicable selector.
2. Mode renders no section-state selector for UOM, Pricing, or Quantity & margin.
3. Removing the controls does not leave an empty toolbar row: remaining version,
   dirty/saving, and save content retains a compact responsive layout.
4. Saving an edited section preserves the exact `applicability` value returned
   by that section's latest loaded envelope.
5. Saving Mode preserves the independently loaded applicability value for each
   dirty underlying backend section.
6. Refresh, discard, and version-conflict flows continue replacing local
   applicability with the latest server value even though it is no longer
   directly editable.
7. Read-only and archived views also omit the controls without losing their
   established status, loading, error, or version feedback.
8. **Section applicability rules** in Overview remain unchanged.
9. The change remains confined to the Super Admin AI Estimator item workspace
   and does not alter unrelated Field or Select primitives.

## Assumptions and constraints

- “Section state in every tab” refers to the section-envelope dropdown shown in
  the screenshot, including the three Mode blocks, and not to domain-specific
  applicability settings inside an editor.
- Existing server values may still be `configured`, `not_configured`, or
  `not_applicable`; hiding the UI does not normalize them.
- A later approved feature introduces one narrow semantic exception: adding,
  editing, reordering, or removing `advanced.payload.modeConfigurations` marks
  Advanced `configured`, because otherwise activated estimator context would
  omit successfully saved dynamic Mode knowledge. Ordinary section saves and
  untouched Mode blocks still preserve their loaded applicability exactly.
- The current API requires applicability on section updates, so the frontend must
  preserve and submit the loaded value.
- Existing dirty work in the target feature belongs to ongoing user work and
  must be preserved.

## Data, API, authorization, and UX impacts

### Data and API

- No endpoint or payload-shape change.
- Section update requests continue carrying the existing applicability value.
- No migration or rollback is needed; code rollback restores only the controls.

### Authorization

- Backend authorization remains authoritative and unchanged.
- Existing edit/read-only permission behavior for all remaining fields and save
  actions remains unchanged.

### UX and accessibility

- Removing redundant labelled controls reduces visual weight and tab height.
- Toolbar reading order and responsive layout must remain coherent after the
  first control is removed.
- No inaccessible hidden control will remain; the selector is removed from the
  DOM rather than visually concealed.

## Risks and mitigations

- **Accidental state reset:** a save could overwrite an existing applicability
  value if local state is removed with the selector. Mitigate by retaining the
  loaded value in save state and asserting exact update payloads in tests.
- **Incomplete coverage:** Mode and standalone tabs use different rendering
  paths. Mitigate by testing both paths and all first-level navigation entries.
- **Toolbar spacing regression:** removing the leading field can expose layout
  assumptions. Mitigate with focused responsive rendered checks and removal of
  only demonstrably unused CSS.
- **Overlap with current work:** target files are already modified/untracked.
  Mitigate by limiting edits to the section-state control path and inspecting the
  final per-file diff against the pre-existing work.

## Acceptance criteria

- The Section state selector is absent from every first-level item-workspace tab
  and every Mode block at desktop and mobile widths.
- Existing section applicability survives normal save, Mode save, discard, and
  conflict-refresh flows unchanged.
- Section versions, unsaved/saving indicators, save commands, editors, and
  Overview section-applicability rules remain functional.
- Focused frontend tests pass, followed by frontend typecheck and build.
- Rendered interaction/accessibility checks show no empty toolbar space or
  horizontal overflow at representative desktop and mobile widths.
- `git diff --check` passes and unrelated dirty paths remain untouched.

## Open decisions

- None. The request and repository evidence support removal of the UI controls
  while preserving the underlying backend-owned values.
