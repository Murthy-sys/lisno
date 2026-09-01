# Super Admin Main Line Overview alignment refinement

**Status:** Awaiting specification approval  
**Date:** 2026-09-01  
**Actor:** Authorized Super Admin  
**Route:** Configuration → Main Basket → Main Line → Overview

## 1. Decision summary

### Goal

Refine the Main Line Overview layout so its command bar, Main Line context,
Configured values heading, labels, controls, and quick-add action follow one
consistent alignment and spacing system across desktop, tablet, and mobile.

### Recommended approach

Apply a localized frontend layout refinement using the established Lisno design
tokens and existing component structure:

- keep the command bar and Overview surface aligned to the same main-column
  edges;
- give the Overview surface a deliberate, consistent inner inset;
- group the Main Line/Basket context as a compact header row rather than a
  visually detached strip;
- use a tighter vertical rhythm between context, section heading, fields, and
  actions;
- keep UOM and Surfaces in equal-width columns with matching label baselines,
  control heights, borders, and widths;
- keep **Add unit of measure** directly associated with the UOM field; and
- stack the configured fields cleanly at the existing responsive breakpoint.

This is a presentation-only change. It does not change Overview data,
configured-only summary rules, permissions, saving, validation, CAS, or
activation behavior.

## 2. Current behavior and evidence

### Screenshot findings

The supplied Overview screenshot shows that the individual controls are usable,
but the composition feels stretched and uneven:

- the command bar and content card read as separate layout systems;
- the Main Line/Basket context sits in a shallow divider strip while the
  Configured values content begins much farther below;
- vertical spacing between the section copy, labels, controls, and quick-add
  action is disproportionate to the amount of content;
- the UOM and Surfaces columns are technically parallel but do not read as one
  deliberate form row; and
- the large empty areas reduce hierarchy and make the card feel unfinished.

### Traced frontend causes

- `KnowledgeSectionCommandBar.tsx` supplies the section/version, save status,
  and Save Overview action in a three-column command bar.
- `KnowledgeOverviewPanel.tsx` renders the Main Line/Basket context separately
  from the Configured values section and its two controls.
- `ai-estimator-knowledge.css` currently composes the card through several
  independent rules: the Overview grid gap, context padding/divider, configured
  grid gap, field-label height, control geometry, and quick-add margin.
- The Overview `Surface` uses shared default padding, while additional local
  spacing is applied inside the panel. The combined spacing lacks one explicit
  vertical-rhythm contract.
- Current source-level layout tests verify width, two-column geometry, control
  height, and responsive stacking, but they do not assert the complete inset and
  spacing relationship shown in the screenshot.

### Repository state

The target stylesheet, Overview panel, workspace page, and related tests already
contain uncommitted user work from earlier Main Line changes. Implementation
must preserve those changes and keep this refinement localized. The prior
Scope/Execution/Advanced tab-removal workflow remains paused at its separate
hidden-reference repair decision; this CSS task must not resolve or broaden
that product decision.

## 3. Scope

### In scope

- Overview command-bar and content-card edge alignment.
- Overview surface padding and internal vertical rhythm.
- Main Line/Basket context spacing and divider treatment.
- Configured values heading/copy spacing.
- UOM and Surfaces column, label, and control alignment.
- Quick-add placement and spacing.
- Desktop, tablet, mobile, long-label, error, read-only, and loading-state
  layout behavior affected by these rules.
- Focused CSS-contract, rendered component, accessibility, and responsive
  regression coverage.

### Non-goals

- No wording, field, tab, summary-card, or action removal.
- No change to when UOM, Surfaces, Mode, or configured-only summaries appear.
- No change to section payloads, API calls, query keys, cache synchronization,
  save state, validation, conflict handling, CAS, permissions, or activation.
- No backend, model, schema, migration, seed, or data repair work.
- No shared `Surface`, `Field`, `Select`, `Button`, or page-shell redesign.
- No new dependency, lockfile update, deployment, commit, or push.
- No resolution of the separately identified hidden Scope/Advanced Draft
  relationship risk.

## 4. UX and CSS contract

### 4.1 Shared alignment

- The section navigation, command bar, and Overview surface retain the same
  main-column width.
- The command-bar content and Overview card content use visually compatible
  horizontal insets from existing spacing tokens.
- The card border, radius, and shadow continue to come from the established
  role-themed `Surface`; no one-off pixel colors or duplicate visual primitives
  are introduced.

### 4.2 Overview hierarchy

- Use one consistent vertical gap between the context row, Configured values
  heading group, and configured-fields row.
- Main Line name remains the strongest text in the context row; Main Basket
  remains muted supporting context.
- The context divider spans only the card's inner content width and has balanced
  padding above and below.
- The **Configured values** heading and supporting sentence remain left-aligned
  with the field grid.
