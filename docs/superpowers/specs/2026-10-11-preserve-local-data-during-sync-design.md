# Preserve local data during estimator synchronization

Date: 2026-10-11
Status: Approved by the user on 2026-10-11. Task plan also approved; Mode A selected. Repository implementation authorized; live database writes and external scheduler rollout require their separate scoped authorization.

## Goal

Apply incoming production Configuration updates to local development without deleting local-only data or silently overwriting local edits. Test vendors such as `test-pop` and `test-painting`, and their associated local records, must survive future synchronizations.

The user's requirements are: “updated information should not remove local db data” and “prod db sync should not impact local db changes.” Local additions, edits, and deletions take precedence over automatic production synchronization. This applies to shared IDs as well as local-only test records.

## Current behavior and evidence

- `scripts/sync-estimator-prod-to-demo.sh` reads production and targets loopback MongoDB database `lisno_demo`.
- Its explicit 16-collection list includes `aiEstimatorKnowledgeVendors`, baskets, revisions, sections, and pricing/tax reference records.
- It drops each destination collection before restoring a production dump. This discards destination-only records and replaces indexes. It preserves the database container, but not the contents of these collections.
- The active LaunchAgent, `~/Library/LaunchAgents/com.lisno.estimator-sync.plist`, schedules a 07:00 local-time run of `~/lisno-scheduler/sync-estimator-prod-to-demo.sh`. Editing the repository script alone does not update this installed copy.
- Read-only MongoDB evidence on October 11 shows the vendor collection was dropped and recreated on October 8 at 07:01:49 IST. The scheduler log records a successful run beginning at 07:00:08 IST that day.
- There are currently 13 local vendor records, including one archived record; the two requested test names are absent. Retained database history includes an earlier matching test-vendor insertion whose identity is no longer present. This does not establish a complete recoverable snapshot for both vendors.
- Models use stable string IDs, cross-collection references, compound unique indexes, immutable lineage fields, and version counters. Vendors also contain locally relevant Procurement profile and storage-reference fields. A name-based merge or unconditional replacement can damage these relationships even without dropping a collection.
- The working tree was clean at specification start. No existing synchronization regression tests were found in the relevant script/test inventory.

## Scope

- Replace destructive synchronization for the existing 16 explicitly listed Configuration collections with a guarded, repeatable merge into `lisno_demo`.
- Provide write-free preview, conflict detection, safe local backup, atomic application, verification, and an operational rollout procedure for the actual scheduled entry point.
- Protect all destination records outside that allowlist and all local-only records within it.
- Keep production access read-only and credentials outside reports and command output.

### Non-goals

- Changing AI chat, Gemini models, retry behavior, application UI, or API contracts.
- Writing to production, changing production data, or synchronizing local data back to production.
- Deleting or automatically archiving records merely because they are absent from the source.
- Reconstructing already deleted vendors or replaying historical database operations. Recovery requires a separately verified source and explicit approval for the exact records and destination.
- Automatically reconciling different IDs by name/code, importing production users, or copying production uploads.
- Modifying the scheduler, installing its replacement, or running the new merge during the specification stage.

## Recommended behavior

Use stable-ID matching with a stored baseline of the last successfully synchronized source state. Apply record-level conflict checks before updating shared records. A locally modified record is protected in full, even when production changed a different field. Production cannot override that protection through a newer timestamp or version, a rename, or a subsequent scheduled run. Conflicts are reported for review; there is no automatic production-wins policy or field-by-field blend.

| Source and local state | Result |
| --- | --- |
| Source ID is proven new since the tracked source baseline, is absent locally, has no protected local deletion, and has valid references with no unique-key conflict | Insert the source record and establish its baseline. |
| A previously synchronized ID was deleted locally but still exists in production | Preserve the local deletion. Record or retain its protected-deletion metadata; do not recreate the record. |
| An ID is present only in production during first-run initialization, with no reliable local history | Report an initialization ambiguity. Do not assume it is new or automatically restore a potentially locally deleted record. |
| Local ID is absent from the source | Preserve the complete local record, including status and relationships. |
| Source and local records already match | Leave business data unchanged; safely establish or retain baseline metadata. |
| Source changed since baseline, and local still matches the baseline | Apply the incoming update after schema, lineage, version, and reference checks. |
| Local changed since baseline, and source did not | Preserve the local changes; retain the previous baseline so later divergence is detectable. |
| Both changed and resulting records differ | Preserve the complete local record and report a conflict; do not overwrite either version. |
| Shared ID differs on the first run and no trusted baseline exists | Report an initialization conflict. Do not guess which copy is authoritative. |
| Different IDs collide on a unique name, code, or compound key | Report a conflict. Never delete, rename, or re-key local records to force an import. |
| Source fetch is incomplete, malformed, inconsistent, or unexpectedly empty | Abort without modifying target business data. |

