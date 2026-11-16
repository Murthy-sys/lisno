# Vendor login workflow presentation task plan

Date: 2026-11-14
Status: Implemented and verified within scope on 2026-11-15. Full-suite baseline failures are documented below.
Specification: [Vendor login workflow visibility and styling preservation](../specs/2026-11-14-vendor-workflow-presentation-design.md)
Specification approval: User replied `Approved` on 2026-11-14.

## Outcome and boundaries

Improve the `/vendor` web workspace so vendors can identify the current workflow stage, latest report, available next action and review status without sacrificing existing styling. Include responsive mobile-browser behavior. Preserve backend authority, version checks, saved history, evidence requirements, issued-order data and staff execution behavior.

No backend, native-mobile, authentication, Procurement directory, global theme, dependency or lockfile changes are planned. No commits, pushes, deployments, database writes, migrations, real email or customer communication are authorized.

Initial implementation-target worktree state at planning: clean. The only untracked path is the specification created for this request. Recheck the worktree before implementation and preserve that document and any newly appearing unrelated work.

## Execution and ownership

The user approved this plan and selected Mode A on 2026-11-15.

- **Mode A:** primary agent owns integration and shared files; bounded implementation roles own the non-overlapping slices below. Read-only integrity review follows the writers, then final verification runs on the reconciled worktree.
- **Mode B:** primary agent performs every slice, review and verification sequentially. The same file boundaries and acceptance checks apply.
- Keep one parent phase in progress: baseline and presentation contract, implementation, integration, integrity review, then final verification.
- Every delegated writer must be told that other agents share the worktree, must preserve their edits, and must report a contract or ownership conflict before crossing its boundary.

| Owner / slice | Exclusive write boundary | Boundary conditions |
| --- | --- | --- |
| Primary integration | Plan status/evidence; `VendorWorkPage.tsx`; `vendorWork.css`; any justified vendor-only additions in `execution.css`; shared `executionTestFixtures.ts`; enterprise QA fixture/transport files; `ExecutionLiveProvider.tsx` and its tests only if a demonstrated refresh gap requires a scoped fix | Own all shared CSS and fixture edits. Do not change global tokens or unrelated role behavior. Coordinate selectors with list and detail owners before their parallel work. |
| Presentation contract | New `frontend/src/features/vendor/vendorWorkflowPresentation.ts` and its focused test file | Read existing execution/API types. No query, mutation, API contract or CSS edits. Hand back this completed slice before list/detail writers start. |
| Assignment list | `frontend/src/features/execution/ExecutionWorkspace.tsx`; new `frontend/src/features/vendor/VendorAssignmentList.tsx` and its test; `ExecutionWorkspace.test.tsx` | Vendor branch and small extraction only. Preserve staff branch, query ownership, filtering, paging and notification selection. Read the settled presentation contract without changing it. |
| Detail and review | `frontend/src/features/execution/ExecutionDetailPanel.tsx`; new vendor workflow-summary/review-context components and focused tests; `frontend/src/features/vendor/VendorWorkPage.test.tsx` | Preserve existing command ownership and forms. Read existing `vendorWorkApi.ts`; no new endpoint or schema. No list, shared CSS or shared fixture edits. |
| Integrity review | Read-only integrated changes and relevant callers | Inspect authority, identity, lineage, freshness, draft protection and shared-component impact. Return concrete findings and evidence. |
| Final verification | Run checks and browser QA; temporary artifacts outside tracked source | No product-source edits. Return exact commands, outcomes and AC coverage. Findings return to the responsible owner before targeted re-verification. |

New components are warranted only for bounded presentation or selected-assignment review context. Final filenames may be simplified within these ownership boundaries without changing scope.

## Dependency-ordered work

### T0. Capture behavior and visual baseline

Owner: Primary. Dependencies: approved plan and selected execution mode.

