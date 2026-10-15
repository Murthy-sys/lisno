# Pre/post-estimation and client collaboration task plan

## Authority and source of truth

The user approved the [pre/post-estimation specification](../specs/2026-10-13-pre-post-estimation-client-collaboration-design.md) on 2026-10-13. Its requirements, assumptions, and AC1–AC12 are the source of truth. That approval supersedes the specification's original awaiting-approval status without changing the approved document.

Status: specification and task plan approved on 2026-10-13; the user selected Mode A and instructed autonomous implementation without further routine approval pauses. P1–P6 local implementation, isolated lifecycle integration, integrity review and verification execution are complete. The full suites are not green: pre-existing failures and non-reproducing full-run failures are classified in the final verification record below. Deployment and live migration have not been performed.

After task-plan approval, ask the repository's execution-choice question once. Mode A permits bounded native subagents; Mode B keeps implementation, review, and verification in the primary thread. Neither mode authorizes commits, pushes, deployment, real customer/vendor email, production changes, seeds, bulk conversion, or live migrations.

## Baseline and preservation

At plan creation, `git status --short` showed only the untracked approved specification:

`docs/superpowers/specs/2026-10-13-pre-post-estimation-client-collaboration-design.md`

No application source was dirty. The previous unified estimate landing and property-aware room changes are present in the current source and must be preserved. Recheck status and capture the complete relevant target diffs immediately before assigning writers. Do not assume later dirty files belong to this task.

Do not add dependencies or change lockfiles unless implementation demonstrates a necessary gap. The repository already includes Vitest, Testing Library, MSW, axe-core, and a Mongo replica-set helper. No lint script exists.

## Fixed cross-layer contract

1. Keep one stable estimate per lead. Working pre/post content is distinct from immutable published/approved snapshots. Use explicit phase, workflow version, source revision, and approved review references. New-flow readers must never infer approval using `currentVersion - 1`.
2. Separate design lifecycle state from the working estimate's commercial status. Pre-approval starts design and procurement preparation. Post-approval cannot reset the project, designers, design stages, documents, or task history.
3. New project membership requires acceptance of a project-bound invitation. Existing account login remains; new signup cannot claim projects by email. Manual staff and vendor invitation authority must not be expanded accidentally.
4. Clients submit Main Basket requests and optional existing-room references. Server-calculated prices and submitted line details remain read-only. Client endpoints do not expose the available internal child catalogue or accept priced-line mutations.
5. Estimate/request writes and review publication share a concurrency fence. Final approval pins the current requirements revision, estimate revision, and approved design review, then closes editing atomically.
6. Published review artifacts and procurement preparation sources are frozen. Draft edits cannot alter a pending approval, emailed PDF, vendor BOQ, quote, or award. Explicit withdrawal/reconciliation is required.
7. New-flow design timing starts from its immutable pre-approval/start event. Preserve existing stage prerequisites, timing bands, pauses, original deadlines, and historical anchors.
8. Final approved source plus completed design plus Super Admin-confirmed payment is necessary for issuance. Apply one transaction-safe policy to every effective issue path; retain all existing approval, allocation, source-freshness, vendor, and Configuration checks.
9. Preserve original financial baselines and record later baseline/source revisions. All current financial consumers use one applicable source per project. Keep paise units, tax rules, and ledger semantics unchanged.
10. Eligible existing in-design projects can transition through an audited command. Completed/issued legacy projects keep their behavior. Never manufacture approvals, rewrite old snapshots, or run a bulk conversion.

Exact new type/field/route names are settled in T2 before parallel writers start. These are implementation naming decisions within the approved behavior. Any material product or authority change discovered during implementation returns to the affected approval gate.

## Ownership and safe parallelism

Only one parent phase is in progress at a time. Child tasks may overlap within that phase where listed below. With four total agent slots, keep at most three child agents active alongside the primary.

| Parent phase | Child work | Dependency and parallelism |
| --- | --- | --- |
| P1: Contract readiness | T1 evidence and T2 shared foundations | T1 precedes T2. In Mode A, narrowly scoped read-only audits may run together during T1. |
| P2: Backend lifecycle | T3 invitations, T4 estimates/requirements, T5 design, T6 finance/payment | T3 and T4 can run together after T2. T5 follows T4; T6 follows T5. T3 can continue independently. |
| P3: Procurement and interfaces | T7 procurement, T8 client/onboarding UI, T9 staff/design UI, T10 procurement/payment UI | T7, T8, and T9 can run together after their contracts/dependencies pass. T10 follows T7 and does not overlap T9's workflow/payment files. |
| P4: Integration and compatibility | T11 full-flow integration | All writers finish first. Primary owns shared integration and acceptance gaps. |
| P5: Independent review | T12 integrity review and fixes | Review the integrated worktree; resolve findings before final verification. |
| P6: Verification and handoff | T13 tests, browser QA, final reconciliation | Final verification runs after fixes and all writers finish. |

In Mode B, execute the same dependency graph inline without implementation subagents.

### Shared paths reserved to the primary agent

- `backend/src/repositories/{types,memory,mongo}.ts`
- `backend/src/models/Project.ts`, shared index registration, and common lifecycle/source contracts introduced in T2
- `backend/src/app.ts`, relevant server/config wiring
- `backend/src/domain/{authorization,route-operations}.ts`, shared authorization middleware, central OpenAPI inventory
- `frontend/src/api/types.ts`, `frontend/src/app/{router,routeRegistry,routePaths}.ts*`, frontend shared authorization and query-key integration
- Shared styles, global fixtures, cross-feature tests, and the task documents

