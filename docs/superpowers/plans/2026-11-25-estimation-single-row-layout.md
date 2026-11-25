# Estimation single-row layout: implementation plan

Date: 2026-11-25
Status: Approved and implemented in Mode A. Final verification complete.

Source of truth: [approved specification](../specs/2026-11-25-estimation-single-row-layout-design.md).

## Result

Desktop primary row: **Main Line → Tier → PMC → Standard/Custom → Quantity → Rate incl. GST → Amount incl. GST → Actions**. Keep descriptions and warnings below. Preserve mobile stacking and all existing behavior.

This is a frontend presentation change, limited to the configured estimation builder. No backend, persistence, pricing, PDF, or dependency work.

## Tasks and ownership

### 1. Preserve current work and agree the layout interface

Owner: primary agent. Dependency: plan approval and execution-mode selection. Covers AC3.

- Capture initial dirty paths and relevant per-file diffs. `ConfiguredEstimateBuilder.tsx` and its tests already contain the completed Standard/Custom work; extend those edits without replacing them. Preserve all other existing changes.
- Establish a scoped modifier such as `configured-estimate-line--inline-controls` for the estimation row.
- Agree a small optional layout setting that renders tiers, PMC, then Item type in matching DOM order. Keep existing shared-row consumers and their default order unchanged.

### 2. Align markup and keyboard order

Owner in Mode A: frontend implementer for markup. Dependency: task 1. Covers AC1, AC3.

Owned files:

- `frontend/src/features/estimates/EstimateLineRow.tsx` and its existing tests.
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its existing builder/selling-price tests.

Add the agreed scoped layout setting and modifier. Keep current values, callbacks, native radios, edit locks, focus behavior, descriptions, and warning content. Update existing keyboard-order expectations to the requested order. Do not change CSS, API types, draft logic, or backend files.

### 3. Keep desktop controls on one row

Owner in Mode A: separate frontend implementer for styles. Dependency: task 1; integrate with task 2. Covers AC1, AC2.

Owned file: `frontend/src/styles/estimator-dashboard.css` only.

- Apply compact column sizing and spacing under the agreed modifier. Keep the item name flexible and all primary groups together; remove the cause of the price block wrapping.
- Let long names wrap inside their column. Preserve readable radio labels, quantities, UOMs, large currency values, and actions.
- If available desktop width is insufficient, contain horizontal scrolling inside the primary control area without page-level overflow. Do not clip menus or focus indicators.
- Preserve the existing mobile stacked layout and coarse-pointer touch targets. Avoid changing global shared-row styles.

Tasks 2 and 3 can run in parallel in Mode A after the interface is settled, with non-overlapping ownership. In Mode B the primary agent performs them sequentially. Every writer must preserve others' edits and return interface changes to the primary agent.

### 4. Integrate, verify, and hand off

Owner: primary agent; an independent verification agent may run the final checks in Mode A after writers finish. Dependencies: tasks 2 and 3. Covers AC1–AC4.

- Inspect the final diff for presentation-only scope and preserved prior work.
- Render the actual estimator at 1280, 1440, and 1920 px. Check that item, tier, PMC, Item type, quantity, rate, and amount share one primary row. Include long names, large totals, excluded/read-only rows, and a narrower pane needing contained overflow.
- At 390 px, check mobile stacking, touch targets, readable prices, keyboard access, and no page overflow. Check zoom/coarse-pointer behavior where supported.
- Exercise tier, PMC, Standard/Custom, quantity, and actions; confirm keyboard order matches the screen. Use synthetic fixtures, never customer data.
- Check a Configuration client preview using the shared row to confirm it retains the existing presentation.
- Run focused existing tests, typecheck/build, and hygiene checks below. Fix regressions introduced by this change, then repeat only affected checks.
- Record results and remaining limitations here. Stop task-owned QA processes and remove unnecessary temporary outputs. No commit, push, deployment, or production changes.

## Verification commands

From `frontend/`:

```sh
npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx
npm run typecheck
npm run build
```

From repository root: `git diff --check` and `git status --short`.

