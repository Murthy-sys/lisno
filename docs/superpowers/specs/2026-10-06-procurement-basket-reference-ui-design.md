# Procurement main-basket reference styling

## Goal and authority

Match the visual composition of the user's first reference image in Procurement → Projects → murthy 1bhk → POP / Gypsum. The second image is the existing screen.

The user's latest constraint is authoritative: **UI changes only. Do not rename any existing variable or change functionality.** This is a presentation update to the existing procurement basket detail view, not a workflow redesign.

This specification is the first gate required by `AGENTS.md`. Product files have not been edited for this request. The previous award-approver approvals belong to that completed task.

## Current behavior and evidence

Read-only source inspection on 2026-10-06 found:

- `ProcurementProjectPage.tsx` already provides the project heading, back navigation, Procurement/Messages navigation, and the basket workspace.
- `ProcurementBasketWorkspace.tsx` selects a basket using the existing URL query parameter and renders breadcrumbs, back navigation, and `ProcurementBasketDetailView`.
- `ProcurementBasketDetailView.tsx` renders scope and enquiry in a grid. `procurementBasket.css` currently splits them at 1380px with a 1.17:0.83 ratio.
- `ProcurementBasketScopePanel.tsx` already contains the approved-scope heading, included items, quantities/UOM, base amounts, totals, and permitted editing controls. Its dark footer and compact typography differ from the reference.
- `ProcurementBasketEnquiry.tsx` owns vendor search/selection, pagination, invitation actions, four progress steps, comparison, and the issued-package component. The package is nested inside the enquiry column, so it does not span the entire workspace as in the reference.
- `ProcurementBasketMonitor.tsx` already includes the issued order header, Order/Site performance/Finance/Vendor alerts tabs, line table, totals, PDF download, and WhatsApp preparation.
- `ProcurementBasketLine` has no item thumbnail or descriptive image metadata. The reference contains additional actions that are not on this screen: scope search, Add item, row selection, row menus, vendor Filter, and vendor detail chevrons.
- The worktree was clean at the start of this request (`git status --short` returned no entries).

## Scope and visual requirements

### 1. Layout and visual hierarchy

- Use the reference's wider approved-scope panel on the left and a narrower vendor panel on the right, approximately 62:38 at wide desktop sizes.
- Present the current issued package directly below Approved Scope in the left column, matching its width, when it is already rendered by the existing issued-state condition. This follows the user’s latest marked screenshot and supersedes the original full-width placement.
- Use compact, consistent spacing between breadcrumbs, section headers, panels, tables, and actions. Keep existing back-navigation functionality reachable.
- Stack the existing sections at narrow widths. Keep table overflow inside table wrappers, with readable amounts and accessible actions.

### 2. Approved scope

- Use a compact theme-olive header with the Approved scope label and basket title on the left and the existing total aligned at the far right. The user’s latest correction removes the project name and item count from this header; preserve the table and total/item count in the footer.
- Restyle the table with a quiet neutral header, clearer row spacing, subtle separators, aligned amount columns, and distinct quantity/UOM presentation using the existing data expressions.
- Restyle the footer as a lightly tinted total band matching the reference hierarchy.
- Keep all existing source warnings, incomplete states, inline base-rate editing, and mode controls with their existing conditions and handlers.

### 3. Vendor selection and progress

- Match the reference's connected numbered progress indicators and panel proportions. Render the actual current step; an issued order remains Awarded even though the mockup highlights Enquiry.
- Restyle the existing search, selectable vendor rows, selection controls, pagination, and action footer. Put vendor identity and participation status in a clear hierarchy, with KPI separated visually.
- Show existing eligible state as a small label only from the current `vendor.eligible` value. Keep KPI labeled as KPI, not a rupee amount.
- Preserve every existing selected, disabled, busy, error, empty, stale, and invitation-blocker state. Keep Select all eligible and any currently supported secondary actions.

### 4. Issued package

- Match the theme-olive header with vendor/order identity on the left and the actual issued total on the right. Use compact typography (16px heading, 18px total, 12px table text) to suit the scope-width card.
- Make the existing four tabs evenly arranged across the section with a clear selected underline.
- Restyle the existing order table and arrange the existing totals and download/share actions compactly beneath it, wrapping on smaller screens.
- Retain awarded item descriptions, optional metadata/terms, all tab contents, and all current button/link semantics.

### 5. Visual language and accessibility

- Reuse the established typeface and theme; use forest green, warm off-white surfaces, neutral borders, and deliberate spacing.
- Follow the reference's composition while respecting the user's standing constraints: no new icon library, drop shadows, harsh gradients, decorative animation, or unrelated visual effects. Optional decorative icons must be inline SVG/CSS with `aria-hidden`, not extra controls.
- Preserve semantic headings, accessible names, focus indicators, keyboard/tab behavior, table semantics, and document reading order. Decoration must not intercept pointer input.

