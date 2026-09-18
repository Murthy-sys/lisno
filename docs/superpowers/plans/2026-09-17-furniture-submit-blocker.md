# Furniture disabled-submit correction — plan

Spec: [design](../specs/2026-09-17-furniture-submit-blocker-design.md). Autonomous Mode A; baseline captured in `/tmp/lisno-submit-blocker-qa/initial-{status.txt,tracked.diff,untracked.tar.gz}`. Existing dirty work preserved.

1. Diagnose disabled guards/source lineage — complete. Independent audit identifies selected empty estimate room as strongest screenshot match.
2. Implement — complete. Frontend writer changed WorkflowStageActions.tsx, workflowStageActions.css and new WorkflowStageActions.submitBlocker.test.tsx. Root owns documents/browser integration. No backend or unrelated changes.
3. Independent integrity review — complete, no actionable findings. Submission, source, stale/CAS, proof and UOM guards retained; no automatic room removal or draft rebasing. Review rooms follows displayed checkbox order, including after unchecking/rechecking.
4. Final verification — complete. Evidence below. Independent verifier confirmed all 74 previously dirty paths retained: 72 byte-identical to baseline and only the two intended product files changed, plus the three expected new task files (spec, plan, regression test).
5. Handoff — complete; local only, no commit/deploy or production inspection/mutation.

## Verification evidence

Artifacts are temporary, synthetic and outside the repository at `/tmp/lisno-submit-blocker-qa`.

- `cd frontend && npm test -- src/features/workflow/WorkflowStageActions.submitBlocker.test.tsx src/features/workflow/WorkflowStageActions.pointCounts.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureApproval.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/WorkflowStageActions.measurement.test.tsx src/features/workflow/WorkflowStageActions.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx` — 146 tests passed in 9 suites (`frontend-focused.log`).
- After the final first-checkbox focus refinement: `cd frontend && npm test -- src/features/workflow/WorkflowStageActions.submitBlocker.test.tsx` — 12/12 passed (`frontend-blocker-final.log`). These are included in the 146 unique tests, not additional tests.
- `cd frontend && npm run typecheck` — passed (`frontend-typecheck.log`). Final `npm run build` (including TypeScript compilation) — passed (`frontend-build.log`). Existing Vite chunk-size warning remains.
- `git diff --check` — passed, including independent final verification. No lint script exists; lint not claimed.
- Browser fixture uses the real current React components with mocked APIs and synthetic project data. Baseline reproduced a native-valid completed form with Submit disabled, Cancel enabled, no explanation beside Submit and no API write (`browser-baseline.log`, `baseline.png`).
- Final browser at widths 360, 768 and 1440: footer remains visible, no horizontal overflow, zero axe WCAG A/AA violations; Review rooms focuses the affected Study checkbox (`browser-final-layout.log`, `blocked-{360,768,1440}.png`). Screenshots visually inspected.
- Explicit room correction, recheck, UOM cached-refetch failure and retry preserve all seven numeric values, three UOM selections, note and native PDF file. Correction enables Submit, recheck disables it, retry success enables it; valid synthetic multipart submission records Study required=false and canonical dimension/point-count values (`browser-final-recovery.log`).
- Settled retry clears the explanatory error and aria-describedby, with Submit enabled (`browser-retry-settled.log`, `recovered-settled-360.png`). Initial immediate screenshot caught the preceding paint; settled image verified after DOM condition and animation frames.
- Browser console reported zero errors/warnings. API requests are mocked; no live-server/network integration claim. The installed CLI does not support its documented `network` command, so no network-log claim is made.
- Local browser and preview server stopped; temporary node_modules symlink removed. No dependencies, lockfiles, backend sources, schema, migrations, commits or deployment changed.

## Limits

No access to the reported live project's hidden room/item state was needed or performed. The empty selected room condition is a reproduced matching cause, not a confirmed inspection of production data. Full frontend/backend suites were not rerun: the change is frontend-only and the focused workflow suites, final blocker rerun, typecheck, build and browser checks cover its scope. Approved-estimate and workflow validation intentionally remain enforced.
