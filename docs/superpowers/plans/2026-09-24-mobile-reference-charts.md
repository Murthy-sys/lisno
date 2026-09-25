# Mobile reference graphs task plan

Specification: [design](../specs/2026-09-24-mobile-reference-charts-design.md). Mode A; further gates waived by user.

Implementation, integrity review, native Android checks and final export complete. Known unrelated contract-inventory test failure and unrun platform checks are recorded below.

1. Primary: capture dirty status/diff at `/tmp/lisno-mobile-reference-charts-20260924`, settle source contracts and optional selectedDayId, preserve current work.
2. Graph implementer (parallel): owns only new `charts/ReferenceStatusCharts.tsx`, its focused test/geometry helpers as needed. Exports ProjectStatusLandscape and CostCompositionGauge using StageDatum values and centerDisplay, optional height. Proportional truthful data and scalable native legends (AC1,2,5).
3. Entry-theme implementer (parallel): owns onboarding source/tests, brand startup source/test, app config/tests and native splash resources where required. Does not edit root layout or shared token files. Resolve theme mismatch without changing onboarding/session behavior (AC4,5).
4. Primary (parallel): owns new finance-cylinder source/tests, DashboardCharts wrappers/exports, SuperAdminMobileDashboard integration/tests, shared chart tokens and any selected-day contract. Preserve dates, paise/sign, exact snapshot guides and navigator (AC3,5).
5. Integrate, focused tests and actual native visual checks; resolve findings. Independent integrity review after writers complete, then verification runner on final integrated worktree. Archive task-only runtime log suffixes and preserve unrelated dirty work.
6. Record exact checks, native artifacts, compiled splash behavior and limitations; final handoff. No dependencies, commits, backend mutation or deployment.

## Implementation outcome

- Added `ReferenceStatusCharts.tsx` / `referenceStatusGeometry.ts` for proportional project hills and cost-share gauge, plus focused regression coverage.
- Added `FinanceCylinderChart.tsx` and focused coverage. Existing dashboard chart exports remain compatible. Daily cylinders share one signed scale and synchronize with the existing exact-value day navigator.
- Updated dashboard consumers, native legends and recorded-cost explanatory copy. Approved snapshot values remain separate from daily ledger values.
- Themed startup and all three onboarding scenes with forest/cream. Corrected stale purple Android splash/icon resources to `#2f3a2a`; Expo root background uses the same existing brand constant.
- No new dependencies, backend contracts, persistence, session or onboarding-completion changes.
- Temporary fixture route removed after native QA; generated router types are clean. Nonzero chart screenshots use explicitly labeled QA fixtures. Actual dashboard captures retain real backend values.

## Verification evidence

- Independent integrity review: no confirmed defects in source lineage, paise/sign/availability handling, chart scaling/selection, gauge denominator or onboarding guards.
- Focused integrated checks: **142 tests passed in 20 suites**; mobile typecheck passed. Includes unequal data, zero/missing/negative values, long amounts, measured layout, enlarged text, 7/90-day reachability, dashboard selection and entry behavior.
- Native Android debug build: `./gradlew :app:assembleDebug`, **BUILD SUCCESSFUL**, 416 tasks, 2m52s. Installed locally with `adb install -r`, preserving app data/session.
- Cold launch recorded and inspected: green native splash and readable system areas; all three onboarding slides checked using an isolated temporary route without resetting preferences.
- Native chart screenshots inspected at phone width and 1.5 font scale. Actual 7/90-day previous-day and cylinder-selection checks passed. Font scale restored and app returned to the dashboard.
- Artifacts: `/tmp/lisno-mobile-reference-charts-20260924`; focused logs and final export evidence under `final-verification/`. Native navigation assertions: `native-navigation-result.json`.
- `git diff --check` passed. No lint script exists. Native iOS and physical-tablet rendering were not run; adaptive width cases are covered by component tests. No production operations, migrations, commits or pushes.
- Concurrent navigation/glass-selection changes belong to separate work and were preserved. Final source hashes confirm product sources stayed stable through full-suite verification and export; a separate navigation test changed during the full suite.
- Full mobile suite (`npm test -- --runInBand --forceExit --json --outputFile=/tmp/lisno-mobile-reference-charts-20260924/final-verification/full-tests.json`): **674 passed, 1 failed**, 73 suites. The existing `scripts/contract-drift.test.ts:71` failure expects 224 protected operations while the backend has 227. No chart/theme failure. Passing ChatGroupInfo and onboarding tests emitted React `act(...)` warnings.
- Final Android export passed after preview removal: **2,738 modules, 37 assets, 8.2 MB Hermes bundle**, output `/tmp/lisno-mobile-reference-charts-20260924/android-export-final`. Final `npm run typecheck` passed.
- Task export-log suffix was archived and removed by exact match; prior log content and the shared Metro log were preserved. No preview route or generated preview types remain.
