# Unique project number after estimate creation: task plan

Date: 2026-11-02
Status: Implemented locally and verified; all five plan tasks completed. One unrelated pre-existing repository test assertion remains failing.
Specification: [Approved design](../specs/2026-11-02-estimate-project-number-design.md), approved by the user on 2026-11-02.
Classification: Substantial, with transactional identity and concurrency risk.

## Follow-up: historical saved-estimate reads (2026-11-02)

- The saved-estimates banner was caused by the read projection treating an old unnumbered, unlinked Lead as a numbering conflict when its estimate retained a stale project ID. Read-only local diagnostics found one such record; no stored data was repaired or changed.
- The existing approved legacy-read requirement is restored: an unnumbered/unlinked Lead returns `projectNumber: null`. Owner checks remain enforced, and numbered or linked-project mismatches still fail explicitly. Allocation and write guards are unchanged.
- Changed only `backend/src/routes/estimates.ts` and added regression coverage in `backend/tests/project-number-mongo.replica-set.test.ts`.
- Verification: the focused replica-set suite passed all 41 tests; backend typecheck and `git diff --check` passed. Read-only review found no blocking issue. Baseline and logs: `/tmp/lisno-saved-estimates-fix/`.
- Backend build also passed. After the user updated the SendGrid key, a no-send SMTP authentication check succeeded. The existing local backend had already restarted after the environment update, so no additional restart was needed. Its health endpoint returned `ok`; the authorized local demo Sales request to `/api/v1/estimates` returned HTTP 200 with all 18 estimates, including 17 unnumbered historical estimates.
- Email diagnosis is separate: the previous no-send SMTP check returned a 451 credit-limit rejection, and the user confirmed the SendGrid trial expired. No emails, invitations, or delivery retries were sent during verification. Estimate/project records were not mutated.

## Approved outcome and boundaries

The first successful estimate save assigns a permanent number such as `Lisno000001`. The save-before-submit path uses the same boundary. Opening the estimator, changing a stage, initiating a project, and creating or retrying an invitation do not allocate a number.

The Lead owns the canonical number, including when its Project does not exist yet. A dedicated global database counter supplies positive safe-integer suffixes, padded to at least six digits. Project and Estimate responses derive the value through stable IDs. UUIDs, project names, permissions, financial amounts, workflow timing, and published artifacts retain their existing roles.

Existing saved estimates remain unnumbered; editing them does not perform a backfill. Once assigned, numbers survive later edits, submission, approval, project linking, renaming, reassignment, and retries. Assignment, estimate creation, counter increment, and assignment audit commit or roll back together.

No dependencies, historical backfill, production index/counter operation, real email, commit, push, or deployment are included. A future release must separately authorize any production operations required by the additive schema/index changes.

## Current implementation evidence

- `backend/src/routes/estimates.ts` saves drafts inside `withMongoTransaction`, which uses `session.withTransaction` and the existing authorization coordination fence. Its Lead lookup currently occurs before the transaction. Number allocation must use a re-read and guarded write inside that transaction.
- The save route distinguishes creation from editing using persisted estimate existence. Preserve that distinction for historical records and preserve existing version/CAS conflicts.
- The route's `estimatorEstimate` mapper and `/estimates` list are separate response paths. The list already batches Lead loading, so adding the reference must not introduce one extra Lead query per list row.
- `LeadModel` already has a partial unique index on linked `projectId`; `adminProjectSummary` projects Lead-owned information onto Project responses. Both memory and Mongo adapters map Lead reads explicitly.
- `LeadEstimateWorkspace` calls `rememberDraftSave` after either a direct save or the save preceding submission. Submission can fail after that save has committed. Cache refresh and display must reflect the committed number even in that case.
- Non-collaborative draft-save invalidation currently covers the Lead detail, saved-estimate list, and project workflow. It does not cover every affected Lead/Admin list. The collaboration refresh helper has broader prefixes and must retain its existing quotation behavior.
- `createLead` and `updateLead` frontend input types derive from the Lead response type. Adding a read-only response property must not accidentally grant it input authority.
- Some existing replica-set estimate tests stub `leads.get` without persisting a Lead and pass an empty audit service. Those fixtures will need real Lead records and a transactional audit collaborator when exercising the new creation boundary; production checks must not be weakened to accommodate them.
- The worktree contains initiation-field changes and quotation/design work across many target files. Capture a fresh baseline before implementation. A prior verification reported an unrelated Mongo repository CAS expectation failure; reproduce and classify current failures rather than assuming historical results are current.

