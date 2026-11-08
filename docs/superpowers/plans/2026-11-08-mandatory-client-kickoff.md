# Mandatory Client Kickoff: task plan

Date: 2026-11-08
Status: Implemented; focused, browser, replica and build checks recorded; full suite remains non-green

## Authority and boundaries

The user approved the [mandatory Client Kickoff specification](../specs/2026-11-08-mandatory-client-kickoff-design.md).
Its requirements and AC1–AC6 govern this plan. The user approved both documents
and selected Mode A. Implementation and proportionate local verification are authorized.

Keep one parent task in progress. In Mode A, the backend and frontend slices may
run concurrently only after the shared contract is settled. In Mode B, perform
the same work inline. No migration, seed, production write, deployment, commit,
push, dependency change or customer communication is included.

## Baseline and preservation

- The worktree contains 31 modified files from the preceding Sales/client-action
  and recommendation tasks, their four new helper/test files, and existing
  workflow documents. Preserve them. The kickoff domain/service/instructions and
  workflow UI targets are currently clean; recheck status and target diffs before
  assigning writers and capture the initial patch for final comparison.
- Prior frontend verification recorded 304 focused passes, successful typecheck
  and build, and 91 full-suite failures in seven unrelated files. This is context,
  not a passing baseline for this task. Attribute failures using current evidence.
- The existing workflow action route performs authorization/preflight, parses
  evidence, validates `workflowActionSchema`, then executes a transaction. Its
  OpenAPI action enum currently imports `DESIGN_WORKFLOW_ACTIONS`. Historical
  event types also use the action identifier, so active writes and history must
  be separated without losing old event labels or evidence access.

## 1. Establish the implementation contract and baseline

Owner: primary. Dependencies: approved plan and selected execution mode.
Acceptance: AC1–AC6.

- Trace active action validation, direct service calls, history projections,
  normal completion, dependent stage gates, design uploads/submissions and
  timing consumers. Verify the focused baseline commands below before edits.
- Settle one effective-completion predicate: a completed kickoff with no active
  exemption. Reuse it for eligibility and gating; preserve legitimate legacy
  completion without manufacturing new evidence.
- Separate historical action identifiers from the active write contract. Specify
  a deterministic retirement rejection before idempotent replay can accept a
  stale skip request. Preserve authorization/non-disclosure behavior and reject
  without business-state, version, history, audit or retained-file writes.
- Settle historical recovery and timing together. A skip-only record needs normal
  kickoff completion before new dependent work. Historical exemptions and already
  completed downstream work remain recorded. Do not use the later corrective
  completion timestamp to shift a previously established deadline; trace timing
  anchors to retained records/history separately from current eligibility.
- Keep current request/scheduling/document-review authority and on-behalf proof.
  No new meeting-date field or sign-off requirement. Share these contracts with
  both writers; return any material incompatibility to the primary before edits.

## 2A. Enforce mandatory kickoff and preserve history

Owner: `backend_implementer` in Mode A, primary in Mode B. Depends on task 1.
Acceptance: AC1–AC4 and AC6.

Owned product files:

- `backend/src/domain/design-workflow-state.ts`
- `backend/src/domain/design-workflow-instructions.ts`
- `backend/src/services/design-workflow-state.service.ts`
- `backend/src/routes/design-workflow-state.ts` only if route enforcement or
  evidence cleanup actually requires an adjustment.

Owned tests: `design-workflow-state.test.ts`, its replica-set test,
`design-workflow-submission-gates.test.ts`, `design-workflow-initialization.test.ts`,
`design-workflow-projection.test.ts`, `client-furniture-workflow.test.ts`, and
`project-status.test.ts` under `backend/tests/`. Add a narrowly scoped domain test
only if it meaningfully isolates the completion/timing contract.

Deliverables:

- Retire the skip from active eligibility and validation; enforce the same rule
  for direct service calls and stale/idempotent skip attempts.
- Apply the effective-completion rule to current stage status and new dependent
  actions/uploads/submissions. Preserve transactional CAS, audit and idempotency.
- Recover a skip-only stage through its existing valid actions. Normal completion
  clears the active exemption and adds history while preserving the earlier event.
- Preserve original timing evidence, valid legacy completions, downstream
  completed work and immutable artifacts. Reads must remain read-only.
- Remove skip language from current instructions, timing descriptions, blockers
  and Key Collection dependencies. Keep historical exemption information clearly
  historical, and preserve unrelated furniture/measurement rules.
