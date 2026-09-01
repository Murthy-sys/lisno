# Super Admin Main Line workspace professional redesign

**Status:** Awaiting specification approval  
**Date:** 2026-09-01  
**Actor:** Authorized Super Admin  
**Route:** Configuration → Main Basket → Main Line workspace

## 1. Decision summary

### Requested outcome

Make the Super Admin Main Line workspace look and behave like one professional,
cohesive configuration screen while preserving every approved editing,
activation, revision, permission, and configured-only Overview rule.

### Recommended approach

Use a frontend-only hierarchy redesign over the existing API and design system:

- keep one dominant page masthead for Main Line identity and lifecycle actions;
- separate configuration completeness from activation status;
- align the section navigation and active editor as one main workspace column;
- use the existing wide desktop measure for a compact Revision history rail;
- collapse the rail below the workspace at narrower widths;
- replace duplicate header/section Save actions with one contextual section
  command bar; and
- reduce the required Main Line presentation inside Overview to a compact
  context line rather than another revision/status card.

This addresses the screenshot's unused right side, repeated information,
competing surfaces, and unclear action hierarchy without changing backend or
persistence contracts.

### Decisions fixed by existing approved behavior

- Main Line name and Main Basket context remain visible in Overview, but only
  as a compact context line; revision, status, and completeness are not repeated
  there.
- UOM and Surfaces remain the always-visible Overview configuration controls.
- Empty Mode, pricing, recommendation, quality, execution, advanced, and
  all-section summaries remain omitted.
- Only saved, meaningful values qualify optional Overview summaries. Saved `0`,
  saved `false`, partial stable rows, and unresolved saved references retain the
  behavior approved in the Overview summary specification.
- Detailed tabs remain the canonical editors for their owning sections.
- Existing permissions, backend `allowedActions`, section and aggregate CAS,
  dirty guards, conflicts, immutable active revisions, and activation rules
  remain authoritative.

### Material presentation choice included in this recommendation

At wide desktop widths, Revision history occupies an approximately 18rem
secondary rail beside the active workspace. This is preferred over stretching
two Overview controls across the entire 90rem shell or leaving the right side
empty. Approval of this specification approves that desktop composition.

## 2. Current-state evidence

### User-visible behavior

The supplied desktop screenshot shows:

- a full-width masthead, notice, and revision strip;
- a content-sized tab deck;
- an Overview panel capped well before the right edge;
- a full-width Revision history surface below it;
- Main Line, Draft, revision, and completeness information repeated across
  multiple surfaces;
- a prominent disabled Save bar even in the clean state; and
- UOM and Surfaces controls with different visual edge treatments.

The result reads as several unrelated cards rather than one configuration
workspace.

### Traced frontend causes

- `KnowledgeItemWorkspacePage.tsx` renders Main Line/Basket identity in the page
  header, revision information in a separate summary strip, the active section
  surface, and a separate Revision history surface.
- `KnowledgeOverviewPanel.tsx` repeats Main Line, Basket, revision, status, and
  completeness inside Overview.
- `ai-estimator-knowledge.css` caps only the Overview section at `72rem`, while
  the application shell already owns a shared `90rem` wide-content measure.
- The item-workspace tab deck is explicitly `max-content`, so it does not align
  with the active panel.
- A dirty normal section renders Save in both the PageHeader action group and
  the sticky section toolbar. Mode uses the header Save path and separate
  per-block metadata toolbars.
- The sticky toolbar full-bleeds through its parent surface with negative
  margins, making section-version metadata visually dominant.
- Existing viewport tests set `window.innerWidth` but do not perform actual
  browser layout, overflow, or screenshot assertions.

### Content accuracy issue

The current label **Backend-derived activation readiness** is inaccurate for the
displayed percentage. The backend percentage represents configuration
completeness; optional incomplete sections may lower it without being an
activation blocker. Activation state must be presented separately from the
backend-supplied blocker and warning collections.

### Current regression baseline

The following existing focused lane passes before this redesign:

```text
KnowledgeItemWorkspaceLayout.test.tsx  6 tests
KnowledgeOverviewPanel.test.tsx       14 tests
KnowledgeScreens.test.tsx             34 tests
Total                                 54 tests passed
```

Some of those tests currently encode the screenshot-producing `72rem` Overview
cap, `max-content` tabs, and duplicate Save selection and therefore must be
updated as behavior changes.

