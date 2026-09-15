# Overview UOM and Surfaces proportions

Status: approved and implemented in execution mode A. Verification is recorded in the [task plan](../plans/2026-09-15-overview-uom-surfaces-proportions.md).

## Goal and current evidence

Give UOM one quarter and Surfaces three quarters of the available Overview row, as requested. The attachment shows the two sections occupying approximately equal widths.

`KnowledgeOverviewPanel.tsx` renders UOM and Surfaces as sibling sections inside `.knowledge-overview`. Existing configuration styles preserve their borders, headings, controls and selected-surface descriptions. The current Overview control rule in `ai-estimator-knowledge.css` reserves a 9.5rem action column beside both selectors; leaving that unchanged inside a quarter-width UOM card would squeeze its selector.

## Requirements and approach

1. At suitable desktop content widths, use a **1:3 grid** for the existing UOM and Surfaces sections, excluding the normal gap. Keep both sections aligned at the top and retain the current spacing, typography and visual treatment.
2. Keep the UOM selector usable at the narrower width. Allow Add Unit to sit below the selector when necessary, retaining its visible label and accessible name. Keep the Surfaces selector/Add Surface action inline where space permits, and retain the existing responsive selected-surface list.
3. On narrow content widths, stack UOM above Surfaces. Base the layout threshold on actual Overview content space where practical, since navigation reduces available width. Use approximately 56rem of content as the initial desktop threshold and confirm it against rendered checks. Do not introduce a horizontal scrollbar or squeeze controls solely to maintain the ratio.
4. Preserve UOM/Surface selection, quick-add dialogs, permissions, saved values, validation, loading/error/empty states and Save Overview behavior. Retain keyboard order and visible focus; controls and actions remain readable at 200% zoom and on mobile.
5. Scope styling to the Overview workspace. Reuse the existing components and responsive styles; no dependency, API, persistence or financial change is required.

## Scope and constraints

Expected implementation is confined to Overview rules in `knowledge-configuration-ui.css` (the final imported configuration stylesheet), with an existing layout assertion adjusted only if it becomes obsolete. A minimal Overview-specific class is acceptable only if existing selectors cannot express the layout cleanly. Do not restyle other configuration sections, change copy, hide actions or reduce fonts unnecessarily.

The worktree contains earlier completed changes, including automatic simulator previews. Capture the current target diff before editing and preserve all unrelated work. No staging, commit, push, deployment or application-data mutation is included. No meaningful architecture decision or open product question remains; stacking narrow controls follows the requirement to keep UOM compact and usable.

## Acceptance criteria and verification

- **AC1:** At a desktop content width comparable to the attachment, UOM uses 25% and Surfaces 75% of the row after subtracting its gap; both remain top-aligned.
- **AC2:** UOM selection and Add Unit stay usable inside the narrow card. Surfaces uses the extra width without clipped names/actions or excessive fixed gaps. Long labels, empty/loading/error and read-only states fit.
- **AC3:** Tablet/mobile and 200% zoom use a readable stacked layout as needed, with no horizontal overflow and preserved keyboard focus/order.
- **AC4:** Run existing Overview component/layout and Surface selector tests, frontend typecheck/build, and `git diff --check`. Do not add a new test that merely repeats CSS declarations. Inspect rendered desktop/narrow layouts and a selector/quick-add interaction using local synthetic data. Report any browser automation limit explicitly; recent mobile resizing has stalled.

No backend/full-repository/replica-suite rerun is needed for this style-only change unless an unexpected implementation issue justifies it. The repository requires specification approval, a separate task-plan approval and execution choice before implementation.
