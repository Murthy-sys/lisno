# AI Estimator Section State Control Removal Task Plan

## Approved source of truth

- Design specification:
  `docs/superpowers/specs/2026-09-01-ai-estimator-section-state-control-removal-design.md`

## Delivery boundary

Remove the section-envelope **Section state** selectors from every Super Admin
AI Estimator item-workspace tab and every Mode block. Preserve each loaded
backend applicability value in update requests and leave domain-specific
applicability fields unchanged.

No backend, database, API-contract, authorization, migration, dependency,
deployment, commit, or push work is included.

## Ownership and dirty-work boundary

- The implementation owner may change only the relevant portions of:
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
  - `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
  - focused tests under `frontend/src/features/ai-estimator-knowledge/`
  - `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
    only if section-state-specific rules become unused or a compact remaining
    toolbar layout needs a scoped correction.
- These feature files already contain user-owned Mode-consolidation work. Before
  editing, capture the relevant diff and preserve all behavior outside the
  section-state control path.
- The primary agent owns contract interpretation, integration, final diff
  review, and acceptance-criteria reconciliation.
- No task may reformat, revert, stage, or otherwise modify unrelated dirty paths.

## Dependency-ordered tasks

### Task 1 — Lock regression coverage for control absence and value preservation

**Depends on:** approved specification.

**Affected areas:** focused AI Estimator workspace tests and existing test
fixtures/helpers.

1. Add a rendered regression proving the standalone-section path has no
   **Section state** control.
2. Exercise the first-level tabs so Overview, Scope, Recommendations, Quality,
   Execution, and Advanced are covered without relying on a single initial tab.
3. Add Mode coverage proving UOM, Pricing, and Quantity & margin do not render
   section-state controls.
4. Add or extend save assertions so standalone and Mode updates submit the exact
   applicability received from each loaded section envelope.
5. Keep a positive assertion that Overview's domain-specific **Section
   applicability rules** remains present where supplied by the payload.

**Acceptance criteria covered:** 1, 2, 4, 5, 8 and acceptance criteria 1–3 from
the approved specification.

**Verification:** run the changed test file(s) and confirm the new assertions
fail against the pre-change UI for the expected missing-control reason before
the implementation edit, where practical within the shared dirty worktree.

### Task 2 — Remove standalone-tab section-state editing

**Depends on:** Task 1 test coverage in place.

**Affected area:** `KnowledgeItemWorkspacePage.tsx`.

1. Remove the section-envelope Field/Select control from the standalone section
   toolbar.
2. Keep applicability local state synchronized from loaded, saved, refreshed,
   discarded, and conflict-server envelopes.
3. Keep the loaded applicability in the existing update payload.
4. Preserve Section version metadata, Save section behavior, dirty state,
   loading/error/read-only behavior, and conflict review.
5. Remove imports or handlers only when they have no remaining use in the file.

**Acceptance criteria covered:** 1, 3, 4, 6, 7, 9.

**Verification:** focused test assertions for control absence, exact save
payload, and conflict/discard behavior.

### Task 3 — Remove Mode-block section-state editing

**Depends on:** Task 1 test coverage in place.

**Affected area:** `KnowledgeModePanel.tsx`.

1. Remove the Field/Select markup and `onApplicabilityChange` plumbing from the
   Mode block toolbar.
2. Retain applicability in every `ModeDraft`, initialize it from each server
   envelope, refresh it on save/discard/conflict resolution, and include it in
   each dirty section update.
3. Preserve independent UOM, Pricing, and Quantity & margin versions, dirty and
   saving feedback, validation, error handling, and global Save Mode behavior.
4. Remove imports/types only where they are no longer used; do not disturb the
   current Mode consolidation.

**Acceptance criteria covered:** 2, 3, 5, 6, 7, 9.

**Verification:** focused Mode render and exact multi-section save-payload tests.

### Task 4 — Reconcile toolbar styling and responsive behavior

**Depends on:** Tasks 2 and 3.

**Affected area:** AI Estimator feature CSS and rendered workspace.

1. Inspect the remaining standalone and Mode toolbar structure after control
   removal.
2. Delete section-state-field CSS only if repository search confirms it has no
   remaining consumer.
3. Apply a feature-scoped layout adjustment only if required to keep version,
   dirty/saving, and save content compact at desktop and mobile widths.
4. Confirm no empty leading region, horizontal page overflow, or inaccessible
   visually hidden selector remains.

**Acceptance criteria covered:** 3, 7, 9 and the responsive/accessibility
acceptance criteria.

**Verification:** rendered interaction/accessibility checks at representative
desktop and mobile widths, plus focused layout assertions if the existing test
style supports them.

### Task 5 — Integrated verification and hygiene review

**Depends on:** Tasks 1–4.

**Affected areas:** integrated frontend worktree and repository status.

1. Run every changed focused AI Estimator test.
2. Run the complete frontend typecheck and build.
3. Run a broader affected frontend test suite when focused tests do not exercise
   every workspace path.
4. Run `git diff --check` and `git status --short`.
5. Inspect the final target-file diff against the initial dirty state, confirming
   unrelated Mode-consolidation and other user changes remain intact.
6. Reconcile results against every approved acceptance criterion and report any
   unrun check or residual risk without calling partially verified work complete.

**Acceptance criteria covered:** all.

## Parallel execution boundaries

- After Task 1 settles fixture and assertion expectations, Tasks 2 and 3 are
  technically independent because they own different component files.
- Test-file ownership must be explicitly divided before parallel execution; two
  writers must not edit the same test file.
- Task 4 waits for both component changes so it evaluates the integrated markup.
- Task 5 is serial and runs only after all writers finish because tests in the
  shared worktree can otherwise observe transient state.
- Given the small size and existing dirty feature files, inline execution is
  expected to have the lowest integration risk, but the execution-mode choice
  remains the user's decision at the next gate.

## Verification commands

The exact focused files will be selected after locating the closest existing
workspace and Mode assertions. The required lanes are:

```sh
cd frontend && npm test -- <changed-focused-test-file(s)>
cd frontend && npm run typecheck
cd frontend && npm run build
git diff --check
git status --short
```

Rendered QA must cover at least one desktop width and one mobile width, including
the standalone section path and Mode's UOM, Pricing, and Quantity & margin
blocks.

## Acceptance-criteria traceability

- **Selectors absent everywhere:** Tasks 1, 2, and 3; rendered confirmation in
  Task 4.
- **Applicability values preserved:** Tasks 1, 2, and 3; integrated verification
  in Task 5.
- **Versions, save/status, editors, and Overview rules preserved:** Tasks 1–4.
- **Responsive and accessible toolbar result:** Task 4.
- **Focused tests, typecheck, build, and repository hygiene:** Task 5.

## External actions and rollback

- No external or production action is authorized.
- No data rollback is required. A code rollback restores the removed controls
  because persisted applicability values are never changed or normalized by
  this work.
