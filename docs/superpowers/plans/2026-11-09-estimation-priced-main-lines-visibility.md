# Configuration-owned estimation pricing and tier availability task plan

Date: 2026-11-09
Status: expanded specification and task plan approved; Mode A selected. D0–D6 complete; AC1–AC7 verified. Earlier C/T test counts apply to prior scopes.

Source of truth: [approved revised specification](../specs/2026-11-09-estimation-priced-main-lines-visibility-design.md).

## Outcome and boundary

Use Configuration-owned prices in estimation, disable price entry, enable only tiers with their own usable positive price, and evaluate Standard/Sub-vendor independently from Special pricing methods. One positive relevant-method base across the four Configuration scopes qualifies visibility. Preserve existing data and formulas. No redesign, new pricing selector, dependencies, migration, seed or production action.

Only this task-plan file is updated at this gate. Implement after plan approval and a new execution-mode choice. D0–D6 below are the current plan; prior C/T tasks and results are historical and must not be reused as verification of this scope. Keep one parent task in progress.

## D0. Preserve work and publish the shared contract

Owner: primary agent. Depends on task-plan approval and A/B execution choice.

- Snapshot the initial dirty paths, per-target diffs and relevant untracked files before writers. The existing 33 dirty paths contain authorized earlier feature work; preserve all of it.
- Add an authoritative response field named `basePriceAvailability`: a four-scope map (`default`, `signature`, `premium`, `functional`), each containing boolean `pmc`, `sub_vendor`, `in_house` values. Each true means that exact scope/method has a validated positive base under existing complete-cost/reference rules. No private raw costs are added to the response.
- Retain `hasConfiguredBasePrice` as the any-scope/any-method aggregate. It alone cannot prove Standard eligibility. Keep the new metadata out of estimate mutation payloads and stored financial snapshots.
- Settle the type/export names and root-owned frontend transport/draft propagation before handing those files to the frontend writer. The backend metadata writer owns its helper/service declarations; communicate the exact matrix contract before parallel writers start.
- For legacy responses without the new map, a valid positive final price for the matching method/tier may establish eligibility; an aggregate true alone or a null/zero price must not. A failed/loading read retains established error/review handling. Do not change historical money validation to implement discovery checks.

Root owns product interpretation, this contract, the integration, documents, OpenAPI alignment and runtime reconciliation. Child owners must preserve other writers' changes and cannot cross their boundaries without coordination.

Acceptance: AC1–AC7 prerequisites.

## D1. Project scope/method availability and align backend discovery

Owner: one `backend_implementer` in Mode A; primary agent in Mode B. Depends on D0; may run alongside D2/D3 once the contract is published.

Exclusive scope: `backend/src/domain/estimation-base-price-visibility.ts`, `estimator-catalogue.service.ts`, quotation candidate/setup/recommendation services, and their corresponding helper/recommendation/quotation tests. Do not edit `routes/estimates.ts`, its catalogue-estimate/tier integration tests, or root-owned OpenAPI files.

1. Produce the matrix from latest saved draft, otherwise active, using the existing four-scope projection and batched component reference checks. Keep zero parts in positive complete totals valid; reject zero-only/invalid/unavailable totals. Preserve all source rows and financial tier enumeration.
2. Staff new Standard targets use matching Sub-vendor eligibility; existing selected sources/targets remain available for review and use their saved method in the frontend. Keep required-unavailable obligations and full-list completion accurate. Do not borrow a PMC-only base for Standard.
3. Client candidates expose only usable configured choices for their actual tier/method; keep server filtering before pagination/counts, selected-source lineage and permissions. Do not post-filter Client pages in the UI.
4. Add targeted fixtures for PMC-only Standard rejection, each sole positive scope/method, Signature zero plus Premium positive, default-only visibility, positive bases with unusable selling settings, component/reference validity, and current-draft refresh. Retain shared-assistant/source behavior.

Acceptance: AC1–AC3, AC5–AC6.

## D2. Enforce Configuration price ownership at estimate saves

Owner: a second `backend_implementer` in Mode A; primary agent in Mode B. Depends on D0; independent of D1 writes.

Exclusive scope: `backend/src/routes/estimates.ts`, a bounded pure `backend/src/domain/estimate-price-ownership.ts` helper/test if needed, `estimator-catalogue-estimate.replica-set.test.ts`, and `estimate-tiers.replica-set.test.ts`. D1 supplies the availability contract; do not edit D1 service/helper files. Update the historical snapshot `Omit` for additive current metadata without fabricating it on history.

1. Preserve existing route-operation authorization, CAS/version checks, transactional source fences, audit and immutable approvals. Price editing is not a new role/route permission.
2. Reject new/altered manual or forged prices with `400 ESTIMATE_PRICE_READ_ONLY`, including explicit `rateSource: manual`, omitted-origin override attempts, component-calculated overrides and newly manufactured legacy rows. A newly selected/tier-changed/method-changed configured item must use its current valid positive Configuration price and existing calculation fingerprint/version checks.
3. Allow unchanged saved legacy/manual snapshots only through a bounded exception: an explicit saved line ID resolves once to the same prior row in this estimate; stable room/Main Line/basket/sub-basket/UOM/item identity and pricing basis (tier, method, classification and component selection) remain unchanged; the submitted rate equals the actual saved rate; revision metadata belongs to the real prior snapshot or current source, never a fabricated revision. Reject duplicate ID reuse or a copied ID used for another source/room. Use existing unit conversions and validation.
4. Preserve already saved zero-valued/history records rather than inventing a new rate or migrating data. Removal remains possible. Re-including an unavailable item or choosing a different pricing basis must use an eligible current configured price; the compatibility exception cannot create a new override path.
5. A permitted tier/method/component change switches to Configuration sourcing. Do not accept a changed manual rate merely because another price exists elsewhere. Keep quantities, dimensions, totals, GST and rounding formulas intact.
6. Test ordinary authorized Sales/Designer callers, forged manual/legacy identities, altered or omitted origins, unavailable tiers, changed components, positive legitimate configured saves, unchanged old snapshots and immutable approved history. Adjust only earlier manual-entry expectations deliberately superseded by the approved requirement; seed legacy states only inside isolated test fixtures.

Acceptance: AC3–AC5; no price-setting endpoint or authorization expansion.

## D3. Apply method-aware UI conditions and disable rate entry

Owner: one `frontend_implementer` in Mode A; primary agent in Mode B. Depends on D0 contract; may run alongside D1/D2 after root's initial shared-type handoff.

