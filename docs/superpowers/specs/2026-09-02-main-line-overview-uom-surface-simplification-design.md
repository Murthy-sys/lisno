# Main Line Overview UOM and Surface Simplification Specification

## Goal

Remove the **Surfaces** control from Main Line Overview and simplify the remaining UOM editor by renaming **Add unit of measure** to **Add Unit** and placing that button beside the Unit of measure dropdown.

## Current behavior and evidence

- `KnowledgeOverviewPanel.tsx` renders a two-column **Configured values** grid with Unit of measure (UOM) on the left and the `KnowledgeSurfaceMultiSelect` control on the right.
- The UOM field uses the generic `knowledge-master-control` grid, so its **Add unit of measure** quick-add button renders below the dropdown.
- UOM and Surface loading/error states are rendered independently beneath their controls.
- Overview edits spread the loaded payload before changing `uomId` or `surfaceIds`, which currently preserves unrelated Overview properties.
- `KnowledgeOverviewPanel.test.tsx`, `KnowledgeScreens.test.tsx`, `KnowledgeItemWorkspaceLayout.test.tsx`, and `ai-estimator-knowledge.css` contain direct expectations for the Surface control, the old button label, and the current two-column geometry.
- All four target files already contain approved uncommitted Overview/Gap-behavior work; those existing diffs must be preserved and integrated rather than overwritten.

## Scope

- Remove the Surfaces label, trigger, selection popover/listbox, loading state, and error state from Main Line Overview in editable, read-only, loading, error, active, and archived states.
- Rename the Overview UOM quick-add trigger exactly to **Add Unit**.
- Render the UOM dropdown and **Add Unit** button on the same row, with the dropdown consuming available width and the button retaining intrinsic width.
- Keep UOM loading/error feedback below the combined row and spanning its full width.
- Update focused component, workspace, layout, responsive, and accessibility regressions for the new field inventory and geometry.
- Remove Overview-only Surface imports, local variables, reference-state participation, and selectors that become unused.

## Non-goals

- Do not delete, clear, migrate, or rename saved `surfaceIds` in Overview payloads.
- Do not remove Surface reusable values, Surface APIs, Surface master data, Surface types, or the reusable-values management screen.
- Do not remove `surfaceIds` from frontend/backend contracts, summaries, history, conflict data, or persistence.
- Do not change the Quick add UOM dialog title, fields, submit action, API request, or the reusable master terminology outside the Overview trigger.
- Do not change UOM selection, quick-add creation, stable-ID storage, dirty state, CAS save behavior, permissions, or read-only gating.
- Do not change the previously approved Gap behavior or Overview section-summary removals.
- Do not add dependencies, stage, commit, push, deploy, migrate, or mutate production data.

## Requirements

1. Main Line Overview must not render a **Surfaces** label, trigger, selected-value description, popover, listbox, loading message, or error message.
2. The absence must apply in editable, read-only, active, archived, loading, error, and permission-restricted states.
3. The UOM quick-add trigger must have the exact visible and accessible name **Add Unit**.
4. The UOM select and **Add Unit** button must share one row; the select must shrink safely, the button must remain usable, and neither may cause horizontal page overflow at the supported 320 px minimum width.
5. When quick add is unavailable or the revision is read-only, the button remains absent while the UOM field uses the available row width.
6. UOM loading/error feedback must remain associated with UOM, render beneath the row, and span the row width; Surface reference failures must no longer produce Overview feedback.
7. Selecting or quick-adding a UOM must preserve the complete loaded Overview payload, including any hidden `surfaceIds`, exactly except for `uomId`.
8. Principal Overview panels, Mode selection, other tabs, save/navigation behavior, and all previously approved UI removals must remain unchanged.

## Assumptions

- “Remove surfaces from overview” is a presentation/editing removal only; existing Surface data remains valid and may be used by backend or other product surfaces.
- “Keep that button next to unit of measure dropdown” means a single responsive row in both desktop and mobile layouts rather than moving the button to a separate toolbar or line.
- Only the Overview trigger is renamed to **Add Unit**; the quick-add dialog can retain the established UOM terminology.

## Constraints

- Preserve frontend permission gating and backend authorization.
- Preserve the loaded Overview payload through UOM edits so hidden keys are not manufactured, dropped, or reset.
- Preserve existing touch-target, keyboard, focus, accessible-name, and disabled-state behavior.
- Preserve all unrelated changes in the already-dirty target files.
- Use existing Button, Field, and Select primitives; no dependency or shared primitive change is required.

## Risks and mitigations

- **Hidden Surface data deletion:** keep the full-payload spread update and add explicit UOM select/quick-add preservation regressions with existing `surfaceIds`.
- **Mobile overflow:** use a bounded two-column UOM row (`minmax(0, 1fr)` plus intrinsic button), retain the 44 px touch target, and verify the mobile layout contract.
- **Button vertically misaligned with the select:** align the quick-add button with the control row rather than the field label and cover the dedicated CSS geometry.
- **Surface errors leak into Overview:** remove Surface reference state from Overview's relevant-source aggregation and test that a failed Surface source does not disable or warn the UOM editor.
- **Read-only regression:** verify UOM remains disabled and no Add Unit or Surface control is rendered for active/archived revisions.
- **Prior work overwritten:** capture and reconcile existing diffs in Overview component/tests, workspace tests, layout tests, and feature CSS before writing.

## Acceptance criteria

1. No Surface UI or Surface source-state feedback appears anywhere in Main Line Overview.
2. The Overview quick-add trigger reads **Add Unit** and the old **Add unit of measure** label is absent.
3. The UOM dropdown and Add Unit button render beside each other without overflow at desktop, tablet, mobile, and the 320 px minimum width.
4. UOM loading/error, disabled, read-only, quick-add, selection, dirty, and save behavior remain correct.
5. UOM selection and quick add preserve existing hidden `surfaceIds` and all other loaded Overview payload keys.
6. Principal Overview content, Mode behavior, the removed All section summaries block, and the removed Gap behavior control remain unchanged.
7. Focused Overview/workspace/layout tests, accessibility checks, frontend typecheck, full frontend tests, production build, and `git diff --check` pass.
8. No backend, API, contract, persistence, authorization, migration, dependency, or external-system change is introduced.

## Data, API, and UX impact

- **Data:** no deletion or migration; hidden saved `surfaceIds` are retained through UOM writes.
- **API/backend:** unchanged.
- **Persistence/migration:** none.
- **Authorization:** unchanged.
- **UX/accessibility:** Configured values exposes only UOM; its shorter **Add Unit** action is adjacent to the dropdown, removes the Surface focus/popover path, and retains UOM status feedback and accessible naming.
- **External actions:** none authorized.

## Open decisions

No open decision remains for the screenshot-scoped change. Removing Surface data/contracts or relocating Surface editing elsewhere would be a separate material feature decision.
