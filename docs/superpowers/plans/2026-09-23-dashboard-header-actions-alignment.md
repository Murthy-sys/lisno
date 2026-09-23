# Organization overview header action alignment — task plan (compact)

- **Date:** 2026-09-23
- **Specification:** `docs/superpowers/specs/2026-09-23-dashboard-header-actions-alignment-design.md` (approved 2026-09-23)
- **Branch:** `feature/designer_workflow`

Small change, two tasks, strictly sequential. Traces to AC1–AC6.

## Working-tree context

The repository is dirty with unrelated work that must be preserved untouched:
1. the user-administration redesign completed earlier today,
2. the icon-only Refresh change completed earlier today (`SuperAdminDashboardPage.tsx`),
3. a concurrent, still-in-flight `ai-estimator-knowledge` / `draft-sub-basket` workstream.

No `git checkout`, `restore`, `stash` or `add` at any point.

## T1 — Scoped alignment rules

**Owns:** `frontend/src/features/admin/dashboard/super-admin-dashboard.css`.

Add rules inside the file's existing `@layer components` block, near the `.dashboard-comparison-toggle` rules at
lines 79-95, matching the file's established formatting:

1. Scope the header actions row to a shared end baseline:
   `.super-admin-dashboard .ui-page-header__actions { align-items: end; }`
2. Give the Refresh control a square control-height box:
   `.super-admin-dashboard .ui-page-header__actions .ui-icon-button { min-block-size: var(--control-height); min-inline-size: var(--control-height); }`

Constraints:
- **Do not modify `frontend/src/styles/primitives.css`** or any primitive — `.ui-icon-button` is used across the
  application (AC3).
- Existing tokens only; no hex literal, no new token (AC4).
- Retain the primitive's `flex-wrap: wrap`; do not set a fixed width on the row (AC5).
- Leave `.dashboard-comparison-toggle`'s existing `align-self: end` in place — it becomes redundant but is
  referenced elsewhere in the file, so removing it widens the blast radius for no visual gain.
- Do not touch `SuperAdminDashboardPage.tsx` unless OD1's fallback is genuinely needed; if it is, add only a single
  `className` and report that the fallback was taken.

**Acceptance:** AC1, AC2, AC3, AC4, AC5.

## T2 — Verify

**Depends on:** T1. Verification only; no file is expected to change.

1. `cd frontend && npm run typecheck`
2. `cd frontend && npm test -- src/features/admin/dashboard` — the dashboard suite is behavioural, so it must stay
   green (29 tests in `SuperAdminDashboardPage.test.tsx`, 110 across the folder as of the previous run).
3. `cd frontend && npm run build` — confirms the CSS parses and the rules survive the layer cascade.
4. Confirm the emitted CSS actually contains both new rules (they live inside `@layer components`, so a cascade or
   scoping mistake would silently drop them rather than error). Grep the built stylesheet in `dist/assets/`.
5. `git diff --check`, and `git diff --stat` limited to the owned file to confirm scope.

Known pre-existing failures in this repository, not to be attributed to this change:
`accessibility.test.tsx > keeps the own access-request dialog trapped…` and
`router.test.tsx > marks interactive signup focus…` (both reproduce at HEAD 7d58f3b).

**Acceptance:** AC6.

## Dependency order

`T1 → T2`. No parallelism; the change is two CSS rules in one file.

## Verification limit to state honestly

jsdom performs no layout, so no automated test in this repository can prove the controls are visually aligned.
T2 proves the rules are present, scoped, token-only and non-breaking. Confirmation that the baseline is actually
level is a browser/visual check, and the handoff must say so rather than implying the alignment itself was
machine-verified.