Exclusive frontend scope: `estimationCatalogueVisibility.ts`, `configuredEstimate.ts` after handoff, `salesEstimateCatalogue.ts`, `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, `MainBasketSelectionCard.tsx`, `roomRecommendations.ts`, the existing legacy estimate builder only if it exposes a price-edit path, and focused tests for these modules. Do not edit backend paths or root-owned Client transport/integration files.

1. Propagate the matrix through fresh and refreshed drafts, including preserve-snapshot branches. Keep it out of serialized mutations. Standard uses Sub-vendor; an existing Special row uses its selected method. Evaluate existing saved rows before applying a new-choice Standard default so a legitimate Special selection is not misclassified.
2. Apply the matching-method predicate consistently to normal/compact lists, search, picker/Add handlers, recommendation targets, temporary rows and counts before paging. Preserve selected/saved records outside ordinary eligible rows and keep Remove/review access.
3. Enable a tier only when applicable and its own method has a positive base and usable configured selling price/components. Zero/missing/incomplete tiers are disabled with a reason. Keep current permission locks and accessible radio states.
4. New previews choose the first usable financial tier in Signature/Premium/Functional order and display its price. A default-only positive base can keep discovery visible but cannot enable a financial tier or Add. No default/PMC/Signature fallback or automatic Special classification.
5. On explicit permitted tier/method/component selection, use the matching configured calculation and configuration origin. Preserve invalid saved choices in review until the user chooses a valid replacement; do not silently replace saved amounts while loading/filtering.
6. Disable every estimation rate input and remove manual-rate change handlers/override hints/actions. Keep the configured or calculated price visible, including a calculated component rate. Do not disable quantities/dimensions/components or otherwise change their permissions. Saved manual rates remain displayed as preserved snapshots without an edit affordance.
7. Guard local handlers against unavailable tiers and rate-input changes even when an event is triggered programmatically. Keep backend authorization authoritative and preserve fresh/stale/error states, recommendation completion and query invalidation.
8. Rendered regressions cover distinct tier prices, Standard versus PMC-only data, zero/absent tiers, Premium-only defaults, disabled rate entry by mouse/keyboard, component selection, preserved saved/historical values, no visibility-triggered writes, and compact/search/picker/count consistency. Do not rewrite financial helper tests merely because historical zero remains valid.

Acceptance: AC1–AC6. No style or layout redesign.

## D4. Integrate contracts, Client consumers and API descriptions

Owner: primary agent. Depends on D1–D3 for final reconciliation; independent root-owned description/test preparation can run concurrently.

Root-exclusive paths: specification/plan, `backend/src/openapi.ts`, `backend/src/openapi/quotation.ts`, public error descriptions, `quotation-openapi.test.ts`, and Client transport/presentation/tests only where they directly consume the changed choice/review contract. Initial root edits to shared frontend transport/draft fields finish before handoff to D3.

- Align public matrix/default/method meanings, read-only pricing semantics and `ESTIMATE_PRICE_READ_ONLY`; keep historical response shapes compatible.
- Verify Client choices remain Configuration-owned, permission-scoped and server-paginated. Do not introduce a new Client interaction or screen.
- Review every changed consumer and mutation payload against the contract. Confirm pricing formulas, stable IDs, source preservation, prior tier info/comparison placement, and recommendation auto-close guards remain intact.
- Resolve integration/test failures within the requested slice, freeze product sources, then start review. Do not let tests observe concurrent final source edits.

Acceptance: integrated AC1–AC6.

## D5. Integrity review and focused final checks

Owner: `integrity_reviewer`, then `verification_runner` in Mode A after all writers finish; primary agent sequentially in Mode B.

Review the correction delta against D0's snapshot: matrix truth per scope/method, OR across modes, tier/default boundaries, read-only UI and server enforcement, legacy-exception identity/version safety, saved/history amounts, components/quantity calculations, authorization, counts and recommendation obligations. Resolve confirmed findings before final checks.

From `backend/`, run affected focused lanes, split where useful:

```sh
npm test -- tests/estimation-base-price-visibility.test.ts tests/estimate-mode-pricing.test.ts --maxWorkers=1
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimator-catalogue-recommendations.replica-set.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-openapi.test.ts tests/project-assistant-data.replica-set.test.ts --maxWorkers=1
npm run typecheck
npm run build
```

Include the bounded price-ownership helper tests and any actually changed permission/save-path regressions. Use existing ephemeral replica sets and permitted local listener execution; do not weaken transactions or run seed/migration scripts. Reuse successful checks on identical frozen sources rather than repeating them for counts.

From `frontend/`, run the prior T5 14-file focused lane below plus `LeadEstimateWorkspace.tiers.test.tsx` and `ClientEstimateTiers.test.tsx`, and any new focused availability/price-lock tests. Then run `npm run typecheck` and `npm run build`. Broaden only for changed consumers or a demonstrated unresolved failure; Configuration editing/OCR/other screens remain outside this change. No lint script exists.

Acceptance: AC1–AC7 verification evidence; exact commands/results and unrun checks recorded without reusing old 578/638 totals.

## D6. Check the actual local runtime and hand off

Owner: primary agent. Depends on final source freeze; rendered checks may run alongside D5's independent command lanes.

- The local source backend is not watched. Gracefully reload the existing no-seed local launcher after changes, retain its existing assistant/OCR setup, and leave the user's local services available. Never seed or edit the reported Configuration to make the test pass.
- Verify the live catalogue contract includes the new matrix. Through an authorized local read, verify the reported Royal Emulsion source: Signature PMC positive does not grant Standard/Sub-vendor availability. Verify the normal estimator list/compact/search/Add path, not only a helper predicate. Do not forge tokens or bypass application access; request only genuinely missing test access if required.
- Desktop/mobile checks: Royal Emulsion absent as an eligible Standard item; Signature zero/Premium positive uses Premium correctly; unavailable tiers disabled; price inputs disabled; existing saved invalid rows retained in review with original values; quantities, permitted selections and configured calculations work; no unexpected network/mutations or overflow. Use safe synthetic data for additional asymmetric states and do not expose customer data in screenshots/logs.
- Run `git diff --check` and inspect final status/diff against D0. Clean only task-owned fixtures/screenshots/browser artifacts, retain normal local app services, and report ignored build outputs/log paths.
- Update durable status/results and hand off the outcome, changed areas, exact checks/warnings/unrun checks, runtime reload, no migrations/deployment/commits, and any material limitations. Do not claim the live screenshot issue fixed without the real-source/runtime check.

Mode A order: D0 contracts → D1 metadata/backend discovery, D2 save guard and D3 frontend in parallel → D4 integration → D5 sequential review then verification, with D6 runtime/rendered checks after source freeze → final reconciliation. Mode B performs all steps inline without implementation subagents. Do not spawn new-scope subagents until A is selected.

## Configuration-owned pricing execution record

The three implementation owners used the D0 contract and separate backend projection, backend save-guard, and frontend paths. Root owned transport/schema alignment, integration, documents and runtime verification. The pre-writer snapshot of all 33 dirty files is `/tmp/lisno-configured-pricing-20261109-baseline/`; previous feature work was preserved.

Current responses include `basePriceAvailability`, a boolean matrix for four Configuration scopes and three pricing methods. Standard discovery uses Sub-vendor; existing Special rows use their own method. Positive prices in another tier qualify only for the matching method. Each tier requires its own positive usable price; new choices use the first usable financial tier and default-only sources cannot invent a financial price. All estimation rate inputs and override handlers are disabled/removed. Estimate saves reject new or changed manual overrides with `ESTIMATE_PRICE_READ_ONLY`; exact unchanged saved snapshots retain bounded identity/version compatibility.

Principal production areas: `backend/src/domain/estimation-base-price-visibility.ts`, new `estimate-price-ownership.ts`, catalogue/quotation/tier services, the existing estimate save route and OpenAPI descriptions; frontend catalogue/draft types, `estimationCatalogueVisibility.ts`, `configuredEstimate.ts`, catalogue/basket/recommendation consumers, `ConfiguredEstimateBuilder.tsx`, and `LeadEstimateWorkspace.tsx`. No financial formula, shared zero-money validation, Configuration price-setting permission, schema collection, dependency or lockfile changed.

Integrated integrity review identified and closed three concrete compatibility defects: real legacy IDs now survive the UI round trip independently of synthetic row IDs; excluded component rows retain genuine saved pricing evidence even after current Configuration changes; and only proven unchanged excluded snapshots bypass current component validation/fences, while active/altered/reincluded rows remain guarded. A final recovery case also passed: a saved excluded Signature-zero/Premium-positive row can explicitly choose Premium, stay in existing review even in a compact basket, then Include and save the configured price. Review confirmed context/permission guards and no automatic inclusion or financial mutation.

### Current verification results

The complete backend command on frozen sources was:

```sh
npm test -- --maxWorkers=1 tests/estimate-price-ownership.test.ts tests/estimation-base-price-visibility.test.ts tests/estimate-mode-pricing.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimator-catalogue-recommendations.replica-set.test.ts tests/quotation-edits.replica-set.test.ts tests/quotation-openapi.test.ts tests/project-assistant-data.replica-set.test.ts
```

It passed **377 tests across 9 files**, exit 0, with ephemeral local replica sets and no environment failures. Backend `npm run typecheck` and `npm run build` passed, exit 0, without warnings. Logs: `/tmp/lisno-configured-pricing-final-backend-{focus,typecheck,build}.log`.

The expanded frontend focus ran the prior T5 14 paths plus `estimationCatalogueVisibility.test.ts`, `LeadEstimateWorkspace.tiers.test.tsx`, `LeadEstimateWorkspace.test.tsx`, `LeadEstimateWorkspace.checklist.test.tsx` and `ClientEstimateTiers.test.tsx`, all with `--maxWorkers=1`. It passed **379 tests across 19 files**, exit 0. Both frontend typecheck/build passed at that freeze. Logs: `/tmp/lisno-configured-pricing-final-frontend-{focus,typecheck,build}.log`.

After the last bounded excluded-tier recovery change, only Builder, Workspace and Workspace-tier tests differed from that baseline. Final affected checks on the new freeze were:

| Command from `frontend/` | Result | Evidence |
| --- | --- | --- |
| `npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx --maxWorkers=1` | 71 tests / 2 files passed, exit 0 | `/tmp/lisno-configured-pricing-ui-excluded-tier.log` |
| `npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx --maxWorkers=1` | 57 tests / 1 file passed, exit 0 | `/tmp/lisno-configured-pricing-final-frontend-recovery-workspace-frozen.log` |
| `npm run typecheck` | Passed, exit 0 | `/tmp/lisno-configured-pricing-ui-excluded-tier-typecheck.log` |
| `npm run build` | Passed, exit 0; 3346 modules, 9.50s | `/tmp/lisno-configured-pricing-final-frontend-recovery-build-frozen.log` |

These affected reruns overlap the baseline and are not added to 756 as an inflated new test total. The backend was unchanged and its 377-test/typecheck/build results remain current. Final verification hashes confirmed all 41 source/test paths unchanged throughout the accepted recovery checks. An earlier build interrupted when the freeze was withdrawn is excluded from accepted evidence. Final `git diff --check` and status inspection passed; source/test/document paths remain in requested scope.

### Running estimator verification and cleanup

The existing local no-seed launcher was reloaded after backend changes and left running with its existing assistant/OCR setup. The Vite frontend and local database were preserved. Normal demo Sales sign-in used the application login flow, with credentials/tokens omitted from output; state-changing estimate requests were blocked during inspection. No application authorization was bypassed and no Configuration or estimate data was edited to make the check pass.

The live authenticated catalogue returned HTTP 200 and the reported Royal Emulsion Main Line's actual matrix: Signature PMC positive, Standard/Sub-vendor false in every scope. On a normally owned editable draft in the item's saved room, the ordinary Painting list contained **zero** Royal Emulsion rows; the genuine included saved row remained in review. Its price input was disabled, quantity remained editable, and all three unavailable Standard tiers were disabled. Approved/read-only older estimates were correctly preserved and were not used as proof of draft filtering.

Desktop 1440×1000 and mobile 390×844 inspection confirmed the same disabled controls and no horizontal page overflow. The existing recommendation dialog was closed for inspection; no popup behavior was changed. The bounded mobile pane uses its existing internal scrolling. Additional rendered regressions verify distinct tier prices, Premium-only defaults, price-entry prevention, component calculation/rounded-zero amounts, source freshness, genuine saved payloads, disabled tiers, and explicit recovery without unexpected writes.

Task-owned browser authentication was cleared, the browser closed, and `backend/.playwright-cli/` plus `backend/output/playwright/configured-pricing-1109/` were removed after inspection. The local app remains available; startup output is `/tmp/lisno-configured-pricing-runtime.log`. Test logs and the preservation snapshot remain under `/tmp/`.

The only accepted build warning is the existing frontend chunks-over-500-kB warning. Full unrelated suites and OCR tests were not run under D5; no lint script exists. Ignored outputs remain at `backend/dist/`, `frontend/dist/`, and frontend TypeScript build-info paths. No migration, seed, backfill, dependency installation, production deployment, staging, commit, push or external communication was performed. No confirmed review finding remains open.

## Prior plans and evidence (historical)

The sections below record earlier scopes, approvals and results. The revised specification and D0–D6 above govern the current implementation.

## Previous positive-base correction tasks (historical)

This section is the current execution plan. The original T0–T5 plan and its completed verification below are retained as historical evidence; their zero-qualifies assertions are superseded by the approved revised specification. Do not repeat the original wiring or extend scope.

### C0. Preserve the existing implementation and settle the bounded change

Owner: primary agent. Depends on plan approval and a new A/B execution choice.

- Capture the dirty-path set, tracked diff, and contents of relevant untracked targets before writers start. All prior feature changes remain uncommitted and must be preserved.
- Keep `hasConfiguredBasePrice` as the existing discovery field. Its authoritative meaning becomes a validated base greater than zero in any of the four current saved scopes. The optional frontend compatibility path remains unchanged.
- Reuse existing validation, latest-draft selection, retained tiers, and reference availability. Do not change the shared financial helper's `>= 0` rule, selling formulas, estimation tier enumeration, mutation validation, or persisted values.
- Publish the ownership boundaries below. Only one correction parent task is in progress at a time.

Acceptance: AC1–AC5 contract and preservation prerequisites.

### C1. Correct authoritative eligibility and backend coverage

Owner: one `backend_implementer` in Mode A; primary agent in Mode B. Depends on C0; may run alongside C2.

Exclusive files: `backend/src/domain/estimation-base-price-visibility.ts`, its unit test, and the directly affected catalogue/recommendation/quotation replica tests. Do not edit C2 or root-owned paths.

- Require a non-null validated base greater than zero. For In-house components, require an available, valid component with a positive total. Complete split/component totals may contain a zero part when their total is positive.
- Cover zero-only and zero/missing combinations in each of the four scopes, positive one-paise values, a positive scope alongside zero scopes, all-zero combined/split/components, unavailable references, and positive totals with one zero part.
- Assert the current catalogue flag is false for zero-only sources while preserving the full source record; confirm positive-to-zero and zero-to-positive current-revision refresh.
- Cover discovery filtering/counts and required recommendation review for zero-only targets. Keep selected source obligations and existing zero-valued saved/mutation semantics intact. Update only old visibility assertions that conflict with the new requirement.

Acceptance: AC1–AC5. Report exact changed files and focused checks.

### C2. Align visible explanations and frontend regressions

Owner: one `frontend_implementer` in Mode A; primary agent in Mode B. Depends on C0; may run alongside C1.

Exclusive files: `ConfiguredEstimateBuilder.tsx` and its directly affected tests; `salesEstimateCatalogue.test.ts`; `MainBasketSelectionCard.test.tsx`; `LeadEstimateWorkspace.catalogue.test.tsx`; `LeadEstimateRecommendations.test.tsx`; `roomRecommendations.test.ts`; and `ClientQuotation.recommendations.test.tsx` only where matching copy or zero-visibility coverage requires it.

- Update directly affected review explanations to say no positive base is configured, including the excluded saved-item explanation. Retain the existing layout, selected-item review, accessible controls, and recommendation auto-close state machine.
- Replace misleading zero-qualifies visibility fixtures with authoritative false metadata for zero-only items. Cover zero-only list/search/picker/count exclusion, positive metadata from any mode, selected zero-only review, and visibility refresh without Add/Update/Remove/save/submit side effects.
- Continue trusting backend metadata. Do not infer eligibility from the displayed selling rate; another scope can have a qualifying positive base while the selected selling rate is zero or missing. Preserve manual and historical zero-rate display/validation tests.

Acceptance: AC1, AC2, AC4–AC6.

### C3. Reconcile descriptions, messages, and integrated scope

Owner: primary agent. Depends on C1/C2 for final integration; independent copy edits may run concurrently.

Root-exclusive paths: specification/plan records, `backend/src/openapi.ts`, `backend/src/openapi/quotation.ts`, and the directly matching review-message string in `backend/src/services/quotation-recommendations.service.ts`. Coordinate any related API assertion changes rather than overlap a writer.

- Describe `hasConfiguredBasePrice` as positive-base eligibility and explicitly exclude zero. Align the Client recommendation review message and matching backend assertions with that meaning.
- Inspect the correction delta against C0. Confirm no new API field, pricing fallback, financial validation, selection mutation, dependency, or unrelated product change.
- Confirm source records and saved/historical values remain available and ordinary discovery is consistently driven by the corrected flag.

Acceptance: integrated AC1–AC5 and matching API/UX descriptions.

### C4. Read-only integrity review

Owner: `integrity_reviewer` in Mode A; primary agent in Mode B. Depends on all correction writers finishing.

Review the correction delta: zero-only rejection across all scopes/methods; positive totals with zero parts; reference and revision validity; unchanged financial zero handling; saved/source preservation; filtered counts; required recommendation review; and no writes caused by visibility. Resolve confirmed defects before final verification.

### C5. Verify and hand off the correction

Owner: `verification_runner` in Mode A after C4; primary agent in Mode B. Sources are frozen for final checks. Use the backend commands in the original T5 below (base/pricing units, four replica suites, OpenAPI/shared assistant, typecheck/build). For the frontend, use the original T5 14-file focused lane plus frontend typecheck/build. The original separate four-file preservation lane need not be repeated unless new evidence warrants it; Configuration editors are unchanged.

- Trace zero-only/mixed/one-paise/split/component/current-revision tests to AC1–AC3 and AC5; saved amounts/source/recommendation tests to AC4; checks and rendered evidence to AC6.
- Run desktop/mobile rendered checks using synthetic data in the actual builder: a zero-only Main Line absent from ordinary list/search/Add choices; positive metadata visible; zero-to-positive and positive-to-zero refresh; existing selected zero-only item in review with unchanged quantity/rate/inclusion/totals; no unintended mutation or overflow. Use existing rendered regression tests for matching required-suggestion review behavior.
- Use local ephemeral replica sets and approved local listener escalation if sandbox restrictions recur. No seed, migration, live data access, production mutation, or deployment.
- Run `git diff --check`, inspect final status/delta against C0, stop task-owned sessions, and remove only task-owned browser artifacts. Record exact command results, warnings, unrun checks, ignored build outputs, and remaining limitations. Do not reuse the previous 638-test result as evidence for this correction.

Mode A ordering: C0 → C1/C2 in parallel with root-owned copy alignment → C3 integration → C4 integrity review → C5 verification. In Mode B, the primary agent performs every stage inline without implementation subagents. Do not spawn correction subagents before the user chooses A.

## Positive-base correction execution record

The correction changes the two discovery comparisons in `backend/src/domain/estimation-base-price-visibility.ts` to require a base/component total greater than zero. The other production edits only align OpenAPI descriptions, the Client required-item review message, and the builder's review text. No financial helper, price formula, compatibility fallback, saved payload, or mutation logic changed. Existing feature work was preserved against the 33-file snapshot at `/tmp/lisno-positive-base-20261109-baseline/`; no new repository paths remain.

Backend and frontend writers used non-overlapping ownership. Root finished matching assertions in the three existing builder/workspace/recommendation test files. The independent integrity review found no confirmed defects; product sources remained frozen for final verification.

| Check | Result | Log under `/tmp/` |
| --- | --- | --- |
| Base/pricing units | 2 files, 66 passed | `lisno-positive-base-backend-units.log` |
| Catalogue/recommendation/quotation replicas | 3 files, 201 passed | `lisno-positive-base-backend-replicas.log` |
| Backend typecheck | Exit 0 | `lisno-positive-base-backend-typecheck.log` |
| Remaining backend tier/OpenAPI/assistant tests | 3 files, 63 passed | `lisno-positive-base-final-backend-remaining-local.log` |
| Backend build | Exit 0; no warnings | `lisno-positive-base-final-backend-build.log` |
| Frontend T5 14-file focused lane | 14 files, 248 passed | `lisno-positive-base-final-frontend-focus.log` |
| Frontend typecheck | Exit 0 | `lisno-positive-base-final-frontend-typecheck.log` |
| Frontend build | Exit 0; existing chunk-size warning | `lisno-positive-base-final-frontend-build.log` |

Total: **578 passing tests across 22 files**, backend 330/8 and frontend 248/14. The final verifier reused the successful 66-unit/201-replica/typecheck evidence on unchanged, frozen backend sources. The original T5 commands were used, splitting the integration/contract work into these actual commands from `backend/`:

```sh
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimator-catalogue-recommendations.replica-set.test.ts tests/quotation-edits.replica-set.test.ts --maxWorkers=1
npm test -- tests/estimate-tiers.replica-set.test.ts tests/quotation-openapi.test.ts tests/project-assistant-data.replica-set.test.ts --maxWorkers=1
```

The remaining backend command initially hit sandbox listener `EPERM` (7 tests passed, 56 skipped); the identical permitted local-listener execution passed all 63. The environment-only failed-attempt log is `/tmp/lisno-positive-base-final-backend-remaining.log`. There are no product failures in the scoped lanes.

Rendered checks used the actual builder with synthetic data at 1440×1000 and 390×844. The zero-only Royal Emulsion fixture was absent from ordinary list/search and Add choices; toggling the first positive base made it appear and changing it back to zero hid it. The saved zero-only fixture remained in review, included, quantity 3, manual rate ₹7.25, total 2175 paise. Recorded Add/Update/Remove/network calls were all zero; only the two explicit synthetic metadata refreshes ran. Both viewports had no horizontal page overflow. Task-owned browser/Vite sessions were stopped and the fixture/screenshots/CLI files removed.

AC1–AC3/AC5 are covered by four-scope zero-only/one-paise/mixed-base, valid split/component totals, current-revision, list/search/picker/count, and recommendation regressions. AC4 is covered by preserved saved/source records, zero-valued financial tests, selected review, and required-item review. AC6 is covered by both typechecks/builds, rendered checks, integrity review, and final `git diff --check`/status inspection. Only the expected pre-existing 33 dirty paths remain.

The frontend build retains the existing warning for chunks over 500 kB. Full unrelated suites, the separate four-file preservation lane, and OCR were not run under C5; no lint script exists. Ignored build outputs remain at `backend/dist/`, `frontend/dist/`, and `frontend/node_modules/.tmp/tsconfig.{app,node}.tsbuildinfo`. No dependency, migration, seed, live data mutation, deployment, staging, commit, push, or external-service action was performed. Logs and the local preservation snapshot remain under `/tmp/`.

## Runtime follow-up after the reported Estimator screenshot

Read-only diagnosis found that the local backend process was running the older non-watching `scripts/local-chat-backend.mts` entrypoint. Its live `/openapi.json` response did not contain `EstimatorCatalogueLine.hasConfiguredBasePrice`; the frontend deliberately preserves visibility when legacy metadata is absent. No frontend compact-row bypass was found for a current source carrying explicit false.

The existing local `node ../scripts/local-chat.mjs --with-ocr` supervisor was gracefully restarted using the same launcher. Its source entrypoint skips demo-account/data provisioning. The local frontend was left running. The restarted backend's public metadata returned HTTP 200 and confirmed the visibility flag with the greater-than-zero rule. The replacement local supervisor remains running; startup output is in `/tmp/lisno-local-runtime-reload.log`. No source code or Configuration values were changed by this runtime follow-up; `git diff --check` passed.

A narrow read-only lookup of the reported Royal Emulsion Main Line's current saved draft also found a positive Signature PMC base, with Standard/Sub-vendor and In-house bases missing; the other Configuration scopes are not configured. Therefore the existing any-positive-method rule would still admit this particular item even after the runtime refresh. The user's further statement, “if any base less than or equals to 0..hide that,” requires settling whether a zero/missing base elsewhere must override a positive base. A concrete Signature-zero/Premium-positive clarification is pending; no stricter product rule has been implemented without resolving it.

## Original implementation plan and evidence

The following original tasks and execution records are historical. The user subsequently rejected the assumption that zero qualifies; the revised specification and C0–C5 above control the correction.

## Preservation and integration contract

The only current dirty path is the specification for this request. Capture status and per-target diffs again before writers begin. Preserve intervening work, including the completed four Configuration modes and estimation refinements. Root owns shared/public shapes and integration.

Settle the following contract in T0:

- Current backend catalogue/source rows carry an authoritative boolean, `hasConfiguredBasePrice`, derived from current Advanced configuration. The frontend transport/draft field is optional for compatibility; all new backend responses that supply these rows populate it.
- Explicit `false` hides a row from new choices and ordinary editable lists. Missing metadata means unknown and preserves existing visibility; it is not proof of a missing base. Do not guess base presence from final selling-rate fields. Cover this compatibility behavior deliberately; new feature fixtures supply explicit booleans.
- Compute presence across all four current saved Configuration scopes, including retained tier data. Do not widen estimation's three-tier enum or introduce default-to-tier price fallback. Existing other eligibility and available-choice gates remain in force.
- Reuse existing base-rate and In-house validation rules. Accept zero; reject missing/invalid/negative/overflowing values. Descriptions, specifications, margins, or a selling-rate placeholder do not qualify. In-house components must have valid costs and usable references; expand reference prefetch to default/retained Configuration scopes only where needed for this calculation, keeping financial enumeration unchanged.
- Retain full source rows for stable-ID lookup, reconciliation, saved-item review, and financial/workflow resolution. Do not set `sourceMissing` simply because the visibility flag is false, prune underlying drafts, or change saved prices/inclusion as a side effect of hiding a row. Existing independent current-Configuration refresh/validation rules remain authoritative.
- Selected/saved unpriced items stay available through existing review handling with an accurate missing-base explanation, outside ordinary item discovery. Published/approved historical views retain their saved records and amounts.
- Filter before each discovery surface's pagination and count calculation. New recommendation targets/children follow the same rule; existing selected sources, Remove/review access, and required-unavailable messages remain available. Loading/error/stale states cannot falsely signal recommendation completion.

## Dependency-ordered tasks

### T0. Reconcile consumers and establish metadata propagation

Owner: primary agent. Depends on the required approvals and execution choice.

1. Record the baseline and inspect the catalogue, recommendation target/source paths, live draft reconciliation, staff pickers, and Client quotation candidate pipeline. Separate discovery eligibility from pricing availability and saved-source identity.
2. Define the boolean contract on backend/public source shapes and frontend `EstimationCatalogueMainLine`/temporary-line types. Coordinate backend-owned declarations rather than editing the same files concurrently.
3. Own frontend transport/draft propagation in `frontend/src/features/leads/estimationCatalogueApi.ts` and `configuredEstimate.ts`, including creation/refresh and the branch preserving persisted historical amounts. Add focused propagation/compatibility tests in the corresponding test files.
4. Confirm any Client candidate/source shape in `frontend/src/features/client/quotationApi.ts` needs the signal. Avoid adding fields where server-side candidate filtering alone already supplies the correct contract.
5. Publish exact property/helper names and ownership to writers. Keep compatibility checks centralized in an existing appropriate feature utility where useful; do not add a new framework or pricing abstraction.

Root-exclusive paths: these frontend transport/draft contracts, shared files only if actually needed, integration tests assigned to root, and specification/plan documents. Backend and UI writers report contract changes to root before crossing those boundaries.

Acceptance: AC2, AC4, AC5; authoritative metadata reaches consumers without corrupting source identity or financial values.

### T1. Compute base-price presence and align discovery projections

Owner: one `backend_implementer` in Mode A; primary agent in Mode B. Depends on T0 interfaces; can run alongside T2.

Exclusive backend scope:

- `backend/src/services/estimator-catalogue.service.ts` and a bounded domain helper only if the calculation warrants one.
- Catalogue/public contract or OpenAPI declarations directly affected by the added boolean.
- `quotation.service.ts` and `quotation-recommendations.service.ts` only for new candidate/target visibility and accurate totals; retain existing pricing/source/approval behavior.
- Focused backend tests: `estimator-catalogue-estimate.replica-set.test.ts`, `estimator-catalogue-recommendations.replica-set.test.ts`, relevant quotation discovery/edit tests, and any helper unit test.

Deliverables:

1. Derive the flag from the latest saved draft, otherwise active revision, with the existing configured-scope and reference validity checks. Cover default-only and retained-tier-only prices without borrowing financial values.
2. Keep catalogue source rows available for reconciliation. Separate recommendation **target** visibility from selected **source** obligations. An unpriced required target remains an unavailable/review issue, not a silently satisfied requirement.
3. Filter server-paginated Client candidates before sorting/slicing/counting. Preserve all existing Client permissions, available-choice checks, and approved quotation snapshots.
4. Add asymmetric fixtures for all-four-empty, each sole qualifying scope, zero, missing margins with a valid base, description/specification/margin-only, malformed/overflowing prices, complete/partial In-house splits, valid/unavailable components, current unpriced draft over old priced active, direct temporary items, and Sub Basket children.
5. Assert metadata changes alone cannot alter rates, tier choices, saved/approved values, source resolution, or Procurement behavior. Do not add a new mutation or pricing gate unrelated to list visibility.

Acceptance: AC1–AC5. Run focused pure tests and replica-set source/candidate/recommendation tests. No migration or live data changes.

### T2. Apply visibility to staff estimation browsing and review

Owner: one `frontend_implementer` in Mode A; primary agent in Mode B. Depends on T0 contract; can run alongside T1.

Exclusive UI scope:

- `frontend/src/features/leads/salesEstimateCatalogue.ts` and its tests.
- `ConfiguredEstimateBuilder.tsx`, its normal/selling-price/tier-info tests as required, `LeadEstimateWorkspace.tsx` only where live selection/browse plumbing needs the metadata.
- `roomRecommendations.ts`, staff recommendation adapters/presentation only when visibility/review handling requires changes; preserve the existing auto-close state machine.
- Focused new workspace regression coverage, including `LeadEstimateRecommendations.test.tsx` where affected.

Deliverables:

1. Remove explicit-unpriced rows from ordinary catalogue/search lists and Add items choices before pagination/counts. Apply consistently to Sub Baskets and direct temporary paths, and to shared Sales/Designer rendering.
2. Keep source lookup and underlying selections intact. Route existing selected/saved unpriced records to current review handling with an accurate explanation. Do not manufacture source deletion, reset input values, alter totals, or autosave because a row becomes hidden.
3. Guard local Add handlers against stale hidden choices without changing the backend's established pricing/permission rules. Preserve loading, stale, error, and refresh behavior.
4. Keep recommendation review/Remove access and full-list completion counting correct when unpriced targets are filtered. An unavailable mandatory target must keep review discoverable and prevent premature popup closure.
5. Test explicit true/false/absent metadata, zero/default-only positives, source refresh, two rooms/unequal lines, search/page boundaries, selected-item preservation, empty lists, failed reads, and no unexpected Add/Remove/save/submit calls.

Do not edit root-owned transport/draft files or backend paths. Do not rewrite shared `EstimateItemPicker` generically; supply already-filtered data unless a demonstrated bounded shared issue requires root coordination.

Acceptance: AC1, AC2, AC4–AC6. Run focused catalogue/builder/recommendation interaction tests.

### T3. Integrate Client surfaces and reconcile end-to-end behavior

Owner: primary agent. Depends on T1/T2 interfaces; read-only preparation may run in parallel.

1. Verify Client quotation candidates and recommendation choices honor the server rule without post-pagination gaps. Touch `ClientQuotation.tsx` or related Client presentation only if necessary to preserve selected-source review or consume the signal.
2. Add focused Client regressions in `ClientQuotation.recommendations.test.tsx`, related quotation picker/edit tests, and `quotationApi.test.ts` if its public shape changes. Preserve historical submitted/approved screens.
3. Inspect all catalogue-to-picker consumers for unfiltered entry points and confirm no price inference or default-tier fallback was introduced.
4. Reconcile selected/saved unpriced review with the user's list-hiding rule. Preserve identities and persisted inclusion/amounts; test the first/last saved base refresh without any visibility-triggered mutation.
5. Confirm current backend always emits the flag, compatible older responses preserve prior behavior, and no blanket hiding occurs during incomplete reads. Review financial tier enumeration and unchanged recent estimation functionality.

Acceptance: integrated AC1–AC6 across staff/Client discovery, recommendation review, and saved source reconciliation.

### T4. Integrity review

Owner: `integrity_reviewer` in Mode A; primary agent inline in Mode B. Depends on all writers finishing.

Read-only integrated review: all four scopes, base versus selling prices, zero/invalid values, In-house/reference validity, current revision selection, metadata propagation, filter-before-pagination, recommendation obligations/completion, source identity, saved/approved amounts, and lack of unintended writes. Root resolves confirmed findings before final verification.

### T5. Final verification and handoff

Owner: `verification_runner` in Mode A after review; primary agent inline in Mode B. Product sources remain frozen during final checks.

Backend focused lanes, from `backend/`:

```sh
npm test -- tests/estimate-mode-pricing.test.ts tests/estimation-base-price-visibility.test.ts --maxWorkers=1
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimator-catalogue-recommendations.replica-set.test.ts tests/quotation-edits.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts --maxWorkers=1
npm test -- tests/quotation-openapi.test.ts tests/project-assistant-data.replica-set.test.ts --maxWorkers=1
npm run typecheck
npm run build
```

Include any new base-presence helper tests and additional quotation/reference suites whose production paths change. Use existing ephemeral Mongo replica-set helpers; resolve local sandbox listener restrictions through approved local execution rather than weakening transactional checks. Do not run seeds or a live database migration.

Frontend focused lanes, from `frontend/`:

```sh
npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/ConfiguredEstimateBuilder.tierInfo.test.tsx src/features/leads/roomRecommendations.test.ts src/features/leads/LeadEstimateRecommendations.test.tsx src/features/estimates/EstimateItemPicker.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx src/features/client/quotationApi.test.ts src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/MainBasketSelectionCard.test.tsx src/features/leads/EstimatorRecommendations.test.tsx --maxWorkers=1
npm test -- src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.configurationModes.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Add newly created feature tests and directly affected Client picker tests. Test default-only metadata without exposing costs, explicit zero, all-unpriced empty lists, selected review, required-unavailable suggestions, refresh/error races, and counts/pages after filtering. Do not change unrelated known baseline tests or repeat full suites simply for a new count; broaden for a demonstrated shared-contract risk or unresolved failure. No lint script exists; OCR is outside scope.

