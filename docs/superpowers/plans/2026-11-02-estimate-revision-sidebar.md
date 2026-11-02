# Estimate toolbar and revision sidebar: task plan

Date: 2026-11-02
Status: Implemented and verified locally on 2026-11-02
Specification: [Estimate toolbar and revision sidebar](../specs/2026-11-02-estimate-revision-sidebar-design.md)
Specification approval: user replied `Approved` on 2026-11-02. The specification file is unchanged at this plan-only gate; this entry records the approval.
Execution mode: A, parallel native sub-agents, selected by the user on 2026-11-02.

## Outcome and constraints

Remove the visible non-Configure masthead and large workflow disclosure. Put the amount before GST alongside the existing view tabs, with the same amount in the footer. Add publication revisions beside room navigation, including frozen previews and downloads. Save draft continues updating the current working estimate. Existing approval, permission, request-resolution, and edit-lock rules remain authoritative.

Reuse immutable `EstimateClientReviewRound` snapshots and stored PDF artifacts. Do not create a second history store, regenerate historical PDFs from live data, revise tax calculations, mutate approval history, or add a revision for an email retry. Internal approval-queue submissions are not client publications.

No product implementation, agents, deployment, migration, seed, commit, push, or external communication is authorized by this plan-only stage. Product writes start only after task-plan approval and the execution-mode choice.

## Dependency order and ownership

Keep one parent task active at a time. T2, T3, and T4 are bounded parallel slices inside the single implementation parent. In Mode A, use native agents with these exclusive file boundaries; in Mode B, the primary agent performs all slices sequentially. Every writer must be told that other work is present and must not revert, reformat, or overwrite another owner's changes.

| Task | Deliverable | Owner in Mode A | Dependencies | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0 | Current baseline, target-diff inventory, and compact-layout measurements | Primary | Plan approval and A/B choice | AC1, AC10 |
| T1 | Agreed typed API and component interfaces, fixture identities, cache-key strategy | Primary | T0 | AC2–AC9 |
| T2 | Authorized list/detail/original-PDF reads and backend regression coverage | `backend_implementer` | T1 | AC2–AC5, AC8, AC10 |
| T3 | Read-only revision navigation/presentation and component tests | `frontend_implementer`, history presentation slice | T1 | AC2, AC4, AC5, AC9 |
| T4 | Workspace integration, compact toolbar/footer, current actions, state preservation | `frontend_implementer`, workspace slice | T1; consumes T3 interfaces, integrates its output at T5 | AC1–AC7, AC9, AC10 |
| T5 | Cross-layer integration and focused end-to-end checks | Primary | T2, T3, T4 finished | AC1–AC10 |
| T6 | Independent integrity review, then fixes by original owners | `integrity_reviewer`, read-only | T5 | AC2–AC8, AC10 |
| T7 | Final integrated verification and handoff | `verification_runner`, then primary | T6 findings resolved and writers finished | AC1–AC10 |

T2/T3/T4 may run concurrently after T1 with three agents plus the primary. No reviewer or verifier runs against concurrently changing product files. If an interface must change, the primary updates it once and notifies every affected owner before dependent edits proceed.

## T0: preserve current work and establish the baseline

Primary responsibility:

- Capture `git status --short`, relevant existing diffs, and copies/hashes of every dirty target before assigning a writer. The specification was added to a previously observed 199-path dirty worktree; re-read the actual current set rather than assuming that count is unchanged.
- Inspect the prior initiation, project-numbering, quotation, and compact-layout changes in assigned files. Preserve them. Use task-specific baselines so final review distinguishes this work from existing uncommitted changes.
- Confirm current route authorization, storage injection, snapshot fields, and test harnesses against code, not older plans. Read-only backend/source-of-truth or UX audits may be delegated in Mode A if a specific unresolved question warrants it.
- Capture the normal populated workspace at 1440×900 and 1280×800, plus mobile behavior. Record workspace top, first basket top, item-pane height, visible complete rows, and footer reachability. Prior compact artifacts are background; the current rendered baseline is authoritative.
- Use synthetic local data only. Keep temporary baselines/screenshots/logs under `/tmp/lisno-estimate-revisions-qa/` or an equivalent ignored task path. Do not run destructive seed scripts or use real client data.

