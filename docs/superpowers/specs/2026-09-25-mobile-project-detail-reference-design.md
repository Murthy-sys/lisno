# Mobile project detail reference UI

Date: 2026-09-25. Gate 1 (specification). No code has been changed.

## Goal

Bring the mobile Project details screen to the same visual composition as the redesigned web project details page (`frontend/src/features/admin/AdminProjectDetailPage.tsx` + `admin-project-detail.css`, spec `2026-09-25-project-detail-reference-ui-design.md`), adapted for phone and tablet widths. This is a presentation-only change in `mobile/`. The frontend repository is reference material only and must not change.

## Current behavior and evidence

- Route: `mobile/src/app/record/[featureId]/[recordId].tsx` → `RecordDetailScreen` → for `projects`, a `ScrollView` (max width 860) containing `ProjectStructure`.
- Data: `projectDetailEndpoint` in `featureDefinitions.ts` loads one of two shapes:
  - **admin / super_admin**: `GET /admin/projects/:id` → `AdminProjectSummary` (name, status, location, client {name, email, mobile}, propertyType, budgetMin/Max, estimator, lead {stage, nextAction, nextActionAt}, estimate {status, total, approvedBaseline, designPlanStatus, designPlanDesigner, clientReview…}, createdAt). No `floors`.
  - **other staff roles**: `GET /projects/:id` → project hierarchy (name, status, location, clientName/Email/Mobile/Address, planned/actual start/end dates, createdAt, updatedAt, backend-derived `progress`, `floors` → stages → tasks with risk). Designer/manager fields are IDs only, with no names.
  - **client**: the same endpoint returns a reduced view (name, status, location, planned/actual dates, createdAt, updatedAt, progress, limited floors). No client or team contact fields.
- `ProjectStructure.tsx` currently renders an eyebrow ("PROJECT"), title, a generic key/value dump (`recordFields(project, 16)`), then the floors/stages/tasks hierarchy (create actions, `TaskEditor`, `DesignUploadAction`), `DesignVersionWorkspace`, `WorkflowWorkspace` and a "Refresh project" button.
- The scaffold's back button appears in a separate bar above the content, because the record route does not use `backPlacement="content"`. The Projects list already places the back button inside an illustrated hero through `ScaffoldContentBack`.
- The web reference: a wide interior-image hero (back link, project name, description, status badge, Project ID, Created date); five compact fact tiles (Client, Location, Property type, Created, estimate value); "Project information" and "Assignment & progress" sections, open by default, with grouped two-column label/value rows; then the existing operational panels; and a sidebar with an illustrative interior image, "Quick summary" and "Team members" (Sales, Designer, Client with initials). Warm paper surfaces (`#fbfaf6`), thin `#dedfd5` lines, olive `#3d4a32` emphasis, small corner radii.
- The mobile tokens already match that palette: `colors.surface` `#fbfaf6`, `colors.border` `#d9dccf`, and `colors.primary` `#3d4a32`. The mobile app already formats INR with `en-IN` in `dashboard/data/formatters.ts`.
- Target files `ProjectStructure.tsx`, `RecordDetailScreen.tsx` and the record route are currently clean. `mobile/src/features/workspace/featureDefinitions.ts` has unrelated uncommitted changes and will not be edited.

## Scope

1. **Hero header.** Reuse the web's living-room artwork as decorative background: a mobile-sized JPG copy added under `mobile/assets/brand/`, with a cream gradient overlay on the text side. The hero contains the back button (content placement for the projects detail route only), a "PROJECT" eyebrow, the project name (wraps; never truncated silently), a short description line, and a metadata row with the status badge, "Project ID: …" and "Created <date>". The artwork is hidden from accessibility and is never presented as a project photo.
2. **Fact tiles.** A 2-column grid on phones, with the last odd tile spanning the full width, and more columns at wider widths. Each tile shows only fields the payload really contains:
   - Admin: Client, Location, Property type, Created, and the estimate value, labelled as in the web.
   - Staff hierarchy: Client, Location, Created, Progress (backend `progress`) and Planned completion.
   - Client role: Location, Created, Progress and Planned completion.
3. **Detail sections.** Collapsible cards, open by default, with an accessible header button (`accessibilityState.expanded`), an icon chip, a title and a subtitle. Rows are grouped under small olive group headings as two-column label/value rows that stack when text is enlarged.
   - Admin "Project information": Project (Location, Property type, Initial client budget range) and Client (Name, Email, Mobile).
   - Admin "Assignment & progress": Sales (Assigned to, Email), Lead progress (Stage, Next action, Next action date) and Estimate (Status, value, Approved baseline version).
   - Staff/client "Project information": Location, Status and Client contact rows where present.
   - Staff/client "Schedule & progress": Progress, Planned start/end, Actual start/end and Last updated.
4. **Reference and people block.** "Quick summary" rows (admin: Project status, Estimate status, estimate value, Initial client budget range; others: Project status, Progress, Planned completion, Last updated) and "Team members" with initials marks for named people only (admin: Sales, Designer, Client; staff: Client when present). The Team block is hidden when it has no named person. The illustrative interior figure with the caption "Interior reference · Illustrative artwork" appears only in the wide two-column layout, to avoid repeating the hero image on phones.
5. **Layout.**
   - Below 900 dp: one column in this order: hero → facts → detail sections → Quick summary / Team → operational content.
   - At 900 dp and above: a main column plus a 300 dp side column (image, Quick summary, Team), with the content max width raised for this screen.
