# Quality parameter reusable values implementation plan

## Source of truth

- Approved specification: `docs/superpowers/specs/2026-09-20-quality-parameter-control-fields-design.md`
- The existing uncommitted implementation already provides fixed Severity, Frequency, Performed by, Number pass range, summaries, workbook support, and strict new-save validation.
- This plan adds reusable Super Admin-created values to Frequency and Performed by while preserving that completed baseline.
- The catalog is append-only in this phase. No migration, seed, rename, archive, delete, reorder, assignment, scheduler, inspection, task, snag, notification, or sign-off behavior is included.
- Before any writer starts, capture `git status --short` and inspect the relevant per-target diffs. Existing uncommitted Quality Parameter work is owned input, not code to revert or rewrite wholesale.

## Contract fixed by the approved specification

- Catalog kinds: `frequency` and `performer`.
- Catalog identity: stable opaque option ID; labels are presentation only.
- Built-ins remain code-defined and retain their current storage.
- Custom performer: `responsibleRole = <performer option ID>`.
- Custom frequency: `sampling = { method: "all", unit: <frequency option ID> }`.
- Create operation: `ai_estimator_knowledge.quality_control_options.create`, granted only to Super Admin.
- Read endpoint: `GET /admin/ai-estimator-knowledge/quality-control-options?kind=frequency|performer`.
- Create endpoint: `POST /admin/ai-estimator-knowledge/quality-control-options` with `{ kind, name }`.
- A successful catalog create is immediate and audited; selecting it only edits the checklist draft until the existing checklist Save action runs.

## Delivery order

1. Freeze shared request/response shapes, ID encoding, normalization, and error contracts.
2. Build the backend catalog, authorization, API, audit, and checklist-reference validation.
3. In parallel after the contract is frozen, build the frontend API/query layer and Super Admin quick-add flow.
4. Extend every presentation and workbook path to resolve custom labels.
5. Integrate, review authorization/data lineage/races, and run final verification on the combined worktree.

## Task 1 — Establish shared catalog contracts and invariants

**Owner:** primary agent before parallel writers.

**Affected areas**

- `backend/src/contracts/ai-estimator-knowledge.ts`
- corresponding frontend types in `frontend/src/features/ai-estimator-knowledge/knowledgeTypes.ts` or `knowledgeApi.ts`

**Work**

1. Define `QualityControlOptionKind`, option response, list response, and create input shapes.
2. Define a recognizable stable custom-option reference format that cannot collide with built-in codes such as `site`, `unit`, or `project`.
3. Define normalization: trim, collapse internal whitespace, case-insensitive uniqueness, 1–80 displayed characters.
4. Define duplicate, malformed, unauthorized, missing-reference, and wrong-kind error behavior using established API error conventions.
5. Keep existing built-in mappings unchanged and avoid adding duplicate `frequency` or `performedBy` checklist fields.

**Acceptance coverage:** AC1, AC5, AC6, AC10.

**Verification**

- Contract typechecks establish the same kind names, payloads, and ID encoding on both sides.
- Existing built-in mapping tests remain unchanged and green.

## Task 2 — Add append-only catalog persistence and service behavior

**Owner:** backend implementer in Mode A; primary agent in Mode B.

**Depends on:** Task 1.

**Owned paths**

- new `backend/src/models/AiEstimatorKnowledgeQualityControlOption.ts`
- new focused catalog service under `backend/src/services/`
- `backend/src/models/application-indexes.ts` only if explicit index registration is required
- focused new backend catalog tests

**Work**

1. Add the option model with stable ID, kind, display name, normalized name, version, creator, and timestamps.
2. Add a unique `(kind, normalizedName)` index and deterministic display-name ordering.
3. Implement list-by-kind and create operations. Built-ins stay outside the collection.
4. Make creation and its audit record one transaction. A failure writes neither record.
5. Convert duplicate-key races into the agreed conflict response and expose the matching existing option safely.
6. Add the dedicated audit action/entity type without changing unrelated audit behavior.
7. Do not implement update, archive, delete, reorder, seed, or backfill methods.

**Acceptance coverage:** AC1, AC3, AC4, AC10, AC12.

**Focused verification**

- Model tests cover valid records, normalization, per-kind uniqueness, timestamps, and indexes.
- Service and replica-set tests cover creation plus audit atomicity, concurrent same-name creation, same label under different kinds, and rollback on audit/write failure.
- Tests confirm no built-in records are required in MongoDB.

## Task 3 — Expose and authorize the catalog API

**Owner:** same backend writer as Task 2 in Mode A; primary agent in Mode B.

**Depends on:** Task 2.

**Owned paths**

- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/domain/authorization.ts`
- `backend/src/domain/route-operations.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- `backend/src/domain/audit-actions.ts`
- backend authorization, route registry, API docs, route, and service tests

**Work**