Rendered desktop/mobile checks use synthetic data in the actual estimation workspace: unpriced Main Lines absent from the normal list/search/picker/recommendation additions; each sole-price mode and zero visible where other gates permit; first/last base refresh; saved unpriced lines reviewable without deletion; correct pagination/empty/error states; keyboard/focus; no overflow or unexpected mutations. Verify published/history presentation still uses saved values.

Run `git diff --check`, inspect final diff and `git status --short` against baseline. Remove only task-owned browser fixtures/artifacts and stop only task-owned sessions; report standard ignored build outputs.

## Execution ordering and report

- Mode A: T0 contracts → T1 backend and T2 staff UI in parallel → T3 Client/integration → T4 review/fixes → T5 verification. Root exclusively owns shared contracts and Client integration. Every writer is told that other agents share the worktree and unrelated work must be preserved.
- Mode B: primary agent performs the same sequence inline without implementation subagents.
- Final handoff reports the visibility behavior, saved-data preservation, principal files/contracts, exact checks/results, unrun checks/baselines, generated outputs, and no migration/deployment/external action. Do not claim partially verified work complete.

## Execution record

The user reiterated that changes must stay limited to the requested visibility rule. No unrelated product changes were made. Root implemented metadata propagation and Client review-message handling; `priced_main_lines_backend` implemented authoritative presence and discovery projections, and `priced_main_lines_frontend` implemented staff list/picker/count filtering and saved-item review. The independent `priced_main_lines_consumer_audit` identified the mixed Sub Basket child-validation and count consumers; those bounded consistency changes were assigned to the relevant owners.

