# Sub-Vendor simulator selling price — task plan

Approved specification: [Simulator selling-price formula](../specs/2026-09-14-sub-vendor-simulator-selling-price-design.md).

Status: specification and task plan approved; user selected execution mode A. Implementation, independent integrity review and final command verification passed. Desktop interaction checks and mobile calculation/layout checks passed. Mobile close/reopen automation remains a verification limitation; details below.

## Fixed contract

- Sub-Vendor selling price before discount is **adjusted cost / (1 − Lisno margin / 100)**, rounded half-up to integer paise. Reuse the existing backend `calculateMarginSellingPrice` helper.
- Adjusted cost retains the existing quantity and inclusive low-quantity-impact calculation. Margin amount is rounded selling price minus adjusted cost. Discount remains 0%–100% of that selling price; final total and signed vendor balance keep the approved breakdown policy.
- Keep the saved/preview margin choices at 15% or 20%, Min./Max. selection with Max. default, transport fields and preview envelope/version. The ₹100/35% example exercises the existing general money helper; it does not allow 35% through the simulator API.
- Preserve PMC, In-house, configuration persistence/repair, pending/conflict handling, inclusion/exclusion behavior, authorization and all unrelated dirty work. No data write or migration is part of this change.
- Sub-Vendor UI uses **Selling price before discount**, retains the positive Lisno margin and vendor-balance rows, and explains the division formula. Verify returned selling price against the exact rounded formula as well as existing reconciliation; do not generate replacement financial values in the UI.

## Ownership and parallel boundaries

Planning-time status: 44 modified source/test paths, four previous task documents and this task's approved specification. Before writers start, capture a fresh dirty-path set and relevant per-target diffs and understand every dirty target being assigned. Previous edits must not be reverted, staged, reformatted or overwritten.

| Owner | Exclusive write responsibility |
| --- | --- |
| Parent | Contract coordination, this plan, integration decisions and synthetic rendered-QA fixtures under `frontend/src/test/fixtures/`; final review reconciliation and browser checks. |
| Backend implementer | `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts`, explanatory comments in `backend/src/contracts/ai-estimator-knowledge.ts`, Sub-Vendor descriptions in `backend/src/openapi/ai-estimator-knowledge.ts`, and directly affected backend calculation/preview/route/API-doc tests. The existing selling-price helper is reused unchanged. No frontend, persistence/model or margin-range edits. |
| Frontend implementer | `KnowledgeModeCalculationSimulator.tsx`, `KnowledgeSimulatorDiscountField.tsx`, relevant comments in `knowledgeTypes.ts`, and directly affected simulator/editor/Mode lifecycle tests under `frontend/src/features/ai-estimator-knowledge/`. No backend or parent-owned fixture edits. |
| Integrity reviewer / verification runner | Independent read-only review and command execution respectively; report findings without editing product files. |

Additional files or discovered shared-file dependencies require parent ownership assignment before edits. In Mode A, tell each writer that other agents share the worktree, assign non-overlapping paths and coordinate any contract discovery immediately. In Mode B, the parent performs the same slices inline without implementation subagents. Do not spawn agents before the execution-mode gate.

Dependency order: **T1 → (T2, T3) → T4 → T5**. Backend and frontend slices can run in parallel only after T1. Parent fixture preparation may run alongside them. Integrated review waits for all writers; final verification follows review and any fixes. Keep only one parent task in progress.

## T1 — Capture baseline and settle shared examples

Owner: parent. Depends on task-plan approval and execution-mode selection. Supports AC1–AC7.

