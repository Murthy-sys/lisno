# Mobile Main Basket and Mode polish plan

[Specification](../specs/2026-09-26-mobile-basket-mode-polish-design.md).

1. Inspect current app and code, record clean baseline and Mode audit. Complete. Android emulator available; baseline screenshot under `/tmp/lisno-mobile-polish-qa/`.
2. Implement UI refinements. Complete. Independent ownership:
   - Root: detail shell/header/sticky tabs, scoped shared controls, spec/plan and integration.
   - Mode writer: `KnowledgeModeEditor.tsx`, `KnowledgeSpecificationsEditor.tsx`, their focused tests and a feature-local Mode presentation helper if necessary. No shared mutations.
   - Root (additional writer unavailable due to thread limit): `KnowledgeBasketCarousel.tsx` and its focused tests. Preserve carousel/menu contracts and record content.
3. Integrated integrity review, then scoped tests/typecheck/Android export and rendered/native visual verification. Complete. Native inspection caught and resolved React Native sticky-header style transfer; the sticky wrapper now contains a separate horizontal tab row. Review also identified overlapping title/menu targets and partly out-of-bounds carousel arrows; both were corrected before final verification.
4. Record results, inspect diff, remove only task-generated temporary artifacts from repository, and hand off without commit/deployment. Complete.

Preserve calculations, hidden settings, save/version semantics, all tabs and saved context. Tests and visual checks map to the five specification criteria. No unrelated writes or dependencies.

## Verification results

- `cd mobile && npm run typecheck`: passed.
- `cd mobile && npm test -- --runInBand src/features/knowledge src/navigation`: passed, 27 suites / 297 tests. Includes retained incomplete decimal drafts, disclosure state, unchanged payloads, basket geometry/menu callbacks, and navigation protection.
- `cd mobile && npm run export:android`: passed. Output `mobile/dist/android`; only environment color warnings. No dependency or lockfile changes.
- `git diff --check`: passed.
- Native Android emulator: reviewed basket cards, item header, Overview and Mode; scrolled long Mode content to confirm pinned horizontal tabs, switched back to Overview, and navigated back to baskets without changing or saving live data.
- Browser harness renders the actual mobile components with synthetic API data. All four tabs passed horizontal alignment and page-overflow checks at 320, 390 and 768 pixels. Basket action menu and carousel next-position passed. An initial menu-dismiss test clicked the center beneath the menu; using the exposed backdrop correctly passed without a product change.
- Synthetic Mode interaction: all sources fit at 320 pixels; `12.` was retained after Stay in the unsaved-change dialog; Discard and continue restored Overview at a usable scroll position. Default shared-control behavior is retained outside the detail density provider.
- Browser-only harness emits existing native-SVG attribute and pointerEvents adapter warnings; no runtime application exceptions were found. Android appearance was checked separately.

Evidence, test logs and temporary screenshots are under `/tmp/lisno-mobile-polish-qa/`. The task-owned browser/server are closed; the user's Metro server is left running. The tracked Expo export log is restored to its clean baseline. No commits, deployment, migrations, backend changes, production writes, or new dependencies. iOS and physical-device checks were not run; the full unrelated mobile suite was not required for this UI scope.

## Follow-up scope-row refinement
1. Capture current dirty target diffs and read-only interaction review. Complete; earlier work is retained.
2. Root owns local scope heading/row styling and an opt-in KnowledgeChoice row variant. Complete; checkbox and remove controls remain separate sibling targets.
3. Run focused Mode regressions and typecheck; render populated short/long rows at 320/390 pixels and verify select/remove. Complete. `npm test -- --runInBand src/features/knowledge/KnowledgeModeEditor.test.tsx src/features/knowledge/KnowledgeModeSimulator.test.tsx src/features/knowledge/KnowledgeItemWorkspace.test.tsx`: 3 suites / 17 tests passed. `npm run typecheck` and `git diff --check` passed. Both widths were visually inspected; long names wrap, checkbox/remove remain separate targets, and removal leaves the other selection/count intact. Existing native accessibilityState is retained; the temporary React Native Web preview does not translate it to aria-checked, so the browser check used rendered count and shared description as the selection evidence. No new Android export or iOS run for this small styling follow-up. API, calculations and draft mutation semantics are unchanged.
