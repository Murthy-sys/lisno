# Procurement project tabs and delivery lifecycle

Date: 2026-11-27
Status: Specification for approval. No implementation or task plan is authorized by this document alone.
Risk: Substantial and high-risk: payments, authorization, durable workflow history, background reminders, and project completion.

## Goal and confirmed requirements

Give every accessible procurement project five persistent tabs:

1. **Bids & Vendor Appointment**: retain the current item, basket, bid comparison, approval, and work-order workflow.
2. **Payments**: schedule vendor payments, show due and overdue amounts, alert Procurement and Super Admin, and retain all transaction history.
3. **Progress & Inspections**: require timely Procurement checks, notes and delay explanations, plus 2–3 physical inspections across the project.
4. **Quality, Delivery & Handover**: record checklist outcomes, delivery evidence, defects, and handover readiness.
5. **Project Signoff**: show all outstanding requirements and complete the existing authorized closure process.

The user explicitly confirmed:

- The 2–3 physical inspections apply to **the project as a whole**, not separately to every item or vendor.
- In each progress-check round, record checks for P1 before P2, then P3. Earlier-priority work does **not** need to be fully completed first.

Recommended approach: add a project-level procurement lifecycle around the existing sourcing, execution, certification, finance, quality, and completion services. Reuse their authoritative records and permission checks; add only the missing payment, Procurement review, inspection, and handover records.

## Current behavior and evidence

These findings describe current code, including existing uncommitted work, rather than historical plans.

| Finding | Evidence |
| --- | --- |
| Project Procurement currently renders project details, workflow, estimate readiness, vendor access, and the basket workspace on one page. It links to a separate execution tracker. | `frontend/src/features/procurement/ProcurementProjectPage.tsx` |
| P1/P2/P3 grouping already exists. It is explicitly display-only and resolves each Main Line from current saved Configuration, draft before active. Items without a reliable priority remain unresolved. | `backend/src/domain/procurement-basket-priority-groups.ts`; `backend/src/services/procurement-basket-priority.service.ts`; `frontend/src/features/procurement/ProcurementBasketPriorityGroups.tsx` |
| Issued basket awards snapshot five payment milestones: advance, mobilisation, progress 50%, progress 85%, and final. Their schema records amounts and reviewer slots, but no payment due dates. | `backend/src/domain/procurement-basket-tender.ts`; `backend/src/models/ProcurementBasketTender.ts` |
| Payment certification already records immutable milestone/reviewer lineage and decisions. Missing reviewers block certification; certification does not establish actual payment. | `backend/src/models/ProjectPaymentCertification.ts`; `backend/src/services/project-manager/vendors.ts` |
| The basket monitor deliberately returns `paidPaise: null`. Invoice assessment, withholding, net payable, and recorded procurement costs are separate values. | `backend/src/services/project-purchase-order-basket-monitor.service.ts`; `frontend/src/features/procurement/ProcurementBasketMonitor.tsx` |
| Procurement expenses already require an approved source and receipt, write the finance ledger, update cost totals, and optionally link an order/milestone. A posted cost is not proof of bank settlement. | `backend/src/services/procurement.service.ts`; `backend/src/models/FinanceLedgerEntry.ts` |
| Finance already owns versioned invoice/withholding assessments. | `backend/src/services/project-purchase-order-invoice-assessment.service.ts`; `backend/src/models/ProcurementBasketInvoiceAssessment.ts` |
| Vendor progress, schedules, daily reporting, Site Manager verification, Client review, and a leased reminder scheduler exist. Procurement's own ordered progress-review rounds and project inspection quota are missing. | `backend/src/contracts/vendor-execution.ts`; `backend/src/services/vendor-execution.service.ts`; `backend/src/services/execution-reminder-scheduler.ts` |
| Project Manager quality audits snapshot configured basket checklists, retain signed corrections, and enforce evidence requirements. Procurement can read these but does not inherit the Site Manager's signing authority. | `backend/src/services/project-manager/quality.ts`; `backend/src/domain/project-manager/quality.ts` |
| Final completion already checks scope, orders, vendor verification, Client acceptance, and verified snags. Super Admin records the final completion decision and end date. It does not currently check the new Procurement requirements. | `backend/src/services/project-completion.service.ts`; `backend/src/services/site-completion.service.ts`; `frontend/src/features/admin/ProjectCompletionPage.tsx` |
| Existing execution notifications and general chat notifications have separate contracts. Payment alerts must not be inserted as fake chat messages or assumed to work through an unmodified notification service. | `backend/src/contracts/notifications.ts`; `backend/src/services/execution-notifications.ts`; `backend/src/services/notification-events.service.ts` |
| The native mobile app has a separate Procurement workspace with its own navigation and expense entry. | `mobile/src/features/procurement/ProcurementProjectWorkspace.tsx`; `mobile/src/features/procurement/ProcurementProject.tsx` |

