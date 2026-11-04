# Compact estimator dimension fields

Date: 2026-11-04

Status: Approved. Task plan approved; Mode A selected. Implemented and verified on 2026-11-04. See the [task plan](../plans/2026-11-04-estimator-compact-dimensions.md) for evidence and verification limits.

## Goal and interpretation

Reduce the oversized dimension boxes and excess text in the estimator item row shown in the user's screenshot. Keep Length, Width, Height, units, calculated quantity and any required dimension confirmation. Preserve all functional checkboxes and selection/pricing controls; the requested cleanup concerns the circled dimension inputs and explanatory text, not the submission checklist added previously.

## Current behavior and evidence

- `frontend/src/features/leads/EstimateDimensionsFields.tsx` repeats the full basket, Sub Basket, item and room in its visible legend. It also displays a long generic instruction paragraph and another paragraph whenever dimensions cannot be calculated.
- `estimateDimensions.css` gives each of four columns an equal share of the entire row. On a wide estimate this stretches three small numeric inputs unnecessarily.
- `estimator-dashboard.css` already supplies compact control tokens, but the dimension override sets only minimum height and does not constrain the four-column width.
- `ConfiguredEstimateBuilder.tsx` contains the long empty-basket paragraph visible in the screenshot. Current selected-only behavior normally avoids empty item groups; preserve that behavior and shorten the fallback where it is rendered.
- The dimension component is also used by Client quotation. Use an explicit compact presentation for the staff estimation builder, preserving the Client component's default presentation. No dimension formula or save rule needs to change.
- Existing uncommitted recommendation and submission-checklist work is present. The current dirty paths were captured during investigation and must be preserved.

## Requirements and UX

1. Bound the desktop dimension area to its content rather than stretching across the entire item row. Aim for roughly 90–120 px per measurement input and a readable calculated-quantity column. Use existing compact control-height tokens, approximately 32 px on desktop and existing 40–44 px touch sizing where applicable.
2. Reduce fieldset spacing and remove avoidable blank space. Keep controls aligned and responsive; use two columns or stacking on narrow screens without horizontal page overflow.
3. Replace the long visible legend with **Dimensions**. Retain the complete item/room context in accessible names so repeated inputs remain distinguishable to assistive technology.
4. Keep the short visible labels **Length (unit)**, **Width (unit)**, **Height (unit)** and **Quantity (unit)**. Preserve the calculated output and its Pending state.
5. Remove the always-visible instructional paragraph about positive values, decimal places, the formula and recorded height in the compact presentation. Do not replace it with another permanent explanatory block.
6. Keep validation authoritative. Replace verbose incomplete/invalid-dimension status with one concise actionable message when needed, such as **Enter valid dimensions.** Preserve distinct missing-unit/configuration and changed-rule warnings in short form. A rule-change confirmation remains available, with concise visible text **Confirm dimensions** and its full contextual accessible name.
7. Shorten the empty-basket fallback to **No available items.** Retain its refresh action when applicable. Do not restore empty groups that the selected-only builder already hides.
8. Preserve item inclusion, quantity calculation/precision, required height, dimension review, pricing/modes, saving and submission behavior. Do not remove actual business warnings, customer notes or the required estimator submission checklist.

## Scope, data and compatibility

Small presentation-only change to `EstimateDimensionsFields.tsx`, its local CSS, the staff builder call site/fallback copy and narrowly required estimator CSS overrides. Shared staff estimation consumers receive the same compact presentation; Client defaults remain unchanged. Use existing controls and design tokens without dependencies or global form-style changes.

No API, persistence, permission, financial or approval changes. No migration. The application backend, launcher and OCR remain stopped; browser checks use an isolated frontend fixture if needed. No live data mutation, commits, pushes or deployment.

## Risks and acceptance criteria

- Compact dimensions must not inherit a larger global minimum height or overflow on small screens. Verify computed sizing and screenshots at 390, 768 and 1440 pixels.
- Long context labels must remain available as accessible names after visible text is shortened. Confirm keyboard operation, readable labels, focus and no clipped confirmation controls.
- Empty/invalid values still block saving as before; valid dimensions still calculate the same quantity; changed rules still require confirmation. Existing calculation and builder regressions provide behavior evidence. Add or adjust only meaningful rendered assertions for compact copy/accessibility and unchanged Client defaults.
- Preserve the preceding recommendation/checklist edits. Verify focused dimension/builder/Client regressions, frontend typecheck/build and `git diff --check`; record exact results and any limits in the task plan. Do not run unrelated backend or OCR suites.

## Open decisions

None under the input-size and text-cleanup interpretation above. This request follows the repository's compact specification/task-plan workflow.
