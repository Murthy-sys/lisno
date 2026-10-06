# Procurement main-basket reference styling: task plan

Approved specification: [Procurement main-basket reference styling](../specs/2026-10-06-procurement-basket-reference-ui-design.md).

## Outcome and boundaries

Match the supplied reference through scoped CSS and presentational JSX: wider approved scope, compact vendor panel with connected progress steps, and a full-width issued package below. Preserve all existing variable names, business logic, data, actions, guards, and component state ownership.

No backend, API, dependency, shared component, global theme, or workflow changes. Use current data and supported controls; no additional functional controls from the mockup. No live invitations, orders, approvals, messages, commits, or deployment.

Specification approval is recorded. This file is the task-plan gate only; implementation starts after task-plan approval and execution-mode selection.

## 1. Capture baseline and settle presentation boundaries

**Owner:** primary. **Dependency:** execution-mode selection. **Acceptance:** specification AC2, AC3, AC7.

- Refresh `git status --short`; save the dirty-path inventory and current contents/diffs of every target before editing. Product files were clean at specification creation; the specification is currently untracked.
- Confirm style load order and the existing scope/enquiry/monitor DOM. Identify one layout approach that gives the existing monitor full width while preserving the enquiry component, its state, conditional rendering, and stage target IDs.
- Establish presentation-only classes/wrappers and the desktop/mobile grid rules before distributing edits. Keep semantic section boundaries and normal DOM reading/focus order. Avoid absolute-positioned content, duplicate rendering, state lifting, query duplication, or lifecycle changes.
- Freeze the CSS scope at the basket detail view. Shared global rules, overview cards, public BOQ pages, and the award modal must retain their current appearance.
- Keep this styling correction as the sole parent task in progress. If implementation would require functional changes, return to the CSS/markup approach instead of expanding scope.

## 2. Style the approved-scope panel

**Owner:** frontend scope implementer in Mode A; primary in Mode B. **Dependency:** task 1. **Acceptance:** AC1, AC2, AC3, AC5.

**Exclusive files:**

- `frontend/src/features/procurement/ProcurementBasketScopePanel.tsx`
- `frontend/src/features/procurement/procurementBasketScope.css`

**Changes:**

- Match the forest-green header and hierarchy. Display item count and total using existing `includedLines` and `total` expressions.
- Improve table column spacing, typography, row separators, quantity/UOM readability, and amount alignment.
- Change the total footer to the reference's quiet tinted band.
- Preserve all warning text, incomplete states, mode/base-rate controls, handlers, and their visibility/disabled expressions.
- Do not add item search, selection checkboxes, Add item, row menus, images, or fabricated descriptions.

## 3. Style vendor selection and progress

**Owner:** frontend enquiry implementer in Mode A; primary in Mode B. **Dependency:** task 1. **Acceptance:** AC1–AC5.

**Exclusive files:**

- `frontend/src/features/procurement/ProcurementBasketEnquiry.tsx`
- `frontend/src/features/procurement/procurementBasketEnquiry.css`

**Changes:**

- Apply the agreed presentation wrappers while preserving existing IDs, conditions, props, refs, component keys, and event handlers.
- Style the connected progress steps from the existing current/complete/upcoming states.
- Refine the existing search field, select-all controls, vendor identity/participation rows, KPI presentation, pagination, and invitation action footer.
- Display eligibility from the existing `vendor.eligible` value; keep KPI separate from financial amounts.
- Preserve selection across searches/pages, disabled reasons, busy states, retry controls, disclosures, comparison content, and the existing issued-state monitor mount.
- Do not introduce Filter, vendor-detail, or other new actions.

## 4. Integrate the layout and issued-package presentation

**Owner:** primary. **Dependency:** task 1; coordinate wrapper contract with task 3. **Acceptance:** AC1, AC2, AC3, AC4, AC5, AC7.

**Exclusive files:**

- `frontend/src/features/procurement/procurementBasket.css`
- Presentation portions of `ProcurementBasketDetailView.tsx` and `ProcurementBasketWorkspace.tsx` only if required for layout scoping.
- `frontend/src/features/procurement/ProcurementBasketMonitor.tsx`

**Changes:**

