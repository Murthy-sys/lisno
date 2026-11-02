# Editable quotation and design handoff: task plan

Date: 2026-10-30
Status: Implementation finished locally; verification recorded below with pre-existing full-suite failures
Specification: [Approved workflow specification](../specs/2026-10-30-estimate-approval-design-handoff-design.md)
Approval record: User confirmed all three clarification choices, then explicitly approved the specification on 2026-10-30.
Execution mode: A, parallel sub-agents, selected by the user
Classification: High-risk commercial workflow, authorization, immutable approval, document visibility, and data lineage

## Approved outcome

Sales prepares a quotation without waiting for design completion. The Client receives an email link, edits only visible configured items and options with read-only rates, and saves into the shared working estimate. Sales and Client approve the same initial priced revision. The primary Designer then revises that baseline, and the Client approves the Designer-revised quotation before operational design tasks begin. That approval locks the quote. Authorized Sales/primary Designer can reopen a new revision with a reason. Later uploaded-design approval creates the Procurement handoff with matching source references and existing payment/issuing safeguards.

No-marked Main Lines are excluded from all client quotation views, PDFs, and email attachments. Furniture collection is a Client task with an optional assistance request and unknown fee. Super Admin assigns the primary Designer; the primary chooses up to three secondary Designers.

The specification, including its assumptions and AC1–AC12, is the source of truth. This plan adds implementation order and verification, not new product decisions. The specification and plan gates are complete; the user selected Mode A and subsequently confirmed autonomous development.

## Current baseline and additional planning evidence

- HEAD: `598901421e8addc27878a9f6cac25afa6db457ab`. At planning entry, only this task's specification was untracked. Product sources were clean. Recheck before execution; preserve any intervening work.
- Version-2 lifecycle types and persistence require a design-review reference in final estimate approval. Introduce version 3 explicitly; do not globally redefine version-2 approval meaning by widening a helper alone.
- `estimate-tiers.service.ts` already offers scoped tier/dimension commands, Configuration version checks, and price calculation. Extend this capability through shared domain/orchestration helpers; do not expose the unrestricted staff estimate-save payload to Clients.
- `frontend/src/features/leads/estimateCollaborationQueries.ts` already invalidates relevant query families. It does not notify another browser, so cross-session revision checking is a distinct deliverable.
- `EstimateClientReviewRound.ts` stores an immutable complete snapshot and immutable PDF metadata/storage reference. Client-safe renditions need a separate identity and storage binding; never overwrite the archived PDF reference or mutate approved snapshots.
- `estimate-client-review.service.ts` returns stored PDF references, while `routes/estimates.ts` has separate internal and client PDF routes. Publication, retry mail, current/historical downloads, and review projections all need the same visibility policy.
- Project creation paths include `admin-project.service.ts`, `project.service.ts`, and estimate approval/handoff logic. Project, Lead, repository, frontend, and workflow DTOs currently contain version-2-only fields/checks. Audit every creation and conversion path before defaulting new projects to version 3.
- `project.service.ts` accepts assigned Designer arrays and existing consumers use membership to grant access. Introducing explicit primary/secondary fields requires both legacy union compatibility and operation-specific enforcement at those consumers.
- Existing tests cover transactional publication/decision, collaborative estimation/finance, design workflow, source lineage, client tiers/dimensions, visibility, and project assignment. Extend these tests rather than replace them with mocked happy paths.

## Execution gates and worktree discipline

After task-plan approval, ask the required execution-choice question once. Implementation starts only after A or B is selected for this task; prior choices for user deletion do not apply.

In Mode A, use native agents with the ownership below. In Mode B, perform the same tasks inline. Keep one parent task in progress; slices within an implementation wave can run concurrently under that parent task. Independent read-only audits may be delegated only after the execution choice.

Before writers begin, capture HEAD, dirty paths, and the relevant per-target diffs. Every writer must be told: others share this worktree; do not revert, stage, reformat, or overwrite their work. A dirty target is assigned only after its existing changes are understood. No two agents own the same file concurrently. Transfer ownership explicitly between waves and stop all writers before final review/verification.

The primary owns product interpretation, shared contracts, policy/OpenAPI inventories, shared repository files, application route mounting, cross-layer integration, and these working documents. Writers report contract changes to the primary rather than introducing incompatible response shapes or fallback behavior.

## Contract and architecture checkpoints

Task 2 must freeze these contracts before feature writers start:

1. **Versioned lifecycle.** Use a discriminated version-3 lifecycle with explicit pre/post quotation phase, working revision, review status, first-phase Sales/Client approval references, second quotation approval, quotation lock, and scope revision. Keep version-2 fields and readers intact. A version-3 quotation approval does not require a future design review; a later handoff binds the approved quotation and actual design review.
2. **Approval evidence.** Record Sales approval and Client decision against the same immutable snapshot/revision/price digest. Record primary-Designer submission for the second phase. Reuse current review/audit persistence where compatible; use an explicit small record/model if needed instead of stuffing non-client signatures into Client decision fields. Approved records are never edited or deleted to clear current validity.
3. **Version identity.** Distinguish mutable document/CAS version from the immutable priced revision under review. An approval/signature must not invalidate another signature merely because an audit/status write increments a document version. Scope/price changes do invalidate the older approval pair.
4. **Working quote commands.** A strict allowlist supports add/remove/select, quantity/dimensions, and configured option changes with stable line/room/Main Line IDs and expected Configuration source versions. Server derives customer-facing rates and totals. Reject extra financial/configuration fields; a client patch cannot replace or omit hidden internal lines.
5. **Read capabilities.** Server supplies current revision, actor-appropriate capabilities, lock/review state, approval references, and safe blockers. Client reads use filtered projections and customer prices; internal pricing components, hidden line data, and storage references are not serialized incidentally.
6. **Visibility/artifact source.** Store complete internal snapshots. Derive a client-safe view using snapshot visibility plus current Configuration visibility, so a newly hidden line cannot leak through a stale published read. Fail closed when current visibility cannot be established. A rendition binds source review/snapshot, visibility-policy/dependency digest, approved totals, artifact hash, and safe storage metadata. Changing visibility may require a new rendition, never repricing an old approval.
7. **Design team.** Stable primary Designer ID, secondary IDs, and assignment version. The compatible assigned-designer array is the validated union, not a second independent source of truth. No ordering-based primary inference, duplicate identity, or fourth secondary.
8. **Furniture request.** Versioned request, room IDs, Client furniture/assistance choice, nullable fee, independently identified existing-furniture items, submissions/review evidence, and completion source. Keep optional quote-line linkage separate from personal furniture identity. Preserve old workflow-state readers.
9. **Handoff/finance.** One canonical resolver returns the current effective approved quote, actual approved design, scope revision, and payment binding. Every downstream writer validates the resolver output under the same project/source fence. Old orders and payments keep their original source references.
10. **Synchronization.** A minimal scoped revision read drives a visible-tab check at up to a five-second interval. No background write, automatic approval, or broad collection polling. Dirty local drafts are preserved and conflict explicitly before Save.

Planned HTTP surface, finalized in task 2 against the existing route inventory:

| Surface | Contract and authorization |
| --- | --- |
| `GET /projects/:projectId/quotation` | Current actor-safe working quotation, capabilities, revision, and allowed review state. Own Client, assigned Sales, permitted assigned design staff; existing explicit Super Admin read behavior. |
| `GET /projects/:projectId/quotation/items` | Paginated/searchable client-visible candidates limited to project baskets/rooms/applicability. Do not return the full internal Configuration catalogue. |
| `PATCH /projects/:projectId/quotation` | Atomic allowlisted operations plus expected estimate/source versions. Client edits are restricted to visible lines; staff uses scoped existing edit authority. No raw rates/totals or hidden-line replacement. |
| `GET /projects/:projectId/quotation/revision` | Minimal authorized revision/state token, private caching semantics, no hidden names or prices. Existing full-read routes may supply this if already equivalent. |
| `POST /estimates/:estimateId/sales-approval` | Explicit first-phase Sales signature for the current priced revision. A clearly labeled combined approve/send action may orchestrate this plus existing publication. |
| Existing send/Client-decision routes | Add version-3 branching and precise review identity; retain existing idempotency/proof behavior. Do not create a competing Client approval API. |
| `POST /estimates/:estimateId/unlock` | Scoped assigned Sales/primary Designer, current version, current approved reference, nonempty reason, idempotency key. Starts a new draft without rewriting approval history. |
| `GET /projects/:projectId/design-team` and `PUT /projects/:projectId/secondary-designers` | Explicit team/candidate view and versioned secondary selection. Primary-only mutation or existing explicit audited Super Admin override. Reuse the existing primary assignment operation. |
| Existing design-workflow action route | Add versioned furniture request/choice/submit/return/accept semantics with action-specific actor enforcement. Keep existing upload/storage protections and old-version actions. |
| Workflow transition preview and existing enable-collaboration route | Read-only eligibility/conflict preview, then an explicit target-version-3 transition with expected version, reason, and preview fingerprint. No transition during GET. |

For every route, primary updates backend permission codes, role/operation scope, mirrored frontend contract/policy version, runtime Zod validation, OpenAPI schemas, and inventory tests together. Reuse an existing equivalent route when audit proves it has the same semantics; record any naming adjustment before writers proceed. This does not authorize broader roles or new Super Admin personal-action bypasses.

## Dependency-ordered tasks

### 1. Reconfirm baseline, inventory consumers, and reproduce gaps

Owner: Primary; bounded read-only audits in approved Mode A. Dependency: plan approval and execution choice. AC1–AC12.

- Capture current worktree state and run the relevant existing focused suites before behavior changes; record reproducible baseline failures.
- Audit separately: estimate/publication/decision state; client visibility and all artifact/email paths; design/furniture/team authorization; procurement/payment/financial readers and migration compatibility.
- Inventory every `workflowVersion === 2`/`estimationWorkflowVersion` branch, final-approval/design-reference assumption, assigned-designer permission, estimate-lock check, and project creation path. Classify preserve, extend, or replace for version 3.
- Identify currently frozen/issued records and legacy furniture states that must remain unchanged. Audit uploaded-design paths for accidental use of the quotation lock.
- Create synthetic fixtures with two unequal projects, unrelated Sales/Client identities, primary and secondary Designers, active/deleted candidates, visible/hidden Main Lines, draft Configuration precedence, and existing issued artifacts.
- Freeze the UI interaction/state brief using existing components: quotation editor, two approval statuses, lock/unlock confirmation, Client furniture form, team picker, and handoff status. No general redesign or dependency installation.

### 2. Establish version-3 contracts, schemas, and policy

Owner: Primary. Dependency: task 1. AC1, AC2, AC4–AC11.

