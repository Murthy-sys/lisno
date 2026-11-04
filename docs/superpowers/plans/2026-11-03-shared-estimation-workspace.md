# Shared estimation workspace implementation plan

Date: 2026-11-03
Status: Implemented in Mode A; integrity review and verification completed. Repository-wide checks retain confirmed baseline failures, detailed below.
Approved source: [Shared estimation workspace specification](../specs/2026-11-03-shared-estimation-workspace-design.md).
Approval evidence: The user instructed “continue from where we stopped” after specification preparation, then “Approved” for this task plan, then selected “A” for parallel sub-agents.

## Outcome and fixed boundaries

Use the same estimation presentation for Sales, authorized Designers and Clients, restoring the saved estimate and providing clear save-before-return navigation and scoped line/Sub Basket removal.

The approved specification controls behavior. In particular:

- Configuration Overview's `clientVisible` controls Client quotation rows and edits; requirements Internal/External visibility is separate.
- Client editing remains scoped to saved rooms and the project's selected Main Baskets in the existing version-3 quotation workflow.
- Primary Designer editing retains current assignment/phase restrictions. Authorized secondary Designers receive the shared safe read-only presentation.
- Clients cannot edit rates, internal costs, hidden rows, shared Configuration or project room structure.
- Removal excludes estimate items; it never deletes Configuration. Hidden rows and true totals survive Client saves.
- Save never means approval/publication/email. Published snapshots, approved baselines and historical revisions remain immutable.
- No dependencies, lockfile changes, migrations, commits, deployment or production writes are expected or authorized by this plan.

## Worktree and ownership

Before specification creation, the worktree was clean. At plan creation, the only dirty path was the newly created specification. No product files were modified.

At execution start, capture `git status --short`, the dirty-path set and relevant target diffs again. Understand any intervening edits before assigning ownership. Never revert, stage or reformat unrelated work.

The primary agent owns the contract, this plan, integration, route/cache wiring, shared styling and acceptance reconciliation. Agent roles below describe ownership only; no agents may start before the user selects Mode A. In Mode B, the primary agent performs every task sequentially, including review and verification.

Keep one parent task in progress. Independent child tasks may run together only within its stated ownership boundaries. Any newly needed path must be assigned before editing.

## Contract to settle before parallel writers

The first implementation task establishes concrete TypeScript shapes within these approved constraints:

1. **Shared presentation:** a small role-safe view model for rooms, basket hierarchy, line identity/selection, permitted controls, amounts and capabilities. Share room/basket navigation and layout, while allowing staff and Client field/action adapters. Do not require Clients to construct a privileged staff DTO or fetch the internal catalogue.
2. **Safe quotation grouping:** additive Main Basket/Sub Basket IDs and names on visible lines/candidates plus safe hierarchy metadata. Keep existing detail, candidates, revision and PATCH endpoints. Preserve existing pagination and supply enough metadata for the complete permitted group rather than deriving group scope from one page.
3. **Atomic group command:** extend the existing discriminated quotation operation union with a scoped exclusion operation where needed. It identifies a Main Basket, optional Sub Basket and explicit room/all-rooms scope; it carries the expected estimate version and a server-issued current-group/source token or equivalent exact source precondition. The server expands and authorizes eligible affected members in one transaction.
4. **Race and overlap rules:** group/source preconditions detect visibility, parent, source revision and inclusion changes. Reject ambiguous overlapping line/group operations, or normalize them deterministically before writing with explicit regression coverage. A hidden or unauthorized row must never become a mutation target. More than 100 group members must not result in multiple committing requests.
5. **Existing save semantics:** stable IDs, exact paise, source fencing, scope revision, review supersession, audit and CAS remain authoritative. No new endpoint or broad role grant is needed merely to share rendering.

Exact field names and component extraction boundaries are engineering choices within the approved specification. A change to Client scope, Designer permissions, workflow rules or persisted financial semantics requires updating the specification before implementation of that change.

