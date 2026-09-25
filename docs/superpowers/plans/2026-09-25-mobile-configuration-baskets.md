# Mobile Configuration basket list plan

Spec: [Basket list and menus](../specs/2026-09-25-mobile-configuration-baskets-design.md).

1. Capture dirty baselines and trace item imagery, count and action contracts. Root + read-only contract explorer. Complete.
2. Implement one integrated basket-list UI. Complete. Parallel boundaries: carousel worker owns only new `KnowledgeBasketCarousel.tsx` and test; root owns contextual menu, workspace integration, existing deletion export, integration tests and these documents. No writer touches the completed header or shared contracts.
3. Review the integrated result for permissions, stable IDs, native modal sequencing, stale state and pagination. Complete. Independent review found no contract/permission regression; its verification gaps were closed with a terminal-page recovery regression and enlarged-text menu checks. Menu height was additionally bounded to space below its chosen position.
4. Run focused Configuration/navigation tests, mobile typecheck, Android export, rendered phone/tablet interactions and git diff hygiene. Complete; final integrated verification passed.

No dependencies, external writes, commits or deployment planned. Existing unrelated project and earlier Configuration parity work must remain intact.

## Implemented behavior

- `KnowledgeBasketCarousel.tsx` uses compact disclosure rows and horizontally scrollable item cards. Previous/next controls and dots follow actual scroll positions and respond to resized/filtered content. The first basket starts expanded; other baskets retain independent disclosure controls.
- `KnowledgeCatalogMenu.tsx` provides the anchored main-basket and item menus, viewport/safe-area bounds, outside/Back dismissal, focus handling and iOS deferred action dispatch. Unmount or removed permissions cancels pending commands.
- `KnowledgeCatalogWorkspace.tsx` resolves menu targets from current stable IDs, preselects the chosen basket for both create actions, reuses the existing editor/deletion confirmation, and recovers pagination after the last page disappears.
- `KnowledgeCatalogManagement.tsx` only exports its existing deletion component. `KnowledgeCatalogHeader.tsx` is byte-identical to the captured baseline.
- Card thumbnails use an existing decorative room asset because the API has no item-photo field. Counts retain the frontend's returned-page meaning with an accessible qualifier; no reference sample counts or workflow data are fabricated.

## Verification evidence

- `cd mobile && npm test -- --runInBand src/features/knowledge src/navigation/AdaptiveAppScaffold.ui.test.tsx src/navigation/BackNavigationProvider.test.tsx`: **19 suites, 157 tests passed**. Includes carousel boundaries, state/metadata, stable-ID/version edit, both create variants, confirmed deletion, permissions, iOS sequencing/cancellation and terminal-page recovery.
- `cd mobile && npm run typecheck`: **passed**. `cd mobile && npm run export:android`: **passed**, 2,832 modules and 39 assets, ignored output `mobile/dist/android`. Only the existing NO_COLOR/FORCE_COLOR environment warning was emitted.
- `git diff --check`: **passed**. Independent verification confirmed header baseline equality and the export-only management delta. Full unrelated suites, backend/OCR checks and native iOS/device execution were not run for this mobile presentation slice.
- Rendered actual components against synthetic data at **389×750, 320×640 and 900×900**. Inspected screenshots, carousel previous/next, disclosure, all four menu labels, dismissal and menu bounds. No page overflow or uncaught JavaScript errors. Existing React Native Web adapters log native SVG accessibility-prop compatibility warnings and pointerEvents deprecation; these are not native runtime failures.
- Enlarged-text stress at 320×640 used 24px text/34px line-height. Wrapped menu content scrolls within the viewport and the last action remains reachable. Rendered Edit targets POP / Gypsum; Delete opens confirmation and cannot submit before confirmation.
- Artifacts and captured source baselines: `/tmp/lisno-configuration-baskets-qa/`. No physical-device run, app installation, live data deletion, migrations, dependencies, commits, pushes or deployment performed.
