# Configurable Priced Quantity Slabs — Task Plan

**Status:** Implemented — automated verification complete; live-browser viewport capture unavailable in this session  
**Date:** 2026-09-02  
**Approved specification:** [Configurable Priced Quantity Slabs Design](../specs/2026-09-02-configurable-priced-quantity-slabs-design.md)  
**Scope:** Configuration → Main Basket → Main Line → Mode → Quantity & margin → Quantity slabs

## Outcome and fixed contract

Implement the approved additive `slabRates` workflow:

- **Add Quantity slab** creates a priced row with Specification, Unit of
  measure, Quantity, Unit rate, and a read-only Estimated cost.
- Persist only `{ id, specificationId, uomId, quantity, unitRatePaise }` under
  `quantity-margin.payload.slabRates`.
- Derive `Estimated cost = Quantity × Unit rate` with UOM-aware integer/decimal
  math and half-up paise rounding; never persist or trust a submitted total.
- Keep legacy `quantitySlabs` range/adjustment rows and their context behavior
  unchanged.
- Keep priced slab rates out of runtime effective-price selection and combined
  final-price logic.
- Use stable IDs for references, existing Draft/update authorization, section
  and aggregate CAS, transaction, audit, and activation behavior.
- Perform no migration, backfill, seed, dependency addition, lockfile change,
  deployment, commit, or push.

The specification is the source of truth. Any discovery that would change the
field shape, formula, price-source boundary, compatibility policy, permission
boundary, or migration scope must stop implementation and return for a revised
specification approval.

## Baseline and worktree protection

Before product writers start, the primary agent will record `git status --short`
and the per-target diffs. The following known user-owned work must be preserved:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- untracked `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx`
- the existing untracked 2026-09-02 approved Specification/Overview/Gap design
  and plan documents.

One frontend owner must integrate all changes to overlapping dirty frontend
targets. No other writer may reformat, revert, stage, or replace those files.
The backend is initially clean and will have one backend owner. The primary
agent owns the cross-layer contract, durable documents, integration review, and
final reconciliation.

## Dependency-ordered task graph

### T0 — Freeze the implementation contract and baseline

**Owner:** Primary agent  
**Dependencies:** Approved specification  
**Covers:** All acceptance criteria indirectly

Steps:

1. Capture the exact dirty-path set and relevant diffs before delegation.
2. Publish the approved shared constants to both implementation owners:
   - top-level key `slabRates`;
   - exact row keys `id`, `specificationId`, `uomId`, `quantity`,
     `unitRatePaise`;
   - Quantity `> 0`, UOM decimal-scale bound, Unit rate `>= 0`;
   - unique row ID and unique `(specificationId, uomId, quantity)` tuple;
   - no accepted or stored `estimatedCostPaise`;
   - half-up paise formula; and
   - no context price override.
3. Assign one owner to all backend source changes and one owner to all frontend
   source changes, with explicit no-overlap boundaries.

**Stop/report:** Any mismatch between current code and an approved contract
decision that cannot be handled compatibly.

### T1 — Add the backend slab-rate domain and API contract

**Owner:** Backend implementer  
**Owned boundary:** `backend/` only  
**Dependencies:** T0  
**Covers:** AC 4–9, 11–13, 15

Likely source files:

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/domain/ai-estimator-knowledge-calculation.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`

Steps:

1. Add `KnowledgeSlabRate` and `slabRates` to the public and strict section
   contract without changing `KnowledgeQuantitySlab`.
2. Add exact row validation for required stable IDs, canonical positive
   Quantity, non-negative bounded `unitRatePaise`, duplicate row IDs, duplicate
   Specification/UOM/Quantity tuples, unknown keys, and maximum array/payload
   bounds.
3. Reject `estimatedCostPaise` and every client-authored derived-total field.
4. Reuse or extract the established checked `BigInt` quantity multiplication so
   server validation detects derived-cost overflow with half-up paise rounding.
5. Keep `gapBehavior` requirements scoped only to legacy `quantitySlabs`.
6. Document the additive `slabRates` array and unchanged legacy array in OpenAPI.

Focused tests:

- `backend/tests/ai-estimator-knowledge-validation.test.ts`
- `backend/tests/ai-estimator-knowledge-calculation.test.ts`
- `backend/tests/ai-estimator-knowledge-domain.test.ts`
- `backend/tests/api-docs.test.ts`

**Stop/report:** A proposed calculation requires floating-point money, stores a
derived total, changes the legacy adjustment formula, or needs a new endpoint or
database collection not authorized by the specification.

### T2 — Enforce transactional Specification/UOM integrity

**Owner:** Same backend implementer as T1  
**Owned boundary:** `backend/` only  
**Dependencies:** T1  
**Covers:** AC 2–4, 8–13, 15

Likely source files:

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/src/services/ai-estimator-knowledge-context.service.ts` only where
  needed to prove or preserve non-selection
