# Free Render Python rules assistant

Date: 2026-10-15, Asia/Calcutta
Status: Approved. The task plan is also approved and the user selected parallel execution (A). Local implementation, independent review and targeted verification are finished. Actual Render deployment and remote resource acceptance remain separate manual release checks.

## Goal and confirmed decision

Make Ask Lisno usable on web, mobile and Project Messages using lightweight Python intent rules and backend-authorized database reads, within the user's existing free hosting budget. The user explicitly selected “Keep hosting free; use limited rules-based chat” after identifying the backend as `https://lisno.onrender.com`, Render Free, Oregon (US West).

This supersedes the self-hosted language-model requirement in `2026-10-15-python-ask-lisno-assistant-design.md`. All existing privacy, authorization, immutable customer-price, compatibility and no-cloud-AI constraints remain. No Gemini-like general understanding or measured speed advantage is promised. There is no model runtime, model download, paid service, GPU requirement or production dependency on the user's Mac. The user subsequently authorized local development testing before moving to the server.

The user's subsequent scope instructions are also authoritative: use the OCR worker's separate-folder organization only as a reference; keep chat code in its own folder in the same repository; preserve existing code outside the permitted chat work. The latest instruction, “do chat functionality changes in web and mobile also,” explicitly permits changes to existing web/mobile chat consumers. It does not authorize changes to OCR extraction or unrelated application functionality.

## Change boundaries

- **New Python chat code:** add dedicated rules-service files under `assistant-service/`, reusing the existing step contract and safe deterministic planner where compatible. Keep existing model-service files unchanged; the new entrypoint has its own model-free configuration and readiness behavior.
- **Web and mobile chat:** existing Ask Lisno components/hooks/API consumers and assistant-specific Project Messages components may be changed as required for functional integration, accurate supported-question wording, clarification and recovery. Their relevant tests may be updated or added.
- **Backend:** reuse the already-implemented Python assistant interface and existing authorized readers. Existing backend production files remain unchanged for this revised implementation. New contract/integration tests may verify the interface. If an actual contract incompatibility requires a backend edit, report the concrete dependency before proceeding outside this boundary.
- **Hosting:** add separate build/start scripts and the manual deployment guide. Do not rewrite the existing `render.yaml`, backend entrypoints or package scripts. Render dashboard configuration is a later manual action by the user.
- **Untouched:** `ocr-worker/`, extraction routes/jobs, ordinary human-message behavior, authentication/authorization rules, finance calculations, storage, unrelated screens and all other existing source files.
- The earlier authorized crash and greeting-availability repairs remain in place. This boundary is not an instruction to revert those changes or other existing dirty work.

## Current behavior and evidence

- Web and native startup defects have separate verified repairs recorded in the existing Python assistant task plan.
- Local chat requests were then blocked because the Python destination/token were absent and private Ask Lisno was not explicitly enabled. The approved repair now allows existing direct greetings and owned-project lists without a remote provider; business questions still require Python.
- `assistant-service/src/lisno_assistant/planner.py` already implements conservative deterministic routing and tool-reference handling. Unknown requests currently fall through to `OllamaRuntime` in `app.py`.
- Existing model-service `Settings` requires a model tag, digest and URL; readiness checks model presence. The new rules entrypoint must use separate model-free settings without modifying that existing implementation or supplying fake model values.
- Node owns authentication, scoped queries, source freshness and actual customer prices. Python has no database connection.
- Current transport rejects public/DNS destinations and requires TLS across hosts. Co-locating Python on loopback preserves this boundary without exposing another public assistant URL.
- The repository's `render.yaml` describes paid Singapore services and an OCR worker. It does not describe the user's actual Free/Oregon deployment and must not be applied wholesale.

## Hosting evidence

