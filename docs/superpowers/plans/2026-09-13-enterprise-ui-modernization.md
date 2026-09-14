# Lisno enterprise UI modernization — task plan

Date: 2026-09-13
Status: Implemented and verified; four documented baseline test failures remain

Source of truth: [Approved UI modernization specification](../specs/2026-09-13-enterprise-ui-modernization-design.md).

The user approved the specification, approved this task plan, and selected Mode A (parallel sub-agents). All workflow gates are complete. This document tracks execution of that authorization.

## Execution log

- Initial implementation HEAD: `61a38e9944b2d91d0d9e1a6810464c3563e1d7fb`; initial dirty paths: only this plan and its specification, both untracked. No application changes predated execution.
- Parent stages1–5 complete: implementation, integrity review, rendered checks and integrated verification recorded below.
- Baseline frontend typecheck passed. Baseline suite: 168 passed / 7 failed files; 2316 passed / 22 failed tests; 11 unhandled errors. Failures include existing missing IntersectionObserver test setup, stale authorization expectations, legacy layout expectations and missing lead UI expectations. Exact logs: `/tmp/lisno-enterprise-qa/baseline/`. These results are not final verification.

## Outcome and execution contract

Deliver the approved compact enterprise interface across all Lisno route families, with reusable controls and contextual right panels. Preserve the existing palette, fonts, logos, role-specific sidebar backgrounds, APIs, permissions, financial lineage, workflows and dedicated editing routes.

At plan creation, the only dirty path is the untracked specification above. Application sources are clean. Before implementation, refresh this baseline and record any new dirty target's existing diff before assigning its ownership. Do not stage or commit either document or application changes.

- Mode A: use native subagents only after the execution choice, with the ownership boundaries and dependency waves below. Tell every writer they share the worktree, must preserve others' changes, and must not edit outside their assigned paths.
- Mode B: the primary agent executes the same tasks, reviews and verification sequentially, without implementation subagents.
- Keep one parent stage in progress. Within that stage, independent child tasks may run concurrently in Mode A. Complete shared contracts before consumers migrate.
- The primary agent owns integration, shared contracts, shared styles, the coverage ledgers and final handoff. A worker requests a shared-file change rather than editing it.
- Implementation is authorized. No deployment, production mutation, seed, migration, real email delivery, dependency change, commit or push is included.
- If a task unexpectedly needs a backend contract or permission change, stop that slice, document evidence, and resolve the scope change before proceeding. Continue independent authorized work.

## Ownership boundaries

Paths are relative to `frontend/`. A directory assignment includes its colocated tests and styles, except the explicitly excluded API/domain helpers. New presentation helpers may be added within the assigned directory when reuse justifies them.

| Owner / lane | Exclusive write area | Boundaries |
| --- | --- | --- |
| Primary: shared foundation and integration | `src/components/**`, `src/app/**`, `src/main.tsx`, `src/styles/{global,tokens,base,primitives,shell,motion,brand,charts,role-themes,index}.css`, `src/styles/tokens.test.ts`, `src/test/**`, `qa/**`, root plan/spec | Owns shared component APIs, overlay lifecycle, theme propagation, global/legacy CSS and QA integration. Sidebar brand assets/colors are preserved. Build/config files only if the QA harness actually requires a scoped change. |
| Primary: shared workflow and review | `src/features/workflow/**`, `src/features/estimates/**`, `src/features/home/**` | Shared by many roles. Stabilize before leaf consumers migrate. Preserve request/response contracts and workflow selectors/calculations. |
| Primary: auth presentation | Page/view files and `login-page.css` in `src/auth/` | No credential/session/authorization behavior changes. Existing auth provider, guards, token vault and API contracts remain authoritative. |
| Administration lane | `src/features/admin/**`, `src/features/access/**`, `src/styles/{admin-home,access-administration,invitations,client-responses}.css` | Includes dashboard subdirectory and project initiation shared by Sales. No finance/workflow/shared-UI edits. Keep API/authorization contracts unchanged. |
| Design and management lane | `src/features/designer/**`, `src/features/manager/**`, `src/features/head/**`, `src/styles/{designer-home,designer-design-plans}.css` | Includes deadline/structure forms. Shared design canvas, task components, evaluation widgets and KPI widgets belong to primary. Preserve the designer rail gradient exactly. |
| Configuration lane | `src/features/ai-estimator-knowledge/**` | Presentation and panel adoption only; preserve payload builders, formula utilities, workbook processing, query synchronization, versioning and unsaved-change guards. |
| Sales lane | `src/features/leads/**`, `src/styles/{estimator-dashboard,estimate-delivery}.css` | Consume finalized admin initiation/shared preview components; no edits to them. Preserve estimate engine, API and export behavior. |
| Client lane | `src/features/client/**`, `src/styles/client-dashboard.css` | Consume finalized shared estimate/workflow/drawing components. No staff-only information or new access. |
| Finance and procurement lane | `src/features/finance/**`, `src/features/procurement/**` | Preserve finance/API/calculation semantics. Workflow assignment controls reused by admin keep compatible props. No edits to admin/workflow/shared files. |

Large legacy `src/styles/index.css` remains primary-owned throughout. Each lane reports the exact selectors and proposed density changes it needs there; the primary applies them during integration. Do not create a parallel override stylesheet to evade ownership. Feature-owned style changes must stay scoped and use shared tokens.

## Dependency graph and parent stages

