# Main-line reference styling: task plan

Date: 2026-11-08
Status: Compact desktop revision implemented and verified in Mode A
Specification: [Approved styling specification](../specs/2026-11-08-estimate-main-line-reference-style-design.md)
Compact desktop specification revision approved in conversation on 2026-11-08.

## Active follow-up: keep desktop controls on one row

This bounded CSS follow-up implements the approved specification's **Compact
desktop revision**. The original implementation plan and results below are
historical context, not tasks to repeat. The follow-up was approved before product edits. Implementation is now
authorized in Mode A.
Only one parent implementation task will be in progress at a time.

### 1. Capture baseline and compact the existing row

Owner: primary agent. Depends on task-plan approval and execution-mode selection.
Exclusive product ownership: `frontend/src/styles/estimator-dashboard.css`;
`frontend/src/features/client/clientQuotation.css` only if an existing override
prevents the shared compact styling. Preserve existing dirty changes by recording
the initial status and exact target contents/diffs before editing.

- Reduce desktop item/amount text to approximately 14px, labels/options to
  11–12px, numeric text to 13–14px, and thumbnail to approximately 36px.
- Reduce group padding, gaps and oversized reserved widths together. Use the
  row's actual available width to retain all primary groups in one band at
  1,050px and above; keep Standard/read-only Pricing compact. Do not rely on
  font-size changes alone or CSS transforms that shrink the whole interface.
- Retain reference styling and DOM order. Keep supporting availability/error,
  dimension and component information below the primary band. Preserve native
  controls, focus indicators, permissions and existing financial values.
- Preserve readable mobile inputs, touch targets and wrapping below the viable
  desktop width. Do not hide long names or numeric content to force a fit.

Acceptance: the revision's single-row width, readability, preserved behavior and
mobile requirements. No component, API, pricing or workflow rewrite is planned.

### 2. Inspect rendered rows and correct only demonstrated problems

Depends on step 1. Primary owns visual acceptance and any source fixes.
In Mode A, an independent browser worker may prepare a synthetic fixture while
the primary edits CSS; worker ownership is limited to temporary QA files and
its own browser/server session. It must not edit product CSS or existing services.
In Mode B, the primary performs this work inline. No overlapping writers.

- Render real shared/staff/Client components under the actual application styles.
  Inspect Standard, editable Special (PMC off/on), Client and read-only rows at
  1,050, 1,200, 1,500 and 1,760px of available inner row width.
- Inspect the 1440px editor with sidebar for staff and Client, plus 390px mobile.
  Check long names, quantity/rate/amount text, unavailable tiers/prices and one
  In-house state. Measure for horizontal overflow and internal numeric clipping.
- Confirm keyboard order, visible focus, PMC switching and menu operation in
  rendered checks. Correct failures in the owned styles, then recheck only the
  affected widths/states. Avoid repeating the previous broad workflow matrix.

Acceptance: all primary groups remain in one desktop band at the specified
widths; messages and mobile controls remain readable and operable.

### 3. Final verification and handoff

Depends on step 2. Primary owns reconciliation and the final result. In Mode A,
an independent verifier may run the final commands after CSS changes settle;
in Mode B, the primary runs them. Verify the task diff against the captured
baseline and preserve all unrelated work.

```sh
cd frontend
npm run typecheck
npm run build
```

At the repository root, run `git diff --check` and `git status --short`. Browser
interaction checks are the focused regression lane for this CSS-only revision.
If component/control markup must change, rerun the existing shared-row/pricing
and affected consumer suites; do not add tests that merely assert CSS values.
No backend/OCR/full suite or lint run is planned; no lint script exists.

Record exact results and remaining limitations here. Stop only owned QA services,
remove owned temporary fixtures/screenshots after inspection, and report ignored
build/cache outputs. No dependency, data, migration, commit, push or deployment.

## Current gate status

Compact desktop specification and revised task plan approved. User selected
Mode A for this follow-up. CSS implementation, independent browser checks and
final verification are complete.

## Compact desktop implementation evidence

