# Draft Sub-Basket edit and sub-item removal design

## Goal

Allow an authorized user to correct a temporary Whole Sub-Basket while it is still in Draft, without leaving the **Recommendations & Exclusions** editor. The user must be able to:

- rename the selected draft Sub-Basket, for example from **Functional Lights and Supply** to **False Ceiling Lights**;
- rename a child sub-item that was added to that Sub-Basket; and
- remove a child sub-item that was added by mistake.

These controls remain available only while the selected Sub-Basket is still draft-editable. Once its catalog content has been moved out of Draft from the main Configuration workspace, the inline catalog controls become read-only and the main workspace remains the place to manage its lifecycle.

## Current behavior and evidence

- The approved recommendation catalog design defines a recommendation **sub-item** as a real Main Line under the selected Sub-Basket. It is saved to Configuration immediately and is not embedded only in the recommendation rule. See `docs/superpowers/specs/2026-09-19-recommendation-temporary-catalog-additions-design.md`.
- `KnowledgeBudgetAlterationBuilder.tsx` lists the selected Whole Sub-Basket's children and provides **Add sub-item**, but each existing child row displays only name, type, status, and completion state. It has no Edit or Remove action.
- `CreateKnowledgeItemDialog.tsx` supports creation only. It intentionally locks the selected parent when adding a child, and it has no edit mode.
- A Main Line already has versioned update and permanent-delete operations. Main-Line update can change the name. Permanent deletion rejects an active item and removes its stored dependent records and references transactionally.
- The main Configuration workspace already exposes Main-Line rename and lifecycle controls. `Review and activate` is the authoritative transition out of Draft.
- Sub-Baskets have stable IDs and versions, but their API currently supports only list and create. There is no Sub-Basket rename operation.
- A Sub-Basket has no independent lifecycle status. Its editability must therefore be derived from its direct Main-Line members rather than from a fabricated client-side status.
- Catalog creation and recommendation-section saving are separate writes. Renaming or removing catalog data must preserve that established behavior and must not imply that the open recommendation section has also been saved.
- The relevant permissions already exist: configuration update for renaming and configuration lifecycle for permanent removal. Backend authorization remains authoritative.

## Terminology and lifecycle rule

- **Temporary** is an item type and means the exact catalog choice still requires completion.
- **Draft** is a lifecycle status and controls whether this inline editor may mutate the catalog record.
- A selected Sub-Basket is **draft-editable** when every existing direct Main Line in it is in `draft` status. An empty Sub-Basket is also draft-editable, although an empty Whole Sub-Basket remains invalid as a recommendation target.
- A selected Sub-Basket is **frozen in this editor** when any direct Main Line is `active`, `inactive`, or `archived`. The drawer then shows its contents without Edit or Remove controls and provides a route to Configuration where applicable.
- This derived rule uses stable IDs and authoritative lifecycle states. Names are presentation only and are never used to determine ownership or membership.

## Scope

### Included

- Add an inline **Edit Sub-Basket name** action for a draft-editable Whole Sub-Basket.
- Add **Edit** and **Remove** actions to every child row while the whole selected Sub-Basket is draft-editable.
- Rename the Sub-Basket itself, not just the temporary child Main Line.
- Rename either catalog or temporary draft child Main Lines.
- Permanently remove either catalog or temporary draft child Main Lines after explicit confirmation.
- Reuse the existing Main-Line update/delete behavior while adding a draft-Sub-Basket concurrency guard for mutations initiated from this editor.
- Add a versioned Sub-Basket update contract with duplicate-name protection, lifecycle checks, authorization, audit history, and OpenAPI coverage.
- Refresh all affected catalog, relationship, context, deletion-impact, and item-detail caches without losing the open unsaved recommendation rule.
- Handle loading, permissions, version conflicts, frozen state, last-child removal, and mutation failure accessibly.

### Not included

- Moving a Main Line to a different Main Basket or Sub-Basket.
- Changing a child between catalog and temporary item types.
- Deleting the Sub-Basket container itself.
- Editing or removing frozen children from the recommendation drawer.
- Changing activation, deactivation, revision, or temporary-item completion workflows.
- Automatically saving, deleting, or retargeting the open recommendation rule after a catalog mutation.
- Adding a new database lifecycle status or migrating existing Sub-Basket documents.
- Changing Estimate quantities, pricing, or downstream recommendation acceptance.

