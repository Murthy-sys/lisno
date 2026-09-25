# Knowledge Base index cards: implementation plan

Date: 2026-09-25
Status: Approved 2026-09-25; user selected Mode A. K0 complete; K1–K3 in progress.
Approved specification: [AI Estimator Knowledge Base: card-based index redesign](../specs/2026-09-25-knowledge-base-index-cards-design.md). Requirements are R1–R9, acceptance criteria AC1–AC6, and open-decision defaults 1–3.

## Outcome and boundaries

Restyle `/admin/configuration/estimation` to match the reference:

- the header and actions;
- the dismissible notice, on the index only;
- a compact search toolbar with icons;
- basket panels with a shared icon tile, description, count pill, add buttons, and icon-only edit and delete buttons;
- a responsive grid of item cards, each with:
  - a placeholder thumbnail;
  - the name link and temporary badge;
  - completeness;
  - a ⋮ menu with "Open item";
  - a real-data footer: sections complete, unit of measure, and priority chip.

The page fills the workspace width.

This is frontend only. There are no backend, DTO, OpenAPI, permission, dependency or lockfile changes. There are no image uploads, no stored icons, no invented rule or unit counts, and no card lifecycle actions. No commits, pushes or deployment.

### Allowed write set

Everything under `frontend/src/features/ai-estimator-knowledge/`:

| Path | Change | Owner (Mode A) |
| --- | --- | --- |
| `knowledgeIndexPresentation.ts` (new) | Pure helpers: section summary, unit label, priority display | Writer A |
| `KnowledgeIndexItemCard.tsx` (new) | The item card and its ⋮ menu | Writer A |
| `KnowledgeIndexPresentation.test.tsx` (new) | Helper and card unit tests | Writer A |
| `KnowledgeBaseIndexPage.tsx` | Page wiring: class modifier, toolbar, basket panel header, card usage, notice dismiss | Writer B |
| `KnowledgeSafetyNotice.tsx` | Optional `onDismiss` prop | Writer B |
| `KnowledgeIndexPage.test.tsx` (new) | Page-level tests for the new behavior | Writer B |
| `KnowledgeScreens.test.tsx`, `KnowledgeAutomaticDisplayOrder.test.tsx` | Only the expectations for the intended text and name changes | Writer B |
| `knowledge-index.css` (new) | All index styles, scoped to `.knowledge-page--index`, plus the full-width rule | Writer C |
| This plan and the spec | Status and evidence only | Primary |

Do not edit:

- the shared stylesheets `ai-estimator-knowledge.css` and `knowledge-configuration-ui.css`;
- the item workspace, the reusable-values page, dialogs, the API, types or query keys;
- any file outside this folder.

If a shared rule blocks the layout, override it in `knowledge-index.css` and record the override in the evidence.

The QA harness lives in `frontend/.superpowers/knowledge-index-qa/`, which git ignores, with copies in the scratchpad QA directory `…/scratchpad/knowledge-index-qa/`. It is removed after QA.

## Frozen integration contract (released in K0 before writers start)

### K-C1 — Presentation helpers (`knowledgeIndexPresentation.ts`)

```ts
export function sectionSummary(completeness: KnowledgeCompleteness): { complete: number; applicable: number } | null;
// complete = sections with state "complete"; applicable = sections whose state is not "not_applicable"; null when applicable === 0
export type CatalogState = "loading" | "ready" | "error";
export function unitLabel(uomId: string | null, uoms: readonly KnowledgeMaster[], state: CatalogState): string;
// null → "No unit"; state loading → "…"; found → name; otherwise → "Unit unavailable"
export type PriorityTone = "high" | "medium" | "low" | "none" | "unavailable";
export function priorityDisplay(priorityId: string | null, priorities: readonly KnowledgeMaster[], state: CatalogState): { label: string; tone: PriorityTone };
// null → { "No priority", "none" }; loading → { "…", "unavailable" }; found → name, tone from semanticTier (non_negotiable|high → "high", medium → "medium", low → "low", missing tier → "none"); otherwise → { "Priority unavailable", "unavailable" }
```

