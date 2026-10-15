# Free Render Python rules assistant task plan

Current status: normal-development startup repair implemented, independently reviewed and verified. The authorized local restart is complete. `backend/npm run dev` now includes Python chat and OCR in one supervised session. Real Mongo-backed private/shared progress and published-price tests passed. Live backend/Python/web checks and private API calls return 200. The available live demo account has no projects; project-source evidence comes from isolated real Mongo/Python tests, not that account. Physical-device and production rollout checks remain pending.

## Resumed local-testing repair

### Local startup compatibility follow-up

Reported evidence: port 3000 is held by the task-owned local chat launcher, while the user's ordinary development launcher starts another backend and an OCR worker. Its health probe can see the first backend before its own backend fails with EADDRINUSE. This is a local startup conflict, not a chat/provider failure.

Within the existing local-testing and existing-functionality acceptance criteria, add an explicit `node scripts/local-chat.mjs --with-ocr` option. Reuse the existing development process definitions and OCR command, replace only the nested backend entrypoint with the existing no-bootstrap local chat entrypoint, and keep one API, one rules process and one OCR worker. No existing backend/OCR source, credential, protocol or dependency change. Default chat-only mode remains available. Both launchers must not run together.

Primary owns the CLI/configuration, tests and local instructions; the bounded worker owns only new wrapper/test files. Before writers, capture scoped baselines under `/tmp/lisno-startup-compat-qa/`. Validate the OCR destination is the same local backend; retain the Python chat environment allowlist. The wrapper must reap owned children on signals/failure, including a bounded forced cleanup before the outer supervisor deadline, so restart cannot leave port 3000 occupied.

Verify configuration/unknown flags, occupied-port preservation, OCR readiness ordering and credentials, no demo bootstrap, signal/failure/forced cleanup and one real synthetic process-tree shutdown. Then gracefully stop only the positively identified duplicate Lisno launchers, start the combined mode, and verify one listener per port, API/chat success, and a single OCR process. No extraction job or production record is created for testing. Independent review and final focused verification complete this continuation.

The user subsequently requested local testing before server rollout. The earlier no-Mac-runtime constraint now applies to production, not this explicitly requested development session. Root owns additive `scripts/local-chat.mjs`, `local-chat-backend.mts`, launcher tests and local guide. The launcher reuses the existing supervisor, generates a temporary internal token, preserves `.env`, binds loopback, and skips demo bootstrap. No model or OCR process is started. The existing backend watcher is replaced only for the authorized local test.

The reported `may i know my project status` also required a conservative Python alias and backend project-name-parser correction. These are narrow exceptions to the earlier backend-source preservation boundary, necessary to satisfy the existing supported-status acceptance criterion. The parser owner preserves unknown/foreign names, multiple-project choices, negation and privacy guards. Evidence before tone extension: 91 Python planner tests, 72 resolver tests, 14 real HTTP cases and backend typecheck passed. Real local API greeting and exact status question both returned HTTP 200; the existing demo account had no accessible project, so status correctly returned clarification rather than fabricated data.

The separate approved tone/name specification and plan track the subsequent user request. Final review/verification will cover both integrated changes and distinguish synthetic project-fact tests from the live local no-project account check.

Date: 2026-10-15, Asia/Calcutta
Status: Approved. The user approved the specification and this task plan, then selected parallel execution (A). T0–T5 implementation and actual HTTP integration are complete. T6 independent integrity review is complete with both confirmed findings corrected. T7 final integrated verification and T8 manual rollout handoff are complete for the local implementation. Actual Render release acceptance remains pending the user’s manual rollout.

Approved specification: [Free Render Python rules assistant](../specs/2026-10-15-free-render-rules-assistant-design.md).

## Outcome and execution boundary

Deliver a model-free Python rules service in the existing monorepo, functional Ask Lisno and Project Messages assistant flows on web/mobile, and exact manual instructions to run Node plus Python in the existing Free/Oregon Render backend service. This plan does not authorize deployment, commits, pushes, seeds, migrations, paid resources or production mutations.

The specification and plan approvals are recorded here. No further approval gate is required for the bounded implementation. Production rollout, commits and pushes remain outside this authorization.

## Fixed scope

