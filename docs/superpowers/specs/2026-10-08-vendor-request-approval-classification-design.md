# Vendor request approval with Configuration setup

Status: implemented in approved Mode A on 2026-10-08. Scope verification is complete with the broader baseline failures and test limitations recorded in the [task-plan delivery record](../plans/2026-10-08-vendor-request-approval-classification.md). No deployment performed.

## Goal

When Procurement sends a Main Basket request while adding a vendor, make the pending request visible from the Super Admin dashboard. Allow Super Admin to add a Sub Basket and Main Line as part of approving that request, so Procurement can continue classifying and saving the vendor.

## Current behavior and evidence

Verified against the current worktree on 2026-10-08:

- `frontend/src/features/procurement/VendorBasketRequestDialog.tsx` sends the vendor name, optional saved vendor ID, proposed Main Basket name and an idempotency key. Sending a request does not save the vendor profile.
- `backend/src/services/vendor-basket-request.service.ts` persists a pending request, exposes a Super Admin review list, and uses a transaction for approval/rejection, version checks, audit and idempotency. Approval creates or resolves an active Main Basket only.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx` initially hides `KnowledgeBasketRequestReview` behind the Main Basket requests button. It has no pending count or dashboard entry point.
- `KnowledgeBasketRequestReview.tsx` offers Reject and Add to Configuration. The approval dialog has no Sub Basket or Main Line fields.
- `frontend/src/features/admin/dashboard/DashboardOverview.tsx` has an Action queue but no vendor classification request entry.
- `backend/src/contracts/vendor-basket-request.ts` and `backend/src/models/VendorBasketRequest.ts` record only the fulfilled `basketId`, with no Sub Basket/Main Line outcome.
- `backend/src/services/ai-estimator-knowledge-item.service.ts:createMainLine` already creates a draft Main Line, revision and sections transactionally, and can create its Sub Basket in that transaction. It coordinates parent dependencies, ordering and aggregate versions.
- `backend/src/services/procurement-vendor-profile.ts` requires selected Main Baskets and Sub Baskets when saving a vendor. Vendor classification does not currently store Main Line IDs. A vendor profile also needs information beyond the name supplied in a basket request.

### Existing work to preserve

The previous approved vendor-name fix remains uncommitted in `ProcurementVendorEditor.tsx`, `ProcurementVendorProfile.test.tsx`, `VendorBasketFields.tsx`, and `VendorBasketRequestDialog.tsx`, with its separate 2026-10-08 spec and plan. Preserve that implementation and verification record. Capture the current per-target diff again before any later writers start.

## Scope and product assumptions

- “Super Admin screen” means the Super Admin dashboard, with a direct link into the existing Configuration request review screen. Keep one request queue and one decision flow.
- “Should be able to add” means Sub Basket/Main Line setup is available during approval, rather than mandatory for every existing request. The current Main Basket-only approval remains available.
- One approval can create or select one Sub Basket and optionally create one Main Line within it. Further Configuration setup remains available through the existing screens.
- Procurement completes the normal vendor form after approval. Approval does not automatically create a vendor, modify an existing vendor, or associate records by vendor name.
- Main Lines belong to Configuration. Creating one here does not introduce a new Main Line selector or Main Line assignment field into the vendor profile.

## Proposed experience

### 1. Request submission and visibility

1. Preserve the current Send request flow, editable name for an unsaved vendor, saved-vendor identity validation and draft retention.
2. Successful submission continues to produce a pending request. Confirm that it is awaiting Super Admin approval.
3. Add a compact **Vendor classification requests** entry to the Super Admin dashboard Action queue, with an authoritative pending count and a **Review requests** link.
4. The link opens Configuration with its request section expanded and Pending selected. Direct navigation and browser back/forward must preserve the requested review state.
5. Show the same pending count alongside the existing Configuration request entry point. Loading or failed counts must not display a fabricated zero.
6. Reuse the existing protected pending-list API and its pagination total. Refresh on mount, window focus and explicit refresh, plus a modest interval while the queue entry/review is visible (30 seconds). Do not introduce a second dashboard aggregate, websocket channel or email notification for this request.

### 2. Super Admin approval

1. Pending rows show the requested Main Basket, vendor name, requester information, request date and status, with **Review and approve** and **Reject** actions.
2. Review opens an accessible panel containing the request context and requested Main Basket. Preserve existing create-or-resolve behavior: create the requested Main Basket if absent, or resolve a matching active basket using the established normalization rule. An inactive match remains a visible conflict.
3. Include an optional **Set up Sub Basket and Main Line** section. When enabled:
   - Select an existing Sub Basket belonging to the resolved active Main Basket, or enter a new Sub Basket name.
   - For a new Main Basket, offer new Sub Basket entry directly.
   - Optionally enter a Main Line name beneath that Sub Basket.
   - A Main Line cannot be submitted without a valid Sub Basket choice/name.
   - Use the existing Configuration name bounds, normalization, uniqueness and hierarchy validation. Do not silently choose a different existing Main Line when a name conflicts.
4. Submit one approval command. Use **Approve and save** when setup is present and **Approve request** for Main Basket-only approval.
5. Approval, basket resolution/creation, requested Sub Basket/Main Line creation, result IDs and their audit events commit together. A failure leaves the request pending and creates no partial hierarchy.
6. Show the saved hierarchy after success. A newly created Main Line is clearly identified as a draft, with an **Open Main Line** link to finish configuration.
7. Rejection retains the required reason and creates no Configuration records. Cancel before submission performs no write.

### 3. Continue adding the vendor

1. After approval, the Main Basket and Sub Basket are available through the existing Configuration-backed vendor selectors on refresh/focus.
2. Retain all entered vendor form fields and existing basket selections when refreshing options. Do not automatically select new classifications or overwrite the draft.
3. Procurement selects the approved Main/Sub Baskets and saves through the existing vendor validation and authorization path.
4. The Main Line remains a draft until its required configuration is completed and it is explicitly activated. Vendor creation does not depend on activating that Main Line.

## Architecture recommendation and tradeoff

**Recommended: extend the existing transactional decision.** Add optional Configuration setup to the approval command and reuse session-aware Configuration creation logic. This keeps a fulfilled request consistent with the hierarchy the admin asked to create, and preserves retry/audit guarantees.

An alternative is approving the Main Basket first and issuing separate Sub Basket/Main Line creation requests. It requires less service extraction, but failures can leave approval complete while setup is missing and make retries harder to understand. Do not use that alternative for this flow.

## Data and API impacts

- Keep the existing request creation, list and decision routes, operation keys, status enum and version semantics.
- Extend the decision input with an optional `configuration` object for fulfillment only:
  - Exactly one of `subBasketId` or `subBasketName`.
  - Optional `mainLineName`.
  - Reject empty setup objects, both Sub Basket fields, setup on rejection, blank/oversized names and a child that belongs to another Main Basket.
- Resolve and validate parent IDs again inside the transaction. UI catalogue contents are not authoritative and may become stale before submission.
- Add nullable `subBasketId` and `mainLineId` outcome fields to request persistence and both API type mirrors. Old records return null values. Store stable IDs, not name-based vendor or hierarchy joins.
- Preserve the existing normalized Main Basket resolution behavior. For newly entered Sub Basket names, reuse the established Configuration resolution behavior within the resolved parent. Main Line name conflicts should return the established conflict response rather than create duplicates or guess a link.
- Extract only the session-aware creation helpers needed to share the established Configuration behavior; do not create a second implementation of revisions, sections, completeness, order allocation, dependency coordination or aggregate updates. Keep the existing standalone Main Line/Sub Basket creation behavior unchanged.
- Include the normalized setup payload in the decision fingerprint when present. Preserve the legacy fingerprint for commands without setup so earlier decisions can still replay safely.
- The same command key and contents replay the same outcome IDs without duplicate children/audits. A changed command must not reuse that key. Preserve version conflicts between competing decisions.
- Update Zod validation, OpenAPI and backend/frontend contracts together. No new dependencies or financial fields are needed.

## Permissions, state and failure handling

| Actor/state | Allowed behavior |
| --- | --- |
| Authorized Procurement | Submit a request, see only its own request status through the existing API, and use available Configuration classifications when saving a vendor |
| Active sole Super Admin | View the review queue; approve with optional setup; reject with a reason; continue Configuration editing |
| Other roles or inactive identities | Existing route/actor guards continue to deny request review or decisions |
| Pending request | May transition once to fulfilled or rejected, guarded by the expected version |
| Fulfilled/rejected request | Immutable decision; matching idempotent retry only |

- Revalidate the active Super Admin identity inside the write transaction, including before returning decision replays. Preserve operation-specific authorization and existing catalog access boundaries.
- Freeze the submitted command and idempotency key during pending/uncertain retry. Keep entered setup visible after a failure; do not quietly submit altered setup under the old key.
- Handle stale/deleted/moved children, inactive/deleted parents, naming conflicts and simultaneous approvals explicitly. Coordinate with existing Configuration deletion/creation guards so an approval cannot create orphan records.
- If the server commits but a response or cache refresh fails, distinguish the saved result from a refresh problem. Never invite the user to create a second hierarchy to recover.
- Invalidate all affected review/count, own-request, Main Basket, Sub Basket and Main Line queries after a successful decision. Other sessions obtain the new state through focus/interval refresh. Failed reads must preserve an explicit stale/unavailable state.
- Extend the existing decision audit with the hierarchy IDs and include the request ID in creation audit context where supported. Avoid vendor contact/identity document data in new logs or fixtures.

## UX and accessibility constraints

Use existing form/panel tokens and compact spacing. No dashboard redesign, new icon library, oversized cards or decorative effects. Provide associated field errors, loading/empty/error states, pending controls, keyboard-operable choices, trapped panel focus and return focus to the initiating action. The review panel must remain usable at narrow mobile widths without horizontal overflow.

## Compatibility, migration and rollback

This is an additive schema/API change with nullable outcomes and optional setup input. No data backfill, seed or write migration is planned. Pending requests created before this change remain reviewable; fulfilled historical requests keep their recorded decisions and do not gain invented child IDs.

Deploy backend contract support before enabling the new frontend command. A frontend rollback can retain the existing Main Basket-only behavior; existing saved children and historical decision IDs must not be removed. Backend rollback compatibility with populated outcome fields and stored setup fingerprints must be assessed before any deployment rollback. Deployment itself is outside this task's authorization.

## Acceptance criteria and verification

1. **Visible request:** Send request from an unsaved vendor form, retain its draft, then read the same pending request under Super Admin. The dashboard shows the accurate pending count and links directly to the expanded review queue.
2. **Hierarchy creation:** Approve with a new Sub Basket and Main Line. Exactly one hierarchy is persisted with correct parent IDs, draft revision/sections, order and audit records. The request records all outcome IDs and leaves the pending list.
3. **Supported variants:** Main Basket-only approval, Sub Basket-only setup and selecting an existing Sub Basket all work. Existing active Main Basket resolution, inactive conflicts and rejection semantics remain intact.
4. **Vendor continuity:** Refresh/focus exposes the approved Main/Sub Baskets for selection without losing entered vendor details. The normal vendor save succeeds with a valid complete profile. Approval alone saves or modifies no vendor.
5. **Integrity:** Two asymmetric Procurement identities cannot read each other's private request list or decide requests. A non-Super Admin cannot add hierarchy through the decision endpoint. Stale versions, wrong-parent IDs, archived/unavailable parents and duplicate Main Line names are handled without partial writes.
6. **Retries and transactions:** Concurrent decisions commit one result. An unchanged retry returns the same IDs. Changed setup with the same key is rejected. Injected child/revision/section/audit failure rolls back the entire decision and hierarchy. Test legacy records and legacy decision replay too.
7. **UI states:** Dashboard count failure, empty queue, catalogue failure, validation, uncertain retry, successful save followed by refresh failure, keyboard navigation and mobile layout are covered with synthetic data.
8. **Existing behavior:** Normal Configuration Main Line/Sub Basket creation, activation gates, vendor-name entry and saved-vendor request identity checks retain their contracts.

Required verification after implementation: focused backend replica-set request and Configuration creation tests; route authorization/OpenAPI contract checks; frontend request review, dashboard queue, deep-link and vendor form regression tests; backend/frontend typechecks and builds; rendered desktop/mobile interaction and accessibility checks; `git diff --check` and final worktree review. The separate task plan will map exact commands and ownership to these criteria after spec approval.

## Non-goals, risks and open decisions

Non-goals: automatic vendor creation/assignment, a new vendor-to-Main-Line relationship, changing vendor required fields, changing pricing/UOM or activation, emailing approvals, financial calculation changes, previously deferred security remediation, production writes, commits or deployment.

Principal risks are preserving transactional Configuration invariants when reusing creation logic, safely retrying an approval with additional inputs, refreshing two users' screens without assuming same-browser cache invalidation is sufficient, and retaining existing uncommitted vendor-name work.

No additional decision is required to prepare the plan. The explicit assumptions about optional setup and Procurement completing vendor save are reviewable parts of this specification.
