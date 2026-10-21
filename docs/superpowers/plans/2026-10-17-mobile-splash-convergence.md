# Mobile splash: remove the separate native logo screen

Specification: [Realistic artwork, original Lisno reveal, and native launch correction](../specs/2026-10-17-mobile-splash-convergence-design.md). The user approved the native launch correction on 2026-10-19. This plan records that approval; the specification's pending-status sentence predates the approval.

Status: native correction specification and task plan approved; Mode A selected on 2026-10-19. N1–N2 complete; N3 independent integrity review in progress. Baseline: 72 existing dirty/untracked paths and 767 file hashes captured under `/tmp/lisno-native-splash-handoff-qa/`. The completed artwork revision and its evidence are archived below and do not verify this correction.

## Current outcome and constraints

Replace the extra dark Lisno launch screen with a plain `#46552F` olive native surface. Transition into the existing realistic artwork animation without a dark flash or early brand reveal. In normal playback the original Lisno symbol first appears after the artwork converges.

The approved specification's AC8 is the primary acceptance criterion. AC1–AC7 remain regression constraints: preserve artwork, animation order, original geometry, once-per-launch behavior, routing, recovery, accessibility, and bounded preparation.

Fresh evidence corrects one statement in the specification: the native Android sources/resources are **tracked**, although `mobile/.gitignore` also contains `/android`. `git ls-files mobile/android` confirms this. Preserve existing Gradle environment hooks and tracked native customizations. Do not use clean prebuild or regenerate the native project wholesale.

Implementation ownership clarification: the primary removes the stale blanket Android ignore rule so the two new native XML sources are visible to Git. The existing `android/.gitignore` continues to exclude build/cache/local configuration outputs. This is repository hygiene needed to deliver the source change, with no product behavior expansion.

Native configuration, Android launch resources, and a standalone QA APK build are in scope. Installation requires an explicitly authorized test target. No dependency/lockfile changes, launcher redesign, backend/API changes, environment-file edits, production installation, app-data reset, staging, commit, push, or deployment.

## Current ownership and parallel boundaries

| Owner | Exclusive write scope | Deliverable |
| --- | --- | --- |
| Native resource owner | `mobile/app.config.ts`, `app.config.test.ts`, new `assets/brand/startup-transparent.xml`, targeted Android splash drawables and `res/values*/colors.xml` / `styles.xml`; new `scripts/native-splash-resources.test.mjs`; `scripts/native-build-environment.test.mjs` only if fixture inputs need updating | Valid transparent native launch artwork, matched olive window/splash colors, preserved launcher resources, reproducible generated-resource checks |
| React handoff owner | `mobile/src/app/_layout.tsx`, `ui/StartupExperience.tsx`, `ui/StartupExperience.test.tsx`; `core/startup/StartupPresentation.tsx` and its test only if required for visible-frame readiness | Native dismissal after a laid-out surface, no native fade concealing initial artwork, bounded/idempotent handoff |
| Primary | Integration decisions, this plan, `mobile/.gitignore`, targeted native resource generation/copy integration after resource-owner handoff, APK build/inspection, authorized device QA, final reconciliation | One verified app launch path and truthful artifact/native evidence |
| Integrity reviewer | Read-only integrated sources and diffs | Findings against AC1–AC8 and preservation requirements |
| Verification runner | Read-only product sources; temporary outputs only | Integrated tests/build results and artifact/resource checks |

If inspection shows that an additional source file must change, the primary must explicitly assign it before edits. No two writers own the same file. All agents must preserve the shared dirty worktree and other writers' edits. Canonical logo geometry, the four realistic PNGs, destination routes, launcher mipmaps, Gradle/signing/environment helpers, and unrelated mobile screens are read-only by default.

## Current dependency-ordered tasks

### N1. Capture the current baseline and settle the handoff contract

Owner: primary. Prerequisites: task-plan approval and execution-mode selection. Covers AC4–AC8.

- Capture `git status --short`, relevant per-target diffs, and hashes/copies of all current dirty/untracked paths under `/tmp/lisno-native-splash-handoff-qa/`. The completed splash implementation is part of the baseline.
- Include tracked Android launch resources, launcher assets, native Gradle hooks, and existing runtime logs in preservation checks. Keep environment values, tokens, and customer data out of logs.
- Confirm installed Expo splash APIs and native resource generation behavior from local sources. The current Android module defaults to a 400 ms exit fade; explicitly disable that fade for this handoff rather than letting it cover the beginning of the React animation.
- Freeze the shared contract: olive native/window/preparation surfaces; transparent Android splash-only drawable; no native branding; one visible React intro; no change to authentication or destination selection; 1-second preparation and 4-second presentation deadlines remain bounded.
- Trace ordering between fonts, layout, preparation, native hide, and animation start. Do not use `StartupBrand play={false}` as a pre-intro placeholder, because it renders the completed logo. Use the existing plain olive preparation surface or a genuine initial artwork frame.
- Inspect available Android target/API level and current artifact/package/signature read-only. Record compatibility before proposing installation; do not install, launch, reset, or change device preferences at this task.

