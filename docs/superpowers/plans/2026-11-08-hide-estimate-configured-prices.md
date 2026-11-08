# Hide configured reference prices: task plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved specification](../specs/2026-11-08-hide-estimate-configured-prices-design.md)
Specification approved in conversation on 2026-11-08.

## 1. Preserve the current work

Owner: primary agent. After execution authorization, capture the dirty-path list
and current contents/diffs of the four target files below. Preserve earlier
recommendation, pricing, item-picker and Submit changes. Confirm that the
reference paragraph's variables/import are unused elsewhere before removing them.

## 2. Remove the annotation and update affected checks

Keep this as the single implementation task in progress.

Slice A ownership:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx`

Remove the supplemental reference-price paragraph and its display-only variables
and unused import. Keep `referenceMode` where tier availability still uses it.
Shorten the fallback mode label to `Sub-Vendor`. Preserve selling-price controls,
amounts, component controls, tier availability and pricing calculations.
Update existing affected assertions to verify the displayed selling prices,
amounts and validation; verify the reference annotation is absent.

Slice B ownership:

- `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`

Replace reference-text assertions and loading waits with the relevant rendered
selling-price, item-state or amount assertions. Retain coverage of manual edits,
current Configuration refresh and saved/publication values. Do not weaken tests
by dropping their behavioral checks.

In Mode A, assign these disjoint slices to separate agents after sharing the
display-only contract; they may run in parallel. Neither edits pricing helpers,
backend, Client quotation components, shared CSS or the other's files. The
primary agent owns integration and verification. In Mode B, execute both slices
inline. No new test suite, dependency or abstraction is needed.

Acceptance: all four criteria in the approved specification, especially unchanged
selling-price behavior and the same shared row for Sales and Designer.

## 3. Integrate and verify

Owner: primary agent, after both slices finish. Inspect the task-specific diff;
confirm no configured-rate logic or meaningful validation was removed.

Run from `frontend/`:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx
npm run typecheck
npm run build
```

Check the actual configured item row at desktop and mobile widths: no reference
price or empty slot, selling Price and Amount remain readable, and tier/mode
controls still work. Use synthetic data; no real publication or external writes.
Run `git diff --check` and `git status --short` at the repository root.

Keep review and verification proportional to this small display change. No
backend/OCR/full frontend suites or lint are planned. Broaden only if a failure or
unexpected dependency warrants it. Clean owned temporary browser artifacts and
report exact checks, results, limitations and refreshed ignored build outputs.
No staging, commit, push, deployment, migration or seed.

## Execution record

Plan approved and Mode A selected in conversation on 2026-11-08.
Baseline status, targeted diff and four current file copies captured under
`/private/tmp/lisno-hide-configured-price/` before writers started.

- Slice A: `hide_price_display`, component and its two test files.
- Slice B: `hide_price_workspace_tests`, workspace test file only.
- `actionable_browser` prepares the scoped configured-row browser check in
  separate temporary paths; the primary agent owns review and final verification.

## Final outcome and verification

Removed the configured/base reference-price paragraph, its display-only
variables/import and the fallback label's reference-price wording. Actual selling
prices, quantities, amounts, tier/mode controls and component controls remain.
Only the four assigned source/test files and this task's two documents changed.
The primary agent reviewed each target against its captured pre-task contents;
pricing helpers, API contracts, persistence and permissions were untouched.

- Final combined command above: **94/94 tests passed**, 3/3 suites, exit 0.
- `npm run typecheck`: passed, exit 0.
- `npm run build`: passed, exit 0; 3,335 modules transformed. Existing chunk-size
  warning remains (main JS 3,288.24 kB).
- `git diff --check`: passed. Status shows preserved earlier work and no staging.
- Actual configured-row browser checks passed at **1440px and 390px**. Reference
  annotations and empty slots are absent; selling Price and Amount remain
  readable. Manual edits survived refresh; keyboard pricing-mode changes and
  tier changes produced the expected rates and amounts. No horizontal overflow,
  page errors or console errors. Screenshots inspected by both agents.

Browser checks used synthetic data and the installed Playwright/Chrome runtime,
following the earlier CLI-session instability; no dependency was added. Owned
browser/server processes stopped, and temporary fixtures, screenshots, results
and baseline copies/diffs were removed. Ignored outputs refreshed:
`frontend/dist/` and `frontend/node_modules/.tmp/`.

Full frontend/backend/OCR suites were not run for this display-only change; no
lint script exists. No migrations, real publication, deployment, commits, pushes
or external writes were performed. No unresolved task-specific issues remain.
