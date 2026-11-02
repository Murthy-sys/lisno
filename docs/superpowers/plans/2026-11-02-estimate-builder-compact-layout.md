# Compact estimate builder: task plan

Date: 2026-11-02
Status: Complete; implemented and verified in Mode A
Specification: [Approved compact estimate builder specification](../specs/2026-11-02-estimate-builder-compact-layout-design.md)

The user approved the specification and task plan on 2026-11-02 and selected Mode A. This plan records those approvals without changing the approved requirements.

## Outcome and boundaries

Recover space for Main Basket, Sub-basket, and item editing by compacting the configured builder's surrounding controls and row spacing. At both 1440×900 and 1280×800, reduce workspace-top-to-first-basket distance by at least 25%, increase the item pane height by at least 80 CSS pixels, and show at least one additional complete simple row using the same fixture.

Retain current amounts, source labels, project numbers, permissions, mutations, query invalidation, keyboard interaction, and workflow behavior. Configure, Summary, Proposal, legacy catalogue rendering, backend contracts, and persistence are outside the redesign. No new dependency, commit, deployment, seed script, backfill, live migration, or external communication is included.

Keep one parent task in progress. Parallel work, when authorized, consists of bounded child slices within that parent task. No product writes or agents start before the execution-choice gate.

## Ownership and shared presentation contract

| Owner in Mode A | Exclusive write scope | Responsibility |
| --- | --- | --- |
| Primary agent | This plan; temporary local QA fixture, scripts, screenshots, and measurements under `/tmp/lisno-estimate-compact-qa/` | Baseline, product interpretation, markup/CSS agreement, integration, visual review, and final evidence |
| Frontend implementer: components | `frontend/src/features/leads/LeadEstimateWorkspace.tsx`; `ConfiguredEstimateBuilder.tsx` only if needed; their focused test files | Compact builder markup, accessible content, any required viewport measurement adjustment, and meaningful semantic/behavior coverage |
| Frontend implementer: styles | `frontend/src/styles/estimator-dashboard.css` | Builder-scoped density, responsive layout, typography, focus/hit areas, and footer/scroll sizing |
| Integrity reviewer | Read-only integrated task diff and relevant consumers | Scope leakage, preserved state/actions, accessibility, clipping and scrolling risks |
| Verification runner | Read-only product files; temporary verification outputs only | Final automated checks and evidence against acceptance criteria |

The component owner's permitted test files are `ConfiguredEstimateBuilder.test.tsx`, `LeadEstimateWorkspace.test.tsx`, `LeadEstimateWorkspace.collaboration.test.tsx`, and `LeadEstimateWorkspace.tiers.test.tsx` in the same directory. Existing tests are reused; new tests are justified only by changed semantics or an identified regression risk. The global accessibility test file is not an assigned write target.

In Mode B, the primary agent performs all slices, review, and verification sequentially without implementation subagents.

Contract settled before the two writers start:

- Add `.estimate-workspace--compact-builder` to the existing workspace section only when `boundedBuilder` is true. Use this explicit root scope for the new presentation; retain the existing item/configure classes.
- Inside the existing header, use `.estimate-workspace__heading-main` to group the back control and title only for the compact builder. Keep the existing back control behavior, accessible name, and submission lock. Render one back control and one title, never duplicate hidden interactive controls.
- Preserve `.estimate-workspace__title`, `.estimate-workspace__summary`, `.estimate-workspace__project-number`, and the existing toolbar, rail, basket, row, and footer selectors. Add a scoped project-metadata hook if required to keep metadata inline and wrapping.
- Preserve `.estimate-workspace__builder-area` as a direct child of the workspace so its current parent/sibling measurements remain valid.
- Keep the native workflow disclosure, all notices, and existing mutation/state code. Any markup adjustment is presentational; a discovered behavior requirement returns to the primary agent before changes cross ownership boundaries.
- Keep row menus within their existing portal/focus mechanism. Scope portal styling separately only if necessary; do not break it by relying solely on descendant selectors from the workspace.
- Do not edit shared workflow CSS to compress the disclosure. Apply its compact styling from the builder-specific stylesheet scope.

