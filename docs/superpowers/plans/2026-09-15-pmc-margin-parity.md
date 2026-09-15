# PMC simulator selling-price calculation and Final total — task plan

Status: implemented and verified after specification/task-plan approval and execution mode A selection. All six tasks are complete for the approved PMC scope. Browser coverage limits are stated below. Baseline is recorded at `/tmp/lisno-pmc-simulator-final/baseline/`.

Source of truth: [approved specification](../specs/2026-09-15-pmc-margin-parity-design.md). The user's clarification keeps one PMC Margin field. The earlier minimum/maximum proposal is superseded.

## Implementation contract

- Keep the existing single PMC Margin setting, label, input behavior and validation. Add no saved fields or Min./Max. controls.
- Calculate the PMC selling subtotal from adjusted cost using the same integer-paise division helper as Sub-Vendor: `roundHalfUp(costPaise × 10000 / (10000 − pmcMarginBps))`. Derive the PMC amount as subtotal minus adjusted cost; apply discount to the rounded subtotal afterward.
- Preserve inclusive low-quantity impact, quantity/rate rounding, automatic previews and existing discount bounds.
- Remove the PMC Final vendor charges/Balance after margin row and its explanatory paragraph. Retain Final total, other PMC labels and response fields, including the hidden signed reconciliation balance.
- Do not change persistence, margin validation, active revisions, approved estimates, permissions, Sub-Vendor/In-house arithmetic or unrelated workspace behavior.

## Task order and ownership

Only one parent implementation task is in progress at a time. Tasks 2–4 are bounded slices of that parent and may run concurrently after Task 1. Review and final verification follow all writers.

| Task | Dependency | Owner in Mode A | Owned paths / deliverable | Acceptance |
| --- | --- | --- | --- | --- |
| 1. Record baseline and confirm boundaries | Task-plan approval and execution-mode choice | Primary | Dirty-path inventory, relevant existing diffs and focused baseline results in ignored temporary artifacts | AC1–AC6 preservation baseline |
| 2. Update authoritative PMC calculation | Task 1 | Backend implementer | `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`; `backend/tests/ai-estimator-knowledge-pmc-calculation.test.ts` | AC2, AC5 |
| 3. Update simulator verification and presentation | Task 1 | Frontend implementer | `frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationSimulator.tsx`; `KnowledgePmcCalculationSimulator.test.tsx` in the same directory | AC1, AC3, AC4, AC5 |
| 4. Align API explanations and integrate fixtures | Task 1; final fixture reconciliation after Tasks 2–3 | Primary | `backend/src/openapi/ai-estimator-knowledge.ts`, affected comment-only updates in `backend/src/contracts/ai-estimator-knowledge.ts`, `backend/tests/api-docs.test.ts`; any additional directly affected fixtures/tests after explicit ownership assignment | AC5, AC6 |
| 5. Review integrated financial and UI behavior | Tasks 2–4 finished | Integrity reviewer, read-only | Findings against approved scope, final diff and baseline; primary coordinates fixes | AC1–AC5 |
| 6. Verify integrated result and hand off | Task 5 findings resolved; writers finished | Verification runner and primary | Final command results, rendered checks, hygiene and concise handoff | AC1–AC6 |

In Mode A, use native agents for Tasks 2 and 3 because backend arithmetic and frontend presentation have non-overlapping paths and a settled contract. The primary can complete Task 4 concurrently. Give each writer its existing target diffs, explicit ownership and the instruction that other agents are working in the same repository; preserve others' edits and coordinate any additional path before writing it. Do not delegate before the user selects A.

In Mode B, the primary performs the same implementation, review and verification inline, without implementation subagents. No new user-facing architecture choice is needed within the approved scope.

## Task details

### 1. Preserve the current workspace

- Capture `git status --short`, the relevant per-target `git diff`, and snapshots of relevant untracked targets before writers start. Store diagnostics under an ignored temporary directory such as `/tmp/lisno-pmc-simulator-final/` and record the actual path.
- Confirm current calculator callers and the single-field PMC editor/simulator contract. Preserve the existing percentage validation, including currently accepted two-decimal percentages such as 15.25%; this work changes the formula rather than imposing new configuration rules.
- Run focused PMC backend/frontend baseline tests before edits when practical. Record pre-existing failures separately. Reuse the current local test/browser setup without seeding or mutating application data.

### 2. Backend arithmetic

