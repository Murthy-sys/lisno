# Login screen sage redesign — specification

Date: 2026-09-23
Status: Approved 2026-09-23 (D2 resolved: no Google button)
Classification: Small–substantial (single screen, visual; one auth-adjacent open decision)

## Goal

Make `/login` match the supplied reference screenshot as closely as possible: a full-bleed sage-green interior
photograph, editorial serif headline on the left, and a floating off-white sign-in card on the right. Keep all of the
existing sign-in behavior.

## Current behavior and evidence

- Screen: `frontend/src/auth/LoginPage.tsx`. Styles: `frontend/src/auth/login-page.css`, scoped under `.login-screen`.
  Neither file is currently dirty.
- Background: `frontend/public/login-hero.png` (1536×1024). This is a warm walnut and beige living room, not the
  reference's sage arched interior. A dark diagonal scrim plus a base scrim tint it with `--color-primary`.
- Hero: a LISNO logo and wordmark, the eyebrow "DESIGN OPERATIONS, IN FOCUS", the H1 "From first sketch to final
  handoff." in Poppins with light text, the body copy, and a footer line.
- Card: the eyebrow "WELCOME TO LISNO", the H2 "Sign in", a subtitle, labelled Email and Password fields with visible
  labels, a show/hide toggle, "Keep me signed in", "Forgot password?", a yellow `--color-highlight` "Sign in →"
  button, and "New to Lisno? Create a client account".
- Behavior to keep: Zod field validation, Caps Lock hint, the error/neutral banners (invalid credentials,
  unverified email, SSO required, locked, deactivated, rate limited), the 5-attempt pause with a countdown, the
  session-expired notice, the skip link, and redirect via `safeReturnPath`.
- `keepSignedIn` is local UI state only. It is not sent to the backend.
- There is **no Google/OAuth sign-in** anywhere in `backend/src`. The only external-identity hook is the
  `/api/v1/auth/sso` redirect used by the SSO_REQUIRED banner.
- Fonts: `index.html` already loads Poppins, Fraunces, and Playfair Display from Google Fonts.

## Reference design (target)