## Task 1: capture baseline and confirm integration points

Owner: primary agent. Dependencies: plan approved and execution mode selected. Status: complete.

1. Capture `git status --short`, relevant target diffs, and copies of current target files before writers start. The workspace and stylesheet already contain previous changes; explicitly preserve them. Do not restore files from HEAD as a baseline.
2. Inspect the current markup and effective CSS at target widths. Confirm the presentation contract above, current app-shell contribution, minimum-height constraints, and locations of permission-dependent status/actions.
3. Prepare a local synthetic QA fixture using the real app/workspace/components and controlled test data. Include two rooms, multiple Main Baskets/Sub-baskets, and at least ten simple rows in the first visible basket. Use the same fixture data and state before and after. Include a collaborative workflow variant with a collapsed disclosure and project navigation matching the supplied screenshot.
4. Capture screenshots and browser measurements at 1440×900 and 1280×800, 100% zoom, top-of-page and top-of-item-pane scroll positions. Record workspace top, first basket heading top, item pane client height, fully visible simple-row count, header/footer height, room rail width, and document overflow. A full row counts only if its bounding box fits within the visible item pane.
5. Capture comparison screenshots for Configure, Summary, and Proposal, and record their relevant header/controls so scoped styling can be checked later.
6. Confirm baseline behavior with the focused existing component/workspace tests. Record any failure before modifying code; do not quietly change a test expectation to make it pass.

Evidence: baseline files and measurements under the temporary QA directory, with paths recorded in the final plan. No real customer data or real mail is used. Do not invoke repository seed scripts. Browser response fixtures or a disposable local test database may be used; document the chosen method and its limits.

Acceptance trace: AC1–AC3 measurement baseline; AC4/AC7 behavior and adjacent-view baseline; AC8 preservation and evidence.

## Task 2: implement compact builder presentation

Dependencies: Task 1 complete and presentation contract shared. Status: complete.

### Component slice

Owner: component frontend implementer in Mode A; primary in Mode B.

- Apply the explicit compact-builder modifier and group back/title/project identity in the masthead while leaving other views' structure intact.
- Preserve full project number and unassigned state, title linkage, totals, labels, current status/actions, and disclosure semantics.
- Add only the small hooks or label-discovery behavior required for compact layout. Maintain discoverable long navigation labels and stable item IDs/keys.
- Retain the existing viewport measurement model. Change it only if measured evidence shows a footer/scroll/visual-viewport problem that CSS cannot resolve; preserve resize listeners, cleanup, and updates when preceding content changes size.
- Add or adjust semantic regression tests only where markup or measurement behavior materially changes. Reuse existing coverage for navigation, scroll preservation, menus, quantities/rates, dimensions, classifications, saving, and submission.

Acceptance trace: AC3–AC5, AC7–AC8.

### Styling slice

Owner: style frontend implementer in Mode A; primary in Mode B.

- Implement the approved compact masthead, inline wrapping metadata, smaller total treatment, and collapsed workflow disclosure spacing.
- Tighten tabs/project navigation and search/filter/refresh rows. Prevent unnecessary desktop label wrapping.
- Narrow the desktop room rail; reduce gaps and basket shortcut height. Compact Main Basket/Sub-basket headers, thumbnails, nested spacing, and simple rows while preserving essential labels and values.
- Compact the footer and keep action labels/states legible. Reconcile the builder's minimum height and overflow rules with the available viewport, retaining a usable fallback for short screens and expanded workflow.
- Apply tablet/mobile reflow, coarse-pointer targets, readable mobile input text, and visible focus outlines. Let complex rows and warnings increase height naturally.
- Consolidate conflicting rules only within the owned builder scope. Avoid global font scaling, CSS zoom, fixed-height clipping, blanket overflow hiding, or changes to unrelated stylesheet sections.

