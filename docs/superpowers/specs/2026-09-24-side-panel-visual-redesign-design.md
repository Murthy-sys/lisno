# Side panel visual redesign (Add vendor reference)

Date: 2026-09-24
Status: Original scope approved and implemented in Mode A (T1–T4 integrated; final verification in progress). Amendment 1 (reference-gap closure) drafted — awaiting approval.
Source: User attachment (“Procurement · Add vendor” reference mock) and request: “i need add vendor side panel similar to attached image in web page.. and need similar changes for all side panels.. dont touch anything except sidepanels... and dont add any extra variables to existing.. keep fields as it is.. make only design changes in side panels”.
Classification: Substantial (shared UI primitive with ~45 consumers), presentation-only. No data, API, permission, finance, or workflow change.

## Goal

1. Restyle the web **Add vendor / Vendor details** side panel to match the reference: branded header, sectioned cards with icon tiles, selectable option cards, icon-adorned inputs, dropzone upload, amber allocation warning, and a pinned Cancel / Save footer.
2. Apply the same visual language (header, body surface, form controls, footer) to **every web side panel** built on the shared `ContextPanel` → `Drawer` (contextual) primitive.

## Hard constraints (from the user)

- **Design-only.** No new or renamed fields, draft keys, form state, props that carry data, API calls, validation rules, query keys, or backend/mobile changes.
- **Keep fields as they are.** Every existing field, label text, required marker, hint, error, option value, and conditional rule stays. Fields present in the code but absent from the mock (Status, Directory description, Vendor Documentation) stay. Fields in the mock that do not exist in code (country/flag picker on phone) are **not** added.
- **Side panels only.** No changes to pages, dialogs (`Dialog`/modal), navigation drawers, mobile app, or other screens.

## Current behavior and evidence

- `frontend/src/components/ui/ContextPanel.tsx` wraps `Drawer` with `variant="contextual"`; `Drawer.tsx` renders header (eyebrow, `h2`, description, metadata, close), scrollable body, and footer. Styling lives in `frontend/src/styles/shell.css:339-530` (`.ui-drawer--contextual`, `__header`, `__body`, `__footer`). Widths come from `--panel-width-narrow|medium|wide` (360/480/720px) in `styles/global.css`.
- ~45 feature files render `<ContextPanel>` (access, admin, leads, manager, procurement, workflow, knowledge, designer, finance, client, tasks). Navigation drawers (`variant="navigation"`: `MobileHeader`, messages, notifications, budget builder) are **not** side panels in scope.
- Vendor panel: `features/procurement/ProcurementVendorEditor.tsx` (`className="vendor-profile"`, `width="wide"`), `VendorProfileFields.tsx`, `VendorBasketFields.tsx`, styles in `vendorProcurement.css:67-87`. Sections today are plain `<section>` + `<h3>` separated by rules; radios/checkboxes are inline; inputs have no adornments; the photo input is a plain file control.
- Execution Type is intentionally **checkboxes** (approved amendment in `2026-09-24-procurement-vendor-details-design.md`); the mock shows radios. The checkbox behavior is kept.
- Worktree is dirty. The vendor files (`ProcurementVendorEditor.tsx`, `VendorProfileFields.tsx`, `VendorBasketFields.tsx`, etc.) are untracked in-flight work from the approved vendor-details effort, and `vendorProcurement.css` is modified. `shell.css`, `ContextPanel.tsx`, `Drawer.tsx` are clean.

## Scope

### A. All side panels (global, via shared CSS on `.ui-drawer--contextual`)

- **Header:** uppercase, small, brand-green eyebrow; large bold title; muted description; a decorative, `aria-hidden` soft illustration/gradient on the header's inline-end side rendered purely in CSS (no new image asset); close “X” top-right retained. Existing metadata slot unchanged.
- **Body:** light tinted surface (token-based) with comfortable padding so content cards read as raised.
- **Form controls inside panels:** bold labels with red required asterisk (existing `ui-field__required`), rounded inputs/selects/textareas with light borders and muted placeholders, consistent focus ring, consistent hint/error styling.
- **Optional section card primitive:** a new presentational `PanelSection` (icon, title, description, children) in `components/ui/` with `ui-panel-section` styles — white card, header band with rounded icon tile, title and subtitle. Consumers opt in; it carries no data.
- **Footer:** pinned, white, top border; secondary “Cancel” as outlined button, primary action as dark brand-green filled button, right-aligned. Button text/behavior unchanged.
- Light and dark themes and existing role themes continue to work through tokens.

