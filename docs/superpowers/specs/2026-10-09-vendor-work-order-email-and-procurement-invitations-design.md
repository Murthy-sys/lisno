# Work-order email delivery and Procurement vendor invitations

Date: 2026-10-09
Status: Approved in the conversation on 2026-10-09. Related task plan approved and Mode A selected. Live email and deployment remain outside local implementation.

## Goal

Deliver the two requested behaviors: issuing a vendor work order automatically triggers the appropriate login/setup email, and Procurement can explicitly send or resend a vendor login invitation. Delivery and account activation must have separate, truthful statuses.

This is a focused amendment to the approved [vendor execution specification](2026-10-08-vendor-execution-tracker-design.md). It changes that specification's onboarding rollout default and adds a purpose-specific Procurement invitation capability. Daily reminders, execution reporting, Site Manager verification, and financial workflows remain as implemented.

## Current behavior and evidence

Inspected the current working tree, including the uncommitted execution implementation. These findings describe local code; the deployed environment and real mail-provider delivery have not been inspected.

1. `backend/src/config/env.ts:86` defaults `VENDOR_ACCESS_DELIVERY_ENABLED` to `false`. `server.ts` passes the boolean to `app.ts`; `startExecutionDelivery()` starts the onboarding dispatcher only when enabled. The flag is absent from `backend/.env.example`. A configured mail provider therefore does not by itself enable work-order emails.
2. The shared `issuedVendorWork` hook in `backend/src/app.ts` transactionally creates assignments, execution state, and an access intent for all three issuance families. Issuance itself never dispatches mail. The onboarding worker polls every 30 seconds when started. Disabled startup leaves requests queued, with no processing attempt or corresponding unavailable status.
3. `vendor-work-onboarding.service.ts` already supports new-account invitations, notifications to existing bound accounts, source validation, provider failure state, leases, and bounded retries. Its public `retry` action rejects queued, cancelled, and sent requests. Calling retry only requeues a request; it cannot start a disabled dispatcher.
4. `frontend/src/features/execution/VendorAccessPanel.tsx` exposes only **Retry email** for failed/unavailable/intervention states. There is no **Send invitation** action for an initial queued request or **Resend invitation** for setup-pending sent mail. `ProcurementProjectPage.tsx` mounts this panel at project level.
5. Procurement's vendor directory/detail does not expose login invitation management. Existing work-order invitation authority requires current issued work; it cannot be repurposed to invite a vendor before its first order. General invitation management is Super Admin-only.
6. Existing regression tests call the onboarding processor directly. They cover identity and retry safety but do not prove that normal server startup plus work-order issuance triggers the worker under default mail-enabled configuration.

Confirmed code cause: automatic delivery is opt-in and defaults off. Confirmed UX gap: no direct Procurement login invitation action. Additional runtime causes such as missing provider configuration or invalid vendor contact remain possible and must be surfaced rather than guessed.

## Recommended approach and tradeoffs

**Recommended:** extend the existing durable onboarding/invitation services. Automatically dispatch new issued-work intents when a mail provider is configured, retain an explicit operational pause, and provide narrowly authorized manual send/resend actions. Reuse account binding, token acceptance, delivery adapters, leases, and audit history.

An environment-only change would start the worker but leave initial-send/resend UX absent and could release an old queued backlog. It does not satisfy both requirements. Sending directly inside the issuing transaction would couple order success to the external provider and risk duplicate mail on transaction retries; retain commit-independent delivery instead.

## Scope and assumptions

- Manual action location: **Procurement → Vendors → vendor details**, also reachable from the issued work order's vendor access controls. This specification assumes Procurement may invite an eligible active vendor before its first work order; no project assignment is created by that invitation.
- Use the vendor's saved representative name, email, and mobile. The invitation action cannot accept an arbitrary destination, role, or vendor binding. Unsaved profile edits must be saved before sending.
- Reuse current vendor activation/readiness rules. Inactive, archived, ambiguous, or otherwise ineligible vendors show the specific corrective action.
- A current vendor account remains bound to its stable vendor ID. Names and email labels are not join keys. Existing passwords, roles, and account bindings are not reset or reassigned.
- No bulk invitations, automatic legacy backfill, reminder-schedule change, provider replacement, new dependency, deployment, environment secret edit, or real customer communication is included in local implementation.

## Required behavior

### Automatic email on work-order issuance