Only `frontend/src/styles/estimator-dashboard.css` changed in product code.
Desktop text is 14px for titles/amounts, 11px for labels/options and 13px for
numeric inputs; thumbnails are 36px. Group widths follow their content and a
container query retains one primary band from 1,050px inner width on desktop.
The numeric block reserves enough width for Qty, Rate and Saved amount headings.
Mobile uses the existing wrapping layout, 16px editable numeric text and touch
controls. Shared component markup, Client overrides, callbacks and values were
unchanged; pre-row stylesheet content is byte-identical to the task baseline.

Rendered acceptance evidence:

- 40 desktop width/state checks at inner widths 1,050/1,200/1,500/1,760px covered
  staff and Client Standard, editable Special, PMC, and read-only presentations.
  Actual 1440px editor shells included the sidebar. Primary groups stayed in one
  band with no row or page overflow.
- Inspected final 1,050px staff, 1440px Client and 390px Client component-pricing
  screenshots. Names remain visible within identity; labels, quantities, rates,
  saved amounts and mobile component details are readable. Supporting messages
  remain below the primary band.
- 17 browser interaction assertions passed, covering keyboard order/focus,
  PMC on/off and remembered In-house choice, quantity/rate edits, menu focus,
  Client read-only Type/rate and saved amounts. Four final targeted checks after
  heading-width corrections passed. No application console errors.
- Final independent `npm run typecheck` and `npm run build` passed (exit 0;
  3,336 modules). `git diff --check` passed and `git status --short` was inspected.
  Existing >500 kB chunk warning remains: main JS 3,297.12 kB, CSS 1,562.77 kB.
  Ignored outputs refreshed: `frontend/dist/` and `frontend/node_modules/.tmp/`.

Verification uses synthetic data and real application components/styles, not
an authenticated customer session. No unit suite was repeated for this CSS-only
change; no markup or behavior changed. No backend/OCR/full suite or lint run,
no dependency/data/migration changes, commits, pushes or deployment. Existing
services were untouched; the owned port-4192 fixture and browser were stopped.
Temporary paths: `/private/tmp/lisno-compact-row/` and
`output/playwright/lisno-compact-row/`; owned fixtures, screenshots, CLI logs
and baseline were removed after final reconciliation.

## Historical plan: original reference styling

## Presentation contract

Use the supplied image as the visual target. The desktop reading and tab order
is checkbox/image/name/UOM, Tier, Type, Pricing, Qty, Rate, amount, then menu.
Match its perimeter, dividers, control shapes, green selection and amount emphasis.

Extend `EstimateLineLayout` with optional `tier`, `type` and `pricing` presentation
slots before its existing `fields` slot. Keep `choice` first and use `children`
for full-width supporting detail below the primary band. Existing caller-owned
values, permission checks and callbacks remain authoritative. Do not use CSS
ordering to make the screen and keyboard sequences disagree.

Visible labels become Tier, Type, Pricing, Qty and Rate. Show Vendor for the
existing `sub_vendor` selection, retaining its stored value and contextual
accessible name. Client Type is a read-only known value; absent classification
must not be guessed. Preserve explicit saved/pending amount meaning for Client.

No backend, API, pricing formula, workflow, persistence, dependency or service
change is required. The reference's requested shapes/elevation take precedence
over general styling defaults for this row only.

## 1. Baseline and shared shell

Owner: primary agent. Acceptance: AC1, AC2 and AC4.

- Capture current dirty paths and exact target contents/diffs before writers.
  Preserve previous PMC capability, Refresh items, approval and pricing work.
- Extend `EstimateLineRow.tsx` with the slots above, keeping semantic fieldsets
  and native controls. Move the checkbox before the image; place UOM below the
  title. Reuse the existing ceiling asset and current image fallback behavior.
- Update the shared tier and pricing presentations with short visible legends,
  reference radio/switch styling and item/room-specific accessible names.
  Preserve disabled reasons in accessible, visible supporting detail rather
  than widening the main control labels indefinitely.
- Restructure scoped row styles in `estimator-dashboard.css`. Reconcile the
  existing compact-builder overrides instead of stacking conflicting layouts.
  At reference width, keep the primary band roughly 90–100px high; use actual
  row width to wrap at smaller sizes without clipping or reducing readability.
