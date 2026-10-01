# Procurement purchase orders, vendor execution, client acceptance, and final project completion

Date: 2026-10-01
Status: Earlier flow and Site Manager completion amendments implemented locally; zero-value scope correction proposed for approval

## Decision summary

Build one traceable flow from the approved estimate through procurement item selection, purchase order approval, vendor delivery or trade execution, client acceptance, and final Super Admin project closure. The approved estimate remains the financial and scope baseline. A purchase order is a separately versioned commitment; vendor progress and client decisions refer to exact approved order lines and work sections.

The user confirmed two product decisions:

- Vendor representatives will use invited vendor accounts, bound to a specific vendor record. Staff worker accounts are not proxies for vendor execution.
- “Delete duplicate estimated items” means remove duplicate **procurement items beneath an approved estimate line**. Approved estimate lines and their approval history remain immutable.

The user's later clarification, “we are no more depended on staff,” means new trade execution is vendor owned. Procurement prepares orders and the Site Manager monitors work; neither staff worker completion nor a staff proxy is a prerequisite for vendor progress or client acceptance.

The requested vendor correction changes activation and Add item selection: a vendor with a submitted Vendor KPI and a rated Procurement KPI becomes effectively active unless its lifecycle was explicitly set to inactive or archived. Induction, profile completion, and physical address verification remain visible records but do not block activation. The Add item form presents only active vendors in a dropdown; candidate creation and onboarding remain in the Vendor directory.

For this amendment, “KPI available” means the existing `selfStatus === "submitted"` and Procurement `status === "rated"` states, with no new score threshold. There is no open product decision. Induction collection, KPI scoring, directory management, and historical item/PO identity are outside this correction. The material risk is that already rated vendors become active immediately; backend assignment and PO guards, directory labels, and the Add item options must all use the same derived status.

Physical verification remains a separate financial control: a KPI-active vendor without it is selectable, but the existing ₹50,000 total allocation cap still applies. The user explicitly confirmed this limit.

## Current behavior and evidence

The vendor row below reflects the current code. The remaining rows preserve the baseline recorded before the original procurement workflow was implemented; they are historical context for AC2–AC10, not claims that those features are still absent.

| Area | Evidence | Consequence at baseline or in current correction |
| --- | --- | --- |
| Vendor picker and activation | `ProjectProcurementItemEditor` uses a searchable text combobox and quick-add form. `GET /procurement/vendors` currently returns active and under-review directory entries, with the latter disabled. `deriveVendorActivation` requires five gates: induction, Vendor KPI, Procurement KPI, profile, and physical verification. | Add item shows vendors who cannot be assigned, and a vendor with both KPIs can still appear Under Review because unrelated gates are incomplete. |
| Procurement rows | `EstimateProcurementItems` renders immutable approved estimate sections with mutable `ProjectProcurementItem` children. The child API has create/update/list/get and a uniqueness index, but no removal operation. | Duplicate child rows cannot be removed from the UI or API. |
| Purchase orders | There is no purchase order model, route, approval, order revision, or order task in the current procurement path. Procurement items store a unit price and optional vendor allocation, but not ordered quantity, tax, delivery date, or order total. | An item row is not a purchase order or a recorded spend. |
| Execution | `projectWorkflowBlueprints` creates procurement, finance, Site Manager, and staff trade tasks when Design is approved. `updateOperationalTask` can set the project to `completed` once downstream staff tasks reach 100%. | Staff tasks would bypass the requested vendor → client → Super Admin completion chain. |
| Vendor identity | `AiEstimatorKnowledgeVendor` is a directory record with profile contact data. `ROLE_CODES` and invitations have no vendor role or vendor-to-user membership. | A directory entry cannot sign in to perform a task. |
| Client and media | Client project pages exist. Design workflow media and procurement receipts already use authenticated storage services, but vendor work images and client execution decisions do not exist. | Task evidence requires a new project-scoped media contract and client review surface. |
| Project status | The current Project status projection derives execution from the old staff task blueprints. | It must report the actual PO approval, vendor, client, and final approval owner for projects using this flow. |

Relevant current files: `frontend/src/features/procurement/{EstimateProcurementItems,ProjectProcurementItems,ProjectProcurementItemEditor,ProcurementVendorField}.tsx`, `backend/src/{domain/project-procurement.ts,models/ProjectProcurementItem.ts,routes/project-procurement.ts,services/project-procurement.service.ts}`, `backend/src/{domain/project-workflow.ts,models/ProjectWorkflowTask.ts,services/project-workflow.service.ts}`, `backend/src/models/AiEstimatorKnowledgeVendor.ts`, and `backend/src/domain/project-status.ts`.

## Goal and boundaries

### In scope

