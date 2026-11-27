# Procurement project lifecycle implementation plan

Date: 2026-11-27
Status: Implemented in approved Mode A. Final scoped verification passed on 2026-11-28; repository-wide suites remain non-green as detailed below.
Source of truth: [Approved procurement lifecycle specification](../specs/2026-11-27-procurement-project-lifecycle-design.md).
Approval record: The user approved the specification on 2026-11-27. This plan records that approval without editing the specification during the task-plan stage.

## Outcome and approved scope

Deliver five responsive web tabs for each accessible Procurement project: Bids & Vendor Appointment; Payments; Progress & Inspections; Quality, Delivery & Handover; Project Signoff.

Preserve current sourcing and commercial approvals. Add explicit vendor-payment records and internal reminders, ordered Procurement review rounds, two or three physical inspections across the entire project, evidence-backed handover, and Procurement readiness integrated into existing Client acceptance and final Super Admin closure.

Approved defaults: seven-calendar-day Procurement rounds, configurable shorter; two planned project inspections with three selectable before inspections begin; random dates persisted within feasible inspection windows; reminders at 09:00 three days before and on the payment due date; overdue escalation within 15 minutes in healthy operation and at most one repeat per local day. Default timezone is `Asia/Kolkata`.

P1 checks precede P2 checks, which precede P3 checks **within each round**. A valid blocked/not-started observation counts as a check; completed work is not required to unlock the next group. Urgent issue reporting and inspections remain available out of sequence.

Payment recording documents external payments. No bank transfer integration, vendor messaging, production mutation, native navigation redesign, dependency installation, or migration execution is planned.

## Current-state constraints and preservation

- The initial `git status --short` was captured during specification discovery and rechecked at this stage. The worktree already contains substantial unrelated changes.
- Shared dirty integration targets include `backend/src/domain/route-operations.ts`, `backend/src/domain/audit-actions.ts`, `backend/src/openapi.ts`, `backend/src/repositories/{types,memory,mongo}.ts`, `backend/src/services/{project,project-workflow}.service.ts`, `frontend/src/api/types.ts`, related shared tests, and `mobile/src/contracts/operations.ts`. Existing changes include design-layout requirements and client execution choices. They are not owned by this task.
- Before implementation, capture the then-current dirty set and the actual diff of every target. Assign a dirty file only after its existing changes are understood. Keep shared targets under primary-agent ownership and make additive changes without reformatting unrelated content.
- `frontend/src/features/procurement/ProcurementDashboardPage.tsx` is currently a **Super Admin vendor-directory dashboard**. Staff project work is in `ProcurementWorkspace.tsx`. Both staff and Admin need the appropriate alert surface; do not rely on the misleading component name to place staff alerts.
- `NotificationBell.tsx` composes separate chat, execution, and basket feeds. Add a distinct procurement lifecycle source without converting it into chat or replacing existing feeds.
- Application service construction, scheduler startup, and shutdown are wired through `backend/src/app.ts` and `backend/src/server.ts`; tests must not start live timers implicitly.
- Mobile authorization/operation mirrors are verified against backend source by `mobile/scripts/contract-drift.test.ts`. Updating those mirrors and running mobile contract checks is required even though new native screens are outside scope.
- Existing invoice assessments accept only active, project-authorized Finance actors. Add dedicated Admin payment oversight commands; do not broaden personal Finance/Procurement services into general Super Admin impersonation.
- Existing Project Manager evidence and snag operations have their own ownership rules. Reuse storage primitives and canonical snag records through explicit internal integrations, never by forging a Site Manager actor or passing foreign evidence IDs as native PM attachments.

## Ownership model

Only the primary agent works before the execution-mode choice. The roles below are implementation ownership labels, not authorization to spawn agents now.

| Owner | Exclusive responsibility during its assigned task |
| --- | --- |
| Primary | Shared contracts, permission/operation registries, audit inventory, OpenAPI aggregation, application wiring, shared query invalidation, integration with existing services/components, this plan, and final reconciliation. |
| Payments implementer | New payment domain/models/services/routes and dedicated payment tests. No changes to shared registries, existing Finance services, or completion. |
| Progress implementer | New review-round and inspection domain/models/services/routes and dedicated tests. No changes to Configuration, vendor execution, or shared completion services. |
| Handover implementer | New checklist/handover/finding domain/models/services/routes and dedicated tests. Existing snag/quality integration remains primary-owned. |
| Alerts implementer | New alert feed, scheduler, lease, and health service modules/tests. Startup and existing dashboard integration remain primary-owned. |
| Workspace implementer | New project-tab components and responsive styles, plus `ProcurementProjectPage.tsx` and dedicated UI tests. No shared API/auth/router/provider writes. |
| Finance/oversight UI implementer | New Finance/Admin lifecycle screens, payment authorization/correction/retention controls, and their tests. Existing Finance/Admin page mounts remain primary-owned. |
| Notification UI implementer | New lifecycle notification provider/inbox/attention components and tests. Existing bell/provider/workspace/dashboard mounts remain primary-owned. |
| Integrity reviewer | Read-only integrated audit after writers finish. |
| Verification runner | Run final checks against the reconciled worktree after confirmed findings are fixed; no product-source edits. |

In Mode A, tell every writer they are not alone in the worktree, must preserve others' edits, and must stop at their file boundary. Hand off shared-file changes as concrete integration requirements. In Mode B, the primary agent performs all roles sequentially without implementation/review subagents.

## Contract decisions for implementation

### Files and shared interfaces

The primary owns these new cross-subsystem foundations:

