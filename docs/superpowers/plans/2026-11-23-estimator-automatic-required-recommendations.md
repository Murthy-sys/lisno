# Automatic required items and probable popup: task plan

Date: 2026-11-23
Status: Completed after approved Mode A implementation, integrity review and final integrated verification.

## Outcome and boundaries

Automatically add non-negotiable additions to the web estimator's working draft in the source room. Offer probable additions through the existing popup with Add and Ignore. Preserve normal pricing, PMC splits, source identities, saving, permissions and immutable published estimates.

This is a working-estimator selection change. Do not redesign the client quotation or mobile authoring workflows, introduce new Configuration fields, install dependencies, migrate data, send emails, commit, push or deploy. Extend the existing resolver and shared presentation through explicit options; default behavior for other consumers must remain compatible.

## Settled integration contract

The primary agent owns cross-file contracts and agrees their exact TypeScript shape before parallel writers begin:

- Retain existing `RecommendationDecision` / `RecommendationLine` types and `must` / `can` classifications. Add an explicit resolver option for including probable additions; keep the existing default for callers outside the approved estimator flow.
- Flatten Main Line and Sub Basket targets using the existing stable target identity, then combine same-room relationships with required precedence. The resolved result must distinguish required targets, optional candidates, source evidence, pending resolution and actionable required-item issues.
- Add a focused pure selection helper, provisionally `frontend/src/features/leads/estimatorRecommendationSelection.ts`. It receives current draft lines, current room-scoped relationships and verified catalogue evidence; it returns deterministic additions/origin updates/removals and issues. It does not fetch, persist, calculate new prices, open a dialog or change focus.
- The workspace owns asynchronous reads, applying a result, dirty state, Save/Submit gating and local optional decisions. Required processing covers every room with selected sources rather than only the active room. Use the existing query client and authorized reader with bounded/deduplicated requests; no new network library or endpoint is expected.
- Keep manual selection distinct from recommendation-only ownership. An independently selected row must not become recommendation-only just because another item recommends it. Keep `recommendationSourceMainLineIds` for actual dependency ownership; derive display-only “required by” information from verified relationships.
- Ignore/dismissal keys use lead, room, source/rule and target identities plus relevant Configuration versions. Routine refetches, pagination and automatic descendant additions must not erase a prior optional decision. Materially changed optional relationships can be offered again. This state is local, not serialized.
- Shared recommendation presentation receives explicit optional-item mode, optional Ignore callbacks/state and configurable labels/completion behavior. It must not itself auto-add required rows. Existing callers retain their present defaults.
- Save/Submit performs a final check against the current draft/reconciliation generation. When required work is still pending or unresolved, return a concise existing-style message without issuing a mutation. Optional Add/Ignore processing never creates a required completion condition of its own.

## Dependency-ordered tasks

### T0. Capture baseline and establish recommendation contracts

Owner: primary agent. Depends on task-plan approval and execution-mode selection. Covers AC1–AC6 foundations.

1. Capture the initial dirty-path set, relevant target diffs and copies of untracked targets before writers start. Preserve the completed PDF/PMC changes and all unrelated edits.
2. Reconfirm the staff save and submission paths, catalogue response limits, request identity guards, existing target creation defaults and all removal entry points, including row, Sub Basket and Setup removals.
3. Settle the helper output, all-room reconciliation state and popup props described above. Identify the explicit opt-in boundary for the existing editable estimator; historical, locked, client and mobile consumers retain their current behavior.
4. Extend `roomRecommendations.ts` to optionally retain probable rules while preserving availability, room applicability, source/target revisions and required precedence. Keep unavailable required decisions visible as issues, not silent omissions.
5. Add focused resolver fixtures for required-only, probable-only, mixed, overlapping direct/Sub Basket targets and stale identities. Publish exact helper/prop contracts to owners before their behavior changes.

Owned files: `frontend/src/features/leads/roomRecommendations.ts`, `roomRecommendations.test.ts`, and any minimal type-only addition in `estimationCatalogueApi.ts`. Primary also owns the specification/plan and boundary reconciliation. Do not modify catalogue payload semantics unless evidence shows a gap.

### T1. Reconcile required items into the working draft

