# Main Line Overview Section Summaries Removal Task Plan

## Approved source of truth

- Specification: `docs/superpowers/specs/2026-09-02-main-line-overview-section-summaries-removal-design.md`

## Ownership boundaries

- Overview production rendering and local dead-code cleanup: `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- Focused Overview regressions: `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
- Integrated workspace regression: `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- Existing Gap behavior production/test paths remain owned by the preceding approved change and must not be modified except for conflict-safe integration of `KnowledgeScreens.test.tsx`.
- No ownership is granted over backend files, `knowledgeOverviewSummary.ts`, its projection contract/tests, API/OpenAPI contracts, completeness calculation, shared UI primitives, dependencies, lockfiles, or unrelated dirty paths.

## Dependency-ordered tasks

### 1. Capture the pre-change rendering and dirty-path contract

- Record `git status --short` and the relevant diffs before any writer edits.
- Treat the existing `KnowledgeScreens.test.tsx` Gap behavior diff as protected prior work.
- Run the current focused Overview panel and workspace tests to establish the integrated baseline.
- Trace every local symbol used only by the section-card render path before removing it.

Acceptance criteria:

- The exact **All section summaries** renderer, card-only helpers/imports, and affected tests are identified.
- Existing dirty changes are understood and preserved.

### 2. Add/update focused Overview rendering regressions

- Reframe card-specific tests to assert **All section summaries**, all level-three card headings/articles, duplicated card warnings, card retries, and card-level navigation actions are absent even when projected cards contain configured data, warnings, loading, or errors.
- Keep positive assertions for the principal Selected Mode details, Specifications, Pricing, Recommendations, and Quality panels where their existing visibility conditions are met.
- Keep principal **Open Mode**, **Open Recommendations**, and **Open Quality** interaction assertions and update action counts to exclude removed card actions.
- Preserve principal source-boundary retry behavior, reference-failure handling, read-only filters, zero/false rendering, and axe coverage; remove only expectations tied exclusively to removed cards.

Acceptance criteria traced to the specification:

- AC1–AC4: the complete lower card block and its duplicated content/actions are absent while principal panels remain functional.
- AC5: Overview editing and non-card behavior remain covered.

### 3. Remove the Overview section-card renderer

- Remove the `visibleSectionCards` calculation and final **All section summaries** JSX block from `KnowledgeOverviewPanel`.
- Remove `SectionSummaryCard`, its navigable-card type guard, and card-only helper functions/imports after confirming they have no remaining callers.
- Retain `summary.sectionCards` in the projection contract and do not alter backend completeness/source data.
- Keep all principal panel rendering, source boundaries, navigation, UOM/Surface editing, and summary selection state unchanged.
- Confirm the component returns without an empty wrapper or spacing artifact after the principal grid.

Acceptance criteria traced to the specification:

- AC1–AC5 and AC8.

### 4. Reconcile the integrated workspace regression

- Update the populated Overview flow to assert Scope, Execution, and Advanced summary cards are absent rather than reading their counts/highlights.
- Retain positive assertions for the four first-level tabs, Configured values, UOM/Surface controls, principal Overview content, unsaved navigation, and Mode behavior.
- Preserve every previously approved Gap behavior assertion and fresh-slab save regression already present in the dirty file.

Acceptance criteria traced to the specification:

- AC2, AC5, and AC6.

### 5. Focused verification

Run:

```text
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx
cd frontend && npm run typecheck
git diff --check
```

- Inspect the final scoped diff for principal-panel preservation, protected Gap behavior changes, and unrelated-work safety.
- Confirm no references remain to local section-card render helpers removed from the component.

Acceptance criteria traced to the specification:

- AC1–AC7.

### 6. Integrated verification and hygiene review

Run:

```text
cd frontend && npm test
cd frontend && npm run build
git status --short
```

- Run an independent integrity review of the integrated diff before final completion.
- Treat focused Testing Library interactions plus existing axe coverage as the rendered accessibility check for this bounded removal.
- Report any unrun live-browser or width-specific visual check; do not claim it passed without execution.
- Confirm no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.

Acceptance criteria traced to the specification:

- AC7 and AC8, with final confirmation of AC1–AC6.

## Affected areas

- Main Line Overview's final rendered section and accessible landmark/action inventory.
- Focused Overview component tests for cards, navigation, source states, and accessibility.
- One integrated workspace scenario in an already-dirty test file.
- No data, summary-projection, API, backend completeness, authorization, persistence, migration, or external-system area is affected.

## Parallel execution

If parallel execution is selected, two non-overlapping slices are safe after the rendering contract is fixed:

- one frontend owner handles `KnowledgeOverviewPanel.tsx` and `KnowledgeOverviewPanel.test.tsx`;
- a second frontend owner handles only `KnowledgeScreens.test.tsx`, preserving its existing Gap behavior diff.

Final review and verification must wait for both slices because tests share the integrated worktree.

## Completion evidence

- Exact changed files and final behavior summary.
- Evidence that the entire **All section summaries** block and all card-level actions/warnings are absent.
- Evidence that principal Overview panels/actions and prior Gap behavior regressions remain intact.
- Focused and full frontend test counts.
- Frontend typecheck, build, accessibility-test, and `git diff --check` results.
- Unrun checks and any remaining visual-QA limitation.
- Confirmation that no backend, projection contract, migration, dependency, staging, commit, push, deployment, or production action occurred.
