# AI Estimator Mode Tab Consolidation Task Plan

## Source of truth

- Approved specification:
  `docs/superpowers/specs/2026-08-31-ai-estimator-mode-tab-consolidation-design.md`
- Existing feature design to reconcile during implementation:
  `docs/superpowers/specs/2026-08-28-ai-estimator-knowledge-base-design.md`

## Outcome

Deliver one Super Admin item-workspace tab named **Mode** containing the primary
UOM, Pricing, and Quantity & margin editors, while preserving the existing
backend `overview`, `pricing`, and `quantity-margin` section contracts and their
independent versions, applicability states, validation, and failure handling.

## Current implementation boundaries

- `KnowledgeSectionNavigation.tsx` currently couples visible first-level
  navigation directly to `KNOWLEDGE_SECTION_KEYS`, which are backend section
  keys.
- `KnowledgeItemWorkspacePage.tsx` owns one active backend-section query and one
  dirty payload at a time.
- `KnowledgeSectionEditor.tsx` owns both section headings and all fields, including
  the Overview UOM field.
- `KnowledgeScreens.test.tsx` contains the primary rendered navigation,
  unsaved-change, stable-ID, preview, responsive, and keyboard coverage.
- No relevant product-code path was dirty when the specification was created.
  The approved specification file is the only current untracked path.

## Implementation decisions

1. Introduce a frontend-only workspace-section contract whose visible keys are
   `overview`, `mode`, `scope`, `recommendations`, `quality`, `execution`,
   `advanced`. Do not add `mode` to backend `KnowledgeSectionKey` or send it to an
   API.
2. Keep non-Mode sections on the existing single-section editor path.
3. Add a Mode orchestration layer with independent local buffers for `overview`,
   `pricing`, and `quantity-margin`. Only `overview.uomId` is presented from the
   Overview payload inside Mode; the remaining Overview fields stay in Overview.
4. Use one **Save Mode** action. Save dirty underlying sections in the stable
   order `overview` → `pricing` → `quantity-margin`, stopping at the first
   validation, API, or version-conflict failure. Successfully saved blocks become
   clean; the failing and not-yet-attempted blocks remain dirty and visibly
   identified. This avoids a false all-saved state while acknowledging that an
   already successful versioned write cannot be rolled back.
5. Keep one applicability control and version/status line per Mode block. The UOM
   block's control represents the underlying Overview section and remains
   synchronized with the Overview tab through the shared query cache.
6. Keep the existing page-level unsaved-change dialog. In Mode it saves all dirty
   Mode blocks using the same ordered save routine; discard restores all three
   Mode buffers from the latest cached/server envelopes.
7. Preserve the existing quick-add, optimistic-version, conflict review, query
   synchronization, read-only, archive, and server-preview semantics.

## Dependency-ordered tasks

### T1 — Add regression baselines for the approved UX contract

**Status:** completed

**Ownership:** Frontend tests only:
`frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx` and, if a
small focused unit is clearer, a new sibling navigation/mode test file. Do not
change product sources in this task.

**Work:**

- Replace the eight-tab expectation with the seven visible workspace sections.
- Assert that Mode exists and Pricing and Quantity & margin are absent from the
  first-level tablist and mobile selector.
- Assert that Overview has no primary UOM and Mode contains UOM, Pricing, and
  Quantity & margin headings in order.
- Add failing coverage for Mode dirty state, ordered multi-section saves, partial
  failure, conflict attribution, discard, read-only behavior, quick-add UOM,
  preview retention, keyboard order, and mobile selection.
- Keep existing stable-ID price, tax version, and preview-zero cases; retarget
  their navigation to Mode.

**Acceptance criteria covered:** 1–8.

**Verification:** Run the focused test file and confirm new assertions fail for
the expected missing Mode behavior before product changes.

### T2 — Decouple visible workspace navigation from backend section keys

**Status:** completed

**Depends on:** T1 baseline expectations.