- Do not add a nested card solely for the configured controls.

### 4.3 Configured fields

- At desktop/tablet widths above `768px`, UOM and Surfaces use two equal,
  minmax-safe columns with a consistent column gap.
- Both labels share the same baseline and natural line-height treatment.
- Both controls occupy the full column width and have the same minimum height.
- UOM Select and Surfaces trigger retain their existing accessible names,
  keyboard behavior, visible focus treatment, disabled state, and error/loading
  messages.
- **Add unit of measure** stays below the UOM control, left aligned with that
  control and separated by a compact gap. It must not affect the vertical
  alignment of the Surfaces control.
- Existing `Not configured` editor options remain because UOM and Surfaces are
  operational Overview controls, not empty summary cards.

### 4.4 Responsive behavior

- At `768px` and below, the command bar remains stacked and its Save action is
  full width under the status text.
- UOM and Surfaces stack into one column without horizontal overflow.
- At narrow mobile widths, card and command-bar insets reduce consistently,
  Main Basket wraps below Main Line context, and touch targets remain at least
  44px high.
- Long Main Line/Basket names, unresolved reference labels, loading/error copy,
  and read-only presentation must wrap within the available width.

## 5. State and accessibility requirements

- Preserve one accessible **Save Overview** button when the revision is
  editable and no Save button for read-only/archived history.
- Preserve Save disabled, dirty, saving, success, and error status behavior.
- Preserve labelled UOM combobox and Surfaces button semantics.
- Preserve visible keyboard focus and no mouse-only interaction.
- Loading, retryable error, unresolved saved reference, read-only, and disabled
  states must remain visible and must not cause column overlap or layout shift
  beyond normal content wrapping.
- The layout must remain usable with browser zoom and enlarged text; fixed
  heights are prohibited except existing minimum touch/control heights.

## 6. Assumptions and constraints

- The supplied screenshot represents the target Super Admin Overview state.
- Existing spacing, radius, role-color, and shadow tokens are authoritative.
- The existing `768px` field-stacking breakpoint remains appropriate.
- A CSS-focused change should be sufficient; component markup may change only
  if a small semantic wrapper/class hook is necessary to implement the approved
  alignment without brittle selectors.
- Live browser inspection may be unavailable in the current environment. It
  must be attempted during implementation; if unavailable, the limitation must
  be reported and not replaced with a claim of visual verification.

## 7. Risks and mitigations

- **Cascade regression:** the role-theme stylesheet loads after the feature
  stylesheet. Keep selectors item-workspace scoped and verify specificity where
  the role theme can override geometry or surface presentation.
- **Dirty-worktree overlap:** preserve and inspect existing local diffs before
  editing; do not reformat unrelated CSS or tests.
- **Responsive regression:** tighter desktop spacing can overflow on mobile.
  Assert one-column behavior, wrapping, and touch-target minimums.
- **State regression:** quick-add, loading, error, and read-only content can make
  one column taller. Align controls at the top and allow each column to grow
  independently.
- **Visual-only test gap:** source-string assertions cannot prove rendered
  geometry. Pair focused component/CSS-contract checks with a live responsive
  browser attempt when available.

## 8. Acceptance criteria

1. Command bar and Overview surface align to the same main workspace edges.
2. Overview card content has consistent horizontal insets and no text or
   control touches the surface edge.
3. Main Line/Basket context, section heading, field row, and quick-add action
   follow a compact, consistent vertical rhythm.
4. UOM and Surfaces render in equal desktop columns with aligned labels,
   equal-width controls, and matching minimum control height.
5. **Add unit of measure** remains visually attached to UOM without displacing
   the Surfaces label or control.
6. The two fields stack at `768px` and below; mobile content wraps without
   clipping or horizontal overflow.
7. Long names, loading/error messages, unavailable references, read-only state,
   and disabled controls remain legible and correctly aligned.
8. Existing Overview field visibility, save/CAS/conflict behavior, permissions,
   accessible names, focus states, and configured-only summaries are unchanged.
9. Focused Overview/workspace layout tests, frontend typecheck, and frontend
   build pass; a responsive browser inspection is completed when a browser is
   available, otherwise the exact limitation is reported.
10. `git diff --check` passes and unrelated dirty work is preserved.

## 9. Relevant impacts

### Frontend

Expected impact is limited to item-workspace Overview CSS, with focused layout
test updates and only minimal Overview markup hooks if required.

### Data and API

None. No payload, endpoint, version, stable-ID, query, or mutation contract
changes.

### Backend, migration, and rollout

None. No migration or production-side action is required. The change can be
reverted by reverting the localized frontend style/test diff.

## 10. Open decisions

No material product or architecture decision remains for this alignment task.
Approval confirms the compact, token-based two-column desktop layout and
single-column mobile behavior described above.
