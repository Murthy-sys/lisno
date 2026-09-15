# Sub-Vendor Lisno margin range — task plan

Approved specification: [Sub-Vendor Lisno margin range](../specs/2026-09-14-sub-vendor-lisno-margin-range-design.md).

Status: the revised specification and task plan are approved; the user selected execution mode A. F1–F4 are complete. F5 command checks, desktop interactions and mobile layout passed; automated mobile interaction verification remains incomplete because browser operations timed out. Implementation is not represented as fully verified on mobile.

## Current follow-up contract

This section supersedes the historical task instructions below. Implement only the remaining allowed-value correction; preserve the existing Lisno Min./Max. UI, simulator selection and prior inclusion/exclusion work.

- Both Lisno margins accept only **15% or 20%**: integer basis points `1500` or `2000`. Inputs use minimum 15, maximum 20 and step 5. Typed values, configuration APIs and preview requests enforce the same rule. Numerically equivalent `15.00` remains valid; 16 and 17.5 do not.
- Keep `subVendorMinimumMarginBps` and `subVendorMarginBps`, Min. ≤ Max., missing-minimum legacy fallback, explicit-null semantics and entirely unconfigured draft behavior. No defaulting, rounding, write on opening, automatic history conversion or new transport fields.
- Preserve previously stored 10%–20% values exactly for read and repair. An unchanged historical section may be copied from Active into a repair Draft through an internal exception limited to the newly disallowed margin values. Normal advanced-section saves, activation and preview remain strict. Wrong types, invalid old bounds, reversed/partial pairs and other payload errors must not be bypassed.
- Preserve the existing inclusion/exclusion repair exception independently, along with authorization, version checks and immutable history. Rejected operations must not mutate payloads, versions or audits.
- PMC retains 10%–20% behavior. In-house rules, integer-paise formulas, low-quantity threshold, custom discount and signed vendor balance remain unchanged. With the approved example, 15% produces ₹2,530 and 20% produces ₹2,640.
- UI hint: `Allowed: 15%–20% · Steps of 5% · Min. ≤ Max.` Historical values that require correction remain visible with field errors; the simulator cannot calculate them.

## Follow-up ownership and dependencies

Planning-time status is 44 modified product/test paths and four untracked spec/plan files. All prior changes are preserved. Before any writer starts, the parent captures a fresh dirty-path list and relevant diffs and understands each dirty target. No staging, commits, pushes, migrations, seeds, deployment, dependencies or live database writes are included.

