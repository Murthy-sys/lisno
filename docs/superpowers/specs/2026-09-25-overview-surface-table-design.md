# Configuration Overview surface-table reference

Date: 2026-09-25. UI-only follow-up, continuing the user's approval waiver and Mode A.

Goal: match the supplied narrow UOM / wide Surfaces composition. Current Overview has two cards and a multi-select, but Add Unit occupies a full row and selected surfaces appear in description cards. Quick summary and Revision history retain their established right-sidebar placement.

Scope: Overview presentation only. Keep the existing save command, tabs, image header, validation, query keys, pending-change guard, stable-ID payloads and cache synchronization. Preserve current dirty work from the earlier Overview/header tasks. Do not change APIs, backend, persistence, category schema or other tabs.

Requirements:
1. A roughly 30/70 desktop split, content-height cards with content aligned at the top, stacking on narrow screens. UOM select and icon-only Add Unit share one row. Preserve accessible names, disabled/error/read-only states.
2. Surfaces header has the existing Add Surface action; a small plus shortcut beside the multi-select opens the same existing dialog. No new creation workflow.
3. Selected surfaces render as a semantic numbered table: Surface name, Description, Actions. Surface category does not exist in the contract; omit it rather than invent data. Do not add decorative row-selection checkboxes without a defined action.
4. Remove unselects a known surface from this Main Line's draft only, through existing onChange/dirty/save behavior. Never archive/delete a reusable Surface. Preserve unresolved IDs as visible unavailable rows with removal disabled, matching existing selector behavior. Preserve selected inactive/archived records and order.
5. Edit reuses the existing shared Surface editor with expected-version and cache synchronization intact. Show only when Overview is editable, configuration update is permitted, the catalog is ready, and the Surface is not archived. Accessible name/title makes clear this edits the reusable Surface. No permission expansion or new API.
6. Keep read-only, saving, loading, stale catalog, error/retry and empty states. Default shared Mode panel presentation remains unchanged; opt into the table from Overview only.
7. Use the available Main Line workspace width instead of the 1440px centered cap; retain the shell’s compact responsive edge padding. Keep Quick summary and Revision history in their original right sidebar, as clarified by the user during verification. Preserve the existing responsive rail layout and all content and behavior. Scope every style override to the Overview panels.

Acceptance: correct table rows/actions and selection persistence, honest missing values, same quick-add/inline editor behavior, no unrelated changes, usable table/dropdown at wide/laptop/tablet/phone widths, keyboard/focus/axe checks, focused tests/typecheck/build/diff hygiene pass.

Risks: shared editor edits global reference data independently of Save Overview, so label the shortcut clearly and preserve existing gates. Retained unknown IDs and pending saves must not be discarded. High-specificity legacy styles require rendered checks. No migration, new dependency, live data mutation, deployment or unresolved decision.

Follow-up spacing refinement: compact the Configuration completeness, UOM, Surfaces, Revision history and Quick summary cards; remove forced UOM stretching, reduce nested padding/gaps and table row padding while retaining 44px touch controls. Remove the full-width tab baseline, preserving the selected-tab underline. Keep the right sidebar and all existing data/actions. CSS only.

Typography/control follow-up: reduce Overview card titles to 16px, helper text/labels to 12px and retain 13px control/body text. Use 28px decorative heading icons, tighter title/description/control gaps, and compact 32px desktop plus buttons centered without an empty button-label gap. Keep 44px touch targets on narrow/coarse-pointer screens. Progress uses the third column after label and percentage, about 25% of the desktop status row width; save commands remain trailing. Narrow layouts keep that order and move commands below. This is the stated default interpretation of col-3 while optional clarification remains unanswered. The real percentage and save state/command are unchanged. No behavior/data changes.

Heading-divider follow-up: remove only the bottom borders from the UOM and Surfaces card headings in Overview, as requested. Retain card outlines, table separators, selected-tab indicator, typography, spacing, sidebar and all behavior.
