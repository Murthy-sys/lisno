# Sub-Basket tier chips and margin notifications

Approved on 22 November 2026. This revision builds on the [Sub-Basket margin approval workflow](2026-11-22-sub-basket-tier-margin-approval-design.md). It changes how users reach the editor and which changes qualify for a notification. The [implementation plan](../plans/2026-11-22-sub-basket-tier-chips-margin-notifications.md) covers execution and verification.

## Goal

In Configuration → Main Basket → Sub-Basket, show the three tiers as compact, light-coloured chips alongside the Sub-Basket name, as in the supplied screenshot. Selecting a chip opens that tier’s margins in a side panel for editing and saving. A bell on the same row gives Super Admin a count of saved manual margin changes awaiting review in that Sub-Basket.

## Current behaviour and evidence

| Area | Current behaviour in the worktree |
| --- | --- |
| Header | `KnowledgeBaseIndexPage.tsx` puts `KnowledgeSubBasketMargins` in the Sub-Basket header. `KnowledgeMarginMatrix.tsx` renders a table, a separate edit action and a text exception counter. Selecting a tier opens a comparison panel. |
| Editor | `KnowledgeMarginDecisionPanel.tsx` already supports preview, multi-tier saves, exception approval and refresh recovery. Its editor always starts on Signature. `KnowledgeSubBasketMargins.tsx` also provides the existing Signature restore action. |
| Notifications | `buildMarginMatrix` in `backend/src/domain/ai-estimator-knowledge-margin-matrix.ts` adds every complete differing margin to `exceptions`. A saved difference can exist on a legacy or copied line even if nobody edited its margin controls. The header, Main Line pending message and approval service consume this list. |
| Evidence of an edit | `updateSectionInSession` in `backend/src/services/ai-estimator-knowledge-item.service.ts` already records some before/after margin values in `manualMarginChanges`. Today it compares projected tier payloads, including applicability. A whole-section change or a projection becoming available is insufficient by itself to prove an individual margin field was edited. |

## Header and side panel

- Use the reference’s order and hierarchy. Place the disclosure and Sub-Basket name at the start of the row. Group **Signature**, **Premium** and **Functional** to the right, followed by the exception bell. Keep rename and other existing row actions reachable. Each chip and the bell operate independently from the tree disclosure, including when the Main Line list is collapsed.
- Use light chip fills, dark text, and simple crown, diamond and layers outlines for tier recognition. Give the open tier a stronger border and light tint. Honour the requested light treatment even for the selected chip. Move the full percentages and component details into the panel. At narrow widths the chips and bell may wrap beneath the name in the same order.
- Selecting **Premium** opens a right-hand panel on **Premium** immediately. Show the saved PMC and Sub-vendor minimum/maximum pairs and In-house Labour and Material minimum/starting pairs, labelled by component. Show missing values explicitly. An authorized Super Admin can edit, review the affected lines, and save in that panel. Users with existing read-only access can inspect the same values.
- Keep the other tiers accessible inside the panel so a user can still edit several tiers and save the reviewed set together. Keep unsaved entries when changing tiers inside the panel. Preserve the existing confirmation on closing a dirty panel and access to comparisons, configuration issues and Signature restore as secondary actions.
- Use a bell with a numeric badge for a positive count. At a confirmed zero show the quiet bell without a badge and give it an accessible empty state. While loading or on failure, distinguish an unknown count from zero and offer retry on failure. Opening the bell lists only the current Sub-Basket’s pending edits with Main Line, tier, mode/component, default and proposed range. Approval previews the affected lines and competing values before confirmation.
- Use buttons with dialog semantics for the header chips. Inside the panel, expose the selected tier to assistive technology. Support keyboard activation, visible focus, focus containment, Escape and return to the initiating chip or bell. Keep labels and save controls reachable at 390 px.

## What counts as one exception

