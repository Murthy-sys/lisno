# Lisno reference-led executive dashboard — design specification

- Date: 2026-09-22
- Status: Implemented and verified
- Classification: Substantial cross-platform dashboard redesign
- Primary target: Web Super Admin Dashboard
- Responsive target: Mobile Super Admin Dashboard
- Reference: User-provided light executive interior-project dashboard image

## Goal

Redesign the Lisno dashboard to match the reference's visual language and information hierarchy: a bright, compact executive workspace with a five-metric summary row, large analytical panels, a persistent contextual rail, restrained sage and sand colors, subtle elevation, and dense but calm information presentation.

The redesign must use real authorized Lisno dashboard data. It must preserve exact financial lineage, availability states, UTC reporting periods, permissions, accessible tables or ledgers, and responsive behavior. Apache ECharts remains the visualization engine and must provide polished transitions when filters, periods, or values change.

## Latest direction and precedence

The latest reference materially changes the previously approved dark spatial-atlas direction. The reference explicitly uses conventional executive-dashboard forms including paired columns, smooth trend lines, doughnut charts, progress tracks, timelines, and compact ranked lists.

This specification therefore treats the supplied image as the new source of truth for visual composition and permits those chart families where they match the business question. Approval of this specification confirms that the latest reference supersedes the earlier instruction prohibiting bar and pie/doughnut forms. The previous spatial implementation remains recoverable in Git/worktree history until this redesign is verified.

## Current behavior and evidence

- The current web overview uses the recently implemented dark spatial atlas with custom-series constellations, temporal ribbons, lifecycle orbits, capital flows, and risk fields.
- The current mobile overview uses the same spatial visual grammar.
- Both surfaces already consume the authorized Super Admin dashboard overview response and preserve loading, partial, unavailable, exact-value, permission, and failure states.
- The current overview contract contains authoritative project totals and lifecycle counts, approved finance values, cost classifications, margin, overdue counts, workforce summaries, governance queues, risk projects, activity counts, and recorded-expense time buckets.
- The current contract does **not** contain an authorized project-cover photograph, chronological organization activity feed, vendor-ranked spend aggregate, per-category estimate-versus-actual amounts, or a revenue-by-month series. Those reference elements cannot be copied literally without new backend contracts.
- Repository assets contain brand and login imagery, but no approved interior-project cover suitable for representing a real project.

## Visual direction

### Art direction

- Warm off-white application background with true white analytical surfaces.
- Near-black typography with muted gray metadata.
- Sage green as the primary analytical accent; sand, stone, soft blue, and muted plum provide secondary series distinction.
- Fine neutral borders, low diffuse shadows, and moderate corner radii. No heavy glass effects, neon glow, or dark gaming-style stage.
- Compact executive typography: strong numeric values, medium-weight panel headings, restrained labels, and consistent Indian currency formatting.
- Icons sit in lightly tinted circular wells and communicate meaning rather than decorate every line.

### Desktop composition

Use a 12-column dashboard canvas with three levels:

1. A five-card KPI row spanning the page.
2. A primary analytical area with a wide financial/activity panel, a project-status panel, and a narrow right context rail.
3. A dense supporting grid for cost composition, budget position, module progress, workforce performance, priority/attention items, and exact values.

The right context rail remains visually continuous on wide screens and rejoins the main reading order on smaller screens. Cards align to a consistent baseline and use a small set of purposeful height classes rather than equal-height generic tiles.

### Mobile composition

- Two KPI cards per row where width permits, then one per row at narrow text-zoom widths.
- Analytical panels stack in priority order; charts receive mobile-specific aspect ratios and label strategies.
- The context rail becomes normal document flow after the financial and project-status panels.
- Filters use native controls or accessible sheets, maintain 44-point targets, and never trap vertical scrolling.
- Exact values remain accessible without precise chart tapping.

## Overview information architecture and data mapping

