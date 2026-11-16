# Mode description order task plan

Date: 2026-11-15
Status: Implemented and verified; two pre-existing consumer-test failures documented below
Specification: [Mode description order and metadata cleanup](../specs/2026-11-15-mode-description-order-design.md).
Specification and task plan approved by the user's “Approved” responses; the specification's original proposal status is retained. User selected Mode A.

## Scope and ownership

Two production components need changes. Preserve existing styling, editor state/callbacks, read-only guards, internal versions, and useful saving/conflict messages. Targets are currently clean; the repository contains unrelated earlier work that must remain intact.

- **Primary:** `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx` and its existing `.test.tsx` file.
- **Mode toolbar owner:** `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx`, and `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx`.
- Primary owns integration, this execution record, and any narrowly necessary spacing adjustment after visual inspection. No backend, API, dependency, or saved-data changes.

## Dependency-ordered tasks

### 1. Capture baseline

Primary records the initial dirty paths and relevant diffs under `/tmp/lisno-mode-description-order-qa`, then runs the focused existing checks below before writers begin. Supports preservation and all acceptance criteria.

### 2. Apply the presentation change

**Builder slice:** Move the existing Description block before the Mode selector in document order; retain validation alerts and every editor prop/reference. Remove only this builder's Read-only revision badge. Update the existing editable/read-only interaction case to verify the new order and absent badge while keeping its permission and keyboard assertions.

**Toolbar slice:** Remove Section version text from Mode block toolbars. Return no toolbar when there is no dirty-state message; preserve Unsaved changes and Saving… when applicable. Do not change version values or save/conflict code. Update affected existing tests to stop expecting visible version numbers, retain saved-version request assertions, and verify content loading without metadata.

After Mode A selection, these slices can run in parallel on their separate files: primary owns the builder, one frontend agent owns the toolbar slice. Tell the agent it is not alone and must preserve others' changes. In Mode B, primary handles both inline. No extra review agents are necessary for this small presentation edit.

### 3. Integrate and verify

Primary begins final checks after both slices finish; keep one parent task in progress at a time.

- Run `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx`.
- Run the relevant existing Mode state-removal and proposal-workspace cases with a test-name filter covering loading Mode, saving only dirty Specifications, selected-tab content, and dirty/saving/saved feedback. Preserve assertions proving versions remain in save requests. Avoid the unrelated full repository suite.
- Run `cd frontend && npm run typecheck` and `cd frontend && npm run build`.
- Inspect rendered editable/read-only Mode at desktop and mobile widths: Description above PMC/Execution, neither removed label present, no empty toolbar/separator, and no new overflow. Check accessible names and retain disabled fields and existing navigation.
- Run repository-root `git diff --check` and `git status --short`; compare unrelated work against the baseline. Record exact checks, results, and limitations here. Remove temporary repository harness files if any; evidence stays under `/tmp`.

## Acceptance trace

1. **Description first:** builder document-order assertion and desktop/mobile inspection.
2. **Metadata hidden without empty space:** builder and toolbar assertions plus rendered inspection.
3. **Behavior preserved:** existing keyboard/read-only checks, saved-version request assertions, and dirty/saving feedback cases.
4. **Styling and worktree preserved:** scoped diff review, typecheck/build, responsive inspection, and hygiene checks.

No migration, seed, production mutation, commit, push, or deployment is included. This stage creates only the task plan; implementation follows its approval and the execution-mode choice required by AGENTS.md.

## Execution record

All tasks complete under approved Mode A. Primary moved the unchanged Description editor block before the PMC/Execution selector and removed the builder badge. `mode_metadata` removed the toolbar's version text and made clean toolbars return null. Dirty/saving feedback and all internal version/save handling remain intact. No CSS adjustment was necessary. Changed files are exactly the two production components and three existing test files listed above, plus this record.

Verification:

- `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx`: **28 passed** before and after the change. Existing editable/read-only keyboard cases now assert Description comes first and the badge is absent.
- `cd frontend && npm test -- --maxWorkers=2 src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx -t 'loads Mode|saves only the dirty Specifications|keeps Mode content|shows dirty, saving and saved states|places one common Description'`: **5 passed, 2 failed, 74 skipped**, identical before and after. Baseline failures: `places one common Description before the separate PMC and Execution controls` expects Add component to be absent; `saves only the dirty Specifications block` cannot find the pre-existing Item name textbox. Both fail on unrelated existing expectations. Removed-label assertions were updated without changing those behaviors or weakening saved-version request assertions.
- `cd frontend && npm run typecheck`: **passed**. An unsupported test query option found on the first run was removed; the final run has no diagnostics.
- `cd frontend && npm run build`: **passed**. Existing large-chunk warnings remain.
- Rendered actual Configuration Mode in editable and active read-only states at **1440px and 390px**: Description appears above the selector in document and visual order; Mode content has neither removed label; clean toolbar count is zero; no horizontal overflow. Existing fields remain disabled in read-only mode. Automated accessibility scans report **zero violations**; no console/route errors, unexpected requests, or write requests occurred.
- Browser fixture adaptation was temporary and browser-local: the existing synthetic fixture lacks the default Mode tier response marker, so the QA fetch wrapper supplied `modeTier: "default"` on those synthetic GET responses. No repository fixture or production contract was changed. Workspace-wide read-only status outside the Mode content remains intact.
- `git diff --check`: **passed**. Compared initial tracked diffs and unrelated untracked hashes: no unexpected changes.

Evidence, logs, initial snapshots, and screenshots: `/tmp/lisno-mode-description-order-qa`. Owned browser sessions are closed; the existing local frontend server remains running. No temporary repository harness, dependency, migration, seed, production action, commit, push, or deployment was needed. Full suites and unrelated checks were not run; no lint script exists. There is no unresolved issue in the requested layout change; the two documented baseline test failures remain.
