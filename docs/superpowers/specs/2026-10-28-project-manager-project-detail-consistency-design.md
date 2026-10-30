# Project Manager project-detail visual consistency

Date: 2026-10-28
Status: Approved by the user; implemented and locally verified on 2026-10-29. See the [implementation record](../plans/2026-10-28-project-manager-project-detail-consistency.md) for results and verification limits.
Classification: Substantial frontend redesign; existing data and workflow contracts remain unchanged

## Goal

Redesign the opened Project Manager / Site Manager project screen shown by the user so it belongs to the same visual system as the redesigned Project Dashboard. Improve the project header, navigation, progress presentation, source-note disclosures, and room/trade layout while preserving every existing project workflow.

The user's direction is consistency with the remaining screens. Earlier feedback also establishes compact cards without long diagnostic paragraphs. This specification covers the opened project, a screen that the approved dashboard redesign deliberately preserved.

## Current behavior and evidence

| Area | Current evidence | Design implication |
| --- | --- | --- |
| Route and role | `frontend/src/app/router.tsx`, `ProjectExecutionRoute`, renders `ProjectManagerProjectPage` for canonical role `site_manager` at `/projects/:projectId/execution`. Other roles use `ProjectExecutionPage`. | Redesign the existing shared PM route; do not create a second Site Manager implementation. |
| Page composition | `ProjectManagerWorkspace.tsx` contains the project header, overview-note disclosure, eight navigation links, SitePanel and Room. The header displays project identity, health, approved net value, handover, My KPI and Open full detail. | These are the existing content/actions to organize, with no new endpoint required. |
| Visual mismatch | The dashboard has scoped ivory/olive tokens, an image-backed header and refined spacing in `project-manager-dashboard.css`. The opened project still relies on `project-manager.css`, with a plain header, full-width progress band and minimally padded room content. | Apply the dashboard visual language to the project screen through a dedicated scope. |
| Source notes | Project overview notes are already collapsed. `PMIssues` expands one or two notes by default. Room renders `room.description` directly above its trade table; the supplied screenshot shows an internal estimate-line identifier there. | Keep diagnosis available on demand, without long technical text in the initial room presentation. |
| Progress | `PMProgressBar` preserves numeric zero versus null; `PMProgressBasis` explains calculated progress. Overall planned/actual and verification counts are server-provided. | Improve hierarchy without recomputing or disguising unavailable values. |
| Trade layout | Room tables show scope, vendor, reported progress, verification and an Open link. At narrow widths the current shared CSS imposes a 640px minimum table width. | Provide a readable mobile row layout instead of requiring horizontal page scrolling. |
| Shared consumers | `PMRequestsPanel` is also used in assigned Procurement/Designer workspaces. `PMShared`, `project-manager.css` and `pm-operations.css` are shared by records and dialogs. | New styles and optional presentation changes must be restricted to this project screen. |
| Navigation and state | URL parameters preserve `tab`, `entity`, `tabOffset`, `assignment`, `detail` and a validated `returnTo`. Source tokens, versions, stale-query guards and API-provided actions protect mutations. | Preserve routes, exact target IDs, query behavior and action eligibility. |
| QA support | Existing PM workspace/operational tests and opt-in `enterpriseProjectManagerData.ts` exercise the actual app shell and routes. | Extend existing fixtures for representative project details rather than introducing a separate static mock page. |

These findings come from the current source and user screenshot. No live project records were read or modified for this specification.

## Scope and assumptions

In scope:

- The opened project's header, metadata, My KPI entry, full-detail entry, review disclosure and section navigation.
- A complete visual redesign of the default Site section: progress summary, source-note treatment, room headings, room progress and trade rows.
- Consistent surfaces, typography, section headings and spacing around all eight existing project sections. Preserve the internal forms/actions and content of the other sections.
- Responsive, loading, empty, error, stale, unavailable and denied states for the affected presentation.
- Presentation-only improvements that keep long source explanations out of the initial room/card view while preserving the original content in disclosures.

