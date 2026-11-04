# Estimation inline recommendations: implementation plan

Date: 2026-11-04

Status: Specification and task plan approved; user selected Mode A. T1–T8 complete. Scoped implementation and verification finished; live backend validation was intentionally not run.

Source of truth: [Approved specification](../specs/2026-11-04-estimation-inline-recommendations-design.md). Acceptance criteria below refer to its numbered AC1–AC9.

## Outcome and boundaries

The estimate shows selected project items. A paginated inline Add items picker exposes available choices without creating catalogue-sized draft lists. A shared inline recommendation disclosure shows only configured Non-Negotiable Additions. Client, Sales/Estimation and Designer can explicitly add or remove eligible items while preserving saved identity, visibility, pricing and approval rules.

Keep the application backend stopped; the user starts it manually. Do not start the launcher, app server or OCR worker for verification. Isolated tests may use the repository's disposable Mongo replica-set helper and synthetic fixtures, without touching the user's database. No seeds, backfills, dependencies, lockfile changes, commits, pushes, deployments or external messages are planned.

Initial dirty-path set at plan creation: only the untracked approved specification above. No product-source changes were present. This stage creates only this plan. Before implementation, recapture status and each assigned target's diff; preserve any intervening user work.

## Contract decisions for implementation

- Preserve existing saved estimate and quotation operations and their stable IDs. Separate available catalogue records from selected/persisted/deliberately edited draft rows. Do not drop excluded persisted rows, orphaned saved selections or edited-but-unselected state while rebuilding the visible list.
- Reuse the current recommendation resolver and stable room/target identities. Display only `trigger=added`, `action=add`, `requirement=must`; a configured Sub Basket target contributes eligible children, individually selectable. A Main Basket selection is not a recommendation rule.
- Use one shared presentational picker and one shared recommendation disclosure, with role-specific data adapters. Both page at 20 results. Keep source identity, mutation rules and price calculations outside presentational components.
- Add a bounded project-scoped quotation recommendation read, protected by the existing quotation read permission and project scope. The primary owner settles its exact request/response types before frontend/backend writers start. Inputs cover current estimate version, room and current source identities, including eligible unsaved selections; outputs are paginated, deduplicated, Client-safe targets and visible source references. Hidden rules/items must not affect exposed counts. Read failures and stale identity conflicts cannot become successful empty results.
- Extend the existing quotation candidate search with basket/Sub Basket filters and full eligible-catalogue search before pagination. Validate filter relationships and return only the requested project's authorized choices. The Client picker must not fetch every page just to implement filtering.
- Existing `quotationPatchSchema` requires setup changes to save separately from item changes. Preserve that contract. For a recommendation in another basket, use the existing Configure estimate save flow and then refresh identities/version before adding the target. Preserve any item draft and apply current save/reconciliation guards; never send a mixed setup/items command or silently discard changes.
- Adding/removing recommendations uses the current pricing and save paths. Where Client recommendation provenance needs additional request metadata, make it optional for existing callers, validate against current rules and same-room included sources on the server, and reuse the existing stored origin representation. Do not infer origin from a label or grant unrestricted edits. Keep independently selected lines independent.
- Removing a target leaves its source selected. Removing a source preserves established same-room dependent cleanup, including multiple sources and independent selection. Hidden Client scope and approved/submitted snapshots cannot be altered by that cleanup.
- Client pre-design changes still await Sales confirmation before Client approval. Current phase, ownership, historical/read-only and unavailable-source safeguards remain authoritative.

## Dependency graph and execution

T1 contract/baseline precedes all writers. T2 backend and T3 shared frontend can proceed independently after T1. T4 staff editor and T5 Client editor depend on the shared components and agreed API types; they may then run alongside each other on separate paths. T5 can develop against the agreed synthetic contract while T2 finishes, but integrated verification requires T2 to be complete. T6 integration follows all writers. T7 integrity review follows integration; T8 final verification follows resolution of review findings.

