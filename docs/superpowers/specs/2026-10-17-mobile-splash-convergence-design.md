# Mobile splash: realistic artwork and original Lisno reveal

Status: artwork/animation revision implemented on 2026-10-19; native launch correction specification and task plan approved, and Mode A selected. Native correction implementation is in progress. Current tasks and previous evidence are recorded in the [task plan](../plans/2026-10-17-mobile-splash-convergence.md).

This revision replaces the earlier requirements to retain line illustrations and allow ready navigation to interrupt the introduction. Those choices did not deliver the requested appearance and complete sequence.

## Native launch correction requested on 2026-10-19

### Observed issue and evidence

The user reports an initial black/dark screen with Lisno before the intended animated splash. This extra branded screen is unwanted.

- `mobile/app.config.ts` still explicitly supplies `startup-icon-cream.png` to the native splash plugin. Consequently, even a freshly generated native build is configured to show a separate logo before the icons-first React sequence.
- The generated Android resources are tracked despite the directory's ignore rule and are older than the current Expo configuration: `android/app/src/main/res/values/colors.xml` sets both `splashscreen_background` and `activityBackground` to `#2f3a2a`, whereas the React splash uses `#46552F`. `values/styles.xml` references a native `splashscreen_logo` and requests `icon_preferred` behavior. These files establish source/build drift, not the exact contents of the user's installed binary.
- `_layout.tsx` prevents native auto-hide and waits for fonts. `StartupExperience.tsx` retains the native screen until layout and presentation preparation finish. This makes the configured native logo visible before the custom sequence. The custom artwork component itself uses olive, not black.
- Earlier emulator verification captured an older static gold splash. The exact installed build and origin of the user's reported black color remain unconfirmed; do not attribute the color specifically to dark mode without a native capture.
- The installed Expo plugin always references `@drawable/splashscreen_logo`; deleting only its image setting is insufficient as a verified Android solution. Its supported Android drawable option permits a transparent splash-only drawable while retaining the normal launcher icon.
- Android controls the initial launch window and system entry animation. Its launch background and artwork are configurable; this change removes Lisno's separate branded waiting surface, not the operating system's startup mechanism. [Android launch documentation](https://developer.android.com/develop/ui/views/launch/splash-screen).
- Native splash configuration requires a new app binary. Expo recommends a release build for representative splash verification because Expo Go/development builds can differ. [Expo splash documentation](https://docs.expo.dev/versions/latest/sdk/splash-screen/).

### Required correction

1. Present a plain olive `#46552F` native launch surface, without a visible Lisno symbol, name, or additional splash label, in light and dark device appearance. Preserve launcher/home-screen branding.
2. Match the native activity/window background and the first React preparation surface to the same olive color, eliminating the old dark/black transition. Do not restyle destination screens.
3. Use a valid transparent native splash drawable or equivalent verified resource, rather than relying on a missing image that may fail compilation or fall back to the launcher icon. Retain configuration as the source of truth so prebuild cannot restore the unwanted logo.
4. Hide the native surface only when the intended React surface has laid out. Avoid an extra native fade covering the initial artwork rotation. Keep the first meaningful animated frame visible before convergence and retain bounded preparation/error/reduced-motion fallbacks.
5. In normal motion-enabled launches, the original Lisno logo first appears after the four artwork groups converge. Preserve the approved artwork, choreography, exact logo geometry, route behavior, and once-per-launch lifecycle. Reduced-motion/error behavior remains the existing accessible bypass.
6. Regenerate and inspect native resources, then build a fresh standalone Android QA artifact containing the correction. A JavaScript export alone cannot verify or update the initial launch screen. Native installation must have an explicitly authorized test target before it occurs; no uninstall or data reset is part of this correction.
7. Record native cold-launch behavior on a compatible test installation, including the initial window and handoff. Until that evidence exists, report native verification as outstanding and do not claim the installed app is fixed.

Recommended approach: an unbranded olive native launch surface flowing into the existing realistic artwork animation. It fits Android's launch constraints and keeps the first branded reveal at the requested point. A second static full artwork composition would require separate platform/layout handling and is unnecessary for removing the duplicate branded screen.

Scope: native splash/window configuration, a transparent splash-only resource, focused handoff corrections if required, configuration/generated-resource tests, local Android QA build, and startup verification. No API/data/permission changes, new dependencies, launcher redesign, production installation, deployment, or unrelated screen changes. Rollback restores only this correction's configuration, resource, handoff, and tests. Preserve the existing dirty worktree and completed animation implementation.

No additional product choice is needed. This correction supersedes the previous allowance for the original symbol to appear on the OS splash before React starts. It requires revision approval because that earlier behavior was explicitly included in the approved specification.

## Goal

Match the four realistic 3D illustration groups and olive-green atmosphere in the latest attached reference. All four groups rotate and gather into one central point. Only after convergence, the original repository Lisno symbol appears, moves right, and emits the original LISNO letters toward the left.

Final arrangement: **LISNO [original Lisno symbol]**. Do not substitute the reference's simplified leaf emblem.

## Pre-revision behavior and evidence

- `mobile/src/ui/StartupArtwork.tsx:5` defines interior, plan, structure, and tools as flat SVG strokes. The structure and tools also differ from the reference's material samples and architectural drawing tools.
- `mobile/src/ui/StartupBrand.tsx:32` limits the composition to a 360 dp square, with each motif only 26% of that square. This produces small ornaments rather than the prominent, detailed groups in the reference.
- `mobile/src/ui/startupAnimation.ts` already provides a 2.2-second native-driven rotation/convergence/reveal sequence. Extend this architecture while correcting artwork, scale, pacing, and lifecycle.
- `mobile/src/ui/StartupLogo.tsx` already separates the exact original symbol and letter paths from `frontend/public/lisno-logo.svg`. Reuse them.
- `mobile/src/app/index.tsx:34` renders the presentation only while startup/onboarding work is pending, then redirects immediately. Fast launches can shorten or skip the animation.
- `mobile/src/ui/StartupBrand.tsx:28` settles if motion preference is initially unknown. Resolve preferences during preparation where possible while retaining conservative accessibility fallbacks.
- `mobile/src/app/_layout.tsx` hides the static native splash after fonts load or fail and the root lays out. Native original-logo artwork and an isolated olive palette already exist.
- Existing splash changes and unrelated content-density changes, release documentation, and runtime logs are present. Preserve this baseline. Only this specification is changed at this gate.

## Scope and visual requirements

Use the latest attachment as the source for artwork and composition, not only color.

| Initial position | Required realistic group |
| --- | --- |
| Upper left | Cream sofa, olive cushions, warm floor lamp, potted plant, and rug/base. |
| Upper right | Isometric apartment cutaway with cream walls, furnished rooms, wood floors, and plants. |
| Lower left | Overlapping wood, white marble, tan stone, and olive material samples with foliage. |
| Lower right | Rolled architectural drawing, wooden ruler, wooden triangular set square, and foliage. |

Prepare four independently animated transparent raster assets from the supplied reference. Preserve each group's materials, arrangement, perspective, lighting, intrinsic shadows, and muted olive backing where appropriate. Remove rectangular background edges and all reference branding/text from these assets.

Use image editing/generation tooling for extraction or reconstruction when necessary, followed by direct visual comparison. Generated reconstruction is not automatically pixel-identical; reject generic substitutes or materially different objects. Do not generate or redraw the original Lisno logo.

Recommended representation: pre-rendered realistic 3D artwork animated using native image transforms. This matches the reference without a runtime 3D engine. Real-time meshes would support viewpoint-changing rotation but require unavailable source models and substantially more rendering infrastructure. The default is visible in-plane rotation and orbital movement of realistic artwork, not live 3D rendering.

### Composition and theme

- Make all four groups prominent across the portrait canvas, in the reference's upper/lower arrangement around a clear center. Replace the small line-icon composition.
- Match deep olive, moss green, warm cream, natural wood, stone, and foliage. Existing palette targets are `#46552F`, `#364326`, `#7C8752`, and `#F6F2E3`; tune visually rather than claim exact image sampling.
- Reproduce the softly lit green atmosphere with a lightweight static background treatment. Avoid harsh gradients, glowing orbs, generic UI cards, or unrelated effects. Blend the native background and first React frame coherently.
- Keep original logo geometry and lettering in warm cream, with correct proportions and kerning.
- Keep “Preparing your workspace” below the composition and retain caller-supplied message support. A restrained reference-style loading indicator may be indeterminate; never imply animation progress measures backend readiness.
- Adapt sizes and spacing for narrow portrait and short landscape, respecting safe areas and image aspect ratios.

## Required sequence

Target approximately 3 seconds, including a short final hold. Fine timing adjustments are allowed during visual QA without changing this order.

| Phase | Target time | Required behavior |
| --- | --- | --- |
| Establish and rotate | 0–800 ms | Show all four realistic groups around an empty center. Each visibly rotates while moving coherently around the center. No central logo/name yet. |
| Converge | 800–1500 ms | Continue rotating while every group travels inward and shrinks into the same point. Fade only near arrival, never at the starting positions. |
| Original symbol appears | 1500–1900 ms | After all artwork has converged and disappeared, reveal the original Lisno symbol from that point. Keep it upright. |
| Symbol moves right | 1900–2200 ms | Move the symbol to the right-hand position of the final centered brand composition. |
| Letters emerge left | 2200–2800 ms | Emit the original L, I, S, N, O shapes from the symbol toward the left. Use clipping/layering to make their origin visible. Settle in readable left-to-right LISNO order. |
| Final hold | 2800–3000 ms | Briefly hold the complete brand before ready navigation. If startup remains pending, retain this calm final state. |

No early logo reveal, rotating Lisno symbol, detached letter fade-in, bounce, flashing point, or looping introduction.

## Startup and lifecycle contract

1. Play once per application cold launch, after artwork and motion preference preparation or a bounded preparation fallback. Session restoration and onboarding work continue concurrently.
2. When motion is allowed, finish the approximately 3-second sequence even if normal navigation becomes ready earlier. Navigate only after both presentation and existing startup requirements finish. This intentional short delay replaces the previous interruptible sequence.
3. Presentation completion never determines authentication, permissions, onboarding completion, or destination. Preserve existing pending/error semantics and destination selection.
4. Configuration errors, initialization failures, and startup recovery remain promptly reachable without waiting for playback. Preserve deep-link destinations after the presentation.
5. Subsequent loading, sign-out, route remount, foreground resume, and resizing must not replay the cold-launch introduction. Completion must be launch-scoped rather than only component-local.
6. Reduced motion, unavailable preference lookup, or a still-unknown preference after bounded preparation show a static completed brand with no artificial intro delay. Enabling reduced motion during playback settles immediately and releases the presentation gate; disabling it afterward does not replay.
7. Failed local artwork preparation falls back to the static original brand and cannot block navigation. Bound preparation waiting and use an independent completion timeout. Target at most 4 seconds of presentation waiting after the React root is ready; genuinely pending session work is not bypassed.
8. Backgrounding cancels/settles the presentation and releases its gate. Remove timers, listeners, and animations on unmount; avoid duplicate timelines/callbacks under effect replay.
9. The operating-system splash remains static and unbranded, with the matching olive base color. The custom sequence runs in React and owns the first visible Lisno reveal. Changed native resources require a rebuild and compatible installed-target verification.

## Engineering, accessibility, and boundaries

- Extend installed React Native Animated capabilities with native-driven transforms and opacity. No per-frame React state, network assets, new 3D dependencies, or global restyling.
- Bundle optimized local artwork with clean transparency and suitable mobile resolution. Measure compressed size and decoded memory; avoid oversized duplicates.
- Bound motion using the images' full swept rotation area. Keep all phases, final branding, and message clear of clipping and overlap.
- Expose one loading announcement. Hide decorative artwork, individual letters, and duplicate logo nodes from accessibility. Support 200% text.
- Preserve shared wordmarks/icons, ordinary loaders, launcher assets, unrelated screen changes, and the rest of the app palette. Native launch/window backgrounds are in scope for matching the splash olive.
- No backend, API, schema, storage, authorization, or finance changes. No migration or external side effect. Rollback covers only this revision's owned splash assets, presentation, lifecycle integration, and tests.

## Acceptance criteria

- **AC1, reference fidelity:** All four realistic groups match the specified subjects, materials, perspective, and atmosphere. No line-art or generic icon substitutes remain.
- **AC2, convergence:** Every illustrated group visibly rotates and reaches the same center before the original symbol appears. The symbol remains upright.
- **AC3, original brand:** The original symbol moves right, and original letters visibly emerge from it toward the left, settling as LISNO plus the right-hand symbol.
- **AC4, complete launch:** Fast successful cold launches show the complete sequence once; slow launches hold its final state. Existing destinations, deep links, onboarding, authorization, recovery, and sign-out remain correct.
- **AC5, lifecycle:** Reduced/unknown/error preferences, failed preparation, lost callbacks, backgrounding, and remounts cannot trap startup or replay the introduction.
- **AC6, responsive/accessibility:** Major phases fit 320 × 568, 390 × 844, and 640 × 360 layouts, including 200% text. One loading announcement remains; artwork and final branding do not clip or collide.
- **AC7, verification:** Focused branding, timeline, routing, lifecycle, original-logo, and relevant configuration checks pass, together with mobile typecheck, Android JavaScript export, and diff hygiene. Visual evidence covers asset fidelity and the ordered playback, not only its final frame.
- **AC8, continuous native launch:** On a freshly built compatible Android test installation, cold launch shows no separate dark/black Lisno screen before the animation. The app-owned initial surface is olive and unbranded in light/dark appearance, the initial artwork phase is visible, and the original logo appears only after convergence in normal motion-enabled playback. Launcher artwork remains unchanged. Generated-resource assertions and a native recording substantiate this criterion; browser previews alone do not.

## Verification expectations

- Compare isolated assets and the initial composite with the reference. Capture start, rotation, convergence, symbol reveal, rightward shift, letter emergence, and final frames, plus full playback when tooling permits.
- Exercise fast and slow startup, authenticated/unauthenticated destinations, onboarding resolution, configuration/recovery errors, deep-link entry, repeated loading, reduced motion before/during playback, background/resume, timeout, and asset failure.
- Retain exact original-vector geometry checks; inspect the letters' visible origin and final spacing in rendered output.
- Run relevant mobile tests, mobile `npm run typecheck`, an Android JavaScript export, and `git diff --check`. Run native configuration/build-fixture checks if their inputs change. No lint result may be claimed because there is no lint script.
- Prefer native playback evidence where available. Separate browser-preview results from native-driver and OS handoff proof, and record unavailable native checks.
- A local standalone Android QA build is included for the native correction. Installation requires an explicitly authorized test target; production APK delivery/installation, commits, pushes, deployment, and production changes remain outside scope.

## Assumptions, risks, and open decisions

- “Keep remaining logos same as attached” means the four complete illustrated groups. The original repository logo remains authoritative.
- The reference is flattened, without separate layers. Extraction/reconstruction may need iteration for details and edges; do not describe approximate reconstruction as pixel-identical.
- Complete playback intentionally adds a short delay on fast launches; reduced-motion and error flows bypass it.
- Raster assets increase bundle size and decoded memory compared with line SVGs. Optimize and measure before handoff.
- The OS owns the launch window and entry transition. The app-owned waiting surface must be olive and unbranded; removing native Lisno artwork requires the rebuilt app, not just a Metro refresh. Manufacturer-specific launcher transitions are not controlled by React.
- No blocking design question remains beyond approval of this revision. Revise and approve the separate task plan, then obtain the required execution-mode choice before implementation.