Assumptions:

1. “Matching remaining” refers primarily to the approved Project Dashboard's warm ivory, olive, Poppins typography, restrained borders and compact controls.
2. All eight sections remain: Site, Procurement, Selections, Critical Supply, Vendors, Client, Snagging and Quality. Their order and meaning do not change.
3. Existing image assets may be reused decoratively. No real project-photo source is currently provided, so imagery must not imply a photograph of this project.
4. The separately proposed read-only estimate/vendor-suggestion workflow remains pending. This visual redesign does not authorize or implement it, and does not add a nonfunctional estimate button.

Out of scope:

- Backend/API, permissions, assignment rules, financial calculations, risk/KPI definitions or workflow changes.
- Rebuilding the embedded full execution workspace, operational dialogs, counterpart-role screens, global shell or dashboard.
- New charts, time series, performance scores, dates, counts, fabricated progress or other unsupported information.
- New dependencies, icon packs, fonts, generated imagery, 3D, animations, remote component generation, deployment or data migration.

## Design direction

Use a compact operational workspace with one clear hierarchy: project identity, current execution position, then room-level work. Preserve generous separation between sections without stretching a small amount of content into large empty bands.

| Element | Direction |
| --- | --- |
| Canvas | Dashboard warm ivory, `#f3f2ec`, filling the PM workspace consistently |
| Main surfaces | Dashboard off-white, `#faf9f4`, with fine `#dcded2` borders |
| Text | Dark olive-black `#20271f`; muted supporting text `#62685f` |
| Actions | Olive `#556348`; existing semantic warning/critical colours only for real states |
| Type | Existing Poppins; bounded 28–36px project heading, 17–20px section headings, readable 12–14px content |
| Spacing | Consistent 8/12/16/24px rhythm, aligned content insets, compact metadata |
| Shape | Existing restrained 2–4px radii; no shadows, glass, coloured side stripes or decorative card grid |
| Imagery | Shallow existing interior artwork at the header's edge, with a solid readable text area; reduced or omitted when space is constrained |

Reuse semantic PM variables and established components. Do not introduce a competing theme or duplicate arbitrary colours across new selectors. No 21st component tool is available in this session; the existing system already supplies the required patterns.

## Proposed layout and interactions

### 1. Project header

- Keep a clear **All projects** back link above the project identity. Preserve its existing validated return URL, including dashboard filters, page and list/grid choice.
- Use a shallow bordered header consistent with the dashboard. Place the project name and exact health badge together; client and location form a restrained secondary line.
- Present **Approved net value** and **Target handover** as labelled metadata with clear value emphasis. Do not silently convert unavailable values into zero or substitute a date.
- Align **My KPI** and **Open full detail** as a compact action group on desktop. Stack or wrap them in reading order on mobile, with accessible touch targets.
- Preserve My KPI's disclosure state and existing policy-unavailable behavior. Preserve Open full detail, assignment-only deep links and Back to project tabs.
- Header imagery is decorative and noninteractive. Reserve its space and maintain readable contrast if the asset fails.

### 2. Review notes and navigation

- Keep **Project details to review (N)** as a compact, initially collapsed disclosure. Use a clear warning cue and count without repeating the full technical text outside it.
- Retain all original overview messages inside the disclosure. It remains available in both normal tabs and full-detail mode.
- Place section navigation in one visually coherent band, with olive selection emphasis and readable labels. Maintain actual links and `aria-current="page"`; do not apply tab-widget roles without implementing that keyboard model.
- On mobile, allow the navigation rail to scroll horizontally within its own region when needed. Keep the active section and keyboard focus reachable without page-level horizontal overflow or a multi-row collection of oversized buttons.
- Changing sections preserves the established URL/state rules. Do not add navigation-induced data mutations or extra background requests.

### 3. Site execution summary

