# Existing `lisno` Database Super Admin Bootstrap — Revised Target Specification

## 1. Decision summary

### Requested outcome

Provision exactly one real Super Admin in the existing Atlas database
`linso-cluster / lisno` so the deployed application can authenticate against the
database that already contains the operator's project, workflow, and task data.

The previously provisioned Super Admin in `linso-cluster / lisno_prod` is not copied,
moved, modified, or deleted by this revision. The same private operator-supplied
identity inputs may be used to create a new canonical User in `lisno`, but no User
document or password hash is copied between databases.

### Fixed target

- Atlas cluster: `linso-cluster`.
- Runtime database: `lisno`.
- The target fingerprint and live approval must name `linso-cluster / lisno`.
- `lisno_prod` is outside the write set and remains unchanged unless a later,
  separately approved cleanup operation is requested.

### Recommended approach

Revise the one-time bootstrap from an empty-database command into a baseline-aware
transaction for the existing `lisno` database. The transaction will:

1. fail closed unless the audited legacy baseline still matches;
2. quarantine exactly one reserved legacy Designer so it cannot receive new work;
3. insert exactly one new canonical Super Admin; and
4. preserve every project, task, workflow, finance, grant, evaluation, and audit
   reference.

Quarantine retains the legacy Designer's ID, name, email, password hash, role, and
all references. It changes only `active` to `false`, classifies the row as
`development_demo`, initializes its missing version, and updates its timestamp.

## 2. Current behavior and verified evidence

### Deployed application

- The frontend repository configuration targets the deployed backend under
  `https://lisno.onrender.com/api/v1`.
- A read-only `GET /api/v1/health` request returned HTTP `200` with status `ok`.
- Login failed after the first bootstrap because the account was created in
  `lisno_prod`, while the operator requires it in `lisno`.
- The Render `MONGODB_URI` database path must still be confirmed as `/lisno` before
  the live write.

### Sanitized `linso-cluster / lisno` audit

The production read-only audit reported:

- 42 collections and 1,185 total documents;
- one User document;
- zero active or inactive `super_admin` Users;
- zero Users matching the selected target identity;
- one active reserved-demo Designer;
- no missing or null normalized User email;
- the legacy Designer is missing persisted `accountKind` and `version` fields;
- six User indexes, including compatible unique `emailNormalized` and partial unique
  `one_super_admin` indexes; and
- five active tasks owned by the legacy Designer, with no other responsibility count
  reported by the current administration service.

### Legacy Designer behavior

- Remote authentication rejects the row because its identity is reserved for
  development/demo use.
- The row currently appears in Super Admin user administration and active Designer
  assignment/reassignment selectors because those queries do not filter reserved
  identity or account kind.
- Assigning new production work to it could strand that work because it cannot log in
  remotely.
- Missing `version` does not crash administration: repository mapping treats it as
  version `1`, and the first versioned update supports a missing persisted version.
- Quarantining it as inactive removes it from active assignment selectors while
  retaining its five task references and historical identity.

### Identity contract

- A production User requires a stable non-reserved ID, name, raw and normalized
  email, bcrypt password hash, role, active state, account kind, version, and
  timestamps.
- Normalized email is unique.
- The partial unique `one_super_admin` index permits at most one User whose role is
  `super_admin`, including inactive rows.
- The sole Super Admin is immutable, non-invitable, and cannot be created by role
  promotion.
- A new non-reserved active `standard` Super Admin is compatible with remote login.

## 3. Goal and measurable outcome

`linso-cluster / lisno` contains exactly two Users:

1. the original Designer, now inactive and explicitly classified as
   `development_demo`, still owning the same five active tasks; and
2. exactly one new non-reserved active standard Super Admin.

All audited business documents and reference lineage remain unchanged. The deployed
frontend can authenticate the new Super Admin through the deployed backend when
Render is confirmed to use `/lisno`.

This task creates no other User, invitation, audit event, email, project, task,
assignment, grant, finance entry, evaluation, or OCR artifact.

## 4. Scope

### Included

- Revise the operator bootstrap target from `linso-cluster / lisno_prod` to the exact
  target `linso-cluster / lisno`.
- Replace the empty-database precondition with an approval-bound existing-baseline
  audit.
- Require a private URI whose database path is exactly `/lisno`.
- Require an independently supplied fingerprint derived from the URI host and
  `lisno` database name.
- Require maintenance isolation from Render, OCR, shells, and other writers before
  the live action.
- Dry-run checks for:
  - exact target, connected database, and fingerprint;
  - expected collection/document/User counts;
  - exactly zero active or inactive Super Admins;
  - zero matches for the target normalized email;
  - exactly one expected reserved Designer baseline row;
  - its expected active state, missing legacy fields, and five task responsibilities;
  - no missing or null normalized User emails;
  - complete compatible User index definitions;
  - one proposed legacy-row quarantine and one proposed Super Admin insert; and
  - a non-reversible approval digest containing no PII or secrets.
- One transaction that rechecks the baseline, quarantines the exact legacy row by
  CAS, and inserts one canonical Super Admin.
