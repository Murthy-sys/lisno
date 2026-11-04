# App-wide content density implementation plan

Date: 2026-11-03
Status: Implemented and locally verified in approved Mode A; full-suite baseline failures remain documented below.
Specification: [Full-width, compact content layout across all web roles](../specs/2026-11-03-workspace-content-density-design.md)
Approval evidence: The user approved the specification, then approved this task plan, then selected “A” for parallel sub-agent execution.

## Outcome and boundaries

Make every authenticated workspace use its available width, reduce wasted top space and action spacing, and expose more useful content. Apply the approved specification to all roles, including alternate messaging and Configuration layouts, direct routes, and authorized `/home` landing pages.

Use the existing shell, typography, colors, UI primitives and responsive conventions. Preserve functional inner widths for prose, forms, dialogs and document previews. Keep normal pages naturally scrolling; reserve bounded panes for workspaces that need them. Do not change APIs, permissions, financial values, saved-estimate behavior, approval rules or navigation destinations.

No dependencies, lockfile changes, backend/OCR changes, public-page redesign, migrations, production writes, commits, pushes or deployment are planned.

## Current source evidence

- `styles/shell.css` caps direct workspace children at 90rem and Client children at 72rem. `components/layout/common-shell.css` adds 24px top padding beneath a 72px toolbar and separately caps Procurement at 1160px.
- `components/ui/PageHeader.tsx` and `styles/primitives.css` render several heading rows, including a full-row breadcrumb. Existing control tokens already support 32px compact, 36px default and 44px touch targets.
- `components/layout/AppShell.tsx` renders messaging with different shell/main classes. Configuration backdrop offsets depend on the toolbar height. These need explicit integration with the shared contract.
- Client quotation has its own heading beneath the project quotation page header, generous repeated padding, and a capped item pane. Staff estimation already has compact styles and remaining-height measurement.
- `app/routeRegistry.ts` and `app/router.tsx` establish the route inventory below. The router also mounts project, task, review and procurement content inside page families. Inspect those embedded workspaces as part of their owning family.

These are source findings, not browser measurement results. Capture actual before/after geometry during execution.

## Route and layout coverage inventory

Every listed family must be checked against the shared contract. A family that needs no local edit still requires recorded coverage. Route guards remain unchanged; use only identities authorized for each route.

| Family and roles | Authenticated routes / entry points | Layout and integration targets | Owner |
| --- | --- | --- | --- |
| Shared landing and system states | `/home`, `/access-denied`, authenticated unmatched route; `/` redirects | `AppShell`, `WorkspaceTopbar`, `PageHeader`, `RoleLanding`, task/KPI panels, mobile navigation and overlays; verify `/home` Project Manager redirect to `/execution` | Primary |
| Client | `/client`, `/client/projects/:projectId` | `ClientDashboard`, `ClientProject`, Client dashboard/workflow styles, embedded quotation and review sections | A |
| Shared quotation | `/projects/:projectId/quotation`, Client and Designer | `ProjectQuotationWorkspace`, `ClientQuotation`, `EstimateBuilderShell`, approval/pending-edit notices | A |
| Sales estimation | `/estimator-sales`, `/estimator-sales/leads/:leadId`, `/estimator-sales/leads/:leadId/estimate`; authorized Designer deep links | Lead dashboard/detail, estimate workspace, basket/item controls, `estimator-dashboard.css` | A |
| Designer | `/designer`, `/designer/design-plans`, `/designer/projects/:projectId` | Dashboard, design-plan task page, project workspace; Designer page styles | B |
| Design management | `/manager`, `/manager/designers/:designerId`, `/manager/projects/:projectId`, `/head`, `/head/designers/:designerId`, `/head/projects/:projectId` | Manager/head dashboards, designer detail and management project workspace | B |
| Administration | `/admin/dashboard`, `/admin/projects`, `/admin/projects/:projectId`, `/admin/users` | Super Admin dashboard, Sales Manager project list/detail, user administration | B |
| Administrative review | `/admin/client-responses`, `/admin/client-responses/:roundId`, `/admin/design-approvals`, `/admin/access-requests`, `/admin/project-completion` | Queues, detail headers, filters and decision controls | B |
| Configuration | `/admin/configuration/estimation`, `/admin/configuration/estimation/items/:itemId`, `/admin/configuration/estimation/reusable-values` | Configuration page wrappers, item editor panes, backdrop and sticky offsets; preserve inner editors | Primary |
| Procurement | `/admin/procurement`, `/procurement`, `/procurement/projects/:projectId`, `/procurement/requests` | Role-specific dashboard/workspace, project gallery, basket/proposal workspaces, request list | C |
| Vendor directory | `/admin/procurement/vendors`, `/admin/procurement/vendors/:vendorId`, `/procurement/vendors`, `/procurement/vendors/:vendorId` | Shared directory/profile and staff KPI screens | C |
| Orders and approvals | `/admin/purchase-orders`, `/work-order-approvals` | Purchase orders, approval queue, contained wide tables and dialogs | C |
| Finance | `/finance`, `/finance/projects/:projectId`, authorized `/home` | Overview/project pages and financial panels; keep all amount semantics and inner readability limits | C; Primary owns `/home` composition |
| Project Manager and execution | `/execution`, `/projects/:projectId/execution`, `/projects/:projectId/estimations`, `/project-manager/leaderboard`, `/project-manager/bonus`; authorized worker `/home` | Project Manager dashboard/detail, operational pages, execution portfolio/project, worker task views | C; Primary owns `/home` composition |
| Vendor | `/vendor` | Assigned orders/work page and embedded execution panels | C |
| Self-service access | `/access-requests/mine` | Request list, form and status states | B |
| Shared messaging | `/project-messages`, `/projects/:projectId/messages` | Alternate app shell, conversation rail, message pane, composer, project chat layout and mobile navigation | Primary |

