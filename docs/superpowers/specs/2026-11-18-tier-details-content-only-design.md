# Tier details: audience-specific content only

Date: 2026-11-18
Status: Approved and implemented in Mode A. Local checks passed; exact results and limits are in the [task plan](../plans/2026-11-18-tier-details-content-only.md). Application changes are limited to the tier-details renderer and its stylesheet. No deployment or stored-data changes occurred.
Classification: Bounded shared frontend presentation change.

## Goal

The user requires that the item detail area contain only:

- **Client:** the selected Signature/Premium/Functional tier's saved Description.
- **Internal team:** the selected tier's specification item/Brand details.

There must be no extra visible heading, tier label, introductory line, placeholder, or explanatory sentence in this area. This refines the previously approved selected-tier description feature; it does not remove the surrounding item's name, tier/quantity/price controls, or actionable workflow/validation feedback outside the detail area.

## Current behavior and evidence

- `EstimateLineTierDetails.tsx` already renders only the supplied description for clients and returns null for a missing/blank description. Client quotation, client tier choice, and Configuration Client preview use this default behavior.
- `ClientQuotationLine.tsx` and `ClientEstimateTiers.tsx` supply only the selected choice's description. Configuration preview supplies `tierDescriptions[tier]`.
- The same shared component currently renders both the description and a staff-only disclosure when `showInternalDetails` is true. Its visible summary is **Internal specifications**. It also inserts **Specifications unavailable for this tier.**, **No specifications configured for this tier.**, and **Brand unavailable**.
- `ConfiguredEstimateBuilder.tsx` supplies the selected tier's details; `LeadEstimateWorkspace.tsx` enables internal visibility only for its existing authorized internal roles. Other callers remain client-safe by default.
- Backend `projectEstimatorTierDescription` already reads only the chosen tier's saved wording, without default fallback or generated clauses. Internal specification projection has an independently approved default-Mode fallback. Neither projection rule needs a backend change for this presentation refinement.

## Required behavior

1. For the client/default presentation, render exactly the supplied selected-tier Description as plain text with its authored line breaks. Do not add headings, specifications, Brands, internal notes, source labels, generated clauses, or placeholder sentences.
2. A missing, blank, unavailable, or invalid selected description produces no detail element or empty reserved paragraph. Do not borrow another tier's description or synthesize content from specifications.
3. For authorized internal presentation, render only the supplied selected-tier specification entries directly, without a disclosure header or the client description paragraph. Keep the compact established format `Item name (Brand A, Brand B)`; show the item name alone when there are no known Brand names.
4. Show only real nonempty Brand names. Do not insert `Brand unavailable`, empty parentheses, raw IDs, source metadata, or other substitute text for unresolved names. Preserve the API values and Configuration validation/recovery paths; this changes only visible descriptive content.
5. Missing or empty internal details produce no detail element. Do not add an unavailable/not-configured message or fall back to the client description in this presentation.
6. Remove visible **Description**, tier headings, **Internal specifications**, **Internal information**, and all explanatory/empty-state copy from the shared detail area. Render only the actual audience-specific content, including when switching tiers or roles.
7. Keep nonvisible accessible association with the item and selected tier. Preserve semantic plain text/list markup, escaping, wrapping, and accessible names. No new controls, icons, layout panels, animations, or dependencies are needed.
8. Refreshes, tier changes, unavailable sources, and loss of internal access must remove stale/unauthorized content immediately. Rendering must not dirty estimates, write descriptions, or alter prices, GST, identities, permissions, or save behavior.

## Scope, assumptions, and non-goals

This change is scoped to the shared per-item description/tier-detail area in current client quotations, tier-choice screens, Configuration Client preview, and the authorized staff estimator. Existing client behavior is retained and verified with exact-content assertions; internal presentation changes from description plus labelled disclosure to plain detail content only.

“Tier details” means the existing projected specification item names and their associated Brand names. The renderer uses the selected tier's existing API entry; this does not change backend source resolution or its separately approved internal default-Mode fallback. It does not expand the API to include private payload fields or brief specification descriptions.

Saved Description text is displayed as authored. Do not guess which stored sentences were automatically generated in the past or rewrite stored wording. Price/quantity controls, save/error messages outside this detail region, configuration-authoring labels, historical issued documents, and PDF exports are outside this request.

No backend, schema, shared contract, migration, permission, dependency, or financial changes are planned. Existing uncommitted GST, tier-description, Brand-prefill, and copy-previous work must be preserved. No service restart, production mutation, deployment, commit, or push is included.

## Risks and decisions

The main risk is mixing client and internal content in a shared component. Keep the existing explicit internal capability flag and client-safe default; verify the two branches with distinct private-content sentinels. Removing the disclosure changes keyboard order, so adjust interaction tests to verify the remaining real controls rather than retain an empty focus stop.

Client description-only presentation and internal detail-only presentation are the selected approach. Keeping a labelled disclosure would contradict the request for no extra visible text. Hidden accessibility labels do not count as additional visible lines.

## Acceptance criteria and verification

| ID | Acceptance criterion | Evidence |
| --- | --- | --- |
| AC1 | Client detail DOM text equals exactly the selected saved Description, with no appended data or headings. | Shared component plus client quotation, tier choice, and Configuration preview tests with three unequal descriptions/private sentinels. |
| AC2 | Internal detail DOM contains only the actual specification names and known Brand names, without a description, disclosure label, placeholder, or raw ID. | Exact text/list assertions for normal, unknown-Brand, brandless, markup-looking, and long-content inputs. |
| AC3 | Missing/empty content leaves no detail element; tier/source/role changes clear old content immediately. | Empty/undefined/null and selected-tier/access transition regressions. |
| AC4 | Internal capability boundaries, pricing, GST, mutation payloads, and validation outside the region remain intact. | Existing builder/client regressions and no-write assertions; source-isolation checks. |
| AC5 | No extra visible lines, responsive overflow, inaccessible content, or empty disclosure control remains. | Rendered accessibility/focus tests, desktop/mobile inspection, frontend typecheck/build, and git diff --check. |

## Approval and rollback

The user approved this scope and the separate task plan, then selected Mode A. The user reiterated that changes must remain limited to showing tier details; the delivered application diff contains only the shared tier-details component and its stylesheet. Surrounding operational controls and feedback remain intact. Rollback is a frontend presentation change only and requires no stored-data repair.
