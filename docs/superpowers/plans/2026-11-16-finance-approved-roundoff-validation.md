# Finance approved round-off validation task plan

Date: 2026-11-16
Status: Approved, implemented, and verified in Mode A

Source of truth: [Approved specification](../specs/2026-11-16-finance-approved-roundoff-validation-design.md). The user approved the specification and task plan, then selected Mode A on 2026-11-16.

## Scope and ownership

Correct the frontend's false rejection of a valid rounded approved total. Preserve styling, persisted values, permissions, approved-source matching, and every other financial integrity predicate. Reuse `shared/estimation/estimateTotalRounding.ts` unchanged.

Only two production files are expected to change:

- Primary agent: `frontend/src/api/types.ts` and `frontend/src/features/finance/ProjectFinancePanel.tsx`.
- Regression owner: `frontend/src/features/finance/ProjectBudgetOverview.test.tsx`, extending the existing panel fixtures/render helper only as needed.
- Primary agent: this plan, integration, and final reporting.
- Integrity reviewer and final verification runner: read-only product-source ownership. Temporary verification artifacts belong under `/tmp/lisno-finance-roundoff-qa/`.

The existing panel changes export/configure its project-completion control. Preserve those changes exactly. Other dirty backend, admin, vendor, and manager work is outside this task. Do not reformat shared files or modify the rounding helper, backend, styles, dependencies, or lockfiles.

## Dependency-ordered tasks

Keep one parent task in progress. After plan approval, obtain the required execution-mode choice before starting these tasks.

1. **Capture the execution baseline and reproduce the false rejection.** Primary refreshes dirty paths, target file copies/diffs, and preservation hashes before assigning writers. Regression owner adds a rendered test using a valid nonzero approved round-off and records its failure under the current guard. Use synthetic values and identifiers, never local customer data. Trace: AC1, AC5.

2. **Complete bounded regression coverage.** Regression owner tests unequal valid positive/negative adjustments, zero adjustment, the exactly-fifty-paise round-down boundary, and absent-adjustment legacy exact totals. Test malformed/inconsistent/missing-required adjustments and unsafe or fractional runtime values. Include a correctly rounded foreign-project response, mismatched expected estimate/version, and inconsistent spending or budget; retain existing ledger-ownership and permission regressions. Exercise both the standalone budget presentation and the shared panel with an expected approved source. Assert normal amounts/content and relevant existing actions for accepted data; assert the warning and blocked financial actions for invalid data. Trace: AC1–AC4.

3. **Apply the correction.** Primary adds optional `approvedRoundOffPaise?: number` to `ProjectFinanceBucket`. Import the existing shared `estimateTotalsReconcile` helper into the panel and replace only its subtotal/GST/total equality predicate, explicitly mapping approved subtotal, GST, contract total, and round-off. Do not add a fallback adjustment, tolerance, new calculation, or unconditional warning suppression. Preserve all remaining checks. Trace: AC1–AC5.

4. **Review the integrated diff.** Once all writers finish, review against the execution baseline. Confirm signed adjustment handling, legacy compatibility, unchanged approval/project/ledger checks, exact paise preservation, and preservation of unrelated completion-control edits. Resolve confirmed findings before final verification. Trace: AC2–AC5.

5. **Verify and hand off.** Run the focused checks below on the integrated result, inspect browser rendering where available using sanitized fixtures, and reconcile all results against the acceptance criteria. Record exact outcomes, any pre-existing failures or unavailable checks, and artifact paths. No backend restart or stored-data repair is expected. Trace: AC1–AC5.

## Execution modes and safe parallelism

In Mode A, assign the regression test file to a native frontend implementation agent with explicit no-overlap ownership and instructions to preserve others' work. Primary owns the two production files. First record the failing regression against unchanged production code; afterward, the remaining regression cases and the two-file correction may proceed in parallel. Primary must wait for the regression writer before integrated review/testing. Use `integrity_reviewer` after writers finish, followed by `verification_runner` after any review corrections. Read-only source review can run while the regression owner prepares the initial reproduction.

In Mode B, primary performs the same steps, review, and verification inline. Do not spawn implementation agents.

## Verification commands and evidence

Run from `frontend/`:

```sh
npm test -- src/features/finance/ProjectBudgetOverview.test.tsx
npm test -- src/features/finance/FinancePages.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx
npm run typecheck
npm run build
```

Run repository hygiene and compare final target deltas with the captured baseline:

```sh
git diff --check
git status --short
```