- **Additive only:** Python rules modules, their tests/fixtures, a minimal pinned rules dependency manifest if needed, Render build/start scripts and their tests, backend integration tests/helpers, and deployment documentation.
- **Existing files that may change:** chat-specific web/mobile consumers and their tests, limited to the named areas below. Preserve their existing presentation and current crash fixes.
- **Read-only product sources:** all `backend/src/`, current Python model-service files, `ocr-worker/`, root `render.yaml`, existing package manifests/lockfiles and unrelated frontend/mobile code. Reuse existing authorization, step protocol, source readers and final-result reconstruction.
- Do not undo previous changes. Capture the current dirty worktree and per-target contents before implementation. A confirmed dependency outside these boundaries goes back to the primary agent for a concrete scope decision; agents must not silently change a backend contract or weaken checks.
- No model package, model artifact, cloud AI call, persistent assistant process or heavy container/native build on the Mac. Short-lived synthetic Python tests are permitted by the specification. Remote resource verification remains distinct from local checks.

## Settled integration contract

The production backend's existing `createPythonAssistantProvider` uses authenticated `POST /internal/v1/assistant/step`. Reuse `assistant-service/src/lisno_assistant/contracts.py` and the TypeScript contract unchanged. Responses retain protocol version 1, the request/step identity, `route: deterministic`, and zero model token usage. Tool names, opaque references and clarification codes stay within the existing schema.

Node still owns all authentication, scope resolution, reads, exact paise values, freshness checks and publication. Python returns allowed tool requests, existing fact/report references, or existing clarification codes. Node rejects arbitrary narrative even when Python calls it deterministic; do not introduce novel prose that violates this constraint. Reuse existing permitted greetings and backend-rendered clarification/fact text.

New rules configuration requires the server-only token and bounded service settings, with no model URL/name/digest or fake placeholder model values. The new entrypoint must not import or initialize `app.py`, `runtime.py`, `ModelRuntime` or a model HTTP client. Reuse the pure existing planner and contract modules where compatible; put additions in new files. Unknown input yields a clarification.

The new launcher runs production Node with its existing entrypoint and working directory and starts one Python worker bound to `127.0.0.1:8080`. Node remains the only public listener. The launcher supplies a minimal Python environment and the existing token; it never forwards MongoDB/JWT/cloud credentials. Explicit assistant flags remain independent. No OCR process or development/demo bootstrap is started.

## Dependency-ordered tasks

Only one parent task is marked in progress at a time. In Mode A, independent owned slices within that parent may run concurrently, within the available agent limit. In Mode B, the primary performs the same work sequentially.

### T0. Baseline, contract audit and exact prompt inventory

Owner: primary. Dependencies: approved task plan and execution-mode choice. AC: 1, 3, 6, 9, 10.

1. Record `git status --short` and fingerprints/content snapshots of planned targets plus protected directories in an ignored temporary directory, proposed `/tmp/lisno-free-rules-qa/`. Do not copy environment files or secret values.
2. Reconcile current specs, code and active processes. Preserve the existing frontend/backend development servers and the user's awake-until-complete request; do not start duplicate services or terminate unrelated processes.
3. Trace the actual UI prompt strings, private project choices/history and shared required-message handling through the existing Node adapter. Enumerate every fixed quick prompt and callback-generated prompt as a contract fixture.
4. Confirm the existing step protocol can express all supported responses without backend edits. Audit the module import path for model-runtime side effects. Resolve any genuine incompatibility before assigning implementation.
5. Freeze the intended new entrypoint, launcher paths, process flags and test fixtures. Assign explicit owners after understanding each dirty target's existing diff.

Exit evidence: baseline manifest, exact intent/prompt fixtures, agreed unchanged wire protocol, named file ownership and no unresolved cross-boundary implementation dependency.

### T1. Add the standalone Python rules service

Owner: Python implementation agent in Mode A; primary in Mode B. Dependencies: T0. AC: 1, 2, 3, 5, 7, 9, 10.

Owned new files, with names finalized at T0:

- `assistant-service/src/lisno_assistant/rules_settings.py`
- `assistant-service/src/lisno_assistant/rules_planner.py`
- `assistant-service/src/lisno_assistant/rules_app.py`
- `assistant-service/src/lisno_assistant/rules_main.py`
- `assistant-service/tests/test_rules_settings.py`, `test_rules_planner.py`, `test_rules_app.py`
- New rules fixtures under `assistant-service/evaluation/`.
- `assistant-service/rules-requirements.lock` only if needed to install the smaller pinned web/validation runtime without the existing model transport dependencies.

Tasks:

1. Add model-free token/config validation and a dedicated module entrypoint, callable with the virtual environment's Python interpreter and `-m lisno_assistant.rules_main`; do not edit the existing package entrypoint or model settings.
2. Reuse conservative `direct_step`/`plan_tools` behavior and add bounded canonical handling in new code for approved prompt variants, greeting prefixes, help and supported project follow-ups. Preserve original request bodies for privacy/mutation/negation checks; do not normalize away unsupported business intent. Required shared fragments must all be addressed or clarified.
3. Unsupported/ambiguous input returns an existing safe clarification code. Avoid new free-form narrative, fabricated source IDs, model fallthrough and overly broad keyword matching.
4. Add loopback-only HTTP serving, constant-time token comparison, no-store responses, strict content/body/deadline limits, one active request with bounded busy response, and authenticated readiness independent of any model.
5. Keep diagnostics limited to safe operational fields. No request/body/header/exception dumps. Disable access logging and external telemetry exporters. Rules execution has no outbound network client or database access.
6. Add paired positive/adversarial tests: greetings versus mixed business questions; supported versus negated/conditional/compound/unknown requests; empty/absent facts; private resolution versus fixed shared project; published/approved report references; privacy requests; extra fields; wrong token; oversized body; safe readiness; zero model/network/credential use.

Exit evidence: focused Python tests pass under the existing network-denial fixture; old Python source fingerprints are unchanged; every UI prompt fixture maps to a supported result or deliberate clarification.

### T2. Add Render build/start packaging and process lifecycle tests

Owner: primary or a separate packaging agent in Mode A, never the Python writer. Dependencies: T0; interface agreement with T1. AC: 4, 5, 7, 8, 9, 10.

Owned new files:

- `scripts/render-build.sh`
- `scripts/render-start.mjs`
- `scripts/render-start.test.mjs`
- New synthetic process fixtures under `scripts/fixtures/render-chat/` as necessary.

Tasks:

1. Build from repository root, checking a supported Python version before install. Build the existing backend with its established commands and create an isolated Python runtime for only the rules service. Preserve backend build resources/static assets, filesystem working directory and production startup semantics.
2. Fail the build with a clear non-secret error if the platform lacks required Python support. Do not install models, invoke OCR setup, change package manifests, edit the existing `render.yaml`, or download runtime assets on startup.
3. Start Node regardless of optional Python availability. Start Python only with explicit `ASSISTANT_MODE=rules`; API feature flags may remain disabled during readiness validation. Share the existing token over the child environment, never argv or logs. Validate the loopback destination and avoid overwriting unrelated backend settings.
4. Restart a failed Python child with a bounded retry/backoff policy and sanitized status. Handle spawn failures, readiness failure, port conflict, exhausted retries, SIGINT/SIGTERM and Node termination. Stop/reap children on shutdown; preserve the backend's graceful drain. Do not mask a Node startup failure with an orphaned Python process.
5. Build a strict Python environment allowlist. Test that synthetic MongoDB/JWT/cloud-key/proxy sentinels are absent while required Python/runtime/token settings are present.
6. Test with injected fake child processes and real short-lived synthetic children where necessary. No real app database, OCR worker, persistent Python service, production credentials or model workload in launcher tests.

Exit evidence: lifecycle/environment tests pass; shell syntax passes; new scripts refer to real final entrypoints and leave all existing deployment/configuration files unchanged.

### T3. Integrate the web chat experience

Owner: web frontend implementer in Mode A; primary in Mode B. Dependencies: T0 and frozen T1 fixtures. AC: 2, 3, 6, 7, 10.

Allowed existing implementation targets, only where a change is needed:

- `frontend/src/features/ask-lisno/AskLisnoPanel.tsx`
- `frontend/src/features/ask-lisno/AskLisnoQuickPrompts.tsx`
- `frontend/src/features/ask-lisno/askLisnoApi.ts`
- `frontend/src/features/ask-lisno/assistantFailureMessage.ts`
- `frontend/src/features/messages/ChatAssistantResult.tsx`
- `frontend/src/features/messages/useChatAssistant.ts`
- Existing assistant-only parsers/schema files in that messages directory only if a demonstrated consumer defect requires a compatible correction.
- Corresponding existing tests and new chat-specific tests. Do not change ordinary human-message components, routing/auth providers, global CSS, Vite configuration or dependency files.

Tasks:

1. Align welcome/help text and prompt payloads with supported rules. Preserve the established popup, navigation and layout; do not promise arbitrary vendor/material answers or guessed addition charges.
2. Verify normal greeting/clarification rendering and project-choice follow-ups. Preserve scoped project pagination and published-price freshness checks.
3. Repair only demonstrated send/retry/busy/stale-response defects. Retain drafts on real failures and prevent duplicate retries. Unknown-question clarification is a successful response, not an unavailable state.
4. Preserve shared assistant states, eligibility, private-history separation and all ordinary message behavior. Keep secrets and Python addresses out of browser configuration.
5. Add rendered interaction and accessible-name checks for quick prompts, greeting, clarification choices, unavailable/rate-limit retry, session/project changes, published-price refresh and shared assistant results.

