# Editable client quotation, two estimate approvals, and design handoff

Date: 2026-10-30
Status: Approved by the user; implementation authorized in Mode A
Classification: High-risk workflow, authorization, commercial approval, and data-lineage change

## Goal

Allow estimation to proceed before design is complete. Give the Client an emailed link to an editable quotation containing only permitted Main Lines. Require an initial Sales/Client approval and a second Client approval of the Designer's revised quotation. Lock the approved quotation, continue actual design work, and hand over to Procurement after the Client approves the design.

Move existing-furniture collection into the Client's tasks, with an optional Lisno assistance request. Treat the Designer assigned by Super Admin as primary and allow that primary Designer to choose up to three secondary Designers.

This specification does not authorize production changes, customer emails, account actions, live migrations, commits, or deployment. Implementation and local verification are recorded in the approved task plan.

## Evidence and current behavior

Inspected repository HEAD: `598901421e8addc27878a9f6cac25afa6db457ab`. Initial worktree was clean.

| Area | Current source and behavior | Required difference |
| --- | --- | --- |
| Two-phase estimation | `backend/src/domain/estimation-lifecycle.ts` and `models/EstimationLifecycle.ts` have workflow version 2, pre/final approval references, a pending round, and an edit-closed timestamp. Final approval includes a required design-review reference. | Preserve history while separating quotation completion from subsequent design completion. |
| Design-before-estimate dependency | `estimate-collaboration-policy.service.ts:currentFinalDesignBinding`, `estimate-publication.service.ts`, and `estimate-decision.service.ts:approveFinal` require the current design to be approved before final estimate publication/approval. `LeadEstimateWorkspace.tsx` repeats the publication blocker. | The proposed second quotation approval occurs before key collection and actual design work. Backend and UI must use the same revised sequence. |
| Client editing | `estimate-tiers.service.ts` supports narrow configured tier/component and dimension changes. `estimateWorkingCopyEditable` rejects pending review and closed estimates. `ClientEstimateTiers.tsx` instructs the Client to request changes before editing a submitted quotation. | Client can edit and Save allowed quotation fields during the review window without a separate request-changes prerequisite. |
| Client visibility | Configuration Overview stores `clientVisible`. `estimate-tiers.service.ts` checks saved and current Configuration visibility. `estimate-client-presentation.ts` filters client screen rows. OpenAPI explicitly states that existing quotation PDFs and totals retain all lines. | Enforce client visibility consistently for client reads, candidate lists, writes, quotation PDFs, and email attachments. |
| Synchronization | Client mutation invalidation is local to its browser. `LeadEstimateWorkspace.tsx` loads the estimate on mount, disables focus refetch, and has no interval on that query. | A Client save must become visible in an already-open Estimator/Designer session without manually reloading and without replacing unsaved edits. |
| Design task start | `workflowDesignStartAt` and workflow blockers currently allow version-2 design to start from pre-estimate approval. | Start actual design tasks after second quotation approval for the new flow. |
| Furniture collection | `design-workflow.ts` includes `existing_furniture_dimensions`. `design-workflow-state.service.ts` lets a Designer declare requirements and submit combined measurements/evidence; Clients accept/review and also have an upload path. No assistance choice or TBD fee exists. | Designer requests collection; Client owns the response, assistance choice, or dimension entry. |
| Designer assignment | `project-workflow.service.ts:assignDesigner` records one design-plan Designer. `Project.ts` also stores `initiatingDesignerId` and `assignedDesignerIds`; other workflows consume that array without a primary/secondary distinction. | Explicit primary identity, at most three secondary identities, and scoped control over team membership. |
| Procurement and payment | Pre-approval can create preparation tasks. `activateCollaborativeProjectWorkflow` requires matching final-estimate, approved-design, and initial-payment references. | Formal handoff follows actual design approval; retain the existing payment and issuing safeguards without creating a circular prerequisite. |

## Confirmed user decisions

The user confirmed all three choices on 2026-10-30. These replace the provisional alternatives; they do not by themselves approve the full specification or authorize implementation.

