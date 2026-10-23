# Mobile splash motion and theme task plan

Date: 2026-10-21
Status: Approved by the user on 2026-10-21. Mode A selected. Independent motion work, integrity review, and verification of the existing theme are finished. Task 2 and palette-dependent implementation/verification remain pending the missing reference image. The full request is not complete.

Source of truth: [Approved specification](../specs/2026-10-21-mobile-splash-motion-theme-design.md).

## Outcome and constraints

Deliver the approved sequence: surrounding artwork rotates, converges into one point, the original upright Lisno symbol emerges, moves right, and emits LISNO letters to its left. Match the splash theme to the supplied reference, preserve launch resilience, and verify the rendered and native handoff behavior.

The current worktree already implements the broad choreography. Establish actual gaps before editing; retain working behavior and the original logo geometry. The reference image remains unavailable. Approval of this plan does not select a replacement palette or waive that missing input.

Keep only one parent task in progress. Mode A permits explicitly owned, independent subtasks within it; Mode B performs all work, review, and verification inline.

## Task 1: Establish the current baseline

Owner: primary agent. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC1–AC3, AC5, AC7 baseline evidence.

- Refresh `git status --short`, capture per-target tracked diffs, and snapshot relevant untracked startup sources/assets into temporary QA storage before any writer starts. Distinguish existing changes from this request's edits. Do not stage, revert, or reformat unrelated work.
- Run the existing focused choreography, brand, logo, startup lifecycle, and route-gate tests to identify pre-existing failures.
- Render the actual startup components and capture the current rotation, convergence, symbol reveal, rightward travel, letter emergence, and final hold. Observe live playback as well as deterministic frames.
- Inspect the native handoff configuration and identify the local QA build/test target. Do not assume a connected device or installed binary contains current sources.
- Record concrete deficiencies against the specification. If a phase already meets the requirement, retain it. Classify any visual mismatch separately from an older installed binary or startup interruption.

Mode A parallel opportunity: independent read-only motion/visual and native-handoff audits may run together. Neither auditor owns source changes. The primary reconciles their findings before assigning writers.

## Task 2: Resolve the reference palette and settle file ownership

Owner: primary agent. Dependencies: Task 1; the image is required for palette decisions. Acceptance: AC4 definition and bounded implementation scope.

- Inspect the reattached reference image and record the selected background, foreground, secondary tones, and system-bar treatment in the specification. Do not infer the new image from historical olive-reference notes.
- Compare the four existing illustrations against that background and identify visible color seams or incompatible olive bases. Reuse the illustrations unless a limited adjustment is demonstrated and consistent with the approved scope.
- Confirm whether the reference calls for a solid background or subtle tonal variation, including the existing hardcoded gradient stop and decorative shapes.
- Update the specification for the supplied palette. Request revision approval only if this introduces a material change to the approved behavior or scope; do not reopen already settled decisions otherwise.
- Assign explicit write boundaries using the refreshed baseline. Every worker must preserve others' changes and return shared-file needs to the primary.

Missing-image handling: independent motion work in Task 3 may proceed after Task 1 while palette input is pending. Native/theme writes and AC4 remain pending. Do not count elapsed time or plan approval as a color selection.

## Task 3: Apply bounded corrections

Owner: primary agent for shared presentation/integration. Dependencies: Task 1 findings; Task 2 palette for color-dependent work. Acceptance: AC1–AC6.

| Slice | Owned paths | Work and completion evidence |
| --- | --- | --- |
| Motion geometry | `mobile/src/ui/startupAnimation.ts`, `mobile/src/ui/startupAnimation.test.ts` | Correct only demonstrated orbit, convergence, phase ordering, timing, or swept-bound issues. Keep the symbol upright, preserve the approximate three-second sequence, and test externally meaningful ordering/bounds where existing coverage is insufficient. |
| Shared presentation and theme | Primary owns `mobile/src/ui/StartupBrand.tsx`, `mobile/src/ui/startupTheme.js`, `mobile/src/ui/brand.test.tsx`; owns `StartupLogo.test.tsx` only if coverage needs adjustment | Apply the recorded palette, remove or update hardcoded backdrop tones, refine symbol travel and letter clipping/origin as demonstrated, and ensure final spacing and accessible status. Preserve `StartupLogo.tsx` source paths and existing artwork. |
| Native splash consistency | `mobile/app.config.ts`, `mobile/app.config.test.ts`, `mobile/scripts/native-splash-resources.test.mjs`, splash-specific generated Android resources | Consume the primary's settled theme; align native day/night launch and activity backgrounds. Preserve transparent unbranded launch artwork, launcher assets/colors, and unrelated Expo/native settings. Generate resources through the existing scoped path or a temporary fixture; avoid broad prebuild changes to the dirty worktree. |
| Conditional startup handoff correction | Primary owns `mobile/src/ui/StartupExperience.tsx`, `StartupExperience.test.tsx`, `StartupRootSetup.test.tsx`, `mobile/src/core/startup/*`, and startup route-gate sources/tests | Edit only for a reproduced failure. Preserve once-per-launch playback, ready-route holding, conservative motion preferences, bounded fallbacks, error recovery, and background/resume behavior. Never change destination/identity logic. |

