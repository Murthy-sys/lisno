# Python assistant for Ask Lisno and Project Messages: task plan

Date: 2026-10-15
Status: Specification and task plan approved; execution mode A selected. Product implementation, integrity review and focused local verification finished. Broader integration and independent-host validation remain pending; this is not a production-readiness sign-off.
Approved source: [Python assistant specification](../specs/2026-10-15-python-ask-lisno-assistant-design.md), approved by the user on 2026-10-15 after the Project Messages and no-cloud-API revisions.

## Delivery objective and boundaries

Deliver one independently hosted Python assistant for private Ask Lisno and Project Messages, with existing Node authorization and database services as the source of truth. Both chat paths must stop using Gemini or any other cloud AI API. Clients may receive their own project information and published/approved customer prices; Configuration rates, internal costs/margins, vendor pricing, unpublished estimates, and other clients' information remain inaccessible through the assistant.

Keep all actual prices in Node and the authorized result response. Python receives only bounded, privacy-filtered context and opaque references. Introduce a protected `projectPricing` field rather than placing prices in general facts or narrative. Preserve the mobile chat design and the shared assistant's current Client-triggered workflow, human-response window, leases, notifications, and per-viewer permissions.

This plan authorizes no work until its approval and the separate execution-mode choice. It does not authorize deployment, provisioning/purchases, live model downloads, production reads/writes, secret installation, commits, pushes, migrations, or customer communication. Unrelated AI estimation/OCR behavior stays outside scope.

The Mac is for source editing and lightweight checks using fake model responses. Do not install or run a model runtime, download weights, train, run inference/benchmarks, create an AI daemon/tunnel, or run resource-intensive container/native builds here. Prepare independent-host packaging and evaluation commands without executing them locally. A separate server or remote verification runner is still needed for model, deployment, and heavier integration evidence.

## Current evidence and implementation consequences

- `backend/src/server.ts` and `app.ts` currently configure the same Gemini provider for both chat surfaces. Replace both call paths; keep separate feature enablement and no implicit legacy fallback.
- The provider interface contains scoped callbacks. Freeze a versioned JSON step protocol before Python/backend writers proceed; Node executes tool intents, not Python database queries.
- `project-assistant-sources.ts` already has scoped snapshots and freshness witnesses, but its existing price preview uses current Configuration. Add a narrow published/approved-estimate reader using the established Client presentation and finance-lineage helpers. Do not use the addition calculator for either chat surface.
- `project-chat-assistant.service.ts` restricts the old commercial object per viewer while ordinary facts remain shared. The new protected price object must be filtered before serialization, including on stale/revoked/legacy reads.
- Shared results are immutable Mongo records; memory and Mongo adapters both support structured results. Add optional validated fields and preserve existing records. No backfill is needed; unclassified old answers get the specified safe refresh state.
- Web result requests are currently typed HTTP calls, while mobile already has runtime schemas. Introduce aligned runtime validation for the new contract on both clients; TypeScript types alone do not enforce privacy or shape correctness.
- The repository is heavily dirty. Relevant pre-existing edits include backend provider/runtime/app files, frontend Ask Lisno/query files, and untracked mobile Ask Lisno/message components. No worker may assume these match HEAD or overwrite their prior content.

## Ownership and sequencing rules

The primary agent owns the approved interpretation, protocol/public-contract decisions, cross-language fixtures, configuration/wiring, OpenAPI reconciliation, plan updates, and final integration. Only one parent task is marked in progress at a time. Subtasks may run concurrently within that parent when mode and dependencies allow.

| Boundary | Owner in Mode A | Owned paths/responsibility |
| --- | --- | --- |
| Contracts and integration | Primary | `backend/src/contracts/ask-lisno.ts`, `project-chat-assistant.ts`, new internal protocol contract; `project-assistant-provider.ts`; shared protocol fixtures; `backend/src/server.ts`, `app.ts`, `config/env.ts`, `.env.example`; assistant OpenAPI definitions and any required registry inventory edits; this plan. |
| Backend implementation | `backend_implementer` | Scoped source/privacy modules; Python transport adapter; private/shared orchestration; assistant result model/repositories/routes; focused backend tests. Excludes primary-owned contract/configuration files unless ownership is explicitly transferred. |
| Python service | Native implementation worker | Entire new `assistant-service/`, its package metadata, runtime adapter, tests, container/deployment documentation, and remote evaluation harness. No edits to `ocr-worker/`, backend, or consumer workspaces. |
| Web consumer | `frontend_implementer` | Existing Ask Lisno and Project Messages API types/parsers, answer rendering/query behavior, and tests under `frontend/src/features/ask-lisno/` and `frontend/src/features/messages/`. No unrelated layout or shared design-system changes. |
| Mobile consumer | Native implementation worker | Ask Lisno and Project Messages parsers, protected-price presentation, query lifecycle, and tests under the corresponding `mobile/src/features/` directories. Preserve launcher, header/composer styling, and disabled attachment controls. |
| Integrated review | `integrity_reviewer` | Read-only review of final integrated changes and acceptance evidence. |
| Final verification | `verification_runner` | Risk-based checks after writers and corrective edits finish; no product-source changes. |

