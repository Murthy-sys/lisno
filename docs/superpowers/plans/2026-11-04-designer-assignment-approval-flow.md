# Conditional Designer quotation reapproval: task plan

Date: 2026-11-04  
Status: Implemented and verified on 2026-11-05.

Approved specification: [Conditional Client reapproval after Designer quotation changes](../specs/2026-11-04-designer-assignment-approval-flow-design.md). The user approved the revised specification on 2026-11-04.

## Target outcome

Correct workflow v3 so a valid initial Client approval remains the current commercial approval after Designer assignment while the saved quotation is unchanged. Operational design starts immediately after assignment. A material saved quotation change pauses new design actions and requires Client approval of the exact revised source before the preserved workflow resumes.

The implementation must use one backend-authoritative effective-approval resolver and carry its source through Designer tasks, design review, Client design review, payment, handoff, finance and execution. It must not fabricate a post-phase approval, weaken downstream gates, mutate the reported project or require a data migration.

## Baseline and ownership safeguards

The worktree already contains broad unrelated and prior-task changes. Before writers start, the primary agent will:

1. record `git status --short` and relevant per-target diffs under `/private/tmp/lisno-conditional-quotation-approval/baseline/`;
2. identify which planned targets are already dirty and preserve their existing hunks;
3. settle the exact additive API names and resolver return type before parallel writers edit consumers;
4. keep the specification/plan and shared contract coordination under primary ownership;
5. prevent backend and frontend writers from crossing file boundaries or reverting each other's work.

No writer may stage, commit, reformat unrelated code or alter a dirty target before its existing diff is understood.

## Dependency-ordered work

| Task | Owner and boundary | Dependencies | Completion evidence |
| --- | --- | --- | --- |
| 1. Capture baseline and failing state | Primary, read-only source/diff inventory plus disposable evidence in `/private/tmp/lisno-conditional-quotation-approval/` | None | Record the current assigned/unchanged state and the hard-coded `finalApproval` blockers. Capture existing target diffs. Map AC1–AC10 to tests before writes. |
| 2. Freeze the effective-approval contract | Primary owns the cross-layer contract and coordination; no product behavior edit yet | Task 1 | Define one return shape for `initial_unchanged`, `designer_revision`, and no-current-source states; define revision/digest/scope/requirements checks, start-anchor rule, conflict codes and compatibility aliases. Share it with both writers. |
| 3. Backend approval-source and workflow implementation | One `backend_implementer` owns all task-related files under `backend/`, including a narrowly placed resolver, repository contracts/implementations, workflow/design/finance consumers, OpenAPI and backend tests | Task 2 | Mongo and memory resolve the same immutable source. Assignment plus unchanged approval opens design; material edits block; exact revised approval resumes. All mutations recheck inside transaction fences. No migration or live write. |
| 4. Frontend states and role journeys | One `frontend_implementer` owns all task-related files under `frontend/`, including API types, Designer/estimate/Client/Admin/Finance/workflow consumers, local styles only if necessary, and focused rendered tests | Task 2; implementation may proceed in parallel with task 3 against the frozen contract | UI distinguishes unchanged current approval, changed draft, pending review, changes requested, revised approval and source issue. It never requests a second approval before a material revision. Primary/secondary permissions and query refresh remain correct. |
| 5. Integrate cross-layer transitions | Primary reconciles backend/frontend contracts, inspects final diffs and adds only narrow integration fixes/tests that cross ownership boundaries | Tasks 3–4 | One integrated transition matrix passes: initial approval → assignment → unchanged design work; material edit → block → publish → Client request/approve → resume; design approval/payment bind to the right round. |
| 6. Integrity review | `integrity_reviewer`, read-only, after writers stop | Task 5 | Review immutable approval lineage, authorization, revision/digest checks, finance source, races, task/deadline idempotency, cache refresh and migration risk. Primary resolves every confirmed finding before verification. |
| 7. Final verification | `verification_runner` after integrity fixes; primary owns rendered browser QA and final reconciliation | Task 6 | Focused and broad tests, typechecks, builds, replica-set races, rendered accessibility/responsiveness and repository hygiene pass. Exact results and limits are recorded below and reported to the user. |

Mode A can safely parallelize tasks 3 and 4 only after task 2 freezes the contract. Tasks 5, 6 and 7 are sequential. In Mode B, the primary performs every task sequentially.

## Backend implementation slice

The backend owner must first inspect and then make the smallest coherent changes in these areas:

- `src/domain/estimation-lifecycle.ts`: retain immutable `preApproval`/`finalApproval` meanings; add or delegate current-approval semantics without using the existing unvalidated fallback as authority.
- a focused service/domain helper for effective quotation approval: validate the immutable review round, project/estimate lineage, requirements version, `pricedRevision`, `sourceDigest`, `designScopeRevision`, phase, decision and pending/superseding state.
- `src/repositories/types.ts`, `mongo.ts`, `memory.ts`: expose the same validated context and fail closed on ambiguity or mismatched evidence.
- `src/services/project-workflow.service.ts`: assignment/task creation, task DTO, operational guards, design-round binding, handoff and deterministic task reconciliation.
- `src/services/design-workflow-state.service.ts` and `src/domain/design-workflow-state.ts`: hydrate current approval, preserve the first actionable start anchor, gate/pause/resume stages and update accurate reasons.
- `src/services/estimate-design.service.ts`: allow design work against either current initial or current revised approval, while blocking stale/revised-unapproved sources.
- quotation publication/decision services: reject redundant unchanged post publication; preserve exact revised-round approval and current finance synchronization.
- project status, manager/project assignment, Admin summary, finance/payment, procurement/execution and assistant/read consumers that currently interpret `finalApproval` as the only current quotation source.
- OpenAPI and public backend shapes for current approval state/source, compatibility aliases and stable conflict responses.

Backend invariants:

- Assignment and team metadata never advance `pricedRevision`.
- No-op quotation operations do not invalidate approval.
- Every persisted material change advances the audited revision; changing back later still requires approval.
- The effective initial source is usable only when exact immutable pre-round evidence still matches.
- A final post round is usable only when exact current revised evidence matches.
- `preApproval` is never copied into `finalApproval`.
- Existing completed workflow state and original start/deadline anchor are preserved through a revision pause and reapproval.
- Design-plan approval, initial payment and execution retain their separate existing gates.
- All authority remains backend-enforced and transaction-fenced.

## Frontend implementation slice

The frontend owner must consume backend state without inferring approval from phase, a displayed total, `finalApproval`, or the presence of a Designer. Expected affected consumers include:

- `src/api/types.ts` and feature API types;
- `features/designer/DesignerDesignPlanTasksPage.tsx`;
- `features/leads/LeadEstimateWorkspace.tsx` and `StaffEstimateCollaboration.tsx`;
- Client quotation/published-estimate and Client design-review consumers;
- Admin project presentation/assignment consumers;
- Finance workflow/payment confirmation consumers;
- workflow stage actions/instructions and acknowledgement copy.

Required presentation states:

| API state | Primary Designer action | Operational design | Client quotation UI |
| --- | --- | --- | --- |
| `initial_current` | Optional **Review or update estimate** | Available under normal stage prerequisites | No new quotation decision |
| `revision_draft` | **Submit revised quotation** | Paused | No decision until publication |
| `revision_pending_client` | Await Client decision/withdraw under existing rules | Paused | Approve or request changes |
| `revision_changes_requested` | Revise and resubmit | Paused | Show returned state/history |
| `revision_current` | Optional view/reopen under existing rules | Resumed | Approved revision is read-only history |
| `source_issue` | Refresh/reconcile message; no destructive fallback | Blocked | Do not expose an invalid decision |

The task must preserve loading, error, stale/conflict, permission, empty and responsive states. Only the primary Designer receives edit/publish actions. Secondary Designers can see the appropriate read-only state. Existing query invalidation should be reused and extended only where an affected view remains stale.

## Transition and regression matrix

| Scenario | Required assertion | Acceptance criteria |
| --- | --- | --- |
| Initial approval, no Designer | Super Admin can assign; no design access leaks before assignment | AC1, AC9 |
| Assignment, unchanged quotation | Current source resolves to pre round; task/workflow is available immediately; no second review exists | AC1, AC10 |
| Open/refresh/no-op save | Approval source and operational availability remain current | AC2 |
| Price-only edit | `pricedRevision` advances, workflow pauses and revised Client approval is required | AC3 |
| Physical item/room/basket/scope edit | Price and applicable scope revision advance; workflow pauses | AC3 |
| Persisted edit then restore visible values | New revision remains unapproved | AC3, AC5 |
| Publish unchanged quotation | Stable conflict; no round, delivery or audit side effect for a redundant review | AC2, AC5 |
| Revised publish and Client changes request | Exact pending round only; initial approval remains immutable; workflow remains paused | AC4 |
| Revised resubmit and approval | Exact current post round becomes effective; workflow resumes without duplicate task or reset | AC4–AC5 |
| Existing completed stages before edit | Evidence/history remain; new actions block until reapproval; resume at first incomplete stage | AC5 |
| Designer design upload/review | Initial-current and revised-current sources both bind correctly; stale source fails closed | AC6 |
| Client design review | Design is reviewable against either valid approval kind; no post quotation round is required when unchanged | AC6 |
| Design approval, payment, finance, execution | All bind to the same effective approval round and retain later gates | AC7 |
| Primary, secondary, unrelated Designer, Client, Sales, Admin, Super Admin | Existing authorization matrix remains asymmetric and non-disclosing | AC4, AC9 |
| Missing/foreign/corrupt/ambiguous evidence | `source_issue`; no design/payment/execution mutation | AC6–AC9 |
| Concurrent edit and workflow action | One serialized source wins; stale operation gets a refreshable conflict | AC5 |
| Two unequal projects | No approval, task, amount or review-round leakage | AC7 |
| Workflow v2 and legacy | Existing sequence and labels remain unchanged | AC9 |

## Focused backend verification

