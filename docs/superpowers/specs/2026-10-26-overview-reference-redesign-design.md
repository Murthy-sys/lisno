# Main Line Overview reference redesign

Date: 2026-10-26
Status: Approved by the user on 2026-10-26
Classification: Substantial frontend visual redesign; existing behavior and contracts preserved

## Goal

Redesign the content of Configuration > Main Line > Overview to closely match the screenshot supplied in this conversation: a narrower UOM/settings panel on the left, a wider Surfaces panel on the right, generous readable controls, olive selected states, and a quiet architectural background detail.

The screenshot is the composition and hierarchy reference. Live saved data remains authoritative; the example `sq-ft`, `Ceiling`, and selected tier values must not become hardcoded defaults.

## Current behavior and evidence

- The route `/admin/configuration/estimation/items/:itemId` renders `KnowledgeItemWorkspacePage.tsx`. Its Overview branch mounts `KnowledgeOverviewPanel` with dimensions and applicable tiers enabled (currently lines 685 onward).
- `KnowledgeOverviewPanel.tsx` already contains UOM selection/creation, client visibility, dimension requirements, applicable tiers, and the selected-surfaces panel. The change is principally presentation and content hierarchy.
- `knowledge-overview-table.css` currently uses a 3:7 split above a 48rem content-container width, compact panel padding, 1rem headings, 0.75rem supporting text, and 32px desktop shortcut buttons. These are substantially denser than the supplied reference.
- `KnowledgeModeSurfacePanel.tsx` provides the searchable selector, two create shortcuts, and a semantic table with number, name, description, edit, and remove actions. Its heading currently uses a person icon; the reference uses stacked surfaces. Surface rows currently have no visual thumbnail.
- `KnowledgeMaster` / `KnowledgeSurface` in `shared/knowledge/knowledgeTypes.ts` have no image field. A reference-style thumbnail must be decorative, without implying that a catalogue photo exists or adding a new image-data contract.
- Client visibility currently controls display on the client estimate screen. Its explanatory text explicitly states that an internal line remains included in totals and PDF/quotation. The reference's shortened wording must not obscure this distinction.
- Dimension guidance is calculated by `resolveEstimateDimensionRule` from the selected UOM. Unsupported units cannot enable the requirement; a retained incompatible setting shows a warning.
- Applicable tiers are Signature, Premium, and Functional. Changes affect Mode tabs after Overview is saved; hiding a tier retains its saved configuration.
- These components also serve proposal/Procurement consumers. The redesign must be explicitly scoped to the Configuration Main Line workspace.
- The shell already paints `configuration-header.webp` through `configuration-shell.css`. Overview-specific decoration must not duplicate or change that global background treatment.

## Worktree preservation

The initial `git status --short` contains substantial existing backend, frontend, mobile, and shared work. Relevant pre-existing edits in `KnowledgeOverviewPanel.tsx` and its test add dimensions and tier controls; edits in `KnowledgeItemWorkspacePage.tsx` add tier-aware Mode navigation. Their diffs were inspected during specification discovery. These are part of the working baseline and must be preserved.

No product source has been changed for this request. Recheck the dirty-path set and target diffs before implementation, since another task may change the shared worktree. Do not stage, commit, revert, or reformat unrelated work.

## Scope and recommended approach

Extend the existing React panels with a Configuration-specific presentation scope and local CSS. Reuse their inputs, state, permission checks, mutation callbacks, and save controls. Keep Poppins, the current interface font. Use authored inline SVG for the reference's small decorative symbols and architectural linework, without adding an icon or animation dependency.

Expected affected areas are `KnowledgeOverviewPanel.tsx`, `KnowledgeModeSurfacePanel.tsx`, `knowledge-overview-table.css`, their focused tests, and the workspace call site only if needed to opt into the presentation. Any small visual helper or fixture should stay within this feature/test area. Existing shared styles in the overview stylesheet also style the workspace status row; restrict changes to the Overview content selectors.