- `shared/procurement/projectLifecycle.ts`: re-exports transport-only types from `lifecycle.ts`, `payments.ts`, `reviews.ts`, `inspections.ts`, `handover.ts`, and `alerts.ts` in the same directory. No Mongoose or browser imports.
- `backend/src/contracts/procurement-lifecycle.ts`: service-facing contracts and typed readiness/alert-source interfaces, importing transport types.
- `backend/src/domain/procurement-lifecycle.ts`: common command/query validation, lifecycle policy, stable blocker codes, and date validation.
- `backend/src/models/ProcurementLifecycleState.ts` and `ProcurementLifecycleCommand.ts`: lifecycle activation/policy/current revision and transactional idempotency/audit-result coordination.
- `backend/src/services/procurement-lifecycle/{access,transaction,source,evidence}.ts`: scoped actor checks, transaction/version/idempotency helpers, canonical source resolution, and authenticated evidence attachment/read behavior.
- `backend/src/services/procurement-lifecycle.service.ts`: summary and explicit setup/adoption orchestration.
- `backend/src/routes/procurement-lifecycle.ts` and `backend/src/openapi/procurement-lifecycle.ts`: common lifecycle routing and OpenAPI schema inventory.
- `frontend/src/features/procurement/lifecycle/{api,queries}.ts`: typed transports, scoped query keys, capability checks, and commands used by all UI slices.

Separate domain-owned files are listed under each task. They import the agreed foundations; they must not create competing actor checks, payment totals, source resolvers, or completion calculations.

Common command envelope: `expectedVersion`, `sourceDigest`, `idempotencyKey`, and a strict action-specific payload. Version zero is accepted only for explicit creation. Server responses carry `serverNow`, `version`, `sourceDigest`, `availability`, structured `blockers`, and `allowedActions` where relevant. Histories use bounded pagination. Identical authorized retries replay the committed response; altered payloads conflict. Authorization is rechecked before replay.

Readiness consumers receive typed, side-effect-free functions accepting the caller's Mongo session. They must not open nested transactions. All participating completion, source-changing, and financial commands use the agreed project/order coordination writes so snapshot isolation cannot admit write skew.

### API inventory

Base paths below are literal prefixes:

- **P** = `/procurement/projects/:projectId/lifecycle`, for current assigned Procurement.
- **F** = `/finance/projects/:projectId/procurement-lifecycle`, for project-authorized Finance.
- **A** = `/admin/projects/:projectId/procurement-lifecycle`, for dedicated Super Admin oversight.

Each verb/path must become a separate canonical route-operation entry; prefix notation is only for this document. Service dispatch validates the specific action and actor, not just possession of the route permission.

| Surface | Exact suffix and methods | Behavior |
| --- | --- | --- |
| P | `GET /`; `POST /setup`; `POST /policy` | Read summary; explicitly activate/adopt with prospective policy; reasoned policy change. Reads do not initialize state. |
| P, F, A | `GET /payments`; `GET /payments/history` | Authorized payment projections and immutable history; restrict F to relevant financial information. |
| P | `POST /payment-dates`; `POST /payments`; `POST /payment-correction-requests` | Propose dates; record authorized external payment; request correction. |
| F, A | `POST /payment-dates`; `POST /payment-authorizations`; `POST /payments`; `POST /payment-reversals`; `POST /payment-reconciliation`; `POST /retention` | Confirm/revise dates; approve amount allocation/advance; record payment; append reversal/correction; establish historical opening state/reconcile source changes; Finance approval or Admin acknowledgement of retention. Action/role validation preserves the distinct retention decisions. |
| P | `GET /reviews`; `GET /reviews/:roundId`; `POST /reviews/actions` | Read rounds; open/reconcile/pause/resume a round; submit/correct an item check; finalize with source/version checks. |
| P | `GET /inspections`; `POST /inspection-plan`; `POST /inspections`; `POST /inspections/:inspectionId/corrections` | Configure project quota/windows; record a visit; append an attributed correction. Plan command distinguishes initial setup from reasoned rescheduling. |
| P | `POST /findings`; `GET /handover`; `POST /handover/actions` | Report urgent finding at any time; read/save/submit/correct checklist and handover revisions. |
| P | `GET /readiness`; `POST /readiness/actions` | Submit or withdraw Procurement readiness against current sources; never directly complete the project. |
| A | `GET /`; `GET /reviews`; `GET /reviews/:roundId`; `GET /inspections`; `GET /handover`; `GET /readiness`; `POST /correction-requests` | Oversight reads and explicit request for Procurement correction, with no forged staff signatures. |
| P, F, A | `POST /evidence`; `GET /evidence/:evidenceId` | Authenticated evidence operations, restricted by actor, record purpose, and project. F sees financial evidence only; A cannot use an evidence upload to sign a Procurement inspection. |
| Global | `GET /procurement-lifecycle/notifications`; `POST /procurement-lifecycle/notifications/:notificationId/read` | Current-recipient internal feed; read acknowledgement does not resolve an obligation. |
| Admin | `GET /admin/procurement-lifecycle/health` | Scheduler last success, bounded backlog/failure diagnostics; no private payloads or credentials. |

Use the existing `POST /admin/projects/:projectId/complete` for final closure. Extend its authoritative blockers and immutable decision snapshot; do not add a second final-completion endpoint. Existing Site Manager/Client completion endpoints retain their own authority and receive consistent readiness blockers.

New permission families: `procurement.lifecycle.read`, `procurement.lifecycle.manage`, `procurement.lifecycle.review`, `procurement.lifecycle.inspect`, `procurement.lifecycle.handover`, `procurement.lifecycle.readiness`, `procurement.payments.read`, `procurement.payments.propose`, `procurement.payments.record`, `finance.procurement_payments.manage`, `procurement.lifecycle.oversight`, `procurement.lifecycle.admin_manage`, `procurement.lifecycle.evidence.read`, `procurement.lifecycle.evidence.manage`, and `procurement.lifecycle.notifications.read`. Restrict grants according to the approved role matrix. Keep Admin reads, Admin overrides, personal Procurement actions, personal Finance actions, and self notification operations distinct in the registry.

### Evidence and finding boundary

Create `ProcurementLifecycleEvidence.ts` with purpose, parent entity, project, uploader, checksum/type/size, opaque storage reference, and cleanup bookkeeping. Reuse existing upload validation and `FileStorage`/workflow evidence helpers. Private payment evidence is not exposed through broadly readable PM evidence APIs.

New Procurement findings reference existing canonical `ProjectSnag` records through a stable `procurementFindingId`/`snagId` link, with immutable origin metadata and deduplication. The primary owns the internal bridge and any additive model/DTO changes. Native PM repair/verification evidence stays on PM's evidence path. Origin inspection/checklist evidence remains on its owning endpoint, with an explicitly authorized work-scope read for the assigned verifier if needed. Do not add a second defect-resolution authority or turn foreign evidence IDs into PM-owned attachments.

