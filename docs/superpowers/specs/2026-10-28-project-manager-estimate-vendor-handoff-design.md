# Project Manager read-only estimates and Main Line vendor suggestions

Date: 2026-10-28
Revised: 2026-10-29, following the user’s explicit Main Line requirement
Status: Approved on 2026-10-29; local implementation, temporary-item follow-up and scoped verification finished. The separately authorized local `lisno_demo` index preparation is complete, with backup/restore and unchanged-document evidence in the task plan. Remote deployment remains outside scope. Full-suite baseline failures and concurrency limits are documented in the task plan.
Scope: Project Manager / Site Manager project workspace and its connection to Procurement
Classification: Substantial, with authorization and approved financial-source risks

## Goal

Follow-up decision, 2026-10-29: after diagnosis of local readiness blockers, the user requested the required changes and explicitly selected **Allow suggestions for approved temporary items**. Eligible included Configuration-backed temporary items now use their existing stable Main Line/item ID and approved source scope for recommendations. Preserve their temporary classification and immutable approvals; do not convert them or reprice approved rows. Current Configuration must resolve the same item type, parent mapping and UOM. Missing unconfigured Design placeholders are empty rules, while malformed configured rules remain unavailable. This continues the approved Mode A implementation and does not authorize remote/production changes.

After opening an assigned project, the Project Manager can choose **View estimations**, read that project's approved estimate, and suggest saved vendors **for a specific Main Line**. Procurement sees the same Main Line, vendor, author and note in the corresponding Main Basket bid-request workflow and decides whom to invite. The Project Manager can follow actual request/bid activity with that Main Line context.

Required journey: **Open project → View estimations (read only) → choose Main Line → Suggest vendor → Procurement reviews the Main Line suggestion → Procurement sends the bid request.** A saved suggestion alone does not mean a bid request was sent.

User request: “he can see estimated screen as readonly and he can suggest vendors to the procurement screen to send bid request,” with a button available after opening a project. Clarification on 2026-10-29: “program maager can see estimates and he can suggest vendor for main line.” Here, “program manager” is understood as the Project Manager / Site Manager screen already under discussion, using canonical role `site_manager`; no separate role is introduced.

## Current behavior and evidence

These findings describe the pre-implementation worktree checked on 2026-10-29, after the completed dashboard and project-detail visual redesigns. Implementation and verification evidence are recorded in the [approved task plan](../plans/2026-10-29-project-manager-estimate-vendor-handoff.md).