## Ownership and parallelism

No implementation or subagent work starts until this plan is approved and the user selects an execution mode. Mode A uses native Codex agents; Mode B performs the same tasks inline, including review and verification.

| Owner in Mode A | Exclusive write scope |
| --- | --- |
| Primary agent | This plan, integration decisions, and shared public types in `backend/src/repositories/types.ts` and `frontend/src/api/types.ts`. Owns reconciliation of all changes against the baseline. |
| Backend implementer | Number-format helper, sequence model/allocation service, Lead model, estimate route, audit-action registry, backend read projections, OpenAPI, and scoped backend tests. Excludes primary-owned type files. |
| Frontend implementer | Lead/estimate API adapter types and input exclusions, Sales/Admin identity displays, cache refresh behavior, narrowly scoped styles, and corresponding frontend tests. Excludes `frontend/src/api/types.ts`. |
| Integrity reviewer | Read-only review of the integrated task diff after writers finish. |
| Verification runner | Final commands and rendered checks after review fixes; no product-source edits. |

All writers must be told that they are not alone in the codebase, must preserve others' changes, and must return shared-contract changes to the primary agent. No concurrent ownership of a file. A newly discovered path outside an assignment must receive explicit ownership before editing.

Task order: **1 → 2 → 3 → 4 → 5**. Only one parent task is in progress at a time. Task 2A and Task 2B can run concurrently in Mode A after Task 1 fixes the contract; review and final verification follow completed writers sequentially.

## Task 1: Capture baseline and settle implementation contracts

Dependencies: Plan approval and execution-mode selection.
Owner: Primary agent.

1. Inspect applicable instructions, fresh `git status --short`, and relevant per-target diffs. Save the dirty-path inventory and scoped baseline patch outside tracked sources. Explain existing changes to each writer before assigning dirty targets.
2. Run a focused baseline for estimate save, Lead/Admin reads, and the affected frontend workspace. Record existing failures separately. Do not repair unrelated expectations as part of numbering.
3. Trace all draft-creation paths and response mappers, including save-before-submit and later approval/project linking. Confirm the agreed boundary remains the first persisted estimate, without moving legacy Project creation earlier.
4. Add the optional nullable read-only `projectNumber` shape to the primary-owned Lead and Admin response/record types. Keep persistence creation/update input types from admitting arbitrary number assignment. Agree that frontend `EstimateDraft` receives the same field, while request payloads exclude it.
5. Set the backend helper/service boundaries and error categories before writing: format/range validation; singleton counter allocation; conditional first assignment; explicit corrupt-state conflict; bounded infrastructure retry. Keep business version conflicts distinct from counter initialization races.
6. Agree on one assignment audit action and fields: actor, Lead ID, Estimate ID, optional Project ID, committed number, and assignment time. Use the existing transactional audit API.

Completion evidence: baseline captured; contracts and ownership communicated; approved scope unchanged. Supports specification AC 1–6 and 8.

## Task 2: Implement numbering and identification UI

Dependencies: Task 1 complete. Subtasks may run in parallel only in Mode A.

### Task 2A: Backend allocation, projection, and regression coverage

Owner: Backend implementer in Mode A; primary in Mode B.

Affected areas:

- New focused `backend/src/domain/project-number.ts`, `backend/src/models/ProjectNumberSequence.ts`, and `backend/src/services/project-number.service.ts`.
- `backend/src/models/Lead.ts`, `backend/src/routes/estimates.ts`, and `backend/src/domain/audit-actions.ts`.
- `backend/src/repositories/memory.ts`, `mongo.ts`, and `admin-project-summary.ts`.
- `backend/src/routes/leads.ts` and `backend/src/services/lead.service.ts` only where needed to prohibit number overrides and preserve existing values.
- `backend/src/openapi.ts` for the affected existing response schemas.
- New `backend/tests/project-number.test.ts` and `backend/tests/project-number-mongo.replica-set.test.ts`.
- Existing estimate-save, approval/lineage, Lead, Admin summary, repository, API-doc, and invitation tests listed under verification. Additional fixture updates require an explicitly assigned path.

Work:

1. Implement exact `Lisno` formatting, positive safe-integer validation, six-digit minimum padding, and expansion beyond six digits. Reject malformed issued values and sequence overflow explicitly.
2. Add the nullable Lead field with validation and partial uniqueness for string-valued numbers. Make first assignment possible through one guarded server-only path, then prohibit ordinary model/repository/API updates from clearing or changing it. Test actual Mongoose update behavior so schema immutability does not silently block initial assignment.
3. Add the dedicated singleton counter with atomic increment inside the caller's session. Initialize only when no numbers have been issued. Detect missing, malformed, stale, or otherwise inconsistent counter state without resetting it, using record counts as identifiers, or scanning unrelated client data into responses.
4. In the estimate-create transaction, re-read and fence the Lead; validate current ownership and Lead/Estimate/Project lineage before assignment. Preserve the existing authorization coordination, pricing validation, collaborative fences, and CAS logic. Reuse a valid existing number rather than allocating again. An already-persisted historical estimate with no number remains unnumbered.
5. Allocate late enough that validation is complete, save the estimate, assign the number, and append the audit event in the same transaction. Reuse the current transaction helper and driver retry behavior. Add only bounded, targeted handling for demonstrated initialization races; do not retry or mask unrelated business conflicts.
6. Return the canonical committed value on estimate save/read/list and Lead/Admin list/detail responses. Reuse already-loaded Leads where possible and batch list joins by stable IDs. Normalize absence to `null`. Do not copy the number into writable Project or Estimate persistence, approved snapshots, PDFs, or mail artifacts.
7. Keep memory and Mongo read/update projections aligned. Ensure general Lead mutations retain a number and cannot assign a new one. Handle contradictory lineage explicitly rather than selecting a plausible name or silently choosing among conflicting links.
8. Document the nullable response field as read-only in OpenAPI without adding a writable property or new route. Reject or safely exclude forged number fields under the existing validation conventions, with proof that no mutation occurs.
9. Add real replica-set tests for clean start, two asymmetric projects, same/different-Lead simultaneous creation, cold-counter races, transaction rollback, audit failure, retry after commit, existing-number reuse, historical estimates, overflow, and corrupt counter/lineage. Assert persisted counter, Lead, Estimate, and audit state after failures.
10. Prove legacy unlinked creation followed by approval exposes the same number after Project linking. Prove unauthorized identities cannot cause allocation or read another project's number. Cover initiation, invitation, previews, and stage changes as non-triggers.
11. Update existing mocked save fixtures only as required to represent real persisted Leads and transactional audits. Preserve their original pricing/workflow assertions and avoid adding test-only bypasses to production code.

Completion evidence: focused tests establish allocation, rollback, immutability, authorized projections, and historical compatibility. Supports AC 1–6 and 8.

### Task 2B: Frontend display, committed cache updates, and interaction tests

Owner: Frontend implementer in Mode A; primary in Mode B.

Affected areas:

- `frontend/src/features/leads/leadsApi.ts`.
- `LeadEstimateWorkspace.tsx`, `LeadDetail.tsx`, and `LeadDashboard.tsx` in the same feature.
- `frontend/src/features/admin/AdminProjectsPage.tsx` and `AdminProjectDetailPage.tsx`.
- `frontend/src/features/leads/estimateCollaborationQueries.ts` only if needed to reuse the established refresh behavior without altering quotation invalidation semantics.
- Existing styles for those identity areas, limited to necessary wrapping and spacing.
- Their existing test files and a focused numbering test file if the scenario needs isolation.

Work:

1. Add optional nullable `projectNumber` to estimate responses. Explicitly exclude it from Lead create/update input types and estimate input types; submit only existing writable fields.
2. Show `Project number: Lisno000001` next to the project name in the estimator, Sales detail/list, and Admin detail/list/grid. Detail and estimator areas show `Project number not assigned` for absent values; lists may omit the line. Preserve the name as the main identity and show the number as selectable text.
3. Use the committed save result immediately in the estimate cache. Refresh affected Lead list/detail, saved-estimate, Admin project list/detail, and existing summary caches for both collaborative and non-collaborative saves. Preserve established unrelated refresh behavior.
4. Refresh identity data when the draft save succeeds even if the subsequent submission fails. A later response that omits the optional field must not erase a known committed number. A failed draft save must not fabricate a number. Scope cache writes to the submitted Lead ID if the user navigates during the request.
5. Keep existing loading, empty, permission, pending, error, and retry states. Use current typography and layout; add no icons, cards, animations, or dependencies. Verify wrapping with long names and numbers longer than six digits.
6. Add rendered interaction tests for first save, refresh/navigation, save-before-submit, submission failure after successful save, draft-save failure, retry, historical/omitted fields, rename, and distinct projects. Assert cache invalidation and request payloads, not just static snapshots. Cover both Admin presentations and accessible identity text.

Completion evidence: correct committed value appears consistently across the specified screens, including failure and navigation cases. Supports AC 2, 3, 6, and 7.

## Task 3: Integrate and review

Dependencies: Both Task 2 writers finished; no concurrent product writes.
Owner: Primary, with read-only `integrity_reviewer` in Mode A.

1. Inspect task-only changes against the captured baseline and preserve initiation/quotation/design work.
2. Review the transaction from authorization and current Lead read through counter, conditional assignment, estimate persistence, audit, commit, and response. Check cold-start retry bounds, uniqueness, sequence exhaustion, rollback, and immutable reuse.
3. Review asymmetric ownership/lineage and legacy Project linking. Confirm response enrichment cannot disclose references across unauthorized links and cannot rewrite approved artifacts.
4. Review missing historical values, memory/Mongo consistency, read-only input types, and OpenAPI. Confirm no invitation or initiation trigger was introduced.
5. Review cache writes after direct save, partial submit success, response omission, and navigation; inspect every requested list/detail representation and narrow layout.
6. Resolve confirmed findings in their owned paths and rerun affected focused tests before final verification.

Completion evidence: review findings and resolutions recorded; no unresolved acceptance-criteria defect. Supports all ACs.

## Task 4: Final integrated verification

Dependencies: Review complete and all fixes integrated.
Owner: `verification_runner` in Mode A; primary in Mode B.

Run the following on the settled worktree. Independent backend/frontend groups may run concurrently; repeat checks only after relevant changes or unresolved failures.

Backend focused and contract checks, from `backend/`:

```sh
npm test -- tests/project-number.test.ts tests/leads.test.ts tests/admin-projects.test.ts tests/admin-project-summary.test.ts tests/mongo-repository.test.ts tests/api-docs.test.ts tests/project-client-invitations.test.ts
npm test -- tests/project-number-mongo.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts tests/project-client-invitations-mongo.replica-set.test.ts
npm test -- tests/estimation-lifecycle.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts
npm run typecheck
npm run build
```

Frontend checks, from `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx
npm run typecheck
npm run build
```

