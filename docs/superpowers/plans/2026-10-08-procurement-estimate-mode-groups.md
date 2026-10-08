# Procurement estimate-mode groups: task plan

Approved specification: [Procurement baskets grouped by approved estimate mode](../specs/2026-10-08-procurement-estimate-mode-groups-design.md).

## Authority and status

The user approved the specification and task plan on 2026-10-08 and selected Mode A. All five tasks are complete. Independent integrity review found no confirmed defects. Final verification passed 496 tests across 22 files, both workspace typechecks/builds and repository hygiene. Initial status and target diffs are captured under `/tmp/lisno-procurement-mode-groups-qa/`; the implementation targets started clean. Browser findings were corrected within the approved presentation scope. Completion is local; no deployment is implied.

The latest user constraint is authoritative: every Main Line can retain its independent type/mode selection under the same Main Basket; do not change existing functionality. This work only adds approved-estimate grouping, read-only display metadata and the overview presentation. Do not change item selection, calculation, saving, approvals, commercial mode decisions, project rates, vendor actions, BOQ scope or work orders.

The approved specification proposed **Ready for BOQ** as the default percentage label. No alternative has been requested, so use that count-based backend readiness indicator. It is not physical completion or an amount ratio. A later explicit answer to the earlier optional percentage question must be reconciled before dependent implementation.

The implementation baseline contained only the specification and task plan as untracked files. Product targets had no prior changes. Keep only one parent task in progress. Independent packages within that task may run concurrently after Mode A is selected.

## 1. Capture compatibility baselines and freeze the display contract

Owner: primary agent. Dependencies: task-plan approval and execution choice. Acceptance: AC1–AC4, AC6–AC8.

- Capture `git status --short` and target diffs to `/tmp/lisno-procurement-mode-groups-qa/`. Preserve unrelated changes and establish ownership before assigning a dirty path.
- Record the current project/basket overview and full mixed-basket detail using synthetic data. Reuse existing local enterprise fixtures; never use production client data for screenshots.
- Trace the complete approved snapshot → source lines → preparation → canonical basket → list/detail path once more, including invalid/missing historical fields and reference-only rows.
- Capture commercial preparation and basket/tender digest baselines before adding display metadata. The current preparation builder embeds the **entire source line** in `digestSourceLines` (`project-purchase-order-preparation.service.ts`), so extending that object will otherwise change existing hashes. Explicitly omit only the new display fields from digest input, retaining the old keys, order and values. Protect both current and legacy digest versions and pending/issued workflow compatibility with regression evidence.
- Freeze exact display DTO names and nullability before backend/frontend writers diverge. Recommended shape:
  - Per-line approved selection metadata and a display resolution: approved classification, approved pricing mode, resolved mode or null, provenance (`line`, `legacy_basket`, `unrecorded`), and missing/conflicting-source explanation.
  - Additive `modeGroups` on the existing basket-list response. Preserve the canonical `baskets` array and every existing commercial field.
  - Groups in order `in_house`, `sub_vendor`, `pmc`; conditional `unrecorded`. Each has disjoint basket subsets plus backend count, cost-completeness, commitment and BOQ-readiness aggregates.
  - Subsets retain the original basket ID/name, source-line keys, actionable line count, BOQ-ready count, approved estimate paise, nullable current cost paise, cost completeness and committed net paise. UI keys use basket ID plus mode, not a replacement persistent ID.
  - Readiness percentage comes from summed ready/included counts on the backend; zero denominator has no percentage. Filters classify readiness from these counts, not price values.
- Define invalid-display-metadata handling without assigning a fabricated mode or accidentally rewriting/blocking an unrelated commercial decision. Keep existing source integrity checks; any new diagnostic must remain read-only. If the spec cannot be satisfied without changing commercial behavior, return that specific conflict to the primary agent before editing that behavior.
- Reconcile reference-only lines explicitly: excluded/zero-value lines do not add actionable count, estimate cost or readiness denominator; retain their established detail visibility. Commitments remain allocated by their original source keys, including any reference-only row that already has a canonical commitment. Do not silently discard those amounts or count them again in another group.
- Share this frozen contract with writers. No schema/model/migration/dependency changes are planned.

## 2. Implement the bounded packages

### Frozen integration contract (2026-10-08)

