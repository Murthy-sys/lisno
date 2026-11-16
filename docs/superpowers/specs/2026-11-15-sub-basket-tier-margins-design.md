# Sub-Basket margins by tier

Date: 2026-11-15
Status: Revised presentation approved and implemented; previous tier-data implementation retained

## Goal and recommended approach

Show only **Signature | Premium | Functional** as three clickable names in one compact Sub-Basket header row. Clicking a tier opens its margins. Keep the Sub-Basket name and existing rename action; replace the Delete text button with an icon. Remove other header text and margin rows to use the available space efficiently.

The user explicitly confirmed: “Only tier names; click to view margins.” This revision changes presentation only and retains the implemented tier-scoped reads, cache handling, financial calculations, and mutation guards.

## Current behavior and evidence

- `KnowledgeBaseIndexPage.tsx` renders `KnowledgeSubBasketMargins` in each Sub-Basket header. Loading is enabled when the parent Main Basket is expanded.
- The implementation from the preceding approved stages now renders three stacked tier rows, each showing PMC/Sub-vendor/In-house values, under “Configured margins.” The user's screenshot and feedback identify this header height and extra text as the remaining issue.
- `KnowledgeSubBasketMargins.tsx` already makes independent explicit tier reads and opens tier-qualified comparison panels. The shared query-key helper preserves the base Signature key and adds a tier suffix for other scopes; retain this work.
- `KnowledgeBasketCard.tsx` currently adds a Sub-Basket eyebrow and item count. `KnowledgeBaseIndexPage.tsx` renders the Sub-Basket's text Delete button with existing permission checks, target selection, focus restoration, and confirmation flow. An existing trash icon is already available in that module.
- The unscoped backend read resolves **Signature**. `getSubBasketMargins` in `backend/src/services/ai-estimator-knowledge-item.service.ts` defaults to `"signature"`.
- `readSubBasketMarginSnapshot` selects the first non-archived Main Line by display order/stable ID, uses its latest saved draft when available or active revision otherwise, and projects the requested tier. It compares all eligible saved Main Lines, including those outside the visible page. Existing backend tests cover unequal tier values and missing-tier behavior without fallback.
- The existing apply endpoint has no tier parameter and applies Signature only. Its reviewed version token, authorization, and conflict handling must remain unchanged.

## Presentation and interaction requirements

1. Render **Signature | Premium | Functional** in that order on one horizontal line. Each name is a keyboard-accessible button; separators are decorative. Show no “Configured margins” heading, default Mode row, inline margin values, mismatch badges, repeated mode labels, or separate tier rows/cards in the header.
2. Fetch each tier explicitly. Keep cached values, loading, error/retry, mismatch counts, and opened comparison details tied to the correct basket, Sub-Basket, tier, and margin type. A slow or failed tier must not borrow another tier's values or prevent the other tiers from displaying.
3. Reuse existing percentage formatting: PMC/Sub-vendor show minimum/maximum; In-house keeps minimum/starting gross margin and distinct Labour/Material or component context where needed. Do not average margins, alter basis points, or calculate financial values in the browser.
4. Show loading, **Not set**, and failed-read feedback with a scoped retry inside the selected tier's panel. Keep the tier names available while data loads or fails so those states can be inspected without adding header text. Never substitute default Mode, Signature, another Main Line, or another revision to fill a missing value.
5. Clicking a tier opens its existing comparison panel, initially showing PMC, with compact PMC / Sub-vendor / In-house controls inside the panel. Switching a mode shows that tier's existing source/range/mismatch details. Include the tier and selected mode in dialog titles and accessible names. Preserve keyboard access, focus return to the originating tier name, readable mobile controls, and no horizontal page overflow. Opening a tier must not toggle the parent Sub-Basket disclosure.
6. Preserve the existing Signature apply-default action and all its guards. Premium and Functional comparisons are inspection-only in this change because their bulk write is not supported by the current API. Do not send their tokens to the Signature apply endpoint. Explain the absence of an apply action briefly in those detail panels.
7. Opening, switching, or inspecting tier summaries must never write data. Parent read-only restrictions remain authoritative. Preserve existing success, error, stale-comparison, and refresh feedback for the Signature operation.
8. Keep the existing query enablement boundary. Reuse TanStack caching and the established tier keys so the Sub-Basket header and Main Line defaults agree and current invalidation continues to refresh every affected tier.
9. Keep the actual Sub-Basket name, disclosure, rename icon, and authorized delete action. Remove its “Sub-Basket” eyebrow and “items on this page” badge from this header only; Main Basket and direct-item headers retain their current presentation. Replace the visible Delete label with the existing trash icon and an accessible name identifying the Sub-Basket. Preserve the confirmation dialog, authorization conditions, event handling, and focus restoration exactly.
10. Reuse existing colors, typography, spacing tokens, focus treatment, and icon styling. Keep name, tier links, and actions on one compact row where space permits. On narrow screens, allow the tier group to move together to the next line, keeping its three names horizontal and without horizontal page overflow. Do not add dependencies or a visual redesign.

