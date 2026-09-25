# App-wide themed buttons and red-outlined negative actions — task plan

Spec: [2026-09-23-themed-buttons-and-negative-actions-design.md](../specs/2026-09-23-themed-buttons-and-negative-actions-design.md)
(approved; D1 = sage olive palette, D2 = red outline for every negative action including final confirmations)

## Pre-flight facts

- **Audit script:** `scratchpad/neg-audit.py`. Run `summary` for totals, or no argument for the full list. It scans
  every non-test `.tsx` for `<Button>` and `<button>` elements whose label, or a string literal inside them, starts
  with Cancel, Remove, Delete, Discard, Reject, Revoke, Archive, Deactivate, Withdraw, or "Close without saving".
  - Baseline: **65 matches, 10 already destructive, 55 to do, in 46 files**.
  - 9 of those files are **dirty** with unrelated work: `UserInvitationsPanel.tsx` and 8 AI-estimator-knowledge
    files.
- **Style files:**
  - clean: `global.css`, `primitives.css`, `index.css`, `shell.css`, `client-responses.css`
  - carrying only this session's sidebar edits: `role-themes.css`, `admin-home.css`, `designer-home.css`
  - dirty with unrelated work, **do not touch**: `access-administration.css`
- **Baseline test failures (17, unrelated):**
  - KnowledgeScreens ×13
  - AppShell admin links
  - accessibility access-request dialog
  - router signup Address
  - PasswordReset

## Tasks (dependency order)

### T1 — Button tokens and variant styles (AC1, AC2, AC5)
- Owner: **styles slice**
- Files:
  - `styles/global.css`: add tokens
  - `styles/primitives.css`: variants
  - `styles/index.css`: legacy `.button--primary`, `--secondary`, and `--success` colors and font only
  - `styles/role-themes.css`, `styles/admin-home.css`, `styles/designer-home.css`, `styles/shell.css`,
    `styles/client-responses.css`: remove or retarget button color, font, and weight overrides
- Tokens to add:
  - `--button-primary-bg`, `--button-primary-bg-hover`, `--button-primary-ink`
  - `--button-secondary-border`, `--button-secondary-ink`, `--button-secondary-hover`
  - `--button-quiet-ink`, `--button-quiet-hover`
  - `--button-negative-ink`, `--button-negative-ink-strong`, `--button-negative-border`, `--button-negative-hover`
  - `--button-focus-ring`, `--button-font`, `--button-weight`
- Variant rules:
  - `destructive` renders the same as `destructive-outline`.
  - Every variant uses `--button-font` at weight 600.
  - Focus rings: olive on light surfaces, cream on dark bands.
- Keep the admin header "+" prefix, olive now.
- Buttons that sit on dark header bands must stay readable. Check the role-themes band rules.

### T2 — Negative-action markup: AI estimator knowledge (AC3)
- Owner: **knowledge slice**
- Can run in parallel with T1 and T3.
- Files: only the `features/ai-estimator-knowledge/*.tsx` files listed by the audit (19 files, 8 dirty), plus
  their tests if assertions break.
- Changes:
  - `<Button>`: set `variant="destructive-outline"`.
  - Native `<button>`: add the classes `ui-button ui-button--destructive-outline`, keeping the existing classes.
  - Dirty files: single-attribute edits only. Never reformat, and never revert other changes.

### T3 — Negative-action markup: all other features and components (AC3)
- Owner: **app slice**
- Can run in parallel with T1 and T2.
- Files: the remaining 27 audit files under `components/` and `features/`, excluding `ai-estimator-knowledge`. That
  includes `UserInvitationsPanel.tsx`, which is dirty, so it gets a single-attribute edit only. Also their tests if
  assertions break.
- Same edit rules as T2.

### T4 — Integrity review (AC3, AC4, AC6)
- Owner: primary
- Depends on: T1–T3
- Checks:
  - `neg-audit.py summary` shows **todo = 0**. Every remaining exception is justified as not negative in the spec.
  - Nothing under B.5 changed: close (×), Clear filters, and badges.
  - The diff in each dirty file touches only button lines, compared against the pre-change diff snapshot.
  - No behavior, handler, or accessible-name changes.

### T5 — Verification (AC1–AC6)
- Owner: primary
- Depends on: T4
- Commands:
  - `cd frontend && npm run typecheck`
  - `npm test`: full suite, compared to the 17 baseline failures
  - `npm run build`
  - `git diff --check`
- Rendered check with the fixture-backed Playwright harness:
  - Screenshots of `/admin/projects`, the Initiate project dialog, `/admin/users` with an invite dialog, a designer
    screen, and a knowledge dialog, at 1440px and 390px.
  - Computed-style probe: every `.ui-button` and `.button` element has the same font-family and weight 600, and
    negative buttons have color and border-color equal to `#b42318`.
- Screens whose fixtures are not available in the harness are reported as not visually verified.

## Parallelism and ownership

- T1, T2, and T3 have **disjoint file sets** and can run in parallel as three sub-agents in Mode A.
- A test file breaking in one slice is owned by that slice only if it is the test for a file in that slice.
  Otherwise it is reported to the primary.
- The primary performs T4 and T5 on the integrated result.
