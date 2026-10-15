# Ask Lisno across web and mobile

## Goal and authority
Add private Ask Lisno to the native Client experience and repair repeated failures in Ask Lisno and Project Messages AI on both platforms. Standing autonomous Mode A applies. Preserve the existing mobile dock, theme and human chat. No deployment, production mutation or customer communication is authorized.

## Current evidence
- Both surfaces use the same backend Gemini adapter. Two synthetic live questions on 2026-10-15 returned HTTP503 UNAVAILABLE; model metadata returned200 and generation support. Local configuration is enabled with a configured key (no secrets retained in evidence).
- The adapter fails immediately on a transient provider response; private Ask Lisno has no retry, while the leased project worker has one later retry.
- Valid split text parts and tool-call prefaces are rejected by the adapter. Allowed long private history can exceed the complete provider payload bound once instructions/schema are included.
- Mobile has existing ask_lisno.request authorization but no private Ask Lisno screen. Mobile chat lacks pending-assistant fallback polling after SSE disconnects; web has10second fallback polling.
- Web treats every429 as exhausted quota, and assistant result GET has no transient retry. Existing privacy, source validation, version/idempotency and human-message preservation are established contracts.

## Scope and behavior
1. Client-only native Ask Lisno entry on Projects/home and project detail, plus authorized More destination, using a dedicated native conversation workspace. Preserve current root tabs and original dock exactly. Support text questions, quick prompts, contextual project IDs, project clarification/list paging, verified facts and quotation/approximate selling totals using the existing API. No internal costs or vendor rates. Conversation is temporary, private and cleared on identity/environment changes; it does not post group messages.
2. Shared provider retries only transient transport/429/5xx failures within existing attempt, token, payload and deadline budgets. Preserve each tool step and every usage reservation; never retry nontransient denial/configuration/refusal/validation failures blindly. Accept valid native part segmentation and tool preface without publishing unchecked text. Retain all source/price/narrative validation and signed tool history.
3. Trim optional oldest history to fit the actual full provider request while preserving the current question. Never remove current tool evidence or alter project binding to make payload fit. Reject a still-oversized single turn explicitly.
4. Web/mobile retain failed question and offer useful retry/contact-team actions with distinct busy, timeout, unavailable and limit messages. Private POST is never blindly retried by a frontend. Shared server retry stays within one admitted request. Assistant result reads may retry once on transient network/server errors; no permission retry or stale commercial display.
5. Mobile refreshes pending AI state with bounded foreground polling when necessary, stopping for terminal states, denial, offline/background, unmount and identity changes. Existing SSE and manual refresh remain functional.

## Contracts and invariants
No new backend route, permission, persistence schema or financial formula. Existing private request/response and chat run/result contracts remain authoritative. No new client idempotency field is invented for private requests. Public group request retains its existing stable idempotency key. Backend authorizes source project and session at read and publication; financial amounts are integer paise and only server-provided selling values render. Provider outage cannot be guaranteed away; exhaustion must be honest and recoverable, never fabricated success.

## Acceptance
AC1: Authorized Client can open and use Ask Lisno from native home, project and More; other roles cannot; original dock unchanged.
AC2: Native private successful answer, project choice/list paging, failed/retry, cancellation, late response, session/access loss and malformed response paths are covered.
AC3: Transient provider failure then recovery works for both private and group service paths; retries are bounded, accounted and abortable. Nontransient failures stop.
AC4: Valid multipart output and prefaces work; invalid/untrusted output remains rejected; long optional history fits without losing latest question or authorized scope.
AC5: Web/mobile show useful recoverable status and mobile pending results recover without SSE; no stale/private result leakage.
AC6: Focused regressions, cross-workspace typecheck/build/export and proportionate broader tests pass, rendered web/native checks performed where available, external limitations disclosed.

## Risks and non-goals
Main risks are retry cost amplification, long-running client timeout, private history leakage and stale result polling. Bound each explicitly. Do not add alternate provider/model, disable protections, change approval workflows, send real chat messages, alter production settings, or change mobile navigation styling. No dependencies expected.
