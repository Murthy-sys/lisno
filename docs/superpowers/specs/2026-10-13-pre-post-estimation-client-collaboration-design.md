# Pre-estimation, post-estimation, and invited client collaboration

Date: 2026-10-13
Status: Proposed specification, awaiting approval. No task plan or implementation is authorized for this new scope yet.
Risk: High. This changes identity/project access, immutable approvals, financial lineage, design timing, and work-order issuance.

## Goal and confirmed requirements

Introduce two explicit estimate phases. Clients join an initiated project by email invitation and contribute requirements. Pre-estimate approval starts design and procurement preparation. Estimates remain revisable during design. Final post-estimate approval, completed design, and Super Admin confirmation of the initial payment are required before issuing work orders and activating downstream execution.

The user confirmed:

- Clients select **Main Baskets and written requests**. Staff select Sub Baskets, Main Lines, and temporary items.
- Prices are **visible but read-only** for clients.
- Editing ends **after design completion and final client approval**, without waiting for payment confirmation.

The earlier unified estimate landing and property-aware room picker remain in use.

## Current behavior and evidence

Evidence was read from the current source on 2026-10-13. The initial worktree was clean. No production state or customer data was inspected.

| Area | Current source and behavior | Consequence for this change |
| --- | --- | --- |
| Project initiation | `backend/src/services/admin-project.service.ts`, `initiate`: transaction creates project, lead, and Sales Manager grant; immediately links an existing client by normalized email. | New projects need invitation status and acceptance-bound client access without duplicating project creation on delivery retry. |
| Client registration | `backend/src/routes/auth.ts`, `/auth/client-signup`; `backend/src/services/auth.service.ts`, `signupClient`: creates a client, links unclaimed projects by email, and issues a session. | Replace unverified signup/project claiming with invitation acceptance for new access. Retain ordinary login for established accounts. |
| Invitations | `backend/src/domain/user-invitations.ts` excludes clients from `InvitableRole`; `user-invitation.service.ts` has delivery preflight, generations, expiry, role checks, and source-specific vendor authority. | Client invitations require a project-specific authority, not a blanket addition of client to manual staff invitations. |
| Editable estimate | `backend/src/models/Estimate.ts` has one estimate per lead; `backend/src/routes/estimates.ts` saves only owner drafts or change-requested estimates. Approved estimates are locked. | Support a working post-estimate revision without mutating the pre-approved snapshot or changing stable estimate/lead identity. |
| Estimate approval | `backend/src/services/estimate-decision.service.ts`, `approve`: resolves/links the project, resets design assignment/status/version fields, marks the lead won, and ensures a pending finance bucket. | Post-approval must have a separate transition. Calling this existing handoff again would reset completed design work. |
| Approval history | `EstimateClientReviewRound.ts`, `estimate-publication.service.ts`, and `estimate-decision.service.ts` preserve published snapshots, review versions, decisions, evidence, and delivery state. | Extend these mechanisms with explicit phase and source references; do not replace immutable approval history. |
| Design prerequisites | `design-workflow-state.ts` and `design-workflow-state.service.ts` use `initialPaymentAt` for stage availability, submission blockers, and timing. Payment confirmation currently permits Super Admin or Finance. | For the new workflow, pre-approval must start design; payment moves to the execution gate and confirmation becomes Super Admin-only. Otherwise the requested sequence deadlocks. |
| Design completion | `project-workflow.service.ts`, design approval: freezes design, generates downstream tasks, opens finance, and sets the project active. | Separate completed design from authorization to issue work or start execution. Preserve existing design review requirements. |
| Procurement | `procurement.service.ts`, `resolveProcurementProject` and `approvedProcurementSnapshot`: requires `client_approved` plus approved design and resolves immutable approval lineage. | Add a preparation state before completed design, while keeping issue authority stricter than preparation authority. |
| Issuance paths | `project-purchase-order-basket-issue.service.ts`, `project-purchase-order.service.ts`, and `project-purchase-order-request.service.ts` create approved orders/vendor work. Basket awards may auto-issue after approval. | All effective issuance paths need the same transactional final-estimate/payment gate, including automatic issue and retries. |
| Finance lineage | `project-finance.service.ts`, `financeApprovalLineage`, infers the approved version from the current estimate version minus one; `ensurePendingProjectFinanceBucket` requires an unchanged baseline. | Explicit approval references and versioned budget history are necessary when the working estimate continues changing. No overwrite of an existing approved baseline. |
| Client presentation | `frontend/src/features/client/ClientProject.tsx` embeds `EstimateReviewPanel`; `ClientPublishedEstimate.tsx` renders the published item breakdown and read-only prices. | Add a safe requirements surface; keep the submitted estimate review meaningful without exposing the internal selection catalogue. |

