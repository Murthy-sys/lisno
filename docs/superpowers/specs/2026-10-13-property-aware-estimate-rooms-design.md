# Property-aware estimate rooms

## Status and goal

Status: approved on 2026-10-13. The separate task plan was approved and the user selected Mode A. Implementation and verification are complete; exact evidence and verification limits are recorded in the [task plan](../plans/2026-10-13-property-aware-estimate-rooms.md).

Make the estimate room picker depend on the selected property type. Preserve Common Areas and Other, generate the applicable bedrooms and their optional balconies/bathrooms, and remember an explicit bedroom count for Villa, Duplex, and Penthouse when an estimate is saved and resumed.

This is a new request following the unified lead estimate landing change. Its existing edits and approved documents must be preserved.

## Confirmed user decisions

- Each bedroom has independent optional entries: Bedroom N, Bedroom N Balcony, and Bedroom N Bathroom. A separate Common Bathroom remains available.
- Villa, Duplex, and Penthouse ask for the bedroom count.
- Studio uses a combined living/sleeping area with optional kitchen, bathroom, and balcony choices.
- Common Areas and Other remain in the room picker.

## Current behavior and evidence

- `frontend/src/features/leads/propertyTypes.ts` offers 1BHK, 2BHK, 2.5BHK, 3BHK, 3.5BHK, 4BHK, Villa, Penthouse, Studio, and Duplex.
- `LeadEstimateWorkspace.tsx` defines one static eleven-room catalogue and group/icon maps. Every property gets Master Bedroom, Bedroom 2, Bedroom 3, Master Bathroom, and Common Bathroom. The property dropdown does not affect that list.
- Workspace hydration restores `propertyType`, rooms, dimensions, and items from the saved estimate. No bedroom-count state or field exists. `leadsApi.ts` has no bedroom count in `EstimateDraftInput` or its response type.
- `RoomsMultiSelectDropdown.tsx` has Common Areas, Bedrooms, Bathrooms, and Other groups. Search, Select all, selected chips, and keyboard navigation operate on its supplied options. Selected rooms absent from those options are not represented in the chips.
- Removing room types in `handleRoomsChange` removes their associated estimate items. Automatically filtering selected rooms after a type/count change would therefore risk losing scope and prices.
- Configured items join rooms by stable room ID; the legacy workspace path also uses saved room labels. Renaming existing Master Bedroom/Master Bathroom records would be unsafe.
- `backend/src/routes/estimates.ts` validates an explicit strict estimate input, saves through a Mongo transaction, and enforces existing ownership, locked-state, and configured-estimate version checks. `backend/src/models/Estimate.ts` stores property type and room records but no bedroom count. `backend/src/openapi.ts` explicitly describes `EstimateInput`.
- Published client review snapshots have a separate immutable schema. Bedroom count is setup metadata, so no publication snapshot or issued artifact change is needed.

## Scope and non-goals

In scope: the estimate Configure screen, room option generation, saved bedroom-count metadata, compatibility with existing rooms, relevant room presentation in dimensions/builder, runtime validation, API documentation, regression tests, and rendered desktop/mobile checks.

Out of scope: project-initiation fields, adding property types, changing the lead's property type when editing an estimate, floor-level villa planning, multiple copies of custom rooms, financial formulas, catalogue pricing, approval/publication workflows, historical document rewrites, migrations, dependencies, deployment, or commits.

## Recommended approach and alternatives

Use a small deterministic room catalogue derived from the effective estimate property type and the explicit count. Merge already selected room records into the displayed options without rewriting their identities or labels. Persist one optional `bedroomCount` field on the existing estimate.

Keeping the count only in browser state, or inferring it from selected bedrooms, would avoid a backend field but lose the true count after reload or when bedrooms are deselected. Persisting the explicit count is recommended because available rooms and selected rooms are different concepts.

## Property rules

| Property type | Bedroom count | Room behavior |
| --- | --- | --- |
| 1BHK | 1, derived | Bedroom 1 and its optional balcony/bathroom |
| 2BHK, 2.5BHK | 2, derived | Bedrooms 1–2 and their optional balconies/bathrooms |
| 3BHK, 3.5BHK | 3, derived | Bedrooms 1–3 and their optional balconies/bathrooms |
| 4BHK | 4, derived | Bedrooms 1–4 and their optional balconies/bathrooms |
| Villa, Duplex, Penthouse | User enters a whole number from 1 to 50 | Generate entries through the entered count |
| Studio | No separate bedrooms | Combined Living / Sleeping Area; common room choices and Common Bathroom |