The primary implements shared repository adapters in step with the owning service task, preserving memory/Mongo alignment. A child may propose additions but must not edit these reserved files without an explicit ownership transfer. A transfer is exclusive and documented before writing; do not run another writer against the same path.

Every child assignment must name its allowed files, dependencies, fixed contracts, and acceptance criteria, and state: “You are not alone in the codebase. Preserve others' changes and do not revert or overwrite work outside your ownership.” Backend writers retain `.js` suffixes on relative TypeScript imports. No agent may independently alter a shared schema or invent a fallback approval source.

## Dependency-ordered implementation tasks

### T1. Reconfirm evidence, risk boundaries, and test baseline

Owner: primary. Depends on: approved plan and execution choice. Criteria: prerequisite for AC1–AC12.

- Recheck dirty paths and target diffs. Trace all estimate writers/readers, public signup/project claiming, client project projections, invitation uniqueness/acceptance, and effective issued-work creation calls, including automatic paths.
- In Mode A, use up to three independent read-only audits: identity/invitation authority; estimate/design/finance source assumptions; procurement issue paths and regression coverage. Request concrete file/function evidence and no source edits.
- Confirm the approved spec's assumptions against current source. Inventory consumers of estimate status/version, `designFrozenAt`, payment timing, project-active status, approved room context, finance baseline, and task generation.
- Capture focused existing behavior before changing it using the current unit/replica-set harness. Record pre-existing failures separately. Use synthetic identities and isolated local databases; no `.env` secrets or live connection strings in output.

Done when: the writer ownership map and complete source/issue-path inventory are recorded in this plan, and no unresolved material requirement prevents T2.

### T2. Establish shared lifecycle, identity, and source contracts

Owner: primary. Depends on: T1. Criteria: AC2–AC11 foundations.

- Define persisted workflow-version discrimination and explicit working phase/version, pre-approval reference, final-approval reference, requirements version, design-source reference, edit closure, and payment-source reference.
- Define safe DTOs/capability/blocker shapes for client requirements, staff working estimates, immutable reviews, invitation status, procurement preparation/reconciliation, finance source, and payment confirmation. Keep historical serializers backward compatible.
- Define shared source resolvers and transaction/fence rules so consumers request the correct working, pre-approved, preparation, final-approved, or historical source. Missing/ambiguous sources produce conflicts rather than mutable-value fallbacks.
- Fix project-invitation uniqueness and token/account authority without broadening manual staff invitations. Prefer a dedicated project-invitation record if existing email-wide uniqueness cannot safely support concurrent project invites; reuse existing token/delivery primitives where compatible.
- Define final-source budget revision history and stable baseline references without rewriting original approved amounts. Define the guarded legacy transition predicates and immutable design-start anchor.
- Specify route operations, strict input validation, expected versions, idempotency identities, safe error codes, and query invalidations for all new commands. Define one shared issue-eligibility service usable within the existing Mongo transactions.
- Add contract/schema tests and compatible readers before enabling new workflow writes. If activation is staged, keep the new-flow guard fail-closed; local fixtures explicitly select the new version.

Done when: every writer has the same named fields, source rules, endpoints, permissions, and error/capability contract; contract/type checks pass. Contract implementation must not by itself unlock approved estimate writes or bypass existing issuance restrictions.

### T3. Implement project invitations and verified client joining

Owner: backend invitation slice; primary owns repository/wiring/auth-registry integration. Depends on: T2. Can run alongside T4. Criteria: AC1, AC2, AC11, AC12.

Owned feature paths: `backend/src/services/admin-project.service.ts`, `backend/src/services/auth.service.ts`, `backend/src/routes/{admin-projects,auth}.ts`, project-client invitation feature files and tests, and narrowly required changes to `user-invitation.service.ts`/domain/model/mail helpers. Existing vendor/staff invitation tests remain in this owner's regression scope.

- Keep initiation transactional and idempotent at its command boundary; start invitation delivery only after a successful project commit. New-flow projects are not linked to an existing client solely by email.
- Add project-scoped create/retry/resend/revoke/status and acceptance, with mail preflight before credential/invitation/audit/email writes, safe disabled/failed state, throttling, generation checks, and current authority checks.
- Support new-account acceptance and authenticated matching existing-account acceptance. Coordinate account uniqueness and project linking in a transaction, including two invites for different projects accepted concurrently.
- Disable unverified public client signup and email-wide project claiming for new access. Preserve login/session handling and established memberships; keep manual/vendor invitation permissions unchanged.
- Cover creation retries, delivery failures, revoked/expired/replaced tokens, stale actor/project/email authority, wrong-account and cross-project attempts, non-client account conflicts, and account/acceptance races.

Done when: only valid acceptance grants exactly the invited project; retry does not recreate the project; disabled mail creates no invitation credentials/history; existing staff/vendor invitation suites still pass.

### T4. Implement requirements and pre/post estimate revisions

Owner: backend estimate slice. Depends on: T2. Can run alongside T3. Criteria: AC3–AC5, AC11, AC12.

Owned feature paths: `backend/src/models/Estimate.ts`, `EstimateClientReviewRound.ts`, new estimate requirement/revision feature files, `backend/src/routes/estimates.ts`, `backend/src/services/estimate-{decision,publication,client-review}.service.ts`, `estimate-project-handoff.ts`, relevant presentation/PDF and estimate tests. Do not edit design lifecycle or finance service files owned by T5/T6 concurrently.

