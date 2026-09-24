# Mobile top bar: redesigned notification bell — task plan

Spec: [2026-09-24-mobile-notification-bell-design.md](../specs/2026-09-24-mobile-notification-bell-design.md)
(approved; D1 = 36pt glass circle, D2 = no unread indicator)

## Pre-flight facts

- Target files, which already have uncommitted work from earlier approved changes:
  - `mobile/src/navigation/NavigationIcon.tsx`: already modified with the person and sign-out glyphs.
  - `NavigationIcon.test.tsx`.
  - `AdaptiveAppScaffold.tsx`: modified for the profile tab and top bar. The button is at lines 128–130, and the
    `notificationButton` style is at line 177.
  - `AdaptiveAppScaffold.ui.test.tsx`: its existing tests find the button by role and the name "Open notifications"
    (lines 103, 123, 232, 350, 402).
- Snapshot `git status --short` and `git diff` before writing. Only the notification glyph, button, and styles may
  change in these files.
- `GlassSelection.tsx` already provides the glass fill, the hairline border, the top sheen, and the Reduce
  Transparency fallback to `chrome.glassOpaque`.
  - Its props are `testID` and `radius`, and it is decorative: `pointerEvents="none"` and hidden from screen readers.
  - It fills its parent, so it can be placed inside a 36pt circle with `radius={18}` and needs no changes.
- Baseline: mobile typecheck passes, and the full jest run has only the known `contract-drift` failure.

## Tasks (dependency order)

### T1 — Bell glyph (spec 1; AC1)
- Owner: mobile navigation slice.
- File: `NavigationIcon.tsx`.
- Replace only the `notifications` element with
  `<Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />`.
- All other glyphs stay byte-identical.
- Test (`NavigationIcon.test.tsx`): the `notifications` glyph renders the new path, contains no `M11 3h2` segment, and
  stays hidden from screen readers.

### T2 — Glass circle button (spec 2–4; AC1–AC3)
- Owner: the same slice.
- Depends on: T1.
- File: `AdaptiveAppScaffold.tsx`.
  - Keep the `Pressable` and all its props: label, role, accessibility state, `disabled`, `onPress`, and the 48×48
    `notificationButton` style.
  - Inside it, add a 36×36 View (`notificationCircle`: `borderRadius` 18, centred, `overflow: "hidden"`). The View
    contains:
    - `<GlassSelection testID="notification-glass" radius={18} />`, reused as is
    - the `NavigationIcon name="notifications"` at `size={20}` in `chrome.ink`
  - When pressed, the circle's opacity is 0.8, through the style callback on `Pressable`. The disabled style is
    unchanged.
  - GlassSelection is already imported, because the dock uses it.
- Tests (`AdaptiveAppScaffold.ui.test.tsx`):
  - The button still has the name "Open notifications" and still routes to `/feature/notifications`.
  - It is disabled while navigation is blocked.
  - It contains `notification-glass` inside a 36pt circle, with the icon at 20pt.
  - With Reduce Transparency mocked on, the glass uses `chrome.glassOpaque`, following the existing GlassSelection
    test pattern.
  - The existing top-bar test still passes.

### T3 — Review and verification (AC4)
- Owner: primary.
- Depends on: T2.
- Review the diff against the pre-write snapshot: only the glyph line, the button's children and styles, and the
  tests change.
- Checks:
  - `cd mobile && npm run typecheck`
  - `npx jest src/navigation`
  - `npx jest` compared to the baseline
  - `git diff --check`
- Visual: the user checks the bell in Expo.

## Parallelism

None. This is one small slice, and T2 uses T1's glyph. T3 follows.