Acceptance trace: AC1–AC3, AC5–AC8.

Parallelism: in approved Mode A these two slices can run simultaneously because their write paths do not overlap and their selectors/structure are agreed. The primary can maintain the temporary QA harness concurrently. Each agent must be told they are not alone, must preserve others' work, and must return cross-boundary needs to the primary. Do not run final verification while either writer is active.

## Task 3: integrate and tune against the approved measurements

Owner: primary agent, delegating any fixes back to the exclusive file owner until ownership is explicitly released. Dependency: Task 2 writers finished. Status: complete.

1. Inspect task-only diffs against Task 1 copies. Confirm no estimate/calculation/API/cache/permission behavior changes and no unrelated dirty work was overwritten.
2. Render the same fixture and repeat the exact desktop measurements. Tune spacing until both viewports meet the 25% top-area reduction, 80px pane gain, and additional complete-row criteria. Keep font/readability constraints intact.
3. Confirm the selected/simple/complex row heights grow naturally. Check long project and item names, long basket navigation labels, large amounts, project number/unassigned state, and a long workflow action label.
4. Verify short viewport/expanded workflow behavior, footer reachability, last-row visibility, focused input visibility, menu placement, and item-pane scroll preservation during edits.
5. Compare adjacent views against baseline and correct any style or markup leakage.

If an acceptance target is impossible without a material approved-scope change, document the measured conflict and bring the affected specification/plan back once. Do not silently weaken a target or hide required content.

Acceptance trace: AC1–AC7.

## Task 4: integrity review

Dependency: Task 3 integrated result. Status: complete.

Mode A: use `integrity_reviewer` with read-only scope. Mode B: primary performs equivalent review inline.

Review the task-specific diff for preserved state/handlers and project identity, scoped selectors across adjacent views, duplicate/hidden interactive elements, accessible names and focus order, numeric truncation, container-query conflicts, viewport sizing and cleanup, and portal menu behavior. Resolve confirmed findings and repeat only the checks affected by fixes.

Acceptance trace: AC4–AC8. Deliverable: findings with severity and file references, or an explicit no-findings result with review limits.

## Task 5: final integrated verification

Dependency: review findings resolved and all product writers stopped. Status: complete.

In Mode A, `verification_runner` runs automated checks on the integrated tree while the primary performs read-only browser verification. These can run in parallel. Any fix invalidates affected results; rerun the necessary checks after it. In Mode B, primary performs both.

Automated commands from `frontend/`:

```sh
npm test -- src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx
npm run typecheck
npm run build
```

Repository checks:

```sh
git diff --check
git status --short
```

No backend/OCR/full unrelated suite is required for this isolated presentation change unless the actual diff creates new risk. There is no repository lint script. Do not claim lint or unrun suites passed.

Rendered checks:

| Viewport/state | Required evidence |
| --- | --- |
| 1440×900 and 1280×800, normal desktop fixture | Before/after metrics for AC1–AC2, screenshot, compact controls, footer visibility, no unintended horizontal overflow |
| 768×1024 | Tablet reflow, navigation, long labels, quantity/rate editing, complete amounts, scroll/footer reachability |
| 390×844 with coarse pointer | Stacked controls, hit areas, readable inputs, no page overflow, menu and last-row access |
| 200% desktop browser zoom/reflow | Essential controls and text remain accessible; record browser zoom method and resulting CSS viewport; do not substitute CSS zoom for browser zoom |
| Expanded workflow and short desktop viewport | Disclosure/action reachability, no clipping, sensible page/item scrolling, focus visibility |
| Selected/complex rows | Dimensions, classifications, rate details, validation messages, source status, large amounts, long names, no fixed-height truncation |
| Loading, empty/filter-empty, stale/unavailable data, read-only/blocked, failed save | Existing messages and actions remain visible and usable; no false values or hidden failures |
| Configure, Summary, Proposal | Baseline presentation retained, back/navigation works, compact builder scope absent |

