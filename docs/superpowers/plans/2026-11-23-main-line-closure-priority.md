# Main Line closure priority task plan

Status: The user approved the [specification](../specs/2026-11-23-main-line-closure-priority-design.md) and this task plan, then selected Mode A. Implementation and focused verification are complete. See the execution record below.

## Objective and contract

Implement the approved P1/P2/P3 radio group and explicit **Save closure priority** action in the existing **Basket closure priority** tab.

The approved specification is the source of truth. Store `closurePriority?: "P1" | "P2" | "P3"` in the current revision's Overview payload. Missing means unselected. Preserve Overview fields, draft/history rules, section and aggregate version checks, authorization, and the four-group completeness count. Closure priority alone must not make an empty Overview count as configured. No default, reset action, automatic closure behavior, dependency, migration, or deployment is included.

## Worktree baseline and ownership

At planning time, `git status --short` showed only the untracked specification for this request. `git diff --stat` was empty. Before implementation, capture the dirty-path set and inspect any newly changed target diffs; preserve unrelated work.

| Owner | Exclusive write scope |
| --- | --- |
| Primary agent | This plan and approved specification status; `shared/knowledge/knowledgeSectionPayload.ts`; any demonstrably necessary shared type changes; integration decisions and ownership coordination. |
| Backend owner | `backend/src/domain/ai-estimator-knowledge-validation.ts`, `backend/src/domain/ai-estimator-knowledge-completeness.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`; focused backend validation, domain/completeness, item-service, route, and API documentation tests. Existing item-service production code may change only if regression evidence shows the approved behavior needs it. |
| Frontend owner | `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`; a focused closure-priority panel and its tests/styles as needed; `KnowledgeConflictReview.tsx`; relevant workspace navigation, save/cache integration, payload, conflict, and screen tests within this feature directory. |
| Integrity reviewer | Read-only integrated review after all writers finish. Report findings with file evidence and acceptance-criterion references. |
| Verification runner | Integrated checks and browser QA after review fixes. No product-source edits; temporary outputs must be reported and cleaned up when no longer needed. |

No owner edits another owner's paths without an explicit handoff. Writers must be told that they share the worktree and must not revert others' changes. The primary agent resolves contract questions and assigns any additional path before edits begin.

In Mode A, backend and frontend owners are native Codex subagents. In Mode B, the primary agent performs each ownership slice and the equivalent review/verification inline, with no implementation subagents.

## Dependency-ordered tasks

### T1. Confirm the baseline and extend the shared edited-field contract

Owner: Primary agent. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC3, AC4, AC6.

- Recheck target diffs and applicable repository instructions before writing.
- Add `closurePriority` to `KnowledgeOverviewEditableField` so the existing rebase helper can update only the chosen field.
- Keep the existing generic section API and payload representation. Avoid a new route, collection, master-data source, or independent Main Line field.
- Confirm the backend/frontend boundary: uppercase P1/P2/P3 only, no implicit default, existing applicability retained, both versions submitted, current draft preferred over active.
- Share the settled contract and ownership boundaries before parallel writers begin.

### T2. Validate and persist closure priority through the existing section path

Owner: Backend owner. Dependency: T1. Acceptance: AC2, AC3, AC4, AC6.

- Add the optional field to the Overview allowlist and validate the exact enum. Reject it in other section types and reject invalid explicit values.
- Document the optional enum and missing-value semantics in the Overview OpenAPI schema.
- Exclude closure priority from Overview content detection so this setting alone does not inflate completeness. Preserve existing identity validation, activation requirements, and workspace counts.
- Use existing transactional section persistence and copying. Do not relax authorization, immutable history, audit recording, or version checks.
- Add focused regression evidence for all three values; absence and invalid values; two distinct Main Lines; unrelated-field preservation; stale section and aggregate versions; current-draft precedence; duplicate/new-draft copying; unchanged active history; and completeness with only this field set.
- Verify existing unauthorized mutation coverage for the unchanged route and extend it if needed for the new payload.

### T3. Replace the placeholder and integrate saving with the workspace

Owner: Frontend owner. Dependency: T1. Can run in parallel with T2 in Mode A. Acceptance: AC1 through AC6.

- Add a small editor using existing UI primitives and native radios. Show **Closure priority**, **P1**, **P2**, **P3**, an unselected state, and **Save closure priority**. Preserve the tab's current label.
- Read the selected revision's Overview payload. Handle loading, failed reads, missing revision, archived/history-only state, and insufficient permissions. A malformed saved value must not appear as a valid choice or be silently replaced with a default.
- Reuse the existing Overview section save contract and edited-field rebasing. Saving closure priority must preserve every unrelated Overview property and its applicability; ordinary Overview saves must preserve closure priority.
- Integrate dirty/saving status, save/discard/stay navigation, unload protection, and line/revision identity resets. Retain local changes on failure, prevent duplicate submissions, and resolve version conflicts with current-value review before retrying.
- Handle an uncertain save response without silently treating it as success or discarding it. Separate confirmed persistence from later refresh failures and reuse the established query synchronization helpers.
- Extend conflict-value presentation for closure priority. Use the actual saved Overview timestamp where save-time information is shown; do not invent a separate closure-only timestamp.
- Update placeholder-specific screen assertions. Add meaningful rendered tests for initial selection, each saved value, keyboard operation, saving/reopening, read-only states, navigation choices, failure/retry/conflict handling, no cross-line leakage, and preservation of other fields. Add shared-rebase test coverage in the existing frontend test file.
- Keep styles local and consistent, with no new icons, motion, libraries, or unrelated restyling.