- Replace only the additive PMC subtotal branch with `calculateMarginSellingPrice`, already used by Sub-Vendor. Do not alter the shared helper or other calculation modes.
- Keep the existing PMC validation, impact handling, subtotal-derived margin, post-subtotal discount, safe-integer protections and signed `finalVendorChargesPaise = totalPaise − pmcMarginAmountPaise` relationship.
- Update the existing PMC unit and preview-service assertions to use explicit independently checked expected amounts. Retain threshold, fractional quantity, fractional percentage, service authorization and invalid-input coverage; do not delete old cases merely because their totals change.
- Cover the approved examples, including ₹220 at 20% → ₹275; ₹220 at 15% → ₹258.82; 10% discount on ₹275 → ₹247.50; half-up rounding of ₹0.02 at 20% → ₹0.03; zero values, 100% discount and overflow. Keep distinct PMC/Sub-Vendor and unequal In-house inputs to expose accidental shared-scope changes.

### 3. Simulator behavior

- Apply the existing exact selling-price and discount response checks to PMC as well as Sub-Vendor, retaining backend amounts as the display source. Keep requested percentage/discount matching and all existing reconciliation checks.
- Remove the vendor/balance row and its explanation from the margin result branch, preserving the already-correct Sub-Vendor presentation. Update PMC's formula hint to describe division with its single configured PMC Margin.
- Keep the single readonly PMC Margin input and existing automatic calculation flow. Add no scenario selector or Calculate button, and do not modify the automatic-preview hook unless a demonstrated regression requires a separately coordinated bounded fix.
- Recalculate current PMC test fixtures explicitly. Test rejection of an old additive response whose sums otherwise reconcile, incorrect discounts and inconsistent/mismatched responses.
- Preserve debounce, superseded-request handling, invalid-input clearing, close/reopen behavior, focus and accessible names. Assert the vendor/balance text is absent at zero and large discounts while Final total remains visible.

### 4. Documentation and integration

- Update OpenAPI's PMC settings/preview and shared discount descriptions so they describe division-based selling subtotals and post-subtotal discounts. Keep numeric bounds, field names and required/optional shapes unchanged.
- Update related comments only if they describe obsolete additive arithmetic. Do not remove the signed balance field or change transport types.
- Search for directly affected hardcoded PMC response fixtures and expectations. Adjust only actual consumers of the changed simulator result. The current dedicated PMC simulator tests own their mock preview responses; do not modify unrelated enterprise fixtures merely because they are already dirty.
- Run backend route/OpenAPI and Sub-Vendor/Mode regression checks plus frontend shared-simulator consumer checks. Resolve additional expected-total updates against the same approved formula, with explicit file ownership.

### 5. Integrity review

Review the integrated delta against baseline and verify: one PMC setting remains; division uses adjusted cost after existing impact rounding; money stays in integer paise; discount follows subtotal; response amounts reconcile; API compatibility and authorization remain unchanged; invalid/stale results cannot appear as current; removed text has no negative-balance variant left behind; and Sub-Vendor/In-house behavior is preserved.

Resolve confirmed findings before final verification. If a shared helper, persistence path or contract shape appears to need a change, return the dependency to the primary rather than expanding scope silently.

## Final verification

Run the following on the integrated worktree after writers and review fixes finish. Commands below run from the named workspace; do not interpret intermediate results during concurrent edits as final evidence.

Backend:

```sh
npm test -- tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Frontend:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/useAutomaticKnowledgeCalculation.test.tsx
npm run typecheck
npm run build
```

At repository root:

```sh
git diff --check
git status --short
```

Rendered verification must cover a desktop and a narrow mobile viewport using authorized local/test data. Confirm the single PMC field, ₹275 screenshot scenario, automatic discount update to ₹247.50, 100% discount, invalid input/error recovery, removed vendor/balance text, usable scrolling, keyboard access and close/reopen focus. Run rendered accessibility checks and inspect console/network failures, distinguishing intentionally exercised errors. Verify a distinct Sub-Vendor scenario and the existing In-house totals through focused regressions.

| Acceptance criterion | Verification evidence |
| --- | --- |
| AC1 — Single setting | Existing margin/builder regressions plus rendered one-field/no-range-selector check |
| AC2 — Exact amounts | PMC unit/service examples, threshold and rounding/overflow tests; unchanged validation cases |
| AC3 — Automatic preview | PMC automatic-input, cancellation, stale/error, mismatched and old-additive-response tests; browser interaction |
| AC4 — Presentation | Positive/zero-final-total result assertions; desktop/mobile and keyboard/accessibility checks |
| AC5 — Compatibility/isolation | PMC service authorization, route/OpenAPI checks, retained response balance and distinct Sub-Vendor/Mode/In-house regressions |
| AC6 — Integrated verification | Final focused suites, both typechecks/builds, rendered evidence and diff review |

Broaden testing only for newly changed shared behavior, failures or unresolved concerns. Replica-set, migration, OCR and full finance suites are unnecessary for the approved temporary-preview change because persistence and approved finance calculations are untouched. There is no repository lint script; do not report lint as passed.

Record exact test counts and commands, rendered states, artifact paths, build warnings, unrun checks and any remaining limitations. Do not mark the task complete until required checks pass or clearly report any genuine unresolved verification limit. The final handoff identifies affected files and confirms no migration, production mutation, commit, push or deployment was performed.