- Keep validation, dimensions, components and source notes below the band when
  present. Ensure right-side amount/menu alignment and focus visibility.
- Update shared row/control tests for semantic order, checkbox labeling,
  selected/disabled states, switch/radio keyboard behavior and menu focus return.

Exclusive primary ownership during implementation:

- `frontend/src/features/estimates/EstimateLineRow.tsx` and its test
- `frontend/src/features/estimates/EstimatePricingModeControl.tsx` and its test
- Scoped rules in `frontend/src/styles/estimator-dashboard.css`
- This task's specification and plan

Publish the final slot/class contract to consumer writers before step 2. The
primary retains ownership of shared styles through visual integration.

## 2. Update the two consumers

Depends on step 1. In Mode A, these slices can run in parallel with explicit
non-overlapping ownership. In Mode B, the primary performs them sequentially.
Every writer must inspect its existing dirty diff, preserve others' edits and
return cross-boundary changes to the primary rather than editing shared files.

### Staff consumer

Owner in Mode A: frontend implementer A.

Exclusive files: `ConfiguredEstimateBuilder.tsx`, its component and selling-price
tests, and only necessary assertions in `LeadEstimateWorkspace.tiers.test.tsx`.

- Supply tier, classification and pricing through the shared slots in every row
  path, including unavailable and excluded review. Move auxiliary state to the
  supporting-detail slot; preserve all current callbacks and capability guards.
- Match Qty/Rate/amount presentation with the reference. Keep real quantity,
  manual rate, rounding, source state and calculated totals unchanged.
- Preserve Standard/Special restrictions, post-handoff permissions, remembered
  non-PMC choices and manual prices on unrelated edits. Do not alter workspace
  save/submit or Refresh items behavior to achieve a visual match.
- Run focused builder/price tests; add behavioral assertions only where the
  markup restructure changes interaction or accessible context.

Acceptance: AC1–AC4 for Sales and Designer rows.

### Client consumer

Owner in Mode A: frontend implementer B.

Exclusive files: `ClientQuotationLine.tsx`, scoped `clientQuotation.css`, and
necessary updates to `ClientQuotation.test.tsx`, `ClientQuotation.items.test.tsx`
and `ClientQuotation.pricingMode.test.tsx`.

- Supply tier, known read-only Type and permitted Pricing in the same slots.
  Retire Client flex overrides that force options into the old layout.
- Keep saved amount versus unsaved/pending state explicit, even where a small
  state label is needed beneath/above the amount block. Do not invent a preview
  total or make Client rates or classification editable.
- Preserve mode-specific choices, components, draft changes, missing-price
  feedback and permission restrictions. Avoid API/draft-model changes.
- Verify read-only previews and editable Client rows, including new items,
  excluded items and unavailable choices.

Acceptance: AC1–AC4 for Client and read-only rows.

## 3. Integrate and compare in the browser

Owner: primary agent after both writers finish. In Mode A, use an independent
read-only reviewer for the integrated row/consumer changes. Keep one parent
task in progress; provisional checks during editing are not final evidence.

- Inspect the combined diff against the baseline and specification. Confirm
  that only presentation changed, no callback/capability was lost, and keyboard
  order follows the screenshot's visual order.
- Render actual components with existing application/compact-builder styles,
  using synthetic data. Compare the reference sample at about 1760px row width
  with the supplied screenshot: identity placement, dividers, group spacing,
  typography, control dimensions and amount emphasis.
- Also inspect full editor containers at wide desktop, 1440px, tablet and 390px
  mobile, including sidebar space. Test long names, unavailable tiers/prices,
  dimensions, In-house components, read-only and excluded rows. Check overflow,
  keyboard focus, menu operation, touch targets and accessible names.
- Correct mismatched layout/spacing in owned files and recheck affected states.
  Preserve the live backend/OCR/frontend sessions; an isolated temporary frontend
  fixture may be used without customer data or application service restarts.

Acceptance: AC1–AC4, with inspected screenshots and interaction evidence.

## 4. Verify and hand off

