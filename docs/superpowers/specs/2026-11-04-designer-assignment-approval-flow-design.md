# Conditional Client reapproval and compact Designer team selection

Date: 2026-11-04  
Revised: 2026-11-05  
Status: Revision approved on 2026-11-05. The previously approved conditional-reapproval workflow remains authoritative; this revision adds the verified timestamp-compatibility correction and the secondary-Designer multi-select UX.

## Goal and confirmed workflow

The workflow must be:

1. Sales prepares and submits the initial estimate.
2. The Client approves that initial estimate.
3. Super Admin assigns the primary Designer.
4. The assigned Designer can open the same saved estimation and may continue the operational design workflow immediately while the approved quotation remains unchanged.
5. If the Designer materially changes the saved quotation, operational design work pauses and the revised quotation must be submitted to the Client.
6. The Client can approve the exact revised quotation or request changes.
7. Approval of that revision resumes the preserved design workflow. Client design review, payment, procurement, execution and finance then continue under their established gates.

Designer assignment alone must never create a new approval requirement. Viewing the estimation or performing a no-op save must not create one either.

Super Admin must also be able to maintain up to three secondary Designers through one compact, searchable multi-select dropdown. The primary Designer remains visible and read-only in this control.

## Current behavior and root cause

The reported project now permits Designer assignment, but its Designer workspace still blocks work with **The current quotation approval could not be verified** even though the initial Client approval is valid and no Designer quotation change was made. Its secondary-team control also expands into a large page-height search-and-checkbox panel instead of a compact multi-select.

The broad workflow correction described below has already been implemented, but a read-only diagnostic of local demo project `Lisno000001` found a compatibility defect in the approval resolver:

- the immutable pre-approval round and lifecycle reference point to the same approval instant, including non-zero milliseconds;
- Mongo returns the round timestamp as a JavaScript `Date`, while the lifecycle reference is an ISO string;
- the resolver converts both with `Date.parse(String(value))`; `String(Date)` omits milliseconds, so equal instants compare unequal;
- every other exact lineage, actor, revision, digest, scope and approval predicate for the reported project passes;
- the resolver therefore returns `source_issue` solely because of representation loss.

This is an implementation error, not missing Client approval or corrupt project data. Temporal equality must normalize supported `Date` and ISO representations to exact epoch milliseconds without discarding precision. The comparison remains exact and fail-closed for invalid or genuinely different timestamps. No record rewrite, new Client decision, backfill or migration is required.

The underlying workflow defect that this specification corrects was established by earlier code tracing:

- `guardCollaborativeDesign()` permits assignment using `preApproval`, then requires `editClosedAt`, `finalApproval` and `client_approved` for every operational design action.
- `ensureQuotationDesignTask()` creates the Designer task only after a post-phase `finalApproval`.
- the Designer task DTO reports `quotationApproved: false` until that same post approval exists;
- design-workflow hydration, design upload/review, Client design review, payment, handoff and several status consumers also equate current quotation approval with the existence of `finalApproval`;
- frontend copy and tests therefore encode a mandatory second approval even when the initial approved quotation is still the current saved quotation.

The repository already has the correct basis for conditional reapproval:

- every persisted quotation-content change increments `estimation.pricedRevision`;
- physical-scope changes also increment `designScopeRevision`;
- assignment changes only assignment/design-lifecycle fields;
- the quotation operation service returns without incrementing revisions for a no-op save;
- immutable Client review rounds retain `pricedRevision`, `sourceDigest`, `designScopeRevision`, requirements lineage, version, decision actor and timestamps;
- quotation and workflow writers already use project and transaction fences for race protection.

## Scope

This revision changes workflow-v3 approval resolution and every workflow-v3 consumer that currently assumes a post-assignment approval is mandatory. It includes:

- Designer task availability and operational workflow gates;
- quotation edit/publish behavior;
- Designer design upload and Client design-plan review;
- Admin, Designer, Client and Finance status/copy that presents the approval state;
- current approved-source binding for design review, payment, handoff, execution and finance;
- existing assigned projects whose initial approval is valid and whose quotation has not changed;
- exact timestamp compatibility between persisted Mongo `Date` values and ISO lifecycle references;
- a compact, searchable secondary-Designer multi-select that preserves the existing maximum of three selections and CAS-protected assignment API;
- focused backend, Mongo, frontend and rendered interaction regressions.

