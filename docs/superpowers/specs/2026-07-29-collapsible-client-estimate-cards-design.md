# Collapsible Client Estimate Cards Design

## Goal

Make the client dashboard easier to scan by collapsing client estimate cards
by default while preserving the full review and decision workflow on demand.

## Scope

Only the client view changes. Design-manager and designer estimate cards keep
their current always-visible review controls and layout.

## Interaction

Each client estimate is an independent disclosure and starts collapsed. Its
always-visible header shows only:

- project name; and
- final estimate total.

Selecting the header expands or collapses that estimate. Multiple estimates
may remain expanded simultaneously. Expansion state is local to the dashboard
and resets on page reload.

The expanded panel contains the existing client-facing content:

- location and client name;
- included item count;
- section-wise estimate lines;
- subtotal, GST, and final total;
- optional review note; and
- **Request changes** and **Approve estimate** actions when the estimate is
  awaiting a client decision.

Completed estimates also remain collapsible. Their expanded panels are
read-only and show **Estimate approved** or **Changes requested** instead of
decision controls.

## Accessibility

The project name remains a semantic heading outside the disclosure button. The
native button is named by that heading and exposes `aria-expanded` and
`aria-controls`. The controlled panel has a stable estimate-specific ID.
Collapsed content is not present in the DOM or accessibility tree.

## Components and State

`EstimateReviewPanel` keeps its existing query, mutation, role, and actionability
logic. Client-only disclosure state belongs to each rendered estimate card so
cards expand independently without a shared accordion controller.

The current `ClientEstimateDetails` component continues to render the
section-wise breakdown inside the expanded panel. Existing mutation success,
query invalidation, error messaging, and completed-status behavior remain
unchanged.

## Presentation

Client estimate cards use the same interaction language as the new client
project disclosures: a clear clickable header, a directional indicator,
visible keyboard focus, and a bordered expanded panel. The compact header must
remain readable on mobile, placing the project name and total without exposing
secondary metadata until expansion.

## Testing

Frontend tests will verify:

- client estimate cards start collapsed with only project name and total
  visible;
- toggles expose the correct initial and expanded ARIA state;
- expanding one estimate does not expand another;
- section details and client decision controls appear only after expansion;
- collapsing removes those controls again;
- completed estimates expand to read-only status without decision controls;
- manager and designer estimate-card behavior remains unchanged; and
- frontend tests, type checking, and production build pass.
