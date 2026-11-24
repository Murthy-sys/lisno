# PMC switch info popup

In the Estimation item row, `EstimatePricingModeControl` currently prints the reason beneath the disabled PMC switch. The goal is to keep the row compact and let the user read the same message on demand.

## Acceptance criteria

- When the row supplies a reason, show a small info button beside the PMC switch, following the existing estimate info icon style. Keep the popup closed initially.
- Clicking, tapping or keyboard-activating the info button opens a popup with the exact reason for that row. The button remains usable while the switch is disabled. Give it an accessible name that identifies the item.
- Allow dismissal with the info button, Escape or a click outside. Keep the popup readable on narrow screens and restore keyboard focus to the trigger on Escape.
- When no reason is supplied, show just the existing switch. Opening or closing help must preserve the selected mode and estimate values.

This is a frontend presentation change. The existing reason and eligibility logic remain the source of truth. Verify both blocked and available rows, keyboard interaction, and touch layout. No API, persistence or pricing changes are required.
