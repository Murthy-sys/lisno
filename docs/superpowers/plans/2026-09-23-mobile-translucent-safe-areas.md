# Mobile translucent safe-area finish plan

Spec: ../specs/2026-09-23-mobile-translucent-safe-areas-design.md. User approval waiver and parallel execution preference remain in effect.

Parent task: implemented; integrity review and scoped verification complete.

Color correction implemented: the user rejected the cream/white appearance. Restore the existing dark sage/olive hue in shared chrome layers, wordmark, foregrounds and focused system icons while preserving the verified safe-area layout. Primary owns this bounded correction; independent review checks composited contrast/status-bar modes. Verify focused chrome/navigation tests, typecheck and actual Android appearance. Baseline: /tmp/lisno-mobile-sage-transparency-20260923. Standing approval waiver applies.

1. Primary captures baseline and owns shared semantic chrome tokens plus ui/ChromeSurface.tsx and its preference/state checks. Use static layered native/SVG surfaces with opaque accessibility fallback.
2. Independent navigation implementer owns navigation/AdaptiveAppScaffold.tsx and its UI tests. Consume ChromeSurface, separate safe-area ownership at top/bottom/sides, switch foregrounds and selected styling, retain all navigation/Back/send guards. No changes to shared UI or chat.
3. Read-only design auditor checks auth/onboarding/immersive safe-area ownership independently; primary resolves integration implications.
4. After writers finish, integrity review checks inset/contrast/status-bar and behavior invariants. Primary performs Android phone/tablet visual QA and verifies display settings are restored.
5. Final focused navigation/chat/appearance tests, typecheck, Android export and diff check. Existing unrelated contract-drift failure is outside scope. Document exact results and native coverage limits.

No commits, deployments, migrations or production actions. Preserve existing dirty root StatusBar fix and runtime logs.


## Completion evidence

- Shared ChromeSurface uses a static SVG under a translucent tint, decorative touch passthrough and an opaque Reduce Transparency fallback with listener cleanup and late-read protection.
- Scaffold owns safe insets once per edge. Phone tabs remain icon-only; tablet rail remains labeled. Existing Back and pending-send guards are intact.
- Root system icons now default dark for light surfaces. Dark startup/configuration screens and the visible image viewer supply light overrides; focused scaffold screens supply dark overrides.
- Integrity review found no P1/P2 issue; calculated muted foreground contrast is at least 4.85:1 and main ink at least 12.72:1.
- Focused navigation/UI/chat tests: 173/173 across 10 suites. Typecheck, Android export and diff check passed. No new dependency or native build configuration change.
- Android phone 411dp loaded dashboard, tablet 864dp loading-state shell, and landscape 923dp loaded dashboard were visually inspected. Safe-area clearance and header/rail/tab visibility passed. Density and rotation settings were restored. Initial resizing captures preceded app reload completion; valid replacement captures were inspected.
- iOS device/Reduce Transparency setting was not exercised natively; preference changes/races are covered by rendered tests. Full suite was not repeated for this bounded presentation change; the preceding task's unrelated 224/227 operation inventory mismatch remains outside scope.
- Evidence and exact commands: /tmp/lisno-mobile-safe-area-finish-20260923/final-verification/verification-report.md. No commit, deployment, migration or production mutation performed.


## User-requested sage color correction

The rich existing #2f3a2a sage hue is retained in the translucent layer, opaque accessibility fallback, and all sheen stops. Removed the cream/white surface wash. Header wordmark and foregrounds are light; active tabs have a translucent sage fill with a defined sage outline. Focused scaffold status icons are light, while immersive light chat keeps dark icons. Safe-area geometry is unchanged.

Focused chrome/navigation tests: 16 passed. Typecheck passed. Actual Android screenshot inspected at /tmp/lisno-mobile-sage-transparency-20260923/android-sage.png. Independent composited contrast: main ink at least 7.55:1, muted ink 5.39:1, selection border 3.09:1. iOS was not tested for this correction. Android export validation is recorded in the correction's verification report.
