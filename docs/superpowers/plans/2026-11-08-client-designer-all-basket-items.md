# Client and Designer item selection across all baskets: task plan

Date: 2026-11-08
Status: Implemented and verified
Specification: [Approved design](../specs/2026-11-08-client-designer-all-basket-items-design.md)
Specification approved by the user on 2026-11-08.
Execution mode: A — parallel sub-agents, selected by the user.

## Outcome and constraints

Both Add items pickers expose all eligible Main Baskets and their associated Sub
Baskets/items. Adding selects only the chosen item in the current room and saves
any newly required parent scope atomically. Reuse Designer publication and Client
approval/request-changes behavior; correct post-design messages that name Sales.

Implementation is authorized for this scope. No schema migration, new dependency,
pricing formula change, permission expansion, commit, deployment or external
message is planned. Preserve all existing unrelated work, including earlier Sales
recommendation, Client action-layout, Designer entry-point and kickoff changes.

## Contract to use

- Reuse `GET /projects/:projectId/quotation/setup` for the Client-safe catalogue
  hierarchy. Keep available picker metadata separate from saved `detail.baskets`
  and saved removal groups. Do not expand saved scope merely to render filters.
- Extend the existing quotation candidate read across all eligible baskets,
  retaining visibility, availability, search, filter and pagination rules.
- Keep the current versioned `add` request shape. The backend resolves the chosen
  item's parent scope from its authoritative source and adds the basket ID and
  default classification inside the same transaction as the requested line.
  Never trust a new parent ID supplied by the browser or use configure-then-add.
- Preserve current source tokens, CAS, pricing, audit, approval invalidation and
  transaction rollback. Existing update/remove operations do not gain new scope.
- For Designer local drafts, distinguish scope introduced solely by an unsaved
  item addition from explicit/saved basket selections. Removing the last such
  addition before save must not persist an empty new basket. Keep rapid additions
  and room switching safe without creating sibling rows.
- Bind Client catalogue use to the current project, estimate version and login
  session; fail closed during a mismatched, refreshing or failed read. Preserve
  broad quotation-query invalidation after save and uncertain-outcome recovery.
- Preserve the existing separate Save draft and Send revised quotation actions.
  Approval and request changes remain bound to the exact submitted review version.

## Dependency-ordered tasks and ownership

### T1. Capture the baseline and confirm integration contracts

Owner: Primary agent. Dependencies: task-plan approval and execution-mode selection.

1. Capture the current dirty-path list and per-target diffs before writers start.
   Inspect prior edits in every assigned dirty file; give each writer its bounded
   ownership and explicitly require preservation of others' changes.
2. Confirm the existing setup response can supply picker hierarchy without adding
   another endpoint or exposing hidden metadata. Confirm candidate/source identity
   and group-removal overlap checks cover additions from unselected baskets.
3. Identify current draft recovery and basket selection state used for add/undo,
   including the existing recommendation scope helper, and reuse it where suitable.
4. Record the settled contract and any focused baseline failure in this plan.

Acceptance: AC1–AC5 invariants and ownership are settled before parallel writers.

### T2. Expand Client candidate reads and save parent scope atomically

Owner: Backend implementer in Mode A; primary agent in Mode B.
Dependencies: T1. Can run alongside T3 and T4 after the contract is settled.

Owned paths: `backend/src/services/quotation.service.ts`, narrowly needed helpers
in `quotation-setup.service.ts`, `backend/tests/quotation-edits.replica-set.test.ts`
and `quotation-approvals.replica-set.test.ts`. If descriptions must be updated,
own `backend/src/openapi/quotation.ts` and `backend/tests/quotation-openapi.test.ts`.
Do not change broad OpenAPI/authorization files without primary-agent coordination.

- Resolve candidates across all eligible baskets, excluding current and saved
  Client-hidden lines and hidden hierarchy/counts before filtering/pagination.
- Accept a valid add into an owned room even when its parent basket is unselected.
  Persist only required parent IDs/classifications and requested lines together;
  preserve unrelated, hidden, excluded and differently classified scope.
- Preserve source validation, duplicate/group-overlap checks, current revision
  rules, approval invalidation, immutable snapshots and audit writes.
- Test success and rollback, including multiple additions, an invalid later
  operation, audit failure, stale source/version, concurrent saves, unauthorized
  users, closed estimates and two unequal projects. Verify exact included rows
  and server totals, not only response success.

Acceptance: AC1–AC5, especially no partial basket writes or hidden-data disclosure.

### T3. Expand the Designer picker and keep additions local to one item

Owner: Designer frontend implementer in Mode A; primary agent in Mode B.
Dependencies: T1. Can run alongside T2 and T4.

