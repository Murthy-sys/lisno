# Mobile bottom tab bar: compact glass selection — specification

Date: 2026-09-24
Status: Revision 4 approved and implemented 2026-09-24 (floating content-width capsule, 20pt grouped icons)
Classification: Small (mobile app, one component's presentation; no navigation, API, or behavior change)

## Goal

On the mobile app's bottom tab bar (Home / Projects / Messages / More), reduce the oversized padding around the
selected tab and give the selected tab a **glassmorphism** look.

## Current behavior and evidence

- Component: `mobile/src/navigation/AdaptiveAppScaffold.tsx`, via `NavigationButton` in compact mode inside
  `ChromeSurface edge="bottom"`. **The file has unrelated uncommitted work** (+87/-48). Edits must be limited to the
  compact-tab style entries and the selected-state rendering, preserving everything else.
- Styles, around lines 171–182:
  - `bottomBar`: `minHeight: 80, padding: 6`
  - `navButtonCompact`: `flex: 1, minHeight: 68, paddingVertical/Horizontal: spacing.xxs, borderRadius: 24`
  - `navButtonSelected`: `backgroundColor: chrome.selected` (`rgba(169,184,154,0.18)`),
    `borderColor: chrome.selectedBorder` (a solid sage `#a9b89a`)
- The selected pill fills the whole tab cell, so it looks tall and wide with a hard, flat outline (per the
  screenshot).
- Tokens: `mobile/src/ui/tokens.ts`, `chrome.*`. `ChromeSurface` already renders SVG lighting and respects the OS
  **Reduce Transparency** setting through `AccessibilityInfo`.
- No blur library is installed (`expo-blur` is absent). `react-native-svg` is available.

## Proposed behavior

1. **Tighter layout:**
   - `bottomBar`: `minHeight` 80 → about 64, `padding` 6 → 4.
   - Compact tab `minHeight` 68 → about 52, keeping a 48pt or larger touch target, with vertical padding of about
     6pt.
   - The selected pill hugs its content: icon, label, and dot, with about 14pt of horizontal padding. It is centred
     in the cell rather than stretched to the full cell width, and has a radius of about 18.
   - The dock's outer radius and margins are unchanged, apart from following the smaller height.
2. **Glass selected tab**, with no new dependency:
   - Fill: translucent light, about `rgba(238,240,230,0.14)`.
   - Border: a 1px light hairline, about `rgba(255,255,255,0.28)`, replacing the solid sage border.
   - Sheen: a subtle top-to-bottom highlight, from white at about 18% down to 0% at about 60% height, drawn with
     `react-native-svg`, which is already used by `ChromeSurface`. It is non-interactive and hidden from
     accessibility.
   - A soft shadow or elevation to lift it slightly off the dock.
   - New tokens go in `chrome`: `glassFill`, `glassBorder`, `glassSheen`.
3. **Reduce Transparency on:** the pill falls back to an opaque selected fill with the same border, using the same
   `useReducedTransparency` behavior as `ChromeSurface`. Nothing is translucent.
4. **Unchanged:**
   - tab set and order, labels, icons and their colors
   - the selection dot
   - `accessibilityRole` and `accessibilityState`
   - the disabled and pressed states and navigation behavior
   - the tablet rail (`navButtonRail`) and the top bar

## Non-goals

- A true backdrop blur. That needs `expo-blur` and a native rebuild, which can be a later follow-up if wanted.
- Other screens.
- Web or frontend changes.

## Risks

- The file is dirty. The unrelated in-progress changes must remain byte-for-byte outside the touched style entries.
  This is checked by comparing `git diff` before and after.
- Smaller heights must not clip larger accessibility font sizes. The label keeps `adjustsFontSizeToFit` and
  `minimumFontScale`.

## Acceptance criteria

- AC1: The bottom bar is about 64pt tall, not 80. The selected pill hugs its content with about 14pt horizontal and
  about 6pt vertical padding (visual check in a simulator or web preview screenshot).
- AC2: The selected tab shows a translucent light fill, a light hairline border, and a top sheen, with no solid sage
  outline.
- AC3: With Reduce Transparency on, the selected tab is opaque and has no sheen.
- AC4: Touch targets stay at 48pt or more. Selection state is still announced, and the selection dot still renders.
- AC5: `cd mobile` checks pass: the typecheck, and the tests for `AdaptiveAppScaffold` and `ChromeSurface`, plus the
  full default suite compared with the baseline. Only the intended hunks change in the dirty file.

## Addendum (2026-09-24): translucency defect fixed; real backdrop blur requested

**Defect fixed (within the approved scope):**
- On device, the selected pill rendered solid white.
- Root cause, confirmed by test: `react-native-svg` encoded the `rgba()` stop colours as opaque white (`-1` =
  `0xFFFFFFFF`).
- The sheen now uses `stopColor="#ffffff"` with explicit `stopOpacity` values of 0.14 and 0.
- The fill is `rgba(255,255,255,0.10)` and the border `rgba(255,255,255,0.22)`.
- A regression test asserts the encoded alpha of the sheen.

**New request:** "opacity with the same blurred way": a real frosted blur of the dock behind the pill.

- **Proposal:**
  - Add `expo-blur` (`npx expo install expo-blur`, SDK-matched version) as a new dependency.
  - In `GlassSelection`, render `<BlurView intensity≈25 tint="dark" experimentalBlurMethod="dimezisBlurView"
    (Android)>` as the bottom layer, then the translucent fill, the hairline border, and the sheen on top.
  - On Android, a true backdrop blur needs `experimentalBlurMethod`. Without it, Android falls back to a translucent
    tint.
  - With Reduce Transparency on, keep the opaque fallback and no blur.
- **Cost:**
  - It is a new native module, and the project has a native `android/` folder, so the **Android app must be rebuilt**
    (`npx expo run:android`, or a new dev or EAS build) before the blur appears. A JS reload alone will fail at
    runtime.
  - `package.json` and the lockfile change.
  - Blur has a small per-frame GPU cost on low-end Android.
- **Visual note:** the pill sits on the dark olive dock, so the blur softens only the dock's own gradient. The effect
  is subtle, a smoky frosted olive, not a white panel.
- **Acceptance:**
  - The selected pill shows a frosted translucent olive with the gradient behind it softly blurred, and no white.
  - It is opaque when Reduce Transparency is on.
  - Tests mock `expo-blur`.
  - Typecheck and the suite pass against the baseline.
  - The Android build succeeds after the rebuild. This last step is performed by the user.

- **Decision:**
  - **B1, recommended:** add `expo-blur` as above.
  - **B2:** no new dependency. Keep the fixed translucent glass, which is smoky and semi-transparent but with no
    real blur.

## Revision 3 (2026-09-24): Instagram-style compact bottom bar

**Feedback:** the bar is still too tall. The user wants small icons and only the necessary padding, "like the
Instagram bottom nav bar".

**Current, after the earlier revisions:**
- `dock`: a floating capsule with an 8pt side margin, 6pt top and 8pt bottom margin, and a 40pt radius.
- `bottomBar`: 64pt with 4pt padding.
- Tab cell: 52pt.
- Pill: 14/6pt padding.
- 24pt icon in a 32×26 box.
- 11pt label on a 16pt line.
- 4pt dot.

The visible bar is about 64pt plus about 14pt of margins, plus the safe area.

**Instagram reference pattern:**
- a single row of 24pt icons, no text labels, evenly spaced
- about 48–50pt tall plus the bottom safe area
- the selected state shown by a filled or bolder icon, not a large container

**Proposed:**
1. **Height:**
   - The bar content is **48pt** tall, with no internal padding apart from 0–2pt.
   - Each tab cell is a `flex: 1` pressable, 48pt tall, which keeps the 48pt minimum touch target.
   - The bottom safe-area inset is added below the bar, as today.
2. **Icons only:**
   - Keep the 24pt icons.
   - **Hide the visible text labels.** Each tab keeps its `accessibilityLabel`, the label text, so screen readers
     still announce "Home, tab, selected".
   - Remove the selection dot.
3. **Selected state:**
   - The icon uses the selected colour and 2pt stroke, as today.
   - A small **glass circle**, 40×40 with radius 20, sits behind the icon only. It uses the fixed translucent glass
     (fill, hairline, and sheen) and the Reduce Transparency fallback.
   - No wide pill.
4. **Dock shape (decision D-R3a):**
   - **Recommended, Instagram-style:** a full-width bar flush to the screen edges, with a 1px top hairline
     (`chrome.line`) and no floating margins or large radius. The olive chrome surface is kept.
   - Alternative: keep the floating capsule, with its margins reduced to 6pt and its radius to 28.
5. **Labels (decision D-R3b):**
   - **Recommended:** icons only, as above, like Instagram.
   - Alternative: keep tiny 10pt labels under the icons. The bar becomes about 54pt.
6. **Blur (decision B, carried over from Revision 2):**
   - **Recommended: B2.** No `expo-blur` for now. On the small 40pt circle, a backdrop blur is barely visible, and it
     would force an Android rebuild.
   - B1, add `expo-blur`, stays available as a follow-up.
7. **Unchanged:**
   - tab set and order, navigation, disabled and pressed states
   - `accessibilityRole="tab"`, `accessibilityState`
   - the tablet rail and the top bar

**Tests to update:**
- The existing scaffold UI tests that assert the selection dot or visible labels on the phone bar will be updated to
  assert accessibility labels instead.
- The glass tests are kept, re-targeted to the circle.

**Acceptance:**
- R3-AC1: With the recommended decisions, the phone bar is 48pt plus the safe area, and full width with a top
  hairline.
- R3-AC2: Only icons are visible. Each tab is announced with its label and selected state.
- R3-AC3: The selected icon has a 40pt glass circle behind it, which is opaque under Reduce Transparency. There is no
  dot and no wide pill.
- R3-AC4: Touch targets are 48pt or larger.
- R3-AC5: The mobile typecheck and suite pass against the baseline (only `contract-drift` fails). Dirty-file
  preservation is verified.

## Revision 4 (2026-09-24): floating, content-width capsule with grouped small icons

**Feedback on Revision 3:** the user does not want the flush full-width bar. They want the floating rounded olive bar
from their screenshot, with no labels, smaller icons, and minimal padding and space between icons.

**User choices (via clarification):**
- Layout: "Floating, icons grouped".
- Icon size: **20pt**.

**Proposed:**
1. **Floating capsule, sized to its content:**
   - The dock no longer spans the screen width. It is a rounded capsule, radius 26 or fully rounded, **centred
     horizontally** with `alignSelf: "center"`.
   - It sits above the bottom safe area with a margin of about 8pt, and its width is set by the icons.
   - The olive chrome surface, with its translucent tint and sheen, and the Reduce Transparency fallback are kept.
   - The Revision 3 top hairline is removed; the capsule keeps a subtle 1px `chrome.line` border all round.
   - The bottom inset background goes back to the page canvas (`colors.canvas`), so the capsule visibly floats.
2. **Grouped icons, tight spacing:**
   - Each tab is a fixed **44×44pt** tap target (the iOS HIG minimum), no longer `flex: 1`.
   - Tabs sit side by side with a **4pt gap**, and the capsule has **4pt padding**.
   - Visible capsule height: 44 + 8 = **52pt**.
   - With 4 tabs, the capsule is about 4·44 + 3·4 + 8 = **196pt** wide.
3. **Icons:** 20pt, down from 24pt. Stroke is 1.7 when unselected and 2 when selected, and the colours are unchanged.
   This needs a `size` prop on `NavigationIcon`, which defaults to 24 so the rail and other uses are unchanged.
4. **Selected:** a **36pt** glass circle, radius 18, behind the icon, using the fixed translucent glass and the Reduce
   Transparency fallback. There are no labels and no dot, as in Revision 3.
5. **Accessibility is unchanged from Revision 3:** `accessibilityRole="tab"`, `accessibilityLabel`, and
   `accessibilityState.selected`.
6. **Unchanged:**
   - the tablet rail and the top bar
   - tab set and order, and navigation
   - no new dependency, and no rebuild

**Note:** the tap target goes from 48pt to 44pt so the icons can sit closer together. That still meets Apple's 44pt
minimum; Android's guidance recommends 48dp.

**Acceptance:**
- R4-AC1: The phone bar is a centred floating capsule about 196×52pt that does not stretch across the screen, with
  canvas visible on both sides and below it above the safe area.
- R4-AC2: The icons are 20pt with no labels and no dot. Tabs are 44×44 with 4pt gaps and 4pt capsule padding.
- R4-AC3: The selected tab has a 36pt glass circle, opaque under Reduce Transparency.
- R4-AC4: Tabs are announced with their name and selected state. The rail is unchanged.
- R4-AC5: The mobile typecheck and suite pass against the baseline (only `contract-drift` fails). Dirty-file
  preservation is verified.
