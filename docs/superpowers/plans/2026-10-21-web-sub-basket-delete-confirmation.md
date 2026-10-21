# Web Sub-Basket deletion confirmation task plan

Date: 2026-10-21
Status: Approved; implementation and local verification complete.
Specification: [Web Sub-Basket deletion confirmation reliability](../specs/2026-10-21-web-sub-basket-delete-confirmation-design.md), approved by the user on 2026-10-21.
Execution mode: A — parallel sub-agents, selected by the user on 2026-10-21.

## Progress

- Task 1 complete: target diffs are clean; initial dirty paths contain only this plan and the approved specification. Approved comparison, payload, validation, and preview-state contracts handed to both writers.
- Tasks 2–3 complete: separate dialog and regression writers delivered the shared dialog change and 20 additional behavioral cases.
- Task 4 complete: independent read-only integrity review found no introduced defect; primary inspected the integrated diff.
- Task 5 complete: final automated checks and rendered desktop/narrow QA passed; task-owned browser and fixture server stopped.

## Outcome and boundaries

Make whitespace-equivalent typed confirmation work in the shared web Sub-Basket deletion dialog and explain legitimate disabled states. Preserve the backend's exact-name contract and every permission, identity, impact, concurrency, and duplicate-submission safeguard.

The reported session's exact blocking predicate remains unconfirmed. Raw-string mismatch and missing field feedback are verified defects; tests must also exercise preview refresh and paused states. Do not force-enable deletion or claim that a particular invisible character caused the user's screenshot.

Only frontend dialog behavior and focused tests are in scope. No mobile, backend, schema, API, dependency, lockfile, migration, production, deployment, commit, or push changes are planned. Use synthetic records and intercepted requests for rendered QA.

## Execution and ownership

Keep one parent task in progress. Before any writer starts, record the current dirty paths and inspect the per-target diffs; preserve work outside this task. At plan creation, the only existing dirty path is the approved specification, and the investigation baseline is commit `276d22ca`. Recheck at execution time.

In Mode A, the primary agent owns the approved behavior contract, documents, integration, and final reconciliation. Delegate the following non-overlapping slices after Task 1:

- **Dialog implementer:** `frontend/src/features/ai-estimator-knowledge/KnowledgeSubBasketDialogs.tsx`. A tiny feature-local helper is allowed only if it improves clarity; coordinate its path before creating it. Do not edit shared form components or caller implementations without evidence and primary-agent coordination.
- **Regression implementer:** the relevant portions of `KnowledgeBasketManagementDialog.test.tsx`, `KnowledgeIndexPage.test.tsx`, and `KnowledgeBudgetAlterationBuilder.test.tsx` in the same feature directory. Do not edit application code. Build tests against the approved behavior and existing public dialog/API contract, coordinating accessible copy with the dialog implementer.
- **Integrity reviewer:** read-only review after both writers finish; report findings to the primary agent.
- **Verification runner:** run final checks on the integrated result after review fixes; do not change product code.

Tell every writer that other agents share the worktree, that they must preserve others' edits, and that ownership does not authorize reverting existing changes. In Mode B, the primary agent performs these responsibilities sequentially without implementation subagents.

## Dependency-ordered tasks

### 1. Establish the regression baseline and shared behavior contract

Owner: Primary agent. Depends on: task-plan approval and execution-mode selection.

- Inspect the current target diffs and the shared dialog's callers, preview query, submission lock, conflict handling, and refresh-only recovery.
- Preserve the existing 16-test basket-management baseline and identify the smallest added cases for the missing behavior.
- Set comparison to `value.trim().replace(/\s+/gu, " ")` on both names, require nonempty equality, and retain case and all non-whitespace characters.
- Set the submission contract to the exact reviewed `impact.subBasketName`, paired with that snapshot's version/token and the existing stable target IDs. Preserve inline `draftOnly: true`.
- Use field blur to expose invalid name/reason feedback, clear errors on correction, and reset interaction state appropriately when the target or reviewed impact changes. Preserve the reason during impact reconfirmation.
- Identify actual query pending, fetching, error, and paused states. Define explicit visible feedback and safe recovery without enabling deletion from a stale preview.

