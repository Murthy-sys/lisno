# Remove the workflow panel from Configure estimate: task plan

Date: 2026-10-30
Status: Complete; focused verification finished with pre-existing Lead detail test failures
Specification: [Approved design](../specs/2026-10-30-estimate-configuration-workflow-panel-removal-design.md)
Classification: Small; localized presentation change
Execution mode: A, selected by the user after specification and task-plan approval

## Implementation boundary

In `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, render the existing collaboration/requirements block only when `tab !== "configure"`. Apply the condition around the complete existing conditional, including its eligible legacy-estimate fallback. Do not render an empty wrapper or replacement content.

Keep its existing behavior in Estimate Builder, Summary, and Proposal, and leave the shared components and Lead detail screen unchanged. Preserve requirements queries, publication blocking, approval/read-only conditions, version handling, navigation, and configuration values. No backend, API, financial, permission, dependency, or CSS change is expected.

Planning rechecked HEAD `73761538e1ca9cc34b70d768ec35f938ada7ae65`. The only dirty path before this plan was the untracked specification. Product files have no existing diff to reconcile.

## Ordered tasks and ownership

| Task | Dependency | Ownership | Deliverable and acceptance |
| --- | --- | --- | --- |
| 1. Confirm baseline | Plan approval and execution choice | Primary, read-only repository inspection | Recheck dirty paths and the target diff, preserving any new unrelated work. Confirm the render block and current `configure` condition. |
| 2. Apply the visibility condition | Task 1 | One implementation owner; `LeadEstimateWorkspace.tsx` only | Remove the whole block from Configure estimate for pre/post and eligible legacy states, with no placeholder or spacing. Preserve other views and all surrounding logic. AC1–AC3. |
| 3. Review and verify | Task 2 finished | Primary or a separate verifier; existing tests and temporary browser artifacts | Inspect the bounded diff, run existing focused checks, and exercise the affected views at desktop/mobile widths. Update an existing test only if its expectation directly conflicts with the approved removal; do not add a redundant test suite for this small render change. AC1–AC3. |
| 4. Handoff | Task 3 passed or limitations established | Primary; working documents and final report | Record exact results, affected file, any pre-existing failures, and unrun checks. No commit, deployment, or production mutation. |

Use a single production writer; this conditional has no independent implementation slices worth splitting. If Mode A is selected, a read-only verification agent can check the completed change while the primary performs browser validation. These checks may run in parallel after the writer finishes. In Mode B, perform everything sequentially in the primary thread. Keep only one parent task in progress.

## Verification mapped to the specification

- **AC1:** Render Configure estimate with pre-estimation, post-estimation, and eligible legacy data. Confirm there is no workflow disclosure, collaboration region, requirements content, first-save prompt from that block, or blank wrapper. Inspect at approximately 1440px and 390px widths.
- **AC2:** Exercise Configure estimate → Continue to item selection → Estimate Builder → Back to Configure estimate. Confirm the existing workflow controls remain reachable outside Configure estimate and disappear again on return. Inspect that Lead detail and shared collaboration components have no product changes.
- **AC3:** Confirm configuration selections survive that navigation. Run existing workspace/collaboration coverage for saving, submitted/final read-only states, version conflicts, and requirements/design submission blocking. Keep the separate submission-blocking notice and its data logic unchanged.
- Check keyboard navigation for focusable remnants of the removed section, layout overflow, and unexpected browser console/network errors. Use synthetic local data if an isolated fixture is needed; record that limitation and stop task-owned servers afterward.

From `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx src/features/leads/LeadDetail.test.tsx
npm run typecheck
npm run build
```

From the repository root:

```sh
git diff --check
git status --short
```

Investigate failures against the current baseline; do not change unrelated behavior or weaken assertions to obtain a passing result. Broaden checks only when a newly observed dependency or failure justifies it. No lint script exists, and backend/OCR suites are unnecessary for this frontend render-only change.

## Completion conditions and limits

The screenshot's section is absent from Configure estimate, existing configuration input/navigation behavior is preserved, and workflow functionality remains available in its other existing views. Report verification evidence and any limitations candidly. No dependency changes, migrations, seeds, commits, pushes, deployments, or external communications are included.

Baseline was rechecked at the same HEAD; only the two working documents were initially untracked. The primary applied the visibility condition in the single assigned production file. An independent verification agent reviewed the diff and ran command checks while the primary performed browser validation, without concurrent source edits.

## Implementation and verification results

- The only product change is the two-line JSX render boundary in `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, around line 942. It excludes the complete existing conditional, including the legacy fallback, from Configure estimate.
- Queries, calculations, publication blocking, approval/read-only handling, versions, and mutations are unchanged. `LeadDetail.tsx`, `StaffEstimateCollaboration.tsx`, and `StaffEstimateRequirements.tsx` have no diff.
- The four focused suites listed above finished with **73 passed and 10 failed**. The workspace and collaboration suites passed. All 10 failures are in `LeadDetail.test.tsx`, expecting the absent **Project notifications** region.
- Baseline verification loaded the HEAD version of `LeadEstimateWorkspace.tsx` into Vitest using a temporary in-memory Vite plugin, without changing the shared worktree. Running `LeadDetail.test.tsx` against that source reproduced the same **10 failures, with 11 tests passed**. No new failing test was identified from this change.
- `npm run typecheck` passed. `npm run build` passed (3,275 modules); Vite reported its existing large-chunk warning. `git diff --check` passed.
- Browser verification used the actual workspace component with isolated synthetic read-only API responses. Pre-estimation, post-estimation, and eligible legacy states passed at **1440 × 1000** and **390 × 844** viewports: six combinations. Configure contains no disclosure, collaboration region, or requirements region; Summary/Builder retain workflow access; room length edits and basket selection survive navigation. All checks used semantic control names, with no horizontal overflow, browser errors, or failed requests. The removed controls are absent from the DOM and accessibility tree. Desktop/mobile screenshots were inspected for layout and absence of a replacement gap.
- The fixture stubbed unrelated project chat navigation. It did not exercise a live authenticated backend, production data, or workflow mutations. No separate manual keyboard traversal was performed; semantic controls and removal from the DOM were checked. Full frontend, backend, and OCR suites were not run for this localized presentation change. The repository has no lint script.
- Temporary fixture, check script, screenshots, and command logs are under `/tmp/lisno-configure-workflow-removal-qa/`, outside tracked source. The browser session is closed and its task-owned preview server was stopped.
- No dependencies, tests, CSS, API contracts, database schemas, migrations, seeds, commits, pushes, deployments, or external communications were changed or performed.

The requested configuration-screen removal is complete. The remaining verification limitation is the independently reproduced, unrelated Lead detail test failure described above.
