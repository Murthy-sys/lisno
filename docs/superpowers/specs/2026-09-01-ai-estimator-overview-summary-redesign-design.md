# AI Estimator Main Line Overview Summary Redesign

## 1. Decision summary

### Requested outcome

Redesign the Super Admin workspace under **Configuration → AI Estimator → Main
Basket → Main Line** so Overview becomes a concise Main Line summary rather than
the current generic metadata form.

Overview will:

- show the Main Line name prominently;
- remove the generic Description editor and description line;
- remove the existing Priority control and the current Modes, Surfaces, and
  Section applicability rule editors;
- provide UOM and Surfaces as dropdown-based controls;
- provide Pricing specifications and Recommendations as dropdown-based summary
  selectors;
- show Modes as radio buttons; and
- show summary information from a detailed workspace tab only when that tab has
  saved, meaningful configuration; empty summary fields, empty cards, and
  “Not configured” placeholder rows are omitted.

Selecting a Mode radio option will reveal the values currently associated with
that Mode, including matching pricing/configuration data. PMC markup will be
shown as a shared quantity/margin value unless the data contract later becomes
explicitly mode-specific.

### Recommended approach

Build a frontend-only Overview composition layer over the existing versioned
section endpoints.

- Keep Overview as the summary/configuration hub.
- Keep Mode, Scope, Recommendations, Quality, Execution, and Advanced as the
  detailed editing tabs and sources of truth.
- Move the primary UOM editor back to Overview and replace the current Surfaces
  multi-select presentation with an accessible multi-select dropdown.
- Use Specifications and Recommendations dropdowns as summary selectors: they
  select which configured row is previewed in Overview, while editing remains in
  its owning tab.
- Use Mode radio buttons as an Overview display filter, not as a destructive
  conversion of the persisted multi-value `modeIds` array into one value.
- Load each section summary through the existing query cache and section API;
  do not duplicate or denormalize section data in a new backend payload.
- Derive summary visibility from the canonical saved section payload. Do not use
  completeness alone as evidence that a section has configured information.
- Keep Main Line identity and the editable UOM/Surfaces controls available;
  progressively disclose tab-derived selectors, details, and cards only when
  their saved data exists.

This approach satisfies the requested information hierarchy while preserving
independent section versions, conflict handling, stable IDs, and the current
backend context/activation rules.

### Decisions fixed by the current architecture

- Main Line identity is `item.mainLineId`/`item.mainLineName`; names are display
  values and never join keys.
- UOM and Overview Surfaces are stored in the `overview` section payload.
- Specifications and price entries are stored in `pricing`.
- Recommendations, Quality, Scope, Execution, and Advanced data remain in their
  matching backend sections.
- Pricing entries may reference one Mode by stable `modeId`; advanced Mode
  overrides also reference stable `modeId` values.
- `pmcMarkupBps` is currently a single quantity/margin value, not a value keyed
  by Mode. The UI must not falsely present it as mode-specific.
- Every section retains its own envelope version and applicability state.

### Approval decisions

Approval of this specification confirms these interpretations:

1. **Overview is a summary hub; detailed tabs remain.** “All tabs info should
   come as summary” means Overview summarizes every tab while the existing tabs
   remain available for detailed editing.
2. **Mode radio buttons select a summary view.** They do not overwrite
   `overview.modeIds` with one value or migrate existing multi-Mode data.
3. **UOM and Surfaces dropdowns edit data; Specifications and Recommendations
   dropdowns inspect data.** Specifications/Recommendations remain editable in
   their owning tabs because each option represents a structured record, not a
   single scalar field.
4. **Description removal targets the generic Main Line/Overview description.**
   Domain fields such as Technical description, Recommendation reason,
   Execution-step description, and required Mode-override detail remain because
   they carry operational meaning and may be contractually required.
5. **Configured-only visibility applies to summary information, not operational
   controls or failures.** Main Line identity remains visible. UOM and Surfaces
   remain available as Overview configuration controls, even before a value is
   selected. Loading, stale-data, and retryable error states remain visible so a
   failed request is never mistaken for an empty section. After a successful
   load, a section with no saved meaningful value is omitted rather than shown
   as an empty card.

If “remove Description in every field” is intended to remove those specialized
domain fields too, this specification must be revised before approval because
that would require backend validation and AI-context contract changes.

## 2. Current-state evidence

### User-visible behavior

- `KnowledgeItemWorkspacePage.tsx` and `KnowledgeOverviewPanel.tsx` now show the
  Main Line identity without the removed generic Description presentation.
