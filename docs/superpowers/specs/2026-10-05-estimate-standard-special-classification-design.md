# Standard and Special types in estimation

Date: 2026-10-05  
Status: Approved by the user; implemented and verified locally in Mode A on 2026-10-05. See the task plan for exact evidence.

## Goal and recommendation

Let an estimator choose **Standard** or **Special** while selecting a Main Basket and each configured item in the estimate builder. Save both choices with the estimate, restore them when the draft is reopened, and retain them in the immutable published review snapshot. Treat the choice as classification metadata. It does not change price, GST, approval thresholds, procurement calculations, or catalogue eligibility.

Use a new `classification: "standard" | "special"` field. The existing `itemType: "main_line" | "temporary"` describes catalogue structure and must keep that meaning.

## Current behavior and evidence

- `LeadEstimateWorkspace.tsx` selects Main Baskets by `selectedMainBasketIds: Set<string>`. `MainBasketSelectionRow` renders a checkbox, then `ConfiguredEstimateBuilder.tsx` renders a checkbox and quantity/rate controls for each configured Main Line or temporary item. Neither selection has a Standard/Special choice.
- `configuredEstimate.ts` creates, rebuilds, and restores `ConfiguredLineDraft` values. `LeadEstimateWorkspace` sends `selectedMainBasketIds` and configured line inputs to `PUT /leads/:leadId/estimate`.
- `backend/src/routes/estimates.ts` strictly validates that request, uses estimate version checks and stable room/line IDs, then rebuilds and saves `EstimateModel.lineItems`. `EstimateModel` has `selectedMainBasketIds` and `lineItems`, but no Standard/Special field.
- Publication copies estimate data into `EstimateClientReviewRound.estimateSnapshot`, whose schema is strict and immutable. Client presentation, frontend API types, and OpenAPI describe that snapshot. A saved type must be represented in these boundaries to survive publication without changing historical rounds.
- Relevant existing source targets have no tracked diff at the time of this specification. The wider repository is heavily dirty with unrelated procurement work; preserve it.

## Scope and UX requirements

1. Show one accessible two-option radio group labeled **Item type** for each selected Main Basket, with **Standard** and **Special**. The basket remains selected by its existing checkbox; its classification is an additional choice.
2. Show the same radio group for each included configured item row in the builder, identified accessibly by room and Main Line or temporary item name. Keep the controls usable with keyboard, visible focus, and the existing responsive layout. Read-only estimates display the saved type without editable controls.
3. A newly selected Main Basket starts as Standard. A configured item gets the basket's current classification when first included. Its own choice can then be changed independently. Changing a basket choice does not silently rewrite previously classified lines. Removing and reselecting an existing line preserves its choice.
4. Save classifications against stable IDs, not labels: Main Basket ID at estimate level and room ID plus Main Line ID on each configured line. A selected basket with no included lines must still retain its type. Reopening, saving again, and requesting changes must preserve both basket and line choices.
5. Existing estimates and immutable snapshots without the field display Standard. Do not backfill or rewrite historical records. New saves explicitly store the current selections. Older API clients that omit the new fields preserve existing saved classifications and use Standard only for new selections.
6. Retain the classification in the immutable published review snapshot and response types. Do not add the label to client-facing PDF/proposal presentation or change procurement behavior in this request.
7. Reject unknown classification values, duplicate basket classification entries, entries for unselected baskets, and explicit payloads missing a selected basket. Keep existing version, authorization, catalogue-source, and immutable-history checks intact.

## Data and API impact

- Add optional `selectedMainBasketClassifications: Array<{ mainBasketId: string; classification: "standard" | "special" }>` to the estimate draft input, saved estimate, and published snapshot. `selectedMainBasketIds` remains the canonical selection list for compatibility. When the classification array is supplied, its IDs must match the effective selected IDs exactly and once each.
- Add optional `classification: "standard" | "special"` to configured estimate line input, persisted line, and published line snapshot. The backend resolves an omitted value from the prior line when present, otherwise Standard. The frontend sends an explicit value for every included or previously saved configured line.
- Extend the strict request validator, Mongoose estimate and immutable review schemas, publication/snapshot mapping, client projection parser, frontend API types, and OpenAPI inventory. Do not reuse catalogue `itemType`.
- No database migration is required. Missing historical fields remain absent on disk and are interpreted as Standard at read/restore boundaries.

## Assumptions and non-goals

- Standard/Special is an estimator-selected label, not a price mode, a change to configured source data, or a new approval rule.
- The line control applies to configured Main Lines and temporary items because both share the selectable configured item row. Legacy catalogue lines remain unchanged.
- A basket's type is a default for a newly included item, not an enforced parent constraint. Basket and line types may legitimately differ.
- No bulk retagging, catalogue mutation, financial recalculation, customer messaging, or live data rewrite is included.

## Risks and controls

- **Field collision:** `itemType` already means Main Line versus temporary. Use `classification` and test both values on temporary and Main Line records without changing source identity.
- **Lost edits on refresh:** `buildConfiguredLines`, saved-draft hydration, and catalogue refresh must preserve explicit line classification. Keep version conflict behavior so stale saves cannot overwrite a newer choice.
- **Snapshot loss:** the strict immutable review schema would otherwise drop or reject new metadata. Extend snapshot storage and mapping, and test that old rounds still parse as Standard without mutation.
- **ID mismatch:** validate basket classifications against selected IDs and test two baskets with different types and same-named lines in different rooms.
- **Responsive density:** fit radio groups into existing basket and line rows without page-wide overflow at desktop and mobile widths.

## Acceptance criteria

1. An editable estimate exposes Standard/Special radio groups for selected Main Baskets and included configured items; all controls have distinct accessible names and work by keyboard at desktop and mobile widths.
2. A new basket defaults to Standard, a newly included item starts with that basket's current type, and a line override remains unchanged when the basket type changes or the catalogue refreshes.
3. Save, reload, revise, and save again retain different classifications for at least two baskets and two lines using their stable IDs. A selected basket with no lines retains its classification.
4. The API rejects invalid or mismatched explicit classifications, preserves values when an older client omits the fields, and returns Standard behavior for historical missing values without a migration. Existing `itemType` and paise totals are unchanged.
5. Publication freezes the selected classifications in a new immutable review snapshot. Existing snapshots still load. No client PDF/proposal or procurement calculation changes.
6. Focused frontend and backend tests, transactional replica-set tests for changed save/publication paths, frontend/backend typecheck and builds, rendered responsive/accessibility checks, and repository diff checks pass on the integrated result.

## Open decisions

None required to start the task plan. Approval of this specification confirms that Special is metadata only and that Main Basket and item choices may differ.