Exclusive shared paths: backend `domain/estimation-lifecycle.ts`, `domain/estimate-client-review.ts`, relevant `contracts/`, `models/EstimationLifecycle.ts`, `models/Estimate.ts`, `models/EstimateClientReviewRound.ts`, `models/Project.ts`, `models/Lead.ts`, `repositories/types.ts`, authorization/route/audit registries, `openapi.ts` and relevant `openapi/` modules, `app.ts`; frontend `api/types.ts`, `api/authorization-contract.ts`, shared query-key/API contracts; corresponding contract fixtures/tests.

- Implement the frozen contracts above with explicit historical compatibility and safe version predicates. Add a single shared capability/state transition policy rather than scattering phase logic across UI and routes.
- Define the server-calculated physical-scope and price fingerprints; preserve existing dimension/component/UOM and integer-paise rules.
- Define safe rendition storage records without changing immutable PDF metadata. Define team and furniture source identities with CAS/versioning.
- Keep repository memory/Mongo contracts aligned through primary-owned edits to `repositories/memory.ts` and `repositories/mongo.ts`; later slices request methods or adapters through this owner.
- Register new operations and synchronize policy/inventories. Establish exact shared API helpers and exports before handing existing files to the next owners.
- Verify focused domain/schema/authorization/OpenAPI contract tests and both typechecks to identify foundational mismatches before independent feature work.

### 3. Implement quotation behavior, client-safe documents, and quotation UI

Dependency: task 2. One parent task with three non-overlapping slices in Mode A; sequential in Mode B. AC1–AC5, AC9–AC12.

| Slice | Exclusive ownership after task-2 handoff | Deliverable |
| --- | --- | --- |
| 3A: Commercial backend implementer | `services/estimate-collaboration-policy.service.ts`, `estimate-collaboration.service.ts`, `estimate-tiers.service.ts`, `estimate-publication.service.ts`, `estimate-decision.service.ts`, `routes/estimates.ts`, `estimate-collaboration.ts`, `estimate-tiers.ts`, and focused commercial tests; new scoped quotation service/route if justified | Current Configuration pricing, Client atomic edits, first/second approval transitions, quotation lock/unlock, versioned snapshots, safe publication orchestration, and conditional revision/candidate reads. |
| 3B: Document/visibility backend implementer | `services/estimate-client-presentation.ts`, `estimate-client-review.service.ts`, `estimate-pdf.service.ts`, `estimate-client-review-storage.ts`, dedicated new client-rendition service/record if needed, related PDF/presentation/storage tests, and mailer adapter tests | Shared client projection, filtered PDF/rendition generation and downloads, no hidden-line leak, complete internal history, compensation and retry-safe artifacts. |
| 3C: Quotation frontend implementer | `features/leads/LeadEstimateWorkspace.tsx`, `StaffEstimateCollaboration.tsx`, `estimateCollaborationQueries.ts`, feature-local estimate APIs; `features/client/ClientEstimateTiers.tsx` and its APIs; `features/estimates/ClientPublishedEstimate.tsx` and related estimate components/tests/styles; new focused quotation editor/revision hook if needed | Client item/quantity/dimension/options editor, read-only rates, explicit Save, approval badges/actions, Designer revision view, lock/unlock, diff review, conflict-safe cross-session updates. |

3A owns publication orchestration, 3B owns visibility/rendition helpers. Agree signatures first; 3B must not edit publication or route files concurrently. 3C consumes frozen DTOs and does not invent local financial values or backend capabilities. `ClientProject.tsx`, `DesignerDesignPlanTasksPage.tsx`, `project-workflow.service.ts`, and shared repository files remain reserved for later tasks/primary.

Required behavior and tests:

- Persist a Client Save once; supersede pending review without touching approved snapshots; retain hidden lines; recalculate canonical customer totals; invalidate only current approval validity.
- Both first-phase signatures reference one immutable priced revision. Publishing/approving the second quotation does not call version-2 final-design preconditions. Staff republishes after Client edits; Save alone never advances an approval gate.
- Quote unlock starts a new revision with reason and current-source checks. Centralize lineage checks for downstream integration in task 5.
- Render hidden-line-safe PDFs from approved amounts, including empty/all-hidden visible-row cases, headings/notes/component breakdowns, and change summaries. Never recompute a lower total from only visible rows.
- Client download and email retry use the appropriate client-safe rendition; any visibility change invalidates the cached projection identity. Old blobs remain immutable and accessible only through their authorized internal/history path. Unavailable visibility/rendition cannot fall back to the original unfiltered file.
- Test failed/disabled email, send retries/concurrent sends, storage/metadata failure cleanup, immutable originals, and old links after supersession. All delivery uses fakes in tests.
- Verify two independent browser/query contexts: one Client saves, one staff screen updates within five seconds; an unsaved staff draft survives and cannot overwrite the new revision silently. Pause polling when hidden; revalidate access/revision on return.

### 4. Implement design team and Client furniture workflow

Dependency: task 3 integrated and its ownership released; task-2 contracts fixed. One parent task with independent slices. AC5–AC7, AC9, AC12.