- Record `git status --short`, the initial dirty-path set and relevant per-target diffs before any writer starts. Do not assign a dirty target until its existing changes and ownership are understood.
- Run the focused existing vendor/execution tests to establish a baseline. Record pre-existing failures separately; diagnose any failure relevant to this scope.
- Start the local frontend with the existing synthetic enterprise QA harness. Use `qa/enterprise.html?role=vendor&route=%2Fvendor&state=populated` and existing staff scenarios with synthetic data only.
- Capture vendor list/detail and one staff execution view at 390px, 768px and 1440px where relevant. Record typography, surfaces, spacing, borders, focus and overflow. This baseline governs style preservation.
- Confirm the harness covers all requested views. Where it lacks a workflow state, extend only its synthetic fixtures during implementation or use controlled browser response mocks. Do not seed a database or use real vendor data.
- Store temporary screenshots/logs under a task-specific temporary directory such as `/tmp/lisno-vendor-workflow-qa/`; record the actual path and remove unnecessary outputs after inspection.

Acceptance coverage: AC1, AC7, AC8. Output: baseline results and agreed vendor-specific CSS/component boundaries.

### T1. Settle the shared vendor presentation mapping

Owner: Presentation contract. Dependency: T0.

- Create one small typed mapping from `ExecutionWork` to readable vendor stage labels, explanatory text, workflow milestone presentation and the next permitted vendor action. Reuse existing date/status label utilities where appropriate.
- Treat the result as display information, never as permission enforcement or a new business state. Commands remain gated by backend `allowedActions`; Client submission remains gated by `canSubmitToClient`.
- Define exceptional presentation before the ordinary sequence: superseded, legacy review, setup required, hold, blocked and changes requested. A pending schedule proposal must remain distinguishable from a confirmed schedule.
- Keep current-round vendor report data separate from `latestNote`. Do not infer verification from 100%, reuse a previous-round verification as current, or infer Client decisions from execution history.
- Prefer an available vendor action over a generic waiting message while retaining the server-provided handoff owner. Do not replace a conflicting server owner with an invented one; report any inconsistency that requires backend work.
- Cover the specification's state table with meaningful assertions about displayed stage/action, absent permissions, missing facts and legacy/rework behavior.
- Publish the helper's minimal input/output shape and the vendor CSS hook convention to both UI slices before they start. Primary owns any subsequent shared-contract adjustment.

Acceptance coverage: AC2, AC3, AC4. Output: reviewed presentation helper and focused passing tests.

### T2. Improve the vendor assignment list

Owner: Assignment list. Dependency: T1.

- Use a vendor-specific list presentation inside the existing workspace while retaining the current desktop table structure and shared search/filter/count/pagination behavior.
- Surface current stage, next-step guidance, actual reporting obligation, commitment and relevant exception context. Preserve project number, room, order/revision and stable assignment identity.
- Provide semantic markup that supports readable vertical rows on narrow screens without requiring horizontal scrolling for core workflow information. Avoid duplicate focusable actions or separate query trees for desktop/mobile.
- Keep existing detail opening and notification deep links. A summary action opens or focuses the existing appropriate form; it must not perform an immediate mutation or bypass detail freshness checks.
- Preserve backend counts and pagination totals. Do not introduce page-local aggregate metrics or client-only filters masquerading as server filters.
- Add rendered tests for same-name work across unequal projects/orders, selection identity, statuses, filtering/pagination preservation, waiting states and read denial. Preserve existing staff workspace assertions.

Acceptance coverage: AC1, AC2, AC4, AC6, AC7. Output: integrated vendor list markup and focused tests. CSS remains primary-owned.

### T3. Improve assignment detail, latest updates and review context

Owner: Detail and review. Dependency: T1. May run concurrently with T2.

- Add an explicit vendor class/variant to the portaled detail panel. Keep the shared staff/compact presentation intact.
- Put assignment identity, current stage, available next step and a semantic stage sequence early in the panel. Milestones are explanatory rather than clickable workflow transitions.
- Present the current-round `latestVendorReport` with timestamp, note, percentage, reason and next action. Label `latestNote` separately as workflow activity; show missing current-round reports explicitly.
- Add a selected-assignment-only query using `getVendorWorkDetail` and `vendorWorkKeys.detail` for Client submission/acceptance timestamps and requested-change reason when needed. Do not fetch this context for every list row or for staff users.
- Match supplemental data to the selected assignment's stable identity. Keep execution versions separate from vendor-work versions. Handle supplemental loading, missing values, failure, retry and denial without inventing successful review details.
- Keep execution history distinct from Client review facts. Hide opaque actor IDs in the vendor presentation while retaining supplied dates, rounds, reasons and meaningful event text.
- Retain the actual acknowledgement, scheduling, report, evidence, completion and Client submission forms, their validation, expected versions, idempotency and dirty/busy close guards. Do not create duplicate command implementations.
- Keep approved-order access and printing reachable. Remove or reposition repeated facts only where the new summary already presents them accurately.
- Ensure new summary entry points and relevant vendor actions are unavailable while their authoritative data is denied or failed/stale. Preserve input when updates race or a request fails.
- Update rendered regressions for 100% versus verification versus acceptance, blocked/rework reports, missing report/review data, Client review eligibility, stale versions, actor-ID omission and print/access retention.