The fractional BHK rule is an assumption: 2.5BHK and 3.5BHK have two and three full bedrooms respectively; Home Office/Study remains available for the additional space. The 50-bedroom maximum bounds input and rendered option size; it is not a claim about the property.

Common Areas retain Living & Dining, Kitchen, Balcony / Utility, Foyer / Entrance, and Home Office/Study. Studio changes the label of a newly added living-area room to Living / Sleeping Area. Other retains Custom Room. Common Bathroom is available for every supported type.

Bedroom N and Bedroom N Balcony appear together in Bedrooms. Bedroom N Bathroom entries appear in Bathrooms alongside Common Bathroom. All entries are optional and independently selectable; selecting a bedroom does not automatically select its balcony or bathroom, and selecting an accessory does not force its bedroom into the estimate.

## UX and state requirements

1. Use the saved estimate's property type when present; otherwise use the lead's type. Changes affect this estimate only.
2. Show a labelled Number of bedrooms input between Property type and Rooms for Villa, Duplex, and Penthouse. Do not invent a default count or infer it from selected rooms. Explain briefly that the count controls available rooms.
3. While a count is missing or invalid, common rooms and existing selections remain visible. Do not generate guessed bedroom entries. Show an associated validation message for invalid input and require a valid count before continuing to new item selection, saving, or submitting an editable variable-type estimate.
4. Existing estimates missing the field remain viewable, including their saved builder items. If an editable estimate needs a count before its next save, provide a clear route back to Configure; locked estimates do not acquire a blocking setup requirement.
5. Update options immediately after a valid property/count selection. Changing Villa to Duplex or Penthouse keeps the entered count. Moving to a fixed-count type clears the custom count; returning to a variable-count type asks again. Reload uses the persisted type/count pair.
6. Reducing a count or changing property type never automatically deletes rooms, dimensions, selected items, or prices. Retain selected rooms outside the new profile in a conditional Previously selected group with a brief explanation. Keep them selectable for explicit removal and visible in dimensions/builder.
7. Only explicit room deselection/removal or Clear all invokes the existing room-removal behavior. Select all and search work against the actual displayed options without dropping selected rooms outside the search result.
8. Keep selected counts, chips, ordering, search, and keyboard focus accurate as options change. Escape restores trigger focus; an obsolete highlighted index must not target a different or nonexistent option unexpectedly.
9. Property, count, room selection/removal, and dimension edits respect estimate editability and in-flight save/submission state. Existing server-side locks and ownership remain authoritative.
10. The extra field wraps into a readable vertical layout at mobile widths. Maintain visible labels, keyboard operation, accessible errors, focus visibility, and no horizontal overflow. Reuse established visual styles; add no icon library or decorative effects.

## Identity and compatibility

- Available room types have deterministic keys; persisted room instances retain their existing IDs, labels, dimensions, and data.
- Reuse the existing `master` identity for Bedroom 1, `bedroom2`/`bedroom3` for those bedrooms, and `bath_m` for Bedroom 1 Bathroom. New selections use the numbered labels; previously saved Master Bedroom and Master Bathroom keep their saved labels. Do not create duplicate aliases for the same room slot.
- Add deterministic distinct type keys for higher bedrooms and per-bedroom accessories. A new room instance receives its ID once; changing the list must not regenerate existing IDs.
- Preserve unknown/custom saved room types and all saved labels through selection, dimensions, builder, save, and reload. Do not use display labels to identify new configured records.
- Shared room presentation must recognize the kinds of newly generated rooms instead of showing an unrelated fallback icon. Use established assets or simple inline SVG where necessary.
- Unknown historical property strings remain readable. Offer common rooms and saved selections without guessing a bedroom count, and allow choosing a supported type. Do not narrow the existing free-string backend property-type contract as part of this work.
- Existing room dimension/default-area behavior stays compatible; the generator must not invent measured dimensions for new rooms.

## Data and API contract

Add `bedroomCount?: number | null` to the estimate draft request/response and the Estimate model. It records an explicit count for Villa, Duplex, or Penthouse. Fixed-count BHK and Studio options are derived from their property type and do not require this metadata.

