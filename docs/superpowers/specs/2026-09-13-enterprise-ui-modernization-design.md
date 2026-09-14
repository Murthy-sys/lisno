# Lisno enterprise UI modernization

Date: 2026-09-13
Status: Approved; task plan approved and Mode A execution authorized
Classification: Substantial frontend redesign, with sensitive workflow regression exposure

## Goal

Modernize the entire existing Lisno interface into a compact, readable enterprise workspace. Improve information hierarchy, forms, tables, cards, and contextual review without changing the product identity, sidebar backgrounds, business behavior, data contracts, or permissions.

This specification implements the user's attached UI/UX brief. It is the specification stage only: no task plan or application changes are included. Repository `AGENTS.md` requires separate specification approval, task-plan approval, and execution-mode selection before implementation. The requested independence applies to routine design decisions within the approved scope; individual component changes will not need separate approval.

## Current behavior and evidence

The initial `git status --short` was empty. Evidence below is from current source, not historical design documents.

| Area | Current evidence | Design implication |
| --- | --- | --- |
| Stack | `frontend/package.json`: React 19, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Lucide, Tailwind tooling; custom CSS and in-house UI components | Extend the existing components. No replacement UI framework, chart package, or dependency is required by this design. |
| Route and permission ownership | `src/app/router.tsx`, `routeRegistry.ts`, `routePaths.ts`, `auth/PermissionRoute.tsx`, `auth/authorization.ts` | Keep route paths, deep links, role homes, return paths, and operation-specific permission checks. |
| Theme source | `src/main.tsx` loads `styles/index.css`, brand and role themes, then feature styles including admin/designer overrides. `index.css` layers the foundations; later unlayered rules and role styles override them. `tokens.css` is a compatibility import; `global.css` owns tokens. | Correct the existing cascade at its source. A new global override sheet alone would leave competing component rules in place. |
| Brand | `global.css`: Poppins interface typography, primary `#1e183b`, white background, gold highlight `#d5ad18`; existing semantic status and chart colors | Preserve the palette, fonts, logos, and semantic color meanings. Gold remains an accent, subject to readable foreground pairing. |
| Sidebar | `role-themes.css` paints `.ui-sidebar-rail` with `--role-rail`; final common value is `--color-primary`. `admin-home.css` preserves that value. Later `designer-home.css` sets `linear-gradient(190deg, #16234a 0%, #101a38 55%, #0a1226 100%)`. Mobile navigation uses `Drawer` and has its own styling. | Preserve actual background color AND background image per role and navigation surface. Do not flatten the designer rail or apply one new sidebar color everywhere. |
| Typography | `global.css` has 40px-equivalent page-title and 16px body tokens, plus older aliases. `role-themes.css` sets some workspace headings to `clamp(2.1rem, 3.6vw, 3.4rem)` and generous header padding; admin/designer styles override selected headings again. | Update semantic typography and the feature declarations that bypass it. Do not shrink the document root to force density. |
| Shared components | `components/ui`: Button, IconButton, Field/Input/Select/Textarea, Surface, PageHeader, SectionHeader, StatusBadge, ProgressBar, feedback states, menus, combobox, tooltip, Dialog, Drawer | These form the existing design system. Improve variants and migrate feature-level holdouts into them. |
| Density | `primitives.css`: default buttons/inputs have 44px minimum height, compact buttons 36px; surface padding already supports 16/20/32px. Cards use several radius/shadow aliases. | Existing compact patterns are a useful starting point. Normalize field, button, and card geometry while retaining touch usability. |
| Overlay behavior | `Drawer.tsx` defaults left, has an accessible but visually hidden title, one body, no visible header/footer/width variants, and is used in production only by `MobileHeader.tsx`. `Dialog.tsx` is portalled. `overlay.ts` owns focus trapping/restoration, stacking, Escape, busy dismissal, and scroll locking. | Extend Drawer for contextual content and reuse the overlay infrastructure. Preserve mobile navigation behavior and account for portal theme inheritance. |
| Feature holdouts | `LeadDetail.tsx` uses raw controls and a full-width follow-up button; `LeadCreateDialog.tsx` generates vertically stacked fields; `EstimateDesignUploads.tsx` mixes raw buttons/forms with several modal workflows. Manager/head headers bypass PageHeader. | Shared tokens alone are insufficient. Screen composition and control adoption must be reviewed across modules. |
| Useful visuals already exist | `components/charts`, `components/kpi`, dashboard charts, `ProjectFinanceChart`, `ProjectWorkflowProgress`, lead timelines, document previews, collapsible client project and estimate sections | Reuse these visuals, preserve their labels and data semantics, and improve their layout. Avoid duplicate summary widgets and invented chart data. |
| Sensitive consumers | `AdminProjectDetailPage` passes an approved finance source into `ProjectFinancePanel`; finance pages use backend buckets and explicit paise formatting. Reviews, invitations, uploads, configuration conflicts, and workflow actions have dedicated handlers/tests. | Presentation work must retain these existing sources, versions, failure handling, validation, and action gates. |
| Verification infrastructure | Vitest, Testing Library, MSW, axe-core, component/feature regression tests; existing `frontend/qa` foundation, dashboard, and Main Line surface fixtures | Extend existing verification infrastructure rather than introduce a new test stack by default. |

