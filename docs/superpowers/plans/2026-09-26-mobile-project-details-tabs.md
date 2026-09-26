# Task plan — Mobile Project Details tabbed layout

Spec (approved 2026-09-26): [`2026-09-26-mobile-project-details-tabs-design.md`](../specs/2026-09-26-mobile-project-details-tabs-design.md). The spec's default decisions stand: **D1**, there is no Edit button and only ⋮ is shown; **D2**, a sixth "Tasks" tab comes after Team.
Classification: Substantial. The work stays inside `mobile/`: no backend, web, API, permission, dependency or asset changes.

## Baseline (captured before planning)

- `git status --short` shows only `M mobile/.expo/dev/logs/start.log`. That file is unrelated and must not be touched, staged or reverted.
- Every target path below is clean at `4b320d9`.
- The model and the overview are imported only inside `mobile/src/features/projects/`, so no other feature consumes the shapes being changed.

## Shared contract (settled before any writer starts)

`projectDetailModel.ts` exports the following. Every UI task codes against exactly this shape, and any change to it goes through the primary agent.

```ts
export type ProjectDetailIcon =
  | "person" | "home" | "pin" | "calendar" | "calendarCheck" | "rupee" | "mail" | "phone"
  | "status" | "progress" | "clock" | "flag" | "arrow" | "version";
export interface ProjectDetailRow { key: string; label: string; value: string; note: string | null; icon: ProjectDetailIcon }
export interface ProjectDetailGroup { key: string; title: string; rows: readonly ProjectDetailRow[]; emptyText: string | null; wide: boolean }
export interface ProjectDetailSection { key: "information" | "assignment" | "schedule"; title: string; subtitle: string; groups: readonly ProjectDetailGroup[] }
export interface ProjectDetailPill { label: string; tone: ProjectDetailTone; approved: boolean }
export interface ProjectDetailValue { kind: "estimate" | "progress"; label: string; value: string; pill: ProjectDetailPill | null }
export interface ProjectDetailEstimate { id: string | null; statusLabel: string; rows: readonly ProjectDetailRow[]; emptyText: string | null }
export interface ProjectDetailPresentation {
  kind: ProjectDetailKind; id: string | null; name: string; subtitle: string;
  status: { label: string; tone: ProjectDetailTone }; created: { label: string; iso: string | null };
  overview: readonly ProjectDetailRow[];          // exactly 4, in spec §2 order
  value: ProjectDetailValue;                      // spec §3 table
  sections: readonly ProjectDetailSection[];      // spec §5
  estimate: ProjectDetailEstimate | null;         // admin only (spec §6); null for staff/client
  people: readonly ProjectDetailPerson[];         // unchanged shape
}
```

The fields `facts`, `summary` and `description` are removed. Estimate pills use `tone: "unknown"` together with the `approved` flag; the renderer draws `approved: true` as the olive "Approved" pill with a check icon. The existing finance and fallback rules and UTC date formatting are unchanged.

## Tasks (dependency-ordered)

### T1 — Reshape the presentation model *(no dependencies)*

- **Owner:** `mobile/src/features/projects/projectDetailModel.ts` and `projectDetailModel.test.ts`.
- **Work:**
  - Implement the contract above for the admin, staff and client shapes.
  - Page subtitles:
    - Admin: "Client, property and budget details".
    - Staff: "Client, schedule and progress details".
    - Client: "Schedule and progress details".
  - `overview` holds four facts per the spec §2 table.
  - `value`:
    - Estimate for admin: the approved baseline or "Approved baseline unavailable", the current total, or "No estimate yet".
    - Progress for staff and client: the pill carries the project status and tone.
  - Sections:
    - The admin client "Name" becomes "Client name".
    - The admin "Assignment & progress" gains a first group, STATUS, holding "Project status" (this keeps the "Estimation Approval" override).
    - Staff "Name" becomes "Client name".
    - Every row gets an icon key.
  - `estimate` (admin only):
    - `id` comes from `estimate.id`.
    - The rows are Status, the value label and value, "Approved estimate baseline" (Version N, only when valid) and "Initial client budget range".
    - `emptyText` is "No estimate yet" when there is no estimate.
  - Remove `facts`, `summary` and `description`.
- **Tests:**
  - Update the existing cases to the new shape and keep every finance, fallback, date, long-value, key-uniqueness and envelope case.
  - Add value-card cases: approved with baseline, approved without baseline, draft or sent, no estimate, and staff and client progress.
  - Add cases for the overview for each kind, the estimate block (admin only; null for others), and the Assignment STATUS group.
  - Keep the two-unequal-projects isolation case for both the admin and the staff shape.
