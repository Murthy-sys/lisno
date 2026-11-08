# Sales recommendation single-item Add: task plan

Date: 2026-11-08
Status: Implemented in Mode A; scoped verification passed; full-suite failures documented

## Authority and source of truth

The user approved the [specification](../specs/2026-11-08-sales-recommendation-single-item-add-design.md)
on 2026-11-08, then approved this task plan and selected Mode A. The specification's
requirements and acceptance criteria AC1–AC6 remain authoritative.

Implementation and bounded native subagents are authorized. Keep one parent
task in progress; parallel slices are children of task 2.

## Baseline and boundaries

- Tracked files have no local changes. Initial untracked paths are the approved
  Sales specification and the two completed OCR repair workflow documents.
  Preserve all three; this plan is the only new file at this gate.
- Prior read-only reproduction confirmed that one Add selects one target but
  projects unrelated previews from its parent basket into both rooms. Existing
  `salesEstimateCatalogue.test.ts` and `LeadEstimateRecommendations.test.tsx`
  passed: 24 tests across two files. Their target-basket fixtures lack siblings.
- Backend contracts, pricing formulas, Configuration data, authorization,
  `selectedMainBasketIds` save associations, and approved artifacts stay intact.
- No dependencies, manifests, lockfiles, production data, migrations, commits,
  pushes, deployment, or customer communication are in scope.

## Implementation contracts

Settle exact TypeScript names in task 1 before parallel writers begin. The
following behavior and ownership boundaries are fixed:

1. **Selection contract.** Keep Add keyed by room/Main Line and checked against
   basket/Sub Basket, current recommendation sources, and editability. Only the
   target can become included. Existing targets retain their values; repeated
   equivalent Add events cannot create duplicates or increase quantity.
2. **Visibility contract.** Maintain a workspace-owned set of baskets introduced
   only by recommendations and explicit browse choices keyed by room/basket.
   Neither belongs in estimate payloads or dirty fingerprints. For the active
   room, derive which selected baskets may expose unselected catalogue rows.
3. **Projection contract.** Extend `buildSalesEstimateCatalogue` with an optional
   explicit browse-basket set; omission preserves current callers' behavior.
   A compact basket can project valid included rows but cannot create sibling
   previews. Keep missing/incompatible sources in established review sections.
   Excluded local values stay in draft state even when their rows are hidden.
4. **Hydration contract.** On first load, a selected basket is compact when it
   has included configured selections and every such selection has nonempty
   recommendation origins. Empty selected baskets and baskets with independent
   included selections use normal browsing. Missing/empty origins mean independent
   selection; do not infer provenance from names. Ordinary save/refetch must
   preserve current visit choices, pruning removed room/basket IDs as necessary.
   Actor/lead changes reset presentation state.
5. **Setup and browse contract.** Explicit Setup selection grants normal basket
   browsing. Adding a previously unselected recommendation basket grants only
   its required save association. `Browse other items in <basket>` reveals
   choices for the active room without changing any selected item or amount.
6. **Feedback contract.** Sales opts into current target grouping context,
   single-item helper text, and visible accessible action feedback. A receipt
   identifies the accepted target and originating room without claiming a save.
   Existing boolean/void callback compatibility and default Client/other-role
   behavior remain intact. Rejections and no-op duplicate requests do not emit
   a new successful-add receipt. Room changes clear stale feedback; ordinary
   source-query refresh after a successful Add must not immediately erase it.

## Dependency-ordered tasks

### 1. Capture baseline and finalize component contracts

Owner: primary agent. Dependencies: approved plan and execution choice.
Covers: AC1–AC6.

- Recheck status and per-target diffs; understand and preserve any new user work.
- Trace initial hydration, save-success reconciliation, Setup basket toggles,
  workspace key/reset behavior, recommendation acceptance, and popup focus.
- Finalize the optional projection input and Sales-only presentation props
  before assigning files. Identify a minimal optional per-basket content slot
  in the shared builder shell only if needed for an accessible browse action.
- Prepare synthetic fixtures with two unequal rooms; three differently priced
  items in the target Sub Basket; an unrelated Sub Basket; an independent saved
  selection; and persisted exclusions. Include target-beyond-page-one coverage.
- Record contracts in this plan. Any material behavior change requires updating
  the specification; routine implementation naming does not reopen approval.

### 2. Build independent projection and recommendation presentation slices

Dependencies: task 1. In Mode A, slices 2A and 2B may run concurrently with the
explicit, non-overlapping ownership below. In Mode B, implement them inline.
Each writer must preserve others' edits and stay inside its assigned files.