No backend/API/schema changes, pricing or dimension-calculation changes, new Surface image system, mobile-app redesign, global theme change, navigation redesign, save-toolbar redesign, new dependencies, migrations, external writes, commits, or deployment are in scope.

## Visual and content requirements

### Layout

1. At sufficiently wide content widths, use approximately a 1:2 UOM-to-Surfaces split, with a 16–24px gutter and both panels aligned at the top. The shorter Surfaces panel must retain its natural height.
2. Allow roughly 20–28px internal panel spacing at wide widths, reducing it on narrow screens. Size to the actual workspace container after navigation and sidebars, rather than copying the screenshot's pixel dimensions.
3. Stack UOM/settings above Surfaces when either column would become cramped. Preserve this DOM and keyboard order. Tier options may wrap without truncating labels.
4. Use warm off-white surfaces, dark text, muted supporting text, olive accents, fine neutral borders, and restrained corners. Respect the standing restrictions on drop shadows, harsh gradients, excessive rounding, Lucide icons in newly redesigned content, and hover animations.
5. Match the reference's hierarchy with roughly 20–24px panel titles, 14–16px field labels/body text, and 44–48px minimum interactive heights. Tune final sizes against the real workspace, with no clipped text at 200% zoom.

### Left panel

1. Show an olive cube symbol beside `UOM` and `Choose the unit used to measure this Main Line.`
2. Place the labelled UOM selector and square add-unit shortcut on the same row. Preserve unresolved selections, active/inactive-option rules, reference loading/error/retry states, permissions, and quick-add focus behavior.
3. Show `Is this main line needed for the client?`, a concise explanation above its Yes/No controls, and full clickable option labels. Use an olive wash and native selected radio indicator. Clarify that No hides the line on the client estimate screen while totals and PDF/quotation still include it, at least when No is selected.
4. Show `Dimensions mandatory?`, `Require Length, Width and Height from Sales or the client.`, then Yes/No controls. Below them, display the unit-aware explanation in a subdued blue information block as in the reference. Keep unsupported-UOM guidance and incompatible-saved-state warnings visible. Never hardcode feet or square feet for other units.
5. Show `Applicable tiers`, then `Save Overview to update the Mode tabs. Hiding a tier keeps its saved configuration.`, followed by Signature/Premium/Functional checkbox options with olive selected backgrounds.

### Right panel

1. Show a stacked-surface symbol beside `Surfaces` and `Select every surface where this Main Line can be used.` Keep the olive `Add Surface` action at the upper right on wide layouts and wrap it naturally on narrow layouts.
2. Place the `Applicable surfaces` label, searchable selection control, and square create shortcut in the reference arrangement. Keep selection multi-valued and retain both shortcuts' existing create-and-select behavior; the plus must not become an unrelated action.
3. Present the table with a light neutral header, uppercase visual column labels, readable row spacing, and aligned actions. Keep row numbers, selected order, descriptions, inactive/archived/proposed/unavailable states, and the empty state.
4. Include a small neutral architectural illustration beside each known surface name to echo the screenshot. Treat it as decoration, hidden from assistive technology, with no name-based lookup or fabricated photo metadata. A shared generic illustration is the fallback because the current contract has no image field.
5. Style edit actions with olive emphasis and remove actions with restrained red emphasis. Preserve accessible names: edit changes the reusable Surface, while remove only detaches it from the Main Line. Do not change removal into catalogue deletion.
6. Add faint, non-interactive architectural linework in the otherwise open lower-right content area. Keep it behind content, hidden from accessibility APIs, clipped to the Overview canvas, and reduced/hidden on narrow layouts. Avoid extra layout height solely to display decoration.

## Behavior, data, and permission invariants

