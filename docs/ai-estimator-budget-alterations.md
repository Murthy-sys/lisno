# Budget Alterations and temporary items

Super Admin can configure conditional scope guidance in a regular Main Line's **Recommendation & Exclusions** tab. Each rule records whether the source is added or removed, whether a related item must/can be added or removed, the selected Main Basket → optional Sub Basket → related item, and a required explanation.

For example, removing a POP false ceiling can require removal of recessed COB lights because their mounting support disappears. A separate optional addition can propose a surface-mounted alternative. These are authored design decisions; the application does not invent dependencies, costs or savings.

## Temporary items

Use **Add temporary item** under a Main Basket or inside an alteration rule. The entry is reusable and listed beside regular Main Lines. It has its own stable ID, revision history and configuration:

- **Overview**: UOM and surfaces, using the existing Overview controls.
- **Mode**: the existing PMC, Sub-Vendor and In-house configuration, specifications and independent calculations.
- **Quality Parameter**: the existing quality controls.

Other sections are initialized as not applicable and cannot be edited through the API for a temporary item. Regular Main Lines retain their existing sections. Temporary and regular item names share the existing uniqueness rule within a Main Basket. A Sub Basket is optional for a temporary item. Duplication preserves the item type and copies configuration into an independent draft.

This implements the latest request for reusable Basket entries, superseding the earlier rule-local temporary-name proposal. Creating a temporary item persists it independently: discarding its originating rule does not delete the item.

## Persistence and compatibility

The existing Main Line record has immutable `itemType: "main_line" | "temporary"`; an omitted legacy value reads as `main_line`. Creation uses the existing authorized Main Line operation. No new collection, dependency, seed or data migration is required.

Rules are additive under `recommendations.payload.budgetAlterations`:

```ts
{
  id: string;
  trigger: "added" | "removed";
  action: "add" | "remove";
  requirement: "must" | "can";
  targetType: "catalog" | "temporary";
  targetBasketId: string;
  targetSubBasketId: string | null;
  targetMainLineId: string;
  reason: string;
  active: boolean;
}
```

Existing free-text recommendations and exclusions are retained and remain editable when present. Rules are limited to 100, require a nonblank explanation of at most 4,000 characters, cannot target their source item, and cannot contain conflicting enabled actions for the same target and trigger. Disabled rules remain saved but are excluded from estimator context.

The API validates type and Basket/Sub Basket membership. Active or draft targets can be selected. Section saves use the existing section and aggregate version checks. Reference saves coordinate transaction writes with target deletion; the existing permanent-deletion cascade also removes referencing rules. The deletion-impact summary counts these references. Editing unrelated Mode or Quality values does not require re-authoring a rule whose target later becomes inactive.

## Estimator context

The active source revision supplies the rules and source lineage. Each enabled rule also receives a derived `target` object containing the current related item's name, type, status and active revision ID. Missing or mismatched targets are marked unavailable. Draft targets have no active revision. This target availability is a current lookup, separate from the immutable source revision's authored rule.

Consumers must evaluate the trigger and current scope: removal applies when the target is present; addition applies when it is absent. They must check current target availability and resolve the relevant approved/active configuration before using prices. The configuration interface and context API provide guidance; this change does not automatically add/remove estimate rows, alter an approved estimate, or calculate savings.

## Implementation areas

- Backend: Main Line model and creation contract; section validation; item, reference, cascade and context services; OpenAPI inventory.
- Frontend: Budget Alteration builder; Main Basket listing and creation dialog; temporary workspace navigation; section validation, conflict display and catalog pagination.
- Tests: route authorization/validation, replica-set persistence and deletion races, context projection, regular-item compatibility, temporary navigation/creation, pagination, save versions and accessible interactions.

## Main Line info on temporary items

Temporary cards list the Main Lines that reference them, with Main Basket/Sub Basket context. Their workspaces show a **Main Line info** panel with links to those Main Lines and the conditional rule explanations. Multiple Main Lines are supported. Current active and draft revision references are labelled separately; disabled rules are explicitly marked. Superseded revisions and archived/deleted source Main Lines are excluded.

The existing item list/detail responses expose an optional, read-only `linkedMainLines` array for temporary items. Entries carry source Main Line and Basket/Sub Basket IDs and current names, source status, revision ID/status, and the associated rule IDs, trigger, action, requirement, reason and enabled flag. The backend derives this information from saved rules in batches, independently of the catalog's visible Basket filter or page. It does not store a second parent mapping or copy any calculations.

A newly created temporary item has no saved reference until its originating alteration rule is saved. Empty references show an explicit message; an older/unavailable response without this field is distinguished from a confirmed empty result. Main Line navigation respects unsaved workspace edits. Saving rules, lifecycle changes, deletion and Basket renaming refresh the affected temporary-detail caches without invalidating their section drafts.
