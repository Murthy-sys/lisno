# Mobile Project Details — tabbed layout

Date: 2026-09-26. Gate 1 (specification). No code has been changed.
Classification: **Substantial**. It spans several mobile files, changes a product screen's information architecture, and adds one existing-endpoint download. It does not touch the backend, schema or authentication.
Supersedes the presentation parts of `2026-09-25-mobile-project-detail-reference-design.md`. That spec's data rules (R1–R3 there) are carried forward unchanged.

## Goal

Rebuild the mobile `projects` record detail screen to match the supplied screenshot:

1. A compact page header: Back, a ⋮ menu, the title "Project Details" and a subtitle.
2. A summary card: an illustrative thumbnail, the project name and a 2×2 fact grid with icons.
3. A value card: the estimate value with a status pill.
4. A horizontally scrollable tab strip: **Information · Estimation · Designs · Documents · Team**.
5. The active tab's content. Information holds collapsible cards with icon rows, grouped under small uppercase headings.

All operational features on the screen today must stay reachable, with their behavior unchanged.

## Current behavior and evidence

- **Route.** `mobile/src/app/record/[featureId]/[recordId].tsx` → `RecordDetailScreen` (projects branch: `ScrollView`, `projectContent` max width 1200, an "Updating…" cue) → `ProjectStructure` → `ProjectDetailLayout` in `ProjectDetailOverview.tsx`. The route passes `backPlacement="content"` for projects, and the back button renders through `ScaffoldContentBack` as "← Back".
- **Current composition.**
  1. An image hero with an overlay (eyebrow, name, description, status badge, Project ID, Created).
  2. Five fact tiles.
  3. The "Project information" and "Assignment & progress" collapsible sections for admins, or "Schedule & progress" for other roles.
  4. Quick summary and Team members; at 900 dp and above these sit in a 300 dp side column with an illustrative figure.
  5. The "Floors, stages and tasks" panel, `DesignVersionWorkspace`, `WorkflowWorkspace` and a "Refresh project" button, all in one long scroll.
- **Presentation model.** `projectDetailModel.ts` normalizes two payload shapes:
  - Admin / super_admin: `GET /admin/projects/:id`. Includes client, property type, budget range, estimator, lead, and the estimate with `id`, `status`, `total` and `approvedBaseline`. No floors.
  - Staff and client: `GET /projects/:id` (hierarchy). Staff get client contact fields; the client view is reduced. Both include planned/actual dates and backend `progress`.
- **Existing rules.** The approved value comes only from `approvedBaseline.total`, never from the mutable `estimate.total`. The "Estimation Approval" status override, the "Not captured" / "No estimate yet" fallbacks and UTC dates are all implemented there.
- **No project update API.** The backend route-operation registry has no `PATCH`/`PUT` for `/projects/:projectId` or `/admin/projects/:projectId`. There is nothing an "Edit" button could call.
- **Existing downloads.**
  - `GET /estimates/:estimateId/pdf` (permission `estimation.estimate_pdf.download`) and `GET /design-versions/:versionId/download` are both in `mobile/src/contracts/operations.ts`.
  - `runtime.transfers.download(...).result` → `artifact.share()` is the established download pattern (`DesignVersionWorkspace`, `ClientEstimateAction`).
- **Reusable pieces.**
  - `assets/brand/project-detail-interior.jpg` (illustrative artwork).
  - `features/notifications/BotanicalAccent.tsx` (decorative sage leaves).
  - `ui/AppModalBackdrop.tsx`.
  - The tablist/tab pattern with active underline in `knowledge/KnowledgeItemWorkspace.tsx`.
  - `react-native-svg` for inline icons. No icon library is installed, and none will be added.
- **Tests.** `ProjectStructure.test.tsx` (508 lines, 10 cases) currently asserts "no reference-only tabs or header actions". That assertion is intentionally reversed by this change. `projectDetailModel.test.ts` has 584 lines.
- **Dirty state.** Only `mobile/.expo/dev/logs/start.log` is modified, and it is unrelated. All target files are clean.

