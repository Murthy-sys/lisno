# Main Line workspace: Overview reference layout

Date: 2026-09-25
Status: Draft. Awaiting specification approval (Gate 1). No task plan or code changes yet.
Classification: Substantial frontend presentation change. It touches workspace chrome shared by all four tabs (status bar, save command, tabs, revision history) and the Overview panel. No API, data, permission, or workflow change.
Reference: the user's 2026-09-25 screenshot of Configuration → Main Basket → Main Line → Overview. The screenshot is cropped just below the UOM and Surfaces controls.

## Goal

Make the Main Line workspace's Overview tab match the reference:

- one bar that combines completeness and Save
- underline tabs with an olive active indicator
- UOM and Surfaces as side-by-side cards with icon tiles
- a Revision history card with an icon tile and richer revision entries

Keep every existing action, state, permission rule, and data source.

## Reference anatomy and current gaps

| # | Reference | Current (evidence) | Change |
| --- | --- | --- | --- |
| 1 | One full-width bar above the tabs and rail: "Configuration completeness", bold "17%", a progress bar filling the row (olive fill), "Last saved 2 mins ago", and a primary "Save Overview" with a save icon | `KnowledgeWorkspaceStatus` shows the label and percentage with a short bar underneath. Save sits in a second bar inside the tab panel: "Overview · Version 1 · All changes saved · Save Overview" | Merge both into one bar (R1, R2) |
| 2 | Bold active tab with a thick olive underline over a light rule | Same tabs, with 13px labels and a 2px near-black underline under the text only | Restyle the indicator (R3) |
| 3 | Narrow UOM card: cube icon tile, title, description, divider, full-width select. A full-width control is visible directly below it (cropped) | No icon tile. The cards sit side by side (1:3) only when the Overview is at least 56rem wide. At 1440px they stack and "Add Unit" sits beside the select. At 1920px "Add Unit" already stacks below the select | Icon tile, and a 1:2 side-by-side layout at desktop widths (R4) |
| 4 | Wide Surfaces card (about twice the UOM width): person icon tile, title, description, divider, "Applicable surfaces" multiselect, and "Add Surface" | No icon tile | Icon tile (R4) |
| 5 | Revision history card with a clock icon tile. Each entry is a tinted card with a sync icon, "Revision 1", an amber "Draft" pill with a dot icon, then "Updated …" and "0% complete" on separate lines | No icon tile. Lowercase "draft" badge with a warning-triangle icon. A single line: "Updated … · 17% complete" | Restyle (R5) |

These parts are outside the crop and stay unchanged:

- page header and lifecycle actions
- safety notice
- Configuration image backdrop
- Quick summary
- everything below the Overview controls

Current renders use real components with synthetic data in a harness that blocks writes: `/tmp/lisno-configuration-image-qa/view-workspace-overview-1440.png` and `/tmp/lisno-configuration-image-qa/responsive-workspace-1920.png`.

## Current behavior and evidence

- **Composition.** `/admin/configuration/estimation/items/:itemId` renders `KnowledgeItemWorkspacePage.tsx` in this order:
  1. PageHeader
  2. `KnowledgeSafetyNotice`
  3. refresh warning
  4. `KnowledgeWorkspaceStatus`
  5. temporary and read-only messages
  6. `.knowledge-workspace-layout`: the main column holds the `KnowledgeSectionNavigation` tabs and tab panel, and the rail holds `KnowledgeRevisionHistory` and `KnowledgeSavedConfigurationSummary`

  Recommendation & Exclusions and Quality Parameters use `KnowledgeReferenceContextRail` instead. It nests the same history and summary inside a "Saved details & revision history" disclosure.
