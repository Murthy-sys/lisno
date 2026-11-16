# Estimator tier selection and Main Line recommendations: task plan

Date: 2026-11-16
Status: Implemented and locally verified in approved Mode A

Source of truth: [Approved specification](../specs/2026-11-16-estimator-tier-selection-main-line-recommendations-design.md), approved by the user on 2026-11-16.

## Outcome and boundaries

Allow applicable configured tiers to be selected independently of the current PMC/Sub-vendor price. Keep the selected method and show missing prices explicitly. Display the Main Line's configured required recommendations across all tier/method choices, including blocked targets that need pricing or configuration. Existing Add, save and submission validation stays authoritative.

Preserve styling, current source/version checks, required/optional/removal policy, historical amounts, description retention and Client preview behavior. No invented prices, automatic PMC switching, Configuration writes, schema migration, dependencies or service restarts.

## Integration contract

- **Tier selection versus pricing:** establish one applicability/current-source selection predicate and use it consistently in the row, workspace handler and draft update helper. Retain `configuredTierUnavailableReason` and existing pricing checks for inclusion, pricing validity, comparison and save/submission. A newly selected unpriced tier keeps its method, clears any incompatible prior configured price and displays Pending; it must not keep the previous tier's amount.
- **Recommendations:** retain Main Line ID/revision-based source queries. Do not add tier/mode keys or change historical-source matching. Retain actionable recommendation target resolution and Add eligibility.
- **Unavailable display:** keep existing recommendation IDs, `available`, revision metadata, children and counts compatible. If authorized target labels are absent, add optional display metadata to the existing read response. Primary settles exact field names/types before writers start; backend and frontend use the same contract. Metadata may identify a verified current target/group and its unavailable reason, but must not imply permission to add it or expose prices/private configuration.
- **Presentation:** keep valid recommendation rows unchanged. Add disabled display rows for unavailable required direct targets and group summaries, using verified labels or an explicit generic unavailable state. A group with no usable children remains visible. Mixed groups retain their usable children and an accurate incomplete summary. Existing shared `EstimateRecommendations` supports per-item `disabled` and `message`; reuse those fields before changing shared presentation.

## Dependency-ordered tasks and ownership

### 1. Baseline, regression cases and contract — primary

Capture current HEAD, dirty paths and relevant per-target diffs again before edits; the prior investigation baseline is under `/tmp/lisno-estimator-tier-recommendation-qa`. Understand any new work before assigning targets. Confirm the approved local-data findings using synthetic fixtures with unequal prices and distinct source/target IDs; do not edit local records.

Settle the minimal optional recommendation display fields and ownership. Primary owns cross-layer contract changes in `frontend/src/features/leads/estimationCatalogueApi.ts` and applicable OpenAPI schema/documentation. Reuse existing unavailable reasons where possible. Keep one parent implementation task in progress. AC1–AC7.

### 2. Tier selection — frontend tier owner

