# Shared estimation workspace and saved basket editing

Date: 2026-11-03
Status: Approved and implemented in Mode A. Verification completed with the repository baseline failures documented in the task plan.
Risk: Substantial, with permission, financial-data disclosure, and concurrent-save implications.

## Goal

Give Sales, the project's authorized Designer, and the Client a consistent estimation experience that opens the saved estimate. Make it clear how to save, return to Main Basket selection, continue to room-based item selection such as Kitchen and Bedroom, and remove unnecessary Main Lines or Sub Baskets from the estimate.

Client changes must be limited to Configuration-approved visible items and permitted fields. Removing an item or basket from an estimate must never delete shared Configuration.

## Current behavior and evidence

The initial worktree was clean (`git status --short` returned no paths). Findings below come from current source inspection, not a running-browser reproduction.

| Area | Current evidence | Implication |
| --- | --- | --- |
| Saved staff estimate | `frontend/src/features/leads/LeadEstimateWorkspace.tsx:350` restores rooms, selected Main Baskets, classifications, lines, quantities and choices; saved lines open in the builder. | Extend this working flow; do not create separate estimates for each role. |
| Existing back navigation | `LeadEstimateWorkspace.tsx:1098` changes the view to `configure`, but is labelled “Back to [client name]” and does not save. The Save draft footer is only rendered outside Configure at line 1275. | The return path exists but is misleading, has no save-before-navigation guarantee, and cannot save setup directly. |
| Item removal | `ConfiguredEstimateBuilder.tsx` provides Add/Remove from estimate per line using `included`. Sub Basket headings currently only expand or collapse. | Preserve individual removal and add an explicit scoped bulk removal action. |
| Restoring exclusions | `configuredEstimate.ts:369` rebuilds available lines while retaining saved `included`, quantity, dimensions, selections and stable IDs. `LeadEstimateWorkspace.tsx:524` saves included or previously persisted lines. | Exclusions must survive navigation, catalogue refresh and reopening. Excluded saved rows can remain as reusable working data. |
| Designer access | `frontend/src/app/routeRegistry.ts:77` already admits Designers to the staff estimate route. `estimate-staff-read-scope.ts` and `estimate-collaboration-policy.service.ts` restrict it to the assigned Designer's post-phase estimate; version 3 additionally checks the primary Designer assignment. | Improve the entry point and consistency without granting every Designer commercial edit permission. |
| Client editor | `ClientProject.tsx:39` renders `ClientQuotation` for workflow version 3. `ClientQuotation.tsx` already saves allowed item additions, inclusion, quantities, dimensions, tiers and components, but uses a separate item-form layout. | Reuse its safe editing contract behind the shared presentation. |
| Client API | `backend/src/routes/quotation.ts` exposes scoped quotation detail, candidates, revision and PATCH operations. `quotation.service.ts` uses project membership, expected versions, current Configuration checks, transactions, repricing and audit. | Do not send the full staff payload to Clients or let a filtered client payload replace the full estimate. |
| Client grouping gap | `quotation.service.ts:82` returns rooms but its public lines/candidates lack the full Main Basket/Sub Basket grouping metadata needed by the staff-style layout. Candidates are restricted to the estimate's selected Main Baskets. | Add safe grouping metadata and retain project scope. |
| Configuration visibility | `KnowledgeOverviewPanel.tsx:174` exposes “Is this main line needed for the client?” backed by `clientVisible`. Quotation services check saved and current visibility. `KnowledgeEstimationVisibilityPanel.tsx` separately controls Internal/External selection in estimate requirements. | Use `clientVisible` for quotation display/editing; do not reinterpret the separate requirements setting. |
| Synchronization | `useQuotationRevision.ts` checks versions every four seconds while visible. Staff and Client forms preserve unsaved work on conflict. | Keep this behavior across the shared screen and save-and-return actions. |

Relevant existing regression coverage includes `LeadEstimateWorkspace.collaboration.test.tsx`, `LeadEstimateWorkspace.tiers.test.tsx`, `ConfiguredEstimateBuilder.test.tsx`, `ClientQuotation.test.tsx`, `backend/tests/quotation-edits.replica-set.test.ts`, `quotation-approvals.replica-set.test.ts`, and `client-quotation-projection.test.ts`.

## Scope and assumptions