- Replace test setup shortcuts that actively skip kickoff with legitimate
  document-bound completion. Keep deliberate historical-skip fixtures for
  recovery and no-bypass assertions, rather than merely deleting that coverage.
- Test two unequal projects, denied roles, stale versions, wrong documents,
  missing proof, duplicate confirmations, and retirement rejection with no side
  effects. Include Mongo transaction evidence for the changed mutation path.

Do not edit frontend, shared contracts, OpenAPI or repositories without returning
the dependency to the primary. The primary owns any required integration there.

## 2B. Remove the skip control and streamline kickoff presentation

Owner: `frontend_implementer` in Mode A, primary in Mode B. Depends on task 1;
may run concurrently with 2A. Acceptance: AC1, AC2, AC4–AC6.

Owned files under `frontend/src/features/workflow/`:

- `WorkflowStageActions.tsx` and `projectWorkflowApi.ts`.
- `WorkflowStageActions.test.tsx`, `WorkflowStageActions.clientKickoff.test.tsx`,
  `ProjectWorkflowProgress.test.tsx`, and `ProjectWorkflowProgress.designer.test.tsx`.
- `ProjectWorkflowProgress.tsx` only for a demonstrated kickoff-specific
  presentation need, without restructuring unrelated stages.

Deliverables:

- Show only valid next actions; remove the skip button/form and its active success
  copy. Suppress the retired ID in stale payloads, including automatic selection,
  retained forms and mutation entry points. Restore focus when a form is retired.
- Keep active write typing aligned with the backend while historical IDs remain
  readable with a clearly historical label. Retain evidence download and notes.
- Keep Request Client kickoff as the initial Designer action. Preserve Client
  scheduling/document acknowledgement/completion and authorized on-behalf flows.
- Remove irrelevant/duplicated kickoff exemption content; retain meaningful
  blockers, recorded facts, required documents, waiting state, history and retry.
- Exercise initial/requested/blocked/completed/historical-exemption states and
  stale payloads, with keyboard accessibility and stable project/document IDs.

Do not edit backend, Sales/client quotation files, or shared CSS. Report any
necessary shared presentation adjustment to the primary. Each writer must be
told they share the worktree and must preserve other agents' and prior edits.

## 3. Integrate contracts and downstream consumers

Owner: primary. Depends on both writers finishing. Acceptance: AC1–AC6.

- Review both diffs against the settled contract and initial worktree.
- Own `backend/src/openapi.ts` and `backend/tests/api-docs.test.ts`: ensure the
  request schema exposes only supported active actions. Keep the existing route
  and canonical operation authorization unchanged; verify their inventory.
- Own any necessary shared contract, repository/model or project-status consumer
  adjustment. Prefer the existing persistence shape and retained history; do not
  introduce a migration or change unrelated stage semantics. Keep memory/Mongo
  behavior aligned if a repository contract must change.
- Reconcile initialization, projection, project status, task queues and downstream
  test fixtures. A retired skip must neither silently count as mandatory completion
  nor erase historical completed work. Confirm reads do not write and timing
  targets remain anchored through recovery.
- Reconcile active versus historical identifiers end to end. Preserve current
  query invalidation, document proof, actor identity and visible recovery paths.

## 4. Review the integrated result

Owner: `integrity_reviewer` in Mode A, primary in Mode B. Depends on task 3 and
all writers stopping. Read-only review; primary resolves confirmed findings.

Audit direct API/service retirement, role/project scope, stale replay, actual
versus skip completion, historical recovery, deadline preservation, immutable
downstream artifacts, transaction/idempotency behavior, evidence cleanup and
stale UI forms. Recheck any fixes before final verification.

## 5. Verify final sources and rendered behavior

Owner: `verification_runner` in Mode A, primary in Mode B. Depends on review and
fixes. Primary may run independent synthetic browser QA while sources are frozen.

Focused backend lane from `backend/`:

```sh
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-submission-gates.test.ts tests/design-workflow-initialization.test.ts tests/design-workflow-projection.test.ts tests/client-furniture-workflow.test.ts tests/project-status.test.ts tests/api-docs.test.ts
npm test -- tests/design-workflow-state.replica-set.test.ts tests/design-workflow-initialization.replica-set.test.ts
```

