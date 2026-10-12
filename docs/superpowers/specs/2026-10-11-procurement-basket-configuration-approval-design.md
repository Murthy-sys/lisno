# Procurement basket configuration and Super Admin approval

Date: 2026-10-11
Status: Approved by the user; task plan approved and Mode A implementation in progress.
Classification: Substantial and high-risk: shared configuration, authorization, financial configuration, persistence, transactional activation, and multi-role workflow.

## Goal and confirmed scope

From Procurement → Vendors → Add vendor → Add Main Basket, Procurement can configure a complete new basket using an interface similar to Configuration. Procurement saves its proposal and sends it to Super Admin for approval and activation. Super Admin can inspect and edit the proposed configuration, then approve it. Successful approval creates a normal active Main Basket and its configured contents in Configuration and makes the basket available in the vendor editor.

The user explicitly confirmed **full configuration**, including Sub-Baskets, Main Lines, UOM, rates, and mode settings. This is not limited to requesting category names. The workspace should offer the existing Configuration editing capabilities, while keeping proposed values separate from shared configuration until approval.

## Current behavior and evidence

- `VendorBasketFields.tsx` opens `VendorBasketRequestDialog.tsx` from **Add Main Basket**. Today this collects only the vendor name and proposed Main Basket name. The underlying vendor form can remain unsaved.
- `vendor-basket-requests.ts`, its contract, and `VendorBasketRequest` model store a name-only request with `pending`, `fulfilled`, or `rejected` status, optimistic version, idempotency fingerprints, actor identity, and decision metadata. Creation is Procurement-only; decisions require the current sole active Super Admin.
- `vendor-basket-request.service.ts` currently fulfills a request in a Mongo transaction by finding/creating an active basket and optionally creating one Sub-Basket and a named draft Main Line. It does not carry Procurement-authored section payloads or activate a fully configured hierarchy.
- `KnowledgeBasketRequestReview.tsx` and `KnowledgeBasketRequestDecisionPanel.tsx` expose the Super Admin queue. Existing dashboard/request badges poll pending counts every 30 seconds and refresh on focus.
- `KnowledgeItemWorkspacePage.tsx` supplies Overview, Mode, Recommendations, and Quality navigation. Mode covers advanced/pricing settings. The current panels call shared Configuration APIs directly and therefore cannot safely be mounted unchanged for Procurement.
- Configuration Main Line activation in `ai-estimator-knowledge-item.service.ts` validates current relationships, completeness, graph constraints, versions, and immutable revision history. A Main Basket's active status and a Main Line's active revision are distinct concepts.
- Basket quality is shared at Main Basket level through `KnowledgeBasketQualityPanel.tsx`; it must not be copied independently into each proposed Main Line.
- The vendor picker reads the active Configuration basket catalog by stable ID, with separate Sub-Basket catalogs. Pending proposals are not valid vendor classifications. Catalogs refresh on window focus and through **Refresh baskets**.
- Configuration write guards currently protect shared records for Super Admin. Existing Procurement access to vendor classifications does not authorize writing shared pricing/configuration sections.
- The backend limits JSON request bodies to 300 kB. A whole basket with many configured lines must use incremental saves rather than one unbounded form submission.
- Existing replica-set tests already cover request deduplication, authorization, decision races, transaction rollback, and legacy decision replay. Frontend tests cover review conflicts, uncertain retries, catalog failures, and post-save refresh failures.
- The worktree was clean at discovery. Earlier Source dropdown and Ask Lisno work is not part of this change.

## Recommended design and alternatives

**Recommended: request-owned configuration drafts, promoted atomically on approval.** Reuse Configuration field editors and domain validation through an explicit proposal data adapter. Keep proposal metadata, hierarchy, sections, basket quality, and review history in a separate persistence boundary. Only approval writes the normal Configuration collections. This preserves the existing catalog and internal consumers without introducing pending entries into their source of truth.

An alternative is to create ordinary inactive/draft Configuration records immediately and add proposal visibility rules to every consumer. That would affect catalog lists, recommendation resolution, quality, vendor classifications, editable estimates, and latest-saved-draft consumers. It risks exposing unapproved content and broadens permission handling, so it is not recommended.

