# Consistent compact form controls and side panels

Date: 2026-11-06
Status: Approved and implemented in Mode A. Verification results and remaining browser-check limits are recorded in the task plan.

## Goal

Make the shown **Submit furniture dimensions** panel compact, and establish consistent sizing for form typography, checkboxes, fields and actions throughout shared forms, side panels and common popups. Extend the completed furniture-request treatment through the shared design system so each additional form does not require another isolated fix.

## Current behavior and evidence

- `ExistingFurnitureWorkflow.tsx` supplies `existing-furniture-request` only for `furniture_request`. Uploading dimensions, confirming furniture preferences, approving dimensions and requesting corrections do not receive that presentation. This explains the new screenshot.
- `existingFurnitureWorkflow.css` contains the completed request-only compact rules: 18px heading and checkbox, 11px eyebrow, 14px body, 13px buttons, with desktop/touch hit-area separation.
- `styles/shell.css` explicitly makes contextual drawer fields and footer controls use `--control-height-large`; headers use `--text-3xl`. The shared checkbox in `styles/primitives.css` has both visual and minimum dimensions of 44px.
- Regular form defaults already use 36px controls and 14px body text through `styles/global.css`. `styles/base.css` enlarges controls for narrow screens. The common dialog reference treatment in `components/ui/dialog.css` already uses 18px headings, 11px eyebrows, 12px labels, 13px controls and 36px desktop actions, with 16px input text on mobile.
- `ContextPanel` forwards presentation props to the portalled contextual `Drawer`. Its consumers span workflow, designer, client, administration, procurement, knowledge configuration and other features. Some consumers supply their own unlayered CSS and native form elements, so changing one layered rule alone will not guarantee consistency.
- Shared checkboxes appear in wrapped labels, separate `Field` labels and table selection cells. `Field.test.tsx` currently asserts a 44px native checkbox minimum. A broad reduction must retain usable hit areas and native semantics, rather than merely replacing that assertion with a smaller number.
- Existing local work includes the completed request-panel fix and unrelated Client, Sales, recommendation and measurement changes. They must be preserved and reconciled, not reverted.

## Recommended approach

Use a shared compact form-density standard in the existing design system. Apply it consistently to shared fields and actions, contextual panel headers/content, and common popups. Reuse the existing palette and font family. Audit feature overrides and align only those that conflict with the standard.

Consolidate the request-only typography/control rules into the shared implementation. Keep furniture-specific room/item layout rules local. Avoid a blanket browser zoom, transform scaling, global heading reset or an expanding series of per-action overrides.

## Scope

1. All existing-furniture actions: request, preference, self-entry, assisted entry, approval and correction forms. Include room selectors, room headings, item legends, labels, inputs, selects, count/dimension fields, evidence upload, confirmation checkbox, helper/error text and body/footer actions.
2. Shared `Field`, `Input`, `Select`, `Textarea`, `FileInput`, `Checkbox`, radio options and standard form buttons wherever they are reused. Existing compact consumers should remain compact; remove conflicting oversized defaults instead of applying cumulative shrinking.
3. Shared contextual side panels and common form popups across roles. Use a common typography/control scale while retaining the appropriate existing surface geometry.
4. Inventory native/custom form-control consumers and feature-level overrides. Normalize inconsistent form controls to the same standard through bounded adapters or existing shared classes. Preserve specialized estimate-grid behavior, financial formatting and table structure.

“Consistency in every place” is interpreted as consistent **form and overlay content**, not making every dashboard number, page title, document preview or visualization the same font size.

## Density and responsive requirements

| Element | Desktop standard | Narrow/coarse-pointer behavior |
| --- | --- | --- |
| Panel/popup title | 18px, existing semibold family | Same readable heading, wrapping naturally |
| Eyebrow | 11px | Same |
| Room/section heading | 14–16px with clear hierarchy | Same |
| Field label | 12–13px | Same readable label |
| Body/room text | 13–14px | Same |
| Input/select/textarea text | 13–14px | 16px editable-control text to preserve mobile input usability |
| Standard text input/select | Approximately 36px minimum height | At least 44px target height |
| Checkbox/radio visual | Approximately 18×18px | Same small visual; retain a larger target |
| Checkbox/radio option target | Approximately 32px row; at least 24×24px for a standalone control target | At least 44×44px target through its label/wrapper |
| Form actions | 13px text, approximately 36px minimum height | At least 44px target; labels may wrap |
| Header/body/footer padding | Approximately 12–16px, safe areas retained | Adapt to viewport and safe areas |
| Field/item spacing | Approximately 8–12px; labels close to fields | Preserve grouping and comfortable interaction |

Textareas retain a useful multiline height (approximately 80–84px minimum), resize behavior and readable content. File inputs must accommodate filenames and their native chooser rather than clipping them into a text-input height. Close/icon-only controls retain usable targets.