1. **Editable Client fields:** allow selecting/removing client-visible configured items, quantity/dimensions, and configured tier/component/specification options. Rates remain read-only. Prices, discounts, tax rules, margins, and totals remain server-controlled and are recalculated from Configuration.
2. **Second approval timing:** Client approval of the Designer-revised quotation happens **before** key collection and operational design tasks. Its requested label is **Post-design approval**, with supporting text **Designer-revised quotation**. This is distinct from the later **Design approval** for uploaded drawings.
3. **Hidden Main Lines in documents:** No-marked lines are hidden from **all client-facing quotation views and documents**, including PDFs and email attachments. Retain the complete internal source and true total. Preserve original issued artifacts as immutable history; do not serve an unfiltered internal artifact as the client-facing copy.

Other assumptions submitted for approval:

- “Sales team” means the project's assigned Sales estimator and existing scoped Sales oversight, not unrelated Sales accounts. “Design team can unlock” means the assigned primary Designer; secondary Designers have no independent commercial unlock authority.
- The first approval requires explicit Sales and Client approvals of the same priced revision. Submission is not silently treated as Sales approval unless the action clearly states **Approve and send to client** and records that approval.
- The second phase needs Client approval plus submission/review of that revision by the primary Designer. Sales retains visibility; an additional mandatory Sales signature at the second phase is not requested.
- Completing the second approval marks **Estimation complete**. It does not wait for drawings. The later drawing approval controls Procurement handoff.
- “Charges to be determined” records an assistance request, not an amount, invoice, payment, or agreement to an unknown charge.

## Intended workflow

| Step | Actor and action | Result and next gate |
| --- | --- | --- |
| 1. Prepare quotation | Assigned Sales creates/edits an estimate using current Configuration. | Estimation is available regardless of designer-stage completion. Normal completeness, pricing, access, and version validation still applies. |
| 2. Invite Client review | Sales approves the priced revision and sends the quotation link. | Client opens the quotation in their authenticated project. Publication and email delivery have separate outcomes. |
| 3. Client edit and Save | Client edits permitted fields and saves. | The server updates the working estimate, recalculates price, creates a new revision, and invalidates approvals for the changed revision. Estimator sees the saved revision automatically. Save is not approval. |
| 4. Pre-design approval | Sales and Client explicitly approve the same current revision. | Freeze the initial baseline. Make it available to the assigned primary Designer. Do not start actual design tasks yet. |
| 5. Designer quotation review | Primary Designer works from a new revision of the approved baseline; adds/removes items and edits permitted estimate fields. | Initial approval remains readable. Sales and Client can review the current proposal and the changes from the baseline. |
| 6. Post-design estimate approval | Primary Designer submits the revised quotation; Client approves the current submitted revision. | Freeze the second approved quotation and lock estimate editing. Mark Estimation complete and make operational design tasks available. |
| 7. Design execution | Primary/secondary Designers perform their permitted existing tasks. Client handles requested existing-furniture information. | Preserve key handover, measurements, evidence, room dependencies, and design-review workflows. |
| 8. Design approval | Designer uploads/submits design; Client approves the current design version tied to the approved quotation scope. | Create/activate the formal Procurement handoff exactly once. Payment and issuing gates still apply to downstream commitments. |

When the Client edits a proposal already sent for approval, atomically supersede its undecided review, persist a new working revision, and require review of that revision. Do not overwrite a published snapshot. The quotation screen must clearly distinguish **Saved changes**, **Awaiting Sales/Designer review**, and **Ready for your approval**. Staff republishes the reviewed revision before a final Client decision. The old email link must explain that its revision has been superseded and direct the authorized Client to the current quotation.

No state transition may depend on a future stage that itself requires that transition. In particular, quotation approval cannot require uploaded design if design work is gated by quotation approval.

## Client quotation and Configuration rules