- Add audited requirement commands and client-safe projections. Allow Main Basket metadata and request text, not child catalogue data or commercial writes. Tie resolution to stable line IDs and preserve request history.
- Centralize estimate editability for owned Sales and assigned project designers. Retain internal review thresholds, current Configuration pricing rules, save-version protection, room IDs, and the property-aware picker contract.
- Split initial pre-approval handoff from final post-approval. Seed the post draft from the immutable pre-approval without allocating another estimate/project identity or resetting design fields.
- Add phase-aware publication, comparison, explicit pending-round withdrawal, request-changes/resubmission, and immutable final review references. Block unresolved requests and stale design/requirements sources. Keep delivery retry independent of publication commit.
- Serialize edits, new requirements, publication, and approval; lock all writer paths at final approval. Guard auxiliary imports/configuration persistence paths identified in T1.
- Implement eligible legacy draft/pre-approved transition using the shared predicate, preserving membership, IDs, and historical snapshots. Unsafe lineage returns a recoverable conflict.

Done when: client tampering and catalogue access fail; staff can revise during design; immutable history survives; pre/post review races are tested on a replica set; post-approval cannot invoke the old destructive handoff reset.

### T5. Integrate design prerequisites, reconciliation, and clocks

Owner: backend design/workflow slice. Depends on: T4. Criteria: AC4–AC6, AC11, AC12.

Owned feature paths: `backend/src/domain/design-workflow-state.ts`, `backend/src/services/design-workflow-state.service.ts`, `backend/src/services/project-workflow.service.ts`, related workflow domain/routes/tests. Ownership of these files passes to T6 only after T5 finishes.

- Use the new immutable pre-approval/start anchor for availability, elapsed time, submission blockers, and stage activation. Keep pauses, stage dependencies, proof requirements, original deadlines, and legacy clocks intact.
- Resolve current design room/scope context explicitly rather than relying on `client_approved` status or a changing estimate version. Flag affected measurements/furniture/scope confirmations for reconciliation without deleting their evidence.
- Bind design approval to its scope/version. Distinguish commercial-only changes from scope changes, preserve old review rounds, and require current design reconciliation before final estimate publication.
- Create/reuse deterministic procurement preparation tasks at pre-approval. Separate design completion from project execution activation; prevent early finance opening/issued-work assignments from the old design completion path.
- Preserve old workflow behavior for completed/issued legacy projects and original anchors for transitioned work already started.

Done when: a new project can complete design before payment, saved revisions do not reset completed work, affected scope is reconciled, and replay creates no duplicate tasks or clocks.

### T6. Integrate finance sources and Super Admin payment confirmation

Owner: primary or a bounded backend finance slice after T5 releases shared workflow files. Depends on: T5. Criteria: AC8–AC11.

Owned feature paths: `backend/src/services/project-finance.service.ts`, finance domain/models/routes/tests, payment portions of `design-workflow-state.service.ts`, downstream activation portions of `project-workflow.service.ts`, and the shared issue-eligibility service from T2.

- Replace version arithmetic with explicit source selection for new-flow finance, workflow, and procurement budget consumers. Preserve strict legacy fallback behavior only for legacy records.
- Store immutable baseline revisions and select one effective source per project. Keep the original baseline, ledger entries, customer snapshots, and issued amounts; distinguish provisional preparation totals from a final execution budget.
- Enforce Super Admin-only new-flow payment confirmation with receipt/reference, expected workflow version, final estimate/design references, and idempotency. Preserve Finance visibility and historical payment evidence.
- For eligible transitioned projects, attest an existing receipt against the final source rather than record a duplicate payment. Missing/mismatched approval cannot satisfy the gate.
- Atomically record payment and activate eligible downstream execution state/tasks exactly once. Do not issue waiting work orders automatically.
- Implement the shared final approval/design/payment/source gate with a project/source transaction fence. It must be usable by every issuance path in T7 and preserve already-issued idempotent replies.

Done when: asymmetric project/detail/portfolio totals reconcile in paise, original baselines remain recoverable, Finance cannot confirm new-flow payment, and payment/replay cannot duplicate tasks or money.

### T7. Open procurement preparation and secure every issue path

Owner: backend procurement slice. Depends on: T6 and the T4 frozen-source contract. Criteria: AC7, AC8, AC10–AC12.

Owned feature paths: `backend/src/services/procurement.service.ts`, relevant `project-procurement*`, `procurement-basket-*`, `project-purchase-order*` services/routes/domain/models and their tests. Primary retains central authorization/wiring/finance contracts; do not rewrite vendor execution subsystems outside a demonstrated integration need.

- Permit preparation after pre-approval using immutable pre-approved or explicitly released post-draft preparation snapshots. Keep current vendor-dispatch Configuration activation rules.
- Persist source/phase/revision and stable line identity on new preparation artifacts. Preserve existing vendor-facing snapshots when drafts change.
- Implement final-source comparison and explicit basket reconciliation for added/removed/changed/unchanged scope. Retain unaffected quote terms and immutable provenance; require current proposal/source approvals and fresh vendor scope where changed.
- Invoke the shared issue gate in manual and automatic basket issue, individual-order approval, project-request approval, and every other issued-work path found in T1. Test early issue attempts have no commitment, assignment, invitation, or delivery-intent side effects.
- Allow internal approval while issue is blocked; record actionable blockers and support explicit retry after payment/source readiness. Preserve idempotency and existing budget/allocation/vendor checks.
- Keep quotation-access invitation authority separate from issued-work authority. Verify the successful issue path still reaches the existing vendor invitation/assignment and Project Manager monitoring flow.

