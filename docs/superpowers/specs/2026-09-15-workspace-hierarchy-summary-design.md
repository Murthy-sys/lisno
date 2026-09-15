# Main Line workspace saved-configuration summary

Status: independent scrolling implemented and verified after specification/task-plan approval and execution mode A selection. Earlier saved-content requirements remain in force. Final evidence is recorded in the task plan.

## Goal and confirmed interpretation

Keep the Main Basket, Sub-Basket and Main Line hierarchy at the top of Quick summary, then summarize saved data from **Overview**, **Mode**, **Recommendation & Exclusions**, and **Quality Parameters**. The summary concerns the current Main Line, not every Main Line in its Basket. The user explicitly clarified that hierarchy names alone are insufficient.

Use the saved data of the revision currently displayed in the workspace: the saved Draft when a Draft exists, otherwise the active revision. Unsaved editor buffers and simulator inputs/results do not belong in this summary. Quality remains the current saved Main Basket checklist, consistent with the existing Quality tab, and is labeled as shared.

## Baseline evidence and source of truth

- `KnowledgeHierarchySummary.tsx` currently accepts hierarchy names only and renders three rows. `KnowledgeItemWorkspacePage.tsx` mounts it below `KnowledgeRevisionHistory` in the existing responsive rail.
- Overview reads the `overview` section. Mode's current visible editor reads `advanced` for mode selections, descriptions, fields, inclusions/exclusions and calculation settings, plus `pricing` for Specifications. Recommendation & Exclusions reads `recommendations`.
- `KnowledgeBasketQualityPanel.tsx` reads `getKnowledgeBasketQuality(item.basketId)` using `knowledgeQueryKeys.basketQuality`. Historical per-item `quality` is available only through an explicit legacy view and is not the current shared checklist. The older workspace backend-section mapping alone is therefore insufficient to identify the Quality source.
- `knowledgeQueryKeys.section(mainLineId, revisionId, sectionKey)` supplies stable cache identity. Section mutations commit confirmed responses through `commitKnowledgeSectionMutation`; Quality saves commit the returned checklist to the Basket-quality query. These caches provide saved data without copying editor state.
- Current Mode saves can succeed for one backend section and fail for another. The summary must reflect each successfully persisted block rather than pretending that the whole Mode save is atomic.
- Existing presentation, mode parsing, recommendation and quality helpers can support formatting, but `knowledgeOverviewSummary.ts` contains older section groupings. Do not reuse an old projection wholesale or expose raw JSON merely to cover every field.

## UX and content contract

Retain a single **Quick summary** container below Revision history. Keep the existing three compact hierarchy rows, followed by the helper **Saved configuration** and four compact groups in tab order. All group headings and useful saved highlights are visible without expansion.

| Group | Compact preview | Available saved details |
| --- | --- | --- |
| Overview | UOM and applicable Surface names | Complete selected Surface names and their recorded examples/descriptions where present |
| Mode | Configured Mode/source names, saved rates/margin highlights and Specification count/names | PMC, Sub-Vendor and In-house Labor/Material settings; Base Rate, quantity limit, impact and applicable saved PMC/Lisno min/max percentages; shared description; selected inclusions/exclusions; custom component labels and values/options; Specification names and descriptions |
| Recommendation & Exclusions | Saved rule/recommendation and exclusion names or short target/action summaries | Each saved rule's trigger, related Basket/Sub-Basket/Main Line names, action/requirement, reason and enabled state; existing legacy recommendation labels, priorities/reasons and dependency state where present; saved exclusion names, reasons and enabled state |
| Quality Parameters | Shared checklist label and parameter count/names | Each saved question, answer type and configured criteria/options/limits/unit/default, plus saved inspection, sampling and evidence requirements displayed by the Quality editor |

Formatting rules:

1. Use compact labeled rows and short inline lists. Show at most three preview rows/items per group initially, with a clearly labeled **Show details** or **Show all N** disclosure when more saved data exists. Expansion exposes the group's complete user-facing saved details without navigation or a new side panel. Long prose can use an accessible Show more/Show less control. Do not reduce the summary to counts alone.
2. Reuse current product labels and established money/percentage formatters. Display integer paise as rupees only through the existing formatter; display basis points as percentages. Preserve zero and false as meaningful saved values. Do not calculate selling totals, call preview endpoints, invent quantities, or supply default margin/rate values for absent saved settings.
3. Include selected scope inclusions/exclusions, not unchecked catalog options. Preserve disabled saved recommendation/rule/parameter records as clearly inactive when the editor exposes them. Keep unsupported/legacy saved configuration visible as a concise needs-review indication rather than silently reporting an empty group.
4. Use current stable IDs to resolve references against authorized existing catalogs and related-item data; never join by names or display internal IDs. A missing reference is **Name unavailable**; an actual absent value is **Not configured**. For the hierarchy, preserve **Not assigned** when there is no Sub-Basket ID, and **Name unavailable** when an assigned ID has no usable name.
5. Keep the summary readable within the existing narrow rail. Use the current typography/tokens, restrained separators and wrapping. Keep the Quick summary heading visible above a bounded, independently scrollable content area containing hierarchy and saved groups. Additional saved rows and expanded details must increase this area's scroll extent rather than the page height. Disclosures support keyboard use, accessible names, visible focus and correct expanded state. Reset expansion and the summary scroll position when the Main Line/revision changes.

## Independent Quick summary scrolling refinement

**Goal:** overflowing Quick summary content scrolls inside its card. The user should not have to scroll the entire workspace to read additional summary details.

**Current evidence:** `KnowledgeHierarchySummary.tsx` renders all hierarchy and saved groups directly inside an unconstrained Surface. Its styles have no block-size limit or scroll container. `KnowledgeWorkspaceRail` in `KnowledgeItemWorkspacePage.tsx` compares the entire rail height against the viewport and switches a tall rail to normal document flow. Consequently the summary length extends the workspace page, as shown in the user's screenshot.

**Required behavior:**

- On desktop, cap the card to usable viewport space beneath Revision history, accounting for the rail position, history height and existing spacing. Recalculate when the viewport or history changes. Preserve the rail's existing sticky positioning where it fits.
- Keep the title outside the scrolling body. Use vertical overflow only when needed, stable scrollbar space and wrapping without horizontal overflow. Short summaries retain natural height up to the cap.
- Expansion and longer content scroll within the same body. Do not add separate scrollers for individual groups. Wheel/touch scrolling over an overflowing summary stays within that area, including at its boundaries; scrolling outside it continues to behave normally.
- On mobile/narrow layouts and very short viewports, use a usable viewport-relative card cap (approximately 60% of visible viewport height) rather than allowing expanded details to lengthen the page indefinitely. The page can still scroll to reach the card and other workspace content.
- Give the scrolling area an accessible name, keyboard focus and a visible focus indicator. Keyboard scrolling and Tab navigation must reach every detail and leave the region without trapping focus. Keep focused disclosure controls visible after expansion/collapse.
- Retain all saved-data, reference, error/retry, permission and identity behavior. This refinement changes layout and scrolling only; it does not globally lock page/body scrolling or change the left navigation, editor panels, Revision history content, APIs, calculations or save flows.

**Assumptions and constraints:** the existing workspace rail and design tokens remain the integration points. Available height must not become negative or unusably small when history grows or browser zoom reduces the viewport. Account for short/mobile viewports without hiding content. No dependency or data migration is needed. Reverting the scoped layout changes restores the previously implemented summary behavior.

**Verification:** use populated and expanded summaries with short Overview content. Confirm that adding/expanding summary content leaves document height and page scroll position stable while the summary's own scroll position changes. Test wheel movement at both scroll boundaries, keyboard access, resizing, long history, desktop/mobile/reflow widths, and unchanged scrolling outside the card. Run focused hierarchy/workspace layout tests, frontend typecheck/build and rendered accessibility checks.

## Data flow, states and compatibility

