# Task plan: furniture measurements and zero-value estimate items

Status: approved and implemented; focused verification passed on 2026-10-01.

Source of truth: [approved specification](../specs/2026-10-01-furniture-two-dimensions-zero-budget-items-design.md).

## Boundaries and existing work

- The repository has many uncommitted changes from earlier tasks, including the workflow editor, workflow state service, procurement item service, OpenAPI and related tests. Before editing, inspect the current diff for each owned file; retain all pre-existing changes. Do not stage, commit, deploy or mutate project data.
- Zero value means the pinned approved line's amount converts to exactly **0 integer paise**. It is independent of estimate quantity. Do not filter the shared financial snapshot or change approved estimate records.
- Height remains valid historical evidence if recorded. New dimensional submissions omit Height; no synthetic replacement value is stored.
- One parent task progresses at a time. Final tests run only after all writers finish because they share one worktree.

## Dependency-ordered tasks

### 1. Lock the source and compatibility contract

**Owner: primary agent.** Confirm the exact approved-line amount path in memory and Mongo room context, the existing `rupeesToPaise` rule, and how pending furniture events are matched to their stored revisions. Record the final choice for an internal complete source versus the actionable projection before parallel edits. Define the backend/frontend contract: remaining item IDs retain original snapshot indexes; new dimensional input has Length and Width; stored Height is optional for historical reads; zero-only rooms are optional in a declaration even though the backend scope payload still names every approved room. Do not change source files in this task.

**Acceptance:** Both backend and frontend owners use the same approved-value predicate and room/item contract. Missing approved amount is never treated as zero. Existing pending review can still validate its original identities and proof.

### 2. Implement backend furniture eligibility and two-dimensional submissions

**Owner: backend workflow implementer.** Own `backend/src/domain/workflow-estimate-items.ts`, `backend/src/domain/design-workflow-state.ts`, `backend/src/services/design-workflow-state.service.ts`, applicable repository projection/types, workflow OpenAPI definitions and focused workflow tests. Preserve pre-existing edits in those files.

- Read the value from the pinned approved estimate source; keep source and stable line IDs. Expose positive-value actionable items to new furniture entry, with zero-only rooms remaining representable as optional scope rooms.
- Require all actionable items in new submissions, reject submitted zero-value IDs in new submissions, and accept a historical pending revision under the complete source and its original immutable submission evidence. Preserve review/return, CAS, idempotency, audit and proof behavior.
- Permit new dimensional rows with positive finite Length and Width and no Height. Stored/reviewed rows may still include validated positive Height. Point-count mode and mixed-mode rejection remain intact. Update API documentation and tests, including zero-value nonzero-quantity, positive-value zero-quantity, pending legacy approval, returned correction, zero-only rooms and stable legacy indexes.

**Acceptance:** The workflow API accepts a two-dimensional paid item and rejects an unpaid new item; earlier height-bearing and zero-value pending records remain readable/reviewable; no approved history changes.

### 3. Implement backend procurement eligibility and historical access

**Owner: backend procurement implementer.** Own `backend/src/services/project-procurement.service.ts`, any narrowly necessary `backend/src/services/procurement.service.ts` helper change, and procurement service/route tests. Do not edit backend workflow files or shared OpenAPI owned by task 2.

- Keep zero-value lines in the full approved/finance snapshot. Reject create or reassignment to one through a direct request using the same approved paise rule.
- Keep existing child items under zero-value lines readable. Include them in the project's **Items needing assignment** query so hidden zero-value parents do not hide procurement records; allow reassignment to a positive-value source under current authorization/version rules. Ensure PO and finance history continue to resolve the original source.
- Add focused tests for zero-value nonzero-quantity lines, positive-value zero-quantity lines, direct create/reassignment rejection, a historical zero-linked child, and unequal project isolation.

**Acceptance:** No new child can be attached to a ₹0.00 source; an existing child is visible with lineage and can be resolved safely; approved totals remain unchanged.

### 4. Implement the furniture panel and review UI

**Owner: frontend workflow implementer.** Own `frontend/src/features/workflow/FurnitureDimensionsEditor.tsx`, `WorkflowStageActions.tsx`, `projectWorkflowApi.ts`, `FurnitureRequirementsReview.tsx`, related furniture styles and focused component tests. Do not edit procurement files.

- Show and validate only Length, Width and UOM for new dimensional entries. Remove Height from the new request payload and error/focus targets. Preserve count entry, room reference, disclosure state, configured UOM creation, proof and the footer action.
- Show only eligible estimate items/counts in the declaration. Do not offer a zero-only room as a required measurement choice; still send a complete scope declaration with that room marked optional. Preserve existing pending/approved Height in historical Client review when present and show two-dimensional new rows correctly.
- Cover mixed positive/zero value, positive-value zero quantity, all-zero room, returned edits, hidden-field validation/focus, and desktop/mobile field layout.

**Acceptance:** The screenshot's Gypsum ₹0.00 row is absent, there is no Height field, a valid two-dimensional declaration submits, and historical review remains accurate.

### 5. Implement the Procurement estimated-items UI

**Owner: frontend procurement implementer.** Own `frontend/src/features/procurement/EstimateProcurementItems.tsx` and focused tests, plus a narrow text/empty-state change in `ProjectProcurementItems.tsx` only if needed. Do not edit workflow files.

- Filter estimated parent rows, counts, search results, empty sections and assignment choices by `estimatedAmountPaise > 0`. Keep backend-provided totals unchanged. Do not offer **Add item** under a zero-value parent.
- Make zero-linked historical children accessible through the project item/reassignment area; label their status clearly if the existing presentation is ambiguous. Preserve loading, empty, error, keyboard and responsive behavior.

**Acceptance:** The two pictured ₹0.00 Gypsum parent rows are absent; paid rows and their amounts remain correct; existing zero-linked child records are findable.

### 6. Integrate, review and verify

**Owner: primary agent**, then `integrity_reviewer` and `verification_runner` in Mode A. Reconcile backend/frontend DTOs and review any pre-existing dirty-file overlap. Inspect the integrated diff, confirm no financial snapshot or immutable record was changed, then run focused workflow/procurement tests, backend and frontend typechecks/builds, and the required replica-set tests for changed transactional Mongo paths. Render the furniture declaration and Procurement estimated-items page at desktop and mobile widths; exercise submission, room selection, historical review and keyboard focus. Run `git diff --check` and inspect `git status --short`. Report exact results and any remaining limit.

**Acceptance:** Every criterion in the specification has a corresponding passing check; existing work is preserved; no data migration, deployment, commit or production mutation occurs.

## Parallel execution boundaries

After task 1, tasks 2 and 3 can run in parallel because their backend files do not overlap. Tasks 4 and 5 can run in parallel with those backend tasks once the DTO and zero-value contract is fixed; they own separate frontend files. Backend task 2 owns shared workflow OpenAPI. The primary agent handles contract changes and integration, then starts integrity review only after writers stop, followed by final verification.
