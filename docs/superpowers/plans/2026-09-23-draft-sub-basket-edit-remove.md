# Draft Sub-Basket edit and sub-item removal implementation plan

## Source of truth

- Approved specification: `docs/superpowers/specs/2026-09-23-draft-sub-basket-edit-remove-design.md`
- Prior hierarchy contract: `docs/superpowers/specs/2026-09-19-recommendation-temporary-catalog-additions-design.md`
- A recommendation sub-item remains a real Main Line beneath a stable Sub-Basket ID. This work adds correction controls; it does not add another hierarchy level or rewrite recommendation payloads.
- Catalog rename/removal writes remain immediate and separate from saving the open Recommendations & Exclusions section.
- The current shared worktree contains unrelated repository/user-administration paths. Before any writer starts, capture `git status --short` and inspect relevant target diffs. Do not edit, revert, stage, or reformat unrelated changes, including the current `backend/src/repositories/*`, `frontend/src/api/types.ts`, and user-administration spec/plan paths unless later evidence proves a direct dependency and the primary agent explicitly coordinates ownership.

## Settled contract

Implementation must preserve these approved decisions:

1. The Sub-Basket name and each direct child name are separate editable values.
2. The group is draft-editable only when every direct child is still Draft; any active, inactive, or archived child freezes all inline rename/remove actions.
3. Removing a child permanently deletes the real draft Main Line through the existing deletion cascade. It is not a UI-only unlink.
4. Stable Basket, Sub-Basket, and Main-Line IDs remain unchanged by rename.
5. Whole Sub-Basket rules remain targeted to `targetSubBasketId`; no recommendation schema change is needed.
6. A new versioned Sub-Basket PATCH operation handles group rename.
7. Inline child rename/delete use the existing Main-Line operations with an optional `draftSubBasketGuard` containing `subBasketId` and expected Sub-Basket version. The guard is enforced transactionally; existing main-workspace callers remain compatible when the guard is absent.
8. Sub-Basket `version` becomes the aggregate concurrency token for the group name and direct-child composition/lifecycle. Direct-child create, rename, delete, activation, and deactivation coordinate against or advance it.
9. No schema migration, seed, deployment, production mutation, commit, or push is part of implementation.

## Delivery order

Task 1 fixes the cross-layer mutation shape and aggregate-version rules. After that, Tasks 2 and 3 may run in parallel because they own non-overlapping backend and frontend paths. Task 4 integrates the lanes and resolves contract differences. Integrity review and final verification run sequentially on the integrated worktree.

## Task 1 — Freeze mutation shapes and concurrency invariants

**Owner:** primary agent.

**Affected areas**

- approved spec and this plan as reference only
- existing backend service interfaces and frontend request types, inspected but not yet broadly edited
- initial dirty-path inventory and scoped diffs

**Work**

1. Capture the current dirty-path set and inspect every file that the backend/frontend writers will own before assigning it.
2. Fix the request shapes used by both lanes:
   - Sub-Basket rename: `{ expectedVersion, name }`;
   - guarded Main-Line rename: existing update fields plus optional `{ draftSubBasketGuard: { subBasketId, expectedVersion } }`;
   - guarded Main-Line removal: existing delete fields plus the same optional guard.
3. Confirm the server error vocabulary for version conflict, frozen group, parent mismatch, duplicate name, missing resource, and permission denial.
4. Define aggregate-version ordering:
   - a child mutation and Sub-Basket rename touch the Sub-Basket version in the same transaction;
   - lifecycle activation/deactivation cannot commit across a guarded mutation without one operation observing a conflict/frozen state;
   - a stale guard never permits a partial child write.
5. Share the frozen contract with both implementation lanes before code changes begin. Material changes to user-visible behavior return to the specification gate.

**Acceptance coverage:** AC7, AC8, AC9, AC12.

## Task 2 — Implement backend Sub-Basket rename and guarded child mutations

**Owner:** `backend_implementer` in Mode A; primary agent in Mode B.

**Depends on:** Task 1.

**Exclusive ownership**

- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/services/ai-estimator-knowledge-reference.service.ts`
- `backend/src/services/ai-estimator-knowledge-item.service.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- directly related backend tests and route-operation fixtures
- `backend/src/models/AiEstimatorKnowledgeSubBasket.ts` only if an implementation-neutral default/index correction is proven necessary; no new lifecycle field is planned

The backend writer must not touch frontend or unrelated repository/user-administration files.

### Task 2.1 — Add the versioned Sub-Basket update operation

1. Add `updateSubBasket` to the reference-service interface and implementation.
2. Add `PATCH /admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId` with strict body validation for `expectedVersion` and normalized short `name`.
3. Register the operation with `ai_estimator_knowledge.configuration.update`, the established non-project scope, Super Admin behavior, and API availability.
4. In one Mongo transaction:
   - authorize the stored actor;
   - verify Main Basket/Sub-Basket parent lineage;
   - compare the expected Sub-Basket version;
   - check every direct child and reject when any status is not Draft;
   - enforce normalized-name uniqueness inside the Main Basket;
   - update name/nameNormalized, actor/time metadata, and version with CAS; and
   - append `ai_estimator_knowledge_sub_basket_updated` with stable IDs, old/new names, and old/new versions.
5. Return the authoritative updated `KnowledgeSubBasket` DTO.
6. Document request/response/error behavior in OpenAPI and keep runtime Zod validation authoritative.

### Task 2.2 — Add the optional draft-Sub-Basket guard

1. Extend Main-Line update/delete inputs with the optional guard without changing existing callers.
2. When supplied, validate in the same transaction that:
   - the Main Line belongs to the guarded Sub-Basket;
   - that Sub-Basket belongs to the Main Line's Main Basket;
   - both Main-Line and Sub-Basket expected versions match;
   - the target child is Draft; and
   - every direct child remains Draft.
3. Reject mismatches/frozen state before changing the Main Line or cascading deletion.
4. Preserve existing update/delete authorization, audit history, reference stripping, revision cleanup, and error behavior.
5. Keep main-workspace rename/delete semantics unchanged when the guard is absent.

### Task 2.3 — Coordinate aggregate Sub-Basket versions

1. Audit every direct-child mutation path before editing it: create, duplicate where it creates direct membership, name update, permanent delete, activation, and deactivation.
2. Advance or coordinate against the direct parent's Sub-Basket version in the same transaction. Do not advance unrelated Sub-Baskets or items without a Sub-Basket.
3. Return current versions through existing list/detail DTOs so the frontend can recover after any mutation.
4. Preserve parent Main-Basket dependency coordination and transaction behavior; do not weaken replica-set requirements.
5. Ensure activation-versus-rename/removal races have one valid serialized result rather than a stale successful inline mutation.

### Task 2.4 — Backend tests

Add or extend focused coverage for:

- successful rename and exact stable-ID preservation;
- whitespace/Unicode normalization and same-parent duplicate rejection;
- wrong parent, missing Sub-Basket, stale Sub-Basket version, frozen group, and permission denial;
- guarded catalog and temporary child rename;
- guarded draft child removal with audit/reference cleanup;
- rejection for active/inactive/archived target or frozen sibling;
- compatibility of existing unguarded main-workspace update/delete;
- aggregate version advancement on relevant child operations;
- replica-set races: rename versus activation and remove versus activation;
- route-operation, authorization-policy, OpenAPI, API-doc, and route tests.

**Acceptance coverage:** AC1–AC12, especially AC2, AC4, AC5, AC7–AC9.

**Focused verification**

- `cd backend && npm test -- tests/ai-estimator-knowledge-sub-baskets.test.ts`
- relevant cases in `tests/ai-estimator-knowledge-item.service.test.ts`
- relevant replica-set integration file(s)
- `tests/ai-estimator-knowledge-routes.test.ts`
- route-operation/authorization/OpenAPI/API-doc suites affected by the new operation
- `cd backend && npm run typecheck`

## Task 3 — Implement inline rename/remove UX and cache reconciliation

