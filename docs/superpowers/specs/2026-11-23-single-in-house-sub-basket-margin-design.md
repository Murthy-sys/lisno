# One In-house margin section per Sub-Basket tier

Approved on 23 November 2026. This revises the component-specific In-house defaults in the [tier margin approval design](2026-11-22-sub-basket-tier-margin-approval-design.md) and uses the [tier side panel and margin notification workflow](2026-11-22-sub-basket-tier-chips-margin-notifications-design.md).

## Goal

Opening Signature, Premium or Functional in a Sub-Basket shows exactly three margin sections, in order: **PMC**, **Sub-vendor**, **In-house**. Each tier owns one In-house default for the selected Sub-Basket. That section contains four percentages: Labour minimum, Labour starting, Material minimum and Material starting. A Sub-Basket referenced by a cost component does not get another editable default in this panel.

## Current behaviour and evidence

- `buildMarginMatrix` and `marginScopeKey` in `backend/src/domain/ai-estimator-knowledge-margin-matrix.ts` key In-house defaults by tier, mode and component basket/Sub-Basket IDs. The matrix includes stored component defaults and components found on current Main Lines.
- `KnowledgeMarginDecisionPanel.tsx` renders one fieldset per returned default. The two fieldsets in the screenshot therefore represent two independently saved settings. In the selected tier, the **popp** entry shows Labour 25% / 35% and Material 25% / 35% with existing provenance. The **POP Gypsum** entry shows approved Labour 15% / 20% and Material 10% / 20%.
- `ai-estimator-knowledge-margin-decision.ts` and `withSubBasketMarginDefaults` currently target a matching component identity. Hiding a fieldset alone would leave the underlying defaults and propagation rules split.

## Editing, reviewing and saving

1. Label the section **In-house**. Give the four inputs explicit Labour/Material and minimum/starting labels. Keep the current fee validation, integer basis points and percentage presentation. PMC and Sub-vendor retain their current settings.
2. Preview a change against every eligible In-house component on current Main Lines **belonging to this Sub-Basket and matching the selected tier**. List affected Main Lines, component-level current values that differ, exclusions and blockers. A component referencing `popp` on a `POP Gypsum` Main Line receives the reviewed margins on that line. Main Lines owned by the separate `popp` Sub-Basket are outside the command.
3. Super Admin confirms the reviewed default and applicable draft updates in one transaction. Apply Labour values to Labour and Material values to Material. Preserve component definitions, selection, base costs, quantities, UOM, other modes/tiers, and historical active or issued records. Missing costs stay explicit; the change must never create a fictitious cost line. A malformed or unrepresentable legacy shape is identified before confirmation.
4. Keep the existing multi-tier editor, Super Admin authorization, stale-preview checks, retry receipts and audit trail. Count each affected Main Line once in the preview, even when several component rows change. Indicate when no eligible lines currently need updating.

## Existing conflicting defaults

Opening the panel performs a read. Resolve values for the single editor using these rules until a shared default has been saved:

| Saved state for the selected Sub-Basket and tier | What the single In-house section shows |
| --- | --- |
| A saved shared default exists | Its four percentages and provenance. |
| Legacy data has one distinct complete approved set | Its four percentages as the proposed shared default. Other saved values stay visible in the impact review. |
| No approved set exists and all complete existing defaults agree | The common four percentages as an existing default. |
| Approved sets conflict, or existing sets conflict without an approved set | One section marked **Choose shared margins**. Show the competing values for review. Super Admin supplies or selects one complete set. |
| No complete default exists | One section marked **Not configured**, with empty fields. |

For the screenshot, the proposed shared values are **Labour 15% / 20%** and **Material 10% / 20%**. Keep a **Review and apply** path when these values are already filled in and other components still differ, even if the user does not retype a percentage. Show what would be overwritten. Opening or dismissing the panel leaves all saved records intact. Completing the reviewed save records the shared default and resolves the eligible differences. Subsequent identical saves are idempotent.

## Manual exceptions

The bell continues to require a proven saved change to a margin percentage. Compare each eligible component’s actual values with the shared tier default. Treat In-house as one pending notification per Main Line and tier. Keep the edited component identity and the exact proposed values as review evidence. If two components on the same line have competing manual proposals, show both inside that notification and require an explicit selection before approval. When the shared default is unresolved, retain evidence of genuine edits and show that a default requires selection before claiming a numeric difference.

Approval previews the chosen four percentages across the matching tier, with the same scope and transaction as a direct shared-default save. Clear only resolved pending edits. Legacy differences, copies, changes to base cost or description, and opening the editor cannot generate a notification.

## Data and compatibility

The shared default key is the owning Sub-Basket, tier and In-house mode. Component IDs continue to identify real cost rows, edit evidence and target details in previews. Keep those two identities distinct in storage, API types and runtime validation. Version decisions so an older component-targeted request or token cannot silently acquire a broader write scope. Exact retries of completed operations must remain identifiable. Preserve historical audit records, legacy read compatibility and the separate Signature restore workflow; its reviewed target selection must stay explicit.

Use current drafts first, otherwise saved active revisions, and refresh affected summaries, editors and current pricing consumers. Preserve immutable estimate approvals, issued BOQs and vendor amounts. No live migration, financial formula change, or change to the native screen layout is included. The compatibility path must work without backfilling existing records.

## Acceptance and verification

1. With the screenshot fixture, open each tier and assert exactly one In-house fieldset with four inputs. Check the Signature example resolves to 15/20 and 10/20. Test unanimous existing values, conflicting approved values, empty data and stale reads.
2. Preview and confirm the prefilled four values. Verify two differently named components on one Main Line and a sibling receive the same approved percentages. Compare base costs before/after and verify a real Main Line in the referenced neighbouring Sub-Basket, the other tiers, PMC and Sub-vendor retain their values.
3. Exercise an active-only target, legacy cost shapes, missing costs and a zero-target save. Verify transaction rollback, replay, stale membership, operation-specific authorization, and historical pricing on a Mongo replica set.
4. Save a manual margin edit, a second competing edit on the same line, a description-only edit and a revert. Check the bell count, exact proposals and approval eligibility. Verify the impact preview, resulting shared default, matching-tier drafts and remaining pending count.
5. Check side-panel editing, keyboard focus, accessible input names and responsive layout at 390, 768 and 1440 px. Verify an old component-specific command cannot apply a shared default without a fresh review.

The interpretation for approval is one shared In-house section and one set of four percentages per tier. Labour and Material retain their separate ranges because the current pricing model and the screenshot both distinguish them.