- `estimateMode` on preparation/detail lines: `{ approvedClassification: 'standard' | 'special' | null; approvedPricingMode: 'pmc' | 'sub_vendor' | 'in_house' | null; mode: 'pmc' | 'sub_vendor' | 'in_house' | null; provenance: 'line' | 'legacy_basket' | 'unrecorded'; issues: Array<{code: string; message: string}> }`. Missing optional display metadata on older detail responses does not block existing commercial controls. Invalid/contradictory recorded values resolve null plus a diagnostic rather than adding a new commercial blocker.
- Additive list `modeGroups`: `{ mode: 'in_house' | 'sub_vendor' | 'pmc' | 'unrecorded'; basketCount: number; baskets: Array<{id: string; name: string; sourceLineItemKeys: string[]} & Metrics> } & Metrics`.
- Shared `Metrics`: `includedLineCount`, `boqReadyLineCount`, `readinessPercent` (number or null), `approvedEstimatePaise`, `currentCostPaise` (integer paise or null), `currentCostComplete`, `unpricedLineCount`, `committedNetPaise`, `modeIssueCount`. All counts/amounts/readiness come from the backend. For empty groups, cost is 0 and complete, counts/amounts are 0, readiness is null. For any missing actionable cost, cost is null/incomplete. For commitments-only subsets, cost is 0/complete, actionable count is 0, readiness is null.
- Partition all source keys. Omit a reference-only subset only when both actionable count and commitments are zero; canonical basket detail retains all existing rows/visibility. A reference-only commitment stays in its resolved mode without affecting actionable count or readiness. Normal groups always exist, while `unrecorded` is included only when it has subsets.
- Readiness uses the existing `procurementBasketLineBoqReady`, not `readyLineCount` (which has different revision-readiness semantics). Pricing reads canonical line cost output without replacing any formula or selected commercial mode.
- Preserve exported `preparedBaskets` and its existing callers. Internal service factoring may return the current commitment map with the baskets to build groups within the same transaction. No additional storage writes; existing approved-source locking behavior is preserved.
- Frontend `modeGroups` can be optional at the type boundary for old fixtures/deep-link compatibility, but the overview requires a valid grouped payload. Validate groups in the overview without throwing away canonical detail navigation. Never infer fallback groups from basket classification.
- Existing fixture routes are in `enterpriseRoutes.ts`; the frontend test owner may update that fixture file if needed alongside `enterpriseProcurementData.ts` and `enterpriseTransport.ts`. Product owner must not edit fixtures. Main basket photos/resolver remain unchanged.
- Backend owner: `procurement_mode_backend`; frontend product owner: `procurement_mode_frontend`; frontend rendered tests/fixtures owner: `procurement_mode_tests`. Primary owns this contract, integration, browser evidence and documentation.

Depends on task 1. In Mode A, packages 2A, 2B and 2C may proceed in parallel on the disjoint paths below. In Mode B, the primary agent performs them sequentially. Tell every writer they are not alone and must preserve others' changes. Bring shared-contract changes to the primary agent immediately.

### 2A. Approved source metadata and backend group projection

Owner in Mode A: `backend_implementer`. Acceptance: AC1–AC4, AC6–AC8.

Exclusive product paths:

- `backend/src/services/procurement.service.ts`, limited to the approved source read shape/parser.
- `backend/src/domain/project-purchase-order-preparation.ts` and `backend/src/services/project-purchase-order-preparation.service.ts`, limited to carrying metadata and preserving digest inputs.
- `backend/src/domain/procurement-basket-projection.ts`, additive display metadata only; keep its existing financial and eligibility behavior unchanged.
- A focused `backend/src/domain/procurement-basket-mode-groups.ts` if extraction keeps grouping independent of commercial projection.
- `backend/src/services/procurement-basket.service.ts`, additive grouped list output in the existing transaction and detail metadata.
- `backend/src/openapi/procurement-basket-tender.ts` and the preparation response schema only if the additive public DTO requires it.

Exclusive tests: `estimator-configured-procurement.test.ts`, `procurement-basket-domain.test.ts`, a focused `procurement-basket-mode-groups.test.ts`, `procurement-basket-routes.test.ts`, `project-purchase-order-preparation-mode.replica-set.test.ts`, and a focused `procurement-basket-mode-groups.replica-set.test.ts` if required for the real list-service boundary. Do not edit unrelated tests to suppress failures.

Work:

- Preserve and validate the approved per-line fields without reading newer editable estimate values. Implement the spec's Standard/Special/history/missing-data precedence.
- Keep raw approved selection and derived display resolution distinct. Do not replace `mainBasketClassification`, `automaticSubVendor`, `mode.decision` or project-rate eligibility with the display mode.
- Partition stable source-line identities, including room occurrences, before summing. A basket with Standard plus three Special modes produces three applicable groups, with Standard and Special Sub-vendor sharing the Sub-vendor group.
- Derive current cost from existing canonical per-line standard/saved-mode cost output and BOQ readiness from existing eligibility functions. Do not copy or modify pricing formulas. Aggregate integer paise with established range checks; return incomplete totals explicitly.
- Preserve current basket ID, approved-source tuple, direct-detail access, source freshness, transaction semantics and project authorization. Batch projection in the existing list read; no per-basket request/query loop, writes or mode-save side effects.
- Protect existing preparation/tender digests against added metadata. Keep commercially meaningful input changes effective and legacy-version behavior intact.
- Test asymmetric projects and same-named baskets, mixed modes within one basket/room and across rooms, explicit Standard, each Special mode, legacy Standard, absent/invalid/contradictory metadata, temporary items, unselected/zero-value rows, incomplete and valid-zero cost, commitments and overflow.
- Test that approved mode remains stable after an unapproved draft change or a different Procurement decision. Compare canonical financial/readiness output and hashes with and without display-only metadata.
- Exercise the actual service transaction with real approved snapshot lineage and mocked/no external delivery; do not rely solely on mocked preparation for end-to-end source propagation. Confirm the read adds no database writes, and unauthorized/project-mismatched reads remain denied.

### 2B. Grouped overview and read-only detail presentation

Owner in Mode A: `frontend_implementer`. Acceptance: AC1–AC6, AC8.

Exclusive paths:

- `frontend/src/features/procurement/procurementBasketApi.ts` for synchronized additive types and response checks.
- `ProcurementBasketWorkspace.tsx`, a focused mode-group/card component if useful, and narrowly scoped overview CSS in `procurementBasket.css` or a dedicated imported stylesheet.
- `ProcurementBasketScopePanel.tsx` and scope CSS only for the read-only estimate-mode labels/full-basket scope explanation.
- `ProcurementBasketDetailView.tsx` only if needed to pass read-only presentation metadata; preserve all existing mutation children and their basket props.

Work:

- Render server-projected groups with compact four/two/one-column photo cards. Reuse `mainBasketImages.ts` and the existing assets as-is; do not move/regenerate images or change Estimation's chooser.
- Unknown/failed thumbnails use the static neutral skeleton with reserved dimensions, empty alt text and usable controls.
- Add local trimmed/case-insensitive name search, mode/readiness filters with reset, and grid/list controls. Preserve stable server order; clearly distinguish filtered counts from full group totals. Empty project, empty mode and no results have separate messages.
- Make populated sections initially expanded and empty sections compact/collapsed. Preserve view/search/filter/disclosure state when entering and leaving a basket in the same workspace; reset with the existing project-key lifecycle.
- Maintain the current `basket` query parameter and real IDs. Every subset card opens the existing **whole basket**. Do not replace/filter the canonical basket or `basket.lines` before passing it to commercial components.
- Add concise approved-estimate-mode labels and an all-approved-lines explanation in a mixed basket detail. Preserve existing handlers, props that determine commercial behavior, permission checks, selection controls, prices, totals, enquiry actions and source-refresh freezes.
- Use precise labels: Approved estimate, Current cost, Ready for BOQ. Display incomplete costs and provenance issues explicitly; do not claim work completion or invent workflow statuses.
- Missing/malformed grouped data gets a refresh/error presentation; do not infer mode groups from old basket classification or current procurement decisions in the browser. Do not remove existing direct-detail recovery/access unless existing source checks require it.
- Preserve query identity/version checks and existing invalidation. Search/filter/collapse/view operations make no mutations or additional API reads.
- Use accessible headings, controls, names and focus states; grid/list/collapse controls reflect state. Keep long names/amounts readable and avoid global style changes, shadows, new icons/dependencies or decorative motion.

### 2C. Rendered regressions and synthetic browser fixtures

Owner in Mode A: a separate frontend test worker. Acceptance: AC1–AC8, emphasizing AC5/AC6.

Exclusive paths:

- `frontend/src/features/procurement/ProcurementBasketWorkspace.test.tsx`.
- A focused `ProcurementBasketModeGroups.test.tsx` and/or `procurementBasketApi.test.ts` if needed to isolate the new behavior.
- `frontend/src/test/fixtures/enterpriseProcurementData.ts`, plus the smallest necessary fixture transport change in `enterpriseTransport.ts` and its matching test. No application transport changes.

Work:

- Update synthetic response fixtures to the frozen additive contract while retaining all existing commercial regression scenarios. Do not loosen price, permission, selection or dispatch assertions to accommodate an implementation regression.
- Use a mixed basket with four source lines: Standard, Special Sub-vendor, Special In-house and Special PMC, plus a same-named basket with a different ID and an unequal second project. Include historical/unrecorded rows, temporary lines and explicit incomplete costs.
- Assert group membership, disjoint counts/values, full totals during filtering, missing-data messages and correct stable-ID navigation. Cover local search/no results/reset, mode/readiness filters, grid/list, collapse/expand and state retained on Back.
- Verify clicking any mode subset still exposes all basket items and sends the exact existing whole-basket BOQ payload. Group/search/filter interactions must produce zero writes; source query counts must not grow per card.
- Cover locked/read-only/denied, stale or mismatched source, refresh/retry, removed basket, absent group response, unknown/failed photo and keyboard/accessibility states.
- Add the new display metadata to existing fixture responses without teaching tests the production grouping implementation. Expected amounts/modes should be explicit enough to catch duplicated aggregation or wrong provenance.
- Tests can be prepared in parallel; final verification runs only after every writer freezes.

## 3. Integrate and conduct an independent integrity review

Owner: primary agent, then `integrity_reviewer` in Mode A; equivalent sequential primary review in Mode B. Depends on all of task 2. Acceptance: AC1–AC8.

- Inspect final source/API/OpenAPI/type consistency and every changed target. Confirm only approved files changed and all previous functionality is preserved.
- Trace a Standard and each Special line from immutable approved source to mode group and full-basket drill-down. Confirm that no user can infer selection or monetary values from a different project, room or version.
- Reconcile group/subset totals, incomplete values, reference-only commitments and zero denominators against canonical values. Confirm same-name baskets and mixed modes cannot duplicate money.
- Review unchanged current and legacy preparation/tender digests, mode decisions, project-rate editing, enquiry scope, authorization and mutation invalidation. Do not claim preservation based only on visually unchanged screens.
- Review the reference layout, responsive text wrapping, photo fallback, control semantics and failure states. Fix confirmed issues within file ownership boundaries and rerun affected checks.
- Resolve reviewer disagreements with evidence. Freeze product/test/fixture writes before final verification.

## 4. Verify the frozen integrated worktree

Owner: `verification_runner` for commands and primary agent for browser checks in Mode A; primary sequentially in Mode B. Depends on task 3 and any fixes. Acceptance: AC7/AC8 and all preceding criteria.

Start with the focused backend tests from `backend/`:

```sh
npm test -- tests/estimator-configured-procurement.test.ts tests/procurement-basket-domain.test.ts tests/procurement-basket-mode-groups.test.ts tests/procurement-basket-routes.test.ts tests/procurement-basket-base-rate-routes.test.ts tests/project-purchase-order-mode.test.ts tests/project-purchase-order-mode-routes.test.ts
```

Run transactional compatibility tests with the repository's real `MongoMemoryReplSet` helper, sequentially if shared test resources require it:

```sh
npm test -- tests/procurement-basket-mode-groups.replica-set.test.ts tests/project-purchase-order-preparation-mode.replica-set.test.ts tests/project-purchase-order-mode.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts
```

If the focused real list-service scenario is added to an existing replica-set file instead of a new file, substitute that exact path and record it. Do not run a nonexistent test filename or claim mocked unit tests satisfy transactional coverage. Never substitute a non-replica database, production URI, seed or migration. If a sandbox blocks the required test environment, request the scoped execution permission rather than weakening tests.

Verify backend public-contract/access inventory and compilation:

```sh
npm test -- tests/api-docs.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts
npm run typecheck
npm run build
```

From `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementBasketModeEditor.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProcurementBasketHistory.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/test/fixtures/enterpriseTransport.test.tsx
npm run typecheck
npm run build
```

Include `procurementBasketApi.test.ts` if introduced. The existing Estimation workspace suite protects reuse of its photo resolver; keep its selection behavior untouched. Run typecheck/build sequentially within each workspace. Independent frontend/backend focused commands may run concurrently only on the frozen worktree and without shared test resources. Broaden tests for actual failures or demonstrated shared impact, not merely to increase counts. There is no lint script.