Exit: owned targets and baseline are fixed; no unresolved interface conflict.

### N2. Implement native appearance and React handoff

Dependencies: N1. The two slices can run in parallel in Mode A. Covers AC1–AC6 and AC8.

**N2A, native resources:**

- Use the installed splash plugin's Android drawable support with a small valid transparent XML resource. Remove the visible native logo image from the splash configuration. Keep the iOS configuration unbranded as well, without generating an iOS project or claiming iOS runtime verification.
- Set native splash and activity/window backgrounds to `startupTheme.background` in both device appearances. Keep `iconBackground`, launcher image paths, and destination-screen colors unchanged.
- Generate expected splash resources in an isolated temporary fixture using the installed configuration/plugin tooling. Apply only the reviewed splash/window resource changes to the existing tracked Android project. Do not overwrite Gradle files, package identity, permissions, signing, environment selection, or application code.
- Remove only obsolete splash density images replaced by the transparent resource. Verify that no remaining launch resource references the old visible logo and that `splashscreen_logo` resolves correctly.
- Add meaningful configuration/resource tests: light/dark olive backgrounds, transparent drawable validity, absence of early branding, launcher preservation, repeatable generation, and no stale density-specific logo taking precedence over the XML drawable.

**N2B, React handoff:**

- Configure native splash exit options once, early enough to avoid its default fade masking the artwork rotation.
- Retain native protection until the intended React surface has laid out. If the animation currently advances before that readiness, make the smallest ordering correction within the existing launch controller; do not add a second timer-driven intro or a completed-logo placeholder.
- Preserve session work concurrency, error bypass, reduced motion, timeout fallback, foreground/remount no-replay, cleanup, and one accessible loading announcement.
- Extend the integration tests for delayed layout/preparation, one native hide, visible initial animation ordering, rejected/stale hide completion, bypass, unmount/effect replay, and bounded fallback. Add a focused root setup test if needed to exercise actual native exit configuration.

Exit: both writers finish their assigned checks and report changed files; primary integrates and reviews the actual diff against N1.

### N3. Review the integrated correction

Owner: integrity reviewer in Mode A; primary in Mode B. Dependencies: N2. Covers AC1–AC8.

- Trace native launch theme → transparent drawable → activity background → laid-out React preparation/artwork → normal logo reveal.
- Check Android resource qualifier precedence, light/dark behavior, valid generated references, unchanged launcher assets, and reproducibility from application configuration.
- Check hide/start ordering, rejected async calls, effect replay, backgrounding, error/reduced-motion paths, and deadlines. Native API promise resolution alone must not be claimed as proof that a frame was displayed.
- Compare baseline hashes for unrelated sources, Gradle hooks, environment files, shared logo vectors, and artwork. Resolve confirmed findings before final verification.

Exit: no unresolved implementation finding; remaining proof gaps explicitly assigned to N4/N5.

### N4. Verify and build a fresh standalone QA APK

Owner: verification runner after review in Mode A, coordinated with primary for generation/build; primary in Mode B. Dependencies: N3. Covers AC7–AC8 and regression criteria.

From `mobile/`, run focused tests (including any new root setup test added by N2B):

```sh
npm test -- --runInBand app.config.test.ts src/ui/StartupExperience.test.tsx src/ui/brand.test.tsx src/ui/startupAnimation.test.ts src/ui/StartupLogo.test.tsx src/core/startup src/core/onboarding/startupRouting.test.tsx src/core/onboarding/welcomeRoute.test.tsx
node --test scripts/native-splash-resources.test.mjs
node --test scripts/native-build-environment.test.mjs
npm run typecheck
npx expo export --platform android --output-dir /tmp/lisno-native-splash-handoff-android
```

Run the full mobile test suite if launch-controller changes affect shared routing/lifecycle behavior or focused checks expose wider uncertainty. No lint script exists. Repeat only checks affected by subsequent fixes.

After synchronizing the targeted native resources, run from `mobile/android/`:

```sh
./gradlew assembleRelease
```

- Preserve existing Gradle environment selection and signing. Do not invoke the npm QA build wrapper, which performs broad prebuild. Do not change `.env*` files or force a production identity for this local QA build.
- Inspect the resulting APK's manifest/package, certificate, bundled JavaScript/artwork, compiled splash/background resources, and absence of an obsolete visible launch drawable. Record artifact path, size, SHA-256, and exact build result without exposing configured private URLs.
- Build output normally resides at `mobile/android/app/build/outputs/apk/release/app-release.apk`; copy the verified artifact and logs into the temporary QA directory for a stable review target.
- Confirm resources stay deterministic under repeated isolated generation. Compare unrelated baseline hashes, run `git diff --check`, and inspect `git status --short`.

Exit: source checks and the native build pass, the concrete APK is inspected, and the exact proposed device installation can be reviewed.

