# Sales recommendation Add: one explicit item

Date: 2026-11-08
Status: Implemented after approval and Mode A selection on 2026-11-08; scoped checks passed, full-suite limitations recorded in the task plan
Classification: Substantial frontend workflow correction

## Goal

When Sales clicks Add on one non-negotiable recommendation, include exactly that
item in the active room. Make its identity, destination, and successful addition
clear. The action must not make unrelated catalogue rows appear as though they
were also added.

## Current behavior and evidence

The user reports that Add in the recommendation alert appears to add many items.
Investigation of the current checkout establishes the following:

- `LeadEstimateWorkspace.tsx:877` validates an individual recommendation target
  and its current same-room sources. It creates or selects that one room/Main
  Line, and records `recommendationSourceMainLineIds`.
- The same handler adds the target's parent Main Basket to the workspace-wide
  `selectedMainBasketIds` at line 899. This association is necessary for saving:
  `backend/src/routes/estimates.ts:534` requires a new line's parent basket to be
  selected.
- Sales opts into catalogue presentation at
  `LeadEstimateWorkspace.tsx:1126`. `buildSalesEstimateCatalogue` projects every
  eligible item in every selected basket for the active room. It creates
  unchecked display-only rows for items without a draft.
- `ConfiguredEstimateBuilder.tsx` clears search/filter and expands the target
  basket and Sub Basket after an accepted recommendation. Consequently the new
  basket's unrelated available rows become visible immediately. The globally
  selected basket also becomes browseable when switching to another room.
- `createConfiguredLine` initializes a line as excluded, and
  `buildConfiguredLines` refreshes existing drafts without expanding the whole
  catalogue. The save payload at `LeadEstimateWorkspace.tsx:355` serializes only
  included lines and persisted exclusions. The backend maps submitted lines;
  it does not expand a selected basket into additional saved items.
- The shared recommendation component provides item/source names and Add/Remove,
  but its success announcement is screen-reader-only. The staff adapter does not
  show the target's basket/Sub Basket context or a visible addition receipt.

### Reproduction and baseline

A read-only synthetic execution of the current helpers used two unequal rooms,
one source item, and a newly introduced target basket with three different items.
After selecting one target:

- The first room displayed the source, chosen target, and two unrelated previews.
- The second room displayed previews for all four items with none selected.
- Only the source and chosen target in the first room were draft/save candidates.

This confirms unintended catalogue expansion and ambiguous feedback. It does not
establish that the user's particular estimate persisted extra included items;
no real estimate or private data was read or changed. Verification must check
both presentation and the actual included-item/save delta.

Existing baseline command:

```sh
cd frontend
npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/LeadEstimateRecommendations.test.tsx
```

Result: **2 files, 24 tests passed**. Existing recommendation workspace fixtures
have only one item in the target basket, so they do not catch sibling expansion.

## Worktree baseline

Tracked files have no local diffs. The only initial untracked files are the
specification and completed task plan for the earlier local OCR environment
repair. Preserve both. No application files have been modified for this request.
Recheck status and per-target diffs before implementation ownership is assigned.

## Scope and non-goals

In scope: editable Sales configured estimates, including reopened drafts; the
non-negotiable recommendation Add interaction; catalogue visibility caused by
that action; explicit feedback; room isolation; relevant regression and rendered
interaction checks.

Preserve normal direct browsing for Main Baskets deliberately selected in Setup,
existing included items, edited values, persisted exclusions, recommendation
origin cleanup, popup dismissal/focus behavior, and Configuration freshness.

Out of scope: global editor redesign; changing recommendation eligibility or
automatically selecting dependencies; bulk Add; Client/Designer workflow changes;
financial formulas; backend permissions/contracts; schema migrations; correcting
previously saved estimates automatically; new dependencies; production changes,
commits, pushes, deployment, or customer communication.

## Recommended approach and alternatives

**Recommended: separate recommendation scope from catalogue browsing.** Keep the
required parent-basket association for saving, but do not interpret a basket
introduced by a recommendation as a request to display all its available items.
Render its explicitly included lines and required exclusion-review content, with
an explicit action to browse other catalogue items. Add visible feedback naming
the selected item and active room. Retain the sparse draft model.

**Alternative: retain full expansion and add explanatory copy only.** This is a
smaller presentation change but still introduces many rows after a single-item
action and does not address the reported experience sufficiently.

Changing the whole Sales workspace back to selected-only/picker-first browsing
would conflict with the established direct-browsing workflow and is out of scope.
The recommended behavior is a narrow exception for recommendation-introduced
baskets, not a reversal of normal Setup-driven browsing.