| Parent stage | Tasks | Dependency / parallel policy |
| --- | --- | --- |
| 1. Baseline and foundations | T00 → T01 → T02 | Sequential shared ownership. Mode A may delegate bounded read-only source/UX audits during T00 while primary builds the synthetic QA harness. |
| 2. Shared consumer preparation | T03 | After T02. Shared workflows, review, previews and widgets settle before leaf work. |
| 3. Feature sweep | T04; Wave 1: T05, T06, T07; Wave 2: T08, T09, T10 | After T03. Mode A: at most three independent writers alongside primary; Wave 1 completes before Wave 2. Primary can perform T04 and integrate requested shared-style edits in this stage. |
| 4. Reconciliation | T11 → T12 | All writers finished. Primary integrates; then integrity review runs on a stable result. |
| 5. Final verification and handoff | T13 → T14 | Review fixes finished before final verification. Recheck affected areas after any fix; no completion claim with unresolved required checks. |

T08 additionally depends on T05's project-initiation form contract. All feature lanes depend on shared component APIs from T01–T03. Later changes to these APIs are primary-owned and communicated to all consumers before editing. Mode B follows task order T00–T14 inline.

## Tasks

### T00 — Capture baseline, complete inventories and prepare safe rendered coverage

Owner: Primary. Dependencies: implementation authorization. Acceptance: AC-01, AC-08, AC-09, AC-12.

1. Record current HEAD, dirty paths and relevant existing diffs. Confirm route inventory against `routeRegistry.ts` and `router.tsx`, including authentication, all nine dashboard tabs, role homes and standalone details.
2. Expand the route ledger below into exact routes, role/permission fixtures and representative data states. Expand each overlay source into individual call sites; one file may contain both an edit form and a destructive confirmation. Check reachability rather than migrating dead code blindly.
3. Establish synthetic browser coverage through actual `AppRoutes`/`AppShell`, the production style order and font links. Reuse existing `src/test/fixtures`, MSW, provider setup and `frontend/qa` conventions. Keep browser transport isolated: intercept local API reads/writes and fail unexpected requests, so no mock action reaches the proxied real backend.
4. Use a separate local QA origin/port or isolate and restore any synthetic session state. Never replace a user's real local session with a QA token. Do not add a production authentication bypass or test route to shipped navigation.
5. Capture desktop/mobile baselines with long labels and unequal projects; record computed sidebar `backgroundColor` and `backgroundImage` for every distinct role/theme and mobile navigation surface. Include designer's gradient, common/admin navy, and portal colors. Baselines must include actual AppShell, unlike the older isolated dashboard fixture.
6. Run the existing frontend typecheck/test baseline once. Record exact failures before changes; do not convert pre-existing failures into assumed passes or immediately repair unrelated behavior. Obtain a baseline build if feasible before the shared changes.

Exit: reproducible fixtures, route/overlay inventory and sidebar/theme evidence exist; known failures and environment limits are recorded. This task creates only local/test infrastructure needed for authorized implementation, not seed data.

### T01 — Normalize typography, spacing and shared controls

Owner: Primary. Dependencies: T00. Acceptance: AC-01–AC-04, AC-11, AC-12.

1. Update semantic density/type/control/panel tokens in `global.css`; reconcile aliases in existing foundations and role themes. Keep palette and font-family values intact. Retain root zoom and font scaling.
2. Bring page titles to 20–24px, section/card text to the approved scale, desktop controls to approximately 36px, compact row actions to 32px and touch targets to at least 44px. Keep mobile field text readable and avoid focus zoom.
3. Standardize Surface padding/radius/elevation, header layout, button hierarchy/loading stability, fields/help/errors, native choices, menus, comboboxes, tabs, disclosure and table patterns. Preserve API defaults unless a compatible additive variant is needed.
4. Replace oversized operational hero styling and repeated decorative effects in the existing source rules. Preserve auth imagery and sidebar backgrounds. Reconcile admin pill overrides and other feature exceptions through their assigned lane later.
5. Adjust shell content spacing and responsive constraints without changing navigation paths or visibility rules. Test the 767/768 and 1024 transitions for each affected role.
6. Update existing token tests for deliberately changed density values while retaining brand/color invariants. Prefer behavioral and rendered assertions to tests that only duplicate a selector or literal.

Focused verification: `npm test -- src/styles/tokens.test.ts src/components/ui src/components/layout`. Inspect actual controls, dropdowns, focus rings, text wrapping, numeric alignment, touch sizes and loading states in the QA fixture.

Exit: reusable components define the approved system and sidebar baseline values remain unchanged. Consumers can adopt a stable component contract.

### T02 — Extend Drawer for contextual content and safe lifecycle

Owner: Primary. Dependencies: T01. Acceptance: AC-05, AC-07, AC-09, AC-11.

1. Extend `Drawer.tsx` with a compatible contextual presentation: explicit right side, narrow/medium/wide sizes (360/480/720px targets), visible title/description/metadata, scrollable body and optional sticky footer. Keep current left navigation callers functioning.
2. Use existing portal/overlay infrastructure and ensure portalled controls inherit the correct role theme. Avoid duplicate overlay stacks. Handle background isolation, scroll-lock ownership, nested confirmations, initial focus, Escape/backdrop close and reliable focus fallback when the original row disappears.
3. Preserve busy dismissal rules. Provide one request-close path that feature forms can connect to their existing dirty/unsaved checks; do not embed business saves or mutations in Drawer.
4. Cover dynamic viewport height, safe areas, final-field visibility, mobile full-width behavior, long header text, footer actions and reduced motion. Ensure menus/tooltips and nested dialogs are not clipped or behind the panel.
5. Add meaningful regression coverage for topmost focus and Escape, background interaction prevention, focus restoration after row removal, rapid open/close, nested layers, busy and dirty dismissal, unmount cleanup and navigation Drawer compatibility.