Tell every writer they are not alone in the worktree, identify existing dirty targets, and prohibit reverting others' work. Share contract changes through the primary immediately. A worker needing an unowned path must return that dependency rather than silently crossing ownership.

Mode B performs the same tasks inline with no implementation agents. Before the execution-mode gate there are no subagents. In Mode A use at most three child agents concurrently, accounting for the primary's fourth slot.

## Dependency-ordered tasks

T0–T8 implementation is in place: baseline inventory, target snapshots and hashes are in `/tmp/lisno-python-assistant-qa/baseline/`; three independent read-only audits completed. Wire authority is `backend/src/contracts/assistant-step.ts`, shared fixtures are `contracts/assistant-step-fixtures.json`, and public prices use `projectPricing` with `project-publication-v1` disclosure classification. T9's integrity review and focused local checks finished: no remaining confirmed review defect, 871 focused tests passed, and all three workspace type checks passed. T9's broader integration/rendering evidence and T10 remain pending because no independent verification/model host is available. Implementation status does not mean the unrun integration, rendering or model acceptance checks passed.

### T0. Capture the implementation baseline

Owner: primary. Dependencies: plan approval and execution-mode selection. Acceptance: AC9.

- Capture full dirty-path inventory and per-target diffs; snapshot/hash untracked files that a writer will touch. Keep evidence in an ignored temporary directory, proposed `/tmp/lisno-python-assistant-qa/`, without environment values, tokens, or customer records.
- Reconcile approved requirements with the current source, particularly Client estimate publication/approval lineage, shared-result authorization, and existing tests. Preserve the latest mobile reference implementation.
- Record the exact available verification environments. Do not assume that a remote runner or AI host exists. Run only proportionate lightweight baseline checks locally; record unrelated existing failures rather than fixing unrelated features.

### T1. Freeze cross-layer contracts and privacy classifications

Owner: primary. Dependencies: T0. Acceptance: AC1, AC3, AC5, AC6, AC8, AC10, AC12.

- Define the versioned internal step request/response, authoritative surface/capabilities, remaining deadline, bounded history/tool envelopes, allowed tools, report references, and usage metadata. Preserve the current limits and mandatory-message handling. Response validation must reject unknown fields, mismatched request/step IDs, forbidden tools, malformed arguments, and unknown report/fact references.
- Define the protected public `projectPricing` shape, including immutable publication/approval lineage, currency, bounded customer-visible lines, exact paise totals/tax, and unavailable/conflicting states. Distinguish incomplete data from a valid zero; distinguish a published quote from an approved contract. Never include Configuration IDs/rates, internal modes, cost/margin formulas, or private URLs in this object.
- Define a server-owned disclosure-policy marker and how it is stamped, persisted, checked before publication, and recognized at read time. It is never trusted from Python/model output.
- Define strict allowlists for every model-facing tool projection and message/history processing. Map known identifying references to request-local aliases; do not use a regex-only redactor as proof that arbitrary free text is safe. Unminimizable input gets a safe clarification/refusal without echoing it.
- Add shared synthetic JSON contract fixtures with valid/invalid/malicious examples. The fixtures contain no customer data and are consumed by both language suites. Lock the `commercial: null`, protected-price-only, and legacy-unavailable semantics before consumer writers begin.
- Keep public route authorization unchanged. Document any additive result-field changes in the existing assistant OpenAPI definitions; do not introduce a public Python endpoint or new staff capability.

### T2. Build scoped published-estimate reads and privacy projections

Owner: backend implementation lane. Dependencies: T1. Acceptance: AC3, AC5, AC10, AC11.

Primary affected areas: new focused services such as `project-assistant-estimate.ts` and `project-assistant-privacy.ts`; `project-assistant-sources.ts` and `project-assistant-context.ts`; focused source and estimate-reader tests. Existing `estimate-client-presentation.ts`, `estimate-client-review.service.ts`, and `project-finance.service.ts` are reuse/reference points; do not rewrite their business rules.

- Add a bounded, project-scoped `project_estimate` read using immutable customer review snapshots and existing recipient/membership checks. Approved prices must reconcile with `currentEstimationApproval` and canonical finance approval lineage; published quotes must be visibly distinct. Resolve multiple eligible sources without guessing and never substitute a draft or live Configuration price.
- Project shared scope is fixed by the run; private scope uses the existing authorized resolver. A model argument cannot set project/Client/estimate authority. Preserve before/after read authorization and include immutable source references in server-only freshness witnesses.
- Keep complete monetary values in Node-only report maps. Model-visible results contain safe descriptors and opaque report handles. Do not serialize arbitrary existing fact bundles, contact details, addresses, documents, free-text notes, or hidden metadata.
- Reject Configuration/catalogue/recommendation/addition-preview tool access at the capability boundary. Add tests that those readers are never called through either assistant path, even with forged tool names.
- Keep the memory/testing ports aligned with the production reader's contract without inventing finance values where the current memory source has no immutable snapshot. Use injected typed synthetic source fixtures for unit tests and genuine replica-set integration for Mongo lineage/freshness.
- Verify two unequal projects/Clients, matching and mismatched review IDs, changing approvals/ownership/sessions, differing configured/vendor/customer prices, legacy unit conversion, and source conflicts. Sensitive sentinels must be absent from projected messages/tools and safe failures.