- **Acceptance:** spec AC2 and AC3, and the model part of AC9.
- **Verify:** `cd mobile && npm test -- src/features/projects/projectDetailModel.test.ts`.

### T2 — Icon module *(no dependencies)*

- **Owner:** new `mobile/src/features/projects/projectDetailIcons.tsx`.
- **Work:**
  - Stroke icons drawn with `react-native-svg` (24-unit viewBox, `colors.primary` by default, with configurable size and color). They cover every `ProjectDetailIcon`, plus UI glyphs: coins, image, kebab, check, chevron up and down, and the tab icons (document, calculator, image, file, users, list).
  - Each icon is exported through `ProjectDetailGlyph({ name, size?, color? })` and is always `accessible={false}`.
  - No dependency is added.
- **Acceptance:** supports R5 (decorative icons are hidden).
- **Verify:** typecheck, which runs in T7.

### T3 — Header with overflow menu *(after T1 and T2)*

- **Owner:** new `mobile/src/features/projects/ProjectDetailHeader.tsx`.
- **Work:**
  - Row 1: `ScaffoldContentBack` on the left; on the right, a 44 dp outlined ⋮ button labelled "More project actions".
  - Title "Project Details" with the header role, then the `detail.subtitle` line.
  - `BotanicalAccent`, imported read-only from `../notifications/BotanicalAccent`, wrapped in a decorative, reduced-opacity, clipped container at the top right. The notifications file is not edited.
  - The menu follows the `ConversationSortMenu` pattern: a transparent `Modal`, a backdrop `Pressable` labelled "Close project actions", `onRequestClose`, and a panel anchored at the top right.
  - Menu items:
    - **Refresh project**: calls `onRefresh`.
    - **Project messages**: shown only when `resolveAuthorizedFeature("messages", session.user.role, session.authorization)` is non-null and `detail.id` is present. It runs `router.push({ pathname: "/record/[featureId]/[recordId]", params: { featureId: "messages", recordId: id } })`.
  - Choosing an item closes the menu.
- **Acceptance:** spec §1 and the menu parts of AC1 and AC5.

### T4 — Summary card and value card *(after T1 and T2)*

- **Owner:** new `mobile/src/features/projects/ProjectDetailSummary.tsx`, which exports `ProjectSummaryCard` and `ProjectValueCard`.
- **Work:**
  - **Summary card:**
    - The thumbnail is `assets/brand/project-detail-interior.jpg`: rounded, `resizeMode="cover"`, decorative, with an image-glyph chip.
    - Beside it: the name (header role, wraps) and a 2×2 grid of `overview` cells, each with an icon, label and value. There are vertical and horizontal hairline dividers, and every cell has `accessibilityLabel="Label: value"`.
    - Below 360 dp or at font scale above 1.3, the thumbnail stacks on top and the facts become one per row.
  - **Value card:**
    - A sage tint derived from `colors.primarySoft`, a coins icon chip, the label, and a large olive tabular value.
    - An optional pill: approved pills get the check icon, and other pills use `statusColors[tone]` from `ProjectCard.tsx`.
    - The card is one accessible element: "`label`: `value`, `pill`".
- **Acceptance:** spec §2 and §3, and the summary and value parts of AC1–AC3.

### T5 — Information, Estimation and Team panels *(after T1 and T2)*

- **Owner:** `mobile/src/features/projects/ProjectDetailOverview.tsx` (rewritten).
- **Work:**
  - Remove `ProjectDetailHero`, `ProjectDetailFacts`, `ProjectDetailAside`, `ProjectDetailLayout` and the width constants.
  - **Section cards.** Keep `ProjectDetailSections` and the collapsible card, restyled to the screenshot:
    - Card radius about 12.
    - The header keeps the icon chip, title, subtitle and chevron, and its `accessibilityState.expanded`.
    - Group titles are small, uppercase and muted.
    - Each group's rows sit in a bordered inner container (radius about 10) with hairline row dividers. Each row shows an icon, the label and a selectable value.
    - Rows stack below 340 dp or at font scale above 1.3.
    - Keep the two-groups-per-row behavior when a card is measured at 600 dp or wider.
  - **New `ProjectEstimatePanel({ estimate })`:** an "Estimate" card with a calculator icon chip, built from the same row and group primitives, with an empty state from `emptyText`.
  - **New `ProjectTeamPanel({ people })`:** a card with a decorative initials mark, the role, the name and an optional email. The card is announced as "Role: Name, email".
- **Acceptance:** spec §5, §6 and §8, and the collapse part of AC7.

### T6 — Documents panel *(no dependencies; props-only interface)*