Focused verification: `npm test -- src/components/ui/Drawer.test.tsx src/components/ui/Dialog.test.tsx src/components/ui/focus.test.ts src/components/layout/AppShell.test.tsx src/components/ui/foundationAccessibility.test.tsx`.

Exit: one stable contextual panel contract, demonstrated by a populated form and read-only detail fixture on desktop/tablet/mobile. No leaf modal conversion begins before this exit.

### T03 — Prepare shared workflows, document review and information components

Owner: Primary. Dependencies: T02. Acceptance: AC-03–AC-07, AC-09–AC-11.

1. Improve `components/kpi`, `components/charts`, MetricCard, DesignerCard and EvaluationForm density. Keep calculated KPI separate from evaluations; retain chart axes, legends, value tables, units and unavailable values.
2. Compact `features/workflow` stage/requirement/action presentation and `features/home` content. Preserve timer thirds, original/revised deadlines, approval stages, role-specific tasks and authoritative next-action rules. Convert bounded progress-update forms to the contextual panel.
3. Migrate `components/tasks` task update/design upload forms where suitable. Preserve payloads, attachments, version checks, loading/error state and query refresh behavior.
4. Review `components/design`, FilePreview, workflow document previews and `features/estimates` together. Use panels for useful contextual metadata/history/forms; preserve full-plan annotation, crop/section geometry and extensive approval review. Keep immutable approval confirmation dialogs.
5. Retain client project/estimate collapse behavior, selected-estimate navigation, Ask Lisno, protected file access, object URL cleanup and change-request annotation projection. Freeze shared props before feature lanes begin.

Focused verification: `npm test -- src/components/charts src/components/design src/features/workflow src/features/estimates src/features/home`; include task/KPI regression coverage through consuming designer/management tests. Exercise exact annotation/crop positioning and preview retry/close behavior in the browser when layout changes.

Exit: shared consumer contracts and important state handling remain compatible; overlay ledger has a disposition for every shared review/preview call site.

### T04 — Modernize authentication and global route states

Owner: Primary. Dependencies: T03. Acceptance: AC-01–AC-04, AC-08, AC-09, AC-11.

1. Apply compact controls and aligned field groups to login, signup, invitation acceptance, forgot/reset password and restoration/denied/error screens, retaining the current artwork and brand.
2. Keep password visibility, required/invalid descriptions, session restoration, safe return paths, token capture/cleanup and eligibility behavior unchanged.
3. Check empty/error/loading forms and narrow layouts. Use synthetic test identities; do not set or change real credentials through browser QA.

Focused verification: `npm test -- src/auth src/app src/App.test.tsx src/test/accessibility.test.tsx`. Inspect form focus, keyboard submit, invalid feedback and 200% zoom.

Exit: all authentication/state screens have specific audit evidence and no auth contract changes.

### T05 — Modernize administration, dashboard and access workflows

Owner: Administration lane. Dependencies: T03. Acceptance: AC-01–AC-11.

1. Improve all nine Super Admin dashboard tabs, preserving period controls, chart value tables, filter scope, pagination, partial/unavailable states, observation time and useful metric labels.
2. Compact project lists/details, user directory, invitations, client response queues/details, design approval queue and access-request pages. Reduce nested surfaces and align toolbars, numbers/statuses and row actions.
3. Add project/user/request quick views using existing authorized detail data; retain standalone links and a clear full-workspace action. Verify list-state retention and record-switching identity.
4. Move project initiation, invite/user edit, access request/review and other bounded forms into right panels. Keep lifecycle, revocation and irreversible/immutable confirmations as dialogs. In files mixing edit/confirmation content, classify each branch separately.
5. Preserve client-on-behalf proof and evidence, assignment restrictions, Super Admin immutability, invitation preflight feedback and version/CAS checks. Preserve `AdminProjectDetailPage`'s expected approved-finance source.
6. Share the stable `AdminProjectInitiationDialog` interface and behavior with Sales before T08. Report requested shared-style changes to primary.

Focused verification: `npm test -- src/features/admin src/features/access`; check initiation from admin and Sales entry points, list/detail links, denied quick views, invitation errors and critical confirmation focus. These are intercepted test mutations, not real access grants or email sends.

Exit: every admin/access route and dashboard tab has an audit result and its dialogs have recorded dispositions.

### T06 — Modernize design, management and organization workspaces

Owner: Design and management lane. Dependencies: T03. Acceptance: AC-01–AC-11.

1. Compact designer dashboard, plan-task queue and project workspace, then manager/head teams, organization hierarchy, designer detail and management project views.
2. Pair relevant fields and summaries; use PageHeader/shared controls in legacy headers and forms; keep full design workspaces and meaningful inline expansion.
3. Add contextual designer/task/project quick review where existing authorized data supports it. Convert project create/structure forms when their content fits and deadline-rationale editing to panels; do not compress drawing canvases or hide structure validation.
4. Preserve the designer sidebar gradient, visible workload/risk information, separately attributed evaluations, original deadline and required revision reason, task upload/submission and CAS behavior.

Focused verification: `npm test -- src/features/designer src/features/manager src/features/head`; inspect designer and manager/head role themes at desktop/mobile and organization expansion/search/quick-view return focus.

Exit: all design/management/head routes have evidence, shared contracts remain compatible and no deadline/KPI logic changed.

### T07 — Modernize estimation configuration and its sub-editors

Owner: Configuration lane. Dependencies: T03. Acceptance: AC-02–AC-11.