## Dependency-ordered tasks

### T1. Confirm baseline and establish shared contracts

Owner: primary agent. Dependencies: task-plan approval and execution-mode selection. Acceptance: AC1–AC11 prerequisites.

- Recheck worktree ownership and inspect the exact save/hydration, quotation visibility, source-fencing and group-exclusion paths.
- Run focused existing staff and Client tests to establish the baseline; record pre-existing failures without modifying unrelated functionality.
- Settle the role-safe presentation contract, additive quotation DTOs and atomic group command/preconditions described above.
- Own `frontend/src/features/client/quotationApi.ts` contract changes and any new small presentation types under `frontend/src/features/estimates/`; do not add a separate persisted estimate model.
- Specify the backend response/error contract and new fixture cases to the backend owner. Share these definitions with all writers before they start.
- In Mode A, bounded read-only audits of quotation authorization and staff hydration may run independently here if useful. Neither auditor owns source changes.

Done when: interfaces, mutation scope and ownership are unambiguous, baseline results are recorded, and no product decision remains for implementers to invent.

### T2. Add safe grouping and atomic quotation removal

Owner in Mode A: `backend_implementer`. Dependencies: T1. Acceptance: AC2, AC5–AC10.

Owned paths:

- `backend/src/services/quotation.service.ts`
- `backend/src/routes/quotation.ts`
- `backend/src/openapi/quotation.ts`
- `backend/tests/quotation-edits.replica-set.test.ts`
- New narrowly named quotation grouping/removal service tests or helpers, if the existing service warrants extraction

`estimate-tiers.service.ts`, catalogue resolution, authorization registry and shared policy changes require coordination with the primary agent before expanding this boundary.

- Return only authorized grouping metadata, visible candidates, scoped capabilities and group preconditions. Preserve the full internal estimate and overall total.
- Resolve current eligible members on read and again during mutation. Check assignment, active identity, estimate version, current visibility/source identity, actual room membership and basket parentage.
- Exclude every eligible member in the declared scope atomically, including more than 100 members. Preserve hidden rows byte-for-byte where untouched, other rooms/groups and master data.
- Use the existing pricing/scope/audit/review transaction. Preserve remove/re-add stable identity and existing source-change failures.
- Update OpenAPI and runtime validation together, retain old single-line operations and fail safely for unsupported/invalid commands.
- Cover two projects, visible/hidden siblings, secondary Designer denial, cross-project IDs, invalid fields, visibility/source races, stale versions, source failures and transaction rollback.

Done when: replica-set tests prove no leakage, partial removal or unauthorized write; native/mobile consumers of existing DTO fields and operations remain compatible.

### T3. Extract shared room and basket presentation

Owner in Mode A: primary agent or one frontend implementer. Dependencies: T1. Acceptance: AC1, AC5, AC8, AC11. May run alongside T2.

Owned paths:

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its test
- `frontend/src/features/leads/useConfiguredEstimateViewState.ts`
- New focused shared view components under `frontend/src/features/estimates/`

Shared styling remains primary-owned; request changes rather than editing `frontend/src/styles/estimator-dashboard.css` concurrently.

- Extract reusable room navigation, search, grouping and selection layout without moving staff persistence into the shared renderer.
- Keep staff recommendation, pricing and component behavior through explicit adapters/slots. Client adapters must not need private catalogue fields, staff history or rate-edit callbacks.
- Add explicit group actions with full target scope, accessible names and confirmation. Compute action scope from the canonical group, not search/collapse/page output.
- Preserve Selected versus available-item views, empty groups, focus recovery and room/basket selection on rerender.
- Keep the existing visual composition. Add no decorative effects, icon libraries or new design-system dependency.

Done when: the existing staff builder tests pass through the shared renderer and both editable and read-only safe fixtures render without privileged data.

### T4. Implement staff save-and-return and persisted exclusions