## Proposed behavior

### 1. Sub-Basket rename

The selected Whole Sub-Basket summary exposes **Edit name** when all of the following are true:

- the recommendation section itself is editable;
- the actor has `ai_estimator_knowledge.configuration.update`;
- the complete child catalog has loaded successfully; and
- the selected Sub-Basket is draft-editable.

Selecting the action opens the established contextual editor pattern with the current name prefilled. Saving performs an immediate catalog mutation. A successful rename keeps the recommendation targeted to the same `targetSubBasketId`, updates the dropdown, child heading, saved summaries, and Configuration surfaces, and announces the new name. For the reported case, **Functional Lights and Supply** can be changed to **False Ceiling Lights** without recreating the rule or its children.

Cancel leaves both the catalog and the open recommendation draft unchanged. A duplicate normalized name is rejected within the same Main Basket. A stale version keeps the editor open, explains that the Sub-Basket changed elsewhere, and offers a refresh rather than overwriting newer data.

### 2. Child rename

Each child row exposes **Edit** while the whole Sub-Basket is draft-editable and the actor has configuration-update permission. The editor is prefilled with the child's current Main-Line name and changes only that name.

The mutation uses the child's stable `mainLineId`, its expected Main-Line version, the selected `subBasketId`, and the expected Sub-Basket aggregate version. It must recheck that the child still belongs to the selected parent and that the Sub-Basket is still draft-editable. A successful rename retains item type, lifecycle status, revisions, recommendation references, and stable IDs.

### 3. Child removal

Each child row exposes **Remove** while the whole Sub-Basket is draft-editable and the actor has configuration-lifecycle permission. Selecting it opens a confirmation naming the child and stating that removal is an immediate permanent Configuration change, separate from saving the recommendation section.

The removal command must recheck the child and Sub-Basket versions, parent membership, and draft-editable state in the transaction. It then uses the established Main-Line deletion cascade and audit behavior. Active, inactive, archived, moved, missing, or stale children are rejected without partial deletion.

If the child is the last available member, the confirmation also states that the Whole Sub-Basket will be empty. After removal, the rule remains selected by stable Sub-Basket ID, the editor displays **No sub-items are available**, and recommendation validation prevents saving until the user adds another child or removes/retargets the rule. The system must not silently remove the rule or choose another target.

### 4. Frozen presentation

When any direct member has left Draft:

- hide or disable the Sub-Basket rename and all child Edit/Remove controls;
- show a concise **Frozen in Configuration** explanation;
- retain type, lifecycle, and **Must be completed** indicators; and
- provide **Open in Configuration** for a child when the actor can read that workspace.

The UI must not infer editability from `itemType: "temporary"` or from the **Must be completed** badge. A temporary item that has left Draft is frozen here; a catalog item that is still Draft remains editable while the group is draft-editable.

### 5. Immediate persistence and open-draft preservation

Rename and removal are catalog mutations and take effect immediately. The drawer states this before confirmation. The recommendation rule remains a separate unsaved section draft.

After a successful mutation:

- keep the drawer open and preserve trigger, scope action, reason, enabled state, and all other unsaved rule fields;
- preserve `targetBasketId` and `targetSubBasketId`;
- update or invalidate the Main-Line item detail, item lists, Main-Line lists, Sub-Basket lists, context projections, relationship catalogs, incoming-reference data, and deletion-impact data affected by the operation;
- remove deleted rows from local bridging state so stale items do not remain visible while queries refresh; and
- announce the result with a non-blocking status message.

If any required refresh fails after the server mutation succeeds, show that the catalog change was saved and provide **Retry catalog refresh**. Do not retry the mutation blindly.

## Data and API contract

### Versioned Sub-Basket update

Add a protected operation equivalent to:

```http
PATCH /api/v1/admin/ai-estimator-knowledge/baskets/:basketId/sub-baskets/:subBasketId
```

