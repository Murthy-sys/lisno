# Specification inline Brand creation correction plan

Status: Specification draft-list workflow completed and verified in Mode A on 2026-09-19.

Specification: [Specification item/part and brand association design](../specs/2026-09-19-specification-parts-brand-association-design.md)

## Outcome

Correct the implemented Pricing editor so Brand data remains separate from reusable Vendors while Brand authoring appears entirely inside **Specifications**:

1. each row shows **Item name**, **Brand name**, and optional **Brief description**;
2. the Brand name dropdown lists **Not configured**, existing local Brands, and **Add brand**;
3. selecting **Add brand** opens a compact form, creates one stable local Brand, selects it for the initiating item, and refreshes every Specification dropdown;
4. the separate **Brands** section is removed;
5. the existing `payload.brands` and `specifications[].brandId` contract, validation, conflict handling, context projection, and Vendor separation remain intact.

This is an incremental correction to the current uncommitted implementation. No migration, dependency, seed, commit, push, deployment, or production write belongs to this plan.

## Compact single-row layout correction

### Task A — Reshape the Specification row

**Owner:** frontend implementation. **Dependencies:** approved revised specification and execution mode. **Parallel:** no; the component markup and CSS form one bounded change.

1. Keep the existing Item name, Brand name, Brief description, and delete behavior unchanged.
2. At desktop and suitable tablet widths, render the three fields in one row using three equal four-column tracks, followed by a narrow delete-action track.
3. Reduce the initial Brief description height so it aligns with the text and select controls while retaining multiline input behavior.
4. Keep validation messages associated with their controls without changing the width of adjacent fields.
5. Preserve the current stacked mobile layout at 390 px and 320 px with no horizontal overflow.

**Acceptance:** the three controls occupy one balanced desktop row, the delete icon is aligned at the row end, and no data, Brand, validation, or read-only behavior changes.

### Task B — Focused verification

**Owner:** final verifier. **Dependencies:** task A. **Parallel:** no.

1. Update focused component assertions for the layout class or structure where useful.
2. Run the Specification builder and section integration tests, frontend typecheck, and frontend build.
3. Render the populated row at desktop, suitable tablet width, 390 px, and 320 px; verify equal desktop tracks, compact Brief description height, aligned delete action, stacked mobile fields, and no overflow.
4. Run `git diff --check` and inspect the final scoped diff.

**Acceptance:** automated checks pass and rendered evidence matches the approved responsive layout.

## Specification draft-list workflow correction

### Task C — Convert Specifications to a summary workspace

**Owner:** frontend Specification workspace. **Dependencies:** approved revised specification and execution mode. **Parallel:** may proceed with Task E test preparation after the component contract is fixed.

1. Replace permanently expanded Specification inputs with a compact accessible summary table/list containing Item name, resolved Brand name, Brief description, status, and actions.
2. Reuse the established contextual `ContextPanel` interaction used by Quality Parameter and Recommendation & Exclusions.
3. Make Add Specification append one stable draft row and open its editor. Make Edit/View open the selected stable-ID row.
4. Keep Item name, Brand name, and Brief description as three equal editor fields on wide screens and stacked fields on narrow screens.
5. Preserve inline Add brand/Edit selected brand, 200-Brand handling, stable IDs, hidden fields, protected removal, focus return, and read-only behavior.
6. Use Done only to close the editor; do not add a per-row persistence request or a misleading row-level Save action.

**Expected paths:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledge-configuration-ui.css`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx`

**Acceptance:** the default surface is a compact list, Add/Edit/View uses the contextual editor, and all edits remain in the existing draft callback.

### Task D — Connect saved baseline and Save Mode validation

**Owner:** frontend Mode integration. **Dependencies:** Task C component contract. **Parallel:** no shared-file work with Task C.

1. Pass the saved Pricing baseline Specifications and Brands into the workspace so each stable-ID row can show Saved or Unsaved without manufacturing backend state.
2. Pass the existing Pricing validation attempt into the workspace.
3. On failed Save Mode validation, open the first invalid stable-ID row and focus its exact invalid control; retain the draft and make no request.
4. After successful Save Mode, use the refreshed Pricing envelope as the new baseline so row statuses become Saved.
5. Preserve one Save Mode action, current CAS/aggregate versions, atomic Specifications-plus-Brands payload, pending changes, conflict rebase, unsaved guard, and discard behavior.

**Expected paths:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- focused Mode/save and section integration tests

**Acceptance:** Done sends no request; Save Mode is the only persistence path; invalid Save Mode opens/focuses the correct row; successful save updates status from Unsaved to Saved.

### Task E — Responsive and interaction verification

**Owner:** primary integration and final verifier. **Dependencies:** Tasks C and D. **Parallel:** test preparation can begin after the shared contract is stable; final verification is sequential.

1. Cover Add → edit → Done → Unsaved, Edit existing, View read-only, protected Remove, Add/Edit Brand, invalid Save Mode focus, successful Save Mode status refresh, discard, and conflict recovery.
2. Verify keyboard operation, accessible table/action names, drawer focus trap/return, validation announcements, and no hidden raw Brand IDs.
3. Render desktop, suitable tablet, 390 px, and 320 px states for empty, populated, editing, validation error, read-only, and saving where material.
4. Run focused frontend tests, frontend typecheck, production build, `git diff --check`, and repository status review.

