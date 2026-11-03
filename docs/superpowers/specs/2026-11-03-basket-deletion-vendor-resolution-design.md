# Resolve vendor assignments blocking basket deletion

Date: 2026-11-03
Status: Approved; implemented and verified locally
Classification: Substantial; vendor classification persistence, authorization, and deletion-race safeguards are affected.

## Goal and clarified intent

When a vendor assignment blocks deletion of a Main Basket or Sub-basket, identify the blocking vendor in the deletion popup and let the user open that vendor's details to reassign or remove the basket assignment. Returning to Configuration must show a fresh deletion impact.

The user explicitly clarified that “delete the vendor” means **reassign/remove its basket assignment**, not permanently delete the vendor record. The screenshot shows Main Basket deletion and the text also names Sub-basket deletion; both dialogs are in scope.

## Current behavior and evidence

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`, `BasketDeletionImpactSummary`, renders only `vendorReferenceCount` and a message to reassign classifications. It provides no vendor names or details navigation.
- `KnowledgeSubBasketDialogs.tsx` has the same count-only blocker. Both dialogs correctly disable permanent deletion while references remain.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts` counts both array fields (`mainBasketIds` / `subBasketIds`) and legacy primary fields (`mainBasketId` / `subBasketId`). There is no vendor-status filter, so active, inactive, and archived vendors can all block deletion.
- The existing vendor list API supports `mainBasketId`, `subBasketId`, `includeArchived`, and pagination. Its classification predicates match the deletion count predicates. It can identify blockers without returning complete private vendor profiles from the deletion-impact API.
- The established Super Admin vendor detail route is `/admin/procurement/vendors/:vendorId`, rendered by `VendorKpiStaffPage.tsx`. It includes vendor details and an Edit vendor action. The Procurement equivalent is `/procurement/vendors/:vendorId`.
- `ProcurementVendorEditor.tsx` and `VendorBasketFields.tsx` already support multi-selection of Main Baskets and Sub-baskets. However, the full-profile editor and backend generic update reject archived vendors.
- `backend/src/services/procurement-vendor-profile.ts` requires at least one Main Basket and one Sub-basket, validates parent/child membership, maintains the legacy primary pair, and coordinates selected-parent writes with basket deletion. Simply allowing empty arrays would make existing profile readers reject the profile.
- Archiving a vendor retains its classifications and does not resolve the deletion blocker. Archiving or deleting the vendor account is not a substitute for changing the assignment.
- `knowledgeMutationSync.ts`, `syncKnowledgeMasterMutation(..., "vendors")`, already invalidates vendor details/lists and Main Basket/Sub-basket deletion impacts.
- The current vendor detail page is gated by vendor-KPI read permission in addition to the separate directory permissions used for profile reads and writes. Navigation must honor the existing route gate; linking is not authorization.

Investigation was read-only. No live deletion or vendor mutation was attempted.

## Recommendation and alternatives

**Recommended:** Add a paginated list of blocking vendors to both deletion dialogs, link each stable vendor ID to the existing vendor details page, and provide an assignment-only correction action there. Use a narrow backend command for classification changes so archived vendors can be corrected without unlocking the rest of their archived profiles. Preserve the existing requirement for a valid remaining classification pair.

**Smaller alternative:** Add links and rely entirely on the existing full-profile editor. This is cheaper but leaves archived-vendor blockers unresolved and may require unrelated profile fields before saving a classification change. It does not fully satisfy the clarified request for resolving assigned-vendor blockers.

Creating a generally unclassified-vendor state or permanent vendor deletion is outside this change. Both would broaden contracts and downstream eligibility beyond the requested workflow.

## Product and UX requirements

