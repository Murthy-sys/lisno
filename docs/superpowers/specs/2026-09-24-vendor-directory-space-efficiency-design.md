# Vendor directory: space efficiency and room for future details

Date: 2026-09-24
Status: Approved 2026-09-24, including the three proposed defaults under Open decisions. Implemented in Mode A and verified; see the plan's execution evidence for accepted deviations and limits. Amendment 1 (wide-screen white space): approved 2026-09-24, including open decision 4; implemented in Mode A and verified. Task plan: [2026-09-24-vendor-directory-space-efficiency.md](../plans/2026-09-24-vendor-directory-space-efficiency.md).
Classification: Substantial, frontend only (several files in one feature; no backend, data, permission or finance change).
User request: "More details will come in future; we should accommodate that. Keep the same design and use space much more efficiently." (Reference: current Vendor directory screenshot shared in this conversation.)
Builds on: [Vendor directory reference spec](2026-09-24-vendor-directory-reference-design.md). This spec replaces three of its choices (five rows per page, separate Main/Sub Basket columns, and the bottom performance notice). It keeps every other requirement in that spec.

## Amendment 1 — wide-screen white space (approved 2026-09-24)

User feedback on the implemented page, with a screenshot at about 1914px viewport width: "I am seeing a lot of white spaces."

### Evidence

| Source | Where it comes from | Size in the screenshot |
| --- | --- | --- |
| Page width cap | `.ui-workspace > *` is `inline-size: min(100%, var(--ui-workspace-measure))`, and the measure is `--content-wide: 90rem` (`frontend/src/styles/shell.css:316,331`, `frontend/src/styles/global.css:130`). The directory's page element, `section.vendor-procurement`, is centered at 1440px. | The content spans x≈354–1794. That leaves about 96px unused on each side beyond the 24px workspace padding, about 192px in total. |
| Extra table width spread evenly | Vendor Details, Type and Basket share any extra width by weight (45/30/25). | Column widths are about 427, 288 and 245px, for content of about 330, 150 and 70px. That leaves visible gaps of about 140px (Type→Basket) and 175px (Basket→Status). |
| Few records | Only 2 vendors exist, so the panel ends after the pagination row. | The empty area below the panel is missing data, not a layout defect. |

No other page opts out of the 1440px cap today. The directory would be the first. There is precedent for page-scoped `:has()` rules on the workspace: `frontend/src/styles/estimator-dashboard.css:302`.

### Options

1. **Recommended: full width for this directory, with content-fitted columns.** The directory fills the workspace. Type and Basket stop growing at a cap, and Vendor Details takes the remaining width. Data stays grouped, long vendor names stop wrapping on wide screens, and future columns take space from Vendor Details first.
2. **Full width, keep the even split.** This removes the side gutters, but the in-table gaps get larger (Type about 345px, Basket about 292px at 1914).
3. **Keep the 1440px cap and only rebalance the columns.** This reduces the in-table gaps, but the side gutters stay.

### Changes (option 1)

- **A1 — Full width for this page only.** The Super Admin directory's page section fills the workspace width. The 24px workspace padding stays.
  - Scope it to `.ui-workspace > .vendor-procurement:has(> .vendor-directory)`.
  - The Sales Manager procurement view and every other page keep the 1440px cap.
  - The hero keeps its composition. The image stays at 52% of the hero width with `object-fit: cover`, and the quote stays on the right.
- **A2 — Content-fitted columns.**
  - **Type and Basket:** they keep their minimums and weights and gain a maximum width: Type 240px, Basket 220px.
  - **Vendor Details:** it becomes the single fill column. Its `<col>` has no width, so it takes the remaining width, never less than its 220px minimum.
  - **Unchanged:** the fixed columns, the 940px minimum table width, sticky behavior and contained scroll. Layouts at 1280 and 1024 stay the same (columns at their minimums, no scroll region).
  - **Registry contract (C1/C2):**
    - A width may be `{ weight, min, max }`, rendered as `clamp(min, min + surplus × weight/totalWeight, max)`.
    - Exactly one column may be `{ fill: true, min }`. Its weight still counts toward the surplus share, so the capped columns grow at the same rate as today until they reach their maximum.
  - **Where space remains:** on very wide screens, some space stays after the vendor name and code. That space gives long names room, and it's where future columns will draw from.

