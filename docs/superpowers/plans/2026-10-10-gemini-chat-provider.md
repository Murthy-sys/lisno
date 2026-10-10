# Gemini chat provider: task plan

Date: 2026-10-10 (Asia/Kolkata)
Status: Complete; compatibility correction verified with focused tests and live synthetic checks
Specification: [Gemini provider for Ask Lisno and Project messages](../specs/2026-10-10-gemini-chat-provider-design.md)
Specification approval: received in this conversation.
Execution mode: A, parallel sub-agents (selected by user).

## Outcome and limits

Replace the existing OpenAI transport with the approved Gemini REST provider for both Ask Lisno and Project messages. Keep chat UI, two-minute automatic timing, human-reply suppression, authorization, source validation, server-computed prices, usage budgets and stored history intact.

Specification and task plan are approved; the user selected Mode A. Product implementation is authorized. No dependencies, production configuration, live customer messages, secret rotation, database migration, commit, push or deployment are included.

## T1. Capture baseline and settle the adapter contract

Owner: primary engineer. Dependency: approved plan and execution mode. Acceptance criteria: AC1–8.

- Capture the initial dirty-path inventory and copies/diffs of every target under `/tmp/lisno-gemini-chat-provider-2026-10-10/`. The existing critical-task review changes are unrelated and must remain intact. Do not modify those product files or shared authorization inventories for this migration.
- Recheck the approved spec against current provider, startup, runtime and private-chat code. Recheck the linked official Gemini documentation for the selected model, function declarations/results, structured final output, reasoning controls and usage fields before writing the wire adapter. Record material incompatibilities before proceeding rather than weakening a guard.
- Move the existing `AssistantProvider` and `AssistantProviderContext` types into a neutral `backend/src/services/project-assistant-provider.ts` module. Preserve their shapes, especially `generate`, `reserveAttempt`, `settleAttempt`, request cancellation, private profile support and authorized project resolution.
- Primary updates type-only imports in `app.ts`, `ask-lisno.service.ts`, `project-chat-assistant.service.ts`, `project-assistant-runtime.ts`, `ask-lisno.test.ts` and `project-assistant-runtime.replica-set.test.ts`. Do not change their orchestration or persistence behavior.
- Settle the new adapter export before parallel work: `createGeminiAssistantProvider({ apiKey, model, fetch?, requestTimeoutMs? }): AssistantProvider`. Startup passes a resolved model; configuration owns the approved default `gemini-3.8-flash` so the two slices do not invent different fallbacks.
- Preserve the current generated-result contract and application failure codes. The new provider must not create an additional model call outside the existing four-attempt budget.
- Record the approved native protocol decision and reasoning/token budget before the adapter owner implements it. If model controls cannot meet the approved bounds, resolve that incompatibility explicitly instead of silently raising limits.

Exit: target baseline captured, neutral interfaces and imports settled, adapter export and bounds agreed. Share the exact contract with both writers. In Mode B, primary performs the following slices sequentially inline.

## T2. Implement the Gemini generation adapter

Owner in Mode A: backend implementer for the adapter. Dependency: T1. Covers AC1, AC3, AC5–7.

Owned files:

- Replace `backend/src/services/project-assistant-openai.ts` with `backend/src/services/project-assistant-gemini.ts`.
- Replace/port `backend/tests/project-assistant-openai.test.ts` as `backend/tests/project-assistant-gemini.test.ts`.
- A small provider-local policy/helper module only if extraction makes the existing validation easier to preserve. Agree the path with primary first; do not create a general multi-provider framework.

Implementation:

- Use native `fetch` with a fixed Google `generateContent` endpoint and `x-goog-api-key` header. Validate the model path segment, prevent redirects from forwarding credentials, and keep credentials out of query strings, payloads, logs and returned configuration.
- Port existing conversational instructions, per-request tool availability, argument schemas, source maps, pricing-preview references and final narrative validation. Adapt protocol representation without rewriting established business rules.
- Encode Gemini system instructions, bounded Client history, native function declarations and matching function results. Retain required model response parts/signatures for the next round in temporary memory only. Reject unsupported tool calls, malformed arguments, unexpected response combinations and guessed source IDs. Do not expose model reasoning.
- Preserve private project resolution before project tools, social-message tool suppression and private-only profile tools. Resolution may narrow the next round's Client history as it does today.
- Enforce payload/response size, tool-count/round, request timeout and generation cancellation limits. Handle refusal/safety blocks, non-success finish reasons and invalid structured output through safe existing failure codes; never publish partial results.
- Reserve each HTTP attempt before sending. Validate usage metadata independently from final-answer validity, including incomplete/blocked responses. Include reasoning tokens in accounting without counting total tokens twice; retain reservations when usage is absent or untrustworthy. Preserve rate-limit retry behavior and bounded delays.
- Remove the active OpenAI transport after imports and tests are ported. Do not keep a hidden fallback.

Focused verification:

- Port every existing adapter behavior test, including polite social replies, contextual follow-ups, private resolution, catalogue/recommendation/price flow within four calls, server-only monetary values and source validation.
- Add Gemini request/response fixtures covering exact endpoint/header/schema format, native function result matching, thought-signature round trips, multiple allowed calls, unknown/out-of-order tools, incomplete/refused/oversized/invalid responses, cancellation, 429/5xx, redirect refusal and safe error reporting.
- Exercise prompt/candidate/thought/total usage combinations, absent or invalid counters, settlement on rejected output, and no reservation release after ambiguous transport failure.

Boundary: no edits to startup/configuration, shared contracts, runtime scheduling, repository persistence, pricing calculations or frontend.

## T3. Wire Gemini configuration and startup

Owner in Mode A: separate backend implementer for configuration. Dependency: T1; may run alongside T2 once its export is agreed. Covers AC1–2, AC4, AC6–7.

Owned files:

- `backend/src/config/env.ts`
- `backend/src/server.ts`
- `backend/.env.example`
- `backend/tests/config.test.ts`
- `backend/tests/server.test.ts`

Implementation:

- Read `GEMINI_API_KEY` and `GEMINI_PROJECT_CHAT_MODEL`, using the approved default. Keep `PROJECT_CHAT_AI_ENABLED=false` and the existing token-budget configuration semantics.
- Construct the Gemini adapter through the existing `projectChatAssistant` injection. Both private and project chat must receive that same provider.
- Preserve disabled/malformed configuration behavior and startup without a provider network probe. Human chat, notifications and the rest of the application must continue starting normally when AI is unavailable.
- Remove active OpenAI environment use. Test that an OpenAI key alone cannot enable the Gemini provider and that having both variables never sends the old key or chooses the old provider.
- Update only the example environment, leaving actual `.env` values and Render settings untouched.

Verification: config parsing/defaults, enabled/disabled combinations, malformed key/model, model override, no credential serialization, no network calls during startup, and unchanged worker startup/drain behavior.

Boundary: no adapter internals, tool policy, neutral-interface edits, live secrets, Render blueprint/deployment edits or frontend changes.

## T4. Integrate the two chat journeys and operations guidance

Owner: primary engineer. Dependency: T2 and T3 finished. Covers AC1–8.

- Compare both writer diffs against T1 and reconcile adapter construction, imports, limits, usage accounting and safe failures. Remove dangling OpenAI imports and misleading active setup references without rewriting historical docs.
- Own additional integration coverage in `backend/tests/project-assistant-app.test.ts`, `project-assistant-runtime.test.ts` and `ask-lisno.test.ts` when existing tests do not exercise the concrete Gemini provider with a mocked HTTP boundary.
- Verify an immediate private request and a scheduled project reply reach the new adapter, while private answers remain private. Preserve the two-minute window, human-reply suppression, access revocation/source-change checks, and server-only project listing. Use unequal users/projects for isolation checks.
- Update `docs/operations/project-messages-ai.md` with exact local and Render backend variables, the selected model, Google API/data-handling constraints, safe failure diagnostics, budgets and rollback via the existing flag. Explain that replacing the value of `OPENAI_API_KEY` alone is insufficient. No change to live Render settings or `render.yaml` is needed.
- Do not claim equivalence to OpenAI `store: false` or zero provider retention. Describe only the actual Gemini request mode and the data already allowed by the application.
- Validate read-only business behavior and current financial/source contracts using existing tests; do not change persistent usage/lease/publication semantics to accommodate an adapter failure.