Owner: estimator-state implementation slice. Depends on T0. Covers AC1, AC3–AC5.

Owned source files:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/estimatorRecommendationSelection.ts` and its focused unit test
- `frontend/src/features/leads/configuredEstimate.ts` and its existing tests, only for needed source cleanup/selection integration
- `frontend/src/features/leads/salesRecommendationScope.ts` and its test, only if automatic basket ownership needs extension
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx` and directly affected workspace lifecycle tests

Implementation:

1. Resolve requirements across affected rooms when current selected source data is available. Add valid missing targets locally with existing row-creation and pricing functions; retain existing values for already-present targets and add only needed basket membership.
2. Apply additions and origin changes in one deterministic draft update. Continue resolving newly added required descendants until no further work remains. Deduplicate by room/Main Line identity, enforce existing request bounds and guard against stale responses and infinite cycles.
3. Maintain independently selected roots and compute reachable recommendation-only dependents. Removing the last root must clean up orphaned cycles; removing one of two sources must retain their shared target. An independently chosen target keeps its own values and selection.
4. Guard every row/group/Setup exclusion path against removing a dependency required by surviving selected sources. Evaluate the proposed removal and its dependency cleanup together, so removing the sole root of a cycle remains possible. Show the relevant required-by reason without a new confirmation flow.
5. Preserve normal incomplete-field behavior for dimensions/components. For unavailable, unpriced, incompatible or stale required targets, retain a visible issue and the existing refresh/review action; do not invent a row's price or a replacement line.
6. Protect draft hydration, saves in flight, navigation, edit locks and source removal. Mark real automatic draft changes dirty; no background Save request. Do not treat repeated acknowledgements as new edits.
7. Add current-generation required-resolution checks to Save, first submission and subsequent send/publication actions. Cover non-active rooms and verify that source rows and automatic additions are serialized together through the normal mutation.
8. Adapt recommended-item selection to accept verified optional candidates and preserve their source links. Keep Ignore state and UI callbacks consistent with T2's settled contract; do not write shared presentation files.

Test required chains, cycles, shared/manual ownership, unequal rooms, defaults versus retained quantities/tiers/dimensions, normal monetary totals, PMC totals, hydration/reload, pending reads and out-of-order responses. Update tests that explicitly expect the superseded manual-required popup behavior while retaining their underlying identity/freshness/cleanup assertions.

### T2. Present probable choices and required status

Owner: estimator-presentation implementation slice. Depends on T0's contracts; can run beside T1 on separate paths. Covers AC1–AC4 and AC6.

Owned source files:

- `frontend/src/features/leads/EstimatorRecommendations.tsx` and its test
- `frontend/src/features/estimates/EstimateRecommendations.tsx` and its test
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its directly affected tests
- Existing scoped recommendation/selection CSS only if rendered evidence shows a layout issue

Implementation:

1. Opt the approved estimator into the probable-items presentation. Show only optional candidates with source labels and Add/Ignore; remove required Add actions from this flow.
2. Show automatic-selection receipts and unresolved required issues inline without taking focus or opening a popup. Explain disabled required-row removal while allowing its normal quantity/pricing edits.
3. Keep ignored entries reconsiderable on explicit reopen. Closing the optional popup dismisses its current prompt without changing selected rows. Complete the current suggestion batch after accepted Add/Ignore choices, including paginated items, without incorrectly closing during stale/error states or optional changes awaiting acknowledgement.
4. Do not open a popup when only required items exist. Keep optional loading/error/empty states distinct from required-item issues. Respect existing access/lock state.
5. Preserve the shared component's current behavior by default for client and other callers; do not rename their labels or change their callbacks unintentionally.
6. Reuse the existing dialog, focus management, pagination and styling. Verify long names, keyboard actions, mobile width and reduced motion; no visual redesign or dependencies.

Coordinate any workspace callback change with T1 instead of editing its files. Tests should cover probable-only, mixed, ignore-all-by-individual-actions, explicit reopen, required precedence, blocked/failed Add, pagination, focus and unchanged default consumers.

### T3. Integrate and verify persistence boundaries

Owner: primary agent. Depends on T1 and T2 finishing. Covers AC4–AC6.

