# Main Line applicability by room or place

## Goal and evidence

An editor can save the room or place categories where a Main Line belongs. Estimation offers that line only in matching rooms. For example, POP Gypsum assigned to Bedroom and Living & Dining is available in Bedroom 1, Bedroom 2 and Living & Dining, and absent from Kitchen.

KnowledgeOverviewPanel.tsx and the shared knowledgeSectionPayload.ts manage revision-owned Overview controls and edited-field saves. The current Overview validation allowlist has no applicability field for rooms. The estimator catalogue projects saved Configuration and salesEstimateCatalogue.ts builds default previews using basket, default-display and price eligibility. Room assignments have separate instance IDs and type IDs. In backend/src/domain/estimate-room-options.ts the first bedroom has type master, subsequent bedrooms use bedroom2 onward, and attached bathrooms and balconies have distinct types. The living type also covers the Studio living/sleeping area. TV unit currently appears as an item description in estimate-pdf-catalogue.ts; it has no dedicated estimate place type.

## Proposed experience and assumptions for approval

- Add an accessible multi-select dropdown labelled **Applicable rooms / places** to every Main Line Overview. Show selected categories when closed. Use the existing Overview Save, permission, dirty-navigation and conflict controls. Explain that leaving the selection empty allows all rooms. This preserves discovery for existing unconfigured lines and gives editors an explicit way to remove a restriction.
- Offer Kitchen, Bedroom, Living & Dining, TV Unit, Balcony / Utility, Foyer / Entrance, Home Office / Study, Bathroom and Custom Room. Treat TV Unit as a distinct selectable place in estimation. An estimator can add that place to the estimate and select lines assigned to it. Do not infer the place from an item's name or automatically include a TV Unit place in every project.
- Within a room, apply the restriction to default previews, search, Add items and recommendation choices before counts or pagination. Existing pricing, visibility and default-display rules still apply. Recheck eligibility on the server for new line-to-room assignments, including moving or copying lines. Incompatible required recommendations must explain the conflict instead of adding an ineligible line.
- Preserve saved estimate rows and amounts when Configuration changes. In an editable draft, identify an existing incompatible row for review and allow removal. Historical and issued estimates retain their saved contents.

## Contract and risk controls

Persist an optional array of distinct canonical category IDs in the current draft Overview. Validate the allowlist server-side, document the API and preserve unrelated fields through version-checked saves. Use the latest saved draft, otherwise the active revision, for the same Main Line ID. Missing or empty means unrestricted. No backfill is required. Refresh the estimator catalogue after saving.

Share a deterministic mapping from estimate room type ID to category across selection and server validation. Map all bedroom instances to Bedroom, attached balconies to Balcony / Utility and attached bathrooms to Bathroom. Keep the room instance ID for estimate row identity. Unknown legacy room types must not accidentally match a restricted line. Preserve existing room instance labels, IDs and saved snapshots. Keep the complete catalogue available for resolving saved rows. Scope includes the web Configuration and estimation flows plus compatible shared/backend contracts. Pricing calculations, historical data rewrites and a custom category administration screen are outside scope.

## Acceptance and verification

1. Save Bedroom and Living & Dining, reopen Overview, and verify both selections. Clearing and saving restores unrestricted use. Permission, stale-version and failed-save cases preserve the correct state.
2. In an estimate with two bedrooms, Living & Dining, Kitchen and a bedroom balcony, the example line is offered only in the two bedrooms and Living & Dining. Renaming a bedroom preserves eligibility. Test a second line restricted to Kitchen to verify isolation.
3. A TV Unit-only line can be selected in a TV Unit place. Search, manual add, recommendations and direct API writes respect the same eligibility; verify optional and required recommendations.
4. Existing unconfigured lines retain current availability. A previously included draft line survives restriction changes and remains removable. Approved and published estimates keep their amounts and rows.
5. Verify persistence against the existing transactional save path and test the rendered dropdown and room switch with keyboard, desktop and mobile layouts. Preserve in-progress closure priority and PMC preview changes in the shared worktree.

Approved decisions: an empty selection allows all rooms, and TV Unit is a selectable estimate place. The user approved the task plan and chose parallel implementation.
