# Procurement basket panels: reference implementation plan

Date: 2026-10-12
Status: Implemented and verified on 2026-10-12 in approved Mode A; two pre-existing limitations are documented below.
Source of truth: [Approved specification](../specs/2026-10-12-procurement-basket-panels-reference-design.md).

## Outcome and boundaries

Match both Procurement basket panel types to the supplied reference: compact header, basket identity/status strip, enclosed hierarchy, selected Main Line, section tabs and PMC/Execution presentation. Include initial name-entry forms, responsive layouts and existing read-only states.

Preserve Super Admin Configuration and review, current editor capabilities, formulas, saved values, API calls, dirty-state guards, submission closure and vendor draft retention. Vendor name stays absent. Scope is frontend presentation; no backend, database, dependency, lockfile or deployment work.

## Agreed implementation contract

- Use `.basket-proposal--procurement-reference` as the common presentation modifier for Procurement Main Basket and Sub-Basket workspaces and creation forms. Keep `.basket-proposal` and existing shared semantic classes intact. An optional creation-form modifier may distinguish the name-entry layout.
- Apply the modifier from the actual Procurement scope. Never apply it to the Super Admin review workspace or impersonate app-shell role/Configuration ancestry across portals.
- Replace the old Main-Basket-only CSS selector within `procurement-main-basket.css`; retain the file path to avoid unnecessary file churn. Add a separate scoped mode stylesheet only for the substantial mode/calculation rules. Load both through the proposal components so cold entry works.
- JSX ownership stays with the primary integrator: conditional Procurement summary content, actual status badge, parent context, save feedback, local SVG symbols, hierarchy actions and shared-editor presentation props. Retain the existing default Super Admin markup and handlers.
- CSS uses existing interface typography, neutral/green tokens and the specific cues in the screenshot. Desktop width remains 70vw at 1200px and above, with full width below. Aim for a 20–25% hierarchy column with a usable minimum; adapt to actual panel width.
- Shared editor state, calculations, data sources and public props remain unchanged unless an optional presentation hook is necessary. Such hooks default to existing output. No new icons package, font or image asset is required.
- Active tab reflects displayed content. Mode content remains under Mode despite the screenshot's highlighted Overview label.

## Dependency-ordered tasks

### 1. Capture a current baseline and settle presentation hooks

Owner: primary. Dependencies: task-plan approval and execution-mode selection.

- Record dirty paths, relevant target diffs and snapshots of untracked proposal files before assigning writers. Preserve all prior work.
- Capture same-content baseline screenshots of Procurement Main Basket, Procurement Sub-Basket, ordinary Configuration and Super Admin review using temporary fixtures. Do not use configured local/production data.
- Confirm the available shared mode markup and freeze the common modifier, summary/status and icon hooks for the implementation slices below.
- Record current frontend test/build constraints. Historical passing counts are context only.

Acceptance: baseline and ownership are explicit; new selectors cannot unintentionally reach Configuration or review. Traces to AC4 and AC7.

### 2. Implement the Procurement presentation

Owner: primary for integration, with the independent CSS slices below available in Mode A. Dependency: task 1. This is the sole implementation parent task in progress.

**2A. Semantic markup and entry points, primary-owned**

Files:

- `frontend/src/features/vendor-basket-proposals/ProposalWorkspace.tsx`
- `frontend/src/features/vendor-basket-proposals/CreateProposalPanel.tsx`
- A small proposal-local SVG helper only if needed to avoid repeated markup.

Changes:

- Apply one Procurement presentation to both targets and the initial forms.
- Recompose the summary with actual basket name, status badge, Sub-Basket parent context, truthful save feedback and refresh/edit actions.
- Add the reference's basket, document, edit, delete, refresh and add symbols using local/existing SVG primitives.
- Preserve all current action names/handlers, capabilities, disabled states, query/mutation paths and save-versus-submit behavior.
- Keep the hierarchy, selected line toolbar and tabs semantic; retain UOM/surface creation and inherited quality rules.
- Keep Super Admin rendering unchanged. Any required optional shared presentation hook remains primary-owned and is announced before editing.

Acceptance: both targets and creation forms use the same visual structure; no Vendor name or fabricated saved state; current business behavior remains intact. Traces to AC1–AC4 and AC6.

**2B. Panel, summary, hierarchy and tab CSS, separate frontend owner in Mode A**

File: `frontend/src/features/vendor-basket-proposals/procurement-main-basket.css` only.

