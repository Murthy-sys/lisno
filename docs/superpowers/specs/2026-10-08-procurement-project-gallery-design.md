# Procurement project gallery

## Goal and authority

Redesign the Procurement project-list screen to follow the user's supplied reference: a heading and search/status controls, two summary panels, and image-led project cards with approval status, estimate version, project identity, financial values and a clear View project action.

This is a new request after the completed Procurement mode-group redesign. It preserves that work and all current procurement behavior. This document is the specification only. The separate task plan and implementation follow the repository's approval gates.

## Current behavior and evidence

- `frontend/src/features/procurement/ProcurementWorkspace.tsx` renders the authorized projects as horizontal rows. Each row already has the project name, approved estimate version, selected section count, Design approved badge, selected estimate value, recorded spend, remaining selected value and a link to the project.
- `frontend/src/app/router.tsx` mounts this component at `/procurement` and within the Procurement user's `/home` view. The project-detail route is `/procurement/projects/:projectId`. Both existing list entry points should receive the same redesign.
- `useProcurementProjects` in `procurementPresentation.ts` uses the existing `procurementKeys.projects` query and validates project identities, expense lineage and integer-paise reconciliation. Its display projection excludes zero-value items/sections. These rules remain authoritative.
- `ProcurementProject` in `frontend/src/api/types.ts` already provides `taskStatus` (`open`, `in_progress`, `completed`), `openedAt`, project ID/name, estimate ID/version and sections/items. It does not provide a client name, cover image, photo count or gallery.
- `backend/src/services/procurement.service.ts` reads only Design-approved, client-approved projects in its existing authorized snapshot transaction. The resolved Project query currently selects `_id` and `name`. The Project model already stores `clientName`; returning that existing field requires a small additive read-only projection change, not a new lookup or model.
- Existing styling is in the `.procurement-workspace` and `.procurement-project-card` sections of `frontend/src/styles/index.css`. The redesigned region should use scoped styles and avoid changing unrelated project/detail layouts.
- Local visual assets include `projects-living-room.webp`, `project-card-default.jpg` and category thumbnails. Small 320 px basket thumbnails should not be stretched into large project covers when higher-resolution imagery is available.
- Existing `ProcurementWorkspace.test.tsx` covers navigation, empty/error states, authorization refresh and financial-integrity rejection. Those assertions must be retained or adapted only for the new visual structure.

The worktree already contains 29 paths from the completed mode-group request. Overlapping targets include `procurement.service.ts`, `ProcurementWorkspace.test.tsx` and the enterprise fixture files. Preserve their current changes; capture fresh status and per-target diffs before assigning writers. No previous verification count substitutes for verification of this redesign.

## Scope and non-goals

In scope: the project-list composition, responsive cards, generic cover imagery, search, status filtering, two read-only summaries, accessible metadata and the minimal API field needed to display real client names.

Existing basket groups, item selection, Standard/Special behavior, pricing modes, financial calculations, project-rate overrides, approvals, tender/BOQ scope, dispatch, orders and project navigation retain their current behavior. This does not introduce a project photo gallery, media upload, cover editor, new workflow status, pagination, financial metric or procurement mutation.

No dependency installation, schema migration, data backfill, seed, commit, deployment or external communication is included.

## Design and interaction requirements

### Header and controls

- Retain the eyebrow `Project procurement`, title `Procurement` and existing description about viewing estimate budgets and managing procurement items.
- Place an accessible `Search projects` input and `All status` select at the right on wide screens. Stack or wrap them on smaller screens without squeezing the heading or controls.
- Search locally by trimmed, case-insensitive project name, preserving the existing server order. Clear search is keyboard accessible and returns focus to the input. Do not issue new requests as the user types.
- Status options map directly to the existing procurement task: All status, Open, In progress and Completed. Filtering never derives status from spend, estimate version or the visual approval badge.
- Show the total project count. When filtered, make the scope explicit with `X of Y projects`; do not imply that hidden projects or their values were deleted. Provide a clear reset action when filters produce no results.
- The Design approved badge indicates the existing eligibility rule for the list. It is separate from procurement task status and remains valid for every returned project.