Completion: existing changes are understood, every writer has a bounded baseline, and layout comparison can be reproduced.

## T1: settle shared contracts before parallel implementation

Primary owns these shared files for the implementation stage:

- New `backend/src/contracts/estimate-revisions.ts` for public revision summaries, detail, pagination, and normalized historical amount metadata. Reuse domain snapshot types rather than copy their entire definition.
- `frontend/src/api/types.ts` only for additive alignment of historical snapshot fields already persisted by the backend, including optional rooms, scopes, bedroom count, saved UOM metadata, and any required stored provenance.
- New `frontend/src/features/leads/estimateRevisionsApi.ts` and its focused API test for wire types, list/detail/download functions, and query keys.
- A small adjacent component-contract module if needed to avoid T3/T4 owning the same interface file. Do not create abstractions that have no actual shared consumer.

Contract details to establish:

1. Preserve the established `{ data: ... }` response envelope. List returns bounded `items` and pagination metadata including `nextCursor`; detail returns the selected safe summary plus the immutable snapshot. Default page size 20, maximum 50. Validate opaque cursor shape, version, estimate binding, and descending generation boundary. Cursor data is not authorization.
2. Summary fields are stable round ID, parent estimate ID, `estimateVersion`, `sendGeneration`, optional persisted phase/workflow version, submission timestamp, persisted review and delivery status, and normalized `subtotalPaise`. Status unions must match persisted values; do not add a fictional withdrawn status.
3. Use integer paise when stored. Convert valid legacy rupee amounts explicitly at the server boundary using the existing convention and reject/report invalid or unsafe historical amounts rather than substituting zero. Do not rewrite persisted snapshots.
4. Define safe download naming from the selected revision identity; the bytes always come from that stored round. Use existing authenticated blob/download handling and release object URLs. Do not expose the storage reference in JSON or browser URLs.
5. Use separate actor/session-safe history keys under a stable estimate-scoped prefix that existing `estimates` invalidations can reach. Keep list/status freshness separate from snapshot content. Handle 401/403/404 by removing protected displayed content; do not retain stale success data after explicit denial.
6. Define `EstimateRevisionNavigation` as a controlled presentation component receiving items, selected revision ID or current selection, loading/error/pagination state, and selection/load/retry callbacks. It must not fetch or mutate the estimate.
7. Define `EstimateRevisionView` as a snapshot-only view receiving the selected detail, active view (`builder`, `summary`, `proposal`), and historical room state. It must accept no live catalogue and no estimate mutation callback.
8. Decide one owner for current builder navigation state. Preserve search, section filter, selected-only view, active room, and collapsed basket state when the historical view replaces the builder; lift only the necessary view state to the workspace or a focused workspace-owned hook. Do not preserve state by feeding snapshots into live draft hydration.

Publish the exact interfaces to T2/T3/T4 before they write dependent code. This is implementation coordination within the approved specification, not a new product gate.

## T2: backend historical reads

Exclusive ownership:

- New `backend/src/services/estimate-revisions.service.ts` and focused historical-access helper only if needed.
- `backend/src/routes/estimates.ts`, `backend/src/app.ts`, `backend/src/domain/route-operations.ts`, and `backend/src/openapi.ts` or a dedicated new OpenAPI module wired there.
- New `backend/tests/estimate-revisions.test.ts`, `estimate-revisions.replica-set.test.ts`, and `estimate-revision-routes.test.ts`.
- Existing route/API inventory and closely related backend regression test files only for necessary coverage/expectation additions. No frontend or primary-owned contract edits.

Implementation:

- Add the three approved nested GET routes for list, detail, and PDF with `estimation.estimate.read`, explicit operation registration, and documented request/response/error shapes.
- Wire the new read service using existing lead access and review storage dependencies. Keep orchestration and projection out of the already large route body. If sharing the current staff-scope helper, preserve its existing behavior and test both original and new callers.
- Authorize the active actor and parent estimate with the current lead/workspace rules. For list/detail/PDF, filter on the same stable estimate, lead, and project lineage. Treat historical null/missing optional project fields deliberately; never broaden a mismatched non-null project association to recover a record.
- Apply current Sales ownership and Designer post-phase assignment checks; Super Admin follows the operation registry. The routes do not inherit Admin response-task privileges or expose client endpoints to staff.
- Read immutable round fields with an allowlisted DTO. Sort/page by the unique stored generation and use existing indexes. Pagination must remain stable if a newer publication is added between page requests.
- Return snapshot data without current Configuration or project-name refresh. Normalize only documented legacy numeric fields for presentation; no persistence writes.
- Authorize before reading stored PDF bytes. Preserve original content and safe download headers; missing files use the established unavailable/error behavior, never live-PDF regeneration.

