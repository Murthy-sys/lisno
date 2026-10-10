# Conversational Lisno AI and bottom-corner Ask Lisno window

Date: 2026-10-09
Status: Approved; implemented and locally verified on 2026-10-10

Completion evidence: [implementation plan and verification record](../plans/2026-10-09-conversational-lisno-agent.md#completion-and-verification-record-2026-10-10).

## Goal

Make Lisno AI a helpful, clearly identified AI participant that understands the Client's question, reads current authorized information, and replies naturally. Keep internal alert routing in the background. Replace Ask Lisno's project dropdown and full-height drawer with a compact chat window anchored at the bottom-right of the screen, following the supplied reference's composition.

This supersedes the project-selector and drawer presentation in `2026-10-09-ask-lisno-simple-chat-design.md`. The existing two-minute human-response window, private/public conversation separation, configured OpenAI provider, read-only business access, and financial rules remain in force. No model-training job or new provider integration is required.

## Evidence from the current implementation

- `frontend/src/features/messages/ChatAssistantResult.tsx` renders `Alert sent to ...`, routing failures, waiting/processing labels, and the prominent `Recalculate / refresh AI answer` button beneath Client messages. These internal details currently appear for Clients.
- `backend/src/services/project-assistant-openai.ts` explicitly says to answer only by selecting verified IDs and not to write prose. Its final schema has no conversational answer field. Styling alone cannot fix the mechanical responses.
- `backend/src/services/project-chat-assistant.service.ts` publishes one of four generic AI message bodies, followed by an authenticated structured-result read. That split protects restricted commercial data and must remain effective.
- `frontend/src/features/ask-lisno/AskLisnoPanel.tsx` requires a selected project and renders a full-height contextual Drawer with a Project/My account dropdown.
- `backend/src/services/ask-lisno.service.ts` binds each request to an explicitly supplied project ID; without one, it exposes only Client profile/navigation facts. It has no project-name resolution step.
- Existing repository project discovery is available through `pageProjectsForUserInModule` and `listProjectsForUserInModule`. Existing assistant readers already validate identity, session, project ownership, source freshness, and commercial calculations.

## Scope and approach

Recommended: extend the existing tool-based assistant with bounded conversational output and server-authorized project-name resolution, then replace only Ask Lisno's presentation shell. Reuse current status/execution/catalogue/pricing readers, provider configuration, usage controls, and Client-only endpoint.

Alternative considered: rephrase answers entirely with fixed templates. That minimizes generation changes but continues to produce the rigid experience the user wants improved; retain templates only as safe fallbacks and for exact financial values.

Here, agent behavior means understanding intent, selecting authorized read tools, resolving the project, following the conversation, asking a useful clarification, and suggesting an appropriate next step. It does not grant permission to change estimates, approve work, update schedules, assign people, send private-chat messages to staff, or promise future actions.

## 1. Project messages: quiet routing and natural participation

- Keep Critical/Important routing, notifications, ownership, audit records, and delivery recovery unchanged. They continue immediately in the background.
- For Client viewers, remove routing receipts and recipient names, unroutable diagnostics, wait/countdown explanations, suppressed/run-status text, and the large request/recalculate button from their message bubbles. Keep the Client's text, time/read state, priority tag, and existing issue controls.
- Staff may retain their currently authorized operational information; this request does not widen any recipient or participant visibility. Do not replace hidden text with another Client-facing alert or toast.
- A Client message becomes eligible for an automatic AI reply after two minutes without a human response, using existing immediate exceptions outside staff hours/without an owner. Preserve current reply cancellation, coalescing, leases, deduplication, and the final race check against a human reply.
- Show the answer as a normal reply from **Lisno AI**, preserving its explicit AI identity. Lead with the answer to the actual question, not a repeated generic preamble or a diagnostic fact table.
- Tone: polite, brief, helpful, and specific to the conversation. Acknowledge concern when appropriate, answer what can be verified, explain what is awaiting confirmation, and ask one useful follow-up if needed. Avoid repeated greetings, jargon such as configuration IDs, or unsupported reassurance.
- Example only, when supported by source data: “Your project is in execution. The latest vendor update is awaiting Site Manager verification. A finish date hasn't been confirmed yet.” Never use these example facts when the project data differs.
- Keep facts, source time, and price details available through a compact disclosure when useful. Do not repeat a generic message body and the same answer again in a separate card.
- A small `Lisno AI is replying…` indicator is allowed only during actual generation. Provider failures remain honest and recoverable through a compact chat-level notice or answer action. Optional manual retry/refresh belongs in a message menu or the AI answer, not a large footer on every Client message.

## 2. Conversational answers grounded in current data

- Extend validated generated/stored/public result shapes with an optional, bounded conversational answer representation and source references. Old stored results continue rendering through the existing facts-only fallback; do not rewrite historical messages or financial snapshots.
- Keep the existing read-tool loop. Instructions should allow conversational phrasing around retrieved evidence while forbidding unsupported project facts, fabricated staff activity, invented dates, prices, promises, and claims that a human has replied.
- Ground factual passages in current returned source IDs. Important dates, quantities, progress values, names, and monetary amounts must reference validated data; monetary values and calculations remain server-rendered. Reject unknown references, invalid output, stale source versions, or unavailable scope, and use a short truthful fallback.
- Treat messages, project names, catalogue text, and submitted conversation history as untrusted data. They cannot alter permissions, tool capabilities, instructions, or project identity.
- Shared Project message narrative must be safe for the whole authorized conversation. Private profile facts and restricted commercial details must not leak into message bodies, reply excerpts, search/list previews, notifications, or live events. Render restricted answer portions only through the existing permission-checked result boundary.
- Ask Lisno may return the owning Client's authorized customer-facing facts and price details privately. It must never expose internal margin/base-cost settings, vendor commercial details, another Client's data, tokens, or raw database records.
- Preserve required versus optional additions, confirmed versus proposed dates, reported versus verified completion, and immutable approved-estimate totals. Missing information should lead to clarification, not a guessed answer.
- Retain source timestamps and current-source validation before delivery. Natural-language generation requires quality checks in addition to schema validation: JSON shape alone does not establish factual accuracy. Use synthetic evaluations for contradictory, missing, and malicious context.

The existing Responses integration can retain strict function-tool schemas and structured final output while adding conversational content. This design follows the separation between tool calls and user-facing structured output in the [official OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs); application authorization and factual validation remain Lisno's responsibility.

## 3. Ask Lisno: understand the project name

- Remove the always-visible project dropdown and its prerequisite selection flow. The Client can type a question such as “What is the progress of Courtyard Residence?” directly.
- Resolve names against current projects authorized for the signed-in Client, using server-side discovery. Only minimal matching metadata is exposed for resolution; do not preload every project's detailed data into the model.
- Bind every resolved name to a stable project ID and recheck ownership/session/source access before tool reads and before delivery. A model-selected ID is a candidate, never authority.
- Prefer an explicit, uniquely matched project name in the current message. It overrides a previous conversation project or page hint. Match case/spacing variations; partial names or likely typos require a clear match or a brief clarification.
- If several authorized projects match, ask which one in the conversation and show a small number of relevant inline choices if useful. Duplicate names include a safe Client-visible distinguishing detail. Do not show the entire project list or silently choose the first match.
- An explicit unknown name produces a neutral explanation that no matching project was found in this Client's account. Never fall back to a different project or reveal whether another Client owns that name.
- For follow-ups such as “What about the painting?”, reuse the last clearly resolved project after validating current access. If there is no established conversation scope, a valid current-page project may be a hint; if the Client has exactly one authorized project, it can be used for an otherwise unambiguous project question. State the project naturally in the response.
- With multiple projects and no clear scope, ask a short conversational clarification. If a question explicitly combines several projects, clarify which to check first for this bounded implementation; never blend their dates or money.
- Client profile/navigation questions work without any project. Clients with no projects receive useful account-level help and an accurate missing-project explanation.
- Maintain temporary conversation context in memory for the signed-in session, with each project-derived turn associated with its resolved ID. Changing the named project must not carry facts, prices, rooms, or recommendations from the previous one into the new answer. Past replies are context, not current evidence.
- The server returns resolved scope or a clarification state so the UI can display the correct response without guessing. Context hints and inline-choice IDs are reauthorized on every request. Refresh/sign-out clears history; access loss removes inaccessible project content.

## 4. Bottom-corner chat window

- Desktop: open above the bottom-right Ask Lisno launcher, approximately 400 pixels wide and up to 600 pixels high, constrained by the viewport. It is a floating chat window, not a full-height side panel. Keep the surrounding page usable without a full-screen dimming backdrop.
- Mobile: a bottom-anchored panel using the available width with small margins/safe-area padding. Bound height by the usable viewport and account for the on-screen keyboard. Keep the composer visible and scroll only the conversation.
- Header: compact Lisno identity, `Ask Lisno`, and a clearly labelled close control. Closing preserves temporary history while mounted and returns focus to the launcher.
- Empty state: a short greeting such as “How can I help with your project?” and a few compact suggested questions: `Project progress`, `Expected timeline`, `Add something to my estimate`. A suggestion inserts/starts a relevant question and uses the same project-resolution rules as typed text.
- Conversation: readable user/AI messages, short paragraphs, optional compact source/detail disclosure, and a small pending indicator. Avoid repeated data cards, prominent technical labels, and unnecessary vertical spacing.
- Composer: fixed at the bottom with `Ask Lisno…`, accessible send control, Enter to send and Shift+Enter for a line break, while respecting text composition/IME. Prevent duplicate submissions and preserve retryable text on failures.
- Use the existing Lisno palette, typography, and logo. The reference informs placement, hierarchy, suggestions, and composer layout. Do not add a decorative orb, sparkles, heavy gradients, new icon package, or elaborate effects.
- Desktop uses non-modal dialog semantics without trapping focus or making the page inert. Opening focuses the composer; Escape closes when focus is inside; keyboard users can return to the page. Test interaction with existing dialogs so the widget cannot sit above a blocking approval dialog or steal its focus.
- Provide accessible labels, visible focus, polite announcements, text zoom support, reduced-motion behavior, long-name wrapping, and 320-pixel-width usability. Include loading, clarification, no-project, no-result, unavailable, retry, and revoked-access states.

## Contracts, compatibility, and operations

- Keep `POST /client/ask-lisno` Client-only, with the existing Super Admin personal-operation denial. Extend its validated request with optional conversational scope hints and its response with resolved project/clarification information; update OpenAPI and frontend types together. Older explicit-project requests remain authorized and compatible, but are only hints for the new name-aware flow.
- Extend current assistant result persistence additively. Existing facts-only records must load without a migration. Keep immutable historical amounts and audit lineage.
- Project discovery/resolution and answer generation share existing bounded provider attempts, context limits, timeouts, Client/project/deployment budgets, and process concurrency. Resolution must not create an unmetered second model path. Attribute project usage once scope is resolved before project-specific tools execute; unresolved requests still consume Client/deployment limits.
- Client-visible UI cleanup must not disable background routing or suppress real human notifications. Private Ask Lisno never posts to team chat or sends alerts. Human contact links require the Client to compose/send their own message.
- No new persistent private-chat history, autonomous business writes, attachments, web browsing tools, provider/key/model change, dependencies, deployment, seed, live migration, or real customer communication is included.
- Rollback may restore the previous UI/output path while retaining additive optional result fields. Old and new result readers must remain compatible; no data deletion/backfill is required.
- Risks: unsourced conversational claims, ambiguous names selecting the wrong project, restricted values leaking through prose, stale conversation context, and popup focus/keyboard overlap. These are the principal regression checks.

## Acceptance and verification

1. A Client message no longer displays alert-recipient text, routing diagnostics, countdown/status footers, or a prominent recalculate button. Background Critical/Important notifications and staff operations still work.
2. With no human reply, the existing two-minute eligibility produces a polite, question-specific Lisno AI reply. Human replies before/during generation still cancel automatic publication; no duplicate reply or alert is introduced.
3. New answers use conversational wording grounded in current evidence, with source details available unobtrusively. Old facts-only answers remain readable. Invalid references, stale facts, unsupported promises, and invented financial values fail safely.
4. Ask Lisno opens at the bottom-right on desktop and bottom of mobile; it does not show a project dropdown. Sending a question does not navigate to or publish in Project messages.
5. Test named projects, case/spacing variants, partial/duplicate names, unknown names, no projects, exactly one project, ambiguous multiple projects, page hints, follow-ups, and switching projects by name. Use two Clients and unequal projects, including duplicate display names.
6. Tampered context/choice IDs, session revocation, ownership changes during resolution/generation, and injected instructions cannot broaden access. Account changes clear temporary content; private profile/price data never enters shared previews or notifications.
7. Existing pricing/source tests and shared usage accounting pass. Account-only and unresolved questions consume appropriate limits; resolved project reads cannot bypass project quotas.
8. Render and exercise the popup at desktop, tablet, 390 and 320 pixels, plus mobile keyboard/short-height and long-response states. Verify no overflow, composer visibility, Enter/Shift+Enter, focus return, non-modal desktop behavior, and existing-dialog coexistence.
9. Run focused backend/frontend regression and contract tests, affected replica-set tests, typechecks, builds, and `git diff --check`. Synthetic provider evaluations cover conversational quality and grounding; any live-provider evaluation must use synthetic data and be reported separately, never real customer messages.

## Assumptions and open decisions

- “At the bottom” means a window above the existing bottom-right launcher on desktop and a bottom-anchored panel on mobile.
- “Background” means internal routing feedback is hidden from Clients while staff workflow and auditing continue.
- Natural project-name resolution covers any currently authorized Client project, with one clearly identified project per answer and clarification where necessary.
- No additional product decision is blocking this specification. Approval adopts these defaults; a separate task plan and execution choice follow the repository workflow.
