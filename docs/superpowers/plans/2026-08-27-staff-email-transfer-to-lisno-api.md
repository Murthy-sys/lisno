# Existing `lisno` Super Admin Bootstrap — Revised Task Plan

## Approved source

- Specification:
  `docs/superpowers/specs/2026-08-27-staff-email-transfer-to-lisno-api-design.md`

## Outcome

Safely update the existing operator bootstrap so one transaction against
`linso-cluster / lisno`:

1. quarantines the exact audited legacy Designer without changing its identity or
   five task references; and
2. inserts exactly one canonical active standard Super Admin.

The task preserves every existing business document, leaves `lisno_prod` unchanged,
and verifies deployed login only after a new target-specific dry run and live-action
approval.

## Affected areas and ownership boundaries

### Backend operation writer

Owned file:

- `backend/src/operations/production-super-admin-bootstrap.ts`

Responsibilities:

- exact `/lisno` target and fingerprint contract;
- non-empty baseline inspection and sanitized digest;
- legacy-row CAS quarantine plus Super Admin insert in one transaction;
- post-write/idempotent verification and redacted failures.

Must not edit the focused test, shared models, services, frontend, plan/spec, or
production data.

### Backend regression-test writer

Owned file:

- `backend/tests/production-super-admin-bootstrap.test.ts`

Responsibilities:

- encode the approved operation contract using only synthetic local replica-set data;
- verify exact-row and task-reference preservation;
- verify redaction, concurrency, rollback, drift, and rerun behavior.

Must not edit the operation implementation, package scripts, shared helpers, models,
services, frontend, or production data.

### Primary integrator

Owned areas:

- product/contract interpretation;
- `backend/package.json` only if the existing script needs adjustment;
- reconciliation between operation and tests;
- spec/plan documents;
- production read-only dry run and exact authority gates.

The primary integrator does not delegate or parallelize production access or writes.

### Integrity reviewer and verification runner

- Integrity reviewer runs after both writers and integration are complete.
- Verification runner runs only after integrity findings are resolved.
- Neither role performs production access or product-source edits during final
  verification.

## Dependency-ordered task graph

### Task 1 — Freeze the revised local contract

Owner: Primary integrator.

Dependencies: approved revised specification.

Work:

1. Preserve and inspect the existing dirty bootstrap module, test, package script,
   spec, and plan changes.
2. Confirm the exact runtime contract:
   - target label `linso-cluster/lisno`;
   - URI path `/lisno`;
   - fingerprint input `lowercase-host + "|lisno"`;
   - maintenance confirmation specific to `/lisno`;
   - dry run by default and only optional CLI argument `--write`;
   - sanitized baseline and HMAC approval digest;
   - one proposed quarantine and one proposed insert.
3. Share the same output/status shapes and baseline invariants with both writers.

Acceptance:

- No generic arbitrary-database mode is introduced.
- No implementation or test writer owns the same file.
- No PII, URI, password, private ID, or production content enters source or fixtures.

### Task 2A — Revise the baseline-aware operation

Owner: Backend operation writer.

Dependencies: Task 1.

May run in parallel with Task 2B.

Work:

1. Retarget all independent safeguards from `/lisno_prod` to `/lisno`.
2. Replace the global empty-database rejection with a read-only baseline inspector
   that verifies:
   - one exact reserved legacy Designer;
   - active state and expected missing legacy fields;
   - zero Super Admins;
   - zero target-email matches;
   - no missing/null normalized emails;
   - compatible complete User index definitions;
   - unchanged task-responsibility counts;
   - sanitized collection/document/User counts.
3. Include all sanitized baseline values and two proposed mutations in the approval
   digest.
4. In one transaction:
   - recheck the exact baseline and identity predicates;
   - CAS-update only the legacy Designer's `active`, `accountKind`, `version`, and
     `updatedAt` fields;
   - insert one canonical generated Super Admin;
   - rely on unique normalized-email and sole-Super-Admin indexes for concurrency.
5. Post-write verify two Users, exactly one canonical Super Admin, one quarantined
   legacy Designer, unchanged task references, compatible indexes, and no unrelated
   document-count changes.
6. Preserve exact-rerun idempotency and sanitized committed-state reporting.

Acceptance:

- Dry run creates no collections, indexes, transaction, or data write.
- A mismatched target, baseline, identity, responsibility, or index fails closed.
- A failed transaction changes neither User.
- Existing business documents never enter the write set.

### Task 2B — Extend focused replica-set regression coverage

Owner: Backend regression-test writer.

Dependencies: Task 1.

May run in parallel with Task 2A.

Work:

1. Replace empty-target fixtures with a synthetic compatible non-empty baseline:
   one reserved active Designer and five referenced active tasks.
2. Prove dry run reports one quarantine plus one insert and writes nothing.
3. Prove one write atomically:
   - preserves legacy ID, identity fields, role, credential hash, creation time, and
     task references;
   - changes only the approved quarantine fields;
   - creates one canonical remote-auth-compatible Super Admin.
4. Cover wrong target/fingerprint, existing Super Admin, target-email conflict,
   missing/extra legacy row, changed responsibility count, incompatible index,
   concurrent attempts, injected transaction failure, exact rerun, changed-input
   rerun, and post-commit reporting.
5. Assert stdout/stderr/errors exclude synthetic names, emails, passwords, hashes,
   IDs, and URIs.

Acceptance:

- All tests use a local temporary Mongo replica set and synthetic identities.
- Tests do not access Atlas, Render, SMTP, frontend, OCR, or public services.

