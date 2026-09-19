# Recommendation temporary catalog additions design

## Goal

Allow a Super Admin configuring **Recommendations & Exclusions** to recommend either:

1. one related Main Line; or
2. an entire Sub-Basket.

The author may select existing catalog records or create the missing Main Basket, Sub-Basket, and temporary placeholder item from the recommendation flow. A placeholder such as **Lights** is a real catalog record, appears in Configuration as **Temporary item · Must be completed**, and leaves the exact choice, such as 12 watt or 9 watt, open for later resolution.

## Current behavior and evidence

- Recommendation rules are stored as `budgetAlterations`. Every rule currently requires `targetBasketId`, optional `targetSubBasketId`, and a real `targetMainLineId`; there is no Sub-Basket target kind. See `backend/src/contracts/ai-estimator-knowledge.ts`, `backend/src/domain/ai-estimator-knowledge-validation.ts`, and `frontend/src/features/ai-estimator-knowledge/knowledgeBudgetAlterations.ts`.
- Backend reference validation requires an active Main Basket and a draft or active Main Line whose Basket, Sub-Basket, and item type match the rule. Free-text or fabricated IDs cannot be persisted. See `validateBudgetAlterationReferences` in `backend/src/services/ai-estimator-knowledge-item.service.ts`.
- The recommendation editor can create a related catalog or temporary Main Line and then select the authoritative returned ID. See `KnowledgeBudgetAlterationBuilder.tsx` and `CreateKnowledgeItemDialog.tsx`.
- Creating a Main Line can already resolve or create a named Sub-Basket transactionally. A temporary Main Line is created as a draft with Overview, Mode, and Quality applicable; other sections are not applicable.
- Inline Main Basket creation already exists for the standalone temporary-item dialog, but the condition `temporary && !related && canCreateBasket` explicitly hides it when the dialog is opened from a recommendation.
- Temporary items already appear in the Configuration index/workspace and carry a **Temporary item** badge. They do not have an explicit unresolved/completed lifecycle; `itemType` is currently immutable.
- Recommendation context is advisory and read-only. The repository currently has no recommendation-acceptance workflow that automatically mutates an Estimate.

## Scope

### Included

- Add a discriminator so one recommendation rule can target a Main Line or a whole Sub-Basket.
- Preserve all existing Main-Line recommendation rules without a data rewrite.
- Let authorized users create and select a missing Main Basket from the recommendation flow.
- Let authorized users create and select a missing Sub-Basket from the recommendation flow.
- Let a new Sub-Basket recommendation include a generic temporary Main Line, such as **Lights**, when the exact line is unknown.
- Make every temporary Main Line created through Recommendations visible in Configuration with a clear **Must be completed** state and its originating recommendation references.
- Keep unresolved recommendation targets visible to the knowledge-context consumer so the downstream estimator is told that the addition is required while the exact specification remains open.
- Update validation, reference protection, summaries, pending-change presentation, OpenAPI, and tests for both target kinds.

### Not included

- Automatically adding a recommendation to an Estimate or changing Estimate totals.
- Building a new estimator-facing recommendation-acceptance screen.
- Giving the `estimator_sales` role broad Knowledge Configuration create/update permissions.
- Guessing 12 watt versus 9 watt, expanding a generic placeholder into invented items, or using names as joins.
- Automatically activating temporary items or incomplete Sub-Baskets.
- Migrating existing records in place; compatibility is handled when reading legacy rules.

The phrase “remains open with estimator” is implemented in this scope as durable unresolved metadata returned by the knowledge context. A later Estimate workflow can ask the estimator to resolve it without losing the stable catalog lineage. Until such a workflow exists, completion remains in the existing authorized Configuration workspace.

## Actors and permissions

| Action | Required authority | Behavior |
| --- | --- | --- |
| View recommendation and temporary completion state | Existing `ai_estimator_knowledge.configuration.read` | Read only |
| Create Main Basket, Sub-Basket, or temporary Main Line | Existing `ai_estimator_knowledge.configuration.create` | Uses the existing protected admin operations |
| Save or edit a recommendation rule | Existing `ai_estimator_knowledge.configuration.update` plus current draft/action checks | Backend remains authoritative |
| Resolve or replace a temporary target in Configuration | Existing create/update/lifecycle permissions as required by the selected action | No role expansion |
| Consume recommendation context | Existing `ai_estimator_knowledge.context.read` | Read only; no catalog or Estimate mutation |

Super Admin retains the current operation-specific override. UI visibility must follow capabilities, but direct API authorization remains authoritative.

## Proposed behavior

### 1. Choose what the recommendation adds

Each rule editor adds **Addition type** before the catalog selectors:

- **Line item** — recommends one Main Line.
- **Whole Sub-Basket** — recommends the selected Sub-Basket as one related scope group.

Changing the addition type clears incompatible target IDs after an explicit confirmation when the current unsaved selection would be lost.

Existing rules without the new discriminator open as **Line item**.

### 2. Line-item target

The author selects or creates:

1. Main Basket;
2. optional Sub-Basket; and
3. catalog or temporary Main Line.

