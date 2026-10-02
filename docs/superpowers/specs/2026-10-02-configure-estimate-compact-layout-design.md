# Configure Estimate compact layout design

## Goal

Make the **Configure estimate** step follow the user-supplied screen reference and use the available workspace efficiently. At a typical laptop content width, the project context, room setup, and first several Main Baskets should be visible without oversized gaps. Keep the interface calm, legible, and consistent with the estimate item-selection view already under development.

## Current behavior and evidence

- `LeadEstimateWorkspace.tsx` renders a back link, estimate heading and total, `ProjectChatNavigation`, then one `estimate-panel` containing Property type, Rooms, and `RoomDimensionsAccordion` in a vertical sequence. The Main Basket chooser is a separate panel beneath it.
- `PropertyTypeDropdown.tsx` and `RoomsMultiSelectDropdown.tsx` already own selection, search, selected-room chips, and keyboard interaction. `RoomDimensionsAccordion.tsx` already owns per-room disclosure, length/width inputs, area display, and removal.
- The chooser already uses native checkboxes and live catalogue counts for Sub Baskets, Main Lines, and temporary items. It also handles loading, refresh, empty, permission, and error states. `ProjectChatNavigation` owns the live Estimate/Messages links, project status, and critical count when that project context is available.
- `estimator-dashboard.css` still applies a one-column chooser and broad shared `estimate-panel` treatment to Configure. The newer `estimate-workspace--item-view` styles apply only after leaving Configure. The shared shell has a 240px sidebar at desktop widths, so the configure layout must size itself against the remaining content area.
- The worktree already contains changes in `LeadEstimateWorkspace.tsx`, `ConfiguredEstimateBuilder.tsx`, `estimator-dashboard.css`, frontend tests, API types, and related backend files. The existing `estimation-screen-reference` specification targets the later **item-selection** view. This specification targets the preceding **Configure** view and must preserve those in-progress edits.

## Recommended UX and visual direction

Use the screenshot's information order and density while retaining live application behavior:

1. A short back link and compact masthead place the draft context, **Configure estimate**, project/location, and GST-inclusive total in one shallow top area. Keep the total tied to the existing calculated value and its incomplete-rate status.
2. A full-width, thinly separated project-navigation row places Estimate/Messages on the left and project status/critical count on the right when those controls exist. Their visibility and values continue to come from existing permissions and queries; do not render screenshot sample values.
3. A **Project details** section has a restrained heading band, Property type and Rooms in two equal columns at roomy widths, and selected-room chips directly below the fields. It becomes one column when the workspace is narrow.
4. Each selected room has a compact **[room name] dimensions** section beneath Project details. The room name, current area or **Not set**, and one disclosure control share the heading line. Expanded content places Length and Width side by side with a multiplication separator where space allows. Keep input labels visible and units explicit. Multiple rooms remain easy to scan and collapse individually; any global expand/collapse action should fit in the section heading rather than consume its own empty row.
5. The **Main Baskets** section has a compact label, title, one-line instruction, and refresh action in its header. Basket rows use the available width: checkbox, quiet basket identifier, name, truthful count metadata, and an end disclosure. Selection and disclosure are distinct actions. A disclosed row may reveal a concise breakdown from the already-loaded catalogue; it does not change selection or fetch new data. If a disclosure cannot provide useful information, omit the chevron instead of showing a false affordance.
6. Use the existing interface font and estimate color roles: warm off-white canvas, dark ink, restrained green selected state, subtle borders, and no drop shadows, gradients, emoji, decorative color coding, or new Lucide usage. New small pictograms, if needed, should be purpose-built inline SVG and consistent in tone. Keep any existing shared icon system outside this screen's visual scope.

On a content viewport near the supplied 998×677 reference, the masthead, navigation, Project details, an expanded single-room dimensions panel, the Main Baskets header, and at least the first three basket rows should fit in the initial view when ordinary content lengths permit. This is a density target, not a fixed-height rule; long names, status messages, and browser text zoom must expand naturally.

## Scope and non-goals

**In scope:** Configure-step markup and locally scoped styles; layout of existing dropdowns, selected-room chips, dimensions, navigation, totals, chooser rows, refresh, and continuation; responsive and accessibility refinements needed for this composition; focused rendered regression coverage and browser visual checks.

