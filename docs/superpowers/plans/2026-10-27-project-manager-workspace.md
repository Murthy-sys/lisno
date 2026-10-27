# Project Manager workspace and role consolidation task plan

Date: 2026-10-27
Status: Original R0–R9 implementation/review/verification complete with documented test limits. The user approved the local dashboard assignment-mapping specification and plan, retained Mode A, and responded to the final target-specific apply prompt. M0–M7 are complete on local `lisno_demo`: five mappings applied, protected records verified, fresh-session API and actual desktop/mobile dashboard checks passed. The actual old-token HTTP probe was not completed; session-version advancement and existing replica regression evidence are recorded below. No production deployment or global role migration was performed.
Source of truth: [Approved Project Manager specification](../specs/2026-10-27-project-manager-workspace-design.md), including approved mapping criteria DM1–DM5, consolidation criteria RC1–RC7 and workspace criteria AC1–AC12.

## Local dashboard assignment mapping task-plan addendum

This section implements the approved mapping addendum and supersedes earlier statements that no database target has been inspected. The specification's earlier status line predates its latest approval; this task-plan update records that approval without modifying the specification at this gate. Earlier implementation, evidence and Mode A selection remain valid. Plan approval resumes preparation in that existing execution mode; it does not authorize the final database write.

### Fixed scope and invariants

- Target: local loopback Mongo port 27017, database `lisno_demo`, target identity `local-lisno-demo-27017`. Revalidate the replica-set fingerprint; do not infer permission for another database or a remote server.
- Repair only the five exact project IDs in the approved specification. All currently have a valid unique Site execution task owned by active canonical account `user-site-manager`; all five projects are active and their `programManagerId` is missing/null.
- Populate that field with the existing task owner. Do not change task owners, roles, source/status/progress, approvals, financial data, deadlines or historical signatures.
- Keep seven unassigned projects and four orphan Site tasks unchanged. One orphan is completed. Preserve their fingerprints and report them explicitly. The general role migration remains blocked by its orphan conflicts; this operation is separately identified as scoped assignment synchronization.
- Preserve runtime fail-closed authorization. No frontend join, fake project cards, name-based mapping or relaxed assignment resolver is needed.
- Atomic write scope is five project mapping/version/fence updates, one affected manager's version/session invalidation, authorization coordination, per-project audit/change events and a protected operation receipt. No role conversion, task creation or orphan cleanup.
- No dependency, lockfile, frontend/mobile redesign, production action, seed, commit or deployment is planned.

### M0. Preserve the integrated worktree and pin the scope

Owner: primary. Dependency: this task plan's approval. Recapture dirty paths, relevant tracked diffs and hashes/copies of untracked migration/assignment targets before assigning writers. The existing implementation is user work to preserve, not a baseline to overwrite from HEAD.

Prepare a private scope artifact with the five approved IDs, owner ID, explicit target and four preserved orphan IDs/fingerprints. Existing `/tmp/lisno-pm-dashboard-mapping/manifest.json` is diagnostic only and cannot be edited into an executable full-role manifest. Re-read current assignment facts and confirm the twelve/five/seven/four counts; stop on any material drift. DM1, DM3.

### M1. Implement a separate scoped inventory and manifest

Owner in Mode A: backend implementer. Exclusive proposed files: `backend/src/migrations/project-manager-assignment-sync-inventory.ts` and its focused unit test. Dependencies: M0 and the primary's settled manifest contract.

Reuse existing canonical classification and BSON/digest utilities, while giving this operation its own schema/application version and receipt identity. Do not weaken or rewrite the full-role migration's unresolved-conflict guard. Native reads must not import live models, initialize collections/indexes or perform writes.

Require exact selected project IDs and one active canonical owner. Validate each project's unique current task, approved/preparation source, current completion/frozen-review bindings, counters and existing owner. Only absent/null project-owner fields or an already synchronized same owner are acceptable; different owners, legacy/inactive users, missing/duplicate tasks or invalid sources block the scoped operation. An already synchronized scope must be a safe no-op or a verified receipt retry, not another session/version increment.

The manifest must bind the target, scope, owner, expected versions/before-values, allowed field changes, preserved orphan evidence, protected history/outside-record fingerprints and digest. Known orphan records are recorded as preserved outside scope; they are not silently removed from the full inventory. New or changed relevant conflicts invalidate the manifest. Output only safe IDs, counts, reason codes and hashes. DM1, DM3, DM4.

### M2. Implement atomic apply and guarded rollback

Owner: same backend implementer, sequential after M1. Exclusive proposed files: `backend/src/migrations/project-manager-assignment-sync.ts`, `backend/src/migrations/project-manager-assignment-sync-rollback.ts` and focused replica-set tests. Any required shared audit-event registry edit remains primary-owned and must be coordinated first. Existing role migration modules, runtime assignment service and frontend remain unchanged unless a concrete integration need is reviewed by primary.

Require explicit apply/rollback mode, target, manifest, run ID, verified backup reference and sole active Super Admin operator. Rebuild/validate fresh scoped inventory, check the exact permitted field/record set, then repeat relevant validation under a snapshot transaction and authorization/assignment fences. Commit all five mappings, monotonic manager/session versions, audits/events and receipt atomically. A fault after any write must roll back the entire operation. Preserve current task bytes and immutable history.

Retries bind to the same target/operator/run/manifest/backup and verify the stored receipt plus current post-state before succeeding without duplicate writes. Rollback restores only authorized mutable before-values, advances version/session/fence counters again, preserves both audit trails and refuses later business activity. Keep scoped and full-role receipt formats distinguishable; neither CLI may accept the other's manifest. Dry run remains the default. DM2–DM4.

### M3. Rehearse the complete mapping and dashboard path

Owner: primary with backend implementer. Dependencies: M1–M2. Use disposable replica-set fixtures with synthetic identities, five valid assigned projects, seven unassigned projects and four orphan tasks including a completed one. Never copy private database contents into repository fixtures.

Cover zero-write inventory, already-mapped/no-op handling, stale/tampered/wrong-target manifests, wrong/inactive/legacy owner, duplicate or invalid-source task, frozen-review mismatch, new/changed orphan evidence, unauthorized operator, transactional failure injection, concurrent assignment/source changes, repeat apply and rollback after later activity. Compare protected records byte-for-byte.

Verify before/after the real portfolio service and shared resolver: the five intended projects appear exactly once for their owner; an asymmetric other manager sees none; the seven unassigned projects and all task/history records remain unchanged. Verify session invalidation and refresh/re-authentication behavior. Run focused existing assignment, workspace, role-migration and chat/authorization regressions to show the new scoped path has not altered them. DM1–DM5.

### M4. Independent integrity review, then final preparation verification

Mode A owners: `integrity_reviewer`, then `verification_runner`, both read-only and sequential after writers finish. Review the exact selected-record boundary, conflict treatment, source/frozen-review checks, fences/CAS, receipt separation/idempotency, backup contract, rollback and monotonic sessions. Primary resolves findings before the verifier starts.

Checks: backend `npm run typecheck`; focused new unit/replica tests and existing `project-manager-assignment*`, `project-manager-workspace.replica-set.test.ts`, `project-manager-role-migration*` and affected authorization/chat suites; backend `npm run build`; `git diff --check`. Run local replica tests with the permissions required for local listeners. Reuse the already verified frontend layout and focused dashboard tests because no UI change is planned; broaden checks only for a new change or unresolved failure. Record exact commands/results and keep known unrelated full-suite failures distinct. DM1–DM5.

### M5. Prepare the target-specific backup and final dry run

Owner: primary. Dependencies: M3–M4 passed. Preparation remains read-only against `lisno_demo`; local evidence files may be written privately outside the repository. Inspect the actual target again, identify competing application/background writers, and prepare a brief maintenance/quiescence procedure. Do not silently stop unrelated processes or claim the database is quiescent without evidence.

Prepare a private, restorable backup preserving BSON values and the records needed for complete recovery. Use existing database backup tooling when available; do not add a dependency merely for convenience. Restrict file permissions, record a checksum, and verify decoding/restore integrity using an isolated destination. A backup-reference string alone is not verification. Do not print credentials, user documents or personal data.

Produce a fresh scoped dry run after backup verification and check that its target/state match the backup and five approved mappings. Present the exact five-project change set, preserved seven/four counts, session re-login impact, backup evidence, rehearsal results and rollback command. Request explicit authorization for the single apply action on local `lisno_demo` only at this final execution boundary. Do not ask again for already approved code preparation or Mode A. DM1, DM3–DM5.

### M6. Apply only after explicit target authorization

Owner: primary; no parallel writers. Dependencies: M5 and explicit authorization of this concrete local write. Establish the reviewed maintenance conditions, take/verify a fresh backup if needed, regenerate the final dry run immediately before applying and refuse any scope/conflict/state drift. Apply the exact approved manifest with the verified backup reference and operation run ID. Never hand-edit a manifest to suppress a conflict. Report failure without retries that choose another owner or expand scope. DM2–DM4.

### M7. Verify the actual dashboard and hand off

Owner: primary, read-only after apply. Verify the receipt, all five canonical ownership results and the authenticated portfolio response/default active-project count. Where a valid local session is available, confirm the actual dashboard after refresh/sign-in without saving screenshots containing private project/client data. Verify seven unassigned projects, four orphan tasks, all task owner/status fields and protected history fingerprints are unchanged. Confirm stale sessions lose access and renewed authorized sessions work.

If verification finds a mismatch, stop and evaluate the guarded rollback against current activity; do not automatically overwrite new work. Report exact applied IDs/counts, backup/receipt locations, tests, any UI/session verification gap and the still-unresolved orphan history. No global role migration, production rollout or orphan cleanup is implied. DM2–DM5.

### Parallel schedule and ownership

Only M0 is the parent task initially in progress after plan approval. M1–M2 have one backend writer with explicit ownership. A separate read-only audit may inspect backup/rollback and downstream portfolio verification in parallel; it must not edit those files or mutate a database. M3 integration is sequential, followed by M4 review and verification. M5–M7 are primary-owned and never overlap another writer. Existing Mode A approval carries forward; do not restart completed execution-choice gates.

