# Direct Main Line deletion: task plan

## Authority and scope

Source of truth: [approved Main Line deletion specification](../specs/2026-10-08-main-line-delete-action-design.md), approved on 2026-10-08. “Mini line” is understood as the existing Main Line entity.

Add a compact Delete action to ordinary Main Line cards and use the existing permanent-deletion API. Preserve the active-item deactivation requirement, existing workspace deletion, the completed Sub-Basket deletion work, temporary-item behavior and all pricing workflows. No new API, dependency or migration is planned.

The specification and this plan were approved on 2026-10-08, and the user selected Mode A. The delivery record below distinguishes completed implementation from the remaining visual verification limitation.

## Worktree and ownership

Current product changes belong to the completed Sub-Basket task: `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexPage.test.tsx` and `knowledge-index.css`. Its two working documents and this feature's specification are also untracked. Preserve all of them. Capture current status and per-target diffs before writers start.

Paths below are relative to `frontend/src/features/ai-estimator-knowledge/`:

- **Primary agent:** contract decisions, shared cache helpers in `knowledgeMutationSync.ts` and their tests, integration, documents and final reconciliation.
- **UI owner:** `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexItemCard.tsx`, `knowledge-index.css`, a focused `KnowledgeMainLineDeleteDialog.tsx` controller if needed, and backwards-compatible presentation props in `KnowledgeLifecycleDialogs.tsx` if needed. Do not put the deletion state machine into the card.
- **Regression owner:** a focused `KnowledgeMainLineDeletion.test.tsx`, plus only relevant assertions in `KnowledgeIndexPage.test.tsx`, `KnowledgeScreens.test.tsx` or `KnowledgeDeletionRedirect.test.tsx`. Preserve existing Sub-Basket cases and unrelated baseline failures.
- Backend, shared API contracts, workspace business logic and temporary-item mutation flows are outside the planned write boundary. Any discovered need to cross it returns to the primary agent before editing.

## Dependency-ordered tasks

### 1. Confirm the integration contract

Owner: primary agent. Begins after execution authorization.

- Reconcile the approved specification with the latest code and dirty diffs.
- Settle the compact card action, target shape and dialog callbacks before parallel work. Accessible action name: `Delete Main Line ${name} permanently`.
- Target uses `mainLineId`, `basketId` and nullable `subBasketId`; current detail supplies the reviewed name, version, status and allowed actions. Missing/error data is never treated as permission.
- Settle compatible cache-helper options for explicit refresh failures and parent Sub-Basket catalogue refresh. Existing callers must retain their current behavior unless a directly demonstrated defect requires a scoped correction.

Acceptance: spec AC 1–5 have an agreed contract; ownership and existing edits are documented before writers begin.

### 2. Wire the card and guarded confirmation flow

Owner: UI owner. Depends on task 1; can proceed alongside tasks 3 and 4 once their interfaces are agreed.

- Add the compact text action beside the name/rename controls, separate from navigation and the overflow menu. Apply it only to ordinary Main Lines with valid catalogue parents, Super Admin lifecycle permission and the existing allowed deletion action.
- Fetch fresh detail on opening. Block confirmation until the exact ID, original parent context, allowed action and non-active status are verified. Use the current saved version, not the list row's potentially stale version.
- Reuse the existing lifecycle confirmation presentation and required reason. Add only optional, backwards-compatible context, blocking or focus props to shared presentation if required. Show the actual selected Main Line and parent context.
- Handle loading, read failure/retry, lost access, missing/moved targets, active items and version conflicts. A conflict requires refreshed detail and a new explicit confirmation. Never auto-deactivate or auto-retry deletion.
- Lock submission synchronously before mutation, freeze the submitted target/version/reason, and retain a committed state independently of refresh state.
- After success, remove the exact card and run task 3's cache refresh. Offer refresh-only recovery on failure. Retain the parents and siblings, including an empty Sub-Basket after its final child is removed.
- Preserve filters and expansion. If the last item on a non-first page is removed, return to a valid page without changing filters. Restore focus to the trigger on cancellation or a surviving group/header/page fallback on deletion.
- Keep desktop controls compact and mobile touch targets usable; do not enlarge cards or add a separate action section.