Live browser inspection is unavailable at the specification gate because no
browser session is connected. The supplied screenshot and source/rendered-test
evidence are sufficient to specify the change, but implementation verification
must attempt real viewport inspection again.

## 3. Product specification

### Goal and measurable outcome

Create one coherent Main Line configuration workspace in which identity,
readiness, navigation, editing, and history each have one clear visual role.

The redesign succeeds when a Super Admin can immediately answer:

1. Which Main Line and Main Basket am I configuring?
2. Is the configuration complete, and is activation blocked?
3. Which revision am I editing or viewing?
4. Where do I change this section, and where do I save it?
5. What revision history exists?

No answer should require reading duplicate metadata in multiple cards.

### Actor and jobs

- **Read:** inspect one Main Line, its current revision, configured values,
  completeness, activation state, and history.
- **Edit:** change the active Draft section and save from the active workspace.
- **Lifecycle:** review activation, activate, create a revision, duplicate,
  deactivate, or archive only when both frontend permission and backend
  `allowedActions` permit it.
- **Recover:** retry local failures, preserve unsaved data through conflicts,
  and navigate through the established save/discard/stay guard.

### Scope

- Main Line page masthead hierarchy and action priority.
- Configuration-completeness and activation-status strip.
- Section navigation width, panel alignment, and tablet/mobile selector
  breakpoint.
- One active-section command bar for Save state and section metadata.
- Overview surface hierarchy and compact Main Line context presentation.
- UOM/Surfaces control alignment and quick-add placement.
- Revision history placement, hierarchy, retry, and responsive behavior.
- Human-readable conflict-review presentation instead of raw JSON.
- Loading, empty, stale, error, conflict, success, read-only, archived, and
  permission states affected by the composition.
- Focused interaction, accessibility, responsive, and visual regression tests.

### Non-goals

- No backend endpoint, schema, model, index, migration, seed, or backfill.
- No completeness, blocker, warning, activation, pricing, margin, tax, or other
  domain calculation change.
- No permission expansion and no change to backend route-operation enforcement.
- No section payload, stable-ID, query-key, cache-invalidation, CAS, audit, or
  immutable-history contract change.
- No removal of a detailed tab or configured-only Overview behavior.
- No redesign of the Main Basket index or reusable master editors.
- No shared `PageHeader`, `Surface`, `Button`, or field primitive redesign unless
  implementation proves a shared primitive defect.
- No new dependency, production mutation, deployment, commit, or push.

## 4. Information hierarchy and interaction contract

### 4.1 Page masthead

The masthead contains one dominant identity source:

- back action: **Back to Main Baskets**;
- context eyebrow: **Main Basket · {Main Basket name}**;
- `h1`: exact Main Line name;
- item status badge, for example **Draft**;
- metadata: **Updated {localized date and time}**.

Page-header actions are lifecycle/object actions only. Save never appears in
the masthead.

Desktop order:

1. **Review activation** when blockers exist, or **Review and activate** when no
   blockers exist and the action is allowed;
2. **Create revision** when applicable;
3. **Duplicate**;
4. **Deactivate** or **Archive** using the established destructive treatment.

The existing lifecycle dialog remains the authority for blocker/warning review
and confirmation. Relabelling a blocked action must not bypass or pre-empt the
dialog.

### 4.2 Isolation notice

Retain the knowledge-base isolation notice and its exact safety meaning. Present
it as a compact, non-interactive informational band aligned with the workspace,
not as a competing primary card.

### 4.3 Configuration and activation strip

Replace the current readiness wording with four concise values:

1. **Configuration completeness** — backend percentage and progress bar.
2. **Activation status** — one of:
   - **Blocked · {N} blocker(s)**;
   - **Ready with {N} warning(s)**; or
   - **Ready to activate**.
3. **Editing** or **Viewing** — for example **Draft revision 1** or
   **Active revision 3**.
4. **Active revision** — **Revision N** or **No active revision**.

The UI derives only these display labels and counts from backend-supplied
percentage, blockers, warnings, status, and revision objects. It must not
recalculate completeness or activation eligibility.

Remove **Backend-derived activation readiness** and **Current view** copy.

### 4.4 Workspace composition

At wide desktop widths, use the shell's existing `90rem` content measure:

```text
┌──────────────────────── Main workspace ────────────────────────┬─ History ─┐
│ full-width section navigation                                  │ revisions │
│ active-section command bar                                     │           │
│ active section content                                         │           │
└─────────────────────────────────────────────────────────────────┴───────────┘
```

- Main column: `minmax(0, 1fr)`.
- Secondary rail: approximately `18rem`.
- The rail moves below the main workspace before it compresses editing content.
- Remove the Overview-specific `72rem` cap.
- The tab rail, command bar, and active panel share the main-column edges.
- Avoid card-inside-card presentation where a divider, tint, or spacing group
  communicates hierarchy sufficiently.

### 4.5 Section navigation

- Desktop and large tablet: all seven tabs use the full main-column width while
  retaining horizontal overflow safety.
- Tabs preserve `tablist`/`tab`/`tabpanel` semantics, roving focus, Arrow Left,
  Arrow Right, Home, End, wraparound, disabled-section behavior, and focus
  restoration after declined dirty navigation.
- At `768px` and below, use the existing labelled **Configuration section**
  select rather than squeezing or horizontally scrolling seven tabs.
- Changing tabs/select continues through the save/discard/stay guard.

### 4.6 Active-section command bar

Every active editable context uses one command bar immediately below the
section navigation and above the editor.

Normal section states:

- label: active section name, for example **Overview**;
- secondary metadata: **Version 1**;
- clean: **All changes saved**, Save control disabled;
- dirty: enabled **Save Overview**, **Save Scope**, and so on;
- saving: busy **Saving Overview…**;
- failed: retain edits, show local error, and keep retry/save available;
- read-only: **Read-only revision**, with no Save control.

Mode states:

- command: **Save Mode**;
- the established ordered Pricing then Quantity & margin saves remain
  unchanged;
- per-block version, dirty, partial-failure, and conflict attribution remain
  visible as secondary block metadata;
- there is still exactly one Save Mode control.

The bar may remain sticky on desktop/tablet only if it does not obscure focus,
error content, or section headings. It is static on mobile.

### 4.7 Overview

Overview preserves the approved configured-only contract.

When no downstream configuration exists, it shows only:

- compact context line:
  **{Main Line name} · Main Basket: {Main Basket name}**;
- heading: **Configured values**;
- helper: **Reusable values for this Main Line.**;
- **Unit of measure (UOM)** single-select;
- **Surfaces** multi-select; and
- **Add unit of measure** when authorized.

The compact context line has no separate Surface and does not repeat revision,
status, or completeness.

UOM and Surfaces must have matching height, edge, label spacing, hover, focus,
disabled, error, and read-only treatments. Quick-add is a compact secondary
action associated with UOM, not a visually detached third row.

Optional Mode, shared-calculation, pricing, recommendation, quality, and
all-section summaries continue to appear only for saved meaningful data. No
empty cards, placeholder summaries, zero-count rows, or empty wrapper returns.

### 4.8 Revision history

- Wide desktop: secondary rail headed **Revision history** with the existing
  revision entries in newest-first order.
- Narrower viewports: the same semantic section follows the active workspace.
- Each entry retains revision number, status, updated time, and completeness.
- History loading/error is local and never blanks the editor.
- Error state provides **Try again**.
- Active revisions remain visibly immutable.
- No history record, identity, ordering, or lifecycle behavior changes.

### 4.9 Conflict review

Conflict handling retains local edits, explicit review/discard choices, exact
server/local versions, and no automatic replay.

The inline **Latest saved values** review uses human-readable, read-only field
presentation from the existing section components. Raw JSON, raw stable IDs,
and actor IDs are not presented as the professional comparison UI. If a saved
reference cannot resolve, show **Unavailable value**.

## 5. State and failure behavior

- **Item loading/error/404/403:** retain the full-page boundary and avoid
  disclosing configuration on denied/unavailable routes.
- **Section loading:** keep masthead, status, and navigation; load only the
  active panel.
- **Background refresh:** preserve cached content, expose `aria-busy`, and
  announce the affected region without duplicating live messages.
- **Empty revision:** show **This item has no revision to display.** with no Save.
- **Empty Overview:** show the compact identity line, UOM, and Surfaces only.
- **Reference loading/error:** scope feedback to used controls or saved
  references and retain source-specific retry behavior.
