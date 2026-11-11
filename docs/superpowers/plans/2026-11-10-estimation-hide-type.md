# Remove estimator Type controls task plan

Date: 2026-11-10
Status: implementation and verification complete under Mode A; two unchanged baseline test failures remain.

Source of truth: [approved specification](../specs/2026-11-10-estimation-hide-type-design.md).

## Scope and contract

Remove only the estimator row's Type heading, Standard/Special radios and readonly Type text. Omit the optional Type slot so its wrapper and spacing disappear. Keep saved classification, defaults, permitted pricing controls, calculated prices, disabled rate fields and save payloads intact. Client quotation and Configuration Client view preview retain their own presentations. Preserve the existing compact widths, alignment and all uncommitted work.

## Tasks and ownership

1. **Record the baseline.** Primary owner, before writers start. Capture dirty paths and relevant target diffs. Confirm the estimator caller is the only product-code target and that the existing classification variable still serves pricing logic. Acceptance: scope protection and specification criteria 1–3.
2. **Remove the estimator Type slot and adapt builder tests.** Primary owner in either execution mode. Exclusive files: `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, `ConfiguredEstimateBuilder.test.tsx`, and `ConfiguredEstimateBuilder.sellingPrice.test.tsx`. Remove the slot, preserving classification-dependent pricing logic. Replace assertions/interactions for the removed Type selector with coverage that Type is absent and existing Standard/Special fixtures retain their prices, permissions and other interactions. Initialize Special fixtures explicitly where pricing tests previously selected Special through the UI. Do not change defaults to make tests pass. Acceptance: specification criteria 1–3.
3. **Adapt workspace regressions.** Separate frontend test owner in Mode A; primary owner in Mode B. Exclusive files: `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx` and `LeadEstimateWorkspace.collaboration.test.tsx`. Use saved/initial classification fixtures for scenarios that previously clicked Type. Preserve assertions for save payloads, refresh, collaboration conflicts, pricing permissions and quantity edits. Replace tests specific to the removed selector with absence/preservation assertions; retain coverage for underlying behavior. Can run alongside task 2 after the shared contract above is confirmed. Acceptance: specification criteria 1, 2 and 4.
4. **Integrate and verify.** Primary owner after tasks 2–3. Inspect the combined diff and render desktop/mobile estimator rows with Standard and Special fixtures. Confirm no Type column or focusable Type controls, compact right-aligned fields on wide rows, safe narrow wrapping, working tier/quantity controls and disabled rates. A verification runner may execute final checks in Mode A after writers finish. Acceptance: all specification criteria.

Keep one parent task in progress. In Mode A, use the non-overlapping ownership above and tell each writer to preserve others' edits. Root owns interpretation, documents and final integration. In Mode B, perform all work inline. No new product decision, dependency, API/backend change or migration is needed.

## Focused verification and handoff

From `frontend/`:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx --maxWorkers=1
npm run build
```

Run `git diff --check` and review final status. Avoid unrelated full suites or tests that merely repeat JSX/CSS declarations. No lint script exists. Record exact results and rendered checks here, remove task-owned temporary browser artifacts, and stop only task-owned servers. Do not stage, commit, deploy or mutate customer data. Begin implementation after task-plan approval and the execution-mode selection.

## Implementation and verification record

- Tasks 1–3 completed in Mode A with separate builder and workspace-test ownership. The product diff removes only the six-line Type slot in `ConfiguredEstimateBuilder.tsx`. The four assigned test files now use saved/initial classifications and verify the remaining controls, persistence and permissions.
- The four-file focused command above completed with **167 passed and 2 failed out of 169**. Both failures are unchanged baseline cases in `LeadEstimateWorkspace.collaboration.test.tsx`: `preserves an incomplete manual rate when both the old rate and serialized edit are null` expects an already-disabled rate input to be enabled; `retains a partial rate typed while an earlier blank-rate save is in flight` expects `12.` after typing into an already-disabled input.
- Independently reproduced both failures using temporary copies of the original test file and original renderer captured before this task. Both failed identically; the temporary copies were removed. These unrelated disabled-price expectations remain unchanged.
- The build initially found an inferred-state type error in the updated selling-price test fixture. Added the explicit existing `ConfiguredLineDraft[]` state type; that file then passed **3/3 tests**. This correction changes no runtime product code.
- Final `npm run build` passed, including TypeScript compilation and Vite. Vite reported the existing chunk-size warning for bundles over 500 kB. Final `git diff --check` passed and status matched the current task plus the recorded pre-existing dirty paths.
- Rendered Chromium checks at **320, 390, 768, 1280 and 1920px** passed with Standard and Special fixtures: no Type slot, horizontal overflow or overlapping control groups. Wide rows retain right-aligned Qty **96px** and Rate **112px** fields. Quantity increment to 2 and Premium selection update the disabled rate to 150; readonly rendering also omits Type. Stored classifications remain Standard and Special. Desktop/mobile screenshots were visually inspected.
- Client quotation and Configuration preview were not changed by this task. No backend, API, dependency, migration, commit, push, deployment or customer-data mutation occurred. Unrelated pre-existing work was preserved.
- Full frontend/backend/OCR suites, lint, other browser engines and physical devices were not run for this bounded UI removal. No repository lint script exists.
- Task browser sources/screenshots under `frontend/output/playwright/hide-type-1110/` and task `.playwright-cli` logs/snapshots were removed. The task browser session and port-5179 Vite server were stopped.
- Task baseline snapshots and verification logs under `/tmp/lisno-hide-type-20261110/` were removed after recording results. The build produced ignored `frontend/dist/` and TypeScript cache outputs; they are not part of the change.
