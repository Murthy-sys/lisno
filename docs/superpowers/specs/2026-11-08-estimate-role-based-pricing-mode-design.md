# Pricing-mode controls across Sales, Client and Designer estimation

Date: 2026-11-08
Status: Implemented and verified; results recorded in the task plan

## Goal and confirmed behavior

Show the selected pricing mode in Sales, Client and Designer estimation screens.
Allow the following assigned users to change it, using the compact PMC toggle
already implemented in the staff editor:

| Current estimate stage | Client | Assigned Sales | Assigned primary Designer |
| --- | --- | --- | --- |
| Initial estimation (`pre`) | Editable | Editable | No new access or editing permission |
| After initial Client approval (`post`) | Editable | View mode; cannot change it | Editable |

The user explicitly confirmed that the second stage starts **after initial
estimate approval, when Designer takes over**. It does not wait for design-plan
approval. The table governs pricing-mode changes, subject to existing project
membership, item eligibility, current-source validity and edit/approval locks.
It does not grant access to an otherwise inaccessible project.

## Current behavior and evidence

- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` already renders a
  compact PMC switch for editable Special items. PMC on selects `pmc` and hides
  the other choices; off exposes In-house and Sub-Vendor. Standard and read-only
  rows show their saved mode as text.
- `frontend/src/features/client/ClientQuotationLine.tsx` renders quantities,
  tiers and In-house components, but omits pricing-mode controls and text.
  `ProjectQuotationWorkspace.tsx` also uses this Client quotation presentation
  for the Designer's read-only project preview, with an existing entry point to
  the staff editor for the eligible primary Designer.
- `frontend/src/features/client/clientQuotationDraft.ts` and `quotationApi.ts`
  do not carry a requested pricing-mode change. The backend strict
  `quotationPatchSchema` in `quotation.service.ts` rejects that field today.
- `estimate-tiers.service.ts` exposes tier choices for the line's current mode
  only. Client editing therefore needs a safe projection of choices for each
  eligible mode; rendering the staff catalogue directly would expose an
  inappropriate internal data surface.
- `estimateTierScope` and `requireEstimateStaffActor` check assignment, but
  currently do not limit Sales pricing-mode changes to the initial phase.
  Hiding controls alone would not enforce the requested matrix.
- `estimate-decision.service.ts` moves the initial Client-approved estimate to
  `phase: "post"`, lifecycle status `draft`, retaining `preApproval`.
- Existing quotation saves use transactions, version/source fences, approval
  supersession and audit events. Revised submissions already require Client
  approval through the existing publication/review flow.
- `backend/src/routes/estimates.ts` requires Standard items to use Sub-Vendor.
  The previously approved compact-toggle specification preserves that rule.

## Scope, assumptions and non-goals

Scope is the current V3 collaborative estimation workflow, its Client quotation
API and the shared staff editor used by Sales and Designer. Existing legacy
workflows retain their behavior. Preserve the established Standard/Special rule:
Standard items display Sub-Vendor; eligible Special items offer mode controls.
Do not silently change item classification when toggling PMC or introduce Client
classification editing as part of this change.

Keep the Designer project preview read-only, visibly showing the mode and its
existing Add / edit estimate items entry point. Editing continues in the existing
Designer editor. Do not create a second staff editor or broaden secondary
Designer access. Sales can still perform other actions already permitted after
handoff; this change restricts mode changes specifically.

No new pricing formula, Configuration write, approval stage, automatic approval,
manual Client price override, estimate unlock, schema migration, dependency,
deployment or external communication. Preserve previous Submit behavior, hidden
configured-price annotations, basket selection and recommendation fixes.

## Interaction requirements

1. Show the effective selected mode in all accessible current estimation views.
   Eligible editable Special rows use one shared compact interaction: PMC on
   immediately selects PMC and hides both other choices; PMC off shows In-house
   and Sub-Vendor. Do not add a second PMC radio or duplicate mode summary.
2. Turning PMC off restores the prior non-PMC mode remembered for that line in
   the current editing context, otherwise Sub-Vendor. Remember only the mode,
   never an obsolete rate. Reset temporary memory when actor, project, estimate
   or saved review context changes; never leak it across rooms or line IDs.
3. Reuse established mode-change pricing behavior. An intentional change adopts
   current Configuration pricing for that exact line, tier and mode. Preserve
   quantity, dimensions and unrelated items. Show incomplete pricing explicitly;
   do not borrow another tier, mode or revision. Preserve ordinary unrelated
   edits and existing manual-price behavior in the staff editor.
4. In-house selection uses its current valid component choices and calculations.
   Clear incompatible component data when leaving In-house. Returning to it must
   validate current components rather than restore stale pricing metadata.
5. Client changes use the existing local draft, save/discard and conflict-recovery
   flow. They must survive save and reload and be reflected in the staff editor.
   Newly added eligible items and existing items must use the same mode rules.
6. Read-only, historical, Standard, pending/loading and unavailable rows show an
   accurate mode label or explicit unavailable state. Rendering never writes or
   converts saved data. Missing capabilities fail closed for editing.
7. Keep controls compact, naturally wrapping on narrow screens. Preserve visible
   focus, item/room-specific accessible names, native radio keyboard behavior and
   switch state announcements. Keep configured/base-price annotations hidden;
   the existing active selling price and line amount remain visible.

## Authorization and state transitions

- Derive a dedicated pricing-mode capability on the backend from current actor,
  project assignment, estimate phase and editability. Mirror it in UI visibility
  and interaction, but enforce it again inside mutation transactions.
- Before initial approval, only the linked Client and assigned owning Sales can
  change eligible modes. After initial approval, only that Client and the
  assigned primary Designer can change eligible modes. Other existing privileged
  operations remain operation-specific; this feature creates no bypass.
- Apply the same rule to every write path that can change the current V3 line's
  mode, including the staff full-draft save and Client quotation add/update.
  Validate the effective persisted change, not merely whether the request names
  a mode. Reject phase-ineligible attempts to reset it through classification,
  inclusion/re-add or equivalent full-line replacement. Permit unchanged mode
  values in otherwise authorized writes.
- Recheck assignment and phase under existing authorization/project fences so a
  stale Sales tab cannot change the mode after approval or reassignment. Existing
  CAS and source-version conflicts remain explicit and refreshable.
- Retain the Client's existing ability to edit an editable pending quotation:
  saving the change atomically supersedes the pending review and returns the
  working copy to its established staff-review path. Staff pending-review locks
  remain intact. Closed estimates still require their existing unlock flow.
- Mode changes invalidate the current priced approval identity through the
  existing revision/digest mechanism. Initial changes return to Sales review;
  post-handoff changes go through Designer submission and Client approval.
  Never alter immutable prior approval snapshots, published artifacts or the
  approved finance baseline simply by editing the working copy.

## Data, API and compatibility

Continue persisting only the existing `pricingMode` enum. No separate persisted
PMC boolean is needed. Extend the quotation add/update contract with an optional
validated mode, retaining saved/default behavior when omitted by older callers.

Add customer-safe mode eligibility, edit capability and mode-specific tier/
component choices to the quotation read/candidate contract. Reuse current-source
resolution and pricing services. Keep classification or equivalent eligibility
explicit so the UI never guesses it from mode or labels. Keep existing tier
choices compatible for other consumers; finalize additive field names in the
approved task plan before parallel writers start.

Expose only the customer-facing prices, choices and source tokens needed for
this interaction. Do not leak internal catalogue records, hidden lines, margins,
cost breakdowns or unrelated project data. Preserve hidden line amounts and
scope when applying Client operations. Resolve sources by stable Main Line ID,
using the latest saved draft revision, otherwise the active revision.

The server recomputes amounts and totals with established integer-paise,
component, GST and rounding logic. Client previews must use the safe projected
data and established calculation rules; they are not authorization or pricing
authority. Update runtime schemas, API types and OpenAPI together; reuse existing
registered route operations and update their inventory if a contract requires it.

After saves or phase changes, refresh all affected quotation, tier, revision,
staff-estimate and approval-status queries through the existing invalidation
mechanisms. No optimistic approval or financial values may hide missing data.

## Risks and failure handling

Primary risks are a Sales write bypass after handoff, stale assignment access,
exposing internal pricing data, selecting a mode with unavailable current rates,
and preserving an approval for a changed price. Exercise asymmetric users and
projects, concurrent transitions and exact persisted data in regression tests.

Source/version/permission failures must keep recoverable drafts and present the
existing refresh/review guidance, without automatically retrying a stale write.
No save, audit or approval supersession should partially commit on invalid mode
selection. Preserve existing transaction and external-delivery boundaries.

No migration is expected. Additive reads and optional write fields preserve old
callers. If rollback is needed, remove the new UI/write support while retaining
already saved enum values, which existing readers understand. Do not rewrite
customer data to roll back the feature.

## Acceptance criteria and verification

- **AC1 Visibility:** Correct selected mode appears in Sales and Designer editors,
  the Client editor and Designer project preview. Standard/read-only rows remain
  accurate without new edit authority or configured-price annotations.
- **AC2 Initial phase:** Assigned Sales and linked Client can select each eligible
  mode, save and reload. Wrong Client, unassigned Sales and Designer cannot change
  it. Standard-to-PMC/In-house attempts are rejected without implicit conversion.
- **AC3 Handoff:** Initial Client approval immediately switches mode-edit authority
  to Client plus primary Designer. Sales retains mode visibility; direct or stale
  Sales writes cannot change it. Secondary/unassigned Designer access stays scoped.
- **AC4 Persistence/pricing:** PMC toggling, remembered/default off mode, tier and
  component transitions work for existing and added items. Correct rates, amounts
  and totals persist across Client and staff views, without changes to other rooms,
  lines, hidden items or another project. Missing prices/current sources stay
  explicit; unrelated staff edits retain manual selling prices.
- **AC5 Review integrity:** Edits use the existing Sales/Designer review and Client
  approval path. Pending-round supersession, stale-version rejection, assignment
  changes, closed estimates and immutable approved history are verified with
  transactional replica-set tests. Old request bodies remain accepted as before.
- **AC6 Interaction:** Rendered switch/radio keyboard and accessible-name checks
  pass, with actual component/browser inspection at desktop and narrow mobile
  widths, including error, read-only and unavailable-price states.
- **AC7 Integration:** Run focused backend authorization, quotation edit/approval,
  pricing and OpenAPI regressions; focused frontend draft, row and workspace
  regressions; both workspaces' typecheck/build and `git diff --check`. Broaden only
  for demonstrated shared-contract impact. Record exact results and any unrun
  checks in the implementation plan.

## Execution constraints and open decisions

The working tree contains extensive earlier and unrelated changes. Capture the
initial dirty paths and exact target diffs before any implementation writers;
assign non-overlapping ownership only after understanding those changes.

Do not start or restart backend/OCR services for this work. Preserve any service
independently launched by the user. Use isolated test databases and mocked UI
fixtures for verification, with no production mutation. No staging, commit,
push, deployment, seed or migration is authorized.

The handoff event is resolved by the user's explicit clarification. No further
product decision is required for this scope. Specification approval, separate
task-plan approval and execution-mode selection remain the repository gates.
