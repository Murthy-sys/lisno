# Standard and Special classification in estimation: task plan

Date: 2026-10-05

Status: Approved by the user; executed in Mode A and verified locally on 2026-10-05.

Source of truth: [approved specification](../specs/2026-10-05-estimate-standard-special-classification-design.md)

## Contract and ownership before writers

- **Parent owns the contract and integration.** Use `classification: "standard" | "special"` for configured lines and `selectedMainBasketClassifications: Array<{ mainBasketId, classification }>` for basket choices. Keep `selectedMainBasketIds` as the canonical selected-ID list and `itemType: "main_line" | "temporary"` as the catalogue structure field. The optional request fields preserve older clients: omitted values retain a saved classification when present, otherwise resolve to Standard. Explicit basket entries must match effective selected IDs exactly.
- **Dirty baseline:** the repository has broad pre-existing work. Relevant implementation targets are clean except `backend/src/openapi.ts` and `frontend/src/api/types.ts`, which contain unrelated procurement/lead additions inspected before this plan. The parent owns edits to those two shared files and must preserve their current diff. Any new change to another target before execution is inspected before assigning that file.
- **No cross-owner writes:** the backend implementer owns the backend implementation and tests listed below except OpenAPI; the frontend implementer owns the estimator implementation and tests listed below except shared `frontend/src/api/types.ts`. The parent owns cross-layer reconciliation and any synthetic browser fixture changes. Agents must not revert or reformat unrelated dirty work.

## Dependency-ordered tasks

### 1. Baseline and contract lock — parent

- Capture current dirty paths and relevant per-target diffs before implementation. Confirm the approved field names, effective-selection validation, historical Standard fallback, and no financial effect with both implementers.
- Define fixtures with two unequal baskets, two same-named lines in different rooms, one empty selected basket, and a temporary item. Record current save/reload and publication behavior so new tests distinguish classification from source `itemType` and money values.
- **Acceptance:** each writer has an explicit non-overlapping file list and the same API semantics. No implementation writer starts on a dirty target without its existing change being understood.

### 2. Estimate write and persistence — backend implementer

**Owned source:** `backend/src/routes/estimates.ts`, `backend/src/models/Estimate.ts`.

**Owned tests:** `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`.

- Extend strict Zod input validation and Mongoose persistence with the new optional classification fields. Resolve omitted basket and line values from prior saved records or Standard, keyed only by stable IDs. Require complete, unique, selected-only basket entries when the array is explicit. Reject invalid enum values and preserve existing estimate-version, catalogue, source-snapshot, lock, and authorization behavior.
- Return classifications from save/reload without changing quantity, rate, paise totals, GST, or existing `itemType`. A selected basket with zero lines must save its own classification.
- **Acceptance:** replica-set tests cover mixed Standard/Special baskets and lines, empty basket, temporary item, invalid/mismatched payloads, old-client omission, historical missing values, stale version, and unchanged paise totals.

### 3. Immutable publication and review lineage — backend implementer, after task 2 contract is in place

**Owned source:** `backend/src/domain/estimate-client-review.ts`, `backend/src/models/EstimateClientReviewRound.ts`, `backend/src/services/estimate-publication.service.ts`, `backend/src/services/estimate-client-review.service.ts`, `backend/src/services/estimate-client-presentation.ts`.

**Owned tests:** `backend/tests/estimate-client-review-models.test.ts`, `backend/tests/estimate-publication-mongo.replica-set.test.ts`, `backend/tests/estimate-client-presentation.test.ts`; add a focused review-service test only if its mapping needs separate coverage.

- Copy basket and line classifications into the immutable submitted snapshot and map them through review/presentation without changing visual client proposal or PDF content. The strict snapshot model must accept only the two values when present. Historical rounds with absent values remain readable and are interpreted as Standard where the type is shown.
- **Acceptance:** a newly published round retains the exact saved ID-to-classification mapping; previous rounds cannot be mutated; old snapshots still parse; approval/source identity and totals remain unchanged.

### 4. Estimator state and radio controls — frontend implementer, parallel with tasks 2–3 after task 1