1. Capture status, relevant diffs and a baseline of assigned dirty files outside tracked source. Confirm no prior writer remains active on those paths.
2. Confirm the existing helper and Sub-Vendor preview call chain. Keep quantity/impact calculation, rate restrictions, discount policy, response fields and signed vendor balance unchanged.
3. Share fixed backend-shaped examples with both writers: cost ₹200 at 15% → ₹235.29 and at 20% → ₹250; adjusted cost ₹2,200 at 15% → ₹2,588.24 and at 20% → ₹2,750; the latter with 10% discount → ₹2,475 and vendor balance ₹1,925. Include ₹0.02 at 20% → ₹0.03 as a half-up tie.
4. Agree the scope-specific response check: validate integer/rate preconditions before BigInt conversion, verify rounded division, then retain all existing reconciliation and stale-response guards. Reject a mathematically consistent old markup or deduction response. The frontend check verifies server data only.

## T2 — Use the existing selling-price helper for Sub-Vendor

Owner: backend implementer. Depends on T1; parallel with T3 in Mode A. Covers AC1–AC3 and backend AC6.

1. Import and call `calculateMarginSellingPrice(revisedAmountPaise, marginBps)` only for the Sub-Vendor branch of the current shared helper. Preserve PMC's existing `applyBasisPoints` path and reuse all existing quantity, impact, discount and breakdown calculations.
2. Keep `marginAmountPaise = sellingPrice - revisedAmountPaise`, discount on selling price, final total after discount and signed vendor balance. Do not independently round the margin amount or change the existing general money helper.
3. Update contract comments and OpenAPI formula/field descriptions that imply shared PMC arithmetic. No request/response field, allowed-rate, endpoint, authorization registry or persistence change is required.
4. Add the exact ₹100/35% money-helper example and refresh Sub-Vendor expectations using independently calculated amounts. Cover unequal allowed rates, inclusive impact thresholds, fractional quantities, zero amounts, rounding ties, overflow and 0%/nonzero/near-100%/100% discounts. Preserve invalid-rate tests, explicitly including 25% and 35% for the simulator branch.
5. Verify direct calculation, context-service preview and authenticated route results agree and preserve read-only behavior. Retain PMC and In-house regressions. Adjust only fixtures whose expected Sub-Vendor arithmetic changed; do not blanket-replace numbers in unrelated tests.
6. Run the focused affected backend tests and report files, commands, results and any newly discovered contract issue to the parent.

## T3 — Verify and explain the new simulator result

Owner: frontend implementer. Depends on T1; parallel with T2 in Mode A. Covers AC2, AC4, AC5 and frontend AC6.

1. Extend the existing reconciliation function with a scope-specific exact rounded selling-price check for Sub-Vendor. Keep PMC's checks and all existing safe-money, impact, rate/discount matching, branch, balance and request-sequence guards intact.
2. Change only the Sub-Vendor subtotal label and accessible output name to **Selling price before discount**. Explain the division formula and impact/discount order in the simulator and discount helper. Retain the positive Lisno margin row and existing signed vendor-balance presentation.
3. Update Sub-Vendor fixtures throughout simulator/editor/Mode lifecycle tests to use valid division results. Keep configured 15%/20% controls and saved-data behavior unchanged.
4. Verify both selected-rate requests, Max. default, exact approved totals, discount/balance reconciliation, half-up ties, errors/retry, read-only fields, close/reopen and stale responses. Add rejection cases for an internally consistent old markup result, an obsolete deduction result and an incorrect rounded division result.
5. Keep UI values sourced from backend responses. Use separate configured Main Lines or equivalent independent editor contexts with asymmetric rates/costs to expose stale cross-context results. Preserve pending/conflict, PMC, In-house and input-range regressions.
6. Run focused frontend checks and report exact results. Coordinate shared fixture expectations with the parent without editing its fixture files.

## T4 — Integrate and independently review

Owner: parent, then integrity reviewer in Mode A. Depends on T2 and T3 completion. Covers AC1–AC6.