- Validate supplied non-null counts as integers from 1 to 50 in runtime input validation and persistence. Do not coerce strings, fractions, zero, or negative values.
- The frontend sends a valid count for variable types and null for fixed types. Persist null for supported fixed types so an old custom count cannot affect their options.
- To support older callers/documents, omission is accepted. For an unchanged variable property type, omission preserves an existing count. A property-type change without a supplied count clears it; a new variable-type draft from an older caller may remain unspecified. The new frontend enforces its setup requirement without retroactively invalidating old data.
- Explicit null clears metadata. No inferred count is written when opening an old draft.
- Save metadata in the existing estimate transaction, with the existing owner check, locked-state behavior, and configured-draft expectedVersion rules. Do not introduce a separate autosave endpoint or weaken concurrency checks.
- Hydrate and update the existing lead-estimate query with the returned count. Preserve the current save-response handling so a completed request does not overwrite newer local input. Switching lead IDs must not carry a count or room list across projects.
- Keep OpenAPI and frontend types aligned. There is no new route, permission, external side effect, or shared repository-interface change.
- Bedroom count does not change estimate money, approved baselines, published client review snapshots, PDFs, or downstream room/item lineage. Those consumers continue using actual selected rooms and stable IDs.

## Acceptance criteria and verification

1. Every supported BHK type shows exactly its derived bedroom slots, corresponding optional balcony/bathroom slots, common rooms, Common Bathroom, and Other. 4BHK includes Bedroom 4; 1BHK has no unselected Bedroom 2/3 options.
2. Villa, Duplex, and Penthouse prompt for count and generate only that many slots. Missing, fractional, zero, negative, and over-limit values have clear validation; 1 and 50 are valid boundaries.
3. Studio shows a combined living/sleeping choice and optional common choices without generating separate bedrooms or bedroom accessories.
4. Optional accessory selection is independent. Search, Select all, Clear all, selected counts, keyboard navigation, and focus work after changing type/count, including a no-results search.
5. Existing legacy rooms, unknown rooms, and out-of-profile selections remain visible and retain IDs, labels, dimensions, and linked configured/legacy items. Type/count changes alone do not alter totals. Explicit removal still affects only the selected room and its existing item associations.
6. Count and selections survive save/reload even if no bedroom itself is selected. Test a count of five with only common/accessory rooms selected. An old draft without metadata remains readable and receives a setup prompt only when editing requires it.
7. API tests cover round-trip persistence, invalid counts, null, omitted-field compatibility, property changes, locked estimates, configured version conflicts, and independent counts on two leads. Run replica-set coverage for the changed transactional save path.
8. Read-only and in-flight states disable the relevant controls. Failed save preserves local values and exposes the existing error/retry behavior. Switching leads does not leak previous room/count state.
9. Verify rendered interaction and accessible names/errors at desktop and mobile widths, including a long dynamic list and Previously selected rooms. Check console/network errors using local fixtures without client data.
10. Run focused frontend/backend regression tests, both typechecks and builds, affected API documentation tests, and `git diff --check`. Broaden tests when failures or shared-contract impact justify it. The repository has no lint script; do not claim lint passed.

## Risks, rollback, and open decisions

Principal risks are silent room/item loss on count reduction, duplicate legacy aliases, count loss across save/reload, stale save responses, and setup controls bypassing locked-state UX. The preservation, optional-field, stable-identity, and interaction criteria above directly cover them.

This is an additive optional field. No backfill, seed, data rewrite, or production operation is required. Backend support must be available before a new frontend sends the field because the old input validator is strict. Rollback keeps stored metadata and room records intact; no cleanup migration is authorized. A frontend rollback would restore the old static picker and its limited visibility of new room types, so coordinate application versions rather than deleting new room records.

The initial dirty paths belong to the preceding lead-landing task: `ContactAndEstimateCard.tsx`, `LeadDashboard.test.tsx`, `LeadDetail.test.tsx`, `LeadDetail.tsx`, `frontend/src/styles/estimator-dashboard.css`, `frontend/src/test/accessibility.test.tsx`, and the two project-initiation-estimate-landing documents. Inspect any relevant existing diff before assigning later writers; preserve unrelated changes.

No unresolved product question blocks this specification. Approval accepts the fractional-BHK assumption, explicit count range, and retention of already selected rooms when the property profile changes.
