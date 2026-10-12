# Add UOM and Surface in Procurement basket proposals

Date: 2026-10-12
Status: Approved and implemented in Mode A. Feature-focused checks and builds pass; broader-suite findings are recorded in the task plan.

## Goal

Show working **Add UOM** and **Add Surface** actions in the Overview tab of Procurement's Configure Sub-Basket and Configure Main Basket workspaces. Procurement can propose missing values, select them for Main Lines, and include them in the existing Super Admin review and approval flow.

Preserve the user's earlier constraint: existing Configuration screens, behavior, records and Super Admin authority stay intact. Shared components may be reused. New shared values appear only after approval.

## Current behavior and evidence

- The latest screenshot shows selectable UOM and Surface catalogs without creation actions.
- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx` passes `canQuickAdd={false}` and a no-op UOM callback to `KnowledgeOverviewPanel`, and supplies no Surface creation callback. This disables both actions for every proposal.
- `KnowledgeOverviewPanel.tsx` already supports both callbacks. `KnowledgeModeSurfacePanel.tsx` already renders Add Surface when enabled. The current UOM action has the accessible name Add Unit; Procurement needs the explicit visible label Add UOM.
- Normal Configuration opens `KnowledgeMasterEditorDialog` or `KnowledgeSurfaceEditorDialog`. These dialogs call live Configuration APIs directly. Enabling them unchanged in Procurement would bypass the intended proposal boundary.
- Proposal reference reads currently list shared catalog values. `ProposalResourceKind`, the immutable resource model and `ProposalPublicationSnapshot` contain basket, sub-basket, main-line, section and quality resources, but no proposed UOMs or surfaces.
- Saved proposal validation and publication currently resolve UOM and Surface IDs against live Configuration. Supporting new values therefore requires backend persistence and validation as well as visible buttons.
- The earlier basket proposal specification intentionally excluded shared-master creation. This specification extends the proposal workflow for **UOMs and surfaces only**, while retaining approval before shared publication.
- The worktree contains substantial earlier changes. Only this specification is being created at this gate; implementation must capture and preserve the then-current dirty baseline before assigning ownership.

## Approach and scope

Extend the existing immutable proposal resources and transactional publication path to carry proposed UOMs and surfaces. Reuse established field validation and form styling through an explicit proposal save path. Do not grant Procurement direct access to generic Configuration mutation endpoints.

The existing approval workflow establishes the approach: values remain private to the proposal while drafted or reviewed, and are published with the approved basket. A separate master-request inbox or immediate global creation would introduce a different workflow and is outside this change.

Included:

- Add, edit and remove proposed UOMs and surfaces within an editable proposal, with reference protection for removal.
- Immediate selection of a newly added value on the current Main Line, preserving other unsaved field changes.
- Persistence, reload, submitted and approved snapshots, Super Admin review edits, rejection and revised-copy support.
- Both new Main Basket and existing-parent Sub-Basket proposals.
- Existing request submission notification, sent once through the current Super Admin notification path.

Excluded:

- Creation of taxes, modes, priorities, quality reusable values or other shared catalogs.
- Editing or deleting existing shared UOMs or surfaces from Procurement.
- New navigation tabs, a Configuration redesign, changes to inherited parent quality or existing Main Basket metadata.
- Database sync, seeds, backfills, configured-database writes during development, production changes, deployment, staging, commits or dependency additions.

## User experience

1. Show a visible **Add UOM** action alongside the UOM selector and **Add Surface** alongside the Surfaces heading/control. Use current Procurement spacing, tokens and buttons, with no new icon dependency or decorative changes. Keep actions usable within the current 70% desktop panel and full-width mobile layout.
2. Show actions only when the current proposal and selected Main Line are editable. Disable while required references are unavailable or a conflicting save is in progress. Submitted, approved and rejected snapshots are read-only for Procurement.
3. Add UOM opens a focused form with Name, Quantity decimal places (0–3), and optional Description. Add Surface requests Name and optional Description. Reuse existing normalization and automatic code generation semantics; do not expose lifecycle, display-order or internal-ID controls.
4. Explain concisely that the value is added to this proposal and becomes shared after Super Admin approval. Save the proposed value, select it on the originating Main Line, and retain the normal explicit Save configuration behavior for that line's section changes. Closing an unsaved form uses the existing discard guard.
5. Distinguish proposed values from shared values in the proposal UI without labeling them globally active. Provide edit/remove access to proposed values; shared values remain selection-only. Block removal while any section still references the value, identifying the affected Main Line.
6. Preserve entered fields and existing section drafts on validation, duplicate, network or version-conflict errors. Restore keyboard focus to the originating action after closing. Do not apply a delayed result to a different line, proposal, snapshot or signed-in actor.
7. Super Admin can inspect and edit proposed values in the existing request review workspace, see their changes compared with the submitted snapshot, and approve the proposal through the existing action. Existing direct Configuration management remains unchanged.

## Data and API requirements

- Add explicit UOM and Surface resource kinds to the existing immutable proposal resource and manifest contracts. Use stable server-generated IDs, normalized payloads and the established resource/head digests and bounds. Include these resources in snapshots and revised-copy remapping; older proposals with none continue to resolve unchanged.
- Add proposal-scoped list/create/update/remove operations under the established Procurement and admin proposal routes, with runtime validation, canonical authorization registration, OpenAPI and aligned frontend types. Reject unsupported kinds and client-controlled ownership or publication fields.
- Writes require the existing expected proposal version and, for admin review, expected request version. Reuse transactional actor revalidation, audit and concurrency checks. Retry/double submission must not create duplicate resources; use the established CAS semantics and stable command identity where required.
- Scope reads and caches to actor, role, proposal, snapshot and saved head. Global catalog queries may remain shared within their existing actor scope; private proposed values must never enter a global catalog cache.
- Merge only the selected proposal snapshot's proposed values with permissible live references. A proposal cannot reference another proposal's unpublished resource. Resolve IDs by kind; never join or silently substitute values by label.
- Saving and readiness must validate draft-local references without inserting temporary values into shared collections. Preserve all existing type, range, completeness, UOM precision, pricing, relationship and activation validations.
- Reuse the catalog's uniqueness rules for normalized names and codes, including its treatment of inactive and archived records. Detect conflicts within the proposal and against the current shared catalog. Report conflicts explicitly; never overwrite or silently merge an existing shared value.
- If a shared value is created after the proposal draft, block approval with a useful conflict. The reviewer may rename the proposed value or explicitly select the existing shared value in affected sections and remove the unused proposal value. Preserve the submitted snapshot.
- On approval, publish the remaining proposed values as normal active shared UOMs/surfaces inside the **same transaction** as basket publication, activation, audit and request decision. Preserve stable identity or an explicit complete ID mapping across every supported section reference and returned publication result.
- Revalidate shared dependencies and uniqueness in the approval transaction. A collision, activation failure, audit failure or stale request must roll back all newly published values and basket writes. Approval replay must return the original decision without duplicates.
- Draft creation/editing, submission and rejection create no shared master records. Proposal submission retains the existing exactly-once Super Admin request notification; individual Add actions do not send separate notifications.
- Invalidate affected proposal lists, catalogs, readiness and review-change queries after proposal mutations. After approval refresh shared UOM/Surface catalogs and affected basket/vendor option queries through established invalidation mechanisms.

## Permission and state boundaries

| Actor/state | Proposed UOM/Surface behavior | Existing shared masters |
| --- | --- | --- |
| Procurement, own editable draft | Read, add, edit, remove with reference checks | Read/select only |
| Procurement, submitted or terminal proposal | Read allowed snapshots; revise rejected proposal through existing action | Read/select only in a new editable draft |
| Super Admin, pending review | Read, add/edit/remove proposal values and approve/reject through existing review authority | Existing Configuration authority remains unchanged |
| Another Procurement identity or unauthorized role | No access to private proposal values | Existing permissions unchanged |

Submitted and approved resource history remains immutable. Super Admin review changes affect the review head, and revised copies receive correctly remapped private identities. Existing-parent Sub-Basket proposals do not edit the live parent's metadata or quality.

## Compatibility, risks and rollback

- This is an additive proposal capability. Existing resource digests and snapshots must not change merely because the server knows new kinds. Default absent collections of proposed values to empty only at compatible read boundaries.
- Reuse existing resource indexes where possible; no configured-database migration or index operation is authorized by this specification. If a mandatory storage migration is discovered, reconcile it with a separate reviewed operation before execution.
- Highest risks are leaking private values through the shared reference cache, bypassing approval with existing dialogs, losing unsaved Overview fields when a resource increments the proposal version, incomplete ID remapping during revision/publication, and partial writes on concurrent approval or duplicate names.
- Regression coverage must include these boundaries and normal Super Admin Configuration creation. Deployment rollback must retain support for stored new resource kinds once used; never delete proposal or shared data to roll back UI visibility.
- Record proposal audit events and stable resource IDs using existing conventions. Do not log full payloads, tokens or personal information.

## Acceptance criteria and verification

- **AC1:** Editable Procurement Main Basket and Sub-Basket proposals show working Add UOM and Add Surface actions; read-only and denied states do not expose mutation.
- **AC2:** A new value can be created, selected, saved, reloaded, edited and safely removed within its proposal. Other Overview fields and unsaved changes survive quick-add success/failure; delayed results cannot affect another line or actor.
- **AC3:** Submitted and approved snapshots retain the correct proposed values; Super Admin can review/edit them, and revised rejected copies remap all local references correctly.
- **AC4:** All shared Configuration documents are unchanged before approval. Approval atomically creates the intended active shared values and valid basket references; rejection or any failure creates none. Approval replay creates no duplicates.
- **AC5:** Tests with two Procurement users, different proposals and colliding names prove isolation, backend authorization, version conflicts, cross-proposal reference rejection and duplicate/concurrent approval behavior.
- **AC6:** Existing Configuration screens, create/edit behavior, catalog validation, saved data and Super Admin permissions remain unchanged. Existing Sub-Basket inherited-quality restrictions and normal basket approval remain covered.
- **AC7:** Request submission still creates the established Super Admin notification exactly once. No separate notification is sent for draft quick-add.
- **AC8:** Frontend rendered interactions verify keyboard focus, accessible names, cancellation, busy/error/empty states and mobile/desktop layouts. Backend replica-set tests verify transactions, rollback and both target kinds. Relevant contract tests, typechecks, builds and `git diff --check` pass; there is no repository lint script.

## Assumptions and open decisions

The requested Add actions mean creating values that are missing from the selectors. Based on the established request-and-approval workflow, new values become shared only when Super Admin approves the basket proposal. Apply the capability consistently to both Procurement proposal targets, while leaving existing shared values under their current Configuration authority. No additional product decision is required before specification review.
