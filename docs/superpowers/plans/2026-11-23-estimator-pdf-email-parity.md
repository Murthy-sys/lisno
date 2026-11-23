# Reuse the client-email PDF template in the estimator

Date: 2026-11-23
Status: Complete. The narrowed specification and reduced plan were approved, and Mode A was selected. Tasks 1, 2 and 3 are complete.

Source of truth: [Approved specification](../specs/2026-11-23-estimator-pdf-email-parity-design.md). Its approval is recorded here without changing the specification during this gate.

## Scope

Supply the existing proposal metadata to the saved-preview service so it selects the same PDF template used when Sales submits an estimate to the client. Keep the current PDF design, screen, viewer wording, amounts, permissions, version guards and email behavior. No frontend implementation, template changes, dependencies or migrations.

## Tasks and ownership

### 1. Implement the template selection fix

Owner: one implementation owner. Primary agent in Mode B; one bounded backend owner in Mode A. Starts only after plan approval and execution-mode selection.

- Capture the current dirty-path set and inspect target diffs. Preserve the existing untracked service and unrelated changes in the tests.
- Owned product file: `backend/src/services/quotation-draft-pdf.service.ts`.
- Owned regression files: `backend/tests/quotation-edits.replica-set.test.ts` and, only if additional staff-route coverage is needed, `backend/tests/estimate-revisions.replica-set.test.ts`.
- Add a focused regression showing the missing proposal metadata and legacy template selection.
- Use the existing `createEstimateProposal` factory with one request timestamp, the saved project number and estimate ID. Pass its metadata through `toEstimateSnapshot` and the existing customer projection. Keep the existing publication defaults, including `Team Lisno`.
- Preserve all current pricing inputs, customer visibility, saved-version checks, post-render checks and read-only behavior. Do not edit renderer, publication, delivery or frontend code.

Acceptance: AC1, AC2, AC3 and AC5. Real rendered PDF content must prove selection of the proposal booklet; a PDF signature alone is insufficient.

### 2. Verify the integrated result

Owner: primary agent, or a bounded verification agent in Mode A. Depends on task 1 being finished.

- Verify both saved-preview routes retain saved identity, access/visibility guards and no-write behavior. Check actual customer-visible amounts and hidden content in the generated PDF.
- Run existing proposal tests for financial presentation and the rendition tests for frozen metadata and legacy compatibility. Inspect the unchanged submitted-preview and email paths to confirm both still resolve the selected round through the same rendition service.
- Run the existing viewer and revision interaction tests. Inspect a synthetic multi-page proposal in the unchanged dialog at desktop and phone widths, including open, scroll, download and close.
- Run backend typecheck/build and repository hygiene. Fix regressions caused by the change; report unrelated failures separately.

Acceptance: AC1 through AC6. Reuse existing regression coverage; do not create a broad new test programme or repeat passed checks without a relevant change.

Commands from `backend/`:

```sh
npm test -- tests/quotation-edits.replica-set.test.ts tests/estimate-revisions.replica-set.test.ts tests/estimate-proposal-pdf.test.ts tests/client-quotation-rendition.replica-set.test.ts
npm run typecheck
npm run build
```

Commands from `frontend/`:

```sh
npm test -- src/features/estimates/QuotationPdfViewer.test.tsx src/features/leads/LeadEstimateWorkspace.revisions.test.tsx
```

Commands from the repository root:

```sh
git diff --check
git status --short
```

Use the existing Mongo replica-set test helper and synthetic data only. Temporary PDFs/screenshots belong in a task-specific temporary directory. Report unavailable browser or replica-set checks explicitly. No real client email is needed.

### 3. Review and hand off

Owner: primary agent. Depends on task 2.

Inspect the final task-only diff against the starting worktree. Confirm that the sole product behavior change is template reuse and that unrelated work remains intact. Record exact checks/results, any unrun checks and temporary artifacts; remove task-created temporary files when no longer needed. No commit, push, production mutation, email, migration or deployment.

## Execution boundaries

Only one parent task is in progress at a time. This small fix has one implementation slice. In Mode A, a read-only check of the existing email/viewer paths may run alongside that slice; there are no independent product-code changes to split among writers. Give each agent explicit ownership and instructions to preserve other work. Final verification follows all writes. In Mode B, keep implementation, review and verification inline. No agents are spawned before Mode A is selected.

Execution started after specification approval, task-plan approval and Mode A selection. The backend owner is implementing the bounded fix; the primary agent owns independent read-only path checks and viewer smoke QA.


## Completion evidence

Only two product/test paths changed relative to the captured execution baseline:

- `backend/src/services/quotation-draft-pdf.service.ts`: import the existing proposal factory, create its metadata from the saved lead/estimate, and pass that metadata to the saved snapshot. Existing customer projection and guards remain intact.
- `backend/tests/quotation-edits.replica-set.test.ts`: two real-PDF regressions for project and staff saved previews, checking booklet content, saved reference/default preparer, customer amounts, hidden content and unchanged persistence.

The new regressions failed before the fix because proposal metadata was absent. After the fix, the focused saved-draft group passed 7 tests (109 unrelated tests skipped by that initial name filter). The independent integrity review found no defects. Final integrated results:

| Check | Result |
| --- | --- |
| Backend focused command above | 4 files, 166 tests passed; no skips |
| Frontend focused command above | 2 files, 14 tests passed; no skips |
| Backend `npm run typecheck` | Passed |
| Backend `npm run build` | Passed |
| `git diff --check` | Passed |
| Baseline hash comparison and status | Only the two intended code/test files and working documents changed; no new untracked source paths |
| Actual viewer smoke QA | Passed at 1440×900 and 390×844 with synthetic PDF; cover and multiple pages render, scrolling works, download bytes equal the displayed fixture, Escape closes and returns focus |

Browser QA mounted the actual unchanged `QuotationPdfAction` and application styles in a temporary local harness, using the existing proposal fixture with synthetic identities. This was component-level browser QA, not a full authenticated application journey; the real saved-preview path was exercised by the replica-set regressions. The harness recorded only a missing favicon (404), with no application or PDF errors. No real email was sent.

The browser and temporary loopback server were closed. Generated PDFs, screenshots, harness files and baseline copies under `/private/tmp/lisno-pdf-parity-71_43zc4/` were removed after inspection. The backend build updated ignored `backend/dist/` output; unrelated existing outputs were preserved. No dependency or lockfile changes, migration, production mutation, commit, push or deployment occurred. Full workspace suites and frontend typecheck/build were not run because no frontend or shared-contract code changed. No lint result is claimed.
