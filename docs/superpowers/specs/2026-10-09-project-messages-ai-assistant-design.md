# Project messages: Lisno AI assistant

Date: 2026-10-09
Status: Approved; task plan approved and Mode A selected. Local implementation and verification are authorized.
Risk: High, because the feature combines Client data access, automated communication, background work, and financial suggestions.

## 1. Goal and confirmed decisions

Add a clearly identified **Lisno AI** participant to project conversations. It helps Clients obtain project facts and preliminary prices, and directs tagged requests to the appropriate current human owner.

The user clarified on 2026-10-09:

- “Lisno chat” means the **existing Project messages screen only**. No separate private chat, new Client navigation destination, or second conversation history is required.
- Outside the existing staff chat hours, or when no responsible person is assigned, the assistant may respond immediately.
- Otherwise, it waits **five minutes without a human reply** before answering.
- The assistant has read-only access to business data. It can answer and cause the application to notify people, but cannot change project scope, estimates, assignments, approvals, work orders, schedules, or progress.

Recommended implementation: OpenAI Responses API behind a backend service with narrowly scoped read tools. Lisno code controls authorization, calculations, notification delivery, timers, and message publication. The model never receives database credentials or a general-purpose database query tool.

The commercial calculation choice is recorded in section 7. Approval of this specification also approves its stated defaults where no alternative has been selected.

## 2. Current behavior and evidence

These findings come from the current worktree, including existing uncommitted work, rather than historical plans.

| Area | Verified current behavior | Relevant source |
| --- | --- | --- |
| OpenAI | No OpenAI adapter, configuration reference, or dependency found in backend/frontend source and package manifests. “AI Estimator Knowledge” provides Configuration data and deterministic calculations, not an existing model integration. | `backend/package.json`, source search for `openai`, `OPENAI_`, `api.openai.com` |
| Messaging entry points | Project messages are available globally and within an individual project. No distinct “Lisno chat” route was found. | `frontend/src/app/routeRegistry.ts`, `frontend/src/features/messages/ProjectChatProvider.tsx` |
| Priority and ownership | Messages have `normal`, `important`, or `critical` priority, an optional responsible participant, issue state, version, and issue history. Tracked actions additionally require an action type, responsible participant, and deadline. | `backend/src/contracts/project-chat.ts`, `backend/src/domain/project-chat.ts`, `backend/src/services/project-chat.service.ts` |
| Notifications | Sending an explicit mention writes durable notifications, with existing Super Admin oversight behavior. A priority tag or responsible field alone does not currently enter that mention notification branch. | `backend/src/services/project-chat.service.ts:389` |
| Delivery | Notification mail uses durable claims, leases, bounded retries, and recipient membership revalidation. Disabled and failed email states are distinct. | `backend/src/services/notification-email-dispatcher.ts` |
| Identity | Chat author and participant shapes currently assume human roles. Membership is derived from active users, current assignments, valid grants, selections, and exclusions. | `backend/src/contracts/project-chat.ts`, `backend/src/models/ProjectChat.ts`, `backend/src/domain/project-chat-membership.ts` |
| Availability | Clients can write at any time. Internal chat operates from 07:30 inclusive to 20:00 exclusive in Asia/Kolkata. `responsible.available` means the person is still a participant, not that the person is online or free. Typing is transient. | `backend/src/domain/chat-hours.ts`, `backend/src/services/project-chat.service.ts:74` |
| Project facts | A participant-safe status projection already derives current stages, pending actions, responsible people, scheduled dates, and conflicts without commercial values. | `backend/src/services/project-status.service.ts`, `backend/src/contracts/project-status.ts` |
| Client commercial history | Client estimate presentation uses immutable published review snapshots and validates project/estimate/review lineage. | `backend/src/services/estimate-client-presentation.ts` |
| Configuration | Current internal Main Line reads prefer the saved draft revision, otherwise the saved active revision, joined by stable ID. Catalogue includes current UOM, mode bases, revision identities, and recommendation availability. | `backend/src/domain/ai-estimator-knowledge-current-revision.ts`, `backend/src/services/estimator-catalogue.service.ts` |
| Pricing difference | Estimate Builder validates a Configuration mode base rate and multiplies it by quantity. Configuration separately supports selling-price calculations with margin and low-quantity impact. These paths can produce different amounts. | `backend/src/routes/estimates.ts:345`, `backend/src/domain/ai-estimator-knowledge-mode-calculation.ts` |
| Recommendations | Existing rules distinguish `must` and `can`, and may target a Main Line or a Sub Basket. Targets can be unavailable or require completion. | `backend/src/services/estimator-catalogue.service.ts`, `frontend/src/features/leads/roomRecommendations.ts` |