**Ownership:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionNavigation.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgePresentation.ts`
- A new feature-local workspace-section type/mapping module if needed
- Focused navigation/presentation tests owned by T1

Do not edit API types or `KNOWLEDGE_SECTION_KEYS`.

**Work:**

- Define the seven visible workspace section keys and labels, including `Mode`.
- Make the desktop tablist and mobile selector consume the visible workspace
  contract rather than backend section keys.
- Preserve selected-tab/tabpanel associations, disabled handling where relevant,
  Arrow Left/Right wrapping, Home/End, roving `tabIndex`, and focus transfer.
- Preserve `KnowledgeSectionKey` and `KNOWLEDGE_SECTION_KEYS` as the authoritative
  backend contract.

**Acceptance criteria covered:** 1, 2, 8.

**Verification:** Focused rendered tests for tab count/labels, absent old tabs,
keyboard traversal, mobile Mode selection, and accessible relationships.

### T3 — Extract field-level composition for Overview and primary UOM

**Status:** completed

**Depends on:** T1 baseline expectations.

**Ownership:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- A new feature-local UOM editor component if extraction improves clarity
- Focused editor tests; do not edit workspace orchestration in this task

**Work:**

- Remove the primary UOM control from the rendered Overview field group while
  leaving description, priority, Modes, Surfaces, applicability rules, and all
  other Overview payload behavior intact.
- Expose a reusable primary-UOM editor bound only to `overview.uomId`, with the
  established active-master options, quick-add callback, permissions/read-only
  state, validation hooks, and stable-ID value.
- Avoid copying or transforming the Overview payload into a new schema.

**Acceptance criteria covered:** 3, 4, 5, 7.

**Verification:** Focused editor tests prove Overview omits UOM, the extracted
control edits only `uomId`, quick add returns/selects the stable master ID, and
read-only rendering disables mutation.

### T4 — Build the Mode multi-section orchestration and integrate the workspace

**Status:** completed

**Depends on:** T2 and T3.

**Ownership:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- New `KnowledgeModePanel.tsx` and/or a feature-local Mode state hook
- Existing feature-local query/mutation synchronization helpers only if a small,
  backward-compatible extension is required
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`

**Work:**

- Change page selection state to the seven-key workspace-section contract.
- Retain the existing single-section query/editor path for non-Mode sections.
- In Mode, load the `overview`, `pricing`, and `quantity-margin` envelopes with
  their independent loading/error/version/applicability states.
- Render labelled UOM, Pricing, and Quantity & margin blocks in order. Render the
  existing server preview beneath Quantity & margin.
- Track payload, applicability, validity, dirty state, pending state, and save
  error per block. Scope the Overview Mode buffer/write to the full latest
  Overview payload while allowing the user to change only `uomId`, so unchanged
  Overview fields are preserved.
- Implement the ordered Save Mode routine and block-attributed partial success,
  validation failure, generic error, and version conflict behavior from the
  approved implementation decisions.
- Extend the existing conflict state with its underlying section identity and
  preserve other Mode buffers when reviewing or discarding one conflicting
  block.
- Wire the page-level save button, announcements, lifecycle navigation, Back
  action, first-level tab changes, and browser navigation guard to the aggregated
  Mode dirty/save/discard state.
- Ensure cached Overview data is synchronized so moving between Overview and Mode
  never shows a stale UOM or discards saved non-UOM Overview fields.
- Add compact responsive styling that keeps block headings, applicability,
  version, save/error feedback, and controls readable without horizontal page
  scrolling.

**Acceptance criteria covered:** 1–8.

**Verification:** Focused rendered integration tests for success, partial
failure, conflict, discard, quick add, preview, loading/error, read-only/archive,
desktop keyboard behavior, mobile selection, and the 1440/1024/768/390/320 width
matrix.

### T5 — Reconcile documentation and complete integrated verification

**Status:** completed

**Depends on:** T4 and all focused tests passing.

**Ownership:** Primary integrator owns documentation, final diff reconciliation,
and verification. Under execution mode A, an `integrity_reviewer` runs after all
writers finish, followed by a `verification_runner`; neither owns product-source
edits.

**Work:**

- Update the item-workspace navigation/content portions of
  `docs/superpowers/specs/2026-08-28-ai-estimator-knowledge-base-design.md` to
  reflect the approved Mode presentation without rewriting historical backend
  section contracts.
