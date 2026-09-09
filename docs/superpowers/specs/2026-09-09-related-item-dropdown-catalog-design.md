# Related item dropdown and interior-design starter catalog

## Goal and decision summary
Rename the Budget Alterations target selector to **Related item**, let Super Admin create reusable selectable items from this flow, and supply practical interior-design starter suggestions.

Recommended approach: reuse the existing knowledge-item catalog and authenticated creation endpoint. Include curated suggestions in a separate dropdown group; selecting a suggestion opens a prefilled add dialog, and successful creation selects the real saved item. This makes starters immediately discoverable without inventing persisted IDs or automatically seeding a database.

## Current behavior and evidence
- At investigation, `git status --short` is clean. The current `KnowledgeBudgetAlterationBuilder.tsx` uses a native Main Line dropdown; the earlier visible-radio specification and changes are absent from this checkout. Current code and this request govern the new work.
- The action selector is already labelled “Related item” although its choices are Must/Can be added/removed. The actual target selector is labelled “Main Line.” These labels need to be distinguished.
- Eligible target options are active/draft knowledge items filtered by target Main Basket, optional Sub Basket, item type, and exclusion of the source item.
- The builder offers only “Add temporary item.” `CreateKnowledgeItemDialog.tsx` already supports regular and temporary item creation, prefilled basket/sub-basket, catalog invalidation, and item-detail caching.
- `KnowledgeItemWorkspacePage.tsx` supplies create access through `ai_estimator_knowledge.configuration.create`. The registered POST `/admin/ai-estimator-knowledge/baskets/:basketId/main-lines` permits the existing Super Admin administrative override and enforces backend authorization.
- `ai-estimator-knowledge-item.service.ts` creates items/revisions/sections and audit records transactionally. `validateBudgetAlterationReferences` requires real target IDs with matching basket/sub-basket/type and draft/active status. Labels or starter template IDs cannot be persisted as rule targets.
- The bootstrap manifest names POP / Gypsum, Electrical, On Site Carpentry, Modular, Painting, Polishing, and Fabrication baskets. This is repository background, not proof of the contents of any running database; no live catalog was inspected or mutated.

## Scope and non-goals
Include the rule selector, action labels, an add-related-item entry point, contextual creation-dialog wording/prefill, curated starter definitions, correct post-create selection/cache handling, and proportionate regression/permission verification. Reuse the existing catalog and its lifecycle.

Do not globally rename Main Line throughout the application, create a separate related-items database, change financial calculations, automatically author dependency rules, set prices, activate unfinished items, or seed/backfill a running database. Existing temporary-item behavior remains supported.

## UX requirements
1. Rename the target field to **Related item** for both item types, placeholder **Select related item**, and fallback **Unavailable related item**. Rename the action field to **Scope action**. In this builder only, the Item type value labelled Main Line becomes **Catalog item**; the stored value remains `catalog`.
2. Keep a native single-select dropdown in the current target-field position. Saved catalog choices remain selectable by their stable IDs and retain sub-basket context when All Sub Baskets is selected.
3. Add **Add related item** beside the target area for users with the existing create permission, including Super Admin. It opens a dialog with Related item name, Main Basket, and Sub Basket. Prefill the chosen target basket/sub-basket and preserve existing regular-item validation. Temporary creation keeps its established item-type semantics and required fields.
4. On success, select the returned item ID, type, basket, and sub-basket in the initiating rule; display its saved name immediately even if list refresh is delayed. Refresh the item/relationship lists, target main-line and sub-basket lists, and basket impact queries. The item remains reusable after reload and from another rule.
5. Creation changes the reusable catalog; the rule itself remains an unsaved edit until the existing section save succeeds. Cancelling creation changes neither. If the user creates an item and later abandons the rule, retain the catalog item and accurately communicate that it was added.
6. Preserve the current required explanation, independent trigger and scope action, self-reference exclusion, status/type filters, dependency resets, disabled/read-only behavior, validation, saved unavailable selections, and summary.
7. Make errors specific to creation or refresh. Keep the dialog values after a failed creation; disable repeat submission while pending. After an ambiguous network failure, refresh and reconcile the chosen name/context before inviting another create; never select an unconfirmed ID. Handle duplicate conflicts without silently linking an unrelated item.
8. Keyboard navigation, dialog focus return, accessible labels/errors, long names, empty/loading/error/stale states, and desktop/mobile layout must remain usable.

## Starter suggestions and their interior-design meaning
These are generic starting points, not automatic scope instructions or engineering specifications. They are optional catalog additions; no Must/Can action or reason is automatically assigned when selecting one. A designer determines the actual dependency and documents its reason.

