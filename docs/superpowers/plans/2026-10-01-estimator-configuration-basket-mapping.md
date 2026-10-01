# Task plan: Estimator mapping to configured baskets and Main Lines

Date: 2026-10-01  
Status: Approved by the user on 2026-10-01; Mode A implementation and focused verification completed on 2026-10-02  
Approved specification: [Estimator mapping to configured baskets and Main Lines](../specs/2026-10-01-estimator-configuration-basket-mapping-design.md), approved by the user on 2026-10-01.

## Outcome and implementation boundary

New Estimator/Sales choices come from the active Configuration hierarchy, displayed as Main Basket → Sub Basket → Main Line with the Main Line UOM. The estimator enters the selling rate. New estimate lines carry explicit Configuration identity and a server-owned snapshot; old catalogue lines continue to work. New lines must remain coherent through estimate review, PDF, design mapping, workflow, procurement, and finance before they can be submitted.

The user approved this plan and selected Mode A for local implementation. No seed, live migration, commit, deployment, or production write is part of execution.

## Baseline and contract checkpoint

The spec investigation found a static frontend catalogue in `frontend/src/features/leads/estimateBuilderCatalogue.ts`, Configuration Main Line/UOM readers limited to Super Admin, whole-rupee estimate persistence, and downstream consumers that classify the old catalogue by ID prefix. Basket and Sub Basket lists are separately Procurement-readable; neither route gives Estimator/Sales the required filtered hierarchy. The downstream consumers are the principal integration risk.

At writer start, capture `git status --short` and the per-target diff before editing. The only pre-existing unrelated dirty file at planning time is `docs/superpowers/specs/2026-10-01-temporary-local-frontend-production-api-design.md`; the approved spec is this task's own untracked file. Preserve both. If a target becomes dirty, the primary agent resolves ownership before assigning it.

Before parallel writing, the primary agent freezes these shared decisions in a short contract note in this plan or an agreed shared type file:

- The estimator catalogue route, permission, complete-page behavior, ordered tree/row shape, and unavailable-line count/error shape.
- The discriminated estimate-line request/response shapes: legacy absence/`source: "legacy"` versus `source: "configuration"`; stable `mainBasketId`, `subBasketId`, `mainLineId`, active `revisionId`, and `uomId`; server-derived display snapshots; explicit room identity; nullable draft rate/amount in integer paise; stable persisted line ID.
- The distinction between legacy `scopes` and selected configured Main Basket IDs. Do not put configured basket IDs into the old scope-code list or infer trade/section from a configured ID prefix.
- Server validation and snapshot rules for first save, later draft edits, and publication; explicit rupee-input-to-paise conversion; downstream group/line identity and generic `worker_other` fallback.

### Execution contract checkpoint, 2026-10-01

- Use `GET /estimation/catalogue?limit=&offset=` with the established page envelope. Paginate top-level active Main Baskets; each page includes its ordered Sub Baskets and complete eligible Main Lines. Return active revision ID, UOM `{id, code, name, decimalScale}`, and a count of ineligible lines without configuration internals. A retained inactive but nonarchived UOM is eligible, matching active-context resolution. Do not reject a populated Overview solely because an older applicability flag is stale.
- A configured line has `source: "configuration"`, `catalogueId` equal to its stable `mainLineId` for existing exact-item string paths, plus explicit `mainBasketId`, `subBasketId`, `mainLineId`, `revisionId`, `uomId`, `roomId`, and server-snapshotted basket/subbasket/line/UOM names. Its `specification` is null. A legacy line has absent or `"legacy"` source and retains its current contract. `selectedMainBasketIds` is separate from legacy `scopes`.
- Configured-line request rate is `ratePaise: number | null`; frontend holds the rupee input as text and converts a valid two-decimal decimal to integer paise. Zero is explicit; null is incomplete. Store exact `ratePaise` and `amountPaise`, with top-level `subtotalPaise`, `gstPaise`, and `totalPaise`. Provide numeric rupee `rate`/`amount`/totals only as compatibility presentation when the value exists. Included null-rate draft lines have null amount and mark the quote incomplete; they cannot submit or publish. The backend validates all amounts and derives snapshots regardless of client input.
- Preserve a stable persisted line `id` by matching `roomId + mainLineId` for saved configured rows, not array index. First save requires the selected active revision, parent-child IDs, and nonarchived UOM to match current Configuration. Later saves preserve the saved snapshot; publication freezes it. Use the saved Main Basket ID and label for configured group identity, never the first characters of `catalogueId`. Legacy prefix behavior remains on the legacy branch.
- Downstream approved snapshots and finance/procurement readers use exact paise fields when present, with legacy rupee conversion as a fallback. Any configured sourceSection/group key retains the original stable ID case; legacy uppercase validation stays on the legacy branch. A PDF request for an incomplete draft must show an explicit incomplete status or fail clearly, never render a zero-priced line as final.