Shared invariants: native opacity/transform animation; no per-frame React state; locally bundled assets; exact original logo; no new dependencies; no general theme changes; no navigation deadlock or replay.

Parallel ownership in Mode A: motion geometry and native-resource work can run independently after the theme contract is settled. The primary alone edits `StartupBrand.tsx` and `startupTheme.js`; a native worker reads but never writes those files. Any discovered contract dependency returns to the primary. Theme-dependent background rendering waits for the palette. In Mode B these slices are sequential inline work.

## Task 4: Integrate and review

Owner: primary; `integrity_reviewer` in Mode A after all writers finish. Dependencies: relevant Task 3 slices complete. Acceptance: AC1–AC7 review.

- Reconcile every change with the approved specification and original baseline. Confirm there is no unintended general-theme, launcher, route, authentication, or asset replacement change.
- Review phase transitions and letter origin/clipping, native dismissal versus playback start, completion/timeout cleanup, safe-area treatment, accessibility, and reduced-motion/error paths.
- Confirm Expo configuration and generated Android resources agree for day/night appearance and preserve launcher branding. Check iOS configuration without claiming unobserved native iOS behavior.
- Resolve confirmed findings before final verification. In Mode B the primary performs the same review inline.

## Task 5: Verify the integrated result and hand off

Owner: `verification_runner` in Mode A after review fixes and writers finish; primary in Mode B. Primary personally reconciles rendered evidence and final diff. Dependencies: Task 4. Acceptance: all ACs.

### Focused automated checks

From `mobile/`:

```sh
npm test -- --runInBand src/ui/startupAnimation.test.ts src/ui/brand.test.tsx src/ui/StartupLogo.test.tsx src/ui/StartupExperience.test.tsx src/ui/StartupRootSetup.test.tsx src/core/startup/StartupPresentation.test.tsx src/navigation/StartupRouteGate.test.tsx src/core/onboarding/startupRouting.test.tsx src/core/onboarding/welcomeRoute.test.tsx app.config.test.ts
npm run typecheck
node --test scripts/native-splash-resources.test.mjs
npx expo export --platform android --output-dir /tmp/lisno-splash-motion-theme-2026-10-21/android-export
```

- AC1–AC3: animation ordering/bounds and original-logo checks, paired with live rendered motion; mocks alone do not establish visual fidelity.
- AC4: configuration and generated-resource checks paired with reference comparison and native handoff evidence.
- AC5: lifecycle, root setup, route-gate, onboarding-routing, and recovery checks. Extend only missing meaningful scenarios for changed behavior.
- AC6: responsive and accessibility rendering below.
- AC7: typecheck, Android export, final diff/status, and native QA below. There is no repository lint script; do not report lint as passed.

If native/build-environment files are affected, also run `node --test scripts/native-build-environment.test.mjs`. Broaden testing only for changed shared behavior, failures, or unresolved concerns. Final verification must observe the integrated worktree, not concurrent writes.

### Rendered and native checks

- Render the actual components at 320 × 568, 390 × 844, and 640 × 360 logical sizes, plus enlarged text. Inspect complete artwork bounds, final wordmark spacing, message layout, and safe areas.
- Capture phase frames and live playback, including the source point of each emitted letter. Confirm all groups converge together and no symbol rotation or premature branding appears.
- Verify one accessible startup status, hidden decorative content, blocked interaction with covered routes, and reduced-motion bypass. Verify fast/slow initialization, supported deep links, timeout/error recovery, and background/resume without replay.
- Compare against the supplied image and verify background continuity in light and dark device appearance.
- For native appearance, build a fresh local standalone QA Android binary from the integrated native resources using the existing build environment. Avoid deployment and production signing/publishing actions. Install only on an identified, authorized local test target; do not uninstall, clear data, or disturb an unrelated running project.
- Record a native cold launch including the operating-system surface and React handoff. A browser preview, Jest pass, or Android export cannot prove this behavior. If no suitable target/build is available, report the exact remaining native limitation and leave that verification incomplete.

### Hygiene and report

From the repository root, run `git diff --check` and inspect `git status --short` plus the request-specific diff against the captured baseline. Keep QA captures/logs and exports under `/tmp/lisno-splash-motion-theme-2026-10-21/`; do not commit runtime/build artifacts. Preserve pre-existing logs and unrelated files.

Report actual changes, principal decisions, affected files, exact check results, rendered/native evidence, unrun checks, and remaining limitations. No migration, backend change, dependency addition, staging, commit, push, production installation, or deployment is part of this task.

Do not mark the task complete while reference matching or required native verification remains unresolved.

## Approval boundary

Specification and task plan are approved, and the user selected Mode A. The missing image remains a separate dependency for theme matching.

## Execution evidence

