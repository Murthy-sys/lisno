# Responsive estimation row task plan

Date: 2026-11-10
Status: specification and task plan approved; Mode A implementation and verification complete.

Source of truth: [approved specification](../specs/2026-11-10-estimation-row-responsive-layout-design.md).

## Scope and preservation

Only correct the shared row's responsive layout and remove the UOM caption beneath the Main Line name. Preserve classification values, pricing rules, disabled controls, quantities, units in Qty/Rate headings, permissions and save payloads. No backend, API, database, dependency, visual redesign or unrelated cleanup.

At planning time the only dirty path is this request's specification. Record status and relevant diffs again before implementation; preserve any intervening work. Keep one parent task in progress. Implement only after plan approval and the A/B execution choice.

## T0. Capture the rendered baseline

Owner: primary agent. Depends on the required approvals and execution choice.

- Capture dirty paths and target contents before writers start.
- Reproduce the screenshot's Client view row and an estimator row using safe synthetic data and the actual shared components/styles. Check Standard and Special, readonly Type text and editable radios, optional pricing groups, and a long name.
- Record the failing viewport/container and colliding group bounds. Use temporary task-owned browser fixtures only; do not access or modify customer records.

Acceptance: evidence for AC1/AC3 and a bounded change target.

## T1. Fix responsive group sizing and reflow

Owner: one frontend implementation agent in Mode A; primary agent in Mode B. Depends on T0; can run alongside T2 on separate files.

Exclusive path: `frontend/src/styles/estimator-dashboard.css`.

- Fix intrinsic sizing/wrapping so Tier, Type, pricing controls and fields cannot shrink through each other. Reuse existing row/container queries and visual tokens; remove or adjust only conflicting rules in this shared-row block.
- Make wide layouts use space without excessive empty name columns, and let constrained rows wrap in the existing reading order before controls collide.
- Cover missing optional groups, readonly Standard/Special text, editable type controls, coarse-pointer targets and the existing 480/700/1050px container boundaries.
- Do not hide Type/tiers, truncate option names, reduce touch targets, change field values or modify unrelated styles.

Acceptance: AC1/AC3/AC4. Report changed rules and the observed rendered behavior; no CSS-declaration mirror tests.

## T2. Remove only the name-caption UOM

Owner: primary agent. Depends on T0; can run alongside T1.

Exclusive paths: `frontend/src/features/estimates/EstimateLineRow.tsx` and its test. Touch the preview test only if needed to assert retained Qty/Rate units.

- Remove the visible unit caption from `EstimateLineChoice` without changing selection callbacks or accessible checkbox names. Keep caller compatibility where possible; no caller/business-logic rewrite.
- Extend an existing focused presentation regression to verify the caption is absent and the name/checkbox remain. Check that preview quantity/rate labels retain their units.

Acceptance: AC2/AC4.

## T3. Reconcile and verify responsive states

Owner: primary agent. Depends on T1/T2; T0 fixture preparation is independent.

- Use actual estimator, Client view preview, and shared Client quotation row presentations with synthetic data. Resize viewport and row containers independently so a narrow drawer/sidebar is tested even on a wide screen.
- Check at least viewport widths 320, 390, 768, 1024, 1280 and 1536px, plus immediately around row-query boundaries. Include coarse-pointer/touch sizing, long names, Standard/Special, optional controls absent, and disabled tiers/rates.
- Measure that control group bounds and visible option contents stay within their group/row, no adjacent groups intersect, and no horizontal page overflow appears. Inspect representative desktop/mobile screenshots and check keyboard focus/choice state through resizing.
- If checks fail, adjust only the approved row styles/markup and rerun affected states. Do not change classification/pricing behavior to make geometry pass.
- Review the integrated diff for presentation-only scope, then freeze sources for final checks. Small-change integrity review is performed by the primary agent; no full finance/authorization audit is needed.

Acceptance: AC1–AC4 and rendered evidence for AC5.

## T4. Focused final checks and cleanup

Owner: `verification_runner` in Mode A after writers finish; primary agent in Mode B. Run once on the integrated frozen result; reuse unchanged passing evidence instead of repeating checks for a larger count.

