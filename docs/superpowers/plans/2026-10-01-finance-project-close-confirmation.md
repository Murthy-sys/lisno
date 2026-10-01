# Task plan: close a project from the finance panel

Status: Approved and implemented locally
Source of truth: [approved design](../specs/2026-10-01-finance-project-close-confirmation-design.md)
Date: 2026-10-01

## Outcome and contract

Deliver AC1–AC4 with the existing Super Admin completion API. The pictured primary finance-panel action becomes **Close** for an active Super Admin project. A no-fields confirmation modal calls `POST /admin/projects/:projectId/complete` with the current `completionAuthorityVersion` and a stable attempt idempotency key. The backend remains the sole closure authority. Finance Head retains the current cost-entry action; Super Admin has a separate secondary cost-entry control under the existing finance permission. No new backend route, schema, data migration, or finance entry is created by Close.

## Dependency-ordered tasks

| Task | Depends on | Ownership and affected areas | Acceptance and checks |
| --- | --- | --- | --- |
| C0. Baseline and API contract | Plan approval and execution mode | **Primary:** capture the dirty-path set and target file contents/diffs; verify the local completion route, role permission, finance bucket `projectStatus`, and query keys. Freeze a minimal typed completion summary/decision adapter, modal states, and 409/idempotency behavior before writers start. | AC1–AC4 traced to the existing endpoint. No completion gate or ledger behavior is bypassed. |
| C1. Close action and confirmation | C0 | **Frontend UI owner:** `frontend/src/features/finance/ProjectFinancePanel.tsx`, a focused API helper in `frontend/src/features/finance/` only if needed, and `financePanels.css` only for modal/action layout. Reuse `Dialog`. Fetch the current completion summary only for authorized Super Admin; show Close as the primary pictured action, with cost entry separate. Confirm calls the existing route. On success, show Completed and invalidate finance bucket/list, admin project detail/list, project status, completion queue, and dashboard queries. | AC1–AC3: no form fields or ledger POST from Close; Cancel sends nothing; loading/blockers/error/409/retry/completed states are clear, accessible, and responsive. Finance Head cannot see Close. |
| C2. Rendered regression tests | C0; may start beside C1 with frozen contract | **Frontend test owner:** `frontend/src/features/finance/FinancePages.test.tsx` or a new adjacent focused test file, without editing C1 files. Mock exact GET/POST completion calls and finance bucket refresh. Preserve existing Finance Head cost-entry tests. | AC1–AC4: ready confirm and one POST; Cancel; blockers; stale 409 and retry; completed state; denied/Finance Head separation; no finance-entry POST; invalidated query refresh. |
| C3. Integrated integrity and verification | C1 and C2 writers finished | **Primary:** reconcile UI/API/test contracts and final diff. In Mode A, request a bounded read-only integrity review and final verification after writers stop; in Mode B, perform those checks inline. | Focused frontend rendered tests, existing backend completion replica-set test, frontend/backend typechecks and builds as impacted, `git diff --check`, dirty-path review, and a desktop/mobile confirmation check if local browser state permits. Report any unrun check and do not claim live closure without an authorized user action. |

C1 and C2 can run in parallel after C0 because they own separate frontend files; the primary agent owns contract integration and any dirty shared-file conflict. The worktree contains unrelated uncommitted work, including the existing completion implementation. Do not revert, reformat, stage, or commit those changes. No production mutation, deployment, migration, invitation, or external message is included.

## Local verification outcome

The Super Admin finance panel now offers Close with a no-fields confirmation using the existing completion endpoint. Finance Head retains cost recording, and the Super Admin has a separate secondary cost action. Backend completion tests passed 18/18. Integrated frontend finance, Admin project, and completion tests passed 35/35. Frontend typecheck, production build, and `git diff --check` passed. A read-only integrity review found no confirmed defect. The full suites, real-browser/mobile inspection, and automated accessibility audit were not run for this bounded change. No live project was closed, and no deployment, migration, commit, or external action was performed.
