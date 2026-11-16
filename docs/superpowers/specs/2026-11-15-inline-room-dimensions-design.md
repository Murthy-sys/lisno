# Room dimensions in the selection dropdown

Date: 2026-11-15
Status: Proposed for approval

## Goal and confirmed direction

Show **Length (ft)** and **Width (ft)** on the same row as each selected room inside the existing Rooms dropdown. Remove the separate dimension cards below Project details. Preserve the current visual styling and saved room measurements.

The user supplied the Common Areas dropdown and separate Living & Dining/Kitchen dimension cards, then clarified: “show in same line with item.” This means inline fields alongside each selected room, not a second room selector or a panel beneath each row.

## Current behavior and evidence

- `frontend/src/features/leads/RoomsMultiSelectDropdown.tsx` owns the searchable grouped room picker, selection count, chips, select/deselect-all, Clear all, and Done. It currently renders each room as a button with `role="option"` inside a multiselect listbox.
- `frontend/src/features/estimates/EstimateSetupFields.tsx` renders that picker and a separate `RoomDimensionsAccordion` section. The accordion creates the full-width cards shown in the screenshot, including repeated room headings, status, and removal controls.
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` owns Sales room state, dimension updates, area derivation, item cleanup, and saving. Its dropdown selection keys are room type IDs; dimension updates use stable saved room IDs.
- `frontend/src/features/client/ClientQuotationSetup.tsx` uses the same setup presentation. Its selection keys can be `type:<typeId>` or `saved:<roomId>` to retain duplicate/legacy rooms. It owns permission checks, version recovery, validation, and room-removal confirmation.
- Existing presentation is styled in `frontend/src/styles/estimator-dashboard.css`. Relevant rendered coverage exists in `RoomControls.test.tsx`, `EstimateSetup.test.tsx`, Sales workspace tests, and Client quotation tests.

## Scope and non-goals

Apply the layout to the shared estimate-configuration room picker used by Sales and Client setup. Change presentation and its frontend bindings only. Preserve backend contracts, stored dimension units, estimate calculations, approval history, removal rules, and save behavior. Do not redesign Project details or basket/item selection, add dependencies, or change vendor/default-Project-Manager work.

## Interaction and visual requirements

1. An unselected room shows its existing selection control, icon, and name without dimension inputs.
2. Selecting a room reveals exactly two inputs on that same dropdown row: Length (ft) and Width (ft). Already selected rooms show their saved values when the dropdown opens. A blank measurement stays blank.
3. Remove the separate Room dimensions card section. Do not add repeated dimension headings, area/status badges, or another selector to replace it.
4. Entering or focusing a measurement must not deselect the room, close the dropdown, or trigger form submission. Room selection remains an explicit action on its selection control/name.
5. Search, grouped headings, selection counts, selection chips, bulk selection, Clear all, and Done remain available. Search or closing/reopening the dropdown does not discard dimensions or modify selection. Search only changes which rows are visible.
6. Preserve the existing colors, typography, field borders, room icons, spacing character, and focus treatment. Add no icon library or new visual theme. Align compact measurement columns across selected rows. Long room names may wrap within the name column; preserve the fields beside the room name without horizontal page overflow at 390px and 320px.
7. Keep keyboard navigation and visible focus. Use form/popover/group semantics suitable for interactive checkboxes and inputs; do not nest inputs inside an option button or leave invalid listbox semantics around editable controls. Give each measurement an accessible name including its room. Escape and Done close the dropdown and restore focus to its trigger.
8. Existing measurements remain inspectable in read-only states. Opening/closing the picker for inspection must not enable selection, dimension editing, removal, or saving when the parent disallows them. Loading, busy, stale, and permission guards remain authoritative.

## Data and state invariants

- The parent remains the source of truth for selection and dimensions. Reuse its existing callbacks and save operation; do not create another measurement store or save on dropdown close.
- Explicitly connect each option's selection key to its stable room ID. Never join by display label, array position, or an assumption that `typeId === room.id`.
- Preserve retained rooms, duplicate legacy names/types, their saved IDs, and existing dimensions independently. Do not collapse multiple saved records into one editable value.
- Deselecting/removing a room continues through the existing parent behavior, including Client confirmation and protected-removal checks. Typing in a field never invokes removal.
- Preserve current numeric/null conversion, dimension validation, and area calculation. No API, persistence, permission, or migration change is proposed.

## Assumptions, risks, and failure handling

The shared presentation change applies consistently to Sales and Client setup. The main risks are incorrect stable-ID mapping, accidental selection toggles during editing, loss of read-only visibility, and cramped dropdown rows. Address these with explicit bindings, semantic form controls, parent-owned mutation guards, and rendered width/state checks. Existing loading/error messages and draft-retention behavior remain in the parent screens.

All relevant implementation targets are currently clean; the worktree contains unrelated vendor and default-Project-Manager changes that must be preserved. No production data, seed, deployment, commit, or push is in scope. Rollback is a local frontend revert; stored values remain compatible.

No product decision remains open. Internal prop/type placement can be settled in the task plan without changing the behavior above.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence |
| --- | --- | --- |
| AC1 | Selected rooms show Length/Width beside their names inside the dropdown; unselected rooms have no fields; no separate cards remain. | Rendered shared-control/setup tests and desktop browser inspection. |
| AC2 | Editing one room changes only its stable record; reopening/searching preserves measurements and selection. | Two unequal room fixtures, option IDs differing from room IDs, duplicate/retained Client rooms, save/reload regression. |
| AC3 | Input interaction does not toggle selection or submit; removal and parent guards remain intact. | Keyboard/pointer tests, Client confirmation and read-only/busy checks. |
| AC4 | Accessible names, focus return, and valid form semantics work at desktop and narrow widths without overflow. | Rendered accessibility checks and browser QA at 1440px, 390px, and 320px. |
| AC5 | Existing styling, calculation/save contracts, and unrelated work are preserved. | Focused Sales/Client regressions, frontend typecheck/build, scoped diff review and `git diff --check`. |

This specification stage changes only this document. Implementation and its tests begin after specification approval, a separately approved task plan, and the execution-mode selection required by `AGENTS.md`.