Own:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`
- `frontend/src/features/leads/configuredEstimate.ts`
- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- Relevant `ConfiguredEstimateBuilder`, `configuredEstimate` and `LeadEstimateWorkspace.tiers` tests.

Replace the price-based tier-selection restriction consistently across the three existing guards. Preserve read-only, loading, stale-source, applicability and pricing-mode permissions. Ensure selecting an unpriced tier leaves a blank configured rate/Pending amount and cannot submit a stale, zero or borrowed amount. Switching back to a priced tier restores that tier's own price. Do not modify recommendation queries or rule handling. AC1–AC2, AC6–AC7.

### 3. Authorized recommendation display metadata — backend owner

Own `backend/src/services/estimator-catalogue.service.ts` and `backend/tests/estimator-catalogue-recommendations.replica-set.test.ts`, plus only directly necessary service-local tests.

After task 1 fixes the contract, preserve current recommendation eligibility while supplying the optional verified display metadata needed for unavailable direct targets or Sub Basket summaries. Do not broaden target selection, expose private configuration or change mutation authorization. If existing response/catalogue fields suffice for a case, leave that backend path unchanged. Verify missing/archived/mismatched targets and current revision selection. AC3–AC6.

### 4. Recommendation visibility — frontend recommendation owner

Own:

- `frontend/src/features/leads/roomRecommendations.ts`
- `frontend/src/features/leads/EstimatorRecommendations.tsx`
- Their focused tests and `LeadEstimateRecommendations.test.tsx`.

After task 1 fixes the contract, retain visible required recommendation decisions even when Add is unavailable. Use existing disabled/message support and preserve source reasons, deduplication, selection/removal and blocked-completion handling. Do not render optional/removal/guidance rules or alter prices. Prove that source recommendations remain identical for three tiers and PMC on/off, with separate rooms/Main Lines. No writes to the tier owner's files; report any necessary workspace wiring to primary. AC3–AC7.

### 5. Integration and integrity review — primary, then read-only reviewer

Wait for all writers to stop; reconcile response types and inspect the final delta against the baseline. Review selectable-but-unpriced states, stale amount clearing, required-target completion, response compatibility, target label authorization, stable source/target identities and historical immutability. Resolve confirmed findings within the approved scope. AC1–AC7.

### 6. Final verification and handoff — verification owner, primary

Run checks on the integrated worktree after review. Primary performs synthetic desktop/mobile interactions and inspects screenshots: PMC off/on, all applicable tiers, missing prices, unchanged recommendation set, blocked unavailable Add and valid-target Add/Remove. Verify keyboard names/states, no unintended mutations and no console errors.

Record exact commands/results, changed files, unrun checks, warnings and temporary artifacts in this plan. Backend/OCR services remain stopped. No commit, push, deployment, seed, migration or live-data mutation. AC1–AC7.

## Safe parallelism

In Mode A, tasks 2, 3 and 4 can run concurrently after task 1 has settled the shared contract and explicit ownership. Their product paths do not overlap. Every writer preserves other agents' edits. Review begins only after writers finish; final verification follows review. In Mode B, primary performs the same tasks inline in dependency order. No implementation starts before task-plan approval and execution-mode selection.

## Focused verification commands

Frontend, from `frontend/`:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.tiers.test.tsx
npm test -- src/features/leads/roomRecommendations.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx
npm run typecheck
npm run build
```

If the existing tier comparison or shared Client recommendation path is affected, run its focused regression suite as well; avoid unrelated broad suites without evidence of a dependency.

Backend, if the read response changes, from `backend/`:

```sh
npm test -- tests/estimator-catalogue-recommendations.replica-set.test.ts
npm run typecheck
npm run build
```

Run relevant API documentation tests only if their schema/inventory changes. Replica-set tests use isolated test infrastructure and do not require restarting the user's application services.

Finish with `git diff --check`, `git status --short` and baseline reconciliation. No lint script exists. Keep logs, synthetic records and screenshots under `/tmp/lisno-estimator-tier-recommendation-qa`; generated build outputs remain ignored.

## Completion criteria

The work is complete only when applicable tiers can be chosen independently of missing method prices, incomplete prices remain unpersistable, configured required recommendations stay visible across tier/PMC choices, unavailable targets remain non-actionable, and integrated tests/builds plus rendered checks pass or any limitation is explicitly reported.

## Settled implementation contract

Mode A selected. The additive read field is `RecommendationRule.targetDisplay?: { name: string; unavailableReason?: "price_not_configured" | "configuration_incomplete" }`, aligned in backend service, frontend API types and OpenAPI. It contains no action authority, prices, unavailable child identities or private configuration. Backend verifies the matching direct target or group/parent before supplying a label; otherwise the UI uses its generic unavailable state. Existing availability/children/counts/version fields remain unchanged. The staff recommendation adapter reuses per-item disabled/message support; the shared actionable recommendation list and client mutation paths remain authoritative.

Initial execution baseline contains only the two approved documents as untracked files; product files are clean at the captured HEAD. Baseline copies, hashes, logs and synthetic QA live under `/tmp/lisno-estimator-tier-recommendation-qa`. The three writers have non-overlapping ownership as listed above.

## Implementation and verification record

Tasks 1–6 completed. Three non-overlapping writers implemented the approved slices; the read-only integrity review found no confirmed defects. Final verification ran after all product writers stopped.