## Scope

### 1. Page header (all roles)

- **Row 1.** `ScaffoldContentBack` on the left. On the right, a 44 dp outlined ⋮ icon button (accessible name "More project actions") that opens an anchored overflow menu:
  - **Refresh project**: always shown. Calls the existing `onRefresh`, and replaces the bottom "Refresh project" button.
  - **Project messages**: only when `resolveAuthorizedFeature("messages", role, authorization)` allows it. Navigates to the existing `/record/messages/<projectId>` route.
  - The menu closes on backdrop tap, on Android back and after an item is chosen.
- **Title.** "Project Details" (header role).
- **Subtitle by role.**
  - Admin: "Client, property and budget details".
  - Staff: "Client, schedule and progress details".
  - Client: "Schedule and progress details".
- **Background.** Decorative botanical leaves at the top right: `BotanicalAccent`, reused at low opacity and hidden from accessibility.
- **Edit button.** Not rendered by default; see decision D1.

### 2. Summary card

- **Left:** a rounded thumbnail of `project-detail-interior.jpg` with a small image-glyph chip at the bottom left. The thumbnail is purely decorative: it is hidden from accessibility and never described as a project photo.
- **Right:** the project name (wraps, header role), then a 2×2 fact grid. Each cell has an icon, a muted label and a value, with a vertical divider between columns and a horizontal divider between rows. The cells depend on the payload:

| Payload | Top-left | Top-right | Bottom-left | Bottom-right |
|---|---|---|---|---|
| Admin | Client | Property type | Location | Created |
| Staff | Client | Planned completion | Location | Created |
| Client | Planned start | Planned completion | Location | Created |

- **Narrow screens** (below 360 dp or font scale above 1.3): the thumbnail stacks above the text, and the facts become one per row.
- Missing values use the existing fallbacks ("Not captured").

### 3. Value card (tinted sage surface)

A coin icon chip, a label, a large olive value and an optional pill on the right. The card's content depends on the payload:

| Payload / state | Label | Value | Pill |
|---|---|---|---|
| Admin, `client_approved`, baseline present | Client-approved value (incl. GST) | `approvedBaseline.total` (whole-rupee INR) | **Approved** (check icon) |
| Admin, `client_approved`, baseline missing | Client-approved value (incl. GST) | Approved baseline unavailable | **Approved** |
| Admin, estimate not approved | Current estimate value (incl. GST) | `estimate.total`, or "Not captured" | Title-cased estimate status, with no check icon |
| Admin, no estimate | Current estimate value (incl. GST) | No estimate yet | none |
| Staff / Client | Overall progress | Backend `progress` % or "Not captured" | Project status label and tone |

The pill is announced together with the value, for example "Client-approved value (incl. GST): ₹2,42,667, Approved".

### 4. Tab strip

- **Structure.** A horizontal `ScrollView` with `accessibilityRole="tablist"`. Each tab has `role="tab"`, an icon and a label, with `accessibilityState.selected` set, and a minimum height of 44 dp. The active tab has a surface background, bold ink and a 2 dp olive underline; inactive tabs are muted. Information is the default tab.
- **Order and visibility.** A tab appears only when its content has a real source for this session:

| Tab | Shown when | Content |
|---|---|---|
| Information | always | See §5 |
| Estimation | admin payload | "Estimate" card (§6) |
| Designs | `GET /projects/:projectId/design-versions` allowed **or** `projects.design_workflow.read` held | The existing `DesignVersionWorkspace`, then `WorkflowWorkspace`, unchanged |
| Documents | an estimate id is present and `GET /estimates/:estimateId/pdf` is allowed, **or** `GET /projects/:projectId/design-versions` is allowed | See §7 |
| Team | at least one named person | People list (§8) |
| Tasks | always | The existing "Floors, stages and tasks" panel, unchanged (create, edit, deadline and upload actions and their permission checks) |