**Owner:** `frontend_implementer` in Mode A; primary agent in Mode B.

**Depends on:** Task 1. May run in parallel with Task 2 against the settled contract.

**Exclusive ownership**

- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQueryKeys.ts` and `knowledgeMutationSync.ts` when required
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.tsx`
- shared/new focused editor and confirmation components in the same feature directory
- `frontend/src/features/ai-estimator-knowledge/knowledge-recommendations.css`
- directly related frontend tests

The frontend writer must not touch backend or unrelated repository/user-administration files.

### Task 3.1 — Add API/types and permission plumbing

1. Add the Sub-Basket PATCH client and guarded Main-Line update/delete input types exactly as fixed in Task 1.
2. Propagate separate capabilities through the workspace and section editor:
   - create for **Add sub-item**;
   - update for Sub-Basket/child rename;
   - lifecycle for child removal.
3. Keep the recommendation section's existing read-only/editable rule authoritative; do not show mutation controls in history/read-only revisions.
4. Derive the visible frozen state only after the full relationship child catalog is ready. If catalog data is loading, incomplete, or failed, suppress mutation controls and show retry/loading state.

### Task 3.2 — Add Sub-Basket rename

1. Add **Edit name** beside the selected Sub-Basket child-section heading.
2. Build an accessible contextual editor prefilled with the current name and current Sub-Basket version.
3. Keep the stable selected IDs and every unsaved recommendation value unchanged through open, cancel, success, and failure.
4. Map duplicate, frozen, missing, permission, and version-conflict errors to specific messages. Keep the editor open on failure.
5. On success, update the exact Sub-Basket cache entry and invalidate all affected catalog/context/summary queries.

### Task 3.3 — Add child Edit and Remove actions

1. Add compact, uniquely named Edit/Remove actions to each child row when permitted and draft-editable.
2. Reuse/extract the existing Main-Line rename editor where practical, while passing the draft-Sub-Basket guard only for this inline flow.
3. Add an accessible destructive confirmation for removal; do not use `window.confirm`.
4. State that removal is an immediate permanent Configuration change and separate from **Save Recommendation & Exclusions**.
5. For the last child, show the approved empty-target warning before removal and the empty state afterward. Do not remove or retarget the rule automatically.
6. Preserve focus on cancel and move focus predictably after success/removal.
7. Keep temporary/catalog type, Draft/Frozen state, and **Must be completed** visually distinct.

### Task 3.4 — Reconcile local and server state

1. Update/remove entries from the builder's local newly-created-item bridge as needed so a renamed/deleted row cannot linger during refetch.
2. Preserve `targetBasketId`, `targetSubBasketId`, trigger, scope action, reason, enabled state, and other unsaved fields.
3. Refresh affected item details, item lists, Main-Line lists, Sub-Basket lists, contexts, relationship catalogs, incoming references, and deletion impact.
4. If the server write succeeds but a refresh fails, announce that the catalog was saved and expose **Retry catalog refresh** without resubmitting the mutation.
5. Ensure busy state prevents duplicate submissions and competing row actions.

### Task 3.5 — Frontend tests and responsive styling

Add focused tests for:

- reported rename from **Functional Lights and Supply** to **False Ceiling Lights**;
- child rename for catalog and temporary Draft items;
- child removal, destructive confirmation, and last-child empty state;
- stable rule IDs and retained unsaved fields across all mutations;
- frozen group from active/inactive/archived child;
- separate update/lifecycle permission visibility;
- incomplete catalog suppression;
- duplicate/frozen/not-found/version/auth failures;
- successful mutation with failed refresh and retry;
- cancel, focus return, post-delete focus, keyboard flow, and accessible names;
- narrow/mobile child-row layout without horizontal scrolling;
- unchanged existing Add sub-item and read-only behavior.

**Acceptance coverage:** AC1–AC14.

**Focused verification**

- `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeBudgetAlterationBuilder.test.tsx`
- focused workspace/screen tests affected by capability plumbing and shared editor extraction
- `cd frontend && npm run typecheck`

## Task 4 — Integrate and reconcile cross-layer behavior