#### 2A. Catalogue visibility and hydration helpers

Owner in Mode A: one `frontend_implementer`. Covers: AC1, AC2, AC4, AC5.

Owned files under `frontend/src/features/leads/`:

- `salesEstimateCatalogue.ts` and `salesEstimateCatalogue.test.ts`.
- A small `salesRecommendationScope.ts` and matching test if a pure helper is
  needed for first-load classification and browse-set derivation.

Deliverables:

- Preserve existing hierarchy/identity validation while filtering unselected
  previews through the explicit browse set.
- Derive compact state from existing saved selection/provenance fields without
  changing draft values or fabricating missing data.
- Cover several siblings, multiple Sub Baskets, two rooms, empty and independently
  selected baskets, missing origins, exclusion preservation, and unchanged totals.
- Keep current catalogue callers compatible by default. Do not edit the
  workspace, builder, recommendation views, shared shell, or API types.

#### 2B. Exact target context and visible receipt

Owner in Mode A: a separate `frontend_implementer`. Covers: AC1, AC3, AC5, AC6.

Owned files:

- `frontend/src/features/leads/EstimatorRecommendations.tsx` and its test.
- `frontend/src/features/estimates/EstimateRecommendations.tsx`, its test, and
  `estimateSelection.css` for strictly scoped feedback styling.
- `frontend/src/features/leads/roomRecommendations.ts` and its test only if
  context must be carried through the existing flattened recommendation model.

Deliverables:

- Carry authorized Main Basket/Sub Basket labels alongside the existing stable
  target identity, including individually displayed Sub Basket children.
- Opt Sales into `Add selects this item for this room.` and a visible polite
  status naming the accepted item and room. Preserve default inline consumers.
- Keep Add/Remove focus behavior, bounded pagination, Close/Escape, loading and
  stale/error handling. Do not duplicate live announcements or create dialogs.
- Test accepted/rejected actions, one-child selection, source refresh after Add,
  room/context transitions, long labels, and default Client-compatible behavior.
- Do not edit the workspace, catalogue projection, builder, shared shell, or
  Client production sources. Report any necessary integration props to primary.

### 3. Integrate workspace scope and basket browsing

Owner: primary agent. Dependencies: both task-2 slices finished and reviewed.
Covers: AC1–AC6.

Primary-owned files:

- `frontend/src/features/leads/LeadEstimateWorkspace.tsx`.
- `frontend/src/features/leads/ConfiguredEstimateBuilder.tsx` and its test.
- `frontend/src/features/leads/LeadEstimateRecommendations.test.tsx`.
- `frontend/src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx`.
- `frontend/src/features/estimates/EstimateBuilderShell.tsx` and its test only
  for a necessary optional per-basket content slot; existing callers unchanged.
- Existing builder view-state types/styles only if required; do not duplicate
  workspace-owned visibility state in shared shell state.

Implementation and integrated regressions:

- Initialize compact scope only at the appropriate hydration boundary; preserve
  per-room browse choices across save/refetch and Builder/Summary remounts.
- Mark a newly recommendation-introduced basket compact after an accepted Add,
  while retaining its backend-required parent association. Explicit Setup
  selection/removal and room removal must update presentation scope consistently.
- Pass the active room's browse set to the catalogue projection. Keep included
  and required correction rows visible while omitting unrelated preview groups.
- Render the browse action in a stable reachable basket location, including
  when that basket has no included items in the current room. Do not label an
  intentionally compact basket as a missing-catalogue error.
- Reveal only the relevant target group/page after Add. Preserve other collapse
  choices, the popup's action focus, and existing edited/excluded values.
- Wire Sales-only context/feedback props. Apply the same stable Sales working
  draft boundary already used by direct catalogue browsing and the popup.
- Assert exact selection and payload differences before/after Add, not merely
  that the target is present. Verify manual values, integer-paise subtotal/tax/
  total deltas, unaffected other-room totals, save/reload identities and origins.
- Exercise Sub Basket child recommendations, repeated equivalent Add requests,
  targets beyond page one, stale rejection, shared-source cleanup, room switching,
  deliberate browsing, save/refetch, and fresh-load provenance classification.

### 4. Review the integrated change

Dependencies: task 3; all writers finished. Covers: AC1–AC6.
Owner: `integrity_reviewer` in Mode A; primary inline in Mode B.