- Load the required saved sections for the current Main Line/revision even when their tabs have not been visited. Reuse the exact existing query keys and cache entries, so the summary and editors share confirmed responses and deduplicate concurrent reads. Reuse already-loaded master and relationship catalogs; fetch missing reference context only where required by an actual saved reference, scoped by stable ID.
- Fetch the saved Basket checklist for the current Basket. Label it **Shared checklist** so it is not confused with immutable revision history. An item without a revision still has hierarchy and may have shared Quality; revision-owned groups show **No revision available**.
- Preserve existing temporary-item applicability: Recommendation & Exclusions is **Not applicable** for temporary items, matching its hidden tab, and does not trigger an unnecessary recommendations request.
- Each group loads and fails independently. Show a compact loading state, explicit **Not configured** after a successful empty result, or **Could not load saved data** with Retry. A failed refresh can retain already-confirmed values for the same identity with a stale-data indicator; never render a failed request as empty/zero.
- Unsaved editing does not change the summary. A successful save updates the corresponding saved values through the existing cache; failed saves retain the previous saved values. Partial Mode success updates only confirmed blocks. Background refreshes, tab changes and expanded detail rendering must not overwrite local editor drafts or trigger save/preview requests.
- Scope section data to Main Line plus revision, and checklist data to Basket. On route/revision/Basket changes, show only matching data or a loading state; never reuse previous-item values. Resolve partial-load states explicitly rather than combining unrelated revisions or supplying fabricated values.
- Existing backend authorization remains authoritative. Summary visibility follows access to the workspace and its existing read endpoints; denied reads do not reveal cached data from another identity or broaden permissions. Read-only and archived states still show available saved data.

## Approach, scope and non-goals

Extend the existing summary with a saved-data query layer and a small explicit presentation projection. Separate retrieval, formatting and rendering so saved-versus-unsaved behavior can be tested without mounting editors. Reuse established public shapes and formatting helpers; no new aggregate endpoint or dependency is needed. No material architecture choice remains open because the existing shared caches and read endpoints already represent the required saved sources.

Expected affected areas are the hierarchy/summary component, a saved-summary hook/projection and focused tests, workspace integration, and scoped configuration styles. Existing saved-data fixtures may need additive scenarios. Keep current save workflows, section editors, mutation payloads, pricing formulas, margins, permissions, revision history and Overview 1:3 layout intact.

This is a substantial frontend change because it combines independently saved sources and renders financial settings. Use the Lisno planning/review workflow proportionately, with separate implementation ownership and final integrity review of cache identity and saved-data provenance. Before writers start, capture the dirty-path set and per-target baselines, including untracked summary files. Preserve all earlier work. No backend/persistence change, migration, seed, commit, push, deployment, saved application-data mutation or customer communication is included. Rollback is limited to the new summary/query/presentation changes; there is no data migration.

## Risks and acceptance criteria

The main risks are showing unsaved values as saved, mixing item/revision/Basket identities, confusing shared Quality with legacy item Quality, silently dropping saved detail, misformatting money/percentages, fetching repeatedly, and introducing viewport clipping or keyboard/scroll traps.

- **AC1 — Full content:** Hierarchy plus all four group previews appear on initial load, without visiting tabs. Configured names and values are present; all user-facing saved details are reachable through compact disclosures. Zero/false, missing references and inactive/legacy states are represented honestly.
- **AC2 — Saved-only:** Editing, cancelling, reverting or using simulators does not update the summary. Confirmed Overview, Mode, Recommendation and shared Quality saves update the correct groups. Failed saves preserve prior values; partial Mode success does not expose failed/local block values. Disclosures never make save or preview calls.
- **AC3 — Identity and failures:** Use asymmetric fixtures for two Main Lines, revisions and Baskets. Route/revision/Basket changes cannot leak previous values. Verify independent loading/error/retry/stale states, missing references, no revision, shared Quality, temporary-item applicability and read-only/archived access.
- **AC4 — Accurate display:** Verify money and percentages against distinct persisted values, with no financial recomputation or fabricated defaults. Scope lists show selected items only; shared checklist content comes from the Basket endpoint, even when legacy per-item quality differs.
- **AC5 — Compact and independently scrollable:** Inspect populated desktop/narrow/mobile and 200% reflow states, long lists/text, expanded/collapsed details and keyboard behavior. The Quick summary body scrolls within a viewport-aware cap while its heading remains visible. More summary content does not extend document height. No horizontal overflow, inaccessible content, scroll chaining at summary boundaries or keyboard trap. History, page scrolling outside the card and existing save/discard controls continue to work.
- **AC6 — Integrated verification:** Run focused summary/projection and workspace/Mode/Quality save regression tests, frontend typecheck/build and repository diff checks. Trace tests to successful/failed/partial saves and cache identity, not merely markup/CSS. Final read-only integrity review precedes integrated verification in Mode A. Backend/replica/OCR suites are unnecessary unless implementation uncovers a real contract change.

No product decision remains open. The independent-scrolling refinement replaces the previous no-inner-scroll requirement; its specification, task plan and execution choice have completed their approval gates.
