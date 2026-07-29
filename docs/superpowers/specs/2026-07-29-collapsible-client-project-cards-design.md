# Collapsible Client Project Cards Design

## Goal

Make the client dashboard easier to scan by collapsing each project card by
default while keeping its essential status visible.

## Interaction

Each client project renders as an independently controlled disclosure.
Projects start collapsed. The always-visible toggle shows:

- project name;
- location;
- completion progress; and
- floor count.

Selecting the toggle expands or collapses only that project. Multiple projects
may be expanded at the same time.

The expanded panel contains the existing secondary information and actions:

- expected completion date;
- latest approved update, including loading, empty, and retry states; and
- the **Open project** link.

Expansion state is local to the dashboard and does not persist across page
reloads.

## Accessibility

The project header is a native button. It exposes `aria-expanded` and
`aria-controls`, and the controlled panel has a stable project-specific ID.
The project name remains a heading so the dashboard retains a navigable content
hierarchy. Collapsed panel content is not present in the accessibility tree.

## Components and State

`ClientDashboard` continues to load project summaries and latest approved
versions. `ClientProjectCard` owns its own boolean expansion state, initialized
to `false`, so cards remain independent and no dashboard-wide accordion
coordination is required.

The existing latest-approved-version lookup, error handling, retry callback,
and project navigation remain unchanged. Only their visibility moves into the
expanded panel.

## Presentation

The collapsed header is visually recognizable as interactive and includes a
directional indicator that changes with expansion. Existing client-card colors,
spacing, and button styles remain the visual foundation. Focus, hover, and
expanded states must be clear on desktop and mobile.

## Testing

Frontend tests will verify:

- project cards initially hide their detailed content and **Open project** link;
- a project toggle reports `aria-expanded="false"` initially;
- selecting a toggle reveals that project's details and changes it to
  `aria-expanded="true"`;
- selecting it again collapses the project;
- expanding one project does not expand another; and
- latest-update retry behavior remains available after expansion.

Frontend type checking and the production build must continue to pass.
