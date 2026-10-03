# Configuration Sub-Basket and Main Line name editing

Date: 2026-10-03  
Status: Approved; implementation in progress

## Goal

An authorized Super Admin can rename a Sub-Basket or Main Line from the corresponding entry in Configuration, on web and mobile, without searching for an editor elsewhere. Each edit changes the catalog name of the selected stable ID and is visible after saving.

## Current behavior and evidence

- The worktree was clean at the start of this request (`git status --short` returned no paths).
- Web Configuration (`frontend/src/features/ai-estimator-knowledge/KnowledgeBaseIndexPage.tsx`) displays Main Baskets, Sub-Basket headings, and Main Line cards. Sub-Basket headings have disclosure controls but no edit action. Main Line card menus (`KnowledgeIndexItemCard.tsx`) offer **Open item** only.
- Web rename already exists elsewhere: **Manage baskets → select Main Basket → Edit name** opens `KnowledgeSubBasketEditor`; a non-archived Main Line workspace has an **Edit Main Line** action in its header. Focused tests cover both existing paths.
- Mobile Configuration (`mobile/src/features/knowledge/KnowledgeCatalogWorkspace.tsx` and `KnowledgeBasketCarousel.tsx`) shows Sub-Basket group headings and Main Line item cards without a rename action on either entry. Its nested **Manage baskets** view can edit Sub-Baskets; the Main Line workspace can edit its title.
- The mobile Main Basket menu labels its basket-edit and basket-delete actions **Edit main line** and **Delete main line**, although the actions target the Main Basket ID. This makes the existing hierarchy misleading.
- Shared API methods and protected backend routes already support versioned PATCH renames: `/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId` and `/admin/ai-estimator-knowledge/main-lines/:mainLineId`. The Sub-Basket Configuration call supplies `managementContext: "configuration"`. Backend services check actor permission, identity, parent/version, normalized uniqueness, and audit the changes. No new persistence contract is needed for this request.

## Scope and non-goals

Included:

1. Add a clearly named **Edit Sub-Basket name** action beside each eligible Sub-Basket heading in the web and mobile Configuration hierarchy, including empty groups.
2. Add a clearly named **Edit Main Line name** action beside each eligible Main Line name in that hierarchy, including temporary items stored as Main Line records.
3. Reuse the existing editors or extract their name-only form logic so entry points share validation, version handling, authorization visibility, and save behavior.
4. Correct the mobile Main Basket menu labels to **Edit main basket** and **Delete main basket** so each action names its actual target.
5. Refresh the affected Configuration labels and dependent current catalog views after a successful rename.

Excluded: moving items between parents; changing item type, lifecycle, descriptions, costs, calculations, revisions, or approval history; bulk rename; catalog deletion; rewriting historical estimate snapshots; backend API or schema changes unless implementation evidence shows a specific defect in the existing rename path; production data writes, deployment, commits, or pushes.

## Requirements and UX behavior

1. Show a small pen icon directly beside the name of the exact Sub-Basket or Main Line being renamed. Give the icon button a distinct accessible name. The editor shows its current name and parent context, provides Save and Cancel, and preserves the entered value after a recoverable error.
2. Show rename only to a Super Admin with `ai_estimator_knowledge.configuration.update`. Hide it for an archived Main Line or a Sub-Basket whose Main Basket is archived. An inactive parent remains eligible for Sub-Basket rename, matching the current Configuration service. Backend authorization remains authoritative.
3. The action uses the selected entity's stable ID and latest known `version`; never locate a target by display name. For an item or filtered group represented only by a partial list row, fetch or resolve the authoritative detail before enabling a rename. If that load fails, show a retryable error instead of guessing an ID/version or submitting a stale value.
4. Trim and validate a required name within the current 240-character API limit. Saving an unchanged name is disabled. Duplicate-name, validation, permission, and version conflicts show an actionable error without falsely announcing success. A version conflict requires current data to be reviewed before retry; it must not silently overwrite another user's change.
5. On successful save, the hierarchy heading/card and any open current catalog presentation using that ID show the returned name. Keep the same expansion state, selection, scroll context, and stable ID. A failed post-save refresh must distinguish a committed rename from a failed save and offer a safe refresh path.
6. On web, the actions are keyboard reachable, have distinct accessible names that include the selected entity name, restore focus appropriately on close, and work at narrow widths. On mobile, actions have distinct accessibility labels, usable touch targets, and follow existing modal dismissal rules, including iOS action-sheet transitions.
7. Preserve the existing deeper edit entry points. Their behavior and the inline recommendation editor's draft-only Sub-Basket guard remain unchanged.

## Data, API, permissions, and compatibility

- Sub-Basket rename uses its existing PATCH request with `{ expectedVersion, name, managementContext: "configuration" }` and the selected `basketId`/`subBasketId` path. Main Line rename uses its existing PATCH request with `{ expectedVersion, name }` and `mainLineId` path.
- The existing backend applies normalized, scoped uniqueness; version checks; sole-active-Super-Admin mutation guard; and audit writes. A rename preserves parent and child IDs, relationships, lifecycle, revisions, and configuration payloads.
- Current catalog consumers should resolve changed names from the same identities after invalidation or cache reconciliation. Saved estimate and approval documents that intentionally contain historical name snapshots are not rewritten.
- No migration, seed, new dependency, or new route is expected. If the existing API cannot support a direct editor safely, pause implementation at that discovered contract change and update this specification before altering it.

## Assumptions, risks, and open decisions

- **Assumption:** “under Configuration” includes both the web and mobile Configuration hierarchy. Existing workspace and basket-manager editing confirms the intended operation is a catalog rename, not inline editing of estimate line items.
- **Assumption:** “Main Line” includes a temporary item whose underlying catalog record uses the Main Line identity and rename API; its visible editor can still use the user-facing item name where appropriate.
- A filtered web list can display a Sub-Basket name copied from an item when the Sub-Basket catalog is unavailable. The direct action must depend on an authoritative Sub-Basket record and version, not that copied label.
- A concurrent rename can make an open editor stale. The existing expected-version contract prevents lost updates; the UI must explain the conflict and preserve the user's draft for review.
- **Open decisions:** None. The user selected a pen icon directly beside each name during implementation.

## Acceptance criteria

1. A permitted Super Admin can rename a populated or empty Sub-Basket from its Configuration hierarchy entry on web and mobile; the same stable ID remains selected and the new name appears after refresh.
2. A permitted Super Admin can rename a Draft or Active Main Line, including a temporary item, from its Configuration item entry on web and mobile; the existing Main Line workspace shows the returned name.
3. Archived or unauthorized targets expose no rename action; backend rejection remains effective if a request is attempted directly.
4. Duplicate, stale-version, validation, and load/refresh failures are handled without duplicate writes, wrong-target changes, or a false success state.
5. Mobile Main Basket edit/delete labels identify Main Baskets; they no longer imply an item rename or delete.
6. Focus, accessible names, touch behavior, narrow layouts, and preserved hierarchy context are checked in rendered interaction tests. Focused web/mobile tests and typecheck/build checks pass for affected packages.