1. Every successful issuance path records one logical delivery intent per order/vendor/approved revision within the issuance transaction. Rollback and idempotent issuance replay cannot generate extra logical mail.
2. With usable configured mail and no explicit pause, newly issued work is eligible for automatic processing without an additional undocumented opt-in. Wake processing after commit and retain bounded polling/recovery. Local fake-provider tests must observe dispatch within five seconds of a successful issuance response; provider acceptance and inbox arrival are separate timings.
3. A new vendor receives the existing secure, expiring, single-use password setup invitation. An active bound account receives an issued-work notification with an authenticated login/work destination, without password reset.
4. Automatic issuance may reuse a valid pending setup invitation instead of rotating its token. It still communicates new work through the appropriate existing notification path. Concurrent orders and manual sends must share recipient/vendor coordination.
5. An explicit `VENDOR_ACCESS_DELIVERY_ENABLED=false` remains a deliberate pause and is visibly reported. Omission uses mail readiness for normal automatic behavior. Missing/disabled mail is visibly unavailable. Daily reminder enablement remains independent.
6. Persist source eligibility so changing this default cannot silently dispatch legacy queued requests or orders issued while delivery was paused/unavailable. Those records require an explicit scoped send/retry. No read request, deployment, or worker restart grants eligibility to historical work.
7. Work-order issuance commits independently of delivery. A mail error leaves the order issued and exposes a safe failure reason and available recovery action. Never report provider acceptance merely because an intent was saved.

### Manual invitation from Procurement

1. Show a compact **Vendor login access** section in vendor details with current account/setup state, saved recipient, latest delivery status/time, and a primary action derived by the backend.
2. **Send invitation** is available to an authorized actor for an eligible vendor without an active account or pending setup. It works before the first work order under a new, explicitly tagged Procurement vendor-invitation authority.
3. **Resend invitation** is available for a compatible setup-pending, expired, or failed invitation, subject to cooldown, version checks, and in-flight protection. Explicit resend may issue a new token generation and invalidate the previous one. Never silently take ownership of a Super Admin-managed or incompatible invitation; expose a staff-action state instead.
4. If the account is already active, show **Account active** and suppress password setup actions. Issued-order context may offer **Send work notification** with the correct label. The feature does not create a general account/password administration surface.
5. Existing issued orders without an access intent can be manually onboarded from their current approved source through an authorized write. Do not invent a revision, issue the order again, or create records during reads.
6. Manual actions are dispatch requests, not another dead-end requeue. The same effective delivery configuration applies to automatic and manual paths. An explicit pause or unavailable provider blocks manual sending with an actionable message before any invitation/token/audit/email-job write.
7. A success message says **Email queued** while pending and **Email sent** only after provider acceptance. Password setup remains pending until invitation acceptance. Sending/failed/unavailable/paused/contact-conflict states remain visible after refresh.
8. Keep controls compact, keyboard accessible, and usable at desktop and 390/320-pixel mobile widths. Reuse established buttons/panels; no visual redesign or icon dependency is needed. Disable duplicate clicks and preserve a command's idempotency key during uncertain retries.

## Permissions and identity invariants

| Actor | Allowed actions |
| --- | --- |
| Procurement with vendor-directory access and the new vendor-access operation | Read login status and send/resend for eligible vendors available to that directory operation; issued-order actions additionally require current project access. |
| Sole active Super Admin | Explicit corresponding vendor-access operations and existing Super Admin invitation administration. |
| Vendor, Client, Site Manager, Program Manager, other staff | No Procurement invitation-management permission; vendor accepts only its own valid setup token. |

- Add purpose-specific canonical read/manage operations instead of granting Procurement general `user_invitation` management. Synchronize route registry, backend authorization, frontend contract, runtime validation, and OpenAPI.
- The server creates authority tags. Clients cannot choose an authority kind, user role, account ID, alternate vendor, recipient, or project outside the addressed resource.
- Validate source/vendor eligibility and matching saved contact at create, resend, provider dispatch, inspection, and acceptance. Recheck active issuer authority for manual Procurement invitations using the established authorization coordination pattern. Existing work-order authority retains its source-based rules.
- Scope manual vendor invitations to a saved vendor ID and normalized email. Acceptance creates only that vendor account. Revocation, contact changes, duplicate bindings, another role using the email, or a disabled account cannot be resolved by silent rebinding.
- Retain email cooldowns, rate limits, CAS/version checks, idempotency receipts, lease expiry, bounded retries, and source coordination. Concurrent automatic/manual operations cannot create two live vendor accounts or uncontrolled competing token generations.

## Data, API, and side-effect impacts

