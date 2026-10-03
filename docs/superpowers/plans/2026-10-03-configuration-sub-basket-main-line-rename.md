# Task plan: Configuration Sub-Basket and Main Line name editing

Date: 2026-10-03  
Status: Approved; implementation in progress  
Approved specification: [Configuration Sub-Basket and Main Line name editing](../specs/2026-10-03-configuration-sub-basket-main-line-rename-design.md)

## Delivery boundary

Expose name editing from the web and mobile Configuration hierarchy using the existing versioned catalog APIs. Preserve stable IDs, parent membership, permission checks, audit behavior, and historical estimate snapshots. Do not change backend contracts, shared API types, dependencies, production data, or unrelated screens unless a verified blocker requires the specification to be updated and approved.

Initial worktree: only the newly created specification is untracked; no product-file modifications were present when this plan was drafted. Before implementation writers start, capture `git status --short` again and inspect any newly dirty target diff. The primary agent owns this plan, cross-client contract decisions, and final integration.

## Dependency-ordered tasks

| Task | Depends on | Owner and affected area | Deliverable and acceptance criteria |
| --- | --- | --- | --- |
| T0. Confirm baseline and contract | Approved plan and execution mode | Primary agent; read-only inspection of current `frontend/`, `mobile/`, `shared/knowledge/`, and backend routes/services | Confirm target-file dirty state, list-row/detail versions, available rename API methods, permission/status conditions, and cache keys. Resolve only implementation-level choices established by the approved specification. If an API/schema change is truly required, stop and revise the specification before writing that contract. |
| T1. Web Configuration entry points | T0 | Web owner; `frontend/src/features/ai-estimator-knowledge/` only, including focused tests and feature CSS | Add an accessible pen-icon rename action beside eligible populated and empty Sub-Basket names using the authoritative catalog record, and beside eligible Main Line names. Reuse or extract the existing editors; preserve the item workspace and basket manager paths. Enforce visible permissions/status, stable ID/version requests, conflict review, correct success versus refresh-failure state, cache synchronization, focus, and narrow layout. Cover AC1–AC4 and AC6 for web. |
| T2. Mobile Configuration entry points | T0 | Mobile owner; `mobile/src/features/knowledge/` only, including focused tests and local styling | Add an accessible pen-icon rename action beside eligible Sub-Basket and Main Line names. Use catalog record IDs/versions and existing API/editor behavior, with authoritative detail when a row is insufficient. Correct Main Basket menu labels. Preserve group expansion, carousel position, permissions/status, iOS menu dismissal, touch accessibility, conflict draft, and refresh recovery. Cover AC1–AC6 for mobile. |
| T3. Integrated review and fixes | T1 and T2 | Primary agent; review both owned slices, no shared writes expected | Inspect the final diff for wrong-target mutations, stale data, unchanged-name writes, duplicate submissions, archived/unauthorized leakage, historical snapshot changes, and incompatible cache behavior. Resolve confirmed findings within the affected owner area. In Mode A, run the read-only `integrity_reviewer` after writers finish; in Mode B, perform the equivalent review inline. |
| T4. Final verification | T3 | Primary agent or `verification_runner` in Mode A; read-only checks and rendered QA | Run focused interaction tests, typechecks, affected builds/exports, rendered web/mobile interaction and accessibility checks, then `git diff --check` and `git status --short`. Report exact commands, results, artifacts, and any unrun checks. |

T1 and T2 may run in parallel only after T0 settles the shared behavior. Their file ownership does not overlap. No implementation subagent may edit `shared/`, `backend/`, the specification, or this plan without the primary agent explicitly reassessing the contract and ownership. In Mode B the primary agent performs T1 and T2 inline, then T3 and T4 sequentially.

## Implementation details to preserve

- Web Sub-Basket rows already receive full `KnowledgeSubBasket` records through the catalog query; a filtered group synthesized from an item must not open a rename editor unless its matching catalog record is available. Web Main Line list rows include an item version, and the existing workspace editor uses the item detail and PATCH `expectedVersion`; a direct entry should resolve the current detail or show a retryable load error.
- Mobile Sub-Basket group headings currently receive only grouped names. Pass or resolve the matching full catalog record before exposing rename. Mobile item cards currently expose **Open item** through their menus; the new icon action must target that card's `mainLineId`, not its Main Basket. The mislabeled Main Basket actions continue to target the basket, with corrected text.
- Existing web `KnowledgeSubBasketEditor` sends `managementContext: "configuration"`; existing Main Line workspace editing and mobile basket/item editors provide the behavioral baseline. Keep the recommendation editor's separate draft-only guard intact.
- A successful PATCH response is authoritative for the saved identity/name. Query invalidation or cache reconciliation must update the visible list, open current detail, linked current names, and selectors that use the catalog. A later refresh error may not turn a committed write into a second save attempt.
- Use a simple pen icon beside each name and the current design system. Do not add an icon package or hover-dependent interaction.

## Verification matrix

| Acceptance criteria | Focused evidence |
| --- | --- |
| AC1, AC2: rename direct from Configuration | Web `KnowledgeIndexPage.test.tsx`/`KnowledgeScreens.test.tsx`; mobile `KnowledgeCatalogWorkspace.test.tsx`, `KnowledgeBasketCarousel.test.tsx`, and `KnowledgeItemWorkspace.test.tsx` as affected. Cover empty/populated Sub-Basket, Draft/Active regular item, temporary item, exact ID/version/body, refreshed heading/card/workspace. |
| AC3: permission and lifecycle | Rendered tests for update permission absent, archived Main Line, archived parent, and inactive parent. Existing backend route authorization and rename contracts remain the enforcement boundary. |
| AC4: error safety | Simulate duplicate identity, stale version, failed authoritative load, and success followed by refresh failure. Assert retained draft, no false success, no second PATCH, and no wrong-target mutation, including two same-name entities under different parents where allowed. |
| AC5: Main Basket labels | Mobile menu test asserts **Edit main basket** and **Delete main basket** still call the basket endpoints; the Main Line pen button calls the item endpoint. |
| AC6: interaction and layout | Web keyboard/focus and narrow-width rendered checks; mobile touch targets, accessible labels, menu-to-editor transition including iOS dismissal, narrow phone and tablet rendered checks. |

Run focused tests first:

```sh
cd frontend && npm test -- src/features/ai-estimator-knowledge/KnowledgeIndexPage.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx src/features/ai-estimator-knowledge/KnowledgeBasketManagementDialog.test.tsx
cd mobile && npm test -- --runInBand src/features/knowledge/KnowledgeCatalogWorkspace.test.tsx src/features/knowledge/KnowledgeBasketCarousel.test.tsx src/features/knowledge/KnowledgeItemWorkspace.test.tsx
```

Then run `npm run typecheck` and `npm run build` in `frontend/`, `npm run typecheck` and `npm run export:android` in `mobile/`, and proportionate rendered QA against the integrated worktree. A backend suite is unnecessary if no backend contract or service changes; if those become necessary, revise scope and add the relevant focused and replica-set tests before implementation. No repository lint script exists.