1. This is the React web estimation screen, including use from a mobile browser. Native mobile application changes are out of scope.
2. “Same screen” means the same room navigation, basket hierarchy, item-selection layout and saved-estimate experience. Actions and sensitive fields remain governed by role and workflow.
3. “Designer” means the currently authorized project Designer. The primary Designer retains existing post-phase edit access. Authorized secondary Designers get the same presentation in read-only form under their existing safe quotation scope; unassigned Designers receive no access.
4. Client editing uses the existing version-3 quotation workflow. Older estimates retain their existing review, editing and approval rules; this work does not migrate them or enable new legacy Client mutation workflows. Saved staff estimates remain supported.
5. Sales and the authorized primary Designer can change estimate setup using existing permissions. Clients select rooms already saved by staff and edit visible items within the project's selected Main Baskets. Creating/deleting rooms, changing property type or expanding the project to previously unselected Main Baskets remains staff-owned.
6. A Client can remove all of their visible included items from a basket, but cannot remove hidden staff items through that action. The UI must describe this scope clearly.

Non-goals: redesigning Configuration, changing pricing formulas, expanding Designer assignment rules, altering approval stages, adding a new collaboration service, changing PDF/email publication behavior, adding dependencies, deleting master data, or deployment/data migration.

## Recommended approach

Reuse the staff builder's visual structure through shared presentation components and role-specific data/action adapters. Keep staff estimate reads/saves and the scoped Client quotation operations behind their existing authorization boundaries. Add only the grouping metadata and bounded commands needed by the shared interface.

An alternative is to rebuild the Client editor independently to match the staff screen. That reduces initial extraction work but duplicates navigation, removal behavior, responsive states and future fixes. Shared presentation is preferred. A shared unrestricted staff API is not an acceptable shortcut.

## Required experience

### Open the saved estimate

- Provide a clearly named Estimation entry from the Client project and the authorized Designer workspace. Retain existing Sales entry points and valid deep links.
- Open the current saved working estimate with its saved rooms, selected baskets, included/excluded lines, quantities, dimensions and configured choices. Do not silently start a new estimate or clear it while data loads.
- Use consistent Main Basket > Sub Basket > Main Line grouping and room selection for Kitchen, Bedroom and other saved rooms.
- Clients receive only safe visible rows and choices. Shared presentation must not require private costs, margins, vendor rates, internal recommendations or staff-only history.
- Summary and Proposal views remain available where the role is authorized. Client proposal/approval content uses the existing safe published review. Current working changes and the submitted quotation must be visibly distinguished.
- Expose existing read-only/locked states and reasons. An approved or historical snapshot stays immutable; saving and approval remain separate actions.

### Save and return to selection

- Replace the ambiguous in-estimate Back label with an explicit action: **Save and edit baskets** when there are unsaved editable changes, or **Edit baskets** when the current state is already saved.
- A dirty save-and-return action validates and saves first, then opens the Main Basket/setup view only after confirmed success. A failed save, conflict or unverifiable outcome keeps the user in the current view with their inputs preserved and a retry/reconciliation path.
- Provide **Save draft** in the staff setup view and **Continue to item selection** to reopen the room/item builder. Clients receive equivalent save/navigation controls for their permitted changes and a view of their permitted project baskets.
- Switching between these views preserves unsaved local changes, stable room IDs, selected/excluded items and values. Returning to item selection must not reset quantities, pricing choices, dimensions or unrelated rooms.
- A single save-and-return command cannot also submit, approve, unlock, publish or send email. Avoid duplicate saves when double-clicked; disable conflicting mutation/navigation controls during the transition.
- Keep an ordinary role-appropriate exit link separate from in-estimate navigation. When exiting with unsaved work, provide save, discard or stay choices using the established dialog pattern.

### Remove lines and baskets

- Keep **Remove from estimate** and **Add to estimate** for individual permitted lines.
- Add **Remove Sub Basket from this room**, which excludes its included permitted lines in the active room. Show the Sub Basket and room name in the accessible action/confirmation.
- Staff Main Basket deselection in setup excludes its lines across the estimate's rooms, using the existing recommendation-dependency rules. Show the affected scope before confirming a nonempty group removal.
- For Clients, a basket action is labelled as removal of visible items. It changes only eligible client-visible lines within the action's stated scope. Hidden lines, their inclusion, values and internal basket membership remain intact.
- Group removal covers the entire indicated scope, including rows outside the current search, collapsed sections or loaded candidate page. It must not silently operate only on currently rendered rows.
- Removal is an estimate exclusion, not master deletion. Saved line IDs and reusable values remain available for permitted re-addition. Removed items disappear from Selected and stop contributing to applicable item/basket subtotals after saving; available items may remain listed for re-addition.
- Saving, reopening, switching rooms, refreshing Configuration or toggling views must not automatically re-include excluded lines. Re-adding one line must not re-include every sibling in its Sub Basket.
- Removing a recommendation source retains the existing handling of dependent recommendations and separately selected items.
- Empty baskets/estimates have useful empty states. Staff can save an empty draft where the existing contract permits it; publication still requires a valid complete estimate. A Client removing all visible items can still see the authoritative total if hidden scope remains.

