# Configuration currency crash and feature recovery plan

Approved specification: [Configuration render recovery](../specs/2026-10-16-mobile-configuration-render-recovery-design.md).

Specification and task plan approved on 2026-10-16; user selected Mode A. Tasks 1–5 are finished with the focused evidence below. Native Configuration interaction in an installed app remains unverified.

## Scope and invariants

Fix the confirmed BigInt-to-Intl compatibility error and contain feature render failures inside the existing navigation scaffold. Preserve exact paise, authorization, session/runtime ownership, save/discard safeguards, and existing release/splash work. No dependency, API, persistence, or financial-calculation change.

Capture current status and per-target diffs before writers start. Existing dirty paths include prior mobile environment/Gradle/README/splash files, their documentation/scripts, and `mobile/.expo/dev/logs/start.log`. Do not overwrite those changes or retain new incidental runtime-log edits.

## Dependency-ordered work and ownership

1. **Fix the shared formatter and prove exact output.** Formatter owner: `shared/knowledge/knowledgePresentation.ts` and `frontend/src/features/ai-estimator-knowledge/knowledgePresentation.test.ts` only. Convert the already-bounded whole-rupee BigInt quotient to Number at the Intl call; retain exact remainder formatting and input validation. Add coverage that rejects BigInt formatter arguments and verifies exact output at ordinary values and the upper safe-integer boundary. The test must exercise the formatter actually used by the module, rather than a disconnected mock. Covers specification acceptance criterion 1.

2. **Implement feature render containment.** Recovery owner: new `mobile/src/ui/FeatureErrorBoundary.tsx` and its focused test only. Agree the minimal interface before delegation: children and an `onLeave` callback; the parent controls reset through a scope key. Use existing native UI primitives for a readable fallback with `Try again` and `Go back` actions. Explain possible loss of unsaved edits. Retry explicitly remounts content; repeated faults remain contained. Do not replay writes, expose raw errors, introduce logging services, or suppress development diagnostics. Unit tests cover successful retry, repeated failure, exit action, accessible names, and synthetic sensitive text remaining absent from the UI. Covers criterion 3.

3. **Integrate recovery and reproduce the reported transition.** Primary owns `mobile/src/app/feature/[featureId].tsx`, new `mobile/src/features/workspace/FeatureRoute.test.tsx`, and a focused Configuration regression test under `mobile/src/features/knowledge/`. Place the boundary around feature content inside `AdaptiveAppScaffold`, after existing authorization decisions. Reset it using feature/resource and environment/session identity. Wire an exit through the existing navigation policy, with a permitted destination when no prior history exists. Verify the scaffold survives, failed children release navigation guards, route/session changes reset the fallback, and unauthorized content still never mounts. Use real Configuration editor components and a populated saved-price fixture under an Intl implementation that rejects BigInt; repeatedly switch Design → Basket closure priority → Mode → Design and assert exact displayed prices. Retain existing save/discard/conflict coverage. Covers criteria 2 and 3.

4. **Review the integrated change.** After all writers finish, review precision bounds, common formatter consumers, recovery scope, authorization order, navigation-guard cleanup, retry behavior, and unsaved-edit messaging. Resolve confirmed findings before final checks. No unrelated refactoring or global exception swallowing.

5. **Verify and record results.** Run the checks below against the integrated result; inspect the fallback in a mobile-size rendered preview with retry and exit interactions. Record actual evidence and remaining device limitations in this plan. Covers criteria 4 and 5.

## Parallel execution

- Mode A: tasks 1 and 2 can run concurrently with explicit non-overlapping file ownership. The primary prepares task 3's reproduction tests and route integration against the agreed boundary interface, then reconciles all changes. Workers must preserve others' work and raise scope conflicts rather than edit outside their ownership.
- Mode B: the primary implements the same slices inline.
- In Mode A, use an `integrity_reviewer` for task 4, then a `verification_runner` for task 5 after review fixes finish. In Mode B, perform those stages inline. Final verification must observe the integrated worktree.

## Focused checks

- Establish the formatter regression fails on the original code with `Cannot convert BigInt to number`, then passes with the fix. Include 0, 1, 99, 100, 101, 12345678, `Number.MAX_SAFE_INTEGER`, adjacent upper-bound values, and invalid inputs. Assert exact fractional paise and Indian grouping.
- From `mobile/`, run focused Jest coverage for the new boundary, route integration, and Configuration crash reproduction, plus existing `KnowledgeItemWorkspace`, `KnowledgeDesignEditor`, `KnowledgeModeEditor`, `KnowledgeQualityEditor`, `KnowledgeRecommendationsEditor`, and scaffold navigation tests. Exercise real tab panels in the dedicated crash test so mocked children cannot hide the failure.
- From `frontend/`: `npm test -- src/features/ai-estimator-knowledge/knowledgePresentation.test.ts src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts`.
- Run `npm run typecheck` from both `mobile/` and `frontend/`.
- From `mobile/`: `npx expo export --platform android --output-dir /tmp/lisno-configuration-render-recovery-android`.
- Render a synthetic failed feature at a narrow mobile viewport. Check fallback readability, accessible retry/exit controls, retained scaffold navigation, successful recovery, and persistent-error containment. Keep temporary harnesses/screenshots under `/tmp/lisno-configuration-render-recovery`; use locally installed browser tooling to avoid unnecessary downloads.
- Check Android directly if a device/emulator is available. Distinguish native verification from a browser preview or simulated Intl restriction; do not block the confirmed formatter fix on a device connection.
- Run `git diff --check` and inspect final status/diffs. Broaden checks only when failures or shared-consumer risk justify it.

