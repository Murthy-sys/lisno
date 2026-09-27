# Procurement dashboard and shared Vendors implementation plan

Date: 2026-09-27  
Status: Proposed for approval  
Approved specification: [Procurement dashboard and shared vendor screen](../specs/2026-09-27-procurement-role-side-navigation-design.md)

## Outcome and boundaries

Deliver the reference-style expandable **Procurement** navigation for Super Admin and Procurement users, with **Dashboard** then **Vendors**. Keep the pictured Procurement-role project workspace at `/procurement`; give Super Admin a separate procurement metrics Dashboard at `/admin/procurement`; render the same current vendor directory at `/procurement/vendors` and `/admin/procurement/vendors`. Procurement receives every current Super Admin vendor-screen action through narrow backend permissions. Admin/Sales Manager project suggestions, project procurement, name-only vendor quick-add, and all unrelated Configuration permissions retain their existing behavior.

The specification's AC1, AC1a, AC1b, and AC2–AC6 are the acceptance criteria for this plan. No migration, new vendor collection, dependency, mobile-native screen change, deployment, commit, seed, backfill, or production mutation is included. The only worktree change observed while planning is the approved specification file, which is currently untracked. Capture a fresh dirty-path set and per-target diffs before implementation writers start; do not assume the tree will still be in this state.

## Settled routes and permissions

| Web actor | Sidebar | Route | Screen and guard |
| --- | --- | --- | --- |
| Procurement | Procurement > Dashboard | `/procurement` | Existing `ProcurementWorkspace`; `procurement.workspace.read`. Active for nested `/procurement/projects/:projectId`. |
| Procurement | Procurement > Vendors | `/procurement/vendors` | Shared `ProcurementVendorDirectory`; vendor-directory read. |
| Super Admin | Procurement > Dashboard | `/admin/procurement` | Procurement-specific overview from existing vendor counts; distinct from `/admin/dashboard`. |
| Super Admin | Procurement > Vendors | `/admin/procurement/vendors` | Same `ProcurementVendorDirectory`; vendor-directory read. |
| Admin/Sales Manager | Existing flat Procurement link | `/admin/procurement` | Existing project vendor suggestions; existing `procurement.vendor_suggestions.read` outer route behavior. |

`/admin/procurement` already serves both Admin and Super Admin, so dispatch its content by authenticated role while preserving Admin's existing route admission. The Super Admin branch checks vendor-directory read before requesting metrics. The Vendor page retains its existing overview and full management UI. `GET/POST /api/v1/procurement/vendors` remain the existing minimal picker/quick-add API and do not conflict with the new web route `/procurement/vendors`.

Add these exact permission codes to the canonical backend contract, mirror them in the frontend contract, and grant them to the Procurement role; Super Admin retains its existing all-permissions behavior:

- `procurement.vendor_directory.read`
- `procurement.vendor_directory.create`
- `procurement.vendor_directory.update`
- `procurement.vendor_directory.lifecycle`
- `procurement.vendor_classification.create`
- `procurement.vendor_allocation_baseline.correct`

Map only these existing backend operations to the new codes:

| Permission | Existing operation family |
| --- | --- |
| Directory read | Vendor list/detail, upload policy, photo/certificate content, allocation-baseline list, Main Basket list, Sub Basket list. |
| Directory create | Full vendor POST and new-vendor MSME certificate staging. |
| Directory update | Vendor PATCH, existing-vendor MSME staging, photo PUT/DELETE. |
| Directory lifecycle | Vendor archive DELETE. |
| Classification create | Main Basket POST and Sub Basket POST only. |
| Baseline correct | Historical allocation-baseline POST only. |

Leave item, tax, quality-control, basket edit/delete/quality, and all other knowledge operations bound to their current Configuration permissions and sole-Super-Admin service guard. Give the listed operations a vendor-scoped active-actor guard that checks the stored role and active state, retains the sole active Super Admin invariant when that role acts, and coordinates mutations within the current transactions. Conditional authorization in generic master methods must check `masterType === "vendors"`; generic access to other master types must remain denied. Photo, MSME, basket and baseline services use the same narrow policy. Existing validation, version/CAS, audit, private storage, idempotency, and integer-paise allocation rules remain unchanged.

## Dependency order and ownership

Only one parent task advances at a time. In Mode A, tasks T2a–T2c can run concurrently after T1 because their **write paths do not overlap**. The primary agent settles cross-layer contracts and integrates. In Mode B, the primary implements the same tasks sequentially. Before any Mode A assignment, tell each writer that other people share the worktree, that they must not revert another writer's changes, and that an unexpected cross-boundary edit returns to the primary for ownership.