## Scope and non-goals

In scope: project-bound client invitation/acceptance and retry UX; client requirements; staff estimate revisions; phase-specific publication and approval; design prerequisites and timing; early procurement preparation; final-source reconciliation; payment/issuance authorization; compatible finance projections; role-aware UI, audit, API validation, query refresh, tests, and local visual verification.

Not in scope: changing pricing formulas, tax/margin policy, vendor tender approval thresholds, shared Configuration ownership, replacing the design review system, general change orders after execution begins, changing vendor execution or Project Manager monitoring processes, adding an email provider, or redesigning unrelated screens. No deployment, customer email, production data mutation, seed, bulk migration, commit, or push is authorized by this specification.

## Recommended architecture and alternatives

**Recommended: retain one estimate identity and introduce explicit phase/revision references.** Keep the existing unique lead-to-estimate relationship. Working content may change, but approved pre-estimate and final post-estimate review snapshots are immutable. Store explicit references to the applicable approved rounds and the current working revision. Keep design state independent of the working estimate's commercial status. This preserves existing links while making every consumer choose the correct source.

**Alternative: create separate pre- and post-estimate aggregates.** This isolates the phases, but requires changing the unique lead constraint and many lead, design, finance, PDF, and procurement joins. It introduces more identity/reconciliation risk without a user-visible benefit for this request.

Simply unlocking `client_approved` or rerunning the existing approval handler is unsuitable: it would make historical source inference unreliable and reset design handoff state.

## Workflow and state transitions

Use a persisted workflow version to distinguish the new lifecycle from historical completed projects. Do not infer the lifecycle from missing payment fields or UI routes.

| State | Client and estimate behavior | Design/procurement behavior | Payment/execution behavior |
| --- | --- | --- | --- |
| Project initiated / pre-estimate draft | Invitation is attempted; after acceptance the client can add Main Basket requirements. Assigned Sales prepares/prices the estimate. | No design execution or vendor commitment yet. | Payment confirmation and order issue unavailable. |
| Pre-estimate awaiting client review | Client reviews an immutable submitted version and approves or requests changes. | Retain existing internal estimate-review thresholds before publication. | No order issue. |
| Pre-estimate approved / design in progress | Preserve the pre-approved snapshot. Open a post-estimate working revision seeded from it with the same stable room/line IDs. Client requests and authorized staff edits remain available. | Design assignment and stages become available; procurement can prepare against a frozen source. | No order issue or work-order-driven execution access. |
| Design complete / final estimate awaiting review | Publish an explicit post-estimate approval round showing changes from pre-approval. Requests for changes return the working revision to editable state. | Procurement preparation continues. | No order issue. |
| Design complete / final estimate approved | Lock requirements and estimate edits. Preserve both approval histories. | Reconcile procurement to the exact final approved source. | Super Admin can confirm payment; issuance remains blocked until confirmed. |
| Initial payment confirmed | Estimate remains locked. | Existing tender, pricing, allocation, and approval checks still apply. | Eligible work orders can issue; existing vendor invitations, assignments, Project Manager monitoring, and execution continue. |

Rules:

1. Pre-approval is recorded once for the accepted pre-estimate source. A post-approval never creates another project, resets designers, repeats completed stages, replaces completed approvals, or duplicates handoff tasks.
2. Interpret “designer stage” as the project's design lifecycle after pre-approval, distinct from the existing internal high-value estimate review by a designer.
3. Final post-estimate approval is explicit even when the final scope/amount equals the pre-estimate. In that case show “No changes from pre-estimate.” Never synthesize a client approval.
4. Publish the final post-estimate only when the current design has completed its required approval and all outstanding requirements are resolved. Final approval binds the exact estimate revision, requirements revision, and approved design review/version.
5. An authorized edit while a review is pending must explicitly withdraw/supersede that pending review before saving, with a visible warning. Keep its published artifact unchanged and reject stale decisions. A client requirement change during review uses the request-changes path and similarly prevents approval of a stale submission.
6. Room, scope, quantity, or specification changes after design approval require design reconciliation before another final submission. Preserve prior design approval as history; record which new scope/design pair is confirmed. Commercial-only changes do not erase design approval but require a fresh final estimate round. Changes must never delete uploaded drawings, measurements, or furniture evidence.
7. Close the edit window atomically when the exact final review is approved. Payment timing must not leave a further edit window. After closure, return an explicit locked-state conflict from every edit/request API.
8. All estimate mutation paths, including configuration refresh persistence, imports or auxiliary editors if present, must honor the same lifecycle policy. Display-time Configuration changes cannot silently mutate a pending/approved snapshot.