| Area | Evidence | Consequence |
| --- | --- | --- |
| Project entry | `frontend/src/features/project-manager/ProjectManagerWorkspace.tsx`, `ProjectManagerProjectPage`, serves `/projects/:projectId/execution`; the header has My KPI and Open full detail. | Add the estimate entry to this project header, preserving project tabs and return navigation. |
| Role and assignment | The canonical role is `site_manager`, displayed as Project Manager. `backend/src/services/project-manager/common.ts`, `requirePMProject`, rechecks the active user and canonical assignment; mutation checks fence assignment changes. | New reads and writes must use the same assignment authority. A matching project URL or frontend permission is insufficient. |
| Approved estimate | `backend/src/services/project-manager/sources.ts`, `readPMSources`, resolves immutable approved rounds with `approvedProcurementSnapshotFromRows` from `procurement.service.ts`. Missing, ambiguous, or unverified lineage is explicit. | The viewer must agree with the PM approved-value baseline. It must not select a draft or an arbitrary estimate by name. |
| Multiple estimation phases | `approvedProcurementSnapshotFromRows` selects approved final or approved pre-estimate for collaborative estimation. Procurement preparation can resolve a different frozen preparation source. Collaborative sources can legitimately have `designPlanVersion: 0`. | Label the displayed phase. Approved viewing and current Procurement preparation are distinct concepts; validate their linkage explicitly. |
| Existing estimate screens | `EstimateReviewPanel.tsx` loads approval queues and includes assignment/decision workflows. `ClientPublishedEstimate.tsx` couples snapshot rendering with client decisions. | Do not grant PM approval-queue access or mount a decision component with merely hidden buttons. Reuse safe rendering helpers where useful. |
| Existing suggestions | `project-vendor-suggestions.service.ts`, its route/domain/model files, and `ProjectVendorSuggestionsPanel.tsx` persist project/source/vendor identity, actors, notes, CAS versions, idempotency and transactional audit. Creation/update is Admin-only; the DTO/model have no Main Line target. | Reuse this source of truth, but add explicit line scope and an assignment-scoped PM surface. A project-wide note is insufficient. |
| Existing uniqueness | `ProjectVendorSuggestion.ts` has a unique project/estimate/version/Design/vendor index, which excludes Main Line identity. | Two recommendations for the same vendor on different Main Lines currently conflict. A reviewed index transition is required before enabling scoped writes; changing only the UI cannot satisfy the request. |
| Procurement line identity | `ProcurementBasketLine` and stored tender BOQ lines carry `sourceLineItemKey`, `mainLineId`, room identity and basket context. | Join suggestions to stable Main Line IDs and exact approved source-line keys, never names or vendor classification alone. |
| Legacy assumptions | Suggestion create validation/model currently require positive Design version; project discovery filters approved Design. Its reader guard admits Admin, Procurement, and Super Admin, not PM. | Reusing the feature requires deliberate phase/authorization handling, not just enabling a frontend button. |
| Existing suggestion consumer | `ProcurementSuggestedVendors.tsx` is mounted by `ProcurementVendorField.tsx` for item vendor selection. | That consumer alone does not complete the requested bid-request handoff. |
| Current bid screen | `ProcurementBasketEnquiry.tsx`, `BasketVendorPicker`, selects vendors and invokes initial dispatch or invitation batches. `procurement-basket-vendor-eligibility.service.ts` checks classification, effective activation, KPI, and contact readiness. | Surface recommendations here and preserve backend eligibility and dispatch checks. |
| Actual tracking records | `ProcurementBasketTender.ts` stores enquiry, immutable BOQ revision, invitation generations and delivery state, and bid records with project/basket/vendor IDs. | Project Manager tracking can read actual activity without introducing editable tracking flags. |

## Assumptions and decisions

1. “Estimations” means the approved commercial scope and amounts for the opened project. The default is the final approved estimate, or the approved pre-estimate if final approval does not exist. Unapproved drafts and internal costing/margin workspaces are outside this request.
2. Suggestions use existing saved, effectively active vendors. Creating a new vendor, completing onboarding, classifying a vendor, and changing KPI remain existing authorized workflows.
3. Each new PM recommendation targets one stable **Main Line ID** within the exact approved project source. If the same Main Line appears in multiple rooms, the recommendation covers that Main Line in the project and explicitly lists its included approved source-line keys/rooms. It never applies to another Main Line just because both share a Main Basket. A room-specific recommendation workflow is not requested.
4. The same vendor may be recommended separately for two different Main Lines; each has its own note, status, ownership and history. Several vendors may be suggested for one Main Line. Duplicate detection applies to the same project/source/Main Line/vendor, not to the vendor across the entire project. Existing project-wide Admin suggestions remain labelled project-wide and are not silently converted to line-specific ones.
5. Procurement retains explicit selection and invitation authority. Suggesting or viewing a vendor never sends a message, creates a bid, approves a vendor, or awards work.
6. The current PM can view project suggestion history but may edit/withdraw/reinstate only their own suggestions. Existing Admin authority remains unchanged. Duplicate vendor/source records are not silently taken over by a different author.

### Recommended integration

Extend the existing suggestion records with explicit Main Line scope, add assignment-scoped PM APIs, annotate the actual Procurement vendor picker with the recommended Main Lines, and derive **Bid activity for this Main Line and vendor** from persisted enquiries, revisions, invitations and bids. The UI change must include the backend linkage and source checks.

