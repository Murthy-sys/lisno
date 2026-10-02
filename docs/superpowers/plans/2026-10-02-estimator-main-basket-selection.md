# Task plan: Estimator basket selection and ready Draft/Inactive items

Date: 2026-10-02  
Status: Revised plan approved by the user on 2026-10-02; Mode A implementation and local verification complete. Changes remain uncommitted and undeployed.  
Approved specification: [Estimator selection of configured baskets and ready items](../specs/2026-10-02-estimator-main-basket-selection-design.md), revision approved by the user on 2026-10-02.

## Outcome and boundary

Estimator/Sales can select any active Main Basket, including one with no available items. The builder shows ordinary Main Lines under their real Sub Baskets and temporary items under a real Sub Basket or directly under a Main Basket. Active items retain the approved active-revision-plus-valid-UOM rule. Draft and Inactive items of either type also appear when their chosen source revision has complete Overview and Mode tabs and a valid UOM. New selections save only after a server recheck; saved estimate snapshots remain stable.

**Configuration is read-only for this work.** No owner edits Configuration data, management screens, Configuration write services, seed/backfill/migration scripts, or production records. Tests use only synthetic fixtures in an isolated disposable database. No commit, push, deployment, production mutation, or customer communication is included.

## Baseline and prior local work

- The worktree already contains the earlier approved basket/temporary-item implementation across backend, frontend, and downstream consumers, plus a local catalogue refresh control. Every relevant target is dirty; capture its current diff and coordinate ownership before editing. Do not reset, reformat, or overwrite prior work.
- The earlier local implementation carries typed temporary items, real nullable Sub Basket parentage, server-owned snapshots, paise amounts, and direct/grouped downstream lineage. The estimator chooser allows empty baskets. The new work is an additive eligibility and mutable-source contract, not a replacement of those changes.
- The present backend catalogue read and first-save resolver query item status Active and revision status Active. Configuration's index instead shows nonarchived items, displaying a Draft revision first when present. Its four-tab completion maps Overview to the overview section and Mode to either advanced or pricing. A 100% item necessarily has both tabs complete; a 75% item may or may not.
- The frontend API URL currently points to production. Local source edits do not change a deployed response. Image 2 contains the old Active-only copy; the local refresh control has neutral copy and passed 28 focused rendered tests plus frontend typecheck. The two pictured items' lifecycle/revision statuses were not read from production.
- Previous integrated focused checks on the Active-only implementation passed: backend catalogue/save 13/13, downstream 326/326, frontend scoped 84/84, both typechecks/builds, and rendered 390/768/1280 px checks with zero axe violations in inspected states. Earlier full backend and frontend suites had failures outside the changed focused tests (14 and 29 respectively), some still unexplained, recorded in /tmp/lisno-estimator-final-*.log. These are baseline results, not verification of the new rule.

## Contract to freeze before writers start

1. Catalogue compatibility: GET /estimation/catalogue defaults to the existing Active-only item set. The updated client requests includeReadyNonActive=true; only that opt-in expands to ready Draft/Inactive items. The older backend's strict query parser rejects that new field, so the client retries the legacy URL only for a validation error naming includeReadyNonActive. That older backend also rejects new save fields, so a fallback ordinary Main Line omits itemType and versions; incompatible temporary/null-parent lines must not be sent there. Pagination, basket ordering, actor authorization, and narrow response remain unchanged. Older clients do not see newly eligible mutable items they cannot save.
2. Source revision: Active item → its Active revision, even with a pending Draft. Draft item → its Draft revision. Inactive item → its Draft revision if present, otherwise its retained Active revision. An Inactive item with an incomplete Draft does not fall back to an older Active revision. Archived items are excluded.
3. Readiness: Draft/Inactive items require overview.state complete and at least one of advanced.state or pricing.state complete on the chosen revision. Active items keep the already approved active-revision/valid-UOM rule. Every eligible item needs an Active Main Basket, valid real Sub Basket for an ordinary Main Line, real-or-null Sub Basket for a temporary item, revision ownership/status consistency, and a resolvable nonarchived UOM with valid code, name, and decimal scale. No Configuration prices, costs, or margins enter the quote.
4. Catalogue fields: preserve mainLines, temporaryItems, and directTemporaryItems. Add itemStatus, revisionStatus, itemVersion, and revisionVersion to each projected item along with its existing stable IDs, type, nullable parent, selected revision ID, and UOM. These fields describe the chosen source, not a future mutable Configuration state.
5. First save: the configured-line input adds optional itemVersion and revisionVersion. A newly added Draft/Inactive item requires both; a missing or changed version conflicts. New Active lines remain compatible with older clients lacking the fields; when versions are supplied, validate them. In the existing transaction, use the same revision chooser/readiness/parent/UOM checks as the catalogue, plus selected-basket, ownership, and estimate version checks. Reject stale or no-longer-ready first saves with ESTIMATE_CATALOGUE_CHANGED and no estimate write.
6. Snapshot: save sourceItemStatus, sourceRevisionStatus, sourceItemVersion, and sourceRevisionVersion on newly selected lines, alongside the existing server-stamped item type, real basket path, revision ID, names, UOM, rate, quantity, and integer-paise amounts. Do not invent source provenance on historical lines. Later edits of a saved line use its snapshot, never a fresh Configuration projection. Preserve immutable publication and client review history.
7. UI: show Draft or Inactive source state only to the estimator at item selection; customer-facing proposal/PDF need the saved item name/type/path and prices, not internal lifecycle badges. A refresh keeps room, basket, rates, quantities, and saved snapshots. Empty, loading, failure, 403, and stale-data states remain distinct.