6. **Operational content kept intact.** The floors/stages/tasks hierarchy (with all create/edit/deadline/upload actions and permission checks), `DesignVersionWorkspace`, `WorkflowWorkspace` and "Refresh project" keep the same order, props, queries and mutations. Only their containers get the page's visual styling: thin borders, paper surface, restrained radius, and olive section headings consistent with the detail cards.
7. **Presentation model.** A new pure module (for example `projects/projectDetailModel.ts`) normalizes both payload shapes into display values. It ports the web label rules:
   - The status label is "Estimation Approval" when the estimate is client-approved and the design plan is unassigned or pending assignment. Otherwise it is the title-cased status.
   - The estimate label is "Client-approved value (incl. GST)" or "Current estimate value (incl. GST)".
   - The approved value comes only from `approvedBaseline.total`, and shows "Approved baseline unavailable" otherwise. It never falls back to the mutable `estimate.total`.
   - Missing fields render as "Not captured" or "No estimate yet".
   - Dates use UTC formatting.

## Non-goals

- Any change under `frontend/`, `backend/`, `ocr-worker/` or `shared/`, or to API endpoints, query keys, request payloads, permissions, invalidation or `featureDefinitions.ts`.
- New network calls or panels that are not already on mobile: web finance panel, design-assignment panel, worker-assignment panel, client-response panel, "Assign Designer" header action.
- The web "Overview / Messages" navigation strip. Showing it on the web depends on a per-project chat-membership summary request, which mobile would have to add. Candidate follow-up.
- Fabricated reference-only content: tabs, counts, edit/More buttons, timelines, managers, priority, or team members known only by ID.
- New dependencies, lockfile changes, backend migrations, commits, pushes or deployment.

## Requirements and invariants

- **R1.** Every displayed value comes from the existing detail payload. Names and labels are never used as join keys. The project ID shown is the payload `id`.
- **R2.** Finance display: whole-rupee INR formatting of existing rupee values, with "incl. GST" labels as on the web. The approved value comes only from `approvedBaseline`. The UI never manufactures values.
- **R3.** Role scoping: what shows for client, staff and admin follows only what each endpoint returns. Frontend visibility stays advisory, and the existing `canPerformOperation` gates on actions are unchanged.
- **R4.** Existing loading, error/denied and retry states in `RecordDetailScreen` are unchanged. The "Updating…" refetch cue stays available for the project screen.
- **R5.** Accessibility: a header role on the project title and section titles; collapsible headers expose their expanded state; touch targets are at least 44 dp; the decorative art is hidden; person marks are hidden, with the name and role read as text; layout survives font scale 1.3–2.0 without clipping or horizontal overflow.
- **R6.** Other record types (leads, finance, team, procurement, messages) render exactly as before.

## Assumptions (evidence-backed defaults)

- A1. "Project details screen" means the mobile `projects` record detail for all roles. The admin layout mirrors the web page most closely, and other roles get the same composition filled with their own fields.
- A2. The web artwork is reused through a downscaled JPG copy (about 1200×400, under 150 KB) so it renders consistently on Android and iOS without a WebP dependency. The existing `dashboard-interior.jpg` is the fallback if the user prefers no new asset.
- A3. Back-button content placement is applied only when the record feature is `projects`, matching the Projects list hero pattern.

## Risks

- Long names, emails and IDs could overflow narrow tiles. Mitigation: wrapping text, `minWidth: 0`, and tests with long values.
- The two payload shapes could leak admin-only labels into staff views. Mitigation: a discriminated presentation model with tests per shape.
- The operational workspaces are long, so section order matters on phones. Mitigation: the fixed order above, with the refresh action kept.
- The hero image's weight affects bundle size. Mitigation: downscale and compress.

## Acceptance criteria

1. The admin project detail on mobile shows the reference hierarchy: an image hero with back, title, description, status, ID and created date; fact tiles; open "Project information" and "Assignment & progress" sections; Quick summary; Team members. Every value matches the web page for the same payload.
2. Staff and client project details use the same composition with only their payload fields. Project structure, design versions, workflow and refresh behave exactly as before.
3. Approved value comes only from `approvedBaseline`. The label distinguishes approved value, current draft estimate and initial budget range. Missing data shows explicit fallback text.
4. Collapsible sections toggle by touch and screen reader and report their expanded state. There is no horizontal overflow at 320 dp width or at font scale 2.0. At 900 dp and above the two-column layout is used.
5. No frontend, backend, API, query-key, permission or dependency changes. Other record detail types are unchanged. Unrelated dirty files are preserved.
6. Focused mobile tests for the presentation model (admin, staff and client shapes; approved and unapproved estimates; missing baseline; missing fields) and a rendered test of the project detail screen pass. `cd mobile && npm run typecheck` passes, and so does `npm test` for the touched areas. `git diff --check` is clean. A native visual check is run if an emulator is available; otherwise it is reported as not run.

## Open decisions

None blocking. The defaults are A1–A3. The Messages navigation strip is deferred as a non-goal.