Acceptance coverage: AC1, AC2, AC3, AC4, AC5, AC6, AC7. Output: vendor detail hierarchy and passing focused tests. CSS remains primary-owned.

### T4. Integrate styling, refresh behavior and synthetic QA states

Owner: Primary. Dependencies: T2 and T3. CSS drafting may progress alongside those tasks after selectors are settled, but final integration follows both writers.

- Apply the approved visual treatment in `vendorWork.css` using existing tokens and explicit vendor selectors. Add scoped rules in `execution.css` only if necessary. Verify the portaled panel has the required style context.
- Preserve current fonts, theme colors, control styling and restrained separators. Add no icons, fonts, dependencies, global token changes or decorative effects.
- Integrate list/detail hierarchy and responsive behavior; preserve Project notices, project status controls, the approved-order disclosure, accessible names and focus restoration.
- Trace each changed action to existing execution/vendor-work query invalidation. Confirm any selected-assignment Client review query refreshes after submission and live updates. Adjust only a demonstrated gap; do not add a second live-update service or another polling loop.
- Verify update saved, refresh failed, offline, reconnect, 409 conflict and access-denied states. A detail draft must survive live changes until the user explicitly reviews the new version.
- Reconcile synthetic fixtures with real response shapes for all workflow states. Include two same-name assignments with different project/order IDs, a newer staff activity than the latest vendor report, and current versus previous rounds.
- Run the combined focused suite on the integrated result. Resolve any shared-worktree transient failures before review.

Acceptance coverage: AC1 through AC8. Output: reconciled frontend implementation and integration evidence.

### T5. Perform integrity review

Owner: `integrity_reviewer` in Mode A; primary in Mode B. Dependency: all writers finished and T4 reconciled.

- Review the final diff against the approved specification and ownership boundaries.
- Check backend-only action authority, assignment/project/order joins, execution versus vendor-work version domains, immutable review facts, current-round evidence and stale-data handling.
- Confirm the stage mapping cannot manufacture completion, Client approval, report timestamps, actor identity or portfolio counts.
- Confirm vendor CSS/markup changes do not alter staff execution views, global tokens, native screens or approved-order print behavior.
- Resolve confirmed findings in the assigned file boundaries, then re-run affected checks. Report any material scope change before implementation beyond this specification.

Acceptance coverage: AC1 through AC6, AC8. Output: recorded review findings and resolutions; no unresolved release-blocking issue.

### T6. Verify the integrated result and hand off

Owner: `verification_runner` in Mode A; primary in Mode B. Dependencies: T5 and all corrective edits finished.

- Run focused regressions, then the frontend typecheck, full test suite and production build. Use exact checks below and record failures, warnings and any unrun checks accurately.
- Complete rendered checks across the viewport/state matrix. Compare the final vendor screens with the baseline and inspect one affected staff execution view for regression.
- Verify keyboard access, panel focus trapping/restoration, dirty-form behavior, readable status text, touch targets, reduced motion, no unintended horizontal page overflow, and browser console/network errors.
- Validate cross-session refresh through the existing mocked stream/provider tests. Synthetic visual QA alone does not prove a real backend event delivery path; state that limit if no local backend integration check is available.
- Run repository hygiene checks and inspect the final diff. Confirm only scoped product/test files and approved documents changed, with no retained runtime data or dependency edits.
- Record evidence against AC1–AC8 in this plan. Report outcome, affected files, architectural decisions, exact checks/results, unrun checks, temporary artifact paths and any remaining limitations. No external actions are performed.

Acceptance coverage: AC1 through AC8. Output: verified handoff, or a precise account of anything still unverified.

## Parallelism and dependencies

Dependency order: T0 -> T1 -> (T2 and T3) -> T4 -> T5 -> T6.