1. Reconcile backend amounts, UI checks, transport types and documentation with the approved formula. Search remaining Sub-Vendor markup/deduction wording and update only contradictory in-scope descriptions.
2. Update opt-in synthetic browser fixtures for the new server-shaped results. Keep prior list/range scenarios intact; synthetic QA makes no application-database writes.
3. Inspect the follow-up diff against T1, preserving prior work. Review exact half-up rounding, nonnegative monetary fields versus allowed signed balance, invalid-rate rejection, no configuration writes, selected-rate/context isolation and stale-response behavior.
4. Run independent `integrity_reviewer` after all writers finish in Mode A; perform equivalent review inline in Mode B. Resolve confirmed findings before T5. No persistence changes are expected; if one is discovered, reassess its scope and required replica-set coverage before proceeding.

## T5 — Verify the integrated result and hand off

Owner: verification runner for commands in Mode A; parent for rendered checks and final reconciliation. Depends on T4 and completed fixes. Covers AC7 and final evidence for AC1–AC6.

- Backend focused, from `backend/`: `npm test -- tests/ai-estimator-knowledge-calculation.test.ts tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts`. Add another consumer only when actual changes or a failure justify it; do not rerun unchanged persistence suites for a read-only preview formula.
- Frontend focused, from `frontend/`: `npm test -- src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/test/fixtures/enterpriseTransport.test.tsx`. Include any additional test file actually changed by T3.
- Run `npm run typecheck` and `npm run build` in both workspaces. Run `git diff --check` and inspect final `git status --short`. Reuse current post-writer evidence if review caused no further source changes; report exact reused checks rather than duplicating them.
- After all source/test writers finish, render the real Mode workspace using synthetic data at desktop and mobile widths. Check Min./Max. selection, selling-price label, positive margin, discounts and signed balance, ₹2,588.24/₹2,750 totals for the approved adjusted-cost example, focus, loading/error states and overflow. Check obsolete results are rejected in rendered interaction tests.
- Avoid browser QA during concurrent frontend file edits: previous Vite reloads interrupted sessions. Use bounded retries for mobile automation, record the failing operation if it stalls and do not claim an interaction passed from a layout screenshot. Previous mobile timeouts are a known verification limitation, not evidence of a confirmed product cause.
- Keep logs/screenshots outside tracked source, stop task-owned servers/browser contexts and retain concise evidence paths. Report changed behavior, principal files, exact commands/results, unrun checks and remaining limitations. No lint script exists. No dependencies, migration, seed, application-database mutation, commit, push or deployment are authorized.

## Progress

- Specification: approved.
- Task plan: approved.
- Execution mode: A.
- T1: complete. Captured 44 dirty source/test paths, their full diff and exact current contents in `/tmp/lisno-selling-price-baseline/`. Shared examples and integer-paise formula are pinned above.
- T2/T3: complete with separate backend/frontend owners and a third frontend agent exclusively updating `KnowledgeModeSectionStateRemoval.test.tsx`. Parent prepared fixed browser response fixtures outside tracked source; the existing saved-input fixtures required no changes.
- T4: complete. Independent integrity review found no blocking defects; backend arithmetic remains confined to read-only Sub-Vendor preview. Additional frontend guard probes accepted 1,477 valid results and rejected 1,470 wrong selling prices and 1,036 wrong discounts. These probes are separate from the focused test count.
- T5: command verification and bounded rendered checks finished, with mobile close/reopen automation unresolved. Integrated frontend tests: 275 across seven files; backend tests: 263 across seven files; total 538 across 14 files. Both workspace typechecks/builds and `git diff --check` passed. Final verifier reconciled current backend source timestamps against the post-writer logs and reused that evidence; no review fixes invalidated it.

## Current implementation and verification evidence

