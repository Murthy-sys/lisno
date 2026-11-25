# Procurement Main Line priority panels: task plan

Date: 2026-11-25
Status: Implemented in approved Mode A. Focused integrated verification complete; pre-existing broader QA limitations are recorded below.

Source of truth: [approved specification](../specs/2026-11-25-procurement-main-line-priority-panels-design.md).

## Intended result

Inside each Procurement project, default to expandable **P1**, **P2**, **P3**, and, where needed, **Priority not set** panels containing matching Main Line source items. Keep the existing **By execution mode** view available. Use current saved Main Line Configuration, preserve complete basket navigation, and change no commercial calculations or mutation scope.

## Contract to settle before parallel writers

Extend the existing basket-list read with `priorityGroups`. Do not change persistence or add an endpoint.

- A group contains `priority: "P1" | "P2" | "P3" | "unassigned"`, `lineCount`, and `items`. Return nonempty groups in that order; an empty array means the project has no eligible source items.
- A row contains the stable `sourceLineItemKey`, canonical `basketId`/`basketName`, `mainLineId`/`mainLineName`, room and sub-basket identifiers/names, and the existing display execution-mode key. It identifies whether the item is current included scope or retained only for an existing commitment.
- Each row carries a priority resolution distinguishing resolved, unset, unavailable, invalid, and legacy/unlinked data, with selected revision ID/status/version where verified. Expose no foreign revision identity or configuration payload if ownership validation fails. A resolved value must match its group; unresolved rows belong to `unassigned`.
- Use `selectCurrentMainLineRevision`, then verify the selected revision and Overview section belong to that Main Line. No active fallback when a selected draft is missing, invalid, or has no priority. Archived/missing/unlinked sources stay explicitly unresolved.
- Include source lines with positive included approved scope or an existing positive commitment. Reuse canonical basket/source identities. Do not blindly copy all `sourceLineItemKeys` from mode subsets: those subsets can also carry excluded nonactionable source entries. The priority view must not add unselected work or omit commitment-only rows.
- Every eligible source key occurs once across all groups. Display metadata contains no financial totals, hidden components, or commercial authority.
- Server responses supply `priorityGroups`; frontend typing permits its absence for older-server detection. Missing/malformed metadata shows an unavailable priority view with retry and the execution-mode choice, rather than fabricated empty/unassigned data.
- Existing basket summaries, `modeGroups`, detail payloads, authorization operations, preparation digests, and mutation contracts remain unchanged.

Exact TypeScript names may follow local conventions without changing this contract or reopening approval. Return any material contract change to the primary agent before editing consumers.

## Dependency-ordered tasks

### 1. Capture baseline and establish the shared read contract

Owner: primary agent. Depends on plan approval and execution-mode selection. Covers AC1, AC4, AC5.

- Capture initial dirty paths and target diffs immediately before writers start. Currently only the new specification is untracked; preserve any later user edits.
- Confirm canonical source inclusion and existing mode labels against the current basket projection. Freeze the field names, unresolved states, and ownership matrix above.
- Own `frontend/src/features/procurement/procurementBasketApi.ts` and its test: add the read types and a priority-response validator checking group order, counts, unique source keys, valid resolution/group pairs, canonical basket references, and required row identities.
- Keep missing priority metadata independent of the existing mode-group validator. Do not weaken either validator to accept incorrect data.
- Own shared synthetic fixtures in `frontend/src/test/fixtures/enterpriseProcurementData.ts` and any necessary QA fixture registration. Add mixed priorities within one basket, repeated names across IDs/rooms, unassigned and commitment-only cases, and two different projects. Preserve existing fixture financial values.

### 2. Resolve saved priority and build the additive server projection

Owner in Mode A: backend implementer. Depends on task 1's agreed contract; can run alongside task 3. Covers AC1, AC2, AC4, AC5.

Owned areas:

- New focused priority projection module under `backend/src/domain/` and batched read helper under `backend/src/services/` if warranted.
- `backend/src/services/procurement-basket.service.ts`.
- `backend/src/openapi/procurement-basket-tender.ts`.
- Relevant backend priority, basket-mode, route-contract, and replica-set tests/fixtures.

Implementation:

- Invoke the priority read only after existing project authorization, within the list's snapshot transaction. Batch Main Line, selected revision, and Overview reads; sequence queries on the same Mongo session. Reuse the established revision selector.
- Resolve metadata separately from commercial mode readiness so a pricing problem does not erase a valid saved priority. Verify both revision and section ownership; treat malformed values and absent data explicitly.
- Build the grouping from canonical prepared basket lines and the existing commitment map. Keep stable source order inside each priority; no name-based joins, duplicate source items, browser per-line reads, or additional financial aggregation.
- Add `priorityGroups` to the list result and OpenAPI. Keep all existing response fields and detail redaction intact. Do not add priority to preparation/BOQ digests, stored approvals, or write payloads.
- Add focused tests for P1/P2/P3/unassigned partitioning, multiple rooms, mixed baskets, excluded entries, retained commitments, and stable unique IDs.
- Add replica-set coverage for draft-over-active selection, unset draft, priority changes on a subsequent read, missing/invalid/foreign revision or section data, archived and legacy sources, and unchanged approved amounts/mode summaries across two unequal projects.
- Preserve route-operation authorization and existing denial behavior. Update typed route mocks only where the new read field requires it.