### B. Vendor panel (reference layout)

- Wider panel on desktop for the vendor panel only (CSS override on `.vendor-profile`, e.g. `min(1040px, 100%)`), full width on mobile (existing rule).
- Wrap existing sections in `PanelSection` with icons (lucide-react, already a dependency): Vendor Classification (users), Vendor Information (file-text), Contact Information (phone), Identity & Verification (shield-check), Procurement Classification (layers), Vendor Documentation (image). Section subtitles are static copy taken from the mock.
- Vendor Type, Execution Type, Supplier Yes/No, and Yes/No groups: rendered as bordered **selectable option cards** (Vendor Type / Execution Type / Supplier with icon + short static caption as in the mock; GST/MSME/Address-verified as compact inline Yes/No). Native `input` elements, names, values, `checked` logic, legends, and `onChange` handlers are unchanged; Execution Type remains checkboxes.
- Classification row laid out in three columns (Vendor Type | Execution Type/Supplier) with vertical dividers on wide screens; stacks on narrow.
- Two-column field grid as today; decorative leading icons (building, user, ₹, mail, phone, map-pin, id-card, file) on inputs via a presentational wrapper; `aria-hidden`, no change to input props.
- Work Profile textarea shows a character counter `n/<existing maxLength>` (derived from the existing value; limit stays 4000).
- Identity & Verification and Procurement Classification sit side by side on wide screens. Existing “Add Main Basket / Add Sub Basket” buttons keep their text and behavior, get a “+” icon and sit beside their selects.
- Physical-verification warning uses the existing `InlineMessage tone="warning"` with amber card styling and warning icon; wording unchanged.
- Geo-tagged picture file input styled as a dashed dropzone (native input retained, so click and drop still work); existing hint, preview, and Remove picture unchanged.
- Allocation baseline (existing vendors only) keeps its content, restyled as a card.

## Non-goals

- No data/field/state/validation/API/permission changes; no backend, OpenAPI, or mobile changes.
- No moving fields between sections (e.g. Current Address stays in Identity & Verification) and no reordering that would change tab order beyond the visual column layout.
- No country-code/flag picker, no new image assets, no new dependencies.
- No redesign of the internal content of the other ~44 panels beyond global chrome + control styling (see open decision 1).
- No changes to `Dialog`/modals or navigation drawers.

## Requirements

1. All `ContextPanel` panels show the new header, body surface, control, and footer styles without per-panel code changes.
2. The vendor panel visually matches the reference within the constraints above at ≥1100px, and degrades to a single column at ≤640px without horizontal scroll.
3. Accessibility preserved: dialog role/labelling, focus trap and return, keyboard operation of every option card (native inputs remain focusable with visible focus), 44px touch targets on mobile, decorative icons hidden from AT, text contrast ≥ 4.5:1.
4. `prefers-reduced-motion` and dark mode continue to work.

## Assumptions

- “Side panels” = web `ContextPanel`/contextual `Drawer` surfaces only.
- Static captions/subtitles from the mock are copy, not “variables”, and are acceptable.
- The header illustration in the mock is represented by a CSS-only decorative treatment, since no asset is provided.

## Risks

- Global CSS affects ~45 panels: dense panels (finance, knowledge editors, quick views) may gain or lose space. Mitigation: scope rules to `.ui-drawer--contextual`, keep existing widths except vendor, spot-check representative panels.
- Designer role theme overrides button styles (`designer-home.css:200-215`); footer styling must not fight it.
- Dirty vendor files belong to in-flight work; edits must be limited to markup wrappers/classNames and must not alter logic. Existing tests (`ProcurementVendorProfile.test.tsx`, `VendorProcurement.test.tsx`, etc.) must pass unchanged; they query by label/role so they should be unaffected.

## Acceptance criteria