Standalone authentication, invitation acceptance, public Vendor KPI/induction/BOQ pages, printable output and PDF documents are outside this change. Shared styles must not inadvertently restyle those surfaces.

## Ownership and preservation

The initial worktree is dirty with the preceding shared-estimation implementation. The current source, including its untracked files, is the functional baseline. Never restore targets from `HEAD` or overwrite existing changes to simplify this work.

Before writers begin, the primary captures `git status --short`, relevant per-target diffs and recoverable copies of pre-existing untracked targets outside the repository under `/private/tmp/lisno-content-density-*`. Review those diffs before assigning a dirty target. Record the precise baseline path and eventual changed-path list in this plan's execution record.

Known dirty targets that overlap this plan include `ClientProject.tsx`, `ClientQuotation.tsx`, `clientQuotation.css`, `DesignerDesignPlanTasksPage.tsx`, `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, `styles/estimator-dashboard.css`, their related tests, router files and enterprise test fixtures. New shared estimate shell/navigation/workspace files also belong to that baseline. Backend quotation changes and all other unrelated dirty files must remain untouched.

Ownership below applies to presentation changes and relevant tests only. It does not authorize every file in a directory to change. At handoff, each writer receives an explicit file allowlist derived from its family inventory. New targets require coordination with the primary before editing.

| Owner | Exclusive responsibility and file boundaries |
| --- | --- |
| Primary | Plan/spec execution records; `components/layout/`; `components/ui/PageHeader.tsx`, `Button.tsx` and affected shared UI tests; shared `styles/global.css`, `shell.css`, `primitives.css`, `role-themes.css`, `index.css`; router/registry and shared enterprise fixtures if presentation verification needs an update; `features/messages/`; Configuration page layout in `features/ai-estimator-knowledge/`; shared KPI/task components and any shared viewport-measurement helper. Route authorization and API code remain unchanged. |
| A: Client and estimation | Presentation files/tests in `features/client/`, `features/estimates/`, `features/leads/`; `styles/client-dashboard.css`, `styles/estimator-dashboard.css`. Preserve calculation, query, save, recovery and navigation logic. Other owners request any shared estimate changes through A and the primary. |
| B: Administrative and design pages | Presentation files/tests in `features/admin/`, `features/designer/`, `features/manager/`, `features/projects/`, and the actual self-service access-page module identified in the baseline audit; `styles/admin-home.css`, `designer-home.css`, `designer-design-plans.css`. Shared review components outside these paths remain with their declared owner. |
| C: Operational pages | Presentation files/tests in `features/procurement/`, `features/vendor-basket-proposals/`, `features/finance/`, `features/project-manager/`, `features/site-manager/`, `features/execution/`, `features/vendor/`. Changes needed in shared `common-shell.css` go through the primary. Public Vendor pages are excluded. |

All writers must be told they share a worktree: preserve others' edits, do not revert unrelated changes, and coordinate cross-boundary needs. The primary owns global selector decisions and resolves shared dependencies before integration.

## Dependency-ordered tasks

Maintain one parent task in progress. T3 is one parent with independent child slices. No task below begins until plan approval and execution-mode selection.

### T1. Freeze the baseline and map layout exceptions

Owner: Primary. Dependencies: implementation authorization. Acceptance: AC1, AC4, AC8, AC9, AC10.

1. Capture the dirty-work baseline and inspect overlapping diffs before any assignment.
2. Map each inventory family to its outer wrapper, shared header use, page caps, extra top padding, fixed/minimum height and overflow containers. Identify embedded views that repeat the parent header.
3. Distinguish whole-page constraints from intentional inner widths. Record functional exceptions explicitly; do not remove widths by search-and-replace.
4. Capture synthetic before-state examples for Client home/project/estimate, staff estimation and representative staff dashboards/list-detail pages. Measure content bounds and first visible rows at matched viewports.
5. Reuse the local test transport and synthetic browser fixture approach where suitable. Do not seed, call live production mutations, expose personal data or add dependencies. Keep temporary browser fixtures/captures outside tracked product sources and remove temporary entry files when done.
6. Run focused shell/header/estimation baseline tests and retain exact results. Use previous verification reports as context only, not proof of the current baseline.

Deliverable: baseline evidence, per-family exception inventory and exact writer allowlists.

### T2. Implement the shared workspace contract

Owner: Primary. Dependencies: T1. Acceptance: AC1, AC2, AC3, AC5, AC6, AC7.

1. Make outer workspace children fill the available column; replace role-specific page caps with shared gutters of approximately 12px desktop and 8px narrow, and an 8px default top inset, respecting safe areas.
2. Compact the global toolbar toward 56px plus safe area. Keep account, notifications, critical actions and mobile navigation usable. Let genuinely wrapped/zoomed content expand without overlap; align grid rows and dependent offsets with the real height.
3. Compact the shared PageHeader identity/action layout. Put back navigation, title, short status and actions together where space allows. Preserve heading semantics, accessible names and meaningful metadata; do not globally hide descriptions or status notices.
4. Reuse existing compact/default button tokens and 4–8px action gaps, preserving 44px touch targets on coarse/narrow layouts. Avoid blanket descendant selectors and body-font reduction.
5. Reconcile alternate messaging shell sizing, safe areas, composer visibility and Configuration backdrop/sticky offsets. Keep normal document scrolling and bounded-workspace scrolling deliberate.
6. If needed, extract existing remaining-height measurement into one shared helper owned by the primary before A consumes it. Prefer CSS where sufficient; preserve cleanup, zoom/visual viewport behavior and stable editor mounting.
7. Update existing shared layout expectations intentionally, including the AppShell test that currently expects the old Client width cap. Add interaction or geometry coverage only where it protects an actual behavior.

Deliverable: settled shared layout contract and compatibility smoke checks. Communicate it to all page owners before their edits.

### T3. Reconcile all page families

Dependencies: T2. Acceptance: AC1–AC9. Mode A may run A, B and C in parallel with the primary handling its remaining shared integration targets. Mode B performs the same slices sequentially in the primary thread.

**A. Client and estimation**

- Reduce decorative Client dashboard/project header height and duplicate wrapper padding. Preserve project identity, review sections, statuses and navigation.
- Consolidate project quotation and inner quotation heading/action presentation without removing saved-total or visible-subtotal context, pending-edit alerts or approval blocking.
- Use remaining item-space height and compact row-based fields on desktop, with usable mobile reflow. Preserve room/basket selection, item add/remove controls, confirmations, save-and-return and focus.
- Keep Designer quotation read-only and configured Client visibility/editability intact. Do not change save payloads, financial math, state keys or persistence hooks for layout reasons.
- Verify at least three simple included rows visible at 1440×900 and one simple editable item visible at 390×844 without initial scrolling in the clean synthetic example.

**B. Administrative and design pages**

- Remove conflicting outer page caps, repeated padding and oversized decorative headers across the assigned route families.
- Reflow title, status, filters and actions compactly without dropping required information or business actions.
- Preserve readable inner project/detail content, review controls, dirty forms, pagination and selection state. Verify both dashboard and direct detail routes and relevant access-request states.

**C. Operational pages**

- Reconcile Procurement dashboard/project wrappers, vendor directory, basket/proposal workspaces, order and approval queues, Finance pages, Project Manager/execution pages and Vendor work.
- Keep intentional table overflow contained and keyboard accessible, preserve financial inner layouts and maintain chart/image aspect ratios.
- Compact operational headers/action bars while preserving filters, tabs, actionable pending states, table final rows, dialogs and narrow-screen controls.

**Primary integration targets**

- Finish messaging and Configuration page-specific reconciliation, role landing/task/KPI layouts and shared access-denied/not-found states.
- Handle shared-file requests centrally. Check that page-specific styles do not override the settled contract or leak into public pages.

Deliverable: every inventory row marked inherited-and-verified, locally-adjusted-and-verified, or an explicitly justified functional exception. No family may be silently omitted.

### T4. Integrate and resolve responsive/state defects

Owner: Primary. Dependencies: all T3 writers finished. Acceptance: AC1–AC9.

1. Inspect the integrated diff against the pre-layout baseline; preserve all preceding estimation work. Check for broad selectors, duplicated overrides, unintended remounts and discarded information.
2. Run the rendered matrix below on the integrated result, recording computed widths/top offsets and interaction results, not screenshots alone.
3. Resolve layout defects in the responsible slice. Retest changed interactions after fixes; do not broaden business scope to repair unrelated historical failures.
4. Reconcile the route inventory with the actual router and registry again, including aliases, nested project workspaces and authorized role variants.

Deliverable: integrated implementation and matched before/after evidence for the acceptance criteria.

### T5. Independent integrity review

Owner: `integrity_reviewer` in Mode A; primary in Mode B. Dependencies: T4. Acceptance: AC1, AC5–AC10.

Read-only review of the complete change: role coverage, CSS scope and precedence, accessible controls, scroll/focus behavior, responsive topbar offsets, estimate state continuity, visible totals and approval guards. Confirm no permission, API, calculation or persistence changes slipped into this presentation task. Resolve confirmed findings before final verification.

### T6. Final verification and handoff

Owner: `verification_runner` in Mode A after writers/review fixes finish; primary in Mode B. Dependencies: T5. Acceptance: AC1–AC10.

Run the checks below on the stable integrated worktree. Report exact results, existing baseline failures, unrun checks, remaining risks and temporary artifact paths. Do not claim completion if required role/layout checks remain unverified. Remove temporary in-repository QA entries and stop only locally started test servers. Do not stage, commit, push or deploy.

## Verification matrix

| Coverage | Required evidence | Acceptance |
| --- | --- | --- |
| Route/role coverage | Every inventory family checked; actual authorized variants for Client, Sales, Designer, Sales Manager, Super Admin, design management, Procurement, Finance, Project Manager, workers, Vendor and shared messaging. Direct project/detail routes plus authorized landing aliases. | AC1, AC9 |
| Width and top spacing | Browser geometry at 1440 and 1920 confirms outer content fills main-column width minus gutters, with no old whole-page cap. Clean normal pages start within 8px below the real toolbar. | AC2, AC3 |
| Useful content | Matched before/after Client home/project/estimate and staff captures with the same synthetic data, viewport and UI state. Explicit visible-item counts for 1440×900 and 390×844 quotation examples. | AC4 |
| Responsive matrix | Representative page from every distinct layout family at widths 390, 768, 1024, 1440 and 1920; inspect all route-specific exceptions at desktop and narrow width. Check 200% browser zoom/text behavior on shared shell, estimation, messaging and dense operational screens. Record actual viewport heights. | AC2–AC7, AC9 |
| Scrolling and overlays | Last row reachable; no competing scroll panes or unintended document overflow. Check drawer/dialog, mobile navigation, notifications/account menu, chat composer, bounded estimate footer, focused inputs and narrow visual viewport/keyboard behavior. | AC5–AC7 |
| Accessibility | Keyboard navigation, focus visibility/return, meaningful heading and accessible control names, long labels, 44px coarse/narrow targets; axe on representative normal, estimate, Configuration and messaging surfaces. Automated results supplement manual interaction checks. | AC6, AC7, AC10 |
| State coverage | Loading, empty, populated, error/stale and read-only examples where applicable. Header alerts may grow naturally; verify no clipped retry controls, approval warnings or hidden save status. Monitor console and unexpected request failures. | AC5, AC8, AC9 |
| Estimation continuity | Saved data, configured visible items, Designer read-only state, quantity/mode edits, save-and-return, main-line/sub-basket removal and re-addition, unsaved-navigation guard, failed/stale/unknown-save recovery, pending-edit approval block. Reuse existing regression tests and exercise consolidated controls in-browser. | AC8 |
| Public-surface isolation | Authentication/public Vendor page smoke checks if any shared primitive changes affect them; no public-layout redesign. | AC1, AC9 |

Use synthetic projects and users. Read-only role cases must not render editing actions. Where responsive emulation cannot reproduce a real soft keyboard, report that limitation explicitly instead of claiming physical-device validation.

## Commands and failure handling

Start with focused tests, then run the full frontend lane because shared shell/primitives affect the entire application:

```sh
cd frontend
npm test -- src/components/layout/AppShell.test.tsx src/components/ui/PageHeader.test.tsx src/components/ui/Button.test.tsx src/components/ui/foundationAccessibility.test.tsx
npm test -- src/features/client src/features/estimates src/features/leads/LeadEstimateWorkspace src/features/leads/ConfiguredEstimateBuilder.test.tsx
npm run typecheck
npm test
npm run build
```

Also run focused tests for locally changed role modules during their slices, then relevant router/enterprise-fixture checks if those files change. Browser validation uses the existing local app and synthetic test transport; no live customer writes.

At repository root:

```sh
git diff --check
git status --short
```

There is no repository lint script; do not report lint as passed. Backend and OCR runs are not required for this frontend presentation scope. If an unexpected dependency would require changing those boundaries, stop that dependency and reconcile scope before editing.

The previous estimation session reported unrelated frontend test failures, notably Ask Lisno and Knowledge screens. Historical counts are not current verification. For any final failure, retain the actual command/output and reproduce the relevant case against the preserved pre-layout baseline when necessary. Fix regressions introduced here; report verified pre-existing failures separately. Do not repeatedly rerun the full suite once results are established unless a relevant fix or new uncertainty justifies it.

## Execution record

- Specification approved: yes.
- Task plan approved: yes.
- Execution mode: A, parallel sub-agents.
- Parent task: T1–T6 finished. No implementation or verification task remains in progress for this layout scope.
- Baseline: `/private/tmp/lisno-content-density-baseline/` contains initial status, binary diff and full frontend source archive including prior untracked estimation files.
- Initial focused checks: shared shell/UI plus quotation, 6 files/88 tests passed; Client pages, 4 files/38 tests passed; admin/design/access, 10 files/162 tests passed; operational pages, 10 files/201 tests passed. Some checks overlap; these are individual lane results, not a combined unique-test count.
- Read-only slice audits and all three writers completed. B additionally owned `styles/access-administration.css` and `styles/client-responses.css`. The primary owned shared shell, messaging, Configuration and final integration. A owned the shared estimate height helper and its geometry tests after explicit ownership transfer. The primary made the final mobile launcher sizing fix in `styles/role-themes.css`.

### Final implementation and preservation

- The outer frame uses the available column, 12px desktop/8px narrow gutters and an 8px top inset. The normal toolbar is 56px and measures its actual expanded height for dependent offsets. Shared headings place identity and actions together when space permits.
- All route families were reconciled with the shared frame. Whole-page caps and repeated insets were removed; readable inner forms, document previews, dialogs and horizontally scrolling tables retain their functional limits. Bounded standalone estimate/messaging workspaces and naturally scrolling embedded project content remain distinct.
- Client and Sales dashboard headers and quotation identity/actions were compacted. `EstimateBuilderArea` shares remaining-height measurement, observes header changes and preserves a stable editor. Client quotation controls wrap at enlarged text sizes and retain 44px narrow-screen targets.
- No API, permissions, finance calculation, save payload or backend/OCR change was introduced by this layout task. No dependencies or lockfiles changed. The previous shared-estimation work remains in place.
- Exactly 57 frontend source/test files differ from the captured pre-layout source. The complete task-only patch and path inventory are `/private/tmp/lisno-content-density-baseline/layout-only.patch` and `layout-paths.txt`. The existing backend binary diff was compared with the initial archive and is unchanged.

### Rendered coverage and acceptance evidence

The browser used local Vite plus synthetic users/projects and intercepted API responses. It made no customer or production writes. The harness imports production styles in the same order as `main.tsx`; early captures made before that correction are superseded by the production-style matrix and matched captures.

| Acceptance | Final evidence |
| --- | --- |
| AC1, AC9: role and route coverage | 21 representative route families at 390, 768, 1024, 1440 and 1920px, 105 production-style geometry checks. Additional direct-detail/landing matrices covered administration/design management, operational pages, all six worker aliases and shared system/access pages at 390 and 1440px. No final unintended document overflow or runtime JavaScript error. |
| AC2, AC3: available width/top space | At 1440px, normal content width increased from 1152px to 1176px; at 1920px it uses 1656px beside the navigation. Normal content begins at y=64 beneath a 56px toolbar, versus y=96 desktop/y=88 mobile before. Mobile gutters decreased from 16px to 8px. |
| AC4: useful content | Matched synthetic Client quotation at 1440×900 shows three complete included rows instead of one. At 390×844 it shows one complete editable row instead of zero, with 44px controls. Client home content height decreased from 706px to 566px and project content from 905px to 714px in matched desktop examples. |
| AC5: height/scrolling | Independent review found document scrolling enlarged the estimate pane and a wrapped toolbar could leave its footer clipped. Both were corrected. Exact reproduction now keeps the pane at 628px through a 173px document scroll, leaves review content reachable, and reduces the pane to 572px when the toolbar expands to 112px; footer bottom remains 878.9px within a 900px viewport. Embedded quotation uses document scrolling. |
| AC6: accessibility/controls | Axe reported zero violations on Client quotation, Admin projects, Configuration item, messaging, Finance and user administration. A narrow table accepts keyboard focus and ArrowRight scrolls it; Escape closes mobile navigation and returns focus to its opener. Account actions remain accessible. Narrow Client and sampled staff action targets are 44px. |
| AC7: responsive/enlarged text | Five-width route matrix plus 200% root text-size checks at 390/1440px on Client, Configuration, messaging, Finance and Admin. Final Client navigation wraps cleanly into three rows at 200%, remains one 44px row normally, and its labels do not overflow. Mobile Ask Lisno launcher remains 44px instead of expanding over content. |
| AC8: estimate continuity | In-browser quantity edit survives resize; save-and-return opens Main Baskets and returning preserves the saved quantity. Failed synthetic save preserves the edit/version. Unsaved-navigation alert supports Keep editing. Confirmed sub-basket removal excludes Kitchen lines while preserving Bedroom; fixture reset afterward. Designer quotation remains read-only. Focused tests cover configured visibility, scoped edits, save/error/stale/unknown-save handling, approval guards and navigation. |
| AC9: states/public isolation | 18 loading/empty/error checks across six families, populated routes, and Designer read-only coverage. Messaging error retry renders after its retry interval. Login and public Vendor KPI smoke checks show no document overflow. |
| AC10: verification | Independent integrity review closed both geometry findings and found no additional defects in the final CSS fixes. Exact automated results are below. |

Route-family disposition: shared landing/system pages, Client, shared quotation, Sales, Designer, design management, administration, administrative review, Configuration, Procurement, vendor directory, orders/approvals, Finance, Project Manager/execution, Vendor, self-service access and messaging were all checked. They either received local reconciliation in their assigned files or inherited the verified shared frame. The final Admin procurement synthetic project-list fixture was corrected and its actual populated content rechecked at 390/1440px; earlier fixture error captures are superseded. Table scrolling, inner readable forms, dialogs and document previews are intentional exceptions to full-width inner content, not exceptions to the outer frame.

Browser evidence is stored in `/private/tmp/lisno-content-density-baseline/browser-evidence.json`, with matched `*-production-before.png` / `*-production-after.png` and final screenshots in the same directory. This file retains intermediate records as well as the corrected matrices; the final successful rechecks and this record take precedence over fixture-only failures.

### Final automated verification

Commands ran in `frontend/` unless stated otherwise. Individual lanes overlap and must not be added as a unique test total.

| Check | Result |
| --- | --- |
| Focused shared shell/header/button/accessibility, estimate helper/shell/workspace | 7 files, 75 tests passed. |
| `npm run typecheck` | Passed. |
| `npm test` | 398 files: 390 passed, 8 failed. 6,186 tests: 6,095 passed, 91 failed. |
| Exact eight failing files on preserved pre-layout checkout | 272 passed, same 91 failed. Failure-name multiset comparison matched all 91, with no new/current-only or baseline-only failure. |
| Final stable shared/Client/estimate/navigation focused lane | 20 files, 205 tests passed after all product fixes. |
| `npm test -- src/styles/tokens.test.ts src/auth/LoginPage.test.tsx` | 2 files, 38 tests passed after final CSS fixes. |
| `npm run build` | Passed, 3,306 modules transformed. Vite warns about chunks exceeding 500kB; main JS 3,195.03kB (878.02kB gzip), CSS 1,531.79kB (213.53kB gzip). |
| `git diff --check` and final status inspection | Passed; unrelated and preceding estimation work preserved, temporary QA entries removed. |

The full-suite run preceded the last two CSS-only fixes; the 205-test and 38-test focused lanes and production build ran afterward. Full-suite failures are AskLisnoLauncher (34), KnowledgeModeSectionStateRemoval (31), KnowledgeScreens (16), KnowledgeItemWorkspaceLayout (4), enterpriseTransport (3), KnowledgeModeLayout (1), EstimateReviewPanel.collapsible (1), and ProposalWorkspace (1). These were not repaired because they reproduce exactly before this layout task. Both baseline/current runs report the existing unmatched KnowledgeScreens basket-request handler. The suite is not fully green.

Exact command output is retained under `/private/tmp/lisno-content-density-final-*.log`, including `tests.log`, `baseline-failures.log`, `baseline-comparison.log`, `focused-stable.log`, `typecheck.log`, and `build.log`. Slice checks also passed: Client/estimation 163 tests, Admin/design 581 tests, and operations 201 tests; these overlap with final verification.

### Cleanup, limits and external actions

- Task-created `frontend/output/playwright/density/` and task browser logs were archived under `/private/tmp/lisno-content-density-baseline/browser-harness/` and `browser-logs/`, then removed from the repository. The two task-started Vite servers were stopped and the task browser page closed.
- Standard ignored build/typecheck outputs were generated at `frontend/dist/` and `frontend/node_modules/.tmp/`. They are not deliverables or staged changes.
- Checks used desktop browser responsive emulation and a 200% text-size simulation. Actual browser zoom, physical mobile soft keyboards and a multi-browser/device lab were not exercised. Geometry/cleanup tests cover visual-viewport events; no physical-device claim is made.
- Backend, replica-set, OCR and migration checks were unnecessary for the frontend-only layout scope and were not run. No lint script exists. No seeds, migrations, production writes, commits, pushes or deployment were performed.
- Remaining risks are the reproduced baseline test failures, the existing large-bundle warning, and the device-validation limits above. The requested layout scope has no outstanding implementation work.

## Follow-up: Client project top content

The user's screenshot shows the v3 project page still places an expanded, empty requirements panel, duplicate indicative total/review guidance and coordination ahead of the saved quotation. This is an unmet portion of the approved compact-header/useful-content requirements, not a new workflow or permission change. Prior Mode A remains in effect.

- Status: complete. The saved quotation follows the compact project header; first-estimate entry and requirement drafts remain available.
- Baseline: `/private/tmp/lisno-client-project-top-cleanup/` contains initial dirty status/diff and target source copies.
- Primary owns `ClientProject.tsx`, `ClientEstimateRequirements.tsx`, their focused tests, `clientWorkflow.css`, `clientEstimateRequirements.css`, integration and this record. Reuse one compact project identity/actions row; remove duplicate Open estimation/Overview controls from this already embedded view. Keep Messages, Project status and real critical alerts. Move v3 requirements and coordination after the primary estimate.
- Messaging implementer owns only `ProjectChatHeader.tsx` and focused navigation tests: add an opt-in Client-project presentation, preserve overview registration/back-navigation, hide the redundant active Overview link and fresh zero-critical badge, retain nonzero counts, errors, unread information and status access. Existing consumers keep their defaults.
- Requirements use an opt-in compact disclosure: open before an estimate exists; collapsed once an estimate exists; preserve any active draft/in-flight work, including refresh and collapse/reopen. Inside it, remove duplicate total/phase/explanatory copy and use concise truthful review guidance. Existing legacy v2 presentation remains unchanged. No new query/persistence contract or automatic mutation.
- Verification: focused Client project/requirements/quotation and shared navigation tests; independent integrity check; frontend typecheck/build and rendered desktop/mobile checks of the actual embedded project route with synthetic data. Check first-estimate entry, saved-estimate priority, requirement-draft preservation, status/critical-message access and keyboard/accessibility. No live data writes or deployment.

### Follow-up verification and handoff

- Integrated focused command from `frontend/`: `npm test -- src/features/client/ClientProject.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientEstimateRequirements.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx src/features/client/ClientQuotation.test.tsx src/features/messages/ProjectChatHeader.test.tsx`. Passed: 113 tests across 6 files. Covers saved/first-estimate placement, mounted draft collapse/refetch, legacy behavior, approval workspace, zero/nonzero/stale/denied chat summaries and navigation registration.
- `npm run typecheck`, `npm run build` and root `git diff --check` passed. Build retains its existing large-chunk warning. Initial accessibility check exposed an invalid name on the requirements list container; adding its group role resolved it. Independent integrity review found no confirmed defects.
- Rendered the actual Client project route with synthetic transport at 390×844, 768×1024, 1280×720 and 1440×1000. Inspected screenshots and exercised keyboard opening of requirements and collapse/reopen with unsaved text. Draft text persisted and no mutation requests were made. No horizontal page overflow or runtime errors; axe reported zero violations at 390, 768 and 1440 with 200% text. The 1440 viewport project header measured approximately 57 px high, with the quotation starting at approximately 144 px from the viewport top.
- Evidence, test/build logs, source baselines, temporary harness and screenshots are archived under `/private/tmp/lisno-client-project-top-cleanup/`. Temporary harness/screenshots/logs were removed from the repository, the isolated browser closed and task Vite port 5186 stopped. Standard ignored build outputs remain at `frontend/dist/` and `frontend/node_modules/.tmp/`.
- Source changes are restricted to the assigned Client project/requirements components and tests, their two CSS files, and shared project navigation plus tests. Compared tracked diff blocks to the initial baseline: no unrelated tracked diffs changed. No dependencies or lockfiles changed.
- Limits: synthetic browser data and desktop responsive emulation, not a live customer session or physical mobile device. The complete frontend suite, backend/replica-set and OCR lanes were not run for this presentation-only follow-up. No lint script exists. No seeds, migrations, commits, pushes, production writes or deployment occurred.
