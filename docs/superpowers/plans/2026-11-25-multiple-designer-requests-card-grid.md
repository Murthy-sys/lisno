# Multiple Designer requests and compact cards: task plan

Date: 2026-11-25
Status: Complete; verified and enabled on local `lisno_demo` after explicit user approval
Specification: [Approved design](../specs/2026-11-25-multiple-designer-requests-card-grid-design.md)
Specification approval: User replied “Approved” on 2026-11-25.
Execution mode: A, parallel sub-agents, selected by the user on 2026-11-25.

## Delivery outcome

Super Admin can request several Designers for one project through individual cards. The first valid acceptance commits the assignment and closes competing pending requests atomically. Desktop shows four cards per row, with two/one columns at smaller widths.

The implementation preserves current ranking, approved artifacts, Client handoff, existing appointments, kickoff gates, and assignment permissions. No new dependency is planned.

## Dependency order and ownership

Only one parent task is in progress at a time. In Mode A, the independent work packages within Task 2 may run concurrently. In Mode B, the primary agent executes all packages sequentially.

### Task 1: Capture the baseline and settle shared contracts

Owner: Primary agent.
Dependencies: Approved plan and selected execution mode.
Acceptance criteria: AC1, AC4, AC6, AC7, AC8.

- Capture current dirty paths, relevant tracked diffs, and copies of relevant untracked files before any writer starts. Preserve the completed assignment/handoff and profile changes as the new baseline.
- Confirm existing assignment/source coordination, transaction boundaries, request serializers, and all singular-pending consumers through focused reads. Resolve implementation details within the approved behavior.
- Update `backend/src/contracts/designer-assignment.ts` and its shared export as needed:
  - `pendingRequests` collection for suggestions and internal evidence.
  - Deprecated external `pendingRequest`: sole pending request when exactly one exists, otherwise `null`.
  - Nullable typed `closureReason` distinguishing `assigned_elsewhere` and `cancelled_by_admin`; absent historical fields serialize safely.
  - Closed-request responses expose no other candidate identity.
- Update `backend/src/models/DesignerAssignmentRequest.ts` for the closure field and partial unique `{ projectId: 1, designerId: 1 }` index named `one_pending_designer_request_per_project_designer`.
- Document the agreed contract, index name, and ownership boundaries for each work package. Do not execute an index transition against an existing database.

Completion evidence: Baseline recorded; every writer has the same contract and explicit file ownership.

### Task 2: Implement the independent work packages

Dependencies: Task 1 complete.

#### 2A. Transactional requests and first acceptance

Owner in Mode A: Backend implementer.
Files: `backend/src/services/designer-assignment.service.ts`, `backend/src/routes/designer-assignment.ts` if needed, and `backend/tests/designer-assignment*.test.ts`. The existing internal assignment helper in `project-workflow.service.ts` may be changed only if necessary and explicitly coordinated with the primary agent.
Acceptance criteria: AC1, AC2, AC3, AC4, AC6.

- Allow requests to different Designers while preventing duplicate pending project/Designer pairs.
- Keep project eligibility separate from individual candidate state. Return all project pending requests independently of suggestion search/pagination.
- Preserve idempotency, source revisions, actor eligibility, request versions, narrow previews, and current assignment until acceptance.
- Serialize acceptance with competing acceptance and creation through the existing transaction/project coordination mechanisms.
- Commit assignment effects, winner decision, competing pending closures, and audits together. Include older-source pending requests in closure; do not change already terminal requests.
- Preserve decision identity and causal audit data for automatic closure. Do not copy winner decision keys to siblings.
- Return understandable conflicts for late or stale decisions, with no winner identity disclosed to a losing Designer.
- Implement plural evidence reads using the shared contract. Keep accepted-request matching tied to the current actual assignment.
- Add meaningful regressions for distinct pending targets, duplicate target/retry, simultaneous acceptances, create/accept and cancel/decline races, stale source, transaction rollback, and replay of the winning acceptance.

#### 2B. Compact cards and independent actions

