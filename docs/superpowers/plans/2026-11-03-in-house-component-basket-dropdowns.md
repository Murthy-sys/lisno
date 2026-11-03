# In-house component basket dropdowns task plan

Date: 2026-11-03
Status: Implemented and verified within scope (Mode A); broader screen suite has confirmed pre-existing failures
Specification: [Approved design](../specs/2026-11-03-in-house-component-basket-dropdowns-design.md)
Approval record: The user approved the specification on 2026-11-03. The user subsequently approved this task plan and selected Mode A (parallel subagents).

## Outcome and boundaries

Allow Configuration users to select every non-archived Main Basket when adding an In-house component, then select only that basket's Sub-baskets. Preserve request/approval flows, component identity, saved values, Mode tiers, and proposal isolation.

The implementation is frontend-only. Existing backend contracts already support non-archived component parents and require active parents for new Sub-basket requests. Do not change APIs, database schemas, pricing calculations, request endpoints, approval policies, or proposal permissions. No new dependency or lockfile change is expected.

The initial implementation-source worktree was clean. At task-plan creation, the only existing dirty path was the specification above. Recheck status and per-target diffs before implementation; preserve any newly introduced unrelated work. At the task-plan gate, only this plan was created; subsequent edits followed both approvals and Mode A selection.

## Settled implementation contract

- Keep the existing fully paginated Main Basket catalog in `KnowledgeItemWorkspacePage` as the Configuration source of truth. Do not create a second fetch or filter baskets by Main Line/component membership.
- Pass an optional `basketCatalogState` from the workspace through `KnowledgeModePanel` to `KnowledgeInHouseComponents` and its Add dialog. Reuse the existing `KnowledgeBudgetCatalogState` structural type (`status`, `refreshing`, `errorMessage`, `refreshErrorMessage`, `onRetry`). Existing callers default to a ready supplied catalog; the Configuration workspace must provide its actual query state.
- Derive that state from `relationshipBasketsQuery` alone. An unrelated Main Line catalog failure must not disable basket selection or saving a valid component. Retry must refetch the Main Basket catalog independently.
- In live Configuration, including its tier adapters, allow `status !== "archived"`. Preserve the existing active-only eligibility for proposal consumers. Use the existing live-context marker (`scopeKey === "live-configuration"` or `supportsLiveConfigurationRequests === true`) without adding live fetches to scoped adapters.
- Show inactive status in option presentation without changing the saved basket name or ID. Request availability is separate: only an active, verified parent permits a new Sub-basket request.
- Keep the Sub-basket query keyed by data-source scope and selected basket ID. Enable lookup only for a usable selected parent. Render and validate children against the selected parent ID.
- Block new component saves while either required catalog is loading, refreshing, or in error, including failed refreshes with cached data. Retain pending values, explain the state, and allow retry. A parent no longer present/eligible must not silently become another selected basket.
- Retain the current basket as the initial selection when it is eligible; otherwise show an explicit unselected/unavailable state. Parent changes clear the child selection and request feedback. Empty parent selection does not show a loading Sub-basket message.
- Preserve save-candidate freezing and same-ID retries. Preserve active-parent missing Sub-basket requests, pending/rejected/fulfilled feedback, and approved-catalog refresh. For an inactive parent, present the unavailable request action with a brief explanation.

## Dependency-ordered tasks

Only one parent task may be in progress. The bounded implementation slices inside Task 2 may run concurrently only after Mode A is selected and Task 1 settles the contract.

### Task 1: Confirm baseline and prepare focused regressions

Status: Complete. Baseline component suite: 11 tests passed; source targets were clean. Owner: primary agent. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC1–AC6.

- Capture `git status --short` and diffs for every assigned file; resolve ownership of any new dirty targets before edits.
- Run the current component tests to establish the baseline. Confirm the current picker excludes an inactive Main Basket using a focused failing regression or a local fixture reproduction.
- Confirm the exact prop contract above and the test harness needed for delayed parent queries, failed refreshes, and Mode-tier calls. Use distinct basket IDs, child IDs, and names so cross-parent leakage cannot pass accidentally.
- Reuse the existing workspace query, complete-page loader, source adapters, and request panels. If evidence requires a material specification change, update the specification and follow the repository approval rule before expanding scope.

### Task 2: Implement the picker and workspace integration

Status: Complete. Component suite 24 passed, transfer suite 26 passed, workspace integration 4 passed, pending Mode 32 passed. Dependencies: Task 1. Acceptance: AC1–AC6.

**Slice 2A: Picker behavior and component regressions**

Owner in Mode A: one `frontend_implementer`; in Mode B: primary agent.

