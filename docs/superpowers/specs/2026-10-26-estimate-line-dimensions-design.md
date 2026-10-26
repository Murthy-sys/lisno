# Mandatory estimate-line dimensions

## Confirmed requirement

Overview gains a Dimensions mandatory? Yes/No control. When enabled, Sales and the client enter measurements for the estimate line and quantity is calculated from dimensions. Existing saved Main Lines without the setting retain manual quantity behavior. Measurements are per estimate line and room, separate from the existing room dimensions.

## Settled calculation contract

The user chose **always Length × Width**, with units determined by the Main Line's configured UOM. Length, Width and Height are required positive measurements. Height is recorded but does not multiply quantity.

UOM masters contain arbitrary code/name and decimalScale. Resolve only recognized area-unit aliases: square feet, metres, centimetres, millimetres, inches and yards map to their corresponding linear input unit. Reject conflicting aliases, unknown units and non-area units when enabling mandatory dimensions. Existing manual-quantity lines remain compatible. Do not guess conversion for arbitrary labels.

The server owns the resolved rule (formula, input unit, quantity unit, UOM ID and precision). Explicit measurement commands include the displayed rule as a concurrency expectation, in addition to item/revision/estimate versions. Same-ID UOM edits therefore cannot silently reinterpret entered values. On switching the setting to No, retain historical measurements and their original rule while manual quantity resumes.

## Data, API and UX

- Overview stores optional `dimensionsMandatory`, absent meaning No. Supported-unit guidance sits with the Yes/No control.
- Estimate lines hold canonical measurement strings and a rule snapshot. Shared and backend helpers use the same exact arithmetic, protected by parity tests.
- Sales derives read-only quantity in the estimate builder. Client uses the narrow `PATCH /projects/:projectId/estimate-dimensions/:lineItemId` command, separate from tier selection. It accepts measurements and source expectations, not a price or quantity.
- Invalid/missing measurements block saving and publication. Review locks, ownership and hidden-line rules match the existing tier workflow.
- A source price change prompts the client to ask Sales to refresh pricing; entered measurements remain available. Current-rule changes require explicit confirmation before reuse.
- Frozen web presentations/PDFs show recorded measurements; historical publications are not recalculated. Native clients preserve these fields and direct unsupported measurement edits to the web application.

## Engineering invariants

- Preserve all previous uncommitted tier/configuration work. The isolated task copy and baseline capture 3570 files.
- Canonical decimal measurements and exact rational arithmetic; multiply before rounding quantity once to the configured UOM precision. Reject nonpositive, invalid, excessively precise, overflowing or zero-rounded results.
- Server computes quantity and amount. Clients cannot bypass measurement rules by submitting an arbitrary quantity or changing tiers.
- Dimension-only saves preserve the chosen tier, mode and components. Manual rates remain manual. Configured rates use or validate the current selected source without a Signature fallback.
- Source rule/UOM changes require review; never silently reinterpret saved inputs. Older callers retain saved dimensions and cannot overwrite a derived quantity.
- Measurement changes invalidate design scope even when their products are equal.
- Submitted and approved snapshots/PDFs retain recorded measurements/rules/quantities. Existing procurement planned order quantity remains independent.
- Client edits use project ownership, hidden-line filtering, source version checks, estimate CAS and pending/final-review locks. Hidden costs remain in totals.
- Native compatibility preserves values and prevents unsupported native edits, unless full native input is deliberately included.

## Acceptance criteria and verification

Configuration persistence, read-only and conflict behavior; exact formula/unit arithmetic; per-room isolation; invalid/missing inputs; forged quantities; stale rule and UOM changes; old-client writes; save/reload; in-flight edits; client permission/CAS/manual rates; same-product design invalidation; immutable publication/PDF; native round trips; desktop/mobile rendered checks. No production migration or data changes.

No new dependencies, migration, commit, push, deployment, or live estimate mutation. Apply only reviewed source deltas after checking baseline hashes, with local backups and byte verification. Restart the local source backend and inspect the existing Overview without saving user data.
