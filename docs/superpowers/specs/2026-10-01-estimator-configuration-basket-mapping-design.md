# Estimator mapping to configured baskets and Main Lines

Date: 2026-10-01  
Status: Approved by the user on 2026-10-01; Mode A implementation and focused verification completed on 2026-10-02

## Goal

Replace the Estimator/Sales screen's hardcoded item catalogue with the real Configuration hierarchy: **Main Basket → Sub Basket → Main Line**. Show the configured UOM on each Main Line within its Sub Basket. The estimator enters the customer selling rate for selected lines. New estimates must use stable Configuration IDs, while previously saved estimates remain readable and usable.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` builds every room's choices from `estimateBuilderSections` in `estimateBuilderCatalogue.ts`. Its flat scope toggles, row descriptions, units, specifications, and rates are all defined in that static file. New rows start unselected, but the catalogue and prices themselves are hardcoded.
- Configuration already persists Main Baskets, parent-scoped Sub Baskets, and Main Lines with stable IDs. `AiEstimatorKnowledgeMainLine` stores `basketId`, nullable `subBasketId`, lifecycle status, and active revision ID. The Main Line's primary `uomId` belongs to its active Overview revision; a Sub Basket itself has no UOM field. The read DTO exposes the relationship and `uomId`.
- The existing Main Basket and Sub Basket lists are readable by Procurement through the vendor-directory actor guard, while Main Line lists/details, UOM masters, and active knowledge context require the sole active Super Admin. Estimator/Sales cannot assemble the full hierarchy from these routes. A separate, filtered estimator-facing read contract is needed; granting estimators the Super Admin configuration permission would expose administrative data.
- `backend/src/routes/estimates.ts` accepts client-supplied `catalogueId`, `rate`, `unit`, and `quantity`, derives whole-rupee totals, and stores no Configuration identity or description snapshot. Its submit path requires an included line but does not validate a configured source or authoritative rate.
- The static IDs have downstream meaning: frontend review/client views, backend PDF and design mapping, project workflow, procurement, and finance resolve descriptions or classify sections from the old catalogue or its two-character ID prefix. A configured Main Line ID cannot safely be treated as one of those legacy IDs.
- The existing knowledge context can resolve active revisions, UOM, and effective cost/pricing pieces, but its documented contract does not define a final customer selling-price formula. The user chose **estimator-entered selling rate** for this mapping.
- Initial worktree state: one unrelated untracked file, `docs/superpowers/specs/2026-10-01-temporary-local-frontend-production-api-design.md`. Preserve it. No application files were changed during this investigation.

## Scope

1. Add an estimator-authorized, read-only catalogue projection from persisted Configuration. It contains active Main Baskets, their Sub Baskets, and active, non-temporary Main Lines with active revisions and a resolvable primary UOM. Preserve configured display order and stable IDs.
2. Replace hardcoded Main/section and item choices on the estimator's new-estimate flow with that projection. Keep the current property-type, room selection, dimensions, room navigation, draft, summary, and proposal workflow, adapting them to the configured hierarchy.
3. Group the estimator's choices and selected lines as Main Basket → Sub Basket → Main Line. The UOM is shown and saved per Main Line, under its Sub Basket; it is not a new Sub Basket-wide setting.
4. Let an estimator explicitly enter a selling rate for each selected configured line. A blank rate is distinct from an intentional zero rate. Configuration cost/margin values are not presented as customer rates.
5. Persist explicit Configuration identity and an immutable-at-publication display/rate/UOM snapshot on new estimate lines. Update affected review, publication, PDF, design mapping, workflow, procurement, and finance readers to handle both new configured lines and legacy catalogue lines without deriving new-line meaning from ID prefixes.
6. Preserve existing estimates and drawings. New selection must not populate rows from the old static catalogue. Retain legacy lookup behavior only where needed to display or process historical rows.

## Non-goals

- Editing Configuration from the estimator; changing Main Basket, Sub Basket, Main Line, or UOM management; a data backfill; rewriting approved estimate history; using Configuration vendor costs or mode calculations as selling prices.
- New room taxonomy or automatic room-to-basket restrictions. All eligible configured lines are available to each selected room, as the current live builder does; a future room applicability rule needs its own configured source.
- Replacing the current GST policy, client approval policy, or design drawing workflow. Any unavoidable contract changes must preserve their current semantics.
- Seeding, live migration, deployment, commits, customer communication, or production data mutation.

## Recommended approach and tradeoff

Use a **first-class configured-line branch** alongside the legacy-line branch. The server supplies a purpose-built estimator catalogue, and new estimate lines carry `mainBasketId`, `subBasketId`, `mainLineId`, active `revisionId`, `uomId`, and display snapshots. The estimator supplies the selling rate. This keeps new identities faithful to Configuration and lets older estimates retain their FC/FL/etc. meanings.