Exercise keyboard navigation and focus, search/section/selected filters, room switching, basket/sub-basket collapse, quantity/rate edits, row menu open/Escape/focus return, and Save/Submit behavior using synthetic API responses or the isolated local backend. Inspect console/network failures and distinguish task failures from fixture or pre-existing failures. Run axe against the rendered builder and inspect keyboard/focus/contrast manually; automated accessibility checks alone do not prove layout quality.

Acceptance trace: AC1–AC8. Store only temporary screenshots/logs/measurements outside tracked sources. Shut down task-owned servers/browser sessions and remove or relocate only task-generated runtime files at completion.

## Task 6: final handoff

Owner: primary agent. Dependency: verification complete. Status: complete.

- Record completion and exact command/results in this plan, plus baseline/after metrics at both desktop widths and the screenshot/measurement artifact paths.
- Report the visible result, principal decisions, changed files, validation, unrun checks, and any remaining limitations concisely.
- State that no dependency, migration, deployment, production mutation, commit, or push was performed.
- Call the task complete only when acceptance criteria are met or clearly distinguish any incomplete verification.

## Approval boundary

Specification and task plan approved; user selected Mode A before implementation. All execution stages below are complete.

## Execution evidence

- Baseline target copies, dirty status/diff, fixture, screenshots, and metrics: `/tmp/lisno-estimate-compact-qa/`.
- Baseline focused tests: four files, 97 tests passed, exit 0, 11.14 seconds. Exact command above; result recorded in `baseline-tests.log`.
- Baseline browser: real application/components in Vite development mode, local synthetic API fixtures for the estimate/catalogue/requirements, disposable local backend for authentication and project navigation. Mail delivery disabled. No real client data used.
- At 1440×900 and 1280×800, workspace top to first basket is 384.25px; header 103.25px, footer 69.70px, rail 250px. Item panes are 308px and 268px respectively; each shows two complete simple rows. Both have zero page horizontal overflow.
- Baseline Configure, Summary, Proposal and builder screenshots captured before writers were released. Component and stylesheet agents have separate exclusive paths.

### Final implementation

