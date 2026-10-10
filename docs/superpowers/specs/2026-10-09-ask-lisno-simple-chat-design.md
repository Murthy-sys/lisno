# Simple Ask Lisno chat and Project messages adjustments

Date: 2026-10-09
Status: Approved by the user; implemented under the approved task plan in Mode A.

## Goal and scope

Make three bounded changes using the existing OpenAI integration:

1. Reduce the Project messages automatic AI eligibility delay from five minutes to two minutes when no human has replied.
2. Remove the explanatory and availability paragraphs underneath Lisno AI in Participants, retaining its name.
3. Make Ask Lisno a separate, immediate, simple Client support chat using the signed-in Client's information and authorized project information.

The user clarified that this should reuse existing functionality, with a target of 15 minutes for minimal implementation. Saved private conversation history, a new background workflow, and a new provider integration are outside this scope. Verification must remain truthful if a blocker prevents meeting the target.

This specification supersedes the earlier Project messages-only interpretation of Ask Lisno and the five-minute wait in `2026-10-09-project-messages-ai-assistant-design.md`. All other existing AI safety, source, pricing, and workflow rules remain applicable.

## Current behavior and evidence

- `backend/src/domain/project-chat-assistant.ts`: `ASSISTANT_DEFAULTS.waitMs` is `300_000`; `assistantEligibleAt` already handles explicit requests, missing owners, and staff-hour boundaries.
- `backend/src/services/project-assistant-runtime.ts`: durable Project message runs preserve reply suppression, source checks, coalescing, and retry limits. These must not be replaced for this UI change.
- `frontend/src/features/messages/ChatAssistantResult.tsx`: the waiting label explicitly says five minutes.
- `frontend/src/features/messages/ChatParticipants.tsx`: Lisno AI has two additional paragraphs, including the unavailable message the user wants removed.
- `frontend/src/features/estimates/AskLisnoLauncher.tsx`: Ask Lisno navigates to Project messages instead of opening its own chat.
- `backend/src/services/project-assistant-openai.ts`: a working provider adapter already generates validated, source-backed results through bounded read tools. The local provider connection was verified during the preceding task.
- `backend/src/services/project-assistant-sources.ts` and `project-assistant-context.ts`: existing readers validate active Client identity, session, project ownership, and source access. Reuse these boundaries; do not bypass them for the new surface.
- `backend/src/services/project.service.ts`: existing Client project discovery is scoped through `pageProjectsForUserInModule` and `toClientProject`.
- An API-key-looking value was found in tracked `backend/.env.example`. Remove that value from the template during implementation. Keep the actual key in ignored local `.env` or the deployment environment; never copy it into code, browser data, documentation, or tests. Rotation of the potentially exposed credential must be done by its owner, outside this implementation.

## Required behavior

### Project messages

- Use `120_000` milliseconds as the human-response wait. This is eligibility to begin answering, not a promise that provider generation finishes within two minutes.
- Preserve immediate handling outside staff hours, with no valid owner, and for an explicit AI request. Preserve immediate tagged alerts and human-reply cancellation.
- Pending, not-yet-started automatic waits should adopt the shorter deadline on normal runtime processing, using their original trigger time. Never extend an existing deadline, reset retries, or restart completed/suppressed runs. Coalesced questions retain the oldest wait anchor.
- Update waiting copy and focused timing tests. Do not modify unrelated five-minute message grouping or other timers.
- Participants shows the Lisno AI name without either explanatory paragraph, including the enabled-state counterpart. Actual request failures remain visible where the Client requests an answer.

### Ask Lisno

- The existing Client launcher opens a compact chat side panel without navigating to Project messages. Use existing dialog/drawer, form, and button primitives and established styling.
- Ask Lisno responds immediately on submission, subject to the existing provider latency and limits. The two-minute staff wait applies only to Project messages.
- Keep the conversation in memory for the current signed-in browser session. Closing and reopening may preserve it while the component remains mounted; refresh/sign-out clears it. No permanent conversation storage or new worker queue is required.
- Use the current project if it is authorized; otherwise allow the Client to select from their authorized projects. Keep each project's temporary conversation separate. Project-specific questions without a selected project ask for one rather than choosing an arbitrary project.
- Provide basic personal support from an allowlist of the current Client's display name and their own account contact information where relevant. Do not send the full User record to OpenAI. Clients with no projects can receive basic account/navigation help and an explicit no-project state.
- Reuse verified project status, timeline, execution progress, catalogue matching, recommendations, and approximate-addition pricing where the existing readers support them. Explain unsupported or missing information briefly, with a link to Project messages for human assistance.
- Label the panel `Ask Lisno` with a compact `Private AI chat` description. Questions and replies stay separate from Project messages. Opening a team-message link never automatically sends the private question.
- Provide concise pending, unavailable, retry, empty, and permission-denied states. Keep keyboard focus within the open panel, return focus on close, and avoid horizontal overflow on mobile. Do not add decorative cards, large spacing, or new animation/icon dependencies.