### Rendered audit and its limits

The existing synthetic Super Admin dashboard preview was opened in Chrome from a local Vite server. It contains real dashboard components and synthetic data, including payment-confirmation empty state, portfolio summary, attention signals, charts, and module navigation. Its entry point renders `<main className="app-main">` without `AppShell`, omits some production style imports and the production font links, and cannot establish role-theme or sidebar parity. It must not be presented as a complete production-screen baseline.

The source-level route/component inventory is complete at the module-family level. Authenticated rendered coverage for all roles, tablet/mobile states, computed style measurements, and full behavior validation remain implementation requirements. No complete visual audit or accessibility pass is claimed at this stage.

## Scope and module coverage

All routed feature families and their shared embedded components are in scope. A module is not complete merely because it inherits smaller font tokens.

| Route family / surfaces | Intended composition and interactions |
| --- | --- |
| Authentication: login, signup, invitation acceptance, forgot/reset password, restoration/error/denied states | Compact, aligned form controls and clear feedback; retain existing artwork, brand identity, validation, token handling, and authentication flows. Authentication-specific photographic composition need not become a dashboard layout. |
| Shared shell and `/home` | Proportionate title/actions, consistent content spacing, readable navigation labels, responsive navigation, compact operational queues and KPI content. Preserve every role's sidebar background and navigation entries. |
| `/admin/dashboard`, all nine dashboard tabs | Prioritize actionable exceptions and compact portfolio summaries; align period/refresh controls; retain all module metrics, accessible chart value tables, legends, observation timestamps, unavailable/partial-data states, and drill-down filters. Reduce repeated card borders and headline-sized metrics. |
| `/admin/projects`, `/admin/projects/:projectId` | Compact project records, search/filter/pagination toolbar, contextual quick view of existing project information, and a clear route into the full project workspace. Keep full workflow, assignment, approval history, and finance workspace on the detail page. Project initiation uses a wide form panel. |
| `/admin/users` and invitations | Dense directory and invitation tables, aligned actions, contextual user edit/invite panels. Retain immutable identity restrictions, hierarchy selections, delivery feedback, and guarded lifecycle actions. |
| `/admin/client-responses`, `/:roundId`, `/admin/design-approvals` | Compact queues and contextual review summaries. Preserve standalone deep-linked response detail and large estimate/document review. Retain proof, evidence, notes, submission state, and critical confirmation semantics. |
| `/admin/access-requests`, `/access-requests/mine` | Compact request/grant records and filters; right panels for request details and request/review forms. Preserve operation-specific grants, expiry, rationale, pending/conflict states, and revocation confirmation. |
| `/designer`, `/designer/design-plans`, `/designer/projects/:projectId` | Compact workload/project cards, useful risk/deadline/KPI cues, task detail and update panels, aligned upload controls. Preserve dedicated plan editing, structure, assignments, and review actions. |
| `/manager`, `/head`, designer detail and project routes under both | Compact team cards/rows, searchable reports, expandable organization hierarchy, clear separation between calculated KPI and manager/head evaluations. Quick review panels supplement full designer/project workspaces. |
| `/estimator-sales`, `/leads/:leadId`, `/leads/:leadId/estimate` | Dense leads/saved estimates, related metrics in a row, useful contact/follow-up context, contextual lead quick view. Keep the estimate builder as a dedicated workspace; improve room/scope navigation, line items, totals, upload/replacement/history panels, and delivery states. |
| `/client`, `/client/projects/:projectId`, estimate/drawing review | Compact summaries and project rows/cards; retain useful collapsed sections, progress, next actions, approved-document restrictions, selected-estimate deep links, annotations, and Ask Lisno. Contextual metadata/history/review forms; preserve full-plan review space. |
| `/finance`, `/finance/projects/:projectId`, embedded finance panels | Compact commercial summary, labeled finance visuals, project records and ledger; contextual entry details and cost-entry form where helpful. Preserve full project finance/workflow route, all baseline/current distinctions, costs, reconciliation, and payment confirmation behavior. |
| `/procurement/projects/:projectId`, procurement `/home` workspace | Compact project list, estimate sections, quantities, purchases, document controls and progress. Contextual purchase/edit/document metadata panels; preserve complex procurement work on its page and collapsed sections. |
| Site manager and every worker trade at `/home` | Readable compact task queue with due/status/progress, task detail/update panels, and retained role-specific actions and coordination sections. |
| `/admin/configuration/estimation`, `/items/:itemId`, `/reusable-values` | Compact basket/Main Line index and reusable-value tables; retain the dedicated configuration workspace and its section navigation. Improve paired fields, calculation tables, mode/surface controls, quality checklists, pending-change summaries, revision history, and contextual sub-editors. |
| Shared upload, preview, workflow, KPI, feedback and error components | Consistent states, labeling, density, and actions in every consuming module. Keep data-driven charts, progress, and document interaction behavior. |