Render lists Free compute at 512 MB RAM and 0.1 CPU. Free web services sleep after 15 minutes without inbound traffic, do not support persistent disks, and cannot receive private-network traffic. They can send private-network requests. Sources: [compute plans](https://render.com/docs/compute-plans), [free service limitations](https://render.com/docs/free), [private networking](https://render.com/docs/private-network).

Render's native runtimes include Python development tools and pip during builds and at runtime, as well as Node. This makes a Node service with a small Python child process a credible option, subject to a build-time Python-version check and remote resource verification. Source: [native runtime tools](https://render.com/docs/native-runtimes).

## Chosen approach

Run one Python rules service alongside the existing Node backend in the **same Render service**. Keep the existing public backend URL and runtime where compatible. Python binds only to `127.0.0.1:8080`; Node alone listens on Render's public `PORT`. The same existing server-only token authenticates Node-to-Python requests. Python does not receive database credentials, user session tokens or unrelated cloud credentials.

Prefer the existing native Node runtime with a version-checked Python virtual environment. A small Node launcher manages the Python process and launches the ordinary production backend, including signal forwarding, bounded restart/backoff and clean shutdown. A Python failure must not stop ordinary application routes. It must not launch the development bootstrap, seed/demo account setup, OCR worker or another model service.

A separate Free Python web service would require a second public endpoint, additional shared free-instance hours and broader transport changes. A paid private service conflicts with the user's selected budget. Neither is the chosen implementation.

## Scope and supported behavior

Both private Ask Lisno and existing shared-project assistant entry points use the same rules interpreter and verified backend tool contract.

| Message class | Required behavior |
| --- | --- |
| Greetings, thanks, goodbye, basic help | Appropriate bounded reply without an external request or invented facts. |
| Owned project list | Existing authorized paginated Node path, with ownership and freshness rechecks. |
| Project status or overall progress | Resolve the authorized project and render only available verified status/execution facts. |
| Overall schedule or timeline | Read supported schedule facts; distinguish absent dates from real dates. |
| Existing published/approved project price | Reuse the immutable customer-estimate reader and exact integer-paise presentation. Never use Configuration prices. |
| Mixed greeting plus supported question | Process the question; do not answer only the greeting. |
| Ambiguous project, ambiguous intent or unsupported paraphrase | Ask a useful clarification or offer supported actions. No speculative tool selection. |
| New work, changed scope or item-specific amounts without explicit source | Explain that a project-team quote or more context is needed. No derived or invented charge. |
| Room/item progress or material details absent from the safe projection | Explain the supported scope; no inference from unrelated aggregate facts. |
| Internal/private information request | Refuse using the existing privacy response. |

Rules must use whole-message or explicit structured intent matching, preserve required business fragments in shared runs, and normalize case/spacing/conservative greeting prefixes. Keywords alone must not turn a complex or negated request into the wrong read. Unknown requests in rules mode return a safe clarification, not a model-unavailable error.

## Web and mobile functional changes

The implementation includes both private Ask Lisno and assistant results in Project Messages on web and mobile. Preserve the approved chat presentation and floating mobile launcher; this is not another visual redesign.

- Send text and quick-prompt requests through the existing authenticated Node endpoints. Neither client connects directly to Python or contains the service token.
- Align the welcome/help text and quick prompts with supported project lists, progress, schedules and published/approved estimates. Remove promises to answer unrestricted vendor, material or arbitrary questions. Current web welcome text says “Ask me anything” and mentions vendors; that overstates the selected rules scope.
- Render greetings and clarification replies as normal conversation responses. A question outside the rules must not look like an infrastructure failure. Preserve accessible project-choice controls, project pagination, scoped follow-ups and source-refresh actions.
- Preserve draft text on actual request failures; retry the correct failed question without duplicate turns. Retain loading, disabled, busy/rate-limit, expired-session, permission and source-changed states. Do not claim a sleeping Render service is known to be asleep when only a network failure is observable.
- Preserve account/environment/session isolation and discard stale in-flight responses after a switch. Prices remain hidden until current authorization and source freshness have been checked.
- Project Messages continues to show the existing scheduling/running/completed/failed assistant states without changing human messages, mentions, attachments, notification delivery or eligibility rules.
- Keep file/photo buttons disabled with the existing “Not available yet” hint. No new upload feature, dependency, icon system or broad style refactor is included.

Likely consumer areas are `frontend/src/features/ask-lisno/`, assistant-specific files in `frontend/src/features/messages/`, `mobile/src/features/ask-lisno/`, and assistant-specific files in `mobile/src/features/messages/`. The task plan will name exact files and owners after approval.

## Invariants and contracts

- No cloud AI/API, model call, automatic pull, embedding service or external inference fallback. Rules mode must not instantiate a model HTTP client.
- Node remains the only database reader and authorization authority. The request/response step contract, opaque fact/report references and protected-price reconstruction remain compatible.
- Only clients use private Ask Lisno. Project Messages retains its existing membership, eligibility, scheduling, leases, human-reply suppression, idempotency, audit and viewer-specific disclosure checks.
- Both feature flags remain explicit and independent. An intentionally disabled feature stays disabled.
- User prompts are untrusted. No SQL, shell, dynamic Python execution or user-selected destinations. No sensitive values in logs.
- Preserve existing retry states, private-history separation, web/mobile layout and disabled attachment controls. User-facing descriptions should accurately describe a project assistant with bounded supported questions.
- No schemas, stored approvals, prices, project messages or historical result policy are migrated. Existing unsafe legacy result suppression remains in force.

## Runtime and failure handling

- Add a dedicated rules entrypoint selected by the new launcher. Its settings require no model variables and it does not initialize the existing model runtime. Existing model-service configuration stays unchanged and is not used by this deployment.
- Liveness reports process health; authenticated readiness checks interpreter/configuration availability without model/network work.
- One Python worker and one concurrent rules request initially; existing Node admission, deadlines and payload limits remain. Bound child retries and output. No background polling or keep-awake traffic to evade free-tier sleep.
- Restrict inherited child environment to required process/runtime configuration and the service token. Do not pass MongoDB credentials or Node JWT/cloud keys into Python.
- Install only the needed web/validation packages from pinned manifests. No ML libraries or weights. Measure combined Node/Python RSS and API responsiveness under small concurrent synthetic loads; free-tier capacity is a release check, not an assumption of unlimited headroom.
- Cold starts remain a Free-tier limitation and may take about a minute according to Render. Preserve bounded retry behavior; do not promise always-on or instant responses.
- No production change is authorized by approving this specification. The user requested manual deployment instructions and will perform the rollout separately unless a later exact-target authorization says otherwise.

## Manual Render rollout instructions to deliver after implementation

These are the intended settings, **not commands to apply before the package is implemented and verified**. The final guide must replace the proposed script names below with their actual verified paths.

1. Make the reviewed release available in the Git repository/branch connected to the existing `lisno` service. Committing or pushing is a separate authorized action; it has not happened here.
2. In Render Dashboard, open **lisno → Settings**. Preserve Oregon, the Free compute plan, existing service identity/URL and database/auth/storage/CORS settings. Record current build/start/root values for rollback.
3. Make the monorepo's `backend/`, `assistant-service/`, and deployment scripts available to the build. If Root Directory is currently `backend`, use repository root and the verified scripts so sibling Python sources are included. Proposed Build Command: `bash scripts/render-build.sh`; proposed Start Command: `node scripts/render-start.mjs`. These scripts do not yet exist.
4. Set the explicit rules-mode environment switch, `ASSISTANT_SERVICE_URL=http://127.0.0.1:8080`, and a generated server-only `ASSISTANT_SERVICE_TOKEN` of 32–512 printable non-whitespace ASCII characters. The launcher passes the same token to Python. Keep `ASK_LISNO_ENABLED` and `PROJECT_CHAT_AI_ENABLED` false until readiness and the release checks are completed. Do not paste the token into chat or public frontend/mobile variables.
5. Keep Health Check Path `/api/v1/health`; it must continue checking ordinary API availability independently of optional chat. The launcher reports sanitized Python readiness without exposing tokens or internal payloads. Python remains loopback-only and is not added as a public route.
6. Manually deploy the reviewed release. Confirm the original login, project lists, ordinary messages and backend health before enabling assistant flags. Check the rules service startup and memory evidence in sanitized logs; no Shell/SSH-only step may be required because Free services lack shell access.
7. Enable the two chat flags independently and verify greeting, authorized project list/status/timeline, published price, unsupported-question clarification, and a second user's access denial on both web/mobile and shared messages. Test restart and cold-start recovery. Preserve the existing client API base URL.
8. If normal application behavior regresses, restore the prior build/start/root configuration and verified release, leaving assistant flags disabled. Never restore cloud AI or internal-price disclosure as a fallback. Do not delete or recreate the existing Render service.

Do not apply the current repository `render.yaml` to this service: it would select different paid resources, region and services.

## Acceptance criteria

1. Both chat surfaces answer supported rules-based questions through actual Python execution without any model installation/configuration/client or cloud call.
2. Greetings and supported mixed messages return the appropriate answer; unknown wording returns clarification, not invented values or a 503 caused by absent model settings.
3. Two unequal projects and asymmetric users prove source/price correctness, ownership isolation and no Configuration/vendor/internal disclosure. Revocation and stale-source checks remain intact.
4. Startup/stop/crash/restart tests demonstrate Node stays available during Python failure, children do not leak across shutdown, and restarts are bounded.
5. The Python endpoint binds only to loopback; wrong-token/oversized/invalid requests fail safely; sensitive parent environment values are not inherited.
6. Web/mobile Ask Lisno and Project Messages render supported answers, clarification, retry and published-price paths through the real Python rules adapter. Quick prompts match recognized intents; text accurately describes the supported scope. Loading/error/permission/session-change states, private-history separation and disabled attachments remain correct. Existing native compiler regression and web optimizer regression stay green.
7. Relevant backend/Python/frontend/mobile checks pass; remote Linux smoke and memory/latency results are recorded before claiming Free-tier deployment works. No real-model test is needed in this architecture.
8. The final manual guide includes exact existing files, Render settings, secret placement, validation and rollback. No placeholder script is presented as ready to run.
9. No model service, production mutation, migration, commit, push or deployment occurs without the applicable explicit authorization. Under the subsequent explicit local-testing authorization, an ordinary foreground development launcher may run Node and rules Python together. No installed daemon, login service or persistent sleep-setting change is introduced.
10. Final per-file diff review proves the new-file-only Python/hosting/backend-test boundary and the explicit web/mobile chat exception. No OCR or unrelated existing production source is changed.

## Risks, assumptions and open decisions

- Free-tier latency and total memory remain unmeasured. Ordinary Node API load may already consume most resources; fail the rollout check rather than silently consuming paid capacity or claiming no performance impact.
- Supported intent coverage is intentionally limited. Extend rules only with concrete regression examples and clear source support; do not try to recreate unrestricted LLM behavior through loose matching.
- A native-runtime Python version check is required. If the target build lacks a supported Python, return with a concrete packaging adjustment before changing the service runtime.
- Existing uploads/storage are outside this change. The free service's ephemeral filesystem is not made persistent by this assistant work; do not alter or move user files.
- The actual Render Git branch/root/build settings remain unknown. The manual guide must have the user preserve them and apply only the verified relevant changes.
- No remaining product choice is required for specification: free, limited Python rules and existing privacy boundaries are confirmed. This architecture change requires specification approval under the repository workflow before its task plan and implementation.

## Verified prompt compatibility

Real Node-to-Python integration identified that the existing project-name parser interprets “Show project …” and “my published estimate” as names. The final UI payloads preserve backend code: `Show my projects`, `Show my project progress`, `Show my project timeline`, and `Show my estimate` (display label “Published estimate”). The estimate reader still returns only published/approved customer reports. Project-choice callbacks use the same progress prompt plus the authorized choice ID.