- Review exact mutation scope, duplicate handling, source lineage, stale/read-only
  guards, data serialization, room/actor reset boundaries, totals, excluded edits,
  query transitions, and shared Client/Designer compatibility.
- Review races between Add, source refresh, save hydration, and room switching.
  Confirm rejected actions cannot modify browsing scope or announce success.
- Resolve material findings within the assigned scope and rerun affected checks
  before final verification. No concurrent product-source edits during review.

### 5. Verify the finished worktree and rendered interaction

Dependencies: task 4 and any resulting fixes. Covers: AC1–AC6.
Owner: `verification_runner` in Mode A; primary inline in Mode B.

Run focused regressions first, from `frontend`:

```sh
npm test -- src/features/leads/salesEstimateCatalogue.test.ts src/features/leads/salesRecommendationScope.test.ts src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateRecommendations.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx
npm test -- src/features/leads/roomRecommendations.test.ts src/features/leads/EstimatorRecommendations.test.tsx src/features/estimates/EstimateRecommendations.test.tsx src/features/estimates/EstimateBuilderShell.test.tsx src/features/client/ClientQuotation.recommendations.test.tsx src/features/leads/configuredEstimate.test.ts src/features/leads/LeadEstimateWorkspace.revisions.test.tsx
```

Omit the proposed scope-helper test path if that helper was unnecessary; record
the actual final commands. After the focused lane passes, run the integrated
frontend checks because the change touches shared presentation and draft state:

```sh
npm run typecheck
npm test
npm run build
```

Rendered QA must use synthetic data and intercepted/mocked API traffic, never
real estimate writes. Load the applicable browser skill when executing it:

| Scenario | Evidence required |
| --- | --- |
| Desktop 1440×900, newly introduced basket | One new selected row; siblings hidden; exact visible receipt; footer usable |
| Mobile 390×844, long item/group names | Wrapped readable context/status; reachable actions; no horizontal overflow |
| Two rooms and explicit browse | Other room unchanged; browse reveals unchecked choices without changing counts/totals |
| Keyboard and page-two target | Add/Remove focus retained; target discoverable; Close/Escape works; no focus theft |
| Save/refetch, reload, stale failure | Scope and saved IDs correct; no false success or extra selection |
| Shared/default and historical callers | Existing presentation and permission restrictions preserved |

Check relevant accessibility names/live status, console errors, and failed
fixture requests. Use existing tools/dependencies; document any environment
restriction and retry the same bounded check through the tool approval mechanism
where applicable. Do not substitute a passing unit test for missing browser QA.

### 6. Record results and hand off

Owner: primary agent. Dependencies: task 5 and all agent results reconciled.
Covers: AC1–AC6.

- Inspect the complete diff and run `git diff --check` and `git status --short`.
  Verify manifests, lockfiles, backend contracts and unrelated work are preserved.
- Record each acceptance criterion's evidence, exact commands/results, browser
  scenarios, warnings, and any unrun or blocked checks in this plan.
- Report and remove task-created temporary screenshots, fixture harnesses and
  logs when no longer needed. Preserve pre-existing ignored outputs and caches;
  report generated `frontend/dist`/build outputs without staging them.
- Briefly report the behavior change and principal files, validation, remaining
  limitations, and absence of migrations/external actions. Do not claim lint
  passed; the repository has no lint script. Do not call incomplete verification
  complete.

## Execution record

Task 1 baseline: tracked diffs remain empty; only the four workflow documents
are untracked. No dirty product targets were assigned.

Final integration interfaces:

- Projection accepts optional `browseMainBasketIds: ReadonlySet<string>`;
  omitted means all selected baskets. Compact baskets suppress excluded rows
  and previews while preserving valid included rows.
- `inferRecommendationOnlyBasketIds(lines, selectedMainBasketIds)` classifies
  initial saved scope from included configured-line provenance.
- `salesCatalogueBrowseBasketIds(selectedMainBasketIds,
  recommendationOnlyBasketIds, browsedBasketIds)` derives the active-room browse
  set. The workspace owns the last argument independently for each room.
- The staff recommendation adapter accepts optional
  `selectionFeedback: { contextKey: string }`. The key identifies the stable
  workspace/room, not the changing recommendation-source query. Only Sales
  passes it; shared default presentation stays compatible.
- A minimal optional basket content slot in the builder shell may host compact
  scope guidance/browsing; the primary owns that shared interface.

