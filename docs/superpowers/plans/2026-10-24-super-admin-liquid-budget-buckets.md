# Super Admin Finance: 3D liquid budget buckets implementation plan

Date: 2026-10-24
Status: Implemented and verified locally.
Approved specification: [3D liquid budget buckets](../specs/2026-10-24-super-admin-liquid-budget-buckets-design.md).
Approval record: The user approved the specification on 2026-10-24. This record supersedes its awaiting-approval status line; its requirements are unchanged.
Execution mode: A, parallel sub-agents, selected by the user after plan approval.

## Outcome and invariants

Replace the Super Admin detail’s single static cylinder with five genuinely 3D liquid vessels: Total Budget, Budget After Margin, Expenses, Overheads, and Reserved Profit (20%). Keep accurate HTML amounts and the existing summary/actions, with a usable static fallback.

The five amounts come directly from `approvedSubtotalPaise`, `costBudgetPaise`, `recordedCostPaise`, `overheadPaise`, and `targetProfitPaise`. All vessel heights use total budget as their common capacity. Overheads are included in expenses; reserved profit is not realized profit. Preserve zero values, undefined ratios, exact paise amounts, signed remaining budget, and explicit overruns. The scene never calculates or changes a financial baseline.

No backend, permissions, data, workflow, Finance Head, or portfolio-list changes. Preserve the recent orphan-reference loading fix and all prior uncommitted work. No seed, migration, deployment, commit, or push.

## Ownership and shared boundary

| Owner | Exclusive scope | Deliverable |
| --- | --- | --- |
| Primary | Dependency manifest/lockfile; small shared bucket-presentation types/mapping; `ProjectBudgetOverview.tsx`, its existing CSS/tests; any necessary existing Finance test/fixture integration; this plan | Accurate financial mapping, approved dependencies, integration and final reconciliation |
| 3D implementer | New feature-local `BudgetLiquidScene.tsx` and a small material/geometry helper only if justified | One renderer, five real vessels, liquid surfaces, stable camera, responsive placement, frame lifecycle and GPU cleanup |
| UI implementer | New feature-local `BudgetLiquidStage.tsx`, its scoped CSS and focused tests | Lazy scene boundary, HTML labels/amounts, responsive layout, static vessel fallback, motion control, visibility/preferences and accessible states |
| Integrity reviewer | Read-only | Review value meaning, zero/overflow handling, shared-consumer isolation, lifecycle and fallback correctness |
| Verification runner | Read-only product sources; temporary test logs allowed | Final focused tests/typecheck/build and hygiene after integration/review |

Before writers start, the primary fixes the small scene/stage interface: metric IDs and tones, read-only exact amounts and normalized visual fills, responsive column/row placement, animation-active state, and renderer ready/failure notifications. The stage owns semantic motion preferences and layout; the scene owns frame-level movement. Neither owns queries or mutations. Any interface change returns to the primary owner.

Every agent must be told that others share the worktree, preserve existing edits, and stay inside its assigned files. Do not assign the existing dirty overview files to multiple writers.

## Dependency-ordered tasks

### T0. Capture baseline and settle the interface

Owner: Primary. Requires task-plan approval and execution choice. Acceptance: AC1, AC3, AC7, AC8.

- Save initial dirty paths and target diffs/copies, including untracked prior Finance components. Confirm the live local list/detail still load and record aggregate results without customer screenshots or credentials.
- Run the focused existing overview regression baseline. Inspect actual layout widths and existing Finance state/error handling without repeating unrelated investigations.
- Define one feature-local mapping of the five existing amounts to captions and a common-capacity visual fill. Keep actual ratios separate from clamped geometry and retain exact amounts in the DOM.
- Settle scene/stage props and shared placement rules. Use five columns when wide, two when readable, one at the narrowest layout. Reserve caption space so the fixed camera and labels remain aligned.

### T1. Add the bounded rendering dependencies

Owner: Primary. Dependency: T0. Acceptance: AC5, AC6, AC8.

- Check installed React/ReactDOM and current upstream peer requirements. Select compatible stable `three`, React-19-compatible `@react-three/fiber`, and `@types/three`; install locally and update only the relevant manifest/lockfile.
- Do not add Drei, animation libraries, physics, model assets, postprocessing, or forced peer overrides.
- Keep Three/Fiber imports behind the feature’s lazy scene boundary, including avoiding accidental eager imports through a shared barrel or types-only mapping.

### T2. Build the five-vessel 3D scene

Owner: 3D implementer. Dependencies: T0–T1. Parallel-safe with T3. Acceptance: AC1–AC3, AC5, AC6.