| Slice | Exclusive ownership | Deliverable |
| --- | --- | --- |
| 4A: Team backend implementer | New focused design-team domain/service/route and tests; `services/project.service.ts`, `services/admin-project.service.ts`, `routes/projects.ts` by explicit handoff | Primary/secondary team commands, eligible candidates, three-person limit, current actor/target checks, legacy union consistency, and new-project team defaults. Shared schema/repository changes return to primary. |
| 4B: Furniture backend implementer | `domain/design-workflow-state.ts`, `services/design-workflow-state.service.ts`, `routes/design-workflow-state.ts`, corresponding instructions/state model and furniture/state tests | Client-owned request/response, standalone existing-furniture IDs, assistance/TBD branch, self/assisted measurement evidence, return/resubmit, and completion rules. Preserve old-version furniture history and deadlines. |
| 4C: Design/Client workflow frontend implementer | `features/client/ClientProject.tsx`, relevant Client task surfaces, `features/designer/DesignerDesignPlanTasksPage.tsx`, `ProjectWorkspace.tsx`, `ProjectStructureDialog.tsx`, `features/workflow/WorkflowStageActions.tsx`, furniture editors/review/progress components and relevant APIs/tests/styles | Client furniture task/form; Designer request/progress and assisted collection; primary/secondary picker; quote-before-design task eligibility; retained existing operational controls. |

- Primary owns `Project.ts`, shared repository files, generic DTOs, route mounting, `domain/design-workflow.ts`, and all `project-workflow.service.ts` integration to avoid overlap. Share finalized task-eligibility/capability helpers before these writers start.
- Revalidate primary identity and eligible active/non-deleted secondary IDs inside the transaction. Enforce distinct IDs, max three, expected team version, and no privilege expansion through old arbitrary assigned-designer writes.
- Audit all assigned-designer consumers, including uploads, file reads, commercial writes/submission, team selection, measurement assignment, project-chat participant selection, and project details. Secondary access is task-appropriate; no Sales/Client decisions or quote unlock.
- Client furniture form records No explicitly; Yes leads to assistance Yes/No. The fee remains null/TBD and must not enter totals, tax, ledger, or payment logic.
- Existing furniture can be unrelated to estimate lines. Do not manufacture billable items. Validate room ownership, units, required dimensions/counts, evidence storage, and per-submission revision.
- Distinguish Client-confirmed self-entry from Designer-submitted assisted dimensions requiring Client acceptance. A choice or assistance request alone cannot complete the measurements stage.
- Verify pending/error/returned/approved states, duplicate submissions, assistance-choice changes, unauthorized access, and dependent-room readiness. Never erase prior accepted evidence or alter immutable original deadlines.

### 5. Integrate design start, quote reopen, Procurement, and financial sources

Owner: Primary; bounded backend assistance only by explicit exclusive handoff. Dependency: tasks 3 and 4 complete; all their writers stopped. AC1, AC4, AC5, AC8–AC11.

Primary integration targets include `services/project-workflow.service.ts`, `estimate-design.service.ts`, design/workflow domain helpers, `services/project-finance.service.ts`, canonical Procurement/issue source resolvers, project/lead DTO reads, and impacted internal workflow/finance/procurement UI consumers.

- Second quotation approval starts version-3 design eligibility and timing. Ensure its lock blocks quotation mutations but not key collection, measurements, document uploads, annotations, drawing review, or design approval.
- Designer assignment can follow initial approval without prematurely completing the second quotation phase or starting operational-task deadlines.
- At actual Client design approval, bind current approved quotation, exact design review/version, and physical scope. Create one formal Procurement handoff using deterministic identity and source-checked transaction semantics.
- Preserve provisional preparation as provisional. No quotation-only approval activates execution or authorizes vendor dispatch.
- Preserve initial-payment, activation, issued-order, and Configuration activation constraints. Payment can be recorded only against valid currently approved references; historical payments are not rewritten or silently treated as payment for a changed source.
- Unlock/working revisions keep old approved amounts as the financial baseline, prevent new commitments to unapproved revisions, and require scope reapproval where physical design changed. Preserve issued documents/orders and completed work.
- Extend the source resolver and explicit version branches across project/detail/portfolio/Procurement readers. Test two unequal projects, GST exclusion for margin, integer paise, existing orders, and missing/stale source references. Do not use presentation defaults to conceal an unresolved source.
- Integrate secondary access and furniture readiness into existing task/project consumers; preserve unrelated roles and historical records.

### 6. Implement safe onboarding and transition compatibility

Owner: Primary or one exclusively assigned backend implementer. Dependency: task 5. AC4–AC11.

- Default newly created eligible projects/estimates to version 3 across all creation paths. Do not create project state with version 3 and a version-2-only estimate or vice versa.
- Implement a read-only transition preview with current versions, candidate state, missing signatures/identity links, in-flight reviews, historical approvals, payments, issued commitments, and conflict reasons. Preview performs no state, audit, mail, file, or job writes.
- Enable eligible existing open projects only through an explicit versioned transition with preview fingerprint. Recheck conditions transactionally. Do not invent a Sales signature, Client decision, primary Designer, furniture answer, or new-design binding.
- Preserve or explicitly supersede undecided rounds through the established reasoned workflow; never migrate a pending decision invisibly. Block ambiguous, approved/issued, or incompatible historical states with actionable reconciliation details.
- Keep incompatible legacy/version-2 projects readable and fully functional through their original paths. Repeating an already-completed transition must be idempotent.
- Provide dry-run fixtures for clean draft, prior initial approval lacking Sales proof, pending review, approved design, issued order, payment, missing/deleted assignment, and malformed cross-project linkage.
- Record backup/rollback requirements for any future authorized live conversion. Execute no production migration, seed, backfill, or real-project transition during implementation verification.