## Permission and data contract

| Actor | Read | Edit | Restrictions |
| --- | --- | --- | --- |
| Assigned Sales | Existing scoped full working estimate | Existing setup and line edits, removals and save | Existing workflow/assignment/version gates |
| Assigned primary Designer | Existing authorized estimate, with clear entry to the shared screen | Existing post-phase setup and line edits, removals and save | No earlier-phase or unrelated-project expansion |
| Authorized secondary Designer | Existing safe quotation scope in shared read-only presentation | None | Preserve existing phase and assignment restrictions |
| Project Client | Saved/current client-safe quotation and authorized published review | Visible line inclusion, quantity or required dimensions, configured tiers and components; scoped removal | No rate overrides, private costs, tax/margin edits, room structure edits, hidden lines or master-data writes |
| Other users | Existing authorization policy | Existing authorization policy | No new global role grants |

### Visibility and pricing

- Resolve current Configuration by stable Main Line ID, using latest saved draft revision when present, otherwise saved active revision, through the existing resolver.
- Apply the quotation's saved visibility restriction together with valid current Configuration visibility, consistent with the existing safe quotation policy. Missing or malformed visibility must not disclose a line. Client requests must be revalidated inside the write transaction.
- The Configuration Overview Yes/No setting governs this screen. The separate Design Internal/External requirement-picker setting keeps its existing meaning.
- Clients can edit only allow-listed commercial choices on eligible lines. Prices and totals are derived by the server; configuration or price-policy fields submitted by a Client are rejected.
- Maintain integer paise and existing GST/rounding rules. Keep the authoritative overall total, including hidden scope. Any visible-only subtotal is labelled accordingly and must not be presented as the full contract total.
- Persist only user-owned choices. Current Configuration remains authoritative for its names, UOM and pricing rules; incompatible changes produce a review state rather than an old-source fallback. Approved prices and issued artifacts remain immutable.

### API and persistence effects

- Extend scoped quotation DTOs with safe Main Basket/Sub Basket IDs, names and selection/grouping information; preserve `roomId`, line ID, Main Line ID, source revision/version and estimate version.
- Expose capabilities sufficient to render setup, item changes, save, publication and read-only actions correctly. Frontend flags are presentation only; backend services enforce every operation.
- Preserve existing quotation endpoints and staff save contracts. Clients continue sending bounded intent/patches, never a replacement full-estimate document or the staff save payload.
- Group removals must be atomic and version checked. The existing Client patch is limited to 100 operations; do not split a larger removal into several partially committing saves. Use a validated scoped group command or an equivalently atomic bounded server operation if the group exceeds the existing line-operation path.
- A group command must resolve actual estimate membership and current eligibility on the server. Preserve unrelated and hidden rows. A visibility/source or estimate-version race returns a safe conflict without partial persistence.
- Reuse persisted inclusion flags and selected basket data; no global deletion, new estimate copy, or mandatory backfill is expected. Do not persist navigation as commercial scope.
- Retain transactional pricing, project fencing, CAS, review supersession, approval invalidation and actor audit from the existing quotation save flow. Preserve immutable approval records and published snapshots.
- Keep canonical route operations, OpenAPI, frontend contracts and tests synchronized if any route/schema changes. Client data and catalogue caches must be scoped so a prior staff session cannot populate a Client screen with private data.

### Synchronization and failure states

- Invalidate affected estimate, quotation, Client, Designer, review and workflow queries through the established refresh mechanism. Include relevant candidate/group caches after selection changes.
- Continue existing bounded revision checking. Clean forms adopt newly saved data; dirty forms preserve input and show a conflict until explicitly reconciled.
- Handle initial loading, no estimate, no permitted items, catalogue unavailable, source changed, revoked access, validation failure, pending save, save failure and stale version distinctly. Never manufacture saved data or success.
- If a save commits but its response is lost, refresh and verify the outcome before repeating a mutation or navigating. Do not blindly retry an add/removal against a newer revision.
- Keep audit diagnostics limited to actor/action, stable identifiers, versions and scope. Do not log hidden customer content or credentials.

## UX and accessibility constraints

Reuse the existing estimation composition, typography, controls and responsive layout. This is a workflow consistency change, not a new visual theme. Avoid introducing the prohibited default styling patterns or new animation/decorative dependencies.