- Generate matching cylindrical vessels with real rims/walls and readable 3D liquid volumes under restrained lighting. Use a stable elevated camera; no orbit/drag requirement or unrelated effects.
- Use one canvas/context and shared inexpensive geometry/materials where suitable. Position the five vessels from the agreed responsive layout rather than five independent canvases.
- Animate low-amplitude surface waves without changing average fill. Interpolate verified value changes over about 600ms, interrupted from current geometry; zero values remain empty. Bound over-capacity geometry while the stage reports actual excess.
- Keep frame work in refs/uniforms, avoid frame-level React updates and allocations, cap pixel ratio, and lower mobile geometry cost.
- Render a still frame when paused/reduced motion applies, stop unnecessary frames while hidden/offscreen, handle time resumption, and dispose renderer resources/listeners on unmount. Signal creation/context failure to the stage.

### T3. Build the accessible stage and static fallback

Owner: UI implementer. Dependencies: T0–T1. Parallel-safe with T2. Acceptance: AC1–AC6.

- Render five semantic captions with exact INR amounts and meaningful notes immediately, independent of WebGL readiness. Show the common-scale explanation and distinguish overlapping amounts.
- Build the full-width stage with warm neutral styling, existing typography and restrained green/ochre/clay materials. Keep captions out of the canvas and avoid boxed feature-card styling.
- Lazy-load the scene with a meaningful static five-vessel presentation for loading, unavailable WebGL, creation errors, and context loss. Keep amounts/actions usable and provide bounded recovery rather than an endless loading state.
- Own accessible Pause/Resume controls, reduced-motion changes, document visibility and intersection observation. Preserve keyboard focus and touch/page scrolling.
- Reflow captions and scene placement together at desktop/tablet/mobile sizes. Add focused tests for motion controls/preferences, fallback retention, and accessible metric labels; do not mock WebGL tests as proof of real rendering.

### T4. Integrate into the existing Finance detail

Owner: Primary. Dependencies: T2–T3 completed. Acceptance: AC1–AC5, AC7.

- Replace only the old single cylinder in `ProjectBudgetOverview`; place the new stage above the summary/insights and remove obsolete single-cylinder styling.
- Preserve the exact summary, remaining usable amount, expense-versus-usable utilization, baseline disclosure, section navigation, forms, and integrity/error behavior.
- Update meaningful overview regressions for the five-bucket mapping: ₹25L/₹20L/₹18L/₹2L/₹5L, an unequal project, paise rounding, zero budget/expenses, positive expenses with zero capacity, and expenses above total/usable budget. Assert that the profit bucket uses reserved margin even when `currentProfitPaise` differs.
- Extend existing synthetic QA fixtures only if needed for repeatable visual edge states; never change stored local projects to create test scenarios.
- Inspect the integrated diff and dependency tree before review. Do not broaden into unrelated Finance or dashboard work.

### T5. Review and final verification

Owners: Integrity reviewer, then Verification runner; primary owns rendered QA. Dependency: T4. Acceptance: AC1–AC8.

- Review the financial mapping and denominator labels, clamped geometry versus real amounts, permission/query boundaries, error fallback, reduced motion, cleanup and dependency scope. Resolve concrete findings before final checks.
- Run `cd frontend && npm test -- src/features/finance`, `npm run typecheck`, and `npm run build`. Inspect code splitting to confirm the 3D implementation is lazy. Run root `git diff --check` and review `git status --short`. No lint script exists.
- Render at 1440, 1024 and 360px, and inspect screenshot images with synthetic data. Verify all five distinct vessels, depth/material quality, legible captions, no overlap/overflow, and normal touch scrolling.
- Observe liquid movement at different times, Pause/Resume, rapid value changes, zero/overrun states, reduced motion on initial load and preference changes, hidden/offscreen pause, resizing, and route exit/reentry. Verify one canvas and no accumulating animation loops/contexts.
- Exercise WebGL disabled/initialization failure and context loss; confirm static vessels, exact values, controls and other Finance actions remain usable.
- Run rendered accessibility checks and keyboard navigation. Record a representative runtime trace and renderer workload under stated desktop/mobile-emulation conditions; do not claim physical-mobile frame rates from emulation.
- Confirm the actual local approved-project list and a detail still load using read-only access; do not capture private customer information in artifacts. Keep mutation regressions in isolated tests.
- Record exact outcomes, unrun checks, dependency additions, warnings/limitations and artifact paths here. Preserve pre-existing logs, close only owned temporary browser sessions, and keep the user’s existing local app running.