The initial dirty-path set was captured with `git status --short`. Relevant shared files already contain unrelated design-layout and client-execution-choice changes: route operations, audit actions, OpenAPI, repository interfaces/implementations, project/workflow services, and frontend API types. This stage changes only this specification. Reinspect those exact diffs before any future implementation ownership assignment; preserve all existing work.

## Scope and non-goals

In scope: responsive web Procurement project tabs, backend lifecycle contracts and persistence, payment history and internal alerts, Procurement progress checks, project inspections, checklist/handover records, Super Admin oversight, and integration with existing completion blockers and finance/execution read views.

The same server-side rules apply regardless of caller, including existing mobile/API callers. Native mobile navigation redesign is not included in this first delivery; preserve its existing APIs and useful server error messages. Supporting the web workspace on phones is included.

Out of scope: initiating bank transfers, bank reconciliation integrations, tax-policy changes, automatic vendor email/SMS/WhatsApp, replacing vendor reports or Client approvals, changing estimates or issued prices, shared Configuration editing from Procurement, 3D/motion redesign, production backfill, deployment, commits, and pushes.

## Product behavior

### Shared project workspace

- Keep the project name, stable project number, current lifecycle status, and project navigation above the five tabs. Show concise attention counts for overdue payments, due checks, inspection findings, and signoff blockers.
- The first tab opens by default. Persist tab selection in the URL so refresh, browser history, and alert links work. Keep existing basket selection and project-coordination links compatible.
- Tabs remain navigable even when actions are blocked. Explain missing preparation, missing assignments, unavailable sources, or prerequisites within the selected tab.
- Existing commercial actions continue to use their full canonical basket scope and freshness checks. A priority filter must never narrow a bid, award, or purchase-order mutation silently.
- New lifecycle commands return server-calculated statuses, blockers, allowed actions, source versions, and server time. A stale screen cannot approve, pay, or sign off against an earlier snapshot.

### 1. Bids & Vendor Appointment

Retain the current P1/P2/P3 overview, execution-mode view, enquiries, bids, comparison, approvals, vendor access, and issued work-order history. No change to vendor appointment authority, dispatch readiness, approved amounts, or issued artifacts.

After an order is issued, its immutable order/proposal revision supplies the payment milestone and work-assignment identities for the other tabs. Draft bids and unissued awards do not become vendor payables or progress obligations.

### 2. Payments

**Schedule and readiness**

- Group payments by appointed vendor and issued order, with milestone, contract amount, authorized amount, due date, certification/Finance readiness, paid amount, balance, and status. Support vendor/status filters and chronological transaction history.
- Store an operational due date for each positive-value milestone. Procurement proposes the date; Finance or the dedicated Super Admin operation confirms it. Confirmed changes require a reason and history; retain the immutable original due date. A proposed extension never suppresses an existing overdue alert.
- Payment dates do not rewrite the issued commercial schedule. Zero-value milestones show `No payment required`; legacy orders without milestone sources show `Payment setup required`, not invented schedules.
- Keep separate readiness and timing states: `Setup required`, `Awaiting certification`, `Awaiting Finance`, `Ready`; and `Upcoming`, `Due today`, `Overdue`, `Paid`. Partial payment is shown alongside the remaining balance. A blocked approval can still be overdue.
- Amount authorization references the existing current milestone certification and Finance invoice/withholding assessment. Preserve missing-reviewer blockers. Add explicit Finance-approved allocation of invoice gross, withholding, and vendor net payable to milestone obligations; allocations must reconcile to the assessed invoice and issued milestone bounds. Do not spread tax or rounding differences implicitly in the UI.
- Finance may authorize an advance against its issued advance milestone before the final invoice exists. Record that basis explicitly and reconcile it when the invoice assessment is saved. An advance cannot also be counted as a later invoice payment. Later assessment changes retain previous payments and produce a reconciliation blocker if the revised balance is inconsistent.

