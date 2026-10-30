# Main Line Configuration vendor suggestions: task plan

Date: 2026-10-30
Status: T0–T5 and follow-up F0–F3 complete; compact suggested-vendor panel locally verified on 2026-10-30
Specification approval: User approved on 2026-10-30 in this conversation
Source of truth: [Approved specification](../specs/2026-10-30-main-line-configured-vendor-suggestions-design.md)
Execution mode: A, parallel sub-agents, selected by the user on 2026-10-30

## Outcome

Both Project Manager vendor-suggestion entry points list only vendors linked to the selected Main Line in its current saved Configuration. The backend enforces membership when creating or reinstating a recommendation. Procurement reviews the saved recommendation and explicitly selects eligible vendors for its existing basket BOQ bid request.

The user's choice is explicit: **Only vendors linked to the selected Main Line.** Reuse the current saved budget-reference relationship, the existing PM APIs and scoped suggestion records, and the current Procurement dispatch workflow.

The specification and task plan were approved separately, followed by the user's explicit Mode A choice. The approved requirements are unchanged.

## Verified starting point

- `project-manager/estimates.ts` currently searches the whole saved vendor directory after validating the selected approved Main Line.
- Configuration's `buildItemSummary` derives vendor IDs from retained `pricing.payload.priceEntries` price-version references for the saved draft, otherwise active revision.
- `vendor-suggestion-commands.ts` checks effective vendor activation, but not the Main Line vendor relationship.
- `requirePMMainLineScope(..., { forWrite: true })` fences the Main Line aggregate. Configuration section saves and revision activation also update that aggregate/version, providing the existing concurrency boundary.
- `vendor-suggestion-reads.ts` supplies both PM and Procurement projections. `canEdit` currently covers note/status edits together, so a separate reinstatement availability projection is needed to retain note/withdraw access after unlinking.
- `PMVendorSuggestions.tsx` shares the UI between the project Procurement tab and the estimate page. Its current held candidate object can outlive a refreshed candidate result; selection must be revalidated against fresh response data.
- `backend/tests/helpers/pm-estimate-handoff.ts` currently creates Main Lines with empty pricing payloads. Existing tests and browser fixtures need explicit linked-vendor data rather than assuming all vendors belong to every line.
- The worktree already contains substantial modified and untracked PM/Procurement implementation. No existing source, test, contract, or earlier documentation file is changed by this planning stage.

## Contract settled by this plan

### Configuration membership

Add `backend/src/services/main-line-vendor-links.service.ts` as a shared internal reader for candidate lookup, commands, and suggestion readiness. It accepts distinct Main Line IDs and the caller's Mongo session, and returns per-line discriminated results:

- Available: exact Main Line ID, chosen revision ID/version, and distinct vendor IDs.
- Unavailable: the Main Line ID and a safe reason; callers must not treat this as a valid empty list.

Use `selectCurrentMainLineRevision` for draft-first selection. Validate the selected revision, pricing section ownership, retained reference shapes, price-version ownership, and referenced vendor existence. Query only the IDs and metadata needed for membership, without returning budget prices or vendor contact/profile data.

Missing pricing or explicitly unconfigured/not-applicable pricing with no references can represent an empty linked set, consistent with existing fixtures and the approved specification. A configured payload must be structurally valid. Contradictory applicability, malformed references, dangling price versions/vendors, or foreign Main Line/revision ownership produce unavailable state. Multiple valid references to the same vendor deduplicate to one ID. Retained reference membership is independent of a price's effective window or one chosen mode; no price selection occurs here.

Keep the resolver narrow and reuse established saved-reference semantics. Do not refactor the broader Configuration item/context services merely to share a few parsing lines. On a suggestion page, batch by distinct current Main Lines and retain unavailable results per line so one damaged configuration does not erase other suggestion history.

### Public API and errors

Retain the current request bodies, route operations, candidate page shape, and suggestion persistence schema. Add one optional response property to `PMVendorSuggestion`:

```ts
reinstatementAvailability?: {
  available: boolean;
  reason: string | null;
};
```

