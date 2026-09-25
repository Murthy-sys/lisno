# Mobile Configuration header implementation

Spec: [Header and Actions sheet](../specs/2026-09-25-mobile-configuration-header-design.md).

1. Capture dirty catalog baseline and inspect native Back/sheet conventions. Root owns integration; independent explorer audits navigation. Done.
2. Root implements a feature-local header/Actions sheet and minimal catalog/route wiring. Preserve all lower content and existing action destinations. Done.
3. Verify action visibility/permissions, dismissal and selection, search and filter behavior, TypeScript and Android export. Inspect synthetic phone/tablet render and record results. Done.

No dependency, backend, shared style, commit or deployment changes are planned.

## Implementation and verification

- New `mobile/src/features/knowledge/KnowledgeCatalogHeader.tsx` owns the reference header, botanical SVG decoration, notice, combined search/filter control and scrollable Actions sheet. All five original global actions retain their destinations and permission checks.
- Catalog wiring is confined to the heading/search region. The captured baseline from `{items.isPending ?` through EOF matches byte-for-byte. `mobile/src/app/feature/[featureId].tsx` moves Configuration Back into the content using the established navigation hook.
- Added `KnowledgeCatalogHeader.test.tsx` and extended `KnowledgeCatalogWorkspace.test.tsx` for all action mappings, read-only permissions, dismissal, search/filter callbacks and native iOS presentation sequencing. The iOS destination opens only after `Modal.onDismiss`; independent review found no remaining issue in that transition.
- `cd mobile && npm test -- --runInBand src/features/knowledge src/navigation/AdaptiveAppScaffold.ui.test.tsx src/navigation/BackNavigationProvider.test.tsx`: **17 suites, 138 tests passed** on the final code.
- `cd mobile && npm run typecheck`: **passed**.
- `cd mobile && npm run export:android`: **passed**, 2,830 modules bundled. Output: ignored `mobile/dist/android`.
- `git diff --check`: **passed**.
- Rendered real components with synthetic data via React Native Web at 380×542, 320×640 and 900×900. Header controls fit; Actions opens/closes, and the fifth entry scrolls into view at every size. No uncaught JavaScript errors. Web adapters emit native SVG accessibility-prop and pointerEvents compatibility warnings; these are not native application errors. Existing basket controls below the header were intentionally left unchanged.
- Screenshots and local QA baseline: `/tmp/lisno-configuration-header-qa/`. Browser rendering does not replace device QA: no physical iOS/Android run or native installation was performed. Native event sequencing is covered by regression tests; Android compilation is verified.
- No dependencies added, backend/API changes, migrations, production mutations, commits, pushes or deployments performed. Unrelated pre-existing work preserved.