No application code, dependencies, database records, external messages, or OpenAI requests containing project data are changed during specification work.

## 3. Scope and non-goals

### Included

- A service participant named “Lisno AI” in every project conversation when the feature is enabled, including existing projects without a bulk participant backfill.
- Automatic processing of new Client messages and Client priority changes; deliberate follow-ups to an AI reply remain in the same project conversation.
- Immediate durable routing of Critical and Important Client requests, including tags applied after a normal message was sent.
- Project status, confirmed timeline, current next actions, and appropriately filtered execution progress answers.
- Configuration Main Line matching, required/optional recommendations, and deterministic approximate pricing for proposed additions.
- Compact answer presentation, source/freshness information, notification routing state, and clear unavailable/failed states.
- Authorization, background reliability, provider limits, deployment configuration documentation, and regression coverage.

### Excluded

- Autonomous estimate editing, quote publication, discounts, approvals, project reassignments, deadline changes, procurement, work-order issuance, payment actions, or issue resolution.
- A separate Client AI inbox, cross-project assistant conversation, WhatsApp/SMS/push integrations, or additional staff attendance/presence tracking.
- Web search, arbitrary code execution, arbitrary database queries, external MCP connectors, whole-database indexing, or an unrestricted vector store.
- Reading image/audio/video/document attachments in this first text-based integration. Existing attachments remain usable by humans. AI must say when an answer needs textual details and must never claim to have inspected them.
- Revisiting previous workspace redesigns, changing current estimation formulas, repairing unrelated authorization findings, or running production migrations/deployment as part of local implementation.

## 4. Client and staff experience

1. Client opens an existing project conversation and sees “Lisno AI” identified as an AI assistant, separate from human participants. A brief description states that it can explain project information and approximate additions; the team confirms changes.
2. Client sends a question using the current composer. Critical/Important priority and custom tracked-action semantics remain intact.
3. For a tagged request, the application durably queues a human alert immediately. The conversation displays a compact status such as “Notified: [person / role]” only after the in-app notification is committed. Email delivery is not represented as successful until actually accepted by the mail provider.
4. During staff hours with a valid owner, the assistant response becomes eligible five minutes after the saved question. Outside hours, or with no valid domain owner, it becomes eligible immediately. Administrative fallback notification does not make an unassigned domain owner count as assigned. If the wait crosses the 20:00 closing boundary, the answer becomes eligible at closing. Eligibility does not mean zero provider latency.
5. A human reply linked to the question cancels the pending automatic answer. For ordinary unthreaded staff replies in the same conversation, suppress pending automatic answers conservatively and offer the Client a compact “Ask Lisno AI” action on the unanswered question. This avoids talking over staff without treating unrelated text as a confirmed answer.
6. An explicit Client “Ask Lisno AI” action requests an immediate response for that question, subject to authorization and limits. It does not change priority, restart staff deadlines, or create another human alert for the same event.
7. AI answers appear as replies with an AI label, not as a human identity. Status/date facts show the source and “Checked at” time. Missing, conflicting, proposed, and confirmed information use distinct wording.
8. A question such as “Can we add false-ceiling paint in the living room?” produces real Main Line candidates, asks for missing scope/quantity, and presents an approximate breakdown when sufficient information is known. No button writes those suggestions into the estimate in this scope.
9. Staff keep the current reply, issue, assignment, resolution, and deadline controls. An AI answer never marks the request resolved or satisfied.

The assistant does not answer acknowledgments such as “thanks” or start new conversations without a Client trigger. It never recursively processes its own messages, routing notices, or notification delivery events.

### Compact UI requirements