Boundary: no frontend, storage model, Configuration editor, pricing formula, mutation, or deployment changes. Do not modify preparation/mode-resolution internals unless a concrete need is raised and agreed with the primary agent.

### 3. Add the priority overview and preserve basket workflows

Owner in Mode A: frontend implementer. Depends on task 1's contract and initial types/fixtures; can run alongside task 2. Covers AC1, AC3, AC4, AC5.

Owned areas:

- New `ProcurementBasketPriorityGroups.tsx`, its focused tests, and scoped stylesheet in `frontend/src/features/procurement/`.
- `ProcurementBasketWorkspace.tsx` and its relevant workspace/mode-group regression tests.
- Only the minimal reuse/export changes to the existing mode presentation needed for consistent labels, if any.

Implementation:

- Add an accessible **By priority / By execution mode** view choice; default to priority without changing the project gallery or selected `basket` URL behavior.
- Render only nonempty P1/P2/P3/unassigned panels; open the first nonempty group initially, allow multiple panels open, and preserve user choices on refetch.
- Display Main Line, room, basket/sub-basket context, execution-mode label, unresolved/historical indication where applicable, and an explicitly named **Open basket** action. Avoid new financial totals and progress percentages.
- Add search over the displayed names/context, with matching counts and clear no-results/reset states. Matching results must be discoverable even if their group was previously collapsed; preserve manual expansion state when clearing search.
- Use a compact desktop table and readable mobile rows with accessible headers, buttons, focus visibility, `aria-expanded`, and panel associations. Reuse existing tokens and controls; no new dependency or icon library.
- Keep priority search/expansion and execution-mode view preferences independent, retained while visiting a basket and returning, and isolated by project ID. Opening an item passes only the canonical basket ID and uses the existing full-basket detail/enquiry workspace.
- Handle loading, request failure, stale/refetch state, source mismatch, invalid/missing priority metadata, and permissions using existing workspace policies. Never turn an error into an empty or unassigned result. Retain access to the mode overview when only priority metadata is unavailable.
- Adapt existing mode-view tests to explicitly select **By execution mode** where appropriate. Keep full-basket create/dispatch payload assertions intact.

Boundary: no backend or shared fixture/API-type edits; request those from the primary owner. Preserve all unrelated work in the shared workspace.

### 4. Integrate and review the complete change

Owner: primary agent, followed by `integrity_reviewer` in Mode A. Depends on tasks 2 and 3 finishing. Covers all acceptance criteria.

- Reconcile server and frontend shape, synthetic fixtures, OpenAPI, fallback behavior, project-scoped query handling, and actual rendered source scope.
- Inspect the integrated diff against the initial dirty baseline. Check that no financial, mutation, authorization, Configuration-save, or historical-artifact behavior changed.
- Review revision/section ownership, stale data, duplicate keys, missing priorities, committed historical scope, hidden-component non-disclosure, and canonical basket navigation.
- Fix confirmed issues through explicit file owners. Do not run the final verification lane while source writers are still active.

### 5. Run final verification and hand off

Owner: primary agent plus `verification_runner` in Mode A after review fixes. Depends on task 4. Covers AC1–AC5.

- Run the focused commands below on the integrated result. Use existing replica-set helpers; do not weaken transaction requirements.
- Render the synthetic project at 1440 and 390 px. Check priority order, counts, initial/manual expansion, search/reset, unresolved rows, mixed priorities/rooms, accessible names/keyboard navigation, no page overflow, full-basket navigation/back, mode-view switching, and project switching.
- Verify a successful refresh moves an item to its newly saved priority, and error/missing metadata does not classify items incorrectly. Use synthetic fixtures only; no customer or production mutations.
- Record exact commands/results, any baseline failures, artifact paths, and remaining limits. Stop task-owned servers/browser sessions and keep runtime artifacts out of source control.
- No commit, push, deployment, migration, seed, or external communication.

## Parallel execution and ownership rules

Only task 1 starts after execution-mode selection. After its contract is settled, backend task 2 and frontend task 3 can run concurrently with non-overlapping files; the primary agent owns API consumer types, shared fixtures, documents, and integration. Keep one parent task in progress.

In Mode A, tell every writer that others share the worktree, do not revert others' changes, and return cross-boundary changes to the primary agent. Run integrity review after writers, then final verification after review fixes. In Mode B, perform the same slices, review, and verification sequentially in the primary thread without implementation subagents.

## Verification commands and coverage

Backend focused commands, using the planned new test names:

```sh
cd backend
npm test -- tests/procurement-basket-priority-groups.test.ts tests/procurement-basket-priority-groups.replica-set.test.ts
npm test -- tests/procurement-basket-mode-groups.test.ts tests/procurement-basket-mode-groups.replica-set.test.ts tests/procurement-basket-routes.test.ts tests/procurement-basket-tender.replica-set.test.ts
npm run typecheck
npm run build
```

Frontend focused commands:

```sh
cd frontend
npm test -- src/features/procurement/procurementBasketApi.test.ts src/features/procurement/ProcurementBasketPriorityGroups.test.tsx src/features/procurement/ProcurementBasketWorkspace.test.tsx src/features/procurement/ProcurementBasketModeGroups.test.tsx src/features/procurement/ProcurementWorkspace.test.tsx src/features/procurement/ProcurementComponentBreakdown.test.tsx
npm run typecheck
npm run build
```

Root: `git diff --check` and `git status --short`. Include OpenAPI assertions in the affected route-contract tests. Broaden only if shared-contract changes, actual failures, or unresolved concerns justify it. No OCR or full-repository run is planned; there is no lint script.

| Acceptance criteria | Primary evidence |
| --- | --- |
| AC1: correct panels and unique source membership | Pure projection tests, mixed-priority fixtures, rendered grouping |
| AC2: current Configuration and unresolved handling | Batched read replica-set tests, changed-value refresh |
| AC3: interaction, mobile, accessibility, errors | Component interaction tests, axe/browser checks at both widths |
| AC4: preserved commercial and basket behavior | Existing mode/tender tests, unchanged summary assertions, full-basket payload/navigation checks |
| AC5: authorization and identity integrity | Route/service denials, foreign ownership tests, response validation, two-project isolation |

## Execution record

- Specification: approved by the user.
- Task plan: approved.
- Execution mode: A, parallel sub-agents.
- Task 1 complete: baseline captured under `/private/tmp/lisno-procurement-priority-20261125/`; only this feature's specification and plan were initially untracked. Frontend read types, independent priority validation, and synthetic fixtures establish the shared shape.
- Task 2 complete: list-only batched Configuration resolver and pure priority projection added under `backend/src/services/procurement-basket-priority.service.ts` and `backend/src/domain/procurement-basket-priority-groups.ts`. The basket service and OpenAPI expose the additive projection. Six focused/regression suites passed 120 tests; backend typecheck/build passed before final integration.
- Task 3 complete: new `ProcurementBasketPriorityGroups.tsx` and scoped stylesheet render accessible panels and responsive rows. Workspace owns independent overview/search/expansion state and preserves canonical basket navigation. The new priority suite passed 12 tests; existing workspace/mode/project suites passed 87 tests. Existing mode tests explicitly select the retained execution-mode view.
- Task 4 complete: independent integrity review found no blocking issue. Its low-severity malformed revision-status coercion finding was fixed with exact string validation and a regression case. Review confirmed authorization/ownership boundaries and unchanged financial, digest, and commercial mutation paths.
- Browser QA passed at 1440 and 390 px: correct panel order/counts, keyboard expansion, search into collapsed groups, manual expansion restoration, full-basket scope, search retained on return, mode switching, and unset-priority display. No page overflow, unexpected network requests, mutations, or page JavaScript errors. New content has no axe violations; desktop retains two pre-existing sidebar contrast findings outside this feature. The new panel contrast findings were corrected before the successful recheck.
- Broader QA harness baseline: `cd frontend && npm test -- src/test/fixtures/enterpriseTransport.test.tsx` reports the same 8 failures / 65 passes on both current code and isolated clean HEAD `4a721f51e8f078ce6a585166f903d36564aa1cbc`. Failures concern existing assignment/PM dashboard, estimator fixture, document, and gallery tests. The additional new-default-view component-target failure was fixed and now passes. Logs: `transport-final.log` and `baseline/enterpriseTransport.log` in the temporary evidence directory.
- Task 5 complete: final integrated backend verification passed 120 tests across six suites; frontend passed 139 tests across six suites (259 focused tests total). Both workspace typechecks and production builds exited 0. Frontend retains the existing warning for chunks over 500 kB. Final `git diff --check` and `git status --short` passed with only this task's expected paths.
- The initial sandboxed backend check could not bind local Mongo/Supertest sockets (`EPERM`); the same six suites passed after local-socket escalation. No transaction requirement or test was weakened.
- Full repository/OCR suites and lint were not run; the repository has no lint script. The broader enterprise QA harness's eight independently reproduced baseline failures and two existing desktop sidebar contrast findings remain outside this task. No remaining defect was found in the priority feature's focused coverage.
- Logs: `/private/tmp/lisno-procurement-priority-20261125/final-*.log`. Browser report: `browser-report.json`; final screenshots: `output/playwright/priority-1440.png` and `priority-390.png` in that directory. The isolated baseline source snapshot was removed after preserving its log. Task-owned Vite/browser sessions were stopped. Ignored build artifacts remain in `backend/dist/`, `frontend/dist/`, and frontend TypeScript cache files under `node_modules/.tmp/`.
- No dependency, schema, migration, commit, push, deployment, or external data changes.