### Changes and acceptance coverage

- **AC1–2:** `ConfiguredEstimateBuilder.tsx`, `configuredEstimate.ts` and `LeadEstimateWorkspace.tsx` share the applicability/source selection guard. The exact selected tier/method still determines pricing. Missing/zero prices clear the previous rate, display Pending and preserve the method. Save draft, navigation saving and submission cannot persist incomplete configured prices; existing historical/manual draft behavior stays intact.
- **AC3–5:** `estimator-catalogue.service.ts` returns optional verified `targetDisplay` metadata; `estimationCatalogueApi.ts` and `openapi.ts` align the read shape. `roomRecommendations.ts` retains unavailable decisions and identity checks; `EstimatorRecommendations.tsx` displays disabled direct/group summary rows alongside valid action rows. Main Line recommendation queries, mutation authority and shared Client actionable mapping remain unchanged.
- **AC6–7:** Focused tests cover current/historical and room/source separation, invalid identity, missing/zero prices, locked/loading states, keyboard tier selection, blocked completion and valid Add/Remove. Browser checks exercised all three tiers with PMC on/off and inspected desktop/mobile rendering. Existing styles and description display are preserved.
- Test changes are limited to the six frontend suites named below and two backend suites. Two obsolete workspace expectations were reproduced against baseline sources before correction: the old Sub-Vendor radio selector and the pre-existing PMC-off Standard classification. Evidence is in `tier-baseline-selector.log` and `tier-baseline-classification.log`.

### Exact checks and results

From `frontend/`:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/roomRecommendations.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx
npm run typecheck
npm run build
```

Results: **7 suites / 225 tests passed**; typecheck and build exited 0. Vite reported a large-chunk warning (>500 kB). Logs: `final-frontend-tests.log`, `final-frontend-typecheck.log`, `final-frontend-build.log`.

From `backend/`:

```sh
npm test -- tests/estimator-catalogue-recommendations.replica-set.test.ts
npm test -- tests/api-docs.test.ts -t 'documents the ready-item catalogue opt-in and mutable-source versions'
npm run typecheck
npm run build
```

Results: **13 replica-set tests passed**, **1 API documentation test passed / 76 nonmatching tests skipped**; typecheck and build exited 0. Replica tests used isolated test infrastructure, not the application database. Logs: `backend-recommendations-tests.log`, `api-docs-focused.log`, `final-backend-typecheck.log`, `final-backend-build.log`.

Rendered verification used `python3 /tmp/lisno-estimator-tier-recommendation-qa/browser-runner.py` and Playwright against the existing frontend synthetic QA entry. Actual components were mounted with synthetic data, and non-GET requests were blocked. All tier/method combinations, exact rates, Pending amounts, stable recommendation labels, disabled unpriced Add and valid Add/Remove passed. Screenshots at 1440×1050 and 390×1000 were inspected; no mobile overflow, application errors, accessibility violations or writes occurred. Axe emitted a preload-assets warning but completed with zero violations. Results: `browser-result.json`; screenshots: `estimator-1440.png`, `recommendations-390.png`. The task's browser session was closed.

Read-only inspection with database auto-create/indexing disabled also confirmed the updated reader returns both saved groups, False Ceiling Functional Lights and False Ceiling Painting, with unavailable reasons and no usable child targets. No Configuration data was edited.

Repository checks: `git diff --check` passed. Hash comparison against the captured baseline found only the expected 16 tracked source/test changes and two approved documents; no additions/deletions outside that set. Evidence: `baseline-reconciliation.json`.

### Limits and artifacts

All logs, baseline copies and synthetic screenshots are temporary outputs under `/tmp/lisno-estimator-tier-recommendation-qa`; build outputs remain ignored under `frontend/dist` and `backend/dist`. No dependencies or lockfiles changed. Full repository test suites and live backend UI integration were not run; focused regression, rendered interaction and both builds/typechecks passed. No lint script exists.

Backend/OCR services remain stopped as requested. The backend must be started to load the updated recommendation response in the running application. No seed, migration, backfill, live-data mutation, commit, push or deployment was performed.