## Parallelism and approval boundaries

T0–T1 establish the common contract and dependency versions. In Mode A, T2 and T3 can run simultaneously in non-overlapping files; the primary owns shared integration. T4 follows both writers. Integrity review then precedes final integrated verification. Keep one parent implementation task in progress. In Mode B, the primary performs the same work sequentially without implementation agents.

No implementation agents, dependency installation, product edits or browser mutations occur at this task-plan gate. After plan approval, ask for the execution choice once, as required by the repository workflow.

## Acceptance trace

| Specification criterion | Verification evidence |
| --- | --- |
| AC1: five real 3D vessels | Desktop/tablet/mobile screenshots and actual renderer inspection |
| AC2: liquid motion and controls | Timed rendering observations, keyboard Pause/Resume and reduced-motion checks |
| AC3: accurate financial representation | Focused asymmetric-value/zero/overrun/rounding tests and exact DOM assertions |
| AC4: responsive/accessibility | Width matrix, axe/keyboard checks, caption and scrolling inspection |
| AC5: fallback and lifecycle | Disabled-WebGL/context-loss checks, route reentry and frame/context inspection |
| AC6: bounded lazy renderer | Build chunk evidence, one canvas, runtime trace and cleanup verification |
| AC7: existing Finance retained | Finance regressions and read-only live list/detail check |
| AC8: final integration checks | Focused tests, typecheck/build, diff/status and explicit limitations |

## Execution record

- Specification approved by the user on 2026-10-24.
- Task plan approved and Mode A selected. Initial dirty paths, diffs, and target copies saved under `/tmp/lisno-liquid-buckets`.
- T0: existing overview baseline passed (10 tests). The existing validated bucket and opt-in Super Admin presentation remain the source of truth.
- T1–T4 completed: shared presentation contract settled in `budgetLiquidMetrics.ts`; one canvas aligned with semantic grid cells. React 19.2.8 pairs with Fiber 9.8.2; Three 0.186.1 and types 0.186.0 selected.


### Final implementation and verification

- T2–T4: added `BudgetLiquidScene.tsx`, `BudgetLiquidStage.tsx`/CSS/tests and `budgetLiquidMetrics.ts`; replaced the old cylinder in `ProjectBudgetOverview.tsx` and removed its obsolete CSS. Existing summary, insights, transactions, baseline and actions remain. No backend or API changes in this task.
- One lazily loaded Fiber canvas renders five real mesh vessels, shader-driven ripples and subtle volume motion. Exact paise amounts remain HTML. The stage reflows 5/2/1 columns, offers keyboard Pause/Resume, tracks reduced motion/visibility/intersection, and retains static vessels through loading and failures.
- Dependencies: Three.js 0.186.1, Fiber 9.8.2, and development types 0.186.0. No extra animation, asset or physics dependencies were added directly. Existing React 19.2.8 satisfies the installed peers.
- T5 independent integrity review: no confirmed findings. Finance mapping, preserved approved baseline, role opt-in, lazy loading, lifecycle and cleanup reviewed against saved pre-task copies.

| Check | Actual result |
| --- | --- |
| `cd frontend && npm test -- src/features/finance` | Passed: 85 tests / 8 files |
| `cd frontend && npm run typecheck` | Passed |
| `cd frontend && npm run build` | Passed; renderer is a separate dynamically imported chunk, not HTML-preloaded |
| `git diff --check` | Passed |
| Chrome viewport matrix | 1440, 1024 and 360px inspected; five captions, one canvas, no horizontal overflow; 5/2/1 columns |
| Rendered accessibility | axe: zero violations, 34 passed checks; keyboard Enter toggles Pause/Resume |
| Motion | Different timed active screenshots; paused screenshots byte-identical; actual renderer stops under pause and reduced motion |
| Visibility | Offscreen renders zero frames; simulated hidden-document signal renders zero frames, resumes afterward |
| Fallback | Actual `WEBGL_lose_context` and forced null WebGL context creation both preserve five figures and summary; manual retry restores one renderer |
| Route lifecycle | Three exit/reentry cycles: zero canvases on exit, previous context lost, exactly one canvas on reentry |
| Financial edge rendering | ₹25L / ₹20L / ₹18L / ₹2L / ₹5L sample; rapid updates; zero expenses; zero capacity with positive expenses; 120% total-budget spending with separately preserved 150% usable utilization |
| Local real data | Before: list HTTP 200, five projects, all detail amounts agree. After: five rows, five buckets, one canvas, summary and Transactions work, return retains five rows |
| Mobile scrolling | Scroll over the canvas at 360px works; canvas does not capture pointer events |

