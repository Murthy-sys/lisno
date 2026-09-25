# Mobile bottom tab bar: compact glass selection — task plan

Spec: [2026-09-24-mobile-bottom-tab-glass-selection-design.md](../specs/2026-09-24-mobile-bottom-tab-glass-selection-design.md) (approved)

## Pre-flight

- Dirty with unrelated uncommitted work:
  - `mobile/src/navigation/AdaptiveAppScaffold.tsx` (+87/-48)
  - `mobile/src/ui/tokens.ts`
  - `mobile/src/navigation/AdaptiveAppScaffold.ui.test.tsx`
- Untracked:
  - `mobile/src/ui/ChromeSurface.tsx`, which exports nothing reusable for reduce-transparency; the hook is private
  - `mobile/src/ui/ChromeSurface.test.tsx`
- Before editing, save `git diff` of each dirty file to the scratchpad. Afterwards, confirm that every earlier line
  is still present.
- Baseline:
  - `npm run typecheck` has **1 existing error**: `DashboardCharts.tsx` cannot find `./ReferenceStatusCharts`.
    This comes from unrelated in-progress work.
  - `npm test` has **1 failing suite**, `scripts/contract-drift.test.ts`. The rest is 645 of 646 passing.

## Tasks (dependency order)

### T1 — Glass tokens (AC2, AC3)
- Owner: primary
- Files: `mobile/src/ui/tokens.ts`. Add keys to `chrome` only.
- Add `glassFill: "rgba(238,240,230,0.14)"`, `glassBorder: "rgba(255,255,255,0.28)"`,
  `glassSheenTop: "rgba(255,255,255,0.18)"`, `glassSheenBottom: "rgba(255,255,255,0)"`, and
  `glassOpaque: colors.shellRaised`. If `colors.shellRaised` does not exist, use the closest existing opaque selected
  shade, which T1 confirms.

### T2 — Glass pill component (AC2, AC3)
- Owner: primary
- Files:
  - `mobile/src/ui/ChromeSurface.tsx`: export the existing `useReducedTransparency` hook. The export is additive.
  - New `mobile/src/navigation/GlassSelection.tsx`, which renders:
    - a background layer (`absoluteFill`, `pointerEvents="none"`, hidden from accessibility)
    - the glass fill and hairline border
    - an SVG vertical sheen from `glassSheenTop` to `glassSheenBottom`
    - soft elevation
  - With reduced transparency it renders the opaque fill and border only, without the sheen.

### T3 — Compact layout and selected pill (AC1, AC4)
- Owner: primary
- Depends on: T1, T2
- Files: `mobile/src/navigation/AdaptiveAppScaffold.tsx`. Change only the compact `NavigationButton` rendering and
  the `bottomBar`, `navButtonCompact`, and new `navPillCompact` style entries.
- Changes:
  - `bottomBar`: `minHeight: 64`, `padding: 4`.
  - The compact cell is a `flex: 1` pressable, with `minHeight: 52` and `justifyContent: "center"`, and at least 48pt
    of hit area. It contains an inner pill `View`: `alignSelf: "center"`, `paddingHorizontal: 14`,
    `paddingVertical: 6`, `borderRadius: 18`, `gap: 2`.
  - When the tab is selected, the pill renders `<GlassSelection />` behind its content.
  - Compact tabs no longer get the `navButtonSelected` tint on the full cell.
  - The rail (`navButtonRail` plus `navButtonSelected`) is unchanged.
  - Keep the `accessibilityRole`, `accessibilityState`, `testID`s (`navigation-selection-dot`), and the pressed and
    disabled styles.

### T4 — Tests (AC2–AC5)
- Owner: primary
- Depends on: T3
- Files:
  - `mobile/src/navigation/GlassSelection.test.tsx` (new): sheen present by default; opaque with no sheen when reduce
    transparency is on (mock `AccessibilityInfo` as `ChromeSurface.test.tsx` does).
  - `AdaptiveAppScaffold.ui.test.tsx`: dirty; add assertions only, without editing existing ones. Check that the
    selected compact tab renders the glass layer and a non-selected one does not, and that
    `accessibilityState.selected` and the dot are still present.

### T5 — Verification (AC1–AC5)
- Owner: primary
- Depends on: T1–T4
- Commands (from `mobile/`):
  - `npm run typecheck`: no new errors beyond the 1 baseline error
  - `npx jest src/navigation src/ui`
  - `npm test`: no new failures beyond `contract-drift`
