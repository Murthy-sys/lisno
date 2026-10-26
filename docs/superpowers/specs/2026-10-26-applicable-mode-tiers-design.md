# Applicable tiers and independent Mode configuration

## Goal and confirmed requirements

Configuration → Main Line → Overview shows Applicable tiers checkboxes in this order: Signature, Premium, Functional. Signature is selected for legacy configurations and by default. The current Mode tab becomes Signature mode. Premium mode and Functional mode appear only when their corresponding checkboxes are selected. Each tab offers the complete existing Mode editor, including PMC, Sub-vendor, In-house components and specifications, with independent saved values.

The user confirmed new Premium and Functional configurations start empty. Unchecking a tier hides its tab and preserves its configuration for later reselection. Current Signature values must survive unchanged.

## Current architecture

Mode is a presentation group over revision-owned `advanced` and `pricing` sections. Saves have section and aggregate version checks. The native editor, estimate catalogue, Procurement and published pricing currently read root Mode fields. There is no pricing-tier selector or immutable estimate-tier field. Existing `standard/special` classifications and `pmc/sub_vendor/in_house` pricing modes are separate concepts.

## Scope and contract

- Add optional `overview.applicableTiers`: unique values from `signature`, `premium`, `functional`. Missing means Signature; an explicit empty array hides every Mode tab.
- Preserve Signature in the existing root advanced/pricing payloads. Additional tiers use server-owned `tierConfigurations` namespaces in the same section documents, retaining their own payload and applicability. No migration or duplicate authoritative Signature copy.
- Section reads accept optional `modeTier`; writes accept optional `modeTier` on the existing command. Only advanced/pricing may use a tier scope. Responses identify a requested scope. Missing modeTier preserves existing APIs.
- Server writes merge only the selected tier after version checks. Root Signature writes preserve other tiers, including from older mobile/proposal clients. A caller cannot replace another tier through a nested payload.
- Validate each tier's normal Mode/pricing payload with existing domain rules. Preserve component identity, reference coordination, basket deletion protection and revision/activation integrity across retained namespaces. Tier storage alone must not mark Signature complete.
- Premium/Functional begin empty and never inherit Signature values implicitly. Reuse existing calculation previews with the selected tier's explicit settings.
- Tabs, query caches, pending edits, simulator state, drag-and-drop sessions, conflict views, and saved summaries are scoped to the tier. Existing Save/Discard/Stay behavior guards tab switches.
- The selected tier's sidebar defaults come from that tier on the first saved main line of the sub-basket. Index-level default-margin actions remain Signature scoped.

## Compatibility and boundaries

This change configures tiers in the web Configuration workspace. Existing estimate, client quotation, Procurement and native pricing continue to use Signature; selecting or deselecting a tab never changes their financial source. Published artifacts and historical revisions remain immutable. A future estimate-tier selector requires separate end-to-end lineage work and is outside this request. Shared proposal and procurement Overview surfaces retain their current controls unless explicitly wired to the full tier workspace.

## UX

Use the existing typography, controls and workspace tab navigation. Present the three native checkboxes inline when space permits, wrapping on narrow layouts. Use explicit tier tab and save labels. Retain keyboard navigation, focus visibility, mobile section selection, loading, error, read-only and saving states. Do not introduce new dependencies or decorative UI.

## Acceptance criteria

1. Legacy Overview selects Signature, and existing Mode data appears under Signature mode unchanged.
2. Saving Overview updates the ordered tabs from selected tiers; deselection hides a tab without erasing its saved payload. Empty selection is valid.
3. New tiers open empty. Changes and saves in one tier do not alter another tier's rates, components, scope, specifications or margins.
4. Save/reload, unsaved navigation guards, stale-version conflicts and independent cache identity work across tiers.
5. Backend rejects invalid tier keys and payloads, retains existing permission/version controls, and protects references in retained tiers.
6. Current estimate/Procurement pricing and approved/published amounts remain unchanged.
7. Desktop/mobile and keyboard behavior are verified with real rendered controls, along with focused backend transactional and frontend regression tests.

## Risks and rollback

The principal risks are cross-tier cache/payload collisions, old-client data loss, incomplete reference traversal, and accidentally switching operational pricing. Keep storage additive and operational reads root scoped, test cross-tier writes and legacy updates, and retain saved tier data when rolling back UI. No production migration, deployment, commit or push is part of this task.
