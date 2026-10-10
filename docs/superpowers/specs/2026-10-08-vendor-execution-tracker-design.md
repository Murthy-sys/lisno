# Vendor onboarding and project execution tracker

Status: specification awaiting approval. No implementation or task plan authorized for this scope yet.

Date: 2026-10-08

## Goal

Connect issued vendor work orders to secure vendor access, explicit Main Line commitments, daily progress reporting, Site Manager verification, and immediate project visibility for the assigned Site Manager, assigned Program Manager, and Super Admin.

Every open assignment must have an identifiable responsible vendor, next action, reporting obligation, and escalation owner. Preserve existing Procurement approvals, issued commercial terms, Client acceptance, and final project closure controls.

## Confirmed user decisions

- Send an email following vendor work-order issuance so a new vendor can create a password and log in.
- Show assigned/committed Main Line work and timely status updates per vendor.
- Reflect vendor updates immediately for authorized project staff.
- Site Manager must verify completion before a Main Line counts as finished. The user explicitly selected this on 2026-10-08. Vendor reports remain visible immediately.
- Default daily schedule: **09:00 reminder, 18:00 reporting deadline, 19:00 escalation**, **Asia/Kolkata**. The user explicitly selected this on 2026-10-08. Times are configurable per project.
- A basket can contain different Main Lines, modes and vendors. Grouping must not collapse their independent assignments.

## Current behavior and evidence

Verified from the current source on 2026-10-08. Initial `git status --short` was clean.

| Area | Evidence and implication |
| --- | --- |
| Issuance | `backend/src/services/project-purchase-order-basket-issue.service.ts` commits an approved order, allocation, award and vendor assignments together. Both manual and automatic issue paths use its issue command. `project-purchase-order.service.ts` and `project-purchase-order-request.service.ts` also require the transactional approval hook wired in `app.ts`. Integrate all three issuance families through that common contract. |
| Work identity | `vendor-work.service.ts:onPurchaseOrderApproved` creates stable IDs from order ID, approved revision and line ID. Amendments supersede only untouched assignments; started work requires reconciliation. Preserve this protection. |
| Assignment data | `models/VendorWorkAssignment.ts` stores vendor/project/order/estimate lineage, immutable target date, mutable percentage/note, version, review round and request receipts. It lacks a daily report journal, vendor commitment, individual site-verification record and reminder obligation. |
| Vendor portal | `frontend/src/features/vendor/VendorWorkPage.tsx` already supports own assignments, progress, photos, approved orders and submission for Client review. Extend this portal. |
| Internal progress | `frontend/src/features/workflow/VendorWorkProgressPanel.tsx` reads project work with a 15-second stale time and manual Refresh; stale time itself does not update another open browser. No execution subscription is attached. |
| Existing approvals | `vendor-work.service.ts` creates immutable Client review rounds. `site-completion.service.ts` separately supports project-level Site Manager completion, Client review and completion fences. `site-completion-progress.ts` currently treats a saved project-level 100% snapshot as site verification of its assignments. This shortcut must not bypass the new individual verification requirement. |
| Final closure | `project-completion.service.ts` reconciles current work, estimate/design/order lineage and Client site-completion acceptance before Super Admin closure. Do not replace it with a percentage threshold. |
| Invitations | `user-invitation.service.ts` already supports vendor-bound password invitations and transactional acceptance. Manual creation/resend currently requires the sole Super Admin, including issuer checks during delivery/acceptance. Work-order issuance does not invoke this service. An automatic workflow needs an explicit, narrowly scoped authority source; impersonating Super Admin is unacceptable. |
| Manager identity | `models/Project.ts` has `programManagerId`; `procurement-project-identity.service.ts` validates assignment to an active `program_manager`. `managerId` is a different relationship. The current vendor progress service does not grant the Program Manager access. |
| Notifications | `notification-events.service.ts` and `notification-stream.service.ts` demonstrate Mongo change-stream wakeups, authenticated SSE, bounded connections and recovery. Their notification contract is chat-specific. `notification-email-dispatcher.ts` demonstrates durable leases and delivery outside transactions. Reuse these patterns without pretending execution events are chat messages. |
| Existing daily summary | `daily-critical-tasks.service.ts` derives chat actions and overdue workflow tasks. It does not establish the requested vendor Main Line reporting schedule. Avoid a second contradictory source of execution overdue status. |