Exit evidence: focused rendered tests and frontend typecheck pass; all outgoing prompt fixtures match T1; no unrelated source change.

### T4. Integrate the native mobile chat experience

Owner: mobile frontend implementer in Mode A; primary in Mode B. Dependencies: T0 and frozen T1 fixtures. AC: 2, 3, 6, 7, 10.

Allowed existing implementation targets, only where a change is needed:

- `mobile/src/features/ask-lisno/AskLisnoWorkspace.tsx`
- `mobile/src/features/ask-lisno/AskLisnoHeader.tsx`
- `mobile/src/features/ask-lisno/AskLisnoComposer.tsx`
- `mobile/src/features/ask-lisno/AskLisnoAnswer.tsx`
- `mobile/src/features/ask-lisno/AskLisnoMessage.tsx`
- `mobile/src/features/ask-lisno/useAskLisno.ts`
- `mobile/src/features/ask-lisno/askLisnoApi.ts`
- `mobile/src/features/messages/ChatAssistantMessage.tsx`
- `mobile/src/features/messages/chatAssistantModel.ts`, `assistantRecovery.ts`, `usePendingAssistantRefresh.ts`
- Corresponding existing tests and new chat-specific tests. Preserve native compiler fixes and leave ordinary message composition, uploads, global navigation/configuration and dependency files unchanged.

Tasks mirror T3 with native keyboard, touch/accessibility, scroll-follow, account/environment/session isolation and preserved scaffold blocking. Preserve the approved chatbot launcher and reference chat layout. Attachment/photo controls remain disabled with “Not available yet.” Do not introduce new styling, icons or native packages.

Exit evidence: focused rendered tests, native compiler regression and mobile typecheck pass; prompt fixtures match T1 and web semantics; unrelated source fingerprints remain unchanged.

### T5. Exercise actual Python through the existing Node and client contracts

Owner: primary/integration owner. Dependencies: T1–T4 finished and integrated. AC: 1, 2, 3, 4, 5, 6, 7, 10.

Owned new tests/helpers only:

- `backend/tests/assistant-rules-integration.test.ts`
- New helper files under `backend/tests/helpers/assistant-rules/` as necessary.
- Additive cross-consumer response fixtures under `assistant-service/evaluation/` and new web/mobile integration tests coordinated with their owners.

1. Use an explicit test interpreter and synthetic credentials/data. Start the actual new Python HTTP entrypoint briefly on an isolated loopback port, authenticate with the unmodified Node adapter, then terminate it reliably. Do not replace the real rules interpreter with canned model responses.
2. Exercise private Ask Lisno through its real service/auth path and shared assistant generation/publication with in-memory repositories. Cover greeting, project list, named/ambiguous project, progress, schedule, published/approved price, unsupported question, privacy, mixed request, required shared fragments, unavailable Python and recovery.
3. Use two unequal projects and asymmetric identities to prove no cross-client facts/prices. Verify exact report lineage and integer units, changed/unauthorized source handling and no configured-price readers. Preserve shared suppression, idempotency and viewer filtering.
4. Capture only synthetic response fixtures and use them in both clients' rendered tests so successful backend output is demonstrably understood by web/mobile. Check invalid outputs stay rejected and private results do not enter Project Messages.
5. Do not edit backend production code to force a green test. If the unchanged contract cannot express approved behavior, report the exact conflict and smallest necessary scope adjustment.

Exit evidence: actual Node-to-Python checks and matching client rendering pass; cleanup leaves no test listener/process, secret or persistent application data behind.

### T6. Independent integrity review

Owner: `integrity_reviewer` in Mode A; primary in Mode B. Dependencies: all writers and T5 finished. AC: 1–6, 9, 10.

Review the integrated per-target diff against the captured baseline. Verify no model/cloud/DB access in Python, unchanged authorization/finance boundaries, private/shared isolation, safe required-message routing, worker lifecycle/env filtering, no sensitive logging and no unrelated edits. Review actual test evidence and failure paths, not only test counts. Return confirmed findings with file/line evidence. The owning writer fixes findings; rerun only affected checks before final verification.

### T7. Final verification and rendered smoke checks

Owner: `verification_runner` after T6 in Mode A; primary in Mode B. AC: 1–10.

