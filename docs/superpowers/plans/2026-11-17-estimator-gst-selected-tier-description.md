# Estimator GST-inclusive prices and selected-tier descriptions: task plan

Date: 2026-11-17
Status: Implemented and verified in Mode A, with the pre-existing failures listed below

Specification: [Approved design](../specs/2026-11-17-estimator-gst-selected-tier-description-design.md). The user approved the specification, task plan, and Mode A on 2026-11-17.

## Outcome and implementation contract

- Current web estimator item Price/Rate and Amount include 18% GST. The main amount uses the existing rounded grand total; historical main amounts use the recorded snapshot total.
- Saved monetary inputs remain net. GST is added only to display values, never to mutation payloads or existing gross totals. Net subtotals and historical line prices are identified as before GST.
- Client detail areas contain only the selected tier's saved Description, with no visible heading, specification list, default Mode fallback, or synthesized clauses. Empty descriptions render no paragraph.
- Configuration edits do not rewrite Description when unrelated mode/checklist settings change. Preserve authored text and existing save/clear behavior.
- Current source selection, permissions, stable IDs, immutable publications, finance baselines, and final-total rounding remain intact.

No new dependency, database migration, deployment, commit, push, or external communication is planned. Native mobile layout and immutable issued PDFs are outside scope.

## Initial state and ownership rules

At task-plan preparation, the only dirty path is the new approved specification. Product sources are clean. Before implementation, capture `git status --short`, the relevant diffs, and any newly dirty paths again. Preserve unrelated changes and explicitly reconcile ownership if a target becomes dirty.

Only one parent task is active at a time: preparation, implementation, integrity review, then final verification. Child slices may run concurrently within implementation after their dependencies are ready. Every writer must be told they share the worktree, must not revert others' edits, and may modify only assigned paths. Cross-boundary findings return to the primary agent.

The ownership below applies to Mode A. Mode B uses the same sequence inline, with the primary agent owning every task and no subagents. No agents start before the execution-mode gate.

## Dependency-ordered tasks

### T1. Establish the shared display contract and baseline

Owner: primary agent. Dependencies: approved task plan and selected execution mode. Acceptance: AC1, AC3, AC8.

1. Recheck dirty paths and inspect current pricing/description call sites against the approved specification. Record any pre-existing failures from focused baseline checks before changing their behavior.
2. Add a small pure presentation helper, proposed at `shared/estimation/estimateGstPresentation.ts`, and focused tests at `frontend/src/features/estimates/estimateGstPresentation.test.ts`. Finalize and share its import path and signature before pricing writers begin.
3. The helper accepts net integer paise, adds rounded 18% GST using checked integer arithmetic, and returns unavailable for invalid/unsafe input or overflow. It does not round to whole rupees, mutate inputs, or accept an already gross total. Explicit rupee-to-paise boundaries stay with existing consumers.
4. Cover zero, ₹100 → ₹118, ₹250 → ₹295, unequal net amounts, rounding boundaries, negative/fractional/unsafe inputs, and overflow. Demonstrate that gross line amounts are derived from net line amounts independently of rounded gross unit rates.
5. Confirm the target distinction: current editable/working prices may be projected gross; historical line amounts stay recorded net; historical main total uses its recorded snapshot total. Do not infer gross historical totals from revision-list subtotals.

### T2. Restrict the backend description to the selected tier

Owner: `backend_implementer` in Mode A. Dependency: T1 source/ownership review. Acceptance: AC4, AC6, AC8.

Owned production paths: `backend/src/domain/estimator-tier-description.ts`, description-related type/comments in `backend/src/services/estimator-catalogue.service.ts`, `backend/src/openapi.ts`, and `backend/src/openapi/estimate-tiers.ts`. Owned tests: `backend/tests/estimator-tier-description.test.ts`, `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`, and `backend/tests/estimate-tiers.replica-set.test.ts`.