## Dependency-ordered tasks

Only one parent phase is in progress at a time. Child tasks inside a phase may run concurrently where the schedule below allows it. Execution is finished; final evidence and limits are recorded below.

### T0. Establish baseline and confirm integration seams

Owner: primary. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC1–AC12 preservation prerequisites.

1. Recapture dirty paths and target diffs. Identify any edits made since this plan; preserve them.
2. Inspect current authorization grants, assigned-project read scope, Finance access, issued order/certification sources, source mutation locks, completion fences, canonical snag APIs, and evidence lifecycle. In Mode A, independent read-only audits may cover Finance lineage, completion/authorization, and UI consumers before assigning writers.
3. Run focused existing procurement priority, basket monitor, quality/snags, completion, authorization/OpenAPI, and mobile contract checks to establish a baseline. Record failures with exact commands; do not treat unrelated failures as new regressions or silently repair unrelated work.
4. Confirm available Mongo replica-set helper/binary and browser tooling. Use synthetic local fixtures, not production data or repository seed scripts.

Exit: baseline evidence and explicit file owners recorded here; no unresolved ambiguity about the sources required by T1.

### T1. Implement shared contracts, access, source lineage, and lifecycle foundation

Owner: primary. Dependencies: T0. Acceptance: AC1, AC2, AC6, AC10, AC11.

Owned paths: common files listed above; `backend/src/domain/{authorization,route-operations,audit-actions}.ts`; permission-policy version and mirrors in `backend/src/services/auth.service.ts`, `frontend/src/api/authorization-contract.ts`, `mobile/src/contracts/{authorization,operations}.ts`; common lifecycle tests and fixtures. Preserve existing dirty changes. Shared `frontend/src/api/types.ts` is changed only if an existing public shape requires it.

- Establish DTOs, enum values, error/blocker codes, authorized role/action maps, internal `readPaymentReadiness`, `readReviewReadiness`, `readInspectionReadiness`, `readHandoverReadiness`, and alert-source interfaces before domain writers start.
- Implement canonical current-source projection using stable approved source-line/order/assignment IDs. Priority uses the existing current-revision selector. Preserve issued price and approval snapshots separately from current Configuration metadata.
- Add explicit lifecycle setup/adoption and prospective policy events. Before preparation, authorized reads return prerequisites. Historical orders require explicit Finance opening-payment reconciliation; absent records never become invented zero balances. Already completed projects retain legacy closeout.
- Implement transaction coordination, active/current actor checks, command replay storage, audit plumbing, strict runtime schemas, and unique indexes. Source changes and all later completion-affecting commands must use a compatible shared fence.
- Add authenticated purpose-scoped evidence upload/read/attachment helpers with cleanup recovery. Separate storage failure from business-command failure and preserve cancellation/idempotency behavior.
- Create reusable asymmetric test fixtures under `backend/tests/fixtures/procurement-lifecycle.ts` and `frontend/src/test/fixtures/procurementLifecycle.ts`.

Verification: `procurement-lifecycle-domain.test.ts`, `procurement-lifecycle-access.replica-set.test.ts`, `procurement-lifecycle-evidence.replica-set.test.ts`, and `procurement-lifecycle-routes.test.ts` under `backend/tests`; malformed commands, setup retries, current-assignment revocation, private evidence, unavailable sources, and no writes on GET. Validate new and existing route declarations without shipping reachable placeholder handlers.

### T2. Implement payment schedules, authorizations, transactions, and history

Owner: payments implementer. Dependencies: T1. Acceptance: AC2, AC3, AC11.

Owned new files:

- `backend/src/domain/procurement-payments.ts`.
- `backend/src/models/ProcurementPaymentObligation.ts`, `ProcurementPaymentAuthorization.ts`, `ProcurementPaymentTransaction.ts`, `ProcurementPaymentCorrection.ts`, and `ProcurementPaymentRetention.ts`.
- `backend/src/services/procurement-payments/{source,projection,authorization,transactions,reconciliation}.ts` and `backend/src/services/procurement-payments.service.ts`.
- `backend/src/routes/procurement-payments.ts` and dedicated `backend/tests/procurement-payments*` tests.

Implement immutable due-date and authorization history; current certification and Finance-assessment checks; invoice gross/TDS/net allocations; explicitly authorized advances; partial and multi-milestone same-order payments; required reference/evidence; reasoned reversal/correction; correction requests; Finance opening-state reconciliation; Finance retention approval plus separate Admin acknowledgement.

Enforce exact allocation totals, safe integers, unique normalized external transaction references within the defined project/vendor/method scope, and replay digest consistency. Legitimate reference conflicts need an explicit reasoned reconciliation path, not silent duplication. Financial corrections append records and never rewrite originals.

Return one payment projection for monitor, certification, lifecycle, alert, and completion consumers. Provide an in-session readiness adapter. Expense ledger totals and margins are not modified by payment commands. Historical source changes retain records and block unsafe new allocations. Post-signoff reversals raise a financial exception without rewriting the closeout decision.

Verification: focused domain tests and `procurement-payments.replica-set.test.ts`; duplicate command/reference, reference conflict, overflow, two concurrent final payments, reversal versus payment/signoff, wrong project/vendor, inactive actor, advance-to-invoice reconciliation, zero milestones, assessment reduction, TDS, partial payments, future retention, and unknown legacy history. Assert original `FinanceLedgerEntry`/bucket cost totals are unchanged.

### T3. Implement ordered review rounds and project inspections

Owner: progress implementer. Dependencies: T1. Acceptance: AC5, AC6, AC7, AC8, AC11.

Owned new files:

- `backend/src/domain/procurement-progress.ts`, `procurement-inspections.ts`.
- `backend/src/models/ProcurementReviewRound.ts`, `ProcurementProgressCheck.ts`, `ProcurementInspectionPlan.ts`, `ProcurementInspectionVisit.ts`.
- `backend/src/services/procurement-progress.service.ts`, `procurement-inspections.service.ts`.
- `backend/src/routes/procurement-progress.ts`, `procurement-inspections.ts` and matching `backend/tests/procurement-progress*` / `procurement-inspections*` tests.

