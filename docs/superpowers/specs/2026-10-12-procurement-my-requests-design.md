# Procurement request completion and All my requests

Date: 2026-10-12
Status: Implemented and verified on 2026-10-12; evidence is recorded in the separate task plan. No production deployment or configured database changes.

## Goal

After Procurement successfully submits a Main Basket or Sub-Basket configuration request, close all open request/vendor panels and retain the unsaved vendor draft. Add **All my requests** under the Procurement navigation, with the same visual language and list interactions as Vendors. Remove the Vendor name field and requirement from basket proposal creation.

## Confirmed requirements and assumptions

- The user selected: **Close all panels; keep the vendor draft available**.
- Main Basket and Sub-Basket request forms must not ask for a vendor name or require one to create or submit a proposal.
- The navigation label is **All my requests**, under Procurement, alongside Projects and Vendors.
- Scope is the user's basket configuration requests. Purchase orders, work-order approvals and access requests keep their existing screens.
- Retain the vendor draft in memory for the current signed-in browser tab, including navigation to All my requests and back to Vendors. Cross-refresh, new-tab and cross-device vendor-draft persistence are not included. No vendor is automatically created or updated by basket submission.
- A successful submission leaves the underlying page visible, with confirmation and an **All my requests** link. No forced navigation is needed; the user can click the navigation item. A submission from the requests page returns to its refreshed list.

## Current behavior and evidence

- `ProposalWorkspace.tsx` calls `onSubmitted` and invalidates proposal queries after a confirmed submit, but does not dismiss itself.
- `VendorBasketFields.tsx` passes callbacks that only set a notice. The Main/Sub-Basket and parent vendor panels remain open. `OwnProposalList.tsx` can open a resumed proposal without handling its successful submission.
- `ProcurementVendorEditor.tsx` owns its draft, selected photo, certificate and saved-version context locally. Simply unmounting it would discard these unsaved values.
- `CreateProposalPanel.tsx` renders a required Vendor name field, modifies the parent vendor name and blocks draft creation when it is empty. The backend create route, proposal/request models and notification model also require vendor names, so hiding the field alone would not work.
- `OwnProposalList.tsx` currently provides a drawer, a status filter and paging. It includes saved configuration drafts and uses actor-scoped proposal queries.
- `GET /procurement/vendor-basket-requests/mine` already lists the authenticated user's submitted requests, including earlier name-only requests, and canonical decision statuses. `GET /procurement/vendor-basket-proposals/mine` separately supports saved drafts and configuration detail. These must not be merged by filtering only one loaded page or shown twice.
- `routeRegistry.ts` currently exposes Procurement Projects and Vendors. The existing Vendors page provides header, filter, table, status, pagination and responsive styling that can be reused without changing vendor behavior.
- The repository has substantial existing changes. The preceding task's broad suites reported 16 backend and 24 frontend failures; those are background findings, not a clean baseline for this task. Capture fresh target diffs/hashes before implementation.

## Product behavior

### Successful submission

1. Keep all panels open and inputs intact while the request is saving.
2. Only after the backend confirms submission, retain the originating vendor draft, dismiss its basket editor and any containing request/vendor panels, and clear nested busy/dirty overlay state.
3. Announce that the named Main Basket/Sub-Basket request was sent to Super Admin. Provide an All my requests link on the underlying page and restore keyboard focus to an appropriate visible control.
4. Invalidate both the user's submitted-request list and saved-proposal list. Do not insert a made-up success row or status before confirmation.
5. Validation, permission, conflict or uncertain network failures keep the form open. Preserve the existing idempotent retry/reconciliation behavior. If the original submit succeeded but its response was lost, a confirmed replay closes the panels once.

### Retained vendor draft

- Retain the vendor form's unsaved fields, selected file objects, removal choices and original saved version. Resume from Vendors through a clearly named **Resume vendor draft** action. Do not treat basket submission as a vendor save.
- Scope retained state to authenticated user and vendor identity (or the new-vendor draft). Clear it on logout, identity/role change, successful vendor save or explicit discard. Do not write vendor fields/files to localStorage, server records or the shared catalog for this feature.
- Preserve existing stale-version and upload safety. Revalidate policies and current permissions on resume. A newer saved vendor record must not silently overwrite the draft or advance its original version guard.
- Unrelated vendor close/save behavior stays unchanged. Do not introduce automatic draft retention for every form in the application.

### All my requests page

- Add `/procurement/requests` as the full-page destination and highlight **All my requests** in Procurement navigation.
- Default view lists all submitted basket requests for the signed-in requester, including earlier name-only requests, exactly once. Show newest submissions first with a stable ID tie-breaker.
- Use the existing Vendors typography, header treatment, spacing, filter controls, status presentation, table treatment, row actions and pagination. Reuse existing assets/components where their semantics fit; use request-specific labels. Do not manufacture vendor KPI cards for request data.
- Columns: requested item, request type (Main Basket/Sub-Basket), parent Main Basket where relevant, status, submitted date and action. Show an unavailable parent label when its saved name is unavailable rather than substituting another basket. Vendor name is not a required column.
- Filters: bounded text search by requested basket name, request type and status, plus Reset. Apply filters on the backend before pagination/counting. Use the existing 10/25/50 page-size behavior and reset the page when filters change.
- Status labels reflect the canonical request state: Awaiting Super Admin, Approved and active, or Rejected. Show rejection reasons in detail. Do not infer approval from the existence of a similarly named basket.
- **View request** opens the existing configuration workspace for configuration proposals. Earlier name-only records expose their own saved request summary/status/reason without requiring a proposal that does not exist.
- Preserve access to unsubmitted drafts through a **Saved drafts** action using the existing proposal list. Drafts are labelled explicitly and do not count as submitted requests. Resume and resubmission retain the existing workflow.
- Change existing My basket requests entry points to lead to this destination where safe. Any navigation from an unsaved vendor form must first retain its draft under the same rules.
- Refresh immediately after local submissions, on window focus and at the established 30-second interval while the list is active. Provide manual Refresh and honest loading, empty, filtered-empty, error/retry and stale-data states. Clear private records and close details on identity or permission loss.