### Non-goals

- No replacement application, navigation taxonomy, primary palette, typeface, logo, 3D scene, decorative animation, or unrelated design system.
- No new backend endpoints, schema, migration, OCR behavior, financial formulas, permissions, signup eligibility, approval semantics, or delivery rules.
- No removal of useful fields, routes, supported actions, filters, sort behavior, pagination, exports, uploads, or history.
- No new metric, search, sort, pagination, or chart behavior whose authoritative data is absent from the existing API. A partial loaded page must never masquerade as an entire dataset.
- No production data mutation, seed, real invitation/message delivery, deployment, staging, commit, or push.

## Design requirements

### Brand and typography

Keep the existing Poppins-based identity and font assets. Use clear weight differences, short headings, and semantic spacing rather than oversized text, uppercase paragraphs, or excessive bold. Numeric columns use tabular numeral alignment; existing financial formats and precision remain intact.

| Semantic role | Baseline at ordinary desktop zoom |
| --- | --- |
| Page title | 20–24px, approximately 1.25 line height |
| Section heading | 16–20px |
| Card/panel section title | 14–16px |
| Body and ordinary inputs | 13–14px, approximately 1.4–1.5 line height |
| Form labels and buttons | 12–14px |
| Table content | 12–13px |
| Metadata, help text and status labels | 11–12px; use 12px for important secondary information |
| Summary values | Normally 20–24px; communicate emphasis through grouping and labels |

Use semantic tokens in `global.css` and reconcile older aliases and feature overrides. Do not redefine all text by reducing `html` font size. Keep viewport zoom enabled. Mobile form fields may use 16px text to avoid browser focus zoom and maintain readability. Long titles wrap; short metadata may truncate only when its full value is available by keyboard and touch as well as hover.

### Layout and density

- Use existing 4/8/12/16/20/24px spacing tokens. Desktop page padding is normally 20–24px, mobile 12–16px; section gaps 20–24px, related component gaps 8–12px.
- Default card padding is 16px; richer sections may use 20px, compact row groups 12px. Avoid fixed tall cards for minimal content.
- Headers show title, necessary status/metadata, and one dominant action. Remove large decorative header bands/orbs from operational screens where they consume space without conveying state.
- Keep related small summaries in responsive grids. A readable record list or table can replace nested cards; a full-width ledger or editing workspace is legitimate.
- Forms use label/control/help groups. Pair fields such as contact channels, date ranges, quantity/unit, category/status, and budget bounds. Descriptions and document workspaces retain suitable width.
- Prefer layout choices driven by available content width. Dense workspaces retain useful horizontal space on large monitors while simple forms are constrained.
- Use consistent modest radii: approximately 6–8px controls and 10–12px grouped surfaces. Pill shapes are reserved for appropriate statuses/chips. Subtle borders provide separation; elevated shadows indicate overlays or meaningful elevation.
- Reconcile styles in existing foundation and feature files instead of appending a competing override system or broad `!important` rules. Preserve unrelated styles and known specialized editor behavior.

