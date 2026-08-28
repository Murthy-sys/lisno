# Self-Service Password Reset — Task Plan

## Approved source

- Specification:
  `docs/superpowers/specs/2026-08-28-self-service-password-reset-design.md`

## Outcome

Implement a public email-based recovery flow for every active real `standard` Lisno
User, including the sole Super Admin, while preserving account non-disclosure,
one-time token semantics, transactional credential changes, immediate invalidation
of pre-reset JWTs, and the established public-auth visual/accessibility patterns.

The implementation remains local until separately authorized. This plan does not
authorize production data access or mutation, real email, deployment, provider or
Render changes, a production migration, dependency installation, commit, or push.

## Contract invariants

Every implementation slice must preserve these approved invariants:

1. Unknown, inactive, reserved/demo, and recipient-throttled emails receive the
   same accepted response as eligible accounts and create no reset, audit, or mail.
2. A globally disabled mail subsystem returns one account-neutral unavailable
   response before account lookup or writes.
3. Raw reset tokens exist only during generation and the bounded delivery attempt;
   Mongo stores only SHA-256 digests and the frontend stores only an in-memory ref.
4. A reset is single use, expires after 30 minutes, and is tied to one User,
   captured User/session versions, reset generation, and exact CAS version.
5. Completion is one transaction that changes the password hash, increments User
   and session versions, consumes the reset, and appends a safe audit event.
6. Successful completion issues no JWT. All pre-reset JWTs fail immediately and the
   User signs in normally with the new password.
7. No public API, audit record, log, metric label, DOM, browser history/state,
   storage, query cache, screenshot, or committed fixture exposes an email, token or
   digest, password or hash, JWT, reset URL, SMTP secret, or provider response.
8. The protected route-operation authorization registry remains unchanged because
   reset endpoints are public bearer-token operations with OpenAPI `security: []`.
9. Memory and Mongo repository behavior remain equivalent. Transactional Mongo
   behavior is proven with a local replica set.
10. User identity, email, role, active/account kind, assignments, project access,
    approvals, and financial/workflow data remain unchanged by reset completion.

## Initial dirty-worktree boundary

Before any writer starts, the primary integrator must re-run `git status --short`
and preserve every pre-existing path. At planning time, the password-reset
specification is untracked. Historical Super Admin bootstrap changes may reappear
or remain in another worktree state and must be treated as unrelated user work.

No writer may stage, revert, reformat, or overwrite an unrelated dirty file. If an
assigned target is already dirty, the primary integrator first records its scoped
diff and explicitly resolves ownership before delegation.

## Affected areas and ownership boundaries

### Primary integrator

Owns:

- the approved spec and this plan;
- cross-slice API/data/error/status naming;
- initial and final dirty-worktree reconciliation;
- integration review and resolution of contract disagreements;
- final decision on any shared file that two slices would otherwise touch.

Does not delegate production access, real SMTP delivery, deployment, migration,
commit, or push. Those actions remain outside this implementation.

### Backend identity/reset writer

Owns the backend reset state, authentication versioning, public APIs, application
wiring, OpenAPI inventory, indexes, seed parity, and core backend tests. Expected
areas include:

- `backend/src/domain/` password-reset rules;
- `backend/src/contracts/` or route-local reset shapes, following current boundary;
- `backend/src/models/User.ts` and a new reset model;
- backend repository contracts plus memory and Mongo implementations;
- `backend/src/services/auth.service.ts` and a new reset orchestration service;
- backend auth routes, server/app composition, index initialization, and OpenAPI;
- focused unit, HTTP, authentication, and replica-set reset tests.

This writer must not edit frontend files, SMTP transport implementation files owned
by the mail writer, spec/plan files, or unrelated bootstrap operation files.

### Backend mail writer

Owns only the password-reset delivery abstraction, SMTP messages, safe delivery
result mapping, post-commit dispatch helper, password-changed notification, and
focused mail tests. Expected areas include new files under:

- `backend/src/services/` for reset mailer interfaces and SMTP implementation;
- focused backend tests dedicated to reset mail content, TLS/transport boundaries,
  disabled/failed/sent behavior, stale callbacks, and redaction.

This writer reuses the existing SMTP transport/configuration and mail HTML escaping.
It must not change User/reset persistence, repositories, auth routes, frontend,
shared invitation behavior, spec/plan files, or production configuration.

### Frontend recovery writer

Owns all frontend password-reset behavior and tests:

- login **Forgot password?** link;
- public routes in `frontend/src/app/router.tsx`;
- reset API types/client module;
- new forgot-password and reset-password page/components;
- focused API, routing, interaction, accessibility, security, and responsive tests.

This writer must not edit backend, spec/plan, deployment, or production files. It
must implement only the approved public API contract and must not invent account or
delivery data absent from that contract.

### Integrity reviewer

Runs only after all writers and primary integration finish. Reviews the integrated
diff read-only for authentication, enumeration, token secrecy, transactions, races,
delivery side effects, invitation/session compatibility, frontend token handling,
and rollback risk.

### Verification runner

Runs after all confirmed integrity findings are resolved. Executes final risk-based
checks against the integrated worktree without changing product source files.

## Dependency-ordered task graph

### Task 1 — Freeze baseline and shared contract

Owner: Primary integrator.

Dependencies: approved specification.

Work:

1. Capture `git status --short` and scoped diffs for every assigned dirty target.
2. Reconfirm the current auth, repository, invitation-token, SMTP, OpenAPI, routing,
   and unauthorized-session paths named in the specification.
3. Publish to all writers the exact shared names and shapes:
   - request, inspect, and complete endpoints;
   - `PASSWORD_RESET_DELIVERY_UNAVAILABLE` and
     `PASSWORD_RESET_UNAVAILABLE` errors;
   - `sessionVersion` legacy mapping and JWT claim;
   - reset statuses, delivery states, token/generation/CAS rules;
   - audit actions and allowed values;
   - literal frontend routes and UI copy.
4. Identify the single owner for every shared composition or contract file before
   writers start.

Acceptance:

- No assigned file has ambiguous ownership.
- No implementation starts with an unresolved shared shape or security choice.
- Existing unrelated changes are recorded and preserved.

### Task 2A — Build backend reset state and session-version foundation

Owner: Backend identity/reset writer.

Dependencies: Task 1.

May run in parallel with Tasks 2B and 2C.

Work:

1. Add pure domain validation/state-transition rules for eligibility, availability,
   expiry, supersession, consumption, generation, cooldown, and quota.
2. Add `sessionVersion` with legacy value `1` across public/internal User shapes,
   model mapping, seed data, memory repository, and Mongo repository.
3. Add the reset aggregate/model with hidden unique token digest, one-pending-reset
   enforcement, operational indexes, timestamps, CAS version, and approved safe
   fields only.
4. Extend repository/transaction contracts for exact reset issuance, lookup,
   supersession, delivery-state CAS, completion, and audit behavior. Keep memory and
   Mongo paths equivalent.
5. Include `sessionVersion` in newly signed JWTs, accept missing claim as legacy `1`,
   and reject claim/current-User mismatch on every authenticated request.
6. Add focused tests for domain rules, schema redaction, repository parity, legacy
   compatibility, JWT invalidation, and additive index initialization.

Acceptance:

- Legacy Users and legacy version-1 JWTs continue to work until password reset.
- Token digest is excluded from ordinary query/projection paths.
- Unique/current-reset and CAS invariants fail closed without destructive index sync.
- Changing `sessionVersion` makes every earlier JWT unauthorized.
- Unit and repository tests contain synthetic identities and no secrets or PII.

### Task 2B — Build reset mail and safe asynchronous delivery boundary

Owner: Backend mail writer.

Dependencies: Task 1.