Actual contract: current backend source rows carry required `hasConfiguredBasePrice`; frontend transport/drafts carry the optional compatibility field. `isEstimationLinePriceVisible` accepts all responses except explicit false. No source record or underlying selection is removed. Client candidate filtering stays server-side, before pagination, with no extra candidate field. Optional Client `reviewMessage` keeps required unpriced work discoverable even with zero additions, and the frontend displays it only for a matching current ready response. Internal unpriced-target IDs support bounded batched resolution and are stripped from the public staff response.

Source records, pricing methods/formulas, financial tier enumeration, approval snapshots, and mutation payloads retain their existing semantics. A type-only historical snapshot `Omit` was updated for the additive current-source field; no metadata is fabricated on historical snapshots. Staff filtering uses an explicit draft-view flag so temporary edit/save locks do not reveal hidden rows, while historical views retain their original presentation.

Pre-final checks passed: backend base/pricing units 62; catalogue/recommendation/quotation/tier replica tests 239; OpenAPI/shared-assistant tests 25; frontend staff focused lane 157; root draft propagation tests 34 and Client/API tests 13. These are writer checks, with overlapping reruns not included as a unique final total. Final frozen-source checks will be recorded below.

Browser verification used synthetic data in the actual builder and workspace container at desktop 1440×1000 and mobile 390×844:

- The raw fixture contained 27 visible priced choices and 11 explicit-unpriced records. Ordinary discovery paginated as 20 + 7 choices; unpriced new items were absent from list/search.
- Default-only base presence remained visible with an unconfigured selling-rate field left blank; a configured zero showed rate 0 and amount ₹0.00. No fallback price was manufactured.
- Changing the first/last-base metadata during refresh made the targeted item appear/disappear while searching for it.
- The selected unpriced saved record remained in the separate review region, included, quantity 3, rate ₹99.15. Two selected records retained a total of 39870 paise.
- Both viewport checks recorded zero Add, Update, Remove, save/submit, or API calls caused by filtering/search/paging. Synthetic refresh controls only updated the visibility input. No horizontal page overflow was observed.

Integrated integrity review completed after the writers finished, with no confirmed defects. It covered the four raw Configuration scopes, valid zero and In-house references, latest-draft selection, source preservation, filtering/counts, selected review, Client bounded target resolution, and the matching-response review message. Product sources were then frozen for final verification.

The task-owned browser session and Vite server were stopped. The synthetic fixture and screenshots under `frontend/output/playwright/priced-main-lines-2026-11-09/` and four task-owned `.playwright-cli` files were removed after visual inspection; unrelated browser artifacts were preserved.

## Final integrated verification