### T3. Implement the Python service with a self-hosted runtime adapter

Owner: Python service lane. Dependencies: T1. Acceptance: AC1, AC4, AC5, AC6, AC9, AC10; prepares AC2/AC7/AC13.

- Create isolated `assistant-service/` packaging for Python 3.11+, FastAPI, Pydantic, asynchronous HTTP, server startup, and model-free tests. Pin compatible dependency versions after checking official documentation during implementation. Avoid ML training packages, downloaded weights, cloud AI SDKs, LangChain-style dependencies, and changes to other workspace lockfiles.
- Implement authenticated stateless step handling, strict shared-fixture validation, surface capability restrictions, deadlines, cancellation, queue/concurrency bounds, and minimal health/readiness endpoints. Reject oversized bodies before unbounded parsing; bound response/model-output reads too.
- Implement conservative deterministic intents plus schema-constrained model steps for ambiguous natural language. Handle mixed greeting/business requests and supported follow-ups; preserve fixed shared-thread scope. Do not invent missing answers or let a greeting recognizer discard a substantive question.
- Call only the fixed private self-hosted model endpoint with the pinned allowed model. Validate endpoint/model settings, disable redirects and unintended proxy/fallback routing, and require local-model availability. No cloud keys, remote models, automatic runtime downloads, external search, or AI judge calls.
- Keep generated factual wording within the approved checks; use deterministic sensitive-state wording and opaque estimate references. Validate all model output as untrusted. Neither the service nor its model receives real price amounts or DB credentials.
- Tests use injected fake HTTP/model responses with external network access denied. Cover malformed/oversized output, refused/unknown tools, wrong surface, hostile history, secret sentinels, timeout/cancel, saturation, service authentication, health without model readiness, and usage validation. This task performs no local real-model installation or execution.

### T4. Add web contract validation and protected-price presentation

Owner: web lane. Dependencies: T1. Acceptance: AC8, AC9, AC10, AC12.

Affected paths: `frontend/src/features/messages/projectChatAssistantTypes.ts`, `projectChatApi.ts`, `ChatAssistantResult.tsx`, `useChatAssistant.ts`; `frontend/src/features/ask-lisno/askLisnoApi.ts`, `AskLisnoPanel.tsx`; their existing/new focused tests. Add a small feature-level shared price component/parser only if it prevents duplication across these two surfaces.

- Validate additive `projectPricing` and identity/source fields at runtime, without changing existing routes or broadening permissions. Reject contradictory access/price payloads; no legacy `commercial` fallback. Handle missing optional fields as unavailable.
- Show customer publication/approval label, requested price breakdown, source/version, and checked-at information. Preserve currency/paise conversion and missing-value labels. Keep restricted/stale/legacy states clear and never render a protected price while access is rechecked.
- Keep query state scoped by identity/session/project/result. Verify logout/account switch, access revocation, refetch failure, source refresh, and retry behavior. Do not persist protected result data offline.
- Preserve existing layout and controls. Add meaningful rendered tests for both chat surfaces, keyboard access, long values, and permitted/restricted/stale prices; broader responsive QA occurs after integration.

### T5. Add mobile contract validation and protected-price presentation

Owner: mobile lane. Dependencies: T1. Acceptance: AC8, AC9, AC10, AC12.

Affected paths: `mobile/src/features/ask-lisno/askLisnoApi.ts`, `AskLisnoAnswer.tsx`, related fixtures/tests; `mobile/src/features/messages/chatAssistantModel.ts`, `ChatAssistantMessage.tsx`, related tests. Touch hooks only where required to preserve scoped cache/recheck behavior.

- Implement the same strict pricing/access semantics as web with the frozen fixtures. Keep Configuration addition amounts out of both surfaces and render published/approved customer prices using exact paise conversion.
- Cover restricted, stale, missing, loading, unavailable, and legacy results; source labels; Retry/Refresh; identity changes and application resume. Prevent cached authorized prices from flashing during access revalidation.
- Preserve the approved mobile reference chat, floating launcher, timestamps, composer, disabled photo/file hints, and navigation behavior. Do not redesign shared chat.
- Add focused React Native rendered interaction/accessibility tests. Verify narrow widths and large fonts in the final rendering lane; native export/emulator work belongs on the independent verification runner.

### T6. Integrate the Python provider with both backend workflows

Owner: backend implementation lane. Dependencies: T2 and T3; public contracts from T1. Acceptance: AC1, AC3, AC5, AC6, AC8, AC10, AC11, AC12.

Affected paths: new `project-assistant-python.ts`; `ask-lisno.service.ts`, `project-assistant-runtime.ts`, `project-chat-assistant.service.ts`; `models/ProjectChatAssistant.ts`; `repositories/project-assistant.ts`, memory/Mongo adapters; `routes/ask-lisno.ts`, `routes/project-chat.ts`; focused tests. Primary retains shared contract/configuration ownership.