Browser verification using synthetic data:

- Capture and inspect comparable 2048/1440 px desktop, 768 px intermediate and 390/320 px mobile screenshots. Check a short-height viewport and effective enlarged/reflow layout, recording native zoom/keyboard limitations.
- Inspect all populated modes, mixed baskets, long names, large/zero/incomplete amounts, unknown/failed images, no results, an empty group and missing historical mode.
- Exercise pointer and keyboard search/filter/reset/grid/list/disclosure/Back and full-basket drill-down. Confirm no horizontal page overflow, clipped labels, hidden focus or unintended parent scroll changes.
- Verify same-project preferences persist, project change resets presentation state, refetch updates genuine costs, and the source-mismatch/denied paths retain their current protections.
- Assert zero mutations from display interactions. For regression checks of existing commercial actions, use local fixture interception only; no real vendor invitations, approvals or issuance.
- Run a focused automated accessibility scan and inspect console/request failures from a fresh final load. Report incomplete audit checks accurately.

Repository hygiene from root:

```sh
git diff --check
git status --short
```

## 5. Record evidence and hand off

Owner: primary agent. Depends on task 4. Acceptance: AC8.

- Record actual commands, exact file/test counts, exit statuses, browser widths/states, reconciliation examples, digest-preservation results, warnings and unrun checks in this plan.
- Record the final touched-file inventory and any remaining compatibility limitations. No production effect, migration, dependency or external action is planned.
- Stop only preview/browser sessions created for this task; move task-generated screenshots/logs to `/tmp/lisno-procurement-mode-groups-qa/`. Preserve unrelated runtime outputs. Do not stage, commit, push or deploy.
- Update durable completion status only after all required checks and reviews finish. Final handoff should distinguish grouping/presentation changes from the verified unchanged item selection and procurement workflow.

## Ownership and execution rules

Primary owns product interpretation, this plan, contract reconciliation, integration and browser evidence. Backend and frontend product writers may not edit each other's paths. The frontend test owner may not edit product files; product writers must request fixture/test corrections through that owner. Use at most the available concurrency slots and reuse agents where appropriate. In Mode A, review and final command verification follow finished writers sequentially; do not use transient test results as final evidence. In Mode B, keep all implementation/review/verification inline.

No agent is spawned before the execution-choice gate. A material discovery that requires changing the approved functionality-preservation boundary stops only that dependent work for explicit scope reconciliation; routine implementation decisions and fixes proceed within the approved contract.


## Integrated evidence (2026-10-08)

### Source and workflow preservation

The approved estimate's per-line classification and mode are separate display metadata. The real-source replica tests exercise a basket containing Standard, Special Sub-vendor, Special In-house and Special PMC lines, unapproved draft edits, independently saved Procurement decisions, unequal projects, denied actors and reference-only commitments. List reads perform zero database writes. Missing or invalid historical selections are explicit rather than guessed.

Exact pre-change digests remain asserted: current preparation `1bdfa14baf69dffa4ac03bc7818bafa9456cbe470f6f482260379cbb83b666ce`, legacy preparation `bc06618b743bf4fe3c177c953c2c5e122fdfce5ef2891b14eb81cf543f7247ff`, and all five basket baselines. Display metadata is the only new data omitted from those existing hash inputs. Existing prices, decisions, project overrides and vendor payloads retain their original meanings.

The frontend regression opens the same four-line basket through every displayed mode, and asserts the exact original enquiry creation and dispatch payload including all four source keys. Search, filters, disclosure and grid/list controls produce zero writes or per-card source reads. The shared basket ID and whole-basket detail remain authoritative.

Independent integrity review found no confirmed defects. Follow-up reviews accepted the scoped CSS corrections, additive empty-list fixture correction, TypeScript query-option corrections and the bounded old replica-fixture correction described below.

### Final browser evidence

Synthetic fixture only: `/qa/enterprise.html?role=procurement&state=populated&route=%2Fprocurement%2Fprojects%2Fproject-one%3FqaProcurementGroups%3Dready`. Its 19 canonical baskets render 6 In-house, 6 Sub-vendor, 8 PMC and 1 unrecorded subset card. The mixed basket appears in three modes with disjoint amounts; a second same-named basket uses a distinct ID and has incomplete cost.

