# Super Admin Main Line visible-tab style unification

**Status:** Awaiting specification approval  
**Date:** 2026-09-01  
**Actor:** Authorized Super Admin  
**Route:** Configuration → Main Basket → Main Line

## 1. Decision summary

### Requested outcome

Apply the professional alignment and spacing system approved for Main Line
Overview to the remaining visible Main Line tabs.

The current first-level navigation exposes:

1. Overview;
2. Mode;
3. Recommendations; and
4. Quality.

This specification therefore targets **Mode**, **Recommendations**, and
**Quality**. It does not reintroduce or resolve the separately paused Scope,
Execution, or Advanced navigation decision.

### Recommended approach

Extend the existing frontend-only Main Line workspace styling contract rather
than making the three editors visually identical:

- keep the shared command bar as the common top alignment anchor;
- give every visible tab surface the same outer width, desktop inset, mobile
  inset, border/radius family, and compact vertical rhythm as Overview;
- preserve Mode's two owned blocks—Pricing and Quantity & margin—but align each
  block's metadata, editor content, and preview content to the same inset;
- preserve Recommendations and Quality as structured repeaters while making
  their section headings, Add actions, rows, field grids, and row actions follow
  the same spacing and control geometry; and
- retain each editor's existing fields, labels, validation, stable IDs, row
  ordering, save behavior, conflicts, permissions, and accessible interaction.

“Same styling” means one visual grammar, not forcing dense structured editors
into Overview's exact two-control composition.

## 2. Current behavior and evidence

### Shared structure already in place

- `KnowledgeItemWorkspacePage.tsx` renders the same
  `KnowledgeSectionCommandBar` above every visible tab.
- Overview and direct section editors render within the same main workspace
  column.
- The approved Overview alignment now explicitly uses a full-width surface,
  `--space-5` desktop insets, `--space-4` narrow-mobile insets, compact section
  gaps, minimum 44px controls, and shrink-safe responsive layouts.
- All visible tabs use the same role-themed design tokens and UI primitives.

### Mode differences

- `KnowledgeModePanel.tsx` renders Pricing and Quantity & margin as two separate
  `Surface` blocks.
- Each block includes `knowledge-mode-block__toolbar` for section version and
  dirty state, followed by its `KnowledgeSectionEditor`.
- The base section toolbar was designed as a sticky, full-bleed header. The Mode
  override makes it static and removes its negative margin, but retains the
  toolbar's independent padding/tint treatment. This produces a second inset
  and a visually separate banner inside each already padded Mode surface.
- Mode also contains dense price, margin, quantity-slab, conflict, error, and
  preview states that must not lose hierarchy or overflow at narrower widths.

### Recommendations and Quality differences

- Both tabs use `KnowledgeSectionEditor` inside the common workspace Surface.
- Their structured values render through `KnowledgeRepeater`.
- Repeater rows combine an auto-fit form grid with a trailing move/remove action
  rail. Long labels, textareas, selection controls, checkboxes, and stable IDs
  can make rows much denser than Overview.
- Existing CSS provides generic spacing and a `640px` stacked row fallback, but
  the direct-tab surface does not yet have the explicit item-workspace inset and
  mobile-padding contract now used by Overview.

### Verification state inherited from the Overview task

- The current focused Overview/workspace lane passes 80/80 tests.
- Frontend typecheck and production build pass.
- The broader frontend suite currently has one unrelated stale assertion in
  `knowledgePresentation.test.ts` that still expects seven visible tabs while
  the paused four-tab work exposes four; 1,349/1,350 tests pass.
- No connected browser is currently available, so live computed visual geometry
  must be attempted again during implementation and reported honestly if it
  remains unavailable.

### Repository state

The target stylesheet, Mode panel, section editor, workspace tests, and screen
tests already contain modified or untracked user work. Implementation must
capture their initial hashes/diffs, preserve unrelated changes, and keep one
writer per file.

## 3. Product specification

### Goal

Create a consistent Main Line workspace in which switching between Overview,
Mode, Recommendations, and Quality feels like moving between sections of one
professional configuration form rather than between unrelated card systems.

### Actor and job

- **Actor:** authorized Super Admin.
- **Read:** understand section identity, saved data, revision state, validation,
  and read-only state without relearning the layout in each tab.
- **Edit:** add, update, order, remove, and save section data using consistent
  field and action placement.
- **Recover:** recognize loading, error, conflict, stale, validation, and retry
  states without losing local edits or section context.

### Scope

- Mode, Recommendations, and Quality content surfaces.
- Mode block spacing, metadata-toolbar treatment, internal editor alignment,
  preview alignment, and responsive stacking.