- Extend the existing timeline, participant presentation, and composer conventions; no separate large dashboard or repeated summary cards.
- Default to a short answer. Price assumptions and recommendations expand inline on request.
- Keep a visible distinction between “Approximate addition”, “Approved estimate”, and “Awaiting team confirmation”.
- Respect existing human participants' removability rules. The AI service identity cannot be assigned a human task or removed through human membership controls; global service availability controls it.
- Keyboard-accessible expand/retry/ask actions, explicit accessible names, polite live announcements, no disruptive focus changes, no streaming of unvalidated factual or financial fragments.
- Cover loading, waiting for human reply, answering, human replied, clarification needed, unavailable source, failed provider, disabled service, revoked access, empty recommendations, and stale price states.
- Desktop, tablet, and narrow mobile layouts must preserve message width and usable controls without horizontal overflow.

## 5. Human routing and immediate alerts

Priority controls urgency. It does **not** by itself establish which role owns the subject. Routing combines the actual message context and current project responsibility.

### Recipient precedence

1. Respect an explicitly selected, currently authorized human responsible participant on the issue.
2. If the message references a known Main Line, task, stage, or issue, resolve its current responsible staff member from validated project/workflow/execution sources.
3. For free text, the model may classify the topic or nominate an ID from a bounded list of current eligible owners. The backend validates the nomination against canonical assignments and project chat membership. The model cannot choose a user outside that list or create an assignment.
4. If no unique valid owner can be resolved, notify the current assigned Program Manager when uniquely available and permitted to read this conversation; otherwise notify the sole active Super Admin. No arbitrary “first user of this role” fallback.
5. If even the administrative fallback cannot be validated, persist an unroutable state and surface it to authorized administrators. Do not claim that someone was notified.

Typical subjects resolve to existing assignments: estimation/additions to Sales/Estimator; design to the responsible Designer or Design Manager; site work and vendor progress to Site Manager; procurement to current Procurement owner; project coordination to Program Manager. These are routing categories, not new grants or assumed assignments. A human explicitly selected by the Client remains authoritative.

### Independent alert path

- Persist a tagged request's initial routing/notification work with the message or issue transition. No OpenAI request executes inside a database transaction.
- Where deterministic context identifies an owner, notify that owner immediately. Where only free-text classification can disambiguate, immediately notify the safe fallback and perform bounded topic routing afterward. A distinct validated owner may receive one additional alert; the routing record explains the handoff.
- “Immediate” means the durable in-app notification is created without waiting for the five-minute answer timer or for an OpenAI response. Existing post-commit wakeups deliver live notifications; restart recovery uses durable records.
- Use existing in-app notifications plus the configured email transport. Email can be pending, sent, disabled, failed, or suppressed; in-app delivery must not depend on external mail success. No new channel is implied.
- Reconcile with existing mention notifications so a recipient does not receive duplicate alerts for the same trigger through both mention and AI routing paths. Preserve existing Super Admin mention oversight.
- Normal questions receive AI help under the agreed timing policy; they do not create a high-priority human alert solely because the assistant processed them.
- Initial Critical/Important routing is idempotent. A later genuine escalation, reopening, or human reassignment may create a new versioned routing event; replay of the same operation must not.
- Read receipts, typing, account activity, and email delivery are not a human reply and do not cancel the timer. AI replies also do not cancel human responsibility.
- Routing receipts are communication metadata. They do not silently change the message's human responsible field, task ownership, priority, due date, or open/resolved state.

## 6. Read-only data access and answer grounding

### Authority and audience

- On every read tool call, bind project ID and requesting Client identity on the server. Ignore any model-provided project, account, or privilege override.
- Verify current active Client identity, project ownership, session validity when accepting requests, and current ownership/membership before background reads and publication. Delayed work uses a recorded initiation identity plus current authorization checks, not an impersonated long-lived Client JWT.
- A service identity is not a User, has no login, and is not added to `ROLE_CODES`. Human author records and audit entries remain unchanged. AI messages, participants, replies, notification actors, and events use explicit service provenance.
- The service has no privileged human session and does not call staff-only endpoints by pretending to be Super Admin. Extend internal read projections where necessary; preserve endpoint authorization.
- Shared message text must be safe for the **conversation's audience**, not merely readable by the Client. No raw configuration payloads, internal margin/cost fields, procurement finances, private notes, other projects, account records, tokens, storage references, or unpublished designs enter the shared answer.

### Allowed read capabilities

