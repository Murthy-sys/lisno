# Project initiation source and estimation pricing modes: task plan

Date: 2026-10-07

Status: Completed approved Mode A, including the basket-card reference and latest compact four-column correction. Focused integrated verification and rendered interaction/responsive checks passed. Prior Source, Main Line mode, Budget removal, and basket type removal remain intact.

Latest continuation completed: compact Main Line rows with controls visible only for selected items, per the latest screenshot correction. Final responsive, touch, large-amount and focused regression checks passed.

Source of truth: [approved specification](../specs/2026-10-07-project-source-estimate-modes-design.md).

The user approved the specification with “Approved....”, the task plan with “Approved”, and selected Mode A. This adopts the fill-and-edit behavior and defaults: optional free-text Source, a 200-character limit, Standard using Sub-Vendor, new Special items initially using Sub-Vendor, and In-house using the combined labor and material base.

## Contract and execution boundaries

- Use optional initiation `source`, persisted on the existing linked Lead. Omission retains `admin_project`. Access-grant provenance remains `admin_initiator`.
- Add catalogue `modeBaseRatesPaise: { pmc: number | null; sub_vendor: number | null; in_house: number | null }`. Retain the existing matching `inHouseBaseRatePaise` response for older consumers. Missing new mode data must never fall back to that In-house rate for Standard.
- Add optional line `pricingMode: "pmc" | "sub_vendor" | "in_house"` and `rateSource: "configuration" | "manual"`. Preserve both through save, reload, and immutable publication. `classification` and `itemType` retain their distinct meanings.
- Resolve prices from the same current Main Line revision as names, UOM, and versions. Draft precedes active. Preserve same-revision legacy combined In-house support and split-setting precedence.
- Configuration-derived rates are checked against current backend data. Reuse the existing refreshable Configuration conflict responses where applicable; never silently save different totals. Manual overrides and historical entered rates remain supported.
- At plan creation, the only dirty path is the untracked specification for this task. Recheck the entire dirty-path set and inspect every assigned target diff immediately before writers start. Preserve all later unrelated work.
- The primary agent owns shared contracts, integration, `backend/src/openapi.ts`, `backend/tests/api-docs.test.ts`, `frontend/src/api/types.ts`, task documents, and browser QA fixtures/artifacts. Other owners must not edit those files.
- No dependencies, lockfile edits, seeds, live migrations, deployment, commits, pushes, or customer communication are planned. Use isolated synthetic data and the existing test replica-set helper.
- Mode A starts only after the execution-choice gate. It uses the owners below with up to three independent implementation agents plus the primary agent. Mode B performs the same tasks inline, with no subagents. Keep one parent implementation task in progress while tracking its bounded slices separately.

## Dependency-ordered tasks

### 1. Confirm baseline and shared contract

**Owner:** primary agent. **Dependencies:** approved task plan and execution-mode selection. **Acceptance:** specification AC 4–6 and 8.

- Capture dirty paths and per-target diffs. Confirm current route validation, draft hydration/save response mapping, catalogue versions, submission checks, and strict publication boundaries against the approved specification.
- Publish the exact optional-field and omission semantics to all owners before concurrent writes. Define Standard with an explicit mode as Sub-Vendor; keep historical mode absence distinct from a chosen Sub-Vendor mode.
- Use existing request version fields to carry current item/revision identity for configuration-derived prices. Define missing-price behavior as `null`, including when a current configuration-derived price disappears; preserve manual missing-price entry and existing incomplete-draft restrictions.
- Lock legacy compatibility: omission preserves prior metadata unless the submitted entered price changes, which becomes a manual edit; never infer historical mode from a matching amount. Legacy Standard-to-Special changes retain the saved price and require an explicit mode choice; a new Standard-to-Special change retains its already selected Sub-Vendor mode. Special-to-Standard explicitly applies Sub-Vendor.
- Define fixtures with different PMC/Sub-Vendor/In-house prices, split and legacy In-house data, at least two unequal projects, separate rooms containing the same Main Line, a temporary item, historical mode-less records, and distinct authorized/unauthorized identities.
- Update the primary-owned shared frontend input/published types and OpenAPI schemas to the agreed contract. Backend and frontend owners implement their local types against that contract. Preserve optionality in old snapshots and API payloads.

**Completion evidence:** recorded baseline, explicit ownership, settled payload/response semantics, and agreed fixtures. No owner begins on an unexplained dirty target.

### 2. Persist Source through project initiation

**Owner in Mode A:** initiation backend implementer. **Dependencies:** task 1. **Acceptance:** AC 1 and 8.

**Owned source:** `backend/src/routes/admin-projects.ts`, `backend/src/services/admin-project.service.ts`.

**Owned tests:** `backend/tests/admin-projects.test.ts`, `backend/tests/sales-initiated-projects.test.ts`, `backend/tests/admin-projects-mongo.replica-set.test.ts`.

