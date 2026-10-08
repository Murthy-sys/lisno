# Delete Sub-Basket from the Configuration hierarchy: task plan

## Authority and scope

Approved specification: [Delete Sub-Basket from the Configuration hierarchy](../specs/2026-10-08-sub-basket-delete-action-design.md), approved by the user on 2026-10-08.

Add the direct deletion entry point only. Requirement 2, bulk pricing and Modify details, is deferred. Reuse the existing permanent-deletion dialog, API, authorization, impact preview and query synchronization. Do not change pricing, Main Line editing, backend deletion semantics or dependencies.

This document is the task-plan gate. Implementation begins only after plan approval and the execution-mode choice required by `AGENTS.md`.

## Baseline and ownership

- At plan creation, the only dirty path is the untracked approved specification. Product sources are clean. Recheck status and relevant per-file diffs before any writer starts; preserve unrelated work.
- The primary agent owns interpretation, integration, working documents and final reconciliation. Keep only one parent task in progress.
- UI owner: `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`; optionally `knowledge-index.css` for narrowly scoped wrapping. Reuse existing controls and styling.
- Regression owner: `KnowledgeIndexPage.test.tsx`. Existing management-dialog and query-sync suites are regression dependencies, not planned rewrite targets.
- `KnowledgeSubBasketDialogs.tsx`, `knowledgeMutationSync.ts` and backend files are reuse boundaries. Change them only if a demonstrated integration defect requires it, with explicit reassignment and proportionate verification. Do not broaden the feature.

## Dependency-ordered tasks

### 1. Confirm integration contract and baseline

Owner: primary agent. Depends on execution authorization.

- Inspect the current hierarchy, dialog focus lifecycle, deletion permission and query-sync behavior before editing.
- Confirm that exact catalogue parent and Sub-Basket IDs, not names or visible item counts, supply the target and authoritative deletion preview.
- Record the final compact action label and focus fallback. Use the existing dialog's normal permanent-deletion flow, not its recommendation-only inline variant.

Acceptance: specification AC 1–4 are represented in the integration contract; existing edits are understood before ownership is assigned.

### 2. Add the hierarchy action and reuse the dialog

Owner: UI owner. Depends on task 1.

- Add a compact, clearly named Delete Sub-Basket action alongside header controls. Keep it separate from the accordion toggle.
- Require Super Admin, the lifecycle capability, valid loaded matching parent/child records, successful catalogue reads and a non-archived parent. Preserve backend enforcement and disable an open action if current access/target validity is lost.
- Store the exact parent/child target and triggering element; open `KnowledgeSubBasketDeleteDialog` with existing safeguards and callbacks.
- On cancellation return focus to the trigger. On successful deletion announce the result and return focus to a surviving parent/header, with a stable fallback when filtering removes that parent from view.
- Let the dialog perform existing query synchronization and refresh-only recovery. Do not issue a second deletion after a committed result.
- Preserve sibling expansion, rename controls, counts, pagination and Main Line editing. Add only necessary wrapping for narrow widths.

Acceptance: specification AC 1–6; no new API, financial behavior or dependency.

### 3. Add focused hierarchy regression coverage

Owner: regression owner. Depends on task 1; may run alongside task 2 after the action and dialog contract is settled.

- Cover populated and empty groups; matching parent/child IDs; same-named groups in different parents; a filtered or paginated list whose visible children do not represent the whole group.
- Verify unavailable/error catalogue, unauthorized roles/capabilities and archived parents cannot expose a working deletion action; cover access loss while open where supported by the existing auth test harness.
- Exercise actual dialog integration: impact load, exact name and reason, cancellation, successful removal, sibling preservation and focus restoration.
- Cover committed deletion followed by refresh failure and recovery without another deletion. Reuse existing management-dialog coverage for vendor blockers, stale impact/version and duplicate-submit protection rather than duplicating every dialog unit case.
- Preserve existing rename, expansion and Main Line-edit tests.

Acceptance: specification AC 1–6 with behavior assertions, not implementation-shape snapshots.

### 4. Review and verify the integrated result

Owner: primary agent, with review/verification roles in Mode A. Depends on tasks 2 and 3 finishing.

- Inspect the complete diff for authorization visibility, stable-ID targeting, irreversible-action confirmation, cache behavior and focus restoration. Resolve confirmed findings before final checks.
- Run from `frontend/`:

  ```sh
  npm test -- src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
  npm run typecheck
  npm run build
  ```

- Run local browser checks at desktop and narrow mobile widths using synthetic fixtures: header wrapping, keyboard opening/cancellation, dialog focus, successful removal with parent focus, error recovery and no new console/API errors. Do not delete live user data. Store any screenshots or fixture artifacts in ignored temporary output.
- If implementation touches the backend deletion boundary, additionally run the relevant Sub-Basket unit and replica-set integration tests; otherwise do not claim a backend change or rerun unrelated suites.
- Run `git diff --check` and `git status --short`. There is no repository lint script.