1. Resolve only the requested tier's saved `modeDescription`; remove default Mode fallback and synchronization/generation from this projection.
2. Preserve source identity, current revision, tier applicability, string bounds, and malformed/disabled-source protections. Do not expose raw mode settings or specifications.
3. Keep the response shape unchanged and update OpenAPI wording to match actual selected-tier-only behavior. Preserve internal specification fallback.
4. Replace assertions for superseded description fallback and add distinct selected/default wording, independent Main Lines/revisions, cleared/missing/disabled inputs, and private-content sentinels. Verify existing price results and stored documents remain unchanged.
5. Run focused domain and real replica-set projection tests. No production database or application seed is used. Do not change transactional pricing services or models; report any proposed need to the primary agent first.

### T3. Decouple Description authoring from mode settings

Owner: `frontend_implementer` assigned to Configuration in Mode A. Dependency: T1 source/ownership review. Acceptance: AC5, AC8.

Owned paths: `frontend/src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.tsx` and `KnowledgeModeConfigurationBuilder.test.tsx`. Additional Configuration editor tests require explicit ownership reassignment. The Client preview is owned by T5.

1. Display the saved Description as authored instead of a synchronized paragraph.
2. Stop rewriting Description in `updateConfigurations`; preserve unrelated mode-setting updates and validation.
3. Retain explicit description save/cancel/clear, pending-edit handling, scope switching, and existing mutation/cache behavior.
4. Test nonempty saved text with selected inclusions/exclusions, settings edits, explicit clearing, long multiline text, and separate Signature/Premium/Functional values.
5. Do not remove shared description utilities still used elsewhere or rewrite stored historical text. Coordinate any additional save-path finding before editing another file.

### T4. Apply GST-inclusive prices in the staff estimator

Owner: `frontend_implementer` assigned to estimator pricing in Mode A. Dependency: completed T1 helper contract. Acceptance: AC1, AC2, AC3, AC7, AC8.