Owner: primary agent; in Mode A, use `verification_runner` after all review fixes.

Run from `frontend/` on the stable integrated tree:

```sh
npm test -- src/features/estimates/EstimateLineRow.test.tsx src/features/estimates/EstimatePricingModeControl.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.items.test.tsx src/features/client/ClientQuotation.pricingMode.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx
npm run typecheck
npm run build
```

Run `git diff --check` and `git status --short` at the repository root. Add any
other suite whose product path changes; broaden only for failures or unresolved
regression concerns. No backend/OCR or full repository suite is planned, and no
lint script exists. Do not add tests that merely restate CSS values; use rendered
interaction checks and browser comparisons for this visual change.

Record exact commands/results, acceptance coverage, affected files, unrun checks
and remaining limitations here. Report refreshed ignored build outputs, remove
owned temporary screenshots/fixtures after inspection, and preserve unrelated
artifacts. No dependencies, migrations, customer-data writes, staging, commits,
pushes or deployment.

## Gate status

Specification and task plan approved in conversation. User selected Mode A.
Shared shell and both consumers implemented. Integrated review, final browser
comparison and final build verification passed.


## Implementation and verification evidence

Implemented the shared Tier/Type/Pricing slots and canonical reference styles in
`frontend/src/features/estimates/EstimateLineRow.tsx`,
`frontend/src/features/estimates/EstimatePricingModeControl.tsx`, and
`frontend/src/styles/estimator-dashboard.css`. Staff integration is in
`frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`; Client integration
is in `frontend/src/features/client/ClientQuotationLine.tsx` and its existing
`clientQuotation.css`. Updated shared, builder, selling-price, collaboration and
Client pricing-mode assertions for the new labels, keyboard order and notes.
No API, permission, draft-model or calculation changes were needed.

- **AC1:** Inspected actual builder screenshot at 1760 × 91px row size. Identity,
  Tier, Type, Pricing, Qty, Rate, amount and menu share one primary band. PMC is
  visible for editable Special items. Existing Poppins and ceiling asset reused.
- **AC2–AC3:** Independent review found callbacks, capabilities and saved/pending
  values preserved. All 837 unrelated stylesheet rules remained equivalent.
  Keyboard checks covered native radio groups, both PMC round trips, remembered
  In-house mode, quantity stepping, manual rate and menu focus restoration.
- **AC4:** Synthetic real-component browser checks used the application styles
  and actual staff/Client builder shells with sidebars at wide desktop, 1440,
  834, 768 and 390px. Inspected clean, long-name, Standard, read-only, excluded,
  unavailable-tier/rate, dimensions, In-house and new-Client-item states. Final
  narrow-screen checks confirmed full quantity text, multiline Client rate,
  green 24px inclusion checkbox and visible native radios. No page overflow or
  browser console/network errors. Validation color was restored during review;
  Client checkbox overrides and mobile numeric clipping were fixed during QA.
- **AC5:** The exact 11-suite command above initially passed 238/240 tests; two
  obsolete `Sub-Vendor` copy assertions were corrected to visible `Vendor`.
  Reran `npm test -- src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx`:
  49/49 passed, giving 240 passing focused tests across the 11 suites. Frontend
  `npm run typecheck` passed. `git diff --check` passed. Final `npm run build`
  after the mobile CSS correction passed (3,336 modules). Existing large-chunk
  warning remains: main JS 3,297.12 kB; CSS 1,561.73 kB.

Browser coverage used synthetic data, not an authenticated customer session.
Existing backend, OCR and frontend service sessions were untouched. The isolated
port-4192 fixture and its browser session were stopped after inspection.
No dependencies, migrations, external data writes, commits, pushes or deployment.
Backend/OCR/full frontend suites and lint were not run for this presentation-only
scope; the repository has no lint script.

Temporary QA paths were `/private/tmp/lisno-reference-row/` and
`output/playwright/lisno-reference-row/`; owned fixtures, snapshots, CLI logs
and baseline were removed after final reconciliation. Ignored build and tool caches refreshed:
`frontend/dist/`, `frontend/node_modules/.tmp/`, `frontend/node_modules/.vite/`.