The updated backend supplies this for Main Line suggestions. For a withdrawn suggestion, availability requires current owned/editable scope, write readiness, a current vendor link, and effective vendor activation. It does not require dispatch readiness such as contact, KPI, basket classification, or active Configuration pricing. Non-withdrawn records return unavailable because reinstatement is not an applicable action. Legacy project-wide behavior stays unchanged.

`canEdit` continues to govern note edits/withdrawal independently of vendor-link membership. `bidEligible` additionally requires a verified current link when interpreting a recommendation. Add safe current-link problems to `readinessReasons`; keep historical activity untouched.

Use two explicit HTTP 409 error codes:

| Code | Meaning | UI recovery |
| --- | --- | --- |
| `PM_MAIN_LINE_VENDOR_CONFIGURATION_UNAVAILABLE` | The current saved vendor relationship cannot be verified. | Explain Configuration needs attention; allow lookup retry and preserve the note. |
| `VENDOR_SUGGESTION_VENDOR_NOT_LINKED` | A submitted vendor is absent from the valid current linked set. | Clear the stale selection, refresh linked vendors, and require a valid selection before retry. |

A valid empty set returns a successful empty candidate page. Search-empty text depends on whether a search is active. Existing approved-source, access, index-readiness, duplicate, activation, and version-conflict errors retain their meaning.

Handle these two errors separately from the current generic `pmEstimateConflict` branch. A vendor-link problem must not misleadingly ask the user to approve a changed estimate source. Existing committed idempotency receipts are replayed before applying new membership validation to a retry.

Document the additive field and lookup semantics in the existing PM OpenAPI module. No new endpoint, authorization permission, data collection, index, dependency, or migration is planned. Backend-first delivery is appropriate for a future release; deployment is not authorized here. If a refreshed older response lacks reinstatement availability, the UI keeps reinstatement unavailable with a refresh explanation instead of guessing from `canEdit` or `bidEligible`.

## Dependency order and ownership

The primary agent owns the integrated contract, documentation, baseline preservation, and final reconciliation. Keep one parent phase in progress. Conditional Mode A delegation is described below; no agents start until the user selects that mode. In Mode B, the primary agent performs every task sequentially.

| Task | Deliverable | Depends on | Owner and exclusive write boundary | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T0 | Captured baseline and focused regression evidence | Plan approval and execution-mode selection | Primary; temporary evidence only | AC1–AC9 preservation baseline |
| T1 | Shared response/error contract and OpenAPI documentation | T0 | Primary; `backend/src/contracts/project-manager-estimates.ts`, `frontend/src/features/project-manager/pmEstimateTypes.ts`, `backend/src/openapi/project-manager-estimates.ts`, and focused OpenAPI assertion changes in `backend/tests/api-docs.test.ts` | AC5, AC6, AC8 |
| T2 | Shared membership resolver; candidate, command, and readiness integration; backend regressions | T1 | Backend owner; backend paths listed below | AC1–AC5, AC7, AC8 |
| T3 | Linked-vendor UI, stale-selection recovery, reinstatement behavior, and rendered tests/fixtures | T1 | Frontend owner; frontend paths listed below | AC3, AC5, AC6, AC8, AC9 |
| T4 | Integrated handoff and integrity review | T2 and T3 complete | Primary; coordinate any fixes through the original owners after review | AC1–AC9 |
| T5 | Final verification, responsive browser QA, and handoff record | T4 findings resolved and writers stopped | Verification owner plus primary; evidence outputs and this plan's results section | AC1–AC9 |

T2 and T3 can safely run in parallel after T1 is complete. T1 is not concurrent with either writer. Backend shared fixtures belong solely to T2; frontend shared fixtures belong solely to T3. T4 and T5 are sequential. Do not run final integrated checks against a worktree with active writers.

In Mode A, use `backend_implementer` and `frontend_implementer` for T2/T3, then `integrity_reviewer` for T4, then `verification_runner` for T5. Give each agent the approved spec, settled contract, exact files, baseline location, invariants, and a reminder that others are working in the same tree and their edits must be preserved. Any new contract or boundary issue returns to the primary agent before a worker edits shared files. In Mode B, perform the equivalent implementation, review, and verification inline without implementation agents.

