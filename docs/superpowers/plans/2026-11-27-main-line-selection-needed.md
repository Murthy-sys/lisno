# Main Line Overview: Selection needed implementation plan

Date: 2026-11-27
Status: Implemented and verified (Mode A); three unrelated backend baseline failures remain
Specification: [Approved design](../specs/2026-11-27-main-line-selection-needed-design.md)
Approval record: The user approved the specification and task plan on 2026-11-27, then selected Mode A (parallel sub-agents).

## Scope and fixed contract

Add **Selection needed?** Yes/No radios immediately after **Show this Main Line by default?** in regular and temporary Main Line Configuration Overview. Helper text: **Record whether this Main Line needs a selection.** Reuse existing controls, permissions, Save, dirty tracking, and conflict handling.

Store optional `selectionNeeded?: boolean` in the revision-owned Overview payload. Missing displays No; only boolean true displays Yes. Do not write a default on open or during unrelated edits. Explicit true and false must survive save/reload, duplication, new-draft creation, and unrelated edits in web/native/shared consumers.

This setting saves and displays metadata only. No Client selection filtering, tasks, workflow enforcement, design upload changes, pricing changes, new permissions, endpoints, dependencies, migrations, or backfills are included. Preserve active/history and approved artifacts.

## Execution and ownership

Keep one parent task in progress. Within the implementation task, backend and frontend slices may run concurrently after the shared field contract is settled.

- Mode A: use native Codex agents with the ownership below. Tell each writer that others share the worktree, to preserve existing edits, and to return cross-boundary dependencies to the primary agent. Run an `integrity_reviewer` after writers finish, resolve findings, then run a `verification_runner` on the integrated result.
- Mode B: the primary agent performs the same tasks, review, and verification sequentially without implementation subagents.
- The primary agent owns shared files, this plan, product interpretation, compatibility reconciliation, and final integration. No agent may change another owner's files without an explicit handoff.

## Dependency-ordered tasks

### T0. Capture implementation baseline

Owner: primary agent. Dependencies: plan approval and execution-mode selection.

1. Capture `git status --short`, the initial dirty-path set, and relevant target diffs in an ignored temporary location before assigning writers. Existing changes include prior execution-choice, design-upload, and Client review work; preserve them.
2. Recheck the approved source seams and available tests. The planned Overview, shared rebase, conflict-review, domain validator, and knowledge OpenAPI product targets were clean during planning. `backend/tests/api-docs.test.ts` already contains prior changes; inspect and preserve its diff before assigning it.
3. Run the focused existing backend and frontend lanes listed below to distinguish new failures from current baseline failures. Record the actual commands and results here during execution. Do not assume historical full-suite results describe the current worktree.

Completion: target ownership is explicit and relevant baseline failures are understood. Covers AC6 and preservation constraints.

### T1. Settle the shared editable-field contract

Owner: primary agent. Dependency: T0.

1. Add `selectionNeeded` to `KnowledgeOverviewEditableField` in `shared/knowledge/knowledgeSectionPayload.ts`.
2. Preserve the existing algorithm that starts from the latest server payload and copies only explicitly edited fields. Do not manufacture a default or rewrite the generic payload shape.
3. Notify both implementation slices that the property is optional, boolean-only, Overview-only, and uses existing request/response and version envelopes. Frontend rebase regression tests belong to T2 frontend ownership.

Completion: backend/frontend writers share one settled contract. Covers AC2, AC3, AC6.

### T2. Implement and verify the bounded slices

Dependency: T1. Backend and frontend ownership below is non-overlapping and may run in parallel in Mode A. Compatibility work can proceed independently in the primary thread.

**Backend owner: `backend_implementer` in Mode A, primary agent in Mode B.**

Owned product paths:

- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`

Owned test paths:

- `backend/tests/ai-estimator-knowledge-validation.test.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`, only where needed for the existing authorization/write seam
- `backend/tests/api-docs.test.ts`, only after the primary agent hands off the inspected existing diff

Tasks:

1. Add the Overview allowlist entry and optional strict boolean validation. Accept absence, true, and false; reject null, strings, numbers, arrays, and objects. Verify the field is rejected in other section types.
2. Document the optional boolean and absent-as-No display behavior in the existing knowledge OpenAPI payload. No new route or authorization operation is required.
3. Use existing Mongo replica-set service tests to prove true/false persistence, absence remaining absent, unrelated edits preserving the value, and stale section/aggregate versions being rejected.
4. Verify duplicate/new-draft copying with distinct true and false source lines, asserting the source active revision/history remains unchanged. Exercise existing protected-write seams for non-editable revisions and unauthorized actors without changing permissions.
5. Keep generic model/service persistence unchanged unless a demonstrated defect prevents the approved behavior. Return any such dependency to the primary agent before extending ownership.

Completion: backend accepts and persists only the approved metadata through existing guarded writes. Covers AC2, AC3, AC4, AC6.

**Frontend owner: `frontend_implementer` in Mode A, primary agent in Mode B.**

Owned product paths:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`, only if existing save/conflict wiring needs an explicit addition

Owned tests: corresponding panel/conflict tests, `knowledgeSectionPayload.test.ts`, and the relevant existing workspace suite (`KnowledgeItemWorkspace.configurationModes.test.tsx`, `KnowledgeScreens.test.tsx`, or `KnowledgeFoundation.test.tsx`) after identifying the actual save seam. Keep changes focused rather than duplicating coverage across all suites.

Tasks:

1. Add the accessible fieldset and radio group only for `presentation="configuration"`, using existing names, styling, keyboard interaction, disabled/saving state, and per-instance radio names. Explicitly mark only `selectionNeeded` dirty on user interaction.
2. Extend conflict-review field typing, default field list, and label/value mapping. Check caller-supplied field lists. Missing/false displays No; malformed saved values follow the existing review-warning convention.
3. Verify regular and temporary Configuration presentation, Yes/No round trips, missing default, no write on open, discard/unsaved behavior, read-only/saving controls, keyboard access, and absence of the control in default/procurement proposal presentations.
4. Cover edited-field rebase in both directions, unedited preservation of a newer server value, and existing failed/uncertain-save handling so unconfirmed local state is not presented as saved.
5. Reuse current query synchronization. Change it only if verification demonstrates this field fails to refresh, and request a file-ownership handoff first.

Completion: the Configuration editor displays and saves the flag through existing workspace behavior. Covers AC1, AC2, AC3, AC5, AC6.

**Compatibility owner: primary agent.**

Audit `mobile/src/features/knowledge/KnowledgeOverviewEditor.tsx`, `knowledgeWorkspaceDraft.ts`, their existing tests, and shared proposal consumers for preservation of unknown Overview metadata. Add a focused regression to `mobile/src/features/knowledge/knowledgeWorkspaceDraft.test.ts` if needed to demonstrate true/false preservation during unrelated edits. No native control or redesign is included. Coordinate any frontend compatibility changes with the frontend owner; do not edit their files concurrently.

Completion: existing writers preserve this optional value, with no downstream Client selection behavior introduced. Covers AC3, AC5, AC6.

### T3. Integrate and review

Owner: primary agent, with `integrity_reviewer` in Mode A. Dependency: all T2 writers finished.

1. Inspect the integrated diff against the approved spec and baseline. Confirm Overview-only storage, stable IDs, strict validation, section/aggregate concurrency checks, permissions, immutable history, audit/transaction behavior, dirty/rebase handling, and consumer preservation.
2. Confirm no Client-selection filtering, task creation, design requirement changes, financial calculations, or unrelated prior work was modified.
3. Resolve verified findings in owned files. Re-run affected checks after fixes. Broaden test coverage only for newly discovered risk or changed paths.

