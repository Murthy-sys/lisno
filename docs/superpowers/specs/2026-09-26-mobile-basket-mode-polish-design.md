# Mobile Main Basket and Mode visual refinement

## Goal and evidence
Refine the mobile Configuration basket/detail and Mode experience using the current app, not a new visual theme. The user requested further polish and previously authorized autonomous Mode A implementation without repeated approvals. Initial worktree is clean at `f6e4f8d`.

The running Android emulator shows the actual detail/Mode screen: separate back/title/context/progress rows occupy much of the available content height; Mode repeats boxed sections and adds duplicate calculation headings; disclosure and add actions each introduce prominent outlined squares. The basket catalog also uses 100px cards with 7.5–9.5px content, which is overly small for practical scanning. A read-only Mode audit confirmed deeply nested padding and vertically centered fields.

## Scope and approach
- Preserve the existing olive/ivory palette, Poppins type, basket accordion/carousel pattern and all current controls.
- Make the opened item header more compact and progress a concise horizontal strip with expandable checks. Keep all four tabs readable and available during long content scrolls.
- Keep the basket carousel compact but improve card/title/metadata readability and action targets; no fabricated images or record values.
- Flatten Mode's repeated boxes. Distinguish primary modes from execution sources with typography, neutral surfaces and full-width expandable headings. Improve mode/source selectors and field alignment. Keep description editing, scope rows, calculations and specification/brand controls.
- Quiet icon actions; no additional hero artwork, animation, gradients, shadows or decorative panels.

## Invariants and non-goals
No backend, API, schema, calculation, paise/bps conversion, permission, CAS/version, save, lifecycle, import/export or hidden-setting semantics change. Keep old accessibility labels, read-only controls, validation/recovery, unsaved navigation protection, Quick summary and Revision history. Do not change global navigation or unrelated screens. Do not stage, commit, deploy, mutate production or add dependencies.

## Acceptance and verification
1. Main Basket catalog remains a horizontal carousel; names and metadata are readable; menus and pagination operate at phone widths.
2. Detail header is materially shorter, tabs remain reachable on scroll, and selected tab alone has an underline. All sections and warnings remain accessible.
3. Mode has clear hierarchy, fewer nested borders, aligned paired fields, full-width disclosure targets, and readable scope rows with original accessible names.
4. All values, writes, protected actions and draft flows behave as before. Changes to compact shared controls remain opt-in.
5. Verify focused native component regressions, typecheck, Android export, rendered 320/390/768 layouts, and actual emulator appearance/interactions where available. No live data saves are needed for visual QA.

## Risk and rollback
Main risks are sticky-header indexing, nested field width at 320px, loss of disclosure accessibility, and re-mounting numeric inputs. Keep calculations/state functions unchanged and use stable components. Rollback is scoped source reversal; no migration or data repair is needed.

## Follow-up: Inclusions and Exclusions rows
The user requested further polish of the scope lists. Replace centered button-like options and detached remove icons with left-aligned checklist rows: checkbox/name and remove remain sibling targets inside a single border, selected rows use the existing olive tint, counts sit beside the heading, and Add has a short visible label. Preserve all labels, limits, read-only behavior, underlying raw-row indices and mutation functions. Scope the row variant to these lists; verify long names and add/select/remove at narrow phone widths.