**Owner:** primary agent.

**Depends on:** Tasks 2 and 3.

**Work**

1. Re-read the integrated diff, resolve contract/type differences, and ensure no lane overwrote unrelated work.
2. Confirm the runtime schemas, service interfaces, OpenAPI, frontend request bodies, and error handling match exactly.
3. Confirm Sub-Basket version semantics are consistent after create, rename, update, delete, activate, and deactivate.
4. Confirm the frontend never uses names as joins and never manufactures target IDs.
5. Confirm child deletion retains the existing transaction, audit, reference cleanup, and compensating behavior.
6. Confirm the open recommendation rule is not auto-saved, auto-removed, or auto-retargeted.
7. Confirm empty Sub-Basket validation still blocks a recommendation save.
8. Run focused backend and frontend tests together, fix integration defects, and inspect the final scoped diff.

**Acceptance coverage:** all acceptance criteria.

## Task 5 — Integrity review

**Owner:** `integrity_reviewer` in Mode A; primary agent performs the equivalent sequential review in Mode B.

**Depends on:** Task 4.

**Review checklist**

- authorization and route-operation parity;
- stable-ID lineage and parent validation;
- aggregate CAS and lifecycle race correctness;
- active/inactive/archived freeze behavior;
- update/delete audit completeness and reference cleanup;
- immediate catalog save versus unsaved section separation;
- last-child handling and empty-target validation;
- query invalidation/local-bridge correctness;
- refresh failure without duplicate mutation;
- accessibility, focus, permission visibility, and mobile layout;
- compatibility of unguarded main-workspace operations;
- absence of migration, Estimate mutation, seed, deployment, commit, push, or unrelated-file edits.

Confirmed findings are fixed before final verification.

## Task 6 — Final verification

**Owner:** `verification_runner` in Mode A; primary agent performs the equivalent sequential verification in Mode B.

**Depends on:** Task 5 and all confirmed fixes.

### Backend checks

1. Run the focused service, route, authorization, OpenAPI, API-doc, and replica-set suites changed in Task 2.
2. Run:
   - `cd backend && npm run typecheck`
   - `cd backend && npm test`
   - `cd backend && npm run build`

### Frontend checks

1. Run focused builder, workspace, mutation-sync, and screen tests changed in Task 3.
2. Run:
   - `cd frontend && npm run typecheck`
   - `cd frontend && npm test`
   - `cd frontend && npm run build`
3. Run rendered interaction/accessibility QA at desktop and mobile widths for:
   - Sub-Basket rename using the reported names;
   - catalog and temporary child rename;
   - child removal and last-child warning/empty state;
   - active/frozen presentation;
   - update-only, lifecycle-only, and read-only permission states;
   - stale-version, duplicate-name, mutation failure, and refresh-failure recovery;
   - focus order, action accessible names, status announcements, and no horizontal overflow.

### Repository checks

- `git diff --check`
- `git status --short`
- inspect the final scoped diff and distinguish unrelated pre-existing paths from task changes
- do not claim lint passed; this repository has no lint script

## Parallel execution map

After Task 1:

- **Backend lane:** all files and tests listed under Task 2, owned by one backend writer.
- **Frontend lane:** all files and tests listed under Task 3, owned by one frontend writer.
- These lanes can run concurrently because they share a fixed request/error contract and have no file overlap.
- The primary agent owns cross-layer contract decisions, shared-worktree monitoring, integration, and Task 4.
- Task 5 begins only after both writers finish and the primary agent reconciles the integrated result.
- Task 6 runs only after review findings are resolved. Writer tests are provisional; only final integrated verification counts as completion evidence.

## Completion evidence

The final handoff must report:

- delivered behavior against all fourteen acceptance criteria;
- final mutation and aggregate-version decisions;
- exact affected files;
- exact focused/full commands and results;
- rendered desktop/mobile QA evidence and any limitations;
- any unrun checks or remaining risks;
- confirmation that unrelated work was preserved; and
- confirmation that no migration, Estimate mutation, seed, deployment, commit, push, or production action occurred.
