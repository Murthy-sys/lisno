# Existing clients join new projects automatically

Status: approved and implemented in Mode A. The user's subsequent explicit account-wide mapping instruction authorized the three historical local project corrections, including Client 1; all eight account projects are now linked and verified. See the task plan's execution record for evidence.

## Goal

An existing active Client account must see a newly initiated project immediately, without another join invitation. Only a first-time client without an account needs the existing invitation and registration flow. Also prepare a narrowly scoped correction for the already-created local project named Client 1.

## Current behavior and evidence

- `backend/src/services/admin-project.service.ts` finds the account by normalized client email but always creates the project with `clientId: null`. After committing, it attempts a project invitation for every initiation.
- Client project reads in `backend/src/repositories/mongo.ts` correctly require `project.clientId === user.id`. Merely matching an email does not grant access.
- The invitation summary currently derives its status solely from an invitation record, so a project linked without an invitation would misleadingly display “Invitation not sent.”
- Read-only inspection of the local Client 1 project found one matching active standard Client account, an unset project client ID, and a failed, unaccepted join invitation. Its estimate review email subsequently succeeded. These are separate delivery workflows.
- Public client signup is disabled by `auth.service.ts`; the existing invitation acceptance path remains the account-creation boundary.
- Existing unrelated work is substantial. Initial status and relevant diffs are preserved under `/tmp/lisno-existing-client-link-baseline/` and must not be overwritten.

## Scope and requirements

1. In the existing project-initiation transaction, normalize the client email and resolve the account using the existing email coordination mechanism. When it identifies an active, eligible standard Client, store that account's stable ID on the project immediately.
2. Record the existing `client_project_linked` audit event with the initiating staff actor. Preserve the initiation receipt, project/lead creation, assignment grants, and transaction semantics. An idempotent retry must not duplicate links, audits, invitations, or projects.
3. For an already linked project, skip invitation creation and delivery entirely, including when SMTP is disabled or unavailable. Estimate publication/delivery behavior is unchanged.
4. When no client account exists, preserve project creation followed by the existing first-time invitation flow. Account creation, password validation, token ownership proof, and project linking still occur through invitation acceptance.
5. Reject an existing inactive/deleted client or internal-role account with a field-level error. Do not create another account, reactivate anyone, or bypass reserved demo-identity restrictions. Match by normalized email, never by client name.
6. Extend the invitation summary contract with a truthful `linked` state for a project linked without an accepted invitation. Show “Client already linked” with no send/resend/revoke controls. Preserve `accepted` for an actually accepted invitation and retain its historical timestamps. Do not fabricate invitation acceptance.
7. Update initiation feedback so an existing client is described as already having access rather than being asked to accept an invitation. Keep all related frontend/backend types and API documentation synchronized.

## Local Client 1 correction

Prepare a targeted, dry-run-first repair for the uniquely identified local Client 1 project and its matching active standard Client account. It must recheck normalized email, account eligibility, unset client ID, project identity, and invitation version immediately before an atomic write. Link only that project, invalidate its pending invitation token through an audited revocation, and preserve the failed delivery history, estimates, PDFs, and approvals.

The repair must provide conflict reporting, an idempotent already-correct outcome, a protected before-state backup, and a rollback procedure that refuses to undo subsequent client activity or restore a usable stale token. No broad email-based backfill or mutation during GET/login is allowed. Prepare and review the exact target and dry-run evidence before requesting the separate authorization required for a live data repair. Specification approval alone does not execute that repair.

## Invariants and non-goals

- Client reads continue to enforce stable account-ID ownership; no email-based visibility fallback.
- Staff authorization and the sole Super Admin rules remain unchanged.
- No account creation or session issuance solely because an email appears on a project.
- No new public registration endpoint, project reassignment feature, mass migration, deployment, or real email send as part of implementation verification.
- Existing estimate/client approval records, financial values, project numbers, and issued artifacts remain immutable.

## Compatibility, risks, and failure handling

The change is additive to the summary response; persisted invitation statuses remain unchanged. Frontend and backend consumers must ship together to handle `linked`. The existing per-email coordination and authorization transaction protect against concurrent registration, deactivation, and initiation. Recheck eligibility inside the transaction, fail on conflicting ownership, and preserve first-time invitation failure behavior. Memory and Mongo implementations must agree wherever their contracts change.

The principal risk is linking the wrong account or suppressing a needed invitation. Counter it with asymmetric account/project tests and explicit cases for normalized-email matches, different emails, internal roles, inactive/deleted accounts, and reserved identities. No names or email addresses from the local diagnosis belong in fixtures or logs.

## Acceptance and verification

- An existing active eligible Client sees only its newly linked project in client list/detail reads immediately; another Client cannot see it.
- No invitation record, token, or mail call is created for that existing client, even with disabled/failing mail.
- A first-time client remains unlinked until valid invitation acceptance, after which the project is visible.
- Repeat/concurrent initiation remains idempotent and preserves project numbering and estimate history.
- Linked and accepted UI states render accurately and expose no inappropriate invitation actions; error and first-time invitation states still work.
- Existing-client checks reject ineligible accounts without partial project/lead/audit writes.
- Focused service/API tests, replica-set transaction tests, frontend rendered interaction tests, relevant typechecks/builds, and `git diff --check` pass. Final checks run after all edits are integrated.
- The local Client 1 repair has a reviewed dry run, backup/rollback design, and exact target scope before live execution; verification afterward confirms owner-only visibility and unchanged estimate artifacts.

## Decisions

Use the existing project initiation and invitation architecture. Add no account lookup UI or alternative authentication mechanism. No unresolved product decision is required for this specification.