Historical specs/tests are background only. During implementation, recapture the current worktree and verify these contracts before editing shared files.

## Scope and assumptions

- “Project manager” maps to the existing **Program Manager** role and `Project.programManagerId`; do not add another role or grant access through the Design Manager relationship.
- The tracker covers vendor work created from approved/issued work orders, including supply, execution, and combined scope. Unawarded estimate items are not vendor commitments. Internal in-house task execution remains under its existing workflow.
- Daily means every calendar day by default. An explicitly approved project/assignment hold suspends reporting prospectively; merely reporting a blocker does not suspend accountability.
- Notifications use in-app delivery and email. No SMS, WhatsApp, mobile push, payroll penalties, automatic payment release, or new external vendor service is included.
- Vendor-reported percentage remains the existing 0–100 integer input. This scope adds discipline and history, not a new measured-quantity billing engine.
- Completion evidence: a nonempty completion note and at least one valid photo from the current work round. A reasoned Site Manager evidence exemption is available where photography is inappropriate or impossible; exemption does not itself verify completion.
- Existing configured email transports and cryptographic/password utilities are preferred. No new infrastructure dependency is assumed.

## Recommended architecture and alternatives

Extend the existing vendor-work subsystem with a separate execution journal and schedule/verification records keyed by the existing assignment ID. Retain one assignment source of truth and existing Client review history.

Use authenticated SSE invalidation backed by committed records for immediate cross-session refresh, with bounded polling on disconnection. Polling alone is simpler but gives only periodic updates and does not meet the requested immediate experience as well.

Commit issuance independently from delivery, with durable onboarding intent and visible delivery state. Blocking order issuance on email availability would couple approved commercial work to an external transport and complicate safe retries. The chosen approach preserves an issued order while clearly exposing that the vendor cannot yet access it.

## Work-order issuance and secure onboarding

1. All applicable approval/issue paths atomically create the existing assignments and a deduplicated vendor-access intent identified by vendor, order and approved revision. Include the authentic triggering actor and approved source references. Never call a mail provider inside the Mongo transaction.
2. After commit, a recoverable dispatcher evaluates the saved vendor identity, current account binding, approved source, and mail capability:
   - **Active account bound to this vendor:** send a new-work email linking to authenticated assigned work. Do not reset its password or issue a password-creation invitation.
   - **No account:** preflight delivery, then issue a vendor-only password-creation invitation through the established invitation acceptance machinery.
   - **Matching valid pending invitation:** reuse its account-setup workflow. Do not create one invitation per Main Line or repeatedly rotate a working invitation merely because another order was issued. A new-work email may tell the vendor to use the already-sent setup email. A deliberate resend can rotate the token under existing cooldown/version rules.
   - **Inactive account, conflicting role/vendor binding, ambiguous account/contact, invalid contact or archived/ineligible vendor:** show an actionable access blocker. Never silently reactivate, rebind or convert an account.
3. Extend invitation authority with a discriminated, server-created vendor-work-order source, restricted to role `vendor` and its exact vendor ID. Manual staff invitations retain their existing Super Admin policy. Request input cannot select arbitrary invitation roles, authority sources or vendor IDs through this automatic path.
4. At invitation delivery and acceptance, validate the vendor and currently valid issued-work authority again. Preserve email ownership proof, one-time expiry, hashed tokens, password validation, atomic account creation and concurrent acceptance protection. If all qualifying issued work is cancelled/revoked before activation, its automatic setup authority is no longer valid. Preserve independent manual invitations.
5. Use the saved vendor contact for first invitation and the bound account for subsequent notifications. Contact changes require authoritative revalidation and invalidate obsolete setup generations; an edited vendor email must not silently move an existing account.
6. Disabled/unavailable mail preflight creates **no invitation token, invitation record, invitation audit event or email delivery job**. The independently committed work-order access intent can expose `delivery_unavailable` so staff can resolve and retry it. Issuance and assignment history remain intact.
7. Provider failure after successful preflight is recorded as failed delivery. A leased retry must not create duplicate accounts or replay issuance. If retry requires a new token generation, rotate it atomically after preflight, preserve at most one usable generation, and make the latest email authoritative. Never persist plaintext setup tokens in operational logs or ordinary outbox payloads.
8. Show separate delivery/access facts: queued, sent, failed, unavailable, setup pending, active account, or intervention required. “Sent” means the transport accepted the message; it does not prove reading or password setup.
9. Recheck authority before each retry, cap attempts, honor cooldowns, suppress stale/cancelled work, and provide an authorized retry action. Retain the repository's development-identity external-mail protections.

