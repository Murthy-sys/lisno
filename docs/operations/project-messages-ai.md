# Project-message assistant operations

Lisno AI supports Project messages and a separate Client-only Ask Lisno panel. It is a service identity with no login or human role. Business records remain read-only. Project messages persist assistant runs, messages, result snapshots, routing receipts, notifications, usage receipts and audit records. Ask Lisno keeps conversation text in browser memory only and shares provider usage accounting.

## Enablement

Generation is disabled by default. Configure these server variables through the normal secret/configuration process:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROJECT_CHAT_AI_ENABLED` | `false` | Enables Project message generation and immediate Ask Lisno requests when a usable provider is configured. |
| `OPENAI_API_KEY` | Unset | Server-only OpenAI credential. Never expose it through `VITE_` variables, responses or logs. |
| `OPENAI_PROJECT_CHAT_MODEL` | `gpt-6-luna` | Responses model. Account support and model quality require separate verification. |
| `PROJECT_CHAT_AI_DAILY_TOKEN_LIMIT` | `1000000` | Deployment-wide input plus output token budget per UTC calendar day. |

A missing or locally malformed credential/model disables generation without preventing human chat startup. Invalid credentials rejected by the provider produce safe failure states. Tagged human alert routing continues independently of model availability. Server startup prepares assistant indexes before accepting traffic, starts recovery with notification delivery, and drains the worker before database disconnection.

Keep production activation disabled until the configured model/account and representative synthetic evaluations are verified. Mocked integration tests do not establish model quality or email delivery. No live-provider evaluation is implied by this implementation.

## Timing and bounds

Every eligible Client message, including untagged questions, greetings, acknowledgments and attachment-only messages, gets a full two-minute human-response window before automatic generation. Staff hours ending or a missing/lost owner do not shorten it. Two minutes is generation eligibility; queueing and provider latency can delay delivery. Client-facing routing receipts and internal wait statuses stay hidden; tagged staff routing and notifications continue in the background. Normal messages do not gain additional alerts. A Client can retry a failed reply or refresh an existing AI answer through the message options; an explicit request remains immediately eligible. A human reply suppresses pending work for its linked question; an unthreaded human reply suppresses pending project questions. The worker revalidates the question version, current Client scope, source data and human replies before publication. Never-started automatic pending runs, including legacy early-ready runs, adopt source-timestamp-based eligibility during processing; leased/retried work and completed answers are not restarted.

Ask Lisno uses `POST /client/ask-lisno` and answers immediately without a staff-response timer. It reads the current Client's allowlisted profile and resolves project names only against their currently authorized projects. Unclear names trigger a conversational clarification instead of a project dropdown. Explicit names override previous context; each request binds one stable project ID and revalidates access before delivery. It never publishes to Project messages or creates human alerts or workflow updates. Its bottom-corner non-modal window keeps temporary conversation in browser memory, with project lineage on each turn; refresh/sign-out clears it. Cached project turns are hidden on reopening until their project access is rechecked. Only bounded Client text is submitted as untrusted history, and switching projects excludes earlier project-derived context. Provider failures offer retry and team-message navigation.

Direct requests such as “show all projects” and the “Show my projects” suggestion return a server-backed private list. The existing endpoint returns optional `projectList` metadata with at most twenty current, authorized names/location qualifiers per page. Listing bypasses model generation and model token reservations while retaining request admission and current session/project authorization. `projectListPage` carries an offset and opaque roster-version marker; the marker does not grant access. Changed roster metadata or access returns `409 ASK_LISNO_PROJECT_LIST_CHANGED`, clears stale selectable rows and offers inline refresh. “Show more” appends to the same answer, and “View progress” starts a new stable-ID project question. Listing itself does not replace the selected project. Cached list rows participate in the existing access recheck on reopening. The Lisno mark identifies the private chat and trusted AI sender/participant in Project messages; human senders do not acquire the mark by using the same name.

Related normal followups within thirty seconds of the original source message can share one answer: either an explicit reply to a never-started automatic question or an immediately adjacent short quantity/detail fragment without a new-topic or question marker. A newly combined run waits two minutes after its latest included Client message; the original thirty-second combination window is not extended. Tagged requests, unrelated questions, social acknowledgments and already-started/retried/explicit work remain separate. A linked “Thanks” cannot replace an unanswered question. Critical alerts and source dependencies are preserved. Every combined source must still be current before publication, and the full combined context must fit the sixteen-message bound.

Both chat entry points use the same conversational policy: greet at the beginning or in response to a greeting, acknowledge concern proportionately, answer the actual question and avoid repeated introductions. Pure social messages need no project/profile lookup. Private account/social replies retain the last resolved project as a reauthorized hint for later follow-ups. No emotion labels or sentiment scores are stored. Empathy is not evidence of a project delay, fault or staff action; project claims still require current sources. Short yes/no replies never authorize a business change. Text accompanying attachments can be answered, while attachment-only messages receive a polite request for a text description. Only attachment presence is passed to the provider, never filenames, types, contents or storage references.

A later Important-to-Critical escalation resurfaces the existing alert using its routing version and latest alert time. Reading an older version cannot acknowledge the newer alert; the UI refreshes it instead. Completion answers distinguish vendor reporting, Site Manager verification and the Client's acceptance of the current completion review. Publication serializes against the existing project completion coordination token so simultaneous approval changes cannot publish stale evidence. That token is metadata, not a business status or progress change.

Operational defaults in `backend/src/domain/project-chat-assistant.ts`:

- Up to 16 Client context messages, 32 KiB serialized provider payload and 2,048 output tokens per attempt.
- Up to three tool-result rounds, six read-tool invocations and four provider HTTP attempts per generation.
- Twenty-second HTTP timeout and a durable ninety-second generation deadline across retry/restart, including retry delay. At most two worker attempts.
- Two active model generations per process, one per project across processes. Recovery scans every five seconds; leases last 180 seconds with thirty-second heartbeats.
- Admission windows: twenty new generations per Client/hour, sixty per project/hour and five hundred deployment-wide/day. Hour/day windows use UTC.
- Conservative token reservations use serialized payload bytes plus the output-token cap. Known provider usage settles the reservation. Ambiguous network errors/timeouts keep their reservation, so a retry cannot silently overspend the shared allowance.

An expired crashed-worker lease may already exceed the ninety-second generation deadline. Such work fails safely; an explicit Client retry can create a fresh admitted generation. Existing durable receipts prevent replay from creating a second answer or reusing a completed request key.

## Privacy and pricing

The model receives only scoped read-tool projections, bounded Client text and optional attachment-presence flags. Staff messages, restricted result amounts, internal costs, margins and approved contract amounts are excluded from model context. The pricing tool returns an opaque preview reference and missing-input state; customer-facing amount rows remain server-side and require a separate authorized result read. Final model output selects validated source IDs and bounded conversational paragraphs. Fact placeholders are expanded from verified values; source/value and workflow-qualification checks reject known unsupported claims. Monetary values remain server-rendered. These targeted checks do not prove arbitrary prose is factually entailed, so synthetic quality evaluation remains necessary. Optional stored narrative is returned only through authenticated result reads and is omitted when sources are stale. Source-free greetings use neutral shared preview text and omit empty source disclosures in the chat. Older facts-only answers continue to render without migration.

Responses requests use strict tool/final schemas and `store: false`. This setting is not a claim of zero provider retention; deployment owners must review applicable OpenAI account data controls. Do not log prompts, tool payloads, provider response bodies, keys, private links or hidden reasoning. Diagnostic state contains safe failure codes and counters only; raw generation context remains in memory and is discarded when the attempt finishes.

Result snapshots and semantic generation/publication/routing/usage receipts follow conversation retention. Do not TTL-delete replay receipts or manually reset usage counters to bypass limits. There is no raw diagnostic context to purge after thirty days.

## Diagnostics and rollback

The application exposes `projectChatAssistantHealth()` to trusted in-process diagnostics and `runProjectChatAssistantOnce()` for deterministic local tests. No public health endpoint is added. Health includes effective enablement, active work, consecutive failure count, a safe last failure code, due-work delay greater than sixty seconds, and three-consecutive-provider-failure state.

Investigate `ASSISTANT_ADMISSION_LIMIT` or `ASSISTANT_TOKEN_LIMIT` through counters; these do not reject the Client's chat message. `ASSISTANT_PROVIDER_ERROR`, `ASSISTANT_NETWORK`, `ASSISTANT_TIMEOUT` and `ASSISTANT_RATE_LIMIT` report transport/service problems without leaking provider responses. `ASSISTANT_SOURCE_CHANGED`, `ASSISTANT_AUTHORITY_CHANGED`, `ASSISTANT_HUMAN_REPLIED` and `ASSISTANT_SUPERSEDED` prevent stale publication. Invalid or ungrounded model output is rejected. The AI does not analyze attachments; it asks for a text description when needed.

To pause generation, set `PROJECT_CHAT_AI_ENABLED=false` and restart normally. Preserve human chat, notifications, result snapshots, receipts and indexes. Do not delete assistant collections as a rollback mechanism. Pending jobs remain durable and must pass timing, authority and source checks after re-enablement. No migration, backfill, production mutation or customer message is required to deploy the disabled code.

## Local verification

Run `npm test -- tests/project-assistant-runtime.test.ts tests/project-assistant-openai.test.ts tests/project-assistant-runtime.replica-set.test.ts tests/project-assistant-app.test.ts tests/config.test.ts tests/server.test.ts` from `backend/`, followed by backend typecheck/build and the integrated chat/source/pricing/authorization suites. Replica tests require a Mongo replica set and use only synthetic data. All provider boundaries remain mocked unless a separate live evaluation is authorized.