## Integration and invariants

Recommended approach: a small authenticated Client request/response endpoint and an in-memory frontend chat, reusing the provider adapter, result presentation, and current project readers. A persisted private thread with background processing would add unnecessary data and workflow changes and is deferred.

- Accept bounded text, bounded temporary conversational context, and an optional project ID. Derive the Client identity from authentication; never accept a caller-supplied owner or role.
- Treat all submitted history as untrusted context, never as evidence for project facts or prices. Re-read authoritative sources for each answer.
- Use explicit Client-only route authorization, canonical operation registry, OpenAPI, and frontend contract entries. Other Clients, staff, vendors, and Super Admin receive no access to a Client's private request by their role alone.
- Recheck active identity, session, project ownership, and source access before returning an answer. Reject substituted project IDs without disclosing their existence. Clear temporary UI data on account/session changes and access loss.
- The private endpoint must not call Project chat message publication, tagged routing, notification, email, task, estimate mutation, or approval paths. An answer cannot change business data.
- Reuse existing provider configuration, bounded tool calls, timeouts, output validation, and aggregate Client/project/deployment usage controls. Neither chat surface should bypass shared limits. Profile-only requests still consume Client and deployment limits without fabricating a project ID.
- Preserve integer-paise calculations, current Configuration lineage, immutable approved amounts, required/optional additions, and reported-versus-verified progress distinctions. No new pricing policy.
- Return source timestamps and structured customer-visible results. Never put internal margins, procurement costs, raw database records, secrets, or other users' information in responses or logs.
- No dependencies, production deployment, seed, live data migration, external mail, or key rotation is included. Local `.env` credentials remain untouched except if an independently necessary configuration issue is diagnosed and authorized.

## Compatibility, risks, and rollback

- Existing Project messages APIs and published answers remain compatible. No existing conversation is moved or converted into a private conversation.
- Reuse existing aggregate usage persistence only as necessary for provider accounting; no private message history collection is introduced. Memory and Mongo behavior must remain aligned for any changed shared contract.
- Main risks are accidentally posting private text to team chat, project/account context leakage, weakening resource limits, and changing human-reply suppression. Focus verification on these boundaries.
- Feature/provider failure shows an honest in-panel error with retry or team-message navigation. It must not alter human messaging availability or claim an answer was delivered.
- Rollback restores the launcher and timer/copy changes without deleting business records. No destructive cleanup is necessary.

## Acceptance and verification

1. A qualifying Project message remains waiting before 120 seconds and becomes eligible at 120 seconds; a human reply cancels it. Immediate exceptions, coalesced timing, and pending legacy waits remain correct.
2. Participants retains `Lisno AI` and contains neither removed paragraph in enabled or disabled states.
3. Ask Lisno opens a separate usable panel and can answer a supported question using the existing provider path without adding any Project message, alert, email, or workflow mutation.
4. Two Clients with different projects cannot access each other's facts; switched projects and accounts do not share temporary history. Revocation during generation prevents delivery of stale authorized data.
5. Client profile-only, no-project, ambiguous project, provider failure, retry, and quota-exhausted cases behave explicitly. Unsupported requests do not invent information.
6. Existing source-backed pricing and project status checks still pass. Shared resource controls account for both entry points.
7. Run focused backend and rendered frontend tests, backend/frontend typechecks, relevant builds, and `git diff --check`. Check the panel at desktop and mobile widths with keyboard interactions. Broaden tests only for changed shared contracts; report unrun checks and unrelated baseline failures honestly.
8. The tracked environment template contains no credential value; never print the actual local key when verifying configuration.

## Assumptions and open decisions

- Client-only support, a compact side panel, temporary history, and one clearly selected project at a time are the minimal defaults for this request.
- The existing configured OpenAI key/model are reused; there is no need for a second key.
- No product decision is blocking this specification. Approval adopts these bounded defaults. The separate task plan and execution choice follow the repository workflow.