Completion: review findings are resolved or clearly recorded as an outstanding blocker. Covers AC1 through AC6.

### T4. Final verification and handoff

Owner: primary agent, with `verification_runner` after review in Mode A. Dependency: T3 and all writers finished.

1. Run the focused backend/frontend/native checks, typechecks, and affected production builds below on the integrated result. Preserve replica-set transaction semantics in service tests.
2. Perform rendered/browser verification using synthetic data at desktop, tablet, and mobile widths (1440, 768, 390). Confirm readable placement, no overflow, accessible group names, keyboard toggling, saved-value reload, and disabled controls for read-only/saving states. Inspect console/network failures. Do not expose real client data in screenshots or logs.
3. Confirm the actual local API used for browser verification has loaded the changed validator/documentation. The known local backend supervisor is non-watching; a build alone is insufficient. If needed, restart only that existing loopback development target with its current no-seed configuration, then verify the loaded contract. Do not seed or change production services. Keep browser test records synthetic and separate from user data.
4. Run `git diff --check` and review final status against T0. Record exact test results, browser evidence, baseline failures, skipped checks, and generated artifact paths in this plan. Remove unnecessary runtime artifacts.
5. Hand off the outcome, affected files, validation, and remaining limitations. No staging, commit, push, deployment, migration, backfill, or external communication is authorized.

Completion: all acceptance criteria have current evidence; any incomplete verification is explicitly reported rather than called complete.

## Verification commands and acceptance mapping

Run commands from the indicated workspace. Initial focused lanes establish the baseline; final runs verify the integrated change. Additional workspace suites should be selected based on the actual seam touched.

| Area | Command or check | Acceptance criteria |
| --- | --- | --- |
| Backend validation, versioned persistence, lifecycle, protected writes, OpenAPI | In `backend`: `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts --maxWorkers=1` | AC2, AC3, AC4, AC6 |
| Web controls, rebase, conflicts, regular/temporary workspace | In `frontend`: `npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx` plus the existing save/error suite changed in T2 | AC1, AC2, AC3, AC5, AC6 |
| Native payload preservation | In `mobile`: `npm test -- --runInBand src/features/knowledge/knowledgeWorkspaceDraft.test.ts` | AC3, AC5, AC6 |
| Contract/compiler checks | `npm run typecheck` in `backend`, `frontend`, and `mobile` | AC6 |
| Affected production builds | `npm run build` in `backend` and `frontend` | AC6 |
| Browser/runtime | Synthetic regular/temporary Overview, keyboard, viewport and save/reload checks; verify running backend contract | AC1, AC2, AC3, AC6 |
| Scope and integrity | Integrated diff, immutable history/authorization assertions, no downstream consumers of the new flag | AC4, AC5 |
| Repository hygiene | At repository root: `git diff --check` and `git status --short` | AC6 |

There is no repository lint script. Do not claim lint passed. Full backend/frontend suites and native export are not required by default for this bounded optional metadata field; broaden if actual changes or focused failures reveal wider impact. No OCR code or tests are implicated.

## Progress and evidence

