# Procurement Collapsed Estimate Sections — Specification

## Goal

Make a Procurement project preview easier to scan by presenting each non-zero approved Estimate section as an expansion panel that is closed by default, while showing only selected, non-zero Estimate items.

## Current behavior and evidence

- The Procurement project preview currently renders every returned section and all of its item cards immediately in `frontend/src/features/procurement/ProcurementWorkspace.tsx`.
- Section content has no disclosure trigger or collapsed state.
- The backend Procurement snapshot already limits Estimate lines to immutable approval-snapshot lines whose `included` value is `true`.
- The frontend currently accepts zero-valued sections and items as valid data and would render them.

## Scope

- Change the Procurement project-preview section presentation only.
- Render each eligible section as an independently expandable panel.
- Start every panel closed whenever a project preview is opened.
- Omit zero-valued Estimate items and sections from the visible preview.
- Update focused interaction and accessibility regression tests and the relevant Procurement styling.

## Non-goals

- No change to Estimate approval, selection, or pricing rules.
- No change to Finance budget calculations, expense posting, receipt storage, or Super Admin document access.
- No backend API or persistence migration.
- No change to the top-level Procurement project list.

## Requirements

1. “Selected item” means an item returned from the immutable approved Estimate snapshot; the backend remains authoritative for the `included = true` selection rule.
2. Before rendering the preview, the UI must retain only items whose `estimatedAmountPaise` is greater than zero.
3. A section must not render when its `estimatedAmountPaise` is zero or it contains no retained non-zero items.
4. The preview's section count and displayed Estimate totals must describe the retained visible sections/items.
5. Every retained section must have an accessible button trigger exposing its label, retained item count, estimated amount, and recorded spend.
6. Every trigger must begin with `aria-expanded="false"`; its associated content must not render while closed.
7. Activating a trigger must expand or collapse only that section. Multiple sections may be open simultaneously.
8. Opening a project preview must reset all sections to closed, including after navigating back to the project list and reopening the project.
9. Expanding a section must expose the existing item details, purchase history, bill actions, and Record purchase controls without changing their behavior.
10. The UI must not silently conceal recorded financial activity. If a zero-valued section or item contains non-zero actual spend or recorded expenses, Procurement must show its existing integrity-error state instead of a misleading partial preview.
11. The interaction must remain keyboard operable and pass the existing automated accessibility check.

## Assumptions and constraints

- Amounts remain integer paise.
- A positive section value with only zero-valued items is invalid for display and is omitted unless it contains recorded spend, in which case the integrity error applies.
- Expansion state is local UI state and is not persisted across navigation or reloads.
- Existing Procurement visual tokens and components will be reused; no dependency is required.

## UX impact

- Project preview initially shows compact section summaries only.
- Procurement users explicitly expand Carpentry, Electrical, or another non-zero section to see its selected Estimate items.
- Chevron/state styling must make collapsed versus expanded state visually clear without relying on color alone.

## Data and API impact

- No request or response shape changes.
- Filtering is presentational and occurs after the existing frontend lineage/integrity validation.
- Existing Finance and supporting-document queries remain unchanged.

## Risks

- Filtering before integrity validation could hide malformed or spent zero-value data; validation must run on the unfiltered response first.
- Collapsed content can break test queries and accessible relationships if trigger IDs and panel IDs are not stable.
- Expansion state could leak between project previews if it is held above the project-detail lifecycle.

## Acceptance criteria

1. Opening a project shows every positive-value Estimate section as a collapsed expansion panel.
2. No selected item details or Record purchase button is visible until its section is expanded.
3. Expanding Carpentry shows only positive-value selected Carpentry items and existing receipts/actions.
4. A zero-value item is absent; a section with zero value or no positive-value items is absent.
5. A zero-value section/item with recorded spend produces an integrity error rather than hiding the spend.
6. Sections expand independently and return to all-closed after leaving and reopening Preview.
7. Trigger `aria-expanded`/`aria-controls`, keyboard behavior, focus behavior, and automated accessibility checks pass.
8. Focused Procurement tests, frontend typecheck, build, and `git diff --check` pass.

## Open decisions

- None. The specification uses independent expansion panels because exclusive one-at-a-time accordion behavior was not requested.