The user chose full configuration; retaining the name-only authoring form would not meet the requested outcome.

## Explicit Super Admin preservation requirement

The user requires that this change preserve all existing Super Admin functionality. During implementation, the user clarified: “Keep screens, behavior and data unchanged; reuse shared code.” Shared code adapters remain within the approved design; existing Configuration behavior and existing records must stay unchanged. The proposal workflow is additive; it must not replace, restrict, or redirect existing Super Admin workflows.

- Preserve direct Configuration creation/editing, reusable values, basket/Sub-Basket management, Main Line revisions, activation/deactivation, deletion safeguards, quality, mode/pricing calculations, and existing approval history and queues.
- Reusing editor components must keep the live Super Admin editor as its existing default. Proposal-specific APIs, permissions, save/submit controls and state must be explicitly selected by the new proposal workspace and must not leak into normal Configuration screens.
- Preserve current Super Admin routes, navigation, role checks, sole-active-identity protection, existing request decisions, idempotency behavior, and audit semantics. Procurement proposal permissions never replace or broaden ordinary shared-Configuration permissions.
- Capture and run a focused Super Admin baseline before changing shared components/services. Repeat affected tests after integration, and browser-check direct Configuration editing/activation alongside the new review flow. Exercise existing name-only approvals as well as new full-proposal approvals.
- Check dashboard/navigation/queue regressions whenever their shared consumers change. Fix regressions introduced by this feature before marking the implementation complete; report any pre-existing failures separately with baseline evidence.
- Do not rewrite or remove existing Configuration data to accommodate proposal drafts. A failed proposal save, review, or approval must leave normal Super Admin records and workflows usable.

## Procurement experience

1. **Add Main Basket** opens an expanded configuration workspace over the vendor editor. Keep the vendor editor mounted and preserve its unsaved fields, selected baskets, uploads, and scroll/focus context. On mobile, the workspace occupies the available screen with clear Back/Close and save controls.
2. Show vendor context, Main Basket name/description, proposal status, and **Not available until approved**. A saved vendor uses its stable ID and current authorized name; an unsaved vendor keeps the current name snapshot. Saving a proposal never creates or silently saves the vendor.
3. Let Procurement add, rename, and remove proposal-owned Sub-Baskets and Main Lines; configure their Overview, Mode, Recommendations, and shared basket Quality using the established Configuration terminology and controls. Display completeness and activation blockers from backend validation.
4. Include current UOM, modes, Execution/Sub-Vendor/In-house and PMC settings where applicable, pricing/rates, quantity/margin rules, recommendations, exclusions, and quality parameters supported by the normal editors. Preserve existing section applicability and optionality; do not invent new required fields or silently fill missing financial data.
5. Select reusable Configuration values by stable ID. Procurement may read the minimum reference data required to author the proposal. This flow does not grant creation/editing of shared UOMs, taxes, modes, surfaces, priorities, quality reusable values, or existing basket pricing. Missing reusable values remain explicit and can be managed by Super Admin through existing Configuration authority.
6. **Save draft** saves proposal content without publication; incomplete drafts are allowed under normal save validation. Section/hierarchy saves use version checks. Show last saved state and guard unsaved changes on close/navigation.
7. **Send for approval & activation** operates on the saved proposal version. Require a named basket, at least one Sub-Basket and one Main Line, valid parent relationships, and no normal activation blockers across included Main Lines. Every included Sub-Basket must contain a Main Line for this full-configuration submission. Optional normal Configuration sections remain optional. Show errors beside the affected section and link to them.
8. Submission freezes the Procurement-authored snapshot. Status becomes **Pending approval**, and the requester can view it but cannot change it while Super Admin reviews it. It remains absent from normal Configuration and vendor choices.
9. Add **My basket requests** access in Procurement → Vendors, also reachable from the vendor editor. List the user's drafts, pending requests, approved requests, and rejected requests with saved progress and decision reasons. Drafts can be resumed by request ID across sessions; unsaved vendor names are display context, never join keys.
10. A rejected request remains immutable history. **Revise request** creates a linked new draft from it, preserving the original submission and rejection. Procurement can correct that new draft and submit again.
11. On approval, show the approved basket name and availability. Refresh the normal basket/Sub-Basket catalogs and let the user explicitly select the approved basket in the current vendor form. Approval does not silently modify a vendor's classifications or discard an in-progress vendor form.