## Requirements

### R1. Exact selection and unchanged existing work

- An accepted Add changes the included-item set by exactly the target's stable
  room/Main Line identity, validated against its basket and Sub Basket. It must
  not select siblings, all children of a recommended Sub Basket, or suggestions
  discovered subsequently for the newly added item.
- A Sub Basket recommendation continues to list individual child items with
  individual Add actions. Clicking one child includes only that child.
- Repeated events for the same target do not duplicate a draft row, quantity,
  amount, or provenance. Existing selections in any room remain unchanged.
- Preserve existing quantities, dimensions, rates, classification, pricing mode,
  tier and component choices. Do not fabricate defaults for missing required
  data; preserve existing incomplete-item validation.
- Keep current recommendation-source provenance and removal rules. This task
  does not redefine what happens when a source is subsequently removed.

### R2. A recommendation does not open a whole basket of new rows

- When the target's Main Basket was not already selected, maintain its required
  saved association while initially displaying only deliberately included lines
  in that basket for the current room, plus any required exclusion review.
  Unselected siblings and unrelated Sub Baskets must not appear as new editor
  rows solely because Add was clicked.
- The newly introduced basket must not populate other rooms with new available
  rows automatically. Existing included items in those rooms remain visible.
- Provide a clear `Browse other items in <basket name>` action for a basket in
  this compact state. It reveals authorized available items for the active room,
  using existing hierarchy, search and pagination. Browsing does not select or
  save any item, change totals, or generate recommendation origins.
- If the target basket was already deliberately selected in Setup, preserve its
  existing direct catalogue browsing. Add still checks only the target; do not
  remove previously visible choices or overwrite in-progress edits.
- Keep the clicked target discoverable even when it is beyond the current page
  or outside an existing search/filter. Use bounded view-state adjustment rather
  than expanding all other groups or moving keyboard focus unexpectedly.
- Keep visibility state distinct from `included` and from the parent-basket save
  association. Presentation state must not become part of financial calculations
  or the estimate's dirty fingerprint.

### R3. Clear content before and after Add

- Each Sales recommendation identifies the exact item, its Main Basket/Sub
  Basket where applicable, and the selected source item(s) explaining why it is
  recommended. The popup heading continues to identify the active room.
- Add concise guidance: `Add selects this item for this room.` Do not introduce
  an additional confirmation dialog for an ordinary single-item Add.
- On success, show a visible, accessible status such as
  `Added 1 item: False ceiling painting to Living & Dining.` Keep the action's
  selected/Remove state synchronized with the actual draft.
- Describe the change as a draft selection, not a completed save. Preserve the
  existing Save draft flow and unsaved-state reporting.
- Only display success after the selection handler accepts the action. For a
  rejected, stale or unavailable target, retain an actionable explanation and
  the existing retry/refresh behavior; do not show a false success message.
- Feedback belongs to the originating room. Clear or replace it on room/context
  changes so a late result cannot claim an item was added to a different room.

### R4. Save, restore, browsing state and compatibility

- Keep the existing API fields and payload shape. Save the target's required
  parent association, but serialize only actual included lines and existing
  persisted exclusions under the current rules.
- After save and reload, the included-item set contains exactly the prior
  selections plus the chosen target. No sibling or other-room line is created.
- During the workspace visit, retain compact/browse choices across save/refetch,
  room changes, and Builder/Summary navigation. Reset them on actor/lead changes.
- On a fresh load, use existing persisted recommendation origins to start
  baskets containing only recommendation-derived selections in compact mode.
  Preserve all saved lines and exclusions. Empty selected baskets and baskets
  with independent selections retain normal browsing. No new server field is
  needed solely to remember catalogue disclosure.
- The explicit browse disclosure is a workspace preference, not permanent
  Configuration. If a prior session's deliberate browsing cannot be distinguished
  from recommendation-only scope using saved data, prefer compact presentation
  with the visible browse action; never infer extra included items.
- Preserve exclusions that require correction, local edits to excluded rows,
  and saved values when switching between compact and full catalogue views.

### R5. Permissions, failures and accessible presentation

- Apply the new presentation only to the current Sales working-draft boundary.
  Client/default inline, Designer and immutable historical/submitted/approved
  views retain their existing behavior.
- Loading, stale Configuration, failed refresh, forbidden access, incompatible
  grouping and save/submission locks must retain their current addition guards.
- Use current authorized Configuration data and stable IDs. Names are labels,
  never join keys. Do not fetch an unrestricted catalogue to supply extra context.
