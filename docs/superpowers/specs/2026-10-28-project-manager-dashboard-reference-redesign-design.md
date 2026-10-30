# Project Manager dashboard reference redesign

Date: 2026-10-28
Status: Approved by the user on 2026-10-28; implemented under the approved task plan and Mode A. See the task plan for verification evidence and pre-existing full-suite failures.
Classification: Substantial frontend redesign.
Reference: The dashboard image supplied in the current conversation.

## Goal

Redesign the Project Manager / Site Manager dashboard to follow the supplied reference: a restrained interior-image header, prominent Project Dashboard title, search and filters, four summary metrics, and a desktop workspace with priority alerts on the left and a project table on the right. Preserve the existing operational behavior, source-backed information, and assignment permissions.

Project Manager and Site Manager already share one current role and dashboard. This redesign applies to that shared web experience, including responsive web layouts.

## Current behavior and evidence

The worktree was clean at discovery: `git status --short` returned no paths. Targeted diffs for the dashboard, its stylesheet and tests, and the enterprise QA transport were also empty. Recheck before implementation.

| Evidence | Current behavior and implication |
| --- | --- |
| `frontend/src/app/router.tsx`, `CurrentRoleLanding`, `ExecutionPortfolioRoute` | The stored `site_manager` role lands on `/execution`, which renders `ProjectManagerDashboard`. `/home` redirects there. Do not redesign the unused legacy `SiteManagerWorkspace` as a second dashboard. |
| `backend/src/domain/roles.ts` | The display label for `site_manager` is Project Manager. Retain this identity and label. |
| `frontend/src/features/project-manager/ProjectManagerWorkspace.tsx` | Dashboard currently stacks its header, filters, summary, priority list, and project cards vertically. KPI is toggled from the header. Project detail and its eight tabs share this file. |
| `frontend/src/features/project-manager/project-manager.css` | Current styles use Poppins, ivory surfaces, olive emphasis, fine borders and small corner radii. They also style project details, dialogs, and counterpart panels, so dashboard changes need an explicit scope. |
| `projectManagerApi.ts`, `PMShared.tsx` | Queries are authenticated, actor-keyed, periodically refreshed, and distinguish denied access, loading, failed initial requests and stale refreshes. Missing progress remains unavailable. |
| `backend/src/services/project-manager/workspace.ts` | Portfolio counts are calculated on the backend after search/status filtering but before health filtering. At risk includes critical. Alerts are filtered, sorted, previewed up to eight, and separately paginated. |
| Backend and frontend `project-manager` contracts | Projects provide name, client, location, status, health, actual progress, approved net value, target handover and source issues. There is no project photograph or per-project updated timestamp. Alerts provide project context and target identity, but no dedicated client/avatar field. |
| `backend/src/domain/authorization.ts` | The current manager role has assigned-project read and operational capabilities, but not `projects.create`. The reference's New project control cannot be added as an enabled manager action. |
| `ProjectManagerWorkspace.test.tsx` | Existing coverage protects backend counts, unavailable values, URL filters, pagination, return paths, exact alert targets, revoked access, KPI availability and full-detail navigation. |
| `frontend/src/assets/projects-living-room.webp` | An existing wide neutral living-room image is available and was visually inspected. It fits the header direction without a new asset dependency. |

These are source-code findings. No live database, production state, or runtime baseline has been changed or verified in this specification stage.

## Scope and non-goals

In scope: dashboard presentation and responsive composition; functional list/grid selection; accessible search, filters, summaries, alerts, project navigation and KPI disclosure; dashboard regression tests and rendered QA.

Keep the existing application shell and navigation. Retain project detail, its eight tabs, full execution detail, operational actions, messages, leaderboard and bonus workflows. Changes to shared presentation helpers must preserve those consumers.

Out of scope: native mobile app redesign, role consolidation or assignment migration, project creation permissions, new project editing/deletion actions, financial or progress formulas, backend/API/schema changes, uploaded project photography, KPI policy changes, external services, deployment and database writes.