- Implement the bounded Node step loop and approved tool registry. Node executes callbacks, owns report/fact maps, reserves/settles usage, validates candidate output, and reconstructs the final result. Avoid replaying successful tool reads on transient transport retries. All failures remain sanitized.
- Pass explicit `private` versus `project_messages` capabilities. Preserve the deterministic owned-project list and private history filtering. Shared work cannot call profile/project-switch tools or consume private chat/staff history.
- Preserve the two-minute automatic response window, immediate eligibility of explicit requests, versioned idempotency, coalescing, human-reply suppression, leases/heartbeats, transactional publication, and existing routing receipts. Unknown/old-policy results cannot publish after replacement. Keep generic shared bodies and event/audit/notification payloads free of generated prices.
- Persist optional immutable `projectPricing` and policy marker; keep adapters aligned. Enforce current membership and existing commercial permissions on every result read, stripping the protected object for restricted/stale/revoked results before serialization. Generic facts/narrative must contain no price-derived information.
- Return a safe unavailable/refresh presentation for unclassified historical results, without deleting or changing stored history. Keep result responses non-cacheable. Test read-only/no-mutation behavior of legacy handling.
- Verify publication/source races, revocation after generation, late model output, slots/usage cleanup, duplicate workers/retries, one committed result, and rollback of message/result/audit together. Required Mongo coverage must use a replica set.

### T7. Wire configuration and reconcile the complete application

Owner: primary. Dependencies: T4, T5, T6. Acceptance: AC1, AC8, AC9, AC10, AC12.

- Wire both production chat paths to the Python provider with common service settings and independent surface enablement. Missing/invalid configuration must disable AI safely and preserve ordinary chat/routing. Do not construct or select Gemini for either surface, even if Gemini keys remain for unrelated features.
- Keep Node server-to-server authentication/TLS and endpoint validation explicit. Supply secret-free `.env.example` placeholders and startup diagnostics that cannot expose secrets. Do not edit real `.env` files or configure a host.
- Remove obsolete chat-specific cloud-provider selection/wiring and any dead adapter only after reference checks; preserve unrelated uses and pre-existing edits. Keep canonical routes, operation authorization, OpenAPI, and client response contracts synchronized.
- Run a synthetic end-to-end adapter/service contract exercise using fake inference, then both public chat flows. Assert all outbound destinations are the permitted test service only and that provider failure never reaches a cloud API.
- Reconcile four answer presentations: private web, private mobile, Project Messages web, Project Messages mobile. Complete identity, disclosure, stale-source, and retry checks against the integrated backend behavior.

### T8. Prepare independent-server packaging and evaluation assets

Owner: Python service lane, reconciled by primary. Dependencies: T3 and final T7 configuration. Acceptance: AC2, AC4, AC7, AC9, AC13 preparation.

- Supply container/runtime configuration, pinned-model setup instructions, service authentication/TLS prerequisites, private model networking, default-deny runtime egress, and `OLLAMA_NO_CLOUD=1`. Keep model weights outside the repository/image source; no automatic download while serving a question.
- Separate artifact installation from serving. Include resource limits, readiness versus liveness, queue controls, restart/graceful shutdown, and destination-only diagnostic evidence. Never include a Mac address/tunnel/path or require a developer laptop to stay running.
- Document coordinated rollout and drain/fencing of old Gemini workers, safe legacy reads, and rollback to disabled AI or a verified self-hosted-compatible release. No rollback to cloud inference or old disclosure behavior.
- Create at least 100 synthetic evaluation prompts with expected source/tool/clarification outcomes and explicit integrity checks. Include both surfaces, asymmetric identities/projects, internal-price probes, hostile text, missing/conflicting data, and multi-turn context. No cloud AI judge.
- Provide a remote benchmark harness reporting model digest/runtime/hardware, cold/warm p50/p95, direct/model/complex classes, concurrency 1 and 2, at least 30 measured requests per main class, and shared wait time separately. Do not claim latency or quality from mocks.

### T9. Review and verify the integrated implementation

Owner: primary with sequential `integrity_reviewer`, then `verification_runner` in Mode A; inline equivalents in Mode B. Dependencies: all writers T1–T8 complete. Acceptance: all code-verifiable criteria, with remote criteria explicitly tracked.

- Review the integrated diff against the initial dirty baseline. Audit permissions, field projections, all output channels, Cloud API exclusion, money/source lineage, historical read behavior, transaction races, cancellation, caching, and the remote deployment configuration.
- Fix confirmed findings in their ownership lanes, wait for all edits, then verify the final integrated tree. Re-run checks affected by fixes; do not treat concurrent-writer test results as final evidence.
- Run the verification matrix below in the appropriate environment. Do not silently relax assertions, replace replica sets with standalone Mongo, or run forbidden heavy/model work on the Mac because a runner is unavailable.
- Record exact commands, outcomes, logs/artifact locations, unrun checks, and limitations in this plan. There is no repository lint script; do not report lint as passed.