Task 2 completed: projection/scope slice passed 18 tests in 2 files; context/
feedback slice passed 56 tests in 4 files, including Client compatibility.
The read-only lifecycle audit confirmed workspace ownership, initial-vs-refresh
hydration boundaries, and functional basket updates. Task 3 integration is in
progress. The browser fixture is being prepared separately using synthetic data.

Task 3 completed: integrated workspace regression checks passed (15 recommendation
tests and 10 catalogue tests). They assert exact saved IDs, origins, prices,
two-room totals, compact reload, explicit browse persistence across save/refresh
and Summary, and duplicate callback rejection. Typecheck passed. Builder checks
passed 36 tests, including page-two target reveal and guarded Browse focus
recovery. The synthetic browser server and cached Playwright CLI are available;
loopback/browser sandbox restrictions were resolved through tool escalation.
Task 4 read-only integrity review is in progress; product writers are finished.

Initial integrity review found no confirmed data, mutation, or compatibility
defects. Browser QA then reproduced a focus gap during the real Add-triggered
source-query reload: the temporary empty/loading list moved focus to Close and
discarded the chosen action. The feedback writer is retaining pending action
focus through loading with user/room/close cancellation, and retaining Sales
recommendation pagination using the stable room feedback key. These are within
AC6 and the existing focus contract. A focused re-review and integrated checks
will follow before task 5 is complete.

Interim synthetic browser checks passed exact target/payload and paise totals,
manual values, room-specific browsing, compact save/reload, Browse keyboard
focus, mobile long-label wrapping, horizontal-overflow checks, and reachable
Save. These will be repeated on final sources after the focus correction.

The first focus correction passed desktop, mobile, page-two and stale/recovery
browser assertions. A bounded re-review then identified intentional pointer
departure to non-focusable text and reordered recommendation targets as edge
cases. Screenshot review also showed that a restored page-two action could be
focused below the popup's scroll viewport. The final bounded correction cancels
pointer departure, anchors the page to the accepted target until the user pages,
and reveals that action by scrolling only the popup content. Final checks are
pending these changes; earlier browser results are not final verification.

Task 4 completed: the follow-up review confirmed pointer cancellation and stable
target anchoring, with one last scroll finding. Reveal is now one-shot per action
or restoration; subsequent ready renders preserve deliberate popup scrolling.
The primary inspected that resolution, and all writers have stopped. The final
component/Client lane passed 55 tests in 3 files. Task 5 integrated verification
is in progress.

Final browser verification completed against the finished sources with the
cached Playwright CLI and real workspace components under synthetic auth/API
fixtures. All six scripts passed: desktop single Add/save/room/browse/reload;
mobile long names; catalogue and recommendation page two; reordered targets
crossing pages; deliberate pointer departure; and stale rejection/recovery.
The page-two check also preserved manual popup scrolling through a later resize.
Desktop was 1440×900 and mobile 390×844. Visible receipts, accessible names,
keyboard Enter/Escape and action/Browse focus, exact saved IDs/origins, no
horizontal overflow, and usable Save controls were checked. Exact synthetic
post-Add totals were 94,690 paise subtotal, 17,044 paise GST and 111,734 paise
total; the other room stayed at 45,000 paise. Final browser console had zero
errors and zero warnings; fixture unexpected-request lists stayed empty.

Browser limits: this was Chromium with mocked APIs and a small harness shell,
not live-backend/customer data or full application navigation. Screenshots were
visually inspected. Temporary harness `/private/tmp/lisno-sales-recommendation-qa`,
screenshots `output/playwright/sales-single-add/`, and this run's `.playwright-cli`
logs/snapshots are being removed. The browser and loopback server are stopped.

Final focused lanes passed: 5 files / 79 tests and 7 files / 113 tests, both
exit 0. The full frontend lane is still running; fixture failures are being
isolated before classification. No product writes are in progress.

## Final handoff and verification results

Implementation and review are finished. Sales Add includes only the chosen
room/Main Line, adds its required parent save association, and keeps unrelated
previews hidden until an explicit room-specific Browse action. Initial saved
scope uses existing provenance; presentation choices never enter dirty-state
fingerprints or payloads. Visible feedback names the item/room. Target paging,
refresh focus, pointer departure and one-shot popup scrolling are covered.
Default Client/Designer presentation and backend contracts are preserved.

All commands below were run from `frontend/` unless stated otherwise. The two
focused commands are the exact commands recorded under task 5 above.