In Mode A, use native agents only after the user selects A. With four available slots, the primary owns contracts/shared UI/integration and delegates at most three non-overlapping slices. Tell each writer that other writers share the worktree, identify exact ownership, and prohibit reverting others' changes. In Mode B, the primary completes the same tasks inline without implementation subagents.

Only one parent task is in progress at a time: establish contract, implement the bounded slices, integrate, review, then verify. Child slices within implementation may run in parallel as described above.

## Tasks

### Settled implementation contract and baseline

- Read operation: `POST /projects/:projectId/quotation/recommendations/query`, using project-scoped `estimation.quotation.read`. JSON body avoids large encoded query URLs: `{ expectedVersion, roomId, sources: [{ mainLineId, source: { revisionId, itemVersion, revisionVersion, uomId } }], limit?, offset? }`. At most 200 distinct sources; page size defaults to and cannot exceed 20. Oversized input is rejected explicitly rather than truncated.
- Response: `{ projectId, estimateId, estimateVersion, roomId, items: [{ candidate: QuotationCandidate, sourceMainLines: [{ mainLineId, name }], requiresSetup }], total, limit, offset }`. Filter hidden sources/targets before counts; no raw internal reasons. Visible stale identities conflict. Visible unavailable choices stay explicit; hidden/unknown sources share a generic unavailable response.
- Candidate GET adds optional `mainBasketId` and `subBasketId` filters. Existing default request/response behavior remains compatible.
- Add/update operations accept optional validated `recommendationSourceMainLineIds`. Explicit exclusion/manual re-add clears provenance; ordinary edits preserve it. Saved safe detail exposes the array only when every origin is visible; omitted origins never authorize client-inferred dependent cleanup. Server owns cleanup and preserves hidden scope.
- Shared component exports and props are defined in `EstimateItemPicker.tsx` and `EstimateRecommendations.tsx`; data adapters supply already paginated safe rows. `EstimateBuilderShell.selectedItemsOnly` keeps all configured rooms while replacing the obsolete By Section/Selected toggle for editable consumers.
- Baseline: staff 5 focused files/121 tests passed; Client 3 files/51 tests passed; backend quotation-edits and estimator-catalogue-recommendations 2 files/66 tests passed. Only disposable replica-set tests ran; no application backend was started.
- Slice results before final integrity review: backend 4 files/148 tests passed and typecheck passed; staff 11 files/182 tests plus final guard rerun 2 files/24 tests passed and frontend typecheck passed; Client 5 files/63 tests passed; shared UI/API 4 files/16 tests passed; registry/OpenAPI/frontend authorization contracts 3 files/50 tests passed. Counts overlap and are not a combined final-suite total.
- One unrelated pre-existing failure was observed in `authorization-policy.test.ts`: its exact audit-action list omits `procurement_vendor_classification_corrected`, which exists in unchanged HEAD `backend/src/domain/audit-actions.ts`. Neither file is edited by this task.
- Integrity review found and resolved two P2 defects: locally restored recommendations now prune explicit draft origins when their source is removed; excluded saved staff rows with invalid quantity or changed UOM now have a bounded correction surface. Saved IDs, exclusion state and save guards are preserved. Regression tests cover both paths. Final independent review reports no remaining confirmed findings.
- Browser checks use the temporary synthetic frontend fixture at `/private/tmp/lisno-inline-recommendations/browser-harness/` on port 5188. Client search finds item 0999 from a 1,000-item synthetic catalogue, pages at 20 rows, and recommendation add/save/remove/save retains the source and exclusion. Client 390/768/1440 checks showed no page overflow, runtime errors or axe violations. Staff desktop add/remove works without modal/source rollback. Final width/state checks continue; these are synthetic UI checks, not live backend verification.

### T1. Establish the implementation contract and focused baseline

Owner: primary. Dependencies: plan approval and execution-mode selection. AC: all, particularly AC5–AC7.

