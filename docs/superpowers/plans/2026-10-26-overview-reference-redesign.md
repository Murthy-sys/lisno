# Main Line Overview reference redesign task plan

Date: 2026-10-26
Status: Implemented and verified within scope; existing regression failures documented below
Specification: [Overview reference redesign](../specs/2026-10-26-overview-reference-redesign-design.md)
Specification approval: User replied `Approved` on 2026-10-26.
Execution mode: A, parallel sub-agents, selected by the user.

Progress: T1–T7 finished. Parallel panel implementation integrated, integrity review completed without confirmed defects, and final verification completed. The regression suite retains 20 failures reproduced in the isolated pre-task baseline. Evidence is stored under `/tmp/lisno-overview-reference-redesign/`.

## Outcome and boundaries

Implement the approved screenshot-based redesign of Configuration > Main Line > Overview: approximately 1:2 desktop columns, readable UOM/settings controls, olive selections, the wider Surfaces table, and restrained architectural decoration. Preserve all existing data, permissions, save behavior, and the shared proposal/Procurement presentation.

No dependencies, lockfile edits, backend/shared contracts, migrations, production writes, commits, pushes, or deployment are required. Only the plan file was created at the task-plan approval gate. The approved specification remains the source of truth.

## Worktree and ownership rules

- Record the current dirty-path set and per-target diffs immediately before implementation. Store temporary baseline patches, screenshots, and reports under `/tmp/lisno-overview-reference-redesign/`; do not stage them.
- Existing edits in `KnowledgeOverviewPanel.tsx`, its test, `KnowledgeItemWorkspacePage.tsx`, and `KnowledgeScreens.test.tsx` include dimension/tier work. Read and preserve those changes before assigning ownership. Do not rewrite them from HEAD.
- The primary agent owns integration, the workspace call site, any shared visual helper, the final selector/prop contract, and task status. Keep only one parent implementation task active.
- In Mode A, workers receive explicit files and the instruction that they share the worktree, must preserve others' edits, and must report boundary changes before editing outside their scope. No two writers may own the same file at once.
- In Mode B, the primary agent performs all implementation, review, and verification sequentially without subagents.

## Dependency-ordered tasks

### T1. Capture the baseline and confirm integration points

Owner: Primary agent. Dependencies: Task-plan approval and execution-mode selection. Acceptance: AC2, AC3, AC5, AC6.

- Refresh dirty-path and target-diff evidence; note existing failures independently from this task.
- Confirm the current Overview render path, CSS import order, reference-state handling, dimension/tier callbacks, and alternate proposal consumers.
- Run the focused Overview and Surface panel suites before edits to establish behavior.
- Capture a baseline render with synthetic data inside the actual workspace shell. Reuse `frontend/qa/enterprise.html` and its fixture routing where suitable. Existing `main-line-surfaces.html` renders a Mode surface panel only and cannot by itself establish the full Overview layout.
- Check whether the current fixture supplies supported area-UOM metadata and tiers. If fixture additions are needed, agree the smallest bounded change without changing production defaults or contacting a real backend.

Deliverable: Baseline evidence and a settled implementation contract for T2.

### T2. Establish the Configuration-only presentation contract

Owner: Primary agent. Depends on: T1. Acceptance: AC1, AC5.

Owned files:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- Temporary integration ownership of `KnowledgeOverviewPanel.tsx` and `KnowledgeModeSurfacePanel.tsx` before they are handed to T3/T4.
- A small local `KnowledgeOverviewArtwork.tsx` helper if shared SVGs warrant one; otherwise keep symbols local to their owning components.

Actions:

- Add an explicit `configuration` presentation value to both panels and opt into it only at the Configuration workspace call site. Preserve the existing default, overview, and procurement-basket branches and labels.
- Freeze the DOM/style hooks before parallel work: a Configuration-only root modifier, field-description and choice-group hooks, dimension information block, surface name/artwork wrapper, distinct edit/remove action hooks, and a decorative backdrop hook.
- Keep native controls and all existing public callbacks. The surface selector remains multi-valued; its state machine and API do not need changes.
- Supply small authored SVG cube, stacked-surface, plus, information, architectural thumbnail, and backdrop shapes as needed. Reuse existing authored edit/remove SVGs. Decoration is non-focusable and hidden from assistive technology.
- Hand off exact prop/class/helper names to the independent slices. Subsequent contract changes return to the primary agent for coordination.