1. Derive effective activation from submitted Vendor KPI plus rated Procurement KPI, while explicit inactive and archived lifecycle states continue to override it. Show only effectively active vendors in the Add item dropdown. Keep under-review and inactive entries in the Vendor directory with their KPI and induction details; create and onboard vendors there, outside the Add item form.
2. Let Procurement remove an accidental child procurement item before it becomes committed, preserving a recoverable audit trail and vendor-allocation reconciliation.
3. Draft, revise, submit, and approve purchase orders with immutable approved revisions and a Super Admin decision queue.
4. Create vendor work tasks from approved orders, separated by actual delivery or trade section, with project, room/section, estimate-line, vendor, and PO lineage.
5. Give invited vendor users a restricted portal to read their own approved orders, update progress, attach optional work images, and submit each assigned section for client review.
6. Give the assigned Site Manager and Super Admin a project progress view with owner, section, dates, evidence, blockers, and change rounds.
7. Give the project Client a section-level review task with a “View images” action beside each submitted section, and Approve or Request changes decisions.
8. Reopen the exact vendor work section after a client change request, preserving earlier submissions, images, and decisions.
9. Create a final Super Admin closure task only when all required sections are accepted and no unresolved scope remains; only that decision can mark the project `completed` in the new flow.
10. Update the Project status projection and task counts for project participants without leaking other vendors' commercial data.

### Outside this change

Automated bank payments, supplier invoices, inventory receiving, inventory valuation, external vendor acceptance signatures, automatic email dispatch of a legal PO, and editing or deleting approved estimate lines. Existing project finance ledger posting continues to represent actual spend. Existing completed projects are not reopened.

## Actors and permissions

| Action | Procurement | Super Admin | Vendor member | Site Manager | Client |
| --- | --- | --- | --- | --- | --- |
| See procurement items and vendor readiness | Assigned project | All authorized projects | No | Progress only | No prices |
| Add/remove eligible child item; draft/revise/submit PO | Assigned project | Read/override only where explicitly permitted | No | No | No |
| Approve, reject, or request PO changes | No | Yes | No | No | No |
| View approved PO | Assigned project | Yes | Own vendor only | Scope/progress, commercial fields only if separately authorized | Work scope only, no vendor price |
| Update work, submit section, upload images | No | Read/audited correction only | Own vendor assignment only | Read | Read submitted evidence only |
| Review submitted vendor section | No | Read | No | Read | Own project only |
| Monitor all project vendor work | Assigned project | Yes | Own vendor only | Assigned project only | Own submitted sections |
| Mark project completed | No | Yes, final task and server-side gate | No | No | No |

Vendor users require a new least-privilege `vendor` identity and explicit active membership to one vendor ID (support multiple representatives per company). Invitation must carry that stable vendor ID and use the existing mail preflight/no-token/no-write semantics when delivery is disabled or unavailable. Email/name matching alone never establishes membership. Revocation, inactive users, vendor suspension, and project removal revoke access immediately. A newly approved PO creates its vendor task even if the invitation is pending; it remains visibly blocked for vendor access until a valid account exists. Super Admin controls vendor invitations and membership. Vendor reads are bounded to approved orders and tasks for the linked vendor, never the full estimate, other vendors, internal margins, client contact data beyond delivery needs, or other projects.

New routes, permission codes, authorization registry entries, OpenAPI, and frontend authorization types must agree. All project/vendor/client scope checks run on the backend for reads, image streaming, and mutations; UI visibility is only a convenience.

## Source and data contract

### Approved scope and procurement children

- Link every child procurement item and PO line to the exact approved `estimateId`, approved `estimateVersion`, review round, and stable `sourceLineItemKey`; retain section and room display snapshots. Reject stale or mismatched source versions.
- The existing child `pricePaise` is a reference unit price, not an ordered total or expense. An order must ask for its own ordered quantity and UOM, price basis, tax amount/rate, delivery/target date, delivery location, scope description, and terms. Never infer ordered quantity from the estimate's area or furniture dimensions.
- Child removal uses a tombstone (`removedAt`, actor, reason, version) and a server-side eligibility check. It is allowed only before any submitted/approved PO or other durable commitment references that child. Existing approved PO and audit snapshots remain readable. Draft PO references must be detached or resolved before removal. Removed rows leave normal lists, allocation totals, and new selection; historical references remain intact. No automatic deletion or merge of suspected duplicates.
- Adjust the current uniqueness constraint to apply to active children through a controlled index transition, so removing a duplicate permits a corrected replacement without losing historical identity. Detect legacy duplicate/index conflicts in a dry run before any migration.

### Purchase order

- One PO belongs to one project and one vendor, may contain multiple approved-estimate source lines, and has a unique human-readable order number, stable ID, revision, vendor and delivery snapshots, line IDs, ordered quantities, UOMs, unit prices, tax and total paise, scope type (`supply`, `execution`, or `supply_and_execution`), section/room linkage, target dates, and terms.
- Price arithmetic uses safe integer paise; tax basis and rounding are explicit. Approved estimate budget, vendor allocated work, PO commitment, and posted ledger spend are four distinct amounts. PO approval records a commitment, not an expense. Existing finance totals and approved estimate baseline must not change when an item or PO is edited or approved. Show commitment and remaining estimate budget separately, with warnings for over-budget orders; an explicit Super Admin override reason is required if the business permits approval above budget.
- PO states: `draft` → `pending_approval` → `approved` or `changes_requested`/`rejected`; a changed order returns as a new revision for approval. A submitted revision is immutable. A material change after approval is a separate amendment requiring Super Admin approval; the original approval remains in history. Canceling an approved order requires a reason and must account for started vendor work, evidence, client reviews, and financial references; it cannot silently erase them.
- Submission and decisions carry actor ID, timestamp, reason where relevant, expected version/CAS, idempotency key, immutable decision record, and audit event. Duplicate clicks/retries produce one approval outcome and one task set. Approval validates current vendor readiness, project/estimate lineage, order completeness, and existing conflicting commitments in a transaction.
- Vendor sees the approved order as a readable, printable order record. If notification delivery is unavailable, the order and task still commit and the in-app delivery state is visible and retryable without creating another order or task.