An alternative is to keep one project/vendor suggestion record with a mutable list of Main Line IDs. That couples unrelated line withdrawals, notes and author ownership to one record and makes concurrent updates harder to explain. Separate scoped records in the existing collection are recommended, with a controlled unique-index transition. No second recommendation collection is planned.

This gives an actual connection without a second state machine. Activity is a factual relationship by project, approved source, Main Line and covered source-line keys, basket, and vendor; it does not claim that a particular suggestion caused a Procurement action. An invitation that predates the suggestion must be clearly dated and described as already existing.

An alternative is to record an immutable suggestion-to-invitation attribution at dispatch. That requires extending every dispatch/retry/batch contract and defining attribution for Admin/PM duplicates and “select all.” It is unnecessary for the requested visibility and is outside this specification. If causal attribution becomes required, it needs its own explicit contract rather than an inference from timing.

## Product and UX requirements

### 1. View estimations entry

- Add a clearly labelled **View estimations** action in the opened project header, alongside existing project actions. It must work for the canonical Project Manager role on desktop and mobile.
- Open a dedicated project-scoped page, proposed route `/projects/:projectId/estimations`, within the existing app shell. Preserve the validated project return path, selected project tab, and dashboard filters when returning.
- The header shows project name, a **Read only** label, estimate phase, approved version, and approval date when available. Show **Approved pre-estimate** explicitly if that is the available baseline; never label it final.
- Present approved scope grouped by room and Main Basket, with item/specification, saved dimensions where present, quantity, UOM, approved unit rate where applicable, and approved line amount. Show included/excluded scope clearly without treating excluded lines as payable.
- Show approved subtotal, GST, and total separately. Use backend integer-paise values or explicitly normalized historical rupee values. Null/unavailable amounts are not zero.
- Reuse the estimate visual language and safe presentation utilities. Do not duplicate the full Sales editor, load broad review queues, or expose edit, publish, approve, reprice, designer assignment, margin, or configuration actions.
- Do not expose internal component cost breakdowns, supplier terms, private documents, invitation links, or credentials through a raw estimate/model response. The backend returns an allowlisted read model.
- An unavailable or ambiguous source produces an explanatory empty/error state and retry where appropriate. The page must not substitute the latest draft or another project's estimate. The entry remains discoverable so the user can understand the unavailable state.

### 2. Suggest vendors

- Each included Main Line group in the read-only estimate has a **Suggest vendor** action and a compact suggestion count/status. Open a form showing the selected Main Line, matching approved rooms/scope and source version before vendor selection. A project-level shortcut may exist only if it requires explicit Main Line selection before saving. Keep the suggestion form separate from the read-only commercial content.
- Include a **Vendor suggestions** section grouped or filterable by Main Line. Allow multiple saved vendors per Main Line and independent suggestions for the same vendor across different Main Lines.
- Also make the same Main Line suggestion section discoverable in the existing PM Procurement tab. Both entry points use the same API, records and project/source/Main Line-aware query keys. Preserve compact cards: short summaries initially, longer notes on demand.
- Search the saved vendor directory through a project/Main Line-scoped, paginated lookup returning only stable vendor ID, name/code, relevant classification and safe availability/eligibility labels. Resolve the Main Line’s basket context on the backend before evaluating candidates. Do not grant broad vendor-directory/master access to PM.
- Display the selected Main Line, included room occurrences and current approved-source context before saving. Allow an optional note explaining suitability. The save button is **Suggest to Procurement**; confirmation means the recommendation was persisted and is visible to Procurement, not that an invitation was sent.
- Require effective vendor activation at save, as the existing suggestion workflow does. Lack of bid-readiness such as contact or basket eligibility is shown explicitly; a suggestion cannot bypass it.
- List Main Line, room/scope context, vendor, author, note, creation/update time, current/previous source, and suggested/withdrawn status. Retain history when the approved source changes. Old-source suggestions are not automatically carried forward as current recommendations.
- Show an existing duplicate for the same project/source/Main Line/vendor with its author. A suggestion for another Main Line, or a legacy project-wide suggestion, must not take over or block this line-specific record. Only an authorized owner can modify it; otherwise explain why editing is unavailable. Withdrawn owned suggestions can be reinstated subject to current source and vendor checks.
- If no verified approved source exists, estimate availability remains readable but suggestion creation is unavailable with the reason. For a legacy/unmapped item without a verifiable stable Main Line ID, continue showing its approved scope/amounts, but disable Suggest vendor with a mapping explanation. Do not derive identity from its display name. Excluded lines are not selectable recommendation targets.