- Reconcile the approved spec with current target diffs and inspect current source/deselection/save paths before assigning writers.
- Settle the recommendation read DTO, source/request bounds, stale/version responses, candidate filters, recommendation-origin validation and shared UI props. Document the agreed contract in this plan when execution begins; circulate it to every writer before dependent edits.
- Confirm Client source removal cannot change hidden dependent scope and determine the minimal origin handling needed across staff and Client saves. If this requires changing the approved policy rather than a compatible implementation, stop only that dependent slice and report the material difference.
- Capture focused baseline results for the affected recommendation and quotation tests. Existing failures must be distinguished from regressions; do not repair unrelated failures or run the entire repository suite as a prerequisite.

Deliverable: compatible contract and ownership boundaries that allow the writers below to work independently, with baseline evidence.

### T2. Implement safe Client reads and recommendation save semantics

Owner in Mode A: `backend_implementer`.

Owned files: `backend/src/routes/quotation.ts`; `backend/src/services/quotation.service.ts`; a small `quotation-recommendations.service.ts` if separation is useful; narrowly required changes to `quotation-setup.service.ts`, `estimator-catalogue.service.ts` and `backend/src/routes/estimates.ts`; relevant quotation and estimator catalogue tests. Do not edit primary-owned route registry/OpenAPI files or frontend files.

Dependencies: T1. AC: AC2, AC3, AC5–AC7, AC9.

- Add the project-scoped recommendation read and runtime validation, reusing existing project resolution, current Configuration selection and rule interpretation. Validate draft source eligibility independently of client-supplied names/visibility flags.
- Filter before pagination and counts. Include only safe visible source/target references in Client output; never pass through staff rule payloads, hidden target identifiers, hidden counts or internal reason text.
- Implement candidate filters/search before pagination, preserving existing callers' default behavior.
- Preserve current saved identity, exclusion, pricing and transaction fences. Support only the minimal validated origin metadata needed for the approved add/remove behavior, without introducing a new persistence model.
- Keep setup saves separate; recommendation reads produce no writes. Unauthorized/stale inputs must not mutate estimate, Configuration, approvals or audit history.
- Add meaningful regression cases for two unequal projects, two clients, distinct rooms, visible/hidden sources and targets, latest draft versus active Configuration, duplicate targets, excluded/re-added rows, origin cleanup, stale saves and confirmation policy.

Deliverable: route/service changes and focused backend tests, with exact checks reported to primary.

### T3. Build the shared compact UI and public contract wiring

Owner: primary. Dependencies: T1. AC: AC1–AC4, AC7–AC9.

Owned files: new focused shared components under `frontend/src/features/estimates/` such as `EstimateItemPicker.tsx`, `EstimateRecommendations.tsx`, their tests and scoped stylesheet; narrowly required `EstimateBuilderShell.tsx` changes and tests; `frontend/src/features/client/quotationApi.ts` and API contract tests; `backend/src/domain/route-operations.ts`, `backend/src/openapi/quotation.ts`, any required `backend/src/openapi.ts` integration, and matching registry/authorization contract tests. The primary also owns shared stylesheet edits in `frontend/src/styles/estimator-dashboard.css`.

- Build a compact inline picker with search, basket/Sub Basket filters, 20-item pagination, item context and an Add action. Keep selection and API adapters external so staff and Client screens reuse the same interaction.
- Build the inline non-negotiable disclosure with bounded pages, visible source labels and Add/Remove controls. First relevant suggestions can expand it without stealing focus; closing it never causes mutations. No oversized cards, new icons or modal recommendation workflow.
- Cover loading, empty, stale, error, unavailable, pending and disabled/read-only states. Keep meaningful keyboard focus after add/remove/page changes, announce changes without forcing focus and ensure mobile controls remain usable.
- Add typed Client request functions/query keys for the agreed safe recommendation response and filtered candidates. Scope caches by project, actor/session, estimate version, room and normalized source identities as appropriate.
- Register the new route operation and OpenAPI shapes without broadening staff catalogue access or personal mutation rights.

