# Compact PMC toggle: task plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved specification](../specs/2026-11-08-compact-pmc-mode-toggle-design.md)
Specification approved in conversation on 2026-11-08.

## Contract and ownership

Keep `pricingMode` as the sole effective and persisted mode. The PMC switch
reads that value and sends the existing explicit mode-change update. Temporary
per-line memory only determines the destination when switching PMC off; it must
never write prices, tiers or modes during rendering or refresh.

Standard items retain Sub-Vendor; only the currently editable Special-item
control changes. No backend, API, pricing-helper, permission or dependency change
is planned. Keep backend/OCR services stopped throughout this task.

Implementation begins only after task-plan approval and execution-mode selection.
Keep one parent task in progress. In Mode A, the two bounded slices in step 2 may
run in parallel. In Mode B, the primary agent performs all work inline.

## 1. Capture the baseline and settle the component contract

Owner: primary agent.

- Capture initial dirty paths and target contents/diffs before writers start.
  Preserve earlier item-picker, reference-price removal and Submit changes.
- Inspect all builder row paths, including ordinary items, saved unavailable
  items and excluded review. Preserve their existing editability rules.
- Use the established `reviewContextKey` and stable line identity to scope prior
  non-PMC memory. The workspace already supplies actor, lead and saved version
  in this context. Clear memory when that context changes; preserve saved values.
- Store memory above individual rendered rows so room changes, filtering and
  collapsed rows cannot transfer one item's remembered mode to another.
- Settle accessible names for the writers: switch `PMC pricing mode for <item
  context>`; retain `Sub-Vendor pricing mode for <item context>` and
  `In-house pricing mode for <item context>` for the two radios. Do not add a
  separate boolean to save requests or change pricing-helper contracts.

Acceptance: specification requirements 1–6 have an implementation path using
the existing mode-change handler, with clear memory/reset and identity behavior.

## 2. Implement controls and integration coverage

### Slice A: shared builder, styling and component tests

Owner in Mode A: frontend implementer A; primary agent in Mode B.

Exclusive ownership:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`
- `frontend/src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx`
- Scoped rules in `frontend/src/styles/estimator-dashboard.css`

Tasks:

- Replace the PMC radio with an accessible compact switch derived from the
  effective mode. One activation sets PMC and hides the other mode choices.
- When switching off, restore that line's known non-PMC mode or Sub-Vendor.
  Route both transitions through the existing parent update callback so current
  pricing, tier validation, component calculation and manual-rate rules apply.
- Render only Sub-Vendor/In-house radios while PMC is off. Keep mode-less
  legacy rows unchanged until the user makes a choice.
- Preserve Standard/read-only behavior, switch focus, pending-edit locks and
  hidden configured-price annotations. Style a compact wrapping row using
  existing tokens; retain touch targets and visible focus without decorative UI.
- Update affected existing tests and add focused behavior checks for both mode
  round trips, fresh saved PMC fallback, line/room isolation, context reset,
  collapsed/remounted rows, keyboard interaction and missing-price validation.
- Verify mode changes use current rates, unrelated edits preserve manual rates,
  and In-house component choices/calculation still behave correctly.

Acceptance: specification requirements 1–8 and row-level acceptance criteria.

### Slice B: workspace persistence and submission regression tests

Owner in Mode A: frontend implementer B; primary agent in Mode B.

Exclusive ownership:

- `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`
- `frontend/src/features/leads/LeadEstimateWorkspace.tiers.test.tsx`, only if an
  additional persistence/tier case needs this existing fixture.

Tasks:

- Replace affected PMC radio interactions with switch interactions. When a test
  moves from PMC to a non-PMC mode, switch off before choosing the destination.
- Retain assertions on saved `pricingMode`, rate source, amount and source/version
  pins. Verify saved PMC renders on without automatically writing or repricing.
- Verify saving/reloading, manual overrides, catalogue refresh and submission
  locks remain intact. Use unequal rooms/items for state-isolation coverage.
- Do not edit product source or Slice A files. Coordinate any discovered contract
  issue with the primary agent instead of introducing a test-only fallback.

Acceptance: existing save/submit behavior and specification compatibility,
identity, reload and financial-state criteria.

Parallel boundary: both slices start only after step 1 defines switch names and
memory behavior. Writers must preserve other contributors' edits and work only
within their assigned files. The primary agent owns documents and reconciliation.

## 3. Integrate and review

Owner: primary agent; in Mode A, use `integrity_reviewer` after writers finish.

- Compare the combined changes against the captured baseline and approved spec.
- Check there is one mode source, no automatic write on mount/refresh, no stale
  price restoration, no line/context memory leakage and no Standard-mode bypass.
- Confirm compact layout, switch focus and accessible radio behavior. Inspect
  all row paths and verify the configured reference-price text stays removed.
- Resolve confirmed findings before the final verification run.

## 4. Verify and hand off

Owner: primary agent; in Mode A, use `verification_runner` after review fixes.

Run from `frontend/` on the integrated tree:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx
npm run typecheck
npm run build
```

