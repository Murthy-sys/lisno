# Staff Email Transfer to the Active `lisno-api` Database — Task Plan

## Approved source

- Specification: `docs/superpowers/specs/2026-08-27-staff-email-transfer-to-lisno-api-design.md`

## Parent outcome

Verify the single production target used by Render `lisno-api`, compare the approved source staff identities without exposing secrets or personal data, retain the target's sole Super Admin, and issue audited target invitations for approved absent Admin/Designer identities only after an exact production-write and email-delivery approval.

## Ownership boundaries

- **Primary integrator/operator**
  - Owns interpretation of the approved specification, sanitized environment fingerprints, the exact target and candidate count, approval gates, external side effects, and final reconciliation.
  - Never prints or persists connection strings, database usernames, password hashes, invitation tokens, names, or email addresses in chat, logs, screenshots, or repository artifacts.
- **Source identity auditor**
  - Read-only access to the explicitly identified source database.
  - May inspect only User fields required to select and validate the approved roles.
  - Must not write, export credentials, or inspect unrelated collections.
- **Target identity auditor**
  - Read-only access to the database proven to be Render `lisno-api`'s current `MONGODB_URI` target.
  - Owns the sole-Super-Admin, email-conflict, role-conflict, invitation-conflict, and index checks.
- **Live invitation executor**
  - The primary agent only, after a fresh exact live-action approval.
  - Uses the established target Super Admin invitation workflow; no direct User insert or cross-database row copy.
- **Verification runner**
  - Read-only after live execution; verifies target identity and audit invariants without changing source, target, deployment, mail, or repository state.

## Dependency-ordered task graph

### Task 1 — Freeze environment identity and operational scope

Owner: Primary integrator/operator.

Dependencies: approved specification.

Work:

1. Confirm that `lismo-api` means Render service `lisno-api`.
2. Resolve the exact source and target cluster/database using sanitized, non-reversible fingerprints.
3. Prove the target fingerprint matches the secret `MONGODB_URI` currently attached to Render `lisno-api`.
4. Confirm source and target are different environments.
5. Establish the selection mode:
   - an exact operator-provided email allowlist; or
   - every eligible active standard `admin` and `designer` in the source.
6. Confirm that source IDs, passwords, grants, and assignments are intentionally not preserved.

Acceptance criteria: AC 1–3 and 10.

Stop/report conditions:

- Service name or target cannot be proven.
- Source and target resolve to the same environment.
- A secret or personal-data-safe inspection path is unavailable.
- The user requires password, ID, grant, or assignment continuity.

### Task 2A — Audit source candidates

Owner: Source identity auditor.

Dependencies: Task 1 exact source and selection mode.

May run in parallel with Task 2B.

Work:

1. Read only selected source User records.
2. Validate exact role, active state, `standard` account kind, normalized email, required identity fields, and non-reserved/non-demo status.
3. Derive a non-reversible selection digest and sanitized role counts.
4. Classify the source Super Admin for comparison only; never mark it copyable.

Acceptance criteria: AC 3–7.

Stop/report conditions:

- Any selected row is reserved/demo, invalid, inactive, outside `admin`/`designer`, or changes during the audit.
- More than one source Super Admin exists.

### Task 2B — Audit target identity and invitation state

Owner: Target identity auditor.

Dependencies: Task 1 exact target.

May run in parallel with Task 2A.

Work:

1. Verify the target's User email and sole-Super-Admin indexes are present.
2. Verify exactly one target Super Admin row and exactly one active Super Admin.
3. Read normalized-email/role identity summaries and current actionable invitations needed for conflict analysis.
4. Derive a non-reversible target snapshot digest and sanitized counts.
5. Verify the invitation mailer is configured as enabled; do not create a test invitation or send an email.

Acceptance criteria: AC 1, 2, 6, 8, and 9.

Stop/report conditions:

- Target fingerprint changes or no longer matches Render.
- Target has zero or multiple Super Admin rows/active identities.
- Required unique indexes are absent.
- Invitation delivery is disabled.

### Task 3 — Reconcile dry-run classifications

Owner: Primary integrator/operator.

Dependencies: Tasks 2A and 2B.

Work:

1. Compare candidates by normalized email without outputting personal values.
2. Produce sanitized counts for:
   - target Super Admin matches;
   - eligible Admin invitations;
   - eligible Designer invitations;
   - already-existing same-role identities;
   - email/role/Super-Admin/reserved/invalid conflicts.
3. Require the target Super Admin to remain unchanged.
4. Block the entire proposed live batch if any conflict exists.
5. Re-read source and target and require both snapshot digests to remain unchanged before presenting the live batch.

Acceptance criteria: AC 3–8.

Verification:

- Dry run performs no database, repository, Render, invitation, audit, token, or email write.
- Source and target connection/session teardown is confirmed.

Stop/report conditions:

- Source and target Super Admin identities differ.
- Any target email/role conflict or source validation conflict exists.
- Candidate or target snapshot changes during reconciliation.

### Task 4 — Obtain exact live-action authority and recovery evidence

