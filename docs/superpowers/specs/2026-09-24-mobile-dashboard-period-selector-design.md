# Mobile executive dashboard: minimal 7D / 30D / 1Y period selector — specification

Date: 2026-09-24
Status: Draft, awaiting approval
Classification: Substantial. The mobile UI change is small, but **"1Y" needs a backend API contract change**
(accepted period values, repository, service, and OpenAPI), which is shared with the web dashboard.

## Goal

On the mobile Super Admin executive dashboard, the reporting card currently shows:
- a segmented control: 7D / 30D / 90D
- a date block: current range, "Prev:" range, and "Times in UTC · Final day is partial"
- a "Compare periods" switch
- a refresh button
- a "Last updated" timestamp

The user wants:
1. Only a **7D / 30D / 1Y** selector.
2. **Everything else removed** from that card.
3. The selector **aligned cleanly** to the screen.

## Current behavior and evidence

- **Mobile UI:** `mobile/src/features/dashboard/components/DashboardChrome.tsx`, `OperationsHeader`, lines 47–191.
  - Hard-coded periods `[7, 30, 90]`, labelled `{value}D`, each a `tab` with the accessible name "N days".
  - The date group, compare switch (`accessibilityRole="switch"`), refresh button, and "Last updated" copy are in
    the same `reportingCard`.
  - It is used by `mobile/src/features/dashboard/SuperAdminMobileDashboard.tsx`:
    - `comparisonEnabled` is `useState(true)` (line 653), so comparison is **on by default**.
    - The KPI deltas use it (`buildExecutiveKpis(model, comparisonEnabled)`).
    - Pull-to-refresh (`RefreshControl`, around line 740) is already present, so refresh stays available without the
      button.
- **Mobile contract:** `mobile/src/features/dashboard/data/contract.ts:5`, `DASHBOARD_PERIODS = [7, 30, 90]`, used
  by `data/query.ts` and `workspace/featureDefinitions.ts`.
- **Backend:** only `periodDays` values of 7, 30, and 90 are accepted.
  - `backend/src/contracts/super-admin-dashboard.ts:4`: `SUPER_ADMIN_DASHBOARD_PERIOD_DAYS = [7, 30, 90]`.
  - The route (`routes/super-admin-dashboard.ts:23`) validates `z.union` of those three literals, defaulting to 30.
  - The service, repository, and domain (`dashboardComparisonWindow`, `dashboardPeriod`) are typed `7 | 30 | 90`.
  - Trend and comparison data is bucketed **daily**, so 1Y means 365 daily buckets, plus a previous-year comparison
    window.
  - `backend/src/openapi.ts` documents the enum.
- **Web:** `frontend/src/features/admin/dashboard/superAdminDashboardApi.ts:5` has
  `DASHBOARD_PERIOD_DAYS = [7, 30, 90]`, used by `SuperAdminDashboardPage.tsx` and `DashboardOverview.tsx`.
- The latest commit `885ff00` contains the mobile dashboard work. The mobile dashboard files are currently clean.

## Proposed behavior

### A. Backend: accept a 365-day period (additive)
1. `SUPER_ADMIN_DASHBOARD_PERIOD_DAYS` becomes `[7, 30, 90, 365]`. The type is derived from the constant,
   `SuperAdminDashboardPeriodDays`, and the scattered `7 | 30 | 90` literals are replaced by it in the route,
   service, repository, and domain.
2. The period and comparison windows work unchanged for 365. The current window is the last 365 UTC days ending
   today, which is partial. The previous window is the 365 days before it.
3. Daily buckets are kept, since that avoids a new aggregation and keeps the contract shape. The response for 1Y has
   up to 365 buckets per series. There is a performance check (see Risks).
4. OpenAPI and the route-operation inventory are updated. Runtime Zod validation stays authoritative. **90 stays
   accepted**, so the web and existing clients keep working.

### B. Mobile: minimal selector
1. `DASHBOARD_PERIODS` becomes `[7, 30, 365]`.
2. Labels are **7D, 30D, 1Y**. Accessible names are "7 days", "30 days", and "1 year", with `role="tab"`, selected
   state, and a `tablist` named "Reporting period".