Owner in Mode A: Frontend implementer.
Files: `frontend/src/features/admin/DesignAssignmentPanel.tsx` and its test; `frontend/src/features/designer/designerHandoff.css`, `DesignerAssignmentInbox.tsx` and its test, `designerAssignmentApi.ts`; affected frontend assignment fixtures/tests, including `frontend/src/test/fixtures/enterpriseTransport.ts` and `AdminProjectDetailPage.test.tsx`.
Acceptance criteria: AC4, AC5, AC6.

- Join pending requests to cards using stable Designer IDs. Remove the project-wide pending-request disable condition.
- Render simple four-column desktop cards, two-column tablet, and single-column mobile layouts with the existing visual tokens. Check actual Admin section CSS specificity.
- Show compact name, workload, language, location, match information, and per-card send/pending/cancel/assigned state.
- Keep pending requests accessible and cancellable when search or pagination hides their Designer cards. Label each cancellation with the correct Designer name.
- Preserve mutation retry/idempotency behavior; after one request completes, another eligible Designer remains actionable.
- Refresh all affected caches and reconcile stale or closed Designer decisions without exposing other candidates.
- Cover loading, empty, unavailable, unauthorized, long-content, error/retry, search/page, and keyboard states through focused rendered tests.
- Keep Client phase panels, appointment scheduling, and countdown behavior unchanged.

#### 2C. Narrow index transition and rollback preparation

Owner in Mode A: Backend implementer dedicated to migration files.
Files: New `backend/src/migrations/designer-assignment-request-index.ts` and `backend/tests/designer-assignment-request-index.replica-set.test.ts` only. Does not edit the shared model or run against an existing database.
Acceptance criteria: AC7.

- Follow existing explicit-database, dry-run-first migration conventions.
- Inspect exact legacy/replacement definitions and duplicate pending project/Designer pairs. Report conflicts without deleting data.
- Require verified backup, captured metadata, quiesced writes, and a clean final inspection for apply/rollback.
- Create and verify the replacement index before dropping only the exact known legacy index. Make reruns safe.
- Before rollback, require at most one pending request per project; recreate the legacy index before dropping the replacement. Refuse unsafe rollback.
- Test legacy, fresh, already-transitioned, unexpected-index, duplicate-pair, multiple-pending rollback, and repeated-run cases against an isolated replica set. Assert request/history preservation and read-only dry run.
- Provide exact dry-run/apply/rollback commands and rollout prerequisites for the final handoff. Do not add startup migration or broad `syncIndexes`.

#### 2D. Shared projections, documentation, and integration

Owner: Primary agent.
Files: `backend/src/openapi/designer-assignment.ts`; `backend/src/repositories/types.ts`, `memory.ts`, and `mongo.ts` if needed; `backend/src/services/designer-handoff.service.ts`, `project-status.service.ts`; `backend/src/domain/project-status.ts`; affected handoff/status/contract tests; approved spec/plan tracking. Canonical audit/authorization inventories only if an actual contract change requires them.
Acceptance criteria: AC4, AC6, AC8.

- Align runtime API shapes and OpenAPI with the agreed collections and closure reason.
- Convert internal evidence and memory fixtures to plural pending requests while preserving Mongo/memory behavior.
- Project status must represent awaiting responses without arbitrarily selecting one candidate. Keep pending identities limited to the existing Super Admin visibility boundary and outside membership participants.
- Preserve accepted-assignment matching, Client handoff state, appointment deadlines, and both kickoff gates.
- Update targeted projection/contract regressions with multiple unequal identities/projects to catch accidental cross-project matches or disclosure.
- Integrate the three packages and reconcile contract issues before final verification.

Parallel boundaries: 2A, 2B, 2C, and 2D can run together after Task 1. No worker edits another package's files. The primary agent owns contract changes and immediately communicates any adjustment. Workers preserve existing dirty changes, never revert others' work, and return cross-boundary issues to the primary agent.

### Task 3: Review the integrated change

Owner in Mode A: Integrity reviewer, followed by fixes in the owning package. Owner in Mode B: Primary agent.
Dependencies: All Task 2 writers finished.
Acceptance criteria: AC1–AC7.

