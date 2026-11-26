# Designer assignment reminder chip: task plan

Date: 2026-11-25
Status: Implemented and verified locally in Mode A on 2026-11-25.

Specification: [Designer assignment reminder chip and popup](../specs/2026-11-25-designer-assignment-reminder-chip-design.md), approved by the user on 2026-11-25.

## Outcome and boundaries

Give Designers one gradient **Assignment requests (N)** chip in the shared workspace header. Clicking it opens the existing safe project previews with **Accept assignment** and **Decline** actions in the shared Dialog. Replace the current inline inbox; keep the popup available across Designer routes.

This is a frontend-only change. Preserve the existing API, permissions, request versions, retry keys, first-acceptance behavior, cache invalidation, and downstream design workflow. No dependencies, backend changes, database writes, deployment, or customer communication are required.

## Current evidence

- `DesignerAssignmentInbox.tsx` already owns the permission-gated, actor-scoped pending-request query, 60-second polling, decisions, and pagination. Extend it rather than duplicating its data or mutation logic.
- `DesignerDesignPlanTasksPage.tsx` currently mounts the inbox in three mutually exclusive render branches. Remove those mounts when introducing the shared header entry.
- `AppShell.tsx` supplies role-specific controls to `WorkspaceTopbar.tsx`; the header already measures its height and its action area can wrap.
- `Dialog.tsx` supports keyboard containment, busy state, initial/return/fallback focus refs, and accessible labelling. Reuse it without redesigning the shared dialog.
- The repository is dirty from prior work, including the inbox, assignment styles, design-plan page, and QA fixtures. Preserve those changes and capture a fresh task baseline before implementation.

## Ownership and dependencies

In Mode A, the two implementation slices below can run in parallel after task 1. In Mode B, the primary agent performs them sequentially. Only one parent phase is in progress at a time: preparation, implementation, review, then verification.

| Task | Owner and affected paths | Depends on | Acceptance criteria |
| --- | --- | --- | --- |
| 1. Capture baseline and settle integration | Primary: dirty-path inventory, per-target snapshots/diffs, existing tests and optional focus-ref prop between reminder and shell | Approved plan and execution choice | AC1–AC7 prerequisites |
| 2. Implement reminder and popup | Frontend implementer: `frontend/src/features/designer/DesignerAssignmentInbox.tsx`, its test, and reminder-specific rules in `designerHandoff.css` | 1 | AC1–AC5, popup portion of AC6 |
| 3. Integrate the shared header | Primary: `AppShell.tsx`, `WorkspaceTopbar.tsx` if needed, `common-shell.css`, `DesignerDesignPlanTasksPage.tsx`, their focused tests; minimal `AccountMenu.tsx` ref plumbing only if needed for stable focus | 1; agreed reminder interface | AC1, AC5, AC6 |
| 4. Review integrated behavior | Integrity reviewer in Mode A; primary in Mode B. Read-only review of completed task diff | 2 and 3 | AC1–AC6 |
| 5. Verify and hand off | Verification runner in Mode A; primary in Mode B. Primary owns synthetic browser fixtures and final reconciliation | 4 and any resulting fixes | AC1–AC7 |

Every delegated writer gets explicit file ownership and the instruction to preserve other contributors' edits. Review and final verification run after both writers finish. The primary owns this plan, the specification, shared integration decisions, and any QA fixture edits; no concurrent edits to the same file.

## Implementation details

### Task 1: preparation

- Record the initial dirty paths and preserve the relevant files, including untracked files, in an ignored temporary baseline. Inspect prior changes before assigning a dirty target.
- Confirm the shared reminder mounts only once and agrees with the shell on a stable focus fallback when its trigger disappears. Prefer the existing Account control; add only the ref plumbing needed to use it.
- Run the existing inbox and shell tests as the focused baseline; distinguish pre-existing failures from regressions.

### Task 2: reminder and popup

- Derive the chip count from `pagination.total`. Preserve permission gating, actor/review-session query scope, and polling. Reset popup/page/mutation presentation on identity changes without displaying another actor's cached data.
- Hide the chip for a confirmed empty inbox; present recoverable fetch errors without a misleading zero count. Hide denied previews. Keep pending, refreshing, empty, error, and permission states distinct.
- Add the restrained dark-olive-to-deep-teal gradient, contrasting text, visible focus, and minimum 44px target. No animation, decorative icon, or fabricated urgency.
- Open the shared Dialog on activation and refetch on open. Keep the existing safe preview fields and backend blockers. Do not fetch full project details for a pending request.
- Preserve versioned decisions, retry idempotency, duplicate-click protection, privacy-safe conflicts, and `refreshDesignerAssignment`. Disable actions while data is stale/erroring, refreshing, or a decision is pending.
- Show accessible outcome feedback; keep the popup open when the final request disappears. Recover an emptied later page so remaining requests are reachable.
- Test click/keyboard opening, total count versus page length, acceptance/decline, retries, external closure, last-page recovery, temporary errors, permission denial, and asymmetric identities. Verify safe focus restoration and close behavior.

### Task 3: shared header

