# AI Estimator Empty Main Basket Deletion — Task Plan

## Objective

Implement the approved permanent-deletion workflow for custom, empty,
unreferenced Main Baskets while preserving archive behavior, authorization,
historical data, bootstrap ownership, and transactional referential integrity.

Source of truth:

- `docs/superpowers/specs/2026-08-31-ai-estimator-empty-main-basket-deletion-design.md`

## Current repository state

- The worktree already contains approved, uncommitted AI Estimator Mode/layout
  changes under `docs/superpowers/**` and
  `frontend/src/features/ai-estimator-knowledge/**`. Writers must preserve them.
- Relevant backend, route-operation, OpenAPI, and model files are currently
  clean and must remain isolated from unrelated work.
- Existing `DELETE /baskets/:basketId` is archive-only and must not change.
- No migration, seed, live data write, commit, push, or deployment is authorized.

## T1 — Lock the additive API, authorization, and failure contract

**Status:** completed

**Depends on:** Approved specification.

**Ownership:** Backend implementer owns the route schemas, route registration,
operation registry/fixtures, OpenAPI inventory, shared backend response shapes,
and their focused tests. The primary integrator owns cross-stack interpretation.

**Affected areas:**

- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- backend AI Estimator contracts/service interface
- `backend/tests/ai-estimator-knowledge-routes.test.ts`
- `backend/tests/route-operation-registry.test.ts`
- `backend/tests/api-docs.test.ts`
- route-operation fixtures

**Work:**

1. Add failing route/authorization/OpenAPI tests for:
   - `GET /baskets/:basketId/deletion-impact`;
   - `DELETE /baskets/:basketId/permanent`;
   - lifecycle permission and canonical non-project scope;
   - authorization before body validation/disclosure;
   - strict permanent-delete input and exact response schemas; and
   - unchanged archive-route behavior.
2. Define closed deletion-impact blocker codes and public response/delete-result
   types.
3. Register both additive operations, runtime validation, handlers, operation
   inventory, and OpenAPI request/response descriptions.
4. Keep the existing archive endpoint and service method untouched in semantics.

**Acceptance criteria covered:** 2, 8–10, 12.

**Verification:** Focused route, registry, fixture, and OpenAPI tests plus backend
typecheck.

## T2 — Implement eligibility, dependency guarding, and atomic deletion

**Status:** completed

**Depends on:** T1 contract settled.

**Ownership:** Backend implementer owns the Basket model, reference service,
Main Line/section dependency-write coordination, audit integration, and focused
service/model tests. No frontend or documentation edits.

**Affected areas:**

- `backend/src/models/AiEstimatorKnowledgeBasket.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- relevant AI Estimator domain/contracts helpers
- `backend/tests/ai-estimator-knowledge-models.test.ts`
- `backend/tests/ai-estimator-knowledge-reference.service.test.ts`
- `backend/tests/ai-estimator-knowledge-item.service.test.ts`

**Work:**

1. Add a backward-compatible internal Basket dependency epoch/guard with no
   public DTO exposure and no required backfill.
2. Make Main Line creation and section updates that introduce Basket references
   write the referenced Basket guard within their existing Mongo transaction.
3. Implement impact calculation across:
   - Main Lines in every status;
   - all stored section/revision relationship paths;
   - bootstrap ownership; and
   - current Basket identity/version.
4. Implement permanent deletion in one transaction: stored-actor authorization,
   exact version/name/reason checks, blocker re-evaluation, guarded document
   deletion, and sanitized audit append.
5. Preserve the Basket when validation, blocker, concurrency, audit, or
   transaction work fails.
6. Return stable 404/409 error codes without leaking hidden details.

**Acceptance criteria covered:** 2–10, 12.

**Verification:** Model/service tests cover eligible delete, every blocker,
historical/inactive references, bootstrap ownership, exact confirmation,
version conflict, audit rollback, and unchanged archive behavior.

## T3 — Prove transaction races on a Mongo replica set

**Status:** completed

**Depends on:** T2.

**Ownership:** Backend implementer owns only the AI Estimator replica-set
integration test additions. Product-source changes discovered here return to T2
ownership before tests are accepted.

**Affected areas:**

- `backend/tests/ai-estimator-knowledge-integration.replica-set.test.ts`

**Work:**

1. Create asymmetric custom and bootstrap-owned Baskets.
2. Race permanent deletion against Main Line creation in both commit orders.
3. Race permanent deletion against a section update introducing
   `targetBasketId` in both commit orders.
4. Assert exactly one conflicting operation wins, no orphan or dangling stable
   ID remains, and audit/delete effects are atomic.
5. Assert historical/archived dependencies block deletion without mutation.

**Acceptance criteria covered:** 3–8, 12.

**Verification:** Focused replica-set integration lane completes without weakening
transaction semantics for non-replica environments.

## T4 — Add frontend API types, query synchronization, and regressions

**Status:** completed

**Depends on:** T1 public contract. May run in parallel with T2/T3 after the
request/response/error contract is fixed.

**Ownership:** Frontend implementer owns frontend API/types/query-key and mutation
sync changes plus their focused unit tests. Existing Mode/layout edits in the
same feature directory must be preserved.

**Affected areas:**

- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQueryKeys.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeMutationSync.ts`
- corresponding focused tests