- Generalize existing Main-Basket-specific selectors to the agreed modifier.
- Implement header/summary proportions, status treatment, enclosed hierarchy, selected line, dashed add actions, line toolbar, tabs, initial form and footer framing.
- Give Overview, Recommendations and Quality consistent spacing without altering shared/global selectors.
- Add responsive rules and long-name wrapping. Preserve visible keyboard focus and readable status text.
- Do not edit JSX, generic `proposal.css`, shared Configuration CSS or mode/calculation rules owned by 2C.

Acceptance: reference-like composition at comparable wide panel dimensions, 70% desktop width, no unintended overflow and no changes outside the modifier. Traces to AC1, AC2, AC4 and AC5.

**2C. Mode/calculation CSS, separate frontend owner in Mode A**

File: new `frontend/src/features/vendor-basket-proposals/procurement-basket-mode.css` only, imported by the primary integrator.

- Scope every rule beneath the agreed Procurement modifier and the mode/calculation components.
- Match section-version row, mode choices, PMC/Execution headers, description/edit row, management-fee tag, disclosure and calculation/test controls.
- Retain native selection semantics, all existing mode variants and financial inputs. Style existing content rather than copying the editor into the proposal feature.
- Support narrow panels and long descriptions, with constrained table scrolling where necessary.
- Request any necessary markup hook from the primary; do not modify shared financial/editor logic or another writer's file.

Acceptance: both target types show the intended Mode presentation on cold Procurement entry; content and calculations remain functional. Traces to AC1, AC3–AC6.

### 3. Add focused regression coverage and review the integrated result

Owner: primary, then independent `integrity_reviewer` in Mode A. Dependencies: all task 2 writers finished.

Affected tests:

- `ProposalWorkspace.test.tsx`: replace old assertions excluding Sub-Baskets; cover both Procurement targets, actual status/save state, accessible icons/actions, preserved Super Admin presentation and inherited-quality capabilities.
- `CreateProposalPanel.test.tsx`: preserve vendorless input/payload, initial form semantics, validation and retry behavior for both targets.
- Existing mode, Overview and surface suites: run relevant regressions; add tests only for a changed interaction or optional presentation hook, not to mirror CSS declarations.
- Existing request-completion/draft-retention suites: rerun the focused flows affected by moved controls.

Review selectors/imports and final changes against the baseline. Check for shared-style leakage, hidden controls, duplicate status announcements, stale or invented saved feedback, inaccessible native controls, changed financial calculations and lost save/submit guards. Resolve concrete findings before final verification.

Acceptance: meaningful behavior checks pass and no material review findings remain. Traces to AC3, AC4, AC6 and AC7.

### 4. Verify rendering, accessibility and builds

Owner: primary for browser fidelity; `verification_runner` for final integrated checks in Mode A. Dependency: task 3 fixes complete and writers idle.

Frontend commands, starting with the affected suites:

```sh
cd frontend
npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/vendor-basket-proposals/CreateProposalPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/procurement/VendorDirectory.test.tsx
npm run typecheck
npm run build
```

Run additional affected shared-editor tests only if those components change or an unresolved failure warrants them. No lint script exists. Backend/OCR/full suites are not required for unchanged contracts and data paths.

Browser matrix:

| Surface | Required coverage |
| --- | --- |
| Procurement Main Basket and Sub-Basket | Initial forms; saved Overview and Mode at 1920, 1440, 1024, 768 and 390px; comparable wide screenshots against the supplied image |
| Hierarchy | Empty, selected line, several children, long names; add/edit/remove using existing guards |
| Mode | PMC and Execution selection; expand/collapse; description edit; calculation inputs and Test calculations; narrow-width layout |
| Other sections | UOM/surface creation, Recommendations and Quality; inherited Sub-Basket quality remains read-only |
| Lifecycle | Loading, error/retry, dirty navigation, save, refresh, pending/rejected read-only, confirmed submission closure and vendor draft resume |
| Isolation | Same-viewport before/after ordinary Configuration and Super Admin review; cold Procurement entry without loading Configuration |

Inspect screenshots as images. Measure panel width and page overflow, inspect footer reachability and console/network errors, and exercise keyboard tab navigation, close/focus return and selection controls. Run rendered accessibility checks and distinguish changed-surface findings from existing app-shell issues.

Use disposable fixtures or mocked test endpoints. Starting a configured backend is not required and must not trigger bootstrap, sync or database changes. Capture final screenshots only after writers finish to avoid HMR invalidating the flow. Keep artifacts temporary and outside tracked source.

Acceptance: AC1–AC7 have concrete test or browser evidence; failures are resolved or clearly reported without calling partially verified work complete.

### 5. Final reconciliation and handoff

Owner: primary. Dependency: task 4.