**Transaction history**

- The UI action is **Record payment**, meaning record a completed payment made outside Lisno. It never claims to transfer money.
- Assigned Procurement or Finance records amount in paise, actual paid-at time, payment method, transaction/reference number, payment evidence, and optional note. Require the current authorization, source version, and idempotency key. The actor and server recording time are automatic.
- Store actual vendor cash payments independently of procurement expense recognition. A transaction can allocate to multiple authorized milestones of the same vendor/order; allocation totals must equal its cash amount. Record a bank transaction once, with stable allocation IDs.
- Count only effective recorded transactions, subtracting explicit reversal records. Declined attempts, abandoned drafts, or reversed entries do not reduce balance. Reject over-allocation and concurrent overpayment in a transaction.
- Original transactions cannot be edited or deleted. Finance or Super Admin records a reasoned correction/reversal and any replacement, linked to the original record. Reversal reopens the appropriate balance and alerts. This is an accounting-record action, not a bank refund.
- Show the financial scope clearly: contract gross, Finance-authorized vendor net payable, vendor cash paid, withholding, and vendor cash remaining. Withholding is not vendor cash paid. Unknown legacy payment history remains unknown until explicitly reconciled; no record must not silently mean a known zero for historical orders.
- Preserve finance expense behavior. Payment recording alone must not create a second cost entry or change project margin. Existing ledger references may be linked only after validating project/order/source ownership; never join by vendor name or infer payment from a receipt.
- Update the basket monitor and internal certification read views to consume the same payment summary. Keep project/detail/portfolio finance cost totals unchanged unless a separate existing expense command is deliberately performed.

**Reminders and escalation**

- Proposed default: internal reminder at 09:00 three calendar days before the due date and again on the due date, using the project's timezone, default `Asia/Kolkata`. A date-only obligation becomes overdue after that date ends locally.
- Send the first overdue alert to the active assigned Procurement person and the sole active Super Admin on the next scheduler pass, targeted within 15 minutes in healthy operation. Keep it visible until settlement or an authorized resolution; repeat at most one overdue reminder per local day per recipient/obligation.
- Include amount remaining, due date, days overdue, responsible person, approval blockers, and a direct Payments-tab link. Marking an alert read does not resolve the payable.
- Missing due dates and unresolved historical amounts create `Payment setup required` attention items rather than disappearing from the queue. Missing Procurement assignment still alerts Super Admin. Reassignment must re-resolve recipients and revoke obsolete access.
- Alerts run without an open browser. Use a leased, bounded scheduler with durable deduplication, retry, and health reporting, following existing execution scheduling patterns. Recheck current balance and scope before publishing. Repeated workers must not create duplicate alerts.
- Add a distinct procurement lifecycle alert feed/contract to existing internal alert surfaces, including Procurement and Super Admin dashboards. Keep chat and vendor reporting notification behavior intact. Email is not required for this release.

### 3. Progress & Inspections

**Timely Procurement checks**

- Show each current appointed source item with vendor, room, configured priority, planned dates, latest vendor report, latest Procurement check, due date, and delay state. Distinguish vendor-reported progress from Procurement observations and Site Manager verification.
- Proposed default: one Procurement review round every seven calendar days during active execution, with the first due within seven days of lifecycle activation. The project policy may use a shorter interval. Policy changes are versioned and cannot erase an already-missed round.
- Each required item check records actual checked-at time, status (`Not started`, `In progress`, `Blocked`, `Completed`), observed percentage where meaningful, mandatory notes, next action, and next expected check. A later-recorded check retains both observed time and server submission time; backdating never erases lateness.
- A delayed/blocked item requires reason, responsible party, recovery action, and expected recovery date. Keep the original target date immutable; any revised forecast has a reason and history. Vendor reporting or a Procurement observation alone does not approve a completion or change a contractual deadline.
- Missed review rounds and overdue follow-ups produce assigned-Procurement alerts and Super Admin escalation using the same durable alert mechanism. Pauses are explicit, reasoned, and prospective; they do not remove earlier misses or pause vendor payment obligations.

**P1 → P2 → P3 rules**