### 7. Integrated contract, UI, and regression reconciliation

Owner: Primary. Dependency: task 6; all writers stopped. AC1–AC12.

- Review the complete diff, operation inventory, ownership ledger, and every audited consumer. Confirm no duplicate approval APIs, conflicting primary/assigned-designer sources, unfiltered artifact escape, version-2 semantic change, or hidden write on reads.
- Reconcile user-facing labels: **Pre-design approval**, **Post-design approval / Designer-revised quotation**, separate **Design approval**, **Estimation complete**, quote unlock reason, Client furniture task, assistance fee TBD, and Procurement readiness.
- Verify all mounted screens consume the new workflow/capabilities and preserve old-version screens. Check actual new-project entry and existing-project transition UI, not only isolated components.
- Add integration regression cases that cross slice boundaries: client hidden-line edit versus concurrent Configuration change; quotation approval versus delayed draft; final quote lock then design upload; design approval versus unlock; team removal during upload; Client furniture revision versus design submission; payment/issue versus stale handoff source.
- Finish focused checks and resolve implementation regressions before requesting integrity review. Preserve and report baseline failures with evidence rather than relaxing assertions.

### 8. Independent integrity review

Owner: `integrity_reviewer` in Mode A; primary sequentially in Mode B. Dependency: task 7. Read-only, no concurrent writers. AC2–AC11.

Review authorization/non-disclosure, Client field allowlist, primary/secondary privilege boundaries, all document/email visibility paths, approved source/money reconciliation, CAS and transaction rollback, historical compatibility, unlock consequences, task deduplication, upload compensation, email retry, and migration dry-run purity. Resolve concrete findings, then obtain a targeted re-review before final verification.

### 9. Final integrated verification and visual QA

Owner: `verification_runner` plus primary browser/PDF QA in Mode A; primary sequentially in Mode B. Dependency: task 8 resolved and writers stopped. AC1–AC12.

- Run the commands/scenarios below on the integrated tree. Concurrent slice test results do not replace final checks.
- Use real replica-set tests for changed Mongo transactions; no non-transactional fallback. Limit worker concurrency to avoid resource-contention timeouts; report batch failures and isolated reruns accurately.
- Use synthetic identities/projects and fake mail/storage delivery as appropriate. Run browser scenarios with at least two independent authenticated sessions against an isolated test backend for cross-session editing and access checks; a single mocked browser cannot prove synchronization or backend permissions.
- Use the PDF skill when rendering/export-verifying generated quotation documents. Extract text to detect hidden labels and visually inspect PDFs with visible rows, all-hidden rows, multipage content, and unchanged approved totals. Do not put private files into QA fixtures.
- Verify local frontend/backend capability alignment in the actual test runtime. A safe local server restart may be necessary because the normal backend development supervisor does not watch source changes. Do not seed or attach the QA runner to production.

### 10. Handoff

Owner: Primary. Dependency: task 9 results reconciled.

Update task/spec status and execution evidence after the approved implementation stage. Record changed files, exact commands/counts, acceptance mapping, warnings/failures, screenshots/PDF/log paths, remaining limitations, and compatibility/rollout instructions. Close task-owned preview processes/tabs; preserve user-owned services. State explicitly what was not run or externally changed. Do not claim completion with unresolved required approval, visibility, financial, or transactional checks.

## Parallel schedule and ownership constraints

| Wave | Work that may run concurrently in Mode A | Barrier |
| --- | --- | --- |
| Audit | Separate commercial, visibility, and operational/source read-only questions, bounded to available slots | Primary reconciles findings before contracts. |
| Contracts | Primary writes shared contracts; read-only follow-ups may continue | All writers consume the same frozen DTO/policy contracts. |
| Quotation | 3A commercial backend, 3B document/visibility backend, 3C quotation frontend | No shared-file writes; publication/rendition API agreed first. |
| Operations | 4A design team, 4B furniture workflow, 4C design/Client workflow UI | Task 3 owners release files; shared repo/model integration remains primary-owned. |
| Integration/compatibility | Tasks 5–7 sequential; narrow independent read-only audits as useful | No new consumer or model contract invented independently. |
| Review/verification | Integrity review, fixes/re-review, then final tests and browser/PDF QA | Final evidence is from the integrated stopped-writer worktree. |

In Mode B, follow the same dependency order inline without implementation subagents. Do not exceed available agent slots or spawn solely for ceremony.

## Verification commands and acceptance mapping

Commands run from their workspace. These are existing test files; add focused tests adjacent to new services/components and record their exact names before final verification.

Backend lifecycle, Client save, publication/approval, and safe documents (AC1–AC5, AC9, AC10):

```sh
npm test -- --maxWorkers=2 tests/estimation-lifecycle.test.ts tests/estimate-collaboration.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts
npm test -- --maxWorkers=2 tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-presentation.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-review-storage.test.ts
npm test -- --maxWorkers=2 tests/estimate-pdf.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-mailer.test.ts tests/sendgrid-estimate-mailer.test.ts
```

Backend design/team/furniture and source/finance integration (AC5–AC9, AC11):