- Product changes are limited to `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, `frontend/src/features/leads/LeadEstimateWorkspace.test.tsx`, and `frontend/src/styles/estimator-dashboard.css`. The other four captured targets are unchanged. Prior unrelated dirty work is preserved.
- The configured builder has one compact back/title/identity group, inline wrapping project metadata, compact totals, workflow disclosure, tabs/search controls, a 190px desktop room rail, smaller basket headings/thumbnails, and a 48px normal desktop footer. Ordinary desktop rows measure 61.20px.
- Styles activate only with the bounded builder's explicit modifier. Configure, Summary, and Proposal retain their existing structure and presentation. No calculation, authorization, API, mutation, cache, project-number, or workflow logic changed.
- Narrow touch layouts retain 16px inputs and 40px controls, a useful item pane, and page scrolling. Review-driven fixes removed an inherited tablet field inset, matched the coarse-pointer field track to its contents, and added an 8px scroll margin to keep focused controls clear of viewport edges.

### Measured result

Chromium 156.0.8078.74, Vite development mode, same synthetic fixture and normal unselected state, 100% zoom/DPR1:

| CSS viewport | Top-to-first-basket before → after | Item pane before → after | Complete visible simple rows before → after |
| --- | --- | --- | --- |
| 1440×900 | 384.25 → 227.78px (40.7% less) | 308 → 499.51px (+191.51px) | 2 → 6 |
| 1280×800 | 384.25 → 227.78px (40.7% less) | 268 → 399.51px (+131.51px) | 2 → 5 |

Both desktop acceptance thresholds pass. At 768×1024, the pane measures 572.41px with seven complete simple rows. At 390×844 with coarse-pointer emulation, the pane is 295px tall and the page scrolls to the content/footer; the normal page-top frame does not contain a complete row. Mobile density is not treated as a desktop threshold. Keyboard focus on the last input moves it fully into view, with its bottom at 836.13px in the 844px viewport.

### Final checks and limits

- Exact focused test command in Task 5: **97 tests in four files passed**, exit 0. Existing regression coverage plus the updated workspace test checks unique heading/back controls, adjacent-view navigation, unassigned number, and retained item classification.
- `npm run typecheck`: passed, exit 0. `npm run build`: passed, exit 0. Build rerun after the final CSS-only focus fix includes `tsc -b`; existing warning about chunks exceeding 500kB remains. The unchanged TypeScript/test files retain their verified hashes.
- `git diff --check`: passed. Final status has the same 199 dirty paths as the captured baseline, with no paths removed or added after moving task-created browser artifacts out of the repository. The plan/spec were already in that baseline; their status and verification notes are updated here.
- Independent integrity review found no remaining defects. CSS outside the new compact block is unchanged from the task baseline.
- Rendered at 1440×900, 1280×800, 768×1024, and 390×844; also checked 720px/690px coarse-pointer breakpoints and 1280×600 expanded-workflow scrolling. No unintended page horizontal overflow. The tablet fix keeps menu controls inside their rows.
- True browser zoom used Chromium's **Page zoom = 200%** in a separate disposable profile. A 1440×900 outer viewport became 720×450 CSS pixels/DPR2. Pane keyboard scrolling and footer access passed with zero horizontal overflow. The profile's zoom was reset and the profile removed after closing it.
- Axe reported **zero workspace violations** at desktop and coarse-pointer mobile sizes, including the long-content/dimensions variant. Keyboard focus/menu return, native disclosure, last-row access, and visible input outlines were also checked manually in the browser.
- Browser interactions passed: search, Main Basket and selected-item filters, empty selected state, room switching, keyboard basket collapse/jump, Sub-basket collapse, quantity/rate totals, Special item classification/PMC mode, Premium tier, dimension validation/recovery, failed-save edit retention/retry, successful Save/Submit, and submitted read-only controls. The successful synthetic save/submission preserved quantity 3 and rate 12,500 paise in both PUT payloads, followed by POST submission.
- Rendered long project/client/item names, unassigned project number, large amounts, v3 designer-revised quotation action, expanded workflow, requirements-unavailable submission block, catalogue loading, and failed catalogue refresh with existing rows retained. Adjacent Configure/Summary/Proposal views were inspected with the compact scope absent.
- Expected HTTP503s were injected for failure states. An initial incomplete synthetic save response caused NaN input-attribute warnings; the fixture was corrected and the Save/Submit path rerun successfully with full UOM metadata. Temporary server restart errors are separated from final normal runs, which had no unexpected console/network errors.
- Verification uses Chromium and emulated touch sizing, not physical mobile devices/software keyboards or other browser engines. It is layout/interaction verification, not production performance profiling. Real backend persistence and delivery were not revalidated for this presentation-only task; browser estimate responses were controlled fixtures.
- Unrun: full unrelated frontend suite, backend/OCR suites, lint (no repository script), migrations/backfills. No dependencies, production mutations, real mail, deployments, commits, or pushes were performed.

### Artifacts and cleanup

- Evidence: `/tmp/lisno-estimate-compact-qa/browser-results.json`, `baseline-metrics.json`, `final-automated-results.json`, `final-*.log`, `integrated-task.patch`, and `final-clean-status.txt`.
- Representative screenshots: `baseline-1440.png`, `final-1440.png`, `final-1280.png`, `final-768.png`, `final-390.png`, `final-390-footer.png`, `complex-1440.png`, `complex-390.png`, and `zoom-200.png` in that directory.
- Local fixture and reusable browser scenario code remain in the temporary QA directory for review. Task-created `.playwright-cli` files were moved to its `browser-artifacts/` directory; no runtime artifacts are tracked.
- Both task-owned browser sessions and the local QA server were stopped. The temporary persistent browser profile was removed. Build output remains ignored under `frontend/dist/` with TypeScript caches; it was not committed.
