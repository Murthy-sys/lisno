# Configuration Knowledge Base: compact layout task plan

Date: 2026-09-25
Status: Implemented and verified in approved Mode A. T0 through T4 are complete; results and limits are recorded below.
Source of truth: [Approved specification](../specs/2026-09-25-knowledge-base-compact-layout-design.md).

## Outcome and acceptance mapping

| Criterion | Deliverable | Tasks |
| --- | --- | --- |
| AC1 | Measurably denser cards and earlier first-basket content at unchanged viewport/data/zoom | T0, T2, T4 |
| AC2 | Accessible icon-only Search/Filters with native submit, disclosure, tooltips, and selected-filter count | T1, T2, T3, T4 |
| AC3 | Full card content, truthful metadata, temporary badge, item link/menu retained | T1, T2, T3, T4 |
| AC4 | Compact basket/page headers and notice, preserving all actions and permissions | T2, T3, T4 |
| AC5 | Responsive widths, readable text zoom, focus/accessibility, no overflow | T2, T3, T4 |
| AC6 | Index-only scope, prior dirty work preserved, focused tests/typecheck/build and adjacent-page spot checks | T0, T3, T4 |

Keep one parent task in progress: implement and verify the approved Configuration density refinement. Complete each dependent stage before advancing; this document does not authorize implementation until the execution-choice gate is satisfied.

## Settled presentation contract

- Keep route, data fetching, filter draft/application, pagination size 20, basket grouping/expansion, permissions, notice dismissal, dialogs, and item navigation unchanged.
- Reuse `IconButton` and its `Tooltip` without editing shared components. Search has `label="Search"`, `tooltip="Search"`, and `type="submit"`. Filters has `label="Filters"`, `tooltip="Filters"`, `type="button"`, the current disclosure attributes and handler, and a count description when nonzero.
- The current count is derived from the draft advanced-filter selections, not only applied filters. Preserve that meaning. Keep the visible numeric badge and use a separate visually hidden description such as `2 filters selected`, connected through `aria-describedby`; the existing Tooltip merges its own description correctly. Do not replace either accessible name with a changing count.
- Retain `.knowledge-search-bar__actions` for the action cluster. Use `.knowledge-search-action` on both icon controls, `.knowledge-filter-action-wrap` around Filters and its badge, and the existing `.knowledge-filter-count` class for the visible count. Tooltip wrappers must not alter the intended 44px control dimensions or clip the badge.
- Keep the card's article, body, title, progress, metrics, and menu classes. Relocate the decorative `.knowledge-index-card__thumb` into `.knowledge-index-card__title`, before the `h3`, so it occupies only the compact title row. The title remains a link and the menu remains a separate control. Preserve every metric and temporary badge relationship.
- Card layout becomes one content-driven column: compact title row, optional badge, progress, metadata. Eliminate the thumbnail-sized row and bottom-pushed progress spacing. Allow long content to grow; no fixed card height or metadata hiding.
- The stylesheet owns all density changes, including page gaps, title/actions wrapping, quiet notice, smaller basket tile/header, adaptive cards, compact control treatments, and mobile behavior. Scope rules to the existing index modifier and revise the current cascade coherently instead of appending competing overrides.
- Retain the existing font and meaningful semantic colors; use warm neutral tokens and borders without decorative shadows, leading stripes, or new motion. No dependencies, new icons, data fields, or image fetching.

## T0. Capture the current baseline and ownership

Owner: primary agent. Dependencies: approved plan and execution-mode selection. Product writes: none.

1. Recheck instructions and `git status --short`; record all dirty paths and the relevant diffs before any writer starts. Save the full contents/hashes of untracked target modules because `git diff` does not include them.
2. Reconcile current source against the approved spec. `KnowledgeBaseIndexPage.tsx` is already dirty; `KnowledgeIndexItemCard.tsx`, `KnowledgeIndexPage.test.tsx`, and `knowledge-index.css` are currently untracked work from the preceding redesign. Preserve their functionality. Do not revert or reformat unrelated vendor, backend, mobile, or Knowledge workspace changes.
3. Capture baseline screenshots and geometry at 1440 × 900 and 1920 × 1080 using synthetic data, a consistent sidebar and scroll position, and unchanged browser zoom. Record card heights, basket-content position, available grid width/column count, and number of fully visible cards.
4. Use representative short normal cards for the density comparison, plus long/temporary content for overflow checks. The same data and loading-settled state must be used before and after.
5. Run the two focused index/presentation files once before edits to distinguish pre-existing failures, if not already evidenced against this exact baseline. Do not seed or change real configuration records.