1. AC1 — No diff in any `api/`, draft, validation, query, or backend/mobile file; vendor field set, labels, option values, and conditional rules are identical before/after.
2. AC2 — Every `ContextPanel` renders the new header (eyebrow/title/description/close), tinted body, restyled controls, and pinned footer (Cancel outlined, primary dark green).
3. AC3 — Add vendor panel shows the six sections as icon cards, option-card classification, icon-adorned inputs, work-profile counter, side-by-side Identity / Procurement cards, amber warning, and dropzone upload, matching the mock's layout on desktop.
4. AC4 — At 375px and 768px all panels, including vendor, stack to one column with no horizontal scroll.
5. AC5 — Keyboard-only user can operate every option card and field; focus is visible; axe/role-based rendered tests pass.
6. AC6 — `cd frontend && npm run typecheck && npm test && npm run build` pass; existing vendor and ContextPanel tests pass without modification to their assertions.
7. AC7 — Visual QA screenshots of Add vendor (desktop + mobile, light + dark) and at least three other panels (e.g. Invite user, Lead create, Project procurement item editor).

## Open decisions

1. **Depth for other panels.** Default: global chrome + control styling only (A). Alternative: also convert each panel's internal sections to `PanelSection` icon cards like the vendor panel — larger (~45 files) and touches many dirty files. Proceeding with the default unless you say otherwise.
2. **Execution Type control.** Default: keep checkboxes (approved behavior) styled as cards, instead of the mock's radios.

## Data / API / UX impact

- Data/API: none.
- UX: visual only; tab order follows existing DOM order.

## Amendment 1 — close the remaining gaps to the reference

User feedback: “still slider is incomplete as per attached image”.

### Current behavior and evidence

The integrated first pass matches the reference's styling but still differs in layout and a few details, largely because the original non-goals excluded moving fields between cards, showing inapplicable classification groups, and adding an image asset. Mock vs current, element by element:

| # | Area | Reference | Current | Amendment decision |
|---|---|---|---|---|
| 1 | Header art | Interior vignette: sage arch niche, armchair, slatted timber panel, lamp, plants | Abstract CSS arch + slats (user: “still am nt seeing image as per attached image”) | Use the reference's own illustration: crop it from the supplied mock, remove the mock's close icon, lift its light wall to white, fade its left edge, and upscale it 2× for high-DPI screens. Store it as one decorative asset (`frontend/src/assets/panel-header-art.webp`, ~10 KB) used by **all** side panels as a CSS background (not in the accessibility tree), anchored right and scaled to the header height. Wide panels show the full vignette, medium panels a right-anchored crop with a faded left edge, and narrow panels and ≤767px hide it. The heading keeps clear space so the art never sits under text, and the close button sits over plain wall. Replaces the abstract CSS art. Limitation: the source is only 424×97 px, so it looks slightly soft on high-DPI screens; if the original illustration file is supplied, it replaces this asset with no other change. A scratchpad preview at 1040 px / 2× confirmed the fit. |
| 2 | Header copy | “Create a vendor in the shared directory. Fill in the details to get started.” | First sentence only | Add the second sentence (Add vendor only). |
| 3 | Classification | Three columns always visible: Vendor Type │ Execution Type │ Supplier, inapplicable column greyed | Vendor Type plus only the applicable group; blank until a type is chosen | Always render Execution Type and Supplier. The group that does not apply to the selected Vendor Type (both, when none is selected) is disabled and greyed. Values, validation, and payload are unchanged: switching Vendor Type still clears the other group's values exactly as today. |
| 4 | Execution / Supplier cards | Radio, icon, then title over caption | Control + title, icon + caption below | Restyle to the reference arrangement; icons stay `aria-hidden`, accessible names unchanged. |
| 5 | Execution Type control | Radio (single choice) | Checkboxes (approved multi-select amendment) | **Keep checkboxes**: this is approved behavior, not design. |
| 6 | Contact | Email │ Phone; Address │ Current Address | Address full width; Current Address in Identity | Move the existing Current Address field into Contact beside Address. Same field, validation, and “reset verification when address changes” rule. |
| 7 | Identity | AADHAR │ PAN; Current Address Verified Physically; amber warning | Also contains Current Address; muted note when unanswered, warning only on “No” | Current Address leaves this card. Show the amber warning whenever the address is not verified (unanswered or “No”) with the reference copy “More than ₹50K work allocation won't be possible (Cumulative) if the current address is not verified.”; hidden on “Yes”. The ₹50K rule itself is unchanged. |
| 8 | Procurement Classification | Selects with “+ Add new” beside each; Geo Tagged Picture block (icon tile, title, caption, dropzone) inside this card | “Add Main Basket / Add Sub Basket”; separate “Vendor Documentation” card | Visible text becomes “Add new”, with accessible names “Add new Main Basket” / “Add new Sub Basket” (visually hidden suffix, so the visible label stays inside the accessible name). Move the geo-tagged picture into this card as a sub-block with an image icon tile; remove the separate Documentation card. Field label, file rules, preview, and Remove picture unchanged. |
| 9 | Dropzone text | “Click to upload or drag and drop · JPG, PNG (Max 5 MB)” | “Click to upload or drag and drop” | Add “JPEG, PNG or WebP”. **No size claim**: the real limit is the server's `MAX_UPLOAD_MB` setting (default 25 MB), so “Max 5 MB” would be false. |
| 10 | Picture caption | “Upload a recent geo-tagged picture for verification.” | Hint: picture does not verify the address | Keep the existing accurate hint; the mock's “for verification” contradicts the product rule. |
| 11 | Phone | 🇮🇳 ▾ +91 country selector | Phone icon only | **Not added** (open decision 3): a country selector or fixed “+91” changes what users type and what is stored, which is not a design change. |
| 12 | Work Profile counter | 0/500 | 0/4000 | Keep 4000: it is the field's real limit. |
| 13 | Fields not in the mock | — | Status (existing vendors), Directory description | Keep: existing fields stay (“keep fields as it is”). |
| 14 | Sample selections | Execution and Labour pre-selected | Nothing pre-selected | Keep: pre-selecting would change submitted defaults. |

