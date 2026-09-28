# Mobile Procurement Dashboard and Vendors

Date: 2026-09-27  
Status: Proposed for approval  
Classification: Native navigation and private vendor workflow change.

## Goal

Bring the approved web **Procurement → Dashboard, Vendors** workflow to the native mobile app for users with the `procurement` role. Dashboard must show their existing design-approved project procurement work with the same meaningful estimate and spend figures as the web view. Vendors must open the shared vendor directory and current native Add/Edit vendor flow, including the Super Admin vendor actions already authorized for Procurement by the backend. This request is for the Procurement role; existing Super Admin and Admin mobile navigation stays as it is.

## Current behavior and evidence

- `mobile/src/navigation/registry.ts` exposes one flat Procurement destination at `/feature/procurement` for Procurement. `AdaptiveAppScaffold.tsx` renders it as a tablet rail item or a compact phone dock tab. The tab opens `FeatureWorkspace`, whose generic Procurement list reads `/procurement/projects?limit=30&offset=0`. It renders project title/status but not the selected Estimate, recorded spend, and remaining value shown in the approved web Dashboard.
- The native vendor list is inside Super Admin Configuration → Reusable values → Vendors (`KnowledgeReusableValues.tsx`). The reusable `KnowledgeVendorEditor` already supports full vendor create/update, private certificate and photo operations, multiselect Main/Sub Baskets, inline basket creation, and historical allocation correction. Its current context (`knowledgeRuntime.ts`) accepts only the Super Admin Configuration permission, so a Procurement user cannot open it. The reusable-values wrapper also uses general Configuration permissions and must not be exposed to Procurement.
- The earlier approved web change introduced six scoped `procurement.vendor_*` permissions and backend route authorization for the existing vendor, basket, photo, certificate, and baseline endpoints. `mobile/src/contracts/authorization.ts` and `mobile/src/contracts/operations.ts` already mirror that policy. No new backend vendor API or data migration is needed for this native UI change.
- Initial worktree status for this request has one unrelated modified runtime log, `mobile/.expo/dev/logs/start.log`. Preserve it. Focused baseline mobile navigation/vendor tests pass: 4 suites, 75 tests.

## Required mobile behavior

1. Procurement retains one persistent root Procurement destination. In its content, show an accessible, expandable Procurement section with **Dashboard** then **Vendors**. On compact phones, place the section selector below the screen heading so both choices remain reachable with a 44-point target. On tablet rail, show the same hierarchy as an expandable parent with indented children. The currently selected child is explicit, survives direct navigation and refresh, and can be changed with touch or accessibility activation. Follow the approved olive/pale-olive hierarchy without copying desktop dimensions into a phone layout. Other role destinations and the five-tab phone limit remain intact.
2. Dashboard is the default child at `/feature/procurement`. Use the existing `/procurement/projects` response. Show project name, Estimate version, number of selected sections, Design-approved state, selected Estimate value, recorded spend, and remaining selected value for each project. Use integer paise from the returned sections and explicit INR formatting; do not substitute invented metrics. Preserve the current project-detail route and expense workflow. Show loading, empty, refresh, error, and authorization-loss states.
3. Vendors has a distinct deep-linkable authorized route, proposed as `/feature/procurement-vendors`. It presents the same shared vendor records as web: backend directory overview (total, active, under review), searchable/filterable paginated list, detail, Add vendor, Edit, Archive, photo/certificate, Main/Sub Basket multiselect and inline creation, and historical allocation correction. Reuse the existing native vendor editor and basket/baseline components; extract vendor-specific list and action UI from the generic Configuration reusable-values wrapper where helpful. Vendor changes in either web or mobile appear to the other after normal refetch/invalidation.
4. Gate the Vendors route on `procurement.vendor_directory.read` and the `procurement` role. Derive each native action from its corresponding scoped permission: create, update, lifecycle, classification create, and baseline correct. Never pass the Procurement role a general `ai_estimator_knowledge.configuration.*` context or show unrelated UOM/tax/item/quality controls. Backend operation checks remain authoritative. A missing permission, stale role, inactive account, or 401/403 response removes private detail and write controls.
5. Preserve existing vendor IDs, profile payloads, version/CAS, idempotency keys, upload type/size validation, compensation, audit attribution, and query scoping by environment/user. Keep sensitive banking, identity, photo, and certificate data out of list summaries, logs, and stale cross-session UI. If a write committed but a later refresh fails, retain the current safe retry/confirmation behavior.