- relevant route/service tests

Steps:

1. During section update and activation, resolve each `specificationId` against
   the same revision's Pricing section and each `uomId` against the reusable UOM
   collection.
2. Require active references for new writes while retaining an unavailable saved
   reference only under the approved compatibility/read behavior; never silently
   substitute another ID.
3. Validate Quantity against the selected UOM's `decimalScale`, then validate
   derived-cost safety inside the existing transaction before persistence/audit.
4. Extend revision-wide Specification reference state and removal protection to
   include `slabRates[].specificationId`.
5. Extend UOM reference detection/archive protection with
   `slabRates[].uomId`; block decimal-scale changes while referenced, while
   allowing identity-preserving label/code edits under existing rules.
6. Preserve section version, aggregate version, CAS rollback, audit sanitation,
   activation, duplication, and immutable history behavior.
7. Prove the context resolver still selects immutable effective price versions
   and legacy adjustment slabs only; a priced slab must not alter price/tax
   lineage or final component results.

Focused tests:

- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`
- `backend/tests/ai-estimator-knowledge-context.service.test.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`

**Stop/report:** Cross-revision Specification lookup, non-transactional
reference enforcement, a race that permits reference removal/archive, or any
change to effective-price selection.

### T3 — Build the frontend slab-rate model and user-friendly editor

**Owner:** Frontend implementer  
**Owned boundary:** `frontend/` only; this owner has sole write ownership of all
known dirty frontend targets  
**Dependencies:** T0; may run in parallel with T1–T2 against the frozen contract  
**Covers:** AC 1–7, 10–15

Likely source files:

- new `frontend/src/features/ai-estimator-knowledge/KnowledgeQuantitySlabBuilder.tsx`
- new focused slab-rate parsing/configuration helper if needed
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSectionValidation.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeConflictReview.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMasterPagination.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeOverviewSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`

Steps:

1. Introduce a dedicated priced-slab builder instead of expanding the generic
   row renderer with cross-section pricing behavior.
2. Make **Add Quantity slab** append a stable `slabRates` row and render, in
   order: **Specification**, **Unit of measure**, **Quantity**,
   **Unit rate (₹)**, and read-only **Estimated cost**.
3. Derive Specification options from the live Pricing draft, including valid
   unsaved additions and renames, while retaining stable IDs as join keys.
4. Load every UOM page and pass loading, cached-refresh, empty, error, retry, and
   unavailable-selected-value state to the editor. Parameterize any master-page
   helper/error text that currently assumes Modes.
5. Disable dependent selection/add behavior with exact empty guidance when no
   Specification or active UOM exists; reuse the established **Add Unit** path
   where authorized.
6. Parse rupee input to integer paise and calculate the immediate display with
   exact integer/decimal math matching the server. Clear stale cost on invalid
   input; treat a zero rate as valid; never add a derived field to the payload.
7. Preflight every dirty Mode block and live cross-section reference before the
   first PUT. Preserve Pricing-before-Quantity ordering for a newly added
   Specification and the existing valid partial-network-failure recovery.
8. Include live and persisted slab references in Specification removal
   protection with a slab-specific explanation. Require a referencing slab to
   be removed and saved before its Specification can be deleted.
9. Map server issues to exact `slabRates.<index>.<field>` controls and preserve
   values through validation, save failure, conflict, discard, and authoritative
   rebase.
10. Render existing `quantitySlabs` as clearly labeled legacy adjustment rules;
    do not hide or reinterpret rules that still affect context pricing.
11. Keep stable IDs out of the primary priced-card grid, retain established
    reorder/delete focus behavior, and add fieldset/legend or equivalent row
    naming plus a non-noisy accessible Estimated cost announcement.
