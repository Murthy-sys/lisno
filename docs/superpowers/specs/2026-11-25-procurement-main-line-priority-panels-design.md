# Procurement Main Line priority panels

Date: 2026-11-25
Status: Approved and implemented in Mode A. Verification results and pre-existing limitations are recorded in the [task plan](../plans/2026-11-25-procurement-main-line-priority-panels.md).

## Goal and confirmed scope

Inside each Procurement project, show Main Line items in expandable **P1**, **P2**, and **P3** panels using the saved Basket closure priority from Main Line Configuration.

The user confirmed that grouping belongs **inside each project**, not on the projects list. A project can contain items in several panels. Do not assign one priority to an entire project or infer a Main Line's priority from its parent basket.

## Current behavior and evidence

The worktree and relevant target diffs were clean at the start of this investigation. Recheck before implementation in this shared workspace.

| Verified behavior | Source |
| --- | --- |
| Configuration saves P1/P2/P3 as optional `overview.payload.closurePriority` on a Main Line revision. | `frontend/src/features/ai-estimator-knowledge/KnowledgeClosurePriorityPanel.tsx`; `backend/src/domain/ai-estimator-knowledge-validation.ts` |
| This setting differs from the existing Non Negotiable/High/Medium/Low priority master. | `backend/src/domain/ai-estimator-knowledge-priority.ts` |
| Project Procurement currently opens a Main Basket overview grouped by execution mode; a basket opens its existing scope and enquiry workspace. | `frontend/src/features/procurement/ProcurementBasketWorkspace.tsx`; `ProcurementBasketModeGroups.tsx`; `ProcurementBasketDetailView.tsx` |
| The basket API contains stable source-line/Main Line IDs, but does not expose closure priority. Its list currently returns basket summaries and mode groups rather than individual Main Line rows. | `frontend/src/features/procurement/procurementBasketApi.ts`; `backend/src/domain/procurement-basket-projection.ts` |
| Authorized basket reads use a snapshot transaction and canonical estimate preparation. Current Configuration selection already follows saved draft, otherwise active revision. | `backend/src/services/procurement-basket.service.ts`; `project-purchase-order-mode.service.ts`; `backend/src/domain/ai-estimator-knowledge-current-revision.ts` |

## Proposed experience

1. Make **By priority** the default overview inside a project. Preserve the current overview through a small **By execution mode** view choice, so its existing cost summaries, filters, and basket actions remain available.
2. Display nonempty priority panels in fixed order: **P1**, **P2**, **P3**, then **Priority not set** when needed. Each header shows its Main Line item count and an accessible expand/collapse button. Open the first nonempty panel initially; users may expand multiple panels.
3. Each expanded panel lists its Main Line items with Main Line name, room, Main Basket/Sub-Basket context, existing execution-mode label, and **Open basket** action. Use a compact table on desktop and readable stacked rows on mobile. No new financial totals or progress percentages are introduced in this view.
4. A basket containing P1 and P3 items contributes only its P1 items to P1 and its P3 items to P3. Repeated instances of one Main Line in different rooms remain separate source items, each in the same configured priority. Identify rows by stable source-line key, never by display name.
5. **Open basket** retains the canonical basket ID and opens the existing full-basket workspace. Label the action explicitly; priority grouping does not silently restrict enquiry, vendor, or work-order scope. Returning restores the selected overview, filters, and expanded panels within the current project.
6. Provide search by Main Line, basket/sub-basket, and room in the priority view. Search results remain grouped in P1/P2/P3 order. Distinguish no project scope, no matching results, loading, and failed priority loading; provide retry/reset where appropriate.
7. Keep items with no configured priority visible in **Priority not set**. Missing/invalid Configuration is shown with an unavailable/review indication in that panel rather than being assigned an invented priority. A failure to load grouping metadata is an error, not evidence that every item has no priority.
8. Reuse existing typography, colors, controls, spacing, and accessible focus treatment. No new icon library, animation, or dependency. Panel toggles support keyboard use, `aria-expanded`, and associated panel IDs. Avoid page-level horizontal overflow at mobile widths.

## Source of truth and API contract