- Continue using `uomId`, `surfaceIds`, `clientVisible`, `dimensionsMandatory`, and `applicableTiers` with their existing defaults and stable IDs.
- Preserve dirty-field tracking, payload merging, explicit save/discard, version-conflict handling, cached data refresh, and save-driven Mode-tab updates.
- Preserve `editable`, `saving`, catalogue readiness, `canQuickAdd`, and edit-callback gates. Read-only content remains inspectable with disabled or unavailable mutation actions as currently designed.
- Render loading, empty, stale-reference, missing-value, error/retry, disabled, selected, and focus states. Never replace unresolved values with plausible catalogue entries.
- Keep fieldsets/legends, native radios/checkboxes, table semantics, labelled controls, and keyboard-operable search/create/edit/remove flows. Decorative icons must not duplicate accessible names.
- Selected states require a checked indicator in addition to color. Maintain readable contrast, visible focus, and touch targets of at least 44px. No new animation is required; reduced-motion users receive the same usable static layout.
- Other Overview consumers, Mode surfaces, proposal workflows, and Procurement retain their existing presentation and behavior.

## Assumptions and open decisions

- The requested target is the web Configuration Main Line Overview, identified by the exact controls in the attachment.
- The attachment defines visual hierarchy and layout; it does not request changes to calculation, financial visibility, surface-edit semantics, or persistence.
- Use a decorative Surface illustration rather than a new upload/image feature. Use local SVG linework for the architectural background detail.
- The supplied screenshot is available in the conversation; no source design file or exact illustration asset was supplied. Recreate its treatment with existing tokens and small local vector details.
- No unresolved architectural decision blocks this specification. Approval confirms these scope assumptions.

## Risks and mitigations

- CSS layering can override local sizing: scope the reference treatment explicitly and inspect computed/rendered results inside the real shell.
- Shared components can leak changes to Procurement: opt into the Configuration treatment and check both consumers.
- In-progress dimension/tier work can be overwritten: preserve its current logic and tests, refresh the baseline before writes, and review only this task's incremental changes.
- The left panel can become too narrow within the sidebars: choose the stacking threshold by usable content width; check long UOM/surface names and wrapped tiers.
- Screenshot wording can imply different financial behavior: retain accurate contextual visibility and dimension guidance.

## Acceptance criteria and verification

AC1. At wide content widths, the Overview matches the reference's two-panel hierarchy, approximate 1:2 ratio, spacing, olive controls, surface table, and quiet linework. At narrower widths it stacks without overlap or page-level horizontal scrolling. Verify rendered screenshots at 1920, 1440, 1024, 768, and 390px, plus 200% zoom.

AC2. UOM, visibility, dimensions, and tiers retain correct saved values and callbacks. Verify selecting/changing units, supported and unsupported dimension rules, read-only/saving states, explicit tier deselection, and save/discard behavior using existing focused tests and rendered interaction checks.

AC3. Surface search/selection, both create shortcuts, edit, and detach remain operable with correct permissions and stable-ID behavior. Verify empty, multiple/long-name, inactive, archived, missing-value, loading, and failed-reference states; check keyboard selection and dialog focus restoration.

AC4. Native semantics, accessible names, selected indicators, focus visibility, touch targets, and text contrast remain usable. Verify keyboard navigation and automated accessibility checks in the rendered fixture/workspace. Decorations must not intercept input or appear in the accessibility tree.

AC5. Configuration styling does not affect proposal/Procurement Overview, Mode surface content, surrounding tabs, or the workspace status/save row. Run relevant existing consumer tests and inspect a representative alternate consumer.

AC6. Relevant frontend tests, `npm run typecheck`, `npm run build`, and `git diff --check` pass on the integrated result. Use existing `KnowledgeOverviewPanel`, `KnowledgeModeSurfacePanel`, workspace layout/screen, and proposal coverage proportionately. Report actual commands/results and any pre-existing failures separately. No lint script exists.

## Approval boundary

This artifact is the specification only. The repository requires specification approval, a separate approved task plan, and execution-mode selection before product implementation. No task plan or implementation is included in this stage.