- Add optional trimmed Source validation with length 1–200 when present. Pass it to the existing linked Lead creation with the compatibility default on omission. No new Project field, Lead schema, or repository method is needed unless evidence proves otherwise; report any such dependency to the primary agent first.
- Verify both initiating roles, lead readback, old callers, whitespace handling, invalid types/lengths, and unchanged assignment and access-grant provenance.
- Replace assertions that Source is categorically forbidden with the new bounded-input expectations. Keep authorization, client identity, transaction rollback, location-free initiation, and date handling regressions intact.

**Completion evidence:** focused memory/API and replica-set tests prove the exact source is persisted and invalid requests do not partially create project/lead/grant records.

### 3. Project mode prices, persist line choices, and protect publication

**Owner in Mode A:** estimation backend implementer. **Dependencies:** task 1. **Acceptance:** AC 2–6 and 8.

**Owned source:** `backend/src/services/estimator-catalogue.service.ts`, `backend/src/routes/estimates.ts`, `backend/src/models/Estimate.ts`, `backend/src/domain/estimate-client-review.ts`, `backend/src/models/EstimateClientReviewRound.ts`, `backend/src/services/estimate-publication.service.ts`, `backend/src/services/estimate-client-presentation.ts`; `backend/src/services/estimate-client-review.service.ts` only if its existing mapping needs accommodation. A small estimation-domain helper and focused test may be added if it prevents duplicate price-resolution/validation logic across save and publication.

**Owned tests:** `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`, `backend/tests/estimate-publication.test.ts`, `backend/tests/estimate-publication-mongo.replica-set.test.ts`, `backend/tests/estimate-client-review-models.test.ts`, `backend/tests/estimate-client-presentation.test.ts`. Read `estimator-configured-procurement.test.ts` for downstream compatibility; edit it only for a directly affected regression.

Carry out this slice in order:

1. Extend the existing batched advanced-section projection with PMC and Sub-Vendor bases. Validate safe nonnegative integer paise and the In-house sum. Preserve catalogue eligibility, stable IDs, current-revision selection, and transaction-safe sequential reads.
2. Extend strict line input, persisted schema, response mapping, and saved-line restoration types with mode/rate source. Preserve omitted historical fields without a backfill. Enforce valid mode/classification combinations and configuration-derived rates requiring a mode.
3. Resolve configuration-derived prices authoritatively during save. Reject stale identity/version/price combinations rather than substituting values in the submitted total. Accept `null` only when it matches the current missing base and the existing incomplete-draft workflow. Preserve manual overrides, older-client omission semantics, UOM review, CAS, and safe total calculations.
4. Carry metadata through explicit publication projection, immutable schema validation, review/domain types, and strict client-presentation parsing. Ensure submission and publication freshness checks cover configuration-derived pricing consistently with the saved source versions. Do not recalculate historical or approved snapshots.
5. Verify that draft recommendation-origin fields remain excluded from the strict snapshot, while the new supported mode fields survive. Retain submission recovery, rollback, delivery isolation, and empty-location support.

**Completion evidence:** replica-set save/reload and publication cases, model/parser compatibility, stale-price conflict tests, cross-project/room paise reconciliation, missing/zero/overflow/split-price cases, and unchanged approved Procurement source amounts.

### 4. Implement estimator mode state and item controls

**Owner in Mode A:** estimator frontend implementer. **Dependencies:** task 1; uses the agreed contract while task 3 proceeds. **Acceptance:** AC 2–5 and 7–8.