All final checks ran after the writers finished and the integrity review passed. Product sources stayed frozen throughout verification. The exact test/typecheck/build commands are recorded in T5 above, with these results:

| Lane | Result | Log under `/tmp/` |
| --- | --- | --- |
| Backend base/pricing units | 2 files, 62 tests passed; exit 0 | `lisno-priced-main-lines-final-backend-units.log` |
| Backend catalogue/recommendation/quotation/tier replicas | 4 files, 239 tests passed; exit 0 | `lisno-priced-main-lines-final-backend-replicas-local.log` |
| Backend OpenAPI/shared assistant | 2 files, 25 tests passed; exit 0 | `lisno-priced-main-lines-final-backend-contracts-local.log` |
| Backend typecheck | Passed; exit 0 | `lisno-priced-main-lines-final-backend-typecheck.log` |
| Backend build | Passed; exit 0, no warnings | `lisno-priced-main-lines-final-backend-build.log` |
| Frontend focused | 14 files, 248 tests passed; exit 0 | `lisno-priced-main-lines-final-frontend-focus.log` |
| Frontend preservation | 4 files, 64 tests passed; exit 0 | `lisno-priced-main-lines-final-frontend-preservation.log` |
| Frontend typecheck | Passed; exit 0 | `lisno-priced-main-lines-final-frontend-typecheck.log` |
| Frontend build | Passed; exit 0, existing chunk-size warning | `lisno-priced-main-lines-final-frontend-build.log` |
| Repository hygiene | `git diff --check` passed; final `git status --short` contains only requested source/tests/docs | Reviewed against initial clean-code baseline |

