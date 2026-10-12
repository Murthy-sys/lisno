# Procurement basket proposal refinements and notifications

Date: 2026-10-12
Status: Approved and implemented in Mode A. Feature verification is complete; the task plan records full-suite baseline failures and the unperformed database index rollout.

## Goal

Refine the Procurement basket configuration panel to match existing Super Admin Configuration presentation, simplify the requested fields and tabs, notify Super Admin of every new basket submission, and support proposing a new Sub-Basket under an existing selected Main Basket.

This extends the completed local workflow described in `2026-10-11-procurement-basket-configuration-approval-design.md`. The current code and this follow-up request govern the changes below; the earlier notification limitation is superseded.

## User requirements and preservation boundary

- Remove Display order from the proposal Add/Edit Sub-Basket dialog.
- Remove Description and Display order from the proposal Add/Edit Main Line dialog.
- Replace the Basket quality tab label with Quality Parameter and remove the Saved summary tab from the proposal workspace.
- Match Configuration's existing typography, controls, spacing, tables, tabs and editor presentation in the Procurement panel.
- Use 70% of viewport width for desktop proposal panels, adapting to full width on smaller screens.
- Notify Super Admin whenever a basket request is submitted, including a revised request submitted after rejection.
- Let Procurement configure a new Sub-Basket under an existing selected Main Basket through the same review and approval process.
- Preserve ordinary Super Admin Configuration screens, behavior and existing data. Reuse shared code with unchanged defaults. New approved records may appear through the existing Configuration lists, as requested.
- Preserve local database data and the previous pause on production-to-local synchronization. This task does not authorize database synchronization, seeding, deployment or production writes.

## Current behavior and evidence

1. `frontend/src/features/vendor-basket-proposals/ProposalMetadataDialog.tsx` always renders Display order. `ProposalWorkspace.tsx` passes `showDescription` for Main Lines as well as Main Baskets. Simply hiding Description currently sends null, which could erase an existing value.
2. `ProposalWorkspace.tsx` explicitly defines Basket quality and Saved summary tabs. It already reuses `KnowledgeBasketQualityPanel`, the same shared editor used by Configuration. Quality is stored for the Main Basket and shared across its Main Lines.
3. The proposal entry points import `proposal.css`, while `KnowledgeItemWorkspacePage.tsx` imports the broader Configuration style bundles. Many Configuration selectors require `.knowledge-page` and app-shell ancestry; proposal drawers render through the overlay system. Shared JSX alone does not establish equivalent styling. The supplied screenshot shows collapsed spacing in quality stages and table headings. Cold-entry rendered checks must confirm both stylesheet loading and selector scope.
4. `proposal.css` sets workspace width to `min(1180px, calc(100vw - 36px))`. The initial `CreateProposalPanel` lacks the same proposal class. The two stages therefore do not share one width policy.
5. `vendor-basket-proposal.service.ts::submit` transactionally creates a pending request, freezes the submission, creates its review copy and records an audit event. It creates no notification. Legacy `vendor-basket-request.service.ts::create` likewise creates no notification.
6. The existing notification bell supports project chat and Execution notifications. Those backend stores and access checks require project context, so basket requests must not be forced into chat membership or represented by a fabricated project.
7. `useVendorBasketRequestCount.ts` and `KnowledgeBasketRequestReview.tsx` refresh the existing approval queue every 30 seconds. A queue count is currently the only submission indication.
8. Proposal creation always allocates a new Main Basket ID, and publication always creates that Main Basket. There is no existing-parent proposal type. `VendorBasketFields.tsx` exposes direct Sub-Basket creation only behind its Configuration-create capability; Procurement's new action must use the proposal flow without granting that capability.
   - Rendered verification later confirmed built-in Procurement already has the existing inline classification capability as well as proposal creation. The Add Sub Basket entry point therefore prioritizes proposal creation whenever that capability is present, while direct-create-only users retain the existing form. No permission grant or removal is needed.