- Recommendations/Quality section headings, repeater headers, empty states,
  rows, field grids, row-action rails, and mobile stacking.
- Shared item-workspace control height, label alignment, wrapping, focus,
  read-only, disabled, validation, and error presentation as affected by the
  styling.
- Focused layout, rendered interaction/accessibility, responsive, and visual QA.

### Non-goals

- No field, heading, helper-text, row, tab, action, preview, or summary removal.
- No change to Mode's Pricing/Quantity & margin grouping or save order.
- No change to Recommendations/Quality payloads, row schema, stable IDs,
  ordering, validation, or required fields.
- No change to APIs, query keys, cache synchronization, CAS, permissions,
  activation, immutable revision history, or audit behavior.
- No backend, contract, persistence, migration, seed, or data repair work.
- No shared `Surface`, `Field`, `Button`, `IconButton`, `PageHeader`, or shell
  primitive redesign.
- No reintroduction of Scope, Execution, or Advanced tabs and no repair of the
  separately known hidden Draft relationship risk.
- No dependency, lockfile, staging, commit, push, deployment, or production
  change.

## 4. UX and styling contract

### 4.1 Common tab frame

- Navigation, command bar, and active-tab content retain one shared main-column
  width and outer edge.
- Direct tab surfaces use the same explicit `--space-5` desktop content inset as
  Overview and `--space-4` at `480px` and below.
- Tab content uses a compact token-based vertical rhythm; no content touches the
  surface border and no redundant wrapper adds a second full card inset.
- The role-themed Surface remains the source of border, radius, background, and
  shadow. Feature-local rules may reduce nested elevation but must not hard-code
  replacement colors or shadows.

### 4.2 Mode tab

- Pricing and Quantity & margin remain distinct, full-width Mode section
  surfaces in their existing order.
- Both blocks use the same padding, gap, radius, and border treatment.
- The per-block version/dirty metadata toolbar becomes a compact local divider:
  its content aligns with the editor below, it does not introduce an extra
  horizontal inset, and it does not resemble a second primary command bar.
- The top shared **Save Mode** command remains the only Mode save action.
- Pricing specifications, brands, price versions, quantity values, quantity
  slabs, conflict review, inline errors, and preview remain present and retain
  their current data and interaction semantics.
- Dense field grids remain auto-fit and shrink-safe rather than being forced to
  exactly two columns.

### 4.3 Recommendations and Quality tabs

- The section heading/supporting copy aligns with the repeater header and rows.
- The repeater heading and Add action share one balanced header row on desktop.
- Empty state remains visible and uses the established subtle/dashed treatment.
- Configured rows use a restrained nested surface treatment with no competing
  shadow; internal fields align at the top.
- Field labels use consistent line-height/wrapping and controls remain full
  width with at least 44px minimum height where the control primitive supports
  it.
- Move Up, Move Down, and Remove remain grouped as a secondary row-action rail,
  retain accessible names, and use at least 44px touch targets.
- Required/Active/Dependency checkboxes retain their labels, focus behavior, and
  disabled/read-only behavior.

### 4.4 Responsive behavior

- Wide desktop: content uses the available main column without uncontrolled
  stretching or large empty gutters.
- Rail-stack/tablet widths: history movement must not change the active tab's
  inner alignment.
- At `768px` and below, dense grids progressively reduce columns without page
  overflow; the shared command bar remains stacked.
- At `640px` and below, repeater row content and row actions stack; actions must
  remain easy to associate with their row.
- At `480px` and below, direct tab surfaces use `--space-4` padding, repeater
  headers may stack, Add actions become full width when needed, and long labels,
  values, errors, and metadata wrap safely.
- Fixed content heights are prohibited. Existing minimum touch/control heights
  are retained.

## 5. State and accessibility requirements

- Preserve tablist/tab/tabpanel and mobile select semantics.
- Preserve one contextual Save action for the active editable tab and no Save
  action for read-only/archived history.
- Preserve Mode's dirty-buffer, ordered multi-section save, partial failure,
  conflict, discard, and retry behavior.
- Preserve repeater focus after add/remove, row reordering, accessible action
  names, and validation focus.
- Preserve visible `:focus-visible`, invalid, disabled, busy, and read-only
  treatments.
- Loading, empty, stale, conflict, inline error, unavailable data, validation
  summary, and preview states must remain legible and aligned.
- Enlarged text and browser zoom must wrap rather than overlap or clip.

## 6. Data, API, permission, and workflow contract

No contract changes are permitted.