**Owned source:** `frontend/src/features/leads/estimationCatalogueApi.ts`, `frontend/src/features/leads/leadsApi.ts`, `frontend/src/features/leads/configuredEstimate.ts`, `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, `frontend/src/styles/estimator-dashboard.css`.

**Owned tests:** colocated `estimationCatalogueApi.test.ts`, `configuredEstimate.test.ts`, `LeadEstimateWorkspace.test.tsx`, `ConfiguredEstimateBuilder.test.tsx`, and `LeadEstimateRecommendations.test.tsx` if its inclusion fixtures need updating.

- Extend catalogue and line types, draft construction/hydration, update handlers, save serialization, and save-response reconciliation. Handle edits made while a save or catalogue request is pending so an older response cannot overwrite a newer user choice.
- Default new lines to Sub-Vendor/configuration-derived pricing. Keep first-inclusion basket classification inheritance and recommendation-origin behavior intact. Keep historical mode-less prices manual and unmodified on open, refresh, and save.
- Use one coherent transition path for mode changes, Special-to-Standard changes, and Price edits. Configuration-derived prices follow refreshed bases in editable drafts; manual overrides remain. Read-only drafts preserve saved financial values.
- Render PMC, Sub-Vendor, and In-house in a native radio fieldset only for included editable Special items. Show the selected base and UOM, missing-base messaging, and historical mode-selection prompt. Standard shows Sub-Vendor as its mode; read-only rows show saved metadata without interactive controls or an invented historical mode.
- Keep each radio name and accessible label unique by room and stable Main Line identity. Add only scoped layout styles using existing tokens. Place controls without crowding quantities and amounts at narrow widths. No new icons, decorative animation, or global restyling.
- Verify manual overrides, new/legacy transitions, saved restoration, failed catalogue refresh, stale conflicts, reselection, recommendation addition/removal, per-room independence, and Summary/Proposal totals.

**Completion evidence:** state tests and rendered interaction tests demonstrate all transitions, correct payloads, accessible names, and independent prices for unequal fixtures.

### 5. Add Source UI and reconcile shared contracts

**Owner:** primary agent. **Dependencies:** task 1; final reconciliation waits for tasks 2–4. **Acceptance:** AC 1, 5–8.

**Owned source/tests:** `frontend/src/features/admin/AdminProjectInitiationDialog.tsx`, `frontend/src/features/admin/AdminProjectInitiationDialog.test.tsx`, `frontend/src/api/types.ts`, `backend/src/openapi.ts`, `backend/tests/api-docs.test.ts`. Only task-specific synthetic browser-fixture changes, if needed, are primary-owned.

- Add Source after Property type, including approved helper/placeholder, optional validation, max length, state, refs/error focus, trimmed payload omission, busy state, and dirty-form handling. Reuse existing field/layout components without editing the estimator owner's stylesheet.
- Cover both Sales and Sales Manager assignment flows, whitespace-only omission, source submission/error response, and preservation of date-only and optional-city behavior.
- Reconcile runtime optionality and names with the shared initiation and published-review types plus OpenAPI. Ensure new fields are explicitly permitted in strict schemas and obsolete “classification never influences pricing” documentation is scoped correctly.
- Inspect the complete diff, integrate all writers, and resolve contract disagreements before final checks. Request ownership transfer before editing an agent's active files.

**Completion evidence:** initiation rendered tests and API documentation tests agree with implemented backend/frontend shapes, with no unrelated diff changes.

### 6. Integrated integrity review, verification, and handoff

**Owner:** primary agent; in Mode A use `integrity_reviewer` then `verification_runner` sequentially after all writers finish. **Dependencies:** tasks 2–5 complete. **Acceptance:** all specification criteria.

- Review mode/value consistency, current draft precedence, old-client semantics, save-response races, historical prices, mode-less Standard/Special transitions, immutable publication, role isolation, transaction rollback, recommendation preservation, and scoped diffs.
- Resolve confirmed issues before final verification. Tests during concurrent edits are development feedback, not final evidence. Re-run only affected checks after fixes, broadening when a concrete shared-contract risk remains.
- Use the exact focused commands below, then workspace typechecks/builds. Existing replica-set helpers create isolated test databases; never substitute a live database or seed script.

From `backend/`:

```sh
npm test -- tests/admin-projects.test.ts tests/sales-initiated-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-presentation.test.ts tests/estimator-configured-procurement.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

From `frontend/`:

```sh
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/leads/estimationCatalogueApi.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx
npm test -- src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/client/ClientProject.estimateReview.test.tsx
npm run typecheck
npm run build
```

Run any newly added focused domain tests in addition to these existing files. Authorization registry coverage is required if a route operation changes, which is not planned. Full workspace suites are conditional on additional affected dependencies or unresolved risk. OCR/mobile-native tests and live deployment checks are outside this web/API change. No lint script exists.

For browser verification, load the relevant browser QA skills at execution time. Use synthetic data with local fixture-backed routes, mocked delivery, and no real customer submission. Inspect widths 390, 768, and 1440 px:

- Source in both initiation flows, helper/error text, optional empty state, scrolling, dirty close, and keyboard focus.
- Standard, each Special mode, manual Price edits, missing and zero bases, mode-less historical items, read-only values, and correct totals.
- Native radio arrow-key operation, distinct accessible names, visible focus, no horizontal overflow, no unexpected console/network errors, and refresh/conflict recovery.
- Save/reload interactions and a Configuration update with one manually priced item and another configuration-derived item. Confirm only the latter selling price follows the new base and published values stay frozen.

Run `git diff --check` and `git status --short`; separately check any new source files that are still untracked. Keep screenshots/logs in a task-specific ignored or temporary directory such as `/tmp/lisno-project-source-estimate-modes-qa/`, record actual paths, and do not stage generated artifacts.

**Completion evidence:** exact command results, browser outcomes, acceptance-criterion mapping, final scoped diff, and an honest record of unrun checks or remaining limitations. No completion claim if a material acceptance criterion remains unverified.

## Safe parallel work

After task 1, Mode A can run tasks 2, 3, and 4 concurrently with separate owners. The primary agent performs task 5 in its explicitly owned files. Backend initiation and backend estimation do not share write targets; frontend initiation and estimator work share only primary-owned public types. Any newly discovered shared target must return to the primary agent for an ownership decision.