- Review transaction ordering and competing acceptance/creation/cancellation scenarios against the actual code.
- Review uniqueness, migration ordering, rollback refusal, history preservation, source/version lineage, idempotent responses, and causal audit fields.
- Review recipient-only access, candidate privacy, accepted ownership, unchanged appointment behavior, and cache invalidation.
- Review UI behavior across independent pending cards, current assignment, pagination, and stale acceptance.
- Resolve confirmed findings before starting final verification. Inspect the integrated diff against the new baseline, not just against Git HEAD.

### Task 4: Verify and prepare the runtime handoff

Owner in Mode A: Verification runner after review/fixes; primary agent owns browser validation and final reconciliation. Owner in Mode B: Primary agent.
Dependencies: Task 3 complete.
Acceptance criteria: AC1–AC8.

Run focused checks first, then typechecks/builds. Broaden only when shared impact, failures, or review findings justify it.

Backend focused commands, from `backend/`:

```sh
npm test -- tests/designer-assignment.test.ts tests/designer-assignment-routes.test.ts tests/designer-assignment-mongo.replica-set.test.ts tests/designer-assignment-request-index.replica-set.test.ts
npm test -- tests/designer-handoff-contract.test.ts tests/project-status.test.ts tests/project-status-service.test.ts tests/project-status-mongo.replica-set.test.ts tests/key-collection-appointment.test.ts tests/key-collection-appointment-mongo.replica-set.test.ts
npm run typecheck
npm run build
```

Frontend focused commands, from `frontend/`:

```sh
npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx src/features/designer/DesignerAssignmentInbox.test.tsx src/features/workflow/DesignerHandoff.test.tsx src/test/fixtures/enterpriseTransport.test.tsx
npm run typecheck
npm run build
```

- Include any newly added focused regressions in the final command list. Run authorization, audit, route inventory, OpenAPI, and broader workflow checks if their contracts changed. Reproduce any suspected pre-existing failure before excluding it.
- Render the actual Admin assignment section with synthetic test data at desktop, tablet, and mobile widths. Confirm four/two/one columns, no horizontal overflow, long-content wrapping, usable controls, and keyboard/accessibility behavior.
- Exercise sending to at least two Designers, cancellation of one while another remains pending, pagination/search with pending requests, and winning/losing acceptance refresh behavior. Use isolated test fixtures; do not send real assignment requests for QA.
- Record console/network failures and fix regressions. Store ignored logs/screenshots only in temporary QA locations; report relevant artifact paths.
- Run `git diff --check` and inspect `git status --short` plus scoped diffs. No repository lint script exists; do not claim lint ran.

### Task 5: Existing-database enablement boundary and final report

Owner: Primary agent.
Dependencies: Task 4 complete.
Acceptance criteria: AC7, AC8 and honest runtime status.

- Determine whether the intended existing database still has the legacy index through a scoped read-only dry run when the target is identified.
- If an existing-database write is needed, first prepare the exact reviewed command, target, dry-run report, backup/rollback evidence, and quiescing/restart procedure. Request authorization only for that concrete action and target, as required by repository policy.
- Do not execute a write migration, deployment, production action, seed, commit, push, or customer communication without its required explicit authorization. Spec/plan approval alone does not authorize those actions.
- If enablement is authorized, execute only the approved transition after the final clean dry run and verify index/runtime compatibility. Otherwise report that code is verified but the existing database has not yet been enabled.
- Report principal changes, affected files, exact test/build/visual results, unrun checks, migration/runtime status, temporary artifact locations, and remaining risks. Never claim full completion while a required enablement step remains outstanding.

## Execution record