Run the focused lanes below on the settled worktree; earlier concurrent test results are provisional. Broaden only for unresolved risk or changed shared behavior. Avoid duplicated complete test runs with no new evidence need.

| Area | Required local evidence |
| --- | --- |
| Python | Existing non-model suite plus new rules tests; network denial and import/runtime absence checks. Use the lightweight test environment and record its exact interpreter. |
| Launcher | `bash -n scripts/render-build.sh`; `node --test scripts/render-start.test.mjs`; child cleanup/env sentinel cases. |
| Backend | `npm run typecheck`; new actual-Python integration test plus existing provider, private route/service, shared runtime/service and app/bootstrap regressions relevant to unchanged integration. |
| Web | `npm run typecheck`; Ask Lisno recovery/quick-prompt/project-card/API tests; shared result/parser/hook tests and new integration fixture tests; existing optimizer regression. |
| Mobile | `npm run typecheck`; Ask Lisno workspace/hook/API tests; shared assistant result/recovery tests and new integration fixture tests; `scripts/ask-lisno-compiler.test.ts`. |
| Rendered QA | Web desktop/mobile-width and native-rendered greeting, project prompt/choice, clarification, retry, denied access and published-price cases; keyboard/accessibility names; no new console errors. Use synthetic accounts/data. |
| Hygiene | `git diff --check`, scoped status and complete before/after fingerprint reconciliation. No OCR/backend/model-service/unrelated production source changes, new dependencies or lockfile drift. |

Final local commands (run from the named workspace; the test interpreter is a temporary lightweight environment):

```sh
# assistant-service/
/tmp/lisno-python-assistant-qa/venv/bin/python -m pytest -m 'not model'

# repository root
bash -n scripts/render-build.sh
node --test scripts/render-start.test.mjs
git diff --check

# backend/
npm run typecheck
LISNO_ASSISTANT_TEST_PYTHON=/tmp/lisno-python-assistant-qa/venv/bin/python npm test -- tests/assistant-rules-integration.test.ts tests/project-assistant-python.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno.test.ts tests/project-chat-assistant.test.ts tests/project-assistant-runtime.test.ts tests/project-assistant-app.test.ts tests/server.test.ts

# frontend/
npm run typecheck
npm test -- src/features/ask-lisno/AskLisnoPanel.recovery.test.tsx src/features/ask-lisno/AskLisnoPanel.rules.test.tsx src/features/ask-lisno/AskLisnoRules.responses.test.tsx src/features/ask-lisno/AskLisnoQuickPrompts.test.tsx src/features/ask-lisno/AskLisnoProjectCard.test.tsx src/features/ask-lisno/askLisnoApi.test.ts src/features/messages/ChatAssistantResult.test.tsx src/features/messages/assistantResultParser.test.ts src/features/messages/useChatAssistant.test.tsx development-optimizer.test.ts

# mobile/
npm run typecheck
npm test -- --runInBand src/features/ask-lisno/AskLisnoWorkspace.test.tsx src/features/ask-lisno/AskLisnoRules.integration.test.tsx src/features/ask-lisno/useAskLisno.test.tsx src/features/ask-lisno/askLisnoApi.test.ts src/features/messages/ChatEnhancementsUI.test.tsx src/features/messages/assistantResultParser.test.ts src/features/messages/usePendingAssistantRefresh.test.tsx scripts/ask-lisno-compiler.test.ts
```

The repository has no lint script; do not claim lint passed. Production builds, full workspace suites, native export/device tests and Mongo replica-set checks belong on a suitable independent runner when required for release. No transactional source is changing here, but do not present in-memory tests as real-Mongo verification. Report any unrun lane explicitly instead of calling the deployment verified.

### T8. Deliver manual Render instructions and remaining remote checks

Owner: primary. Dependencies: T6–T7. AC: 4, 7, 8, 9, 10.

New deliverable: `assistant-service/deployment/RENDER_FREE_RULES.md` with final tested paths and commands. Reconcile the approved specification and this plan with actual results.

