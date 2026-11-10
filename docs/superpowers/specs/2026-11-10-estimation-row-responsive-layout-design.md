# Responsive estimation row and UOM caption removal

Date: 2026-11-10
Status: implemented and verified under the approved Mode A task plan.

## Goal and scope

Prevent Tier, Standard/Special, pricing-method and quantity/rate/amount groups from overlapping at any supported screen or container width. Remove the UOM caption directly below the Main Line name, as marked in the screenshot. Keep this a frontend presentation correction only.

The screenshot shows Configuration's Client view preview. It shares `EstimateLineLayout` and `EstimateLineChoice` with the Sales/Estimator builder and Client quotation rows, so fix the shared presentation rather than create a preview-only workaround.

## Current evidence

- The initial worktree is clean.
- `frontend/src/features/estimates/EstimateLineRow.tsx` renders the name followed by `<small>{unit}</small>` in the shared item choice. The marked caption is beneath the Main Line name, rather than the basket header.
- `frontend/src/styles/estimator-dashboard.css` defines shrinking flex groups with `min-width: 0`, unwrapped option labels, fixed minimum widths for fields, and an intrinsic grid override above a 1050px row-container threshold. These rules can allow control contents to exceed their allocated group width; runtime verification will establish the exact failing width/state.
- Shared callers include `ConfiguredEstimateBuilder.tsx`, `ClientQuotationLine.tsx`, and `KnowledgeMainLineClientPreview.tsx`. Standard has fewer controls than Special; readonly Type text and editable Standard/Special radios both need coverage.

## Requirements

1. Keep each visible control group inside the row. Tier labels, Standard/Special text or options, pricing controls and quantity/rate/amount fields must never overlap, clip each other or create horizontal page overflow.
2. Use the available row/container width, including inside the Client view drawer and beside the estimator sidebar. Wrap/reflow groups before their contents collide. Do not force a desktop single-row layout onto a narrow container or reserve large empty columns for absent controls.
3. Cover Standard and Special, editable and readonly type presentations, applicable/disabled tiers, PMC/In-house controls, rows without optional groups, and long Main Line names. Preserve the existing reading order: name, tier, type, pricing method where present, then quantity/rate/amount.
4. Remove only the UOM caption under the Main Line name from the shared choice presentation. Keep the UOM data, accessible quantity/rate names, and units in Qty/Rate headings and calculations.
5. Preserve selection state, Standard/Special values, disabled tiers, locked price fields, configured price calculations, permissions, recommendation behavior and save payloads. This request changes layout, not which classification is selected.
6. Preserve the existing visual system and controls. No redesign, new icons, font/palette changes, dependency, backend/API change, database operation or unrelated cleanup.
7. Keep keyboard access, focus indicators, touch targets and readable labels. Reflow content rather than hide the Type field or truncate option names to mask overlap.

## Integration and verification

Extend the existing shared row styles and remove the shared name-caption markup. Keep compatibility at existing callers unless a small presentation-prop adjustment is necessary; do not alter their business logic.

Verify rendered rows in both the estimator and Client view preview across mobile/tablet/laptop/desktop widths (at least 320, 390, 768, 1024, 1280 and 1536px), including narrow drawer/sidebar containers and the existing row-query thresholds. Check coarse-pointer/touch sizing as well as ordinary desktop controls. Use long names, Standard and Special, readonly Type, and disabled prices/tiers. Check element bounds for non-overlap and inspect representative desktop/mobile screenshots using safe synthetic data.

Run focused frontend presentation/preview regressions, frontend typecheck/build, and `git diff --check`. No backend/OCR suite is needed for this frontend-only change. Do not add tests that merely duplicate CSS declarations; rendered geometry verifies the reported defect.

## Acceptance criteria

- **AC1:** Tier, Type and fields do not overlap or clip at the tested viewport/container boundaries for Standard and Special.
- **AC2:** The marked UOM caption is absent below the item name in shared estimator/preview/quotation presentation; Qty/Rate units remain present.
- **AC3:** Long names wrap and optional groups consume only needed space; no horizontal overflow, lost controls or broken touch/keyboard access.
- **AC4:** Classification values, configured prices, disabled/editable states and save behavior remain unchanged by resizing or the markup correction.
- **AC5:** Focused tests, frontend typecheck/build, rendered width/state checks and final hygiene pass; task-owned browser artifacts are cleaned.

## Risks, assumptions and non-goals

The main risk is the interaction between wide-row grid rules, smaller-container wrapping and larger touch controls. Shared styles affect three existing presentations, so verify them together. The screenshot's marked UOM is interpreted as the Main Line name caption; no unit is removed from a quantity/rate label. No unresolved product choice requires clarification. No migration, seed, commit, push or deployment is included.

After approval, create the separate task plan before the execution-choice gate. No implementation has begun.