### Work coverage, tasks, and client review

- The approved estimate's included line keys form the scope register. Each required execution section must be covered by approved PO vendor assignments or an explicit, reasoned Super Admin `not_applicable`/externally fulfilled decision. Uncovered sections block final closure. Multiple vendors may work in one section; each assignment has its own task and client review, with no name-based joins.
- On PO approval, create one vendor task per ordered delivery/section assignment. Task keys include PO revision and stable assignment ID; unique indexes and transactional upserts prevent duplicates. A supplier receives a delivery/proof task; an execution vendor receives the applicable trade task (carpentry, civil/plumbing, electrical, painting, and other configured sections). A single order can create several tasks. The Site Manager tracks these tasks and can record observations, but vendor actions remain vendor-authored.
- Vendor task states: `awaiting_vendor_access` when there is no active member, then `ready` → `in_progress` → `submitted_for_client`; after a client change request, `changes_requested` → `in_progress` → a new `submitted_for_client` round; after client approval, `client_approved`. Progress percentages are informative; setting 100% alone does not create approval or complete the project. Submitting a section creates exactly one client review task for that submission round.
- Client review is per submitted vendor section, identified by immutable task/submission/revision IDs. The Client can Approve or Request changes with a required actionable reason for changes; decisions are immutable, audited, version checked, and idempotent. Client approval closes that work assignment. Change requests reopen only the affected vendor assignment; unrelated accepted sections stay accepted. Prior photos and decisions remain visible as history; the current round clearly shows its own images.
- Vendor images are optional, attached to the exact task and submission round with uploader and timestamp. The “View images” action appears beside a section only when authorized images exist; an empty-state label explains when none were supplied. Validate signature/MIME/size/count, store opaque references via authenticated storage, use compensating cleanup and safe retry, and stream through project/vendor-scoped endpoints with `no-store` and `nosniff`. Client and monitors can view submitted images; a vendor may view its own images. Prevent cross-project or cross-vendor access, including direct media URLs.
- A final Super Admin task is generated once every required scope entry is resolved, all active vendor assignments have client approval, no order/amendment or client change round is pending, and all evidence/source checks pass. A single version-checked Super Admin action records the final closure decision and updates `Project.status` and `actualEndAt` atomically. Reject races with new amendments, reopened reviews, or concurrent completion. Preserve one immutable closure record and audit event.
- The existing staff `trade_execution` tasks are not the authority for new vendor-managed project completion. For projects entering this flow, retire or mark those tasks superseded with an audited transition; keep historical task IDs and progress readable. Stop `updateOperationalTask` from auto-completing vendor-managed projects. Preserve legacy completed project history and make the cutover rule explicit for active projects so none can finish under the old condition while waiting for a PO, vendor, client, or final admin decision.

## UX behavior

- Procurement project page: keep approved estimate section hierarchy. Each section shows estimate amount, procurement children, vendor readiness, scope coverage, PO links, and order status. Add item uses a labeled dropdown containing only effectively active vendors, plus an empty choice; it does not offer free text or quick vendor creation. A link to the Vendor directory explains where to add or complete a vendor. On an existing item, an inactive historical assignment remains readable and unchanged on unrelated edits until the user explicitly replaces or clears it; it is never a new selectable option. Loading, empty, retry, and paged option states are explicit.
- Child row: a plainly named Remove action opens a reasoned confirmation showing whether the item is referenced. Referenced rows explain the blocking PO or commitment. Undo/recovery is available to authorized admins through retained history, subject to identity conflicts.
- Purchase orders: project-level list plus detail/draft editor; prominent `Submit for approval`, exact totals and tax breakdown, vendor and delivery dates, source-line coverage, revision history, and visible approval owner. Super Admin queue shows pending order, amount, vendor, project, budget comparison, source, and Approve/Request changes/Reject actions.
- Vendor portal: `My orders` and `My work` grouped by project and section, with clear due dates, status controls, notes, image upload, and `Submit section to client`. Keep the submit action disabled with a specific reason when a required scope field is missing or access is pending.
- Site Manager and Super Admin: progress by project, room/section, vendor, last update, due date, media count, pending owner, and overdue/blocker state. Their view is read-only for vendor-authored status. Project status button uses the same canonical backend state and names the real pending party.
- Client project: a `Work for your review` area, each section's room/trade/scope, vendor submission date, progress summary, `View images` beside that section when present, and Approve/Request changes. Do not expose unit prices, bank details, internal allocations, or other vendors' unrelated work. A change request asks for a specific explanation and shows the next vendor resubmission round.
- Final Super Admin queue: shows accepted/uncovered section counts, pending blockers, original order and client decision lineage, and one `Mark project completed` action after server validation.
- All surfaces have loading, empty, stale, denied, conflict, retry, and success states; mutation success invalidates item, PO, task, client, dashboard, finance commitment, and Project status queries as relevant. Use established Lisno procurement/configuration styles without generic new dashboard patterns. Support desktop/mobile tables and section disclosures, keyboard focus return, accessible names, and a safe image viewer.

