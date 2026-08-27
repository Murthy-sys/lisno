# Staff Email Transfer to the Active `lisno-api` Database — Specification

## 1. Decision summary

### Requested outcome

Bring the relevant Super Admin, Admin, and Designer email identities from the other MongoDB environment into the single database used by the Render `lisno-api` service.

### Interpretation

- `lismo-api` is assumed to mean the repository's Render service named `lisno-api`.
- The target is the one Mongo database referenced by that service's secret `MONGODB_URI`, not a second application database.
- The source is the other MongoDB account/cluster/database identified by the operator during the dry run.

### Recommended approach

1. Verify sanitized source and target cluster/database fingerprints and prove that Render `lisno-api` points to the intended target.
2. Read and compare only approved active, standard identities with the exact roles `super_admin`, `admin`, or `designer`.
3. Keep the target's sole Super Admin unchanged. Treat a different source Super Admin email as a blocking report item, not a row to copy.
4. For absent Admin and Designer emails, use the target's existing staff-invitation flow. Each recipient chooses a fresh password and receives a new, audited target identity.
5. Require a separate explicit live-action approval immediately before creating production invitations and sending real emails.

This is recommended because copying only an email does not create a usable Lisno account, while raw User-row/password-hash copying risks unique-index, identity-lineage, authorization, and assignment conflicts.

## 2. Current-state evidence

### Runtime database source of truth

- The backend opens one default Mongoose connection from `MONGODB_URI`.
- Render defines one unsynchronized secret `MONGODB_URI` for `lisno-api`; the repository does not reveal its Atlas account, cluster, or database name.
- The frontend and OCR worker use the backend API and do not open separate Mongo connections.

### User identity contract

- A User requires a stable ID, name, raw and normalized email, bcrypt password hash, role, active state, account kind, version, and timestamps. Email alone is not login-capable.
- Normalized email is unique.
- A partial unique index permits at most one `super_admin` row, regardless of active state.
- The application treats the sole Super Admin as immutable and does not permit invitation or promotion into `super_admin`.
- Admin and Designer are supported by the existing invitation flow. Acceptance creates a standard active User with a recipient-chosen password and audit history.
- Invitation-created users receive new IDs and do not inherit source project assignments, grants, manager links, tasks, or audit lineage.
- Reserved/development-demo identities must never be transferred into production.

### Existing operational tooling

- No repository command currently transfers selected Users between two databases.
- Existing migrations establish the safety pattern: dry run first, conflict reporting, no write on conflict, idempotent execution, backup/rollback, and a final zero-change dry run.

## 3. Goal and measurable outcome

The active `lisno-api` target database contains one unchanged Super Admin and the approved Admin/Designer people can create usable target accounts through invitations, without duplicate emails, raw password transfer, identity overwrite, hidden assignment migration, or a second runtime database.

## 4. Scope

### Included

- Sanitized verification of source and target cluster/database identity.
- Read-only discovery of source Users with exact roles `super_admin`, `admin`, and `designer`.
- Selection of active `standard` accounts only, using an explicit email allowlist or an explicitly approved all-active selection.
- Exclusion of reserved/development-demo identities.
- Target comparison by normalized email and, for diagnostics only, stable ID.
- A dry-run report classifying each selected identity as:
  - `target_super_admin_matches`;
  - `eligible_for_invitation`;
  - `already_exists`;
  - `email_conflict`;
  - `role_conflict`;
  - `super_admin_conflict`;
  - `reserved_or_demo_rejected`;
  - `invalid_source_record`.
- Creation of target invitations for approved, absent Admin/Designer identities only after a separate live-action approval.
- Verification of invitation audit records and target identity uniqueness.

### Non-goals

- Do not add, replace, demote, deactivate, delete, or edit the target Super Admin.
- Do not copy password hashes, source User IDs, account sessions, grants, manager links, project assignments, workflow tasks, evaluations, or audit history.
- Do not preserve source login credentials.
- Do not seed, overwrite, merge, or delete target users.
- Do not migrate every staff role; `design_manager`, `design_head`, Estimator, Procurement, Finance, Site, Worker, and Client roles are excluded.
- Do not change schemas, indexes, authorization rules, or the single-database runtime architecture.
- Do not delete either MongoDB account/cluster as part of this work.

## 5. Workflow and states

1. Operator supplies the exact source environment and confirms the intended target environment without placing either URI in Git, chat, command output, or logs.
2. A read-only check derives sanitized cluster/database fingerprints and verifies that the target matches Render `lisno-api`.
3. The source selection is derived and checked for role, active state, standard account kind, valid normalized email, and reserved/demo exclusion.
4. The target is compared by normalized email:
   - matching target Super Admin: report satisfied;
   - different source/target Super Admin: stop with `super_admin_conflict`;
   - absent Admin/Designer: mark eligible;
   - existing same-role email: report already present;
   - existing different-role email: stop with conflict.
