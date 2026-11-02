# Estimate toolbar and revision sidebar

Date: 2026-11-02
Status: Approved and implemented in Mode A; locally verified on 2026-11-02 (evidence in the task plan)

Implementation refinement, 2026-11-02: the user requested that the revision block appear only when real saved revisions exist, with a more compact, user-friendly presentation. Empty/loading/denied history must not reserve a sidebar section. Necessary current-version actions remain reachable through compact contextual toolbar controls; zero client requests do not get a control. This refines presentation without changing publication, authorization, or approval behavior.

## Goal and confirmed decision

Give estimate items more space by removing the visible estimate masthead and the large workflow/client-requirements section. Put the amount before GST beside the Estimate Builder, Summary, and Proposal controls. Add saved pre-estimate and estimate revisions alongside room navigation, with read-only viewing and a download for the selected revision.

The user confirmed: **a revision appears each time an estimate is submitted/sent to the client; Save draft updates the current working version.** This means a committed client publication, not an email-delivery retry or an internal approval-queue submission. Changes continue in the same working estimate under its existing permissions and locks. Earlier submissions remain immutable.

## Current behavior and evidence

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` renders the visible draft eyebrow, title, project/location/project-number metadata, and a GST-inclusive total in a header above the view tabs. The prior compact-layout work reduced that header but did not remove it.
- The same workspace already calculates a subtotal separately from GST using integer paise for configured items. Its header and action footer currently display the GST-inclusive total. Summary and Proposal contain explicit tax breakdowns.
- The workspace renders `StaffEstimateCollaboration` and `StaffEstimateRequirements` in a large workflow disclosure. These components also provide essential withdraw, unlock, workflow-transition, preparation-release, and requirement-resolution actions. Deleting them outright would strand pending or locked estimates and unresolved client requests.
- `ConfiguredEstimateBuilder.tsx` owns the current room rail and selected-item navigation. Its current lines are derived from saved selections and current Configuration data. That derivation cannot serve as the source of historical prices or names.
- `backend/src/models/EstimateClientReviewRound.ts` already stores immutable publication snapshots, immutable PDF metadata/storage references, estimate and project identities, estimate version, and a unique `sendGeneration`. It has indexes on `(estimateId, sendGeneration)` and `(estimateId, createdAt, _id)`. Older rounds can lack phase, room metadata, or integer-paise fields.
- `estimate-publication.service.ts` creates the snapshot and PDF as part of publication. External delivery follows independently. A committed round remains valid when delivery is disabled or fails; retries must reuse it.
- In `routes/estimates.ts`, ordinary submission publishes directly when eligible. Legacy high-value submissions can enter an internal approval queue first and publish only through `send-client`. The sidebar must represent actual client publications, not invent a frozen revision at that intermediate queue step.
- `GET /estimates/:estimateId/pdf` renders the current estimate. It is unsuitable for historical downloads. The existing client-response service can read stored round PDFs, but its staff scope is assigned Admin/Super Admin, not the Sales/Designer workspace scope.
- Staff workspace reads currently combine lead access with estimate ownership or post-phase Designer assignment; Super Admin is operation-specific. A historical reader must enforce those same current workspace boundaries and bind every round to its estimate/lead/project.
- There is no general staff revision-list/detail API. The frontend exposes a current review and a specific pre-approved snapshot, which is insufficient to display all submissions.

## Scope and non-goals

In scope:

- The shared non-Configure estimate workspace: compact toolbar, main amount, action footer, removal of the large workflow section, current-version tools, and revision navigation.
- Historical list/detail/PDF reads for staff who can read the same estimate workspace.
- Read-only historical items, Summary, and Proposal using the selected snapshot, plus returning safely to current work.
- Relevant API contracts, route-operation inventory, OpenAPI, cache behavior, regression tests, and rendered responsive/accessibility checks.

Out of scope:

- A new Budget tab, budget editing, tax-policy changes, or removing GST from stored estimates, approved totals, finance, or PDF breakdowns.
- Editing, restoring, deleting, or comparing old revisions; creating a revision on every Save draft.
- Replacing approval workflows, bypassing locks, automatically enabling a different workflow version, or changing client-side quotation editing permissions.
- Rebuilding legacy history that was never stored, backfilling records, changing project numbering, or redesigning Configure estimate and unrelated screens.
- Deployment, production data/index changes, real customer communication, commits, or pushes.

## UX requirements

### 1. Compact toolbar and pre-GST amount

- Remove the visible `Estimate draft · …`, `Select estimate items`, and project/location/project-number block from the item, Summary, and Proposal workspace. Keep an accessible page/region heading without reserving visible masthead space.
- Keep the existing back/configure behavior and its protections in a compact control. Preserve the Configure screen's identity and setup controls; project numbers remain available through existing project/lead context.
- At desktop widths, place Back, Estimate Builder, Summary, Proposal, and the amount on one compact row. Keep Messages/Project status/Critical controls on that row when they fit; wrap cleanly when they do not.
- Display only the monetary amount visually, without `Total including GST` or a calculator ornament. Its accessible name identifies it as the estimate amount before GST. The amount is for the entire selected current estimate or historical revision, not the active room or search result.
- Use the same pre-GST amount in the action footer so the two prominent amounts agree. Current incomplete pricing remains visibly incomplete; never turn missing values into zero.
- Preserve separately labelled subtotal/GST/grand-total breakdowns in Summary, Proposal, and PDF content. Historical documents keep their original recorded values.
- Retain the existing compact typography, narrow room rail, and basket/item density. No added decorative cards, new icon library, gradients, shadows, or animation.

### 2. Sidebar with current work, revisions, and rooms

- When saved revisions exist, keep one compact left rail containing **Current estimate**, a collapsible **Revisions** group, and the existing room navigation. Without saved revisions, show room navigation directly, with no reserved history block. Do not add a full-width revisions section above the items.
- Current estimate is the default selection and represents the existing working record, including local unsaved edits. It is not numbered as a client submission.
- List real publications newest first. Labels use persisted phase and stable publication number, for example `Pre-estimate · R1` and `Estimate · R2`. The ordinal is the stored `sendGeneration`, not a position in the fetched list and not the mutable estimate/CAS version.
- Show a compact submission date and review status. Delivery state, where shown, is separate from approval state. Superseded or withdrawn submissions stay discoverable using their persisted status; do not invent statuses absent from the record.
- Phase `pre` means Pre-estimate; `post` means Estimate. If an older round has no trustworthy phase, label it `Estimate · Rn` without guessing that it was a pre-estimate.
- Bound list rendering with pagination and a compact Load more control. Hide the entire history navigation block when there are no real entries, including its Current estimate label, heading, empty/loading message, and standalone error/retry panel. Current editing remains usable. An already selected historical detail can still show its own actionable error in the main view.
- Clicking a revision shows that snapshot's rooms and saved items in the main area. The selected revision is clearly labelled read-only, and a `Download revision` action refers to that exact selection.
- Room navigation within a revision uses saved room IDs/labels and saved quantities, prices, item names, classifications, dimensions, units, and basket hierarchy. Missing historical room metadata falls back only to metadata actually present on snapshot lines. If no grouping exists, present an ungrouped saved-items view; do not borrow today's room setup or catalogue.
- Summary and Proposal refer to the same selected revision. Keep historical preview state independent of the editable draft and its current Configuration refresh.
- Returning to Current estimate restores local unsaved values and the current room/filter/navigation context. Selecting a revision does not save, discard, publish, hydrate the current draft from history, or send any mutation.
- While a historical revision is selected, replace editing actions with Download revision and Return to current estimate. No quantity/rate editing, Save draft, Submit, configuration refresh, requirement resolution, or workflow mutation operates on a historical snapshot.

### 3. Remove the large workflow section and retain necessary actions

- Remove the visible `Pre-estimation workflow and client requirements` disclosure and its large collaboration summary from the main layout, including its duplicated totals and explanatory paragraphs.
- Provide compact contextual **Estimate actions** and **Client requests (n)** controls in the current-estimate toolbar, separate from history navigation. Omit an actions control when no action is eligible, and omit the requests control when there are no requests. Existing resolved request history and meaningful unavailable states remain accessible without a large standalone sidebar panel. Open existing dialogs or a focused requests panel on demand.
- Preserve permission-dependent withdraw, unlock, eligible workflow transition, and preparation-release actions, including reasons, previews, version checks, audit semantics, and confirmation dialogs. A legacy Enable collaboration action may remain inside Estimate actions when eligible; it must not be a standalone banner or run automatically.
- Existing pending-review and approved-estimate edit locks still apply. Client changes and permitted staff edits continue on the same working estimate after the existing review/withdraw/unlock transitions.
- Keep unresolved-request counts and submission blockers visible when relevant. Opening Client requests allows review and resolution against saved current lines with existing stable IDs and validation.
- Historical selection does not imply that today's client requests existed in that historical snapshot. To act on current requests or workflow, explicitly return to Current estimate.
- Preserve delivery retry, conflicts, stale-data warnings, and client feedback. A normal successful state should stay compact; meaningful errors and blockers may take additional space.

### 4. Responsive and accessible behavior

- Preserve the desktop item pane's available-height sizing after removing the header/disclosure. Avoid empty reserved rows or gaps left by removed components.
- At mobile widths, expose current/revision selection and rooms as compact stacked or disclosed navigation above the main content. Keep selected version, amount, and download discoverable without a permanent wide sidebar.
- Use semantic navigation and named buttons with a clear selected state. Announce snapshot loading and selection, retain visible focus, and return focus correctly from action/request dialogs.
- Keep amounts and essential controls readable at 200% zoom, allow long labels to wrap or reveal their full names, and retain touch target/input readability from the compact-layout work.

## Source of truth and financial contract

- Current working amount: the existing subtotal calculation from current working lines, before GST, with the existing incomplete-pricing rules.
- Historical amount: the selected immutable snapshot's `subtotalPaise`. For a valid older snapshot that only has rupees, convert its stored subtotal once at the API boundary using the established rounding convention. Never divide a current GST-inclusive value or recompute historical amounts from today's Configuration.
- Snapshots retain all recorded amounts and GST. A historical line item or total must remain unchanged after Configuration names/rates, working quantities, tax settings, or current project metadata change.
- Example: a complete subtotal of 10,000 paise with GST of 1,800 paise displays ₹100 in the toolbar/footer; the explicit breakdown still records ₹100 + ₹18 = ₹118. A different revision with subtotal 27,500 paise displays ₹275.
- Approval records, issued artifacts, procurement preparation sources, and financial baselines remain immutable. A sidebar revision is a view of a publication, not a new approval or source of live financial truth.

## API and authorization contract

Add narrowly scoped authenticated staff reads, following existing route and response conventions:

| Operation | Purpose |
| --- | --- |
| `GET /estimates/:estimateId/revisions` | Bounded list of published revision summaries, ordered by descending stored send generation, with an opaque cursor. |
| `GET /estimates/:estimateId/revisions/:revisionId` | One authorized immutable snapshot with safe revision metadata. |
| `GET /estimates/:estimateId/revisions/:revisionId/pdf` | Stream that round's original stored PDF through authenticated storage access. |

- Use the existing `estimation.estimate.read` permission for these read operations, plus the same current lead/estimate scope as the staff workspace. This permits a scoped Designer to download the historical snapshot they can view; it does not grant access to the existing current-estimate export route or Admin response-task APIs.
- Register each operation explicitly in the canonical registry and OpenAPI. Super Admin uses the existing operation-specific global-read behavior, not a role-name bypass elsewhere.
- Sales can read only currently owned/accessible estimates. Designers can read only estimates that currently meet the workspace's workflow/phase/assignment conditions. Admins, clients, other employees, inactive actors, and unrelated staff gain no new access through these endpoints. Preserve independent existing Admin/client routes.
- Authenticate and authorize the parent estimate first. Match the requested round to that estimate and its stable lead/project identity. Recheck current scope for every list, detail, and PDF request; possessing a round ID is insufficient. Inaccessible and mismatched resources return the established non-disclosing response.
- List summaries include only the stable round ID, estimate version, send generation, persisted phase when present, timestamps, review/delivery status needed for this UI, and safe pre-GST amount metadata. Detail includes the typed snapshot, including optional saved room information. Do not expose recipient addresses, tokens, private links, storage references, or approval proof files.
- Keep snapshot history separate from the live estimate DTO and cache key. Listing is bounded; detail loads on selection. Never use the Admin response-task list as a workaround for missing staff history reads.
- Download returns the stored original revision PDF and a safe filename. Missing/unreadable storage produces a clear unavailable/retry state. Do not regenerate from the current estimate, silently download another revision, or weaken authorization to make a download work.
- Existing model/indexes and publication records are the source. No second revision store, automatic migration, backfill, or publication mutation is required by this design.

## Lifecycle, cache, and failure behavior

1. Edit current estimate and Save draft: update the same current record under existing CAS rules; revision count does not change.
2. Submit successfully to the client: the existing publication transaction freezes the snapshot and PDF, producing one new sidebar entry. Keep the selected context stable and refresh current state and history through existing mutation invalidation paths.
3. Disabled/failed email after committed publication: retain the entry and delivery status. Retry delivery against the same round; no additional revision.
4. Client requests changes, review is withdrawn, or an eligible approved quotation is unlocked: preserve the old entry and approval history. Existing workflow rules control when current editing resumes.
5. Edit and publish again: append a new publication under the same estimate. Prior snapshot content and PDF remain unchanged.
6. Internal approval-queue submission without publication: show current workflow status, but no fictional downloadable client revision.

Use separate query keys for current estimate, revision list, and immutable revision detail. Refresh list/status metadata after publication, withdrawal, unlock, delivery retry, and relevant review decisions. Current-estimate refresh must retain existing unsaved-edit/conflict handling. Switching quickly between revisions must not display a previous response as the newly selected revision; late downloads must retain their original selected filename/identity.

History loading/error/empty states must not prevent legitimate draft editing. Historical detail failure must not fall back to current lines or zero totals. On explicit access denial, clear protected history from display and do not continue showing stale authorized content as if access remained valid. Missing legacy fields are presented honestly without fabricated catalogue or room values.

## Options and decision rationale

- **Selected by the user: publication revisions, mutable current draft.** Reuses existing immutable snapshots/PDFs, accurately represents what was submitted, and avoids flooding the sidebar on normal saves.
- **Not selected: snapshot every Save draft.** Would require a separate revision model and retention/download semantics, create many versions during routine editing, and was explicitly rejected in the clarification.

Current architecture provides one credible implementation path for stored publication history. No new state-management, UI, or PDF dependency is expected.

## Acceptance criteria and verification

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | Visible draft/title/project metadata and the large workflow section are removed from non-Configure views; amount sits beside the tabs on desktop. Configure remains usable. | Rendered desktop screenshots and layout measurements against the current compact baseline; adjacent-view check. |
| AC2 | Toolbar/footer use current or selected historical subtotal before GST. Explicit tax breakdowns and stored artifacts retain their correct values; incomplete values are not zero. | Unequal current/historical financial fixtures with integer paise and legacy rupee conversion, plus rendered amount assertions. |
| AC3 | Only real client publications appear; Save draft and email retries add none. New committed publications appear even when external delivery is disabled/failed. | Publication/lifecycle regression tests, list integration tests, and UI mutation/cache checks. |
| AC4 | Revision selection shows its frozen items, rooms, totals, Summary, and Proposal after the live estimate and Configuration have changed. Historical view is read-only. | Component/integration tests with distinct versions and changed live catalogue; rendered selection/room/tab checks. |
| AC5 | Download returns the exact selected round's stored PDF. Missing files, mismatched IDs, and rapid selection changes cannot return a current/different PDF. | Storage-backed route tests comparing stored bytes; browser download/error checks. |
| AC6 | Current local edits and room/filter context survive entering and leaving history. Selecting history sends no estimate mutation. | Workspace tests and rendered edit, select revision, return, save scenario. |
| AC7 | Workflow actions and request resolution remain reachable through compact controls, with existing locks, reasons, previews, CAS, audit, and submission blockers intact. | Existing collaboration/request regressions plus new rendered dialog/focus and blocked-submit checks. |
| AC8 | New reads enforce current staff scope for list/detail/PDF and do not expose private metadata. | Two unequal projects, different owners/designers, inactive/reassigned actors, mismatched round IDs, forbidden roles, and operation-specific Super Admin tests; route/OpenAPI inventory checks. |
| AC9 | Navigation remains usable with long names, many revisions, no revisions, loading/error/permission states, and missing legacy room/phase fields. | Focused tests plus 1440×900, 1280×800, 768×1024, 390×844, and actual 200% browser zoom checks; keyboard/accessibility audit. |
| AC10 | Existing approval/publication behavior, prior compact density, project numbering, and unrelated dirty changes remain intact. | Task-specific baseline/diff review, focused backend/frontend tests, typechecks/builds, and `git diff --check`; document exact unrun/pre-existing failures. |

Use real Mongo integration for historical aggregation/scope behavior. Run replica-set regressions for any touched publication/transaction paths; do not weaken transaction semantics for test convenience. There is no repository lint command. Final verification must occur on the integrated worktree after all writers finish.

## Risks, compatibility, and operations

- **Historical/live data mixing:** separate snapshot presentation from catalogue-derived editing. Reuse presentational components only when all displayed values are snapshot-owned.
- **Scope expansion or stale authorization:** use the same current workspace gate for each endpoint, nested stable-ID checks, and asymmetric identity fixtures. Do not reuse the broader/different Admin task scope.
- **Losing current work:** keep historical selection separate from draft hydration and preserve existing save/version conflict logic.
- **Workflow actions disappearing with the old section:** compact affordances must cover every currently eligible action and blocking state before the old section is removed.
- **Legacy gaps:** support optional stored fields explicitly; no invented pre/post classification, rooms, or reconstructed PDFs. Show unavailable content without preventing access to valid current work.
- **Layout regressions:** keep navigation compact, let meaningful errors expand, and test short screens/zoom/touch. Do not hide focus or the last row to force density.
- **Shared dirty worktree:** 199 dirty paths were observed before this specification. Capture per-target baseline diffs before implementation ownership is assigned. Reverse only task changes if needed; never reset shared files.
- **Rollout:** backend read endpoints must be available before or with the new frontend. An unavailable history service shows an explicit retry state while current editing remains usable. Existing publication/current-estimate contracts remain backward compatible.
- **Migration/rollback:** no data migration, seed, historical backfill, or live index operation is planned. Rollback is limited to this task's UI/read APIs; stored publications and approvals remain untouched.
- **Side effects/observability:** viewing history is read-only. Existing publication/action audit and delivery behavior continue. Log through existing error handling without snapshot content, private links, recipient data, or tokens. Do not add view-time audit writes or new background jobs solely for this feature.

## Assumptions and open decisions

- “Proposal, budget, and summary” refers to the existing view-control row. A new Budget tab is not requested by the supplied screenshots.
- “Actual price without GST” applies to the prominent workspace amount and matching footer; explicit tax breakdowns and original PDFs remain intact.
- “Same estimations” means continuing the existing current estimate under existing role/approval rules, with submitted history available for viewing/download. It does not authorize editing an approved snapshot in place.
- The confirmed publication-only revision rule resolves the material product choice. No further product decision is open; implementation may tune control placement within the above density/accessibility requirements.

## Approval boundary

This document is the new specification only. The earlier compact-layout approval covered a different scope; this request adds historical reads, downloads, and workflow presentation changes. Under `AGENTS.md`, approve this specification before creating its separate task plan. No product code or task plan has been changed for this request, and no implementation agents have been started.


### Outer-gutter refinement, 2026-11-02

The user requested efficient use of whitespace around the completed estimate workspace. Reduce only the non-Configure estimate shell padding to 6px on every side, retaining device safe-area insets. Existing measured available-height sizing must give the recovered space to the item pane and footer. Keep other routes, Configure spacing, controls and financial behavior unchanged. This is a localized presentation refinement within the approved compact-layout scope. Verify desktop/mobile gutters, no horizontal overflow, footer reachability, and restoration of Configure padding.
