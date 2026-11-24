# Task plan: Main Line defaults in estimation

The user approved the [specification](../specs/2026-11-23-main-line-show-by-default-design.md) and this task plan on 23 November 2026, then selected Mode A, parallel implementation. The specification remains the source of truth for AC1–AC6.

## Fixed contract

- Overview stores optional boolean `showByDefault`; absent means No. Only explicit `true` enables default display. The setting belongs to the Main Line's revision, across tiers.
- The current catalogue projects an explicit boolean from the latest saved draft, otherwise the saved active revision. An absent draft value cannot fall back to an active Yes.
- Filter unused default preview rows only. Preserve explicit current edits, included rows, saved rows and existing exclusion-review behavior. Add items and recommendations retain access to eligible non-default items.
- Yes does not automatically include an item, assign quantity, change its price, or bypass existing price/tier eligibility. The complete authorized catalogue remains available to source resolvers.
- Web Configuration and web estimation are the UI scope. Native catalogue DTO compatibility is included; native controls and browsing behavior are outside this plan.
- Preserve client visibility, immutable snapshots, configuration-version safeguards, stable IDs and the pending margin implementation. No dependency, migration, seed, commit, deployment or external action is planned.

## Dependency order and ownership

| Task | Deliverable | Owner in Mode A | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| T1 | Capture baseline and establish shared client types | Primary agent | Task-plan approval and execution-mode selection | AC1, AC2, AC5, AC6 |
| T2 | Validate, persist and project the setting | Backend implementer | T1 | AC1, AC2, AC4, AC5, AC6 |
| T3 | Add the Overview control and conflict presentation | Overview frontend implementer | T1 | AC1, AC5 |
| T4 | Filter estimation previews and update list states | Estimation frontend implementer | T1 | AC2, AC3, AC4 |
| T5 | Integrate fixture, save/refresh and compatibility coverage | Primary agent | T2, T3, T4 | AC1–AC6 |
| T6 | Review the integrated result, verify and hand off | Primary agent, integrity reviewer, verification runner | T5 | AC1–AC6 |

T2, T3 and T4 can run concurrently after T1, within the three child-agent slots. The primary owns shared contracts and integration. Keep one parent task in progress; the parallel slices belong to that implementation stage. In Mode B, execute the same tasks inline and perform the review/verification sequentially without subagents. No subagents are started during this planning stage.

### T1. Preserve the baseline and define client fields

**Primary-owned paths:** `shared/knowledge/knowledgeSectionPayload.ts`, `frontend/src/features/leads/estimationCatalogueApi.ts`, `mobile/src/features/estimate-authoring/catalogueTypes.ts`, and this plan's later execution record.

1. Recapture `git status --short`, the tracked diff for every assigned target, and the content of relevant untracked targets before any writer starts. Compare against this planning turn's dirty-path set. Preserve all existing changes; do not stage or reset them.
2. Pay particular attention to dirty backend validation, OpenAPI, item-service and route-test files, and dirty frontend synchronization and `KnowledgeScreens.test.tsx`. Existing margin edits are not owned by this task. Document understood overlap before assigning any such file; if another active writer owns it, sequence that file instead of editing concurrently.
3. Run the focused baseline checks relevant to the assigned slices. Record existing failures separately; do not infer that pending margin work passes from test-file existence.
4. Add `showByDefault` to `KnowledgeOverviewEditableField`. Add optional boolean catalogue DTO fields for older-response compatibility on web and native; consumers treat absent values as No. Generic Overview payload types already admit boolean values and need no separate storage abstraction.
5. Share the fixed contract and file boundaries with the implementation owners. Each child must be told that it is not alone in the worktree, must preserve other edits and must request primary coordination before crossing ownership boundaries.

**Completion:** all owners use the same spelling/default semantics, and dirty target ownership is explicit. Do not change backend routes or catalogue filtering in this task.

### T2. Backend validation, projection and persistence evidence

