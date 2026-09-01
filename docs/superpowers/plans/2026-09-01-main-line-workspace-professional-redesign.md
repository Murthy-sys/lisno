# Super Admin Main Line workspace professional redesign task plan

**Status:** Awaiting task-plan approval  
**Date:** 2026-09-01  
**Approved specification:**
[`2026-09-01-main-line-workspace-professional-redesign-design.md`](../specs/2026-09-01-main-line-workspace-professional-redesign-design.md)

## 1. Objective

Implement the approved frontend-only professional redesign of Configuration →
Main Basket → Main Line while preserving all existing data, authorization,
version/CAS, activation, configured-only Overview, and revision-history
contracts.

The integrated result must provide:

- one dominant Main Line identity;
- distinct configuration-completeness and activation-status presentation;
- one Save control for the active editable context;
- an aligned tab/command/editor workspace;
- a wide-desktop Revision history rail that collapses below the editor;
- compact Main Line context inside Overview without repeated revision metadata;
- human-readable conflict review without raw JSON or stable IDs; and
- verified responsive, interaction, accessibility, and dirty-worktree safety.

## 2. Baseline and constraints

### Current verified baseline

Before implementation, the focused lane passes:

```text
KnowledgeItemWorkspaceLayout.test.tsx   6
KnowledgeOverviewPanel.test.tsx        14
KnowledgeScreens.test.tsx              34
Total                                  54 tests passed
```

The previous integrated frontend baseline also passed typecheck, 1,322 full
tests, and production build. Those historical counts are context only; the
implementation must record fresh final results.

### Dirty-worktree contract

The repository is already broadly dirty. In-scope tracked files already contain
approved prior work, and several in-scope files/tests are untracked. Before any
writer starts:

1. capture `git status --short`;
2. capture each assigned tracked target's current diff;
3. read each assigned untracked target in full;
4. confirm exclusive ownership for the current implementation run; and
5. never revert, reformat, stage, or overwrite unrelated changes.

The primary agent owns reconciliation and may stop/reassign a slice if a target
has changed unexpectedly.

### Fixed technical boundaries

- Frontend-only implementation.
- No backend, OpenAPI, model, route, service, schema, migration, seed, or data
  rewrite.
- No shared primitive modification unless an evidenced primitive defect is
  reported to the primary agent and the specification is updated if necessary.
- No dependency or lockfile change.
- No commit, push, deployment, production mutation, or external communication.
- Backend values remain authoritative for completeness, blockers, warnings,
  revisions, status, permissions, and `allowedActions`.
- Existing stable IDs, item/section query keys, cache synchronization, audit,
  aggregate version, section version, and conflict rules remain unchanged.

## 3. Ownership boundaries

| Slice | Owner | Exclusive write boundary |
|---|---|---|
| Contract/integration | Primary agent | Approved spec, this plan, cross-slice class/prop contracts, final reconciliation |
| Workspace/workflow | Frontend implementation owner A | `KnowledgeItemWorkspacePage.tsx`, `KnowledgeModePanel.tsx`, new workspace/conflict presentational components, `KnowledgeScreens.test.tsx`, direct new component tests |
| Overview | Frontend implementation owner B | `KnowledgeOverviewPanel.tsx`, `KnowledgeOverviewPanel.test.tsx` |
| Navigation | Frontend implementation owner C | `KnowledgeSectionNavigation.tsx`, `KnowledgeFoundation.test.tsx` |
| Visual system | Frontend implementation owner D or primary agent | `ai-estimator-knowledge.css`, `KnowledgeItemWorkspaceLayout.test.tsx` |
| Integrity review | `integrity_reviewer` | Read-only integrated review after all writers finish |
| Final verification | `verification_runner` | Read-only commands/inspection after integrity findings are resolved |

Shared `PageHeader.tsx`, `Surface.tsx`, `Button.tsx`, `Field.tsx`, primitive CSS,
role-theme CSS, API/query files, and backend files remain read-only.

## 4. Shared implementation contract

The primary agent settles and communicates this contract before writers edit:

### Workspace DOM/class contract