Include any new focused UI tests in that command group. Broaden to additional response-consumer or full suites only if implementation impact or failures justify it. Record exact commands, counts, failures, and unrun checks. No lint script exists.

Rendered verification:

- Use the browser QA skill and local application with synthetic records and fake/disabled delivery. Exercise real save/read APIs against a disposable replica set for the integrated numbering flow; mocked UI states can supplement failure cases but cannot substitute for transactional evidence.
- Check approximately 390px and 1440px widths, plus a tablet width if identity wrapping reveals an issue. Visit estimator, Sales list/detail, and Admin list/grid/detail.
- Create estimates for two distinct synthetic projects; verify different numbers and identical references across each project's views after navigation and refresh. Confirm an initiated but unsaved project and a historical estimate show the unassigned state.
- Exercise direct draft save, save-before-submit, failed draft save, submission failure after a successful save, and retry. Confirm numbers remain correct and no unrelated project cache is overwritten.
- Inspect wrapping, selectable text, accessible names, keyboard navigation, horizontal overflow, browser console, and API failures. Keep screenshots/logs in ignored temporary storage and record paths without sensitive data.

Run `git diff --check` and `git status --short` at the repository root. Compare scoped final diffs with the baseline. Do not describe partial verification or baseline failures as a fully passing result.

Acceptance trace:

| Spec AC | Evidence required |
| --- | --- |
| 1 | Formatter boundaries plus actual first/second allocation and persisted readback. |
| 2 | Non-trigger route assertions, direct-save and save-before-submit interaction tests. |
| 3 | Reuse/immutability tests, forged-input checks, historical no-backfill, lifecycle and rename coverage. |
| 4 | Replica-set races, bounded retries, rollback/fault injection, counter and audit assertions. |
| 5 | Unlinked Lead creation then approval/Project readback, contradictory links, asymmetric authorization. |
| 6 | Lead/estimate/Admin projections, memory/Mongo parity, update preservation, API documentation. |
| 7 | UI tests, cache/navigation/failure checks, desktop/mobile rendered evidence. |
| 8 | Integrated command results, builds/typechecks, review, hygiene, and explicit remaining limits. |

## Task 5: Handoff

Dependencies: Final verification complete, or an explicit account of unresolved blockers.
Owner: Primary agent.

Update this plan with implementation status, affected files, exact verification results, reviewer findings, baseline failures, unrun checks, and temporary artifact locations. Report the first-save trigger, global immutable numbering, historical-data behavior, and remaining release work concisely.

No live migration, counter repair, index operation, backfill, customer communication, commit, push, or deployment is performed under this plan. Rollback guidance retains issued numbers, counter high-water state, and uniqueness protections.

## Execution record

