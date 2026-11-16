# Section-assignment approval projection task plan

Date: 2026-11-16
Status: Implemented and verified in Mode A; T1–T4 complete
Approved specification: [Correct false section-assignment approval conflicts](../specs/2026-11-16-section-assignment-approval-projection-design.md).

## Outcome and implementation boundary

Remove the incomplete estimate `.select(...)` in `canonicalApprovedTradeSource` so the existing quotation approval resolver receives the complete saved estimate. The expected production change is confined to `backend/src/services/project-workflow.service.ts`; regression additions belong in `backend/tests/project-workflow-mongo.replica-set.test.ts`.

Preserve all filters, ambiguity checks, approval validation, immutable snapshot reads, transaction behavior, assignment guards, and explicit response DTOs. Do not modify the approval resolver to accept missing fields, change prices or records, or alter the frontend. Existing route tests already cover the section-assignment response and Super Admin access; run them without editing unless a concrete coverage gap emerges.

## T1. Preserve current work and reproduce the defect

Owner: primary, with the regression-test slice delegated in Mode A after execution selection. Acceptance criteria: AC1, AC4 preparation.

- Capture fresh execution-start dirty paths, relevant diffs/copies, and hashes under `/tmp/lisno-section-assignment-409-qa`. Keep the existing diagnostic evidence separate. Recheck the targets before assigning ownership because other work is active in this repository.
- Extend the existing section-assignment fixture helpers to represent a valid workflow-v3 approval with complete reconciled totals, room/scope selections, and immutable approval evidence. Use synthetic data only.
- Add the reported-shape regression under `describe("section-level worker assignment")`: a completed project, one current approved initial quotation, one matching trade task, and one expected assignment group. Demonstrate that it fails with the current partial query before the production change.
- Include a valid approved designer revision so both supported workflow-v3 approval sources are exercised. Preserve prior fixture behavior rather than rewriting existing tests.

## T2. Apply the bounded correction and protect invariants

Depends on T1's failing regression. This is the only parent implementation task in progress.

### Production slice

Owner: primary. Exclusive ownership: `backend/src/services/project-workflow.service.ts`.

Remove the incomplete projection from `canonicalApprovedTradeSource`. A concise comment may explain that approval validation requires the full estimate. Keep `.limit(2)`, session use, project/status/design-status filters, approval-source selection, snapshot section labels, and DTO construction unchanged. Do not change other estimate queries or introduce a new projection abstraction.

### Regression slice

Owner in Mode A: one `backend_implementer`. Exclusive ownership: `backend/tests/project-workflow-mongo.replica-set.test.ts`. In Mode B, primary owns this slice inline.

Complete the regressions and verify:

- Valid initial and approved designer-revision quotations return the expected section group and preserve completed-project history.
- Missing or invalid approval evidence, changed financial/content values, and mismatched source lineage still produce the existing conflict. Use distinct project/source identities to prevent accidental cross-project matches.
- No approved source still returns an empty list; legacy and workflow-v2 behavior remain intact.
- Completed sections remain non-reassignable, stale revisions remain rejected, and valid assignment changes retain their existing audit/atomicity behavior. Reuse existing cases wherever they already cover these invariants.
- Returned assignment DTOs contain no newly loaded estimate fields, raw snapshots, totals, or private notes. The fix changes internal read completeness, not the response contract.

Run the new regression against the fixed query and report its before/after results. Do not add dependencies or edit fixtures outside the owned file without primary coordination.

### Parallelism and ownership

After execution selection, Mode A can run regression authoring in parallel with the primary's source/guard review and verification preparation. The primary waits for the failing regression before applying the production correction, then informs the test owner. These are non-overlapping paths; both writers must preserve the shared worktree and earlier edits. No subagents start at the planning gate. Mode B keeps all work inline.

## T3. Review the integrated correction

Depends on all T2 writes. Owner: primary, with an `integrity_reviewer` in Mode A or equivalent inline review in Mode B.

Review only this task's delta against the baseline. Confirm that the complete source satisfies the existing approval comparison without weakening it, approved snapshot labels remain authoritative, and response serialization stays explicit. Inspect the shared section-assignment mutation caller for unchanged stale/completed/role/audit guards. Resolve confirmed findings before final verification.

## T4. Verify and refresh the local runtime

Depends on T3. In Mode A, `verification_runner` owns focused tests and typecheck; primary owns the build, local runtime/source check, and preservation reconciliation. In Mode B, primary performs all checks inline. Do not overlap backend typecheck and build.

From `backend/`:

```sh
npm test -- tests/project-workflow.test.ts tests/project-workflow-routes.test.ts
npm test -- tests/project-workflow-mongo.replica-set.test.ts -t 'section-level worker assignment|approved Design plan operational queues|collaborative Design approval boundary'
npm run typecheck
npm run build
```

Keep new regression cases within the selected section-assignment group so the final command includes them. Use the existing isolated replica-set test database for all test writes. If local listener restrictions prevent HTTP/Mongo tests, rerun with the necessary local-socket permission and distinguish that environment failure from a product failure. Broaden tests only if the integrated change or a failure demonstrates additional impact.

