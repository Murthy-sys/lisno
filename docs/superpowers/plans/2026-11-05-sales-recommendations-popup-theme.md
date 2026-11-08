# Sales recommendations common popup theme: task plan

Date: 2026-11-05
Status: Complete. Approved specification and task plan implemented in Mode A, independently reviewed and verified.

Source of truth: [approved specification](../specs/2026-11-05-sales-recommendations-popup-theme-design.md).

## Outcome and boundaries

Apply the common popup's warm surface, border/text colors and olive action styling to the Sales recommendations panel and its toolbar trigger. Preserve the accepted placement, compact dimensions, non-modal behavior, recommendation actions and all existing Client/Sales fixes.

Reuse `.ui-dialog--reference` visual tokens from `components/ui/dialog.css` and existing button primitives where appropriate. Do not apply modal container classes or behavior. Keep the existing compact header and visible Close action; no branding row, new icons, dependencies or global redesign.

## Ownership and baseline

The primary owns interpretation, integration, these documents and final verification. The expected product write boundary is:

- `frontend/src/features/estimates/EstimateRecommendations.tsx`
- `frontend/src/features/estimates/estimateSelection.css`

Both files already contain the completed popup implementation. Before any writer starts, capture current dirty paths, full target diffs and protected-path hashes. Preserve the existing Client visibility, direct Sales basket browsing, popup interactions, tests and prior documents.

Read the shared `Button`, `Dialog`, `DialogToolbar`, `dialog.css`, selection pagination and button primitive styles as references. Prefer existing theme reuse without edits to those shared sources. If a minimal visual token hook is genuinely required, the primary must define that bounded path/ownership first; it may not change existing common popup appearance or introduce modal behavior.

## Dependency-ordered work

### T1. Confirm styling integration

Owner: primary. Dependency: task-plan approval and new A/B choice. Covers AC1–AC4.

- Capture the baseline and confirm popup/trigger remain the only intended visual consumers.
- Confirm common theme imports are available to the body portal and trigger.
- Trace selector priority: `.estimate-selection button` currently overrides generic button color/font rules, and pagination uses plain buttons. Choose scoped rules or existing primitives that reliably consume the common theme without affecting inline consumers.
- Preserve existing geometry, refs, accessible names, handlers and state transitions. Record expected computed surface, border, text and action colors from the actual common popup.

### T2. Apply the bounded theme update

Owner: one frontend writer. Dependency: T1. Covers AC1, AC2, AC4.

- Reuse the common theme tokens on the popup and toolbar trigger. Do not duplicate its hex palette.
- Apply warm background, common ink/muted text and dividers; style Add as primary olive and Close, Refresh/Retry, Remove and pagination as common secondary/quiet controls as appropriate.
- Keep disabled and focus styling readable and consistent. Ensure generic selection CSS cannot override the theme.
- Preserve current panel width/position/height calculation, scrolling, mobile touch targets and warning/name wrapping. Keep all content and callbacks unchanged.
- Keep default inline recommendations and common modal styles unchanged. Do not add tests that merely repeat CSS declarations; use existing behavior tests and rendered computed-style checks.

Execution ownership: in Mode A, a `frontend_implementer` owns both target files together, avoiding concurrent markup/CSS edits. In parallel, the primary may prepare synthetic browser fixtures and inspect the reference dialog without editing the writer's files. Give the writer explicit notice that the shared worktree contains others' changes and that it must not revert them. In Mode B, the primary implements inline without implementation subagents.

### T3. Review and verify the integrated result

Owner: primary, with a bounded independent reviewer/verifier in Mode A if useful. Dependency: T2 writer stopped. Covers AC1–AC4.

- Review the final follow-up diff against the captured baseline. Confirm the change is visual, both popup/default paths retain their behavior, and common dialog geometry has not been inherited.
- Run the focused checks below. Typecheck and build run sequentially.
- Render the real local app with synthetic/mock data only. Compare the recommendations surface and controls with an actual common dialog using screenshots and computed styles.
- Check desktop 1440×900 and mobile 390×844 with available and unavailable recommendations, long names, loading/disabled controls and pagination. Verify no horizontal overflow, visible Close, usable footer, and existing measured placement.
- Exercise Close/reopen, Enter/Escape, Add/Remove focus and Refresh/Retry. Check focus indicators, contrast/accessibility, console errors and unexpected requests. No live saves or external writes.
- Fix confirmed issues and repeat affected checks only. Recheck protected-path hashes.

### T4. Record results and clean up

Owner: primary. Dependency: T3 complete.

Record exact commands/results, rendered comparisons, warnings and unrun checks in this plan. Remove task-created temporary browser files and stop task-owned processes. Report affected files, no added dependencies and any limitations. Do not commit, push or deploy.

Only one parent task is in progress at a time. Product edits stay with one writer; final review/verification follows completed edits.

## Verification commands

From `frontend/`:

```sh
npm test -- src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx
npm run typecheck
npm run build
```

If a shared primitive or token source needs an authorized bounded edit, also run its existing focused tests and visually compare an unchanged common dialog. No new CSS-mirroring tests are required.