- Check the integrated diff for accidental backend/type/API changes, duplicate or
  lost Overview fields, incorrect paise/percentage behavior, authorization
  visibility changes, stale queries, accessibility regressions, and unrelated
  formatting.
- Resolve confirmed review findings within the approved frontend scope.
- Run the full verification matrix and inspect the final worktree.

**Acceptance criteria covered:** 1–9.

**Verification commands:**

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

Also run the repository's existing rendered local frontend QA path, or an
equivalent browser-driven check, at 1440, 1024, 768, 390, and 320 pixels for:

- the default Overview state;
- Mode loaded with configured values;
- Mode with a validation error;
- Mode with a block load/save error; and
- an archived/read-only item.

Record exact commands, results, generated temporary artifact paths, and any
checks that could not be run.

**Completion note (2026-08-31):** All listed automated commands passed,
including 1,254/1,254 frontend tests. The in-app browser runtime reported that
no browser was available, so signed-in visual QA at the target widths could not
be run; the rendered interaction, accessibility, keyboard, mobile-selector, and
viewport-matrix tests passed instead.

### T6 — Contain Mode block toolbars in the Super Admin workspace

**Status:** completed

**Depends on:** Approval of the follow-up visual-fix specification update.

**Affected areas and ownership:** One frontend writer owns only
`frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css` and a
focused Mode layout regression test under the same feature directory. The
primary integrator owns final diff reconciliation and verification. No shared
design-system, role-theme, backend, or persistence file is in scope.

**Work:**

1. Add a failing stylesheet regression that confirms the Mode-specific toolbar
   hook overrides standalone sticky positioning while the shared
   `.knowledge-section-toolbar` rule remains sticky.
2. Add the narrowest Mode-scoped CSS override needed to keep the UOM, Pricing,
   and Quantity & margin toolbars non-sticky and contained by their own cards.
3. Confirm desktop and mobile Mode markup still exposes the same headings,
   fields, dirty state, keyboard behavior, and responsive selector.
4. Run focused tests, frontend typecheck/build, the full frontend suite, and
   repository hygiene checks. Retry signed-in browser QA if a browser connection
   becomes available; otherwise report it as unrun.

**Acceptance criteria covered:** 10, with regression protection for 4, 8, and
9.

**Verification commands:**

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

**Parallel safety:** This is one localized CSS/test slice and should not be split
among concurrent writers. Under execution mode A, one frontend writer performs
the fix, followed sequentially by review and final verification.

**Completion note (2026-08-31):** The Mode-scoped toolbar override and focused
stylesheet regression were implemented. The integrity review found no selector
leakage or mobile cascade defect. Final verification passed 1,255/1,255 frontend
tests, typecheck, production build, and repository hygiene checks. Signed-in
browser scrolling QA remained unavailable and is recorded as an unrun check.

### T7 — Correct the screenshot-confirmed Super Admin workspace layout

**Status:** completed

**Depends on:** Approval of the screenshot-driven specification update and the
completed T6 containment fix.

**Affected areas and ownership:** One frontend writer owns the bounded item-page
slice in `KnowledgeItemWorkspacePage.tsx`, `KnowledgeSectionEditor.tsx`,
`ai-estimator-knowledge.css`, and a focused item-workspace layout regression test
under the same feature directory. Existing Mode behavior and tests are inputs,
not rewrite targets. The primary integrator owns review and final reconciliation.
No shared primitive, role-theme, backend, lockfile, or unrelated page file is in
scope.

**Work:**

1. Add explicit item-workspace and Overview-editor hooks so the correction can
   be scoped without modifying shared PageHeader, Field, Select, Textarea,
   Surface, design-token, or role-theme behavior.
2. Add failing source/rendered regressions for the screenshot defects: header
   grouping, content-sized desktop tab deck, bounded Overview field measure,
   compact resizable Description, balanced Priority/Modes/Surfaces layout,
   Super Admin field contrast, and mobile fallback.
3. Implement the narrowest scoped CSS that places the breadcrumb on its own row,
   aligns content/actions below it, limits the desktop tab deck to its content,
   and gives Overview a readable responsive measure.
4. Strengthen default control boundary/background contrast only within this
   Super Admin item workspace while preserving hover, focus-visible, disabled,
   invalid, and read-only states from the shared primitives.
