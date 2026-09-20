# In-house calculation corrections — task plan

## Approved source

Implement [the approved In-house calculation specification](../specs/2026-09-20-mode-calculation-corrections-design.md).

The implementation changes In-house Labour, In-house Material, their combined total, and the In-house simulator only. PMC and Sub-Vendor behavior is a protected regression boundary.

## Delivery contract

### Financial behavior

- In-house adjusted cost applies Impact at `quantity <= lowQuantityLimit`.
- In-house selected and floor prices use `roundHalfUp(costPaise × 10000 / (10000 - marginBps))`.
- In-house discount is a percentage of selected selling price.
- Its cap is `floor((selectedPrice - floorPrice) × 10000 / selectedPrice)`, or zero when selected price is zero or the Minimum basis is selected.
- Backend rejects over-cap discounts and any rounded floor breach.
- Combined In-house uses the smaller Labour/Material cap and sums independently rounded results.
- Existing numeric `minimumMarkupBps`/`startingMarkupBps` inputs remain transport-compatible but are treated and presented as In-house margins.

### Preview contract direction

The backend remains authoritative. Extend only the generic/In-house preview shape as needed to expose:

- rounded floor price;
- derived maximum selling-price discount;
- explicit selling-price discount basis; and
- a discount breakdown that no longer describes a rate-point reduction as effective markup.

Keep the existing request field `modeCalculationMarkupBasis` as a legacy transport name unless changing it is unavoidable. Translate it to Starting/Minimum **margin** in In-house UI and documentation. Do not change PMC/Sub-Vendor request or response shapes.

### Documentation deliverable

Create `docs/ai-estimator-mode-calculations.md` only after the integrated calculation checks pass. Its examples and field descriptions must be copied from verified code/tests, not from planned output alone.

## Ownership boundaries

If execution mode A is selected:

| Owner | Files/responsibility |
|---|---|
| Primary agent | Cross-stack preview contract, approved spec/plan, integration decisions, final calculation reference, reconciliation of shared types, final diff review |
| Backend implementer | `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`, directly affected contracts/OpenAPI/validation/context/service paths, and backend tests. Must not alter PMC/Sub-Vendor behavior or unrelated backend files |
| Frontend implementer | In-house editor/simulator/total components, In-house calculation helpers/types/styles, and directly affected frontend tests. Must not change PMC/Sub-Vendor product behavior or unrelated UI |
| Integrity reviewer | Read-only audit of the integrated financial diff, floor enforcement, rounding, API agreement, history/write safety, and PMC/Sub-Vendor isolation |
| Verification runner | Final integrated commands and evidence only; no product-source edits |

Backend and frontend writers may work in parallel only after the primary agent settles the exact In-house preview fields and shares them with both. Shared contract files receive one owner at a time.

## T0 — Capture baseline and settle the exact contract

**Owner:** primary agent  
**Depends on:** approved specification  
**Parallel:** no

1. Capture `git status --short` and scoped diffs for every target before editing. Preserve unrelated work.
2. Trace all callers of `calculateKnowledgeModePrice`, `calculateKnowledgeInHousePrice`, `KnowledgeModeCalculationPreview`, `modeCalculationMarkupBasis`, `maximumModeDiscountBps`, and the In-house result guard.
3. Record existing PMC/Sub-Vendor request/response fixtures as regression baselines.
4. Define the smallest generic/In-house-only response delta. Prefer additive fields for rounded floor and maximum discount; remove or deprecate misleading effective-markup output only where the In-house branch consumes it.
5. Confirm no mobile or other client consumes the generic preview fields without compatible handling.

**Exit criteria:** one written contract is shared with writers; target ownership is non-overlapping; existing dirty diffs are understood.

## T1 — Add failing backend financial tests

**Owner:** backend implementer  
**Depends on:** T0  
**Parallel:** may run with T3 after contract settlement

Add focused tests before changing domain arithmetic:

1. ₹30 cost, 35% Starting, 25% Minimum:
   - Starting price ₹46.15;
   - floor ₹40.00;
   - maximum discount 13.32%;
   - 13.32% accepted;
   - 13.33% rejected.