## Recommended integration

Add one authorized vendor destination to the mobile registry while keeping Procurement as the selected root tab. Introduce a small Procurement subnavigation component shared by the project Dashboard and Vendors screens; the phone view exposes the children in content, and the tablet rail renders its expandable children. Build a vendor-scoped mobile context using the existing `createKnowledgeApi` and private query keys, with explicit vendor capabilities. Use that context for a dedicated vendor directory and adapt the existing native vendor editor/basket/baseline components to its narrower interface. The Super Admin Configuration route may continue to use the same editor through its existing context; do not broaden Configuration itself.

The Dashboard should specialize the current generic Procurement list rather than introduce a second project endpoint. The Vendors view should use `listKnowledgeMasters("vendors", ...)` with `includeDirectoryOverview` for metrics and existing vendor list/detail/mutation endpoints. This keeps one vendor registry and one source of financial/project truth.

## Scope, assumptions, and impacts

- **Scope:** mobile app navigation, Procurement Dashboard presentation, vendor directory/editor capability wiring, query invalidation, and focused native tests. Backend and web product behavior remain unchanged. No new dependency, schema, migration, seed, deployment, or production mutation.
- **Assumption:** “same changes ... for procurement” means the `procurement` role in mobile. Super Admin's native Configuration vendor route remains available, and Admin's existing mobile Procurement suggestions route remains flat. This is the narrowest match to the user's wording and existing mobile role model.
- **API/data:** no contract change. `/procurement/projects` remains the Dashboard source; `/admin/ai-estimator-knowledge/vendors` and its scoped operations remain the Vendors source. The different path prefix does not grant general Configuration access.
- **UX:** a phone dock cannot physically contain nested rows, so the submenu appears directly inside the Procurement screen; a wider rail can show the nested rows. Direct Vendors links must select the Procurement root item and Vendors child. If only one child is authorized, show only that child; hide the parent if neither is authorized.
- **Risk:** accidental exposure of general Configuration controls or stale private vendor detail, and project budget unit/integrity drift. Keep a vendor-specific context and test asymmetric roles, restricted snapshots, and unequal project amounts.

## Acceptance criteria

| ID | Required result |
| --- | --- |
| M1 | A Procurement user can open Dashboard and Vendors from an expandable mobile Procurement section on phone and tablet; the active child and accessible expanded/selected state remain correct after direct links, navigation, and back. Other roles' navigation and the phone dock limit are unchanged. |
| M2 | Dashboard shows real design-approved projects and Estimate version, selected sections, selected budget, recorded spend, and remaining value in INR from the authorized project response, with honest loading/empty/error states and working project links. |
| M3 | Vendors shows backend counts, search/filter/pagination, and the existing full native Add/View/Edit/Archive vendor flow, private photo/certificate handling, multiselect baskets with inline creation, and historical baseline correction. |
| M4 | Procurement can use only the six approved vendor capabilities. Direct unauthorized Vendors links fail closed; missing/revoked permissions and 401/403 responses remove private detail and controls. General Configuration remains unavailable. |
| M5 | Existing Super Admin Configuration vendor and Admin project-suggestion flows work; web/mobile share vendor IDs and records; mutations invalidate relevant vendor and project selectors without mixing users/environments. |
| M6 | Focused navigation, route, project amount, vendor action/denial, and native rendered interaction tests pass; mobile typecheck, relevant contract tests, Android export or equivalent bundle check, narrow/tablet visual QA, and `git diff --check` pass. |

## Open decisions

No product decision blocks the specification. The route name and exact placement of the compact selector can follow Expo Router and the current adaptive scaffold as long as the behavior above holds.