- `.knowledge-page--item-workspace`: uses the existing shell wide measure.
- `.knowledge-workspace-status`: full-width configuration/activation strip.
- `.knowledge-workspace-layout`: wide-desktop main/rail grid.
- `.knowledge-workspace-main`: navigation, command bar, and active panel.
- `.knowledge-workspace-history-rail`: Revision history semantic section.
- `.knowledge-section-command-bar`: the sole active-context Save location.
- `.knowledge-overview__context`: compact Main Line/Main Basket line.

Writers may refine names only through the primary agent before the CSS slice
starts.

### Display-state contract

- Completeness label comes from `item.completeness.percentage`.
- Activation label is presentational only:
  - blockers > 0 → `Blocked · N blocker(s)`;
  - no blockers and warnings > 0 → `Ready with N warning(s)`;
  - no blockers/warnings → `Ready to activate`.
- Lifecycle actions still require permission plus exact backend
  `allowedActions` membership.
- Blocked Draft activation action label is `Review activation`; otherwise
  `Review and activate`.
- Save is absent from PageHeader and present exactly once in the active-section
  command bar when editable.
- Standard save label is section-specific, for example `Save Overview`.
- Mode label remains `Save Mode`, and ordered Pricing → Quantity & margin
  semantics remain unchanged.
- Read-only/archived active contexts show `Read-only revision` and no Save.

### Responsive contract

- Wide desktop: `minmax(0, 1fr)` main column plus approximately `18rem` history
  rail in logical DOM order main then history.
- Below the wide-layout breakpoint: history follows the workspace in one
  column.
- At `768px` and below: labelled Configuration section select replaces tabs.
- At `390px` and `320px`: one column, static command bar, full-width prioritized
  page actions, minimum 44px targets, no page-level horizontal overflow.

### Conflict-review contract

- Local edits remain mounted and unchanged.
- Latest server values use the owning read-only section presentation.
- Overview conflict comparison shows only professionally labelled editable
  values needed for review, not hidden compatibility JSON.
- Mode conflict review remains attributed to Pricing or Quantity & margin.
- Versions remain visible in the conflict context.
- No raw JSON, raw stable IDs, actor IDs, or automatic replay.

## 5. Dependency-ordered task graph

### Task 0 — Lock baseline, targets, and class/prop contract

**Owner:** Primary agent  
**Dependencies:** Approved specification and approved task plan  
**Acceptance criteria:** Supports AC 18–19 and dirty-worktree constraints

Steps:

1. Capture current dirty-path set and per-target baseline evidence.
2. Re-run the focused 54-test baseline if the worktree changed since planning.
3. Record the shared DOM/class, action-label, status-label, breakpoint, and
   conflict-review contracts from Section 4.
4. Assign exclusive writer ownership.
5. Confirm that no in-scope file has an unknown concurrent owner.

Verification:

- `git status --short`
- relevant per-target `git diff -- ...`
- focused baseline when required

Stop/report conditions:

- unexpected conflicting writes;
- a required shared primitive or backend contract change;
- a material deviation from the approved history-rail or one-save design.

### Task 1 — Build the professional workspace shell and one-save workflow

**Owner:** Frontend implementation owner A  
**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeModePanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx`
- new presentational component/test files under the same feature only when they
  reduce page complexity, such as:
  - `KnowledgeWorkspaceStatus.tsx`
  - `KnowledgeRevisionHistory.tsx`
  - `KnowledgeSectionCommandBar.tsx`
  - `KnowledgeConflictReview.tsx`

**Dependencies:** Task 0 contract  
**Acceptance criteria:** AC 1–7, 11–14, 18

Implementation steps:

1. Keep PageHeader as the one `h1` identity source and update exact breadcrumb,
   eyebrow, status metadata, and lifecycle/object action order.
2. Remove active-section Save from PageHeader.
3. Use blockers only to change the activation-review display label; do not
   change `allowedActions` or lifecycle mutation behavior.
4. Replace the current summary strip with configuration completeness,
   activation status, Editing/Viewing revision, and Active revision.
5. Introduce the workspace main/rail semantic wrapper in logical DOM order.
6. Move Revision history into a reusable local-boundary component with loading,
   empty, populated, and retryable error states.
7. Introduce one active-section command bar for standard and Mode contexts.
8. Keep standard section save/CAS, Mode ordered multi-section save, partial
   failure, conflict, dirty guard, announcements, and read-only behavior exact.
9. Retain Mode per-block version/dirty/error metadata without adding another
   Save control.
10. Replace raw `<pre>` conflict payloads in standard and Mode sections with the
    shared human-readable read-only conflict presentation.
11. Preserve the current cached section queries, Overview query composition,
    mutation synchronization, and lifecycle dialogs.

Focused tests:

- one `h1` and one PageHeader identity;
- action labels/order for blocked, warning-only, ready, active, and archived
  fixtures;
- authorization + `allowedActions` asymmetric fixtures;
- status strip percentage/blocker/warning/revision combinations;
- exactly one standard Save and one Mode Save in clean/dirty/saving/error states;
- standard exact section/aggregate CAS;
- Mode Pricing → Quantity & margin save order, partial failure, retry, conflict,
  and discard behavior;
- dirty navigation guard and focus restoration;
- history loading/empty/populated/error/retry;
- conflict review has labelled fields and contains no raw JSON/private IDs;
- active/read-only/archived mutation omission;
- axe for workspace chrome and conflict states.

Stop/report conditions:

- any need to alter API/query/mutation contracts;
- inability to present a section conflict without exposing raw identifiers;
- need to write CSS or Overview/navigation-owned files before their owner hands
  off.

### Task 2 — Professionalize Overview without changing configured-only behavior

**Owner:** Frontend implementation owner B  
**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx`

