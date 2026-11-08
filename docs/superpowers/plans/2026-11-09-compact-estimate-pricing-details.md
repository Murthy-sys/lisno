# Compact estimate pricing details: task plan

Date: 2026-11-09
Status: Implemented and verified in Mode A
Specification: [Approved specification](../specs/2026-11-09-compact-estimate-pricing-details-design.md)
Specification approved in conversation on 2026-11-09.

## Presentation contract and ownership

Remove only the read-only Vendor summary and its vacant column. Keep editable
PMC/Vendor/In-house controls and other read-only mode values. Compact the
In-house component list, status and actions; keep one copy of a repeated
selection issue and preserve distinct errors, saved values and permitted actions.

No calculation, query, API, permission or persistence changes. Existing
`configuredInHouseSelectionIssue`, dimension validation and pricing state remain
the sources for deciding which feedback and retry action are relevant.
No schema, dependency, service or financial-report redesign is in scope.

Before writers start, the primary captures dirty paths and exact target
contents/diffs. Preserve earlier compact-row and hidden-tier-note work. Keep
one parent task in progress; all writers receive explicit non-overlapping files
and must accommodate existing changes without reverting other work.

## 1. Implement the shared and staff presentation

Owner: primary agent after task-plan approval and execution-mode selection.
Acceptance: specification criteria 1, 2, 4 and 5.

Exclusive files:

- `frontend/src/features/estimates/EstimatePricingModeControl.tsx` and its test.
- `frontend/src/styles/estimator-dashboard.css`.
- `frontend/src/features/leads/EstimateInHouseComponents.tsx` and its test.
- `frontend/src/features/leads/EstimateComponentBreakdown.tsx` and
  `configuredEstimate.componentPricing.test.tsx`.
- `frontend/src/features/leads/estimate-in-house-components.css`.
- Scoped presentation in `ConfiguredEstimateBuilder.tsx` and necessary existing
  builder/selling-price/collaboration test assertions.
- This task's specification and plan.

Tasks:

1. Omit the non-editable `sub_vendor` summary in the shared pricing presentation.
   Collapse its empty pricing wrapper/divider and adapt the desktop grid to
   retain the compact primary band. Preserve all editable controls and accurate
   read-only PMC/In-house/missing-mode states.
2. Tighten the In-house heading, checkbox rows, status text and spacing using
   the established row typography. Keep names and statuses adjacent and allow
   long content to wrap. Preserve unavailable-selection removal and disabled
   states. Remove redundant instruction copy.
3. Give repeated selection feedback one presentation owner. When both the
   selector and pricing status would show the same issue, render it once;
   retain distinct calculation failures and meaningful live status. Preserve
   standalone component use and manual-pricing validation.
4. Use short visible action labels (`Retry calculation`, `Use calculated rate`)
   with item-specific accessible names. Keep the existing retry/rate callbacks.
   Suppress retry for blocking selection, cost or dimension requirements;
   retain retry for eligible calculation-error/incomplete states and prevent
   retry while loading. Do not modify the pricing hook or arithmetic.
5. Scope compact breakdown styling beneath Main Lines so reporting and other
   financial views keep their current presentation. Retain disclosures, actual
   amounts and keyboard focus.

Add or adjust focused behavioral tests for omitted Vendor text, retained editable
controls, a single repeated warning, unavailable selection removal, eligible
retry, blocked retry and manual/calculated-rate actions. Avoid CSS-value tests.

## 2. Match the Client component list

Depends on the agreed presentation contract above. In Mode A, a frontend worker
may perform this slice in parallel with step 1; in Mode B, the primary performs
it inline. Shared component and stylesheet changes remain primary-owned.

Exclusive worker files: `frontend/src/features/client/ClientQuotationLine.tsx`,
scoped `clientQuotation.css`, and necessary existing Client pricing-mode/items
test assertions. Acceptance: criteria 2–5 for Client.

- Match the compact In-house heading, checkbox spacing and text sizes within
  the existing Client fieldset. Retain contextual accessible labels when visible
  text is shortened.
- Preserve saved versus pending amounts, component IDs and selection rules,
  unavailable choices, existing mode permissions and read-only rate/Type.
- Do not add Client manual-rate, retry or classification actions absent from
  the current flow. Do not edit draft models, API contracts or shared styles.

## 3. Integrate, review and inspect in the browser

Depends on both implementation slices. Primary owns reconciliation and source
fixes. In Mode A, use an independent read-only review of feedback/retry behavior
and scope after writers finish. A browser worker may prepare its synthetic
fixture in parallel, owning only temporary QA files and its own browser/server.
In Mode B, perform review and browser work inline.

- Render actual staff and Client components under their real application styles
  and sidebar layouts. Inspect desktop 1440px and mobile 390px; verify the compact
  primary band at 1050px available inner width with and without the Vendor block.
- Cover Standard/read-only Vendor, editable Special/PMC, and In-house empty,
  selected, missing-cost, unavailable-selection, loading, error, ready, manual
  and read-only states. Use a bounded selection of cases, not a full role/state
  Cartesian matrix. Compare against the screenshots and approved density.
- Confirm one visible instance of repeated selection feedback, compact actions,
  honest error/status messages, focus and keyboard operation, readable numeric
  text, suitable mobile targets and no overflow. Check that non-Main-Line
  breakdowns are not affected by scoped styling.