### T10. Validate the actual model and independent operation

Owner: primary/verification runner on an independently authorized host. Dependencies: T9, selected host/credentials, and explicit authorization of any setup/deployment actions. Acceptance: remaining AC2, AC4, AC7, AC13.

- Install the pinned artifacts only on that host and run real inference with synthetic fixtures. Select the model from measured quality/latency; record digest, quantization, context/generation settings, and resource use. The previously suggested 8B candidate is provisional.
- Verify both chat paths work with external internet egress blocked after installation; missing local weights/runtime must fail safely. Capture only destination metadata, never question bodies, personal data, or secrets.
- Validate quality against the approved corpus: at least 95% correct answer-or-clarification decisions on answerable cases, abstentions reported separately, and zero critical disclosure/finance/workflow failures in the tested corpus. Verify the approved speed targets without weakening privacy checks.
- Demonstrate the deployed flow from an independent device/runner with no connection to this Mac. Report exact evidence and unresolved limits.
- Hosting is intentionally undecided. Until available, leave this task pending and report software verification separately from operational/model verification. Do not claim full completion or guaranteed Gemini-equivalent quality/speed.

## Safe parallel schedule

After T0–T1, T2 (backend sources), T3 (Python), and either T4 (web) or T5 (mobile) can run concurrently in Mode A on disjoint files. Start the other consumer as a child slot becomes available. T6 follows T2–T3 and can overlap a remaining consumer task. T7 waits for both consumers and backend integration. T8's final deployment/evaluation assets follow the settled configuration. Review and verification are sequential after writers finish. T10 waits for an independent host and explicit external-action authorization.

Primary-owned contract changes are a synchronization point: stop dependent edits, update shared fixtures/definitions once, notify owners, then continue. No agent performs production/model setup while waiting.

## Verification matrix and commands

Commands are planned checks, not results. Run from the named workspace. New test paths below are proposed deliverables and should be replaced by their exact final paths if naming changes, preserving the same coverage.

| Lane | Commands/evidence | Execution boundary |
| --- | --- | --- |
| Python contract/service | `.venv/bin/python -m pytest -m "not model"` in `assistant-service/`; package import/schema validation; fake transport with network denial. | Lightweight focused subsets may run locally; no model runtime or downloads. |
| Backend unit/contract | `npm test -- tests/ask-lisno.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno-project-resolution.test.ts tests/ask-lisno-project-list.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-narrative.test.ts tests/project-assistant-app.test.ts tests/project-chat-assistant.test.ts tests/project-chat-assistant-routes.test.ts tests/project-assistant-runtime.test.ts tests/estimate-client-presentation.test.ts` plus new Python-provider, privacy, protocol, and project-estimate tests. | Focused lightweight batches; fake services and synthetic data only. |
| Backend Mongo/races | `npm test -- tests/project-chat-assistant.replica-set.test.ts tests/project-assistant-runtime.replica-set.test.ts tests/project-assistant-data.replica-set.test.ts` plus new project-estimate reader integration cases. | Independent verification runner with disposable replica set. No production DB. |
| Authorization/API inventory | `npm test -- tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts tests/api-docs.test.ts tests/server.test.ts` and shared contract fixtures. | Independent runner if the batch exceeds lightweight local verification. |
| Backend broader checks | `npm run typecheck`, `npm test`, `npm run build`. | Independent verification runner for full suites/builds; record unrelated failures separately. |
| Web focused | `npm test -- src/features/ask-lisno src/features/messages/ChatAssistantResult.test.tsx src/features/messages/useChatAssistant.test.tsx src/features/messages/projectChatApi.test.ts` plus new pricing/parser tests. | Lightweight rendered/mock subsets locally; integrated browser QA on a runner. |
| Web broader | `npm run typecheck`, `npm test`, `npm run build`. | Independent verification runner. |
| Mobile focused | `npm test -- --runInBand src/features/ask-lisno src/features/messages/chatEnhancements.test.ts src/features/messages/usePendingAssistantRefresh.test.tsx` plus new protected-result and assistant-message rendered cases. | Lightweight mock tests locally. |
| Mobile broader | `npm run typecheck`, `npm run test:contracts`, `npm test -- --runInBand`, `npm run export:android`. | Independent verification runner; no new local emulator/Metro/background process. |
| Rendered UI/accessibility | Both surfaces on web/mobile; narrow and desktop widths, large fonts, keyboard/focus names, missing/restricted/stale price, source labels, retry, account switch, resume/revocation. | Mocked render tests plus independent-host browser/device evidence; preserve existing design. |
| Privacy/access matrix | Two unequal Client projects; valid/foreign Client, authorized/unauthorized estimator, designer/site/vendor member, sole active Super Admin, removed member/session; inspect raw responses and all side channels. | Synthetic fixtures; unit and replica-set coverage. |
| Real model/no-cloud runtime | T10 corpus/benchmark and blocked-egress evidence; Mac-independent operation. | Independent authorized host only; currently unavailable/pending. |
| Hygiene | `git diff --check`, `git status --short`, per-target diff against baseline; ensure no secrets, weights, runtime logs/caches/build artifacts enter deliverables. | Primary; no staging or commits. |

