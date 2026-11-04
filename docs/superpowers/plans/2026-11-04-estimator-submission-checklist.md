# Estimator submission checklist: task plan

Date: 2026-11-04

Status: Specification and task plan approved; user selected Mode A. T1–T5 complete. Scoped implementation, integrity review and final verification passed.

Source of truth: [Approved specification](../specs/2026-11-04-estimator-submission-checklist-design.md). AC references below correspond to its eight acceptance criteria.

## Outcome and boundaries

Show three mandatory, initially unchecked statements before the Sales/Estimation role submits or sends an estimate. Confirming all statements permits exactly one existing action. Draft saving, Designer submission, Client approval and existing-artifact email retry retain their current behavior.

This is a frontend confirmation only. Preserve existing API payloads, authorization, approval history, version checks and financial calculations. No backend changes, persistent attestation, dependencies or migration are planned. Do not start or restart the application backend, launcher or OCR. Browser checks may use an isolated frontend with synthetic responses. No live data mutation, commit, push, deployment or external communication.

## Existing work and ownership

`git status --short` was recaptured during planning. The existing inline-recommendation changes are still present across backend and frontend and must be preserved. The new checklist specification is also untracked. No checklist implementation exists yet.

The expected dirty targets for this request are `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `LeadEstimateWorkspace.test.tsx` and `LeadEstimateWorkspace.collaboration.test.tsx`; their current changes implement the already-completed recommendation and excluded-item recovery work. Before any writer begins, capture the full initial dirty-path set and full diffs for assigned targets in temporary evidence under `/private/tmp/lisno-estimator-checklist/`. Treat those changes as the baseline. Never reset, stage, overwrite or reformat unrelated work.

Primary owns product interpretation, the dialog integration contract, workspace integration, existing workspace tests, documents and final reconciliation. A Mode A UI worker owns only the new dialog, its scoped stylesheet if necessary and its focused tests. Tell each worker that others share the worktree and that they must preserve existing edits.

## Integration contract

- Add `EstimateSubmissionChecklist.tsx` beside the estimate workspace. Reuse the shared `Dialog` and existing button styles; do not alter the global Dialog implementation.
- The dialog owns only three checkbox values and the approved copy. Parent inputs identify the action (`submit` or `send`), busy state, current ability to confirm, confirm/close callbacks and focus-return target. It never calls an API directly.
- A fresh mounted/opened dialog starts unchecked. Use the approved title and statements verbatim from the specification; final action is Confirm and submit or Confirm and send.
- The workspace owns the pending action and context: actor/review session, lead/estimate, saved version, current draft identity and relevant eligibility/freshness state. Reuse existing draft fingerprint helpers where applicable; avoid serializing the entire catalogue or creating a separate draft representation.
- Both buttons use one role-aware entry path. For `estimator_sales`, open the dialog without calling any mutation. Other authorized roles retain their existing path.
- Recheck both checklist completion and current action eligibility before invoking the existing mutation. Share eligibility logic between the original button and confirmation so that disabled-state rules do not drift. Additional context validation applies to the pending confirmation, without rewriting publication policy.
- An invalidated pre-confirmation context closes/resets the checklist. Once confirmation starts the action, its own save/version transition is allowed as part of that one attempt. Use an immediate in-flight guard as well as the pending UI state to reject duplicate activation.
- Preserve mutation callbacks and existing success/error/reconciliation behavior. Closing/reopening after a failed attempt must require fresh checks. No automatic retry and no acceptance stored in local storage or a backend record.

## Dependency-ordered tasks

### T1. Capture baseline and settle the component boundary

Owner: primary. Depends on task-plan approval and execution-mode selection. AC: all.

Capture dirty paths and target diffs. Confirm the two action callers, current role source, draft fingerprint and submission eligibility checks. Record the small component prop contract above before assigning implementation. Check existing test fixtures for role defaults and submission request tracking so tests assert real behavior, not mocked button plumbing.

### T2. Build the compact checklist dialog

Owner in Mode A: `frontend_implementer`; in Mode B: primary.

Exclusive paths: new `frontend/src/features/leads/EstimateSubmissionChecklist.tsx`, `EstimateSubmissionChecklist.test.tsx`, and `estimateSubmissionChecklist.css` only if local styling is necessary. Do not edit workspace, global Dialog, shared styles, API helpers or existing tests.

Depends on T1. AC: AC1–AC3, AC4 pending interaction, AC7.

Implement the approved copy, three labelled native checkboxes, disabled-until-complete confirmation, busy state and cancellation using existing Dialog focus/dismissal behavior. Keep the statements readable and actions reachable on short/mobile screens. Add focused rendered tests for partial/full/unchecking states, keyboard activation, cancel/reset, accessible labels and duplicate/pending interaction. No decorative icons or new design system.

### T3. Gate both estimator actions in the workspace

Owner: primary. Exclusive paths: `LeadEstimateWorkspace.tsx`, existing `LeadEstimateWorkspace*.test.tsx`, and a narrowly focused new `LeadEstimateWorkspace.checklist.test.tsx` if it makes the regression coverage clearer.

Depends on T1 and the agreed T2 interface; can proceed in parallel with T2 in Mode A. AC: AC1, AC3–AC6.

Connect submit and ready-for-client send through the role-aware checklist. Keep all mutations idle before confirmation. Preserve save-before-submit ordering and expected version, Sales confirmation of Client changes, query invalidation, publication feedback and delivery retry. Capture/validate pending context, reject double activation and reset on project/actor/version/eligibility changes. Apply no checklist to Designer or Client actions.

Update existing submission tests to deliberately complete the checklist where their actor is the estimator, without weakening their original assertions. Add regressions that observe network/mutation ordering for submit and send, cancellation/no writes, stale context, in-flight duplicate clicks, request failure and role isolation. Preserve earlier recommendation/recovery tests and behavior.

### T4. Integrate and review

Owner: primary, with a read-only `integrity_reviewer` in Mode A. Depends on T2 and T3 finished. AC: AC1–AC6.

Inspect the combined incremental diff against the captured baseline. Verify every action path is gated only for the intended role; no request starts when opening or dismissing the dialog; changes while open cannot reuse acceptance; internal save/version updates do not invalidate an already confirmed attempt; old callbacks cannot act on a new project. Resolve confirmed findings before final verification. No parallel product-source writers during this review.

### T5. Verify the integrated result and hand off

Owner: primary for browser checks and final reconciliation; `verification_runner` for integrated automated checks in Mode A. In Mode B, primary performs all checks sequentially. Depends on T4 findings resolved. AC: all.

Run the focused matrix below after all writers finish. Exercise the actual dialog in synthetic browser fixtures at 390, 768 and 1440 pixels, including a short viewport, keyboard checks, focus restoration, busy/error behavior and horizontal overflow. Confirm Cancel causes no save/submit/send request and the two successful actions call only their intended path. Check visible copy against the approved specification and inspect screenshots. Record fixture-based evidence honestly; no live backend check is expected.

Update this plan with exact commands, counts, browser evidence, baseline failures and limitations. Do not claim completion of an unverified criterion. Report affected files, dependencies (expected none), untouched backend/API contracts and any remaining risk.

## Safe parallelism and execution mode

- No agents or implementation before the user selects A or B at the execution-choice gate.
- Mode A: after T1, T2 dialog work and T3 workspace work can run in parallel on the non-overlapping paths above. Primary supplies the prop contract. Integrity review follows both writers; final verification follows fixes.
- Mode B: primary performs the same tasks inline without implementation subagents.
- Keep only one parent phase in progress: baseline, implementation (T2/T3), review, then final verification. Do not add agents for unrelated backend work.

## Verification commands and acceptance mapping

Run in `frontend/`, including the new workspace test path only if created:

```sh
npm test -- src/features/leads/EstimateSubmissionChecklist.test.tsx src/features/leads/LeadEstimateWorkspace src/features/leads/LeadEstimateRecommendations.test.tsx src/components/ui/Dialog.test.tsx src/features/estimates/EstimateNavigationGuard.test.tsx
npm run typecheck
npm run build
```

At repository root:

```sh
git diff --check
git status --short
```

| Acceptance criteria | Required evidence |
| --- | --- |
| AC1–AC2 | Both estimator action paths open exactly three unchecked statements; zero to two checks and keyboard Enter cause no write; all three allow confirmation; unchecking disables it. |
| AC3 | Cancel/close/Escape/backdrop do not mutate or lose draft edits; reopening resets; focus returns to the initiating control. |
| AC4 | One save then submit, or one send; existing versions/payloads and Sales confirmation remain correct; repeated confirm while pending is rejected. |
| AC5 | Actor/project/draft/version and eligibility changes invalidate the pending checklist; failure preserves existing error/draft behavior; own confirmed save transition still succeeds. |
| AC6 | Save draft/navigation saves bypass the checklist; Designer and Client paths remain unchanged; retrying delivery does not create another submission; disabled/historical actions stay blocked. |
| AC7 | Rendered accessibility/keyboard regressions plus browser inspection at 390/768/1440 and short height; no page overflow or new runtime errors. |
| AC8 | Focused tests, frontend typecheck/build, diff hygiene and exact handoff evidence. |

Do not rerun backend-wide or OCR suites for this UI-only change. There is no repository lint script. The previous task observed a Vite large-chunk warning and an unrelated backend authorization-policy audit-list failure; neither is part of this task. Reuse previous evidence only as background, not as proof of this new change. Temporary screenshots/logs belong in `/private/tmp/lisno-estimator-checklist/`; build outputs remain ignored.


## Execution record

- Captured initial dirty paths, full target diffs and target file copies in `/private/tmp/lisno-estimator-checklist/` before implementation. Prior inline-recommendation work is preserved.
- Primary implemented both action gates and updated existing workspace tests with explicit estimator permissions. Collaboration tests now use the actual Designer role except the explicit Sales confirmation case.
- A frontend worker implemented the new dialog, local stylesheet and seven focused component tests. A separate test-only worker owns the new workspace checklist regressions; no product-source overlap.
- The shared action eligibility is checked before opening and confirming. Pending context covers actor/session, project/estimate identity, draft/raw input, saved/working versions and quotation revision. Confirmed attempts use an immediate duplicate guard and retain their own save/version transition.
- Read-only integrity review found no confirmed source or regression-test defects. Final automated checks passed as recorded below.
- Synthetic browser layout checks passed at 390×844, 768×1024, 1440×900 and 390×500, with no horizontal overflow, axe violations or runtime errors. Screenshots were visually inspected. Cancel/reopen resets all checks, restores focus and performs no write. Keyboard confirmation with two checks performs no write; three checks performs one PUT save followed by one POST submit. Busy controls are disabled and Escape cannot dismiss the in-flight attempt.
- The application backend, launcher and OCR were not started. Temporary browser fixture data is synthetic.


### Final verification

- Final focused command listed above: **9 files, 150 tests passed**, no failures or skips. This includes 7 dialog tests and 11 new workspace checklist regressions. Updated existing tests retain submission/publication/navigation/history/recommendation assertions with explicit actor roles.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npm run build`: passed. Vite still reports existing bundles above 500 kB; this task adds no dependencies.
- `git diff --check`: passed. Initial dirty paths remain; four new product/test paths are the checklist component, scoped CSS, component tests and workspace checklist tests. Existing source edits are limited to `LeadEstimateWorkspace.tsx` plus its three existing test files; this specification/plan pair records the task. Prior recommendation work was preserved.
- Send-to-client browser check: opening performs no write; a simulated failed send returns to the estimate; reopening starts unchecked; manual retry issues one send request per explicitly confirmed attempt, with no draft save. No runtime errors occurred. Dialog, viewport, keyboard, busy and submit checks are recorded above.
- Browser used an isolated Chromium profile against Vite development mode with synthetic transport, not a live backend. No performance claim is made. The temporary browser and frontend QA server were closed after checks.
- Logs: `/private/tmp/lisno-estimator-checklist/final-*.log`. Browser results: `browser-layout-result.txt`, `browser-submit-result.txt`, `browser-send-result.txt`; inspected screenshots under `output/playwright/` in that same temporary directory. Ignored build outputs remain under `frontend/dist/` and existing TypeScript build metadata.
- No full repository suite, backend/OCR tests, lint or live backend check ran, because this approved slice changes only the frontend. No migration, dependency/lockfile change, live data mutation, backend launch, commit, push, deployment or external message occurred.
- Earlier local failures were fixture-role/hydration timing issues and were corrected in tests; the final integrated run above has no failures. No known checklist defect remains from review or verification.
