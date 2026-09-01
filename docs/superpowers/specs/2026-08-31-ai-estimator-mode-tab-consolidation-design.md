# AI Estimator Mode Tab Consolidation

## Goal

Simplify the Super Admin AI Estimator item workspace by replacing the separate
**Pricing** and **Quantity & margin** navigation tabs with one **Mode** tab and
moving the item's primary UOM control out of **Overview** into that Mode tab.

This specification interprets the request's “Quantiy and Management” wording as
the existing **Quantity & margin** section.

## Current behavior and evidence

- `KnowledgeSectionNavigation.tsx` renders every backend knowledge section as a
  first-level desktop tab and mobile selector option.
- `knowledgePresentation.ts` labels the relevant first-level sections as
  **Overview**, **Pricing**, and **Quantity & margin**.
- `KnowledgeSectionEditor.tsx` renders the primary `uomId` selector in the
  **Overview** editor. Pricing data and quantity/margin data are rendered from
  their separate `pricing` and `quantity-margin` section payloads.
- `KnowledgeItemWorkspacePage.tsx` loads, edits, validates, and saves one backend
  section at a time. It also renders the server-owned preview for
  `quantity-margin`.
- The backend contract and the approved AI Estimator design use separate
  `overview`, `pricing`, and `quantity-margin` section keys. UOM remains part of
  the Overview payload and participates in activation validation.
- After the Mode consolidation, each of its three cards reuses
  `.knowledge-section-toolbar`. That shared rule was designed for the single
  toolbar in a standalone section: it is sticky at the top of the scroll area,
  has a raised z-index, and uses negative inline/block margins to meet the outer
  Surface edges.
- In Mode, three instances of that standalone toolbar behavior can occupy the
  same sticky position while scrolling. The Mode-specific toolbar class is
  present in the markup but currently has no CSS override, so the toolbars can
  overlap and make the Super Admin configuration layout appear distorted.
- The added Mode selectors are feature-scoped; no evidence indicates a global
  stylesheet or non-Super-Admin role change. A live signed-in browser session is
  unavailable in the current environment, so the diagnosis is based on the
  rendered structure and computed selector behavior in source.
- The Super Admin screenshot supplied after the first corrective pass shows that
  the visible problem is not limited to Mode scrolling. In Overview, the shared
  three-child flex page header leaves the title visually detached between the
  back action and right-side commands; the tab deck stretches across the full
  workspace despite containing only a left-aligned tab row; and form controls
  expand to the entire available column width.
- The screenshot also confirms weak field boundaries on the warm Surface and an
  oversized empty Description area. Source evidence matches the image:
  `.ui-textarea` has a global 128px minimum (`--space-10` is 64px), and the
  auto-fit form grid lets a single Priority field grow to the full workspace
  width. These shared defaults are reasonable elsewhere but produce poor visual
  hierarchy in this wide Super Admin item editor.

## Proposed behavior

The first-level item-workspace navigation will be:

1. Overview
2. Mode
3. Scope
4. Recommendations
5. Quality
6. Execution
7. Advanced

**Mode** is a frontend presentation group over three existing backend-owned data
areas:

- the primary UOM field currently stored in the `overview` payload;
- pricing configuration stored in the `pricing` section; and
- quantity and margin configuration stored in the `quantity-margin` section.

The Mode panel will present these areas as clearly labelled blocks in that order:
**UOM**, **Pricing**, and **Quantity & margin**. Pricing and Quantity & margin will
no longer appear as separate first-level tabs or mobile selector options.

Overview will continue to contain its other existing fields, but it will no
longer render the primary UOM control.

For the follow-up visual fix, each Mode block will remain a normal bounded card.
Its block toolbar will be non-sticky and contained by that card, preventing UOM,
Pricing, and Quantity & margin headers from stacking over one another while the
page scrolls. The existing sticky behavior for standalone sections outside Mode
will remain unchanged.

For the screenshot-driven workspace correction, the item page will receive a
page-scoped responsive layout treatment:

- the back action occupies its own header row, with title/context aligned left
  and lifecycle/item actions aligned right beneath it;
- the section navigation deck sizes to its tab content on wide screens while
  retaining horizontal overflow safety and the existing mobile selector;
- Overview uses a readable form measure rather than stretching every control to
  the full workspace width;
- Description uses a compact, resizable editor height; Priority uses a bounded
  field width; and Modes/Surfaces retain a balanced responsive grid; and
- control borders/backgrounds provide visible separation from the containing
  card in the Super Admin knowledge workspace.

The correction remains limited to this Super Admin AI Estimator item workspace;
shared primitives and other roles/pages retain their current layouts.

## Scope

- Change the Super Admin AI Estimator item-workspace navigation and mobile
  section selector.
- Add the frontend-only Mode grouping and render UOM, Pricing, and Quantity &
  margin within it.
- Preserve the existing underlying section payloads, validation, applicability,
  optimistic-version checks, unsaved-change protection, and query invalidation.
