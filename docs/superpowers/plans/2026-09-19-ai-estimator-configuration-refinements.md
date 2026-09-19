# AI Estimator configuration refinements implementation plan

Status: completed, including the follow-up Main Line workspace rename correction. Specification and task plan approved; Mode A implementation, integrity review, and final verification complete.

Specification: [AI Estimator configuration refinements](../specs/2026-09-19-ai-estimator-configuration-refinements-design.md)

## Outcome and fixed contract

Implement the approved seven-part Configuration refinement as one coordinated frontend/backend change:

1. keep Main Basket renaming available and reliable in the Super Admin management flow;
2. add `pmcMinimumMarginBps` while retaining `pmcMarginBps` as Max. and preserving PMC's 10%–20% domain;
3. calculate PMC discount from the PMC charge only;
4. add source-owned In-house Inclusion/Exclusion lists with Supplier, Execution, and Labour starter rows;
5. render a reconciling Labour + Material expense/margin breakdown;
6. reduce Quick summary's Mode group to three configured/not-configured statuses;
7. initialize Mode/source selection from saved data and allow authorized Super Admin to create/select a Main Basket inside Add temporary item.

The approved specification is authoritative. Sub-Vendor pricing and discount behavior remain unchanged. No migration, backfill, dependency, seed, commit, push, deployment, or production write is part of this plan.

## Baseline and safety controls

- At plan creation, the only dirty path is the untracked approved specification. This plan is the second expected untracked document. Before implementation, capture `git status --short` plus focused diffs for every assigned target; preserve all unrelated work appearing later.
- Do not stage or commit. Do not run bootstrap, seed, migration, or provisioning scripts.
- Keep integer paise and integer basis points authoritative. The frontend may validate server arithmetic but must not substitute locally manufactured financial results.
- Preserve stable Basket, configuration, item, revision, and checklist-row IDs. Names remain presentation and duplicate-validation values, never joins.
- Backend route operations, item `allowedActions`, section/aggregate versions, immutable Active history, and audit writes remain authoritative.
- Keep NodeNext `.js` suffixes on backend relative imports.

## Ownership boundaries

These boundaries apply if execution mode A is selected. Mode B performs the same tasks inline and sequentially.

### Backend contract and finance owner

Owns only backend AI Estimator contracts, validation, preview arithmetic, route/OpenAPI handling, persistence compatibility, basket-service checks, and their tests. Expected paths include:

- `backend/src/contracts/ai-estimator-knowledge.ts`
- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`
- `backend/src/domain/ai-estimator-knowledge-validation.ts`
- `backend/src/routes/ai-estimator-knowledge-admin.ts`
- `backend/src/openapi/ai-estimator-knowledge.ts`
- directly affected model/service compatibility code
- relevant `backend/tests/ai-estimator-knowledge-*.test.ts` and replica-set tests

Must not edit frontend sources or repository documents.

### Frontend Mode and calculation owner

Owns the PMC range, In-house scope, saved source selection, shared description/pending/conflict projections, PMC simulator, In-house breakdown, related types, focused Mode styles, and tests. Expected paths include:

- `KnowledgeModePanel.tsx`
- `KnowledgeModeConfigurationBuilder.tsx`
- `KnowledgeModeCalculationSimulator.tsx`
- `KnowledgeInHouseTotal.tsx`
- `KnowledgePmcMarginInput.tsx`, `knowledgePmcMargin.ts`
- `KnowledgePmcScopeChecklist.tsx`, `knowledgePmcScope.ts`
- `knowledgeModeConfiguration.ts`, `knowledgeModeDescription.ts`, `knowledgeModePendingChanges.ts`
- `KnowledgeConflictReview.tsx`
- `knowledgeTypes.ts` and the preview request/response portion of `knowledgeApi.ts`
- directly related CSS and tests

Must not edit Basket management, temporary-item dialog, saved-summary projection, backend sources, or repository documents.

### Frontend Basket and summary owner

Owns Main Basket rename/cache behavior, inline basket creation in the temporary-item flow, compact saved Mode status projection/rendering, query synchronization, relevant styles, and tests. Expected paths include:

- `KnowledgeBaseIndexPage.tsx`
- `CreateKnowledgeItemDialog.tsx`
- `knowledgeMutationSync.ts`, `knowledgeQueryKeys.ts` when required
- `knowledgeSavedSummary.ts`, `knowledgeSavedSummaryTypes.ts`
- `KnowledgeSavedConfigurationSummary.tsx`, `KnowledgeHierarchySummary.tsx`, `useKnowledgeSavedSummary.ts`
- directly related CSS and tests

Must not edit the Mode editor/simulators, backend sources, shared preview types, or repository documents. It should consume the approved `pmcMinimumMarginBps` shape and existing basket API functions without redefining them.

### Primary agent

Owns the approved spec/plan, cross-slice contract reconciliation, any unavoidable shared-file coordination, final integrated diff, reviewer findings, and handoff. The primary must inspect agent output before accepting it and must not let separate owners create incompatible fallback semantics.

## Dependency-ordered task graph

### Task 0 — Reconfirm baseline and contract map

**Owner:** primary. **Dependencies:** task-plan approval and execution-mode selection. **Acceptance criteria:** all ACs; no behavior change.

1. Record the initial dirty-path set and focused target diffs. Confirm the approved specification and plan are the only expected documents before writers start.
2. Reconfirm the exact shared contract:
   - `pmcMinimumMarginBps` = Min.; `pmcMarginBps` = Max.; missing Min. means the legacy equal pair;
   - PMC configuration domain remains 1,000–2,000 integer basis points;
   - preview request still submits one selected `pmcCalculation.pmcMarginBps`;
   - PMC discount amount is rounded from pre-discount PMC charge;
   - In-house scope arrays live on canonical `execution / in_house` configuration;
   - persisted status definitions and saved-selection evidence match the specification.
3. Identify any target already modified after this plan was written. Reassign ownership explicitly before an agent edits a dirty target.

**Parallelism:** none. This is the prerequisite for all writers.

### Task 1 — Backend PMC range, financial preview, and scope contract

**Owner:** backend contract and finance owner. **Dependencies:** task 0. **Criteria:** AC2, AC3, AC4, AC5, AC10.

1. Add optional `pmcMinimumMarginBps` to the advanced-section allowlist/OpenAPI representation. Implement an effective legacy PMC range helper or equivalent single source used by validation/copy behavior.
2. Validate both PMC values as safe integer basis points from 1,000 to 2,000, allow an entirely empty pair, reject explicit partial and reversed pairs, and keep missing-minimum legacy data readable as an equal pair. Extend the narrow trusted Active-to-Draft compatibility behavior only as needed; normal writes and activation stay strict.
3. Permit `inclusions`/`exclusions` on canonical In-house configurations and retain rejection for irrelevant/recovery shapes. Apply existing bounded rows, stable IDs, normalized-name conflict, maximum-list-size, and selected-in-both validation independently per source.
4. Split or parameterize the shared PMC/Sub-Vendor margin calculator so PMC computes `discount = roundHalfUp(PMC charge × discount rate)` while Sub-Vendor continues discounting selling price. Set PMC `finalVendorChargesPaise` to preserved adjusted cost and keep response fields internally reconcilable.
5. Keep low-quantity impact, quantity parsing, selling-price division, overflow checks, response envelope/version, authorization, and Sub-Vendor behavior unchanged.
6. Update route runtime schemas and OpenAPI descriptions/examples for the Min./Max. persisted pair and PMC charge-only discount. Ensure direct preview requests cannot bypass the selected single PMC rate bounds.
7. Confirm Basket rename/create backend behavior already supplies trimmed-name validation, uniqueness, expected-version conflict, audit, and no-write-on-failure guarantees. Add or adjust focused tests only where the requested management and inline-creation flows expose a contract gap; avoid duplicating unchanged service behavior.
8. Add tests for legacy equal-pair reads, first persisted pair, valid unequal values, empty/partial/reversed/out-of-range/unsafe values, copy/save/activation, direct invalid writes, scope isolation/conflicts, exact PMC examples, half-up ties, 0%/100% discounts, thresholds, overflow, and Sub-Vendor regression.

**Deliverable:** authoritative backend contract and regression evidence. No frontend edits.

### Task 2 — Frontend PMC range and simulator arithmetic

**Owner:** frontend Mode and calculation owner. **Dependencies:** task 0; may run in parallel with tasks 1 and 3 using the fixed contract. **Criteria:** AC2, AC3, AC4, AC10.

1. Generalize the existing range utilities/components without relaxing Sub-Vendor. Add PMC effective-range, pair-validation, and first-edit materialization helpers. Preserve invalid text for correction and distinguish absent legacy Min. from explicit `null`.
2. Replace the single PMC field with accessible adjacent Min./Max. controls and one concise 10%–20%, Min. <= Max. hint. Wire validation focus, Save/Discard, pending changes, accepted conflict counterparts, and server issue paths for both fields.
3. Update the PMC simulator to show both configured values, default to Max., offer Min./Max. selection, invalidate pending/settled results when the basis changes, and submit the exact selected value through the existing request field.
4. Update PMC response verification and presentation for charge-only discount: adjusted cost, pre-discount PMC charge, discount on PMC charge, effective PMC charge, and Final total. Reject the old selling-price discount response even if individual fields appear additive.
5. Preserve loading, missing UOM, invalid configuration, read-only, automatic recalculation, stale request, retry, close/reopen, zero, overflow, and keyboard behavior.
6. Extend focused helpers/component/integration tests, including legacy no-write reads, first edit, unequal pair persistence payload, basis switching during a request, exact ₹269.50 example, and unaffected Sub-Vendor behavior.

**Deliverable:** complete PMC frontend flow using the approved backend shape. No Basket/summary/backend edits.

### Task 3 — In-house scope, breakup, and saved selection

**Owner:** frontend Mode and calculation owner, performed after its Task 2 edits within the same ownership lane. **Dependencies:** task 2 file baseline; backend contract remains fixed. **Criteria:** AC5, AC6, AC8, AC10.

1. Extend the scope parser/presentation so the current PMC/Sub-Vendor lists remain unchanged and canonical In-house configurations can own separate lists.
2. Render Supplier, Execution, and Labour starter rows without mutating the draft on open. On first interaction, materialize both lists and a stable canonical In-house configuration. Respect explicitly saved empty/deleted lists on reload.
3. Reuse mutual-exclusion, normalized-name, add/delete, focus recovery, validation focus, responsive, and read-only behavior. Publish source-labelled pending changes, conflict rows, and generated/shared description text.
4. Initialize local Mode and Execution-source selection from matched saved payload evidence. Key reset/synchronization by item/revision/source, retain PMC as the view-only default for a truly empty revision, and keep unchecking as hide-only behavior.
5. Replace the three-total In-house result with the approved six-component equation plus Subtotal, deriving only from backend-returned integer paise. Validate both reconciliation equalities and route mismatches into calculation error/retry state.
6. Preserve automatic preview behavior, discount cap/effective markup rules, one shared quantity/basis, UOM behavior, and separate Labour/Material settings.
7. Add tests for starter no-write state, first selection, saved empty/deleted rows, identical cross-source names, conflicts, custom rows, description/pending/conflict output, two-item/revision selection isolation, view-only defaults, hide/show behavior, discounted and undiscounted reconciliation, signed/zero values, and mismatched responses.

**Deliverable:** complete In-house and selection behavior. No Basket/summary/backend edits.

### Task 4 — Basket management and temporary-item inline creation

**Owner:** frontend Basket and summary owner. **Dependencies:** task 0; may run in parallel with tasks 1–3. **Criteria:** AC1, AC1a, AC9, AC10.

1. Verify and, where needed, correct Super Admin **Manage main baskets** edit affordance so active and inactive baskets with update permission can rename through the existing editor. Keep archived restrictions and lifecycle behavior unchanged.
2. Expose **Edit Main Line** on non-archived item workspaces for Super Admin with update permission. Reuse the existing version-checked Main Line update API, refresh dependent queries after success, and cover success, permission, and archived states.
3. After a rename, synchronize/invalidate basket lists, item lists, temporary item details, selectors, deletion-impact views, and any other query keys proven to carry the name. Use returned stable IDs and data; avoid name-based cache joins.
4. Add an inline **Add main basket** state to `CreateKnowledgeItemDialog` for temporary items when role is Super Admin and create permission is present. Keep it available with populated and empty lists, using the zero-basket message as the primary entry point.
5. Preserve temporary item name/sub-basket draft, dirty-close behavior, error descriptions, and focus while creating. Lock duplicate submissions, call the existing create API, cache/select the returned basket, refresh all basket-list variants, announce success, and allow one final temporary-item submission.
6. Handle duplicate, denied, validation, network, and ambiguous create outcomes without clearing the temporary-item form or retrying blindly. Reuse existing reconciliation conventions where applicable.
7. Add component/application tests for active/inactive rename, duplicate/stale/denied failures, cache refresh, selector visibility, zero/existing-basket inline creation, permission/role asymmetry, focus, preserved draft, retry, and no double submission.

**Deliverable:** Basket flows only. No Mode/simulator/backend edits.

### Task 5 — Compact persisted Mode status summary

**Owner:** frontend Basket and summary owner, after its Task 4 edits within the same lane. **Dependencies:** approved payload contract; may proceed alongside tasks 1–3. **Criteria:** AC7, AC10.

1. Replace Mode's detailed saved projection with three rows derived from the matched persisted advanced section:
   - PMC configured/not configured;
   - Sub-Vendor configured/not configured;
   - In-house configured/not configured.
2. Reuse authoritative validators/effective range helpers where dependency direction remains safe. Do not import editor state, simulator results, default-seeding helpers, or detail projections that manufacture values.
3. Apply the approved completeness rules: valid calculation plus valid effective margin pair for PMC/Sub-Vendor, and valid Labour plus Material calculations for In-house. Optional scope lists do not determine financial configuration status.
4. Suppress the Mode **Show details** disclosure by making preview and detail content exactly the three status rows. Remove Specifications from the Mode Quick summary only; leave the Specifications editor and all saved data untouched.
5. Retain source loading/error/denied/stale notices, matched-envelope guards, hierarchy names, and the other Overview/Recommendation/Quality groups.
6. Add pure projection and rendered hook/component tests for all eight asymmetric configured combinations, legacy missing-minimum pairs, invalid/partial saved values, zero-like valid values, source mismatch, denied/loading/refresh errors, no disclosure, and unchanged other groups.

**Deliverable:** compact saved Mode status only. No Mode editor/backend edits.

### Task 6 — Integrated reconciliation and targeted fixes

**Owner:** primary. **Dependencies:** tasks 1–5 complete. **Criteria:** AC1–AC10.

1. Inspect the complete diff against the captured baseline. Reconcile shared types, API schemas, labels, rounding expectations, validation paths, query keys, and CSS without crossing unreviewed ownership boundaries.
2. Verify exact frontend/backend agreement for:
   - PMC Min./Max. field names and legacy fallback;
   - all bounds/null/partial/order cases;
   - PMC charge-only discount and response semantics;
   - canonical In-house scope shapes;
   - saved-selection evidence and Quick summary completeness;
   - basket cache updates and role/permission gates.
3. Run the smallest focused tests needed to expose integration failures, fix only in-scope defects, and repeat affected checks. Do not broaden into unrelated cleanup.
4. Review responsive/accessibility code paths before browser QA: labels/descriptions, field groups, focus return, live regions, keyboard actions, zoom/wrapping, and no horizontal overflow.

**Deliverable:** one coherent integrated implementation ready for independent review.

### Task 7 — Integrity review

**Owner:** `integrity_reviewer` in Mode A; primary performs the equivalent sequential review in Mode B. **Dependencies:** task 6. **Criteria:** AC1–AC10.

Review read-only for:

- financial basis, half-up rounding, overflow, and Sub-Vendor isolation;
- authorization, expected versions, no-write-on-rejection, Active-history immutability, audit and replica-set transaction behavior;
- legacy compatibility and first-edit materialization;
- stable-ID lineage and source isolation for In-house scope;
- saved versus local state in selection and Quick summary;
- query invalidation completeness and rename/create races;
- stale preview responses, duplicate basket submission, focus/accessibility, and responsive regression.

Classify findings by severity with exact paths/evidence. The primary resolves all material in-scope findings and reruns affected focused checks before task 8.

### Task 8 — Final verification and visual QA

**Owner:** `verification_runner` in Mode A; primary performs sequential verification in Mode B. **Dependencies:** task 7 findings resolved. **Criteria:** AC1–AC10.

Run verification on the final integrated worktree, not while writers are active.

#### Backend focused checks

```bash
cd backend
npm test -- \
  tests/ai-estimator-knowledge-validation.test.ts \
  tests/ai-estimator-knowledge-mode-calculation.test.ts \
  tests/ai-estimator-knowledge-pmc-calculation.test.ts \
  tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts \
  tests/ai-estimator-knowledge-reference.service.test.ts \
  tests/ai-estimator-knowledge-routes.test.ts \
  tests/api-docs.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