- Resolve priority using stable `mainLineId` against its latest saved draft revision when present, otherwise saved active revision, using the established current-revision selector. Read Overview from that selected revision. An unset priority in a draft must not inherit the active revision's older priority.
- Validate revision ownership and the saved value. Only exact P1/P2/P3 are recognized. Legacy lines without a reliable Main Line reference, missing Configuration, and invalid priority remain explicitly unresolved. Never join by names or substitute the four-level priority master.
- Add display-only `priorityGroups` to the existing authorized `GET /procurement/projects/:projectId/baskets` response. Each group has its priority key and source-item rows containing `sourceLineItemKey`, canonical basket ID/name, Main Line ID/name, room/sub-basket context, display execution mode, and priority resolution status. Include revision identity in the resolution metadata where available for lineage. Update frontend types, response validation, and OpenAPI together.
- Group the same source scope represented by the existing mode overview: included actionable lines, plus source lines retained for existing commitments. Explicitly distinguish historical/excluded items where present; do not resurrect unselected catalogue items. Each represented source line appears once across priority panels. Counts must reconcile to this unique source-line set.
- Resolve Configuration in batched reads within the existing authorized snapshot. Reuse the existing current-revision selection logic; avoid a browser request per Main Line and avoid parallel queries on one Mongo transaction session.
- Keep basket summaries and `modeGroups` backward-compatible. Do not expose hidden In-house component data through the new display projection. The new projection contains only the metadata needed for this view.
- Refetch on project entry/window focus through the existing query lifecycle, and provide retry/refresh. A Configuration priority change moves the item on the next successful refresh. Do not describe live push updates as supported.
- Metadata absence from an older server produces an explicit unavailable priority view with retry and access to the existing execution-mode overview. It must not be interpreted as all priorities being unset.

## Approach and tradeoff

**Recommended:** extend the existing basket read response with a batched, display-only priority projection and render the new default overview. This keeps authorization, revision selection, and project lineage on the server and requires no schema migration.

Fetching Configuration individually from the browser would add per-item requests and couple Procurement to Configuration permissions while risking mixed revision reads. Do not use that approach.

## Invariants and non-goals

- Priority organizes display only. It does not block P2/P3 work until P1 completes, change deadlines, or automatically close baskets.
- Preserve approved estimates, quantities, integer-paise calculations, customer amounts, current cost calculations, execution choices, overrides, BOQs, commitments, approvals, and issued artifacts.
- Do not add priority metadata to commercial mutation payloads or introduce new freshness-digest dependencies. Preserve all existing freshness/version checks and locks.
- Existing Procurement authorization and project scope remain authoritative. No new role access, Configuration write access, public endpoint, or customer data disclosure.
- The project gallery, Client screens, PDFs, emails, and Configuration editor are outside this change.
- No new stored priority field, migration, backfill, seed, dependency, commit, push, deployment, or external mutation.

## Risks, failure handling, and rollback

- Mixed-priority baskets and duplicate names can misgroup items: partition source-line instances using stable IDs and test multiple priorities within one basket.
- Current draft precedence can accidentally fall back to history: test different draft/active values and an unset draft.
- Grouped navigation can imply limited commercial scope: retain the explicit Open basket action and the full-basket editor.
- Preserve loaded view preferences per project; never carry one project's expanded state or cached rows into another project's identity.
- Rollback can remove the priority view while retaining the additive response metadata and existing execution-mode overview. No persisted customer or financial data requires reversal.

## Acceptance criteria and verification

| ID | Acceptance criterion | Verification |
| --- | --- | --- |
| AC1 | A project's Main Lines appear under P1/P2/P3 in order; mixed-priority baskets split correctly and source items are not duplicated. | Domain projection tests and rendered fixtures with two unequal projects, mixed baskets, repeated names, and multiple rooms. |
| AC2 | Latest saved draft wins over active, unset does not inherit old priority, and unresolved items remain visible. | Replica-set service tests covering draft/active ownership, unset/invalid/missing values, legacy references, and a Configuration change followed by refresh. |
| AC3 | Expand/collapse, search, empty/error states, mobile layout, and keyboard access work. | Rendered interaction/accessibility checks and browser verification at 390 and 1440 px. |
| AC4 | Full-basket navigation, existing mode overview, commercial state, and financial summaries remain intact. | Existing basket workspace/mode-group regressions; verify canonical IDs and unchanged summaries/commitments across asymmetric projects. |
| AC5 | Authorization, response validation, and cross-project separation remain correct. | Authorized/unauthorized service and route tests, OpenAPI checks, malformed/missing metadata tests, and project-switch regression. |

Start with focused projection/service and Procurement component tests, including replica-set tests for the transactional read change. Run backend/frontend typechecks and builds, applicable existing basket/tender regressions, rendered QA, and `git diff --check`. Broaden only for changed shared contracts or unresolved failures. There is no repository lint script.

No product code or tests were changed or run during this specification stage. Results belong in the separate implementation plan after approval.

## Assumptions and approval boundary

Confirmed: panels belong inside each project. Assumptions for approval: priority view is the default, existing mode view remains selectable, first nonempty panel opens initially, empty priority panels are omitted, unresolved items appear last, and priority does not enforce work sequencing.

No further product question is open. Repository `AGENTS.md` requires specification approval, then a separate task plan and execution-mode choice before implementation of this new feature.
