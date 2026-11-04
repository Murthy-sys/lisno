# Estimation: selected items and inline recommendations

Date: 2026-11-04

Status: Approved and implemented in Mode A. Scoped verification finished; results and live-backend limitations are recorded in the separate implementation plan.

## Goal

Keep estimation focused on the items actually selected for the project. Choosing Main Baskets must not fill the estimate with every available item. Replace the recommendation popup and oversized actions with compact inline recommendations containing only configured Non-Negotiable Additions. Client, Sales/Estimation and Designer can remove recommended items wherever they can edit the current estimate.

## Current behavior and evidence

The worktree was clean at the start of this investigation. Findings are from current code, not historical plans or screenshots.

- `frontend/src/features/leads/configuredEstimate.ts`, `buildConfiguredLines`: creates an unchecked draft row for every catalogue item in every selected basket and room. Basket selection does **not** itself include those rows in the financial total, but it creates the large list the user sees.
- `ConfiguredEstimateBuilder.tsx` and `useConfiguredEstimateViewState.ts`: the default By Section view renders unchecked rows alongside included items. Selected view filters them. Empty groups also occupy space.
- `LeadEstimateWorkspace.tsx`: selecting an item queues automatic recommendation opening. Closing an unanswered automatic popup can deselect the newly selected source items. Explicitly adding a recommended target rebuilds catalogue rows for its basket across rooms.
- `EstimatorRecommendations.tsx` presents mandatory and probable additions in a modal with individual review actions. `roomRecommendations.ts` expands configured Sub Basket targets into their children and deduplicates line targets.
- `shared/knowledge/knowledgeRecommendationPresentation.ts` identifies Non-Negotiable Additions as `trigger: added`, `action: add`, `requirement: must`. Optional/probable additions use `requirement: can`.
- `ClientQuotation.tsx` mixes saved rows, excluded rows and fetched candidates into the builder; it also has a separate Add quotation item dialog. It does not consume the staff recommendation flow.
- `backend/src/routes/estimates.ts` retains recommendation origins and excludes recommendation-only dependents when their last included source disappears. It permits an explicitly excluded recommended row even while its source remains included.
- The staff recommendation endpoint uses `estimation.catalogue.read`. Client quotation reads use project-scoped authorization and filtered Configuration sources. Giving Clients the unrestricted staff endpoint would violate that boundary.

## Scope and decisions

Apply to the editable configured estimate builder used by Sales/Estimation and Designer, and the Client quotation editor. Reuse the existing estimation shell, item controls, rooms, configuration setup and save APIs. Keep the same interaction pattern across roles, with backend permissions controlling available items and actions.

### 1. Separate project selections from available items

- The main estimate displays included project items, grouped by room, Main Basket and Sub Basket. It does not show every unchecked catalogue row.
- Keep room navigation and property/bedroom/Main Basket setup available. A basket with no included items remains selectable in setup/navigation; it does not produce a stack of empty item sections.
- One compact **Add items** control opens an inline picker within the workspace. No modal is required to browse or choose ordinary items.
- The picker is scoped to the active room and selected Main Baskets, with search and basket/Sub Basket filtering. Display at most 20 results per page, with explicit pagination. Search covers the eligible catalogue, not just the currently displayed page.
- Each picker result shows the item name, identifying basket/Sub Basket information and a small Add control. After adding, the normal estimate row provides quantity, dimensions, tier, mode and configured pricing controls as applicable. Selecting one item must not include its siblings or copies in other rooms.
- Previously excluded saved rows remain recoverable through the picker and retain their saved identity and choices. Preserve unavailable included saved lines with an explicit review state; filtering must never silently delete saved scope.
- Catalogue data and project drafts remain separate. Avoid creating a complete room-by-catalogue set of editable draft rows merely to browse available items. Retain selected, persisted and deliberately edited draft state.

### 2. Replace recommendation popups with an inline section