### T0: Preserve the worktree and establish a baseline

1. Capture `git status --short`, tracked target diffs, and exact copies/hashes of affected tracked and untracked target files under `/private/tmp/lisno-main-line-vendor-links-baseline/`. Include the fixture and contract files, since many already belong to prior uncommitted work.
2. Re-read target diffs before assigning write ownership. Do not restore files from HEAD, stage work, or absorb unrelated changes.
3. Run focused existing PM estimate/suggestion and Procurement suggestion tests, plus the PM rendered and Procurement suggestion frontend tests. Record actual results, not counts from earlier plans. These baseline runs establish any pre-existing failures; do not fix unrelated failures.
4. Record a synthetic reproduction: two approved lines with different linked vendors currently receive the global-directory picker. Existing tests may require a new failing case during T2 to demonstrate this precisely.

### T1: Settle shared contracts before writers start

1. Add the optional `reinstatementAvailability` property consistently to backend/frontend types and OpenAPI, preserving exact schema required-property rules for existing fields.
2. Update the candidate endpoint summary/description to say current Configuration-linked vendors. Document the two membership conflict outcomes using established API documentation conventions.
3. Add focused schema assertions where the existing API-doc tests inspect PM contracts. Do not alter authorization inventories, route registration, request bodies, or shared generic schemas.
4. Hand the fixed property/error semantics to both owners. Further non-material naming corrections are coordinated by the primary agent; a material behavior change requires specification reconciliation before implementation continues.

### T2: Backend membership, commands, and recommendation readiness

Exclusive production ownership:

- New `backend/src/services/main-line-vendor-links.service.ts`.
- `backend/src/services/project-manager/estimates.ts`.
- `backend/src/services/project-manager/vendor-suggestion-commands.ts`.
- `backend/src/services/project-manager/vendor-suggestion-reads.ts`.
- `backend/src/services/project-manager/approved-source.ts` only if a small adjustment is needed to reuse the existing Configuration write fence without weakening it.
- `backend/src/services/procurement-main-line-suggestions.service.ts` only if its existing projection needs adjustment after shared-read integration.

Exclusive test/fixture ownership:

- `backend/tests/helpers/pm-estimate-handoff.ts`.
- `backend/tests/project-manager-estimates.replica-set.test.ts`.
- `backend/tests/project-manager-vendor-suggestions.replica-set.test.ts`.
- `backend/tests/procurement-main-line-suggestions.replica-set.test.ts`.
- `backend/tests/project-manager-estimate-routes.test.ts` for safe membership error propagation, if needed.
- A new focused `backend/tests/main-line-vendor-links.replica-set.test.ts` if separating resolver corruption/pagination cases improves clarity.

Implementation:

1. Implement the batched resolver and regression fixtures for distinct linked sets, saved draft precedence, malformed/missing/foreign references, absent pricing, and deduplication. Use the caller's session and preserve the existing transaction restrictions on parallel Mongo operations.
2. Restrict both candidate count and candidate query by `_id` membership before search/sort/pagination. Keep linked blocked vendors visible and reuse the existing readiness mapper. Do not expose prices, email, KPI internals, or raw Configuration objects.
3. Validate membership for create and actual withdrawn-to-suggested transitions inside the existing project/source/Main Line-fenced transaction. Preserve authorization before replay, replay semantics, duplicate identity, actor ownership, CAS, and all-or-nothing audit/receipt writes.
4. Exercise concurrent Configuration saves/activation through the actual aggregate update boundary. A save ordered after link removal must reject; a suggestion committed before removal may persist as a historical recommendation with updated current readiness. Avoid asserting that every possible ordering must reject.
5. Resolve links once per distinct current Main Line in suggestion reads. Add removal/unavailable reasons, clear recommendation `bidEligible` when required, and compute reinstatement availability independently of dispatch eligibility. Do not fold membership into the general `canEdit` predicate.
6. Preserve old-source, project-wide, temporary-item, financial-source, and actual bid-activity behavior. Ensure a missing link has no side effect on ordinary Procurement vendor eligibility or already issued invitations.
7. Update shared backend fixtures to create valid retained budget references without modifying approved values. Add asymmetric line/vendor/project cases; keep existing test assumptions explicit rather than linking every vendor to every line in all tests.