### 3. Procurement handoff

- In the current Main Basket bid-request vendor picker, show current recommendations with the **specific Main Line**, relevant room/scope context, author and note. Identify the recommended Main Lines inside each vendor candidate row. A Main Line filter should let Procurement review the suggestions for that work. Deduplicate the vendor selection itself when the vendor is recommended for several lines in the same basket; keep the recommendation identities separate.
- Recommendations must be discoverable across the whole result set, not only when their vendor happens to occur on the first directory page. Provide a paginated recommendations view/filter or equivalent server-supported discovery.
- Resolve the selected Main Line’s basket and approved source-line membership on the backend, then use the established eligibility service for vendor basket fit and invitation eligibility. Display unavailable recommendations with a safe reason where relevant; do not inject them into the eligible count or enable selection.
- Match exact approved source lineage. If the active Procurement preparation source differs, label the recommendation's source and require the existing source reconciliation/current-source checks before treating it as actionable. Do not silently associate a recommendation with an unrelated preparation snapshot.
- Existing bid requests operate at Main Basket/BOQ scope. Keep this dispatch contract; clearly show that the vendor was suggested for named Main Lines and that the invitation covers the actual selected basket BOQ, which may contain other lines. Do not imply a line-only invitation or automatically rewrite the BOQ.
- Eligible recommended vendors enter the same explicit selection set as any other eligible vendor. Preserve select-all, exclusions, pagination, invitation previews, update reasons, and existing deduplication/idempotency semantics.
- Saving a recommendation does not preselect a vendor or automatically send mail. The existing Procurement send controls remain the only dispatch path.
- A recommendations-load failure must be visible and retryable. It need not disable independent existing directory selection if vendor eligibility and dispatch source are still verified.

### 4. Actual tracking in the PM screen

- Each suggestion can show **Bid activity for this Main Line and vendor**, grouped by Main Basket and BOQ revision as needed. Match the immutable BOQ revision’s `mainLineId` and `sourceLineItemKey` values against the recommendation’s approved line scope. A basket invitation that does not include any of those lines is not activity for this recommendation. If the request includes only some room occurrences, identify the covered scope rather than claiming the entire Main Line was requested.
- Derive state from persisted records: no matching request, delivery pending, email sent, delivery failed/stalled, expired, revoked/superseded, and bid received. A missing or failed activity query is **Unavailable**, not **Not invited**.
- Read bid records/receipt linkage before claiming a bid was received. Distinguish “Basket bid received” from a bid response on a specific line; only claim line-level response when the persisted response includes the matching BOQ line. Do not infer line participation from basket membership alone. Keep historical receipt distinct from the latest request's delivery state, for example “Bid received; updated request pending.”
- Expose safe timestamps and project-local context. PM does not receive invitation tokens, recipient hashes, public bid URLs, confidential bid prices, commercial comparison data, or sending/retry actions through this projection.
- Join by project ID, Main Line ID, approved source-line keys, vendor ID, exact estimate source, enquiry ID, BOQ revision ID, and Main Basket ID. Source reconciliations may relate retained bids only when the existing persisted reconciliation establishes that relationship. Never infer it from matching labels or approximate amounts.
- Older-source activity remains labelled historical and must not imply that the current approved scope has been invited. Withdrawal of a suggestion does not cancel a genuine invitation or erase activity.

