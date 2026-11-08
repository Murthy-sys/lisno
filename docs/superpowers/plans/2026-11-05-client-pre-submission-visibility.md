# Client pre-submission visibility task plan

Date: 2026-11-05
Status: Complete; implementation and scoped verification passed.
Specification: [Client project sections before Sales submission](../specs/2026-11-05-client-pre-submission-visibility-design.md), approved by the user on 2026-11-05.
Execution mode: A, parallel sub-agents, selected by the user on 2026-11-05.

## Execution record

- T1 complete: source targets clean; only this plan and its specification were untracked. AuthProvider cancels and clears queries on identity transitions. Baseline six focused suites: 95 tests passed.
- T1–T6 complete; all product writers, independent review and final verification have finished.
- T2 owner: `workflow_visibility`; T3 owner: `client_visibility`. Both received the fixed prop/query contract and preservation boundaries.
- T2 complete: optional selections mount control; 25 workflow-panel tests passed.
- T3 complete: project publication gate and coordinated quotation refresh; 69 tests across the three Client suites passed. Both writers reported typecheck and diff-check passing.
- T4 complete: all six focused suites passed on the integrated sources, 115 tests (6.84s). Final source diff stays within the three planned product components and three regression files.
- T5 complete: independent `visibility_integrity` review found no confirmed defects; it traced publication membership/source validation, session cache clearing, later review states, draft preservation and shared workflow defaults.
- T6 browser matrix passed: v3 invited, internal draft, submitted and superseded; v2 invited and submitted; each at 1440×900 and 390×844. All 12 cases matched the required panel visibility, with no horizontal overflow, console errors or unexpected API requests. Synthetic route fixtures prevented calls to live data.
- Automated browser accessibility checks passed for v3 waiting/submitted at both widths; color contrast was excluded, consistent with the existing focused accessibility tests. Screenshots of the waiting/submitted layouts were inspected.
- Keyboard browser checks passed: Refresh quotation rechecked publication and restored sections; Additional requirements opened with Enter; submitted review received focus; Tab reached Edit estimate; Enter returned focus to the quotation editor with the saved quantity intact.
- Final verifier `visibility_verification` passed the three additional quotation suites (58 tests), typecheck, production build and diff-check. Total integrated regression coverage: 173 tests across 9 files.
- The build succeeded with a warning for chunks over 500 kB; the main bundle was 3,258.01 kB. Bundle size was not baselined, and optimization is outside this visibility correction.
- Cleanup complete: removed task-created scripts, fixtures, logs and screenshots from `/private/tmp/lisno-client-visibility/` and the two task-created `.playwright-cli` files (`console-2026-11-05T05-32-09-904Z.log`, `page-2026-11-05T05-32-09-935Z.yml`). Closed the named verification browser and stopped the temporary Vite server on port 5174. Build-regenerated ignored outputs remain in the existing `frontend/dist/` and `frontend/node_modules/.tmp/tsconfig*.tsbuildinfo` locations.

### Final check results

| Check | Result |
| --- | --- |
| Six focused suites listed below | Passed, 115 tests; 6.84s. |
| `cd frontend && npm test -- src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx` | Passed, 58 tests across 3 files. |
| `cd frontend && npm run typecheck` | Passed, exit 0. |
| `cd frontend && npm run build` | Passed, exit 0; Vite 9.79s; bundle-size warning above. |
| `git diff --check` | Passed, exit 0. |
| `git status --short` after cleanup | Only six intended source/test changes and the specification/task plan; no browser artifacts. |
| Browser scenarios and keyboard checks | Passed as recorded above; synthetic data only. |

Full frontend, backend and OCR suites were not run, as permitted by this bounded plan. No repository lint script exists. Automated color-contrast checks and a live invitation/email flow were not run. No dependencies, backend/data changes, migrations, real invitations, customer messages, commits, pushes or deployment were performed. Remaining verification limits are the excluded checks and the unbaselined bundle-size warning; no unresolved defect was found within the approved scope.

## Outcome and boundaries

For invited workflow-version-2/3 Client projects, omit Additional requirements, Project coordination and Selections requiring your approval until a valid Sales-published Client review exists. Preserve the existing restricted Client view after submission, including later revisions and approvals. Preserve legacy projects, staff workflows, quotation editing, financial values and backend authorization.

The work is a bounded frontend workflow correction. No backend, mobile, API, database, dependency, lockfile or global style changes are planned. No deployment, seed, migration, commit, push or external communication is authorized.

## Baseline and settled integration contract