### Non-goals

- Changing the width cap app-wide. See open decision 4.
- Filling or stretching the empty area below the panel.
- New columns or data.
- Changes to the Sales Manager screen.

### Acceptance criteria

- **AC-A1:** At 1920×1080 and 1704×1180, the directory's outer edges sit 24px (±2px) from the workspace edges, and the page never scrolls sideways. The Sales Manager procurement screen and one other page are still capped at 1440px.
- **AC-A2:** At 1920 and 1440, Type is at most 240px and Basket at most 220px, and Vendor Details takes the rest. At 1280 and 1024, column widths match the current build (225/154/133px) and no scroll region appears. The extended-columns harness still scrolls inside its wrapper, with Vendor Details and Actions pinned.
- **AC-A3:** The design is otherwise unchanged, with a side-by-side comparison at 1920. The long-name sample row doesn't wrap at 1704px or wider. The hero image isn't distorted.
- **AC-A4:** Registry tests cover the fill and max widths and the minimum table width. The procurement tests, typecheck and build pass. The width matrix, now including 1920×1080, has zero axe violations and no page-level overflow.

### Risks

| Risk | Mitigation |
| --- | --- |
| This page is wider than other pages | The rule is scoped to this directory only, and the app-wide choice is open decision 4 |
| The hero crop looks sparse at 1920 | Visual check at 1920. The image keeps `object-fit: cover` |
| Older browsers without `:has()` | They keep today's 1440px layout, a safe fallback. Current Chromium, Safari and Firefox support it |

### Open decision (default proposed; approving the amendment accepts it)

4. **Page width scope.** Default: full width for the Super Admin vendor directory only. Changing the 1440px cap for every page would be a separate app-wide decision.

## Goal

Keep the current visual language: the interior-image hero, serif title, four overview tiles, olive accents, warm neutral surfaces, filter row, table and icon actions. Then do two things:

1. **Use space better now.** Show more vendor rows per screen and remove low-value whitespace and duplicate content.
2. **Leave room for future vendor details.** Adding a new column, filter or detail field should take one definition and should not need a layout rework. A table with more columns must never overflow the page or squeeze vendor identity and actions until they are unreadable.

## Current behavior and evidence

These findings come from read-only inspection of the current source (`frontend/` has no uncommitted changes) and the screenshot measured at about 1310px content width.

| Area | Source | Finding |
| --- | --- | --- |
| Hero | `vendorDirectory.css` `.vendor-directory__hero` | `min-height: 212px` plus `padding-bottom: 65px`. The tiles overlap it by 66px. Tiles start about 190px down the page, and the workspace starts at about 320px. |
| Overview tiles | `.vendor-directory__metric` | 20px padding, a 53×57px icon well and a 29px value make each tile about 110px tall for one number. |
| Table columns | `VendorDirectoryTable.tsx:39`, CSS `nth-child` widths | 8 columns, with widths hard-coded by `nth-child` position. Fixed columns use 452px (select 56, Status 116, KPI 104, Actions 176). The rest is split 40/26/17/17% between Vendor, Type, Main Basket and Sub Basket. Main and Sub Basket hold short names ("test main", "sub1"), so about 60% of each of those cells is empty. |
| Column extensibility | same | Headers, cells, widths and mobile labels are defined in three separate places (JSX header, JSX row, CSS `nth-child`). A new column needs coordinated edits in all three, and every existing column gets narrower. The table has no horizontal-overflow strategy, and `table-layout: fixed` compresses everything. |
| Row density | `.vendor-directory__table :is(th, td)` | 14px vertical padding and a 43px avatar give rows about 70px tall. |
| Page size | `ProcurementVendorDirectory.tsx:45`, `VendorDirectoryTable.tsx:60-63` | `limit: 5` is hard-coded in the query, the out-of-range correction and the pagination math (5 separate literals). The backend accepts `limit` from 1 to 100 (`backend/src/routes/ai-estimator-knowledge-admin.ts:62`). |
| Duplicate content | `ProcurementVendorDirectory.tsx:98` | The bottom "Vendor performance" notice repeats what the Average KPI tile and every KPI cell already say ("Not available", "Performance is not rated yet"). It adds about 100px of vertical space. |
| Filters | `.vendor-directory__filters` | A fixed 6-track grid (`1.5fr` + 4 × `1fr` + `auto`). A sixth filter would squeeze all of them. It has no wrap rule above the 1100px container breakpoint. |
| Mobile/tablet cards | `@container (max-width: 950px)` | Each field is its own full-width label/value row. Every future field adds a full row to each card, even on tablets that have room for two columns. |
| Data available to rows | `knowledgeTypes.ts:564` `ProcurementVendorSummary` | Rows only have safe classification data (type, execution types, completeness, verification flag, baskets). Contact, identity, turnover and similar fields exist only in the private detail profile. |