- Extend delivery/read DTOs with safe readiness/pause reasons, account/setup status, available actions, and human-readable authorized vendor/order identity. Do not return private setup links, tokens, or provider diagnostics containing credentials.
- Extend invitation authority with an additive Procurement vendor source, including stable vendor/actor/contact lineage. Preserve historical Super Admin and work-order authority interpretation. Keep memory and Mongo repository contracts aligned.
- Add purpose-specific vendor-access read/send/resend operations in the Procurement route family; keep project/order delivery actions scoped to the current approved source. The separate task plan will settle exact endpoint shapes and file ownership.
- Add automatic/manual delivery eligibility metadata only where needed to distinguish new authorized sends from historical backlog. Existing sent history, issued snapshots, prices, execution status, and approval records are immutable.
- Persist logical intents and commit before external calls. Manual preflight failures produce zero token, invitation, invitation audit, or email-job writes. An automatic issuance can still record its durable business/access intent with paused/unavailable state independently of mail readiness.
- Manual send/resend audits identify the actual Procurement/Super Admin actor and vendor/order source. Avoid impersonating Super Admin or logging contact details, raw tokens, private URLs, and credentials.
- Invalidate/update vendor access detail, project/order access panels, and relevant administrative invitation views after mutations. Poll/refetch pending delivery until resolved; do not overwrite unrelated vendor edits.
- Keep provider transport at-least-once limitations explicit: an uncertain provider acknowledgement can require reconciliation after lease expiry. Do not claim exactly-once inbox delivery.

## Compatibility, rollout, and observability

- Additive schema/index changes must read old documents safely. No mass writes or migrations are performed during this task. Any necessary production index preparation is documented for a separately authorized rollout.
- Document effective onboarding behavior and the explicit pause flag in environment examples and operational notes. Do not change actual secrets or production environment settings during local work.
- Preserve old unsent intents without automatically releasing them. Provide a one-vendor/order manual path to recover the user's already-issued work.
- Log only safe worker startup/pause status and bounded delivery error codes. Expose effective readiness and last worker activity so Procurement does not wait on an indefinitely queued request with no explanation. Global operational details remain Super Admin-scoped.
- Stop/wake/restart behavior and recovery use the existing server lifecycle and dispatcher. Explicit pause is the delivery rollback; it does not undo orders/accounts or remove execution verification requirements.

## Acceptance criteria and verification

| ID | Required evidence |
| --- | --- |
| AC1 | Server lifecycle plus each issuance family dispatches newly issued work with configured fake mail and the flag omitted; no test-only manual processor call is needed. Explicit false pauses both sends and displays the reason. Disabled provider performs no invitation/token/audit/email-job writes. |
| AC2 | New vendor receives a valid setup invitation; existing bound vendor receives a work notification with unchanged password/binding. Valid pending setup, concurrent orders, contact changes, and email-role conflicts behave safely. |
| AC3 | Procurement can send before a first order from eligible vendor details, resend compatible pending/expired/failed setup, and recover an existing issued order. Another role/vendor/project, archived vendor, and stale or revoked authority are rejected without disclosure. |
| AC4 | Manual/automatic concurrency, duplicate clicks, replayed idempotency keys, stale versions, cooldown, provider failure, uncertain acknowledgement, restart, and invitation acceptance cannot duplicate account creation or bypass source checks. |
| AC5 | Enabling the new default cannot release a historical queued backlog or orders issued while paused. Explicit per-vendor/order recovery uses the original approved source and does not reissue or edit it. |
| AC6 | Rendered Procurement vendor and issued-order views show correct Send/Resend/Account active/Send work notification actions and pending/sent/failed/paused/unavailable states, with accessible focus/errors and no page overflow at desktop, 390, and 320 pixels. |
| AC7 | Backend/frontend authorization inventories, API contracts, memory/Mongo invitations, affected typechecks/builds, focused integration tests, and repository diff hygiene pass. Preserve unrelated baseline failures separately; no real emails are used in tests. |

Start with focused onboarding, server-startup, invitation authority, issuance, authorization, and rendered vendor-access regressions; use replica-set tests for changed transactional paths. Review the integrated identity/dispatch changes before final verification. The task plan is intentionally not created at this specification gate.

## Risks and open decisions

- Production credentials, provider acceptance, spam filtering, and deployed flag values are not verified by local code inspection. The handoff must distinguish local fake-provider success from live delivery.
- The largest compatibility risk is releasing previously queued mail when changing the default; the historical-eligibility rule is mandatory.
- Manual pre-order invitations extend authority beyond the original issued-work-only flow. This specification explicitly limits that capability to eligible saved vendors and purpose-specific Procurement operations.
- Proposed assumption for approval: manual invitations are available from vendor details before a first order, as well as issued-order context. No other product decision is required to prepare the task plan.
- Existing uncommitted execution work remains the baseline and must be preserved. Only this specification is written in the current gate.