### T4. Reconcile the integrated result and review integrity

Owner: Primary agent and, in Mode A, `integrity_reviewer`. Dependencies: T2 and T3 complete. Acceptance: AC1 through AC6.

- Wait for all writers, inspect their diffs and focused-test evidence, and reconcile any shared-contract mismatch.
- Review save/reload lineage by Main Line ID and revision ID, missing-value behavior, draft versus active precedence, unrelated-field rebasing, version conflict handling, permissions, and immutable history.
- Review completeness, cache updates, dirty-navigation behavior, and the distinction between rejected, unconfirmed, and confirmed-but-unrefreshed saves.
- Resolve confirmed findings through the assigned owners. Finish review fixes before final verification; keep one parent task in progress at a time.

### T5. Verify the final worktree and hand off

Owner: Primary agent and, in Mode A, `verification_runner`. Dependency: T4 and all fixes complete. Acceptance: AC1 through AC6.

- Run the focused checks below first, then the approved broader checks. Verify transactional persistence with a Mongo replica set; do not weaken transaction semantics to accommodate a test environment.
- Inspect the rendered tab at 390 and 1440 px using synthetic local test data. Check radio selection, Save, reload, keyboard focus, read-only presentation, and overflow. Inspect console and network failures.
- Use a fresh page load to confirm saved values come from the API. Use two distinct Main Lines with different choices to verify isolation. If browser QA uses mocked API data, report that limitation and retain real replica-set persistence evidence separately.
- Inspect the complete diff, run hygiene checks, and update this plan with exact results, failures, limitations, and any temporary artifact paths. Do not claim unrun checks passed.
- Hand off the implemented behavior, principal files, validation results, remaining risks, and any unperformed external actions. No staging, commit, push, seed, migration, production mutation, or deployment is authorized.

## Verification commands and acceptance mapping

Run commands from the named workspace. Test paths for newly introduced panel tests must match the final implementation.

| Check | Command or method | Criteria |
| --- | --- | --- |
| Backend focused | `cd backend && npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-domain.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts` | AC2, AC3, AC4, AC6 |
| Frontend focused | `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeClosurePriorityPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts` | AC1, AC2, AC3, AC4, AC5, AC6 |
| Backend integrated | `cd backend && npm run typecheck && npm test && npm run build` | Contract and persistence regressions |
| Frontend integrated | `cd frontend && npm run typecheck && npm test && npm run build` | Shared typing, interaction, and build regressions |
| Native compatibility | Run the existing mobile typecheck if shared type edits affect its consumers; inspect its package script before choosing the command. | Shared-contract compatibility |
| Rendered QA | 390 and 1440 px; native keyboard interaction and accessible names; successful save/reload; read-only and error presentation; console/network inspection. | AC1, AC2, AC3, AC5 |
| Repository hygiene | `git diff --check` and `git status --short`, plus review of new/untracked files. | Scope and preservation |

There is no repository lint script. Do not report lint as passed. Builds and browser tools may create ignored outputs; do not retain unnecessary artifacts or treat them as requested deliverables.

## Parallelism and execution boundary

Dependency graph: **T1 → (T2 and T3) → T4 → T5**. Only T2 and T3 can run concurrently, after the shared contract is settled, and only if the user selects Mode A. Shared files remain with the primary agent. Final review and verification run sequentially on the integrated result.

Task-plan approval advances only to the execution-choice gate. Ask the required A/B question after that approval; do not begin implementation or spawn agents before the user selects the mode.

## Execution record

- Specification: approved by the user on 23 November 2026.
- Task plan: approved.
- Execution mode: A.
- Implemented T1–T3. The existing Basket closure priority tab saves P1/P2/P3 to the selected draft’s Overview using the section and aggregate versions. Old records open unselected.
- T4 found that an external draft replacement could remount the editor. The fix pins unsaved edits to their original revision, reconciles uncertain writes there, and releases the pin after resolution. Two workspace tests cover the transition.
- Backend typecheck and build passed. The five-file backend focused command above passed 400 tests and failed five. An isolated HEAD run reproduced all five failures. Mongo replica-set checks covered persistence of each choice, line isolation, draft copying, and immutable active history.
- Frontend typecheck and build passed, with Vite’s bundle-size warning. Final focused runs passed 83 panel, conflict, cache and payload tests and seven selected workspace tests. The existing workspace suite had 16 failures on isolated HEAD. Mobile typecheck and git diff --check passed.
- Chromium checks passed at 390 and 1440 px. With a synthetic API, keyboard selection saved P2 and a fresh page load restored it. Read-only users saw disabled controls. The editor fit both widths. Database persistence was verified separately with the replica-set tests.
- The temporary browser entry files were removed and the local Vite server stopped. Build outputs are under backend/dist and frontend/dist. Verification logs are under /tmp/lisno-closure-*.log. No migration, seed, deployment, commit or push was performed.
- Full backend suite: 7,969 passed, 101 failed, 24 skipped. Full frontend suite: 7,358 passed, 110 failed. The broad frontend run overlapped the revision guard correction. A subsequent complete KnowledgeScreens run on final sources passed 113 cases and failed exactly the same 16 named cases as unmodified HEAD. Both new revision-switch cases passed in that final run. Full-suite failures outside the focused comparison were not individually baselined.
