# Password-Reset Delivery Feedback — Task Plan

## Approved source

- Specification:
  `docs/superpowers/specs/2026-08-28-self-service-password-reset-design.md`
- Approved amendment: **delivery-result responses**.

## Outcome

Make password-reset feedback honest and operationally actionable without turning the
anonymous endpoint into an account-enumeration oracle:

1. keep the existing asynchronous, account-neutral `202 { accepted: true }` public
   response unchanged;
2. replace the frontend's green delivery-success presentation with a neutral
   **Request received** state; and
3. improve the shared SMTP classifier so operators receive the narrowest bounded
   failure code supported by the provider error shape, while raw provider text is
   discarded.

This is a local implementation plan only. It does not authorize deployment, Render
or SendGrid changes, real mail, production access or mutation, migration, dependency
installation, commit, or push.

## Current-state evidence

- `backend/src/routes/password-resets.ts` always returns `202` after
  `PasswordResetService.request` accepts a syntactically valid request.
- `backend/src/services/password-reset.service.ts` schedules account lookup,
  issuance, and SMTP after the public response path; eligible, unknown, inactive,
  reserved, suppressed, SMTP-success, and SMTP-failure cases are intentionally
  indistinguishable publicly.
- `backend/src/services/smtp-transport.ts` maps Nodemailer `EMESSAGE`/`ESTREAM` to
  `SMTP_MESSAGE_FAILED` before considering available SMTP response metadata, which
  can lose a narrower safe classification.
- `frontend/src/auth/ForgotPasswordPage.tsx` shows a green check after `202`, which
  visually implies delivery even though the backend has only accepted the request.
- `sentAt` records SMTP-provider acceptance, not inbox delivery. No provider webhook
  or inbox-delivery contract exists.

## Invariants and non-goals

1. The request endpoint remains public, asynchronous, `no-store`, and independent of
   account and SMTP outcome.
2. No public status, body, header, copy, or timing branch exposes account existence,
   suppression, delivery state, or provider cause.
3. Raw provider responses, addresses, message content, tokens, URLs, credentials,
   and stack traces never enter persistence, audits, logs, API responses, or DOM.
4. Only bounded constant failure codes may be persisted/audited.
5. Existing reset issuance, cooldown, quota, token, delivery-CAS, completion,
   session-invalidation, and transaction semantics remain unchanged.
6. Shared SMTP changes must remain compatible with invitation, estimate, design-plan,
   and password-reset mailers.
7. No schema, index, API/OpenAPI, authorization registry, dependency, environment,
   or migration change is in scope.
8. Inbox-delivery confirmation, SendGrid event webhooks, and a Super Admin delivery
   dashboard are separate future scopes.

## Ownership boundaries

### Primary integrator

Owns the approved spec/plan, shared failure-code contract, dirty-worktree baseline,
integration reconciliation, final diff review, and handoff. It must preserve the
already-modified specification and any unrelated user work.

### Backend mail writer

Owns only:

- `backend/src/services/smtp-transport.ts`;
- focused mailer tests needed to prove safe classification, principally
  `backend/tests/password-reset-mailer.test.ts`; and
- any directly affected existing mailer expectation that must change because the
  transport is shared.

It must not edit password-reset routes/service orchestration, repositories, models,
OpenAPI, frontend, spec/plan files, environment files, or deployment configuration.

### Frontend recovery writer

Owns only:

- `frontend/src/auth/ForgotPasswordPage.tsx`;
- `frontend/src/auth/ForgotPasswordPage.test.tsx`; and
- the smallest password-reset-specific styling change in
  `frontend/src/styles/invitations.css` if required.

It must not edit backend, API response types, router behavior, other invitation/reset
success states, spec/plan files, or deployment configuration.

### Integrity reviewer and verification runner

Run sequentially after all writers and integration are finished. They are read-only
and must not modify product sources.

## Initial dirty-worktree boundary

At task-plan creation, the only known dirty path is:

```text
M docs/superpowers/specs/2026-08-28-self-service-password-reset-design.md
```

Before writers start, the primary integrator must rerun `git status --short`, capture
scoped diffs for any newly dirty target, and resolve ownership before delegation. No
writer may stage, revert, reformat, or overwrite unrelated work.

## Dependency-ordered tasks

### Task 1 — Freeze the amendment contract and baseline

Owner: Primary integrator.

Dependencies: approved specification and approved task plan.

Work:

1. Capture the current dirty-path set and relevant target diffs.
2. Freeze the unchanged public contract: `202 { data: { accepted: true } }` for every
   valid email while mail is globally available.
3. Freeze the operator-only failure-code rule: prefer a narrower bounded code only
   when Nodemailer supplies sufficient structured evidence; otherwise retain the
   existing safe generic code.
4. Freeze the exact frontend content:
   - heading: **Request received**;
   - message: **If an eligible account exists for that email, reset instructions
     will be sent.**;
   - supporting copy: **Check your inbox and spam folder. Wait a few minutes before
     trying again.**
5. Confirm backend and frontend ownership remains non-overlapping.

Acceptance:

- No public API or persistence contract is ambiguous.
- No implementation target has unresolved prior edits or ownership.

### Task 2A — Improve bounded SMTP failure classification

Owner: Backend mail writer.

Dependencies: Task 1.

May run in parallel with Task 2B.

Work:

1. Extend the internal provider-error shape only as needed for Nodemailer's
   structured `code`, `responseCode`, and command/stage metadata.
2. Order classification so authentication, TLS, connection, SMTP response, sender,
   recipient, and message-stage evidence produce the narrowest approved bounded
   constant. Do not return or persist provider-controlled strings.
3. Map synthetic sender rejection to `SMTP_SENDER_REJECTED` and synthetic recipient
   rejection to `SMTP_RECIPIENT_REJECTED` only when structured command/stage evidence
   is sufficient. Preserve `SMTP_MESSAGE_FAILED`, `SMTP_REJECTED`,
   `SMTP_TEMPORARY_FAILURE`, or `SMTP_DELIVERY_FAILED` as safe fallbacks.
4. Ensure `MailDeliveryError` exposes only `Mail delivery failed.` plus the bounded
   code.
5. Add table-driven tests covering auth, TLS, connection, timeout, sender rejection,
   recipient rejection, permanent/temporary provider rejection, message/stream
   failure, unknown error, and malicious provider text containing email/token/secret
   values.
6. Run focused password-reset, invitation, and estimate mailer tests affected by the
   shared transport.

Acceptance:

- A SendGrid/Nodemailer-shaped sender rejection no longer collapses to the overly
  broad `SMTP_MESSAGE_FAILED` when safe structured evidence identifies the sender
  stage.
- Malicious or private provider text cannot appear in the thrown error, failure code,
  audit/persistence payload, or test snapshots.
- Existing shared-mailer behavior remains compatible.

Stop/report condition:

- If narrowing requires parsing provider-controlled free text rather than stable
  structured metadata, stop and keep the safe generic code unless the primary
  integrator approves a separately tested bounded mapping.

### Task 2B — Replace false delivery-success presentation

Owner: Frontend recovery writer.

Dependencies: Task 1.

May run in parallel with Task 2A.

Work:

1. Replace the green check-only accepted state with a neutral informational state.
2. Render the exact approved heading, message, and supporting copy without echoing
   the submitted email.
3. Preserve **Back to sign in** and **Try another email**, duplicate-submit
   prevention, focus restoration, busy state, and live-region announcements.
4. Ensure no wording claims **sent**, **delivered**, or inbox success.
5. Add/update tests for accepted copy, absence of the submitted email, absence of the
   delivery-success mark, keyboard action order, focus restoration, live-region
   semantics, and automated accessibility including color contrast.
