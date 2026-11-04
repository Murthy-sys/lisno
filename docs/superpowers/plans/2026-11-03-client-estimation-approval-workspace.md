# Client estimation and approval workspace implementation plan

Date: 2026-11-03
Status: Implemented and verified in approved Mode A (2026-11-04), with reproduced unrelated baseline test failures recorded below.
Approved specification: [One Client estimation workspace for editing and approval](../specs/2026-11-03-client-estimation-approval-workspace-design.md)
Approval evidence: The user selected “Sales confirms changes before Client approval,” then approved the specification.

## Outcome and boundaries

Consolidate the version-3 Client editor and approval review into one workspace. The same primary item area switches between the saved working estimate and the immutable submitted version. Client edits continue to require Sales confirmation before pre-design approval. Remove the duplicated full Project estimate panel, retain compact dashboard entry points, and preserve PDF/version access and later design-review features.

Use existing scoped quotation/review APIs and server decision rules. No backend contract, permission, pricing, publication, email, migration or dependency change is planned. Older workflows retain their compatible review path. The preceding shared-estimation and app-wide compact layout changes are the baseline and must remain intact.

## Implementation contracts to settle before parallel writers

- **Identity:** select the estimate by stable project and estimate IDs. A project with multiple ambiguous current estimates fails closed. Dashboard deep links resolve through authorized data, never project names.
- **Data:** editor rows come from the scoped working quotation; submitted-review rows and totals come only from the selected published snapshot. Never build an approvable snapshot from current editor rows or a visible subtotal.
- **Eligibility:** the backend's fresh `publishedReview.canDecide` and current pending round remain authoritative. Combine them with current project/estimate/phase/version consistency, successful queries and absence of pending/unknown saves. Equal totals do not establish eligibility.
- **View state:** use explicit edit and submitted-review states with one visible item area. Preserve editor state during view changes. Dirty or uncertain edits must use the existing save/discard/stay/reconciliation behavior before review. Keep dedicated-route pane scrolling and embedded document scrolling.
- **Decision:** reuse the existing Client decision mutation, review ID/version, confirmation dialog, request-changes note, invalidations and error recovery. Saving does not publish or approve.
- **Design features:** separate the existing drawing/plan review and space-planning actions from the duplicated commercial layout without changing their guards or state.
- **Legacy/staff compatibility:** new composition is version-3 Client behavior. Existing staff queues, Designer access and legacy Client review continue using compatible exported components.

## Ownership and parallel execution

The primary owns specification interpretation, integration contracts, shared adapters, query coordination, dirty-worktree preservation, cross-slice integration and final reconciliation. Before any writer starts, capture initial dirty paths, per-target diffs and recoverable copies of pre-existing untracked files under `/private/tmp/lisno-client-estimation-approval-*`. Never restore from HEAD or overwrite the previous work.

| Slice | Owner in Mode A | File ownership and boundaries |
| --- | --- | --- |
| Shared submitted review and decisions | Primary | `features/estimates/ClientPublishedEstimate.tsx`, extracted decision/comparison exports or focused new components, submitted snapshot adapter, associated tests and common estimate styles. Preserve legacy callers. |
| Unified editor and route/project integration | Primary | `features/client/ClientQuotation.tsx`, quotation styles/tests, `features/estimates/ProjectQuotationWorkspace.tsx` and tests, `features/client/ClientProject.tsx` and its tests; any shared shell/query coordination change. |
| Compact dashboard entry | Frontend implementer A | `features/client/ClientDashboard.tsx`, `ClientDashboard.test.tsx`, `ClientDashboard.collapsible.test.tsx`, `styles/client-dashboard.css`, and a narrowly scoped new dashboard summary component/test if needed. No project workspace, router, API or shared-review edits. |
| Preserve separate design review | Frontend implementer B | `features/estimates/EstimateReviewPanel.tsx`, its existing tests, a focused extracted Client design-review component/test and its local styles if needed. No Client project/quotation/dashboard or published-decision edits. |
| Shared files and fixtures | Primary | `EstimateBuilderShell`, shared query helpers, router/authorization files, enterprise fixtures and shared styles if evidence requires a bounded edit. Agents request changes here rather than writing these paths. |
| Integrity review / final verification | Read-only specialists | Review integrated changes, then run agreed verification after writers and fixes finish. No product source edits. |