The first test command must fail on the new valid-rounding reproduction before the product fix, then pass with the complete matrix. Existing finance-page/admin tests cover surrounding interactions, approval-source display, legacy totals, ledger behavior, and action permissions. The new matrix must prove two distinct unequal project fixtures cannot be confused.

For browser verification, use the existing local frontend and sanitized intercepted responses, with no login, project, approval, or finance mutation. Check normal budget rendering for a valid rounded response and retained warning/action blocking for a genuinely invalid response. Preserve current layout and keyboard interaction. If browser access is unavailable, report that explicitly and retain rendered interaction tests as evidence; do not claim full visual verification.

No full unrelated backend/OCR suites or lint command are planned; there is no repository lint script. Broaden only if a specific regression or contract impact justifies it. Build outputs remain ignored and temporary diagnostic/browser artifacts stay outside the repository.

## Execution record

- Complete: correction, review, and final verification. Execution baseline captured for 4,450 repository files under `/tmp/lisno-finance-roundoff-qa/`; exact copies of all three intended code/test targets saved before writers started.
- Regression owner `/root/finance_roundoff_regressions` reproduced the original rejection before product edits: one failing test, thirteen filtered skips. The valid fixture uses subtotal 12,125 paise, GST 2,183, round-off -8, and approved total 14,300. The same test passed after the correction.
- Primary added the optional DTO field and replaced only the panel's exact-total predicate with the existing shared validator. The test writer completed 24 added cases; all 37 tests in the focused file passed. Both owners have finished code changes.
- `/root/finance_roundoff_integrity` found no defects. It confirmed canonical frontend/backend helper parity, unchanged source/margin/spending/ledger/permission checks, exactly three code/test targets plus these two documents changed, and preservation of existing completion-control edits.
- Browser validation on the existing synthetic enterprise harness passed at 1440px and 390px: valid rounded budget rendered, exact net revenue retained, keyboard section navigation worked, invalid adjustment stayed blocked after refresh, no page/panel horizontal overflow, zero axe violations, and no runtime errors or write requests. Screenshots were visually inspected. Console warnings concern the existing THREE.Clock deprecation and axe preload assets; no console errors were reported. Evidence: `browser-summary.json`, `browser.log`, and `valid-desktop.png`, `valid-mobile.png`, `invalid-desktop.png` under the artifact directory.
- The reported local project's read-only finance response now passes the exact current frontend guard with its saved nonzero round-off. Command monitoring found only find, aggregate, and transaction commit, with no data mutation commands. Evidence: `local-final.json`; no project, approval, or finance records were modified.
- `/root/finance_roundoff_verify` completed final checks on the integrated result, all exit 0:
  - `npm test -- src/features/finance/ProjectBudgetOverview.test.tsx`: 37 passed.
  - `npm test -- src/features/finance/FinancePages.test.tsx src/features/admin/AdminProjectDetailPage.test.tsx`: 45 passed.
  - `npm run typecheck` and `npm run build`: passed. Build emitted a bundle-size warning for chunks over 500 kB, with no errors.
  - `git diff --check` and `git status --short`: passed/captured. All 4,450 baseline files reconciled: exactly the two production files, one regression test file, and two task documents changed; no unexpected additions, removals, or modifications.
- Final count: 82 passing tests, none skipped. Logs and preservation evidence are `/tmp/lisno-finance-roundoff-qa/final-*`; scoped diff is `task-diff.patch`. Build outputs are ignored under `frontend/dist/`. The temporary browser QA session was closed; the existing local frontend/backend servers were left running.
- Acceptance criteria AC1–AC5 are verified by the regression matrix, retained finance/admin tests, reviewed production diff, browser interaction/layout/accessibility checks, actual local response validation, and preservation comparison.
- Not run: full unrelated frontend/backend/replica-set/OCR suites or lint (no lint script). No backend behavior changed. No migrations, seed, project/approval/finance data mutations, dependencies, commits, pushes, or deployment occurred. No task-specific unresolved defect remains; existing bundle-size and browser dependency warnings are recorded above.

## Completion and rollback

Completion requires all acceptance criteria to be accounted for, writers finished, review findings resolved, scoped checks passed or clearly reported, and unrelated work preserved. Do not describe the correction as complete while material verification remains unresolved.

No migrations, seeds, data updates, commits, pushes, deployments, or external communications are authorized. Rollback is limited to this task's frontend type/guard and test additions; it must preserve pre-existing dirty edits. A backend behavior change or new financial policy would exceed this approved scope and require a revised specification.