**Dependencies:** Task 0 contract; may run in parallel with Tasks 1 and 3  
**Acceptance criteria:** AC 2–3, 9–10, 14, 16–18

Implementation steps:

1. Replace the current Main Line identity Surface with the approved compact
   `.knowledge-overview__context` line.
2. Remove Overview revision/status/completeness duplication.
3. Update exact helper/field/quick-add copy:
   - `Configured values`
   - `Reusable values for this Main Line.`
   - `Unit of measure (UOM)`
   - `Surfaces`
   - `Add unit of measure`
4. Keep UOM/Surfaces editable and always present, including empty state.
5. Preserve payload merge, hidden compatibility fields, dirty tracking, quick
   add, unresolved IDs, source-specific retry, and read-only behavior.
6. Preserve all configured-only summary visibility, `0`/`false`, stable partial
   rows, literal `Not configured`, price metadata, Mode radio, dropdowns, and
   guarded Open actions.
7. Add component semantics/classes needed by the CSS owner without adding
   visual implementation outside this ownership boundary.

Focused tests:

- compact identity contains Main Line/Basket once and no revision metadata;
- empty Overview contains context, UOM, Surfaces only;
- configured-only populated/empty/error/loading/reference states remain exact;
- UOM/Surface edit, hidden-payload preservation, quick-add, and read-only paths;
- no raw IDs, no empty `<dl>`, saved `0`/`false`, and literal text preservation;
- axe for empty, populated, read-only, and failed-reference shapes.

Stop/report conditions:

- any projection/API/persistence change;
- any need to modify workspace, navigation, CSS, or shared primitive files.

### Task 3 — Preserve navigation semantics and adopt the tablet selector

**Owner:** Frontend implementation owner C  
**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/KnowledgeSectionNavigation.tsx`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx`

**Dependencies:** Task 0 contract; may run in parallel with Tasks 1 and 2  
**Acceptance criteria:** AC 8, 15–16, 18

Implementation steps:

1. Preserve tablist/tab/tabpanel ownership, IDs, `aria-controls`,
   `aria-labelledby`, `aria-selected`, roving `tabIndex`, and panel `aria-busy`.
2. Preserve Arrow Left/Right, Home, End, wraparound, disabled-section skipping,
   selected-tab focus, and declined-navigation focus restoration.
3. Add only the structural hook needed for full-main-column tabs and an
   overflow cue above the selector breakpoint, if required by the shared class
   contract.
4. Keep the existing labelled Configuration section select and its disabled
   options; CSS controls the `768px` switch.

Focused tests:

- keyboard matrix;
- active panel association;
- busy state;
- disabled section behavior;
- mobile/select option order and selection;
- accessible names and axe.

Stop/report conditions:

- any save/guard behavior change;
- any CSS or workspace file edit;
- any altered section ordering or labels not approved in the specification.

### Task 4 — Implement the aligned visual system and responsive history rail

**Owner:** Frontend implementation owner D or primary agent  
**Exclusive files:**