Implement seven-day rounds, due-state derivation, required observations/delay/recovery notes, immutable original deadlines, attributed corrections, and prospective pause/resume. Preserve observed versus recorded time. Older missed rounds remain visible; submitting late does not make them on-time. Current checks satisfy the current round while historical misses remain audit history rather than impossible perpetual completion requirements.

Enforce P1/P2/P3 order transactionally across required active appointed items; skip empty groups, accept blocked/not-started updates, and show exact outstanding blockers. Unresolved priorities block finalizing a round. Mid-round source changes require reconciliation against current Configuration and retain prior submissions.

Create two/three-visit plans project-wide. Inject clock/randomness for tests and use server randomness for persisted dates. Validate feasible non-overlapping windows, including distinct times on short projects. Same-command retries cannot reroll. Preserve original dates through rescheduling and prevent quota reduction after the first visit. Record explicit item/vendor coverage, notes, delay findings, and corrections; additional corrective visits do not replace missing planned slots without an explicit validated link.

Expose in-session review/inspection readiness and bounded upcoming/missed obligations to T5. Send urgent findings through the typed T4 bridge without treating them as out-of-order progress checks.

Verification: `procurement-progress.test.ts`, `procurement-progress.replica-set.test.ts`, `procurement-inspections.test.ts`, `procurement-inspections.replica-set.test.ts`; simultaneous P1/P2 submissions, mixed basket priorities, duplicate names/different rooms, draft-before-active Configuration, changed appointment/source, late/backdated reports, pause, no schedule, stored-randomness retries, project-wide counting, required third visit, and no overwritten notes.

### T4. Implement quality, delivery, handover, and findings

Owner: handover implementer for new modules; primary for canonical snag/evidence integration. Dependencies: T1. Acceptance: AC9, AC11.

Owned new files:

- `backend/src/domain/procurement-handover.ts`.
- `backend/src/models/ProcurementHandover.ts`, `ProcurementHandoverRevision.ts`, `ProcurementFinding.ts`.
- `backend/src/services/procurement-handover.service.ts`, `procurement-findings.service.ts`.
- `backend/src/routes/procurement-handover.ts` and dedicated `backend/tests/procurement-handover*` tests.

Implement scope-aware Quality/Delivery/Handover checklists using configured quality identities/revisions and existing delivery/quality sources. Support explicit answers, mandatory evidence, restricted reasoned N/A, draft and immutable submitted/corrected versions, and source-change reconciliation. Missing required Configuration is a visible blocker.

Use one canonical finding/snag for each failed actionable check, with deterministic origin identity and one current link. Preserve assigned-verifier repair/verification authority. Existing signed quality audits are read without alteration; inspection counts do not imply quality acceptance. Return in-session handover readiness and immutable submitted references.

Primary-owned bridge: `backend/src/services/procurement-lifecycle/findings-bridge.ts`, narrowly additive `ProjectSnag` origin fields, and required existing PM DTO/read integration. The bridge records Procurement as the real reporter, preserves PM verification, and carries authorized origin context without broadening existing PM command roles. Writer requests these changes rather than editing shared PM sources.

Verification: `procurement-handover.test.ts` and `procurement-handover.replica-set.test.ts`; configuration revisions, evidence ownership/type/count, mandatory versus optional N/A, duplicate failed submissions, snag verification, immutable audit history, source changes, and Procurement attempts to sign as Site Manager.

### T5. Implement background alerts and delivery health

Owner: alerts implementer. Dependencies: T1 and stable/readable T2–T4 obligation adapters. Acceptance: AC4, AC7, AC8, AC11.

Owned new files: `backend/src/models/ProcurementLifecycleNotification.ts`, `ProcurementLifecycleSchedulerLease.ts`; `backend/src/services/procurement-lifecycle-notifications.service.ts`, `procurement-lifecycle-scheduler.ts`; `backend/src/routes/procurement-lifecycle-notifications.ts`; dedicated notification/scheduler tests. App/server wiring remains primary-owned.

- Derive reminders, overdue payment escalations, setup gaps, missed reviews/inspections, unresolved corrective actions, and post-closeout financial exceptions from canonical state.
- Use persisted leases, token-checked renewal, stable cursors, bounded batches, unique semantic dedupe keys, and injectable clocks. No process-local-only scheduler state. Recheck outstanding balance/current assignment before publishing and when serving the feed.
- Keep local date calculations timezone-aware; distinguish reminder time from due-date expiry. Coalesce stale reminders after downtime, while preserving overdue history and one-per-day repeats. Target a scheduler cadence that meets the approved 15-minute healthy-operation bound.
- Resolve current active Procurement and sole active Super Admin recipients. Missing/ambiguous Procurement assignment routes attention to Admin. Keep read acknowledgement separate from underlying condition resolution and preserve recipient privacy after reassignment.
- Continue retained-payment reminders after project completion. Expose safe last-success/backlog/failure health without asserting email delivery.

Verification: `procurement-lifecycle-notifications.replica-set.test.ts`, `procurement-lifecycle-scheduler.test.ts`, `procurement-lifecycle-scheduler.replica-set.test.ts`; local-midnight/09:00 boundaries, duplicate workers, lease expiry, retries after partial batches, outage catch-up, settlement/reversal races, stale recipients, and no open browser.

### T6. Integrate canonical readiness, completion, existing consumers, and server wiring

Owner: primary. Dependencies: T2–T5. Acceptance: AC2, AC3, AC4, AC6, AC9, AC10, AC11.

New owned files: `backend/src/services/procurement-readiness.service.ts`, `backend/src/models/ProcurementReadinessRevision.ts`, and `backend/tests/procurement-completion.replica-set.test.ts`.