9. Pending request unique indexes currently use vendor identity plus proposed Main Basket name. Sub-Basket requests additionally need parent Main Basket identity in duplicate detection, without weakening existing Main Basket uniqueness.
10. The worktree already contains the previous implementation and unrelated changes. Preserve them; capture target-specific baseline diffs before future writers begin.

## Scope and defaults

### Proposal forms and workspace

- Sub-Basket and Main Line metadata dialogs show the required Name field and existing save/cancel/error states.
- Hidden existing descriptions and order values survive name edits. New nodes receive a deterministic default order in the draft and safe ordering at publication without exposing an order input.
- The Main Basket's own metadata fields are unchanged unless their layout needs the same scoped presentation fixes.
- Retain Overview, Mode, Recommendations and Quality Parameter tabs. Remove only the proposal Saved summary entry and rendering; leave the normal Configuration saved summary unchanged.
- Quality Parameter uses the existing quality editor and its supported import, parameter editing, stage filters and save behavior. Renaming the tab does not turn shared basket quality into per-line data.
- Apply proposal-specific changes consistently to Procurement authoring and the corresponding Super Admin proposal-review panel. Ordinary Configuration remains the visual reference and retains existing behavior.
- Both the initial proposal form and the full workspace use 70vw at desktop widths of 1200px and above. Below that use the available viewport width, with responsive content and reachable actions. Do not apply this sizing to all drawers or the vendor form itself.
- Reuse existing style assets/tokens where safe. Resolve portal styling explicitly with proposal-scoped classes; do not impersonate a Super Admin role or globally broaden role selectors.
- Preserve focus trapping, focus return, keyboard tab navigation, unsaved-change protection, save/retry states and read-only submissions. Keep nested dialogs padded and within the viewport.

### Sub-Basket under an existing Main Basket

1. In the Procurement vendor side panel, expose Add Sub-Basket for an active selected Main Basket. If several Main Baskets are selected, require an explicit target choice; if only one is selected, use it automatically. The selected target is shown by name and held by stable ID.
2. This action creates an isolated Sub-Basket proposal. It does not call shared Configuration create/update endpoints and does not immediately insert or select a live Sub-Basket.
3. A request targets one existing Main Basket and one new Sub-Basket. Procurement can configure new Main Lines, UOM, rates, modes and recommendations inside that Sub-Basket using the shared editors. Main Lines are optional for a Sub-Basket-only request; any included Main Line must pass the existing configuration/activation checks before approval.
4. The existing parent is context, not an editable proposal resource. Its name, description, status, existing children and shared quality checklist cannot be overwritten through this request, including by the review copy. Show inherited Quality Parameters read-only with an explanation that they belong to the existing Main Basket. Normal Configuration remains the place to maintain those shared parameters.
5. Save, submit, read-only submitted snapshot, separate Super Admin review edits, reject, revise and approve follow the existing proposal lifecycle. Target identity is immutable through a submission/revision lineage; choosing a different parent requires a new draft.
6. Super Admin sees request type, target Main Basket, proposed Sub-Basket, requester, vendor context and submission time. Review allows editing the proposed Sub-Basket and its new Main Lines, with the usual original-submission comparison.
7. Approval adds only the new Sub-Basket and included new Main Lines under the target parent, atomically with the decision and audit records. It creates no duplicate Main Basket and updates no existing child configuration. Included Main Lines become active through existing activation validation; a Sub-Basket-only approval has no synthetic Main Line.
8. The target must still exist and be eligible at submission and approval. Missing/inactive parents, conflicting child identities, invalid references and concurrent changes return explicit recoverable conflicts. Revalidate current parent context during review/approval and coordinate concurrent hierarchy writes inside the transaction.
9. Approved records appear through normal Configuration and Procurement catalog queries. Refresh affected parent, child and request queries. Preserve the unsaved vendor form and require explicit selection of the approved Sub-Basket.

### Super Admin submission notifications