No agent invents a fallback contract. A material deviation from the approved spec returns to the primary agent and, if it changes behavior, to the spec approval gate.

## Dependency-ordered tasks

| Task | Depends on | Ownership in Mode A | Deliverable and acceptance criteria |
| --- | --- | --- | --- |
| 1. Baseline and contract | Plan approval and execution choice | Primary agent | Record dirty targets, run focused baseline checks, freeze the public catalogue and line snapshot contract above. Trace all prefix-based consumers and known amount units. This is the shared gate for Tasks 2–5. AC 1–6. |
| 2. Estimator catalogue read API | Task 1 | Backend core writer | Add a purpose-built filtered read service/route, operation permission, OpenAPI entry, batched Configuration/UOM projection, deterministic ordering, complete pagination, and active-actor check. Cover same-name children, direct/unresolved/draft/inactive/temporary exclusions, unauthorized roles, and no administrative leakage. AC 1, 2, 6. |
| 3. Estimate line persistence and publication | Tasks 1–2 contract, implementation may overlap Task 2 inside the same owner | Backend core writer | Extend request validation and `Estimate` storage with a source-discriminated configured line, stable IDs, snapshot fields, nullable draft rate/amount, paise arithmetic, server-owned totals, stale first-save conflict, ownership/CAS, and submit gate. Preserve legacy rows and published review snapshots. Use a stable room-plus-Main-Line identity instead of array index for configured-line restoration. AC 3, 4, 6. |
| 4. Backend downstream consumers | Task 1; integrate against Task 3 shape before final tests | Backend downstream writer | Update client presentation/review, PDF, design mapping, project workflow, procurement, finance, and affected dashboard projections to read explicit configured identity and snapshot. Keep legacy prefix behavior confined to the legacy branch. Use actual basket/line labels and generic worker role where no trade classification exists. Add source-specific regression coverage. AC 4, 5. |
| 5. Estimator and consumer UI | Task 1; API integration waits for Task 2/3 | Frontend writer | Replace static new-selection data with the catalogue query; render nested basket hierarchy, UOM, quantity, manual rate, incomplete total and submit blockers. Preserve room state, selected saved lines, legacy restore, summary/proposal, review/client/designer presentation, loading/empty/error/retry, responsive and keyboard states. Update frontend API and authorization types. AC 1–6. |
| 6. Integrated contract and integrity review | Tasks 2–5 finished | Primary agent, then `integrity_reviewer` in Mode A | Reconcile all IDs, amount units, query invalidation, publication snapshots, permissions, and downstream joins. Inspect full diff and resolve findings. In Mode B the primary agent performs the same review inline. AC 1–6. |
| 7. Final verification | Task 6 findings resolved | `verification_runner` in Mode A; primary agent in Mode B | Run focused and risk-based broad tests, typechecks/builds, replica-set tests, rendered desktop/mobile interaction checks, console/network checks, `git diff --check`, and final status/diff review. Record exact results and unrun checks. AC 1–7. |

