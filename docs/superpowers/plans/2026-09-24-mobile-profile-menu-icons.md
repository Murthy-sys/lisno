# Mobile profile menu: themed icons with Sign out as an icon item — task plan

Spec: [2026-09-24-mobile-profile-menu-icons-design.md](../specs/2026-09-24-mobile-profile-menu-icons-design.md)
(approved; D1 = icon plus label, D2 = drop the outline and keep the red icon and text, with a divider)

## Pre-flight facts

- The target files are uncommitted work from the profile-tab change, which is not yet committed:
  - `mobile/src/navigation/ProfileMenu.tsx` and `ProfileMenu.test.tsx` are untracked.
  - `NavigationIcon.tsx` is clean and matches HEAD.
- Snapshot `git status --short` and `git diff` before writing. Only the files listed below may change.
- `NavigationIcon.tsx`:
  - `NavigationIconName` is a string union.
  - Glyphs are `Path` or `Circle` elements in a 24 viewBox, and the stroke uses the `color` prop, 1.7 wide, or 2
    when selected.
  - The SVG is already hidden from screen readers.
- Current `ProfileMenu` styles: `item` (48pt min, radius `radii.control`), `signOut` (`borderColor: colors.danger`),
  `signOutPressed` (`dangerSoft`), and `signOutLabel` (`danger`, semibold).
- Baseline: mobile typecheck passes, and `npx jest` has one known failure, `scripts/contract-drift.test.ts`.

## Tasks (dependency order)

### T1 — Icon glyphs (spec 6; AC1, AC3)
- Owner: mobile navigation slice.
- File: `mobile/src/navigation/NavigationIcon.tsx`.
- Add `"person"` and `"sign-out"` to `NavigationIconName` and export the type.
  - Person: a head circle plus shoulders arc, for example `Circle cx=12 cy=8 r=3.6` and
    `Path "M5 20a7 7 0 0 1 14 0"`.
  - Sign out: a door plus an outward arrow, for example
    `Path "M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8M10 12h10M17 9l3 3-3 3"`.
- The change is additive: existing glyphs, `iconForTab`, and `RootTabIcon` are unchanged.
- Test: `NavigationIcon.test.tsx` renders the new names, with the stroke taken from `color`, and the SVG hidden from
  screen readers.

### T2 — Profile menu rows (spec 1–5; AC1–AC3)
- Owner: the same slice.
- Depends on: T1.
- File: `mobile/src/navigation/ProfileMenu.tsx`.
- Each row is laid out as `flexDirection: "row"`, `alignItems: "center"`, with a 12pt gap (`spacing.sm` if that is
  12, otherwise the matching token), and a 20pt `NavigationIcon`.
  - Profile: the `person` icon in `colors.ink`.
  - Sign out: the `sign-out` icon in `colors.danger`, or `colors.dangerPressed` while signing out.
- Remove `borderColor: colors.danger` from the Sign out row.
- Add a hairline `colors.border` divider between the two rows.
- Keep the `dangerSoft` pressed fill, the `surfaceMuted` pressed fill on Profile, and all behaviour, accessibility
  props, and focus and motion logic.
- Test (`ProfileMenu.test.tsx`):
  - Both icons render and are hidden from screen readers.
  - The items are still announced as "Profile" and "Sign out" menu items.
  - The Sign out row has no border colour of `colors.danger`.
  - The Sign out icon and label use `colors.danger`.
  - The existing Profile and Sign out navigation and logout tests still pass.

### T3 — Review and verification (AC4)
- Owner: primary.
- Depends on: T2.
- Review the diff: only `NavigationIcon.tsx` (additive), `ProfileMenu.tsx`, and their tests change, and all colours
  come from tokens.
- Checks:
  - `cd mobile && npm run typecheck`
  - `npx jest src/navigation`
  - `npx jest` compared to the baseline
  - `git diff --check`
- Visual: the user checks the menu in Expo.

## Parallelism

None. T1 and T2 are one small slice, and T2 depends on T1's glyphs. T3 follows.