- Inspected screenshots at 2048, 1440, 768, 390 and 320 px. The grid renders 4/4/2/1/1 columns with no page overflow. Ordinary cards are approximately 132–139 px tall. The 1440 × 680 short viewport also passed.
- Temporary browser-only fixture interception multiplied monetary display values by 1,000 to exercise lakh amounts. Cards retained four columns, unbroken currency and no overflow; the first row grew to approximately 146 px at 1440 px. Mobile remained compact. The interception was removed and a normal fresh load verified afterwards; no repository fixture or application values were changed for this check.
- Trimmed mixed-case search returned four POP cards. A PMC filter returned one card while preserving full PMC totals. Search, filter and list selection survived full-basket navigation and Back. Keyboard Enter toggled disclosures; Tab showed a visible focus outline; Clear search returned focus to the search input.
- Needs-attention filtering returned the incomplete-cost and missing-mode cards. No-results/reset, long names, unknown-photo skeleton and simulated failed-photo skeleton worked. The mixed basket detail displayed all four approved lines and its whole-basket explanation.
- A browser-only empty-basket response displayed three initially collapsed groups, no percentage bars, and a distinct empty-project message. Expanding PMC displayed `No items in this mode.` Zero amounts were rendered explicitly. Existing unavailable-project, error/retry and access-denied screens were also inspected at mobile width.
- Fresh final loads had no render errors, unexpected requests, non-200 application requests or page overflow. Axe found no violations in the changed section. Mobile whole-page scans had zero violations. Desktop reported the existing sidebar Vendors contrast ratio (4.43:1), outside this change; the existing page header also remained an incomplete `aria-prohibited-attr` review item. Axe's stylesheet-preload warning comes from the synthetic transport intercepting its `/css2` XHR and is separate from application requests.
- New paragraph contrast failures were fixed with the local `--basket-muted: #526157` token. Narrow-card currency splitting was fixed using wrapping monetary entries with unbroken amounts. Global shell styles were not changed.

Browser evidence is under `/tmp/lisno-procurement-mode-groups-qa/browser/`, including `procurement-groups-final-2048.png`, `procurement-groups-final-1440.png`, `procurement-groups-final-320.png`, `procurement-groups-large-final-1440.png` and `procurement-groups-full-detail.png`. The task's browser session and Vite server were stopped. All 27 task screenshots/logs were moved out of the worktree.

### Verification corrections and limits

The first broader frontend run exposed an older empty-basket fixture without the additive groups; its fixture now uses `qaEmptyModeGroups()` and every prior assertion is retained. Typecheck exposed seven unsupported Testing Library `exact` query options in new tests; these were removed while keeping string names and their exact-match behavior.

The broader replica run initially passed 99 tests and failed two existing tests in `project-purchase-order-mode.replica-set.test.ts`. An isolated exact `git archive HEAD backend` snapshot reproduced those same two failures (2 failed, 34 intentionally skipped). Both submitted the stale literal `POP false ceiling` while the approved and current Configuration name was `POP`. The candidate literals now explicitly match `POP`, with stronger name and quantity assertions; no application source validation was weakened. Baseline reproduction is preserved in `verification/backend-prechange-two-tests.log`.

Scoped tests were used instead of full repository suites. Native browser zoom, physical touch devices, screen-reader output and non-Chromium browsers were not exercised; 320 px reflow, keyboard interactions and automated accessibility checks provide the recorded coverage. No lint command exists. Existing frontend build chunk-size advisories and unrelated fixture shell-request warnings are recorded in the final command results.

No models, migrations, dependencies, lockfiles, shared photo assets or Estimation product files changed. No commit, push, deployment, seed, backfill, production mutation or external communication was performed.

### Changed paths

Backend product: `src/domain/procurement-basket-mode-groups.ts`, `procurement-basket-projection.ts`, `project-purchase-order-preparation.ts`; `src/services/procurement.service.ts`, `procurement-basket.service.ts`, `project-purchase-order-preparation.service.ts`; `src/openapi/procurement-basket-tender.ts`, `project-purchase-order-requests.ts`.

Backend tests: `estimator-configured-procurement.test.ts`, `procurement-basket-routes.test.ts`, `procurement-basket-mode-groups.test.ts`, `procurement-basket-mode-groups.replica-set.test.ts`, `project-purchase-order-preparation-mode.replica-set.test.ts`, `project-purchase-order-mode.replica-set.test.ts`. The primary agent took explicit ownership of the last file solely for the proven stale-fixture correction.

