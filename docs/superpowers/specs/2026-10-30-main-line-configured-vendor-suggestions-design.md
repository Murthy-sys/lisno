# Main Line Configuration vendor suggestions

Date: 2026-10-30
Status: Approved feature and 2026-10-30 user-requested compact-panel correction implemented and locally verified; results and remaining baseline limits recorded in the task plan
Classification: Substantial; PM and Procurement workflow with transactional Configuration validation

## Goal and confirmed interpretation

An assigned Project Manager can choose an approved Main Line, see every vendor linked to that line in its current saved Configuration, and suggest a vendor to Procurement. Procurement reviews the recommendation and explicitly selects eligible vendors before sending its existing basket BOQ bid request.

The user explicitly selected **Only vendors linked to the selected Main Line** when asked whether to show linked vendors or the entire Configuration vendor directory. This supersedes the whole-directory lookup in the earlier [estimate/vendor handoff specification](2026-10-28-project-manager-estimate-vendor-handoff-design.md). Its other approved behavior remains the baseline.

“Program manager” refers to the existing Project Manager workspace and canonical `site_manager` role. No new role or permission expansion is required.

## Current behavior and evidence

Evidence below comes from the current local source, inspected on 2026-10-30. Existing documents describe earlier implementation and are context, not proof of current runtime state.

| Area | Current evidence | Implication |
| --- | --- | --- |
| Shared PM entry points | `frontend/src/features/project-manager/PMVendorSuggestions.tsx` is used in `ProjectManagerWorkspace.tsx` and `ProjectManagerEstimationsPage.tsx`. | Extend the shared panel so both entry points behave consistently. |
| Candidate lookup | `backend/src/services/project-manager/estimates.ts`, `candidates`, counts and queries `AiEstimatorKnowledgeVendorModel` with only optional name/code search. | The chosen Main Line validates approved scope and basket readiness but does not restrict directory membership. Unrelated vendors can appear. |
| Configuration membership | `backend/src/services/ai-estimator-knowledge-item.service.ts`, `buildItemSummary`, derives `vendorIds` from price-version references retained in the selected revision's `pricing.payload.priceEntries`. The UI calls these entries **Budgets**. | The existing Configuration relationship can be reused. Main Basket classification alone is not the Main Line vendor link. |
| Current revision | `backend/src/domain/ai-estimator-knowledge-current-revision.ts`, `selectCurrentMainLineRevision`, selects a saved draft before a saved active revision. | Resolve memberships from that exact revision, without fallback to older active data. |
| Save/reinstate | `backend/src/services/project-manager/vendor-suggestion-commands.ts` validates project access, immutable approved source, current line scope, and effective vendor activation. | It currently does not enforce membership in the selected Main Line. Restricting only the picker would leave a server-side bypass. |
| Existing write coordination | `requirePMMainLineScope(..., { forWrite: true })` in `approved-source.ts` fences the Main Line aggregate/version and its dependencies. | Resolve membership inside this transaction and preserve coordination with Configuration saves and activation. |
| Procurement review | `vendor-suggestion-reads.ts`, `procurement-main-line-suggestions.service.ts`, and `ProcurementBasketSuggestions.tsx` provide scoped recommendations, readiness reasons, explicit vendor selection, and source reconciliation. | Reuse this handoff and annotate suggestions whose link has since been removed. |
| Tests | PM estimate/candidate, suggestion command, Procurement suggestion, and rendered PM tests already exist. | Extend their fixtures with real Main Line budget references and negative membership cases. Existing broad-directory fixtures do not prove linked-vendor behavior. |

The supplied screenshot shows **Previous sources**, an empty history list, and a refresh in progress. Current UI deliberately pauses changes while relevant data is refreshing. A static screenshot does not establish a stuck network request or a database readiness failure; neither has been diagnosed in this specification.

The initial `git status --short` contains substantial existing PM and Procurement work, including untracked feature files and earlier specification/plan files. Those changes are the starting baseline and must be preserved. Only this new specification is written at this gate. Before implementation, capture refreshed dirty paths and exact target contents/diffs before any writer starts.

## Scope and non-goals

In scope:

- Main Line-specific vendor discovery in both existing PM entry points.
- Backend membership validation when creating or reinstating a suggestion.
- Current membership status in PM and Procurement suggestion read models.
- Accurate pagination, search, empty/loading/error states, and stale-selection recovery.
- Preservation of supported approved temporary items using their own Configuration identity and links.

Out of scope:

- New vendor creation, free-text vendor names, Configuration editing, or linking vendors from the PM workspace.
- Expanding the picker to vendors linked only to another Main Line or classified only under the same Main Basket.
- Changing approval records, approved amounts, estimate pricing, BOQ construction, Procurement dispatch eligibility, bid evaluation, awards, or purchase orders.
- A new Procurement approval/rejection state machine, automatic selection, automatic invitations, or real external notifications.
- A native mobile app feature, broad page redesign, role renaming, or broader directory access for PM. Responsive web behavior is included.
- Seeds, backfills, live migrations, deployments, commits, pushes, or production changes.

## Required behavior

### 1. Exact Configuration membership

1. Authorize the assigned project and resolve its current immutable approved source and included Main Line scope through the existing PM services.
2. Join the selected line by stable Main Line ID to its current saved Configuration revision. Use the saved draft when present, otherwise the saved active revision, through the established revision-selection policy.
3. Resolve the `pricing` section for that exact Main Line and revision. Collect vendor IDs from the price versions explicitly retained by saved `priceEntries` references. Validate section, revision, and referenced price-version ownership against the selected Main Line and revision.
4. Deduplicate by stable vendor ID across repeated budget entries, modes, and price versions. Membership covers all retained vendor links for the Main Line, rather than one selected mode or one currently effective price. This feature recommends a vendor and does not select or disclose a budget price.
5. Apply name/code search and deterministic name/ID ordering to this linked set before pagination. `total` reflects distinct matching linked vendor records, including visible blocked records, rather than the global directory.
6. Display linked vendors with safe name/code and readiness reasons. Preserve effective activation as a prerequisite to recommending a vendor. Linked inactive, archived, or incompletely activated vendors remain visible with disabled selection and an explanation. Contact/KPI/classification or unactivated Main Line pricing may block dispatch without blocking an otherwise permitted suggestion.
7. A valid Configuration with no vendor links returns an explicit empty result: **No vendors are linked to this Main Line in Configuration.** A search with no matches says **No linked vendors match this search.** Do not substitute the global directory, other lines, or the old active revision.
8. Missing or malformed current revision/section/reference data is an unavailable Configuration state with a safe explanation. Do not silently drop broken links and present the remaining list as complete. An absent or explicitly unconfigured pricing section with no retained references is a valid empty membership; contradictory or invalid retained references require correction.
9. Approved temporary items retain the existing eligibility and classification rules and resolve their own saved vendor links. Do not inherit vendors from a referring Main Line merely because it references a temporary item.

### 2. Suggestion commands and history

- Create requires both effective vendor activation and current membership in the selected Main Line. Validate inside the same authorized, source-fenced transaction as persistence. Client-supplied names, basket IDs, or candidate-list data are not authority.
- Reinstate a withdrawn suggestion using the same current membership and activation checks. Reject an unlinked vendor with a stable, safe conflict response and an instruction to refresh the linked vendor list.
- Recheck membership when Configuration changes after the picker opens. Preserve the user's note on a conflict and require a valid selection before retrying. A refresh must reconcile the selected ID against the fresh candidate response rather than trusting a previously held candidate object.
- Preserve existing command receipts, idempotency, duplicate handling, expected-version checks, actor ownership, and transactional audit events. Replaying an already committed request returns its original receipt; it does not create another suggestion after Configuration changes.
- Removing a Configuration link does not delete an existing suggestion or rewrite its identity/history. Mark it **Vendor is no longer linked to this Main Line in Configuration.** Missing or invalid membership data is distinguishable from a confirmed removal.
- Owners can still edit a note or withdraw a current-source suggestion after link removal, subject to existing source/ownership/version safeguards. These actions do not re-endorse the vendor. Reinstatement is blocked until the link and existing eligibility requirements are restored.
- Historical-source suggestions remain history; do not promote them to the current approved source. Existing invitations and bid activity remain factual and unchanged if a link is later removed.

### 3. PM interaction

The user requested removal of **Estimate source**, then clarified: **show only suggested vendors here... no unnecessary content**. The shared panel therefore contains saved suggestions and one direct create action. Main Line/vendor selection belongs inside the popup. This correction does not change Configuration membership, approved-source authority, permissions, persistence, or Procurement dispatch.

