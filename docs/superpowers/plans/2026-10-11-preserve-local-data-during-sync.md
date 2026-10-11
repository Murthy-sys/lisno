# Preserve local data during estimator synchronization: task plan

Date: 2026-10-11
Status: Approved by the user; Mode A selected. T1 complete. T2/T3 in progress as parallel implementation subtasks. Live application and scheduler installation remain outside current execution authority.

Approved specification: [preserve-local-data-during-sync-design.md](../specs/2026-10-11-preserve-local-data-during-sync-design.md).

The user approved the specification and this plan in this conversation on October 11, after clarifying that production synchronization must not affect local changes, then selected Mode A.

## Outcome and boundaries

Replace the destructive local collection refresh with a guarded merge. Local additions, edits, and deletions take precedence. Only a proven new source record or an unchanged, previously imported local record may receive an automatic production update. Any unresolved conflict blocks the batch.

Prepare and test the repository implementation and the replacement installed-scheduler entry point. Do not install that entry point, modify the LaunchAgent, apply to `lisno_demo`, restore vendors, commit, push, or mutate production as part of ordinary implementation authority. Present the concrete rollout artifacts and write-free evidence before requesting any remaining external-action approval.

AI chat/Gemini changes and recovery of already missing vendors are outside this plan.

## Current evidence and preservation baseline

- The repository script and `~/lisno-scheduler/sync-estimator-prod-to-demo.sh` both drop each of 16 destination Configuration collections before restoring source data.
- The LaunchAgent schedules the installed copy at 07:00. Updating repository sources alone leaves that path unsafe.
- The current backend already provides TypeScript operations, native MongoDB access through `mongoose.mongo`, and disposable replica-set test infrastructure. Reuse these; no dependency or lockfile change is planned.
- The approved specification is the only dirty path at task-plan start: `docs/superpowers/specs/2026-10-11-preserve-local-data-during-sync-design.md` is untracked. Preserve it. Re-capture dirty paths and scoped diffs before any implementation writer starts.
- Existing local reference mismatches may predate this change. Report them without deleting records or inventing mappings.
- The existing destructive scheduler remains unchanged during planning and repository implementation. Final reporting must distinguish tested code from actual scheduler rollout.

## Design and shared contracts to freeze in T1

Implement the operation in `backend/src/operations/estimator-sync/`, with a small repository shell wrapper. Use one merge implementation for manual and scheduled invocation. Preserve NodeNext `.js` relative-import suffixes.