- Show a compact **Non-negotiable recommendations** disclosure for the active room, with a count and short rows containing item name, the selected source item and Add/Remove state. Expand it when relevant pending suggestions first arrive, without moving focus or opening an overlay. Keep long lists paginated at 20 rows.
- Only current configured `added` / `add` / `must` rules contribute recommendations. Exclude probable additions, exclusions and miscellaneous guidance from this recommendation UI. Retain those rules in Configuration and other existing consumers.
- Only included source items in the active room trigger recommendations. Basket selection alone does not trigger all the basket's items.
- Deduplicate by stable target identity within the room. Multiple source items can refer to one recommended item without duplicating its estimate row.
- A configured non-negotiable Sub Basket target remains an explicit rule: its eligible children may be recommended, in bounded pages. Merely selecting a Main Basket is not such a rule. Nothing is bulk-added automatically.
- Adding a recommendation is an explicit action. Add only the chosen target in the current room. If it needs another permitted Main Basket, include that basket through existing validated setup behavior, without adding sibling items or other rooms. Where current setup permissions or dependencies prevent this, explain the required setup action inline.
- Closing the disclosure, leaving suggestions unanswered, changing rooms or a recommendation request failing must never uncheck an independently selected source item.
- When no recommendations apply, omit the section. Loading, unavailable, error and stale states use compact inline text and an accessible retry/refresh action; do not treat failures as an empty successful result.

### 3. Removal and saved state

- A selected recommended item has the same Remove capability as an ordinary editable item, including removal through its Sub Basket or Main Basket scope. The word non-negotiable is its configured recommendation category, not an enforced selection lock.
- Removal excludes the item from the current estimate; it does not delete shared Configuration or approved history. For an unsaved addition, remove it from the pending selection. For a persisted line, retain the existing stable ID/exclusion semantics.
- Removing a recommended target does not remove its source. Preserve existing same-room dependency cleanup when a source itself is removed, including shared-source and independently selected-item behavior.
- Removed items remain excluded after Save, reopen, Configuration refresh and another role loading the saved estimate. They may remain available as unchecked suggestions while a triggering source is selected, but are never automatically reinserted.
- Reuse current group-removal safeguards and unsaved-navigation handling. This change removes recommendation and ordinary item-picker popups; it does not remove consequential group-removal or unsaved-change confirmation safeguards.

## Data, API and authorization

Use current Configuration revisions by stable Main Line ID: latest saved draft where present, otherwise saved active. Preserve revision/version validation, configured availability, dimensions, modes, tiers and paise calculations.

Provide a project-scoped quotation recommendation read alongside the existing quotation endpoints. Reuse the current rule resolver with a safe projection instead of duplicating rule interpretation or granting Clients staff catalogue access. Bound source IDs and pagination, validate project/room/estimate context and current source identities, and support eligible unsaved selections supplied by the editor. Reading draft recommendations must not persist changes.

Return only authorized targets and visible sources. Client responses must not expose hidden item IDs, names, counts, pricing, internal rule payloads or reasons referencing hidden sources. Use visible source/target names for Client relationship text. Keep the canonical route-operation registry, runtime validation, OpenAPI shapes and frontend contracts synchronized.

| Actor/state | Behavior |
| --- | --- |
| Sales/Estimation editor | Add/remove eligible items and non-negotiable recommendations within current estimate permissions. |
| Assigned Designer editor | Same interaction through the existing editable staff workspace and permitted phase. |
| Client editor | Same interaction for Configuration-visible, currently editable items in their authorized project. Hidden scope is preserved. |
| Read-only, historical or closed estimate | No new mutation rights; retain view access under existing rules. |

Use existing save transactions and version/CAS checks. Recommendations are draft editing aids and do not change approval policy. Client pre-design edits still need Sales confirmation before Client approval. Preserve phase-specific Designer confirmation, immutable submitted/approved snapshots, audit identity, pricing and publication behavior.