## Acceptance trace and handoff

| Specification criteria | Implementation tasks | Final evidence |
| --- | --- | --- |
| AC1: both surfaces, no cloud AI | T1, T3, T6, T7 | Backend provider/API checks and Python fake-transport checks passed; both entry points select Python and retired cloud creation fails closed. Actual independent-host network evidence is pending. |
| AC2: no Mac runtime/workload | T0, T8, T10 | Source editing, lightweight fake tests and type checks only; no model runtime/weights installed. Availability with this Mac disconnected remains unverified pending hosting. |
| AC3: factual and monetary truth | T1, T2, T6 | Immutable-source, paise-reconciliation and changed-source unit checks passed. Twelve genuine Mongo estimate-reader cases are prepared and type checked but unrun. |
| AC4: conversation quality | T3, T8, T10 | Deterministic intent tests, 11 actual Python fixtures and five Node-to-Python rounds passed. The 136-case real-model score remains pending. |
| AC5: integrity | T1, T2, T3, T6, T9 | Read-only integrity review closed with no confirmed defect; focused authorization, provenance and consumer checks passed. Broader Mongo evidence remains pending. |
| AC6: bounded recovery | T1, T3, T6 | Focused timeout/cancellation, saturation, payload, reference, usage and slot-cleanup tests passed. |
| AC7: measured speed | T8, T10 | Benchmark harness prepared; no real-model latency measurement or speed claim. |
| AC8: client/workflow compatibility | T4, T5, T6, T7, T9 | Backend workflow checks and 176 web/mobile parser, rendered and query tests passed. Full browser/device/width matrix remains unrun. |
| AC9: reproducibility | T0, T1, T3–T9 | Exact final commands/results below, temporary fingerprints/logs and pinned package/deployment instructions. |
| AC10: sensitive-data boundaries | T1–T7, T9 | Projection, sentinel, forbidden-tool, stale/legacy and per-viewer assertions passed in focused checks; free-text minimization is not universal PII detection. |
| AC11: shared races/viewers | T2, T6, T9 | Focused runtime/viewer checks passed; adapted shared replica-set suites and new reader cases are unrun. Transaction/race release acceptance remains pending. |
| AC12: legacy/rollout safety | T1, T4–T9 | Unknown-policy read/publication rejection and consumer suppression checks passed. No stored history was migrated; actual rollout/draining remains unperformed. |
| AC13: no external AI/internet at runtime | T3, T7, T8, T10 | Fixed-destination/proxy/redirect and fake-network tests passed; real deployment with external egress blocked remains pending. |

Final handoff must state changed files, architectural/dependency decisions, exact passed/failed/unrun checks, temporary artifact paths, and remaining model/hosting limits. Report software and independent-host verification distinctly. No migration, production cutover, infrastructure purchase, model download, or deployment is part of this planning approval.

## Implementation reconciliation

- Both production chat entry points now select `createPythonAssistantProvider`, with separate `ASK_LISNO_ENABLED` and `PROJECT_CHAT_AI_ENABLED` flags. The retired Gemini factory fails closed. There is no cloud fallback for these features; unrelated estimation/OCR work was preserved.
- Node owns authorization, source reads, publication, exact monetary values and the final answer. Python requests only allowed tools and returns opaque references. Model-generated factual prose is discarded. Dedicated Node HTTP agents and Python HTTPX clients bypass environment proxies, prohibit redirects and bound requests, responses and timeouts. Cross-host transport verifies TLS.
- Customer prices come from immutable published/approved estimate snapshots with recipient, version, approval and finance-lineage checks. Configuration and vendor prices are excluded. Unknown legacy results and stale or unauthorized prices are withheld without changing stored history. The result schema change is additive; no migration or backfill was run.
- The web and mobile clients validate the protected price contract, discard unsafe legacy fields, and hide prices while permissions or sources are being rechecked. The approved mobile chat layout and disabled attachment controls were preserved.
- `assistant-service/` contains the Python service, fake-transport tests, pinned dependency manifest, independent-host container templates, 136 synthetic evaluation cases and 11 generated direct-response fixtures. Added runtime libraries are FastAPI, Starlette, Pydantic, HTTPX and Uvicorn. No Node/mobile dependencies or lockfiles were changed for this task.
- Greetings, thanks, emotional acknowledgment, mixed greetings/business questions and narrow project intents have deterministic handling. Ambiguous requests use the configured local model. Room/item-specific execution and general materials/scope questions request clarification because the permitted fact projection does not retain those associations. New/additional item prices require a published quote; the assistant does not calculate them from Configuration.
- The read-only integrity review rechecked privacy, authorization, immutable pricing, legacy data, source changes, transport, model references and consumer rendering. It found no remaining confirmed defect. Free-text filtering is conservative minimization, not a universal PII detector.

### Remaining independent-runner evidence