Use the existing `MongoMemoryReplSet` test helper and synthetic databases, never a
configured application/production database. Do not weaken transactions if a
local replica set cannot start; diagnose or report the exact environmental limit.
The helper clears only its own temporary replica-set data. No seed command runs.

Focused frontend lane from `frontend/`:

```sh
npm test -- src/features/workflow/WorkflowStageActions.test.tsx src/features/workflow/WorkflowStageActions.clientKickoff.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx src/features/workflow/ProjectWorkflowProgress.designer.test.tsx src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/workflow/OperationalTaskQueue.test.tsx
```

Add any new domain tests. Broaden to related workflow/space-planning/evidence
tests when their shared gates are affected. Run backend and frontend
`npm run typecheck` and `npm run build`. Run the backend full `npm test` once for
the shared prerequisite changes. Compare failures with the pre-edit evidence;
rerun only affected checks after fixes, without unrelated cleanup or repeated
full-suite runs lacking a reason. No lint script exists; OCR is unchanged.

Rendered checks use synthetic workflow/document responses, not real projects or
messages. Inspect 1440×900 and 390×844 for Designer, Client and representative
views: only relevant actions, no skip from stale data, mandatory completion
guidance, document acknowledgement, historical exemption recovery, keyboard focus,
wrapping and error/retry states. Verify no unexpected writes or console errors.

## 6. Record results and hand off

Owner: primary. Depends on task 5 and reconciled agent findings.

Record exact commands/results against AC1–AC6 in this plan, including broader
failures and any unrun replica/browser checks. Inspect final diffs, run
`git diff --check` and `git status --short`, and confirm prior work is preserved.
Stop task-created servers/browsers and remove only task-owned temporary fixtures,
logs and screenshots; report refreshed ignored build outputs. Summarize principal
files and behavior, verification limitations, and external actions not performed.
Do not call partially verified work complete.

## Execution evidence

- Mode A selected. Initial tracked changes captured in `/private/tmp/lisno-kickoff-initial.patch`; all kickoff writer targets were clean. Earlier Sales/client quotation changes remain outside this task's ownership.
- Pre-edit frontend focused lane: 188 tests passed across six files.
- Pre-edit backend focused lane with local networking: 485 passed, one failed. Existing failure: `design-workflow-submission-gates.test.ts`, “rejects a secondary removed while upload storage is pending and cleans the file”; its V3 fixture lacks current quotation approval. Initial sandbox-only run also encountered expected `listen EPERM` errors and is not product failure evidence.
- Timing audit settled separate current eligibility, historical validation, and clock derivation. Recovery records the previous exempt completion in the new completion event; existing events remain untouched. No schema change or backfill is needed.
- Backend and frontend implementation slices are in progress; primary owns project-status/notices and OpenAPI integration. A separate temporary synthetic browser fixture is being prepared.
- Existing V3 furniture collection intentionally runs in parallel before kickoff. Preserve that ordinary early collection; an active historical kickoff exemption blocks new furniture writes, and actual stage completion/design submission still require normal prerequisites. This avoids changing the unrelated furniture flow.
- Frontend writer checks: 195 tests passed across the six focused files, typecheck passed. No shared CSS or ProjectWorkflowProgress source change was needed.
- Synthetic browser matrix passed at 1440×900 and 390×844: initial Designer request, stale skip suppression, retained-form focus recovery, collapsed historical exemption, document loading, Client document preview and exact-event completion, representative proof validation, document retry and failed-action retry. No unexpected writes, runtime/console errors or horizontal overflow. Desktop/mobile screenshots were visually inspected in `output/playwright/kickoff-qa/`; task artifacts will be removed at handoff.
- All 31 pre-existing tracked dirty paths were compared against the initial patch and remained byte-for-byte unchanged.
- Backend writer verification: 462 passes plus the same pre-edit quotation-fixture failure; the focused run includes Mongo recovery/rollback/idempotency. A final project-status/domain/furniture run passed 113 tests. Backend typecheck passed.
- Integrated read-only integrity review completed with no confirmed defects. Current eligibility never uses historical timing helpers; the legacy completed-task exception affects presentation only. Final integrated tests/builds are running.
- Temporary browser and port 4183 Vite server stopped. Task-owned screenshots, snapshot and console logs were removed after inspection.


## Final verification and handoff