**Owned source:** `frontend/src/features/leads/configuredEstimate.ts`, `frontend/src/features/leads/leadsApi.ts`, `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, `frontend/src/styles/estimator-dashboard.css`.

**Owned tests:** `frontend/src/features/leads/configuredEstimate.test.ts`, `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`, `frontend/src/features/leads/ConfiguredEstimateBuilder.test.tsx`.

- Add basket classification state and line classification to configured drafts. Render two-option radio groups on selected baskets and included configured item rows, with distinct accessible names and keyboard focus. Display the saved classification without editable radios in read-only states.
- On first inclusion, initialize a line from its basket's current classification. Preserve explicit line choices across unselect/reselect, catalogue refresh, save response, reload, and requested-change revisions. Changing a basket's classification must not rewrite an already classified line. Send explicit classifications for selected baskets and included or previously saved configured lines.
- **Acceptance:** rendered tests exercise the radio controls, independent basket/line types, empty selected basket, temporary item, save/reload, stale-save guard, read-only display, and historical Standard fallback. The amount and source `itemType` assertions remain intact.

### 5. Shared contract inventory and integration — parent, after source slices settle

**Owned files:** `backend/src/openapi.ts`, `frontend/src/api/types.ts`; if required for rendered QA, only the task-specific additions in the already dirty `frontend/src/test/fixtures/enterpriseRoutes.ts`.

- Add the optional classification fields to estimate request and immutable snapshot OpenAPI schemas and to frontend published-review types. Preserve every pre-existing unrelated edit in these files. Reconcile naming and optionality with backend and frontend output; update generated fixtures only where a real contract check requires it.
- **Acceptance:** API docs and frontend contract tests agree with runtime validation, and the existing dirty changes remain in the final diff.

### 6. Integrated review and verification — parent, then reviewers in sequence

- After both writers finish, inspect their diffs and run `integrity_reviewer` for identity mapping, omission compatibility, stale-version behavior, immutable publication, paise reconciliation, and unrelated-diff preservation. Resolve confirmed findings before `verification_runner` runs on the integrated tree. In inline execution mode, the parent performs the same steps sequentially.
- **Focused backend:** `cd backend && npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-client-review-models.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-presentation.test.ts tests/api-docs.test.ts`. Run any additional touched review/publication unit test needed for a concrete gap. Use the replica-set lane for transactional save/publication paths.
- **Focused frontend:** `cd frontend && npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx` and any directly affected contract test.
- **Builds:** `cd backend && npm run typecheck && npm run build`; `cd frontend && npm run typecheck && npm run build`. Broaden test suites only for a failing shared-contract dependency or a concrete remaining risk.
- **Rendered QA:** inspect the estimator basket and item steps at desktop, tablet, and mobile widths; keyboard radio selection, save/reload, empty basket, read-only and stale states; accessibility names, focus, overflow, console, and unexpected API errors. Use synthetic data, not live customer records.
- **Hygiene:** `git diff --check`, task-specific checks for any untracked files, and `git status --short`. Report exact results and generated QA paths. No migration, seed, production write, commit, push, deploy, or customer message is part of this plan.

## Safe parallel work

After task 1, tasks 2–3 (one backend owner) and task 4 (one frontend owner) may run concurrently because their source/test files do not overlap. The parent may prepare task 5 in its two explicitly owned shared files while the agents work, then reconciles their contracts. Final review and verification wait until all writes finish; tests run during concurrent edits are not final evidence.

## Trace to specification acceptance criteria

| Specification criterion | Owning tasks | Evidence required |
| --- | --- | --- |
| Radio controls and responsive accessibility | 4, 6 | Rendered component tests and browser width/keyboard checks |
| Defaults, inheritance, independent override, refresh | 2, 4, 6 | Draft-state tests and backend save/reload assertions |
| Stable-ID persistence across two baskets/lines and empty basket | 2, 4, 6 | Asymmetric route and workspace tests |
| Validation, old-client/historical compatibility, unchanged money and `itemType` | 2, 3, 5, 6 | Replica-set, model, presentation, and API-doc tests |
| Immutable published classification without client/PDF/procurement changes | 3, 5, 6 | Publication replica-set and snapshot model tests, final diff review |
| Integrated checks and hygiene | 6 | Exact command output and rendered QA findings |

## Completion evidence (2026-10-05)

- Read-only integrity review found no confirmed defects in ID mapping, omission compatibility, version checks, immutable publication, frontend state, or shared API types.
- Backend focused command from `backend/`: `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-client-review-models.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-presentation.test.ts tests/api-docs.test.ts` passed: 5 files, 171 tests. `npm run typecheck` and `npm run build` passed.
- Frontend focused command from `frontend/`: `npm test -- src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx` passed: 3 files, 51 tests. `npm run typecheck` and `npm run build` passed. Vite reported its existing large-chunk warning.
- Rendered synthetic estimator QA passed at 390, 768, and 1440 px: basket and line radios displayed with distinct names; keyboard selection and line reselect behavior worked; no document or element overflow, unexpected requests, or application errors were detected. The phone-view axe scan found zero violations (one incomplete rule). The development console recorded an axe preload warning during the scan.
- `git diff --check` passed. The broad pre-existing procurement worktree diff was preserved. Browser QA artifacts are under `.playwright-cli/`; build output is ignored under `backend/dist/` and `frontend/dist/`.
- No migration, seed, production write, commit, push, deployment, or customer communication was performed. Full suites and OCR checks were outside this estimate-specific verification.
