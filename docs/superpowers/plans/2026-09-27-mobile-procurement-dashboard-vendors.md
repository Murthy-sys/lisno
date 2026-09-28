# Mobile Procurement Dashboard and Vendors task plan

Date: 2026-09-27  
Status: Proposed for approval  
Source: [approved design](../specs/2026-09-27-mobile-procurement-dashboard-vendors-design.md)

## Baseline and boundaries

- The native app currently has one flat Procurement destination, a generic project list, and vendor management inside Super Admin Configuration. The backend already grants the six vendor capabilities to Procurement; mobile contract mirrors exist. No backend, web, shared API shape, or persistence change is planned.
- At plan creation, the only unrelated dirty path is `mobile/.expo/dev/logs/start.log`; preserve it and do not stage or reset it. Four relevant mobile baseline suites pass, 75/75 tests.
- The primary agent owns product interpretation, the mobile route/context interface, integration, worktree hygiene, and final handoff. Writers must capture their target diffs before editing, own only their paths, accommodate concurrent changes, and never revert another writer's work.

## Task order and ownership

| Order | Owner and files | Work and acceptance link | Verification |
| --- | --- | --- | --- |
| 1 | Primary agent: freeze route/context interface | Confirm `procurement-vendors` is a Procurement-only authorized feature; `/feature/procurement` remains Dashboard and the root tab. Set the vendor screen export to `ProcurementVendorsWorkspace` from `mobile/src/features/procurement/ProcurementVendorsWorkspace.tsx`. Set the vendor context to explicit `canRead`, `canCreate`, `canUpdate`, `canLifecycle`, `canCreateClassification`, `canCorrectBaseline`. Agree query key scope/invalidation with both writers before edits. | Compare registry policy to canonical mobile operations; no code changes needed for this step. |
| 2A | Navigation/Dashboard writer: `mobile/src/navigation/{registry,AdaptiveAppScaffold,NavigationIcon,backNavigationPolicy}*`, `mobile/src/app/feature/[featureId].tsx`, `mobile/src/features/workspace/{FeatureWorkspace,featureDefinitions}*`, new Dashboard/subnav files under `mobile/src/features/procurement/` excluding `ProcurementVendorsWorkspace.tsx`, and their focused tests | Add authorized Vendors destination and adaptive expandable Procurement parent/children. Compact phone uses the in-content selector; wider rail shows indented children. Keep direct route/back/root selection and other roles stable (M1, M4). Replace the generic Procurement project list with a typed Dashboard using existing `/procurement/projects` data, safe paise totals, project links, and loading/empty/error states (M2). | Registry/back-policy and rendered phone/tablet navigation tests; Dashboard two unequal-project amount/identity tests; mobile typecheck. |
| 2B | Vendor writer: new `mobile/src/features/procurement/ProcurementVendorsWorkspace.tsx` and its tests; `mobile/src/features/knowledge/{KnowledgeVendorEditor,KnowledgeVendorBaseline,KnowledgeVendorBasketControls,KnowledgeReusableValues,knowledgeRuntime}*` only as required; a new vendor-scoped context module and its tests | Build vendor overview/list/search/filter/page/actions from existing endpoint and reuse the native editor (M3). Route each control to the six vendor permissions, including independent classification and baseline gates; keep generic Configuration context and unrelated controls inaccessible to Procurement (M4). Preserve native Super Admin vendor editor, file/retry behavior, scoped caches, and cross-screen invalidation (M5). | Rendered create/edit/archive/multiselect/baseline tests for Procurement and Super Admin, reduced capability/401/403 tests, contract test, mobile typecheck. |
| 3 | Primary agent after 2A/2B | Reconcile route import/export and context contracts; inspect all target diffs. Verify direct Vendors URL, Dashboard/Vendors switching, selected root/child, project-detail return, session change, and vendor mutation refresh. Fix only integration gaps with explicit path ownership. | Run combined focused mobile suites, `npm run typecheck`, `npm run test:contracts`, and `git diff --check`. |
| 4 | `integrity_reviewer`, read-only, after writers finish | Audit route authorization, unrelated Configuration isolation, private vendor detail and file handling, paise/project lineage, cache/session scoping, and native back navigation (M2–M5). | Report concrete findings by file/line; primary agent resolves any confirmed issue. |
| 5 | `verification_runner`, read-only, after review fixes | Run final integrated risk-based checks for M1–M6, Android export/bundle check, and available phone/tablet rendered or emulator visual QA. | Exact commands/results, unrun checks, diff/status hygiene, no production action. |

Tasks 2A and 2B may run in parallel only after Task 1's interface is settled and execution Mode A is selected. They have non-overlapping source ownership; Task 2A imports the named component supplied by 2B. In Mode B, the primary agent performs the same tasks inline in this order.

## Verification matrix

| Criterion | Required evidence |
| --- | --- |
| M1 | Procurement phone dock stays within five items; compact selector and tablet rail expose Dashboard then Vendors with expanded/selected accessibility state; direct URL and back navigation select the right child. Admin, Super Admin, and other role navigation stay unchanged. |
| M2 | Two unequal projects show correct Estimate version, section count, selected value, posted spend, and remaining INR from integer paise; invalid/duplicate identity or unsafe amounts do not render invented totals; existing project detail and expense route still open. |
| M3 | Vendor overview comes from `includeDirectoryOverview`; list search/filter/page and add/view/edit/archive use the shared vendor IDs and existing endpoints; photo, certificate, basket multiselect/inline create, and baseline remain available. |
| M4 | Authorization matrix covers Procurement full capabilities, reduced snapshots per action, Admin/other role denial, direct-route denial, stale 401/403 private-detail removal, and no general Configuration access. Backend enforcement stays unchanged. |
| M5 | Super Admin's Configuration vendor workflow still works; a vendor saved by either role appears after invalidation/refetch; cache keys remain user/environment scoped and old private detail is cleared on role/session change. |
| M6 | Focused native tests, mobile typecheck, contract drift test, Android export/bundle, rendered phone/tablet interaction, and repository hygiene pass. Report any unavailable emulator/browser check explicitly. |

## Release and limits

No schema migration, seed, backfill, backend policy change, dependency, commit, push, or deployment is required or authorized. If implementation discovers an API or authorization contract gap, stop that slice and update the approved spec/plan before expanding scope. The current `.expo` log is unrelated and must remain untouched.
