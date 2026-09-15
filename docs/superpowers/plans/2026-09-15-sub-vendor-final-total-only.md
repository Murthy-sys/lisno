# Sub-Vendor final total only — task plan

Approved specification: [Final total only](../specs/2026-09-15-sub-vendor-final-total-only-design.md).

Status: executed in mode A. Implementation, focused tests, typecheck/build and desktop verification passed. Mobile visual verification is incomplete because browser automation timed out waiting for fonts.

## Fixed scope

For Sub-Vendor results, remove the Final vendor charges / Balance after margin row and its explanatory paragraph. Preserve the preceding breakdown, selected Min./Max. context, impact note and emphasized Final total. The attachment's example remains ₹23,076.92. Keep all calculation, response validation, API fields, PMC and In-house behavior unchanged.

## Tasks, ownership and dependencies

1. **Capture baseline — parent; AC1–AC3.** Record current status and exact diffs/contents of the three target files before writes. The worktree already has 49 modified tracked files and prior task documents. Preserve all existing changes; no staging, reverting or unrelated reformatting.
2. **Change Sub-Vendor rendering — frontend owner; after task1; AC1–AC3.** Own `KnowledgeModeCalculationSimulator.tsx` and `KnowledgeSubVendorCalculationSimulator.test.tsx`. Add scope-specific rendering conditions around the vendor row and related note. Retain the transport value and reconciliation guard. Update existing positive/negative-discount assertions to check row/note absence and unchanged Final total/breakdown; include the screenshot's 35% example in existing result coverage. Preserve PMC assertions and shared styles.
3. **Update Mode lifecycle expectations — separate owner; after task1; parallel with task2; AC1–AC3.** Own `KnowledgeModeSectionStateRemoval.test.tsx` only. Replace Sub-Vendor vendor-row expectations with absence and retained Final total checks. Preserve PMC expectations, input snapshots, stale-response and save/reopen behavior. Do not change financial fixtures simply because their vendor amount is hidden.
4. **Integrate and verify — parent; after tasks2/3; AC1–AC4.** Inspect the follow-up diff for Sub-Vendor-only rendering and unchanged calculations/guards. Run the focused checks below. Inspect the shortened result and accessible Final total at desktop and small viewport sizes using local synthetic responses, including an example with a negative vendor balance. Use bounded browser checks and report timeouts without claiming a mobile pass. Keep temporary evidence outside tracked source and stop task-owned sessions.

In Mode A, a native frontend implementer handles task2 while the parent handles task3 and independent browser-fixture preparation; ownership does not overlap. Tell the implementer that others share the worktree and existing edits must be preserved. Final checks wait for both slices to finish. In Mode B, the parent performs everything inline. This small display change requires a focused integrated review, not another broad financial audit. Additional files require parent ownership assignment before edits.

Dependency order: **task1 → (task2, task3) → task4**. Keep one parent task in progress. No subagents or implementation before the execution-choice gate.

## Verification

From `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx
npm run typecheck
npm run build
```

From the repository root, run `git diff --check` and inspect `git status --short`. Reuse post-writer passing checks only if no later edit invalidates them. Do not reuse preceding tasks' test counts.

Verification must show that Sub-Vendor's two vendor labels and explanatory note are absent, Final total and earlier breakdown remain correct, negative vendor responses still pass unchanged reconciliation, and PMC retains its row/note. Browser inspection checks spacing, readable amounts and accessible output naming. Prior mobile automation stalled; document any recurrence precisely rather than retrying indefinitely.

No backend, replica-set or full-repository suite is needed for this presentation-only change unless an unexpected edit or failure justifies it. There is no lint script. No dependencies, migration, application-data writes, commit, push or deployment are included.

## Progress

- Specification: approved.
- Task plan: approved.
- Execution mode: A — parallel sub-agents.
- Task1: complete; baseline captured in `/tmp/lisno-final-total-only-baseline`.
- Tasks2/3: complete. Frontend implementer changed the shared simulator and Sub-Vendor tests; parent changed only the Sub-Vendor Mode lifecycle assertion. The PMC assertion at line417 remains intact.
- Task4: integrated diff reviewed. Product code adds only two Sub-Vendor scope conditions; all arithmetic and response guards are unchanged. Checks and browser limits are below.

## Verification evidence — 2026-09-15

- The focused command above passed **177 tests in 3 files** after both writers finished (9.20 seconds). Coverage retains malformed-response checks, positive/negative vendor balances, discounts, Min./Max. context and PMC row/note assertions; the screenshot example was added to the existing result matrix.
- `npm run typecheck`: passed. `npm run build`: passed; Vite reported the existing large-chunk warning. No lint script exists.
- `git diff --check`: passed. Baseline comparison found changes only in the three assigned source/test files; earlier dirty work was preserved.
- Desktop at 1280×720: synthetic ₹15,000 cost / 35% margin / zero discount rendered **₹23,076.92**, with neither vendor label nor explanatory paragraph. Screenshot inspected: compact result, readable breakdown and emphasized Final total, no empty replacement row.
- Desktop 95% discount: retained selling price ₹23,076.92, discount ₹21,923.07 and Final total **₹1,153.85**. Synthetic response retained negative vendor balance −₹6,923.07; neither vendor/balance label was displayed. Only the local synthetic preview transport was used; no application data was written.
- Desktop axe: zero reported violations, 28 passes; one incomplete contrast check on the existing drawer description due to overlapping elements. This is not a claim of exhaustive accessibility compliance.
- Mobile attempt at 390×844 reached discount entry, Calculate and Final total scrolling, then `page.screenshot` timed out after 10 seconds waiting for fonts. A bounded follow-up page read also stalled and was terminated. **No mobile screenshot/visual pass is claimed.** No product change was made to work around the automation failure.
- Evidence: `/tmp/lisno-final-total-only-final/` contains focused/typecheck/build logs, the scoped follow-up patch, synthetic setup script and inspected desktop screenshot. Baseline: `/tmp/lisno-final-total-only-baseline/`. Build artifacts remain ignored under `frontend/dist/`.
- Backend/full-repository/replica suites were not rerun for this presentation-only change. No dependency, migration, commit, push, deployment or application-data mutation was performed.
- Cleanup: task-owned Vite server stopped; browser artifacts moved outside the repository to the evidence directory. Browser close also stalled after the mobile timeout, so tab closure could not be confirmed. Final status retains the original49 modified tracked files and ten task documents; only the three assigned tracked files changed relative to this task's baseline.
