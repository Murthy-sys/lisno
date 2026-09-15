# Configurable Lisno margins and compact Mode introduction — task plan

Approved specification: [Configurable Lisno margins](../specs/2026-09-14-admin-configurable-lisno-margins-design.md).

Status: revised specification and task plan approved; the user selected execution mode A. Implementation, independent integrity review, final command checks and desktop browser checks are complete. Mobile browser verification remains incomplete because screenshot capture timed out and the subsequent browser read stalled. Handoff evidence below was finalized on 2026-09-15.

## Fixed contract

- Remove the visible Mode configuration heading and both screenshot paragraphs, without empty spacing. Retain an accessible name and read-only revision status.
- Super Admin can configure Sub-Vendor Min./Max. Lisno Margin as **0%, 5%, …, 95%**, with Min. ≤ Max. Store integer basis points **0–9500 divisible by 500**. Retain five-point stepping and reject typed/API off-step values without rounding or clamping. Remove the fixed 15%/20% choice restriction.
- Both fields may be empty; an explicit partial pair is invalid. A missing legacy minimum reads as the maximum without writes. Zero is valid, not missing. Historical 10% becomes valid; historical 17.5% remains visible and repairable but cannot be saved, activated or previewed until corrected.
- Preserve the narrow historical repair exemption: it applies only to otherwise valid, unchanged off-step legacy values in the previously supported 10%–20% range. Widening accepted valid steps must not widen this exemption to malformed historical values outside that range.
- Keep existing field names, endpoints, permissions, draft/Active/version semantics and preview envelope. Both simulator choices use the exact configured rate; Max. remains the default.
- Preserve selling price **adjusted cost ÷ (1 − margin / 100)**, integer-paise half-up rounding, existing impact/discount/signed-balance policy, stale-response checks and read-only preview behavior. The general money helper remains unchanged.
- Preserve PMC's range/step, In-house, prior inclusion/exclusion work and all unrelated changes. No migration, seed, live configuration write, dependency, lockfile, commit, push or deployment is included.

## Ownership and execution boundaries

Current baseline: 47 modified source/test paths, six previous task documents and this change's approved specification. Before writers start, capture a fresh dirty-path set, full diff and exact contents of assigned dirty files outside tracked source. Understand existing edits before assigning ownership. Never revert, reformat or stage unrelated work.

| Owner | Exclusive responsibility |
| --- | --- |
| Parent | Specification interpretation, this plan, baseline, shared examples, integration and rendered QA. Synthetic browser fixtures under `frontend/src/test/fixtures/` are parent-owned if adjustments are needed. |
| Backend validation/preview implementer | `backend/src/domain/ai-estimator-knowledge-validation.ts`, `ai-estimator-knowledge-mode-calculation.ts`, `backend/src/routes/ai-estimator-knowledge-admin.ts`, OpenAPI and relevant contract comments; their validation, Sub-Vendor, route and API-doc tests. No model/service or frontend writes. |
| Frontend implementer | `KnowledgePmcMarginInput.tsx`, `knowledgePmcMargin.ts`, `KnowledgeModeConfigurationBuilder.tsx`, narrowly scoped CSS if needed, related simulator integration/type comments only if required; margin, builder, simulator and Mode lifecycle tests. Parent subsequently assigned the bounded `KnowledgeItemWorkspacePage.tsx` query fix and `KnowledgeScreens.test.tsx` regression needed for save-to-simulator verification. No backend or parent-owned fixture writes. |
| Persistence/compatibility implementer | `backend/tests/ai-estimator-knowledge-item.service.test.ts` and `ai-estimator-knowledge-integration.replica-set.test.ts`. Own `AiEstimatorKnowledgeSection.ts` and `ai-estimator-knowledge-item.service.ts` only if the approved narrow repair behavior requires an adjustment; preserve the established mechanism when validation classification alone suffices. No domain/route/frontend writes. |
| Integrity reviewer / verification runner | Read-only integrated review and final checks respectively; no product edits. |