Existing integration targets: `backend/src/services/project-completion.service.ts`, `site-completion.service.ts`, `site-completion-fence.ts`, `project-purchase-order-basket-monitor.service.ts`, `project-purchase-order-invoice-assessment.service.ts`, `project-manager/vendors.ts`, relevant source-changing order/assignment/configuration commands identified in T0, `backend/src/models/{Project,ProjectCompletionDecision}.ts`, `backend/src/domain/project-completion.ts`, applicable OpenAPI modules, `backend/src/app.ts`, and `backend/src/server.ts`.

1. Compose one authoritative readiness calculation with stable actionable blocker codes. Save immutable Procurement declaration/withdrawal history. Keep Site Manager verification, Client acceptance, scope coverage, pending orders, and verified-snags checks intact.
2. Add lifecycle setup/adoption/readiness requirements to final completion, including direct old-endpoint callers. Completed legacy projects remain historical; active projects without setup are blocked with an explicit action.
3. Atomically snapshot readiness, payment reconciliation/retention, inspection-plan/visit, and handover revisions in the final decision. Coordinate all participating source/financial/defect mutations with the same project fence and appropriate order/round versions. Do not rely only on read-then-check snapshots.
4. Update basket monitor and certification payment reads from T2. Extend frontend monitor DTOs additively; keep unknown history distinguishable. Invoice-assessment changes invalidate stale payment authorizations while preserving payments. Do not duplicate expense costs or change GST/margin rules.
5. Complete primary-owned canonical finding/evidence integration; ensure new Procurement reports enter the existing verification workflow with true actor identity.
6. Register routers, schemas, permissions, policy version/mirrors, service adapters, cleanup, scheduler startup/shutdown, and health. Require explicit scheduler startup, disable it in ordinary test app construction, and stop cleanly on shutdown.

Verification: completion/signoff versus reversal/new snag/Configuration/assignment/order/assessment changes; stale submitted readiness; retained future balances; existing completion-site/client flows; API inventory and Super Admin non-impersonation; transactional failures leave no partial audit/state. Test monitor/payment/cost reconciliation across two unequal projects.

### T7. Build project tabs, Procurement actions, and responsive states

Owner: workspace implementer. Dependencies: T1 transport/UI contracts, T2–T4 stable payloads. Final integration requires T6. Acceptance: AC1, AC2, AC3, AC5–AC12 as user-visible behavior.

Owned files: `frontend/src/features/procurement/ProcurementProjectPage.tsx`; new files in `frontend/src/features/procurement/lifecycle/` named `ProjectLifecycleTabs.tsx`, `LifecycleSetupPanel.tsx`, `PaymentsTab.tsx`, `PaymentHistory.tsx`, `ProgressInspectionsTab.tsx`, `ProgressRound.tsx`, `InspectionPlan.tsx`, `InspectionEditor.tsx`, `HandoverTab.tsx`, `SignoffTab.tsx`, `lifecycle.css`, and matching tests. Common `api.ts`/`queries.ts` remain primary-owned.

- Preserve existing sourcing components and basket scope; compose them under the first tab. Use query parameter `tab=vendors|payments|progress|handover|signoff`, default `vendors`; preserve unrelated parameters such as PM navigation and basket selection. Refresh/back/forward and alert links retain context.
- Add explicit setup/adoption controls with server capabilities. Historical payment reconciliation belongs to Finance, not an automatic Procurement checkbox.
- Implement date proposal, payment recording/evidence, correction request, history/reversal visibility, current due/overdue balance, and unknown-state presentation. Use backend money/status projections.
- Implement current round P1/P2/P3 lists, ordered submission blockers, notes/delay/recovery forms, immutable history, inspection planning/visit/coverage/corrections, and unrestricted urgent-finding entry.
- Implement scoped checklist, delivery/handover evidence, canonical finding links, and readiness declaration with blockers linking back to their target tab/item. Final completion remains unavailable to Procurement.
- Retain project context in the shared header; keep bulky optional project details progressive so the tabs remain findable. Handle loading, unavailable/preparation, empty, retry, permission revocation, stale source/version, unsaved drafts, and duplicate submissions.
- Reuse established styles and primitives without new lucide usage/dependencies or ornamental effects. Provide semantic/keyboard navigation and mobile/tablet layouts; use the advanced UI skill during substantial UI implementation and browser QA skills when actually validating rendered screens.

Verification: React Testing Library/user-event and existing accessibility tooling for tab/history navigation, role differences, update sequencing, forms/errors, preserved drafts, stale/revoked data, payment evidence, and true server values. Existing basket/priority/mode/group tests must remain green.

### T8. Build Finance and Super Admin operational controls

Owner: Finance/oversight UI implementer for new components; primary for existing route/page mounts. Dependencies: T1, T2, T6. Acceptance: AC2, AC3, AC10, AC11, AC12.

Owned new files: `frontend/src/features/finance/ProcurementPaymentControls.tsx` and tests; `frontend/src/features/admin/ProcurementLifecycleOversightPage.tsx` and tests. Reuse lifecycle read components only through capability-aware read-only presentation, never by rendering personal Procurement forms with an Admin role.

Expose Finance date confirmation, invoice allocation/advance authorization, historical opening reconciliation, correction/reversal, and retention approval. Admin gets dedicated oversight, authorized payment actions, correction requests, retention acknowledgement, scheduler health, and links to the existing final-completion page. Provide actionable reasons for blocked authorization and unavailable invoice/certification sources.

Primary mounts Finance controls in `FinanceProjectPage.tsx` / `FinanceWorkOrderAssessments.tsx` as appropriate, adds the guarded Admin detail path `/admin/procurement/projects/:projectId/lifecycle`, registers it with the existing frontend route catalog/guard, and extends `ProjectCompletionPage.tsx` to show lifecycle blockers and snapshot details. The existing final completion button uses the same server gate.

Verification: Procurement cannot confirm its own financial authorization; unauthorized projects/roles cannot see payment evidence; Admin cannot sign staff checks; Finance versus Admin retention responsibilities; command retry/stale source handling; final closure blocked until all canonical requirements pass.

### T9. Build alerts UI, dashboard attention lists, and cache integration

Owner: notification UI implementer for new modules; primary for mounts/invalidation. Dependencies: T1, T5 and tab routes from T7/T8. Acceptance: AC1, AC4, AC7, AC8, AC11, AC12.