## Strict non-goals and invariants

- No renaming of existing variables, functions, props, types, fields, or CSS custom properties. Existing CSS classes may receive scoped presentation changes; presentation-only classes/wrappers may be added.
- Existing hooks, state, effects, expressions that choose workflow behavior, callbacks, validation, query keys, fetches, mutations, permissions, selection rules, calculations, and enabled/disabled conditions remain unchanged.
- No backend/API/schema changes, dependency/lockfile changes, global stylesheet redesign, modal redesign, approval changes, or issuance changes.
- No new search/filter/add-item/row-selection/menu/detail actions simply to imitate the mockup. No inert lookalike controls.
- No invented thumbnails, descriptions, amounts, bid prices, status counts, project-status controls, critical alerts, or blanket “Scope locked” claim. Use only current available data and supported actions.
- Preserve the existing earlier-enquiry and invitation disclosures; their removal is not part of this request.
- Do not hardcode the project name, basket name, vendor names, totals, or IDs. The shared basket detail view receives consistent styling; project lists, basket overview cards, public vendor pages, award modal, and other screens retain their current appearance.
- No live invitations, approvals, orders, external messages, commits, or deployment as part of visual QA.

## Approach and affected areas

Use scoped CSS and presentational JSX only. Reorganize layout containers where necessary to place the existing issued package directly below the approved-scope card while keeping component ownership, lifecycle, props, event handlers, DOM target IDs, and state conditions intact. Do not lift enquiry state, duplicate queries/components, or rewrite functional code to achieve layout.

Expected areas: `procurementBasket.css`, `procurementBasketScope.css`, `procurementBasketEnquiry.css`, and the presentation portions of `ProcurementBasketWorkspace.tsx`, `ProcurementBasketDetailView.tsx`, `ProcurementBasketScopePanel.tsx`, `ProcurementBasketEnquiry.tsx`, and `ProcurementBasketMonitor.tsx`. Existing project-header presentation may be scoped through the procurement page selector only if necessary. API modules and shared component implementations are out of scope.

## Assumptions and risks

- The screenshots guide styling; the app's actual data and existing behavior remain authoritative.
- The shared main-basket detail view should look consistent across projects. This does not authorize business-rule changes or a special case for this project's ID.
- Main risks are broad CSS leakage, table overflow, inaccessible layout flattening, lost stage-scroll targets, and accidental lifecycle/handler changes while rearranging markup. Scope selectors narrowly and inspect the final diff against these invariants.
- No persistence or migration impact. Rollback is limited to the bounded presentation changes; preserve any later unrelated work.

## Acceptance criteria and verification

1. At comparable desktop width, the page follows the reference's two-column upper layout, dark scope header, refined scope/vendor rows, light total footer, and scope-width issued package immediately below Approved Scope.
2. All text/data remain genuine current values; the actual workflow stage, eligibility, disabled reasons, selections, totals, and available actions are unchanged.
3. No existing variable/prop/function names or functional statements are changed. No new network requests, mutation paths, or dependencies are introduced.
4. Search, select-all, individual vendor selection, pagination, stage navigation, permitted inline editors, package tabs, PDF, and WhatsApp actions retain existing handlers and guards.
5. Desktop, intermediate, and mobile widths are visually inspected with representative data; long vendor/order names and amounts do not create page-level overflow. Keyboard and accessible-name behavior remains intact.
6. Existing focused workspace and monitor regression tests, frontend typecheck/build, and `git diff --check` pass. Add only targeted rendered/layout checks if needed to protect a real presentation regression; do not mirror CSS implementation with tests.
7. A final diff review confirms that backend, contracts, shared business logic, unrelated screens, and existing variable names are untouched. Report checks and limitations accurately.

## Open decisions

None needed for this visual scope. Implementation remains behind the repository's specification, separate task-plan, and execution-mode gates.

## Latest presentation correction

The user’s marked screenshot on 2026-10-06 explicitly places Issued Package in the empty left-column space below Approved Scope, with smaller fonts and matching card width. This is a bounded correction to the authorized presentation work. Preserve all issued content, tabs and actions, with natural height rather than clipping to a fixed height. At narrow widths keep the existing stacked reading order.

Latest colour correction: both Approved Scope and Issued Package header backgrounds use light olive `#dfe7d7`, matching the selected sidebar child item. Header text uses `--workspace-ink` (`#30382b`) for readable contrast. All other layout, data and behaviour remain unchanged.