## Client invitation and identity contract

- Create the project/lead once under existing initiation permissions. After the project transaction commits, initiate the project-bound client invitation. Delivery failure must not undo a successfully created project or encourage the user to create another one.
- For new-flow projects, matching an existing client email is insufficient to grant access. Invitation acceptance links that specific project. Never claim all projects with the same email through signup or acceptance.
- The invitation authority binds stable project ID, normalized intended email, issuing actor/source, credential generation, expiry, and current project eligibility. Recheck that authority at resend and acceptance; do not accept a caller-supplied role, client ID, or alternate project ID.
- New clients verify possession through the invitation token and create their account. Existing clients sign in to the matching account and accept the project invitation. A token cannot replace an existing account password or transfer its projects. Multiple invitations for different projects must coexist safely without replacing each other's access intent.
- Preserve hashed, expiring, single-use tokens; generation/CAS checks; recipient throttling; revoked/superseded-token rejection; and non-disclosing public errors. Concurrent acceptance creates at most one account per normalized email and links each project at most once.
- Retire the unrestricted client-signup/project-claiming route for new registration, including server enforcement. The signup page explains that project access starts with an invitation. Keep existing client login, sessions, and already-established project memberships working.
- Preflight mail availability before generating an invitation token or writing an invitation, invitation audit, or email. If disabled/unavailable at preflight, retain the project and display “Invitation unavailable” with a retry action when delivery is available. A project-level safe delivery status may be stored; it must not pretend an invitation was issued.
- If enabled delivery fails after an invitation is committed, retain a safe failed delivery state and retry against the same project/access intent using existing generation rules. Do not expose tokens or mail-provider errors. A retry cannot recreate the project or grant access before acceptance.
- Project invitation status/resend/revoke is available only to Super Admin and the initiating/scoped Sales Manager or assigned Sales actor with the corresponding operation permission. Client invitation authority remains separate from manual staff and vendor invitation authority.
- Use synthetic recipients/local mail capture in tests. Implementing automatic emails does not authorize sending real invitations during development.

## Client requirements and price visibility

The client requirements editor contains an allowed Main Basket selector, an optional existing room reference, and a written description. Selecting a basket adds a requirement, not an unpriced commercial line or a fabricated zero-value item.

- Expose only the Main Basket metadata needed for selection. Do not return the staff Sub Basket/Main Line/temporary-item catalogue, internal rates, margins, mode rules, or Configuration management capabilities through client endpoints.
- Preserve the read-only breakdown of items actually included in a submitted estimate so clients can understand what they approve. “Available items” refers to the internal selection catalogue, not removal of the agreed estimate's description/quantity/price details. Internal classification jargon should not be necessary to use the requirements editor.
- Display staff-calculated customer prices and totals as read-only text. Label working prices as indicative and published prices with their submitted version. If a request has not been priced, show “Awaiting estimate”; do not represent it as included at zero cost.
- A requirement has a stable ID, project/estimate/phase, optional room ID, Main Basket ID, text, author, timestamps, and version. Keep edits, withdrawal, staff resolution, and linked estimate line IDs auditable.
- Clients may create/edit/withdraw their own open requests during the edit window. Staff may resolve requests as included, declined with a reason, or superseded with a reference. A resolved request cannot silently change; a new client change creates a new request/revision for review.
- Staff see requests beside the established estimate editor and map them to actual configured or temporary items under existing pricing rules. Require resolution of open requests before publishing either phase. Prevent publication racing with a new client request through a shared version/fence.
- Client payloads cannot set price, quantity of priced lines, inclusion flags, Sub Basket/Main Line IDs, temporary-item identity, assigned staff, approval state, or finance fields. Validate this server-side with strict schemas; disabling a field in the UI is insufficient.
- Keep property-aware rooms and selected-room identity intact. Client request entry does not create measured dimensions or silently change the property profile.

