# In-house component basket dropdowns

Date: 2026-11-03
Status: Approved by the user on 2026-11-03
Scope: Configuration > Main Basket > Sub Basket > Main Line > Modes > In-house > Add component

## Goal

List every available Configuration Main Basket in the Add component Main basket dropdown. Selecting a Main Basket must list its Sub-baskets. Retain existing Main Basket and Sub-basket request functionality and approval requirements.

## Current behavior and evidence

The initial working tree was clean. This investigation inspected current source and tests; the reported behavior has not yet been reproduced in a running browser.

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx` loads the Main Basket relationship catalog through `collectAllKnowledgeMasterPages`, then passes it through `KnowledgeModePanel` to `KnowledgeInHouseComponents`. The catalog already follows all pages and is not limited to the current Main Line's basket.
- `KnowledgeInHouseComponents.tsx`, in `AddInHouseComponent`, filters that catalog with `basket.status === "active"`. This excludes inactive Main Baskets even when the catalog returns them.
- `backend/src/services/ai-estimator-knowledge-reference.service.ts` defaults Main Basket listing to non-archived records. Sub-basket listing accepts any non-archived parent and filters children by stable parent ID.
- `backend/src/services/ai-estimator-knowledge-item.service.ts`, in component reference validation, accepts non-archived Main Baskets and requires the selected Sub-basket to belong to that basket. The picker is therefore more restrictive than the save contract.
- The picker already loads Sub-baskets through `dataSource.getSubBasketCatalog(basketId)`, clears its child selection when the parent changes, prevents duplicate component pairs, and saves stable IDs. The live data source follows all Sub-basket pages.
- Sub-basket loading/error/retry states exist. Main Basket loading/error/retry state is not currently passed into this picker; an unavailable parent catalog can appear as an empty list.
- The picker contains `Request a missing Sub-basket`, using `KnowledgeSubBasketRequestPanel`. Requests remain pending until approval and do not create a component. The backend requires an active parent for a new Sub-basket request.
- Existing Main Basket requests use `frontend/src/features/procurement/VendorBasketRequestDialog.tsx`; Configuration reviews Main Basket and Sub-basket requests through `KnowledgeBasketRequestReview`. There is no Main Basket request button in the current Add component dialog.
- The shared editor is also used with proposal-scoped data sources. Those must retain their own catalog scope and must not fetch the live Configuration catalog implicitly.

## Recommended behavior

Use the existing complete Configuration catalog and align the live In-house picker with the existing non-archived component-reference contract. Keep the dependent Sub-basket lookup and request workflows. No new API, persistence model, or dependency is needed.

### Requirements

1. Show all non-archived Main Baskets returned to the authorized Configuration user, including inactive baskets and baskets outside the current Main Line's parent. Include baskets without Sub-baskets or Main Lines. Do not derive options from existing components, vendor mappings, or populated Main Lines.
2. Keep archived/deleted baskets unavailable for new component selection. Make inactive status understandable without changing the saved name or identity.
3. Populate Sub-baskets only from the selected Main Basket's catalog, across all pages. Use stable IDs for lookup, display resolution, duplicate detection, and save payloads.
4. On parent change or clearing, reset the Sub-basket selection and old request feedback. A late response for another parent must not populate the current list or enable Save. Do not display perpetual loading when no parent is selected.
5. Show clear Main Basket and Sub-basket loading, empty, refresh-failure, and retry states. Preserve existing component values when catalogs fail. Permit saving only with a valid current parent/child pair and usable catalog state.
6. Preserve Main Basket request entry points and their existing review/approval flow. Preserve the missing Sub-basket request action for authorized users under an active selected parent, including validation, idempotent retries, pending/rejected/approved feedback, and refresh after approval.
7. Selecting an inactive Main Basket may use its existing Sub-baskets, but must not bypass the active-parent rule for requesting a new one. Explain the restriction beside an unavailable request action. Do not change basket activation as a side effect.
8. Pending or rejected requests must not appear as selectable catalog records. Submitting a request must not save a component or discard valid pending Mode changes.
9. Preserve component save/retry identity, duplicate protection, legacy settings, labour/material calculations, inclusion/exclusion values, Mode-tier isolation, read-only behavior, and proposal data-source isolation.
10. Retain the existing dialog design, accessible field labels, keyboard interaction, focus restoration, and mobile layout. This is a functionality correction, not a redesign.

## Assumptions and open decisions

- “All available” means all non-archived Configuration Main Baskets, consistent with the existing read and component-save contracts. It does not mean archived baskets or unapproved requests.
- “Retain request functionality” means preserving existing request entry points and behavior. Adding a new Main Basket request entry point inside this dialog is outside this change.
- Apply the correction across Configuration Mode tiers that expose the same In-house component editor. Do not broaden proposal users' catalog access or change proposal-specific eligibility rules.
- No additional product decision is needed under these assumptions. Specification approval confirms this interpretation.

## Scope and non-goals

Expected affected areas are the Configuration workspace's catalog-state wiring, Mode panel props, component picker, and focused interaction tests. Reuse existing catalog pagination, query keys, request panels, and API calls.

No changes to backend authorization, request approval policy, financial formulas, catalog lifecycle, persisted schema, approved/published artifacts, vendor dispatch, or mobile-native screens. No migration, seed, commit, push, deployment, or external communication is part of this work.

## Data, API, and UX impacts

- Component payload remains `{ id, basketId, subBasketId, inclusions, exclusions, labor, material }` with the existing validation and save orchestration.
- Catalog queries remain scoped by their current data source and stable basket ID. Reuse the paginated catalog already loaded by Configuration; avoid creating a second conflicting source of truth.
- Existing request endpoints, permissions, notifications, approval history, and idempotency remain authoritative. Only approved catalog records become selectable after a successful refresh.
- No backend mutation occurs merely by selecting a basket. Saving continues to save the component and valid pending Mode changes through the established operation.

## Risks and safeguards

- Inactive parents support component references but cannot receive new Sub-basket requests. Preserve this distinction explicitly in the UI and regression coverage.
- Broadening a shared picker could affect proposal consumers. Limit Configuration-specific eligibility/state changes to the authorized live Configuration context and test scoped consumers.
- Empty/error catalogs and rapid parent switching can produce invalid selections. Clear dependent selection, display errors, and keep Save disabled until the current pair is verified.
- A catalog entry may change after it is loaded. Backend validation remains authoritative; failures retain pending input and offer the established retry/refresh behavior.

## Acceptance criteria and verification

- **AC1:** An unrelated active basket and an inactive basket both appear alongside the current basket; an archived basket does not. Baskets with no Main Lines remain listed. Verify with asymmetric catalog fixtures and a rendered picker interaction test.
- **AC2:** Every selected Main Basket displays only its own Sub-baskets, including records on later pages. Switching or clearing the parent clears the child; delayed prior-parent responses never enable an invalid save. Verify through dependent-select interaction and catalog pagination tests.
- **AC3:** A valid component under another non-archived basket saves the exact parent/child IDs. Existing duplicate protection, legacy values, Mode-tier separation, and retry identity remain intact. Verify with focused component and Mode panel tests.
- **AC4:** Both catalog levels expose usable loading, empty, failure, refresh, and retry states without discarding pending settings or allowing invalid saves. Verify rendered states and recovery.
- **AC5:** Authorized users can still request a missing Sub-basket under an active parent; pending/rejected requests do not become components; approval refresh permits selection. Inactive parents cannot submit new Sub-basket requests. Existing Main Basket request/review tests remain green.
- **AC6:** Read-only and proposal-scoped consumers retain their permission and data boundaries. Verify existing scoped-source tests and a focused regression for Configuration-only eligibility.
- **AC7:** Check the rendered dialog on desktop and mobile widths, field names, keyboard selection, focus restoration, and relevant console/network behavior. Run frontend typecheck, focused regression tests, and production build; run `git diff --check` and inspect final status. There is no repository lint script.

Implementation and verification follow only after the separate task-plan and execution-mode gates. No behavior-changing code has been modified at this stage.
