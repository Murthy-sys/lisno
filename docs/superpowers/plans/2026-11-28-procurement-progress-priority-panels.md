# Procurement progress priority panels: task plan

Date: 2026-11-28 (Asia/Kolkata)
Status: Specification and task plan approved by the user; Mode A selected. Implementation and scoped verification completed on 2026-11-28.

Approved specification: [P1, P2 and P3 expansion panels](../specs/2026-11-28-procurement-progress-priority-panels-design.md).

## Intended result

Show P1, P2 and P3 as independent expansion panels in the existing Progress & Inspections tab. P1 starts open. Keep the three headers visible even when a priority has no items, and show appointed-item previews before setup or an active review. Put the large setup/policy form behind an explicit disclosure.

Keep the existing server-controlled ordering: record all earlier-priority observations before updating the next priority; work need not be complete. Preserve review snapshots, drafts, deep links, corrections, permissions and project-wide inspections. No backend, API, schema, financial or native-mobile change is planned.

## Ownership and preservation

- Primary agent owns interpretation, the approved contract, documents, integration and browser QA.
- One frontend implementer owns `ProgressPanel.tsx`, any narrowly extracted priority-panel component, `lifecycle.css`, relevant `LifecycleShared.tsx` focus integration if needed, `LifecycleWorkspace.test.tsx`, a focused `ProgressPanel.test.tsx`, and necessary lifecycle fixture additions. All are under `frontend/src/features/procurement/lifecycle/`. Avoid splitting these tightly coupled source/style/test edits between writers.
- Backend contracts/services/domain are read-only reference material. They already provide membership, priorities, check eligibility, blockers and actions.
- The existing lifecycle files are untracked prior work. Inspect and preserve copies under `/tmp/lisno-procurement-priority-panels/files/`, the initial status and relevant diff before writing. Refresh the baseline if another task has changed the targets. Never replace files wholesale from Git or discard earlier work.
- In Mode A, independent read-only checks of sequencing and deep-link behavior may run in parallel. The frontend writer can implement while the primary prepares an isolated browser fixture on separate temporary paths. After the writer finishes, use integrity review, resolve findings, then final verification. In Mode B, perform the same steps inline. No agents start before the mode choice.

## Dependency-ordered tasks

T1–T4 are complete. The frontend implementation, independent integrity review, integrated verification, and isolated browser QA passed.

### T1. Confirm existing states and capture the focused baseline

Owner: primary agent; bounded read-only assistance only in Mode A. Depends on plan approval and execution-mode selection. Acceptance: AC1–AC6.

1. Compare target files with the captured baseline and record current dirty/untracked ownership.
2. Confirm the current review, projected unsaved review, setup-required, no-items, source-unavailable and read-only states in `ProgressPanel`, `ReadState` and the existing DTOs.
3. Trace `?entity=` targeting and the outer tab's draft-preservation behavior. Determine the narrowest way to reveal a priority section before scrolling/focusing its item, without affecting other lifecycle panels.
4. Run the existing lifecycle rendered suite and ordered-progress domain suite as baseline evidence. No development backend startup is needed.

### T2. Implement the priority panels and setup disclosure

Owner: frontend implementer, or primary in Mode B. Depends on T1. Acceptance: AC1–AC4, AC6.

1. Extend the existing priority grouping with semantic expansion controls in fixed P1/P2/P3 order. Prefer native `details`/`summary`, with P1 initially open, independently toggled sections, visible keyboard focus and responsive header wrapping.
2. For an active round, render the existing member snapshots, item forms and check totals inside their panels. Derive header descriptions from actual round/check/blocker data and distinguish recorded checks from work completion. Do not manufacture an edit capability from an expanded section.
3. Preserve explicit empty priority groups. Render a separate unresolved-priority section only when required, retaining its existing Configuration guidance and disabled updates.
4. For setup-required/no-active-review states, reuse available `summary.source.items` as clearly labelled read-only previews. Do not fabricate round/check records or totals. Preserve explicit loading, error and unavailable-source states.
5. Replace the automatically expanded setup form with a compact notice and permitted disclosure action. Keep the existing setup, policy and open-round mutations explicit and unchanged. Preserve setup-form drafts while toggling its disclosure.
6. Keep review submission, history and project-wide inspections after the item groups. Reuse established CSS tokens; no new dependencies, decorative icons or animation.

