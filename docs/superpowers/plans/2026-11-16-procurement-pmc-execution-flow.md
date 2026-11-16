# Estimator PMC handoff and Procurement execution choice: task plan

Date: 2026-11-16
Status: Implemented and integrity-reviewed in Mode A; targeted checks, typechecks and builds passed; baseline suite failures recorded below

Source of truth: [Approved specification](../specs/2026-11-16-procurement-mode-label-cleanup-design.md). The user approved the clarified workflow on 2026-11-16. Execution mode A was selected; implementation follows the approved requirements.

## Outcome and boundaries

PMC on identifies vendor handoff. PMC off uses the selected tier's Sub-vendor estimate price, while Procurement separately chooses and saves Sub-vendor or In-house before bidding. Remove Standard/Special from these user-facing flows. Keep the current styling, approved amounts, source identity, permissions and immutable commercial history.

Use the existing mode-decision service and basket enquiry flow. No new pricing formulas, component-level tenders, split baskets, dependencies, shared Configuration writes, data migration, service restart or deployment. Execution remains per approved source line; enquiries retain their existing full-basket boundary.

## Settled integration contract

### Source intent and allowed modes

Introduce one backend policy helper, in `backend/src/domain/procurement-execution-policy.ts`, consumed by preparation, mode preview/save and projections. Carry the approved source's explicit pricing mode into `PurchaseOrderModeSourceLine`; do not reconstruct it from basket classification.

| Approved source | Policy intent | Allowed new Procurement decision | Initial presentation |
| --- | --- | --- | --- |
| Explicit PMC | `pmc` | `pmc` | PMC vendor handoff |
| Explicit Sub-vendor | `execution` | `sub_vendor`, `in_house` | Execution selection pending until a decision is saved |
| Historic explicit In-house | `execution` | `sub_vendor`, `in_house` | Preserve the historical approved basis and any valid saved Procurement decision |
| Missing/invalid explicit pricing mode | `unrecorded` | No fabricated choice | Historical source needs review |

Legacy classification remains readable for compatibility but cannot override a valid explicit pricing mode or create a new execution decision. An old saved decision that conflicts with explicit PMC intent remains inspectable with a review/conflict state; do not silently replace it.

Add read-only `executionPolicy?: { intent: "pmc" | "execution" | "unrecorded"; allowedModes: PurchaseOrderModeKey[] }` to `PurchaseOrderModeResolution`, aligned in frontend types and OpenAPI where those responses are documented. Current preparation always supplies it; it is optional only for stored historical snapshots and backwards-compatible types. Missing current policy must not enable writes or be interpreted as Sub-vendor. Recompute policy on the server for every preview/save; never accept it as client authority. Intersect allowed modes with current Configuration availability without discarding the reason an allowed mode is unavailable.

The PMC editor shows a fixed PMC path and reuses existing preview/save confirmation if required for its calculation. The execution editor shows Sub-vendor/In-house directly, initially unselected. Existing `mode.state`, `mode.decision`, `mode.preview`, issue and revision fields remain authoritative for saved/readiness state.

### In-house calculation basis

Current code already provides `readInHouseUsagePolicy`, `inHousePresetComponentIds` and component identity validation. Reuse these instead of selecting every component implicitly or adding a new component-picking UI.

- For a new Procurement In-house decision on a PMC-off line, use the current approved-tier Configuration's valid Execution preset IDs. Invalid/empty presets, estimator-only use, missing references or incomplete rates produce an explicit unavailable state.
- Preserve an existing approved or saved explicit In-house component selection when it is valid for that source. Never replace historical customer scope with a different preset.
- Add optional server-owned `selectedInHouseComponentIds?: string[]` to the mode-decision record and internal DTO. Save the canonical validated IDs with the existing decision transaction; do not accept arbitrary IDs from the browser. Legacy scalar In-house calculations retain their established path and need no synthetic component IDs.
- Preview/save use the same resolved basis. A changed preset/reference/revision must trigger the established stale-source/review behavior before confirmation; it must not silently enlarge a previously saved component selection. Reads do not backfill records.
- Keep component IDs/details out of public projected responses when current disclosure policy hides them. Update the existing visibility projection for the additive decision field as well as preview scopes. Persisted/audited calculation evidence remains complete internally.