- **Tasks tab placement.** Tasks is added after Team so that no current operational content is lost. On a phone it sits past the right edge, where the strip already scrolls (see D2).
- **Panel mounting.** A panel mounts on its first visit and then stays mounted but hidden (`display: "none"`, which also hides it from accessibility). In-progress task or design edits therefore survive a tab switch, and a panel's queries run only once its tab has been opened.
- **Invalid selection.** If the selected tab disappears after a refetch or permission change, the selection falls back to Information.

### 5. Information tab: collapsible cards

- **Card structure.** Each card is open by default. Its header is a button with `accessibilityState.expanded`, an icon chip, a title, a subtitle and a chevron.
- **Groups.** A group heading is small, uppercase and muted ("PROJECT", "CLIENT", …). Its rows sit inside a bordered, rounded container. Each row shows an icon, a muted label and a value: two columns, stacked when text is enlarged or the screen is narrow. Values are selectable.
- **Admin cards.**
  - **Project information** (subtitle "Client, property and budget details"):
    - PROJECT: Location, Property type, Initial client budget range.
    - CLIENT: Client name, Email, Mobile.
  - **Assignment & progress**:
    - STATUS: Project status. This keeps the existing "Estimation Approval" override and moves here from the removed hero badge.
    - SALES: Assigned to, Email; or "Unassigned handoff".
    - LEAD PROGRESS: Stage, Next action, Next action date.
- **Staff and client cards.**
  - **Project information**:
    - PROJECT: Location, Status.
    - CLIENT (staff only, and only rows that have values): Client name, Email, Mobile, Address.
  - **Schedule & progress**:
    - SCHEDULE: Progress, Planned start, Planned completion, Actual start, Actual completion, Last updated.
- **Wide cards.** When a card is at least 600 dp wide, its groups sit two per row. The existing measured-width behavior is kept.

### 6. Estimation tab (admin)

- An "Estimate" card with these rows:
  - Status.
  - The value label and value, following the same rules as the value card.
  - Approved estimate baseline "Version N", only when the baseline is valid.
  - Initial client budget range. This row is clearly labelled as the initial budget, never as an estimate.
- When there is no estimate, the card shows the "No estimate yet" empty state.

### 7. Documents tab

- **Estimate PDF row** (admin, when an estimate id is present and `GET /estimates/:estimateId/pdf` is allowed):
  - Shows "Estimate PDF" with the estimate status and an "Export PDF" button.
  - Downloads `/estimates/<id>/pdf` through `runtime.transfers.download` with a maximum of 25 MB, then shares it and cleans up after sharing.
  - Shows an inline busy state, and an inline error if the backend denies the request or it fails.
- **Approved design files**:
  - Versions with `approvalStatus === "approved"` from the existing design-versions query, reusing the same query key and URL (`privateQueryKey(scope, "design", "project", projectId)`, `?limit=30&offset=0`). The cache and `design-workflow-changed` invalidation are therefore shared with the Designs tab.
  - Each file shows the filename, "Version N" and the approval date if present.
  - A Download button appears when `GET /design-versions/:versionId/download` is allowed. It uses the same download and share path as `VersionActions`.
  - While the list loads, it shows a loader. On error it shows a retry. When there are no approved files, it shows "No approved documents yet."

### 8. Team tab

- A card listing the named people with an initials mark, the role and the name, plus email when present:
  - Admin: Sales, Designer, Client.
  - Staff: Client.
- People known only by ID are never shown.

### 9. Layout, theme and composition

- **Single column at every width.** The content is centered with a maximum width of 860 dp (the projects `projectContent` max width goes from 1200 to 860). The 300 dp side column, the illustrative side figure, the image hero, the five fact tiles and the Quick summary are removed. Their information now lives in the header, summary card, value card, Assignment/Schedule cards and Team tab, so nothing is lost.
- **Theme tokens only.**
  - Surfaces are `colors.surface` on `colors.canvas`.
  - Lines are `colors.border`.
  - Emphasis and underline are `colors.primary`.
  - The value card tint and the "Approved" pill background are derived from `colors.primarySoft`.
  - Card radius is about 12 and inner group radius about 10, to match the screenshot.