### Scope, invariants, and test impact

- Still presentation-only: no field, draft key, API, validation, payload, permission, or backend change. The field set is identical; only placement, visibility of disabled not-applicable groups, copy, and decoration change.
- Tab order follows the new visual order (Current Address now comes after Address; each “Add new” button follows its select).
- Test impact (replaces AC6's “without modification” for these assertions only): in `frontend/src/features/procurement/ProcurementVendorProfile.test.tsx`, assertions that the inapplicable Execution group is absent become “present and disabled”, and the basket button names become “Add new Main Basket” / “Add new Sub Basket”. Any other test that pins the moved Current Address, the Documentation card, or the old warning copy is updated the same way. All payload, validation, and recovery assertions stay unchanged and must pass.
- The other side panels change only through item 1 (header art).

### Acceptance criteria (amendment)

- A1 — All medium and wide side panels show the new header illustration; narrow panels and ≤767px hide it; it never overlaps title, description, metadata, or the close button (checked at 1440px with a long title).
- A2 — Add vendor at 1440px matches the reference layout: header copy; three-column classification with dividers and greyed inapplicable group; Information grid; Contact with Address │ Current Address; Identity │ Procurement side by side; “+ Add new” buttons; geo-picture block inside Procurement Classification; amber warning shown until “Yes”.
- A3 — Selecting Vendor Type enables exactly the applicable group; switching clears the other group; saved payloads are byte-identical to before for the same inputs (existing payload tests pass).
- A4 — 375px and 768px: single column, no horizontal scroll, disabled groups remain readable.
- A5 — Keyboard: disabled groups are skipped; enabled cards remain operable with visible focus; axe shows no new violations.
- A6 — `cd frontend && npm run typecheck && npm test && npm run build` pass, with test edits limited to the listed assertions.
- A7 — Side-by-side screenshot against the reference, plus a written list of the intentional deviations (items 5 and 9–14).

### Open decisions (amendment)

1. Header art on **all** side panels using the illustration cropped from the reference (default: yes; full on wide, compact on medium, hidden on narrow/mobile).
2. Geo-tagged picture inside Procurement Classification (default: yes, as in the reference).
3. Phone country selector / “+91” (default: not added; say if you want a static “+91” prefix accepted as a data-entry change).