All selection and removal controls need keyboard access, visible focus and names identifying the target and room. Removal confirmation returns focus to a sensible surviving control. Save errors are announced, saving state is visible, and any existing motion respects reduced-motion preferences. At narrow widths, room selection, basket navigation and Save remain reachable without clipped controls.

## Acceptance criteria and verification

| ID | Observable outcome | Required verification |
| --- | --- | --- |
| AC1 | Sales, primary Designer and Client open the saved estimate in the same room/basket hierarchy, with appropriate actions; authorized secondary Designers have a read-only entry. | Route and rendered component checks for each role, reload and deep-link checks. |
| AC2 | Client rows and candidates follow Configuration's quotation visibility; forged hidden-line/private-field/group requests fail. | Backend API/replica-set tests with two unequal projects, visible and hidden siblings, foreign IDs, revoked assignment and a visibility change during editing. Inspect returned payloads as well as UI. |
| AC3 | Save and edit baskets saves exactly once before moving; failed, stale and uncertain saves preserve inputs and do not navigate as successful. | Rendered interaction tests for success, validation, rejection, lost response and double-click. |
| AC4 | Setup saves and returning to Kitchen/Bedroom retain saved selections, dimensions, quantities, modes and unrelated room data. | Save/reopen tests with at least two rooms and differently priced lines. |
| AC5 | Individual and Sub Basket removal persist, affect only their stated room/scope, and support re-adding one line. | State and API tests plus rendered removal/re-addition checks; repeat with search/collapse active. |
| AC6 | Main Basket deselection removes staff scope correctly; Client group removal preserves hidden rows and does not change Configuration. | Full persisted before/after comparisons, recommendation-source coverage, all-visible-items-removed and mixed-visibility cases. |
| AC7 | Large group changes are atomic; no partially saved group is possible at the existing operation-count limit. | Replica-set boundary tests at and above 100 affected lines, including a failing member/source race. |
| AC8 | Rates/totals remain server-controlled and exact; hidden scope remains in the overall total with correctly labelled visible subtotals. | Paise/GST assertions across two asymmetric projects, manual-rate and component-priced cases, and client tampering tests. |
| AC9 | Saving remains separate from approval/publication; locks, snapshots, old workflow behavior and authorized revision history remain intact. | Existing quotation approval/review/revision regressions and legacy compatibility cases. Assert no save-triggered external delivery. |
| AC10 | Another role's save refreshes a clean workspace without overwriting dirty work or exposing role-inappropriate cached data. | Multi-session revision tests, login/role transition tests and conflict recovery. |
| AC11 | Loading, empty, failure and read-only states work with keyboard and at narrow widths. | Browser interaction/accessibility checks at approximately 390px, 768px and 1440px, console/network inspection with synthetic fixtures. |

Implementation verification will start with focused frontend/backend regressions, then backend and frontend typecheck, complete test suites and builds because this touches shared presentation and Client contracts. Transactional changes require replica-set tests. Run `git diff --check` and `git status --short`. There is no repository lint script. OCR tests are not relevant unless scope later changes. Test commands and results belong in the eventual task plan/handoff; none have been run for this documentation-only stage.

## Risks, compatibility and rollback

- The staff builder contains privileged controls/data assumptions. Shared components must consume an explicit safe presentation model and capabilities; passing the staff DTO to Clients would be a disclosure bug.
- A group containing hidden rows must never be removed wholesale on a Client's behalf. Tests must compare hidden persisted content, not just visible output.
- Client and staff forms can save concurrently. Preserve transactional CAS and source fencing rather than implementing last-write-wins behavior.
- Extracting shared UI can regress staff hydration and late-save handling. Keep the existing fixtures and add focused navigation/group cases.
- Backend changes should be additive and compatible with existing consumers, including native mobile. Deploying or changing a live service is outside this specification's authority.
- No data migration/backfill is proposed. Code rollback must leave valid saved inclusion changes and audit history readable by the prior application; never erase user saves as rollback.

## Open decisions and approval boundary

No additional product choice blocks this specification. The assumptions to approve are: use the existing Configuration Overview client-visibility rule, preserve primary/secondary Designer edit distinctions and existing workflow gates, and keep Client room/project basket setup within its current staff-defined scope. A request for Client-created rooms, newly selected project Main Baskets, broader Designer permissions or legacy workflow migration would require an explicit specification update.

Only this specification is created at this stage. Repository `AGENTS.md` requires specification approval, then a separate approved task plan, then execution-mode selection before implementation. No code changes, commits, migrations, external messages or deployment are authorized by this document alone.