- Preserved initial dirty status, tracked mobile diff, and relevant dirty/untracked files under `/tmp/lisno-splash-motion-theme-2026-10-21/baseline` before any writer starts.
- Independent read-only audits assigned for choreography and native handoff/lifecycle. Temporary visual-preview work owns only the QA directory; it does not edit application sources.
- Existing focused baseline: the ten suites listed in Task 5 passed, **97 tests**, before this request's application edits. Log: `/tmp/lisno-splash-motion-theme-2026-10-21/baseline-tests.log`.
- No color change has been selected or applied. Historical olive colors remain the baseline pending the reference image.
- Rendered baseline at 2,400 ms confirmed the emerging N crossed into the symbol's left leaves. Changed only the letter clipping boundary from 40% to 50% of symbol width from its center, aligning it with the symbol View's left edge. Existing phase timing, paths, assets, and startup lifecycle are preserved.
- Added clipping/emission regressions at 320 × 568, 390 × 844, and 640 × 360 in `brand.test.tsx`. The initial focused run passed 15 tests; final integrated verification follows.
- Independent integrity review found no confirmed defect in the bounded change and confirmed unchanged logo, lifecycle, native configuration, and theme against the captured baseline.
- Native splash-resource consistency check passed **7 tests** with unchanged configuration. The native audit identified emulator-5554 with Lisno Dev installed; discovery alone does not authorize replacing it.
- Standalone Android QA build succeeded using the existing development identity. Gradle required approved access to its cache outside the workspace sandbox. No native prebuild, clean, or app-data reset occurred.

### Final results for the motion portion

Changed application files:

- `mobile/src/ui/StartupBrand.tsx`: letter-reveal clipping now ends at the original symbol's left boundary, preventing the emerging N from crossing its leaves. Added a stable test ID for that clipping window.
- `mobile/src/ui/brand.test.tsx`: three viewport regressions verify the clipping boundary while letters are actively emerging.

Preserved the existing native-driven rotation/convergence/reveal timeline, exact logo paths, illustration assets, startup lifecycle, route behavior, configuration, and palette. No dependencies or lockfiles changed.

Checks on the integrated result:

| Check | Result |
| --- | --- |
| Ten focused Jest suites listed above | 100 tests passed; includes the three new regressions. |
| `npm run typecheck` from `mobile/` | Passed with no diagnostics. |
| `node --test scripts/native-splash-resources.test.mjs` | 7 tests passed; native configuration remained unchanged afterward. |
| `EXPO_OFFLINE=1 npx expo export --platform android --output-dir /tmp/lisno-splash-motion-theme-2026-10-21/android-export` | Passed; 3,043 modules, 12 MB Hermes bundle. Only terminal color-environment warnings. |
| `LISNO_APP_VARIANT=development ./gradlew assembleRelease` from `mobile/android/` | Passed in 55 seconds; 735 tasks, 97 executed. Existing Gradle deprecation warnings remain. |
| Supplemental actual-component React Native Web preview | 51 phase captures across 320 × 568, 390 × 844, and 640 × 360; no overflow. Live completion, reduced-motion cancellation, no replay, static loader, wrapped message, and emulated 200% text passed. No uncaught exceptions or failed final resource requests. Browser SVG/native-prop warnings are documented in the temporary report. |
| Android native playback | Fresh APK installed with `adb -s emulator-5554 install -r .../app-release.apk` after target-specific permission; installation succeeded and preserved app data. Recorded cold launches in light and dark appearance, then restored the original light appearance. |
| Native visual inspection | Personally inspected unbranded launch background, rotating artwork, convergence, original symbol reveal/rightward movement, emitted letters, and final composition. Letter overlap is resolved on Android. Captures are sampled emulator evidence, not an FPS benchmark or proof of every first-frame timestamp. |

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`, application ID `com.lisno.mobile.dev`, development signing, approximately 128 MiB. SHA-256: `307f306585e3f85a6b1a1869cc9646989d47a369d75e4c919643b356e25d7f2a`. This is a local QA build, not a production distribution artifact.

Evidence directory: `/tmp/lisno-splash-motion-theme-2026-10-21/`. Automated logs are `final-focused-tests.log`, `final-typecheck.log`, `final-android-export.log`, `native-resources.log`, and `android-build.log`. Supplemental visual report/captures are under `rendered/`; native captures are under `native-final/`. The first short native recording ended before the sequence finished on the slow emulator, so final inspection used extended captures. Preview server and its browser session were stopped after verification. Generated export log was restored to its exact clean baseline; pre-existing runtime logs remain untouched.

AC1–AC3: sequence and corrected letter emergence verified in component tests, rendered preview, and Android captures. AC5: lifecycle regression lane passed with existing implementation unchanged. AC6: requested width matrix/accessibility and enlarged text passed in supplemental rendering; native portrait inspected. Native landscape, native enlarged-text settings, iOS playback, physical-device performance, and the full mobile/backend/OCR suites were not run. No lint claim is made.

AC4 remains incomplete: no reference image has been received, and no theme color has been changed. AC7 is satisfied for the bounded motion fix; final palette verification must run after the image-driven theme change. No production deployment, migration, external messaging, staging, commit, or push occurred.