Acceptance: specification AC 6–7 and a clean scoped diff. Report exact results, unrun checks and any remaining limitations.

## Execution and parallelism

- Mode A: after task 1, a frontend implementer owns task 2 and a separate regression writer owns task 3, with no overlapping file edits. Both are told they share the worktree and must preserve others' changes. A focused integrity review runs after writers finish, followed by final verification on the integrated result. The primary agent resolves integration issues and reviews the final diff.
- Mode B: the primary agent performs all tasks, review and verification inline, sequentially.
- No agents or implementation begin during this plan gate. Tests run during parallel edits are provisional; final checks run after integration.

## Delivery and exclusions

Report the direct hierarchy deletion action, reuse of existing safeguards, affected files and verification evidence. No commits, pushes, deployment, migrations, seeds or deletion of real Configuration data are authorized. Removing the new entry point is the code rollback; it does not restore data deleted through the existing permanent-deletion workflow.

Status: specification and task plan approved on 2026-10-08; the user selected Mode A. Tasks 1–4 completed. The scoped deletion integration is verified; the broader screen suite has confirmed pre-existing failures, detailed below.

## Implementation and verification record

### Changes

- `KnowledgeBaseIndexPage.tsx`: compact direct Delete action, exact catalogue parent/child targeting, role/lifecycle/read-state guards, live access/target-loss blocking, existing dialog integration and safe focus restoration.
- `knowledge-index.css`: wrapping and compact action sizing, including 44px mobile touch height; hides the unused busy row only on the idle opener to avoid reserving excess width.
- `KnowledgeIndexPage.test.tsx`: actual dialog and query-sync integration, populated/empty and same-named groups, filtered/paginated targeting, catalogue failures and changes, access loss, duplicate submission, cancellation, sibling retention, focus and refresh-only recovery.
- No backend, shared deletion dialog, query-sync contract, pricing, dependency or lockfile changes.

### Automated checks

The four-suite command listed in task 4 ran on the integrated result: **165 passed, 15 failed, 180 total**.

| Suite/check | Result |
| --- | --- |
| `KnowledgeIndexPage.test.tsx` | 47/47 passed |
| `KnowledgeBasketManagementDialog.test.tsx` | 16/16 passed |
| `knowledgeMutationSync.test.ts` | 23/23 passed |
| `KnowledgeScreens.test.tsx` | 79/94 passed; 15 baseline failures |
| `npm run typecheck` | Passed |
| `npm run build` after final CSS refinement | Passed, includes TypeScript compilation; existing Vite chunk-size warning over 500 kB |
| `git diff --check` | Passed |

The 15 screen failures reproduced when the suite ran alone and again in an isolated `git archive` of baseline commit `684a2c22b09e91a61310953d68837de87861ad3d`. Sorted failing test names match exactly, with no new failures. Thirteen expect an obsolete inline Item name textbox, one expects different Overview Save content, and one expects fewer fetched rail sections. These unrelated expectations were not changed by this feature.

### Rendered checks

Used the actual page, existing dialog and styles with synthetic local data at 1440×1000, 390×844 and 320×844. Inspected screenshots and interactions:

- Compact desktop action measured 64×36px; mobile measured 64×44px. No horizontal overflow at any checked width.
- Keyboard Enter opens confirmation; Escape cancels without mutation and returns focus.
- Confirmed populated-group deletion sends one mutation, keeps the same-named group under another parent and an empty sibling, and focuses the surviving parent.
- Empty-group deletion with an injected refresh failure retains recovery. Retry refresh does not increase the deletion-call count; focus returns to the parent afterward.
- Axe reported zero violations within the mobile confirmation dialog. Final browser console reported zero errors and zero warnings.

Read-only integrity review found no confirmed defects. Its two coverage gaps, live catalogue loss and rapid duplicate submission, were subsequently covered by passing regression tests.

### Artifacts and limits

Temporary browser fixture and screenshots: `/tmp/lisno-sub-basket-delete-qa/`. Baseline comparison: `/tmp/lisno-sub-basket-delete-head.9y7lfU/` and `/tmp/lisno-sub-basket-delete-screens-{verification,head}.{json,log}`. Browser-generated repository logs/snapshots are relocated to the temporary QA folder. Build outputs and caches are ignored.

No full frontend suite, backend/replica-set or OCR suites were run; those boundaries are unchanged. No lint script exists. No migration, seed, deployment, commit, push or deletion of live user data was performed. Requirement 2 remains deferred.