```ts
{
  expectedVersion: number;
  name: string;
}
```

The response is the updated `KnowledgeSubBasket`. The mutation must:

1. authorize configuration update;
2. validate that the parent Main Basket and Sub-Basket IDs match;
3. compare `expectedVersion`;
4. reject the mutation when any direct member is outside Draft;
5. normalize and validate the new name;
6. preserve unique normalized names inside the Main Basket;
7. increment the Sub-Basket version; and
8. append an audit event containing stable IDs, old/new names, and old/new versions.

### Guarded child mutations

The existing Main-Line rename and delete contracts remain the canonical underlying operations. Calls made from this drawer include a draft-Sub-Basket guard containing the selected `subBasketId` and expected Sub-Basket version. The backend validates the guard in the same transaction as the child mutation. Main Configuration commands that intentionally manage a Main Line outside this drawer retain their established behavior.

Sub-Basket version acts as the aggregate concurrency token for its name and direct membership/lifecycle. Creating, renaming, removing, activating, deactivating, or otherwise changing a direct child increments or coordinates against that version so a rename or removal cannot cross the freeze boundary on a stale snapshot.

No persisted recommendation shape changes. Whole Sub-Basket rules continue to store the stable `targetSubBasketId`, with `targetMainLineId: null` and `targetType: null`.

### Errors

Use stable, distinguishable errors for:

- version conflict;
- frozen Sub-Basket;
- child/parent mismatch;
- duplicate Sub-Basket name;
- missing item or Sub-Basket;
- insufficient permission; and
- active or otherwise non-draft child removal.

The frontend maps these to actionable language and does not expose internal IDs or stack details.

## Authorization and audit

| Action | Required permission | Backend rule |
| --- | --- | --- |
| View children and frozen state | `ai_estimator_knowledge.configuration.read` | Read only |
| Rename Sub-Basket | `ai_estimator_knowledge.configuration.update` | Versioned and draft-editable only |
| Rename child Main Line | `ai_estimator_knowledge.configuration.update` | Versioned, matching parent, and draft-editable only for this inline command |
| Remove child Main Line | `ai_estimator_knowledge.configuration.lifecycle` | Versioned, matching parent, draft-editable, and confirmed |

Super Admin keeps the current operation-specific override. UI visibility follows capabilities, but every mutation remains protected by the route-operation registry and service checks. Sub-Basket rename and child deletion retain actor, timestamp, reason where applicable, stable identity, and before/after version evidence in audit history.

## UX and accessibility requirements

- Place Sub-Basket **Edit name** beside the selected group's heading, not inside the select options.
- Place compact **Edit** and **Remove** actions at the end of each child row. On narrow screens, keep the name and status readable and move actions to a second line without horizontal scrolling.
- Give each action a unique accessible name, such as **Edit Lights Supply and Installation** and **Remove Lights Supply and Installation**.
- Return focus to the initiating action after cancel. After successful removal, move focus to the next child action, **Add sub-item**, or the empty-state heading.
- Announce mutation success, failure, and refresh warnings with the existing status/error patterns.
- Disable mutations while child-catalog data is incomplete, refreshing after an error, or another catalog mutation is pending.
- Confirmation copy must distinguish immediate Configuration changes from the separate **Save Recommendation & Exclusions** action.
- Do not use browser-only confirmation for the permanent removal. Use the repository's accessible dialog/panel pattern with Cancel and an explicit destructive action.

## Compatibility and migration

- No database migration is required. Existing Sub-Basket documents already carry stable IDs and versions.
- Existing recommendation payloads and stable targets are unchanged.
- Existing Main-Line rename/delete callers remain compatible; the draft-Sub-Basket guard is required only for mutations initiated from this inline flow.
- Extend the route-operation registry, authorization-policy fixtures, API documentation, frontend types, and API client for the new Sub-Basket update operation.
- Rollback can remove the new controls and route without rewriting saved recommendation data. Renames completed before rollback remain ordinary catalog names.

## Failure handling and risks