An alternative is to force every configured Main Basket into one of the seven legacy scope codes and generate old-style catalogue IDs. That would require extra classification administration, limit the new hierarchy, and continue hiding identity in a two-character prefix. Do not use label matching or generate those IDs silently.

## UX and behavior

1. The Configure step loads real eligible Main Baskets and lets the estimator include/exclude them. It shows no static FC/FL/CA/PA/EL/CV/LF choices for a new estimate. The Builder shows the selected Main Baskets, nested Sub Baskets, and their Main Lines in configured order for the active room.
2. Each Main Line row shows its configured name and UOM, an include control, quantity, and editable selling-rate input. A blank rate shows `Rate required` and contributes nothing to the displayed quoted total; the total is labelled incomplete until the rate is supplied. Explicit `0` shows as an intentional no-charge rate. Rate entry is keyboard accessible and has an unambiguous label including the line and room.
3. The estimator may save an incomplete draft with an included line whose rate and amount are null, but cannot submit it. Malformed or invalid entered rates and missing UOM are rejected. The UI explains which room/line needs attention. The backend enforces the same rule.
4. No eligible baskets or lines, a basket with no eligible children, loading failure, and retry each have explicit states. A failed catalogue request must never fall back to the dummy catalogue or masquerade as an empty result.
5. Switching rooms preserves independent selection, quantity, and rate. Rebuilding from Configuration preserves existing lines by room ID plus Main Line ID and never silently drops selected saved lines. Existing saved lines remain visible in a clearly labelled saved-items group if their source later becomes inactive, deleted, or otherwise absent from today's catalogue.
6. A saved draft uses its captured name, path, UOM, and rate until the estimator explicitly refreshes or replaces that line. Configuration renames or revision changes do not silently alter a saved quote. Published/client-approved versions continue using their historical snapshot.
7. Main Lines attached directly to a Main Basket have no Sub Basket. They remain manageable in Configuration but are excluded from the new two-level estimator selection, with an administrative empty-state/count cue where appropriate. No synthetic Sub Basket is stored.
8. New UI uses typographic hierarchy and existing controls, with narrow-screen grouping, visible focus, and reduced-motion behavior. No new decorative icon library or hover-only disclosure is introduced.

## Data, API, and authority contract

- Add a dedicated read operation such as `GET /estimation/catalogue`, registered in the route-operation authorization registry and OpenAPI. Allow Estimator/Sales and Super Admin through an operation-specific read permission. Return only the active, estimator-eligible projection, with no vendor costs, internal margins, private configuration sections, or mutation capability. The service rechecks actor status. Existing Configuration endpoint permissions remain as they are, including Procurement access to Main Basket and Sub Basket lists.
- Projection entries use stable IDs, parent IDs, display names/order, `mainLineId`, active `revisionId`, and the primary UOM ID/name/decimal scale resolved from the active Overview revision. An unresolved or archived primary UOM makes the line ineligible and yields a visible configuration issue rather than a fabricated unit. Pagination or a bounded all-items fetch must cover the entire eligible catalogue; no first-page truncation.
- New estimate lines are explicitly identified as `source: "configuration"`; legacy rows are `source: "legacy"` or remain compatible when the source field is absent. New lines retain the Configuration IDs and revision lineage plus snapshot labels, UOM, quantity, explicit rate, and amount. Identity joins use IDs, never names. The backend verifies parent-child identity and active eligibility at first selection/save. A saved draft may hold null rate and amount; submission requires a valid explicit rate on every included configured line.
- Treat the UI rate as rupees at the input boundary and convert it to integer paise for new-line storage and arithmetic. Reject excess precision, negative values, nonfinite values, and blank included rates. Server-calculated line amount, subtotal, GST, and total are authoritative. Keep legacy stored numeric fields readable through an explicit compatibility adapter; do not rewrite historical amounts.
- New lines carry an explicit group identity and label for downstream use. Design mapping, PDF, workflow, procurement, and finance must branch on source and use the stored group/line snapshot, not `catalogueId.slice(0, 2)`. Preserve exact legacy behavior for legacy rows. Where a specialty worker cannot be inferred from configured data, use the existing generic `worker_other` role, visibly retaining the actual configured basket/line names; do not guess from text.
- Approval/publication freezes the selected configured identities, revision, labels, UOM, entered rate, and computed amounts. Later Configuration lifecycle changes never rewrite approved estimates, review rounds, drawings, procurement lineage, or financial baselines.
- Catalogue fetches are read-only. Draft saves and submission retain existing lead/estimate ownership checks, transaction boundaries, version checks, publication/audit behavior, and permission enforcement. No new user can read other leads or edit Configuration.