A representative warm development-mode trace used Headless Chrome 155 on macOS, 1440x1000, DPR 1, no CPU/network throttling. Actual WebGL clear-call timestamps recorded 600 frames in ten seconds, median 16.7ms / p95 17.8ms / max 21.1ms, 60 draw calls and 26,600 triangles per frame. Mobile-width emulation reduced geometry to 15,660 triangles per frame; this is not a physical-mobile performance claim. Paused/reduced/offscreen samples had zero renders. Trace categories captured timeline events, not a complete GPU-time or memory measurement.

Artifacts and logs are under `/tmp/lisno-liquid-buckets`: `final-finance-tests.log`, `final-typecheck.log`, `final-build.log`, `runtime-trace.json`, `motion-report.json`, `fallback-report.json`, `edge-report.json`, `live-before.json`, `live-after.json`, responsive screenshots and synthetic edge-state screenshots. No real customer screenshots were captured. Temporary CLI files created by this task were relocated there; the pre-existing dirty CLI log was preserved.

Known limits: the lazy renderer chunk is 936.81kB / 252.93kB gzip, and Vite reports its standard >500kB chunk warning along with existing large chunks. Fiber emits Three's `Clock` deprecation warning in development; no unexpected runtime/shader errors were observed after integration. npm audit reports an existing high-severity Zod constrained-collection advisory; the new rendering packages have no reported advisory in that audit. No unrelated dependency upgrade was made. Physical iOS/Android and Safari were not tested; browser measurements are development-mode Chrome evidence. Backend, replica-set, OCR and unrelated full-frontend suites were not rerun for this frontend-only change; no lint script exists.

No commits, push, deployment, migration, seed, stored-project mutation or external communication performed. Existing local services remain running. All assigned agents completed and no product changes followed the final passing checks.


### Follow-up: make liquid movement clearly visible

The user reported that the liquid should move inside the buckets. This refines existing AC2 (visible liquid movement), with the financial and scene scope unchanged, so the approved Mode A execution continues. Inspection found that the current surface displacement fades to zero at the vessel wall and is capped at 0.032 units; its waterline therefore remains flat and the motion reads mostly as a subtle highlight.

Completed one bounded task: update `BudgetLiquidScene.tsx` so a zero-mean slosh moves the contact line and the liquid body's top edge together. Keep the bucket stationary, bound waves by liquid depth and rim clearance, preserve empty zero values and exact amounts, and retain pause/reduced-motion/offscreen behavior. The existing scene implementer owns that file; the primary owns integration, rendered comparisons and focused verification. No dependency, API, layout or data change is needed. Baseline saved at `/tmp/lisno-liquid-slosh`.


Follow-up verification: only `BudgetLiquidScene.tsx` product code changed. The contact line now rocks on an approximately 4.6-second cycle, with surface and volume edges sharing the wave; amplitude is bounded by depth and rim clearance. Separate bottom material keeps the base fixed. Existing fill transitions, zero values and exact financial figures are preserved.

- `npm test -- src/features/finance/ProjectBudgetOverview.test.tsx src/features/finance/BudgetLiquidStage.test.tsx`: 20 passed.
- `npm run typecheck`, `npm run build`, `git diff --check`: passed. The existing large-chunk build warning remains.
- Actual Chrome desktop/mobile rendering inspected at different motion phases: clear changing waterlines, no surface/body gap, one canvas, no overflow or unexpected errors, unchanged figures, reduced motion works and pause renders zero frames. Paused screenshots are identical.
- A numerical sweep at 0/8/20/72/80/100% fills and 80 phases confirmed zero-mean waves, no rim/base crossing, and zero displacement for empty buckets. No physical fluid simulation or dependency addition.
- Artifacts: `/tmp/lisno-liquid-slosh`, including `slosh-0.png`, `slosh-1.png`, `mobile-liquid.png`, `liquid-motion.webm`, and test/build logs. Physical-device/Safari checks and backend/full regression suites were not repeated for this one-file animation refinement. No external actions or data changes.


### Follow-up: lighter liquid colors

User requested lighter colors inside the existing buckets. Applied five muted light tones to `BudgetLiquidScene.tsx` and matching SVG fallback tokens in `BudgetLiquidStage.css`. This is a palette refinement within the approved visual scope; motion, geometry, captions and financial values remain intact. Independent review confirmed only ten color substitutions across the two product files and exact 3D/fallback palette agreement.

