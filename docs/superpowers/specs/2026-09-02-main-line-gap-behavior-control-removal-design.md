# Main Line Gap Behavior Control Removal Specification

## Goal

Remove the **Gap behavior** dropdown shown under **Configuration → Main Basket → Main Line → Mode → Quantity & margin** while preserving the remaining margin and quantity-slab functionality.

## Current behavior and evidence

- `KnowledgeModePanel.tsx` renders the `quantity-margin` section through `KnowledgeSectionEditor` inside the Main Line Mode workspace.
- `KnowledgeSectionEditor.tsx` currently renders a labelled **Gap behavior** select before Start margin, Bottom margin, PMC markup, and Wastage.
- The selector edits the existing `gapBehavior` payload property and offers `reject` and `no_adjustment`, with **Not configured** as its empty option.
- The backend still recognizes `gapBehavior` as part of the `quantity-margin` payload and uses it when validating and interpreting quantity-slab gaps.
- New Main Lines initialize the Quantity & margin payload as `{}`. Adding a Quantity slab currently introduces `quantitySlabs` without manufacturing another property, while backend validation requires `gapBehavior` whenever `quantitySlabs` is present.
- The governed bootstrap data already uses `no_adjustment` as its Quantity-slab gap behavior.
- The worktree was clean before this specification was created, so no pre-existing target-file edits need reconciliation at this gate.

## Scope

- Remove the rendered **Gap behavior** label and dropdown from the Main Line Quantity & margin editor.
- Apply the removal to editable and read-only revisions because both states use the same editor branch.
- When a user first adds a Quantity slab to a payload that has no `gapBehavior`, add the established `no_adjustment` value to that local payload so the slab remains saveable.
- Keep Start margin, Bottom margin, PMC markup, Wastage, Quantity slabs, preview, block status, and Mode save behavior intact.
- Add focused frontend regression coverage for the absent control, the unchanged remaining Quantity & margin fields, existing-value preservation, and fresh-section slab creation.

## Non-goals

- Do not remove or rename the Quantity & margin block.
- Do not delete or rewrite previously saved `gapBehavior` values.
- Do not change quantity-slab calculation, validation, backend contracts, OpenAPI, persistence, CAS versions, authorization, or activation behavior.
- Do not default `gapBehavior` when a user edits margins, previews calculations, loads a section, or saves a payload without Quantity slabs.
- Do not override an existing `reject` or `no_adjustment` value when adding another slab.
- Do not change the read-only Overview summary or conflict-review presentation of previously saved data.
- Do not change Pricing, Mode configuration, or any other Main Line tab or section.
- Do not add dependencies, stage, commit, push, deploy, migrate, or mutate production data.

## Requirements

1. Mode → Quantity & margin must not render a field labelled **Gap behavior** or its select control.
2. The control must be absent in editable, read-only, archived, and conflict-recovery render paths that use the Quantity & margin editor.
3. Start margin, Bottom margin, PMC markup, Wastage, Quantity slabs, and server preview must retain their existing rendering and behavior.
4. Hiding the field must not manufacture a deletion or replacement of a loaded `gapBehavior` property when another Quantity & margin value is edited and saved.
5. Adding the first Quantity slab to a payload without `gapBehavior` must add `gapBehavior: "no_adjustment"` in the same local payload update before save.
6. Adding a Quantity slab to a payload with an existing `gapBehavior` must preserve that value exactly.
7. Mode must retain one **Save Mode** action and the established independent section version, dirty-state, partial-failure, and conflict behavior.
8. The frontend must continue to send the complete loaded Quantity & margin payload, including hidden properties, subject to the existing editor update semantics.

## Assumptions

- The supplied screenshot identifies the **Gap behavior** form control as the requested removal; the request does not remove the full Quantity & margin block or the quantity-slab domain contract.
- Existing saved `gapBehavior` values may affect backend quantity-slab behavior, so presentation removal must not erase or reinterpret them.
- `no_adjustment` is the least-surprising compatibility default for a newly added slab because it matches the repository's governed bootstrap payload; it is introduced only when slab creation makes the backend field mandatory.

## Constraints

- Preserve existing frontend permission gating and backend authorization.
- Preserve section and aggregate CAS semantics and Mode's established save order.
- Preserve hidden and unrelated payload properties through edits.
- Use the existing editor layout; no shared component or design-token change is required.

## Risks and mitigations

- **Accidental behavior change:** retain loaded `gapBehavior` data unchanged and avoid backend or calculation edits.
- **Hidden-data deletion:** cover editing a remaining margin field while preserving an existing hidden `gapBehavior` value.
- **Fresh slab cannot save:** set `no_adjustment` atomically with the first slab addition when the payload has no saved value, then cover the resulting API payload.
- **Existing gap policy overwritten:** condition defaulting on the property being absent and cover preservation of an existing value.
- **Layout regression:** verify the remaining basis-point fields flow naturally after the first grid item is removed.
- **Test coupling:** update only assertions that directly expect the removed control; retain broader Mode save and interaction coverage.

## Acceptance criteria

1. No **Gap behavior** label or dropdown appears in Main Line Mode → Quantity & margin.
2. Start margin, Bottom margin, PMC markup, Wastage, Quantity slabs, and preview remain available under their existing rules.
3. Saving another Quantity & margin edit preserves any previously loaded `gapBehavior` property exactly.
4. Starting from a fresh `{}` Quantity & margin payload, adding and completing a slab produces a save payload containing `gapBehavior: "no_adjustment"` without showing a Gap behavior control.
5. Adding another slab preserves an existing `reject` or `no_adjustment` value rather than replacing it.
6. Read-only and archived revisions expose no mutable replacement for the removed control.
7. Focused Quantity & margin/Mode tests, frontend typecheck, frontend build, and `git diff --check` pass.
8. No backend, API, persistence, calculation, authorization, migration, dependency, or external-system change is introduced.

## Data, API, and UX impact

- **Data:** existing `gapBehavior` data is retained; fresh payloads receive `no_adjustment` only when a user adds the first Quantity slab. No backfill or deletion occurs.
- **API/backend:** unchanged.
- **Persistence/migration:** none.
- **Authorization:** unchanged.
- **UX/accessibility:** the labelled dropdown and its keyboard/focus stop are removed; the remaining Quantity & margin controls close the space in normal grid order.
- **External actions:** none authorized.

## Open decisions

No open decision remains if the fresh-slab compatibility default is approved. Removing `gapBehavior` from stored data, validation, calculations, Overview, or API contracts would be a separate material change.