| Check | Result |
| --- | --- |
| Focused lane 1 | Exit 0; 5 files, 79 tests passed |
| Focused lane 2 | Exit 0; 7 files, 113 tests passed |
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 1; 415 files passed, 8 failed; 6,417 tests passed, 92 failed |
| `npm run build` | Exit 0; 3,334 modules transformed; large-chunk warning |
| Six final synthetic browser scripts | Passed on final sources; details above |
| Repository `git diff --check` | Exit 0 |
| Repository `git status --short` | Only expected frontend files and workflow documents |

Acceptance evidence:

- AC1: exact one-target save payload, Sub Basket child selection, same-batch
  duplicate rejection, save/reload and browser page-two checks.
- AC2: sibling/Sub Basket omission, unchanged Setup basket browsing, two-room
  isolation, explicit unchecked browsing, and hydration-helper regressions.
- AC3: item/group/source/room context, visible status, rejection and stable-room
  feedback tests, plus desktop/mobile rendered checks.
- AC4: two unequal rooms, manual rate/quantity preservation, exact integer-paise
  totals and saved IDs/origins in workspace tests and synthetic browser checks.
- AC5: shared-source cleanup, exclusions, stale/read-only and saved-revision
  regressions, Client compatibility, and stale browser recovery.
- AC6: 1440×900/390×844 visual inspection, long labels, 38 recommendation
  children, page changes/reordering, action and Browse keyboard focus,
  Enter/Escape, no focus theft, deliberate scrolling, and reachable Save.

### Full-suite limitation

The full frontend suite is not green. These test files were not edited by this
task; only the explicitly confirmed selector drift below is established to
predate it. Do not interpret this report as proof that all 92 failures are
pre-existing or as a clean repository-wide regression result.

| Failing file under `frontend/src/` | Failed / total |
| --- | --- |
| `test/fixtures/enterpriseTransport.test.tsx` | 4 / 71 |
| `features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx` | 31 / 46 |
| `features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx` | 4 / 17 |
| `features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx` | 1 / 10 |
| `features/estimates/EstimateReviewPanel.collapsible.test.tsx` | 1 / 15 |
| `features/admin/AdminProjectInitiationDialog.test.tsx` | 1 / 38 |
| `features/estimates/AskLisnoLauncher.test.tsx` | 34 / 48 |
| `features/ai-estimator-knowledge/KnowledgeScreens.test.tsx` | 16 / 121 |

Isolated diagnostics:

```sh
npm test -- src/test/fixtures/enterpriseTransport.test.tsx
npm test -- src/features/admin/AdminProjectInitiationDialog.test.tsx src/features/estimates/AskLisnoLauncher.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeSectionStateRemoval.test.tsx src/features/ai-estimator-knowledge/KnowledgeItemWorkspaceLayout.test.tsx src/features/ai-estimator-knowledge/KnowledgeModeLayout.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/ai-estimator-knowledge/KnowledgeScreens.test.tsx --maxWorkers=1 -t 'preserves new values after a failed request|personalizes the welcome|preserves a previously saved PMC margin|connects the approved workspace hooks|keeps the Mode Surface selector adjacent|keeps client estimate details collapsed|keeps the summary unchanged while Mode edits'
```

The first exited 1: 67 passed, the same four failed. It expected the missing
`Review recommendations` button (line 320), a missing Client Kick off control
(line 544, before any document access), and a unique Aurora Villa article on
both Procurement and Home (line 708, but two matched). HEAD already rendered
`Recommendations` in the Sales popup before this task while the unchanged test
expected `Review recommendations`, confirming that specific older mismatch.

The second exited 1: six failed, one passed, 288 skipped. Admin's representative
failure passed in isolation, suggesting timing sensitivity. The other sampled
failures reproduced missing UI labels/controls or source/CSS expectations.
The full run also emitted an MSW missing `basket-requests` handler and JSDOM
canvas-context warnings from axe-core. These failures remain unresolved.

### Cleanup and boundaries

Task-created browser harness, screenshots and CLI snapshots/logs were removed;
the local browser and fixture server were stopped. The two isolated diagnostic
logs in `/private/tmp/lisno-sales-*-verification.log` were summarized here and
removed. The pre-existing ignored `frontend/dist` directory was refreshed by
the build and retained. Existing unrelated OCR workflow documents were preserved.

No dependency/lockfile, backend, shared API, OCR, financial formula or storage
changes were made. Backend/OCR suites were not run for this frontend-only change;
live-backend and other-browser checks were not performed. No lint script exists.
No migrations, real estimate writes, staging, commits, pushes, deployment or
external communication occurred.