| Capability | Source / behavior | Output boundary |
| --- | --- | --- |
| Project status | Existing validated project-status projection | Stage, next action, authorized people/roles, confirmed/proposed dates, explicit source gaps |
| Execution summary | Current execution and completion sources with a new minimal audience-safe projection where required | Reported progress distinguished from Site Manager verification and Client acceptance; no vendor commercial details |
| Published estimate context | Validated immutable Client-visible estimate/review snapshot | Only Client-authorized commercial fields; never current staff drafts presented as approved history |
| Catalogue search | Bounded server-side search of eligible current Configuration Main Lines | Stable IDs, basket/sub-basket names, line name, UOM, availability, safe matching descriptors; no raw costs/margins |
| Recommendation lookup | Current configured `must`/`can` rules and validated targets | Safe required/optional labels, target IDs, missing-input/availability states |
| Price preview | Backend calculator using saved current settings | Structured authorized customer-facing amounts, assumptions, revision/version and calculation provenance |

Search names and synonyms only locate candidates. Every subsequent join and calculation uses stable Main Line, revision, UOM, project, room, and estimate IDs. Duplicate names must not cause cross-line matching. Low confidence returns a few real alternatives or asks a question; no invented catalogue items.

### Grounding and source freshness

- Every factual answer cites application sources available to its viewer, with the time read. Do not generate arbitrary URLs; render server-validated source links.
- Re-read volatile facts before publication. If owner, estimate, UOM, rate, revision, or relevant workflow version changed, refresh/recompute or withhold the stale answer.
- Proposed schedules remain proposed. Vendor-reported completion remains reported until verified. Do not infer a final handover date by adding task durations or describe an unconfirmed finish date as a commitment.
- Missing or conflicting data produces a short limitation and a human handoff state, not invented dates, progress percentages, quotations, or confident “everything is on track” text.
- Treat messages, catalogue descriptions, recommendation text, and any retrieved content as untrusted data. They cannot replace system instructions, grant capabilities, expand the project scope, or trigger writes.

### Commercial visibility within shared chat

Project chat membership alone must not grant access to an existing Client estimate or all commercial projections. Price breakdowns and approved-estimate amounts therefore use a **structured, permission-checked attachment to the AI reply**. Shared narrative remains noncommercial when some participants lack access.

- The owning Client can read the new preliminary customer price preview. Staff require the corresponding existing project/estimate commercial-read authority, with a specific scoped assistant-preview operation if the current registry has no exact match.
- Other participants see only an appropriate message such as “A preliminary price suggestion is available to the Client and estimating team.” They do not receive the amounts in list previews, replies, notifications, SSE payloads, or cached objects.
- Never give restricted financial values to the model generating the shared narrative. Backend code renders authorized amount rows from the calculation result, so the model cannot copy hidden figures into public prose.
- The same restriction applies to an answer about the Client's existing estimate total. Use the authorized structured result rather than widening project chat permissions.

## 7. Approximate additions and calculations

### Proposed pricing default

Proposed default: use **Configuration's calculated selling price**, including its mode-specific saved margin and low-quantity impact, with GST separately identified. Internal costs and margins stay private. A clarification was requested because matching the Estimate Builder's base-rate multiplication is a different commercial policy. Unless the user selects that alternative, approval of this specification adopts the stated selling-price default; it is not recorded as a choice the user has already made.

This is a read-only preliminary quote policy. It does not change the current Estimate Builder, approved estimate, Procurement budget, or existing financial reporting formula. Any difference from existing published customer prices is explicitly a new-addition preview at current Configuration prices.

### Calculation requirements

