# Lisno logo on login and signup — task plan

Spec: [2026-09-23-login-signup-lisno-logo-design.md](../specs/2026-09-23-login-signup-lisno-logo-design.md)
(approved; logo in sage ink)

## Tasks (dependency order)

### T1 — Markup (AC1, AC3)
- Owner: primary
- Files:
  - `frontend/src/auth/LoginPage.tsx`
  - `frontend/src/auth/SignupPage.tsx`
- Add `<span className="login-logo" role="img" aria-label="Lisno" />` directly after the skip link on each page.

### T2 — Styles (AC1, AC2)
- Owner: primary
- Depends on: T1
- Files: `frontend/src/auth/login-page.css`. Add rules only, under `.login-screen--sage`.
- Desktop (1000px and wider):
  - Absolute position: top about 40px, left aligned with the hero padding.
  - About 118×32px, drawn with `mask: url("/lisno-logo.svg")` and a `--sage-ink` background.
- Below 1000px:
  - Static block, centred, about 103×28px, with 16px spacing above the card.
  - Grid top padding reduced so the logo and card sit together.

### T3 — Tests (AC3)
- Owner: primary
- Depends on: T1
- Files:
  - `LoginPage.test.tsx`
  - `SignupPage.test.tsx`
- Assert that exactly one `img` named "Lisno" exists on each screen.

### T4 — Verification (AC1–AC4)
- Owner: primary
- Depends on: T1–T3
- Commands:
  - focused login and signup tests
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
- Screenshots of `/login` and `/signup` at 1440×900 and 360×740 (scratchpad only).

## Parallelism

- T2 and T3 can run in parallel after T1: no file overlap.
- T4 runs last.