### Costs, grouping and bidding

- Resolve each current line's cost from its policy-compatible saved decision and exact tier/current Configuration. For execution without a saved choice, expose Pending/Incomplete and block bid dispatch. Never turn a default estimate price into a saved cost decision.
- Reuse existing base/current-cost fields and mode previews. Remove classification-driven selection of automatic Sub-vendor totals from current explicit-policy paths. Retain legacy DTO fields only where compatibility requires them; they must not bypass the new readiness checks.
- Add `execution_pending` to the overview group key union. Canonical group order: `in_house`, `sub_vendor`, `pmc`, then nonempty `execution_pending`, then nonempty `unrecorded`. Update frontend validation rather than weakening reconciliation. Saved execution decisions determine Sub-vendor/In-house grouping; PMC remains the approved PMC path. An unavailable saved decision remains in its recorded group with incomplete cost and a reason.
- Count each source once across groups. Reconcile group/detail/portfolio preparation costs and commitments using the same effective cost source, including mixed baskets and two unequal projects. Attribute visible In-house components from the saved Procurement basis even when the estimate used Sub-vendor pricing.
- Preserve project-only Sub-vendor overrides by loading and applying the exact source-line override in preview, save and current preparation. Overrides never apply to PMC/In-house. Keep their existing actor permission, version, source, award and issue protections; use execution eligibility instead of the retired Standard-only eligibility.
- Include decision version/mode, effective component basis, current revision and applicable project-rate basis in freshness checks. Refreshing a mode or override invalidates stale preparation/BOQ; it does not edit sent BOQs, vendor quotes, awards or issued orders.
- Validate every line before dispatch and issue. Keep full-basket scope and reservation checks. Share the existing project/source write fence with mode/rate changes where necessary to prevent races with dispatch, award and issue. No external delivery is performed during implementation or tests.

### UI and query behavior

Use “PMC”, “Execution selection pending”, “Choose Sub-vendor or In-house” and the saved execution source. Remove captions claiming the estimator chose execution, and remove Standard/Special suffixes. Keep estimate amounts distinct from current costs and genuine missing-price/configuration errors visible.

Keep current components, classes, responsive layout and accessible controls. New explicit estimator PMC-off transitions resolve to Sub-vendor rather than restoring a remembered In-house mode; do not change saved historical displays without an edit.

After a mode save, invalidate/update the affected basket list/detail, purchase-order preparation, enquiries, comparison, award/readiness and invitation-preview queries using existing key factories and project/basket scope. Pause actions while relevant state is stale or refreshing. Do not globally invalidate unrelated projects.

## Dependency-ordered tasks and ownership

No product implementation starts before task-plan approval and execution-mode selection. Keep one parent task in progress; child tasks below are owned slices of that task.

### 1. Refresh baseline and establish shared contract — primary

Dependencies: approved plan and selected execution mode. Covers AC1–AC6.

- Recapture HEAD, dirty paths, relevant diffs and hashes before writers start. Existing snapshots are under `/tmp/lisno-procurement-pmc-execution-flow-qa`.
- Preserve the completed estimator/recommendation work. `ConfiguredEstimateBuilder.tsx` and its test, `backend/src/openapi.ts` and `backend/tests/api-docs.test.ts` already have changes from that work. Inspect and record them before assigning or editing these files.
- Primary owns shared backend domain types/helper, frontend `procurementBasketApi.ts` and `purchaseOrderApi.ts`, OpenAPI and its focused schema assertions. Introduce the agreed additive contract and fixtures needed by writers; do not duplicate source-policy logic in frontend code.
- Inspect exact snapshot/digest consumers and receipt projection before adding the component field. Announce the frozen contract and assigned files to writers. Technical adjustments preserving this approved behavior can be recorded here without reopening gates; material scope changes require the affected document's approval.