### Task 3 — Integrate and run focused checks

Owner: Primary integrator.

Dependencies: Tasks 2A and 2B.

Work:

1. Reconcile contract differences without overwriting either writer's unrelated
   changes.
2. Adjust the existing package command only if necessary.
3. Inspect the scoped diff and run:

```bash
cd backend
npm test -- tests/production-super-admin-bootstrap.test.ts
npm run typecheck
```

Acceptance:

- Focused tests and typecheck pass.
- The diff contains no personal or secret production data.

### Task 4 — Integrity review

Owner: Integrity reviewer.

Dependencies: Task 3.

Review focus:

- exact-target independence and digest binding;
- transaction/CAS correctness and race handling;
- sole-Super-Admin and normalized-email enforcement;
- legacy identity and five-task lineage preservation;
- no unrelated writes, destructive index operation, secret disclosure, or ambiguous
  post-commit retry state.

Acceptance:

- All blocker/major findings are resolved before final verification.

### Task 5 — Final local verification

Owner: Verification runner.

Dependencies: resolved Task 4.

Checks:

```bash
cd backend
npm test -- tests/production-super-admin-bootstrap.test.ts
npm run typecheck
npm test
npm run build
cd ..
git diff --check
git status --short
```

Acceptance:

- Focused test, typecheck, full backend suite, build, and repository hygiene checks
  pass.
- Any existing unrelated warning is reported rather than described as a new success.
- No production, Render, SMTP, frontend, OCR, deploy, commit, or push action occurs.

### Task 6 — Prepare the private `/lisno` execution inputs

Owner: Primary operator with user-controlled secrets.

Dependencies: Task 5.

Work:

1. Update the protected temporary environment file so:
   - `MONGODB_URI` ends in `/lisno` with the current Atlas database-user password;
   - target label is exactly `linso-cluster/lisno`;
   - target fingerprint is regenerated using `host + "|lisno"`;
   - maintenance confirmation is specific to `/lisno`;
   - the selected private application identity inputs remain present.
2. Confirm Render's backend `MONGODB_URI` path is `/lisno`.
3. Stop or isolate Render, OCR, shells, and any other writers before the final dry run.

Acceptance:

- File mode remains `600`.
- Validation prints booleans/counts only and exposes no values.
- This task performs no database write.

### Task 7 — Production dry run only

Owner: Primary operator.

Dependencies: Task 6.

Work:

1. Run the unchanged command without `--write`.
2. Compare the production result with the approved sanitized baseline.
3. Report only target label/fingerprint, collection/document/User counts, identity and
   responsibility counts, index state, one proposed quarantine, one proposed insert,
   and approval digest.
4. Stop on any mismatch or drift.

Acceptance:

- Dry run performs zero writes.
- The report contains no identity or secret value.
- No live action is inferred from earlier `/lisno_prod` approval.

### Task 8 — Exact approval and live transaction

Owner: Primary live executor only.

Dependencies: eligible Task 7 report.

Required gate:

- Obtain explicit approval naming `linso-cluster / lisno`, the exact dry-run digest,
  one legacy-Designer quarantine, one Super Admin insert, and no other connected
  writers.

Execution:

1. Repeat the unchanged dry run and require every bound value to match.
2. Execute once with `--write`.
3. Run read-only verification of Users, indexes, preserved task links, and unrelated
   document counts.
4. Stop and report `committed` state on any ambiguous post-write failure; never retry
   blindly.

### Task 9 — Verify deployed login and hand off

Owner: Primary operator/user.

Dependencies: successful Task 8.

Work:

1. Start/redeploy Render only if needed and separately authorized.
2. Verify API health.
3. Verify normal Super Admin login using the private application password.
4. Confirm the quarantined Designer is absent from active assignment selectors and
   its five task links remain visible/preserved.
5. Confirm other staff roles can be created later through the portal without
   submitting an invitation in this task.
6. Remove the protected temporary secret file only after the private login password
   is securely retained.

## Safe parallelism

- Tasks 2A and 2B are the only parallel writer tasks; their file ownership does not
  overlap.
- Task 3 waits for both writers.
- Integrity review and verification are sequential after integration.
- Private-input preparation, production dry run, exact approval, live transaction,
  and deployed login verification are strictly sequential and never delegated.

## Acceptance-criteria traceability

| Specification acceptance | Plan tasks | Evidence |
|---|---|---|
| Exact `/lisno` target and target-specific approval | 1, 2A, 6–8 | Independent URI/target/fingerprint checks and approval digest |
| Zero-write sanitized dry run | 2A, 2B, 7 | Replica-set regression plus production dry-run report |
| Atomic quarantine plus one insert | 2A, 2B, 8 | Transaction tests and post-write counts |
| Legacy identity/task lineage preserved | 2A–5, 8–9 | Field-level and five-task reference assertions |
| Sole Super Admin and unique email | 2A–5, 8 | Compatible index checks and concurrency tests |
| Remote login succeeds | 2B, 9 | Auth regression and deployed login |
| No unrelated data or external side effects | 2A–9 | Baseline digest, scoped diff, final hygiene report |
| `lisno_prod` unchanged | 2A, 6–9 | Exact-target rejection and no source access |

## Expected duration after task-plan approval

- Parallel implementation and focused integration: approximately 10–15 minutes.
- Integrity review and full local verification: approximately 10–15 minutes.
- Private input update, production dry run, approved transaction, and login check:
  approximately 5–10 minutes if Render/Atlas access is ready.

These are estimates, not a substitute for the required safety gates or passing
verification.