- Use approximately 62:38 columns at wide desktop sizes; choose the stacking breakpoint based on actual content fit.
- Place the existing current issued package directly below Approved Scope, at the same left-column width, without changing who owns or fetches its data. The user’s latest marked screenshot supersedes the original full-width placement. Preserve its stage target so progress navigation still scrolls and focuses it.
- Style the package header, tabs, line table, totals, and existing PDF/WhatsApp actions to match the reference.
- Keep historical packages inside their existing disclosures, all current monitor states, and all Finance/Site performance/Vendor alerts contents.
- Keep the actual order lines, total expressions, optional metadata/terms, mutation handlers, button semantics, and read-only behavior intact.
- Use scoped selectors and existing design tokens. Add only presentational classes/markup where required. Do not rename existing CSS custom properties or program identifiers.
- Adjust the existing procurement page heading through local selectors only if necessary; do not edit shared `PageHeader` or project navigation implementations.

## 5. Review the integrated diff

**Owner:** primary and proportional read-only integrity reviewer in Mode A; primary in Mode B. **Dependencies:** tasks 2–4 complete. **Acceptance:** AC2, AC3, AC4, AC7.

- Compare each product target against the captured baseline, including any preexisting changes.
- Confirm that existing variable/function/prop/type/field names are identical, and that hooks, state, effects, business expressions, data formatting/calculations, callbacks, permissions, disabled conditions, query keys, API calls, and mutations have no semantic changes.
- Confirm monitor is mounted once and remains under the original issued condition; stage navigation and accessible section/table/tab semantics still work.
- Inspect CSS reach: detail-only changes must not alter the overview cards, award modal, public vendor page, or unrelated project screens.
- Resolve only confirmed scoped defects; do not perform unrelated cleanup or broad reformatting.

## 6. Verify and hand off

**Owner:** primary for browser checks; final verification runner in Mode A, primary in Mode B. **Dependency:** task 5 cleared. **Acceptance:** AC1–AC7.

### Automated checks

From `frontend/`:

```sh
npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketMonitor.test.tsx
npm run typecheck
npm run build
```

From repository root:

```sh
git diff --check
git status --short
```

Use the existing rendered regressions for selection/search/pagination, stage navigation, inline editors, issued states, keyboard tabs, and order details. Add a focused rendered check only if a real markup/interaction risk lacks coverage. Do not add tests that mirror CSS declarations or broaden into backend tests for this presentation-only change. There is no lint script.

### Visual and interaction checks

- Compare the actual rendered page with image 1 at a wide desktop viewport; check approximately 1920px, 1440px, 1024px, and 390px widths.
- Inspect an issued two-line basket plus unissued/selection states using existing fixtures or isolated synthetic responses. Preserve the user's live page and data; do not submit requests, create share intents, issue orders, or send messages during visual QA.
- Confirm the header summary, scope rows/footer, vendor panel, progress steps, and full-width issued package have the reference's hierarchy and proportions.
- Check long names/codes/order numbers, large totals, wrapping, internal table scrolling, keyboard focus, disabled controls, stage navigation, and monitor tabs. Inspect console errors and page-level overflow.
- Spot-check the unaffected basket overview, award modal, and public vendor page CSS scope; test only the concrete remaining risk if leakage is found.
- Reuse existing tooling. Any temporary isolated preview harness/screenshots stay ignored and are removed or reported; no dependency installation is expected.

### Completion record

Record affected files, exact commands/results, viewport/interaction evidence, unrun checks, warnings, and remaining limitations in this plan. Report the UI result concisely and distinguish visual QA from live submission. No deployment or live action is part of completion.

## Execution and parallel ownership

- Only after the user selects Mode A may agents start. Tasks 2 and 3 can run independently after the shared presentation contract is agreed; task 4 remains primary-owned with separate files. All writers must preserve others' work and report any needed cross-file change to the primary.
- No two writers own the same path. Changes to shared CSS remain with the primary. Test-file changes, if genuinely necessary, are primary-owned after writers finish.
- In Mode B, the primary executes the same work inline without implementation subagents.
- Review follows all writers; final verification follows review. Do not run final checks against concurrently changing sources.

## Approval record

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution mode: A, selected by the user.
- Product implementation: completed and verified.

## Implementation and verification record

All six tasks are complete. Baseline contents/diffs and initial status were captured in `/tmp/lisno-basket-reference-ui-baseline`; the existing workspace test was also captured before updating its presentation assertions. Product targets were initially clean.

### Delivered presentation

