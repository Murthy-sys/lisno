# Local Sub-Basket index activation plan

Date: 2026-10-12
Status: Complete. Specification and plan approved; Mode A selected. T0–T6 completed, including independent evidence review.

Source of truth: [approved specification](../specs/2026-10-12-local-sub-basket-index-activation-design.md).

## Exact operation and boundaries

Complete the prepared index transition on **loopback `lisno_demo.vendorBasketRequests` only**. Use the existing migration, without changing application code or bypassing its safeguards.

After backup verification and a final dry run, remove only:

- `vendorKey_1_proposedNameNormalized_1`
- `vendorNameNormalized_1_proposedNameNormalized_1`

Retain the two verified replacements, `vendor_basket_request_pending_vendor_target` and `vendor_basket_request_pending_name_target`, plus every unrelated index. Preserve every document in the local database. No production connection, sync, seed, document edits, Configuration changes, dependency changes, deployment, staging or commits.

The diagnostic dry run found four requests, both replacement indexes, both obsolete indexes, and no duplicates/conflicts. Recheck rather than assuming that inventory is still current. `mongodump` and `mongorestore` are installed. Their availability does not yet establish that a backup has been captured or verified.

## Dependency-ordered tasks

| Task | Ownership and deliverable | Dependency | Acceptance |
| --- | --- | --- | --- |
| T0: establish current baseline | Primary captures worktree status and hashes of relevant migration/index/model/test files, including existing untracked files. Confirm the configured endpoint is loopback, database is exactly `lisno_demo`, and runtime local backend is using that target. Capture sanitized current index inventory. | Plan approval and execution choice | AC2–AC4 |
| T1: verify the existing procedure | Read-only reviewer inspects the exact migration, readiness guard, local target checks, backup/rollback and resumption procedure. Run the focused disposable replica-set tests below. Report findings before any local index writes. | T0 | AC1, AC4, AC5 |
| T2: establish a quiet local database | Primary identifies only processes writing this local database, records their identities and resumption method, then temporarily pauses them. Confirm no in-flight writes/transactions remain for the target and no unidentified writer remains. Do not stop MongoDB or modify sync settings. | T1 passed | AC3–AC5 |
| T3: capture and verify backup | Primary captures a private full logical backup of `lisno_demo`, exact collection/index metadata, document counts and deterministic BSON-preserving content digests. Restore the backup only into a separate disposable loopback server and compare counts/digests and index metadata. Record archive checksum and verification outcome. | T2 | AC3, AC4 |
| T4: final dry run and index transition | Primary rechecks loopback target, writer pause, document digests and index inventory. Require zero conflicts/duplicate groups and both exact replacement indexes. Invoke the existing migration in apply mode with verified backup, paused-writer evidence and an exclusive metadata capture file. The migration performs its own final dry run and replacement verification before removing the two old indexes. | T3 verified; review findings resolved | AC1–AC4 |
| T5: verify and resume | Primary verifies the exact readiness guard succeeds, both old indexes are absent, replacements/unrelated indexes are unchanged, and all captured document counts/digests match. Resume only the processes paused in T2, including on failure through cleanup handling. Check backend availability and recheck index readiness after resumption. Verification reviewer checks sanitized evidence and final repository hygiene. | T4 or failure cleanup | AC1–AC5 |
| T6: handoff | Record exact results, private backup location, migration metadata/report locations, any limitations and process resumption. Explain that the user can retry the actual Sub-Basket draft; do not create test records in the app database. | T5 | AC1–AC5 |

Keep one parent task in progress. Stop before index writes if the target, backup, writer pause or conflict checks cannot be verified. A changed request count since the initial diagnostic is not itself data loss; use the fresh quiesced baseline and re-run conflict checks.

## Ownership and execution modes

- **Primary owns all access to the configured local database**, writer pause/resume, backup artifacts, migration invocation, evidence integration and this plan. Do not give parallel agents authority to alter the local database.
- In **Mode A**, the migration safety review and disposable regression tests may run concurrently after T0, with separate read-only review and test-execution responsibilities. Neither writes product sources or uses configured database credentials. Integrate their findings before T2. An integrity reviewer checks the procedure before execution; final verification follows the completed transition and resumption.
- In **Mode B**, the primary performs the same tasks sequentially without implementation subagents.
- T2 through T5 are strictly sequential. Do not run unrelated configured-database work while writers are paused. Preserve existing worktree changes; this task requires no application-source edits.

## Backup, confidentiality and rollback

- Store recovery artifacts outside tracked source in a private task directory with directory mode `0700` and sensitive files mode `0600`. Keep credentials out of process arguments, shell output, logs and reports. Use a restricted tool configuration or equivalent secret-safe invocation where authentication is needed.
- The restore verification destination must be an explicitly created disposable server, with a different endpoint from the configured local MongoDB server. Never restore into `lisno_demo` on the app server. Do not start application services against restored data or trigger delivery jobs.
- Compute content digests using deterministic document ordering and BSON-preserving serialization. Emit only counts, hashes and verification results; do not print record contents. Compare every ordinary collection covered by the backup while writers remain paused.
- Set `backupVerified` and `writersPaused` only after collecting evidence. Never use those flags merely to bypass a refusal.
- Preserve both target indexes throughout. If an apply fails midway, inspect the actual inventory and retain existing protections; retry only with verified prerequisites. Never issue broad index synchronization or delete records to force success.
- If rollback is necessary, inspect again and use the existing rollback procedure only when legacy uniqueness is still valid. It restores old protections before removing replacements. Stop if new valid parent-scoped requests make legacy uniqueness impossible; keep their data intact.
- Always resume identified paused processes after success or failure. If process identity has changed, do not signal a reused PID; report the actual runtime state and use the recorded verified resumption method.

