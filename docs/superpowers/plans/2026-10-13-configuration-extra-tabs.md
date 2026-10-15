# Configuration extra tabs task plan

Source: [specification](../specs/2026-10-13-configuration-extra-tabs-design.md). Standing autonomous authorization and parallel mode remain applicable.

1. **Discovery complete.** Read-only explorer confirmed there are no existing screens/data contracts to reuse; preserve shared/native mobile registry and completion counts. Baseline paths captured under `/tmp/lisno-configuration-extra-tabs/`; requested feature targets are clean.
2. **Implementation complete.** Frontend writer updated the local workspace tab registry, navigation, page integration and focused existing tests. New panels have explicit no-fetch/no-save branches and preserve the navigation guard. Shared/backend files and unrelated dirty work are unchanged.
3. **Review and scoped verification complete.** Primary and independent read-only reviewer found no confirmed regressions in the three production files. Browser, build, typecheck and 78 focused tests passed. The complete Configuration screen file has exactly the same 15 failures as an isolated unchanged HEAD baseline, with no added failures. No migrations, dependencies, external actions, commits or deployment.

Acceptance mapping: order/keyboard/mobile checks cover AC1–2; request/save/count assertions cover AC3; existing workspace guard/save regressions cover AC4; final checks cover AC5.

Browser verification used the actual workspace with synthetic local data at 1440px and 390px. Exact tab order, Arrow/Home/End wrapping, mobile selection and labelled empty panels passed; no new section endpoints, writes, console errors or page errors occurred. The mobile document width remained 390px. Screenshots were inspected and saved under `/tmp/lisno-configuration-extra-tabs/`. Browser and local preview server were stopped after verification; CLI artifacts were moved out of the worktree.

Frontend `npm run build` passed (Vite 9.28s), retaining the existing non-blocking >500kB chunk warning. Frontend `npm run typecheck` passed. `git diff --check` passed after source release.

## Final test evidence

Run in `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t 'opens both new tabs|retains stay, discard and save|shows all temporary sections|preserves arrow, Home, End|keeps section and category navigation|keeps mobile selectors' --maxWorkers=2
npm test -- src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/knowledgePresentation.test.ts src/features/ai-estimator-knowledge/KnowledgeIndexPresentation.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```

- Tab regression filter: 12 passed, 86 outside-filter tests skipped. Includes read-only/no-revision states, no API/save, completion counts, accessibility and unsaved stay/discard/save.
- Foundation/presentation/index: 66 passed across three files.
- Full `KnowledgeScreens.test.tsx`: current 83 passed / 15 failed; isolated HEAD baseline 79 passed / 15 failed. Failure names match exactly (`baseline-comparison.txt`), confirming the four new cases pass and no new failures. Existing Mode editor/save/summary failures were not changed or suppressed.
- No full repository, backend or native mobile suites were run for this web-only navigation change; their source/contracts are unchanged. No lint script exists.

Artifacts: `/tmp/lisno-configuration-extra-tabs/frontend-tab-regressions.log`, `frontend-foundation-regressions.log`, `frontend-screens-final.log`, `baseline-screens.log`, `baseline-comparison.txt`, `frontend-typecheck.log`, `frontend-build.log`, `browser-result.json`, `desktop.png`, `mobile.png`. Temporary isolated baseline source was removed after comparison. Ignored frontend build/cache outputs remain. Existing assigned-project-visibility work was preserved.