At a 1440×900 viewport, about 4 vendor rows fit on the first screen today.

## Options considered

1. **Recommended: a column-definition table, merged basket column, denser rhythm, contained horizontal scroll with sticky identity and actions.** This keeps the current table look and makes it both compact now and able to grow later. New fields become one registry entry, and overflow scrolls only inside the table.
2. **Expandable row detail panel.** Core columns stay fixed and secondary details open in a panel under each row. This scales to many fields, but it hides data behind a click, adds an interaction to every row, and suits private, profile-level data that rows don't have today. It stays available as a later increment and fits on top of option 1.
3. **Card or grid layout on desktop.** This moves away from the current design and is less efficient for scanning or comparing many vendors. Rejected.

## Scope

### In scope (frontend only)

`ProcurementVendorDirectory.tsx`, `VendorDirectoryOverview.tsx`, `VendorDirectoryTable.tsx`, `vendorDirectory.css`, `VendorDirectory.test.tsx`, plus a new column-definition module inside `frontend/src/features/procurement/` if the plan needs one.

### Non-goals

- Adding new vendor fields, columns, filters or any backend or DTO change. The Vendor KPI still says **Not available** everywhere.
- A column show/hide chooser or saved view preferences. The registry has a slot for a future `optional` flag, but no chooser ships until there are optional columns to toggle.
- An expandable row detail panel (option 2).
- Changes to the vendor editor drawer, the Sales Manager screen, global navigation or the app shell.
- New dependencies, fonts, icon libraries, animations, gradients or shadows.
- Commits, deployment or any live data operation.

## Requirements

### R1 — Tighter header and overview, same design

- Keep the hero composition: eyebrow, serif "Vendor directory" title, description, right-side interior image and the olive "Reliable partners…" quote panel. Reduce the hero's height and bottom padding and the tile overlap. Target: tiles start about 40–50px higher than today at desktop width, and the hero text stays fully visible, with no clipping of the title or quote.
- Make the four overview tiles more compact: smaller padding, an icon well of about 44px, and a slightly smaller value size. Keep the same four metrics, icons, colors, percentages, helper text, loading/error/retry behavior and accessible names. Target tile height is about 84–90px at desktop.
- Keep the tablet (2×2) and phone tile layouts. Apply the same proportional tightening there.

### R2 — Remove duplicate content

- Remove the bottom "Vendor performance" notice. The Average KPI tile ("Not available / Performance is not rated yet") and every row's KPI cell still say plainly that KPI is unavailable. No fabricated score appears anywhere.

### R3 — Column-definition table

- Define every table column once, in an ordered registry. Each entry has an id, header label, width behavior (fixed width or fluid weight with a minimum width), optional sticky edge (start or end), mobile or card label, card placement (identity, field or actions), and cell renderer. The header row, body cells, `colgroup` widths, `data-label` values and the table's minimum width all come from this registry. No width rules depend on `nth-child` position.
- Adding a column in the future means adding one registry entry, plus data if new fields are needed. The desktop table, the contained-scroll behavior and the stacked cards then adapt without further CSS or layout changes.
- Keep semantics as they are: vendor identity stays the row header (`th scope="row"`), the caption and header scope stay, and the checkbox accessible names stay the same.