### Approval and implementation state

- Mapping specification addendum: approved by the user's latest `Approved` response.
- This task-plan addendum: approved by the user's subsequent `Approved` response; existing Mode A selection retained.
- M0: baseline captured under `/tmp/lisno-pm-dashboard-mapping/preparation-baseline/`. Fresh read-only inventory confirms the same five mappings, seven unassigned projects and four orphan conflicts. Explicit scope saved to `/tmp/lisno-pm-dashboard-mapping/scope.json` with private permissions.
- M1–M3: scoped inventory/apply/rollback modules and tests implemented. The final new-module lane passes 42 tests (17 unit, 25 replica). Rehearsal includes actual portfolio visibility for five owner-only projects and stale-session denial, same-run races, fault injection, rehashed tampering, preserved orphan/history fingerprints, no-op and guarded rollback. Primary registered the two distinct scoped audit actions; the general role migration and runtime authorization remain unchanged.
- M4: independent integrity review passed after fixing topology drift between rollback preflight and its transaction. Added empty/populated collection-drift regression cases. Final independent verification passed 197 backend tests across 10 files, 15 dashboard tests, backend typecheck/build and `git diff --check`. Scoped source hashes were stable; the three original full-role migration modules match the captured baseline. Exact commands/results and unrun broader checks: `/tmp/lisno-pm-dashboard-mapping/verification-report.md`. No lint script exists.
- M5: private target-only backup restored into an exclusively owned isolated replica and matched all raw BSON, counts, collection options and indexes. Matching scoped inventory generated during the same pause reports five selected/to-map, zero already mapped, seven outside projects, four preserved orphans and no conflicts. Restored backup and dry-run business snapshots match; the target replica fingerprint matches. Source remained unchanged throughout that verification. Evidence is detailed below.
- M6: the user's response to the final target-specific prompt authorized the five mappings on local `lisno_demo`. Applied once under run `lisno-pm-dashboard-mapping-20261027`; no retry or rollback occurred.
- M7: stored receipt, exact five ownership results, protected raw BSON, actual authenticated portfolio and rendered desktop/mobile dashboard verified. Detailed evidence and the stale-token HTTP limitation follow.

### M5 final preparation evidence and proposed local action

The proposed action is exactly the five project IDs listed in the approved specification, all mapped to existing owner `user-site-manager`, on loopback `lisno_demo` only. Sole active operator ID is `user-super-admin`. The affected manager must sign in again because the operation advances their session version once. The seven other projects and four orphan task records remain unchanged. No role conversion is required for this target.

- Backup verification: `/tmp/lisno-pm-dashboard-mapping/backup-2026-10-27T18-23-44.150Z/verification.json`, verified at `2026-10-27T18:24:04.468Z`.
- Archive: the same directory's `database.archive.gz`, 413,365 bytes; SHA-256 `826832b32f0b80916253d8d7d7ae972cd9fbfe2d709c31e5e17eee7274b881f8`. Archive/report/manifest are mode 0600 inside a mode 0700 directory.
- Verified scope: 159 collections, 3,997 documents. Mongo server 8.3.7, FCV 8.3, existing database tools 100.16.1. Source and isolated restore matched BSON bytes, metadata and indexes; no source restore was performed.
- Matching manifest: the same directory's `sync-manifest.json`; digest `4d65e37721edd47ba0558bb08b9599f03ec41912f136bd88c68822b0ab35eccb`. Source target digest `ba51bdca47f71e50dd7a4c4b3d9c1223aa9d49ea29861d1142ec8696854a7c8e`.
- An initial backup attempt detected background writes and was rejected. Only the identified Lisno development process group was then briefly paused with `SIGSTOP`, automatic `SIGCONT`, a timeout and independent resume watchdog. The final matched preparation took 22.88 seconds and the backend resumed. Evidence: `/tmp/lisno-pm-dashboard-mapping/backup-pause-result.json`. No project mappings were applied.

Preparation backup does not establish a later maintenance window. After explicit authorization, revalidate the process group/target, briefly pause only the local Lisno backend, prepare a new verified backup and matching dry run, and apply immediately while paused. Refuse changes to the five/seven/four scope or any conflict; never reuse a stale manifest. Resume the backend in a guarded `finally` path. Verify the receipt and portfolio after resumption.

The commands below document the approved tooling interface, not an executed write. `VERIFIED_MANIFEST` and `VERIFIED_BACKUP_REPORT` must be the freshly generated private paths from that final maintenance window. Use one recorded run ID consistently; backup reference and operator must match the receipt. Working directory: `backend/`.

```sh
node --env-file=.env dist/migrations/project-manager-assignment-sync.js --mode apply --database lisno_demo --target local-lisno-demo-27017 --manifest VERIFIED_MANIFEST --run-id lisno-pm-dashboard-mapping-20261027 --backup-ref VERIFIED_BACKUP_REPORT --actor-id user-super-admin
```

Guarded rollback, if separately authorized and no subsequent business activity invalidates its receipt:

```sh
node --env-file=.env dist/migrations/project-manager-assignment-sync-rollback.js --mode rollback --database lisno_demo --target local-lisno-demo-27017 --manifest VERIFIED_MANIFEST --run-id lisno-pm-dashboard-mapping-20261027 --backup-ref VERIFIED_BACKUP_REPORT --actor-id user-super-admin
```

### M6–M7 executed action and final evidence

The local operation ran after the target-specific apply response. A fresh backup and matching dry run were generated during the same pause as the write; the earlier M5 archive was not reused for apply. The backend resumed after 24.05 seconds. The primary performed the mutation once; no agent wrote the configured database. The reusable backup report retains its conservative `finalMaintenanceQuiescenceEstablished: false` preparation label; actual maintenance evidence is the separate `/tmp/lisno-pm-dashboard-mapping/apply-pause-result.json` plus the transaction's fresh-state validation, not that report flag.

- Receipt: `projectManagerAssignmentSyncReceipts`, ID `assignment-sync:lisno-pm-dashboard-mapping-20261027`, status `applied`. Six intended mutable records changed: the five approved projects and the affected manager's version/session fields. The transaction also recorded six audit records, five project events and authorization coordination.
- Actual backup/report directory: `/tmp/lisno-pm-dashboard-mapping/backup-2026-10-27T18-29-14.631Z/`. Archive SHA-256: `b92aff989373933b0db9e397ce90dafe6c53814318644c4028f136b9fe8ad42d`. Actual manifest digest: `e8d0e4b15844be386eec902d4fa35347eff6f7ae8583701d02cabb086c7a8052`. The report and manifest paths in this directory are the receipt-bound recovery references.
- Receipt inspection at `2026-10-27T18:30:43.750Z`: exact five project IDs matched; user/session versions advanced once; all expected source/task/history fingerprints matched; no post-resumption differences. Evidence: `/tmp/lisno-pm-dashboard-mapping/receipt-inspection.json`.
- Protected raw comparison at `2026-10-27T18:32:18.255Z`: 3,990 protected records across 158 collections matched the isolated restored backup byte-for-byte, with zero differing collections. Excluded only the six intended mutable records and eleven newly recorded audit/events. Seven outside projects and four orphan tasks are included in the preserved records. Evidence: `/tmp/lisno-pm-dashboard-mapping/raw-verification.json`.
- Actual HTTP/UI verification at `2026-10-27T18:32:34.298Z`: renewed login HTTP 200; portfolio HTTP 200; total/items/active count all five; exact approved IDs appeared once. Actual frontend `/execution` rendered five cards at desktop 1440px and mobile 390px, without horizontal overflow, page errors or failed API responses. Isolated installed Chrome was used; no private screenshots or saved credentials. Evidence: `/tmp/lisno-pm-dashboard-mapping/dashboard-verification.json`.
- Existing independent preparation checks remain 197 backend tests, 15 dashboard tests, backend typecheck/build and clean whitespace. No product source changed during the operational apply. Broader suites were not repeated; earlier unrelated baseline failures remain documented separately.

An additional temporary verification helper initially reported `PROTECTED_RAW_BSON_CHANGED` after the transaction and its immediate complete-state validation had succeeded. Independent review traced this to mismatched ID encoding in the helper: it counted the eleven expected new audit/events as unexpected rows. No mutation was retried. The stored receipt was inspected, and a separate corrected read-only comparison against the isolated restored backup established the raw preservation result above. This was an orchestration-check defect, not a product migration failure.

The pre-apply HTTP token was held only in memory and discarded when that helper returned its error. Therefore the intended actual old-token HTTP 401 probe was not run, and no token was synthesized to claim it passed. The actual stored session version advanced exactly once; stale-session rejection is covered by the passing replica tests, and a real fresh login plus portfolio request passed. Users should sign in again if their prior session expires.

Final evidence reconciliation is recorded in `/tmp/lisno-pm-dashboard-mapping/final-verification.md`. No rollback, global role migration, orphan cleanup, production action, seed, commit, push or deployment occurred. The full-role migration remains blocked by its four previously reported orphan conflicts; the scoped dashboard mapping is complete.

---

## Retained original consolidation plan and evidence

The specification's earlier status line predates the user's latest approval; this plan records that approval without editing the specification during the task-plan gate. Original workspace execution used Mode A. The user approved the revised specification and task plan and selected Mode A. Local implementation is authorized; an unspecified live database migration is not.

## Outcome and fixed decisions

Consolidate Site Manager and Program Manager into one active role, displayed **Project Manager**. Retain stored role `site_manager` because existing verification, handover, task ownership and operational KPI already use it. Convert legacy `program_manager` users without changing user IDs, credentials, active state or historic signatures. This does not merge distinct accounts.

Use `Project.programManagerId` as the compatibility field for the consolidated project owner. Synchronize any current Site execution assignment transactionally. Keep the compact dashboard, four sidebar destinations and eight project tabs already implemented. Preserve applicable Site verification, completion and work-order approvals within the project workspace and existing deep links.