12. Stack/wrap controls without horizontal page overflow and preserve the
    approved Overview/Gap/UOM/Surface edits already present in dirty files.
13. Update Overview's aggregate Quantity slab count to total priced and legacy
    rows without adding a detailed slab panel.

Focused tests:

- `KnowledgeSectionEditor.quantity-margin.test.tsx`
- new builder/helper tests
- `knowledgeSectionValidation.test.ts`
- `KnowledgeModeSpecificationsSave.test.tsx`
- `KnowledgeModeSectionStateRemoval.test.tsx`
- `KnowledgeSpecificationBuilder.test.tsx`
- `KnowledgeConflictReview.test.tsx`
- `knowledgeMasterPagination.test.ts`
- `KnowledgeScreens.test.tsx`
- `knowledgeOverviewSummary.test.ts`
- `KnowledgeOverviewPanel.test.tsx`
- `KnowledgeModeLayout.test.tsx`
- `KnowledgeItemWorkspaceLayout.test.tsx`

**Stop/report:** A UI requirement would copy names as identity, persist a total,
truncate the UOM catalog, silently clear a missing saved reference, overwrite the
approved dirty work, or require a runtime price-precedence decision.

### T4 — Integrate and reconcile the cross-layer result

**Owner:** Primary agent  
**Dependencies:** T1–T3 complete; writers idle  
**Covers:** All acceptance criteria

Steps:

1. Inspect every final diff and compare frontend payloads, backend validation,
   OpenAPI, formula, reference rules, and exact error paths.
2. Confirm only the backend owner changed `backend/`, only the frontend owner
   changed `frontend/`, and prior user-owned diffs remain semantically intact.
3. Reconcile any mismatch through the owning implementation agent; do not create
   incompatible local fallbacks.
4. Run focused cross-stack tests once on the stable integrated worktree.
5. Check that no migration, seed, dependency, lockfile, generated runtime output,
   staging, commit, deployment, or external mutation occurred.

**Stop/report:** Any implementation diverges from the approved contract or a
focused regression indicates a shared-contract defect.

### T5 — Independent integrity review

**Owner:** `integrity_reviewer`  
**Dependencies:** T4; no concurrent product writer  
**Write boundary:** Read-only review; no product-source edits  
**Covers:** AC 4–13 and cross-cutting risks

Review focus:

- paise/decimal/rounding parity and overflow;
- Specification and UOM stable-ID lineage;
- section and aggregate CAS, transactions, activation, duplication, and races;
- reference removal/archive/decimal-scale protections;
- immutable effective-price and legacy adjustment preservation;
- no client-authored derived total, sensitive audit/log output, or unauthorized
  mutation;
- same-draft and partial-failure behavior; and
- dirty-worktree preservation.

Confirmed findings return to the original owning writer for a bounded fix,
followed by focused retesting and another primary diff review.

### T6 — Final verification on the integrated worktree

**Owner:** `verification_runner`  
**Dependencies:** T5 findings resolved; all writers idle  
**Write boundary:** Verification artifacts only; no product-source edits  
**Covers:** All acceptance criteria

Run in this order:

1. Backend focused tests.
2. Backend replica-set tests for transaction/reference races.
3. Frontend focused tests.
4. Rendered keyboard/accessibility and viewport-state matrix.
5. Backend full typecheck, test suite, and build.
6. Frontend full typecheck, test suite, and build.
7. Repository diff/status hygiene.

Any failing required check leaves the work incomplete. There is no repository
lint script, so the handoff must not claim lint passed.

### T7 — Handoff

**Owner:** Primary agent  
**Dependencies:** T6 passes or any unrun/blocking check is explicitly reported

Report:

- implemented outcome and fixed price-source boundary;
- principal files/contracts changed;
- exact test/build/visual commands and results;
- any check not run and why;
- no migration, deployment, commit, push, seed, or external action performed;
- remaining compatibility/rollback risk; and
- the future decision required before slab rates can drive estimator context.

## Safe parallel execution

After T0, T1–T2 and T3 may proceed in parallel because their write ownership is
separated by workspace (`backend/` versus `frontend/`) and both implement the
frozen approved contract. T1 and T2 remain sequential under one backend owner.
Only one frontend owner performs all of T3 because it overlaps the existing
dirty frontend changes. T4 integration, T5 integrity review, and T6 final
verification are sequential and run only after product writers finish.

