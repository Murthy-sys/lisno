# Configuration Mode reference UI

Date: 2026-09-25. UI-only implementation under the user's standing approval waiver and Mode A.

Goal: reproduce the supplied Mode tab composition using the existing functional controls and truthful data. Existing source already has PMC/Execution choices, shared paragraph editor, collapsible mode/source headers, scoped calculation editors and inclusion/exclusion checklists; legacy spacing/grid limits create a different composition.

Scope and requirements:
1. Compact section-version toolbar, Mode selector on the left and single-line Shared description preview/edit affordance on the right at wide widths. Preserve full description access, paragraph edit/save/cancel and focus/pending guards. Stack at smaller widths.
2. Match the reference's PMC, Execution and nested Sub-Vendor hierarchy: leading decorative glyph, title/context, trailing tag and collapse/expand control; muted olive for PMC and restrained blue for Execution. Existing mode/source choices are visibility controls, not destructive deselection: keep their behavior and all recovery states.
3. Wide calculation rows group Base Rate, inherited locked UOM, Low Quantity Limit and Impact together; margin group beside them; Test calculations in a trailing action area. Preserve every label/constraint, calculation scope, conversion, formula, validation, pending state, simulator and saving behavior. Use actual existing UOM fallback. In-house must remain usable and retain separate labor/material and total panels.
4. Inclusions and Exclusions appear as adjacent compact boxes under Sub-Vendor, with existing add/edit/remove/selection controls. Preserve their canonical storage on the PMC row and description synchronization. Do not duplicate or relocate persistence.
5. Reference-like timeline styling and compact Quick summary on the existing right sidebar for Mode only. Keep actual revision IDs/order/status/dates/completeness, existing summary loading/error/disclosure and saved-data projection. Do not invent Initial version events, actor names, or a Saved configuration Yes flag. Do not add unsupported edit actions.
6. Keep existing Specifications below Mode configuration; the screenshot is a partial screen and does not authorize removing current functionality. Keep the page header, full-width shell, current progress bar and selected-tab indicator. Overview and other tabs retain their current presentation.
7. Narrow layouts stack by usable container width, with no clipping/overflow, accessible names/focus and touch targets. Handle readonly, empty, loading/error, long text and expanded/collapsed states.

Non-goals: backend/API/schema/financial logic/permission changes, new dependencies, fabricated sample production data, removing existing sections, production mutations, deployment, staging or commits.

Implementation constraints: use existing tokens/icons, scoped new Mode CSS. Add only presentational hooks/wrappers where CSS needs a stable target. A new `data-workspace-section` may scope sidebar styles; do not repurpose `data-reference-section`, which controls Recommendations/Quality. Preserve unrelated dirty work captured at `/tmp/lisno-mode-reference-qa/`.

Acceptance: visual comparison at wide/laptop/phone sizes with actual components and synthetic data; all existing fields/actions retained; mode/source toggle, paragraph editing, scope changes, simulator opening and Mode save work; financial/pending regression tests pass; typecheck/build/diff hygiene; no regression to Overview.

Risks: highly specific shared CSS; hidden mode sections must remain hidden; error focus must still expand its enclosing section; paragraph truncation must not hide access to full text; live financial calculations are out of scope and must be preserved exactly. No unresolved product decision or migration.
