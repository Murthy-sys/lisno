# Main Line Gap Behavior Control Removal Task Plan

## Approved source of truth

- Specification: `docs/superpowers/specs/2026-09-02-main-line-gap-behavior-control-removal-design.md`

## Ownership boundaries

- Production presentation: `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- Focused Quantity & margin regression: new `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx`
- Integrated Mode save regression: `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- No ownership is granted over backend files, API/OpenAPI contracts, calculation or validation logic, Overview/conflict projections, query keys, shared UI primitives, dependencies, lockfiles, or unrelated paths.

## Dependency-ordered tasks

### 1. Capture the focused pre-change contract

- Recheck the dirty status and per-target diffs before editing production or test files.
- Run the narrow existing workspace test that covers Quantity & margin rendering and Mode save behavior.
- Confirm the loaded payload update path spreads existing properties so a hidden `gapBehavior` value remains present when another field changes.
- Trace fresh Main Line initialization, Quantity-slab addition, and backend validation to confirm exactly when `gapBehavior` becomes mandatory.

Acceptance criteria:

- The existing control, remaining Quantity & margin fields, and payload-preservation path are evidenced before production edits.
- Any new user changes in owned files are understood and preserved.

### 2. Add a focused failing Quantity & margin regression

- Add a small stateful `KnowledgeSectionEditor` harness for the `quantity-margin` branch.
- Assert **Gap behavior** is absent for editable and read-only rendering.
- Positively assert Start margin, Bottom margin, PMC markup, Wastage, and Quantity slabs remain rendered under their existing read-only rules.
- Edit a remaining basis-point field and assert the complete next payload preserves an existing `gapBehavior` value and valid unrelated Quantity & margin data such as `previewInputs` exactly.
- Starting with `{}`, add the first slab and assert the editor payload adds `gapBehavior: "no_adjustment"` alongside the new `quantitySlabs` row.
- Starting with an existing `gapBehavior: "reject"`, add another slab and assert the existing value is not replaced.

Acceptance criteria traced to the specification:

- AC1: the labelled dropdown is absent.
- AC2: remaining margin, slab, and preview-adjacent editor functionality is unchanged.
- AC3: loaded hidden `gapBehavior` data survives another edit.
- AC4 and AC5: fresh slab creation receives the established default while existing values are preserved.
- AC6: read-only rendering exposes no replacement control.

### 3. Remove only the Gap behavior form control and preserve fresh-slab saves

- Remove the `EnumField` for `payload.gapBehavior` from the `quantity-margin` render branch.
- Remove the now-unused private `EnumField` helper after confirming it has no remaining caller.
- In the existing payload-change boundary, when `quantitySlabs` changes from absent/empty to a non-empty array and the loaded payload has no `gapBehavior` property, include `gapBehavior: "no_adjustment"` in the same local payload update.
- Preserve any existing `gapBehavior` property exactly; do not default it during margin edits, preview, load, or saves without slabs.
- Do not change quantity-slab fields, basis-point fields, validation, preview, Mode state, or save orchestration.

Acceptance criteria traced to the specification:

- AC1 and AC2: only the requested control disappears.
- AC3: hidden payload preservation remains governed by the existing spread update.
- AC4 and AC5: the compatibility default is conditional on first-slab creation and never overwrites a stored policy.
- AC8: no backend, API, persistence, calculation, authorization, migration, or dependency change.

### 4. Strengthen the integrated Mode save assertion

- Seed the Quantity & margin test envelope with an existing valid `gapBehavior` value.
- Edit Start margin through the rendered Mode workspace and save.
- Assert the quantity-margin API mutation contains the changed margin plus the unchanged hidden `gapBehavior` value.
- Keep the existing single **Save Mode**, ordered section-save, CAS version, dirty-state, and preview assertions intact.
- Add a dedicated fresh-section regression that loads Quantity & margin as `{}`, adds and completes the first slab, saves Mode, and asserts the API payload includes the slab plus `gapBehavior: "no_adjustment"` without exposing the removed control.

Acceptance criteria traced to the specification:

- AC2–AC5 and AC7.

### 5. Focused verification

Run:

```text
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm run typecheck
git diff --check
```

- Inspect the scoped diff to confirm no hidden-value deletion or unrelated reformatting.

Acceptance criteria traced to the specification:

- AC1–AC7.

### 6. Integrated verification and hygiene review

Run:

```text
cd frontend && npm test
cd frontend && npm run build
git status --short
```

- Confirm the full frontend suite and production build pass on the integrated worktree.
- Report any unrun live-browser or width-specific visual check; do not claim it passed without execution.
- Confirm that no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.

Acceptance criteria traced to the specification:

- AC7 and AC8, with final confirmation of AC1–AC6.

## Affected areas

- Main Line Mode → Quantity & margin editor markup and accessible field inventory.
- Quantity-slab add behavior for a fresh local frontend payload only.
- Focused component rendering, payload-preservation, and defaulting tests.
- Integrated Mode existing-value and fresh-slab save expectations.
- No backend, API, calculation, authorization, migration, or external-system area is affected; only the newly created frontend payload gains the established compatibility value.

## Parallel execution

The initial implementation used the approved parallel mode with non-overlapping file ownership. The remediation touches the already-owned editor and both regression layers around one discovered invariant, so the production/defaulting change and focused test update should remain with the editor owner while the integrated fresh-save regression remains with the workspace-test owner; final review and verification run only after both finish.

## Completion evidence

- Exact changed files and final behavior summary.
- Focused and full frontend test results.
- Frontend typecheck, build, and `git diff --check` results.
- Confirmation that an existing hidden `gapBehavior` value is preserved by a remaining Quantity & margin edit.
- Confirmation that adding a first slab to `{}` produces and saves `gapBehavior: "no_adjustment"`, while adding a slab to an existing policy does not replace it.
- Unrun checks and any remaining visual-QA limitation.
- Confirmation that no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.