Total: **638 passing tests across 26 files** (backend 326/8; frontend 312/18), with no product test failures remaining. The initial sandbox replica attempt failed setup because listening returned `EPERM` (239 tests skipped); the identical local-test escalation passed. The environment-only failed attempt is retained separately in `/tmp/lisno-priced-main-lines-final-backend-replicas.log`.

AC1/AC5 are covered by catalogue/picker/search/page/count, Client candidate, recommendation, and first/last-base refresh regressions. AC2/AC3 are covered by raw four-scope base-presence and replica fixtures, including zero, invalid and In-house component/reference cases. AC4 is covered by saved/historical values, stable source identity, review/Remove, and required-unavailable recommendation tests. AC6 is covered by the preserved four-mode/tier/checklist suites, both typechecks/builds, independent integrity review, final hygiene, and the rendered desktop/mobile evidence above.

Principal implementation areas are `backend/src/domain/estimation-base-price-visibility.ts`, catalogue/quotation discovery services and their OpenAPI descriptions, `frontend/src/features/leads/estimationCatalogueVisibility.ts`, catalogue/draft propagation, the shared configured builder and recommendation consumers, and matching Client review-message handling. No price formulas, financial tiers, saved mutation payloads, dependencies, or lockfiles changed.

The frontend build reported the existing warning for minified chunks over 500 kB; bundle restructuring is outside this request. Full unrelated suites were not run under the approved focused plan; no lint script exists, and OCR is unaffected. Ignored build outputs remain at `backend/dist/`, `frontend/dist/`, `frontend/node_modules/.tmp/tsconfig.app.tsbuildinfo`, and `frontend/node_modules/.tmp/tsconfig.node.tsbuildinfo`. No migration, seed, production mutation, deployment, external-service action, staging, commit, or push was performed. Task-owned browser artifacts were removed; test logs remain under `/tmp/`.