Acceptance: spec AC 1–5; existing card links, rename, menus, temporary cards and Sub-Basket controls remain intact.

### 3. Verify and integrate deletion cache behavior

Owner: primary agent. Depends on task 1.

- Reuse `commitKnowledgeMainLineRemoval` to remove the deleted line by stable ID and cancel stale reads before publishing removal. Preserve unrelated item drafts and sibling caches.
- Reuse the existing deletion refresh boundary, with an explicit error-propagating path for the new flow. Ensure affected item lists, detail/history/section caches, deletion previews, estimation and Procurement caches are covered without refetching the deleted detail.
- Refresh the parent Sub-Basket catalogue: deleting a child can advance its stored aggregate version. Preserve the parent and avoid presenting stale rename/delete versions.
- Verify that failed refresh does not restore the deleted card or rerun the mutation, and that repeat refresh is safe. Add focused helper tests for any changed behavior or options.

Acceptance: spec AC 4–5; existing shared-helper callers and workspace behavior remain compatible.

### 4. Add meaningful regression coverage

Owner: regression owner. Depends on task 1; can run alongside tasks 2 and 3 in separate test files.

- Exercise the real hierarchy and confirmation with mocked API boundaries: draft/inactive action, active/nondeletable/unauthorized denial, temporary-card preservation, missing/error catalogue and archived parent.
- Cover fresh detail loading and failure, same-named lines, mismatched/reparented targets, latest version use, version conflict requiring explicit review, and access/target loss while confirmation is open.
- Cover required reason, keyboard cancellation and focus, same-tick and pending duplicate submissions, request errors, committed deletion with refresh failure and successful refresh-only recovery.
- Verify exact-line removal, retained siblings/parents, final child, final page, filtered parent disappearance and focus fallback. Include direct-under-Main-Basket lines.
- Reuse existing Sub-Basket and workspace deletion suites. Update only assertions intentionally affected by the new visible action; do not repair unrelated historical test expectations in this task.

Acceptance: spec AC 1–6 covered by behavior assertions with asymmetric IDs and versions. Intermediate runs during concurrent edits are provisional.

### 5. Review and verify the integrated result

Owner: primary agent; dedicated review and verification roles in Mode A. Depends on tasks 2–4 finishing.

- Review stable-ID lineage, permission checks, stale-version handling, duplicate protection, postcommit recovery, cache reconciliation and focus. Resolve confirmed findings before final verification.
- From `frontend/`, run:

  ```sh
  npm test -- src/features/ai-estimator-knowledge/KnowledgeMainLineDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeDeletionRedirect.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
  npm run typecheck
  npm run build
  ```

- Include any additional focused shared-lifecycle tests introduced by implementation. Run affected `KnowledgeScreens.test.tsx` cases; if running the full screen suite, compare failures with the 15 established baseline failures at `684a2c22b09e91a61310953d68837de87861ad3d` and report them explicitly.
- Use local synthetic data for rendered desktop and mobile checks, including a narrow 320px viewport: compact card layout, no overflow, keyboard activation/cancellation, focus after removal, disabled/error states, refresh-only recovery and console/network errors. Run an automated accessibility check on the confirmation.
- Run `git diff --check` and `git status --short`; keep runtime output in ignored paths or `/tmp`. There is no lint script. Backend tests are required only if that boundary changes, with replica-set coverage for transactional changes.

Acceptance: spec AC 6; final handoff states exact results, baseline failures, unrun checks and remaining limitations without claiming broader suites passed.

## Execution and parallelism

- **Mode A:** task 1 is sequential. After the contract is settled, UI and regression agents can work in their non-overlapping files while the primary agent owns cache helpers and helper tests. Tell each writer they share a worktree, must preserve others' changes and must not cross ownership boundaries. After writers finish, run a focused integrity review, then final verification on the integrated result.
- **Mode B:** the primary agent performs implementation, review and verification inline, sequentially.
- Keep one parent implementation task in progress. No agents or implementation begin at this plan gate.

