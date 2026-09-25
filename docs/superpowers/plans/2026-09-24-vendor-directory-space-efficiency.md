# Vendor directory space efficiency: implementation plan

Date: 2026-09-24
Status: Approved 2026-09-24; user selected Mode A. S0–S6 complete; implementation, integrity review and scoped verification passed. Evidence is under "Execution evidence" below. Amendment 1 task plan (wide-screen white space): approved 2026-09-25; user selected Mode A; B0–B5 complete and verified (see "Amendment 1 execution evidence").
Approved specification: [Vendor directory: space efficiency and room for future details](../specs/2026-09-24-vendor-directory-space-efficiency-design.md).

## Outcome and boundaries

Keep the current directory design. Tighten the hero, the tiles and the row rhythm. Merge Main and Sub Basket into one Basket column. Drive the table from one column registry, with contained horizontal scroll and sticky identity and actions. Let filters wrap. Add a 10/25/50 rows-per-page control with 10 as the default. Show card fields in two columns on tablets. Remove the duplicate bottom performance notice. KPI still says **Not available** in the tile and in every row.

This change is frontend only. It has no backend, DTO, OpenAPI, permission, data, dependency or lockfile change. It also has no column chooser, row expansion, new vendor fields, commit, push or deployment.

**Allowed write set.** Any other path is out of scope.

| Path | Change |
| --- | --- |
| `frontend/src/features/procurement/vendorDirectoryColumns.tsx` | New: column registry, types and default columns |
| `frontend/src/features/procurement/VendorDirectoryTable.tsx` | Registry-driven table, scroll wrapper, pagination with page size |
| `frontend/src/features/procurement/ProcurementVendorDirectory.tsx` | Page-size state and wiring; remove performance notice |
| `frontend/src/features/procurement/vendorDirectory.css` | All layout and density changes |
| `frontend/src/features/procurement/VendorDirectory.test.tsx` | Updated and new directory tests |
| `frontend/src/features/procurement/VendorProcurement.test.tsx` | Only the Next-page `offset` expectation (`"5"` → `"10"`) at line 156 |
| `frontend/src/features/procurement/VendorDirectoryOverview.tsx` | No change expected. Touch only if the integrated result proves it necessary, and record why. |
| This plan and the spec | Status and evidence only |

**QA directory:** `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/`. Baselines, the harness, screenshots and reports go here, never under `frontend/src`.

## Frozen integration contract (released in S0 before any writer starts)

### C1 — Column registry (`vendorDirectoryColumns.tsx`)

```ts
export interface VendorDirectoryRowContext {
  selected: boolean; toggle: (checked: boolean) => void;
  canUpdate: boolean; canArchive: boolean;
  onEdit: () => void; onView: () => void; onArchive: () => void;
}
export interface VendorDirectoryColumn {
  id: string;
  header: string;                                    // <th> text, data-label and card label
  width: { fixed: number } | { weight: number; min: number };
  sticky?: "start" | "end";
  placement: "selection" | "identity" | "field" | "actions";
  render: (vendor: KnowledgeMaster, context: VendorDirectoryRowContext) => ReactNode;
}
export const vendorDirectoryColumns: readonly VendorDirectoryColumn[];
```

Rules:

- Exactly one `selection` column and one `identity` column, at most one `actions` column, and any number of `field` columns.
- The `selection` header renders the existing select-all checkbox ("Select all vendors on this page"), and its `header` text is used only as the visually hidden column name.
- The `identity` cell renders as `<th scope="row">`. All other cells render as `<td>`.
- Only fixed-width columns may come before another `sticky: "start"` column, so sticky offsets stay deterministic.

Default columns. Fixed widths total 440px and the minimum table width is 940px, so today's 7 columns never scroll above the 950px card breakpoint.

| id | header | width | sticky | placement | renders |
| --- | --- | --- | --- | --- | --- |
| `selection` | Select | fixed 48 | start | selection | Row checkbox `Select {name}` |
| `vendor` | Vendor Details | weight 45, min 220 | start | identity | Avatar initials, name, one-line code with `title` |
| `type` | Type | weight 30, min 150 | — | field | Existing tag, execution line and incomplete lines |
| `basket` | Basket | weight 25, min 130 | — | field | See C3 |
| `status` | Status | fixed 124 | — | field | Existing lifecycle badge and "Under Review" note |
| `kpi` | Vendor KPI | fixed 112 | — | field | "Not available" |
| `actions` | Actions | fixed 156 | end | actions | Existing Edit/View, Archive and RowMenu, with the same names, permissions and titles |