- Run repository-root `git diff --check` and `git status --short`; compare changed paths with the captured baseline.
- Record exact passing/failing/unrun checks, screenshots, material limitations and affected files in this plan.
- Report the visible changes and preservation of existing Configuration, approval and local data behavior. No commits, pushes or deployment.

## Execution and parallel safety

The user selected Mode A after approving this plan. Panel CSS, Mode CSS and focused tests have separate owners; the primary owns JSX, integration and browser verification.

In Mode A, task 1 stays primary-owned. Tasks 2A, 2B and 2C may run in parallel after hooks are fixed because they have disjoint files. Each writer receives the dirty-file baseline, exact ownership and instruction not to revert others. Task 3 review follows all writers; task 4 final verification follows review fixes. In Mode B, the primary performs the same tasks sequentially without implementation subagents.

Do not parallelize final verification with source edits. Do not assign dirty shared component files without first understanding their existing changes. If implementation needs an optional shared presentation prop, the primary owns that edit, communicates the contract and runs its default-presentation regressions.

## Acceptance mapping

| Criterion | Tasks and evidence |
| --- | --- |
| AC1 Reference composition for both saved workspaces | 2A–2C, wide screenshots and Mode interactions in 4 |
| AC2 Matching initial forms, no Vendor name | 2A–2B, creation tests and screenshots |
| AC3 Existing controls and workflow preserved | 2A, focused regression tests and lifecycle browser checks |
| AC4 Configuration/review/parent quality preserved | Baseline in 1, negative scope tests and review in 3, visual comparisons in 4 |
| AC5 Responsive/keyboard/70% width | 2B–2C, five-width browser matrix and accessibility checks |
| AC6 Truthful status and save feedback | Existing computed state retained in 2A, loading/dirty/error/read-only tests in 3–4 |
| AC7 Evidence, clean scope and preserved data | 1, integrated checks in 4, final reconciliation in 5 |

## Execution record

- Baseline status, diff, SHA-256 source manifest and a full frontend/shared snapshot saved before writers started at `/var/folders/8j/zd 8v 148d 3qs 4hdqtz 2sncbjm 0000gn/T/lisno-basket-panel-reference-pd 52lwcm`. Baseline browser rendering will use that immutable copy while current-source work proceeds.
- Tasks 1–5 completed. File ownership followed 2A–2C; the test writer owned ProposalWorkspace/CreateProposalPanel tests. The primary added focused assertions to existing ProposalMasters coverage after integrity review.


## Final implementation and verification receipt

### Delivered

Both Procurement targets and their creation forms use one scoped presentation. Summary identity/status, parent context, hierarchy, line toolbar, tabs, Overview and Mode follow the supplied composition. Saved/loading/dirty/error feedback remains derived from actual state. Operation notices, including the instruction to save a newly selected UOM/Surface, remain visible while dirty.

The user's compact typography clarification is implemented: desktop panel heading at most 28px, basket name 20px, selected Main Line 18px; body/control text remains 13–14px. Desktop drawers retain 70vw and switch to full width below 1200px. Hierarchy stacks when the usable panel is narrow. No dependency or shared-editor source changes.

Changed product/test files (all under `frontend/src/features/vendor-basket-proposals/`):

- `ProposalWorkspace.tsx`, `CreateProposalPanel.tsx`, new `ProposalPresentationIcon.tsx`.
- `procurement-main-basket.css`, new `procurement-basket-mode.css`.
- `ProposalWorkspace.test.tsx`, `CreateProposalPanel.test.tsx`, `ProposalMasters.test.tsx`.

Independent integrity review found one hidden operation-notice regression; fixed and covered by existing both-target quick-add tests. Final review reported no actionable findings. Browser testing exposed expensive intrinsic grid sizing when expanding Execution/In-house on mobile; explicit single-column tracks on five Procurement Mode ancestors corrected it. Final interaction timings for the two toggles were 107ms/108ms for Main/Sub-Basket in the fixture browser. Hidden/collapsed semantics and detailed financial grids were preserved.

### Automated checks

Final focused command from `frontend/`:

```sh
npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx src/features/vendor-basket-proposals/CreateProposalPanel.test.tsx src/features/vendor-basket-proposals/ProposalMasters.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModePanelPendingChanges.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeConfigurationBuilder.test.tsx src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSurfacePanel.test.tsx src/features/procurement/VendorDirectory.test.tsx
npm run typecheck
npm run build
```