Query identities must include relevant project, actor/session, estimate version, room and source identities. Changing rooms/projects, saving, refreshing Configuration or receiving a newer estimate must not reuse another context's recommendations. Invalidate affected quotation, setup, candidate and recommendation data after successful mutations. Keep unsaved edits on failures and require reconciliation after conflicts or unknown save outcomes.

## UX and accessibility

Use the existing compact, full-width design and shared item controls. Avoid extra banners, large action cards or a second review workflow. At desktop widths, keep room navigation beside the selected-item workspace. At mobile widths, stack the navigation, picker and item rows without horizontal page overflow. Use native buttons/disclosures with descriptive accessible names, visible keyboard focus and status announcements. Opening suggestions must not steal focus; removing a focused row must leave focus at a predictable adjacent control.

## Assumptions and non-goals

- “Estimation/design” means the existing authorized Sales/Estimation and Designer editors, not a new role.
- Recommendations are offered for explicit selection. They are not automatically added. Approval of this specification confirms that default.
- No persistent dismissal history is needed: saved inclusion/exclusion is authoritative; an eligible unchecked suggestion may remain available to add again.
- No change to shared Configuration authoring, other application pages, financial formulas, existing source-unavailable safeguards, approval eligibility or historical documents. No dependency or database migration is expected.
- The application backend remains stopped. The user starts it manually. Browser verification must use a user-started instance or a clearly identified isolated frontend fixture; do not claim live backend validation from fixture checks.

## Risks and failure handling

The primary risks are losing excluded saved rows while separating the picker, changing recommendation-origin cleanup, exposing staff-only Configuration through Client recommendations, and stale responses modifying the wrong room. Cover these explicitly with asymmetric room/project/visibility fixtures. Large catalogue fixtures must verify bounded rendered rows and no automatic draft fan-out. Unavailable sources remain explicit; there is no fallback to an older revision or different line.

No live data changes, seeds, backfills, commits, deployments or external messages are part of this work. Existing stored estimates require no conversion. Reverting the scoped code changes restores the prior UI while retaining compatible saved data.

## Acceptance criteria and verification

1. Selecting a Main Basket with 1,000 available items creates no included estimate items and no wall of item rows. Opening Add items shows at most 20 results; search finds an item beyond the first page.
2. Adding an item affects only its selected room. Property type, bedroom count, room selection, Main Basket selection and existing mode/tier controls remain usable across supported editor roles.
3. Only configured non-negotiable additions appear inline. Probable, exclusion and other rules do not appear there. No recommendation modal or automatic focus movement occurs.
4. Ignoring/collapsing recommendations or a failed request leaves the selected source unchanged. Cross-room and duplicate-source cases do not create duplicate targets.
5. Client, Sales/Estimation and Designer can remove an editable recommended item while retaining its source. Save/reload preserves exclusion and allows deliberate re-addition. Existing same-room origin cleanup and independently selected items remain correct.
6. Removing a Sub Basket/Main Basket affects only its intended editable scope; Client-hidden lines and other rooms/projects remain intact. Existing unavailable saved-line safeguards remain visible.
7. Client recommendation reads and writes reject unauthorized projects and stale versions, expose no hidden targets/source metadata, and honor current Configuration visibility. Client changes still require the configured staff confirmation before approval.
8. Keyboard interaction and focus recovery work at 390, 768 and 1440 pixel widths. Empty, loading, unavailable, error, stale and read-only states are rendered and checked.
9. Run focused recommendation, configured-estimate, Client quotation and authorization/contract regressions, plus replica-set tests for any changed transactional paths. Run frontend/backend typecheck and affected builds, and `git diff --check`. Report exact results and any unrun/live-only checks; broaden tests only where changed shared contracts justify it.

## Open decisions

No blocking product question remains under the explicit-selection and removable-item defaults above. The approved [implementation plan](../plans/2026-11-04-estimation-inline-recommendations.md) records final implementation and verification evidence.
