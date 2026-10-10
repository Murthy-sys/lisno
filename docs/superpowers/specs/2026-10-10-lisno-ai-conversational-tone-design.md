# Natural, considerate Lisno AI replies in both chats

Date: 2026-10-10 (Asia/Kolkata)
Status: Approved, implemented and verified locally on 2026-10-10

Completion evidence: [Task plan and verification record](../plans/2026-10-10-lisno-ai-conversational-tone.md). All seven acceptance criteria have mapped evidence; no deployment or production mutation was performed.

## Goal and confirmed decisions

Make Lisno AI converse naturally, like the experience the user associates with ChatGPT: polite greetings, understanding the Client's wording and concern, appropriate empathy, useful direct answers, and continuity across follow-ups. Apply the same behavior in private Ask Lisno and Project messages.

The user selected: **Every Client message after two minutes without a staff reply.** “All messages” means all Client-authored messages, including ordinary untagged messages, greetings and acknowledgments; it does not mean replying automatically to staff or AI messages. Private Ask Lisno continues answering on submission.

This extends the approved conversational-agent implementation. It changes response style and automatic reply coverage/timing, not the UI design, project permissions, pricing rules or OpenAI provider/key/model.

## Current behavior and evidence

- `backend/src/services/project-assistant-openai.ts` supplies the shared provider instructions to both chat entry points. It already requests warm, brief answers and forbids fabricated facts/actions, but does not define greeting behavior, nuanced responses to frustration or conversational social replies. Its source-free narrative instruction allows only clarification/navigation/price guidance/handoff, which needs to include greetings and empathy explicitly.
- `backend/src/services/project-chat-assistant.service.ts` already queues ordinary questions. `onMessage` excludes normal-priority acknowledgments through `isAcknowledgment`, including “Hi,” “Hello,” “Thanks,” “Okay,” “Yes” and “No.” It requires nonempty text.
- `backend/src/domain/project-chat-assistant.ts` sets a 120-second wait, but `assistantEligibleAt` currently answers immediately without a specifically resolved owner or outside staff hours, and can shorten a wait at staff-hours closing. `project-assistant-runtime.ts` can also accelerate an existing wait when its owner disappears.
- The runtime checks for human replies before generation and again before publication, maintains leases/idempotency, and narrowly combines related question/quantity fragments. It currently rejects a question containing attachments instead of providing a useful text response.
- Project-message context contains bounded text from the initiating Client, excluding staff messages, private amounts and AI-result bodies. Private context is scoped Client history. `ask-lisno.service.ts` resolves project context before generation; greeting-only requests must not be forced into project clarification.
- `project-assistant-narrative.ts` validates references, sensitive numeric claims, unsupported promises and narrative bounds. The existing frontend renders conversational paragraphs without requiring a new response format.

These are observations of the current code, not a claim that the requested changes are already implemented. The repository has substantial pre-existing uncommitted work, which must be preserved.

## Required conversation behavior

1. **Natural politeness.** Use a brief greeting for the beginning of a conversation or when the Client greets Lisno AI. For an ongoing exchange, respond naturally without repeating “Hello,” introducing the assistant again, or adding a formulaic closing to every message. Use courteous, plain language rather than excessive honorifics or sales language.
2. **Understand the message.** Consider the Client's latest wording and relevant scoped Client history. Distinguish a question, complaint, greeting, thanks, correction and short follow-up. Answer the actual concern rather than returning a generic status summary for every message.
3. **Respond to apparent emotion proportionately.** For anger/frustration, acknowledge the concern briefly, remain calm and provide a concrete verified answer or useful next step. For worry/confusion, explain clearly and acknowledge uncertainty. For gratitude, give a short friendly acknowledgment. Do not tell the Client to calm down, blame them, sound defensive, assert a psychological diagnosis, or claim certainty about their feelings.
4. **Useful, concise conversation.** Give enough detail for the question. Explain more when asked. Ask one useful clarification when required. Do not turn greetings or thanks into unsolicited project reports or force them to name a project. A neutral message should not receive an unnecessary apology.
5. **Truthful empathy.** An empathetic phrase is not evidence of a project delay, fault, approval or staff action. Do not promise deadlines, claim staff were contacted, guarantee outcomes, or invent progress to reassure someone. Use the current read tools before making project claims; preserve reported versus verified and proposed versus confirmed distinctions.
6. **Consistent entry points.** Use one shared response policy for private and shared conversations. Allow short source-free greetings/thanks/empathy while retaining current factual and financial validation. No sentiment labels, emotional scores, profile fields or additional stored Client data are introduced.
7. **Identity and privacy.** Keep Lisno AI visibly identified as AI. Use a Client name only when already supplied through authorized context; do not add private-profile reads to shared Project messages merely to personalize a greeting. Do not send staff text or private AI answer bodies into shared history to improve tone.

Examples illustrate tone only, never substitute for actual facts:

- Greeting: “Hello! How can I help with your project?”
- Frustrated Client asking repeatedly: “I’m sorry this has been frustrating. Here’s what I can confirm from the latest project update…” followed only by verified information.
- Missing confirmed date: “I don’t have a confirmed finish date yet. The available schedule is still awaiting confirmation.” Only say the latter when supported by evidence.
- Thanks: “You’re welcome!” A short reply is enough.

## Automatic Project-message coverage and timing

- Enqueue every new eligible Client message regardless of priority or whether it is a greeting/acknowledgment. Normal messages do not gain Critical/Important alerts merely because they now receive an AI answer.
- Automatic generation becomes eligible after a full two-minute human-response window. Apply it during and outside staff hours, without shortening it because an owner is missing, becomes unavailable, or staff hours end. This deliberately replaces the old immediate exceptions for automatic replies, following the user's selected behavior.
- Two minutes is the eligibility point, not a guarantee that generation and delivery finish at exactly that second. Preserve existing worker limits, retries and generation deadlines.
- A qualifying staff reply before publication cancels the automatic response, including a reply arriving during generation. Keep the established matching rule for a reply to the source message and an unthreaded response in the project conversation. Staff/service messages must never start an AI reply loop.
- Keep existing deduplication and the narrow combination of related question/quantity fragments. A combined reply must cover those related messages; unrelated questions remain separate. For newly combined work, eligibility must not precede two minutes after the latest included Client message. Do not reset a wait merely because of a worker retry.
- Explicit manual retry remains an explicit request and may run immediately; private Ask Lisno remains immediate. Neither is an automatic Project-message reply.
- Text accompanying an attachment can receive an answer to its text. Attachment-only messages receive a polite request to describe the issue in text. Do not fetch, inspect or pretend to understand attachment contents; OCR/audio/image understanding is outside this task.
- Preserve provider-enabled, authorization, session, quota, source-freshness and failure checks. “Every message” removes content-based silent exclusions; it does not bypass service limits or fabricate successful replies during provider failure. Keep failures recoverable through the existing UI.
- Apply the timing rule to new runs and never-started pending automatic runs using their source timestamps. Do not replay historical messages, rewrite prior answers, restart leased work or reset retry accounting.

## Approach, impacts and boundaries

Extend the existing provider instructions and necessary conversation context hints, enqueue eligibility and scheduling checks. This reuses the current tool-based integration and is preferable to an additional sentiment-classification model or a set of scripted responses, which would add latency or make the conversation rigid.

No new public endpoint, persistence schema, permission or response kind is expected. If an internal greeting/context hint is needed, derive it from existing scoped Client history/run metadata; it is style context, never authorization or factual evidence. Keep request/result formats compatible. Only narrowly required presentation/copy adjustments are in scope; no chat redesign.

Business reads stay read-only. Existing staff alerts remain in the background. Current Main Line/configuration pricing, integer-paise calculations, commercial redaction, project resolution, usage quotas and publication transactions remain authoritative. No new dependencies, model training, key changes, migrations, backfills, production mutations, deployment or real customer messages are included.

Rollback restores the prior shared instructions and automatic eligibility checks without deleting history. Main risks are replying too early, flooding the chat, greeting repetitively, missing short contextual responses, reading emotion too strongly, and generating unsupported reassurance. Verification must cover these cases.

## Acceptance and verification

1. Both chats respond naturally to greeting, neutral question, frustrated/angry complaint, worry/confusion, thanks, correction and a short contextual follow-up. Greetings are appropriate, not mechanically repeated. Test synthetic conversational examples for style and factual integrity; matching prompt strings alone is insufficient.
2. Untagged and tagged Client messages, greetings, acknowledgments and attachment-only messages receive the specified automatic handling. Staff/AI messages do not enqueue responses. Attachment contents are not sent to the model.
3. With a fake clock, no automatic provider generation occurs at 119,999 ms; it becomes eligible at 120,000 ms. Cover owner present/missing/lost, staff-hours boundary/outside hours, pending-run compatibility, quantity-fragment combination and explicit/private immediate requests.
4. Staff replies before the deadline or during generation suppress automatic publication. Concurrent/retried runs produce no duplicate answer; independent questions retain their own lineage.
5. Greetings and emotion acknowledgments need no project lookup or invented evidence. Project statements still require current facts; unknown dates, unverified work and unsupported actions are not presented as confirmed. Unknown project names remain clarifications, not fallbacks to another project.
6. Existing authorization, private/shared data boundaries, pricing, quotas and source-freshness regressions pass. No additional alerts are sent for normal messages.
7. Run focused provider/narrative, Ask Lisno, chat-service/runtime and affected replica-set tests; backend typecheck/build and repository diff checks. Include existing rendered answer/Ask Lisno tests when exercising social responses or any changed presentation. A small live synthetic quality check may supplement deterministic tests without customer data or customer communication.

## Open decisions

None blocking the specification. The user's reply confirmed the two-minute wait and staff-reply suppression, and their latest clarification sets natural ChatGPT-like conversation as the tone target. This specification records the exact treatment of greetings, attachments, timing exceptions and related fragments for review before a separate task plan.
