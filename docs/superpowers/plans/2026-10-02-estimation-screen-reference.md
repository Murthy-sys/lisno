# Estimation screen reference implementation plan

1. **Capture baseline and preserve dirty work**: inspect current builder, workspace, styles, tests, and existing diffs. Keep existing finance and persistence behavior intact.
2. **Workspace framing** (`LeadEstimateWorkspace.tsx`, `estimator-dashboard.css`): style masthead and tabs around the reference; place refresh in the configured builder toolbar without duplicate actions. Acceptance: project controls, messages, tabs, and totals remain reachable.
3. **Builder interaction and hierarchy** (`ConfiguredEstimateBuilder.tsx`, `estimator-dashboard.css`): add search/filter, selected-room rail view, Main Basket chips, nested disclosures, compact item selection and quantity controls. Acceptance: filters and disclosures do not mutate lines; existing warnings and saved lines remain visible.
4. **Visual and responsive treatment** (`estimator-dashboard.css`, existing local assets): implement screenshot proportions and colors, lift the shared content-width cap for this item view, and preserve narrow-width reflow, focus and disabled states. Acceptance: wide screens use the available workspace and representative widths have no page overflow or clipped controls.
5. **Verification** (`ConfiguredEstimateBuilder.test.tsx`, existing workspace tests, frontend commands, browser QA): test interactions and paise/rate preservation, run focused tests, typecheck/build, inspect desktop and mobile renders, then inspect final diff and status.

The primary thread owns these sequential changes because the target component and stylesheet are already dirty and share layout state. No backend or shared contract change is planned.