`VendorDirectoryTable` gains `columns?: readonly VendorDirectoryColumn[]` (default `vendorDirectoryColumns`). Its existing props keep their current meaning. `RowMenu` and the initials logic move with the renderers. `normalizeExecutionTypes` and `DirectoryIcon` stay imported from their current modules.

### C2 — Markup and CSS hooks (the only selectors the CSS writer relies on)

- **`<colgroup>`:** one `<col data-column={id}>` per column.
  - Fixed columns: inline `width: {n}px`.
  - Fluid columns: inline `width: max({min}px, calc((100cqw - {fixedSum + 2}px) * {weight / totalWeight}))`. `100cqw` is the existing `.vendor-directory__workspace` inline-size container; `+2` is the wrapper border.
- **Table:** inline custom property `--vendor-table-min-width: {fixedSum + sum(min)}px`.
- **Every cell** (`th` or `td`) carries:
  - `data-column={id}` and `data-placement={placement}`;
  - `data-sticky="start"|"end"` when sticky;
  - `data-label={header}` for `field` and `actions` cells;
  - an inline `--sticky-offset: {px}` on sticky-start cells (selection 0, vendor 48).
- **Wrapper:** `.vendor-directory__table-wrap`, with `data-scrollable="true"` only while `scrollWidth > clientWidth`.
  - Detect overflow with the repo's guarded `ResizeObserver` pattern (`typeof ResizeObserver === "undefined" ? null : …`, as in `ChatComposer.tsx:108`), plus a measurement on mount and after `items` or `columns` change.
  - While scrollable, the wrapper also gets `role="region"`, `tabIndex={0}` and `aria-label="Vendor table, scroll horizontally"`. Otherwise it has none of these.
- **Basket cell:** `.vendor-directory__basket` holds the main line; a `<small className="vendor-directory__sub-basket">` holds the sub line.
- **Footer:** `.vendor-directory__footer` contains `.vendor-directory__range` (the "Showing…" text plus the rows-per-page field `.vendor-directory__page-size`) and the existing `nav`.
- **Removed:** the `.vendor-directory__performance` aside and its CSS.

### C3 — Basket rendering

- **Main line:** a visually hidden "Main Basket: " prefix, then the Main name.
  - If the name is missing but the reference exists: "Unavailable".
  - If there is no Main Basket: "Not recorded".
  - If its status isn't active: keep the `<small>` "Unavailable for new selections".
- **Sub line:** an `aria-hidden` "↳ " glyph, a visually hidden "Sub Basket: " prefix, then the name ("Unavailable" or "Not recorded" in the same way).
- The accessible text reads "Main Basket: test main … Sub Basket: sub1". No IDs or labels are used as join keys, and the basket filters are unchanged.

### C4 — Page size

- In `VendorDirectoryTable.tsx`: `export const vendorDirectoryPageSizes = [10, 25, 50] as const; export type VendorDirectoryPageSize = (typeof vendorDirectoryPageSizes)[number];`
- `VendorDirectoryPagination` props: `{ offset, total, count, pageSize, busy, onPage(offset), onPageSize(size) }`.
  - All paging math uses `pageSize`; no literal `5` remains.
  - It renders a labeled "Rows per page" `Select` (existing `Field`/`Select`, `useId` id) with the three options.
- `ProcurementVendorDirectory.tsx`:
  - holds `useState<VendorDirectoryPageSize>(10)` and uses it for `limit` and for out-of-range correction (`Math.ceil(total / pageSize)`);
  - `pageSizeChanged(size)` sets the size, sets offset 0 and clears the selection;
  - Reset leaves the page size unchanged (it is a view preference, not a filter);
  - it is not persisted across reloads.

## Dependency order and parallelism

Keep one parent task in progress at a time from the primary's point of view. Parallel writers only work on the disjoint files shown.

| Task | Deliverable | Depends on | Mode A owner | Can run in parallel with | Spec coverage |
| --- | --- | --- | --- | --- | --- |
| S0 | Baselines, before-measurements, contract release | Plan approval and mode choice | Primary | — | AC1, AC2 baseline |
| S1a | Registry and table (`vendorDirectoryColumns.tsx`, `VendorDirectoryTable.tsx`) | S0 | Frontend writer A | S1b, S2 | R3, R4, R5 (markup), R7 (pagination) |
| S1b | Page wiring (`ProcurementVendorDirectory.tsx`) | S0 | Frontend writer B, or primary | S1a, S2 | R2, R7, R9 |
| S2 | Styles (`vendorDirectory.css`) | S0 | Frontend writer C (styles) | S1a, S1b, S3 | R1, R4, R5, R6, R8 |
| S3 | Tests (`VendorDirectory.test.tsx`, `VendorProcurement.test.tsx`) | S1a and S1b finished | Primary, or a test writer | S2 | AC3–AC6 |
| S4 | Integration, diff inspection and integrity review, with bounded fixes | S1a, S1b, S2 and S3 finished | Primary integrates; `integrity_reviewer` reviews | — | All requirements |
| S5 | Final automated and rendered verification | S4 findings resolved | `verification_runner` (automated); primary (browser) | — | AC1–AC8 |
| S6 | Record evidence here and hand off | S5 | Primary | — | AC8 |

