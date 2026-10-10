# Project messages AI assistant: implementation plan

Date: 2026-10-09
Status: Local implementation and verification complete, with pre-existing full-suite failures documented below. Live activation remains outside this execution.
Specification: [Project messages AI assistant](../specs/2026-10-09-project-messages-ai-assistant-design.md)
Specification approval: User replied “Approved” on 2026-10-09 after the specification was presented.
Task-plan approval: User replied “Approved” after the task plan was presented.
Execution mode: A, parallel sub-agents, selected by the user.

## 1. Approved outcome

Implement Lisno AI in the existing Project messages screen, with immediate tagged-request alerts, project answers, Configuration matches, recommendations, and approximate addition prices. No separate private AI chat is included.

The specification approval adopts its written **Configuration selling-price default**, including saved mode margins and low-quantity impact, with GST identified separately. The existing Estimate Builder calculation and approved commercial history remain unchanged. Internal costs and margins never reach the Client or model.

Normal automatic answers wait five minutes during staff hours when a valid subject owner exists. They become eligible immediately outside 07:30–20:00 India time or without a valid subject owner. A wait crossing closing time ends at 20:00. Tagged alerts do not wait for the model or answer timer.

Business records remain read-only. Only application-controlled assistant messages, communication result snapshots, routing/notification records, job state, usage receipts, and audit metadata are written.

## 2. Planning decisions

### Provider and operational defaults

Use OpenAI Responses API through a small backend adapter. Use Node's existing `fetch`, `AbortController`, and Zod validation, with explicit timeout and retry behavior. No dependency or lockfile change is planned; introduce the official SDK only if implementation evidence establishes a concrete need and record that reason before changing the dependency plan.