| Task | Deliverable and acceptance | Depends on | Mode A owner / write boundary |
| --- | --- | --- | --- |
| T0 | Reconfirm the approved spec and current routes/permissions; capture `git status --short` and relevant per-target diffs, including any dirty or untracked targets. Record baseline focused results. AC3, AC4, AC6. | Plan approval and mode selection | Primary, read-only baseline. |
| T1 | Freeze the six permission codes, operation-to-permission table above, frontend role/route map, and shared UI capability names; update the frontend authorization-contract mirror before frontend writers use the new codes. Share the contract with writers. AC1–AC3. | T0 | Primary owns `frontend/src/api/authorization-contract.ts` and contract coordination. |
| T2a | Implement narrow backend authorization for all current Vendors actions and update canonical API inventory/tests. AC2, AC3, AC5. | T1 | Backend owner: `backend/src/domain/{authorization,route-operations}.ts`, relevant `backend/src/services/ai-estimator-knowledge-*` and `procurement-vendor-*` services, `backend/src/routes/ai-estimator-knowledge-admin.ts` only if needed, `backend/src/openapi*`, and focused backend tests/fixtures. No frontend writes. |
| T2b | Implement registry-derived nested Procurement navigation, route dispatch, new Super Admin procurement metrics Dashboard, safe return paths, and reference-matched responsive styling. AC1, AC1a, AC1b, AC4. | T1 | Frontend navigation owner: `frontend/src/app/{routeRegistry,router,routePaths}*`, `frontend/src/components/layout/{navigation,Sidebar,SidebarIcon,AppShell}*`, navigation CSS under `frontend/src/components/layout/` or `frontend/src/styles/`, new `ProcurementDashboardPage.tsx` and its test. No vendor directory/editor or frontend auth-contract writes. |
| T2c | Make the shared Vendors directory/editor use new capabilities for list/create/edit/archive, inline basket creation, photo/MSME and baseline correction; keep private query data scoped and mutation invalidation complete. AC1b, AC2, AC3, AC5. | T1 | Frontend vendor owner: `frontend/src/features/procurement/{ProcurementVendorDirectory,ProcurementVendorEditor,VendorBasketFields,VendorAllocationBaseline,VendorDirectoryOverview,ProcurementManagementPage}*` only as needed, plus focused vendor tests and vendor API hooks. No app router/nav/CSS or backend writes. |
| T3 | Reconcile backend/frontend permission parity and contract tests, integrate writers, inspect final diff and repair contract mismatches. AC1–AC6. | All T2 writers finished | Primary owns shared-contract reconciliation. Return focused fixes to the owning slice; no overlapping concurrent edits. |
| T4 | Read-only security/integrity review of the integrated work, then resolve findings. AC2, AC3, AC5. | T3 | Mode A `integrity_reviewer`, then primary/owning writer for bounded fixes; Mode B primary inline. |
| T5 | Run final risk-based checks on the integrated tree and rendered UI, fix confirmed failures, inspect hygiene and report exact evidence. AC1–AC6. | T4 findings resolved | Mode A `verification_runner` after writers and review; primary owns browser inspection and reconciliation. Mode B primary inline. |

`backend/src/domain/authorization.ts`, `backend/src/domain/route-operations.ts`, frontend auth contract, frontend route registry, and OpenAPI are shared-contract files. The backend owner edits the two backend registries and OpenAPI; the primary edits the frontend auth mirror in T1, before concurrent T2 work, and announces the exact codes. The native mobile app validates the same policy version and mirrors protected operations, so the primary also synchronizes only `mobile/src/contracts/{authorization,operations}.ts` and `mobile/scripts/contract-drift.test.ts`; mobile screens and navigation remain outside scope. No other worker edits those files.

## Implementation details by slice

### Backend T2a

1. Add the six permission codes, role grants, and route-operation mappings exactly as above. Preserve Admin's minimal picker and suggestion permissions, Super Admin operation behavior, and the established `ai_estimator_knowledge` route scope/availability. Update route-operation fixtures, authorization policy tests, frontend-contract parity checks, and OpenAPI permission documentation.
2. Implement a vendor-scoped actor guard alongside the unchanged generic sole-Super-Admin guard. Recheck the stored active role on reads and in mutation transactions; use the existing authorization coordination write for mutations. Do not accept a role from a request body or skip the sole Super Admin count check when Super Admin acts.
3. Apply the scoped guard only to vendor master list/detail/create/update/archive, basket/sub-basket list/create, private vendor photo/certificate services, and historical allocation list/correction. Retain all existing transaction, file cleanup, version, idempotency, bank-data projection, and audit behavior. Generic knowledge operations stay sole-Super-Admin.
4. Add asymmetric HTTP and service tests: Procurement allowed on every listed operation; Admin/other/anonymous denied full detail and mutations; Procurement denied direct item/tax/quality-control and basket edit/delete calls; inactive/stale Procurement denied. Run Mongo replica-set coverage for representative full vendor save, basket creation, archive, upload and baseline mutation paths. Test private list versus detail/bytes and no secret audit leakage.

### Frontend navigation T2b