- Updated only three product TSX files and three local CSS files: `ProcurementBasketScopePanel.tsx`, `ProcurementBasketEnquiry.tsx`, `ProcurementBasketMonitor.tsx`, `procurementBasketScope.css`, `procurementBasketEnquiry.css`, and `procurementBasket.css`.
- The scope header now displays the existing count and total; Unit and Qty have separate columns; the total footer uses the reference's light treatment.
- Vendor rows, search, eligibility/KPI, pagination, and connected progress steps use the reference's hierarchy. Existing controls and unavailable-action explanations remain.
- The current issued package spans both columns. CSS flow layout and a presentation-only enquiry wrapper preserve the original component ownership, single monitor mount, issued condition, target IDs, and DOM reading order. No state lifting or duplicate fetching.
- The user's spacing correction was incorporated within the approved UI scope: project heading/navigation gaps reduced; scope header minimum height reduced from 142px to 104px; table row padding from 24px to 14px; footer minimum height from 68px to 50px; vendor progress height from 76px to 60px; compact 36–40px controls; search and selection tools share a row where space permits. Main content remains at readable 12–14px, with 22–24px scope headings. No scaling or hidden content used to force fit.
- A browser check caught a shared role-style override of the issued header text. Increasing only the local selector specificity restored light heading text against green.
- Updated five existing assertions in `ProcurementBasketWorkspace.test.tsx` for the added Unit column and the summary/footer copies of the existing total. No business regression expectations were relaxed.

### Integrity review

Independent read-only review against the baseline found no confirmed defect. Existing variable/function/prop names, state, hooks, queries, handlers, guards, financial expressions, mount conditions, stage targets, and accessible control names are intact. New styles are scoped to the detail page/current package; historical packages, overview cards, public BOQ pages, and the award modal do not match the new detail-specific presentation selectors. The enquiry slice additionally compared its AST: 207 existing names, 19 handlers, and 34 identity/state attributes were unchanged.

### Verification evidence

- `npm test -- src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketMonitor.test.tsx`: **44/44 passed** (40 workspace, 4 monitor).
- `npm run typecheck`: passed.
- `npm run build`: passed, including a final rebuild after all compact-spacing CSS refinements. Existing large-chunk warning remains.
- `git diff --check`: passed. Final status contains only the seven scoped frontend paths and these specification/plan documents.
- Logs: `/tmp/lisno-basket-reference-ui-{tests,typecheck,build,diff}.log`.
- Browser QA used the real components and production styles with isolated synthetic responses. All mutations and unmocked requests were blocked; auth was stubbed in memory without reading or overwriting the user's stored session.
- Inspected 1920, 1440, 1024, and 390px widths. Wide layout uses approximately 62:38 columns, the issued package spans the workspace, and smaller layouts stack. Final 1920×1080 sample fits the full page including totals/actions. This is representative-data evidence, not a guarantee that every project or longer list fits without vertical scrolling.
- Final 390px document width equals 390px; tables scroll within their wrappers. Long vendor names/codes and order numbers wrap without page overflow. Browser console errors: none observed.
- Exercised vendor selection, selection retention across search/clear, stage navigation/focus, package tabs, inline base-rate editor opening/canceling, and return to main baskets. No live submission or external action was performed.
- Screenshot retained at `/tmp/lisno-basket-reference-ui-desktop.jpg` uses synthetic data. The temporary harness files were deleted, the QA tab closed, and the viewport override reset.

Full repository/backend suites were not run because this change is presentation-only. No lint script exists. Automated axe checks in the existing tests exclude color-contrast; the header contrast issue was checked visually and through computed browser styles. No dependencies, backend/API/schema changes, migrations, live data changes, commits, pushes, or deployments occurred.

### Further density correction

The user's further spacing feedback was implemented within the same approved UI scope. Only the three existing basket CSS files changed during this correction; their prior contents are captured in `/tmp/lisno-basket-density-baseline`.

- Removed extra letter spacing from the affected headings, table labels and controls. Preserved Poppins and existing font families.
- Scope header minimum height is now 72px, rows use 8px vertical padding, and the footer minimum is 36px. Scope title is 20px desktop/18px mobile.
- Enquiry inset is 8px, stage strip minimum is 48px with 24px indicators, and vendor rows use 6px vertical padding. Desktop controls are 32px; coarse-pointer controls retain at least 40px height.
- Project heading gaps, breadcrumbs, navigation, issued-package header, tabs, rows and action spacing are tighter. Project status and critical count align together at the end of the navigation row.
- Independent CSS review found no confirmed defects, clipping or scope leakage. No variable names or functionality changed.
- Final `npm run build` passed; existing bundle-size warning remains. Log: `/tmp/lisno-basket-density-build.log`. `git diff --check` passed. The earlier 44 focused tests and typecheck passed before this CSS-only refinement; they were not rerun.
- Rendered the actual basket components with production Poppins fonts, complete page heading and representative navigation using synthetic fixtures at 1440px and 390px. No document horizontal overflow. At 1440px, scope header measures 72.75px and the issued order/actions finish at about 851px. Longer data may still require vertical scrolling.
- Verified Order/Site performance tab switching and mobile Select all eligible: both vendors checked and Send bid invitations enabled. No submission clicked; console errors were absent.
- Screenshot: `/tmp/lisno-basket-density-desktop.jpg` (synthetic data). Removed temporary harness files, closed QA tab and reset viewport. User's existing application tab was preserved.

