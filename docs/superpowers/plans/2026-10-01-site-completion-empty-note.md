# Task plan: save Site Manager progress with a blank note

Source of truth: [approved specification](../specs/2026-10-01-site-completion-empty-note-design.md).

## Boundaries

- The two completion models, the existing Mongo integration test, and the panel test are untracked work already present in this worktree. Before editing, capture their current content and preserve every unrelated change. Do not stage, commit, migrate, deploy, or modify live project data.
- Keep the API contract and Site Manager screen unchanged unless a focused test exposes another defect. Preserve authorization, CAS, idempotency, assignment verification, audit, and transaction behavior.
- One parent task is in progress at a time; final verification runs after all edits finish.

## Dependency-ordered tasks

### 1. Record the baseline and contract

**Owner: primary agent.** Inspect the current target files and pre-existing work. Confirm that a blank note is accepted by both request schemas and rejected only by the Mongoose required-string validation. Identify the existing replica-set integration path for first save and submit.

**Acceptance:** The fix is confined to optional-note persistence and its focused regression checks.

### 2. Align persistence and prove the backend flow

**Owner: backend implementation agent in Mode A; primary agent in Mode B.** Own `backend/src/models/SiteCompletionState.ts`, `backend/src/models/SiteCompletionReview.ts`, and `backend/tests/project-purchase-order.replica-set.test.ts`. Make `""` a valid persisted note with a string default and the existing length limit. Add transactional coverage for a first 100% save with a blank note, a reload, and an eligible blank-note submission; check the created review and retain nonblank coverage. Keep all other model fields and the service unchanged.

**Acceptance:** First save and submission succeed with `note: ""`; saved state and review contain that exact value; existing workflow guards still apply.

### 3. Cover the screen request

**Owner: frontend implementation agent in Mode A if parallel work is useful; primary agent in Mode B.** Own `frontend/src/features/workflow/SiteCompletionPanel.test.tsx` only. Add a focused interaction asserting that entering 100 with a blank note sends `note: ""`, updates the visible saved percentage after success, and enables Client submission only when the response says it is allowed. Do not change the screen unless this test finds a separate defect.

**Acceptance:** The UI uses the existing optional-note contract and responds to the saved backend state correctly.

### 4. Integrate and verify

**Owner: primary agent.** Review the combined diff against the approved specification and preserve pre-existing untracked work. Run focused backend model/integration tests, the relevant frontend panel test, backend typecheck, and `git diff --check`. Run the replica-set test with local prerequisites; if unavailable, report that limitation rather than replacing transactional evidence with a mock. Check that length validation, nonblank notes, concurrency guards, and normal submission blockers remain covered. Run a broader build only if changed files or failures create a concrete need.

**Acceptance:** All four specification criteria have passing evidence or an explicitly reported verification limit; no unrelated behavior or external state changes.

## Safe parallel work

After task 1, tasks 2 and 3 can run concurrently because their file ownership does not overlap. Final verification waits for both. If the frontend test is already sufficient, keep that slice with the primary agent instead of spawning a second writer for ceremony.
