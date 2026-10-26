# Per-line estimate tiers

## Confirmed behavior

Sales and clients can select Signature, Premium or Functional for each estimate line. The same configured Main Line can use different tiers in different rooms. Tier prices come from that line's selected Configuration tier, using the existing estimate pricing formulas. Existing estimates without tier metadata mean Signature.

## Current behavior and change

Configuration already saves independent tiers. The estimate catalogue, working lines and frozen quotations currently use Signature only. Sales has an editable line builder; clients have requirements and immutable quotation review, but no price editor.

Add `modeTier` to configured estimate lines, and bounded `applicableTiers`/`tierPricing` catalogue projections. Selecting a tier adopts its configured price while retaining the current pricing mode. In-house components are scoped to that tier and require explicit selection after changing tiers. Missing/deselected tiers do not fall back to Signature. Older clients omitting tier on an update preserve the saved value.

Add a separate client working-estimate tier panel and project-scoped GET/PATCH endpoints. The command accepts only line identity, selected tier, configuration versions and optional selected component IDs. The server calculates price and full totals. It rejects hidden lines, unrelated projects, stale versions and closed/pending-review estimates. Published review snapshots, approvals, issued procurement records and PDF bytes remain immutable.

## Integrity and compatibility

- Retain client screen-only line visibility and include hidden amounts in totals.
- Retain exact paise arithmetic, current saved revision policy, dependency locks and aggregate version checks.
- Carry tier through publication, comparisons, PDFs, procurement sources and assistant pricing; never substitute root Signature for another tier.
- Tier/component changes may change physical scope. Include them in design-scope revision comparison for editable post-estimation changes.
- No direct client edits to quantity, pricing mode, manual rate, margins, Configuration or frozen review records.
- Existing manual prices remain stable on ordinary refresh. Deliberate tier changes adopt Configuration pricing.

## Acceptance and verification

Verify mixed tiers, the same Main Line in two rooms, asymmetric rates/components, missing prices, legacy updates, save/reload, client ownership/visibility/CAS, pending/final locks, full hidden totals, frozen snapshot/PDF labels, current tier-specific procurement costs, and desktop/mobile controls. Use disposable Mongo fixtures and synthetic browser data. No production data migration or deployment.

## Implementation choice

Extend the existing estimate flow and add a narrow client command. Reusing the generic staff writer for clients would expose unrelated price and scope controls; changing frozen client reviews would violate existing approval identity. No additional libraries are needed.

## Native compatibility boundary

The native staff editor currently cannot select configuration tiers. Preserve saved Premium/Functional prices, source versions and component IDs through native restore/refresh/serialization; show a web-workspace explanation and prevent unsupported line edits. A changed source or removed tier requires web review before saving. The native client review parser retains frozen tier metadata. The web selectors work at desktop and mobile widths; a new native tier selector is outside this change.

Client working choices fail closed when the current Configuration source cannot be resolved. Unavailable/hidden rows remain included in totals, while Sales retains repair visibility. Requirement changes invalidate the working-tier query so both panels use the latest estimate version.