No subagents start before execution mode is chosen. In Mode A, A and B may run concurrently with the primary's workspace implementation only after shared contracts and exports are settled. Give each agent its exact allowlist and require preservation of others' edits. In Mode B, the primary performs the same slices sequentially without implementation subagents.

## Dependency-ordered tasks

### T1. Capture the current baseline and settle composition contracts

Owner: Primary. Dependencies: task-plan approval and execution-mode choice. Acceptance: AC1, AC5, AC7, AC9, AC10.

1. Capture the dirty baseline and inspect overlapping changes before assigning ownership. Record the exact snapshot path and approved writer allowlists in the execution record.
2. Run current focused Client, review and quotation tests. Reproduce relevant existing failures against this baseline instead of relying on the prior 91-failure report.
3. Trace the current review model, phase/version fields, source availability, decision eligibility and query invalidation. Record an explicit state/eligibility contract for both dedicated and embedded workspaces.
4. Inventory everything the existing `EstimateReviewPanel` provides to Clients: commercial review, PDF export, pre-design comparison, drawings/plans, dialogs, annotations and space-planning completion. Assign each to a retained destination.
5. Settle concrete component boundaries/exports and the dashboard navigation contract. Preserve `?estimate=` handling with a safe explicit link where an automatic redirect would hide project selection or legacy behavior.

Done when: current baseline is recoverable, shared contracts are explicit, and each writer has non-overlapping targets.

### T2. Separate reusable submitted-review and decision presentation

Owner: Primary. Dependencies: T1. Acceptance: AC4, AC5, AC7, AC9.

1. Extract/reuse the existing Client decision control and pre-design comparison without copying their mutation or refresh logic. Keep the legacy published-review wrapper compatible.
2. Add a presentation-only adapter from the safe frozen published snapshot to the existing shared room/basket/item hierarchy. Keep snapshot names, quantities, UOM, dimensions, configured choices, component evidence and amounts; do not refresh these values from Configuration.
3. Preserve total including GST and any distinction between visible subtotal and complete estimate total. Use existing currency units and formatting boundaries.
4. Support read-only submitted review, compact phase/version metadata, explicit PDF/version access and existing post-design comparison. Approval dialogs identify the submitted version and total.
5. Add focused regressions for unequal current/submitted amounts, missing snapshot source, temporary/direct-basket lines, component pricing and legacy wrapper behavior.

Done when: the unified workspace can consume shared snapshot/decision components without rendering the old full review panel, and existing legacy consumers remain functional.

### T3. Build the single Client estimation workspace

Owner: Primary. Dependencies: T2; integrates T4/T5 outputs. Acceptance: AC1–AC5, AC7–AC9.

1. Compose the working editor and submitted review around one primary item area, with explicit edit/review state, compact controls and accurate save/approval status.
2. Preserve local edits, focus, active room/basket, removal confirmations and save-and-return. Do not remount dirty state or silently discard edits while changing views.
3. Present Waiting for Sales confirmation after a Client save. Enable submitted review/approval only when fresh matching backend data permits it. Preserve 401/403/404 retirement, stale/409 recovery, failed reads and unknown-save reconciliation.
4. Mount this composition from both `ProjectQuotationWorkspace` and the version-3 `ClientProject`, removing their duplicated full estimate review. Keep authorized Designer read-only behavior on the shared route.
5. Place the separately retained design-review features in the appropriate Client project section. Preserve requirement entry, project workflow, completion, vendor-work and other unrelated project sections.
6. Verify save/decision refreshes affect all quotation/review/workflow consumers, including a second open screen. Do not add redundant polling or new broad invalidation machinery.
7. Add rendered tests for one primary item list, edit/review switches, dirty/unknown guards, save → Sales confirmation → Client approval, wrong-project isolation and phase transitions.

Done when: dedicated and embedded version-3 experiences satisfy the unified flow with no duplicated item list and no approval eligibility regression.

### T4. Replace dashboard duplication with compact estimation entries

Owner: Frontend implementer A in Mode A; primary in Mode B. Dependencies: T1/T2 settled navigation and export contracts. May run in parallel with T3/T5. Acceptance: AC1, AC6, AC8, AC9.