- Post-write verification that:
  - User count is two;
  - exactly one canonical Super Admin exists;
  - the original Designer retains the same stable identity and five task references;
  - the Designer is inactive, `development_demo`, and versioned;
  - no unrelated collection count changed;
  - User indexes remain compatible; and
  - normal remote Super Admin authentication succeeds.
- Focused replica-set tests, integrity review, and full backend verification before
  any production dry run.

### Non-goals

- Do not copy the Super Admin document, ID, password hash, timestamps, token, or
  session from `lisno_prod`.
- Do not delete, rename, re-role, rekey, or replace the legacy Designer.
- Do not change its email, password hash, manager, title, or stable ID.
- Do not reassign, edit, or delete its five active tasks.
- Do not change existing project, workflow, grant, finance, evaluation, audit, or OCR
  data.
- Do not weaken the unique normalized-email or sole-Super-Admin indexes.
- Do not allow two Super Admins in `lisno`.
- Do not relax reserved-development-identity remote-authentication denial.
- Do not create Admin, Site Manager, Designer, Procurement, or Client accounts.
- Do not create or send invitations or email.
- Do not delete `lisno_prod` or its previously created User in this task.
- Do not expose personal emails, names, passwords, connection strings, keys, hashes,
  tokens, private IDs, or private links in repository files, reports, logs, commands,
  or screenshots.
- Do not deploy, change Render configuration, commit, or push without separately
  scoped authorization.

## 5. Required behavior and invariants

### Target and authority safety

- The command defaults to dry run and accepts only the optional `--write` argument.
- The URI database path, explicit target, fingerprint, and connected database must
  independently resolve to `linso-cluster / lisno`.
- A `lisno_prod` URI or fingerprint fails before index or data writes.
- The prior `lisno_prod` approval digest cannot authorize a `/lisno` write.
- A new exact `/lisno` approval digest is required immediately before the live action.
- Render and every other potential writer must be stopped or proven isolated during
  the final dry run and transaction.

### Baseline preservation

- The approval digest binds sanitized collection counts, document count, User count,
  Super Admin count, target-email count, reserved-user count, relevant responsibility
  counts, proposed mutations, and compatible index definitions.
- Any drift from the approved baseline stops the live action and requires a new dry
  run and approval.
- Existing identities and business content are never emitted in reports.
- The transaction rechecks the exact legacy row, User count, zero Super Admins,
  target-email absence, and responsibility baseline immediately before mutation.
- Unique email and `one_super_admin` indexes remain concurrency backstops.

### Legacy identity quarantine

- The update matches the exact audited legacy row by stable ID and expected legacy
  state.
- It retains name, email, normalized email, password hash, role, manager, authorized
  clients, title, creation time, and every external reference.
- It sets only `active: false`, `accountKind: "development_demo"`, `version: 1`, and
  the update timestamp.
- Any unexpected current value or concurrent change aborts the transaction.

### Canonical Super Admin creation

- The new User receives a generated non-reserved UUID.
- It uses the privately supplied trimmed display name and email plus normalized email.
- Its private application password satisfies the 12–128 character policy and is
  hashed with the established bcrypt cost.
- Stored state is `role: "super_admin"`, `active: true`,
  `accountKind: "standard"`, `version: 1`, `managerId: null`, and an empty authorized
  client list with current timestamps.
- Concurrent attempts remain single-row.
- An unchanged rerun reports `already_provisioned`; changed identity inputs fail
  without overwrite or password rotation.

## 6. End-to-end workflow

### Phase A — local contract revision

1. Update the bootstrap's exact target and baseline rules without introducing a
   generic arbitrary-database mode.
2. Extend replica-set tests for the compatible non-empty baseline, exact-row
   quarantine, target and baseline drift, identity conflict, index conflict,
   concurrency, rollback, idempotent rerun, lineage preservation, and redaction.
3. Run integrity review and the complete backend verification lane.

### Phase B — final read-only production dry run

1. Confirm Render's backend database path is `/lisno` and its Atlas database-user
   password is current.
2. Stop or isolate all writers.
3. Supply private execution inputs through the protected temporary environment file.
4. Run without `--write`.
5. Report only sanitized baseline counts, index state, two proposed mutations, target
   fingerprint, and approval digest.

### Phase C — exact live approval and transaction

1. Obtain explicit approval naming `linso-cluster / lisno`, the exact digest, one
   legacy-row quarantine, one Super Admin insert, and maintenance isolation.
2. Re-run the unchanged dry run and compare every bound value.
3. Execute the transaction once.
4. Run read-only post-write verification.

### Phase D — deployed login handoff

1. Start or redeploy the backend only if needed and separately authorized.
2. Verify `GET /api/v1/health`.
3. Verify the selected account can sign in with the private application password.
4. Confirm invitation/user administration is accessible.
5. Report the inactive legacy Designer and its five preserved tasks; any later task
   reassignment or cleanup is separate work.

## 7. Data, API, and UX impacts

### Data

