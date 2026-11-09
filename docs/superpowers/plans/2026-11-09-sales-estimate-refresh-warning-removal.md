# Sales estimate refresh-warning removal task plan

Status: completed in approved Mode A. Implementation, integrated review, and all planned verification passed.

Source of truth: [approved specification](../specs/2026-11-09-sales-estimate-refresh-warning-removal-design.md).

## Scope and starting state

Remove only the pictured refresh-error footer warning and its associated button for Sales. Preserve submission checks, existing query-error notices, local edits, and other roles and validation messages.

The original worktree was clean. At planning time, only the specification is untracked; product files are unchanged. Recheck status and relevant diffs before implementation and preserve any intervening work.

## Dependency-ordered tasks and ownership

### 1. Adjust the Sales footer presentation

Owner: primary agent in Mode B, or one frontend implementer in Mode A.

Owned file: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`.

- Suppress the footer feedback only when the Sales role would display the specific saved-estimate/quotation-update refresh warning. Preserve higher-priority errors and explicit publication feedback.
- Derive footer rendering and button accessibility references from the same visible-feedback state so the removed warning leaves no dangling `aria-describedby` or focus target.
- Remove the associated refresh button by excluding that warning from rendering, without changing refresh controls for other conditions or roles.
- Keep submission eligibility, mutation handlers, confirmation checklist, draft preservation, and existing query-error notices unchanged.

Acceptance criteria: AC1, AC2, AC3, AC4.

### 2. Verify failed refresh and recovery with rendered interaction tests

Owner: primary agent in Mode B, or a separate test implementer in Mode A.

Owned files: `frontend/src/features/leads/LeadEstimateWorkspace.checklist.test.tsx`; modify `frontend/src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx` only if its existing Designer coverage needs a focused extension.

- Exercise saved-estimate refresh failure and quotation-revision refresh failure after a successful Sales load and local edit.
- Assert that the pictured footer warning and its button are absent before and after Submit, existing query-error feedback remains visible, edits survive, and no save/submission is sent while eligibility checks fail (AC1, AC2).
- Assert that accessible descriptions resolve to rendered elements or are absent as appropriate, and keyboard activation leaves focus on a rendered element (AC3).
- Recover the failed query and verify the existing confirmation/save/submit sequence uses the preserved edits (AC4).
- Use existing tests to verify unrelated validation and Designer refresh behavior; extend only where necessary (AC4).

Dependency: tests may be authored alongside task 1 against the approved behavior; evaluate final results only after both tasks finish.

### 3. Review and verify the integrated change

Owner: primary agent. In Mode A, a bounded read-only verification agent may run the final checks after all writers finish.

- Inspect the diff for unintended behavior changes, especially mutation eligibility, non-Sales behavior, and accessibility.
- Run from `frontend/`:
  - `npm test -- src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx`
  - `npm run typecheck`
  - `npm run build`
- Run from the repository root: `git diff --check` and `git status --short`.
- Report exact results and any unrun checks. There is no lint script. No backend or OCR changes, dependencies, migrations, commits, or deployment are part of this work.

Dependency: tasks 1 and 2 must finish first. Build outputs and other ignored verification artifacts are not deliverables.

## Execution boundaries

Keep one parent task in progress. In Mode A, source and test work may run in parallel on the distinct files listed above; agents must preserve others' edits and coordinate any shared contract question through the primary agent. Review and final verification follow integration. In Mode B, all work stays inline and runs sequentially.

The user approved the specification and task plan, then selected Mode A. The primary agent owns integration and this document; `remove_warning` owns task 1 and `warning_tests` owns task 2.

## Execution evidence

- Task 1: completed with a presentation-only filter and matching focus guard in `LeadEstimateWorkspace.tsx`; mutation eligibility and handlers are unchanged.
- Task 2: completed in `LeadEstimateWorkspace.checklist.test.tsx`. Four new rendered cases cover both query failures, draft preservation, keyboard focus, recovery/submission, explicit feedback, and Designer behavior. The existing collaboration test file is unchanged.
- Preliminary focused run: `npm test -- src/features/leads/LeadEstimateWorkspace.checklist.test.tsx -t 'omits the Sales refresh footer|preserves explicit feedback|retains the Designer refresh'` passed (4 passed, 26 skipped).
- Primary review: the filter preserves higher-priority errors and explicit messages, keeps accessibility references synchronized with rendering, and leaves submission checks untouched.
- Task 3: `verify_warning` completed the integrated checks after all writers finished:
  - `cd frontend && npm test -- src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx`: passed, 79 tests across 2 files (AC1–AC4).
  - `cd frontend && npm run typecheck`: passed.
  - `cd frontend && npm run build`: passed; Vite reported chunks over 500 kB.
  - `git diff --check`: passed.
  - `git status --short`: only the two intended frontend files and this task's spec/plan are changed or untracked.
- Ignored outputs refreshed in preexisting directories: `frontend/dist/`, `frontend/node_modules/.tmp/`, and `frontend/node_modules/.vite/vitest/`. No runtime artifacts are deliverables.
- Not run: full frontend suite or live-browser viewport checks. Rendered interaction/accessibility tests cover the approved scope. No lint script exists; backend/OCR checks are outside this frontend-only change.
- No dependencies, migrations, commits, deployment, or external actions. Underlying refresh failures can still block submission under the unchanged eligibility checks, as specified.
