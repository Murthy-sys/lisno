# Remove the duplicate Procurement items card: task plan

Date: 2026-10-04  
Status: approved, including lineage amendment  
Approved specification: [remove-procurement-items-card-design.md](../specs/2026-10-04-remove-procurement-items-card-design.md)

## Implementation contract

- Render one approved-estimate hierarchy in `PurchaseOrdersPanel` and remove the `EstimateProcurementItems` render from `ProcurementProjectPage` only after the new hierarchy supports item management.
- Reuse `ProjectProcurementItemEditor` and the existing item create/get/update/remove APIs. Edit opens only after fetching the full project-scoped child and verifying its approved source; removal requires a reason and current version. No estimate labels act as join keys.
- Derive Add eligibility from an included, positive approved preparation line. Build editor source from `preparation.estimateSource` plus that line's `key`. Reassignment options contain only eligible lines. Fetch unassigned/source-conflict children through the existing paged `getProjectProcurementItems(..., { unassigned: true })` query; do not infer them solely from tree children. Direct reassignment is available only for genuinely unassigned items or items linked to a no-longer-actionable line in the same approved estimate version when the backend permits it. Keep older-version items visible with a blocked explanation and reasoned remove-and-recreate guidance when removal is allowed; do not transfer identity or commercial values automatically.
- Preserve separate permissions: `procurement.items.manage` governs Add/Edit/Remove/Reassign, while `procurement.purchase_orders.manage` governs mode decisions, quote and send. The backend remains authoritative. No backend or Configuration change is planned.
- Item mutations clear the current quote and invalidate affected procurement, preparation, request, commitment, status and dashboard queries. Keep editor drafts mounted across background refresh; pass source-conflict state to disable an unsafe save. A pending request protects referenced children through the existing backend guard without freezing unrelated eligible item work.
- Existing mode-aware purchase-order edits are already present in the dirty worktree. Preserve them and review the relevant diffs before assigning any writer.

## Dependency-ordered tasks

| Task | Dependency | Owner / affected area | Deliverable and acceptance criteria |
| --- | --- | --- | --- |
| T0. Capture baseline and settle callback contract | Approved plan and execution mode | Primary: `git status`, target diffs, current focused tests; shared prop contract | Record pre-existing edits in `ProjectPurchaseOrderRequestPanel.tsx`, `PurchaseOrderEstimateTree.tsx`, and related tests. Define Add/Edit/Remove callbacks using source keys and child IDs/versions; confirm permission and unassigned data flow. Supports AC1–AC6. |
| T1. Put item actions in the estimate tree | T0 | Frontend tree owner: `PurchaseOrderEstimateTree.tsx`, `purchaseOrders.css`, focused tree tests | Eligible empty/occupied lines expose Add; children expose Edit/Remove; reference-only lines do not. Keep compact hierarchy, keyboard/focus states, and mobile layout. Supports AC1–AC3, AC5, AC7. |
| T2. Connect existing editor, removal, and supported reassignment | T0; can run alongside T1 after callback contract | Frontend controller owner: `ProjectPurchaseOrderRequestPanel.tsx`, optional procurement-owned compact recovery component, its focused tests | Fetch full child for edit; reuse `ProjectProcurementItemEditor`; use versioned reasoned remove; show paged unassigned/source-conflict recovery. Enable direct reassignment only for genuinely unassigned or eligible same-version recovery. Explain the older-version block and supported remove-and-recreate path. Preserve drafts on refresh; clear quotes and invalidate queries after mutations. Honor item permission separately from PO permission. Supports AC2–AC6. |
| T3. Remove the duplicate page card | T1 and T2 integrated | Primary or separate page owner: `ProcurementProjectPage.tsx`, `ProcurementWorkspace.test.tsx` | Remove `EstimateProcurementItems` from this page and update page copy. No blank container or duplicate search remains; existing vendor-order/amendment area stays. Supports AC1, AC6. |
| T4. Integrate and verify | T1–T3 finished | Primary; in Mode A, read-only integrity reviewer then verification runner | Reconcile final diff against the spec, run the checks below, inspect rendered desktop/mobile interactions, and report residual full-suite failures separately. Supports AC1–AC7. |

## Safe parallelism and ownership

If execution mode A is selected, T1 and T2 may run in parallel only after T0 freezes their prop contract. T1 owns the tree and its styling; T2 owns the request-panel controller and optional recovery component. They must not edit each other's files or Configuration. T3 follows integration because removing the existing card first would remove the only working item editor entry point. The primary owns shared product decisions, `ProcurementProjectPage.tsx`, integration, and this plan. In mode B the primary performs these tasks sequentially.

## Verification

1. Focused interaction tests: add under two same-named lines in different rooms using distinct source keys; edit and reasoned remove with version conflict; genuinely unassigned and permitted same-version reassignment; older-version visible but blocked with reasoned remove-and-recreate guidance; pending request protection limited to referenced children; zero/excluded no Add; permission-hidden actions; quote invalidation after item changes; editor focus and draft retention. Update page tests to assert the old card is absent and the order tree remains. Do not adopt the existing stale zero-value assertion as expected behavior without checking its current source filter.
2. Run `cd frontend && npm test -- src/features/procurement/PurchaseOrdersPanel.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx` plus any new focused tests; run `npm run typecheck` and `npm run build`. Broaden tests only for a concrete regression risk. There is no repository lint script.
3. Render the Procurement project page with eligible, empty, unassigned, stale-source and pending-request states at desktop and 390/320 px. Check card absence, actions, quote refresh, keyboard focus, accessible names, no horizontal page overflow, and console/network errors.
4. Finish with `git diff --check`, `git status --short`, and a changed-path audit confirming no Configuration or backend source changes. Do not stage, commit, deploy, seed, migrate, or mutate production.

## Risks and rollback

- If item-management integration is incomplete, retain the old card until T1/T2 work and tests pass; the final integrated result removes it. The code change is reversible by restoring the page render while keeping existing data untouched.
- If a child changes between display and Edit/Remove, use the existing fetch/version contract and show a refresh conflict. Never submit a quote derived from stale preparation after a mutation.
- Full frontend suites had unrelated failures before this request; report exact outcomes and do not change Configuration or unrelated product areas to mask them.

## Lineage amendment for approval

The existing backend and replica-set test reject direct reassignment across approved estimate IDs or versions. This plan now limits direct reassignment to the backend-supported cases and keeps older-version items visible for reasoned removal and corrected recreation when permitted. It adds no backend or Configuration work.