## Assignment, commitment and daily reporting

### Identity and displayed scope

- One tracker row represents one existing vendor work assignment, not an entire basket or a Configuration Main Line shared by several orders.
- Carry assignment ID, project ID, vendor ID, order ID/revision/line ID, procurement item ID and approved estimate/source-line lineage throughout reads, writes, notifications and audits.
- Display Main Basket/Sub Basket/Main Line and room when stable lineage resolves them. Missing Configuration links are explicitly marked, never guessed from names or substituted from another line.
- Show issued quantity/UOM and target date from the approved order revision. Current Configuration labels may appear separately where supported, but must not rewrite issued quantities, UOM or terms.
- The same Main Line awarded to two vendors, in two rooms, or through distinct orders produces distinct accountable rows.

### Commitment and dates

1. Vendor acknowledges each issued assignment and proposes a start date and committed finish date. Submission must refer to the current approved order revision.
2. Site Manager or assigned Program Manager confirms the operational schedule. Super Admin can do so through an explicit, audited operation. The confirming actor and vendor acknowledgement are retained.
3. Preserve the original issued target date. If the order has none, display “No issued target”; the confirmed operational date does not invent an original contractual date.
4. Date changes require a reason and a new schedule revision. Vendor can propose a change; authorized staff confirm it. Revised dates do not erase original lateness, missed reports or earlier commitments. They do not amend the work order.
5. Missing access, acknowledgement, schedule or assigned manager appears in a staff setup queue. It is not falsely attributed as a missed vendor daily report. Vendor acknowledgement becomes due at the next day's reporting cutoff after access is available.
6. Daily obligations start on the first full scheduled local day after access and schedule confirmation, or the planned start date if later. Show that effective date explicitly. Do not manufacture past obligations during rollout, late-day issuance, or setup.

### Daily reports

- Each submission includes an execution status (`not_started`, `in_progress`, `blocked`, or completion reported), saved percentage and concise work note. No progress or a blocker requires a reason; a blocker also records the next action. A blocker defaults to the assigned Site Manager as its staff resolution owner.
- Reports are append-only events with server timestamp, server-derived project-local reporting date, actor, assignment/order revision, percentage/status, notes, applicable evidence IDs, expected version and idempotency key.
- Multiple updates per day are allowed. The latest valid report is the current daily view; all earlier updates remain available. Editing or correcting means appending a correction with a reason, not deleting history. Backdated input cannot clear a historical missed deadline.
- A valid “no progress” or “blocked” report satisfies the reporting obligation while separately exposing execution risk. Percentage increases are not required merely to satisfy a reminder.
- Uploading a photo alone, saving a schedule, opening the page or acknowledging a notification does not count as a daily report. Staff must not submit as the vendor.
- Percentage decreases are allowed only with a correction/rework reason and a new event; do not silently discard real rework. Verified/submitted work is locked until an authorized changes-requested transition.
- Use existing authenticated upload/storage validation, limits, ownership and compensating cleanup. Report evidence must belong to the same assignment and round; prevent cross-project attachment references.
- A successful save returns the authoritative updated row and reporting state. Conflicting versions return a recoverable conflict without discarding the unsaved form.

## Completion and verification

Keep execution reporting, Site Manager verification, and Client approval as separate facts. Late, missing update and blocked are computed flags, not substitutes for approval status.

| Transition | Authority and requirements |
| --- | --- |
| Assigned → acknowledged/committed | Vendor acknowledges; authorized staff confirms schedule. |
| Committed → in progress / blocked | Vendor submits a valid report. A blocker does not stop daily reporting. |
| In progress → awaiting Site Manager verification | Vendor submits 100%, completion note and current-round evidence, or an approved evidence exemption. A report at 100% alone is not verification. |
| Awaiting verification → changes requested | Assigned Site Manager provides a required reason. Preserve submitted evidence/report snapshot and open a new execution round. |
| Awaiting verification → site verified | Assigned Site Manager reviews the exact submitted version and records the decision. Vendor cannot perform this operation. Program Manager has oversight but cannot substitute for Site Manager verification. |
| Site verified → Client review/acceptance | Preserve existing per-assignment Client review where used and project-level Client site-completion review. Only verified current work can enter a new Client review. |
| Client changes requested → rework | Preserve the immutable Client decision; reopen the affected execution round and require fresh Site Manager verification before resubmission. |
| Client accepted → final project closure | Existing backend completion eligibility and Super Admin closure remain authoritative. No automatic closure or payment action. |