Done when: preparation works during design, frozen vendor scope never drifts, final reconciliation is visible, and no issue path can bypass or race the common gate.

### T8. Build client onboarding and requirements interfaces

Owner: frontend client/auth slice. Depends on: T3 and T4; fixed shared types from T2. Can run alongside T7/T9 on distinct files. Criteria: AC1–AC3, AC5, AC11, AC12.

Owned feature paths: `frontend/src/auth/{InvitationAcceptancePage,SignupPage,LoginPage}.tsx` and tests, invitation API helpers, `frontend/src/features/client/ClientProject.tsx`, requirements components, `frontend/src/features/estimates/{EstimateReviewPanel,ClientPublishedEstimate}.tsx`, related feature-local styles/tests. Primary integrates AuthProvider/shared route/type changes.

- Provide invitation acceptance for new and existing accounts, safe expired/revoked/unavailable states, and invitation-led signup messaging. Preserve the pending invite through login without leaking credentials into logs.
- Render requirements before an estimate exists. Clients select Main Baskets and optionally existing rooms, save written requests, and see staff resolution and read-only prices with clear pending-price labels.
- Add pre/post phase labels, changes since pre-approval, exact submission/version identity, and phase-specific approval/change-request actions. Preserve submitted line detail and historical PDF access.
- Handle stale/save/permission/locked states without losing text or silently approving old data; close editing from authoritative capabilities after final approval.
- Add rendered tests for keyboard/focus/errors, strict outgoing payloads, absent child-catalogue requests, concurrent invalidation, new/existing account joining, and narrow screens.

Done when: the complete client journey works through final approval with safe payloads and no internal selection catalogue exposure.

### T9. Build staff estimate and design workflow interfaces

Owner: frontend staff/workflow slice. Depends on: T4–T6. Can run alongside T7/T8 on distinct files. Criteria: AC3–AC6, AC9, AC11, AC12.

Owned feature paths: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, related staff estimate/lead APIs/components, `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`, `frontend/src/features/workflow/*` where needed, relevant local tests/styles. Do not edit T8's client review or T10's procurement/finance files.

- Keep the unified landing and rooms/scope/generate editor. Show pre/post phase, original approved/proposed total, unresolved requests, and the next action.
- Add staff requirement resolution, pending-review withdrawal before editing, post-draft preparation release, and final publication once design/requirements are ready.
- Show invitation status/retry on the existing successful initiation/project flow. Keep project creation success distinct from delivery availability.
- Use backend edit/design/payment capabilities and blocker messages. Show scope reconciliation without resetting completed stages or hiding existing evidence.
- Update design timing/payment copy to match the new triggers. Keep historical workflow and role-specific behavior explicit.
- Verify assigned designer access, concurrent saves, preserved unsaved edits, all property/room variants, final locked state, and legacy transition/conflict UI.

Done when: authorized staff can revise and complete the full design/final-estimate flow, while existing landing, room picker, and completed work remain intact.

### T10. Build procurement readiness, finance source, and payment interfaces

Owner: frontend procurement/finance slice. Depends on: T7 and T9's shared workflow integration. Criteria: AC7–AC12.

Owned feature paths: `frontend/src/features/procurement/` preparation/award/order surfaces and API helpers, `frontend/src/features/finance/{DesignPaymentConfirmations,FinanceProjectWorkflowControl,ProjectFinancePanel}.tsx`, finance source projections/pages as needed, local tests/styles. Primary owns final shared query/type integration.

- Display preparation phase/source and proposed versus final scope; show explicit reconciliation actions and preserved quote history.
- Present exact issue blockers across basket, individual-order, and project-request screens. Reflect auto-issue blockers and provide the existing explicit retry mechanism when ready.
- Show Super Admin payment confirmation only for the current final source; keep receipt status read-only for other roles. Support historical receipt attestation without suggesting duplicate collection.
- Label provisional/final/old baseline views consistently across project, detail, and portfolio screens. Do not calculate substitute workflow or finance values in the frontend.
- Verify relevant query invalidation after reconciliation, payment, approval, issue, and retry; include stale tabs and permission changes.

Done when: UI readiness matches server authorization, Finance cannot trigger the new confirmation, and displayed amounts reconcile with backend source projections.

### T11. Integrate the complete flow and compatibility paths

Owner: primary. Depends on: T3–T10 complete. Criteria: AC1–AC12.

- Reconcile all shared types, repositories, route operations, OpenAPI, validators, bootstrap/index compatibility, feature activation, and query invalidation. Check the final diff for accidental broad role permissions and unrelated changes.
- Run a synthetic end-to-end flow: initiate → invite → join → request → priced pre-review → pre-approve → design + preparation → scope revision → design reconcile/complete → final-review → approve → payment → final procurement reconciliation/approval → issue → existing vendor/Project Manager handoff.
- Exercise unchanged-final, final change-request, disabled/failed email/retry, existing account/two-project invite, cross-project tampering, stale submission, and concurrent edit/approval/issue variants.
- Test guarded transition fixtures: old draft, pre-approved unstarted design, partial design, old receipt, pending finance bucket, ambiguous lineage, completed design, and issued work. Reject unsafe transitions without partial mutations.
- Confirm compatible readers precede activation. Document any necessary schema/index deployment order and rollback limitation; do not execute live migrations or conversions.