Run `git diff --check` and `git status --short` at the repository root. Broaden
only when changed dependencies, test failures or unresolved risks justify it.
No backend/OCR or full frontend suite is planned; there is no lint script.

Rendered browser checks use the actual configured-row component and synthetic
data at desktop and mobile widths. Verify PMC on/off, hidden/restored choices,
keyboard operation and focus, non-PMC restoration, current selling amounts,
missing-price feedback and absence of overflow. Inspect representative on/off
screenshots. Use an isolated mock harness; do not restart backend/OCR or publish
a real estimate.

Report exact checks/results, changed files, limitations and ignored build outputs.
Remove owned temporary fixtures/screenshots after recording results. No staging,
commit, push, deployment, migration, seed or external delivery.

## Execution record

Plan approved and Mode A selected in conversation on 2026-11-08.

- Baseline captured for the six target files under
  `/private/tmp/lisno-pmc-toggle/baseline/`, with initial status and targeted diff.
- Step 1 complete: switch accessible names and mode-memory rules shared with
  both writers. Existing `reviewContextKey` supplies actor/lead/version scope.
- Step 2 complete: `pmc_toggle_builder` owned the shared builder, its two tests
  and scoped CSS; `pmc_toggle_workspace` owned workspace integration tests.
  All writers handed back ownership. Slice checks passed 43 builder tests,
  55 workspace tests and 7 tier tests.
- Step 3 complete: independent integrity review found no confirmed defects.
  The browser check identified excess reserved width, corrected with scoped
  content-sized pricing controls and aligned mobile legend/control heights.
- `actionable_browser` checked a separate synthetic configured-row harness.
  No agent started backend/OCR. A later process check found a backend independently
  launched from a VS Code terminal; that external service state was preserved.
  No live estimate publication is part of this task.
- Step 4 complete: final integrated tests, typecheck, build and browser checks passed.

## Final outcome and verification

Editable Special items now have one PMC switch. On selects PMC immediately and
hides the two non-PMC radios. Off restores the prior per-line choice when known,
otherwise Sub-Vendor. Temporary memory resets with the existing review context;
saved mode remains authoritative. Standard/read-only presentation, configured
pricing rules, manual overrides and component selection behavior are preserved.

Changed files for this task: `ConfiguredEstimateBuilder.tsx`, its component and
selling-price tests, `LeadEstimateWorkspace.test.tsx`,
`LeadEstimateWorkspace.tiers.test.tsx`, scoped `estimator-dashboard.css` rules,
and this task's specification/plan. No pricing-helper, backend, API, dependency
or persistence changes.

Final commands in step 4 all passed:

- Five focused frontend suites: **134/134 tests passed**, exit 0.
- Frontend typecheck: exit 0.
- Frontend build: exit 0, 3,336 modules transformed. Existing chunk-size warning
  remains; main JS is 3,292.20 kB.
- `git diff --check`: exit 0. Earlier and concurrent unrelated work preserved;
  no staging or commits.
- A combined hash of 1,313 frontend/shared source/configuration files remained
  unchanged through final verification.
- Independent integrity review: no confirmed defects.

Actual configured-row browser checks passed at **1440px and 390px**: Space/Enter
switch activation, radio arrow keys, retained focus, both mode round trips,
fresh saved-PMC fallback, current prices/amounts, manual-price preservation on
quantity edits, missing-rate validation and cross-line isolation. No horizontal
overflow, page errors or console errors. The final CSS was also measured at
1600px: PMC fits on the same row when space permits, with no 360px reserved gap.
Mobile switch targets are 44px high. Final on/off screenshots were inspected by
both agents.

Browser verification used synthetic data and an isolated mock fixture with the
installed Playwright/Chrome runtime. No live estimate was published. Owned
fixture/server/browser, screenshots and results were cleaned up; baseline copies
and targeted diffs were removed after recording verification. Ignored build
outputs refreshed: `frontend/dist/` and `frontend/node_modules/.tmp/`.

Unrun checks: full frontend, backend and OCR suites; migrations; lint (no script).
No deployment, commit, push, seed, real delivery or service-state change was
performed. No unresolved task-specific issues remain.