## Backend and API boundaries

### Proposed scoped surface

Add project-scoped PM operations under `/projects/:projectId/pm/` for:

- `GET estimate`: the allowlisted approved estimate read model, source metadata, and availability reasons.
- `GET vendor-suggestion-candidates`: safe paginated lookup requiring a selected approved-source Main Line in the assigned project.
- `GET vendor-suggestions`: current/history suggestions, filterable by Main Line, with a paginated or bounded activity projection and explicit legacy project-wide scope.
- `POST vendor-suggestions`: persist a recommendation against the expected approved source and required stable Main Line ID. The backend derives and validates Main Basket, included source-line keys and scope metadata.
- `PATCH vendor-suggestions/:suggestionId`: owned note/status changes with expected version. Project, source, Main Line and vendor identity are immutable; moving a suggestion to another line requires a separate record.

The final field definitions belong in the approved task plan/implementation contract. Required identity fields include project ID, estimate ID/version, approved review-round ID, phase, valid Design version when applicable, Main Line ID, and the backend-validated included source-line keys and Main Basket context. The client must submit the expected review-round identity, not just a version number. Backend source validation and fencing are authoritative.

Reuse the existing suggestion service/model through an explicit actor policy or shared domain helpers. Do not broaden `requireProcurementVendorReader` globally merely to admit PM. New route operations and frontend permissions must be registered and documented in the canonical registry/OpenAPI inventory.

The existing Procurement recommendation read path can gain additive, bounded Main Line metadata/filtering to support the basket picker. Preserve existing Admin and Procurement consumers and their response compatibility. Legacy project-wide consumers must not flatten line-specific records into unrestricted project-wide endorsements; keep their existing project-wide records separate or render the scope explicitly.

### Permission matrix

| Actor | Approved estimate in PM surface | Read project suggestions/activity | Suggest | Edit/withdraw | Send bid requests |
| --- | --- | --- | --- | --- | --- |
| Active, assigned Project Manager (`site_manager`) | Yes, assigned project | Yes, assigned project | Yes, verified current source | Own suggestions only, current authority rechecked | No |
| Unassigned/reassigned/inactive PM | No | No | No | No | No |
| Admin | Existing estimate authority unchanged | Existing granted-project suggestion access | Existing behavior | Existing behavior | No new authority |
| Procurement | Existing estimate/workspace authority unchanged | Existing access plus basket recommendation context | No new suggestion write authority | No new suggestion write authority | Existing eligible workflow only |
| Super Admin | Existing operation-specific read authority | Existing operation-specific read authority | No new personal action | No new personal action | No new authority |
| Client/vendor/other roles | No new PM access | No new access | No | No | No new authority |

Every PM read rechecks active identity and assignment. Mutations check project ownership, suggestion ownership, current source, selected Main Line/source-line membership, vendor activation, CAS version and idempotency within the transaction. Use the established authorization/source fences so reassignment, source change and deactivation races cannot leave a stale write committed.

## Source, state, compatibility, and failure handling