| Suggested basket / sub-basket | Starter related item | Appropriate relationship to consider |
| --- | --- | --- |
| Electrical / Ceiling lighting | Recessed LED downlight | A ceiling-mounted recessed fitting may need removal or a replacement mounting arrangement if its supporting ceiling is removed. |
| Electrical / Ceiling lighting | Adjustable recessed spotlight | Coordinate recessed mounting and aiming with the ceiling and intended accent target. |
| Electrical / Cove lighting | LED strip light for ceiling cove | Relevant where an actual cove/recess is part of the design; removing that cove prompts a lighting review. |
| Electrical / Ceiling lighting | Surface-mounted ceiling light | A possible alternative when the design moves away from recessed fittings; requires a suitable mounting location. |
| POP / Gypsum / Ceiling details | Gypsum cove detail | The architectural recess is a separate selectable scope item from the light fitting. |
| POP / Gypsum / Service access | Ceiling service access panel | Consider where concealed services require access; removing a ceiling may change that access arrangement. |
| Modular / Kitchen hardware | Soft-close cabinet hinge set | Relevant to hinged cabinet shutters; depends on the actual shutter/hardware design. |
| Modular / Kitchen hardware | Soft-close drawer runner set | Relevant to the associated drawer; confirm whether already included in the cabinet package. |
| Modular / Kitchen storage | Pull-out kitchen storage unit | An optional cabinet-specific storage accessory; not mandatory for every kitchen. |
| Modular / Overhead cabinet hardware | Lift-up cabinet shutter fitting | Relevant only to a lift-up shutter configuration. |
| On Site Carpentry / Wardrobe fittings | Wardrobe hanging rail | Relevant to a hanging compartment; unnecessary for a shelves-only compartment. |
| On Site Carpentry / Wardrobe fittings | Pull-out wardrobe basket | An optional accessory for the corresponding wardrobe compartment. |

The proposed basket/sub-basket placement is a product recommendation. The add dialog allows correction to match the actual local catalog. Prevent double counting where a fitting is already included in a bundled item; this guidance does not create a new pricing rule.

