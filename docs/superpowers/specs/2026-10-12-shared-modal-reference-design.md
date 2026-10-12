# Shared modal presentation: supplied LISNO reference

Date: 2026-10-12
Status: Approved and implemented in Mode A on 2026-10-12. Verification evidence and baseline limitations are recorded in the task plan.

## Goal and authority

Apply the supplied four-modal reference to centered popups across Lisno. This is a presentation-only change. The user's clarification is binding: **“dont add any new field..just match attached UX thatsall.”**

Match the compact LISNO toolbar, clear content hierarchy, restrained borders, readable form density and separated action footer. Existing application content, fields, actions and behavior remain authoritative. The screenshot supplies visual direction, not a replacement form schema.

## Current behavior and evidence

- `frontend/src/components/ui/Dialog.tsx` supplies the shared centered overlay, title/description associations, close control and overlay lifecycle. There are currently 55 production JSX call sites in 45 files. It renders a large eyebrow/title header; each consumer owns its form, body and actions.
- `frontend/src/styles/index.css` defines the shared `.modal`, `.modal__header`, `.modal-form` and `.modal-form__actions` rules. The present shell has a pronounced shadow and larger header treatment than the reference.
- Configuration, Procurement award, recommendations, messages and designer/access styles override parts of that shell. Some consumers hide its header and render their own close/header, so a shared CSS change alone would miss these cases.
- The drawing preview and file viewers need large media areas and existing navigation. Their usable dimensions must survive the new chrome.
- `ClientSiteCompletionReview.tsx` and `ClientVendorWorkReview.tsx` contain bespoke centered image lightboxes. `ImageAnnotationEditor.tsx` has a native note dialog inside its drawing editor. These require presentation reconciliation with their current interaction model.
- Filenames do not define presentation: Add estimation item, Add temporary item and Edit main basket currently use `ContextPanel` side drawers. There are 64 ContextPanel call sites in 55 files. The supplied screenshot does not authorize turning those flows into centered popups.
- Delete basket in `KnowledgeBaseIndexPage.tsx` currently requires a typed basket name and an audit Reason, with an impact check. These existing safeguards stay; the screenshot's acknowledgement checkbox must not be introduced or substituted.
- Current temporary-item explanatory text differs from the screenshot. Preserve current product copy and persistence behavior.
- The working tree already contains substantial unrelated backend, Configuration and Procurement work. Existing changes must be captured and preserved before any implementation writer starts.

## Scope

1. Shared centered `Dialog` presentation and its existing form, information, confirmation and destructive consumers throughout the tool, including centered popups opened from drawers.
2. Feature CSS/markup adjustments needed to make those consumers use consistent chrome, content padding and footer treatment without duplicate headers or close controls.
3. Bespoke centered image lightboxes and the drawing note popup: adopt compatible visual treatment while retaining media/editor sizing, placement, controls and overlay behavior.
4. Existing nested dialogs, responsive states and role-specific modal appearance.

Side drawers retain their presentation and interaction model. Nonmodal Ask Lisno, calendar and basket-choice popovers are outside this centered-popup change. Existing pages, navigation, Procurement basket workspaces, APIs, permissions and databases remain outside scope.

## Visual requirements

### Shell and toolbar

- Use the existing LISNO mark and name, a fine divider, the popup's existing title/context and its existing close action in a compact top toolbar.
- Reuse the project's font and semantic color tokens. Use warm off-white surfaces, muted separators, dark readable text, olive primary actions and established danger/warning colors where already semantically applicable.
- Keep the shell border and corners restrained; no new decorative shadows, gradients, motion, fonts or icon-library dependency.
- Standard forms should remain approximately 32–35rem wide, adapted to actual content. Small confirmations may be narrower. Existing complex forms and media dialogs retain sufficient width rather than being forced into a small reference frame.
- Preserve title/context copy and one accessible dialog name. Decorative branding and repeated visual title text must not create duplicate screen-reader announcements.

### Content and fields

- Present the existing title and description with the reference's compact hierarchy. Reuse suitable existing icons where present; decorative presentation must not add product controls or instructions.
- Target approximately 18–20px content headings, 13–14px desktop body/control text and 12–13px labels/metadata, using current fonts. Preserve readable line height and at least 16px text for editable controls where mobile zoom behavior requires it.
- Use approximately 16–20px content padding and 12–16px form gaps. Avoid oversized headings, empty padding and unnecessary nested cards.
- Keep every existing field, label, placeholder, helper text, validation message, required marker, option, value and condition. Do not add screenshot fields, categories, counters, checkboxes, warning text or default values.
- Preserve existing form grouping and order. Two-column layouts may use the reference's compact alignment where already appropriate; stack without overflow on narrow screens.
- Restyle existing warning, information and danger content with the corresponding reference treatment while retaining its text, severity and live-region semantics.

