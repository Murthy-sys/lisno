# Client estimate setup parity with Sales

Date: 2026-11-04
Status: Implemented and verified in Mode A. Existing full-suite failures and verification limits are documented in the approved task plan.
Classification: Substantial cross-stack change with permission, persistence, pricing-lineage and approval regression risk.

## Goal and interpretation

Allow a Client to configure the existing saved project estimate using the same selection sequence as Sales: property type such as 1BHK, rooms such as Kitchen and Bedroom, Main Baskets, then permitted Main Lines in each room. Keep the single estimation workspace and compact full-width layout delivered in the preceding task.

The user's latest request explicitly expands Client setup access. It supersedes the staff-only property/room/new-basket restriction in the approved [shared estimation specification](2026-11-03-shared-estimation-workspace-design.md), and the corresponding non-goal in the [Client approval-workspace specification](2026-11-03-client-estimation-approval-workspace-design.md). Their other visibility, financial, Designer-access and immutable-approval requirements continue to apply.

The confirmed approval sequence remains: Client saves changes, Sales confirms the pre-design version, then Client approves that exact submitted version. Post-design confirmation remains with the authorized Designer.

## Current behavior and evidence

| Area | Current code evidence | Gap |
| --- | --- | --- |
| Sales setup | `frontend/src/features/leads/LeadEstimateWorkspace.tsx` Configure view uses `PropertyTypeDropdown`, `RoomsMultiSelectDropdown`, `RoomDimensionsAccordion`, and `MainBasketSelectionCard`. | This selection step is absent from Client estimation. |
| Property and room choices | `propertyTypes.ts` offers 1BHK, 2BHK, 2.5BHK, 3BHK, 3.5BHK, 4BHK, Villa, Penthouse, Studio and Duplex. `estimateRoomOptions.ts` derives available rooms; Villa/Penthouse/Duplex require 1–50 bedrooms. Existing rooms remain available as Previously selected after a property-type change. | Client must use the same options and room rules, rather than a separate list. |
| Client editor | `frontend/src/features/client/ClientQuotation.tsx` receives saved rooms, lists existing project baskets and provides an Add quotation item dialog. `quotationApi.ts` exposes add, update and exclude_group operations. | Client can choose Main Lines only inside staff-selected rooms and Main Baskets; it cannot save property type, room structure or new basket selections. |
| Server scope | `backend/src/services/quotation.service.ts` restricts `visibleQuotationSources` to `estimate.selectedMainBasketIds`; save rejects unknown rooms and unselected baskets. `quotationPatchSchema` is strict and has no setup command. | A visual-only change cannot implement the requested behavior. Scoped backend commands are required. |
| Existing persistence | `backend/src/models/Estimate.ts` already stores `propertyType`, `bedroomCount`, `rooms`, `selectedMainBasketIds` and classifications. | Extend the existing estimate, not a separate Client estimate or Client-only copy. |
| Approval/version handling | Quotation save uses transactions, current Configuration checks, expected version, audit, superseding pending review and resetting staff confirmation. `estimatePhysicalScopeChanged` already includes property, bedrooms, rooms and selected baskets. | Setup changes must participate in these same transitions, including setup-only saves. |

No tests have been run at this specification-only stage. Existing dirty changes from earlier tasks are the baseline, not changes to revert.

## Scope and non-goals

In scope:

- Existing version-3 Client estimates, in both the dedicated estimation route and the embedded Client project workspace.
- Property type, conditional bedroom count, room selection and existing room-dimension inputs, eligible Main Basket selection, and room-scoped Main Line selection.
- Saved-state restoration, safe removal, save-and-return, error recovery, exact-version approval invalidation and cross-role refresh.
- Additive project-scoped API metadata and validated setup mutations; corresponding route-operation inventory, OpenAPI, frontend types and tests.

Not in scope:

- Creating a project or the first estimate before Sales has prepared one. Before that point, existing Client requirements entry stays available.
- Legacy workflow migration, new Designer permissions, changing staff approval stages, or letting a Client self-confirm a changed quotation.
- Private/internal lines, cost or margin editing, manual rates, tax overrides, pricing-mode policy, shared Configuration writes, basket classification changes, or other Sales administration controls.
- Changing the lead's CRM property metadata, master room definitions, existing published snapshots, approval history, issued artifacts or historical financial amounts.
- Native mobile app changes, backend startup repair, dependency additions, migrations, seeds, commits, pushes, deployments or external messages.

## Recommended approach

Extend the existing scoped quotation service and shared estimate presentation. Reuse the Sales setup controls with a Client-safe adapter, then continue into the existing room/basket/Main Line builder. The backend remains responsible for which options are available and which saves are allowed.

The staff estimate read/save API contains data and privileges outside Client scope, so it must not be reused as the Client transport. Duplicating the Sales workspace would also create divergent room rules and save behavior. Shared presentation plus scoped commands fits the established architecture.

## Product and UX requirements

### R1. Configure the saved estimate

- Provide an explicit Configure estimate entry from the Client builder. When line edits are pending, save successfully before entering setup, using the existing save-and-navigation behavior.
- Setup contains Project details (Property type, Number of bedrooms when applicable, Rooms), Room dimensions, and Main Baskets, in the same hierarchy and control style as Sales.
- Load actual saved selections. Never infer a missing saved property type from a label, use 1BHK as an automatic fallback, or overwrite saved rooms when loading options.
- Keep all current Sales property choices. Fixed BHK types determine the available bedroom options; Villa, Penthouse and Duplex validate a whole-number bedroom count from 1 to 50. Studio follows the current Sales rules.
- Changing property type or bedroom count updates available room choices. Existing selected rooms, stable IDs, labels, dimensions and items remain until explicitly removed, including rooms outside the newly generated choices.
- Selecting a new room creates a unique stable room ID. Labels/type IDs are not persistence join keys. Existing room IDs survive save, reload and Sales/Client navigation.

### R2. Select baskets and Main Lines

- List all project-accessible Main Baskets containing eligible Client-visible Configuration Main Lines, including baskets not yet selected in the estimate. Expose only safe names/IDs and Client-relevant selection information.
- Do not expose private costs, margins, internal counts, hidden Main Lines, hidden-only baskets or the unrestricted Sales catalogue.
- Continue to item selection saves valid setup, then opens the existing room builder. Main Lines appear under their Main Basket and Sub Basket, including direct-basket and temporary items where the current Client visibility and availability rules allow them.
- A selected basket makes eligible items available; it does not automatically include every Main Line or populate every room. Each chosen item belongs to the selected stable room ID.
- Existing item inclusion/removal, quantities, mandatory dimensions, configured tier and component choices remain available. Unit/rate/amount/pricing rules remain server-owned.
- Keep existing pricing-mode/classification policies for additions. A new basket defaults to the established standard classification; a Client cannot supply an internal classification or pricing mode.

### R3. Save, return and remove safely

- Offer Save changes and Continue to item selection from setup. A valid setup-only draft can be saved before any Main Line is selected; Continue requires at least one selected room and eligible basket.
- Failed validation, stale version, denied access and unknown save outcome preserve the local draft. Do not navigate as if a save succeeded or replay an uncertain operation without reconciliation.
- Removing a room or deselecting a nonempty basket presents the affected Client-visible scope and requires explicit confirmation. Search, pagination and collapsed sections must not reduce that scope.
- Only eligible Client-visible working lines may be excluded by a Client action. Preserve excluded line evidence and stable IDs for restoration where the established contract supports it. Do not rewrite published snapshots.
- A structural room/basket removal that would orphan or alter protected lines or existing dependent records is blocked with a generic request for team review. Do not disclose protected line names/counts. Existing Remove visible items remains available for the permitted scope without removing internal membership.
- Preserve unrepresented internal basket membership during setup saves; a filtered Client selection is never a replacement for the full staff estimate.
- Re-adding a room/basket or returning to item selection does not silently re-include removed siblings. Preserve unrelated rooms, included/excluded items and saved choices.

