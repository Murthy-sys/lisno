# SendGrid Web API email transport design

**Date:** 2026-08-28
**Status:** Approved; locally implemented and verified
**Owner:** Lisno backend
**Requested outcome:** Send Lisno transactional email through Twilio SendGrid Web API v3 from the Node.js backend so Render Free does not depend on blocked SMTP ports.

## 1. Decision summary

Lisno will add a SendGrid Web API delivery provider for every existing external-email flow:

- staff invitations;
- password-reset links and password-changed notifications;
- Estimate publication email with its PDF attachment; and
- Design-plan review email with its uploaded attachments.

The backend will use Twilio SendGrid's official `@sendgrid/mail` Node.js package over HTTPS. Existing SMTP support will remain available as a rollback-compatible provider, but startup configuration must select exactly one provider. If both complete SendGrid and SMTP configurations are present, startup will fail closed instead of silently preferring one.

This is a transport migration only. Public API response contracts, delivery-state persistence, email wording, recipient selection, tokens, attachments, audit events, and frontend behavior will not change.

## 2. Current-state evidence

### User-visible behavior

- The deployed forgot-password endpoint returns the intended neutral `202` response.
- The newest production reset record first reported `SMTP_TIMEOUT` on port `587` and then `SMTP_AUTH_FAILED` after moving to port `2525`.
- Render documents that Free web services block outbound SMTP ports `25`, `465`, and `587`; SendGrid Web API sends through HTTPS instead.

### Traced execution path

- `backend/src/config/env.ts` accepts an all-or-nothing SMTP group and produces `MailDeliveryConfig.kind === "smtp"` or `"disabled"`.
- `backend/src/server.ts` creates four SMTP-specific mailers from that one configuration.
- `smtp-invitation-mailer.ts`, `smtp-password-reset-mailer.ts`, `smtp-estimate-mailer.ts`, and `smtp-design-plan-mailer.ts` build the existing message content.
- `smtp-transport.ts` owns SMTP connectivity, bounded failure classification, sender parsing, and HTML escaping.
- Service and persistence layers already distinguish `disabled`, queued, sent, and failed delivery without exposing the failure reason through public unauthenticated APIs.

### Source of truth

- Environment parsing in `backend/src/config/env.ts` is authoritative for provider selection and secrets.
- Existing mailer interfaces remain authoritative for each workflow.
- Existing database records and audit events remain authoritative for delivery attempts and outcomes.

### Confirmed root cause

The production environment needs a provider path that does not rely on outbound SMTP. The current backend has no SendGrid Web API provider, so adding `SENDGRID_API_KEY` alone cannot change delivery behavior.

### Current test coverage and gaps

Existing tests cover SMTP configuration completeness, mail content and attachments, SMTP timeouts, bounded error codes, secret redaction, server provider wiring, and service delivery state. There is no SendGrid Web API configuration, request-shape, HTTP-status mapping, or server-selection coverage.

## 3. Goal, scope, and non-goals

### Goal

With a valid SendGrid API key and verified sender configured in Render, every existing Lisno email flow can submit its message to SendGrid through Web API v3 and record a safe provider-acceptance outcome without using an SMTP port.

### In scope

- Add SendGrid Web API environment parsing and fail-closed provider selection.
- Add the official `@sendgrid/mail` backend dependency and lockfile update.
- Add a shared SendGrid transport boundary with a finite timeout and bounded error taxonomy.
- Add SendGrid implementations for all four existing mailer interfaces.
- Preserve current subjects, text/HTML bodies, trusted frontend URLs, recipients, and byte-only attachments.
- Wire the chosen provider at server startup.
- Update `.env.example` with safe Render configuration guidance.
- Add focused and regression tests without contacting SendGrid.

### Non-goals

- No frontend changes.
- No public API, OpenAPI, authorization, or route changes.
- No database schema, index, backfill, or migration.
- No change to token issuance, expiry, hashing, eligibility, enumeration resistance, audit lineage, or retry semantics.
- No SendGrid Event Webhook, inbox-delivered/opened/bounced tracking, templates, marketing email, scheduled sending, or domain-authentication automation.
- No automatic production deployment, environment mutation, real email, key creation/rotation, commit, or push.
- No removal of SMTP or Nodemailer in this change.

## 4. Requirements and invariants

### 4.1 Provider configuration

The environment may select one of three states:

1. **Disabled:** neither provider group is present.
2. **SMTP:** the existing complete SMTP group is present and the SendGrid group is absent.
3. **SendGrid Web API:** the complete SendGrid group is present and the SMTP group is absent.

SendGrid Web API configuration is:

```text
PUBLIC_FRONTEND_URL=https://lisno-1.onrender.com
SENDGRID_API_KEY=SG.<secret>
SENDGRID_FROM=Lisno <verified-sender@example.com>
SENDGRID_DELIVERY_TIMEOUT_SECONDS=120   # optional; 30-600, default 120
```

Rules:

- `SENDGRID_API_KEY` and `SENDGRID_FROM` are an all-or-nothing group with `PUBLIC_FRONTEND_URL`.
- A supplied key must be non-empty and contain no control characters; its value is never logged, persisted, serialized, or returned.
- `SENDGRID_FROM` must parse as exactly one valid mailbox.
- `PUBLIC_FRONTEND_URL` remains an HTTP(S) origin without credentials, path, query, or fragment; production still requires HTTPS under the established remote-environment rule.
- Any simultaneous SendGrid and SMTP configuration is invalid, even if both groups are complete.
- An incomplete or ambiguous provider configuration fails startup before listening for requests.

### 4.2 SendGrid transport

- Use the official `@sendgrid/mail` Node.js library against SendGrid Web API v3.
- Configure the API key once inside an isolated transport instance/boundary; do not place it in message objects.
- Use a finite request timeout derived from `SENDGRID_DELIVERY_TIMEOUT_SECONDS`.
- Treat SendGrid HTTP `202` as provider acceptance.
- Do not treat `202` as proof that Gmail or another mailbox provider delivered the message to an inbox; the existing `sent` database state continues to mean accepted by the configured external provider.
- Never retry automatically inside the transport. Existing workflow-level retry/idempotency behavior remains authoritative.
- Never log or persist provider response bodies, headers, request bodies, recipient lists, tokens, attachment bytes, or credentials.

### 4.3 Bounded SendGrid failure taxonomy

Only bounded codes of at most 64 uppercase characters may cross the transport boundary:

- `SENDGRID_AUTH_FAILED` for HTTP 401;
- `SENDGRID_FORBIDDEN` for HTTP 403;
- `SENDGRID_RATE_LIMITED` for HTTP 429;
- `SENDGRID_REQUEST_REJECTED` for other HTTP 4xx responses;
- `SENDGRID_UNAVAILABLE` for HTTP 5xx responses;
- `SENDGRID_TIMEOUT` for the configured wall-clock timeout;
- `SENDGRID_CONNECTION_FAILED` for bounded network/DNS/TLS connection codes; and
- `SENDGRID_DELIVERY_FAILED` for every unrecognized failure.

Classification may inspect only structured status/error codes. Provider messages and response bodies are untrusted and must be discarded. Arbitrary or malformed errors always collapse to `SENDGRID_DELIVERY_FAILED`.

### 4.4 Message compatibility

- Invitation and password-reset URLs retain fragment-only secret tokens and the configured frontend origin.
- HTML continues to escape all user-controlled display values.
- Plain text and HTML variants remain present.
- Sender and recipient names/addresses remain explicit mailbox objects.
- Estimate delivery includes exactly one in-memory PDF attachment.
- Design-plan delivery includes exactly the already-approved in-memory attachments in their existing order, filename, and MIME type.
- SendGrid attachments are base64-encoded from the existing bytes; no file path or remote URL may be passed to the SDK.
- Password-reset emails have no attachments. Password-changed notifications contain no reset token or reset link.
- Existing email subjects and human-readable content remain unchanged unless the SendGrid SDK requires a purely structural representation change.

### 4.5 Workflow, persistence, and public behavior

- Existing unauthenticated password-reset request behavior remains neutral and asynchronous (`202`).
- Invitation preflight/no-write invariants remain unchanged.
- Estimate publication and Design-plan submission remain committed independently from external delivery, with the existing stored failure and retry behavior.
- Existing delivery status, timestamps, attempt counters, audit actions, and version/CAS behavior remain unchanged.
- Historical SMTP failure codes remain valid; no data rewrite is required.
- A SendGrid failure code is stored only in the same operator/audit surfaces that already accept bounded delivery failure codes and is never disclosed through public reset endpoints.

## 5. Data, API, authorization, and UX impact

### Data

No schema or index change. Existing `/^[A-Z0-9_]{1,64}$/` delivery-code constraints accept the new bounded codes.

### API

No route, request, response, status-code, or OpenAPI change.

### Authorization

No permission or identity change. Backend authorization remains authoritative for protected delivery and retry operations.

### UX

No frontend or copy change. The forgot-password confirmation remains deliberately neutral to prevent account enumeration and false inbox-delivery claims.

## 6. Options and tradeoffs

### Option A — Add SendGrid Web API while retaining SMTP fallback (recommended)

- Uses HTTPS on Render Free and satisfies the requested Node.js integration.
- Preserves an operational rollback path and existing SMTP tests.
- Requires explicit mutually exclusive configuration and additional provider-specific tests.
- Adds one official dependency but no production data migration.

### Option B — Remove SMTP and make SendGrid mandatory

- Produces a smaller provider surface after migration.
- Creates a breaking deployment/configuration change and removes the current rollback path.
- Expands the change beyond what is required to restore delivery, so it is not recommended now.

### Option C — Call `/v3/mail/send` with native `fetch`

- Avoids a dependency and provides direct AbortController control.
- Requires Lisno to maintain request types and provider compatibility that the official SDK already supplies.
- The user explicitly requested SendGrid's Node.js integration, so the official library is preferred.

## 7. Compatibility, rollout, and rollback

### Compatibility

- Code may deploy while existing complete SMTP variables remain; behavior stays SMTP.
- SendGrid becomes active only after the complete SendGrid group is supplied and the SMTP group is removed.
- Both groups present is a deliberate startup error, preventing an accidental or silent cutover.

