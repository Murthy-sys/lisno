# Signup screen sage background — task plan

Spec: [2026-09-23-signup-screen-sage-background-design.md](../specs/2026-09-23-signup-screen-sage-background-design.md) (approved)

## Pre-flight

- `frontend/src/auth/SignupPage.tsx` is clean in git.
- `frontend/src/auth/login-page.css`, `SignupPage.test.tsx`, and `LoginPage.tsx` carry only this session's login
  redesign edits.
- No test asserts the signup hero copy, the eyebrow, or the background `src`.

## Tasks (dependency order)

### T1 — Signup markup (AC1, AC3)
- Owner: primary
- Files: `frontend/src/auth/SignupPage.tsx`
- Changes:
  - Import `loginBackground` from `../assets/login_screen.png` and use it as the `login-bg` src.
  - Replace the two purple scrims with one `login-scrim`.
  - Add `login-screen--sage` to `<main>`.
  - Add the `aria-hidden` handwritten accent, matching login's markup and copy.
  - Hero:
    - Remove the logo, wordmark, and eyebrow.
    - Keep the `<h2>` title and the body copy.
    - Add `login-hero__rule`.
    - Turn the footer into `login-hero__tagline`: "Clear updates. Confident approvals. / Beautiful outcomes.".
  - Card:
    - Remove the "CLIENT PORTAL" eyebrow and the hairline.
    - Remove the submit arrow; the busy text stays.
  - After the grid, add the `aria-hidden` strip "Spaces | People | Ideas | Better Living".
  - Fields, labels, validation, and submit logic are untouched.

### T2 — Scoped sage CSS additions (AC1, AC2, AC4)
- Owner: primary
- Depends on: T1
- Files: `frontend/src/auth/login-page.css`. Add rules only, all under `.login-screen--sage`.
- Changes:
  - `.login-field__label`: sage ink, 0.9rem, weight 500. Login hides its labels with `sr-only`, so it is unaffected.
  - `.login-banner__list`: keeps its current styling.
  - Nothing else unless screenshots show an issue.

### T3 — Tests (AC3)
- Owner: primary
- Depends on: T1
- Files: `frontend/src/auth/SignupPage.test.tsx`
- Changes: add one test covering:
  - the background `src` matches `/login_screen/`
  - the decorative text is `aria-hidden`
  - there is no Google control

### T4 — Verification (AC1–AC5)
- Owner: primary
- Depends on: T1–T3
- Commands:
  - `cd frontend && npm test -- src/auth/SignupPage.test.tsx src/auth/LoginPage.test.tsx`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
- Screenshots (scratchpad only):
  - `/signup` at 1440×900, 1024×768, 390×844, and 360×740
  - `/login` at 1440×900, to confirm it is unchanged
  - `/forgot-password`, spot-checked as unchanged

## Parallelism

- T2 and T3 can run in parallel after T1: no file overlap.
- T4 runs last.
