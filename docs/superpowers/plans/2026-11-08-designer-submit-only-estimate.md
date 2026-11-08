# Designer estimate Submit-only action: task plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved design](../specs/2026-11-08-designer-submit-only-estimate-design.md)
Specification approved by the user on 2026-11-08.
Execution mode: A — parallel sub-agents, selected by the user.

## Outcome and integration contract

The Designer edits an estimate and presses **Submit** once. The application saves
the changes, verifies the returned revision and submits that exact version for
Client review. Remove the Designer's separate Save draft buttons in Configure and
the Items/Summary footer. Sales keeps its existing Save draft and Submit actions.

For V3, add an optional staff DTO capability named
`canPrepareQuotationSubmission`. The backend returns true only for the assigned
primary Designer of an editable post-approval quotation, with matching estimate
Designer identity and initial approval. Derive this from the same current project,
phase and lock rules used by publication, without requiring an already-saved
material revision. Keep `canPublishQuotation` unchanged: it describes publication
eligibility of the saved quotation. Missing preparation capability fails closed
for the new first-unsaved-revision path.

The Designer action is enabled when preparation is authorized and the current
estimate has unsaved edits or an existing revision requiring submission, subject
to the existing validation and freshness checks. After save, require the returned
V3 DTO to identify the same estimate/project and permit publication, then pass its
version to the established submit endpoint. A non-material edit may save without
creating a new review; explain that the existing approval still covers it.

Keep legacy/V2 submission rules, unsaved-navigation safeguards, locked/historical
states, publication idempotency, Client review and immutable approval history.
No endpoint or mutation payload redesign, dependency, migration, pricing change,
deployment, commit or real customer communication is included.

## Ordered tasks and ownership

### T1. Capture the baseline and confirm the contract

Owner: Primary agent. Starts after plan approval and execution-mode selection.

- Capture the initial dirty paths and per-target diffs. Preserve the completed
  all-basket picker changes, prior action changes and concurrent pricing work.
- Confirm capability derivation against current primary assignment, phase and
  editable-state rules. Confirm response typing and existing generic OpenAPI
  documentation before extending them.
- Confirm existing save-outcome recovery, publication retries and navigation saves
  can be reused. Do not bypass these protections to remove a button.

Acceptance: AC1–AC4 invariants and cross-layer field name settled before writers.

### T2. Expose preparation eligibility without weakening publication

Owner: Backend implementer in Mode A; primary agent in Mode B. Depends on T1.

Owned paths: `backend/src/routes/estimates.ts` and
`backend/tests/quotation-approvals.replica-set.test.ts`; narrow existing estimate
OpenAPI documentation/tests if needed, coordinated with the primary agent.

- Add the actor-scoped preparation capability to the existing staff estimate DTO.
  Keep saved-revision publication eligibility, route operations and mutations
  unchanged. Do not infer primary assignment only from role or estimate ownership.
- Test the assigned Designer immediately after initial approval and after a saved
  revision, plus secondary/unrelated Designers, stale assignment, Sales, pre phase,
  pending review and final/closed states. Verify unchanged approval history.
- Retain the existing unchanged-quotation rejection and save/submit version checks.

Acceptance: AC2–AC4. Can run in parallel with T3 after T1 settles the DTO contract.

### T3. Replace Designer Save draft with one safe Submit action

Owner: Frontend implementer in Mode A; primary agent in Mode B. Depends on T1;
uses the agreed capability from T2.