Within task 3, catalogue/save work precedes publication integration under one owner. Final task 5 reconciliation, integrity review, and final verification wait for all writers. In Mode B, execute the same dependencies sequentially in the primary thread.

## Trace to approved acceptance criteria

| Specification criterion | Tasks | Required evidence |
| --- | --- | --- |
| AC 1: Source capture and compatibility | 2, 5, 6 | Both initiation flows; validation; API/readback; replica-set rollback; rendered form |
| AC 2: Standard/Special mode interaction | 3, 4, 6 | Distinct rates; radio and type transitions; room independence; temporary items |
| AC 3: Editable Price and paise reconciliation | 3, 4, 6 | Unequal project/room totals; explicit mode fill; preserved manual overrides; Summary/Proposal |
| AC 4: Current Configuration correctness | 1, 3, 4, 6 | Draft/active precedence; split/legacy In-house; missing/zero/overflow; UOM/stale conflicts |
| AC 5: Persistence and older-client compatibility | 1, 3–6 | Save/reload; origin-aware refresh; historical prices; omissions; recommendation/reselection |
| AC 6: Immutable publication and downstream reads | 3, 5, 6 | Snapshot storage/parser tests; publication replica set; historical client/Procurement reads |
| AC 7: Responsive and accessible UX | 4–6 | Rendered interactions; desktop/tablet/mobile web checks; keyboard/focus; state coverage |
| AC 8: Integrated checks and hygiene | 1–6 | Focused suites, typechecks, builds, final review and diff checks |

## Gate status

- Specification: approved by the user on 2026-10-07.
- Task plan: approved.
- Execution mode: A, parallel implementation.
- Initial baseline: only the task specification and plan were untracked; all product targets were clean.
- Tasks 1–5 implemented. Integrated review found and resolved a pending-submission mode/price race. Submission now locks editing and catalogue repricing during save/publication, then hydrates the authoritative response while retaining the selected view. Deferred regressions cover both new and saved lines. Final read-only integrity review found no remaining blocker.
- Final task 6 command verification passed: 361 backend tests, 185 frontend tests, both workspace typechecks and builds, and repository hygiene checks. All eight acceptance criteria have focused evidence. Earlier per-owner checks are not added to these final counts.
- Bounded QA support ownership transferred to `mode_qa_fixture`: only `frontend/src/test/fixtures/enterpriseRoutes.ts`, `enterpriseTransport.ts`, `enterpriseTransport.test.tsx`, and `enterpriseEstimateModesData.ts`. Root retains browser operation and final verification. All synthetic mutations remain local to the QA fixture. The fixture owner completed 52 tests and typecheck; no change to `enterpriseRoutes.ts` was needed.
- Source form browser QA surfaced an existing invalid `aria-required` attribute on its date-picker button. The primary agent made a bounded accessibility correction in `NextActionDateTime.tsx` and its existing test: announce Required through an accessible description while retaining the button, validation, and date-only behavior. Include this focused test in final verification.

## Rendered verification evidence

Used the existing local synthetic enterprise QA entry with a task-gated `qaEstimateModes=ready` fixture. The fixture supports local draft saves and simulated current-Configuration updates; other mutations remain blocked. No live backend, real client submission, or external delivery was used.

- Chrome 154, development build, viewport widths 390, 768, and 1440 px: Source and estimator controls render without horizontal overflow. Inspected desktop/tablet/mobile screenshots and a mobile estimate row. This is responsive emulation, not a physical-device or cross-browser benchmark.
- Source: optional text, 200-character limit, both assignment flows, dirty-close confirmation, preservation after cancelling close, keyboard movement from Source to Next action, and date calendar interaction passed. Final Source accessibility scan: zero violations, 27 passes; the existing image/non-text contrast checks require manual assessment.
- Special prices: PMC ₹120, Sub-Vendor ₹150, In-house ₹180 in the unequal synthetic fixture. Native arrow-key radio selection changed the rate correctly. Manual ₹177.35 survived reselecting the current mode, save, navigation/reload, and Configuration refresh. A separate configuration-derived painting line refreshed from ₹25 to ₹31. Explicit Standard/Special and mode changes filled the latest selected base.
- Missing PMC base remained blank and blocked submission while selected. A configured zero remained ₹0 and allowed submission. No application errors or unexpected fixture requests were observed.
- Post-fix browser smoke repeated mode selection, manual-price saving, all three widths, and accessibility scanning on the final product code. No accessibility violations; automated contrast checks remained incomplete for existing image-backed sidebar text and non-text quantity buttons.
- Historical/mode-less compatibility, read-only publication, stale conflicts, and deferred publication races are covered by rendered component tests and backend replica-set tests, rather than synthetic browser publication. Browser checks do not claim real API delivery or publication.

Artifacts: `/tmp/lisno-project-source-estimate-modes-qa/`, including `mode-evidence.json`, `modes-final-evidence.json`, `source-final-evidence.json`, `source-{390,768,1440}.png`, `source-sales-mobile.png`, `modes-final-1440.png`, and `modes-final-mobile.png`. The earlier `source-sales-evidence.json` records the accessibility issue before correction. Task-owned CLI logs/snapshots were moved into the same directory under `playwright-session/`. The QA browser and local server were stopped after verification.