1. Resolve the current saved Main Line revision using the existing draft-first rule. Validate basket/sub-basket lineage, UOM and precision, mode applicability, and required calculation settings. An incomplete current revision never falls back to an older one or another line.
2. Default a genuinely new, unspecified item to Standard/Sub-Vendor and state that assumption. A Client-requested Special mode uses its own saved configuration. A request concerning an existing approved line uses its recorded mode when unambiguous; never use a basket-wide mode.
3. Require quantity in the configured UOM. Ask for missing dimensions, room, mode, or specification where they materially affect the result. Do not assume one unit, room floor area as wall area, or equal quantities for unlike UOMs. A per-unit illustration may be shown only when explicitly labelled and valid for the known quantity assumptions.
4. Use existing Configuration mode calculators, integer paise, decimal quantity precision, and rounding rules. PMC, Sub-Vendor, and split In-house calculations retain their established differences. Apply saved starting selling-price policy where applicable; no discretionary discount, minimum-margin negotiation, or project procurement rate override.
5. Sum computed line amounts server-side. Apply the application's applicable GST policy once at the proper boundary; do not fetch tax law or invent a rate with the model. Show subtotal, GST rate/amount, and approximate addition total separately.
6. Follow configured Non-Negotiable Additions (`must`) and Probable Additions (`can`). Necessary rows belong in the proposed required total only when identifiable and priced. Optional rows have separate amounts and are excluded unless the Client explicitly includes them.
7. Preserve the existing Sub Basket recommendation expansion: the current room recommendation code evaluates its configured child Main Lines and considers the group satisfied only when all applicable children are selected. List those proposed child additions explicitly and obtain their required quantities; do not reinterpret a group rule as an arbitrary single alternative or silently select and price its children. Temporary/incomplete/unavailable targets block a complete price rather than silently disappearing.
8. Bound recursive recommendation traversal, detect cycles, and deduplicate the same proposed line in the same room while retaining multiple source reasons. Do not merge different rooms or different specifications.
9. Compare with the approved scope by stable line/room identity. If an item is already included, clarify whether the request is extra quantity, replacement, or a new room. Do not double-charge an existing allowance or automatically net a replacement credit.
10. If any required item is unpriced, show a clearly labelled partial subtotal and the missing information. Do not label a partial amount as the final approximate total.
11. Keep the approved contract total separate from the proposed addition. A combined hypothetical total is allowed only for a confirmed additive scenario with a validated approved baseline and complete additions, and must say it is not a revised approved estimate.
12. Persist the price result's source IDs/versions, calculation policy version, assumptions, quantities, UOMs, inclusion choices, integer amounts, and checked time as an immutable communication snapshot. Revisiting a stale preview displays its age and recalculates into a new result; do not rewrite old quoted history.

## 8. Runtime, contracts, and persistence

### Provider integration

