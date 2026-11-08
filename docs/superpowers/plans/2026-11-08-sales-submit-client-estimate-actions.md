# Sales Submit and client estimate actions: task plan

Date: 2026-11-08
Status: Implemented in approved Mode A; focused, build and rendered checks passed; broader-suite failures recorded

## Authority and scope

The user approved the [specification](../specs/2026-11-08-sales-submit-client-estimate-actions-design.md)
on 2026-11-08 and confirmed the client quotation/estimate screen as the client
target. Its Sales requirements, client state table and AC1–AC6 are the source of
truth. This plan does not expand publication rights or alter approval semantics.

After task-plan approval, the repository workflow requires a separate execution
choice. No product implementation or subagents begin before that choice. In
Mode A, tasks 2A and 2B may run in parallel with the ownership below. In Mode B,
the primary performs the same tasks inline. Keep one parent task in progress.

## Baseline and worktree preservation

The current dirty changes belong to the preceding single-item recommendation
fix and must remain intact. At this planning boundary, the dirty set is:

- Modified under `frontend/src/features/estimates/`: `EstimateBuilderShell.tsx`,
  `EstimateRecommendations.tsx`, `EstimateRecommendations.test.tsx`,
  `estimateSelection.css`.
- Modified under `frontend/src/features/leads/`:
  `ConfiguredEstimateBuilder.tsx` and its test, `EstimatorRecommendations.tsx`
  and its test, `LeadEstimateRecommendations.test.tsx`,
  `LeadEstimateWorkspace.tsx`, `roomRecommendations.ts` and its test,
  `salesEstimateCatalogue.ts` and its test.
- New scope helper and test: `salesRecommendationScope.ts` and
  `salesRecommendationScope.test.ts` under the same leads directory.
- Five existing untracked workflow documents: the OCR repair spec/plan, the
  single-item recommendation spec/plan, and this task's approved specification.

The workspace, shared shell and relevant style diffs were inspected during
specification. Recheck target diffs immediately before assigning writers. The
Sales writer explicitly owns extending the dirty workspace, preserving all
preceding recommendation scope, duplicate, save and focus changes. Client targets
are currently clean. Shared files remain primary-owned unless reassigned explicitly.

Previous verification recorded 192 focused tests passing, successful frontend
typecheck/build and browser QA, but 92 broader-suite failures across eight files.
This is historical evidence, not a new passing baseline. Record new commands
and compare any failures before assigning causality. Do not fix unrelated tests
or weaken assertions to make a broad run appear green.

## Execution record

- User approved the plan and selected Mode A. Sales and client writers have
  non-overlapping ownership; the primary owns shared presentation changes.
- Initial full tracked diff captured temporarily at
  `/private/tmp/lisno-actions-initial.patch`. Prior recommendation changes are
  preserved. Client targets were clean before implementation.
- Focused baseline: the first two Sales/client lanes combined passed, **9 files,
  201 tests** (`vitest run`, 13.24 seconds).
- Read-only client audit confirmed save-aware Setup navigation, retained unknown
  save destinations, current-review identity checks and PDF failure blocking.
- Compatibility detail: valid incomplete client Setup still supports one
  draft-only Save setup changes action; eligible Setup uses Save and continue.

## Implementation contracts

1. **Sales availability.** Keep authoritative eligibility and one displayed
   blocking reason consistent. Separate showing Submit from permission to use
   it. Prefer reusing existing guards and a small pure reason derivation if
   needed; avoid a second independent permission/state machine.
2. **Sales submission.** Changing the active view must not deny an otherwise
   valid Sales draft. Setup submission reads current draft state, passes all
   existing checks, opens the existing checklist, saves once, and submits using
   the returned version. Confirmation preserves explicit approval/delivery
   consequences. A denied/unknown capability remains denied.
3. **Client actions.** Derive the displayed actions from existing dirty, busy,
   stale, unknown-save, editing and published-review state. Keep one footer
   decision area. Use an accessible local options disclosure for infrequent
   actions, without adding a UI package or a new global navigation system.
4. **Money and approvals.** Preserve saved/submitted labels and server amounts,
   review IDs/versions, confirmation and change-note flows, current actor/session,
   query invalidations and immutable snapshots. Unsaved amounts cannot become
   approval inputs. Client saves still return to staff confirmation as required.
5. **Presentation boundaries.** Workspace footers reserve enough content space
   to avoid overlaps; embedded quotations stay in document flow. Use existing
   tokens and buttons. Shared component changes, if necessary, are optional and
   retain current default behavior for other consumers.