The ordinary basket eligibility service, tender/dispatch implementation, Configuration editor, persistence model, and migration files are outside this write boundary. If a demonstrated defect requires changing one, return the evidence to the primary agent before expanding scope.

### T3: Frontend interaction and synthetic fixtures

Exclusive production ownership:

- `frontend/src/features/project-manager/PMVendorSuggestions.tsx`.
- `frontend/src/features/project-manager/pmEstimatesApi.ts` for membership-error classification/recovery only if needed.
- `frontend/src/features/project-manager/pm-estimations.css` only for a demonstrated layout/accessibility issue.
- `frontend/src/features/procurement/ProcurementBasketSuggestions.tsx` only if existing readiness rendering does not adequately expose the new reasons.

Exclusive test/fixture ownership:

- `frontend/src/features/project-manager/ProjectManagerEstimationsPage.test.tsx`.
- `frontend/src/features/project-manager/ProjectManagerWorkspace.test.tsx` for the shared panel entry point.
- `frontend/src/features/procurement/ProcurementBasketSuggestions.test.tsx`.
- `frontend/src/test/fixtures/enterprisePMEstimateData.ts` and `enterpriseTransport.test.tsx` for the scoped synthetic flow, preserving unrelated fixture behavior.
- `frontend/src/test/fixtures/enterpriseTransport.ts` only if a focused fixture hookup is required; do not rework other transport branches.

Implementation:

1. Use the approved linked-vendor labels, count, search, and distinct empty states in the existing dialog. Preserve native controls, explanatory readiness messages, and pagination.
2. Store a selected vendor ID or derive eligibility from its matching row in the fresh current candidate response. Disable submission when the selected vendor disappears, becomes non-suggestable, or the lookup becomes stale/unavailable. Clear selection on line/search/page changes and membership conflicts; preserve the note.
3. Distinguish the explicit membership errors from source/version conflicts, with a lookup retry that does not silently rebase the estimate. Preserve denial handling and protected-cache clearing.
4. Use `reinstatementAvailability` for withdrawn-row action availability and the editor's save guard. A blocked reinstatement must not disable note editing or permitted withdrawal; do not infer reinstatement from `bidEligible` or parse human-readable reasons as logic.
5. On successful creation, set the suggestion-list source to current, selected Main Line to the saved line, and offset to zero, then show confirmation. Retain existing behavior for note/status updates. Clearly state that the dialog uses the current approved source when launched from a history list.
6. Preserve current project/actor/source/line query keys, existing mutation invalidation, and polling. Candidate polling must actually affect the selected vendor's eligibility. No global Configuration cache refactor is needed.
7. Make synthetic fixtures return distinct linked sets and validate membership on mock create/reinstate, so browser QA demonstrates the approved behavior. Add explicit reinstatement availability and blocked cases.
8. Cover both PM entry points, history-to-current success, empty/error/retry, link removal during an open dialog, temporary items, disabled vendors, keyboard selection, accessible status messages, and focus return. Procurement tests must prove removed/unavailable recommendations cannot be selected while independent directory controls remain unaffected.

### T4: Integration and integrity review

1. Inspect the combined diff against T0, including earlier dirty file contents. Confirm only assigned changes were made and backend/frontend/OpenAPI semantics agree.
2. Trace one real disposable-database journey: linked candidate → PM suggestion → Procurement review → explicit selection → existing fake-delivery bid request. Confirm a saved suggestion itself creates no invitation or email, and the activity remains tied to the actual line/source/BOQ.
3. Review fail-closed membership, draft precedence, foreign reference rejection, per-line batching, authorization, race ordering, idempotent receipts, CAS, financial immutability, temporary-item identity, and historical compatibility.
4. Review frontend response refresh, source/history filters, reinstatement availability, protected caches, and ordinary Procurement selection. Confirm no new vendor-link restriction was added to its independent dispatch path.
5. Fix confirmed findings through the owning slice, then re-run affected tests. Complete review before starting final verification.

