# Sales Manager, Client, and purchase order approvals compact redesign

**Date:** 2026-10-01  
**Status:** Approved and implemented

## Goal and confirmed scope

Apply the Lead workspace's latest visual direction to three existing workspaces: the Sales Manager project screen at `/admin/projects`, the Client dashboard at `/client`, and the Super Admin purchase order approvals screen at `/admin/purchase-orders`. The user wants compact font sizes and spacing, an interior image that fades into the page through a restrained gradient as on the procurement reference, and data areas whose columns have enough width for their required content. Keep each screen's current functions and real data. The user explicitly confirmed that “purchase order screen” means **purchase order approvals** at `/admin/purchase-orders`.

## Current behavior and evidence

- `frontend/src/features/admin/AdminProjectsPage.tsx` serves Sales Manager “My Projects” and the same component's Super Admin “All Projects” variant. It has a permission-gated `Initiate project` action, server-backed status/search/sort/pagination, a persisted grid/list choice, project navigation, list quick view, and conditional designer assignment. Its list contains Project, Location, Sales, Lead progress, Next action, Estimate, and Action groups. `adminProjectEstimateDisplay` is shared by grid and list and uses the approved baseline for a client-approved estimate. `frontend/src/features/admin/admin-project-grid.css` already fades `projects-living-room.webp` into the header, but the image area is tall and also contains the status and tool controls. `frontend/src/styles/admin-home.css` and `access-administration.css` control list widths and responsive layout. A rendered 1440px baseline showed a long project name increasing row height and actions stacking in a tight action column.
- `frontend/src/features/client/ClientDashboard.tsx` serves `/client`. It shows a header, a repeated project count, three true overview values, estimate review, and expandable project cards with workflow tasks, detail links, and quick view. The approved-plan value comes only from client-visible approved versions; a failed secondary request shows `—` with a retry. The project query retains an authorized previous snapshot only on a transient refresh failure and clears it on denial. `frontend/src/styles/client-dashboard.css` currently uses a plain, large header, separate raised metric cards, and a two-column project grid. This page has no table; preserving readable project and estimate details is the appropriate equivalent of the requested column-width work.
- `frontend/src/features/procurement/SuperAdminPurchaseOrdersPage.tsx` serves `/admin/purchase-orders` for the approval permission. It places `SuperAdminProjectRequestReview` above the individual vendor-order queue. The first flow reviews whole-project purchase requests by section and vendor; the second reviews a submitted individual order revision, budget, lines, terms, and a decision. `frontend/src/features/procurement/purchaseOrders.css` is shared with project-level purchasing, so global changes to its selectors could affect the editor outside this route. The current top-level approvals page has a plain bordered surface and no image header. Its list rows use three narrow grid tracks. The synthetic visual-QA fixture lacks a response for `/admin/purchase-order-requests/pending`, so the rendered baseline currently shows that queue's retryable error instead of a populated example.
- Existing focused tests are in `AdminProjectsPage.test.tsx`, `ClientDashboard.test.tsx`, `ClientDashboard.collapsible.test.tsx`, and `SuperAdminPurchaseOrdersPage.test.tsx`. The Sales Manager test suite currently expects a grid skeleton during loading, which conflicts with the user's no-skeleton direction and must be updated if that loading presentation changes.
- A read-only rendered baseline was inspected for all three routes at desktop width before specifying the redesign. The existing Lead workspace implementation and the user's two supplied images establish the desired compact, restrained reference; its unfinished worktree files are unrelated edits to preserve.

## Scope and non-goals

**In scope:** page-level hierarchy, typography, spacing, decorative header imagery and fade, compact metric presentation where metrics already exist, width and responsive treatment of the current data groups, loading/empty/error presentation affected by the redesign, and focused page-local style/test/fixture changes needed to verify the result. The shared `/admin/projects` component's Sales Manager and Super Admin variants should receive the same visual treatment while retaining their distinct wording and permissions.

**Out of scope:** backend/API/schema or persisted-data changes; new filters, metrics, estimates, financial calculations, approvals, bulk actions, or navigation destinations; redesign of `/admin/projects/:id`, `/client/projects/:id`, project-level purchase order editors, estimate review internals, or the main application shell. Do not copy unsupported Lead reference controls, sample values, trends, or illustrations into live screens. Do not add 3D, a motion framework, a font package, or an image dependency for these operational pages.

## Shared visual requirements

1. Use a compact hierarchy across the three routes: restrained header height, smaller heading/body/metadata scale than the current oversized areas, tighter section gaps, and information-dense rows without reducing legibility or touch access. Resolve exact sizes through rendered QA rather than scaling the reference screenshot literally.
2. Use an existing interior image in each page header as decorative scenery with a **soft, directional fade into the warm page surface**. Keep text and primary controls on a reliably opaque area; cropping or hiding the image at narrow widths must not remove information. Avoid harsh gradient bands, pure-white expanses, drop shadows, glass effects, ornamental icons, and animation on hover. Keep the existing product typeface and restrained forest/sage palette.
3. Use measured widths for identity, descriptive text, amounts, dates/statuses, and action groups. Long names, locations, vendor names, amounts, and translated browser text must wrap or truncate only where the full value remains available through an accessible means. No page-level horizontal overflow; at narrower widths use labelled compact rows/cards or local scrolling only when the information remains usable.
4. Preserve semantic headings, visible focus, keyboard operation, accessible names, contrast, and meaningful loading/error/empty states. Respect reduced-motion preference. Do not introduce skeleton loaders; the existing Sales Manager grid loading skeleton may become a labelled loading state while retaining the query behavior.
5. Scope new selectors to their route/component and reuse current shared tokens and UI primitives where they fit. In particular, isolate approval-page styling from the shared project purchase-order editor CSS. No new Lucide decoration; any existing functional icon controls keep their accessible text names.

