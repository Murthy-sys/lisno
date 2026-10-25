# Preserve and reuse existing In-house configuration

## Goal and current evidence
Existing production In-house settings must remain available when components are added. Dragging the existing configuration onto an added component replaces that component's content while keeping the original. Existing code retains raw legacy fields and materializes a `legacy-in-house` component on first Add, but labels it like an ordinary component and permits removing it. A component array suppresses the original standalone editor.

## Scope and decision
Use the existing component contract and section save flow. Identify `legacy-in-house` as Existing In-house configuration, keep its expandable editor and remove no existing fields. Prevent removing this source through the component UI. Before first Add, the existing standalone editor remains available. After conversion, use the materialized source component, never reconstruct it from obsolete root fields: editing other modes may have normalized those retained fields. Explicit empty arrays stay empty and are not automatically repopulated. Do not infer a source for previously converted arrays that have no preserved component.

The full configuration section is draggable from its non-interactive surface, with a dedicated header drag handle as well. Any configured component can supply the whole scope and cost configuration to a different non-preserved component. The original preserved configuration is never overwritten. Keep input, select, checkbox, label, editable-text and ordinary button gestures independent. A destination chooser on each source handle and the Use existing configuration shortcut provide the same behavior for keyboard and touch. Newly added blank components are eligible destinations. Preview the replacement in the target and save through Save Mode. Retain source, target ID/Main basket/Sub-basket, sibling settings, other modes, and legacy storage. Copy inclusions, exclusions, Labour, and Material only. A legacy single expense remains Labour with Material unset; do not duplicate it.

## Interaction and permissions
Show the source clearly, with compact saved cost summaries and an explanation that copying retains it. Mark eligible targets while dragging and expand/focus the replaced target. Use internal gesture tokens bound to item/revision/data source/editor identity; reject external or stale drags. Disable mutations while read-only or saving. Require complete raw input for the chosen source; replacement intentionally clears only target raw edits and checklist text. Keep sibling pending edits. Announce the replacement and Save Mode requirement. Prefer existing neutral tokens and small radii without animation or new icons.

## Persistence and safety
No new endpoint, schema, dependency, deployment, migration, production query, seed, or automatic data write. Replacement is a local draft edit using existing section/aggregate CAS, conflict review, and Save Mode. Active/approved history and stored estimate amounts are not rewritten. Existing explicit estimate component selections remain authoritative; target identity never changes. Older estimates may require current configuration review after conversion under the existing selection policy. Previously removed source components are outside automatic recovery scope.

## Acceptance and verification
1. First Add retains unequal legacy scope/cost values exactly and exposes the preserved source.
2. Dragging the entire section or its handle replaces all target content, including blank newly added destinations, preserves identities/source/siblings/root fields, and deep clones arrays/settings. Ordinary configured components can also supply a copy; input editing never starts a section drag.
3. Legacy single/global cost remains one cost after other-mode edits and reload.
4. Target raw fields reset even if copied values equal saved target values; sibling pending fields survive.
5. Keyboard/touch and drag share the same operation; invalid source, external/stale drags, read-only and saving cannot mutate.
6. Failed saves and conflicts retain draft replacement; normal CAS remains unchanged.
7. Source and target controls work on narrow and wide viewports with visible keyboard focus and accessible status.

## Execution authority
The user's explicit autonomous implementation instructions supersede the repository's default staged approval ceremony. Filesystem restrictions still require approval before applying reviewed changes outside the writable workspace. Implement and verify in an isolated temporary snapshot first.