- Backend section keys and envelopes remain authoritative.
- Pricing and Quantity & margin retain independent section versions and ordered
  aggregate CAS saves under the Mode presentation group.
- Recommendations and Quality retain independent section CAS versions.
- Backend `allowedActions` and authorization remain authoritative; CSS must not
  reveal or enable a forbidden mutation.
- Stable IDs remain identity; visible names remain presentation only.
- Existing query keys and mutation synchronization remain unchanged.
- No data transition, side effect, migration, rollback script, or observability
  change is required. Rollback is a localized frontend style/test revert.

## 7. Assumptions and constraints

- “Other tabs” means the currently visible first-level Mode, Recommendations,
  and Quality tabs.
- The approved Overview alignment is the visual reference, not a mandate to use
  an exact two-column form for every structured editor.
- Existing Lisno spacing, radius, role-color, shadow, focus, and motion tokens
  are authoritative.
- A CSS-focused implementation is preferred. Minimal, behavior-neutral class
  hooks are allowed only when existing markup cannot express the approved
  alignment without brittle selectors.
- Shared primitive changes require a new scope decision and are a stop
  condition.

## 8. Risks and mitigations

- **Dense-row regression:** forcing Overview geometry onto structured forms can
  make fields unusable. Retain auto-fit grids and standardize only frame,
  rhythm, label, control, and action geometry.
- **Nested-surface overload:** Mode and repeater rows already sit inside outer
  surfaces. Use restrained borders/tints and avoid additional elevation.
- **Cascade regression:** role themes load after feature CSS. Use narrowly scoped
  item-workspace selectors and verify specificity without leaking to shared
  knowledge screens.
- **Behavior regression:** CSS selectors must not hide validation, dirty,
  conflict, save, or row actions. Retain rendered behavior tests.
- **Responsive overflow:** long IDs, relationship labels, error copy, and dense
  row actions can exceed narrow widths. Use min-width safety, wrapping, and
  stacked action rules with real-browser QA when available.
- **Dirty-worktree overlap:** inspect and preserve every relevant local diff;
  one writer owns each changed file.
- **Known suite noise:** do not “fix” the unrelated stale seven-tab assertion as
  part of this styling task or use it to claim this slice failed.

## 9. Acceptance criteria

1. Overview, Mode, Recommendations, and Quality share the same navigation,
   command-bar, and active-surface outer edges.
2. Mode, Recommendations, and Quality use the same explicit desktop and
   narrow-mobile content insets as Overview.
3. Section headings, metadata, editor content, repeater headers, and rows follow
   one compact token-based vertical rhythm.
4. Mode's two blocks are visually consistent; block metadata aligns with the
   editor below and does not resemble another primary command bar.
5. Recommendations and Quality repeater headers, Add actions, row content, and
   row-action rails remain clearly grouped and aligned.
6. Labels wrap, controls remain full width/minimum 44px where applicable, and
   long content does not cause page-level horizontal overflow.
7. At `768px`, `640px`, and `480px` breakpoints the layouts stack predictably;
   row and Add actions remain reachable and correctly associated.
8. Mode save ordering/CAS/conflict behavior, Recommendations/Quality editing,
   repeater add/remove/reorder focus, permissions, read-only state, validation,
   errors, preview, and accessible names are unchanged.
9. Focused layout and rendered tests, frontend typecheck, and production build
   pass. The broader suite result separately identifies the pre-existing stale
   tab-count assertion if it remains.
10. Responsive browser inspection covers approximately 1440px, 1024–1180px,
    768px, and 390–480px plus dense, empty, error, and read-only states when a
    browser is available; otherwise the exact visual-verification limitation is
    reported.
11. `git diff --check` passes, relevant final diffs are reconciled against the
    captured baseline, and unrelated dirty work is preserved.
12. No backend, API, permission, persistence, migration, dependency, commit,
    push, deployment, or production action occurs.

## 10. Relevant impacts

### Expected frontend areas

- `ai-estimator-knowledge.css` for the shared visible-tab frame, Mode blocks,
  repeaters, field grids, actions, and responsive rules.
- `KnowledgeModePanel.tsx` or `KnowledgeSectionEditor.tsx` only if a minimal
  behavior-neutral class hook is required.
- Focused workspace/Mode/section-editor layout tests and existing rendered
  screen/editor regression lanes.

### Backend, API, data, and operations

None.

## 11. Open decisions

No material product or architecture decision remains for this styling task.
Approval confirms that the scope is the three currently visible tabs and that
consistency means a shared professional visual system while preserving their
different editor structures.