If a shared contract field or status rule must change, the primary agent reconciles it with the approved specification before owners write divergent implementations.

## Dependency-ordered tasks

| Task | Depends on | Owner in approved Mode A | Deliverable and criteria |
| --- | --- | --- | --- |
| 1. Baseline and bounded audits | Plan approval; prior Mode A choice | Primary agent with read-only catalogue/API and frontend audits as useful | Capture dirty-path set and target diffs; confirm route query parsing, revision completeness semantics, estimate snapshot consumers, and tests. Freeze the contract above. AC 2, 4, 5. |
| 2. Catalogue projection | Task 1 | Backend core owner | Add opt-in query parsing and documented response, shared source-revision selector, Draft/Inactive readiness/UOM/parent checks, version/status fields, and legacy default. Add focused isolated route/service cases. AC 2, 3. |
| 3. First-save and persistence | Task 1 and shared selector from Task 2 | Same backend core owner | Extend request validation, Estimate storage, first-save version/lifecycle recheck, saved snapshot restoration, OpenAPI, and transactional tests. Preserve old Active clients and existing saved lines. AC 4, 5. |
| 4. Estimator client | Task 1 contract; API shape from Task 2 | Frontend owner | Request opt-in catalogue, type fields, forward versions on new lines, show internal lifecycle state, preserve refresh/selection/snapshots, and test rendering plus stale conflict/retry. AC 1–5, 7. |
| 5. Downstream compatibility | Task 3 shape frozen | Backend downstream owner only if the audit finds a required writer; otherwise read-only integrity check | Verify publication, immutable review, PDF, design, workflow, procurement, finance, and OpenAPI consumers accept saved source provenance without recalculating from Configuration. Make scoped model/DTO/test edits only where required. AC 5, 6. |
| 6. Integrated integrity review | Tasks 2–5 finished | Primary agent and integrity_reviewer | Inspect final diff for identity, revision races, authorization, historical compatibility, approval immutability, paise totals, and no Configuration writes; resolve findings. AC 1–7. |
| 7. Final verification | Task 6 findings resolved | verification_runner, then primary agent | Run focused and risk-based broader tests, typechecks/builds, rendered interaction/accessibility at 390/768/1280 px, final diff/status checks; report exact results and limits. AC 1–7. |

Only one parent task is in progress at a time. After Task 1, backend core Tasks 2–3 and frontend Task 4 can proceed in parallel on nonoverlapping paths. A downstream writer waits for the saved-line shape from Task 3. Final integrity review and final verification run sequentially on the integrated worktree. All owners are not alone in the worktree: preserve others' edits, do not cross ownership boundaries, and report newly required shared files to the primary agent.

## Ownership boundaries

