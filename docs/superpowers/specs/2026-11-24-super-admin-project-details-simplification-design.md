# Simple Super Admin project details

Date: 2026-11-24
Status: Approved and implemented in Mode A. Focused tests, typecheck, build and rendered verification completed on 2026-11-24.

## Goal

Make the Super Admin project details page easy to understand and operate. Prioritize the project's essential facts, captured Client persona, and assignments for Designer, Procurement and Project Manager. Keep the existing top-right project stage/owner chip.

This is a frontend-only information-layout change using existing data and controls.

## Current behavior and evidence

Inspected the current worktree; `git status --short` was clean before this specification. Earlier changes are now part of the current baseline and must be preserved.

- `frontend/src/features/admin/AdminProjectDetailPage.tsx` serves `/admin/projects/:projectId` for both Admin and Super Admin. It repeats Client/location/property/estimate facts across a summary strip, expanded detail sections and a sidebar. It also renders the assignment area, design workflow, vendor work, finance, entire workflow snapshot and Client response history in one long page, with illustrative artwork.
- `frontend/src/features/admin/ProjectPeopleAssignments.tsx` already contains separate Designer, Procurement, Project Manager and Trade teams editors. Hidden responsibility panels currently remain mounted, so opening the page can fetch unrelated assignment data.
- `AdminProjectSummary` extends `ProjectInitiationMetadata`. `backend/src/repositories/admin-project-summary.ts` already includes captured intake metadata in the existing response. The shared metadata supplies native place, known/preferred languages, self-use/rental category, tentative budget and tentative closure date. The detail page does not currently organize these as a Client persona.
- `DesignAssignmentPanel.tsx` uses the existing Designer assignment endpoint and backend-derived eligibility. `WorkerAssignmentPanel.tsx` manages Procurement separately from site execution and validates project/estimate identities. `ProcurementProjectIdentityPanel.tsx` manages the canonical Project Manager and city with version checks. These behaviors must be reused.
- `AdminProjectDetailPage.test.tsx` already covers approval gates, cross-project finance integrity, missing baselines, distinct Procurement/Project Manager options, unsaved selection preservation and completion eligibility. Existing assignment component tests cover the underlying mutations.

## Recommended presentation

Use three named views within the existing project route, with **Project details** selected on first entry:

1. **Project details**: a concise, readable field list.
2. **Client persona**: captured Client/contact/intake information.
3. **Assignments**: Designer, Procurement and Project Manager responsibilities, one editor visible at a time.

Use the existing page header and muted product colors with a flat field layout, restrained borders and clear labels. Remove the illustrative hero/sidebar imagery and duplicated summary/team blocks from the Super Admin composition. Do not add gradients, decorative icons, hover animations, cards in a three-column grid or new dependencies. Reuse existing fonts and controls. Avoid new Lucide usage.

This follows the existing role-specific assignment structure; a new route family or assignment system is unnecessary.

### Shared header and navigation

- Project name and human-readable Project ID.
- Existing project stage/owner chip aligned top-right on desktop; wrap cleanly on narrow screens.
- Back to All Projects and existing project chat navigation.
- Keep the authorized Close project action and its existing completion checks reachable from the header.
- Present the three view selectors together with clear selected state and associated named content. Native button-group semantics with `aria-pressed` are sufficient; if ARIA tabs are used, implement their keyboard behavior completely.
- Existing Manage people/Assign Designer entry points must open the appropriate Assignments view and responsibility, then focus/scroll to its heading. Preserve existing relevant assignment anchors rather than leaving links aimed at hidden content.

### Project details

Show each fact once:

- Project name and Project ID in the header.
- Location, property type and created date in the detail view.
- Initial captured budget range when available.
- A single clearly labelled estimate total including all taxes, using the current approved-baseline rules. Keep the distinction between current estimate and Client-approved value; do not calculate a replacement total or show GST/round-off as extra summary rows.
- Compact current next action and assigned Sales contact when captured.
- Internal system ID available under a secondary Technical details disclosure, outside the main header.

Use “Not captured”, “Unassigned” and “No estimate yet” where applicable. Invalid or absent dates must not crash rendering. Do not invent an expected handover date from tentative sales closure.

### Client persona

Read-only presentation of existing captured data:

| Label | Existing source |
| --- | --- |
| Client name, email, mobile | `project.client` |
| Native place | `nativePlace` |
| Preferred language | `preferredLanguage`, labelled with shared language options |
| Languages known | `languagesKnown`, labelled with shared language options |
| Purpose | `category`: Self use or Rental |
| Tentative budget | `tentativeBudget`, preserving the captured text |
| Tentative closure date | `closureTentativeDate`, formatted as a calendar date |

