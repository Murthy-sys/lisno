# Main Line Scope, Execution, and Advanced Tab Removal Task Plan

## Approved source of truth

- Specification: `docs/superpowers/specs/2026-09-01-main-line-scope-execution-advanced-tab-removal-design.md`

## Implementation boundaries

- Frontend navigation contract only; backend Scope, Execution, and Advanced sections remain valid and stored.
- Preserve the configured-only Overview projection for saved hidden-section data.
- Preserve backend blockers, warnings, completeness, permissions, CAS, queries, caches, and activation behavior.
- No backend, shared primitive, dependency, lockfile, migration, staging, commit, push, deployment, seed, or production action.

## Ownership map

- Navigation contract owner:
  - `frontend/src/features/ai-estimator-knowledge/knowledgeWorkspaceSections.ts`
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionNavigation.tsx` only if the reduced contract requires a local semantic adjustment
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx`
- Overview action owner:
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
- Integrated workspace owner:
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- Summary projection is read-only unless evidence proves a defect:
  - `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.ts`
  - `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts`
- The primary agent owns contract reconciliation, the approved documents, final diff review, and cross-slice integration.

## Dependency-ordered tasks

### 1. Capture the pre-change contract and dirty-path baseline

- Record status, hashes, and relevant diffs for every owned target before writers start.
- Run the focused navigation, Overview, and workspace tests to establish the current baseline.
- Confirm the current seven-section order and the existing saved Scope/Execution/Advanced Overview fixtures.

Acceptance coverage:

- Establishes a safe comparison point for AC1–AC11 and protects unrelated dirty work.

### 2. Reduce the navigable workspace-section contract

- Change the first-level workspace keys to exactly:
  - `overview`
  - `mode`
  - `recommendations`
  - `quality`
- Remove Scope, Execution, and Advanced from the navigable backend-section mapping without removing their backend section types/contracts.
- Keep the tablist, selector, roving focus, disabled-section logic, tabpanel association, and dirty-navigation focus restoration generic over the reduced contract.
- Update focused navigation tests for the four-section order, Arrow Left/Right, Home, End, wraparound, disabled-section skipping, and mobile selector.

Acceptance coverage:

- AC1–AC4 and the navigation portion of AC9.

### 3. Preserve hidden-section Overview summaries without dead actions

After Task 2 settles the navigable type:

- Keep Scope, Execution, and Advanced inputs in the Overview summary queries/projection.
- Render configured meaningful summary content and its local loading/error/retry states exactly as before.
- Render no **Open Scope**, **Open Execution**, or **Open Advanced** action for summary cards whose section is no longer navigable.
- Keep Open actions for still-navigable summaries such as Mode, Recommendations, and Quality.
- Add asymmetric tests proving saved hidden-section summaries remain, empty summaries stay omitted, retry remains local, hidden-section Open actions are absent, and retained-section Open actions still navigate.

Acceptance coverage:

- AC5–AC7 and the Overview portion of AC9.

### 4. Integrate the reduced navigation into the Main Line workspace

After Task 2:

- Ensure `activeSection`, command-bar labels, busy state, editor rendering, and relationship error messaging cannot select or branch into Scope, Execution, or Advanced.
- Keep Overview summary queries for all backend summary sources, including the three hidden sections.
- Rebase route tests from seven to four first-level sections on desktop and mobile.
- Preserve Mode, Recommendations, and Quality editing; one contextual Save; dirty save/discard/stay; read-only, archived, null-revision, conflict, permission, warning, and blocker states.
- Add a blocker fixture referencing a hidden section to prove it remains visible and activation behavior is not reinterpreted.

Acceptance coverage:

- AC1–AC4 and AC8–AC10.

### 5. Integrated integrity review

Run an `integrity_reviewer` after all writers finish.

Review invariants:

- no hidden-section data/API/schema deletion;
- Overview still fetches/projects saved hidden-section data;
- no dead Open actions;
- no hidden blocker/warning suppression;
- four-section keyboard/mobile contract;
- permissions, CAS, dirty guard, conflict, read-only, and archived behavior unchanged;
- no unrelated dirty work overwritten.

Resolve every confirmed finding before verification.

### 6. Independent verification

Run a `verification_runner` after integrity review is clear.

Focused lane:

```text
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
```

Full and hygiene lane:

```text
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

Rendered verification:

- Attempt live browser checks for the desktop tablist and mobile selector.
- Confirm exactly four choices, no horizontal/navigation artifact from the removed tabs, and configured hidden-section summaries without dead Open buttons.
- If no browser is connected, report the limitation and do not substitute another browser surface.

Acceptance coverage:

- AC1–AC12.

## Parallel execution

Safe parallel work begins only after Task 2 establishes the reduced navigation type:

- Task 3 may edit Overview panel/tests.
- Task 4 may edit workspace integration/tests.

Those slices have non-overlapping file ownership. Task 5 and Task 6 are sequential and run only on the integrated result.

## Stop and report conditions

- A backend validator, activation rule, or required blocker makes hidden sections impossible to resolve and requires a product decision beyond navigation removal.
- Preserving configured-only hidden-section summaries requires an API/query contract change.
- A writer encounters unknown existing changes in an owned file that cannot be preserved safely.
- Implementation evidence shows that removing the tabs would delete or overwrite saved data.

## Completion evidence

- Exact changed files and visible behavior.
- Proof that saved Scope, Execution, and Advanced summaries remain while their Open actions are absent.
- Focused/full test counts, typecheck, build, and hygiene results.
- Browser verification result or explicit unavailability.
- Confirmation that no backend, migration, dependency, staging, commit, push, deployment, or production action occurred.
