# Client project table: task plan

Date: 2026-11-24
Status: Completed and verified locally after approval of the [specification](../specs/2026-11-24-client-project-table-design.md), this plan and Mode A (parallel sub-agents).

## Outcome and boundaries

Make normal `/client` a simple **My projects** table, with direct links to the existing full project details. Preserve the existing `?estimate=...` review compatibility path. Reuse the authorized project-summary reader and its pagination. No backend, API, schema, permission, financial calculation, dependency, lockfile or project-detail redesign changes.

## T0. Capture baseline and settle the table contract

Owner: primary agent. First task after execution-mode selection. Covers AC1–AC6.

- Capture current `git status --short` and relevant target diffs before editing; preserve unrelated work. Initial inspection found a clean worktree except the new specification.
- Use a native table with accessible name **Projects**, column headers **Project**, **Location**, **Status**, **Progress**, **Expected completion**, and **Action**.
- Project cells contain the existing public project number and a project-name link. Action text is **Open project**, with accessible name `Open project: <project name>`. Both use the encoded stable project ID and existing detail route.
- Scope new styles to `.client-dashboard`. Use a labelled horizontal scroll container with keyboard focus, wrapping identity/location cells and visible focus styles. Keep existing Client typography and warm surfaces.
- Retain current project-query cache, loading/error and authorization-aware stale-data handling. Keep `ClientEstimateSummary` mounted only for an explicit estimate query parameter, including its existing unavailable-link handling.

## T1. Implement the table and responsive presentation

Owner: frontend implementation slice. Depends on T0. Covers AC1–AC5.

Owned files:

- `frontend/src/features/client/ClientDashboard.tsx`
- `frontend/src/styles/client-dashboard.css`

Replace normal dashboard sections and quick-view mounts with the agreed table and compact heading/count. Remove dashboard-only approved-version and per-project workflow reads by removing their unused mounts. Preserve reusable components used elsewhere.

Show explicit loading, empty, failed-load/retry and retained-stale states. Render missing/invalid completion dates safely. Use existing backend progress/status values without recalculation or invented defaults. Keep all returned projects and their ordering.

Keep the detail route, Back to projects flow and conditional estimate-review content working. Do not change `clientApi.ts`, shared API types, route registry or backend files. Raise any unexpected dependency to the primary agent before widening ownership.

## T2. Update dashboard interaction and data-state regressions

Owner: independent frontend test slice in Mode A; primary in Mode B. Depends on T0's contract and may run beside T1. Covers AC1–AC4 and accessible interactions in AC5.

Owned files:

- `frontend/src/features/client/ClientDashboard.test.tsx`
- `frontend/src/features/client/ClientDashboard.collapsible.test.tsx` (replace obsolete card/quick-view assertions; keep the file unless a rename clearly helps)

Test two unequal projects plus equal-name/different-ID rows, exact field-to-row mapping, encoded navigation destinations, and fetching every existing API page. Confirm no card expansion or quick-view step is needed.

Retain meaningful loading, empty, retry, transient stale, denied-access and denial-followed-by-transient-failure coverage. Verify the normal landing page does not initiate removed dashboard queries, and `?estimate=...` still exposes its existing verified review path. Preserve keyboard/accessibility assertions. Replace superseded dashboard workflow-preview assertions with coverage that the full project route remains reachable; do not weaken detail-page task tests.

## T3. Integrate and check compatibility

Owner: primary agent. Depends on T1 and T2. Covers AC2–AC6.

- Reconcile the integrated diff against the approved spec. Confirm only frontend presentation/tests and working documents changed.
- Check valid, unavailable and legacy estimate links against the existing summary/review components. Keep full project-page estimation, task, message and document functionality unchanged.
- Primary owns any necessary test-only adaptations in `ClientEstimateSummary.test.tsx`, `ClientProject.test.tsx`, `ClientProject.estimateReview.test.tsx`, `EstimateReviewPanel.collapsible.test.tsx`, `ClientEstimateDrawings.test.tsx` and `estimateDrawingJourney.test.tsx`. Tests that previously relied on review content on ordinary `/client` should exercise the retained deep-link or project-detail flow, while keeping their original workflow assertions.
- After writers stop, perform a scoped integrity review of identity, stale/denied data handling, deep links and CSS isolation. Mode A uses the native integrity reviewer; Mode B reviews inline. Resolve confirmed issues before final verification.

## T4. Verify and hand off

Owner: verification agent in Mode A; primary in Mode B. Depends on T3 fixes. Covers AC1–AC6.

From `frontend/`:

```sh
npm test -- src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/client/ClientEstimateSummary.test.tsx src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx --maxWorkers=1
npm run typecheck
npm run build
```