- Overview loads the detailed section envelopes in parallel and composes Mode,
  Scope, Recommendations, Quality, Execution, and Advanced summaries.
- UOM and Surfaces are the editable Overview controls. Mode, Specification, and
  Recommendation selection remains view-only summary state.
- The current projection includes every active reusable Mode master, including
  Modes not referenced by the Main Line’s saved section data.
- The current panel renders empty cards, zero counts, “No … configured,” and
  individual “Not configured” values. This creates visual noise and does not
  match the requested configured-only Overview.

### Traced data path and source of truth

- `GET /admin/ai-estimator-knowledge/main-lines/:mainLineId` supplies the stable
  Main Line identity, status, current revisions, top-level configured IDs, and
  backend-derived completeness.
- `GET /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`
  supplies each versioned section payload.
- `PUT` to the same section route updates exactly one section using section and
  aggregate CAS versions.
- TanStack Query keys already cache item and section envelopes independently.
- `syncKnowledgeSectionMutation` already synchronizes affected section and item
  data after a successful update.
- Master APIs provide stable-ID/name pairs for UOMs, Modes, Surfaces, Vendors,
  Taxes, and Priorities. Relationship APIs provide stable Main Basket and Main
  Line names for summary presentation.

### Current field ownership

| Overview content | Canonical owner |
| --- | --- |
| Main Line name | Main Line item detail |
| Generic Main Line description | Main Line item detail / existing Overview payload compatibility field |
| Primary UOM | `overview.uomId` |
| Priority | `overview.priorityId` |
| Overview Modes | `overview.modeIds` |
| Overview Surfaces | `overview.surfaceIds` |
| Section applicability rules | `overview.sectionApplicability` |
| Pricing specifications and price entries | `pricing` |
| Quantity/margin and PMC markup | `quantity-margin` |
| Scope values | `scope` |
| Recommendations | `recommendations` |
| Quality parameters | `quality` |
| Steps/productivity | `execution` |
| Dependencies/Mode overrides | `advanced` |

### Confirmed constraints and gaps

- No aggregate “all section payloads” endpoint currently exists.
- The item detail exposes completeness per section, but completeness alone does
  not contain the configured field values requested for Overview.
- Specifications and Recommendations are structured arrays. Treating them as
  scalar editable dropdowns would lose required fields and stable row IDs.
- Modes and Surfaces are currently arrays. A true single-choice Mode radio input
  would change persistence semantics and require a compatibility decision for
  existing multi-Mode revisions.
- The target frontend files contain existing uncommitted Mode, navigation,
  archive, deletion, layout, and Section-state removal work. Any implementation
  must preserve those changes and inspect each target diff before writing.
- Existing tests cover guided tab navigation, section save/CAS behavior, Mode
  multi-section saves, conflict/discard behavior, stable ID selectors, and the
  current Overview field set. They do not cover an all-section Overview summary
  or Mode-filtered summary.

## 3. Product specification

### Goal and measurable outcome

Give a Super Admin one concise Overview that answers:

- Which Main Line am I configuring?
- Which reusable values are configured?
- What pricing specifications, recommendations, and quality rules exist?
- What is configured in every other tab?
- What data applies to a selected Mode such as PMC?

The user must be able to inspect these answers without opening every tab, while
detailed edits remain safe within the established versioned section boundaries.
Tabs without saved information contribute no empty presentation to Overview.

### Actor and job

- **Actor:** authorized Super Admin with AI Estimator configuration access.
- **Read job:** review one Main Line’s complete configuration and readiness from
  one Overview.
- **Edit job:** update the primary UOM and Overview Surfaces without navigating
  elsewhere.
- **Deep-edit job:** open the owning tab when a structured specification,
  recommendation, quality rule, price, margin, scope, execution step, or
  advanced override needs modification.

Backend permissions remain authoritative. Read-only and archived revisions show
the same summary without edit actions.

### Overview information hierarchy

Overview renders these blocks in order:

1. **Main Line**
   - Main Line name.
   - Main Basket name as context.
   - Revision/status/completeness metadata already supplied by the backend.
   - No generic description line or Description textarea.

2. **Configured values**
   - **UOM:** editable single-select dropdown using stable UOM IDs.
   - **Surfaces:** editable multi-select dropdown using stable Surface IDs.
   - **Modes:** accessible radio group used to select which Mode summary is
     displayed. Options use stable Mode IDs and visible Mode names, and include
     only Modes referenced by saved Overview, Scope, Pricing, or Advanced data.
     Unreferenced reusable Mode masters are not offered as empty summaries.
   - Priority is not shown or editable.
   - Section applicability rules and their Add button are not shown or editable.

