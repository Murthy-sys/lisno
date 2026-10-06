# Remove secondary panels from Procurement project page

Date: 2026-10-05  
Status: Implemented and focused verification passed

## Goal and current behavior

The Procurement project page currently shows two collapsed sections below the Main Basket workspace: “History and open purchase requests” and “Existing vendor work progress.” The user asked to remove both from this screen. They are rendered in `ProcurementProjectPage.tsx`; the first mounts `PurchaseOrdersPanel`, and the second mounts `VendorWorkProgressPanel` when opened. Current page tests open the first section for legacy purchase-item flows.

## Scope

- Remove both collapsed sections and their local open state from the Procurement project page.
- Keep the Main Basket workflow, project header, messages, loading/error/access states, and existing project data unchanged.
- Preserve backend purchase requests, orders, vendor work records, permissions, and reusable panel components used elsewhere. Do not delete historical data or API routes.
- Update page-level tests so they verify the two sections are absent while the Main Basket workspace remains available. Keep standalone tests for the underlying components.

## Assumptions, constraints, and risk

“Remove this too” refers to removing these two visible entry points from this page, including their expandable content. It does not authorize deleting stored purchase requests or vendor work progress. The legacy purchase-request workflow will no longer be reachable through these sections on this page; the current Main Basket workflow remains the project Procurement path. This is a frontend-only change in an already dirty worktree, so existing unrelated edits must be preserved.

## Acceptance criteria

1. Neither heading nor expandable panel appears on Procurement → Projects → project at any viewport width or permission state.
2. The Main Basket workspace and its project access/error behavior continue to work.
3. No backend data, API, permission, or reusable component is removed; focused rendered tests, frontend typecheck/build, and `git diff --check` pass.

## Open decisions

None. The two labels in the screenshot match the two sections in the project page exactly.