- **History error:** keep the active editor available and provide local retry.
- **Save success:** announce **{Section} saved.** and return the command bar to
  **All changes saved**.
- **Save failure/conflict:** retain local values and established conflict
  recovery behavior.
- **Activation blocked:** show backend blockers in the existing review dialog;
  no activation mutation succeeds while backend rules reject it.
- **Active/read-only/archived:** show the same information hierarchy without
  mutation or quick-add controls; retain the existing explanatory notice.
- **Unresolved saved IDs:** show **Unavailable value**, never raw IDs.

## 6. Contract and invariants

### API, persistence, and data lineage

- No request/response/event change.
- Existing item, section, history, master, and relationship queries remain.
- Existing item and section stable IDs remain the only identity keys.
- Existing section and aggregate expected versions remain exact.
- Existing audit, activation, immutable revision, and duplicate/archive behavior
  remains unchanged.
- No migration or compatibility data rewrite is required.

### Permission matrix

| Operation | Required existing gates | Presentation requirement |
|---|---|---|
| Read workspace | route access + backend authorization | show authorized data only |
| Edit/save | update permission + Draft + not archived + `update_section` | one contextual Save control |
| Quick-add/duplicate/revision | create permission + matching `allowedActions` | omit when unauthorized |
| Activate/deactivate/archive | lifecycle permission + matching `allowedActions` | preserve action hierarchy and dialog |
| Active/archived history | read access | read-only, no mutation controls |

Frontend visibility remains advisory; backend authorization remains
authoritative.

### Cross-screen and cache behavior

- No query-key or invalidation change is required for presentation-only work.
- Successful saves and lifecycle commands retain their established synchronized
  item, section, history, and Overview updates.
- Navigation to other tabs and return to Overview must not manufacture or lose
  summary state.

## 7. UX and visual system

- Reuse the established warm Super Admin role tokens and shared Button, Surface,
  PageHeader, Field, StatusBadge, ProgressBar, InlineMessage, and PageState
  components.
- Use alignment, type hierarchy, dividers, and restrained surface tint before
  additional borders or shadows.
- Do not add gradients, hover lifting, animated layout shifts, or ornamental
  graphics.
- Maintain readable text measures inside wide regions even though the workspace
  uses the shell's full measure.
- Keep all interactive targets at least 44px for touch/coarse pointers.
- Ensure focus rings, muted metadata, warning, danger, and accent text meet WCAG
  AA contrast in the Super Admin theme.
- Preserve reduced-motion behavior.

### Required viewport behavior

| Viewport | Required composition |
|---|---|
| 1440px | title/actions share masthead; compact status row; main workspace + ~18rem history rail; seven tabs visible |
| 1024px | header actions may wrap below title; history below workspace; tabs remain if they fit with safe overflow cue |
| 768px | labelled section select; one-column status/workspace/history; Overview controls stack |
| 390px | single column; full-width prioritized page actions; static command bar; 44px controls; no horizontal scroll |
| 320px | 16px-equivalent gutters; long names/options/timestamps wrap without clipping or overlap |

## 8. Options and tradeoffs

### Option A — main workspace plus desktop history rail (recommended)

- Uses the screenshot's empty right side while preserving a readable editor
  width.
- Gives history a clear secondary role without hiding it.
- Requires responsive DOM/CSS composition and reading-order verification.
- Collapses safely to one column below wide desktop.

### Option B — aligned single-column workspace

- Lowest structural risk and aligns every region to the shell measure.
- Makes two-control Overview rows and short history content excessively wide on
  large screens.
- Does not use the screenshot's available desktop space as effectively.

### Option C — CSS-only polish

- Removes the width cap and adjusts spacing with the smallest edit.
- Leaves duplicated identity/revision information, duplicate dirty Save actions,
  technical copy, and raw conflict JSON.
- Rejected because it does not satisfy the professionalization goal.

## 9. Compatibility, rollback, and operations

- Backward/forward compatibility is unchanged because no persisted or API
  contract changes.
- Rollback is presentation-code rollback only.
- No backup, migration dry run, seed, or production authority gate applies.
- No new telemetry is required. Existing polite announcements, alerts, and
  inline retry messages remain user-visible diagnostics.
- Do not log payload values, private IDs, or configuration content.

## 10. Risks and mitigations