## Transition and failure invariants

1. No vendor task is actionable before an approved PO; no client review exists before a vendor submission; no final closure exists before client acceptance of every required assignment.
2. A PO rejection or change request never mutates an earlier approved revision. An approved order cannot be silently edited through the procurement item editor.
3. A vendor explicitly marked inactive/archived or missing either KPI is visible in the directory but cannot receive a new item assignment or PO. Missing induction/profile/address verification alone does not block a vendor with both KPIs. Already approved work remains readable, while an explicit suspension continues to block further action and is shown to Site Manager/Super Admin.
4. A cancelled order, failed upload, failed notification, duplicated request, stale revision, missing client linkage, or cross-project identity mismatch cannot create orphan tasks, duplicate reviews, an incorrect commitment, or a completed project.
5. Existing financial ledger entries remain the only actual-spend source. PO commitments use their own totals and never double count posted expenses. Verify with two unequal projects, vendors, estimate baselines, tax values, and line quantities.
6. Project status and dashboard projections fail closed when scope/approval lineage is contradictory, instead of guessing an owner or completion state.

## Compatibility, migration, and operations

Use additive schemas and endpoints first. Before activating the new completion rule, run a read-only inventory of active/completed projects, generated staff trade tasks, current procurement children, vendor allocation baselines, and existing uniqueness-index shape. Report conflicts and a dry-run transition mapping. Apply a project-level workflow authority/version marker under an explicit, audited cutover for active eligible projects; already completed projects retain their prior completion history. Do not execute a live backfill or index drop from this specification. The later task plan must include backup/rollback, idempotent transition, replica-set race tests, and a final dry run before any live migration is proposed.

Record structured audit events for item removal, PO revisions/submission/decision/amendment/cancel, vendor membership, vendor progress and evidence, client decision, scope exception, and final closure. Expose safe delivery/cleanup failure states for support without logging files, personal data, private URLs, tokens, or banking details.

The activation correction changes a derived projection; it requires no data rewrite. It can immediately make previously Under Review vendors active where both KPIs already exist. Keep the five readiness flags in API responses for directory context, but apply only the two KPI flags plus the explicit lifecycle override to effective status everywhere that authorizes assignment, PO approval, and vendor work. Add an optional active-only filter to the procurement vendor list API for the Add item dropdown; filter before counting and paging, and retain the existing unfiltered response for other consumers. Continue enforcing activation on the backend when an item or order is saved, even if the dropdown was populated earlier.

## Options considered

- **Recommended: distinct vendor-order and work-review records, with explicit workflow authority.** This preserves approved estimate and legacy staff task history, supports multiple vendors and review rounds, and gives each handoff a stable ID and permission boundary.
- Reusing `ProjectWorkflowTask` as the entire PO/vendor/client record would mix role-specific states, financial order revisions, image submissions, and approvals into the existing three-state staff task model. It cannot represent an immutable order or client decision safely without effectively redesigning that model.
- Deleting approved estimate lines or physically deleting referenced procurement rows would break estimate/finance provenance and historical PO evidence. Use audited child tombstones and the established estimate revision/reapproval path for any real scope change.

## Acceptance criteria

| ID | Outcome |
| --- | --- |
| AC1 | A vendor with submitted Vendor KPI and rated Procurement KPI is effectively active even if induction, profile, or physical verification is incomplete; explicit inactive/archived vendors remain blocked. Add item shows only active vendors in a dropdown, across pages, without editable vendor text or quick-add. An existing inactive assignment remains readable and is not silently cleared. |
| AC2 | Procurement removes an eligible duplicate child with reason and version check; it disappears from active lists and allocation totals, retains audit history, and cannot be removed after durable order commitment. |
| AC3 | Procurement submits a complete PO; exactly one pending approval appears for Super Admin. Reject/request changes permits a new revision; only Super Admin approval freezes it. |
| AC4 | Approval creates the correct vendor delivery/trade tasks once, each linked to vendor, project, section, approved estimate line, and PO revision; retry/concurrency does not duplicate them. |
| AC5 | An invited vendor member sees only its vendor's approved orders/tasks, updates own work, optionally uploads images, and submits sections. Revoked/unaccepted/unlinked identities cannot access them. |
| AC6 | Assigned Site Manager and Super Admin see accurate progress, evidence counts, blockers, due dates, and current owner across multiple vendors/sections. |
| AC7 | Each vendor submission creates one Client review task. `View images` opens only images for that section/round; no-images state and access denial are clear. |
| AC8 | Client approval or reasoned change request records one immutable decision; requested changes reopen only the relevant vendor task and preserve earlier evidence/decisions. |
| AC9 | After every required scope is resolved and accepted, exactly one Super Admin final task appears. Only its successful version-checked action marks the project complete; staff progress, PO approval, or vendor 100% cannot do so. |
| AC10 | Existing completed projects and approved estimate/Design/finance history remain unchanged; active-project cutover conflicts are reported before migration. Project status names the correct pending owner throughout. |

## Proposed amendment: project-wide purchase order request and section totals