Owned production paths: `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, `EstimateComponentBreakdown.tsx`, and `EstimateRevisionView.tsx`. Own their directly associated tests, including `ConfiguredEstimateBuilder.sellingPrice.test.tsx`, `ConfiguredEstimateBuilder.tierInfo.test.tsx`, `LeadEstimateWorkspace.rounding.test.tsx`, `LeadEstimateWorkspace.revisions.test.tsx`, and other existing `LeadEstimateWorkspace.*.test.tsx` assertions affected by the new prominent amount. Shared components and CSS remain primary-agent owned.

1. Project valid current unit prices and line amounts through T1, with compact tax-inclusive labels and existing UOM/aggregate semantics. Preserve missing, stale, excluded, component, and overflow states.
2. Ensure current In-house breakdown prices do not silently contradict the new gross row display. Explicitly label any retained net financial breakdown. Keep saved read-only uses on their documented basis.
3. Use `totals.total` for the current prominent estimate amount. For historical navigation/footer, use the selected snapshot's recorded total with existing rupee/paise compatibility. Preserve loading/unavailable handling and never substitute the subtotal when the historical total is missing.
4. Add a concise visible tax label and matching accessible names. Keep Summary's subtotal/GST/round-off rows unchanged. Identify retained room/basket/proposal net subtotals as before GST.
5. Verify price-only presentation changes do not update draft rates, source fingerprints, quantities, mutation payloads, or saved amounts. Cover Vendor, PMC, legacy components, governed In-house, fractional quantities, tier changes, and save/reopen.
6. Keep historical item prices recorded net and visibly identify that basis. Return shared-style or consumer changes to T5 rather than editing its files.

### T5. Integrate client views, compact descriptions, and shared presentation

Owner: primary agent. Dependencies: T1 helper; integrate against T2/T3 contracts and T4 results. Acceptance: AC1–AC8 as applicable.

Owned areas: `frontend/src/features/estimates/EstimateLineTierDetails.tsx`, `estimate-line-tier-details.css`, `EstimateBuilderShell.tsx` if shared subtotal labels need adjustment, `frontend/src/styles/estimator-dashboard.css`, client working quotation/tier components, Configuration's `KnowledgeMainLineClientPreview.tsx`, their tests, and shared type comments. The primary agent also owns `configuredEstimate.test.ts`, `estimateDraftFingerprint.test.ts`, and all integration changes outside T2–T4's named paths.

1. Render description as a plain paragraph with an accessible item/tier association and no visible heading or repeated tier badge. Omit empty client content. Preserve separately authorized staff specification access and its keyboard behavior.
2. Apply T1 consistently to current client quotation/tier prices and Configuration Client preview. Keep component-price, unsaved-quantity, and unavailable feedback honest. Do not insert a live description into immutable publication snapshots.
3. Reconcile shared net subtotal labels without changing saved values or comparison/export contracts. Confirm existing comparison text still accurately says before/excluding GST.
4. Test client/private-content isolation, immediate tier replacement, source refresh/clearing, no-default fallback, escaped markup, and long descriptions. Update existing expectations affected by the removed heading/empty paragraph.
5. Reconcile all writers' diffs and test fixtures. Confirm description refresh stays outside dirty fingerprints and all pricing mutations still submit net values. Resolve overlapping findings sequentially.

### T6. Review integrated correctness

Owner: `integrity_reviewer` in Mode A; primary agent inline in Mode B. Dependencies: all T2–T5 writers finished. Acceptance: AC1–AC6, AC8.

Read-only review of the integrated diff must trace unit price → quantity-dependent net amount → display GST, and net subtotal → one GST calculation → final round-off. Inspect saved/revision selection, net mutation payloads, client visibility, description source identity, cache refresh, and authored-text preservation. Check at least two unequal items/projects and distinct tier/default descriptions.

Report findings with concrete file/behavior evidence. The primary agent assigns fixes within existing boundaries and resolves confirmed findings before final verification. Do not start final checks against a worktree with active writers.

### T7. Verify the integrated result and hand off

Owner: `verification_runner` in Mode A; primary agent inline in Mode B. Dependency: T6 findings resolved and all writers idle. Acceptance: AC1–AC8.

Run focused checks first, then compilation/builds and rendered QA. Record exact commands, results, and any environmental blockers in this plan during execution. A previous spec mentions an API-documentation enum failure; establish whether it still exists rather than treating historical reports as current evidence.

Required check groups:

- Backend: `cd backend && npm test -- tests/estimator-tier-description.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/estimate-total-rounding.test.ts tests/project-finance-rounding.test.ts tests/client-quotation-projection.test.ts tests/quotation-openapi.test.ts tests/api-docs.test.ts`. Replica-set cases must execute against their isolated test fixture; do not substitute weaker transaction semantics.
- Frontend pricing: run the new helper test, `ConfiguredEstimateBuilder.sellingPrice.test.tsx`, relevant `ConfiguredEstimateBuilder`/`LeadEstimateWorkspace` suites, `EstimateComponentBreakdown.test.tsx`, `EstimateRevisionView.test.tsx`, `ClientQuotationLine.aggregate.test.tsx`, `ClientQuotation.test.tsx`, and `ClientEstimateTiers.test.tsx` using `cd frontend && npm test -- <paths>`.
- Frontend descriptions: run `EstimateLineTierDetails.test.tsx`, `ClientQuotationLine.description.test.tsx`, `KnowledgeMainLineClientPreview.test.tsx`, `KnowledgeModeConfigurationBuilder.test.tsx`, `configuredEstimate.test.ts`, and `estimateDraftFingerprint.test.ts` using the same focused test command. Include existing Configuration save/cache tests if their path is implicated by T3.
- Compilation/builds: `cd backend && npm run typecheck && npm run build`; `cd frontend && npm run typecheck && npm run build`.
- Rendered QA: inspect synthetic current estimates at approximately 1440px and 390px widths. Cover rate-priced and aggregate lines, changing tier/quantity, main total/Summary agreement, old and new revisions, all three descriptions, blank/long descriptions, pending prices, and keyboard/accessibility behavior. Inspect console/network errors. Use existing browser tooling and synthetic fixtures; do not seed or mutate a real project.
- Hygiene: `git diff --check` and `git status --short`. Inspect the final diff and preserve unrelated work. Report and remove unnecessary ignored test/build/browser artifacts; do not stage them. No lint pass can be claimed because no lint script exists.

Broaden tests only if changed call sites or failures reveal additional risk. No OCR or native mobile UI checks are required by this bounded web change. If required verification cannot run, report the exact missing evidence and do not call the work fully verified.

Final handoff: outcome, principal decisions, affected files, exact checks and results, remaining limitations, and confirmation of unperformed production/external actions. Record the known limitation that previously saved wording is preserved rather than heuristically stripped.

## Parallel execution map

After T1, T2 backend, T3 Configuration editor, and T4 staff pricing can run concurrently in the three available child slots. The primary agent may work on its non-overlapping T5 files using the agreed contracts. Shared helpers, shared styles, client preview, and client quotation files have one owner throughout. T5 integration waits for all writer results. T6 integrity review and T7 final verification are sequential.

In Mode B, execute T1 through T7 inline in order. Task-plan approval advances only to the execution-choice gate; it does not authorize implementation before Mode A or B is selected.

## Progress

- Specification: approved by the user on 2026-11-17.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- Active parent: none; implementation, review, and verification are finished.
- T1 complete: `estimatePriceIncludingGst` uses checked paise; 19 focused tests passed.
- T2 complete: selected-tier-only backend projection and API documentation. Backend typecheck passed; 202 tests passed with one unrelated recommendation timeout, which passed in a targeted rerun (6 tests). Final integrated verification remains pending.
- T3 complete: 7 related editor/save/cache/navigation suites passed, 205 tests; final pending-review rerun passed 27 tests; frontend typecheck passed. Ownership expanded to `KnowledgeModeDescriptionEditor.tsx`, `KnowledgeModeDescription.test.tsx`, and `knowledgeModePendingChanges.ts`/`.test.ts` because those save/review paths also synthesized wording.
- T4 complete: staff pricing, totals, and historical-basis presentation implemented. Ownership expanded to legacy `EstimateBuilder` and `LineItemRow` plus direct tests to cover current legacy prices without writing gross values into net callbacks. Staff suite: 325 passed, 2 existing manual-rate collaboration failures reproduced on isolated HEAD source/tests; frontend typecheck passed. Evidence: `/tmp/lisno-staff-pricing-suite2.log`, `/tmp/lisno-staff-pricing-baseline.log`, `/tmp/lisno-staff-pricing-typecheck.log`.
- T5 complete: shared compact description, current client/preview gross pricing, and net subtotal labels integrated. Focused pricing-mode client suite passed 16 tests after label expectation updates.
- Baseline primary client tests: 5 files / 53 tests passed. Updated client/draft/fingerprint group: 4 files / 115 tests passed; frontend typecheck passed.
- Baseline API-documentation failure confirmed before edits: `backend/tests/api-docs.test.ts:165` expects three tiers, while the schema includes `default`. It is unrelated to this change and remains separately reported.
- Browser QA: actual staff workspace on synthetic transport checked at 1440×1000 and 390×844. A net ₹120 rate displays ₹141.60; quantity 11 yields header/footer/Summary total ₹2,148; saved request still contains `ratePaise: 12000` and quantity 11. No runtime errors, unexpected requests, or document overflow. Browser detection of an old net footer was corrected and the complete interaction rerun passed.
- Browser client QA: actual shared/client row components checked at both widths with rate-priced and aggregate lines. Three-tier switching, no description headings/specifications, absent descriptions, long text, stale aggregate-quantity feedback, and keyboard focus passed. Axe reported zero violations; no runtime errors or document overflow. Synthetic harness/scripts and screenshots are temporary and will be removed after final verification.
- T6 complete: reviewer found current Proposal item values still net. Corrected its configured unit prices and configured/legacy amounts with the same checked GST display helper, preserving the summary and historical/PDF branches. Re-review confirmed the finding resolved and no remaining blocking issues. Strengthened the regression to assert the amount element independently of the rate. Workspace/rounding focused tests passed 68 tests before this assertion-only tightening.
- Staff browser interaction rerun includes current Proposal rate/amount checks and passed after the correction. Header/footer/Summary reconciliation and net request assertions also passed.
- T7 complete: final integrated frontend cases passed after one unchanged isolated timeout rerun; 105 backend focused/integration tests passed. Both workspaces passed typecheck and production build. Final hygiene passed.

## Final verification evidence

The final frontend command, run from `frontend/`, was:

```sh
npm test -- src/features/estimates/estimateGstPresentation.test.ts src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.rounding.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LineItemRow.test.tsx src/features/leads/EstimateComponentBreakdown.test.tsx src/features/leads/EstimateRevisionView.test.tsx src/features/estimates/EstimateLineTierDetails.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.pricingMode.test.tsx src/features/client/ClientQuotationLine.description.test.tsx src/features/client/ClientQuotationLine.aggregate.test.tsx src/features/client/ClientEstimateTiers.test.tsx src/features/ai-estimator-knowledge/KnowledgeMainLineClientPreview.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/estimateDraftFingerprint.test.ts
```

Result: 426 passed, one timeout across 21 files (exit 1). The unchanged timeout case passed in 913 ms with the isolated command below (exit 0; one passed, 62 filtered), completing verification of all 427 cases. All new GST/description cases passed in the initial run.

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx -t 'selects empty baskets and saves direct and grouped temporary items with real parent IDs'
npm run typecheck && npm run build
```