1. Compact the basket/Main Line index, full item workspace and reusable-value management. Preserve section navigation, active/draft identity and useful descriptions.
2. Improve mode/specification/budget/quantity/surface/quality layouts, calculation tables, repeated field groups, status and pending-change summaries. Keep related short controls together without compressing complex builders.
3. Convert bounded create/edit/quick-add, master/surface/basket forms, quality prompt/import review and calculation simulators to contextual panels. Retain full Main Line editing and lifecycle/discard/conflict confirmations.
4. Preserve dirty-state protection across close/Back/navigation, failed-save retention, quality import validation, archive redirect, stable IDs, reusable-value selections and conflict reload/retry semantics.
5. Do not alter calculation/paise/rupee behavior, payload builders, workbook parsing or domain logic to accommodate presentation. No new packages or lockfile edits.

Focused verification: `npm test -- src/features/ai-estimator-knowledge`. Inspect long form sections, nested quick-add, import error/conflict, responsive mode tables and touch controls. Reuse existing surface fixture but also render it through the production shell/theme.

Exit: every configuration screen and overlay is accounted for, with unsaved/conflict/import/calculation behavior verified.

### T08 — Modernize Sales, lead details and estimate workspace

Owner: Sales lane. Dependencies: T03, T05; Wave 2. Acceptance: AC-02–AC-11.

1. Improve lead/saved-estimate lists, summary row, toolbar and status/actions. Replace raw holdout controls and the unnecessary full-width follow-up button.
2. Add contextual lead review while preserving `/estimator-sales/leads/:leadId`, activity/history, standalone estimate links and successful initiation navigation.
3. Compact estimate workspace headers, rooms/scopes, dimensions, line items, totals, drawing uploads and delivery feedback without changing estimate calculations or publication semantics.
4. Convert assignment, drawing history and bounded replacement/correction forms to panels. Retain crop/annotation/full document workspaces and deletion confirmations; classify each `EstimateDesignUploads` dialog individually.
5. Reuse the admin-owned initiation panel and primary-owned preview/workflow components. Preserve query invalidation, data scope, download/export and retry behavior.

Focused verification: `npm test -- src/features/leads`; add behavioral coverage for lead follow-up/quick-view if the current suite lacks it. Check estimate PDFs/download initiation through test transport, not remote delivery.

Exit: Sales list/detail/builder and all drawing utility interactions have been reviewed beyond shared token inheritance.

### T09 — Modernize client project and review surfaces

Owner: Client lane. Dependencies: T03; Wave 2. Acceptance: AC-01–AC-11.

1. Compact client dashboard/project summaries and cards, retaining useful collapsible sections, next actions, approved file identity and progress.
2. Provide contextual project/section metadata and change-request forms where appropriate, while retaining dedicated project/full-plan review and immutable approval confirmations.
3. Preserve selected-estimate deep links, client-visible/approved restrictions, clear partial-error/retry states, Ask Lisno and all existing review actions.
4. Verify client quick views do not fetch or display staff-only detail and that failures never fabricate a count, approval or financial value.

Focused verification: `npm test -- src/features/client src/features/estimates`; exercise project expansion, approval/change-request entry points, full-plan navigation and focus restoration using client-scoped data.

Exit: client dashboard and project/review journeys remain complete and readable at desktop/mobile widths.

### T10 — Modernize finance and procurement surfaces

Owner: Finance and procurement lane. Dependencies: T03; Wave 2. Acceptance: AC-02–AC-11.

1. Compact portfolio/project summaries, ledgers, purchases, estimate sections and document/action controls; retain full finance/procurement routes and necessary detailed workspaces.
2. Use contextual ledger/purchase detail and bounded cost/purchase/progress forms where helpful, preserving entered values on failure and existing mutation semantics.
3. Preserve approved baseline versus live values, net/GST separation, cost classification, ledger overheads, posted/remaining amounts, incomplete-data states, payment confirmation and worker-assignment authority.
4. Keep document controls protected and purchase sections collapsed as established. Report shared legacy CSS changes to primary and keep exported component props compatible with admin/workflow consumers.
5. Check two unequal projects and distinct approved versions through portfolio, detail and embedded admin finance. Verify differing grants and denied states; do not implement local totals from partial pages.

Focused verification: `npm test -- src/features/finance src/features/procurement src/features/admin/AdminProjectDetailPage.test.tsx`. Extend tests only where changed interaction or financial presentation introduces an uncovered regression risk.

Exit: finance/procurement UI changes are verified against existing authoritative values, and no financial or permission logic changed.

### T11 — Reconcile all screens, overlays and CSS

Owner: Primary. Dependencies: T04–T10 complete. Acceptance: AC-01–AC-12.

1. Wait for all writers, review their diffs and resolve shared-style requests in the owned foundation/legacy files. Reconcile remaining raw control and typography holdouts in their source rules.
2. Re-run the route and overlay inventory. Every ledger row must have implementation evidence or a specific verified-compliant/retained reason. All current Dialog call sites must be accounted for, including mixed-content branches.
3. Reconcile sidebar computed backgrounds against baseline for every distinct role and mobile surface. Verify portal theme, action hierarchy, dense tables/forms, informative visuals and responsive content flow.
4. Exercise cross-lane flows: Sales/admin initiation, manager estimate review, client estimate/drawing review, admin embedded finance/assignments, worker/procurement home queues and configuration nested editors.
5. Review diff for unintended API/formula/payload/permission/token/assets/lockfile changes. Preserve existing mutation invalidation and stable identity throughout extracted components.

Exit: one integrated implementation and completed coverage/disposition ledgers, ready for independent integrity review.

### T12 — Review integrity and resolve confirmed findings

Owner: Mode A `integrity_reviewer` after writers finish; primary performs the same audit in Mode B. Dependencies: T11. Acceptance: AC-07, AC-09, AC-10, AC-12.