- Specification approval received on 2026-11-27.
- Plan prepared from the current Overview editor, shared rebase contract, conflict field list, backend validation/persistence, OpenAPI, and existing test seams.
- T0: baseline captured under `/private/tmp/lisno-selection-needed/`; existing product target diffs are empty except prior layout assertions in `backend/tests/api-docs.test.ts`, which must be retained. Frontend baseline: 4 files, 134 tests passed. Backend sandbox run could not start local listeners; rerun with local-listener permissions recorded in `backend-baseline.log`.
- T1: shared editable-field union extended; generic rebase behavior unchanged.
- Backend baseline with listeners enabled: 392 passed, 3 failed (395 total). Existing failures: `rejects a new Budget price after induction approval is reopened`, `permits Procurement vendor management and inline classifications without opening Configuration`, and `documents scoped Mode tiers without accepting whole namespace maps`. None is changed by this feature.
- T2 complete: two backend product files, two frontend product files, the shared field union, and focused regression tests. Generic persistence, workspace save/query synchronization, and native editor sources required no changes. Backend validator 83/83 and targeted replica-set/HTTP/OpenAPI cases 11/11 passed; backend typecheck passed. Frontend four suites 158/158 and typecheck passed. Native preservation suite increased from 9/9 to 14/14 passing tests. Logs are under `/private/tmp/lisno-selection-needed/`.
- Local runtime refreshed using the same loopback no-seed supervisor configuration. Replacement supervisor PID 17847. `runtime-contract.json` confirms the running API exposes `selectionNeeded` as an optional boolean in the Overview payload. No seed, migration, or production action ran.
- T3 complete: independent integrated integrity review found no introduced defect. No downstream Client selection, workflow, or finance consumers of the flag were introduced. Baseline-diff comparison confirms all unrelated tracked changes are intact; prior layout/OpenAPI assertions are retained.
- Existing limitation identified during review: the generic backend section service has no explicit archived-Main-Line status check; this feature retains the existing UI restriction and does not add or claim new server-side archived-write enforcement. Active/history and current-draft/version protections are unchanged and tested.
- Browser QA passed in the real Configuration workspace with synthetic transport: initial No/no write on open, keyboard controls, disabled saving/read-only states, Yes and No save/reload, unrelated values preserved, and temporary Main Line save/reload. No overflow at 1440/768/390; full-page axe reported zero violations, and no application errors or unexpected requests were observed. Axe emitted one synthetic asset-preload warning. Primary visually inspected desktop/mobile screenshots. Both disposable fixture source files were removed and the browser closed. Evidence: `/private/tmp/lisno-selection-needed/browser-results.json` and `selection-{1440,768,390}.png`.
- T4 complete. Final integrated focused tests: backend 399 passed / 3 failed (402 total), with the exact same three failure names as baseline; frontend 158/158; native 14/14. Exact failure comparison: `/private/tmp/lisno-selection-needed/final-backend-baseline-comparison.json`. Backend, frontend, and native typechecks passed; backend and frontend builds passed; final `git diff --check` passed. All preexisting diffs are preserved, and the changed tracked-path set is exactly the 14 reviewed feature/test files.

## Final verification record

| Workspace | Exact command | Result |
| --- | --- | --- |
| `backend` | `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts --maxWorkers=1` | 399 passed, 3 unchanged baseline failures; no new failures. |
| `frontend` | `npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx` | 158 passed. |
| `mobile` | `npm test -- --runInBand src/features/knowledge/knowledgeWorkspaceDraft.test.ts` | 14 passed. |
| `backend`, `frontend`, `mobile` | `npm run typecheck` in each workspace | All passed. |
| `backend`, `frontend` | `npm run build` in each workspace | Both passed. |
| Repository | `git diff --check`, `git status --short`, baseline diff comparison | Passed; prior work preserved and disposable browser fixtures absent. |

Final command logs are `/private/tmp/lisno-selection-needed/final-{backend,frontend,mobile}-{tests,typecheck}.log` and `final-{backend,frontend}-build.log`. Browser evidence and baseline/final comparisons are in the same temporary directory. Standard ignored build outputs were generated in `backend/dist/` and `frontend/dist/`; no build outputs or QA fixtures were added to the change.

Existing warnings: Mongoose deprecated `new` option in tests; Vite bundle-size warning for chunks over 500 kB (main 3564.08 kB, gzip 982.81 kB). Browser axe completed with zero violations despite its synthetic asset-preload warning. No new warning or feature regression was found.

Full backend/frontend/native suites, native device/export QA, and OCR tests were not run for this bounded web metadata addition. There is no lint script. No dependency/lockfile change, migration, backfill, seed, production mutation, deployment, commit, push, or external communication occurred. The only runtime action was the approved existing loopback development supervisor restart.