- Give Site execution a concise heading and supporting sentence, followed by one compact summary surface.
- Emphasize **Overall reported progress**, with its real percentage or **Unavailable**. Retain the progress indicator's accessible label and the distinction between null and 0%.
- Place planned progress, site-verified count and client-accepted count in a restrained facts row within the same surface. They are labels and values, not separate feature cards or derived scores.
- Keep **How progress is measured** in an initially collapsed disclosure within this summary. Preserve its explanation of weighting, coverage, schedules and verification.
- Present Site source notes as a compact initially collapsed disclosure, including when there is only one note. Do not change default note expansion on unrelated shared consumers.
- Do not make an unavailable project look healthy or completed. Health text, count units, progress basis and source lineage retain their existing meanings.

### 4. Rooms and trade rows

- Each room has a padded heading with room name, trade count and clearly aligned room progress. Use consistent inner padding so progress and notes do not touch the panel edges.
- Move the room's potentially long `description` into a compact **Room details to review** disclosure when present. Retain its exact text inside. No raw estimate-line IDs or diagnostic paragraphs appear in the initial room presentation.
- Keep all room work accessible; do not introduce room collapsing that hides a deep-linked target. Large room collections remain in normal page flow, with no new whole-page height lock or room-by-room nested vertical scrollers.
- On desktop, use a dense, readable table: Trade / scope, Vendor, Reported progress, Verification and Open. Improve column alignment and metadata hierarchy without changing any underlying status or value.
- Preserve concise operational reasons such as overdue or missing update. Longer descriptions must have an explicit disclosure or detail destination rather than silently disappearing through clipping. Action-blocking validation remains immediately visible where the action is taken.
- Separate the status badge from the numeric progress presentation. Keep site verification and client acceptance as distinct labelled facts.
- On mobile, adapt each trade to a labelled stacked row, with its title/vendor first, progress and verification next, and a clear Open action. Preserve table/row semantics or an equivalent accessible structure; render each action and progress indicator once.
- Open continues to use the stable assignment ID and existing full-detail query. Preserve targeted entity IDs, scrolling, focus and pagination behavior.

### 5. Other sections and embedded full detail

- Procurement, Selections, Critical Supply, Vendors, Client, Snagging and Quality inherit the same project header/navigation and consistent section spacing and surface tokens.
- Existing forms, workflow instructions, evidence, required reasons, ownership, status, pagination and mutation guards remain functional and available. This scope does not reorganize their business workflows.
- Restrict new Site table/room selectors to the Site presentation. Do not inadvertently restyle or hide content in the embedded `ProjectExecutionPage` or dialogs rendered through portals.
- Shared helper changes, if needed, must be backward-compatible opt-ins. Counterpart Procurement/Designer workspaces retain their current behavior and appearance.

## Data, API, state and authorization invariants

- Continue using the existing overview, panel, KPI and execution queries; backend authorization remains authoritative.
- No new persistence or mutation is introduced by opening the redesigned page or expanding notes. Disclosure state is local UI state and must not reset on every polling response.
- Financial amounts remain sourced from integer paise and formatted through the established helper. Preserve approved net value before GST; do not relabel it as a total including tax.
- Preserve every API-derived action, source-token requirement, expected-version check, evidence requirement, idempotency key and mutation invalidation path.
- Preserve stale-data warnings. A 401/403/404 after prior success must remove protected content/actions as the current query boundary requires.
- Preserve real loading, initial failure/retry, empty project/room, unavailable progress and unavailable source states. Do not show a successful state just to complete the layout.
- Same project IDs and assignment IDs must be used across navigation, presentation and existing actions. Names remain labels, never join keys.

## Responsive, accessibility and performance constraints

