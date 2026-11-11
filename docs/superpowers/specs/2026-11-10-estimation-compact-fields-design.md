# Compact estimation quantity and price fields

Date: 2026-11-10
Status: approved, implemented and verified under Mode A.

## Goal and evidence

Keep Qty, Rate and Amount compact instead of stretching across unused row space, as shown in the latest estimation screenshot.

The shared `.configured-estimate-line__fields` in `frontend/src/styles/estimator-dashboard.css` uses `flex: 1 0 304px` and three `1fr` grid columns. The group grows into remaining space and divides it across the fields. Client view preview also defines fractional field columns in `frontend/src/features/ai-estimator-knowledge/knowledge-main-line-client-preview.css`.

## Requested behavior and scope

- Give Qty and Rate compact, bounded widths appropriate to their controls and headings. Give Amount enough room for its value without distributing all spare row width among these fields.
- Preserve the field group's alignment on the right of wide rows while reducing the Qty/Rate widths. Do not move the fields beside the Main Line name. Preserve the responsive wrapping from the preceding change, including narrow containers and touch controls.
- Keep units, full values, keyboard access, focus indicators and current touch target sizes. Let long readonly amounts wrap when needed; do not truncate financial values.
- Change only shared field sizing and any directly conflicting preview sizing. Preserve the current name/tier/type/pricing controls and the removed UOM caption.
- No changes to quantities, configured prices, disabled price inputs, tier availability, calculations, permissions, save behavior, API, data, dependencies or other styling.

Existing uncommitted changes from the preceding responsive-row task are the baseline and must be preserved. No migration or external action is needed.

## Acceptance and verification

1. On wide rows, Qty, Rate and Amount use compact widths and do not grow merely because the row becomes wider.
   The field group retains its right alignment; narrow layouts retain their existing left-aligned reflow. This placement clarification corrects the preceding implementation within the approved task.
2. Estimator, Client view preview and shared Client quotation rows retain visible headings and values without overlapping controls at narrow widths.
3. Quantity editing and configured readonly prices behave as before; touch targets and Qty/Rate units remain intact.
4. Verify rendered desktop and mobile rows with Standard/Special and a large amount, compare field widths at two wide viewport sizes, and check narrow-container wrapping. Run a focused frontend check and `git diff --check`; do not add tests that mirror CSS declarations.

Risk: preview-specific grid rules and existing mobile/container overrides may reintroduce expansion or clipping. Check these alongside the shared styles. Exact pixel budgets are a routine implementation choice, with the existing control sizes as their minimum. No open product decision remains.
