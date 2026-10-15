# Configuration: Design and Basket closure priority tabs

The current request and standing autonomous instruction authorize implementation without repeated approval gates.

Status: implemented and locally verified. See the [completed plan](../plans/2026-10-13-configuration-extra-tabs.md) for scoped results and the confirmed pre-existing Configuration test failures.

## Goal and evidence

Add **Design**, then **Basket closure priority**, immediately after **Quality Parameter** in the Main Line Configuration workspace. Existing tabs are rendered by `KnowledgeSectionNavigation.tsx` inside `KnowledgeItemWorkspacePage.tsx`. No existing Design or Basket closure priority configuration contract exists. Shared section keys also drive native mobile and saved-configuration completion counts.

## Scope and assumptions

This request adds web navigation only. The user has not specified fields, persistence or workflow behavior for these sections. Both tabs open clearly labelled empty sections; no invented fields or save action. Use frontend-only presentation keys, preserving shared persisted sections, completion counts, existing permissions and native mobile behavior. Keep existing unsaved-change protection when navigating from an edited section. Reuse the current desktop tabs and small-screen selector.

No backend, schema, pricing, workflow, vendor proposal, dependency or route change is needed. Previous assigned-project-visibility edits are unrelated and preserved. Rollback is limited to these presentation additions.

## Acceptance

1. Tab order ends with Quality Parameter, Design, Basket closure priority.
2. Mouse, keyboard and small-screen selection open correctly labelled panels.
3. New panels make no unsupported section API calls, offer no save action, and do not affect completion counts.
4. Existing save/discard/cancel navigation and Configuration sections keep working.
5. Focused rendered tests, frontend typecheck/build and visual checks pass.

No open decision blocks this tab-only scope; fields can be defined in a subsequent request.