1. Document exact repository-root, build/start commands, supported Python check, loopback URL and server-only token placement; preserve the existing service URL, Oregon/Free plan and unrelated environment settings. Do not tell the user to apply the current paid/Singapore `render.yaml`.
2. State that source availability in Render's connected Git branch is a prerequisite; no commit/push was authorized or performed. Do not imply local files automatically reach Render.
3. Provide a staged manual procedure: preserve current settings, deploy with assistant flags disabled, verify ordinary API/login/projects/messages, check sanitized rules readiness, then enable each chat surface and test supported/unsupported questions and ownership separately.
4. Include a remote Linux build/start/restart and small synthetic resource check. Record combined Node/Python memory and warm/cold request timing without customer data. Verify resource headroom against the 512 MB Free limit; do not guarantee capacity or latency from local tests.
5. No shell-only provisioning, model download, paid service, sleep-avoidance ping or automatic production mutation. If the target runtime fails Python/version/resource checks, stop the rollout with a concrete diagnosis and preserve normal backend service.
6. Include rollback of build/start/root settings and the verified release with assistant flags disabled, without deleting the existing Render service or changing stored business data.
7. Final handoff lists actual files, exact passed/unrun checks, temporary artifact paths, unresolved remote acceptance and the manual action still required. Distinguish local implementation completion from production functionality.

## Safe parallelism and ownership

- Before task-plan approval and execution-mode selection: no agents or implementation.
- After T0 in Mode A: T1 Python and T2 packaging can run independently after agreeing entrypoint/configuration names. A third slot may handle T3 web. T4 mobile starts as a slot becomes available; it never overlaps a web path.
- T3 and T4 may proceed against frozen synthetic protocol fixtures; T5 must then reconcile them with actual Python responses.
- Primary owns shared fixture conventions, integration tests, documents and scope decisions. Each worker is told that others share the worktree, must preserve existing dirty changes, and cannot revert another owner's edits.
- T6 review and T7 final verification run sequentially after writers finish. No final green claim from tests that observed in-progress edits.
- Mode B uses these same boundaries and dependencies inline without implementation subagents.

## Acceptance trace

| Spec criterion | Tasks | Required evidence |
| --- | --- | --- |
| AC1: actual rules Python on both surfaces, no model/cloud | T1, T5, T6, T7 | Import/network-denial checks; real HTTP Node/Python exchanges; both surfaces. |
| AC2: supported/mixed/unknown intent behavior | T0, T1, T3–T5, T7 | Exact UI prompt corpus, required-fragment adversarial cases, clarification rendering. |
| AC3: scoped factual/price truth | T1, T5–T7 | Two unequal projects, asymmetric identities, immutable price refs/units and stale/revoked sources. |
| AC4: resilient process lifecycle | T2, T6–T8 | Spawn/crash/readiness/signal/drain tests; remote restart check pending rollout. |
| AC5: loopback authentication and environment isolation | T1, T2, T5–T7 | Bind/token/payload tests; inherited-secret sentinels; no exposed Python route. |
| AC6: functional web/mobile and preserved UI | T3–T7 | Actual-response rendered tests, width/input/accessibility checks, compiler/optimizer regressions. |
| AC7: relevant checks and honest remote resource evidence | T1–T8 | Exact local logs; independent Linux build/RSS/latency checklist and results when available. |
| AC8: usable manual deployment guide | T2, T8 | Existing final script paths, precise dashboard/environment steps, validation and rollback. |
| AC9: authorized actions only | T0–T8 | No model workload, deployment, production write, commit/push, seed or migration. |
| AC10: additive scope and chat-only exceptions | T0, T6–T8 | Complete baseline/final path and content reconciliation, protected-source fingerprints. |

## Remaining release limitations

No Render deployment, resource benchmark, cold-start measurement or user-device verification is implied by this plan. The user will perform manual remote setup once a verified package is available. All such checks must be marked pending until actual evidence exists. The Free tier intentionally limits availability and capacity; the selected chat only understands its supported rules and must make that scope clear.

## Verified prompt compatibility

Real Node-to-Python integration identified that the existing project-name parser interprets “Show project …” and “my published estimate” as names. The final UI payloads preserve backend code: `Show my projects`, `Show my project progress`, `Show my project timeline`, and `Show my estimate` (display label “Published estimate”). The estimate reader still returns only published/approved customer reports. Project-choice callbacks use the same progress prompt plus the authorized choice ID.

## Implementation evidence before independent review

- T0: 3,559 existing file fingerprints and 181 scoped source snapshots captured under `/tmp/lisno-free-rules-qa/`.
- T1: 124 focused Python rules tests passed; old Python source unchanged.
- T2: new build/start packaging only; shell syntax and 32 launcher lifecycle tests passed. Remote dependency installation not run.
- T3: 116 focused web tests and typecheck passed; browser checks at 1440×900, 390×844 and 320×700 passed. Fixed a reproduced account-switch composer stall and disambiguated duplicate project choices within the owned panel.
- T4: 92 mobile tests and typecheck passed, including native compiler regression and actual-response rendered checks.
- T5: 12 actual Python HTTP / Node integration tests passed. Backend production source untouched. Golden synthetic responses are shared by web/mobile rendered tests.
- Initial source reconciliation: only approved chat UI/tests and the two working documents changed among existing files; no deletion.
- Manual guide drafted at `assistant-service/deployment/RENDER_FREE_RULES.md`; actual remote build/resource/deployment checks remain pending.