After task-plan approval, obtain the repository-required execution choice. In Mode A, use native subagents only after that choice; give each owner the fixed contract, exact file boundaries and an explicit reminder that other agents share the worktree and their edits must not be reverted. In Mode B, the parent performs all slices and review/verification inline. Additional changed paths require parent assignment before edits.

Dependency order: **T1 → (T2, T3, T4) → T5 → T6**. T2/T3/T4 may run in parallel in Mode A once T1 settles legacy error classification. T4's final integration tests must use the finished T2 validator. Parent browser-fixture preparation can proceed independently; final browser checks wait for all frontend writers. Keep one parent task in progress.

## T1 — Capture baseline and pin validation/examples

Owner: parent. Depends on plan approval and execution-mode selection. Covers AC2–AC6.

1. Capture status and per-target baseline; confirm no existing writer is active on assigned paths.
2. Trace the current error-code exemptions in model validation, unchanged Active-to-draft copying and updates to unrelated sections. Pin the distinction between new valid steps and invalid historical off-step values before delegation.
3. Keep `INVALID_LISNO_MARGIN_INCREMENT` copy-exempt classification confined to its old otherwise-valid 1000–2000-bps historical range. Other invalid steps must produce a non-exempt validation issue. Do not let the widened numeric range silently make 999 or 2001 bps repair-exempt. Normal writes/activation reject all off-step values regardless of this classification.
4. Share independent examples: CP ₹100/35% → ₹153.85; CP ₹200/10% → ₹222.22; CP ₹200/35% → ₹307.69; CP ₹200/95% → ₹4,000; CP ₹200/0% → ₹200. Examples assume no impact or discount. Preserve existing impact and discount examples.

## T2 — Broaden backend validation without changing the formula

Owner: backend validation/preview implementer. Depends on T1; parallel with T3/T4 in Mode A. Covers AC2–AC5.

1. Replace 1500/2000-only checks in section validation, preview Zod schema and the Sub-Vendor calculation branch with safe integer 0–9500 and modulo-500 validation. Preserve PMC validation and the generic money helper.
2. Preserve paired/ordered/legacy-absence semantics and T1's narrow error classification. Keep explicit null distinct from an absent minimum and use null checks rather than truthiness for zero.
3. Update OpenAPI request/result and advanced payload descriptions to the new bounds and `multipleOf: 500`; remove stale two-value enums and repair wording that wrongly rejects 10%. Keep transport names and authorization registry entries unchanged.
4. Update focused tests to accept new valid steps, including 0/500/1000/2500/3500/9500 bps. Test the full finite set of valid steps where inexpensive, unequal Min./Max. pairs and rejection of off-step, fractional-bps, negative, 10000+, nonnumeric and partial/inverted input.
5. Add actual preview HTTP coverage for ₹100/35% = ₹153.85 and both configured-rate examples. Retain exact half-up, zero, overflow, impact/discount, signed-balance and obsolete-response arithmetic regressions. Do not modify existing financial expectations for unchanged 15%/20% or PMC scenarios.
6. Run focused backend validation/domain/route/API-doc checks and report results and any contract discrepancy to the parent.

## T3 — Update margin inputs and remove the introduction

Owner: frontend implementer. Depends on T1; parallel with T2/T4 in Mode A. Covers AC1–AC5.

