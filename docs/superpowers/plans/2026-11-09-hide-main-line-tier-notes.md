# Hide Main Line tier notes: task plan

Date: 2026-11-09
Status: Implemented and verified in Mode A
Specification: [Approved specification](../specs/2026-11-09-hide-main-line-tier-notes-design.md)
Specification approved in conversation on 2026-11-09.

## 1. Apply the shared presentation change

Owner: primary agent, after task-plan approval and execution-mode selection.
Capture initial dirty paths and exact target contents/diffs before editing.

- In `frontend/src/features/estimates/EstimateLineRow.tsx`, visually hide the
  shared tier-status paragraph with the existing screen-reader utility. Preserve
  its ID, accessible description, disabled tiers and reason tooltips.
- In `frontend/src/styles/estimator-dashboard.css`, prevent an otherwise empty
  details container from adding spacing when it contains only hidden tier notes.
  Preserve spacing for real errors, source notes, dimensions and components.
- Adjust the existing visibility expectation in `EstimateLineRow.test.tsx` while
  retaining accessible-description and disabled-option coverage. Do not add
  tests that simply restate CSS class names or style values.

Acceptance: specification criteria 1–3. No role-specific duplication, component
callback, permission, price, data, dependency or service changes.

## 2. Verify the rendered result

Depends on step 1. Primary owns integration and any source fixes.
In Mode A, a browser worker may prepare an isolated synthetic fixture while the
primary edits; its ownership is limited to temporary QA files and its own
browser/server session. It must not edit product files or existing services.
In Mode B, the primary performs all work inline. Keep one parent task in progress.

- Render the actual shared row with unavailable tiers. Confirm that the summary
  is visually absent, the primary row is compact and no empty detail band remains.
- Confirm that an actual validation message remains visible and unavailable
  tiers remain disabled with accessible reasons. Check desktop and mobile.
- Inspect the final task diff to confirm only the intended presentation changed.

Acceptance: specification criteria 1–4. No broad workflow matrix is needed.

## 3. Run focused checks and hand off

Depends on completed edits and browser corrections. Primary owns final evidence;
in Mode A an independent verifier may run checks after sources settle.

From `frontend/`:

```sh
npm test -- src/features/estimates/EstimateLineRow.test.tsx
npm run typecheck
npm run build
```

At the repository root, run `git diff --check` and `git status --short`.
Report exact results and any limitation, preserve unrelated dirty work, stop
only owned QA services and remove owned temporary fixtures/screenshots.
No full/backend/OCR suite, lint, migration, external data write, commit, push or
deployment. The repository has no lint script.

## Gate status

Specification and task plan approved. User selected Mode A. Primary owns the
shared component, scoped CSS and existing test; the browser worker owns only
temporary QA files and its own session.


## Implementation and verification evidence

Changed `EstimateLineRow.tsx` to retain the tier summary as screen-reader text.
The scoped detail rule in `estimator-dashboard.css` removes spacing when only
hidden content remains. Updated the existing shared-row test to preserve both
unavailable-tier descriptions, disabled choices and reason tooltips. Both staff
and Client consumers already use this shared component; no consumer logic changed.

- **Criteria 1–3:** Six rendered checks at 1440px desktop and 390px mobile passed.
  Inspected both screenshots: the tier summary is visually absent; a notes-only
  row has the same height as a no-notes control with zero detail height/margin;
  a real `Rate required` message remains visible. Disabled options and accessible
  descriptions remain intact. No overflow or application console errors.
- **Criterion 4:** `cd frontend && npm test -- src/features/estimates/EstimateLineRow.test.tsx`
  passed (4/4 tests); `npm run typecheck` and `npm run build` passed (exit 0;
  3,336 modules). `git diff --check` passed and `git status --short` was inspected.
  Independent scope review confirmed only the intended component presentation,
  detail spacing, existing test and two working documents changed.

Existing build chunk-size warning remains: main JS 3,297.09 kB, CSS 1,562.81 kB.
Ignored outputs refreshed: `frontend/dist/`, TypeScript caches in
`frontend/node_modules/.tmp/`, and existing test-tool caches as applicable.

Browser verification used synthetic data and real shared components/styles,
not an authenticated customer session. Full/backend/OCR suites and lint were
not run for this bounded presentation change; no lint script exists. No new
dependencies, data changes, migrations, commits, pushes or deployment.
Existing services were untouched. Owned browser and port-4192 fixture were stopped.
Owned fixtures, screenshots, baseline and CLI logs under
`/private/tmp/lisno-hide-tier-notes/` and `output/playwright/lisno-hide-tier-notes/`
were removed after inspection and final reconciliation.