## Independent review corrections

- Fact selection: the reused helper's 20-reference cap could omit all execution progress when status returned 20 rows. The new rules wrapper now reserves representative kinds from every requested fact source, then fills remaining slots fairly; original Python helper stays unchanged. Three regression cases added; 127 focused rules tests passed.
- Launcher shutdown: the original 8-second drain could terminate valid backend cleanup early. The launcher now allows a 25-second Node drain plus 2-second Python cleanup, preserves nonzero exits, supports a bounded override for separately extended platform grace, and reports forced termination as failure. Reviewer rechecked both fixes and found no unresolved confirmed defect.

## Final local handoff evidence

Independent review found no unresolved confirmed defect after the two corrections. Independent verification on the settled worktree passed all **743 tests** with no skipped cases in successful runs:

| Lane | Result |
| --- | --- |
| Python non-model suite | 230 passed |
| Launcher lifecycle and isolation | 36 passed |
| Backend provider/private/shared/app/bootstrap plus actual HTTP | 268 passed across 8 files, including 12 real Python HTTP cases |
| Web rendered/recovery/API/shared/optimizer | 117 passed across 10 files |
| Mobile rendered/state/API/shared/native compiler | 92 passed across 8 suites |
| Backend, web and mobile typechecks | All passed |
| Build script shell syntax and repository diff check | Passed |

The commands above are the exact final lanes. Initial launcher/backend sandbox runs hit loopback `EPERM`; authorized reruns passed. Browser interaction checks passed at 1440×900, 390×844 and 320×700, including a screenshot of the actual Python/Node approved-price fixture. Native rendered tests include greeting, project choices, clarification, retry, restricted/stale prices and disabled attachments. These are not physical-device tests.

Reconciliation checked all 3,559 initial file fingerprints: 11 expected existing documentation/chat/test changes, 20 new files, no missing or unexpected paths. All 612 protected backend/OCR/old-Python/package/deployment files in the verifier’s broader set are unchanged. No existing package or lockfile changed; the new minimal Python manifest reuses existing pinned versions.

Temporary test children and the synthetic browser harness are stopped. Cleanup found the old Vite process absent; its cause was not established. The primary restored the ordinary frontend dev server on localhost:5173 (session 51329) and verified HTTP 200. The original backend process remained running; /api/v1/health returned status ok. No assistant service remains running on the Mac. The task-owned caffeinate hold (PID 8380) was released after verification; its absence was confirmed in power assertions, restoring normal sleep behavior.

Evidence logs, synthetic screenshots and baseline snapshots remain outside the repository under `/tmp/lisno-free-rules-qa/`, including `final-verification/` and `web-visual/`. No runtime artifacts were staged or committed.

Not performed: full production builds/full workspace suites, Linux dependency installation, actual Render deployment, remote memory/latency/cold-start/platform shutdown checks, real-Mongo integration, OCR tests or physical-device tests. Existing source readers are injected typed synthetic readers in the real HTTP integration; this is not real-database evidence. No schema or transaction change requires a migration; no migration, seed, production write, commit, push or deployment was performed. No lint script exists and no lint pass is claimed.

Manual release guide: [Render Free rules setup](../../../assistant-service/deployment/RENDER_FREE_RULES.md). The connected Git branch must receive the reviewed source before Render can deploy it. Local completion does not mean live chat has been switched over.


## Follow-up: normal development startup and real project proof

The user again observed 503 for `Show my project progress`. Inspection found the normal `backend/npm run dev` process listening on port 3000 with its OCR worker but no Python process on 8080. The separate chat launcher was not the normal development entrypoint. Earlier HTTP smoke used an account without accessible projects and therefore did not test actual project source readers. This is a continuation of the approved local chat repair in Mode A.

One parent task is in progress: restore reliable local private and shared chat.