Tests:

- Two unequal projects and rounds, different owners/Designers, reassignment, inactive actors, non-staff roles, wrong estimate/lead/project IDs, and Super Admin operation behavior across all three endpoints.
- Newest-first pagination, invalid/cross-estimate cursors, empty history, legacy missing phase/rooms, stored versus converted paise, and absence of private metadata.
- PDF byte identity, selected round identity, missing storage, and storage never called for unauthorized requests.
- Real Mongo tests verify filters and projections; simple mocked-query assertions are not sufficient for authorization. Use the existing replica-set helper for integration and any publication regression that requires transactions.
- Verify no revision write occurs on list/detail/PDF and no extra history entry is created by Save draft or email retry. Existing publication behavior is reused; change publication services only if a concrete implementation defect is found and reconciled by the primary.

Completion: authorized reads work independently of frontend, original download content is proven, and focused backend tests pass.

## T3: read-only revision presentation

Exclusive ownership:

- New `frontend/src/features/leads/EstimateRevisionNavigation.tsx` and test.
- New `frontend/src/features/leads/EstimateRevisionView.tsx` and test, plus a narrowly scoped snapshot presentation helper/test if grouping complexity requires it.
- New `frontend/src/features/leads/estimateRevisions.css`, scoped only to these new components.
- No edits to workspace, live builder, shared API/types, collaboration components, or global estimator CSS owned by others.

Implementation:

- Render Current estimate and a compact collapsible Revisions group only when real revisions exist, with stable `Pre-estimate · Rn`/`Estimate · Rn` labels, status/date, and Load more. Hide the whole history navigation block on zero entries; do not reserve empty/loading/denied sidebar space. Selected-detail failures remain actionable in the main view. Keep saved-room navigation independent.
- Render historical builder items, Summary, and Proposal entirely from the supplied snapshot. Display stored line names, quantities, rates, amounts, units, dimensions, component pricing, inclusion state, and saved hierarchy as available. Do not call live pricing calculators or derive an old rate from current Configuration.
- Group by saved stable room/basket/sub-basket IDs. For legacy lines without IDs, retain saved labels on individual rows and use an explicit ungrouped view; labels are not join keys and no IDs are fabricated.
- Show the selected revision/read-only context and its subtotal before GST. Keep the snapshot's explicit GST/total breakdown in Summary/Proposal.
- Provide keyboard-accessible selection and room navigation with clear focus/selected state. Accommodate long labels and mobile disclosed navigation without shrinking input/hit-area standards.
- Keep download initiation in the workspace/API owner; the new presentation components receive callbacks and busy/error state bound to the selected round.

Tests: distinct frozen versus current values, all three views, missing optional fields, duplicate labels with different IDs, included/excluded items, immutable read-only controls, selection/load more/retry, and keyboard/accessibility states. Test behavior and displayed source values, not CSS declarations.

Completion: new components compile against T1, render frozen fixtures correctly, and can be integrated without modifying their caller's draft state.

## T4: workspace, toolbar, and compact current-version actions