## Design progress, timing, and task generation

For the new workflow, record an immutable design start event at pre-estimate approval. Use it instead of initial payment as the design-stage availability and timing anchor, retaining the existing stage prerequisites, stage-specific timing bands, access pauses, proof requirements, and actor checks.

Payment confirmation must not restart clocks or recompute original deadlines. Historical projects retain their recorded anchors/deadlines. An eligible existing project already started from payment keeps that original start; one that has not started records an explicit transition/start time instead of retrospectively imposing overdue design time.

Design room/scope reads use the explicitly selected working design context, while approved artifacts keep their pinned snapshots. Changed room scope flags only affected confirmations for reconciliation; preserve unaffected completed work and historical evidence.

Create a deterministic procurement preparation task at pre-approval, separate from authorization to execute. Design completion can mark the project as awaiting final estimate/payment, but cannot itself activate work-order-driven execution. Generate or activate execution tasks exactly once from the final approved source after payment. Preserve stable task identity where valid; do not regenerate all tasks each time a draft is saved.

## Procurement preparation, reconciliation, and issuance

Preparation after pre-approval includes available source review, mapping, BOQ preparation, vendor eligibility/onboarding for quotation, enquiries, quotes, comparisons, negotiation, and internal approval work. Existing Configuration activation requirements for vendor dispatch remain authoritative. Existing procurement-vendor invitation authority may support quotation access; an issued-work invitation or execution assignment must not be created early.

- Clearly label a pre/final-pending source as provisional. The default source is the immutable approved pre-estimate. If procurement needs revised design scope before final approval, staff must explicitly release a complete saved post-estimate revision as a frozen preparation snapshot. Never send a vendor mutable/unsaved scope or treat that release as client approval.
- Each BOQ/enquiry/quote/award retains estimate ID, phase, source revision/snapshot ID, stable line IDs, and existing digests. A later draft edit cannot rewrite its vendor-facing scope or prices.
- On final approval, compute added, removed, and changed lines/baskets using stable IDs and actual scope/quantity/UOM/pricing data. Mark affected preparation as requiring reconciliation. Retain prior quotes, attachments, negotiated terms, and approvals as history.
- Preserve unaffected work. Procurement explicitly reconciles each prepared basket to the final source. An unchanged quote may be carried forward with its original immutable provenance when its vendor-facing scope and terms still match. Rebuild the current proposal/source references and run the required current approvals; do not relabel an old frozen artifact as if the vendor originally quoted the final revision.
- Changed scope requires the existing BOQ revision/resend and relevant fresh quote/approval process. Removed lines cannot receive allocations or orders. No duplicate work is generated when a line moves between draft revisions.
- Incomplete/stale Configuration, unmatched sources, unresolved temporary items, and invalid allocations remain explicit blockers. Keep current internal Configuration lookup rules and project-only overrides; never modify shared Configuration or historical customer/vendor amounts.

Every effective order-issue operation must check, in the same transaction as commitments/vendor-work creation:

1. The acting user's existing operation and project scope are authorized.
2. This project's current final post-estimate approval and design approval are complete and consistent, and editing is closed.
3. Super Admin has confirmed initial payment for that final approved source.
4. The proposal/BOQ/source has been reconciled to that final source and all current tender/finance approvals, vendor eligibility, allocation, budget, Configuration activation/freshness, and completion fences pass.

Cover manual basket issue, automatic issue after award approval, individual purchase-order approval that creates vendor work, project purchase-order request approval, and any other path that invokes issued-work creation. Use a shared backend gate and project/source write fence to prevent approval/payment/reconciliation races. Idempotent replay of an already committed issue returns the same result without duplicating orders, assignments, invitations, or notification intents.

Internal approval may complete while payment/final approval is pending. Auto-issue then records a clear blocker and leaves the approved preparation ready for a later explicit retry. Recording payment does not silently issue all waiting orders or bypass refreshed procurement checks.

## Payment, finance, and immutable sources

