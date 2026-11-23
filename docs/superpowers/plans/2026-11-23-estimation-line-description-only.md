# Description-only Main Line details in estimation

Follow the [approved specification](../specs/2026-11-23-estimation-line-description-only-design.md).

1. **Capture the baseline.** The integration owner records existing diffs in the Sales builder, workspace and tests. Check the shared detail renderer’s callers in Client estimation and Configuration before editing.
2. **Update Sales rows.** The frontend owner removes the role-based internal-details override in LeadEstimateWorkspace and its propagation through ConfiguredEstimateBuilder. Render the selected tier’s description through the existing description presentation, including editable, read-only and review rows. Preserve missing-source and unavailable-tier checks. Check ClientQuotationLine and ClientEstimateTiers against the same rule.
3. **Cover the display rule.** The regression owner updates affected Sales test fixtures and assertions, and checks existing Client description tests. Supply distinct descriptions for two tiers and recognizable internal specification and brand names. Verify the current description on both views, switching tiers, suppression of internal text, and absence of a panel for blank or unavailable text. Include the Sales workspace role path, a read-only row, and checks for normal quantity and pricing controls.
4. **Verify the integrated result.** Run the affected builder, workspace, Client and shared detail renderer tests, frontend typecheck and production build. Inspect Sales and Client rows at desktop and mobile widths, then run `git diff --check`.

After the baseline, production and test changes can proceed in parallel with separate file ownership. Integration verification follows both.