- Final backend focused command (the planned eight files, including `tests/mandatory-client-kickoff.test.ts`): **495 passed, 1 failed**. The one failure is the same pre-edit quotation-approval fixture identified above.
- Planned Mongo replica command: **50 passed** across two files, including atomic recovery, audit rollback and idempotent replay.
- Planned frontend focused command: **195 passed** across six files.
- Both workspaces: `npm run typecheck && npm run build` exited **0**. Frontend build retained the existing warning for chunks over 500 kB.
- Full backend `npm test` completed once: **7,151 passed, 57 failed, 110 skipped**; **316 files passed, 42 failed, 3 skipped**, 750.03 seconds. It completed while the primary was preparing to stop the disproportionate broad run after the user's feedback. No additional tests were started afterward.
- Beyond the proven pre-edit focused fixture, the full-suite failures are not claimed to be baseline failures. Shared-consumer failures include replica teardown/setup timeouts, duplicate fixture rows following setup timeouts, and a quotation-projection timeout. No additional kickoff assertion failure was found. Other reported domains include AI Knowledge, configuration/bootstrap, procurement/vendor and repository expectations. The full suite is non-green and requires separate diagnosis.
- Integrity review found no confirmed defects. Browser interaction and visual checks passed as recorded above. Required documents, actor/proof/version checks, history, previous deadlines and completed legacy work are preserved.
- Full frontend suite and OCR tests were not rerun; those broader areas are unchanged by this task. No lint script exists. No dependencies, migration, seed, commit, push, deployment or customer communication occurred.
- `git diff --check` passed. The initial 31 tracked dirty paths remained byte-for-byte unchanged. Build/typecheck refreshed ignored `backend/dist/`, `frontend/dist/` and frontend TypeScript build caches.
- Temporary browser/server, screenshots, fixture and task logs were cleaned up. No runtime artifacts are deliverables.

Full-suite failed files reported by Vitest:

- `tests/ai-estimator-knowledge-basket-quality.replica-set.test.ts`
- `tests/ai-estimator-knowledge-bootstrap.replica-set.test.ts`
- `tests/ai-estimator-knowledge-bootstrap.test.ts`
- `tests/ai-estimator-knowledge-domain.test.ts`
- `tests/ai-estimator-knowledge-in-house-components.replica-set.test.ts`
- `tests/ai-estimator-knowledge-integration.replica-set.test.ts`
- `tests/ai-estimator-knowledge-item.service.test.ts`
- `tests/ai-estimator-knowledge-reference.service.test.ts`
- `tests/ai-estimator-knowledge-routes.test.ts`
- `tests/ai-estimator-knowledge-sub-basket-management.replica-set.test.ts`
- `tests/assigned-project-visibility.replica-set.test.ts`
- `tests/authorization-policy.test.ts`
- `tests/client-quotation-projection.test.ts`
- `tests/collaborative-finance-issue.replica-set.test.ts`
- `tests/config.test.ts`
- `tests/design-workflow-submission-gates.test.ts`
- `tests/estimate-plan-review-client.test.ts`
- `tests/estimate-publication-mongo.replica-set.test.ts`
- `tests/estimator-catalogue-estimate.replica-set.test.ts`
- `tests/estimator-sync-apply.replica-set.test.ts`
- `tests/main-line-vendor-links.replica-set.test.ts`
- `tests/mongo-repository.test.ts`
- `tests/procurement-basket-approvers.replica-set.test.ts`
- `tests/procurement-basket-mode-groups.replica-set.test.ts`
- `tests/procurement-basket-tender.replica-set.test.ts`
- `tests/procurement-vendor-allocation.test.ts`
- `tests/production-super-admin-bootstrap.test.ts`
- `tests/project-assistant-data.replica-set.test.ts`
- `tests/project-assistant-estimate.replica-set.test.ts`
- `tests/project-chat-attachments-routes.test.ts`
- `tests/project-manager-vendor-suggestions.replica-set.test.ts`
- `tests/project-procurement-mongo.replica-set.test.ts`
- `tests/project-purchase-order-basket-issue.replica-set.test.ts`
- `tests/project-purchase-order.replica-set.test.ts`
- `tests/project-workflow-mongo.replica-set.test.ts`
- `tests/quotation-edits.replica-set.test.ts`
- `tests/repository.test.ts`
- `tests/super-admin-dashboard-mongo.replica-set.test.ts`
- `tests/user-responsibilities-mongo.replica-set.test.ts`
- `tests/vendor-basket-proposal.replica-set.test.ts`
- `tests/vendor-execution.replica-set.test.ts`
- `tests/vendor-kpi-routes.test.ts`
