# Hide visible tier-status notes on Main Lines

Date: 2026-11-09
Status: Implemented and verified in Mode A

## Goal and evidence

Remove the visible `Premium: Not configured · Functional: Not applicable`
summary from estimation Main Lines across Sales, Designer and Client.

`EstimateLineTierNotes` in `frontend/src/features/estimates/EstimateLineRow.tsx`
renders this shared paragraph. Both `ConfiguredEstimateBuilder.tsx` and
`ClientQuotationLine.tsx` use it. Tier options already retain disabled states
and individual reason tooltips; the group references the paragraph with
`aria-describedby`.

## Scope and requirements

- Visually hide only the tier-status summary, retaining its screen-reader
  description and the existing option tooltips and disabled states.
- Remove any empty detail spacing left when this summary is the only content.
- Keep actual validation errors, missing-rate messages, source notes, dimensions
  and component details visible. Keep the compact primary row unchanged.
- Extend the shared presentation and scoped CSS; avoid duplicated role-specific
  logic. Expected targets are `EstimateLineRow.tsx`, its existing accessibility
  test, and the relevant detail-spacing rule in `estimator-dashboard.css`.
- Preserve existing dirty work. No API, permission, pricing, data, workflow,
  dependency or service changes.

## Acceptance and verification

1. The quoted tier-status summary is no longer visible on shared Main Lines.
2. Unavailable tiers remain disabled and their explanation remains accessible.
3. A row with only hidden tier notes has no empty detail band; real errors and
   other supporting content remain visible.
4. Verify the rendered row and existing shared accessibility/interaction tests,
   then frontend typecheck/build and `git diff --check`. No broad workflow retest
   or new CSS-value tests are needed for this localized presentation change.

Assumption: the request concerns this repeated tier summary, not other error
messages. Risk: hiding the paragraph could leave unwanted spacing or break its
accessible description; the checks above cover both. No open product decisions.
