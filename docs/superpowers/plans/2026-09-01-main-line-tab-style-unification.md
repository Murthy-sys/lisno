# Super Admin Main Line visible-tab style unification task plan

**Status:** Awaiting task-plan approval  
**Date:** 2026-09-01  
**Approved specification:**
[2026-09-01-main-line-tab-style-unification-design.md](../specs/2026-09-01-main-line-tab-style-unification-design.md)

## 1. Delivery objective

Extend the approved Main Line Overview visual system to the current Mode,
Recommendations, and Quality tabs while preserving their distinct editor
structures, every interaction/state contract, and all backend behavior.

## 2. Ownership boundaries

### Primary production ownership

- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
  - common visible-tab content insets and vertical rhythm;
  - Mode section blocks and local metadata toolbar;
  - Recommendations/Quality section headings, repeaters, rows, field grids, and
    action rails;
  - `768px`, `640px`, `480px`, coarse-pointer, and reduced-motion behavior;
  - item-workspace-scoped specificity against the later role theme.

### Conditional markup ownership

One production writer may modify these files only if a behavior-neutral class
hook is demonstrably necessary:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeRepeater.tsx`

No content, field, state, payload, mutation, focus, or accessible-name change is
authorized. A shared primitive change is a stop condition.

### Test ownership

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx`
- a new item-workspace-local layout test only if the two existing files cannot
  express the approved CSS contract without mixing unrelated concerns.

Existing rendered regression files remain read-only unless a minimal semantic
class hook requires a corresponding assertion:

- `KnowledgeScreens.test.tsx`
- `KnowledgeModeSectionStateRemoval.test.tsx`
- `KnowledgeSectionEditor.overview.test.tsx`
- `KnowledgeSectionEditor.pricing.test.tsx`

### Explicitly out of bounds

- Backend, contracts, routes, services, persistence, authorization, APIs,
  queries, cache synchronization, CAS, activation, audit, migrations, seeds,
  dependencies, lockfiles, shared UI primitives, Scope/Execution/Advanced
  navigation, staging, commits, pushes, deployments, and production mutation.

## 3. Dependency-ordered tasks

### Task 1 — Capture and verify the protected baseline

**Owner:** implementation lead  
**Dependencies:** none

1. Record the complete dirty-path set with `git status --short`.
2. Capture hashes and relevant diffs for every production/test file named in the
   ownership boundary.
3. Reconfirm the current visible-tab contract from
   `knowledgeWorkspaceSections.ts` without modifying it.
4. Trace the loaded CSS order through feature styles, shared primitives, and
   `role-themes.css`.
5. Run the focused pre-change lane:

   ```bash
   cd frontend
   npm test -- \
     src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx \
     src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
   ```

6. Record the known broader-suite stale seven-tab assertion separately; do not
   alter it under this task.

**Acceptance criteria:**

- All dirty target ownership is explicit and existing user work is protected.
- Focused baseline results are known before writers start.
- Current Mode/repeater structure, responsive rules, and cascade risks are
  evidenced rather than assumed.

### Task 2 — Confirm the smallest styling hook contract

**Owner:** implementation lead; read-only auditors when execution mode allows  
**Dependencies:** Task 1

1. Confirm whether the existing classes are sufficient for:
   - direct Recommendations/Quality workspace surfaces;
   - Mode block surfaces and metadata toolbar;
   - repeater headers, rows, content, and action rails; and
   - item-workspace-only responsive rules.
2. Prefer CSS-only implementation.
3. If a class hook is necessary, define its exact semantic purpose and owning
   component before the production writer begins.
4. Reject selectors based on DOM position, visible text, generated IDs, or
   backend section data when a stable class exists.

**Acceptance criteria:** AC1–AC7 and the conditional-hook constraint.

**Stop conditions:**

- Styling requires a shared primitive change.
- Styling cannot distinguish the intended Main Line tab surface without
  leaking into reusable-master/index screens.
- A hook would change headings, content, fields, accessible names, focus, or
  state behavior.

### Task 3 — Implement the unified visible-tab styling

**Owner:** frontend production implementation  
**Dependencies:** Tasks 1 and 2