### T5: Final checks and handoff

Run the focused verification below on the integrated worktree after writers stop. Use disposable replica-set databases and synthetic browser data. Preserve no production credentials or customer data in evidence.

Store new logs/screenshots under `/private/tmp/lisno-main-line-vendor-links-verification/`. Use the existing frontend synthetic harness, the relevant browser tooling skill, and local frontend serving only as needed. Do not start seed scripts or change persistent database indexes. Inspect screenshots rather than relying solely on test assertions.

Record exact commands/results, any baseline failures or unrun checks, artifacts, and remaining limitations in this plan. Confirm no dependency/lockfile, migration, real dispatch, deployment, commit, push, or unrelated source changes occurred.

## Verification matrix

| Acceptance criteria | Evidence |
| --- | --- |
| AC1–AC3 | Resolver/candidate replica-set tests: two same-basket lines with different linked sets, overlap, duplicate names/IDs/references, more than 20 candidates, draft/active divergence, blocked vendors, blank/search-empty state, corrupt/foreign/dangling references, no fallback. |
| AC4 | Command tests: valid create, forged unrelated vendor, wrong project/assignment, reassignment, removal before submit, Configuration race at the aggregate boundary, duplicate requests, committed replay after unlinking, and no partial receipt/audit/suggestion writes on rejection. |
| AC5 | PM/Procurement reads and commands: unlink/restoration, preserved history and activity, note/withdraw access, blocked reinstatement, active linked vendor with dispatch-only blockers, malformed membership, source/CAS conflict. |
| AC6 | PM rendered tests at both entry points: fresh linked list, stale selected object regression, membership errors with retained note, source/history-to-current creation, pagination reset, loading/error/denial, keyboard/focus behavior. |
| AC7 | Disposable-database handoff with fake delivery; existing tender and ordinary basket selection tests; no send on suggestion save; unrelated same-basket line and mismatched approved-source controls. |
| AC8 | Temporary items with own links; legacy project-wide compatibility; approved values across two unequal projects unchanged; no permission expansion or private data in candidate/readiness DTOs. |
| AC9 | Browser interaction and visual checks at 390px and 1440px: long names, valid/blocked/empty/error states, linked-set change, history filter, keyboard/focus, no overflow, console/network review, and scoped accessibility checks. |

### Exact focused commands

Run each command from the named workspace. The resolver test filename is planned, not currently present; run it only if created in T2, otherwise use the equivalent cases in the PM estimate test file.

Backend:

```text
npm test -- tests/main-line-vendor-links.replica-set.test.ts --maxWorkers=2
npm test -- tests/project-manager-estimates.replica-set.test.ts tests/project-manager-vendor-suggestions.replica-set.test.ts tests/procurement-main-line-suggestions.replica-set.test.ts --maxWorkers=2
npm test -- tests/project-vendor-suggestions.replica-set.test.ts tests/procurement-basket-vendor-eligibility.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts --maxWorkers=2
npm test -- tests/project-manager-estimate-routes.test.ts tests/project-manager-openapi.test.ts tests/api-docs.test.ts --maxWorkers=2
npm run typecheck
npm run build
```

Frontend:

```text
npm test -- src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/procurement/ProcurementBasketSuggestions.test.tsx --maxWorkers=2
npm test -- src/features/project-manager/ProjectManagerOperationalAccess.test.tsx src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/procurementBasketApi.test.ts src/test/fixtures/enterpriseTransport.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```

Repository:

```text
git diff --check
git status --short
```

Run only the relevant subset for T0; run all applicable focused lanes for T5. Broaden to the authorization/route inventory lane if those contracts change, and to Configuration suites if existing Configuration consumers are edited. Run whole workspace suites if the final diff becomes cross-cutting or an unresolved regression requires them; otherwise the specified focused lanes plus both typechecks/builds are the planned verification scope. No lint script exists, and OCR is unaffected.