- **Owner:** new `mobile/src/features/projects/ProjectDocuments.tsx` and new `ProjectDocuments.test.tsx`.
- **Interface:** `ProjectDocuments({ projectId, estimate: { id: string; statusLabel: string } | null, session })`.
- **Estimate PDF row** (only when `estimate` is set and `canPerformOperation(session, "GET /estimates/:estimateId/pdf")`):
  - Shows "Estimate PDF", the status label and an "Export PDF" button.
  - The download is `runtime.transfers.download({ path: /estimates/<encoded id>/pdf, fileName: lisno-estimate-<id>.pdf, mimeType: application/pdf, maxBytes: 25 MB }).result` followed by `share({ cleanupAfterShare: true })`.
  - Shows a busy state while downloading and an inline assertive error on failure.
- **Approved design files** (only when `GET /projects/:projectId/design-versions` is allowed):
  - Use `useQuery` with exactly `privateQueryKey(scope, "design", "project", projectId)` and the URL `/projects/<id>/design-versions?limit=30&offset=0`, so the cache is shared with `DesignVersionWorkspace` and invalidated by `design-workflow-changed`.
  - Filter to `approvalStatus === "approved"`.
  - Each row shows the filename, "Version N" and the approved date (UTC, when present).
  - A Download button appears when `GET /design-versions/:versionId/download` is allowed. It uses the same transfer and share call as `VersionActions`, with a 50 MB maximum.
  - States: a loader while loading; "Approved documents could not be loaded" with Retry on error; "No approved documents yet." when empty.
- **Tests:**
  - The PDF row is hidden without the permission or without an estimate.
  - Export calls the transfer with the estimate's own ID. Use two estimates to prove the ID is not cross-wired.
  - The busy state and the error message.
  - Only approved versions are listed.
  - Download is permission-gated.
  - The empty, loading and error-with-retry states.
  - The query key equals the design workspace key.
- **Acceptance:** spec §7 and AC6.
- **Verify:** `cd mobile && npm test -- src/features/projects/ProjectDocuments.test.tsx`.

### T7 — Page composition, tabs and integration *(after T3–T6)*

- **Owner:** new `mobile/src/features/projects/ProjectDetailPage.tsx`, plus `ProjectStructure.tsx`.
- **`ProjectDetailPage`:**
  - Props: `{ detail, session, onRefresh, tasksPanel: ReactNode }`.
  - Renders in order: header, summary card, value card, tab strip, then the panels.
- **Tabs:**
  - The exported pure function `visibleProjectTabs(detail, session)` returns tabs in the spec §4 order: Information (always); Estimation (`detail.kind === "admin"`); Designs; Documents; Team (`people.length > 0`); Tasks (always), using the §4 permission rules.
  - The tab strip is a horizontal `ScrollView` with `accessibilityRole="tablist"`. Each tab is a `Pressable` with `role="tab"`, `accessibilityState.selected`, `minHeight: 44`, an icon and a label. The active tab gets the surface background and a 2 dp `colors.primary` underline.
  - A panel mounts on its first visit and then stays mounted, hidden with `display: "none"` when inactive.
  - If the selected tab is no longer visible, the selection resets to Information.
- **Panel contents:**
  - **Information:** `ProjectDetailSections`.
  - **Estimation:** `ProjectEstimatePanel`.
  - **Designs:** `DesignVersionWorkspace`, then `WorkflowWorkspace`. Both are unchanged and get the project ID.
  - **Documents:** `ProjectDocuments`.
  - **Team:** `ProjectTeamPanel`.
  - **Tasks:** `tasksPanel`.
- **`ProjectStructure.tsx`:**
  - Keep `TaskEditor` and the floors panel markup exactly as they are, but pass them as `tasksPanel`.
  - Remove the bottom "Refresh project" button; the refresh action moves to the ⋮ menu through `onRefresh`.
  - Move the design and workflow workspaces into the Designs tab.
  - Restyle the panel radius to match the new cards, about 12. Only the style changes.
- **Acceptance:** spec §4 and §9, and AC1, AC4 and AC5.

### T8 — Screen container width *(no dependencies)*

- **Owner:** `mobile/src/features/workspace/RecordDetailScreen.tsx`, the `projectContent` style only.
- **Work:** change `maxWidth` from 1200 to 860 and keep the "Updating…" cue. Do not change any other branch or record type.
- **Acceptance:** spec §9 and AC7 and AC8 (other record types are unchanged).

### T9 — Page-level regression tests *(after T7 and T8)*

- **Owner:** `mobile/src/features/projects/ProjectStructure.test.tsx`.
- **Mocks:**
  - Extend the `RuntimeProvider` mock with `environment.environment.id` and `runtime.transfers.download`, and the `api.authenticated.get` resolver.
  - Mock `expo-router` (`router.push`) and `../notifications/BotanicalAccent`.
  - Keep the existing design, workflow and hierarchy-create mocks.