## Final integrated command results

The verification runner executed the final focused test selections. The primary agent completed the backend retry, both typechecks/builds, browser verification, and final hygiene after the initial backend sandbox prevented local listeners. No product files changed during final verification.

From `backend/`, the following selection passed **361 tests across 11 files**, exit 0, including isolated Mongo replica-set cases:

```sh
npm test -- tests/admin-projects.test.ts tests/sales-initiated-projects.test.ts tests/admin-projects-mongo.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-mode-pricing.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-client-review-models.test.ts tests/estimate-client-presentation.test.ts tests/estimator-configured-procurement.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Typecheck and build both exited 0. The initial test attempt failed with sandbox `EPERM` while opening local test ports; rerunning with permitted local-service access passed the complete selection. Logs: `backend-final-tests.log` (sandbox failure), `backend-final-tests-retry.log` (passing run), `backend-final-typecheck.log`, and `backend-final-build.log`, all in the artifact directory above. Test output includes Mongoose deprecation warnings for existing `findOneAndUpdate` / `findOneAndReplace` `new` options.

From `frontend/`, the following selection passed **185 tests across 10 files**:

```sh
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/admin/NextActionDateTime.test.tsx src/features/leads/estimationCatalogueApi.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/test/fixtures/enterpriseTransport.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/client/ClientProject.estimateReview.test.tsx
npm run typecheck
npm run build
```

Typecheck and build both exited 0. Logs: `frontend-final-tests.log`, `frontend-final-typecheck.log`, and `frontend-final-build.log`. The production build reports the Vite chunk-size warning for chunks above 500 kB; bundle restructuring is outside this change.

`git diff --check` passed. A separate whitespace/final-newline/conflict-marker check passed for all five new task files (domain helper/test, synthetic fixture, specification, plan). Final status contains only task-owned product, test, and document changes; runtime browser artifacts were moved out of the worktree. Build outputs remain ignored. No dependencies or lockfiles changed.

Remaining validation limits: full workspace suites, OCR/mobile-native suites, physical-device/cross-browser testing, and live API/email delivery were not run. Automated contrast checks for existing image/non-text content remain incomplete as recorded above. No migration, seed, live data mutation, deployment, commit, push, or customer communication was performed. No unresolved task-specific defect was found in final integrity review or focused verification.

## Screenshot follow-up execution

This resumes the approved Mode A correction. Initial worktree matches the prior implementation's 37 modified and five new task files. Existing diffs on estimator targets were inspected; preserve all prior Source, backend, publication, pricing, QA, and accessibility work. The later Main Line screenshot confirms the approved per-line scope, so no basket-mode API extension is needed.

1. Frontend owner: `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, `configuredEstimate.ts`, their existing tests, and `LeadEstimateRecommendations.test.tsx` only if inheritance coverage requires it. Expose editable row controls before inclusion. Use the basket default only when the line has no explicit classification; explicit line type/mode choices become sticky. Reuse the current rate-resolution path, preserve manual prices and publication locks, and keep excluded rows out of totals. Add focused regressions for inherited Special, pre-inclusion mode selection, Standard reset, independence, save/reload, and recommendation compatibility.
2. Primary owner: remove Budget from `ContactAndEstimateCard.tsx` and remove its unused props at the `LeadDetail.tsx` call site. Extend the existing `LeadDetail.test.tsx` assertion with a populated budget; inspect the unconditional removal to confirm there is no empty-budget placeholder path. Own task documents and browser QA. No write overlap with task 1.
3. Read-only integrity review after writers; then final focused frontend tests, typecheck/build, and browser verification of the actual unchecked-row path at narrow and wide widths. Backend product code is unchanged in this correction; prior backend test evidence remains applicable. Final hygiene includes the new follow-up paths. Record actual checks below without adding development runs to final counts.

### Follow-up browser and integrity evidence