**Out of scope:** Catalogue eligibility or item counts, backend/API contracts, room or basket persistence, line calculations, GST, estimate versioning, save/submit/publication, the later item-selection builder, project-chat permissions or data, production mutation, new dependencies, and a redesign of shared application chrome.

## Behavior and accessibility requirements

- Preserve room selection/removal, property type selection, individual dimension editing/disclosure, Main Basket selection, refresh, and **Continue to item selection**. Visual compression must not hide validation or prevent any existing action.
- Use real labels and native controls where possible. Preserve keyboard access, visible focus, selected/expanded state, meaningful tab order, and accessible names for each room and basket. The basket checkbox and its disclosure must be independently operable and clearly labelled.
- Keep selected-room chips and all catalogue states visible without covering controls: loading, refreshing, no baskets, no eligible items, permission denied, refresh failure with last data, unavailable items, and read-only or disabled actions.
- Preserve accurate singular/plural room and item labels. Basket counts must remain derived from the same catalogue arrays, including direct and grouped temporary items; never hard-code the reference's sample counts.
- Let the layout wrap rather than truncate important names or financial status. Controls must avoid horizontal page overflow at mobile, tablet, and desktop widths, including with the application sidebar and at 200% text zoom.
- Do not rely on hover animation to indicate an action. A stable selected state, border, focus ring, and native cursor/semantics are sufficient. Respect reduced motion for any remaining disclosure transition.

## Data, API, and state impacts

No data or API change is intended. `LeadEstimateWorkspace` remains the source of the estimate draft, calculated total, active tab, selected rooms, selected Main Basket IDs, and refresh status. Its existing callbacks remain authoritative. `ProjectChatNavigation` remains the source of project navigation and live status; the Configure view only changes placement and local presentation. Existing catalogue and estimate snapshots are not rewritten.

The screenshot is a visual target, not data: its client name, room, basket names, counts, status, and ₹0 total are examples. Missing project-chat capability or project ID must continue to show only the controls that the current component permits.

## Constraints, assumptions, and risks

- The reference is provided in chat, so this document records its structure and density for later implementation. Exact pixel matching is secondary to readable real content and the existing app shell.
- The existing item-selection redesign introduces local estimate color variables and wider workspace treatment. Reuse compatible tokens or extend them for Configure without changing its builder behavior or styling unrelated pages.
- The most likely regressions are CSS specificity from `role-themes.css` and `estimator-dashboard.css`, dropdown overlays being clipped by compact sections, controls wrapping poorly beside the sidebar, and basket disclosure clicks toggling checkboxes accidentally. Verify these in rendered states.
- The room dimensions component currently has two disclosure triggers plus a separate global expand/collapse row. Consolidating those controls should retain individual disclosure and room removal through an obvious existing action.
- No migration, rollback procedure, new permission, or external side effect is needed for this presentation change. Reverting the locally scoped Configure layout restores the prior presentation without changing saved data.

## Acceptance criteria

1. The Configure view presents the reference's compact masthead and total, project-navigation row, Project details section, separate room-dimensions sections, and dense Main Basket list using the available content width.
2. At representative desktop and tablet widths, Property type and Rooms share a row; selected-room chips stay in Project details; Length and Width share a row when space permits. At narrow widths they stack cleanly with no clipped overlays or horizontal page overflow.
3. With one room and ordinary names, the first three Main Baskets are visible in the initial view around the reference's 998×677 content viewport. Content remains fully readable when names or status messages are longer and at 200% text zoom.
4. Property type, room selection/removal, dimensions, basket selection, any basket disclosure, refresh, and continuation work by pointer and keyboard. Selection and disclosure never trigger each other unintentionally.
5. Totals, project status, critical count, catalogue counts, and all loading/error/empty/disabled states remain truthful and derive from existing sources. Estimate calculations, payloads, and saved data are unchanged.
6. Focus visibility, accessible names, semantic headings and labels, reduced-motion behavior, and responsive interaction checks pass. Focused frontend tests, typecheck/build, rendered desktop/mobile checks, and `git diff --check` are reported with exact outcomes after implementation.

## Open decisions

None blocking. The screenshot does not show an expanded basket row; the implementation may either use its end chevron for a concise existing-data preview or omit the chevron if the row has no useful disclosure content. The checkbox remains the selection action in either case.
