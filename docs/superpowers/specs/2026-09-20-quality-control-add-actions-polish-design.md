# Quality-control add actions polish

## Goal

Keep the Super Admin actions for adding a Frequency and a Performed-by value, while making both controls compact, aligned, and visually consistent with the existing Lisno form system.

## Current behavior and evidence

- The Inspection controls section renders each add action as a large quiet button beneath its select.
- `Add performed-by value` wraps across two lines at the current desktop width, which makes the three columns uneven and gives the secondary actions too much visual weight.
- The existing actions and option-creation dialog already work; this change is presentation-only.

## Scope

- Restyle both add actions as small accent-colored inline controls beneath their corresponding selects.
- Use the concise visible labels `Add frequency` and `Add performed by` with a small plus icon.
- Give both actions the same height, spacing, typography, hover/pressed treatment, and visible keyboard focus.
- Keep the selects as the primary visual controls and align their supporting text consistently.
- Prevent awkward wrapping and adapt cleanly at narrow widths and increased text zoom.

## Non-goals

- No changes to option creation, permissions, validation, persistence, APIs, or dialog behavior.
- No redesign of Severity, the policy message, or the rest of the quality-parameter form.

## Assumptions and constraints

- Only authorized, enabled Super Admin users continue to see these actions.
- Existing design tokens and shared button behavior will be reused; no dependency is required.
- Styling will remain scoped to the quality-parameter panel so other quiet buttons are unaffected.
- Existing unsaved work in the touched frontend files must be preserved.

## UX direction

The add actions will read as refined secondary affordances: compact plus icon, short label, restrained accent surface, and a clear hover/focus response. Their placement will remain directly below the related select so the relationship is obvious without competing with form values.

## Risks

- Overly small controls could reduce usability; the clickable area must remain comfortably operable while the visual treatment stays compact.
- Long text or zoom could reintroduce wrapping; responsive styles must allow the action to size to its content without overflowing its column.

## Acceptance criteria

1. `Add frequency` and `Add performed by` remain available under their respective selects for authorized Super Admin users.
2. Both actions use one consistent compact visual treatment and remain on one line at the reference desktop width.
3. Selects remain aligned across the Inspection controls grid, and supporting hints retain a clean reading order.
4. Hover, pressed, and keyboard focus states are visible; native button semantics and accessible names are preserved.
5. The controls do not overlap or cause horizontal overflow at supported narrow widths or at 200% text zoom.
6. Clicking either action continues to open the existing creation flow for the correct option type.

## Data, API, and accessibility impact

- Data/API: none.
- Accessibility: preserve native buttons, logical tab order, descriptive labels, and visible focus indication.

## Open decisions

None. The requested behavior and the existing form architecture establish a clear localized treatment.