Read-only review of the integrated diff for unauthorized fetches, stale-record disclosure, query invalidation, modified payloads/versions, finance lineage/units, workflow/approval safeguards, upload cleanup, dirty-state loss, nested focus and scroll cleanup. Use asymmetric projects/identities and examine shared consumers, not just the edited form.

Primary triages findings and assigns any corrections to their original owner or implements them inline as required by mode. No verification agent runs against concurrent writes. Re-review corrected sensitive areas before final checks.

Exit: no unresolved confirmed correctness/authorization/data-loss regressions; any scope or environment limit is explicit.

### T13 — Run integrated functional, visual and accessibility verification

Owner: Mode A `verification_runner` on the stable worktree, with primary-owned browser/fix coordination; primary performs equivalent checks in Mode B. Dependencies: T12 and all fixes finished. Acceptance: AC-01–AC-12.

Run from `frontend/`:

```sh
npm run typecheck
npm test
npm run build
```

Run from repository root:

```sh
git diff --check
git status --short
```

There is no lint script. Backend/OCR checks are not included for a frontend-only presentation change; any scope change requires a revised verification decision. Do not re-run passing suites repeatedly without new edits, failures or unresolved concerns.

Rendered matrix uses 1440×900 and 1280×800 desktop, 1024×768 and 768×1024 tablet, 390×844 mobile and 320×740 reflow. Every route family is inspected on desktop and mobile; tablet/expanded states cover shared layouts, panels, tables and specialized workspaces. Verify 200% zoom and reduced motion, plus boundaries of changed responsive breakpoints.

Cover populated/long content, empty/no match, loading, error/retry, stale/partial data, permission denied/read-only, validation, failed submit, busy/success, unsaved changes and version conflicts where applicable. Check primary actions, keyboard/focus, target size and contrast, no document overflow, reachable panel footers, nested menus/confirmations, chart value tables and document geometry.

Inspect screenshots as images. Check browser console/network results, no eager detail-request fan-out, no repeated request loops, correct unmount/object URL/scroll-lock cleanup, and no new heavy assets/dependencies. Use the existing runtime/tooling; if a required browser or check is unavailable, report the exact gap and do not claim it passed.

Exit: exact results logged against acceptance criteria. Failures return to their owning slice for correction, followed by focused and appropriately scoped integrated rechecks.

### T14 — Final audit and handoff

Owner: Primary. Dependencies: T13. Acceptance: AC-08, AC-12 and final reconciliation of all criteria.

1. Ensure no writer/reviewer work remains and final git status contains only intended changes. Include untracked source files in diff/hygiene inspection; plain `git diff --check` alone does not inspect them.
2. Mark every task/coverage row with actual status and evidence. Summarize principal changes and retained workspace/dialog exceptions, affected files, exact test/build/browser results, unrun checks and remaining limitations.
3. Report ignored QA artifact locations and leave no runtime artifacts staged. Stop only task-owned temporary servers when no longer needed; preserve unrelated user processes and sessions.
4. State that no migrations, production mutations, external messages, commits, pushes or deployment were performed. Do not describe partial visual coverage or unresolved verification as complete.

## Route coverage ledger

Each family below was implemented or explicitly retained after review. Rendered checks use actual AppRoutes/AppShell with synthetic, intercepted data; feature regressions cover mutation success/conflict/authorization beyond the generic browser mutation failure fixture.

| Family | Responsible tasks | Status / evidence |
| --- | --- | --- |
| Login, signup, invite acceptance, forgot/reset, auth restoration/denied/error | T04 | Compact presentation; five routes at1440/390 with zero axe violations/overflow. Reset/invite missing-token states rendered; successful token flows remain covered by existing tests. |
| Shell, sidebar/mobile navigation, neutral/role home, root and fallback navigation | T01–T04 |22 before/after computed role/navigation backgrounds match; AppShell/route regressions. Mobile header logo and trigger remain readable on each existing background. |
| Super Admin dashboard: Overview, Projects, Estimation, Design, Procurement, Finance, Execution, Workforce, Risk | T05 | All nine tabs rendered at1440/390; compact chart/table/control styles. Chart heading hierarchy corrected for mobile. |
| Admin project list/detail/initiation/assignment | T05 | Desktop/mobile list and two unequal project details; stable-ID quick view and initiation regressions; admin finance baseline preserved. |
| Users and invitations | T05 | Desktop/mobile directory plus contextual record/edit/invite panels; lifecycle confirmations retained; focused regressions. |
| Client response inbox/detail and Design approval inbox | T05 | Desktop/mobile routes; constrained table scrolling; summary panel plus retained proof/version-bound decision. |
| Access inbox, own requests and grants | T05 | Desktop/mobile routes; request/summary/rejection panels; approval/revocation confirmations retained. |
| Designer dashboard, plan tasks, project workspace | T06 | Three desktop/mobile routes plus320/768/1024/1280 project checks; protected section fixture and visible error/retry state. |
| Manager/head overview, organization, designer detail and project workspaces | T06 | Four desktop/mobile routes; stable-ID designer quick review tests; separate evaluations and calculated KPI. |
| Sales leads/saved estimates, lead detail and estimate builder | T08 | Three desktop/mobile routes and four additional builder widths;57 focused tests plus corrected route interactions; panels preserve detail/estimate navigation. |
| Client dashboard, project, approved documents and review | T03, T09 | Desktop/mobile dashboard/project plus four project widths;67 client regressions including access-denial cache removal and recovery. |
| Portfolio/project/embedded finance and payment confirmation | T05, T10 | Portfolio and two unequal project details;50 focused finance/procurement tests plus11 finance recheck. Approved/live figures and units unchanged. |
| Procurement home/project/purchases and supporting documents | T03, T10 | Desktop/mobile home/project; protected receipts retained; purchase panel and mutation regressions. |
| Site manager and worker trade queues | T03 | Desktop/mobile representative worker/site-manager homes; shared progress-panel browser checks and role/task regressions. Shared rendering/permissions remain authoritative for other trades. |
| Configuration index, Main Line workspace, reusable values and sub-editors | T07 | Three desktop/mobile routes; Mode, Recommendation/Exclusions and Quality tabs at both widths;904 focused tests.320/768/1024/1280 Main Line reflow checks. |
| Shared charts, KPI, workflow, previews, uploads, feedback and failure states | T01–T03 | Shared token, overlay, task, workflow, finance and client regressions; body-wide axe includes portalled panels. Full annotation/crop/PDF workspaces retained. |