**Work:**

1. Add typed deletion-impact and permanent-delete client functions.
2. Keep the existing archive client function and response unchanged.
3. Define exact query keys for impact and Basket-dependent invalidation.
4. Ensure successful deletion removes/invalidates Basket lists, item filters,
   create-item choices, relationship selectors, and any open impact query.
5. Add tests for URL encoding, strict payload shape, response typing, and cache
   synchronization without fabricated item values.

**Acceptance criteria covered:** 2, 3, 8, 9, 12.

**Verification:** Focused API/query/mutation tests and frontend typecheck.

## T5 — Build accessible Main Basket management and confirmation UI

**Status:** completed

**Depends on:** T4, with T1 contract unchanged.

**Ownership:** Frontend implementer owns the Estimation Item index Basket
management surface/dialog, permanent-delete confirmation, feature-scoped styles,
and rendered tests. Do not modify shared Dialog/Field/Button primitives or other
roles.

**Affected areas:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`
- feature-scoped AI Estimator CSS
- new/focused Basket management and screen tests

**Work:**

1. Add **Manage main baskets** for lifecycle-permitted Super Admin and list every
   fetched Basket, including empty/archived records.
2. Preserve existing add, edit, and archive actions with distinct wording.
3. Add **Delete permanently**, lazy impact loading, blocker counts/messages,
   exact-name and reason controls, and disabled explanations.
4. Handle loading, empty, list/impact error and retry, mutation error,
   version-conflict refresh without auto-retry, pending, success announcement,
   close, and focus return.
5. Verify the action is absent for unauthorized frontend identities while
   backend tests remain authoritative.
6. Cover desktop/mobile actions, keyboard flow, accessible names, alerts, and
   no horizontal overflow at 1440/1024/768/390/320 widths.

**Acceptance criteria covered:** 1–3, 8–12.

**Verification:** Focused rendered interaction/accessibility tests, AI Estimator
feature suite, and frontend typecheck/build.

## T6 — Reconcile design documentation and integrated integrity

**Status:** completed

**Depends on:** T2–T5 complete and focused checks passing.

**Ownership:** Primary integrator owns documentation and final contract
reconciliation. An `integrity_reviewer` runs read-only after all writers finish.

**Affected areas:**

- `docs/superpowers/specs/2026-08-28-ai-estimator-knowledge-base-design.md`
- this specification and task plan status
- integrated backend/frontend diff

**Work:**

1. Amend the main design's physical-delete invariant narrowly: only custom,
   empty, unreferenced Baskets may be permanently deleted through the approved
   guarded workflow; all historical data remains archive-only.
2. Reconcile runtime validation, route registry, OpenAPI, service interface,
   frontend types, permission visibility, error codes, audit, and query
   invalidation.
3. Audit the integrated diff for delete/create-reference races, historical
   lineage loss, bootstrap resurrection, authorization ordering, partial writes,
   stale cache, misleading copy, and unrelated dirty-path changes.
4. Resolve confirmed findings before final verification.

**Acceptance criteria covered:** 1–12.

**Verification:** Read-only integrity report with exact file/line evidence and no
unresolved high/medium defect.

## T7 — Run final integrated verification

**Status:** feature checks completed; aggregate backend gate remains open because an unrelated replica-set teardown hook timed out

**Depends on:** T6 review findings resolved.

**Ownership:** A `verification_runner` performs read-only integrated checks after
all writers and the integrity review finish. The primary integrator owns final
handoff and worktree inspection.

**Backend focused commands:**

```sh
cd backend && npm test -- tests/ai-estimator-knowledge-routes.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-reference.service.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-item.service.test.ts
cd backend && npm test -- tests/route-operation-registry.test.ts tests/api-docs.test.ts
cd backend && npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
```

**Frontend focused commands:**

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
cd frontend && npm test -- src/features/ai-estimator-knowledge
```