## Proposed composition

### Header

- Use the eyebrow Project Manager, the title Project Dashboard, and the authenticated user's name and current date. Do not copy the reference's sample person, date or counts into production.
- Place the existing living-room image toward the right of a shallow header, with a solid warm reading area for the title. Imagery is decorative and must not reduce legibility or dominate the operational content.
- Align the real connection indicator, Refresh projects and My KPI to the right where space permits; wrap them below the title on narrow layouts.
- Preserve the actual live, connecting, periodic refresh, offline and denied connection labels. A green live indicator is shown only for the live state.
- My KPI retains the existing expandable performance content, score sources and unavailable-policy message. Use an accurate expanded state and labelled region.

### Search and filters

- Use one full-width framed filter surface with a wide search field, Project status and Project health.
- Keep the search accessible name Search projects; placeholder: Search projects, clients or locations… . Preserve the current 160-character bound and all existing status/health options.
- Keep `q`, `status`, `health` and `offset` in the URL and preserve them when navigating into a project and back. Search/status/health changes reset project pagination.
- Native search and select controls remain keyboard and touch operable. Labels must remain available on mobile.

### Four summary metrics

- Show Active projects, At risk, Setup and On track in one horizontal summary region on wide screens, with strong numerals, concise supporting text and restrained semantic icons.
- Use backend counts unchanged. Retain the critical subcount and the explanation that counts follow search/status before health filtering.
- Preserve the current metric-to-health-filter behavior and selected-state semantics. Active projects clears the health filter while retaining search and project status.
- Keep the incomplete-source count/filter visible whenever nonzero.
- Use olive as the dominant accent, with muted rust/amber for actual risk and a restrained neutral treatment for setup. Avoid copying the reference's decorative mini bar charts, which have no supporting time-series data.

### Priority alerts and projects

- On wide layouts, use two adjacent bordered surfaces with approximately 36% of the available width for alerts and 64% for projects. Adjust the split or stack when the table and alert text cannot remain readable within the actual workspace width.
- Keep the dashboard in normal page flow. Per the user's follow-up request on 2026-10-28, Priority alerts and All projects each have an independent, keyboard-accessible content scroller with a responsive maximum height and native scrollbar when overflowing. Keep section headings, view controls and pagination outside their content scrollers. Short/empty content remains natural height; both areas still work when stacked on mobile. Desktop project column headings stay visible within the project scroller. Filter/page/view changes reset the relevant content to the top; periodic refresh does not reset it.
- Priority alerts show an icon, heading, backend total and concise description. Rows contain severity, title, source detail, project name, target section and a static opening affordance.
- Use the alert's project ID, tab, entity ID and offset for navigation. Do not infer client names from the current project page, match names as identifiers, or issue per-alert detail requests.
- Preserve preview, View all, Show preview and server pagination behavior. Filter changes continue to reset alert pagination. Long titles wrap without covering severity or navigation.
- The project heading shows the current filtered title and backend total. Keep the portfolio's `calculatedAt` as a clearly labelled view-level refreshed timestamp.

### Project list and grid

Default desktop presentation is a semantic table. Its columns are:

| Column | Content |
| --- | --- |
| Number | Current page offset plus row position; presentation only. |
| Project name | Stable-ID project link, small decorative interior thumbnail, approved net value as compact secondary information, and a short Details need review indicator when source notes are present. |
| Client | Existing `clientName`; a neutral unavailable value if absent. |
| Location | Existing `location`; a neutral unavailable value if absent. |
| Status | Existing project status with readable text. |
| Health | Exact backend health, including Critical, At risk, Incomplete, Setup, On track and Completed. |
| Progress | One execution progress indicator using `progress.actual`, with a readable percentage or Unavailable. |
| Target handover | Existing `plannedEndAt` or Not scheduled. |
| Open | An accessible project-opening link, without a nonfunctional overflow menu. |