Owned paths: `ConfiguredEstimateBuilder.tsx`, `LeadEstimateWorkspace.tsx`, their
focused tests, and narrowly required helpers/tests under `frontend/src/features/leads/`.
Do not edit the shared picker, Client feature files or backend paths.

- Supply the full authorized catalogue hierarchy to the Designer picker while
  retaining existing Sales catalogue behavior and read-only/locked-state handling.
- Add only the selected source line to the active room, include its parent basket
  and preserve classifications. Prevent duplicate and stale rapid additions.
- Reconcile implicit parent selection when an unsaved addition is undone; preserve
  explicit basket choices and other rooms. Save/reload must retain the chosen line.
- Extend the existing Designer add/save/submit regression to use a previously
  unselected basket and assert the unchanged initial approval and unrelated scope.

Acceptance: AC1, AC2, AC4–AC6.

### T4. Connect Client picker hierarchy and preserve its draft behavior

Owner: Client frontend implementer in Mode A; primary agent in Mode B.
Dependencies: T1. Can run alongside T2 and T3 using the agreed existing API shapes.

Owned paths: `frontend/src/features/client/ClientQuotation.tsx`, its tests,
`clientQuotationDraft.ts`, `clientQuotationCandidates.ts`, `quotationApi.ts` and
their focused tests if required. Do not edit shared picker/review components,
Designer editor files or backend paths.

- Load/reuse the safe setup hierarchy when the picker is needed, with current
  version/session identity and loading/error protection. Preserve Configure view.
- Filter across all eligible baskets and their own sub baskets; reset dependent
  filters and pagination safely. Keep saved groups separate from browse options.
- Render a newly added item in its correct parent group immediately, without
  inventing financial values or saved removal tokens. Retain required dimensions
  and existing Add/Added, undo, duplicate, save-conflict and recovery behavior.
- Save the existing add operation; rely on the backend's atomic parent inclusion.
  Invalidate every affected quotation view after save.

Acceptance: AC1–AC4 and AC6; retain Client-authored staff-review behavior for AC5.

### T5. Integrate shared UI and review messaging

Owner: Primary agent. Dependencies: T2–T4 complete for final integration.

Owned shared paths: `EstimateItemPicker.tsx` and its tests,
`ClientPublishedEstimate.tsx`, `ClientProject.estimateReview.test.tsx` and
`ClientEstimationWorkspace.test.tsx`. Primary agent also owns this plan, the
approved specification, cross-layer API reconciliation and any shared-file changes.

- Change the shared default label to **All Main Baskets** and adjust empty-state
  wording. Retain accessible naming, keyboard focus and compact layout.
- Identify the Designer in post-design change-request/revision messages; preserve
  Sales wording for initial review. Do not add another publication mechanism.
- Reconcile metadata, fresh-source gating, single-item additions and cache refresh
  across both editors. Confirm saved estimates retain all earlier feature changes.
- Verify Client approval and request changes through the existing exact-version
  flow after the Designer saves and submits an addition/edit.

Acceptance: AC1–AC6.

### T6. Review, verify and hand off the integrated result

Dependencies: All implementation writers finished. Keep this as the sole active
parent task once integration is complete.

In Mode A, run `integrity_reviewer` read-only on the integrated change, resolve
confirmed findings, then run `verification_runner`. In Mode B the primary agent
performs those steps sequentially. Review permission/source lineage, transaction
rollback, add/undo races, approval immutability, amounts and query invalidation.

Run focused backend checks from `backend/`:

```sh
npm test -- tests/quotation-edits.replica-set.test.ts tests/quotation-approvals.replica-set.test.ts tests/quotation-openapi.test.ts
npm run typecheck
npm run build
```

Replica-set tests must use the existing disposable `MongoMemoryReplSet` helper,
never a development or production database. A skipped transactional test is not
verification; diagnose local execution blockers without weakening transactions.

Run focused frontend checks from `frontend/`:

```sh
npm test -- src/features/estimates/EstimateItemPicker.test.tsx src/features/leads/ConfiguredEstimateBuilder.test.tsx src/features/leads/LeadEstimateWorkspace.catalogue.test.tsx src/features/leads/LeadEstimateWorkspace.collaboration.test.tsx src/features/client/ClientQuotation.test.tsx src/features/client/ClientQuotation.setup.test.tsx src/features/client/clientQuotationDraft.test.ts src/features/client/ClientProject.estimateReview.test.tsx src/features/client/ClientEstimationWorkspace.test.tsx
npm run typecheck
npm run build
```

Add narrowly affected helper/API suites only if changed. Do not run unrelated full
repository suites or repeat successful checks without a new change or concern.
No lint script exists; do not report lint as passing.