## Screen-specific requirements

### Sales Manager projects (`/admin/projects`)

- Keep the current status counts and exact status filter, search form, sort, pagination, persisted grid/list toggle, initiation dialog, project links, quick view, and conditional designer-assignment action. Compact the existing photo header and move or arrange controls so the image does not make the working area unnecessarily tall. Preserve the list/grid choice and default.
- In list mode, retain all seven current data groups. Give Project and Next action enough room for meaningful text, keep estimate status/value together, and reserve sufficient width for visible actions. On intermediate/mobile widths, show field labels and reflow without hiding the project, client, location/property, sales handoff, lead stage, next action, estimate, or permitted actions. Grid cards may become denser, but must retain their existing information and actions.
- Preserve the approved-estimate baseline rule, missing-value wording, status/count meaning, stale-page indication, and safe disabling of quick view while placeholder results are shown. Do not derive extra financial totals or infer progress.

### Client dashboard (`/client`)

- Give the header the same compact faded-image treatment. Present the three existing overview values as a restrained, compact information band; avoid repeating the project count in an oversized header block. Keep the values' meanings and unavailable approved-plan state explicit.
- Make estimate review and project cards easier to scan at workspace widths. Preserve each project's name, location, status, progress, floor count, workflow task summary, latest approved update when expanded, and both project-detail paths. Accommodate long project/update names without collision or clipped action labels. Do not manufacture a table or expose unapproved/non-client-visible plans.
- Preserve project authorization behavior, retry paths, collapsed/expanded state, quick-view focus restoration, the `estimate` search-param flow, and the existing empty-account distinction.

### Purchase order approvals (`/admin/purchase-orders`)

- Give this **top-level approvals route** a compact faded-image header and clear distinction between whole-project requests and individual vendor orders. Keep both queues and their existing drilldown, empty/error/retry, notices, and permission-limited states.
- Make queued request/order rows and the selected review content denser while preserving request or order identity, vendor/project context, revision, section and line descriptions, totals, budget comparison, terms, status, and decision controls. Allocate stable room to rupee amounts and decision buttons; line-item text may wrap. At narrower widths, use explicit labels and a stacked reading order so amounts never appear attached to the wrong line.
- Preserve submitted-revision sourcing, before-GST budget comparison, required reason and override rules, version/idempotency handling, and query invalidation. Styling must not imply that a request is approved, payable, or within budget unless the existing response says so.

## Data, API, authorization, and side effects

This is a frontend visual change. The existing authorized queries, stable IDs, mutations, and destinations remain the source of truth. The Sales Manager page continues to use its existing project-list API and approved-estimate display. The Client page continues to use only its authorized project summaries and client-visible approved versions. The purchase order page continues to format backend paise values and review immutable submitted revisions with the current approval permission and decision checks. No new metric, amount, approval state, or permission is derived in CSS or invented in the UI. There is no migration, production mutation, or external side effect in the planned redesign.

## Risks and constraints

- Shared CSS for admin projects and purchase orders may leak to other routes. Page-scoped styles and visual regression checks must cover the adjacent project-detail and project purchase-order surfaces.
- Compacting a seven-group Sales Manager list or finance-heavy order detail can cause unreadable columns. Test at the actual width inside the application sidebar, with long values and 200% zoom, then choose wrap/reflow breakpoints from content.
- Financial labels must not confuse total with before-GST values or an approved estimate with a draft/current total. The redesign should retain the current explicit labels and source values.
- The synthetic QA environment needs representative pending purchase-request data (or an equivalent deterministic browser mock) to judge the populated approval queue; verify error and empty states separately.
- Decorative image failure must leave header text and actions readable. Avoid a new large image or unnecessary animation cost.

## Acceptance criteria

1. `/admin/projects`, `/client`, and `/admin/purchase-orders` share the requested compact visual language and each has an interior image fading into the page, while preserving its own information hierarchy.
2. Sales Manager grid and list functions, Client review/project actions, and both purchase-order approval flows retain their current permissions, destinations, data meanings, error handling, and interaction behavior.
3. The Sales Manager list and purchase-order queue/detail show all required existing fields with content-driven column widths on desktop and a labelled, readable reflow on narrow screens. Client project and estimate content also remains readable. No page-level horizontal overflow occurs at desktop, intermediate, mobile, or 200% zoom widths.
4. No hardcoded business values, fake trends, new calculations, unapproved Client material, or altered approval/budget semantics appear. Loading, empty, error, stale-data, and permission-limited states remain understandable.
5. Focused tests for all three screens, frontend typecheck and build, and rendered desktop/mobile interaction and accessibility checks pass. Adjacent routes sharing CSS show no unintended visual change. Any synthetic fixture used for visual QA contains no private data and is not treated as production truth.

## Open decisions

None. The user identified the purchase order route and chose the visual-only, current-function direction in the preceding Lead redesign. Exact asset crop, spacing, and content breakpoints can be resolved through rendered QA within the requirements above.