- Use stable Main Line IDs to resolve the latest saved draft revision, otherwise the saved active revision. Use the existing current-Configuration resolver; do not join by names or silently substitute another line/revision.
- Show only Main Lines with effective Overview `clientVisible = true`. Preserve the existing compatibility default for historical missing flags, which Configuration currently presents as Yes. Invalid/unavailable current Configuration must not grant editing or disclose a line through a fallback.
- Client selection candidates, current lines, change summaries, API reads, and mutations must enforce the same rule on the backend. Forged requests for hidden or unrelated lines fail without exposing details. Client cannot write `clientVisible` or change Configuration.
- Every client quotation download and email attachment uses the client-safe projection. Where an existing archived artifact contains hidden lines, preserve that original and provide a separately identified client-safe rendition with unchanged approved amounts; if it cannot be produced safely, report it unavailable instead of serving the unfiltered original. Previously delivered external files cannot be recalled by this feature.
- Restrict candidate selection to the project's configured baskets, rooms, applicability, and current mode rules. This is not an unrestricted Configuration browser or free-text rate editor.
- For dimension-driven lines, validate required dimensions and derive quantity with the configured formula. For ordinary quantity lines, enforce configured UOM precision and limits. Only configured option IDs may be saved.
- Recalculate all affected totals in integer paise, including existing component pricing, low-quantity adjustments, margin, and GST rules. Never accept client-supplied rates, totals, or hidden-line changes.
- A patch to visible lines must retain hidden internal lines and their amounts. A Client save must not replace the complete estimate with the filtered client payload.
- Hiding a line changes presentation, not the contracted total or internal cost. Display the authoritative overall quotation total; do not claim that visible-row totals are the complete total when hidden scope contributes. Use concise explanatory copy without exposing hidden names, rates, or quantities.
- Preserve the approved snapshot and issued artifact amounts. Current working drafts may refresh Configuration values; approved and issued history cannot be rewritten by later Configuration edits.
- Incomplete or incompatible configuration shows a clear repair state and prevents publication/approval of an incomplete amount. It is never priced as zero.

## Saving, synchronization, and concurrency

- All mutations carry the stable estimate/project identity, expected estimate revision, applicable Configuration versions, and an idempotency key where the existing transition pattern requires one.
- Client saves are atomic: validation, permitted-line updates, derived prices, revision increment, supersession, audit, and approval validity change either commit together or do not occur.
- Concurrent Client/Sales/Designer saves use CAS. A stale writer receives a conflict and current revision metadata; no last-write-wins overwrite and no automatic approval retry.
- Reuse existing TanStack Query families. After a successful save, invalidate/update every affected estimate, client review, workflow, summary, and total query in that session.
- Add bounded background revision checking while the Estimator/Designer/Client quotation screen is visible, using conditional revision reads and a target of updates within 5 seconds under normal connectivity. Pause background polling when hidden and revalidate on return. Reuse an established suitable event mechanism only if it is already available without introducing a new infrastructure dependency.
- If no local edit is pending, load the new authoritative data. If the staff user has unsaved input, keep it and show that the Client changed the estimate; require explicit reconciliation before Save/approval. Do not silently reset fields, pricing, scroll, or selection.
- Show loading, failed save, stale/offline, locked, conflict, and superseded-review states. “Saved” is shown only after the server confirms the write.

## Approvals, locking, and unlock

- There are two **estimate approval phases**. The later uploaded-design approval is a separate existing design decision, not a third estimate approval.
- Record actor, role, source, time, exact revision, price digest, and immutable snapshot for each approval. Preserve existing client-on-behalf proof rules; scoped staff does not silently impersonate the Client.
- A first-phase revision is complete only when both Sales and Client signatures reference that revision. A change to scope, quantity, configuration option, or price makes older signatures historical, not valid for the new revision.
- The Designer revises a working copy derived from the approved pre-design baseline. Show added, removed, changed, and price-difference summaries using stable line identities; apply client visibility to the Client's summary.
- The second Client approval locks quotation writes at the backend and UI. Locking the quote must not freeze the ability to upload, annotate, or approve actual design artifacts. Use distinct quotation and design lock state.
- Assigned Sales or primary Designer can choose **Unlock estimate**, give a reason, and create a new editable revision. Keep all prior snapshots, approvals, issued documents, and actor history. Secondary Designers and Clients cannot unlock.
- Unlocking does not mark the new revision approved. Revisions after the initial baseline repeat the second estimate review/approval phase. If physical scope changes, mark affected design acceptance as needing reconciliation and reapproval before new Procurement dispatch. Financial-only changes still need quotation reapproval, without inventing a physical-design change.
- While a revision is open, block new commitments relying on that unapproved revision. Existing issued orders, payments, completed tasks, and approved versions are never silently changed or cancelled. Reconcile downstream lineage explicitly before replacing the effective approved source.
- Require a current version and serialize unlock versus approve, publish, payment recording, design approval, and Procurement issue. Concurrent/retried transitions cannot produce duplicate approvals, emails, or downstream tasks.