1. **Exact allowlist and target authority.** Copy the existing 16 collection names into one typed manifest. Production handles support reads only. The executable permits application only to loopback `lisno_demo` on a replica set; no arbitrary target, implicit default database, or production-write option. Synthetic integration fixtures use an isolated ephemeral replica set and its own `lisno_demo`, never the user's running instance.
2. **Typed snapshots.** Snapshot documents and index definitions with type-preserving serialization and deterministic fingerprints. Maintain separate source and target connections, bounded snapshot sizes, snapshot identities, and explicit read-only dependency observations. Reads must not initialize Mongoose models, auto-create collections, or build indexes.
3. **Source consistency.** Read the complete allowlist under a source snapshot read session where supported. Abort if a consistent source snapshot cannot be obtained; do not fall back to independently timed collection dumps. A legitimate empty optional collection is distinct from a missing/failed collection or an unexpectedly empty source database.
4. **Local metadata.** Keep synchronization metadata in dedicated local collections, never in source documents. Record source observations, the source state last applied, the exact locally applied fingerprint, protected local edits/deletions, and batch identity. Store both source and applied state when safe version/sequence reconciliation makes them differ. Preserve protection across source removal/reappearance and metadata upgrades; a missing or incompatible baseline fails closed.
5. **Merge decisions.** The pure planner returns insert, update, unchanged, preserve-local, protected-deletion, initialization-ambiguity, or conflict. Matching uses collection plus stable ID. A locally modified record remains wholly protected, even if production edited a different field. No field merge, forced source-wins mode, automatic deletion, re-keying, or resurrection.
6. **Initialization.** Generate a reviewable, snapshot-bound initialization manifest. Identical documents may be proposed for adoption; differing or source-only records remain protected/ambiguous until explicitly classified. No first-run assumption that source-only IDs are new. Initialization cannot silently overwrite existing data or reset a recorded local protection.
7. **Dependency protection.** Validate the proposed union of incoming and retained local records. Protect Main Line/revision/section groups from source parent-pointer updates that would bypass local child changes. Validate unique keys, immutable lineage, actor references, and local file references without fetching private files or copying users/uploads. Do not worsen pre-existing broken relationships.
8. **Versions and counters.** Specify per-collection CAS and version rules from current schemas/services. Only eligible changed documents advance necessary local versions; versions never regress or leave stale clients able to update. Reconcile display-order high-water marks from source, target, and retained records. Replaying a snapshot must not bump versions or counters again.
9. **Reports.** Produce safe counts and bounded conflict codes with opaque record references. Store private backup/snapshot content separately with restrictive permissions. Never print credentials, connection strings, raw vendor/profile records, source payloads, or private storage references.
10. **Apply contract.** Require an explicit apply mode, validated initialization state, a verified local backup, a source/target-bound plan, and a final dry run. Any blocker means zero batch writes. A fenced sync lease serializes manual/scheduled runs; a single target transaction commits business changes and baseline metadata together. Revalidate affected target state and dependency guards under the transaction. Do not rely on snapshot reads alone to prevent write skew. T1 must identify an enforceable concurrency strategy; if online dependency fencing needs out-of-scope application writes, require a documented exclusive local maintenance window instead of claiming online safety.

T1 must settle the concrete data shapes and concurrency guard before independent writers start. No weakening of the approved preservation or atomicity requirements is allowed. An unexpected material architecture expansion returns to the primary for specification reconciliation.

## Ownership and dependency graph

Ownership applies conditionally after the user selects an execution mode. In Mode B the primary performs all tasks sequentially. In Mode A use the following non-overlapping boundaries; every writer must be told that others share the worktree, and must preserve their changes.

| Task | Owner in Mode A | Owned paths | Dependencies | Acceptance criteria |
| --- | --- | --- | --- | --- |
| T1: Contract and integrity inventory | Primary | Shared `contracts.ts`, `manifest.ts`; this plan | None | AC2–8 |
| T2: Pure merge decisions and graph validation | Backend implementer 1 | `planner.ts`, `integrity.ts`; `estimator-sync-planner.test.ts`, `estimator-sync-integrity.test.ts` | T1 | AC1–6 |
| T3: Read-only snapshots and backup artifacts | Backend implementer 2 | `snapshot.ts`, `backup.ts`; `estimator-sync-snapshot.test.ts`, `estimator-sync-backup.test.ts` | T1 | AC4, AC8–9 |
| T4: Transactional application and metadata | Primary | `apply.ts`, `metadata.ts`; `estimator-sync-apply.replica-set.test.ts` | T1, T2, T3 | AC1–9 |
| T5: CLI, wrappers, rollout package, operations guide | Primary | `cli.ts`, `backend/package.json`, repository sync script, scheduler-wrapper template, operations guide, CLI/wrapper tests | T4 | AC8–10 |
| T6: Independent integrity review | Integrity reviewer | Read-only integrated diff and test evidence | T2–T5 complete, all writers stopped | AC1–10 |
| T7: Final integrated verification | Verification runner | Test commands and temporary evidence only | T6 cleared | AC1–10 |

All named TypeScript modules live under `backend/src/operations/estimator-sync/`; all named tests live under `backend/tests/`. Proposed additional paths are `scripts/estimator-sync-scheduler-wrapper.sh`, `docs/operations/estimator-local-sync.md`, `backend/tests/estimator-sync-cli.test.ts`, and `backend/tests/estimator-sync-wrapper.test.ts`.

