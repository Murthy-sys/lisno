# Assigned Designer summary: task plan

Date: 2026-11-25
Status: Implemented and verified locally in Mode A on 2026-11-25.

Approved specification: [Show only the assigned Designer after acceptance](../specs/2026-11-25-assigned-designer-summary-design.md). User approved on 2026-11-25.

## Outcome and scope

Show only the assigned Designer in Super Admin → Project → Assignment → Designer after acceptance. Hide candidate cards, search, pagination, pending-request controls, and request buttons. Before assignment, preserve the existing multiple-request flow.

Frontend only. Reuse current assignment data and polling; no API, permission, database, dependency, migration, deployment, or real assignment changes.

## Tasks, ownership, and dependencies

| Task | Owner and paths | Dependency | Criteria |
| --- | --- | --- | --- |
| 1. Capture baseline | Primary: dirty-path inventory, snapshots/diffs of affected files, existing focused tests | Approved plan and execution choice | AC1–AC6 prerequisites |
| 2. Update panel rendering | Primary: `frontend/src/features/admin/DesignAssignmentPanel.tsx`; existing assignment stylesheet only if needed | 1 | AC1–AC5 |
| 3. Update regression coverage | Frontend implementer in Mode A, primary in Mode B: `DesignAssignmentPanel.test.tsx`; `AdminProjectDetailPage.test.tsx` only if integration expectations require changes | 1 and agreed visible contract below | AC1–AC4 |
| 4. Review and verify | Primary: integrated diff, focused checks, synthetic desktop/mobile QA, documentation | 2 and 3 | AC1–AC6 |

In Mode A, tasks 2 and 3 may run in parallel on separate files. In Mode B, perform them sequentially. Writers must preserve existing dirty work and stay within ownership boundaries. Primary owns shared decisions, fixtures if needed, and final reconciliation. Keep one parent phase in progress: preparation, implementation, then verification.

## Implementation contract

- Resolve the assigned identity independently of the current candidate page/search, using the same-project suggestions response when current and authorized. Use `project.estimate.designPlanDesigner` when suggestions are unavailable or fetching is ineligible. Do not treat an explicit successful unassigned response as a fetch failure or reuse another project's/actor's cached identity.
- Render an assigned state before the current assignment-eligibility restriction, so progressed projects can still display their Designer. An authorized project-detail assignment can be shown without management permission; do not enable the suggestions query for that viewer.
- Assigned state: semantic **Assigned Designer** label, name, and **This project is assigned to <name>.** No candidate list, search, candidate count, pagination, send/cancel buttons, replacement controls, or obsolete waiting-for-acceptance copy.
- Unassigned state: keep the existing cards, search, ranking, pending requests, version/idempotency handling, and mutation invalidation. Keep all unsafe actions disabled while data is unresolved, denied, or stale.
- Existing polling/refetch transitions to the assigned state as soon as it observes acceptance. A transient error must not revive request controls for a previously confirmed assignment. Preserve appropriate error/retry feedback.
- If acceptance removes a currently focused request/search control, keep keyboard focus at a sensible stable panel target. Do not move focus if the user is working elsewhere.

## Regression checks

- Preserve multiple sends, independent cancellation, retries, and source-version protection for unassigned projects (AC1).
- Assert all candidate/request controls disappear for an assigned project, including when the winner is absent from the selected search/page (AC2).
- Update the existing cross-session polling test to verify the complete candidate-to-summary transition (AC3).
- Replace the old assigned-project replacement-request presentation test with summary-only expectations; keep unassigned cancellation coverage (AC2).
- Cover project-detail fallback, later design stages with assignment disabled, read-only management permission, transient fetch failure, denied data, and switching between different projects/actors (AC4).
- Reuse the existing synthetic Admin assignment fixture and its external-accept event for rendered desktop/mobile checks. Send requests only inside that isolated fixture, simulate acceptance, then refetch and confirm the winner-only summary. Verify no overflow or inaccessible focus and no unexpected API calls (AC5).

## Verification commands

From `frontend/`:

```sh
npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx
npm run typecheck
npm run build
```

Run extra focused tests only if additional paths change or a failure requires investigation. Finish with `git diff --check`, `git status --short`, and an incremental comparison against the task baseline. Record exact results and any pre-existing failures. No repository lint script exists; backend/full unrelated suites are outside this localized UI change.

Keep synthetic browser screenshots/logs and baseline copies in a temporary directory; stop only QA processes started for this task. Do not modify real assignment data for verification.

## Handoff

Update the implementation record with changed paths, exact checks, browser evidence, generated artifact paths, and remaining limitations. No commit, push, deployment, migration, or customer communication is included. If rollback is needed, restore only this task's incremental edits, preserving prior uncommitted work.

## Execution record

- Specification approved.
- Task plan approved; user selected Mode A.
- Baseline captured at `/private/tmp/lisno-assigned-designer-summary-20261125`; existing focused suites passed (50 tests, 2 files).
- Panel and parallel regression-test implementation complete.
- Independent review found no blocking defects.
- Integrated verification passed as recorded below.


## Final implementation and verification

- Product change: `frontend/src/features/admin/DesignAssignmentPanel.tsx`; regression changes: `DesignAssignmentPanel.test.tsx`. No other product, stylesheet, fixture, API, or backend files changed.
- Assigned projects render only the assigned-person summary, including when the winner is absent from the searched candidate list or the project has moved beyond assignment eligibility. Request/search/pagination controls are absent.
- Existing unassigned multiple-request flow, versions, retry keys, and invalidation remain intact. The panel is keyed by project and actor/review session. Safe cached responses, including explicit null, remain authoritative during transient errors; denied suggestion data is hidden. Existing authorized project detail supplies the fallback.
- Two regressions discovered during testing were fixed: disappearing candidate focus now moves to the summary only when appropriate; an older project-detail assignment no longer reappears after a successful unassigned response followed by a transient error.
- `npm test -- src/features/admin/DesignAssignmentPanel.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx`: **61 tests passed across 2 files**, exit 0. Includes unchanged request/cancellation behavior, polling, hidden controls, fallback, permissions, explicit-null/error precedence, identity changes, and focus inside/outside the panel.
- `npm run typecheck`: exit 0. `npm run build`: exit 0. Existing large-chunk warning remains (main JavaScript approximately 3.52 MB).
- Independent read-only integrity review: no blocking findings. `git diff --check` passed. Baseline comparison found no deleted files or unrelated product changes.
- Synthetic browser flow sent two requests, accepted one from another session, and verified the winner-only summary despite a search for another candidate. Result: zero candidate cards, search fields, request buttons, or pagination; backend fixture reports the accepted person and zero competing pending requests.
- Actual browser screenshots inspected at 1440, 1024, 390, and 360px: no horizontal overflow and no axe violations. Browser focus moved to the assigned summary when the focused search control disappeared; keyboard collapse/reopen preserved the expected expanded/hidden states. No application errors or unexpected API calls. Axe emitted only preload-assets warnings in the synthetic intercepted environment.
- Evidence/baseline/screenshots/logs: `/private/tmp/lisno-assigned-designer-summary-20261125/`. Build generated ignored `frontend/dist/`. Temporary QA browser and server are stopped after verification; normal development processes remain running.
- Full unrelated suites, backend suites, and lint were not run; no repository lint script exists. No dependencies, real assignment mutations, migration, commit, push, or deployment performed. The existing backend reassignment API policy is unchanged, as specified.