1. Display concise project estimate status and an Open estimation / Review estimate entry for version-3 estimates. Do not embed their full item lists or a separate decision form on Client home.
2. Resolve `?estimate=` using authorized stable IDs. Handle unknown, missing-project, unauthorized and legacy cases explicitly without guessing a project or broadening access.
3. Preserve loading, empty, stale, error and multi-project behavior, and the existing dashboard project cards/overview.
4. Add two-project navigation and compatibility tests. Keep narrow layout, keyboard naming and focus behavior consistent with the compact design.

Done when: dashboard and incoming links lead to the correct estimation workspace while legacy estimates remain accessible.

### T5. Preserve design review outside the old commercial panel

Owner: Frontend implementer B in Mode A; primary in Mode B. Dependencies: T1/T2 settled contracts. May run in parallel with T3/T4. Acceptance: AC7–AC9.

1. Extract the existing Client drawings/plan review and space-planning completion presentation from the full commercial card into a focused reusable component.
2. Preserve query enablement, phase/approval guards, plan selection, annotations, dialogs, drafts, errors, focus restoration and existing completion actions.
3. Keep staff queue and legacy review behavior intact. Avoid duplicate design queries, duplicate dialogs or hidden mounted decision forms when the new component is used.
4. Export the agreed component for primary integration. Add focused regression tests for pre-design absence, post-design availability, unavailable data and approved/locked transitions.

Done when: all existing design features have a tested retained destination and the old commercial wrapper is no longer required by version-3 Client pages.

### T6. Integrate and verify the rendered workflow

Owner: Primary. Dependencies: T3–T5 writers finished. Acceptance: AC1–AC9.

1. Inspect the task-only diff against the dirty baseline. Reconcile all shared exports, query state, legacy behavior and page composition.
2. Use a local synthetic transport to exercise current draft, pending local edit, saved/waiting, fresh Sales-confirmed submission, approved pre-design, post-design, locked, unavailable and superseded states. No local customer database, real approvals or emails are needed.
3. Exercise the complete edit/save/reconfirmation/review/approval sequence with deliberately different working and frozen amounts. Assert the submitted version and total in the decision confirmation and payload.
4. Check two projects/identities, hidden siblings, Configuration changes without new publication, stale cached review eligibility, denied reads, lost save response, double-click and 409 decisions.
5. Render dedicated route, project page and dashboard at 390, 768, 1440 and 1920px. Check 200% text, accessible controls/dialogs, keyboard focus/return, bounded/document scrolling and final item/footer reachability. Run axe and monitor runtime/unexpected network errors.
6. Verify legacy Client approval, authorized Designer shared-route access, staff review queues, PDF/version links and post-design/drawing workflows remain available. Fix introduced regressions and recheck the affected cases.

Done when: evidence maps to every acceptance criterion and no known introduced behavior or layout defect remains.

### T7. Independent integrity review

Owner: `integrity_reviewer` in Mode A; primary sequential review in Mode B. Dependencies: T6. Acceptance: AC3–AC10.

Review the integrated result for wrong-version approval, mutable/frozen financial-source confusion, stale query races, unauthorized project visibility, lost edits, legacy/staff regressions, missing design features, accessible focus and accidental scope expansion. Resolve findings before final verification. Do not change backend approval gates to make a frontend test pass.

### T8. Final verification, cleanup and handoff

Owner: `verification_runner` after all writers/fixes in Mode A; primary in Mode B. Dependencies: T7. Acceptance: AC9, AC10.

Run focused checks first, then typecheck, full frontend suite and production build on the stable integrated result. Run the focused backend approval/projection/edit contract tests using their isolated test replica set, never the local demo/customer database. Retain exact results and distinguish reproduced baseline failures. Remove temporary repository browser entries, stop only task-started servers, inspect final hygiene and record artifacts/limitations. Do not stage, commit, push or deploy.

## Verification commands

Initial/final focused frontend lane, from `frontend/` (append any new focused tests created during T2–T5):

```sh
npm test -- src/features/client/ClientQuotation.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/EstimateBuilderArea.test.tsx src/features/estimates/EstimateNavigationGuard.test.tsx
npm run typecheck
npm test
npm run build
```

Focused unchanged backend contract checks, from `backend/`:

```sh
npm test -- tests/client-quotation-projection.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts
```