An upstream deletion never becomes a destination deletion. Explicit source lifecycle changes on a shared record are updates subject to the same conflict checks; source absence is not an instruction to archive it.

Initialization requires a reviewed baseline identifying eligible imported records and protected local state. A baseline reset must not erase local-edit or local-deletion protections. The incoming snapshot alone cannot establish that a record is safe to overwrite or recreate.

### Options considered

1. **Guarded merge with baseline tracking, recommended.** Supports incoming updates while protecting local-only records and local edits. Requires small local synchronization metadata and an explicit first-run conflict report.
2. **Unconditional upsert by ID.** Preserves local-only documents but silently overwrites local changes to shared records, including vendor profile fields. Insufficient for the preservation requirement.
3. **Insert missing IDs only.** Protects existing records but never refreshes already imported Configuration information. Insufficient for the requested updates.

## Requirements and invariants

### Identity, configuration, and historical data

- Match documents only by collection and stable `_id`. Names and labels are presentation and uniqueness constraints, never identity substitutions.
- No destination collection/database drop, delete-all, replacement restore, or source-driven document deletion is permitted.
- Existing destination indexes remain intact. Check all affected unique constraints against the proposed merged state before applying writes.
- Preserve every local-only or locally modified document exactly, including embedded data, timestamps, business versions, status, and storage references. Do not flatten or append arbitrary nested arrays to merge competing business values.
- Preserve local deletions through durable synchronization metadata. Repeated runs and source updates must not resurrect those IDs. A deliberate restoration needs separate scoped direction.
- Compare typed values correctly, including BSON dates, integers, null, missing fields, and ordered arrays. Do not infer precedence from timestamps alone.
- Respect immutable identity/parent relationships and historical pricing lineage. A same-ID immutable-field mismatch is a conflict.
- Display-order sequence values must not decrease; reconcile their safe high-water marks with both retained local records and incoming records rather than copying a smaller source counter.
- Concurrency/version tokens on updated shared records must not move backward or permit an old local edit to pass as current. Define and test the collection-specific version behavior before enabling application.
- Validate revision pointers, basket/sub-basket ownership, vendor/UOM/mode/tax links, and other dependencies against the proposed complete target state. Missing external dependencies, including required actor/file references, must be reported rather than fabricated or joined by name.
- Retained local-only records may already contain broken references from the previous destructive sync. Report these separately and block any operation that would worsen their integrity; never silently repair them by deleting or substituting records.
- Keep the established Configuration source rule: latest saved draft when present, otherwise saved active revision. Protect local changes across the related Main Line/revision/section graph: an incoming parent-pointer or lifecycle update must not bypass a locally edited child even when the parent document itself was unchanged. Report the dependent conflict and retain the local graph.
- Approved estimates, customer prices, published/issued artifacts, projects, users, assignments, KPI records, audit history, uploads, and other collections remain unchanged.

### Preflight and atomic application

- Source remains read-only. The only permitted apply target is the exact loopback `lisno_demo` database; refuse production, non-loopback, and other local databases.
- Fetch a complete source snapshot into a unique run location and validate completeness and cross-collection consistency before considering writes. Failed downloads must not reuse partial or stale data from another run.
- Preview is the default behavior and performs no target business-data, baseline, index, or schema writes.
- Produce counts for inserts, updates, unchanged records, retained local records, protected local edits/deletions, initialization ambiguities, conflicts, and validation failures. Reports must redact personal data, credentials, connection strings, and storage references.
- Any unresolved conflict or integrity failure blocks the apply phase for the entire batch. Do not partially import a dependent subset.
- Before a live apply, create and verify a restorable backup of the affected local collections, index definitions, and synchronization metadata. Preserve earlier backups; a source export is not a local backup.
- Tie application to the validated source snapshot and target state. Perform a final dry run and detect target changes between preview and commit; reject a stale plan.
- Apply the batch and baseline metadata atomically on the local replica set. Reject unsupported standalone MongoDB rather than weakening transaction semantics. If dataset size exceeds a safe atomic batch, stop with a clear report instead of falling back to incremental partial writes.
- Serialize scheduled/manual sync runs and protect against concurrent application edits using transactional reads/writes and relevant version checks.
- Repeating an already applied snapshot is a no-op for business data and does not advance business versions. Baselines advance only with successful commits.
- A crash or provider/database failure leaves either the prior committed state or the complete new state. Report failure without claiming a successful sync.