```sh
npm test -- --maxWorkers=2 tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/project-workflow.test.ts tests/project-workflow-routes.test.ts tests/project-workflow-mongo.replica-set.test.ts
npm test -- --maxWorkers=2 tests/admin-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/estimate-design-upload.test.ts tests/estimate-design-review.test.ts tests/collaborative-finance-issue.replica-set.test.ts
npm test -- --maxWorkers=2 tests/project-finance.test.ts tests/project-finance-mongo.replica-set.test.ts tests/project-finance-routes.test.ts tests/project-procurement-source-index.replica-set.test.ts tests/project-procurement-mongo.replica-set.test.ts
```

Backend shared contract/security inventory (AC2, AC7, AC12):

```sh
npm test -- --maxWorkers=2 tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
```

Frontend core behavior (AC1–AC7, AC12):

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/client/ClientEstimateDimensions.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx
npm test -- src/features/client/ClientProject.estimateReview.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/ProjectStructureDialog.test.tsx src/features/workflow/WorkflowStageActions.furnitureScope.test.tsx src/features/workflow/WorkflowStageActions.furnitureReview.test.tsx src/features/workflow/ProjectWorkflowProgress.test.tsx
npm test -- src/features/procurement/ProcurementEstimateLifecycle.test.tsx src/features/finance/FinanceProjectWorkflowControl.test.tsx src/features/finance/ProjectBudgetOverview.test.tsx src/api/authorization-contract.test.ts src/auth/authorization.test.ts
```

Add focused new coverage for version-3 transition preview/enable, primary/secondary limits, Client add/remove/quantity allowlists, assistance null-fee behavior, client-safe archived renditions, and the cross-session revision hook. Do not consider those covered merely because legacy test files pass.

Because this change spans shared contracts and financial/workflow consumers, final checks include both full workspace lanes after focused checks:

```sh
# backend/
npm run typecheck
npm test -- --maxWorkers=2
npm run build

# frontend/
npm run typecheck
npm test
npm run build

