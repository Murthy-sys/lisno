# Super Admin Finance: 3D liquid budget buckets

Date: 2026-10-24
Status: Approved by the user; implementation authorized in Mode A after task-plan approval.
Classification: Substantial frontend redesign; existing financial values and permissions remain authoritative.

## Goal and confirmed meanings

Replace the single flat cylinder in the Super Admin project Budget Overview with five separate, genuinely three-dimensional buckets containing gently moving liquid. The user confirmed that “over dues” means **Overheads**, and **Profit** means the **reserved 20% margin**, not approved value minus costs incurred so far.

The buckets, in order, are Total Budget, Budget After Margin, Expenses, Overheads, and Reserved Profit (20%). Keep the financial amounts readable as ordinary text while the scene provides the visual comparison.

## Current behavior and evidence

- `frontend/src/features/finance/ProjectBudgetOverview.tsx` currently draws one static, layered SVG cylinder next to Budget Summary and Budget insights. It already receives the validated `ProjectFinanceBucket`; it does not fetch or calculate a new financial baseline.
- `ProjectFinancePanel.tsx` selects this presentation only for the Super Admin Finance detail route and retains approved-source checks, ledger ownership, section navigation, and cost/completion actions. Other consumers use the existing standard presentation.
- `backend/src/domain/project-finance.ts` provides the approved subtotal excluding GST, the backend-rounded 20% reserve, usable budget, classified expenses, and remaining budget in integer paise. Total recorded expenses already include overheads.
- `frontend/package.json` uses React 19 and has no Three.js/Fiber scene dependency or existing WebGL architecture. The upstream Fiber installation documentation pairs Fiber 9 with React 19: https://github.com/pmndrs/react-three-fiber/blob/master/docs/getting-started/installation.mdx . Check exact package peer versions before installation at the implementation stage.
- The just-fixed real-data Finance list currently returns five valid approved projects. Preserve that query correction and all existing uncommitted Finance work.

## Financial contract

| Visible bucket | Existing authoritative value | Supporting label |
| --- | --- | --- |
| Total Budget | `approvedSubtotalPaise` | Excluding GST |
| Budget After Margin | `costBudgetPaise` | After reserving 20%, before expenses |
| Expenses | `recordedCostPaise` | Includes overheads |
| Overheads | `overheadPaise` | Included in expenses |
| Reserved Profit (20%) | `targetProfitPaise` | Reserved margin, not realized profit |

All buckets share a capacity scale equal to Total Budget, so heights are comparable. State “Liquid levels show each amount as a share of total budget.” The buckets are separate views of overlapping amounts, not five additive components. Preserve exact INR values and percentage denominators in semantic HTML.

Use the backend-rounded reserve; do not recalculate 20% in the renderer. Budget After Margin is the original usable allocation, not its remaining unspent balance. Keep remaining usable budget and expense utilization against usable budget in the exact summary below. Do not use `currentProfitPaise` for the reserved-profit bucket.

For a ₹25L total budget, the five values are ₹25L, ₹20L, ₹18L, ₹2L and ₹5L when ₹18L expenses include ₹2L overheads. Their liquid shares of total budget are 100%, 80%, 72%, 8% and 20%; expense utilization of usable budget remains 90%.

Zero amounts show empty vessels, without a decorative minimum fill. For a zero total budget, percentage levels are undefined; show exact amounts without inventing ratios. If an amount exceeds total capacity, bound its geometry and show the actual amount, ratio and excess explicitly. Separately preserve usable-budget overrun warnings even when expenses are below total budget. No financial amount may change because a visual level is clamped.

## Visual composition

- Use a full-width Budget Overview stage above the existing summary and insights, giving the five buckets sufficient space rather than squeezing them into the old left panel.
- Five consistent cylindrical vessels with visible rims, side-wall depth, an elliptical liquid surface, restrained material highlights, and an elevated fixed camera. Their liquid volumes must visibly read as 3D, not flat SVG fills.
- Use Lisno’s warm neutral surface and Poppins typography. Following the user’s color refinement, light muted greens identify budgets, pale champagne identifies the reserve, and light sand/clay tones distinguish costs. Red remains an exception cue for actual overruns. No rainbow palette, neon, decorative particles, or unrelated effects.
- Keep bucket names, exact amounts, ratios and explanatory text outside the canvas. Avoid five boxed feature cards or heavy card decoration.
- Wide screens show all five together. Narrow layouts reflow the same five metrics in reading order with enough space for their amounts, using two columns where legible and one column on the narrowest layout. Reframe actual 3D objects to the container instead of shrinking the desktop scene. No horizontal page overflow or drag requirement.
- Summary, insights, baseline disclosure, record-cost/completion actions, and existing detail sections remain reachable in their established order below the scene.

## Liquid motion and controls

