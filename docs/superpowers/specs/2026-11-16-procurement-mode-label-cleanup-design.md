# Estimator PMC handoff and Procurement execution choice

Date: 2026-11-16
Status: Implemented and reviewed in Mode A; validation and baseline limitations recorded in the approved task plan
Classification: Substantial workflow change with pricing and approval-lineage risk

This revision replaces the earlier label-only proposal in the same document. The user clarified that the estimator's default Sub-vendor price is not a Procurement execution-source selection.

## Goal and confirmed product flow

| Estimator setting | Estimator pricing | Procurement flow |
| --- | --- | --- |
| PMC on | Selected tier's configured PMC price | Vendor handoff to finish the work; retain the PMC path |
| PMC off | Selected tier's configured Sub-vendor price by default | Procurement explicitly chooses Sub-vendor or In-house, then prepares bidding for that chosen source |

Standard/Special is no longer a user-facing choice. The estimator's PMC setting, Procurement's execution decision and the vendor's eventual bid are distinct records. Procurement must not describe its execution source as selected by the estimator when the estimator only used a default price.

## Verified current behavior and cause

1. `ConfiguredEstimateBuilder.tsx` presents a PMC toggle. Its normal off value is `pricingMode: sub_vendor`; on stores `pricingMode: pmc`. Legacy classification fields are still stored internally. A remembered historical In-house selection can also be restored by the current toggle helper, so new explicit PMC-off edits need coverage against the clarified default.
2. `procurement.service.ts` reads the approved line's pricing mode and classification. `resolveProcurementEstimateMode` in `procurement-basket-mode-groups.ts` uses classification to infer Sub-vendor and emits Standard/Special terminology. Overview groups currently follow that approved estimate interpretation, not a saved Procurement decision.
3. `projectProcurementBaskets` in `procurement-basket-projection.ts` sets basket-wide `automaticSubVendor` when the saved basket classification is explicitly Standard. That path takes a suggested Sub-vendor cost even if a separate Procurement decision exists.
4. `ProcurementBasketScopePanel.tsx` hides `ProcurementBasketModeEditor` when `automaticSubVendor` is true. `ProcurementBasketModeGroups.tsx` claims the estimator selected Sub-vendor; scope rows append the obsolete classification.
5. A reusable Procurement preview/save flow exists in `project-purchase-order-mode.service.ts` and `ProcurementBasketModeEditor.tsx`. It uses stable source-line identity, transactions, version checks, current Configuration, audit events and idempotency. Its editor currently offers PMC/Execution followed by Sub-vendor/In-house.
6. BOQ readiness, tender snapshots, project-only base-rate editing and work-order issue also consume the automatic Sub-vendor path. Changing only the caption or displaying the hidden selector would leave costs and bidding inconsistent.
7. Modern In-house calculations require explicit component identities. Approved PMC-off estimates cannot carry a nonempty In-house component selection. Procurement needs its own valid configured execution basis when first choosing In-house; it cannot rely on a nonexistent approved In-house selection or use an empty selection as zero cost.

Investigation is read-only. Baseline status and relevant pre-existing diffs are under `/tmp/lisno-procurement-pmc-execution-flow-qa`. Previous estimator/recommendation changes remain in the worktree. No application code or stored data has changed for this request.

## Required behavior and acceptance criteria

### AC1. Estimator and approved source

- Keep the existing PMC toggle and tier controls. New explicit PMC-off selections use that tier's Sub-vendor estimate price; PMC-on uses that tier's PMC price.
- Carry PMC intent through the existing approved source identity. Do not infer current intent from a basket's obsolete Standard/Special label when an explicit approved pricing mode exists.
- Do not add execution-source controls to the estimator. Preserve tier descriptions, recommendations, incomplete-price guards and approved/customer amounts.

### AC2. PMC-on handoff

- Present PMC items as the vendor-handoff path. Procurement must not silently convert them to Sub-vendor or In-house.
- Reuse existing PMC pricing and vendor enquiry/award/work-order operations. Retain approval, activation and release checks; the toggle alone does not issue work or contact vendors.
- Any saved Procurement calculation confirmation remains tied to the PMC source. An incompatible execution-source request must fail on the backend as well as being unavailable in the UI.

### AC3. PMC-off execution selection

- Start unselected when there is no saved Procurement execution decision. The estimator's Sub-vendor price is only the estimate basis.
- Show Sub-vendor and In-house directly in Procurement for each approved source line, using the existing line-level decision boundary. Show current Configuration availability and a clear reason when a mode cannot be calculated.
- Preview and save through the existing audited, versioned flow. Refreshing or revisiting retains the saved choice. Do not offer changing approved PMC intent from this editor.
- The saved choice drives Procurement base/current costs, breakdowns and readiness. Selecting In-house must stop using the automatic Sub-vendor calculation.
- For newly chosen In-house execution, use a validated component/calculation basis from current Configuration for that Main Line and approved tier, recorded with the Procurement decision as needed. Preserve explicit historic component selections; never rewrite the approved estimate or guess rates/component IDs. Respect existing component disclosure policy.

### AC4. Bidding and stale work

- Require a complete saved Procurement selection for PMC-off lines before bid dispatch. An estimate default or unsaved preview cannot satisfy that requirement.
- Both valid Sub-vendor and In-house selections continue through the existing basket enquiry and bidding flow. The selected source drives preparation and cost benchmarks; vendor quotes remain separately submitted commercial amounts.
- Preserve the full-basket BOQ boundary, source-line identity and approved scope. Mixed PMC/execution lines use their own valid paths without a basket classification overriding them or counting them twice.
- Include the chosen decision and calculation/component basis in freshness checks. A mode change requires updating stale preparation/BOQ before dispatch or award; it cannot silently reprice sent BOQs, accepted bids, approved awards or issued orders.
- Preserve active-award/issued-order locks, source reservation, idempotency and approval protections.

