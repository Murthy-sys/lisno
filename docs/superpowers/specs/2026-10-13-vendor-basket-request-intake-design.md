# Vendor sidepanel basket request intake

Date: 2026-10-13
Status: Implemented and locally verified. Implementation was authorized by the user's change request and standing instruction to proceed without routine approval pauses, using the selected parallel execution approach. The user confirmed Main Line names only, with Super Admin handling configuration. See the [completed task plan and verification evidence](../plans/2026-10-13-vendor-basket-request-intake.md).

## Goal and evidence

Replace the new Main Basket/Sub Basket authoring flow in Procurement's vendor sidepanel with a concise request form. Keep My Requests and Super Admin verification, send-back and resubmission.

Current `VendorBasketFields` opens `CreateProposalPanel`, which creates a name-only draft and opens the full `ProposalWorkspace`. The workspace requires rates, modes, quality and activation readiness. `vendor-basket-proposal.service.ts` already supplies isolated resources, immutable snapshots, ownership, CAS, idempotency, transactional submission notifications and review/revision. Reuse that foundation. The older name-only vendor request contract cannot express this hierarchy.

Canonical Sub Basket storage currently has no description; proposal publication drops that metadata. Add nullable storage and carry it through reads/publication without rewriting existing records.

## Requested behavior and scope

1. Add Main Basket shows Main Basket name and description, Sub Basket name and description, and Main Line names. Begin with one Sub Basket and one Main Line; allow additional Main Line name rows within existing limits.
2. Add Sub Basket shows the selected Main Basket read-only, Sub Basket name and description, and Main Line names. With several selected parents, choose the target before opening the request. The stable parent ID is immutable for author and reviewer.
3. Requesters never configure prices, UOM, modes, recommendations, quality or masters in this new flow. Names/descriptions are saved together; submission requires the requested hierarchy, nonempty descriptions and at least one Main Line name.
4. Save draft and Send to Super Admin preserve values on validation/network errors. Uncertain retries reuse their command identity. A saved draft can reopen from My Requests.
5. Super Admin reviews the concise fields and can correct the review copy, then Submit or Send back with a required reason. Pending submissions remain immutable for the requester.
6. Successful review creates the approved Main/Sub Basket hierarchy and draft Main Lines atomically. Main Lines remain unpriced/incomplete drafts for Super Admin to configure through normal Configuration; ordinary activation and dispatch checks remain intact. Do not invent rates/default commercial values.
7. My Requests retains navigation, search, status/type filtering, pagination and history. New simple requests use Approved and Sent back labels; old full proposals retain their original activation/rejection meaning. Edit and resubmit creates a linked draft from the frozen submitted request, preserving original review history.
8. Preserve unsaved vendor fields/uploads and require explicit selection of newly approved baskets. Submitting this request does not save the vendor or change its classification automatically.

Non-goals: redesigning Configuration, changing vendor-client access, pricing, estimates, procurement issue rules, adding email, deleting old requests, converting historical proposals, production changes or database synchronization.

## Architecture and contract

Extend the existing proposal with immutable `requestMode: "hierarchy_intake"`; absent historical values retain full-configuration behavior. Reuse existing draft/pending/fulfilled/rejected persistence and linked revisions. Interpret rejected as Sent back only for this explicit mode; do not relabel old rejected history.

Use an additive structured intake payload with optional new Main Basket metadata, one Sub Basket metadata object, and Main Line name rows with optional existing resource IDs for edits. Existing-parent requests omit writable Main Basket metadata. Create stores the complete private hierarchy; an atomic versioned intake save updates it. Submitted/approved manifests remain immutable and digest checked. Include mode on proposal and request DTOs so consumers choose the correct form/labels.

An intake-specific validation/publication branch checks hierarchy completeness and creates draft Main Lines. Full proposals retain full activation validation. This is preferred to relaxing global readiness (unsafe activation) or retaining full requester Configuration (contrary to the simplified flow).

Add two intake-save operations, Procurement own-draft update and Super Admin review update, under existing permissions. Synchronize route registry, OpenAPI and contract tests. No new role grants. Reject attempts to add pricing/sections/quality/master content through intake, and preserve ordinary full-proposal endpoints for historical work.

## State, permissions and failure handling

- Procurement: own draft create/edit/submit; own submitted read; own sent-back revise/resubmit. Other requesters cannot access it.
- Sole active Super Admin: pending review edit, submit or send back; existing exact actor/permission guards remain authoritative.
- New vendor-client permissions: none.
- Draft -> pending -> fulfilled or rejected; rejected -> new linked draft -> new submission. Submission notifies Super Admin using the existing transactional notification. My Requests exposes send-back feedback; no email is introduced.
- Preserve proposal and request CAS, idempotency fingerprints, stable IDs, audit identity, active-parent checks, duplicate name checks and dependency fences. Concurrent decisions publish once. Failed publication creates no partial Configuration.
- New descriptions read as null for older Sub Baskets. No data rewrite or new index is expected. Existing target-aware index prerequisites remain; never modify live indexes automatically.
- Rollback must retain mode-aware readers for any stored intake requests. Previously approved drafts/history must not be deleted or treated as active configured Main Lines.

## Acceptance criteria

- AC1: Main and Sub entry forms contain exactly the required metadata and name inputs; Sub parent is read-only; full Configuration authoring is absent from new requests.
- AC2: Atomic save/submit supports draft reopen, validation, uncertain retries, missing/inactive parent, duplicate names and preserved vendor inputs.
- AC3: Super Admin can inspect/edit the review copy, submit or send back with reason. Ownership, stale versions, identity changes and concurrent decisions are enforced server-side.
- AC4: Approval persists both descriptions and draft Main Lines, preserves existing parents/siblings/quality, creates no price or active line, and retries safely. Existing full proposals still activate through their original validation.
- AC5: My Requests shows accurate mode-aware statuses, feedback, edit/resubmit, original history and catalogue refresh without automatic vendor selection.
- AC6: Focused replica/HTTP/UI tests, authorization/OpenAPI checks, both typechecks/builds, integrity review and responsive keyboard/browser checks pass or have explicitly classified limitations. No dependencies, external messages, live migration, deployment, seed, commit or push.

## Preservation and verification

Prior estimation implementation has 207 changed/new paths. Initial status and full tracked patch are captured in `/tmp/lisno-vendor-basket-request-redesign/`. Proposal/request feature files are initially clean; the primary owns already-dirty central route/test integration. Do not overwrite any prior changes.

Test two unequal parents and two requester identities; frozen submission/review differences; inactive parent and collision races; send-back/revision; failure rollback; legacy full proposal compatibility. Render new/edit/read-only/review/error states at 390, 768 and 1440 px using established tokens, keyboard labels and focus handling. Keep logs/screenshots outside tracked source.