Exclusive ownership:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx` and its existing main/collaboration/tiers tests, plus a new focused `LeadEstimateWorkspace.revisions.test.tsx` if clearer.
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its tests; new workspace-owned view-state hook if justified.
- `frontend/src/features/leads/StaffEstimateCollaboration.tsx`, its test, `StaffEstimateRequirements.tsx`, a focused requirements test if needed, and `staffEstimateCollaboration.css`.
- `frontend/src/features/leads/estimateCollaborationQueries.ts` and `frontend/src/styles/estimator-dashboard.css`.
- No T3 component/style files or primary-owned API/types. Report any other consumer requiring invalidation to the primary for integration.

Implementation:

- Remove the visible non-Configure masthead and workflow disclosure. Keep a screen-reader heading, existing Back/configure behavior, project navigation, and Configure identity/setup.
- Place existing tabs, back control, and subtotal before GST on the compact toolbar. Match footer subtotal; preserve incompleteness, validation, and the existing Summary/Proposal tax breakdowns.
- Insert revision/current navigation into the room rail. Reuse the navigation in Summary/Proposal and historical views so selection remains reachable without a large extra top section.
- Add separate revision-list/detail queries and selected revision state. Keep all current draft values and current builder navigation state intact while history is selected. Do not trigger current estimate hydration, autosave, or mutation on selection.
- Hide live mutation controls in historical mode. Use the selected snapshot for the toolbar/footer/room/view content; loading or error displays no misleading current amount. Prevent an older response from rendering under a newer selection.
- Bind Download revision to the round selected when the operation begins, with safe naming, busy/error handling, and object URL cleanup. Returning to current work must not relabel an in-flight historical download.
- Replace the large collaboration/request presentation with compact contextual Estimate actions and Client requests controls in the Current estimate toolbar, separate from history navigation. Hide actions when none are eligible and requests when there are none; preserve existing request history and meaningful unavailable states. Reuse mutation handlers, dialogs, reasons, transition previews, version advancement, and locks; retain request-link validation against saved current lines.
- Preserve meaningful conflict, unresolved-request, stale-data, client feedback, delivery, and access states. Ensure delivery retry cannot act implicitly on the historical selection; it remains clearly a current-review action.
- Invalidate history on relevant current mutations through the shared query prefixes and existing collaboration refresh. Preserve unsaved-edit behavior and current project-number cache invalidations from the preceding task.
- Adjust only scoped CSS for toolbar, sidebar, and available-height sizing. Retain previous line density, 16px mobile inputs, coarse-pointer controls, focused last-row visibility, and overflow behavior.

Tests: unsaved edits survive history switching; room/search/filter/collapse state survives; only the selected revision's query/result/download is used; frozen view has no mutation actions; current save/submit behavior and request/workflow dialogs remain correct; errors do not substitute current values; explicit denial clears protected content; initial no-estimate and legacy workflows remain usable.

Completion: current and historical views work in the same workspace, existing guards survive the presentation change, and focused workspace tests pass.

## T5: primary integration

- Wait for T2/T3/T4 to finish; inspect their diffs against the task baselines and reconcile interface mismatches before broader verification.
- Exercise actual frontend API calls against the local backend, including authenticated list/detail and original-PDF download. Keep external mail disabled and use disposable local Mongo/storage fixtures.
- Confirm shared refresh paths cover submission/send, withdrawal, unlock, delivery retry, and same-session review decisions. Where another existing mutation bypasses shared invalidation, the primary owns only the minimal affected consumer edit/test after recording its baseline. Cross-session changes refresh through normal query remount/focus behavior; no new live messaging system is introduced.
- Exercise publication, save, and retry invariants through existing integration harnesses. Verify the internal approval-queue path does not create a fictional sidebar entry.
- Compare current and historical totals using unequal fixtures; verify current catalogue changes do not change stored historical content or downloaded bytes.
- Review every AC against implemented evidence and mark gaps in this plan. Do not mark the implementation complete while a required guard or error state remains unresolved.

## T6: integrity review and corrections

In Mode A, ask `integrity_reviewer` for a read-only review of the integrated task diff, specifically:

- Current actor/lead/estimate/round authorization and no PDF/storage read before scope checks.
- Snapshot lineage, exact artifact selection, legacy conversion, and separation from current Configuration/financial sources.
- Unsaved state, racing queries/downloads, denied-access cache handling, and mutation invalidations.
- Remaining access to withdraw/unlock/requests without bypassing existing approvals, CAS, reasons, audit, or edit locks.
- Historical compatibility, no extra publication records on retries/saves, and preservation of unrelated dirty work.

The primary reconciles findings with code, assigns confirmed fixes to the original owner, and reruns the affected checks. In Mode B, perform the same review inline. Do not start final verification until fixes are integrated and writers have stopped.

## T7: final verification and handoff

Run focused new tests first, then the relevant existing regressions and builds on the integrated tree. Exact new filenames below are planned ownership targets; if implementation consolidates them, record the actual final command and coverage mapping rather than claiming an unrun command passed.

Backend new feature lane:

```sh
cd backend
npm test -- tests/estimate-revisions.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-revision-routes.test.ts
```

Backend related regression and inventory lane:

```sh
cd backend
npm test -- tests/estimate-client-review-service.test.ts tests/estimate-client-review-storage.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-delivery.test.ts tests/estimate-collaboration.replica-set.test.ts tests/estimate-requirements.replica-set.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