## Execution boundary

All approval gates are complete for this scope. Execution mode A authorizes the bounded implementation and local verification described above; deployment and application-data mutation remain outside scope.

## Final implementation and verification evidence

PMC uses the existing Sub-Vendor division helper with its single configured PMC percentage. Its controls and validation are unchanged. The result retains PMC terminology and Final total, with the vendor/balance row and explanation removed. Exact client response checks reject additive subtotals and incorrectly rounded discounts. API fields remain intact; only calculation descriptions and comments changed.

Independent backend/frontend writers completed their owned slices. The backend writer also owned the directly affected Sub-Vendor calculation comparisons; the frontend writer also owned the Sub-Vendor simulator's PMC isolation expectations. The primary updated OpenAPI/contracts, API-documentation assertions and the existing Mode workflow's PMC fixtures. Read-only integrity review, including a separate backend arithmetic audit, reported no findings before final verification.

Ten product/test files changed relative to the recorded baseline:

- `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`
- `backend/src/contracts/ai-estimator-knowledge.ts` (comments only)
- `backend/src/openapi/ai-estimator-knowledge.ts` (descriptions only)
- `backend/tests/ai-estimator-knowledge-pmc-calculation.test.ts`
- `backend/tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts`
- `backend/tests/api-docs.test.ts`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeCalculationSimulator.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx`

Baseline focused tests passed 46 backend and 61 frontend cases. Final checks were rerun independently on the integrated worktree; baseline and development results were not reused as final evidence.

| Final check | Result |
| --- | --- |
| Backend five-file command above | 305 passed: PMC 55, Sub-Vendor 140, Mode/In-house 35, routes 58, OpenAPI 17 |
| Frontend six-file command above plus `src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx` | 281 passed: PMC 71, Sub-Vendor 74, In-house 20, PMC margin 44, builder 19, automatic preview hook 8, Mode workflow 45 |
| Backend `npm run typecheck` and `npm run build` | Both exit 0 |
| Frontend `npm run typecheck` and `npm run build` | Both exit 0 |
| Repository `git diff --check` and baseline comparison | Clean; unrelated prior work preserved |

Total: **586 passing tests across 12 files**. Backend HTTP tests initially hit the sandbox's local-listener restriction; the authorized retry passed. A development Mode test contained one remaining additive fixture assertion; it was corrected to the independently calculated ₹1,941.18 result before final verification.

Warnings: the passing Mode minimum-margin validation test emits React `act`/async-act warnings. The frontend build retains its existing chunk-size warning; main JavaScript is about 1,496.40 kB, gzip 411.28 kB. There are no final test, typecheck or build failures.

### Rendered evidence and practical limits

Browser checks used the local synthetic enterprise QA page with preview payloads generated by the actual updated backend calculator. No real application data was read or mutated. Desktop 1440×1000 and a narrow 390×844 viewport were inspected, including screenshots of the PMC form and result.

The complete desktop flow passed: single readonly PMC field, no Min./Max. or Calculate control, ₹275 initial total, ₹247.50 at 10% discount, ₹0 at 100%, retained input focus, invalid-input blocking, old additive-response rejection, error/retry recovery, keyboard close/reopen and reset, and a distinct Sub-Vendor 35% scenario returning ₹761.54. No browser/application errors, horizontal overflow, unexpected API calls or persistence requests occurred. The dialog-scoped axe scan reported zero violations; color contrast has incomplete results for clipped/offscreen content. Screenshots were visually inspected.

The narrow PMC flow passed all the same PMC-specific assertions through keyboard close/reopen, including the dialog-scoped accessibility check and no horizontal overflow. Its additional, unrelated Sub-Vendor navigation check stopped when the existing mobile header intercepted the Execution checkbox. This does not affect the PMC checks already completed, and Sub-Vendor is covered by the completed desktop flow and regression suites. Native mobile initial navigation and a later repeated resize run also timed out intermittently; the narrow PMC evidence therefore uses a desktop-opened simulator resized to 390 pixels. Do not describe this as a complete physical-device or native-mobile navigation audit. No unrelated mobile-navigation change was made.

The CLI browser wrapper could not resolve its package registry; the available Playwright connector provided rendered checks without adding a repository dependency. The temporary local server and task browser contexts are stopped. Generated browser scripts/screenshots and MCP logs were moved out of the repository.

Fresh artifacts: `/tmp/lisno-pmc-simulator-final/`, including `final-*.log`, `browser-report.json`, `browser/` screenshots/scripts, `mcp-logs/`, `baseline/` and the baseline-relative patch. Full finance, transactional Mongo/replica-set, migration, OCR and full workspace suites were not run because this change is confined to the temporary preview path and directly affected consumers. No lint script exists. No dependency/lockfile change, migration, seed, application-data write, commit, push or deployment occurred.