## Dependency-ordered tasks

### 1. Confirm the baseline and settle action contracts

Owner: primary. Dependencies: approved plan and execution choice. Covers AC1–AC6.

- Recheck status and relevant diffs; preserve all prior edits listed above.
- Trace Sales Setup state through `draftInput`, save reconciliation, publication
  guards, checklist context and footer measurement. Confirm that allowed Setup
  submission cannot serialize stale selections or bypass readiness checks.
- Reconcile the client state table with actual setup saving, unknown-write
  verification, review navigation and submitted decision handlers.
- Run the focused Sales/client lanes below as a baseline before behavior edits.
  Record any existing failures so later failures can be attributed accurately.
- Finalize the blocking-reason order, footer/disclosure structure, and any minimal
  shared presentation option. Do not reopen approved product decisions unless
  evidence requires a material scope or authority change.

### 2. Implement the two bounded UI slices

Dependencies: task 1. Mode A can run 2A and 2B concurrently. Both writers must
know they share the worktree, preserve others' changes, and stay inside ownership.

#### 2A. Sales Save draft and Submit

Owner: one `frontend_implementer` in Mode A, primary in Mode B. Covers AC1, AC2,
AC5 and AC6.

Owned files under `frontend/src/features/leads/`:

- `LeadEstimateWorkspace.tsx`.
- `LeadEstimateWorkspace.test.tsx`, `LeadEstimateWorkspace.checklist.test.tsx`,
  `LeadEstimateWorkspace.collaboration.test.tsx`, and
  `LeadEstimateWorkspace.revisions.test.tsx` where their assertions are affected.
- A small Sales-local action helper/component and matching test only if the
  existing workspace cannot express the action state clearly without duplication.

Deliverables:

- One Save draft/Submit pair in editable Sales Setup/Builder/Summary/Proposal;
  remove the separate Sales Setup save control and preserve Setup navigation.
- Enabled Submit only for a valid authorized draft; concise accessible reason
  for disabled states, including Designer-owned post-design publication.
- Reuse the existing publication flow, locking, checklist and save-before-submit
  sequencing. Preserve historical/other-role behavior and authorized resend.
- Tests for valid Setup submission, empty/incomplete Setup, capability/permission
  denial and refresh, stale/version changes, save/submission failure, repeated
  confirmation, and correct recipient/effect wording.
- Do not change backend code, the client slice, recommendation components,
  shared styles, shared checklist components or the shared Setup footer. Report
  any necessary shared changes to the primary.

#### 2B. Client quotation action hierarchy

Owner: a separate `frontend_implementer` in Mode A, primary in Mode B. Covers AC3–AC6.

Owned files under `frontend/src/features/client/`:

- `ClientQuotation.tsx`, `ClientQuotationSetup.tsx`,
  `ClientQuotationSubmittedView.tsx`, and `clientQuotation.css`.
- `ClientQuotation.test.tsx`, `ClientQuotation.setup.test.tsx`,
  `ClientQuotationSetup.test.tsx`, and `ClientQuotation.recommendations.test.tsx`.
- A client-local options/action component and test only if reused meaningfully
  between editable and submitted quotation views.

Deliverables:

- Items/Summary navigation, one clear status/financial summary and an Estimate
  options disclosure for available secondary actions.
- State-specific footer actions for dirty saves, setup save-and-continue,
  opening a verified review, waiting/read-only states and recovery. Avoid
  duplicate controls and preserve explicit discard/unknown-save behavior.
- Submitted view with Back navigation, secondary PDF access, and one approval/
  request-changes area. Keep review version, tax totals and change comparisons.
- Scoped responsive styling for desktop/mobile workspaces and embedded estimates;
  stable focus, Escape/return behavior, wrapping and safe content spacing.
- Tests assert state transitions, exact save/review payload identity and
  preservation of local edits, not only replacement button labels.
- Do not edit Sales files, shared CSS/components, API contracts or authorization
  helpers. Request any necessary shared presentation change from the primary.

### 3. Integrate shared presentation and end-to-end regressions

Owner: primary. Dependencies: task 2 writers finished. Covers AC1–AC6.

- Review and reconcile both slices, including the previously dirty workspace.
- Own any necessary changes to `frontend/src/styles/estimator-dashboard.css`,
  shared Setup/footer primitives, or `ClientPublishedEstimate.tsx` and its tests.
  Prefer local composition; shared changes require compatible defaults.
