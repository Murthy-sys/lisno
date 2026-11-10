# Compact estimation fields task plan

Date: 2026-11-10
Status: specification and task plan approved; Mode A implementation and verification complete.

Source of truth: [approved specification](../specs/2026-11-10-estimation-compact-fields-design.md).

## Scope and preservation

Only bound the Qty, Rate and Amount field widths so unused row space does not stretch them. Preserve existing responsive wrapping, touch targets, unit headings, full amounts and all business behavior. Existing uncommitted changes from the preceding responsive-row task are the baseline; capture relevant diffs before editing and preserve them. No dependencies, backend changes, commits or deployment.

## Tasks

1. **Capture baseline and adjust shared sizing.** Primary owner. Inspect the current target diff, then replace the fields group's growth and fractional desktop columns with compact sizing. Preserve narrow-container reflow and touch dimensions. Exclusive path: `frontend/src/styles/estimator-dashboard.css`. Acceptance: spec criteria 1–3.
2. **Align preview sizing.** Primary owner in Mode B; a separate bounded frontend owner in Mode A, after agreeing the shared width budgets. Adjust only preview grid overrides that would undo compact sizing. Exclusive path: `frontend/src/features/ai-estimator-knowledge/knowledge-main-line-client-preview.css`. Can run alongside task 1 on the separate path after the sizing contract is settled. Acceptance: spec criteria 1–3.
3. **Verify and clean up.** Primary owner after both edits finish. Render synthetic Estimator, Client view preview and shared quotation rows at mobile/tablet/desktop widths, compare field widths at two wide viewport sizes, and check narrow containers, Standard/Special, touch controls and a large amount. Inspect representative screenshots. Run `cd frontend && npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx --maxWorkers=1`, `npm run build`, and `git diff --check`. Do not add CSS declaration tests. Remove task-owned temporary browser artifacts, stop only task-owned servers and record exact results here. Acceptance: spec criteria 1–4.

Keep one parent task in progress. In Mode A, delegate only the independent preview stylesheet slice with explicit ownership and preserve other writers' changes; root integrates and performs the proportional final review. In Mode B, work inline. No implementation begins before task-plan approval and execution-mode selection.

## Result and verification

- Changed only field-sizing rules in `frontend/src/styles/estimator-dashboard.css` and `frontend/src/features/ai-estimator-knowledge/knowledge-main-line-client-preview.css`. Desktop Qty/Rate/Amount measure 96/112/120px; fields no longer grow into unused row space. Touch widths retain room for the existing 44px controls. Narrow layouts use a bounded two-column group, with single-column reflow at the existing smallest-container threshold. Preview overrides match the shared sizing.
- Captured dirty paths and both target contents before writers started. Root compared the final changes against that baseline and reviewed the two-file presentation-only diff. All preceding edits remain intact. No dependencies or business/API/data changes.
- Chromium rendered checks used synthetic data with the actual ConfiguredEstimateBuilder, ClientQuotationLine and KnowledgeMainLineClientPreview components and full styles/fonts. Eighteen viewport/state cases passed at 320, 390, 768, 1280 and 1920px with Standard/Special. All three presentations measured the same compact desktop field widths at 1280 and 1920px. No control/group overlap, field overflow or horizontal page overflow was found; the large quotation amount ₹1,23,45,678.90 remained within its field. Quantity editing worked and the estimator rate stayed disabled. Desktop/mobile screenshots were inspected.
- Three coarse-pointer cases at 390/1280/1920px had no field/page overflow; wide Qty/Rate measured 130/120px, and quantity steppers remained 44px tall. Additional preview-container checks at 250/260/480px passed with no field overlap or overflow. No Firefox/Safari or physical-device checks were run.
- `cd frontend && npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx --maxWorkers=1`: exit 0, 2 files / 20 tests passed.
- `cd frontend && npm run build`: exit 0, including `tsc -b`; Vite transformed 3,346 modules and retained the existing >500kB chunk warning. Ignored outputs: `frontend/dist/` and TypeScript metadata under `frontend/node_modules/.tmp/`.
- `git diff --check`: passed. No new tests, separate typecheck, full/frontend/backend/OCR suite or lint command was needed; the repository has no lint script.
- Task-owned browser fixture/screenshots under `frontend/output/playwright/compact-fields-20261110/`, baseline under `/tmp/lisno-compact-fields-20261110/`, and this session's `.playwright-cli` snapshot/log were removed. Task browser and port-5179 Vite server were stopped; existing app services were preserved. No staging, commits, deployment, migrations or external mutations were performed.

## Placement correction after user feedback

The initial compact-width implementation also moved the field group beside the name. The user clarified that widths alone should change. Corrected the existing task by adding `margin-inline-start: auto` to the shared fields group and resetting it to zero in the existing <=700px container rule. Qty/Rate remain 96/112px on desktop. No component, pricing, data or other control changes were made for this correction. A read-only review confirmed no conflicting preview/quotation overrides.

Rendered Chromium verification covered selected, unselected and preview rows at 320/390/768/1280/1920px: wide groups aligned with the right edge, narrow groups retained left reflow, with no group overlap or horizontal overflow. Desktop and mobile screenshots were inspected, and the quantity increment interaction passed. `cd frontend && npm run build` passed, including TypeScript compilation (3,346 modules; existing large-chunk warning); `git diff --check` passed. The unchanged 20 focused tests were not repeated for this two-property CSS correction. Temporary artifacts under `frontend/output/playwright/field-alignment-1110/`, `/tmp/lisno-field-alignment-20261110/` and the session's `.playwright-cli` snapshot/log were removed; the task browser/server were stopped. No commits or deployment.