Missing historical fields show an explicit empty state. “Persona” means these captured intake facts; this change does not create inferred personality traits, household details, design preferences, new intake fields or persona editing. Do not link to role-restricted Sales screens as a workaround.

### Assignments

Primary responsibility choices are **Designer**, **Procurement**, **Project Manager**, in that order. Use existing eligibility and permission rules, current assignee/options, reason fields, save actions and mutation handlers. Keep Procurement and Project Manager distinct.

- Designer: reuse `DesignAssignmentPanel`; retain initial approval gating and lock conditions.
- Procurement: reuse the Procurement-scoped `WorkerAssignmentPanel`; preserve task/estimate matching and override reasons.
- Project Manager: reuse the canonical `ProcurementProjectIdentityPanel` when authorized with a dropdown-only assignment presentation and `expectedVersion`; keep the existing authorized fallback for callers without identity-management permission. Do not write the same assignment through a second new handler. Per the user’s follow-up, omit search/city text inputs in this primary assignment view. Assignment saves omit `cityName`, preserving the existing city through the already-supported PATCH contract. Ordinary Admin keeps its existing city/search editor. Make all eligible managers reachable through dropdown options, including later option pages, with button-based loading/retry.
- Preserve edited selections and reasons when switching responsibilities or main views within the same project. Reset them on a project identity change, and retain existing stale-version recovery.
- Avoid mounting unused editors on initial page load. After first opening, preserve their drafts while hidden; hidden controls must not be focusable. Reuse existing query keys so shared reads are deduplicated.
- Missing permission or unmet workflow prerequisites produce the existing read-only/blocked explanation, never an enabled mutation.

### Secondary project tools

Keep these features reachable behind one collapsed **More project tools** section, away from the primary facts and assignment choices:

- Finance details using the existing permission, approved-source identity and baseline checks.
- Design workflow and vendor work details.
- Entire workflow snapshot.
- Client response/delivery history and authorized Review Client response link.
- Trade-team assignments using the existing editor, gates and queries.

Opening a tool reveals only its selected existing panel. Preserve drafts after first use where a tool contains a form. Initial rendering of the three primary views must not fetch the finance ledger, trade assignments or operational panels solely because they exist in hidden markup. Existing permitted features remain accessible; this is not a removal of operational capabilities.

## Scope and compatibility

- Primary target: the Super Admin rendering of `/admin/projects/:projectId`.
- The ordinary Admin presentation and permissions remain unchanged. If shared components gain presentation/visibility props, their defaults must preserve other callers.
- Likely frontend areas: `AdminProjectDetailPage.tsx`, its scoped stylesheet/tests, `ProjectPeopleAssignments.tsx` and narrowly scoped presentation adapters or props needed to reuse the existing assignment panels. Prefer small presentational extraction over duplicating assignment business logic.
- Existing backend endpoints, storage, approval history, financial calculations, mutation payloads, authorization and query invalidation stay unchanged.
- Do not restore project/floor progress percentages or bars removed in the preceding task. Task-level work reporting remains available in secondary tools.
- No dependency/lockfile change, backend work, migration, commit, push, deployment or customer communication is included.

## Data, permissions and failure handling

- Read facts/persona from the existing `getAdminProject` response, joined by route/project ID. No persona endpoint or extra personal-data lookup is needed.
- Preserve per-operation checks: project read, Designer management, worker assignment override, Project Manager identity management, finance read, Client response read and project completion decision.
- Keep all existing mutation version/reason requirements, server errors and cache invalidation families. A successful assignment must refresh its saved owner and the stage/owner chip through the established workflow keys.
- Loading, empty, failed, denied and stale reads remain explicit. A denied response must not reveal retained details from another project or unlock an editor.
- Project switches must not retain the previous Client persona, assignment selection, query data or editor draft as the new project's content.
- No financial/state migration or rollback operation is required; rollback is reverting this UI composition while retaining existing components/contracts.

## Risks and mitigations

- **Hidden forms losing drafts:** mount on first visit, preserve within the same project, test navigation with pending selections and reasons.
- **Removed entry points:** exercise all secondary-tool links and header actions; preserve permissions and legacy assignment anchors.
- **Unnecessary background reads:** verify request counts before and after opening each view/tool.
- **Shared Admin regressions:** scope the new composition to Super Admin and keep focused Admin coverage.
- **Incorrect persona/financial labels:** use captured metadata and existing approved totals; distinguish closure date from handover and tentative budget from the approved quotation.