Read `tests/helpers/mongo-replica-set` before running to confirm the isolated target. If its required binary/runtime is unavailable, report the exact limit; do not point tests at local `lisno_demo`, seed data or weaken transactions. Backend full typecheck/build/suite and OCR checks are unnecessary unless an approved scope change crosses those boundaries.

At repository root:

```sh
git diff --check
git status --short
```

No repository lint script exists. Physical device and real soft-keyboard behavior must be labelled untested unless actually exercised. UI tests use synthetic data; no test should expose private links, tokens or customer information in logs/screenshots.

## Failure handling and execution record

Use the current captured baseline to investigate failures. An intentional removal of duplicate UI may require updating its old expectation; unrelated existing failures must be identified separately. Do not repeatedly rerun a broad suite after its result is established unless a relevant source fix or new uncertainty warrants it.

- Specification approval: received.
- Task-plan approval: received.
- Execution mode: A, parallel sub-agents.
- Parent tasks T1–T8 complete. No implementation task remains in progress. The final frontend suite is not entirely green because of reproduced baseline failures; these are explicitly separated below.
- Baseline: `/private/tmp/lisno-client-estimation-approval-baseline/` contains initial status, binary diff and a recoverable frontend checkout including pre-existing untracked files.
- Baseline focused checks: 12 files, 98 passed/1 failed; existing `EstimateReviewPanel.collapsible` failure. Exact output: `/private/tmp/lisno-client-estimation-approval-baseline-tests.log`.
- Shared contract: primary composes `ClientEstimationWorkspace` around `ClientQuotation` with published-review query state; the quotation keeps editor state and switches one item area to a snapshot-only builder. Design slice exports `ClientEstimateDesignReview({ estimate })`; dashboard uses canonical project quotation links. Existing backend canDecide plus exact identity/version/phase/pending-round binding governs eligibility; no frontend digest is computed from a visibility-filtered snapshot.
- Source changes relative to the captured baseline: 28 frontend source/test/style files; exact list is `/private/tmp/lisno-client-estimation-approval-task-paths.txt`. All 67 unrelated initial tracked diff paths remain byte-identical to the initial binary diff. No backend sources changed in this follow-up.
- Main implementation: `ClientEstimationWorkspace`, `ClientQuotationSubmittedView`, `clientQuotationReview`, `SubmittedEstimateBuilder`, `ClientEstimateSummary`, and `ClientEstimateDesignReview`. Existing Client project/quotation routes compose these; shared decision and comparison controls are reused. `ClientPublishedEstimateReview.requirementsVersion` only mirrors an existing server field. The previous requirements anchor remains available.
- Independent review: resolved three findings (authorized not-started detection after the real quotation 404, phase-specific Sales/Designer waiting copy, and return focus). Re-review found no new high/medium defect. Full-suite verification subsequently caught and resolved drawing/plan query coupling and legacy project-link remount regressions. The independent final audit found no new high/medium concern.
- Backend focused contract checks: 3 files / 67 tests passed, including isolated replica-set edit/approval paths. Output: `/private/tmp/lisno-client-estimation-approval-backend-tests.log`. No local/customer database was used.
- Browser evidence uses an isolated synthetic transport. Dedicated route editor/review, embedded project editor/review, and compact dashboard checked at 390/768/1440/1920px. One item area, no horizontal document overflow, zero axe violations and no runtime JavaScript errors in this matrix. Mobile submitted review uses document scrolling; desktop dedicated workspaces retain bounded panes. Embedded workspaces use document scrolling. Desktop and mobile 200% text (14px → 28px body) also pass overflow and axe checks.
- Browser interaction evidence: saved Client edit becomes waiting for Sales; new confirmed round is reviewed with the exact submitted version/total, then one approval request records approval. Failed review refresh retires submitted rows/actions; a failed version-specific PDF blocks approval until refresh. Save-and-return reaches Main Baskets with the saved quantity; room-scoped Sub Basket removal leaves the Bedroom sibling. Designer remains read-only and does not call the Client review queue.
- Final screenshots inspected: `/private/tmp/lisno-client-estimation-approval-final-mobile.png`, `...-final-wide-edit.png`, and `...-final-wide-review.png`. Detailed browser matrix/results: `/private/tmp/lisno-client-estimation-approval-browser-evidence.json`. The synthetic harness and console were archived under `/private/tmp/lisno-client-estimation-approval-browser-*`; task-specific repository entries were removed and the task-started Vite server stopped. Ignored build output remains in `frontend/dist/`, with ordinary TypeScript/test caches under `frontend/node_modules/`.
- Physical devices, real soft keyboards, actual browser zoom, live customer data, and external PDF delivery are untested. No dependency, migration, seed, commit, push, deployment or external communication was performed. No lint script exists.