# repository root
git diff --check
git status --short
```

No lint script exists. OCR model/extraction code is not in scope; OCR tests are required only if implementation changes its contracts. Record suite skips/environment blockers explicitly; do not weaken replica-set semantics. Broaden again only for actual new changes, failures, or unresolved consumers.

Browser/PDF matrix:

- Desktop approximately 1440px and mobile approximately 390px: Client quote editing, catalog selection, dimensions/options, saves/errors/conflicts, approvals, lock/unlock, furniture choice/evidence, and team selection. Check keyboard, focus return, accessible names, overflow, console, and requests.
- Separate Client and Sales sessions: allowed save refreshes untouched staff state; dirty staff draft remains intact; race conflicts; unrelated project never updates or leaks.
- Complete new flow: pre-design Sales + Client approval, primary assignment, Designer add/remove revision, second Client approval, quote locked, operational design allowed, Client furniture completion, uploaded design approval, exactly one Procurement handoff, payment/issue safeguards.
- Unlock after second approval and after design approval: preserved historical amounts/records, required reapproval, stale old links blocked, no automatic issued-order changes.
- Primary plus three secondary Designers; fourth rejected; duplicate/inactive/deleted candidates excluded; removed secondary loses current access while actor history remains.
- PDFs/email artifacts: hidden line markers absent from extracted text and rendered content; visible amounts and total correct; internal archived hash unchanged; safe rendition unavailable state; retry does not attach an unfiltered original.
- Existing workflow-version fixtures remain readable and functional; migration preview produces no writes and conflicts are actionable.

## Operational boundaries and execution record

No production mutation, real email, seed, data migration, commit, push, dependency installation, or deployment is authorized by plan approval or execution-mode choice. Use ignored temporary QA outputs and report their paths; never commit artifacts, local databases, or private data.

During implementation, record each task's status, owner, exact touched paths, tests, unresolved issues, and acceptance evidence here. Specification and task plan approved; Mode A selected.

### Execution evidence

- T1 complete: baseline product sources clean; only the approved specification and this plan were untracked. Independent read-only commercial, client-document, and operational/source audits completed.
- Baseline: backend `npm test -- --maxWorkers=2 tests/estimation-lifecycle.test.ts tests/estimate-client-presentation.test.ts tests/design-workflow-state.test.ts`: 3 files, 300 tests passed.
- Document slice ownership additionally includes `estimate-delivery.service.ts`, because retries read the stored original PDF directly.
- T2 foundation established: discriminated lifecycle version 3 with `pricedRevision`, Sales approval evidence, quote-only final approval and separate later `designApproval`; legacy factory still creates version 2. Models and memory/Mongo context contracts extended. Backend/frontend typechecks passed at this foundation point. Focused lifecycle and authorization parity/policy checks passed: 3 files, 68 tests.
- T3 implemented: `quotation_commercial` owns strict quotation commands/publication/decision/unlock; `quotation_documents` owns current visibility/renditions/download/mail; `quotation_frontend` owns quotation forms and cross-session synchronization. New API DTOs agreed directly across owners. Explicit Sales approval is captured by **Approve and send**, so a separate Sales-signature endpoint is unnecessary.
- Primary integration in parallel is limited to reserved shared files, source readers, issue guards and operational quote/design separation. No production defaults or transition writes are enabled before integration and verification. Project/client assistant quotation readers also use the safe visibility projection.
- New immutable `QuotationUnlockReceipt` provides scoped request replay; `QuotationDesignHandoff` records exact quotation/design source pairs without changing issued commitments. Existing original deadlines and finance baselines remain preserved.

- T3–T6 implementation complete and initial owners released: document slice 137 focused tests; quotation approval/transition/edit suites; furniture backend 328 tests (45 replica, 19 new personal-furniture cases, 264 existing); frontend quotation/client 78, operations/legacy 74, final finance/Procurement/lead sweep 61 tests. No dependencies added.
- T5 consumer integration: project status, admin summary and dashboard 153 focused tests; exact v3 references, retained immutable finance baselines, and historical drawing-to-quotation task identity. Parent finance checks passed 9 tests with two unequal projects; workflow checks passed 39; team checks passed 4.
- New Admin-created projects default to v3 with explicit empty team. Existing projects retain their workflow; only explicit eligible preview/enable transitions change it. No live transition or migration executed.
- Parent shared integration regression lane (admin projects, approvers, design requirements, chat membership): 117 passed. API/OpenAPI mount inventory now covers 494 protected operations / 224 routed permissions and 515 documented operations: 113 tests passed.
- T8 independent integrity review in progress. Confirmed high-value v3 threshold regression fixed: route and both publication checks now bypass the legacy threshold only for v3. Above-₹15-lakh pre/post real-route and v2-control regressions pass in a 63-test publication lane.
- Integrity finding: secondary removal during a pending upload/section mutation. Persistence transactions now coordinate authorization and re-read actor/task/current team before writes; storage compensation retained. Focused upload/section/submission lane passed 82 tests, including a real replica paused-storage removal regression.
- Integrity finding: Sales post-phase publication action. Backend `canPublishQuotation` now identifies assigned Sales for pre phase and current primary Designer for post phase; frontend consumes it before any save-first submit. Capability regression and final targeted review pending.
- Browser/PDF QA uses synthetic-only ignored harnesses and `/tmp/lisno-quotation-qa/`. Desktop/mobile Client edits, add item, third/fourth assistant selection, furniture assistance dialog and stale draft preservation exercised. Settled mobile dialog is exactly 390px with no document overflow. Client PDF, all-hidden PDF and five-page PDF rendered and visually inspected; restricted markers absent, approved totals retained. Mocked component browser checks do not substitute for the separately assigned real-backend two-session run.
- Full workspace tests/builds, independent review closure, real-backend two-session runtime proof, and final hygiene are still pending. Existing Mongoose `new` deprecation warnings observed; no lint script exists.

- T8 integrity review closed its confirmed findings after targeted re-review. Final compatibility fix initializes missing/empty canonical stages during explicit clean transition, preserves valid configured IDs/names, rejects incompatible arrays, fingerprints stage configuration, and fails closed for v3 submission without stages. Focused transition/submission lane: 48 passed. Publication capability lane: 13 passed; frontend permission lane: 9 passed. Assistance-choice versus in-flight submission race: replica suite 46 passed.
- T9 in progress: independent runtime agent owns disposable real backend plus Client/Sales browser contexts; independent verification agent owns final workspace checks. Parent frontend preflight build passed with existing >500kB chunk warnings. Broad frontend preflight has failures in untouched Configuration/Ask Lisno suites; baseline comparison is required before classifying them. No claim that the full suite passed.
- Final frontend sweep completed: 383 files, 5,948 tests; 374 files / 5,856 tests passed and nine files / 92 tests failed. Two task-related stale expectations (canonical permission order and payment instructions) were updated; their focused rerun passed all 50 tests. The other seven suites are being compared with an isolated archive of the original HEAD. Frontend product sources did not change during the sweep.
- Final backend and frontend typechecks and production builds passed. The backend full sweep identified a body-less legacy publication compatibility defect; its correction and focused regression verification remain required before closure.
- Frontend baseline comparison completed against archived HEAD `598901421e8addc27878a9f6cac25afa6db457ab`: exactly the same 90 failures reproduce in seven suites (Configuration layouts/screens, Ask Lisno, enterprise transport fixtures, and the existing estimate disclosure item-count assertion). No additional baseline-only failure titles. Evidence: `/tmp/lisno-quotation-qa/frontend-baseline.log`, `frontend-full-preflight.log`, and `frontend-final-contract.log`.
- Real-backend browser QA found an AC3 false-dirty defect: a saved multi-room quotation and the hydrated form used different line ordering, causing an untouched Sales form to retain old values as if locally edited. A bounded fingerprint/hydration fix and configured multi-line regression are in progress; browser verification must be repeated after this correction.

### Final reconciliation, 2026-10-31

T1–T9 are finished locally. Entries above describe intermediate evidence; this section records the final result. No dependencies or lockfiles changed.

- Canonical draft comparison now ignores catalogue ordering while preserving actual quantity, price, option and dimension edits. Separate raw input tracking protects unfinished manual prices, edits to unselected items, and changes made while Save is pending. The final writer lane passed 32 tests; the integrated quotation/workspace lane passed 87 tests. Four-second visible-tab polling leaves request/render headroom within the five-second target.
- Legacy body-less publication works again. Version-2/3 requests without a CAS version receive a conflict without writes. New quotation capabilities are returned only for version 3, preserving legacy DTO shapes. Historical journey tests explicitly retain version 2; new-project tests assert version 3.
- Current Configuration visibility applies to assistant price and execution answers as well as quotation screens/documents. Full immutable amounts are reconciled before filtering; filtering precedes pagination. Visibility changes invalidate cached answers. Legacy source keys retain their original snapshot positions, preventing a later visible line from inheriting a hidden line's identity.
- Final independent review closed every confirmed finding, including raw-edit loss and cached visibility. The Client does not request design-review data before an actual design submission exists.

Final checks and evidence:

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` and `npm run build` | Passed on final product sources. |
| Frontend `npm run typecheck` and `npm run build` | Passed on final product sources; existing large-chunk warnings remain. |
| Backend full `npm test -- --maxWorkers=2` | 341 files: 322 passed, 16 failed, 3 skipped. 6,901 tests: 6,837 passed, 40 failed, 24 skipped. This sweep preceded the final corrections below; it is not reported as an all-green run. |
| Backend baseline classification | 14 matching failures in eight files reproduced at archived original HEAD. One Super Admin timeout passed all 154 tests on isolated rerun. The 25 task-related failures were corrected and rechecked in focused lanes. |
| Backend correction lane, nine files | Initially 279/282 passed; the remaining cases were the known baseline Mongo CAS expectation, a stale Lead assertion, and a newly added current-visibility regression. Both task-related cases were subsequently fixed. Catalogue, invitation, historical journey, full journey and quotation approval suites passed. |
| Final backend assistant/Lead lane | Six files, **124 tests passed**: assistant price unit/replica, assistant sources, assistant data replica, current visibility projection, and Lead routes (46 tests). Includes two unequal projects, cached price/execution visibility changes and original-index lineage. |
| Final quotation edits/current projection lane | Two files, **25 tests passed**. |
| Frontend full `npm test -- --maxWorkers=2` | 383 files: 374 passed and nine failed. 5,948 tests: 5,856 passed and 92 failed. Two task-related contract/copy expectations were corrected; their focused rerun passed all 50 tests. |
| Frontend baseline classification | The other **90 failures in seven files** reproduced with identical failure titles at original HEAD. |
| Final frontend quotation/workspace lane | Six files, **87 tests passed** after the raw-edit protection and polling correction. |
| Final design-review panel lane | 33/34 tests passed, including the new version-zero design guard. The single item-count-copy failure also occurs at original HEAD. |
| Repository hygiene | `git diff --check` passed. Status contains task product/test/document files only; browser/runtime outputs were moved outside the worktree. |