## Overlay disposition ledger

Independent final inventory:51 source files,42 ContextPanel calls,22 Dialog calls (including the adapter discard), and2 Drawer calls. No missed ordinary bounded form was found. A contextual panel remains an accessible modal dialog. The detailed branch decisions below preserve geometry and consequential confirmations.

| Sources / content | Owner | Final disposition (source inventory reviewed) |
| --- | --- | --- |
| MobileHeader → Drawer | Primary | Retain left navigation behavior and background. |
| FilePreview; EstimateDrawingPreviewDialog; SectionReviewCard; ImageAnnotationEditor | Primary | Retained large protected image/PDF, annotation/pan/zoom and section-image workspaces; inline annotation editor and unsaved confirmation preserved. |
| DesignUploadDialog; TaskUpdateDialog | Primary | Bounded form panels; preserve upload/task behavior. |
| ClientPlanPageReview; EstimateReviewPanel and embedded client drawing review | Primary | Retain full-plan workspace and approval confirmation; contextual feedback/details where suitable. |
| OperationalTaskQueue progress update; DesignPlanAttachmentPreview; WorkflowSubmittedDocument | Primary | Progress form panel; document preview at usable width with larger viewing context where needed. |
| AdminProjectInitiationDialog; InviteUserDialog | Administration | Wide/medium form panels. |
| UserMutationDialog | Administration | Edit panel; retain guarded deactivation/identity confirmation branches. |
| InvitationActionDialog; GrantRevocationDialog | Administration | Retain concise lifecycle/revocation confirmations. |
| ClientResponseDecisionDialog | Administration | Summary panel added at inbox; final approve/reject attestation retained with Client proof, Estimate/task versions and rejection reason. |
| AccessRequestDialog; AccessRequestDecisionDialog | Administration | Request/review form panels; retain required final guarded decisions. |
| ProjectCreateDialog; ProjectStructureDialog; DeadlineRevisionDialog | Design/management | Project create, floor/stage/task structure and deadline-reason panels. ProjectCreateDialog currently has no production caller. |
| LeadCreateDialog; EstimateDesignUploads internal dialogs | Sales | Panels for numeric correction/verification, assignment, revision history and replacement upload. Retained destructive deletion and manual missing-drawing CropEditor. LeadCreateDialog currently has no production caller. |
| DesignSectionReview approval/source image/change request branches | Client | Retain immutable approval confirmation; contextual change request/details; readable source preview. |
| ProcurementProjectPage internal form; SupportingDocumentActions | Finance/procurement | Bounded edit/form/document panels; retain protected large preview if necessary. |
| CreateKnowledgeItemDialog; KnowledgeQuickAddDialog; KnowledgeMasterEditorDialog; KnowledgeSurfaceEditorDialog | Configuration | Create/edit panels with existing dirty/version behavior. KnowledgeQuickAddDialog currently has no production caller. |
| KnowledgeBaseIndexPage internal dialogs | Configuration | Basket manager and create/edit panels; permanent deletion retains impact review, exact-name confirmation and reason. |
| KnowledgeBasketQualityPanel prompt; KnowledgeQualityImportDialog | Configuration | Contextual prompt/import review panels, preserving validation and pending changes. |
| KnowledgeInHouseTotal; KnowledgeModeCalculationSimulator | Configuration | Wide calculation preview panels retaining all values, inputs and semantics. |
| KnowledgeItemWorkspacePage revision/duplicate; KnowledgeLifecycleDialogs; KnowledgeVersionConflictDialog; KnowledgeUnsavedChangesDialog | Configuration | Retained audited revision/duplicate confirmation, activation/deactivation/permanent deletion, version-conflict recovery, and save/discard/stay decisions. Main editor remains on page. |

## Acceptance traceability

| Specification criteria | Implemented by | Final verification |
| --- | --- | --- |
| AC-01 brand/sidebar | T00, T01, all theme-consuming lanes | Per-role computed backgrounds, assets/fonts, desktop/mobile images |
| AC-02 typography | T01 and T04–T10 | Actual route/portal styles and long content/zoom |
| AC-03 composition | T01, T03–T10 | Route-family density and responsive evidence |
| AC-04 shared states | T01–T10 | Primitive/feature tests and rendered state matrix |
| AC-05 panels | T02, T03, T05–T10 | Overlay tests and width/scroll/theme/keyboard scenarios |
| AC-06 modal classification | T00, T03, T05–T11 | Complete call-site disposition ledger |
| AC-07 identity/state/navigation | T02, quick-view/form lanes, T11 | Record A/B race, authorization, dirty/busy/focus/navigation checks |
| AC-08 app-wide coverage | T00, T04–T11, T14 | Completed exact-route ledger with evidence |
| AC-09 functionality/permission | Every task, T12 | Existing regressions and asymmetric role/project fixtures |
| AC-10 domain semantics | T03, T05–T10, T12 | Finance/workflow/approval/configuration/document regressions |
| AC-11 responsiveness/accessibility | All UI tasks, T13 | Full rendered matrix, axe plus manual review |
| AC-12 build/performance/hygiene | T00, T11–T14 | Exact command results, network/runtime checks, final diff |