A notification requires **both** a successful manual save changing a margin percentage on a Main Line and a current, valid saved value for that scope that differs from its Sub-Basket default. Use stable Main Line, Sub-Basket, tier, mode and applicable component IDs. The unit of the badge is one pending item per Main Line and margin scope. Changing both bounds of a pair, or editing the same scope repeatedly, counts once. An unsaved edit has no effect.

| Action | Expected bell behaviour |
| --- | --- |
| Save Premium Sub-vendor maximum from 30% to 35% on one Main Line | Show one exception for that line and scope. A subsequent edit to 40% updates its proposed value and keeps the count at one. |
| Save a description, base rate, UOM, quantity, cost or other non-margin setting | Preserve the current count, including when the line already differs from the default. |
| Copy a line, initialize a tier, toggle applicability or add/remove/reorder components without editing margin fields | These operations alone create zero notifications. A real margin edit made in the same save is tracked for its own scope. Missing or invalid settings belong under configuration issues. |
| Revert a pending margin to its default, or approve/apply a default that resolves it | Clear the resolved item. Preserve pending edits in other scopes and Sub-Baskets. Bulk propagation creates zero new notifications. |
| Read a legacy mismatch or encounter an incomplete configuration | Allow inspection in the tier panel. Include a historical difference in the bell only when reliable saved manual-margin evidence identifies the still-pending edit. Reading the list performs no writes. |

## Data, compatibility and risks

- The backend owns pending status. Track manual changes to the individual numeric margin fields, using integer basis points and stable component identity. Record or resolve their evidence in the same transaction as the successful save or bulk decision. A description, cost, applicability or revision change alone must never be interpreted as a margin edit. If a save path generates default percentages incidentally, distinguish them from explicit margin edits server-side. An editor hint, when needed, must be checked against persisted before/after field values.
- Use one eligibility rule for the bell, Main Line pending message, review list and approval endpoint. Keep ordinary saved differences available to the comparison and impact previews, including an unflagged difference a direct save would overwrite. A reviewer must see the actual impact. Stale approvals, out-of-scope candidates and previous resolved edits cannot be promoted.
- Preserve draft-first reads, immutable active and issued history, exact reviewed scope, audit records, retry receipts and the stored Super Admin permission checks. Approval continues to update only the matching tier, mode and component on eligible Main Lines in this Sub-Basket.
- A presentation-only count filtered in React would leave the approval endpoint accepting unproven candidates. Prefer applying the eligibility rule in the backend projection and rechecking it at commit. Preserve the existing read and decision routes and compatibility for existing callers. Use batched reads over the Sub-Basket. Exclude per-line audit requests and historical backfills from the design.
- The bell is local to the Sub-Basket. Global notifications, email, mobile-native layout changes, pricing formulas, live data changes and deployment are outside this revision.

## Acceptance and verification

1. At 1440, 768 and 390 px, verify the screenshot’s chip order and compact hierarchy, independent row disclosure and readable light styling. Activate each chip and confirm the named tier opens directly. Exercise keyboard focus and close behaviour.
2. Edit Premium in the panel, review and save, reopen it, and compare persisted values on the source and a sibling. Exercise a multi-tier save, read-only access, stale review and retry after a failed refresh.
3. With two Sub-Baskets, use distinct tier values and include a copied or legacy mismatch. Compare the count after a margin-only edit, a non-margin edit, a combined edit, a repeated edit, an unsaved change, a component reorder, and a revert. The badge, review list, Main Line status and server approval eligibility must agree.
4. Approve one pending edit. Confirm the matching scope on eligible siblings, disclosure of overwritten values and the exact remaining count across both Sub-Baskets. Check rollback, replay and overlapping updates on a Mongo replica set. Cleared or unproven candidates cannot create an approval audit.
5. Verify loading, unavailable and zero-count states, long Sub-Basket names, focus return after the final exception clears and narrow-screen overflow. Recheck the existing Signature restore and unknown/incompatible configuration flows.

The assumptions for approval are that the bell totals all three tiers in one Sub-Basket, a confirmed zero uses an unbadged bell, and older differences without reliable edit evidence stay available in comparison. There are no outstanding product decisions beyond approval of this design.