If execution mode B is selected, the primary agent performs the same tasks in
dependency order without concurrent writers; the acceptance and verification
requirements do not change.

## Verification matrix

| Acceptance criterion / invariant | Evidence and fixture | Expected result |
| --- | --- | --- |
| AC1–2: add row and live Specification IDs | Pricing draft adds `spec-plywood`, renames it, then adds a slab before save | Dropdown updates immediately; payload retains the same stable ID; Pricing saves before Quantity |
| AC3: complete active UOM list and scale | Paginated `uom-sq-ft` scale 2 appears after page 1; cached refresh and initial error fixtures | Every active page is selectable; loading/error/retry states are explicit; Quantity precision follows scale 2 |
| AC4: canonical persistence | Quantity `12.5`, Unit rate `₹80.00` | Saves `"12.5"` and `8000`; no floating-point or rupee value crosses the backend boundary |
| AC5–7: derived cost | `12.5 × ₹80.00`, `0.5 × ₹0.01`, and zero-rate rows | Shows ₹1,000.00, rounds half a paise up to ₹0.01, and shows ₹0.00; no total is stored/submitted |
| AC8: strict validation | Missing IDs, unknown keys, duplicate `(spec-plywood, uom-sq-ft, 12.5)`, scale overflow, unsafe money/result | Exact field errors; no section/version/audit write |
| AC9: reference races | Concurrent Specification removal, UOM archive, and UOM scale-change attempts against saved slab | Transaction rejects each conflict and leaves both resources unchanged |
| AC10: Mode lifecycle | Add/save/edit/save, reorder, delete, discard, invalid preflight, network failure, CAS conflict | Unrelated data and local buffers survive; authoritative section/aggregate versions rebase correctly |
| AC11: legacy preservation | Legacy `0–200` row with `500` bps and base rate ₹75.00 | Existing resolver still returns adjusted unit rate ₹78.75; row remains visible/editable and unconverted |
| AC12: price-source boundary | Two unequal slab rates plus one effective immutable price/tax version | Context keeps the same priceVersionId, rate, tax, margin components, and formula version |
| AC13: authorization/read-only | Sole authorized Super Admin Draft, unauthorized actor, Active/superseded/archived revisions | Only authorized Draft mutation succeeds; all other views expose no enabled mutation |
| AC14: accessibility/responsive | Keyboard-only flow and 1440, 1024, 768, 390, and 320 px viewports with long labels/errors | Labels/errors/actions are discoverable; focus is stable; no horizontal page overflow or noisy per-keystroke announcements |
| AC15: regression/hygiene | Focused and full suites plus final diff/status inspection | Required checks pass; no unrelated, migration, dependency, lockfile, generated, staged, or external changes |

## Exact verification commands

Focused backend:

```bash
cd backend && npm test -- \
  tests/ai-estimator-knowledge-calculation.test.ts \
  tests/ai-estimator-knowledge-domain.test.ts \
  tests/ai-estimator-knowledge-validation.test.ts \
  tests/ai-estimator-knowledge-item.service.test.ts \
  tests/ai-estimator-knowledge-reference.service.test.ts \
  tests/ai-estimator-knowledge-context.service.test.ts \
  tests/ai-estimator-knowledge-routes.test.ts \
  tests/api-docs.test.ts
```

Replica-set backend:

```bash
cd backend && npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
```

Focused frontend:

```bash
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeSectionEditor.quantity-margin.test.tsx \
  src/features/ai-estimator-knowledge/knowledgeSectionValidation.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSpecificationBuilder.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx \
  src/features/ai-estimator-knowledge/knowledgeMasterPagination.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/knowledgeOverviewSummary.test.ts \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx
```

Full affected workspaces:

```bash
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
```

Repository hygiene:

```bash
git diff --check
git status --short
```

Rendered verification supplements the commands with interaction/accessibility
checks for empty, loading, cached refresh, load failure/retry, valid, invalid,
saving, server error, conflict, read-only, unavailable saved reference, long
content, reorder, and delete states at the specified viewport widths.

## Completion rule

The work is complete only when all acceptance criteria are traced to passing
evidence on the final integrated worktree, integrity-review findings are
resolved, and every required unrun check or residual risk is disclosed. Product
code implementation may begin only after this task plan is approved and the
user chooses the required execution mode.