Done when: all acceptance criteria have concrete implementation/test locations; no connected screen or backend issue path remains on an incompatible source assumption.

### T12. Review integrity and resolve findings

Owner: `integrity_reviewer` in Mode A; primary inline in Mode B. Depends on: T11, all writers finished. Criteria: AC1–AC12.

Read-only review deliverable: concrete findings with files/lines and severity, or an explicit no-confirmed-findings result. Focus on invitation/account takeover and project scope, immutable pre/final approvals, stale-version fences, financial source selection/units, design preservation/deadlines, every issue path, vendor-access timing, email retries, and cache invalidation.

The primary triages and fixes confirmed findings with exclusive ownership, then reruns affected focused tests. If a fix changes the approved product/authority contract, update the affected durable document and obtain the required approval. Re-review relevant fixes before final verification.

### T13. Verify the integrated worktree and hand off

Owner: `verification_runner` plus primary browser/diff reconciliation in Mode A; primary inline in Mode B. Depends on: T12 fixes complete. Criteria: AC1–AC12.

- Run focused checks below, followed by both workspaces' full tests, typechecks, and builds. Final results must come from the stable integrated worktree.
- Use the existing `backend/tests/helpers/mongo-replica-set.ts` harness for changed transaction/race paths. Do not weaken transactions or skip replica coverage to obtain a passing result. Escalate sandbox-blocked execution through the normal tool approval mechanism when needed.
- Run rendered browser QA with synthetic data at 390 px, 768 px, and 1440 px widths. Cover invitation new/existing/expired/error, client requests and approval, staff edits/withdrawal, design before payment, procurement provisional/reconciled/blocked/ready, Super Admin versus Finance payment, and legacy locked state. Check accessible labels, keyboard/focus, overflow, console errors, and failed API calls.
- At least one integrated lifecycle uses the real isolated test backend; mocked UI fixtures supplement state/width coverage and must not be described as backend verification.
- Keep logs/screenshots outside tracked source, preferably `/tmp/lisno-pre-post-estimation-qa/`. Track and stop only task-owned servers/browsers. Report artifact paths and unrun/blocked checks honestly.
- Inspect final diff and status. Report outcome, key source/permission decisions, affected files, exact tests/results, warnings, compatibility limits, and external actions not performed. Never call partially verified work complete.

## Verification commands and acceptance mapping

Run the named existing tests plus new feature/race tests added by their owning task. Commands below are focused starting sets, not substitutes for AC-specific new tests.

| Area / criteria | Working directory | Focused command |
| --- | --- | --- |
| Initiation and identity, AC1–AC2 | `backend` | `npm test -- tests/admin-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts tests/auth-authorization.test.ts` |
| Estimate publication/decisions, AC3–AC5 | `backend` | `npm test -- tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-decision-mongo.replica-set.test.ts tests/estimate-client-review-service.test.ts` |
| Design preservation and timing, AC4–AC6 | `backend` | `npm test -- tests/design-workflow-state.test.ts tests/design-workflow-state.replica-set.test.ts tests/design-workflow-submission-gates.test.ts tests/project-workflow.test.ts tests/project-workflow-mongo.replica-set.test.ts` |
| Procurement preparation/issue, AC7–AC8 | `backend` | `npm test -- tests/procurement-mongo.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts tests/project-purchase-order-basket-issue.replica-set.test.ts tests/project-purchase-order.replica-set.test.ts tests/project-purchase-order-request.replica-set.test.ts` |
| Finance and source lineage, AC9–AC11 | `backend` | `npm test -- tests/project-finance.test.ts tests/project-finance-mongo.replica-set.test.ts tests/project-finance-routes.test.ts` |
| Authorization/API inventory, AC2–AC9 | `backend` | `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts` |
| Client and estimate rendered behavior, AC1–AC5 | `frontend` | `npm test -- src/auth/InvitationAcceptancePage.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/admin/AdminProjectInitiationDialog.test.tsx` |
| Workflow/procurement/payment rendered behavior, AC6–AC12 | `frontend` | `npm test -- src/features/workflow/ProjectWorkflowPanel.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/PurchaseOrdersPanel.test.tsx src/features/finance/DesignPaymentConfirmations.test.tsx src/features/finance/FinancePages.test.tsx` |

Final required commands, each from its indicated directory:

- `backend`: `npm run typecheck`, `npm test`, `npm run build`
- `frontend`: `npm run typecheck`, `npm test`, `npm run build`
- Repository root: `git diff --check`, `git status --short`

Check new untracked source files as well as tracked diffs. Keep full-suite logs and distinguish actual failures from environmental blockers. OCR is outside scope unless a traced change unexpectedly reaches its extraction contracts. No lint success may be claimed because neither package defines a lint script.

## Progress and evidence log