## Existing furniture: Client task and assistance

- Primary Designer can request existing-furniture details for the relevant project rooms after the second quotation approval. The actionable collection form belongs to the Client's project/tasks screen. Designer sees request progress and can review submitted information.
- Client answers **Do you have existing furniture? Yes/No**. No records an explicit not-applicable response and does not create dimensions or fees.
- If Yes, show **Need Lisno assistance? Yes/No**.
- If assistance is No, Client enters furniture item names, room, UOM, and applicable dimensions/counts, and saves/submits the information. Reuse existing measurement validation and authenticated evidence upload support. Distinguish personal existing furniture from billable estimate lines; do not require every piece to be a Main Line in the quotation or add it to the estimate automatically.
- If assistance is Yes, save an assistance request and show **Additional charges: To be determined**. Store the amount as unknown/null, not zero. Do not create a ledger entry, tax amount, payment request, or binding fee acceptance. Pricing/charging that service is a later explicitly scoped feature.
- Assigned Designers can record collected measurements for a requested assisted collection with correct actor attribution; Client review/acceptance of assisted measurements remains explicit. No staff upload is labeled as Client-entered data.
- Self-entered submissions record the Client's confirmation; Designers can return incomplete/invalid information with a reason. Revisions retain prior submissions and reviewed evidence. The completion predicate must distinguish Client-submitted information from assisted information and cannot auto-approve unreviewed staff measurements.
- A pending assistance request is not completed collection. Required room measurements must be resolved before dependent design submissions can complete. Existing kickoff/key/site-measurement requirements remain independently enforced.
- Changing the furniture/assistance choice after submission is versioned, audited, and cannot erase accepted measurement history or incur a silent charge.

## Primary and secondary Designers

- Super Admin's assigned Designer is the primary Designer. Only the primary Designer can select/manage up to three secondary Designers for that project. Super Admin retains existing audited assignment/override authority.
- Store stable primary and secondary user IDs explicitly. Synchronize the legacy assigned-designer set as a derived compatible union; do not infer primary identity from array order.
- Candidates must be active, non-deleted Designer accounts eligible for assignment. No duplicates, no primary repeated as secondary, and no fourth secondary. Enforce limits and current actor/target status within the transaction.
- Secondary Designers can see the relevant project and participate only in already-defined permitted design tasks. This request does not define new miscellaneous task templates, grant commercial approval/unlock authority, or let a secondary appoint other Designers.
- Existing routes that treat every assigned Designer as interchangeable must be checked for quotation editing/submission, team changes, task assignment, uploads, reviews, and file access. Apply operation-specific primary/secondary rules rather than a broad role-only grant.
- Reassignment/removal invalidates relevant queries and access on subsequent requests, preserves historical attribution, and reports unfinished assigned work. Do not automatically complete, delete, or transfer that work.

## Procurement, finance, notifications, and deadlines