This amendment responds to the Procurement project screen showing an approved estimate budget and zero approved PO commitments after procurement items have been added. It supersedes the earlier ordering UX and AC3 only where the prior flow required Procurement to start and submit each vendor order separately. Vendor-specific approved PO records, vendor tasks, immutable approval history, and the existing finance baseline remain the downstream authority.

### Confirmed decisions and current evidence

- The user chose an explicit order quantity on each procurement item. Approved estimate quantity is reference information and must not silently become an ordered quantity.
- The user chose one project approval request containing separate vendor orders and section totals, with one Super Admin decision.
- Currently, ProjectProcurementItem stores unit price and optional vendor allocation but no order quantity. PurchaseOrdersPanel shows approved-estimate budget and already approved commitments; it does not derive a current procurement total. It creates an order only after “New purchase order,” then limits its editor to one vendor and requires each line's quantity, GST, scope, date, location, description, and terms. SuperAdminPurchaseOrdersPage reviews one vendor order at a time and shows item lines without section subtotals. The screenshot's zero commitment is accurate for the present data model, while the requested project order is missing.

### Goal, scope, and product behavior

1. Each new procurement item has an explicit positive planned order quantity, shown with its UOM and unit price. UOM precision is validated using the configured unit. Existing rows may have no quantity until edited; show them as incomplete and preserve their other values. Do not backfill from estimate quantities or rewrite approved estimates.
2. The project screen displays a live, backend-derived purchase order preparation summary immediately after item changes: every approved-estimate section, its active procurement items, planned quantity, unit price, and subtotal before GST; a project subtotal before GST; and a visible count/list of incomplete or already ordered rows. Sections with no procurement item show zero and a clear empty state. Never represent a sum of unit prices or vendor allocations as an order total.
3. A primary “Review and send purchase order” action opens one project request. It includes every eligible, current, nonremoved procurement item across sections; no item can disappear silently from the submitted scope. The review collects explicit GST rate, supply/execution scope, target date, delivery location, and description per line, with safe section-level bulk entry where values truly match, plus vendor-specific terms. It shows per-line, per-section, per-vendor, and grand totals before GST, GST, and including GST. Missing vendor, quantity, allocation, order detail, or stale source blocks submission with a row-specific explanation.
4. Submission creates one immutable project purchase order request revision in pending approval. The Super Admin queue shows the project, request number, submitting actor, approved-estimate baseline, existing approved commitments, proposed section and vendor subtotals, tax, grand total, and exact item details. The Super Admin can approve, request changes with a reason, or reject with a reason. A required reason authorizes approval above the approved estimate before GST.
5. One approval atomically creates a separate approved vendor PO for each vendor in the request and creates each vendor task exactly once. No vendor receives another vendor's prices or lines. If any vendor, source item, amount, allocation, or task write fails, the entire approval rolls back. Request changes returns the project request to Procurement for a new immutable revision; rejection remains historical. The current individual vendor-order route remains available for existing orders and explicit later amendments, but the project request is the main path for newly added items.
6. The Procurement screen shows request status and pending owner. Project status reports Procurement while the request needs preparation or correction, Super Admin while approval is pending, then the appropriate vendor work owner after approval. After any item or request mutation, invalidate the preparation summary, order lists, approval queue, commitments, vendor tasks, dashboard, and Project status queries as applicable.

### Money, lineage, and API contract

- Add nullable plannedOrderQuantityMilliUnits to procurement children; require it for new UI creation and before project request submission. Keep pricePaise as a unit reference price and allocatedWorkPaise as the separately recorded vendor allocation. The planned net amount is the existing PO line calculation: round half up once on quantityMilliUnits × unitPricePaise ÷ 1000, in integer paise. Sum rounded lines for sections/vendors/project. The preparation summary is explicitly “before GST.” A tax-inclusive grand total exists only after an explicit line GST rate has been supplied and validated.
- The canonical preparation read API returns the approved estimate identity/version/review round, section IDs and labels, current child IDs and versions, quantities, UOMs, vendor IDs and readiness, line net paise or a missing-quantity state, section net paise, project net paise, existing approved commitments, and named blockers. It must filter tombstones and fail closed on contradictory source lineage. The frontend formats these values but does not manufacture financial totals.
- The request submission carries item IDs and expected versions, exact per-line commercial/delivery fields, vendor terms, and an idempotency key. The backend reads and locks current rows, verifies the complete current item set and approved estimate snapshot, and persists immutable line snapshots with section/room label, vendor identity, UOM, quantity, unit price, GST basis points, net/GST/gross paise, and actor/time. Store a versioned request header, revision ID, digest, decisions, and audit events. Use compare-and-swap and project-level approval serialization.
- At approval, compare the request's total before GST plus existing approved commitments against the approved estimate before GST. Recheck current vendor activation, item versions, approved source, current project state, and physical-verification allocation controls. For every item, the cumulative tax-inclusive approved PO amount must fit its recorded vendor allocation; this closes the current gap where an individually approved PO can exceed an item's allocation and indirectly evade the user's ₹50,000 unverified-vendor limit. Apply the same guard to the existing individual PO approval path without changing historical approvals. Two unequal projects and multiple vendors must reconcile independently.
- New request endpoints and operations use existing Procurement project-scoped manage/read and Super Admin approval permissions, with route-operation registry and OpenAPI coverage. Client, vendor, Site Manager, and unrelated project actors cannot read the commercial package. Vendor access begins only with its approved vendor PO. No email or legal PO is sent by the internal submission.