5. Dry-run output contains counts, roles, and non-reversible digests only. It must not print email addresses, names, password hashes, tokens, or connection strings.
6. The operator approves the exact eligible count/role breakdown and explicitly authorizes production invitation creation and real email delivery.
7. The active target Super Admin creates invitations through the established service. SMTP preflight must succeed before any invitation/token/audit write.
8. Each recipient accepts the invitation and chooses a new password. Source assignments are not implied or copied.
9. A final read-only check verifies normalized-email uniqueness, exactly one target Super Admin, expected invitation/audit state, and no unintended Users.

## 6. Data, API, and UX impacts

### Data

- No schema or index change.
- Before invitation acceptance: new pending invitation rows and their audit/delivery state only.
- After acceptance: new standard User rows with new target IDs plus acceptance audit records.
- Existing target Users remain byte-for-byte unchanged.

### API

- Reuse the existing Super Admin user-invitation endpoints and service contract.
- No new public API is required unless the approved task plan chooses a reusable read-only comparison command.

### UX

- Super Admin uses the existing invitation administration screen.
- Recipients use the existing invitation-acceptance screen to choose passwords.
- No UI promises inherited source assignments or access.

## 7. Authorization, security, and audit invariants

- Only the active target's sole Super Admin may create staff invitations.
- `super_admin` remains non-invitable and immutable.
- Connection strings, usernames, password hashes, invitation tokens, and personal email values are never logged or included in reports.
- Source access is read-only.
- The operation is fail-closed on any target mismatch, normalized-email conflict, role conflict, reserved/demo identity, malformed source row, disabled mailer, or SMTP preflight failure.
- Invitation creation and acceptance retain their established transactional and audit behavior.
- No live invitation/email action is authorized merely by approving this specification or its later task plan.

## 8. Compatibility, failure handling, and rollback

- Runtime compatibility is unchanged because the application continues using one target `MONGODB_URI`.
- Dry run performs no database or external-mail write.
- A failed invitation delivery follows the established safe delivery state and retry behavior; it does not justify raw User creation.
- Before the live action, capture a target backup or equivalent recovery evidence appropriate to the exact invitation write set.
- Pending invitations can be revoked through the existing workflow if issued incorrectly.
- Accepted invitations are not automatically deleted or rewritten; remediation requires a separately approved user-administration action.
- A final dry run must show no remaining eligible invitations for the approved selection and no conflict introduced by the operation.

## 9. Risks

- The phrase “copy emails” may hide a requirement to preserve passwords, stable IDs, or assignments. Those needs require a separate full identity-and-reference migration and are not safely satisfied here.
- A source Super Admin different from the target Super Admin cannot be added without violating the sole-account invariant.
- Invitation delivery is real customer/staff communication and needs explicit authority immediately before execution.
- An incorrectly identified target could create accounts in the wrong environment; fingerprint verification must precede all writes.
- Invited users start without source project grants or assignments and may require later, separately authorized assignment work.

## 10. Acceptance criteria

1. The target is proven to be the database currently configured for Render `lisno-api`.
2. The application remains configured with one runtime Mongo database.
3. The dry run reads only the approved source and reports sanitized counts/digests without exposing PII or secrets.
4. Only exact active standard `admin` and `designer` source identities are eligible for invitation.
5. Reserved/development-demo identities are rejected.
6. The target Super Admin remains unchanged, and the target contains exactly one Super Admin row.
7. A differing source Super Admin produces a blocking conflict and no write.
8. Existing target emails are never overwritten; same-role matches are skipped and role/email conflicts block the live batch.
9. Production invitations are created only through the existing Super Admin invitation flow after SMTP preflight and a separate explicit live-action approval.
10. Recipients choose fresh passwords and receive new target IDs; no source assignment or grant is implied.
11. Invitation creation/acceptance remains transactionally audited.
12. No migration, seed, deletion, Super Admin replacement, password-hash copy, deployment, commit, or account/cluster removal occurs outside separately approved scope.

## 11. Assumptions and open decisions

The following recommended assumptions become the approved behavior if this specification is approved:

- `lismo-api` means Render service `lisno-api`.
- Keep the current target Super Admin; compare but do not copy the source Super Admin.
- Transfer access for Admin and Designer through invitations with fresh passwords.
- Include active `standard` accounts only and exclude all demo/reserved identities.
- Do not preserve source IDs, passwords, grants, or assignments.

Facts still required before a task plan can authorize any operational step:

- Sanitized source cluster/database fingerprint.
- Sanitized target cluster/database fingerprint and proof it matches Render `lisno-api`.
- Exact email allowlist, or explicit approval to include every eligible active Admin and Designer.
- Confirmation that real invitation emails may be sent during the later live-action stage.
- Conflict decision if the source and target Super Admin emails differ; the default is to stop and keep the target unchanged.