## Verification commands and evidence

Focused tests from `backend/`, using only their disposable replica sets:

```sh
npm test -- tests/vendor-basket-request-target-index.replica-set.test.ts tests/vendor-basket-proposal.replica-set.test.ts --maxWorkers=2
```

These cover read-only inspection, explicit prerequisites, duplicate detection, guarded apply/rollback, partial transition recovery, exact target validation, and Sub-Basket creation under an existing Main Basket.

Run local inspection/apply through a temporary entrypoint that validates the connection target before calling the existing native-driver migration. Do not launch the application or initialize models as part of inspection. Use `--database=lisno_demo` explicitly if invoking the migration CLI; keep the URI private. The entrypoint and sanitized reports are temporary operational artifacts, not new product code.

Postflight evidence must show:

- Exact guard `requireTargetRequestIndexes(...)` succeeds against the named local collection.
- Exactly the two old indexes were removed; both replacements and every unrelated index match their captured definitions.
- All captured collection counts/content digests match before and after the index operation.
- Backup restore verification passed; archive checksum and original index metadata are retained privately.
- Local writers are resumed and the backend is available. Production and sync settings were not touched.

Repository checks:

```sh
git diff --check
git status --short
```

No frontend redesign, full test suites, build, OCR or lint run is required when no product source changes. There is no repository lint script. If a code defect requires a change, stop and reconcile scope before editing. Do not create a throwaway request in the user's app database to demonstrate success; disposable HTTP/service tests plus the local readiness guard provide non-destructive verification.

## Gate state

- Specification: approved.
- Task plan: approved.
- Execution mode: A, parallel read-only safety review and disposable tests; primary owns the local operation.
- Configured-database writes: completed on the exact local target. Only the two approved legacy indexes were removed.

## Execution evidence

- Initial worktree hash manifest and migration source copies captured under private `/private/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-local-sub-basket-operation-3iq12pvs`.
- Runtime inspection verified the backend listening on loopback port 3000 uses exactly the configured `127.0.0.1:27017/lisno_demo` database. The backend was the sole connected application client of the local MongoDB endpoint.
- Fresh read-only inventory: 141 ordinary collections, 3,150 documents, four basket requests, two correct replacement indexes and two obsolete indexes. No duplicate groups or definition conflicts. Five TTL indexes had no documents expiring within the maintenance window.
- Source integrity review found no migration/guard/model defect. Independent review cleared the temporary operational wrapper before execution. The wrapper enforces the exact endpoint, backend identity, writer pause, quiescence, backup restore comparison and exact index delta.

### Execution and recovery evidence

- First operational attempt stopped before pausing writers or changing indexes because `lsof -Fp` also emits file-descriptor records. The temporary script was corrected to compare only PID records. Independent review confirmed the check still requires the sole verified backend process. This did not change application source.
- Successful attempt: temporary wrapper `/private/tmp/lisno-local-sub-basket-apply.mts --apply-local-indexes`, invoked with the repository's TSX loader; exit 0.
- Private evidence directory: `/private/var/folders/8j/zd8v148d3qs4hdqtz2sncbjm0000gn/T/lisno-local-sub-basket-operation-3iq12pvs/attempt-2` (directory mode `0700`; evidence and backup files `0600`).
- Full backup: `lisno_demo.archive.gz`, 362,416 bytes; SHA-256 `9ee95bdc8409dfb674a2880d3a7b442370350f750f1cc0eafdfc40ad7d8b4e05`. Retained privately, outside the repository.
- Backup was restored only into a separate disposable loopback server. All document BSON hashes, counts, collection options and index definitions matched the source before migration. The disposable server was stopped afterward.
- `before.json`, `restored-verification.json` and `after.json` record content digests and metadata, without document content. `final-dry-run.json` and `migration-index-metadata.json` preserve the exact pre-write inventory. `result.json` records successful apply, cleanup and health verification.
- Final dry run: zero duplicate groups or index conflicts; both exact replacements already existed. Migration removed only the two named old indexes, leaving six request indexes.
- All 141 collections and 3,150 documents, including all four requests, were unchanged. All collection options and unrelated index definitions were unchanged.
- Backend paused at `2026-10-12T05:51:05.413Z` and resumed at `2026-10-12T05:51:27.022Z`, a 21.6-second pause. Readiness guard passed before and after resumption; backend health returned HTTP 200. No resumption or cleanup failure.

### Verification results and limits

- Focused command above: exit 0, **two files / 40 tests passed**, 10.81 seconds. Log: `/tmp/lisno-local-sub-basket-focused-rerun.log`. The initial sandbox-only attempt could not open disposable MongoDB ports (`EPERM`); the authorized rerun passed. Existing Mongoose deprecation warnings remain.
- No fake request was inserted into the app database. Creation and approval behavior were tested in disposable replica sets; the exact configured local setup guard was verified directly. The user's actual draft retry remains theirs to submit.
- Full suites, typechecks, builds, frontend visual checks, OCR and lint were not run for this index-only operation; application sources and contracts were unchanged.
- Production, synchronization, seeds, document migrations, deployments, staging and commits were not performed. No dependencies were added.
- Independent final verification passed: exact backup/source match, exact two-index delta, zero dry-run conflicts, successful readiness/health/resumption and no cleanup errors. The 3,175-file baseline manifest has no missing or new nonignored paths; only this task's specification and plan changed. `git diff --check` and `git status --short` exited 0; all prior work remains preserved.