- Each nonempty bucket has slow, low-amplitude surface ripples and subtle internal movement. Motion affects the surface appearance, never the average financial fill or displayed amount.
- When verified budget data changes, interpolate to the new height over approximately 600ms. Text updates directly to the new authoritative amount. Interrupt a transition from its current visible height if a newer value arrives.
- Use a stable camera. No hover-triggered movement, auto-rotation, scroll hijacking, splash particles, or simulated transfers between buckets.
- The user explicitly requested hiding the Pause motion control in the reference refinement. Retain reduced-motion preference handling: a still scene with no fill tweening, including changes while the page is open.
- Pause scene rendering while the document is hidden or the whole stage is offscreen. Resume without a large time-step jump. Clean up frames, listeners and GPU resources on route exit.

## Implementation boundaries and rendering choice

Use one lazily loaded Three.js scene with React Three Fiber, integrated into the existing React component. One canvas/context covers all visible vessels; do not create five independent WebGL renderers. Add only compatible `three`, `@react-three/fiber` and the required TypeScript types. The new dependency is justified by the requested genuine 3D geometry and animated liquid. No Drei, GSAP, physics engine, postprocessing framework, remote textures or model downloads are required.

Use inexpensive generated vessel geometry and a small liquid-surface shader or equivalent mesh animation. Reuse geometry/materials where appropriate, keep per-frame work out of React state, cap pixel ratio, and provide a lower-cost mobile path. Do not implement physical fluid simulation. Keep this scene local to the budget feature; no general-purpose 3D framework or renderer migration.

Render DOM amounts immediately. While the renderer loads, if WebGL initialization fails, or after context loss, keep the five values and meaningful static vessel illustrations usable. Handle error recovery without an endless loading state. Canvas geometry is decorative; essential information and controls remain keyboard/screen-reader accessible. Preserve touch scrolling.

The current trusted-bucket boundary, APIs, query ownership/invalidation, roles, Finance Head presentation, list filters/export, immutable approvals, approved-source checks, and financial formulas remain unchanged. No backend or persistence change is needed. No deployment, seed, migration, or data repair is in scope.

## Acceptance criteria

1. Super Admin Budget Overview shows five separately labelled 3D liquid vessels with the confirmed values and meanings. The old single stacked cylinder is replaced.
2. Liquid surfaces visibly move on supported devices; reduced motion works, the Pause control is hidden as requested, and exact amounts remain stable and readable.
3. Levels use one labelled total-budget scale; zero, unequal amounts, overhead inclusion, 20% reserve, over-100% values, and negative remaining usable budget are represented without falsifying the numbers.
4. Desktop, tablet and 360px layouts preserve all five values, usable controls and normal page scrolling. Text and focus indicators meet the existing accessibility standard.
5. WebGL failure/loading/context-loss states retain a complete static financial presentation. Leaving/reentering the route does not duplicate animation loops or leak contexts.
6. The new scene remains lazy and local, with one renderer and no unnecessary assets or effects. Verify a representative performance trace; distinguish observed desktop results from unmeasured physical-device performance.
7. Existing Finance summary, sections, ledger, source integrity, permission checks and entry/completion behavior continue to work. The real local approved-project list and detail still load.
8. Focused financial-presentation and interaction regressions, frontend typecheck/build, rendered responsive/motion/fallback checks and `git diff --check` pass. Add only tests that protect the changed behavior.

## Assumptions, risks and rollback

Confirmed assumptions: overheads are the fourth bucket; profit is the reserved margin. Scope is the pictured Super Admin project detail, not a redesign of the portfolio list or other roles.

Primary risks are misleading overlapping financial quantities, masking zero/overrun values with decorative fills, illegible mobile captions, WebGL failures, and excessive continuous GPU work. The explicit field mapping, common scale, exact DOM values, bounded motion, single lazy renderer, pause/fallback behavior and focused visual checks address them.

Rollback restores the current SVG overview and removes the feature-local renderer dependencies, without changing stored data or financial contracts.

Open product decisions: none. Specification approval is the next repository workflow gate; the task plan and execution choice follow separately.


## Approved visual reference refinement

The user supplied a closer reference for the existing five-vessel view: tall clear glass, thin pale rims, clear bases, softly lit translucent liquid with surface waves and flowing highlights, and compact icon/name/amount captions below. Remove all graduation rings, ticks and numeric scale labels. Following the user's latest refinement, show no percentages or readout labels inside the glasses; keep the existing semantic captions and amounts below them, with the common total-budget denominator stated. Use light green/sage, restrained coral, cool pale gray and champagne tones; empty zero-value vessels stay empty despite the reference's decorative zero-value puddles. The user explicitly confirmed that the pause control should stay hidden. Existing financial semantics, source mapping and rendering boundaries remain authoritative.