## Super Admin experience

- Keep the existing Configuration **Main Basket requests** queue and dashboard entry, with counts for pending submissions only, excluding unsent drafts.
- **Review configuration** opens the same configuration editing experience in review mode, with requester, vendor context, submitted time/version, original submitted snapshot, and the current review draft.
- Super Admin can edit basket details, hierarchy, Main Line sections, rates/modes, recommendations, and basket quality. These changes belong to a versioned review copy and do not alter the original submission or shared catalog.
- Show a concise change summary from submitted content to reviewed content. Preserve who changed it and when. A saved review draft can be reopened before deciding.
- **Approve & activate** approves the exact saved review version after displaying its activation readiness. Unsaved changes must be saved or discarded before approval. Approval repeats authoritative validation and reference checks at commit time.
- Successful approval creates the Main Basket, Sub-Baskets, Main Lines, initial active revisions, section payloads, and basket quality in the normal Configuration storage, records their stable IDs on the request, and records the decision/audit history in one transaction. All included Main Lines activate together. Do not mark a request approved after only a partial hierarchy has been written.
- The resulting basket behaves like any ordinary basket in Configuration. Subsequent edits use the existing Super Admin Configuration/revision workflow; the Procurement request remains decision history.
- **Reject** requires a reason and creates no shared Configuration records. Reject and approve are mutually exclusive, version-checked terminal decisions.
- If a same-normalized-name Main Basket already exists when approving a full proposal, block approval and show the conflict. Super Admin may rename the proposal and revalidate it. Do not merge the full proposed configuration into a live basket by name or overwrite existing values. Existing name-only request behavior remains separately compatible.

## State and authority contract

New full-configuration requests use the existing status vocabulary plus draft: `draft → pending → fulfilled | rejected`. Display `fulfilled` as **Approved** for users. A review draft is versioned content under a pending request, not a second independently approvable request. Legacy requests remain explicitly distinguishable as name-only requests.

| Operation | Procurement requester | Other Procurement user | Sole active Super Admin | Other roles |
| --- | --- | --- | --- | --- |
| Create proposal; read permitted reference catalogs | Yes, with operation permission | Yes, for own proposals | Existing Configuration authority; no impersonation | Denied |
| Read/update own unsent draft | Yes | Denied | No unsent-draft editing through review queue | Denied |
| Submit saved own draft | Yes | Denied | Not on behalf of requester | Denied |
| Read submitted/decided proposal | Own only | Denied | Yes, with review permission | Denied |
| Edit pending review copy | Denied | Denied | Yes | Denied |
| Approve/activate or reject | Denied | Denied | Yes, with decision/lifecycle authority | Denied |
| Direct shared Configuration writes | Existing restrictions retained | Existing restrictions retained | Existing operation-specific permissions | Existing restrictions retained |

Backend stored-actor checks remain authoritative, including active user/role revalidation and the sole-active-Super-Admin invariant during mutations and idempotent replays. Update the canonical operation registry, permission inventory, OpenAPI and frontend visibility together. New proposal-scoped permissions must not enable generic Configuration mutation endpoints for Procurement.

## Data, API, and integrity requirements