- Specification approved: 2026-10-13, user response “Approved.”
- Plan creation: source/paths/scripts inspected; no product edits, tests, builds, or external actions performed at this stage.
- Execution mode: A, parallel sub-agents, selected 2026-10-13.
- T1: initial application paths remain clean; only this plan and its specification are untracked. Read-only audits assigned to `client_invitation_audit`, `estimate_lifecycle_audit`, and `procurement_issue_audit` with distinct scopes.
- Baseline: `cd backend && npm test -- tests/admin-projects.test.ts tests/estimate-client-decision.test.ts tests/design-workflow-state.test.ts tests/project-finance.test.ts` passed 4 files / 334 tests.
- T1 audits complete. Three effective issuance paths identified: basket issue (including automatic), individual-order approval, and request approval. All must share final-source/payment fencing.
- T2 shared foundations implemented: `EstimationLifecycle`, explicit pre/final approval references, project requirements/source fence, safe invitation and requirement operations. Raw approved status remains for existing design consumers; commercial writers use the nested commercial status. Shared integration remains in progress.
- T3 implemented by `project_client_invitation_impl`: dedicated project invitations and initiation receipts, verified exact-project joining, retired public signup, delivery preflight and retry handling. Focused backend evidence: auth 82, full journey 13, invitation memory 11, admin Mongo 39; additional invitation Mongo 4, staff invitation Mongo 32, and admin memory 37 passed. No real mail sent.
- T4 estimate writer owns lifecycle/publication/decision snapshots; primary owns requirement domain/model/service/routes/tests. Requirements replica tests passed 6/6 before the small DTO unit-name clarification; re-run required. Existing publication/decision replica lane passed 35 tests; new lifecycle coverage in progress.
- T5 ownership transferred to the invitation backend writer after T3: design workflow domain/state/model/service, project workflow, estimate design, design review round scope binding, relevant routes/tests. Primary retains repository adapters, project model, finance, and central registries.
- T8 onboarding UI implemented and checked by `client_invitation_ui`: 134 focused tests, then 19 affected tests after added recovery cases; frontend typecheck passed. Synthetic browser states passed at 390/768/1440 px; artifacts `/tmp/lisno-client-invitation-qa/`. Agent now owns client requirements/review surfaces. These are slice checks, not integrated final verification.
- Repository adapters were exclusively transferred to T3 for invitation persistence and returned to primary. Primary has added `findProjectEstimationContext` and working design-scope room context for T5.
- T4 lifecycle implementation passed its focused and replica tests, including pre/post approvals, unresolved requirements, stale CAS, withdrawal/approval concurrency, final scope binding, and immutable finance revision integration. Primary requirements regression passed 6/6 after paise DTO naming update.
- T5 completed: pre-approval starts design; scope reconciliation preserves evidence; deterministic procurement/finance/site planning tasks begin early. Final estimate/payment activation does not reset design. Focused workflow checks passed, including 34 Mongo and 48 HTTP tests.
- T6 implemented: immutable finance baseline revisions retain original pre-approval amounts; current projections use explicit final approval IDs. Super Admin-only final payment confirmation/receipt attestation atomically activates execution. Two unequal finance projects reconcile; exact-source issue gate checks final approval, design scope, requirements and receipt.
- T7 individual PO/request slice complete: approval produces `ready_to_issue` for new flow; separate reconcile/issue preserves quote history and requires fresh internal approval. Focused five-file lane passed 50/50 tests. New request open-state unique index has dry-run/apply/rollback tooling, tested only against disposable Mongo. No real migration run.
- T7 basket/source slice is finishing focused verification. Primary integrated early-preparation site-completion fence and dashboard source selectors. Existing dashboard regression suite passed 41/41; shared route/OpenAPI/authorization checks passed after updating manifest fixtures, with new asymmetric dashboard checks in progress.
- T8 client requirements/review complete: 29 focused tests and synthetic browser checks at 390/768/1440; exact-version client commands, main-basket-only requests, read-only prices and phase comparison verified.
- T9 staff/designer complete: 111 focused tests, plus corrected established two-dimensional furniture test fixture 6/6; pinned editor versions prevent stale overwrite. Browser checks at 390/768/1440 verified resolver focus/width, unsaved quantity retention, save/submit/withdraw/release CAS and no browser errors. Primary wired designer return navigation.
- T10 finance/payment UX complete in primary; procurement screens in progress with frontend agent. T11 isolated real-service approval/payment/issue journey assigned to backend agent on a new test file only.
- T10 procurement interfaces completed: 131 unique focused tests across the relevant suites, frontend typecheck, and synthetic browser interactions at 390/768/1440 px passed. Explicit issuance is separate from internal approval for workflow v2; final backend enforcement is being checked. Finance/payment preparation-state follow-up is in progress.
- T11 real isolated Mongo lifecycle passed in `collaborative-estimation-journey.replica-set.test.ts`: initiation, invitation acceptance, requirement resolution, pre-approval, design approval, final approval, Super Admin payment, explicit purchase-order issue, vendor assignment/execution handoff. Mail, PDF/storage and vendor induction used test doubles; no external communication occurred.
- T12 preliminary independent backend review found five actionable gaps: old Project Status approval/payment assumptions; procurement projection after final approval but before payment; captured-actor authorization races; early Site execution deadlines/KPI; and client assistant approved-source selection. Bounded owners implemented fixes and regression tests. Final integrated review remains pending until all writers finish.
- Review follow-up evidence: Site workflow/domain/routes/KPI 120/120 and simultaneous activation replay passed; status service 25, Mongo 7, domain 84, routes 1, daily critical 15, and leads 42 passed. Root final source/finance/procurement/assistant/API/repository lane passed 192/192 across five files in `/tmp/lisno-estimation-final-root-fixes.log`.
- Preliminary full backend run: 5,739 passed and 21 failed across 282 files (`/tmp/lisno-estimation-backend-full.log`). Nine changed-contract fixture failures have been corrected and their affected checks rerun. Twelve failures across five unchanged knowledge/chat-typing suites reproduced on an isolated archive of HEAD with the same dependencies (`/tmp/lisno-estimation-baseline-checks.log`); they are pre-existing and outside this workflow change. Final integrated suites have not yet run.
- Focused counts above overlap and must not be summed as a final suite result. No dependencies, live migration, deployment, commit, push, seed, real mail, or production mutation performed.
- Final review follow-up: captured-identity and concurrent requirement revocation tests passed 27/27. V2 basket submission/normal/replayed decisions force explicit issue even for older stored auto-issue flags; issuance and tender lanes passed 85/85.
- Final frontend review corrected preparation progress and the pre/final amount label. Finance workflow/payment tests passed 22/22 and typecheck passed. The added finance browser command stalled without screenshots/results; the task-owned browser was closed. Existing rendered tests cover the payment/reference/attestation/role states; this browser check is explicitly unverified.
- Final backend review additionally found Site preparation in finance overdue enrichment and dashboard execution-lineage validation. Filters now exclude unactivated placeholders; dashboard finance lineage uses effective baseline and pinned approval versions. V2 historical approval events require immutable rounds rather than legacy mutable fallback. Focused regressions and final reviewer confirmation are in progress.
- Final reporting regressions passed 47/47 (6 collaborative finance and 41 dashboard Mongo tests). The reviewer reread the released final worktree and reported no remaining confirmed P1/P2 findings; all product writers are finished.
- Root repeated the stalled finance browser check with a fresh isolated local server and a bounded script. It passed at 390/768/1440 px: no overflow, receipt required, one versioned/idempotent payment command, preparation copy present, no invented receipt timestamp, and no page/console errors. Screenshots and results are `/tmp/lisno-client-invitation-qa/finance-payment-final-*`. The task-owned browser/server were closed. This resolves the earlier browser limitation; it uses synthetic API fixtures, while the real isolated backend flow is covered by T11.
- Final suite preparation: both typechecks passed. The verification runner stopped an invalid sandboxed backend attempt after local-server `EPERM`, preserved its log, and restarted with the approved escalation. Frontend authorization test expectations were reconciled with the identical 195-entry backend/frontend permission contract; protected registry count 46 already existed in HEAD. This test-only fix passed 6/6. Full suites and builds remain in progress.