- Initial investigation found a clean worktree. At plan creation, the only dirty path is the new specification above. No product sources have changed.
- Before implementation, capture `git status --short` and the per-target diffs again. Preserve any new user changes; do not assign a dirty target until its changes and ownership are understood.
- Use the existing `estimateWorkflowKeys.client` / `getClientEstimates` query and session isolation. The parent Client project may observe that shared query; do not introduce a new endpoint, query identity or persistent visibility flag.
- Visibility is true only for a successful response with exactly one estimate matching the stable project ID, a non-null `publishedReview` and no `reviewSourceIssue`. Apply the restriction only to workflow versions 2 and 3.
- Preserve successful cached evidence during background fetching; hide the three sections after an error or invalid/missing evidence. Never use `canDecide`, quotation totals or the current commercial status as first-publication proof.
- Add a narrowly scoped `showDesignRequirements?: boolean` presentation option to `ProjectWorkflowPanel`, defaulting to `true`. It controls only mounting `ProjectDesignRequirementsPanel`. Keep workflow progress and all other actions under their current conditions.
- `ClientProject` passes its publication eligibility into that option and uses the same eligibility to mount requirements and coordination. Retain the current v2/v3 ordering and legacy behavior.
- Existing quotation refresh controls must also refresh the supplied Client-review query when present. Retain the authorized 404/not-started probe, draft preservation, request guards and immutable approval rules. Avoid changing the broadly used collaboration invalidation helper.
- V2 already uses the same review query through `EstimateReviewPanel`; preserve its retry, refetch-on-focus and page-reload behavior. No additional polling or new refresh UI is required.

## Dependency-ordered tasks and ownership

All implementation tasks below are complete; results are recorded above. During execution, only one parent task was in progress. Mode A used the non-overlapping ownership below and integrated the result before final checks.

### T1. Recheck baseline and freeze the local contract

Owner: Primary agent. Dependencies: plan approval and execution-mode selection.

- Recheck dirty paths and target diffs; confirm the approved specification against the current components.
- Confirm the existing auth provider clears the query cache on identity changes and the project gate matches stable IDs.
- Confirm the prop and query contract above with both implementation owners before writes.
- Capture baseline focused-test results, or explicitly record any pre-existing failures so they are not confused with regressions.

Acceptance: AC5 and AC6 boundaries are understood; file ownership is explicit. If evidence requires changing backend permissions or the approved scope, update the affected specification/plan and use the repository approval gate before expanding work.

### T2. Add the selections presentation control

Mode A owner: `frontend_implementer`, shared workflow slice only.
Owned files:

- `frontend/src/features/workflow/ProjectWorkflowPanel.tsx`
- `frontend/src/features/workflow/ProjectWorkflowPanel.test.tsx`

Dependency: T1. May run in parallel with T3 after the optional prop contract is fixed.

- Add the default-true option and condition only the selections panel mount.
- Test that false omits the panel and its `/design-requirements` read while genuine workflow progress and authorized actions remain available.
- Test that default behavior remains intact for existing Client/staff presentations and toggling visibility mounts the panel normally.
- Do not edit `ProjectDesignRequirementsPanel`, backend authorization or any Client files owned by T3.

Acceptance: AC1, AC2, AC3 and AC6; shared workflow consumers keep their existing behavior.

### T3. Gate Client project sections and coordinate refresh

Mode A owner: a separate `frontend_implementer`, Client slice only.
Owned files:

- `frontend/src/features/client/ClientProject.tsx`
- `frontend/src/features/client/ClientProject.estimateReview.test.tsx`
- `frontend/src/features/client/ClientProject.test.tsx`
- `frontend/src/features/client/ClientQuotation.tsx`
- `frontend/src/features/client/ClientEstimationWorkspace.test.tsx`

Dependency: T1. May run in parallel with T2 using its agreed prop. Do not edit workflow files. A new helper is unnecessary unless a concrete duplicate warrants it; coordinate any new path with the primary agent first.

- Observe the shared published-review query before conditional component returns, respecting existing query enablement and hook rules.
- Compute the project-specific publication condition without duplicating review/approval business rules.
- Gate the v2 and v3 requirements/coordination branches and pass the selections option. Leave chat/navigation, estimate/quotation components and unrelated workflow content mounted under their current rules.
- Coordinate existing quotation refresh/retry controls with `review.refresh()` where applicable, including the not-started action and builder refresh. Preserve the fallback probe and local quotation drafts.
- Replace the two tests expecting immediate invited requirements with the approved absence expectations, asserting all three sections and their component-owned reads are omitted.
- Cover initial internal draft, first verified publication, approved/changes-requested/superseded publication, loading, errors, denied refresh, source issues, duplicate matches and foreign project data.
- Exercise user-triggered quotation refresh from not-started to published, failure to recovery, and navigation between two distinct project IDs. Assert existing submitted review and unsaved-edit approval guards still work.
- Retain legacy project tests and saved requirements fixtures, proving hiding does not mutate requirements or quotation data.