Deliverable: An opt-in presentation boundary with no intended behavior changes, ready for independent component/CSS work.

### T3. Recompose the UOM and settings panel

Owner in Mode A: Frontend implementer for the left panel. In Mode B: Primary agent. Depends on: T2. Acceptance: AC1, AC2, AC4, AC5.

Exclusive files after T2 handoff:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`

Actions:

- Implement the reference hierarchy: icon/title, UOM row, client visibility explanation and Yes/No choices, dimension explanation and choices, unit-aware information block, then tier explanation and checkboxes.
- Preserve every existing change callback, dirty field, default, read-only/saving gate, loading/error/retry state, and unresolved value.
- Keep the accurate totals/PDF caveat visible at least when client visibility is No. Keep dimension guidance tied to the selected UOM, including incompatible retained settings.
- Keep full labels clickable and selected indicators native. Ensure accessible descriptions associate the right help text without duplicating announcements.
- Extend tests only for changed behavior, semantics, or missing regression coverage, retaining current dimension/tier tests. Do not create tests that merely mirror markup or CSS.

Deliverable: Functioning left panel with Configuration-specific markup and focused regression evidence.

### T4. Recompose the Surfaces panel

Owner in Mode A: Frontend implementer for Surfaces. In Mode B: Primary agent. Depends on: T2. Acceptance: AC1, AC3, AC4, AC5.

Exclusive files after T2 handoff:

- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx`

Actions:

- Use the stacked-surface heading, existing Add Surface action, searchable selector, adjacent create shortcut, and semantic table in the reference order.
- Add the small decorative surface illustration without inventing image metadata or matching records by name.
- Expose distinct styling hooks for olive edit and red remove actions. Keep edit scoped to the reusable Surface and remove scoped to the Main Line relationship.
- Preserve selection order, stable IDs, retained inactive/archived/missing selections, empty/loading/stale/error states, read-only access, and create/edit permission gates.
- Add a Configuration presentation regression case and retain alternate-consumer coverage. Do not alter selector keyboard behavior or shared primitives.

Deliverable: Functioning right panel and focused action/permission regression evidence.

### T5. Implement scoped layout and visual styling

Owner in Mode A: Primary agent while T3/T4 run. In Mode B: Primary agent after T3/T4. Depends on: T2. Acceptance: AC1, AC4, AC5.

Exclusive file: `frontend/src/features/ai-estimator-knowledge/knowledge-overview-table.css`.

- Scope every new rule to the opted-in Configuration presentation. Preserve the stylesheet's existing workspace status/save-row rules and alternate consumer styling.
- Implement a roughly 1:2 grid where the content width supports it, natural panel heights, 16–24px gutters, 20–28px desktop panel padding, and a stacked fallback based on usable container width.
- Use existing Poppins typography and locally scoped color tokens for warm off-white panels, olive controls, muted supporting text, neutral table headers, the subdued blue note, and restrained red remove actions.
- Enlarge controls to at least 44px touch targets, including the complete radio/checkbox label area. Add selected, disabled, and focus-visible treatment without hover motion or drop shadows.
- Implement wrapping for long names, action/header controls, and tier options. Keep table semantics and avoid page-level horizontal overflow.
- Position the decorative backdrop without adding artificial page height, intercepting events, or clipping popovers/focus rings. Limit overflow clipping to the artwork layer itself; reduce or hide it on narrow screens.

Deliverable: Scoped responsive styles ready for integrated rendering.

### T6. Integrate and verify functional regressions

Owner: Primary agent. Depends on: T3, T4, T5. Acceptance: AC2, AC3, AC4, AC5, AC6.

- Wait for all assigned writers, inspect each incremental diff against the baseline, and reconcile markup/CSS/API mismatches.
- Exercise UOM changes and creation, visibility choices, supported/unsupported dimension units, tier selection including none, and save/discard/conflict behavior.
- Exercise surface search/select, both create shortcuts, edit, detach, read-only/saving, missing/archived selections, and retry states. Confirm actual callback meaning and focus restoration.
- Run existing focused component and consumer tests. Update existing workspace/layout/proposal tests only if the approved presentation change requires a meaningful new assertion or expectation adjustment.
- Preserve all unrelated dimension/tier navigation logic and retain old presentation defaults for proposal consumers.