After task-plan approval, ask the repository's execution-choice question once. Do not start implementation or subagents until the user selects A or B.


## Final verification record, 2026-11-04

| Check | Actual result |
| --- | --- |
| Focused frontend, 16 Client/workspace/review files | 159 passed, 1 reproduced baseline failure. Exact command and output: `/private/tmp/lisno-client-estimation-approval-final-focused.log`. |
| Full frontend `npm test -- --reporter=default --reporter=json --outputFile=/private/tmp/lisno-client-estimation-approval-final-tests.json` | 402 files; 6,150 passed, 97 failed before final drawing fixes. Exit 1. |
| Baseline comparison of all 11 failing files | 92 failures reproduce by exact name and first failure message in the preserved pre-task checkout. The 5 new failures were drawing/journey regressions. `/private/tmp/lisno-client-estimation-approval-final-failure-comparison.json`. |
| Final affected regression lane | `npm test -- src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx src/features/estimates/ClientEstimateDesignReview.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx`: 64 passed, 1 unchanged baseline failure. All 5 introduced failures pass. `/private/tmp/lisno-client-estimation-approval-final-design-recheck.log`. |
| Frontend `npm run typecheck` | Exit 0 after final source changes. `/private/tmp/lisno-client-estimation-approval-final-typecheck-stable.log`. |
| Frontend `npm run build` | Exit 0 after final source changes. Existing chunk-size warning remains. `/private/tmp/lisno-client-estimation-approval-final-build-stable.log`. |
| Backend projection/edit/approval tests | 67/67 passed across 3 files using disposable replica-set integration tests. |
| Root `git diff --check` and `git status --short` | Passed; no staging or commits. Task-only diff reviewed against the captured initial worktree. |

The retained focused failure is `EstimateReviewPanel.collapsible` expecting `1 items · GST included`. The other reproduced baseline failures concern Ask Lisno, Knowledge, procurement/proposals and the transport harness. No broad suite was repeated after the bounded drawing fixes; the affected drawing, journey, extracted review, workspace, legacy review, typecheck and build checks were repeated. Backend full suite/build and OCR were not run because this follow-up does not change those sources. Live backend startup was not changed or used for this verification.

| Acceptance | Final evidence |
| --- | --- |
| AC1 | Dedicated and embedded browser matrix: exactly one primary builder in edit/review, no full Project estimate duplicate. |
| AC2 | Client quotation/shared-shell tests; browser failed-save retention, save-and-return with quantity 6, Kitchen Sub Basket removal preserving Bedroom. |
| AC3 | Browser save → waiting → new Sales-confirmed version; rendered tests for dirty/failed/unknown state and superseded approvals. Post-design confirmation remains Designer-owned. |
| AC4 | Version/round consistency tests, frozen version 3 and total in browser confirmation, single mutation, 409 retirement/recovery. Backend immutable-approval integration tests pass. |
| AC5 | Asymmetric current/submitted amount fixtures; current Configuration incompleteness never substitutes for frozen snapshot evidence. |
| AC6 | Compact dashboard browser matrix; rendered two-project, deep-link, unknown/unlinked/legacy and failed-refresh coverage. |
| AC7 | Final drawing/journey/extracted-review regression tests; PDF exact-round/error guard; post-design comparison and permission/locked transition coverage. |
| AC8 | 390/768/1440/1920px, desktop/mobile 200% text, zero axe violations, bounded/document scrolling, keyboard focus/return and reachable footer. Physical devices remain untested. |
| AC9 | All unrelated initial tracked diffs preserved; Designer read-only browser check; 67 backend contract tests; legacy/staff test coverage. |
| AC10 | Exact logs, baseline comparison, independent review, final verification and artifact cleanup recorded above. |
