# Description-only Main Line details in Sales and Client estimation

## Goal and evidence

Show the configured description for the selected Main Line tier in Sales and Client estimation. ClientQuotationLine already passes the selected tier description to EstimateLineTierDetails. LeadEstimateWorkspace currently enables internal specifications for Sales, Designer and Super Admin identities. In that mode the row renders specification names and brands in place of the description.

## Display rule and scope

Use the description presentation throughout the Sales estimation workspace, including when a Designer or Super Admin opens the same view. Apply it to included lines in editable and read-only rows wherever tier details are rendered. Client estimation keeps its existing description presentation. The scope is the supplementary text on a line. Item names, tier selection, quantity, pricing, totals, review messages and editing controls retain their existing functions. Configuration continues to own the descriptions and internal specifications.

## Data and edge cases

Read the description for the row’s current tier from the existing catalogue or quotation data. A tier switch updates the text. For a missing, blank or unavailable description, omit the description block. Never substitute another tier’s text or internal specification and brand lists. This is a presentation change with no new API fields, draft writes or migrations.

## Acceptance and verification

- With both a description and internal specifications configured, the Sales and Client rows show only the selected tier’s description in the details area.
- Changing tier updates the description. Blank text leaves no empty panel. Normal quantity, price and item selection remain usable.
- Exercise both views with rendered regression tests, including the Sales workspace role path and a read-only row. Check the rendered line at desktop and mobile widths.

The scope assumes “only description” refers to Main Line details below the estimate row. No further product decision is needed beyond approving this scope.