### Rollout order

1. Deploy the verified code with current SMTP variables unchanged.
2. In Render, add `SENDGRID_API_KEY` and `SENDGRID_FROM`, preserve the correct `PUBLIC_FRONTEND_URL`, and remove all SMTP variables in the same environment update.
3. Redeploy the backend.
4. Submit one controlled password-reset request for an existing eligible account.
5. Confirm the newest reset record reaches `deliveryStatus: "sent"` with no failure code, then confirm the event in SendGrid Activity and the recipient inbox/spam folder.
6. Exercise invitation and attachment flows separately before treating the provider migration as fully operational.

### Rollback

Remove the SendGrid variables, restore the complete prior SMTP group, and redeploy the prior or current code. No database rollback is required. Failed records remain immutable operational history and are retried only through existing authorized retry/request flows.

### External authority boundary

Local implementation and mocked verification do not authorize installing production variables, deleting SMTP variables in Render, rotating the API key, deploying, or sending a real email. Those require the user's explicit action or later authorization for the exact environment.

## 8. Failure handling and observability

- Configuration errors fail startup with field-level validation that contains no secret value.
- SendGrid errors are reduced to the bounded taxonomy before entering workflow services.
- Existing password-reset delivery records and audit events expose safe delivery state to operators.
- No console logging may stringify SDK errors because they can contain response bodies and addresses.
- Test fixtures must use fabricated domains, tokens, keys, and attachment bytes.
- Event-webhook delivery/bounce observability is deferred; SendGrid Activity is the operational source for final provider processing during this rollout.

## 9. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| API key leakage through SDK exceptions or logs | Sanitize at the transport boundary; never serialize raw errors; regression-test hostile provider payloads. |
| Both SMTP and SendGrid variables remain during rollout | Fail startup on ambiguous provider configuration and document the atomic Render environment change. |
| Email content or attachments drift across providers | Preserve existing builders/fixtures and assert exact subjects, links, escaped content, and byte-only attachment encoding. |
| `202` is mistaken for inbox delivery | Define `sent` as provider acceptance and require SendGrid Activity/inbox verification operationally. |
| Timeout produces an ambiguous external outcome | Record `SENDGRID_TIMEOUT`, do not retry inside transport, and leave retries to existing idempotent workflow controls. |
| SendGrid key lacks Mail Send or sender verification | Map 401/403 safely and document the required key permission and verified sender. |
| Official SDK changes or ESM/type mismatch | Pin the installed version through `package-lock.json`, verify NodeNext typecheck/build, and mock the SDK in tests. |

## 10. Acceptance criteria

1. With only a valid complete SendGrid configuration, the backend starts and selects SendGrid Web API for all four mailer flows.
2. With only a valid complete SMTP configuration, existing SMTP behavior remains available.
3. With neither provider, email delivery remains disabled under current workflow rules.
4. With incomplete SendGrid variables or both provider groups, startup fails before binding a server and exposes no secret.
5. A mocked SendGrid `202` causes existing workflows to record their current successful external-delivery outcome.
6. Password reset and invitation messages retain trusted fragment-token URLs and escaped HTML without exposing secrets.
7. Estimate and Design-plan requests contain only in-memory, base64-encoded attachments with the existing filename, MIME type, bytes, order, and cardinality.
8. Structured 401, 403, 429, other 4xx, 5xx, timeout, recognized connection, and unknown errors map to the specified bounded codes.
9. Provider bodies, headers, API keys, recipients, reset/invitation tokens, and attachment content never appear in returned errors, stored failure codes, audit payloads, or logs.
10. No public API, authorization, persistence schema, frontend behavior, or historical record changes.
11. Focused mailer/config/server/service tests, backend typecheck, full backend test suite, build, and repository hygiene checks pass without contacting SendGrid.
12. No deployment, production environment mutation, real email, commit, or push occurs as part of local implementation.

## 11. Assumptions and constraints

- The SendGrid account has an active API key with Mail Send permission.
- `SENDGRID_FROM` exactly matches a verified SendGrid sender.
- Render Free permits outbound HTTPS to `api.sendgrid.com:443`.
- The existing attachment sizes fit SendGrid's accepted request limits; provider rejection remains a bounded failure rather than an automatic content transformation.
- The official package remains `@sendgrid/mail`, documented by Twilio SendGrid as the Node.js package for sending mail through Web API v3.
- Repository NodeNext ESM conventions and `.js` suffixes on relative TypeScript imports remain mandatory.

## 12. Open decisions

No material product decision remains. The recommended compatibility approach—add SendGrid Web API, retain SMTP rollback, reject simultaneous provider configuration—best matches the current architecture and the user's request.

## 13. References

- Render Free service SMTP limitation: <https://render.com/docs/free>
- Official Twilio SendGrid Node.js library: <https://github.com/sendgrid/sendgrid-nodejs>
- SendGrid Web API versus SMTP: <https://sendgrid.com/en-us/blog/web-api-or-smtp-relay-how-should-you-send-your-mail>
