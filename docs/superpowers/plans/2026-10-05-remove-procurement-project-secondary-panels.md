# Remove Procurement project secondary panels: task plan

Date: 2026-10-05  
Specification: [Remove secondary panels from Procurement project page](../specs/2026-10-05-remove-procurement-project-secondary-panels-design.md), approved by the user.  
Status: Implemented in execution mode A; focused verification passed

## Tasks in order

1. **Preserve the current worktree.** Capture the dirty-path set and the existing diffs of `ProcurementProjectPage.tsx`, `ProcurementWorkspace.test.tsx`, and `procurementBasket.css`. These files already contain uncommitted work. Do not revert or reformat unrelated changes.
2. **Remove the page entry points.** In `frontend/src/features/procurement/ProcurementProjectPage.tsx`, remove the single secondary section containing both headings, its two panel mounts, local open state, and now-unused imports. In `frontend/src/features/procurement/procurementBasket.css`, remove only selectors exclusive to that deleted section; preserve styles shared with current basket enquiry history.
3. **Align page tests.** In `frontend/src/features/procurement/ProcurementWorkspace.test.tsx`, replace assertions and helpers that open these panels with a rendered assertion that both headings/content are absent and the Main Basket workspace remains. Retain access-revocation coverage for the main page. Check standalone `PurchaseOrdersPanel` and vendor progress tests before removing page-specific legacy scenarios; move any unique behavior coverage to its component test if needed.
4. **Verify.** Run the focused Procurement page and basket rendered tests, frontend typecheck and build, `git diff --check`, and final status comparison. Verify the page at a narrow width if a local browser fixture is usable. Report exact results and any unrun check.

## Ownership and parallel work

This is one coupled frontend slice across a page, its tests, and a small CSS cleanup. One implementation owner should edit these files to avoid overlap. Read-only review or verification can follow the edit; no backend, schema, permission, API, dependency, or data migration work is planned.

## Acceptance trace

- Both headings and nested panels absent in the Procurement project page: tasks 2–3.
- Main Basket and project access/error states preserved: tasks 2–4.
- Stored work and reusable components preserved, with focused checks passing: tasks 1–4.