6. Verify initial, validation, loading, accepted, unavailable, rate-limited, and
   network-error states at 360px, 768px, and desktop widths.

Acceptance:

- `202` is presented as request acceptance, not mail delivery.
- The accepted state is neutral, accessible, responsive, and non-disclosing.
- Other invitation and completed-password-reset success states are unchanged.

### Task 3 — Integrate and run focused regression checks

Owner: Primary integrator.

Dependencies: Tasks 2A and 2B.

Work:

1. Inspect and reconcile the integrated diff against specification AC 21–24.
2. Confirm no route, service orchestration, response schema, OpenAPI, model,
   repository, environment, dependency, or lockfile changed.
3. Search the scoped diff for provider responses, email addresses, reset tokens,
   URLs, SMTP credentials, and stack traces.
4. Run:

```bash
cd backend
npm test -- tests/password-reset-mailer.test.ts
npm test -- tests/user-invitation-mailer.test.ts
npm test -- tests/estimate-mailer.test.ts
npm test -- tests/password-reset.test.ts
npm run typecheck

cd ../frontend
npm test -- src/auth/ForgotPasswordPage.test.tsx
npm test -- src/auth/passwordResetApi.test.ts
npm run typecheck

cd ..
git diff --check
git status --short
```

Acceptance:

- Focused tests and both typechecks pass.
- Public reset-request behavior remains byte-compatible and asynchronous.
- Only approved source/tests/spec/plan files are dirty.

### Task 4 — Integrated integrity review

Owner: Integrity reviewer.

Dependencies: Task 3.

Review focus:

- account enumeration through status, body, headers, copy, or timing;
- provider-controlled text and secret/PII leakage;
- correctness and boundedness of every new failure classification;
- cross-mailer regressions from shared SMTP transport changes;
- frontend truthfulness, accessible semantics, and non-disclosure;
- accidental API, persistence, authorization, dependency, or deployment changes.

Acceptance:

- All blocker and major findings are resolved and re-reviewed before Task 5.

### Task 5 — Final verification

Owner: Verification runner.

Dependencies: resolved Task 4.

Checks:

```bash
cd backend
npm run typecheck
npm test
npm run build

cd ../frontend
npm run typecheck
npm test
npm run build

cd ..
git diff --check
git status --short
```

Also verify the 360px, 768px, and desktop frontend state matrix and confirm the
password-reset HTTP tests still prove identical public responses for eligible,
unknown, inactive, reserved, suppressed, SMTP-success, SMTP-failure, and slow SMTP
cases.

Acceptance:

- Full backend/frontend tests, typechecks, builds, rendered checks, and repository
  hygiene pass or every exact failure is reported.
- No lint success is claimed because the repository has no lint script.
- No real email, Render/SendGrid change, production access, deploy, migration,
  commit, or push occurred.

## Parallel execution schedule

After Task 1 freezes the contract and ownership:

```text
Task 2A backend SMTP classification --\
                                       +--> Task 3 integration --> Task 4 review --> Task 5 verification
Task 2B frontend neutral feedback ----/
```

Tasks 2A and 2B are safe to run in parallel because they have disjoint ownership.
Tasks 3–5 are sequential against the integrated worktree.

## Acceptance-criteria traceability

| Specification criterion | Implemented by | Verified by |
|---|---|---|
| AC 21: unchanged account-neutral asynchronous public response | No behavior change; guarded in Tasks 1 and 3 | Tasks 3–5 |
| AC 22: neutral **Request received** frontend state | Task 2B | Tasks 3–5 |
| AC 23: narrow bounded operator-only SMTP codes and no raw provider text | Task 2A | Tasks 3–5 |
| AC 24: no public delivery/account branch | Tasks 1–3 | Tasks 3–5 |

## External actions not authorized

- No SendGrid API key or Sender Authentication change.
- No Render environment change or deployment.
- No live SMTP verification or customer email.
- No Atlas query or production database mutation.
- No migration, commit, or push.