### Shared components and states

Improve Button/IconButton, Field controls, Surface, headers, badges, progress, menus, tabs, disclosures, upload controls, tables, feedback, and overlays as an integrated component system. Existing custom date/select controls remain native or reuse current components; no new component library is needed.

Buttons retain primary, secondary, quiet, destructive, destructive-outline, and success semantics. Desktop default control height is approximately 36px, with 32px compact table actions and larger touch variants where needed. Coarse-pointer/mobile controls have at least 44px practical targets; checkbox/radio targets include their labels. Disabled and busy states remain distinct, loading labels do not resize buttons, and tooltips never replace accessible names.

Cards use a title/status/action row, concise metadata, then substantive content or visual progress. Use definition lists for metadata, timelines for actual history, and expandable sections for optional detail. Do not wrap each label/value in another card. Interactive controls remain native buttons/links rather than click-only generic containers.

Tables retain semantic headers, scoped numeric alignment, approximately 36–44px ordinary rows, and content-driven height for wrapped text. Keep existing search/filter/sort/pagination capabilities, their dataset scope, and reset behavior. Toolbar controls wrap in logical order. At narrow widths, use a readable stacked record representation or a labeled, keyboard-accessible table scroller where columns genuinely require it; the document itself must not overflow horizontally.

### Contextual panels and retained workspaces

Extend the existing Drawer with an explicit contextual variant, visible header, description/metadata, internal scroll body, optional sticky action footer, and width variants. Navigation keeps its existing left-side behavior; contextual callers explicitly use the right side. Reuse `OverlayPortal` and `useOverlay`, with theme values available outside the shell.

Panel sizing targets: narrow 360px, medium 480px, wide 720px, each capped by the available viewport. Below the width needed for a useful adjacent page, panels use the available mobile width and dynamic viewport height with safe-area padding. Full-width mobile presentation is acceptable; large full-screen desktop overlays are not the default.

The underlying list remains visibly recognizable. A modal form drawer uses a restrained scrim, accessible dialog semantics, isolated focus, and scroll locking. The background must not remain actionable behind an active modal drawer. Existing persistent split views can remain nonmodal; do not introduce a second floating interaction model merely for this redesign.

| Existing content | Presentation decision |
| --- | --- |
| Record metadata, lead/project/user/task quick review, related details, activity or revision history | Right panel with clearly identified record and permission-appropriate sections; offer “Open workspace” when a full route exists. |
| Project/lead creation and initiation, user editing/invitations, access request/review forms, task/progress updates, upload/replacement/assignment forms, deadline rationale | Right form panel sized to content. Preserve required fields, disabled/busy rules, proof, reasons, and server validation. |
| Configuration quick-add, master/surface/basket sub-editors, quality import and AI prompt review, scoped calculation simulators | Medium/wide panel. Reuse section content and existing pending-change/conflict handling; large main configuration editing stays on its page. |
| Design upload/replacement detail, drawing assignment, history, supporting document metadata, read-only document preview | Panel when usable at the target width; retain a clear path to the larger protected preview where reading requires it. |
| Estimate builder, full-plan annotation, image crop/section geometry, extensive project workflow, full finance ledger/workflow, main configuration workspace | Retain dedicated workspace or specialized large preview. Compact supporting chrome without compressing the working canvas. |
| Immutable approval confirmation, revoke/delete/deactivate/archive, invitation lifecycle confirmation, discard-unsaved changes and version-conflict decisions | Retain concise dialogs/alertdialogs. Their existing semantics, evidence and safeguards take precedence over drawer conversion. |

Conversion applies by content, not by filenames ending in `Dialog`. Review and record the disposition of every existing overlay during implementation. Small inline annotation text editing remains attached to its editing context unless its existing behavior requires correction.

Opening an existing simple “View details” action should show the contextual panel. Canonical standalone URLs remain available, direct navigation continues to render its dedicated page, and “Open workspace” makes complex navigation explicit. Project cards that already offer useful inline expansion retain it. Do not add nested interactive row controls or hijack modified link clicks.