- **Primary agent:** product interpretation, approved spec/plan, shared contract decisions, target-diff capture, cross-owner integration, final review, and external-action boundary.
- **Backend core:** backend/src/services/estimator-catalogue.service.ts; backend/src/routes/estimator-catalogue.ts and estimates.ts; backend/src/models/Estimate.ts; scoped backend/src/openapi.ts catalogue/estimate schemas; backend/tests/estimator-catalogue-estimate.replica-set.test.ts and directly related route/API-doc tests. No Configuration management services or downstream publication/review/procurement/finance files.
- **Frontend:** frontend/src/features/leads/estimationCatalogueApi.ts, configuredEstimate.ts, ConfiguredEstimateBuilder.tsx, LeadEstimateWorkspace.tsx, leadsApi.ts, and their focused tests; frontend/src/api/types.ts; scoped frontend/src/styles/estimator-dashboard.css; frontend/src/test/fixtures/enterpriseRoutes.ts if needed. No Configuration management UI or backend files.
- **Backend downstream if needed:** backend/src/models/EstimateClientReviewRound.ts; backend/src/domain/estimate-client-review.ts; backend/src/services/estimate-publication.service.ts, estimate-client-review.service.ts, estimate-client-presentation.ts, estimate-pdf.service.ts, procurement.service.ts, project-finance.service.ts, project-completion.service.ts; backend/src/domain/estimate-design-mapping.ts, project-workflow.ts, workflow-estimate-items.ts; and focused tests only. No backend core or frontend files.

## Verification matrix

| Acceptance criteria | Required evidence on the integrated result |
| --- | --- |
| AC 1 and 3: basket selection/count/states | Rendered frontend tests for empty and populated baskets, multi-select, locked estimates, room gate, count, 403/error/retry, and refresh after a successful empty response. Keyboard/focus and 390/768/1280 px checks. |
| AC 2: eligibility | Isolated replica-set catalogue tests for Active with pending Draft, Draft/Inactive ordinary and grouped/direct temporary, Overview/Mode complete and incomplete, 100%, Inactive retained Active, archived/parent/UOM controls, same-named Sub Baskets, pagination, legacy default, opt-in, access, and narrow response. |
| AC 4: first save | Replica-set estimate tests for both temporary placements and ordinary lines, item/revision version changes under a stable Draft ID, lifecycle/readiness/UOM/parent changes, missing versions, unselected basket, exact paise/GST, blank versus zero, and no write on conflict. |
| AC 5: snapshot/compatibility | Save/reload/edit/submit/publication/client-review tests after source rename, Draft edit, deactivation, or archival; historical configured lines lacking provenance/type and legacy lines remain readable. |
| AC 6: downstream | Focused PDF, design, workflow, procurement, project/detail/portfolio finance tests preserve direct/grouped source IDs and reconcile amounts for two unequal projects without a synthetic Sub Basket. Re-run changed consumer suites only if new provenance touches them. |
| AC 7: final quality | Focused tests first, backend/frontend typechecks and builds, risk-based broader suites, rendered interaction/accessibility and console/network checks, git diff --check, git status --short, and final diff review. Do not claim lint passed: no lint script exists. |

Use the established isolated replica-set test lane only. Do not connect scripts or tests to existing Configuration data. Mock or disable external delivery. Report exact failures instead of treating the earlier broad-suite failures as proof of this change. No migration, live write, commit, push, or deployment occurs during implementation.

## Local verification outcome

- Focused backend catalogue/save tests passed 17/17; affected downstream backend tests passed 361/361. Focused frontend estimator tests passed 41/41 and affected consumer tests passed 53/53.
- Backend and frontend typechecks and builds passed. The frontend build reported its existing large-chunk warning.
- The full backend suite passed 4,386 tests and failed 11; ten failures match the preceding baseline, and one unrelated Sales Manager test failed only in the full run and passed 24/24 in isolation. The full frontend suite passed 3,876 tests and failed 28; every failure matches the preceding baseline. These suites are not green.
- In the synthetic browser fixture, POP / Gypsum → NA displayed and permitted selection of Draft `Cove in Gypsum` and Inactive `POP false ceiling`; both accepted quantity/rate input. At 390, 768, and 1280 px the inspected builder had no document overflow or unexpected requests. Mobile axe reported zero violations. The synthetic fixture rejects all estimate save mutations by design, so save/reload behavior is verified in tests rather than this browser session.
- `git diff --check` passed. No Configuration management path or production data changed. Playwright's temporary repository artifacts were removed after inspection.