1. For a nonzero vendor blocker count, show the blocking vendors' names, identifying codes, and statuses below the warning. Use IDs for every query and navigation action; duplicate names must remain distinguishable.
2. Read all retained statuses, including archived, using the existing filtered vendor-list endpoint. Main Basket lookup uses `mainBasketId`; Sub-basket lookup uses `subBasketId` so legacy records are not hidden by an additional parent filter. Use a bounded paginated list with explicit next/load-more controls.
3. Show loading, failed-load/retry, empty-after-change, and refreshing states. A failed or partial vendor-list fetch must never change the authoritative deletion count or enable deletion. If list and count no longer agree, require a fresh impact check.
4. Each permitted row offers **Open vendor details**. Navigation opens the exact vendor's established details page in the same tab and carries a typed return context containing the original Configuration route and basket/sub-basket IDs. Preserve existing unsaved-change guards for inline Configuration editors.
5. Vendor details offer **Manage basket assignments**, highlight the originating blocked basket when applicable, and reuse the established Main Basket/Sub-basket selection pattern. The user may choose replacement classifications or deselect the unwanted assignment.
6. Removing a Main Basket also removes its selected child assignments from the proposed selection. Removing a Sub-basket leaves unrelated parents and siblings unchanged. The user reviews the final selection before saving.
7. At least one valid Main Basket/Sub-basket pair must remain. When removing the final pair, explain that a replacement is required and disable Save until one is selected. Preserve other selections and normalize the primary pair using existing rules.
8. For archived vendors, allow only this narrow assignment correction to an authorized Super Admin. Keep the vendor archived; general profile editing, activation, KPI, contact, payment, file, and account changes remain unavailable through this action. Non-archived vendors retain the existing directory-update permission rules.
9. Include a required correction reason, save progress, validation messages, conflict recovery, and a cancel/discard path. An unsuccessful or uncertain save preserves the selection; do not imply that the blocker has been removed until the server confirms it.
10. Offer **Back to basket deletion** when entered from a blocker. Restore the original context and reopen a fresh impact preview only if the target still exists and the user still has access. Clear any prior typed confirmation; never carry authorization or an automatic delete command through navigation.
11. If return context is absent, malformed, or points outside allowed local Configuration routes, use the normal vendor navigation. No arbitrary redirect URLs or private data in query strings.
12. Refresh blockers and deletion impact after confirmed correction and on return. Do not automatically delete the basket even if the last blocker is removed. The user must review the updated impact and explicitly reconfirm the existing destructive action.
13. Preserve mobile readability, semantic links/buttons, focus handling, keyboard access, and existing dialog styling. Do not redesign unrelated Configuration or vendor screens.

## Data and API contract

Reuse the current vendor listing and detail APIs. Keep deletion-impact count fields and deletion APIs backward compatible.

Add an assignment-only command at `PATCH /admin/ai-estimator-knowledge/vendors/:id/classification` with a strict, bounded request containing:

- `expectedVersion`;
- complete selected `mainBasketIds` and `subBasketIds`;
- `reason`;
- `idempotencyKey`.

Reject unknown profile, status, financial, contact, or file fields. The server loads the current vendor and changes only the classification arrays, normalized legacy primary pair, normal version/update metadata, and the corresponding audit record. Other stored fields must be preserved exactly. Return a safe updated vendor summary suitable for existing cache synchronization; do not return private profile fields to catalog caches.

Requirements for the service:

- Reuse/extract the existing classification normalization and validation rules rather than duplicating them. Preserve legacy primary-only records, existing unavailable-reference handling, selection limits, stable ordering, and coherent parent/child membership.
- Newly assigned classifications must satisfy the existing active-parent/catalog rules. Existing retained classifications can remain according to current compatibility rules. Empty final classification is rejected explicitly.
- Authorize the operation on the backend, verify vendor version, and commit classification changes and audit atomically in a Mongo replica-set transaction.
- Preserve coordination with basket/Sub-basket deletion and concurrent profile updates. Use the established dependency locking protocol in deterministic order; deletion must not observe a new assignment without its corresponding protection.
- Persist/reuse an idempotent command result for uncertain retries. Replaying the same request must not duplicate audit events or overwrite later unrelated changes. A reused key with different input must fail.
- Audit the vendor ID, actor ID, correction reason, and old/new classification IDs. Do not copy unrelated personal, banking, file, or credential data into the new event.
- A missing vendor, stale version, invalid destination, lost permission, or deleted basket produces an explicit failure without a partial save. Re-read and review the current selection after conflicts; never auto-merge another user's classification removal.
- Keep route-operation authorization, runtime validation, OpenAPI, and frontend API types synchronized. No database schema migration or backfill is expected.

## Permission matrix

| Actor/access | Blocker details and navigation | Assignment correction |
| --- | --- | --- |
| Authorized Super Admin with Configuration and vendor read access | List retained vendors; open details when the destination route's permission is present | Requires directory update permission; archived correction additionally requires Configuration lifecycle authority and Super Admin identity |
| Authorized Procurement user | Existing directory/detail access only; no new Configuration deletion access | Existing directory update scope for non-archived vendors; no archived-profile override |
| Read-only vendor access | View permitted names/details | No save or mutation |
| Configuration deletion access without vendor read/detail access | Keep authoritative blocker count and explain unavailable access; do not fetch/disclose vendor details | No correction through hidden controls |
| Revoked/unauthenticated access | Clear or hide stale protected details and show access state | Backend denies and leaves data unchanged |