- Approved commercial values are immutable. This work changes no pricing formula, approval, Configuration resolution, procurement budget, or KPI computation.
- Reuse the PM approved-source resolver for both viewer and recommendation source validation. Where it is currently coupled to execution projection, extract a shared read helper rather than resolving the source differently in each screen.
- Support collaborative approved-pre/final phases and legacy approved Design explicitly. Do not manufacture Design version 1 to satisfy the older suggestion schema: allow the canonical zero/no-approved-Design representation only for verified collaborative sources, with corresponding DTO and validation compatibility.
- Current suggestions require an immutable approved review round. Existing historical null-round records remain intact and are not promoted to verified current recommendations.
- Extend record identity with immutable scope (`project` for existing Admin records, `main_line` for new PM records), Main Line ID and validated source-line context. Keep creator idempotency, immutable source and audit history. New uniqueness is project/source/Main Line/vendor; legacy project-wide duplicates retain their current semantics. A duplicate on the same line returns the existing/conflict state, while the same vendor on another line is allowed. Request hashes include the Main Line so the same key cannot be replayed against different work.
- Existing records missing Main Line fields remain project-wide. Never infer their target from vendor classification or note text. The new writes remain unavailable until the required indexes are verified ready.
- Preserve Admin's legacy create contract while introducing stricter expected source identity for new PM commands. Any shared validation changes must be additive and covered for both consumers.
- Suggestion status remains `suggested` or `withdrawn`. Previous-source/current-source and bid activity are backend-derived read states, not new mutable statuses maintained by the browser.
- Use the existing audit trail for create/update/withdraw/reinstate. Record actor, project, source, Main Line and covered source keys, suggestion ID and versions. No recommendation action emits external mail.
- Source/version conflicts return a refresh-and-review message and preserve the user's unsaved note where safe. Never silently retry against a new estimate or overwrite another author's changes.
- Use actor/project/source/Main Line-aware query keys, invalidate suggestion and basket recommendation queries after changes, and refresh activity after Procurement dispatch/retry. Cross-session updates use the established polling/refresh conventions. Abort or discard responses on project/actor changes.
- Loading, empty, unavailable-source, permission-denied, stale-data, conflict, and offline/error states are required. A 401/403/404 after cached success must remove protected content. Stale recommendations cannot enable writes without a current verified source.
- Keep lookup/activity pages bounded and avoid per-row unbounded history scans. Joins must not leak unrelated projects, vendors, revisions or bid details.

## Visual and interaction constraints

Preserve the approved warm ivory/olive dashboard and project shell. Use existing typography, compact controls and restrained separators; no new icon library or decorative effects. The estimate should be readable at desktop, tablet and 320–390px mobile widths. Long specifications, vendor names and notes must wrap without page overflow.

Use semantic headings/tables or accessible responsive rows, explicit control labels, keyboard-operable disclosure/search/pagination, visible focus, sensible navigation focus, status announcements, and accessible explanation of disabled actions. Respect reduced motion and provide clear text loading states.

## Scope exclusions

- No PM estimate editing, repricing, approvals, publication, Configuration writes, vendor master creation, KPI changes, invitation sending, bid negotiation, award or order issuance.
- No new automatic emails, notifications, purchase requests, vendor onboarding, or client communications.
- No full estimate revision-comparison/history editor, new PDF export, confidential bid-price viewer, or causal conversion analytics.
- No change to current assignment rules, broader project visibility, unrelated dashboard design, existing Admin grants, or Procurement dispatch safety rules.
- No deployment, seed, production mutation, commit, push, or live migration is authorized by this specification.

## Migration, rollback, and preserved work

The existing unique index excludes Main Line identity, so a controlled index transition is required; the earlier project-wide proposal's “reuse indexes unchanged” assumption no longer applies. Prepare an idempotent migration/preflight that inventories existing records/indexes, reports collisions without deleting or merging records, and proves the new scope-aware uniqueness with two Main Lines sharing one vendor. Existing records remain readable as project-wide without guessing or rewriting their intended scope.

The task plan must define the exact compatible index sequence, write gating and rollback. Build/validate the new uniqueness protection before retiring the old conflicting index, with writes fenced during cutover where required. Preserve current legacy project-wide uniqueness and the creator/idempotency index. Do not invoke `syncIndexes`, drop indexes, or execute a live migration as an incidental model startup or test step. Production execution requires explicit authorization of the concrete target after backup/rollback, a clean final dry run, collision reporting and recovery evidence. Spec/plan approval authorizes preparation and isolated replica-set verification, not a live database change.

Rollback first disables new writes and retains readers for scoped and valid zero-Design-version records. Restoring the old global uniqueness may be impossible once one vendor has recommendations on two Main Lines, so never restore that index blindly or delete records to make it pass. Preserve all suggestions/audits, approvals, invitations and bids. The implementation must fail closed with a useful availability reason if the deployment's index readiness is incomplete.