Frontend feature and affected regression lane:

```sh
cd frontend
npm test -- src/features/leads/estimateRevisionsApi.test.ts src/features/leads/EstimateRevisionNavigation.test.tsx src/features/leads/EstimateRevisionView.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx src/features/leads/useQuotationRevision.test.tsx src/features/client/ClientQuotation.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx
npm run typecheck
npm run build
```

Include any newly added grouping/request tests and tests for additional touched consumers. Broaden to full workspace suites only if shared-contract changes, failures, or integrity findings justify it. No lint command exists. OCR is unaffected. If a regression fails, establish whether it predates this task with a focused baseline comparison; do not hide it or rewrite unrelated behavior to force a pass.

Rendered verification matrix:

| Scenario | Expected evidence | ACs |
| --- | --- | --- |
| Normal current estimate at 1440×900 and 1280×800 | Removed masthead/disclosure, tabs/amount on one compact row, first basket closer to workspace top and no loss of item-pane height or complete-row visibility versus T0 | AC1, AC10 |
| Current ₹100 subtotal, ₹18 GST; older revision ₹275 subtotal | Current/selected toolbar/footer agree with subtotal; explicit breakdowns remain correct | AC2 |
| Edit current quantity/rate, filter/select room, view two revisions, return and save | All local edits and navigation context retained; no selection-time mutation | AC4, AC6 |
| Different pre/post revisions, current catalogue renamed/repriced | Each view and download retains that round's saved data; exact downloaded bytes verified | AC4, AC5 |
| Publish, retry disabled/failed delivery, save, withdraw/unlock where eligible | Correct revision count/status, no duplicate round on retry/save, preserved edit guards | AC3, AC7 |
| No revisions, paginated history, missing optional legacy fields, slow/error/denied requests | Accurate empty/partial/error states, stable selection, no stale current fallback or protected content after denial | AC4, AC8, AC9 |
| Client requests and Estimate actions | Keyboard focus, reason/preview dialogs, saved-line resolution, blockers, and return focus work | AC7, AC9 |
| 768×1024, 390×844 coarse pointer, actual 200% desktop browser zoom | No unintended page overflow, inaccessible navigation, clipped amounts, obscured focus, or unreachable final row/footer | AC9 |
| Configure and existing current Summary/Proposal | Setup behavior preserved; tax breakdowns and current-download behavior unchanged outside the approved presentation changes | AC1, AC2, AC10 |

Run a workspace-scoped accessibility audit and keyboard traversal. Inspect browser console/network errors; distinguish deliberate failure fixtures from unexpected errors. Use a real backend for at least the authorization/history/download path; label mocked UI-only states clearly in the evidence.

Final repository checks:

```sh
git diff --check
git status --short
```

Record exact commands/results, viewport measurements, screenshots/log paths, any checks not run, and remaining risks in this plan. Stop only task-owned processes and remove only task-generated unnecessary artifacts. Handoff should state that implementation is local and whether any limitations remain; no deployment, backfill, real mail, or production change is part of this task.

## Current progress