It does not redesign the estimation builder, change Sales' initial submission checklist, change role permissions, increase the three-secondary-Designer limit, change the assignment API contract, change configuration visibility, relax later design approval/payment/procurement gates, migrate production data or assign a real Designer.

## Recommended architecture

Add one backend-authoritative resolver for the **effective current quotation approval**. All workflow-v3 consumers must use this resolver instead of testing `finalApproval` directly or reconstructing approval state in the frontend.

The resolver returns exactly one of these validated sources:

1. **Revised approval**: the current immutable post-phase approval when `finalApproval`, the approved post review round and the current quotation revision all match.
2. **Initial approval still current**: the immutable pre-phase approval when no persisted quotation revision has superseded it.
3. **No current approval**: a material revision exists, a revised review is pending/returned, or approval evidence is missing, stale, foreign, corrupt or ambiguous.

Do not manufacture a `finalApproval` that points at the pre-phase round. The pre and post review rounds have different immutable meanings. Consumers must bind to the resolved source, which may legitimately be either round.

Alternatives rejected:

- Always require the Designer to resubmit the unchanged quotation. This is the current incorrect behavior and contradicts the confirmed workflow.
- Copy `preApproval` into `finalApproval` during assignment. This would falsify approval history and break phase/source lineage.
- Let the frontend compare displayed items and decide whether approval is required. This is incomplete, race-prone and not an authorization boundary.

## Effective approval contract

For workflow v3, the initial approval remains current only when all of the following are true:

- the project, estimate and immutable pre review round have exact lineage;
- the round is an approved Client decision in phase `pre` with the recorded decision time and estimate version;
- current requirements match the approved round;
- current `pricedRevision` equals the pre round's `pricedRevision`;
- current `designScopeRevision` equals the pre round's `designScopeRevision`;
- the canonical digest of the current quotation content equals the round's `sourceDigest`;
- there is no pending or superseding post review and the lifecycle is in its normal post-approval working state.

Recorded times may arrive as JavaScript `Date` objects or valid ISO strings. Exact-time checks must convert each supported value directly to epoch milliseconds (`Date#getTime()` for a `Date`, ISO parsing for a string), require a finite result, and compare those integers. Converting a `Date` through its display string is forbidden because it loses milliseconds. Invalid, missing or unequal values still fail closed.

A validated current post approval supersedes the initial source and uses equivalent exact round, revision, digest, requirements and scope checks.

Material quotation content includes property/bedroom setup, rooms, scopes, selected Main Baskets and classifications, included or removed lines, quantities, dimensions, modes/tiers, configured component selections, specifications, rates, amounts, subtotal, GST and total. The existing quotation-content and physical-scope change detectors remain authoritative.

Assignment, team changes, workflow metadata, opening the estimation, refreshing it, and a no-op save are not quotation changes.

Once a material change has been persisted, a later save that restores identical visible values remains a new audited `pricedRevision` and still requires Client approval. This avoids silently reusing an approval for a different revision history.

## State transitions

| State | Effective approval | Designer workflow | Required next action |
| --- | --- | --- | --- |
| Initial estimate not approved | None | No assignment/design access from this flow | Complete initial Client review |
| Initial approved, no Designer | Initial approval | Await assignment | Super Admin assigns primary Designer |
| Designer assigned, quotation unchanged | Initial approval | Available immediately | Continue design; quotation review/edit remains optional |
| Designer opens or no-op saves | Initial approval | Remains available | Continue design |
| Designer saves any material quotation change | None | Pause new operational actions; preserve history | Submit revised quotation to Client |
| Revised quotation awaiting Client | None | Remains paused | Client approves or requests changes |
| Client requests quotation changes | None | Remains paused | Primary Designer revises and resubmits |
| Client approves exact revised quotation | Revised approval | Resume preserved workflow | Continue from the first incomplete design stage |
| Approval source is inconsistent | None, source issue | Fail closed | Reconcile source; do not infer approval |

If a quotation is changed after some design stages are complete, completed stage records, evidence, deadlines and audit history remain intact. New actions and design submission are blocked until the exact revised quotation is approved. Reapproval resumes the existing workflow without duplicating tasks or resetting completed work.

## Task and deadline behavior

