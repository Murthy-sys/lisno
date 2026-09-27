# Vendor basket multi-selection

Date: 2026-09-27  
Status: Approved; dropdown presentation clarified during implementation  
Classification: Substantial. The vendor classification is shared by web, mobile, backend persistence, directory filters, and basket deletion protection.

## Goal

Allow a vendor to be assigned to multiple Main Baskets and multiple Sub Baskets when added or edited in the web and mobile vendor forms. Saved selections must reload accurately, appear in the vendor directory, and participate in existing classification filters and deletion safeguards.

## Current behavior and evidence

- The web Add Vendor and Vendor details panel uses one Main Basket select and one dependent Sub Basket select in `frontend/src/features/procurement/VendorBasketFields.tsx`. The mobile editor has the same single-value controls in `mobile/src/features/knowledge/KnowledgeVendorEditor.tsx`.
- `shared/knowledge/vendorProfileDraft.ts` requires and serializes one `mainBasketId` and one `subBasketId`. Both public profile types (`shared/knowledge/knowledgeTypes.ts` and `backend/src/contracts/procurement-vendor.ts`), backend validation (`backend/src/services/procurement-vendor-profile.ts`), the Mongoose model, and OpenAPI currently use those scalar fields.
- The backend vendor list filters by either scalar ID, returns one named basket pair in `procurementSummary`, and counts scalar references before Main Basket or Sub Basket deletion in `backend/src/services/ai-estimator-knowledge-reference.service.ts`. The web directory displays that pair in one column; its filters currently select one criterion at a time.
- Basket assignment and Sub Basket deletion coordinate through a write to the parent basket in a Mongo transaction. Vendor saves use version checks, audit records, and optional idempotency receipts. Those guarantees must cover every selected basket.
- The working tree already contains uncommitted temporary-item recommendation changes and generated Expo files. Vendor targets were clean at investigation; preserve the existing work and recheck target diffs before implementation.

## Scope and behavior

1. Replace the single-choice classification controls in both Add Vendor and Vendor details with accessible dropdown-style multi-select fields. Each field stays collapsed until opened, shows its selected count/names when closed, and opens a list of choices that can be checked independently. A vendor can select one or more Main Baskets and one or more Sub Baskets across the selected Main Baskets. Show each Sub Basket under its parent so equal names remain distinguishable. Display all saved selections in read-only views and the web directory.
2. Keep both fields required: at least one Main Basket and at least one Sub Basket overall. Each selected Sub Basket must belong to a selected Main Basket. A selected Main Basket may have no selected Sub Basket of its own. Removing a Main Basket removes its selected children from the draft, with an explicit visible indication before save. Saving an empty or orphaned selection fails with field-specific errors in both clients and on the server.
3. Existing inactive or unavailable selections remain visible and can be retained unchanged on edit. New Main Basket selections must be active; newly selected Sub Baskets must exist under a selected Main Basket. Users can remove stale selections and choose replacements. Failed catalog loads must preserve the draft and offer retry; the form must not silently save a partial option set.
4. Preserve inline basket creation. A created Main Basket becomes selected without clearing other selections. Creating a Sub Basket requires a specific selected parent and adds the new child without clearing the others. Respect existing create permissions and read-only/archived states.
5. Keep the directory's single Main Basket and Sub Basket *filters* as search criteria. A vendor matches a filter when the selected ID occurs anywhere in its saved selection. With both filters, both IDs must be selected by that vendor and the Sub Basket must belong to the filtered Main Basket. Display multiple classifications legibly at wide and narrow widths, with a way to read every selected name. The mobile vendor editor displays the same full selection when reopened.

## Data, API, and compatibility