The following are deliberately unrun on this Mac: Mongo replica-set suites and the new immutable-estimate integration fixtures; full workspace suites/builds; native export/emulator and full browser/responsive/accessibility matrices; container build/deployment; actual model inference, real-model quality and latency, runtime blocked-egress evidence, and availability with this Mac disconnected. These remain release acceptance requirements. Lightweight type checks and model-free focused tests are recorded separately below.

No model/runtime/weights, AI daemon, tunnel or production service was installed on this Mac. No deployment, production mutation, migration, seed, staging, commit or push was performed. Hosting selection and production authorization remain outside this local implementation.

### Final focused verification, 2026-10-15

The verification runner started after all writers and corrective source edits finished. It made no product-source changes. All 871 unique focused tests passed: backend 592, Python 103, web 93, mobile 83. Backend, frontend and mobile `npm run typecheck` each exited 0. `git diff --check` passed. There is no lint script and no lint result is claimed.

From `backend/`:

```sh
npm run typecheck
npm test -- tests/assistant-step-contract.test.ts tests/project-assistant-python.test.ts tests/project-assistant-http.test.ts tests/project-assistant-estimate.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-gemini.test.ts
npm test -- tests/project-assistant-http.test.ts
npm test -- tests/ask-lisno-project-resolution.test.ts tests/ask-lisno-project-list.test.ts tests/ask-lisno.test.ts tests/project-assistant-runtime.test.ts tests/project-chat-assistant.test.ts tests/project-assistant-narrative.test.ts
npm test -- tests/ask-lisno-routes.test.ts tests/project-chat-assistant-routes.test.ts tests/project-assistant-app.test.ts tests/server.test.ts tests/api-docs.test.ts tests/authorization-policy.test.ts tests/frontend-authorization-contract.test.ts tests/route-operation-registry.test.ts
LISNO_ASSISTANT_TEST_PYTHON=/tmp/lisno-python-assistant-qa/venv/bin/python npm test -- tests/assistant-python-bridge.test.ts
```

Results: provider/contract/source lane 82 unique tests, workflow lane 286, API/authorization lane 219, actual Node-to-Python bridge 5; 592 tests across 21 files. The first provider run passed 79 and hit sandbox `EPERM` on three loopback HTTP tests. The exact HTTP test command was rerun with the existing approved test permission and passed 3/3; this was an environment restriction, not an application fix. API tests also used the approved permission for temporary local listeners. The bridge runs the actual Python deterministic planner with synthetic tool data and no model/network call.

From `assistant-service/`:

```sh
/tmp/lisno-python-assistant-qa/venv/bin/python -m pytest -m 'not model'
/tmp/lisno-python-assistant-qa/venv/bin/python -m pip check
```

Results: 103 tests passed; dependency check found no broken requirements.

From `frontend/`:

```sh
npm run typecheck
npm test -- src/features/messages/ChatAssistantResult.test.tsx src/features/messages/assistantResultParser.test.ts src/features/messages/useChatAssistant.test.tsx src/features/messages/projectChatApi.test.ts src/features/ask-lisno/askLisnoApi.test.ts src/features/ask-lisno/AskLisnoPanel.recovery.test.tsx src/features/ask-lisno/AskLisnoProjectCard.test.tsx
```

Results: type check passed; 93 tests passed.

From `mobile/`:

```sh
npm run typecheck
npm test -- --runInBand src/features/messages/assistantResultParser.test.ts src/features/messages/chatEnhancements.test.ts src/features/messages/ChatEnhancementsUI.test.tsx src/features/ask-lisno/askLisnoApi.test.ts src/features/ask-lisno/useAskLisno.test.tsx src/features/ask-lisno/AskLisnoWorkspace.test.tsx
```

Results: type check passed; 83 tests passed.

Database fixture preparation added only `backend/tests/project-assistant-estimate.replica-set.test.ts`, with 12 cases for two unequal projects, immutable amounts, pinned versus later publication, actual approval proof, recipient/actor/source/finance conflicts and freshness/ownership invalidation. The test-inclusive TypeScript configuration at `/tmp/lisno-python-assistant-qa/estimate-replica-tsconfig.json` passed compilation. These cases have not been executed against Mongo.

Evidence lives in `/tmp/lisno-python-assistant-qa/final/`: per-lane logs, `source-fingerprints.json`, `baseline-changed-paths.txt`, `new-deliverable-paths.txt`, and before/after status inventories. The 430-entry short status was identical before/after final verification; no paths were added or removed by the verifier. Of 168 fingerprinted preimplementation targets, 131 remained unchanged, 37 changed within the assigned scope, and none were missing. The original 479-entry inventory used different untracked-directory expansion and is not a comparable path count. Temporary logs, test environments and snapshots are not repository deliverables.

### Post-handoff startup regression repairs, 2026-10-15

These repairs continue the approved implementation and preserve the assistant contracts and existing application behavior.

