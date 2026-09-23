# Signup screen sage background — specification

Date: 2026-09-23
Status: Draft, awaiting approval
Classification: Small (one screen, visual only; no API or behavior change)
Related: [Login screen sage redesign](2026-09-23-login-screen-sage-redesign-design.md)

## Goal

Make `/signup` use the same background photo (`frontend/src/assets/login_screen.png`) as `/login`, so the two screens
look like one product.

## Current behavior and evidence

- `frontend/src/auth/SignupPage.tsx`, which is clean in git, renders `/login-hero.png`, the warm-brown room. It lays
  a dark purple diagonal scrim and a base scrim over it, with light hero text: a LISNO logo and wordmark, the eyebrow
  "YOUR PROJECT, IN VIEW", the heading "Follow every design decision.", the body copy, and the footer "Clear updates.
  Confident approvals. Beautiful outcomes.".
- The card has the eyebrow "CLIENT PORTAL", the H1 "Create your client account", a subtitle, and fields with visible
  labels: name, email, mobile, password, and confirm password. It also has "Create client account" with an arrow, a
  hairline, and "Already have an account? Sign in".
- `/login` now uses the `.login-screen--sage` variant in `login-page.css`: the sage photo, dark serif hero text, an
  off-white card, and an olive button.
- **Swapping only the image fails.** The light hero text would sit on the pale sage wall and fall below WCAG AA
  contrast. The purple scrim would also tint the green photo.
- No test asserts the signup hero copy, the eyebrow text, or the background `src`.

## Proposed behavior (recommended)

Apply the same sage treatment as login to `/signup`:

1. Use the background `login_screen.png` import, the light sage scrim, and no purple scrims.
2. Hero:
   - Match login's structure: a serif title, the body copy, a short olive rule, and a tagline.
   - Keep the signup wording: "Follow every design decision." / body / "Clear updates. Confident approvals.
     Beautiful outcomes.".
   - Remove the logo, wordmark, and eyebrow, as on login.
   - Add the same decorative handwritten accent and the "Spaces | People | Ideas | Better Living" strip, both
     `aria-hidden`.
3. Card:
   - Use the sage card, a serif title "Create your client account", and a muted subtitle.
   - Remove the "CLIENT PORTAL" eyebrow and the hairline.
   - Use the olive submit button "Create client account" with no arrow. Busy text stays unchanged.
   - Use login-style footer link styling.
4. **Keep visible field labels** on signup. It has five fields, and the mobile and password rules need labels to stay
   usable, so labels are not replaced with placeholders. The labels get sage colors.
5. The card may be taller than the viewport, so the page scrolls normally with no clipping.

## Scope and non-goals

- In scope: the markup and classes in `SignupPage.tsx`, and new sage rules scoped under `.login-screen--sage` in
  `login-page.css`, such as label color and card-title sizing for a taller card.
- Non-goals:
  - signup validation, the API, or the redirect
  - the field set and field copy
  - Forgot-password, Password-reset, and Invitation pages
  - `/login` itself: no visual change, which is verified

## Acceptance criteria

- AC1: At 1440×900, `/signup` shows the sage photo, a dark serif hero, and a sage card with an olive button. It looks
  consistent with `/login` (screenshot).
- AC2: At 390px and 360px there is no horizontal scroll, the card is fully reachable by scrolling, and nothing is
  clipped.
- AC3: All `SignupPage.test.tsx` tests pass. A test asserts that the background uses `login_screen` and that the
  decorative text is `aria-hidden`.
- AC4: `/login` is visually unchanged and its tests still pass. `/forgot-password` is unchanged.
- AC5: `cd frontend && npm run typecheck && npm run build` passes. The focused auth tests pass. `git diff --check` is
  clean.

## Risks

- The sage rules are shared with login. New rules must not change login's appearance, which is checked by a login
  screenshot.
- A tall card on short viewports is handled by the grid's existing `min-height` and page scroll.

## Open decision

- None required. The alternative, swapping the image only and keeping the purple look, is not recommended because of
  the contrast failure above.