### 2. Backend execution decisions and calculation source — backend owner

Depends on task 1. Covers AC1–AC4, AC6.

Owned product paths:

- `backend/src/services/project-purchase-order-mode.service.ts`
- `backend/src/models/ProjectPurchaseOrderModeDecision.ts`
- `backend/src/services/project-purchase-order-preparation.service.ts`
- `backend/src/services/procurement.service.ts` only approved-source transport needed by the settled contract
- `backend/src/domain/procurement-in-house-visibility.ts` only projection of the new internal decision basis
- Focused mode/preparation replica-set and route tests owned explicitly before work starts.

Enforce allowed mode on preview/save, preserve CAS/audit/idempotency and resolve/store the In-house basis. Ensure overrides are present in the same calculation context for preview/save/read. Do not edit primary-owned domain contracts or task 3's projection/tender paths; report required changes to primary. Tests cover explicit PMC conflicts, unselected execution, both valid choices, all tiers, component disclosure, current Configuration refresh, retries/conflicts and exact source isolation.

### 3. Backend projections, overrides and tender readiness — backend integration owner

Depends on task 2's resolved decision contract. Covers AC3–AC6. Sequential with task 2 to avoid overlapping changes to pricing resolution and transaction guards.

Owned product paths:

- `backend/src/domain/procurement-basket-mode-groups.ts`
- `backend/src/domain/procurement-basket-projection.ts`
- `backend/src/domain/procurement-in-house-components.ts`
- `backend/src/services/procurement-basket.service.ts`
- `backend/src/services/procurement-basket-base-rate.service.ts`
- `backend/src/services/procurement-basket-tender-support.service.ts`
- `backend/src/services/procurement-basket-enquiry.service.ts`
- `backend/src/services/procurement-basket-award.service.ts` and `project-purchase-order-basket-issue.service.ts` only necessary freshness/readiness integration
- Associated domain/group/base-rate/tender tests, with no overlap with task 2 tests.

Use saved choices for cost projection, pending groups, component attribution and BOQ readiness. Preserve project-rate behavior and immutable commercial snapshots. Mode-save transaction guard changes discovered here return to the task 2 owner sequentially after that owner is idle. Verify unequal-project reconciliation, same-basket mixed paths, new In-house on an estimate priced as Sub-vendor, stale BOQs and mode/award/dispatch races. Do not relax source or digest checks to make a test pass.

### 4. Procurement UI and estimator toggle — frontend owner

Depends on task 1's frozen API contract. Can run with task 2 and continue alongside task 3. Covers AC1–AC6.

Owned product paths:

- `frontend/src/features/procurement/ProcurementBasketModeEditor.tsx`
- `ProcurementBasketScopePanel.tsx`, `ProcurementBasketModeGroups.tsx`, `ProcurementBasketEnquiry.tsx`
- `ProcurementBasketWorkspace.tsx` / `ProcurementBasketDetailView.tsx` only necessary loading/query propagation
- `ProcurementBasketBaseRateEditor.tsx` only eligibility/cache changes required by the settled flow
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its focused test after primary reviews the existing diff
- Relevant Procurement editor/workspace/groups/API and estimator tests; synthetic Procurement fixtures assigned explicitly if needed.

Do not edit primary-owned API types or backend files. Render direct execution choices with no initial selection, fixed PMC path, exact pending/saved labels and backend availability reasons. Retain Save/Preview interaction and prevent stale responses from replacing a newer draft. Apply scoped query invalidation. Preserve source-owned values, approved totals, permissions and styles. Cover reload, mode changes, unavailable settings, stale/frozen states, keyboard actions and tender eligibility.

### 5. Integration and integrity review — primary, then reviewer

Depends on all writers finishing. Covers AC1–AC6.