**Owned production paths:** `backend/src/domain/ai-estimator-knowledge-validation.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, `backend/src/services/estimator-catalogue.service.ts`, and the catalogue-type compatibility boundary in `backend/src/routes/estimates.ts`.

**Owned tests:** `backend/tests/ai-estimator-knowledge-validation.test.ts`, `ai-estimator-knowledge-item.service.test.ts`, `ai-estimator-knowledge-routes.test.ts`, `estimator-catalogue-estimate.replica-set.test.ts`, `estimator-catalogue-recommendations.replica-set.test.ts`, and `api-docs.test.ts`.

1. Accept optional booleans in Overview only, reject invalid types, and document the field/default in OpenAPI. Preserve existing margin-validator changes.
2. Extend `EstimatorCatalogueLine` and its current-revision projection. Emit true only for an actual saved boolean true; emit false for absent/false values. Include regular and temporary items. Do not filter `eligibleCatalogueLines`, catalogue membership, recommendation children or `resolveEstimatorCatalogueLines` by this flag.
3. Keep `savedConfiguredSnapshot` independent of current discovery metadata. Its existing `Omit<EstimatorCatalogueLine, ...>` return type must exclude the new field rather than manufacturing or requiring a historical value. Audit direct catalogue type consumers for the same issue.
4. Exercise the existing section save/copy path with the new flag. Verify true/false round trips, an unrelated edit, active-to-draft copy, duplication, stale section/aggregate versions, immutable active revisions and unauthorized writes. Change the item service only if a concrete preservation failure requires it; coordinate ownership of that dirty file with the primary first.
5. Verify draft false and draft absence override active true; a draft true overrides active false. Use distinct Main Lines/Sub-Baskets and ensure non-default lines remain resolvable for existing estimates and required recommendations.

**Completion:** AC2/AC5 backend checks pass; the field adds no pricing, eligibility or historical-snapshot requirement. No new route-operation permission or database migration is introduced.

### T3. Overview editing and conflict review

**Owned paths:** `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`, `KnowledgeOverviewPanel.test.tsx`, `KnowledgeConflictReview.tsx`, `KnowledgeConflictReview.test.tsx`, and `knowledgeSectionPayload.test.ts`.

1. Add the specified Yes/No radio group immediately after client visibility in Configuration Overview. Use the exact approved label/helper text and existing Radio/layout styles. Include regular and temporary Main Lines and avoid unintentionally adding the control to reused Procurement presentations.
2. Read explicit true as Yes; absent/false as No. Mark only `showByDefault` dirty and update the existing payload. Opening the panel performs no save. Respect saving, permission and revision-read-only states.
3. Add the field to Overview conflict review, showing server Yes/No and handling malformed values without treating them as Yes. Verify that rebasing a flag edit retains current unrelated fields and that an unrelated edit preserves the latest server flag.
4. Cover radio names, keyboard operation, initial/explicit values and disabled states. Reuse the current save and navigation flow; request primary-owned workspace integration changes only if needed.

**Completion:** AC1/AC5 focused rendered and rebase checks pass. This owner does not edit shared types, `KnowledgeScreens.test.tsx`, the workspace save machinery or synchronization files.

### T4. Estimation default-list behavior

**Owned production paths:** `frontend/src/features/leads/salesEstimateCatalogue.ts`, `ConfiguredEstimateBuilder.tsx`, `MainBasketSelectionCard.tsx`, and a narrowly scoped display predicate in `estimationCatalogueVisibility.ts` if useful.

**Owned tests:** adjacent `salesEstimateCatalogue.test.ts`, `ConfiguredEstimateBuilder*.test.tsx`, `MainBasketSelectionCard.test.tsx`, `estimationCatalogueVisibility.test.ts`, and `LeadEstimateWorkspace.catalogue.test.tsx`.

1. Require `showByDefault === true` when producing a new unused catalogue preview. Preserve explicit room drafts, saved/included lines, active inline edits and existing excluded-row review. Keep cross-room and stable-ID checks intact.
2. Retain the existing eligibility checks. Do not add the default flag to `isEstimationLinePriceVisible` or `configuredLineCanInclude` as a blanket requirement: Add items and recommendations reuse those functions and must continue to accept eligible No items.
3. Use the filtered projection for normal table search, group counts and pagination. Keep the explicit item picker's complete eligible catalogue. Do not filter `currentTargets`, saved-row hydration or the data passed to pricing and tier-comparison calculations.
4. Distinguish defaults/selected rows from all available items in count labels. Where basket-selection summaries describe defaults, use the same criteria and label them accordingly rather than silently changing the meaning of an all-items count.
5. Add the approved empty-default message for an otherwise ready group with no defaults or retained rows. Preserve excluded-review messages and distinguish configuration/pricing unavailability, read errors and search misses. Supply an equivalent message for direct temporary-item groups where relevant. Keep Add items reachable.
6. Test true/false/absent and temporary-item cases; a Yes item with unavailable pricing; more than 20 mixed default/non-default rows; independent Sub-Baskets and rooms; and a No item explicitly added or recommended. Check that displayed previews never become included automatically.
7. Update old all-item browsing fixtures by marking only the intended defaults explicitly. Retain mixed and missing-value fixtures so default-No behavior cannot accidentally disappear from coverage.

**Completion:** AC2–AC4 display checks pass. Any required changes to `LeadEstimateWorkspace.tsx`, `configuredEstimate.ts`, shared API DTOs or central fixtures are handed to the primary for integration; this owner does not modify them concurrently.

### T5. Integrated save, refresh and historical behavior

**Primary-owned integration paths:** `KnowledgeItemWorkspacePage.tsx`, `KnowledgeScreens.test.tsx`, `knowledgeMutationSync.ts` and its tests; `LeadEstimateWorkspace.tsx`, `configuredEstimate.ts` and its tests; shared lead test fixtures; `frontend/src/test/fixtures/enterpriseTransport.ts` and related fixture modules/tests. Modify only paths needed by demonstrated integration gaps.

1. Inspect all completed diffs and reconcile types. Confirm the generic Overview save transmits the flag, returns it and retains it after reopening. Add a workspace-level regression using the current save transport.
2. Verify existing section invalidation refreshes estimation catalogue queries. Reuse it if sufficient; do not add redundant requests. Test Yes-to-No and No-to-Yes refreshes without clearing selected rows, explicit edits or focus unnecessarily.
3. Exercise two rooms with unequal items and values: a hidden unused No preview, a newly shown Yes preview, an explicitly added No row, a saved No row and an excluded saved row. Verify stable persisted IDs, quantities, inclusion and totals before/after catalogue refresh and reload.
4. Confirm required/optional recommendation paths still resolve No targets. Verify submitted/historical estimate behavior and source availability. Do not weaken version checks or alter saved financial snapshots to make tests pass.
5. Update central browser/test fixtures only where they intentionally need default previews, using explicit true/false/missing examples. Preserve existing margin fixture edits. Run mobile typecheck to confirm additive DTO compatibility without native UI changes.

**Completion:** all six acceptance criteria have concrete tests or browser scenarios, and all writers have finished before final verification.

### T6. Integrity review, verification and handoff

1. Review the integrated diff for accidental global filtering, source loss, dropped unsaved edits, overwritten Overview fields, stale cache use, changed financial snapshots, incorrect counts and unauthorized mutation. In Mode A use `integrity_reviewer` after writers finish; in Mode B the primary performs this review inline.
2. Resolve confirmed findings with one owner per affected file, then run final verification. In Mode A use `verification_runner` after review fixes are integrated; in Mode B verify inline. Do not treat runs made during concurrent edits as final evidence.
3. Run browser checks for Overview and the Sales estimate table at 390, 768 and 1440 px: keyboard radio selection and save, reopening, loading/error/retry, no defaults, mixed defaults, explicit Add items, a retained saved No row and a flag change followed by catalogue refresh. Inspect console/network errors and horizontal overflow. Use isolated test data or the existing fixture transport, never production data or seed scripts.
4. Record acceptance results, exact checks, baseline versus introduced failures, unrun checks and remaining risks. Report temporary browser/build output paths and remove disposable artifacts created by this task when practical. Do not touch another task's outputs or commit generated files.
5. Inspect final `git diff --check` and `git status --short` against the captured baseline. Hand off the result without commits, deployment, migration or external writes.

## Verification commands

Run focused checks first from the indicated workspace. The backend service and catalogue suites below use the repository's Mongo replica-set test harness; retain those transaction semantics.

```sh
# backend/
npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimator-catalogue-recommendations.replica-set.test.ts tests/api-docs.test.ts