- Exactly 12 source/test files changed from the captured baseline, all within the assigned scope. The exact follow-up diff and path inventory are `/tmp/lisno-selling-price-final/followup.patch` and `changed-paths.json`. Existing unrelated dirty-file contents are unchanged.
- Backend product changes are limited to the Sub-Vendor branch in `ai-estimator-knowledge-mode-calculation.ts`, contract comments and OpenAPI descriptions. The existing general selling-price helper, PMC arithmetic, margin restrictions and persistence paths are unchanged. Four backend test files extend or update the relevant checks.
- Frontend changes cover the simulator's exact BigInt selling-price/discount checks and copy, discount hint, type comment and two simulator/Mode lifecycle test files. Saved-input QA fixtures required no product-source changes. Browser responses are fixed server-shaped examples prepared in temporary scripts; actual arithmetic is independently tested through backend domain/service/HTTP tests.
- The final verifier ran the exact seven-file frontend command in T5: **275 tests passed** (Sub-Vendor61, PMC59, editor16, ModeSection45, In-house12, margin36, enterprise transport46). The exact seven-file backend command in T5 passed **263 tests** (money helper8, Sub-Vendor93, PMC46, Mode35, context6, routes58, API docs17). Backend evidence was produced after writers finished and reused after the verifier reconciled file timestamps and confirmed no later review fix. Reviewer probes are additional, not included in the 538-test total.
- `npm run typecheck` and `npm run build` passed in both workspaces. Frontend final checks were newly run by the verifier; current backend writer evidence was reused. `git diff --check` passed. Logs are `/tmp/lisno-selling-price-final/{frontend,backend}-{tests,typecheck,build}.log` plus hygiene logs.
- Existing warnings: the passing ModeSection minimum-validation scenario emits React act/suspense warnings; frontend build reports a chunk over 500 kB. The successful backend test log has no warnings. The first sandboxed backend test attempt hit Supertest listener EPERM; the identical approved escalation passed. No lint script exists.
- Unchanged persistence/replica-set suites, unrelated full suites, OCR and migration checks were not repeated for this preview-only formula change. No dependency, lockfile, migration, seed, application-database mutation, staging, commit, push or deployment occurred.
- Desktop at 1728px passed both selected-rate requests and selling/final totals ₹2,750.00 (Max.) and ₹2,588.24 (Min.), 10% discount total ₹2,475.00/vendor balance ₹1,925.00, and 100% discount total zero/vendor balance −₹550.00. An internally consistent obsolete markup response was rejected, then a valid retry succeeded. No document overflow, captured application errors, unexpected synthetic requests or axe violations occurred. Screenshot: `/tmp/lisno-selling-price-final/browser/desktop-max.png`.
- Initial browser sessions were reset by Vite connection-loss reloads. Rendered checks use a task-only Vite override `/tmp/lisno-selling-price-qa-vite.config.mjs` with live reload disabled; no repository configuration was changed. MCP initially refused to read scripts from `/tmp`; copies placed within its allowed `.playwright-mcp/` root were used. Those temporary copies are cleanup artifacts, not deliverables.
- Mobile at 390 × 844 passed keyboard selection from Max. to Min., Calculate and the exact ₹2,588.24 result. The screenshot was visually inspected: rows and amounts reflow without horizontal clipping. Screenshot: `/tmp/lisno-selling-price-final/browser/mobile-min.png`. The Close action timed out at 12 seconds, although a subsequent read found the dialog closed, document width 390 and no captured application errors or unexpected requests. A bounded reopen attempt also timed out at eight seconds; the final read stalled and was terminated. Do not claim mobile close/reopen completion, its default-rate reset, or mobile axe results from that interrupted script. Equivalent lifecycle regression tests passed, but do not substitute for this browser check. No product defect was confirmed by these automation timeouts.
- Cleanup completed: task-owned Vite server stopped, MCP browser tab closed, and `.playwright-mcp/` artifacts moved out of the worktree to `/tmp/lisno-selling-price-final/browser/mcp-logs/`. Raw rendered-check reports are in `browser/qa-results.json`. Browser shutdown after stopping Vite produced connection-refused console entries; these occurred after the captured interaction checks. There were no further product changes following final command verification.