- Initial payment confirmation for the new workflow is a Super Admin operation, scoped and audited. Finance may view receipt state but cannot confirm this gate. Keep the existing receipt/reference requirement; this feature does not process or transfer money.
- Record actor, receipt reference, time, project, final estimate revision/review round, design approval reference, expected workflow version, and idempotency identity. Missing, pre-estimate-only, stale, or mismatched approval blocks confirmation.
- Preserve every approved pre-estimate and final estimate as an immutable historical source. Do not infer an approved version from `currentVersion - 1` in the new workflow.
- Introduce an explicit current contract/budget source and immutable baseline revision history, retaining the original approved baseline. Pre-approval can support a clearly labeled provisional budget, but it cannot authorize commitments. Final approval selects the final contract baseline; payment enables execution use of it.
- New and existing financial reads, project/detail/portfolio totals, procurement budgets, and workflow projections must resolve the same applicable source. Count each project once, never sum its pre- and post-estimates together. Preserve existing ledger entries and issued amounts; do not turn baseline changes into spend or payment entries.
- A legacy pending finance bucket that is eligible for transition must retain its original baseline/history. Record a new baseline/source revision when the final estimate differs, rather than overwriting the old fields and losing history. If existing commitments or ambiguous lineage make transition unsafe, report the conflict and retain legacy behavior pending explicit reconciliation.
- Keep integer paise internally, explicit rupee boundaries, GST exclusion in margin calculations, and existing ledger-only overhead/spend rules. No pricing formula changes are authorized.

## Authorization matrix

All permissions are operation-specific and project/ownership-scoped. UI capability flags reflect backend decisions; hidden buttons are not enforcement.

| Actor | Requirements / estimate | Approval / payment | Procurement / execution |
| --- | --- | --- | --- |
| Invited client after acceptance | Own project Main Basket requests; read-only customer prices and submissions | Own project pre/final decisions; existing design decisions | Existing client-visible progress only |
| Assigned Sales / estimator | Price and edit owned pre/post working estimate; resolve requests; publish under existing review prerequisites | Cannot impersonate a client decision or confirm payment | Existing scoped read access only |
| Assigned project designer | Edit post-estimate during design and resolve associated requirements using existing pricing validation | Existing design actions; no client impersonation or payment | Existing design scope only |
| Design Manager / Head | Existing assignment, review, and oversight | Existing internal approvals; no new implicit client/payment powers | Existing oversight |
| Scoped Admin / Sales Manager | Manage allowed project invitation actions and existing oversight | Preserve existing client-on-behalf decision flow only with required proof/audit; no proof-free shortcut | Existing permissions |
| Super Admin | Operation-specific oversight and project invitation management | Confirm initial payment; existing explicit on-behalf approvals with proof | Existing order approvals/oversight subject to final-source/payment gates |
| Procurement | Frozen preparation sources and procurement work | Cannot approve client estimate or confirm payment | Prepare early; issue only when all gates pass |
| Finance | Finance projections and receipt visibility | No new-flow initial-payment confirmation | Existing finance approval roles remain |
| Vendor / Project Manager | No estimate-authoring authority added | No client/payment authority | Existing quotation or issued-work scope and monitoring remain |

Update runtime authorization, canonical route-operation registry, OpenAPI inventory, memory/Mongo repository behavior where shared contracts change, and frontend API types together. Reject cross-project IDs, inactive/reassigned actors, forged client associations, and attempts to reuse a review from another phase.

## UX and API requirements

- Project initiation still opens the current estimate landing immediately. Show invitation delivery state and a scoped retry action without replacing the successfully created project with an error page.
- Staff see phase, current working version, pre-approved total, proposed/final total, changed scope, unresolved requests, and the next required action. Use the existing rooms/scope/generate steps and pricing interface.
- The client project opens a requirements section before the first estimate exists, then shows submitted reviews and a clear pre-versus-post comparison. Required actions name the phase being approved. Historical approvals remain downloadable/viewable.
- Procurement shows the preparation source/version and exact blockers for issue, including final approval, payment, or reconciliation. A disabled button must explain the missing prerequisite.
- Super Admin sees payment confirmation only after current final approval; other roles receive read-only status. Historical payment remains visible without presenting it as a new collection.
- Provide loading, empty, retry, unavailable invitation, expired invitation, stale version, permission change, unresolved request, locked estimate, and source-conflict states. Preserve unsaved text on a failed save; do not silently overwrite concurrent edits.
- Use semantic labels, keyboard access, focus/error handling, and responsive layouts at phone/tablet/desktop widths. Reuse established visual styles and icon assets; no decorative redesign or new UI dependency is required.
- Client APIs are dedicated safe projections/commands. Staff editor APIs enforce phase/assignment as well as status. Mutation responses return authoritative revisions/capabilities; use expected versions and idempotency for irreversible transitions.
- Invalidate/update affected lead/detail/estimate, client project/review, requirements, design workflow, invitation, procurement preparation/award, payment, and finance queries. Pending/approved PDFs and emailed review links resolve their stored immutable artifact, never the latest working document.
- Estimate publication and design review submission still commit independently of external delivery. Disabled/failed email records safe delivery state; retries reuse the stored artifact and semantic round. Publication must not roll back because email failed.