- Formal handoff follows Client approval of the current uploaded design associated with the locked second quotation. Create handoff/task records once with both immutable source references and a deterministic deduplication key.
- Before that handoff, existing preparatory visibility may remain clearly provisional; it must not be represented as execution readiness or authorize vendor dispatch from an unapproved source.
- Preserve current initial-payment requirements for execution and order issuance. Decouple the second quotation approval from the design-review reference that will exist later; bind the final pair at design approval/handoff. No fake design reference or automatic payment confirmation.
- Freeze the effective approved estimate for financial reporting. A working revision is not approved revenue. Project/detail/portfolio views and Procurement must agree on the same approval reference, integer-paise totals, and GST treatment.
- Queue quotation email only on an explicit send/publish transition, not every field change or save. Use the established authenticated portal link and safe retry of the same stored artifact/semantic round. Publication commits independently from disabled/failed mail; display delivery status truthfully.
- New actual-design timing begins when the second quotation is approved and the task becomes eligible. Preserve immutable original deadlines and historical KPI timing for existing projects. Do not reset old deadlines merely by enabling the new workflow or reopening a quote.
- Record safe audit events for Client saves, Sales approval, Designer review, second approval, unlock reason, furniture request/choice/submission, team changes, and handoff. Avoid tokens, private links, file contents, or unnecessary personal data in logs.

## Permission matrix

| Operation | Client | Assigned Sales | Primary Designer | Secondary Designer | Super Admin |
| --- | --- | --- | --- | --- | --- |
| Read quotation | Own project, client projection | Scoped project | Assigned project after initial approval | Assigned project, task-appropriate scope | Existing operation-specific access |
| Edit quotation | Permitted visible fields in an open review/edit window | Own project's open revision | Assigned project's open designer revision | No commercial edit by default | Only established explicit administrative operations |
| First Sales approval | No | Yes, current priced revision | No | No | No implicit impersonation |
| Client estimate/design approval | Yes, exact current review | Existing proof-backed on-behalf path only if already authorized | No implicit Client decision | No | Existing explicit override with proof/audit only |
| Unlock quotation | No | Yes, scoped, reason required | Yes, scoped, reason required | No | Explicit audited override only |
| Assign primary | No | No new authority | No | No | Yes |
| Choose secondary Designers | No | No | Yes, max three | No | Existing audited override |
| Respond to furniture request | Yes, own project | Existing representation rules only | Record assisted collection when requested | Only assigned permitted collection task | No implicit Client response |

Exact route-operation codes and synchronized API/OpenAPI schemas belong in the approved task plan and implementation contract. Backend enforcement remains authoritative for every route and file.

## Architecture, compatibility, and rollout

Recommended: introduce an explicit new workflow version for this changed sequence, extending the established services. Version-2 final approval requires completed design and cannot safely be reinterpreted as a pre-design quotation approval. The alternative is changing version-2 semantics in place, which risks treating existing approvals/payment bindings as evidence for a different process; that alternative is not recommended.

- Separate estimate revision/approval, design revision/approval, team assignment version, and furniture request version. Keep references explicit and validate the linked project/estimate/room across list, detail, mutation, audit, and handoff paths.
- New projects use the new workflow after rollout. Existing eligible open projects require a transactional enable/reconcile action with a dry-run explanation. Never manufacture a missing Sales signature, primary assignment, historical second approval, or Client furniture response.
- Existing approved/issued projects retain their workflow and historical artifacts until explicitly reconciled. Pending reviews cannot be silently migrated; supersede them with a reason and publish a new review through the normal workflow.
- Do not perform automatic writes during reads or bulk backfill. Any later write migration needs separate target authorization, backup/rollback, conflict reporting, idempotency, and a final dry run.
- Preserve both memory and Mongo behavior where repository contracts change. Existing direct-Mongoose commercial transactions stay transactional on a replica set.
- Additive schemas must be deployed with backend support before frontend controls. Verify the actual running route/policy capabilities during local QA; a source build alone does not prove that a long-running local server reloaded.
- Rollback cannot send new-version data through old lifecycle rules. Keep old/new version guards and historical readers; disable new transitions if necessary rather than rewriting approved records.

## Scope and non-goals

In scope: Client quotation editing/visibility, cross-session updates, two estimate approval phases, quote locking/reopening, Designer quotation revision, Client furniture/assistance workflow, primary/secondary assignments, later design-to-Procurement handoff, and required authorization/finance/email/lineage compatibility.

