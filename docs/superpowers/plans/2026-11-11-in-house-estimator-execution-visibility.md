# In-house Estimator / Execution visibility implementation plan

Date: 2026-11-11
Status: Implemented and independently reviewed in approved Mode A. Feature verification passes; full-suite baseline failures and isolated HTTP reruns are recorded below.

Source of truth: [Approved specification](../specs/2026-11-11-in-house-estimator-execution-visibility-design.md).

## Outcome and boundaries

Add persisted Estimator / Execution radios when In-house is visible, plus an Include in price checkbox for each component. Both choices price the Super Admin's saved subset and show estimators one combined selling price. Execution additionally permits component detail for existing authorized Procurement users. Preserve existing access grants, calculation formulas, source checkboxes, Sub-Vendor basket names and approved financial history.

No dependencies, database backfill, migration, seed, deployment, commit, push or external communication are planned. Native changes are limited to compatibility with affected responses and preserving saved policy fields.

The specification and this plan were approved, and the user selected Mode A. T0–T7 are complete. The requested implementation is verified; the repository's broader test suites are not fully green because of the separately confirmed failures below.

## Contract decisions

- Add optional `inHouseUsage: "estimator" | "execution"` and `inHousePresetComponentIds: string[]` to each existing advanced mode scope. Neither present means legacy behavior. Partial or malformed explicit configuration is invalid, not legacy. Empty presets can be saved as incomplete drafts but cannot produce a valid price.
- Resolve policy and preset from the exact Main Line, current saved draft-or-active revision, and selected scope. Validate component membership, uniqueness and bounds; never inherit another tier's preset.
- Preserve `EstimateComponentPricing`, its component evidence and its strict parser as the internal/full-detail contract. Add a separate aggregate pricing DTO and parser carrying permitted line/revision/version/tier identity, quantity/UOM, exact `totalPaise` and an opaque pricing fingerprint. It must carry no selected IDs, component arrays, component targets, costs or margins. Aggregate transport does not create a new calculation formula or weaken the existing evidence validator.
- Extend catalogue and line/preview response types to distinguish governed aggregate pricing from legacy detailed pricing. Governed write requests supply ordinary estimate inputs and current pricing fingerprint; the backend resolves and records the preset. Accept an older client's echoed IDs only if they exactly match the current preset. Reject pricing-basis downgrade, changed IDs, stale fingerprints and forged amounts.
- Apply recipient projection after authoritative calculation. Preserve internal records and approved snapshots. Inventory all catalogue, preview, estimate, tier/quotation and export responses before declaring non-disclosure complete. Configuration readers retain their existing permitted full view.
- Procurement keeps approved selected IDs for historical source lines. The current exact-scope policy controls disclosure, not the current preset. Hide nested previews and grouped contributions consistently; preserve whole-source totals and label visible-only subtotals accurately.
- Use existing CAS, audit, digest and freshness mechanisms. Include policy/preset in relevant fingerprints and cache invalidation. No new role grants or unprotected routes are needed. Update OpenAPI for changed shapes and keep operation registration synchronized if any route definition changes.

## T0: Capture the baseline and response inventory

Owner: primary agent. Dependencies: implementation authorization. Acceptance: AC3, AC6, AC7, AC8.

1. Capture `git status --short`, relevant per-target diffs and focused test baselines before assigning writers. Preserve the eight already modified frontend files and the preceding Sub-Vendor task documents.
2. Confirm every affected read/write entry point and consumer using stable IDs: catalogue, estimate preview/save/read/publication, tier/quotation selection, Procurement detail/group/mode previews, and native parsing/saving. Record each response boundary and its test beside the implementing task.
3. In Mode A, bounded read-only audits of estimation disclosure and Procurement lineage may run independently. Their deliverables are path/contract/test findings, not code changes. Primary resolves overlaps before assigning writers.