## Compatibility, rollout, and recovery

Newly initiated projects use the new workflow. Existing projects still before completion of the designer stage are eligible for an explicit, audited transition during an authorized edit/start-post-estimate action, provided they have unambiguous source/identity and no issued work or conflicting commitments. Do not leave all existing in-design estimates permanently locked simply because they predate this feature.

- Existing draft estimates can retain their stable IDs and enter pre-estimation. An existing approved estimate becomes the pinned pre-approved source; existing assigned designers, drawings, completed stages, room/line IDs, and client memberships survive transition.
- Existing projects that already completed design or issued work keep their legacy closed lifecycle and historical access/payment/approval semantics. This specification does not reopen them or retrofit missing final approval/payment records.
- Preserve a real historical initial-payment receipt. On transition, require Super Admin to attest that receipt against the new final source before it satisfies the new issuance gate. Do not request or record a duplicate receipt/payment amount.
- Do not change immutable historical review/PDF content, timestamps, original deadlines, or issued work to make it conform to the new model. Missing/ambiguous sources must surface as conflicts rather than choose a convenient snapshot.
- No bulk migration/backfill is part of local implementation. Any deployment-time index/schema compatibility work must be documented with dry-run checks, uniqueness/conflict reporting, and rollback; live execution requires separate authorization.
- Deploy compatible readers before enabling new writes. If rollout is disabled, stop creating/converting new-flow projects but keep version-aware readers and safe command handling for already-created ones. An old binary that cannot understand the new lifecycle is not a safe rollback target. Never “roll back” by deleting approvals or relabeling new projects as legacy.

## Principal risks and safeguards

- **Identity expansion:** the existing email-based claim flow and email-wide invitation uniqueness cannot simply be reused for project membership. Acceptance must verify the named project, intended account, and current invitation generation without affecting another project's invitation.
- **Approval and design regression:** current approval resets design fields and downstream readers assume one approved version. Introduce explicit phase/source references before permitting post-estimate writes, and preserve design history through every transition.
- **Financial drift or early commitments:** mutable draft totals, unreconciled quotes, and automatic issue paths could bypass the intended gate. Pin snapshots and enforce one transactional gate on all effective issuance paths, with asymmetric-project reconciliation tests.
- **Lost procurement effort:** final approval may supersede prepared scope. Preserve frozen artifacts and unaffected terms, show a line-level reconciliation result, and require current approvals for the resulting proposal.
- **Compatibility and timing:** changing the start trigger could retroactively change deadlines or block ongoing work. Version the lifecycle, preserve historical anchors, and test guarded transition separately from completed legacy projects.

## Failure handling and observability

Use domain errors with actionable safe messages for stale revisions, closed editing, unverified invitation access, unresolved requests, missing final approval, missing payment, and procurement reconciliation. No success response may imply a transition that did not commit.