### Panel state and navigation contract

1. Open using the stable record ID and the existing read permission. Keep list query/filter/page/scroll state mounted.
2. Render loading, loaded, not-found, permission-denied, and retry states inside the panel. Opening is read-only and never triggers a mutation.
3. Fetch detail only when authorized and open. Reuse existing query keys/contracts. Switching records clears the prior record's presentation and unsaved editor state only after any required discard decision; late responses cannot replace the newly selected record.
4. Submit through the existing mutation, validation and version/CAS mechanism. Block duplicate submits and preserve errors/entered values on failure.
5. On success, retain established invalidation/refetch behavior for list/detail, workflow, dashboards, and finance consumers. Do not manufacture totals in local UI state.
6. Close by button, Escape, or backdrop through one close policy. Busy operations retain their established dismissal rules. Dirty forms with meaningful edits require discard confirmation; existing configuration guards remain authoritative.
7. Restore focus to the trigger, or a stable list/header fallback if the trigger disappeared. Restore scroll and preserve filters. Nested confirmations trap focus only in the top layer and return focus to the parent panel.
8. Navigating away closes transient panels without stranding focus or scroll locks. Existing browser Back/Forward and deep-link behavior remains correct; ordinary local previews do not require new URL parameters.

### Meaningful visuals

Reuse existing progress, risk/KPI, workflow stages, finance charts, drawings, and history. Pair charts with exact values and accessible explanations. Keep current percentages, denominators, unavailable states, and timespans; no invented trends, risk scores, completion states, or activity entries.

Existing timer warning colors and timing thresholds, approval stage status, delivery state, and budget overrun indications must keep their meaning. Visual simplification must not remove user-visible business information. Repeated information can be consolidated into one clearly discoverable section rather than duplicated in several cards.

## Data, permissions, and workflow invariants

No request/response, schema, persistence, or backend authorization change is expected. Presentational extraction may reuse existing data hooks; do not duplicate orchestration in a new drawer implementation.

| Audience | Preserved boundary |
| --- | --- |
| Client | Only existing authorized projects, approved/shared content, estimate/design review and change-request actions. No staff metadata added by quick views. |
| Estimator/Sales | Existing assigned leads/estimates, initiation eligibility, upload, publishing and delivery controls. |
| Designer | Assigned project/design/task scope and existing submission/update capabilities. |
| Design Manager / Head | Existing team/organization scope and distinct evaluation authority. |
| Admin | Existing project administration and operation-specific review/assignment capabilities. |
| Super Admin | Existing operation-specific permission checks; never blanket disclosure or identity mutation based on the role name alone. |
| Finance / Procurement / Site Manager / Workers | Existing financial, procurement and assigned operational boundaries, including granted access where applicable. |

Frontend visibility stays synchronized with the current authorization snapshot; the backend remains authoritative. Do not issue unauthorized detail queries just to hide their results later.

Financial displays continue to use the same approved estimate lineage, integer-paise data and explicit rupee boundaries. Preserve GST exclusion, approved baseline, reserved profit versus live profit, cost classes, ledger-derived overheads, and project/portfolio reconciliation. Do not sum a partial page into an organization total. Missing or stale authoritative data stays visibly unavailable/stale rather than becoming zero.

Keep immutable approval history, actor/client-on-behalf proof, deduplication, version checks, original deadlines, reasoned revisions, task generation and audit inputs intact. Invitation preflight and estimate/design delivery retry behavior remain unchanged. Protected file references, authenticated previews, object URL cleanup, crop/annotation coordinates and upload compensation are preserved.

## Accessibility, responsiveness, and failure behavior