Preserve existing operational KPI and its recorded policy. New PM-specific scoring, cross-role ranking and bonus calculations remain unavailable without a configured policy. Preserve the original approved progress formula and immutable financial-source requirements in the historical plan below.

No new dependencies, global theme rewrite, native eight-tab redesign, payment execution, external messaging, commit, deployment or live migration is included in local implementation authority.

## Current evidence and baseline

| Area | Verified state and implementation consequence |
| --- | --- |
| Identity | `backend/src/domain/roles.ts` contains both roles. Separate historical parsing from assignable/invitable roles; do not globally delete the legacy enum. |
| Assignment | `services/procurement-project-identity.service.ts` updates the PM scalar and requires a `program_manager` user. `services/project-workflow.service.ts` independently assigns `site_execution` tasks to `site_manager`. Both paths must converge. |
| Source and phase | `ProjectWorkflowTask` has immutable role/source fields, `preparationOnly`, `supersededAt`, version and approval epoch. Payment activation is the sole existing phase-change authority. Assignment consolidation must preserve it. |
| Scope | `services/vendor-execution-access.ts` separately grants PM scalar access and Site task access. Several existing readers count all matching site tasks. Replace independent ownership decisions with the same validated current-assignment result. |
| Frozen reviewers | `procurement-basket-approvers.service.ts` explicitly documents that serialized reviewer slot `program_manager` means Site Manager. Preserve that slot spelling and all issued actor IDs; require current/frozen identity consistency. |
| Administration | Responsibility counts omit PM scalar and workflow-task assignments. Both memory and Mongo implementations and their contract must include the relevant responsibilities before ordinary role edits can be considered safe. |
| Sessions | Authentication checks stored role and session version. Conversion and rollback must increment versions and invalidate current access, never restore old session versions. |
| Web | `/execution` currently opens the new PM workspace for `program_manager`; `site_manager` redirects to `/home`. Project routes still dispatch to distinct screens. Consolidate those branches and preserve old URLs. |
| Mobile | Role contracts, landing registry and project administration still expose the split. Compatibility changes are required even though the native screen redesign is excluded. |
| Migration | No named target, backup, live inventory or conflict-resolution mapping has been supplied. Local tooling and isolated rehearsals can be implemented; live apply remains a separate final action. |

The worktree already contains the original PM implementation, tests and documentation. Capture `git status --short`, the tracked diff and the contents of relevant untracked targets before any new writer starts. Preserve these files; do not overwrite them from HEAD, stage them, or treat them as generated debris. New ownership starts from this integrated baseline.

Previous verification is evidence, not a substitute for post-merge checks: final focused runs passed 306 frontend tests and 166 backend status/contract tests, with separate PM replica coverage. Both builds and typechecks passed. Synthetic browser checks covered 360, 390, 768, 1024, 1280 and 1440px. The remaining 97 frontend full-suite failures reproduced on HEAD. Thirteen backend Config/Knowledge assertion failures and additional full-suite replica timeouts were not all baseline-proven. Local evidence: `/tmp/lisno-pm-qa/verification.md` and `/tmp/lisno-pm-qa/README.md`. Keep that distinction in the final report.

## Shared contract to settle before parallel writers

### Identity and permission boundary

- `site_manager` is the canonical active role, displayed Project Manager. Historical DTOs/audit records may retain `program_manager`; user creation, ordinary role changes, invitation creation and acceptance cannot produce it after cutover.
- Retain history parsing separately from active role choices. User IDs are stable. Inactive users remain inactive. No email-based or name-based account deduplication.
- Consolidated permissions comprise existing Site responsibilities and scoped PM operations. Avoid an indiscriminate union of whole role grants; register each operation and preserve Client, Designer, Procurement, Finance and Super Admin boundaries.
- Current project assignment governs PM reads, commands, evidence, chat and live delivery. Authentication still checks current user role, activity and session version. Historical role compatibility must not become runtime authorization.
- All mutable role/assignment paths use existing authorization coordination. An ordinary role editor must not become an alternative to the conflict-aware migration.

### One current assignment

Introduce a small shared assignment domain result and Mongo adapter, proposed paths `backend/src/domain/project-manager-assignment.ts` and `backend/src/services/project-manager-assignment.service.ts`. Keep pure classification usable by migration and memory-backed readers without importing live models.

The result distinguishes assigned, unassigned and reconciliation-required states and carries stable project/user/task IDs, expected versions and safe reason codes. Determine current rows from the existing source/phase/supersession rules. Never choose the latest timestamp, an arbitrary first task, or a display name as a tie-breaker. A preparation task can carry the assignment without becoming execution work. Completed decisions and superseded tasks remain historical; their actor fields are not rewritten to resolve a current conflict. Source ambiguity is a reported conflict.

Both assignment mutations validate the target active canonical user, current project/task versions and existing completion restrictions. Update scalar and eligible current task atomically, with audit and authorization/approval fences. If no task exists, save the scalar only. Existing approved-source activation subsequently copies that owner; it must not invent or prematurely activate a task. A source changeset, award or reassignment racing this transaction must conflict or observe a consistent new owner.

Lists may use indexed scalar/task candidates, but validate them through the same resolver before exposing project details/counts. Private endpoints remain non-disclosing for unassigned users. Authorized administrators receive explicit reconciliation reasons. Preserve `programManagerId` and existing response-field names where compatibility suffices.

### Migration inputs and outputs

Create dedicated modules, proposed paths:

- `backend/src/migrations/project-manager-role-inventory.ts`
- `backend/src/migrations/project-manager-role-migration.ts`
- `backend/src/migrations/project-manager-role-rollback.ts`
- `backend/src/models/ProjectManagerRoleMigration.ts` for protected receipts/before-values where required
- `backend/tests/project-manager-role-migration.test.ts` and `backend/tests/project-manager-role-migration.replica-set.test.ts`

CLI behavior defaults to dry run. It requires an explicit target identifier and accepts secrets through established environment configuration without printing them. Reports contain stable IDs, counts and reason codes, not contact details, invitation tokens or credential values. Native inventory reads must not call model initialization, index synchronization, seed scripts or writes.

Manifest fields include schema/application compatibility version, target identity, inventory timestamp, immutable digest, expected user/session/project/task versions and before-values, exact proposed changes, reviewed owner mappings, conflicts and protected-history fingerprints. A run ID and backup reference are mandatory for apply. Before apply, recompute a fresh inventory and reject missing, stale, mismatched, truncated or unresolved manifests. Reports can be bounded; apply validation must evaluate the complete inventory.

Same-owner and one-sided assignments use the existing user ID. Different owners, duplicate current tasks, invalid/inactive assigned users, unsupported role/source states and incompatible current frozen reviewers block the affected migration cohort. Usable pending legacy-role invitations block cutover until explicitly resolved through the established workflow. Do not implicitly revoke/resend or rewrite an immutable invitation role. A conversion unit contains a user and all assignments dependent on that conversion, so a conflict cannot leave the user's other projects partially migrated.

Apply uses replica-set transactions, CAS, authorization/assignment fences, deterministic idempotent receipts and per-change audit. Preflight the whole manifest before changes. Use bounded atomic cohorts rather than an unbounded database-wide transaction; any interrupted run is explicit and resumable, and cutover is blocked until the full manifest reconciles. A retry verifies prior receipts and expected post-state before skipping an already-applied cohort. No silent partial success or automatic conflict winner.

Keep immutable approvals, issued revisions, reviewer identities, quality signatures, completion decisions, events and deadlines byte-equivalent. Rollback validates the exact receipt, matching application compatibility, expected post-values and later activity. Restore only authorized mutable fields; increment session versions again and preserve both apply and rollback audit history. Refuse rollback over subsequent business activity. A backup reference is not a substitute for a verified backup and rehearsal before a real run.

## Dependency-ordered execution tasks

R0–R9 local work is complete. Migration rehearsal, web/mobile integration, review fixes and focused regressions have passed. Full-suite limitations and reruns are recorded below. Baseline snapshots and logs are retained under `/tmp/lisno-pm-role-merge/`. Live cutover remains a separate, target-specific action.

### R0. Capture the integrated baseline and contract map

Owner: primary. Dependencies: revised plan approval and applicable execution choice. Paths: this plan, approved spec as read-only source, temporary evidence outside the worktree.

Capture dirty targets and relevant before-diffs, inspect exact current role/assignment consumers, and pin current-task semantics against preparation, active, completed and superseded fixtures. Inventory backend, web, mobile, event recipients, authentication/session caches, administration and development-only accounts. Reuse the prior read-only role audit; investigate only uncovered boundaries. Define exact shared types/error codes and map every active role writer. Keep original PM behavior as a regression baseline.

Verification: source map and asymmetric fixture table cover RC1–RC7. Stop dependent implementation on an unresolved authority/source ambiguity; do not invent a fallback.

### R1. Canonical identity, role options and session protection

Owner: primary/backend identity owner, one writer. Dependencies: R0. Owned backend areas: `domain/roles.ts`, `domain/authorization.ts`, `domain/user-invitations.ts`, `services/auth.service.ts`, `services/user-administration.service.ts`, `services/user-invitation.service.ts`, `routes/admin-users.ts`, related invitation routes, `repositories/types.ts`, `repositories/memory.ts`, `repositories/mongo.ts`, and narrow tests. The primary retains final ownership of canonical route-operation/OpenAPI registries and shared API contracts.

Separate historical role validation from active account choices, retire new legacy-role creation/acceptance, publish canonical labels/options, and preserve active Super Admin invariants. Fix responsibility counts in both repository implementations, including scalar and workflow assignments. Preserve current role/session validation and monotonic session versions. Ensure any development/demo mapping remains loopback-only and does not alter real accounts automatically.

Verification: role/user-administration/invitation/auth contract tests, memory/Mongo parity, immutable invitation-role rejection with no email/token side effects, stale-token denial and blocked ordinary role changes with responsibilities. RC1, RC3, RC4, RC5.

### R2. Single assignment and workflow activation