May run in parallel with Tasks 2A and 2C.

Work:

1. Add a reset-mailer capability/preflight interface that reports globally disabled
   delivery before eligible-account lookup or persistence.
2. Create the reset link only from trusted `PUBLIC_FRONTEND_URL` and a strict URL
   fragment token. Never use request `Host`, query parameters, or redirects.
3. Implement escaped text/HTML reset mail with the 30-minute expiry and no account,
   role, or project details.
4. Add best-effort password-changed notification with no reset token or private link.
5. Reuse the isolated certificate-validating SMTP transport, bounded timeouts, and
   safe provider error classification.
6. Provide a bounded post-commit dispatch callback that carries the raw token only
   in memory and reports `sent`/`failed` against the exact reset ID/generation.
7. Add focused tests for disabled, sent, failed, stale-result, URL construction,
   HTML escaping, no file/URL mail access, notification independence, and redaction.

Acceptance:

- No raw token, link, submitted email, provider response, or SMTP credential is
  persisted, audited, logged, or returned publicly.
- SMTP failure cannot roll back committed reset issuance or completed password.
- Stale delivery callbacks cannot change a superseded/completed generation.
- Provider click/open tracking is documented as a production prerequisite, not
  modified remotely.

### Task 2C — Build public recovery pages and frontend security boundary

Owner: Frontend recovery writer.

Dependencies: Task 1.

May run in parallel with Tasks 2A and 2B against the frozen API contract.

Work:

1. Add a literal `/forgot-password` link between the login password field and sign-in
   action without carrying a return target.
2. Add public route entries outside the App Shell for `/forgot-password` and
   `/reset-password`.
3. Add a public reset API module using unauthenticated `postPublic`, `no-store`, and
   `no-referrer` requests without TanStack persistence or token-bearing query keys.
4. Build the forgot-password form, generic accepted state, retry flow, unavailable
   mail state, rate-limit state, focus management, busy state, and live messages.
5. Build the reset page state machine:
   - capture and strictly validate one fragment token;
   - keep it only in a ref and scrub the URL before inspect/render side effects;
   - checking, generic unavailable, ready, validation, completing, race, and success;
   - block completion during AuthProvider restore/error/authenticated/sign-out states;
   - explicit logout that remains on the reset route;
   - no automatic login or redirect.
6. Prevent Strict Mode and click duplication for inspect and complete.
7. Add tests proving token absence from DOM, router/history state, storage, caches,
   console, request errors, and screenshots.
8. Add rendered keyboard/focus/live-region/accessibility and responsive checks at
   desktop, tablet, 320px mobile, safe-area, and reduced-motion states.

Acceptance:

- The submitted email is never echoed after request.
- Malformed/missing fragments make no inspect call and every unavailable case uses
  the same UI.
- The token disappears from the address bar before network inspection and never
  enters React state or persistent browser facilities.
- Repeated actions and React Strict Mode result in one effective inspect/complete.
- All approved page states are keyboard operable, named, announced, and responsive.

### Task 3 — Implement reset orchestration and public HTTP contract

Owner: Backend identity/reset writer.

Dependencies: Tasks 2A and 2B.

Must not run concurrently with another writer touching backend composition files.

Work:

1. Implement request orchestration:
   - global mail preflight before lookup;
   - strict normalization/eligibility;
   - dedicated IP limit before body validation;
   - five-minute persistent cooldown and maximum five issuances per rolling day;
   - transactional supersede/create/requested audit;
   - immediate generic response independent of SMTP;
   - bounded post-commit mail dispatch and exact-generation delivery telemetry.
2. Implement inspection by token digest with one generic unavailable response and no
   identity fields.
3. Implement completion:
   - bcrypt cost-12 hash before the transaction;
   - exact digest/generation/CAS/User/session checks;
   - transactional password replacement, User/session version increments, token
     consumption, terminal state, and safe audit;
   - no JWT issuance;
   - post-commit password-changed notification.