Only T2 and T3 may run as independent implementation slices in parallel after T1 freezes the shared contracts. T4 follows their integration; T5 follows T4. Review and final verification are sequential. Keep only one parent task in progress, with T2/T3 represented as parallel subtasks of the implementation stage. Do not spawn agents before execution-mode selection.

## Tasks

### T1. Establish exact collection and safety contracts

- Re-capture worktree state and preserve existing edits. Inspect the installed scheduler read-only; do not execute it.
- Trace each collection's current identity, unique indexes, immutable fields, references, schema constraints, versions, and display-order usage. Produce the explicit validation/guard manifest.
- Confirm source/target capabilities and credentials handling without exposing secrets or using production data in fixtures. Verify relevant current driver behavior from official documentation when implementing snapshot and transaction operations.
- Freeze the contracts described above, including baseline bootstrap, record protection, snapshot digests, dependency protection, safe reports, backup manifests, and concurrency fencing/maintenance requirements.
- Set resource limits and fail-closed behavior for unsupported or oversized snapshots/transactions. Do not batch partial commits to bypass the atomicity requirement.
- Deliverable: shared types and manifest, evidence-backed field policies, and a bounded test matrix. No live apply or scheduler mutation.

### T2. Implement preservation-first planning and validation

- Implement canonical typed comparison and the approved record-level decision table.
- Protect local-only documents, modified shared documents, and known local deletions. Track observed source identities sufficiently to distinguish a genuinely new source ID from one previously removed/reintroduced.
- Implement conservative initialization decisions and reject source-wins resets.
- Validate the proposed target state, including compound uniqueness, immutable fields, status/revision relationships, retained local dependencies, and source pointers that would hide local child edits.
- Apply the frozen version and display-order policies only to eligible records; produce deterministic decisions and safe reports.
- Verify with asymmetric fixtures: locally created POP/painting vendors; distinct IDs with the same normalized name; different local/source edits to the same vendor; a locally deleted imported vendor; a locally edited section under an otherwise unchanged parent; and unequal source/target version/sequence values.
- Deliverable: database-independent planner and focused unit tests passing all preservation branches.

### T3. Implement read-only snapshots and verified backups

- Read source and target through separate native connections without model initialization or implicit index/schema writes.
- Produce complete, typed snapshots and manifests; detect interrupted/empty/malformed exports, unsupported consistency guarantees, changed source snapshots, and resource-limit breaches.
- Read target metadata, indexes, and required external dependency identities without mutating their collections or logging personal fields.
- Write backups to unique private run directories. Include affected target collections, their indexes, and existing sync metadata. Do not erase previous backups or mistake a source dump for a target backup.
- Verify manifests and payload checksums and perform a restore drill only into a fresh disposable test database. Restoring the user's live database is not part of this task.
- Test that preview does not create missing metadata collections or indexes, and that secrets/private fields never appear in safe reports.
- Deliverable: snapshot/backup modules and synthetic artifact round-trip tests. Do not implement application logic owned by T4.

### T4. Implement atomic merge application and crash safety

- Integrate T2/T3; preflight exact target, replica-set support, reviewed initialization, blockers, source identity, target fingerprint, backup validity, and concurrency prerequisites.
- Keep default preview fully write-free. Mutating sync leases or metadata are apply-only and limited to dedicated synchronization collections.
- Acquire a fenced sync lease, perform the final dry run, and commit guarded business operations plus metadata in one transaction. The transaction must not drop collections, rebuild business indexes, delete source-omitted records, or modify protected records.
- Guard changed documents and affected dependencies against concurrent edits. Reject stale plans and lease loss. Test racing local child edits and parent-pointer imports, not only two writers updating one record.
- Do not advance source/applied baseline or lose deletion protection on an aborted transaction. Preserve protection through retry, crash, source absence/reappearance, and later snapshots.
- Provide bounded safe failure results and a no-op result for an identical replay. Do not automatically roll back by overwriting later local changes.
- Use a disposable replica set to prove rollback, no partial commits, duplicate-sync serialization, protected local state, and unchanged out-of-scope data/indexes. Include before/after hashes for approved/issued artifact fixtures.
- Deliverable: transactional application with integrated regression evidence. No application against the user's `lisno_demo`.