### Research basis and limits
- [Gyproc lighting guide](https://www.gyproc.in/blog/lighting-up-the-ceiling) describes recessed, adjustable and cove lighting arrangements. This supports the ceiling-lighting categories; conditional removal/replacement reasoning above is a design inference, not a universal manufacturer rule.
- [Gyproc metal accessories](https://www.gyproc.in/products-metal-framing-accessories/metal-accessories) describes access panels for utility service access.
- [Häfele kitchen solutions](https://home.hafeleindia.com/pages/kitchen-solution-brochure) identifies hinge, runner, lift and storage systems. [Häfele furniture fittings catalog](https://home.hafeleindia.com/pages/furniture-fittings-catalogue) provides the furniture-fitting context. Starter names and placement are our generic editorial choices, not branded specifications or claimed package contents.
- No product dimensions, electrical ratings, structural load claims, prices, or automatic removal of services are supplied. Those depend on the actual design and selected products.

## How suggestions become selectable catalog items
1. Under the catalog type, eligible persisted items appear in an **Existing items** option group. Create-authorized users also see **Suggested items — add to catalog** for the selected target basket.
2. Starter template keys are UI-only and have a separate namespace. Picking a suggestion opens the add dialog with its proposed name and sub-basket; the existing target remains unchanged until creation succeeds.
3. The starter group follows the selected target basket. Match known category names conservatively after normalization; do not guess a renamed basket's meaning or join persistent entities by a display name. The actual chosen basket ID is sent to the API. Unrecognized baskets still support custom additions.
4. With All Sub Baskets selected, show all starters for that basket and their proposed sub-basket context. With a specific sub-basket selected, show only compatible starters by normalized proposed sub-basket name; custom additions remain available. Empty guidance explains that choosing All Sub Baskets can reveal more suggestions.
5. Suppress a suggestion if the fully loaded catalog already contains a matching normalized name, basket ID, sub-basket context, and item type. Reuse an existing eligible item only after explicit selection; inactive/archived matches must not trigger automatic duplicates or lifecycle changes. Different sub-baskets with the same item name remain distinct IDs.
6. Creating a suggestion uses the same authenticated catalog API as a custom addition. The saved response, never the suggestion key, sets `targetMainLineId`. Another user can subsequently select the persisted item under their normal access.
7. Suggestions are bundled content, not dynamically generated by AI at runtime, and require no new external service. Do not create catalog records on page load or dropdown open.

## Permissions and contract invariants
| Actor/capability | Read/select | Add custom/starter item |
| --- | --- | --- |
| Super Admin with existing configuration access | Select in an editable rule | Allowed through existing authorized create operation |
| Other actor already holding configuration create/update permissions | Preserve current authorized access | Preserve current authorized create access; no new grants |
| Read-only configuration user / historical revision | View saved item; no rule edits | Unavailable in the read-only rule flow |
| Actor without configuration access | Existing backend denial/non-disclosure | Backend denial; hiding controls alone is insufficient |

“Super Admin can add” is interpreted as ensuring that supported capability, not revoking existing authorized staff permissions. Verify with asymmetric actors. No permission registry expansion is expected.

Keep the persisted budget alteration fields `targetType`, `targetBasketId`, `targetSubBasketId`, and `targetMainLineId` unchanged. Preserve backend reference checks, transactions, actor audit identity, and the draft lifecycle. Reuse the existing creation contract; no schema migration or new endpoint is proposed. Update backend user-facing target errors only where required to match the Related item terminology, without changing validation.

## Options considered
1. **Reuse catalog with explicit starter creation — recommended.** Fits existing references, audit and lifecycle; requires one deliberate add step before an unsaved starter becomes a real item.
2. **Provision all starters into the catalog in bulk.** Immediately lists every item but can create duplicates or unwanted classifications, requires environment-specific dry-run/rollback and write authority, and is not needed for the requested UI workflow.
3. **Separate related-item master list.** Simpler names-only authoring but splits the source of truth and requires new contracts/reference validation. Not justified by this request.

## Risks, compatibility, and operation limits
- The actual catalog may use different names or already contain these items. Conservative matching and explicit creation avoid silent remapping.
- Concurrent additions and ambiguous network failures must not produce optimistic fake IDs or silently alter another rule. Existing backend duplicate behavior must be checked during implementation; do not promise deduplication based only on client filtering.
- A slow relationship-list refresh must not make a successfully created item appear unavailable. Retain the authoritative returned detail for the current selection.
- Related items may span baskets: a POP ceiling can affect Electrical items. The target basket is an intentional selector and must remain changeable.
- No data migration is needed. Reverting UI/starter code leaves existing item and rule records in their established format. Never delete created catalog items as automatic rollback of a later rule edit.
- No production population, seed execution, commit, push, deployment, or customer communication is authorized at this specification stage.

## Acceptance criteria and verification
- **AC1 — terminology:** The target is Related item, action is Scope action, and no ambiguous duplicate field labels remain in this builder. Stored field names and existing saved rules are compatible.
- **AC2 — custom add:** Super Admin creates an item from the rule, sees its name immediately, can select it, save/reopen the rule, and reuse it from a second rule. Cancel and failure paths preserve the prior target.
- **AC3 — starters:** All twelve starters are represented with basket/sub-basket context. Eligible suggestions appear under the chosen filters, open a prefilled dialog, and become real selectable catalog records only on success. Template keys never enter a saved payload.
- **AC4 — identity/duplicates:** Existing-match suppression uses full context; same names in different contexts do not collide. Self, unavailable, incompatible-type and inactive items are not newly selectable. Duplicate/ambiguous failures reconcile without blind retry or fake selection.
- **AC5 — access:** Authorized Super Admin creation succeeds; a non-creator cannot create via direct API; read-only/history remains immutable. Existing staff permissions are preserved.
- **AC6 — reliability/UX:** Required validation, preview, temporary flow, keyboard/focus, loading/empty/error/stale/read-only states, long names, and desktop/mobile rendering pass. No fabricated pricing or automatic scope decisions are introduced.
- Verify with focused builder/dialog/workspace tests, permission route tests as needed, frontend typecheck/build and rendered browser interaction. If any transactional backend behavior changes, run replica-set tests. Finish with `git diff --check` and status; report exact results and unrun checks.

## Assumptions and open decisions
- The screenshot's Budget Alterations builder is the target, not every Main Line field in the application.
- Starter suggestions should be available to add from the dropdown, with real catalog creation before selection is saved; this proposal avoids an unspecified live seed operation.
- Starter placement and the twelve-item list above are reviewable recommendations. Specification approval settles these choices. No additional decision blocks this draft.

## Approval boundary
Only this specification is created now, under the `AGENTS.md` four-stage workflow. The separate task plan follows approval; execution choice follows task-plan approval. The previous task's Mode A choice does not skip this new feature's gates.
