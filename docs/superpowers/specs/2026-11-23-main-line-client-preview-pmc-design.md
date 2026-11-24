# Show the PMC switch in Main Line Client view

## Goal and current behavior

When a Configuration user opens Client view for a Main Line, they should be able to try PMC immediately. KnowledgeMainLineClientPreview.tsx opens the drawer with Standard and vendor pricing selected. EstimatePricingModeControl.tsx renders nothing for that combination. The existing switch only appears after choosing Special. The shared control already supports a PMC-only presentation.

## Proposed behavior and scope

Keep Standard as the opening scenario. For an included, client-visible line, render the existing PMC-only switch in Standard and allow the user to toggle it. In Special, retain the full pricing controls. The initial switch is off. Turning it on selects PMC for the preview and displays the selected tier’s saved PMC pricing or its existing unavailable message. Turning it off in Standard restores vendor pricing. Closing and reopening starts a fresh preview.

Assumption for approval: “show PMC enable” means expose an interactive preview switch immediately. This request applies to the Configuration drawer. Pricing permissions in actual client quotations remain governed by their existing rules. There are no data, API, migration or authorization changes.

## Acceptance and risks

- In the default drawer, a keyboard user can find the named PMC switch, toggle it, and see its checked state and preview price change.
- With distinct vendor and PMC prices, each mode shows its own price. A missing PMC price displays the existing unavailable state. No fallback to another rate.
- Keep existing Special interactions, hidden-line and excluded-line behavior, and preview-only state. Toggling triggers no save to Configuration or an estimate.
- Verify in KnowledgeMainLineClientPreview.test.tsx and at mobile and desktop widths. Limit edits to the preview and its tests to avoid changing the shared control for other consumers.

Open decisions: approval of the preview interaction above.