Existing dirty product/test paths:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/knowledge-mode-reference.css`
- Builder, workspace configuration modes, mode description, PMC margin and PMC scope tests in that directory.

Earlier verification recorded unrelated failures in `KnowledgeModeSectionStateRemoval.test.tsx` and `KnowledgeModeLayout.test.tsx`. Reconcile against the current baseline; do not suppress tests or label a new failure pre-existing without evidence.

## T1: Shared policy and aggregate contracts

Owner: primary agent. Dependencies: T0. Acceptance: AC2, AC3, AC5, AC6, AC7.

Owned areas: `shared/knowledge/knowledgeInHouseComponents.ts`, `knowledgeModeConfiguration.ts`, `knowledgeModeTiers.ts`; `shared/estimation/estimateComponentPricing.ts` and a focused aggregate-contract module if separation is clearer. Primary owns shared files for the entire implementation.

1. Implement explicit legacy/valid/incomplete/invalid policy parsing, stable-ID subset validation and exact-scope projection/preservation helpers without changing component arithmetic.
2. Define the aggregate DTO, strict parser and line identity/fingerprint checks separately from full component evidence. Freeze and share the wire contract before backend or consumer writers start.
3. Add contract cases for malformed explicit fields, empty/duplicate/foreign presets, unsupported tiers, exact paise bounds, full-detail compatibility and rejected component fields in aggregate responses.

Exit evidence: focused shared/domain contract tests pass; downstream owners receive the same contract and selection/fingerprint semantics.

## T2: Configuration persistence and editor

Owners: Configuration backend owner, then Configuration frontend owner. Dependencies: T1. Acceptance: AC1, AC2, AC6, AC7.

Backend ownership: `backend/src/domain/ai-estimator-knowledge-validation.ts`, related knowledge domain/completeness helpers; `backend/src/services/ai-estimator-knowledge-in-house-components.service.ts`, `ai-estimator-knowledge-item.service.ts`; applicable knowledge contracts/OpenAPI and knowledge component tests. Do not edit estimation or Procurement services.

Frontend ownership: `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx`, `KnowledgeModePanel.tsx`, `KnowledgeInHouseComponents.tsx`, `knowledgeModeConfiguration.ts`, `knowledgeModePendingChanges.ts`, `knowledgeApi.ts`, necessary scoped styles and their tests. Explicitly preserve the existing dirty basket-name/check-button work.

1. Validate/persist both fields atomically with the current advanced scope and existing version/audit rules. Preserve other scopes and unknown-to-old-client policy data; reject incompatible erasing saves clearly.
2. Add the native radio group, unset helper, short visibility help and responsive placement. Follow existing read-only, saving, conflict and pending-change behavior.
3. Add Include in price controls and selected count. Do not auto-select on add/copy; preserve membership on settings transfer and radio switches. Confirm removal of included components and prune the ID only with that removal.
4. Test save/discard/retry, hide/reopen, native keyboard selection, empty preset, legacy preserved component, copy/removal, tier isolation and stale CAS.

The backend and frontend sub-slices can run concurrently after T1, with integration tests after both finish.

## T3: Authoritative estimation and recipient projection

Owner: estimation backend owner. Dependencies: T1; integration depends on T2 persistence. Acceptance: AC2, AC3, AC5, AC6, AC7.

Owned areas: `backend/src/services/estimate-component-pricing.service.ts`, `estimator-catalogue.service.ts`, relevant estimate/tier/quotation projection services; `backend/src/routes/estimates.ts`, `estimator-catalogue.ts`, `estimate-tiers.ts` and any traced existing estimate response boundary; estimation contracts/OpenAPI and corresponding backend tests. Primary assigns any additional shared route/service explicitly before editing it.

1. Resolve saved presets server-side for governed new/refreshed lines. Reuse exact quantity-aware component pricing and preserve full internal evidence, selected IDs and source versions.
2. Project aggregate responses for governed estimator consumers across the T0 inventory. Error messages, nested tiers and alternate read/export paths must not reveal hidden component data.
3. Reject overrides, stale preview/save/publication and alternate caller bypasses. Preserve saved editable evidence until explicit refresh/save; return the actionable Configuration changed state.
4. Keep approved/issued records untouched. Verify radio-only changes preserve numeric totals, while preset changes require explicit refresh of editable lines.
5. Test two unequal projects, three unequal components with a proper subset, different quantities/thresholds/margins, exact paise totals, unauthorized direct HTTP and unchanged estimator Procurement denial.

## T4: Procurement policy enforcement

Owner: Procurement backend owner. Dependencies: T1; integration depends on T2 and the finalized source contract from T3. Acceptance: AC4, AC5, AC6, AC7.

Owned areas: `backend/src/domain/procurement-in-house-components.ts`, `procurement-basket-projection.ts`, `procurement-basket-mode-groups.ts`; necessary Procurement service response boundaries and their tests. Do not edit estimation or Configuration files.

1. Resolve current policy by stable source Main Line and exact tier while retaining approved selected IDs and established current-cost rules.
2. Suppress Estimator-policy components in detail, groups, nested mode previews and alternative exposed paths. Malformed explicit policies fail closed with a non-disclosing configuration issue.
3. Keep whole-basket/project totals and unrelated authorized actions. Expose a clear partial-detail indicator when visible component subtotals omit hidden contributors.
4. Test mixed policies, absent policies, current draft precedence, inaccessible projects, historical approved subset versus changed preset, BOQ freshness and detail/aggregate reconciliation.

T2 backend, T3 and T4 can run as independent backend slices after T1 within the three-child limit. Each owns its tests. Shared contract changes return to the primary agent.

## T5: Web estimate and Procurement consumers

Owners: estimate frontend owner and Procurement frontend owner. Dependencies: finalized T1/T3/T4 response contracts. Acceptance: AC3, AC4, AC5, AC7.

Estimate ownership: `frontend/src/features/leads/estimationCatalogueApi.ts`, `leadsApi.ts`, `configuredEstimate.ts`, `ConfiguredEstimateBuilder.tsx`, `useConfiguredEstimateViewState.ts`, `EstimateComponentBreakdown.tsx`, affected preview/query hooks and tests. Procurement ownership: `frontend/src/features/procurement/ProcurementComponentBreakdown.tsx`, its response types/containers and tests. Primary resolves any cross-feature API ownership before parallel editing.

1. Render one Price including margin and exact line amount for governed estimation. Omit selectors, breakdowns and separate margins. Preserve permitted line identity, specification, quantity and UOM.
2. Keep the server's exact total authoritative; an effective rate is display-only. Handle loading, incomplete, stale, failed and retry states without falling back to old components or zero.
3. Invalidate affected catalogue/estimate/preview queries after saved Configuration changes; scope results to source/policy versions and ignore late responses. Remove obsolete details when policy refresh restricts them.
4. Render authorized Procurement details and the partial-detail indicator from backend data, retaining complete totals and valid actions.
5. Add rendered interaction tests for aggregate and legacy lines, transitions, stale responses, quantity/tier changes, forbidden detail and mixed-policy Procurement.

T2 frontend, T5 estimate and T5 Procurement own separate feature paths and can run concurrently once their contracts are fixed.

## T6: Native compatibility and integrated review

Owner: primary agent or a separately assigned native owner. Dependencies: T1, T3 and settled T5 contract behavior. Acceptance: AC3, AC6, AC7.

Owned areas: `mobile/src/features/estimate-authoring/staffEstimateApi.ts`, `staffEstimateModel.ts`, `configuredEstimate.ts`, `StaffEstimateWorkspace.tsx` and tests; the existing knowledge payload/save path as necessary. No native Configuration visual redesign.

1. Parse/display permitted aggregates without expecting or reconstructing hidden components. Preserve the full-detail legacy contract and existing native editing limitations.
2. Ensure compatible saves retain policy and pricing evidence. Unsupported writes fail explicitly instead of erasing fields or downgrading pricing.
3. After all writers finish, run an independent `integrity_reviewer` in Mode A, or equivalent primary review in Mode B. Review non-disclosure, forbidden writes, exact totals, source lineage, immutable history, cache races and compatibility. Resolve findings before final verification.

## T7: Final verification and handoff

Owner: `verification_runner` after writers/reviewer finish in Mode A; primary in Mode B. Acceptance: AC1–AC8.

Run focused checks first, then complete affected workspace typechecks, suites and builds. Use isolated disposable replica-set fixtures, never development/customer data.

Backend focused commands, from `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-in-house-components.test.ts tests/ai-estimator-knowledge-in-house-components.replica-set.test.ts
npm test -- tests/estimate-component-pricing-contract.test.ts tests/estimate-mode-pricing.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts
npm test -- tests/procurement-in-house-components.test.ts tests/procurement-basket-mode-groups.replica-set.test.ts tests/procurement-mongo.replica-set.test.ts
```

Include newly added policy/aggregate/API authorization tests and every changed route's relevant integration tests. From each of `backend/` and `frontend/`, run `npm run typecheck`, `npm test`, and `npm run build`, recording separate outcomes. Do not repeatedly rerun broad suites without a change or unresolved failure to justify it.

Frontend focused files include Configuration builder/workspace/components/transfer/pending-changes, configured-estimate/component-pricing and builder selling-price tests, and Procurement component-breakdown tests. Run `npm test -- <changed-test-paths>` from `frontend/` with the final exact paths recorded here.

Native checks from `mobile/`: `npm run typecheck`; `npm test -- --runInBand src/features/estimate-authoring/staffEstimateApi.test.ts src/features/estimate-authoring/staffEstimateModel.test.ts src/features/estimate-authoring/StaffEstimateWorkspace.test.tsx`; relevant changed knowledge tests and `npm run test:contracts` if shared API expectations change. A native release build is not required for a transport-only compatibility change; report it unrun.

Browser acceptance at desktop 1440px and mobile 390px, with a 320px overflow check: Configuration unset/Estimator/Execution, source combinations, keyboard radios and focus, subset selection, failed save, long basket names; estimator combined price and refresh state; authorized Procurement visible/hidden/mixed details. Use synthetic data and verify console/network errors. Record actual results and remove task-only fixtures/screenshots after inspection.

Finish with `git diff --check`, final diff review and `git status --short`. Report exact checks/results, separately attributable baseline failures, unrun checks, generated artifacts, and remaining risks. There is no repository lint script; do not report lint success. Do not call partially verified work complete.

## Acceptance trace

| Criteria | Implementing tasks | Required evidence |
| --- | --- | --- |
| AC1 controls | T2 | Save/discard/failure/read-only rendered tests; radio keyboard and responsive browser checks |
| AC2 subset | T1–T3 | At least three unequal components, proper subset, membership/empty/removal/override tests |
| AC3 non-disclosure | T0, T1, T3, T5, T6 | Response inventory, direct HTTP nested-payload assertions, unchanged Procurement denial, browser/native aggregate views |
| AC4 Procurement | T4, T5 | Approved-selection and mixed-policy nested/detail/group tests, full totals with partial-detail label |
| AC5 finance | T1, T3–T5 | Two unequal projects, quantity thresholds/margins/rounding, exact totals and radio invariance |
| AC6 lineage/history | T0–T4, T6 | Two Main Lines, four config scopes, draft precedence, unchanged approved snapshots/artifacts |
| AC7 compatibility/races | T1–T6 | CAS/fingerprint conflicts, late preview, malformed/legacy policies, old-client and native round trips |
| AC8 verification | T7 | Integrated checks after writers finish, review findings resolved, recorded results and hygiene |

## Execution log

- Planning: specification and task plan approved; Mode A selected.
- T0 complete: initial dirty paths and product diffs captured. Prior Sub-Vendor basket-name/check-button changes preserved. Response audits assigned independently for estimation and Procurement.
- T1/T2 complete: shared policy/aggregate contracts and Configuration persistence/UI implemented. Contract+Configuration replica-set lane 24/24 passes; previous component/pricing contracts 59/59 pass. Configuration rendered/pending/save tests 137/137 pass.
- T3–T6 implemented; independent integrity review found no unresolved confirmed product defects after corrections for removed-tier disclosure, native Configuration refresh, quotation availability, mode isolation, excluded native lines, and frozen estimate display/cache invalidation.
- Procurement focused evidence: domain 26/26, mode replica 43/43, request+group replica 26/26, frontend 58/58 and both workspace typechecks pass. Parallel Mongo startup contention was resolved by serial test execution; do not treat the failed contention run as passing.
- Native focused evidence: initial four-file 58/58 pass; subsequent rendered aggregate test adds one passing case, Workspace 15/15; native typecheck passes.
- Primary web model/Builder aggregate checks 9/9 pass. One existing component-pricing test still expects manual rate entry that HEAD already rejects; an isolated temporary HEAD model test reproduced unchanged behavior of 78,333 paise. Temporary baseline files removed. This failure is separate from the earlier known Configuration baseline failures.
- Browser interaction matrix at 1440/390/320 passed for radio exclusivity/keyboard, subset preservation, source hide/reopen, basket names, aggregate rate/total, Procurement detail removal and unchanged whole totals. Desktop/mobile screenshots inspected with actual component styles. Initial harness layout/style and HMR warnings were harness-only; the final clean matrix passed with no page errors, console errors, failed HTTP responses, or horizontal overflow. The synthetic harness used real product components and no live accounts/data. Failed-save and stale-refresh behavior was verified in rendered tests, not this browser harness.
- Additional client/quotation/submitted/published compatibility: 8 suites, 120/120 tests pass; frontend typecheck passes. Same-tier PMC/Sub-Vendor isolation and real quotation GET/candidate regressions: backend estimate-tiers + quotation-edits serial replica-set tests 149/149 pass and backend typecheck passes.
- Review corrections verified by primary: native excluded-line parsing/model 36/36; web saved revision display, immutable amounts with changed/missing/unavailable catalogue, aggregate model and Configuration query invalidation 71/71 pass. Saved JSON revision queries refresh after policy changes; stored PDF bytes remain untouched.
- Final review used dynamic reproductions for removed tiers, unchanged PMC/Sub-Vendor arithmetic, native dimension/tier/missing-source refresh, and actual authorization middleware. Estimator Procurement list/detail/preparation each returned 403/FORBIDDEN. Alternate Procurement getter review found no further disclosure route.
- Final native writer evidence: model/API/rendered Workspace 62/62 pass, including Configuration-only refresh after a legacy component line becomes governed, and mobile typecheck passes. Independent verifier's expanded native lane 70/70 passes.
- Both backend and frontend builds and typechecks pass. Full-suite results and comparison with an isolated HEAD baseline are recorded below. No source, dependency, or configuration changes were made to suppress baseline failures.

## Implemented response boundaries

| Boundary | Implementation and regression evidence |
| --- | --- |
| Configuration | Shared/backend policy parser validates exact scope and component IDs. Knowledge item persistence rejects old-client erasure. Builder, component editor and pending-change tests cover native radios, subset, save/discard, copy/removal and read-only states. |
| Catalogue, preview and estimate save | Internal catalogue retains full evidence; estimator route projection strips policy internals and component details. Preview/save resolve the authoritative preset and validate source versions/fingerprint. `estimator-catalogue-estimate.replica-set.test.ts` covers subsets, forged selection, policy refresh, radio arithmetic, removed tiers and frozen snapshots. |
| Estimate reads, revisions and publication | `estimate-in-house-presentation.ts` projects nested snapshots after calculation; missing exact tiers fail closed. Dynamic PDF paths use combined prices. Stored approvals and PDF bytes remain immutable. Presentation, proposal-PDF, revision and workspace tests cover exact historical totals. |
| Tier, quotation and assistant | Tier choices, quotation setup/candidates/edits, rendition caching and assistant pricing resolve governed presets and hide detail. Same-tier PMC/Sub-Vendor availability remains unchanged. Client, submitted and published views consume the aggregate contract. |
| Procurement | Visibility projection follows full calculation and approved-ID resolution. Basket/group/detail/preparation/mode/request paths suppress hidden components while retaining whole totals and commercial evidence. Replica-set tests include unequal projects and changed presets; estimator route permission checks remain denied. |
| Web cache and native | Saved policy changes invalidate affected current views and revision JSON. Native parser and refresh preserve exact totals and existing edit locks while removing stale details before dimension/tier early returns. Shared strict full-detail and aggregate contracts remain separate. |

## Verification artifacts and environment

- Browser harness, screenshots and logs were created under `frontend/output/playwright/inhouse-policy/`, inspected, then removed. The isolated browser and Vite server on port 4173 were stopped; existing user services were left running.
- Full verification logs used `/tmp/lisno-inhouse-*`. A temporary archive of HEAD at `/tmp/lisno-inhouse-head-verification` used symlinks to already installed dependencies for baseline comparison. The task-only archive, comparison reports and logs were removed after recording the results. No install or lockfile update was needed.
- Builds create the normal ignored `backend/dist`, `frontend/dist` and TypeScript build cache outputs. Native release packaging and OCR checks are outside this transport/UI task and were not run. There is no lint script.

## Final verification results

| Check | Result |
| --- | --- |
| Backend `npm run typecheck` and `npm run build` | Pass |
| Frontend `npm run typecheck` and `npm run build` | Pass; Vite reports the existing large-bundle warning |
| Backend full `npm test -- --no-file-parallelism` | 7,514 passed, 68 failed, 24 skipped out of 7,606 tests; 347 passed, 19 failed, 3 skipped files out of 369. Of the failures, 62 exactly match HEAD; the remaining 6 HTTP failures cleared in isolated reruns of both current and HEAD (55/55). |
| Frontend full `npm test -- --maxWorkers=2` | 6,849 passed, 98 failed, 6,947 total; 432 passed and 12 failed test files out of 444. Every failure reproduced on isolated HEAD. |
| Mobile `npm run typecheck` | Pass |
| Mobile focused command below | 70/70 pass |
| Mobile `npm run test:contracts` | 1 passed, 2 failed. Both failures are pre-existing permission/operation drift; the test and all 7 canonical inputs are byte-identical to HEAD. Protected-operation expectation 478 versus actual 506. |
| Integrated focused backend and frontend commands below | Backend 46/46 and frontend 43/43 pass |
| Browser | Real components at 1440, 390, 320 pixels pass the recorded interaction/overflow/error matrix |
| Independent integrity review | No unresolved confirmed product defect after verified corrections |
| Final hygiene | `git diff --check` passes; final status contains only the preserved initial work and assigned implementation/docs. No dependency or lockfile changes. |

Exact final focused commands, from the named workspace:

```sh
# backend
npm test -- tests/in-house-usage-contract.test.ts tests/estimate-in-house-presentation.test.ts tests/procurement-in-house-components.test.ts --maxWorkers=2
# frontend
npm test -- src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/leads/EstimateRevisionView.test.tsx src/features/procurement/ProcurementComponentBreakdown.test.tsx --maxWorkers=2
# mobile
npm test -- --runInBand src/features/estimate-authoring/staffEstimateApi.test.ts src/features/estimate-authoring/staffEstimateModel.test.ts src/features/estimate-authoring/StaffEstimateWorkspace.test.tsx src/features/knowledge/knowledgeWorkspaceDraft.test.ts
```

The following frontend failure counts reproduced on the original HEAD using the same installed dependencies in a separate temporary archive. Mechanical comparison confirmed the same failed test names and first assertion/error messages, and the isolated batches total 453 passed/98 failed across 551 tests. These failures were not suppressed or altered:

| Test file | Matching failures |
| --- | ---: |
| `KnowledgeModeSectionStateRemoval.test.tsx` | 31 |
| `enterpriseTransport.test.tsx` | 5 |
| `AskLisnoLauncher.test.tsx` | 34 |
| `EstimateReviewPanel.collapsible.test.tsx` | 1 |
| `configuredEstimate.componentPricing.test.tsx` | 1 |
| `KnowledgeItemWorkspaceLayout.test.tsx` | 4 |
| `LeadEstimateWorkspace.collaboration.test.tsx` | 2 |
| `KnowledgeModeLayout.test.tsx` | 1 |
| `router.test.tsx` | 1 |
| `KnowledgeScreens.test.tsx` | 16 |
| `LeadEstimateWorkspace.tiers.test.tsx` | 1 |
| `configuredEstimate.groupTiers.test.ts` | 1 |

Backend comparison used the same installed dependencies, disposable test databases and local HTTP listeners. Across the 19 affected files, HEAD produced 820 passes and 62 failures out of 882 tests after isolating transient route failures. All 62 baseline failure names and first assertion/error messages match the integrated run:

| Backend test file | Matching baseline failures |
| --- | ---: |
| `ai-estimator-knowledge-basket-quality.replica-set.test.ts` | 1 |
| `design-workflow-submission-gates.test.ts` | 1 |
| `mongo-repository.test.ts` | 3 |
| `collaborative-finance-issue.replica-set.test.ts` | 4 |
| `ai-estimator-knowledge-item.service.test.ts` | 1 |
| `ai-estimator-knowledge-reference.service.test.ts` | 2 |
| `ai-estimator-knowledge-routes.test.ts` | 1 |
| `repository.test.ts` | 1 |
| `authorization-policy.test.ts` | 1 |
| `config.test.ts` | 4 |
| `ai-estimator-knowledge-bootstrap.test.ts` | 2 |
| `ai-estimator-knowledge-domain.test.ts` | 2 |
| `leads.test.ts` | 2 |
| `project-number-mongo.replica-set.test.ts` | 34 |
| `estimate-collaboration.replica-set.test.ts` | 1 |
| `super-admin-dashboard.test.ts` | 1 |
| `api-docs.test.ts` | 1 |

The other six full-run failures occurred in `vendor-basket-proposal-master-routes.test.ts` (five) and `sales-initiated-projects.test.ts` (one): socket resets/hangup plus one unexpected route status. Both files passed all 55 tests when rerun together serially on current code and HEAD. They are recorded as transient full-run failures, not claimed as baseline assertion failures.

The 24 skipped backend tests are opt-in Python-assistant tests in `assistant-rules-mongo.replica-set`, `assistant-rules-integration` and `assistant-python-bridge`; `LISNO_ASSISTANT_TEST_PYTHON` was unset. Native release packaging, OCR verification and deployment were not performed. No migration, seed, backfill, commit, push or production mutation occurred.