## Compatibility and failure handling

- Existing `catalogueId` estimates remain valid. Keep the old static catalogue as a legacy resolver only where a historical row needs its description/classification; remove it from new estimator choices. Unknown legacy IDs still display their stored identifier and values rather than disappearing.
- No write migration is required for the additive estimate fields. The backend and shared frontend types must tolerate missing source/snapshot fields on older rows. Deploy the server contract before or with its client; rollback must leave additive fields readable by the new code. Do not run a live backfill as part of this feature.
- If Configuration changes between catalogue read and first save, reject a newly selected stale reference with a refreshable conflict. Once a draft line has been saved, its snapshot stays stable. A server error or catalogue outage does not substitute hardcoded rows or price.
- If a mapped line is submitted, every downstream reader must either use its explicit identity/snapshot or reject clearly before publication. Silent `OTHER` classification, raw opaque IDs in client documents, and missing finance/procurement lineages are unacceptable.

## Assumptions and open decisions for approval

- The requested hierarchy means **Main Basket → Sub Basket → Main Line**, with UOM on each Main Line row. Configuration currently stores UOM at the Main Line revision level, not at Sub Basket level.
- Only active Main Lines with active revisions are new-selection choices. Newly created draft Main Lines become selectable after Configuration activation. Direct-to-Main-Basket lines need a Sub Basket association before they can enter this two-level flow.
- Estimators enter customer selling rates, as confirmed by the user. An explicit zero rate is allowed; blank is incomplete. Configuration cost/margin calculations remain separate.
- The generic worker role is the safe operational fallback for a configured Main Line with no explicit trade classification. A future trade mapping may refine assignment without changing estimate identity.
- No unresolved choice blocks the mapping specification. Approval confirms these assumptions and the end-to-end compatibility boundary above.

## Risks

- Financial drift from mixed rupee/paise paths; missing rate or UOM; stale Configuration references; cross-parent ID attachment; partial pagination; and included lines lost when Configuration changes.
- Legacy two-character catalogue assumptions in drawing assignment, PDF, workflow tasks, procurement, dashboards, and finance. These must be traced and tested before new configured lines may submit.
- A large catalogue can create costly N+1 lookups. The projection should batch parent, line, revision, and UOM reads, cache by a bounded query key, and invalidate after relevant Configuration changes.
- Generic worker assignment needs operational visibility so project teams can route the task to the correct specialty without relying on guessed category names.

## Acceptance criteria

1. **Real catalogue:** A new estimate displays only eligible persisted Configuration Main Baskets, their Sub Baskets, and Main Lines. No static catalogue row or static rate appears as a new choice. Empty/error/retry and complete pagination are verified.
2. **Hierarchy and UOM:** Parent-child IDs and configured order remain correct, including identically named Sub Baskets under two Main Baskets. Each line shows the UOM from its active Overview revision. Direct-to-basket, draft, inactive, temporary, and unresolvable lines are handled as specified.
3. **Manual rate and totals:** A selected line's entered rate, explicit zero, quantity, unit, and integer-paise amount survive save/reload. A blank rate survives as an incomplete draft without becoming zero; blank or invalid included rates block submit on UI and API. Two unequal projects reconcile line, basket, project, and portfolio totals under the existing GST policy.
4. **Stable saved history:** Configuration rename, deactivation, or removal does not change a saved or approved line's displayed snapshot or amount. Rebuilding a draft does not discard selected saved items. Legacy estimates still open, edit where allowed, submit, render, and export.
5. **Downstream integrity:** Configured lines render intelligibly in estimator summary/proposal, review/client view, PDF, design assignment, workflow, procurement, and finance. The persisted ID/lineage is used; no new path infers meaning from an ID prefix. Legacy behavior remains intact.
6. **Authorization and accessibility:** Estimator/Sales can read only the filtered catalogue and work on owned leads; other roles receive the registered permission response. Configuration mutations remain Super Admin-only. Keyboard, accessible labels, responsive layout, and rendered error states work.
7. **Verification:** Focused backend route/service/schema/finance/design/workflow and frontend catalogue/builder/review tests; transactional replica-set checks for changed save/publication paths; backend/frontend typechecks and builds; rendered desktop/mobile interaction and console/network checks; `git diff --check` and final dirty-path inspection. No implementation checks have run at specification stage.

## Workflow status

The user approved this specification, approved the separate task plan, and selected Mode A. Local implementation followed those gates. Focused verification passed; broad suites have failures outside the changed estimator paths, recorded in the task plan. No deployment, migration, or production write was authorized.