- All open Client submissions, immutable decisions and already completed projects remain valid. Do not retrospectively alter their snapshots.
- Existing project-level “Save 100%” must no longer mark all newly tracked assignments verified. It may submit a project review only when all current assignments requiring the new workflow have an applicable individual Site Manager verification.
- Project-level Client changes requests conservatively require re-verification of the affected snapshot's current assignments before another project submission; retain the previous verification history.
- Keep existing project completion/PO-change fences. A new award, superseding revision, new report round or relevant evidence change cannot reuse a stale verification snapshot.
- Existing assignment amendment reconciliation remains required after acknowledgement/reporting/verification activity too. No transfer of one vendor's history to a replacement vendor.
- While awaiting site/client review, vendor report reminders stop and ownership moves to the reviewer. Review pending age remains visible; pending site verification enters the next daily escalation if still unresolved at the next day's 19:00 cutoff. Client reminders themselves are outside this scope.

## Daily reminders and escalation

Default policy: Asia/Kolkata, seven days per week, 09:00 / 18:00 / 19:00. Store a versioned project policy with effective dates; accept validated IANA timezone and ordered local times. Policy edits apply prospectively and never rewrite already-created obligation cutoffs.

| Time | Required behavior |
| --- | --- |
| 09:00 | In-app reminder and vendor email digest listing each eligible assignment, current status, current percentage, due time and direct authenticated update action. One digest per vendor/project contains distinct Main Line rows. |
| 18:00 | Persist whether each due assignment was reported on time. Missing updates become visible immediately as a backend-derived flag. Record the obligation outcome even if no browser is open. |
| 19:00 | Escalate still-missing reports, open blockers, overdue work and overdue staff verification to the assigned Site Manager, assigned Program Manager and Super Admin. Use one recipient/project digest with the specific affected Main Lines and reasons. |

- A report after 18:00 remains late. A report before 19:00 resolves “still missing” escalation but does not rewrite the missed cutoff. Blocker/deadline escalation can remain independently applicable.
- Exclude future-start work, approved holds, superseded/cancelled work, verified completion awaiting Client acceptance, accepted work and closed projects from vendor daily obligations. Unapproved blocker reports remain eligible.
- An authorized hold requires reason, actor, start and review/resume date. Resume generates prospective obligations; do not erase missed reports from before the hold. The project on-hold state remains authoritative.
- If access is disabled or a vendor/manager becomes unavailable, suppress delivery to that identity and route an access/ownership blocker to authorized staff. Do not silently abandon the work or label access failure as vendor lateness.
- Missing Site Manager or Program Manager assignment is visible to Super Admin. Never send to every user with that role as a fallback.
- Persist obligations independently from email delivery. Use unique semantic keys for assignment/local date/policy occurrence, and for each recipient/project/digest kind. Use lease tokens, expiry, bounded retry and server-side eligibility checks immediately before delivery.
- Restarts and multiple workers cannot generate duplicate logical reminders or escalations. Recover historical obligation outcomes from saved reports/policy effective dates, with bounded batches, and send only the current actionable digest after downtime rather than a flood of old emails.
- Remote mail cannot guarantee exactly-once acceptance across provider/crash boundaries. Maintain one logical delivery record, preserve retry diagnostics and prefer provider deduplication if available; never claim stronger guarantees than the transport provides.
- Notification acknowledgement is distinct from resolving the underlying problem. Live flags derive from work/report state, not whether someone dismissed the alert.

## Immediate progress visibility