Execution authorized: specification approved, task plan approved, Mode A selected. Implementation, integrity review and final verification complete, with baseline failures and verification limits recorded below.

### Implementation checkpoint — 2026-09-13

- T01/T02: compact shared tokens, primitives and role styles; contextual Drawer/ContextPanel with inert background, nested focus, dirty/busy guards and sticky actions. Shared foundation focused52 passed; overlay focused107 passed plus additional final56 tests. Browser verified360px desktop and390px mobile panel,44px mobile input/16px text and reachable footer.
- Fixed production cascade order in document head: route CSS had registered `components` before `base`; browser now confirms24px/30px page titles instead of inherited14px. Preserved sidebar palette.
- T03: shared task/progress/upload/document panels and compact workflow timelines; focused186 tests passed. Full annotations/crop and PDF/image previews retained because geometry/working area matters. KPI/evaluation/shared review styling integrated; final verification pending.
- T04: compact authentication card/controls and visible focus; authentication behavior unchanged. Baseline stale router/PasswordReset assertions identified separately.
- T05: admin/access implementation done; focused181 tests plus follow-up27/9 passed. Nine dashboard tabs share compact tables/controls. Authorized stable-ID list summaries; guarded initiation/invite/user/access/rejection forms. Critical decision dialogs retained.
- T06: designer/manager/head implementation done;67 tests/typecheck passed. Stable-ID quick reviews/search, structured form panels and compact full workspaces; original gradient and KPI/deadline logic preserved.
- T07: configuration implementation done;904 tests/typecheck passed. Ten bounded surfaces use panels; full Main Line, discard/conflict/lifecycle dialogs retained. Four baseline source-order assertions corrected.
- T08: Sales implementation complete;57 focused tests/typecheck passed, plus both estimate route interactions.
- T09: client implementation done;63 client/estimate tests/typecheck passed. Client-scoped ID summaries, guarded change requests, unavailable/retry state for failed approved-plan data; immutable approvals/full images retained.
- T10: finance/procurement implementation done;50 focused tests plus11 finance recheck passed, including unequal projects/approved versions. Stable-ID ledger details, cost/purchase panels, protected large receipt preview retained.
- T11/T12: reconciliation and independent integrity review complete. Corrected client cached-data disclosure after denied reads, removed-trigger focus fallback including nested cleanup, and portal coverage in axe. T13/T14: rendered checks, integrated verification and handoff complete, subject to the documented baseline failures and harness limits.

QA uses synthetic intercepted data through actual AppRoutes/AppShell at `/qa/enterprise.html`. Baseline source lives at `/tmp/lisno-enterprise-qa/baseline-source`. Original command logs are `/tmp/lisno-enterprise-qa/baseline/`; baseline typecheck/build passed; full baseline tests had22 failures across7 files and11 unhandled observer errors. Browser and final command evidence will be recorded at handoff.

## Integrated verification evidence

- Latest full frontend suite: `npm test` exited1 with **2433 passed,4 failed;179 passed files,3 failed files;0 unhandled errors**. The four failures reproduce on the original baseline: signup router expects an Address field; authorization expects an obsolete policy version and120 permissions rather than123; PasswordReset asserts values on previously captured, unmounted inputs. No production auth behavior was altered to accommodate these stale assertions.
- Final bounded drawing semantic/contrast fixes were followed by `npm test -- src/components/design`: **57/57 passed across6 files**, `npm run typecheck`: exit0, and `npm run build`: exit0. The full suite predates those final two fixes; the subsequent focused suite/typecheck/build cover them.
- Integrated overlay/client/finance/transport focus suite:122/122 passed. Toast correction:15/15 feedback tests, then included in the2433-pass full run. Additional designer workspace/fixture error-retry checks:71 passed.
- Build preserves the existing >500kB chunk warning. Main JS approximately1479kB /406kB gzip versus baseline1448kB /399kB gzip. No dependencies, lockfiles, backend/OCR, API/domain contracts or brand assets changed. Default production entry is index.html; built output contains no synthetic QA transport markers.
- Rendered evidence:64 initial route checks (32 routes × desktop/mobile),18 corrected-route rechecks all clean,28 additional viewport checks all clean,10 auth-route checks all clean,6 configuration-section checks all clean,10 contextual quick-view checks all clean. Five quick-view families preserve route and focus and make the background inert at both desktop/mobile widths.
- Contextual widths verified360/480/720 desktop, full width390/320 mobile. At320×740 the simulator footer ends at740px and body scroll remains available. Escape restores the launch button, clears inert and releases scroll lock. A temporary inaccessible button injected into a portalled panel was detected by the body-wide axe helper, then removed.
- Mobile invitation simulation: dirty Escape opens discard confirmation; Keep editing preserves values; delayed synthetic save disables submission and blocks dismissal;422 retains entered Name/Email and displays an actionable error; discard closes both layers and restores focus. Transport logged exactly one intercepted POST; no real invitation was sent.
- Sixteen mobile empty/error/loading/denied route-state checks found one low-contrast finance zero-count rule; shared opacity corrected. No render exceptions or unexpected API requests in those state checks.
- Command logs and browser reports are under `/tmp/lisno-enterprise-qa/`; these are temporary local QA artifacts. Existing MSW and JSDOM canvas warnings also occur on baseline. There is no lint script.
- Successful backend delivery, production mutations, migrations, backend/OCR and replica-set checks were not run: this change is frontend presentation and local test infrastructure only. Generic browser mutations intentionally return422; success, conflict and authorization behavior is established by feature regressions, not the permissive synthetic route fixtures. Successful invitation/reset token bootstrap was not reproduced in this memory-router browser harness.