**Mode B** runs S0 → S1a → S1b → S2 → S3 → S4 → S5 → S6 inline, with no implementation subagents. The primary does the equivalent integrity review in S4. No agent starts before the execution mode is chosen.

## Task details

### S0 — Baseline and contract (primary)

1. Record `git status --short`. Confirm the target files have no diff (clean at spec time) and save copies to the QA directory. Keep the existing unrelated mobile and docs changes untouched.
2. Build a rendered harness in the QA directory: the real directory components on the Vite dev server, a synthetic transport, and Playwright Chromium from the existing `~/Library/Caches/ms-playwright` install. Use 12 synthetic vendors with active/inactive states, verified and unverified, missing summary, a long name and a 40-character code, and inactive or missing baskets. Don't touch real data or seeds.
3. Before-measurements at 1440×900: hero height, tile top and height, workspace top, first-row top, row height, and rows fully visible above the fold. Save `before-1440.png` and `before-metrics.json`.
4. Release C1–C4 to all writers unchanged. Any writer who finds a contract gap reports back to the primary before writing.

### S1a — Registry and table (writer A)

1. Create `vendorDirectoryColumns.tsx` with the C1 types, the default registry and renderers. Move the current cell JSX into renderers without changing its behavior. Implement Basket per C3.
2. Rebuild `VendorDirectoryTable` so the header, `colgroup`, cells, data attributes and sticky offsets are generated from `columns` per C2. Keep the caption, `scope`, select-all indeterminate logic, row `data-selected`, and every accessible name.
3. Add wrapper overflow detection and the conditional region, `tabIndex` and name. Disconnect the observer on unmount.
4. Update `VendorDirectoryPagination` per C4, with a labeled rows-per-page select.
5. Scope boundary: no CSS, page, test, backend or other feature edits.

### S1b — Page wiring (writer B or primary)

1. Add page-size state and `pageSizeChanged`. Replace the three `5` literals (query `limit`, out-of-range correction ×2) with `pageSize`, and pass `pageSize` and `onPageSize` to pagination.
2. Remove the performance `<aside>`. Keep the `chart` icon, which the KPI tile still uses.
3. Keep search, filters, Reset, selection, notices, editor, archive and permission handling exactly as they are.
4. Scope boundary: only `ProcurementVendorDirectory.tsx`.

### S2 — Styles (writer C)

These are starting values; adjust them only to meet the acceptance criteria.

- **Hero and tiles (R1).**
  - Hero: `min-height` about 164px, bottom padding about 52px, and the overview overlap reduced to about 52px.
  - Tiles: padding about 14/16px, icon well 44×44px with a 24px glyph, value about 26px.
  - Scale the tablet and phone overrides proportionally. The title and quote must never be clipped.
- **Table rhythm (R4).**
  - Cell vertical padding about 10px, avatar 36px. The header stays uppercase with the same colors.
  - Delete every `thead th:nth-child(n)` width rule and `--directory-fluid-columns`; widths now come from the `<col>` styles.
  - Actions: gap 6px and horizontal padding about 6px, which fits 3 × 44px buttons inside 156px.
- **Contained scroll (R5).**
  - Wrapper: `overflow-x: auto`. Table: `min-width: var(--vendor-table-min-width)`.
  - `[data-sticky="start"]`: `position: sticky; left: var(--sticky-offset)`. `[data-sticky="end"]`: `right: 0`. Give sticky cells z-index above body cells.
  - Give sticky cells explicit backgrounds for header, body, selected rows (`#f1f3eb`) and hover.
  - Draw a 1px divider only while `[data-scrollable="true"]`. No shadows or gradients.
  - Keep the wrapper's rounded border, and keep the focus-visible outline on the wrapper.
- **Filters (R6).**
  - Replace the fixed 6-track grid with a wrapping layout: a flex-wrap row where search has `flex: 1.6 1 240px`, selects have `flex: 1 1 150px`, and Reset has `flex: 0 0 auto`, aligned to the end.
  - Today's filters must stay on one row at a desktop workspace of 1000px or wider. Keep the current tablet and phone order.