Default configured model candidate: `gpt-6-luna`, with `reasoning.effort: low`, standard service tier, `store: false`, strict function schemas, and structured final output. Official documentation lists Responses, function calling, and structured output support and describes it as appropriate for focused high-volume work. `gpt-6.1-sol` is a configurable alternative for a later quality comparison, not an automatic escalation or cost fallback. [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

This selection is based on documented capabilities, not a measured Lisno model evaluation. Representative evaluation is part of T6. No real provider request or performance/cost result is claimed at planning time. Keep production activation disabled if the chosen model/account or representative evaluation is unverified.

| Setting | Initial implementation value / behavior |
| --- | --- |
| Feature enablement | `PROJECT_CHAT_AI_ENABLED=false` by default; server-only `OPENAI_API_KEY`, `OPENAI_PROJECT_CHAT_MODEL=gpt-6-luna` |
| Human wait | 300 seconds, with the approved staff-hours/unassigned exceptions |
| Read context | At most 16 recent relevant messages; prioritize the triggering question and linked replies; bounded explicit omission instead of silently truncating a single question |
| Provider payload | At most 32 KiB UTF-8 serialized input per call, including instructions, schemas, message context, prior response items, and tool results |
| Catalogue results | At most 8 candidates per search, at most 3 alternatives displayed; literal escaped search terms and stable-ID resolution |
| Tool loop | At most 3 tool-result rounds and 4 provider HTTP attempts total per response generation, including retries; at most 6 read-tool invocations |
| Output | `max_output_tokens=2048` per provider attempt; a schema-valid compact result is required before publication |
| Time budget | 20-second request timeout and 90-second total active generation budget; budget exhaustion produces a safe failure/clarification state |
| Retry | At most 2 worker attempts; only transient timeout/network/429/5xx failures, with bounded exponential backoff and bounded `Retry-After`; total provider-attempt budget survives reclaim/retry |
| Worker recovery | 180-second lease, heartbeat at most every 30 seconds during work, 5-second recovery scan plus immediate post-commit wakeups |
| Concurrency | At most 2 model calls per process; one active generation per project enforced durably, with cross-process global token reservations |
| Admission | 20 new generations per Client/hour; 60 per project/hour; 500 deployment-wide/day; limits apply to automatic and explicit requests together |
| Token budget | Configurable 1,000,000 provider input + output tokens/day initially; conservative pre-request reservation from payload-byte/output upper bounds, settle to provider usage when known, retain reservation on ambiguous timeout; UTC accounting window shown explicitly in operational docs |
| Retention | Purge transient diagnostic/context material after 30 days using bounded maintenance. Keep message/result snapshots, semantic deduplication receipts, and audits under existing conversation retention; never TTL-delete the only replay fence |
| Health | Expose safe failure codes and counters in the established authorized health/diagnostic pattern. Flag a due job older than 60 seconds or three consecutive provider failures; no customer email or external monitoring integration is added |

These are configurable operational limits, not contractual response times or guaranteed provider spend. Hitting an AI limit must not reject the original human chat message or skip its tagged human alert. Changes to the limits during implementation require evidence and documentation; changes to approved product behavior require a specification revision.

### Shared contracts to settle before parallel writers

- Keep `ChatPerson` and human assignment/issue actors human-only. Introduce a distinct service author type for message authors, reply previews, and service presentation. Do not add an AI role to `ROLE_CODES` or create a User account.
- Use an additive assistant participant field on participant/summary responses if this avoids widening human selection/assignment arrays. The UI renders that identity in the participant list but never offers it as a responsible human, removable person, or typing presence. Existing human participant counts remain human counts; AI is labelled separately.
- Preserve historical human records with no required discriminator migration. New AI records carry `kind: service`, a reserved service ID, and explicit provenance. Human endpoints cannot accept forged service authors or reserved IDs.
- Model final output selects bounded answer blocks: verified fact references, catalogue candidates, clarification requests, or handoff results. Dates, statuses, people, and money are rendered from validated server projections. Do not rely on a free-form model paragraph as the sole source of project facts.
- Keep public answer text and restricted commercial results separate at persistence and serialization boundaries. The shared model tool context cannot contain hidden prices, margin inputs, or approved Client contract amounts. Price calculation can return an opaque result reference to the loop; the server renders authorized amount rows.
- Proposed endpoints, all under the existing `/api/v1` prefix:
  - `POST /projects/:projectId/chat/messages/:messageId/assistant/request`: owning active Client requests an immediate answer; body has idempotency key and expected initiating-message version. Replays return the same request/generation; an explicit later retry creates a new generation only after the previous terminal state.
  - `GET /projects/:projectId/chat/assistant/results/:resultId`: returns only the viewer-authorized projection. Public run/routing state is also available in existing message/summary responses; this endpoint does not make every participant a commercial viewer.
- Authorization operations distinguish Client request, shared result read, and commercial result read. Client commercial access requires current project ownership. Staff commercial access requires the existing corresponding estimate/project scope, not merely `chat.read`; follow current `estimation.estimate.read`/Client-review authorization evidence. Retain operation-specific sole Super Admin rules. Vendors/workers receive only shared content unless an existing explicit commercial authority independently permits more.
- Use existing chat invalidation events for published replies and a compact assistant-state event for waiting/routing/failure changes if required. SSE carries record IDs/versions, not raw restricted result content.
- Lock a read-only context interface for status, execution, published estimate lineage, catalogue and recommendation resolution, and price previews. Project ID and Client identity are server-bound and revalidated on every call. The provider cannot supply a replacement actor/project or call the write-side repository.

## 3. Ownership and safe parallel work

The primary agent owns product interpretation, this plan, all cross-layer contracts, authorization, shared chat adapters, app wiring, and integration. No writer starts before the execution-choice gate.

In Mode A, use bounded native subagents with the following non-overlapping boundaries. In Mode B, the primary implements the same tasks sequentially.

| Owner | Owned work | Forbidden overlap |
| --- | --- | --- |
| Primary / integration | T0, T1, T4, T6; existing contracts/repositories/chat service/models, route/OpenAPI/auth registries, environment/app/server/index wiring, shared frontend API/types, this plan | Does not edit specialist-owned files while their task is active |
| Backend data specialist | T2; new assistant read-context/catalogue/price modules and their tests | No existing chat service/repositories, role/route registry, shared calculators, app wiring, frontend, or model transport changes |
| Backend runtime specialist | T3; new assistant lifecycle/model-adapter/worker/persistence helper modules and focused tests, to the T1 interface | No existing chat repository adapter, notification dispatcher, environment/app/server/index, pricing-reader or frontend changes |
| Frontend specialist | T5; messages components, assistant UI/query hook, scoped CSS, related notification rendering and component tests | No shared frontend API/type/auth files, route/navigation redesign, backend, or data/model code |
| Integrity reviewer | T7; read-only integrated review and evidence | No product source edits or external side effects |
| Verification runner | T8; integrated commands and rendered verification, reports/ignored artifacts | No product source edits; failures return to the file owner |

Proposed new module names below are ownership boundaries, not instructions to duplicate existing functionality. Before adding a file, inspect for an existing compatible module. If a specialist needs an existing shared file changed, send the exact required contract/edit to the primary and continue independent work.

Every worker receives the instruction: **You are not alone in this worktree. Preserve others' changes, do not revert or reformat outside your ownership, and accommodate the frozen shared contracts.**

### Dependency graph

`T0 -> T1 -> [T2, T3, T5 in parallel] -> T4 integration -> T6 -> T7 -> T8 -> T9`

The primary may prepare the independent portions of T4 while T2/T3/T5 run, using the frozen interfaces. T4's completion depends on all three. Final integrity review runs only after all writers finish; final verification runs after review fixes are integrated. At most one parent task is marked in progress, with parallel subtask status tracked beneath it.

## 4. Tasks

### T0. Capture baseline and audit seams

Owner: Primary. Dependencies: task-plan approval and execution-mode selection. Covers: AC4, AC9, AC12.

1. Reconcile the approved spec and this plan against the then-current worktree. Capture initial dirty paths and per-target diffs in an ignored directory such as `/tmp/lisno-project-chat-ai/`. Do not stage or revert anything.
2. Inspect dirty changes to `app.ts`, `server.ts`, `env.ts`, authorization/route registries, index initialization, frontend authorization and notification providers before assigning ownership. Preserve previous vendor execution and workspace work.
3. Record current focused chat/notification/status/catalogue/calculation and contract results. Capture broader baseline failures when broad final comparison will be required; do not treat old recorded counts as current evidence.
4. In Mode A, optionally run two independent read-only audits: (a) author/membership/notification and shared-audience paths; (b) current Configuration pricing/recommendation/approved-estimate lineage. No implementation agent starts before T1 freezes contracts.
5. Verify that mockable boundaries and replica-set tests can exercise reads, commit hooks, dispatcher recovery, and cross-project denial without live provider/customer data.

Done when: target ownership is explicit, pre-existing changes are understood, and the evidence supports the approved scope. If a material authorization or financial conflict changes the spec, stop at that specific decision rather than invent a fallback.

### T1. Define compatible contracts and test fixtures

Owner: Primary. Depends on: T0. Covers: AC1, AC4, AC9, AC10, AC12.

Affected areas:

- `backend/src/contracts/project-chat.ts`, `backend/src/contracts/notifications.ts`, new `backend/src/contracts/project-chat-assistant.ts`.
- `backend/src/repositories/project-chat.ts`, `backend/src/repositories/notifications.ts`; new assistant repository/domain interface as needed.
- `frontend/src/features/messages/projectChatTypes.ts`, `projectChatApi.ts`, and shared assistant API types/query-key definitions.
- Focused contract fixtures under backend tests and frontend test support; primary-owned authorization contract fixtures.

Steps:

1. Define human/service author compatibility, additive assistant presentation, run/routing/result projections, source references, source versions, and restricted commercial payload boundaries.
2. Define transaction-scoped helpers for enqueue, claim, cancel, route, deduplicate notifications, publish, and usage reservation. External HTTP/mail are never available inside transaction callbacks.
3. Define exact read-source interfaces and model tool schemas. Separate private calculation inputs from public context and from model-visible outputs using distinct types and explicit projections.
4. Freeze the request/result routes and error codes, including unavailable source, price incomplete/stale, request conflict, AI limit reached, provider unavailable, and revoked access.
5. Create asymmetric synthetic fixtures: two Clients with different projects/amounts/UOMs, scoped staff, a removed staff member, a vendor with chat access but no Client commercial authority, and one valid Super Admin. Include legacy human messages and service replies.
6. Supply an ownership handoff with exact contracts to T2/T3/T5. Do not leave specialists to invent actor roles, monetary units, source IDs, or notification retry semantics.

Done when: shared contracts compile, compatibility tests define legacy behavior, and the three slices can proceed without shared file edits.

### T2. Implement scoped project reads, catalogue matching, and price previews

Owner: Backend data specialist. Depends on: T1. Covers: AC4–AC9.

Owned new areas: `backend/src/services/project-assistant-context.ts`, `project-assistant-catalogue.ts`, `project-assistant-pricing.ts`, `project-assistant-sources.ts` and dedicated tests. Introduce a smaller module set if responsibilities fit cleanly. Existing source/calculation files are read dependencies; primary handles any necessary narrow extraction.

Steps:

1. Read participant-safe status and filter current execution evidence into facts distinguishing proposed/confirmed dates and reported/verified/accepted completion. Reuse source lineage and conflict handling; never expose full staff DTOs.
2. Resolve published Client estimate context using the existing approval snapshot rules and current ownership. Extract only the authorized financial projection into a separate result store/output path.
3. Implement bounded Main Line candidate retrieval through existing Configuration sources. Resolve latest saved draft else active by stable ID, then validate parent identity, UOM, mode and completeness. No old-revision or arbitrary first-match fallback.
4. Reuse Configuration context validation and mode calculators for selling-price previews. Preserve margin and impact rules, split In-house rounding, decimal precision, and application GST policy. Default a new unspecified line to Standard/Sub-Vendor and disclose it; preserve an unambiguous existing line's approved mode.
5. Expand recommendations using current semantics, including all configured children of a Sub Basket rule, unavailable/temporary targets, required versus optional totals, cycles, deduplication, room identity, and missing quantity states.
6. Compare proposed scope against the approved baseline before presenting additive totals. Require clarification for replacement versus extra quantity; do not invent credits, change approved scope, or use procurement-only overrides.
7. Produce immutable preview data with integer paise, source revisions, source check time, calculation-policy version and assumptions. Emit no restricted financial values to the model-facing result.
8. Return only a read capability to orchestration. Assertions verify that source collections/records remain unchanged.

Done when: focused source/pricing tests pass for both unequal projects and all mode/recommendation edge cases, including a changed current revision and rejected cross-project access.

### T3. Implement provider adapter and recoverable assistant runtime

Owner: Backend runtime specialist. Depends on: T1; uses injected T2 interfaces until integration. Covers: AC3, AC4, AC9, AC10.

Owned new areas: `backend/src/models/ProjectChatAssistant.ts`, assistant repository helper modules that attach to the existing transaction/session, `backend/src/domain/project-chat-assistant.ts`, `backend/src/services/project-assistant-openai.ts`, `project-assistant-worker.ts`, `project-assistant-runtime.ts`, and dedicated tests. Primary owns registration and modifications to existing chat adapters.

Steps:

1. Define immutable trigger identity, response generation, routing event/version, run state, lease token, expiry, eligibility, attempts, usage reservation, and publication/deduplication receipts.
2. Supply memory/Mongo helper implementations with the same contract. Reuse the caller's chat transaction for atomic trigger/message and result/publication work; do not open a second unrelated transaction or weaken replica-set semantics.
3. Enforce unique generation/publication and recipient-trigger receipts. Preserve receipts needed for replay after transient-run retention cleanup.
4. Implement clock-driven readiness, current-owner checks, closing-time boundary, Client explicit request, human linked/unthreaded reply suppression, and no recursive AI triggers. Coalescing cannot defer the original answer eligibility or discard Critical alerts.
5. Implement strict Responses request/response/tool parsing, bounded read-tool loop, timeout/abort, refusal/incomplete/malformed-output handling, token reservations, request budgets, and safe diagnostics. Preserve only protocol-required response items for subsequent calls, in bounded local context; never log hidden reasoning or raw prompts.
6. Treat retrieved text as untrusted. Reject unknown tool names, arbitrary URLs, actor/project overrides, unknown source IDs, invalid facts, unsupported attachments, and hallucinated monetary output. Final answers select server-backed fact/candidate/result blocks.
7. Revalidate current authorization, human replies, source versions and run generation before commit. Publish once with the matching lease/CAS, or suppress/recompute stale work.
8. Implement recovery scans, wakeups, stop/drain behavior and safe failure status. Provider problems do not affect human messages or the independent routing queue.

Done when: mocked-provider and replica-set tests prove the time/replay/lease/race behaviors, including an ambiguous provider timeout, concurrent workers, and a human reply arriving before publication.

### T4. Integrate human routing, notifications, routes, and startup

Owner: Primary. Depends on: T1; completes after T2/T3/T5. Covers: AC1–AC4, AC9, AC10, AC12.

Affected existing files: `project-chat.service.ts`, `project-chat-context.ts` where narrowly required, `repositories/project-chat-memory.ts`, `project-chat-mongo.ts`, `models/ProjectChat.ts`, `models/ChatNotification.ts`, notification interfaces/services/mail templates, chat event/stream helpers, `app.ts`, `server.ts`, `config/env.ts`, `.env.example`, `models/application-indexes.ts`, audit/authorization/route registries, OpenAPI and synchronized frontend authorization contracts. Use a dedicated assistant router/service instead of expanding the existing chat service into a large orchestration implementation.

Steps:

1. Add virtual service presentation and safe stored author/reply serialization while retaining human membership and issue capability logic.
2. On eligible Client send/tag transitions, atomically record the trigger and immediately create a tagged notification for the explicit/known owner or validated administrative fallback. Do not defer this insertion to an LLM job.
3. Resolve explicit owner first, then known source responsibility; asynchronously validate a bounded model topic/owner nomination when needed. Deliver at most one additional handoff alert for a distinct validated owner, preserving versioned receipts.
4. Unify semantic deduplication with existing mention notifications and preserve mention oversight. Changes to priority, resolution or human assignment suppress stale routing. Keep AI routing receipts separate from the human issue's responsible field.
5. Extend notification presentation/email actor handling for service provenance. Revalidate recipient membership and originating Client authority, including the existing demo-account external-delivery restriction; a service actor must not bypass that restriction.
6. Register protected routes and explicit authorization operations; add viewer-safe result reads, no-store behavior for sensitive responses, spoofing rejection, source-link allowlists, OpenAPI inventory and contract fixtures.
7. Wire runtime dependencies, model configuration, environment validation, indexes, post-commit wakeups, background recovery, and shutdown. Invalid/missing provider configuration disables generation safely without crashing unrelated human chat or inventing delivery success.
8. Preserve notification mail retries and invitation preflight semantics. Only mock/local mail transports are used during verification.

Done when: an integrated synthetic Client message produces the correct immediate alert and later assistant answer, rejected viewers cannot recover prices by any response path, and startup/shutdown/index tests pass.

### T5. Add compact assistant presentation to existing chat

Owner: Frontend specialist. Depends on: T1; uses contract fixtures until T4. Covers: AC1, AC3, AC4, AC11, AC12.

Owned files: message UI components including `ChatParticipants.tsx`, `ChatTimeline.tsx`, `ProjectChatHeader.tsx`, necessary composer/issue menus and `ProjectChatProvider.tsx`; new `ChatAssistantResult.tsx`, `useChatAssistant.ts`, scoped assistant styles; required notification rendering updates and their tests. Primary supplies API/types/auth updates. Existing dirty notification/provider changes must be understood at handoff.

Steps:

1. Show Lisno AI once with a clear service label and compact explanatory text. Keep human assignment/mention/removal selectors human-only unless a dedicated explicit assistant action is used.
2. Render AI reply identity and source links safely, with waiting/answering/suppressed/unavailable/failed/clarification states and accessible ask/retry controls. Do not stream unvalidated partial claims.
3. Render authorized structured price blocks with approximate/partial/stale states, required/optional additions, assumptions, UOM and GST. Never use frontend filtering as the confidentiality boundary or fabricate missing amounts.
4. Scope all queries and transient state by authenticated identity and project. On message/assistant events invalidate only affected state; cancel/remove restricted results on logout, project access revocation and account switch. Do not retain a prior user's price result during an in-flight switch.
5. Preserve existing send/retry/attachment/audio/history/read/issue controls and scroll position behavior. Reuse established typography, colors and controls without adding a visual framework, icon package or navigation redesign.
6. Add rendered tests for service identity, human-only controls, timing states, finance visibility, stale/error/disabled behavior, keyboard interaction and source-link safety.

Done when: fixture-backed component interactions pass and the rendered chat page is compact at 1440, 768, 390 and 320 CSS pixels with no horizontal overflow. Final backend-integrated browser checks belong to T8, so T5 does not wait on T4 to finish its owned slice.

### T6. Integrate end to end and evaluate behavior

Owner: Primary. Depends on: T2–T5 complete. Covers: AC1–AC12.

1. Reconcile every contract, source ID, monetary unit and assistant state across persistence, API, notification delivery, SSE and UI. Inspect the complete delta against T0's baseline.
2. Build a deterministic synthetic scenario set for timeline/status, changed schedules, current scope additions, recommendation groups, ambiguous Main Lines, insufficient quantities, cost-extraction attempts, prompt injection, foreign project IDs and conversation follow-ups.
3. Run end-to-end mock-provider flows through real route/service/transaction paths. Reopening the page and restarting a worker must preserve correct state without re-notifying or republishing.
4. Add model evaluation fixtures and a separately opt-in live runner. Do not send production/client data. With available credentials and explicit authority for a live evaluation, measure response correctness, route nominations, latency, usage and refusal behavior for the configured model. Otherwise report live model evaluation as unrun and leave activation disabled; mocked tests do not establish real-model quality.
5. Write focused operational documentation for environment variables, feature enablement, validated indexes, provider/mail failure states, token limits, privacy boundaries, safe diagnostics and rollback. Use the existing operational docs structure.
6. Resolve confirmed failures before reviewers run. Do not “fix” pre-existing unrelated failures or lower assertions to hide a regression.

Done when: all acceptance criteria have mapped evidence or an explicit remaining external prerequisite, source code is ready for review, and writers have stopped.

### T7. Perform integrated integrity review

Owner: `integrity_reviewer` in Mode A; primary sequential review in Mode B. Depends on: T6. Covers: all ACs, particularly AC4/AC7/AC9/AC10.

Read-only review priorities:

- Service identity cannot impersonate a human, acquire roles, receive human assignments, or bypass existing access/demo-delivery checks.
- Every DB/model read and result publication is project-bound; restricted amounts never enter shared prose, notifications, reply previews, lists, SSE, telemetry, or a foreign cache.
- Current Configuration and approved history stay distinct; all mode/GST/quantity/recommendation calculations reconcile with source functions and immutable versions.
- Immediate alerts remain independent of provider/answer timers; replay and mention overlap do not duplicate notifications.
- Human replies, escalation changes, source edits, revocation and worker crashes cannot publish stale answers or bypass counters/limits.
- Existing app startup, route registry, new indexes, memory/Mongo behavior, shutdown and disabled-feature paths stay compatible.

Primary routes findings to the original file owner, waits for fixes, and obtains targeted re-review. No final verification during concurrent product edits.

### T8. Run final integrated verification

Owner: `verification_runner` in Mode A; primary sequential verification in Mode B. Depends on: T7 findings resolved. Covers: AC1–AC12.

Run focused new tests first, then affected regressions and full checks below. Use replica-set integration tests for transactional changes. Keep all provider and email boundaries mocked unless a separate live evaluation was authorized.

Backend focused commands (resolved to the implemented test files):

```sh
cd backend
npm test -- tests/project-chat-assistant.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-pricing.test.ts tests/project-assistant-openai.test.ts tests/project-assistant-runtime.test.ts tests/project-assistant-app.test.ts tests/project-chat-assistant-routes.test.ts
npm test -- tests/project-chat-assistant.replica-set.test.ts tests/project-assistant-data.replica-set.test.ts tests/project-assistant-runtime.replica-set.test.ts
npm test -- tests/project-chat.test.ts tests/project-chat-actions.test.ts tests/project-chat-membership.test.ts tests/project-chat-repository.test.ts tests/project-chat-routes.test.ts tests/notifications.test.ts tests/notifications-routes.test.ts tests/chat-hours-and-daily-critical-tasks.test.ts tests/chat-mention-mailer.test.ts
npm test -- tests/project-chat-mongo.replica-set.test.ts tests/project-chat-actions.replica-set.test.ts tests/notifications-mongo.replica-set.test.ts tests/project-chat-stream-process.replica-set.test.ts tests/project-status-service.test.ts tests/estimator-catalogue-estimate.replica-set.test.ts tests/ai-estimator-knowledge-mode-calculation.test.ts
npm test -- tests/config.test.ts tests/server.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts
npm run typecheck
npm test
npm run build
```

Frontend focused/full commands:

```sh
cd frontend
npm test -- src/features/messages src/features/notifications src/api/authorization-contract.test.ts
npm run typecheck
npm test
npm run build
```

Repository hygiene: `git diff --check` and `git status --short`; inspect untracked source files as well as tracked diffs. There is no lint script; do not claim lint passed. No OCR behavior changes, so OCR/model checks are not required.

Rendered matrix: actual chat UI with synthetic API/provider fixtures at 1440/768/390/320 pixels; Client vs authorized staff vs restricted vendor; assigned/unassigned, tagged/normal, waiting/replied/failed/disabled, partial/complete/stale price, keyboard/focus and screen-reader names. Check accessibility, console/network errors, overflow, reconnect behavior and account/project switching. Do not capture real personal/project data.

Map results to the specification's AC1–AC12 table in the final evidence log. Separate baseline failures, infrastructure failures, deterministic regressions and genuinely unrun checks. Preserve exact commands/results and ignored artifact paths under `/tmp/lisno-project-chat-ai/`.

Done when: integrated checks support the claimed local outcome, or any remaining failure/prerequisite is explicitly reported without calling partially verified work complete.

### T9. Handoff and stop at the deployment boundary

Owner: Primary. Depends on: T8. Covers: AC12 and operational constraints.

Update this plan's task status/evidence. Report principal behavior, source/authorization decisions, files, dependency changes if any, exact validation, unrun live evaluation/delivery checks and remaining risks.

No commit, push, production activation, database backfill/seed, live index rollout, real customer messages or live OpenAI evaluation is implied by implementation-mode selection. If those actions are later requested, prepare the concrete verified change and operational evidence before asking for any remaining exact-action authorization.

## 5. Acceptance trace and review checkpoints

| Spec acceptance criteria | Primary tasks | Verification emphasis |
| --- | --- | --- |
| AC1: existing chat/service participant | T1, T4, T5 | Legacy compatibility, AI provenance, no new destination |
| AC2: immediate human routing | T3, T4 | Outage-independent insertion, explicit/fallback ownership, mention/version deduplication |
| AC3: timing | T3, T5 | India-time boundaries, exact five minutes, reply suppression, explicit ask |
| AC4: authorization/audience | T1–T6 | Unequal Client projects, scoped staff/vendor identities, revocation and all response channels |
| AC5: faithful project facts | T2, T3, T6 | Proposed/confirmed, reported/verified, missing/conflicting source |
| AC6: current Main Line matches | T2 | Stable IDs, current draft precedence, duplicate names, incompatible UOM |
| AC7: exact approximate pricing | T2, T5 | Three modes, paise/GST/impact rounding, no hidden margins, no estimate mutation |
| AC8: recommendations/scope | T2, T6 | Required/optional, Sub Basket child expansion, incomplete targets, room-aware deduplication |
| AC9: business read-only | T1–T4, T6 | Allowlisted communication writes; unchanged business records |
| AC10: background reliability | T3, T4, T6 | Replica-set races, leases/CAS, crash recovery, bounded retries and limits |
| AC11: compact accessible UI | T5, T8 | Width/state/identity matrix and rendered interactions |
| AC12: regression/operations | T0, T4, T6–T9 | Current baseline comparison, contracts/OpenAPI, type/build/full tests, safe rollout docs |

## 6. Status ledger

Specification approved; task plan approved; user selected **A (parallel sub-agents)**. Local implementation is authorized. Deployment, external provider calls and customer communication remain outside this execution.

- T0–T6: implemented; focused verification passed.
- T7: complete. Independent review findings were fixed and re-reviewed with no remaining blockers.
- T8: complete. Full suites compared with the captured baseline; newly introduced failures corrected and affected checks rerun.
- T9: complete. Operational guidance and verification evidence recorded; no deployment or live provider/customer action performed.

Initial dirty paths and tracked changes were captured before writers in `/tmp/lisno-project-chat-ai/initial-status.txt` and `initial-tracked.patch`. Preexisting vendor execution, invitations and Site Manager changes were preserved. No dependency changes.

Current evidence: backend shared integration 8 files / 266 tests passed; real bridge Mongo suite 8 tests passed; runtime/provider/replica/config/server suites 143 passed; frontend focused 95 passed plus rendered 1440/768/390/320 checks with no overflow and 0 axe violations. These are preliminary slice checks, not the final integrated result.

Integrity fixes: current aggregate Site Manager Client acceptance with validated source lineage, final publication sharing the existing completion fence, generation-aware notification ordering/acknowledgment/rendering, and bounded related-message coalescing. Final focused reruns: bridge/notification/routes 41 tests across 5 files; data/source/pricing 50 across 3 files including 16 replica cases; runtime/provider/replica 53 plus final runtime 35; notification UI/API 34 across 4 files. The real two-session legacy acceptance race and old-alert resurfacing past the first twenty notifications both pass. No live provider or email calls were made.

Baseline full suites recorded before shared changes: backend 11 failed / 233 passed files (19 failed / 4,884 passed tests; includes timing/infrastructure failures), frontend 8 failed / 284 passed files (28 failed / 4,445 passed tests). Final results must be compared with these logs rather than claiming an initially clean baseline. Sandbox-only socket failures were rerun with test permissions.

## 7. Final verification and handoff

The independent integrity review closed all four findings. A separate verification runner checked the integrated worktree. No remaining newly introduced failure was observed after the two final corrections: the frontend permission-order test now includes the two assistant permissions, and the optional notification-read OpenAPI object omits an invalid empty `required` array.

| Check | Actual result |
| --- | --- |
| Backend `npm run typecheck` and `npm run build` | Passed; repeated after the OpenAPI correction |
| Frontend `npm run typecheck` and `npm run build` | Passed; build retains large-chunk warnings |
| Backend `npm test` | 5,025 passed / 23 failed across 254 files before the final schema correction; all 10 new assistant suites passed, 131 tests |
| Backend `npm test -- tests/api-docs.test.ts` after correction | 53/53 passed |
| Backend `npm test -- tests/estimate-plan-review-client.test.ts tests/production-super-admin-bootstrap.test.ts` | 32/32 passed; clears the three new full-run timing/cascade failures |
| Frontend `npm test` | 4,463 passed / 28 failed across 294 files before the permission expectation correction |
| Frontend `npm test -- src/api/authorization-contract.test.ts` after correction | 6/6 passed |
| Baseline comparison | Remaining 19 backend and 27 frontend observed failures match exact pre-change test names. One prior frontend accessibility failure passed. Full suites remain non-green; no invented aggregate post-rerun total is claimed |
| Rendered assistant UI | Synthetic fixtures at 1440/768/390/320 px: no horizontal overflow, 0 axe violations; rendered interaction, stale/restricted results and identity-switch checks passed |
| Repository hygiene | `git diff --check` passed; no package or lockfile changes; pre-existing dirty work preserved |

Detailed command output and failure names: `/tmp/lisno-project-chat-ai/backend-final-summary.log`, `frontend-final-summary.log`, `backend-final-api-fixed.log`, `backend-final-timing-rerun.log`, `frontend-final-auth-fixed.log`, and `final-verification.md`. Visual artifacts are under `/tmp/lisno-project-chat-ai/visual/output/playwright/`.

The remaining backend baseline failures concern Configuration references/pricing/checklists, Procurement request expectations, leads/full-journey expectations and existing media/dashboard/rollback timing cases. Frontend baseline failures concern Configuration screens/layout, existing accessibility/auth timing, Designer furniture, LeadDashboard and enterprise harness coverage. These were not changed or hidden to make this feature appear clean.

Principal implementation areas are the assistant bridge/runtime/source/pricing/provider services, assistant persistence and contracts, existing chat/notification adapters and authorization/OpenAPI registration, and compact message/result/notification components. No dependency or OCR change was needed.

No live OpenAI evaluation, real email delivery, production index rollout, migration/backfill, deployment, commit or push was performed. Generation remains disabled by default. Use [the operations guide](../../operations/project-messages-ai.md) for server-only credentials, model verification, feature enablement, limits and rollback. Mocked checks establish integration behavior, not live model/account quality.

### Follow-up: Client Ask Lisno entry point

The user reported that the floating Client launcher still displayed “Coming soon.” This was an overlooked entry point to the approved existing Project messages experience. The launcher now opens the current project's conversation when the registered `/client/projects/:projectId` route provides an unambiguous project, otherwise the existing conversation list. It remains a single Project messages workflow, with no separate AI chat or invented availability. Its enabled cursor and copy are updated.

Files: `AskLisnoLauncher.tsx`, new `AskLisnoLauncher.test.tsx`, the existing estimate panel launcher assertion, and one cursor declaration in `frontend/src/styles/index.css`. Rendered navigation/keyboard tests and related suites passed: `npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/estimates/EstimateReviewPanel.collapsible.test.tsx src/features/estimates/ClientFullPlanNav.test.tsx`, 22 tests across 3 files. Frontend typecheck and `git diff --check` passed. Full suites/build/browser QA were not repeated for this bounded navigation fix.

A presence-only local configuration check found no `OPENAI_API_KEY` in the backend `.env` or current shell and no enabled AI flag; no secret values were printed. The user will configure the key locally and in the Render backend environment. The truthful unavailable state remains until backend enablement and restart. No credentials or production settings were changed by the agent.

### Follow-up: supplied local OpenAI key

The user subsequently added their key to the local backend environment. A presence-only check confirmed it was available; no credential value was displayed. The local AI flag was still off, so `backend/.env` was updated to `PROJECT_CHAT_AI_ENABLED=true`, preserving the supplied key and other settings.

Live synthetic checks passed using the configured `gpt-6-luna` model: a Responses API connectivity request returned HTTP 200/completed (15 input and 5 output tokens), and the actual application provider adapter completed a grounded status answer through one synthetic read-tool call and two provider requests (1,276 input and 73 output tokens). The temporary adapter harness is `/tmp/lisno-project-chat-ai/live-provider-check.mts`. It has no embedded credentials and never accesses the project database or publishes messages. These are smoke checks, not a representative model-quality or production evaluation.

The already-running development process was not stopped or restarted and still needs a fresh invocation to load the new environment. A watcher-only child restart may retain inherited settings. No demo bootstrap, database mutation, customer communication, deployment or Render environment change was performed during this activation check.