- `frontend/src/features/ai-estimator-knowledge/ai-estimator-knowledge.css`
- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx`

**Dependencies:** Tasks 1–3 DOM/class contracts complete  
**Acceptance criteria:** AC 1, 5–6, 8, 10–12, 15–17, 19

Implementation steps:

1. Remove the item-workspace Overview `72rem` cap and `max-content` tab deck
   contract.
2. Align masthead, notice, status strip, workspace grid, and history to the
   shell's existing wide measure without changing shell CSS.
3. Implement the wide main/history grid and one-column fallback.
4. Make the tab rail share the main-column width and retain overflow safety/cue.
5. Establish restrained surface hierarchy: one principal editor surface,
   compact status band, secondary history treatment, and no redundant nested
   identity card.
6. Style the command bar, save states, version metadata, local errors, and
   read-only label without negative-margin dominance.
7. Align UOM and Surfaces geometry and every hover/focus/disabled/error/read-only
   state under the exact Super Admin workspace scope.
8. Implement required breakpoints: wide rail, 1024 one-column body, 768 selector
   and stacked Overview controls, 390/320 mobile action and wrapping rules.
9. Preserve 44px coarse-pointer targets, focus ring, contrast token use,
   reduced-motion rules, and no page overflow.
10. Update static layout contract tests so they assert the approved design, not
    the screenshot-producing cap/deck.

Focused tests/inspection:

- CSS selector/property contracts for grid, alignment, breakpoints, and target
  sizes;
- specificity comparison against later role-theme rules;
- no deleted shared primitive selector assumptions;
- real rendered viewport matrix when a browser is available.

Stop/report conditions:

- any shared shell/primitive/role-theme write requirement;
- computed contrast failure requiring token-contract expansion;
- wide-rail layout that changes logical DOM reading order.

### Task 5 — Integrate and reconcile cross-slice behavior

**Owner:** Primary agent  
**Dependencies:** Tasks 1–4 complete  
**Acceptance criteria:** All

Steps:

1. Inspect every final target and diff against the captured baseline.
2. Reconcile class, prop, label, test-fixture, and breakpoint differences.
3. Confirm no writer crossed ownership boundaries or modified unrelated work.
4. Run the combined focused lane.
5. Exercise the supplied empty-Draft screenshot state and asymmetric populated,
   read-only, blocked, warning-only, ready, loading, error, and conflict states.
6. Attempt in-app browser viewport inspection. Do not substitute a different
   browser-control surface if no browser is connected; record the blind spot.
7. Resolve integration defects before integrity review.

Combined focused command:

```bash
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx
```

Also run:

```bash
cd frontend && npm run typecheck
git diff --check
```

### Task 6 — Integrity review

**Owner:** `integrity_reviewer`  
**Dependencies:** Integrated writers complete and focused checks pass  
**Mode:** Read-only

Review matrix:

- authorization and `allowedActions` parity;
- section and aggregate CAS lineage;
- Mode ordered save/partial failure/conflict behavior;
- dirty navigation and focus restoration;
- configured-only Overview and reference-source behavior;
- completeness versus activation-label accuracy;
- history records/order/local failure boundary;
- raw ID/JSON/data disclosure;
- query/cache invalidation and stale-state behavior;
- accessible heading/landmark/live-region/focus semantics;
- responsive logical order and shared-primitive isolation;
- unrelated dirty-work preservation.

All confirmed findings are resolved before Task 7. The reviewer does not edit.

### Task 7 — Independent verification

**Owner:** `verification_runner`  
**Dependencies:** Integrity review clear  
**Mode:** Read-only

Required commands:

```bash
cd frontend && npm test -- \
  src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeOverviewPanel.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeFoundation.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx \
  src/features/ai-estimator-knowledge/KnowledgeSurfaceMultiSelect.test.tsx
