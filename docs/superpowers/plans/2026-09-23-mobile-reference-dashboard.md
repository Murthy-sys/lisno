# Mobile reference dashboard task plan

Specification: [design](../specs/2026-09-23-mobile-reference-dashboard-design.md)

Mode A, approval gates waived by user. Implementation and Android verification complete; iOS device verification remains unrun.

1. Baseline and shared contract (primary): capture dirty status/diff and untracked ChromeSurface; reuse interior JPG; add bundled italic display font; scope dashboard radii/serif tokens. Baseline: `/tmp/lisno-mobile-reference-dashboard-20260923`.
2. Shared shell (navigation implementer): own only `AdaptiveAppScaffold.tsx` and its UI test. Dark top inset, identity/avatar, cream rounded content, floating labeled dock with cream bottom inset. Preserve routes and guards. Acceptance 1, 6, 7.
3. Hero/control card (dashboard chrome implementer): own only `features/dashboard/components/DashboardChrome.tsx` and its test. Optional `greeting`, `currentRangeLabel`, `previousRangeLabel`, `partialFinalDay` header props; optional `actionLabel`/`onAction` banner props. Asset at `mobile/assets/brand/dashboard-interior.jpg`; theme exports `display`, `displayItalic`. Acceptance 2, 3, 4, 7.
4. Overview integration (primary, parallel with 2/3): own SuperAdminMobileDashboard and tests; project/financial hierarchy, truthful project trend, ledger actions, keep detailed sections. Acceptance 4, 5.
5. Integrate and visually inspect (primary): reconcile changes, focused checks, inspect actual native phone/tablet/large text; fix spacing and interactions.
6. Independent integrity reviewer then verification runner: exact focused tests, typecheck, export, hygiene. Record outcomes/limits and final handoff. No commits, deployment or production mutation.

Writers share this worktree and must preserve unrelated edits. Shared files remain primary-owned. Tasks 2 and 3 safely run in parallel with 4 after task 1 settles contracts.

## Outcome (2026-09-24)

Tasks 1–6 complete. Shared shell, photo/serif hero, compact reporting controls, coverage action and project/financial overview are integrated. Existing detailed sections, backend values, role routes and Back guards are retained. Added no dependencies. Native inspection exposed a header gradient seam: ChromeSurface now measures the full container (including safe area) and resizes its SVG explicitly. A rotation-size regression test covers this correction. Home has matching visible/accessibility labels; compact dock labels fit at enlarged text.

- Final affected checks: 235/235 tests across 19 suites; typecheck passed; Android export passed (2,734 modules, 37 assets, 8.2 MB bundle).
- Full integrated suite before final copy/label polish: 644 passed, 1 existing failure. `scripts/contract-drift.test.ts` expects 224 protected backend operations while current inventory has 227. Final polish was covered by the repeated affected checks and fresh export.
- Actual emulator: portrait ~411dp, tablet ~864dp, font scale 1.5, 7D/30D reporting, comparison switch, coverage ledger, Projects/Back/Home. Settings restored. Back follows the existing native history, which included More; Home explicitly returns to dashboard. Recent ReactNativeJS warning/error capture was empty.
- Integrity review found a Home accessible-name mismatch; corrected and rechecked. No unresolved findings.
- `git diff --check` passed. Existing unrelated dirty work preserved. Export-generated tracked log suffixes were archived and removed with exact prefix/suffix checks; shared start.log retained.
- No iOS simulator/device run, deployment, commits, backend migration, seeding or production mutation.

Evidence: `/tmp/lisno-mobile-reference-dashboard-20260923/final-verification/verification-report.md`; final portrait `/tmp/lisno-mobile-reference-dashboard-20260923/android-portrait-final.png`; large text `/tmp/lisno-mobile-reference-dashboard-20260923/android-large-text-final.png`; tablet `/tmp/lisno-mobile-reference-dashboard-20260923/android-tablet.png`.