3. The default stays **30D**. A 90-day value held in state or a deep link falls back to 30.
4. **Removed from the card:**
   - the calendar icon and the current and previous range text
   - "Times in UTC · Final day is partial"
   - the "Compare periods" switch
   - the refresh button
   - "Last updated"
5. **Comparison stays always on**, as today's default (decision D3). KPI deltas keep comparing with the previous
   period. The switch is only hidden, and there is no data change.
6. **Refresh:** pull-to-refresh remains the way to refresh.
7. **Data freshness and range stay available to screen readers** through the existing dashboard summary at around
   line 689, which already includes the current and previous range and the partial-day note. It is not shown on
   screen.
8. **Alignment:**
   - The selector is a full-width segmented control inside the screen's standard horizontal gutter, the same left
     and right inset as the cards below it.
   - It has three equal-width segments, 44pt tall, with a centred label, radius 14, and a 4pt inner padding.
   - The selected segment is solid olive with cream text; the others use muted ink.
   - No card wrapper around it. The "Executive dashboard" hero stays above.
   - It stays on one line down to a 320pt width, and scales labels at large font sizes.

### C. Web dashboard
- **Recommended (D2):** unchanged. It keeps 7/30/90, and the backend accepts 90 and 365.
- Alternative: also switch web to 7/30/1Y for parity. That is a separate web UI change.

## Scope and non-goals

- In scope:
  - the backend contract, route, service, repository, domain, and OpenAPI for 365
  - the mobile contract, query, feature definitions, `OperationsHeader`, and the mobile dashboard wiring
  - tests
- Non-goals:
  - web UI changes (per D2)
  - chart redesign or down-sampling. If the 365-point series harms mobile chart legibility, that is a follow-up
    spec.
  - new data fields
  - other dashboard sections

## Invariants

- Backend authorization for dashboard routes is unchanged, and the route-operation registry stays in sync.
- The existing values 7, 30, and 90 behave exactly as before.
- Finance and KPI values are still derived on the backend. The UI never computes range values.
- IDs and period values are carried as numbers, and labels are only presentation.

## Risks

- **Performance:** 365-day aggregation scans up to about 4× more data than 90 days. The fix is a replica-set
  integration test with seeded data and a timing log. If it is slow, add an index or split into a follow-up.
- **Chart density:** 365 daily points on small mobile charts. The fix is a visual check. Down-sampling to weekly is
  a separate decision.
- **Hiding "Last updated" and the UTC note** removes visible freshness cues. They remain in the accessibility
  summary, and pull-to-refresh remains. This is the user's explicit choice.
- **Shared contract:** the frontend and mobile types must stay aligned. The web keeps its own `[7, 30, 90]` list, so
  it is unaffected.

## Acceptance criteria

- AC1: `GET` for the Super Admin dashboard overview and projects with `periodDays=365` returns 200. The response has
  `days: 365`, a previous window of 365 days, and correct totals on a seeded dataset, with at least two unequal
  projects. The values 7, 30, and 90 are unchanged, and other values return 400.
- AC2: The mobile reporting area shows **only** the 7D / 30D / 1Y segmented control. There is no date text, UTC note,
  compare switch, refresh button, or "Last updated".
- AC3: Selecting 1Y requests `periodDays=365` and renders the dashboard. KPI comparisons still show. 30D is the
  default.
- AC4: The control spans the screen gutter with three equal segments and is vertically and horizontally centred,
  with no clipping at 320pt or with large text. Tabs are announced with their name and selected state.
- AC5: Pull-to-refresh still refreshes.
- AC6: These pass:
  - backend focused tests, `npm run typecheck`, `npm test`, `npm run build`, and the replica-set dashboard test
  - mobile typecheck and the suite against the baseline (only `contract-drift` fails)
  - the frontend typecheck and dashboard tests, unchanged
  - `git diff --check`

## Open decisions

- **D1 — 1Y support.** *Recommended:* the backend change in A, as the only way to show real 1-year data. There is no
  mobile-only alternative, because the backend rejects 365.
- **D2 — Web dashboard.** *Recommended:* leave it on 7/30/90. The alternative is to switch web to 7/30/1Y too.
- **D3 — Comparison.** *Recommended:* always on (today's default), with the switch hidden. The alternative is always
  off, which hides the KPI deltas.
