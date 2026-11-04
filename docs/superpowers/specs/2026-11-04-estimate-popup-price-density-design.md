# Compact estimate checklist and price controls

Date: 2026-11-04
Status: Approved, implemented and locally verified on 2026-11-04 in Mode A. See the [task plan](../plans/2026-11-04-estimate-popup-price-density.md) for evidence and verification limits.

## Goal and confirmed scope

Reduce the size of the estimate submission popup, its checkboxes, text and buttons, and the price fields in the estimation screen. The user explicitly confirmed both the popup controls and the price fields behind it. This is a small presentation-only change.

## Current behavior and evidence

- `frontend/src/features/leads/EstimateSubmissionChecklist.tsx` uses the shared Dialog and three required statements. The title appears in both the toolbar and body, followed by an eyebrow and explanatory sentence.
- `estimateSubmissionChecklist.css` allows a 38rem popup, 18px checkboxes and 12px vertical padding per checklist row. Shared `components/ui/dialog.css` adds header, body and footer padding, an 18px heading and 36px action buttons.
- The item builder in `ConfiguredEstimateBuilder.tsx` renders quantity, editable selling price and calculated amount. `styles/estimator-dashboard.css` gives the compact desktop control group 386px, a price column up to 108px, an amount column of at least 138px and 32px controls.
- Client quotation uses these same row classes, but its configured price is read-only in `ClientQuotationLine.tsx`. Existing role permissions and financial behavior must remain intact.
- Existing checklist tests cover three required confirmations, close/reopen reset, keyboard focus, changing eligibility and busy state. The worktree contains earlier recommendation, checklist, dimension and user-administration work; preserve it.

## Requirements and UX

1. Limit this popup to approximately 34rem (544px) on desktop, fitting the available viewport on smaller screens. Use about 14–16px horizontal padding, 13px statement text with readable line height, and a 16px heading.
2. Show the title once. Suppress the redundant toolbar title and eyebrow locally, retaining the body heading, accessible dialog name, short instruction and close control. Do not change the appearance of unrelated dialogs.
3. Use 16px checklist boxes and approximately 8px vertical row padding. Keep the whole statement label clickable, at least 44px tall, with visible keyboard focus. Retain all three statements verbatim.
4. Make popup actions about 32px high on desktop with compact text and horizontal padding. Preserve 44px targets on touch/mobile, and wrap or stack actions without clipping. Keep the checklist scrollable on short screens, with actions reachable.
5. Compact the estimation line's price and amount controls: target a roughly 354px desktop group, a 96px price column, a 120px amount column, and 28–30px price/amount boxes. Align adjacent quantity controls within the row without changing unrelated toolbar or dimension controls.
6. Apply the price presentation consistently wherever the existing compact estimate row is used, including staff and Client screens. Preserve Client read-only prices. Use local overrides if Client styling requires them.
7. Keep visible Price/unit and Amount labels, decimal values, currency formatting, validation, Pending/Unavailable states and manual-price indications. Long values must remain readable; editable fields must allow caret navigation, and outputs must wrap rather than truncate significant digits. Retain existing mobile input typography and 44px touch controls.

## Invariants, non-goals and compatibility

No changes to prices, totals, integer-paise calculations, rate sources, permissions, saved data, APIs or approval workflow. All three checklist confirmations remain mandatory and initially unchecked, and busy/eligibility guards remain unchanged. No new dependency, global dialog redesign, application backend/OCR launch, migration, seed or live-data mutation. No commit, push or deployment.

Likely affected areas are the checklist's local stylesheet and, only if needed, its markup; compact estimate row CSS; and narrowly scoped Client price CSS. Keep existing components and contracts. Before implementation, capture the dirty-path baseline and copies/diffs of these already-modified or untracked files.

## Acceptance criteria and verification

- AC1: The popup visibly occupies less space, has one visible title, smaller checkboxes/actions and all three readable statements.
- AC2: Selecting labels and keyboard controls still works; incomplete confirmations cannot submit; closing and reopening clears checks; focus return and busy protection remain correct.
- AC3: Desktop price/amount controls are narrower and shorter, with unchanged values and editability. Large prices, validation and incomplete states remain usable.
- AC4: At 1440px, 768px and 390px, plus one short viewport, the popup and estimate rows have no clipped actions or horizontal page overflow. Touch targets remain usable. Client prices stay read-only.
- AC5: Existing unrelated work and dialogs retain their behavior. Run focused checklist, workspace, builder and Client regressions as applicable, frontend typecheck/build, rendered interaction/accessibility checks and `git diff --check`. Use synthetic frontend fixtures without starting the application backend. Record actual results in the subsequent task plan.

## Risks and open decisions

CSS specificity and existing mobile overrides can undo compact sizing; verify computed sizes in the rendered UI. Narrow numeric columns can obscure long values; verify representative large amounts and allow wrapping/responsive reflow. Pixel targets may be adjusted slightly during visual verification to preserve readability. No product decisions remain open after the user's confirmation of both areas.