## Scope, assumptions, and invariants

Expected revision areas are `KnowledgeSubBasketMargins.tsx`, its scoped stylesheet and tests, plus the Sub-Basket header/action integration in `KnowledgeBaseIndexPage.tsx` and `KnowledgeBasketCard.tsx` with narrowly affected rendered tests/styles. Reuse the completed query-key/default-consumer/cache work without redesigning it. Preserve previous dirty work, including the completed room and Mode layout changes.

No backend contract, persistence, margin formula, approved estimate, publication, authorization, migration, dependency, or pricing change is proposed. This does not extend financial bulk editing to additional tiers. The minimal-header requirement applies to the Sub-Basket header; necessary values, status, explanations, and confirmation text remain inside their panels. No product decision remains open under this display-only scope.

Primary risks are cross-tier cache reuse, misleading missing values, incorrect comparison context, and accidental use of a non-Signature token for a Signature mutation. Explicit tier keys/context and asymmetric fixtures address these. Existing read permissions cover the requested summaries; no additional access is introduced. Rollback is a frontend revert with no stored-data impact.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | The compact header contains the Sub-Basket name, horizontal Signature/Premium/Functional links, and permitted action icons; it has no other visible labels, count badge, margin values, or stacked tier rows. | Rendered header assertions and desktop/mobile inspection. |
| AC2 | Missing/loading/error tiers remain isolated and retry correctly; first-line source and stable IDs remain accurate. | Independent delayed/error/empty responses and two distinct Sub-Baskets; no cross-tier or cross-basket fallback. |
| AC3 | Clicking each tier opens its own margins; switching PMC/Sub-vendor/In-house keeps that tier's values and mismatch context. Only the existing authorized Signature action can write. | Interaction tests with unequal tier/mode values, exact request/token, and no Premium/Functional or read-only mutation. |
| AC4 | Saved changes invalidate applicable cached summaries without corrupting another tier. | Focused query/cache regression using existing Main Line defaults and mutation invalidation. |
| AC5 | Styling, keyboard/focus, accessible names, responsive layout, and unrelated work are preserved. | Focused frontend suites, typecheck/build, rendered accessibility checks, and `git diff --check`. |
| AC6 | Delete is icon-only with an accessible Sub-Basket-specific name; existing permissions, confirmation, target, and focus return are unchanged. Other basket header variants retain their presentation. | Focused index/header interaction checks; no real deletion during browser QA. |

Use focused frontend verification and reuse the preceding verification evidence for unchanged query/cache behavior. Backend tests need expansion only if implementation evidence requires a backend change, which would first require revising this scope. No live data, seed, deployment, commit, or push is included. This stage revises only the specification; after approval, revise the existing plan for this bounded presentation change and follow the repository execution-choice gate.