- **Icons.** Inline `react-native-svg` icons in a small local icon module: person, home, pin, calendar, rupee, mail, phone, coins, document, calculator, image, users, list, check, chevron, pencil and kebab.

### 10. Presentation model

- **Reshape `projectDetailModel.ts` output.** The new shape includes:
  - page `subtitle`;
  - `overview` (name plus four facts, each with an icon key);
  - `value` (label, value, optional pill with label, tone and `approved` flag);
  - `sections` (rows gain an icon key; the admin client "Name" becomes "Client name");
  - `estimate` (admin only: rows and an estimate id for the PDF);
  - `people`.
- **Removed fields.** `facts`, `summary`, `description` and the hero-only status/ID/created metadata are removed. The project `id` stays for identity and actions, and `status` stays for rows and pills.
- **Rules carried forward unchanged.** All existing formatting, finance and fallback rules.

## Non-goals

- A project **Edit** flow or any backend project-update endpoint (see D1). Any change under `backend/`, `frontend/`, `ocr-worker/` or `shared/`.
- Real project photos or cover-image upload. The thumbnail is illustrative artwork.
- Changes to query keys, request payloads, permissions, invalidation events, `featureDefinitions.ts`, `DesignVersionWorkspace`, `WorkflowWorkspace` or `HierarchyCreateActions` internals.
- Other record types (leads, finance, team, procurement, messages), which render exactly as before.
- New dependencies, lockfile changes, assets, migrations, commits, pushes or deployment.

## Requirements and invariants

- **R1 Data lineage.** Every value comes from the existing detail payload or existing queries. Stable IDs (project, estimate, design version) drive actions; names are display only.
- **R2 Finance.**
  - Whole-rupee INR display of the existing rupee values, labelled "incl. GST".
  - The approved value comes only from `approvedBaseline`, never from `estimate.total`.
  - The budget range is always labelled as the initial client budget.
  - The UI never manufactures values.
- **R3 Authorization.**
  - Tab, menu-item and button visibility follows `canPerformOperation` and permission checks, and remains advisory; the backend stays authoritative, and a denied download shows an inline error.
  - Existing action gates inside the operational panels are unchanged.
- **R4 States.** Loading, denied, error and retry in `RecordDetailScreen` are unchanged, and the "Updating…" cue stays visible during a refetch. The Documents tab handles its own loading, empty, error and retry states.
- **R5 Accessibility.**
  - Header roles on the title, project name and card titles.
  - Tablist and tab roles with selected state.
  - Collapsible headers expose their expanded state.
  - The ⋮ button and menu items have accessible names.
  - Touch targets are at least 44 dp.
  - Decorative art, thumbnail, leaves, icons and initials marks are hidden from accessibility.
  - No clipping or horizontal page overflow at 320 dp or at font scale 2.0.
- **R6 No regressions.** Operational content keeps its props, queries, mutations and permission checks; only its location (a tab) changes.

## Assumptions (evidence-backed defaults)

- **A1.** The screenshot shows the admin payload. Staff and client get the same composition filled with their own fields, as in the tables above.
- **A2.** The "Approved" pill reflects the estimate status (`client_approved`), not the project status. Project status moves to the Assignment/Information rows and to the staff/client value pill.
- **A3.** The thumbnail's image-glyph chip is decorative. There is no gallery or photo viewer, because no project image data exists.
- **A4.** Documents is a curated file view: the estimate PDF plus approved design files. The full design review stays in Designs.

## Risks and mitigations

- **Hidden operational content.** Staff reach Tasks via the sixth tab. Mitigation: a visible scrollable strip, with the tab reachable by swipe and screen reader. D2 lets the user choose a different placement.
- **Lost edits on tab switch.** Mitigated by keeping visited panels mounted.
- **Overflow from long names, emails and IDs** in the 2×2 grid. Mitigation: wrapping text, `minWidth: 0`, stacked fallback, and tests with long values.
- **Admin-only labels leaking into staff or client views.** Mitigation: discriminated model output and asymmetric per-shape tests.
- **Design-versions window.** The shared query fetches only the first 30 versions, so Documents lists approved files within that window only. This is stated in the UI copy only if the list is truncated.