Deliverable: shared UI and stable public contracts ready for T4/T5, with component/contract checks.

### T4. Integrate selected-item behavior into Sales/Designer estimation

Owner in Mode A: `frontend_implementer` assigned to the staff slice.

Owned files: `frontend/src/features/leads/configuredEstimate.ts`, `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, `roomRecommendations.ts`, `EstimatorRecommendations.tsx`, `useConfiguredEstimateViewState.ts`, narrowly required `estimationCatalogueApi.ts` changes, and their tests. Shared shell/styles and Client files remain primary/other-writer owned.

Dependencies: T1 and T3 shared props/components. AC: AC1–AC6, AC8–AC9.

- Replace eager room-by-catalogue draft generation with explicit target creation and reconciliation of selected/persisted/edited rows. Preserve saved choices, stable IDs, unavailable included rows and excluded recoverable rows.
- Render only included project lines in the main builder. Keep every configured room available even when empty; provide a concise empty state and Add items access instead of empty basket/Sub Basket sections.
- Adapt the eligible catalogue into bounded picker results without materializing every item as an editable row. Search beyond the first page and support direct temporary items and configured Sub Basket items.
- Replace automatic modal state, skip/slide-out bookkeeping and close-triggered source rollback with the shared inline disclosure. Remove only obsolete behavior; retain current source revision freshness checks and recommendation origin semantics.
- Explicit adds affect the active room and chosen target only. Recommendation target removal must remain possible while its source stays included. Preserve group-removal confirmations and draft navigation/save behavior.
- Keep Designer editing on the established authorized staff workspace. Do not turn the Designer's safe read-only project view into an alternate editor.

Deliverable: staff interaction parity with the approved spec and focused algorithm/rendered regression tests.

### T5. Integrate the same flow into Client quotation

Owner in Mode A: a separate `frontend_implementer` assigned to the Client slice.

Owned files: `frontend/src/features/client/ClientQuotation.tsx`, `ClientQuotationLine.tsx`, `clientQuotationCandidates.ts`, `clientQuotationDraft.ts`, `clientQuotation.css`, narrowly required `ClientQuotationSetup.tsx` integration, and their tests. Do not edit primary-owned `quotationApi.ts`, shared components/styles or staff files.

Dependencies: T1, T3 shared components/API types; T2 required before integration completion. AC: AC1–AC9.

- Stop merging all fetched candidate and excluded rows into the visible estimate. Show included saved/draft rows; keep excluded records recoverable through the inline picker with the same IDs and options.
- Replace the ordinary Add quotation item dialog with the shared inline picker. Request only the current search/filter page and use backend search/filter totals, preserving hidden-scope protection.
- Adapt the safe recommendation read to the shared inline disclosure using current included visible sources, including eligible unsaved additions. Cancel/ignore stale context results and refresh recommendation/candidate data after relevant saves.
- Add/remove through existing draft operations, including persisted exclusion and explicit restore. Provide normal quantity/dimension/tier/mode editing after selection rather than requiring a recommendation popup.
- For cross-basket targets, use the separately saved setup flow, retain existing draft guards, and re-fetch current tokens/version before adding. Give an inline explanation when an existing permission/dependency blocks that action.
- Preserve unknown-save reconciliation, version conflict behavior, Client-hidden scope, approved history and Sales confirmation before Client approval. Losing a response must not silently restore a removed recommendation or clear user changes.

Deliverable: Client interactions matching the staff flow for allowed items, with render/save/cache regression tests.

### T6. Integrate and reconcile all consumers

Owner: primary. Dependencies: T2–T5 finished. AC: all.

- Inspect the combined diff and update every actual caller of changed draft builders/query types. Reconcile component props, errors, pagination and cache identities across both editors.
- Check setup navigation, historical/read-only renders, saved unavailable lines, group removal, and return-to-estimate behavior for regressions. Scope CSS so historical and unrelated pages do not inherit an unintended redesign.
- Run focused integrated regressions and resolve attributable failures. Confirm no UI access change bypasses backend authorization and no removed recommendation is automatically selected by refresh/reopening.

Deliverable: one integrated worktree ready for independent review.

### T7. Review integrity

Owner in Mode A: `integrity_reviewer`, read-only; primary performs this sequentially in Mode B. Dependencies: T6. AC: AC4–AC7 and AC9.

Audit Client non-disclosure, same-room/source lineage, saved exclusions, protected group scope, CAS and unknown saves, query invalidation, current Configuration revisions, paise totals and immutable approval history. Review large-catalogue draft/materialization behavior and pending asynchronous responses. Primary resolves confirmed findings through the original file owners; finish all fixes before final verification.

### T8. Verify and hand off

Owner in Mode A: `verification_runner`, read-only product sources; primary performs this in Mode B. Dependencies: T7 findings resolved. AC: all.

Run the focused matrix below on the final integrated result, frontend/backend typechecks and builds, rendered interaction checks and repository hygiene. Report exact pass/fail/skip results and distinguish pre-existing failures from regressions. Mark work complete only when required criteria have evidence or clearly report an unmet requirement.

## Verification matrix

| Criteria | Required evidence |
| --- | --- |
| AC1 | Synthetic 1,000-item basket across multiple rooms produces no automatic included rows or full draft fan-out. Picker renders at most 20 results; search reaches an item beyond page one; page/filter changes reset pagination correctly. |
| AC2 | Staff and Client room/property/bedroom/basket setup still works. Adding one item changes only its room, with supported mode, tier, quantity, dimensions and temporary-item states available. |
| AC3–AC4 | Mixed mandatory/probable/exclusion rules; non-negotiable Sub Basket targets; duplicate sources. Only non-negotiable suggestions appear. Collapsing, paging, failure, room change and late requests cause no selection rollback or focus theft. |
| AC5 | Add, save, remove target, save, reopen and explicitly restore in each editor. Multiple source origins and manual selections remain correct; no refresh silently reinserts excluded rows. |
| AC6 | Remove a visible group in one room/project with hidden members and other-room counterparts present. Only authorized intended scope changes; unavailable included saved rows remain explicitly visible. |
| AC7 | Two clients/projects with unequal amounts and different visibility. Denied projects, hidden sources/targets/counts, malformed filters, stale identity/version and saved snapshot immutability. Confirm Client edits require Sales confirmation before approval. |
| AC8 | At 390, 768 and 1440 pixels: both editable workspaces, empty state, long lists, loading/error/stale/unavailable states and read-only/historical views. Exercise keyboard picker/disclosure controls, focus after removal, accessible names and horizontal overflow. |
| AC9 | Focused regressions, registry/authorization contracts, transactional replica-set tests where relevant, both typechecks/builds and diff hygiene. |

### Focused commands after implementation

Run commands in the indicated workspace; add exact new test files when created. Existing source modules being changed have real consumers, so verify adjacent dimensions/component pricing and setup/history flows as well as recommendation-specific tests.

Frontend:

```sh
npm test -- src/features/leads/configuredEstimate src/features/leads/roomRecommendations.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx
npm test -- src/features/client/ClientQuotation src/features/client/clientQuotationCandidates.test.ts src/features/leads/LeadEstimateWorkspace src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/SubmittedEstimateBuilder.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx
npm run typecheck
npm run build
```

Backend:

```sh
npm test -- tests/estimator-catalogue-recommendations.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/client-quotation-projection.test.ts
npm test -- tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/authorization-policy.test.ts
npm run typecheck
npm run build
```

New test targets, if created under the planned names: frontend `EstimateItemPicker.test.tsx`, `EstimateRecommendations.test.tsx`, quotation API/draft tests; backend `quotation-recommendations.replica-set.test.ts`. Record exact final paths and run them explicitly. A skipped replica-set suite is not evidence of a passing transactional check.

Repository root:

```sh
git diff --check
git status --short
```

Rendered QA can use an already user-started app or an isolated frontend fixture with synthetic intercepted responses. Never launch the application backend. Label fixture-based checks accurately and report any live-only gap. Use temporary evidence under `/private/tmp/lisno-inline-recommendations/`; do not retain screenshots, traces, caches or build outputs as source deliverables. No repository lint script exists, so do not report lint as passed.

## Handoff

Report the actual user-visible result, key files/contracts, focused test counts, typecheck/build results, rendered viewport/interaction coverage, unrun checks, baseline failures and remaining risks. Confirm that the application backend was not started and that no data migration or external action was performed. Link the approved specification and this plan; keep status and evidence current during execution.

### Final integrated evidence

| Check | Result |
| --- | --- |
| Frontend focused suite | 23 files, 292 tests passed |
| Backend focused suite | 8 files, 246 tests passed, no skips |
| Frontend and backend typecheck | Both passed |
| Frontend and backend production build | Both passed; Vite chunk-size warning above 500 kB |
| Repository hygiene | `git diff --check` passed; only scoped source, tests and these documents changed |
| Independent integrity review | Both P2 findings resolved; no remaining confirmed findings |

Exact final focused commands, in the corresponding workspace:

```sh
# frontend
npm test -- src/features/leads/configuredEstimate src/features/leads/roomRecommendations.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/client/ClientQuotation src/features/client/clientQuotationCandidates.test.ts src/features/client/clientQuotationDraft.test.ts src/features/client/quotationApi.test.ts src/features/leads/LeadEstimateWorkspace src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/SubmittedEstimateBuilder.test.tsx src/features/estimates/ProjectQuotationWorkspace.test.tsx src/features/estimates/EstimateItemPicker.test.tsx src/features/estimates/EstimateRecommendations.test.tsx
npm run typecheck
npm run build