Owner: primary/backend assignment owner, sequential after R1 to avoid repository overlap. Dependencies: R1. Paths: new assignment domain/adapter above; `services/procurement-project-identity.service.ts`, `services/project-workflow.service.ts`, relevant task-domain helpers and source projections; `services/procurement-basket-approvers.service.ts`; exact assignment routes/tests. Repository hooks go through the same R1 owner.

Implement pure classification plus session-aware resolution, synchronize both existing mutation paths, and bind preparation/activation to the scalar while preserving payment/source gates. Fence current ownership against award, completion and concurrent reassignment. Preserve immutable task roles and completed history; invalid legacy task-role shapes are conflicts, not ordinary role edits. Expose explicit reconciliation state to authorized assignment administration.

Verification: same owner, scalar-only, task-only, unassigned, conflicting owners, duplicate tasks, superseded history, preparation-to-execution, completed tasks, missing/inactive owner, invalid source and simultaneous assignments. Current frozen reviewer mismatch must still block approval. Use transactional tests and asymmetric projects. RC2, RC3, RC5.

### R3. Apply consolidated scope across operational consumers

Owner: same primary/backend owner to keep shared writes sequential. Dependencies: R2. Paths: `services/vendor-execution-access.ts`, `services/project-manager/*`, Site/completion services, procurement award/reviewer consumers, project/status readers, `domain/project-chat-membership.ts`, chat Mongo/memory source adapters, relevant repository queries, live notifications/streams and KPI adapters. Shared authorization/OpenAPI registries remain primary-owned.

Route current ownership decisions through the shared contract. Convert PM service guards to canonical Site Manager identity, retaining all eight workflows and counterpart responsibilities. Preserve existing Site verification and completion authority and original progress/financial source rules. Reconcile chat automatic membership and candidate queries without allowing manual membership to bypass ownership. Revalidate evidence and live delivery after revocation; clear stale subscriptions/caches. Keep existing operational KPI policy accessible and new bonus/composite-policy absence truthful.

Verification: current/other/reassigned/inactive identities across portfolio/detail/actions/evidence/chat/streams, concurrent revocation, invoice/payment denial, Client/Designer separation, frozen reviewer signatures and completion/snags fences. Required routes, frontend contract snapshot and OpenAPI inventory stay synchronized. RC1–RC5; AC4–AC10, AC12.

### R4. Dry-run, apply and rollback tooling

Owner in Mode A: backend migration implementer. Dependencies: R1–R3 contract complete. Exclusive files: the new migration modules/model/tests listed above; no shared service, registry or repository edits. Changes to settled contracts return to primary.

Implement full inventory, manifest validation, reviewed owner mappings, pending-invitation conflicts, atomic conversion cohorts, receipt-based resumption, protected before-values, audit and rollback. Test with disposable replicas only. Do not inspect or apply against a configured real database by default. Provide a runnable usage/runbook section in this plan after verification, with exact flags and no credentials.

Verification: prove zero writes/DDL during dry run; every assignment/conflict class; immutable-history byte comparison; repeat apply; stale manifest; added invitation after inventory; concurrent role/task/source changes; failure injection and transaction rollback; interrupted multi-cohort resume; unknown run/target/backup rejection; rollback over later activity; sessionVersion monotonicity. RC1, RC2, RC4–RC6.

### R5. Consolidated web workspace and administration

Owner in Mode A: frontend implementer. Dependencies: R1–R3 backend contract frozen. Exclusive subsystem: `frontend/`, including `api/authorization-contract.ts` and tests, `app/router.tsx`, `routeRegistry.ts`, `routePaths.ts`, navigation/account labels, admin role/invitation/assignment controls, PM and existing Site/execution screens, notifications/caches and associated tests. No backend/mobile or documentation edits.

Expose one active Project Manager option. Send canonical users to `/execution`, preserve `/home` and project/assignment deep links without redirect loops, and retain the four requested sidebar destinations. Connect Site verification, handover and work-order approval actions within the existing compact project detail/full-detail experience. Update PM role conditionals and notification targets. Keep compatible API field names. Show administrator reconciliation feedback without leaking project details to unrelated identities. Preserve PM theme/density and original loading/stale/permission states.

Verification: former Site cohort and migrated PM cohort get identical navigation and own-project behavior; retired-role options absent; old links work; site verification/completion remain reachable; roles outside consolidation unchanged; no stale protected data after auth/assignment changes. Component/route/contract tests and rendered keyboard/mobile checks. RC1–RC4, RC7; AC1–AC3, AC11–AC12.

### R6. Native mobile contract compatibility

Owner in Mode A: separate mobile implementer. Dependencies: R1–R3 frozen contracts. Exclusive subsystem: `mobile/src/contracts/authorization.ts`, role labels, `navigation/registry.ts`, session handling, admin role/invitation/assignment UI, relevant existing operational destination gates and tests; `mobile/scripts/contract-drift.test.ts` only as necessary. No frontend/backend edits or native project regeneration.

Use canonical identity/options and an existing functional operational landing destination; preserve verification, completion and work-order routes. Remove the duplicate active role choice while keeping historical response parsing compatible. Invalidate old sessions and cached user/project state. No new native eight-tab design is required.

Verification: contract drift, registry/landing, session refresh/revocation and administration parity tests; mobile typecheck, existing suite and Android export. Render focused changed native controls when a working test/device harness is available; record any runtime gap. RC1, RC3, RC4, RC7.

### R7. Integrate and rehearse complete journeys

Owner: primary. Dependencies: R4–R6 complete; no concurrent writers. Reconcile shared contracts and role references. Run synthetic migration before/after journeys: old Site user retained, old PM user converted, same assignment preserved, one-sided assignment filled, conflicting project blocked, stale token rejected and new sign-in allowed. Exercise PM dashboard -> project -> Site verification -> handover, eight tabs, notifications and work-order review. Verify recorded old signatures unchanged and a replacement manager cannot inherit them.

Perform dry run -> apply -> retry -> rollback on isolated fixtures; compare all protected source/history fingerprints and post-rollback session behavior. Confirm existing PM actions still function with canonical actors and counterpart roles. Inspect final browser render at 360, 390, 768, 1280 and 1440px with long names and both identity cohorts. RC1–RC7 and retained AC1–AC12.

### R8. Independent integrity review

Mode A owner: `integrity_reviewer`, read-only, after all writers and R7. Mode B owner: primary sequentially. Review identity/role parsing, one-owner authority, assignment races, scope/candidate queries, frozen reviewers, lifecycle activation, invitation cutover, session invalidation, live/evidence revocation, financial/history invariants, migration atomic cohorts, dry-run purity, idempotency and rollback. Primary resolves concrete findings and reruns affected checks. RC1–RC7.

### R9. Final verification and handoff

Mode A owner: `verification_runner` after review fixes; Mode B owner: primary. No concurrent product writers. Run the matrix below, inspect diff/hygiene and report exact outcomes, baseline failures and unrun checks. Primary reconciles evidence, updates this plan's task status and gives an accurate handoff. Local implementation and migration tooling may be verified while live migration is explicitly pending; do not call real assignments migrated. RC1–RC7 and AC1–AC12.

## Ownership and safe parallel schedule

| Stage | Permitted parallel work in Mode A | Boundary |
| --- | --- | --- |
| R0 | Independent read-only uncovered audits if useful | Primary settles shared contracts and inventory semantics. |
| R1–R3 | One backend writer; independent read-only client/migration analysis | Shared roles, repositories, workflow and authorization changes are sequential. |
| R4–R6 | Migration, web and mobile implementers in three separate subsystems | Backend contracts already frozen; primary integrates requested shared changes. |
| R7 | Sequential integration and isolated rehearsal | All feature writers finished. |
| R8 | Read-only integrity review | Fixes reconciled by primary. |
| R9 | Final verification only | No product edits during final runs. |

At most three child agents plus the primary run concurrently. Each assignment must list exact files, acceptance criteria and tests, explicitly state that the agent is not alone, and forbid reverting others' edits. In Mode B all implementation/review/verification stays in the primary thread; the same dependency order applies.

## Verification matrix and commands

Fixtures must include two unequal projects, former Site and former PM users, inactive/retired/reassigned identities, different frozen reviewers, duplicate display names, preparation and completed tasks, open/expired/revoked invitations, plus independent Client, Designer, Procurement, Finance, Vendor and Super Admin actors. Use immutable source amounts/versions that differ across projects so accidental joins or rewritten history cannot pass.

| Criteria | Evidence |
| --- | --- |
| RC1 | Roles, invitations, user administration and API/web/mobile contract tests; stable user IDs and exactly one active role choice. |
| RC2 | Pure assignment classification plus Mongo CAS/race tests; memory/Mongo scope parity; both mutation paths and activation. |
| RC3 | Asymmetric permission matrix and real service routes; own-site verification/handover allowed, Client/Designer/Finance actions denied. |
| RC4 | Old tokens, logout/relogin, same-role reassignment, in-flight request, live stream, evidence and cache revocation tests. |
| RC5 | Before/after immutable snapshot equality, unchanged reviewer IDs, source/deadline/financial values; frozen-reviewer mismatch rejection. |
| RC6 | Read-only inventory observation, all conflict classes, manifest digest/version validation, idempotent apply, failure injection, resume and guarded rollback. |
| RC7 | Both identity cohorts, old URLs, exact four sidebar entries/eight tabs, operational controls, native landing/admin compatibility and rendered width/focus checks. |
| AC1–AC12 | Retain and rerun existing PM feature/lineage/action/counterpart tests and relevant rendered states; no new fake KPI/bonus/payment values. |

Focused backend commands, supplemented with the new implemented test filenames:

```sh
cd backend
npm test -- tests/roles.test.ts tests/auth-authorization.test.ts tests/user-invitations.test.ts tests/user-invitations-mongo.replica-set.test.ts --maxWorkers=2
npm test -- tests/procurement-project-identity.replica-set.test.ts tests/project-workflow-mongo.replica-set.test.ts tests/procurement-basket-approvers.replica-set.test.ts --maxWorkers=2
npm test -- tests/project-manager-role-migration.test.ts tests/project-manager-role-migration.replica-set.test.ts --maxWorkers=2
npm test -- tests/project-chat-membership.test.ts tests/project-chat-membership-mutations.replica-set.test.ts tests/vendor-execution.replica-set.test.ts tests/site-completion-progress.test.ts tests/kpi.test.ts --maxWorkers=2
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
```