- **Broad dirty worktree:** capture relevant diffs before each writer, give
  explicit file ownership, and preserve unrelated changes.
- **CSS specificity:** keep changes inside the Super Admin item-workspace scope
  and verify against later `role-themes.css` rules.
- **Save-flow regression:** test one-save behavior across normal sections, Mode
  ordered saves, partial failures, conflicts, and dirty navigation.
- **History rail reading order:** keep logical DOM order main workspace then
  history, and use CSS placement only at wide widths.
- **Completeness/activation confusion:** source the percentage, blockers, and
  warnings from the backend and test asymmetric combinations.
- **Sticky toolbar obstruction:** inspect real viewport heights and disable
  stickiness on mobile.
- **Prior specification conflict:** this specification supersedes only the
  presentation non-goals for revision history and lifecycle actions in the
  approved 2026-09-01 Overview redesign. Its data, editing, configured-only,
  and workflow contracts remain authoritative.
- **Missing live browser at specification gate:** require rendered tests and
  attempt browser QA again during implementation; report the limitation if the
  environment remains unavailable.

## 11. Acceptance criteria

1. Masthead, notice, status strip, workspace grid, and history align to the
   shell's existing wide-content measure.
2. The Main Line name has one `h1` source; Overview retains only the approved
   compact Main Line/Main Basket context line.
3. Revision, item status, and completeness are not repeated inside Overview.
4. **Configuration completeness** and **Activation status** are presented as
   separate backend-sourced concepts.
5. Page-header actions contain lifecycle/object actions only and remain gated by
   existing permission plus backend `allowedActions` checks.
6. Exactly one Save control exists for the active editable context, including
   Mode; clean, dirty, saving, failed, conflict, and read-only states are clear.
7. Standard-section and ordered multi-section Mode CAS/save semantics remain
   unchanged.
8. Desktop tabs and active panel share the same main-column edges; at 768px and
   below the accessible labelled section selector replaces the tabs.
9. Empty Overview continues to show only compact identity context, UOM, and
   Surfaces, with no empty tab-derived summaries.
10. UOM and Surfaces controls share consistent professional field treatment,
    and quick-add remains permission-gated and associated with UOM.
11. Wide desktop shows Revision history in the secondary rail; narrower widths
    place it below the active workspace without changing record content/order.
12. History failure is local and retryable; section/history failures do not
    blank unrelated regions.
13. Conflict review uses human-readable read-only fields and never exposes raw
    JSON or stable IDs.
14. Read-only, active, archived, loading, empty, stale, error, conflict, success,
    blocked-activation, warning, and unresolved-reference states remain explicit
    and accurate.
15. There is no page-level horizontal overflow at 1440, 1024, 768, 390, or
    320px, including long Main Line, Basket, action, option, and timestamp text.
16. Tab/select navigation, Surface multiselect, dialogs, dirty guard, and focus
    restoration remain keyboard-operable with correct accessible names.
17. Rendered axe checks pass for empty, populated, read-only, archived,
    blocked-activation, loading, error, and conflict states.
18. No API, persistence, authorization, CAS, completeness formula, activation,
    financial, audit, or cache contract changes.
19. Focused regression tests, frontend typecheck, full frontend tests,
    production build, viewport QA, `git diff --check`, and status review pass
    without overwriting unrelated dirty work.

## 12. Open decisions

No additional decision is required if approval accepts the recommended desktop
history rail and the compact Main Line context inside Overview. Any request to
remove the Main Line identity from Overview entirely, retain the `72rem` cap, or
keep Save in the PageHeader materially changes this specification and requires
an update before task planning.

## 13. Data/API/UX impact summary

- **Data/API:** none.
- **Persistence/migration:** none.
- **Authorization:** no rule change; visibility remains synchronized with
  existing backend permissions and `allowedActions`.
- **Workflow:** same state transitions and side effects; one clearer Save
  location and clearer activation language.
- **UX:** consolidated hierarchy, desktop history rail, aligned section
  navigation/editor, compact Overview identity, professional field/action
  treatment, and stronger responsive/accessibility coverage.
- **External actions:** no deployment, migration, commit, push, or production
  mutation authorized or planned.

## 14. Task-planning status

The dependency-ordered implementation task graph, exact file ownership, and
acceptance-criteria verification matrix will be written to a separate task-plan
file only after this specification is approved.