1. Reconcile final behavior and diffs against the approved spec and captured baseline. Check all inclusion/removal paths, room switching, pending request handling, auto-added basket cleanup and Save/Submit paths as one flow.
2. Confirm both required and explicitly accepted probable rows retain their same-room origins after the existing staff save/reload. Validate unauthorized, stale, self/cross-room identities using existing checks. No rule acceptance should be based on labels.
3. Extend relevant synthetic replica-set tests in `backend/tests/estimator-catalogue-estimate.replica-set.test.ts` and catalogue recommendation tests where needed to prove persistence, current sources and no read-side effects. Backend product changes are not expected: the catalogue already returns both categories and staff save already carries recommendation origins.
4. If inspection proves a shared quotation mutation is actually on this path and rejects optional origins, primary owns the narrow changes in `backend/src/services/quotation-recommendations.service.ts` / `quotation.service.ts` and their tests. Preserve authorization, current active relationship validation, source fences and client visibility. Do not expand the client recommendation UI or introduce global mandatory enforcement. Record evidence for this conditional change before editing.
5. Check that added scope uses normal paise calculations, configured tier/mode/dimension rules and PMC summary construction. Do not reprice or rewrite existing issued rounds/PDFs.
6. After writers stop, run integrity review; resolve confirmed findings before final verification. In Mode A use `integrity_reviewer`; in Mode B perform the equivalent review inline.

### T4. Final integrated verification and handoff

Owner: verification agent in Mode A; primary in Mode B. Depends on T3 review fixes. Covers AC1–AC6.

Run focused tests first on the integrated tree, then the affected workspace checks. Use existing suites and add meaningful scenarios rather than tests that merely repeat implementation details.

Frontend, from `frontend/`:

```sh
npm test -- src/features/leads/roomRecommendations.test.ts src/features/leads/estimatorRecommendationSelection.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/salesRecommendationScope.test.ts --maxWorkers=1
npm test -- src/features/leads/EstimatorRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx --maxWorkers=1
npm test -- src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.rounding.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Backend persistence/source evidence, from `backend/`, using isolated replica sets:

```sh
npm test -- tests/estimator-catalogue-recommendations.replica-set.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-pmc-payment-split.test.ts --maxWorkers=2
```

If a backend product path changes, additionally run its focused save/publication/quotation regression tests and `npm run typecheck && npm run build` as separate commands. Run replica-set checks for changed transactional paths. No mobile source change is planned; do not run native builds or broaden into mobile authoring.

Browser QA: use synthetic required-only, probable-only and mixed examples at desktop 1440×900 and phone 390×844. Exercise selecting a source, visible automatic additions, optional Add/Ignore, dismissal/reopen, quantity input focus, pagination, a required-input issue, room switching, source removal and Save/reload. Check keyboard access, focus restoration, horizontal bounds, console and network failures. Use a local harness or isolated local application data, never production or real client data.

Final root checks:

```sh
git diff --check
git status --short
```

Record exact commands, results, any unrun checks and remaining limitations in this plan. Remove temporary QA artifacts after recording evidence, preserve unrelated ignored outputs, and report generated build output paths. There is no repository lint script; do not report a lint result.

## Acceptance trace and execution rules

| Acceptance criterion | Evidence |
| --- | --- |
| AC1: automatic required selection | T0 required/optional resolver; T1 draft reconciliation; T2 no required popup; T4 rendered flow |
| AC2: optional Add/Ignore | T1 optional source handling; T2 dismissal/reopen and pagination; T4 mixed/probable-only flow |
| AC3: identity, shared ownership and cycles | T1 pure graph tests and multi-room workspace tests; T3 save/reload |
| AC4: incomplete/stale/racing data | T1 all-room generation guards; T2 inline required issues; T3 source checks |
| AC5: persistence, totals and immutable history | T1 lifecycle tests; T3 replica-set and PMC regression evidence |
| AC6: responsive, accessible, compatible presentation | T2 default-consumer tests; T4 desktop/phone and keyboard QA |

Keep one parent task in progress. In Mode A, T1 and T2 can run in parallel only after T0 settles the contracts; their owned paths do not overlap. Each writer must understand preexisting changes and must not revert another writer's edits. Primary owns shared contracts, documentation, integration and any conditional backend change. Integrity review runs after writers stop, followed by final verification after fixes. In Mode B, perform the same work sequentially in the primary thread without implementation subagents.

The user approved both durable documents and selected Mode A before implementation. No approval gate remains for the scoped local implementation.

## Execution evidence

- Baseline captured before writers: `/private/tmp/lisno-auto-recommendations-d13dwzrs` (status, complete tracked diff and copies of dirty/untracked files). Preserve prior PDF/PMC and unrelated changes.
- T0 complete: resolver opt-in `includeProbable`, default required-only compatibility, shared-target precedence and version/room evidence tests. `npm test -- src/features/leads/roomRecommendations.test.ts --maxWorkers=1`: 24 passed.
- T1/T2 complete in separate owned state and presentation slices. Contracts: `recommendationMode`, `requiredBy` keyed by draft line key, `requiredRecommendationIssue`, `optionalContextByTarget` keyed by recommendation target identity.
- Read-only backend audit confirms existing staff save supports both must/can origins. No backend product edit was needed. Added persistence coverage for optional-to-required chains and frontend-pruned cyclic dependency exclusions; the existing same-room validation and save pipeline remain authoritative.

- T3 complete: integrity review confirmed one transient-request failure could unlock a verified required row. Fixed by retaining the last verified same-catalogue view for removal guards during loading/error only; automatic additions and saving still require fresh successful evidence. Reviewer confirmed the finding resolved. New failed-descendant-read regression passed.
- Backend planned command above: **155 tests passed across 3 files**, including both isolated replica-set suites and PMC split regressions. No backend product source changed for this task.
- Browser QA used a loopback Vite harness mounting the actual workspace/components with synthetic data and no real backend. At **1440×900** verified mixed automatic required selection, probable-only popup contents, Ignore without writes, explicit reopen/Add, automatic required descendants, editable quantities, save/reload preserving quantity 7 and origins, room isolation and parent-removal cleanup. At **390×844** inspected the actual rendered popup, confirmed horizontal bounds, Add/Ignore controls, Escape closing and focus restoration, Ignore leaving scope unchanged and explicit Save succeeding.
- Required-only desktop scenario: no popup, automatic additions preserve the focused quantity input, and pending recommendations disable Save. All-room race scenario: selecting a source in Bedroom then switching to Living keeps Save disabled until the response completes; saving afterward contains exactly the matching source/required target pair in each room with correct origins. No unexpected API requests or browser error/warning entries were observed. Pagination and incomplete measurements are covered by rendered component/workspace regressions.
- Test-fixture maintenance: existing lifecycle mocks now return verified empty-rule sources instead of an incomplete empty source response. Two stale editable-rate tests now exercise local quantity edits during refresh/save while asserting the configured price stays read-only; the captured baseline already enforced that price ownership.
- No dependencies, lockfiles, schema migrations, backend product paths, mobile source, published artifacts or permissions changed. No real mail, production mutation, commit, push or deployment was performed.

### Final integrated frontend regression command

Executed from `frontend/` after the integrity fix; **371 tests passed in 15 files**:

```sh
npm test -- src/features/leads/roomRecommendations.test.ts src/features/leads/estimatorRecommendationSelection.test.ts src/features/leads/configuredEstimate.test.ts src/features/leads/salesRecommendationScope.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx src/features/leads/LeadEstimateWorkspace.firstSubmit.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.rounding.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/ConfiguredEstimateBuilder.sellingPrice.test.tsx --maxWorkers=1
```

Together with the backend command above, final scoped regressions cover **526 tests**. Preliminary writer runs and the single-fix regression are overlapping checks and are not added to that total.

### Scope and limits of verification

- Full repository test suites, native/mobile builds, full backend build/typecheck and live email/publication were not run for this frontend change. Backend product code and transactional behavior were not modified; focused replica-set persistence coverage passed.
- Large-estimate performance was not benchmarked. Existing removal protection computes graph reachability for selected rows; functional tests cover shared roots, chains and cycles.
- Browser checks used synthetic data. Pagination and incomplete measurement validation were tested through rendered component/workspace regressions; no real customer files or data were accessed.
- No lint command exists in this repository.

### Final handoff

- `npm run typecheck` from `frontend/`: passed (exit 0).
- `npm run build` from `frontend/`: passed (exit 0), 3,385 modules transformed; standard ignored output retained at `frontend/dist/`. Vite reports chunks above 500 kB, largest application JS chunk 3,491.65 kB before gzip; no build errors. No bundle redesign was in scope.
- `git diff --check`: passed. `git status --short`: inspected; initial unrelated dirty changes remain preserved. Task-only comparison against the initial snapshot identified 21 scoped source/test/document files.
- All T0–T4 tasks and AC1–AC6 are satisfied for the approved web estimator scope. Shared client defaults remain covered by their regression suite. Added scope reaches the existing quotation/PDF pipeline through normal explicit Save/Submit.
- Synthetic browser and loopback server closed. The temporary `/private/tmp/lisno-auto-recommendations-d13dwzrs` baseline, harness, test logs and screenshots were removed after evidence was recorded. Existing unrelated ignored outputs were preserved.

## Follow-up correction: reoffer probable items after selection changes

Status: Follow-up correction complete; scoped integrity review and final verification passed.

- Evidence: a closed popup is stored once per room, while the ignored-item context contains source/rule versions but no new user selection context. Consequently, later Main Line selections/deselections leave the popup closed.
- Root owns the bounded workspace fix: advance a local per-room choice context on accepted manual inclusion/exclusion, picker additions and confirmed group removals; clear that room's closed marker, keep an already open popup open, and use the context for Ignore identities. Existing popup Add completion handles its newly selected item's descendants. No reset on refetch, quantity/tier edit, save, room navigation or automatic required additions.
- Independent test owner updates only `LeadEstimateRecommendations.test.tsx`: repeat select/deselect, new sources, last-source empty behavior, remaining-source suggestions, room isolation, and routine refresh preserving dismissal. Existing client defaults remain unchanged.
- Verify focused workspace/adapter/shared-client tests, typecheck/build, then scoped integrity review and final hygiene. No backend, finance, PDF, dependency or migration changes.
- Baseline captured at `/private/tmp/lisno-probable-reopen-1ry2drc7` before changes; preserve all earlier work.

- Follow-up implementation changes only `LeadEstimateWorkspace.tsx` (23 added/3 removed lines) and its rendered recommendation tests (four new scenarios), plus these working documents. Required selection, pricing and persistence logic is unchanged.
- `npm test --prefix frontend -- src/features/leads/LeadEstimateRecommendations.test.tsx --maxWorkers=1 --reporter=json --outputFile=/private/tmp/lisno-probable-reopen-1ry2drc7/reopen-tests.json`: **27 passed**. Covered Close→new source, deselection with remaining sources, no empty last-source popup, Ignore→deselect/reselect, quantity/refetch stability, delayed automatic required additions and room isolation.
- Scoped integrity review found no confirmed defects. New source-selection contexts use the current verified recommendation view; removed sources cannot leave stale suggestions. Other rooms retain their dismissed state.
- No new visual layout or shared component code changed. Follow-up interaction/accessibility verification uses the rendered workspace tests; the prior desktop/phone visual results remain applicable to the unchanged layout. Backend suites were not rerun for this local popup-state correction.

### Follow-up final verification

From `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/EstimatorRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

- **109 tests passed in 4 files**, including the 27 workspace tests; typecheck and build passed. This focused follow-up count overlaps earlier runs and is not added to the prior 526-test total.
- Standard ignored build output remains `frontend/dist/`. Vite's large-chunk warning remains (largest application JS chunk 3,492.19 kB before gzip); no build errors.
- `git diff --check` passed; `git status --short` inspected. Prior dirty work is preserved. No commits, pushes, deployment, dependencies, migrations or external data changes.
- Temporary follow-up baseline/test output at `/private/tmp/lisno-probable-reopen-1ry2drc7` was removed after recording these results. Broader/backend suites and browser QA were not repeated for this local state correction; rendered interaction/accessibility tests cover the changed behavior.
