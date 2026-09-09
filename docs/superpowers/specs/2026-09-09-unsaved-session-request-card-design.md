# Unsaved session changes beneath Revision history

## 1. Decision summary and status

**Status:** Specification proposed; awaiting approval. No task plan or implementation is created at this stage.

Add a compact **Now requesting** card directly beneath Revision history in the current item workspace. It summarizes only the user's current unsaved edits in **Mode** (including PMC, Execution and Specifications), **Recommendation & Exclusions**, and **Quality Parameter**. Already saved, untouched content must never populate the card.

Recommended approach: derive a small, typed change summary from each editor's live draft and its saved baseline. Keep form state and saving inside their existing owners, and pass a presentation-only summary to the workspace rail. This accommodates the independent Mode and shared-quality save lifecycles without creating a second editable draft.

The user has fixed the placement, the three tab contexts, compact presentation, and unsaved-only requirement. Assumptions below resolve routine presentation details; no additional architecture decision is needed before spec approval.

## 2. Current behavior and evidence

Read-only investigation on 2026-09-09 found a clean worktree before this specification was added.

- `frontend/src/features/ai-estimator-knowledge/KnowledgeItemWorkspacePage.tsx` renders the active editor beside `KnowledgeRevisionHistory`. It owns the Recommendation & Exclusions `payload`, a sticky `dirty` flag, and save/discard/navigation handling. A dirty boolean alone cannot identify which fields actually differ or whether an edit has been reverted.
- `KnowledgeRevisionHistory.tsx` displays saved revision metadata with independent loading, empty, refresh-error, and retry states. It receives no live draft data.
- `KnowledgeModePanel.tsx` owns independent `advanced` (Mode configuration) and `pricing` (Specifications) drafts. Mode saves changed blocks in order and can succeed for one block before another fails. Only dirty/saving/error signals currently reach the workspace.
- `KnowledgeModeConfigurationBuilder.tsx` keeps PMC/Execution visibility and selected execution source as local viewing controls. Toggling those controls alone does not persist a configuration. It also exposes editable scope lists and dynamic fields. `KnowledgeModeDescriptionEditor.tsx` keeps pending paragraph text locally before applying it to the section draft. `KnowledgeModeCalculationEditor.tsx` keeps incomplete numeric input locally and only emits parsed settings when valid.
- `KnowledgeBasketQualityPanel.tsx` owns a basket-scoped checklist draft and its original version, using `getKnowledgeBasketQuality` / `updateKnowledgeBasketQuality`. The saved item-specific quality section is separate, read-only historical content. Importing rows becomes a local checklist draft before saving.
- `KnowledgeSectionEditor.tsx` includes budget-alteration rules and legacy recommendation/exclusion rows, with stable row/reference IDs. The newly implemented related-item dialog saves catalog creation separately from the unsaved rule's target selection.
- `ai-estimator-knowledge.css` gives the history rail an approximately 18rem width and sticky positioning on wide screens. At widths up to 1180px, it becomes a full-width surface below the editor.

Existing relevant regression suites include `KnowledgeScreens.test.tsx`, `KnowledgeItemWorkspaceLayout.test.tsx`, `KnowledgeModeSectionStateRemoval.test.tsx`, `KnowledgeBasketQualityPanel.test.tsx`, `KnowledgeBudgetAlterationBuilder.test.tsx`, and `KnowledgeSpecificationBuilder.test.tsx`. New summary-specific coverage is needed.

## 3. Scope, actors and non-goals

### Included

- A single read-only card in the existing workspace, below the Revision history surface, for the active requested tab only.
- Live summaries of additions, meaningful updates, removals, cleared values, and meaningful ordering changes in those editors.
- Independent saved baselines and summary cleanup for Mode blocks and the shared checklist.
- Concise styling, long-content handling, accessible disclosure, and desktop/mobile verification.
- Small additive draft-summary callbacks for nested editors where pending text is not yet present in the parent payload.

### Excluded

- Overview and other unrequested destinations; new tabs, a full workspace redesign, or replacing Revision history.
- Persisting session previews, autosave, local/session storage recovery, cross-tab draft accumulation, or an audit log of every keystroke.
- New save/discard actions, changed save ordering, changed validation, approval/activation behavior, or navigation guard semantics.
- Changes to catalog creation, backend APIs, permissions, financial calculations, quality-checklist scope, or revision-history records.
- Database migration, seed, deployment, commit, push, or production mutation.

