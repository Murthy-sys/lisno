# Mobile architectural splash implementation plan

Specification: [Architectural splash design](../specs/2026-10-16-mobile-architectural-splash-design.md).

Specification and task plan approved by the user on 2026-10-16. Mode A selected. Artwork, integration, review, and available verification completed. Native device startup remains unverified because no device/emulator was connected.

## Scope and ownership

Implement the approved entrance in the existing `StartupBrand`, using installed React Native Animated and SVG capabilities. Preserve immediate startup routing, the native splash handoff, ordinary `BrandLoader` consumers, and all previous production-service/release-build changes. No dependencies or native configuration changes.

Before writers start, capture `git status --short` and the current diff for the targets below. Reconcile any new overlapping changes before editing.

## Dependency-ordered tasks

1. **Create four decorative SVG motifs.** Artwork owner: new `mobile/src/ui/StartupArtwork.tsx` only. Provide sofa/lamp, floor plan, building frame, and construction tools in the approved cream/sage palette. Export a small presentation component accepting a motif kind and size; use consistent local view boxes and keep artwork inaccessible to screen readers. No motion, routing, or shared-token edits in this slice. Covers specification requirements 1, 2, and 8.

2. **Integrate startup composition and entrance.** Primary agent owns `mobile/src/ui/brand.tsx` and `mobile/src/ui/brand.test.tsx`. Place the existing wordmark in the center, arrange motifs around it, and retain one loading announcement below. Stagger native-driver opacity/translation/scale motion over approximately 1.1 seconds, once per mounted presentation. Bound the composition by available width and height. Reuse the established conservative reduced-motion preference handling for startup; unknown/error/enabled preferences remain static. Cancel animations on unmount and preference changes. Do not tie navigation to animation completion or change ordinary loaders. Covers requirements 1–4 and 6–8.

3. **Review and verify the integrated result.** Primary agent owns final reconciliation, verification, and this plan's evidence. Inspect rendered entrance, intermediate, settled, and static states in narrow portrait and short landscape; use a temporary preview if necessary and record its location. Inspect Android startup if a device/emulator is available. Run the focused checks below and fix confirmed failures within scope. Covers every acceptance criterion, including unchanged native handoff and startup routing.

## Parallel execution boundaries

- In Mode A, a native Codex worker can implement task 1 while the primary agent implements task 2 against the agreed motif interface. The worker owns only `StartupArtwork.tsx`; the primary owns composition, integration, and tests. Share the exact interface before concurrent edits. Both must preserve unrelated edits.
- In Mode B, the primary agent completes both slices inline.
- Task 3 begins after both implementation slices are integrated. Keep review and verification proportional to this localized UI change.

## Focused verification

- Add meaningful branding coverage for one loading announcement, static unknown/enabled/failed motion preferences, preference changes, and cancellation on unmount. Confirm the artwork is decorative and does not duplicate the wordmark or message.
- Run from `mobile/`: `npm test -- --runInBand src/ui/brand.test.tsx src/core/onboarding/startupRouting.test.tsx src/core/onboarding/welcomeRoute.test.tsx`.
- Run from `mobile/`: `npm run typecheck`.
- Run from `mobile/`: `npx expo export --platform android --output-dir /tmp/lisno-architectural-splash-android`.
- Render at approximately 320 × 568 and 640 × 360, checking fitting, central logo clarity, message readability, settled state, and reduced motion. Verify fast readiness still redirects immediately using the existing startup tests.
- Run repository `git diff --check` and inspect final status/diffs. Report unavailable device checks explicitly. Do not claim runtime visual verification from unit tests alone.

## Completion and limits

Record changed files, exact check results, visual evidence paths, and any remaining limitations. No deployment, production writes, installation on a personal device, staging, commits, or pushes are part of this task. Rebuilding release APK/AAB artifacts can follow if requested; the approved work validates the updated Android JavaScript bundle.

## Implementation and verification evidence

- Artwork worker added `mobile/src/ui/StartupArtwork.tsx`; primary updated `brand.tsx` and `brand.test.tsx`. Four vector motifs emerge with staggered native-driver transforms/opacity over 1.1 seconds, then remain static. The existing logo stays visible and the loading message has one progressbar announcement.
- The composition uses measured container/message dimensions, while the existing reduced-motion hook handles unknown/failed preferences. Ordinary loaders, startup routes, native splash configuration, environment, and release setup are unchanged by this task.
- Independent integrity review: no actionable findings in animation lifecycle, accessibility, sizing, or startup routing.
- Focused Jest command above: **3 suites, 18 tests passed**. Evidence: `/tmp/lisno-architectural-splash-tests.log`.
- `npm run typecheck`: **passed** after correcting the subscription mock's type in the new test.
- Android export command above: **passed**, 3,028 modules bundled. Output: `/tmp/lisno-architectural-splash-android`; export log copied there. Expo's generated modification to the previously clean tracked runtime log was removed.
- `git diff --check`: **passed**. Existing dirty files from the production-service/release-build work were preserved.
- `adb devices`: no connected devices/emulators. Actual native Android startup remains unverified; no APK/AAB rebuild or device installation performed.
- Rendered preview verification **passed** using the actual component through React Native Web: portrait 320 × 568 entrance/intermediate/settled states, landscape 640 × 360 settled state, and reduced-motion states at both sizes. All four illustrations and the wordmark remain clear with no overlap or clipping. Each layout exposes one progressbar announcement.
- Measured portrait artwork: 272 × 272 at (24,127), message within y=419–441. Landscape artwork: 270 × 270 at (185,24), message within y=314–336. Both fit within the viewport.
- Visual evidence under `/tmp/lisno-architectural-splash-preview`: `portrait-start.png`, `portrait-middle.png`, `portrait-settled.png`, `portrait-reduced.png`, `landscape-settled.png`, and `landscape-reduced.png`. Primary personally inspected intermediate/settled portrait and final landscape/reduced screenshots.
- Browser harness emitted React Native Web compatibility messages for native SVG accessibility props/transform origin, pointer-events deprecation, and native-driver fallback to JavaScript. No thrown runtime exceptions were observed. The preview verifies composition and motion appearance, not native-driver execution on Android.
- No dependencies, runtime source configuration, routes, signing, or release scripts changed. No external mutations or publication occurred. The existing APK/AAB artifacts predate this animation and require the usual Gradle rebuild to include it.