- Read-only integrity review found no blockers. The follow-up touches three estimator source files and their focused tests, plus the contact card/caller/test and these task documents. No backend, API, CSS, dependency, or serialization changes were needed.
- Browser setup used the existing local synthetic mode fixture with an empty draft, then selected Special on the Main Basket and opened the Main Line rows. Before checking any item, three radios were visible on the Special row and selected PMC/Sub-Vendor/In-house rates were ₹120/₹150/₹180 for that Main Line. Preview mode changes kept the checkbox unchecked and the estimate total at ₹0.
- A manual ₹177.35 entered before inclusion survived inclusion, Save draft, and navigation/reload with In-house still selected. The included total was ₹209.27 including GST. Neighboring unchecked rows independently displayed missing PMC as blank and zero PMC as ₹0 without affecting that total or the manual price. Native ArrowRight selected Sub-Vendor and its correct ₹10 base on the separate zero-base fixture line.
- Budget is absent from the shown Estimate panel; contact information, next action, and Continue estimate remain visible and usable. The rendered lead-detail regression also checks absence with a populated budget. Budget inputs were removed entirely from the component, so absent-budget placeholders have no rendering path.
- At 390, 768, and 1440 px, both the contact panel and corrected Main Line row render without horizontal overflow. No application errors or unexpected fixture requests. Accessibility: zero violations, 35 passes, with the existing image/non-text contrast checks incomplete. Inspected desktop, tablet, and mobile row screenshots. Development Chrome browser emulation only; no physical-device or other-engine claim.
- Artifacts: `/tmp/lisno-main-line-controls-followup/`, including `budget-evidence.json`, `main-line-evidence.json`, `edge-evidence.json`, `estimate-panel-{390,768,1440}.png`, and `main-line-{390,768,1440}.png`. Browser logs are in its `.playwright-cli/` directory outside the worktree. Local browser and QA server were stopped.

### Follow-up final command results

From `frontend/`:

```sh
npm test -- src/features/leads/LeadDetail.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/client/ClientProject.estimateReview.test.tsx
npm run typecheck
npm run build
```

- Final focused selection: **115 tests passed in seven files**, exit 0. The initial run passed 114 and failed one unchanged client cached-review test on an asynchronous render assertion; the isolated client-review file passed all 13 tests, then the identical seven-file selection passed all 115 without code changes. Retain this as an intermittent test limitation, not a hidden success-only record. Logs: `frontend-tests.log`, `frontend-client-review-rerun.log`, and `frontend-tests-rerun.log` in the follow-up artifact directory.
- Frontend typecheck and production build exited 0. Logs: `frontend-typecheck.log`, `frontend-build.log`. Vite still warns about chunks exceeding 500 kB.
- `git diff --check` passed; final `git status --short` contains the prior task changes plus the bounded follow-up files. No runtime artifacts added to the worktree. Task documents pass whitespace/final-newline checks.
- Full workspace suites were not run. Backend checks were not repeated for this frontend-only correction; the preceding passing backend evidence remains recorded above. No dependencies, migrations, live mutations, deployment, commits, or pushes. Browser scope and incomplete automated contrast checks are stated above.

## Main Basket type removal follow-up

Baseline: 40 modified and five new task files from the preceding work; relevant estimator diffs inspected. Scope is only the Main Basket presentation, preserving saved metadata and existing per-line pricing.

1. Primary owns `LeadEstimateWorkspace.tsx`: remove basket type controls/read-only text and unused row props. Remove only orphan basket-type selectors from `estimator-dashboard.css`. Own these documents and browser QA.
2. Existing frontend owner owns only `LeadEstimateWorkspace.test.tsx`: adapt old basket-type interactions to line-level selection, verify absence from the chooser, and preserve historical saved basket metadata coverage. No source/test write overlap.
3. Run focused workspace/builder/helper/recommendation checks, frontend typecheck/build, rendered narrow/wide chooser checks and a per-line Special mode smoke test, then final diff hygiene. Reuse prior backend evidence; no backend or contract edits. Proportionate read-only review and final checks after writes stabilize.

Main Basket removal evidence:

- Integrity review found no issues. Saved basket classifications still hydrate/serialize, and per-line type/mode controls remain intact.
- Browser at 390, 768, and 1440 px: Main Baskets has zero radios and no Item type label; checkbox deselection/reselection and detail expansion work. No horizontal overflow, application errors, or unexpected local-fixture requests. Returning to item selection still exposes three mode radios on a Special Main Line; selecting In-house fills its ₹180 synthetic base.
- Screenshots and browser evidence: `/tmp/lisno-basket-type-removal/main-baskets-{390,768,1440}.png` and `browser-evidence.json`; CLI logs remain outside the repository in that directory. QA browser and server stopped.
- Final focused regression command from `frontend/`: `npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateRecommendations.test.tsx`. Result: **100 tests passed in four files**, exit 0. No new tests were introduced solely for this visual removal; existing interaction expectations were adapted to the Main Line controls.
- `npm run typecheck` and `npm run build` both exited 0. The build retains its chunks-over-500-kB warning. Logs: `frontend-tests.log`, `frontend-typecheck.log`, `frontend-build.log` in the artifact directory above. `git diff --check` passed; status remains 40 modified and five new task files, with no added runtime artifacts. Final task-document whitespace checks passed.
- Full suites, backend, unrelated client tests, and OCR were not repeated for this presentation-only follow-up. No dependencies, migrations, live data changes, commits, pushes, or deployment. All earlier worktree changes preserved.

## Basket card reference implementation

Baseline: preceding 40 modified/five new task files retained and relevant target diffs inspected. The interrupted request made no edits before this continuation. Apply the reference only to the basket chooser.

