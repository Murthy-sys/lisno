# Lisno logo on login and signup — specification

Date: 2026-09-23
Status: Draft, awaiting approval
Classification: Small (visual only, two screens, no API or behavior change)
Related: [Login sage redesign](2026-09-23-login-screen-sage-redesign-design.md),
[Signup sage background](2026-09-23-signup-screen-sage-background-design.md)

## Goal

Show the Lisno logo on both `/login` and `/signup`, which now share the sage design.

## Current behavior and evidence

- Both screens use `.login-screen--sage`. Neither shows a logo now: the old logo and wordmark were removed during the
  sage redesign.
- Asset: `frontend/public/lisno-logo.svg` (110×30 viewBox) is the full logo, an icon plus the "LISNO" wordmark, drawn
  in `#1E183B`, which is the brand navy.
- `lisno-logo-icon.svg` uses the same 110×30 canvas. The old hero cropped it with a CSS mask to show only the icon.
- Existing login and signup tests do not assert a logo.

## Proposed behavior

1. One logo per screen, placed **top-left of the page**: aligned with the hero's left edge, above the headline, at
   about 32px tall on desktop. The markup is shared by both screens.
2. Draw it with the full `lisno-logo.svg` as a CSS mask, filled with the sage ink color (`--sage-ink`), so it matches
   the green palette rather than the navy brand color.
   - *Alternative:* render the SVG as-is in its original navy. Say so if you prefer the original brand color.
3. Accessibility:
   - `role="img"` with `aria-label="Lisno"`, so there is one logo name on each page.
   - Not a link: there is no public home page to link to.
4. Responsive:
   - Below 1000px, where the card stacks first, the logo sits at the top of the page above the card, centred
     horizontally, at about 28px tall.
   - At 360px there is no overlap or horizontal scroll.
5. `/forgot-password`, `/reset-password`, and invitation pages are unchanged. They keep their existing logo.

## Scope and non-goals

- In scope:
  - `LoginPage.tsx` and `SignupPage.tsx`: one logo element each.
  - `login-page.css`: a new `.login-screen--sage .login-logo` rule and small spacing adjustments.
  - `LoginPage.test.tsx` and `SignupPage.test.tsx`: an assertion that the logo exists.
- Non-goals:
  - logo asset changes
  - the favicon
  - the in-app header logo
  - other auth pages

## Acceptance criteria

- AC1: At 1440×900, both screens show the Lisno logo top-left, above the headline, in sage ink. The rest of the
  layout is unchanged (screenshot).
- AC2: At 390px and 360px the logo is visible above the card on both screens, with no overlap or horizontal scroll.
- AC3: `getByRole("img", { name: "Lisno" })` finds exactly one logo on each screen. The focused login and signup
  tests pass.
- AC4: `npm run typecheck` and `npm run build` pass, and `git diff --check` is clean.