- **Save command.** For Overview, Mode, and Recommendation & Exclusions, the page renders `KnowledgeSectionCommandBar` inside the tab panel and wires it to `saveActiveSection` (condition: `revision && activeSection !== "quality"`). Quality Parameters has its own `KnowledgeSectionCommandBar` ("Save shared checklist") inside `KnowledgeBasketQualityPanel`, which saves the basket-level checklist.
- **Command bar content.**
  - section label
  - "Version N": the section version, or the revision number on Mode
  - `role="status"` text: Read-only revision, Saving …, Save failed …, Unsaved changes, or All changes saved
  - a Save button that stays disabled until there are changes
  - the container is labelled "{Section} commands"
- **Sticky behavior.** Above 768px the command bar uses `position: sticky; inset-block-start: 8px; z-index: 10`. The app topbar is also sticky, opaque, 72px tall, and `z-index: 20` (`common-shell.css`, `global.css`). After scrolling, the topbar covers the command bar. At 768px and below the command bar is static. The rail also sticks at 8px.
- **Overview panel.** `KnowledgeOverviewPanel.tsx` renders two cards:
  - UOM: the select, "Add Unit" when the revision is editable and `canQuickAdd` is true, and catalog loading, error, and retry states
  - Surfaces: wraps `KnowledgeModeSurfacePanel`, which has the multiselect, "Add Surface", selected-surface details, dirty and read-only labels, and catalog states

  `knowledge-configuration-ui.css` switches the grid to `1fr 3fr` columns when the container is at least 56rem wide.
- **Revision history.** `KnowledgeRevisionHistory.tsx` handles loading, error, stale-refresh warning, empty, and busy states. Entries use the shared `StatusBadge` with the raw lowercase status.
- **Timestamps.**
  - Every section envelope carries `createdAt`, `updatedAt`, and `version`.
  - Backend `updateSection` stamps the section, the revision, and the Main Line with the same `occurredAt` and increments the section version (`backend/src/services/ai-estimator-knowledge-item.service.ts`).
  - Creating a Draft copies sections with `createdAt` and `updatedAt` both set to the creation time and `version: 1`.
  - `commitKnowledgeSectionMutation` writes the saved envelope into the section query cache immediately.
  - `KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS` maps each tab to its backend sections: Overview → overview, Mode → advanced + pricing, Recommendation & Exclusions → recommendations.
- **Relative time and icons.** `formatCreatedRelative` in `features/admin/adminProjectPresentation.ts` uses `Intl.RelativeTimeFormat("en-IN", { numeric: "auto" })`, which produces text like "Created 2 minutes ago". The installed lucide-react 1.27.0 already includes `Box`, `UserRound`, `Clock`, `RefreshCw`, `CircleDot`, and `Save`.
- **Tests that encode the current contract.** `KnowledgeScreens.test.tsx` asserts "All changes saved" and checks that "Overview commands" contains "Version 2". `KnowledgeItemWorkspaceLayout.test.tsx` asserts source class names and CSS declarations for `.knowledge-section-command-bar` and `.knowledge-workspace-status`.
- **Worktree.** The production files likely in scope are clean. `KnowledgeScreens.test.tsx` has small, unrelated, uncommitted index-card test edits that must be preserved. Other uncommitted vendor, backend, mobile, and index work is out of scope.

## Scope and non-goals

In scope:

1. The combined completeness and save bar for the item workspace.
2. The Overview UOM and Surfaces cards: icon tiles, proportions, breakpoints, and spacing.
3. The Revision history card and its entries, wherever the component renders.
4. A refinement of the tab strip's active indicator, which all four tabs share.
5. Focused test updates for the changed contracts.

Non-goals:

- backend, API, schema, permission, or workflow changes, and any new requests
- the page header, lifecycle actions, safety notice, and image backdrop
- the content of Mode, Recommendation & Exclusions, and Quality Parameters, including the Quality panel's own save bar
- the Quick summary
- the default appearance of the shared `StatusBadge`, `Button`, and `ProgressBar` on other screens
- making the bar sticky (D3)
- removing Add Unit, selected-surface details, dirty or read-only labels, or any loading or error state
- new dependencies, fonts, or icon packages
- commits, pushes, and deployment