Actors retain existing access. An authorized editor sees a preview of that editor's unsaved draft. Read-only users and archived/noneditable contexts show no request card. Quality retains its existing basket-level editability rules, which differ from item-revision editability.

## 4. Product behavior

### 4.1 What counts as an unsaved change

Compare the current editable values with the saved baseline accepted by that editor, rather than showing an entire payload when its dirty flag is true.

- Initial load, a saved draft revision, opening a tab, viewing PMC/Execution, switching execution source, opening a dialog, or focusing a field produces no preview entry by itself.
- Selecting a persisted value, adding/editing a row, changing a field, clearing a value, or removing saved content updates the card while the user works.
- A new row shows its minimal entered data, with **Incomplete** when required information is missing. A blank row intentionally added by the user may show one compact incomplete placeholder; untouched default scaffolding is excluded.
- An existing row shows its identity/context and only the changed fields with their current values. It does not repeat unchanged descriptions, options, prices, related rules, or other saved fields.
- A removal shows the row label only as identity and **Removed**; clearing a field shows **Cleared**. Do not display a before/after table or previous saved values. Identity labels are the sole necessary saved-content exception for explaining an edit/removal.
- Reverting a value to the baseline removes that entry. Adding and then removing the same new row cancels its entry. If all meaningful changes are reverted, hide the card even if an existing editor dirty flag remains set.
- Use stable row IDs and source identities to match records. Names are display text, never joins. Existing ID-less legacy rows require conservative local identity handling; do not guess identity from equal labels or inject new persisted IDs for this preview.
- Treat normalization and default expansion consistently with existing editor semantics. Materializing default PMC rows or compatibility fields must not falsely label untouched defaults as new user content. Preserve meaningful zero/false values; do not broadly trim or coerce arbitrary input just to suppress changes.

### 4.2 Minimal content by tab

For additions, the table gives the compact identifying content to show when entered. For updates, show the identity plus only fields that changed. Optional unchanged values are omitted.

| Tab / group | Minimal card content |
| --- | --- |
| Mode → PMC | Changed inclusion/exclusion name and selected state; edited margin or calculation inputs with existing units; edited paragraph excerpt. Group as PMC and distinguish inclusions from exclusions. |
| Mode → Execution | Execution source (Sub-Vendor or In-house; Labor/Material where relevant), component label and entered value; show changed type/options when those definitions themselves are edited. Include changed calculation inputs using existing rupee/percentage formatting. |
| Mode → Specifications | Added/edited specification name and a short description when entered or changed. Specifications remain shared across Mode contexts as the current model defines; do not imply they belong only to the currently visible PMC/Execution panel. |
| Recommendation & Exclusions | Changed rule identity, trigger, Scope action, Related item, and reason when entered/changed. Include changed Enabled state. Show existing legacy recommendation/exclusion edits using readable labels, selected references and changed descriptions/priority as applicable. |
| Quality Parameter | Question/check and answer type, entered/changed answer options, acceptance criteria, photo evidence and required photo count as applicable. Include imported rows once imported into the editor draft. Show **Shared checklist · [Main Basket]** as context. |

Any other field the current in-scope editor allows the user to change must receive a concise labeled change entry; it must not disappear merely because it is optional. Internal metadata and unrelated compatibility fields are not user content.

For reference fields, resolve labels through the editor's existing catalog/query data by ID. While a label is unavailable, use a clear fallback such as **Selected related item — details unavailable**. Do not show raw IDs, invent names, guess across baskets, or add new reference-fetch flows solely for this card. Use authoritative returned creation details when already available so a new related item's name appears even during delayed list refresh.

Opening/cancelling a related-item creation dialog does not add a pending rule entry. After successful catalog creation and target selection, preview the unsaved rule change only. Do not describe the already-created catalog item itself as an unsaved record.

### 4.3 Lifecycle and failure handling

The session means the currently mounted item/revision/tab editor. Existing navigation guards still decide whether to save, discard or stay.

