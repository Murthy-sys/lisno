# Compact PMC toggle in estimation items

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

Replace the editable three-option PMC/Sub-Vendor/In-house radio group with a
compact PMC toggle. Turning it on directly selects PMC; turning it off exposes
only In-house and Sub-Vendor choices.

## Current behavior and evidence

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, in
  `ConfiguredLineRow`, renders all three pricing-mode radios for editable
  Special items. Standard and read-only items show the effective mode as text.
- `frontend/src/features/leads/configuredEstimate.ts:136` already applies an
  explicit pricing-mode change through `updateConfiguredLinePricing`: it uses
  the selected tier's current configured rate and updates rate source. Manual
  prices survive unrelated quantity edits; deliberate mode changes adopt the
  new mode's pricing.
- `backend/src/routes/estimates.ts:92` requires Standard items to use Sub-Vendor.
  The new control must not silently change that classification rule.
- `ScopeSectionsToggleList.tsx` establishes accessible switch semantics in this
  feature area. Reuse the existing visual language without adding a dependency
  or importing the full scope-list layout into an item row.

## Proposed interaction

Within the existing editable Special-item pricing controls:

| State | Compact controls | Effective saved mode |
| --- | --- | --- |
| PMC on | PMC toggle on; other mode choices hidden | `pmc` |
| PMC off | PMC toggle off; In-house/Sub-Vendor choices visible | Selected `in_house` or `sub_vendor` |
| Read-only | Existing pricing-mode text | Existing stored mode |
| Standard item | Existing Sub-Vendor presentation | Existing Standard-item rules |

No additional PMC radio or confirmation step. The switch derives its checked
state from `line.pricingMode === "pmc"`, so it cannot disagree with the price
calculation or saved mode.

## Requirements

1. Turning PMC on invokes one explicit mode change to `pmc` immediately. Hide
   the In-house/Sub-Vendor controls while it is on. Keep the switch focused.
2. Turning PMC off restores the previous non-PMC mode when known for that line
   in the current editor, otherwise selects Sub-Vendor, the existing default.
   This invokes the existing mode-change pricing behavior. Do not restore an
   obsolete manual rate or silently select a different tier.
3. Remember only the prior non-PMC mode in temporary UI state, keyed by stable
   line identity and scoped to the current estimate. It is not a second source
   of pricing truth or a new persisted field. A saved PMC line opened afresh
   shows the switch on; switching it off defaults to Sub-Vendor if no prior
   choice is known. Preserve current unspecific/mode-less legacy rows on load;
   displaying the controls must not itself change data.
4. With PMC off, render only the two non-PMC choices as a compact labelled radio
   group. Choosing either updates `pricingMode` through the established handler.
   Toggling PMC never changes another row, room or basket.
5. Retain the current Standard/Special rules. Changing Special to Standard
   follows the existing Sub-Vendor reset. Read-only, historical, excluded and
   pending-save behavior remains as currently authorized by the parent editor.
6. Retain pricing, tier availability, component selection/calculation, manual
   override, source freshness, validation and integer-paise behavior. If a chosen
   mode has incomplete pricing, show existing validation instead of falling back
   to another mode or inventing a price. Ordinary rendering and quantity edits
   must not reset a manual selling price.
7. Keep the controls in one compact row where space permits and wrap naturally
   on mobile. Avoid a separate card, duplicated mode text or decorative icons.
   Keep the recently removed configured/base-price annotation hidden.
8. Use a properly labelled keyboard-operable switch with its checked state
   exposed to assistive technology. Keep both non-PMC choices in one labelled
   radio group with normal arrow-key behavior. Labels must identify the item and
   room; focus remains visible and controls retain usable touch targets.

## Scope and assumptions

This is the per-item control in the shared staff estimation builder used by
Sales and Designer. It changes how users select an existing mode, not the
available roles, item classifications or pricing policies. Client quotation
controls, Configuration administration and published artifacts are outside scope.

The user's request establishes the toggle interaction. Restoring the previous
non-PMC selection, with Sub-Vendor as fallback, avoids an extra selection step
while retaining a defined effective mode. No separate product choice is needed.

## Data, API, compatibility and failure handling

Continue saving only the existing `pricingMode` enum. No schema/API, backend,
migration, new dependency or approval-workflow change is proposed. Existing saved
PMC/In-house/Sub-Vendor estimates must render accurately without automatic writes.
Save/Submit still use their existing validation, version and recovery paths.
Missing rates and unavailable tiers remain explicit; temporary UI memory must
never overwrite refreshed saved values.

Backend and OCR services were stopped at the user's request. Do not start or
restart them for this task; use isolated mocked browser fixtures for UI checks.
Execution note: a backend independently launched from a VS Code terminal was
observed later and left untouched. No agent changed backend/OCR service state.

## Risks and acceptance criteria

- Avoid two sources of state: the toggle must always reflect the actual mode.
- Avoid stale remembered choices leaking across stable line/estimate identities.
- Verify Sub-Vendor -> PMC -> Sub-Vendor and In-house -> PMC -> In-house; verify
  a freshly loaded PMC line defaults to Sub-Vendor on toggle-off.
- Verify PMC is selected with one click, no PMC radio remains, and the two other
  choices appear only when PMC is off.
- Verify saved mode reload, mode-less legacy rows, Special-to-Standard reset,
  manual-rate preservation on unrelated edits, and correct rate/amount changes.
- Verify incomplete mode pricing remains blocked by existing validation and
  component behavior is preserved; no configured reference-price text returns.
- Verify keyboard focus, switch/radio accessible names and desktop/mobile layout
  using the actual configured-row component with synthetic data.
- Run affected builder/workspace pricing regressions, frontend typecheck/build
  and `git diff --check`. Preserve earlier dirty work; no commit or deployment.

## Open decisions

None required within this scope.