- Preserve quick-add UOM behavior and the quantity/margin preview in their new
  visual location.
- Update focused presentation, navigation, interaction, keyboard, mobile, and
  save/error regression tests.
- Add a Mode-scoped layout regression that verifies block toolbars use the
  contained, non-sticky presentation without changing other Configuration
  pages or roles.
- Add screenshot-driven, item-workspace-scoped layout coverage for header
  alignment, navigation width, Overview field measure, textarea density, and
  control contrast at wide, tablet, and mobile widths.
- Update the existing AI Estimator design documentation where it describes the
  item-workspace tabs.

## Non-goals

- No backend section-key, schema, API, persistence, completeness, or activation
  rule changes.
- No movement or renaming of the reusable-values **UOMs** or **Modes** categories.
- No changes to the knowledge-base list filters, item summary, pricing formulas,
  quantity/margin formulas, tax handling, or integer-paise storage.
- No visual redesign of unrelated Configuration pages.
- No global PageHeader, Field, Select, Textarea, Surface, role-theme, or design
  token change; the screenshot correction is scoped to the Super Admin AI
  Estimator item workspace.
- No deployment, production data mutation, migration, commit, or push.

## Requirements

### Navigation and content

1. Desktop/tablet exposes exactly one first-level tab named **Mode** in place of
   the current Pricing and Quantity & margin tabs.
2. Mobile exposes exactly one **Mode** option in the labelled Configuration
   section selector in place of those two options.
3. Selecting Mode shows UOM, Pricing, and Quantity & margin content in one panel,
   in that order, without nested first-level tabs.
4. Overview does not display the primary UOM selector.
5. UOM remains editable from Mode with the same reusable-value options,
   permission checks, quick-add flow, and validation behavior.
6. The quantity/margin server preview remains available under the Quantity &
   margin block.

### Saving, versioning, and failure handling

7. The frontend continues reading and writing the existing `overview`, `pricing`,
   and `quantity-margin` API sections. **Mode** is not sent to the backend as a
   section key.
8. Each underlying section retains its own applicability and version value.
   Editing one block must not overwrite or manufacture data in another block.
9. A Mode save action must persist every dirty underlying block deterministically.
   The UI must not report the Mode panel as fully saved while any dirty block has
   failed.
10. Version conflicts identify the affected block, preserve other unsaved Mode
    edits, and retain the established review/discard behavior for the conflicting
    section.
11. Navigating away with any unsaved Mode edit triggers the existing
    save/discard/stay guard. Discard restores all dirty underlying blocks to their
    last server values.
12. Loading, empty, error, read-only, and archived states remain explicit. A
    failure to load one Mode block must not silently display it as empty or
    configured.

### Accessibility and responsive behavior

13. The first-level tablist preserves arrow-key, Home, and End behavior after the
    tab count changes.
14. The Mode tab has one correctly associated tabpanel, while its UOM, Pricing,
    and Quantity & margin blocks use semantic headings and independently named
    status/applicability controls.
15. Desktop, tablet, and mobile layouts avoid horizontal page scrolling and keep
    save/error/status information adjacent to the affected block.
16. Mode block toolbars remain contained within their own cards and do not share
    the standalone section toolbar's sticky stacking behavior. The CSS override
    must be scoped to the Super Admin AI Estimator Mode workspace so standalone
    section toolbars and unrelated role layouts retain their existing behavior.
17. On wide screens, the item header presents the back action on its own row and
    keeps the title/context and page actions in a coherent two-column row rather
    than distributing all three groups across one flex line.
18. The desktop/tab navigation deck does not create a large empty full-width
    pill; it sizes to its content up to the available width and remains safely
    scrollable. The existing mobile labelled selector remains unchanged.
19. Overview fields use a readable bounded measure: Description is compact and
    vertically resizable, Priority does not span the full workspace, and the
    Modes/Surfaces pair responds from two columns to one without horizontal page
    scrolling.
20. Super Admin knowledge-workspace controls have a clearly visible boundary
    and surface contrast in default, hover, focus, disabled, and invalid states.
21. The visual correction does not alter values, validation, saving, quick-add,
    permissions, API calls, keyboard semantics, or backend contracts.

## Data, API, authorization, and UX impacts

### Data and API

- No backend or database changes are required.
- `overview.uomId` remains the authoritative primary-UOM field. Its UI location
  changes, not its ownership or payload path.
- Pricing and quantity/margin continue using their current section endpoints and
  version tokens.
- No migration or rollback of persisted data is required. Code rollback restores
  the prior navigation without data conversion.

### Authorization

- Existing `ai_estimator_knowledge.configuration.read`, `.create`, `.update`, and
  `.lifecycle` permissions remain authoritative.
- The change must not expose Configuration or quick-add actions to another role.

### UX

- “Mode” here names the combined item-configuration workspace. The reusable
  master category remains labelled **Modes**.