- Specification: approved by the user.
- Task plan: approved by the user on 2026-11-02.
- Execution mode: A, selected by the user.
- T0 complete: 201 initial dirty paths captured under `/tmp/lisno-estimate-revisions-qa/`; per-target copies/hashes extended for additional clean test/consumer files before ownership. Rendered baseline at 1440×900 and 1280×800 has first basket at y=323.78125, with item panes 499.5078125px and 399.5078125px respectively. Desktop/mobile screenshots and metrics saved there.
- T1: shared revision DTO, frontend API/query keys, optional snapshot metadata, and controlled component interfaces created by the primary.
- T2/T3/T4 complete: three implementation agents delivered their bounded slices; integration and both review corrections are complete.
- Primary integration addition: `ClientResponseDecisionDialog.tsx` and its test now invalidate revision history after Admin proof decisions and conflicts. Both targets were clean and baseline-captured before changes. `LeadEstimateRecommendations.test.tsx` ownership extended to the workspace agent after capturing its clean baseline.
- Focused primary checks: API contract and Admin decision tests passed, 12 tests across 2 files. Shared AuthProvider already cancels queries and clears the cache on session termination; revision keys additionally include actor ID.
- Independent access audit confirmed that historical null project IDs must remain readable after legacy project linking, while mismatched non-null round IDs are denied. No write-guard substitution or Admin PDF shortcut is used.
- User presentation refinement during implementation: show the revision block only with actual revisions, make it collapsible/compact, remove zero-request controls, and keep necessary contextual actions outside the revision block. T3/T4 owners are incorporating this without changing the approved data/API/approval behavior.
- T2 backend handoff: 19 Mongo/HTTP feature tests, 45 route-registry tests, 70 OpenAPI tests, and 170 related regression tests passed; backend typecheck/build passed. Planned unit/route feature coverage is consolidated in `estimate-revisions.replica-set.test.ts`. Evidence is in task QA backend logs; final integrated verification remains pending.
- Initial browser integration: real list/detail returned saved R1/R2 amounts ₹100/₹275; explicit breakdowns retained GST. Downloaded R1/R2 files exactly matched the corresponding stored bytes. Foreign estimate list/PDF and unknown round reads returned 404. Current editor fixture mutations are mocked; historical endpoints and downloads use the real backend, disposable Mongo, and local storage.
- T3 initial handoff: 12 component tests and typecheck passed; desktop/mobile historical views had no overflow, no editable fields, and zero workspace accessibility violations. Presentation tests/browser evidence will be rechecked after the user's compact-disclosure refinement.
- T5/T6/T7 complete: integrated browser/API checks, independent integrity re-review, and final integrated verification passed. No product writes remain in progress.


## Final verification and handoff

All AC1–AC10 are covered by the focused tests, independent review, and rendered checks below. The latest refinement hides the complete history navigation when there are no actual revisions. With revisions, a collapsed compact disclosure shows the count and selected version. Empty request controls are hidden and eligible actions live in the toolbar.

- Independent integrity review found and then confirmed fixes for two frontend transitions: explicit history denial now latches to actor/estimate and removes protected caches until fresh authorization succeeds; open compact conflict dialogs preserve entered reasons and conflict explanations when eligibility changes. Targeted regression tests passed (26 tests). No unresolved review findings.
- Final backend regression lane: **359 tests passed across 13 files**, exit 0.
- Final frontend regression lane: **203 tests passed across 15 files**, exit 0.
- Backend and frontend `npm run typecheck` and `npm run build`: all exit 0.
- `git diff --check`: exit 0. Initial unrelated changes remain preserved; the task diff covers 38 product/test/document paths against the captured baseline. No dependencies or lockfiles changed.
- Full unrelated workspace suites and OCR were not run. No lint script exists. Build/test output includes Mongoose's deprecated `new` option warning and Vite's chunk-size warning; neither failed validation.

Exact executed test commands (from workspace roots):

```sh
cd backend
npm test -- tests/estimate-revisions.replica-set.test.ts tests/estimate-client-review-service.test.ts tests/estimate-client-review-storage.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-publication.test.ts tests/estimate-publication-mongo.replica-set.test.ts tests/estimate-delivery.test.ts tests/estimate-collaboration.replica-set.test.ts tests/estimate-requirements.replica-set.test.ts tests/route-operation-registry.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/api-docs.test.ts
npm run typecheck
npm run build
```

```sh
cd frontend
npm test -- src/features/leads/estimateRevisionsApi.test.ts src/features/leads/EstimateRevisionNavigation.test.tsx src/features/leads/EstimateRevisionView.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.tiers.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/StaffEstimateCollaboration.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/useQuotationRevision.test.tsx src/features/client/ClientQuotation.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx src/features/admin/ClientResponseDecisionDialog.test.tsx
npm run typecheck
npm run build
```