Verification: frontend `npm run typecheck` and `git diff --check` passed. Actual rendered Chrome screenshot inspected; axe reported zero violations, one canvas, and no unexpected runtime errors. Existing dependency deprecation warnings remain. No new tests, dependencies, backend changes or deployment; broader tests/build and physical-device checks were not repeated for color literals. Baseline, typecheck log and preview: `/tmp/lisno-light-liquid`.


### Follow-up: match the supplied glass reference

Continue the approved visual implementation in Mode A using the user's precise reference. Baseline copies under `/tmp/lisno-glass-reference` preserve the latest local files, including the already-commented pause button. The user confirmed that control should remain hidden.

- Scene owner: only `BudgetLiquidScene.tsx`. Remove graduation geometry, refine clear tall glass/rims/base, increase the visual's size, and add watery illumination and richer bounded surface motion. Preserve one canvas, exact mean fills, zero/overrun bounds and resource lifecycle.
- Stage owner: only `BudgetLiquidStage.tsx`, its CSS and tests. Align a 300px graphic with central true percentages and compact icon/name/amount captions, match the static fallback, remove unused pause state, and retain reduced-motion/visibility behavior. No side scales. Preserve actual captions/denominators and zero-capacity explanations.
- Primary: integration, existing overview regressions if required, exact reference comparison, responsive/rendered motion/fallback verification and final checks. No API, persistence, dependency or stored-data change. Keep the financial source and previous loading fix intact.

Completed. Tall clear cylinders now use thin pale rims and clear bases, with no graduation geometry. Translucent liquid has moving contact lines, cross-ripples, luminous surface edges and flowing reflections. Central DOM percentages and compact custom SVG icon captions follow the supplied reference. The hidden Pause control and its unused state were removed; reduced-motion, visibility and intersection handling remain. Financial mappings, APIs and dependencies did not change.

Final integrated checks:

- `cd frontend && npm test -- src/features/finance`: 85 tests across 8 files passed.
- `cd frontend && npm run typecheck`, `npm run build`, and root `git diff --check`: passed. Independent read-only review found no concrete blocker.
- Rendered Chrome checks at 1440, 1024 and 360px: 5/2/1 columns, all five captions, one canvas, no horizontal overflow. Pause control absent. axe reported zero violations; no unexpected runtime/shader errors.
- Timed active screenshots differ; reduced-motion screenshots are byte-identical and the renderer recorded zero frames in a 600ms still-state sample. Active desktop sampling recorded 121 frames in two seconds, median interval 16.7ms / p95 17.6ms. This is local development Chrome evidence, not a physical-mobile performance claim.
- Actual WebGL context loss preserves all five amounts and static vessels; Retry restores one canvas. Reference amounts render as ₹16,675 / ₹13,340 / ₹0 / ₹0 / ₹3,335, with 100/80/0/0/20% central labels and empty zero-value vessels.
- Evidence is under `/tmp/lisno-glass-reference`: `browser-results.json`, reference/responsive/fallback screenshots, final command logs and a six-second `liquid-preview.mp4`. Temporary CLI artifacts created in this refinement were relocated there; pre-existing dirty files were preserved.

The scene remains lazy (939.80kB / 253.69kB gzip); the existing large-chunk build warning remains. Physical-device/Safari testing, unrelated full suites, backend and OCR checks were not repeated for this presentation-only refinement. No lint script exists. No dependencies, commits, deployment, migrations, seeds or stored-data mutations were added or performed.

### Follow-up: captions below the glass only

The user requested removing the percentages and readout labels inside every glass. Continue the approved visual scope in Mode A: primary removes the overlay markup and obsolete CSS from `BudgetLiquidStage.tsx`/CSS; the existing stage agent updates only the affected assertions in `BudgetLiquidStage.test.tsx`. Retain the names, exact amounts and existing semantic captions below each vessel. Scene geometry, liquid motion, financial mapping and APIs remain intact. Baseline saved under `/tmp/lisno-glass-captions`. Verify focused stage/overview regressions, typecheck and rendered desktop/mobile label placement.

Completed: removed the in-glass overlay, its label mapping and four obsolete CSS rules. Existing stage tests (7) and overview tests (13) passed; frontend typecheck/build and `git diff --check` passed. Rendered checks at 1440px and 360px confirmed five text-free glass regions, captions below each glass, unchanged amounts, one canvas, no overflow, no unexpected runtime errors and zero axe violations. Screenshots are in `/tmp/lisno-glass-captions`; owned browser artifacts were moved there. The existing build chunk warning remains. No new dependencies, finance/API changes or deployment. Broader suites and physical-device/Safari checks were not repeated for this small markup removal.