- **Cards (R8, container width ≤ 950px).**
  - Rows: `position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap`.
  - Selection cell: absolutely positioned top-left. Identity: `grid-column: 1 / -1` with left padding for the checkbox. Actions: `grid-column: 1 / -1`.
  - Field cells: label above value.
  - This gives two field columns at about 600px or wider and one column below. Turn off sticky positioning and horizontal min-width in card mode.
- **Footer (C4).**
  - The range text and the rows-per-page select sit inline and wrap on phone. The select uses the existing 44px control height.
- **Removed and scope.**
  - Delete the `.vendor-directory__performance` rules.
  - Keep every selector inside the existing `:is(.ui-app-shell[data-role], body) .vendor-directory…` scope, with no global or editor style changes.

### S3 — Tests

Update the `VendorDirectory.test.tsx` fixture to 12 vendors so page 2 still exists at 10 rows per page. Recompute the expected overview percentages from the fixture counts; don't hard-code the old 83% or 80%.

Tests to add or update:

1. Default request `limit=10`: 10 row headers, "Showing 1 to 10 of 12 vendors", and Page 2 has 2 rows.
2. Rows per page 25: the request has `limit=25` and `offset=0`, the selection clears, and all 12 rows show. From page 2, switching page size returns to page 1.
3. Archive on the last page lands on a valid page for page size 10, with the overview refresh and reason/CAS assertions kept.
4. Column headers are exactly Vendor Details, Type, Basket, Status, Vendor KPI and Actions, plus the select-all header. There are no separate Main Basket or Sub Basket headers.
5. The Basket cell has the accessible text "Main Basket: … Sub Basket: …", and the not-recorded, unavailable and unavailable-for-new-selections states render.
6. Registry extension: render `VendorDirectoryTable` directly with two extra `field` columns inserted before actions. The extras appear as column headers and as `data-label` cells in every row, and the row header and actions still work.
7. Scroll wrapper: with a stubbed `ResizeObserver` (the `ChatTimeline.test.tsx:62` pattern) and stubbed `scrollWidth`/`clientWidth`, the wrapper is a named, focusable region only while it overflows, and loses those attributes when the overflow ends.
8. No performance notice. The KPI tile and every row still show "Not available".
9. Keep all existing assertions for search, reset, selection, menu focus, the read-only view, lifecycle vs review, errors and permission loss.

In `VendorProcurement.test.tsx`, change only the Next `offset` expectation to `"10"`.

### S4 — Integration and integrity review

The primary runs the focused tests and typecheck, then inspects the full diff against the S0 baselines and the allowed write set. The integrity review, or the primary in Mode B, checks:

- the contract matches C1–C4;
- no behavior regressed under R9;
- accessible names are unchanged;
- no `nth-child` width or literal-5 remnants;
- styles are scoped, with no global leakage;
- the observer is cleaned up;
- no data is invented in the UI.

Owning writers fix findings within their files. The review is repeated only for affected areas.

### S5 — Verification (run once on the integrated result, rerun only affected lanes)

| Lane | Command or method | Covers |
| --- | --- | --- |
| Focused tests | `cd frontend && npm test -- src/features/procurement` | AC3–AC6 |
| Types | `cd frontend && npm run typecheck` | AC8 |
| Build | `cd frontend && npm run build` (the known >500 kB chunk warning is pre-existing) | AC8 |
| Rendered: design and density | Harness at 1440×900: after-screenshot next to the S0 before-screenshot; measure first-row top, row height and visible rows | AC1, AC2 (≥100px higher, ≤60px rows, ≥6 rows) |
| Rendered: width matrix | 1704×1180, 1440×900, 1280×800, 1024×768, 768×1024, 390×844: `document.documentElement.scrollWidth <= clientWidth`; screenshot and visual inspection; axe-core (existing devDependency) injected per width; 44px target measurement | AC7 |
| Rendered: extensibility | Harness-only registry with 3 extra field columns at 1280px: scroll stays inside the wrapper, Vendor Details and Actions stay pinned while scrolled, selected-row sticky background is correct, and the wrapper takes keyboard focus and scrolls with the arrow keys | AC3 |
| Rendered: interactions | Search/Enter, Reset, basket filters, selection, rows-per-page change, numbered pages, Edit/View/Archive dialog, overflow menu with Escape focus return, loading/empty/error/retry | AC5–AC7 |
| Hygiene | Root: `git diff --check`; `git status --short`; `git diff --name-only` equals the allowed write set; nothing staged | AC8 |

No lint script exists, so no lint claim is made. Backend, mobile and OCR suites are out of scope because no consumer changed. Stop the task-owned dev server and browser after QA, and leave all harness files and artifacts in the QA directory.

### S6 — Handoff