1. Extend the navigation registry/output with a permission-filtered Procurement group for Super Admin and Procurement, preserving flat items for all other roles. Ensure no duplicate Procurement link, active Dashboard on nested project URLs, parent expansion/toggle, `aria-expanded`/`aria-controls`, keyboard focus, and drawer close on child navigation.
2. Match the supplied image using existing visual tokens: light rail, dark olive expanded parent with cart/chevron, indented Dashboard/Vendors children, pale active row with narrow green marker, muted inactive child, clear focus. Maintain legibility at desktop and narrow widths, with no decorative motion or new icon dependency.
3. Keep `/procurement` rendering the existing project cards and budget/spend data. Add Super Admin's procurement Dashboard using the existing vendor-overview API data: total vendors, active vendors, under-review vendors, and honest loading/error/empty states. Leave the global Super Admin Dashboard alone. Route `/admin/procurement/vendors` and `/procurement/vendors` to the shared directory and adjust safe return paths. Preserve Admin/Sales Manager suggestions on `/admin/procurement`.
4. Update navigation, router, route-path and drawer tests for exact role/permission combinations, direct URLs, active states, and unchanged Admin behavior. Use one shared Vendors component, never a copied page.

### Frontend Vendors T2c

1. Gate directory reads and each action on its own new capability instead of the broad Configuration permissions. In particular, `canCreateBasket` uses classification-create, and baseline correction uses baseline-correct rather than vendor update. Keep buttons hidden/disabled on reduced permission snapshots and show a real denied state on 401/403.
2. Preserve the current directory, overview, filters, multi-select basket editor, full profile fields, private document/photo handling, archive, baseline correction and recovery states. Invalidate vendor directory/overview/detail and affected project selector queries after successful writes; never put private detail into list caches.
3. Cover Procurement create/edit/archive/basket/document/baseline flows, Super Admin parity, reduced-permission UI, permission loss, stale version, and cross-role refresh. Keep existing vendor tests focused on the shared component when the route landing changes.

## Verification gate

Run focused tests before broad contract checks. The final checks run only after all source writers and integrity fixes are complete; results from a concurrently edited worktree are provisional.

| Area | Planned exact check or interaction | Acceptance evidence |
| --- | --- | --- |
| Backend authorization and contracts | In `backend/`: `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/ai-estimator-knowledge-routes.test.ts tests/api-docs.test.ts tests/procurement-vendor-photo.test.ts tests/procurement-vendor-certificate.test.ts tests/procurement-vendor-allocation.test.ts` | AC2/AC3: every narrow route permission and denial, preserved Admin/Super Admin behavior, protected file routes and API inventory. |
| Backend transactional paths | In `backend/`: focused `*.replica-set.test.ts` suites for vendor profile, certificate, photo, allocation, and changed basket/reference paths. | AC2/AC5: stored actor recheck, CAS, audit, idempotency, cleanup and no cross-role duplicate records. Use a disposable local replica set only. |
| Frontend navigation and page flows | In `frontend/`: `npm test -- src/components/layout/navigation.test.tsx src/components/layout/AppShell.test.tsx src/app/router.test.tsx src/app/routePaths.test.ts src/features/procurement/VendorDirectory.test.tsx src/features/procurement/ProcurementVendorProfile.test.tsx` plus any new focused Dashboard test. | AC1/AC1a/AC1b/AC2/AC4: reference hierarchy, role filtering, project Dashboard continuity, shared Vendors interactions, direct routes and permission loss. |
| Contracts and bundles | In both `backend/` and `frontend/`: `npm run typecheck` and `npm run build`; in `mobile/`: contract-drift test and typecheck for policy compatibility. Broaden tests only for a concrete shared-contract regression. | AC3/AC6: no contract/type/build error. There is no repo lint script. |
| Rendered UI | Run a local test-backed app at desktop and narrow widths, inspect Super Admin and Procurement Dashboard/Vendors, keyboard expand/collapse, child active indicator, Add vendor, drawer closing, focus, console/network errors and overflow. | AC1/AC1a/AC1b/AC2: visual and interaction match to the supplied reference; same Vendors screen in both roles. Use synthetic data and keep real customer data out of screenshots. |
| Hygiene | `git diff --check`, `git status --short`, compare against T0 dirty baseline, inspect all changed files. | Only approved scope changed; no artifacts staged, committed, or deployed. |

If sandbox restrictions block local Mongo binding, rerun the required replica-set command with the standard escalation mechanism and report the exact result. Do not relax transactional semantics or claim a pass for an unrun check. Stop optional testing after the acceptance risks are covered.

## Completion and handoff

After T5, report the implemented routes and permission boundary, the reference-matched navigation, unchanged Admin/project behavior, files changed, exact checks and outcomes, any unrun checks, and any remaining risk. Do not infer authorization to commit, deploy, seed, migrate, or contact users from this plan.

The next gate after approval of this plan is the required execution-mode choice. No implementation begins until the user selects A or B.
