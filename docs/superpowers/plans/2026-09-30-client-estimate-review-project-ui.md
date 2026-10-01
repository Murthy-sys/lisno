# Client estimate review and project UI task plan

Status: specification and task plan approved; Mode A selected on 2026-09-30. T1–T7 complete within the scoped verification lane. Broader test failures are documented below; the repository-wide suite is not certified green.

Source of truth: [approved specification](../specs/2026-09-30-client-estimate-review-project-ui-design.md).

## Outcome and scope

Add read-only estimate review, direct Client approval, and explained change requests to the Client project page. Show Client feedback to the authorized Sales estimator and support revision/resubmission through the existing workflow. Redesign the project page using the Procurement and Configuration presentation patterns. The dashboard remains available for estimates without a project link.

Reuse the existing approval service and immutable published review records. No new dependencies, migration, deployment, seed, commit, or external message is required.

## Ownership and preservation

The worktree contains uncommitted Designer upload, furniture-dimensions, and workflow-visibility work. Capture its dirty paths and relevant diffs again immediately before implementation. The current target overlaps are:

- `frontend/src/features/estimates/EstimateReviewPanel.tsx`: existing successful-approval invalidation of `projectWorkflowKeys.all` must survive the review UI changes.
- `frontend/src/features/estimates/estimateDrawingJourney.test.tsx`: existing workflow invalidation regression must survive fixture/interaction updates.
- `backend/src/openapi.ts` and `backend/tests/api-docs.test.ts`: existing furniture-room dimensions and estimate-approval visibility contract changes must remain intact.

Other dirty paths belong to the earlier work and are outside this task unless a specific integration dependency is established. Each writer receives its exact ownership list and the instruction to preserve other agents' changes. The primary agent owns shared API types, OpenAPI, integration decisions, and this task plan. Keep only one parent task in progress.

## Dependency order

`T1 contract and baseline → T2/T3/T4 owned implementation → T5 integration → T6 integrity review → T7 final verification`

T2, T3, and T4 can run in parallel only after T1 settles the contract and ownership. In Mode B, the primary agent executes them sequentially. No subagents start before the user chooses Mode A.

### T1. Settle review contracts and capture the baseline

Owner: primary agent. Acceptance criteria: AC1–AC5.

- Capture current target diffs and run the smallest relevant existing regression baseline. Record any pre-existing failure separately.
- Define a typed Client review read shape containing stable estimate/project identifiers, the latest submitted round identity/version, immutable estimate snapshot, review status, decision availability, and Client-facing decision feedback. Keep internal proof storage and internal-only history out of this shape.
- Trace all `getClientEstimates` consumers, including existing drawing tools, before replacing commercial values. Published snapshots contain line items and totals but do not contain all room/scope metadata. Do not manufacture room IDs or break drawing-review contracts to fill that gap.
- Bind a decision to the round the Client actually reviewed. The current route fetches the newest round at submit time; merely retaining that behavior would allow an older open page to act on a newer submission. Add an expected round ID/version token to the Client decision request and validate it through the existing transactional service. Missing, obsolete, or mismatched tokens must require refresh, not select a newer round silently.
- Bind Client PDF access to the displayed submitted round so a concurrent resubmission cannot change the downloaded proposal beneath the page. Preserve authenticated download authorization and opaque storage.
- Define explicit unavailable/revising states for missing legacy snapshots, ambiguous project links, and pending Sales revisions. Keep old empty-note history readable; new Client changes requests require a trimmed explanation.
- Primary agent owns changes to shared frontend types in `api/types.ts`, `estimateWorkflowApi.ts`, and `leadsApi.ts`, plus backend shared domain/contracts and OpenAPI as needed. Publish the settled shape to all writers before they edit consumers.

### T2. Implement authorized published review reads and decisions

Owner in Mode A: `backend_implementer`. Paths: `backend/src/routes/estimates.ts`, `backend/src/services/estimate-client-review.service.ts`, `backend/src/services/estimate-decision.service.ts`, focused backend tests, and any explicitly assigned new presentation helper. Shared contract/OpenAPI changes go through the primary agent. Acceptance criteria: AC1–AC5.

- Extend the existing Client estimate read path to select the latest authorized submitted review and its immutable commercial snapshot. Preserve estimates during Sales revision without exposing mutable draft values; never substitute another project or an arbitrary older review.
- Validate estimate/Lead/project/round identity and Client scope. Preserve dashboard review for an estimate whose project has not been created yet. Distinguish absence of a review from a source conflict.
- Serve the PDF belonging to the displayed round under the existing authenticated route. Reject a round belonging to another estimate or Client without disclosing its data.
- Validate the submitted decision token and require a nonblank Client changes note of at most 1,000 characters. Reuse the existing transaction, CAS, approval baseline, audit, and downstream-task behavior. Concurrent direct/on-behalf decisions must produce one valid result.
- Make current commercial change feedback available through the existing authorized Sales estimate read; reuse stored review history/current-round data and preserve historical empty-note compatibility.
- Keep current publication and delivery semantics: Sales resubmission creates a new review round, independently of email success, and never rewrites the prior snapshot or decision.
- Add focused read/route/service and replica-set coverage for two unequal projects and two Clients, draft isolation, note validation, displayed-round/PDF matching, stale decisions, simultaneous decisions, and changes → revision → resubmission → approval.