Browser checks provide the evidence for alignment and overflow; do not add tests that merely assert CSS implementation. There is no lint script. Backend/full-repository suites are unnecessary for this presentation-only change; the earlier task's documented baseline failures are not part of this work.

## Execution record

- Specification: approved.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- Task 1 complete: baseline captured in `/private/tmp/lisno-single-row-20261125/initial-status.txt`, `initial.diff`, and `baseline-files.json`. Existing builder/test edits belong to the completed Standard/Custom feature and will be extended, not replaced.
- Shared interface: optional `inlineControls` on `EstimateLineLayout`, used only by the configured builder. It adds `configured-estimate-line--inline-controls` and renders item → tier → pricing → type → fields. Existing behavior/order remains the default for other consumers.
- Tasks 2–3 complete: scoped desktop styling and matching DOM order are integrated. The five changed frontend files are `EstimateLineRow.tsx`, `EstimateLineRow.test.tsx`, `ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.sellingPrice.test.tsx`, and `estimator-dashboard.css` under their existing feature/style directories.
- Local scrolling exposed an action-menu timing issue: a queued scroll event could close the menu immediately after revealing its trigger. The menu now dismisses on scroll when its anchor actually moves, retaining resize and outside-pointer dismissal. Regression tests and a rendered narrow-pane check cover this behavior.
- Task 4 complete: the focused command above passed all 127 tests across four suites, including the shared Configuration preview. Frontend typecheck and production build passed. Build retains the existing warning about chunks larger than 500 kB. `git diff --check` passed.
- AC1: rendered all 23 synthetic rows at 1920, 1440, 1280, 1024, and 768 px. All primary controls and financial fields remained on one row. The normal row fits fully at 1440/1920; narrower desktop panes scroll within the row.
- AC2: 390 px retained mobile stacking without page overflow. Long names wrapped within their column, large rates/totals remained readable, and a 1280 px coarse-pointer context retained controls at least 44 px high. The scroll container establishes its own positioning context so absolute accessible labels cannot cause page overflow.
- AC3: rendered checks passed for keyboard order, Standard/Custom selection, quantity editing, and actions. Existing suites cover tier/PMC interactions and shared-row defaults. Synthetic fixtures included excluded/disabled rows. No financial or persistence behavior changed.
- AC4: browser checks reported no page overflow, no axe violations at all six widths, and no page JavaScript errors. Final browser evidence is in `/private/tmp/lisno-single-row-20261125/browser-report.json`; screenshots are under `output/playwright/` there. Build/test logs are in the same temporary directory. These are local QA artifacts, not repository deliverables.
- Backend, OCR, and full repository suites were not rerun for this frontend presentation change. There is no lint script. No dependencies, migrations, external mutations, commit, push, or deployment were performed. Existing backend/admin work was preserved.
- Final CSS build also passed (`verify-build-final.log`). All 42 baseline files outside this task's ownership were byte-compared and unchanged. The task-owned Vite server and browser processes were stopped. Ignored build outputs remain in `frontend/dist/` and `frontend/node_modules/.tmp/`.

### Follow-up label refinement

- User requested **Qty**, **Rate**, and **Total** as the visible row headings. This is a copy refinement within the approved layout, with no change to values, layout, persistence, or workflow.
- Owner: primary agent, `ConfiguredEstimateBuilder.tsx` only. Shorten manual/calculated quantity headings and the rate/total headings; retain accessible unit/tax context and the excluded-item indication.
- `cd frontend && npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx`: 2 files, 96 tests passed.
- Rendered 23 synthetic rows at 1440 and 390 px: all headings match, accessible unit/tax context remains, no page overflow, no axe violations, and no page JavaScript errors. Desktop screenshot visually checked. Temporary evidence: `/private/tmp/lisno-single-row-labels-20261125/`; task-owned browser and Vite server stopped.
- `cd frontend && npm run typecheck` and `npm run build`: passed; existing chunk-size warning remains. `git diff --check` passed and `git status --short` showed the expected dirty paths. Logs: `verify-{focused,typecheck,build}.log` in the temporary evidence directory. Broader suites were not rerun for this copy refinement; no lint script exists. No new tests, dependencies, backend changes, or deployment.