- The priority master's `semanticTier` is read if the frontend master type exposes it.
- If it doesn't, the primary confirms the field in K0 and may widen the local type through the existing knowledge types, without any backend change. If the tier isn't in the list response, the tone falls back to `none`, and the primary records it as a limit.

### K-C2 — Card component (`KnowledgeIndexItemCard.tsx`)

**Props:**

```tsx
<KnowledgeIndexItemCard item={KnowledgeItemListItem} uoms={readonly KnowledgeMaster[]} priorities={readonly KnowledgeMaster[]} catalogState={CatalogState} onOpen={() => void} />
```

**Markup and class contract:**

```tsx
<article className="knowledge-item-card knowledge-index-card" data-item-type="main_line|temporary">
  <div className="knowledge-index-card__thumb" aria-hidden="true">{shared basket icon}</div>
  <div className="knowledge-index-card__body">
    <div className="knowledge-index-card__title"><h3><Link className="knowledge-item-link" …>{mainLineName}</Link></h3><KnowledgeIndexMenu …/></div>
    {temporary ? <span id="temporary-kind-{id}" className="knowledge-temporary-badge" title="Temporary item · Must be completed">Temporary item<span className="sr-only"> · Must be completed</span></span> : null}
    <div className="knowledge-item-card__progress"><span>{N}% complete</span><ProgressBar …existing props…/></div>
  </div>
  <ul className="knowledge-index-card__metrics" aria-label="{name} details">
    <li className="knowledge-index-metric" data-metric="sections">…</li>
    <li className="knowledge-index-metric" data-metric="unit">…</li>
    <li className="knowledge-priority-chip" data-tone={tone}>…</li>
  </ul>
</article>
```

- **Badge:** "Must be completed" appears only when `completionRequired` is true. Otherwise the badge reads just "Temporary item".
- **Link:** the `aria-describedby` from the link to the badge ID is kept.
- **Sections metric:**
  - visible text "{complete}/{applicable} sections";
  - accessible text "{complete} of {applicable} sections complete", given with a visually hidden span while the visible fraction is `aria-hidden`;
  - omitted when `sectionSummary` returns null.
- **Icons (lucide):**
  - `Layers` for the thumbnail and basket tile;
  - `FileText` for sections;
  - `Ruler` for unit;
  - `Flag` for priority;
  - `MoreVertical` for the menu.
- **Menu (`KnowledgeIndexMenu`, local to the file):**
  - Trigger: a button named "More actions for {name}" with `aria-haspopup="menu"`, `aria-expanded` and `aria-controls` while open.
  - Items: `role="menu"`, with one `role="menuitem"` button, "Open item", which calls `onOpen`.
  - Keyboard: Enter, Space and ArrowDown open it and focus the item. Escape and Tab close it and return focus to the trigger.
  - Pointer: pointerdown outside closes it.
  - Classes: `.knowledge-index-menu` and `.knowledge-index-menu__items`.

### K-C3 — Page wiring (`KnowledgeBaseIndexPage.tsx`)

- **Root:** `<div className="knowledge-page knowledge-page--index">`. The component imports `./knowledge-index.css` after the existing stylesheets.
- **Notice:** `<KnowledgeSafetyNotice onDismiss={() => setNoticeDismissed(true)} />`, rendered only while `!noticeDismissed`. `KnowledgeSafetyNotice({ onDismiss }?)` passes `InlineMessage.action` as a quiet icon button named "Dismiss notice" with class `.knowledge-notice-dismiss` and the `X` icon. Without the prop, rendering is unchanged, so the workspace and reusable-values pages don't change.
- **Toolbar:**
  - The existing form structure and classes stay: `.knowledge-filter-panel`, `.knowledge-search-bar`, `.knowledge-search-control`, the advanced filters and the chips.
  - The Search button gains `leadingIcon={<Search />}`.
  - The search `Field` label is hidden visually through CSS (`.knowledge-page--index .knowledge-search-bar__field .ui-field__label` uses the sr-only pattern). Its text and association are kept.