### T3. Integrate state retention, deep links and regressions

Owner: same frontend owner as T2. Depends on T2. Acceptance: AC3–AC6.

1. Keep item edit state mounted through panel collapse/reopen and other priority toggles. Preserve disclosure state through ordinary data refreshes; reset appropriately for a new project or review without carrying drafts between them.
2. Reveal a valid targeted item's containing panel before existing item focus/scroll behavior. Preserve unrelated URL parameters and allow users to collapse a panel after navigation without continuous forced reopening.
3. Keep current-round grouping pinned to its member snapshots during source changes; preserve comparison/reconciliation UI and stale-write protection. Preserve paused/submitted/closed restrictions and read-only roles. A revoked response must remove protected content even if it was previously expanded.
4. Add focused rendered regressions in `ProgressPanel.test.tsx`; adapt existing lifecycle tests only where the new disclosure requires expanding a group before interacting with it. Use unequal group sizes and multiple P1 items so the all-earlier-items rule cannot pass accidentally.

Required cases:

- Three ordered headers, default-open P1, independent toggles and visible empty groups.
- Setup/no-round preview with compact disclosure; browsing performs no mutation and cannot record checks.
- P2/P3 stay non-editable until the backend returns eligibility, including after a not-started or blocked P1 observation; no requirement for 100% physical completion.
- Correct checked counts, empty P1 with eligible P2, and unresolved-priority items.
- Draft retention across collapsing, other-group toggles and failed/conflicted writes; ordinary refresh preserves chosen expansion state.
- Deep-linked P2/P3 items become visible and focused; project/round changes do not inherit another draft.
- Source changes, read-only/paused/closed states, unavailable/loading/error data and revoked access.
- Keyboard control, accessible names and existing inspection/setup availability.

### T4. Review and verify the integrated result

Owner: primary agent, with integrity reviewer then verification runner in Mode A. Depends on T2–T3 and completion of all writers. Acceptance: AC1–AC6.

1. Inspect the task-specific diff against the baseline. Check that no priority enforcement, mutation contract, financial history or unrelated prior work changed.
2. Review disclosure state, stable IDs, draft lifetime, source snapshots, disabled actions and focus timing. Resolve confirmed findings before final verification.
3. Run the commands below on the integrated files. Broaden only if a new failure or changed shared helper warrants it; no backend replica-set run is expected for this frontend-only change.
4. Render actual components with synthetic API data at 390, 768 and 1440 pixels. Exercise setup preview, active P1 checking, locked P2/P3, deep links, keyboard toggles and a retained draft. Check overflow and console errors. Keep the development backend stopped and stop any disposable frontend/browser fixture after QA.
5. Record exact checks/results, limitations and artifact paths in this plan. Report the completed behavior and remaining risks. No stage/commit/push/deploy, dependency/lockfile edit, seed, migration or production write.

## Verification commands

From `frontend/`, after adding the focused suite:

```sh
npm test -- src/features/procurement/lifecycle/ProgressPanel.test.tsx src/features/procurement/lifecycle/LifecycleWorkspace.test.tsx
npm run typecheck
npm run build
```

From `backend/`, verify the unchanged ordering rule:

```sh
npm test -- tests/procurement-progress.test.ts
```

From the repository root: `git diff --check` and `git status --short`. Because target files are already untracked, also compare file contents with the captured copies and inspect new files directly; a tracked diff alone is insufficient. No repository lint script exists.

## Acceptance mapping

| Criterion | Verification |
| --- | --- |
| AC1 | Rendered header/order/default-open/empty-group tests and width checks. |
| AC2 | Setup/no-round preview and zero-write browsing tests; explicit setup disclosure interaction. |
| AC3 | Unequal multi-item priority fixtures, server eligibility responses, existing backend ordering tests. |
| AC4 | Record/correct forms, delay notes, retained drafts, stale/conflict responses and existing history checks. |
| AC5 | Targeted-item focus, source reconciliation, unresolved priority, permissions, failures and revoked-access tests. |
| AC6 | Keyboard/accessibility checks and actual-component browser QA; existing project-level inspection regression. |

## Progress