- Reuse the existing popup, item rows, typography and surface tokens. No new
  icons, animation, shadows, decorative cards or unrelated visual redesign.
- Preserve keyboard Add/Remove, meaningful focus after updates, Close/Escape,
  popup dismissal state, 20-item paging, and an unobstructed Save footer. Long
  names and status text must wrap on mobile without horizontal overflow.

## Data, financial and operational invariants

No backend/API/schema or migration change is expected. The existing
`selectedMainBasketIds` association remains valid for backend checks, while
line-level `included` values and integer-paise amounts remain authoritative.
Totals and tax must change only by the explicitly added item according to the
existing pricing rules. Published/customer-approved amounts remain immutable.

Recommendation queries continue to use current source identities, versions,
actor and room keys. Refreshing recommendations may reveal further suggestions
but cannot add them. Save CAS/version checks, backend authorization, and existing
query refresh/invalidation paths remain intact.

The likely touchpoints are `LeadEstimateWorkspace.tsx`,
`ConfiguredEstimateBuilder.tsx`, `salesEstimateCatalogue.ts`,
`EstimatorRecommendations.tsx`, the shared recommendation view/types or scoped
styles if needed, and their tests. Shared presentation changes must opt in for
Sales. The task plan will settle exact ownership after specification approval.

No real estimates need mutation for verification. Use synthetic catalogue and
draft fixtures. Rollback is the bounded frontend change; no data rollback is
required. Do not automatically remove previously saved lines based on guesses
about how they were added.

## Risks and assumptions

- The reproduced defect is visibility expansion. The user's original save/total
  behavior remains unverified, so test the state, payload and total as well as
  what is rendered.
- The saved contract does not separately identify deliberate catalogue browsing.
  Conservative compact hydration for recommendation-only baskets is an explicit
  presentation tradeoff, with an always-available browse action.
- Shared basket IDs are workspace-wide, whereas items and recommendations belong
  to rooms. Mixing these scopes can accidentally expand or select other rooms.
- Weak fixtures with one target child cannot detect the defect. Use multiple
  differently priced siblings, multiple Sub Baskets and unequal rooms.
- Hidden excluded edits, duplicate targets, stale async responses, focus loss,
  and inaccurate success announcements are material regression risks.
- No separate user decision is required before review; the recommended behavior
  above is the proposed interpretation of the request.

## Acceptance criteria and verification

1. **AC1: One addition.** With several unrelated items and Sub Baskets in the
   target basket, clicking one Add includes exactly one new target in the active
   room. Repeated clicks and Sub Basket child actions do not add siblings or
   duplicates. Assert exact included IDs, counts, quantities and provenance.
2. **AC2: No surprise rows.** Adding from a previously unselected basket displays
   the chosen item without newly displaying its unrelated previews in either
   room. Existing Setup-selected baskets keep direct browsing. Explicitly
   browsing other items shows them unchecked and leaves draft state unchanged.
3. **AC3: Clear receipt.** Before Add, the target/group/room/source context is
   identifiable. After accepted Add, a visible status names the one item and
   destination and its control reflects selection. Rejected actions never claim
   success. Feedback does not leak into another room.
4. **AC4: Save and money.** Use at least two unequal rooms and unequal item rates;
   assert that the active room and estimate totals change only for the target,
   other rooms retain their totals, and save/reload preserves exact selected
   identities and existing manual values. Unselected previews never serialize.
5. **AC5: Lifecycle and safety.** Preserve origin cleanup, persisted exclusion
   correction, current-Configuration checks, refresh/save locks, historical
   restrictions and Client/Designer behavior. Exercise stale/rejected Add,
   shared sources, room switching, and save/refetch without duplicate additions.
6. **AC6: Rendered usability.** Desktop 1440×900 and mobile 390×844 checks cover
   long names, many target siblings, paging, keyboard action/focus, popup
   open/close, visible feedback, and unobstructed Save controls. Verify accessible
   names/status announcements and no horizontal overflow.

After implementation: run focused catalogue/recommendation/builder/workspace
tests, shared and Client recommendation regressions when affected, frontend
typecheck and build, and rendered interaction/accessibility checks. Broaden the
frontend suite proportionately to shared changes. Backend changes, if evidence
unexpectedly requires them, must first be reconciled with this specification.
Record exact results and temporary artifact cleanup in the separate task plan.
Run `git diff --check` and status review; no lint script currently exists.

Implementation is authorized through the separately approved task plan and Mode A choice.