## Approval boundary and current results

The user approved this plan and selected Mode A. Local implementation and verification are authorized; real external actions and persistent database changes remain outside scope.

### Implementation record

- T0: captured 2,156 source/test/contract/document files, hashes, initial dirty paths, and the pre-change tracked diff under `/private/tmp/lisno-main-line-vendor-links-baseline/`. The independent membership audit confirmed existing transactional aggregate fencing and strict saved-reference identity checks, including `priceEntryId` and root/Signature-only budgets.
- Baseline frontend command for `ProjectManagerEstimationsPage.test.tsx` and `ProcurementBasketSuggestions.test.tsx` passed 27/27 tests in two files. The read-only runner's backend attempt could not open Mongo sockets; root's rerun of the three planned PM/Procurement service replica suites passed 51/51 in 23.60 seconds before service writers started.
- T1: added the optional reinstatement-availability response property to backend/frontend types and OpenAPI. The root's `npm test -- tests/api-docs.test.ts tests/project-manager-openapi.test.ts --maxWorkers=2` passed 71/71 tests. These contract-only changes were made while the backend baseline retry was pending; the service behavior and baseline test files remained unchanged until its successful result.
- T2/T3 complete: backend and frontend agents stayed within the plan-defined ownership. The primary agent retained shared contracts and integration. Backend membership uses the exact root/Signature saved budget references and existing transaction fence; the UI resolves the selected ID from fresh candidates. No new production Procurement component, schema, dependency, or migration was required.
- T4 complete: the independent integrity review found no blocking backend defect. One P3 UI finding was fixed: cached empty results no longer claim no linked vendors after an unavailable refresh, and a shrinking later page gives an explicit remaining-count/Previous vendors message. Both regressions pass; the reviewer accepted the fix. A follow-up test explicitly compares both unequal projects' complete approved estimates, immutable customer review rounds, and canonical Procurement snapshots before/after suggestion operations and unlinking. Only the coordination epoch is excluded; the reviewer accepted this coverage.
- Browser checks completed with synthetic data on loopback port 4187 at 390×844 and 1440×1000. PM estimation and project Procurement entry points show the correct linked sets, preserve notes after removal, support keyboard selection/focus return, and reveal a new current-source suggestion after creation from history. Procurement review requires explicit selection and preserves ordinary directory selection. The final PM flow had no runtime errors, unexpected requests, overflow, or axe violations. The buyer page-wide scan reported existing contrast issues in unchanged directory status/sidebar text; no violation targeted the recommendation panel. Screenshots were inspected. Evidence: `/private/tmp/lisno-main-line-vendor-links-verification/browser/results.md`.

### Final integrated verification

All source writers stopped before this verification. The integrity reviewer accepted both the empty-state fix and the unequal-project financial regression; no review finding remains open.

| Check | Result |
| --- | --- |
| Backend: seven replica-set suites listed below | 165/165 tests passed; seven files; exit 0 |
| Backend: PM routes, PM OpenAPI, API documentation | 110/110 tests passed; three files; exit 0 |
| Frontend: PM estimates/workspace and Procurement suggestions | 94/94 tests passed; three files; exit 0 |
| Frontend: operational access/navigation, Procurement workspace/API, synthetic transport | 135 passed, three pre-existing failures; five files; exit 1 |
| Backend and frontend `npm run typecheck` | Both passed, exit 0 |
| Backend and frontend `npm run build` | Both passed, exit 0; frontend retains a >500 kB chunk warning |
| `git diff --check` | Passed, exit 0 |
| Baseline preservation and final status | 21 intended paths changed against captured baseline, including the two working documents. Only two new source/test paths; no captured file removed. Source hashes stayed unchanged during final verification. |

Exact final test commands (workspace specified):