### Summary panels

- Match the reference's two-panel hierarchy: a smaller Total projects panel and a wider Total selected value panel. On mobile they stack.
- Total projects is the count of the full valid authorized list. Total selected value is the sum of the existing per-project selected-estimate values. Both remain full-list summaries during local filtering; a concise caption or accessible description makes that scope clear.
- Derive the sum from the validated existing source with integer-paise arithmetic. Guard aggregate overflow across projects even though individual project values are already checked. Do not silently round, clamp, use floating-point rupees or display zero for unavailable data.
- Hide stale financial cards/summaries on access denial, request failure or integrity failure, preserving the existing recovery behavior. Successful empty data may display truthful zero summaries alongside the empty state.
- Keep summary symbols decorative and use small inline SVGs. Use the application's neutral and green palette; the reference establishes structure rather than requiring its purple accent.

### Project cards

- Use four compact cards across on desktop, stepping down to three/two at intermediate widths and one on narrow screens. This follows the user's implementation feedback on 2026-10-08 to reduce card size and display four cards per row.
- Each card has a shallow landscape cover at approximately 3:1, a Design approved badge over the upper-left corner and a small selected-item count near the lower-right corner. Keep typography, padding and vertical gaps compact without clipping metadata or money.
- The count is the actual number of displayed positive-value approved line occurrences across the project's sections, not a photo count, unique catalogue count or invented number. Use an item/list symbol and a visible or accessible label such as `12 selected items`. Retain selected section count as concise supporting metadata or accessible description so that existing information is not lost.
- Below the photo, show `Estimate vN`, the real project name, the procurement-opened date and the real client name where recorded. Avoid fixed-height text that clips long names. Date metadata must be accessible as `Procurement opened …`; do not imply that `openedAt` is the project creation date or a separate approval timestamp.
- Use the existing date formatter where suitable. Invalid/missing display metadata is omitted or shown explicitly as unavailable without inventing a date or client.
- Present Selected, Spent and Remaining in three aligned columns, retaining accessible descriptions for Selected estimate value, Recorded spend and Remaining selected value. Reuse the existing per-project helpers and `formatPaise`. Remaining is the existing selected value minus recorded spend and may be negative; do not clamp it to zero or relabel it as an approved procurement budget.
- Keep amounts unbroken where possible. Reflow the financial row when long rupee amounts cannot fit; do not hide digits, ellipsize values or shrink text excessively.
- Provide the wide `View project` action at the bottom, using the exact current route builder and project ID. Prefer one native link per card with the existing accessible name `View procurement items for <project name>`; avoid nested interactive controls or duplicate tab stops.
- Use restrained borders, existing typography and warm neutral surfaces. Keep padding compact and proportional to the reference, without fixed empty space. Do not add drop shadows, gradients, hover motion, animated arrows, glass effects or new Lucide icons.

### Cover imagery

- Covers are generic representative interiors, as permitted in the preceding image requests. They are decoration rather than evidence of the customer's actual project or uploaded files. Use empty alt text and a concise page-level indication such as `Representative interiors`.
- Reuse a suitable existing living-room image. If the repository has no suitable bedroom/kitchen covers, create two generic landscape interior assets during implementation, optimize them as local WebP and record their provenance. Do not fetch arbitrary customer or external-site photos.
- Assign covers deterministically using stable project IDs so search/reordering/refetch does not change a project's image. Never use image choice, project names or array positions as business identity.
- Reserve the image space to prevent layout shifts. Use lazy loading below the first row. Failed images use a static neutral skeleton that leaves badges, totals and navigation usable. No gallery action or false photo count is added.

## Data, compatibility and permissions

The only planned API addition is `clientName: string | null` on the existing Procurement project DTO. Read it from the already-resolved, same-project Project document by adding `clientName` to the existing projection. Normalize blank/missing legacy values to null. Do not source it from another project, user search, estimate owner or a new per-card request.

