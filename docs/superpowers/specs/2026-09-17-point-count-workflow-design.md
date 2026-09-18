# Point counts in project measurements

## Goal and evidence
Light / fan / switch points currently show mandatory Length, Width and Height because FurnitureDimensionsEditor and backend furniture measurement schemas require the same three values for every approved estimate item. The approved estimate snapshot carries a frozen `unit`; explicit point units are reliable. Configuration UOM has code, name and quantity decimalScale, with no semantic measurement kind. Frontend catalogue quantityBasis is not persisted in approved snapshots and cannot govern the backend.

Standing autonomous Mode A authorizes implementation and local verification without repeating gates. No deployment, migration, commit or production mutation.

## Scope and decision
Classify explicit approved estimate point units (`pt`, `pts`, `point`, `points`, normalized for case/spacing/trailing period) as count measurements. Keep other items as physical dimensions: furniture sold as nos/lot still requires measurements. Do not infer semantics from display names, mutable catalogue records, arbitrary chosen UOM, or frontend-only quantity formulas. A general configuration measurement-kind redesign is out of scope.

- Project room items receive canonical `measurementType: "count" | "dimensions"` derived on the backend from the approved line snapshot.
- Point inputs show Number of points, a positive safe integer, and the existing configured UOM field. Hide all length/width/height controls for those items. Existing configured UOM identity/snapshot/reference rules continue; no added semantic type is assumed for custom UOMs. Estimate point quantity remains reference-only; this submission never changes estimate pricing or quantity.
- New count input/storage uses `measurementType: "count"` plus `quantity`; no dummy length/width/height. Existing dimensions input remains compatible (optional literal dimensions discriminator is acceptable), but the server rejects new dimension payloads for point items and count payloads for physical-dimension items. Fields from incompatible modes must be rejected.
- Preserve canonical room/item IDs, complete item coverage, active configured UOM validation/reference epochs, proof, exact submission token, version/CAS, idempotency and immutable approval history. Combined scope and post-acceptance dimension-upload flows both support mixed items.
- Returned count drafts preserve count and UOM. Never derive a count from old fake dimensions. Legacy stored dimension snapshots remain readable and approved history remains immutable. Old pending point dimensions can be sent back for correction; approval must require an actual count, with a clear correction message. No data backfill.
- Client review displays count values with units distinctly from dimensional measurements. Point-only rooms show no irrelevant dimension columns; mixed rooms use separate compact tables/sections or a clear measurement cell rather than empty dimension columns.

## Acceptance and verification
1. A pts estimate item shows Number of points with no dimensional inputs, including first and returned submissions. Furniture billed nos continues to show dimensions.
2. API enforces snapshot-derived mode, positive integer counts and exact item coverage; no mixed fields, silent conversion, nonfinite/fractional/unsafe/zero counts, or name-based guesses.
3. Mixed count/dimension rooms submit, return, correct and approve atomically with exact-token/history protections. Legacy pending point data is returnable; completed history stays readable.
4. Client sees meaningful count versus dimension values before deciding. Existing UOM lookup/create and proof flows remain usable.
5. Focused frontend/backend and Mongo transactional regressions, typechecks/builds, independent integrity review, final verification and browser entry/review at 360/768/1440. Full suite only if risk/new failures warrant it.
