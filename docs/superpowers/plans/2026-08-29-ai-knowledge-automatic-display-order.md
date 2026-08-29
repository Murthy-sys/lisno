# AI Estimator Knowledge Automatic Display Order — Task Plan

**Date:** 2026-08-29  
**Specification:** [2026-08-29-ai-knowledge-automatic-display-order-design.md](../specs/2026-08-29-ai-knowledge-automatic-display-order-design.md)  
**Status:** Implemented and verified locally

## 1. Outcome and fixed contract

New Main Baskets, Basket-scoped Main Lines, Main Line duplicates, and reusable Knowledge Base values append automatically after the historical high-water order for their scope. Create and Quick Add dialogs do not expose Display order. Edit dialogs retain the current explicit reordering control.

Fixed invariants:

- The backend owns automatic allocation; the frontend never calculates order from a list.
- Stored and response `displayOrder` remain non-negative safe integers.
- Existing records and bootstrap manifests are not renumbered or migrated.
- Automatic allocation, resource/aggregate writes, and audit evidence commit in one Mongo transaction.
- Concurrent automatic creates in one scope receive distinct consecutive values.
- Archived records and gaps never cause order reuse.
- Existing Estimator, Finance, Procurement, project workflows, Tax Version sequencing, and nested section-row ordering remain untouched.
- No dependency, lockfile, bootstrap digest, deployment, migration, production write, commit, or push is authorized.

## 2. Baseline and dirty-worktree control

### T0 — Capture current behavior and ownership baseline

**Owner:** Primary agent  
**Dependencies:** None

Tasks:

1. Record `git status --short` and exact diffs for every target that is already dirty.
2. Preserve the approved rupee-pricing changes in `KnowledgeItemWorkspacePage.tsx`, `KnowledgeScreens.test.tsx`, `KnowledgeSectionEditor.tsx`, presentation/validation files, and the existing styling/image changes.
3. Confirm display-order product targets are clean before assignment:
   - `KnowledgeBaseIndexPage.tsx`;
   - `KnowledgeMasterEditorDialog.tsx`;
   - backend reference/item services, routes, OpenAPI, and affected tests.
4. Reproduce current defaults:
   - Basket and reusable-value create payloads explicitly send `displayOrder: 0`;
   - Main Line create omits the field, but the route/service persists `0`;
   - Main Line duplicate copies the source order.
5. Run the focused pre-change frontend, route, reference-service, item-service, model, OpenAPI, and bootstrap tests.

Acceptance:

- Every pre-existing change is identified and remains outside another writer's ownership.
- Current default-zero behavior is captured by tests or exact trace evidence.
- No implementation writer starts on an unreviewed dirty target.

Stop/report conditions:

- A target contains overlapping work whose intent cannot be established.
- The existing API or persistence behavior differs materially from the approved specification.

## 3. Backend foundation

### T1 — Add the transactional per-scope order allocator

**Owner:** `backend_implementer` — allocator foundation  
**Dependencies:** T0

Exclusive affected areas:

- New internal sequence model, proposed as `backend/src/models/AiEstimatorKnowledgeDisplayOrderSequence.ts`.
- New shared allocator module, proposed under `backend/src/services/` or `backend/src/domain/` according to the established direct-Mongoose boundary.
- One new focused allocator test file.

Tasks:

1. Define stable scope keys:
   - `baskets`;
   - `main-lines:<basketId>`;
   - `masters:<masterType>`.
2. Implement lazy baseline initialization from the maximum persisted order across every status, including archived records; empty scope begins at `0`.
3. Use one sequence document per scope as the common transactional write/CAS point.
4. Provide two session-required operations:
   - allocate the next automatic order;
   - observe an explicit compatibility order and raise, but never lower, the high-water mark.
5. Reject exhaustion before mutation with stable code `DISPLAY_ORDER_EXHAUSTED`.
6. Ensure retry-safe behavior inside the caller's existing Mongo transaction.
7. Do not add a unique resource `displayOrder` index or alter existing resource models/indexes.

Acceptance:

- Empty, legacy-tie, gap, inactive, archived, and explicit-high-water fixtures allocate correctly.
- Two same-scope concurrent allocations receive distinct consecutive values.
- Different scopes remain isolated.
- Failed transactions do not advance the persisted sequence.
- All results are non-negative safe integers.

Verification:

- Focused unit tests for scope encoding, lazy seed, increment, explicit observation, exhaustion, and rollback.
- Replica-set allocator concurrency test.
- Backend typecheck for the shared contract.

Stop/report conditions:

- Correct allocation would require weakening transaction semantics.
- Lazy initialization cannot be made compatible with existing data without a migration.

## 4. Parallel backend consumers

After T1 freezes the shared allocator contract, T2 and T3 may run in parallel because they own separate service files and tests.

### T2 — Apply automatic order to Baskets and reusable values

**Owner:** `backend_implementer` — reference-service slice  
**Dependencies:** T1

Exclusive affected areas:

- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`
- One reference-service replica-set test file if a dedicated file is safer than the shared integration suite

Tasks:

1. Allocate omitted Basket create order from the global Basket scope.
2. Allocate omitted reusable-value create order from its independent master-family scope.
3. Honor explicit create orders for compatibility and observe them in the high-water sequence.
4. Preserve omitted update order; retain explicit CAS-protected edit reordering and observe it without lowering the high-water mark.
5. Keep identity checks, status handling, tax-version creation, audit writes, and resource creation inside the current transaction.
6. Include the resolved order in create/update audit state.
7. Map exhaustion and allocator conflicts to stable non-disclosing API errors.

Acceptance:

- Basket maximum `10` produces automatic `11`.
- Each master family starts and advances independently.
- Archived maxima remain authoritative.
- Explicit compatibility order `50` causes the next automatic order to be `51`.
- A later explicit reorder to `2` does not lower a high-water value of `50`.
- Audit/resource/optional tax-version failure rolls back the sequence.

Verification:

- Expanded reference-service focused tests.
- Replica-set same-scope and cross-scope concurrency tests.
- Existing identity, UOM immutability, tax-version, CAS, archive, and audit regressions.

### T3 — Apply automatic order to Main Lines and duplication

**Owner:** `backend_implementer` — item-service slice  
**Dependencies:** T1

Exclusive affected areas:

- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`
- One item-service replica-set test file if needed

Tasks:

1. Allocate omitted Main Line order within `main-lines:<basketId>`.
2. Honor explicit compatibility create/update order and observe it in that Basket's sequence.
3. Preserve omitted update order and existing resource-version CAS.
4. Make duplicate append in the target Basket rather than copy the source order.
5. Include Basket ID and resolved display order in Main Line create/duplicate audit evidence.
6. Keep Main Line, initial revision, eight initial sections, audit, and sequence mutation atomic.

Acceptance:

- Two Baskets with unequal existing maxima allocate independently.
- Duplicate receives the next target-Basket order and retains independent stable IDs/revision lineage.
- Concurrent Main Line creates within one Basket receive consecutive orders.
- Concurrent creates across different Baskets do not share or advance a sequence.
- Child, audit, identity, or transaction failure leaves no resource, revision, section, audit, or sequence advance.

Verification:

- Expanded item-service focused tests.
- Replica-set aggregate/concurrency coverage.
- Existing duplicate, revision, completeness, stable-ID, lifecycle, and CAS regressions.

## 5. API and public contract integration

### T4 — Align runtime validation, OpenAPI, and compatibility tests

**Owner:** Primary agent or one backend contract owner  
**Dependencies:** T1 contract fixed; may run parallel with T2/T3 on non-overlapping files

Exclusive affected areas:

- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- Relevant OpenAPI/authorization inventory tests

Tasks:

1. Remove `default(0)` from Basket, Main Line, and master create schemas.
2. Bound all request order values to `Number.MAX_SAFE_INTEGER`.
3. Preserve optional explicit create/update values for deprecated compatibility.
4. Keep response resource `displayOrder` required.
5. Document automatic server assignment when omitted and deprecated explicit create input.
6. Confirm strict schemas continue rejecting unknown fields and malformed/unsafe values.
7. Keep route-operation authorization and endpoint inventory unchanged.