- Own `ClientProject.estimateReview.test.tsx` and any additional cross-screen
  regression. Update previous recommendation tests only when an intentional
  action-label/layout change requires it, preserving their behavior assertions.
- Verify two unequal estimates/rooms retain correct identity, saved/submitted
  values and review versions. No API request may derive permission from button
  visibility. Refreshes and late results must not enable stale actions.
- Confirm one Sales action pair, one client primary decision area, usable error
  recovery, and no loss of single-item recommendation behavior.

### 4. Review the integrated result

Dependencies: task 3; all writers stopped. Owner: `integrity_reviewer` in Mode A,
primary in Mode B. Covers AC1–AC6.

- Audit Setup submission, source freshness, permissions, checklist reset,
  save-before-submit versions, duplicate prevention and delivery wording.
- Audit client unknown saves, dirty navigation, review snapshot identity,
  read-only states, PDF targeting, query invalidation, dialogs and focus.
- Review footer containment, options disclosure and compatibility with embedded
  quotations and other roles. Resolve material findings and rerun affected tests
  before final verification; avoid concurrent product edits during the review.

### 5. Verify final sources and rendered screens

Dependencies: task 4 and its fixes. Owner: `verification_runner` in Mode A,
primary in Mode B. The primary may perform independent synthetic browser QA in
parallel with automated verification while product sources remain unchanged.

Focused lanes from `frontend/`:

```sh
npm test -- src/features/leads/LeadEstimateWorkspace.test.tsx src/features/leads/LeadEstimateWorkspace.checklist.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx
npm test -- src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/ClientQuotationSetup.test.tsx src/features/client/ClientProject.estimateReview.test.tsx src/features/client/clientQuotationReview.test.ts
npm test -- src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/estimates/ClientPublishedEstimate.visibility.test.tsx src/features/estimates/ClientPublishedEstimate.temporary.test.tsx
```

Include any new helper/component tests. Then run `npm run typecheck`, `npm test`
and `npm run build`. Compare broad failures with the recorded baseline; isolate
relevant/new failures before classification. No unrelated failure cleanup or
repeated broad runs without new evidence. Backend/OCR suites are unnecessary
unless the approved frontend boundary changes; any such change must first be
reconciled with the specification. There is no lint script.

Rendered verification uses mocked auth/API responses and synthetic submissions,
approvals and PDFs, never real client data or delivery. Load the browser skill
when executing it. Check 1440×900 and 390×844:

| Scenario | Required evidence |
| --- | --- |
| Sales Setup and all item views | One Save/Submit pair; valid versus blocked states; consistent placement |
| Sales checklist and failures | Clear effect wording; one save then versioned submit; preserved draft on failure |
| Client clean, dirty and setup | Only relevant actions; save/discard and save-and-continue work |
| Client submitted review | Correct snapshot/PDF; approval and request changes retain confirmation |
| Stale, unknown save, access loss | Visible recovery; no accidental review, write or discarded input |
| Long labels, scrolling and keyboard | No overflow/occlusion; footer reachable; options/dialog focus and Escape work |
| Two embedded quotations | Independent state/identity; no overlapping global footers |

Inspect screenshots, accessible names, console errors and unexpected requests.
Report environmental limits rather than substituting unit tests for browser QA.

### 6. Record evidence and hand off

Owner: primary. Dependencies: task 5 and reconciled agent results. Covers AC1–AC6.

- Inspect the complete incremental diff and preserve earlier work. Run
  `git diff --check` and `git status --short`.
- Record exact checks/results, acceptance evidence, remaining failures, unrun
  checks, and generated build outputs in this plan. Do not claim a green suite
  or full verification where the evidence is limited.
- Stop task-created servers/browsers and remove only task-created temporary
  fixtures, screenshots and logs. Preserve pre-existing build outputs and caches.
- Report principal files, resulting behavior and risks. No dependencies,
  lockfile changes, migrations, real data mutations, commits, pushes, deployment
  or customer communication are part of this plan.

## Verification results (2026-11-08)

- Sales writer: 111 tests across the four workspace suites passed. Client writer:
  75 tests across quotation/setup/recommendations/options suites passed.
- Primary integration also updated `ClientEstimationWorkspace.test.tsx` and
  `ProjectQuotationWorkspace.test.tsx` to exercise the new options navigation and
  retain review IDs, versions, saved totals and other-role assertions.