# backend
npm test -- tests/estimator-catalogue-recommendations.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/client-quotation-projection.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts tests/quotation-openapi.test.ts
npm test -- tests/authorization-policy.test.ts
npm run typecheck
npm run build
```

The separate authorization-policy check has 59 passing tests and one pre-existing failure: its exact audit-action expectation omits `procurement_vendor_classification_corrected`, present in unchanged HEAD `backend/src/domain/audit-actions.ts:242`. Neither file was modified. The first sandboxed backend test attempt could not listen on local sockets; its skipped tests are not counted. The authorized disposable-replica-set rerun passed all 246 tests.

Synthetic browser QA exercised Client and the shared Sales/Designer editor at 390, 768 and 1440 pixels, with no horizontal page overflow, runtime errors or axe violations in the checked states. Client search reached item 0999 from a 1,000-item catalogue with 20 rendered picker results. Client add/save/remove/save and refresh preserved exclusion and the source. Sales and Designer explicit recommendation add/remove retained the source and showed no dialog. Keyboard opening focused search; Escape restored the Add items trigger. Client ready/error/stale/loading states were also checked at 390 pixels with complex saved rows, without overflow, runtime errors or axe violations. Rendered regression tests cover empty/unavailable/read-only/historical states, saved removal, hidden scope and delayed responses. This combines browser and rendered-test evidence; it is not a full Cartesian browser matrix of every state at every width.

Designer browser QA used the existing authorized staff route with synthetic permissions matching the backend Designer defaults; the generic fixture originally omitted those permissions. No production authorization was changed for the fixture.

Logs and temporary browser evidence: `/private/tmp/lisno-inline-recommendations/final-*.log`, `designer-browser-result.txt`, `client-states-result.txt` and `output/playwright/`. Ignored build outputs are `frontend/dist/`, `backend/dist/` and TypeScript build metadata. No dependencies or lockfiles changed. No full repository suites, lint, OCR tests, live backend verification, migrations, seeds, commits, pushes, deployments or external messages ran. The application backend and OCR worker were never started. The user must manually restart the backend to load the new quotation recommendation API.