1. Parameterize the shared margin input's hardcoded maximum/placeholder as needed. Use Lisno min 0, max 95 and step 5; preserve PMC's current values and behavior. Replace the restrictive Lisno hint with concise five-point guidance, retaining accessible labels/descriptions.
2. Broaden Lisno helpers to safe integer 0–9500 divisible by 500. Preserve raw invalid text so users can correct it, explicit empty/legacy handling, complete ordered pairs and existing validation focus. No automatic snapping/clamping or new defaults.
3. Remove the screenshot heading and paragraphs plus their empty wrapper spacing. Keep a screen-reader-accessible Mode name and retain the read-only badge without a blank introduction row. Scope any CSS narrowly; do not hide shared headings globally.
4. Verify configured 10%/35% and 0%/95% pairs flow through draft state and simulator props. Both radios must send their exact configured rates; Max. defaults and read-only configured fields remain. Reuse existing exact server-response checks rather than computing replacement display values.
5. Update margin/builder/simulator/lifecycle tests: typed 12.5/17/18 rejected without alteration; 15.00 accepted; 0 not missing; limits and order enforced; 10 no longer falsely invalid; 17.5 still repairable. Include save/reopen state, Min./Max. selection, stale/context changes, errors/retry and read-only behavior with asymmetric configurations.
6. Reuse existing rendered tests for the introduction's visibility/accessibility and read-only status rather than adding a separate copy-only suite. Run the focused frontend checks and report results.

## T4 — Verify persistence, legacy repair and authorization

Owner: persistence/compatibility implementer. Depends on T1; preparation can run alongside T2/T3, final checks require T2. Covers AC2/AC3/AC5.

1. Split old tests that grouped 10% and 17.5% as invalid. Prove legacy 10% works without repair or implicit data changes, while 17.5% remains invalid for ordinary advanced-section saves, activation and preview.
2. Preserve unchanged-copy repair of 17.5%, updates to unrelated sections and immutable Active source history. Prove edited copies, malformed types, partial/inverted pairs and invalid off-step values outside the old repair range remain rejected. Include 999 and 2001 bps to expose accidental exemption expansion.
3. Exercise actual replica-set draft save/reload/activate for 10%/35% and 0%/95%, with another unequal Main Line to catch accidental cross-line changes. Assert exact stored basis points, version/CAS behavior, audits and unchanged approved/source history.
4. Retain authenticated Super Admin and asymmetric unauthorized/read-only actor coverage. Verify rejected writes leave payloads/versions/audits unchanged. Do not alter role permissions or transaction behavior.
5. Leave model/service code unchanged if domain classification already preserves these invariants; otherwise make only the bounded compatibility adjustment and notify the parent/backend owner immediately.
6. Run service/model tests and the existing isolated `startMongoReplicaSet` integration lane. Never point these tests at application or production databases; do not weaken replica-set requirements when the local environment fails.

## T5 — Integrate and review

Owner: parent, then integrity reviewer in Mode A. Depends on all writers finishing. Covers AC1–AC6.

1. Reconcile every changed path with the captured baseline; preserve prior task edits. Search relevant Lisno code/docs for stale fixed choices and inspect all newly changed validators, error codes and fixtures. Historical task specs remain historical records.
2. Confirm modulo validation across UI, save, model/domain and preview; zero/empty semantics; narrow repair exemption; exact existing formula; immutable history; permissions and query refresh behavior.
3. Confirm the removed heading leaves valid accessible naming and read-only status, and shared PMC input behavior is preserved.
4. Run independent integrity review after writers finish in Mode A; perform the equivalent review inline in Mode B. Resolve findings before final verification. Do not broaden the approved change to unrelated UI or persistence refactors.

## T6 — Final verification and handoff

Owner: verification runner for commands in Mode A; parent for browser checks/final reconciliation. Depends on T5 and any fixes. Covers AC6 and final evidence for all criteria.

Focused backend, from `backend/`:

```sh
npm test -- tests/ai-estimator-knowledge-validation.test.ts tests/ai-estimator-knowledge-sub-vendor-calculation.test.ts tests/ai-estimator-knowledge-pmc-calculation.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts tests/ai-estimator-knowledge-context.service.test.ts tests/ai-estimator-knowledge-configuration-context.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts tests/ai-estimator-knowledge-item.service.test.ts
npm test -- tests/ai-estimator-knowledge-integration.replica-set.test.ts
npm run typecheck
npm run build
```