- Reconcile contract usage, old automatic-mode branches, In-house basis/projections, override scope, query refresh and estimator behavior. Inspect complete diff against the captured baseline.
- In Mode A run a read-only `integrity_reviewer` after writers stop. Audit permissions, source lineage, money reconciliation, component disclosure, immutable artifacts, CAS/idempotency and transaction races. Resolve confirmed findings within owned boundaries before final verification.
- In Mode B perform the same review inline. Do not claim completion from per-agent tests alone.

### 6. Final verification and handoff — verification owner, primary

Depends on task 5. Covers AC1–AC6.

Run focused tests, then the full affected workspaces' required checks below. Primary owns synthetic browser QA, screenshots and final baseline reconciliation; the verification runner is read-only with respect to product sources. Record exact results, limitations, warnings and artifacts in this plan. No lint script exists.

## Safe parallelism

Mode A: primary settles contracts first. Backend task 2 and frontend task 4 can then run in parallel on non-overlapping paths. Task 3 follows backend task 2 and can continue alongside task 4. Use an independent read-only audit when it resolves a concrete uncertainty without duplicating another agent's work. Review follows all writes; final verification follows review. Tell every writer it is sharing the worktree and must preserve others' edits.

Mode B: primary performs the same tasks sequentially without implementation subagents. Keep shared files with primary in either mode. No agents are spawned before execution-mode selection.

## Verification matrix

| Acceptance | Required evidence |
| --- | --- |
| AC1 | PMC on/off across all tiers; explicit off returns to Sub-vendor; historical approved amounts and prior tier/recommendation regressions preserved |
| AC2 | PMC-only policy in UI/API; incompatible requests rejected; existing activation/approval/release checks remain effective |
| AC3 | No fabricated initial execution choice; preview/save/reload for both sources; current configured rates and validated component basis; duplicate/save race checks |
| AC4 | Bid dispatch blocked without saved choice; both sources reach valid BOQ; stale-mode/override changes require fresh BOQ; mixed-line and award/issue race tests |
| AC5 | Pending versus missing-source states; accurate saved-source grouping; no Standard/Special captions; accessible desktop/mobile rendering |
| AC6 | Two unequal projects, same Main Line with distinct source keys; money and commitment reconciliation; exact-source overrides; permission/disclosure matrix; immutable-history assertions |

Focused backend commands from `backend/` (split into smaller runs when diagnosing):

```sh
npm test -- tests/project-purchase-order-mode.test.ts tests/project-purchase-order-mode-routes.test.ts tests/procurement-basket-mode-groups.test.ts tests/procurement-basket-domain.test.ts tests/procurement-in-house-components.test.ts
npm test -- tests/project-purchase-order-mode.replica-set.test.ts tests/project-purchase-order-preparation-mode.replica-set.test.ts tests/procurement-basket-mode-groups.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts tests/procurement-basket-base-rate-routes.test.ts
```

Run the API-docs tests matching the changed schemas, plus any existing base-rate, approval/issue or disclosure regression cases identified by the final dependency trace. Use isolated Mongo replica-set fixtures; no application services or live records.

Focused frontend commands from `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementBasketModeEditor.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/procurementBasketApi.test.ts src/features/procurement/ProcurementBasketComparison.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx
```

Because the change touches shared pricing and tender contracts, complete the full backend and frontend lanes after focused checks:

```sh
npm run typecheck
npm test
npm run build
```

Run the above sequentially within each workspace; the two workspaces may run independently. Investigate failures against baseline, fix task-caused regressions and document unrelated failures without weakening assertions.

Rendered checks use synthetic local data at desktop and mobile widths: first-use pending selection, choose/preview/save/reload each execution source, fixed PMC path, incomplete Configuration, blocked dispatch, stale refresh and preserved approved amounts. Check keyboard navigation, accessible names, overflow and console/network errors. Real vendor invitations, awards and issue actions are never triggered against live data.