| Owner | Exclusive write boundary |
| --- | --- |
| Parent | This plan, integration decisions, synthetic QA fixtures under `frontend/src/test/fixtures/`, rendered checks and final reconciliation. No edits to agent-owned files while their writers run. |
| Backend implementer | Relevant Lisno validation/calculation files under `backend/src/domain/`, `backend/src/routes/ai-estimator-knowledge-admin.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, `backend/src/models/AiEstimatorKnowledgeSection.ts`, `backend/src/services/ai-estimator-knowledge-item.service.ts`, and corresponding backend tests. Additional repository paths require parent assignment after confirming they exist and participate in this flow. No frontend edits or persistence refactor. |
| Frontend implementer | `knowledgePmcMargin.ts`, `KnowledgePmcMarginInput.tsx`, affected Lisno consumers and their focused tests under `frontend/src/features/ai-estimator-knowledge/`. Change consumers only where the stricter helper or fixtures require it; preserve existing pending/conflict behavior. No backend or synthetic QA fixture edits. |
| Integrity reviewer / verification runner | Read-only integrated review and test execution respectively; report findings without changing product files. |

In Mode A, backend and frontend writers can work in parallel after F1 settles the contract. Each receives explicit assigned paths, invariants and the instruction that others share the worktree and their edits must not be reverted. The parent may prepare independent synthetic QA fixtures alongside those writers. In Mode B, the parent performs all work sequentially without implementation subagents. There are no subagents before the execution-mode gate.

Dependency order: **F1 → (F2, F3) → F4 → F5**. Keep only one parent task in progress. F4 waits for both writers; final verification waits for the integrated review and any fixes.

## F1 — Capture baseline and pin compatibility boundaries

Owner: parent. Depends on task-plan approval and A/B selection. Supports AC1–AC7.

1. Capture status and per-target diffs, confirm previous writers are idle and record baseline artifacts outside tracked source.
2. Trace authoritative save, preview, activation and active-to-draft paths. Confirm the current direct-Mongoose flow and whether any memory implementation also participates; align existing paths without introducing a new repository abstraction.
3. Set a distinct validation issue for values that satisfied the old 1000–2000 safe-integer contract but fail the new 1500/2000 rule. Structural, partial and ordering failures stay separate and non-exempt. Share exact issue/path semantics with the frontend owner before parallel writes.
4. Limit the repair-copy allowance to trusted creation of an unchanged advanced section from Active. Confirm normal saves, activation, arbitrary document creation and request-supplied flags cannot enable it. Do not expand the allowance to unrelated duplication workflows.
5. Prepare asymmetric fixtures: one line with 15%/20%, another with a different valid pair, legacy missing-minimum 10% and 17.5% records, and an unconfigured pair. Historical fixtures must bypass new write validation only through isolated test setup, never through a production route or seed.

## F2 — Enforce backend values and retain a repair path

Owner: backend implementer. Depends on F1; parallel with F3 in Mode A. Covers AC2, AC3, AC5 and backend AC6–AC7.

1. Restrict both advanced margin fields to 1500/2000 with precise field paths. Preserve the existing absence/null and complete-pair rules, and keep PMC validation separate.
2. Restrict the selected Sub-Vendor preview rate in both the route schema and direct calculation domain. Update OpenAPI request, payload and response constraints and Lisno validation messages without changing transport keys or formulas.
3. Implement the narrow internal historical-copy exception identified in F1. Preserve inherited values exactly; normal writes and activation must still reject them until corrected. Retain unrelated inclusion/exclusion validation and repair behavior.
4. Test valid equal/unequal pairs, equivalent numeric values, forbidden 1000/1499/1600/1750/2001, unsafe or wrong types, missing/null/partial/reversed pairs, direct calculation and HTTP rejection. Assert PMC still accepts its established values.
5. Use isolated replica-set tests for historical read/copy/correction/save/refetch, immutable Active values, two-line isolation, failed save/activation without payload/version/audit writes and failed attempts to misuse the compatibility flag. Test malformed historical payloads are still rejected and valid unrelated section edits remain available.
6. Verify ₹2,530/₹2,640 and existing discount, threshold, fractional quantity, rounding and signed-balance reconciliation. Update fixtures that represent valid current configuration; retain explicit old values in compatibility and rejection tests rather than blanket-replacing them.

## F3 — Align controls, validation and simulator behavior

Owner: frontend implementer. Depends on F1; parallel with F2 in Mode A. Covers AC1–AC4 and frontend AC6.

1. Give Lisno controls minimum 15, maximum 20 and step 5 without changing PMC's shared control behavior. Update the hint, placeholder and field-specific correction messages.
2. Enforce allowed values in the existing Lisno helper for both fields and every save/preview consumer. Keep invalid typed text editable and preserve controlled resets, error focus, read-only state and equivalent input such as `15.00`.
3. Preserve exact legacy values on opening, first-edit counterpart materialization, Discard, server conflict rebase and pending review. Display invalid historical values with actionable field errors; do not clamp them or make a network write on mount.
4. Verify the simulator still defaults to Max., sends the exact selected 1500/2000 rate, clears stale results and rejects a pair containing an invalid historical value. Keep Quantity/Discount temporary and results server-derived.
5. Update focused helper/control, builder, Mode lifecycle, pending/conflict and simulator tests to distinguish valid current pairs from explicit legacy-invalid cases. Cover keyboard 15 ↔ 20 and boundaries, typed 16/17.5 rejection, correction, equal pairs, null/partial ordering, read-only states and PMC/In-house regressions.

## F4 — Integrate and review

Owner: parent and, in Mode A, an independent integrity reviewer. Depends on F2 and F3 completion. Covers AC1–AC6.

1. Reconcile frontend constraints, backend issue paths, route/domain validation, OpenAPI and saved-data compatibility. Search remaining 10%–20% references and retain only those belonging to PMC or explicit historical coverage.
2. Integrate synthetic rendered fixtures with 15%/20% and the corresponding backend-shaped preview results; keep existing inclusion/exclusion scenarios intact. Do not synthesize production financial values in UI logic.
3. Inspect every follow-up diff against F1. Review repair-copy scope, no-write rejection, immutable history, first-edit/rebase behavior, asymmetric line isolation, formulas and stale response handling. Resolve confirmed findings before F5. Review is inline in Mode B.

## F5 — Verify the integrated result and hand off

Owner: verification runner for command checks in Mode A; parent for rendered checks and final reconciliation. Depends on F4 and completed fixes. Covers AC7 and final evidence for AC1–AC6.

- Backend focused, from `backend/`: `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-integration.replica-set.test.ts tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts tests/api-docs.test.ts`. Include other directly affected tests when F2 identifies consumers. Transactional cases use isolated replica sets, never the application database.
- Frontend focused, from `frontend/`: `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeModePendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx src/test/fixtures/enterpriseTransport.test.tsx`. Include newly affected helper/consumer tests as needed.
- Run `npm run typecheck` and `npm run build` in both workspaces. Broaden only for actual shared-path impact or failures; no lint script exists.
- Render the real Mode workspace at desktop and mobile widths using synthetic data. Check both accessible names, compact layout, overflow, 15 ↔ 20 arrow behavior, typed invalid input, historical-value correction, read-only behavior, Min./Max. preview selection and exact requests/results. Try a focused direct fixture route if responsive navigation tooling stalls. Report any remaining limitation explicitly; historical desktop evidence does not validate this correction, and prior mobile interaction checks did not pass.
- Run `git diff --check` and `git status --short`. Store logs/screenshots outside tracked source, close task-owned browser/server sessions and report exact commands, counts, results, unrun checks, remaining risks and artifacts. No migration or external action is part of this plan.

### Current follow-up progress

- Revised specification: approved by the user's latest `APproved` reply.
- Revised task plan: approved.
- Execution mode: A.
- F1: complete. Dirty baseline captured at `/tmp/lisno-margin-15-20-baseline/`; existing direct-Mongoose Active→Draft path confirmed, with no participating memory implementation. Compatibility issue is `INVALID_LISNO_MARGIN_INCREMENT`, restricted to safe integer values valid under the old bounds. Trusted copies must match an internal unchanged-payload snapshot before the new issue can be exempted.
- F2/F3: complete. Backend and frontend runtime slices ran independently; a reused idle agent exclusively updated three pending/Mode lifecycle test files under the frontend owner's coordination. Parent updated synthetic QA fixtures. Backend reports 426 tests across eight files, typecheck and build passed; frontend runtime owner reports 203 tests across seven files and typecheck passed, and lifecycle/pending owner reports 80 tests across three files.
- F4: complete. Independent integrity review found no blocking defects. A delegated read-only model audit passed 11 in-memory validation probes. The review confirmed strict normal save/activation/duplication, unchanged trusted-copy scope, preflight before child/audit writes and intact frontend legacy/conflict/stale-response behavior.
- F5: command checks, desktop interactions and mobile layout passed. Rendered desktop at 1728px passed 15 ↔ 20 keyboard steps and limits, typed 17.5 rejection, unchanged PMC bounds, both selected-rate requests, ₹2,530/₹2,640 results, Max. reset on reopen, no writes from field editing, no horizontal overflow, no unexpected fixture requests/errors and zero axe violations with the simulator open. Preview responses are fixed synthetic server-shaped fixtures; backend tests verify the actual arithmetic. At 390px, the paired controls and hint rendered correctly, with document width 390, no overflowing elements and no captured errors. Mobile keyboard interaction timed out; a separate bounded fresh-browser attempt also timed out after selecting Mode. No mobile interaction pass or confirmed product root cause is claimed. Screenshots and diagnostic reports are under `/tmp/lisno-margin-15-20-final/browser/`. Initial desktop interruptions coincided with Vite full reloads during concurrent frontend test-file edits; desktop passed after writers finished.

### Follow-up final evidence

- Current integrated verification totals **793 passing tests across 23 files**: frontend 347/13, backend 426/8 and two additional backend context/calculation consumers 20/2. The 11 review probes are additional and are not included in that count.
- Frontend ran the exact 11-file F5 command above plus `knowledgeModeConfiguration.test.ts` and `knowledgeModeCalculations.test.ts`. Counts: margin36, builder19, pending helper16, pending UI19, conflict9, ModeSection45, Sub-Vendor52, PMC59, calculation editor16, In-house12, transport46, configuration helper13 and calculation helper5. Log: `/tmp/lisno-margin-15-20-final/frontend-focused.log`.
- The backend owner's final eight-file F5 command passed 426 tests after all writers finished: validation47, Sub-Vendor85, routes57, API docs17, item service85, replica integration54, PMC46 and Mode35. The final verifier reconciled timestamps for all 15 modified backend files against the tests/typecheck/build logs; no later backend source change invalidated that evidence, so the identical lane was not repeated. Log: `/tmp/lisno-margin-15-20-backend-tests.log`.
- The verifier additionally ran `npm test -- tests/ai-estimator-knowledge-configuration-context.test.ts tests/ai-estimator-knowledge-calculation.test.ts` from `backend/`: 20 tests passed. Log: `/tmp/lisno-margin-15-20-final/backend-context-calculation.log`.
- `npm run typecheck` and `npm run build` passed in both workspaces. Frontend checks were newly run by the final verifier; backend final writer evidence was reconciled and reused. `git diff --check` passed. Exact commands and logs are retained under `/tmp/lisno-margin-15-20-final/` and `/tmp/lisno-margin-15-20-backend-{tests,typecheck,build}.log`.
- Existing warnings remain: a passing minimum-margin server-validation UI test emits React act/suspense warnings; backend tests emit the Mongoose `new` deprecation warning; frontend build reports a chunk over 500 kB. No lint script exists. Full unrelated suites, OCR and migration checks were not run because those areas are unchanged and no migration is introduced.
- Product changes are limited to the allowed-value rule, scope-specific input bounds/copy, matching runtime/OpenAPI validation, trusted historical repair-copy handling and untouched-advanced validation when another section saves. Strict advanced preflight occurs before cloning prices to prevent late validation failures from triggering the existing Mongoose rollback masking problem. Financial formulas, transport keys, PMC rules and prior inclusion/exclusion behavior are preserved.
- No dependency/lockfile changes, migration, seed, application database mutation, staging, commit, push or deployment occurred. Tests used isolated replica-set databases; browser QA used opt-in synthetic fixtures. Desktop screenshots are `desktop-card.png` and `desktop-simulator.png`; mobile layout is `mobile-card.png`. The failed fresh-context diagnostic is `mobile-report.json`, with script `/tmp/lisno-margin-15-20-mobile.mjs`.
- Cleanup closed the task's MCP tab and fresh-browser context, stopped its Vite server, and moved `.playwright-mcp/` into `/tmp/lisno-margin-15-20-final/browser/mcp-logs/`. Final source/test path set remains the original 44 modified paths and four task documents; no new product paths were introduced.

## Historical implementation record — not current execution instructions

The remainder records the earlier 10%–20% Min./Max. implementation and arrow-step follow-up. Its old bounds, approvals, tasks and check counts are historical evidence only; the current follow-up contract and F1–F5 above govern the next implementation.

Historical status: specification and task plan approved; execution mode A selected. T1–T5 complete. T6 command and desktop checks passed; mobile interaction verification remained blocked by browser automation timeouts. Cleanup completed.

## Fixed contract

- Card heading: **Lisno Margin**. Adjacent **Min.**/**Max.** controls have accessible names **Min. Lisno Margin (%)** and **Max. Lisno Margin (%)**.
- Persist maximum in `advanced.payload.subVendorMarginBps`; add `advanced.payload.subVendorMinimumMarginBps`. Use integer basis points, 1000–2000 inclusive, with Min. ≤ Max. Keep existing stored precision and five-percentage-point arrow steps, per the follow-up correction.
- Absent minimum property plus a valid legacy maximum means the effective pair equals the existing maximum. Opening or editing unrelated data must not persist a compatibility conversion. The first margin edit materializes the original pair before applying the edit.
- An explicit null minimum never inherits maximum. Entirely unconfigured drafts remain allowed; an explicit partial pair is invalid for Save Mode. Simulator requires both effective values to be valid.
- Test calculations reads the configured pair, defaults to Max., and offers Min./Max. radio selection. Send only the selected rate through existing `subVendorCalculation.subVendorMarginBps`. Keep transport keys, paise arithmetic, inclusive quantity boundary, custom-discount policy and signed vendor balance unchanged.
- The Sub-Vendor context name remains. Rename margin-specific presentation and validation to Lisno, including pending/conflict review and discount/breakdown copy.

## Worktree and ownership boundaries

Planning-time status: 25 modified product/test paths from the previous backend-owned inclusion/exclusion work, plus its two untracked documents and this task's untracked approved specification. That existing work includes the checklist hover-tooltip follow-up. Preserve every existing change; do not stage, revert, reformat or overwrite unrelated work.

Recapture status and per-target diffs at T1. The existing builder/pending-helper/CSS/backend-validator diffs were inspected during specification; inspect all additional dirty targets before assigning them. Parent owns product interpretation, shared contracts, integration and documentation.

If execution mode A is selected, use native agents with the following non-overlapping responsibilities. Each writer must be told it is not alone in the worktree and must preserve other agents' changes. In mode B, the parent performs the same work sequentially.

| Owner | Files and responsibility |
| --- | --- |
| Backend implementer | `backend/src/domain/ai-estimator-knowledge-validation.ts`, relevant margin message sites in `ai-estimator-knowledge-mode-calculation.ts`/`ai-estimator-knowledge-calculation.ts`, `backend/src/openapi/ai-estimator-knowledge.ts`, and focused backend tests. No frontend edits. Avoid changing persistence architecture or calculation formulas. |
| Frontend configuration implementer | `knowledgePmcMargin.ts`, `KnowledgePmcMarginInput.tsx` or a small adjacent Sub-Vendor range component if needed, `KnowledgeModeConfigurationBuilder.tsx`, `knowledgeModePendingChanges.ts`, `KnowledgeConflictReview.tsx`, scoped styles in `knowledge-configuration-ui.css`, and their focused tests. No editor/simulator/panel/backend edits. |
| Frontend simulator implementer | `KnowledgeModeCalculationTable.tsx`, `KnowledgeModeCalculationEditor.tsx`, `KnowledgeModeCalculationSimulator.tsx`, `KnowledgeSimulatorDiscountField.tsx`, and simulator/editor tests. Consume the agreed margin helper contract; do not edit its implementation or shared CSS. |
| Parent | `KnowledgeModePanel.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx`, synthetic QA fixtures when needed, this plan and the approved spec, contract coordination, integration and rendered verification. |

Any additional runtime file or shared-file dependency must be reported to the parent before changing ownership. Separate agents may read common files, but only their assigned owner writes them.

## T1 — Capture baseline and settle interfaces

Owner: parent. Depends on plan approval and the execution-mode choice. Acceptance: setup for AC1–AC7.

1. Capture dirty paths and relevant diffs; confirm no overlapping active writer from earlier tasks.
2. Trace `KnowledgeModePanel`'s `ADVANCED_EDITABLE_FIELDS`, mutation merge/error routing, retry and conflict paths. The new field must participate in every path that currently handles the maximum key.
3. Agree one frontend effective-range helper, pair validator and first-edit updater in `knowledgePmcMargin.ts`. Distinguish own-property absence from explicit null; keep PMC validation independent. Share helper signatures and the editor/simulator prop shape with both frontend writers before they start.
4. Ensure simulator snapshots preserve the absent-versus-null distinction, either by passing a resolved range or an explicit presence-preserving input. Do not accidentally convert a missing legacy minimum into explicit null at a component boundary.
5. Fix common asymmetric fixtures: two Main Lines with distinct IDs and unequal ranges, one legacy single-rate record, one unconfigured record. Preserve unrelated saved fields and the existing exclusion/inclusion fixtures.

## T2 — Extend backend configuration validation and contract documentation

Owner: backend implementer. Depends on T1. Acceptance: AC2, AC3, AC5 and backend parts of AC7.

1. Add `subVendorMinimumMarginBps` to advanced payload allowlists and specialized numeric validation; retain the established existing key as maximum.
2. Validate integer bounds, explicit partial pairs and ordering with actionable minimum/maximum paths. Keep supported legacy missing-minimum and entirely unconfigured payloads valid. Reject invalid pairs before any persistence/version/audit write.
3. Update OpenAPI advanced-payload properties and preview descriptions to document the configured range and selected-rate transport. Preserve route operation authorization and the current request/response shape; no new operation is needed.
4. Update margin-specific backend messages to Lisno while keeping source-specific Sub-Vendor calculation context. Avoid renaming transport keys or modifying PMC messages.
5. Add focused validator cases for legacy absence, null, both empty, partial, equal, reversed, 10%/20% bounds, decimal basis points, unsafe or wrong types. Extend isolated replica-set service tests for unequal-range save/reload, independent Main Lines, active-to-draft preservation and rejection without version/audit mutation.
6. Extend/reuse Sub-Vendor calculation and route coverage for both selected rates, the approved ₹2,420/₹2,640 example, inclusive threshold, fractional quantity, discount, rounded totals and signed balance. Reuse the existing backend calculation; do not implement a second formula.

## T3 — Implement compact range controls and review behavior

Owner: frontend configuration implementer. Depends on T1; safe alongside T2 and T4 after interface agreement. Acceptance: AC1, AC2, AC3 and configuration parts of AC6.

1. Implement effective legacy-range reading, pair validation and first-edit materialization in the agreed margin helper. No write on mount and no synthetic 10% fallback.
2. Replace the Sub-Vendor single margin control with compact Min./Max. inputs and one shared range hint, using existing field primitives. Keep PMC's single input and five-point step unchanged. Preserve read-only, temporary invalid text, error focus and controlled-value reset behavior.
3. Connect both values and issue paths to the configuration builder; report pair validity without unmounting inactive-mode drafts.
4. Extend pending-change projection using effective values, so a legacy pair made explicit without a value change creates no false change row. Show both changed margins and incomplete/invalid state with accurate Lisno labels.
5. Extend conflict-review field names and value presentation for minimum/maximum. Preserve other fields and user edits during server validation or version conflict recovery.
6. Update focused margin, builder, pending and conflict-review tests for first editing either field, clearing both, reversed/incomplete pairs, no-write opening, decimal input, read-only, Discard and error accessibility. Do not weaken existing inclusion/exclusion checks.

## T4 — Implement Min./Max. simulator selection

Owner: frontend simulator implementer. Depends on T1; safe alongside T2 and T3 once the helper/prop contract is agreed. Acceptance: AC1, AC4, AC5 and simulator parts of AC6.

1. Rename the Sub-Vendor calculation-table margin heading to Lisno Margin and keep the injected range controls within the existing card composition. Keep PMC and In-house layouts unchanged.
2. Snapshot the effective configured pair when opening Test calculations. Render both percentages read-only, with Max. initially selected in the Calculate with radio group; retain editable temporary Quantity and Discount.
3. Select the correct rate for each request using the existing Sub-Vendor request branch. Do not send In-house markup basis, generic hidden markup values or a PMC fallback.
4. Clear results and invalidate pending requests on basis changes, quantity/discount changes and close/unmount. Validate both configured values before calculating. Keep wrong-branch, wrong-rate/discount and reconciliation guards.
5. Update Lisno labels throughout results, hints and discount copy. Make the selected basis clear in the displayed result without altering backend money values.
6. Extend Sub-Vendor simulator tests for default Max., selecting Min., exact requests, returned totals, keyboard operation, null/invalid pair, legacy equality, stale responses after switching basis and reopening from updated configuration. Run existing PMC/In-house simulator tests as regression coverage.

## T5 — Integrate consumers and review

Owner: parent, followed by independent integrity reviewer in mode A. Depends on T2–T4 completion. Acceptance: AC1–AC6.

1. Extend `KnowledgeModePanel` editable-field tracking, server issue handling and editor props for the minimum. Preserve Save Mode, partial-save retry, refetch, Discard, dirty navigation, latest-server merge and version conflict behavior.
2. Update `KnowledgeModeSectionStateRemoval.test.tsx` to use Min./Max. labels and to verify both fields survive the real Mode workflow. Keep legacy-only payload assertions for unrelated edits; only materialize the pair when a margin is edited.
3. Add or extend opt-in synthetic fixtures with legacy, unequal-range and empty states for rendered QA; preserve previous scope-list fixtures. Synthetic QA must not make real API writes.
4. Search all margin consumers and reconcile UI validation, authoritative validation, presence/null handling, pending projection and fixed simulator snapshots. Inspect the final diff relative to T1 without reverting unrelated changes.
5. In mode A, run an independent `integrity_reviewer` after all writers finish. Review no-write opening, first-edit compatibility, rejection-before-write, query/version paths, integer financial reconciliation, isolation, stale requests and PMC/In-house regressions. Resolve confirmed findings before final verification. In mode B, perform the same review inline.

## T6 — Final verification and handoff

Owner: verification runner for command checks in mode A; parent for rendered QA and final reconciliation. Depends on T5. Acceptance: AC7 and evidence for AC1–AC6.

Run final command checks on the integrated worktree after writers/review fixes finish. Reuse focused tests that already cover unchanged formulas; add missing behavior assertions rather than duplicating implementation.

- Backend focused, from `backend/`: `npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-item.service.test.ts tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts`. Add the relevant OpenAPI inventory check if contract-documentation assertions live outside those files. Service tests must use isolated replica-set fixtures, never the application database.
- Frontend focused, from `frontend/`: `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/knowledgeModePendingChanges.test.ts src/features/ai-estimator-knowledge/KnowledgeModePendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeConflictReview.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx`. Include any newly added focused range-helper/component test files.
- Run `npm run typecheck` and `npm run build` in both workspaces. Broaden only if changed shared paths or failures justify it. No lint script exists.
- Render the actual Mode workspace and simulator with synthetic data at desktop and mobile widths. Inspect paired-control alignment, no horizontal overflow, accessible names, focus, Min./Max. selection and results, invalid/read-only states, legacy no-write opening and close/reopen. Capture concise evidence; report any browser-tool limitation rather than claiming an unverified interaction passed.
- Run `git diff --check` and `git status --short`. Store temporary logs/screenshots outside tracked source and stop task-owned servers/browser sessions.
- Report implemented behavior, principal files, exact commands/counts/results, unrun checks and risks. No migration, seed, staging, commit, push, deployment or external database mutation is authorized by this plan.

## Dependency order and progress

`T1 → (T2, T3, T4) → T5 → T6`.

Only T2–T4 may run concurrently, under the explicit file boundaries above and the four-agent capacity limit including the parent. Parent integration in `KnowledgeModePanel.tsx` may be prepared once prop/helper signatures are settled, but T5 review waits for every writer. Independent integrity review and final verification are sequential. Keep one parent task in progress.

- Specification: approved.
- Task plan: approved.
- Execution mode: A.
- T1–T5: complete.
- T6: command and desktop checks passed; mobile interaction check not verified because browser automation stalled.


## Implementation and verification evidence

- T1 captured the original 25 modified paths and their contents/diffs in `/tmp/lisno-margin-baseline/`. Existing inclusion/exclusion persistence and tooltip edits are preserved. Backend/configuration writers worked independently; a third writer could not start because of the agent capacity limit, so the parent implemented the simulator and panel integration inline alongside them.
- Backend added only the optional minimum field, pair validation, Lisno copy and OpenAPI documentation. Existing maximum and selected-rate transport keys remain unchanged. No persistence schema, service architecture, authorization operation or financial formula change was needed.
- Frontend uses one legacy-aware range helper and first-edit updater, paired controls, complete pending/conflict review and Min./Max. simulator selection. ModePanel tracks both fields through save, retries, refetch and conflict rebase. Simulator rate/discount and reconciliation guards remain in place.
- Independent integrity review found two related pending-review issues after accepting a server counterpart during conflict recovery. The parent fixed both with shared counterpart synchronization that retains local differences. Six added real Mode lifecycle cases cover immediate rebase and subsequent edits in either direction. Reviewer rechecked both fixes and reported no remaining blocking findings.
- Final frontend focused command listed under T6, plus `knowledgeModeConfiguration.test.ts`, `knowledgeModeCalculations.test.ts` and `src/test/fixtures/enterpriseTransport.test.tsx`, passed **326 tests across 13 files**. Includes margin27, builder19, pending helper14, pending UI19, conflict9, Sub-Vendor44, PMC59, editor16, In-house12, ModeSection43, configuration13, calculation helper5 and transport46.
- Final backend focused command listed under T6, plus `tests/api-docs.test.ts`, `tests/ai-estimator-knowledge-pmc-calculation.test.ts`, `tests/ai-estimator-knowledge-mode-calculation.test.ts`, `tests/ai-estimator-knowledge-calculation.test.ts` and `tests/ai-estimator-knowledge-integration.replica-set.test.ts`, passed **419 tests across 10 files**. Initial sandbox listener EPERM was resolved by an approved rerun of the identical command. Service and integration tests used isolated Mongo replica sets, proving unequal-pair save/reload, Main Line isolation, legacy/history preservation and no rejected writes.
- `npm run typecheck` and `npm run build` passed in both workspaces; `git diff --check` passed. No lint script exists. Existing Mongoose `new` deprecation and frontend bundle-size warnings remain. One passing minimum-margin server-validation UI test emits React act/suspense warnings. Full unrelated suites, OCR and migration checks were not run.
- Final command logs are under `/tmp/lisno-margin-final/`. No dependency/lockfile changes, migration, seed, application database writes, staging, commit, push or deployment occurred.

- Rendered desktop at 1728×1000 verified the compact side-by-side Min./Max. card, configured 10%/20%, both radio selections, exact outgoing selected-rate requests and rendered ₹2,640 Max./₹2,420 Min. results. The preview responses were fixed synthetic server-shaped fixtures; backend tests independently establish calculation correctness and persistence. Screenshots: `/tmp/lisno-margin-final/browser/1728-card.png` and `1728-simulator.png`.
- Mobile at 390px rendered the initial workspace and its responsive Configuration section dropdown. The browser controller stalled after responsive navigation or viewport changes. An installed Playwright CLI session also failed to persist; a single-process headless Chrome fallback reproduced timeouts after choosing Mode, including DOM snapshot/font-readiness waits. Mobile margin controls, result selection and overflow were therefore **not verified**. Do not treat these tool failures as a passed mobile test or a confirmed product root cause. The initial mobile overview screenshot is diagnostic only.
- Final cleanup stopped task-owned Vite and closed the task browser contexts. MCP logs moved to `/tmp/lisno-margin-final/browser/mcp-logs/`; CLI diagnostic artifacts remain outside the repository under `/tmp/.playwright-cli/`. Temporary QA scripts are `/tmp/lisno-margin-qa.mjs` and `/tmp/lisno-margin-mobile-inspect.mjs`. Prior dirty files changed outside this task's assigned overlap: none. All 11 extended pre-existing dirty paths were within the approved margin scope.


## Five-point step follow-up

- Changed both Lisno margin controls from `step=0.01` to `step=5`, matching the earlier PMC control behavior. Existing 10%–20% bounds and stored-value compatibility remain in place. A clarification about allowing 5% was asked; absent an answer, no lower-bound expansion was made.
- Updated the existing paired-control regression assertion. `npm test -- src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx` passed: 27 tests. `npm run build` passed, including TypeScript compilation. Logs: `/tmp/lisno-margin-step-tests.log` and `/tmp/lisno-margin-step-build.log`.
- Native rendered desktop keyboard check at 1728×1000 passed: Min. moved 10 → 15 → 20 → 15, and Max. moved 20 → 15 → 20. Both retained bounds 10 and 20. No save request was made. Broader suites and mobile checks were not repeated for this input-step-only correction.