# frontend/
npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeSectionPayload.test.ts src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx
npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/MainBasketSelectionCard.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/configuredEstimate.test.ts
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/knowledgeMutationSync.test.ts
```

Run any additional focused suites actually affected by integration. After focused checks pass, run the approved full lane on the integrated tree once; rerun only checks justified by later edits or failures:

```sh
# backend/, then frontend/ separately
npm run typecheck
npm test
npm run build

# mobile/
npm run typecheck

# repository root
git diff --check
git status --short
```

No lint command is defined. Do not report lint as passed. The commands above are the implementation verification plan; completed checks are recorded below.

## Acceptance-to-task trace

| Acceptance | Primary tasks | Required final evidence |
| --- | --- | --- |
| AC1: Overview control and persistence | T1–T3, T5 | Accessible regular/temporary controls; saved true/false reopen; read-only/saving states; responsive checks. |
| AC2: Explicit defaults and current revision | T2, T4 | Draft/active precedence; mixed true/false/missing records; price/tier eligibility retained. |
| AC3: Default list states | T4, T6 | Search/count/page behavior and accurate empty states; no automatic inclusion or amount changes. |
| AC4: Existing work and explicit selection | T2, T4, T5 | Saved/unsaved/excluded rows retained; No items usable via Add items and recommendations; historical behavior preserved. |
| AC5: Validation and concurrency | T1–T3, T5 | Invalid types rejected, CAS/authorization/history enforced, field rebase/copy/duplicate/conflict behavior verified. |
| AC6: Refresh and integration | T2, T5, T6 | Catalogue invalidation and full source resolution retained; integrated tests/builds/typechecks and reviewed diff. |

## Execution record

- Specification approved: 23 November 2026, user response “Approved”.
- Task-plan approval: 23 November 2026, user response “Approved”.
- Execution mode: A, parallel sub-agents, explicitly selected by the user.
- T1: complete. Baseline status, patch and 72 relevant file snapshots captured under `/tmp/lisno-show-by-default-20261123/`; shared/client field types added.
- Baseline frontend: 6 focused files, 170 tests passed (Overview, rebase, conflict review, Sales catalogue, builder and catalogue workspace).
- Baseline backend: 263 passed, 2 failed across validation, routes and OpenAPI. Existing failures are Procurement basket creation expecting 201 but receiving 403, and the OpenAPI Mode-tier enum test expecting three tiers while the schema includes `default`. These occurred before this feature's code changes.
- T2–T5: complete. Backend validation/projection, Configuration Overview, conflict/rebase, estimator previews, explicit Add items, saved-row preservation and catalogue invalidation are implemented. The existing save path and source resolution remain in use.
- Integration correction: browser inspection found the shared saved-summary projection treated the new field as legacy data. It now recognizes saved Yes/No values and identifies malformed values explicitly; three regressions cover this behavior.
- Recommendation fixture migration: five lines used as intentional default previews now carry explicit true. Recommendation targets retain absent/false coverage. The complete recommendation suite passes (23 tests), including a new explicit false required target with preserved quantity, rate and lineage.
- Integrity review: no outstanding defects after initial integrated review and the bounded saved-summary follow-up review.
- Focused evidence: backend affected suites 522 passed and the same three baseline failures (the two above plus reopened-induction Budget rejection); 13 new backend cases pass. Frontend final focused 8-suite lane 245 passed; saved-summary/recommendation follow-up 75 passed. Four workspace save/reopen cases pass for regular and temporary Main Lines.
- Backend, frontend and mobile typechecks pass. Backend and frontend production builds pass. The frontend build still reports large-chunk warnings. No lint command was run.
- Full frontend run: `npm test -- --maxWorkers=2 --reporter=json --outputFile=/tmp/lisno-show-by-default-20261123/frontend-full-final.json` exercised 7,461 tests (7,316 passed, 145 failed before the final fixture corrections). The isolated initial baseline has 108 failures across 16 files. All 37 additional failures are accounted for: 33 old preview/copy/picker assumptions corrected in four estimate-workspace fixture suites; three saved-summary cases observed the earlier shared-module import and pass after the summary fix; one unrelated language-picker timing failure passed on rerun.
- Final frontend corrective verification: four migrated workspace suites, 138 passed / 2 exact baseline manual-rate failures; saved-summary plus recommendations, 75 passed; AdminProjectInitiationDialog, 43 passed. Final frontend typecheck passes. These full-run and focused results leave no unresolved additional frontend failure. The whole repository frontend suite is still not green because of the 108 baseline failures.
- Full backend run: `npm test -- --maxWorkers=2 --reporter=json --outputFile=/tmp/lisno-show-by-default-20261123/backend-full-final.json`, 388 files, 8,006 passed / 61 failed / 24 skipped (8,091 tests). The three previously recorded failures match the initial baseline. An isolated initial-worktree rerun of the other 13 failing files produced 417 passed / 58 failed; its exact failure-name set matches all 58 additional full-run failures, with no setup/import errors. All 61 failures are therefore reproduced in the initial baseline; no new backend failure remains unresolved.
- Browser evidence: local synthetic transport at 390, 768 and 1440 px, Overview keyboard Yes/No selection/save/reopen, estimator mixed defaults, no-default empty state, explicit No addition/save, saved No retained during refresh, new Yes preview after refresh, and loading/error/retry preservation. No document overflow or application console errors in these scenarios. Axe reported no violations on checked Overview and estimation states; it emitted an asset-preload warning. The new default preview remained unchecked with zero included total.
- Browser screenshots were captured under `output/playwright/main-line-defaults/` and then moved out of the worktree to `/tmp/lisno-show-by-default-20261123/browser-screenshots/`; task-only CLI logs/snapshots are in the adjacent `browser-cli/` folder. Test logs and baseline snapshots share that temporary root. The browser used synthetic local data only; the task's browser and Vite sessions have been closed.
- T6: complete. All required builds/typechecks and full suites ran; corrective tests and baseline comparisons are recorded above. Final `git diff --check` passes. Runtime artifacts were moved out of the worktree, and the task diff preserves the initial margin work. No outstanding feature defect was found; the full repository suites remain non-green because of baseline failures.
- Scope limits: browser checks use synthetic transport, backed by service/HTTP and Mongo replica-set regressions. Native UI/runtime and OCR suites were not run because their behavior is outside scope. The backend full run retained its 24 skipped tests. No dependency, migration, seed, commit, push, deployment or production mutation performed.

### Local runtime follow-up: rejected Overview save

- The user reported HTTP 400 with `payload.showByDefault: Field showByDefault is not valid for overview.` Current source and compiled validation both allow that field, but the running localhost API's OpenAPI document contained no `showByDefault` schema.
- The local backend was an earlier process launched through `scripts/local-chat.mjs --with-ocr`. This source entrypoint does not watch for changes, so the implementation build did not replace its in-memory validator.
- Gracefully stopped the identified local supervisor and restarted the same `npm run dev` command. This existing entrypoint binds to loopback and skips demo account provisioning. No seed, migration or user Configuration save was performed.
- Verified the restarted `http://127.0.0.1:3000/openapi.json` responds and now exposes the boolean field in both Overview and catalogue schemas. No application source change was needed. The development service remains running for the user's retry; its restart log is `/tmp/lisno-show-by-default-20261123/local-backend-restart.log`.