- **Basket header:**
  - Inside the existing `.knowledge-basket-panel__header`, add `<span className="knowledge-basket-panel__icon" aria-hidden="true"><Layers/></span>` before the title block.
  - Wrap the `h2` (existing toggle) and `<p className="knowledge-basket-panel__description">{description}</p>` in `.knowledge-basket-panel__heading`. The description comes from the loaded basket record by ID, and the `<p>` is rendered only when the description is non-empty.
  - Keep the add buttons, their handlers and their hidden suffixes, and add a `Plus` icon to "Add temporary item".
  - Edit is `<Button variant="quiet" className="knowledge-icon-action" aria-label="Edit basket {name}" title="Edit basket" leadingIcon={<Pencil/>}/>` with no visible text.
  - Delete is `<Button variant="destructive-outline" className="knowledge-icon-action knowledge-icon-action--danger" aria-label="Delete {name}" title="Delete basket" leadingIcon={<Trash2/>}/>` with no visible text.
  - The handlers and permission checks are unchanged.
- **Cards:** render `KnowledgeIndexItemCard` inside the existing `.knowledge-item-grid`.
  - `uoms` and `priorities` come from the existing `masters`.
  - `catalogState` is derived from the matching `masterQueries` entry: pending → loading, error → error, otherwise ready.
  - `onOpen` navigates to the existing workspace route.
- **Unchanged:** queries, keys, grouping, pagination, dialogs, announcements, the collapsed state and focus return.

### K-C4 — Styles (`knowledge-index.css`)