- Interpret “any request” in this task as every Main Basket or Sub-Basket submission in this Procurement workflow, including still-supported legacy Main Basket requests. Other application approval workflows are outside this change.
- Use the existing in-app notification bell/inbox. Add a basket-request source with its own typed records and access checks, following the existing pattern for multiple notification sources. Email, SMS and browser push are not part of this scope.
- Resolve the sole active Super Admin through canonical identity rules, never a hardcoded ID or display name. An invalid recipient configuration returns an explicit failure without creating a partially submitted request.
- Create one durable unread notification for the recipient and request ID in the same transaction as successful submission. Include request type, stable request/proposal/parent IDs as applicable, a short display title, requester identity, submitted time and read state. Do not copy the whole configuration into notification content.
- Draft creation, saves and failed submissions create no alert. Submission retries, concurrent duplicate calls and transaction retries create at most one alert. A rejected request revised into a new submitted request receives a new alert linked to that new request.
- The bell's unread total includes basket notifications. An online foreground Super Admin session discovers committed notifications within the existing 30-second refresh cadence, also refreshing on opening the inbox, focus and reconnect. An offline session sees durable alerts after reconnecting.
- Opening the alert marks only that recipient's notification read and opens the precise request review using stable IDs, even if it is not on the first queue page. Marking read does not approve, reject or remove the request from the pending queue. A request already decided opens its allowed history/status instead of a stale approval action.
- Preserve chat and Execution notification access, counts, pagination, read semantics and delivery. Loading, empty, error, retry, revoked-session and identity-switch states must not expose another user's notifications.
- No alerts are backfilled for historical requests as part of this task.

## Architecture recommendation and alternatives

Extend the isolated proposal workflow with an explicit target type, new Main Basket versus new Sub-Basket under an existing Main Basket. Reuse editor adapters and review logic, and branch publication by that declared target. This preserves a single proposal lifecycle and avoids giving Procurement direct Configuration permissions. A separate name-only Sub-Basket request would be smaller but would not provide the requested configuration/review experience.

For notifications, use a basket-specific persisted source integrated with the existing bell. Extending chat records would require changing project membership semantics; deriving alerts from the pending count alone would not provide durable unread state or reliable individual request links.

Persistence and public DTO changes must be additive and explicitly versioned/discriminated. Existing records missing the new target discriminator retain their original new-Main-Basket meaning. Existing legacy request handling remains supported. The task plan must settle target-aware pending uniqueness against the installed legacy indexes before implementation; it must not silently replace indexes, encode parent identity into display names, or weaken the old duplicate checks. If index transition is necessary, prepare a separate dry-run/rollback procedure and report it as a deployment prerequisite. No live index migration is authorized by this specification.

## State and permission contract

Both target types retain: draft -> pending -> fulfilled or rejected; revise rejected -> new linked draft. Original submitted/decided records remain immutable. Notifications transition unread -> read independently of request decisions.

| Action | Procurement | Sole active Super Admin | Other roles |
| --- | --- | --- | --- |
| Create/edit a proposal | Own draft only | Existing review-copy behavior | Denied |
| Select existing parent | Eligible catalog Main Basket | Inspect selected target | No new access |
| Submit/revise | Own valid proposal only | No impersonation | Denied |
| Review/edit/approve/reject | Denied | Existing operation-scoped permissions | Denied |
| Read/mark basket alert read | Denied | Own recipient records plus current review authorization | Denied |
| Write parent/existing children through Sub-Basket request | Denied | Denied in this request flow | Denied |

Backend operations remain authoritative. Register any new protected endpoints and synchronize frontend permission contracts and OpenAPI. Maintain existing authorization behavior for direct Super Admin Configuration actions.

Preserve optimistic versions, content digests, idempotency fingerprints, immutable history, requester ownership and audit identity. Distinguish duplicate Sub-Basket names by stable parent ID; the same name under different parents is not the same record. Publication must protect against same-parent collisions and concurrent approvals without partial resources or duplicate notifications.

## Failure handling, compatibility and rollout