- Resolve current priorities by stable Main Line ID with saved-draft-before-active precedence. The review round stores the source membership and Configuration revision used for each submitted check.
- Within a round, all required P1 items must have a submitted check before any P2 progress check can be submitted; all required P2 checks precede P3. Empty groups are skipped. A valid P1 `Blocked` or `Not started` check with required notes counts as an update and unlocks the next group; completion is not required.
- Enforce order on the server and display the outstanding lower-priority items beside a disabled submit action. Prevent concurrent submissions from bypassing the gate through snapshot write skew.
- Urgent delay/defect reports and physical inspections remain available for any item at any time. They do not count as out-of-order progress-check submissions.
- Unappointed items remain visible as appointment work, outside active execution review rounds. Unresolved priorities appear in `Priority not set`; they must be resolved before a round can be finalized, without blocking urgent issue reporting.
- A priority, appointment, or scope change during an open round marks it for reconciliation. Refresh current membership before further progression; retain submitted history, identify newly required lower-priority checks, and never rewrite old observations. Completed rounds remain immutable. Superseded work leaves current obligations only through validated source reconciliation.

**Physical inspections**

- Plan **two or three inspections for the entire project**, default two. Procurement chooses the count and non-overlapping feasible date windows spanning execution. The server chooses and stores a random date within each window once; retries or page refreshes cannot reroll it. Staff can see assignments; no vendor advance notification is introduced.
- Missing execution dates/windows produce `Inspection plan required`. Support short projects explicitly without requiring impossible separate calendar days; distinct inspection events must still have distinct actual times and notes.
- A visit records actual inspection time, inspector identity, inspected vendors/items, observations, delay findings, corrective actions and owners, follow-up dates, and evidence where required by the checklist. One visit may cover many items and vendors; record coverage explicitly and count it once at project level.
- Procurement must submit notes for every inspection. Missed planned dates remain late. Rescheduling requires a reason, retains the original date, and does not reset history.
- Completing two visits does not pass a plan that selected three. The planned count cannot be reduced after the first inspection; additional corrective visits are allowed and retained separately from the original quota.
- Inspection occurrence and inspection outcome are separate: a visit with findings counts as a visit, but unresolved defects still block handover. Corrected notes are appended with attribution rather than overwriting submitted records.
- Random visits supplement required quality checks; they do not certify all uninspected items or replace Site Manager verification.

### 4. Quality, Delivery & Handover

- Present three clearly labeled checklist sections: Quality, Delivery, Handover, with item/vendor scope and a project summary.
- Reuse configured quality parameter identities, revision snapshots, evidence rules, signed Project Manager audit results, and existing snag records. Procurement records its inspection/checklist results under its own authority; it cannot impersonate or overwrite a Site Manager's signed audit.
- Cover accepted quantities/condition, approved specification, functional checks where applicable, damage/shortage findings, delivery receipt, installation completion, required manuals/warranties, cleanup, and handover acknowledgement. Requirements are scope-aware; explicitly reasoned `Not applicable` is allowed only for checks designated optional/inapplicable, never as a bypass for mandatory quality or Client acceptance.
- Each checklist item has `Pending`, `Pass`, `Fail`, or permitted `Not applicable`, with notes, actor, time, evidence, and history. Passing all applicable required checks plus resolving existing findings determines readiness on the backend.
- Use existing delivery receipts where authoritative, with an explicit acknowledgement record for missing handover fields. Link each failed actionable check to one tracked finding/snag, with owner and due date. Repeated submissions must not create duplicate snags. Repair alone is not verification; keep the existing authorized verifier.
- Freeze checklist requirements and outcomes in a submitted handover revision. If current issued scope or required checklist sources change before final approval, show the exact changes and require reconciliation and a new revision; retain the old submission and signatures.

### 5. Project Signoff

- Show a consolidated readiness list with links to the exact payment, item, inspection, checklist, or existing review that needs action.
- Procurement submits an immutable readiness declaration only when current item review obligations are satisfied, the planned inspections are complete, required checklist items pass, and all delivery/handover findings are resolved or validly not applicable.
- Monetary closure requires all due vendor cash obligations settled, no unreviewed payment corrections, and no unknown payment setup. A future retention obligation may remain only with an explicit Finance-approved retained amount, due date, owner, and continuing reminders, acknowledged by Super Admin. Default behavior blocks unresolved balances; retention never displays as `Paid`.
- Procurement readiness is an additional prerequisite, not authority to complete the project. Preserve individual vendor verification, the Site Manager's 100% completion submission, Client acceptance, existing scope/order/snags checks, and final Super Admin approval.
- Integrate the new blockers into the existing authoritative completion read and command paths. An old API client or existing Admin button must not bypass them.
- Final Super Admin signoff snapshots the readiness revision and payment/inspection/handover references alongside existing completion lineage. Recheck everything atomically at decision time. Parallel payments, reversals, findings, source changes, or readiness withdrawals must conflict safely with signoff.
- After signoff, display a read-only closeout record with actors, dates, and histories. Later permitted financial corrections or retained-payment settlements append history and can raise a post-closeout exception; they never rewrite or silently revoke the original signoff. No automatic reopening is introduced.