Completion evidence: an agreed implementation/test checklist aligned to AC1–AC5, with no expanded API or persistence scope.

### 2. Implement confirmation and eligibility feedback

Owner: Dialog implementer in Mode A; primary agent in Mode B. Depends on: Task 1.

- Add whitespace-only comparison without rewriting the input as the user types; submit the exact reviewed name only after the comparison and all guards succeed.
- Update the name hint and use existing `Field` error support for associated name and reason messages. Avoid initial untouched-field errors and per-keystroke announcements of partial input.
- Show accessible preview-refresh and paused/offline feedback, preserving loading/error retry behavior and all existing caller/vendor/conflict messages.
- Keep deletion disabled for pending, failed, paused, or refreshing impact checks, invalid reason, caller/identity/vendor blocks, busy work, and committed deletion.
- Ensure a changed target, version, or impact token invalidates prior name confirmation. Preserve the explicit reconfirmation flow, synchronous submission lock, and refresh-only recovery after a committed delete.
- Preserve existing focus handling, keyboard submission, inline restrictions, and layout styles.

Completion evidence: scoped source diff satisfying AC1–AC5 without backend or shared-component changes.

### 3. Add focused regression coverage

Owner: Regression implementer in Mode A; primary agent in Mode B. Depends on: Task 1; may proceed alongside Task 2 in Mode A. Final passing runs depend on Task 2.

- In basket-management tests, cover exact, outer-space, repeated-space, and non-breaking-space input; assert the request sends the exact preview name with unchanged IDs/version/token and trimmed reason.
- Cover wrong case, missing word separation, different name, punctuation changes, zero-width additions, blank name, and blank/whitespace-only reason. Assert no deletion and meaningful field associations after interaction; correction must recover without reopening.
- Exercise cached preview refresh, paused preview with cached data, failed check/retry, unchanged refresh recovery, and changed version/token reconfirmation. Restore mocked network/query state after each test.
- Retain or extend existing index tests for caller permission/catalog/identity loss, pending submission, duplicate form submission, and committed-delete refresh failure. Avoid duplicating coverage already established by those tests.
- Add an inline whitespace-equivalent confirmation case asserting exact preview payload and `draftOnly: true`; retain empty-group, frozen-group, permission, conflict, and refresh-only recovery cases.
- Use asymmetric target IDs/names for target-change protection. Keep tests behavioral and avoid assertions tied to incidental implementation structure.

Completion evidence: focused regression results for AC1–AC5, including positive payload assertions and negative no-request assertions.

### 4. Review and integrate

Owner: Primary agent and read-only integrity reviewer in Mode A; primary agent in Mode B. Depends on: Tasks 2 and 3.

- Review every enabling predicate against the approved safety invariants, especially paused cached previews and exact name/version/token snapshot consistency.
- Check that changing reviewed data or target cannot reuse confirmation, duplicate submission remains locked synchronously, and refresh retry never repeats deletion.
- Check field accessibility, error timing, conflicting status messages, and caller restrictions.
- Reconcile findings, make bounded corrections, and inspect the final diff for unrelated edits. If evidence requires a material scope or contract change, update the specification and follow its approval boundary before expanding implementation.

Completion evidence: resolved review findings and an integrated, bounded diff.

### 5. Verify the integrated result and hand off

Owner: Verification runner and primary agent in Mode A; primary agent in Mode B. Depends on: Task 4 and all writers being finished.