- A notification persistence failure rolls back submission; retry the same command safely. A later inbox/network failure does not roll back an already committed request or create duplicate alerts.
- A publication failure leaves the request pending and creates no partial catalog. Rejecting a request creates no live catalog entries.
- Preserve existing values when fields are hidden, and preserve all prior proposals and normal Configuration API shapes. Use schema defaults/compatibility readers rather than a data rewrite wherever possible.
- Verify using synthetic fixtures and disposable replica-set databases. Do not alter the configured local database or production database.
- Deployment, any index transition, migration/backfill, seeding, database synchronization, commits and pushes require their own explicit target authorization. None are included here.
- Rollback disables the new Sub-Basket entry point and basket notification source while retaining stored history and approved records. Any required index rollback must be documented before a live transition.
- Audit events record target type, stable target/request IDs, actor and outcome. Diagnostics must not log secrets or full configuration/customer payloads.

## Acceptance criteria and verification

1. **AC1, simplified forms:** Proposal Add/Edit Sub-Basket omits Display order; Main Line omits Description and Display order. Required names and save/error handling work. Editing previously stored nodes preserves hidden values. Verify rendered forms and mutation payloads with nonzero order and nonempty description fixtures.
2. **AC2, tabs/quality:** Quality Parameter uses the shared editor; Saved summary is absent only from proposal workspaces. Quality save/import/stage filtering still work for new Main Basket proposals. Inherited parent quality is read-only for Sub-Basket proposals. Verify both proposal target types and ordinary Configuration defaults.
3. **AC3, style/width:** Cold-open Procurement without first visiting/importing the Configuration page. Check both panel stages at 1440px, 1920px, 1024px, 768px and 390px: desktop width approximately 70%, smaller widths usable, no unintended page overflow, readable stage counts/table headings, accessible keyboard and nested-dialog behavior. Compare ordinary Configuration before/after in the real app shell, with no visual changes.
4. **AC4, existing-parent requests:** Procurement can start a Sub-Basket request under one selected active Main Basket, and choose explicitly when multiple are selected. Test both a Sub-Basket-only request and one containing configured Main Lines, rejection/revision and saved-draft reopening.
5. **AC5, publication preservation:** A replica-set integration test approves the request under the exact selected parent. Use two unequal parents, an existing child and existing quality values; verify no parent, sibling, quality or other-parent data changes, no duplicate Main Basket, and correct active new lines/explicit vendor selection. Also verify the original new-Main-Basket workflow.
6. **AC6, concurrency/authorization:** Test other Procurement ownership, unauthorized roles, missing/inactive parent, same-name children under different parents, same-parent collision, parallel approval, retry after uncertain response, stale versions and transaction rollback. No new direct Configuration permission is granted.
7. **AC7, notifications:** New Main Basket, existing-parent Sub-Basket, revised submission and supported legacy submission each create exactly one durable recipient notification after commit. Drafts/failures create none; repeated/concurrent submission produces no duplicates. Inject notification persistence failure to prove atomic rollback.
8. **AC8, inbox interaction:** Super Admin sees basket unread counts, opens the exact request beyond page one, marks it read and returns without approving it. Verify already-decided links, refresh/reconnect, loading/error/retry, recipient isolation and identity switch. Chat/Execution counts and access remain correct.
9. **AC9, contracts/preservation:** Backend/frontend typechecks and builds, focused workflow/notification/authorization/route/OpenAPI tests and integrated browser checks pass. Run broader shared-boundary regression checks proportionately. `git diff --check` passes; report exact checks, baseline failures, unrun checks and any deployment/index prerequisites. No local/production data writes or sync operations occur.

## Assumptions and open decisions

- “Similarly” means the same Super Admin approval flow for new Sub-Baskets, not immediate live Configuration creation.
- A Sub-Basket-only request is allowed; configured Main Lines are optional but validated when present.
- Existing-parent shared Quality Parameters remain inherited/read-only to honor the user's instruction to preserve existing Configuration data.
- “Any request” covers submissions in this basket workflow, and “notification” means the existing in-app bell.
- No product decision requires a separate question beyond approval of these explicit defaults. Target-aware pending indexes and the smallest safe stylesheet reuse are engineering details to resolve in the approved task-plan stage.

## Workflow status

Only this specification has been created for the follow-up request. Per repository `AGENTS.md`, the separate task plan follows specification approval, and implementation follows task-plan approval and execution-mode selection.