**Full and hygiene commands:**

```sh
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
git diff --check
git status --short
```

Also run browser-driven Super Admin interaction/responsive QA when a connected
signed-in browser is available. Record exact results, replica-set availability,
ignored temporary artifacts, warnings, and every unrun check. Do not execute any
live or production Basket deletion.

### Verification outcome — 2026-08-31

- All required feature-focused backend checks passed, including 20/20
  AI Estimator replica-set tests and both commit orders for dependency races.
- All required feature-focused frontend checks passed: 131/131 AI Estimator
  tests, including 14/14 permanent-deletion interaction tests.
- Backend and frontend typechecks/builds passed. The full frontend suite passed
  1,277/1,277 tests.
- The final exact full backend run passed 2,086/2,086 test bodies, but the command
  exited 1 because `production-super-admin-bootstrap.test.ts` exceeded its
  10-second `afterAll` timeout while stopping its replica set. All 11 test bodies
  in that unrelated file passed, and the file had also passed 11/11 in a focused
  run. The aggregate backend gate is therefore not reported as green.
- `git diff --check` passed and nothing is staged. No lockfile, OCR, runtime
  artifact, migration, seed, live deletion, commit, push, deployment, or
  production mutation occurred.
- No connected signed-in browser was available, so live browser visual/overflow
  QA remains unrun; rendered accessibility/responsive tests cover the supported
  viewport matrix.

## Ownership and parallel-execution boundaries

- The primary integrator owns product interpretation, durable docs, shared
  contract reconciliation, and final integration.
- One backend writer owns T1–T3 because route, service, model, and transaction
  semantics are coupled. Do not split concurrent writers across those files.
- One frontend writer owns T4–T5 because API cache behavior and dialog state are
  coupled. It may run in parallel with backend T2/T3 only after T1's contract is
  fixed and shared in writing.
- Backend and frontend writers must not edit each other's paths or rewrite the
  existing uncommitted Mode/layout work.
- Integrity review and final verification are sequential after both writers.
- No live delete, migration, seed, deployment, commit, push, or external action
  is part of any task.

## Acceptance-criteria traceability

| Criterion | Tasks | Primary evidence |
| --- | --- | --- |
| AC1: manage all Baskets including empty | T4, T5 | Management list interaction tests |
| AC2: confirmed eligible delete | T1, T2, T4, T5 | Route/service/dialog tests |
| AC3: Basket-only delete + atomic audit/cache | T2, T4, T5 | Transaction and mutation-sync tests |
| AC4: any Main Line blocks without cascade | T2, T3 | Service and replica-set data assertions |
| AC5: historical reference blocks | T2, T3 | All-status section-reference fixtures |
| AC6: bootstrap Basket blocks | T2, T3 | Bootstrap identity tests |
| AC7: race cannot orphan | T2, T3 | Two-order replica-set race tests |
| AC8: failure leaves Basket intact | T1–T3, T5 | Error/rollback/conflict tests |
| AC9: archive unchanged | T1, T2, T4, T5 | Existing archive regressions |
| AC10: backend authorization | T1, T2 | Identity matrix and validation-order tests |
| AC11: accessible responsive states | T5 | Rendered interaction/axe/width tests |
| AC12: complete verification | T1–T7 | Focused/full command evidence and hygiene |

## Completion and handoff

Implementation is complete only when all acceptance criteria have traceable
evidence, replica-set races are verified, confirmed integrity findings are
resolved, full backend/frontend checks pass, and the handoff reports exact
affected files, commands/results, unrun checks, generated artifacts, external
actions not performed, and remaining risks.