- For an unchanged quotation, assignment makes the Designer's workflow actionable immediately and creates or reconciles the deterministic design task.
- The first design-workflow start anchor is the later of the effective approval time and the primary Designer assignment time. A Designer must not inherit overdue time from a period before assignment.
- That start anchor is persisted once and is not reset by refresh, retry, reassignment, quotation revision or reapproval.
- A quotation edit pauses availability but does not delete the task, erase elapsed history or create a second task. Existing pause/deadline rules remain authoritative where already defined.
- Existing assigned projects with valid unchanged initial approval must become usable from derived evidence without a bulk migration. Any missing deterministic task is reconciled idempotently on the next authorized workflow write, not by mutating data during a read.

## API and data contract

Expose a backend-derived current quotation state to affected APIs. The exact internal naming may follow established contracts, but consumers need these semantics:

- `currentQuotationApproved`: whether the saved quotation is covered by a validated Client approval;
- `quotationApprovalSource`: `initial_unchanged`, `designer_revision`, or `null`;
- `requiresClientReapproval`: whether a material saved revision now needs Client approval;
- `quotationApprovalState`: one of `initial_current`, `revision_draft`, `revision_pending_client`, `revision_changes_requested`, `revision_current`, or `source_issue`;
- `currentQuotationApproval`: the safe current approval reference, including kind, review-round ID, approved estimate version and approval time, or `null`.

The existing `quotationApproved` Designer-task field may remain as a compatibility alias, but its meaning becomes **the current saved quotation is covered by a validated Client approval**, not **a post-phase finalApproval exists**.

Keep `preApproval` and `finalApproval` immutable and distinct. Keep existing IDs, CAS/version checks, digests, actor proof, idempotency, audit and transaction fences. Memory and Mongo repositories must resolve the same source.

Admin fields that specifically mean a post revision was approved must retain that meaning. Add/use the current-state fields above so an unchanged initial approval is presented as current rather than as unavailable or as a fabricated final approval.

No schema backfill is required because the immutable review round already stores the necessary v3 revision evidence. If implementation needs an additive persisted start anchor or contract field, it must be backward-compatible and derived safely for existing records.

The secondary-Designer assignment contract remains unchanged: the existing eligible-Designer query supplies stable IDs and labels, and the existing team mutation accepts zero to three secondary Designer IDs with its current expected-version/CAS and reason rules. The dropdown is a frontend interaction change, not a new persistence model.

## Permission and mutation rules

- Super Admin remains the only workflow-v3 primary-Designer assignment authority.
- Only the assigned primary Designer may edit and publish the post-assignment quotation. Secondary Designers may retain established read/team access but cannot create the commercial revision.
- Initial approval does not grant unrelated Designers access.
- Any backend design action, upload, review publication, Client decision, payment or execution mutation rechecks the effective approval inside its transaction. UI state is advisory only.
- A concurrent quotation edit and design action must serialize. The design action may proceed only if its approval source is still current at the mutation fence.
- Publishing a post-phase quotation is allowed only after a material saved revision. Attempting to publish an unchanged initially approved quotation returns a stable conflict such as `QUOTATION_UNCHANGED`; it must not create or deliver a redundant Client review round.
- Missing or ambiguous source evidence fails closed without exposing private review or project data.

## Downstream source binding

Every workflow-v3 consumer that currently dereferences `finalApproval` as the only valid source must use the effective approval resolver where the business meaning is **current approved quotation**. This includes:

- Designer task creation and task DTOs;
- design lifecycle guards, workflow hydration and stage actions;
- design upload/submission and the design-plan review round's `estimateReviewRoundId`;
- Client access to the submitted design plan;
- design approval and quotation/design handoff;
- project status and manager assignment sources;
- initial-payment readiness and receipt lineage;
- finance baseline/current approved source;
- procurement/execution activation that depends on the current approved quotation.

When unchanged, the design round binds to the initial approval round. When revised, it binds to the exact approved post round. Later payment and execution still require the existing approved design and all other established gates; this change does not permit payment, work-order issuance, procurement or execution merely because the initial quotation is current.

The initial approved finance baseline remains authoritative while unchanged. A later revised approval updates/synchronizes the approved baseline through the existing transactional path.

## UX behavior

### Designer