## Data, API, authorization, and integrity

### New durable concepts

Use focused domain/contracts/services/models within the existing backend boundaries. Proposed concepts, with final file names deferred to the task plan:

| Concept | Required lineage and state |
| --- | --- |
| Procurement lifecycle policy/state | Project ID, activation/version, timezone, review cadence, inspection count/windows, original dates, actor history. |
| Payment obligation and authorization revisions | Project/vendor/order/order-revision/proposal/milestone IDs, certification and assessment revision IDs, due-date history, gross/withholding/net allocation, source digest, version. |
| Payment transaction and allocations | Immutable payment ID, vendor/project/order, currency INR, integer paise, method/reference, paid/recorded times, actor, evidence IDs, allocation IDs, reversal linkage, idempotency digest. |
| Procurement review rounds and check events | Project/round IDs, canonical item/assignment/source IDs, current source digest, saved priority revision, original due date, submitted observations, delay/follow-up history. |
| Project inspection plan and visit events | Project/plan revision, 2-or-3 planned count, stored randomly selected dates, visit IDs, actual coverage, notes, evidence, findings, actor/time. |
| Checklist/handover/readiness revisions | Canonical scope, checklist revision, answers, existing audit/delivery/snag references, immutable submission and correction links. |
| Lifecycle alerts and scheduler lease | Obligation/round identity, recipient, condition, local date, dedupe key, unresolved/read state, job cursor/lease, last success and safe failure code. |

- Financial data uses safe integer paise and explicit INR formatting. Use overflow-safe sums and verified allocation bounds. Never subtract withholding twice or add settlements to expense-derived margin/cost totals.
- Use stable IDs across all joins and API mutations. Display names are not source keys. Historic snapshots coexist with current source metadata; neither can silently replace the other.
- Mutations require runtime validation, optimistic versions/source digests, idempotency keys, transactional audit, and uniqueness constraints. Retry of an identical command returns its original result; reuse with different data conflicts.
- Reuse direct-Mongoose transactions where these services already use them. Synchronize memory/Mongo implementations only if an existing repository contract changes. No parallel queries on one Mongo session.
- Add project-scoped lifecycle summary/read endpoints and focused commands for schedules, payments, review rounds, inspections, checklists, and readiness. Define exact routes and schemas in the next-stage plan, and register every protected operation in authorization and OpenAPI.
- Keep summary/history APIs bounded and paginated. Return structured blockers, `allowedActions`, availability, source revisions, and server time. Missing source data is an explicit unavailable state, not zero, empty history, or assumed approval.
- Files remain behind authenticated storage endpoints with opaque references, signature/type validation, same-project attachment ownership, and compensating cleanup. Do not expose banking credentials, unrestricted URLs, or private documents in alerts/logs.

### Permission matrix

| Operation | Assigned Procurement | Assigned Finance | Site/Project Manager and Designer | Super Admin | Client/Vendor |
| --- | --- | --- | --- | --- | --- |
| Read lifecycle | Assigned projects | Relevant payment/finance scope | Existing authorized work/quality scope | Dedicated oversight read | Existing personal views only |
| Propose payment dates | Yes | Yes | No | Dedicated administrative operation | No |
| Confirm dates/authorize payable allocations | No new Finance authority | Yes | Existing certification slots only | Explicit administrative action, no reviewer impersonation | No |
| Record completed external payment | Yes, after required authorization | Yes | No | Explicit administrative action | No |
| Reverse/correct payment or accept retention | Request only | Yes with reason | No | Yes with reason under dedicated operation | No |
| Submit ordered checks, inspections, handover | Yes | No | Existing independent quality/verification actions | Oversight and request correction; no silent Procurement signature | No |
| Procurement readiness declaration | Yes | Financial checks only | Existing independent readiness/verification actions | Review only | No |
| Final project completion | No | No | Existing Site Manager submission | Existing sole final decision | Existing Client acceptance remains required |

