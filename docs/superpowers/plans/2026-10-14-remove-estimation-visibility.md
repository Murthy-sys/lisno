# Remove Estimation visibility plan

Specification: [design](../specs/2026-10-14-remove-estimation-visibility-design.md). Standing autonomous Mode A authorization applies.

1. Root: capture current dirty state and affected files; remove only the workspace visibility editor and its state coordination.
2. Worker: update obsolete visibility-driven workspace tests to exercise Design rule navigation/save protections and absent visibility controls. Own only the relevant block in `KnowledgeScreens.test.tsx`; preserve all unrelated tests.
3. Root: review integrated delta; run focused rendered tests, TypeScript and frontend build, inspect browser rendering where practical. Record exact outcomes and limits.

Steps1–2 can run in parallel after the removal contract is fixed. No backend edits, migrations, commits or deployment.

Completed. Removed the visibility editor and its workspace dirty/save/unknown-state coordination; independent Design protections remain. Preserved backend visibility values and confidentiality behavior. Only the workspace component and its relevant existing test block changed in product/test sources.

Verification:
- `npm test -- src/features/ai-estimator-knowledge/KnowledgeDesignRulesPanel.test.tsx src/features/ai-estimator-knowledge/useUnsavedKnowledgeGuard.test.tsx`:11 passed.
- Focused `KnowledgeScreens.test.tsx` Design save/navigation/state cases:6 passed,95 unrelated cases intentionally skipped. Includes aXe checks, all14 questions, absent visibility controls, draft/read-only/no-revision, in-flight/unknown saves and persisted CAS navigation. JSON: `/tmp/lisno-remove-visibility/workspace-tests.json`.
- `npm run typecheck`: passed on final integrated sources/tests. Initial check caught one obsolete visibility reset, which was removed before the successful rerun.
- `npm run build`: passed; existing Vite large-chunk warning remains.
- Actual workspace browser interaction at1440px and390px with synthetic API fixtures: removed controls absent,14 questions present, Custom default, keyboard radios, dirty guard, save and reload persistence all passed; no overflow, page errors or unexpected requests on final run. Screenshots/script in `/tmp/lisno-remove-visibility/`. Initial browser run caught the same obsolete reset; final rerun clean. Browser and local server stopped, owned browser logs moved outside repository.
- Integrated delta reviewed against initial copies; `git diff --check` passed. Existing test content outside the assigned block is byte-identical.

Full frontend/backend suites were not rerun for this bounded UI change. No backend edits, dependencies, migrations, commits or deployment. Existing data and prior dirty work were preserved.
