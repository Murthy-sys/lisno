# SendGrid Web API email transport task plan

**Date:** 2026-08-28
**Status:** Approved; implementation verified
**Approved specification:** [SendGrid Web API email transport design](../specs/2026-08-28-sendgrid-web-api-email-transport-design.md)

## 1. Outcome

Add an HTTPS-based Twilio SendGrid Web API v3 provider to the Lisno Node.js backend for invitations, password-reset emails, Estimate PDFs, and Design-plan attachments while retaining SMTP as a mutually exclusive rollback provider. Preserve every public API, workflow, persistence, audit, token, recipient, attachment, and frontend contract from the approved specification.

## 2. Acceptance-criteria traceability

| Spec criterion | Planned verification |
| --- | --- |
| AC1 SendGrid-only configuration starts and serves all four mailer flows | Config, server-wiring, and four mailer unit tests |
| AC2 SMTP-only configuration remains supported | Existing config/server/SMTP mailer tests plus full suite |
| AC3 no provider remains disabled | Config and server tests |
| AC4 incomplete or dual-provider config fails safely | Table-driven config tests and secret-redaction assertions |
| AC5 mocked SendGrid 202 records existing success outcomes | Mailer tests plus existing service tests with SendGrid adapter fixtures |
| AC6 invitation/reset URLs and HTML remain safe | Exact content, fragment-token, and escaping assertions |
| AC7 Estimate/Design attachments preserve byte-only content | Base64 decode, order, filename, MIME type, and cardinality assertions |
| AC8 bounded HTTP/network error mapping | Table-driven SendGrid transport tests |
| AC9 no secrets/provider payloads leak | Hostile error fixtures, serialization/log-capture tests, repository/audit assertions |
| AC10 no public contract/schema/frontend changes | Diff inspection and existing route/service/model suites |
| AC11 required backend verification passes | Focused tests, typecheck, full suite, build, diff check, status inspection |
| AC12 no external actions | Final handoff audit |

## 3. Ownership boundaries

### Primary agent

Owns:

- approved contract interpretation and integration decisions;
- specification and this task-plan file;
- initial dirty-baseline capture and target-diff inspection;
- shared-contract review before parallel writers start;
- final reconciliation and scope/secret inspection;
- no product implementation files while an assigned writer owns them.

### Shared transport/config writer

Owns only:

- `backend/package.json`
- `backend/package-lock.json`
- `backend/.env.example`
- `backend/src/config/env.ts`
- `backend/src/services/smtp-transport.ts` (failure-code union only)
- `backend/src/services/sendgrid-transport.ts` (new)
- `backend/tests/config.test.ts`
- `backend/tests/sendgrid-transport.test.ts` (new)

It must not edit server wiring or any provider-specific mailer file.

### Invitation/password-reset writer

Owns only:

- `backend/src/services/sendgrid-invitation-mailer.ts` (new)
- `backend/src/services/sendgrid-password-reset-mailer.ts` (new)
- `backend/tests/sendgrid-invitation-mailer.test.ts` (new)
- `backend/tests/sendgrid-password-reset-mailer.test.ts` (new)

It consumes the settled SendGrid transport/config contract and must not edit that shared contract, existing SMTP files, workflow services, or server wiring.

### Estimate/Design-plan writer

Owns only:

- `backend/src/services/sendgrid-estimate-mailer.ts` (new)
- `backend/src/services/sendgrid-design-plan-mailer.ts` (new)
- `backend/tests/sendgrid-estimate-mailer.test.ts` (new)
- `backend/tests/sendgrid-design-plan-mailer.test.ts` (new)

It consumes the settled SendGrid transport/config contract and must not edit that shared contract, existing SMTP files, workflow services, or server wiring.

### Server-integration writer

Owns only after all four SendGrid mailer constructors exist:

- `backend/src/server.ts`
- `backend/tests/server.test.ts`

It must not modify environment parsing, transports, mail content, workflow services, persistence, or public routes.

### Reviewers