- Mount the reminder once through the existing workspace action area and remove the inline inbox import/mounts from all design-plan page branches.
- Wire a stable focus fallback without making the reminder depend on unrelated notification logic.
- Keep navigation, notification, and account controls accessible at narrow widths, including the compact messaging header. Scope any CSS changes to the needed layout and reminder.
- Extend shell integration coverage for visibility across Designer routes, a single mounted inbox, other-role exclusion, and unchanged header controls. Update design-plan tests only where the intentional removal changes their expectations.

### Task 4: integrated review

- Inspect only the new task's incremental diff against its baseline. Check no unrelated changes were removed.
- Trace role/identity isolation, stale and denied previews, lost-response retries, action gating, invalidation, pagination recovery, and focus behavior.
- Resolve confirmed findings before final verification. Backend acceptance and membership remain authoritative; no contract change is planned.

### Task 5: verification

Run from `frontend/`:

```sh
npm test -- src/features/designer/DesignerAssignmentInbox.test.tsx src/components/layout/AppShell.test.tsx src/components/ui/Dialog.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/features/designer/DesignerDesignPlanTasksPage.furniture.test.tsx src/features/designer/DesignerDashboard.test.tsx
npm run typecheck
npm run build
```

- Run additional focused AccountMenu or fixture tests only if those paths change or integration findings require them.
- Use synthetic pending requests in the existing local QA fixture, extending `enterpriseDesignerAssignmentsData.ts` and its transport integration only if needed. Do not send or decide real assignment requests for UI verification.
- Inspect the real shared shell at desktop (1440px), tablet (1024px), and mobile (390px and a narrow 360px check). Verify chip placement, no horizontal overflow, readable wrapping, popup scrolling, keyboard actions, focus return with and without a remaining chip, and notification/account access. Include the compact messaging header.
- Check popup accessibility, browser console/network errors, successful and failed decisions, zero/one/multiple requests, and an external closure while open. Save synthetic screenshots/logs only in an ignored temporary directory and stop only QA processes started for this task.
- Finish with `git diff --check`, `git status --short`, and baseline comparison. Record exact passing/failing checks and any limitations here. No lint command exists; backend suites and migrations are unnecessary unless the scope changes.

## Completion and rollback

Complete only when the approved acceptance criteria are verified. Hand off a concise description, principal affected files, exact check results, temporary artifact paths, and any remaining limitations. No deployment or production mutation is included.

If a local rollback is needed, restore only this task's incremental frontend edits from its baseline. Never reset entire dirty files to Git HEAD or undo the prior assignment work.

## Execution record

- Specification approved.
- Task plan approved; user selected Mode A.
- Preparation complete: fresh baseline at `/private/tmp/lisno-designer-reminder-20261125`; existing inbox and shell tests passed (19 tests, 2 files).
- Implementation complete: reminder/dialog slice, shared shell placement and Account focus fallback, inline inbox removal, and isolated synthetic inbox fixtures.
- Independent integrity review found no blocking defect.
- Final verification passed: 130 scoped tests, frontend typecheck/build, responsive browser interactions, and popup accessibility.


## Final verification evidence

- Baseline inbox/shell tests: 19 passed before edits.
- Final focused command listed above, plus `src/components/layout/AccountMenu.test.tsx`: **127 passed across 7 files**, exit 0.
- `npm test -- src/test/fixtures/enterpriseTransport.test.tsx -t 'synthetic Designer|multi-Designer QA'`: **3 passed**, 73 intentionally filtered out, exit 0. Covers complete synthetic accept/decline flow and Account focus restoration, default empty/role isolation, and prior multi-Designer Admin fixture compatibility.
- `npm run typecheck`: exit 0. `npm run build`: exit 0; existing large-chunk warning remains (main JavaScript approximately 3.52 MB).
- `git diff --check`: passed. Incremental baseline comparison confirms only the task's intended paths changed; no baseline files deleted and prior unrelated work preserved.
- Independent integrity review: no blocking findings. Existing backend APIs, authorization, request-version/idempotency handling, and transactions are reused.
- Browser checks: 1440, 1024, 390, and 360px Designer header/popup; no horizontal overflow and no popup axe violations. Compact messaging header checked at 1024, 390, and 360px. Chip remains a 44px target; mobile header uses two rows.
- Browser keyboard/interaction checks: Enter/Space open, accept and decline, updated counts, empty popup, focus to remaining chip or Account when empty, and usable Account/Notifications controls. Temporary refresh errors disable stale actions; retry recovers; externally closed requests remove actions and show a privacy-safe notice. Last-page recovery after declining request 21 and failed-decision conflict refresh also passed. No unexpected API requests or application render errors. Axe emits a preload-assets warning in the synthetic intercepted network environment; scans complete with zero violations.
- Synthetic screenshots, baseline, and verification logs: `/private/tmp/lisno-designer-reminder-20261125/`. Build output: ignored `frontend/dist/`. QA browser/server are stopped after verification; the user's normal development processes are preserved.
- Full unrelated suites, backend suites, and lint were not run (no repository lint script). No dependencies, migration, production action, real assignment decision, commit, push, or deployment performed.
