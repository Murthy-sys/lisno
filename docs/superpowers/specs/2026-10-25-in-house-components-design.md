# In-house components and estimate selection

## Decision and evidence

The user requested an Add component action with Main basket and dependent Sub-basket dropdowns, independently saved expandable components containing every existing In-house control, missing-sub-basket approval requests, and component selection in each estimate. The earlier parent-only picker choice is superseded by the explicit two-dropdown correction.

Current Configuration stores one labor/material calculation pair and one In-house scope. The Mode editor owns section versions, aggregate CAS, pending inputs and conflict recovery; it is also reused in proposal workspaces with an explicit scoped data source. Estimates currently price a single pair, and procurement resolves current saved Configuration while preserving approved and issued lineage. Repeating panels without changing those consumers would leave components unpriced or silently price unselected components.

## Product behavior and acceptance criteria

1. Add component opens a Main basket selector and its filtered Sub-basket selector. Include empty catalog groups and all catalog pages. Changing Main basket clears the Sub-basket selection. Duplicate component targets are prevented.
2. Add saves a stable component through the existing section/CAS flow. Each component has independent inclusions, exclusions, Labour and Material rates, UOM inherited from the Main Line, quantity limits, impact, minimum/starting gross margins and existing simulators. Saved components use compact expansion panels; collapsing preserves incomplete local input. No new implicit catalog pricing or inheritance is introduced.
3. Existing saved In-house settings are preserved as the first component when switching to components. A historical single unsplit cost is retained as Labour, with Material left unconfigured for explicit review; it is never duplicated into both costs. Old payloads with no component field keep their current behavior. An explicitly empty component list never falls back to legacy pricing.
4. Each estimate line independently selects component IDs. Missing, empty, duplicate or unavailable selection never means all components. Component selections control execution scope even when a rate is manual. New Configuration components do not enter existing estimates automatically. Missing selected components block readiness rather than silently repricing remaining components.
5. Missing sub-baskets are submitted as pending approval requests with parent basket, name, description and an idempotency key. Submission creates no catalog group or placeholder Main Line. Only explicit later approval creates the described Sub-basket. Pending requests are never selectable catalog entries.
6. Default margins retain independent components: compare source/target components by referenced basket/Sub-basket identity, and only compare complete saved margins for matching components. Applying defaults changes only matching components' margin fields, not rates, selections or component membership. New or unconfigured components are not fabricated or counted as differences.
7. Read-only, loading, empty, error, uncertain save, stale/conflict, retry and success states remain accessible. Parent/child selectors, expansion controls and dialogs support keyboard use and focus restoration. No horizontal overflow at 320px, 390px, 768px and desktop.
8. Active-only revisions keep Add component discoverable for authors permitted to create and update a Draft. The action opens the existing reasoned Create Draft dialog, without editing active history or creating anything until confirmed. After creation, the Draft's Add component opens the basket picker. Unauthorized, archived and scoped read-only contexts do not gain mutation controls.

## Contract and invariants

`advanced.inHouseComponents` is optional. Each entry has `id`, `basketId`, `subBasketId`, `inclusions`, `exclusions`, `labor`, and `material`. Maximum 50 entries; IDs and basket/Sub-basket targets are unique. Scope items retain `{id,name,selected}` and costs retain existing integer paise/basis-point settings. New components require a Sub-basket. The preserved first component has ID `legacy-in-house`; a null Sub-basket is allowed only for that component under the owning Main Line's basket when the line has no Sub-basket.

Each estimate line carries optional `selectedInHouseComponentIds`. Absence retains old behavior only for legacy Configuration; component Configuration requires an explicit nonempty valid selection on included In-house lines. Catalogue choices carry stable IDs, current display names and base rates. Current estimate base-rate policy remains the sum of the selected components' labor/material base rates. Actual margin/impact calculations evaluate each selected cost independently and sum rounded integer paise; do not average margins or merge quantity thresholds. Approved estimate amounts and issued artifacts remain immutable.

Saved current drafts take precedence over active revisions. Component identity and configuration follow the same source-of-truth and CAS rules. Component references require scoped save/activation validation and deletion protection. Proposal references must not escape their data source or publish unresolved identities. Configuration component edits refresh dependent catalogs and editable consumers.

`POST /admin/ai-estimator-knowledge/sub-basket-requests` accepts `{basketId,name,description,idempotencyKey}` and returns an existing request DTO with kind `configuration_sub_basket`. The operation uses Configuration create permission and the current Super Admin guard. Existing procurement proposal authorization remains unchanged. The existing review/decision inbox handles approval and rejection; approval cannot override the stored parent or create a Main Basket accidentally. Replays, duplicate names, parent changes and stale decisions preserve transactional behavior and audits.

## UX and compatibility

Use existing type, neutral surfaces, borders and input primitives. A concise Add component action precedes vertically stacked disclosure rows showing Main basket / Sub-basket identity and configuration state. Keep the existing two cost editors inside each expanded body, without extra card grids, decorative icons, shadows or motion. All components remain separate, with their own totals; there is no automatic all-component total.

Existing data is read compatibly; no seed, migration, backfill, automatic activation or live data write. Component representation is created only through explicit user saves. Rollback requires reverting the delivered source files with their captured backups; do not downgrade stored component payloads through an old client. Concurrent edits are rejected/reviewed rather than overwritten. No dependency or permission impersonation is needed.

Native compatibility preserves component selections, source versions and saved manual prices. Component configuration and component-priced estimate lines are read-only on native with a web-management notice; existing PMC and Sub-Vendor editing remains available. Responsive web supports component editing and estimate selection at mobile widths.

## Verification

Cover legacy invariance, conversion preservation, two unequal component costs and thresholds, explicit estimate subsets, missing/duplicate/manual selections, saved-history replay, draft precedence, deletion references, default-margin matching, partial configurations, request submission/approval/replay/auth boundaries, pending inputs and conflict recovery. Use synthetic isolated Mongo replica sets for writes. Typecheck/build both workspaces, run focused suites and meaningful broader consumers, and inspect the rendered add/edit/save/collapse/request/estimate flow on desktop and mobile with accessibility checks.

## Delivery

Prepare under `/tmp/lisno-inhouse-components`. Original source hashes and dirty state are captured before writers. The primary agent owns shared contracts, integration and margin compatibility; separate agents own backend component consumers, frontend component/estimate UI, and request workflow. Apply only verified source files to `/Users/apple/Desktop/personal/lisno` with conflict checks and backups using the required filesystem authorization. No commit, push, deployment, production mutation or actual approval request is authorized by this implementation task.