### State, compatibility, and failure handling

- State path: derived preparation → pending_approval revision → approved, changes_requested, or rejected. A change request reuses the project request identity with a new immutable revision after Procurement corrects lines; approved vendor POs and tasks are never rewritten by a later request. Repeated submissions and decisions with the same idempotency key converge; changed payloads, stale versions, and conflicting requests fail with explicit 409 responses.
- A current item already referenced by a pending or approved individual PO cannot be submitted again in the project request. Existing approved orders and their commitments remain visible and are not duplicated in the proposed amount. Existing completed projects remain untouched. Historical procurement children with null planned quantity remain readable but block new request submission until corrected.
- The request preview and Super Admin review use the same backend rounding and snapshot source. The pending request is immutable while awaiting decision; edits to source items after submission make approval fail closed and require a fresh revision. No partial vendor approval or task creation is permitted.
- Additive item and request schemas need no data backfill. Before live rollout, inspect and dry run the new indexes and the previously documented project/vendor PO index transition on the named database; provide backup and rollback evidence before any authorized live apply. This specification does not authorize a live migration, deployment, invitation, email, or production mutation.

### Options and recommendation

- Recommended: one internal project request with immutable section and vendor snapshots, then separate vendor POs created atomically on approval. It gives Procurement and Super Admin one reviewable total while keeping vendor documents private and legally coherent.
- Sending the existing individual POs one by one would leave the user without one project decision and could partially approve a project. A single mixed-vendor PO would expose cross-vendor commercial details and conflict with the existing vendor portal contract.

### Amendment acceptance criteria

| ID | Outcome |
| --- | --- |
| AC11 | Adding or updating a procurement item with an explicit quantity refreshes a backend-derived before-GST line, section, and project total. Missing quantity or source data is visible and never counted as zero. |
| AC12 | One project request captures every eligible current item across sections, with explicit GST and delivery details, section/vendor/grand totals, immutable source and item versions, and exactly one pending Super Admin queue entry. No draft or pending individual order is duplicated. |
| AC13 | Super Admin sees and verifies each section, vendor, and line amount against the approved estimate and existing commitments, then one decision approves all vendor POs/tasks atomically or returns/rejects the entire request with audit and immutable history. |
| AC14 | New and existing PO approval paths enforce vendor activation and tax-inclusive PO commitment within recorded allocation, including the ₹50,000 cross-project cap for physically unverified vendors. Stale or raced revisions cannot create partial approvals. |
| AC15 | Procurement, Super Admin, vendor, Client, and Site Manager see only their authorized request/order/status details; desktop/mobile review, keyboard use, query refresh, empty/error states, and project pending owner are accurate. Existing approved POs, estimate history, and ledger spend remain unchanged. |

### Verification for this amendment

Focused contract, authorization, route inventory/OpenAPI, money-rounding, and replica-set transaction tests must cover two unequal projects, at least two vendors in different and shared sections, multiple GST rates, quantity precision, missing/inactive vendor, missing quantity, stale item version, duplicate submit/approve, request-changes revision, budget override, allocation cap, mixed existing/pending orders, and rollback when one vendor task fails. Frontend tests and rendered desktop/mobile interaction and accessibility checks must cover preparation, submission, admin section drilldown/decision, correction, and denied states. Run backend/frontend typechecks and builds, relevant focused tests, git diff --check, and final dirty-path review; report existing broader-suite failures separately.

## Verification required after implementation

Focused backend contract, authorization, finance, upload, and transition tests; Mongo replica-set integration for item removal, PO approval, vendor submission, client decisions, and final closure races; route registry and OpenAPI tests; frontend role-flow tests; rendered interaction, mobile, and accessibility checks for procurement, vendor, Site Manager, Client, and Super Admin views; backend/frontend typecheck, tests, builds, `git diff --check`, and final dirty-path review. Include two asymmetric projects and vendors, different paise totals and tax values, stale versions, revoked identities, missing/failed image storage, disabled invitation mail, and retry cases. No production mutation is authorized by approval of this specification.

## Proposed amendment: Site Manager completion handoff and terminal project status

This amendment records the user's interim completion sequence: the assigned Site Manager sets execution progress to 100% and selects **Complete**; the Client reviews the resulting project completion task and accepts or requests changes; only then does Super Admin mark the project completed. After that final decision, Project status says **Completed** and shows no pending actions. It supersedes the earlier vendor-authored submission and per-vendor Client acceptance requirements as **completion gates** for a project using this Site Manager path. Approved vendor orders, work records, images, and prior Client decisions remain visible as evidence and history. Projects already finally completed are not reopened.

### Current behavior and evidence

- `VendorWorkProgressPanel.tsx` gives Site Manager a read-only vendor progress view. `VendorWorkPage.tsx` and `vendor-work.service.ts` let a vendor member update a section to 100% and submit it to a per-section Client review. There is no Site Manager Complete action that creates a Client completion task.
- `project-completion.service.ts` requires every vendor assignment's Client approval before Super Admin can close the project. `project-status.ts` already clears pending actions when a valid final completion decision exists, but the Site Manager → Client handoff and completed-state write guards across related actions need to be implemented and verified.
- `project-workflow.service.ts` has a legacy staff progress path that may finish a legacy project at 100%. A project in the new procurement flow must never use that shortcut.