## Requirements

### R1. Combined completeness and save bar

1. The bar is one full-width surface in the current status position, above the tabs and the rail. It keeps the "Workspace status" region name.
2. On desktop, everything sits in one row, in this order:
   1. "Configuration completeness" in muted text
   2. the percentage in bold
   3. a progress bar that fills the remaining width
   4. the save status
   5. the Save button

   The progress fill uses the primary-action olive, in this bar only. Save keeps its 44px target and existing save icon.
3. The save status and Save appear only when the active tab uses the page-level save (Overview, Mode, Recommendation & Exclusions) and a revision exists. On Quality Parameters, or when there is no revision, the bar shows completeness only. The Quality panel keeps its own bar unchanged.
4. Remove the page-level command bar from the tab panel so that no tab shows two save controls. These stay as they are:
   - the Save label ("Save Overview", "Save Mode", "Save Recommendation & Exclusions") and its busy label
   - the rule that Save stays disabled until there are changes
   - the `saveActiveSection` handler and validation
   - the version-conflict dialog
   - where error messages appear
   - the unsaved-changes guard
5. Status text:

   | State | Text |
   | --- | --- |
   | Not editable | "Read-only revision", with no Save button (unchanged) |
   | Saving | "Saving {Section}…" |
   | Save failed (not a version conflict) | "Save failed. Review the message below and try again." |
   | Unsaved changes | "Unsaved changes" |
   | No unsaved changes, save time known (R2) | "Last saved {relative time}" |
   | No unsaved changes, save time unknown | "All changes saved" |

6. Remove the visible "Version N" label (D2). The group holding the status and Save keeps the name "{Section} commands".
7. Completeness still comes from `item.completeness.percentage`, with the existing ProgressBar label and value text.

### R2. Truthful "Last saved" time

1. The time comes from the server's `updatedAt` on the active tab's section envelopes for the current revision, mapped through `KNOWLEDGE_WORKSPACE_BACKEND_SECTIONS`. For Mode, use the later of advanced and pricing. Use only data the page or panels already load. Add no network request.
2. Count an envelope only if it was saved after creation, meaning its `updatedAt` is later than its `createdAt`. A save also increments `version` beyond 1. Show a time only when every envelope the tab needs is loaded; otherwise use the fallback text. Never use the item's `updatedAt`, the time of the click, or a made-up value.
3. After a successful save, the envelope written to the cache changes the text to "Last saved just now" without waiting for a refetch.
4. Word the time with the app's existing convention, `Intl.RelativeTimeFormat("en-IN", { numeric: "auto" })` in long style: "Last saved 2 minutes ago", "Last saved yesterday". Anything under one minute reads "Last saved just now". So does a timestamp in the future caused by clock skew (D6).
5. Refresh the relative text at least every 30 seconds while it is shown. Expose the exact time through a `<time dateTime>` element in the existing `formatKnowledgeDateTime` format.
6. The periodic refresh must not trigger screen-reader announcements. The live status announces changes of state (saving, saved, failed, unsaved), not each refresh.

### R3. Tab strip

Keep these unchanged:

- labels and order
- roving focus with arrow, Home, and End keys
- disabled handling
- the reduced tab set for temporary items
- the section select at 768px and below
- the unsaved-changes guard

Restyle to match the reference:

- the active label is bold and dark, with an olive indicator about 3px tall that spans the padded tab, not just the text
- inactive labels are muted
- a light rule runs across the main column
- labels grow slightly, to about 14px, with more spacing where width allows
- targets stay at 44px and focus stays visible

### R4. Overview cards