## Delivery and exclusions

Report the Main Line card deletion entry point, preserved safeguards, affected files, evidence and limitations. No real user records are deleted during development or verification. No deployment, migration, seed, commit or push is included. Removing the new entry point rolls back the code change; it does not restore data removed through the existing permanent-deletion operation.

## Delivery record: 2026-10-08

Tasks 1–4 are implemented. The UI and regression writers worked in separate files, and the primary agent integrated cache synchronization. Existing Sub-Basket diffs were captured at `/tmp/lisno-main-line-delete-qa/prior-sub-basket.patch` and preserved. Task 5's integrity review and automated checks are finished; a final browser contrast rerun remains unverified because the browser execution request was denied.

### Result and affected areas

- `KnowledgeIndexItemCard.tsx` and `KnowledgeBaseIndexPage.tsx`: compact direct Delete action for eligible ordinary Main Lines; current catalogue/permission guards, exact parent identity, stable focus and final-page correction.
- New `KnowledgeMainLineDeleteDialog.tsx`: fresh detail review, required reason, current-version deletion, duplicate protection, explicit review after conflict, and refresh-only recovery after committed deletion.
- `KnowledgeLifecycleDialogs.tsx`: optional backwards-compatible presentation/focus props. Existing workspace and activation/deactivation consumers retain their defaults.
- `knowledgeMutationSync.ts`: optional parent catalogue refresh and explicit refresh-error propagation for this new flow; existing callers retain their default behavior.
- `knowledge-index.css`: compact desktop action placement and 44px mobile targets; scoped readable confirmation caption. No additional desktop action row.
- New `KnowledgeMainLineDeletion.test.tsx`, additional `knowledgeMutationSync.test.ts` cases and one intentionally updated button assertion in `KnowledgeScreens.test.tsx`.

No new dependency, backend, API contract, schema or migration changes. The existing permanent-deletion operation and deactivate-before-delete rule remain authoritative.

### Verification evidence

- The five-file focused command in task 5 passed **136/136 tests**: Main Line deletion 40, index/Sub-Basket 47, basket management 16, workspace deletion redirects 4, cache synchronization 29.
- `cd frontend && npm run typecheck`: passed.
- `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`: **79 passed, 15 failed**. The 15 failing test names match the established baseline at `684a2c22b09e91a61310953d68837de87861ad3d`; no new screen-suite failures. Evidence: `/tmp/lisno-main-line-delete-screens-final.json` compared with `/tmp/lisno-sub-basket-delete-screens-head.json`.
- `cd frontend && npm run build`: passed again after the final CSS selector correction, including TypeScript compilation (3,085 modules); the existing bundle chunk warning remains.
- `git diff --check`: passed. Status contains only expected frontend/doc paths, including the preserved previous Sub-Basket work.
- Independent integrity review found no confirmed defects in stable-ID targeting, permissions, version checks, duplicate prevention, committed-state recovery, cache reconciliation or compatibility.

Rendered QA used only synthetic data at a local Vite harness. At 1440px, keyboard open/cancel restored focus without a mutation; confirmed deletion sent the reviewed stable ID, version 5 and trimmed reason, removed only the target and retained its sibling. Desktop card height was approximately 119px, with no horizontal overflow. At 390px, touch targets were 44px and no horizontal overflow was measured; final-child deletion retained the empty parent, and refresh retry did not issue another DELETE. The 320px layout was visually inspected. Recorded console logs contain React DevTools informational messages and no application errors.

Automated browser accessibility checking identified a low-contrast inherited confirmation caption. A scoped CSS selector was corrected to outrank the Super Admin modal theme and use the existing muted-text token. **The final rendered contrast/accessibility rerun was denied and is not claimed as passed.** Earlier functional browser checks precede this final caption-only CSS correction.

QA files and screenshots are under `/tmp/lisno-main-line-delete-qa/`; screen-suite reports are at the paths above. Build outputs remain ignored. No full frontend suite, backend/replica-set suite or OCR suite was run because those boundaries were unchanged; there is no lint script. No deployment, commit, push, seed, migration or live user-record deletion was performed.