Record here: task status, exact commands and results, before and after measurements, screenshot paths, deviations from the S2 starting values, unrun checks and remaining risks. The final response states the outcome and links this evidence. No commit, push, deployment or data operation.

## Risks and controls

| Risk | Control |
| --- | --- |
| `calc()` with percentages in table column widths is ignored by Chromium (seen in the prior task) | C2 uses container units (`100cqw`), as the current CSS does, and is verified by measurement in S5 |
| Sticky cells look see-through on selected or hover rows | Explicit per-state backgrounds; checked with the extensibility harness |
| Overflow detection flickers or adds a stray tab stop | Region and `tabIndex` only while overflowing; covered by a unit test and keyboard check |
| Writers on disjoint files drift from the contract | C1–C4 frozen in S0, gaps escalated to the primary, and conformance checked in S4 |
| Tighter hero clips text at intermediate widths | Width-matrix screenshots with visual inspection |

## Rollback

Revert the allowed write set. No stored state, API or data is involved.

## Execution evidence

### Who did what

- **Primary:**
  - S0 baselines, harness and before-measurements.
  - S1b page wiring and S3 tests.
  - S4 integration and fixes, S5 rendered QA, and S6.
- **Subagents:**
  - Writer A: S1a registry and table.
  - Writer C: S2 styles.
  - An independent read-only integrity reviewer for S4.

Writers worked only on their own files. Baseline copies and the initial `git status` are in `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/baseline/`.

### Contract deviations accepted during integration

1. **Fluid column width (C2).** Each fluid column gets its minimum plus a weighted share of the space above the summed minimums: `max(min, calc(min + (100cqw - (minTableWidth + 2)px) * weight/totalWeight))`. The C2 formula overshot by about 2px when the Basket column hit its minimum, which made a phantom scroll region appear at 1280 and 1024.
2. **Overflow tolerance.** Overflow is detected when `scrollWidth > clientWidth + 1`. The 1px tolerance avoids flicker from sub-pixel rounding.
3. **Selection header.** The select-all header keeps its original markup and renders no "Select" text.
4. **Page-number window.** It is written as `reach = 2`; it was the only other literal 5.
5. **Rows-per-page select.** It stays enabled while a fetch is running, so keyboard focus is kept.
6. **Sticky-end offsets.** End-pinned cells now get `--sticky-offset` in the same way as start-pinned cells (reviewer finding 4). The registry type notes that columns pinned closer to the same edge must be fixed-width.
7. **First-row menu (desktop).** It opens beside its trigger, because the scrolling wrapper clips anything above the header.
8. **Wrapper position.** The wrapper is `position: relative`, so visually hidden text in columns past the viewport edge can't widen the page (reviewer finding 1).
9. **Typography for density.** The hero title maximum is 42px (was 52) and the quote is 19px (was 26), kept to its three intended lines. This goes beyond "spacing only" in AC1; colors, fonts and composition are unchanged.
10. **Filter and card sizing.**
    - Filter flex bases are 220/136px, so today's filters stay on one row at 1280.
    - The card field minimum is 300px, giving two columns at tablet width.
    - Single-column phone cards keep the label beside the value.

### Density (1440×900, rendered, same 11-vendor synthetic data)

| Measure | Before | After |
| --- | --- | --- |
| Hero height | 259px | 166px |
| Tile height | 123px | 85px |
| First row top | 709px | 513px (196px higher) |
| Standard row height | 74–91px | 57–58px |
| Rows fully visible | 2 | 6 |

Before and after: [before-1440.png](/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/before-1440.png), [after-1440.png](/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/after-1440.png).

Rows with extra state text still grow by design; no content is truncated:

- The Kedar row is 86px. Its Basket cell has three lines, and "Unavailable for new selections" wraps.
- The long-name row is 71px.
- At 1280 and 1024, the fluid columns sit at their minimum widths, so long names wrap further (up to 110px), and 3 and 2 rows are visible.

### Automated checks (final integrated state)

| Working directory | Command | Result |
| --- | --- | --- |
| `frontend/` | `npm test -- src/features/procurement` | Passed: 95 tests in 8 files |
| `frontend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm run build` | Passed; the existing >500 kB chunk warning is unchanged |
| Root | `git diff --check` | Clean |
| Root | `git status --short`; `git diff --cached --name-only` | Only the allowed write set plus the pre-existing unrelated mobile and docs changes; nothing staged |

**Mutation check.** With the explicit selection clear removed from `pageSizeChanged`, the rows-per-page test fails. The code was restored and the test passes again.

### Rendered QA (Chromium 1228, synthetic transport, Vite dev)

[final-qa.json](/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/final-qa.json) and [qa.mjs](/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/qa.mjs) cover:

- **Width matrix** at 1704×1180, 1440×900, 1280×800, 1024×768, 768×1024 and 390×844:
  - no page-level horizontal overflow;
  - no table scroll region with today's 7 columns;
  - zero axe violations;
  - no page errors;
  - 44px targets for buttons, selects and checkbox labels.
- **Screenshots:** `after-<width>.png` and `-full.png` were inspected against `before-1440.png`. The layout matches the design, with the merged Basket column (Main line plus a ↳ Sub line), two-column tablet cards and single-column phone cards.
- **Extensibility harness** (4 extra registry columns at 1280):
  - the table scrolls inside the wrapper by 308px, and the page does not scroll;
  - the wrapper becomes a named, focusable region, and arrow keys scroll it;
  - Vendor Details stays pinned at 48px, Actions stays pinned to the end edge, and selected-row sticky cells keep a solid background;
  - zero axe violations.
  - [extended-1280-scrolled.png](/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/extended-1280-scrolled.png).
- **Interactions** (16 steps passed):
  - default 10 rows and the range text;
  - selection and the indeterminate select-all;
  - rows per page 25/10, which resets to page 1 and clears the selection;
  - page 2, search with Enter, and the overview staying unchanged;
  - Reset, which keeps the page size;
  - Main Basket clearing Sub Basket, and basket state notes;
  - first- and last-row menus: not clipped, keyboard operation, focus restored;
  - read-only View, and Edit save;
  - archive on the last page, with correction back to page 1;
  - KPI "Not available" in the tile and all rows, with the notice removed;
  - empty state, list error and retry.
- **Reviewer probe:** a forced far-right overflow no longer widens the page (`scrollWidth` 1440; it was 2255 before the fix).

### Integrity review

The independent read-only review confirmed that the R9 behavior is unchanged, compared renderer by renderer, and that the implementation matches C1–C4. It reported one medium and four low findings:

1. **Medium:** wrapper containment. Fixed.
2. **Low:** overflow tolerance. Accepted as deviation 2.
3. **Low:** weak test for the selection clear on page-size change. Strengthened and mutation-checked.
4. **Low:** sticky-end offsets. Fixed as deviation 6.
5. **Low:** hygiene. The harness was removed from `frontend/.superpowers/` after QA. `frontend/dist/` was rebuilt by the build lane; it is gitignored and can be regenerated.

### Not run, and limits

- Physical devices and other browsers were not tested.
- Backend, mobile and OCR suites were not run, because no consumer changed.
- No lint script exists, so no lint claim is made.
- Data was synthetic only.
- The dev server was stopped. Harness copies are in `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/harness/`.
- No commit, push, deployment, seed, migration or live-data operation was performed.

## Amendment 1 task plan — wide-screen white space

Traces to spec Amendment 1: A1 and A2, AC-A1 to AC-A4, and open decision 4. The earlier S0–S6 work is the baseline. This amendment changes only what is listed here.

### Allowed write set

| Path | Change |
| --- | --- |
| `frontend/src/features/procurement/vendorDirectoryColumns.tsx` | Width type gains `max` and `fill`. Default Vendor Details becomes the fill column; Type and Basket get maximum widths. |
| `frontend/src/features/procurement/VendorDirectoryTable.tsx` | `<col>` width rendering for `clamp` and `fill`, through one exported pure helper |
| `frontend/src/features/procurement/vendorDirectory.css` | Full-width rule scoped to this page |
| `frontend/src/features/procurement/VendorDirectory.test.tsx` | Width helper and registry tests |
| The spec and this plan | Status and evidence only |

Everything else stays as it is, including the Sales Manager screen, global and shell styles, and other pages. The QA harness is recreated in the ignored `frontend/.superpowers/vendor-space-qa/`, copied from `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/harness/`, and removed after QA.

### Frozen contract amendment (C1′ and C2′)

- **Width type (C1′):** `VendorDirectoryColumn["width"]` becomes `{ fixed: number } | { weight: number; min: number; max?: number } | { fill: true; weight: number; min: number }`.
  - At most one column may be `fill`.
  - The registry comment states this, next to the existing sticky rule.
- **Default registry:**
  - `vendor`: `{ fill: true, weight: 45, min: 220 }`
  - `type`: `{ weight: 30, min: 150, max: 240 }`
  - `basket`: `{ weight: 25, min: 130, max: 220 }`
  - All other columns are unchanged, so the fixed total stays 440px and the minimum table width stays 940px.