### R4. Workflow, data integrity and permissions

- Permit setup changes only for an authorized project Client when the current version-3 quotation is editable. Locked/approved final estimates and unauthorized identities stay read-only or inaccessible under existing rules.
- Setup and any related line exclusions commit atomically with expected-version checks. No split sequence may partially remove scope or leave lines attached to missing rooms.
- A meaningful setup change, even with unchanged totals, supersedes pending review, invalidates applicable staff confirmation, advances the appropriate estimate/priced/scope revisions and records the Client actor in the audit trail through existing services.
- No-op saves do not manufacture new versions or invalidate a valid review. Preserve idempotency/conflict behavior when a response is lost.
- Client sees Waiting for Sales confirmation after a pre-design save. Approval remains unavailable until a fresh, matching Sales-confirmed submitted version exists. Post-design saves retain Designer confirmation and existing scope/workflow rules.
- Configuration-owned values resolve from the latest saved draft revision, otherwise saved active revision, by stable Main Line ID. Validate current source identity, visibility, hierarchy, UOM and eligibility inside the save transaction with appropriate source fences.
- Keep integer paise, existing GST/rounding, overall totals including internal scope, and clearly labelled visible subtotals. No Client-submitted totals or rates are accepted.
- Sales must see the same saved property, rooms, baskets and lines when reopening/refetching. Refresh quotation, candidate, requirements, staff-estimate, review and workflow consumers through existing query/event mechanisms.

### R5. Responsive and accessible presentation

- Retain the app-wide compact, full-width layout. Reuse established spacing, typography and controls; add no new icon library, decorative effects or design system.
- Preserve one primary item area and the separate immutable submitted-review mode. Setup is a view within the same workspace, not a second estimate panel below it.
- Provide accessible names, keyboard selection, visible focus, confirmation focus return, mobile touch targets and readable validation messages.
- Cover loading, empty catalogue, no saved estimate, failed refresh, stale data, removed Configuration options, protected removal and locked states. A failed refresh cannot leave stale options actionable.

## Data/API design constraints

- Add safe saved setup metadata to quotation detail: property type, bedroom count, stable room identity/type/label/dimensions, Client-visible selected basket IDs and server-derived capability/block information. Preserve older read compatibility; missing metadata disables setup until a compatible fresh response is available.
- Provide a Client-safe project-scoped setup catalogue, preferably `GET /projects/:projectId/quotation/setup`, authorized through the canonical quotation-read policy. It supplies eligible basket choices without expanding the unrestricted staff catalogue route.
- Extend the existing quotation PATCH with a bounded, strict setup operation or equivalent atomic command. It identifies changed setup and explicit scoped removals; it must never accept a replacement arbitrary estimate, hidden line payload, rates, classifications or calculated totals.
- Prefer saving setup before entering the line builder so the existing selected-basket candidate endpoint remains authoritative. Do not issue persistent selection writes merely when displaying or searching options.
- Reuse existing Estimate fields where possible. Separate pure property/room rules from icon/UI code if sharing validation with the backend is necessary. Do not weaken validation to accept unknown room/property combinations.
- Synchronize runtime validation, OpenAPI, route-operation registry, frontend contracts and source/version handling. Maintain the established direct-Mongoose quotation transaction path; avoid an unrelated repository refactor.
- No mandatory backfill is expected. Older saved room IDs/labels and unsupported historical property values are retained as existing data, presented explicitly and never silently normalized into a different room.

## Permissions matrix

| Actor/state | Setup | Main Lines | Approval |
| --- | --- | --- | --- |
| Authorized Client, editable v3 | New allow-listed property/room/basket commands | Existing safe visible item commands | Only fresh exact staff-confirmed submitted round |
| Client, final quotation locked | Read-only | Read-only | Existing final state, no editing bypass |
| Other Client/unassigned identity | No access | No access | No access |
| Assigned Sales | Existing setup behavior | Existing staff behavior | Existing pre-design confirmation/publication |
| Authorized Designer | Existing primary/secondary and phase rules | Existing rules | Existing post-design confirmation/review |