2. Minimum basis accepts only 0% discount.
3. Impact applies below and exactly at the limit, and does not apply above it.
4. Fractional quantity and half-up ties preserve operation order.
5. Zero cost, equal Starting/Minimum, near-100% margin, unsafe result, invalid rate, and negative/over-cap discount are rejected or calculated as specified.
6. Unequal Labour and Material inputs produce different component caps; combined cap is the smaller and protects both floors.
7. Combined totals reconcile both required identities.
8. Direct domain, context-service preview, authenticated route, OpenAPI, and configuration-context expectations agree.
9. Existing PMC and Sub-Vendor focused suites retain their current expected results and request/response shapes.

**Exit criteria:** new tests fail for the old additive/rate-point behavior and protect existing PMC/Sub-Vendor behavior.

## T2 — Implement backend In-house arithmetic and enforcement

**Owner:** backend implementer  
**Depends on:** T1  
**Parallel:** can overlap T4 only after the response shape is final

1. Reuse `calculateMarginSellingPrice` for generic/In-house selected and floor prices.
2. Make only the In-house/generic base-rate call inclusive at the low-quantity boundary. Do not modify the established PMC/Sub-Vendor inclusive branch.
3. Derive the selling-price discount cap with exact integer arithmetic and floor division; validate the user rate before returning a result.
4. Apply discount to the rounded selected selling price, not to margin percentage points.
5. Verify the rounded final price is at or above floor and return a deterministic calculation error otherwise.
6. Calculate Labour and Material independently and expose the smaller combined cap where the final contract places it.
7. Update the generic/In-house response contract, runtime schemas, OpenAPI descriptions, and configuration-context projection without changing PMC/Sub-Vendor contracts.
8. Keep preview read-only and preserve authorization, safe-integer checks, UOM precision, and error-envelope behavior.
9. Run backend focused tests and `npm run typecheck` before handoff.

**Exit criteria:** backend tests prove true margin, correct cap, floor enforcement, inclusive threshold, combined reconciliation, and PMC/Sub-Vendor isolation.

## T3 — Add failing frontend integration and presentation tests

**Owner:** frontend implementer  
**Depends on:** T0  
**Parallel:** may run with T1

1. Replace In-house-only label expectations with **Gross margin**, **Starting Gross Margin**, and **Min. Gross Margin**.
2. Cover automatic preview requests using the legacy request-field name but margin semantics.
3. Assert the ₹30 example and backend-returned 13.32% maximum.
4. Assert Minimum basis permits 0%, Starting basis accepts cap, and cap + 1 bp shows an actionable error without a stale result.
5. Assert unequal combined Labour/Material uses the smaller cap and displays a reconciling expense/margin subtotal.
6. Reject responses with wrong floor, maximum, discount basis, selected rate, total, or component reconciliation.
7. Preserve loading, error/retry, rapid edits, close/reopen, focus, read-only, missing UOM, and no-save/no-dirty behavior.
8. Add negative assertions proving PMC/Sub-Vendor labels, requests, and result behavior remain unchanged.

**Exit criteria:** tests fail against the old labels/formulas and encode the backend-owned result contract.

## T4 — Implement the In-house frontend correction

**Owner:** frontend implementer  
**Depends on:** T3 and final T2 response shape  
**Parallel:** no shared-contract edits while T2 is changing

1. Restrict terminology changes to In-house/generic calculation tables and simulators.
2. Stop presenting `Starting − Minimum` as Max Discount. Show the amount-aware backend maximum in the simulator after valid quantity/settings are available.
3. Describe discount as a selling-price discount that preserves both minimum margins.
4. Update automatic request/result reconciliation for the new In-house fields and remove effective-markup presentation from this branch.
5. Keep backend values authoritative; local calculations may validate interaction input but cannot replace returned money.
6. Preserve the current combined In-house layout and calculate displayed effective margin money only as a checked subtraction of returned final price minus returned adjusted cost.
7. Keep all PMC/Sub-Vendor rendering and request construction unchanged.
8. Run focused frontend tests and `npm run typecheck` before handoff.

**Exit criteria:** focused tests pass and the integrated UI accurately presents the corrected In-house calculation without affecting other modes.

## T5 — Integrate and run financial regression checks

**Owner:** primary agent  
**Depends on:** T2 and T4  
**Parallel:** no