Owned new files: `frontend/src/features/notifications/ProcurementLifecycleNotifications.tsx`, `procurementLifecycleNotificationApi.ts`, their tests; `frontend/src/features/procurement/lifecycle/AttentionQueue.tsx` and tests.

Provide identity-scoped feed, unread count, paginated history, mark-read errors/retries, and authorized deep links to tab/entity. Poll only for authenticated permitted actors at a bounded interval with refetch on focus/reconnect; background alert creation remains server-side. Clear protected caches and abort requests on logout/reassignment/denial. Keep resolved history distinct from current actionable alerts.

Primary mounts the provider/feed in existing `NotificationProvider.tsx` and `NotificationBell.tsx`; mounts staff attention in `ProcurementWorkspace.tsx`; adds Admin attention to `SuperAdminDashboardPage.tsx` and the existing Admin `ProcurementDashboardPage.tsx` without replacing vendor metrics. Update `procurementLifecycleQueries.ts` and the new scoped query helpers to refresh every affected payment, monitor, review, inspection, finding, readiness, completion, and alert read after mutations.

Verification: notification source composition/unread totals, authorized target links, revoked users, 404/403/failed mark-read, project switching, stale alerts after settlement, reversal reopening, repeated-daily deduplication, and post-completion retention visibility. Reading an alert must not clear its outstanding obligation.

### T10. Reconcile integrated implementation and complete integrity review

Owner: primary; Mode A uses `integrity_reviewer` after all writers finish. Dependencies: T6–T9. Acceptance: all ACs.

- Inspect the entire task diff against the initial per-target baseline. Reconcile contract disagreements, shared ownership changes, query invalidation, route mirrors, source locks, and existing consumer behavior.
- Audit payment lineage/units/overpayment, immutable histories and reviewer identities, P1/P2/P3 races, Configuration changes, random inspection persistence, file authorization/cleanup, canonical snag verification, alert recipient reassignment/deduplication, and completion write skew.
- Audit adoption/read-only legacy handling and post-closeout financial corrections/retention. Confirm every final-completion path is covered and no generic project-status endpoint can bypass the existing/new completion authority.
- Record findings with evidence and severity. Primary fixes confirmed issues in owned slices, then reruns focused regressions. Do not pass findings directly to simultaneous writers of shared files.

Exit: all material integrity findings resolved or explicitly reported as blocking completion; no source writers remain active before final verification.

### T11. Run integrated verification and prepare handoff

Owner: primary; Mode A uses `verification_runner` after T10 fixes. Dependencies: T10. Acceptance: all ACs with recorded results.

Run the commands and browser matrix below against the final worktree. Distinguish baseline failures, task regressions, environment limitations, skipped tests, and successful checks. Fix task regressions and rerun the affected checks. Report exact counts/results and generated temporary artifact paths. Inspect final diff and preserve unrelated changes. No commit/push/deploy/migration/seed is part of handoff.

## Safe parallel schedule

| Parent phase | Work | Safe concurrency in Mode A |
| --- | --- | --- |
| 1. Foundation | T0, then T1 | Read-only audits may run independently during T0. Primary settles shared contracts before writers. |
| 2. Domain implementation | T2, T3, T4 | Three backend writers on the non-overlapping new files above; primary handles requested bridge/shared integrations. Maximum four active agents including primary. |
| 3. Service and UI integration | T5, T6, T7, T8 | After domain writers finish, T5 and T7 can run while primary begins T6; T6 finalization waits for T5. Start T8 when its dependencies and a slot are available. Never assign existing integration files to two writers. |
| 4. Alert and application integration | T9 and remaining T6–T8 integration | T9's new files are independent; primary owns existing notification/dashboard/cache/router edits. |
| 5. Final review | T10 | All writers stopped; integrity review first, fixes second. |
| 6. Final verification | T11 | Verification only after fixes. Independent workspace checks may run concurrently if local resources permit; replica-set tests must retain their isolated databases. |

In Mode B, execute tasks inline in dependency order. No agent is required merely because an ownership label exists. Task completion requires its tests and integration acceptance, not only a worker's report.

## Verification commands and fixtures

All paths below are repository-relative. New test names are planned deliverables, not files claimed to exist at plan time.

Backend focused lanes:

```sh
cd backend && npm test -- tests/procurement-lifecycle-domain.test.ts tests/procurement-lifecycle-routes.test.ts
cd backend && npm test -- tests/procurement-lifecycle-access.replica-set.test.ts tests/procurement-lifecycle-evidence.replica-set.test.ts
cd backend && npm test -- tests/procurement-payments.test.ts tests/procurement-payments.replica-set.test.ts
cd backend && npm test -- tests/procurement-progress.test.ts tests/procurement-progress.replica-set.test.ts tests/procurement-inspections.test.ts tests/procurement-inspections.replica-set.test.ts
cd backend && npm test -- tests/procurement-handover.test.ts tests/procurement-handover.replica-set.test.ts
cd backend && npm test -- tests/procurement-lifecycle-scheduler.test.ts tests/procurement-lifecycle-scheduler.replica-set.test.ts tests/procurement-lifecycle-notifications.replica-set.test.ts
cd backend && npm test -- tests/procurement-completion.replica-set.test.ts tests/project-completion-configured.test.ts tests/site-completion-progress.test.ts
cd backend && npm test -- tests/project-purchase-order-basket-monitor.replica-set.test.ts tests/project-manager-vendors-quality.replica-set.test.ts tests/project-manager-client.replica-set.test.ts tests/vendor-execution-delivery.replica-set.test.ts
cd backend && npm test -- tests/procurement-basket-priority-groups.test.ts tests/procurement-basket-priority-groups.replica-set.test.ts tests/route-operation-registry.test.ts tests/super-admin-authorization.test.ts tests/api-docs.test.ts
```

Frontend focused lanes:

```sh
cd frontend && npm test -- src/features/procurement/lifecycle
cd frontend && npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketPriorityGroups.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementBasketMonitor.test.tsx
cd frontend && npm test -- src/features/finance/ProcurementPaymentControls.test.tsx src/features/admin/ProcurementLifecycleOversightPage.test.tsx src/features/admin/ProjectCompletionPage.test.tsx
cd frontend && npm test -- src/features/notifications src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProcurementDashboardPage.test.tsx src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx
```