- Safe parallel work in Mode A: T2 list, T3 detail, and primary-owned scoped CSS/QA fixture work after T1 establishes presentation outputs and selectors.
- Presentation-contract changes, shared fixture edits and shared CSS have one owner; writers must request integration rather than modify those paths independently.
- T5 and T6 run sequentially after all writers. Tests run during parallel edits are provisional; final verification must use the integrated result.
- In Mode B, perform T2 and T3 sequentially and retain the same integration/review gates without subagents.

## Verification commands and matrix

From `frontend/`, baseline and focused integration checks:

```sh
npm test -- src/features/vendor/VendorWorkPage.test.tsx src/features/execution/ExecutionWorkspace.test.tsx src/features/execution/ExecutionLiveProvider.test.tsx src/features/execution/executionStream.test.ts
```

After new vendor presentation tests exist, include the vendor feature directory plus the shared execution regressions:

```sh
npm test -- src/features/vendor src/features/execution/ExecutionWorkspace.test.tsx src/features/execution/ExecutionLiveProvider.test.tsx src/features/execution/executionStream.test.ts
npm run typecheck
npm test
npm run build
```

Run `src/test/fixtures/enterpriseTransport.test.tsx` separately if its transport is changed before the full suite. There is no lint script; do not report lint as passed. Backend tests and replica-set tests are not required for the planned frontend-only scope; revisit verification if scope changes.

Local browser server, using a free loopback port if 5173 is occupied:

```sh
npm run dev -- --host 127.0.0.1 --port 5173
```

Load and follow the Playwright skill before browser automation. Use the existing enterprise QA harness and its `enterpriseQa.inspect()` / `enterpriseQa.axe()` helpers where applicable. Do not rely on screenshots alone for interaction/accessibility checks.

| View/state | Required widths | Core observations |
| --- | --- | --- |
| Populated vendor assignments, long names, same-name projects | 390, 768, 1440 | Style preservation, identity, stage/deadline/action readability, filters and pagination |
| Detail with daily report and blocker | 390, 768, 1440 | Latest-report lineage, action form, evidence, focus and dirty state |
| Pending verification, verified awaiting submission, pending Client review, accepted | 390 and 1440 | Distinct stage wording and only permitted actions |
| Setup, legacy, hold, changes requested, superseded | 390 and 1440 for representative layouts; all in rendered tests | Accurate exception explanation with no invented completed milestones |
| Loading, empty/filtered-empty, error/retry, denied | 390 and 1440 | Honest states, preserved styling, no protected content after denial |
| Failed refresh/offline/reconnect, conflict while editing | 390 or 1440 plus focused tests | Stale notice, preserved inputs, no premature state advancement |
| Shared staff execution and issued-order print view | 1440; staff narrow view if shared responsive rules change | No vendor-specific style or workflow regression |

At repository root:

```sh
git diff --check
git status --short
```

## Progress and evidence

- Specification: approved on 2026-11-14.
- Task plan: approved on 2026-11-15.
- Execution mode: A, parallel sub-agents.
- Current parent phase: complete.
- T0: complete. Initial product-target diffs clean; only this request's spec and plan were untracked. Focused baseline: 4 files / 23 tests passed. Captured vendor list/detail at 390/768/1440 and shared Procurement execution at 390/1440. The QA harness lacked detail responses and Procurement execution permission, so synthetic-only support was added before detail/staff capture.
- Read-only contract audit complete: stage/action guidance must account for `nextOwner` differing from permitted actions; project-level Client review outcomes are not exposed by assignment DTOs. Preserve neutral guidance where those details are unavailable. Supplemental vendor-work detail has independent versions/rounds and rejects superseded work; skip that supplemental request for superseded assignments.
- T1: complete. Shared display helper and current-round report selector implemented; 19 focused tests and frontend typecheck passed.
- T2/T3: complete. Vendor list and detail integrated with their focused regressions.
- T4: complete. Combined focused checks passed: 15 files / 163 tests. Vendor list and detail inspected at 390/768/1440 with no page overflow or unexpected requests; detail axe check found zero violations. Next-action focus and keep-editing draft preservation checked in browser. Scoped responsive selectors corrected after the first visual pass exposed shared-table CSS overriding mobile widths.
- T5: complete. Independent integrity review (including a separate style/print boundary review) found no confirmed defects.
- T6: complete. Independent verification runner confirmed typecheck and production build pass. Full frontend suite: 6,909 passed, 98 failed across 12 files. All 98 failures were reproduced by running those 12 files in an isolated `git HEAD` snapshot with the same dependencies (453 passed, 98 failed); exact failed assertion sets match, with zero integrated-only failures. No unrelated assertions or product features were changed.
- Browser checks passed for 14 workflow states at 390/1440, plus loading/empty/error/denied states, staff comparison and purchase-order printing. Representative detail states had zero axe violations; no unexpected synthetic requests or runtime errors were observed in the vendor matrix.
- Temporary browser artifacts: `/tmp/lisno-vendor-workflow-qa/`.