1. Inspect the complete diff and reconcile backend/frontend field names, optionality, rounding, and error behavior.
2. Run focused backend tests for Mode/In-house calculations, configuration context, validation, routes, OpenAPI, PMC, and Sub-Vendor.
3. Run focused frontend tests for the calculation editor, In-house total, Mode lifecycle/state, automatic preview, PMC simulator, and Sub-Vendor simulator.
4. Resolve only confirmed in-scope failures. Do not update PMC/Sub-Vendor expected product behavior to accommodate accidental changes.
5. Run backend and frontend typechecks and production builds.

**Exit criteria:** all focused and contract checks pass on the integrated worktree; PMC/Sub-Vendor remain unchanged.

## T6 — Create and verify the saved formula reference

**Owner:** primary agent  
**Depends on:** T5  
**Parallel:** no

1. Create `docs/ai-estimator-mode-calculations.md` from the final implementation.
2. Include terminology, exact integer formulas, rounding order, inclusive threshold, individual/combined caps, validation, reconciliation, and verified examples.
3. Link to final backend functions and focused test files using repository-relative paths.
4. State explicitly that PMC and Sub-Vendor were not modified and that their future charge-discount change is outside this document's implemented correction.
5. Cross-check every amount and formula against passing test fixtures.

**Exit criteria:** the Markdown reference matches executable behavior and contains no planned-but-unimplemented claims.

## T7 — Independent integrity review

**Owner:** integrity reviewer in mode A; primary agent equivalent in mode B  
**Depends on:** T6  
**Parallel:** no

Review:

- margin versus markup semantics;
- operation and rounding order;
- cap derivation and floor enforcement;
- unequal combined inputs;
- zero/overflow/near-100% handling;
- frontend/backend/OpenAPI agreement;
- absence of preview writes;
- immutable history and persisted-value preservation;
- PMC/Sub-Vendor behavioral isolation; and
- calculation-reference accuracy.

Confirmed findings return to the owning implementation slice, followed by focused reruns.

## T8 — Final verification and rendered QA

**Owner:** verification runner in mode A; primary agent equivalent in mode B  
**Depends on:** T7 findings resolved  
**Parallel:** no

### Backend

```bash
cd backend
npm test -- tests/ai-estimator-knowledge-mode-calculation.test.ts \
  tests/ai-estimator-knowledge-configuration-context.test.ts \
  tests/ai-estimator-knowledge-validation.test.ts \
  tests/ai-estimator-knowledge-routes.test.ts \
  tests/ai-estimator-knowledge-pmc-calculation.test.ts \
  tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts \
  tests/api-docs.test.ts
npm run typecheck
npm run build
```

Run affected replica-set integration tests only if implementation changes stored validation/persistence rather than preview-only contracts.

### Frontend

```bash
cd frontend
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx
npm run typecheck
npm run build
```

Add any directly affected automatic-preview/helper tests discovered during T0.

### Rendered QA

At desktop and approximately 390 px width, verify:

- corrected In-house labels;
- ₹30/35%/25% result and 13.32% maximum;
- accepted cap and rejected cap + 1 bp;
- Minimum basis 0% limit;
- unequal Labour/Material combined result and reconciliation;
- loading, error/retry, read-only and close/reopen focus;
- keyboard access, accessible names, no horizontal overflow, and console/network errors; and
- a smoke comparison showing unchanged PMC/Sub-Vendor surfaces.

### Hygiene

```bash
git diff --check
git status --short
```

Report temporary QA artifacts and remove them when safe. Do not claim lint passed; no lint script exists.

## Acceptance traceability

| Specification criterion | Plan evidence |
|---|---|
| AC1 ₹30 true-margin result | T1, T2, T3, T4, T8 |
| AC2 13.32% cap | T1–T5, T8 |
| AC3 independent Labour/Material floors | T1–T5 |
| AC4 unequal combined reconciliation | T1–T5, T8 |
| AC5 Minimum basis 0% | T1–T4, T8 |
| AC6 inclusive threshold | T1, T2, T8 |
| AC7 no migration/write regression | T2, T7, T8 |
| AC8 PMC/Sub-Vendor unchanged | T0–T5, T7, T8 |
| AC9 contract/UI agreement | T2–T5, T7 |
| AC10 rendered UX | T8 |
| AC11 saved calculation reference | T6–T8 |
| AC12 complete verification | T5, T8 |

## External actions

No dependency installation, migration, seed, production write, deployment, commit, push, or external communication is included.