Audit invitation lifecycle and project acceptance, requirement changes/resolution, pre/post publication and decisions, design-scope reconciliation, workflow transition, final baseline selection, payment confirmation, and issuance with stable IDs, actors, source versions, and idempotency references. Retain existing deduplication and transaction semantics. Logs must not contain credentials, invitation tokens/URLs, raw client documents, or receipt content.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence during implementation |
| --- | --- | --- |
| AC1 | Successful initiation creates one project/lead and attempts a project-bound invitation; disabled/failed delivery is recoverable without recreating the project. | Initiation + invitation service tests for disabled, unavailable, failed, sent, retry, duplicate request, and concurrent delivery; rendered status/retry checks. |
| AC2 | Only valid acceptance grants the named project; new and existing clients work; public signup cannot claim projects. | Memory and replica-set tests for expired/revoked/superseded tokens, wrong-account acceptance, two simultaneous project invitations, account-creation race, role conflicts, and direct signup/API attempts. |
| AC3 | Clients can add Main Basket requests and see read-only prices, without access to the available child catalogue or commercial writes. | Payload/response and authorization tests, cross-project/asymmetric clients, forbidden catalogue requests, tampered price/line IDs, and rendered accessible interaction checks. |
| AC4 | Pre-approval opens design and preparation while preserving the immutable pre-estimate; later edits do not reset progress. | Transactional lifecycle tests across both phases, high-value internal review, same project/room/line IDs, retained design assignment/files/stages, and no duplicate handoff tasks. |
| AC5 | Design revisions and client requests are coordinated; final approval binds the latest complete design/estimate/request versions and closes edits. | Edit-versus-publish/approve races, withdrawn stale links, unresolved requests, scope/design reconciliation, request-changes/resubmission, unchanged-final confirmation, and direct edits after locking. |
| AC6 | Design works before payment using a correct immutable start anchor. | Stage/prerequisite/submission tests; access pauses; deadline/KPI regression; legacy timing preservation; payment confirmation does not restart design. |
| AC7 | Procurement can perform preparation during design, preserves frozen vendor scope, and reconciles final changes explicitly. | Replica-set tests for added/removed/changed/unchanged lines, stable IDs, quote retention, stale awards, current Configuration, preparation dispatch rules, and separate quotation/issued-work invitations. |
| AC8 | No effective issuance path can bypass final approval, design completion, payment, source reconciliation, or existing approval checks. | Manual/automatic basket issue, individual-order and project-request tests; malicious direct calls; issue versus reconciliation/payment races; duplicate issue replay; zero premature commitments, assignments, or issued-work intents. |
| AC9 | Only Super Admin confirms the new-flow payment gate and the receipt binds the final source. | Role matrix including Finance denial, cross-project and stale-source tests, idempotent receipt recording, and historical receipt attestation without duplicate money. |
| AC10 | Finance derives one effective approved source per project and preserves original/history amounts. | At least two unequal projects and unequal pre/final totals; project/detail/portfolio and procurement-budget reconciliation; integer-paise/GST/ledger tests; no duplicate project totals or rewritten historical baseline. |
| AC11 | Existing in-design estimates can transition safely and completed/issued projects continue unchanged. | Fixtures for draft, pre-approved unstarted, partially completed design, existing receipt, pending finance bucket, completed design, issued work, and ambiguous lineage; no uncontrolled backfill. |
| AC12 | Existing publication, design approval, vendor invitation, Project Manager assignment/monitoring, room picker, and unified lead landing continue working. | Focused regressions plus end-to-end final approval → payment → issue → existing execution handoff with synthetic data. |

Run focused regressions first, then backend and frontend typechecks, complete available suites, and production builds for this shared-contract change. Changed Mongo transaction paths require replica-set coverage; do not replace it with memory-only tests. Include route-operation/OpenAPI/authorization consistency checks, rendered mobile/tablet/desktop interaction and accessibility checks, runtime console/network inspection, and `git diff --check`/`git status --short`. There is no repository lint script; do not report lint as passed.

Final implementation handoff must state exact passing/failing/unrun checks, visual evidence paths, compatibility limits, and external actions not performed. This specification itself has only source inspection and document hygiene validation, not runtime verification.

## Assumptions, open decisions, and approval boundary

- The confirmed client choices above are settled; do not ask them again.
- Final confirmation is required even if post-estimation is unchanged. Final submission follows current design completion, with reconciliation if scope changes afterward.
- Read-only submitted line details remain visible to clients; only the available internal selection catalogue is withheld.
- Early procurement may release explicit frozen design revisions for preparation and use existing quotation-access invitations, but cannot grant issued-work/execution access.
- Existing active client login is retained; invitation acceptance becomes the source for new project membership. Eligible in-design projects transition through an audited command, not a bulk rewrite.
- These assumptions form part of this proposed specification and are reviewable at the specification gate. No additional product question remains unanswered before specification review.

Per repository `AGENTS.md`, approve this specification before a separate task plan is created; approve the plan and choose execution mode before implementation. Approval here does not authorize deployment, real invitation delivery, live data conversion, or other external mutation.