Focused frontend, from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcMargin.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeSubVendorCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeCalculationEditor.test.tsx src/features/ai-estimator-knowledge/KnowledgePmcCalculationSimulator.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseTotal.test.tsx
npm run typecheck
npm run build
```

Add a fixture or consumer test only when it is actually changed or a discovered dependency warrants it. Reuse post-writer passing evidence if review makes no further source changes, clearly reporting which checks were reused. No lint script exists.

Rendered QA after writers finish:

- Use the real Mode workspace with local synthetic data at desktop (approximately 1728 × 1000) and mobile (390 × 844) widths. Verify the removed introduction leaves no blank area and accessible naming/read-only status survive.
- Enter and retain 10%/35%, exercise a typed off-step error and correction, then check both exact-rate simulator requests/results, keyboard selection and Max. reset on reopening. Check zero/95 in focused rendered tests and inspect overflow/focus/error states.
- Capture actual network/console failures and accessibility results. Synthetic preview fixtures prove frontend handling; domain/HTTP/replica tests separately prove backend calculations and persistence. Never present synthetic responses as live backend evidence.
- Previous mobile close/reopen browser automation timed out despite passing calculation/layout checks. Use bounded retries and record the exact operation if this recurs; screenshots cannot prove an uncompleted interaction. Avoid concurrent Vite edits during QA.
- Store temporary evidence outside tracked source, stop task-owned servers/contexts and remove tool artifacts from the worktree. Run `git diff --check` and final `git status --short`.

Handoff must state implemented behavior, affected files/contract, exact checks and results, any unrun checks or browser limits, and that no migration or external action occurred. Do not reuse the preceding task's 538-test result as evidence for this new change.

## Progress

- Revised specification: approved by the user.
- Task plan: approved.
- Execution choice: A.
- T1: complete. Captured all 47 modified tracked files, their full diff and status in `/tmp/lisno-configurable-margin-baseline/`. Pinned the narrow legacy error classification and shared examples before writers started.
- T2/T3/T4: complete. Backend range/step validation, frontend inputs/introduction and persistence compatibility tests passed. Model/service sources and the generic selling-price helper remain unchanged from the baseline.
- T5: complete. Independent review found no blockers, including a separate review of the workspace query correction and invisible heading after browser integration findings.
- T6: command and desktop checks passed; mobile browser verification remains incomplete due to automation timeouts. No remaining implementation finding is known. Cleanup is complete.

## Integration findings resolved

Saving Mode exposed a pre-existing cache-key/query-function mismatch in `KnowledgeItemWorkspacePage.tsx`: the disabled workspace observer used the Overview cache key while its function passed `null` in Mode. Mode's enabled Overview observer shared that key; invalidating after save could request `/sections/null`. The real backend rejects that request, temporarily making UOM unavailable. The synthetic transport returned an empty section, which made the same symptom especially visible.

An independent explorer reproduced this with the installed Query Core, then the frontend writer added a full-workspace regression that failed before the fix. The one-line correction makes the query function use `backendSection ?? "overview"`, matching its existing key, without changing enablement. The regression proves real save invalidation, no null section request, preserved Overview UOM/cache and a subsequent successful 35% preview. Parent explicitly assigned these two initially clean files; their baseline is `/tmp/lisno-configurable-margin-workspace-fix-baseline/`. This bounded correction was necessary for AC2/AC4 save-to-simulator behavior, with no new permission or persistence contract.

The broader workspace accessibility suite also caught heading-order failures after removing the introduction. A screen-reader-only Mode H2 now preserves the document hierarchy and group name. Its existing absolute/clipped utility creates no visible heading or spacing; the visible heading wrapper and paragraphs remain removed. All affected accessibility tests pass.

## Final verification evidence

- **860 unique tests passed across 18 files.** The exact backend nine-file T6 command passed **459 tests**: validation50, Sub-Vendor140, PMC46, Mode35, context6, configuration context13, routes58, API docs17, item service94. The separate replica-set command passed **66 tests**. The eight-file frontend command above passed **335 tests**: Screens68, margin44, builder19, Sub-Vendor72, ModeSection45, editor16, PMC59, In-house12. Preliminary overlapping runs and independent review probes are not counted again.
- Final verifier ran fresh backend focused/replica checks, backend typecheck and both builds. It reused current frontend tests/typecheck only after reconciling source timestamps and confirming no later edits. `npm run typecheck` and `npm run build` passed in both workspaces; `git diff --check` passed. There is no lint script.
- Independent review found no blockers in the complete change and then the bounded workspace/heading correction. Additional read-only classification, pair and model probes passed; these are separate from the 860-test total.
- The exact follow-up diff and path inventory are `/tmp/lisno-configurable-margin-final/followup.patch` and `changed-paths.json`: **21 source/test files** changed from this task's baseline (11 backend, 10 frontend). Unrelated initial dirty contents were preserved. Final worktree retains 49 modified tracked files and eight task documents; no staging occurred.
- Backend product changes are confined to the Lisno section validator, preview domain/schema, OpenAPI and contract comment. Frontend product changes are the margin input/helper, compact builder, narrow read-only CSS and the one-line workspace query correction. The other changed files are regression tests. No source fixture changes were needed; browser save/preview responses were runtime-only synthetic data.
- Desktop at **1728 × 1000** passed: visible introduction removed, compact 10%/35% fields, typed18% retained and flagged invalid, corrected pair saved as1000/3500bps, UOM retained after save, no null-section request, defaultMax result₹3,384.62 thenMin result₹2,444.44 for adjustedCP₹2,200, exact3500/1000bps requests and keyboard close. No document overflow, captured application errors, unexpected synthetic requests or axe violations were reported. Screenshots `browser/desktop-mode.png` and `browser/desktop-margin.png` were visually inspected.
- Mobile attempt at **390 × 844** did not complete: screenshot capture timed out while waiting for fonts, then a bounded follow-up browser read stalled and was terminated. Do not claim a mobile screenshot, margin-save/calculation pass, layout pass or mobile accessibility result from that interrupted run. Responsive behavior is covered only by the existing rendered test evidence and desktop inspection; final real-browser mobile verification remains a limitation.
- Browser setup initially used an inconsistent synthetic item UOM and then revealed the real null-section query defect described above. The final passing desktop run uses a consistent synthetic item/Overview and the corrected product query. A full-group screenshot attempt and an ambiguous nested-group locator were replaced with viewport captures and the exact existing margin element. These were QA setup/capture issues; final desktop evidence was collected after correction.
- Existing warnings remain: React act/suspense warnings in the passing ModeSection minimum-validation scenario; Mongoose deprecated `new` option warnings in persistence tests; frontend build chunk warning (main JS approximately1485.17kB, gzip407.53kB). Browser axe emitted a preload-asset warning but returned zero violations.
- Evidence is consolidated at `/tmp/lisno-configurable-margin-final/`, including backend focused/replica logs, both build logs, typecheck logs, reused frontend evidence, hygiene logs and `browser/qa-results.json`. The pre-fix failing workspace regression is `/tmp/lisno-workspace-uom-before-fix.log`.
- Cleanup completed: browser tab closed, task-owned Vite session stopped, `.playwright-mcp/` artifacts moved to `browser/mcp-logs/` outside the repository. A duplicate server-start attempt encountered the already-running task server; no second server was left running.
- Full unrelated suites, OCR and migration checks were not run. Replica tests used isolated temporary databases. No dependency/lockfile change, application-database mutation, migration, seed command, commit, push or deployment occurred. New saved rates still require a compatible backend when eventually deployed; no release action is included here.