Exclusive write ownership:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeInHouseComponents.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeInHouseComponents.test.tsx`

Deliver the agreed optional catalog-state prop, Configuration eligibility, inactive labels, parent-scoped children, clearing behavior, and loading/empty/error/refresh/retry UI. Keep save validation synchronized with the displayed choices. Preserve request behavior and show the active-parent restriction. Do not change `KnowledgeSubBasketRequestPanel` or backend/request services.

Add focused rendered regressions for unrelated/inactive/archived/empty-parent baskets; exact save IDs; parent clearing and delayed prior-parent responses; mismatched child-parent records; initial failure and failed refresh recovery; request pending/rejected/fulfilled outcomes; inactive-parent request blocking; read-only access; and proposal-scoped eligibility and reads. Reuse existing duplicate/legacy/retry coverage instead of duplicating it.

**Slice 2B: Workspace state propagation and integration coverage**

Owner: primary agent. Exclusive write ownership:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx`, only if additional save-wiring coverage is needed

Derive and pass Main Basket query state independently of the relationship Main Line query. Add integration coverage showing that all Main Basket pages reach the actual Mode picker, that Sub-basket pages are complete, that retry restores the picker, and that failure of the unrelated Main Line catalog does not block valid component selection. Verify live tier adapters retain the same eligibility and request behavior.

No edits to shared pagination helpers or data-source contracts are expected. Existing pagination and tier-adapter tests remain regression checks. If a helper change becomes necessary, the primary agent owns that shared edit and informs the picker owner before it begins.

Parallel safety: slices 2A and 2B can run concurrently against the settled prop contract because their write sets do not overlap. All agents must preserve others' changes. Final tests run after both slices finish; intermediate shared-worktree failures are not final results. In Mode B, perform both slices inline without subagents.

### Task 3: Integrate and review correctness

Status: Complete; independent review found no confirmed defects. Owner: primary agent; `integrity_reviewer` supplies a read-only review in Mode A. Dependencies: both Task 2 slices complete. Acceptance: AC1–AC6.

- Inspect the integrated diff and reconcile prop defaults, actual query states, eligibility across tiers/proposals, stale selections, failed refreshes, and request availability.
- Verify no component or request is saved merely by selecting a basket or refreshing a catalog. Ensure pending/rejected requests cannot become options, and retries retain stable component/request identities.
- Confirm Main Basket request entry points and review flows remain intact, with no new in-dialog Main Basket request feature.
- Confirm there are no unrelated calculation, authorization, schema, shared catalog, or presentation changes. Resolve findings before final verification. In Mode B, perform this review inline.

### Task 4: Verify the integrated result and hand off

Status: Complete within scope; broader suite limitations recorded below. Owner: primary agent; `verification_runner` runs final checks in Mode A after review fixes finish. Dependencies: Task 3. Acceptance: AC1–AC7.

