# Mobile executive dashboard: minimal 7D / 30D / 1Y selector — task plan

Spec: [2026-09-24-mobile-dashboard-period-selector-design.md](../specs/2026-09-24-mobile-dashboard-period-selector-design.md)
(approved; D1 = backend 365 support, D2 = web unchanged, D3 = comparison always on)

## Pre-flight facts

- All target files are **clean** in git:
  - backend: the dashboard contract, route, service, repository, `repositories/types.ts`, domain, and `openapi.ts`
  - mobile: the dashboard folder and `workspace/featureDefinitions.ts`
- Backend `7 | 30 | 90` literal sites:
  - `contracts/super-admin-dashboard.ts:4`, the constant
  - `routes/super-admin-dashboard.ts:23`, the Zod union of three literals
  - `services/super-admin-dashboard.service.ts:16,19,24,100`
  - `repositories/super-admin-dashboard.ts:90,1438,1550,2231,2460,2551`
  - `repositories/types.ts:1085,1095`
  - `domain/super-admin-dashboard.ts:25`
  - `openapi.ts:~444`, the `periodDays` parameter
- Mobile:
  - `data/contract.ts:5` (`DASHBOARD_PERIODS`) and `:97` (response `days` union)
  - `components/DashboardChrome.tsx`, `OperationsHeader`, lines 47–191
  - `SuperAdminMobileDashboard.tsx`: `comparisonEnabled` state at line 653, and the header props at around line 750
- Existing tests:
  - backend: `tests/super-admin-dashboard.test.ts`, `super-admin-dashboard-domain.test.ts`, and
    `super-admin-dashboard-mongo.replica-set.test.ts`
  - mobile: `DashboardChrome.test.tsx`, `SuperAdminMobileDashboard.test.tsx`, `data/contract.test.ts`,
    `useDashboardOverview.test.ts`, and `viewModel.test.ts`
- Baselines:
  - mobile: typecheck 0; `npm test` has 1 failure, `contract-drift`, due to a protected-operation count of 224 vs
    227, which is unrelated and not changed by this work
  - backend and frontend: take the baseline at the start of T4

## Tasks (dependency order)

### T1 — Backend: 365-day period (AC1)
- Owner: **backend slice**
- Files:
  - `backend/src/contracts/super-admin-dashboard.ts`: `[7, 30, 90, 365]`, plus an exported
    `SuperAdminDashboardPeriodDays` type
  - the route, service, repository, `repositories/types.ts`, and domain: replace `7 | 30 | 90` with the derived type
  - the route Zod: build the union from the constant, so it accepts all four, defaults to 30, and rejects other
    values with 400
  - `openapi.ts`: add 365 to the `periodDays` enum
- Tests:
  - `super-admin-dashboard.test.ts`: 365 is accepted for overview and projects; 7, 30, and 90 are unchanged; 60 and
    400 return 400.
  - Domain test: `dashboardComparisonWindow` and `dashboardPeriod` for 365, covering a 365-day current window ending
    today and a 365-day previous window before it, across a leap boundary.
  - Replica-set test: seed at least two unequal projects across more than 90 days. Check that 365 totals include
    records older than 90 days and that the previous-window totals are correct. Log the query duration.
- Keep the authorization and route-operation registry unchanged, since there are no new operations.

### T2 — Mobile: contract, selector, and removals (AC2–AC5)
- Owner: **mobile slice**
- Can run in parallel with T1.
- Files:
  - `data/contract.ts`: `DASHBOARD_PERIODS = [7, 30, 365]`; the response `days` union accepts 7, 30, 90, and 365, so
    it stays tolerant of 90.
  - `components/DashboardChrome.tsx`, `OperationsHeader`:
    - Render only the segmented control from `DASHBOARD_PERIODS`, with labels 7D / 30D / 1Y and accessible names
      "7 days" / "30 days" / "1 year".
    - Remove the date group, the UTC note, the compare switch, the refresh button, and "Last updated".
    - Remove the card wrapper.
    - The control is full width within the screen gutter, with three equal `flex: 1` segments, 44pt tall, radius
      14, and 4pt inner padding. It stays on one line down to 320pt and at large font sizes.
    - Remove the props that are no longer used (`comparisonEnabled`, `onComparisonChange`, `onRefresh`,
      `refreshing`, `observedLabel`, range labels, `qualityStatus` / `qualityDetail`, `partialFinalDay`) and the
      dead styles. Keep the hero.
  - `SuperAdminMobileDashboard.tsx`:
    - Comparison is always on: `const comparisonEnabled = true`, with the switch state removed.
    - Keep pull-to-refresh.
    - Keep the accessibility summary with its range and partial-day text.
    - Pass only the period props.
    - If the period in state is not in `DASHBOARD_PERIODS`, fall back to 30.
  - `workspace/featureDefinitions.ts`: unchanged, since it uses `periodDays=30`.
- Tests:
  - `DashboardChrome.test.tsx`: exactly three tabs, 7D / 30D / 1Y, each with its accessible name and selected state.
    None of these are present: "Compare periods", "Refresh dashboard", "Last updated", "Times in UTC", or "Prev:".
  - `SuperAdminMobileDashboard.test.tsx`: selecting 1Y requests `periodDays=365`; the KPI comparison is still
    rendered; the default is 30; pull-to-refresh still triggers a refetch.
  - `contract.test.ts`: a response with `days: 365` parses.

### T3 — Integration review (AC1–AC6)
- Owner: primary
- Depends on: T1, T2
- Checks:
  - Mobile `periodDays` values match what the backend accepts.
  - There is no remaining `7 | 30 | 90` in the backend and no stale 90 in the mobile selector.
  - The web dashboard's `[7, 30, 90]` is untouched and still valid against the backend.
  - Review the final diff.

### T4 — Verification (AC1–AC6)
- Owner: primary
- Depends on: T3
- Backend: `npm test -- tests/super-admin-dashboard*.test.ts`, `npm run typecheck`, `npm test`, `npm run build`, and
  the replica-set dashboard test (it needs the local Mongo replica set; report if unavailable).
- Mobile: `npm run typecheck`, `npx jest src/features/dashboard`, and `npm test` compared to the baseline.
- Frontend: `npm run typecheck` and `npm test -- src/features/admin/dashboard`, as a regression check that nothing
  changed.
- `git diff --check`.
- Visual: the user checks in Expo. The backend must be restarted so 365 is accepted.

## Parallelism

- T1 (backend) and T2 (mobile) have **disjoint files** and can run as two sub-agents.
- The contract they share:
  - `periodDays=365` is accepted
  - the response `days` is 365
  - 7, 30, and 90 are unchanged
  - there are no other API shape changes
