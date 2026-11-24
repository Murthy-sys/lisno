# Automatic non-negotiable items and optional probable recommendations

Date: 2026-11-23
Status: Approved and implemented in Mode A. Integrity review and final scoped verification passed; see the companion task plan for exact evidence and verification limits.

## Goal

When a Main Line is selected in the web estimator, automatically include its configured non-negotiable additions in the same room. Use the existing recommendation popup for probable additions, with explicit Add and Ignore choices. Required additions must no longer need individual Add clicks.

Example: selecting a ceiling Main Line that requires painting and suggests decorative lighting automatically selects painting. The popup offers decorative lighting; Add includes it and Ignore leaves it outside the estimate.

## Current behavior and evidence

- Configuration already distinguishes `trigger: added`, `action: add`, `requirement: must` (Non-Negotiable Additions) from `requirement: can` (Probable Additions): `shared/knowledge/knowledgeRecommendationPresentation.ts`.
- The backend catalogue reader already recognizes both categories and resolves current Main Line/revision identities: `backend/src/services/estimator-catalogue.service.ts`, `readEstimatorCatalogueRecommendations` and `readRecommendationRule`.
- `frontend/src/features/leads/roomRecommendations.ts` explicitly skips every rule whose requirement is not `must`. Its existing test, “omits probable rules even when their target is available,” confirms that probable additions are intentionally hidden today.
- `EstimatorRecommendations.tsx` filters to required items again, and `EstimateRecommendations.tsx` labels the popup “Non-negotiable recommendations” with manual Add/Remove actions.
- `LeadEstimateWorkspace.tsx` owns room-scoped draft selection, recommendation origins, basket membership, saved-version checks and recommendation queries. Its `selectRecommendedLine` currently accepts only required relationships and adds one target per click.
- Existing origin tracking uses `recommendationSourceMainLineIds`; removing a source prunes recommendation-only dependent rows while preserving independently selected items. Duplicate identity is room plus stable Main Line ID, not its label.
- The client quotation and mobile staff authoring screens are separate consumers. Shared presentation changes must be explicitly scoped so this estimator popup change does not silently change those workflows.

## Scope and recommended approach

Extend the existing web estimator draft selection and recommendation resolver. Reuse current Configuration resolution, row creation, pricing, Save/Submit, origin tracking and the existing popup. Keep category-specific behavior in the workspace/adapter rather than making a generic popup mutate estimates.

The requested entry point is the web estimator workflow used in this conversation, including its editable working drafts and the existing Sales recommendation popup. Preserve other callers of shared components through explicit behavior options. Client/mobile authoring redesign and a new global recommendation enforcement engine are outside scope.

No new Configuration fields, pricing formulas, dependencies, database migration, email template or PDF styling are needed. Once saved, automatically added items flow into existing totals and PDFs through the normal estimate pipeline, including the completed PMC split behavior.

## Requirements

### R1. Automatically include required additions

1. Resolve active configured `added/add/must` rules for included, current source Main Lines. Automatically add eligible missing targets in the source room, without opening a required-items popup or moving keyboard focus.
2. Reconcile both newly selected sources and current sources already selected in an editable draft when verified recommendations load. These are local unsaved draft changes until the user performs the existing Save/Submit action; opening or reading an estimate must never write to the backend.
3. Reuse the target's existing quantity, dimensions, selected tier, pricing mode and user-entered values when already present. For a genuinely new row use the current normal Add defaults. Never copy the parent's quantity or manufacture measurements, prices or component selections.
4. Preserve existing completion rules. A valid required target that needs dimensions or other user input is visibly selected with its incomplete fields; normal completion checks remain in force.
5. For a required Sub Basket relationship, expand only its eligible configured children using existing relationship semantics. Include required chains to a stable result, with cycle detection and deduplication. A repeated query, React render, refresh, shared dependency or cyclic rule must not add duplicate rows or loop indefinitely.
6. If multiple sources require the same item in the same room, use one row and retain its applicable origins. If a target is both required and probable, required status wins; it must not also appear as an optional choice.
7. A required dependency cannot be excluded while an included source still requires it. Explain which source requires it, without opening another confirmation dialog. Removing the source uses existing cleanup behavior: keep targets needed by another source or independently selected by the user, and remove only recommendation-only dependents that are no longer needed. Cycles must not preserve orphaned dependencies after the independently selected root is removed.

### R2. Show probable items in the popup

1. Include active configured `added/add/can` targets in the recommendation view. Title the estimator popup “Probable items” and explain that these are optional additions.
2. Show the item, its related source Main Line(s), and Add/Ignore controls. Add selects that item in the same room through the existing draft/pricing flow, with its source association. Any required dependencies of this newly added item are then added automatically.
3. Ignore leaves quantities, selections, totals and backend data unchanged. Keep ignored choices reconsiderable when the user explicitly reopens the popup; do not automatically prompt for the same ignored suggestion repeatedly during that editing context.
4. Ignore state is local to the lead, room, source selection and current Configuration identity. It is not a permanent Configuration preference or a new persisted field. A user selecting or deselecting a Main Line starts a new choice context for that room, so its current probable items are offered again, including previously ignored choices. Deselecting removes suggestions belonging only to the removed source; no empty popup is shown when no probable choices remain. Automatic required additions, quantity/tier edits, saving and routine renders/refetches do not reset the user's choice.
5. A popup containing only required items must not appear. With both categories, complete required selection independently and show only probable choices in the popup. Closing the popup dismisses the current optional prompt and never cancels required additions.
6. Preserve pagination, explicit reopen, accessible names, keyboard close, focus restoration and responsive layout. Optional choices may all be ignored without blocking Save/Submit.

