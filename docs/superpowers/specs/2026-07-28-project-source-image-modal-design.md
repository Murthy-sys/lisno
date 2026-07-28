# Project Source Image Modal and Review Summary Design

## Goal

Simplify the client design-review page by presenting the source image once at
the review heading and making the approval summary easier to scan.

## Project-level source image

- Remove the repeated “View source page” disclosure and source-page image from
  every section review card.
- Add one “View source image” button beside the “Design review” heading.
- Use the source-page URL from the section with the highest design version as
  the project-level source image. When sections share that version, use the
  first matching section returned by the API.
- Omit the button when no section has a source-page URL.
- Open the authenticated source image in the shared dialog component.
- Show the source image at a useful large size with `object-fit: contain`.
- Support the dialog's existing Close button, backdrop dismissal, Escape-key
  dismissal, focus trapping, and focus restoration behavior.
- Do not fetch the same protected source image twice when opening the dialog;
  reuse the authenticated object URL loaded for the project-level control.

## Review summary

Replace the plain horizontal count strip with four responsive status cards:

- Approved: green accent and approved count.
- Rejected: red accent and rejected count.
- Awaiting review: amber accent and pending count.
- Total: neutral blue accent and total count.

Each card has a prominent numeric value and a smaller text label. The group
retains a single accessible summary label containing all four counts. Cards
display in one row when space permits and wrap into a compact grid on narrow
screens.

## Component boundaries

- `DesignSectionReview` owns the project-level source-image state, trigger,
  dialog, and progress summary.
- `SectionReviewCard` remains responsible for a section thumbnail, revision
  history, status, and client decision controls only.
- `ProtectedImage` continues to authenticate image requests and expose the
  resulting object URL for modal reuse.

## Testing

Update the client design-section review test first to prove:

- exactly one “View source image” trigger is rendered for multiple sections;
- no section card contains “View source page”;
- clicking the project-level trigger opens the source-image dialog;
- Escape closes the dialog and restores focus to the trigger;
- the four progress items use their semantic status styling;
- existing section thumbnail, history, approval, rejection, and read-only
  behavior remains intact.

Run the focused test, the complete frontend test suite, TypeScript checking,
and the production build.