## Operational rollout and authority

- The specification and future implementation do not authorize a live synchronization, vendor recovery, or production write.
- Implementation must prepare a reviewable replacement for both the repository entry point and the installed scheduler copy. Keep their actual behavior aligned and avoid a second independently maintained merge implementation.
- Before changing the installed entry point, identify the exact external file changes, scheduler behavior, backup/rollback path, and dry-run outcome. Installation outside the workspace follows filesystem permissions and the repository's external-action approval requirements.
- Until that rollout is explicitly performed, the existing scheduled script remains destructive. Do not describe a repository-only fix as protecting the running job.
- Do not run the old destructive script as a test. Do not silently disable or reschedule the LaunchAgent at this gate.
- Once authorized for rollout, update the installed entry point before allowing the next scheduled apply. Failed preflight or unresolved first-run conflicts must leave local data untouched and produce an actionable safe report.
- Rollback must never reactivate the old drop-and-restore behavior automatically. A failed rollout leaves synchronization disabled or in write-free preview, according to the approved rollout procedure. Restoring a backup is a separate explicit action with target-change checks.

## Acceptance criteria and verification

1. **Local records survive:** fixtures with local-only vendors `test-pop` and `test-painting`, local baskets, embedded fields, and related records remain byte-equivalent after an incoming update.
2. **Incoming data updates:** new source IDs are inserted and an unchanged local record receives a valid source update without deleting unrelated records or indexes.
3. **Local changes survive:** local edits to shared IDs, including edits to fields different from the incoming change, remain unchanged. Local deletions are not recreated on reruns. Divergent records and first-run ambiguities generate a report and zero batch writes. A remote parent-pointer change cannot hide or bypass a locally edited child revision/section.
4. **Source omissions preserve data:** omitted/deleted source records stay local; failed or empty exports cannot clear data.
5. **Identity and uniqueness are safe:** different IDs with colliding unique fields fail preflight; immutable-reference changes and missing dependencies cannot corrupt the target graph.
6. **Versions and sequences remain safe:** retained local drafts, active pointers, version/CAS behavior, and display-order high-water marks remain valid. Existing immutable financial artifacts are unchanged.
7. **Atomic, repeatable operation:** replica-set integration tests cover reruns, concurrent target edits, concurrent sync runs, failures before/during commit, and baseline consistency.
8. **Scope and secrecy hold:** tests reject the wrong host/database and writes outside the allowlist plus dedicated sync metadata. Reports do not expose fixture secrets, private fields, or connection strings.
9. **Dry run and recovery are real:** previews leave target data and metadata unchanged; a synthetic backup/restore drill verifies recoverability. No live rollback runs as part of testing.
10. **The scheduled path is accounted for:** the handoff identifies the installed script path and whether rollout was actually authorized and performed. The repository and installed entry points cannot silently retain differing destructive behavior.

Verification will use synthetic datasets and a disposable replica set. Run focused merge/preflight/integration tests, affected backend typecheck/build if the implementation uses backend TypeScript, shell syntax checks for wrappers, and `git diff --check`. A live dry run is separately scoped read-only evidence; it is not permission to apply.

## Assumptions, risks, and open decisions

- The user explicitly requires protection for local changes. This includes local edits to shared IDs and local deletions, not only separately created test records.
- Existing source/target differences may produce substantial initialization conflicts because no trusted sync baseline exists today. Automated synchronization stays write-free until those are reviewed; it must not assume all source values win.
- The current cross-environment data may contain identity or upload-reference mismatches. Those are risks to report, not reasons to expand into user/file replication.
- Recovery of the two already missing test vendors remains unverified and outside this prevention change.
- No additional product decision is required to approve this specification. Any later choice to prefer production over a particular conflicting local record requires a concrete conflict report and explicit scoped direction.
- The task-plan file and execution-mode choice will follow only after specification approval, as required by `AGENTS.md`.