Run focused tests first, from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeInHouseComponents.test.tsx src/features/ai-estimator-knowledge/KnowledgeInHouseComponentsTransfer.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx
npm test -- src/features/ai-estimator-knowledge/knowledgeMasterPagination.test.ts src/features/ai-estimator-knowledge/knowledgeModeTierDataSource.test.ts src/features/vendor-basket-proposals/proposalDataSource.test.ts src/features/ai-estimator-knowledge/KnowledgeSubBasketRequestPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketRequestReview.test.tsx src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx
npm run typecheck
npm run build
```

These checks cover the changed shared Mode integration, catalog pagination, proposal scoping, component preservation, both request types, and request review. Broaden to the full frontend suite only if the final diff or failures reveal additional affected consumers. Backend/OCR suites and replica-set tests are not required unless the implementation unexpectedly changes those systems; such scope must be reconciled before proceeding. There is no lint script.

Rendered QA: use the local application and existing fixture facilities with synthetic data, not real client records. Check at 1440px desktop and 390px mobile widths. Exercise the actual Mode > In-house > Add component path, all Main Basket states, dependent selection, long names, empty/error/retry states, and the request panel. Verify labels, keyboard operation, focus return, viewport fit, console errors, and failed/unexpected network requests. Use a local fixture or temporary browser interception for mutations so QA does not send real requests or alter production. Report any unavailable runtime check explicitly.

From the repository root, run `git diff --check` and inspect `git status --short` plus the final diff. Store temporary browser output under an ignored output directory or `/private/tmp`, record paths in the handoff, and remove disposable artifacts where practical. Do not stage, commit, push, seed, migrate, deploy, or send external messages.

Report the behavior delivered, affected files, exact test/build results, rendered checks, any unrun checks, and remaining risks. Update this plan with actual completion evidence during implementation; do not mark partial verification complete.

## Acceptance-to-evidence mapping

| Criterion | Required evidence |
| --- | --- |
| AC1: Complete eligible Main Basket list | Picker fixtures plus workspace pagination integration, including inactive, unrelated, archived, and empty baskets |
| AC2: Correct dependent Sub-baskets | Distinct parent/child fixtures, later-page entries, clear/switch/delayed-response tests |
| AC3: Correct save and preserved values | Exact stable-ID save assertions plus existing component, transfer, pending-Mode, and tier regressions |
| AC4: Catalog states and recovery | Rendered loading/empty/failure/failed-refresh/retry tests for both levels and valid-save gating |
| AC5: Retained request workflows | Picker request outcomes, active-parent restriction, request panel/review and Main Basket request regressions |
| AC6: Read-only and proposal isolation | Component permission cases, scoped-source tests, and live-tier coverage |
| AC7: Quality and usability | Desktop/mobile rendered QA, keyboard/focus/labels, console/network checks, typecheck, build, and diff hygiene |

## Execution evidence and handoff

Completed 2026-11-03 after specification approval, task-plan approval, and explicit Mode A selection.

### Delivered

- Configuration lists active and inactive non-archived baskets, including unrelated/empty baskets; inactive labels are presentation only. Proposal eligibility stays active-only and source-scoped.
- The workspace passes independently derived Main Basket query state through Mode to the component picker. Both catalogs expose loading, empty, refresh-error, and retry states; current parent/child IDs gate Save.
- Parent switches clear child/request feedback. Late or mismatched children and unavailable selections cannot become valid saves. Missing Sub-basket requests preserve the active-parent rule and pending/rejected/approved behavior.
- Five frontend files changed: `KnowledgeInHouseComponents.tsx`, its test file, `KnowledgeItemWorkspacePage.tsx`, `KnowledgeModePanel.tsx`, and `KnowledgeScreens.test.tsx`. No API, schema, financial formula, dependencies, or lockfile changes.
- Native frontend implementation agent owned the picker and its tests; the primary agent owned Mode/workspace integration and integration tests. Independent integrity review found no confirmed defects. Final verification ran after writers and review finished.

### Automated verification

Commands are the two focused test groups listed in Task 4, with JSON reporters added for evidence:

- Group 1: `--reporter=json --outputFile=/private/tmp/lisno-inhouse-final-verification/focused.json`. Exit 1: 187 passed / 16 failed, 203 total. Component 24/24, transfer 26/26, pending Mode 32/32, workspace screens 105/121.
- Group 2: `--reporter=json --outputFile=/private/tmp/lisno-inhouse-final-verification/request-regressions.json`. Exit 0: 140/140 passed. Pagination 5, tiers 6, proposal source 5, Sub-basket requests 5, request review 31, vendor directory 29, vendor profile 59.
- Total: 327 passed / 16 failed across 343 tests. All 17 new regressions pass.
- Isolated original HEAD `999d9ce01f48778d5d49b2314828e9a57bb94429` workspace-screen baseline: 101 passed / 16 failed across 117 tests. Exact failing-name comparison found no additions or removals. Thirteen failures use outdated Specifications `Item name` textbox expectations; three concern temporary-item links, Overview Save text, and saved-source section expectations. These unrelated baseline failures remain unresolved.
- `npm run typecheck`: exit 0. `npm run build`: exit 0, including TypeScript and Vite. Vite reports bundles above 500 kB; no new dependency was added.
- `git diff --check`: exit 0; status contains only the five scoped frontend paths and this work's spec/plan.

### Rendered interaction and accessibility evidence

Used Vite development mode and the existing enterprise QA harness with in-memory synthetic catalog/request responses. Chrome DevTools controlled a disposable isolated context, HeadlessChrome 156 on macOS, DPR 1, without CPU/network throttling. No real API mutation was sent.

- Desktop 1440 × 960: inspected actual Mode > In-house > Add component; inactive basket and matching child appeared; Save enabled for a valid pair; inactive-parent request disabled with explanation. Screenshot inspected, no horizontal overflow, axe zero violations.
- Mobile emulation 390 × 844 with touch: used the mobile Configuration section selector to open Signature mode. Inspected picker and request-panel screenshots. Both fit the viewport; inactive restriction and long labels remain usable; axe zero violations on the picker.
- Submitted a synthetic pending Sub-basket request under Painting. It retained that parent ID, did not create a component, and did not add the pending name as an option.
- Selected an existing child, simulated a failed Sub-basket refresh, observed Save disabled with the selected value preserved, then retried successfully and observed Save enabled again.
- Checked an empty basket, switching/clearing parent, no false loading when the parent is empty, keyboard ArrowDown/Enter selection and Tab focus, and Escape returning focus to Add component.
- Final harness diagnostics: zero render errors, zero unexpected API requests; no browser console errors. An unrelated asset-preload warning was present. The intentionally simulated refresh failure was handled correctly.
- Playwright MCP could not launch its browser; Chrome DevTools provided successful browser QA. The screenshot tool disallowed filesystem export even inside the workspace, so screenshots were inspected inline and no screenshot files were retained.

### Artifacts and limits

- Final test/build JSON and logs: `/private/tmp/lisno-inhouse-final-verification/`.
- Baseline reports: `/private/tmp/lisno-knowledge-baseline.ITlLxo/baseline.json`, `baseline.log`, and `failing-test-names.json`. The temporary source snapshot was removed after comparison.
- Ignored build output: `frontend/dist/`. No runtime artifacts were staged or committed.
- Full frontend suite, backend/OCR suites, replica-set integration, and live-backend browser mutation were not run; the approved scope changes frontend selection and state wiring only. No lint script exists.
- No migration, seed, commit, push, deployment, or external communication was performed. Existing broad-suite failures and the build chunk-size warning remain outside this change.