- For an unchanged assigned quotation, show **Initial estimate approved. No quotation changes require Client review.**
- Offer **Review or update estimate** as an optional link, then derive the primary next action from the operational design workflow.
- Enable Internal Kick off and later stages when their existing prerequisites are satisfied.
- After a material save, show **Client approval required for the revised quotation** and make submission of that revision the primary next action.
- Distinguish revised draft, awaiting Client review, Client changes requested and revised approved states.
- Secondary Designers see the current status but do not receive the primary quotation-edit/publish action.

### Super Admin design team

- Replace the page-height expanded checkbox panel with one compact multi-select dropdown labelled **Secondary Designers**.
- The closed control shows a concise placeholder when empty and selected Designer names as removable values when populated; it also shows the current count out of three without creating a separate large panel.
- Opening the dropdown reveals a bounded, searchable option list with a checkbox for each eligible Designer. It must not grow the page to the full eligible-user count; the option list scrolls within a constrained height.
- The primary Designer is displayed above or beside the control but cannot be selected as a secondary Designer. Already selected and ineligible identities are handled by stable ID, not display name.
- Selection is limited to three. Reaching the limit disables additional unselected options while allowing removal. Empty, loading, search-no-match, stale-version, permission and API-error states remain explicit.
- Existing selections are preserved until the user applies the change. Provide compact **Save team** and **Cancel** actions only while there are unsaved changes. Show the established reassignment reason input only when the backend requires it.
- Support keyboard focus, search, option navigation, selection/removal, Escape-to-close, outside-click close, accessible names/status announcements and responsive use without relying on hover.

### Client

- Do not show a second quotation decision when the Designer made no material change.
- If a revision is submitted, show the exact revised quotation with the existing approve/request-changes controls.
- Permit Client design-plan review when the design is bound to either the unchanged current initial approval or an approved current revision. Do not require a post-phase quotation round solely to reveal the design review.

### Super Admin, Sales and Finance

- Present **Initial estimate: Client approved** separately from any later Designer revision.
- When unchanged, show **Designer quotation: No changes; initial approval is current** rather than Draft, unavailable or Awaiting approval.
- Show a pending revised-approval stage only after a material revision exists.
- Update workflow instructions, acknowledgement text, next actions and payment explanations so they say **current approved quotation**, with conditional revised-approval wording where applicable.

Preserve established compact layouts, accessible names, focus/keyboard behavior, loading/error/stale states and responsive behavior. This is a workflow correction, not a visual redesign.

## Compatibility and failure handling

- Workflow v2 and legacy estimation behavior remain unchanged.
- Existing valid final approvals remain current when their exact source still matches.
- Existing assigned workflow-v3 projects with unchanged quotations use their validated initial round immediately after the code is deployed/restarted.
- Existing approvals whose exact timestamps are represented once as a Mongo `Date` and once as an ISO string resolve identically, including timestamps with non-zero milliseconds.
- A genuinely revised pending or changes-requested round remains blocking.
- A redundant historical post round with no material revision must never be treated as proof that a new approval was required. Keep immutable history; fail closed or mark it non-actionable through an idempotent, audited reconciliation rather than deleting it.
- Refresh affected estimate, Client review, Designer task/workflow, Admin, Finance and Procurement queries after any quotation or approval mutation.
- Publication and external delivery remain separate and retryable. Verification sends no real email.

## Invariants and operational boundaries

- Preserve immutable approval/design history, actor identity, Client-on-behalf proof, exact version and review-round binding, source digests, audit events, deduplication and idempotency.
- Preserve Configuration source-of-truth and client-visibility rules. Do not manufacture prices or approval values in the frontend.
- Preserve one approved commercial source for downstream calculations. Use integer paise and the existing approved snapshot; do not recompute finance from editable display values.
- Preserve all later design, payment, procurement and execution conditions.
- Do not start the backend, launcher or OCR worker. The user runs the backend manually.
- Do not mutate the reported project, run a seed/backfill/migration, send mail, deploy, commit or push.
- Preserve unrelated dirty work. Rollback is limited to this task's source changes; no data rollback is expected.

## Acceptance criteria