Use synthetic browser data at 1440×900 and 390×844 to check the populated table, long names, horizontal table scrolling without page overflow, keyboard navigation, visible focus, direct project opening and return. Confirm normal-page simplicity and review-link compatibility. Check runtime console/network errors. No real customer data or production mutations.

Run `git diff --check` and inspect `git status --short`. Record exact outcomes, any unrun checks and material limitations here. Remove temporary QA artifacts; report ignored build output. No lint script exists. Backend/mobile/OCR suites are unnecessary unless scope unexpectedly changes, which is not authorized by this plan.

## Coordination and acceptance trace

Keep one parent task in progress. In Mode A, T1 product/CSS work and T2 dashboard tests have non-overlapping ownership and can run in parallel after T0. Tell every writer they share the worktree and must preserve others' changes. Primary owns contracts, working documents, integration and compatibility tests. Review and final verification run after writers finish. Mode B performs the same tasks inline.

| Approved acceptance criterion | Verification |
| --- | --- |
| AC1: one complete authorized-project table | T1 presentation; T2 multi-project and multi-page tests |
| AC2: direct correct project navigation | T2 stable-ID links; T4 browser open/back |
| AC3: details and review links preserved | T3 compatibility tests; T4 review-link checks |
| AC4: loading/empty/stale/denied states | T2 data-state regressions and unequal projects |
| AC5: responsive accessible table | T2 semantic/link checks; T4 desktop/phone and keyboard QA |
| AC6: frontend-only verified change | T3 scope review; T4 tests, typecheck, build and hygiene |

No commits, pushes, deployment, email, migrations or external writes are included.

## Execution record

- T0 complete: the initial tracked worktree was clean; only this request's specification and task plan were untracked. Baseline status, diff and target-file copies were captured in a temporary QA directory before writers started.
- T1 and T2 complete: separate frontend agents implemented the dashboard/CSS and dashboard tests. Both writers stopped before integrity review. Dashboard tests passed: 23 tests across 2 files.
- T3 complete: the primary agent adapted existing review/drawing test entry points to explicit estimate links, preserving review, PDF, annotation and approval assertions. The drawing journey now verifies the approved project's direct table link instead of a removed card heading. No project-detail product code changed.
- Independent integrity review found no confirmed defects in stable identity, pagination, denied/transient data handling, estimate links, semantics or CSS isolation.
- Rendered QA used the real application shell and frontend routes with synthetic, locally intercepted API responses at 1440×900 and 390×844. The populated, empty and failed-load states stayed within the viewport. At phone width the table was 928px inside a 372px scroll region, while document width stayed 390px. Long identity/location text wrapped; region and action links had visible 2px focus outlines. Focusing the action scrolled it into view. Opening the actual project, expanding floor progress and returning to the table passed. Valid estimate links retained their verified quotation route; unavailable links retained their message. Final fixture runs had no unexpected API requests or runtime errors; ordinary home read only auth and project summaries.
- Final integrated regression command above passed: **106 tests across 8 files**. Typecheck then exposed six unsupported `exact` options in new Testing Library `getByRole` calls. Removing those options preserves the exact string-name matching already provided by that API. The two dashboard files were rerun: **23 tests passed**. `npm run typecheck`, `npm run build` and `git diff --check` all passed (exit 0).
- An additional `npm test -- src/features/estimates/ClientEstimateDrawings.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx src/test/fixtures/enterpriseTransport.test.tsx --maxWorkers=1` initially exposed a superseded project-card heading assertion in the drawing journey, corrected to the direct project table link and included in the passing integrated run. The same extra run exposed eight unrelated enterprise transport failures: assignment detail, Project Manager dashboard via `/execution` and `/home`, recommendation scrolling fixture, mode-pricing fixture, protected workflow document and Procurement basket via `/procurement` and `/home`.
- The enterprise transport suite was independently rerun with a temporary Vite pre-transform serving the captured original dashboard TSX and CSS at their original module IDs, without modifying worktree files. It produced the exact same eight failure titles and **65 passed / 8 failed / 73 total**. Both baseline substitutions were confirmed and current product-file hashes were unchanged. Those failures predate this task; no Client scenario failed in that suite.
- T4 complete. Final status contains only seven scoped frontend source/test files and these two working documents. No backend, API, schema, route, dependency or lockfile changes. Build output is ignored at `frontend/dist/`; Vite reported its existing class of large-chunk warning (largest application JS chunk 3,485.42 kB before gzip). No lint script exists.
- The synthetic browser and Vite server were closed. Temporary baseline copies, test configuration, logs, screenshots and Vite cache under `/private/tmp/lisno-client-table-mspwnpgt` were removed after recording evidence here. No real account, customer or backend data was used for browser QA.
- Full frontend, backend and OCR suites were not run; verification focused on changed presentation and Client compatibility. No migrations, seeds, commits, pushes, deployments, email or production writes were performed. The eight baseline enterprise failures and bundle-size warning remain outside this UI request.