Artifacts: `/tmp/lisno-knowledge-compact-qa/` for baseline snapshots, diffs, screenshots, geometry, and logs. Reuse available browser/fixture infrastructure where possible.

Acceptance: reviewed ownership boundaries, reproducible before-state, no loss of earlier work. Only then begin T1/T2.

## T1. Implement icon controls and compact card structure

Owner in Mode A: one `frontend_implementer`. In Mode B: primary agent.
Dependency: T0. Criteria: AC2, AC3, AC6.

Exclusive owned product files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeIndexItemCard.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx`

Steps:

1. Replace the visible-label Search/Filters toolbar buttons with the settled IconButton contract. Keep handlers/form structure and native submit behavior. Hide only the two requested button words; other action labels remain.
2. Preserve the selected-filter badge and add an accurate associated count description. Ensure SVGs are decorative and the count is not duplicated in screen-reader output.
3. Move the existing placeholder tile into the title row. Preserve headings, the real workspace URL/ID, menu semantics, completion text and progress labels, temporary badge/description, section fraction, unit, priority, and loading/unavailable values.
4. Update the existing meaningful toolbar test to assert accessible control behavior rather than the old `.ui-button__icon` internal wrapper. Add coverage for Enter search, focus/hover tooltips and count descriptions only where current tests lack it. Retain disclosure, chips and reset coverage.
5. Run the focused index test after changes and report structural additions to the CSS owner. No geometry assertions in JSDOM or snapshots that merely duplicate markup.

Boundary: no stylesheet, shared `IconButton`/`Tooltip`, data/presentation helper, permission, dialog, or other test-file edits. Request a coordinated handoff before crossing that boundary. The worker is not alone in the codebase and must preserve others' edits.

## T2. Implement scoped page, toolbar, basket, and card density

Owner: primary agent. Dependency: T0 and the settled class contract above. May proceed alongside T1 in Mode A.
Exclusive product file: `frontend/src/features/ai-estimator-knowledge/knowledge-index.css`.
Criteria: AC1 through AC6.

Steps:

1. Tighten main gaps to approximately 12px and header/action padding while preserving readable title/description and every header command. Let commands move to a second row before the title is squeezed. Avoid the existing five-full-width-button mobile stack where a compact wrapping arrangement fits.
2. Restyle the index notice as a compact information line; remove its leading stripe and decorative excess. Keep its message and 44px dismiss control readable and reachable. Do not edit the shared notice component.
3. Give Search/Filters 44px square targets and a stable horizontal input/action group with shrinkable input, unclipped count, focus ring, and usable tooltips at 320px and above.
4. Reduce basket tile and chevron spacing, header padding, count styling, and action gaps. Aim for 56–64px on a simple one-row desktop header. Allow long names/descriptions/actions to wrap naturally.
5. Replace the 120px card thumbnail column with the compact title icon. Remove bottom-pushed progress spacing, use approximately 10–12px padding/gaps, and keep complete metadata. Target 110–135px for ordinary short cards while allowing longer content to grow.
6. Lower adaptive card minimum width to approximately 250–270px; verify at least four columns with at least 1100px basket-body space. Revise conflicting narrow-width thumbnail/grid rules and eliminate decorative card/hover shadows. Keep menu stacking/focus behavior intact.
7. Inspect responsive and text-zoom behavior, including multi-line unit/priority names. Keep minimum target sizes even where visible glyphs shrink. Do not modify the shell or shared stylesheet to force density.

Acceptance: scoped CSS realizes the approved structure, visual tokens and density, with no hidden content or action loss. Wait for T1 completion before final measurements.

## T3. Integrate and review

Owner: primary agent; in Mode A use an independent `integrity_reviewer` after the writers finish. In Mode B perform the equivalent review inline.
Dependencies: T1 and T2 completed. Product ownership remains with original owners for any fixes.

Review:

- Visible-label removal has not removed accessible names, tooltips, form submit, Enter search, disclosure attributes, or selected-filter information.
- Tooltip wrappers, count positioning, icon actions, and menu overlays remain operable at all responsive widths.
- Compact card markup retains semantic headings, distinct link/menu controls, truthful values, temporary-item explanation, and keyboard focus return.
- No change to query parameters, pagination, data sources, permission checks, mutation synchronization, or dialog behavior.
- Page-scoped styles do not leak into item workspace, reusable values, or vendor panels.
- The final patch preserves dirty baseline changes and does not add dependencies or broad formatting changes.

Resolve confirmed findings and recheck the affected behavior before T4. Small scoped corrections do not reopen the approved design; a material scope or contract departure does.

## T4. Final automated and rendered verification

Owner in Mode A: `verification_runner` for integrated automated checks; primary agent for browser QA and final reconciliation. Mode B: primary agent performs both inline.
Dependency: T3 review/fixes complete. Criteria: all.

Run in `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPresentation.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeAutomaticDisplayOrder.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx
npm run typecheck
npm run build
```

Full backend/OCR suites and database tests are not needed for this index-only presentation change. Run broader frontend tests only if shared changes or a newly discovered regression justify them. Prior unrelated KnowledgeScreens failures are background, not proof about current code; isolate new failures against T0 rather than weakening assertions. There is no repository lint script.

Rendered matrix with actual components and synthetic data:

| Check | Required result |
| --- | --- |
| 1440 × 900 and 1920 × 1080 comparison | Same content/sidebar/zoom; short ordinary card heights reduced by at least 25%; first basket content begins higher; column/visible-card counts recorded. |
| 1280, 1024 and 768px | Header and basket actions wrap deliberately; meaningful names/metadata remain readable; menu overlays not clipped. |
| 390 and 320px | No horizontal page overflow; search plus 44px icon actions fits where specified; count/tooltips/actions remain reachable; cards stack. |
| 200% text zoom | Content grows/wraps without clipping or overlap; do not substitute CSS transform scaling for text zoom. Report the exact browser method used. |
| Regular and temporary cards | Short/long titles, zero/high completion, known/missing/unavailable metadata and priority tiers displayed truthfully; required temporary description retained. |
| Toolbar interactions | Click/Enter search, Filters disclosure, count, chips/remove/clear, tooltip on focus/hover, visible focus, keyboard escape behavior. |
| Basket and navigation | Expand/collapse, empty basket, add/edit/delete paths, correct item link/menu destination, notice dismissal/focus return, permission-hidden actions. |
| Loading/error/empty | Initial loading, background refresh, no matches, failed catalogs and failed list/retry retain their correct states. |
| Accessibility | Accessible names, 44px icon target geometry, no newly introduced axe violations or invalid nested interactive elements. |
| Adjacent-page spot check | Item workspace and reusable-values layout retain existing shared controls/notice appearance. |

Inspect screenshots as images and check browser console/network output; distinguish intentional mocked failures from unexpected errors. Record actual geometry, not inferred dimensions from CSS. If a density target cannot coexist with long content, allow the content to grow and assess the specified short representative cards instead.

Finish at repository root:

```sh
git diff --check
git status --short
```

Handoff records every acceptance result, exact commands and counts, browser environment/widths/artifact paths, remaining warnings or failures, and any unrun checks. Stop temporary QA servers/browsers. No runtime artifacts are committed.

## Parallel execution and gate rules

- No subagents or implementation before the user selects the execution mode after approving this plan.
- Mode A: T0 remains primary-owned. T1 may run beside primary-owned T2 because TSX/tests and CSS have non-overlapping ownership and a fixed markup contract. T3 review follows the writers; T4 verification follows fixes.
- Mode B: primary implements and verifies all tasks sequentially without implementation subagents.
- Tell each agent it shares the worktree, must not revert others' changes, and must report any contract/file-boundary issue before editing outside its assignment.
- No stale assumptions about prior test counts or ongoing external writers. Reconcile the integrated result against the T0 baseline.

## Definition of done

The index visibly fits more content without losing information or controls. Search and Filters are icon-only visually and fully named/operable for assistive technology. Cards, basket headers, notice, and page spacing meet the approved density and responsive checks. Focused tests, typecheck/build, integrated review, visual inspection, and diff hygiene are completed with exact limitations reported. No deployment, real configuration mutation, migration, dependency installation, commit, or push is included.

## Execution record, 2026-09-25

Status: T0 through T4 completed in approved Mode A.

### Implementation and preservation

- T0 captured the initial dirty-path inventory, relevant tracked diff, and full source snapshots/hashes under `/tmp/lisno-knowledge-compact-qa/`. The before screenshots were rendered through frozen baseline modules after product edits started; they use the captured pre-edit code, identical synthetic data/sidebar/viewports, and unchanged browser zoom. This avoids restoring files in the shared worktree.
- T1 changed only `KnowledgeBaseIndexPage.tsx`, `KnowledgeIndexItemCard.tsx`, and `KnowledgeIndexPage.test.tsx`. T2 changed only `knowledge-index.css`. No shared styles, APIs, query/mutation logic, permission contracts, dependencies, or lockfiles changed.
- Search and Filters use existing IconButton/Tooltip components. Native submit, Enter, disclosure state, draft-selection count, chips, and reset behavior remain intact. Cards retain their full title, progress, section/unit/priority metadata, temporary explanation, link, and menu.
- The independent reviewer found mobile collapse hit-area overlap with wrapped basket commands. Restricting its pseudo-element to the chevron's 44px area resolved it. Leading-edge Add and center Edit clicks opened the correct dialogs at both 390px and 320px.
- Text enlargement exposed inherited fixed heights on the search input, basket count, and filter badge. Content-driven heights now preserve their normal minimum sizes and accommodate doubled text.
- Independent integrity review closed without unresolved findings. The initial/final dirty-path sets match. The three captured unowned modules and the recorded unowned notice diff match the baseline; unrelated dirty vendor/backend/mobile work was not assigned or edited.

### Density evidence (AC1, AC3, AC4)

Chromium via the Playwright CLI, actual AppShell and page components with synthetic records. Final captures use reduced motion, settled catalogs/fonts, identical sidebar and content, and 100% browser zoom. Long content remains allowed to grow.

| Viewport | Before → after |
| --- | --- |
| 1440 × 900 | 3 → 4 columns; 6 → 12 fully visible cards; first grid y=503.0 → 416.0px. |
| 1920 × 1080 | 4 → 5 columns; 12 → 20 fully visible cards; first grid y=447.5 → 373.9px. |
| Ordinary short cards | 178px → 112.8px (36.6% shorter); the 1440px wrapped-metadata example is 131.6px (26.1% shorter). |
| Basket header / notice | 85 → 61px / 62 → 46px. |
| Decorative card tile | 120 × 110px → 32 × 32px. |

Artifacts: `final-geometry-results.txt`, `baseline-{1440,1920}.png`, `live-{1440,1920}.png`, and `final-{1920,1440,1280,1024,768,390,320}.png` in the QA directory. Screenshots were visually inspected.

### Rendered behavior and accessibility (AC2 through AC6)

- All seven widths from 320px through 1920px pass page/card overflow checks. Both icon toolbar buttons measure 44 × 44px and align beside the search field.
- Actual browser checks pass for Click/Enter search, no matches, Filters disclosure, selected draft count plus Tooltip description, apply, remove chip, clear/reset, keyboard focus and tooltips, menu ArrowDown/Escape/focus return, and correct item destination.
- Basket collapse/expand, empty basket, Add/Edit/Delete dialog opening and cancellation, pagination 20 → 4 → 20, and notice dismissal with focus return to search pass. No mutations were submitted.
- Initial loading, background refresh preserving 20 cards, list failure/retry, empty list, catalog loading and unavailable labels, and permission-hidden mutation actions pass. The mocked server rejects non-GET requests; no backend writes occurred.
- Settled-page axe checks report zero violations on the 320px index and the 1440px read-only view. An early contrast report during the existing reveal animation disappeared once settled; final reduced-motion captures avoid that transient state. No new product console errors were observed. Console WebSocket failures came from intentionally restarting the local QA server.
- Text-only enlargement was simulated at 1440px and 320px by snapshotting computed font sizes/line heights and doubling those values once on page descendants, without transforms or changing layout width. Content wraps without page/card overflow. Mobile input grows to 50px for a 48px line, count to 38px for a 36px line, and selected-filter badge to 30.6px for a 28.6px line. This is a CSS text-enlargement check, not native browser text-zoom verification.
- Actual reusable-values and item-workspace pages were rendered with lazy routes and synthetic detail/section fixtures. Baseline/live page widths, header heights, notice heights, and sampled shared button geometry match exactly at 1440px; screenshots confirm existing appearance. The index-only modifier is absent on both.
- Browser evidence also includes `filters-320.png`, `mobile-fixed-{390,320}.png`, `final-zoom-{1440,320}.png`, `final-zoom-card-{1440,320}.png`, `final-text-zoom-results.txt`, and `adjacent-{reusable,workspace}-{baseline,live}.png`.

### Automated verification (AC6)

All commands below exited 0 on the integrated result.

| Command (frontend directory unless stated) | Result |
| --- | --- |
| `npm test -- src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeIndexPresentation.test.tsx` | 32/32 tests, 2 files. Baseline was 30/30; two behavior tests were added. |
| `npm test -- src/features/ai-estimator-knowledge/KnowledgeBasketDeletion.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx src/features/ai-estimator-knowledge/KnowledgeAutomaticDisplayOrder.test.tsx src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx` | 53/53 tests, 4 files. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed, including TypeScript compilation; rerun after final CSS sizing fixes. |
| Root `git diff --check` and `git status --short` | Passed. |

Logs: `final-focused-tests.log`, `final-basket-tests.log`, `final-typecheck.log`, and `final-build.log` under the QA directory. Vite retains its large-chunk warning (main JS approximately 1,972 kB minified); no new dependency or bundle work is included.

The full frontend suite was not rerun, consistent with this scoped plan and known unrelated prior failures. Backend/OCR/replica-set checks, production/browser-account testing, and real file/data mutations were not needed or performed. There is no lint script. Native browser text zoom and other browser engines remain unrun. No seed, migration, deployment, commit, or push was performed. Temporary browser/server sessions are stopped at handoff; screenshots/logs remain outside the repository, and build outputs are ignored.

### Follow-up: tighter Main Basket and item labels

The user requested less top/bottom space around the Main Basket/TV Unit labels. This is a small refinement within the approved presentation scope; only `knowledge-index.css` changed. Header padding is now 4px per side, card vertical padding 8px, title tile 28px, title offset 4px, and title-to-progress gap 4px. The menu remains 44px; a 52px header minimum keeps the collapsed read-only chevron fully clickable.

Measured with the same synthetic harness at 1440/390/320px: the TV Unit card is 102.8px instead of 112.8px. The simple desktop header is 53px instead of 61px; wrapped mobile headers are 185px instead of 193px. No page/card overflow. Actual bottom-edge menu clicks, Escape focus return, leading-edge Add clicks, and the lower chevron edge in read-only mode all pass. A short temporary TV Unit1 badge has zero overlap with the menu target. The 1440px read-only axe scan has zero violations; 200% CSS text enlargement at 320px wraps without overflow.

`npm run build` passed (including TypeScript compilation), retaining only the existing large-chunk warning. `git diff --check` passed. Independent CSS review found no remaining issues. Existing tests were not rerun for this local spacing-only refinement; rendered checks directly cover its risk. No data, API, shared component, dependency, or permission changes.

Artifacts in the same temporary QA directory: `label-spacing-before.css`, `label-spacing-results.txt`, `label-spacing-build.log`, `label-before-*.png`, `label-after-*.png`, `label-tv-unit-*.png`, `label-zoom-tv-unit.png`, and `label-temporary-320.png`. Temporary QA browser/server stopped after verification.

### Follow-up: POP / Gypsum basket heading

The user's further request specifically targets the basket heading strip. The remaining 4px vertical padding is now removed; header minimum height is 45px to contain the existing 44px controls and divider. These are the only two CSS changes in this refinement. The desktop header measures 45px, down from 53px; wrapped mobile headers are 177px, down from 185px. All card spacing remains unchanged.

Actual browser checks passed at 1440/390/320px with a synthetic POP / Gypsum label: no horizontal overflow, 44px Edit targets, Add/Edit opening and cancellation, collapse/reopen from the chevron's lower edge. A collapsed read-only header also measures45px and its lower-edge click works; settled-page axe reports zero violations. Screenshots were inspected. Build (including TypeScript) and git diff --check passed; only the existing large-chunk warning remains. No tests rerun for the two CSS declarations. Artifacts: basket-heading-before.css, basket-heading-results.txt, basket-heading-build.log, and basket-heading-{1440,390,320}.png in /tmp/lisno-knowledge-compact-qa/. QA sessions stopped after verification.