### T3. Build the shared Client estimate review and redesign the project page

Owner in Mode A: `frontend_implementer` for the Client slice. Paths: `frontend/src/features/client/ClientProject.tsx`, `clientWorkflow.css`, relevant Client tests, `frontend/src/features/estimates/EstimateReviewPanel.tsx`, its tests, explicitly assigned new Client review components/styles, and minimal `ClientDashboard.tsx` integration. Excludes shared types and the Sales workspace. Acceptance criteria: AC1–AC6.

- Put the project-specific estimate review near the top of the Overview. Resolve it only by stable project ID; handle no match, ambiguous match, unavailable snapshot, and unauthorized/error states explicitly.
- Share read-only estimate details and decision behavior with the dashboard. Preserve existing design-review tools and the unlinked-estimate entry path.
- Present published version/status, selected item sections, quantities, units, rates, amounts, GST, total, and PDF access. Use persisted snapshot amounts/totals and the established currency boundary. Do not drop lines whose catalogue IDs are no longer in the current catalogue.
- Add an accessible approval confirmation showing project, version, and total. Add a request-changes form with required explanation, length validation, pending/error states, and focus restoration. Submit the displayed review token; disable duplicate actions and refresh after conflicts.
- Show waiting-for-Sales and approved states with clear next steps. Invalidate the shared Client estimates, affected project/workflow, and existing design queries after decisions. Preserve the previously implemented workflow approval gate and its query invalidation.
- Rework header spacing, identity/status hierarchy, Overview/Messages navigation, estimate rows/disclosures, and secondary records using existing Procurement/Configuration tokens and controls. Use quiet borders and structured spacing, with no added shadows, gradients, decorative icons, fonts, or dependencies.
- Add interaction/accessibility regressions for project isolation, approval, explained changes, stale responses, empty/loading/error states, dashboard parity, no editable commercial fields, and legacy unavailable states.

### T4. Show feedback in Sales and finish the revision loop

Owner in Mode A: separate `frontend_implementer` for the Sales slice. Paths: `frontend/src/features/leads/LeadEstimateWorkspace.tsx`, its focused test, and an explicitly assigned feedback component/style if needed. Excludes Client/EstimateReviewPanel files and shared types. Acceptance criteria: AC3–AC5.

- Display the latest Client commercial change request above the estimate editor when Sales needs to revise, with its explanation and recorded time where available. Do not confuse commercial feedback with design drawing requests.
- Show a useful historical fallback when a saved request has no note. Do not display unrelated internal review notes as Client feedback.
- Preserve existing Sales ownership/authorization and submission stages. Ensure saving drafts retains the Client request context and resubmission refreshes estimate/review state.
- Add a focused regression that receives Client feedback, edits the authorized estimate, submits again, and clears the actionable changes state only when the new submission succeeds. Include failed-save/submission behavior and a second project as an isolation check.

### T5. Integrate the complete flow

Owner: primary agent. Acceptance criteria: AC1–AC6.

- Inspect all writer diffs, reconcile shared types/OpenAPI, and check the current dirty baseline is preserved.
- Walk the complete Client → Sales → Client path and the direct/on-behalf approval interaction. Confirm both dashboard and project detail use the same current published review, while the workflow appears only after the canonical approval read confirms it.
- Resolve contract or cache gaps, including route changes while a dialog is open, resubmission in another session, denial after cached content, legacy missing snapshots, and draft changes that must not appear in Client reads.
- Check no unrelated schema, lockfile, permission expansion, generated output, or production operation entered the diff.

### T6. Review the integrated result

Owner in Mode A: `integrity_reviewer`, read-only after all writers finish. In Mode B: primary agent. Acceptance criteria: AC1–AC5.

Review stable project identity, authorized snapshot selection, currency units, PDF/screen version matching, stale-browser decisions, direct/on-behalf races, immutable history, Sales feedback lineage, query invalidation, and preservation of existing drawing tools. Fix confirmed findings before final verification.

### T7. Verify and report

Owner in Mode A: `verification_runner` after review fixes finish; primary agent owns browser inspection and any fixes. In Mode B: primary agent. Acceptance criteria: AC1–AC6.

Start with focused commands from the respective workspace:

- Backend: `npm test -- tests/estimate-client-review-service.test.ts tests/estimate-client-decision.test.ts tests/estimate-client-response-routes.test.ts tests/estimate-pdf-routes.test.ts tests/estimate-publication.test.ts` plus the new Client read/route tests from T2.
- Transactional backend: `npm test -- tests/estimate-client-decision-mongo.replica-set.test.ts tests/estimate-publication-mongo.replica-set.test.ts` for the changed decision/resubmission behavior.
- Frontend: `npm test -- src/features/client/ClientProject.test.tsx src/features/client/ClientDashboard.test.tsx src/features/client/ClientDashboard.collapsible.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/estimateDrawingJourney.test.tsx src/features/leads/LeadEstimateWorkspace.test.tsx` plus any new focused Client review tests.
- Contract inventory: backend `npm test -- tests/api-docs.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts` when affected by the final API shape.
- Both workspaces: `npm run typecheck` and `npm run build`. Broaden to the relevant shared suites if changed contracts or a concrete failure warrant it; do not repeat passing checks without a new reason.
- Browser: inspect the actual Client project and shared dashboard review at desktop, tablet, and narrow mobile widths; check 200% text zoom, long names/totals, keyboard navigation, confirmation/form focus, and accessible names. Exercise pending, revising, approved, no estimate, missing source, failed read, and stale-decision states. Use local fixtures and temporary ignored screenshots without customer data.
- Repository: `git diff --check` and `git status --short`. There is no lint script; do not claim a lint pass.

Report exact checks/results, the principal affected files, any unrun check or remaining risk, and temporary artifact locations. No migration, external communication, commit, push, or deployment is part of this plan.

## Implementation and review evidence

- Client commercial values now come from the immutable submitted review snapshot. Decisions and PDF downloads identify the displayed round; stale versions require refresh. Missing or conflicting sources produce an explicit unavailable state.
- Client project detail and the dashboard share estimate review, confirmation, explained change requests, and cache invalidation. Project detail uses stable project IDs and retains the approved-estimate workflow visibility condition.
- Sales sees the latest commercial feedback through draft saves and resubmission. Existing on-behalf approval remains available through its established proof workflow.
- Integrity review found and resolved one drawing compatibility issue: a design-only change request leaves its commercial round pending. That snapshot remains readable with commercial decisions disabled; drawing tools remain available at the submitted estimate version. Sales edits hide mutable drawing metadata while retaining the published proposal. The reviewer confirmed the fix and reported no remaining finding.
- Browser QA used synthetic local API fixtures, with no customer-data or backend mutation. Desktop 1440px, tablet 768px, and mobile 390px had no horizontal overflow. Inspected 200% root text resizing, shared dashboard entry, approval/change dialogs, required explanation, initial focus, Escape focus restoration, success focus, approved/revising states, missing snapshot, empty result, failed read, and stale-decision refresh. Screenshots and scripts: `/tmp/lisno-client-review-baseline/`.
- Frontend final focused lane: 7 files, 67 tests passed, including rendered interaction and axe checks.
- A broader journey run exposed two additional fixture mismatches before the new commercial review paths: a newly created project uploads before completing workflow prerequisites, and the OCR mock omits the model's `deletedAt: null` default. Code review traced both to unchanged blocks already present in HEAD. No baseline rerun demonstrated their pre-task status; the final focused journey lane covers the changed Client queue, decision, and project-reuse paths.

### Final checks

| Check | Result |
| --- | --- |
| Backend presentation/review/decision/routes/PDF/publication/Leads, exact seven-suite command in T7 plus `estimate-client-presentation.test.ts` and `leads.test.ts` | 164 passed across 7 files |
| Estimate decision and publication replica-set suites | 21 passed across 2 files |
| API docs, frontend authorization contract, route-operation registry | 83 passed; 3 unrelated registry assertions failed |
| `npm test -- tests/full-journey.test.ts -t 'row 82\|row 84\|reuses the Admin-created'` | 3 passed; 10 intentionally filtered |
| Frontend T7 command plus `ClientProject.estimateReview.test.tsx` | 67 passed across 7 files |
| Backend `npm run typecheck` and `npm run build` | Both passed |
| Frontend `npm run typecheck` and `npm run build` | Both passed; Vite reports chunks larger than 500 kB |
| `git diff --check`, `git status --short` | Passed; preserved prior work and moved this session's browser outputs to `/tmp` |

The route-registry tests hard-code 254 operations; the unchanged registry has 257, including existing chat-availability and daily-critical-task operations. `git show HEAD` and empty diffs for those sources/tests confirm this mismatch predates the current changes. No Client estimate operation key was added. Evidence: `/tmp/lisno-client-review-baseline/final-registry-head-evidence.log`.

The first sandboxed backend run failed on local-listener `EPERM`; the permitted rerun passed the 164 feature tests. Replica tests report Mongoose `new`-option deprecation warnings. No lint script exists. Full backend/frontend suites and OCR tests were not run. Logs are `/tmp/lisno-client-review-baseline/final-*.log`; visual artifacts are in the same directory. No dependency or lockfile changes, migration, seed, commit, push, deployment, or external communication was performed.