Owner in Mode A: frontend implementer for the staff slice. Dependencies: T3; use T1 contract. Acceptance: AC3–AC6, AC9–AC11.

Owned paths:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`
- `frontend/src/features/leads/configuredEstimate.ts`
- `frontend/src/features/leads/estimateDraftFingerprint.ts` only if required by changed draft state
- Relevant `LeadEstimateWorkspace*.test.tsx` and `configuredEstimate*.test.ts`

- Replace ambiguous back navigation with Save and edit baskets/Edit baskets, using confirmed save success as the transition condition.
- Add setup-view Save draft and retain Continue to item selection. Preserve active room and values when returning.
- Apply scoped Sub Basket removal and Main Basket deselection using existing inclusion/recommendation semantics; preserve persisted exclusions across hydrate, save, reload and refresh.
- Guard conflicting mutation/navigation controls. Preserve existing late-save handling for ordinary saves; do not regress typed values when an earlier response arrives.
- Add save/discard/stay protection for exiting dirty work using an existing dialog pattern.
- Cover validation, failed save, unknown outcome, stale estimate, double-click, empty draft and locked/history states.

Done when: Kitchen/Bedroom navigation and saved exclusions survive reload, and no save-and-return action publishes or discards unsaved work.

### T5. Adapt Client and secondary-Designer quotation rendering

Owner in Mode A: separate frontend implementer for the quotation slice, or primary agent. Dependencies: T2 and T3. Acceptance: AC1–AC3, AC5–AC11. May run alongside T4 with exclusive paths.

Owned paths:

- `frontend/src/features/client/ClientQuotation.tsx` and its test
- `frontend/src/features/client/clientQuotation.css`
- New quotation-specific adapters/components/tests under `frontend/src/features/client/`

`quotationApi.ts`, shared renderer, routing, `ClientProject.tsx` and Designer entry points remain primary-owned.

- Render scoped quotation detail/candidates in the shared hierarchy; hydrate saved values without creating a separate estimate.
- Expose only eligible inclusion, quantity/dimension, tier and component controls. Show rates read-only and use the authoritative overall total with correctly labelled visible subtotals.
- Provide role-safe basket navigation, Save and edit baskets, line removal and atomic group removal. Preserve unsaved intent until the server confirms success.
- Preserve re-addition through the safe candidates path, including excluded saved lines. Avoid assuming the first candidate page contains the whole basket.
- Support secondary Designer read-only presentation using backend capabilities; do not allow actions solely because the role is Designer.
- Keep current working changes distinct from the published review/approval surface. Retain blocked, unavailable, conflict, invalid-source and no-visible-items states.

Done when: safe fixtures produce staff-equivalent navigation with correct restricted controls, atomic removal commands and conflict handling, including an unchanged hidden contribution to the total.

### T6. Integrate entry points, caches and responsive behavior

Owner: primary agent. Dependencies: T2–T5 finished. Acceptance: AC1, AC3, AC8–AC11.

Owned integration paths:

- `frontend/src/app/router.tsx`, `routeRegistry.ts` and routing tests if route changes are necessary
- `frontend/src/features/client/ClientProject.tsx` and relevant Client project tests
- `frontend/src/features/designer/DesignerDesignPlanTasksPage.tsx`, `DesignerDashboard.tsx` and relevant tests as needed for clear entry points
- `frontend/src/features/client/quotationApi.ts`
- `frontend/src/features/leads/estimateCollaborationQueries.ts`, `useQuotationRevision.ts` and related tests
- `frontend/src/styles/estimator-dashboard.css`
- Backend route-operation registry/inventory only if an actual operation changes

- Connect Estimation entry points to the appropriate shared view, retaining existing deep links and role-appropriate return destinations.
- Check contract agreement, actor/project cache separation, candidate/group invalidation and revision polling. Retain dirty local edits when another actor saves.
- Resolve styling once on the integrated renderer at narrow/tablet/desktop widths. Keep save controls, confirmation dialogs and room navigation accessible.
- Reconcile any issues from writers and inspect the complete diff against the specification. Request a specification update only for a material scope/behavior change.

Done when: every role journey uses the integrated contract, all writers have stopped, and the result is ready for independent review.

### T7. Integrity review and corrections

Owner in Mode A: read-only `integrity_reviewer`, then primary agent/assigned owners for fixes. Dependencies: T6. Acceptance: AC2, AC6–AC10 plus full spec review.

Review authorization, current Configuration visibility, hidden-row preservation, group/source races, transactions, paise reconciliation, approval history, cache isolation, late-save behavior and backward compatibility. Use at least two asymmetric projects and identities when evaluating tests. Report concrete findings with file evidence.

Resolve confirmed findings before final verification. Do not run the final verifier against an actively edited worktree. In Mode B, perform this review inline with the same checklist.

### T8. Verify integrated work and hand off

Owner in Mode A: `verification_runner` after T7; primary agent owns browser reconciliation and final handoff. Dependencies: all writers and corrections complete. Acceptance: AC1–AC11.

Execute the verification matrix below. Record exact commands, results, skipped/environment-blocked checks and temporary artifact paths. Fix failures in scope, rerun affected checks and complete the final integrated validation. Never report partially verified work as complete.

## Parallel execution boundaries

In Mode A, T2 (backend) and T3 (shared frontend renderer) may run concurrently after T1. After the renderer is stable, T4 (staff adapter) and T5 (Client adapter) may run concurrently; T5 additionally requires T2's completed backend contract. Primary-owned API types, route/cache integration and shared CSS have one writer. T6, T7 and T8 are sequential.

Tell every writer that others share the worktree, not to revert their edits, and to adapt to agreed contract changes. Assign exact files, invariants and tests. A writer discovering a contract issue reports it to the primary agent before inventing a fallback. Mode B uses the same dependency order without subagents.

## Verification matrix and commands

| Acceptance | Focused evidence |
| --- | --- |
| AC1 | Role route/entry tests; saved-estimate hydration; primary and secondary Designer capability cases |
| AC2 | Replica-set authorization/visibility cases, safe response inspection, hidden-only baskets/candidates and configuration races |
| AC3 | Save-before-navigation interaction tests; failed/lost response; dirty exit; duplicate click; stale version |
| AC4 | Two-room staff save, return, reload and Configuration refresh with unequal values |
| AC5–AC6 | Single/group removal, re-addition, hidden sibling retention, master-data unchanged, recommendation dependencies, active search and collapsed groups |
| AC7 | 100-member and larger group tests, failing member, stale group token, concurrent save and full transaction rollback |
| AC8 | Exact paise/GST and total reconciliation across two unequal projects; visible-only labels; forbidden Client price fields |
| AC9 | Existing approval, projection, rendition and revision tests; legacy compatibility and no save-triggered email |
| AC10 | Client/Sales/Designer version refresh; dirty local input preservation; actor/project cache isolation |
| AC11 | Rendered keyboard/accessibility and browser checks at 390px, 768px and 1440px; loading/empty/error/read-only states |

Baseline/focused frontend command:

```sh
cd frontend
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/client/ClientQuotation.test.tsx
```

Additional focused frontend checks after integration:

```sh
cd frontend
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/useQuotationRevision.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/designer/DesignerDesignPlanTasksPage.test.tsx src/app/router.test.tsx
```

Baseline/focused backend command, expanded with any new grouping tests:

```sh
cd backend
npm test -- tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/client-quotation-projection.test.ts tests/estimate-tiers.replica-set.test.ts
```

Additional backend regressions:

```sh
cd backend
npm test -- tests/estimator-catalogue-estimate.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts tests/client-quotation-rendition.replica-set.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
```

Replica-set tests use `backend/tests/helpers/mongo-replica-set.ts` and `mongodb-memory-server`, isolated synthetic databases and transactions. A missing Mongo binary or execution restriction is an environment dependency to resolve or report; do not substitute a standalone Mongo instance or weaken transactional semantics. Do not use production databases or seed scripts.

Final workspace checks after review/fixes:

```sh
cd backend
npm run typecheck && npm test && npm run build
```

```sh
cd frontend
npm run typecheck && npm test && npm run build
```

```sh
git diff --check
git status --short
```

Browser verification uses local synthetic role/project fixtures, the existing app and browser tooling. Exercise saved estimate opening, Kitchen/Bedroom switching, save-and-return, Main Basket/Sub Basket removal, re-addition, Client hidden items, secondary read-only access and a save conflict. Inspect console/network failures and keyboard focus. Use read-only document previews for Proposal checks; do not send mail or publish a real quotation. Apply the browser skill when executing browser QA. Save any necessary temporary screenshots under an ignored task-specific output directory and report/clean them appropriately.

No lint script exists. No OCR/native-mobile suite is required unless implementation unexpectedly changes those contracts. Full suites should not be repeated after a clean pass without new edits, failures or unresolved concerns.

## Completion record

Execution log:

- T1 complete: initial worktree rechecked; only this plan and its specification were untracked. Product targets had no pre-existing diff. Independent quotation-contract and shared-UI audits settled visibility, source, role and navigation boundaries.
- Baseline frontend command above passed: 4 files, 48 tests.
- Baseline backend command above passed with isolated Mongo replica sets: 4 files, 74 tests.
- T2 complete: safe grouping, excluded choices and atomic scoped removal implemented with current-source tokens. Backend typecheck and 30 quotation replica-set regressions passed; related focused baseline/regression lanes also passed.
- T3–T4 complete: shared shell, save-and-return, setup Save, scoped exclusions and navigation guard implemented. Seven staff/shell/guard test files passed, 118 tests; two tightened late-response cases also passed. Frontend typecheck passed.
- T5 complete: Client safe shared rendering, staged group removal/Undo, saved re-addition, unavailable-source controls and uncertain-save verification implemented; final Client suite passed 21 tests and frontend typecheck.
- T6 complete: route/entry points integrated; 55 page/entry tests and 143 routing tests passed. Browser synthetic Client save-return, group removal, re-add/reload and failed-save preservation passed. Staff save-return and scoped removal, secondary Designer read-only access, and keyboard basket navigation passed. Client/staff rendered layouts checked at 390/768/1440px; Designer checked at 768px. Axe returned no violations, with no document overflow or runtime exceptions. Mobile heading wrapping corrected. Browser harness and captures moved out of the worktree to `/private/tmp/lisno-shared-estimation-qa`; task browser/Vite sessions closed.
- T7 complete: independent integrity review found and verified corrections to dirty-exit guard lifetime during failed reads/history, access-denial data hiding, and lost-response recovery when an incompatible sibling is excluded from group membership. No unresolved confirmed findings. Staff error/history correction suites passed 30 tests; Client final suite passed 21.
- T8 complete with baseline limitations: both workspace typechecks/builds passed. Frontend full run executed 6,180 tests (6,077 passed, 103 failed initially). All failures were classified: 4 stale task assertions corrected, 3 estimation-fixture failures corrected by supplying the existing revisions read, 5 isolated timeouts passed on rerun, and 91 remaining failures reproduce against unchanged HEAD. The remaining baseline failures concern Ask Lisno, Configuration, a review disclosure, a proposal test and unrelated enterprise workflow/gallery fixtures. The task's final recommendation suite passed 37/37; authorization/estimation fixture subset passed 11/11; final frontend typecheck and diff check passed.
- Full backend initially hit sandbox listener restrictions. The authorized local-port rerun completed: 7,097 passed, 16 failed, 24 skipped across 348 files. Fifteen failures reproduce against unchanged HEAD in Configuration, audit vocabulary, Gemini settings and a Mongo mock-CAS expectation. The remaining related-items HTTP-auth failure passed its isolated live rerun. All quotation edits (30), approvals (24), tiers (23), route registry (45) and frontend authorization (3) tests passed in the full run. The 24 skipped tests are existing Python-assistant opt-in suites gated by `LISNO_ASSISTANT_TEST_PYTHON` (5 bridge, 15 rules, 4 Mongo rules).
- No unresolved task-specific failure or review finding remains. The full repository is not green because of the documented baseline failures. No dependencies, migrations, commits, pushes, deployment, production mutation or customer communication performed. Temporary HEAD comparison checkout removed; evidence retained under `/private/tmp`. Ignored build outputs are `backend/dist` and `frontend/dist`.

### Final verification evidence

Commands were run in the indicated workspace; JSON files retain exact failing test identities.

| Check | Command / evidence | Result |
| --- | --- | --- |
| Backend TypeScript and build | `npm run typecheck`; `npm run build`; `/private/tmp/lisno-estimation-backend-typecheck.log`, `-backend-build.log` | Passed |
| Backend full tests | `npm test -- --maxWorkers=2 --reporter=json --outputFile=/private/tmp/lisno-estimation-backend-full-ports.json` with local test-port permission | 7,097 passed; 16 failed classified above; 24 opt-in skips |
| Backend baseline / isolated retry | `/private/tmp/lisno-estimation-backend-head-baseline.json`, additional six-case HEAD comparison, `/private/tmp/lisno-estimation-backend-auth-recheck.json` | 15 baseline failures established; one broad-run failure passed live retry |
| Frontend TypeScript and build | `npm run typecheck`; `npm run build`; `/private/tmp/lisno-estimation-final-frontend-typecheck.log`, `-frontend-build.log` | Passed; Vite warns that the main bundle is approximately 3.19 MB (878 kB gzip) |
| Frontend full tests | `npm test -- --maxWorkers=2 --reporter=json --outputFile=/private/tmp/lisno-estimation-frontend-full.json` | Initial 6,077 passed / 103 failed; 7 repaired and verified, 5 transient failures passed retry, 91 unchanged-HEAD failures remain |
| Final affected follow-ups | `LeadEstimateRecommendations.test.tsx` (37 passed); authorization + affected estimation enterprise cases (11 passed); ClientQuotation (21 passed); staff error/history cases (30 passed) | Passed; `/private/tmp/lisno-estimation-recommendations.json`, `-final-fixture-focus.json`, `-guard-corrections.json` and Client owner report |
| Frontend baseline / isolated retry | `/private/tmp/lisno-estimation-frontend-baseline-comparison.json`, `-frontend-timeout-recheck.json` | Confirmed remaining baseline failures; all five isolated timeout cases passed |
| Browser interactions and accessibility | Real local React routes with synthetic role/project transport; 390/768/1440 px, keyboard, save/return, removal, re-addition, failure retention and read-only checks | Passed; zero axe violations in inspected states; artifacts `/private/tmp/lisno-shared-estimation-qa` |
| Worktree | `git diff --check`; `git status --short` | Passed; only scoped source/tests/docs changed, browser outputs removed from worktree |

Browser checks used synthetic transport, not production data or a live customer backend. The optional CLI request-inventory command failed due registry DNS availability; synthetic API request instrumentation and browser console checks were used. OCR, native-mobile and optional Python-assistant suites were not run because this change does not alter those contracts. No lint script exists. The full frontend suite was not repeated after test/fixture-only corrections; the affected tests and final typecheck were rerun.

During execution, record each task as pending/in progress/complete with evidence and remaining blockers. Final handoff must state outcome, affected files, principal contract decisions, exact checks/results, unrun checks and remaining risks. Explicitly report that no migrations, deployment, commits, production mutation or customer communication occurred unless separately authorized and actually performed.