### Footer and actions

- Align existing actions in a separated, lightly tinted footer with a fine top border, compact consistent button sizing and approximately 8–12px gaps.
- Preserve current action labels, count, order, disabled/busy rules and handlers. Keep submit controls associated with the correct form, including nested overlays.
- Use the established primary style for normal submit/save actions and danger style for actions already defined as destructive. Do not infer behavior or introduce confirmation steps from a title string.
- Preserve dialogs that intentionally lack a close action. Never introduce a dismiss path for mandatory prompts or busy operations.

### Responsive and accessible behavior

- At 390px, 768px, 1440px and 1920px viewport widths, keep the popup inside the viewport with usable body scrolling and reachable actions. Check long titles, long validation messages and short viewport heights.
- Preserve focus trapping/restoration, initial-focus targets, Escape/backdrop handling, nested-overlay inert state, busy restrictions, role, labelled/described associations and keyboard order.
- Keep visible keyboard focus, accessible control names and reduced-motion handling. Preserve current media navigation and annotation editing behavior.

## Implementation direction and boundaries

Extend the existing `Dialog` shell and reusable style tokens, then reconcile its known consumer overrides. Add only the presentation hooks needed for explicit modal variants/body/footer treatment. Keep forms and handlers in their existing owners. Avoid broad selectors that also affect `Drawer` or `ContextPanel`.

Known reconciliation areas include `knowledge-configuration-ui.css`, `ai-estimator-knowledge.css`, `role-themes.css`, `procurementBasket.css`, `estimator-dashboard.css`, `projectChat.css`, `designer-home.css`, proposal metadata styles and large drawing-preview styles. Locate each current path before assigning ownership.

No API, state transition, permission, query-invalidation, financial, schema or persistence changes are required. No dependencies or lockfile changes are required. Loading/error/empty and failure behavior remain the existing behavior; only presentation changes. No migration, database sync, deployment or external notification is part of this work. Rollback is limited to this task's frontend presentation diff and must preserve prior uncommitted work.

## Acceptance criteria

1. Centered modal chrome, typography, spacing, controls and action footer visibly follow the supplied reference across shared consumers and identified bespoke centered popups.
2. Existing field/control inventory, labels, validations, payloads, submit behavior and permissions remain unchanged. No new product field, acknowledgement checkbox, counter, category or temporary-item rule is added.
3. Existing deletion name/Reason safeguards, impact checks, conflict/retry states and mandatory/busy dismissal restrictions remain intact.
4. There is one intended visible close control when permitted, no duplicated feature header, and one accessible dialog name. Keyboard and nested-dialog behavior remain correct.
5. Forms, confirmations, informational states, large forms and media previews render without unintended overflow or obscured actions at the listed widths. Content remains usable at increased text size and short heights.
6. Side drawers, nonmodal popovers and underlying Configuration/Procurement screens retain their existing layout and behavior.
7. Focused shared-overlay and affected-consumer tests, frontend typecheck, frontend build and `git diff --check` pass, with any baseline failure explicitly separated from this change. Rendered desktop/mobile interaction checks substantiate visual and accessibility claims.

## Verification evidence required

Capture before/after representative form, destructive, information, restricted-dismissal, nested-drawer confirmation and large media states with identical content. Include Proposal metadata, basket deletion, version conflict/unsaved changes, Procurement award, recommendations, chat issue, drawing preview and bespoke image viewers. Compare the rendered field/action inventory before and after; exercise ordinary submit, cancellation, invalid input, loading/error and keyboard return-focus paths using isolated fixtures or existing safe test data.

Review the final integrated diff for unintended logic/field changes and CSS leakage. Record exact checks, screenshots/artifact locations and any unverified limitations in the later task plan/handoff. No lint script exists, so do not claim lint verification.

## Risks and open decisions

The principal risks are role/feature CSS overriding the shared shell, accidental drawer styling, detached submit buttons, duplicate headers and insufficient media space. Explicit consumer reconciliation and representative rendered checks address these risks.

No unresolved product decision is required for this styling-only scope. Assumption: “modal popup” means the existing centered popups; existing side drawers keep their interaction model. Screenshot-specific sample fields and copy are visual examples only.