Full-suite baseline failures remain in Configuration/Ask Lisno/configuration fixtures, the existing Mongo user-CAS assertion, enterprise transport fixtures and the old estimate disclosure text assertion. They were not silently weakened or classified from filenames alone: isolated original-HEAD tests reproduced them. Logs are under `/tmp/lisno-quotation-qa/`; full sweep logs are `backend-full-final-escalated.log` and `frontend-full-preflight.log`, with separate original-HEAD comparison logs. Final exact commands are retained in each test log's npm header.

The three skipped backend files (24 tests) are opt-in Python bridge/rules integration suites requiring `LISNO_ASSISTANT_TEST_PYTHON`; the assistant-service virtualenv is absent. OCR extraction/contracts were untouched, so OCR/model suites were not run. No lint script exists. Existing Mongoose option-deprecation warnings and frontend bundle-size warnings remain.

Acceptance evidence:

| Criteria | Final evidence |
| --- | --- |
| AC1, AC4, AC5 | Quotation approval/transition replica tests and real backend/browser chain: Sales publication, Client pre-approval, Super Admin primary assignment, primary revision/publication, Client post-approval, exact immutable review reference and quote lock with design-plan version zero. Reasoned unlock/history and stale approval tests pass. |
| AC2, AC10 | Projection/rendition, delivery/publication and assistant unit/replica lanes; actual PDF extraction/rendering; immutable source totals and retry artifacts preserved. External mail was disabled or mocked. |
| AC3 | Final real two-session browser run refreshed an untouched Sales quantity in **4,039 ms**. Dirty Sales value 7 survived Client value 5, stale Save was blocked, and explicit reload selected the authoritative value. Raw partial and omitted-row edge cases also pass rendered regressions. |
| AC6, AC7 | Furniture unit/replica/race coverage and rendered interactions; team limit/permission/concurrent assignment tests; desktop/mobile assistance and fourth-designer rejection checks. |
| AC8, AC9, AC11 | Real Mongo quote/design/issue races, immutable handoff/deduplication, payment safeguards, two-project finance reconciliation, source consumers, team removal, upload compensation and existing-version regression suites. |
| AC12 | Independent review, final typechecks/builds, rendered interaction tests, desktop/mobile component browser QA, real backend two-session/approval run, PDF QA and diff hygiene. Full-suite baseline failures remain explicitly documented above. |

The final runtime harness used genuine authenticated Client/Sales browser contexts, actual services, disposable Mongo, synthetic identities and memory storage. Sales and Client actions ran through actual UI; Super Admin assignment and Designer revision/submission used real authenticated HTTP. It observed zero JavaScript errors, zero unexpected API failures, no premature design-review calls and only the two intentional 404 authorization probes. Harness/result: `/tmp/lisno-quotation-qa/runtime/final-harness.sh` and `result.json`. Its server/browser/replica were stopped. It did not exercise full app navigation or actual design uploads/Procurement/furniture/team/PDF flows in that same harness; those have the separate rendered, replica and PDF evidence recorded above. Visual/PDF outputs remain in `/tmp/lisno-quotation-qa/`.

Rollout boundary: new eligible Admin-created projects default to version 3. Existing projects retain their workflow and history; eligible clean drafts have explicit read-only preview and CAS transition controls. No live transition/backfill, production mutation, real customer email, commit, push or deployment was performed. Production rollout and real provider delivery remain unverified external actions.