Preserve the current dirty dashboard and project-detail changes, their tests/fixtures/styles and design documents, including `PMShared.tsx`, the new project-detail stylesheet and `PMShared.test.tsx`. Capture a fresh exact dirty-path/per-target baseline at implementation time. This revision changes only this pending specification; no task plan, application code or database operation is part of this stage.

## Acceptance criteria and verification evidence required

1. **Project entry:** An assigned PM opens a project, chooses View estimations, sees the correct project/source and returns with context preserved. Verify route, keyboard and responsive interaction.
2. **Read-only and lineage:** Approved final/pre/legacy cases show exact saved scope and totals. Draft changes do not alter displayed approval values. Missing/ambiguous approval and null money remain explicit. Verify two unequal projects and direct API requests.
3. **Authorization:** Unassigned, inactive, reassigned and wrong-role actors cannot read or mutate the new surface. PM cannot access estimate-edit, vendor-master, invitation-send or bid-price actions. Test direct APIs and cache transitions, not only hidden controls.
4. **Persisted Main Line recommendation:** From an approved Main Line, save a vendor/note, reload, and see the exact same project/source/Main Line/scope/vendor/author/version in PM and Procurement. Test one vendor on two different Main Lines, several vendors on one line, repeated room occurrences, same-line duplicates/idempotency, own/other-author edits, withdrawal/reinstatement and old-source history. Missing line IDs and excluded scope cannot be suggested by guessed names.
5. **Actual Procurement connection:** The recommended vendor appears with the correct Main Line in the corresponding basket bid picker even beyond the first directory page. Another Main Line in the same basket must not inherit that recommendation. The existing basket/BOQ request scope is explicit, vendor selection is deduplicated across recommendations, and suggestion creation alone causes no email or invitation write.
6. **Eligibility and concurrency:** Inactive/unrated/unclassified/contact-missing vendors and stale BOQ/Configuration/source states cannot bypass existing invitation gates. Test source change, reassignment, vendor deactivation and competing edits with replica-set transactions.
7. **Actual tracking:** Persisted failed/pending/sent/expired/superseded invitations and actual bids produce accurate PM activity. Test earlier invitations, multiple Main Lines in one basket, requests omitting the recommended line, partial room coverage, multiple baskets/generations, source revisions/reconciliation and two projects sharing a vendor. No other-project activity or confidential fields may appear.
8. **Compatibility and index readiness:** Existing Admin project-wide suggestions, Procurement ordinary selection/select-all/retry/batch behavior, PM execution tabs, approved finance values and approvals retain their behavior. Replica-set tests prove scope-aware uniqueness, migration dry-run/idempotency/conflict reporting and fail-closed write readiness without altering unrelated records. Existing project-wide recommendations are never silently assigned to a Main Line.
9. **Rendered quality:** Exercise desktop/tablet/mobile, long data, empty/error/stale/denied states, keyboard focus and accessible names. Inspect browser console/network and capture local QA evidence with synthetic data.

Verification should include focused backend PM-source/suggestion/authorization/route/OpenAPI tests; replica-set tests for suggestion mutations and races; Procurement basket eligibility/dispatch regression tests; frontend PM route/viewer/suggestion and basket tests; both workspace typechecks/builds; and `git diff --check`. Broaden tests after focused checks according to changed shared contracts. There is no repository lint script. Report any baseline failures separately from new failures.

## Open decisions and approval boundary

No additional product answer is required to prepare the plan. Approval accepts approved estimates only, saved vendors, explicit Main Line suggestions, grouping repeated room occurrences of the same Main Line within the approved source, own-record PM editing, existing basket-level dispatch, and factual activity tracking without claiming causal attribution.

This is the revised specification gate for the previously pending requirement, now corrected to Main Line scope. The dashboard and project-detail visual redesign approvals and Mode A selections applied to those completed scopes. After this specification is approved, create the separate task plan, then obtain its approval and execution-mode choice as required by `AGENTS.md`.