1. Keep navigation, command bar, and active content at one shared outer edge.
2. Give direct tab surfaces and Mode block surfaces explicit `--space-5`
   desktop padding with sufficient item-workspace specificity.
3. Use `--space-4` compact vertical rhythm for section editor groups.
4. Refine Mode:
   - reduce the panel gap to the approved rhythm where necessary;
   - make both section blocks share padding/gap geometry;
   - make `knowledge-mode-block__toolbar` a compact local divider with no
     second horizontal inset or competing elevation;
   - align conflict, editor, error, and preview content within the block; and
   - retain the existing Pricing → Quantity & margin order and single top Save.
5. Refine Recommendations/Quality:
   - align section heading, repeater header, empty state, and rows;
   - keep Add action at the repeater header's trailing edge on wide layouts;
   - use restrained nested row treatment without added shadow;
   - make row content shrink-safe and top aligned;
   - keep labels wrapping and supported controls full width/minimum 44px; and
   - keep move/remove actions grouped and clearly associated with the row.
6. Add item-workspace-local breakpoint rules:
   - `768px`: dense grids reduce without overflow;
   - `640px`: repeater rows/content/actions stack;
   - `480px`: surface padding becomes `--space-4`, metadata/header actions wrap,
     and Add actions become full width when needed;
   - coarse pointer: relevant controls/actions remain at least 44px; and
   - reduced motion: retain the existing no-motion behavior.
7. Reuse only existing spacing, radius, role-color, border, shadow, focus, and
   motion tokens.

**Acceptance criteria:** AC1–AC7 from the approved specification.

**Stop conditions:**

- A proposed rule hides or moves an operational state/action outside its owning
  section.
- A fixed height or fixed desktop width is needed to make the layout appear
  aligned.
- A CSS change affects non-item knowledge screens or shared primitives.
- Existing dirty changes in an owned target cannot be reconciled safely.

### Task 4 — Add layout regression coverage

**Owner:** frontend test implementation  
**Dependencies:** Task 3 selector/hook contract settled

1. Assert the shared desktop and mobile surface insets for Overview, Mode,
   Recommendations, and Quality.
2. Assert compact section/editor/Mode panel gaps.
3. Assert Mode toolbar behavior:
   - static local divider;
   - no negative margin or second inline inset;
   - aligned block metadata; and
   - no second Save control.
4. Assert repeater geometry:
   - balanced header row;
   - shrink-safe content;
   - restrained row surface;
   - grouped row actions;
   - aligned/full-width controls and wrapped labels; and
   - minimum action/control touch targets.
5. Assert `768px`, `640px`, and `480px` rules and item-workspace specificity
   against the later role theme.
6. Preserve existing rendered behavior tests for Mode ordered saves, partial
   failure, conflicts, dirty navigation, read-only, Recommendations/Quality
   editing, repeater focus, validation, and accessibility.

**Acceptance criteria:** AC1–AC9.

### Task 5 — Run focused integrated regression checks

**Owner:** implementation lead  
**Dependencies:** Tasks 3 and 4

Run:

```bash
cd frontend
npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm run typecheck
```

Inspect failures for behavior regression, brittle CSS-contract assertions, or
unrelated dirty-worktree effects before proceeding.

**Acceptance criteria:** AC8 and the focused portion of AC9.

### Task 6 — Perform mandatory integrated integrity review

**Owner:** `integrity_reviewer`  
**Dependencies:** all production/test writers finished; Task 5 green

Review read-only for:

- selector/cascade correctness and leakage;
- Mode ordered-save/CAS/conflict and single-Save invariants;
- repeater add/remove/reorder focus and accessible action invariants;
- read-only, validation, loading, error, preview, and permission states;
- responsive overflow, long content, zoom, coarse targets, and reduced motion;
- exact acceptance-criteria coverage; and
- preservation of unrelated dirty work.

Confirmed findings return to the owning writer. Review repeats after fixes.

### Task 7 — Run independent final verification

**Owner:** `verification_runner`  
**Dependencies:** integrity review has no unresolved confirmed defect

Run in order:

```bash
cd frontend
npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.overview.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.pricing.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm run typecheck
npm test
npm run build
```

Then from repository root:

```bash
git diff --check
git status --short
```

The full-suite report must distinguish the known unrelated stale seven-tab
assertion if it remains the only failure. Do not claim lint because the
repository has no lint script.

**Acceptance criteria:** AC8, AC9, AC11, and AC12.

### Task 8 — Perform responsive visual and interaction QA

**Owner:** implementation lead or verification  
**Dependencies:** Task 7 focused checks/typecheck pass; supported browser is
available

Inspect signed-in Super Admin states:

| Width/state | Mode | Recommendations/Quality |
| --- | --- | --- |
| 1440px+ | two block surfaces, aligned metadata/content, dense price rows | shared edges/insets, header/Add alignment, row actions |
| 1024–1180px | history stacking does not change block alignment | rows use available main width without gutters/overflow |
| 768px | dense grids reduce and command bar stacks | field grids reduce without overlap |
| 640px | block content stays contained | repeater row and actions stack predictably |
| 390–480px | `--space-4` inset, metadata/errors wrap | heading/Add wrap, controls/actions reachable, no page scroll |
| empty | both block loading/empty states remain aligned | dashed empty state and Add action remain clear |
| dirty/saving/error/conflict | one Save Mode and local block feedback | one Save, validation/error/action ownership clear |
| read-only/archived | no mutation controls; content remains legible | no Add/remove/move; disabled/read-only content aligned |

Verify keyboard focus, visible focus rings, row add/remove focus, long labels and
stable IDs, popup containment, enlarged text, and page-level horizontal
overflow. If no supported browser is connected, report that exact limitation
and do not substitute another browser surface or claim visual completion.

**Acceptance criteria:** AC1–AC10.

### Task 9 — Final reconciliation and handoff

**Owner:** implementation lead  
**Dependencies:** Tasks 6–8

1. Map evidence to all acceptance criteria.
2. Inspect final scoped hashes/diffs against Task 1.
3. Report exact files, visual decisions, test/typecheck/build results, broader
   suite status, browser result, warnings, and unrun checks.
4. Confirm no backend, data, dependency, migration, staging, commit, push,
   deployment, or production action occurred.
5. Keep the separate hidden Scope/Advanced Draft-reference risk and stale
   seven-tab assertion explicitly outside this styling slice.

## 4. Parallel execution safety

If execution mode A is selected:

- Task 1 completes before any writer starts.
- Read-only Mode and Recommendations/Quality audits may run in parallel after
  the baseline because they have distinct questions and no write ownership.
- One frontend production writer owns the stylesheet and any approved minimal
  component hooks; no other agent edits those files.
- A separate test writer may begin only after the final selector/hook contract
  is communicated and owns only the named layout-test files.
- Existing rendered behavior-test files remain read-only unless the primary
  agent explicitly transfers one file to the test owner.
- Integrity review runs after all writers finish; final verification runs only
  after confirmed review findings are resolved.
- No two agents edit the same file, and tests during concurrent edits are not
  treated as final evidence.

Tasks 3 and 4 are dependency-ordered rather than fully parallel. Parallelism is
reserved for bounded read-only audits and post-contract non-overlapping work.

## 5. Completion checklist

- [ ] Dirty baseline and relevant hashes/diffs captured.
- [ ] Existing focused tests recorded.
- [ ] Smallest CSS/class-hook contract confirmed.
- [ ] Mode tab styling unified without behavior changes.
- [ ] Recommendations and Quality styling unified without behavior changes.
- [ ] Responsive and touch-target rules implemented.
- [ ] Focused layout coverage passes.
- [ ] Existing rendered behavior/accessibility lanes pass.
- [ ] Integrity review has no unresolved confirmed defect.
- [ ] Frontend typecheck and production build pass.
- [ ] Broader suite result correctly separates unrelated stale tab assertion.
- [ ] Browser width/state matrix completed or exact unavailability reported.
- [ ] `git diff --check` passes and unrelated dirty work is preserved.
- [ ] No backend, migration, dependency, commit, push, deployment, or production
      action performed.