```text
backend: npm test -- tests/main-line-vendor-links.replica-set.test.ts tests/project-manager-estimates.replica-set.test.ts tests/project-manager-vendor-suggestions.replica-set.test.ts tests/procurement-main-line-suggestions.replica-set.test.ts tests/project-vendor-suggestions.replica-set.test.ts tests/procurement-basket-vendor-eligibility.replica-set.test.ts tests/procurement-basket-tender.replica-set.test.ts --maxWorkers=2
backend: npm test -- tests/project-manager-estimate-routes.test.ts tests/project-manager-openapi.test.ts tests/api-docs.test.ts --maxWorkers=2
frontend: npm test -- src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/procurement/ProcurementBasketSuggestions.test.tsx --maxWorkers=2
frontend: npm test -- src/features/project-manager/ProjectManagerOperationalAccess.test.tsx src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/procurementBasketApi.test.ts src/test/fixtures/enterpriseTransport.test.tsx --maxWorkers=2
```

The three failing synthetic transport tests are unrelated baseline defects: the protected workflow-document scenario cannot find its Client Kick off button, and the `/procurement` and `/home` project-gallery scenarios encounter duplicate Aurora Villa article selectors. Reproduced all three against the captured pre-task source in an isolated temporary environment, with all 1,147 frontend file hashes matching before and after. The same titles/errors failed: three failed, 67 skipped, exit 1. No live source was changed for the reproduction.

```text
baseline frontend: npm test -- src/test/fixtures/enterpriseTransport.test.tsx -t 'opens the protected read-only workflow document|renders /procurement with local filters|renders /home with local filters' --maxWorkers=2
```

Evidence remains under `/private/tmp/lisno-main-line-vendor-links-verification/`: `backend-final-replica.log`, `backend-final-static.txt`, `final-runner-summary.md`, `final-runner-*.log`, `baseline-reproduction/baseline-reproduction.log`, `baseline-reproduction/hash-verification.json`, `final-preservation.json`, `integrated.diff`, `changed-files.json`, and the browser evidence directory. The local Vite server and task browser were stopped. Existing Mongoose deprecation warnings remain.

### Handoff and limits

- Main production changes: the new `main-line-vendor-links.service.ts`; PM candidate, command, and suggestion-read services; the shared PM suggestion dialog; synchronized backend/frontend/OpenAPI response shapes. Test fixtures and focused regressions cover the changed workflow. Existing Procurement selection/dispatch production code was preserved.
- No dependency or lockfile change, schema/index migration, seed, backfill, real invitation/email, production mutation, deployment, commit, or push occurred. Unrelated dirty/untracked work was preserved against the captured baseline.
- Full workspace suites and OCR tests were not run; the approved affected-suite matrix, both typechecks/builds, integrity review, replica-set tests, and responsive browser checks were run. There is no lint script. Browser checks used synthetic data and desktop Chromium viewport emulation, not a physical mobile device or performance benchmark.
- The full frontend compatibility lane is not green because of the three confirmed pre-existing synthetic tests. Page-wide buyer accessibility also retains the unchanged sidebar/directory contrast findings documented above. Neither affects the verified linked-vendor dialog or changes the approved scope.
- The Configuration-save concurrency regression exercises actual section/aggregate persistence and the PM fence with a test-local Configuration authorization guard. Separate asymmetric-project/actor tests cover access boundaries; no transaction semantics were weakened.

## 2026-10-30 follow-up: compact suggested-vendor panel

User feedback: the vendor list is still not visible and the Estimate source control is unnecessary. Source trace confirms candidates mount only inside the creation dialog; the screenshot's All approved items state makes no candidate request. The lower empty box concerns saved suggestions. Correct this presentation within the same approved feature and selected Mode A. The backend membership/authorization/financial contract is unchanged.

Latest user steering explicitly says to show only suggested vendors in this section, with no unnecessary content. The updated specification’s PM-interaction section governs: a compact saved-vendor list and one Suggest vendor action, no panel selectors/explanation/routine refresh/empty pagination. The dialog contains the current Main Line selector and linked vendors, defaulting to the first line unless an estimate-row target was supplied. Preserve immutable history through the existing all-sources query with no line filter; collapse secondary row details. Preserve note/source conflict recovery, focus return, and all command safeguards. The preliminary inline-form approach was stopped before completion; it is superseded by this dialog-based presentation.

