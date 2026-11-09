# Separate default Mode and tier Mode configuration task plan

Date: 2026-11-09
Status: specification and task plan approved. User selected Mode A. T0–T5 complete; implementation, independent integrity review, and final verification finished. Known unrelated baseline failures remain documented below.

Source of truth: [approved specification](../specs/2026-11-09-configuration-default-signature-modes-design.md).

## Outcome and execution boundary

Provide an always-available **Mode** plus separately saved **Signature Mode**, **Premium Mode**, and **Functional Mode** when their tiers are selected in saved Overview. Default starts not configured. Existing root configuration stays Signature; estimation still has three tier choices.

This gate writes only this plan. Implementation starts after plan approval and the execution-choice gate. Keep one parent task in progress: implement and verify independent Configuration modes. No migration, data copying, production mutation, deployment, commit, push, dependencies, or unrelated redesign.

## Preservation and settled contracts

Current dirty set contains only the new specification. Capture status and relevant diffs again before implementation; preserve any intervening user work. Do not assign a dirty target until its changes are understood. Root owns shared contracts, integration, and documentation.

Settle these interfaces in T0 before parallel writers begin:

- Preserve `KNOWLEDGE_MODE_TIERS`, `KnowledgeModeTier`, and Overview `applicableTiers` as the existing three financial tiers. Introduce a separate Configuration scope/type containing `default`, `signature`, `premium`, and `functional`; use names consistent with the existing modules.
- `mode` maps to explicit Configuration scope `default`; introduce `signature-mode` for existing Signature. Tier tabs remain conditional on **saved** Overview. Default is always available. Apply exact visible labels consistently to tabs, selector, summaries, and save commands.
- Existing root Advanced/Pricing payloads and omitted API scope remain Signature. Explicit Configuration `modeTier=default` projects and saves an independent `tierConfigurations.default` payload with its own applicability. Missing default is empty/not configured; no fallback or automatic copy.
- Scope existing supported Configuration section read/write and margin-read APIs. Runtime validation rejects invalid scopes, unsupported sections, nested namespace injection, and attempts to overwrite other scopes. Retain existing Signature-only legacy price-entry behavior.
- Keep estimation enumeration separate from retained Configuration traversal. Audit the existing `knowledgeModeTierPayloads`, projection/merge, additional-tier constants, and expansion callers before extending them: validation/reference scans must see retained default, while financial projection still enumerates only three tiers. Use a distinct Configuration traversal helper where necessary.
- All scopes share established section/aggregate CAS checks and transactions, while values, editor state, query keys, and responses stay scoped. Do not create independent versions that bypass the existing conflict rules.
- Margin summaries read the current selected Configuration scope. Existing bulk margin-apply entry points currently lack a tier parameter; preserve their established Signature behavior unless an existing action is actually invoked inside default Mode. Do not add a new bulk action as part of this request.
- All reference, revision-copy, duplication, and proposal-preservation paths must retain default data without granting another workflow permission to edit it. Existing permissions and active/history immutability remain authoritative.

## Tasks and ownership

### T0. Reconcile call sites and implement shared Configuration contracts

Owner: primary agent. Depends on all approval gates.

1. Record baseline status/diffs; trace each relevant Configuration API, data source, namespace helper, margin reader, reference scan, and financial enumeration caller.
2. Define the separate Configuration scope, guards, and labels in `shared/knowledge/knowledgeModeTiers.ts`. Preserve the three-tier exports and their defaults.
3. Update scoped Configuration fields in `shared/knowledge/knowledgeTypes.ts` and `shared/knowledge/knowledgeApi.ts`; touch `knowledgeSubBasketMarginTypes.ts` only if a supported existing operation needs the new scope. Shared Overview and financial values keep their current types.
4. Send exact names and semantics to the backend and frontend owners. Identify any missing direct consumer tests before handing off.

Exclusive ownership: `shared/knowledge/` changes and documentation. Backend/frontend agents must request shared-contract adjustments from root instead of editing these files.

