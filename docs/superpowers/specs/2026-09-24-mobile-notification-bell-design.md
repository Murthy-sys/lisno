# Mobile top bar: redesigned notification bell — specification

Date: 2026-09-24
Status: Approved 2026-09-24 (D1 = 36pt glass circle; D2 = no unread indicator in this change)
Classification: **Small.** A presentation-only change to one icon glyph and one button style. There are no data,
API, or permission changes, unless D2's alternative is chosen.

## Goal

The notification bell in the mobile top bar "is not looking good". Replace it with a cleaner, well-proportioned
bell that fits the app's sage/olive theme and its line-icon style.

## Current behavior and evidence

- `mobile/src/navigation/AdaptiveAppScaffold.tsx:128–130`:
  - The top bar's right side is a bare 48×48 `Pressable` (`notificationButton`), accessible name "Open
    notifications". It routes to `/feature/notifications`.
  - It renders `NavigationIcon name="notifications"` at the default 24pt in `chrome.ink` (`#eef0e6`, cream) on the
    dark olive top chrome.
- The glyph, `NavigationIcon.tsx`, is
  `M8.5 19a3.5 3.5 0 0 0 7 0 M5 16.5h14l-2-3V9a5 5 0 0 0-10 0v4.5l-2 3Z M11 3h2`.
  Three problems:
  - The body is boxy, with a straight-sided dome.
  - A detached horizontal dash floats above the bell (`M11 3h2`), where a handle should be.
  - The clapper arc is large and sits far below the rim, so the icon looks bottom-heavy and unbalanced.
- There is no container, so the bell floats alone next to the wordmark. By contrast, the bottom dock uses glass
  circles (`GlassSelection`, `chrome.glassFill` / `glassBorder`).
- The bottom bar's `notifications` icon is not used as a tab. The glyph is used only here.

## Proposed behavior

1. **New bell glyph**, replacing the `notifications` path in `NavigationIcon.tsx`, in the same 24 viewBox and stroke
   style:
   - A smooth rounded dome that flares at the rim: `M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9`.
   - A small, tight clapper arc under the rim: `M10.3 21a1.94 1.94 0 0 0 3.4 0`.
   - No floating dash.
2. **Rendered at 20pt**, matching the dock's 20pt icons, in `chrome.ink`.
3. **Themed glass button:**
   - The bell sits in a 36pt circle with a `chrome.glassFill` fill and a hairline `chrome.glassBorder` border. This
     is the same glass language as the selected dock tab, but static. It honours Reduce Transparency by switching
     to `chrome.glassOpaque`, as `GlassSelection` does.
   - The touch target stays 48×48, with the circle centred inside it.
   - The pressed state slightly deepens the fill.
   - The disabled state is unchanged (the existing `styles.disabled`).
4. **Unchanged:**
   - the accessible name "Open notifications", its role, the disabled state, and the route
   - the wordmark
   - the top bar height, 52pt

## Scope and non-goals

- In scope:
  - the `notifications` glyph in `NavigationIcon.tsx`
  - the notification button in `AdaptiveAppScaffold.tsx`, along with its styles
  - the tests
- Non-goals:
  - an unread badge, unless D2's alternative is chosen
  - the notifications screen
  - bottom-bar icons
  - the profile menu

## Invariants

- Only theme and chrome tokens are used, with no new hard-coded colours.
- The minimum 48pt touch target and accessibility are unchanged.
- Other `NavigationIcon` glyphs are byte-identical.

## Acceptance criteria

- AC1: The top bar shows the new bell (rounded dome, flared rim, small clapper, no floating dash) at 20pt, inside a
  36pt glass circle, on the right of the wordmark.
- AC2: Tapping it still opens `/feature/notifications`. It is announced as "Open notifications", is disabled while
  navigation is blocked, and keeps a 48pt target.
- AC3: With Reduce Transparency on, the circle uses the opaque glass token.
- AC4: Mobile typecheck passes, the navigation tests pass, the full suite matches the baseline (only
  `contract-drift` fails), and `git diff --check` is clean.

## Open decisions

- **D1 — Container.** *Recommended:* a 36pt glass circle, which matches the dock. The alternative is a bare bell
  with the new glyph only.
- **D2 — Unread indicator.** *Recommended:* not in this change, which stays visual only. The alternative is to add a
  small unread dot or count badge on the bell. That needs an unread count from the notifications API, which is a
  data change, so it would be a separate follow-up spec.