- Specification approved by the user on 2026-11-02.
- Task plan approved and Mode A selected by the user on 2026-11-02.
- Baseline captured at `/tmp/project-number-baseline-status.txt`, `/tmp/project-number-baseline.patch`, and `/tmp/project-number-baseline-files/` before writers started.
- Primary-owned Lead/Admin response types now expose optional read-only `projectNumber`; repository create/update types exclude it.
- Backend/frontend agents are inspecting scoped baseline diffs and running focused baseline checks. An independent read-only audit is checking transactional integration.
- Task 1 complete: frontend baseline 115 tests passed; backend baseline `npm test -- tests/leads.test.ts tests/admin-projects.test.ts tests/api-docs.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts` passed 247 tests. The initial sandboxed backend attempt failed to open local sockets; the approved rerun supplied the definitive result.
- Task 2 backend ownership split: the core backend agent owns formatter/parser, Lead/sequence models, allocation service, estimate route, audit action, numbering/transactional and estimate-fixture tests. A second backend agent owns memory/Mongo/Admin projections, Lead-service input guards, OpenAPI, and the associated Lead/Admin/repository/API-doc/invitation unit tests. Neither edits the primary-owned public type files.
- Frontend Task 2B completed: seven focused suites passed 149 tests and frontend typecheck passed. Browser verification and final integrated checks remain pending.
- Read-only transaction audit confirmed the need for current Lead reads and guarded first assignment; Mongoose immutable fields require a scoped `overwriteImmutable` option for that assignment. Ordinary repository/service inputs must reject number overrides at runtime.
- Task 2 complete: backend allocation and read projections implemented; frontend retry error corrected after browser evidence. Counter recovery checks include assignment-audit high-water metadata after Lead deletion. A partial audit index limits these checks to assignment events. All writers are frozen for integrated review.
- Interim browser evidence: actual Mongo-backed saves returned `Lisno000001` and `Lisno000002`; Sales/Admin navigation returned matching values; failed save left the number absent; save-before-submit retained the committed number on submission failure; historical edit returned null. Grid/list and estimator layouts have no horizontal overflow at 390px and 1440px. Final settled-code browser checks remain in Task 4.
- Integrated reviewer identified two P2 edge cases: a filtered Sales list query whose search text is `estimate` was excluded by an overly broad invalidation predicate; a partially restored Lead missing its issued number could be renumbered despite its surviving assignment audit. Both fixes and regression tests are implemented. The frontend focused suite passed 55 tests; backend formatter/replica suites passed 60 tests. Focused reviewer follow-up confirmed both fixes.
- Browser checks on the integrated UI confirm the corrected error state after failed Save then saved-draft/failed Submit; retry publishes successfully with disabled email and preserves `Lisno000002`. Historical edit remains null. Actual estimator, Sales list/detail, Admin list/grid/detail were exercised at 390px and 1440px with no horizontal overflow. Evidence: `/tmp/lisno-project-number-qa/results.json` and `final-*.png`. The synthetic Super Admin shell requests an unrelated project-manager notification endpoint which returns 403; number-related routes succeeded.
- Integrity follow-up confirmed both findings resolved with no residual defect. The verification runner completed the final scoped test groups, typechecks, builds, and hygiene checks on the settled product sources; results follow.


## Final implementation and verification results

Completed on 2026-11-02 in Mode A. The first successful estimate creation assigns a server-owned `Lisno` number. The Lead remains the sole stored source, while Estimate and Admin responses expose its value by stable ID. Number, estimate, sequence increment, and assignment audit commit together. Normal mutation paths cannot override the number. Historical saved estimates remain unnumbered.

The dedicated sequence validates safe-integer format and high-water state against both Leads and retained assignment audits. Per-Lead audit checks reject contradictory recovery data rather than renumbering. A unique partial Lead index prevents collisions, and a partial audit index keeps issuance checks separate from unrelated audit history. There are no new dependencies.

Principal affected areas:

- Backend allocation: `src/domain/project-number.ts`, `src/models/ProjectNumberSequence.ts`, `src/services/project-number.service.ts`, `src/routes/estimates.ts`, `src/models/Lead.ts`, `src/models/AuditEvent.ts`, and `src/domain/audit-actions.ts`.
- Backend read/input contracts: `src/repositories/types.ts`, `memory.ts`, `mongo.ts`, `admin-project-summary.ts`, `src/services/lead.service.ts`, and `src/openapi.ts`.
- Frontend: `src/api/types.ts`, `features/leads/leadsApi.ts`, `LeadEstimateWorkspace.tsx`, `LeadDashboard.tsx`, `LeadDetail.tsx`, `features/admin/AdminProjectsPage.tsx`, `AdminProjectDetailPage.tsx`, and four scoped stylesheets.
- Regression coverage: two new numbering suites and scoped updates to existing Lead, repository, Admin, API-documentation, catalogue, approval, and frontend suites. Exact task paths and isolated diff are recorded under `/tmp/project-number-task-paths.json` and `/tmp/project-number-task-only.patch`.

