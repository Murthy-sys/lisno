# Side panel visual redesign — task plan

Date: 2026-09-24
Spec (approved): [2026-09-24-side-panel-visual-redesign-design.md](../specs/2026-09-24-side-panel-visual-redesign-design.md)
Status: Draft — awaiting task-plan approval.
Open-decision defaults carried from the spec: (1) other panels get global chrome + control styling only; (2) Execution Type stays checkboxes, styled as cards.

## Baseline and ownership rules

- Capture before writing: `git status --short` and `git diff frontend/src/features/procurement/vendorProcurement.css` (current diff = the in-flight `.vendor-profile*` block, lines 67-87, owned by the vendor-details effort; it is the only block this plan edits in that file).
- Untracked in-flight vendor files (`ProcurementVendorEditor.tsx`, `VendorProfileFields.tsx`, `VendorBasketFields.tsx`, `VendorAllocationBaseline.tsx`): edits are limited to JSX wrappers, classNames, decorative icons, and static copy. Hooks, state, handlers, props, input attributes (`name`, `value`, `checked`, `required`, `maxLength`, `onChange`) and conditional logic must be byte-identical.
- Forbidden paths: `frontend/src/api/**`, `vendorProfileDraft.ts`, `vendorProfileApi.ts`, `knowledge*.ts`, all backend/mobile, all tests' assertions, `Dialog`/modal styles, `variant="navigation"` drawer styles.

## Tasks (dependency-ordered)

### T1 — Global contextual panel styling (all side panels)
- Files: `frontend/src/styles/shell.css` (contextual drawer rules only, ~lines 389-470 + mobile block), possibly new tokens appended to `frontend/src/styles/global.css` (`--panel-*` only).
- Work: header (uppercase brand-green eyebrow, larger bold title, muted description, CSS-only decorative `::after` art, `aria-hidden` by nature), tinted body surface, footer (white, pinned, Cancel outlined / primary dark green via `.ui-drawer__footer .ui-button--*` scoped selectors), form controls scoped to `.ui-drawer--contextual` (labels, asterisk, rounded inputs, placeholder, focus ring, hint/error). Dark-mode token redefinitions. Check `designer-home.css:200-215` role overrides don't break footer buttons.
- Must not change: navigation drawer rules, widths for non-vendor panels, `Drawer.tsx`/`ContextPanel.tsx` markup.
- AC: spec AC2, AC4 (non-vendor), part of AC5.
- Verify: `npm test -- src/components/ui/Drawer.test.tsx src/components/ui/ContextPanel.test.tsx src/styles/tokens.test.ts`.

### T2 — `PanelSection` presentational primitive
- Files (new): `frontend/src/components/ui/PanelSection.tsx`, `PanelSection.test.tsx`; styles appended to `shell.css` under `.ui-panel-section`.
- API: `{ icon: ReactNode; title: string; description?: string; className?: string; children }` → `<section aria-labelledby>` with icon tile (`aria-hidden`), `h3`, description, body. No data props.
- AC: spec A “optional section card primitive”; AC5 (heading/landmark labelling).
- Verify: new unit test for accessible name + description; `npm test -- src/components/ui/PanelSection.test.tsx`.
- Depends on: none (can run parallel with T1; shares `shell.css` → if parallel, T2 writes its styles to a separate new file `frontend/src/styles/panel-section.css` imported where `shell.css` is imported, to avoid overlap).

### T3 — Vendor panel markup restyle
- Files: `ProcurementVendorEditor.tsx`, `VendorProfileFields.tsx`, `VendorBasketFields.tsx`, `VendorAllocationBaseline.tsx` (wrapper/className only).
- Work:
  - Replace section `<section><h3>` wrappers with `PanelSection` (same titles; icons Users, FileText, Phone, ShieldCheck, Layers, ImageIcon; subtitles from mock).
  - Classification row: three-column layout wrapper; `VendorRadioGroup` gains an optional presentational `variant="cards"` + per-option icon/caption (static copy) — native radios/checkboxes unchanged inside `<label>` cards. Execution Type checkboxes wrapped the same way.
  - Leading-icon wrapper (`vendor-profile__adorned`, icon `aria-hidden`) around existing Input/Textarea children inside `Field` render props.
  - Work Profile counter: `<span aria-hidden>` `{draft.workProfile.length}/4000` under the textarea (reads existing value; no state).
  - Identity & Procurement Classification side-by-side wrapper (`vendor-profile__pair`); DOM order unchanged.
  - Basket “Add Main Basket / Add Sub Basket” buttons: add `Plus` icon, keep text, position beside selects via CSS.
  - Documentation: file input wrapped in dropzone class with Upload icon; hint/preview/remove unchanged.
- AC: spec AC1, AC3, AC5.
- Depends on: T2.

### T4 — Vendor panel CSS
- Files: `frontend/src/features/procurement/vendorProcurement.css` (`.vendor-profile*` block only).
- Work: vendor panel width `min(1040px, 100%)` on desktop; option-card styles (border, selected state via `:has(:checked)`, focus-visible via `:has(:focus-visible)`, disabled); column dividers; adorned inputs padding; counter; amber warning card; dashed dropzone; baseline card; responsive collapse ≤900px (pair stacks) and ≤640px (single column, 44px targets, 16px inputs).
- AC: spec AC3, AC4.
- Depends on: T3 class names (can be authored in parallel against the agreed class list in T3).

### T5 — Integrity review (primary agent)
- Diff review: confirm only allowed files changed; confirm vendor logic/attributes identical (`git diff` + untracked file comparison against a pre-edit copy saved in the scratchpad); no new data props; icons `aria-hidden`.
- AC: AC1.
- Depends on: T1–T4.

### T6 — Verification
- Focused: `cd frontend && npm test -- src/components/ui src/features/procurement`.
- Full: `cd frontend && npm run typecheck && npm test && npm run build`.
- Rendered QA: run the app, screenshot Add vendor (1280px, 768px, 375px; light + dark) and three other panels (Invite user, Lead create, Project procurement item editor); keyboard-walk the vendor option cards. Screenshots kept in the scratchpad only, not committed.
- Hygiene: `git diff --check`, `git status --short` compared to baseline.
- AC: AC2, AC4, AC5, AC6, AC7.
- Depends on: T5.

## Parallelism

- Safe in parallel: T1 (shell.css) ‖ T2 (new files incl. `panel-section.css`) ‖ T4 (vendorProcurement.css, against the fixed T3 class list).
- Sequential: T3 after T2; T5 after all writers; T6 last on the integrated result.

## Not performed

No commits, pushes, deploys, dependency changes, backend/mobile edits, or data operations.