Frontend product: `src/features/procurement/ProcurementBasketWorkspace.tsx`, `ProcurementBasketModeGroups.tsx`, `procurementBasketModeGroups.css`, `procurementBasketApi.ts`, `ProcurementBasketScopePanel.tsx`, `procurementBasketScope.css`.

Frontend tests/fixtures: `ProcurementBasketWorkspace.test.tsx`, `ProcurementBasketModeGroups.test.tsx`, `procurementBasketApi.test.ts`, `ProcurementWorkspace.test.tsx`; `src/test/fixtures/enterpriseProcurementData.ts`, `enterpriseRoutes.ts`, `enterpriseTransport.test.tsx`. Ownership of the existing project-workspace test was explicitly extended to the frontend test owner for its additive fixture correction.

The two durable specification/plan files complete the 29 task paths. No unrelated changes were overwritten or staged.


### Final command results and acceptance closure

The commands listed in task 4 ran against the integrated state. The final frontend focused command additionally included `src/features/procurement/procurementBasketApi.test.ts`. Exact logs are under `/tmp/lisno-procurement-mode-groups-qa/verification/`.

| Check | Final result | Log |
| --- | --- | --- |
| Backend focused domain/source/routes command | Exit 0; 7 files, 65 tests passed | `backend-focused-escalated.log` |
| Backend four-file replica compatibility command | Exit 0; 4 files, 101 tests passed | `backend-replica-final.log` |
| Backend API docs, operation registry and authorization command | Exit 0; 3 files, 148 tests passed | `backend-contracts.log` |
| Backend `npm run typecheck` | Exit 0 | `backend-typecheck.log` |
| Backend `npm run build` | Exit 0 | `backend-build.log` |
| Frontend eight-file focused workflow command | Exit 0; 8 files, 182 tests passed | `frontend-focused-frozen.log` |
| Frontend `npm run typecheck` | Exit 0 | `frontend-typecheck-final.log` |
| Frontend `npm run build` | Exit 0 | `frontend-build.log` |
| Root `git diff --check` | Exit 0 | Final verifier and primary hygiene checks |
| Root `git status --short` | Exit 0; 29 task paths, no runtime artifacts | Final verifier and primary hygiene checks |

Total: **496 passing tests across 22 files**. Frontend/backend typecheck and build were run sequentially within each workspace. The last backend correction touched tests only; its `tsconfig` includes `src` only, so the preceding successful backend compilation remains applicable. The final replica rerun includes that correction.

The first backend focused run encountered sandbox `EPERM` binding its local test server; the identical scoped-escalation command passed. Existing non-failing frontend MSW warnings concern shell reads for `/api/v1/daily-critical-tasks` and `/api/v1/chat/availability`. Vite retains its chunk-size advisory: index 2,444.37 kB, ECharts 591.07 kB and ExcelJS 940.19 kB. No dependencies were added. Builds produced ignored `backend/dist`, `frontend/dist` and TypeScript build metadata; none are staged.

| Acceptance | Evidence |
| --- | --- |
| AC1: approved line mapping | Source/domain tests plus real approved-snapshot replica tests; mutable estimate and Procurement decisions cannot move groups |
| AC2: independent lines, mixed/same-name baskets | Disjoint source-key projection tests, unequal project service tests, browser mixed basket and exact full-basket dispatch assertion |
| AC3: historical/missing metadata | Legacy Standard, invalid/conflicting values, unrecorded group and guarded malformed-response tests |
| AC4: truthful counts and finance | Integer-paise reconciliation, overflow/zero/incomplete costs, reference commitments and exact digest baselines |
| AC5: compact accessible overview | 4/4/2/1/1 browser matrix, large-price correction, skeletons and functioning local controls; scoped axe clean |
| AC6: preserved functionality | Canonical whole-basket detail/payload regressions, unchanged commercial projection, source/digest comparison, rates/mode/tender integration |
| AC7: integrated correctness | Independent integrity review and the 314 backend / 182 frontend passing tests |
| AC8: verification and hygiene | Both builds/typechecks, responsive browser inspection, final diff/status and documented limitations above |

All scoped acceptance criteria are satisfied. Full repository suites, native zoom, other browsers and physical assistive devices remain unrun as stated above; existing shell accessibility and bundle-size findings remain outside scope. The next deployment, if desired, requires separate explicit authorization.
