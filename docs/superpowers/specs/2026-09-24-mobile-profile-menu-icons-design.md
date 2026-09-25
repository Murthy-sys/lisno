# Mobile profile menu: themed icons with Sign out as an icon item — specification

Date: 2026-09-24
Status: Approved 2026-09-24 (D1 = icon plus label; D2 = drop the outline, keep red icon and text, with a divider)
Classification: **Small.** A presentation-only change in one mobile component. There are no data, API, permission,
or behaviour changes.

## Goal

In the Profile menu (opened from the Profile tab), show **Sign out as an icon item** instead of a red outlined text
box, and make the menu **match the app theme** (sage/olive palette and the existing line-icon style).

## Current behavior and evidence

- `mobile/src/navigation/ProfileMenu.tsx` renders two text-only rows:
  - **"Profile"**: ink text.
  - **"Sign out"**: a full-width box with a 1pt `colors.danger` border, `colors.danger` semibold text, and a
    `dangerSoft` fill when pressed.
- In the user's screenshot, the red outlined box looks heavy and out of place next to the plain Profile row.
- Icons in the app are custom `react-native-svg` line icons in `mobile/src/navigation/NavigationIcon.tsx`: a 24
  viewBox, round caps and joins, and the stroke uses the passed colour. There is no icon library dependency.
- Theme tokens (`mobile/src/ui/tokens.ts`):
  - `ink` `#1f2a1c`
  - `accent` `#a9b89a`
  - `danger` `#B42318`
  - `dangerPressed` `#8f1d13`
  - `dangerSoft` `#FFF0EE`
  - `surfaceMuted`, `border`

## Proposed behavior

1. **Both rows get a leading 20pt line icon**, drawn in the same style as the navigation icons:
   - **Profile**: a person icon, in `colors.ink`.
   - **Sign out**: a log-out icon (a door with an arrow pointing out), in `colors.danger`.
2. **Sign out row:**
   - The icon and the label "Sign out" are both `colors.danger`, and the label is semibold.
   - The full-width red outline is removed, so the row matches the Profile row's shape.
   - Pressing it shows the `dangerSoft` fill, and while signing out the icon and label switch to `dangerPressed`.
   - A hairline `colors.border` divider separates it from Profile.
3. **Profile row:** the same layout as Sign out: 48pt minimum height, icon, then label with a 12pt gap. Pressing it
   shows the existing `surfaceMuted` fill.
4. **Accessibility:**
   - The accessible names stay "Profile" and "Sign out", with role `menuitem`.
   - Icons are decorative and hidden from screen readers.
   - Busy and disabled states on Sign out are kept.
5. **Behaviour is unchanged:** Profile opens `/profile`, and Sign out logs out and then goes to `/sign-in`, with the
   double-tap guard. Close on the backdrop or back, the focus on open, and the Reduce Motion handling are all
   unchanged.
6. New icon glyphs are added to the existing `NavigationIcon.tsx` icon set (`person` and `sign-out`), so styling
   stays in one place. There are no new dependencies.

## Scope and non-goals

- In scope: `ProfileMenu.tsx`, the new glyphs in `NavigationIcon.tsx`, and the tests.
- Non-goals:
  - the menu position or size
  - other screens' Sign out buttons, such as on the More screen
  - the app-wide button styles
  - the profile screen

## Invariants

- Sign-out behaviour and its route are unchanged. Bottom-bar icons, the dock, and the More and Profile tabs are
  unchanged.
- Only theme tokens are used, with no new hard-coded colours.

## Risks

- **Dropping the outline** departs from the app-wide rule that negative actions are shown as red text with a red
  outline. It still reads as negative through the red icon and text. See D2.

## Acceptance criteria

- AC1: The menu shows a person icon with "Profile" and a log-out icon with "Sign out". Sign out's icon and text are
  theme red, and there is no heavy outlined box (per D2).
- AC2: Tapping Sign out still logs out and routes to `/sign-in`. Tapping Profile opens `/profile`.
- AC3: The icons are hidden from screen readers. The items are still announced as "Profile" and "Sign out" menu items.
- AC4: Mobile typecheck passes, the navigation tests pass, the full suite matches the baseline (only
  `contract-drift` fails), and `git diff --check` is clean.

## Open decisions

- **D1 — Icon form.** *Recommended:* an icon **plus** the "Sign out" label, which is clearer and matches the Profile
  row. The alternative is a compact **icon-only** Sign out button, with the accessible name "Sign out", placed at the
  right end of the Profile row.
- **D2 — Red outline.** *Recommended:* drop the outline and keep the red icon and text, with a divider above it. The
  alternative is to keep a thin red outline around the Sign out row, matching the app-wide negative-button rule.