## Handoff

Report the formatter fix, recovery behavior, affected files, exact passing checks, temporary evidence paths, and any native-device gap. No migration, production mutation, deployment, staging, commit, or push is included. Existing APK/AAB files require the usual Gradle rebuild to include these changes; publishing or installing them is outside this approved implementation scope.

## Implementation and verification evidence

- Shared formatter now passes only the exact, bounded whole-rupee quotient as Number to Intl. BigInt paise remainder and invalid-input rejection remain intact. The new test reproduced `Cannot convert BigInt to number` before the fix. At the upper accepted boundary, output remains `₹9,00,71,99,25,47,409.91`.
- `mobile/src/ui/FeatureErrorBoundary.tsx` and the feature route contain descendant render failures beneath the existing scaffold. Explicit retry remounts content; exit uses existing Back policy then an authorized alternate destination. Recovery keys cover feature/project and environment/session/user/role. Unsaved-edit loss is disclosed; raw errors are absent from the fallback.
- New boundary, route, and real-editor Configuration tests cover retry, persistent faults, guard cleanup, shell retention, access checks, scope changes, and 18 transitions with populated unequal prices under BigInt-rejecting Intl. No writes occur in the transition regression.
- An independent integrity review found no confirmed defects. The real Back provider and policy were inspected; route integration tests mock the hook, with existing provider/policy suites included in final verification.

Final checks, all exit 0:

```sh
# mobile/: 249 tests, 11 suites
npm test -- --runInBand src/ui/FeatureErrorBoundary.test.tsx src/features/workspace/FeatureRoute.test.tsx src/features/knowledge/KnowledgeConfigurationCrash.test.tsx src/features/knowledge/KnowledgeItemWorkspace.test.tsx src/features/knowledge/KnowledgeDesignEditor.test.tsx src/features/knowledge/KnowledgeModeEditor.test.tsx src/features/knowledge/KnowledgeQualityEditor.test.tsx src/features/knowledge/KnowledgeRecommendationsEditor.test.tsx src/navigation/AdaptiveAppScaffold.ui.test.tsx src/navigation/BackNavigationProvider.test.tsx src/navigation/backNavigationPolicy.test.ts

# frontend/: 80 tests, 2 suites
npm test -- src/features/ai-estimator-knowledge/knowledgePresentation.test.ts src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts

# mobile/ and frontend/, each
npm run typecheck

# mobile/
npx expo export --platform android --output-dir /tmp/lisno-configuration-render-recovery-android

# repository root
git diff --check
git status --short
```

The first frontend typecheck found a new test-only getter-spy overload error. Replacing that spy with descriptor override/restoration fixed it; frontend tests and typecheck then passed. The pre-existing stale section-vocabulary assertion now includes the already-supported Design key. Android export generated a 12 MB Hermes bundle and assets; only terminal color-setting warnings were reported.

The actual fallback was inspected at 320×568 using a production React Native Web preview with local fonts and a representative shell. Persistent failure remained contained; clearing the synthetic fault and clicking Try again displayed recovered content; Go back displayed the workspace. Controls and text fit without horizontal clipping. The real scaffold's retention and guard cleanup are covered by native-renderer integration tests. Expected synthetic errors remained in the development console; no global suppression was added.

Evidence: `/tmp/lisno-configuration-render-recovery/`, including test/typecheck/export logs, the temporary preview harness, browser snapshots, and `fallback-320.png`. Formatter red/green logs also exist at `/tmp/lisno-configuration-render-recovery-money-{red,green}.log`. Preview browser/server were stopped. Export-generated tracked log edits were restored to their captured baseline; the already-dirty `mobile/.expo/dev/logs/start.log` was preserved.

ADB found an emulator running the existing development client. The native Configuration flow with this fix was not exercised, and no new APK/AAB was built or installed. The device UI inspection artifact was removed. Rebuild from `mobile/android/` using `./gradlew assembleRelease` or `./gradlew bundleRelease` to include these changes. Release signing remains as previously configured.

No dependencies, lockfiles, API contracts, persistence, backend/OCR code, migration, production data, deployment, commit, or push changed. Full repository suites and a frontend production build were not run for this bounded change. There is no lint script.