For a temporary line, the author may create a missing Main Basket inline. The current temporary-item name and other unsaved rule values remain intact while the Basket is created. The returned Basket ID is selected; the temporary Main Line is created only when the author submits the item dialog.

The new temporary Main Line is a real draft catalog record. The rule stores only its stable IDs. Cancelled or failed creation never inserts a fabricated rule target.

### 3. Whole Sub-Basket target

The author selects an active Main Basket and one of its Sub-Baskets. If either is missing and the actor has create permission, the same flow can create and select it.

- Selecting an existing Sub-Basket recommends that stable Sub-Basket ID as a whole.
- Creating a new Sub-Basket may also create a generic temporary child Main Line when the exact item is unknown. For the example, the hierarchy is:
  - Main Basket: the selected or newly created parent;
  - Sub-Basket: **False ceiling lights**;
  - Temporary Main Line: **Lights**;
- A newly created Sub-Basket may be targeted without a temporary child only when it already contains at least one available Main Line by the time the rule is saved. An empty new Sub-Basket cannot be saved as an active recommendation target because it would add no actionable scope.
- The rule targets the Sub-Basket, not the placeholder child. The placeholder remains visible under that Sub-Basket as a separate catalog item requiring completion.

The recommendation table and saved summary show **Whole Sub-Basket**, the Main Basket/Sub-Basket names, whether unresolved temporary children exist, the action/requirement, and enabled state.

### 4. Temporary completion state

All temporary Main Lines use one consistent state in Configuration:

- `itemType: "temporary"` remains the durable type.
- A derived `completionRequired: true` is returned for temporary items and shown as **Must be completed** beside **Temporary item** in the index and workspace.
- Completion is not inferred from a name, description, percentage, or draft/active status. A temporary item stays unresolved until an authorized user explicitly replaces the recommendation target with a concrete catalog Main Line or deliberately completes the placeholder through a future resolution workflow.
- In this phase, the existing temporary configuration sections remain Overview, Mode, and Quality. Filling those sections improves configuration completeness but does not silently change the item into a catalog Main Line.
- Incoming recommendation references remain visible so a user cannot mistake a referenced placeholder for unused data.

This preserves stable identity and avoids changing immutable `itemType` or silently rewriting multiple recommendation rules.

### 5. Save and failure behavior

- Creating catalog hierarchy records is independent from saving the recommendation section, matching the current related-item behavior. The UI states this clearly.
- Each successful create uses the authoritative response ID and refreshes Basket, Sub-Basket, Main-Line, item-list, deletion-impact, and incoming-reference queries affected by the mutation.
- Duplicate-name and ambiguous network outcomes re-read the relevant catalog before offering another create. The flow may explicitly reuse an exact active match; it must not blindly retry and create duplicates.
- If a Main Basket succeeds but a later Sub-Basket or item create fails, the valid created Basket remains available and selected. The unsaved recommendation and entered names remain recoverable.
- Closing or cancelling creation leaves the existing rule target unchanged.
- Section save continues to use existing section and aggregate version checks. A catalog create never bypasses a stale recommendation draft conflict.

## Data and API contract

Model `KnowledgeBudgetAlteration` as a backward-compatible discriminated union.

### Main-Line rule

```ts
{
  targetKind?: "main_line"; // absent means main_line for legacy rows
  targetType: "catalog" | "temporary";
  targetBasketId: KnowledgeStableId;
  targetSubBasketId: KnowledgeStableId | null;
  targetMainLineId: KnowledgeStableId;
}
```

### Whole-Sub-Basket rule

```ts
{
  targetKind: "sub_basket";
  targetType: null;
  targetBasketId: KnowledgeStableId;
  targetSubBasketId: KnowledgeStableId;
  targetMainLineId: null;
}
```

The other existing fields (`id`, `trigger`, `action`, `requirement`, `reason`, and `active`) are unchanged.

New or edited rules write `targetKind` explicitly. Existing persisted rows without it remain valid and serialize in responses without forced mutation until saved again.

### Validation invariants

- A Main-Line target requires a real draft/active Main Line matching Basket, optional Sub-Basket, and `targetType`.
- A Sub-Basket target requires a real Sub-Basket belonging to an active Main Basket, has `targetMainLineId: null`, and has `targetType: null`.
- An active Sub-Basket target must contain at least one draft/active Main Line. Empty targets are rejected with a field error on `targetSubBasketId`.
- Self-reference remains forbidden for Main-Line rules. A Sub-Basket rule is also rejected when it would include the source Main Line itself; this prevents a rule from adding/removing its own containing scope.
- Duplicate active rules use `[trigger, targetKind, target ID]` as their identity. A Main Line and its containing Sub-Basket are distinct targets, but the UI warns when both active additions would overlap.
- Disabled historical rows retain their saved representation and remain visible even if their target later becomes unavailable.
- Sub-Basket and Main-Line deletion/reference checks include both rule shapes and cannot race an accepted save.

### Context projection

The context response preserves `targetKind` and returns a target projection:

- Main Line: existing item identity, status, item type, and `completionRequired`.
- Sub-Basket: Basket/Sub-Basket identity, current available child count, temporary-child count, and `completionRequired` when any child is temporary or the group otherwise cannot be applied completely.

This is descriptive context. It does not mutate catalog or Estimate records.

### Audit and observability

- Continue existing audit events for Basket, Sub-Basket, Main-Line, and section creation/update. Stable IDs and versions are recorded; free-text recommendation reasons are not copied into operational logs.
- Do not add a second write when derived `completionRequired` is calculated.
- Safe diagnostics may record opaque source/target IDs, target kind, result code, and duration.

## UX requirements

- Keep the existing Recommendations groups and table structure.
- Use clear labels: **Addition type**, **Line item**, **Whole Sub-Basket**, **Main Basket**, **Sub-Basket**, **Temporary item**, and **Must be completed**.
- Keep creation inside the current contextual drawer/dialog pattern. Do not navigate away and lose the unsaved recommendation.
- Show **Add Main Basket**, **Add Sub-Basket**, and **Add temporary item** only when the actor has the matching capability.
- When an empty new Sub-Basket needs an unresolved child, explain: “Add a temporary item such as Lights. The estimator can choose the exact item later.”
- Loading, empty, unavailable, duplicate, permission, version-conflict, and refresh-warning states remain keyboard accessible and have announced status/error text.
- On mobile, selectors and create actions stack; on wider screens they may share a row. No horizontal scrolling is required to complete the rule.

## Compatibility and migration

- No database migration is required. The recommendation section already stores structured payloads.
- Legacy rules with no `targetKind` are treated as Main-Line rules in validation, presentation, context, and duplicate detection.
- Existing temporary items gain the derived **Must be completed** presentation without changing stored documents.
- OpenAPI and frontend types must accept the legacy shape while documenting the explicit new shape.
- Rollback remains possible because legacy Main-Line rows retain their old fields. New Sub-Basket rows require the new code and must not be silently downgraded to a fabricated Main Line.

## Risks and controls

| Risk | Control |
| --- | --- |
| Duplicate Basket/Sub-Basket/item after lost response | Reconcile by normalized name and parent ID before retry; use returned IDs only |
| Orphan Basket after later create failure | Keep it as a valid reusable catalog record and preserve form state; never invent the missing child |
| Whole Sub-Basket recursively includes its source | Reject Sub-Basket targets containing the source Main Line |
| Duplicate estimate scope later | Expose target kind and overlap warning; automatic Estimate application is outside this change |
| Temporary item appears complete because fields were filled | Keep explicit/derived `completionRequired` independent of section completeness |
| Stale rule overwrites another editor | Preserve section and aggregate CAS checks |
| UI permission leak | Hide create controls by capability and enforce every operation in backend authorization |

## Acceptance criteria

1. A legacy recommendation with only `targetMainLineId` still loads, validates, displays, saves, and resolves as a Line-item target.
2. A Super Admin can add a temporary related item from Recommendations, create a missing Main Basket without losing form state, and save the rule using authoritative stable IDs.
3. The created temporary Main Line appears in Configuration under the selected hierarchy with **Temporary item · Must be completed** and incoming recommendation references.
4. A Super Admin can select an existing Sub-Basket as the whole target of a mandatory, probable, exclusion, or other scope rule.
5. A Super Admin can create a missing Main Basket and Sub-Basket from the rule flow. When the new Sub-Basket is empty, the flow requires at least one available item or creates a generic temporary child such as **Lights** before the active rule can save.
6. A Sub-Basket rule stores `targetSubBasketId`, `targetMainLineId: null`, and `targetType: null`; a Line-item rule continues to store a real Main-Line ID and valid item type.
7. Backend validation rejects wrong-parent, missing, empty, unavailable, self-containing, and malformed targets with field-specific errors.
8. Duplicate detection distinguishes target kinds and rejects duplicate active rules for the same trigger and stable target.
9. Saved summaries, pending-change cards, recommendation tables, and read-only history identify Line item versus Whole Sub-Basket and show unresolved temporary state without raw IDs.
10. Knowledge context returns the target kind and unresolved/completion metadata without creating or changing Estimate, catalog, audit, or recommendation records during a read.
11. Failed, cancelled, stale-version, duplicate-name, and ambiguous-response flows preserve entered data, avoid fabricated targets, and do not double-submit.
12. Focused backend contract/reference tests, replica-set race tests, frontend interaction/accessibility tests, TypeScript checks, builds, and repository hygiene checks pass.

## Assumptions settled by approval

- “Add a whole Sub-Basket” means the recommendation targets the Sub-Basket by stable ID; it is not represented by a fake Main Line.
- A generic unknown choice such as **Lights** is a real temporary child Main Line, not free text embedded in the rule.
- **Must be completed** is unresolved workflow metadata, separate from draft/active lifecycle and section completeness.
- This change prepares authoritative context for a later estimator decision but does not introduce automatic Estimate mutation or a new estimator-facing screen.

## Open decisions

No implementation-blocking decision remains. A later product specification must define where an estimator accepts a recommendation, chooses the concrete replacement, and how that decision affects Estimate quantities and pricing.