## Acceptance criteria

1. **Admin screenshot parity.** The admin project detail shows, in order: Back and ⋮; "Project Details" with its subtitle; a summary card (thumbnail, name, Client / Property type / Location / Created with icons and dividers); a value card with the "Client-approved value (incl. GST)" label, the baseline value and an "Approved" pill; the tab strip Information · Estimation · Designs · Documents · Team (· Tasks); and the Information tab open with "Project information" (PROJECT and CLIENT icon rows) and "Assignment & progress".
2. **Finance.** An approved estimate shows only the `approvedBaseline.total`, even when `estimate.total` differs. A missing baseline shows "Approved baseline unavailable". A non-approved estimate shows its current value and status pill. No estimate shows "No estimate yet".
3. **Staff and client.** Staff and client views show only their own fields (summary grid and progress value card per §2–3); no admin-only labels, client contact (client role) or unnamed people appear. Estimation is hidden for them.
4. **Tabs.** Visibility follows the §4 rules for each permission set. Selecting a tab exposes the selected state and swaps the panel. Visited panels keep their state. An invalid selection falls back to Information.
5. **Operational parity.** The Designs and Tasks tabs render the existing workspaces and panel with the same props and gates. The ⋮ menu's Refresh project calls `onRefresh`, and Project messages appears only when authorized.
6. **Documents.** Estimate PDF export calls `/estimates/<estimateId>/pdf` only when permitted and shows busy and error states. The approved design list reuses the existing design query key and supports download, empty, loading and error states.
7. **Accessibility and responsiveness.** Collapsible cards toggle and report their expanded state. There is no horizontal overflow at 320 dp or at font scale 2.0. The 860 dp centered column works at tablet width.
8. **No out-of-scope changes.** No backend, frontend-web, API, query-key, permission, dependency or asset changes. Other record types are unchanged. The unrelated dirty `start.log` is preserved.
9. **Verification passes.**
   - Updated `projectDetailModel.test.ts`: admin approved, unapproved, missing-baseline and no-estimate cases; staff; client; and two unequal projects with no cross-contamination.
   - Updated `ProjectStructure.test.tsx`, which replaces the "no tabs or header actions" assertion: header and menu, tab visibility per role and permission, panel persistence, collapse, Documents states, and 320 dp at 2× text.
   - `cd mobile && npm run typecheck` and `npm test` pass for the touched areas, and `git diff --check` is clean.
   - A native or visual check is run if an emulator or web adapter is available; otherwise it is reported as not run.

## Data / API / UX impact

- **API.** No new endpoints. The one new client call is `GET /estimates/:estimateId/pdf`: it already exists, is permission-gated, and runs only when the user taps "Export PDF". The design-versions fetch reuses the existing query.
- **Data.** No persistence or schema effects, and read-only apart from existing mutations inside unchanged panels.
- **UX.** The long single scroll becomes a tabbed layout. "Refresh project" moves into the ⋮ menu. The Quick summary, the side figure and the hero are removed in favor of the summary and value cards.

## Open decisions

- **D1: Edit button.** There is no project update API, so a working Edit needs a separate high-risk backend spec covering RBAC, Zod validation, CAS/versioning, audit, OpenAPI and web parity.
  - **Default:** omit Edit and keep only ⋮.
  - Alternative: render Edit as disabled with "Editing isn't available yet". Not recommended, because a dead control misleads users.
  - Alternative: open a follow-up spec for project editing.
- **D2: Tasks placement.**
  - **Default:** a sixth "Tasks" tab after Team, which keeps the screenshot's first five tabs exact.
  - Alternative: render the Floors, stages and tasks panel at the bottom of the Information tab.