5. Verify the layout at 1440, 1024, 768, 390, and 320 pixels using the available
   rendered width matrix. Use the supplied screenshot as the wide-screen defect
   reference. If a connected signed-in browser becomes available, perform live
   visual/scroll QA; otherwise record it as unrun.

**Acceptance criteria covered:** 11–15, with regression protection for 1–10.

**Verification commands:**

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

**Parallel safety:** The markup hooks, stylesheet rules, and regression tests
form one coupled visual slice and must use one writer. Under execution mode A,
that writer is followed sequentially by a UI/integrity review and final
verification; no concurrent product writer is useful or authorized.

**Completion note (2026-08-31):** The screenshot-driven page hooks, responsive
layout, Overview field measures, Super Admin control contrast, and explicit
quick-add labels were implemented. Review identified and resolved a production
CSS-specificity issue and the visible “Add prioritie” copy defect, then found no
remaining source-level issue. Final verification passed 1,261/1,261 frontend
tests, typecheck, production build, and repository hygiene checks. Signed-in
browser QA remained unavailable and is recorded as the only unrun check.

## Ownership and parallel-execution boundaries

- The primary integrator owns the approved spec, this plan, product-contract
  interpretation, `KnowledgeItemWorkspacePage.tsx`, shared integration, and final
  reconciliation.
- After T1 settles the test contract, T2 (navigation) and T3 (editor field
  extraction) may run in parallel because their product-source paths do not
  overlap. Each writer must preserve concurrent edits and may not edit the
  other's owned files.
- T4 is not parallel-safe with T2 or T3 and starts only after both are integrated.
- Documentation reconciliation can be prepared alongside late T4 work only if
  its owner edits documentation exclusively; final wording waits for the
  integrated behavior.
- Integrity review and final verification are sequential and begin only after all
  writers finish.
- T6 is intentionally a single-writer follow-up because its stylesheet rule and
  regression test form one atomic fix; only read-only review and verification
  follow it.
- T7 is also single-writer because its page hooks and CSS selectors must evolve
  together. Review and verification begin only after that writer finishes.
- No backend, OCR, migration, deployment, commit, push, seed, or production
  mutation task is authorized.

## Acceptance-criteria traceability

| Criterion | Tasks | Primary evidence |
| --- | --- | --- |
| AC1: seven first-level sections | T1, T2, T4 | Rendered tablist and selector tests |
| AC2: old first-level tabs absent | T1, T2 | Desktop/mobile absence assertions |
| AC3: Overview retains non-UOM fields | T1, T3, T4 | Overview editor and payload preservation tests |
| AC4: Mode block order and features | T1, T3, T4 | Heading order, quick-add, and preview tests |
| AC5: existing backend keys/versions | T1, T4 | API mock assertions and integrated diff review |
| AC6: no silent dirty-data loss | T1, T4 | Ordered save, partial failure, conflict, guard tests |
| AC7: read-only/archive behavior | T1, T3, T4 | Read-only rendered interaction tests |
| AC8: accessible responsive navigation | T1, T2, T4, T5 | Keyboard/mobile tests and width-state QA |
| AC9: complete verification reporting | T5 | Command logs, QA artifacts, and final hygiene output |
| AC10: Mode block toolbars remain contained | T6 | Mode-scoped stylesheet regression and responsive verification |
| AC11: coherent wide-screen hierarchy | T7 | Header/tab/form source and rendered layout assertions |
| AC12: bounded usable Overview controls | T7 | Overview hook and field-measure regressions |
| AC13: perceptible control states | T7 | Scoped contrast and preserved-state assertions |
| AC14: responsive/no contract regression | T7 | Width matrix, screen interactions, and diff review |
| AC15: complete corrective verification | T7 | Focused/full commands and final hygiene report |

## Completion and handoff

The original consolidation through AC9 and T6/AC10 containment correction are
complete. The screenshot-driven correction is complete only when T7 and
AC11–AC15 have traceable evidence. Overall implementation
is complete only when every acceptance criterion has traceable
evidence, confirmed integrity findings are resolved, final verification runs on
the integrated worktree, and the handoff reports affected files, exact checks,
unrun checks, external actions not performed, and remaining risks.
