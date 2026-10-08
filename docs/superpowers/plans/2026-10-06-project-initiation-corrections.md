# Project initiation corrections: task plan

Date: 2026-10-06
Status: Implemented and verified in Mode A
Specification: [Approved design](../specs/2026-10-06-project-initiation-corrections-design.md), approved by the user on 2026-10-06.

## Scope

Implement the five approved corrections: remove initiation budget/location inputs, share the existing property-type choices, fix and style the next-action calendar, and remove recommendation-added selections when their last source is deselected. No unrelated workflow or visual changes.

## Ordered tasks and ownership

### T1. Capture baseline and confirm the failing paths

Owner: primary agent. Dependencies: execution mode selected.

- Capture the initial dirty-path set and relevant file diffs before any writer starts. Preserve the existing changes in initiation, estimate selection, models, API contracts, and tests.
- Reproduce the current recommendation-modal add/remove flow. Check origin assignment, source removal, selected-items rendering, catalogue refresh, and saved hydration. Record the actual failing boundary; do not replace the existing cascade helper without evidence.
- Inspect shared overlay dismissal/focus behavior before implementing the scoped calendar. Confirm where model validation needs to accept an absent location/client address.
- Run only the focused baseline checks needed to establish the failure. Keep one parent implementation task in progress.

Acceptance: confirmed affected paths and ownership; no unrelated edits. Traces to AC1, AC3, AC4.

### T2. Establish compatible initiation contracts and the shared property list

Owner: primary agent. Dependencies: T1.

- Update only `InitiateProjectFields` in `frontend/src/api/types.ts` so location and both budgets are optional, matching the approved backend contract.
- Extract the current ten property options into a shared frontend constant and switch the estimate workspace to that constant without changing displayed options or legacy values.
- Settle the backend contract: missing budgets become `null`; absent location and client address use empty strings; supplied legacy values remain valid. No fabricated address or budget. Keep other endpoints' existing required-field validation.
- Finish the shared `LeadEstimateWorkspace.tsx` import change before assigning that file to the recommendation writer.

Acceptance: one option source, compatible request types, no changes to other API shapes. Traces to AC1, AC2.

### T3. Support omitted initiation fields through persistence

Owner in Mode A: backend implementer; in Mode B: primary agent. Dependencies: T2.

Owned paths:

- `backend/src/routes/admin-projects.ts`
- `backend/src/services/admin-project.service.ts`
- `backend/src/models/Project.ts` and `backend/src/models/Lead.ts`, limited to the necessary absent-address accommodation
- `backend/src/openapi.ts`, limited to the initiation request contract
- `backend/tests/admin-projects.test.ts`, `admin-projects-mongo.replica-set.test.ts`, `sales-initiated-projects.test.ts`, and focused API-contract coverage

Work:

- Accept omitted location/budget inputs; preserve validation for supplied values, including non-negative budgets and range order when both bounds exist.
- Persist the approved absence representation in the existing transaction while retaining assignments, grants, audit records, and return shapes.
- Verify both assignment modes, omitted fields, legacy populated requests, invalid supplied budgets, and actual Mongo persistence.
- Verify other lead/project creation routes still enforce their current required fields. Do not relax those routes or add a migration.

Acceptance: initiation works without hidden inputs in memory and Mongo; legacy callers and other creation flows remain compatible. Traces to AC1, AC5.

### T4. Simplify the initiation form and implement its calendar

Owner in Mode A: frontend implementer; in Mode B: primary agent. Dependencies: T2. Can run alongside T3 and T5.

Owned paths:

- `frontend/src/features/admin/AdminProjectInitiationDialog.tsx` and its test
- A feature-local next-action date/time component, its styles, and focused tests as needed
- Initiation-specific caller tests only if their interactions require updating

Work:

- Remove the three inputs, validation, and generated payload fields. Keep Project city and all remaining initiation behavior.
- Render a required property dropdown from the shared constant, using existing form primitives and accessible labeling.
- Replace this form's native calendar popup with the scoped calendar plus labeled time input. Date selection, outside click, Escape, and trigger toggle dismiss reliably. Preserve local date/time and ISO conversion, keyboard navigation, focus restoration, validation, and pending-submit states.
- Add a restrained 160–200 ms opacity/vertical transition with reduced-motion support and cleanup. Scope CSS so other controls are unaffected; add no dependency.
- Test submission in both assignment modes, exact omitted payload fields, property choices, calendar dismissal/reopen, month boundaries, time preservation, and parent-panel behavior.

Acceptance: the approved compact form works without hidden validation blockers; the calendar closes reliably. Traces to AC1, AC2, AC3, AC5.

### T5. Correct recommendation deselection at the demonstrated failure

Owner in Mode A: frontend recommendation implementer; in Mode B: primary agent. Dependencies: T1 and completion of T2's workspace edit. Can run alongside T3 and T4.