3. **Selected Mode details**
   - Selected Mode name and configured/not-configured status.
   - Whether the Mode is referenced by Overview and/or Scope.
   - Matching price entries and their resolved Specification, Vendor, UOM, Tax,
     effective version, and amount when present.
   - Matching Advanced Mode override details when present.
   - Quantity/margin values as a clearly separated **Shared calculation values**
     group, including start margin, bottom margin, PMC markup, wastage, and gap
     behavior. These must not be labelled as specific to the selected Mode.
   - The entire Modes control and Selected Mode details block are omitted when
     no Mode is referenced by saved configuration.
   - Inside a configured Mode, omit individual null/blank details and empty
     price/override groups rather than showing “Not configured.”

4. **Pricing specifications**
   - A dropdown lists configured Specification rows by stable row ID/name.
   - Selecting one displays its configured details and any price versions that
     reference it.
   - An **Open Mode** action moves to the detailed Mode tab without losing
     unsaved Overview changes; the established save/discard/stay guard applies.
   - The entire Pricing specifications block is omitted when no Specification
     row or price entry is saved.

5. **Recommendations**
   - A dropdown lists configured Recommendations by stable recommendation ID and
     resolved target Main Line name.
   - Selecting one displays type, reason, quantity relationship, dependency,
     active state, and resolved target Main Basket/Main Line labels.
   - An **Open Recommendations** action moves to the detailed tab through the
     unsaved-change guard.
   - The entire Recommendations block is omitted when no Recommendation row is
     saved. Within a saved Recommendation, null/blank optional details are not
     rendered.

6. **Quality**
   - Summary count plus configured parameter label, type, required/active state,
     unit/range or allowed values, and default where present.
   - An **Open Quality** action navigates to detailed editing.
   - The entire Quality block is omitted when no Quality parameter is saved.
     Within a saved parameter, null/blank fields and empty allowed-value lists
     are not rendered.

7. **All section summaries**
   - Mode, Scope, Recommendations, Quality, Execution, and Advanced each show a
     compact card only when the corresponding canonical payload contains saved,
     meaningful configuration.
   - A visible card shows only non-empty counts, values, and findings, plus its
     Open action. Zero-valued count rows and empty highlight rows are omitted.
   - The **All section summaries** wrapper is omitted when no cards qualify.
   - Overview does not duplicate raw JSON, stable IDs, actor IDs, or empty form
     controls in these cards.

### Configured-only visibility rules

For Overview summary presentation, a value is meaningful when it is persisted
and is not `null`, `undefined`, a blank string, an empty array, or an object with
no meaningful descendant value.

- Numeric `0` is meaningful and must remain visible when it is saved.
- Boolean `false` is meaningful and must remain visible as **No**, **Inactive**,
  or **Optional**, according to the owning field.
- A saved structured row with a stable ID qualifies its owning section for
  display, even when only some optional fields are populated. Only its available
  fields are rendered.
- An unresolved saved stable ID remains meaningful and is shown as **Unavailable
  value**; the raw ID is never exposed.
- Completeness state, default empty payload shapes, reusable master availability,
  and zero derived record counts do not by themselves qualify a section card.
- Loading and error UI is operational feedback, not empty summary content. It
  remains visible until the application can determine whether saved data exists.
- Shared calculation values are shown only when at least one saved quantity or
  margin scalar exists, including `0`, or at least one quantity slab exists.

### Removed legacy Overview presentation

The redesigned Overview does not render:

- Main Line generic description text;
- Overview Description textarea;
- Priority selector or Add Priority action;
- the existing Modes multi-select or Add Mode action;
- the existing Surfaces multi-select list presentation or Add Surface action in
  that legacy location;
- Section applicability rules repeater; or
- Add Section applicability rule action.

Surfaces are reintroduced in Configured values as the requested dropdown. Modes
are reintroduced as the requested radio summary selector.

### Detailed tabs

- **Mode:** contains detailed Pricing and Quantity & margin editors. Its UOM
  block is removed because UOM returns to Overview.
- **Scope, Recommendations, Quality, Execution, Advanced:** remain detailed
  editors and retain their current source sections and save behavior.
- No first-level tab is removed by this redesign.

### Editing and save behavior