Acceptance: AC1–AC6. The new visibility condition remains separate from decision eligibility.

### T4. Integrate and perform focused checks

Owner: Primary agent. Dependencies: T2 and T3 finished.

- Reconcile both slices and inspect the complete diff. Do not run final verification against a worktree with active writers.
- Verify the single visibility condition controls the three sections, no CSS-only hiding or empty replacement containers were introduced, and no other workflow content was gated accidentally.
- Run the focused suites below and resolve attributable failures within the agreed ownership boundaries.
- Keep all fixtures synthetic. No real invitations or backend mutations are needed to test this presentation change.

Acceptance: AC1–AC6 pass in the integrated worktree.

### T5. Integrity review

Mode A owner: `integrity_reviewer`, read-only. Mode B: primary agent. Dependency: T4.

- Review project matching, query error/cache behavior, later published-round states, session changes and refresh recovery.
- Verify that approval tokens, financial values, mutation permissions, historical snapshots, staff defaults and legacy callers remain unchanged.
- Confirm no hidden-panel network calls or inappropriate fallback sources were added.
- Report findings with source evidence. Primary agent resolves confirmed findings; recheck affected acceptance criteria before proceeding.

Acceptance: no unresolved correctness or scope findings for AC1–AC6.

### T6. Final verification and handoff

Mode A owner: `verification_runner` after all writers and review fixes finish. Mode B: primary agent. Primary agent owns final reconciliation and this plan.

- Run the command matrix below, avoiding redundant runs where the exact integrated sources already passed and no later edit affects them.
- Use the browser tooling and relevant skill to render synthetic v3 invited, internal-draft and submitted project states at desktop (1440×900) and mobile (390×844) widths. Include a v2 invited/submitted smoke check and a later valid published-review state.
- Inspect absence/presence of the three sections, remaining navigation, keyboard tab order, submitted-review interaction, layout gaps, overflow, console errors and unexpected requests. Do not mutate live data.
- Run accessibility assertions on representative waiting and submitted page states; record any limitations of automated checks.
- Put necessary temporary browser artifacts under an ignored task-specific output directory or a temporary directory. Record paths, clean up temporary harnesses and unnecessary outputs, and do not commit runtime artifacts.
- Inspect final diff/status and record actual checks/results, unrun checks and remaining risks. Do not claim completion if required verification remains unresolved.

Acceptance: AC7 and final regression evidence for AC1–AC6.

## Verification matrix

| Criteria | Evidence required |
| --- | --- |
| AC1 | v2/v3 invitation and no-estimate route tests: all three panels absent; component-owned reads absent; expected quotation/navigation retained. |
| AC2 | Populated internal draft without `publishedReview`: sections remain absent regardless of editable requirements or totals. |
| AC3 | Valid publication initial render and refresh transition: sections restore; existing Client-safe review/actions remain; stored requirements are unchanged. |
| AC4 | Approved, changes-requested and superseded published rounds retain sections; current approval guards and local quotation draft tests pass. |
| AC5 | Pending/failed/denied/duplicate/source-issue/foreign-project states stay hidden; success restores correct data; route and identity boundaries inspected/tested. |
| AC6 | Default shared workflow and legacy page tests pass; genuine later actions remain; no data/API/permission changes in diff. |
| AC7 | Desktop/mobile browser inspection, keyboard interaction, accessibility assertions, console/network review and no overflow or empty replacement surfaces. |

Run from the repository root:

```sh
cd frontend && npm test -- src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/ProjectDesignRequirementsPanel.test.tsx src/features/client/ClientEstimateRequirements.test.tsx
cd frontend && npm run typecheck
cd frontend && npm run build
git diff --check
git status --short
```

Each `cd frontend` command is a separate invocation from the repository root. Expand to additional quotation tests only if refresh changes or failures expose affected behavior. The full frontend suite is not required by this bounded plan unless integration reveals broader effects. Backend and OCR suites are not required because their sources/contracts are unchanged. There is no repository lint script; do not report lint as passed.

## Parallelism and execution notes

Dependency graph: T1 → (T2 and T3) → T4 → T5 → T6.

In Mode A, T2 and T3 are the only parallel writing slices. Tell each writer they are not alone in the codebase, must not revert another person's edits, and must report contract changes before crossing ownership boundaries. Review and final verification are sequential after writers finish. In Mode B, the primary agent performs T1 through T6 inline without subagents.

No subagent or implementation starts before the user selects an execution mode. The next gate after task-plan approval is exactly the execution-choice question in `AGENTS.md`.