- Verify 1920/1440px desktop, intermediate 1024/768px widths and 390/320px mobile, plus 200% text/viewport zoom and long content.
- Avoid page-level horizontal overflow. Horizontal navigation or an exceptional data region must remain local and keyboard-operable; the normal mobile trade layout should not require a 640px-wide table.
- Retain semantic headings, accessible control names, visible focus, adequate contrast and 44px touch targets where appropriate. Disclosures must work with keyboard and assistive technology. No hover-only actions.
- Respect reduced motion. No decorative animation is needed for this operational screen.
- Reuse the existing cached asset and components. Do not add a heavy UI/runtime dependency, unnecessary query or high-frequency rendering state.
- Verify with representative long source notes, long project/vendor/trade names, several rooms, many trades, null and zero values, and partial verification. Small placeholder content alone is insufficient.

## Risks and containment

| Risk | Containment |
| --- | --- |
| Shared CSS changes affect the dashboard, dialogs or other roles | Dedicated project-detail root/stylesheet, scoped selectors, backward-compatible helper options, visual checks of shared consumers |
| Compact presentation hides missing data | Keep unavailable labels and warning counts visible, preserve full text in disclosures, never hide blocking validation |
| Mobile transformation loses semantics or duplicates controls | One rendered row/action per record; inspect accessible names and keyboard order |
| Deep links or full-detail handoff regress | Preserve URL builders and stable IDs; exercise entity, tabOffset, assignment-only and return-navigation flows |
| Header artwork reduces contrast or wastes mobile space | Restrained crop, solid reading area, responsive suppression and asset-failure check |
| Existing dirty work is overwritten | Preserve the completed dashboard, compact-note and independent-scroll changes; capture per-target diffs before implementation ownership is assigned |

## Acceptance criteria and verification

| ID | Acceptance | Required evidence |
| --- | --- | --- |
| A1 | Opened project visually matches the dashboard's colours, type, controls and spacing | Rendered side-by-side review using the actual app shell and screenshots |
| A2 | Header metadata and existing actions remain correct | Tests for exact values, nulls, KPI availability, full-detail entry and return navigation |
| A3 | Initial project/Site/room presentation contains no long technical paragraphs or raw line IDs | Long-note fixtures; disclosure tests confirm original messages remain reachable |
| A4 | Actual/planned/room/trade progress and verification remain source-backed | Unequal values including 0 and null, correct labels/counts, unchanged progress basis |
| A5 | All eight sections and existing operational handoffs remain available | PM workspace/operational/requests/operations tests, route and target-ID regression checks |
| A6 | Mobile trades are readable and keyboard accessible without page overflow | 320–1920px and zoom matrix; keyboard/focus and rendered accessibility checks |
| A7 | Loading, empty, error, stale and revoked-access states remain correct | Deterministic query-state fixtures and post-success denial tests |
| A8 | Dashboard and counterpart screens retain behavior | Existing dashboard scroll/compact-content checks plus representative shared-consumer regressions |

After implementation, run focused PM tests, relevant router/route-path tests, frontend typecheck and production build, and `git diff --check`. Broaden testing if shared helper changes warrant it. There is no repository lint script. Backend/OCR checks are unnecessary unless the approved implementation scope changes. Use local synthetic data for screenshots and keep QA artifacts outside product sources.

Historical dashboard results are context, not verification of this new screen. This specification stage runs no application tests or live mutations.

## Compatibility, rollback and approval boundary

No migration, backend deployment or data repair is needed. A rollback removes only the new project presentation/opt-in styling while retaining existing workflows and all previously completed dashboard refinements.

Initial dirty work comprises the dashboard workspace/tests/router-test changes, operational fixture correction, dashboard components/styles/QA fixtures, the approved dashboard spec/plan, and the pending estimate/vendor-handoff spec. Those changes are preserved. This stage creates only this separate specification.

There are no unresolved product decisions required to prepare the task plan: use the existing dashboard language, redesign the project shell and Site content, preserve all workflows, and keep the separate estimate/vendor request pending. After specification approval, create the separate task plan and follow the remaining repository approval/execution gates. No implementation, staging, commit, push, deployment or external action is performed at this stage.