### Final rendered checks and handoff

- All18 corrected-route desktop/mobile checks pass. All nine mobile dashboard tabs pass after chart heading correction. Finance empty-state contrast passes after opacity correction.
- Drawing preview retains1200×800 source coordinates. Zoom changes viewBox to960×640; Reset restores1200×800. Final drawing preview axe reports zero violations; saved annotation alignment visually inspected. Protected approved-plan PDF and workflow document use titled blob-backed frames; zero wrapper axe violations, no unexpected API traffic. Browser PDF content itself is outside application accessibility control.
- At720×450 (200%-equivalent reflow for1440×900), reduced-motion contextual panel has zero document overflow/axe violations. Finite transition duration is0.01ms. Read-only panel body is keyboard reachable: after End, it retains focus and scrollTop becomes96 with590px content in266px viewport. Native browser chrome zoom was not directly operated;320px reflow and reduced viewport checks cover layout scaling.
- Added a regression for contextual Close→scroll body→footer→Close navigation. Final overlay suite59/59 passed; navigation drawer body remains unchanged. Final typecheck/build and diff check pass after this fix. Latest full suite2433/4 predates the final drawing/scroll fixes; subsequent57 drawing and59 overlay tests/typecheck/build passed.
- Final production assets retain the existing large-bundle warning; no QA fixture entry/transport is shipped. No commits, staging, pushes, deployment, production mutation, real mail, seeds or migrations occurred.
- Temporary evidence: `/tmp/lisno-enterprise-qa/final-browser-report.json`, original baseline logs, final command logs and relocated browser logs. Task-owned Vite servers are stopped at handoff. Source and test harness changes remain unstaged for review.

### Follow-up: preserve sidebar position while panels are open

The user reported the sidebar moving with page scroll after opening a contextual panel. This is a regression against the approved shell/panel invariants, corrected within the existing scope. Browser reproduction at1440×900 and scrollY537 showed the sidebar top change from0 to−537 when the shared overlay set body overflow:hidden. That created a new scroll ancestor for the sticky navigation.

The shared overlay now locks document.documentElement, leaving body overflow unchanged. It retains nested/out-of-order ownership and restores original overflow shorthand/axes/priorities after the final close. No sidebar layout or theme CSS changed. Desktop browser verification shows scrollY537 and sidebar top0 before opening, while open, after a background wheel attempt, and after closing.

Verification:72 focused tests passed across Dialog, Drawer, ContextPanel and Designer ProjectWorkspace, including axis/priority restoration and body-preservation coverage; production build (including TypeScript) passed, with the existing bundle-size warning; independent read-only review found no restoration or nested-lifetime concern. Full suite was not repeated for this bounded correction. Logs: /tmp/lisno-sidebar-scroll-tests.log and /tmp/lisno-sidebar-scroll-build.log.

Mobile600px-height verification: panel content scrolls independently (scrollTop24), document scrollY1171 remains unchanged during scrolling and after close, root/body inline overflow restore, and axe/document-overflow checks are clean. Browser evidence is saved under /tmp/lisno-enterprise-qa/sidebar-scroll-*.json. Task-owned QA server and browser were stopped; no commit or deployment.

### Follow-up: UOM and Surfaces in one row

Updated the existing Overview grid in ai-estimator-knowledge.css so UOM and Surfaces sit side by side when each card has at least19rem available; cards stack when the container is narrower. Existing controls, values and quick-add behavior are unchanged. Browser checks confirm one row at1440/1280/1024/768px and stacking at390/320px, with zero document overflow or axe violations at all six widths. Desktop screenshot visually inspected.21 existing Overview/Surface tests and production build passed (existing bundle-size warning only). Logs: /tmp/lisno-overview-row-tests.log and /tmp/lisno-overview-row-build.log.

### Follow-up: PMC Margin increments — 2026-09-14

Changed the PMC number control to5-percentage-point steps within its existing10–20 range. Sub-Vendor keeps its existing0.01 step. This changes increment/decrement interaction only; existing exact basis-point storage, validation, previously saved decimal margins and simulator values remain compatible. Browser ArrowUp/ArrowDown produced10→15→20→20→15→10→10, verifying step size and both limits.44 margin/Mode integration tests and the production build passed; existing bundle-size warning remains. Logs: /tmp/lisno-pmc-step-tests.log and /tmp/lisno-pmc-step-build.log.

### Follow-up: compact Inclusions and Exclusions — 2026-09-14

The user requested horizontal items and then tighter spacing with four items per row. Updated the shared checklist presentation in knowledge-configuration-ui.css: up to four columns based on available fieldset width, 11px labels, 14px checkboxes, 24px delete targets, 28px minimum item/add-button height, and reduced gaps/padding. Selection, deletion, custom-entry inputs and persisted data are unchanged.

Rendered desktop check at1728px shows four114.25px columns inside each475px list, with six items fitting into two rows; the screenshot was visually inspected. At390px, both254px lists use two124px columns with no list or document overflow. Browser actions sometimes timed out after completion, so final geometry was read separately after the controls rendered.12 existing checklist interaction/accessibility tests passed; final production build and git diff --check passed. The full suite was not repeated for this CSS-only follow-up. Logs: /tmp/lisno-scope-grid-tests.log and /tmp/lisno-scope-grid-build.log.