```

The replica-set selection must exercise valid/invalid PMC pair save and activation, legacy copy, audit/version no-write failures, In-house list persistence/conflicts, and two unequal Main Lines.

#### Frontend focused checks

```bash
cd frontend
npm test -- \
  src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeDescription.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModePendingChanges.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx \
  src/features/ai-estimator-knowledge/CreateKnowledgeItemDialog.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeHierarchySummary.test.tsx \
  src/features/ai-estimator-knowledge/knowledgeSavedSummary.test.ts \
  src/features/ai-estimator-knowledge/useKnowledgeSavedSummary.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
```

Add directly affected lifecycle/state/layout tests to this command if implementation changes them.

#### Full workspace checks

```bash
cd backend && npm run typecheck && npm test && npm run build
cd frontend && npm run typecheck && npm test && npm run build
```

If a full suite fails, reproduce suspected unrelated failures against the initial baseline before classifying them. Never describe a partially passing suite as passed.

#### Rendered interaction matrix

Use an isolated local backend/database or existing deterministic UI fixture; do not use production data. Check at minimum desktop 1440px, tablet 768px, and mobile 390px widths:

1. PMC Min./Max. edit, validation, Save/Discard/reopen, Max./Min. simulator choice, 10% discount exact output, loading/error/retry, and stale basis switch.
2. In-house starter scope no-write opening, choice conflict tooltip/description, custom add/delete, Save/reopen, and discounted/undiscounted cost breakup.
3. saved PMC + Execution source selection after reopen, asymmetric second item/revision, hide/show without dirty state, and validation reopening hidden content.
4. Quick summary with configured and unconfigured combinations, no Mode disclosure/details, retained load/error notice, and unchanged surrounding groups.
5. Super Admin Main Basket rename and temporary-item inline basket creation with zero and existing baskets, including focus, preserved draft, duplicate/error state, and selected returned basket.
6. keyboard-only use, accessible names/grouping/live regions, visible focus, 200% text zoom where tooling permits, touch targets, wrapping, and no horizontal overflow.

Store temporary logs/screenshots outside the repository and report their paths. Remove transient uploads, credentials, browser state, and local runtime data after verification.

#### Repository hygiene

```bash
git diff --check
git status --short
```

Confirm every final dirty path is either an approved deliverable or preserved pre-existing work. No lint command exists, so do not claim lint passed.

## Acceptance-criteria traceability

| Criterion | Primary tasks | Required evidence |
| --- | --- | --- |
| AC1 Basket rename | 4, 6, 8 | permitted active/inactive rename; stable-ID cache refresh; duplicate/stale/denied no-write |
| AC2 PMC range | 1, 2, 6, 8 | legacy equal pair; unequal pair persistence; shared boundary validation; conflict/activation |
| AC3 PMC selection | 2, 6, 8 | Max default; exact Min/Max requests; stale clearing; reopen/error/UOM behavior |
| AC4 PMC discount | 1, 2, 6–8 | exact ₹269.50 example; boundaries/rounding/overflow; Sub-Vendor unchanged |
| AC5 In-house scope | 1, 3, 6–8 | starter no-write state; source-owned persistence; mutual exclusion; review/description |
| AC6 In-house breakup | 3, 6–8 | expense + margin reconciliation with/without discount; mismatch rejection |
| AC7 Quick summary | 5–8 | three persisted statuses only; no Mode details; notices and other groups retained |
| AC8 Saved selections | 3, 6–8 | saved source initialization; empty default; two-item isolation; hide-only behavior |
| AC9 Inline basket creation | 4, 6–8 | role+permission gating; zero/populated lists; draft/focus preservation; no duplicate submit |
| AC10 Integrated quality | 0, 6–8 | review, focused/full commands, rendered matrix, diff/status evidence |

## Completion and handoff

The task is complete only when all material review findings are resolved, every acceptance criterion has evidence, focused checks pass, full affected-workspace checks pass or exact baseline failures are documented, rendered desktop/mobile behavior is inspected, and repository hygiene is clean relative to the captured baseline.

The final handoff must report:

- the resulting user behavior and principal contract decisions;
- affected files grouped by backend, Mode UI, Basket UI, and summary;
- exact commands and result counts;
- visual/accessibility widths and states checked;
- unrun or blocked checks with practical impact;
- confirmation that no migration, seed, production write, commit, push, or deployment occurred;
- remaining rollout/compatibility risks, if any.