### Vendor-independent basket proposals

- Creation forms contain the new basket name and, for a Sub-Basket, its selected parent. Remove Vendor name, its validation, its initial-focus branch and its parent-form mutation callback.
- Permit omitted/null vendor context for configuration proposals in the API and persistence contracts. Represent absence explicitly; do not substitute a fake vendor name, requester name or basket name as a vendor.
- If an existing saved vendor ID is legitimately supplied as context, the backend resolves its authoritative name and validates access/current availability. The user still does not enter a vendor name in the request form.
- Continue accepting existing valid named-proposal clients and preserve all historical stored names/IDs. Earlier name-only request creation keeps its established contract.
- Submitted proposal requests, notifications, review rows, snapshots and revise-copy paths must all support absent vendor context. Super Admin reviews the basket and requester; omit vendor-specific captions when no vendor context exists. Existing vendor-linked rows and all review/approval controls keep their behavior.
- Preserve creation/submission idempotency and old fingerprint compatibility. Normalize optional input before fingerprinting; a retry must not depend on a vendor rename after the initial successful command.
- Retain pending-request collision protection. Vendor-independent requests use an explicit internal vendor-independent identity scope, never a fabricated display name. Allow only one pending vendor-independent request for the same normalized basket name and parent target; different parents remain independent. Keep old vendor-linked duplicate semantics and use existing unique indexes to arbitrate races. No index migration is expected.

## Data, API and authorization impact

- Extend the existing requester-scoped submitted-list query with optional search, target kind and status. Keep pagination and old callers compatible. Document query additions in OpenAPI and validate them strictly; escape text search rather than accepting arbitrary regex.
- Keep requester ownership in the backend query before filtering, paging and counting. Never accept a requester ID from this page. Reuse existing read operations; route visibility must match their permissions, with no new global Configuration grants.
- Extend proposal/request/notification types additively to permit missing vendor context for configuration proposals. Models must continue requiring valid vendor data for the legacy named-request contract. Review all consumers before widening shared fields.
- Existing pending-request indexes can represent the vendor-independent scope with a nullable normalized vendor name and a dedicated internal key. Prove this in disposable replica-set tests before relying on it. If implementation evidence requires index changes, stop at a separate migration decision rather than running a write migration.
- No database backfill, record deletion, seed, production sync, production mutation or deployment. Existing local records remain unchanged. Existing Super Admin notification delivery and approval transactions remain authoritative.

## Scope boundaries

The change covers request completion, the personal request directory, safe retention of the originating vendor form, and optional vendor context for configuration proposals. It does not redesign Configuration or Super Admin, add new approval states, change shared basket activation rules, alter procurement finance, add dependencies, or repair unrelated broad-suite failures.

## Risks and failure handling

- Closing a parent panel can destroy a vendor draft or lose files: retain typed state before unmount and test both new and existing vendors.
- Old query caches and callbacks can expose another user's records: key retained state and reads by actor, cancel stale callbacks, and clear on auth changes.
- Filtering a page in the browser produces wrong totals: filter/count on the authoritative backend source.
- Optional vendor values can break notifications, immutable request construction, duplicate checks or review UI: trace every writer/reader and exercise submit, notification rollback, review, approve, reject and revise without vendor context.
- Shared styling can affect Vendors: use opt-in labels/presentation and scoped request styles, with default vendor regression checks.
- Rollback is a code rollback for the UI/read changes. Once vendor-independent records are created, deploying older code that requires vendor names is unsafe; keep null-tolerant readers when rolling back presentation. This task does not authorize deploying or rewriting records to support rollback.

## Acceptance criteria

1. Both Main Basket and Sub-Basket request forms have no Vendor name field and can create/save/submit with no vendor name or vendor ID.
2. Confirmed submission closes all related panels exactly once, shows confirmation and refreshes requester lists. Failed/uncertain submission preserves the editor until confirmed.
3. Vendor fields and selected files can be resumed from Vendors after submission and after visiting All my requests, without saving a vendor or leaking data across accounts.
4. Procurement navigation opens All my requests with the Vendors visual treatment, accurate requested items/statuses, working search/type/status filters and server-consistent pagination.
5. Submitted configuration requests and older name-only requests remain visible exactly once; saved drafts remain resumable; detail/rejection/revise behavior remains available under existing permissions.
6. Two distinct Procurement users cannot read or count each other's requests or resume each other's vendor drafts. Super Admin navigation, Configuration and existing vendor-linked approval behavior remain unchanged.
7. Vendor-independent creation/submission/replay, simultaneous duplicates, both parent targets, approval/rejection/revision and exactly-once Super Admin notification work with no partial writes and no fake vendor identities.
8. Desktop and mobile checks cover panel dismissal/focus, resumed draft, table/filter/pagination, empty/error/permission states and keyboard operation. Relevant focused tests, workspace typechecks/builds and diff hygiene are recorded; broader checks are selected by the actual shared-contract impact.

## Open decisions and next gate

No blocking product decision remains. The same-tab lifetime for the retained vendor draft is an explicit assumption for approval. After specification approval, create the separate dependency-ordered task plan, then request execution mode according to AGENTS.md.