## Final verification evidence

| Check | Exact command or method | Result |
| --- | --- | --- |
| Integrated focused regressions | `cd frontend && npm test -- src/features/vendor src/features/execution/ExecutionWorkspace.test.tsx src/features/execution/ExecutionLiveProvider.test.tsx src/features/execution/executionStream.test.ts` | 15 files, 163 tests passed. The vendor path filter also includes existing vendor-related feature tests. |
| TypeScript | `cd frontend && npm run typecheck` | Passed, exit 0. |
| Full frontend suite | `cd frontend && DEBUG_PRINT_LIMIT=0 npm test -- --reporter=json --outputFile=/tmp/lisno-vendor-workflow-qa/final-full-tests.json` | 436 files passed, 12 failed; 6,909 tests passed, 98 failed. All vendor/execution tests passed. |
| Failure baseline comparison | Same 12 failed files from `final-failures-summary.json`, using an isolated archive of `git HEAD` and the same installed dependencies | All 98 failed assertion names match exactly; no new failing assertions. Results in `baseline-all-failures.json` and `baseline-comparison.json`. |
| Production build | `cd frontend && npm run build` | Passed, exit 0; 3,353 modules transformed. Existing application bundles exceed Vite's 500 kB warning threshold. |
| Hygiene | `git diff --check` and `git status --short` | Passed; only scoped source/tests and approved documents changed. No staged or committed changes. |

### Acceptance reconciliation

| Criteria | Evidence |
| --- | --- |
| AC1 | Before/after vendor list/detail screenshots preserve typography, palette, controls and panel treatment. Staff execution still uses its original table; independent CSS/print review found no boundary regression. |
| AC2, AC4 | Presentation and rendered tests cover permitted actions and saved milestones; browser matrix covers setup, acknowledgement, proposal, blocked, hold, 100% reported, verification pending, verified, neutral handoff, Client pending/accepted, rework, legacy and superseded states. |
| AC3 | Current-round vendor reports remain distinct from newer workflow activity. Supplemental Client context tests cover identity/status mismatch, independent rounds, missing dates, previous submissions, denied cached data and retries. |
| AC5 | Existing stream/provider tests, mutation regressions, stale-refresh blocking, conflict preservation, browser next-action focus and keep-editing checks passed. Actual production event transport was not exercised; browser QA used synthetic local data. |
| AC6 | Same-name work from two unequal projects/orders remains distinguishable in tests and browser; stable IDs control selection and review-query matching. |
| AC7 | List/detail at 390/768/1440 and the state matrix at 390/1440 have no horizontal page overflow. Semantic headers remain available on responsive rows. Representative detail axe checks report zero violations; keyboard focus, dirty-panel behavior and reduced-motion rendering checked. |
| AC8 | Focused suite, typecheck, build and hygiene passed. The full suite remains non-green solely with the 98 matching baseline failures described above. |

The failing baseline files concern Ask Lisno, Configuration layouts/sections/screens, estimate reviews, lead collaboration/tiers/pricing, routing and the enterprise harness. The exact test names are retained in `/tmp/lisno-vendor-workflow-qa/final-failures-summary.json`.

No dependencies, backend contracts, database schema or native-mobile code changed. No backend/OCR tests, replica-set checks, migrations, deployments, production mutations or external messages were performed. No lint script exists. Verification generated ignored `frontend/dist/` and `frontend/node_modules/.tmp/`; temporary screenshots and logs are outside the repository. The temporary baseline source checkout was removed after comparison.

Existing contract limits remain explicit: assignment responses do not expose all project-level Client outcomes, and raw `nextOwner` may differ from the actionable stage. Main guidance follows explicit stage and permitted actions; missing outcomes are not invented.