- **Full width:** `.ui-workspace > .knowledge-page--index { inline-size: 100%; }`. The page root is the direct child of `.ui-workspace`; K0 confirms this. If there is a wrapper, the fallback is `.ui-workspace > :has(> .knowledge-page--index)`.
- **Scope:** every other selector starts with `.knowledge-page--index` (with the existing `.ui-app-shell[data-role]` prefix where it's needed for specificity).
- **Targets from the reference:**
  - Header actions: outlined secondary buttons with dark olive primary.
  - Notice: warm amber, with the × on the right.
  - Toolbar: one row, equal-height controls, and the icons visible.
  - Basket panel header: light neutral band with a rounded panel, a 56–60px icon tile, a 20px name and a 13px muted description. The pill, buttons, a neutral pencil and a red bin sit on the right. Headers wrap under the name on narrow widths.
  - Card grid: `repeat(auto-fill, minmax(min(100%, 340px), 1fr))`, which gives four columns at a 1600px panel.
  - Card: white, a 1px border and a rounded corner. A thumbnail tile of about 120×110px uses a warm neutral surface with a centered icon. Next to it are the title row with the ⋮ menu, the amber badge, "N% complete" and an olive progress bar (overriding the `.ui-progress` fill locally). Below is a footer row with muted metrics and a priority chip with a tinted background: red for high, amber for medium, green for low, and neutral for none or unavailable.
  - Phone: the thumbnail stacks or shrinks, and cards take one column.
  - Icon-only buttons and the menu trigger have 44px targets and a visible focus ring.

### K0 findings and contract addendum (released with K-C1 to K-C4)

- **Page root:** `div.knowledge-page` is the direct child of `main.ui-workspace`, so the K-C4 full-width selector applies as written. It is capped at 1440px today.
- **Priority tier:** `KnowledgeMaster.semanticTier` exists in the frontend type (`knowledgeTypes.ts:135`), so no type change is needed.
- **Completion flag:** the backend sets `completionRequired` to `itemType === "temporary"` (`ai-estimator-knowledge-item.service.ts:2169,3682`). The conditional "Must be completed" text therefore matches today's behavior for every real item.
- **Double "+":** `styles/admin-home.css:269-271` adds `content: "+"` before primary page-header buttons for the admin and super_admin roles. With the button's own `Plus` icon, "Add estimation item" shows two plus signs. K-C4 adds a rule, scoped to `.knowledge-page--index`, that suppresses this pseudo-element (`content: none`). Its specificity is higher than the global rule's.
- **Concurrent session:** another session is editing backend and procurement files and `knowledgeTypes.ts` (vendor certificate types) on a separate task, `2026-09-25-add-vendor-panel-fields`. None of those files is in this write set. Writers must not touch them. Failures in those files during typecheck or tests are recorded as outside this task's scope.
- **Baseline:** screenshots `before-1920.png` and `before-1440.png` are in the QA directory. The page renders 4 columns at 1920 and 3 at 1440, with 0 images and no page overflow.

## Tasks and dependencies

| Task | Deliverable | Depends on | Mode A owner | Parallel with | Covers |
| --- | --- | --- | --- | --- | --- |
| K0 | Baselines, harness and before-screenshots, contract release | Plan approval and mode choice | Primary | — | AC1 baseline |
| K1 | Helpers, card and menu, with unit tests (K-C1, K-C2) | K0 | Writer A | K2, K3 | R4, R5, AC2, AC4 (menu) |
| K2 | Page wiring, notice dismiss, page tests, updates to existing tests (K-C3) | K0; imports K1's frozen API | Writer B | K1, K3 | R1–R3, R6, R9, AC3, AC4 (notice) |
| K3 | Styles (K-C4) | K0 | Writer C (styles) | K1, K2 | R1–R4, R6–R8, AC1, AC5 |
| K4 | Integration, diff inspection, `integrity_reviewer` review, bounded fixes | K1–K3 | Primary; reviewer | — | All |
| K5 | Final verification on the integrated result | K4 | `verification_runner` (automated); primary (browser) | — | AC1–AC6 |
| K6 | Evidence, cleanup, handoff | K5 | Primary | — | AC6 |

**Mode B** runs K0 → K1 → K2 → K3 → K4 → K5 → K6 inline, with no subagents. No agent starts before the execution mode is chosen. In Mode A, the typecheck may fail while writers are still in progress; only the integrated result counts.

## Task details

### K0 — Primary

1. Record `git status --short`. Copy the target files to the QA `baseline/` directory. The vendor-directory files and unrelated mobile changes stay untouched.
2. Confirm:
   - that the page root is the direct child of `.ui-workspace`;
   - that the priority master DTO exposes `semanticTier`;
   - that no existing index test depends on the markup being replaced, beyond the ones already listed.
3. Build the harness: the real `KnowledgeBaseIndexPage` route through the app shell with synthetic fetch mocks for:
   - `GET /admin/ai-estimator-knowledge/items`;
   - `…/baskets`;
   - the masters: priorities with all four tiers, modes, surfaces, uoms and vendors.

   The data covers:
   - three baskets: one with a description, one without, and one empty;
   - more than four items in one basket, and active and temporary items;
   - 0%, mid and high completeness, including sections in state `not_applicable`;
   - every priority tier, a null priority and an unknown priority;
   - a known unit, a null unit and an unknown unit;
   - a long item name.
4. Take before-screenshots at 1920×1080 and 1440×900.

### K1 — Writer A

Implement K-C1 and K-C2 exactly.

Tests:

- `sectionSummary`: counts, `not_applicable` exclusion, and null.
- `unitLabel` and `priorityDisplay`: every branch.
- The rendered card:
  - the link target;
  - the badge text and accessible description, with and without `completionRequired`;
  - the metrics' visible and accessible text;
  - the priority chip `data-tone`;
  - no `img` element.
- The menu: keyboard open, focus on the item, Escape and Tab restoring focus, outside pointerdown, and "Open item" calling `onOpen`.

### K2 — Writer B

Implement K-C3.

- Update the existing tests only where the approved changes alter text or names:
  - "Temporary item · Must be completed", previously exact text, now asserted through the badge's accessible text or title;
  - "Edit basket" becomes "Edit basket {name}".
- New page tests, in `KnowledgeIndexPage.test.tsx`:
  - the notice dismisses with its region name intact;
  - the workspace and reusable-values notice renders with no dismiss button, in a render-only check of `KnowledgeSafetyNotice` without the prop;
  - basket descriptions render or are omitted;
  - the icon-only Edit and Delete names open the existing dialogs;
  - the toolbar has a search button with the Search name and the Filters disclosure still works;
  - cards receive the priority and unit names from the loaded masters;
  - the root has `knowledge-page--index`.

### K3 — Writer C

- Implement K-C4, measuring in the running harness at 1920, 1440, 1280, 1024, 768 and 390.
- Compare against the reference image in this conversation. It is described in the spec and plan, and its path is given to the writer.
- Spot-check that the item workspace and reusable-values pages don't change, because the new file loads only with the index.

### K4 — Primary with `integrity_reviewer`

The review covers:

- contract conformance;
- that the preserved behavior (R9) is intact;
- scoped CSS with no leakage;
- no invented data;
- accessible names;
- test quality, with no false passes;
- hygiene.

Owning writers fix findings within their own files.

## Verification (K5)

| Lane | Command or method | Covers |
| --- | --- | --- |
| Knowledge tests | `cd frontend && npm test -- src/features/ai-estimator-knowledge` | AC2–AC4, AC6 |
| Router and app | `cd frontend && npm test -- src/app/router.test.tsx` | AC6 (route and title unchanged) |
| Types and build | `cd frontend && npm run typecheck && npm run build` | AC6 |
| Rendered visual | Harness screenshots at 1920 and 1440, side by side with the reference and the K0 before-screenshots | AC1 |
| Rendered matrix | 1920, 1440, 1280, 1024, 768 and 390: no document overflow, axe zero violations, 44px icon targets, focus ring visible, card columns 4→1 | AC5 |
| Rendered interactions | Notice dismiss; search and Enter; the Filters disclosure and Apply; clearing a chip; collapse and expand; the ⋮ menu by keyboard and pointer with "Open item" navigating; the Edit basket dialog and the Delete basket impact dialog opening from the icon buttons; the add item and add temporary item dialogs opening | AC3, AC4 |
| Scope spot check | Item workspace and reusable-values pages rendered: notice without dismiss, no layout change | AC6 |
| Hygiene | `git diff --check`; `git status --short` shows only the allowed write set plus the pre-existing files; nothing staged | AC6 |

- **Heredocs:** evidence written into docs must use quoted heredocs (`<<'EOF'`) or an editor tool, never an unquoted heredoc containing backticks. This is a lesson from the vendor-directory amendment.
- **Out of scope:** backend, mobile and OCR suites, because no consumer changed.
- **Lint:** no lint script exists, so no lint claim is made.

## Risks and rollback

| Risk | Control |
| --- | --- |
| Shared knowledge CSS leaks into other pages | New stylesheet scoped to `.knowledge-page--index`; spot check in K5 |
| `semanticTier` missing from the list DTO | K0 confirms it. The fallback tone is `none`, recorded as a limit. No backend change |
| The `ProgressBar` color override affects other pages | Only under `.knowledge-page--index` |
| Existing tests broken by the intended text changes | K2 updates only those expectations, with equivalent assertions |
| Writers drift from the contract | K-C1 to K-C4 are frozen, gaps go to the primary, and K4 checks conformance |

**Rollback:** revert the allowed write set. There is no data or API impact, and notice dismissal is component state only.