Enforce active identity and current assignment inside every read/write and alert delivery. Super Admin access is operation-specific; do not reuse personal Procurement routes that currently deny Super Admin. Recheck sole-active-Super-Admin integrity. Signed actor histories remain unchanged on reassignment.

### Cache and concurrency

Invalidate/update project lifecycle and counts, payment history, procurement dashboards/alerts, basket monitor finance, certification views, relevant execution summaries, quality/snags, site-completion readiness, and Admin completion queries after affected mutations. Scope caches by actor/project, clear revoked data, and preserve drafts on ordinary errors without enabling stale submissions.

Use shared project/order/round coordination writes where necessary to prevent write skew across completion, payment allocations/reversals, priority progression, source reconciliation, and new findings. Completion must use the same authoritative readiness calculation as the UI.

## UX and accessibility

- Reuse established typography, tokens, controls, and tables. Prefer compact task rows with readable notes/history. No new icon package, ornamental cards, gradients, hover animation, or 3D dependencies.
- At desktop width use a single five-tab navigation row and focused content. On phones use horizontally scrollable, keyboard-accessible tabs and stacked payment/checklist rows without page-level overflow. Keep labels readable and focused tabs visible.
- Show loading text, explicit empty/setup-required states, retryable errors, stale-source conflicts, unsaved-draft protection, success messages, and permission-denied states. Do not silently erase entered notes on failed saves.
- Support keyboard operation, semantic tables/forms, accessible names and errors, visible focus, appropriate contrast, and screen-reader announcements for submission status. Status must not rely on color. Respect reduced motion.
- Keep approval/recording actions explicit: `Record payment`, `Submit progress check`, `Submit inspection`, `Submit procurement readiness`, and the existing authorized final-completion action.

## Options and rationale

1. **Recommended: integrate a new lifecycle layer with existing source records.** Keeps the requested five-tab experience while preserving commercial, finance, quality, and Client approval history. Requires coordinated backend work and real background scheduling.
2. **Navigation-only tabs over current screens.** Lower effort, but current data cannot supply payment due dates, actual settlements, Procurement check ordering, inspection quotas, or enforceable signoff. Does not satisfy this request.
3. **Replace procurement/execution/finance with a standalone workflow.** Creates competing sources, migration risk, and duplicated permissions. Not recommended.

## Compatibility, rollout, and failure recovery