- Integrity review found no outstanding defects. Reversing the initial patch in
  check-only mode succeeded, confirming the previous tracked recommendation
  changes remain present. A final read-only review approved the decision latch.
- Real-browser rapid confirmation exposed two identical client decision requests.
  The shared decision handler now latches synchronously after note validation,
  retains the latch through success/failure, and clears it only after recovery
  refresh. Added same-render duplicate-submit and failed-decision/refresh/retry
  regressions. No API or permission change was required.
- Final combined focused lane passed **19 files / 304 tests**, 15.94 seconds.
  It includes all three commands listed in task 5, plus
  `ClientQuotationOptions.test.tsx`, `ClientEstimationWorkspace.test.tsx`,
  `ProjectQuotationWorkspace.test.tsx`, and `EstimateSubmissionChecklist.test.tsx`.
- Final `npm run typecheck` passed. Final `npm run build` passed (9.87 seconds),
  with the existing warning for chunks over 500 kB.
- Full `npm test` ran once before/during the small decision-latch fix: **6,433
  passed / 91 failed**, 417 files passed / 7 failed, 116.60 seconds. It is not
  final verification of the latch; the final focused lane and build cover that
  change. No new failing file or increased count appeared compared with the
  preceding recorded baseline. The Admin initiation test passed this time.

| Broader-suite failing file | Failures |
| --- | ---: |
| `enterpriseTransport.test.tsx` | 4 |
| `KnowledgeModeSectionStateRemoval.test.tsx` | 31 |
| `KnowledgeItemWorkspaceLayout.test.tsx` | 4 |
| `KnowledgeModeLayout.test.tsx` | 1 |
| `EstimateReviewPanel.collapsible.test.tsx` | 1 |
| `AskLisnoLauncher.test.tsx` | 34 |
| `KnowledgeScreens.test.tsx` | 16 |

These are existing missing UI expectations and source/CSS assertions in unchanged
suites; this task does not claim the full suite is green. Backend/OCR suites and
migrations were not run because those sources/contracts are unchanged. There is
no lint script. No dependencies, lockfiles, commits, pushes, production writes,
deployment, or customer messages were performed.

Build/typecheck refreshed the existing ignored `frontend/dist/` and
`frontend/node_modules/.tmp/tsconfig.*.tsbuildinfo` outputs. Temporary browser
fixture and test logs are task-owned and removed at handoff; build outputs remain.

### Rendered acceptance and cleanup

Synthetic Playwright checks passed at **1440×900** and **390×844**, using actual
components, auth/query/router/feedback providers, styles and representative shell
classes. This is local mocked-API verification, not a live backend end-to-end run.

- Sales: one Save draft/Submit pair in Builder, Setup, Summary and Proposal;
  empty and Designer-owned drafts block submission with an accessible reason.
  Both widths verified exactly one draft PUT followed by one submit POST with
  returned version 8, `approveSales: true`, and the single selected source item.
  Failed saves send no submit; failed submissions preserve items.
- Client: native disclosure Enter, keyboard tabbing, Escape and focus return;
  one contextual Setup footer; dirty actions and unchanged saved total;
  submitted confirmation and note dialogs; exact review ID/version; one POST
  under rapid double-click; unknown save verification and version-conflict
  recovery preserving edits; clean draft, one Setup save-and-continue write;
  read-only and access-loss states; PDF targets the exact stored review round.
- Two unequal embedded estimates retain independent quantities and approval
  availability, with both footers in normal document flow.
- Measured document widths matched each viewport (no horizontal overflow).
  Workspace footers were visible within the viewport; embedded footers were
  static. Desktop/mobile builder, Setup, submitted view and checklist screenshots
  were inspected. Final core browser runs reported no console errors/warnings
  or unexpected API requests. An initial fixture-only missing favicon was fixed.
- Browser scenario transitions needed explicit fixture unmounting to remove
  unsaved-change guards between cases; the final clean runs passed. Test fixture
  response/selector issues were corrected without changing product behavior.

Task-created fixtures `/private/tmp/lisno-estimate-actions-qa/`, screenshots in
`output/playwright/estimate-actions/`, task-specific `.playwright-cli` logs and
snapshots, the initial patch and temporary test logs were removed. Task browser
sessions and loopback port 4182 were stopped. Existing build outputs were retained.

Final handoff: requested behavior implemented and relevant checks passed; the
broader pre-existing suite failures above remain the verification limitation.