## Acceptance criteria

1. Super Admin opens a concise Project details view with no duplicate summary/sidebar artwork or automatically expanded operational panels. The project ID, actual stage/owner chip and authorized header actions remain available.
2. Client persona displays the existing captured fields above, including honest missing-value states, without new backend data or inferred information.
3. Assignments clearly separates Designer, Procurement and Project Manager. Authorized assignments/reassignments continue to work with their existing gates, version/reason handling and refreshed saved state; drafts survive view switches within a project.
4. Finance, workflow, vendor work, Client response history and Trade teams remain accessible through More project tools. Unopened tools do not create unnecessary requests.
5. Ordinary Admin behavior, money/approval lineage, project isolation and absence of project-progress displays are preserved.
6. Keyboard navigation, focus, selected-state announcements, long content and layouts work at desktop, tablet and mobile widths without body overflow.

## Verification required after implementation approval

Use focused tests for the changed page/presentation and existing assignment/finance/completion components affected by rendering changes. Include two differently identified projects with unequal totals and different assignees. Cover missing persona data, permission denial, initial-approval/design-lock states, loading/error/retry, unsaved edits, stale versions, lazy requests, secondary-tool access and project switching. Run frontend typecheck/build and `git diff --check`; no full-suite expansion unless an actual shared regression warrants it.

Inspect real rendered Super Admin views at 1440, 768 and 390 pixels with synthetic data, exercise assignment navigation and keyboard focus, and inspect the unchanged ordinary Admin path. Use rendered accessibility checks. Implementation verification is recorded in the companion task plan below.

## Assumptions and open decisions

- Persona means the intake information already saved, as listed above.
- Simplification relocates detailed operational controls rather than deleting their capabilities.
- Existing project route with three local views satisfies “assignment screen”; no separate backend or top-level navigation feature is needed.
- Specification and task plan were approved, and the user selected Mode A. No open product decision remains.

## Implementation outcome

All six acceptance criteria were implemented and locally verified. See the [task plan and exact verification results](../plans/2026-11-24-super-admin-project-details-simplification.md#implementation-and-verification-results). No backend/API changes, new dependencies, migration, deployment or production mutation were performed.


## Follow-up clarification: dropdown-only assignments

The user’s screenshot feedback narrows the existing assignment presentation: Designer, Procurement and Project Manager assignments use dropdowns with no text fields. Designer/Procurement already satisfy this. The primary Super Admin Project Manager editor will remove the search and city text inputs, retain dropdown selection/save and version conflict behavior, and preserve city without resubmitting it. The existing backend supports omitted `cityName`; no backend/API behavior or role permission changes are required. This is a presentation refinement of the approved Mode A task.

Acceptance: no textboxes in any primary assignment responsibility; a manager selected from any options page can be saved; city is absent from the assignment PATCH; pending choices survive navigation; stale/error/denied states and ordinary Admin defaults remain correct.

Follow-up implemented and locally verified: all three primary assignment roles render no text fields; 43 integrated tests, typecheck, build and desktop/mobile rendered checks passed. Exact evidence is recorded in the companion task plan.


## Follow-up clarification: saved estimation location (2026-11-25)

The user wants the location collected during estimation visible under Project details. Current Sales initiation saves confirmed `cityName` separately from the legacy `location` string; the Admin summary only exposes the latter, which can be empty. Preserve a populated Location field. Otherwise, display the saved **Project city** read-only using the existing project identity query, with its existing read permission and route/project ID validation. Do not copy city into legacy location, infer it from an address, or introduce another city input under Assignments.

This stays frontend-only and inside the approved project-details scope: reuse `getProcurementProjectIdentity` and its query key rather than changing backend responses. Only fetch for the missing-location case while Project details is active and the existing permission allows it. Show explicit loading, unavailable, error/retry and genuinely missing states; never show another project's or denied cached city. Existing nonblank locations and dropdown-only assignment behavior remain intact.

Acceptance: a project with empty legacy location and a saved estimation city shows that city under Project details; an existing location remains visible without an extra city read; missing/failed/denied/mismatched records remain honest and isolated.

Location follow-up implemented and locally verified on 2026-11-25: 47 focused tests, typecheck, build and desktop/mobile rendered checks passed. Existing location remains authoritative when present; otherwise the saved Project city appears read-only.