Rendered evidence under `/tmp/lisno-estimate-revisions-qa/`:

| Check | Result |
| --- | --- |
| Desktop 1440×900 | Toolbar 34px; first basket y=218.49 versus baseline 323.78; item pane 605.51px versus 499.51; 8 complete rows versus 6. |
| Laptop 1280×800 | Toolbar 34px; first basket y=218.49; item pane 505.51px versus 399.51; 6 complete rows versus 5. |
| Tablet 768×1024 and mobile 390×844 coarse pointer | No page overflow; navigation usable; mobile footer can scroll into view and retain keyboard focus. |
| Actual browser zoom 200% | Chrome page zoom set through Settings; CSS viewport 600×416 with devicePixelRatio 4; no page overflow, historical Download control focusable and fully visible after scrolling. Restored 100% afterward. |
| Accessibility/keyboard | Zero workspace axe violations in current desktop/mobile and historical mobile; Enter opens and Space closes the revisions disclosure. |
| Frozen historical data | R1 subtotal ₹100; R2 subtotal ₹275, GST ₹49.50, total ₹324.50 in both saved Summary and Proposal. No editable historical inputs. |
| Original PDFs | Final R1/R2 downloads byte-identical to respective stored files; missing PDF returns an actionable error, starts no download and preserves selected ₹100 amount. |
| Draft preservation | Search `POP false`, quantity 3 and rate ₹125 survived selecting two revisions and returning; displayed subtotal ₹375. Navigation caused zero writes. Save sent one PUT with ratePaise 12500 and did not add a revision. |
| Empty/error history | Empty list and initial 503 render no history block or blank side column; explicit denial clears historical data and keeps only scoped recovery. No zero-count request button. |
| Console/network | Normal final browser flow had no page errors or unexpected console/network failures. Deliberate 503/404 fixtures produced their expected failed requests. |

Real history list/detail/PDF, permission checks, Mongo filters and storage downloads used the local backend and disposable replica-set/storage fixtures. Current editor/catalogue/save endpoints and browser-only empty/error states were mocked; actual save/publication/retry behavior is covered by the backend regression lane.

Evidence files include `final-browser-results.json`, `final-browser-errors.log`, `empty-history-browser.log`, `final-pdf-verification.json`, `final-current-1440.png`, `final-current-1280.png`, `final-current-768.png`, `final-current-390.png`, `final-no-revisions-builder.png`, `final-history-1440.png`, `final-history-390.png`, and `final-*-tests.log`, `final-*-typecheck.log`, `final-*-build.log`. Build outputs `backend/dist` and `frontend/dist` are ignored. Temporary browser artifacts are moved out of the repository to the task QA directory; task-owned browser/server processes are stopped.

No commits, pushes, deployments, migrations, backfills, production mutations, or real mail were performed. Implementation and verification are local.


### Outer-gutter refinement, 2026-11-02

- Scope: one estimate-scoped CSS rule in `frontend/src/styles/estimator-dashboard.css`; no component/API changes.
- Evidence: shared shell adds 24px desktop gutters and mobile 24px top/16px sides/40px bottom. The estimate already has no maximum-width cap.
- Implementation: 6px safe-area-aware gutters only while `estimate-workspace--revision-workspace` is present. The existing ResizeObserver height measurement reads actual shell bottom padding, so the larger item pane needs no JavaScript change.
- Verification: rendered desktop/mobile/Configure geometry and frontend build; results recorded below after execution.
- Baseline and QA evidence: `/tmp/lisno-estimate-gutters-qa/`.

- Completed: rendered checks at 1440×900, 1280×800, 768×1024, and 390×844 confirm exactly 6px on all four sides, no page overflow, and a reachable keyboard-focused mobile footer. Summary/Proposal use 6px; Configure returns to its existing 24px. Desktop item pane gains 36px height (605.51→641.51 at 1440) and 36px width. No browser errors.
- `cd frontend && npm run build`: passed; existing large-chunk warning only. `git diff --check`: passed. No test/code/API changes or new dependencies; full suites not repeated for this scoped CSS refinement. Screenshots and measured results: `/tmp/lisno-estimate-gutters-qa/estimate-1440.png`, `estimate-390.png`, `browser-results.json`; build output in `build.log`. No deployment.