Owned paths:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `configuredEstimate.ts`, `ConfiguredEstimateBuilder.tsx`, or `EstimatorRecommendations.tsx` only where the reproduction identifies a defect
- Corresponding recommendation interaction and helper tests

Work:

- Add a failing regression for selecting POP, adding painting through the actual modal, then unchecking POP and checking the selected-items view and totals.
- Repair the existing origin/cascade or rendering path at that boundary. Preserve manual selections, another room, surviving sources, saved origin, draft field values, and existing modal dismissal rules.
- Verify basket removal, chained dependencies, save/reload, and catalogue refresh using existing coverage plus targeted additions.
- If reproduction identifies a backend contract defect, report it to the primary agent before touching backend files; the backend owner handles any approved correction sequentially.

Acceptance: recommendation-only items are unselected and absent from selected scope after their last source is removed, without deleting catalogue items or altering unrelated selections. Traces to AC4, AC5.

### T6. Integrate, review, and verify

Owner: primary agent; in Mode A use an integrity reviewer after writers finish, then a verification runner after review findings are resolved. Dependencies: T3–T5.

- Review the integrated diff against the captured baseline and all five acceptance criteria. Resolve confirmed findings before final verification.
- Run focused suites, then typechecks/builds for both affected workspaces. Use replica-set integration tests for initiation persistence. Do not run a broad full suite unless a concrete shared risk requires it.
- Perform rendered desktop/mobile checks for form layout, dropdown, calendar selection/dismissal/focus, and reduced motion. Verify the POP/painting flow with isolated test data; do not create a live project or alter a real estimate for QA.
- Run repository hygiene checks. Report exact results, unrun checks, generated temporary output paths, and remaining limitations. No commits, deployments, seeds, migrations, or production writes.

## Verification commands

From `backend/`:

```sh
npm test -- tests/admin-projects.test.ts tests/sales-initiated-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/leads.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

From `frontend/`:

```sh
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx
npm run typecheck
npm run build
```

Include any new calendar interaction test in the focused frontend run. Run estimate replica-set tests only if its persistence/normalization path changes. At repository root, run `git diff --check` and `git status --short`. There is no lint script.

## Execution boundary

This plan records the approved specification; it authorizes no production actions. After task-plan approval, the repository workflow requires the execution-mode choice. Mode A assigns only the non-overlapping paths above; Mode B performs the same work inline. Every writer must preserve existing and concurrent work and return dependencies to the primary agent rather than crossing ownership boundaries.


## Implementation results

### Authorized follow-up: date only

The user subsequently requested removing Time from the initiation side panel. Removed the input and its layout column; calendar selection supplies the complete required date. The form converts that local date to the start of the day in the existing ISO timestamp contract. Updated existing rendered form/calendar tests to prove submission requires no time and preserves the chosen local date. Backend scheduling and other screens are unchanged. Follow-up baseline: `/tmp/lisno-initiation-date-only-baseline`.

Follow-up verification: `TZ=Asia/Kolkata npm test -- src/features/admin/NextActionDateTime.test.tsx src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/AdminProjectsPage.test.tsx` passed **32/32 tests**; frontend typecheck and `git diff --check` passed. Build and backend suites were not repeated for this bounded frontend removal.

### Submission regression follow-up

The user reported `ESTIMATE_PUBLICATION_RECOVERY_FAILED` from estimate submission. Tracing and local model validation identify the missed downstream constraint: `EstimateClientReviewRound.estimateSnapshot.location` used Mongoose's nonempty required String validator, rejecting the now-valid empty initiation location. The publication transaction wraps the resulting validation failure in the reported recovery error. Fix only that snapshot constraint, retaining required string presence and immutability. The backend owner handles model and publication/model regression tests; primary performs read-only diagnosis and documentation; integrity review and focused verification follow. Baseline is `/tmp/lisno-publication-location-baseline`. No live submission, migration, or recovery-guard change is authorized or needed.

The affected lead was inspected read-only: empty location, absent budgets, estimate draft version 2, and zero publication rounds. The fix accepts an empty immutable snapshot location and rejects missing/null values in snapshot validation. New model and Mongo replica regressions reproduce the original failure and cover both draft and ready-for-client publication after actual project initiation, one stored PDF/round/delivery, duplicate protection, and downstream client approval. Integrity review found no remaining defect. Model **77/77** and publication replica **16/16** tests passed; backend typecheck/build and diff hygiene passed. The broader publication unit run had **25 passed, 2 failed**; both configured-line timeouts were reproduced with the pre-fix model in an isolated copy and left unchanged. No live publication/email or data repair was performed.

### Repeated submission failure: configured recommendation metadata

The earlier location fix did not cover the user's configured-line shape. Read-only inspection of the affected estimate (now draft version 3) found four included configured lines: one with empty recommendation origins and three with populated origins. `toEstimateSnapshot` spread these draft fields into a strict frozen schema. Local validation of the actual stored shape reproduced `StrictModeError` at `recommendationSourceMainLineIds`; removing only that field allowed the full snapshot to validate. All four saved Configuration references matched current source metadata. Real compact PDF generation succeeded in memory, with no storage or live database writes.

- Backend owner: explicitly project supported publication fields in `estimate-publication.service.ts`, preserving immutable identifiers, provenance, classifications, and integer paise. Add four replica regressions for draft/ready status and empty/populated origins, each with blank location. Preserve origin metadata on the editable estimate. Baseline: `/tmp/lisno-publication-origin-baseline`.
- Verification owner: repair the two snapshot-focused unit fixtures to use the approved publication status; their old draft fixtures reached unmocked Configuration queries. Draft Configuration fences remain covered by replica tests. Baseline: `/tmp/lisno-publication-unit-baseline`.
- Primary: validate the affected data read-only, confirm local watcher reload, review the integrated diff, and record results. Integrity reviewer audits the mapper boundary. Final verification is limited to publication unit/replica tests, snapshot models, backend typecheck/build, and diff hygiene following the user's request to check only submission.

Before final integration, publication replica **20/20** and publication unit **27/27** passed. The local backend watcher reloaded the corrected source. No client submission, external email, migration, or live data repair was performed.

Final integrated submission checks passed: **124/124** tests across `estimate-publication.test.ts` (27), `estimate-publication-mongo.replica-set.test.ts` (20), and `estimate-client-review-models.test.ts` (77). Backend typecheck, build, and `git diff --check` passed. The initial sandbox attempt could not bind the ephemeral replica-set port; the authorized rerun passed. Integrity review confirmed all 30 frozen line fields are mapped without field loss or unknown fields. Local backend health returned HTTP 200 after automatic reload. Logs: `/tmp/lisno-submission-final-tests.log`, `/tmp/lisno-submission-final-typecheck.log`, `/tmp/lisno-submission-final-build.log`. Full repository suites and live client submission were not run.

### Initial implementation results

- Removed initiation Location/Minimum budget/Maximum budget UI, validation, and generated fields. Optional initiation contract persists empty address/location and null budgets; other creation endpoint validation remains intact.
- Shared `frontend/src/features/leads/propertyTypes.ts` supplies the existing ten values to both initiation and estimate configuration.
- Added scoped `NextActionDateTime.tsx` and CSS with an inline calendar, separate required time, keyboard month/day navigation, selection/outside/Escape dismissal, focus restoration, 180 ms transition, and reduced motion.
- Root cause of recommendation display defect: Selected mode filtered rooms but continued to render unchecked lines inside those rooms. Corrected row/group/navigation filtering in `ConfiguredEstimateBuilder.tsx`. Reset a basket filter when its basket disappears so remaining selected scope remains visible. Existing room-scoped origin/cascade/save logic was retained.
- Added a rendered regression with an independent light remaining selected after POP/painting removal, a currently filtered POP basket, and verification that painting's draft quantity remains available unchecked in By Section.

### Verification evidence

- Frontend focused command above plus `src/features/admin/NextActionDateTime.test.tsx`: **6 suites, 79/79 tests passed**. Frontend typecheck and production build passed. Vite retains its existing large-chunk advisory; AdminProjectsPage tests emit MSW warnings for unrelated daily-critical-tasks/chat-availability reads.
- Backend initiation, Sales initiation, Mongo replica, and API documentation suites: **130/130 passed**. Backend typecheck/build passed.
- The full planned backend focused command including `leads.test.ts`: **168 passed, 4 failed**. All four failures are older estimate DTO expectations (`isIncomplete` and `selectedMainBasketClassifications`), reproduced with pre-task source snapshots in an isolated copy. No changes were made to those tests or estimate serialization.
- Integrated integrity review resolved the hidden basket-filter case and a calendar Escape timing issue. Final verification ran after the fixes.
- Browser QA used the actual form and estimate workspace with synthetic read responses in an isolated local page. Verified desktop and 390×844 mobile layout, date selection and Escape, preserved time through a date change, no horizontal overflow, and POP → recommended painting → Selected → POP deselection leaving only the independent light and ₹413 total. No browser console errors observed in this flow.
- Temporary preview source under `frontend/output/initiation-qa/` was deleted, its tab closed, and the viewport reset. Initial source snapshots are under `/tmp/lisno-initiation-baseline`; logs are `/tmp/lisno-initiation-frontend-tests.log`, `/tmp/lisno-initiation-recommendations.log`, and `/tmp/lisno-initiation-final-build.log`. Ordinary ignored build outputs remain in `frontend/dist` and `backend/dist`.
- `git diff --check` passed. No lint script exists. Full repository suites were not run; no dependencies, migration, deployment, commits, live project/estimate writes, or external communication occurred.