1. Backend owner: `estimator-catalogue.service.ts`, `openapi.ts`, and focused catalogue/API-doc tests. Project the existing basket description as a nullable string, expose it in the response schema, test described/null baskets, and preserve all previous mode-price and authorization behavior. No new model or migration.
2. Frontend owner: `LeadEstimateWorkspace.tsx`, `estimationCatalogueApi.ts`, scoped chooser selectors in `estimator-dashboard.css`, existing workspace/recommendation tests. Implement the reference card hierarchy and responsive grid; replace only basket checkbox interactions with native pressed Add/Added buttons and keep Main Line checkboxes. Preserve stable IDs, counts, details, read-only/error state, and existing saved metadata. Use optional description for older-server compatibility.
3. Primary: coordinate the additive contract, own documents and bounded synthetic QA fixture support. Inspect six-card wide/intermediate/narrow layouts, long labels and missing descriptions, keyboard and toggle/disclosure interactions. No overlap with owner source paths.
4. After writers stabilize, integrity review, focused frontend and backend catalogue/schema tests, both typechecks/builds, rendered responsive/accessibility checks and final hygiene. Keep only this parent implementation task in progress; no dependency installs, live writes, migrations, commits, or deployment.

Latest visual refinement: the user found the cards too large and requested four per row. Continue the same owned UI slice with a content-driven height, smaller type/icon/spacing, compact actions, and a four/three/two/one-column container grid. This changes presentation density only; retain the same API, selection and pricing contracts. Primary will verify actual card heights, all four grid states, overflow, and keyboard controls after these final style edits.

### Final basket-card evidence

- Compact cards remove the fixed 240px minimum height and row stretching, reduce padding from 20px to 12px, cube tiles from 48px to 34px, titles from 15px to 13px, and grid gaps from 16px to 10px. Descriptions use their natural full width. Details use a separate chevron. Four columns start at a 1050px chooser container, with three/two/one columns below.
- Browser widths 390/768/1100/1440 rendered one/two/three/four columns respectively. At 1440, synthetic cards measure 129–201px tall instead of the earlier stretched 269px, depending on content. Undescribed cards reserve no paragraph space. No horizontal overflow or application errors; no unexpected fixture requests. Mobile actions rendered 44px tall under the existing shared touch styles.
- Keyboard Space removes and Enter re-adds a basket; visible focus is a 2px outline. Add/Added toggles, catalogue refresh, and independent details all passed. Expanding a card leaves sibling heights unchanged. Empty details are explicit without selecting that basket. The chooser contains zero checkboxes/radios and no type selector.
- Main Line regression smoke check: an unchecked False ceiling line still exposes three mode radios after Special; In-house fills the synthetic ₹180 base without including the line. Existing save/reload, locked/error/denied state and recommendation behavior are covered by the focused rendered tests.
- Axe reported zero violations at all four widths (34 passing rules). At 1100 and 1440, color-contrast needs manual review because axe could not preload external font CSS; the browser console has four axe preload warnings and zero errors. Cards and focus were visually inspected in all four screenshots. No claim of a complete accessibility audit.
- Integrity review found no defects in stable-ID selection, disabled states, description lineage/compatibility, compact layout or QA fixture gating.
- Frontend final: `npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/estimationCatalogueApi.test.ts src/test/fixtures/enterpriseTransport.test.tsx`: **159 passed in six files**, exit 0. `npm run typecheck` and `npm run build`: exit 0. Build retains its chunks-over-500-kB warning.
- Backend final: `npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/api-docs.test.ts`: **84 passed** (34 replica-set, 50 API-doc), exit 0. `npm run typecheck` and `npm run build`: exit 0. Initial sandbox local-listener EPERM was resolved by the identical elevated test rerun; both logs retained.
- `git diff --check` passed; expected 40 modified and five new task files, no runtime additions. No dependencies, data migrations, production changes, commits, pushes or deployment. Full suites, unrelated initiation tests, and OCR were not repeated for this bounded follow-up. No lint script exists.
- Artifacts: `/tmp/lisno-basket-cards-qa/compact-baskets-{390,768,1100,1440}.png`, `compact-baskets-keyboard.png`, `responsive-evidence.json`, `interaction-evidence.json`, and frontend/backend test/typecheck/build logs. Ignored `frontend/dist/` and `backend/dist/` were regenerated by builds. All prior worktree changes preserved.

### Remove basket definitions and summary badges

Latest user corrections remove description/definition text and Sub Basket/Main Line/Temporary Item summary badges from all selection cards. Primary owns the card markup, its now-unused description/count CSS, and this documentation. Frontend owner updates affected existing card interaction tests and runs focused tests/typecheck after source stabilization. Preserve stored descriptions/API, compact grid, selection and detail disclosure contents. Primary performs a desktop/mobile rendered smoke check, frontend build, final review and hygiene; backend/full suites do not need repeating for this text-only presentation change.

Completed and verified: the card descriptions, count summary, obsolete accessibility references, and unused CSS are removed. Card accessible names/pressed state and independent expanded details remain intact. Scoped review found no defects.

