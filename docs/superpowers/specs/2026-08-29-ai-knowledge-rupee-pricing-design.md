# AI Estimator Knowledge Pricing in Rupees — Design Specification

**Date:** 2026-08-29  
**Status:** Approved

## Goal

Show and accept all user-facing AI Estimator Knowledge Base monetary values in Indian rupees while preserving integer paise as the authoritative backend, persistence, API, and calculation unit.

## Current behavior and evidence

- New price rows label their input `Input amount (paise)` and accept a paise integer directly.
- Saved immutable price details display raw values such as `14160 paise` for Input, Base, Tax, and Total.
- Pricing guidance states that money uses paise.
- Client-side pricing validation tells users to enter a non-negative integer paise value.
- The server calculation preview labels its rate `Unit rate (paise)` and tells users money is sent in paise.
- Preview result presentation already has `formatKnowledgeMoney`, which correctly formats `7_500` paise as approximately `₹75.00`.
- Backend contracts, tax derivation, price versions, preview components, and context lineage intentionally use non-negative safe integer paise with `BigInt`-assisted arithmetic.
- The relevant frontend is already dirty with separate user-owned changes:
  - `KnowledgeItemWorkspacePage.tsx`
  - `KnowledgeSectionEditor.tsx`
  - `ai-estimator-knowledge.css`
  These diffs must be preserved and reconciled rather than overwritten.

## Scope

### In scope

- Change the pricing editor input from paise to a labelled rupee input.
- Display saved immutable price Input, Base, Tax, and Total using Indian rupee formatting.
- Change server-preview unit-rate entry from paise to rupees.
- Remove user-facing help and validation copy that asks users to understand paise.
- Add exact string-based conversion helpers between rupee input text and integer paise.
- Keep frontend request payloads and response types in paise at the API boundary.
- Add focused tests for entry, reload, replacement, preview, validation, accessibility, and responsive states.

### Non-goals

- No backend contract, database schema, stored-document, tax formula, margin formula, context lineage, or OpenAPI financial-unit change.
- No conversion or migration of existing price versions.
- No frontend-authoritative financial calculation; the server remains authoritative.
- No change to basis-point inputs such as tax rate, margin, wastage, adjustment, or markup.
- No change to Finance, Procurement, current Estimate, or existing Estimator screens.
- No deployment, production mutation, migration, commit, or push.

## Requirements

### Rupee input

1. Price entry uses a label such as `Input amount (₹)` or `Input amount (rupees)`, not paise.
2. Server-preview rate uses `Unit rate (₹)` or `Unit rate (rupees)`.
3. Inputs accept non-negative rupee values with zero, one, or two decimal places.
4. Valid examples include `0`, `0.01`, `75`, `75.5`, and `75.50`.
5. Values with more than two decimal places, negative values, scientific notation, non-numeric text, or values exceeding safe paise range are rejected before submission.
6. Conversion must parse decimal text as digits; it must not use floating-point multiplication such as `Number(value) * 100`.
7. `₹0.01` converts to exactly `1` paise, `₹75.50` to `7_550` paise, and `₹11,800.00` is displayed from `1_180_000` paise.
8. The editable text state must preserve normal typing states such as a trailing decimal separator without corrupting the stored paise value.
9. Zero is valid and must not be treated as missing.

### Display

1. Saved immutable price Input, Base, Tax, and Total use the shared Indian currency formatter.
2. Preview monetary results continue using the same formatter.
3. User-facing text must not expose raw paise field names or append the word `paise`.
4. Internal field names such as `inputAmountPaise` remain allowed in TypeScript/API contracts and must not be rendered as labels.
5. Currency output must remain readable by screen readers and must not rely on colour alone.

### Boundary and state behavior

1. Frontend converts rupee text to integer paise only when producing a pricing update or preview request.
2. Frontend converts received paise to rupee display/input text when loading a saved or draft price.
3. API payloads continue sending `inputAmountPaise` and `unitRatePaise` integers.
4. API responses continue returning paise fields unchanged.
5. Saved price replacement must prefill the equivalent rupee amount and preserve the stable `priceEntryId`/version lineage.
6. Dirty-state detection, Save/Discard/Stay navigation blocking, CAS conflict behavior, and validation focus must continue to work with rupee input text.
7. Server validation remains authoritative; frontend validation is an early UX check only.

## Assumptions

- The request applies to the additive AI Estimator Knowledge Base pricing editor and its server calculation preview.
- Indian rupee formatting uses the existing `en-IN`/`INR` presentation helper.
- Two fractional digits are sufficient because backend money is stored in paise.

## Constraints

- Preserve integer-paise finance invariants and exact server arithmetic.
- Preserve the existing estimator frozen-path boundary.
- Preserve and integrate the three current dirty frontend diffs.
- Do not add dependencies or modify lockfiles.
- Do not change shared global styles unless separately required and approved.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Floating-point rounding changes money | Parse and format decimal strings using integer digit operations only. |
| Existing paise value displays 100× too high or low | Add asymmetric round-trip tests for 1, 7,550, 11,800, and 1,180,000 paise. |
| Controlled input disrupts decimal typing | Maintain user-facing rupee text separately and convert at the submission boundary. |
| Replacement changes financial lineage | Keep backend paise fields and stable price IDs unchanged; verify v1-to-v2 replacement payload. |
| Existing dirty user work is overwritten | Inspect and preserve per-file diffs; constrain implementation ownership explicitly. |

## Acceptance criteria

1. No pricing editor or preview input asks users to enter paise.
2. A user entering `75.50` sends exactly `7_550` paise to the backend.
3. A saved value of `14_160` paise displays as `₹141.60`, not `14160 paise`.
4. A replacement price reloads and submits the same exact rupee/paise value unless edited.
5. Zero and one-paise values work correctly.
6. More than two decimal places and unsafe values are blocked with accessible rupee-oriented messages.
7. Preview requests convert rupees to paise exactly, while preview responses render as rupees.
8. Backend contracts, persistence, calculations, and tests remain in paise and require no migration.
9. Dirty navigation, CAS conflict, quick-add, price history, and tax behavior remain unchanged.
10. Focused rendered tests pass at desktop and narrow widths with keyboard and accessible-error coverage.
11. Frontend typecheck, focused and broader tests, production build, frozen-estimator audit, and `git diff --check` pass.

## Data, API, and UX impact

- **Data:** No change; integer paise remains stored.
- **API:** No change; requests and responses remain paise-based.
- **UX:** Monetary input and output use rupees.
- **Authorization:** No change.
- **Side effects:** Normal pricing saves, immutable version creation, audits, and cache invalidation continue.
- **Migration:** None.
- **Rollback:** Reverting the presentation conversion restores paise entry without modifying stored data.

## Open decisions

None. Existing finance invariants establish the safe approach: rupees at the human interface, integer paise at all authoritative boundaries.