## Rollout notes, not executed

- The request uniqueness index now includes `ready_to_issue` along with `pending_approval` and `changes_requested`. Before enabling new writes on an existing database, use `backend/src/migrations/project-purchase-order-request-index.ts` in its default dry-run mode with an explicit database; resolve duplicate open-request/index-definition conflicts without deleting history. A live apply requires separate authorization, a verified backup, quiesced request writes, metadata capture, and a final dry-run. The tool builds the stricter v2 index before dropping the legacy index.
- Application index initialization registers the new invitation/requirements/preparation/finance-revision collections. Deploy the version-aware backend and matching frontend together after compatibility checks. Invitation delivery requires the established mail provider to be enabled; project creation remains recoverable when it is disabled.
- No existing project is converted automatically. Eligible staff must use the audited transition command. Issued/completed projects remain on their original workflow.
- Index rollback refuses any `ready_to_issue` request and restores legacy uniqueness before removing v2. Application rollback to a binary that cannot read v2 lifecycle data is unsafe once new projects or conversions exist. Retain compatible readers and immutable approval/finance history.

## Implemented acceptance coverage

This maps requirements to current regression locations. Final verification results are recorded separately; the table alone is not a passing-test claim.

| Criteria | Principal regression evidence |
| --- | --- |
| AC1–AC2 | `project-client-invitations.test.ts`, `project-client-invitations-mongo.replica-set.test.ts`, existing invitation/admin/auth suites; frontend `ProjectInvitationAcceptancePage`, `ProjectClientInvitationStatus`, initiation and signup tests. |
| AC3 | `estimate-requirements.replica-set.test.ts`, central authorization/route contract tests; frontend `ClientEstimateRequirements.test.tsx`. |
| AC4–AC5 | `estimate-collaboration.replica-set.test.ts`, estimate publication/client-decision suites, design workflow scope tests; frontend staff collaboration/requirements/workspace and client-review tests. |
| AC6 | Design workflow/domain/replica tests, `project-workflow-mongo.replica-set.test.ts`, project status and KPI/daily-critical regressions. |
| AC7 | Procurement workspace, basket tender/reconciliation and project procurement replica suites; frontend procurement lifecycle/comparison/workspace tests. |
| AC8 | `project-purchase-order-basket-issue.replica-set.test.ts`, individual purchase-order and request replica tests, plus `collaborative-finance-issue.replica-set.test.ts`; explicit v2 automatic-issue suppression cases. |
| AC9–AC10 | Finance/domain/route/replica suites, asymmetric `collaborative-finance-issue.replica-set.test.ts`, status and dashboard regressions; frontend payment and workflow control tests. |
| AC11 | Guarded transition cases in `estimate-collaboration.replica-set.test.ts`; existing legacy workflow, finance, procurement and invitation suites remain in scope. |
| AC12 | `collaborative-estimation-journey.replica-set.test.ts` for real isolated service handoff; existing lead/room/designer/worker/vendor suites, rendered frontend regressions, and synthetic browser checks. |

## Final verification record

Verification finished on 2026-10-13 after all product writers released ownership. The independent integrity reviewer reported no remaining confirmed P1/P2 findings. This is a local implementation handoff with known suite limitations, not a claim of a green repository or production deployment.