Recheck the reported project through read-only source resolution and pure section aggregation, confirming the full approved source yields one matching section. Do not commit a successful diagnostic call through the real service's transaction wrapper: it performs authorization coordination writes. End-to-end successful service/route verification belongs in the isolated test database. A rollback-only local diagnostic is an alternative only if necessary and explicitly guarantees rollback.

If the current local backend does not reload source changes, verify its process and refresh the existing loopback development launcher with its unchanged no-seed command. Confirm readiness without provisioning accounts, mutating project data, or stopping unrelated services.

Finish with `git diff --check`, `git status --short`, and baseline preservation comparison. No frontend build or visual QA is required for this backend query correction. No lint script exists. Do not seed, migrate, commit, push, deploy, or communicate externally.

## Acceptance trace and handoff

| Criterion | Implementation | Verification |
| --- | --- | --- |
| AC1: valid workflow-v3 assignments load | Complete estimate read | Failing-then-passing initial approval regression, approved revision case, completed-project history |
| AC2: real conflicts remain blocked | Existing validation and lineage guards retained | Evidence/content/financial mismatch and distinct-source cases |
| AC3: read/mutation contracts stay intact | Unchanged DTO, snapshot, authorization and mutation paths | Domain, route and existing section-assignment/legacy/v2 cases |
| AC4: compilation and preservation | Bounded service/test changes | Typecheck/build, integrated review, final diff/hash comparison |

At completion, record exact commands/results, changed paths, local-runtime verification, remaining limitations, unrun checks, and artifacts under `/tmp/lisno-section-assignment-409-qa`. Separate any unrelated existing failure from this correction. No data repair or migration is expected; rollback is a code-only revert of this task's delta.

## Completion record

The production change removes the incomplete estimate projection in `canonicalApprovedTradeSource` and adds one explanatory comment. The existing approval resolver now receives complete saved content. Filters, candidate limits, immutable snapshot selection, task lineage validation, authorization, DTO construction, and assignment mutation guards remain unchanged.

Only two code/test files changed: `backend/src/services/project-workflow.service.ts` and `backend/tests/project-workflow-mongo.replica-set.test.ts`. The test file adds 126 lines without replacing existing tests. No frontend or API schema changes were needed.

### Verification results

The exact final commands are listed in T4 above.

| Check | Result |
| --- | --- |
| Reported-shape regression before production correction | Failed with the expected `WORKFLOW_SECTION_ASSIGNMENT_CONFLICT`; complete-record approval assertion passed first |
| Section-assignment suite after correction | 17 passed, 37 filtered skips; exit 0 |
| Final domain and route suites | 68 passed; exit 0 |
| Final workflow replica subset | 30 passed, 24 filtered skips; exit 0 |
| Backend typecheck | Exit 0 |
| Backend production build | Exit 0 |
| Independent integrity review | No confirmed defects |
| `git diff --check`, status and baseline preservation | Passed; unrelated work preserved |

Final focused total: **98 passed, 24 intentionally filtered skips, zero failures**. Existing Mongoose `new` option deprecation warnings appeared in tests. No environment failures remained. Full unrelated backend suites, frontend/mobile/OCR checks, and visual QA were not run for this bounded backend correction. There is no lint script.

Coverage includes valid initial and revised workflow-v3 approval, completed-project history, unchanged response field limits, distinct project/task identities, changed totals/rooms, missing or foreign approval, wrong decision actor, stale task design version, ambiguous approved estimates, workflow-v2 compatibility, empty-source behavior, and the existing stale/completed/atomic-assignment cases.

### Local source and runtime verification

Read-only source resolution for the reported project confirms its complete saved estimate is currently approved, its one trade task matches the approved estimate/design version, pure aggregation produces one section, and the assigned worker lookup satisfies the required role. Checked project/estimate/task data remained unchanged. The diagnostic comparison still records how the original partial projection produces `source_issue`; that projection has been removed from the production resolver.

No successful service transaction was committed against the local project for verification. Successful service behavior was tested in the isolated replica-set database. The existing loopback backend/rules/OCR launcher was refreshed using its unchanged no-seed command; the restarted API is ready and exposes the section-assignment route. The frontend server was left running.

### Evidence and preservation

Evidence is under `/tmp/lisno-section-assignment-409-qa`: `regression-red.log`, `regression-green.log`, `final-domain-routes.log`, `final-replica.log`, `final-typecheck.log`, `final-build.log`, `source-verification.json`, `local-runtime-check.json`, `task-diff.patch`, and `final-preservation.json`. Execution-start copies and hashes show only the two assigned code/test files and these specification/plan status records changed. No paths were added or removed during execution.

Build output is ignored under `backend/dist/`. No dependency/lockfile change, seed, migration, project-data repair, approval rewrite, commit, push, production deployment, or external communication was performed. The local backend remains running with the fix.