| Event | Required card behavior |
| --- | --- |
| Editor or catalog loading, no local changes | Hidden; never preview an empty initial payload as a deletion of saved content. |
| Unsaved meaningful edit | Appear and update in place without moving focus. |
| User edits again | Replace the same entry's pending value; do not accumulate a chronology. |
| Save pending | Keep the pending entries, optionally label **Saving…**. |
| Server confirms a saved block | Remove that block's saved changes and advance its baseline using the authoritative response, even if background refresh remains delayed. |
| Mode save partly succeeds | Remove successfully saved block entries; retain only failed/unattempted changes. |
| Validation failure, transport failure or version conflict | Preserve the local preview and existing recovery controls; never replace it with server-review content. |
| Background refetch while editing | Do not move the original baseline or attribute another actor's saved changes to this session. |
| Discard, successful save of all changes, or complete revert | Hide the card. |
| Navigate after save/discard; item, revision or basket identity changes | Clear the old summary; no stale content may flash or arrive from late child callbacks. |
| Stay after a navigation warning | Keep the same pending entries. |

Inline paragraph Apply/Save only moves text into the section draft; it does not make the change disappear until the enclosing Mode block is saved to the server. Cancelling that inline edit returns the preview to the enclosing draft's remaining changes. Incomplete calculation text must not show the last valid saved number as if it were the user's current input; show the current pending text with an incomplete indication. Simulator-only inputs and dialog-only drafts are outside the card until they modify the editor draft.

## 5. UX and styling

- Place a distinct sibling card immediately below Revision history, in a shared rail wrapper. Preserve history entries and their independent loading/error/retry states. A history fetch failure must not suppress the local card.
- Exact title: **Now requesting**. Status badge: **Unsaved** (or **Saving…** while saving). Context: active tab name; quality additionally states its Main Basket scope. Helper: **Only changes from this editing session are shown.**
- Group content with small headings and readable label/value rows. Use **Added**, **Updated**, **Removed**, **Cleared**, **Order changed**, and **Incomplete** text where applicable; status must not depend on color alone. Group incomplete state with the relevant edit rather than claiming save readiness.
- Show up to four changed entries initially, with an accessible **Show all N changes** / **Show fewer changes** button for longer drafts. One entry means one changed row, one standalone scalar field, or one ordering operation; updates within a row are grouped. Expanding shows only remaining unsaved changes.
- Long descriptions initially use a short excerpt (approximately 160 characters); offer accessible disclosure of the full changed value. Keep every pending change inspectable, with wrapping rather than horizontal scroll. No nested form controls or duplicate save buttons.
- Reuse established `Surface`, `StatusBadge`, button, spacing, color and border tokens. Use a quiet surface, a thin border with a restrained warm unsaved accent, approximately 12–16px internal spacing, clear 14–16px title and readable body text. Match the existing workspace typeface and rounding; avoid heavy shadows or decorative gradients.
- Desktop: retain the current approximately 18rem rail. Group the two surfaces without causing a long expanded rail to become unreachable; use normal document scrolling when necessary. At the existing 1180px breakpoint and below, stack the rail below the editor with history followed by the request card.
- Use a labeled semantic section and appropriate subheadings/lists or definition lists. Disclosures are native buttons with expanded state and keyboard support. Updating summaries must not move input focus or announce the entire card on every keystroke. Respect reduced motion; no entrance animation is required.

Illustrative synthetic examples (only after these local changes):

```text
Now requesting                         Unsaved
Mode
PMC · Updated
  Inclusion: Transport — Selected
Specifications · Added
  Name: Moisture-resistant gypsum board
  Description: For the utility ceiling
```

```text
Now requesting                         Unsaved
Quality Parameter · Shared checklist · POP / Gypsum
Ceiling alignment · Updated
  Acceptance criteria: Joints aligned with approved layout
```

In the second example, the saved answer type, other questions, and unchanged photo requirements are omitted.

## 6. Data contract and implementation constraints

- Frontend-only presentation contract. Existing backend saved envelopes/checklist responses remain authoritative. No persistence, API schema, authorization registry, audit, or query-key changes are required.
- Keep a baseline snapshot with each draft owner, scoped to item/revision/section or basket/checklist version, accepting newer data while clean and freezing the relevant original baseline while dirty. Rebase only through the editor's existing accepted save/discard/conflict-resolution lifecycle. Do not change expected-version/CAS request semantics under this feature.
- Use small typed summary groups/entries or an equivalent pure projection contract; the card never receives a writable draft. New child callbacks must be optional for existing callers and must clean up safely on unmount/source changes and StrictMode remounts.
- Nested local input summaries must preserve their existing validation and commit behavior. Do not read the DOM or serialize whole forms to obtain pending values.
- Compare only relevant user-editable properties; use semantic matching for rows and order where order has meaning. Do not render raw JSON, version numbers, storage IDs, or copied saved snapshots.
- Keep PMC/Execution/Sub-Vendor/In-house and basket identities separate. Labels and numerical formatting reuse current helpers. The card shows inputs; it does not recompute margins, totals, or estimations.
- Preserve newly delivered related-item detail and all existing temporary-item behavior. Temporary items get the card for their available Mode and Quality tabs only.
- No new dependencies, lockfile changes, network services, logging of entered content, or analytics are needed. Rollback is removal of this frontend projection and rail addition; no data rollback applies.