- `git diff --check` on the touched files, and a comparison of the dirty-file diffs.
- Visual: if an Expo web or simulator preview is available locally, take a screenshot of the bottom bar before and
  after. Otherwise report the visual check as not done.

## Parallelism

- T1 and T2 are independent.
- T3 depends on both. T4 depends on T3.
- The change is small and centred on one component, so parallel sub-agents add little.

## Revision 3 tasks (Instagram-style compact bar)

Decisions (approved spec Revision 3, recommended options): **D-R3a** = full-width flush bar with a top hairline;
**D-R3b** = icons only, with accessibility labels kept; **B** = B2, no `expo-blur`.

Pre-flight:
- `AdaptiveAppScaffold.tsx` and `AdaptiveAppScaffold.ui.test.tsx` remain dirty with unrelated work. Take fresh
  `git diff` snapshots before editing.
- Current baseline: typecheck 0 errors; `npm test` 674 of 675 passing, with only `scripts/contract-drift.test.ts`
  failing.
- Tests tied to the old compact look (`AdaptiveAppScaffold.ui.test.tsx`):
  - lines 128–129: the selection dot
  - lines 142–154: the glass pill and dot
  - line 192: the visible "Home" text inside the tab
  - lines 76–77: the dock inside the bottom inset

### R3-T1 — Compact bar layout (R3-AC1, R3-AC2, R3-AC4)
- Owner: primary
- Files: `mobile/src/navigation/AdaptiveAppScaffold.tsx`. Change only the compact `NavigationButton` branch and the
  `dock`, `bottomBar`, `navButtonCompact`, and `navPillCompact` style entries, renaming `navPillCompact` to
  `navGlassSlot`.
- Changes:
  - `dock`: no horizontal or vertical margins, `borderRadius: 0`, `borderTopWidth: StyleSheet.hairlineWidth`,
    `borderTopColor: chrome.line`.
  - `bottomBar`: `minHeight: 48`, `padding: 0`, `gap: 0`.
  - Compact cell: `flex: 1`, `minHeight: 48`, centred, with `accessibilityLabel={displayLabel}` on the pressable.
  - Inner slot: a 40×40 view with radius 20, centred. When selected it renders `<GlassSelection radius={20} />`,
    then the 24pt icon.
  - Remove the visible label `Text` and the selection dot from the compact branch only.
  - The rail branch is unchanged.
- Delete the now-unused `navLabelCompact` and `selectionDot` / `selectionDotHidden` styles only if nothing else uses
  them. Check the rail first.

### R3-T2 — Tests (R3-AC2, R3-AC3)
- Owner: primary
- Can run in parallel with R3-T1 once the contract below is fixed.
- Files: `mobile/src/navigation/AdaptiveAppScaffold.ui.test.tsx` (dirty; minimal edits).
- Changes:
  - Replace the dot assertions with: no `navigation-selection-dot` on the phone bar, and each tab found by
    `getByRole("tab", { name })` with its selected state.
  - Line 192: assert the accessible name "Home" instead of visible text on phones. Keep the check if it targets the
    rail.
  - Glass: exactly one `navigation-glass-selection` on the phone bar, inside the selected tab, with a `borderRadius`
    of 20. None in the other tabs.
  - Add: the phone bar has no visible label text for the tabs; the bottom chrome has a top hairline border and no
    horizontal margin.
- `GlassSelection.test.tsx` is unchanged, since the `radius` prop is already covered.

### R3-T3 — Verification (R3-AC1–R3-AC5)
- Owner: primary
- Depends on: R3-T1, R3-T2
- Commands (from `mobile/`):
  - `npm run typecheck`
  - `npx jest src/navigation src/ui`
  - `npm test`: compared to the baseline
- `git diff --check`, and the dirty-file preservation comparison against the fresh snapshots.
- Visual: the user checks in the running Expo app, reloading JS; no native rebuild is needed since no dependency is
  added.

Parallelism: R3-T1 and R3-T2 touch different files and can run as two sub-agents against this contract:
- the tab keeps `accessibilityRole="tab"` and `accessibilityLabel={label}`
- the glass `testID` is `navigation-glass-selection` with `radius={20}`
- there is no dot and no visible label on the phone bar
- the rail is unchanged