Acceptance:

- Omitted create order reaches each service as `undefined`, not `0`.
- Explicit safe compatibility values are forwarded unchanged.
- Negative, fractional, and unsafe values fail runtime validation predictably.
- OpenAPI has no default, describes automatic assignment, and matches runtime bounds.
- No route or permission expansion occurs.

Verification:

- Focused route tests.
- OpenAPI contract tests.
- Authorization registry/inventory tests.

## 6. Frontend behavior

### T5 — Remove create-time Display order and omit create payload fields

**Owner:** `frontend_implementer`  
**Dependencies:** Approved specification; may run parallel with T2–T4 after T0

Exclusive affected areas:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeMasterEditorDialog.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts` only if type comments/shape refinement is required
- A dedicated new dialog test where feasible
- `KnowledgeScreens.test.tsx` only after T0 grants explicit ownership of its existing rupee-pricing diff

Tasks:

1. Remove Display order state, validation, control, and payload property from Add Main Basket.
2. Retain Display order state/control only for Edit Main Basket.
3. Remove Display order state, validation, control, and payload property from reusable-value Add and Quick Add for all six master types.
4. Retain Display order only for Edit reusable-value operations.
5. Confirm Add estimation item/Main Line continues to omit the field.
6. Preserve all type-specific fields, tax-version behavior, query invalidation, Quick Add selection, focus restoration, and inline errors.
7. Do not calculate an order from frontend queries or response arrays.
8. Do not modify global or feature CSS unless a rendered regression proves a minimal change is necessary and the pre-existing dirty CSS is reconciled first.

Acceptance:

- Create and Quick Add dialogs expose no control named Display order.
- Create calls omit the property entirely.
- Edit dialogs expose the current Display order and include it only when editing.
- Hidden order state cannot disable submit or create dangling accessible descriptions.
- UOM decimal scale, tax version, Code, Name, Description, and Status behavior remain correct.

Verification:

- Rendered interaction tests for Main Basket create/edit, Main Line create, reusable create/edit, and workspace Quick Add UOM/vendor/tax.
- Payload assertions proving omission versus edit inclusion.
- Axe, keyboard/focus, error-preservation, and 1440/768/390-width checks.
- Frontend typecheck and feature-focused tests.

Stop/report conditions:

- Product files acquired overlapping unreviewed edits after T0.
- Removing the field would require a frontend-computed fallback.

## 7. Cross-service concurrency and compatibility

### T6 — Prove integrated transactional behavior

**Owner:** Primary integration owner  
**Dependencies:** T2, T3, T4 complete; all backend writers stopped

Affected areas:

- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`
- Shared model/index/startup tests only where the new internal sequence model requires registration evidence
- No production/bootstrap operation files unless a test proves a genuine registration requirement

Tasks:

1. Exercise Basket, Main Line, duplicate, and representative master creation through real HTTP/service transactions.
2. Prove same-scope concurrent creates receive distinct consecutive orders.
3. Prove cross-scope sequences remain independent.
4. Seed unequal legacy orders, archived maxima, and gaps.
5. Prove explicit legacy overrides advance the high-water mark.
6. Prove identity conflict, stale update, audit failure, aggregate failure, and exhaustion roll back the counter with all related writes.
7. Verify lazy initialization after existing bootstrap-shaped data without changing the bootstrap manifest/digest.

Acceptance:

- Every ordering and rollback acceptance criterion is demonstrated on a replica set.
- No unique resource-order index or data rewrite is introduced.
- Existing list secondary tie-break behavior remains deterministic for legacy ties.

## 8. Integration reconciliation

### T7 — Reconcile contracts, tests, and dirty files

**Owner:** Primary agent  
**Dependencies:** T2–T6 and T5 complete; all writers stopped

Tasks:

1. Inspect every writer diff and reconcile TypeScript/API shapes.
2. Confirm frontend create payloads align with runtime omission behavior.
3. Confirm update-only explicit order remains supported across frontend, route, service, audit, and OpenAPI.
4. Reconcile the already-dirty `KnowledgeScreens.test.tsx` without losing rupee-pricing coverage.
5. Confirm no user-owned CSS, global styles, login image, pricing files, or unrelated tests were overwritten.
6. Run focused backend and frontend lanes before independent review.

