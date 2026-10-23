# Mobile architectural splash animation

Status: specification and task plan approved on 2026-10-16; Mode A selected. Implemented and verified with focused tests, typecheck, Android export, and rendered previews. Native device startup remains unverified because no device/emulator was connected.

## Goal and chosen direction

Give the mobile startup screen a premium interior-design and construction identity. The user selected architectural line art: furniture, a floor plan, and construction tools emerging around the Lisno logo.

## Current behavior and evidence

- `mobile/app.config.ts` configures a native splash with the existing brand icon and olive background (`#2f3a2a`).
- `mobile/src/app/_layout.tsx` retains that splash until fonts load or fail and the root view lays out.
- `mobile/src/ui/brand.tsx` supplies `StartupBrand`: a 520 ms wordmark reveal followed by the existing rotating/pulsing `BrandLoader`.
- `mobile/src/app/index.tsx` and `welcome.tsx` show that component while session or onboarding storage resolves. Navigation proceeds immediately when ready.
- React Native Animated and `react-native-svg` are already installed and used by the branding/onboarding UI. `features/onboarding/useReducedMotion.ts` already handles unknown preferences and lookup failures conservatively.
- Startup UI targets have no pre-existing diff. Existing environment, release-build, README, script, and planning changes belong to the previous completed task and must be preserved.

## Scope and requirements

1. Enhance the existing `StartupBrand` presentation with a small, purpose-built vector composition. Keep the Lisno wordmark readable in the center, with four surrounding groups: sofa and lamp, floor plan, building frame, and ruler/construction tools.
2. Use the current olive shell, warm cream strokes, and muted sage accents. Keep generous clear space around the logo. Avoid shadows, gradients, photographic assets, cartoon bounce, particles, and dense ornament.
3. Start with the central brand visible. Stagger the four groups outward from near the logo using opacity, translation, and a restrained scale reveal. Target roughly 1.1 seconds for the full entrance, then keep the illustration still. Retain one clearly announced loading message below it.
4. The entrance runs once per mounted startup presentation. Do not replay it continuously or introduce an animation-completion gate. Existing startup work runs concurrently, and navigation proceeds as soon as ready. On a fast launch, the animation can finish early or be skipped when the loading presentation is not needed.
5. Keep the existing native launch image and font-readiness handoff. The animated artwork belongs to the React-rendered startup screen after that handoff.
6. Fit the artwork within narrow phones and short/landscape layouts without obscuring the logo or message. Use measured available space and a bounded illustration size.
7. When reduced motion is enabled, unknown, or unavailable, render a static composition. Keep decorative shapes out of the accessibility tree and expose a single meaningful loading announcement. Stop animations and release listeners on unmount or preference changes.
8. Use installed SVG and animation capabilities with local vector paths. No network assets, new dependencies, or native configuration changes are needed. Animate transforms/opacity through the native driver.

## Invariants and non-goals

- Preserve authentication, onboarding completion, session restoration, error recovery, deep links, and destination selection. No routing or storage contract changes.
- Keep ordinary in-app `BrandLoader` consumers visually unchanged; this request concerns the startup composition.
- No backend/API, permissions, production service, signing, Gradle, or release-process changes.
- No compulsory intro duration, onboarding redesign, 3D engine, sound, or generated image assets.

## Acceptance and verification

- A slow-start preview shows all four recognizable groups emerging around the central logo and settling within the target duration; the artwork stays calm during longer startup.
- A ready app leaves startup immediately. Existing first-launch, returning-user, authenticated, and recovery routing tests continue passing.
- Reduced motion displays the complete static composition with one accessible loading message and no decorative announcements. Unmount cancels active motion.
- Inspect rendered start, intermediate, settled, and reduced-motion states at narrow portrait and short landscape sizes. Check actual Android startup when a device/emulator is available; report any unavailable device verification explicitly.
- Run focused branding/startup tests, mobile TypeScript checking, an Android JS export, and `git diff --check`. An APK/AAB rebuild is not required for this specification stage.

## Assumptions, risks, and open decisions

- Assumption: “flash screen” means the mobile splash/startup screen; the selected architectural style confirms the visual direction.
- Fast startup can shorten the animation by design. This preserves current launch responsiveness.
- Main risks are cramped composition on short screens and asynchronous motion-preference changes; address them with bounded responsive artwork and conservative motion defaults.
- There are no open product choices. No data migration or external action is involved; rollback is limited to the startup presentation changes.