- Keep native semantics, visible focus, logical heading/tab order, named controls, clear errors, and screen-reader announcements for consequential state changes.
- Compact styling must retain readable foreground/background contrast and recognizable control boundaries. Verify actual rendered combinations, including role themes, portals, selected states, and disabled/busy variants; token-level tests alone are insufficient.
- Dialogs and drawers have visible titles, correct accessible names/descriptions, keyboard close, initial focus, background isolation, focus restoration and stacking behavior. Long panels scroll internally without clipping their final field or action footer.
- Desktop supports productive grids; tablet collapses columns before controls overlap; mobile stacks related sections and uses touch-sized controls. Sidebar switching must be tested around existing 767/768 and 1024 breakpoints before choosing a consistent content-safe behavior.
- Maintain readable content at 200% zoom and reflow at a 320px viewport. Do not hide required fields, data or actions to make screenshots fit.
- Preserve reduced-motion support. Panel transitions are brief and disabled/simplified by the existing motion preference. No new decorative animation or perpetual effects.
- Preserve loading/empty/error/stale/conflict/permission states at their local scope. A failed optional chart should not make the whole page unusable. Failed form submissions keep input; successful updates show unambiguous feedback.

## Architecture decisions and tradeoffs

The recommended approach is to improve the existing foundations, explicitly migrate feature holdouts, and add contextual capability to Drawer. It reuses proven state and permission behavior and lets all modules share the same density without replacing the application.

A token-only reskin is smaller but cannot satisfy panel conversion, full-width form problems, duplicated cards, or feature-specific overrides. Rebuilding the app with another UI kit would increase migration and dependency risk and conflict with the user's brand-preservation requirement. Neither is selected.

Full workspace routes remain the best option for large editing/review jobs. Contextual panels are selected for bounded review and forms because they preserve list context. This is a content-specific decision, not a blanket conversion of every dialog or route.

No external component service, remote design file, installation, or generated imagery is needed. If an actual implementation dependency is discovered, justify it against existing capabilities before adding it.

## Acceptance criteria and verification contract

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC-01 | Brand tokens, logo assets, font identity, and each role's desktop/mobile navigation background are preserved. | Before/after computed background color/image and font/token comparison in actual AppShell, plus rendered screenshots for roles with distinct overrides. |
| AC-02 | Titles/body/metadata follow the compact semantic scale; old feature rules no longer produce oversized operational headings or inconsistent controls. | Token/alias review and computed-style sampling across every route family, dialogs and panels; long labels and 200% zoom checks. |
| AC-03 | Related summaries and form fields share rows when space allows; cards and page sections have proportional spacing and minimal redundant nesting. | Matched-data desktop/tablet/mobile screenshots and a route-family audit disposition. |
| AC-04 | Buttons, fields, menus, tabs, statuses, upload controls, tables, and feedback use consistent reusable styling and preserve all interactive states. | Existing focused primitive/accessibility tests, representative form validation and keyboard interactions, computed touch-target checks. |
| AC-05 | Contextual right panels offer narrow/medium/wide sizes, visible sticky chrome, usable scrolling, responsive layout, and consistent theme. Navigation Drawer remains correct. | Drawer/Dialog/overlay tests and rendered form/detail/navigation scenarios with body-scroll and portal-theme checks. |
| AC-06 | Every existing dialog is classified and appropriate information/forms migrate; critical confirmations and extensive workspaces retain suitable presentation. | Overlay inventory with final disposition, implementation references and reason for retained exceptions; exercised representative workflows. |
| AC-07 | Quick views preserve list state and all standalone links; stable IDs, query lifecycle, focus, dirty state, busy state and record switching are correct. | Open/close, A-to-B race, failed load/save, deletion of selected record, permission loss, discard, nested confirmation, Back/Forward and deep-link checks. |
| AC-08 | All route families listed in Scope receive a specific review and applicable improvements. No module is silently omitted. | Route coverage ledger in the later task plan/handoff, showing changed or explicitly verified-compliant surfaces and test/screenshot evidence. |
| AC-09 | All information, workflows, action meanings, validation, routes and authorization boundaries remain intact. | Existing feature/route/auth regressions; asymmetric permitted/denied identities and scoped projects; payload/version comparisons for moved forms. |
| AC-10 | Finance, risk, KPI, approvals, deadline colors, delivery and protected-document semantics are unchanged. | Existing focused financial/workflow/upload/configuration regressions; two unequal projects with distinct amounts, identities, approved versions and permissions. |
| AC-11 | Responsive layouts, keyboard use, readable contrast, focus and reduced-motion behavior hold across normal and failure states. | Actual rendered matrix described below, axe checks plus manual keyboard/visual review; no page-level overflow. |
| AC-12 | Build/type safety, performance and repository hygiene are verified; no unnecessary dependencies or unrelated edits are introduced. | Focused tests then full frontend typecheck/tests/build, final diff review and `git diff --check`; runtime console/network inspection and panel request lifecycle checks. |