At repository root: `git diff --check`, `git status --short`, and comparison with captured protected-path hashes. Full frontend/backend/OCR suites, migrations and live service tests are outside this local visual change. No lint script exists.

## Acceptance evidence

| Criterion | Required result |
| --- | --- |
| AC1 | Popup/trigger consume the common theme; computed surface, border, ink and primary action colors match the common popup, including the warning fixture. |
| AC2 | Common button appearance, visible keyboard focus and readable disabled states; generic selection selectors do not override them. |
| AC3 | Desktop/mobile screenshots and geometry checks preserve the accepted placement, wrapping, Close access, footer access and overflow bounds. |
| AC4 | Existing recommendation/Client tests pass; rendered close/reopen, Escape and action-focus checks pass; protected unrelated work and default inline styles remain intact. |

## Progress

- Specification: approved.
- Task plan: approved.
- Execution mode: A, selected for this theme follow-up.
- Product implementation: T1–T4 complete. Baseline dirty paths, full diffs, protected hashes and both target contents captured before assigning the writer in `/private/tmp/lisno-popup-theme-baseline`.
- Verification: 49 tests, typecheck/build, computed-style comparison, rendered desktop/mobile interaction/accessibility and diff hygiene passed.
- T1 decision: reuse the existing `.ui-dialog--reference` theme without modal container classes; keep visual control overrides scoped to popup/trigger so default inline selections retain their styles. Shared pagination remains unchanged and receives scoped common secondary-button styling.
- External actions: none performed or required.


## Final implementation and verification

Only `frontend/src/features/estimates/EstimateRecommendations.tsx` and `estimateSelection.css` changed for this follow-up. The component imports the existing common dialog theme and applies it only to the popup/trigger. Popup action classes and scoped selection-to-dialog variable mappings reuse the common palette without copying colors. The existing plain pagination buttons receive the same secondary token styling. No shared primitive, Client, workspace, data, geometry or interaction source was changed.

An independent bounded review found no outstanding defects. Browser comparison caught a global black-heading override; an explicit scoped `var(--dialog-ink)` resolved it before final checks. All 26 protected baseline paths remained hash-identical.

### Automated checks

The exact focused test command in Verification commands passed **49/49 tests across 4 files**. `npm run typecheck`, `npm run build`, `git diff --check` and final status review passed. Vite transformed 3,333 modules in 9.43 seconds. The existing >500 kB chunk warning remains: main bundle 3,267.93 kB minified / 898.35 kB gzip.

No new tests were added for this visual-only change. Full frontend/backend/OCR suites and live-service checks were not run. No lint script exists.

### Rendered checks

Actual local Vite app and Chromium with synthetic intercepted API responses; no live customer data or mutations. Compared the panel against the application's actual Sub Basket removal confirmation dialog.

- Computed common theme values match: surface `rgb(251,251,248)`, border `rgb(220,222,213)`, body/heading ink `rgb(32,38,51)`, muted room/source `rgb(102,112,100)`, primary action background/border `rgb(65,77,50)` with ink `rgb(250,251,247)`, secondary surface `rgb(251,251,248)` with border `rgb(203,208,196)` and ink `rgb(40,48,37)`.
- Desktop 1440×900: 380px panel below the toolbar, above the footer; long item name and unavailable warning render correctly.
- Mobile 390×844: 374px panel inside 8px margins, Close target 44px high, no page or panel horizontal overflow. Save footer remained reachable and unobstructed after the existing scheduled scroll-position update.
- Desktop/mobile screenshots inspected. Both include the long Royal Emulsion recommendation and unavailable warning from the user's example.
- Axe checks scoped to the estimate workspace and recommendations popup: zero violations on both widths, without rule exclusions.
- Close/reopen, Enter/Escape focus restoration, unchanged basket position on close, Add/Remove action focus, loading-disabled actions, Refresh/Retry recovery and themed pagination through a 46-item set passed. Focus ring is visible at 2px using the common olive focus color.
- No runtime JavaScript errors or unexpected API requests; zero mock saves. The fixture deliberately exercised failed recommendation reads. External Google Fonts requests were blocked by the isolated fixture, so visual checks used the existing fallback font.

The browser fixture restored its ready Configuration before the failure-state check; removing paged fixture targets otherwise correctly triggered the existing stale-data guard. Scroll geometry assertions waited for the existing requestAnimationFrame measurement. These required no product changes.

### Cleanup and limits

Task-owned browser/server processes stopped and temporary files under `/private/tmp/lisno-popup-theme-baseline`, `/private/tmp/lisno-popup-theme-qa`, plus the two `.playwright-cli` artifacts timestamped `2026-11-05T08-17-32`, removed at handoff. Required checks regenerated existing ignored `frontend/dist/` and `frontend/node_modules/.tmp/*.tsbuildinfo` outputs.

No dependencies, lockfiles, shared popup source changes, migrations, production effects, commits, pushes or deployment. Remaining limitations: existing bundle-size warning and exact remote-font rendering was not exercised.
