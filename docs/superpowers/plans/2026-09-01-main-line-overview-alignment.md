# Super Admin Main Line Overview alignment task plan

**Status:** Awaiting task-plan approval  
**Date:** 2026-09-01  
**Approved specification:**
[2026-09-01-main-line-overview-alignment-design.md](../specs/2026-09-01-main-line-overview-alignment-design.md)

## 1. Delivery objective

Refine the Super Admin Main Line Overview so the command bar, context row,
Configured values heading, UOM/Surfaces controls, and quick-add action use one
compact, professional, responsive alignment system without changing Overview
data or workflow behavior.

## 2. Ownership boundaries

### Primary implementation area

- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
  - item-workspace Overview inset, spacing, field-grid, and responsive rules;
  - item-workspace-scoped cascade protection where the later role theme could
    override the intended geometry.

### Conditional markup area

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
  - only a small semantic grouping or class hook when the approved alignment
    cannot be implemented robustly with the existing markup;
  - no data, visibility, action, save, or state logic changes.

### Verification area

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
  - CSS contract, responsive alignment, and cascade-specificity coverage.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
  - update only if a semantic wrapper/class hook changes rendered structure;
  - existing interaction and accessibility assertions remain authoritative.
- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
  - regression lane for command bar, save, read-only, loading/error, and
    workspace behavior; avoid unrelated rewrites.

### Explicitly out of bounds

- Backend, contracts, persistence, routes, services, authorization, API/query
  behavior, CAS, activation, migrations, dependencies, and shared UI primitives.
- The paused Scope/Execution/Advanced tab-removal repair decision.
- Staging, committing, pushing, deploying, or production mutation.

## 3. Dependency-ordered tasks

### Task 1 — Capture the protected baseline

**Owner:** implementation lead  
**Dependencies:** none

1. Record `git status --short` and the initial dirty-path set.
2. Capture the relevant diffs and content hashes for the stylesheet, Overview
   panel, workspace layout test, Overview panel test, and screen test.
3. Inspect existing rules at all Overview/workspace responsive breakpoints and
   the later role-theme Surface/control rules.
4. Run the focused pre-change regression lane:

   ```bash
   cd frontend
   npm test -- \
     src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
   ```

5. If the focused baseline fails, distinguish pre-existing failures from this
   task before any writer starts.

**Acceptance criteria:**

- Existing user work is identified and protected.
- The current layout contract and test baseline are documented.
- No file outside the approved ownership boundary is assigned for writing.

### Task 2 — Implement the Overview alignment contract

**Owner:** frontend implementation  
**Dependencies:** Task 1

1. Consolidate item-workspace Overview spacing into a clear local contract:
   shared card insets, compact vertical rhythm, and min-width safety.
2. Balance the Main Line/Basket context row padding and divider while preserving
   wrapping and its current content.
3. Align the Configured values heading group and field grid to the same content
   edge.
4. Keep UOM and Surfaces in equal `minmax(0, 1fr)` desktop columns with matching
   label baseline, full-width controls, and at least 44px control height.
5. Keep **Add unit of measure** left-aligned directly below UOM using a compact
   gap that does not shift the Surfaces field.
6. Preserve the existing `768px` one-column field layout; refine narrow-screen
   insets/wrapping only where needed.
7. Scope selectors to the Main Line item workspace and reuse spacing, radius,
   border, role-color, shadow, and focus tokens.
8. Add a small Overview markup hook only if the existing structure cannot meet
   the contract without fragile selectors.

**Acceptance criteria:** AC1–AC7 from the approved specification.

**Stop conditions:**

- A shared primitive must change to achieve the requested alignment.
- A proposed markup change affects field visibility, interaction, save state,
  accessible names, or configured-only summary behavior.
- Existing dirty changes in an owned target cannot be safely reconciled.

### Task 3 — Add focused regression coverage

**Owner:** frontend test implementation  
**Dependencies:** Task 2 selector/markup contract settled