### Rendered verification matrix

- Use synthetic data through the actual route components and AppShell with production style/font import order. Existing standalone galleries supplement this matrix; they do not replace it. Do not seed or mutate real data for screenshots.
- Representative viewports: 1440×900 and 1280×800 desktop, 1024×768 and 768×1024 tablet, 390×844 mobile, and 320×740 narrow reflow. Check either side of any breakpoint changed during implementation.
- Cover every route family at desktop and mobile; add tablet and expanded state coverage for forms, tables, shell, panels and specialized workspaces.
- Exercise populated/long-content, empty/no-match, loading, error/retry, stale/partial data, read-only/denied, validation failure, mutation failure, busy, success, unsaved changes and version conflict wherever applicable.
- Interact with each primary task family: project initiation, lead follow-up, estimate editing/review, design upload/review, task progress/deadline, user/invitation/access forms, finance cost entry, procurement edit, configuration sub-editor/import, and retained critical confirmation. Use intercepted local requests/test fixtures for mutation checks.
- Measure panel open/close cleanup, background scroll, stacked focus, tooltip/dropdown clipping, viewport overflow, final-field/footer reachability, and absence of new request loops or eager detail fan-out.
- Verify previews at readable scale and that saved annotations/crops retain coordinates. Validate charts through both visuals and accessible value tables.
- Screenshot evidence must be inspected as images. Automated a11y results do not substitute for keyboard or rendered checks. Record untested browser/environment coverage explicitly.

### Commands expected during implementation

Start with changed primitive and feature tests, then run the integrated frontend checks:

```sh
cd frontend
npm run typecheck
npm test
npm run build
```

Run `git diff --check` and `git status --short` from the repository root. There is no repository lint script; do not claim lint passed. Backend/OCR suites are not automatically required for a frontend-only presentation change; if a contract/backend change becomes necessary, revisit scope and add its required verification before changing it.

Implementation must record exact commands and results, browser scenarios, failures, remaining gaps, and ignored QA artifact paths. Tests were not run for this specification-only change; starting the frontend and viewing one synthetic fixture is not evidence that application workflows pass.

## Risks, compatibility and recovery

- **Cascade regression:** layered foundations, unlayered legacy CSS, role overrides and portals can produce misleading isolated previews. Inspect actual computed styles and replace conflicting scoped declarations, preserving sidebar backgrounds.
- **Density versus readability:** smaller type and rows can impair touch use and long content. Keep semantic scale limits, touch variants, content-driven height and zoom/reflow checks.
- **Panel lifecycle:** moving a form can change mount timing, initial values, pending requests and focus. Reuse existing handlers and query keys and test close/reopen, record switching, conflicts and submission outcomes.
- **Permission or finance leakage:** quick views could expose cached content from another record or scope. Key by stable identity, respect authorization, and validate unequal projects/identities before sign-off.
- **Document regressions:** resizing a canvas without preserving coordinate mapping can corrupt review behavior. Keep specialized workspaces and run existing geometry/interaction tests when their layout changes.
- **Coverage risk:** this is an app-wide redesign. A module/overlay completion ledger and full integrated verification prevent a partial shared-CSS change being reported as completion.

No migration or backend rollout is expected. Recovery is reversal of the scoped frontend changes using the recorded diff; do not use destructive reset or revert unrelated edits. Existing endpoint/route compatibility must hold throughout. Maintain existing feedback and observability; no new telemetry containing record details or credentials.

## Assumptions and open decisions

- “Existing theme” means the currently resolved role-specific appearance, not old comments describing Teak, Ledger, violet, or a historical PDF guide. Sidebar background differences are explicitly retained.
- The latest request authorizes denser content styling, flatter operational cards and contextual interaction improvements while retaining brand identity and functionality.
- Contextual previews reuse existing authorized endpoints. Where a detail requires a complex workspace or unsupported data, retain the existing route rather than invent an API or incomplete financial summary.
- No external credentials or design assets are required for specification or synthetic visual verification.
- No unresolved product choice prevents reviewing this specification. Implementation sequencing, file ownership and parallel boundaries belong in the separately approved task plan.

Approval of this document advances to task-plan creation only.
