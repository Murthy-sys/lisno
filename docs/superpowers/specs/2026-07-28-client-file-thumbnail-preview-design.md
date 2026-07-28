# Client File Thumbnail Preview Design

## Goal

Let clients recognize approved uploaded images at a glance and preview them in
an accessible modal, while making file actions visually meaningful.

## Client Experience

Approved, client-visible image files display a 50×50 pixel thumbnail beside the
filename and approval metadata. The thumbnail is a real button with an
accessible label. Selecting it opens the full protected image in a modal.

The modal includes the filename, a large contain-fitted image, and a visible
Close button. It also closes with Escape or a backdrop click, traps focus while
open, and restores focus to the thumbnail after closing.

PDF files retain an explicit `Preview PDF` action and render inside the same
modal pattern. Unsupported file types expose only Download.

## Data and Security

The existing authenticated design-version download endpoint supplies both
thumbnail and full preview blobs. No public image URL is introduced. A single
object URL is reused for the thumbnail and modal during the component
lifecycle, then revoked on cleanup.

Loading and preview failures produce concise inline status without removing the
Download action.

## Button Styling

Client file actions use semantic variants:

- Preview and thumbnail controls use an outlined blue information style.
- Download uses the primary blue action style and a download icon.
- Modal Close uses a quiet neutral style.
- Existing approval/success actions use green variants.
- Existing reject/destructive actions use red variants.

This task applies semantic styling to the client file preview and modal. It
does not redesign unrelated application controls.

## Testing

Component tests verify authenticated image loading, exact 50×50 thumbnail
dimensions, modal opening and closing, focus restoration, PDF preview behavior,
download behavior, error fallback, and semantic button classes. Accessibility
smoke coverage verifies the dialog name and keyboard-close path.