- Specification approved by the user's `Approved` reply on 2026-11-28.
- Task plan approved; execution mode A selected by the user.
- Refreshed baseline: `/tmp/lisno-procurement-priority-panels/execution-baseline/` contains current dirty paths and source/test copies, including the untracked lifecycle files.
- `/root/priority_panels_ui` owns the frontend implementation and focused regressions; `/root/priority_panels_audit` performs a read-only focus/state/gating audit. The primary owns documents and isolated browser QA.
- Final integrity review found no confirmed defects. Consolidated verification and actual-component browser QA passed; results follow below.
- T1 audit complete: active groups must retain round snapshots; version-zero projected rounds stay read-only despite projected capabilities; forms remain mounted and use project/round identity rather than version keys. Target navigation must reveal disclosure ancestors before focusing without stealing focus from retained hidden tabs. Ordinary failed refreshes retain drafts, while denied responses remove protected content.
- Unchanged backend ordering baseline passed: `cd backend && npm test -- tests/procurement-progress.test.ts` (4 tests). Log: `/tmp/lisno-procurement-priority-panels/backend-baseline.log`.
- Disposable browser fixture prepared under `/tmp/lisno-procurement-priority-panels/browser/` using actual components and synthetic API data. No backend is required. The pre-existing local development launcher was gracefully stopped under the approved stopped-backend constraint; port 3000 has no listener.

## Implemented result and affected files

- `frontend/src/features/procurement/lifecycle/ProgressPriorityPanels.tsx` adds independent native P1/P2/P3 disclosures, stable defaults, counts, explicit empty/unavailable states, and an unresolved-priority section when needed.
- `ProgressPanel.tsx` integrates snapshot-based current-round groups and read-only appointed-item previews. Setup/policy is collapsed initially and retains its draft. Project/actor/audience and round changes reset local edit state; ordinary refresh preserves it. Existing server eligibility and mutation payloads remain authoritative.
- `LifecycleShared.tsx` reveals disclosure ancestors before target focus, avoids hidden retained tabs, and does not reopen panels on ordinary refresh.
- `lifecycle.css` supplies responsive square-edged headers and content using existing tokens.
- `ProgressPanel.test.tsx` and `LifecycleWorkspace.test.tsx` cover the new interactions and preserve existing lifecycle regressions.

The execution-baseline comparison confirms exactly these six source/test files changed. No backend/API/schema, native-mobile, dependency, lockfile, financial, or persistence changes were made for this task. Unrelated dirty work was preserved. Task-specific diff: `/tmp/lisno-procurement-priority-panels/task-diff.patch`.

## Final verification evidence

All checks ran on the integrated frozen source. Exact commands, exit codes, logs, hashes, and warnings: `/tmp/lisno-procurement-priority-panels/final-verification.md`.

| Check | Result |
| --- | --- |
| `cd frontend && npm test -- src/features/procurement/lifecycle/ProgressPanel.test.tsx src/features/procurement/lifecycle/LifecycleWorkspace.test.tsx` | 26/26 passed. |
| `cd frontend && npm run typecheck` | Passed. |
| `cd frontend && npm run build` | Passed; existing Vite chunk-size warning only. |
| `cd backend && npm test -- tests/procurement-progress.test.ts` | 4/4 passed; unchanged ordering rule. |
| `git diff --check` and `git status --short` | Diff check passed; 297 pre-existing dirty-path entries unchanged during final verification. All six target hashes unchanged. |
| Independent integrity review | No confirmed defects; contracts, snapshots, stale writes, access removal, state identity, and focus reviewed. |
| Browser width/state matrix | 12/12 passed: setup, active, admin read-only, empty P1 at 390/768/1440 pixels; no overflow. |
| Browser interactions | Keyboard toggles, retained check/setup drafts, two P1 observations unlocking P2 without work completion, deep-link reveal, user collapse through refresh, revoked access, project/actor draft isolation, missed/completed restrictions passed. |
| Final console/network smoke | Zero console/page errors, failed requests, or HTTP errors in setup/active views. |

Browser report and screenshots: `/tmp/lisno-procurement-priority-panels/browser/qa-report.md`. These are temporary actual-component QA artifacts using synthetic API data. The disposable browser and frontend server on port 4182 were stopped; their dependency symlink/cache were removed. The backend remains stopped on port 3000.

Acceptance criteria AC1–AC6 are covered by the focused rendered tests, domain ordering test, browser interactions, and width matrix. No full repository suite, authenticated backend end-to-end test, Safari/native-device check, or performance benchmark was run. There is no repository lint script. No commit, push, deployment, seed, migration, production write, or external action was performed.