Acceptance: AC2, AC4, AC5; API/type boundary settled without financial tier expansion.

### T1. Persist and validate independent default Configuration

Owner: one `backend_implementer` in Mode A; primary agent in Mode B. Depends on T0. Can run alongside T2.

Exclusive product paths:

- `backend/src/domain/ai-estimator-knowledge-mode-tiers.ts` and the scoped namespace validation in `ai-estimator-knowledge-validation.ts`.
- `backend/src/contracts/ai-estimator-knowledge.ts` and related Configuration margin contract only where required.
- `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`; inspect canonical operation/inventory checks and leave permission rules unchanged.
- `backend/src/services/ai-estimator-knowledge-item.service.ts`, `ai-estimator-knowledge-sub-basket-margins.ts`, `ai-estimator-knowledge-reference.service.ts`, and `ai-estimator-knowledge-specification-item-name.service.ts` as necessary for scoped reads/writes and retained references.
- Related proposal normalization/preservation helpers only if the new retained namespace otherwise fails compatibility checks; no change to external proposal permissions or pricing.
- Backend tests whose names start `ai-estimator-knowledge-`; a focused `ai-estimator-knowledge-configuration-modes.replica-set.test.ts` may be added using existing test helpers.

Deliverables:

1. Accept and verify explicit default scope on supported Configuration APIs; project correct payload/applicability and save only that scope. Omitted scope still returns Signature. Preserve typed specifications, calculations, descriptions, margins, legacy Signature prices, and all other namespaces.
2. Keep section and aggregate versions, actor audit scope, transaction boundaries, activation rules, immutable revisions, duplicate/revision copying, and failure responses correct. Missing default creates no new prerequisite for existing items.
3. Include default in relevant retained-reference scans and mutation fences so referenced modes, UOMs, components, names, and other masters cannot become dangling. Prevent proposal/publication preservation code from stripping or modifying it.
4. Exercise normal and temporary Main Lines, all four unequal scopes, two unequal Main Lines, missing default, hidden/re-enabled tiers, invalid/nested payloads, read-only/unauthorized actors, reference rejection, and concurrent stale saves.
5. Check default margin reads use the selected scope and never Signature fallback. Existing Signature bulk margin application must preserve default and other scopes.

No financial consumer feature work, new endpoint authorization, migration, model rewrite, or external delivery. If an additional path is required, report it to root before crossing ownership boundaries.

Acceptance: AC2–AC5. Run focused domain/API/model tests and replica-set persistence/reference tests for changed transactional paths.

### T2. Expose four independently scoped Configuration editors

Owner: one `frontend_implementer` in Mode A; primary agent in Mode B. Depends on T0. Can run alongside T1 against the settled contract.

Exclusive paths: `frontend/src/features/ai-estimator-knowledge/` for this feature, particularly:

- `knowledgeWorkspaceSections.ts`, `KnowledgeItemWorkspacePage.tsx`, `KnowledgeSectionNavigation.tsx` only if needed for the added tab.
- `knowledgeEditorDataSource.ts`, `knowledgeModeTierDataSource.ts`, associated query/mutation handling, `KnowledgeModeDefaults.tsx`, and `KnowledgeSavedConfigurationSummary.tsx` where scoping/labels require changes.
- `KnowledgeOverviewPanel.tsx` helper copy; preserve its three applicability checkboxes and Save Overview workflow.
- `KnowledgeModePanel.tsx` only for scope handling, empty defaults, scoped pending state, or labels; preserve existing editor behavior and visual system.
- Corresponding Configuration tests. Add focused `KnowledgeItemWorkspace.configurationModes.test.tsx` for the new behavior rather than rewriting unrelated screen tests.

Deliverables:

1. Render Mode, then selected Signature/Premium/Functional Mode tabs and mobile options. Default is visible with zero selected tiers. Saving Overview updates availability; failure/unsaved edits do not.
2. Explicitly bind default Advanced/Pricing requests and cache keys to `default`, and keep existing root Signature reads at `signature-mode`. Validate response ownership before showing or committing data.
3. Ensure editor drafts, pending changes, summaries, margin/default reads, last-saved feedback, retries, save labels, and conflicts cannot show or write another mode's values. Missing default remains not configured.
4. Preserve navigation guards and hidden active-tier behavior for **all three** optional tiers, including Signature. Keep dirty/in-flight edits guarded; a hidden clean tier falls back to Overview. Re-enabling retrieves retained data.
5. Use rendered interaction checks for Overview save success/failure, scope switching, default/Signature separation, two Main Lines, reload/cache isolation, read-only states, error/retry, keyboard navigation, and mobile selector labels.

No shared-file, backend, estimator/Sales/Client, or general styling changes. Preserve the recent estimate header and recommendation-popup work.

Acceptance: AC1–AC4, AC6. Run focused navigation, Overview, data-source, editor, summary, margin, and new workspace regressions.

### T3. Integrate and prove existing financial consumers are unchanged

Owner: primary agent. Depends on T1/T2 completion; read-only regression preparation can run during them.

1. Reconcile frontend/backend/shared contracts, inspect runtime/OpenAPI parity and the final namespace/helper call graph, and resolve any ownership dependencies.
2. Add asymmetric regression evidence that saving default values changes neither existing Signature/Premium/Functional catalogue prices nor estimate/Procurement calculations. Keep expected prices unequal across scopes and Main Lines so fallback cannot pass accidentally.
3. Own any necessary extensions to consumer tests `backend/tests/estimator-catalogue-estimate.replica-set.test.ts`, `estimate-tiers.replica-set.test.ts`, and `project-purchase-order-mode.replica-set.test.ts`; coordinate test fixtures without editing backend-agent-owned tests.
4. Check proposal preservation, reference coordination, summaries, revision cloning, and current-draft versus active source selection. Runtime default support is restricted to Configuration APIs; `default` remains invalid as an estimate tier.
5. Confirm no data relocation, automatic copying, mandatory default activation check, fourth estimator tier, migration, or unrelated edits were introduced.

Acceptance: AC2–AC6; especially current-source ownership and unchanged financial semantics.

### T4. Independent integrity review

Owner: `integrity_reviewer` in Mode A; primary agent inline in Mode B. Depends on all writers finishing.

Review the integrated diff read-only against AC1–AC6: independent storage/cache ownership, namespace preservation/injection checks, shared CAS, audit identity, permissions/history, optional-default completeness, reference and proposal retention, margin ownership, tab guards, and exclusion from three-tier financial enumeration. Review both absent-default legacy data and distinct values in all four scopes. Root resolves confirmed findings before final verification; reopen only checks affected by fixes.

### T5. Final integrated verification and handoff

Owner: `verification_runner` in Mode A after review; primary agent inline in Mode B. No concurrent product edits during final checks.

Start with these commands, adding any focused tests created by T1/T2:

```sh
cd frontend
npm test -- src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/ai-estimator-knowledge/KnowledgeModeDefaults.test.tsx src/features/ai-estimator-knowledge/knowledgeApi.test.ts src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts src/features/ai-estimator-knowledge/KnowledgeModeSpecificationsSave.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspace.clientPreview.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

```sh
cd backend
npm test -- tests/ai-estimator-knowledge-mode-tiers.test.ts tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-models.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-reference.service.test.ts tests/ai-estimator-knowledge-mode-defaults.test.ts
npm run typecheck
npm run build
```

Run relevant replica-set suites serially with the existing `startMongoReplicaSet` helper, using only ephemeral local test databases. Required lanes: new four-scope persistence/conflict tests, `ai-estimator-knowledge-integration.replica-set.test.ts`, `ai-estimator-knowledge-sub-basket-margins.replica-set.test.ts`, plus T3's catalogue/estimate/Procurement regression files. Include reference/specification-name/proposal replica-set tests when their corresponding production paths are changed. Do not weaken transactions or silently substitute mocked success if Mongo cannot start; report the exact unverified criteria and resolve environment issues within authorized local scope.

Run preservation regressions for the recent estimate changes: `LeadEstimateWorkspace.tiers.test.tsx`, `LeadEstimateWorkspace.checklist.test.tsx`, `ConfiguredEstimateBuilder.tierInfo.test.tsx`, `LeadEstimateRecommendations.test.tsx`, and `ClientEstimateTiers.test.tsx`. Confirm three-tier comparison/API validators still reject default as an estimate tier.

Browser checks with synthetic data must cover desktop and mobile four-tab/selector ordering, long labels/no overflow, no-tier and Signature-only availability, default initially empty, unequal values retained across switching/reload, Overview save behavior, keyboard/focus/unsaved guards, read-only/error states, and no unexpected network writes. Inspect the actual workspace, not only isolated tab markup.

Trace results to each acceptance criterion. Broaden tests for unresolved failures or shared-contract concerns; do not fix unrelated known failures or claim prior full-suite results as current verification. No lint script exists; OCR tests are outside scope. Run `git diff --check`, inspect the final diff/status against baseline, and remove only task-owned temporary browser artifacts/sessions. Report standard ignored build outputs.

## Dependency order and final report

- Mode A: T0 → T1 backend and T2 frontend in parallel → T3 integration → T4 review/fixes → T5 final verification. Root alone edits shared contracts. Every writer is told that other agents share the worktree and existing edits must be preserved.
- Mode B: primary agent performs the same sequence inline with no implementation subagents.
- Preserve stored default values and compatible readers/validators for any later rollback; no rollback or deployment is part of this task.
- Final report: implemented behavior, principal files/contract decisions, exact tests/checks/results, unrun checks and limitations, generated artifacts, and confirmation of no migrations/external actions. Do not call partially verified work complete.

## Execution record

Root implemented the shared Configuration scope/API types without widening the three estimation tiers. `configuration_modes_backend` implemented scoped persistence/validation/references/contracts, `configuration_modes_frontend` implemented navigation/data sources/editor feedback, and `configuration_modes_finance_regressions` added only the assigned consumer regression tests. Shared contracts remained root-owned; the backend/frontend writers had disjoint paths.

`configuration_modes_namespace_audit` checked remaining helper callers and found no missed retained-default traversal: financial catalogue component enumeration intentionally remains three-tier. `configuration_modes_integrity` reviewed the integrated diff after writers finished and found no confirmed defects. `configuration_modes_final_verification` owns the final frozen-source checks; root owns browser QA and cleanup.

Rendered verification used synthetic local data with the actual `KnowledgeItemWorkspacePage`, Auth/Query providers, Mode editor, and navigation:

- Desktop 1440×1000: the order is Overview, Mode, Signature Mode, Premium Mode, Functional Mode, then the existing remaining sections. No horizontal page overflow.
- Default started empty. Saved four distinct valid PMC ranges: Mode 12–18%, Signature 11–16%, Premium 13–18%, Functional 15–20%. Each produced one Advanced save to its own scope, with no other Main Line mutation. All values reopened exactly after a page reload.
- A second Main Line retained its original unequal values; its default was still empty and Signature remained 10.5–15.5%. Reading/switching modes caused no saves.
- Unsaved Overview checkbox edits kept all saved tabs. Saving no applicable tiers left Mode available and retained all four stored namespaces. Selecting/saving the three tiers restored the three tier tabs and their data.
- Mobile 390×844: the selector contains the four correct labels and opens each saved range independently. No horizontal page overflow. An active/read-only revision had zero enabled editor inputs and caused no saves.
- Existing validation rejected an invalid 5% PMC minimum; correcting it to the established valid range allowed the explicit save. No default fallback or manufactured price was used.
- Fresh final pages had no application console/network errors or unknown synthetic API requests. An earlier fixture-only HMR warning from re-running `createRoot` while editing the temporary fixture was cleared by a fresh load before final checks.

Pre-final evidence: financial consumer suites passed 167 tests across three replica-set files; focused frontend data-source/workspace checks passed 21 tests, and the updated KnowledgeScreens Configuration Mode tier block passed 6. Final counts and checks are recorded below once verification finishes.

Known backend baseline failures were independently reproduced in an isolated HEAD copy before final verification:

1. `ai-estimator-knowledge-routes.test.ts`: “permits Procurement vendor management and inline classifications without opening Configuration” expects 201 but receives 403.
2. `ai-estimator-knowledge-item.service.test.ts`: “rejects a new Budget price after induction approval is reopened” resolves instead of rejecting.
3. `ai-estimator-knowledge-reference.service.test.ts`: “strips references to the deleted Basket out of the configurations that survive” retains an additional reference.
4. The same reference suite: “reports what a deletion carries away and refuses none of it” returns an additional result.

Baseline logs: `/tmp/lisno-config-backend-route-head-baseline.log` and `/tmp/lisno-config-backend-services-head-baseline.log`. The full `KnowledgeScreens.test.tsx` run remains 106 passed/16 failed on known old selectors, temporary-link/status, and summary-source expectations; its intentionally affected Mode tier tests pass. Unrelated failures were not repaired.

## Final integrated results

The final frozen-source checks passed **1030 tests** and reproduced exactly the four backend baseline failures above. No new failures were found. Counts exclude earlier repeated runs:

- Frontend focus: **281 passed across 15 files**, exit 0. This was the nine-file T5 frontend command plus `KnowledgeItemWorkspace.configurationModes.test.tsx` and all five preservation files listed in T5, with `--maxWorkers=1`.
- `cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx -t 'Configuration Mode tiers' --maxWorkers=1`: **6 passed, 116 intentionally skipped**, exit 0.
- Backend: the exact seven-file focused command in T5 with `--maxWorkers=1`: **362 passed / 4 baseline failures across 7 files**, exit 1. Each failure was independently reproduced against HEAD; none concerns the added Configuration scope.
- The following full replica-set command: **381 passed across 8 files**, exit 0:

```sh
cd backend
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-sub-basket-margins.replica-set.test.ts tests/ai-estimator-knowledge-specification-item-names.replica-set.test.ts tests/vendor-basket-proposal.replica-set.test.ts tests/vendor-basket-proposal-publication.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-tiers.replica-set.test.ts tests/project-purchase-order-mode.replica-set.test.ts --maxWorkers=1
```

Frontend and backend `npm run typecheck` and `npm run build` each passed, exit 0. Final `git diff --check` passed and status/diff were inspected. Existing warnings remain: Mongoose's deprecated `new` option and Vite's large-chunk warning (3345 modules; main JavaScript 3335.84 kB, CSS 1575.20 kB). No package or lockfile changes were needed.

Final logs: `/tmp/lisno-configuration-final-backend-{focused,replicas,typecheck,build}.log` and `/tmp/lisno-configuration-final-frontend-{focused,screens,typecheck,build}.log`.

Acceptance reconciliation: AC1/AC6 covered by navigation/Overview/workspace tests and rendered desktop/mobile checks; AC2/AC3 by scoped data-source/cache tests, unequal browser round trips, and full persistence/margin/copy replica tests; AC4 by domain/API/reference/transaction/version/permission tests and review; AC5 by the full catalogue/estimate/Procurement regressions and unchanged three-tier enumeration.

Temporary browser fixture, screenshots, snapshots, console logs, and synthetic browser storage were removed; only the task-owned browser and Vite 5177 sessions were stopped. Standard ignored outputs remain in `backend/dist/`, `frontend/dist/`, and `frontend/node_modules/.tmp/*.tsbuildinfo`. Verification logs under `/tmp/` remain available for review.

Unrun: full unrelated frontend/backend suites, OCR, lint (no repository script), live migrations, seeds/backfills, production or external writes, commits, pushes, and deployment. The already documented baseline failures remain limitations of the repository's broader test state; this task did not change their behavior or attempt unrelated fixes.