### R4 — Consolidated, denser columns

- New column set: Selection · Vendor Details · Type · **Basket** · Status · Vendor KPI · Actions (7 instead of 8).
- **Basket** shows the Main Basket name as the primary line and the Sub Basket as a secondary line, with a visible or accessible "Sub Basket" cue so the two can't be confused. It keeps the current "Not recorded", "Unavailable" and "Unavailable for new selections" states for each level.
- Reduce the fixed columns: selection about 48px, Status about 124px, KPI about 112px, and Actions about 156px (the three 44px icon buttons stay, with less gap and padding). The width this frees goes to the fluid columns now and to future columns later.
- Reduce the row rhythm to about 10px vertical cell padding with a 36px avatar. Target desktop row height is 60px or less. Buttons, checkbox labels and pagination keep 44px minimum targets.
- Vendor Details keeps the initials avatar, entity name and one-line code, ending in an ellipsis, with the full code in a `title`. Type keeps the Execution/Supplier tag and the "Labor · Material + Labour" or incomplete-profile lines. Status keeps the lifecycle badge and the separate "Under Review" note. Actions keep the pencil/eye edit or view button, the red-outlined bin, and the overflow menu, with their current permissions, tooltips, keyboard behavior and focus return.

### R5 — Room to grow: contained horizontal scroll

- The table's minimum width is the sum of each column's minimum width from the registry. When the workspace is narrower than that minimum but wider than the card breakpoint, the table scrolls horizontally **inside its bordered wrapper**. The page never scrolls horizontally.
- In that scrolling state, the selection and Vendor Details columns stick to the start edge and Actions sticks to the end edge. Use solid backgrounds and a border divider, not shadows, so identity and actions are always visible and can't be overlapped by scrolled content. Selected-row and header backgrounds stay correct on sticky cells.
- A scrollable wrapper can be reached by keyboard (focusable, with an accessible name such as "Vendor table, scroll horizontally") only while it actually overflows. It adds no extra tab stop otherwise.
- With today's 7 columns, no horizontal scroll appears at common desktop content widths (about 1000px and wider).

### R6 — Filters that wrap as they grow

- Keep the same filters, labels, placeholder, debounce, Enter-to-apply, Main-clears-Sub behavior, Reset and error/retry behavior.
- Change the filter layout so it keeps one row at desktop with today's filters but wraps cleanly onto further rows when more filters are added or the width shrinks. Search stays the widest field, and Reset stays aligned at the end of the last row. Tablet and phone layouts keep their current order.

### R7 — Page size

- Default to **10 vendors per page**, with a "Rows per page" control in the footer offering 10, 25 and 50.
- Keep "Showing X to Y of Z vendors", numbered pagination with ellipses, `aria-current`, and previous/next. Replace every hard-coded `5` with one page-size value. Changing the page size resets to page 1 and clears the selection. Correction of an out-of-range page after an archive or filter change works for any page size.
- The page size is session UI state. It isn't persisted across reloads (see non-goals).

### R8 — Denser tablet and phone cards

- Keep the card breakpoint at 950px container width. Cards still show identity with the checkbox at the top, labeled fields, and actions at the bottom.
- When a card has room (container about 600px or wider), lay out the labeled fields in a two-column auto-fit grid instead of one per row. Below that, use one column. Future fields added through the registry follow the same rule automatically.

### R9 — Behavior preserved

Everything else in the reference spec stays as it is: overview counts independent of filters, truthful loading/empty/error/permission states, search/filter/reset semantics, selection rules, add/edit/view/archive with reason and version checks, query invalidation, the permission-based visibility of actions, and the scoping of styles to the Super Admin directory.

## Data, API and UX impact