Frontend visibility follows backend operations and the existing route registry. No role gains a general permission expansion or a bypass of immutable Super Admin identity rules.

## Invariants and non-goals

- Preserve all deletion blockers, transaction behavior, deletion-impact tokens, reason/name confirmation, audit history, and race checks. An empty displayed list is never evidence that deletion is safe.
- No vendor-record deletion, vendor-account deletion, archive-as-unlink behavior, automatic basket deletion, bulk reassignment, or automatic replacement basket.
- Preserve historical estimates, approvals, purchase orders, issued artifacts, and financial values. Classification correction changes future/current catalog association only.
- Do not send invitations, KPI requests, messages, or other external communication as a side effect of opening details or correcting assignments.
- No broad vendor-profile redesign, unclassified-vendor state, dependency installation, migration execution, seed, deployment, commit, or push.

## Working-tree preservation

The previous approved In-house dropdown task has uncommitted changes in `KnowledgeInHouseComponents.tsx`, its tests, `KnowledgeItemWorkspacePage.tsx`, `KnowledgeModePanel.tsx`, and `KnowledgeScreens.test.tsx`, plus its specification and plan. Preserve that work. No implementation target in this specification is assigned or modified at this stage. Capture per-target diffs again before future implementation, particularly if shared files overlap.

## Risks, compatibility, and rollback

- Archived records currently reject all generic editing. Keep the new exception narrowly limited to classification correction and enforce the stronger archived permission branch server-side.
- Legacy primary fields can retain a blocker after array edits. Normalize both representations in the same transaction and test both storage forms.
- New vendor assignments can race deletion. Use the existing transactional lock order and test correction against deletion with a replica set; do not rely on UI refresh for integrity.
- Multiple rows/pages or duplicate vendor names can misdirect users. Preserve stable IDs, status labels, pagination, and exact detail response identity checks.
- Returning from vendor details can encounter renamed/deleted targets or changed permissions. Reload the target/impact and require fresh confirmation; fall back to the Configuration list when unavailable.
- No backfill is required. Reverting the frontend/command removes the new workflow; already-confirmed classification corrections remain audited normal catalog data and can be deliberately reassigned with the same validation.

## Acceptance criteria and verification

- **AC1:** Both Main Basket and Sub-basket deletion warnings list every matching retained vendor through pagination, including archived and legacy-field matches, with stable IDs and distinguishable duplicate names. Unrelated vendors do not appear.
- **AC2:** Open vendor details navigates to the exact permitted vendor. Returning restores the correct Configuration target, refreshes impact, and clears deletion confirmation. Malformed return context and unsaved-draft navigation are handled safely.
- **AC3:** A vendor with at least two unequal classification groups can remove/reassign the blocking group while retaining unrelated assignments. Arrays and primary pair stay coherent. Last-pair removal requires a replacement and produces an actionable validation state.
- **AC4:** Authorized Super Admin correction works for an archived vendor without changing its archived status or any other profile fields. Other actors cannot use the endpoint to edit archived profiles or inject non-classification fields.
- **AC5:** Correction uses CAS, idempotent retries, atomic audit, and current catalog validation. Replica-set tests cover simultaneous correction/profile updates and correction/deletion races without dangling newly assigned references.
- **AC6:** After a successful correction, vendor details/lists, the blocker list, and both applicable deletion impacts refresh. Failed refreshes remain explicit; deletion stays disabled until a verified current impact permits it. No automatic delete occurs.
- **AC7:** Frontend interaction tests cover denied access, load/pagination errors, archived read-only fields, pending-save/error/retry, cancel, focus, mobile layout, and return navigation. Backend tests cover operation permissions, strict schema validation, protected-field preservation, legacy normalization, and transactions.
- **AC8:** Run focused frontend/backend regression tests, both typechecks/builds, relevant authorization/OpenAPI checks, replica-set integration, desktop/mobile browser QA with synthetic data, and final diff/status hygiene. Record exact results and unrelated pre-existing failures; do not claim a fully green suite if it is not.

## Assumptions and approval boundary

The recommended design treats assignment correction for archived blockers as part of resolving “any assigned vendor,” while preserving the minimum-one-pair rule. The approval request covers this narrow exception and the details/return workflow. No further product choice is required under these assumptions.

The specification and separate task plan were approved, and the user selected Mode A. Implementation and integrity review are complete; final integrated verification is recorded in the task plan.