Verification commands from `frontend/`:

```sh
npm test -- src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx src/features/ai-estimator-knowledge/KnowledgeSurfaceEditorDialog.test.tsx
npm test -- src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeWorkspaceStatus.test.tsx src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx
```

Deliverable: Integrated working implementation with behavioral regression results.

### T7. Review, rendered QA, and final checks

Owner in Mode A: `integrity_reviewer`, followed by `verification_runner` after review fixes. In Mode B: Primary agent performs both stages inline. Depends on: T6. Acceptance: AC1–AC6.

- Review the completed diff for data/permission preservation, unchanged financial semantics, correct dimension units, tier-save timing, selector/action semantics, and CSS isolation. Reviewers report findings without product edits; the primary agent assigns fixes.
- Inspect the actual rendered workspace at 1920, 1440, 1024, 768, and 390px and at 200% zoom. Record the viewport and usable content width so stacking decisions can be assessed correctly.
- Visually compare the populated state with the supplied reference: panel proportion, natural heights, headings, control size, whitespace, selected states, table alignment, and decoration.
- Check populated, empty, long-name/multiple-surface, loading/error, read-only/saving, unsupported-UOM, and no-tier states. Use representative combinations across widths rather than repeating every state at every width.
- Use keyboard-only interaction for radios/checkboxes, surface search, actions, and dialogs. Run automated accessibility checks and verify contrast/focus/touch targets on the rendered result. The existing surface QA helper disables color-contrast checks, so do not treat that helper as sufficient contrast evidence.
- Inspect one proposal/Procurement Overview and a Mode surface panel for unintended changes; verify the surrounding tabs and status/save row.
- Check browser console/runtime errors and unexpected failed network requests. Use synthetic local fixture transport; no production mutation or seeding.
- If fixture changes are necessary, primary ownership is limited to the appropriate existing files under `frontend/src/test/fixtures/` and `frontend/qa/`; preserve existing states. Keep runtime reports and screenshots under `/tmp/lisno-overview-reference-redesign/`.
- Fix confirmed issues and repeat only the checks affected by each fix. Run final checks on the integrated worktree after writers finish.

Final commands from `frontend/`:

```sh
npm run typecheck
npm run build
```

Final commands from repository root:

```sh
git diff --check
git status --short
```

No repository lint script exists. A full frontend suite is warranted only if unexpected shared-behavior impact is discovered; backend/mobile suites are outside this presentation-only change unless evidence expands the affected scope.

Deliverable: Screenshots and check results mapped to acceptance criteria, with exact commands, any unrun checks or pre-existing failures, remaining limitations, affected files, and temporary artifact paths. Do not call partially verified work complete.

## Safe parallelism

```text
T1 baseline -> T2 contract -> [T3 left panel | T4 Surfaces | T5 CSS]
            -> T6 integration -> T7 review -> fixes -> final verification
```

Only T3, T4, and T5 can run concurrently, after the primary agent freezes the presentation and selector contract. Their file ownership does not overlap. Test results collected during concurrent writes are provisional; final validation runs after integration. In Mode B, run these slices inline in dependency order.

## Acceptance traceability

| Criterion | Implementation | Evidence |
| --- | --- | --- |
| AC1: Reference appearance and responsive layout | T2–T5 | T7 screenshot/viewport/zoom checks |
| AC2: UOM, visibility, dimensions, tiers, save behavior | T3, T6 | Component/workspace tests and rendered interactions |
| AC3: Surface actions and reference states | T4, T6 | Surface/dialog/selector tests and rendered keyboard flows |
| AC4: Accessible semantics and operation | T3–T5 | T6 semantics tests; T7 accessibility, contrast, focus, target checks |
| AC5: Consumer and workspace isolation | T2, T5, T6 | Proposal/workspace tests and alternate-consumer inspection |
| AC6: Integrated engineering verification | T6, T7 | Focused tests, typecheck, build, diff/status review |

## Approval boundary

After task-plan approval, ask for execution mode using the repository's exact required question. Begin implementation only after Mode A or B is selected. This plan grants no authority for external actions or staging/committing changes.


## Final implementation and verification record

Implemented on 2026-10-26 after specification approval, task-plan approval, and Mode A selection.

### Result and files