- **Replace** the "no reference-only tabs or header actions" case.
- **Cases to add or update:**
  1. **Admin screenshot parity:** the header title and subtitle, the ⋮ button, the summary cells, the value card with the baseline ₹ value and "Approved", the tab order (Information, Estimation, Designs, Documents, Team, Tasks), the Information panel with PROJECT and CLIENT icon rows, and no "Edit" control.
  2. **Finance on two unequal admin projects** (Lakeside approved and assigned; Harbour pending assignment): the baseline is never the mutable total, "Estimation Approval" appears in Assignment, and there is no cross-contamination.
  3. **Staff** (Palm): the progress value card with the "On Hold" pill; the Client and Planned completion summary cells; no Estimation tab; a Team tab with the Client only; Tasks renders the floors and stages with the create and upload mocks and `TaskEditor` gates.
  4. **Client** (Garden): no contact details or team, no admin labels, no Estimation tab, and Tasks present.
  5. **Tab behavior:** the selected state, the panel swap, a visited panel staying mounted and hidden, and a fallback to Information when a rerender with fewer permissions removes the selected tab.
  6. **Permission matrix for Designs and Documents:** hidden without the permissions, shown with them.
  7. **⋮ menu:** Refresh calls `onRefresh` and closes the menu; Project messages appears only with an authorized messages feature, and pushes the messages route with the project ID.
  8. **Collapsing** a section card, with its `expanded` state.
  9. **320 dp at font scale 2.0:** stacked layout, and no fixed widths wider than the viewport.
  10. **Non-record payload** renders nothing.
- **Acceptance:** AC1, AC3, AC4, AC5 and AC7, and the page part of AC9.
- **Verify:** `cd mobile && npm test -- src/features/projects`.

### T10 — Integrity review and final verification *(after T1–T9, on the integrated tree)*

- **Owner:** the primary agent in Mode B, or `integrity_reviewer` then `verification_runner` in Mode A.
- **Review:**
  - Inspect the full diff against the spec invariants: baseline-only approved value; no manufactured values; unchanged permission gates; only ID-based actions; decorative elements hidden; nothing outside `mobile/src/features/projects/**` and the `RecordDetailScreen.tsx` style line; `start.log` untouched.
- **Run:**
  1. `cd mobile && npm run typecheck`
  2. `cd mobile && npm test -- src/features/projects src/features/workspace`
  3. `cd mobile && npm test` (full mobile suite)
  4. `git diff --check` and `git status --short`
- **Visual check:** try a rendered check (web adapter or emulator) at 390 dp and 768 dp for the admin and staff views. If no running backend or emulator is available, report it as not run. Do not leave screenshots or build output in the repository.
- **Acceptance:** AC8 and AC9.

## Parallelism and ownership

| Wave | Tasks (can run in parallel) | Touches |
|---|---|---|
| 1 | T1, T2, T6, T8 | model and model test; new icon file; new documents file and test; `RecordDetailScreen` style |
| 2 | T3, T4, T5 | new header file; new summary file; the overview file |
| 3 | T7 | new page file; `ProjectStructure.tsx` |
| 4 | T9 | `ProjectStructure.test.tsx` |
| 5 | T10 | read-only review and checks |

- No two tasks in the same wave write the same file.
- T3, T4 and T5 read the T1 contract and the T2 icon names, but do not edit those files.
- T6 depends only on props and existing runtime and query helpers.
- Shared-contract changes (model types, icon names) go through the primary agent and are broadcast before any dependent work continues.

## Acceptance-criteria trace

| Spec AC | Delivered by | Verified by |
|---|---|---|
| AC1 Admin screenshot parity | T3, T4, T5, T7 | T9 case 1 |
| AC2 Finance rules | T1, T4 | T1 tests, T9 case 2 |
| AC3 Staff and client scoping | T1, T4, T7 | T1 tests, T9 cases 3–4 |
| AC4 Tabs visibility, state and fallback | T7 | T9 cases 5–6 |
| AC5 Operational parity and ⋮ menu | T3, T7 | T9 cases 3, 7 |
| AC6 Documents | T6 | T6 tests |
| AC7 Accessibility and responsiveness | T4, T5, T7, T8 | T9 cases 8–9, T10 visual check |
| AC8 No out-of-scope changes | all | T10 diff review and `git status` |
| AC9 Verification passes | T1, T6, T9 | T10 commands |

## Out of scope and not performed

No backend, web, API or permission changes; no dependencies, lockfile changes or new assets; no commits, pushes, deploys, seeds or migrations.