| Check | Exact command / scope | Result |
| --- | --- | --- |
| Backend types | `cd backend && npm run typecheck` | Passed, exit 0. |
| Frontend types | `cd frontend && npm run typecheck` | Passed, exit 0. |
| Backend build | `cd backend && npm run build` | Passed, exit 0. |
| Frontend build | `cd frontend && npm run build` | Passed, exit 0; Vite warned about chunks exceeding 500 kB. |
| Backend full suite | `cd backend && npm test -- --maxWorkers=2` | 5,781 passed, 13 failed; 276 passed and 6 failed files. Twelve failures reproduced on isolated HEAD; the additional chat-route failure passed a subsequent 6/6 focused run on both current code and HEAD. |
| Frontend full suite | `cd frontend && npm test -- --maxWorkers=2` | 4,862 passed, 33 failed; 306 passed and 11 failed files. Eight contract-fixture failures were corrected and affected tests rerun; 22 persistent failures reproduced on HEAD; three other failures did not recur in focused checks. See classification below. |
| Final reporting regression | `cd backend && npm test -- tests/collaborative-finance-issue.replica-set.test.ts tests/super-admin-dashboard-mongo.replica-set.test.ts --maxWorkers=2` | 47/47 passed, including preparation task clocks/overdue exclusion, activation and pinned immutable reporting sources. |
| Complete isolated lifecycle | `cd backend && npm test -- tests/collaborative-estimation-journey.replica-set.test.ts` | 1/1 passed. Real isolated Mongo services cover initiation through final payment, explicit issue and vendor execution handoff; external mail, PDF/storage and vendor induction use test doubles. |
| Rendered UI | Focused client, staff, procurement, invitation and finance tests, plus browser fixtures at 390/768/1440 px | Passed for the changed workflow states. Browser checks verify responsive layout, strict versioned commands, preserved drafts, required receipt reference and absence of page errors. Browser API fixtures are synthetic. |
| Repository hygiene | `git diff --check`, whitespace checks for new source files, `git status --short`, package/lockfile diff | Passed; no dependency or lockfile changes. Task browser outputs moved outside the repository. |

### Full-suite failure classification

- Backend: 12 pre-existing failures were reproduced on an isolated archive of HEAD with the same dependencies: knowledge basket quality (1), knowledge item service (1), knowledge reference service (2), knowledge routes (1), and chat typing Mongo (7). The additional full-run chat-route 401-versus-403 failure passed all six file tests on both current code and HEAD when rerun. No chat fix was made on this evidence.
- Frontend: eight failures concerned intentionally changed contracts in authorization, invitation-only signup, dashboard payment guidance and measurement cache invalidation. Test fixtures now reflect those contracts. Authorization passed 6/6; dashboard 31/31; measurement 14/14; router 138/139, retaining only its existing room-picker failure.
- Frontend: 22 persistent failures matched isolated HEAD: KnowledgeItemWorkspaceLayout (4), KnowledgeModeLayout (1), KnowledgeScreens (15), PasswordResetPage (1), and the router's old Master Bedroom expectation (1). They remain outside this change. The six-file baseline run also had two different vendor-banking timing failures; those are not counted as matching current failures.
- Frontend: full-run initiation and accessibility failures passed the subsequent combined run (57/57). The vendor legacy-labor case passed on both current code and HEAD (1 passed, 58 skipped in each focused run). These full-run failures were not reproducible; this does not establish absence of timing sensitivity.
- The full frontend suite was not repeated after the final test-only fixture corrections. Affected suites and focused failures were rerun as recorded above. No product sources changed after the final review and suite launch.
- The first sandboxed backend attempt encountered local-server `EPERM` and was stopped. Its log is preserved separately and is not treated as product verification; the full result above comes from the escalated run.

### Evidence and operational limits

- Full check logs: `/tmp/lisno-pre-post-estimation-final-{backend,frontend}-{typecheck,tests,build}.log`.
- Baseline evidence: `/tmp/lisno-estimation-baseline-checks.log` and `/tmp/lisno-pre-post-estimation-final-frontend-baseline-complete.log`. The isolated HEAD copy was temporary and did not alter the worktree.
- Chat-route focused rerun: `cd backend && npm test -- tests/project-chat-routes.test.ts --maxWorkers=2`, 6/6 on current and HEAD; logs `/tmp/lisno-pre-post-estimation-final-backend-chat-rerun.log` and `/tmp/lisno-pre-post-estimation-final-backend-chat-baseline.log`.
- Focused fixture logs: `/tmp/lisno-final-contract-fixtures.log`, `/tmp/lisno-final-router-fixture.log`, `/tmp/lisno-pre-post-estimation-final-frontend-initiation-accessibility.log`, and `/tmp/lisno-pre-post-estimation-final-frontend-vendor-{rerun,baseline-rerun}.log`.
- Final reporting: `/tmp/lisno-estimation-final-review-reporting.log`. Browser evidence: `/tmp/lisno-client-invitation-qa/`, including `finance-payment-final-results.json` and screenshots. Task-owned browser sessions and local servers were closed; CLI outputs were moved to that temporary evidence directory.
- No lint command exists, so lint was not run. OCR was unchanged and not tested. Live mail delivery, production data, live index migration, deployment, seeds, commits and pushes were not performed.
- Existing test/build warnings remain visible in the logs: deprecated Mongoose `new` options, unmatched MSW requests and large frontend chunks. No dependency upgrade or bundle refactor was included in this workflow change.
- Before rollout, follow the index compatibility, backup, dry-run and rollback notes above. Existing approved/issued artifacts and original finance baselines are retained; eligible legacy project transitions remain explicit and audited.