**Acceptance:** all approved workflow, accessibility, responsive, and Save Mode criteria have direct verification evidence; no backend, Vendor, finance, migration, dependency, or lockfile changes are introduced.

## Baseline and invariants

- The current worktree already contains the approved stable-ID Brand association contract and its backend/frontend tests. Preserve those changes.
- `payload.brands` remains the local Pricing Brand catalog. Reusable `vendors` remain supplier identities used by Budgeting and procurement.
- Brand names are presentation values. `brandId` remains the only association key.
- Existing Brands must remain selectable after the visible Brand-management block is removed.
- Adding a Brand and associating it with the initiating Specification must update one Pricing draft atomically so one callback cannot overwrite the other.
- Existing legacy typed Specification fields, stable Specification IDs, quantity-slab links, immutable price lineage, CAS versions, audit behavior, pending changes, and conflict reconciliation remain unchanged.
- Preserve unrelated dirty work. Do not stage, commit, reset, reformat, or modify unrelated paths.

## Ownership boundaries

### Frontend interaction owner

Owns the Specification-row Brand dropdown, explicit Add-brand option, compact add dialog/form, focus behavior, removal of the standalone Brands presentation, responsive styling, and component tests.

Expected paths:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledge-configuration-ui.css`
- focused component and integration tests

This owner must not change reusable Vendor masters, Budgeting, procurement, or backend Brand identity rules.

### Frontend state/integrity owner

Owns the atomic Specification-plus-Brand draft update, pending/conflict projection compatibility, 200-Brand limit behavior, no-write cancellation, and focused state tests.

Expected paths:

- `frontend/src/features/ai-estimator-knowledge/knowledgeSpecificationConfiguration.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeModePendingChanges.ts` only if visible wording changes require it
- related pure and integration tests

This owner must coordinate any shared component signature with the primary integrator before editing overlapping files.

### Primary integration owner

Owns product interpretation, shared component signatures, integration of parallel work, live browser QA, final diff review, and reconciliation with the already-implemented backend contract.

No backend writer is planned because the persisted contract is unchanged. Backend changes are permitted only if verification exposes a real contract defect.

## Dependency-ordered tasks

### Task 0 — Capture the correction baseline

**Owner:** primary. **Dependencies:** approved plan and execution mode. **Parallel:** no.

1. Capture `git status --short`, relevant diffs, and current focused test results.
2. Confirm all existing Brand values are supplied from `payload.brands`, not Vendor masters.
3. Confirm the current standalone Brand editor is only a presentation layer and can be removed without deleting stored Brand rows.
4. Freeze the row labels as **Item name**, **Brand name**, and **Brief description**.

**Acceptance:** the current dirty work is understood and every assigned path has a clear owner.

### Task 1 — Add Brand creation to the Brand name dropdown

**Owner:** frontend interaction owner. **Dependencies:** task 0. **Parallel:** may proceed with task 3 test-audit preparation after the shared callback contract is fixed.

1. Retain the native/select-based Brand control for Android, browser, keyboard, and screen-reader compatibility.
2. Add a final sentinel option labelled **Add brand** after the existing Brand choices.
3. Selecting that option opens the existing accessible Dialog pattern with a required **Brand name** input and Cancel/Add actions.
4. Cancel closes the dialog, returns focus to the initiating Brand name dropdown, preserves its previous selection, and performs no draft write.
5. Add validates trimmed, bounded, normalized-unique names and the 200-Brand limit before mutation.
6. Successful Add creates a stable Brand ID using the existing Brand-creation utility, appends the Brand once, selects it for the initiating Specification, closes the dialog, and returns focus to that dropdown.
7. Failed validation leaves the dialog open, retains the typed name, focuses the invalid control, and does not create or associate a Brand.
8. When a configured Brand is selected, expose **Edit selected brand** in the same dropdown. Editing preserves its stable ID and hidden fields, updates every associated row, and provides a repair path for a concurrent duplicate-name conflict.

**Acceptance:** an author can create Century Green from Plywood's Brand name dropdown and immediately select the same Brand from every other row.

### Task 2 — Remove the standalone Brands block and update Pricing state atomically

**Owner:** primary integration owner with the frontend interaction owner. **Dependencies:** task 1 callback contract. **Parallel:** no shared-file parallelism.

1. Remove the visible standalone **Brands** heading, Add button, empty state, rows, reorder actions, and delete controls from Mode and general Pricing editors.
2. Keep `payload.brands` in the Pricing draft and save payload even though it no longer has a permanent standalone editor.
3. Replace sequential Specification and Brand callbacks with one atomic update for inline Brand creation and association.
4. Ensure ordinary Brand selection changes only `specifications[].brandId`; ordinary Specification edits continue to preserve the Brand catalog.
5. Change visible labels and validation copy from **Item / part name** to **Item name**, and from **Brand** to **Brand name**.
6. Remove obsolete standalone Brand-editor code only when no remaining consumer needs it; retain shared parsers, validators, ID creation, and label resolution.
7. Preserve pending changes and conflict review for newly added Brand rows without exposing raw Brand IDs.

**Acceptance:** the Specifications block is the only Brand-authoring surface, saved Pricing still contains both arrays, and no Vendor data is read or written.

### Task 3 — Focused regression coverage

**Owner:** frontend state/integrity owner or primary after integration. **Dependencies:** tasks 1–2 behavior contract. **Parallel:** test-case preparation may run alongside task 1; final execution follows integration.

Cover:

1. empty Brand catalog shows **Not configured** and **Add brand** in each dropdown;
2. successful Brand creation appends one stable Brand, selects it on the initiating item, and updates sibling dropdowns;
3. cancellation produces no Brand or association write and restores focus;
4. blank, duplicate, oversized, and over-limit additions remain unsaved with focused errors;
5. saved/reloaded associations still resolve by stable ID;
6. the standalone Brands region and its actions are absent;
7. Item name, Brand name, and Brief description labels are correct;
8. legacy typed rows, existing Brands, dangling-ID validation, immutable Specification deletion, quantity-slab references, pending changes, conflicts, read-only state, and Vendor isolation remain green.
9. a same-name concurrent Brand addition is retained by stable ID, blocks retry, can be renamed through **Edit selected brand**, and then saves successfully against the rebased CAS version.

**Acceptance:** focused component, state, and Mode-save tests cover every revised acceptance criterion without replacing backend enforcement.

### Task 4 — Rendered responsive and accessibility verification

**Owner:** primary. **Dependencies:** integrated tasks 1–3. **Parallel:** may run alongside backend contract regression checks.

1. Exercise empty, populated, dialog-open, invalid, cancelled, successful, read-only, and saved/reloaded states.
2. Verify 1440, 1024, 768, 390, and 320 px widths for dropdown/dialog positioning, no horizontal overflow, delete alignment, and minimum touch targets.
3. Verify keyboard selection of **Add brand**, dialog focus trap, error focus, Escape/Cancel behavior, and focus return.
4. Run Axe checks for editable, dialog-open, and read-only states.
5. Verify the four-item Wardrobe example with unequal optional Brand selections.

**Acceptance:** the corrected integrated flow is usable and accessible across the required widths with rendered evidence.

### Task 5 — Integrity review and final verification

**Owner:** integrity reviewer followed by verification runner in Mode A; primary sequentially in Mode B. **Dependencies:** all writers complete. **Parallel:** review and final verification are sequential.

Integrity review checks:

- Brands remain distinct from Vendors;
- inline creation and association are atomic and stable-ID based;
- cancel/failure paths perform no partial write;
- existing Brand arrays survive removal of the standalone editor;
- pending/conflict/context surfaces resolve names without raw IDs;
- CAS, immutable price lineage, quantity slabs, and read-only permissions remain intact.

Final checks:

```text
cd frontend && npm run typecheck
cd frontend && npm test -- <focused Specification/Mode files>
cd frontend && npm run build