- Focused suite: 170 passed,1 failed;8 files fully passed. Workspace 33, Creation 4, Masters 15, VendorDirectory 27, Overview 19, Mode Surface 18, pending changes 22, configuration builder 23 all passed. Nine of 10 Mode Layout tests passed.
- The failure at `KnowledgeModeLayout.test.tsx: 312` expects a grid declaration while unchanged shared CSS uses responsive flex. The failing test reproduces in the immutable baseline; source/test hashes match. No unrelated shared Configuration change was made to satisfy this stale assertion.
- Typecheck:exit 0. Final build after the CSS correction:exit 0, Vite 8.79s. Existing chunk-size warnings remain.
- Root `git diff --check`:exit 0. No lint script exists. Backend/OCR/full suites were not run for this frontend presentation-only change.
- Logs:`/tmp/lisno-basket-panels-final-{focused,baseline-regression,typecheck,build,diff-check,status}.log`.

### Rendered evidence

Disposable Mongo replica-set fixture server with actual proposal/reference routes and both immutable-baseline/current frontend roots. No configured local or production database was used.

- Final 24-state matrix:Main/Sub × Overview/Mode × 1920, 1440, 1024, 768, 390px, plus each target's expanded Execution/In-house at 390 and 1920px.
- All 24 states had no page overflow or browser JavaScript errors. Drawer widths were 1344/1008/1024/768/390px respectively. Cold Procurement entry never loaded the Configuration workspace module.
- Initial Main/Sub forms at 1920/390px:Vendor name absent, no overflow, axe 0 violations. Saved mobile Mode, inherited quality, and expanded desktop Mode also reported axe 0.
- Visual inspection covered wide reference composition,1440px density,390px Mode/calculation scrolling, both creation forms and long names.
- Real disposable API flow:created a vendor-free Sub-Basket, added a long-named Main Line, added UOM and Surface, preserved the selection-save guidance while dirty, saved Overview, and checked the long-name mobile layout.
- Rendered controls:keyboard tab navigation to Mode; PMC collapse/expand; description edit/cancel; PMC/Execution/In-house visibility; rate input creates unsaved state; tab navigation prompts Save/Discard; discard restores navigation; inherited Sub-Basket quality has no Add Parameter action.
- Pending request displays Awaiting Super Admin with no Edit Main Line/Add UOM controls. Loading/error/retry/rejected states, submit closure and retained vendor draft are covered by the passing focused suites.
- Same-content 1920px Configuration and Super Admin review screenshots compared pixel-identical using Pillow from the existing OCR virtual environment.
- Screenshots and fixture entry were moved out of the repository to `/tmp/lisno-basket-panels-browser-evidence`. Temporary browser sessions and QA server were stopped; disposable database removed by fixture shutdown. Ignored build output remains in `frontend/dist`.

### Known pre-existing limits

1. The stale shared Mode Layout assertion described above prevents claiming an entirely green focused run.
2. Procurement's existing Test calculations dialog opens, but its preview request to `/admin/ai-estimator-knowledge/preview` returns 403 FORBIDDEN. The same interaction and response reproduce in the immutable baseline. Simulator API authorization was not changed by this scoped visual task; a successful Procurement simulator result is not claimed.

No migrations, seeds, sync, configured database mutations, commits, pushes, deployments or external messages were performed. Previous dirty files were compared against the initial SHA-256 manifest; only the eight scoped product/test files and these two working documents changed.


### Follow-up: remove the redundant Add Sub-Basket action

User clarification on 2026-10-12: do not show Add Sub-Basket again inside the configured Procurement panel. The button is now absent once its loaded hierarchy has a Sub-Basket; an empty Main Basket draft retains first-child creation. Add Main Line, existing editing/removal, and Super Admin's Add Sub-Basket remain unchanged. Only ProposalWorkspace and its existing rendered tests change. Verification covers populated Procurement, empty draft and Super Admin visibility; results recorded below.

Follow-up checks: `npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` passed 33/33 rendered tests; `npm run typecheck` and `git diff --check` passed. Full build/browser matrix were not repeated for this localized visibility condition. No backend, shared Configuration, data or dependency changes.


### Follow-up: defer Sub-Basket Quality Parameters until a Main Line exists

User clarification on 2026-10-12: Procurement Configure Sub-Basket must not show Quality Parameters until a Main Line is added. Removed the Procurement empty-state inherited-quality component; existing Main Line quality-tab behavior and Super Admin empty-state quality review are unchanged. Parent shared quality and request submission rules are unchanged.

Only `ProposalWorkspace.tsx` and its existing test file changed. Rendered coverage verifies no inherited-quality request or section before a line, actual first-line creation followed by read-only quality through its tab, loading/error states after opening that tab, and preserved Super Admin empty-state review. `npm test -- src/features/vendor-basket-proposals/ProposalWorkspace.test.tsx` passed 34/34; `npm run typecheck` and `git diff --check` passed. Full build/browser matrix were not repeated for this localized visibility change. No backend, data, dependency or shared Configuration changes.