1. Startup owner changes only `backend/package.json` and the local launcher contract test to route the normal development command through the already tested combined supervisor. No dependency or lockfile change. Existing OCR extraction source and protocol remain unchanged. The source entrypoint avoids demo provisioning; backend/Python edits require a restart. This explicit lifecycle replaces the old backend watcher; frontend hot reload is unaffected.
2. Independent test owner adds isolated ephemeral Mongo plus real Python HTTP coverage using actual project source readers for private Ask Lisno and shared Project Messages, with asymmetric project/identity assertions. No application database seeding or real message publication.
3. Primary updates the local instructions, integrates any confirmed defects, and preserves all unrelated dirty paths. Independent review and final verification follow the settled edits.
4. After code verification, restart the local stack only with appropriate authorization, confirm one backend/Python/OCR instance, and run loopback API smoke. User declined a previous process-stop request, so that declined action is not silently retried.

Acceptance: normal `npm run dev` connects both chat surfaces to rules Python with ephemeral internal credentials, no cloud AI fallback, no configured-price disclosure, no port-conflicting duplicate backend, actual database-backed project answers verified, and OCR source fingerprints unchanged. Evidence and final limitations will be recorded after checks complete.


### Final evidence for the normal-development repair (2026-10-15 23:22 IST)

Independent review found no confirmed defect. Independent final verification passed **175 tests**, with no final failures or skips:

| Working directory | Exact check | Result |
| --- | --- | --- |
| Root | `node --test scripts/local-chat.test.mjs scripts/render-start.test.mjs scripts/local-chat-topology.test.mjs` | 44 passed |
| `backend` | `node --import tsx --test ../scripts/local-chat-with-ocr.test.mts` | 14 passed |
| `backend` | `LISNO_ASSISTANT_TEST_PYTHON=/Users/apple/Desktop/personal/lisno/assistant-service/dist/rules-venv/bin/python npm test -- tests/assistant-rules-mongo.replica-set.test.ts tests/assistant-rules-integration.test.ts tests/development-processes.test.ts tests/development-startup.test.ts tests/server.test.ts` | 61 passed, including 4 actual Mongo/Python project tests |
| `backend` | `npm run typecheck` | Passed |
| `frontend` | `npm test -- src/features/ask-lisno/AskLisnoRules.responses.test.tsx src/features/messages/useChatAssistant.test.tsx` | 40 passed |
| `mobile` | `npm test -- --runInBand src/features/ask-lisno/AskLisnoRules.integration.test.tsx src/features/messages/usePendingAssistantRefresh.test.tsx` | 16 passed |
| Root | `git diff --check`, `git status --short` | Passed; existing unrelated dirty work preserved |

Strict standalone TypeScript checks also passed for the combined wrapper, its tests and the nested-process fixture. Initial sandbox socket restrictions were retried with authorized access; final runs passed. The root lifecycle fixture runs both supervisors with real synthetic descendants and proves normal and forced shutdown reaps them before completion.

The four new Mongo tests use an ephemeral replica set and real Python HTTP, with actual source readers. They prove 75% versus 25% progress for different project owners, unequal immutable published totals despite divergent working prices, cross-client denial, no private-message publication, shared publication/deduplication, freshness invalidation, and exclusion of names/internal labels/prices from Python payloads. No application database fixture was created.

After approval, the positively identified old backend/OCR stack stopped gracefully with no forced termination. The normal `cd backend && npm run dev` command is running (tool session 55726), with one backend on 3000, one Python rules service on 8080, and one OCR worker. Frontend remains on 5173. Launch logs reported `rules-ready` and backend/OCR readiness. Live health checks for backend/Python/frontend and four private-chat requests returned 200. The existing demo account has no accessible projects, so progress/status correctly returned clarification; no claim is made that the user's exact account was exercised.

Production changes for this follow-up are confined to the backend dev script; the existing combined launcher implementation is reused. New test files are `backend/tests/assistant-rules-mongo.replica-set.test.ts`, `backend/tests/helpers/assistant-rules/mongo-projects.ts`, `scripts/local-chat-topology.test.mjs` and `scripts/fixtures/render-chat/combined.mts`. Existing launcher tests and local instructions were updated. All 30 protected OCR files and existing backend development source hashes are unchanged. No dependency/lockfile, schema, extraction protocol, cloud provider or authorization change.

Evidence: `/tmp/lisno-normal-dev-chat-qa/final-verification/`, `/tmp/lisno-normal-dev-chat-qa/live-smoke.json`, and scoped baseline files in the same temporary directory. No production deployment, commit, push, migration, seed, physical-device/browser session verification, OCR extraction workload test or full-workspace test/build was performed. This follow-up changes startup wiring and tests, with no new UI source change; the frontend/native rendered checks passed. Backend/Python edits now require restarting the combined development command; frontend hot reload is unaffected.