- `lisno.users` gains exactly one canonical Super Admin.
- The exact legacy Designer receives one bounded quarantine update.
- No task or other business document is updated or deleted.
- `lisno_prod` remains unchanged.

### API

- Existing login, authorization, and administration endpoints remain unchanged.
- The bootstrap remains an operator-only command and is not exposed through HTTP.
- Backend authorization remains authoritative.

### UX

- The real Super Admin signs in through the existing login screen after Render is
  confirmed to use `/lisno`.
- The quarantined Designer is excluded from active Designer assignment selectors.
- It may remain visible as inactive in user administration for traceability.
- Other real staff accounts may be created later through the portal.

## 8. Compatibility, failure handling, and recovery

- The application continues using one Mongo database through `MONGODB_URI`.
- Existing indexes are inspected additively; destructive index synchronization is
  prohibited.
- Target, baseline, identity, responsibility, or index mismatch fails before writes.
- A transaction failure leaves both User rows in their pre-operation state.
- Unique indexes protect against duplicate email or a second Super Admin.
- An exact rerun is idempotent and does not rotate identity or credentials.
- Post-commit verification failure explicitly reports that commit may have occurred.
- Any post-commit removal, reactivation, or correction requires a separate exact
  approval; it is not an automatic rollback.
- Atlas backup or equivalent recovery evidence should be recorded where available.

## 9. Options and tradeoffs

### A. Baseline-aware quarantine plus insert into `lisno` — recommended

- Preserves existing data and task lineage.
- Prevents the unusable demo Designer from receiving new production assignments.
- Adds one real Super Admin without copying credentials from another database.
- Requires a revised command, tests, dry run, and new live approval.

### B. Insert only and leave the demo Designer active

- Is mechanically smaller.
- Leaves a remote-login-denied identity assignable to new projects and tasks.
- Rejected because it can strand operational work.

### C. Point the application at clean `lisno_prod`

- Already contains the created Super Admin and avoids the legacy User.
- Does not contain the existing business data required by the operator.
- Rejected for the requested runtime workflow.

### D. Copy the `lisno_prod` User document into `lisno`

- Reuses a password hash and identity document across databases.
- Adds unnecessary identity-migration and secret-lineage risk.
- Rejected in favor of new canonical creation from private inputs.

## 10. Principal risks

- A wrong target could create another highest-privilege identity.
- Baseline drift from a running process could invalidate the transaction assumptions.
- Quarantining the Designer preserves five task owners but makes the owner inactive;
  those tasks should later be reviewed and reassigned to a real Designer.
- A weak or exposed login password compromises the sole Super Admin.
- The unused `lisno_prod` Super Admin remains a privileged credential until separately
  reviewed and cleaned up.
- Stale Render environment variables or free-instance cold starts can still cause
  login failure after correct provisioning.

## 11. Acceptance criteria

1. The revised command targets only the approved `linso-cluster / lisno` operation
   and rejects `/lisno_prod` or any other database.
2. Dry run binds the sanitized existing baseline, reports one quarantine plus one
   insert, exposes no PII/secrets, and performs zero writes.
3. Live execution occurs only after a new exact `/lisno` digest approval and writer
   isolation confirmation.
4. One transaction CAS-quarantines the exact legacy Designer and inserts exactly one
   non-reserved active standard Super Admin.
5. Post-write `lisno.users` contains two Users and exactly one Super Admin.
6. The legacy Designer retains its stable identity, role, credential hash, creation
   time, and five task references while becoming inactive `development_demo` version
   `1`.
7. No task, project, workflow, grant, finance, evaluation, audit, invitation, email,
   or OCR document changes.
8. Unique normalized-email and sole-Super-Admin indexes remain compatible.
9. An unchanged rerun is idempotent; target, baseline, identity, responsibility,
   concurrency, and index conflicts fail closed.
10. The deployed backend remains healthy and the new Super Admin can authenticate
    when Render is confirmed to use `/lisno`.
11. `lisno_prod` and its existing User remain unchanged.
12. No secret, PII, URI, private ID, hash, token, or private link is committed or
    logged.
13. No deployment, Render change, commit, push, deletion, cleanup, seed, or unrelated
    migration occurs without separate explicit authorization.

## 12. Assumptions, constraints, and open decisions

### Proposed assumptions for approval

- Existing `lisno` business data is the desired runtime dataset.
- The Super Admin is newly created from private inputs, not copied from `lisno_prod`.
- The unusable legacy Designer should be quarantined but not deleted or rekeyed.
- Its five active tasks remain linked until later portal-based reassignment.
- Other staff accounts will be created later through the portal.

### Required before a live write

- Confirm Render's `MONGODB_URI` database path is exactly `/lisno` and uses the current
  Atlas database-user password.
- Confirm all writers are stopped or isolated.
- Obtain the revised command's final sanitized dry-run report and approval digest.
- Obtain exact live approval naming `linso-cluster / lisno`, that digest, one
  quarantine update, and one Super Admin insert.

Specification or task-plan approval does not authorize implementation, production
access, a live write, deployment, cleanup, or deletion.