### Scope and interaction

1. On an active project with an assigned Site Manager and approved estimate, show project execution progress and an editable integer percentage from 0 to 100 to that Site Manager. Progress updates carry a note, actor, timestamp, expected version, and idempotency key. At 100%, show a separate **Complete and send to Client** action; entering 100% alone changes neither Client task nor Project status.
2. The server enables Complete only when the current approved estimate scope is covered by approved purchase orders or recorded scope exceptions, there is no pending order decision or open amendment, and any earlier per-vendor Client review is resolved. The Site Manager must still own the project's `site_execution` workflow task; `Project.managerId` identifies the Design Manager and is not the site assignment. A completed, paused, stale, or contradictory project cannot submit.
3. Complete creates one immutable project completion submission round and exactly one pending Client task. Snapshot the approved estimate source, approved order revisions, covered sections and assignment IDs, available image references, progress note, Site Manager identity, and time. The Client sees room/section details and a **View images** control beside each section that has evidence; prices, allocations, and other vendor commercial terms stay hidden. The project remains active while waiting.
4. The Client can **Accept completion** or **Request changes** with a required reason. A decision is immutable, version checked, idempotent, and scoped to the project's actual Client. A change request returns responsibility to the Site Manager for an updated round; existing submissions, decisions, and images remain in history. Site Manager resubmission must refer to the current source and record a fresh round. Vendor work can be corrected during this returned state without creating a competing Client completion task.
5. Client acceptance creates one final Super Admin task. The final action rechecks the accepted round, approved source and orders, scope coverage, absence of open amendments or Client reviews, project version, and current active status in one transaction. It records the immutable final decision and `actualEndAt`, then changes `Project.status` to `completed`. Site Manager progress, Client acceptance, and vendor 100% never directly set project status to completed.
6. Project status shows Site Manager before submission or after requested changes, Client during review, Super Admin after Client acceptance, and **Completed** with an empty pending-action list after the final decision. All ordinary project execution, order, progress, submission, and review mutations reject completed projects server-side; role pages remove their action controls while retaining authorized read-only history. Repeated final requests with the same key return the same decision; a different request returns a conflict. No follow-on task is generated after final closure.

### State, access, and compatibility

- Add a project-level completion path/round marker and separate immutable Site Manager submission and Client decision records. The first Site Manager Complete claim selects this path under compare-and-swap. A project with an unresolved vendor Client review cannot switch paths; the UI names that blocker. Once the path is selected, vendor submissions cannot create parallel Client review tasks. Existing per-vendor Client decisions are preserved but do not replace the required project-level Client acceptance. No automatic conversion or data rewrite of completed projects occurs.
- Only the currently assigned Site Manager can update and submit this project-level completion. The Client can read and decide only its own project's submission. Super Admin can read all authorized completion evidence and alone can make the final close decision. Vendor members retain access to their own approved-order history and may update work only while the Site Manager path is returned for changes. Procurement and unrelated project actors cannot submit or decide.
- Backend authorization registry, OpenAPI, frontend contract/types, dashboard/task counts, and Project status must agree. Use authenticated image endpoints with existing storage checks. Completion submissions do not alter approved estimates, PO commitments, vendor allocations, or ledger expenses. Live rollout, cutover, invitations, and production mutations require separate authorization.

### Risks and acceptance criteria

| ID | Outcome |
| --- | --- |
| AC16 | Assigned Site Manager can save 0–100% progress and, only at 100% with complete approved scope, select Complete. Saving 100% alone creates no Client task or completed project. An unassigned or stale manager is denied. |
| AC17 | One Site Manager submission creates one Client project completion task with current section and image evidence, no commercial data, and no duplicate task on retry. Pending vendor review or changed order/source blocks a conflicting submission. |
| AC18 | The project's Client accepts or requests changes with immutable, audited, version-checked decisions. Requested changes return to Site Manager for a new round; only an accepted current round enables Super Admin. |
| AC19 | Only Super Admin's successful, transactionally version-checked final action marks the project completed. Project status then shows Completed and zero pending actions for every participant; ordinary execution and review writes are rejected, while authorized history remains readable. Concurrent or repeated actions cannot create another closure. |
| AC20 | Existing completed projects and prior PO, vendor, Client, estimate, and finance history remain intact. Site Manager path does not revive the legacy staff auto-completion rule or silently discard an open vendor review. |

Verify role and project scoping, state transitions, stale versions, idempotent retries, competing vendor submissions, order/source changes, Client change rounds, final-close races, terminal mutation rejection, and read-only history in focused and Mongo replica-set tests. Add rendered Site Manager, Client, Super Admin, and Project status interaction/accessibility checks, then typecheck/build both workspaces and inspect the final diff.

## Proposed amendment: show 100% vendor task progress after Site Manager signoff

### Current behavior and goal