- **AC1 Unchanged assignment:** Given a valid initial Client approval and no later quotation-content revision, assigning the primary Designer makes Internal Kick off and the established design workflow available immediately. No second quotation review is created or requested.
- **AC2 Optional estimation review:** The primary Designer can open the saved estimation. Viewing, refresh and no-op save preserve `initial_current` and do not block design.
- **AC3 Material change:** Changing an item, inclusion, quantity, dimensions, room/basket/scope, tier/component selection, specification, rate or total advances the audited revision, changes state to `revision_draft`, and blocks new operational design actions until Client approval.
- **AC4 Exact revised review:** Only the assigned primary Designer can publish the changed revision. The Client decision is bound to the exact current revision/digest/scope. Request changes stays blocked; exact approval changes state to `revision_current` and resumes the workflow.
- **AC5 History and races:** Completed stages, evidence and the original design-start/deadline anchor survive pause/reapproval. Repeated actions create no duplicate tasks. Concurrent estimate/workflow writes either use the same approved revision or fail with a refreshable conflict.
- **AC6 Design review:** Designer uploads and Client design-plan review work when bound to either the unchanged initial approval or the approved revised source. They fail closed for a stale/missing source.
- **AC7 Downstream lineage:** Design approval, initial payment, finance, handoff, procurement and execution bind to the same effective quotation round and retain every later existing gate. Two unequal projects reconcile to their own approved snapshots.
- **AC8 Presentation:** Designer, Client, Admin and Finance screens distinguish unchanged initial approval from a revision that needs approval. No screen says a Designer-revised quotation is awaiting approval until a material revision exists.
- **AC9 Compatibility:** Workflow v2, legacy projects, existing revised approvals, role isolation and unrelated current-status dashboards remain compatible.
- **AC10 Existing project:** The reported assigned project becomes operational after a manual backend restart if its immutable initial round is valid and its quotation revision is unchanged, without a data migration or another Client approval.
- **AC11 Timestamp compatibility:** A valid approval round whose Mongo timestamp is a `Date` and whose lifecycle reference is the same ISO instant with non-zero milliseconds resolves to `initial_current` (or the equivalent current revised source). Invalid or different timestamps still resolve to `source_issue`.
- **AC12 Secondary-Designer multi-select:** Super Admin can search, select, remove and save zero to three eligible secondary Designers from one compact multi-select dropdown. Primary/ineligible Designers cannot be added, the existing CAS/reason behavior is preserved, and keyboard, loading, empty, error and responsive states work without the current full-width expanded panel.

## Verification

Focused backend coverage must include the approval resolver, quotation mutation/no-op behavior, assignment/task creation, design lifecycle gates, design review, payment/handoff, finance and project-status consumers. Mongo replica-set cases must cover:

- unchanged assignment;
- no-op save;
- price-only and physical-scope edits;
- edit then restore identical values;
- pending review, requested changes and exact revised approval;
- stale/foreign/missing round evidence;
- assignment/edit and workflow/edit races;
- initial-versus-revised approval binding through design approval and payment/execution.

Focused frontend coverage must split unchanged, changed draft, pending review, changes requested, revised approved and source-error states across the Designer workspace, estimate workspace, Client quotation/design review, Admin and Finance consumers. Include primary/secondary permissions, query refresh, keyboard/accessibility and rendered desktop/mobile checks.

Add a backend regression in which the immutable round carries a real JavaScript `Date` with non-zero milliseconds while lifecycle evidence carries the equivalent ISO string. Add focused component and rendered interaction coverage for opening, searching, keyboard selection, max-three enforcement, removal, cancel, CAS-protected save, stale/error recovery and compact desktop/mobile dropdown layout.

Then run backend/frontend typechecks, affected builds, proportionate full suites, `git diff --check` and `git status --short`. Exact commands and ownership belong in the revised task plan after this specification is approved.

## Risks and resolved decisions

The principal risk is treating historical initial approval as current after a real edit. Exact revision, digest, requirements and scope matching plus transactional fences prevent that. Normalizing timestamp representations must preserve exact milliseconds and must not weaken any other approval predicate. The inverse risk is continuing to require a needless second approval; all affected consumers must use one resolver so the rule cannot diverge by screen.

The user-confirmed decision is final: initial approval authorizes design work while the quotation is unchanged; only a material saved revision requires another Client quotation approval. A persisted edit followed by a later revert still requires approval because it is a distinct audited revision. Secondary Designer selection uses a compact multi-select and keeps the established maximum of three.