## Assumptions and decisions

1. This request concerns the existing saved project estimate, consistent with the original shared-estimation request. First-estimate creation remains outside this change.
2. “Same like Sales” means the property/room/basket/item selection experience. Client rates, costs, hidden data and approval authority remain restricted.
3. Setup changes affect the working Estimate; they do not silently update separate lead/CRM metadata.
4. A property change never automatically deletes rooms. Explicit removal is limited by protected data/dependencies; staff review handles blocked structural removals.
5. No unresolved product choice blocks this proposed specification. Exact endpoint/command shape and migration-free compatibility details will be settled in the task plan after specification approval.

## Risks, mitigation and rollback

- Hidden-scope damage: merge bounded commands into the complete server-owned estimate; test hidden siblings and deny protected structural removals.
- Wrong-version approval: treat setup-only changes as real quotation changes and reuse immutable review/version transitions.
- Lost room identity or quantities: retain IDs and saved values, avoid joins by names, test two rooms with unequal quantities and retained out-of-type rooms.
- Configuration races: revalidate and fence source/visibility inside transactions; stale catalogue/versions fail without partial changes.
- Divergent Sales/Client UX: reuse controls and pure rules, with separate safe data adapters and regression coverage for staff consumers.
- Existing worktree risk: capture current dirty-path/per-target diffs before implementation and preserve all earlier estimation, layout and approval work.
- Rollback: stop exposing the additive Client setup entry/commands while retaining saved Estimate data. Do not roll back by deleting Client-selected rooms, approved history or already-saved scope. No live database or migration action is authorized by this specification.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required verification |
| --- | --- | --- |
| AC1 | Client can open Configure estimate and select the same property types and room choices as Sales. | Rendered controls for 1BHK, 2BHK, Studio, and variable-bedroom properties; shared-rule/validation tests. |
| AC2 | Saved property, bedrooms, stable rooms/dimensions and basket selections reopen correctly across Client and Sales. | Two unequal rooms; Client save and staff refetch; reload and dirty-navigation tests. |
| AC3 | Client can select a previously unselected eligible basket, then select permitted Main Lines in Kitchen/Bedroom. | New basket → save setup → room-scoped add → reopen; hidden-only/ineligible catalogue negative cases. |
| AC4 | Changing property type keeps existing room IDs/items; confirmed removals preserve protected/internal data and unrelated rooms. | Replica-set before/after assertions, protected dependencies, room/basket restoration and filtered/collapsed removal cases. |
| AC5 | Setup-only changes invalidate old review eligibility and require the appropriate staff confirmation. | Pre-design save → Sales confirmation → Client approval; post-design Designer gate; immutable review history and no-op cases. |
| AC6 | Versions, Configuration fences and transactions prevent stale, forged, duplicate or partial saves. | Replica-set concurrency tests, lost response, stale source, wrong project, unknown room/basket and read-only role matrix. |
| AC7 | Pricing and totals remain server-controlled; hidden scope and issued/submitted history remain unchanged. | Integer-paise/GST assertions, two unequal projects, rejected rate/margin/classification tampering, snapshot comparisons. |
| AC8 | Single-workspace UX remains compact, responsive and accessible. | 390/768/1440/1920px, 200% text, keyboard/focus, dialogs, axe and runtime/network checks with synthetic data. |
| AC9 | Existing Client editor/approval, Sales setup, Designer/legacy and design-review flows retain behavior. | Focused shared-consumer regressions; backend/frontend typecheck, tests and builds; baseline comparison for existing failures. |
| AC10 | No unrelated source/data changes or external actions occur. | Initial/final dirty diff, `git diff --check`, artifact cleanup and accurate handoff. No lint claim without a lint command. |

Implementation verification must use disposable replica-set tests for changed transactional paths, not the local demo/customer database. Physical-device and live-delivery checks must be labelled untested unless actually performed. The exact checks, file ownership and parallel boundaries belong in the separate task plan after this specification is approved.