1. Extend the workspace layout test to assert:
   - compatible command-bar/card insets;
   - balanced context-row padding;
   - compact section/grid gaps;
   - equal two-column field geometry;
   - aligned labels and minimum control height;
   - quick-add placement;
   - `768px` one-column stacking;
   - narrow-screen inset/wrapping rules; and
   - item-workspace specificity where the later role theme overlaps.
2. Preserve or strengthen rendered Overview assertions for accessible UOM and
   Surfaces names, Save Overview uniqueness, read-only behavior, loading/error
   states, and quick-add behavior.
3. Do not replace meaningful behavior tests with source-string-only assertions.

**Acceptance criteria:** AC6–AC8 from the approved specification.

### Task 4 — Run integrated frontend verification

**Owner:** verification  
**Dependencies:** Tasks 2 and 3

Run in order:

```bash
cd frontend
npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm run typecheck
npm run build
```

Then run repository hygiene checks:

```bash
git diff --check
git status --short
```

Inspect the final scoped diff against the baseline hashes and confirm no
unrelated user changes were overwritten.

**Acceptance criteria:** AC8–AC10 from the approved specification.

### Task 5 — Perform responsive visual and interaction QA

**Owner:** verification  
**Dependencies:** Task 4 focused tests and typecheck pass; a browser is available

Attempt the signed-in Super Admin Main Line Overview at representative widths:

| Width/state | Required inspection |
| --- | --- |
| Wide desktop (about 1440px+) | common edges, compact rhythm, equal fields, no excessive dead space |
| Rail-stack width (about 1024–1180px) | history placement does not compress or misalign Overview |
| Tablet (768px) | selector/command bar behavior and one-column field transition |
| Mobile (about 390–480px) | reduced insets, wrapped context, full-width Save, no horizontal overflow |
| Dirty/saving/error | status and button remain aligned and legible |
| Read-only/archived | no Save/quick-add, controls and context remain aligned |
| Long/unavailable values | text wraps without clipping or control overlap |

For each available state, verify keyboard focus visibility and UOM/Surfaces
interaction. If no in-app browser is available, report that limitation exactly
and do not substitute a claim of completed live visual QA.

**Acceptance criteria:** AC1–AC9 from the approved specification.

### Task 6 — Final reconciliation and handoff

**Owner:** implementation lead  
**Dependencies:** Tasks 4 and 5

1. Reconcile implementation and verification evidence against every acceptance
   criterion.
2. Report the exact changed files and principal CSS decisions.
3. Report exact test/typecheck/build results and any unrun browser checks.
4. Confirm no backend, migration, dependency, staging, commit, push, deployment,
   or production action occurred.
5. Keep the separate hidden Scope/Advanced Draft-reference risk explicitly
   unresolved unless the user makes that product decision in a later task.

## 4. Parallel execution safety

This is a localized, contract-sensitive CSS change. The following boundaries
apply if execution mode A is selected:

- Baseline capture completes before any writer starts.
- The stylesheet has one writer only.
- The Overview component has the same writer as the stylesheet if a markup hook
  is required, preventing selector/markup drift.
- Test work may be assigned separately only after the final selector/markup
  contract is communicated; it owns only the listed test files.
- Integrated tests and visual QA run after all writers finish because concurrent
  shared-worktree tests may observe transient state.
- No two agents edit the same file.

Tasks 2 and 3 are therefore dependency-ordered rather than fully parallel.
Read-only final verification can proceed independently only after both are
complete.

## 5. Completion checklist

- [ ] Protected baseline recorded.
- [ ] Overview alignment CSS implemented within scope.
- [ ] Any markup hook is minimal and behavior-neutral.
- [ ] Focused regression tests updated and passing.
- [ ] Frontend typecheck passes.
- [ ] Frontend build passes.
- [ ] Responsive browser QA completed or exact unavailability reported.
- [ ] `git diff --check` passes.
- [ ] Unrelated dirty work preserved.
- [ ] No backend, data, dependency, commit, push, deployment, or production
      action performed.