- **Width helper (C2′):** export a pure helper `vendorColumnWidth(column, minWidth, totalWeight): string | undefined` from `VendorDirectoryTable.tsx`. `<col>` styles use it. The surplus term is `(100cqw - {minWidth + 2}px)`.

  | Column width | Rendered `<col>` width |
  | --- | --- |
  | fixed | `{n}px` |
  | weighted, no max | `max({min}px, calc({min}px + surplus * {w/W}))` (today's formula) |
  | weighted, with max | `clamp({min}px, calc({min}px + surplus * {w/W}), {max}px)` |
  | fill | `undefined`: no inline width, so the column takes the remaining width |

  - `totalWeight` includes the fill column's weight.
  - `minWidth` stays at sum(fixed) + sum(min).
  - Sticky offsets are unchanged, because the fill column is the last sticky-start column.
- **Full width (A1):** `vendorDirectory.css` adds `.ui-workspace > .vendor-procurement:has(> .vendor-directory) { inline-size: 100%; }`.
  - It outranks `.ui-workspace > *`, and it doesn't change workspace padding.
  - Browsers without `:has()` keep the 1440px layout.

### Tasks

| Task | Deliverable | Depends on | Mode A owner | Parallel with | Covers |
| --- | --- | --- | --- | --- | --- |
| B0 | Baselines and before-measurements | Plan approval and mode choice | Primary | — | AC-A1, AC-A2 baselines |
| B1 | Width contract in `vendorDirectoryColumns.tsx` and `VendorDirectoryTable.tsx`, plus tests in `VendorDirectory.test.tsx` | B0 | Frontend writer (table) | B2 | A2, AC-A2, AC-A4 |
| B2 | Full-width rule in `vendorDirectory.css`, with a visual check of the hero at 1920 | B0 | Frontend writer (styles) or primary | B1 | A1, AC-A1, AC-A3 |
| B3 | Integration, diff inspection and a proportional integrity review, with bounded fixes | B1, B2 | Primary; `integrity_reviewer` | — | All |
| B4 | Final verification on the integrated result | B3 | `verification_runner` (automated); primary (browser) | — | AC-A1 to AC-A4 |
| B5 | Record evidence, clean up the harness and dev server, hand off | B4 | Primary | — | — |

**Mode B** runs B0 → B1 → B2 → B3 → B4 → B5 inline. No agent starts before the execution mode is chosen.

### Task details

- **B0:**
  - Record `git status --short`. Save copies of the four current target files to `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/baseline-a1/`; they are this task's own uncommitted work, and must be preserved.
  - Recreate the harness and start Vite on port 5199.
  - At 1920×1080 and 1704×1180, measure:
    - the directory's left and right offsets from the workspace;
    - `<th>` widths;
    - Type and Basket content-to-next-column gaps;
    - the long-name row height.
  - Measure the `section.vendor-procurement` width for the Sales Manager (`role=admin`) procurement route and for `/admin/dashboard` at 1920.
  - Save `before-a1-*.png`.
- **B1:**
  - Implement C1′ and C2′ exactly.
  - Tests:
    - `vendorColumnWidth` returns the expected strings for the fixed, weighted, weighted-with-max and fill cases.
    - The default registry has exactly one fill column (`vendor`), Type has max 240 and Basket has max 220.
    - The existing registry-extension test still reports a 1220px minimum width and 9 `<col>`s, with no inline width on the fill column's `<col>`.
    - The existing overflow-region tests still pass.
  - Don't edit the CSS.
- **B2:**
  - Add the scoped full-width rule and nothing else, unless the 1920 hero check shows distortion. In that case, report before changing anything beyond the rule.
  - Don't edit TSX or tests.
- **B3:**
  - The primary checks C1′ and C2′ conformance and that the selector is scoped.
  - Confirm the Sales Manager view and other pages are unaffected. A grep shows `.vendor-procurement` is shared, and `:has(> .vendor-directory)` limits the rule to the Super Admin view.
  - The integrity review stays proportional to this small change.

### Verification (B4)

| Lane | Command or method | Covers |
| --- | --- | --- |
| Focused tests | `cd frontend && npm test -- src/features/procurement` | AC-A4 |
| Types and build | `cd frontend && npm run typecheck && npm run build` | AC-A4 |
| Rendered: full width | 1920×1080 and 1704×1180: directory edges 24px ±2 from the workspace edges; `documentElement.scrollWidth <= clientWidth`. Sales Manager procurement and `/admin/dashboard` still at 1440px. | AC-A1 |
| Rendered: columns | 1920 and 1440: Type ≤ 240px, Basket ≤ 220px, Vendor Details takes the remainder. 1280 and 1024: widths 225/154/133px with no scroll region. Extended-columns harness at 1280 still scrolls with Vendor Details and Actions pinned. | AC-A2 |
| Rendered: design | Side-by-side screenshots of B0 and B4 at 1920; long-name row height at 1704 and 1920; hero image not distorted | AC-A3 |
| Rendered: regression matrix | Rerun `qa.mjs` with 1920×1080 added to the matrix: zero axe violations, no page overflow, and the 16 interaction steps | AC-A4 |
| Hygiene | `git diff --check`; `git status --short` shows only the allowed write set plus the pre-existing unrelated files; nothing staged | — |

No lint script exists. Backend, mobile and OCR suites are out of scope.

### Risks and rollback

- **Long names at 1704:** the long-name row may still wrap at 1704. The Vendor Details width there is about 480px. It will be measured and reported as-is, not forced by truncation.
- **Rollback:** revert the four files. There is no data or API impact.

## Amendment 1 execution evidence

### Who did what

- **Primary:** B0 baselines, B2 CSS rule, B3 integration and review, B4 rendered QA, B5.
- **Subagent:** B1 width contract and tests, in `vendorDirectoryColumns.tsx`, `VendorDirectoryTable.tsx` and `VendorDirectory.test.tsx`.

Baselines are in `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/baseline-a1/`. The B3 review was done inline, in proportion to the size of the change. It confirmed that C1′ and C2′ were implemented exactly. The full-width selector matches only the Super Admin directory, because `.vendor-procurement` is also used by the Sales Manager view and only this view has a direct `.vendor-directory` child. No findings.

### Measurements (rendered, same synthetic data; `before-a1-metrics.json` and `after-a1-metrics.json`)

| Measure | 1920 before | 1920 after | 1704 after | 1440 and 1280 after |
| --- | --- | --- | --- | --- |
| Unused width at each side (beyond the 24px padding) | 96px | 0 | 0 | 0 (unchanged) |
| Directory width | 1440px | 1632px | 1416px | unchanged |
| Vendor / Type / Basket columns | 427 / 288 / 245px | 692 / 240 / 220px | 476 / 240 / 220px | 297 / 202 / 173 and 225 / 154 / 133px (unchanged) |
| Smallest gap after Type text | 154px | 106px | 106px | unchanged |
| Smallest gap after Basket text | 83px | 58px | 58px | unchanged |
| Long-name row height | 71px | 58px (one line) | 58px (one line) | unchanged |

At 1920, the Sales Manager procurement screen and the admin dashboard are still 1440px wide. The hero image stays `object-fit: cover` and is not distorted.

Screenshots: `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/before-a1-1920.png`, `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/after-a1-1920.png`, and `after-a1-*.png` at 1704, 1440 and 1280.

### Checks

| Working directory | Command or method | Result |
| --- | --- | --- |
| `frontend/` | `npm test -- src/features/procurement` | Passed: 97 tests in 8 files, including the new width-helper and fill-column tests |
| `frontend/` | `npm run typecheck` | Passed |
| `frontend/` | `npm run build` | Passed; the existing >500 kB chunk warning is unchanged |
| QA | `qa.mjs` at 1920, 1704, 1440, 1280, 1024, 768 and 390 | No page-level overflow; no scroll region with 7 columns; zero axe violations; no page errors |
| QA | Extended harness (4 extra columns, 1280) | Scrolls 308px inside the wrapper; Vendor Details and Actions stay pinned; keyboard focus and scrolling work; zero axe violations |
| QA | 16-step interaction flow | Passed |
| Root | `git diff --check`; `git status --short` against the A1 baseline; staged files | Clean; unchanged path set; nothing staged |

The task dev server was stopped and the harness removed from `frontend/.superpowers/`. Copies are in `/private/tmp/claude-501/-Users-apple-Desktop-personal-lisno/b67161fc-98fd-45bc-b8c4-2baa41691a96/scratchpad/vendor-directory-space-qa/harness/`. The build lane regenerated `frontend/dist/`, which is gitignored.

**Incident during B5.** An unquoted shell heredoc used to write this evidence caused zsh to run the backtick-quoted snippets as commands.

- **What ran:** the only side effect was an empty file, `.vendor-directory`, at the repo root, created by a bare redirect.
- **What didn't run:** that redirect then blocked, and the task was stopped before any later snippet ran. There is no root `package.json`, so the npm snippets would not have run anyway.
- **Cleanup:** the 0-byte file was confirmed as this task's (created 00:08) and removed. `git status` then matched the A1 baseline again.

### Not run, and limits

- Tested in Chromium only; no physical devices.
- No backend, mobile or OCR suites, because no consumer changed.
- No lint script exists.
- On very wide screens, some space still remains after the vendor name and code, by design, as the spec amendment describes.
- The empty area below the panel when there are few vendors is unchanged.
- No commit, push, deployment or data operation was performed.