- `cd frontend && npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx`: **68 passed** (40 + 28), exit 0.
- Frontend `npm run typecheck` and `npm run build`: exit 0. Build retains the existing large-chunk warning. `git diff --check` passed.
- Final rendered smoke at 1440 and 390px: six cards, zero description paragraphs or summary badges, four and one columns respectively. Desktop cards measure 102–103px; mobile 114–115px. No overflow, application errors, or unexpected fixture requests. Keyboard Add and independent details work; no dangling `aria-describedby`.
- Screenshots: `/tmp/lisno-basket-cards-qa/clean-basket-cards-{1440,390}.png`; structured evidence: `clean-basket-evidence.json` in the same directory. Browser and local dev server stopped after QA.
- Only the workspace component, scoped stylesheet, existing workspace test and these task documents changed in this continuation. Backend/full suites were not repeated; no dependency, data, API, migration, commit, push, or deployment actions.

### Selected-only compact Main Line controls

Continue approved Mode A for the user's current presentation correction. Baseline remains 40 modified/five new task files, with target changes understood and preserved. Frontend owner handles `ConfiguredEstimateBuilder.tsx`, its existing component tests and only Main Line CSS in `estimator-dashboard.css`; primary owns workspace/recommendation test adaptation, documents and browser QA. These paths can progress independently under the agreed contract.

1. Gate the complete Item type/mode/base-reference area with `line.included`, including persisted/read-only excluded rows. Keep included controls, preview fields and all state/pricing behavior intact.
2. Remove empty grid rows/field spans and arrange selected controls compactly beside each other where space allows, with accessible wrapping on narrow screens.
   Apply the user's subsequent reference using compact outlined radio tiles, restrained row borders, and narrower Quantity/Price/Amount fields; preserve the selected-only rule and current Standard/Special mode contract.
3. Adapt existing tests to select before changing modes and assert choices/overrides survive hiding, reselection, recommendations and save/reload. No finance/domain tests need changes.
4. After writers stabilize, focused builder/workspace/recommendation/state tests, frontend typecheck/build, bounded review, and desktop/tablet/mobile rendered interaction/height checks. No backend, dependencies, migration, commit or deployment scope.

Final selected-only row evidence:

- Entire type/mode/base block is rendered only for included items, including read-only and persisted rows. Hidden controls retain classification, mode, quantity and manual rate. Quantity, price, unchecked preview amounts, validation feedback and disabled state remain intact.
- Compact bordered rows and native outlined radio choices follow the latest reference. The numeric field group is bounded to 354px on desktop. Primary fields no longer span empty rows. Narrow containers place Amount below Quantity/Price, and unusually large amounts wrap without truncation.
- Final browser matrix at 1440/1024/390px: no horizontal overflow, application errors, or unexpected fixture requests. Unchecked rows have zero radios; selected Standard has two type radios; selected Special has two type plus three mode radios. Deselect/reselect restores PMC and a synthetic ₹177.35 manual rate at every width.
- Observed normal row heights: desktop 86px unchecked and 120px selected; 1024px viewport 86px unchecked, 141px Standard, 152px Special. Mobile wraps fields and controls. Real coarse-pointer emulation verified all five radio labels are 40px high with no overflow.
- Review raised the narrow Amount field edge. Browser reproduced overlap at 440px and it was fixed using a 480px container breakpoint and non-truncating amount wrapping. Final checks at 1440/440/390px for synthetic ₹12,34,56,700 and ₹1,23,45,67,00,000 confirmed contained text and no overlap with More options.
- Axe: zero violations, 35 passing rules; color-contrast remains marked incomplete because axe could not preload external font styles. Rendered colors/focus/layout inspected; this is not a complete accessibility audit. Browser console had zero errors and axe preload warnings only.
- Final `cd frontend && npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/configuredEstimate.test.ts`: **101 passed in four files**, exit 0. Frontend `npm run typecheck`: exit 0. Frontend `npm run build`: exit 0; repeated after the final CSS edge correction and passed, retaining the existing chunks-over-500-kB warning.
- Bounded integrity review and primary integration review found no remaining defects. `git diff --check` passed. Final implementation files: builder component/test, scoped estimator CSS, workspace/recommendation tests. State/domain/API/backend unchanged.
- Artifacts: `/tmp/lisno-compact-main-lines-qa/unchecked-{1440,1024,390}.png`, `special-{1440,1024,390}.png`, `large-amount-{10000,10000000}-{1440,440,390}.png`, `touch-special-390.png`, `browser-evidence.json`, and frontend test/typecheck/build logs. Final CSS build log is `frontend-build-final.log`. Browser/dev server stopped after QA; build refreshed ignored `frontend/dist/`.
- Full suites/backend/OCR were not repeated for this frontend-only correction. No new dependencies, migrations, data changes, commits, pushes or deployment. Prior worktree changes preserved.