- `KnowledgeItemWorkspacePage.tsx`: one Configuration presentation opt-in at the Overview call site; existing tier/navigation work preserved.
- `KnowledgeOverviewPanel.tsx`: reference hierarchy, clickable choices, accurate client-visibility caveat, unit-aware dimension note, tiers, and decorative backdrop.
- `KnowledgeModeSurfacePanel.tsx`: Configuration-specific symbols, decorative surface illustration, and olive edit/red detach action treatment; default/Procurement behavior preserved.
- `KnowledgeOverviewArtwork.tsx`: small authored SVGs; no new assets service, image contract, or dependency.
- `knowledge-overview-table.css`: scoped layout, typography, color, control sizing, focus, and content-width breakpoints. Tier labels wrap between whole options.
- `KnowledgeOverviewPanel.test.tsx`, `KnowledgeModeSurfacePanel.test.tsx`: Configuration semantics and behavior regressions. `KnowledgeScreens.test.tsx`: one approved placeholder expectation updated.
- `enterpriseRoutes.ts`, `SurfaceQaPage.tsx`, `surfaceQaEntry.tsx`: opt-in synthetic QA states for populated, retained, read-only, incompatible-UOM, empty, no-tier, loading/error, and alternate-consumer inspection. No real backend writes.

### Automated evidence

- Baseline component run: 50/50 passed before product edits.
- Final eight-suite command listed in T6, combined with `--reporter=json --outputFile=/tmp/lisno-overview-reference-redesign/final-regression.json`: 254 tests, 234 passed, 20 failed.
- Exact failure-name comparison against the isolated pre-task baseline: no new failures. Four existing workspace-layout assertions and sixteen existing screen tests fail in both versions. Detailed reports: `baseline-two-suites.json`, `final-regression.json`, and `final-comparison.json` in the evidence directory.
- The six Overview/Surface/selector/dialog/status/proposal suites are fully green: 120 tests. The broader two suites retain the documented baseline failures.
- `npm run typecheck`: passed. `npm run typecheck && npm run build`: passed sequentially. A final `npm run build` after the CSS zoom refinements also passed, recorded in `final-css-build.log`.
- Build retains the existing warning about chunks larger than 500 kB. No dependency or lockfile change was made.
- `git diff --check`: passed. Final dirty-path set and incremental target diffs inspected; unrelated work retained.

### Rendered evidence

Browser checks used local Chromium and the Vite development server with synthetic fixture transport. These establish layout and interaction, not production performance or physical-device coverage.

- Actual workspace inspected at 1920, 1440, 1024, 768, and 390px; no page-level horizontal overflow. Final screenshots: `final-<width>.png` in the evidence directory.
- Main Overview has two columns at content widths of 1324, 844, and 992px; it stacks at 736 and 326px. These account for changing workspace navigation/rail layouts.
- Populated, retained/long-name, read-only, unsupported-UOM, empty, and no-tier states: zero automated axe violations, zero unexpected fixture requests, and zero captured render errors. Enabled Overview buttons and choice labels measured at least 44px high. Details in `state-qa.log`.
- Loading/error controls and retry actions inspected; proposal Overview and Mode surfaces retain their original presentation, with no Configuration modifier. Alternate fixture screenshots: `final-overview-procurement.png`, `final-overview-error.png`.
- Browser keyboard checks passed for client visibility, dimensions, tiers, surface search/selection, Escape, and focus restoration after both Surface-create shortcuts, Surface editing, and UOM creation. A simulated save failure retained the edited metric UOM and tier choices. Successful save/CAS flows were verified through existing workspace tests; fixture writes intentionally fail.
- Reduced-motion selector interaction passed. Zoom investigation used CSS zoom at 200%, then a 200%-equivalent reflow viewport (960 CSS px at DPR 2, producing a 1920px image); the latter had no overflow or axe violations. Native browser-toolbar zoom and physical mobile hardware were not tested. Evidence: `reflow-200-equivalent.png` and `final-browser.log`.
- Final clean populated browser session had no console errors or warnings. Screenshots were inspected as images, not merely generated.

### Limits and external actions

The regression suite is not fully green because of the 20 reproducible pre-existing failures. Full frontend/backend/mobile/OCR suites were not run; no backend/shared contract was changed. No lint script exists. No migration, seed, commit, push, deployment, production mutation, or external communication was performed. Ignored build output is under `frontend/dist/`; temporary QA evidence is under `/tmp/lisno-overview-reference-redesign/`.