- Additive contracts and collections; never rewrite approved estimates, issued orders, certification decisions, signed audits, or completed project history.
- Expose the tabs for all accessible projects. Projects awaiting preparation show prerequisites. New eligible execution projects activate the lifecycle through a transactional command. Existing active projects show `Setup required` and use explicit, audited lifecycle adoption, with confirmed historical payment opening state and prospective inspection/review dates.
- For existing active projects, authoritative final completion requires lifecycle adoption and readiness. Do not create fictional prior inspections or backdated review obligations. Already completed projects retain their original immutable closeout and display legacy coverage honestly.
- Reads never initialize records or mark history as paid/completed. No production backfill is part of this work. Any later data migration needs separate exact-target authorization, backup/rollback, dry run, conflict reporting, and idempotency.
- Ship server enforcement and capabilities before enabling write UI. Keep old clients compatible; new blockers are returned through existing completion paths. API/schema incompatibility displays an upgrade/unavailable state rather than falling back to insecure behavior.
- Alert failure cannot undo a saved payment/check or claim delivery. Durable scheduling catches up after outages, coalesces stale reminders, and exposes last successful run and unresolved failures. Page reads derive current overdue state even if background delivery is delayed.
- Rollback must retain all new historical records. Once projects are enrolled, do not roll back to a backend that bypasses lifecycle completion gates; disable new UI writes while preserving enforcement or deploy a compatibility fix. No destructive cleanup of collections.
- No additional dependencies are expected. Reassess only if existing tools cannot support a concrete requirement.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Every accessible project has five navigable, deep-linkable tabs with unchanged sourcing actions and valid pre-preparation states. | Rendered navigation/history tests, existing basket/priority tests, responsive browser checks. |
| AC2 | Payables come from issued milestones and approved Finance/certification sources; missing dates, reviewers, or historical state remain explicit blockers. | Domain/service/route tests for advance, withholding, zero-value milestones, changed assessment, and legacy sources. |
| AC3 | Partial payments, allocations, reversals, retry, and concurrent attempts produce one immutable, reconciled history without overpayment or duplicate costs. | Replica-set tests with two unequal projects/vendors and distinct invoice, TDS, payment, and cost amounts; basket/detail/portfolio comparisons. |
| AC4 | Due/overdue alerts reach assigned Procurement and Super Admin without browser activity, deduplicate, recover from outage, and stop/reopen correctly. | Fake-clock boundary tests, leased-worker races, restarts, inactive/reassigned users, payment-versus-alert races, retained balances after completion. |
| AC5 | Each round enforces P1 before P2 before P3 on the server; a valid update unlocks progression without requiring work completion. | Domain/API/replica-set tests for mixed baskets, empty groups, blocked P1 checks, repeated names, direct API bypass, and concurrent checks. |
| AC6 | Current Configuration priority is authoritative and changed/unresolved source membership cannot silently reuse invalid approvals/checks. | Draft/active precedence, missing priorities, source changes mid-round, reassignments, superseded items, and immutable historical-round tests. |
| AC7 | Procurement checks retain notes, observed/submitted dates, delay details, original deadlines, next actions, and overdue history. | Validation, timezone/backdating, pause/resume, missed-round catch-up, and alert tests. |
| AC8 | Exactly the configured two or three planned inspections are required across the whole project; stored random dates cannot reroll and visit history records actual coverage. | Seeded/injected randomness tests, retry/concurrency, short projects, late/rescheduled visits, multi-item coverage, third-visit requirement, immutable corrections. |
| AC9 | Quality/delivery/handover evidence and open findings determine readiness; Procurement cannot replace signed Site Manager checks. | Checklist/evidence/authorization tests, duplicate-finding prevention, snag verification, and changed-checklist revision tests. |
| AC10 | Procurement readiness plus existing Site Manager/Client approvals are required for final Super Admin closure; missing payment reconciliation blocks it. | Completion integration tests, old-route bypass attempts, retention case, lifecycle adoption, and completion races against payment reversal/new snag/scope change. |
| AC11 | Roles, project isolation, source versions, file authorization, immutable history, and idempotency are enforced consistently. | Permission matrix using asymmetric identities/projects; route registry/OpenAPI, stale commands, altered retries, revoked access, and attachment ownership tests. |
| AC12 | The interface works with keyboard and at phone/tablet/desktop widths through loading, empty, error, stale, permission, and success states. | Rendered interaction/accessibility tests and browser checks at 390, 768, and 1440 px; inspect console/network errors and alert navigation. |

Start with focused new domain/service/component regressions, plus existing procurement, invoice-assessment, vendor execution, quality/snags, and completion tests. Run replica-set integration tests for changed transactional paths. Because this changes shared authorization, finance, and completion behavior, final verification includes backend/frontend typecheck, test suites, and production builds, followed by `git diff --check` and `git status --short`. Verify native contract compatibility and run mobile checks if mobile contracts require edits. There is no repository lint script.

No product tests/builds have been run during this specification-only stage. Record exact commands and results in the separate task plan during approved implementation; do not claim future verification as complete.

## Assumptions and open decisions for specification approval

Confirmed: five project tabs; preserve current vendor appointment; overdue payment alerts for Procurement/Super Admin; complete payment history; ordered progress updates; mandatory delay/inspection notes; 2–3 inspections project-wide; quality/delivery/handover checklist; project signoff.

Proposed defaults for approval:

- Responsive web delivery first; native screens keep compatible existing behavior.
- Payments are recorded external transfers with Finance authorization, not transfers initiated by Lisno.
- In-app alerts first; three-day and due-day reminders, prompt overdue escalation, one daily repeat.
- Procurement progress-review rounds every seven calendar days, configurable shorter.
- Two planned random-date physical inspections by default, with three selectable before inspections start.
- Procurement submits readiness; existing Client acceptance and final Super Admin completion remain authoritative.
- Unsettled balances block closeout except explicitly approved future retention with continuing alerts.

These defaults can be changed during specification review. The user's inspection scope and priority-sequence choices above are settled. No external action is required to prepare or review this specification.

## Approval boundary

Repository `AGENTS.md`, “Default spec-driven development workflow”, gate 1 requires specification approval before creating the separate task plan: “Create or update only the durable specification” and “Do not create the task plan or implement code.” This stage therefore ends with the specification approval request. A task plan and execution-mode choice follow only after their respective approvals.