Use a small server-side OpenAI adapter with schema-validated Responses API function tools. Explicit `strict: true` tool schemas and runtime argument validation enforce shape; application authorization remains authoritative. No general database tool, code execution, web tool, or provider-hosted project document store is provided. [OpenAI function calling documentation](https://developers.openai.com/api/docs/guides/function-calling)

Use a configured model ID, server-only API key, request timeouts, bounded context and tool rounds, token limits, bounded retries for transient errors, and per-Client/project/global usage controls. Defaults and an evaluated model must be fixed in the task plan before implementation; do not hardcode an unverified model or make an untested latency claim.

Send only necessary current conversation text and sanitized read results. Use `store: false` and locally managed, project-scoped context. That setting is not a claim of zero provider retention: OpenAI documents separate abuse-monitoring retention and eligibility requirements for additional controls. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

### Application-controlled writes

“Read-only” applies to business records and model capabilities. The application necessarily persists AI conversation messages, price-preview snapshots, routing receipts, notifications, run/lease state, usage metadata, and audit events. These are explicitly the only new write categories; the model cannot directly perform them.

Keep notification email semantics separate from invitations: a chat message/alert commits even when mail is disabled or fails. Existing invitation preflight rules are unchanged.

### Durable processing

- Transactionally create an AI trigger/outbox record when an eligible Client message or issue transition commits. Human sending succeeds independently of later OpenAI delivery.
- Separate routing readiness from answer eligibility. A five-minute answer delay must never delay tagged routing.
- Answer lifecycle: `waiting_for_human -> ready -> leased -> answered | needs_clarification | no_answer | suppressed | failed`. Immediate triggers enter `ready`. A timed-out lease can be reclaimed; completed publication is uniquely keyed to the triggering question and response generation.
- Use server clocks, claim tokens, lease expiry, attempt caps, compare-and-swap transitions, and transactional publication of reply + result + chat event + run completion. A crash/retry must not produce two published AI answers.
- Revalidate human replies, source versions, ownership, feature availability, and run generation just before publishing. If a human reply wins the race, suppress the automatic answer. A later deliberate Client request may start a fresh generation without replaying alerts.
- Coalesce rapid related Client follow-ups, with bounded context, without losing any distinct critical alert or postponing the oldest unanswered question beyond its original eligibility time. Preserve trigger/message lineage so reply and cancellation behavior are testable.
- Changes to tags, issue status, responsible person, or Client ownership invalidate stale pending routing decisions. An already resolved issue does not receive a late automatic escalation.
- Preserve existing project sequence ordering, unread behavior, pagination, historical messages, and reconnect recovery. Extend events and query invalidation only where necessary.

### Proposed additive contract surfaces

- Explicit AI author/participant presentation with service ID, display name, and `kind: service`; legacy human records retain their semantics and need no rewrite. Reply previews must support both author kinds.
- Message assistant metadata: initiating message ID, run/result ID, answer kind, source references, checked time, and viewer-specific availability of a structured result.
- Routing status: original priority/version, currently validated notified person/role, handoff/failure state, and timestamps. Sensitive delivery/usage diagnostics are staff/admin-scoped.
- Scoped read endpoint for structured assistant results and a Client-only idempotent “Ask Lisno AI” action, using project ID plus triggering message ID. Exact endpoint naming follows existing route conventions in the task plan.
- New protected operations stay synchronized across backend route registry, OpenAPI, frontend authorization, and tests. Reject forged service authors and service IDs on human endpoints.
- Dedicated assistant persistence/unique indexes for triggers, runs, routing deduplication, and result snapshots; parity between memory and Mongo chat repository implementations where their contracts change. Preserve existing direct-Mongoose Configuration boundaries instead of forcing a whole-repository refactor.

## 9. Permission matrix

| Actor | Allowed | Not allowed |
| --- | --- | --- |
| Owning active Client | Ask project questions, use existing tags, request an AI answer, read their authorized preliminary/published commercial results | Other projects, internal costs/margins, source DB access, direct model configuration or business mutations |
| Current project staff participant | See shared AI answers and routing relevant to their access; use existing human workflow controls | Receive new financial privileges merely because AI is present |
| Vendor/worker participant | See only shared audience-safe content and existing role-authorized results | Internal/client commercial projections outside their explicit permissions |
| Sole active Super Admin | Existing operation-specific project oversight; assistant failure/routing diagnostics under explicit scoped operations | Bypass sole-identity safeguards or unlogged changes |
| Assistant read service | Bound, filtered reads under recorded project/Client and audience policy | Authentication, impersonation, arbitrary queries, workflow writes, unrestricted files or other projects |
| Application dispatcher | Publish validated assistant replies and communication records; deliver to revalidated recipients | Treat model output as permission, send to arbitrary addresses, mutate approved business artifacts |

## 10. Alternatives and chosen boundaries

| Decision | Recommended option | Alternative / tradeoff |
| --- | --- | --- |
| Model/data connection | Read tools backed by existing domain projections; all sensitive calculations and routing validation remain in Lisno | A project vector store may aid future long-document retrieval, but introduces freshness, deletion, access, and cost work not required for live structured project facts |
| Human fallback timing | User-selected immediate outside hours/unassigned; otherwise five minutes | Immediate answers on every question would be faster but conflicts with the selected human-first timing |
| Chat placement | User-selected existing Project messages only | A private Client assistant is out of scope following clarification |
| Price basis | Configuration selling-price preview, subject to the recorded pricing decision | Matching base-rate multiplication would align with current builder entry amounts but omit the Configuration selling adjustments |

## 11. Compatibility, failure, and operations

- Feature flag defaults to disabled until a server-side model/key and required indexes are configured. Existing human chat continues with absent/invalid provider configuration. Do not expose credentials through browser bundles, API errors, prompts, fixtures, or logs.
- Existing projects get the AI participant through presentation when enabled; old Client messages are not automatically processed or backfilled. New Client follow-ups can reference existing visible history within the bounded context.
- Rollout requires compatible backend/frontend author rendering and indexes before enabling new AI messages. Disable new generation for rollback, but retain read support for already stored service-authored messages and immutable previews. Do not delete message history to roll back.
- OpenAI outage/rate limit/timeout: tagged alerts still route; answer state is explicit; bounded safe retry or Client retry is available. Never display fabricated fallback project facts.
- Email failure: keep the in-app alert, retain delivery status and retry metadata, and avoid provider-error content in Client messages. Remote mail acceptance cannot be promised exactly once after an ambiguous crash; retain existing transport guarantees without claiming more.
- Authorization revoked/project ownership changed: suppress pending reads/publication/delivery as applicable, clear inaccessible frontend caches and drafts, and do not disclose the existence of foreign projects/results.
- Record safe run IDs, source/message versions, policy version, latency, model ID, token usage, retry count, and failure codes. No raw prompts, source documents, secrets, personal contact data, or hidden reasoning in ordinary logs.
- Local verification uses synthetic data and mocked provider/mail boundaries. Any real OpenAI evaluation, customer email, production activation, index rollout, or data migration requires its own appropriate operational authorization and credentials.
- Preserve the existing dirty worktree. No unrelated staging, formatting, commits, deployment, seeding, or security remediation belongs to this scope.

## 12. Acceptance and verification

| ID | Acceptance criterion | Required evidence during implementation |
| --- | --- | --- |
| AC1 | One identifiable AI service participant appears in existing/new project chats; no new Client chat destination or human login | Component/route tests, legacy author and reply rendering, desktop/mobile interaction checks |
| AC2 | New Critical/Important messages and later tag changes create durable appropriate alerts without waiting for OpenAI | Fake provider timeout plus transaction/replay tests, explicit owner, unique owner, ambiguous owner, revoked member, missing fallback, mention deduplication |
| AC3 | Timing matches the user's choice | Fake-clock tests at 07:29, 07:30, 19:59, 20:00 India time; assigned/unassigned; 4:59 vs 5:00; read/typing vs linked/unthreaded reply; explicit Client ask |
| AC4 | Authorization and audience boundaries hold | At least two different Clients/projects and asymmetric staff/vendor memberships; guessed IDs, model-supplied project changes, privilege spoofing, revocation during tool call/publication, cache reset and SSE/result filtering |
| AC5 | Project answers faithfully distinguish status and dates | Confirmed/proposed schedule, vendor reported/site verified/Client accepted, stale source, conflicting lineage, unavailable data, no inferred handover promise |
| AC6 | Suggested lines are real and current | Duplicate names across baskets, draft vs active revision, changed UOM, invalid/incomplete current draft, inactive/missing target, ambiguous match and no-match tests |
| AC7 | Approximate prices use the approved policy with exact arithmetic | Unequal projects/quantities, all three modes, threshold equal/below/above, split In-house rounding, GST once, source version races, quantity precision, overflow, no LLM arithmetic or hidden margin exposure |
| AC8 | Recommendations and existing scope reconcile | Required vs optional, Sub Basket child expansion and missing child quantities, cycle/dedup, missing mandatory price, temporary item, existing included scope, extra quantity vs replacement, multiple rooms |
| AC9 | Business state remains read-only | Before/after assertions for estimate/approval/configuration/order/task/deadline/progress records across successful and adversarial runs; only allowlisted communication writes change |
| AC10 | Runs recover without duplicate replies or unsafe late actions | Replica-set tests for concurrent workers, transaction retry, crash before/after publication, expired lease, human reply race, changed priority/resolution/ownership, provider retry limits, no assistant loops |
| AC11 | UI is compact and usable | Rendered interaction/accessibility tests at desktop/tablet/mobile, safe source links, pending/error/disabled/clarification states, structured amount visibility and keyboard flow |
| AC12 | Existing behavior remains intact | Focused chat/actions/membership/notifications/status/catalogue/calculation suites, route/OpenAPI/authorization contracts, backend/frontend typecheck/build, final integrated regressions and `git diff --check` |

Verification must identify baseline failures separately from regressions and report unrun real-provider/delivery checks. No tests or live-provider evaluation have been run for this specification-only stage.

## 13. Open decisions and prerequisites

- **Pricing basis proposed for approval:** Configuration selling price as detailed in section 7. The separately offered base-rate alternative must not be silently combined with it. Specification approval adopts the written default unless the user requests a revision.
- **Implementation detail to settle in the task plan:** evaluated OpenAI model, context/tool/token limits, transient retry/timeout budgets, safe run retention and operational alert thresholds. These do not widen business permissions.
- **Operational prerequisites, not reasons to block specification:** server-managed OpenAI credentials/account access, an approved model with sufficient limits, configured mail transport for email, and required database indexes before enabling the feature.
- No further decision is needed about chat placement or the five-minute fallback policy; the user already selected them.

## 14. Gate status

This specification and the separate [task plan](../plans/2026-10-09-project-messages-ai-assistant.md) were approved for this integration. The user selected Mode A. Implementation and local verification are authorized; production enablement, live provider calls and customer communication require their own explicit authorization.