- Keep the shared panel compact: **Vendor suggestions**, one **Suggest vendor** action, and saved vendor rows. Remove the eyebrow/explanatory paragraph, Main Line/source filters, and routine refresh control. Use a simple **No suggested vendors yet.** state and omit pagination when there is only one page (including zero results).
- Enable **Suggest vendor** when current approved scope and existing write safeguards permit opening a create dialog, without requiring a separate panel selection. The dialog contains a **Main Line** selector followed immediately by linked vendors. Default to the first current approved line; an explicit estimate-row target wins. Keep current selector targets separate from historical rows.
- Populate selectable Main Lines only from the current approved scope. Explicitly selecting another line resets its candidate selection/search/page and new-line draft. Disable switching while a command is pending. Preserve the current draft if its selected line disappears on refresh; show the unavailable scope rather than silently selecting another line.
- Label vendor discovery **Vendors linked in Configuration** and **Search linked vendors**. Show the deduplicated count and pagination so every linked vendor is discoverable.
- Keep the existing radio selection and optional note. Multiple vendors can be recommended through independent suggestions; no bulk command or new multiselect is needed.
- Keep **Suggest to Procurement** and confirm **Suggestion saved for Procurement to review.** A new suggestion always targets the current approved source. After success close the dialog and reset the saved-list page so the new suggestion is visible.
- Remove the visible **Estimate source** dropdown everywhere in this PM flow. Use the existing `source=all` saved-suggestion query without a Main Line filter, preserving all saved project history. Rows show vendor name, Main Line, status, and permitted actions; provenance, notes, readiness, room scope, and bid activity remain available in a collapsed details area. No historical-only item can become a current create target.
- Keep loading and freshness checks explicit, recoverable errors retryable, and disabled actions explained. Preserve existing approved-source/index-readiness restrictions. Do not claim success or enable saving on failed or mismatched data.
- Reset vendor selection and pagination when changing the selected line or search. Preserve the note during recoverable errors and source review. Keep create/update dialogs and restore focus when closed. Estimate-row suggest actions open the same create dialog targeted to that line, without a second picker.
- Reuse established styling and semantic controls. Verify keyboard operation, readable status messages, long vendor names, and a usable dialog at narrow web widths. No new animation or UI dependency is needed.

### 4. Procurement review and sending

- Saved suggestions remain available in the matching project's Main Basket workflow with vendor, recommended Main Line, room scope, author, note, source, and suggestion state.
- A current recommendation is actionable through the recommendation control only when its current Configuration link and all existing Procurement readiness/source/BOQ checks pass. Keep withdrawn, historical, removed-link, and unavailable-link records visible with explanations.
- Procurement explicitly selects an eligible vendor using the existing selection set, then uses the existing bid-request send action. Deduplicate vendor selection across recommendations for several lines in one basket.
- The bid request continues to cover the basket BOQ. Do not imply that recommending a vendor for one line creates a line-only invitation.
- Ordinary Procurement vendor discovery and dispatch authority remain unchanged. A removed PM recommendation link does not revoke an existing invitation or create a new dispatch restriction for vendors Procurement independently selects under its established rules.

## API, data, and authorization impacts

Reuse the existing PM endpoints under `/projects/:projectId/pm/`:

- `GET vendor-suggestion-candidates`: narrow results to current linked vendors; retain approved-source and Main Line scope validation, bounded pagination, safe DTOs, and no private pricing/contact information.
- `POST vendor-suggestions`: add authoritative current Main Line membership validation.
- `PATCH vendor-suggestions/:suggestionId`: apply membership validation to reinstatement while preserving note/withdraw semantics and CAS checks.
- `GET vendor-suggestions` and the existing Procurement recommendation endpoint: include membership problems in the current readiness projection.

The existing candidate/suggestion fields can carry safe availability and readiness information. If a small additive field is needed to distinguish valid-empty from Configuration-unavailable responses, define it consistently in backend contracts, frontend types, OpenAPI, and tests. Avoid a new endpoint or broad raw Configuration response.

Use one shared backend membership resolver for discovery, command validation, and current recommendation readiness. Share the established reference-extraction semantics; do not introduce a new vendor-link collection or a duplicate mutable vendor list. Read only the fields required to resolve membership. Resolve once per distinct Main Line/revision in suggestion pages rather than once per suggestion.

| Actor | Permitted behavior |
| --- | --- |
| Active assigned PM (`site_manager`) | Read safe linked vendors and project suggestions; create suggestions; edit/withdraw/reinstate own suggestions subject to current checks. |
| Reassigned, inactive, or unassigned PM | Existing denial; no data leakage or write capability. |
| Procurement with project access | Review suggestions and explicitly send through existing eligible bid-request controls. |
| Admin / Super Admin | Existing operation-specific access unchanged; legacy project-wide suggestion behavior unchanged. |
| Client, vendor, other roles | No new access or actions. |

No authorization registry expansion, persistence schema change, new index, dependency, lockfile change, or migration is expected. Keep existing scoped-suggestion database readiness gates intact.

Approved values remain integer-paise values from immutable approval sources. Vendor membership is current Configuration data and does not reprice or modify approved scope. Vendor/line names are display values; all joins use stable IDs.