From `frontend/`:

```sh
npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/client/ClientQuotation.pricingMode.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Include any additional directly modified test only when needed. Do not run backend/OCR or unrelated full suites. No lint script exists.

Run `git diff --check` and inspect final status/diff against T0. Remove only task-owned browser fixtures/screenshots/logs and stop only task-owned test servers; preserve the user's app services. Record exact command results, rendered matrix evidence, warnings/unrun checks and ignored build outputs in this file. Update the specification/plan status and hand off the limited outcome without committing or deploying.

Acceptance: AC5.

## Execution ordering

Mode A: T0 → CSS owner T1 in parallel with root's T2 → root T3 integration/rendered checks → verification runner T4. Give the CSS agent explicit ownership and tell it other writers share the worktree. Primary owns shared interpretation, integration, documents and browser cleanup. Do not spawn before A is selected.

Mode B: the primary agent performs all tasks inline with no implementation subagents.

## Implementation and verification record

- Changed `frontend/src/styles/estimator-dashboard.css`: keep wrapping flex layout at every width, prevent Tier/Type/Pricing/fields from shrinking into their contents, cap groups to their row width, limit name-column growth and separate groups by 8px. Preserved existing narrow-container reflow and touch dimensions.
- Changed `frontend/src/features/estimates/EstimateLineRow.tsx`: removed only the visible UOM caption below the Main Line name. Kept caller props, accessible names, quantities, Qty/Rate units and all business behavior intact.
- Extended existing assertions in `EstimateLineRow.test.tsx` and `KnowledgeMainLineClientPreview.test.tsx` for caption removal and retained unit headings. No dependency/backend/API/persistence changes.
- Root reviewed the integrated diff against the clean product baseline. CSS and component work used separate owners; the verification runner made no edits.

Rendered QA used synthetic data with the actual ConfiguredEstimateBuilder, KnowledgeMainLineClientPreview and ClientQuotationLine components, full app styles and Poppins fonts. Initial Standard/Special baseline geometry did not reproduce the exact screenshot overlap at the sampled widths; the change removes the shrinking/forced-wide-grid behavior and was validated on the requested presentations.

- Chromium: 69 width/state cases passed, covering viewports 320, 390, 768, 1024, 1280 and 1536px; exact row containers 479/480/481, 699/700/701 and 1049/1050/1051px; long names; editable and readonly Type; Standard/Special; Vendor/PMC/In-house; disabled tiers; and excluded rows without optional groups. Group/control bounds stayed inside their rows, with no adjacent-control intersections or control overflow.
- Six additional coarse-pointer viewport cases passed geometry and page-horizontal-overflow checks. Retained tier/type/pricing labels, quantity steppers and menu buttons measured 44px in the final touch check. Individual stepper buttons occupy the existing 42px inner area inside the 44px bordered stepper; no touch-size rules were changed.
- Keyboard tier selection worked; the unavailable Functional tier stayed disabled; Premium displayed its supplied ₹200.00 price; quantity 3 survived resizing. Desktop and mobile preview screenshots were inspected. Browser fixture used no customer records or mutations. No Firefox/Safari/device-hardware checks were run.
- `cd frontend && npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/client/ClientQuotation.pricingMode.test.tsx --maxWorkers=1`: exit 0, 5 files / 99 tests passed.
- `cd frontend && npm run typecheck`: exit 0.
- `cd frontend && npm run build`: exit 0, 3,346 modules transformed; Vite reported the existing large-chunk warning (>500kB). Ignored build outputs: `frontend/dist/` and TypeScript metadata in `frontend/node_modules/.tmp/`.
- `git diff --check`: passed. No lint script exists. Backend/OCR/full suites were not run for this presentation-only change.

Temporary fixtures/screenshots under `frontend/output/playwright/responsive-row-20261110/`, baseline captures under `/tmp/lisno-responsive-row-20261110-baseline/`, and this session's `.playwright-cli` snapshots/log were removed after inspection. The task-owned Vite server on port 5179 and browser session were stopped. Existing application services were preserved. No staging, commits, deployment, migrations or external mutations were performed.