### N5. Verify native cold launch and hand off

Owner: primary. Dependencies: N4 and authorization for the exact installation target. Covers AC8; regression checks for AC2–AC6.

- Before an installation approval request, finish all source changes, checks, APK build, and artifact inspection. Present the concrete APK/package/signature and intended test target. Existing emulator `emulator-5554` is a candidate only if still available and compatible; do not assume authorization from its earlier read-only inspection.
- If installation has been explicitly authorized for that target in the session, proceed without requesting it again. Use replacement without uninstall/data clearing only when package/signature compatibility is confirmed. A mismatch is not permission to erase the existing app. Do not install on a physical device or production package under this plan.
- On the authorized compatible installation, record cold launch from before app start through the completed splash. Verify a plain olive initial surface, no separate dark/black Lisno screen, visible initial artwork rotation, convergence before logo reveal, and the final leftward letter emission. Stop captures before exposing private destination content.
- Verify light and dark system appearance, returning any changed test settings to their initial values. Check normal startup plus reduced motion, a warm/foreground return without replay, and short-screen layout when available. Record the Android API level; distinguish untested older OS versions and iOS from observed results.
- Keep the local test run confined to launch/readiness and avoid authenticated writes. Preserve current Metro servers; the standalone APK should not depend on Metro.
- If native installation is unavailable or not authorized, report the APK and completed checks while leaving AC8 native verification explicitly outstanding. Browser captures or a successful export cannot substitute for the missing launch evidence.
- Record exact results, warnings, artifact/recording paths, any remaining limitations, and untouched external actions. Reconcile only known tool-produced log changes and stop task-owned preview processes. Do not stage, commit, push, or deploy.

## Current execution choice and safe parallelism

- After this plan is approved, obtain the required A/B execution choice once. The earlier Mode A selection applied to the completed artwork revision.
- **Mode A:** N1 is primary-owned. N2A and N2B may run concurrently with the ownership above. N3 begins after writers finish, followed by final verification/build and native QA.
- **Mode B:** Perform every implementation, review, integration, and verification task inline without implementation subagents.
- Keep only one parent task in progress. Native generation/build/device mutations are serialized after writers finish; do not run a final check against a changing worktree.

## Archived artwork revision plan and evidence

Everything below records the previous completed artwork revision. Its historical no-build/no-install boundary and check totals do not replace the current native-correction tasks above.

## Outcome and boundaries

Deliver four prominent realistic illustrated groups matching the attached reference, followed by the complete approximately 3-second sequence: rotation, convergence into one point, original symbol reveal, rightward symbol movement, and original LISNO letters emerging left.

A successful cold launch finishes the introduction once even if session work finishes early. Session work continues concurrently. Errors and reduced motion bypass the delay; an independent bounded fallback prevents a stuck presentation. Preserve destination selection, deep links, authorization, original logo geometry, shared branding, launcher assets, unrelated work, and accessibility.

Use installed React Native Animated, SVG, and local asset capabilities. No new dependencies or lockfile edits are expected. No backend changes, release APK delivery, installation, commits, pushes, deployment, or production mutation.

## Ownership and interfaces

The primary owns product interpretation, integration, shared contracts, and this plan. Keep one parent task in progress. If Mode A is selected, independent slices under task 2 may run concurrently after task 1 freezes interfaces.

| Owner | Exclusive write scope | Deliverable |
| --- | --- | --- |
| Artwork owner | New `mobile/assets/brand/startup/` images and source/provenance notes; `mobile/src/ui/StartupArtwork.tsx`; new `mobile/src/ui/startupAssets.ts` manifest | Four reference-matching transparent groups, optional reference-matching static background, optimized local sources, decorative image rendering |
| Launch lifecycle owner | New `mobile/src/core/startup/` presentation controller/provider and focused tests only | One launch-scoped preparation/playback/completion state machine, timers, cancellation, and idempotent completion |
| Primary | `mobile/src/ui/StartupBrand.tsx`, `startupAnimation.ts`, `startupAnimation.test.ts`, `brand.test.tsx`, `StartupMotion.tsx`, `startupTheme.js`, `brand.tsx` if needed; root/startup/welcome integration and relevant route tests; native configuration/tests only if palette or resources require adjustment; plan | Animation, layout, root handoff, runtime/error integration, routing/deep-link preservation, final reconciliation |
| Integrity reviewer | Read-only integrated sources/diff | Findings traced to AC1–AC7 |
| Verification runner | Read-only product sources; temporary/ignored QA outputs only | Exact integrated check results and rendered/native evidence |

Canonical logo files, `StartupLogo.tsx`, existing native cream asset, and unrelated application files are read-only unless a confirmed in-scope defect requires a primary-owned correction. Expand a write boundary explicitly before assigning it; do not let workers cross boundaries silently.

All writers must be told they share a worktree, must preserve existing changes, and must return cross-boundary requirements to the primary.

Freeze these interfaces before parallel work:

- Artwork kinds become `interior | plan | materials | tools`. The manifest exposes local image sources and intrinsic dimensions, including any static background; it contains no runtime network URL.
- `StartupMotif` accepts the agreed kind and bounds, uses contain sizing, and remains decorative. Its wrapper owns no motion or launch lifecycle.
- The lifecycle module receives explicit preparation, reduced-motion, active/background, and error inputs. It exposes preparation/playing/settled phase, completion/readiness, and an idempotent finish action. It does not choose routes, inspect permissions, or import the artwork renderer.
- One root-scoped controller survives route remounts. The root presentation is the sole animated instance. Ordinary pending loaders render the settled brand and never start another introduction.
- `StartupBrand` receives an explicit play/static state and completion callback; natural completion reports once. Lifecycle fallback, backgrounding, and preference changes settle it without replay.
- The primary retains configuration-safe `startupTheme.js` and existing exact original-logo components.

## Dependency-ordered tasks

### 1. Establish the revision baseline and integration contract

Owner: primary. Dependencies: task-plan approval and execution-mode choice. Covers AC4, AC5, AC7.

- Capture current status, relevant tracked diffs, and copies/hashes of untracked splash sources before any writer starts. The previous splash implementation is now part of the baseline, not disposable generated work.
- Preserve unrelated content-density changes, documentation, and Expo logs. Record exact per-target ownership.
- Run the existing focused branding, timeline, logo, routing, and configuration tests as baseline evidence; distinguish old failures from this revision.
- Inspect root font/native handoff, asset loading, error precedence, direct-entry route guards, and available native/preview tooling.
- Freeze the interfaces above, playback boundaries, and the presentation deadline: approximately 3 seconds of playback, bounded preparation of at most 1 second after root readiness, and independent 4-second maximum presentation wait.
- Verify the installed asset/native-animation APIs through local sources and official documentation as needed; do not install another image or animation library.
- Select the smallest root integration that keeps RuntimeProvider and the router mounted so boot work continues and Expo can process navigation. Preserve initial paths and parameters. Do not redirect deep links through the default landing route merely to show the splash.

Exit: dirty baseline preserved, contracts and paths fixed, route/error precedence understood. No unresolved interface dependency assigned to parallel writers.

### 2. Build artwork, launch lifecycle, and animation

Dependencies: task 1. Tasks 2A, 2B, and 2C are independent after the contract is fixed.

**2A. Reference artwork.** Owner: artwork owner. Covers AC1 and AC6.

- Apply the imagegen skill and use the supplied attachment to isolate/reconstruct each group: sofa/lamp/plant; furnished apartment; four material samples/foliage; rolled drawing/ruler/set square/foliage.
- Preserve the reference's perspective, materials, lighting, objects, and intrinsic backing/shadows. Exclude its center emblem and text. Never generate replacements for the original Lisno mark.
- Inspect each result against the reference before integration. Reject line art, generic approximations, missing tools/samples, changed furnishings, and green rectangular edges.
- Prepare transparent, trimmed local assets with sufficient rotation padding and consistent apparent scale. Keep a lightweight static olive background only if it improves reference fidelity.
- Optimize using existing tooling, record source/provenance and output dimensions, compressed bytes, and estimated decoded memory. Treat roughly 512–768 px per group as an initial sizing target, then validate on actual display sizes.
- Add the manifest and replace the SVG motif renderer with decorative local image rendering. Keep animation, timeline, palette ownership, and route logic outside this slice.
- Deliver an asset contact sheet or isolated previews in the temporary QA directory. The primary must review fidelity before task 3 finishes.

**2B. Launch lifecycle.** Owner: launch lifecycle owner. Covers AC4 and AC5.

- Implement preparation → playing → settled with one launch-scoped owner. Use idempotent settlement and a reason that is useful in tests/local diagnostics, without personal data.
- Start only when local artwork is ready, motion is known allowed, and the app is active. Resolve enabled/failed/unknown preferences conservatively without showing a final wordmark and then restarting it.
- Bound preparation and total presentation waiting independently. Asset failure or a missing animation callback must release the gate; pending session restoration must remain pending.
- Settle on backgrounding, errors, or reduced motion enabled during playback. Foregrounding and later preference changes must not replay.
- Clean up timers/listeners and handle stale callbacks, route remounts, and effect replay without duplicate completion.
- Add focused behavioral tests for early completion, slow work, preparation timeout, total timeout, failed artwork, unknown/enabled preferences, mid-play changes, backgrounding, cleanup, and no replay.
- Do not modify RuntimeProvider, navigation destinations, existing app routes, root layout, or UI animation code. Return the tested controller for primary integration.

**2C. Choreography and responsive presentation.** Owner: primary. Covers AC1, AC2, AC3, AC6.

