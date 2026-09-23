# Icon-only dashboard refresh control — task plan (compact)

- **Date:** 2026-09-23
- **Specification:** `docs/superpowers/specs/2026-09-23-dashboard-refresh-icon-only-design.md` (approved 2026-09-23)
- **Branch:** `feature/designer_workflow`

Small change, two tasks, strictly sequential. Traces to AC1–AC6.

## Pre-flight finding (done during planning, closes RK2)

`grep -rn '"Refresh"\|Refreshing…\|>Refresh<'` across `frontend/src/features/admin/dashboard/`,
`frontend/src/test/` and `frontend/src/app/router.test.tsx` returns **only the source line itself**
(`SuperAdminDashboardPage.tsx:355`). No test asserts on the visible `Refresh` / `Refreshing…` text, so T2 is
expected to be verification-only. RK2 is closed.

## Working-tree context

This repository is currently dirty with two unrelated workstreams:
1. the user-administration redesign completed earlier today (17 files), and
2. a concurrent `ai-estimator-knowledge` / `draft-sub-basket` workstream (~20 files).

**Neither may be touched.** This plan writes exactly one source file, plus the dashboard test file only if a real
assertion break appears.

## T1 — Convert the control to `IconButton`

**Owns:** `frontend/src/features/admin/dashboard/SuperAdminDashboardPage.tsx` (the single control at line 355).

Replace:

```jsx
<Button variant="secondary" disabled={manualRefresh} aria-label="Refresh dashboard" onClick={() => void refresh()}>
  <RefreshCw aria-hidden="true" />
  {manualRefresh ? "Refreshing…" : "Refresh"}
</Button>
```

with the `IconButton` primitive, following the `ProjectConversationList.tsx:72` idiom:

```jsx
<IconButton
  variant="secondary"
  label="Refresh dashboard"
  tooltip="Refresh"
  icon={<RefreshCw aria-hidden="true" />}
  busy={manualRefresh}
  onClick={() => void refresh()}
/>
```

Notes:
1. Add the `IconButton` import; drop the `Button` import **only if** nothing else in the file still uses it
   (check first — the file is large and single-line dense).
2. `busy` already applies `disabled || busy` inside the primitive, so the explicit `disabled={manualRefresh}` is
   dropped as redundant rather than duplicated (AC3/RK1).
3. `label` stays exactly `"Refresh dashboard"` — it is the accessible name and the existing test selector (AC2).
4. Do not touch the `role="status"` metadata span, the `aria-live` announcement, the reporting-period select, the
   comparison checkbox, `refresh()`, or any stylesheet (AC4, AC5).

**Acceptance:** AC1, AC2, AC4, AC5.

## T2 — Verify

**Depends on:** T1. **Owns:** `frontend/src/features/admin/dashboard/SuperAdminDashboardPage.test.tsx`, and only
if a genuine assertion breaks.

1. `cd frontend && npm run typecheck`
2. `cd frontend && npm test -- src/features/admin/dashboard` — the focus-retention test at
   `SuperAdminDashboardPage.test.tsx:689` is the one that matters (AC3/RK1). If it fails, that is a real
   regression from the primitive's `busy` disabling: report it, do not paper over it by loosening the assertion.
3. `cd frontend && npm test -- src/test/accessibility.test.tsx` — confirm no accessible-name regression.
4. `cd frontend && npm run build`
5. `git diff --check` and `git status --short`, confirming only the expected file(s) changed and that both
   unrelated workstreams are untouched.

Known pre-existing failures in this repository, not to be attributed to this change: `accessibility.test.tsx >
keeps the own access-request dialog trapped…` and `router.test.tsx > marks interactive signup focus…` (both
reproduce at HEAD 7d58f3b).

**Acceptance:** AC3, AC6.

## Dependency order

`T1 → T2`. No parallelism; the change is one control.