Final shared-contract checks:

```sh
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
cd mobile && npm run typecheck && npm run test:contracts
git diff --check
git status --short
```

The commands above each start from the repository root when executed independently. Use `backend/tests/helpers/mongo-replica-set.ts` for transactional tests; a standalone Mongo instance is insufficient. Do not disable transaction checks to obtain a pass. There is no lint script and no planned OCR change, so neither lint success nor OCR verification is claimed.

Fixture requirements:

- Two unequal projects with different Procurement and Finance assignees, different vendors, repeated display names, and distinct source IDs; one active Super Admin plus inactive/unauthorized actors.
- Project A: invoice gross 1,000,000 paise, approved withholding 20,000, vendor net 980,000, external payments of 250,000 and 130,000, giving vendor cash remaining 600,000 before any reversal. Project B: invoice gross 637,500, withholding 12,750, vendor net 624,750, payment 205,000, giving remaining 419,750. Keep recorded expense totals deliberately different, and assert payment mutations do not change them. These are synthetic arithmetic inputs, not tax advice or tax-policy changes.
- Mixed P1/P2/P3 items within one basket and repeated Main Lines in different rooms; current draft priority differs from active; unresolved and legacy sources; changed assignment/scope mid-round.
- Projects requiring two versus three inspections; multiple items in one visit; late visit; short same-day project; failed inspection followed by verified corrective work.
- Upcoming, due-today, overdue, partly paid, reversed, approval-blocked, setup-required, retained-after-closeout, and already-completed legacy states.

Browser matrix: 390, 768, and 1440 px for Procurement, Finance, and Super Admin; keyboard tab navigation/forms; mobile tab overflow; file upload failures; stale versions and permissions; deep links/back/forward; current alerts and historical transactions; preserved drafts; no console or failed-network errors attributable to the change. Use synthetic fixtures and avoid screenshots containing private project/client data. Store temporary screenshots/logs under an ignored `output/playwright/procurement-lifecycle/` location, report paths, and remove unnecessary artifacts.

## Acceptance traceability

| Spec criterion | Implementation owners/tasks | Verification |
| --- | --- | --- |
| AC1: Five tabs and preserved sourcing | T1, T7, T9 | Navigation/source regressions and responsive browser checks. |
| AC2: Issued-source payment setup/authorization | T1, T2, T6, T8 | Payment domain/replica-set tests and Finance UI tests. |
| AC3: Immutable reconciled payments without duplicate costs | T2, T6, T7, T8 | Asymmetric financial fixtures, concurrency/reversal tests, monitor reconciliation. |
| AC4: Reliable internal due/overdue alerts | T5, T6, T9 | Fake clock, multiworker/recovery/recipient tests and inbox/dashboard interaction. |
| AC5: Ordered checks without completion gating | T3, T7 | API race and rendered unlock/blocked-state tests. |
| AC6: Current Configuration and source reconciliation | T1, T3, T6 | Draft precedence, mid-round mutations, signoff races. |
| AC7: Timely check/delay history | T3, T5, T7, T9 | Round cadence, pause/backdating, missed-update alerts, note validation. |
| AC8: Two/three project-wide inspections | T3, T5, T7 | Persisted randomness/quota/coverage/late-visit tests and UI. |
| AC9: Quality/delivery/handover evidence and findings | T4, T6, T7 | Canonical snag, evidence, checklist-revision, and signer-authority tests. |
| AC10: Existing plus new final-completion gates | T6, T8 | Direct/legacy endpoint tests, immutable snapshots, financial/source/defect races. |
| AC11: Permissions, identity, versions, history | T1–T10 | Actor matrix, source ownership, file isolation, idempotency, registry/OpenAPI/mobile drift. |
| AC12: Responsive accessible interaction/states | T7–T9 | Rendered accessibility checks and the browser matrix. |

## Stop conditions, rollout, and handoff

- Ordinary implementation choices within the approved spec proceed without new approval. A material change to scope, financial authority, signoff semantics, or approved behavior requires updating the affected durable document and requesting its approval once.
- Do not claim completion if transaction tests, authorization review, money reconciliation, browser validation, or required builds remain unverified. Diagnose available failures; report exact external/environment blockers if they cannot be resolved locally.
- No production activation/backfill/seed is performed. Local tests may exercise explicit setup/adoption with synthetic data. Real rollout retains additive historical records and server completion enforcement; do not revert to a version that bypasses gates for adopted projects.
- Final handoff reports implemented behavior, principal decisions, changed files, exact checks/results, unrun checks, temporary artifacts, dependencies (expected none), and remaining risks. No commits, pushes, migrations, bank actions, or messages are authorized by this plan.

## Execution record

| Stage | Status | Evidence |
| --- | --- | --- |
| Specification | Approved | User reply `Approved` on 2026-11-27. |
| Task plan | Approved | User reply `Approved` after task-plan presentation. |
| Execution mode | Mode A | User selected `A`; native parallel agents authorized. |
| T0 baseline | Complete | Initial dirty set and patch saved under `/tmp/lisno-procurement-lifecycle/`; payment, completion and UI audits reconciled. Baseline API-docs Mode enum expectation failed before these changes; existing mobile operation drift was identified. |
| T1 foundation | Integrated | Shared contracts, route/permission inventory, purpose-scoped evidence, source fences and authorized replay. Foundation/evidence replica tests: 6 passed; route namespace/action tests: 7 passed. |
| T2 payments | Integrated | Immutable schedules, authorizations, external transactions, reversals, opening reconciliation and retention. Dedicated domain/replica tests: 10 passed. Canonical payment projection replaces expense-derived paid figures. |
| T3 progress and inspections | Integrated | Ordered checks per round; persisted project inspection windows/quota; attributed corrections. Dedicated tests: 21 passed. |
| T4 handover | Verified | Current quality snapshots, historical revisions and canonical findings. Dedicated tests: 11 passed. Scoped Site Manager finding-evidence access passed five replica tests and five rendered interaction tests. |
| T5 alerts | Integrated | Durable lease/cursor, local deadlines, daily deduplication, retained-payment reminders, recipient revalidation and health. Final sequential focused run: 15 passed across 3 files. |
| T6 completion | Integrated | Readiness declarations and final immutable snapshots; race-safe payment/source fences. New completion replica tests: 3 passed, covering closure, stale Configuration and concurrent reversal. |
| T7–T9 web UI | Verified | Five-tab workspace, Finance/Admin controls, notification inbox/dashboard, actor-scoped queries. Final focused frontend run: 121 passed across 17 files; additional route-contract selection: 76 passed. |
| T10 review | Resolved | Independent integrity review identified cumulative retention authority, append-only opening corrections, closed-project readiness, legacy closed alerts and queued file cleanup. All five were fixed and covered by passing final regressions. Mobile selected-tab visibility was also fixed and checked in Chromium. |
| T11 verification | Scoped checks passed; broad failures documented | Final backend: 407 focused tests passed (294 domain/authorization/completion + 109 transaction regressions + 4 existing vendor-execution integration tests). Frontend: 121 focused plus 76 route checks passed. Mobile: four contract tests passed. All three typechecks, backend/frontend builds and diff hygiene passed. Full repository suites are not green; see final evidence below. |