## 2026-11-11 disabled rate appearance follow-up (AC4)

Continued the approved no-price-editing requirement after the user asked to make the rate field disabled. The current Sales input already has an unconditional native `disabled` attribute and no rate edit handler. Its shared input styling still looked editable. Added only a scoped `input:disabled` rule in `frontend/src/styles/estimator-dashboard.css`: muted text/background, a not-allowed cursor, and consistent opacity. No dimensions, placement, price calculations or permissions changed. Existing dirty work was inspected and preserved.

Verification after the CSS edit:
- `cd frontend && npm test -- src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx`: 3/3 passed, including blocked manual edits and configured PMC/tier price updates. Independently checked by `rate_disabled_verification`.
- `cd frontend && npm run build`: TypeScript and Vite passed; existing large-chunk warning remains. Generated output is ignored under `frontend/dist/`.
- Playwright rendered the production builder with synthetic data using the current local Vite styles at 1280px and 390px. Rate stayed disabled, typing was blocked, and PMC still applied its configured price. Computed style showed the muted background and not-allowed cursor. Removing/reapplying the new rule left the position and size identical at both widths (rate widths 112px and 125px respectively). Inspected a synthetic rate screenshot.
- `git diff --check`: passed. Full suites/backend checks were not rerun for this CSS-only delta. No estimate saves, Configuration data changes, dependencies, migrations or deployments.
- Closed the isolated browser; removed its `.playwright-cli` logs/snapshot and `output/playwright/rate-disabled-1111.png`.