Preserve PM project/actor/source/line-aware cache keys and Procurement invalidation after suggestion commands. Configuration changes must refresh relevant candidate/readiness queries through existing invalidation/polling mechanisms; writes must always revalidate irrespective of cached state. Clear protected data on assignment/access loss.

## Assumptions, decisions, and risks

- **Confirmed:** show only vendors linked to the chosen Main Line, including all linked pages, not the entire vendor directory.
- **Evidence-backed definition:** Configuration's existing Main Line `vendorIds` membership is derived from saved budget references. Use this definition rather than inventing a basket-based or name-based association.
- **Preserved rule:** effective activation is still required to save a suggestion. The request does not authorize bypassing that requirement. Blocked linked vendors remain visible so the full list is understandable.
- **Preserved capability:** approved temporary items continue to work with their own links and stable classification.
- **Risk:** existing lines may have no saved budget vendor links. The correct result is the explicit empty state; do not create links or backfill data automatically.
- **Risk:** saved draft references may differ from the active revision or change while a dialog is open. Draft precedence, transactional membership checks, and stale-selection recovery are required.
- **Risk:** malformed, foreign, deleted, or duplicate price references can cause incorrect membership or counts. Ownership validation, distinct IDs, and invalid-data coverage must prevent that.
- **Risk:** prior local changes cover the same feature files. Implementation must extend the captured current baseline and preserve unrelated work.
- **Open decisions:** none requiring another product question before specification approval. Exact helper placement and any minimal additive availability shape belong in the separately approved task plan.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Selecting Main Line A shows only its linked vendors, while B shows its different linked set. Repeated links produce one vendor row. | Backend replica-set fixtures with two lines, overlapping and exclusive vendors, unrelated same-basket vendors, and duplicate budget references. |
| AC2 | Saved draft membership takes precedence over active membership; no fallback to another revision or line. | Draft/active divergence, removed link, no links, malformed/foreign/missing reference, and unavailable revision cases. |
| AC3 | Search, ordering, counts, and pagination cover the full linked set accurately; blocked linked vendors remain visible. | More vendors than one page, duplicate names with different IDs, name/code search, inactive/archived/under-review vendors, valid empty and search-empty cases. |
| AC4 | An assigned PM can persist a valid linked suggestion, and direct API submission of an unrelated vendor fails without new suggestion/audit/receipt writes. | Transactional create, stale-link, concurrent Configuration-save, duplicate, idempotent replay, and asymmetric project/identity tests. |
| AC5 | Removing a link preserves records and activity, disables recommendation selection/reinstatement, and permits otherwise authorized note edits/withdrawals. | Command and read-model regression tests for removal, restored membership, source/version conflict, and old-source history. |
| AC6 | Both PM panels show only saved suggestions plus a direct create action, with no Estimate source control. The create dialog immediately loads the chosen/default current Main Line's linked vendors; successful creation is visible. | Rendered interaction tests for compact empty/populated panels, default/changed/targeted line, both entry points, refreshed/removed selection, preserved note, history compatibility, loading/error/retry, access loss, keyboard and focus. |
| AC7 | Procurement sees the correct Main Line recommendation and independently selects/sends through the existing basket workflow; saving a suggestion sends nothing. | Replica-set handoff and existing tender regression coverage with fake delivery; no real external send. Include an unrelated same-basket Main Line and different approved source. |
| AC8 | Approved temporary items, immutable financial values, ordinary Procurement selection, existing permissions, and historical/project-wide suggestions remain compatible. | Existing affected regression suites plus unequal-project amount checks and explicit temporary membership cases. |
| AC9 | The interaction is usable on responsive web without overflow or new runtime/accessibility errors. | Rendered browser checks at 390px and 1440px, long names, valid/blocked/empty/error states, keyboard selection, dialog focus, and console/network inspection. |

After approval and implementation, run focused backend PM estimate, PM suggestion, Procurement suggestion, and relevant tender replica-set tests, with bounded worker concurrency. Run focused frontend PM estimate/workspace and Procurement suggestion tests, then typecheck/build for both workspaces. Broaden tests if shared contracts or source-selection code change. Run `git diff --check` and review final status. There is no repository lint script.

Use disposable test databases and synthetic browser fixtures. Report exact commands, results, baseline failures, unrun checks, and temporary evidence paths. No application tests have been run at this specification-only stage. Implementation approval does not authorize real bid requests, database preparation, or external/production mutation.

## Approval boundary

This document is the specification only. The repository's `AGENTS.md` requires specification approval before a separate task plan, then task-plan approval and execution-mode selection before implementation. No task plan or application changes are included in this stage.