- `integrity_reviewer`: read-only review of the integrated diff after all writers finish.
- `verification_runner`: final exact checks on the integrated worktree after confirmed review findings are resolved.

All writers are working in a shared worktree, are not alone in the repository, must preserve unrelated changes, and must not revert or reformat files outside their explicit ownership.

## 4. Dependency-ordered task graph

### Task 0 — Capture and protect the baseline

**Owner:** Primary agent
**Dependencies:** Approved plan and execution-mode selection
**Affected area:** Read-only repository inspection

Steps:

1. Capture `git status --short` and the diff for every planned target.
2. Confirm the approved spec and plan are the only expected planning changes.
3. Identify any newly dirty target before assigning ownership; stop if ownership cannot be established safely.
4. Record existing dependency versions and test baselines relevant to email.

Verification:

- Baseline and target diffs recorded before any implementation writer starts.
- No unrelated dirty file is assigned or overwritten.

Stop/report condition:

- A target has pre-existing behavior changes whose owner or intent is unknown.

### Task 1 — Establish SendGrid dependency, configuration, and transport contract

**Owner:** Shared transport/config writer
**Dependencies:** Task 0
**Acceptance criteria:** AC1-AC4, AC8, AC9, AC11

Steps:

1. Install the pinned official `@sendgrid/mail` dependency, updating only the backend package manifest and lockfile.
2. Extend `MailDeliveryConfig` with `kind: "sendgrid_web_api"` and the approved public frontend URL, API key, sender, and timeout fields while preserving `disabled` and `smtp`.
3. Extend environment validation for complete SendGrid configuration, sender parsing, safe key validation, timeout bounds, and mutual exclusion with SMTP.
4. Add `.env.example` documentation for provider selection and atomic Render cutover without real values.
5. Implement an isolated SendGrid transport boundary that configures the SDK, applies the finite timeout, treats HTTP 202 as acceptance, and maps only structured codes into the approved taxonomy.
6. Extend the existing shared `MailDeliveryError` closed union with the approved SendGrid codes so current `instanceof`-based workflow handling preserves them; do not otherwise change SMTP behavior.
7. Ensure raw SDK errors, response bodies/headers, request payloads, API keys, recipients, tokens, and attachments never escape the transport boundary.

Focused tests:

- SendGrid-only, SMTP-only, disabled, incomplete, dual-provider, invalid sender, invalid timeout, and secret-redaction environment cases.
- 202, 401, 403, 429, other 4xx, 5xx, timeout, recognized connection, arbitrary value, and hostile provider-payload transport cases.
- SDK initialization receives the configured key without serializing it into returned values or logs.

Commands:

```bash
cd backend
npm test -- tests/config.test.ts tests/sendgrid-transport.test.ts
npm run typecheck
```

Stop/report conditions:

- The official SDK cannot provide the required bounded timeout without a safe adapter.
- The dependency introduces an unresolved NodeNext ESM/type incompatibility.
- Error sanitization would require retaining provider response content.

### Task 2 — Implement invitation and password-reset SendGrid mailers

**Owner:** Invitation/password-reset writer
**Dependencies:** Task 1 contract settled
**Acceptance criteria:** AC1, AC5, AC6, AC8-AC11

Steps:

1. Implement the invitation SendGrid adapter using the existing invitation mailer interface and exact current message content.
2. Implement reset-link and password-changed SendGrid methods using the existing password-reset mailer interface and exact current content.
3. Preserve explicit sender/recipient mailboxes, escaped HTML, plain text, trusted fragment-token URLs, expiry text, and no-attachment behavior.
4. Convert bounded transport failures to the existing service-recognized delivery error type without exposing provider details.

Focused tests:

- Mocked SDK/transport acceptance and failure paths.
- Exact subjects, text, HTML, sender, recipient, and trusted URLs.
- Hostile names and expiry values remain escaped.
- Reset link and invitation tokens are fragment-only and never present in returned/logged errors.
- Password-changed message has no token, link, or attachment.

Commands:

```bash
cd backend
npm test -- tests/sendgrid-invitation-mailer.test.ts tests/sendgrid-password-reset-mailer.test.ts tests/user-invitation-mailer.test.ts tests/password-reset-mailer.test.ts tests/password-reset.test.ts
npm run typecheck
```

Stop/report condition:

- Implementing the provider would change token, recipient, preflight, or public-reset semantics.

### Task 3 — Implement Estimate and Design-plan SendGrid mailers

**Owner:** Estimate/Design-plan writer
**Dependencies:** Task 1 contract settled
**Acceptance criteria:** AC1, AC5, AC7-AC11

Steps:

1. Implement the Estimate SendGrid adapter using the existing Estimate mailer interface and exact current message content.
2. Implement the Design-plan SendGrid adapter using the existing Design-plan mailer interface and exact current content.
3. Transform only existing in-memory attachment bytes to SendGrid base64 content; preserve filename, MIME type, order, and count.
4. Preserve portal URL trust, escaped content, and the existing `sent`/bounded-failure result contracts.

Focused tests:

- Mocked acceptance and bounded failure results.
- Exact Estimate total/version/portal content.
- Exactly one PDF for Estimate delivery.
- Exact Design attachment order and cardinality for one and multiple attachments.
- Base64 round trip equals the original bytes; no attachment path, URL, or stream reference.
- Hostile provider responses, filenames, recipients, and attachment content never appear in error results or logs.

Commands:

```bash
cd backend
npm test -- tests/sendgrid-estimate-mailer.test.ts tests/sendgrid-design-plan-mailer.test.ts tests/estimate-mailer.test.ts tests/estimate-delivery.test.ts tests/project-workflow.test.ts
npm run typecheck
```

Stop/report condition:

- The provider requires changing approved attachment storage, source, content, or workflow commit semantics.

### Parallelization gate

Tasks 2 and 3 may run in parallel only after Task 1 has completed, its exported contract has been reviewed by the primary agent, and both writers acknowledge their non-overlapping file ownership. They must not change shared transport/config files or each other's mailers/tests.

Task 4 cannot begin until Tasks 2 and 3 both finish because server imports all four constructors.

### Task 4 — Wire provider selection into server startup

**Owner:** Server-integration writer
**Dependencies:** Tasks 1-3 complete
**Acceptance criteria:** AC1-AC5, AC9-AC11

Steps:

1. Import the four SendGrid mailer constructors.
2. Select disabled, SMTP, or SendGrid implementations from the validated `MailDeliveryConfig` without reading raw environment variables again.
3. Derive the Client portal URL from either enabled provider's trusted frontend origin.
4. Preserve connection/index startup ordering and shutdown behavior.
5. Add server tests for all three provider states and secret-safe construction failures.

Focused tests:

- SendGrid selects all four SendGrid mailers exactly once with the validated config.
- SMTP continues selecting all four SMTP mailers.
- Disabled selects no external mailer.
- Startup errors contain no API key, SMTP password, sender, recipient, or provider body.

Commands:

```bash
cd backend
npm test -- tests/server.test.ts tests/config.test.ts
npm run typecheck
```

Stop/report condition:

- Provider wiring would require changing app dependencies, protected route behavior, or public API contracts beyond constructor selection.

### Task 5 — Integrate and run focused cross-flow verification

**Owner:** Primary agent
**Dependencies:** Tasks 1-4 complete
**Acceptance criteria:** All

Steps:

1. Reconcile imports, exported error types, configuration discriminants, and failure-code handling across all writers.
2. Inspect the integrated diff for duplication, accidental SMTP regression, unsafe SDK error handling, secrets, real addresses, or unrelated changes.
3. Run all focused SendGrid, SMTP, config, server, invitation, reset, Estimate-delivery, and Design workflow tests sequentially if shared process resources could contend.
4. Resolve only confirmed in-scope integration issues within established file ownership.

Focused command target:

```bash
cd backend
npm test -- \
  tests/config.test.ts \
  tests/sendgrid-transport.test.ts \
  tests/sendgrid-invitation-mailer.test.ts \
  tests/sendgrid-password-reset-mailer.test.ts \
  tests/sendgrid-estimate-mailer.test.ts \
  tests/sendgrid-design-plan-mailer.test.ts \
  tests/server.test.ts \
  tests/user-invitation-mailer.test.ts \
  tests/password-reset-mailer.test.ts \
  tests/password-reset.test.ts \
  tests/estimate-mailer.test.ts \
  tests/estimate-delivery.test.ts \
  tests/project-workflow.test.ts
npm run typecheck
```

Stop/report condition:

- Any change violates the approved public, workflow, persistence, attachment, or secret-handling contract.

### Task 6 — Integrity review

**Owner:** `integrity_reviewer`
**Dependencies:** Task 5 complete; no writer still active
**Acceptance criteria:** All invariants

Review questions:

- Does provider selection fail closed for incomplete/dual configurations?
- Can any API key, token, email, attachment, SDK body/header, or raw error escape through logging, serialization, audit, persistence, or HTTP?
- Are `202` and `sent` treated as provider acceptance rather than inbox delivery?
- Are invitation preflight, reset enumeration resistance, Estimate publication independence, Design-plan independence, retry/idempotency, audit, and CAS behavior unchanged?
- Are all attachment bytes, order, names, MIME types, and trusted URLs preserved?
- Does SMTP remain a functional rollback path?
- Are dependency and lockfile changes limited to the required official package?

Output:

- Findings classified as blocker, major, minor, or clean with exact file/line evidence.
- No source edits.

### Task 7 — Final verification

**Owner:** `verification_runner`
**Dependencies:** Task 6 complete and confirmed findings resolved
**Acceptance criteria:** AC11-AC12 and regression confidence for all others

Commands:

```bash
cd backend
npm run typecheck
npm test
npm run build
cd ..
git diff --check
git status --short
```

Additional inspections:

- Confirm no frontend, OCR, route, OpenAPI, model, migration, seed, upload, or production file changed outside approved scope.
- Confirm no real secret, user email, token, provider body, build output, coverage, or runtime artifact entered the diff.
- Confirm tests made no external SendGrid request and sent no real email.
- Confirm no deployment, Render mutation, SendGrid key operation, database mutation, commit, or push occurred.

Output:

- Exact commands, exit status, file/test counts, warnings, unrun checks, and remaining external verification requirements.

## 5. Verification matrix

| Area | Fixture/method | Expected result | Environment dependency |
| --- | --- | --- | --- |
| Config selection | fabricated complete/incomplete/dual env maps | one provider or safe validation error | none |
| Error taxonomy | fabricated SDK errors with hostile bodies/headers | bounded code only | none |
| Invitation/reset | fabricated users, tokens, expiry values | exact safe content and 202-compatible workflow | none |
| Estimate attachment | unequal PDF fixture bytes and hostile metadata | exact base64 round trip and one attachment | none |
| Design attachments | two unequal byte fixtures in fixed order | exact order/count/content | none |
| SMTP compatibility | existing fake/trickling SMTP fixtures | unchanged pass result | local temporary sockets for existing tests |
| Persistence/workflow | existing in-memory and replica-set service tests | unchanged delivery state/audit/CAS behavior | temporary Mongo replica set for full suite |
| NodeNext/build | backend typecheck and production build | no ESM/type error | installed dependencies |
| Real SendGrid acceptance | post-deployment controlled request | newest record `sent`, SendGrid Activity event | explicitly deferred; requires Render and SendGrid production access |

## 6. External actions explicitly excluded

This plan does not authorize:

- creating, viewing, rotating, copying, or deleting a real SendGrid API key;
- changing Render environment variables or removing SMTP variables;
- deploying or restarting production;
- sending a test or customer email;
- mutating MongoDB;
- running a seed, migration, or backfill;
- committing or pushing repository changes.

Those actions remain separate, exact-target authority gates after local implementation and verification.