| Risk | Control |
| --- | --- |
| Activation races an inline rename or removal | Coordinate through Sub-Basket aggregate version and recheck lifecycle state in the transaction |
| A stale drawer overwrites a newer name | Expected versions; keep editor open and refresh on conflict |
| Remove is mistaken for removing only the visual row | Explicit permanent Configuration confirmation and audit reason |
| Last child removal leaves an unusable rule | Preserve stable target, show empty state, and block section save until repaired |
| Rename breaks a saved rule | Rules retain stable IDs; names are presentation only |
| A successful mutation is repeated after refresh failure | Separate mutation success from cache-refresh warning; never blind retry |
| Permission-only UI protection is bypassed | Route-operation authorization and service checks remain authoritative |
| Partial child data falsely marks a group editable | Hide mutations until the complete child catalog loads successfully |

## Verification requirements

- Backend service and route tests for Sub-Basket rename success, normalization, duplicate name, wrong parent, permission denial, version conflict, and frozen state.
- Replica-set integration coverage for rename versus child activation and removal versus activation so only a valid serialized outcome commits.
- Existing Main-Line update/delete regression coverage, including audit records and reference cleanup.
- Route-operation registry, authorization-policy, OpenAPI inventory, and API-documentation tests.
- Frontend interaction tests for Sub-Basket rename, child rename, child removal, last-child state, frozen state, permissions, stale version, mutation failure, successful-mutation/failed-refresh recovery, focus, and accessible names.
- A rendered desktop and mobile-width check of the recommendation drawer to confirm readable child rows and reachable actions.
- Frontend and backend typecheck, focused tests, builds, `git diff --check`, and `git status --short`.

## Acceptance criteria

1. In the reported flow, an authorized user can rename **Functional Lights and Supply** to **False Ceiling Lights** from the open Whole Sub-Basket rule without recreating the Sub-Basket or losing unsaved rule fields.
2. The renamed Sub-Basket keeps the same stable ID and immediately displays its new name in the selector, rule summary, Configuration views, and context projections.
3. Every child row in a draft-editable Sub-Basket offers accessible Edit and Remove actions according to update/lifecycle permissions.
4. Editing a child changes only its Main-Line name and preserves stable ID, type, revisions, status, parent IDs, and recommendation references.
5. Removing a child requires explicit destructive confirmation, deletes the real draft catalog Main Line through the established cascade, refreshes the visible list, and records the audit event.
6. Removing the last child leaves the rule targeted to the now-empty Sub-Basket, shows an empty state, and prevents recommendation save until the user adds a child or removes/retargets the rule.
7. Once any direct child is outside Draft, the selected Sub-Basket is shown as frozen and no inline Sub-Basket or child edit/remove actions are available.
8. A lifecycle transition racing an edit/remove causes one serialized result; a stale mutation never crosses the freeze boundary or partially applies.
9. Users without update permission cannot rename. Users without lifecycle permission cannot remove. Direct API calls enforce the same authority.
10. Cancelled and failed edits/removals preserve catalog data, the selected stable target, and every unsaved recommendation field.
11. A successful catalog mutation followed by a failed query refresh is reported as saved, offers refresh retry, and cannot be double-submitted.
12. Existing Line-item and Whole Sub-Basket recommendations continue to load, validate, save, and resolve without payload migration.
13. Focus, keyboard interaction, announcements, responsive layout, and explicit accessible names work in the contextual editor on desktop and mobile widths.
14. Focused backend/frontend tests, race coverage, typechecks, builds, visual checks, and repository hygiene checks pass.

## Assumptions settled by approval

- The requested rename refers to the Sub-Basket label shown in the dropdown; child Main-Line names also receive their own Edit action.
- Removing a sub-item removes the real draft Main Line from Configuration. It is not a visual-only unlink, because Main-Line membership is an immutable parent relationship in the current model.
- The freeze boundary is the authoritative Main-Line lifecycle: all direct members must still be Draft for inline group mutation.
- Catalog mutations save immediately, while **Save Recommendation & Exclusions** continues to save only the recommendation section.
- An empty Sub-Basket may still be renamed, but it cannot be saved as an active Whole Sub-Basket recommendation until it contains an available child.

## Open decisions

No implementation-blocking decision remains.