Finish with `git diff --check`, `git status --short` and baseline/hash reconciliation. Store ignored test/build output and synthetic diagnostics under `/tmp/lisno-procurement-pmc-execution-flow-qa` or the established ignored build directories. Report any unrun checks. Do not start or restart backend/OCR services; no seed, migration, backfill, commit, push, deployment or live-data mutation is part of this task.

## Completion criterion

The implementation is complete only when estimator PMC intent and Procurement execution choice remain separate through costs, overview/detail, saved decisions and bidding; all applicable approval/price/source guards hold; and integrated verification is recorded with any limits explicitly stated.

## Execution evidence (2026-11-17, integration in progress)

- Shared OpenAPI additions use the existing modular `src/openapi/project-purchase-order-requests.ts` and `src/openapi/procurement-basket-tender.ts`; prior changes in the primary `openapi.ts` remain intact.
- Task 2 completed before task 3 modified downstream pricing/tender consumers. Main mode replica tests were then explicitly handed to task 3 for retired automatic-Standard assumptions. The task 2 owner later completed only the frontend Workspace test adaptation; the frontend owner completed three non-overlapping backend domain test files. Primary owns group replica/base-rate-route checks and browser QA.
- Initial hashes, original dirty diffs and copies of backend/frontend source/tests are retained in `/tmp/lisno-procurement-pmc-execution-flow-qa` for preservation checks.
- Initial focused checks passed: policy/domain 25 tests; OpenAPI schema 1 selected test; new mode-policy replica 6 tests; preparation/routes 16 tests; frontend editor/groups/API/comparison/builder 132 tests; Workspace 49 tests. Backend and frontend typechecks passed during writer checks. Final integrated lanes remain pending.
- Synthetic real-browser interaction passed at 1440px and 390px: no execution choice preselected, both choices preview/save/reload, PMC fixed, approved 120000 paise retained, current cost 24000 paise after In-house selection, no unexpected commercial writes, no document overflow, zero axe violations and zero page errors. Existing table scrolling and visual styling remain intact. Browser fixture required a missing `mainLines` field correction before the successful run; no product workaround was introduced. One axe asset-preload warning did not affect its result.
- After browser validation, primary aligned frontend cost/action guards with backend saved-decision mode/quantity matching. Five new Workspace regressions verify missing or mismatching decisions cannot display usable line costs or send invitations. Final browser rerun will cover the integrated guard.
- No backend/OCR service restart, live data writes, external vendor communications, migration, dependency or lockfile change.

### Integrity review follow-up

The read-only review identified two concrete issues, both included in integration verification:

1. Award/issued mode locks used an enquiry field that only exists on its BOQ revision and did not recognize final-source reconciliation. A shared read-only execution-lock helper now joins the persisted current BOQ and exact-source or exact reconciliation proof. New tests use schema-valid records and actual transaction fences; unrelated older issued sources remain independent.
2. Stale sent/reconciled BOQ controls could offer invitations that the server refused. Reconciliation now exposes its saved preparation digest. The UI blocks stale invitation/resend/counteroffer actions while preserving historical bids and an explicit new-BOQ revision path; the backend invitation preview uses the same action freshness gate.

Writer checks after these changes: main mode replica 50 tests passed; tender replica 59 tests passed; grouping replica/base-rate routes 6 tests passed. Final reviewer recheck, lock-specific tests and full integrated workspace checks are pending.

A late read-only port check found an existing listener on port 3000. No agent started, stopped or restarted that service; synthetic browser QA and isolated database tests do not use or mutate its live data. Do not describe the pre-existing process as stopped in the handoff.

### Review fixes verified