cd frontend && npm run typecheck
cd frontend && npm test
cd frontend && npm run build
git diff --check
git status --short
```

Required rendered inspection when the in-app browser is available:

- widths: 1440, 1024, 768, 390, 320;
- states: empty Draft, populated Draft, dirty, saving, blocked activation,
  warning-only, ready, read-only Active, archived, section error, history error,
  conflict review;
- inspect page horizontal overflow, main/rail placement, action priority,
  focus visibility, sticky behavior, long text wrapping, touch targets, and
  contrast.

If no browser is connected, report viewport visual QA as unrun. Rendered
interaction and axe tests remain required but are not represented as a real
layout substitute.

## 6. Safe parallel-execution graph

```text
Task 0: contract/baseline
        │
        ├── Task 1: workspace/workflow ─┐
        ├── Task 2: Overview ──────────┼── Task 4: CSS/layout
        └── Task 3: navigation ────────┘
                                      │
                              Task 5: integration
                                      │
                              Task 6: integrity
                                      │
                              Task 7: verification
```

Parallel safety rules:

- Tasks 1, 2, and 3 may run concurrently only after Task 0 freezes their shared
  contract.
- Task 4 must wait for the final DOM/classes from Tasks 1–3.
- Tests remain owned with their production slice; no two writers edit the same
  test file.
- Tests run during concurrent edits are provisional. Only Task 5's integrated
  run and Task 7's independent run count as final evidence.
- Integrity and verification are always sequential.

## 7. Acceptance-criteria traceability

| AC | Implementation tasks | Primary evidence |
|---|---|---|
| 1 aligned shell regions | 1, 4 | layout contract + 1440/1024 visual inspection |
| 2 one `h1`, compact Overview identity | 1, 2 | route/component heading and text-count assertions |
| 3 no Overview revision duplication | 2 | Overview empty/populated tests |
| 4 completeness vs activation | 1 | asymmetric blocker/warning fixtures |
| 5 lifecycle-only header actions | 1 | permission/allowed-action route matrix |
| 6 one Save control/states | 1 | clean/dirty/saving/error/read-only standard + Mode tests |
| 7 CAS/Mode save semantics | 1 | exact mutation/version/order/partial-failure tests |
| 8 aligned tabs + 768 selector | 3, 4 | navigation keyboard tests + layout/viewport checks |
| 9 configured-only empty Overview | 2 | panel and real-route empty-source tests |
| 10 aligned controls/quick-add | 2, 4 | interaction tests + visual/focus inspection |
| 11 responsive history rail | 1, 4 | DOM-order tests + 1440/1024/768 inspection |
| 12 local retryable failures | 1, 2 | history/section/reference error tests |
| 13 human-readable conflict review | 1 | normal + Mode conflict tests, raw-ID/JSON negative assertions |
| 14 complete state coverage | 1, 2 | route/component state matrix |
| 15 no overflow at five widths | 4, 5, 7 | real viewport overflow/wrapping inspection |
| 16 keyboard/accessibility | 1–4 | interaction tests, axe, keyboard-only inspection |
| 17 axe state matrix | 1–3 | rendered axe tests |
| 18 no contract changes | 0, 5, 6 | integrated diff and integrity audit |
| 19 full verification/hygiene | 5–7 | exact final command outputs and status review |

## 8. Verification fixtures

Use asymmetric fixtures so display logic cannot pass through accidental value
reuse:

- Main Line `TV Unit` in Main Basket `POP / Gypsum`;
- long Main Line and Basket names for wrapping;
- Draft revision 1 with no Active revision;
- Draft revision 4 with Active revision 2;
- completeness `0`, `67`, and `100`;
- blocker-only, warning-only, ready, active read-only, and archived items;
- allowed-actions sets that independently omit update, duplicate, activate, and
  archive;
- standard section version different from aggregate item version;
- Mode Pricing and Quantity & margin with unequal versions and one partial save
  failure;
- empty Overview, saved `0`, saved `false`, unresolved IDs, literal `Not
  configured`, and populated Mode/pricing/recommendation/quality data;
- history empty, one Draft, multiple Active/Draft entries, loading, and error;
- standard and Mode conflict payloads containing private-looking IDs that must
  not render.

## 9. Final handoff requirements

The final response must report:

- outcome and principal UX decisions;
- all affected files;
- exact focused/full test, typecheck, build, axe, viewport, and hygiene results;
- warnings and generated ignored artifacts;
- browser QA availability or exact unrun limitation;
- confirmation that no backend/API/migration/deployment/commit/push occurred;
- dirty-worktree preservation;
- remaining risks, especially any real-layout blind spot.

The work is not complete while a confirmed integrity finding remains or while a
required command fails.
