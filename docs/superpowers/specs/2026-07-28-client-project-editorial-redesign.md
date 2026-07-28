# Client Project Editorial Redesign

## Goal

Redesign the complete client project page as a warm, modern architectural
experience that feels engaging without obscuring project progress or review
actions.

## Visual direction

Use the approved **Architectural Editorial** direction:

- warm stone, parchment, olive, terracotta, and muted blue colors;
- refined editorial display typography for page and section headings;
- highly legible system typography for controls and supporting information;
- generous whitespace, restrained shadows, soft borders, and rounded surfaces;
- a premium residential character rather than a generic dashboard aesthetic.

The redesign applies to the client project page only. It does not change the
designer, manager, head, authentication, or client-dashboard screens.

## Page hierarchy

### Project hero

The page begins with a dark warm-toned project hero containing:

- the “Project plan” eyebrow;
- project name;
- location and expected completion date;
- overall project-completion percentage.

The hero establishes the project identity and makes the completion figure
visible without turning it into an oversized dashboard metric.

### Floor progress

Each floor uses a refined progress card with:

- floor label and name;
- current progress state;
- percentage-complete label;
- warm accent progress bar.

Existing progress values and empty states remain authoritative. This redesign
does not derive new project data.

### Design review

The design-review heading contains the single project-level “View source image”
control. The four counts remain an accessible group and use compact semantic
status cards:

- Approved: muted green;
- Rejected: muted terracotta;
- Awaiting review: amber;
- Total: neutral blue.

### Approved documents

Approved client-visible plans remain below the review experience. Their visual
weight is quieter than active review work. Existing authenticated thumbnail,
modal preview, download, and empty-state behavior remains unchanged.

## Focused review queue

Replace the multi-card section grid with one large active plan at a time.

The active review surface contains:

- a large protected section image;
- plan position, such as “Plan 1 of 4”;
- section label, design version, revision number, and status;
- revision history and prior rejection comment where applicable;
- Approve and Request changes actions when the active revision is submitted
  and the page is in client mode;
- Previous and Next plan controls;
- a compact position indicator.

The existing section image remains clickable and opens its large preview modal.
The project-level source-image modal remains separate.

## Queue state and client actions

- The initial active plan is the first submitted plan awaiting review.
- If no plan is awaiting review, the initial active plan is the first section
  returned by the API.
- Previous and Next navigate across all returned submitted, approved, and
  rejected sections without wrapping.
- Navigation controls are disabled at their respective boundaries.
- Approve continues to use the existing confirmation dialog.
- Request changes continues to require a modification comment.
- After a successful approval or change request, show a concise success
  announcement and advance to the next section still awaiting review.
- If no awaiting section remains, show the completed-review state and keep the
  decided section available through queue navigation.
- When a decision request fails, keep the same section active, retain rejection
  text where applicable, and display the API error.
- Approved and rejected plans remain navigable, but their decision actions are
  absent.
- Read-only mode exposes navigation and inspection but never decision actions.
- When refreshed server data removes or reorders the active section, preserve
  it by section ID when it still exists; otherwise select the next awaiting
  section, then fall back to the first section.

## Responsive behavior

- Desktop uses a two-column active review surface: image on the left and plan
  information/actions on the right.
- Tablet and mobile stack the image above the details.
- Status cards collapse from four columns to two columns.
- Project hero content stacks without overlapping the progress figure.
- Previous, position, and Next remain in a predictable navigation row.
- Decision buttons become full-width where narrow screens require it.
- The page must not introduce horizontal scrolling at supported viewport sizes.

## Accessibility

- Preserve the existing page and section heading hierarchy.
- The progress summary retains `role="group"` and its complete accessible
  count label.
- Queue navigation has clear accessible names that identify the destination
  plan where possible.
- The active review surface announces plan changes without moving keyboard
  focus unexpectedly.
- Successful client actions use a polite status announcement.
- API failures use alert semantics.
- Existing shared dialogs retain focus trapping, Escape dismissal, backdrop
  dismissal, and trigger-focus restoration.
- All color-coded states retain visible text and sufficient contrast.
- Disabled boundary controls remain visibly distinguishable.

## Component design

- `ClientProject` owns the page-level project hero, floor progress, approved
  documents, and placement of the design review.
- `DesignSectionReview` owns source-image state, progress summary, active
  section ID, queue navigation, decision dialogs, success/error feedback, and
  refresh reconciliation.
- `SectionReviewCard` becomes the active-plan review surface. It receives
  position, navigation state, and navigation callbacks while retaining
  section-specific image, metadata, history, and actions.
- `ProtectedImage`, `Dialog`, API functions, and query keys remain unchanged
  unless a test exposes a real integration defect.

## Error and empty states

- Project and approved-plan loading/error states keep their existing behavior
  and receive styling consistent with the new page.
- A design-review fetch failure keeps its retry action.
- No submitted sections produces a calm, editorial empty state.
- No remaining awaiting plans produces an explicit “Review complete” state
  while preserving access to prior decisions.
- Protected-image failures continue to use the existing image fallback.

## Testing and verification

Use test-driven development and preserve all existing client behavior.

Automated coverage must prove:

- the redesigned hero and progress regions expose the same project data;
- one active review plan renders at a time;
- Previous and Next respect boundaries and update the active plan;
- initial selection prioritizes an awaiting plan;
- successful approval advances to the next awaiting plan;
- successful rejection advances to the next awaiting plan;
- failures retain the active plan and rejection comment;
- completion state appears when no awaiting plans remain;
- decided and read-only sections have no decision actions;
- source and section preview modals remain functional;
- progress-group accessibility and live status announcements work;
- empty and no-source states remain correct.

Run the focused client project and design-review tests, the complete frontend
test suite, TypeScript checking, and the production build.
