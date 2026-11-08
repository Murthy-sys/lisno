# Client and Designer item selection across all baskets

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal

Client and authorized Designer users can use **Add items** to browse all eligible
Main Baskets, their associated Sub Baskets and Main Lines, including baskets not
already selected in the estimate. Adding selects exactly the chosen item in the
current room. Designer revisions continue through the existing Client
approval/request-changes flow.

This extends the completed Designer editor-entry-point work. Its earlier approval
covered the existing configure-baskets path, not additions across unselected
baskets. Earlier Sales, Client action-layout and mandatory-kickoff changes remain
in place.

## Current behavior and evidence

- `ConfiguredEstimateBuilder.tsx:135` filters picker baskets by
  `selectedMainBasketIds`. `LeadEstimateWorkspace.tsx:923` also rejects additions
  outside that set. Both restrictions must change for the Designer path.
- `ClientQuotation.tsx:178,335` supplies saved estimate baskets to the picker.
  `quotation.service.ts:314` reads candidates through `visibleQuotationSources`
  with its selected-baskets default; `:396` rejects saves outside selected scope.
  Changing only the dropdown would leave candidates and persistence restricted.
- `quotation-setup.service.ts:43` already supports reading across all baskets with
  current Configuration resolution and Client-visibility checks. Its setup
  projection already supplies safe basket/sub-basket metadata. Reuse these rules.
- `EstimateItemPicker.tsx` labels its default filter “All selected baskets”.
  Its existing search, pagination, Add/Added states and keyboard handling can stay.
- `configuredEstimate.ts:385` refreshes existing draft rows by stable identity;
  it does not create every catalogue item. Preserve this single-item behavior.
- The existing Designer editor already saves the draft, refreshes publication
  eligibility and submits the returned version through the existing publication
  service. Client review uses exact review/version identities and comparison to
  the immutable initial approval. Request changes returns the revision to the
  editable workflow. No second publication or decision flow is needed.
- `ClientPublishedEstimate.tsx:184,187,200` uses Sales wording even for post-design
  review. Make these messages identify the Designer in the post-design flow.

## Requirements and UX

1. Both Add items pickers list all current eligible Main Baskets, not only those
   selected in the estimate. Use **All Main Baskets** as the default filter.
2. Selecting a Main Basket exposes its associated Sub Baskets. Results and search
   include its eligible Main Lines and the already-supported temporary items.
   Show each item's parent basket/sub-basket context. Retain pagination and reset
   dependent filters when the parent changes. Direct items remain accessible.
3. **Add** adds only that item to the active room, once. If its Main Basket is not
   selected, include the parent basket in draft scope as part of the same action.
   Do not select sibling lines, recommended lines, whole sub baskets or other rooms.
   Existing basket classifications stay unchanged; a new basket uses the existing
   standard classification default. Preserve the selected item's required pricing
   and dimension validation before save/publication.
4. Show the addition immediately in its correct group, with the existing Added
   state and accessible confirmation. No separate configure-and-save detour is
   required for this addition. Browsing/filtering alone makes no draft changes.
5. Save and reload retain the added item and its parent scope. Adding then undoing
   before save must not silently persist a new empty basket. Explicit prior setup
   selections remain intact.
6. Respect backend edit capability, primary-Designer ownership, project identity,
   historical-view restrictions, locks and existing reopening rules. Client users
   see only eligible Client-visible sources and metadata; hidden saved scope must
   neither leak through filters/search/counts nor be removed or modified.
7. Keep the established sequence: Designer edits, saves and sends the revised
   quotation; Client approves or requests changes on that submitted version.
   Saving alone does not publish. Client-authored edits retain their existing staff
   review requirement. Correct post-design review copy to refer to the Designer.
8. Preserve loading, empty, error, stale-source, duplicate-add and uncertain-save
   recovery behavior. Do not allow additions from stale/error results. Keep the
   compact current layout, keyboard focus behavior and mobile usability.

## Data/API approach and invariants

Extend the existing candidate read and versioned add operation instead of creating
a separate catalogue or approval system. Keep saved quotation basket/group data
distinct from available picker metadata so catalogue browsing does not manufacture
selected scope. Reuse the existing safe setup catalogue where practical; align API
types and OpenAPI if a response shape changes.

For Client saves, validate the chosen current source, its Client visibility, source
version/UOM/grouping and the actor's project authority inside the existing Mongo
transaction. Persist the newly required basket ID/classification and only the
requested line together under the current estimate version/CAS. A failed addition
must leave no partial basket or line write. Do not implement a two-request
configure-then-add sequence. Preserve group-operation conflict checks and duplicate
protection, including a group removal combined with an add in that same scope.

For Designer drafts, expand selected scope and create the exact chosen line through
the existing staff editor and save contract. Avoid stale-state races when adding
multiple items quickly. Existing Sales catalogue and recommendation behavior stays
unchanged unless a shared picker correction applies without changing its scope.

Use stable IDs and the latest saved Configuration draft revision, otherwise its
saved active revision, through existing resolvers. Never infer identity by name or
fall back to another line. Preserve integer-paise pricing, internal rows, approved
baseline amounts, immutable review snapshots, version checks, audit events and
existing publication/delivery behavior. No new automatic Client messages.

## Scope, assumptions and non-goals

- “All” means all current items the actor is eligible to browse under existing
  Configuration and visibility rules. It does not grant Client access to internal
  items or make incomplete pricing selectable.
- This covers the Client quotation picker and the authorized Designer staff editor,
  plus the connected Client review wording and regression verification.
- No redesign, new approval system, new role authority, pricing formula change,
  Configuration write, schema migration, backfill, dependency, deployment or commit.
- Use existing persistence fields. Rollback is a code revert; no data rewrite is
  planned. Audit/version progression remains the evidence of successful saves.

## Acceptance criteria and verification

- **AC1:** With only basket A selected, Client and Designer can find eligible
  basket B, its sub baskets and items through filtering and search. Filtering a
  basket cannot show unrelated sub baskets. Page/filter changes retain consistency.
- **AC2:** Add one B item to room 1, save and reload. Only that line is newly
  included; B's parent scope persists, while sibling lines, room 2 and another
  project stay unchanged. Repeat-add and add-then-undo behave correctly.
- **AC3:** Hidden/internal sources and metadata remain absent for Clients. Test
  asymmetric users/projects, stale source tokens, stale estimate versions and
  unauthorized/locked writes; failures produce no partial scope writes.
- **AC4:** Existing selected-basket additions, classifications, dimensions, group
  removal and recommendation behavior remain correct. Totals reconcile through
  existing server pricing with the unchanged approved baseline.
- **AC5:** A Designer addition/edit can be saved and submitted, reviewed by the
  Client against the initial approval, approved or returned with a change request,
  and revised again. Post-design copy names the Designer; initial review retains
  Sales wording. Existing review identity/locking protections remain intact.
- **AC6:** Focused rendered picker/Client/Designer tests and desktop/mobile checks
  cover filtering, one-item addition, hierarchy, focus, errors and no overflow.
  Run focused transactional quotation replica-set tests for changed persistence,
  relevant review regression tests, affected workspace typechecks/builds and
  `git diff --check`. Do not run unrelated full repository suites.

## Risks and open decisions

Primary risks are leaking Client-hidden metadata, selecting extra items, a basket
and line being saved separately, losing hidden scope, stale rapid additions, and
disturbing immutable approvals. Existing projection rules, atomic writes, stable
IDs and focused tests address these. No additional product decision is required.
