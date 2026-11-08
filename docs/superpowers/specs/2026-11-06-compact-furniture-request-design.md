# Compact existing-furniture request panel

Date: 2026-11-06
Status: Approved and implemented in Mode A; AC1–AC4 verified.

## Goal

Make **Request existing furniture details** compact and readable by reducing oversized checkbox visuals, typography and spacing, while preserving the existing theme and room-selection workflow.

## Current behavior and evidence

- The screenshot shows a large two-line title, large room checkboxes and labels, and oversized footer controls.
- `frontend/src/features/workflow/ExistingFurnitureWorkflow.tsx` renders this action inside the shared `ContextPanel`, using the shared `Checkbox` and `Button` components. It currently supplies no request-specific presentation class.
- `frontend/src/styles/primitives.css` sets both the visual and minimum checkbox dimensions to **44px**. The whole checkbox therefore appears enlarged; its size is not just an invisible touch target.
- `frontend/src/styles/shell.css` supplies spacious contextual-drawer header/body padding and large footer controls. `existingFurnitureWorkflow.css` does not provide compact request-panel overrides.
- The common dialog treatment already uses an 18px heading, 11px eyebrow and approximately 13px controls. Use this existing visual density as the reference.

## Scope and requirements

1. Scope the presentation change to the `furniture_request` action in the existing-furniture panel. Use an action-specific class passed through `ContextPanel` to the drawer. Other furniture forms, generic checkboxes and shared drawers retain their existing presentation.
2. Target an **18px heading**, **11px eyebrow**, **13–14px room labels/body text**, and **13px button text** at normal browser zoom. Preserve the established font family, olive accents and readable contrast. Permit wrapping at narrow widths without clipping or ellipsis.
3. Draw room checkboxes at approximately **18px square**, aligned with their label text. Override both regular and minimum dimensions locally; do not scale them with a transform or leave a 44px visual box behind.
4. Keep the complete room label clickable. Use compact desktop rows of approximately 28–32px, with at least 44px row/tap targets for touch layouts. Retain native checkbox semantics, checked/disabled states and visible keyboard focus.
5. Tighten header/body/footer padding to roughly 12–16px and room-row spacing to 6–8px. Keep the Rooms label close to its options. Use approximately 36px desktop footer buttons and at least 44px touch controls; allow the long primary label to wrap cleanly when necessary.
6. Preserve room names, default selections, toggle behavior, validation, request payloads, submit/busy/disabled states, Cancel/Close actions, focus return and the unsaved-change confirmation. No change to who can request furniture information or when the request becomes available.
7. Keep the existing side-panel placement, width, scrolling and footer access. Compactness applies to its content and controls; changing the full-height drawer into a different modal is outside this request.

## Integration and constraints

Expected product targets are `ExistingFurnitureWorkflow.tsx` and `existingFurnitureWorkflow.css`. Prefer existing component props plus scoped CSS; no new component, dependency or global design-token change is needed. Verify CSS precedence against the shared shell/primitive layers in the rendered page.

This is a small visual change with no backend, API, permission, persistence, finance, migration or email impact. Do not submit the real furniture request during visual verification; use controlled synthetic data for submission checks. Existing uncommitted Client, Sales, recommendations and secondary-measurement changes must be preserved. The two expected product targets are currently clean.

## Assumptions and open decisions

“Here” refers to the furniture-request panel in the screenshot. Preserve its existing side-panel behavior and theme while reducing visual scale. No unresolved product decision is required.

## Risks

- Shared minimum checkbox dimensions or higher-priority drawer rules can override a partial size change.
- Reducing visual size without retaining label hit areas would harm touch usability.
- A long title or primary action can overflow on small screens if compact sizing also prevents wrapping.

## Acceptance criteria and verification

- **AC1:** At normal zoom, the request panel uses compact heading/body/button typography and approximately 18px checkbox visuals, verified with computed styles rather than screenshots alone.
- **AC2:** Room selection works by clicking the label and using keyboard focus/Space; touch targets remain usable, with clear checked/disabled/focus states.
- **AC3:** Desktop and approximately 390px-wide rendering have readable long room names, reachable Close/Cancel/submit controls, and no horizontal overflow.
- **AC4:** Existing request validation, selected room IDs, submission and dirty-close behavior remain unchanged; other furniture panels and a representative unrelated drawer/checkbox retain their existing appearance.

After implementation, run the existing `ExistingFurnitureWorkflow.test.tsx` suite, frontend typecheck/build, rendered desktop/mobile interaction/accessibility checks and `git diff --check`. Add a regression only for a meaningful behavior risk; do not add tests that merely repeat CSS declarations. Full backend/OCR suites are unnecessary for this scoped visual change, and there is no repository lint script.

Implementation and verification results are recorded in the [task plan](../plans/2026-11-06-compact-furniture-request.md).