No visual changes are planned. Browser redesign checks are not required for a backend-only provider swap; if implementation unexpectedly changes user-facing components, stop and establish why that is necessary within scope before editing them.

## T5. Independent integrity review and corrections

Owner in Mode A: `integrity_reviewer`; in Mode B: primary inline. Dependency: integrated T4, all writers stopped. Covers AC1–8.

Review the complete change for:

- Header-only credentials, fixed endpoint/redirect safety, no OpenAI fallback and safe diagnostics.
- Gemini protocol compatibility, bounded native history/signatures, validated tools/final output and no hidden reasoning retention.
- Token reservations, thinking-token accounting, failures and four-attempt/timeout bounds.
- Project/user isolation, private profile boundaries, source freshness, financial privacy, human-reply suppression and publication idempotency.
- Existing disabled behavior, historical results and compatibility with both repository implementations.

Consolidate confirmed findings, assign corrections to the owning slice and re-review. Keep review and final verification sequential. Do not use this review to expand into unrelated security or UI work.

## T6. Final verification and handoff

Owner in Mode A: `verification_runner`; in Mode B: primary inline. Dependency: T5 clear and source writers stopped. Covers AC7–8 and the integrated acceptance criteria.

Start with the adapter and configuration tests, then run this integrated lane from `backend/`:

```sh
npm test -- tests/project-assistant-gemini.test.ts tests/config.test.ts tests/server.test.ts tests/project-assistant-app.test.ts tests/project-assistant-runtime.test.ts tests/project-chat-assistant.test.ts tests/project-chat-assistant-routes.test.ts tests/ask-lisno.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno-project-resolution.test.ts tests/ask-lisno-project-list.test.ts tests/project-assistant-narrative.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-pricing.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts
npm run typecheck
npm run build
```

Add any new focused helper test file. Do not repeatedly rerun passing suites unless subsequent changes or unresolved failures justify it. For sandbox-related listener failures, use the authorized escalation process rather than weakening tests.

If repository-backed orchestration or transactional persistence changes despite the expected adapter-only scope, run the relevant synthetic replica-set suites, including `project-assistant-runtime.replica-set.test.ts`, `project-chat-assistant.replica-set.test.ts` and affected data tests. A type-only import move does not itself require a persistence migration or replica-set run.

From the repository root:

```sh
git diff --check
git status --short
```

Confirm the active runtime no longer depends on the OpenAI endpoint or environment variables; distinguish deliberate negative tests and historical migration notes from active use. No frontend build or OCR suite is required unless those consumers actually change. There is no lint script.

Use only synthetic provider fixtures by default. A live smoke test is separate: require an available Gemini key and appropriate authorization, use only synthetic text, do not publish to a real project, and report model/account access, latency and outcome without logging credentials or raw responses. Missing live credentials do not prevent completion of the mocked implementation, but live operation must be reported as unverified.

Record exact commands, counts, exit codes, warnings, acceptance coverage and unrun checks in this plan. Keep test logs/artifacts in the task-specific temporary directory, and stop only task-owned processes. Report the provider change, environment variables, affected areas, remaining live-account limitations, and that no deployment, migration, secret rotation or external customer communication occurred. Do not describe mocked tests as proof of live Gemini quality.

## Dependency graph and ownership summary

`T1 -> (T2 || T3) -> T4 -> T5 -> T6`

T2 and T3 are the only implementation slices that can run safely in parallel. Primary owns the neutral interface, shared imports, both-chat integration and operations documentation. Every agent must be told that others share the worktree and must preserve their edits. In Mode B, all work stays in the primary thread. Keep only one parent phase in progress.

## Acceptance coverage