Owned paths: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`,
`leadsApi.ts`, and its collaboration/checklist/catalogue/revision tests as needed.
Do not edit backend files or the Client picker. The primary agent owns shared-file
reconciliation and any additional narrow test ownership assignments.

- Add the optional capability type. Remove Designer Save draft controls and show
  one **Submit** button in editable Items/Summary, with **Submitting…** while busy.
- Distinguish preparation eligibility from saved publication eligibility. Keep
  unchanged initial estimates disabled with a concise reason, while allowing the
  first valid local addition/edit without a prior manual save.
- Reuse the existing save-then-submit mutation. Check the saved response identity,
  capability and version before publication. Protect against duplicate clicks,
  stale/refreshed assignment, invalid input and mid-operation editing.
- Preserve successful saves when publication fails. Show a truthful failure state
  with safe retry; preserve unknown-save verification. Never publish after a failed
  save or show Client-review success before publication succeeds.
- Keep existing navigation saves and unsaved-change prompts; ordinary navigation
  does not submit. Preserve Sales controls and legacy/V2 restrictions.
- Adapt tests to exercise the intended Designer Submit interaction rather than
  retaining obsolete Save draft expectations or deleting their failure coverage.
  Cover additions from a new basket and edits to existing items, correct saved
  version submission, non-material edits, returned corrections, partial failures,
  recovery, duplicate clicks and permissions. Preserve internal and other-room rows.

Acceptance: AC1–AC5. Can run alongside T2; final integration waits for both.

### T4. Integrate and review the complete flow

Owner: Primary agent. Depends on T2 and T3.

- Reconcile capability types, response guards, button states and error messages.
  Verify Client approval/request-changes continues through the existing flow.
- In Mode A, run an independent `integrity_reviewer` after writers finish; resolve
  confirmed findings before the verification runner. In Mode B perform equivalent
  review inline. Focus on assignment, saved-version lineage, unchanged-quotation
  behavior, partial failures and immutable approvals.

Acceptance: AC1–AC4. Keep one parent task active at a time.

### T5. Verify and hand off

Owner: `verification_runner` in Mode A, primary agent in Mode B, with browser QA
owned separately from product writes. Depends on T4.

Run from `backend/`:

```sh
npm test -- tests/quotation-approvals.replica-set.test.ts tests/quotation-openapi.test.ts
npm run typecheck
npm run build
```

Use the existing disposable replica-set helper, never a development/production
database. If OpenAPI documentation changes, include its focused contract suite.

Run from `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx
npm run typecheck
npm run build
```

Include other workspace suites only when affected by the changed interaction.
Do not run unrelated full repository suites or repeat successful checks without
a new change or unresolved concern. There is no lint script.

Use real rendered workspace components with synthetic data for desktop/mobile
browser checks: Designer Submit visible and no Save draft in Items/Summary or
Configure; an item edit enables Submit; one click saves and submits the returned
version; busy/error states are understandable; focus and layout remain usable.
Verify the Sales action pair in a focused rendered regression. Distinguish mocked
browser evidence from backend transaction tests in the handoff.

Run `git diff --check` and `git status --short`, inspect the final task diff and
confirm unrelated changes remain preserved. Record exact results and remaining
limits, stop task-owned processes and remove task-owned temporary fixtures/logs/
screenshots. Report ignored build outputs and unrun checks. Do not call partially
verified work complete.

## Parallelism and progress

Mode A: T1 → parallel T2/T3 → T4 integration/review → T5 verification/handoff.
Mode B: T1 → T2 → T3 → T4 → T5, all inline.

Backend and frontend ownership do not overlap. The primary agent owns this plan,
the specification, cross-layer decisions and final integration.

T1 complete: initial dirty paths and full diff captured under
`/private/tmp/lisno-designer-submit-initial-status.txt` and
`/private/tmp/lisno-designer-submit-initial.diff`. The additive preparation
capability contract is settled; existing saved publication eligibility stays intact.

T2 complete: preparation capability and descriptive OpenAPI documentation added;
existing publication rules retained. Backend focused replica-set/OpenAPI tests
passed **34/34 across two suites**. Broader typecheck/build remains for T5.

T3 complete: Designer Submit replaces separate Save draft controls. It saves and
verifies the returned revision before publication, preserves partial failures and
prevents duplicate/unauthorized submission. The changed collaboration/checklist/
staff-banner suites passed **79/79 tests**. Lost-response recovery now refreshes
the existing collaboration/revision queries after confirming a committed save,
allowing a safe retry instead of leaving Submit blocked.

Browser checks on real workspace components passed one-click save/submission and
publication failure/retry at 1440px and 390px, with no overflow. A dirty-state
approval banner was also corrected in `StaffEstimateCollaboration.tsx` and its
focused tests: the initial approval covers the saved estimate, while unsaved
changes need Submit. Refreshed screenshots were inspected after this correction.

T4 complete: independent integrity review found no confirmed defect in preparation
authorization, save/publication version lineage, unchanged approvals, duplicate
clicks, partial failures or confirmed-save recovery. Product writers have finished.
The adjacent catalogue/revision suites also passed **19/19 tests**.

T5 complete. Consolidated focused tests passed **129/129 frontend tests across six
suites** and **34/34 backend tests across two suites**, using the exact commands
above. Both workspace typechecks and production builds exited 0. Final
`git diff --check` passed. All 2,485 captured source/test/config hashes remained
unchanged during final verification. The frontend build retains its existing
chunks-over-500-kB warning; no test, typecheck or backend build warnings occurred.

Browser recovery follow-up passed: Submit committed version 8 but received a
synthetic 503; no publication ran. Verify saved estimate refreshed the confirmed
state and enabled Submit. Retry saved from version 8 and submitted version 9.
There were no duplicate rows; other-room and internal rows stayed unchanged.
The real-workspace browser fixture used synthetic APIs, not a customer account or
live mail service. Browser session, loopback server on port 4187, fixture files,
screenshots and exact task-owned CLI artifacts were removed after inspection.

Coverage limit noted by review: the new rendered tests do not simulate publication
committing before its response is lost. The inspected path refetches the current
estimate and prevents editing/resubmission when the review committed; existing
backend publication/CAS protections remain unchanged. This is not a confirmed defect.

Handoff: no dependencies, lockfiles, migration, deployment, commits, seeds, real
database writes or real delivery were part of this task. Unrelated full suites,
OCR and lint were not run. Temporary logs, hash inventories and baseline snapshots
were removed after results were recorded here. Refreshed ignored outputs retained
are `backend/dist/`, `frontend/dist/`, `frontend/node_modules/.tmp/` and the existing
Vite dependency cache. Earlier picker, Sales, pricing and kickoff work is preserved.
