# Tier description in estimator details

Date: 2026-11-16
Status: Approved and implemented in Mode A; verification and the known pre-existing API-documentation test failure are recorded in the task plan

## Goal and scope

Show the selected tier's Description paragraph above **Specification item name (Brand names)** inside the existing **Show details of tier** expansion. Apply the same behavior to the estimator and Configuration's **Client view**, preserving their styling and controls.

This extends the previously approved names-and-brands content requirement. The completed specification fallback remains unchanged.

## Current behavior and evidence

- `EstimateLineTierDetails.tsx` renders only `details.specifications`; the catalogue DTO has no description field.
- `estimator-catalogue.service.ts` builds that metadata from the pricing section. It already reads the current revision's advanced section, where `modeDescription` and `modeConfigurations` live.
- `KnowledgeModeConfigurationBuilder.tsx` displays a custom saved `modeDescription` synchronized with configured inclusions/exclusions. When no custom paragraph is stored, it uses the existing shared `generateModeDescription` formatter. Merely projecting the raw optional field would still omit paragraphs visible in Configuration.
- Signature uses root section fields. Premium, Functional, and default Mode use separate `tierConfigurations` namespaces. The existing catalogue resolver selects the latest saved draft, otherwise the saved active revision, by stable Main Line ID.

## Required behavior

1. Render the description first, followed by the existing specification names and bracketed brands, within the same expansion. Keep the title, collapsed initial state, layout, typography, colors, and controls.
2. Use the description shown by Configuration for the selected tier's saved values. Reuse the existing shared paragraph generation/synchronization behavior, including the generated paragraph when the selected tier has valid saved Mode configuration but no custom text. Do not require users to re-enter or re-save an already configured description.
3. If the selected tier has neither a usable saved paragraph nor a configured source from which its paragraph can be generated, use the configured default Mode description from the same current Main Line revision. Resolve description and specification fallback independently: a tier-specific description may accompany default specifications, or vice versa.
4. Malformed description/configuration data and explicitly disabled retained content must not be treated as ordinary absence. Do not borrow another tier, Main Line, or historical revision to conceal invalid current data. Missing descriptions do not prevent valid specifications or pricing from displaying.
5. Show a valid description even if specifications are empty or unavailable. Preserve specification-empty/unavailable feedback without claiming that all details are unavailable while a description is visible. If no safe description exists, do not invent a generic paragraph from the item name alone.
6. Render text safely, preserve paragraph line breaks, and wrap long content at narrow widths. Apply the existing 4,000-character description limit. Keep expansion keyboard accessible; update its content immediately when the tier changes.

## Data, API, and compatibility

Add only the read-only description metadata needed by the existing catalogue consumers. Keep unavailable/empty specification states intact, and project descriptions only for applicable tiers from the verified current source. Reuse existing advanced-section reads; no expansion-time request or new endpoint is needed.

Update backend response types, OpenAPI, frontend types, draft hydration/refresh, and the shared disclosure together. Clear descriptions when source identity is missing or incompatible. Older responses without descriptions remain usable. Configuration saves and catalogue refresh continue through the existing invalidation paths.

Expose only the final display paragraph, never raw Mode configuration, internal notes, margins, or cost inputs. Descriptions remain display metadata: exclude them from estimate mutation payloads and dirty fingerprints. Rates, quantities, selection, permissions, approved/published artifacts, and persisted Configuration remain unchanged.

## Assumptions and non-goals

“Tier description” means the Description paragraph in Configuration's Mode/tier editor, rather than each specification's separate brief-description field. The previous preference for default Mode fallback applies to the missing description as well. Both assumptions are explicit in this specification; no additional product decision is required if it is approved.

No redesign, extra visible headings, new dependency, database migration, seed, customer communication, commit, push, or deployment is included. Preserve all existing dirty work. This task does not change the Configuration editor or independently issued client documents.

## Risks and acceptance criteria

The main risks are omitting generated paragraphs, mixing scopes/revisions, leaking raw configuration, and making a descriptive refresh appear to edit an estimate.

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | Estimator and Client view show the description above names/brands in the existing expansion. | Rendered tests for both consumers; desktop/mobile browser inspection. |
| AC2 | Custom and generated paragraphs match saved Configuration values for the selected tier; missing tier descriptions use default Mode. | Unequal tier/default fixtures, custom and generated paragraphs, independent description/specification fallback. |
| AC3 | Current stable source identity and applicability are enforced; malformed or disabled data cannot borrow unrelated content. | Focused projection and catalogue integration cases with distinct Main Lines/revisions, invalid values, absent and disabled scopes. |
| AC4 | Description-only, specification-only, and unavailable states remain clear and accessible. | Empty/missing cases, tier switching while expanded, keyboard interaction, multiline/long text and plain-text escaping. |
| AC5 | Description refresh does not affect prices, selection, persistence, or dirty state; old API responses remain usable. | Existing catalogue regressions, hydration/fingerprint/serialization tests, no-write consumer assertions. |
| AC6 | Integrated changes compile and preserve unrelated work. | Focused backend/frontend tests, typechecks/builds, final diff and preservation checks. |

Use focused verification for this bounded addition. Keep the previously recorded unrelated API-documentation enum test failure separately identified if it remains. Rollback requires only reverting this addition; no stored-data repair is necessary.

## Workflow

Specification and task plan were approved, and the user selected Mode A. Implementation and verification are recorded in [the task plan](../plans/2026-11-16-estimator-tier-description.md).