- Replace the fixed small-square layout with prominent upper/lower illustration groups across the available mobile canvas. Respect safe areas, measured message height, image aspect ratios, and landscape constraints.
- Revise the timeline to the approved sequence: 0–800 ms establish/rotate; 800–1500 converge; 1500–1900 reveal; 1900–2200 shift right; 2200–2800 emit letters left; 2800–3000 hold.
- Use native-driven transforms and opacity. All artwork must actually reach the same point before disappearing; the original symbol stays upright and appears afterward.
- Reuse the exact original letter metrics and paths. Make the leftward emission visibly originate behind/within the right-hand symbol, with correct final LISNO order and spacing.
- Compute full swept bounds for rotating raster rectangles at supported layouts. Avoid cropping plants, ruler tips, furniture, or final branding.
- Keep one accessible loading announcement and readable enlarged text. If matching the reference's loading bar, use an indeterminate presentation without invented percentages.
- Adjust the isolated olive background treatment only as needed. Preserve shared application tokens and branding.
- Update meaningful phase, geometry, accessibility, and component lifecycle tests. Do not create tests that merely duplicate style constants.

Exit: three slices individually checked, with explicit interfaces and no placeholder artwork accepted as final.

### 3. Integrate the full cold-launch path

Owner: primary. Dependencies: all task 2 writers finished. Covers AC1–AC6.

- Mount the launch controller at the root within the required providers; keep runtime startup concurrent and router infrastructure mounted.
- Preload bundled images using installed facilities. Coordinate the first presentable React frame with native splash hiding within the bounded preparation deadline; avoid a blank frame or an already-settled brand disappearing into a late intro.
- Connect one animated root presentation and its completion action. Keep ordinary pending route loaders static, eliminating duplicate visible artwork/announcements.
- Hold normal startup redirects until both presentation and existing readiness requirements finish. Configuration/recovery errors retain precedence and dismiss the presentation promptly.
- Preserve incoming route paths/parameters. Trace direct feature entry during restoration; if an existing eager guard would discard the requested path, make the smallest pending-state correction within a declared primary-owned route boundary. Do not weaken authentication/authorization checks.
- Hide obscured route content from accessibility and touches during the presentation. Restore it cleanly on completion or bypass.
- Match static pending loaders to the final intro frame so a slow boot does not jump or replay. Verify sign-out and subsequent loads are unaffected.
- Inspect actual asset quality in composition, refine size/pacing, and resolve integration findings.
- Update native splash configuration and its tests only if background/resource tuning requires it. Keep launcher/application configuration unchanged.

Exit: the actual app startup path implements the approved sequence, bounds, error bypass, and destination semantics; all writers are idle.

### 4. Review the integrated result

Owner: read-only integrity reviewer in Mode A; primary inline in Mode B. Dependencies: task 3. Covers AC1–AC7.

- Review final code and diff against the revision baseline, not just HEAD, so prior splash and unrelated changes are preserved.
- Check exact brand geometry, realistic asset fidelity, common convergence point, phase order, letter origin, and rotation bounds.
- Audit root readiness, deep-link retention, error precedence, route remounts, sign-out, reduced motion, timeouts, background/resume, cleanup, and stale callback races.
- Confirm runtime boot is not blocked by mounting conditions, and hidden destinations cannot receive input or duplicate accessibility announcements.
- Review local image size/memory, startup-only loading, native-driven transforms, and unchanged dependencies.
- Primary resolves confirmed findings, then reruns affected checks. Reopen approval only for material changes to approved behavior.

Exit: review findings resolved before final verification.

### 5. Verify the integrated implementation

Owner: verification runner after review in Mode A; primary inline in Mode B. Dependencies: task 4. Covers AC1–AC7.

Run from `mobile/`, adding the actual lifecycle and root integration test paths introduced by task 2/3:

```sh
npm test -- --runInBand src/ui/brand.test.tsx src/ui/startupAnimation.test.ts src/ui/StartupLogo.test.tsx app.config.test.ts src/core/onboarding/startupRouting.test.tsx src/core/onboarding/welcomeRoute.test.tsx src/core/startup
npm run typecheck
npx expo export --platform android --output-dir /tmp/lisno-realistic-splash-android
```

If native configuration/build-fixture inputs change, run:

```sh
node --test scripts/native-build-environment.test.mjs
```

No lint script exists. Broaden checks only for shared changes or unresolved failures; repeat affected checks after corrections.

Use the actual component and root lifecycle in an isolated local QA harness, with temporary output under `/tmp/lisno-realistic-splash-qa/`. Do not add a production preview route. Preserve unrelated dev servers and avoid customer data.

| Criteria | Required evidence |
| --- | --- |
| AC1 | Four isolated asset comparisons and the initial reference-matched composite; source dimensions, byte sizes, and memory estimate. |
| AC2–AC3 | Start, mid-rotation, near-convergence, convergence-complete, original-symbol reveal, right-shift, letter-emission, and final frames; full playback recording where available; exact original path tests. |
| AC4 | Fast ready state waits for the complete intro; slow startup retains final branding; authenticated/anonymous/onboarding destinations, recovery/configuration errors, direct-link path/params, repeated loading, and sign-out. |
| AC5 | Unknown/enabled/error preferences, live preference change, asset failure, both deadlines, lost completion callback, background/resume, effect replay, route remount, and cleanup. |
| AC6 | 320 × 568, 390 × 844, 640 × 360, and 200% text; intermediate swept bounds and final spacing; one announcement and no obscured interactive content. |
| AC7 | Focused test totals, typecheck, Android export, applicable native-fixture results, review findings, and repository hygiene. |