Also run all existing `project-manager-*` test files and affected completion/chat stream/evidence/user-administration suites. Test names above that are proposed must be implemented before those commands are claimed as passing.

```sh
cd frontend
npm test -- src/features/project-manager src/features/admin src/components/layout src/app/router.test.tsx src/app/routePaths.test.ts src/api/authorization-contract.test.ts
```

Final backend/frontend lanes: `npm run typecheck`, `npm test` (use `-- --maxWorkers=2` for backend replica stability), and `npm run build` in each workspace. Baseline failures must be reconciled against the prior evidence; do not update expected outputs merely to bless a regression, and do not silently fix unrelated Config/Knowledge defects. Report remaining failures precisely.

```sh
cd mobile
npm run typecheck
npm run test:contracts
npm test -- --runInBand
npm run export:android
```

Use existing local dependencies. Do not run native prebuild or change lockfiles merely for verification. OCR is unchanged and requires no suite. No lint script exists. Repository hygiene: `git diff --check` and `git status --short`. Keep screenshots, logs, manifests and test databases outside tracked product sources; protect migration receipts and never publish private before-images.

## Live cutover and rollback gate

Local implementation includes runnable, tested tools and a concrete runbook. Live execution remains pending until a named database/environment and exact action are authorized. Before requesting that final authorization, prepare a read-only inventory for the named target, complete conflict resolution, validated backup/rollback evidence, application/client compatibility version, maintenance/write-fencing procedure, full manifest digest and a final fresh dry run. This plan does not request that authorization now.

A real cutover cannot admit obsolete application writers that recreate legacy roles or split assignments. Pause incompatible writers using the approved deployment/maintenance mechanism, apply only the reviewed manifest, verify receipts and reconciliation, then resume only compatible application versions. Pending legacy invitations and unresolved projects block cutover. No automatic migration on server startup.

On failure, abort the transaction/cohort, keep the cutover incomplete and use receipt-aware resume or reviewed rollback. Rollback requires matching code compatibility and must refuse intervening business activity; session versions increase again. No financial/approval history is deleted. Provide exact commands only after the implementation and target-specific rehearsal establish their syntax and result.

## Verified migration tooling and operator runbook

The dedicated CLI is built by `cd backend && npm run build`. It reads the connection string from `MONGODB_URI`; never put credentials in the command line or report. No live target has been selected or inspected during implementation.

Dry run is the default and performs native database reads only:

```sh
node dist/migrations/project-manager-role-migration.js --database <database> --target <target-id> --manifest <manifest.json>
```

Optional reviewed owner resolutions use `--resolutions <resolutions.json>` with entries `{ "projectId": "...", "ownerId": "...", "reviewedById": "...", "reason": "..." }`. The reviewer must be the sole active Super Admin. Unsupported assignments, current frozen reviewers, pending legacy invitations and invalid source/version states remain blocking conflicts. The manifest includes safe role/session/assignment versions and complete fingerprints; it excludes credentials, contact details and invitation tokens. Manifest permissions are `0600`.

After explicit authorization for the named target, a verified backup, a rehearsal and a final fresh dry run, apply the exact reviewed manifest:

```sh
node dist/migrations/project-manager-role-migration.js --mode apply --database <database> --target <target-id> --manifest <manifest.json> --run-id <run-id> --backup-ref <verified-backup-reference> --actor-id <sole-super-admin-id>
```

Resume uses the identical command, run identity and original manifest. Keep application/background writers quiescent throughout the maintenance window. Apply validates all business-document fingerprints again, serializes compatible writers through authorization/project fences, and commits connected identity/assignment cohorts atomically. Cohorts above 200 changed records and manifests above 8 MB fail closed; they need a reviewed operational approach rather than truncation. No automatic server-startup migration exists.

Rollback uses the same original manifest, target, run, actor and backup reference:

```sh
node dist/migrations/project-manager-role-rollback.js --mode rollback --database <database> --target <target-id> --manifest <manifest.json> --run-id <run-id> --backup-ref <same-backup-reference> --actor-id <same-super-admin-id>
```

Rollback refuses subsequent business activity, keeps immutable approvals/history and both audit trails, and increments session versions again. A stored backup reference is an operator attestation, not proof that a backup exists; verify restore capability independently before live execution. Both apply and rollback were rehearsed only against disposable replica-set fixtures.

## Current implementation status

- Revised specification and plan approved; Mode A selected. No further local implementation approval is pending.
- R0–R3: canonical identity, invitation retirement, shared assignment writes, current-owner authorization, chat/evidence revocation and retained operational workflows implemented. Identity lane: 290 passing across eight suites. Integrated PM/status/chat/contract lane: 354 passing across 22 suites. Final inactive-owner recovery replica lane: 14 passing.
- R4: migration inventory/apply/resume/rollback tooling implemented, with 42 passing pure/replica tests. Only disposable replica-set databases were used; the operator runbook above records exact commands and limits.
- R5: web navigation, all eight tabs, preserved deep links, Site verification/handover/work-order controls, retired-role rejection and cache invalidation implemented. Focused lane: 557 passing across 18 files; session lane: 49 passing; reciprocal cache lane: 30 passing; final evidence/reopened-quality-draft and Site detail lane: 18 passing. Chrome matrix covers the dashboard and eight tabs at 360, 390, 768, 1280 and 1440px. Both identity cohorts, legacy links, dialogs, keyboard focus, empty/error/denied/stale states and retained operations passed synthetic browser checks. The mobile Project actions menu was corrected and rechecked at 360/390/768/1440px. See `/tmp/lisno-pm-role-merge/visual/README.md` for evidence and limits.
- R6: mobile compatibility implemented. Full suite passed 1,873 tests across 192 suites before final label refinements; final rendered checks passed 48 tests, and final typecheck, contract checks and Android export passed. No attached device/emulator was available, so on-device visual/touch QA is unrun. See `/tmp/lisno-pm-role-merge/mobile-verification.md`.
- R7–R8: isolated migration rehearsal and integration completed. Independent review found no remaining blocking finding after inactive-owner reassignment recovery, repeated/cumulative evidence uploads and saved-quality-evidence limits were fixed with focused regressions.
- R9: final backend/frontend typechecks and production builds pass. Final frontend typecheck also passes after the last test-fixture corrections. Backend full suite: 6,524 passed, 19 failed, 24 skipped across 325 files. Exact-name comparison identifies 13 Config/Knowledge assertion failures reproduced on HEAD. Five additional socket failures and one authentication assertion occurred only in the full run; all affected suites passed focused reruns (116 tests: 19 vendor routes plus 97 authentication/project-journey tests). No deterministic cause was established for the one full-run-only authentication assertion; it is not labeled a baseline failure.
- Frontend full suite: 5,597 passed and 100 failed across 370 files. All 97 HEAD baseline failure names matched. Two additional stale role/route fixture cases were corrected and passed, and one test observed during the final quality-evidence edit passed in the stable 18-test rerun. The broader corrected fixture lane passed 71 tests with only its three known baseline failures remaining. Neither full suite is represented as clean.
- Final repository hygiene passes `git diff --check`; generated browser artifacts were moved outside the worktree and task-owned QA sessions were stopped. Package manifests and lockfiles are unchanged. No lint script exists; OCR is unchanged and was not rerun. The existing frontend build warns about a roughly 3 MB main chunk; no new dependency was added.
- Exact commands, per-test reconciliation and verification limits: `/tmp/lisno-pm-role-merge/final-verification.md`. Visual evidence: `/tmp/lisno-pm-role-merge/visual/README.md`. Mobile evidence: `/tmp/lisno-pm-role-merge/mobile-verification.md`. The remaining full-suite failures and lack of physical-device QA are limits of this handoff, not silently waived checks.
- No live inventory, apply, rollback, external delivery, dependency change, deployment or commit has been performed.

---

## Historical original workspace plan

The following retained plan records the already implemented workspace, including its precise progress formula, action contracts and original verification design. Its **separate-role assumption, old status statements, ownership schedule and mobile exclusion are superseded by the revised plan above**. It is not an instruction to redo completed implementation or an additional approval gate. Other original workspace behavior remains governed by the approved specification.

# Project Manager workspace task plan

Date: 2026-10-27
Status: Specification and task plan approved. Mode A selected on 2026-10-27. P0/P1 backend foundation and operational workflows implemented; P2 frontend integration and P3 verification in progress.
Approved source: [Project Manager workspace specification](../specs/2026-10-27-project-manager-workspace-design.md).

The user approved the specification on 2026-10-27. Its original status line records its creation stage; this plan records the approval without changing the approved specification during the task-plan gate.

## Outcome and execution contract

Deliver the existing `program_manager` role's compact Project Manager workspace: Dashboard, Project messages, Leaderboard, My Bonus; eight project tabs; persisted, authorized operational actions; and responsive verification. Preserve the existing Site Manager, Design Manager, Procurement, Finance, Client and vendor responsibilities.

This plan includes backend implementation, receiving workflows for other responsible actors, frontend integration and verification. UI placeholders or demo alerts do not complete ordinary workflow tasks. The expressly approved policy-unavailable states for PM composite KPI and bonus are valid outcomes until those policies exist.

Execution is authorized in Mode A. Preserve all deployment, production, migration and repository hygiene boundaries.

### Execution evidence, 2026-10-27