1. The UOM and Surfaces card headers gain a decorative icon tile: about 44–48px, rounded, a quiet neutral or sage tint, with an outline icon of about 22px. Use `Box` for UOM and `UserRound` for Surfaces, which match the reference glyphs (D7). Icons are `aria-hidden`. Heading text, ids, card accessible names, and the divider stay as they are.
2. Place the cards side by side at roughly 1:2 (UOM to Surfaces) whenever the Overview container gives both usable width. This includes a 1440px desktop with the sidebar and rail visible. Below that width, stack them with UOM first. Pick the container breakpoint from rendered evidence, starting near 44rem, rather than fixing card widths.
3. UOM: the select spans the card. When the revision is editable and the user has permission, "Add Unit" spans the card directly below it, as in today's wide layout and the reference crop (D4). These stay as they are: read-only mode, saving, catalog loading, error and retry, and "Unavailable value".
4. Surfaces: the multiselect grows beside "Add Surface" where there is room and wraps below it on narrow cards. Selected-surface details, dirty and read-only labels, and catalog states stay as they are.
5. Both cards share padding, radius, and border treatment. They align at the top and are not stretched to equal heights.

### R5. Revision history card

1. The header gains a decorative clock icon tile beside "Revision history" and "Activated revisions remain immutable.", followed by the divider. The region name stays the same.
2. Each entry is a tinted, rounded card containing:
   - a decorative leading status icon:
     - Draft: a sync icon in the olive or success tint, as in the reference
     - Active: a check
     - Superseded: a neutral icon
   - "Revision N" in bold
   - a right-aligned status pill with a capitalized label: Draft, Active, or Superseded. Draft uses the reference's amber pill with a dot icon.
   - "Updated {formatKnowledgeDateTime}" on one line and "{N}% complete" on the next
3. The status is always stated in text, never by color or icon alone. Loading, error, stale-refresh, empty, and busy states stay the same. The shared `StatusBadge` defaults do not change, including the page header's Draft badge.
4. Entry values do not change. The percentage is still the entry's own value. As today, it can lag behind the item's completeness until history refreshes.

### R6. Responsive behavior and accessibility

1. At 1920, 1440, 1280, 1024, 768, 390, and 320px there is no horizontal page overflow, clipped text, or overlapping controls.
2. The bar uses one row when it fits. Otherwise, completeness (label, percentage, and progress) takes one row and status plus Save take the next. At 480px and below, Save is full width. Long labels such as "Save Recommendation & Exclusions" wrap cleanly.
3. At 1180px and below, the rail still stacks below the content. The cards stack as described in R4.
4. At 200% text zoom, content wraps without clipping.
5. Keyboard focus moves from the bar's controls to the tabs, then to the panel. Decorative icons add no tab stops or announcements. Focus stays visible, and axe reports no new violations.
6. Surfaces stay opaque enough to read over the existing Configuration image backdrop.

### R7. Scrolling behavior

The combined bar stays in normal document flow and is not sticky (D3). Today's sticky bar is hidden under the opaque topbar once the page scrolls, and it is static at 768px and below. So this keeps today's effective behavior and adds no overlap with the topbar or the sticky rail. The unsaved-changes guard still protects navigation.

## Data, state, and compatibility

- There is no change to the API, schema, permissions, or persisted state, and no additional network request.
- Save, discard, validation, conflict review, the unsaved-changes guard, and mutation sync and invalidation behave as today. Only the save control's location and status wording change.
- Frontend `editable` gating is computed as today. Backend authorization remains authoritative.
- The Quality panel and its basket-level save are unaffected.
- To roll back, revert this frontend diff.

## Assumptions and constraints

- The reference shows the Overview tab. The bar, tabs, and rail are shared, so their new look applies to all four tabs (D1). Only the cards below the tabs are specific to Overview.
- The cropped control below the UOM select is the existing "Add Unit" action.
- The Save button in the reference looks enabled. This is treated as styling: Save stays disabled until there are changes (D5).
- A section's `updatedAt` reflects the last persisted change to that record, which is normally the author's save.
- Reuse existing tokens (primary olive, surface, line, muted ink), components, and lucide icons. Scope new rules to the item workspace, and account for the role-theme selectors that load later.
- Preserve unrelated uncommitted work, including the existing changes in `KnowledgeScreens.test.tsx`.