- **Mobile:** The installed Expo/Metro React Compiler renamed the local `send` function declaration while leaving ten unbound references in both development and production output. The ordinary Jest Expo transform does not enable this compiler path, so prior rendered tests did not catch the native startup crash. `AskLisnoWorkspace.tsx` now uses a `const` arrow handler with identical guards, options and scrolling behavior. `mobile/scripts/ask-lisno-compiler.test.ts` runs the actual installed Metro transformer and reparses its emitted JavaScript to detect unbound references. Both cases failed before the change and pass afterward. A read-only review found no further defect in this bounded repair.
- **Web:** Optimizing dependencies from the repository directory versus `frontend/` produced different React chunks under the same Vite browser cache version (`adda7613`). The generated module keys depended on the process working directory. `frontend/vite.config.ts` now pins the optimizer's esbuild working directory to `frontend/`. The new `frontend/development-optimizer.test.ts` reproduced different bundles before the fix and verifies identical names and bytes afterward. No provider, dependency, lockfile or business-logic change was needed. The existing development server was restarted on the same localhost port 5173 and remains running.

Repair verification, separate from the earlier 871-test record:

```sh
# mobile/
npm test -- --runInBand scripts/ask-lisno-compiler.test.ts src/features/ask-lisno/AskLisnoWorkspace.test.tsx src/features/ask-lisno/useAskLisno.test.tsx
npm run typecheck
npm test -- --runInBand scripts/ask-lisno-compiler.test.ts

# frontend/
npm test -- development-optimizer.test.ts development-server.test.ts
npm run typecheck

# repository root
git diff --check
```

Results: 33 unique mobile tests passed, including the two compiler cases; the compiler-only rerun also passed 2/2 after tightening the test's mode typing. The web regression and development-server tests passed 2/2. Both workspace type checks and the diff check passed. A separate browser loaded `/login` after the final config change, rendered the password input, and reported no console errors or warnings. Its React resources used fresh cache versions, including `a1911746`, `a51cee99` and shared chunk `f65e0a79`; none used the reported `adda7613` version. Vite's disk metadata browser hash was `ea2d4b08`, with per-entry versions reflecting in-memory dependency discovery.

The user's original browser tab has not been verified after this repair; computer control of that Chrome instance was not approved. A native device launch, full builds and the broader workflow matrix were not run for this bounded repair. The earlier independent-host/model and release acceptance limitations remain in force. Temporary pre-repair source/cache evidence is in `/tmp/lisno-ask-lisno-open-crash/` and `/tmp/lisno-web-hook-crash/`; it is not a repository deliverable. No staging, commit, push, deployment, production mutation or migration was performed.

### Built-in reply availability repair, 2026-10-15

The user subsequently reported that both clients opened but even `Hi` returned unavailable. The local backend had neither `ASSISTANT_SERVICE_URL` nor `ASSISTANT_SERVICE_TOKEN`, and `ASK_LISNO_ENABLED` was unset. Startup tied both feature flags to remote provider construction, disabling existing network-free replies and the private project-list path. This is separate from the earlier rendering crashes.

`createPythonAssistantProvider()` now accepts omitted configuration for its existing greeting, privacy and empty-input responses. Every non-direct request stops with `ASSISTANT_UNAVAILABLE` before provider source reads, token reservation or transport. Explicitly supplied configuration retains endpoint/token validation. Startup selects this limited provider when remote settings are absent or invalid, while retaining independent explicit feature flags. The local ignored `.env` now explicitly enables private Ask Lisno; no secret was changed or copied. No new business-intent implementation was added in this repair.

Changed product paths: `backend/src/server.ts` and `backend/src/services/project-assistant-python.ts`. Focused regressions: `backend/tests/server.test.ts`, `backend/tests/project-assistant-python.test.ts`, and `backend/tests/ask-lisno-routes.test.ts`. Baselines are in `/tmp/lisno-chat-availability-repair/`. Independent read-only review found no confirmed defect; shared publication tests still use their established stub provider, while direct provider tests cover both surfaces.

Checks from `backend/`:

```sh
npm test -- tests/project-assistant-python.test.ts
npm test -- tests/server.test.ts tests/ask-lisno-routes.test.ts tests/project-assistant-app.test.ts tests/ask-lisno.test.ts tests/project-chat-assistant.test.ts tests/project-assistant-runtime.test.ts
npm run typecheck
```

Results: 69 provider tests and 187 integrated API/startup/workflow tests passed, 256 unique tests total. The first API regression attempt incorrectly omitted the contract's required nullable `projectId`; the fixture was corrected to `projectId: null`, and all 18 API cases then passed. Typecheck and repository `git diff --check` passed. The stopped local backend was restored with `npm run dev:backend`; `/api/v1/health` returned `{"data":{"status":"ok"}}`. The local backend and frontend remain running. No actual signed-in web/mobile conversation or deployed Render service was exercised, and full builds/Mongo suites were not run.

The user then supplied the existing Render Free/Oregon backend and explicitly chose **free hosting with limited rules-based chat**. That changes the approved model architecture. The replacement specification is `../specs/2026-10-15-free-render-rules-assistant-design.md`; it is awaiting approval. No rules-only runtime or Render deployment changes have been implemented yet. No production mutation, external AI call, model workload, staging, commit or push was performed.