| Reference role | Lisno presentation | Authoritative source |
| --- | --- | --- |
| Total Projects | Total projects with period delta | `projects.total`, comparison `projects_created` |
| Total Revenue | Approved net revenue, explicitly excluding GST | `finance.approvedSubtotalPaise` |
| Pipeline Value | Approved contract value, labelled accurately rather than calling it unapproved pipeline | `finance.approvedContractTotalPaise` |
| Avg. Margin | Current live margin | `finance.currentMarginBps` |
| Delayed Projects | Live overdue projects | `projects.liveOverdue` |
| Revenue & Cost Trend | Recorded-cost activity over the selected period with approved revenue/cost-budget snapshot guides; no false monthly revenue series | `trends.ledgerExpensesPostedPaise`, finance snapshot fields |
| Project Status | Lifecycle doughnut with exact stage counts | `projects.planning`, `active`, `onHold`, `completed` |
| Budget Allocation | Cost-composition doughnut | `finance.procurementCostPaise`, `employeePaymentPaise`, `otherExpensePaise`, `overheadPaise` |
| Estimated vs Actual | Approved cost budget versus recorded cost and remaining/overspend position | `finance.costBudgetPaise`, `recordedCostPaise`, `remainingBudgetPaise` |
| Ongoing Project | Priority project summary without fabricated photography, location, or progress | `risk.topProjects` and stable project link |
| Recent Activity | Action/attention queue, clearly labelled as current queues rather than chronological events | governance, risk, overdue, and budget-exception fields |
| Top Vendors | Replaced on Overview by cost categories because vendor-ranked spend is not present in the authorized overview contract | finance cost classifications |
| Project Timeline | Replaced by module progress/status summary because dated project-stage history is not present in the overview contract | estimation, design, procurement, execution aggregates |
| Team Performance | Workforce role distribution and calculated KPI coverage; no invented employee leaderboard | `workforce.roleDistribution`, `averageKpi`, eligibility fields |

All remaining metrics stay available through module tabs, exact-value disclosures, and drill-down links. No metric disappears solely because the overview becomes more concise.

## Chart and interaction requirements

- Use Apache ECharts with the existing lazy runtime and responsive host lifecycle.
- Permitted overview forms are paired/stacked columns, smooth trend paths, doughnut charts, progress tracks, compact timelines, and ranked lists when supported by the underlying metric.
- Use `universalTransition`, stable series/data IDs, and shape-preserving updates for period, comparison, and metric changes.
- Entrance motion is short and staggered once. There is no continuous animation, decorative auto-play, or layout shift after values settle.
- Hover and focus reveal exact values; keyboard users can traverse meaningful chart marks.
- Respect `prefers-reduced-motion` by removing staged movement and using immediate value updates.
- Zero and unavailable remain distinct. Unavailable values never become zero, empty, or an inferred percentage.
- Count, percentage, and paise series never share an unlabeled scale.
- Tables/ledgers remain the accessible exact-value source and reconcile one-to-one with plotted values.

## Responsive and accessibility requirements

- Support 390px mobile, tablet, 1024px laptop, 1440px desktop, and wide desktop layouts.
- No page-level horizontal scrolling, clipped labels, overlapping legends, or tiny desktop charts scaled down onto mobile.
- Reading order and keyboard order follow KPI row, primary analysis, project status, context rail, supporting analysis, then module links.
- Use semantic headings, native filters, visible focus, concise chart descriptions, and text alternatives for every icon.
- Meet WCAG 2.2 AA contrast for functional text and controls. Color is never the only status indicator.
- Loading skeletons reserve final layout space. Error, stale refresh, partial data, empty, all-zero, and renderer-failure states remain distinguishable.

## Scope

### Included

- Web Super Admin Overview layout and visual system.
- Mobile Super Admin Overview adaptation of the same hierarchy and data semantics.
- Overview chart options, transitions, exact tables/ledgers, filters, cards, context rail, responsive styles, and focused regression tests.
- Reuse of existing module-tab data and navigation.
- Removal or retirement of the current spatial-atlas presentation from the Overview after the replacement passes verification.

### Non-goals

- No fabricated project image, activity event, vendor ranking, employee ranking, revenue history, or category estimate amount.
- No new backend aggregation or API contract in this iteration.
- No redesign of project, finance, workforce, or other destination pages beyond the dashboard shell and overview.
- No new charting dependency, WebGL engine, stock-photo dependency, or AI-generated business content.
- No migration, seed, production write, deployment, commit, or push.