### T5. Replace repository entry point and prepare the actual rollout

- Add a dedicated backend CLI command using the existing toolchain. Argument validation must reject ambiguous apply targets and require explicit apply input; omission means preview.
- Replace the repository shell script's drop/restore loop with a thin invocation of the canonical implementation. Resolve paths independently of the caller's directory, including the LaunchAgent's minimal PATH. Obtain credentials without placing them in printed commands or process arguments; avoid sourcing arbitrary shell content from environment files.
- Prepare a thin installed-wrapper template for `~/lisno-scheduler/sync-estimator-prod-to-demo.sh`, pointing to the same canonical implementation. The template defaults to preview and fails safely when its expected repository/runtime is unavailable.
- Test wrapper/CLI execution with synthetic commands and environments. Never invoke the real destructive installed script during testing.
- Document baseline initialization, local-edit/deletion precedence, conflict handling, backup verification, maintenance requirements, run reports, and exact recovery boundaries. Include the actual installed path and LaunchAgent schedule.
- Prepare a concrete rollout package: proposed external-file diff, private backup location for the installed wrapper, verification commands, expected preview behavior, and a rollback that leaves sync disabled or write-free. Do not restore the old destructive job automatically.
- Run a live source/target dry run only if credentials and permission for that read-only scope are available; redact the report. If unavailable, report the exact missing evidence while finishing all synthetic verification and rollout preparation.
- Deliverable: repository CLI/wrappers/docs tested and external rollout reviewable. Installation, LaunchAgent changes, baseline/live-data writes, and enabling scheduled application remain separate explicit actions after the concrete evidence is ready.

### T6. Review the integrated result

- After writers stop, inspect the complete diff for hidden deletions/replacements, unconditional upserts, local resurrection, source-wins initialization, metadata resets, and privacy leaks.
- Challenge dependency/unique-index protection, local modified-child versus source parent-pointer races, version reconciliation, source omissions, source history retention, and transaction size handling.
- Verify dry-run has no model/index/lease writes; validate source-read-only authority and exact destination restrictions.
- Review scheduler parity, credential handling, backup recoverability, and rollback behavior. No automatic fallback may reactivate destructive synchronization.
- Return confirmed defects to their owning writer; integrate and re-review fixes before T7.

### T7. Verify and hand off

- Run the exact focused commands below on the integrated worktree, then typecheck/build and relevant existing reference/display-order suites. Broaden only when shared-contract changes or failures justify it.
- Verify every acceptance criterion against the table below and inspect repository hygiene. Report blockers or skipped live checks without claiming the active scheduler has been fixed.
- Keep temporary synthetic evidence under a task-specific directory such as `/tmp/lisno-preserve-local-sync-2026-10-11/`. Do not commit backups, snapshots, runtime artifacts, credentials, or private records.
- Handoff links the approved spec, this plan, changed source files, operations guide, and rollout package; records exact commands, results, unrun checks, and whether external rollout remains pending.

## Verification matrix