- Inspect console/runtime errors and visible stutter. Do not claim a frame rate without measurement.
- Inspect an available appropriate native development target for real playback when authorized tooling/build availability permits. Native-driver and OS handoff proof must be distinguished from React Native Web screenshots; an old installed APK cannot prove changed resources.
- Do not install or deliver an APK under this plan. Record native verification limitations explicitly if a compatible target is unavailable.
- Run `git diff --check` and `git status --short`. Verify baseline hashes for unrelated dirty paths; restore only known tool-produced log changes, never unrelated edits.

Exit: available required checks pass, primary has inspected the rendered result, and any remaining native verification gap is explicitly recorded.

### 6. Record results and hand off

Owner: primary. Dependencies: task 5. Covers AC7.

- Append current revision evidence separately from the historical appendix: changed files, review resolutions, exact checks/results, asset footprint, frame/recording paths, and remaining limitations.
- Report the realistic artwork, complete once-per-launch sequence, original logo preservation, and changed fast-launch timing.
- State what was actually rendered/tested, including whether native playback and native handoff were verified. Do not call partial verification complete.
- Report dependency changes if any, unrun checks, and that no install, commit, push, deployment, migration, or production mutation occurred.

## Execution mode and safe parallelism

- **Mode A:** After task 1, use native Codex agents for independent artwork and launch-lifecycle slices while the primary owns choreography. Integrate only after all writers finish. Then run the integrity reviewer, fix findings, and run the verification runner sequentially.
- **Mode B:** The primary performs all implementation, integration, review, and verification inline without implementation agents.
- Neither mode begins until this task plan is approved and the user selects the mode at the next gate.

## Current revision results: 2026-10-19

Current revision baseline: 48 existing dirty/untracked files captured with copies/hashes and the tracked diff under `/tmp/lisno-realistic-splash-qa/`. Initial focused verification passed 6 suites / 44 tests. Independent artwork and lifecycle writers completed their assigned slices. Following the read-only routing audit, seven clean direct-entry routes and their tests were assigned to a separate worker; the primary retains root/index/welcome and BackNavigationProvider integration. The additional route boundary preserves cold-link parameters and avoids editing unrelated profile/more screens.

### Implemented behavior and affected areas

- Four transparent realistic reconstructions replace line illustrations: sofa/lamp/plant, furnished apartment, material samples, and architectural drawing tools. Each is 512 × 512; together they occupy 289,293 compressed bytes (282.5 KiB) and approximately 4 MiB decoded RGBA. `mobile/assets/brand/startup/PROVENANCE.md` records generation prompts and sources. These are reference-based reconstructions, not pixel-identical extracted objects.
- `StartupArtwork.tsx` and `startupAssets.ts` render and preload bundled local images. `startupAnimation.ts` and `StartupBrand.tsx` implement the 3,000 ms rotation → convergence → original symbol → rightward shift → leftward letter emission → hold sequence. Responsive geometry accounts for the full rotated image bounds. Original logo vectors and native resources are unchanged from this revision's baseline.
- `core/startup/StartupPresentation.tsx` owns preparation, playing, and settled states for one root lifetime, with 1-second preparation and 4-second overall presentation deadlines. `StartupExperience.tsx` coordinates asset preparation, the native hide call, the overlay, error bypass, and hidden-content accessibility. The existing runtime and router stay mounted during preparation/playback.
- `_layout.tsx`, `index.tsx`, and `welcome.tsx` integrate the presentation without changing destination selection. `StartupRouteGate.tsx` protects direct entry through feature, record, client estimate, staff estimate, vendor, profile, and more routes while preserving parameters and existing authorization checks. `BackNavigationProvider.tsx` consumes back actions while the presentation is held. Ordinary loaders show the settled brand without replaying the artwork.
- Tests cover phase order, convergence, logo geometry, swept bounds, completion and stale callbacks, Strict Mode effect replay, fast/slow startup, preparation failure/deadlines, reduced motion, backgrounding, route remounts, direct-entry parameters, recovery precedence, and back navigation.
- Independent integrity review found no confirmed defects. Its native image-decoding, native-driver, device deep-link/back, and OS handoff proof gaps remain explicit below.

### Final automated checks

Checks ran after all implementation writers finished:

| Working directory | Exact command | Result |
| --- | --- | --- |
| `mobile/` | `npm test -- --runInBand` | Passed: 190 suites, 1,811 tests; 73.3 seconds. |
| `mobile/` | `npm run typecheck` | Passed. |
| `mobile/` | `npx expo export --platform android --output-dir /tmp/lisno-realistic-splash-android` | Passed: 3,043 modules, 46 assets, one approximately 12 MB Hermes bundle. |
| Repository root | `git diff --check` | Passed. |
| Repository root | `git status --short` | Inspected against the captured dirty baseline. |

Test output contained no warnings or failures. Export warnings concerned only the conflicting `NO_COLOR`/`FORCE_COLOR` terminal settings. Logs are `/tmp/lisno-realistic-splash-qa/final-mobile-tests.log`, `final-typecheck.log`, and `final-android-export.log`. Export artifacts are in `/tmp/lisno-realistic-splash-android`.

### Rendered verification

- The temporary harness renders actual application artwork, animation components, and lifecycle provider using React Native Web and the installed SVG renderer with local Poppins. No production preview route was added.
- Captured 13 timeline frames at each of 390 × 844, 320 × 568, and 640 × 360: **39 deterministic phase captures**. Checked image bounds and exactly one loading announcement. Primary inspected initial artwork, rotation, convergence, letter emergence, final portrait/landscape composition, and enlarged text directly.
- Additional captures cover 200% text, reduced motion, unknown preference, and live reduced-motion settling. Full live playback is `/tmp/lisno-realistic-splash-qa/rendered/splash-live.webm`; initial and final portrait frames are `phone-0.png` and `phone-3000.png` in that directory.
- Live checks exercised a fast ready destination held until completion, a slow destination held after animation completion, delayed preparation, preparation timeout/failure, error bypass, reduced motion during playback, no replay when motion is re-enabled, and unmount cleanup. No uncaught runtime exceptions or asset network failures were observed.
- Browser console notices concerned native SVG accessibility props, deprecated React Native Web `pointerEvents`, and the expected native-driver fallback to JavaScript. Browser evidence does not establish Android native-driver execution or a measured device frame rate.
- Asset contact sheet and footprint evidence are in `/tmp/lisno-realistic-splash-qa/artwork/`; scenario evidence is `live-evidence.json`. Browser tool logs and all new rendered outputs were moved out of the repository into the same temporary QA directory.

### Native limitation and repository hygiene

- Cold-launched the existing debuggable Lisno app on `emulator-5554` and recorded it. The available installed app displayed the **older static gold splash**, so this run does not verify the updated React animation, native image readiness, device deep links/back behavior, or OS splash handoff. Evidence: `/tmp/lisno-realistic-splash-qa/native-cold-launch.mp4` and `native-frames/`.
- No APK was built or installed, no app data/preferences were changed, and no existing Metro server was taken over. The temporary emulator recording was removed after copying it locally. Native resource changes from the earlier implementation still require a compatible rebuilt installation for verification.
- All 102 source/baseline paths snapshotted by the verification runner remained unchanged during its checks. Unrelated product edits were preserved. The pre-existing Expo `start.log` received runtime activity while the existing server was running and was preserved; the export-produced `export.log` change was restored exactly to its pre-export contents.
- No dependencies or lockfiles changed. Native build-fixture tests were not repeated because their inputs did not change in this revision. No lint script exists. Backend/OCR checks, release APK build/delivery, installation, migration, production mutation, staging, commit, push, and deployment were not performed.

## Historical evidence: previous implementation only

The following retained record predates the 2026-10-19 revision. Its line-art, 2.2-second, interruptible behavior and passing checks are background only. None of these results verifies the realistic artwork, 3-second complete-launch contract, or new lifecycle controller.

### Execution evidence

- Baseline captured in `/tmp/lisno-splash-convergence-qa/status-baseline.txt`; pre-existing Expo log preserved at `start-log-baseline` in the same directory. All assigned existing implementation targets were clean.
- Baseline focused tests: 4 suites, 29 tests passed (branding, app configuration, startup routing, welcome route).
- Tasks 2A and 2B delegated with exclusive ownership; primary owns task 2C and integration.
- Android target available: `emulator-5554`. Updated native-build availability remains to be checked.

- Integrated artwork/animation checks: 3 suites, 22 tests passed; mobile `npm run typecheck` passed. Test environment AppState is explicitly modeled because the installed Jest preset supplies a function placeholder for `currentState`.
- Palette source is a small CommonJS `.js` module rather than `.ts`, matching the repository's existing Expo configuration pattern. This avoids extensionless TypeScript runtime resolution and Node-version-specific type stripping. Native build fixture copies the palette alongside app configuration. No product behavior changed by this implementation detail.
- New source-geometry tests prove all 11 symbol and 5 letter paths match the canonical original. Native cream asset generation is deterministic and preserves shared assets.

- Independent integrity review found no confirmed defects. Remaining proof gaps were real root font/preference ordering, direct Strict Mode behavior, and rendered/native playback; the approved unknown-preference fallback remains conservative. Final runner is checking 6 suites, typecheck, Android export, native-build environment fixture, and hygiene.

### Final implementation and verification

#### Product changes