- Initial dirty paths were only this plan and the approved specification; no existing product edits.
- Read-only source, authorization/storage and workflow-boundary audits completed before writers.
- Compatibility correction: the issued payment reviewer slot named `program_manager` means the assigned **Site Manager**. This workspace never inherits that authority. PM certification is unavailable unless a real issued reviewer identity authorizes the actual actor; preserve existing review and payment workflows.
- Use `approvedProcurementSnapshotFromRows` for client-approved execution weights; the released-post Procurement preparation snapshot is a separate source. Unknown executable scope remains unavailable rather than guessed.
- Room grouping uses frozen `roomId`; `sourceSectionId` identifies basket/trade, not room.
- Existing ledger entries are recorded costs, not payment receipts. The workspace shows payment unavailable and preserves Finance authority.
- Implemented typed PM API/services, event/audit receipts, parent-bound authenticated evidence, source-based progress, assignment-derived chat, and completion snag gates.
- Focused transactional tests cover requests/supply, immutable quality audits, multi-assignment hold rollback, certification role separation, Client correction with snags, PM reassignment and stream delivery, and evidence compensation.
- Frontend shell, all eight operational tabs, counterpart controls, policy-unavailable leaderboard/bonus, notifications and URL state are integrated. Independent backend pagination and OpenAPI follow-up is in progress.
- Browser QA uses only an isolated synthetic API harness; backend behavior is checked separately against disposable replica sets. No production or seed operations.

## Baseline and additional evidence

- At plan preparation, the only dirty path is the untracked approved specification. Preserve it. Recapture status and relevant target diffs before implementation; reconcile any intervening work before assigning writers.
- `VendorWorkAssignment` already has immutable `sourceSectionId`, `sourceLineItemKey`, estimate/review identifiers, order revision and scope type. Use these for rooms and line joins; `ExecutionWork` currently exposes room names but omits the section ID.
- `ProjectPurchaseOrderRevision` contains immutable quantities in milli-units, UOM, scope type and net/GST/total amounts. Never reconstruct historical issued quantities from current Configuration.
- `vendor-execution-projection.ts` supplies current-round progress, schedule, flags, allowed actions and review distinctions. Its portfolio totals are assignment counts, not a canonical whole-project progress percentage.
- `procurement.service.ts` exposes approved source lines with stable keys, section/room identifiers, included scope, quantity/UOM and approved amounts. Its procurement task progress is not execution progress.
- `project-completion.ts` models approved scope coverage and authorized exceptions. `site-completion.service.ts` and `project-completion.service.ts` own completion boundaries.
- `ai-estimator-knowledge-basket-quality.ts` resolves versioned Main Basket checklists and rejects corrupt pointers/digests. Reuse its source rules rather than copying the reference's 37 checks into a global seed.
- The existing purchase-order-request service is a Procurement-to-Super-Admin approval workflow. A PM's request for materials must not call that endpoint under a disguised role or grant the PM purchase-order authority.
- Issued basket milestones already retain reviewer slots. Their amounts/reviewers must be the certification source; `FinanceLedgerEntry` is the payment source.

## Settled contracts for implementation

### Routes, data contracts and capabilities

Frontend keeps `/execution` and `/projects/:projectId/execution` for this role. Project tabs use `tab=site|procurement|selections|supply|vendors|client|snagging|quality`; preserve `assignment` links. Add `/project-manager/leaderboard` and `/project-manager/bonus`. Use existing project messages routes. Keep dashboard return search/filter/page state.

Use `backend/src/contracts/project-manager.ts` and a matching `frontend/src/features/project-manager/projectManagerTypes.ts` for the agreed DTOs. The primary thread owns both initially and reconciles later changes. Include typed availability (`available`, `not_configured`, `no_data`, `source_unavailable`), calculated-at time, source identity, version and allowed actions. Use explicit discriminated command types rather than accepting arbitrary property updates.

Proposed API surface, under the existing API prefix:

| Endpoint family | Purpose and boundary |
| --- | --- |
| `GET /project-manager/projects` | Scoped project cards, summary counts and bounded alert preview. Search/status/health/page filters. |
| `GET /project-manager/alerts` | Paginated alerts with stable tab/entity targets and matching scope filters. |
| `GET /projects/:projectId/pm/overview` | Authorized header, source coverage, project capabilities and full-detail links. |
| `GET /projects/:projectId/pm/:tab` | Eight explicit registered read handlers, not an unrestricted dynamic route. Independent pagination where applicable. |
| `POST /projects/:projectId/pm/procurement-requests` and `.../:requestId/actions` | Create a material/work request; responsible Procurement recipient acknowledges, fulfills through linked existing procurement work, or rejects with reason. |
| `POST /projects/:projectId/pm/selection-requests` and `.../:requestId/actions` | Request, acknowledgement, reminder and escalation; underlying Designer/Client approvals remain separate. |
| `POST /projects/:projectId/pm/supply-milestones/:milestoneId/actions` | Own-reviewer sign-off and reminder on a versioned source milestone. |
| `POST /projects/:projectId/pm/vendor-notices` and `.../:noticeId/actions` | Reasoned notices, explicit work holds and resolution history. |
| `POST /projects/:projectId/pm/certifications` and `.../:certificationId/actions` | Request and reviewer decisions for an existing issued payment milestone; never payment execution. |
| `POST /projects/:projectId/pm/escalations` and `.../:escalationId/actions` | Client escalation creation, follow-up, escalation and resolution. |
| `POST /projects/:projectId/pm/snags`, `.../:snagId/actions`, and `.../snag-visits` | Snag lifecycle and actual visit records. |
| `PUT /projects/:projectId/pm/quality-audits/:auditId` and `POST .../:auditId/sign` | Versioned draft answers and immutable weekly signatures. |
| `GET /project-manager/performance`, `/leaderboard`, `/bonus` | Own performance evidence, minimal authorized staff ranking and self-only bonus availability/statements. |
| Project-scoped PM evidence upload/read routes | Opaque authenticated attachments, explicit parent-record scope, validation and cleanup. |

Use focused permission codes for PM workspace reads, each operational command family, performance/leaderboard/self-bonus, plus existing chat capabilities. Receiver/reviewer permissions must be distinct from PM rights. Register each route's actual scope and operation class, including bounded Super Admin behavior. API paths containing `pm` do not grant authority by themselves; services validate actor, assignment and source entity on every operation.

### Progress, counts and risk

Implement one pure backend aggregation shared by cards and Site. Call it `approved_execution_scope_v1`, return its basis and coverage, and explain the basis in a small user-facing disclosure.

1. Resolve the current approved estimate/review source and its explicitly executable lines (`execution` or `supply_and_execution` through the established scope resolver). Do not infer execution scope from a trade name. Honor recorded `not_applicable` and `externally_fulfilled` exceptions from the existing completion authority.
2. Join only current, non-cancelled issued assignments by project, approved source key, order revision, section ID and execution scope. Supply-only allocations do not contribute execution progress. Reject duplicate/overlapping execution allocation or incompatible UOM/quantity conversion; preserve the source issue instead of silently clamping excess coverage.
3. Within source line `l`, normalize valid assignment quantities to its approved UOM. For required quantity `Q_l`, line progress is `p_l = sum(q_i * progress_i) / Q_l`. Definitively unissued required quantity contributes zero. An explicit persisted not-started state contributes zero. Missing/corrupt current progress is unknown, not zero. Authorized externally fulfilled scope is separately attributed; not-applicable scope is excluded.
4. Across executable lines, use frozen approved line amounts excluding GST as weights: `actual = sum(approvedNetPaise_l * p_l) / sum(approvedNetPaise_l)`. Do not use mutable vendor prices, margin, spend, or current Configuration rates as weights. Zero-value scope remains visible in coverage/blockers but contributes no monetary weight; if every eligible weight is zero, percentage is unavailable. Missing required weight/progress/source makes the overall percentage unavailable, with available rows still displayed. Round once for display, retaining precise intermediates and checked integer arithmetic.
5. Planned progress uses the same quantity and value basis. Each allocation requires a confirmed calendar-date schedule: `planned_i = 100 * clamp((todayOrdinal - startOrdinal) / (finishOrdinal - startOrdinal + 1), 0, 1)` in the project timezone. This is expected progress at the start of the current local day, reaching 100% the day after the inclusive finish date. If any required executable quantity lacks a confirmed schedule, planned overall progress is unavailable. Do not label calendar-day calculations as working days.
6. Return source revision, quantity/order coverage, value-weight coverage, missing reasons and zero-value counts. Reported progress, site-verified counts and client-accepted counts remain separate. A project at 100% reported progress can still have pending acceptance or uncovered zero-value scope.

This weighting is a progress presentation rule, not a new financial or compensation formula. It avoids the reference's unweighted average of room percentages and prevents PO price changes alone from changing progress. The approved source value is stable; Configuration refresh still applies to current editable operational labels/rules without rewriting historical financial weights.

Health precedence on non-completed assigned projects:

- **Critical:** current unfinished execution past its confirmed/original deadline, overdue verification, a missed required supply milestone, an explicitly critical unresolved snag, or required critical supply already blocking its scheduled work.
- **At risk:** other current blockers, overdue selections/requests, due-soon actionable work within the existing two-calendar-day risk window, missing reports, an on-hold project, or actual progress below a valid planned baseline. Historical resolved flags alone do not create current risk.
- **Incomplete:** required source/health inputs are missing or invalid, or work has started without a reliable schedule, unless an observed risk above already establishes severity. Show the issue explicitly. A reliably identified, not-yet-started setup workflow may legitimately lack its first confirmed schedule and is handled by Setup below.
- **Setup:** reliable current scope exists, work has not started, no observed risk applies, and setup/assignment/schedule is pending. This intentional setup state is distinct from corrupt or ambiguous source data.
- **On track:** sufficient current evidence exists, no preceding condition applies, and required work has started or is awaiting normal verification/acceptance within its deadline.

Active Projects counts every non-completed assigned project, including setup/on-hold/incomplete. At Risk includes Critical. Setup, On Track and Incomplete are the other disjoint current health buckets. Expose Critical as a severity count/detail, not a fifth oversized summary tile. Counts apply the search and lifecycle filter before health filtering and pagination; every metric explains its denominator. Alerts follow the same search/lifecycle scope, with a separate health filter when selected. Stable order: severity, earliest due date, project ID, alert ID.