- Extend request metadata additively with an explicit proposal kind/schema version, draft/submitted/review version references, lineage for revised requests, and approved hierarchy outcomes. Missing proposal metadata identifies existing name-only requests.
- Store configuration in versioned request-owned resources, incrementally by hierarchy/section and basket quality. Keep list responses compact and paginate hierarchy/history where needed. Retain the existing 300 kB request-body limit and establish explicit bounded hierarchy/section limits in the implementation contract before coding.
- Allocate stable server-owned identities for draft basket, Sub-Baskets, Main Lines, and revision content. Preserve those identities on publication where possible, or persist a complete explicit ID mapping. Reject cross-request child IDs and invalid parents. Never associate proposal content with existing Configuration merely because labels match.
- Use normal Configuration payload shapes and backend validators for sections, money units, mode formulas, relationship graphs, completeness, and activation. Factor reusable validation/activation helpers where necessary without weakening existing Configuration checks.
- Recommendation/exclusion/relationship validation must resolve both proposal-owned nodes and authorized live reference nodes. On approval, resolve all outgoing references to canonical IDs; reject invalid, archived, deleted, or incompatible targets. Parent/reference status changes must participate in the existing transactional coordination or equivalent guarded writes, not a check-then-write race.
- Every mutation has actor identity, optimistic expected version, and audit lineage. Submission/review/decision snapshots have content digests. Successful approval records submitted version/digest, approved review version/digest, approver, time, edits, and published resource IDs.
- Create, submit, revise and decision commands are idempotent. An uncertain network response is retried with the same command key and unchanged payload; reusing a key for different content conflicts. Competing edits or decisions return a clear version conflict rather than overwriting work or publishing twice.
- Publish the entire validated hierarchy and the decision/audits in one Mongo replica-set transaction. Audit or publication failures roll back all new shared records and leave the request pending. Keep transaction semantics intact in tests and deployment environments.
- Existing active revisions, approved estimate amounts, published/issued artifacts, vendor history, and Configuration source-of-truth rules remain unchanged. Proposal prices have no effect on shared pricing or financial calculations before approval. Use integer paise and established explicit unit conversions.
- Drafts are persisted through the backend under actor scope, not stored as shared browser-local data. Clear private proposal queries and editor state on identity changes. Do not log complete configuration payloads, credentials or vendor personal data.

## Freshness, failures, and notifications

- Submission updates the requester's list and the existing Super Admin pending count/queue through established refetch/polling behavior. In-app request status is the notification channel for this scope; no new email or external messaging is required.
- After approval, invalidate request lists/counts, basket and Sub-Basket lists, Main Line/item/detail/section/history queries, basket quality, activation previews, and applicable Configuration context/reference queries.
- Separate browser sessions cannot share a QueryClient invalidation. Procurement request status should refresh on focus and while pending using the existing 30-second foreground polling convention; an observed decision triggers catalog refresh. Keep an explicit Refresh control and label stale/error states honestly.
- If approval succeeds but a refresh fails, retain the successful decision and published IDs; retry reads only. Do not offer a second create/approval command to repair a catalog-read failure.
- Preserve local edits on validation/network/conflict errors. A stale review or changed reference blocks approval with actionable findings. Rejection reasons are visible to the requester.
- Loading, empty lists, unauthorized access, deleted references, duplicate names, pending saves, and unknown submission outcomes receive distinct states. Incomplete drafts never appear as usable catalog choices.

## UI reuse and accessibility

Reuse the established Configuration composition: basket/Sub-Basket/Main Line navigation, Overview/Mode/Recommendations/Quality panels, saved summaries, blockers, save status and conflict handling. Extract presentational components or a narrow data adapter rather than copying the full live workspace or letting proposal mode call live write APIs.

Keep shared basket quality editable once per proposal. Existing direct live master-creation actions must be absent or explicitly outside the proposal flow under their original Super Admin authority. The new workspace must not expose unrelated operational/global configuration controls to Procurement.

Use the existing ContextPanel/overlay stack, focus return, dirty guards, labels, keyboard navigation and responsive styles. On narrow screens use a step/section selector and scrollable content with visible save/submit controls. Do not add new design libraries, icons, animation, or dependencies just for this workflow.

## Compatibility, rollout, and rollback

- Existing pending name-only requests remain reviewable through their current approval flow, clearly identified as legacy name requests. Existing fulfilled/rejected history and its old fingerprints/nullable outcome IDs remain readable and replayable. Never auto-convert a pending request into an invented full configuration.
- Keep old create/decision semantics for legacy clients; the new UI explicitly creates full proposals. New decision guards prevent a legacy name-only decision payload from bypassing full-proposal readiness and activation.
- Introduce draft persistence/indexes additively; no seed, deletion, or historical data rewrite is planned. Deploy compatible backend support before enabling the new UI. Deployment itself requires separate authorization.
- Index work must preserve existing pending-request uniqueness and name normalization. New draft and revision indexes must be compatible with legacy rows. If any live migration is found necessary, prepare backup/rollback and dry-run evidence and obtain the required separate execution authorization; do not run it under implementation approval.
- Rollback should disable new proposal creation/submission without deleting pending drafts or approved Configuration. Already approved baskets remain valid ordinary Configuration records. Preserve ability to read submitted history while resolving any rollout issue.

