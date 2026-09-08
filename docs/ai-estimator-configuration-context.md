# Configuration context for future estimator analysis

The existing estimator does not currently call the knowledge context API. This document describes the read-only configuration contract to use when that integration is built. No AI model is invoked by this endpoint.

`POST /api/v1/ai-estimator-knowledge/context` retains its existing authentication and sole active Super Admin restriction. It reads one active revision in a Mongo snapshot transaction. Draft changes cannot affect the returned configuration until that revision is activated.

## Identity and ownership

Use stable IDs from `lineage` and the returned Overview identities, never labels as joins. The request must identify the Main Basket and Main Line; optional Specification, UOM and Surface references are validated against the configured item. The revision ID, revision number and content digest identify the configuration snapshot. Changing a draft does not change an already returned snapshot.

| Configuration | Ownership |
| --- | --- |
| UOM and decimal precision | Main Line Overview, shared by every cost |
| Saved paragraph | Main Line, shared by PMC and Execution |
| Selected Inclusion and Exclusion lists | Main Line, shared; currently stored on the canonical PMC configuration |
| PMC calculations | `pmc` only |
| Sub-Vendor calculations | `sub_vendor` only |
| In-house Labor calculations | `in_house_labor` only |
| In-house Material calculations | `in_house_material` only |
| Specifications, recommendations, quality and dependencies | Their own sections within the same Main Line revision |

The Mode checkboxes and Execution source radio buttons choose which configuration the administrator is viewing. They do not enable/disable, delete or merge the other stored configurations. The UI labels this view behavior.

PMC Margin is an optional numeric input saved as `advanced.pmcMarginBps` (integer hundredths of a percent). Both the form and API enforce 10%–20% inclusive, with up to two decimal places. Values outside this range must be corrected before saving; existing invalid values are displayed for correction rather than silently changed. Clearing it saves null. This separate PMC setting does not modify any cost's gross margin markup or simulator formula.

## Selected calculation context

The additive `configuration` response is the source for the newer Mode calculations. Request `modeKind: "pmc"`, or `modeKind: "execution"` with `executionSource: "sub_vendor"` / `"in_house"`. The response contains only that selection's calculation entries. In-house returns two explicitly named cost entries. It does not guess a mode from a legacy mode ID, a Main Line name, a paragraph or an available rate.

- `state: "ready"`: the selected settings and UOM are usable configuration inputs. This does not mean an estimate has been approved, a requested quantity has been priced, or a model has analysed it.
- `selection_required`: supply a canonical Mode and, for Execution, its source. No calculation entries are selected automatically.
- `not_configured`: one or more costs or the Overview UOM are missing. Consult `issues`; do not substitute zero or another mode's cost.
- `invalid`: selected settings, quantity precision, or shared scope data cannot be resolved safely. Do not calculate until corrected.

Read the existing top-level `availability` alongside this state for Specifications, recommendations, quality, dependencies and other sections. A ready calculation does not make missing sections configured.

`shared.inclusions` and `shared.exclusions` contain only checked items, each with its stable ID and name. The lists are independent: the same label can appear in both and must retain its list identity. Never derive selections by parsing the paragraph. `shared.paragraph` is the saved custom wording, or null when the UI generates its standard paragraph from the Main Line name and selected lists. Unchecked entries, vendor notes and stored component answers are not included in this projection.

Each calculation entry has `scope`, `source`, `settings` and `maximumDiscountBps`. An explicitly null or missing scope never falls back to another scoped cost. Older records use the same compatibility rules as the configuration UI: an old shared value may seed each scope (`legacy_shared`), and an old In-house value may seed its two costs (`legacy_in_house`). The source is explicit so a future consumer can require review of inherited settings. Once either split In-house key exists, neither split cost inherits the old In-house value. No data is rewritten by context resolution.

## Units and calculation rules

`formulaVersion` is `mode-markup-v1`. Money is integer paise and percentages are basis points: 100 paise = ₹1, and 100 basis points = 1%. `impactBps` defaults to 1,000 only for older records that omit it; an explicit zero is retained.

Use the existing backend Mode calculator, including its rounding and overflow checks:

1. Apply Impact to the Base Rate only when quantity is strictly below the Low Quantity Limit.
2. Multiply the revised unit rate by quantity in the Overview UOM.
3. Add the selected Starting or Minimum markup to that amount. A 35% markup multiplies by 1.35.
4. For In-house, calculate Labor and Material separately with their own settings, then sum their independently rounded final amounts.

`maximumDiscountBps = startingMarkupBps - minimumMarkupBps`, independently for each cost. This is a difference in markup percentage points. Test simulators accept temporary `modeCalculationDiscountBps` and subtract it from the chosen markup before calculating the total. It must not reduce that markup below the minimum: the allowed discount at minimum markup is zero. The combined In-house simulator applies one discount to both costs, bounded by the smaller allowance. The backend enforces the limit and returns the effective markup, pre-discount total and saving for each cost. Estimation-level discount entry/enforcement is not yet connected and must not reinterpret this as a percentage discount on the final selling price.

The existing top-level `preview` uses the older immutable price-version/GST calculation system. It remains for compatibility and is **not** the total for `configuration.calculations`. Do not combine both systems or let a generic legacy rate override the selected Mode settings. PMC's displayed 10%–20% margin range also does not add an extra charge to the current Mode formula.

The future estimator integration still needs stable configuration IDs on estimator items, server-authorized resolution for that workflow, deterministic pricing, and saved revision/formula lineage before AI analysis or suggestions can use these configurations on real estimates.