- Introduce canonical `mainBasketIds: string[]` and `subBasketIds: string[]` on the stored profile and detail API, with unique, bounded IDs in deterministic order. Include `mainBaskets[]` and `subBaskets[]` in the public vendor summary; each Sub Basket summary carries its parent Main Basket ID and resolves its name from configuration. A legacy child whose record is missing may have a null parent ID and an unavailable name. The list response continues to expose summary only, never private profile fields.
- Preserve the legacy `mainBasketId`, `subBasketId`, `mainBasket`, and `subBasket` fields during transition. For legacy records with only scalar IDs, reads expose singleton arrays without a live backfill. New writes store arrays and a valid scalar primary pair derived from a selected Sub Basket and its parent. New web/mobile clients send arrays; scalar-only requests from older clients are accepted. An older client changing unrelated profile fields must not truncate existing multi-selections when it submits the unchanged primary pair; a changed scalar pair intentionally replaces the classification with one pair. Requests containing conflicting scalar and array selections fail rather than silently choosing one.
- Validate duplicate IDs, input bounds, existence, parent membership, and newly selected parent status on the backend. A missing or malformed profile remains distinguishable from an empty valid selection. Canonicalization must make semantically identical array orders produce the same idempotency fingerprint, without weakening existing replay/version checks.
- Keep the per-parent transaction coordination for assignment and deletion. Acquire locks for all selected existing parents in deterministic order; a concurrent Sub Basket or Main Basket delete may succeed only when no vendor reference remains. Count a vendor once for an impacted basket even if it has other classifications. Update indexes, list filters, deletion impact, audit field changes, and OpenAPI to reflect array membership and legacy records.
- No eager migration, seed, production data rewrite, new permission, or new endpoint is required. Existing records upgrade on an authorized profile save. A code rollback must retain an array-aware backend reader and old-client preservation behavior until multi-selection records have been deliberately reconciled; reverting to an old scalar-only writer would lose selections.

## UX, failure handling, and non-goals

- On web, use the existing procurement panel and field styling with two collapsed select-like triggers, keyboard-operable checkbox menus, selection counts, focused errors, and usable scrolling at narrow widths. Close an open menu with Escape or outside interaction and return focus predictably. On mobile, use select-shaped field triggers and the existing searchable multiple-choice sheet with checked states. Avoid introducing a new visual system.
- Busy, error, retry, dirty-close, version-conflict, uncertain-save/idempotent retry, archived/read-only, permission, and catalog refresh behavior must remain correct. Query invalidation must refresh detail, directory, and classification options after saved or newly created baskets.
- Do not change project vendor suggestions, vendor allocation/finance, vendor types, basket ownership, unrelated Configuration items, or the directory filter controls beyond their matching semantics. Do not add a dependency unless the implementation demonstrates a need.

## Risks and verification acceptance

| ID | Acceptance evidence |
| --- | --- |
| AC1 | On web and mobile, select at least two Main Baskets and multiple Sub Baskets from different parents; save, reload, edit one selection, and reload again with every intended choice intact. One of each still works. |
| AC2 | Both clients and backend reject no Main Basket, no Sub Basket, duplicate IDs, and a child whose parent is absent. Removing a parent prunes only its children. A Main Basket with no chosen child remains valid when another selected Main Basket has a child. |
| AC3 | Newly selected inactive/missing baskets and mismatched children fail safely; unchanged inactive/unavailable saved references remain visible and can survive unrelated edits. Catalog failure/retry does not drop selections. |
| AC4 | Both clients show collapsed Main Basket and Sub Basket multi-select fields that open to independent choices and summarize selections when closed. Inline create adds a new parent or child without clearing other choices; read-only and unauthorized views cannot mutate them. Keyboard, touch, screen-reader names, narrow web, and phone-width layouts remain usable. |
| AC5 | Directory summaries show all classifications without private profile data; filtering matches any selected member and honors a combined parent/child filter. Legacy scalar-only vendors still appear and match. |
| AC6 | Both basket deletion previews count vendors referencing any selected ID, block deletion for active/inactive/archived vendors, and remain race-safe against concurrent assignment. Distinct vendors are counted once each. |
| AC7 | Scalar-only old-client requests, canonical array saves, equal-set idempotent retries, version conflicts, audit changes, and legacy read normalization preserve all unrelated profile, certificate, photo, and verification data. |
| Checks | Focused draft/form tests for web and mobile; backend model/service, API/OpenAPI, and Mongo replica-set tests for list/deletion/races; affected typechecks/builds; rendered interaction/accessibility checks; `git diff --check` and worktree hygiene. |

## Assumptions, decision, and open decisions

The preceding request named both web and mobile, so this continuation covers both. “Multi-select” is interpreted as independent sets of Main and Sub Baskets with at least one of each, while every chosen Sub Basket must have a chosen parent. This preserves the current minimum required fields without imposing a new child requirement on every chosen Main Basket.

The recommended additive array contract keeps old records and old mobile clients readable without a live migration. Replacing the scalar fields outright would require a coordinated client rollout and a backfill; storing only a list of parent/child pairs would complicate existing independent directory filters and introduce a larger API change. No further product decision is needed for the proposed behavior; approval of this specification fixes the assumption above.