- Integrity reviewer re-read both fixes and the reconciled UI locks: no remaining confirmed findings.
- Schema-valid lock replica tests: 13/13 passed, including rejection with transactional rollback and nine independent/stale-proof cases that successfully save.
- Frontend Workspace tests: 53/53 passed, including stale/reconciled actions, explicit BOQ revision, source-line locks for both award-pending and issued work, and continued editing of an unrelated line.
- Final synthetic browser pass repeated after all product changes: passed with the same approved amounts, two saved choices, zero page errors/axe violations/document overflow. The temporary browser session is closed.
- Initial dirty-work preservation: 15 prior paths are byte-for-byte unchanged. Only the preapproved Builder and its test, API-doc assertions, and this task's two working documents extended prior dirty files. No initial paths were removed (`preservation-report.json`).
- Final backend and frontend typechecks passed. Full suites (all tests, four workers per workspace to limit local database resource contention) and production builds are running; final outcomes will be recorded below.

### Full-suite regression triage

The full frontend run executed 7,273 tests: 7,168 passed and 105 failed (443 files passed, 13 failed). Four failures were outdated expectations for the newly approved behavior: three in `LeadEstimateWorkspace.test.tsx` and one mixed-mode fixture assertion in `enterpriseTransport.test.tsx`. Test-only follow-ups preserve historical In-house data until explicit edits and check policy-compatible saved modes. The full Lead workspace file now passes 63/63; the corrected transport case passes, and its whole file passes 63 with the eight pre-existing failures retained.

All 101 remaining frontend failure titles reproduce exactly in the initial snapshot, in 12 files (baseline comparison: 450 passed, 101 failed). The snapshot used 4,467 SHA-verified original paths; private local environment files were excluded. Evidence is `baseline-frontend-comparison.json` and `baseline-frontend-tests.log` under the QA directory. Frontend typecheck and production build pass; the build reports the existing large-chunk warning.

Further task-related backend fixture updates made configured PMC intent explicit and saved Procurement execution before requesting/issuing orders or dispatching recommendations. These preserve the existing finance, immutable-history, race and authorization assertions. Focused follow-ups pass: request 21/21, basket issue 33/33, Main Line suggestions 12/12. A valid vendor link remains visible when another line blocks the full-basket BOQ; it is correctly not bid-eligible until the whole basket is ready. No product changes were needed during full-suite triage.

## Final verification and handoff — 2026-11-17

All approved implementation tasks and review fixes are integrated. No product sources changed during final full-suite triage; only obsolete test fixtures/expectations were adapted to the approved explicit-choice contract.

| Final workspace command | Backend | Frontend |
| --- | --- | --- |
| `npm run typecheck` | Passed | Passed |
| `npm test -- --maxWorkers=4` | 7,824 passed, 108 failed, 24 skipped | 7,168 passed, 105 failed |
| `npm run build` | Passed | Passed |

Full-suite failure accounting is complete:

- Backend: 62 failure titles reproduced exactly against the SHA-verified initial snapshot. The 41 task-related obsolete fixture failures were fixed and their complete suites passed (basket issue 33/33, purchase requests 21/21, Main Line suggestions 12/12). Five load-sensitive full-run failures passed isolated current-code retries: assigned-project visibility 22/22 and vendor-suggestion routes 53/53.
- Frontend: all 101 pre-existing failure titles reproduced exactly against the initial snapshot. Four task-related obsolete expectations were fixed: Lead workspace 63/63 passed; the mixed-mode enterprise transport case passed, and the whole transport file retains only its eight reproduced baseline failures.
- Focused task checks passed: policy/domain 25, preparation/routes 16, projection/group/component domains 62, grouping replica/base-rate routes 6, main mode replica 50, tender replica 59, reconciled locks 13, and the one selected OpenAPI assertion. Frontend editor/groups/API/comparison/builder checks passed 132 and Procurement Workspace passed 53. Relevant full-suite follow-ups are listed above. Finance and immutable-source assertions remain intact.
- The final read-only integrity re-review found no remaining confirmed defects. The real-browser synthetic pass verified both saved choices and refresh, fixed PMC, unchanged approved amounts, 1440px/390px layouts, no document overflow, zero axe violations and zero page errors. UI stale-action, missing/current Configuration, permission and reconciled lock states are covered in rendered interaction tests.
- `git diff --check` passed; final status contains expected source/tests/docs and prior unrelated work only. No dependencies, lockfiles, CSS redesign, migrations, seed/backfill, commits, pushes, deployment, external delivery or live-data mutation were performed. No application services were started/restarted by this work. Actual live-project dispatch/award/issue was not exercised; its behavior was verified with isolated replica-set tests. OCR checks are inapplicable; no lint script exists.