- The Mode panel must make the three data boundaries visible so users understand
  which version/applicability/error belongs to UOM, Pricing, or Quantity & margin.

## Assumptions and constraints

- “Management” in the request means the existing **margin** portion of
  **Quantity & margin**; no separate Management tab currently exists on this
  workspace.
- “UOM” means the primary item UOM currently shown in Overview. Pricing-entry and
  productivity UOM fields remain where their relevant Pricing or Quantity &
  margin controls are rendered.
- The user-facing combined label is exactly **Mode**, as requested, even though a
  reusable master category named **Modes** also exists.
- The established backend section contract is preserved to avoid migration and
  compatibility risk.

## Risks and mitigations

- **Partial multi-section save:** sequential or concurrent saves can leave one
  section saved and another dirty. Track dirty, pending, success, and failure per
  underlying block; retain dirty state for failures and report the partial result
  clearly.
- **Lost Overview fields:** moving only `uomId` must not move or omit the other
  Overview payload fields. Use field-level composition rather than changing the
  backend payload shape.
- **Version-conflict ambiguity:** one Mode panel spans three versioned records.
  Display the block name and server version in conflict handling.
- **Accessibility regression:** collapsing two tabs changes keyboard order and
  accessible relationships. Cover tab keyboard navigation, focus, mobile
  selection, headings, and named controls with rendered tests.
- **Terminology collision:** Mode can be confused with reusable Modes. Retain
  clear block headings and do not rename reusable-value navigation.
- **Nested sticky-toolbar collision:** three Mode block toolbars currently reuse
  a rule intended for one standalone section and can overlap during scroll. Add
  a Mode-only positioning/containment override rather than weakening the shared
  toolbar rule used elsewhere.
- **Global style regression:** changing PageHeader or form primitives would
  affect every role. Use an item-workspace marker and selectors beneath the
  Super Admin knowledge page; add negative assertions for shared primitive
  source files.
- **Over-constraining data-heavy sections:** pricing and relationship editors
  need more width than Overview. Apply readable-width constraints only to the
  Overview editor, leaving Mode and other sections responsive to their content.
- **Contrast-state regression:** a stronger default field boundary must not
  obscure focus, invalid, disabled, or hover states. Preserve the shared state
  indicators and verify the scoped rule does not override their semantics.

## Acceptance criteria

1. A permitted Super Admin opening an item workspace sees Overview, Mode, Scope,
   Recommendations, Quality, Execution, and Advanced as the first-level sections.
2. Pricing and Quantity & margin are absent as first-level desktop tabs and mobile
   selector options.
3. Overview contains its prior non-UOM fields and no primary UOM selector.
4. Mode visibly contains UOM, Pricing, and Quantity & margin blocks in the agreed
   order, including quick-add UOM and the quantity/margin preview.
5. UOM edits still persist to `overview.uomId`; pricing and quantity/margin edits
   still persist through their current backend section keys with their own
   applicability and expected versions.
6. A save, partial failure, version conflict, discard, or navigation attempt never
   silently loses dirty data or falsely reports all Mode content as saved.
7. Read-only and archived revisions show all Mode blocks without mutation
   controls.
8. Desktop keyboard navigation and the mobile selector work with the consolidated
   section set and maintain accessible names/relationships.
9. Focused frontend tests, frontend typecheck, frontend production build,
   rendered responsive/interaction checks, `git diff --check`, and
   `git status --short` complete successfully, or any unrun/failed check is
   explicitly reported.
10. Scrolling the Super Admin Mode workspace does not overlay the UOM, Pricing,
    and Quantity & margin toolbars; each stays visually contained within its
    own card at desktop, tablet, and mobile widths, while standalone section
    toolbar behavior remains unchanged.
11. At the screenshot's wide desktop size, the page header, tab deck, Overview
    card, and form controls have a coherent left alignment and visual hierarchy
    without the large detached gaps shown in the supplied image.
12. Overview's Description, Priority, Modes, and Surfaces controls remain fully
    usable but no longer expand into oversized empty regions on wide screens.
13. Field borders/backgrounds remain perceptible on the Super Admin warm theme,
    and hover/focus/disabled/invalid states stay distinguishable.
14. The corrected workspace remains free of page-level horizontal scrolling at
    1440, 1024, 768, 390, and 320 pixels, with no change to mobile selection,
    save behavior, permissions, or data contracts.
15. Focused layout/source tests, rendered interaction/accessibility tests,
    frontend typecheck, full frontend tests, production build, and repository
    hygiene checks pass; live browser checks are performed when a connected
    signed-in browser is available or explicitly reported as unrun.

## Open decisions

No additional product decision is required if the assumptions above are correct.
Specification approval confirms that “Management” means **margin**, that the new
**Mode** tab is the combined item editor described here, that the underlying
backend sections remain unchanged, and that the supplied screenshot is the
reference for the page-scoped Super Admin visual correction described above.