- **Data/API:** none. The page uses the existing list endpoint with `limit` values of 10, 25 or 50 (the backend allows up to 100) and the existing overview request. No DTO, schema, OpenAPI, permission or persistence change. No migration, seed or backfill.
- **Future details:** a future column that needs data outside `ProcurementVendorSummary` (for example representative, phone, GST/MSME flags, turnover or allocation use) needs its own spec to extend the safe summary DTO with a privacy decision. This layout only makes room for such fields and doesn't decide what data may appear in the list.
- **UX:** same visual identity with less whitespace and about 50% more rows visible on the first screen at 1440×900. The layout changes are the merged Basket column, the rows-per-page control and the removed bottom notice.
- **Rollback:** frontend-only. Reverting the changed files restores the previous layout. No stored state is involved.

## Assumptions

- "More details" means more vendor attributes will later appear as columns, filters or card fields in this directory. No specific field is committed to now.
- Merging Main and Sub Basket into one column is acceptable because Sub Basket always belongs to its Main Basket, and both are short labels.
- 10 rows is a better default than 5 for a growing directory. The reference spec's five-row choice was made to match the original screenshot's sample data.
- The existing 44px touch-target rule still applies, so action buttons and checkbox targets are not shrunk.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sticky cells show see-through or incorrect backgrounds on selected or hovered rows | Explicit backgrounds per row state on sticky cells, checked at desktop and at an overflowing width. |
| Registry refactor changes semantics (row header, labels, names) and breaks accessibility or tests | Keep existing accessible names. Tests assert headers, the row header and labels are generated from the registry. Run an axe scan. |
| A tighter hero clips the title or quote at intermediate widths | Width matrix check at 1704, 1440, 1280, 1024, 768 and 390px. |
| Page-size change leaves stale out-of-range offsets | One page-size value drives the query, pagination and correction. Tests cover changing page size on a later page. |
| Removing the notice is read as hiding KPI status | KPI tile and row cells keep explicit "Not available" text. A test asserts this. |

## Acceptance criteria

- **AC1 Same design:** Side-by-side rendered screenshots at 1440px show the same hero, tile, filter, table, badge and action styling, colors and typography. Only spacing, the merged Basket column, the page-size control and the removed notice differ.
- **AC2 Density:** At 1440×900, the first vendor row starts at least 100px higher than on the current build, desktop row height is 60px or less, and at least 6 vendor rows are visible without scrolling (about 4 today). Recorded by rendered measurement before and after.
- **AC3 Extensibility:** Headers, body cells, widths, `data-label`s and card placement come from one registry. A test renders the table with two extra registry columns and shows they appear in the header, rows and cards with no code changes elsewhere. In the rendered check, a width where the minimum table width exceeds the workspace scrolls inside the wrapper only, with Vendor Details and Actions still visible (sticky) and no page overflow.
- **AC4 Basket column:** Main and Sub Basket show correctly in one column, including not-recorded, unavailable and unavailable-for-new-selections states. Basket filters are unchanged.
- **AC5 Page size:** Default 10. Switching to 25 or 50 requests the matching `limit`, resets to page 1 and clears the selection. "Showing X to Y of Z" and numbered pages are correct. Archiving the last row on the last page lands on a valid page.
- **AC6 Preserved behavior:** All existing directory tests pass, updated only where this spec changes the expected output (page size, merged column, removed notice). KPI still says "Not available" in the tile and every row.
- **AC7 Responsive and accessible:** No page-level horizontal overflow at 1704, 1440, 1280, 1024, 768 and 390px. Two-column card fields at tablet and one column on phone. Keyboard flow through filters, table (including the scroll wrapper only when it overflows), actions, overflow menu and pagination, with visible focus. 44px targets. An axe scan has no new violations.
- **AC8 Regression:** `cd frontend && npm test -- src/features/procurement/VendorDirectory.test.tsx` (plus impacted procurement tests), `npm run typecheck`, `npm run build`, `git diff --check`, and `git status --short` confirming that only in-scope files changed.

## Open decisions (defaults proposed; approving the spec accepts them)

1. **Remove the bottom performance notice.** Default: remove, because it duplicates the KPI tile.
2. **Default page size.** Default: 10, with a 10/25/50 selector.
3. **Merge Main and Sub Basket into one column.** Default: merge.