Out of scope: real assistance pricing/collection, new miscellaneous design task definitions, automatic reassignment of existing work, public unauthenticated quotation editing, free-text Client rates, bulk migration, changing unrelated design/site/finance policies, rewriting historical artifacts, and production actions.

No new library or infrastructure is assumed. Prefer existing dialogs, forms, pricing, Configuration, authorization, storage, mail retry, transaction, and review-round mechanisms.

## Acceptance criteria and verification

| ID | Acceptance evidence |
| --- | --- |
| AC1 | Sales can create, save, and publish the initial quotation before designer stages complete. New second quotation approval also succeeds before operational design while incomplete configuration still blocks invalid publication. |
| AC2 | A visible Main Line can be selected/removed and edited within approved Client fields; rates remain read-only. Hidden/unrelated lines cannot be read, discovered, or changed through direct API requests, quotation PDFs, or email attachments. Visible-only saves preserve hidden scope and exact total. Test saved-draft precedence, current visibility changes, missing configuration, and client-safe renditions without changing immutable originals. |
| AC3 | Client Save updates the authoritative working estimate and a separate already-open Estimator browser within the synchronization target. Unsaved Estimator input survives, and stale Save conflicts. Save never approves. |
| AC4 | First approval needs Sales and Client on the same priced revision; designer changes preserve the original baseline. Second approval locks that revision and starts actual design eligibility. Late approval of a superseded round fails. |
| AC5 | Quotation lock does not block actual design uploads/reviews. Authorized reasoned unlock creates a new revision and preserves history; unrelated staff, secondary Designers, and Client cannot unlock. New commitments wait for reapproval/reconciliation. |
| AC6 | Furniture request appears as a Client task. No furniture, self-measurement, assisted collection/TBD fee, return/resubmit, and acceptance branches work; unknown fees never become zero or ledger writes. Existing furniture need not be a quotation line. |
| AC7 | Super Admin assigns primary; primary chooses zero to three distinct eligible secondary Designers. A fourth, duplicate, deleted/inactive, unrelated, or forged assignment fails. Removal revokes current access without erasing historical work. |
| AC8 | Client design approval creates the Procurement handoff once with matching approved quotation/design references. No earlier quotation-only action triggers execution; payment/issuing safeguards remain. |
| AC9 | Replica-set race/rollback tests cover Client save versus approval, Client versus staff Save, simultaneous first-phase signatures, unlock versus approval/issue, design approval versus scope change, assistance changes versus submission, and concurrent secondary assignment at the three-person limit. |
| AC10 | Email disabled/failed/success/retry/concurrent cases preserve publication and immutable artifacts without duplicate semantic sends or sensitive output. Superseded links cannot approve old revisions. |
| AC11 | At least two unequal projects and asymmetric identities prove no cross-project leakage and reconcile approved financial totals across Client/internal/Procurement/portfolio views. Existing workflow-version fixtures remain readable and unchanged. |
| AC12 | Desktop/mobile rendered interaction, keyboard/focus, loading/error/empty/conflict/locked states, frontend/backend typechecks and builds, relevant contract tests, and final diff hygiene pass. Actual local backend capabilities are checked. No lint success is claimed without a lint script. |

Risk-based suites should extend existing `estimate-collaboration.replica-set`, `estimate-tiers.replica-set`, `estimation-lifecycle`, `project-workflow`, `design-workflow-state`, publication/decision, Client estimate/dimension, and Configuration visibility coverage. Exact task dependencies, ownership, migration dry-run design, and verification commands will be recorded in a separate task plan after specification approval.

## Principal risks and remaining decisions

The three clarification choices are resolved and incorporated above. The specification and task plan were approved, parallel execution was selected, and the user subsequently authorized autonomous development decisions. Implementation follows this scope; production deployment, live data changes, and customer communication remain separate external actions.

The main technical risks are circular design/estimate gates, lost concurrent edits, hidden-line leakage, approvals attached to the wrong price revision, unlocking against issued work, historical version reinterpretation, broadening secondary access through old assigned-designer checks, and treating a TBD fee as an actual charge. The requirements and tests above make those failures explicit.