Owner: Primary integrator/operator.

Dependencies: conflict-free Task 3 dry run.

Work:

1. Present only sanitized eligible Admin/Designer counts, role breakdown, environment fingerprints, and selection digest.
2. Ask for one exact approval covering:
   - target production database;
   - candidate digest/count;
   - creation of pending invitations;
   - real invitation email delivery.
3. Capture a target backup or equivalent verified recovery evidence for the exact invitation/audit write surface.
4. Verify pending invitations can be revoked and delivery failures can be retried through existing operations.
5. Immediately before the first write, re-run the target fingerprint, sole-Super-Admin, conflict, and snapshot checks.

Acceptance criteria: AC 6, 8, 9, 11, and 12.

Stop/report conditions:

- Approval does not name the exact target and eligible count/digest.
- Recovery evidence is missing or unusable.
- SMTP/invitation service is unavailable.
- Any source or target snapshot changed after approval.

### Task 5 — Issue Admin and Designer invitations

Owner: Live invitation executor (primary agent only).

Dependencies: Task 4 exact live approval and final unchanged dry run.

Work:

1. Authenticate as the target's sole active Super Admin through the existing authorized workflow.
2. Create invitations only for the approved eligible `admin` and `designer` candidates.
3. Execute sequentially so each response, delivery state, and audit result can be verified before continuing.
4. Never issue a Super Admin invitation, direct User insert, role promotion, overwrite, seed, or password-hash copy.
5. If an invitation returns a conflict or unexpected failure:
   - stop the remaining batch;
   - retain already completed invitation/audit history;
   - do not silently retry or revoke successful invitations;
   - report the partial result and request direction.
6. Treat failed delivery as the established retryable invitation delivery state; do not create another User or token outside the service.

Acceptance criteria: AC 6, 8–12.

Side effects:

- Creates target invitation, token-hash, audit, and delivery-state records.
- Sends real staff invitation emails.
- Does not create a target User until a recipient accepts and chooses a password.

### Task 6 — Verify target outcome and handoff

Owner: Verification runner.

Dependencies: Task 5 complete or stopped with a reported partial result.

Work:

1. Verify exactly one unchanged target Super Admin row and active identity.
2. Verify no source or target existing User was overwritten, deleted, deactivated, or role-changed.
3. Verify the exact approved invitation count, roles, statuses, issuer identity, versions, and sanitized audit actions.
4. Verify no reserved/demo identity, Super Admin invitation, duplicate normalized email, duplicate actionable invitation, leaked token, or unapproved role was introduced.
5. Run the final read-only reconciliation:
   - every approved candidate is `already_exists` or has the expected actionable/sent invitation state;
   - zero candidates remain unexpectedly eligible;
   - zero conflicts are present.
6. Report acceptance as a later recipient-controlled step: new User creation and login can be verified only after each recipient accepts and chooses a password.
7. Confirm repository and deployment configuration still point to one target database and no source code, secret, deployment, account, or cluster was changed.

Acceptance criteria: all.

## Safe parallelism

- Tasks 2A and 2B may run in parallel because both are read-only and target different environments.
- Dry-run reconciliation waits for both audits.
- Environment confirmation, live approval, backup/recovery evidence, invitation creation, and final verification are sequential.
- Production invitation writes must not be delegated to multiple agents or executed concurrently.

## Acceptance-criteria traceability

| Acceptance criterion | Primary task(s) | Verification |
|---|---|---|
| AC 1 target is Render `lisno-api` database | 1, 2B, 4 | Sanitized fingerprint equality before dry run and write |
| AC 2 one runtime Mongo database | 1, 6 | Render/repository configuration inspection |
| AC 3 PII/secret-safe dry run | 2A, 2B, 3 | Output inspection and zero-write evidence |
| AC 4 only active standard Admin/Designer eligible | 2A, 3 | Role/state/account-kind validation |
| AC 5 demo/reserved identities rejected | 2A, 3, 6 | Reserved identity filter and final report |
| AC 6 target Super Admin unchanged and singular | 2B–6 | Pre/post User and index checks |
| AC 7 different source Super Admin blocks | 2A, 3 | Dry-run classification and zero-write proof |
| AC 8 target identities never overwritten | 2B–6 | Conflict matrix and pre/post target digest |
| AC 9 existing invitation flow only | 2B, 4, 5 | Authorized endpoint/service and audit evidence |
| AC 10 fresh password/new target identity | 1, 5, 6 | No User before acceptance; acceptance contract inspection |
| AC 11 transactionally audited | 5, 6 | Invitation/delivery/acceptance audit verification |
| AC 12 excluded external/destructive actions | 1–6 | Final repository/deployment/database hygiene report |

## External actions explicitly excluded until Task 4 approval

- No production invitation, token, audit, or email write.
- No source or target User mutation.
- No password-hash, stable-ID, grant, assignment, audit-history, or project-data transfer.
- No Super Admin replacement or mutation.
- No migration, seed, deletion, deployment, commit, push, secret rotation, account removal, cluster removal, or database cutover.