Frontend typecheck and build both passed. Vite reported the existing large-chunk warning: main JavaScript approximately 3.416 MB before gzip, above the 500 kB warning threshold. No dependency or bundle-splitting changes were introduced for this feature.

Backend final commands, run from `backend/`:

```sh
npm test -- tests/estimator-tier-description.test.ts tests/estimate-total-rounding.test.ts tests/project-finance-rounding.test.ts tests/client-quotation-projection.test.ts tests/quotation-openapi.test.ts
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts -t 'estimator tier description|exposes saved descriptions'
npm run typecheck && npm run build
```

Results: 99 focused tests passed; six targeted replica-set tests passed with 155 unrelated cases filtered; typecheck/build passed without warnings. The complete replica suites had already run during T2, with their unrelated timeout passing on isolated rerun.

Final `git diff --check && git status --short` passed. No unrelated work was reverted, no lockfiles changed, and no runtime artifacts remain among the task's untracked deliverables.

### Known pre-existing failures and limits

- `backend/tests/api-docs.test.ts:165`: three-tier expectation conflicts with the schema's existing `default` tier. Reproduced before backend edits.
- `LeadEstimateWorkspace.collaboration.test.tsx`: the two cases named `preserves an incomplete manual rate when both the old rate and serialized edit are null` and `retains a partial rate typed while an earlier blank-rate save is in flight` expect manual editing despite existing read-only rates. Both reproduced against isolated HEAD sources and original tests. The remaining 325 staff-suite cases passed.
- Full unrelated workspace suites, native mobile, and OCR were not rerun. No lint script exists. Browser tests used isolated synthetic data, not live external services.
- Previously saved Description text remains intact; no heuristic cleanup or migration of old sentences was performed.

### Artifacts and external actions

Temporary browser harnesses, screenshots, CLI snapshots, browser scripts, and the isolated baseline copy were removed after inspection. Their temporary paths were `frontend/output/playwright/lisno-gst/`, `output/playwright/lisno-gst/`, the two task-created `.playwright-cli` files, and `/private/tmp/lisno-gst-*.cjs`. The dedicated local Vite server on port 4177 was stopped.

Verification logs remain at `/private/tmp/lisno-final-frontend-tests.log`, `/private/tmp/lisno-final-frontend-timeout-rerun.log`, `/private/tmp/lisno-final-frontend-typecheck.log`, `/private/tmp/lisno-final-frontend-build.log`, and the staff baseline/check logs listed above. Builds refreshed pre-existing ignored `frontend/dist/`, `backend/dist/`, and TypeScript caches; these are not deliverables and were not staged.

No dependency installation, schema migration, seed, backfill, production mutation, commit, push, deployment, or customer communication was performed.