Procurement displays source-backed task/request/order/receipt status. Do not introduce a second guessed “procurement percentage”; reuse a valid canonical project procurement-progress value with its basis, otherwise show counts and unavailable status.

### Durable workflow records and transitions

Use bounded per-entity state plus append-only events, not one expanding project document. Proposed new model families are `ProjectManagerRequest` (typed procurement/selection requests), `ProjectSupplyMilestone`, `ProjectVendorNotice`, `ProjectPaymentCertification`, `ProjectClientEscalation`, `ProjectSnag`/`ProjectSnagVisit`, and `ProjectQualityAudit`. Reuse a compatible existing record instead when inspection proves one authoritative source already exists; never duplicate its state.

All records retain project ID, stable source references/revision, current version, actor IDs and timestamps. Event/command receipts enforce actor-scoped idempotency with a payload digest. Unique active keys prevent duplicate open requests for the same requirement. Use unique project/package/week/checklist revision identity for weekly audit rounds, and a new correction revision after signing. History pagination must be bounded.

- Procurement request: `open -> acknowledged -> fulfilled` or `rejected`; fulfillment references a valid existing procurement request/order/delivery. PM cannot assert procurement fulfillment. Unassigned/ambiguous receiving owners produce an actionable ownership issue.
- Selection request: `open -> acknowledged` records PM awareness, with separate reminders/escalations. Decision status derives from the existing Designer/Client requirement. New source revisions require new acknowledgement. Ad-hoc operational requests must name a valid approved line and responsible actor; they cannot create an approval bypass.
- Supply milestone: upcoming/due/missed timing plus independent reviewer decisions. Completion requires all current required reviewer signatures. Assigned Designer gets a small counterpart control in their existing project workspace. Reopening creates a new round; old sign-offs remain history.
- Notice: `open -> resolved`, with immutable reason/evidence and resolution. Stop work records the notice and invokes existing hold transitions atomically for explicitly selected eligible assignments, with reason/review date; failure rolls back both.
- Certification: request by the existing eligible vendor/Procurement owner, then assigned reviewer certification/rejection. PM decision is limited to its configured slot. After required certification, Finance can see the same evidence in its current workflow. Partial/complete payments are derived from the exact order/milestone ledger entries; never relabel approval as Paid.
- Escalation: `open <-> pending -> resolved`, follow-up/owner changes and reasoned escalation events. Reopen is explicit. No estimate variation is applied by changing escalation status.
- Snag: `open -> in_progress -> resolved -> verified`; failed verification or recurrence reopens with a reason. PM verification stays separate from Site Manager and Client acceptance. Evidence must belong to this project/record. Visit records use real visit dates; no bonus deduction is calculated.
- Quality audit: draft answers `pass|fail|not_applicable`, required reasons and evidence, then immutable signature. All required questions must be answered. Failure findings are retained and can link to notices/snags; signing an audit does not certify that every answer passed.

New records use the established direct-Mongoose transaction boundary beside execution/procurement where appropriate. Pure domain rules remain storage-independent. Changes to any existing `AppRepository` contract must implement and test memory and Mongo adapters together. Do not force all PM storage into the mixed repository abstraction merely for uniformity.

### Policies and privacy

PM performance returns available factual measures and `policy_not_configured` for its composite until an approved PM policy exists. My Bonus returns `not_configured`, no amount and no fake statement history. Do not add policy editing, initialize a payout rate, or activate deductions during this feature.

Leaderboard exposes name, role, rank, period, published calculated score/policy basis and current-user marker only. Rank comparable cohorts with identical policy/period; show different role policies in labeled cohorts, not one invalid mixed numeric ranking. Unsupported/no-evidence users are unranked. Ties share rank, with user ID as deterministic presentation order. This resolves the reference's mixed-role ranking without pretending its fixed scores are comparable. Restrict publication to active internal staff and exclude client/vendor identities and private evaluations.

## Dependency-ordered tasks

Only one parent stage is in progress at a time. Children within a stage may run in parallel in Mode A only when the listed paths do not overlap. The primary thread owns shared files, source-of-truth decisions, integration and plan status. No writer may edit outside its assignment or revert another writer's work.

### P0. Baseline, shared contracts and source adapters

**T0: Reconcile the approved baseline.** Owner: primary. Dependencies: plan approval and execution mode. Capture dirty-path set and relevant per-target diffs. Record existing changes before any writer; use synthetic fixtures only. Confirm available local Mongo replica-set and browser QA harness without seeding. AC: all.

**T1: Freeze types, scope rules and aggregates.** Owner: primary; optional read-only audit agents only in approved Mode A. Paths: `backend/src/contracts/project-manager.ts`, `backend/src/domain/project-manager/*`, `backend/src/services/project-manager/access.ts`, `sources.ts`, `progress.ts`, and frontend PM types/API/query-key files. Implement and test the formulas, source-identity rules, health precedence, unavailable states and pagination contract above. Expose stable room/section IDs through PM DTOs without breaking existing execution consumers. AC2–AC4, AC10, AC12.

**T2: Shared integration foundation.** Owner: primary. Paths: backend `app.ts`, `domain/authorization.ts`, `domain/route-operations.ts`, `openapi.ts` plus new `openapi/project-manager.ts`; frontend `api/authorization-contract.ts`, auth/router/registry integration files; PM evidence storage and event/notification adapters. Add registered scoped operations, authorization coordination, idempotency/event helpers and attachment ownership checks. Keep namespaces distinct for receiver/reviewer actions. Existing notification events may be extended once here; feature writers consume that interface. AC1, AC5–AC10, AC12.

Exit P0 only when contracts, helper boundaries, route ownership and focused pure-domain/authorization tests are stable. If an existing source contradicts the plan materially, update the affected document and use the repository's change gate; do not invent a fallback.

### P1. Backend operational workflows

**T3: Requests and supply milestones.** Owner in Mode A: backend implementer A. Exclusive paths: `backend/src/services/project-manager/requests*`, `supply*`; matching request/supply models and domain modules; `backend/src/routes/project-manager-requests.ts`; focused tests. Dependencies: P0. Build PM procurement/selection requests, receiving-owner actions, acknowledgements, reminders and dual-reviewer milestones with current source/version checks. Reuse existing requirements and issued reviewer slots. Submit shared-file integration needs to primary. AC5, AC9, AC12.

**T4: Quality, vendor notices and certification.** Owner in Mode A: backend implementer B. Exclusive paths: `backend/src/services/project-manager/quality*`, `vendors*`, `certifications*`; matching models/domain modules; `backend/src/routes/project-manager-vendors.ts`; focused tests. Dependencies: P0. Resolve current/frozen quality sources correctly; persist audit drafts/signatures; implement notices/hold integration and milestone certification/ledger projection. Do not modify invoice assessment or ledger write authority. AC6, AC8, AC12.

**T5: Client escalations, snags and completion fence.** Owner in Mode A: backend implementer C. Exclusive paths: `backend/src/services/project-manager/client*`, `snags*`; matching models/domain modules; `backend/src/routes/project-manager-client.ts`; focused tests. Dependencies: P0. Implement escalation/snags/visits and activity availability. Provide a transaction-aware completion blocker reader. Primary owns writes to shared completion services and their domain/OpenAPI contracts after this deliverable. AC7, AC8, AC12.

T3–T5 may run concurrently with three writers. They share settled helper interfaces, not writable files. Their route registration and shared contract changes are integrated only by primary. Each writer must run focused domain/service and replica-set tests for its transaction behavior, then report exact results and limitations.

**T6: Aggregate reads and complete service integration.** Owner: primary, after T3–T5 finish. Paths: `backend/src/services/project-manager/portfolio.ts`, `project.ts`, `performance.ts`, `backend/src/routes/project-manager.ts`, shared completion/notification/event integration and source adapters. Build batched dashboard and eight-tab reads; no per-card HTTP requests or all-tabs eager reads. Add completion blockers within existing fenced transactions so a concurrent snag/hold cannot slip past handoff. Completed historical approvals remain immutable. Implement performance/leaderboard/bonus read contracts and absence states. Test asymmetric projects/actors and query-count bounds. AC2–AC4, AC6–AC8, AC10, AC12.

### P2. PM messages and presentation

**T7: Project chat membership.** Owner: primary, sequential shared-boundary change before UI delegation. Paths: `backend/src/domain/project-chat-membership.ts`, affected chat context/repository/stream/attachment authorization tests, notification recipient checks, shared permission contracts. Add only the current active assigned PM through `programManagerId`. Cover reassignment during reads, writes, uploads, streams and notifications. Do not grant participant management. Update caches/subscription invalidation for lost membership. AC9, AC12.

**T8: Frontend shell, dashboard, Site and full detail.** Owner in Mode A: frontend implementer A. Exclusive paths under `frontend/src/features/project-manager/`: `ProjectManagerDashboard*`, `ProjectManagerProjectPage*`, `ProjectManagerOverview*`, `ProjectManagerFullDetail*`, `ProjectManagerSite*`, `project-manager-shell.css`, `project-manager-dashboard.css`, `project-manager-site.css`, associated tests. Dependencies: P1 and T7, frozen API/types. Build compact header/cards, summary/filter/search/back state, eight-tab shell, alerts, room/trade presentation, and existing detail links. Default Site; honor old assignment URLs. Primary wires the central router/sidebar registry. AC1–AC4, AC11, AC12.

**T9: Procurement, Selections and Critical Supply UI.** Owner in Mode A: frontend implementer B. Exclusive PM `Procurement*`, `Selections*`, `Supply*` modules, `project-manager-supply.css` and associated tests; new isolated counterpart components under `frontend/src/features/project-manager/counterparts/requests*` and `supply*`. Dependencies: P1 and T7. Implement forms, status/history, source-conflict recovery and reviewer-specific actions. Provide ready-to-mount Procurement request inbox and Designer sign-off components. Primary integrates them into existing role screens. AC5, AC11, AC12.