### AC5. Honest overview and item labels

- Remove Standard/Special labels and claims that the estimator selected Sub-vendor/In-house execution.
- Before a decision, show “Execution selection pending” and “Choose Sub-vendor or In-house”. After saving, show the actual Procurement execution source. Keep PMC clearly identifiable.
- Overview groups and detail rows agree on the displayed state. Pending execution is distinct from missing historical mode data. Align any new group key across backend response, frontend validator, filters and accessible names.
- Reuse existing layout, typography, colors, controls and progressive disclosure. Preserve genuine warnings, incomplete amounts and historical provenance.

### AC6. Pricing, permissions and compatibility

- Use integer paise, existing calculation formulas and the approved tier. Read Configuration by stable Main Line ID using latest saved draft when present, otherwise active; retain activation requirements for new vendor dispatch.
- Keep approved estimate/customer amounts, bid history, awards and issued documents immutable. A Procurement choice changes internal preparation, not shared Configuration or approved revenue.
- Preserve project-only Sub-vendor rate overrides for their exact approved source line. Apply them only to eligible Sub-vendor calculations, never In-house/PMC or shared Configuration. Do not silently discard overrides when removing the automatic-classification branch.
- Keep route-operation permissions and project access authoritative. Existing `procurement.purchase_orders.manage` gates preview/save; do not broaden Super Admin or other-role mutation access.
- Preserve valid existing Procurement decisions. Legacy approved In-house records and genuinely missing mode data retain explicit compatibility/review states; do not fabricate a new user decision from a legacy basket default.
- No data rewrite/backfill or app-service restart is authorized.

## Recommended architecture and contract impacts

Reuse the approved line's explicit pricing mode to identify PMC versus execution. Reuse `ProjectPurchaseOrderModeDecision` and its preview/save endpoints for the separate execution choice. Centralize allowed-path, effective-cost and readiness resolution on the backend, then expose consistent results to list/detail and editor consumers.

Retain legacy classification fields where needed to read historical records, but stop using them to force execution choices for current explicitly identified lines. Removing every classification field would introduce unrelated migration risk. A display-only patch is insufficient because the same branch controls costs and bid eligibility.

Expected affected areas: approved-source interpretation; Procurement mode resolution/projection; existing mode-decision validation/persistence if an additive execution-component basis is required; overview/detail DTOs and OpenAPI; mode editor/cache invalidation; BOQ/tender/issue freshness; and scoped project-rate handling. Estimator changes are limited to explicit PMC-off transitions that contradict the clarified rule.

Reuse project/estimate/review-round/source-line keys, CAS versions, revision digests, actor identity and receipt/audit machinery. Additive fields must distinguish saved decisions from estimate defaults or derived display. Preserve old records without a write migration. Settle exact fields and trace consumers in the separate task plan before assigning writers.

After saving, refresh affected basket list/detail, preparation, enquiry/readiness and comparison data. Loading, permission errors, stale Configuration, source conflicts and failed saves stay explicit; no screen may combine a new execution choice with an old price or silently reset to Sub-vendor.

## Assumptions and non-goals

- Execution selection retains existing per-approved-line granularity; bidding retains the existing basket boundary. No new component-level tenders or split baskets are requested.
- “From now” applies to current mutable preparation and new explicit choices. Immutable approved/issued artifacts are not retrospectively rewritten. Existing valid Procurement decisions are preserved.
- No redesign, new pricing formula, vendor auto-award, real invitations, migration, deployment or repository-wide removal of legacy fields. The unrelated missing-vendor-suggestion issue is outside this correction.
- The user has settled the product split between PMC handoff and Procurement execution selection. No further product choice is required before specification approval. Exact field names and ownership belong in the task plan.

## Risks and verification

Principal risks: treating an estimate default as a decision, stale Sub-vendor totals after an In-house choice, changing approved amounts, invalid component selection, inconsistent groups, losing project overrides, or bypassing BOQ/award freshness.

Verify:

1. PMC on/off across all three tiers; first-use execution is unselected, saved choices survive reload and missing prices stay explicit.
2. PMC vendor flow rejects incompatible mode requests; PMC-off can select either configured execution source and cannot dispatch before saving.
3. Two unequal projects with repeated Main Line IDs and mixed-mode baskets: no identity leakage, double counting or incorrect cost aggregation.
4. In-house component-based and legacy calculation fixtures; correct tier/reference validation, disclosure and no fabricated zero total or dependence on a nonexistent estimator selection.
5. Sub-vendor project overrides, mode switching, Configuration refresh and activation gates; approved/historical commercial amounts unchanged.
6. Preview/save races, duplicate retries, stale versions/digests, unauthorized actors, dispatch/award locks, stale BOQ detection and immutable issued artifacts using isolated replica-set tests.
7. Rendered desktop/mobile selection, keyboard interaction, refresh retention, pending/error/unavailable states and consistent overview/detail labels with existing styling.

Focused suites cover `project-purchase-order-mode`, `project-purchase-order-preparation-mode`, `procurement-basket-mode-groups`, `procurement-basket-domain`, tender/base-rate paths, and frontend Procurement editor/workspace/groups/API validators. Broaden according to the final contract delta, then run both workspaces' typecheck/build, integrity review and `git diff --check`. Keep backend/OCR stopped; use isolated tests and synthetic browser data. Record exact results and limits during implementation.

Rollback is limited to scoped application changes. No live migration is proposed. Deployment, vendor communication and live mutation remain separately authorized actions.
