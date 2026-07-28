# Client Section Review Thumbnail Design

## Goal

Replace the large images in the client's awaiting-review section cards with
compact 50×50 thumbnails that open full previews in a modal.

## Target Surface

This design applies to `SectionReviewCard` inside the client Design Review
grid. It does not replace the approved-file thumbnail work in `FilePreview`.

Each section card retains its title, version, review status, source-page
disclosure, revision history, and decision controls. The current large inline
revision preview is replaced with a labeled 50×50 protected thumbnail.

## Interaction

Selecting the thumbnail opens the full protected revision image in the shared
accessible `Dialog`. The dialog closes through its close icon, Escape,
backdrop, or a visible `Close preview` button and restores focus to the
thumbnail.

The source page remains behind `View source page`; its existing protected image
behavior is unchanged.

## Semantic Actions

- `Approve` uses a green success style.
- `Request changes` uses a red/orange attention style.
- `View source page` uses a neutral disclosure style.
- `Close preview` uses the neutral close style.

All labels and accessible names remain explicit and action-oriented.

## Data and Security

The existing `ProtectedImage` component continues fetching revision images
through authenticated API requests. It exposes a callback with its protected
object URL so the thumbnail and modal can reuse the same blob without a second
request. Object URL cleanup remains owned by `ProtectedImage`.

## Testing

Component tests verify the 50×50 thumbnail contract, authenticated image load,
modal open/close behavior, focus restoration, unchanged revision history, and
semantic action classes. The full frontend suite, type checking, and production
build remain required.