The frontend accepts absent/null client names for compatibility with older responses and historical records. Update the applicable public API schema/inventory if that route is explicitly documented, but do not change the route's permission or operation. Existing query keys, project identity validation, snapshot lineage, private caching, error handling and invalidation remain in place.

This metadata addition must not enter commercial hashes, approved amounts, workflow state, Configuration pricing or saved mode decisions. No new database writes or persistence fields are required. The same authorized endpoint remains the source for both list and project detail.

Search, filter and cover state are presentation only. Read-only users keep their existing permitted navigation; users lacking the workspace operation see the established denial. If permission is revoked during refresh, remove retained project/client/financial content just as the existing project page does.

## States, responsiveness and accessibility

- Cover loading, failed images, zero projects, no matching projects, query loading, refresh, API error/retry, invalid financial lineage and denied/revoked access.
- Preserve semantic list/article structure, logical headings, native input/select/link behavior, visible focus and meaningful accessible names. Announce changing result counts without repeatedly announcing every amount.
- Check long project/client names, unequal projects, all task statuses, estimate-version lengths, valid zero values, negative remaining values and large currency amounts.
- Inspect at 2048, 1440, 1024/768, 390 and 320 px, including a short viewport. No page-level horizontal overflow, cropped badges, obscured controls or inaccessible card actions.
- Use no new animation; honor existing reduced-motion behavior. Distinguish informational badges and noninteractive summary panels from controls.

## Acceptance criteria

1. The Procurement project list follows the screenshot's header, search/status controls, two summaries and landscape image-card hierarchy, with four/three/two/one responsive columns and compact spacing as requested in implementation feedback.
2. Each project displays its actual approved estimate version, procurement-opened date, client name when available, selected-item count and unchanged selected/spent/remaining amounts. No photo count or unsupported financial/status value is invented.
3. Local search, status filter, result count, clear/reset and empty-result behavior work without additional API reads or writes. Full-list summary scope stays clear while filtering.
4. At least two unequal projects reconcile exactly to the existing approved/posted-spend source, including positive, zero and negative remaining values. Portfolio summation cannot overflow silently. Existing integrity failures continue to block stale/mismatched content.
5. Every View project action reaches the existing canonical project and previously implemented mode-group overview. Basket selection, pricing, approval and BOQ behavior are unaffected.
6. The additive client-name field is scoped to the correct authorized project, needs no new query/write/migration and tolerates missing legacy data. Backend source/digest and route authorization regressions remain green.
7. Generic imagery is local and stable per project, never represented as actual project photos. Broken/unknown images use a reserved-space skeleton. Keyboard and accessibility checks pass for the changed region.
8. Relevant frontend/backend regressions, typechecks/builds, rendered interaction and width/state checks, and `git diff --check` pass. Preserve the existing uncommitted mode-group implementation and report exact verification and remaining limitations.

## Risks, assumptions and decisions

- Main risks are confusing selected estimate value with Procurement cost, treating the image overlay as a real gallery count, interpreting task status as approval status, introducing client-data leakage or disturbing the prior uncommitted work. The mappings and boundaries above address each risk.
- Assumption: this request targets the `/procurement` project list shown in the reference, including its reused `/home` component, rather than changing the already-completed Main Basket/detail screen.
- Assumption: the person in the screenshot is the client. The specification uses the saved `Project.clientName` and labels it accordingly; it does not infer a manager/assignee.
- Resolved default: use real selected-item counts in the image overlay because no project-photo count exists. Actual project galleries would be a separate feature.
- Resolved default: totals summarize the full authorized list; filters narrow only the cards and result count.
- No material open decision requires a separate question before spec approval. The subsequent plan will define bounded ownership, asset work and exact verification commands.

## Status

Specification and task plan approved; user selected Mode A. Implementation and final verification are complete; evidence and limits are recorded in the task plan. On 2026-10-08 the user requested four smaller cards per desktop row and smaller summary panels. Those presentation refinements are incorporated: compact covers/text/spacing and approximately 62px summary panels with 32px icons and 20px values. Data and behavior requirements remain unchanged. All prior mode-group work is preserved.