**T10: Vendors, Client, Snagging and Quality UI.** Owner in Mode A: frontend implementer C. Exclusive PM `Vendors*`, `Client*`, `Snagging*`, `Quality*` modules, `project-manager-operations.css`, associated tests; new counterpart component modules for certification. Dependencies: P1 and T7. Build audit/notice/certification panels, escalation/draft-message entry points, snag register and weekly checklist drafts/signing/history. Show truthful permission, unavailable, empty, stale and delivery states. Attachments use approved storage helpers. AC6–AC8, AC11, AC12.

T8–T10 can run concurrently. They import fixed shared types/primitives and use disjoint styles. Primary owns shared `projectManagerApi.ts`, query keys/invalidation, and any common components; request additions through primary rather than editing them concurrently.

**T11: Performance, navigation and counterpart integration.** Owner: primary after T8–T10. Paths: `ProjectManagerLeaderboard*`, `ProjectManagerBonus*`, `ProjectManagerPerformance*`, their scoped CSS/tests; `app/router.tsx`, `routeRegistry.ts`, `routePaths.ts`, `components/layout/SidebarIcon.tsx`, and narrow receiving-screen mounts. Integrate all four sidebar destinations in order, existing account access, project chat drafts, Procurement request receiver, Designer milestone reviewer, eligible vendor/Procurement certificate requests and Finance evidence. Preserve existing action availability and labels for other roles. Add custom sidebar drawings without new Lucide artwork. AC1, AC5–AC10, AC11, AC12.

### P3. Integrated behavior, caches and regression repair

**T12: End-to-end workflow completion.** Owner: primary. Dependencies: all writers finished. Reconcile implementation against every acceptance criterion and reference action. Exercise request creation -> receiver review -> fulfillment; selection request -> acknowledgement -> owner decision; separate PM/Designer supply sign-offs; audit -> notice/snag -> resolution; certification -> Finance evidence without payment mutation. Verify unauthorized/empty/incomplete states are intentional and cannot stand in for missing implementation. AC5–AC10.

**T13: Data refresh and resilience.** Owner: primary. Check mutation invalidations across portfolio, alerts, active tab, detail, counterpart queues and notifications. Wire existing execution changes and PM operational change events into the same invalidation strategy with bounded polling fallback. Verify scope change clears data, old responses cannot repopulate revoked access, concurrent edits produce recoverable conflicts, and refresh failures disable consequential decisions. AC2–AC4, AC9, AC12.

**T14: Rendered UX pass.** Owner: primary. Inspect actual desktop and mobile rendering in the current theme, including every tab and counterpart panel. Adjust local spacing/type/controls only. Check small-screen tabs, long names, stale/empty/error/pending states, keyboard navigation and restored focus. Inspect images, do not rely only on DOM tests. AC1–AC3, AC11, AC12.

### P4. Integrity review

**T15: Independent integrated review.** Mode A owner: `integrity_reviewer`, read-only; Mode B owner: primary sequential review. Dependencies: P3 complete, no concurrent writers. Review final diff for authorization/reassignment, source lineage, memory/Mongo parity where applicable, CAS/idempotency, handoff races, paise/GST, payment separation, signed-history immutability, notifications, cache clearing and counterpart completeness. Primary resolves findings and reruns focused affected checks. AC1–AC12.

### P5. Final verification and handoff

**T16: Verify the integrated worktree.** Mode A owner: `verification_runner`, after review fixes and all writers finish; Mode B owner: primary. Run the matrix below, record commands/results and evidence paths. Any failed required check returns to a bounded fix followed by the affected checks, not a premature completion claim. AC1–AC12.

**T17: Reconcile and report.** Owner: primary. Inspect final diff/status, ensure only intended paths changed, and update this plan's task results. Report actual behavior, key files, exact checks, unrun checks, remaining risks, temporary QA artifacts, and unperformed external/migration actions. Do not stage/commit or deploy. Mark the implementation complete only when all applicable acceptance criteria are verified.

## Ownership and parallel schedule

| Parent stage | Safe parallel work in Mode A | Shared-write rule |
| --- | --- | --- |
| P0 | Independent read-only lineage/auth/UX questions if useful | Primary writes contracts, foundation and registry files. |
| P1 | T3 requests/supply; T4 vendors/quality/certification; T5 client/snags | Three disjoint backend slices. T6 integration runs after all finish. |
| P2 | T8 shell/dashboard/Site; T9 supply-related tabs; T10 operational tabs | Shared routing/API/query files remain primary-owned. T7 before and T11 after. |
| P3 | Sequential integration and browser checks | Primary owns final reconciliation. |
| P4 | One read-only integrity reviewer | Fixes only after findings are reconciled. |
| P5 | One final verification runner | No product writers during final verification. |

Each delegated task must state: concrete deliverable, exact owned paths, dependencies/contracts, invariants, tests, and that the agent is not alone in the codebase and must not revert others' edits. Newly discovered shared-contract changes return immediately to primary; writers must not introduce incompatible fallbacks.

## Verification matrix

Use at least PM A and PM B assigned to separate unequal projects, a reassigned/inactive PM, assigned/unassigned Designers, Procurement/Finance/Site Manager actors, two vendors, Client and Super Admin. Synthetic source fixtures must have different amounts, quantities, GST, schedules, revisions and room IDs, including identical display names on different IDs.

| Scope | Required cases | Checks / AC |
| --- | --- | --- |
| Pure domain | Weighted progress, unissued quantity, missing evidence, split execution allocation, supply-only exclusion, zero-value scope, mismatched UOM, superseded orders, planned date boundaries and risk precedence | New `backend/tests/project-manager-domain.test.ts`; AC2–AC4. |
| Scoped API | Wrong PM/project/entity, inactive/reassigned actor, receiver/reviewer access, counts before pagination, minimal leaderboard/self-bonus data | New `project-manager-routes.test.ts` plus canonical auth inventory tests; AC1–AC10. |
| Transactions | Concurrent duplicate requests/signatures, stale source/version, role change during action, atomic stop-work, certificate duplicate/revision changes, signed-audit immutability, snag versus handoff | New focused `project-manager-*.replica-set.test.ts`; existing execution/completion/procurement tests; AC5–AC9, AC12. |
| Finance/source | Two unequal projects and orders; approved baseline ex-GST weights; current labels versus frozen issued amounts; no certification-induced payment; partial ledger payment remains partial | Focused PM tests plus `project-finance.test.ts`, relevant finance replica-set tests; AC2, AC4, AC6, AC10. |
| Messages | Read/send/read-state/attachments/streams/mentions with PM assignment and revocation; no participant management; no stale private cache | Existing chat membership/route/attachment/reassignment tests plus PM cases; AC9, AC12. |
| Frontend workflow | Four navigation links, eight tabs, URL reload/back, filters/counts, room identity, all forms, receiving-role controls, pending/empty/error/stale/conflict states | `frontend/src/features/project-manager/**/*.test.tsx`, updated router/auth/counterpart tests; AC1–AC12. |
| Policies | No fake PM KPI/bonus, unavailable source, self-only bonus, hidden amount omitted from accessible DOM, cohort period/ties and no private fields | PM performance tests; AC10. |
| Visual/accessibility | 360, 390, 768, 1280, 1440px; keyboard tabs/dialogs; long labels; text zoom; no page overflow; readable semantic status; no oversized controls | Browser screenshots/interaction/accessibility evidence; AC11–AC12. |
| Performance | Batch portfolio reads, no request per card, active-tab lazy loading, bounded pages/history, one refresh strategy, no console/network/render errors | Request/query-count assertions plus browser network inspection; AC2–AC3, AC12. |

Focused command examples, using exact implemented test names when available:

```sh
cd backend
npm test -- tests/project-manager-domain.test.ts tests/project-manager-routes.test.ts
npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts
npm test -- tests/project-chat-membership.test.ts tests/project-chat-routes.test.ts tests/project-chat-attachments-routes.test.ts
npm test -- tests/vendor-execution.replica-set.test.ts tests/vendor-execution-integration.replica-set.test.ts tests/project-chat-membership-mutations.replica-set.test.ts
npm test -- tests/design-requirements.test.ts tests/design-requirements.replica-set.test.ts tests/procurement-basket-approvers.replica-set.test.ts tests/project-completion-configured.test.ts tests/site-completion-progress.test.ts
```

Run newly added transactional suites for requests, supply, quality/certification, snags/handoff and evidence as soon as their slices are stable. Use a local disposable replica-set test environment and stub all external delivery. Never weaken transaction requirements or seed user data to make tests pass.

Final integrated checks because authorization, routing and workflows are shared:

```sh
cd backend
npm run typecheck
npm test
npm run build
```

```sh
cd frontend
npm run typecheck
npm test
npm run build
```

Repository checks: `git diff --check` and `git status --short`. There is no lint script. No OCR/native-mobile suite is required unless an unexpected shared dependency actually changes those workspaces. Document environmental blockers and unrun checks accurately.

## Rollout, rollback and stop conditions

- Plan additive collections/indexes and role-specific presentation; existing project URLs and recorded approvals continue working. Do not initialize new operational records on read.
- New required indexes must have duplicate/conflict checks before any live rollout. No write migration/backfill is authorized by this plan. If one becomes necessary, prepare its dry run and rollback evidence and obtain the separate required authorization before execution.
- App rollback can restore the old PM presentation while retaining new event/audit records. Do not delete history, retroactively rewrite issued artifacts, or invent historical signatures.
- No new dependency is planned. Reuse React, TanStack Query, existing forms/storage/notifications and custom SVG icons. Justify and verify any dependency that becomes materially necessary.
- Keep temporary rendered QA artifacts under an ignored task-specific directory or `/tmp/lisno-project-manager-qa`; report actual paths and retain only review evidence needed for handoff.
- Missing compensation policy, portal telemetry, attendance or quality source produces the approved explicit state. Missing implementation of an ordinary request/sign-off/snags/certification workflow is a task failure, not an acceptable empty-state shortcut.
- A materially different authorization, financial, completion or source-of-truth requirement must be reconciled with the approved specification before implementation continues on that affected boundary.

Preparation verification: source inspection only; application tests/builds have not been run at this planning gate. No product code, dependency, database, external service or production data was modified.