`SiteCompletionState.progress` records the assigned Site Manager's project execution percentage. `VendorWorkAssignment.progress` separately records a vendor-authored section update. The vendor work progress endpoint and vendor queue display only the latter, so their sections can still show 0% after the Site Manager saves 100%. Saving 100% must make the current project's vendor sections visibly reach 100% for its participants, while the separate **Complete and send to Client**, Client decision, and Super Admin closure gates remain intact.

### Behavior and contract

- On a successful, version-checked Site Manager save of 100%, show **100% Site Manager verified** for every current, nonsuperseded vendor assignment belonging to that project in the vendor work progress view and vendor queue. The backend supplies this effective display percentage and its source consistently; the frontend must not infer it from unrelated task or project records.
- Preserve each assignment's vendor-reported `progress`, `status`, `version`, notes, evidence, submission, and Client review history. A Site Manager percentage does not represent a vendor submission and cannot satisfy the vendor-only **Submit completed section** precondition. The vendor detail form continues to edit the vendor-reported percentage and labels the two values clearly when they differ.
- The display override remains during project Client review, Client acceptance, and final completion. If the Site Manager saves less than 100% before submission, or the Client requests changes and project progress returns to 0%, the override disappears and the vendor-reported section percentage is shown again. A later Site Manager save of 100% reapplies it.
- A new or revised purchase order must not inherit an older 100% verification for work that the Site Manager has not assessed. Invalidate the Site Manager's draft 100% when the current assignment scope changes, or bind the verification to a saved assignment snapshot and require a fresh 100% save before submitting the changed scope. Existing 100% site states must display correctly without a destructive data migration. Keep project and vendor authorization, audit, idempotency, and transactional conflict rules.

### Acceptance criteria and verification

| ID | Outcome |
| --- | --- |
| AC21 | After the assigned Site Manager saves 100%, all current vendor sections show 100% with Site Manager attribution in authorized project/vendor views; a repeated save cannot create extra work or alter vendor-authored progress. |
| AC22 | Vendor status, version, note, images, and Client review history remain unchanged; effective 100% alone cannot trigger vendor submission, Client acceptance, or final project completion. |
| AC23 | Saving less than 100% or a Client change request restores the displayed vendor-reported percentage; a new assignment after a purchase order change requires renewed Site Manager verification before it can show 100% or be sent for Client completion review. |

Verify the 0→100→Client change request→100 lifecycle, vendor input versus displayed percentage, active versus superseded and newly approved assignments, a second project with a different percentage, stale/retried saves, and concurrent scope changes in focused and replica-set tests. Check Site Manager and vendor rendered views, query refresh, backend/frontend typechecks and builds, and repository hygiene. No live backfill or deployment is authorized by this amendment.

## Proposed correction: zero-value estimate lines at Site Manager handoff

### Evidence and decision

The Site Manager saved 100% for Jayan Villa, but **Complete and send to Client** remains disabled. The completion service reports two uncovered approved-estimate lines: “Gypsum plain” in Living & Dining and Master Bedroom. Both are included in the approved estimate with quantities of 100 and 300, respectively, but each has an approved amount of ₹0. The user confirmed that these lines are not applicable because their value is zero. The current coverage loop treats every included line as requiring an approved purchase order or a Super Admin scope decision, regardless of value.

### Required behavior and constraints

- A current approved-estimate line with `amountPaise === 0` does not require a purchase order or a scope exception for Site Manager submission or final Super Admin closure. Keep it in the approved source snapshot and scope register; show it as **No paid work required (₹0 estimate)** when it has neither an approved order nor an explicit exception. If it already has an approved order or exception, preserve that recorded status and all associated lineage checks.
- Every positive-value included line still requires approved purchase order coverage or an explicit, reasoned scope exception. Determine this from the approved estimate amount in integer paise, never from quantity, procurement item price, a UI calculation, or a missing amount. Missing, negative, noninteger, or inconsistent source money must continue to fail closed under existing source validation.
- Do not create automatic exception records, edit approved estimates, change PO commitments or vendor allocations, or alter Client/Super Admin permissions and version checks. The zero-value classification is a derived read and eligibility rule, so no migration or live data mutation is needed. The full approved source stays in immutable submission and closure lineage.
- The Site Manager blocker and Super Admin scope views show room/specification names and the zero-value classification rather than opaque IDs. If Jayan Villa has no other blockers, its existing saved 100% progress permits **Complete and send to Client** after refresh; the Client and Super Admin sequence remains unchanged.

### Acceptance criteria

| ID | Outcome |
| --- | --- |
| AC24 | An included approved-estimate line with zero amount and no order/exception is shown as not requiring paid work and does not block Site Manager submission or final closure. It remains in source/scope snapshots. |
| AC25 | A positive-value uncovered line still blocks; a zero-quantity line with a positive amount also blocks. Existing order/exception records and contradictory lineage still take precedence, and no financial or audit record is synthesized. |
| AC26 | Authorized Site Manager and Super Admin views explain zero-value lines and name any remaining blockers. After saving 100%, the Site Manager can send to Client when all other current eligibility checks pass. |

Verify with focused Mongo replica-set completion tests covering mixed positive/zero lines, positive uncovered lines, zero quantity with positive amount, recorded exceptions/orders, source revisions, and two separate projects. Run focused rendered UI tests, backend/frontend typechecks and builds, and `git diff --check`. No deployment, production mutation, migration, or commit is authorized by this correction.