- Commit report/decision/schedule changes, their history and a durable execution change event atomically. Emit/wake subscribers only after successful commit.
- Use an authenticated execution SSE channel with project/vendor authorization checked on initial connection, reconnect and each delivery. Current account activation, project assignment and vendor binding remain authoritative.
- Reuse existing change-stream/recovery and connection/backpressure patterns. Cross-process updates must work; an in-memory event emitter alone is insufficient.
- Event payloads contain scoped IDs, changed version and event type. Clients fetch authoritative snapshots. Do not broadcast full work notes, contact details, media links or financial payloads.
- Invalidate relevant vendor list/detail, project tracker, Site Manager verification, Program Manager/Super Admin summaries and completion eligibility queries. Events must not overwrite an unsaved form or let an older response replace newer data.
- Normal connected operation acceptance target: another authorized browser shows the committed update within **2 seconds** in local integration tests. Disconnected views show “Reconnecting”/last-refreshed state and use **15-second polling while visible**. Refetch on reconnect/focus to recover missed events; pause polling for hidden tabs.
- The interface must never claim “Live” while relying only on fallback polling. Authentication/assignment revocation closes or suppresses the stream and clears inaccessible data.

## Permissions

All checks are backend-enforced and synchronized with the route-operation registry, runtime schemas, OpenAPI and frontend visibility.

| Actor | Read | Write |
| --- | --- | --- |
| Vendor | Own current issued assignments, own history/evidence and reminders | Own acknowledgement, proposed schedule, reports, evidence and completion submission |
| Assigned Site Manager | All execution rows/history/evidence in assigned project | Verify/request changes, confirm schedules, approved holds, evidence exemption and project reporting policy |
| Assigned Program Manager | All execution rows/history/evidence in `programManagerId` projects; assigned portfolio | Confirm schedules, approved holds, reporting policy and escalation follow-up; no vendor impersonation or site verification |
| Super Admin | Cross-project tracker and delivery/ownership failures through explicit operations | Reporting policy, schedules, holds and controlled delivery retry; final closure remains existing operation; no silent completion bypass |
| Assigned Procurement | Existing project work/order visibility plus access/delivery blockers | Retry work-order access delivery after resolving contact/setup through authorized existing flows; cannot set vendor progress or verify completion |
| Client | Existing submitted/accepted Client review views | Existing review decisions only; internal daily journals, escalation notes and staff-only blockers remain private |

No broad invitation-create grant is added to Procurement, Site Manager or Program Manager. Work-order onboarding is a purpose-specific service capability, not a general role-management endpoint. Program Manager gets execution access, not unrelated finance/configuration or organization-wide access.

## Product and UI contract

- **Vendor / My work:** compact project-grouped assignment list with Main Line, scope, issued quantity/UOM, dates, reported progress, next action and today's update state. Filters for due today, missing update, blocked, awaiting verification and accepted. Detail panel contains daily reporting, commitment, evidence and timeline.
- **Project / Execution tracker:** available to scoped Site Manager and Program Manager, and Super Admin. Retain existing Procurement navigation and expose a project execution entry with deep links from issued work orders. Evolve the existing progress panel rather than displaying two competing trackers.
- **Staff overview:** compact counts for open assignments, missing reports, blocked/overdue work and awaiting verification, followed by a dense table grouped by vendor or basket. A Main Basket can appear in several vendor/mode groups without duplicating assignments in totals.
- Each row exposes vendor, Main Line/room, order reference, status, reported percentage, verification state, original/current finish dates, last update, today's obligation and next responsible actor. A side panel holds full history and available actions.
- **Program Manager portfolio:** only assigned projects. **Super Admin overview:** all permitted projects with actionable access, ownership and execution exceptions. Do not send the full vendor directory to populate these views.
- Separate “Vendor reported”, “Site verified”, and “Client accepted” counts. Default project progress is **verified assignment count / current assignment count**, explicitly labeled as a count. Do not average mixed-UOM percentages or present this as a payment/cost KPI.
- Provide paginated server filtering and authoritative aggregate counts independent of the loaded page. Stable sorting and typed IDs are required for mixed/split orders.
- Use the existing visual language with compact rows, modest spacing, clear labels, keyboard-accessible actions and responsive mobile detail views. Avoid oversized cards, decorative 3D, new icon dependencies, shadows/gradients, or hover-only actions.
- Show loading text, empty/no-permission/setup-needed states, retryable errors and stale/live status. Use accessible field errors, radio groups, focus management and announcements for saves; do not announce every background row refresh.
- Email content identifies the project/order and actionable work statuses, with authenticated application links. It includes no passwords, unrelated vendor quotes or unprotected evidence links.