- Keep approved net values sourced from integer paise, formatted through the existing money helper. Missing values remain Unavailable and source issues are signalled in both views. Per the user's follow-up correction, never print the full diagnostic paragraphs in dashboard cards/rows. Preserve full notes in a collapsed Project details to review disclosure after opening the project, including in full-detail mode.
- Use one common decorative default image with empty alternative text, not different stock pictures implying verified project photographs. On image failure, preserve the reserved space and readable identity.
- Provide working List view and Grid view controls with accessible names and selected states. Grid view presents the same returned page of projects and the same information and destinations. Use at most two project columns in the narrow right-hand panel.
- Store the selection as `view=list|grid` in the dashboard URL; default invalid or absent values to list. This is a frontend presentation parameter and must not be sent to the strict portfolio API query schema. Switching views preserves filters and pagination and does not request a different dataset.
- On compact screens, list mode uses readable stacked project rows instead of forcing a nine-column table across the viewport. Avoid duplicate focusable content or duplicated progress indicators when adapting the layout.

## Reference adaptations and rationale

| Reference feature | Design proposal |
| --- | --- |
| New project button | Omit for this role because project creation is not permitted. Do not add permissions or a dead button as part of a visual redesign. |
| Per-row Updated date | Show Target handover from the existing contract. Keep refreshed time at section level, where `calculatedAt` is truthful. |
| Different project photographs | Use the existing generic decorative interior image until an authenticated project-media contract exists. |
| Client/avatar in alert rows | Retain source-backed project/section context; do not manufacture a person or avatar. |
| Rounded white surfaces and tinted mini charts | Adapt to warm ivory, fine borders, small radii and restrained status accents, honoring the user's standing style constraints. |
| Sample counts and progress | Render real backend values, even when they differ from the screenshot. |

Recommended approach is the frontend-only redesign above. Extending the backend with actual per-project timestamps and authenticated photographs is a viable separate option, but would expand the contract, data-source and verification scope. This specification chooses the existing-contract approach; it does not silently expand permissions for screenshot fidelity.

## Visual system, responsiveness and accessibility

- Extend the existing Poppins typography and dashboard-local CSS tokens. Use a stronger heading hierarchy, comfortable table rows and tabular numerals; do not introduce Inter, Geist or Space Grotesk.
- Use warm ivory/stone surfaces, dark readable text and olive emphasis. Keep corners near the existing 2–4 px treatment, with no drop shadows, glass, harsh gradients, colored left stripes, neon effects or hover motion.
- Use small local SVG/CSS glyphs where needed. Do not introduce Lucide icons into the redesigned dashboard or change unrelated shell icons.
- At wide workspace widths, keep four metrics and the two-panel body. At intermediate widths, stack alerts and projects if either panel would become cramped; metrics can become two by two. At phone widths, use a full-width search field, wrapping/stacked filters, a two-by-two summary and single-column content.
- Preserve meaningful heading, reading and tab order: header, optional KPI, filters, summary, alerts, projects. Use native links/buttons and visible focus styles. Status cannot be communicated by color alone.
- Aim for WCAG 2.2 AA contrast; verify actual text and control colors. Primary touch controls should offer at least 44 px targets. Long project names, locations and alert titles must wrap without overlap.
- Provide purposeful loading placeholders with an accessible loading message, distinct empty and no-match states, initial-error retry, stale-refresh warning, offline state and access-denied replacement. Loading cannot display fake zero counts or fake project records. Any placeholder motion must stop under reduced motion.
- No animation library, chart library, 3D runtime or new dependency is needed for this work. Keep image space stable and avoid extra per-project/alert requests.

## Data, state and compatibility invariants