| Task | Owner / boundary | Verification | State |
| --- | --- | --- | --- |
| F0: trace and capture current state | Primary; 2,158 file copies/hashes plus dirty-path/diff capture under `/private/tmp/lisno-vendor-inline-followup/` | Screenshot/source match; existing work preserved | Complete |
| F1: compact panel and direct dialog discovery | Frontend implementer: `PMVendorSuggestions.tsx`, `pm-estimations.css`, PM estimate/workspace test files; estimate page only if focus integration needs it | Minimal empty/populated panel, no source dropdown, dialog default/changed/targeted line, current/history save, stale/removal/unavailable/access cases, keyboard focus | Complete; only the four primary files changed, estimate page untouched |
| F2: review integrated correction | Integrity reviewer, read-only; primary coordinates fixes | No duplicate picker, no hidden stale submit, no history-based create targets, unchanged API/source safeguards | Complete; pending-save reset and shrinking saved-page findings fixed and accepted |
| F3: final checks and rendered QA | Verification runner and primary, no concurrent source writers | Focused PM/Procurement/navigation tests, frontend typecheck/build, 390/1440 browser interactions and screenshots, diff/status and baseline preservation | Complete; results below |

No backend, contract, fixture, dependency, migration, or ordinary Procurement production changes are planned. If a demonstrated defect requires those areas, reconcile the evidence and boundary before editing. The earlier verification remains historical evidence; F3 will verify the final corrected frontend.

### Follow-up final result

The panel now contains saved vendor suggestions and one direct **Suggest vendor** action. Main Line selection and linked vendors live in the popup. The Estimate source control, panel filters, explanatory paragraph/eyebrow, routine refresh, and empty/single-page pagination were removed. Secondary row content is collapsed. The all-sources saved list has no Main Line filter, preserving historical/project-wide records without offering historical-only create targets.

The review's pending-save reset bypass and shrinking-saved-page issues were corrected and regression-tested. Final independent integrity review has no open finding. Only `PMVendorSuggestions.tsx`, `pm-estimations.css`, and the two PM test files changed in this follow-up, plus the specification/plan. No source changes occurred during final verification; there are no new files in the repository, dependency/lockfile changes, backend/API/fixture edits, or changes to the estimate-page entrypoint.

Final checks, from `frontend/`:

```text
npm test -- src/features/project-manager/ProjectManagerEstimationsPage.test.tsx src/features/project-manager/ProjectManagerWorkspace.test.tsx src/features/procurement/ProcurementBasketSuggestions.test.tsx src/features/project-manager/ProjectManagerEstimateNavigation.test.tsx src/features/project-manager/ProjectManagerOperationalAccess.test.tsx --maxWorkers=2
npm run typecheck
npm run build
```

- **113/113 tests passed**, five files, exit 0. Typecheck and build passed, exit 0; the existing >500 kB bundle warning remains.
- `git diff --check` passed and final status was inspected. Captured baseline comparison confirms only the four owned frontend paths and two working documents differ; unrelated dirty/untracked work remains intact.
- Browser checks passed at 390×844 and 1440×1000 for compact empty/populated panels, both entry points, default/targeted/switched lines, linked disabled vendors, keyboard/focus, removed links, note retention, saving, and error/empty states. An empty saved list still allows the configured picker. Screenshots were inspected; no runtime errors, unexpected requests, or overflow occurred. No accessibility violation targeted the changed panel/dialog. A page-wide scan observed one contrast issue in the unchanged surrounding Procurement busy Refresh button; other recorded scans were clean.
- Evidence: `/private/tmp/lisno-vendor-inline-followup/final-verification.md`, `final-tests.log`, `followup.diff`, `changed-files.json`, `verification-preservation.json`, and `browser/results.md` with scripts/screenshots. Temporary task server/browser were stopped.
- Backend, OCR, full workspace suites, and the unrelated full synthetic transport suite were not rerun for this frontend-only correction. Prior baseline test/contrast findings remain documented above. No migration, seed, persistent data mutation, external send, deployment, commit, or push was performed.