## Data and API impacts

Proposed boundaries, with exact types finalized in the separately approved task plan:

- Extend the current assignment DTO with execution state, acknowledgement, schedule, verification summary, update timestamp and authoritative daily flags, without conflating them with legacy Client review status.
- Add execution records keyed by assignment: append-only reports; schedule revisions; completion submissions/verification decisions; approved holds and evidence exemptions. Store immutable source references, actor, version, timestamps and idempotency digests. Unique indexes enforce command replay and one current round/decision.
- Add versioned project reporting policy, daily obligation snapshots/outcomes, recipient-scoped execution notifications, leased delivery intents and durable execution change events. History/notifications must not grow as unbounded arrays inside assignment documents.
- Extend existing invitation record/acceptance authorization with an optional tagged work-order source. Old records default to manual Super Admin authority. Keep memory and Mongo repository implementations aligned for this contract change.
- Extend vendor own-work commands and add project tracker reads, staff verification/schedule/hold/policy commands, portfolio summaries, execution notification read/acknowledge, delivery retry and authenticated change stream. Prefer existing route families where they match semantics.
- Commands require expected version and idempotency key; reuse with a different request digest fails. Review decisions reference the exact immutable submission/version. Use non-disclosing not-found responses for another vendor/project's IDs.
- Backend derives reporting dates, cutoffs, overdue reasons, verification counts and next owner. No UI financial calculations or fabricated zero states. Money remains integer paise where existing order references expose it; this tracker does not change amounts.

## Compatibility, rollout and rollback

- Additive records/indexes and optional tagged fields preserve existing invitation and assignment documents. Do not rewrite issued order snapshots, historical approvals or legacy staff project authority.
- Apply the new verification/reporting workflow to newly issued work and existing open assignments that have no pending or accepted Client review. Initialize their execution records transactionally on an authorized setup/write, never as a side effect of a read. Their previous percentage/note remains historical vendor-reported data, not a fabricated daily report or individual verification.
- Existing open assignments require explicit schedule/setup before daily obligations start. Existing approved dates can be proposed visibly; no mass date inference, retroactive missed-report penalties or bulk invitation email at deployment.
- Grandfather already pending Client rounds through their existing decision path. Accepted history remains immutable. If Client requests changes, the next execution round uses individual Site Manager verification. Preserve existing project pending-review freezes and accepted project closure eligibility.
- Retry/onboard an existing issued order only through an explicit authorized action or a newly issued revision intent; deploying the feature must not send an email blast.
- Backend and frontend contracts land together. Required index checks and dry-run compatibility reporting precede production rollout. Any live backfill, write migration, production index mutation or deployment requires separately authorized target, backup/rollback and final dry-run evidence.
- Use a controlled rollout switch for new onboarding dispatch and reminder scheduling. Disabling delivery leaves assignments/journals and failure state readable; it does not remove completion enforcement for work already on the new workflow. Do not roll back to a version that can bypass stored verification requirements.

## Failure handling and observability

- Persist and expose failed delivery, stale leases, access blockers, missing manager/schedule, invalid source lineage, missed reporting cutoffs and overdue verification. No silent fire-and-forget promise is the only record of a required action.
- Audit acknowledgements, commitments, date/policy changes, holds/resume, evidence exemptions, reports/corrections, site decisions and authorized retries using actual actors and source IDs. System reminder records identify the system actor and due occurrence.
- Record dispatcher last successful tick, pending/failed counts and oldest overdue job; use bounded indexed scans with graceful shutdown and injectable clock. A stopped scheduler must be detectable by operations.
- Limit notification/event retention independently of durable work history. Paginate journals and avoid unbounded SSE buffers or per-row timers.
- New side effects use injected/fake transports in tests. Never expose tokens, credentials, private documents, full personal contact data or setup links in logs, fixtures or screenshots.

## Acceptance criteria and verification

