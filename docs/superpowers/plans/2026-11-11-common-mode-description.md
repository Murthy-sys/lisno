# Common Mode Description task plan

Approved specification: [Common Description for PMC and Execution](../specs/2026-11-11-common-mode-description-design.md).

Scope: one shared Description above PMC/Execution in every existing Mode editor. Keep saved values, editor behavior and calculation contracts unchanged. Specification and plan approved; user selected execution A.

## Ordered tasks and ownership

### T1 — Preserve the starting worktree

Primary owner. Capture status and relevant per-target diffs before editing. The existing nine modified frontend files and previous grouped-mode documents belong to earlier work and must be preserved. The new product targets below are currently clean. Record baseline failures only if encountered; do not fix unrelated failures.

### T2 — Relocate the existing editor

Depends on T1. Primary implementation owner:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeModePendingChanges.ts`

Move the existing Description block below the PMC/Execution selector and above both panels. Retain one mounted editor, its reset key, refs, callbacks and payload. Remove only the Description-specific `showMode("pmc")` calls from validation and summary navigation. Change its review label to `Mode · Description`.

Use existing styles. If browser inspection exposes spacing or overflow caused by relocation, primary owns a minimal adjustment in `knowledge-mode-reference.css`; no redesign. Do not change the description generator, calculation logic, API or backend.

Acceptance: specification criteria 1 and 3 (common placement/visibility and correct validation/review label), while preserving criteria 2 and 4 (editing and independent saved values).

### T3 — Update focused regression coverage

Depends on T1 and the agreed T2 behavior; may run in parallel with T2 because ownership is disjoint. In execution A, one regression agent owns only directly affected tests in:

- `KnowledgeModeConfigurationBuilder.test.tsx`
- `KnowledgeModeSectionStateRemoval.test.tsx`
- `KnowledgeModePanelPendingChanges.test.tsx`
- `knowledgeModePendingChanges.test.ts`
- `KnowledgeModeDescription.test.tsx` only if an existing assertion assumes PMC containment.

Update the existing PMC-containment assertion to the common placement and remove obsolete PMC-specific review expectations. Extend relevant cases to cover the four PMC/Execution selection combinations, collapsed panels, retaining an unsaved description while toggling panels, and description-error focus without enabling PMC. Reuse existing save/cancel/read-only cases; avoid duplicate tests of unchanged internals.

Acceptance: specification criteria 1–3. Existing configuration-mode tests verify criterion 4, independent default/tier descriptions, without altering those dirty files unless a directly obsolete containment assertion requires it. Primary must review their existing diff before authorizing any such edit.

### T4 — Integrate, inspect and verify

Depends on T2 and T3. Primary owns delta review and reconciliation. Run on the integrated worktree:

```sh
cd frontend
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx
npm run typecheck
npm run build
```

Verify the real shared Mode UI at desktop and mobile widths using synthetic responses only: Description precedes both panels, remains visible when PMC is hidden/collapsed, editing survives panel toggles, and keyboard focus reaches the common editor. Check a tier editor as well as default Mode. No real Configuration saves. A browser verifier may own temporary fixtures/session only and run after T2 is stable, independently of source-free test/build commands. Remove task-owned browser artifacts afterward.

Run `git diff --check` and inspect final status. Report exact results and any existing failures separately. No full backend/OCR suites are needed because no contract or sources there change. No dependencies, migrations, commits or deployment.

## Execution boundaries

Keep one parent task in progress. Execution A permits the independent product/test work above; agents must preserve other writers' work and stay within assigned paths. Execution B performs the same tasks inline. Final verification follows all source/test writers and uses the integrated result; repeat passed checks only for a subsequent relevant change or unresolved failure.


## Execution record

- T1 complete: captured initial status and per-target diffs before writers. Nine pre-existing modified frontend files and both previous grouped-mode documents are preserved. The two new product files and assigned regression files were clean.
- T2 complete: moved the existing Description block intact outside the PMC section to immediately below the selector; removed the two Description-specific PMC navigation calls; changed the pending-review label to `Mode · Description`. No styles, description generation, storage or API changes.
- T3 complete with `common_description_tests`, changing only the five assigned test files. Primary owns the two product files and this plan. `overview_tier_toggle` owns synthetic browser fixtures/session only. No real Configuration writes are authorized or needed.

- T4 complete: root reviewed the product and test diffs. Integrated six-file regression run completed with 124 passing and 31 failing tests (155 total), all failures in the existing SectionStateRemoval suite. The independent verifier confirmed the same 31 failure names on isolated original HEAD, accounting for the renamed Description placement test; no new failing test names. Frontend typecheck, production build and browser checks passed as detailed below.


### Final verification

- Planned integrated six-file test command: **124 passed, 31 failed, 155 total**, exit 1, 21.21s. Five files passed fully. All failures are in `KnowledgeModeSectionStateRemoval.test.tsx`.
- Independent isolated original HEAD baseline for that file: **15 passed, 31 failed, 46 total**, exit 1, 19.80s. Failure-name sets match exactly after normalizing the renamed Description-placement test. That case originally failed on an unrelated Sub-Vendor default-selection assumption; current assertions verify the common Description placement before reaching its unchanged stale In-house Add component assertion. No new failing names; the test suite is not fully green. Baseline archive/log removed without changing live sources.
- `cd frontend && npm run typecheck`: exit 0. `cd frontend && npm run build`: exit 0, 3,346 modules, Vite 9.86s. Existing large-chunk warning remains. `git diff --check`: exit 0.
- Synthetic real-workspace browser checks passed at 1280px and 390px for default and Signature editors: exactly one Description below the selector and above/outside both panels; visible with neither/either/both panels selected and with collapsed panels; pending text survives all visibility combinations; keyboard preview/Edit/Enter and Cancel work; each scope retains distinct text. Screenshots inspected with no overlap or horizontal overflow. Zero runtime/console errors, unexpected requests or API writes.
- Scope: two product files, five directly affected test files and the two task documents. No style, description-generation, storage, pricing, dependency, backend, migration, commit or deployment changes. Prior dirty work remains intact. Full repository/backend/OCR suites were not run. Ignored generated outputs are `frontend/dist/` and TypeScript caches under `frontend/node_modules/.tmp/`; task-owned diagnostic logs, browser fixtures/screenshots/session and CLI artifacts are removed after checks.
