# Mobile reference graphs and entry theme

## Authority and current evidence

The user requests three supplied graph styles and matching splash/onboarding colors. Earlier explicit waiver of approval gates and parallel execution remain applicable. Mobile currently renders project status and cost composition as ECharts donuts and finance activity as daily bars with snapshot guides. The new shell is forest green/cream, while the entry slides use a lighter canvas and native splash resources may predate the current Expo configuration.

## Scope and interpretation

Apply image one as a layered hill-shaped category graph for Project status, image two as a ticked circular cost-share gauge with native legend for Cost composition, and image three as shaded cylinder bars for Recorded cost activity. Images two/three contain project labels only as visual references; financial sources, cost categories, rupee values and UTC dates must remain financial data. All reporting periods/daily values remain reachable. Preserve detailed values, financial unit conversions, authorization, session routing and reduced-motion/transparency behavior.

Splash and all three pre-login slides use the current forest shell background with legible cream/sage content. Theme native splash configuration and existing generated native resources as needed; preserve onboarding progress/skip/sign-in/back behavior. No login workflow redesign, dependencies, backend changes, migrations or production operations.

## Acceptance criteria

1. Project graph shows canonical Planning/Active/On hold/Completed categories with proportional peaks, layered sage/sand/blue shading, exact counts, total and truthful current-snapshot insight. Zero stays flat; missing values are explicitly unavailable; no fabricated trend or claim of historic peak.
2. Cost gauge shows recorded cost/partial state plus largest category share only when all contributing values are known, nonnegative and denominator positive. Native legend uses procurement, employee payments, other expenses and overheads with exact source amounts. Zero, partial and signed values must not manufacture a percentage.
3. Finance graph renders real daily posted ledger amounts as shaded cylinders. Horizontal date navigation and the existing 48-point previous/next daily controls keep all 7/30/90 days reachable. Selected day stays synchronized. Negative and zero amounts preserve their sign/zero; missing amounts never become zero. Snapshot guides remain clearly labeled exact values outside the daily chart.
4. Splash/three slides match forest theme, including system areas, with current branding and sufficient contrast. Native launch color must be verified from a rebuilt local app if compiled resources change.
5. Native charts/legends remain readable at phone/tablet widths and enlarged text; exact values do not depend on SVG interaction. Maintain status bar contrast, reduced motion and current onboarding persistence.

## Implementation and risk

Use installed react-native-svg for lightweight static 2.5D artwork and native text/Pressables, rather than adding a rendering engine. Existing ECharts remain for unrelated panels. New chart geometry is isolated and regression-tested using unequal values, unavailable values, zero and negative finance. Source shapes remain compatible; only optional selected-day presentation input is added. Capture the dirty baseline before assigning files. Revert only this task's additions if necessary.

## Verification

Focused chart/data/dashboard/onboarding/brand tests, typecheck, Android export/build as appropriate, independent integrity review, actual native graph and entry-flow inspection. Report iOS or cold-launch checks not run and the existing unrelated contract-inventory mismatch. No commit/deploy/seed authorization.

## Delivered result

The three native SVG chart styles, existing data/selection integration, forest startup background, three themed onboarding scenes, and Android native splash resource correction are implemented. Financial charts retain cost categories, UTC dates and exact rupee amounts rather than the project labels shown only as visual references. Native cold launch, three slides, chart appearance, enlarged text and 7/90-day date selection were checked. Final checks and platform limits are recorded in the [task plan](../plans/2026-09-24-mobile-reference-charts.md).