| Acceptance criterion | Required evidence |
| --- | --- |
| AC1: local records survive | Typed before/after equality for local-only POP/painting vendors, nested profile fields, associated baskets, and storage references. |
| AC2: incoming changes work | Proven-new insert and unchanged-managed-record update; indexes and unrelated records preserved; repeat application is a no-op. |
| AC3: local changes take precedence | Same/different-field divergences, local deletion, missing bootstrap history, source catch-up, parent-pointer/locally-edited-child conflict, and rerun protection. |
| AC4: source omissions are safe | Missing record retained, known deletion not resurrected, partial/empty failed snapshot rejected, optional empty collection handled deliberately. |
| AC5: identity and uniqueness | Different-ID unique collisions, wrong parent/actor/reference, immutable changes, and safe reporting of pre-existing orphaned records. |
| AC6: versions and history | Stale local edit fails CAS after eligible import; no version regression; sequence high-water marks preserved; approved/issued artifact hashes unchanged. |
| AC7: atomicity and races | Transaction rollback after injected mid-batch failure, competing sync runs, stale plan, local writer race, dependency race, and atomic baseline commit. |
| AC8: authority and secrecy | Wrong host/database/standalone/source-write attempts denied; out-of-scope collections unchanged; redaction assertions for logs/reports and child-process arguments. |
| AC9: preview and recovery | Full target/metadata/index snapshot unchanged after dry run; private backup manifest validated; disposable restore round-trip verified. |
| AC10: installed entry point | Wrapper behavior tests and external-file diff; explicit evidence stating whether the real scheduled copy was changed or remains pending. |

Planned commands from `backend/`:

```sh
npm test -- tests/estimator-sync-planner.test.ts tests/estimator-sync-integrity.test.ts tests/estimator-sync-snapshot.test.ts tests/estimator-sync-backup.test.ts tests/estimator-sync-cli.test.ts tests/estimator-sync-wrapper.test.ts
npm test -- tests/estimator-sync-apply.replica-set.test.ts
npm run typecheck
npm run build
```

Select the existing Configuration reference/display-order regression files by their current names during T1 and record the exact command/results here. Replica-set tests use isolated fixtures and must never connect to the user's persistent database.

Planned repository checks:

```sh
bash -n scripts/sync-estimator-prod-to-demo.sh
bash -n scripts/estimator-sync-scheduler-wrapper.sh
git diff --check
git status --short
```

No frontend/OCR changes or visual QA are planned. There is no repository lint script; do not claim lint passed. No tests or builds have been run at this planning gate.

## Approval and execution status

- Specification: approved by the user.
- Task plan: approved by the user.
- Execution choice: Mode A, selected by the user.
- Implementation: in progress; verification follows integrated review.
- Installed scheduler, LaunchAgent, local database, production, and deleted-vendor recovery: unchanged.

## T1 implementation record

Three independent read-only audits covered model/reference invariants, concurrency safety, and snapshot/backup behavior. Shared contracts now live in the operation directory; no dependencies are added.

- Apply requires explicit confirmation of an exclusive local maintenance window, including stopping API/workers/manual writers and the old scheduler. Existing services lack a global writer fence. This is an operational prerequisite, not a claim of online protection against arbitrary native writers. Preview remains safe while the app runs.
- Preserve source and applied fingerprints separately, sticky local protection, ever-observed source IDs, and deleted graph-owner IDs. Reviewed initialization permits preserving ambiguous records only; it cannot silently import or overwrite them.
- Native reads use BSON-preserving options. Document reads share a snapshot session, while catalogue/index inventories are compared before and after because catalogue commands do not support that snapshot concern. Compound index key order remains meaningful in fingerprints.
- Required source namespaces are Baskets, MainLines, and Vendors. Other allowlisted namespaces may be explicitly absent when unused; missing references or incomplete reads still fail closed. Entirely empty source snapshots are rejected.
- Changed vendor type/email/rubric, referenced UOM precision, immutable quality/QCO snapshots, and historical pricing/section content are guarded rather than triggering excluded workflow writes.
- Relevant existing regression suites: `tests/ai-estimator-knowledge-reference.service.test.ts` and `tests/ai-estimator-knowledge-display-order.service.test.ts`; broader replica suites are conditional on shared-domain changes.
- Initial dirty set contained only the untracked approved spec and plan. Existing script, package configuration, and server target diffs were empty before source writers started.
