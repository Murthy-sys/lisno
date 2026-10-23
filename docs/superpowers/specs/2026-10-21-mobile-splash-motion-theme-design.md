# Mobile splash motion and reference theme

Date: 2026-10-21
Status: Approved by the user on 2026-10-21, followed by task-plan approval and Mode A selection. Reference image is still missing; final palette remains unresolved. Independent motion and verification work may proceed.

## Goal

On mobile launch, show the surrounding artwork rotating and gathering into one central point. Reveal the original Lisno symbol from that point, move the symbol right, and emit the original LISNO letters from the symbol toward the left. Match the splash theme to the user's reference image once it is available.

Final composition: **LISNO [original Lisno symbol]**, centered as a group.

## Current behavior and evidence

The current worktree already contains substantial uncommitted splash implementation. This specification describes the desired result and the remaining comparison/verification work; it does not assume the requested animation is absent.

- `mobile/src/ui/startupAnimation.ts` defines a 3,000 ms sequence with four rotating motifs, convergence at 1,500 ms, symbol reveal through 1,900 ms, rightward movement through 2,200 ms, and staggered letter travel. Only the motif frames have rotation values.
- `mobile/src/ui/StartupBrand.tsx` connects those frames to native-driven transforms, clips letters at the symbol's left edge, and positions the completed symbol to the right of the name. The surrounding objects are bundled artwork rather than live 3D models.
- `mobile/src/ui/startupAssets.ts` and `StartupArtwork.tsx` supply four existing 512 × 512 transparent images: interior, apartment plan, materials, and architectural tools.
- `mobile/src/ui/StartupLogo.tsx` uses symbol and lettering paths from `frontend/public/lisno-logo.svg`. Preserve those original paths and proportions.
- `mobile/src/ui/StartupExperience.tsx` waits for a laid-out React surface and native splash dismissal before enabling playback. `mobile/src/core/startup/StartupPresentation.tsx` owns preparation, playback, completion, timeouts, and accessibility/error bypasses. Route gates already hold ready destinations for normal launch playback.
- `mobile/src/ui/startupTheme.js` currently defines olive `#46552F`, deep olive `#364326`, accent `#7C8752`, and cream `#F6F2E3`. `StartupBrand.tsx` also contains a hardcoded gradient stop `#536239` and decorative background shapes, so changing the theme file alone will not fully change the rendered palette.
- `mobile/app.config.ts` uses the startup background and an Android transparent splash drawable. Checked-in Android day/night colors and activity background currently use `#46552F`; launcher colors are separate.
- Existing animation, logo, startup lifecycle, routing, configuration, and generated-resource tests describe this behavior. They have been inspected, not executed for this request. Historical QA notes are background only; installed-app behavior has not been verified in this turn.

## Scope and recommended approach

Refine and verify the existing native animation and splash-specific theme. Reuse the existing four artwork assets, exact original logo paths, Animated timeline, and startup lifecycle. Correct only gaps demonstrated by rendered playback or comparison with the supplied reference. No replacement animation library or live 3D renderer is needed.

Potentially affected areas are `mobile/src/ui/StartupBrand.tsx`, `startupAnimation.ts`, `startupTheme.js`, the existing startup integration only if a reproduced handoff defect requires it, Expo splash configuration, generated native splash resources, and their focused tests.

Non-goals: redesigning the logo or surrounding objects, changing the application's general theme, changing launcher icons, onboarding content, destination routes, authentication, APIs, persistence, or backend behavior. No new dependency is expected. This request does not authorize production installation, deployment, commits, or pushes.

## Required animation

| Phase | Approximate elapsed time | Visible behavior |
| --- | --- | --- |
| Surrounding rotation | 0–800 ms | All four surrounding artwork groups are visible and visibly rotate while moving around an empty center. No Lisno symbol or name appears yet. |
| Convergence | 800–1,500 ms | All four groups continue smoothly inward, shrinking into the same central point and disappearing together. |
| Original symbol reveal | 1,500–1,900 ms | The original Lisno symbol emerges and expands from the convergence point. It remains upright and never spins. |
| Move right | 1,900–2,200 ms | The fully revealed symbol translates right to its final position. |
| Name emergence | 2,200–2,800 ms | L, I, S, N, and O emerge from the symbol's left edge with a short stagger and settle into readable left-to-right order to its left. The name must visibly originate at the symbol, rather than simply fade in at its destination. |
| Hold and handoff | 2,800–3,000 ms | Hold the completed centered composition briefly, then release the startup presentation when safe. |

The times retain the current baseline and may be tuned modestly during visual verification. Preserve phase order and smooth continuity. Interpret "one point" as a common geometric convergence/reveal origin; do not add an orb, flash, sparkle, or separate portal graphic.

## Reference theme

The latest message mentions an attached image, but no image is accessible in this conversation turn. The previous olive reference mentioned in repository documents cannot be assumed to be the new reference.

After the user supplies the image:

- Inspect its background, foreground, and secondary tones and record the concrete palette in this specification before implementing the color change.
- Match the visible splash background and atmosphere; retain original logo geometry and readable contrast.
- Apply the chosen background consistently to the native launch surface, activity/root preparation background, safe-area regions, React splash, and splash-specific waiting surfaces that already consume the shared theme.
- Review the hardcoded gradient stop and decorative shapes against the reference. Use a quiet solid treatment unless the image supports a subtle tonal variation. Avoid unrelated effects and harsh gradients.
- Check existing artwork edges against the new background. Some illustrations contain olive bases; if these clash, identify the exact asset adjustment required before expanding scope. Do not silently replace the illustrations.
- Preserve launcher branding and unrelated application colors. Select system-bar foreground treatment to remain legible on the reference background.

Palette-dependent work and a claim of reference fidelity remain blocked until the image is available. No guessed replacement color is approved by this specification.

## Lifecycle, accessibility, and performance constraints

- Normal motion-enabled cold launches show the full sequence once, including fast session restoration and supported deep links. The animation must start visibly after native handoff, not run behind the operating-system launch surface.
- Keep native preparation unbranded so the symbol's first normal-launch appearance follows convergence. Avoid a duplicate logo splash or mismatched-color flash.
- Preserve the current bounded preparation/playback timeouts, asset failure handling, startup recovery, background/foreground handling, and reduced-motion behavior. Never hold recovery behind an animation or leave navigation trapped.
- Reduced motion skips rotating/traveling artwork and artificial waiting. Unresolved motion preferences remain conservative. Later route changes and routine loading must not replay the launch animation.
- Keep one meaningful accessible startup status, hide decorative artwork from assistive technology, and prevent interaction with covered routes. Retain the existing startup message and caller-supplied message support.
- Fit the complete rotated artwork, final wordmark, and message within safe areas on narrow phones, large phones, and short landscape screens, including enlarged text.
- Retain local assets and native-driven opacity/transforms; do not introduce network-dependent startup artwork, frame-by-frame React state updates, or a runtime 3D engine.

## State, API, and compatibility impact

Preserve `preparing → playing → settled` and the existing bypass paths. This is a presentation change with no API, permission, financial, data migration, or stored onboarding-state changes. The final destination remains determined by the existing runtime and routing logic.

Native splash color changes must be included in a fresh app binary; a JavaScript preview/export does not establish what an already installed app displays. Keep Expo configuration and checked-in generated Android launch resources aligned. Verify iOS configuration compatibility and report native iOS playback as unverified unless actually observed.

## Acceptance criteria and verification evidence

1. **AC1: Rotation and convergence.** Rendered phase captures and live playback show all four surrounding groups rotating and meeting at one point. No logo or letters are visible before convergence.
2. **AC2: Original branding.** Original symbol and letter paths remain intact. The symbol never rotates, appears at the convergence point, becomes fully visible, then moves right.
3. **AC3: Letter origin and final layout.** Live playback shows each letter emerging from the symbol, ending in a legible LISNO name to its left with balanced spacing and no overlap or clipping.
4. **AC4: Reference theme.** The supplied image and recorded palette agree with actual rendered output, including native preparation and React handoff in both light and dark device appearance. This criterion cannot be completed without the image.
5. **AC5: Launch resilience.** Focused lifecycle/routing tests cover fast and slow initialization, deep links, reduced motion, asset failure, native hide failure or delay, timeout, and background/resume without replay or blocked recovery.
6. **AC6: Responsive accessibility.** Inspect at least 320 × 568, 390 × 844, and 640 × 360 logical sizes plus enlarged text. Artwork and text remain visible; decorative elements do not create duplicate announcements.
7. **AC7: Integrated verification.** Run the affected animation/brand/logo/startup/routing/configuration tests, `npm run typecheck` from `mobile/`, the native resource consistency test when theme/configuration changes, and an Android export. Verify the native handoff using a fresh local QA binary on an identified authorized test target when available; distinguish simulated preview from actual native evidence. Run `git diff --check` and inspect final status. Do not claim native completion from unit tests or browser preview alone.

## Assumptions, risks, and preservation

- "Surrounding icons" means the existing four illustration groups; "original logo" means the repository's original Lisno symbol and lettering. "Move right" places the symbol to the right of the emitted name.
- A three-second, once-per-cold-launch sequence remains the target already established in current code. Only accessibility, recovery, preparation failure, and bounded timeout paths bypass it.
- The worktree is already dirty across mobile startup, navigation, application screens, release documentation, and runtime logs. Initial status and relevant tracked diffs were inspected. Existing splash files, native resources, and untracked assets belong to that baseline and must be preserved. Capture fresh per-target diffs before any later implementation because concurrent work may continue.
- Current code appears to encode the requested choreography. A visual mismatch might arise from presentation details, handoff, or an older installed binary; the root cause is not yet established. Verify before replacing working code.
- Theme matching may expose olive-colored backing inside existing raster artwork. Limit any asset correction to demonstrated incompatibility with the supplied reference.
- Rollback, if needed, restores only changes made for this request. Never discard the pre-existing splash implementation or unrelated dirty work.

## Open input and approval boundary

Required input: reattach the referenced image so its theme can be inspected. Record the resulting palette and any material visual decision in this specification before theme implementation. If that materially changes an already approved specification, obtain revision approval once.

Specification and task plan were approved, and the user selected Mode A. Independent motion work and Android verification have proceeded as recorded in the [task plan](../plans/2026-10-21-mobile-splash-motion-theme.md). The reference-dependent theme change remains pending.