- Correct demonstrated issues and recheck affected states only. Preserve live
  application services; use synthetic data and an isolated temporary frontend
  fixture where appropriate.

Acceptance: criteria 1–5, with inspected screenshots and interaction evidence.

## 4. Final verification and handoff

Depends on completed review/browser corrections. Primary owns final evidence;
in Mode A, an independent verifier runs checks on the stable integrated tree.

From `frontend/`:

```sh
npm test -- src/features/estimates/EstimatePricingModeControl.test.tsx src/features/estimates/EstimateLineRow.test.tsx src/features/leads/EstimateInHouseComponents.test.tsx src/features/leads/configuredEstimate.componentPricing.test.tsx src/features/leads/useEstimateInHousePricing.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/client/ClientQuotation.pricingMode.test.tsx src/features/client/ClientQuotation.items.test.tsx
npm run typecheck
npm run build
```

Run root `git diff --check` and `git status --short`. Add a focused suite only
when another affected consumer or an unresolved failure justifies it. No broad
backend/OCR/full suite or lint run is planned; the repository has no lint script.

Record exact results, affected files, acceptance coverage and limitations here.
Stop only owned QA sessions; remove temporary fixtures/screenshots after inspection
and report ignored build/cache outputs. No data writes, dependencies, migrations,
commits, pushes or deployment.

## Gate status

Specification and task plan approved. User selected Mode A. Primary implemented
shared/staff presentation and owns integration; the Client worker completed its
isolated slice. Browser inspection, independent review and final verification
are complete.


## Implementation and rendered verification evidence

- Shared `EstimatePricingModeControl` omits only non-editable `sub_vendor`.
  Scoped row CSS collapses the vacant wrapper and uses four desktop columns;
  editable controls and other read-only mode values retain their behavior.
- Configured base-price text is omitted from the component picker, honoring the
  earlier request to hide configured prices. Missing-cost/unavailable warnings
  remain; actual selling-amount breakdowns are unchanged.
- Staff In-house selection uses compact heading/checkbox/status styles. The
  selector owns the repeated selection issue; pricing status suppresses only
  identical already-displayed text. Distinct errors stay visible. Retry uses
  its existing callback only when inputs are not blocked and editing/loading
  state permits it. Manual/calculated-rate callbacks remain unchanged.
- Retry and calculated-rate actions have short visible labels and contextual
  accessible names. The compact rate placeholder is `Override`; Client retains
  the honest `From components` source label with smaller desktop helper text.
- Client component rows use the same density and preserve component-ID commands,
  unavailable-selection removal, saved amounts and read-only rate/Type behavior.
  Compact financial breakdown styles are confined beneath Main Lines.
- Independent review found a lost live announcement when the duplicate warning
  was removed. Fixed with a persistent selector `role="status"` and group
  description; the transition test verifies removing/restoring the last selected
  component. The reviewer rechecked this fix and reported no remaining findings.

Browser checks used synthetic data with real components, application styles and
sidebars. Inspected desktop 1440px, exact 1050px inner rows, and mobile 390px.
Covered selection, unavailable removal, missing costs, loading/error retry,
manual/calculated-rate actions, PMC keyboard toggling, read-only states and ready
amount disclosures. There was one visible selection warning, no overflow, mobile
component targets at least 44px and no fresh page exceptions. The reporting
breakdown retained its original spacing. Eight screenshots were inspected;
final Client rate text wraps between whole words without clipping.

Existing backend/OCR/frontend sessions were untouched. Owned browser and temporary
port-4192 fixture were stopped. Verification is synthetic, not an authenticated
customer session. Final command results and temporary-artifact cleanup are
recorded below.


## Final checks and handoff

- Exact ten-suite command in step 4: exit 0, **153 tests passed across 10 suites**.
- After the final configured-base-price display refinement,
  `npm test -- src/features/leads/EstimateInHouseComponents.test.tsx`: exit 0,
  **5 tests passed**. These counts describe separate runs, not a single combined run.
- Final `npm run typecheck` and `npm run build`: exit 0; 3,336 modules transformed.
  Existing large-chunk warning remains: main JS 3,297.62 kB, CSS 1,566.99 kB.
- Root `git diff --check` and `git status --short`: passed/inspected. Task baseline
  reconciliation identified 15 intended frontend files plus these two working
  documents; unrelated dirty work was preserved. No API, query, calculation,
  authorization or persistence source changed.
- Final browser follow-up confirmed configured base-price text absent while
  missing-cost/unavailable messages remain. Primary inspected the updated
  desktop and mobile screenshots and accepted all six specification criteria.

Owned fixtures, baseline, screenshots and CLI logs at
`/private/tmp/lisno-pricing-details/` and `output/playwright/lisno-pricing-details/`
were removed after final inspection. Existing ignored outputs were refreshed:
`frontend/dist/`, `frontend/node_modules/.tmp/` and Vitest caches under
`frontend/node_modules/.vite/`.

No full/backend/OCR/replica-set/migration or lint checks were run for this frontend
presentation scope; no lint script exists. No dependencies, data operations,
commits, pushes or deployment. Existing service sessions remained untouched.