4. Register public routes with strict Zod objects, `Cache-Control: no-store`, public
   Authorization stripping, approved response codes, and safe validation envelopes.
5. Add OpenAPI paths with `security: []`; do not add protected authorization
   operations or frontend permissions.
6. Wire model indexes, service dependencies, mail capability, clock/random/hash
   boundaries, and local seed cleanup through established app/server composition.
7. Add safe audit actions and metrics without identity labels or prohibited values.

Acceptance:

- Request timing does not wait for SMTP and all valid-email account states share the
  same `202` response.
- Disabled mail returns the account-neutral `503` before lookup/write.
- Completion is atomic, replay-safe, race-safe, and leaves no partial state.
- Successful reset invalidates all old JWTs, invalidates older Super Admin invitation
  generations through existing User-version rules, and preserves every other User
  and business field.
- Public endpoints never enter the protected permission registry.

### Task 4 — Complete backend HTTP, concurrency, and rollback coverage

Owner: Backend identity/reset writer.

Dependencies: Task 3.

Work:

1. Add asymmetric HTTP tests for active Users in multiple roles, Super Admin,
   unknown, inactive, demo/reserved, pending invitation, and throttled cases.
2. Assert byte-equivalent public status/body/headers for all account-neutral request
   outcomes and that SMTP latency/failure does not affect response content.
3. Cover malformed JSON/fields/tokens, no-store headers, Authorization stripping,
   IP limiting, recipient cooldown/quota, expiration, supersession, replay, and no
   identity disclosure.
4. Add local replica-set tests for:
   - request/request;
   - complete/complete;
   - request/complete;
   - complete/deactivate;
   - complete/role-change;
   - stale delivery callback;
   - audit/update/reset failure injection and transaction rollback.
5. Prove old password and pre-reset JWT fail, new password succeeds through login,
   reset returns no JWT, and unrelated User/business fields remain byte-equivalent.
6. Prove reset of a synthetic Super Admin makes its older invitation generations
   unavailable without weakening the sole-Super-Admin invariant.
7. Add OpenAPI/index/permission-registry inventory regression tests.

Acceptance:

- All race tests have one deterministic winner or approved terminal result.
- Failure injection proves no partial password, version, reset, or audit writes.
- Tests inspect logs/audits/responses for prohibited secret and identity values.
- Mongo tests use only a temporary local replica set and synthetic accounts.

### Task 5 — Integrate cross-stack behavior and run focused checks

Owner: Primary integrator.

Dependencies: Tasks 2C and 4.

Work:

1. Reconcile DTO, route, error, header, and UI assumptions without overwriting
   unrelated work.
2. Inspect the full scoped diff for token/password/email/provider disclosure and
   unexpected permission, invitation, signup, or login changes.
3. Run focused checks, adjusting exact test paths to the implemented filenames:

```bash
cd backend
npm test -- tests/password-reset.test.ts
npm test -- tests/password-reset-mongo.replica-set.test.ts
npm test -- tests/password-reset-mailer.test.ts
npm run typecheck

cd ../frontend
npm test -- src/auth/PasswordReset.test.tsx
npm test -- src/auth/LoginPage.test.tsx
npm run typecheck
```

4. Run the rendered recovery journey against a local backend/mocked mail boundary,
   including fragment scrubbing, reset completion, old-session rejection, and new
   login.

Acceptance:

- Every focused test and both typechecks pass.
- API and UI copy/status behavior matches the approved specification exactly.
- No production network, Atlas, Render, SendGrid, Gmail, or real-mail action occurs.

### Task 6 — Integrated integrity review

Owner: Integrity reviewer.

Dependencies: Task 5.

Review focus:

- account and timing enumeration;
- raw token lifetime and secret redaction;
- token digest projection and index safety;
- User/reset/session/version lineage;
- transaction, CAS, concurrency, replay, and failure rollback;
- old-JWT invalidation and legacy-JWT compatibility;
- Super Admin/invitation side effects;
- SMTP commit independence and stale callbacks;
- frontend URL/history/state/storage/cache/referrer leakage;
- public-route authorization and OpenAPI inventory;
- rate limiting/proxy assumptions;
- rollout order and rollback exposure.

Acceptance:

- All blocker and major findings are resolved and re-reviewed before Task 7.
- Any unresolved production proxy/provider prerequisite is reported as an external
  enablement blocker, not hidden by application fallback.

### Task 7 — Final verification

Owner: Verification runner.

Dependencies: resolved Task 6.

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

Also verify:

1. Local replica-set reset/concurrency tests actually ran rather than skipped.
2. Rendered interaction/accessibility matrix covers all approved page states at
   desktop, tablet, 320px mobile, safe-area, and reduced-motion settings.
3. A repository-wide diff search finds no raw reset tokens, private reset URLs,
   passwords/hashes, real emails, SMTP secrets, or provider payloads.
4. No new dependency or lockfile change exists unless separately justified and
   explicitly authorized.
5. No runtime artifacts, uploads, screenshots, caches, coverage, local databases, or
   build outputs are retained as deliverables.

Acceptance:

- Backend and frontend focused/full tests, typechecks, builds, rendered checks, and
  repository hygiene pass or every exact failure is reported.
- No lint success is claimed because this repository has no lint script.
- Final handoff names unrun external checks and confirms no deploy, production write,
  real email, commit, or push occurred.

## Parallel execution schedule

After Task 1 freezes ownership and the shared contract:

```text
Task 2A backend state/auth ---------\
Task 2B backend mail ---------------+--> Task 3 API/orchestration --> Task 4 backend races --\
Task 2C frontend recovery ----------/                                                 +--> Task 5
                                                                                      |
                                                                                      v
                                                                         Task 6 integrity review
                                                                                      |
                                                                                      v
                                                                         Task 7 verification
```

Safe parallel group: Tasks 2A, 2B, and 2C. They have disjoint ownership after the
primary integrator assigns any shared backend composition files exclusively to the
identity/reset writer. Tasks 3–7 are dependency-ordered and must not overlap in ways
that test a transient shared worktree.

## Acceptance-criteria traceability

| Specification acceptance criteria | Implemented by | Verified by |
|---|---|---|
| AC 1–3: eligibility, non-disclosure, disabled mail | Tasks 2A, 2B, 3 | Tasks 4, 6, 7 |
| AC 4–6: timing, entropy, supersession/concurrency | Tasks 2A, 2B, 3 | Tasks 4, 6, 7 |
| AC 7–10: atomic reset, JWT invalidation, races, rollback | Tasks 2A, 3 | Tasks 4, 6, 7 |
| AC 11–12: secrecy, public HTTP/OpenAPI/limiting | Tasks 2A–3 | Tasks 4–7 |
| AC 13–14: fragment safety, frontend states/accessibility | Task 2C | Tasks 5–7 |
| AC 15: mail delivery/notification paths | Tasks 2B, 3 | Tasks 4, 6, 7 |
| AC 16–18: compatibility, Super Admin effect, Mongo parity | Tasks 2A, 3 | Tasks 4, 6, 7 |
| AC 19: full verification | Tasks 5–7 | Task 7 |
| AC 20: external-action boundary | All owners | Primary final review |

## External enablement remaining after local implementation

The following are explicitly outside implementation and require later exact
authorization/evidence before production use:

1. Verify Render's trusted proxy/IP behavior or approve an edge rate limiter.
2. Confirm SendGrid/reset-mail click and open tracking are disabled.
3. Run one non-production end-to-end journey using a disposable real mailbox.
4. Approve deployment order: frontend routes first, backend reset APIs second.
5. Separately approve any production migration or live action if later found
   necessary; the approved design currently requires no User backfill.

