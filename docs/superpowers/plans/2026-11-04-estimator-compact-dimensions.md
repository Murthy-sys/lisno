# Compact estimator dimensions: task plan

Date: 2026-11-04

Status: Specification and task plan approved; Mode A selected. Implementation and focused verification complete on 2026-11-04.

Source: [Approved specification](../specs/2026-11-04-estimator-compact-dimensions-design.md).

## Scope and boundaries

Make the staff estimator's dimension inputs smaller, remove repeated explanatory text and shorten the empty-basket fallback. Preserve units, calculated quantities, validation, dimension confirmation, functional checkboxes and the submission checklist. Client dimension presentation remains unchanged by default.

No backend, API, data, permissions, calculations, dependencies or lockfile changes. Do not start the backend, launcher or OCR. Use synthetic frontend data for visual checks. No migrations, live mutations, commits, pushes or deployment.

## Tasks and ownership

1. **Capture baseline.** Primary records current dirty paths and full diffs for affected targets under `/private/tmp/lisno-compact-dimensions/`. Existing recommendation/checklist changes in `ConfiguredEstimateBuilder.tsx` and its tests must be preserved. Confirm the existing compact control tokens and CSS overrides before writing.

2. **Compact markup and copy.** Primary owns `EstimateDimensionsFields.tsx`, `ConfiguredEstimateBuilder.tsx` and narrowly affected rendered tests. Add an optional `compact` presentation prop, defaulting to false, and the class `estimate-line-dimensions--compact`. Enable it in the staff builder only. Show the short Dimensions legend, measurement labels and Quantity label; retain contextual accessible names. Remove permanent generic help in compact mode, shorten necessary warnings and the confirmation button, and avoid dangling `aria-describedby` references. Shorten the empty-basket fallback to No available items. Do not change calculations, validation or selected-only grouping.

3. **Bound sizing and spacing.** In Mode A, a frontend worker owns only `estimateDimensions.css` and any necessary dimension-specific override in `frontend/src/styles/estimator-dashboard.css`; in Mode B, primary owns these too. Target the agreed compact modifier. Use roughly 90–120 px desktop inputs, existing control-height tokens, compact gaps and a readable quantity column. Adapt to two columns or stacking on narrow screens. Avoid global input changes and preserve the default Client layout.

4. **Integrate and verify.** Primary reviews the combined incremental diff, resolves CSS specificity issues and verifies the complete result after both writers finish. Check valid, empty/invalid, changed-rule and read-only states; verify short visible text plus contextual accessible names. Inspect actual screenshots and computed dimensions at 390, 768 and 1440 pixels. Confirm that inputs are bounded on desktop, touch sizing remains usable and no horizontal page overflow or clipped controls appears. Keep review and tests proportional to this presentation-only change.

## Dependencies and execution mode

Task 1 precedes all edits. Tasks 2 and 3 can run in parallel in Mode A after agreeing the optional prop/modifier above; they have non-overlapping ownership. Tell the worker that the shared worktree contains existing changes and prohibit reverting others' work. Task 4 follows both writers. In Mode B, perform all tasks inline. No agents or implementation begin before the execution-mode selection. Keep one parent phase in progress: baseline, implementation, then verification.

## Acceptance and checks

- Small desktop inputs, reduced spacing and responsive layout: computed-size and screenshot checks in the real estimator wrapper at all three widths.
- Concise text with accessible context: focused rendered checks for compact legend/labels/confirmation and default Client presentation. Adjust existing meaningful assertions rather than adding tests that merely mirror CSS.
- Unchanged calculation/save safeguards: run existing dimension, builder, tier and Client dimension regressions, covering valid/invalid values and rule-change confirmation.
- Preservation and hygiene: compare against the captured baseline; ensure earlier recommendation and submission-checklist work remains intact.

From `frontend/`:

```sh
npm test -- src/features/leads/configuredEstimate.dimensions.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/client/ClientEstimateDimensions.test.tsx
npm run typecheck
npm run build
```

Include a new focused dimension-component test file only if needed for meaningful coverage not available above. At repository root, run `git diff --check` and `git status --short`. Do not run unrelated backend/OCR/full suites or claim lint; no lint script exists.

## Handoff

Record changed files, exact checks/results and any remaining limitations here. Keep screenshots/logs in `/private/tmp/lisno-compact-dimensions/`; generated build artifacts remain ignored. Distinguish synthetic browser checks from live backend verification. Confirm no backend start or data migration occurred.

## Implementation and verification results

- Primary updated `EstimateDimensionsFields.tsx` and enabled its optional compact presentation in `ConfiguredEstimateBuilder.tsx`. Short legend/quantity labels, concise warnings and confirmation preserve contextual accessible names. Removed permanent help in compact mode and shortened the empty-basket fallback. Calculations, save safeguards, item selection and pricing were not changed.
- The CSS worker updated only `estimateDimensions.css` and the dimension-specific height override in `estimator-dashboard.css`. Fields are bounded to 112 px and the desktop grid to 466 px; narrow screens use two columns. Default Client presentation is preserved.
- Extended existing meaningful assertions in `ConfiguredEstimateBuilder.test.tsx` and `ClientEstimateDimensions.test.tsx`. Compared the incremental changes with the captured baseline; preceding recommendation and submission-checklist changes remain intact.
- The focused command listed above passed: **4 files, 39 tests**, including calculations, invalid dimensions, changed-rule confirmation, read-only controls and Client defaults. Log: `/private/tmp/lisno-compact-dimensions/tests.log`.
- `npm run typecheck` passed, followed by `npm run build` passing. The build retains its large-chunk warning. Build log: `/private/tmp/lisno-compact-dimensions/build.log`.
- Rendered the real estimator wrapper/components with synthetic fetch fixtures at **1440, 768 and 390 px**. Inspected screenshots at all three widths. Inputs measured **112 × 32 px** at desktop/tablet and **112 × 44 px** on mobile, with no horizontal page overflow. Screenshots: `/private/tmp/lisno-compact-dimensions/output/playwright/dimensions-{1440,768,390}.png`.
- Browser keyboard editing from Length 2 to 5.5 with Width 3 produced quantity **16.5**, preserved Height 4 and moved focus to Width on Tab. Clearing Length showed **Enter valid dimensions.**, quantity **Pending**, a valid accessible description and disabled Save draft.
- Browser accessibility scan returned no violations at the tested mobile state; recorded runtime errors were empty. Console contained development-tool information and a temporary Vite connection/reload message, with no application exception.
- `git diff --check` passed. Reviewed `git status --short`; unrelated dirty files were preserved.

Verification is frontend-only with synthetic data. No live backend integration, unrelated full/backend/OCR suites or lint were run. No backend, launcher or OCR was started, and no dependency, lockfile, database, migration, commit, push or deployment action was performed. Temporary QA screenshots/logs and fixture files remain outside the repository at the path above; generated frontend build files are ignored.