### Integration clarifications

- Canonical transport contracts live under `backend/src/contracts/procurement-*.ts`; `shared/procurement/*` exports transport-only types. Shared routing is consolidated in `routes/procurement-lifecycle.ts`; domain command services remain separate.
- Projects with an issued procurement order, an adopted lifecycle, or uncovered approved scope require Procurement readiness. Projects whose entire approved scope is explicitly exception/not-required and which have never issued a procurement order retain their existing external-scope completion path. Cancelling an issued order does not bypass the gate.
- Closed projects show the immutable completion declaration/reference snapshot separately from current post-close financial corrections. Corrections preserve the original approval and continue appropriate payment reminders.
- Retention settlements consume an immutable grant cumulatively, including payments after acknowledgement before closeout. Reversing unrelated earlier payments does not restore that grant. Finance/Admin opening-balance corrections append evidence-backed supersessions; original reconciliation rows remain immutable.
- Legacy completed projects without lifecycle adoption do not acquire setup/payment alerts. Failed compensating evidence deletions are retried in bounded worker batches independently from reminder failures.
- GET projections remain side-effect-free. Explicit setup adopts an active project; scheduler mutation creates subsequent review rounds. Existing completed projects receive no fabricated historical checks or payment balances.
- No dependency or lockfile additions, production data operations, seeds, migrations, commits, pushes or deployment have been performed.

### Final verification evidence and limitations

Completed on 2026-11-28, after resolving the integrity review:

| Command / lane | Result and evidence |
| --- | --- |
| Backend `npm run typecheck && npm run build` | Passed; `/tmp/lisno-procurement-lifecycle/final-backend-build.log`. |
| Backend focused domain/route/permission tests, `--maxWorkers=1` | 137 unique tests passed; `final-backend-nonmongo.log` and `final-backend-routes-retry.log`. One initial HTTP socket hang-up passed on an isolated 7-test retry. |
| Backend `super-admin-authorization`, `project-completion-configured`, `site-completion-progress` | 157 passed; `final-completion-authorization.log`. |
| Backend fourteen replica-set files, `--maxWorkers=1` | 109 passed, including completion races, cumulative retention, opening corrections, source changes, cleanup recovery, legacy alerts and PM evidence; `final-backend-replica.log`. |
| Backend `vendor-execution-integration.replica-set.test.ts --maxWorkers=1` | 4 passed; `final-vendor-integration.log`. Existing Client acceptance now correctly waits for Procurement readiness and retains prior execution evidence. |
| Backend `api-docs.test.ts --maxWorkers=1` | 83 passed / 1 failed; `final-api-docs.log`. The 600-operation inventory passes. The Mode-tier enum expectation at line 233 failed in the initial baseline and remains outside this task. |
| Frontend `npm run typecheck && npm run build` | Passed; `final-frontend-build.log`. Vite reports existing large bundles; no production performance benchmark is claimed. |
| Frontend focused lifecycle/Finance/Admin/notification/host/PM/accessibility/auth tests, `--maxWorkers=2` | 121 passed / 17 files; `final-frontend-focused.log`. Exact invocation is at the start of that log. |
| Frontend router tests selected by `public invitation route\|registered permission routes` | 76 passed, 69 outside the selected groups skipped; `router-counts.log`. |
| Mobile `npm run typecheck && npm run test:contracts` | Passed; 4 contract tests, `final-mobile-contracts.log`. |
| `git diff --check` | Passed. No new dependency/lockfile edits; unrelated pre-existing changes retained. |

Log names without an absolute prefix above are under `/tmp/lisno-procurement-lifecycle/`. They contain the exact executed commands. Builds created ignored `backend/dist` and `frontend/dist` outputs.

The broad frontend run finished with **7,858 passed / 144 failed** across 487 files. Two route-inventory expectations introduced by the new Admin route were subsequently fixed and passed the selected router run. Remaining broad failures involve existing Configuration, estimate, Client/AI, assignment and synthetic gallery tests; they were not silently changed to obtain a green suite.

The broad backend run finished with **8,540 passed / 68 failed / 31 skipped** across 433 files. It overlapped review-fix edits and therefore includes transient lifecycle failures and stale inventory/completion assertions. All affected lifecycle/integration cases were subsequently rerun against the frozen final code and passed. Other broad failures and a Mongo startup timeout remain documented in `backend-full-unrestricted.log`. The full suites were not repeated after the final fixes, and no repository-wide green result is claimed.

Real Chromium checked actual components at **390/768/1440 px** for Procurement, Finance and Super Admin, including keyboard focus, draft persistence, P1 ordering, inspection quota, denied access and failure states. [Browser QA evidence and limitations](../../../output/playwright/procurement-lifecycle/qa-report.md) documents ignored screenshots and the synthetic API harness. The harness and browser session were stopped. Live authenticated backend/browser E2E, Safari and physical devices were not exercised. OCR was unaffected; no lint script exists. No deployment or production data action was performed.