| Element | Reference |
|---|---|
| Background | Full-bleed sage/green interior: an arch, a window with sheer curtains, a green boucle chair, plants, framed art. Soft and light, with no dark scrim. |
| Handwritten accent | "Spaces / for a better / tomorrow" in a script face, angled, near the top centre, with a small underline stroke |
| Hero H1 | "From first sketch / to final handoff." in a high-contrast serif, near-black olive, about 56–64px on desktop |
| Hero body | "Keep every project, decision, deadline, and approved design moving in one shared workspace." in a sans face, dark olive |
| Divider | A short olive rule, about 50×2px |
| Hero tagline | "Clear ownership. Timely reviews. / Beautiful outcomes." |
| Bottom-left strip | "Spaces \| People \| Ideas \| Better Living" as small decorative text, not links |
| Card | Off-white (#F7F5EF-ish), large radius (about 16px), soft shadow, right-aligned, about 390px wide |
| Card title | "Welcome to Lisno" in serif; subtitle "Sign in to continue" in muted sans |
| Fields | Tall rounded inputs with a leading icon (mail, lock) and **placeholder-style** "Email address" / "Password"; eye toggle on the password field |
| Row | Olive-filled checkbox "Remember me", and an underlined "Forgot password?" |
| Primary button | Full-width dark olive (#3F4B35-ish) "Sign In" with light text and no arrow |
| Separator / Google button | **Omitted** (D2): no Google sign-in exists |
| Footer | "New to Lisno? Create an account" (underlined link) |

## Scope

- Restyle `LoginPage.tsx` markup and the `.login-*` rules in `login-page.css` that only the login screen uses.
- Add a new background asset in `frontend/public/` (see D1).
- Add a sage login palette as local custom properties on `.login-screen`. Global and role theme tokens stay
  unchanged.
- Update copy to match the reference: "Welcome to Lisno", "Sign in to continue", "Remember me", "Sign In",
  "Create an account". The link target stays `/signup`.
- Update `LoginPage.test.tsx`, plus any accessibility or router tests that assert old copy.

### Non-goals

- Signup, Forgot password, Password reset, and Invitation pages. They share `login-page.css`, but the shared-state
  classes (`.login-state`, `.login-summary`, `.login-text-action`, `.login-session-warning`, `.login-banner*`) must
  keep their current look.
- Any change to the auth API, session length, or the semantics of "Remember me". It stays local state, as it is
  today.
- The mobile app login.

## Requirements

1. On a desktop at 1280px or wider, the layout, hierarchy, copy, colors, and typography visually match the
   reference. The hero sits left, the card floats right, and the background photo is visible without a dark scrim.
2. The headline and card title use a serif face that is already loaded (Fraunces or Playfair Display). Body text
   uses Poppins. No new npm dependency is added.
3. Inputs show leading icons from `lucide-react` (`Mail`, `Lock`), which is already a dependency. They keep
   accessible names ("Email address", "Password") through `<label>` elements that are visually hidden. The
   placeholder shows the same text.
4. All existing behavior listed under "Behavior to keep" still works and is still tested.
5. The primary button's accessible name becomes "Sign In". Busy, paused, and countdown states keep their current
   text.
6. The decorative elements (the handwritten accent and the bottom strip) are `aria-hidden` and are not focusable.
7. Responsive: below 1000px the card is centered and the hero stacks below it. At 360px there is no horizontal
   scroll, and touch targets are 44px or larger.
8. Contrast: text on the card and hero meets WCAG AA. Focus rings are visible on the olive and off-white surfaces.
9. `prefers-reduced-motion` is respected, as it is today.

## Open decisions (need your answer)

- **D1 — Background image.** The repo does not contain the reference's green interior photo. I cannot cleanly
  extract it from the screenshot, because the card covers about a third of it and it is only 1137px wide.
  - *Recommended:* you provide the original image, or an equivalent at 1920px or wider, saved as
    `frontend/public/login-hero-sage.jpg`.
  - Alternatively, I crop the screenshot's visible area as a temporary placeholder. The area behind the card
    would be blurry or missing, so this is lower quality.
- **D2 — "Continue with Google" (RESOLVED).** Google sign-in doesn't exist yet, so the Google button and the "or" separator are **left out entirely**. The card goes straight from "Sign In" to "New to Lisno? Create an account". Google sign-in will get its own future spec.
- **D3 — Handwritten accent.** If the new photo already has "Spaces for a better tomorrow" painted into it, no text
  is needed. Otherwise I render it as `aria-hidden` text in a script face. That means adding one Google Fonts
  family (for example "Caveat") to `index.html`. It is a stylesheet link, not an npm dependency.

## Assumptions

- The sage palette applies only to `/login`. Signup and Forgot-password keep their current theme.
- The LISNO logo, wordmark, and "DESIGN OPERATIONS, IN FOCUS" eyebrow are removed, because the reference has
  neither.
- "Create an account" still routes to `/signup`. The existing client-signup gating is unchanged.

## Risks

- Tests that assert old copy, such as "Create a client account", the "Sign in" heading, and the eyebrow, need
  updating. There is a risk of missing one in `router.test.tsx` or `accessibility.test.tsx`.
- Visually hiding labels could hurt accessibility if it is done incorrectly. The `sr-only` class must be used,
  never `display:none`.
- Shared CSS file: overrides must stay scoped to login-only classes, so the other auth pages do not regress.

## Acceptance criteria

- AC1: A rendered `/login` at 1440×900 matches the reference layout, copy, palette, and fonts. This is checked by a
  side-by-side screenshot.
- AC2: `/login` at 390×844 and 360px has a centered card, no horizontal scroll, and no clipped content.
- AC3: Every existing LoginPage behavior test passes, with updated copy. New assertions cover the "Welcome to Lisno"
  heading, the "Sign In" button, the "Remember me" checkbox, and the "Create an account" link to `/signup`.
- AC4: The Email and Password inputs are reachable by label. The decorative text is not in the accessibility tree.
  The accessibility test passes.
- AC5: There is no "Continue with Google" button and no "or" separator. A test asserts that no Google button is present.
- AC6: Signup, Forgot-password, Password-reset, and Invitation pages look unchanged. Their tests pass.
- AC7: `cd frontend && npm run typecheck && npm test && npm run build` passes, and `git diff --check` is clean.

## Data / API / UX impact

- Data/API: none.
- UX: copy and visual changes on `/login` only.
