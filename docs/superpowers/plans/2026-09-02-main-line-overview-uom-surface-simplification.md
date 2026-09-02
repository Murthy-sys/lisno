# Main Line Overview UOM and Surface Simplification Task Plan

## Approved source of truth

- Specification: `docs/superpowers/specs/2026-09-02-main-line-overview-uom-surface-simplification-design.md`

## Ownership boundaries

- Overview production rendering/state: `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- Focused component regressions: `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
- Feature layout and responsive geometry: `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- Layout contract regressions: `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
- Integrated workspace regressions: `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- Every owned file already contains approved uncommitted work from the Gap behavior and Overview summary-card removals; that prior diff is protected and must be integrated, not reverted.
- No ownership is granted over backend files, `KnowledgeSurfaceMultiSelect` itself, reusable-values pages, data/contracts, API/OpenAPI, shared UI primitives, dependencies, lockfiles, or unrelated paths.

## Dependency-ordered tasks

### 1. Capture the integrated pre-change contract

- Record `git status --short` and per-target diffs before writers begin.
- Run the current focused Overview, workspace, layout, and Gap behavior tests as the baseline.
- Trace UOM/Surface local state, relevant-reference aggregation, payload update behavior, and every Surface/old-button expectation.
- Distinguish Overview Surface assertions from reusable-values **Surfaces** assertions that must remain.

Acceptance criteria:

- The exact Overview-only Surface render/state and button-label paths are identified.
- Existing approved changes in every target file are understood and preserved.

### 2. Add/update focused Overview behavior regressions

- Assert no Surface label, trigger, description, popover/listbox, loading/error copy, or Surface-only warning appears in editable, read-only, and failed-reference states.
- Assert the quick-add trigger has the exact visible/accessible name **Add Unit** and the old label is absent.
- Retain positive UOM dropdown, disabled/loading/error, quick-add callback, selected stable ID, principal panels/actions, removed-card, and axe coverage.
- Seed the loaded Overview payload with `surfaceIds` plus unrelated keys; prove both selecting a UOM and accepting a quick-added UOM preserve those hidden properties exactly.
- Prove a Surface reference failure no longer disables UOM or creates Overview feedback.

Acceptance criteria traced to the specification:

- AC1, AC2, AC4, and AC5.

### 3. Simplify the Overview renderer and state

- Remove `KnowledgeSurfaceMultiSelect` from Overview and delete its Overview-only import, `surfaceIds` local value, Surface reference-state rendering, and Surface participation in relevant-reference warnings.
- Keep Surface data in the loaded payload untouched.
- Narrow the Overview mutation helper to `uomId` while retaining the full-payload spread.
- Rename the UOM quick-add button to **Add Unit**.
- Give the UOM field/button a dedicated inline-row hook while keeping UOM source loading/error messages beneath and spanning the row.
- Preserve quick-add permission/read-only gating, stable-ID selection, dirty state, and save behavior.

Acceptance criteria traced to the specification:

- AC1, AC2, AC4–AC6, and AC8.

### 4. Implement and verify responsive UOM-row geometry

- Change Configured values from the obsolete two-field grid to one full-width UOM field area.
- Lay out the UOM `Field` as `minmax(0, 1fr)` and the Add Unit button as intrinsic width on the same grid row.
- Align the button with the select control, not the label; make status messages span all UOM-row columns.
- Keep the Add Unit touch target at least 44 px on coarse/mobile input.
- At tablet/mobile/320 px widths, keep the same row, allow the select to shrink, and prevent page-level horizontal overflow.
- Remove only Overview-specific Surface selectors/comments and obsolete two-column assertions; do not delete reusable multi-select styles used by the component/tests or other surfaces.

Acceptance criteria traced to the specification:

- AC1, AC3, AC4, and AC7.

### 5. Reconcile integrated workspace tests

- Replace Overview **Surfaces** expectations/interactions with absence assertions in editable and read-only workspace flows.
- Rename only the Overview trigger expectations to **Add Unit**; retain **Add UOM** inside the quick-add dialog and **Surfaces** terminology on the reusable-values page.
- In the integrated quick-add/save path, load an existing `surfaceIds` value and assert the Overview save payload preserves it while changing `uomId`.
- Preserve all prior summary-card absence assertions, Gap behavior regressions, Mode CAS ordering, unsaved navigation, active/archived gating, and accessibility checks.

Acceptance criteria traced to the specification:

- AC1, AC2, AC4–AC7.

### 6. Focused verification

Run:

```text
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx
cd frontend && npm run typecheck
git diff --check
```

- Inspect the integrated diff for hidden `surfaceIds` preservation, exact button naming, inline geometry, and unrelated-work safety.
- Search production Overview code to confirm no `KnowledgeSurfaceMultiSelect`, Surface UI label, or old Add unit of measure label remains.

Acceptance criteria traced to the specification:

- AC1–AC7.

### 7. Integrated verification and hygiene review

Run:

```text
cd frontend && npm test
cd frontend && npm run build
git status --short
```

- Run an independent integrity review after all writers finish.
- Use focused Testing Library interactions, axe coverage, and layout/CSS assertions as the bounded rendered and responsive verification.
- If a live browser is available, inspect the UOM row at desktop and 320 px; otherwise report the unrun visual check and residual spacing risk.
- Confirm no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.

Acceptance criteria traced to the specification:

- AC7 and AC8, with final confirmation of AC1–AC6.

## Affected areas

- Main Line Overview Configured values field inventory and accessible focus order.
- Overview UOM quick-add naming, payload-preserving interactions, and reference-state aggregation.
- Feature-owned responsive geometry for the UOM dropdown/button row.
- Focused component, workspace, layout, and accessibility regressions.
- No data contract, reusable Surface management, API, backend, authorization, persistence, migration, or external-system area is affected.

## Parallel execution

If parallel execution is selected, two non-overlapping slices are safe after the markup contract is shared:

- one frontend owner handles `KnowledgeOverviewPanel.tsx` and `KnowledgeOverviewPanel.test.tsx`;
- a second frontend owner handles `ai-estimator-knowledge.css`, `KnowledgeItemWorkspaceLayout.test.tsx`, and `KnowledgeScreens.test.tsx`, preserving all existing diffs and changing only Overview-related expectations.

Final integrity review and verification must wait for both slices because their tests observe the shared worktree.

## Completion evidence

- Exact changed files and behavior summary.
- Evidence that Surface UI is absent while saved `surfaceIds` survive UOM selection and quick add.
- Evidence that **Add Unit** is beside the UOM dropdown and the old label is absent.
- Desktop/mobile/320 px layout contract, touch-target, interaction, and axe results.
- Focused and full frontend test counts, typecheck, build, and `git diff --check` results.
- Unrun checks and any remaining visual-QA limitation.
- Confirmation that no backend, contract, migration, dependency, staging, commit, push, deployment, or production action occurred.