cd backend && npm run typecheck
cd backend && npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
cd backend && npm run build

git diff --check
git status --short
```

Run broader suites proportionately and classify unrelated existing failures. Do not claim lint because this repository has no lint script.

**Acceptance:** every changed path and revised acceptance criterion has passing evidence; temporary QA output is removed.

## Safe parallel execution graph

```text
Task 0 baseline and callback contract
  ├── Task 1 interaction implementation
  └── Task 3 test-case preparation
          ↓
Task 2 atomic integration and standalone-block removal
          ↓
Task 3 final focused coverage
  ├── Task 4 rendered QA
  └── backend contract regression checks
          ↓
Task 5 integrity review → final verification
```

Tasks touching `KnowledgeSpecificationBuilder.tsx`, `KnowledgeModePanel.tsx`, or `KnowledgeSectionEditor.tsx` must not run concurrently. Parallel work is limited to non-overlapping tests or read-only audits until those shared files are integrated.

## Acceptance-criteria traceability

| Criterion | Tasks | Evidence |
|---|---:|---|
| AC1 labels | 1–3 | rendered labels and validation-copy tests |
| AC2 association | 1–3 | save/reload stable-ID test |
| AC3 multiple items | 3–4 | four-item Wardrobe flow |
| AC4 inline creation/no standalone block | 1–4 | dialog, sibling-dropdown, and absence checks |
| AC5 compatibility | 2–3 | legacy/no-write round trips |
| AC6 validation | 1–3 | invalid/duplicate/limit/no-partial-write tests |
| AC7 actions | 2–4 | no move actions and rendered delete alignment |
| AC8 responsive/accessibility | 1, 4 | viewport, keyboard, focus, and Axe checks |
| AC9 saved-state surfaces | 2–3 | pending/conflict/context/read-only tests |
| AC10 isolation | 2, 5 | Vendor/Budgeting/backend regression checks |

## Completion report requirements

Report the final interaction, atomic state decision, affected files, exact test/build/browser results, unrelated broader-suite failures, unrun checks, and external actions not performed.