## Revision 4 tasks (floating content-width capsule, grouped 20pt icons)

Spec: Revision 4 (approved). The user chose "Floating, icons grouped" with 20pt icons.

Pre-flight:
- `NavigationIcon.tsx` is clean. It is also used by `features/dashboard/SuperAdminMobileDashboard.tsx`, so a new
  `size` prop must default to 24.
- `AdaptiveAppScaffold.tsx` and `.ui.test.tsx` are dirty. Take fresh snapshots before editing.
- Baseline: typecheck 0 errors; `npm test` 675 of 676 passing, with only `contract-drift` failing.

### R4-T1 — Icon size prop
- Owner: icon and layout slice
- Files: `mobile/src/navigation/NavigationIcon.tsx`
- Add an optional `size?: number` to `NavigationIcon` (default 24) and to `RootTabIcon`, which passes it through. SVG
  width and height use `size`, and the viewBox stays `0 0 24 24`.

### R4-T2 — Floating grouped capsule
- Owner: icon and layout slice (same agent as R4-T1)
- Files: `mobile/src/navigation/AdaptiveAppScaffold.tsx`. Change only the compact branch and the `bottomInset`,
  `dock`, `bottomBar`, `navButtonCompact`, and `navGlassSlot` style entries.
- Style changes:
  - `bottomInset`: `backgroundColor: colors.canvas`, `alignItems: "center"`.
  - `dock`: `alignSelf: "center"`, `marginBottom: spacing.xs` (about 8), `marginTop: 6`, `borderRadius: 26`,
    `borderWidth: 1`, `borderColor: chrome.line`, `overflow: "hidden"`. Remove the hairline top border and the flush
    zero margins.
  - `bottomBar`: `flexDirection: "row"`, `padding: 4`, `gap: 4`, no `minHeight`, and not stretched.
  - `navButtonCompact`: `width: 44`, `height: 44`, centred, no `flex: 1`. The `navButton` base style has
    `minWidth: 48` and `minHeight: 48`; override both to 44 for compact tabs only.
  - `navGlassSlot`: 36×36 with radius 18, centred. It holds `<GlassSelection radius={18} />` when selected, then
    `<RootTabIcon size={20} …/>`.
- Accessibility (role, label, state), the pressed and disabled styles, and the rail are unchanged.

### R4-T3 — Tests
- Owner: test slice
- Can run in parallel with R4-T1 and R4-T2 against the contract below.
- Files: `mobile/src/navigation/AdaptiveAppScaffold.ui.test.tsx` (dirty; minimal edits).
- Update the Revision 3 flush-bar test and assertions:
  - Bottom chrome: `alignSelf` is `"center"`, `borderRadius` 26, `borderWidth` 1, `marginBottom` greater than 0.
    Remove the zero-margin and top-hairline expectations.
  - Tabs: each phone tab's flattened style has width 44 and height 44, and no `flex` of 1.
  - Replace any `minHeight >= 48` checks on phone tabs with `>= 44`. Keep the 48 checks that apply to the rail.
  - Glass: `borderRadius` 18.
  - Bar: `gap` 4 and `padding` 4.
  - Icon: the selected tab's SVG has width 20. Find it inside the tab and check `props.width`, or the equivalent
    rendered prop.
  - Keep: icon-only tabs, accessible names, no dot, exactly one glass layer.
- Add a unit test to `NavigationIcon`, using an existing test file if there is one or a new
  `NavigationIcon.test.tsx`: the default size is 24 and `size={20}` renders 20.

### R4-T4 — Verification
- Owner: primary
- Depends on: R4-T1 to R4-T3
- Commands (from `mobile/`): `npm run typecheck`, `npx jest src/navigation src/ui src/features/dashboard`, `npm test`
  compared to the baseline, and `git diff --check`.
- Dirty-file preservation, checked against the fresh snapshots.
- Visual check in Expo by the user, with a JS reload only.

Parallelism: R4-T1 and R4-T2 form one slice, and R4-T3 is a separate slice. Their files do not overlap.

Contract between the slices:
- compact tab: 44×44
- `navGlassSlot`: 36pt
- `GlassSelection` radius: 18
- icon size: 20
- dock: `alignSelf: "center"`, radius 26, border 1
- bar: padding 4, gap 4
- `testID`s unchanged