| ID | Acceptance and required evidence |
| --- | --- |
| AC1 | Manual and automatic basket issuance, direct order approval and project purchase-order-request approval create exact assignments and one logical access intent per resulting order/vendor revision. Concurrent retries and transaction rollback create no partial/duplicate assignments or mail. Replica-set tests cover all three issuance families. |
| AC2 | A new vendor receives a vendor-bound password setup email; accepting it once creates only the correct vendor account. Existing accounts receive work notification without password reset. Test collisions, pending invites, contact changes, expiry, revocation, concurrent acceptance and wrong vendor/role. |
| AC3 | Disabled/unavailable preflight has zero invitation/token/audit/email-job writes. Issued work stays issued with an actionable access intent. Failed/sent/crashed/retried dispatch preserves identity and deduplication, with no real external email in tests. |
| AC4 | Two unequal projects, two vendors and split assignments sharing one Main Line remain distinct through list/detail/report/notifications/summary. Issued quantity/UOM and source revision are preserved; cross-scope IDs and mismatched media are rejected. |
| AC5 | Acknowledgement, confirmed dates, justified date changes, holds and daily reports produce versioned history. Same/different-body idempotency, concurrent reports, percentage correction, no-progress report and non-report activity are tested. |
| AC6 | With a fake clock, verify India-local 09:00/18:00/19:00 boundaries, midnight, late reports, first eligible day, future start, project hold/resume, schedule changes, disabled accounts, missing managers and restarts. Duplicate workers cannot duplicate logical obligations/digests. Historical failure outcomes survive late updates. |
| AC7 | Vendor 100% is visible immediately but never counts as site verified. Only the assigned Site Manager can decide the current submission. Test evidence requirement/exemption, rejection/rework, stale decision, new order revision and no project-level 100% bypass. |
| AC8 | Existing Client reviews and final closure remain valid and immutable. New submissions require applicable site verification; Client rework requires fresh verification. Test pending/accepted legacy compatibility, completion fences, amendment races and closure eligibility. |
| AC9 | Independent vendor and staff browser sessions reflect committed updates within two seconds on healthy SSE. Test cross-process event propagation, reconnect/refetch, 15-second fallback, stale indicator, revocation, out-of-order events and unsaved-form preservation. |
| AC10 | Site Manager/project assignment, Program Manager ID and operation-specific Super Admin access are enforced on every read/write/media/stream/delivery retry. Include inactive/reassigned users and asymmetric projects; no blanket role-based project access. |
| AC11 | Each vendor sees its specific assigned/committed work and daily obligations. Staff see all authorized vendors, current status/next owner, reliable totals and complete paginated history. Verify desktop, tablet and mobile, keyboard/focus, accessible names, empty/loading/error/setup/stale states. |
| AC12 | Delivery/scheduler health and actionable failure states are visible; no external send occurs inside a retried transaction. Source changes, leases and unavailable transports recover safely without issuance replay or cross-vendor disclosure. |

Verification will start with focused invitation, order-issuance, vendor-work, site-completion and new execution tests, then cover backend authorization/route inventory/OpenAPI contracts and frontend interaction tests. Run backend and frontend typechecks, full relevant suites and production builds on the integrated result, plus replica-set transactional tests and rendered multi-session QA. Record baseline failures separately. Run `git diff --check` and inspect final status. There is no repository lint script. OCR is unaffected.

## Non-goals

- Replacing Procurement award/approval rules, editing issued financial values, changing estimation mode selection, vendor classification or Configuration pricing.
- Automatically closing projects, approving Client work, releasing payments, issuing fines, computing payroll or changing vendor financial KPI formulas.
- A general resource planner, dependency/critical-path engine, GPS attendance, offline synchronization, or vendor team/sub-user management.
- Broad remediation of the previously deferred security audit.
- Sending real email, deployment, committing/pushing, live migration/backfill or production mutation during local implementation verification.

## Risks and open decisions

- Confirmed: Site Manager verification and the India-time daily schedule above.
- Proposed assumption for spec approval: use the existing Program Manager identity, with project-scoped access; no new Project Manager role.
- Proposed policies for spec approval: daily calendar reporting, grouped per-project emails containing individual Main Line status, current-round photo or audited exemption, and site verification before new Client submission.
- Largest integration risks are invitation authority compatibility and preventing existing project-level completion from bypassing new per-assignment verification. Both require transactional/concurrent tests and explicit compatibility handling, not only UI changes.
- Production email credentials, provider idempotency support, deployment topology and operational scheduler monitoring have not been validated. Local fake-transport tests cannot prove real delivery or production latency. Production enablement remains a separate action.
- No additional user decision is required to prepare the next task-plan gate if this specification is approved.
