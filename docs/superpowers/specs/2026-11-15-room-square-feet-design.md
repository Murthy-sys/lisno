# Room area beside inline dimensions

Date: 2026-11-15
Status: Proposed for approval

## Goal and current evidence

Show the square feet calculated from each selected room's Length and Width inside the existing Rooms dropdown. For example, 200 ft × 200 ft displays **40,000 sq ft**.

`frontend/src/features/leads/RoomsMultiSelectDropdown.tsx` already receives each saved room's ID, length, and width and renders the two inputs. Its row styles are in `frontend/src/styles/estimator-dashboard.css`. Sales and Client share this picker, so the addition needs no new parent bindings. Sales separately derives rounded saved `sqft`; that existing behavior is outside this display change.

## Requirements and scope

- Add a read-only **Area (sq ft)** result after Width for each selected room. Update immediately from its current Length × Width; use digit grouping and at most two decimal places without trailing zeroes.
- Show **Not set** if either measurement is missing, non-positive, or non-finite, or the product is non-finite. Do not show misleading zero, NaN, or Infinity values.
- Keep Length and Width beside the room name. At narrow widths, the area may sit below the measurement columns within the same row container to preserve readable fields and avoid horizontal overflow.
- Reuse the existing typography, colors, and spacing. The result is plain text with an accessible room-specific name, not another editable input or card.
- Display the result in read-only mode as well. Preserve selection, keyboard interaction, search, removal, saved IDs, callbacks, calculation/save rules, and stored values.

Scope is the shared picker, its scoped CSS, and proportionate verification. No backend/API, dependency, lockfile, migration, workflow, vendor, or Project Manager changes. Preserve all existing dirty work.

## Assumptions, risks, and decisions

Dimensions are in feet, as the existing labels state. This is a derived UI preview, not a new persisted area field. Main risks are cramped mobile rows and invalid-number output; use responsive placement and explicit value checks. No product decision remains open.

## Acceptance and verification

1. Entering 200 and 200 shows 40,000 sq ft; changing either value updates only that room's result. Decimal measurements display up to two decimal places.
2. Missing or invalid values show Not set; read-only rooms show their derived result without enabling edits.
3. Existing room controls retain behavior and styling, with no horizontal overflow at desktop, 390px, and 320px.
4. Keep verification focused on the picker suite, frontend typecheck/build, a rendered responsive check, and `git diff --check`. Do not repeat unrelated suites.

This stage creates only the specification, following the repository's approval gates. Implementation follows approval of this specification, the separate task plan, and execution-mode selection.