The complete repository suites are **not green** because of the documented baseline failures. No remaining task-related failure is unaccounted for. Full suites were not repeated after the test-only fixture corrections; the affected complete suites and focused case were rerun instead.

Exact commands, exits, timings and failure-title comparisons: `/tmp/lisno-procurement-pmc-execution-flow-qa/final-verification-summary.json`. Other evidence: `baseline-frontend-comparison.json`, baseline/backend comparison logs, `browser-result.json`, desktop/mobile screenshots, and `preservation-report.json` in that directory. Build outputs remain ignored under `backend/dist` and `frontend/dist`; temporary browser session closed. Existing Mongoose deprecations, jsdom canvas/axe asset warnings and Vite large-chunk warnings remain unchanged.

## Post-handoff mapping correction — 2026-11-17

A live user screenshot showed both “Mode not recorded” and a Configuration digest mismatch. Read-only local diagnosis established two separate defects and a tier distinction:

- The running backend process predates implementation; its public `/openapi.json` has neither `ProcurementExecutionPolicy` nor the `execution_pending` group. The updated frontend interpreted absent execution metadata as an explicitly unrecorded approved choice. Missing metadata now says “Execution details unavailable”; genuinely unrecorded data retains its review requirement. No mode or tier is inferred from legacy classification.
- The selected item's active Configuration has empty sections stored without a `payload` key because Mongoose minimizes empty objects. Activation hashes `payloadFor(row)` (an empty object for absent payload), while Procurement hashed the raw absent field. These produce different digests despite unchanged data. Procurement now uses the same normalization as activation. Nonempty content is still hashed, and actual later modifications still fail integrity validation.
- The user-named Painting line has Signature settings in Configuration, but both its current saved estimate and approved quotation source record Functional with Sub-vendor pricing. Approved quotation version 6 remains unchanged. Selecting/viewing Signature in Configuration does not replace that approved tier.

This is a corrective continuation of the approved source-of-truth and UI requirements. Changes are limited to the mode resolver, ScopePanel/ModeEditor wording, and focused regressions. The initial dirty paths and target diffs for this follow-up are captured under `/tmp/lisno-procurement-mapping-diagnosis`.

Two regression cases reproduce the real Mongoose storage shape and failed before the backend fix. The complete mode replica suite passes 52/52, retaining tamper protections. ModeEditor/Workspace rendered tests pass 65/65, including missing-versus-unrecorded metadata and disabled editing. Frontend typecheck and scoped diff checks pass. The read-only integrity reviewer found no remaining issues in this delta. Bounded build/typecheck verification is recorded below when finished; the previously demonstrated full-suite baseline failures do not require repeating the entire repository suite for this correction.

No approved records, Configuration data, execution choices or running services were mutated. The old running backend must be restarted before it serves this correction. The earlier scope excluded service restarts; runtime activation remains separate from the code correction. Its existing supervisor also owns local OCR/chat services, so a restart should be authorized for that local service group, without touching the separate frontend process or reseeding accounts.

Corrective verification completed: backend typecheck/build, frontend typecheck/build, and final diff check all passed. Focused suites passed 117 tests total. Logs are under `/tmp/lisno-procurement-mapping-diagnosis/mapping-*-*.log`. Full suites were not repeated for this bounded correction; their verified baseline failures remain documented above. The running supervisor is `node ../scripts/local-chat.mjs --with-ocr`; it predates the fixes. Runtime restart is pending user authorization.