## States and failure behavior

- A missing optional metric leaves its card/panel in place with “Not available” and the backend reason.
- Empty verified collections show a calm empty state and retain navigation where useful.
- Chart initialization failure preserves the heading, exact values, and retry action.
- Authorization loss removes protected links and follows the existing page-level access behavior.
- Background refresh retains verified content and reports refreshing without resetting chart focus unnecessarily.
- When no priority project exists, the context card shows “No project currently requires priority review”; it does not substitute sample project content.

## Constraints and risks

- The reference image contains several data products the current overview API does not provide. Copying those literally would create false data; this specification substitutes honest Lisno summaries while matching the composition.
- The latest reference conflicts with the earlier ban on conventional chart families. This precedence decision must be confirmed through specification approval.
- Dense desktop composition can become unreadable on mobile or at 200% zoom. Mobile layouts must be recomposed rather than scaled.
- Doughnut and column charts can become generic. Distinction must come from Lisno-specific hierarchy, typography, data labels, exact-value behavior, and restrained motion rather than decorative effects.
- The worktree already contains the completed spatial-dashboard changes and generated mobile log dirtiness. Implementation must preserve unrelated paths and explicitly replace only approved dashboard presentation code.

## Acceptance criteria

1. The web Overview visibly matches the reference's bright executive-dashboard hierarchy: five KPI cards, structured analytical grid, contextual right rail, restrained sage/sand palette, and compact information density.
2. Mobile presents the same priority and data semantics through a purpose-built stacked composition with no overflow or scroll trapping.
3. All overview values trace to named fields in the existing authorized dashboard response; no placeholder or fabricated business data is rendered.
4. KPI labels remain financially accurate: approved net revenue excludes GST, approved contract value includes its proper context, margin uses basis points, and delayed projects use live overdue records.
5. Every chart and exact-value table agrees for normal, unequal, zero, unavailable, partial, and overspend fixtures.
6. Period, comparison, and metric changes animate through stable Apache ECharts identities and settle without idle animation.
7. Keyboard, screen-reader, reduced-motion, loading, stale, empty, partial, failure, and permission states remain operable.
8. Layout passes rendered review at 390px, tablet, 1024px, 1440px, and wide desktop without clipping or page-level horizontal scroll.
9. Focused web/mobile dashboard tests, both typechecks, the frontend build, Android export, rendered browser/emulator review, and `git diff --check` pass.
10. Full-suite failures outside the dashboard scope are reported distinctly and no unrelated dirty work is reverted.

## API, persistence, authorization, and side effects

- The existing `GET /admin/dashboard/overview` contract remains unchanged.
- Existing `admin.dashboard.read` enforcement and operation-specific drill-down permissions remain authoritative.
- No database schema, persistence behavior, file-access policy, finance formula, or query invalidation contract changes.
- No external communication, migration, seed, production mutation, deployment, commit, or push is part of this work.

## Open decisions

No additional decision is required if this specification is approved. Approval confirms both the reference-led light design and the use of the conventional chart families visible in the supplied reference, while retaining premium ECharts transitions and truthful Lisno data.

## Implementation evidence

- Web dashboard verification: 110 focused tests passed across 11 files; typecheck and production build passed.
- Mobile dashboard verification: 73 focused tests passed across 11 suites; typecheck and Android export passed.
- Rendered web review covered 360px, 390px, 768px, 1024px, 1440px, and 1920px widths, plus populated, partial, empty, reduced-motion, console, and horizontal-overflow checks.
- A current Metro bundle was reviewed on a 411dp Pixel 10 emulator through the KPI, finance activity, lifecycle, priority, action queue, cost composition, budget, and module-progress sections. The ECharts legacy-grid warning found during that review was removed and the all-zero axis presentation was corrected.
- Final integrity review confirmed the existing dashboard API, finance units and GST meaning, unavailable-versus-zero behavior, operation-based authorization, stable ECharts identities, finite motion, and reduced-motion behavior.
- `git diff --check` passed. No backend, OCR, database, migration, seed, external communication, commit, push, or deployment action was performed.
- Broader unrelated suites and the wider physical-device/orientation matrix were not run; the verified device pass was Android phone portrait.