## Scope exclusions

No general Procurement edit access to existing Configuration, automatic vendor save/classification assignment, broad shared-master creation, bulk catalog imports, edits to already approved commercial artifacts, new external messages, production mutation, database sync, deployment, commit, or push. Existing Add Sub Basket behavior for already-live baskets is not redesigned by this request; new proposal children remain draft-scoped.

## Acceptance criteria

1. Procurement can open full basket configuration from the vendor side panel, add multiple Sub-Baskets/Main Lines, edit all supported sections, save incomplete drafts, resume them, and return without losing vendor-form state.
2. No draft or pending proposal is visible through normal Configuration, estimation, recommendation consumers, or vendor catalog selection, and no shared pricing/quality records change before approval.
3. Procurement can submit only its own saved, valid proposal; the submitted snapshot freezes and appears once in the Super Admin queue with correct pending counts and version identity.
4. Super Admin can inspect the submitted version, edit/save a review copy, see the changes, and approve only the current saved review content. Procurement cannot edit a pending review or invoke shared Configuration writes/activation.
5. Approval publishes one normal active basket and all proposed children, sections, quality and active Main Line revisions atomically. Approved values match the reviewed snapshot exactly, including unequal rates/modes across multiple lines; stable relationships survive promotion.
6. The approved basket is available by its canonical ID in Configuration and the vendor picker after refresh/polling. No vendor is silently saved or reclassified, and refresh errors cannot duplicate approved resources.
7. Rejection requires a reason, publishes nothing, and preserves history. A revised request is a new linked draft. Concurrent save/approve/reject, stale references, duplicate names, lost responses and idempotent retries cannot create partial/duplicate publication or overwrite unrelated baskets.
8. Permission tests use two Procurement identities, other roles, inactive/reassigned actors, and the current sole Super Admin; cross-request read/write and spoofed IDs are denied by the backend. Role/token changes clear private frontend state.
9. Existing name-only pending/history records and decision replay remain compatible. Existing Configuration editor, activation, basket quality, latest-draft consumers and vendor-classification behavior remain valid.
10. Mongo replica-set tests prove approval/audit rollback and concurrency safety. Asymmetric fixtures include at least two Sub-Baskets, two unequal Main Lines/rates, another independent live basket, and multiple requester identities.
11. Frontend rendered tests and browser QA cover both role workflows, blank/incomplete drafts, conflicts, references becoming unavailable, rejected/approved states, long configurations, desktop/mobile layout, keyboard/focus, dirty/pending guards and inaccessible actions.
12. Relevant backend/frontend regression suites, typechecks/builds, authorization/OpenAPI registry checks, and repository whitespace checks pass, with exact results and unrun checks recorded. No lint claim without an actual lint command.
13. Existing Super Admin functionality passes the preservation checks above: ordinary Configuration editing/lifecycle operations, reusable values, legacy request review, navigation/queues, authorization and immutable history retain their behavior. Proposal state, pending contents and new controls cannot alter an ordinary Super Admin editing session.

## Assumptions and open decisions

- Full configuration scope is confirmed by the user. Draft persistence, submitted-content freezing, separate Super Admin review edits, rejection with a revised-copy path, and explicit vendor selection are the recommended workflow defaults.
- Approval is one **Approve & activate** action for the whole proposal; individual Main Lines do not become live ahead of the rest. Normal Configuration activation validation is retained rather than imposing a separate completion percentage.
- Creating brand-new reusable global values and applying proposals to existing baskets are outside scope. Duplicate basket names require explicit resolution rather than an implicit merge.
- No further product clarification blocks this specification. The task-plan stage must freeze the exact additive API/resource shapes, editor adapter contract, payload/hierarchy bounds, ownership and acceptance-linked checks before implementation.

Repository `AGENTS.md` requires specification approval before the separate task plan, followed by plan approval and an execution-mode choice. This stage creates only this specification and performs read-only investigation.