- UOM and Surfaces changes dirty only the `overview` section.
- Saving Overview submits the latest full Overview payload while changing only
  `uomId` and `surfaceIds`; hidden compatibility values such as `priorityId`,
  `modeIds`, `sectionApplicability`, and `description` must be preserved exactly.
- Mode radio selection, Pricing Specification selection, and Recommendation
  selection are view state only and never mark a section dirty.
- Summary card Open actions use the established unsaved-change guard.
- Successful detailed-tab saves refresh every affected Overview summary query.
- A version conflict preserves the local UOM/Surface edits, refreshes the latest
  server envelope and item summary, and uses the existing review/discard flow.

### Loading, empty, error, stale, and permission states

- Main Line identity and revision state remain the page-level loading boundary.
- Overview section summaries load in parallel from independent cached queries.
- Each summary card owns its loading, empty, error, and retry state; one failed
  section must not blank or mislabel the others.
- Until a section loads, its card says **Loading…**, not **Not configured**.
- After a successful load, an empty block/card is removed without rendering
  **No … configured** or **Not configured** summary copy.
- If the entire revision has no tab-derived configuration, Overview contains
  Main Line identity and the available UOM/Surfaces configuration controls, with
  no Mode, Shared calculation, Pricing, Recommendation, Quality, or All-section
  summary blocks.
- Stale cached data may remain visible during refetch with a visible refreshing
  indication where the established query UX supports it.
- Archived or active-history revisions show read-only dropdown values and radio
  summaries; they do not show misleading edit or quick-add actions.
- Missing master/relationship labels display **Unavailable value** without
  exposing raw IDs and offer retry where the source query failed.

## 4. Contract and invariants

### API and persistence

- No new endpoint or response field is required in the recommended approach.
- No database schema, index, migration, seed, backfill, or data rewrite is
  required.
- Existing section GET/PUT contracts remain authoritative.
- Existing Overview payload keys remain accepted and persisted even when their
  old controls are hidden.
- The frontend may query all backend sections when Overview is active and reuse
  cached section envelopes already loaded by other tabs.

### Identity, version, and mutation lineage

- Main Line, section, master, Specification row, Recommendation row, price-entry,
  and Mode-override stable IDs are preserved end-to-end.
- Names are presentation only and are never used to join records.
- Overview writes retain exact section and aggregate expected versions.
- Structured records remain owned by their original section and are not copied
  into Overview payloads.
- Summary selection state is local UI state and is excluded from API payloads.

### Authorization matrix

| Actor state | Read summary | Change UOM/Surfaces | Open detailed tab | Save detailed tab |
| --- | --- | --- | --- | --- |
| Super Admin with read only | Yes | No | Yes, read only | No |
| Super Admin with update on Draft | Yes | Yes | Yes | Yes |
| Active-history revision | Yes | No | Yes, read only | No |
| Archived Main Line | Yes | No | Yes, read only | No |
| Unauthorized role | No configuration access | No | No | No |

Frontend visibility mirrors permissions; backend route authorization remains
the enforcement boundary.

### Financial and calculation invariants

- Money remains integer paise at API/domain boundaries and is formatted as
  rupees for display.
- Percentages remain basis points and are formatted explicitly.
- Overview performs no financial calculation and manufactures no price, tax,
  margin, or PMC value.
- Resolved price-version data and server preview/calculation services remain the
  only sources for financial values.
- `pmcMarkupBps` remains shared quantity/margin data unless a later approved
  contract introduces per-Mode margin settings.

### Cache invalidation

- A saved Overview section updates/invalidate item detail, Overview envelope,
  completeness, and any list/filter consumers already covered by the section
  mutation sync helper.
- Pricing, Recommendations, Quality, Scope, Execution, or Advanced saves update
  their matching Overview summary immediately through the shared query cache.
- Revision creation, activation, deactivation, archive, and duplication reset or
  retarget Overview summary queries to the selected revision.

## 5. UX and content

### Exact primary labels

- **Overview**
- **Main Line**
- **Configured values**
- **UOM**
- **Surfaces**
- **Modes**
- **Selected Mode details**
- **Shared calculation values**
- **Pricing specifications**
- **Recommendations**
- **Quality**
- **Open Mode**, **Open Recommendations**, **Open Quality**, and equivalent
  section actions.

### Dropdown and radio behavior

- UOM uses one labelled native/select-style dropdown with **Not configured**.
- Surfaces uses an accessible multi-select dropdown/combobox with selected chips
  or checkmarked options; it must not rely on Command/Ctrl multi-selection.