### Issued package placement correction

The user requested the issued package in the empty left-column area directly below Approved Scope, with matching width and smaller type. Ownership: primary edits only `procurementBasket.css`; a separate agent supplies an ignored synthetic browser harness and a read-only reviewer checks CSS/build. Prior CSS captured in `/tmp/lisno-issued-left-baseline`.

- Keep existing JSX, variables, conditions, handlers and data ownership. Use scoped floats to let the issued package clear only the left scope card while the vendor panel remains on the right.
- Reduce issued heading/total/table text to 16/18/12px and size its footer from the package’s own container width. Keep natural height, wrapping, table scrolling and all actions.
- Verify equal left edges/widths and the 8px scope-to-package gap, desktop/mobile overflow, package tabs/stage focus, then build and diff check.

Completed: only `procurementBasket.css` changed for this correction. At 1440px the scope and issued cards both measure 867.91px wide at x=12; the issued card begins 8px below scope. At 1100px the equal widths and 8px gap also pass. At 390px the layout stacks with internal table scrolling and no page-level horizontal overflow. Order/Site performance tabs and Awarded stage scrolling/focus work. No browser console errors. Independent CSS review, `npm run build` and `git diff --check` passed (existing bundle-size warning; log `/tmp/lisno-issued-left-build.log`). No tests/typecheck rerun for this CSS-only correction; earlier focused 44 tests and typecheck passed. No live actions or backend changes. Synthetic preview: `/tmp/lisno-issued-left-desktop.jpg`. Temporary harness removed and browser viewport reset.

### Scope header simplification

Latest user correction removes the project name and item count from the Approved Scope header, with the existing amount aligned at the far right. Primary owns only `procurementBasketScope.css`; all JSX, names, calculations and the footer remain intact. Compact the now-shorter header to 60px minimum. CSS baseline: `/tmp/lisno-scope-header-baseline`. Verify desktop/mobile header visibility and right alignment, then build/diff check.

Completed with local CSS only. Rendered header at 1440px and 390px shows Approved Scope, basket title and right-aligned total; project name and Items/count are absent from the visible/accessibility header. Footer retains Total (2 items). Header measures 60px on desktop; mobile amount retains 10px right inset. No document horizontal overflow. `npm run build` and `git diff --check` passed; existing bundle-size warning remains. Build log: `/tmp/lisno-scope-header-build.log`; screenshot: `/tmp/lisno-scope-header-desktop.jpg` using synthetic data. No functional tests added/rerun for this reversible presentation-only edit. Temporary harness removed, QA tab closed, viewport reset. No live data or external actions.

### Header theme alignment

Changed only the detail header background declarations in `procurementBasketScope.css` and `procurementBasket.css` to `var(--workspace-active, #525f40)`, using the active-navigation theme token from `common-shell.css`. Baseline: `/tmp/lisno-header-theme-baseline`. Independent read-only review confirmed the token and light-text contrast (minimum 4.62:1). Browser rendering with the actual production styles resolved both backgrounds to rgb(82,95,64), matching the theme token. `git diff --check` passed. No build or functional tests rerun for these two colour-only declarations. Isolated header preview with sample data: `/tmp/lisno-header-theme.jpg`. Temporary harness removed; viewport reset and QA tab closed. No functional or external changes.

### Light olive clarification

User clarified light olive like the side navigation. Both header backgrounds now match the selected sidebar child item (`#dfe7d7`), with existing workspace ink (`#30382b`) for every header label, title and amount. Issued icon colour/border adjusted for the light surface. Only scoped colour declarations changed in the same two CSS files. Baseline: `/tmp/lisno-header-light-olive-baseline`. Browser computed styles confirmed both backgrounds and all header text; contrast is 9.59:1. `git diff --check` passed. No build/tests rerun for this colour-only adjustment. Isolated production-CSS preview: `/tmp/lisno-light-olive-headers.jpg` (sample data). Harness removed, QA tab closed, viewport reset; no external or functional changes.