- `mobile/src/ui/StartupBrand.tsx` owns the splash presentation. `brand.tsx` re-exports it while preserving ordinary loaders and shared image-based branding.
- `startupAnimation.ts` defines the 2,200 ms choreography and normalized sampled geometry. Transforms/opacity use one native-driver timeline; no per-frame React state changes.
- `StartupMotion.tsx` passes the root's motion preference, prepared while fonts load. `_layout.tsx` provides it without delaying readiness. `index.tsx` and `welcome.tsx` update only loading-surface colors; routing conditions are unchanged.
- `StartupLogo.tsx` preserves the original symbol and all five letter paths. `StartupArtwork.tsx` keeps the four original motifs and applies the isolated palette in `startupTheme.js`.
- `generate-startup-assets.mjs` creates only `assets/brand/startup-icon-cream.png`. The 512 × 512 transparent asset is deterministic, with the existing 300 px glyph container. Existing launcher and shared logo assets have no diff.
- `app.config.ts` uses the new native splash color/image and retains launcher/application settings. `app.config.test.ts` and the native-build fixture cover that boundary.
- Focused tests cover exact geometry, phase order, convergence, swept bounds, motion preflight/fallback, cancellation, no replay, resize, unmount/remount, and accessible announcements.

#### Final checks

All commands below ran on the final code after the explicit accessibility-hidden prop was added:

- From `mobile/`: `npm test -- --runInBand src/ui/brand.test.tsx src/ui/startupAnimation.test.ts src/ui/StartupLogo.test.tsx app.config.test.ts src/core/onboarding/startupRouting.test.tsx src/core/onboarding/welcomeRoute.test.tsx`: **6 suites, 44 tests passed**.
- From `mobile/`: `npm run typecheck`: **passed**.
- From `mobile/`: `npx expo export --platform android --output-dir /tmp/lisno-splash-convergence-android`: **passed**, 3,034 modules, 42 assets, one approximately 12 MB Hermes bundle. Export warnings concerned only `NO_COLOR`/`FORCE_COLOR` terminal settings.
- From `mobile/`: `node --test scripts/native-build-environment.test.mjs`: **2 tests passed** after rerunning outside the sandbox to access the Gradle cache. This check preceded the final accessibility-only adjustment; configuration and fixture files did not change afterward.
- Repository `git diff --check`: **passed**. Unrelated dirty files and the pre-existing `start.log` content were preserved. The task-generated `export.log` change was restored to its clean pre-task state.

### Rendered verification

- Actual component rendered through React Native Web with the installed SVG browser renderer and local Poppins font. Primary personally inspected initial, convergence, symbol reveal, letter emission, settled portrait/landscape, and enlarged-text screenshots.
- **19 deterministic captures passed** clipping and accessibility assertions at 320 × 568, 390 × 844, and 640 × 360, including 200% text, reduced motion, preference changes, and unknown-to-known preference resolution.
- Real-time browser playback verified changing orbit transforms, completion after the 2.2-second sequence, immediate settling on reduced motion, no replay after disabling it, stable state during resize, and unmount cleanup. **Zero thrown runtime exceptions** on the corrected preview harness.
- Rendered QA found that React Native Web does not map the native-only artwork hide props to ARIA. Added standard React Native-supported `aria-hidden` to the artwork wrapper and a test assertion. The rendered accessibility tree now contains exactly one named progressbar and no decorative images.
- Preview-only setup issues were corrected: RN Web prohibits `Dimensions.set` in browsers, so the enlarged-text harness supplies its measurement input through `Dimensions.get`; its animation cleanup also requires the usual `global` alias. These changes are confined to the temporary harness.
- Remaining browser console messages are native SVG accessibility/transform-origin prop compatibility notices, the RN Web pointer-events deprecation, and the expected native-driver fallback to JavaScript. They do not establish native-driver execution on Android.

Evidence is under `/tmp/lisno-splash-convergence-qa`: final command logs, `visual-metrics.json`, `live-checks.txt`, and `rendered/` screenshots. The isolated preview harness is in `preview/`; its local server was stopped after QA. Browser tool logs were moved out of the repository into the same evidence directory. Android export artifacts are under `/tmp/lisno-splash-convergence-android`.

### Limits and external actions

- Emulator `emulator-5554` has a debuggable Lisno app, but its default Metro port is occupied by another project's process and its native resources predate this change. No server takeover, app-preference changes, app launch, reinstall, or data reset was performed. **Actual native-driver playback and updated OS splash handoff remain unverified.**
- The new native splash background/asset needs a native rebuild and installation before it appears in an installed app. JavaScript export does not update an existing APK.
- Ready-state navigation remains immediate; a fast launch can interrupt or skip the introduction, as approved.
- No dependency/lockfile changes, full mobile suite, lint, backend/OCR suite, release build, migration, production mutation, staging, commit, push, or deployment occurred. The changed native paths are validated through configuration/fixture tests and Android export, subject to the device limitation above.