## Decisions (recommended defaults; approving this spec confirms them)

- **D1.** Apply the shared chrome (bar, tabs, revision history) to all four tabs, so Save stays in the same place on every tab.
- **D2.** Remove the visible "Version N" from the bar. Revision identity remains in Revision history, and conflict dialogs still show versions.
- **D3.** Keep the bar non-sticky (R7). A sticky Save below the topbar can be a separate follow-up.
- **D4.** Keep "Add Unit", stacked below the UOM select.
- **D5.** Keep Save disabled until there are changes.
- **D6.** Use "2 minutes ago", the app's existing Intl wording, instead of the reference's "2 mins ago".
- **D7.** Use a person icon for Surfaces to match the reference. Swapping to a surface-specific icon such as `Layers` is a one-line change.

## Risks and mitigations

- **Tests encode the old bar and version label.** Update them to the new contract, with deterministic time, instead of deleting coverage. Keep the unrelated uncommitted changes in `KnowledgeScreens.test.tsx`.
- **Recommendation & Exclusions rail alignment.** The rail's 60px offset in `knowledge-reference-workspace.css` was tuned around the in-panel bar. The `[data-reference-section] .knowledge-section-command-bar` rules also style the Quality panel's own bar. Verify both layouts, and keep the Quality bar's styling intact.
- **CSS precedence.** Role-theme rules with high specificity load after the feature CSS. Inspect the actual cascade and scope overrides to the item workspace rather than stacking conflicting patches.
- **Relative-time refresh.** The timer can cause extra renders or announcements. Keep it local to the bar and keep the refreshing text out of the live region.
- **Cropped reference.** Content below the visible area is unknown. Keep the existing content there.

## Acceptance criteria and verification

| ID | Criterion | Evidence |
| --- | --- | --- |
| AC1 | The layout matches the reference at 1440×900 (with sidebar and rail) and at 1920×1080: a one-row combined bar with full-width progress and Save, no second bar below the tabs, UOM and Surfaces side by side at 1:2 with icon tiles, and the restyled Revision history | Before and after screenshots, plus measured layout geometry, from the synthetic harness with writes blocked |
| AC2 | Save behavior is preserved on Overview, Mode, and Recommendation & Exclusions: disabled with no changes, enabled with changes, busy while saving, "Last saved just now" after success, failed status and message on error, the conflict dialog on a version conflict, and the guard on tab switches and navigation. Quality keeps its own save, and the top bar shows only completeness there | Focused component tests and rendered checks |
| AC3 | "Last saved" is truthful: it comes from the envelopes (the later of two for Mode), falls back when nothing has been saved or data is not loaded, updates after a save without a refetch, advances under fake timers, exposes the exact time, and does not repeat live-region announcements | Unit and component tests with a fixed clock |
| AC4 | Read-only, archived, and no-permission views show "Read-only revision", no Save, no Add Unit or Add Surface, and the existing read-only labels | Component tests with differing permission sets (read-only; can update but not create) |
| AC5 | These states are preserved: section and catalog loading, error, and refresh; history loading, error, stale, and empty; a temporary item with three tabs; and no revision | Existing and updated tests, plus rendered spot checks |
| AC6 | The width matrix, 200% text zoom, keyboard order, visible focus, hidden decorative icons, and no new axe violations | Browser QA record |
| AC7 | Focused tests pass, then `cd frontend && npm run typecheck && npm test && npm run build`, then `git diff --check`. `git status --short` shows only planned files, with unrelated work intact | Command output recorded in the task plan |

Backend and OCR suites are not needed because no backend or OCR code changes. There is no lint script. QA artifacts go in a new `/tmp` directory, and no real data is changed.