Do not shrink a bare 44px checkbox to an 18px hit area. Preserve implicit/explicit label association, input IDs, refs, focus, native form submission and React Hook Form registration. If a wrapper or consumer change is necessary to separate visual and interactive size, inventory and verify those consumers before choosing that implementation.

## Behavior and accessibility invariants

- Preserve values, default selections, field names/IDs, event handlers, validation, units, item add/remove behavior, file restrictions, submission data and error text.
- Keep required/invalid, checked/unchecked/indeterminate, disabled, read-only, loading/busy and keyboard-focus states distinguishable. Do not override their colors or outlines with an indiscriminate visual reset.
- Preserve drawer placement and narrow/medium/wide widths, full-height body scrolling, reachable footer actions, focus trapping/return, nested overlays and dirty-close confirmation.
- Long titles, room names, labels, helper/error text and action labels wrap without horizontal overflow. Furniture items retain two columns where space permits and one column on small screens.
- Preserve the existing font family, olive theme, color contrast and component-specific semantic colors. No new icons, decorative effects or dependencies are needed.
- Respect browser zoom and reduced motion. Validate the actual app CSS cascade/layer order and loaded fonts; inspect screenshots only after fonts and drawer geometry settle.

## Non-goals and data/API impact

No workflow, authorization, calculation, API, schema or persistence changes. No change to what users can see, select, approve or submit. No rearrangement of Sales estimation baskets or financial tables. No redesign of navigation, dashboard typography, previewed/uploaded documents, charts or media surfaces. No email, service restart, deployment, migration or real customer action.

This new request intentionally broadens the earlier request-only styling scope. It does not reopen the earlier workflow/measurement work.

## Integration areas and risks

Likely shared areas are `styles/global.css`, `styles/base.css`, `styles/primitives.css`, `styles/shell.css`, `components/ui/Field.tsx`, and `components/ui/dialog.css`. Existing-furniture presentation remains in its current TSX/CSS files. Final write ownership and the exact set of feature adapters belong in the task plan after approval.

Principal risks are conflicting CSS layers/feature overrides, inaccessible small standalone checkboxes, changed table-cell layout, mobile input zoom, clipped file inputs, and fixed-height button labels. Preserve native control contracts and test representative asymmetric layouts rather than assuming a CSS declaration proves the rendered size.

No migration is required. Rollback is limited to this task's presentation edits; unrelated pending changes must remain intact. Capture dirty paths, per-target diffs and protected-file hashes before implementation. No staging or commits are included.

## Acceptance criteria

- **AC1 — Furniture completeness:** Every furniture action uses the compact scale, including the pictured dimensions panel, dynamically added items, count/dimension modes, document field and confirmation checkbox. The previously compact request panel remains consistent.
- **AC2 — Shared consistency:** An inventory of shared and native/custom form consumers identifies relevant overrides. Shared forms, contextual panels and common popups use the same density standard; any intentional structural exception is documented and verified rather than silently omitted.
- **AC3 — Accessible controls:** Checkbox/radio visuals are compact while label/wrapper targets remain usable. Label clicks, keyboard/Space, explicit label association, native submission, registration/ref focus, invalid/disabled/busy states and visible focus continue to work.
- **AC4 — Responsive layouts:** At approximately 1440px, 768px and 390px, plus coarse-pointer desktop emulation and 200% zoom, controls remain readable and reachable. Long names, many rooms/items, errors and filenames do not cause horizontal overflow; panel body scrolling and footer access work.
- **AC5 — Preserved behavior and scope:** Furniture payloads, add/remove/mode switching, validation, evidence requirements, preference/review actions, dirty-close and focus return pass regression checks. Shared overlay and representative consumer interactions pass. No unrelated source, data, permission, server or external-delivery changes occur.

## Verification requirements

Run focused shared `Field`, `Button`, `ContextPanel` and `Drawer` tests, existing-furniture regression tests, and affected consumer suites selected from the inventory. Add meaningful coverage for hit-area/semantics changes, not CSS-string tests that merely mirror new declarations. Run frontend typecheck and production build, followed by `git diff --check` and final protected-file reconciliation. Backend/OCR suites are unnecessary unless scope changes, which this specification does not authorize.

Rendered checks must cover furniture self/assisted entry and review, an ordinary shared form, a non-furniture contextual panel, a common popup, checkbox table selection and separate-label controls. Include the responsive/state matrix above, actual computed sizes, accessible targets, axe scans and visual inspection. Use synthetic data for uploads/submissions and isolate any QA server/browser from the user's active services and drafts.

## Assumptions and open decisions

The existing compact common-popup treatment and recently accepted furniture-request panel are the visual reference. Compactness reduces visual scale and excess spacing while retaining touch usability. No product decision is unresolved; the implementation plan must settle the smallest compatible shared-control mechanism after the consumer inventory.