Final unique scoped results: **467 backend tests passed and 150 frontend tests passed; one unrelated pre-existing Mongo repository assertion remains failing.** The passing backend tests include 22 numbering domain tests and 38 actual replica-set numbering tests. Both workspace typechecks and production builds passed. Integrity review findings were fixed and independently re-reviewed with no residual defect.

| Directory | Exact command | Exit | Result |
| --- | --- | --- | --- |
| `backend` | `npm test -- tests/project-number.test.ts tests/leads.test.ts tests/admin-projects.test.ts tests/admin-project-summary.test.ts tests/mongo-repository.test.ts tests/api-docs.test.ts tests/project-client-invitations.test.ts` | 1 | 288 passed, 2 failed initially; see targeted rerun below |
| `backend` | `npm test -- tests/leads.test.ts` | 0 | 48 passed, 0 failed after obsolete Project lookup-count assertion was corrected |
| `backend` | `npm test -- tests/project-number-mongo.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts tests/project-client-invitations-mongo.replica-set.test.ts` | 0 | 136 passed, 0 failed |
| `backend` | `npm test -- tests/estimation-lifecycle.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts` | 0 | 42 passed, 0 failed |
| `backend` | `npm run typecheck` | 0 | Passed |
| `backend` | `npm run build` | 0 | Passed |
| `frontend` | `npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadDetail.test.tsx src/features/leads/LeadDashboard.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx` | 0 | 150 passed, 0 failed |
| `frontend` | `npm run typecheck` | 0 | Passed |
| `frontend` | `npm run build` | 0 | Passed |
| `.` | `git diff --check` | 0 | Passed |
| `.` | `git status --short` | 0 | Passed |

The remaining failure is `backend/tests/mongo-repository.test.ts:924`, “uses legacy-aware version-one CAS then exact incrementing Mongo CAS.” Its expected filter omits `deletedAt: null`; the verifier confirmed that HEAD already contains that production filter and this task did not change the assertion. The repository is not wholly green. The other initial failure expected three Project lookups; the new early lineage guard correctly rejects the third request before querying Project. The assertion was changed to two and all 48 Lead tests passed on rerun. No product code changed after that verification failure.

Browser validation used the actual app and APIs with synthetic users in a disposable Mongo replica set, disabled email, Chrome 156, DPR 1, and 390×844 / 1440×1000 emulated viewports. Verified keyboard first save, numbers 1 and 2 for distinct projects, failure without an optimistic number, successful save followed by failed submission, corrected error display, successful submission retry, navigation/refresh across Sales and Admin, historical edits retaining null, and grid/list/detail wrapping without horizontal overflow. Screenshots were visually inspected. The synthetic Super Admin shell's unrelated project-manager notification endpoint returned 403; numbering routes succeeded. These checks are not physical-device or production-performance benchmarks.

Evidence and cleanup:

- Exact command metadata: `/tmp/project-number-final-results.json`; logs: `/tmp/project-number-final-*.log`.
- Browser scenarios, conditions, limitations, and screenshot inventory: `/tmp/lisno-project-number-qa/results.json`.
- Task-created browser sessions and the disposable QA server/database were stopped. Task-created console and snapshot files were moved outside tracked sources.
- Builds generated ignored `backend/dist`, `frontend/dist`, and frontend TypeScript caches. No runtime artifacts were staged or committed.
- Final hygiene passed. All 181 baseline dirty paths remain; the 16 additional dirty paths are within this task. Unrelated initiation and quotation/design work was preserved.

Unrun checks and release limits: full unrelated backend/frontend suites, OCR suites, physical-mobile testing, and production-scale allocation performance were not run. There is no lint script. Existing Mongoose `new` deprecation warnings and frontend large-chunk warnings remain. No live index operation, counter repair, historical backfill, migration, real email, commit, push, or deployment was performed. Production rollout must retain issued numbers and counter high-water state, verify data conflicts, and ensure the additive uniqueness/audit indexes are present under separately authorized release operations.