- Backend assignment scope and authorization remain authoritative. A denied portfolio response replaces previously visible project/alert content, including when a grid or KPI panel is open.
- Preserve API filters, paging limits, query keys, refresh cadence and mutation invalidation behavior. Presentation state must not alter business data.
- Keep At risk inclusive of Critical and counts independent of the selected health filter. Do not recompute totals from the current page or relabel critical projects as merely at risk.
- Progress remains backend-approved-scope based. Null progress is unavailable, not zero, and must not expose a determinate progressbar value.
- Preserve encoded IDs, alert tab/entity/offset, safe return paths, full-detail routes and retained dashboard view selection.
- Scope all new layout styles under a dashboard-specific root. Project details, dialogs and counterpart panels must not inherit dashboard table sizing, background imagery or split-panel rules.
- No database migration, external side effect or backend rollout is required. The frontend change can be reverted independently without data conversion.

## Risks and controls

| Risk | Control |
| --- | --- |
| Shared PM CSS changes project tabs or dialogs | Dashboard-specific root and focused detail regression/render checks. |
| Two panels become cramped with the existing sidebar | Validate inside the actual shell and stack based on usable content width. |
| Screenshot fidelity introduces invented data/actions | Apply the explicit reference adaptations above. |
| Grid/list duplicates content or loses URL state | Render one active presentation and verify filter/page/view return navigation. |
| Dense rows hide missing data or long alerts | Keep source issues and unavailable states readable; test asymmetric, long-content fixtures. |
| Fixture-only results miss real route wiring | Render the role's actual `/execution` route and `/home` redirect through the application shell with safe isolated test data. |

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification evidence required after implementation |
| --- | --- | --- |
| A1 | The shared manager dashboard visibly follows the reference's header, filter band, four metrics and side-by-side alerts/table hierarchy at wide widths. | Screenshot inspection in the real shell at 1920 and 1440 px wide, with enough projects/alerts to assess density. |
| A2 | Both existing role entry paths reach the same redesigned dashboard without changes to stored role, navigation destinations or permissions. | Route regression checks for `/execution` and `/home`; no project-creation action. |
| A3 | All numbers, health states, values, dates and alert context are source-backed. Missing values remain explicit. | Component tests with unequal projects, nonzero page offset, critical and incomplete states, null progress and null dates; counts exceed page size. |
| A4 | Search, status, health, summary filtering, pagination and list/grid selection work and preserve dashboard return state. | Interaction tests checking URL state, exact API parameters and return links. Verify `view` is absent from API queries. |
| A5 | Alerts retain correct deep links and expanded server pagination. KPI retains its existing policy and disclosure behavior. | Existing and extended alert/KPI tests; browser interaction with an alert and return navigation. |
| A6 | Loading, empty, no-match, initial-error, stale-refresh, offline and revoked-access states remain clear and safe in each presentation. | Focused state tests plus representative rendered states. |
| A7 | Layout is usable at 1024, 768 and 390 px, with a 320 px overflow check and 200% zoom review. | Rendered checks of wrapping, control access, focus, touch sizing and no page-level horizontal overflow; keyboard traversal and accessibility scan. |
| A8 | Project detail tabs, full execution detail and other PM consumers retain behavior and appearance. | Relevant PM detail/operational-access regression tests and one rendered detail check. |
| A9 | The integrated frontend compiles, builds, and passes applicable tests without new runtime/network errors. | Focused PM suite first; frontend typecheck, test suite and production build; browser console/network inspection; `git diff --check`. |

Expected verification commands include `npm test -- src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx` from `frontend/`, followed by the applicable broader frontend checks. There is no repository lint script; no lint success should be claimed. Backend suites are not required for an unchanged backend contract. Store temporary QA screenshots outside tracked product assets and report their paths.

## Assumptions and open decisions

- The request concerns the shared web dashboard shown in the reference, not the native app or all eight project-detail tabs.
- The screenshot establishes composition and emphasis; standing style constraints and existing permissions/data remain applicable.
- The list/grid switch is included as functional presentation behavior. The unsupported New project action and per-project Updated field are adapted as described.
- No blocking product questions remain with these assumptions. Specification approval accepts these boundaries and adaptations.

The specification and separate task plan were approved, and the user selected Mode A. Implementation and verification are recorded in [the task plan](../plans/2026-10-28-project-manager-dashboard-reference-redesign.md). No commit, deployment or data mutation was performed.