Acceptance:

- One coherent create/append and edit/reorder contract exists across all layers.
- No transient fallback or duplicated allocator implementation remains.
- Focused suites are green on the integrated worktree.

## 9. Independent review and final verification

### T8 — Integrity review

**Owner:** `integrity_reviewer`  
**Dependencies:** T7 complete; all writers stopped

Review areas:

- Transaction/sequence correctness and retry behavior.
- Same-scope and cross-scope race handling.
- Safe-integer bounds and exhaustion.
- Rollback of resource, child records, audit, and sequence.
- Explicit-client compatibility and update CAS.
- Basket/Main Line/master scope isolation.
- Duplicate stable-ID/revision lineage.
- Authorization and non-disclosure.
- Bootstrap/no-migration claim.
- Frontend omission, edit-only ordering, query invalidation, accessibility, and dirty-worktree preservation.
- Existing Estimator frozen-path isolation.

All confirmed findings return to the owning task and must be resolved before T9.

### T9 — Stable-worktree verification

**Owner:** `verification_runner`  
**Dependencies:** T8 findings resolved; worktree stable

Backend checks:

1. Focused allocator, reference-service, item-service, route, OpenAPI, model, bootstrap, and replica-set integration tests.
2. `cd backend && npm run typecheck`
3. `cd backend && npm test`
4. `cd backend && npm run build`

Frontend checks:

1. `cd frontend && npm test -- src/features/ai-estimator-knowledge`
2. Router/navigation and existing Estimator regression tests.
3. `cd frontend && npm run typecheck`
4. `cd frontend && npm test`
5. `cd frontend && npm run build`

Repository checks:

1. `git diff --check`
2. `git status --short`
3. Backend/frontend lockfile diff audit.
4. Existing Estimator frozen-path diff and forbidden cross-import audit.
5. Ignored build/runtime artifact audit.

Not required unless scope changes:

- OCR tests.
- Migration/backfill execution.
- Bootstrap execution against a live database.
- Deployment or production access.

Final handoff reports exact test counts, warnings, unrun real-browser scenarios, external actions not performed, and residual risks.

## 10. Safe parallel execution

After T1 establishes the allocator contract:

- T2 owns the reference service and its focused tests.
- T3 owns the item service and its focused tests.
- T4 owns routes/OpenAPI/contract tests.
- T5 owns frontend dialogs/API calls/tests.

These tasks may run in parallel because their product files do not overlap. Shared replica-set integration tests, shared dirty screen tests, and any shared exports remain primary-agent owned until writers stop.

Sequential tail:

1. T6 integrated replica-set coverage.
2. T7 reconciliation.
3. T8 integrity review.
4. T9 final verification.

No two agents may edit the same test, route, service, model, or dirty frontend target concurrently.

## 11. Acceptance-criteria traceability

| Specification acceptance | Tasks |
|---|---|
| No create/Quick Add order field or payload | T5, T7, T9 |
| Edit-only manual reordering remains | T2–T5, T7 |
| Empty scope starts at 0; historical max + 1 | T1–T3, T6 |
| Archived/inactive maxima and gaps | T1, T2, T6 |
| Basket-scoped Main Line isolation | T1, T3, T6 |
| Duplicate appends with stable lineage | T3, T6, T8 |
| Same-scope concurrency is distinct/consecutive | T1–T3, T6, T8 |
| Cross-scope independence | T1–T3, T6 |
| Explicit-client compatibility/high-water observation | T1–T4, T6 |
| Atomic rollback and exhaustion | T1–T3, T6, T8 |
| Backend ordered responses/frontend refetch | T2–T7 |
| Optional/no-default bounded OpenAPI contract | T4, T7 |
| No migration/bootstrap digest change | T1, T6, T8 |
| Accessibility/responsive/error behavior | T5, T7, T9 |
| Existing Estimator untouched | T0, T8, T9 |