1. Add GET and POST endpoints with strict query/body validation and predictable response envelopes.
2. Register GET under the existing configuration read authority.
3. Add `ai_estimator_knowledge.quality_control_options.create` to the canonical permission contract and grant it only to Super Admin.
4. Register POST against that operation with non-project AI Estimator Knowledge scope and backend enforcement.
5. Reject Admin and all other roles even if they call POST directly; avoid relying on frontend visibility.
6. Document option kinds, normalization, duplicate conflicts, append-only behavior, and request/response examples in OpenAPI.
7. Keep frontend/backend authorization-contract inventories synchronized.

**Acceptance coverage:** AC2, AC3, AC4, AC10.

**Focused verification**

- Route tests cover authenticated list, invalid kind, valid Super Admin create, malformed name, duplicate conflict, and server failure.
- An asymmetric authorization matrix proves Super Admin succeeds and every non-Super Admin role is denied.
- Route-operation registry, frontend authorization contract, and API documentation inventory tests pass.

## Task 4 — Validate catalog references at checklist save boundaries

**Owner:** same backend writer as Tasks 2–3 in Mode A; primary agent in Mode B.

**Depends on:** Task 2.

**Owned paths**

- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/services/ai-estimator-knowledge-basket-quality.ts`
- `backend/src/routes/ai-estimator-knowledge-admin.ts` where orchestration is wired
- focused validation, route, service, context, and replica-set tests

**Work**

1. Keep structural validation backward compatible for immutable historical revisions.
2. Extend strict new-save validation to recognize syntactically valid custom references.
3. Before a checklist transaction writes, load referenced catalog options in bulk and require existence plus the correct kind.
4. Preserve field-specific errors for unknown, malformed, missing, or wrong-kind Frequency and Performed by values.
5. Preserve built-in values and their current canonical mappings exactly.
6. Ensure failed option validation creates no quality revision, Basket pointer/version update, content digest change, or audit event.
7. Keep context data authoritative and avoid claiming assignment, scheduling, inspection, or sign-off side effects.

**Acceptance coverage:** AC5, AC6, AC7, AC10, AC11, AC12.

**Focused verification**

- Unit tests cover every built-in plus valid custom, missing custom, malformed reference, and cross-kind reference.
- Replica-set tests prove atomic no-write behavior for invalid/stale requests.
- Legacy free-text and absent values remain readable/exportable as incomplete.
- At least one payload uses unequal custom Frequency and Performed by IDs so swapped-kind bugs cannot pass.

## Task 5 — Add frontend API, query, permission, and quick-add flow

**Owner:** frontend implementer in Mode A; primary agent in Mode B.

**Depends on:** Task 1. Can proceed in parallel with Tasks 2–4 against the frozen contract.

**Owned paths**

- `frontend/src/features/ai-estimator-knowledge/knowledgeApi.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQueryKeys.ts`
- `frontend/src/api/authorization-contract.ts`
- `frontend/src/auth/authorization.ts` if permission helpers require updates
- `frontend/src/features/ai-estimator-knowledge/KnowledgeQualityParameterFields.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeQuickAddDialog.tsx` only for reusable generic behavior
- a focused Quality Control option quick-add component if needed
- `KnowledgeBasketQualityPanel.tsx` or workspace wiring required to provide catalog data and mutation callbacks
- focused frontend API, authorization, query, editor, and accessibility tests

**Work**

1. Add typed list/create API functions and kind-specific query keys.
2. Load both catalogs for editable/read-only Quality views without blocking the existing checklist draft.
3. Merge built-ins first and custom options alphabetically, deduplicated by stable identity.
4. Show **Add frequency** and **Add performed-by value** only when the authorization contract includes the Super Admin-only create permission.
5. Reuse the established context-panel quick-add interaction with a single required Name field and persistence explanation.
6. On success, invalidate/refetch the matching catalog, preserve all current row fields, and select the new option in that row.
7. On cancel/error, preserve the entered name as appropriate and leave the checklist draft unchanged; on duplicate conflict, offer the existing matching option.
8. Restore focus correctly after cancel/success and announce result through the existing accessible status pattern.
9. Keep catalog creation independent from checklist Save and from unsaved-draft discard behavior.

**Acceptance coverage:** AC1, AC2, AC3, AC4, AC8, AC11.

**Focused verification**

- Editor tests cover Super Admin actions, non-Super Admin absence, direct permission mismatch, loading/retry, create/cancel/failure/conflict, immediate selection, and draft preservation.
- Keyboard tests cover opening, labelling, validation, focus containment, Escape/Cancel, focus return, and live announcement.
- Query tests prove only the affected catalog is invalidated and checklist data is not falsely marked saved.

## Task 6 — Resolve custom labels across presentation and workbook paths

**Owner:** same frontend writer as Task 5 in Mode A; primary agent in Mode B.

**Depends on:** Task 5.

**Owned paths**

- `frontend/src/features/ai-estimator-knowledge/knowledgeQuality.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQualityPresentation.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeQualityChecklistEditor.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeBasketQualityPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQualityPendingChanges.ts`
- `frontend/src/features/ai-estimator-knowledge/knowledgeSavedSummary.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeQualityImportDialog.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledgeQualityWorkbook.ts`
- `docs/ai-estimator-quality-checklists.md`
- corresponding focused tests and quality CSS

**Work**

1. Extend typed encode/decode helpers to recognize custom references without weakening built-in mappings.
2. Resolve the same custom label in editor, Controls summary, mobile layout, pending changes, Quick summary, saved history, read-only details, and import preview.
3. Show an explicit unavailable legacy state when an option cannot be resolved; never show raw stable IDs in normal UI.
4. Keep unsupported historical free text readable and marked **Needs completion**.
5. Export custom labels instead of IDs and resolve known labels back to exact kind-specific IDs on import.
6. Reject unknown, ambiguous, or wrong-kind workbook labels. Workbook and AI output must never create catalog options implicitly.
7. Generate spreadsheet dropdown validation from the loaded built-in plus custom labels while respecting Excel validation limits; use a hidden list sheet/range rather than an overlong inline formula when necessary.
8. Preserve older workbook compatibility, Number range validation, photo evidence behavior, pending changes, CAS conflict flow, and mobile no-overflow layout.

**Acceptance coverage:** AC1, AC5, AC6, AC7, AC8, AC9, AC11.

**Focused verification**

- Mapping/presentation tests cover built-ins, two different custom kinds, unresolved references, and legacy free text.
- Pending/summary/history tests prove consistent names and no raw-ID leakage.
- Workbook tests cover custom export/import round trips, unknown/wrong-kind labels, labels with punctuation, long option lists, legacy imports, and formula-safe cells.
- Responsive tests cover long custom labels at desktop, tablet, 390 px mobile, and 200% text zoom.

## Task 7 — Integrated reconciliation and integrity review

**Owner:** primary agent integrates. In Mode A, an `integrity_reviewer` performs the independent review after writers finish; in Mode B, the primary agent performs it sequentially.

**Depends on:** Tasks 2–6.

**Review checklist**

1. Reconcile frontend and backend kinds, reference encoding, normalization, errors, and built-in mappings.
2. Inspect authorization end to end: permission inventory, role assignment, route registry, middleware, UI visibility, and direct-call denial.
3. Inspect option identity and lineage across list, selection, checklist payload, saved revision, context, summaries, and workbook.
4. Verify create/audit atomicity and duplicate-race behavior under a Mongo replica set.
5. Verify checklist CAS, immutable history, digest calculation, validation no-write guarantees, and query freshness.
6. Confirm no raw IDs, named-person joins, scheduling behavior, migration, seed, destructive catalog operation, or operational side effect was introduced.
7. Inspect the final scoped diff and resolve all confirmed findings without changing unrelated dirty paths.

**Acceptance coverage:** all acceptance criteria.

## Task 8 — Final verification

**Owner:** `verification_runner` in Mode A after all writers and review fixes finish; primary agent in Mode B.

**Depends on:** Task 7.

**Backend checks**

1. Run focused catalog model/service/route/authorization/audit/race tests.
2. Run focused quality validation, basket-quality route/service/context, and replica-set tests.
3. Run:
   - `cd backend && npm run typecheck`
   - `cd backend && npm test`
   - `cd backend && npm run build`

**Frontend checks**

1. Run focused API/query/authorization/quick-add/editor/presentation/pending/summary/workbook/import tests.
2. Run:
   - `cd frontend && npm run typecheck`
   - `cd frontend && npm test`
   - `cd frontend && npm run build`
3. Render and inspect:
   - Super Admin adding each option kind and the new option becoming selected;
   - Admin/editor selection without creation controls;
   - cancel, duplicate, unauthorized, offline/load error, and retry states;
   - discard-after-create behavior;
   - long custom labels and unresolved legacy references;
   - desktop, tablet, 390 px mobile, keyboard-only, 200% zoom, and read-only states;
   - axe violations, browser console errors, network failures, and horizontal overflow.

**Repository checks**

- `git diff --check`
- `git status --short`
- Review the final scoped diff against the initial dirty-path snapshot.
- Do not claim lint passed because the repository has no lint script.

## Parallel execution map

After Task 1 freezes the contract:

- **Backend lane:** Tasks 2–4, one backend owner because model, authorization, route, audit, and save validation share contracts and tests.
- **Frontend lane:** Tasks 5–6, one frontend owner because query state, editor, presentation, and workbook helpers overlap.
- **Primary lane:** monitor contract parity, preserve existing dirty work, and prepare integration evidence without editing either writer's owned files.

Task 7 begins only after both writers finish. Task 8 begins only after integrity findings are resolved. Writer test results are provisional until final integrated verification.

## Completion evidence

The final handoff must report:

- delivered behavior against all thirteen acceptance criteria;
- final catalog/reference/permission decisions and compatibility behavior;
- affected files and whether dependencies or lockfiles changed;
- exact focused and full tests, replica-set tests, typechecks, builds, rendered QA, accessibility checks, and repository-hygiene results;
- any unrelated baseline failures and every unrun check;
- confirmation that no migration, seed, rename/archive/delete, named-user assignment, scheduler, inspection/task/snag/sign-off workflow, commit, push, deployment, or production action occurred.