Exact files may be refined after baseline inspection, but the final focused lane must include the affected cases from:

```sh
cd backend
npm test -- tests/quotation-approvals.replica-set.test.ts tests/estimate-collaboration.replica-set.test.ts tests/project-workflow-mongo.replica-set.test.ts --maxWorkers=1
npm test -- tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/client-furniture-workflow.test.ts --maxWorkers=1
npm test -- tests/admin-project-summary.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/project-status-mongo.replica-set.test.ts tests/collaborative-finance-issue.replica-set.test.ts --maxWorkers=1
```

Add a focused resolver test file if extracting the resolver makes edge cases clearer. Use disposable replica sets and asymmetric projects/identities. Do not connect tests to the local demo database.

## Focused frontend verification

The final focused lane must cover the affected state consumers, including:

```sh
cd frontend
npm test -- src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx --maxWorkers=1
npm test -- src/features/estimates/ClientEstimateDesignReview.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/admin/adminProjectPresentation.test.ts src/features/admin/DesignAssignmentPanel.test.tsx --maxWorkers=1
npm test -- src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx src/features/workflow/WorkflowStageActions.test.tsx --maxWorkers=1
```

If actual test filenames differ, use the nearest existing focused suites and record the exact final command. Tests must assert copy, accessible controls, role-specific visibility, stale/source-error behavior and cache refresh after save/publish/decision.

## Broad verification and rendered QA

After focused tests and integrity review, run:

```sh
cd backend
npm run typecheck
npm test
npm run build

cd frontend
npm run typecheck
npm test
npm run build

cd ..
git diff --check
git status --short
```

There is no lint script; do not claim lint passed.

Rendered QA uses production components with synthetic/mocked API state only. It must not start the application backend. Check at 1440px, 768px and 390px:

- unchanged assigned Designer with Internal Kick off available;
- changed draft with revised-approval CTA and disabled workflow;
- pending and changes-requested Client states;
- revised approval and resumed workflow;
- secondary Designer read-only state;
- stale/source-error state;
- Client quotation and design-review visibility;
- Admin and Finance summaries.

Verify keyboard navigation, focus, accessible names, status announcements, no unintended horizontal overflow and no application console errors. Stop only task-owned fixture/browser processes and retain evidence under `/private/tmp/lisno-conditional-quotation-approval/verification/`.

## Integration review checklist

Before handing to the integrity reviewer, the primary agent will inspect:

- every remaining direct `finalApproval` check and classify it as historical-post-only or current-approved-source semantics;
- source-digest construction consistency between publication and effective approval resolution;
- pending/superseding round handling;
- exact round ID stored on design review and later payment/handoff records;
- task deduplication and start/deadline anchor behavior for existing and newly assigned projects;
- completed workflow preservation after revision;
- all affected TanStack Query invalidations;
- OpenAPI/frontend type alignment;
- unchanged v2/legacy behavior;
- unrelated dirty hunks and generated artifacts.

## Operational limits and rollback

- Do not start or stop the user's backend, launcher or OCR worker. The user will restart the backend manually after implementation.
- Do not assign a real Designer, mutate the reported project, seed, migrate, backfill, send mail, deploy, commit or push.
- No dependency or lockfile change is expected. If implementation proves one is necessary, stop and update scope before adding it.
- No live data migration is planned. Existing records are interpreted from immutable approval-round evidence.
- Rollback removes only this revision's resolver/contract/consumer changes and restores the previous code paths while preserving unrelated working-tree changes. Approval and workflow data require no rollback because local verification uses disposable fixtures/databases only.
- Final handoff must state exact checks/results, unrun checks, warnings, artifacts, external actions not performed and any remaining risk. Partially verified work must not be described as complete.

## Implementation and verification result

- The workflow-v3 backend now derives one canonical current quotation approval from immutable Client review evidence. An unchanged initial approval opens Designer work after assignment; a persisted material revision pauses new work until the exact revised quotation is approved.
- Designer, Client, Staff, Admin, Finance, procurement, assistant, work-order and execution consumers use the same approval source. Task creation remains idempotent and preserves the first actionable start/deadline anchor.
- The frontend renders explicit initial-current, revision-draft, pending, changes-requested, revision-current and source-issue states and fails closed when the five-field approval projection is incomplete or malformed.
- The final integrity review found no remaining authorization, immutable-history, finance-lineage or deadline-reset blocker after its four findings were corrected and rechecked.
- Final focused verification passed: backend 6 files / 226 tests; frontend 13 files / 242 tests; both workspace typechecks and production builds; `git diff --check`.
- Earlier broader task lanes also passed 457 focused backend tests and 352 focused frontend tests. The full frontend suite was attempted before the final corrections and exposed unrelated dirty-worktree failures; it was not rerun. The full backend suite was not run.
- Rendered synthetic evidence is retained under `/private/tmp/lisno-conditional-quotation-approval/verification/` for initial-current desktop/tablet/mobile and revision-draft desktop states.
- No backend, launcher, OCR worker or Vite server was started during final verification. No live data, migration, seed, email, external service, commit, push or deployment was performed.