| Spec criterion | Implementation and evidence |
| --- | --- |
| AC1: Both surfaces use Gemini; no fallback | T2 adapter wire tests; T3 startup tests; T4 concrete-provider integration. |
| AC2: Setup and safe disabled/failure behavior | T3 config/startup matrix; T4 local/Render operations guide. |
| AC3: Existing chat/tool capabilities | Ported adapter cases and Ask Lisno/source/narrative/pricing regressions. |
| AC4: Timing and private/public separation | Runtime, app and private-chat integration tests. |
| AC5: Adversarial, error and usage cases | T2 protocol/accounting fixtures; asymmetric access tests; T5 integrity review. |
| AC6: History and data compatibility | Unchanged contracts/persistence plus existing source, runtime and financial tests. |
| AC7: Integrated verification | T6 focused lane, typecheck, build and hygiene; conditional replica tests. |
| AC8: Honest handoff and remaining constraints | Final plan record and operations guidance distinguish mocked from live checks. |

## Current stage

T1 complete: dirty paths, full diff and sixteen target copies captured in `/tmp/lisno-gemini-chat-provider-2026-10-10/`. Neutral provider types created and six type-only consumers updated. No prior dirty product path overlaps the Gemini implementation.

Protocol settled from current official Google docs: native `generateContent`; `parametersJsonSchema` function declarations; structured `generationConfig.responseFormat.text`; `thinkingLevel: LOW`, `includeThoughts: false`, and the existing 2,048-token combined thought/answer cap. Keep original signed model parts in volatile request history, use matching function response names/optional IDs, and wrap tool results in an object. Usage maps prompt to input and total minus prompt to output, cross-checking available counters; ambiguous usage retains reservations. Sources: [API reference](https://ai.google.dev/api/generate-content), [thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

T2 and T3 assigned to separate backend owners. Primary owns integration tests and operations guidance. No dependencies, actual environment secret edits or live-provider calls.


### Implementation checkpoint

- T2 complete: native Gemini adapter and 112 adapter tests passed; old provider implementation/test removed.
- T3 configuration source complete; config tests 80 passed.
- T4 complete: both-chat concrete Gemini mocked integration added. `npm test -- tests/ask-lisno.test.ts tests/project-assistant-runtime.test.ts` passed 113 tests (60 private, 53 runtime), exit 0. Operations guidance updated. Only type-only imports changed in orchestration.
- Existing dirty unrelated files compared by SHA256 against T1: no changes. `git diff --check` passed.
- Source writers stopped for independent T5 review; final integrated lane remains pending.

### T5 review finding

Independent integrity review found one P2 compatibility issue: Gemini FunctionCall allows omitted `args`, while the adapter initially required it even for zero-argument status/execution/profile tools. Reproduced with a signed native call before any source read. Adapter owner is normalizing omitted parsed args to `{}` while retaining the original signed native content, with regression coverage for zero-argument success and required-argument rejection. No other confirmed findings.

Configuration follow-up: `npm test -- tests/server.test.ts` passed 46/46, exit 0; backend `npm run typecheck` passed, exit 0.

### T5 correction and re-review

The adapter now defaults omitted native arguments to an empty object only in the parsed copy. Required-argument tool validation is unchanged, and raw signed model history is echoed exactly. Three zero-argument success/signature cases and four required-argument rejection cases were added. Adapter suite: 119/119 passed. Independent correction review cleared the P2 with no residual confirmed findings.

T6 assigned to the verification runner on the integrated, stopped-writer worktree.

## Final verification and handoff record

T1–T6 complete. Independent integrity review cleared the optional-arguments correction. Final verification ran after all source writers stopped. No dependencies or lockfiles changed.

From `backend/`, the exact T6 integrated command above passed **620/620 tests across 16 files**, exit 0. The first sandbox run had 603 passes and 17 local-listener `EPERM` failures; the same command reran with required escalation and passed, with no product/test changes. `npm run typecheck` and `npm run build` both passed, exit 0. Successful commands emitted no warnings.

Root `git diff --check` and `git status --short` passed, exit 0. An active-code scan of `backend/src`, `frontend/src`, `shared` and `backend/.env.example` found no OpenAI references. Negative tests and migration notes intentionally mention old variables. SHA256 comparison confirmed all 22 initially dirty unrelated paths are unchanged; only the two Gemini specification/plan documents are excluded from that comparison.

Evidence: `/tmp/lisno-gemini-chat-provider-2026-10-10/verification/`, including `integrated-tests.log` (sandbox limitation), `integrated-tests-escalated.log` (passing run), `typecheck.log`, `build.log`, `active-openai-scan.log`, `dirty-hash-comparison.json`, `diff-check.log` and `final-status.log`. The production build refreshed ignored `backend/dist/`; test caches are also ignored.

All approved criteria AC1–8 are covered: concrete native Gemini fixtures and both-chat service integrations; safe startup/configuration matrix; preserved polite social/profile/project/catalogue/price behavior and model-free project listing; unchanged timing, access and finance regressions; malformed/safety/timeout/accounting coverage; and operations guidance for local/Render backend variables.

Not run: full backend suite beyond the defined integrated lane; frontend/UI, OCR, replica-set tests and migration dry runs because no corresponding implementation/persistence changes occurred. There is no lint script. Live Gemini credentials, model access, quotas, latency and response quality remain unverified. The structured-output plus function-tool combination is Preview in Google documentation and requires a compatible model override if the default is changed.

No actual `.env` secret edits, live-provider calls, customer communications, migrations, production changes, deployment, staging, commits or pushes occurred. The user must configure `GEMINI_API_KEY`, keep `GEMINI_PROJECT_CHAT_MODEL=gemini-3.8-flash` (or validate a compatible override), enable `PROJECT_CHAT_AI_ENABLED=true`, and restart their backend.

## Follow-up: local greeting rejected by Google

The user reported a failed Ask Lisno greeting and confirmed the local backend. Non-disclosing environment checks confirmed AI enabled, a Gemini key present and `gemini-3.8-flash` selected. A read-only Google model metadata request returned HTTP 200 with generateContent supported. No key value was displayed or changed.

A synthetic greeting through the exact adapter reproduced HTTP 400 INVALID_ARGUMENT. Safe diagnostic extraction identified `generation_config.response_format.text.mime_type` as the rejected field; no raw provider error/prompt/result or key was logged. An in-memory transport experiment replacing only `responseFormat` with `responseMimeType: application/json` and the same `responseJsonSchema` returned HTTP 200 STOP and passed adapter validation with one greeting paragraph.

This is a protocol compatibility correction within the approved provider migration, with no scope or behavior change. The two compatible fields replace the rejected format, keeping the identical structured schema, model, tools, timing, accounting, authorization and response validation. Existing native-wire regressions now assert the corrected fields on initial and post-tool requests and preserve the required narrative assertion. Baseline captured at `/tmp/lisno-gemini-response-format-fix-2026-10-10/baseline/`; prior dirty work preserved. Independent narrow review is clear. Final focused tests/typecheck/build pending.

Live diagnostics sent only synthetic text or model metadata, never client/project data or application messages. No application records, actual environment, production or deployment were changed.

### Follow-up verification complete

- `cd backend && npm test -- tests/project-assistant-gemini.test.ts tests/ask-lisno.test.ts tests/project-assistant-runtime.test.ts`: 232/232 passed across 3 files, exit 0.
- `cd backend && npm run typecheck && npm run build`: both passed, exit 0.
- `git diff --check`: passed, exit 0. Independent narrow integrity review clear. No broader suites repeated because this correction only changes two provider request fields and focused wire/integration coverage passed.
- Applied-source live checks used the actual local configured adapter and only synthetic messages/facts. The greeting returned HTTP 200 STOP, one validated narrative paragraph, no source reads. A synthetic project-progress question returned HTTP 200 with two native source calls, then HTTP 200 STOP with one validated fact-backed status paragraph. No provider text or confidential data was logged.
- One earlier applied-source check received Google HTTP 503; one bounded retry succeeded as above. Google service availability remains external to the application.
- No environment changes, application messages/records, production calls or deployment were performed. Restart a local backend that does not watch source changes before retrying the chat. Render requires deploying the corrected backend code; no new environment variables are needed.