- Pricing Specification and Recommendation summary dropdowns retain selection
  when unrelated queries refetch and reset only when their selected stable ID no
  longer exists in the current revision.
- Summary dropdowns are not rendered when their configured option arrays are
  empty; Overview does not show disabled or placeholder-only summary selectors.
- Mode radio buttons are keyboard reachable with standard arrow-key behavior and
  one `radiogroup` name, **Modes**.
- The selected Mode detail region is labelled and announced when its content
  changes without moving focus unexpectedly.

### Responsive layout

- At 1440 and 1024 pixels, Configured values and the principal summary cards may
  use two columns while preserving readable field widths.
- At 768 pixels and below, summary cards stack in one column.
- At 390 and 320 pixels, dropdowns, radio options, summary values, and Open
  actions remain within the viewport without page-level horizontal scrolling.
- Long Main Line, Mode, Specification, and Recommendation names wrap without
  truncating the accessible name.

### Existing design system

- Reuse PageHeader, Surface, Field, Select/SearchCombobox patterns, Button,
  StatusBadge, ProgressBar, InlineMessage, PageState, and the established
  unsaved-changes/version-conflict dialogs.
- Use a feature-local accessible multi-select composition if the existing
  primitives cannot express a non-modifier-key Surfaces dropdown; do not add a
  dependency solely for this control.

### Visual QA matrix

Verify Draft/read-only, configured/empty, partial-error, and selected-Mode states
at 1440, 1024, 768, 390, and 320 pixels, including:

- long Main Line and option names;
- zero, one, and multiple Surfaces;
- no Modes and PMC plus at least one other Mode;
- Specification/Recommendation empty and populated states, confirming empty
  selectors and their containing blocks are omitted;
- Quality text, numeric, dropdown, radio, checkbox, and multi-select parameters;
- one failed summary query while other cards remain usable;
- unsaved UOM/Surface navigation; and
- no Description, Priority, or Section applicability rule controls in Overview.

## 6. Options and tradeoffs

### Option A — Frontend-composed Overview over existing section APIs

**Recommended.**

- Preserves all backend contracts and section ownership.
- Reuses TanStack Query caching and existing mutation synchronization.
- Avoids migration and rollback risk.
- Costs several parallel section GETs on first Overview load; independent card
  states and caching mitigate the UX impact.
- Keeps structured editing in the tabs best equipped to validate/save it.

### Option B — Move every detailed editor into Overview

**Not recommended.**

- Would satisfy a literal “everything in Overview” interpretation but create a
  very long page.
- Requires multi-section dirty state, ordered partial saves, multiple CAS
  conflicts, and more complex discard behavior.
- Duplicates existing tabs or forces their removal, increasing regression risk.

### Option C — Add a backend aggregate Overview endpoint

**Deferred unless performance evidence requires it.**

- Could reduce request count and centralize summary shaping.
- Adds a protected route operation, contract/OpenAPI work, service projection,
  cache invalidation, and synchronized backend/frontend tests.
- Still should not become a second writable source of truth; writes would remain
  section-specific.

### Mode radio persistence alternatives

- **Recommended:** UI-only Mode summary filter. Preserves existing multi-Mode
  data and requires no migration.
- **Rejected without a new decision:** radio writes a single `modeId`. This would
  silently discard or orphan existing multiple `modeIds` and needs an explicit
  compatibility/migration rule.

## 7. Compatibility and operations

- Existing revisions with Description, Priority, multiple Modes, Surfaces, and
  Section applicability rules remain readable by backend/context services.
- Hidden compatibility values are preserved on Overview saves; no field is
  deleted merely because its control is removed.
- Old frontend versions remain compatible because no API contract changes.
- Code rollback restores the prior Overview and Mode UOM presentation without
  data conversion.
- No external side effects, production mutation, deployment, migration, seed,
  commit, or push are authorized by this request.
- Frontend query errors remain observable through the existing inline error and
  retry UI; no new logging or alert is required for a presentation-only change.

## 8. Risks and mitigations

- **Hidden-value loss:** saving UOM or Surfaces could drop Description, Priority,
  Modes, or applicability rules. Preserve and test the full latest Overview
  payload while patching only the visible keys.
- **Mode/PMC misrepresentation:** PMC markup is not currently keyed by Mode.
  Label it Shared calculation values and never claim it is selected-Mode data.
- **Names used as identities:** resolve stable IDs to labels only for display and
  keep selections keyed by stable IDs.
- **Partial Overview load:** independent queries may finish/fail separately.
  Keep per-card loading/error/retry states and never convert an error into an
  empty summary.