## 7. Alternatives and rationale

The existing architecture establishes a credible approach: local draft owners emit a read-only projection to the workspace. Moving all drafts into a new global session store would expand lifecycle and save risk without helping this single-card request. Reusing the saved Overview summary would violate the user's unsaved-only requirement. Neither is in scope.

## 8. Acceptance criteria

1. **AC1 — Placement and styling:** All three requested tabs show a compact Now requesting card beneath Revision history when meaningful pending edits exist. Clean/read-only states have no card. Existing history and responsive placement remain functional.
2. **AC2 — Unsaved-only precision:** Existing saved content, untouched defaults, mere view selections and metadata never become change entries. Changed rows show only changed values plus minimal identity. Revert and add-then-remove eliminate entries; saved removals/clears remain understandable.
3. **AC3 — Mode coverage:** PMC scope selections, execution components, paragraph drafts, valid/incomplete calculation inputs and Specifications produce correctly scoped summaries. Unchanged PMC data never appears as Execution changes or vice versa. Partial Mode saves leave only unsaved blocks.
4. **AC4 — Recommendation coverage:** Rule edits and supported legacy entries show readable values, real target identity and the current scope action/reason changes. Custom/temporary catalog creation retains its independent lifecycle. Cancellation and failed creation do not fabricate changes.
5. **AC5 — Quality coverage:** Manual/imported checklist edits show only pending rows/fields with Main Basket context, preserving options and evidence semantics. Previously saved shared and item-specific checklists are not copied into the card.
6. **AC6 — Lifecycle isolation:** Successful saves/discards clear the appropriate entries; failures/conflicts keep them. Background refresh and item/revision/basket navigation cannot substitute server content or stale callbacks for current local edits.
7. **AC7 — Accessibility and usability:** Desktop, intermediate and narrow mobile layouts wrap long labels. Disclosure controls work by keyboard with correct accessible names, existing input focus stays stable, and scoped accessibility checks pass.
8. **AC8 — Compatibility:** Existing save, CAS, authorization, navigation guards, temporary-item and revision-history behavior remain unchanged. Frontend typecheck/build, focused regressions and whitespace hygiene pass with reported limitations.

## 9. Verification strategy and risks

After the remaining gates, verification will include pure projection tests for equal baselines, changed scalars, IDs, duplicate labels, defaults, reordered/added/removed rows, empty/false/zero values and long/incomplete inputs; rendered integration checks across the three editor owners; partial save, conflict/refetch and navigation isolation tests; and desktop/intermediate/mobile browser inspection using synthetic data. Use two different items/baskets, unequal PMC/Execution values and successive saved versions to expose identity leaks.

Run focused changed frontend suites, `npm run typecheck`, `npm run build`, `git diff --check` and `git status --short`. Record the exact commands and browser results in the separate task plan during implementation. Backend/OCR checks are not expected unless implementation evidence requires changing those surfaces; such a scope change must be reported first.

Principal risks are false changes from default expansion, baselines drifting after refetch, hidden child input drafts, partial saves being cleared together, and a long sticky rail becoming inaccessible. The rules and verification above explicitly address these. No implementation checks have been run at specification stage.

## 10. Assumptions, open decisions and next gate

- “Same tab” means the active workspace tab, using the existing Revision history rail; it does not mean a new browser tab or a replacement history view.
- “Recently not saved session data” means the current difference from the accepted saved baseline, including pending removal/clear operations, rather than only the last edited control or a time-based activity log.
- PMC/Execution view selections alone are not saved data changes and do not create card entries. The changed values inside those panels do.
- No blocking open decision remains with these assumptions. Only this specification is created now. The dependency-ordered task plan, ownership, exact checks and execution-mode choice follow their respective approval gates in `AGENTS.md`.