- Specification and task plan approved; Mode A selected.
- Task 1 complete: captured 4,641 baseline files, dirty status, and tracked diff under `/private/tmp/lisno-multiple-designers-20261125/`; shared contracts/model updated before delegation.
- Task 2 complete: request, frontend, migration, and shared projection changes integrated. Primary finished lost-cancellation-response retry handling after taking over the frontend slice; the API rejects incompatible older suggestion responses safely.
- Initial primary checks: 140 tests passed across project status, status service, handoff contract, and key-collection appointment suites; superseded by the final integrated checks below.
- Writer checks: 26 assignment tests, 22 migration tests, frontend component tests, and both typechecks passed. Primary's final assignment-panel check passed 13 tests.
- Browser verification: desktop 1440px = four columns, tablet 1024px = two, mobile 390px = one; no document overflow, application errors, or axe violations. Keyboard send, multiple pending requests, independent cancellation, cancellation outside search, and external winner refresh passed with no unexpected fixture requests.
- Integrity review complete: no blocking findings across transactions, privacy, projections, index transition, and UI retries.
- Final integrated backend run: 206 tests passed across the 10 planned focused suites. Initial sandbox run could not bind local sockets; the same isolated lane passed with scoped socket permission. No existing database was used by these tests.
- Final frontend run: 64 component tests passed across assignment panel, Admin detail, inbox, project people, and handoff suites; the targeted enterprise assignment fixture test passed (1 test). Total final focused checks: 271 passed.
- Backend and frontend typechecks and production builds all exited 0. Existing Mongoose deprecation and Vite large-chunk warnings remain; no lint script exists.
- Unrelated broader fixture failures: the frontend enterprise transport suite had 9 failures both before and after this change (64 baseline passes, 65 current passes). Exact baseline/current evidence is retained in the temporary QA directory; no unrelated fixes made. Full repository suites were not run.
- Final browser interactions passed on the integrated UI with no unexpected requests or application errors. QA browser and isolated server closed. Generated browser outputs moved out of the repository.
- Final verification logs, screenshots, baseline evidence, incremental diff, and private backup are in `/private/tmp/lisno-multiple-designers-20261125/`. Ignored build outputs were generated in `backend/dist/` and `frontend/dist/`.
- User explicitly approved updating the Designer-request index in local `lisno_demo` and restarting the backend. The activation below is complete. No real assignment request, seed, production change, commit, push, or deployment was performed.

### Local enablement completed after exact-target authorization

Read-only inspection identified `127.0.0.1:27017`, database `lisno_demo`, collection `designerassignmentrequests`. Before activation, the legacy index remained. The final dry run reported one historical request, zero pending requests, and no index, identity, or duplicate-pair conflicts.

Preparation evidence under `/private/tmp/lisno-multiple-designers-20261125/`:

- `local-index-dry-run.json`: native read-only migration inspection.
- `local-backup/`: private collection backup; parent permissions `0700`.
- `backup-verification.json`: BSON parsed, document count matched, SHA-256 recorded.
- `backup-restore-dry-run.log`: `mongorestore --dryRun` completed without importing anything.

After user authorization, verified and gracefully stopped the existing local backend supervisor and its owned rules/OCR processes. Took a fresh private backup, validated its BSON and restore dry run, and repeated the conflict inspection while writes were quiesced. Applied this exact command from `backend/`:

```sh
node --env-file=.env --import tsx src/migrations/designer-assignment-request-index.ts --database=lisno_demo --apply --backup-verified --writes-quiesced --index-metadata=/private/tmp/lisno-multiple-designers-20261125/local-index-before-apply.json
```

The environment was revalidated against the approved loopback target before execution. Restarted through `npm run dev`, whose existing local launcher skips seeding. Verification passed:

- Backend health HTTP 200; running OpenAPI requires the new `pendingRequests` array.
- Replacement per-project/Designer unique index present; legacy single-project index removed; no conflicts.
- Every historical request compared against the fresh backup using BSON content digests: unchanged (one record).
- Read-only suggestions against the saved project returned all three active Designers, the required pending-request array, and available assignment actions. Audit writes were explicitly disabled for this read-only service check; no test requests were sent.
- New local launcher PID recorded in `local-dev-after-index.pid` (55021 at activation). Existing frontend server remains running.
- Activation evidence: `activation-quiescence.json`, `activation-final-dry-run.json`, `activation-backup/`, `activation-backup-verification.json`, `local-index-before-apply.json`, `local-index-apply-result.json`, `activation-runtime-contract.json`, and `activation-verified.json` under the temporary artifact directory.

The local frontend/backend mismatch is resolved. Users with the previous error visible can use **Retry Designers** or reload the page. No further code changes were needed; the 271 focused tests and both successful builds remain the verified implementation baseline. `git diff --check` passed after documentation updates.

Rollback, if needed while each project still has at most one pending request, uses the same migration with `--rollback` and a fresh metadata path after quiescing writes and a clean dry run. Keep the backend stopped if index verification fails; preserve both indexes and request history for inspection.
