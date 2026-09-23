# Login screen sage redesign — task plan

Spec: [2026-09-23-login-screen-sage-redesign-design.md](../specs/2026-09-23-login-screen-sage-redesign-design.md) (approved)

## Pre-flight facts

- `frontend/src/auth/LoginPage.tsx` and `frontend/src/auth/login-page.css` are clean.
- `frontend/src/app/router.test.tsx` and `frontend/src/test/accessibility.test.tsx` already have **unrelated
  uncommitted changes**. Edit only the specific login-copy assertion lines listed below. Never revert, reformat, or
  stage anything else in these files.
- `SignupPage.tsx`, `ForgotPasswordPage.tsx`, and `role-themes.css` also use `/login-hero.png`. Keep that file
  unchanged and add a new asset alongside it.
- These tests assert the old heading "Sign in" (the H2 becomes "Welcome to Lisno"):
  - `src/App.test.tsx:13`
  - `src/app/router.test.tsx:1338, 1550, 1570, 1634, 1647`
  - `src/auth/SignupPage.test.tsx:202`
  - `src/components/layout/AppShell.test.tsx:210`
- These tests assert other old copy:
  - `router.test.tsx:1144`: "Create a client account"
  - `router.test.tsx:1346`: button "Sign in"
  - Many lines in `LoginPage.test.tsx`

## Resolved and remaining decisions

- D2 (resolved): no Google button and no "or" separator.
- D1 (still open): background photo.
  - *Default if no photo arrives:* implement against a new path, `frontend/public/login-hero-sage.jpg`. Until you
    supply the file, fill it with a crop from the reference screenshot. This is a placeholder only, and the handoff
    will say so.
- D3 (still open): handwritten accent.
  - *Default:* render "Spaces / for a better / tomorrow" as `aria-hidden` text in the "Caveat" Google Font. This
    adds one family to the existing Fonts link in `frontend/index.html`. If your photo already contains the
    handwriting, this is removed.

## Tasks (dependency order)

### T1 — Background asset (traces to AC1; blocks T3 visual QA only)
- Owner: primary
- Files: `frontend/public/login-hero-sage.jpg` (new)
- Work: add the image you supply, or a placeholder cropped from the reference. Keep it under about 400 KB, at
  1920px wide or more when possible.
- Verification: the file exists, and Vite serves it at `/login-hero-sage.jpg`.

### T2 — Markup and copy in `LoginPage.tsx` (AC3, AC4, AC5)
- Owner: primary
- Files: `frontend/src/auth/LoginPage.tsx`
- Work:
  - Swap the background `src` to `/login-hero-sage.jpg` and remove the diagonal and base scrims.
  - Hero:
    - Remove the logo, wordmark, and eyebrow.
    - Keep the H1 "From first sketch / to final handoff." and the body copy.
    - Add a short rule and the tagline "Clear ownership. Timely reviews. / Beautiful outcomes.".
    - Add the `aria-hidden` handwritten accent (D3) and the bottom strip "Spaces | People | Ideas | Better Living".
  - Card:
    - Remove the eyebrow.
    - Set the H2 to "Welcome to Lisno" and the subtitle to "Sign in to continue".
    - Keep the labels but visually hide them with `sr-only`, and add placeholders with the same text.
    - Add leading `Mail` and `Lock` icons from lucide-react.
    - Rename "Keep me signed in" to "Remember me".
    - Make the button read "Sign In" with no arrow. Busy and paused text stay unchanged.
    - Remove the hairline, and make the footer read "New to Lisno? Create an account" → `/signup`.
    - No Google button and no separator.
  - All state, validation, banners, pause logic, and the skip link stay unchanged.

### T3 — Sage styling in `login-page.css` (AC1, AC2, AC6)
- Owner: primary
- Depends on: T2 (class names)
- Files: `frontend/src/auth/login-page.css`. Edit login-only rules only.
- Work:
  - Add local tokens on `.login-screen`: sage ink #2F3A2A, olive #3F4B35, olive-hover, card #F7F5EF, hairline, and
    muted text.
  - Hero: dark ink text and a serif H1 (Fraunces) at about 60px on desktop, clamped on mobile. Remove the stray
    `font-size: 5rem`.
  - Card:
    - 16px radius, soft shadow, about 390px wide, right-aligned. Remove the hard `margin-left: 35%`.
    - Remove the yellow `::before` bar.
    - Serif title.
    - Icon inputs that are 46px or taller.
    - An olive checkbox, set with `accent-color`.
    - An olive submit button with light text and a visible focus ring.
  - Add the handwritten accent (position and rotation) and the bottom strip, both hidden below 1000px.
  - Update the ≤999px and ≤767px blocks to a centered card with no overflow at 360px.
  - Leave `.login-state*`, `.login-summary`, `.login-text-action`, `.login-session-warning`, `.login-banner*`,
    `.login-anim-*`, and `.auth-input` unchanged.

### T4 — Font link (D3; parallel-safe with T2 and T3)
- Owner: primary
- Files: `frontend/index.html`
- Work: append `&family=Caveat:wght@500` to the existing Google Fonts URL. Skip this if D3 resolves to "in photo".

### T5 — Tests (AC3, AC4, AC5, AC6)
- Owner: primary
- Depends on: T2
- Files:
  - `src/auth/LoginPage.test.tsx`
  - `src/App.test.tsx`
  - `src/auth/SignupPage.test.tsx`
  - `src/components/layout/AppShell.test.tsx`
  - `src/app/router.test.tsx`: listed lines only, because the file is dirty
- Work:
  - Update the old heading, button, link, and eyebrow assertions.
  - Add assertions for:
    - the "Welcome to Lisno" heading
    - the "Sign In" button
    - the "Remember me" checkbox
    - "Create an account" → `/signup`
    - no `button` or `link` named /google/i
    - decorative text not in the accessibility tree (`aria-hidden`)
    - inputs reachable by label

### T6 — Verification (AC1–AC7)
- Owner: primary
- Depends on: T1–T5
- Commands:
  - `cd frontend && npm test -- src/auth/LoginPage.test.tsx`
  - `cd frontend && npm run typecheck && npm test && npm run build`
  - `git diff --check`
  - `git status --short`, to confirm only the intended paths changed, alongside the pre-existing dirty set
- Visual QA: run the dev server and take screenshots of `/login` at 1440×900, 1024×768, 390×844, and 360×740. Also
  capture the error-banner and paused states, and compare against the reference. Screenshots go in the scratchpad
  only and are not committed.
- Spot-check that `/signup` and `/forgot-password` are visually unchanged.

## Parallelism

- T1 and T4 are independent of everything else.
- T2 must come before T3 and T5.
- T3 and T5 can run in parallel: CSS and tests have no file overlap.
- T6 runs last, on the integrated result.
- The change is small enough that inline work is efficient. The parallel slices are T3 (CSS) and T5 (tests).

## Out of scope

- Google sign-in.
- The auth API.
- "Remember me" semantics.
- Other auth pages.
- The mobile app.
- Commits and pushes.