### R3. Handle unavailable, stale and racing data explicitly

1. Auto-add only from fresh authorized recommendation and catalogue data whose stable IDs, grouping and revision/version evidence match. Responses for an old room, source set, estimate version or editing session cannot change the current draft.
2. An unavailable, unpriced, room-incompatible or stale required item must produce a concise inline “required item needs review” state. Do not silently omit it, substitute another line, use an old revision, force a zero price or invent dimensions. Provide the existing refresh/review action.
3. Prevent Save/Submit from racing pending required-item reconciliation or knowingly submitting an unresolved required dependency. Cover all affected rooms, even if the user switches rooms before the query finishes. Optional suggestions never introduce a mandatory completion gate.
4. Automatic additions stop when editing becomes locked, submission begins, the source is removed, or the user navigates to another estimate. Preserve version/CAS checks and failure states. If an add cannot complete, report it accurately and do not announce success.
5. Hidden or unauthorized Configuration contents remain hidden. A shared endpoint must not broaden client visibility, reveal hidden target names/counts or accept arbitrary origin IDs merely to support optional additions.

### R4. Preserve saved and historical behavior

1. Save source and automatically added target rows together through the existing estimate mutation, preserving stable row IDs and origin links. A reload must not duplicate or lose them.
2. Preserve normal money calculations, selected modes/tiers, PMC recipient amounts, rounding, dimensions and room applicability. Totals change only because scope was added or removed through the established pricing path.
3. Published/approved/review-locked snapshots and existing issued PDFs are immutable. Do not backfill historical estimates, rewrite Configuration or trigger automatic publication/email.
4. Preserve existing exclusion/removal-rule and guidance behavior. This change interprets only configured addition rules; it does not introduce new automatic exclusion semantics.

## Data, API and permission impacts

Use existing `must`/`can` categories and `recommendationSourceMainLineIds`. The catalogue response already carries both categories. The web estimator uses `saveLeadEstimate`; preserve its input validation, same-room origin identity, authorization and transactional behavior. If a shared quotation mutation is reused during implementation, extend its existing must-only relationship validation narrowly to recognize a verified optional add edge, without weakening source/version/visibility checks. No new route or permission is expected.

Shared component presentation must distinguish required status from optional decisions without leaking raw Configuration payloads. Ignoring a probable item needs no API call. Read queries remain side-effect free; selected additions use the normal local dirty state and explicit Save/Submit.

## Assumptions and constraints

- “Non-negotiable” means configured active must-add rules; “probable” means configured active can-add rules. The wording does not refer to a pricing priority/index field.
- The requested popup is the existing web estimator popup. Separate client/mobile authoring behavior is preserved unless subsequently requested.
- Optional Ignore decisions last for the current editing context, not across unrelated estimates or future Configuration changes.
- The worktree contains extensive existing edits, including the completed PDF/PMC work. Capture target diffs before execution and preserve all unrelated changes. No product source changes occur at this specification gate.
- No remaining product question blocks this specification; the defaults above are reviewable assumptions.

## Risks and verification criteria

Primary risks are repeated additions, cycles, incorrect removal of a shared/manual item, missed dependencies during room changes, stale responses changing the wrong draft, silently incomplete pricing, optional items being treated as required, and accidental changes to other shared-component consumers.

Acceptance criteria:

- **AC1:** Selecting one parent with two required additions adds both in the same room automatically, exactly once, without a required-items popup. Repeating/refetching does not duplicate them.
- **AC2:** Probable-only and mixed-rule fixtures display only optional items in the popup. Add includes one target; Ignore/Close leave it unselected. Optional choices never block Save/Submit, and reopening permits reconsideration.
- **AC3:** Two unequal rooms, two parents sharing a dependency, a target already independently selected, a required chain, and a cycle preserve correct ownership, deduplication and cleanup. Required precedence defeats optional Ignore.
- **AC4:** Missing pricing/measurements, stale Configuration, unavailable targets, request failure, room switches, source removal and edit locks cannot silently drop required scope or apply a stale response. Pending required processing cannot race Save/Submit.
- **AC5:** Save/reload retains correct rows, quantities, modes/tiers and origins. Normal amounts and PMC summaries reconcile; published/approved historical snapshots and PDFs remain unchanged. No read performs a database write.
- **AC6:** Rendered tests and desktop/mobile-width browser checks verify automatic feedback, Add/Ignore, pagination, dismissal/reopen and focus behavior. Existing client/mobile shared consumers retain their current behavior. Run focused domain/component/integration tests and affected workspace typecheck/build; use replica-set tests only for any changed transactional backend path.

No migration is required. Rollback removes the automatic-selection/optional-popup behavior while retaining legitimately saved estimate rows and their existing origin metadata.

## Follow-up correction: selection changes

The reported once-only popup is caused by `recommendationPopupByRoom` retaining `false` for the whole room and ignoring a new source-selection context. Correct the dismissal/Ignore state lifetime within the approved R2.4 behavior: manual Main Line selection or deselection reconsiders current room candidates; verified source resolution and existing automatic required additions remain unchanged. The current view determines candidates, so deselected sources do not remain eligible. This does not introduce Configuration removal-trigger rules or an API change.