Run from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx
npm run typecheck
npm run build
```

Perform rendered interaction checks using the real dialog with synthetic API fixtures at desktop (1440 × 900) and narrow web (390 × 844) sizes. Verify keyboard access, mismatch and reason errors, correction without reopening, visible refresh/paused guidance, and unclipped feedback/actions. Intercept deletion requests; do not delete real records. Inspect console errors and fixture request failures. Automated caller tests cover the full state matrix; rendered QA verifies presentation and interaction.

Run `git diff --check` and inspect `git status --short` at repository root. No repository lint script exists. Backend tests are unnecessary while backend behavior remains unchanged; any backend expansion requires a separately approved scope.

Keep temporary fixture servers, logs, and screenshots under `/tmp/lisno-web-sub-basket-delete-2026-10-21` or existing ignored output locations. Stop task-owned servers after QA. Report exact checks, results, artifact locations, unrun checks, remaining limitations, and that no production mutation or deployment occurred.

## Acceptance trace

| Criterion | Implementation and verification |
| --- | --- |
| AC1: Whitespace reliability and exact payload | Tasks 2–3; management matrix and inline payload test |
| AC2: Incorrect-name protection and field feedback | Tasks 2–3; negative cases, associated errors, no-request assertions |
| AC3: Explain blocked states and recover | Tasks 2–3 and 5; preview-state tests, existing guard tests, rendered feedback |
| AC4: Conflict, duplicate, and refresh-only safety | Tasks 2–4; changed-snapshot, target-change, duplicate-submit, and recovery tests |
| AC5: Caller consistency and accessibility | Tasks 3 and 5; index/management/inline tests and two-viewport keyboard QA |
| AC6: Verification evidence | Tasks 4–5; review, focused tests, typecheck, build, rendered checks, hygiene |

## Approval boundary

The specification and task plan were approved separately, then the user selected Mode A. No production action, deployment, commit, or push was performed.

## Final verification record

Product changes are limited to `KnowledgeSubBasketDialogs.tsx`; regression changes are in `KnowledgeBasketManagementDialog.test.tsx` and `KnowledgeBudgetAlterationBuilder.test.tsx`. The existing index tests required no changes. The dialog compares whitespace-normalized names, submits the exact reviewed name, associates blur errors with their fields, and blocks stale/paused previews with visible feedback. Confirmation is bound to target and preview IDs, name, version, and token before submission. No dependencies were added.

Final integrated checks from `frontend/`:

| Command | Result |
| --- | --- |
| `npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx` | Passed: 211 tests, 3 files; management 35, index 50, builder 126 |
| `npm run typecheck` | Passed, no diagnostics |
| `npm run build` | Passed; Vite warns about chunks over 500 kB (main chunk 2,793.32 kB, gzip 764.39 kB) |
| Repository `git diff --check` and `git status --short` | Passed; only the three scoped code/test files and two task documents changed |

Rendered checks used the real dialog, production global and Configuration styles, a local Vite server without an API proxy, and fail-closed synthetic fetch responses. At 1440 × 900 and 390 × 844, associated errors remained readable, keyboard focus reached the actions, scrolling exposed the full content, and there was no horizontal overflow. Axe reported zero violations in tested invalid-field and paused-preview states. A whitespace-equivalent name enabled deletion without rewriting the input. Cached refresh blocked until completion; offline pause exposed retry guidance; failed preview retry recovered; changed version/token cleared confirmation while retaining reason. Keyboard Enter submitted exactly one intercepted request containing the exact preview name `sub 1`, version 5, the new impact token, and stable fixture IDs, then restored focus to the launch button. No real API mutation occurred.

QA artifacts: `/tmp/lisno-web-sub-basket-delete-2026-10-21/`, including the fixture server/entry and `.playwright-cli/` snapshots. Reviewed screenshots include `page-2026-10-21T11-10-06-185Z.png` (desktop field errors), `page-2026-10-21T11-10-46-105Z.png` (narrow offline status), `page-2026-10-21T11-11-33-453Z.png` (narrow error/actions), and `page-2026-10-21T11-11-57-952Z.png` (narrow reconfirmation and enabled action). The only browser console error was the isolated fixture's missing favicon; no application exceptions or unexpected API requests were observed. Build outputs are under `frontend/dist/` and caches under `frontend/node_modules/.tmp/`; no runtime artifacts were added to the change.

Limits: the full frontend suite was not run; the approved focused suite covers all three callers. Backend, replica-set, OCR, and migration checks were not run because those areas are unchanged. No lint script exists. The original user's exact session-specific blocker remains unconfirmed. Review also noted a pre-existing management-caller limitation: it does not forward live permission/catalog changes through `disabledReason`; index and inline callers do, and backend authorization remains authoritative. This bounded fix preserves existing caller guards and does not claim to add live permission-loss handling to the management caller.