Only one parent task is in progress at a time. In Mode A, Tasks 2, 4, and 5 may run concurrently after Task 1 because their file ownership is separate; their final tests wait for the integrated worktree. Task 3 stays with the backend core writer to avoid a model/route conflict. In Mode B, the primary agent executes Tasks 1–7 inline without implementation subagents.

## File ownership boundaries for Mode A

The exact target list is confirmed at Task 1 after checking current diffs. These boundaries prevent overlapping writes:

- **Primary agent:** specification/plan reconciliation, cross-layer contract, any new `shared/` estimate types, integration decisions, conflict resolution, and final handoff. The primary agent owns shared fixtures if two slices need the same file.
- **Backend core writer:** `backend/src/models/Estimate.ts`, `backend/src/routes/estimates.ts`, the new estimator-catalogue service/route, `backend/src/app.ts`, `backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, the affected OpenAPI inventory, and focused catalogue/estimate/authorization tests. It does not edit downstream PDF, design, review-round, workflow, procurement, or finance sources.
- **Backend downstream writer:** `backend/src/models/EstimateClientReviewRound.ts`, `backend/src/domain/estimate-client-review.ts`, `backend/src/domain/estimate-design-mapping.ts`, `backend/src/domain/project-workflow.ts`, `backend/src/domain/workflow-estimate-items.ts`, `backend/src/services/estimate-publication.service.ts`, `backend/src/services/estimate-client-review.service.ts`, `backend/src/services/estimate-pdf.service.ts`, estimate-decision/project-workflow services, procurement/finance services and dashboard projections, plus their focused tests. It does not edit `Estimate.ts`, `estimates.ts`, authorization/route registry, or frontend files.
- **Frontend writer:** `frontend/src/features/leads/`, affected `frontend/src/features/estimates/` and designer estimate consumers, related CSS/tests, frontend estimate API/types, and frontend authorization contract. It does not edit `backend/`, `shared/`, or repository documents.

Writers are not alone in the codebase. Each must preserve others' edits, avoid reverting unrelated work, and return any cross-boundary contract change to the primary agent immediately. The primary agent settles shared fixture and import conflicts before final verification.

## Implementation details by slice

### Catalogue and access (Tasks 1–2)

- Project active baskets and their Sub Baskets with eligible active Main Lines using IDs and configured order. Resolve primary UOM from each active Overview revision in batched reads. No vendor price, margin, or full configuration section is returned.
- Define explicit behavior for baskets with no eligible lines and for lines excluded due to missing/archived UOM. Do not substitute a static option. Verify all pages are fetched or the endpoint returns the complete bounded projection.
- Register the new operation in backend authorization and OpenAPI; keep existing Configuration endpoint permissions and their actor guards unchanged. Test Estimator/Sales, Super Admin, Procurement, Designer, Client, inactive actor, and direct endpoint calls.

### Estimate model and money (Task 3)

- Use a discriminated line contract with legacy fields accepted for existing estimates. New-line names, basket path, revision, and UOM snapshot come from the server on first save, never from trusted client labels. Subsequent edits preserve the saved snapshot and stable line ID.
- A configured line can be included in an incomplete draft with null rate/amount. The quoted total excludes it and is marked incomplete. Blank does not become zero. A submitted line needs an explicit valid rate; zero is valid when entered deliberately. Validate quantity/UOM precision and numeric bounds.
- Convert UI rupees to paise once at the API boundary. Calculate configured line amounts, subtotal, GST, and total on the backend. Explicitly adapt legacy whole-rupee rows so mixed drafts reconcile and historical approved values remain unchanged.
- Keep publication/review round snapshots and CAS semantics. Reject a new stale parent/child/revision/UOM reference before it first becomes saved; do not re-resolve an already saved draft snapshot on later saves.

### Downstream lineage (Task 4)

- Replace prefix-based resolution for configured rows in design candidate generation/manual assignment, PDF headings/names, client review, task generation, procurement source grouping, project finance reconciliation, and dashboard aggregations. Carry explicit source/basket/line IDs and snapshot labels through the paths that need them.
- Retain the old static catalogue as a historical legacy lookup, including unknown-ID fallback. Do not add configured IDs to that static map or classify them by name. Generic `worker_other` is the approved fallback where Configuration has no specialty role.
- Exercise two unequal projects and differently named/same-named subbasket paths to detect label joins, paise/rupee drift, and missed portfolio rows. Test legacy and configured estimates side by side.

### Frontend journey (Task 5)

- Fetch the catalogue with TanStack Query using a dedicated key and complete-page collection. Invalidate after relevant Configuration changes visible in the same session; loading/error/empty states remain distinct.
- Replace flat static scope choices with Main Basket selection. Group active-room Main Lines under Sub Baskets, display configured UOM, and allow estimator-entered rate. Preserve room selection and values across navigation and rebuilds by stable room/line ID.
- Restore saved configured snapshots even if current Configuration no longer includes them. Preserve legacy rows as saved history, without adding static rows to a new estimate. Show incomplete totals and field-specific submit errors; save/reload blank and explicit zero distinctly.
- Update summary, proposal, client/reviewer/designer consumers and responsive/accessibility states without adding decorative styling or new icon dependencies.

## Verification matrix

| Criteria | Minimum evidence after implementation |
| --- | --- |
| AC 1–2: real hierarchy and UOM | Backend catalogue service/route tests with two Main Baskets sharing a child name, multiple pages, inactive/draft/direct lines and UOM failures; frontend rendered catalogue/builder tests and empty/error/retry checks. |
| AC 3: manual rate and totals | Backend save/submit validation and replica-set tests for null, explicit zero, invalid precision, stale revision, and two unequal projects; frontend save/reload and subtotal/incomplete-state interactions. |
| AC 4: historical stability | Legacy and configured draft/approved fixtures; rename/deactivate/delete source after snapshot; publication/review/PDF stability; no silent selected-line loss. |
| AC 5: downstream | Focused design mapping, PDF, workflow, procurement, finance, and dashboard tests with configured IDs that do not have a legacy two-character prefix. Verify exact IDs and amounts across list/detail/portfolio. |
| AC 6: access and usability | Route-operation/authorization/OpenAPI tests; rendered keyboard, focus, labels, desktop and mobile width/state checks; console and network inspection. |
| AC 7: final checks | `backend`: focused tests, `npm run typecheck`, risk-based `npm test`, `npm run build`; `frontend`: focused tests, `npm run typecheck`, risk-based `npm test`, `npm run build`; changed transactional Mongo paths on replica set; `git diff --check`, `git status --short`. No lint result is claimed because the repository has no lint script. |

## Completion and handoff

Do not call the work complete until configured lines can travel from selection through approval and downstream consumers without fabricated price, missing identity, or numeric drift, and legacy estimates retain their behavior. Report exact checks/results, unrun checks, affected files, compatibility limits, and that no external action or migration ran.

### Verification record, 2026-10-02

- Backend changed-path replica-set/review checks: 166/166 passed. Three additional contract suites, updated after a broad run exposed stale expectations: 119/119 passed. Backend typecheck and build passed.
- Frontend estimator, router, authorization, review, designer, and procurement checks: 208/208 passed. Frontend typecheck and build passed. Browser interaction and accessibility inspection covered 320, 390, 768, and 1280 px with no console errors or warnings in the temporary local QA fixture.
- Broad runs did not pass: backend 4,364/4,378 before the three contract assertion updates, with seven overnight chat-window failures, two persistent failures in unchanged Configuration tests, and load-sensitive failures; frontend 3,860/3,888 after task assertions were updated, concentrated in unchanged Knowledge UI, enterprise harness, password reset, accessibility, furniture, and procurement workspace tests. These failures were investigated separately; they are not claimed as passing.
- `git diff --check` passed. OCR and migration checks were not applicable. No stage, commit, seed, deployment, live migration, or production write ran.