- **Falsy-value loss:** naive truthiness filtering could hide saved `0` or
  `false` values. Use an explicit meaningful-value predicate and asymmetric
  fixtures covering null/blank/empty versus zero/false.
- **Navigation loss from hidden cards:** omitting an empty card removes its Open
  action, but the persistent workspace tabs remain the navigation path to create
  the first value in that section.
- **Stale summary after detailed edit:** reuse shared query keys and verify every
  mutation updates the corresponding Overview card.
- **Radio semantics ambiguity:** treat radio state as a display filter. Approval
  explicitly confirms it is not a single-value data migration.
- **Dense mobile layout:** use progressive disclosure inside cards and test the
  full viewport/state matrix.
- **Dirty-work overlap:** inspect and preserve the substantial current
  uncommitted AI Estimator work; assign non-overlapping ownership only after the
  task plan is approved.

## 9. Acceptance criteria

1. The Super Admin Main Line Overview prominently shows the exact Main Line name
   and Main Basket context using stable item identity.
2. The page header and Overview contain no generic Main Line/Overview
   Description presentation or editor.
3. Overview contains no Priority control, legacy Modes multi-select, legacy
   Surfaces multi-select presentation, Section applicability rules repeater, or
   Add Section applicability rule action.
4. Overview provides an editable UOM dropdown and accessible editable Surfaces
   multi-select dropdown; saved updates preserve every hidden Overview payload
   value and exact CAS versions.
5. Overview provides a Pricing specifications dropdown and a Recommendations
   dropdown keyed by stable row IDs only when their owning saved arrays contain
   records; selecting an option changes only the shown summary and never mutates
   data.
6. Overview provides a keyboard-accessible Modes radio group only for Modes
   referenced by saved Overview, Scope, Pricing, or Advanced data. Selecting PMC
   or another configured Mode displays every available value that can be
   correctly associated through that stable Mode ID.
7. PMC markup and other global quantity/margin values appear under Shared
   calculation values only when at least one value is saved, and are not falsely
   attributed to one Mode.
8. Quality summary appears only for saved parameters and displays only available
   labels, types, active/required state, units/ranges or choices, and defaults
   without manufacturing values.
9. A detailed tab has a compact Overview card only when its canonical payload
   contains meaningful saved configuration. Empty cards, zero-count rows,
   placeholder highlights, and the empty All-section wrapper are absent.
10. Mode retains Pricing and Quantity & margin detailed editing but no longer
    contains the primary UOM editor.
11. Detailed tabs remain the canonical editors for structured Specifications,
    Recommendations, Quality, Scope, Execution, and Advanced data.
12. Summary Open actions honor the existing save/discard/stay guard for dirty
    UOM/Surface edits.
13. A failed section query produces a retryable error only in its card; other
    summaries remain accurate and usable.
14. Read-only/archived revisions show the full summary without edit, quick-add,
    or save actions.
15. Existing backend authorization, section applicability, activation,
    completeness, context resolution, financial units, and version/CAS behavior
    remain unchanged.
16. Focused payload-preservation, summary-projection, mode-filter, navigation,
    meaningful-value filtering (including saved `0`/`false`),
    loading/empty/error, accessibility, and responsive tests pass.
17. Frontend typecheck, full frontend tests, production build, rendered viewport
    QA, `git diff --check`, and repository-status review pass without modifying
    unrelated dirty work.

## 10. Non-goals

- No deletion or normalization of stored Description, Priority, Mode, Surface,
  or Section applicability data.
- No new single-Mode persistence rule or migration of `modeIds`.
- No new mode-specific PMC/margin schema.
- No backend summary endpoint in the recommended first implementation.
- No removal of detailed tabs.
- No removal of the UOM or Surfaces Overview configuration controls when their
  saved selection is empty; these controls are how the first value is created.
- No change to non-Super-Admin Configuration pages or reusable master editors.
- No redesign of the Main Basket list, permanent deletion flow, archive flow,
  revision history, or lifecycle commands.
- No dependency addition, production action, deployment, commit, or push.

## 11. Open decisions

There are no additional decisions if the five Approval decisions in Section 1
match the intended request. If any differs—especially specialized Description
removal, single-Mode persistence, or making Specifications/Recommendations
directly editable in Overview—the specification must be updated and re-approved
before task planning.

## 12. Task planning and verification status

The dependency-ordered task graph and acceptance-criteria verification matrix
will be created in a separate task-plan file only after this specification is
approved, as required by the repository approval workflow.