Use Playwright with synthetic fixtures and real components at desktop and mobile
widths. For both roles, inspect all-basket/sub-basket filtering, search, adding one
new-basket item, its correct group, undo, save/reload, keyboard focus and horizontal
overflow. Exercise stale/error recovery and the Designer submit/Client review
controls. Inspect screenshots; distinguish mocked browser checks from replica-set
backend verification. Do not send real customer messages or use customer data.

Finish with `git diff --check`, `git status --short`, a final targeted diff review
and comparison to the captured initial dirty paths. Remove only task-owned test
fixtures/screenshots/logs and stop task-owned browser/server processes. Record any
retained ignored build outputs, exact check results, unrun checks and limitations.
Report completion only when the acceptance criteria have evidence.

## Execution ordering and progress

Mode A: T1 → parallel T2/T3/T4 → T5 → integrity review → T6 verification/handoff.
Mode B: T1 → T2 → T3 → T4 → T5 → sequential review/verification/handoff.
Shared files remain with the primary agent; no writer overlaps are permitted.

T1 complete: baseline captured in `/private/tmp/lisno-all-baskets-initial-status.txt`
and `/private/tmp/lisno-all-baskets-initial.diff`. Existing safe setup hierarchy and
unchanged add request contracts confirmed. Backend, Client and Designer writers
have distinct ownership and must preserve prior dirty edits.

T2 complete: candidate reads cover all eligible baskets and the existing add
transaction persists only the chosen item and required parent scope. No API shape
change. Eight cross-basket transaction regressions added. Earlier focused edits
and OpenAPI run passed 84 tests; the final added overlap case passed in an eight-
case focused rerun. Existing fixture-margin edits were preserved.

T3 complete: Designer hierarchy, single-item parent selection and unsaved parent
cleanup implemented. Builder/catalogue/collaboration suites passed 75 tests.

T4 complete: Client uses the version/session-bound safe setup catalogue for picker
hierarchy; saved groups remain separate. Existing Client quotation/setup suites
passed 50 tests and the new `ClientQuotation.items.test.tsx` passed eight tests.

T5 complete: shared default label and empty state updated; post-design Client
review copy identifies the Designer. Shared picker passed three tests; the Client
estimation suite passed 31 tests including phase-aware change-request checks.

T6 verification complete. Independent integrity review found no blocking
defects in visibility, authorization, CAS/audit rollback, grouping, parent-scope
undo, stale-session handling or existing publication. Final consolidated tests
passed: frontend **207/207 across 10
suites**, backend **112/112 across three suites**. Both workspace typechecks and
production builds exited 0; `git diff --check` passed. Frontend build retains its
existing chunk-size warning (over 500 kB). Verification observed unchanged hashes
for 64 source/test files throughout the run. The frontend command above included
the new `ClientQuotation.items.test.tsx` suite.

Browser verification passed four cases: Client and Designer at 1440px and 390px.
Both showed the full eligible Main Basket hierarchy and matching Sub Baskets,
searched across new scope, added one item with no siblings/duplicates, undid it,
saved/reloaded it and preserved the other room. Candidate failure blocked Add;
Retry recovered and Escape returned focus. No page errors or unmatched API mocks
occurred during the normal matrix. The injected 503 was expected. Screenshots were
visually inspected. Mobile document width was 375px within a 390px viewport with a
scrollbar; picker/search occupied x=16–359, with no horizontal overflow.

Browser fixtures used real `ClientQuotation` and `ConfiguredEstimateBuilder`
components, existing styles and synthetic data/API. The Designer fixture used a
controlled adapter; the actual staff save/reload/submission path was verified by
rendered workspace tests, and real approval/transaction behavior by replica-set
tests. No authenticated customer session or real delivery was exercised.

No full repository suites, OCR checks, migrations, deployment, commits or external
mutations were performed. No dependency or lockfile changes were needed. Existing
large frontend chunks remain outside this task. Temporary browser fixtures,
screenshots, logs and baseline snapshots are removed after recording results;
ignored build outputs refreshed are `backend/dist/`, `frontend/dist/` and
`frontend/node_modules/.tmp/`. No runtime artifacts are intended deliverables.

Preservation note: unrelated pricing-label changes appeared between the primary
baseline capture and the Designer writer's initial per-target diff. The writer
confirmed these were preexisting for its slice and preserved them. Those changes
and the separate backend margin edits are excluded from this task's attribution.
The task-only review diff is `/private/tmp/lisno-all-baskets-task.diff`; it includes
the overlapping external price-label hunks, which the reviewer explicitly excluded.
