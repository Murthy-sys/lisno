# Vendor drawer header image

Date: 2026-09-24
Status: Approved and implemented in Mode A. Scoped review, focused tests/build and rendered checks complete; evidence in the task plan.
Scope: Small, presentation-only correction to the Add vendor side panel.

## Goal and evidence

Add the missing decorative header image shown in the latest user reference: a cream chair, olive arch, timber slats, lamp and plants positioned on the right beside the Procurement / Add vendor heading.

`frontend/src/features/procurement/ProcurementVendorEditor.tsx` renders a wide `ContextPanel` with the `vendor-profile` class. The shared contextual header in `frontend/src/styles/shell.css` currently uses CSS decoration, with no image. The available `vendor-directory-header.webp` shows a cabinet and vase, so it does not match the requested chair composition.

The older side-panel specification contains a broader unapproved reference-gap amendment. This request is limited to the missing vendor header image; it does not approve that amendment's other changes.

## Requirements and implementation boundaries

- Add a lightweight local decorative artwork matching the supplied chair/olive/slat/lamp/plant composition, without baked-in text or close icon.
- Place it at the right of the vendor panel header. Keep Procurement, title, description and close button readable and usable; reserve text space instead of overlaying the image onto the text.
- User refinement during implementation: render the artwork faintly, like other decorative screen backgrounds. Apply opacity to the artwork only; keep header text and controls at full opacity.
- Apply the same visual header to Add vendor and Vendor details, which share the vendor editor. Preserve the description's dynamic vendor name/code in details mode.
- Scope styling to the vendor panel. Keep the image decorative, outside the accessibility tree and pointer interactions.
- Adapt its size to available width. On narrow screens prioritize title and close-button space, hiding the decorative image if needed; no horizontal scrolling.
- Reuse the current header structure and image-loading conventions; no new dependency or data-bearing component API.

## Non-goals and invariants

No vendor field, label, section arrangement, validation, checkbox behavior, form submission, API, permission, main/sub basket, upload or allocation changes. No changes to the main application sidebar or other side panels. No implementation of the older broad amendment. No deployment, commit, data mutation or migration.

## Acceptance and verification

1. Desktop Add vendor header displays the chair/olive/slat artwork in the top-right position and scale of the attached reference.
2. Title, description, close button and form remain readable, operable and unobstructed; long Vendor details names wrap safely.
3. At 1440px, 768px and 390px there is no horizontal overflow or overlap. Decorative imagery does not add keyboard stops or screen-reader content. Light/dark header text remains legible.
4. Existing vendor form behavior and other side panels remain unchanged. Check the scoped diff, run the existing relevant vendor/panel tests and frontend typecheck/build, and visually inspect the rendered drawer.

## Risks and assumptions

Artwork may require recreation from the visual reference rather than an exact source-image crop. Asset compression and header-only sizing limit loading cost. Existing vendor and shared CSS files contain prior work, which must be preserved. No product or data decision is open.
