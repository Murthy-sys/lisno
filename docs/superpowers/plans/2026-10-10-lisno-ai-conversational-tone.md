# Lisno AI conversational tone and automatic reply plan

Date: 2026-10-10 (Asia/Kolkata)
Status: Complete; implemented and verified locally on 2026-10-10
Specification: [Natural, considerate Lisno AI replies in both chats](../specs/2026-10-10-lisno-ai-conversational-tone-design.md)
Specification approval: received in conversation on 2026-10-10.
Execution mode: A, parallel sub-agents, selected in conversation on 2026-10-10.

## Outcome and scope

Implement the approved specification's natural greetings and considerate, context-aware responses in both chats. Include all eligible Client messages in automatic Project-message handling, with a full two-minute staff-response window. Private Ask Lisno and explicit retries remain immediate.

Use the existing integration, output format, project authorization, pricing and usage controls. No UI redesign, new model/provider/key, sentiment database, attachment analysis, dependency, migration, deployment, seed, customer communication, commit or push is included.

The repository already contains substantial uncommitted work. Preserve it and compare this task against a captured baseline, not against a clean checkout. The preceding conversational-agent implementation is the starting point.

## T1. Capture the baseline and settle the internal integration

Owner: primary engineer. Dependency: task-plan approval and execution-mode selection. Acceptance: AC5–7.

- Capture the current dirty-path inventory and relevant tracked/untracked file contents under a task-specific temporary directory, excluding environment secrets and customer data.
- Trace the existing provider interface, Ask Lisno resolver/final response, runtime claim/publication and source-free narrative rendering. Confirm that optional narrative remains compatible with old results.
- Agree the narrow internal context contract before parallel writers begin. Prefer existing scoped Client history. If attachment-presence or opening/follow-up hints are necessary, make them optional, derive them server-side and share their exact type/defaults with both owners. Do not pass attachment names, URLs, storage references or contents, staff messages or private answer bodies.
- The primary engineer owns any necessary shared contracts/OpenAPI changes, shared test fixtures and broad integration files. No public contract or persistence change is expected; avoid these changes unless required within the approved scope.

Exit: both implementation slices have compatible internal inputs and explicit non-overlapping ownership. Only one parent phase is in progress at a time.

## T2A. Shared conversational policy and private social replies

Owner: backend implementer A. Dependency: T1. May run in parallel with T2B in Mode A. Acceptance: AC1, AC5–7.

Owned files:

- `backend/src/services/project-assistant-openai.ts`
- `backend/src/services/project-assistant-narrative.ts`
- `backend/src/services/ask-lisno.service.ts`
- `backend/src/services/ask-lisno-project-resolution.ts`, only where necessary for social messages
- Corresponding `project-assistant-openai`, `project-assistant-narrative`, `ask-lisno` and resolver test files

Work:

- Extend the shared instructions for warm opening greetings, natural ongoing replies, gratitude, frustration, worry, confusion, corrections and terse follow-ups. Avoid repeated introductions, psychological labels, unnecessary apologies and unsupported reassurance.
- Permit source-free social/empathetic wording while preserving reference, money, date, qualification and operational-promise validation. Do not relax the validation of project claims to accommodate greetings.
- Allow a pure greeting or acknowledgment in Ask Lisno without a forced project-name clarification or unnecessary project/profile reads. A greeting combined with a substantive project question must still resolve the project and use current evidence normally. Preserve authorization of supplied scope hints and existing quota accounting.
- Keep ambiguous short messages such as “Yes” or “No” contextual rather than automatically assuming they mean acceptance, cancellation or approval. Existing messages remain untrusted context.
- Keep the same response shape and private/shared disclosure rules. Where the existing UI prioritizes resolver clarification over narrative, ensure social replies are returned in a compatible neutral/account state rather than a misleading project clarification.
- Add meaningful provider/output/service tests using synthetic conversation cases and controlled tool outputs. Cover source-free greetings, empathetic verified replies, unknown dates, attempted promises and mixed greeting/project requests. Prompt-text assertions alone are insufficient evidence of conversational quality.

Exit: both entry points use the shared policy; private greetings do not require a project; project facts and financial controls remain intact.

## T2B. All-Client-message coverage and consistent automatic timing

Owner: backend implementer B. Dependency: T1. May run in parallel with T2A in Mode A. Acceptance: AC2–4, AC6–7.

Owned files:

- `backend/src/domain/project-chat-assistant.ts`
- `backend/src/services/project-chat-assistant.service.ts`
- `backend/src/services/project-assistant-runtime.ts`
- `backend/tests/project-chat-assistant.test.ts`
- `backend/tests/project-assistant-runtime.test.ts`
- `backend/tests/project-chat-assistant.replica-set.test.ts`
- `backend/tests/project-assistant-runtime.replica-set.test.ts`
- Existing assistant route/app integration tests only when their prior immediate-response assumptions need updating

Work:

- Remove the normal-priority greeting/acknowledgment exclusion. Enqueue eligible text and attachment-only Client messages while retaining active Client/project membership and provider checks. Do not generate additional staff alerts for ordinary messages.
- Make automatic eligibility two minutes after the source message, independent of staff hours and owner availability. Preserve immediate explicit requests. Remove claim-time shortcuts that bypass the automatic wait.
- Reconcile never-started pending automatic runs from their source timestamps, including previously immediate/shortened runs. Do not restart leased work, alter retry backoff, rewrite history or reset budgets.
- Preserve narrow related-fragment combination, the original bounded combination window and source lineage. A newly combined run waits at least two minutes after its latest included Client message; unrelated questions remain separate. Changes to tagging or worker retries must not create indefinite postponement.
- Allow an accompanying text question through without reading attachments. For an attachment-only source, produce the approved polite request for a text description through the existing answer/publication boundary. Never claim attachment interpretation.
- Retain staff-reply checks before claim and publication, idempotency receipts, CAS/leases, revocation handling, retries and quotas. Staff/service messages cannot start an AI loop.
- Replace outdated tests that expect skipped acknowledgments, immediate no-owner replies or old fragment deadlines. Cover 119,999/120,000 ms boundaries, no/lost owner, outside hours/closing boundary, pending compatibility, explicit retry and quantity-fragment timing. Exercise races in the affected replica-set tests.

Exit: automatic coverage and timing match the approved behavior, with no duplicate answers or changed alert routing.

## T3. Integrate and validate answer presentation

Owner: primary engineer. Dependency: both T2 slices complete. Acceptance: AC1–7.

- Reconcile provider/runtime inputs and private resolver results. Check complete greeting, complaint, thanks, attachment-only and text-with-attachment journeys.
- Review generated shared message bodies and authenticated narrative rendering together. A greeting must not be displayed with a contradictory generic “project information checked” preamble; existing private answer rendering and shared previews remain safe.
- Own any narrowly necessary frontend adjustment in `ChatAssistantResult.tsx`, `AskLisnoPanel.tsx` and their rendered tests. Reuse the existing layout; do not redesign it or add new status/feeling labels.
- Add rendered checks for social responses in both entry points, no unnecessary project picker/clarification and no duplicated answer. Run existing affected frontend tests even if product UI changes prove unnecessary.
- Update `docs/operations/project-messages-ai.md` only for the approved tone, coverage, attachment limitation and automatic timing behavior.
- Compare all edits against the captured baseline and verify that unrelated workflows, model configuration, shared pricing and permissions were preserved.

Exit: integrated behavior meets the specification and is ready for independent review.

## T4. Integrity review and focused corrections

Owner: integrity reviewer in Mode A; primary inline in Mode B. Dependency: T3 complete.

Read-only review of early replies, suppression races, fragment timing, retries/leases, untagged notification side effects, scope authorization, pure versus mixed social messages, source-free empathy, shared/private data, and attachment non-disclosure. Assign confirmed corrections within the same ownership boundaries, then recheck the integrated diff. Do not overlap final verification with source edits.

Exit: no remaining confirmed blocker, or an explicitly documented limit that prevents completion.

## T5. Final verification and handoff

Owner: verification runner in Mode A; primary inline in Mode B. Dependency: T4 corrections complete.

Run focused checks on the integrated tree, broadening only for failures or newly affected shared contracts:

```sh
# backend/
npm test -- tests/project-assistant-openai.test.ts tests/project-assistant-narrative.test.ts tests/ask-lisno.test.ts tests/ask-lisno-project-resolution.test.ts tests/ask-lisno-routes.test.ts tests/project-chat-assistant.test.ts tests/project-chat-assistant-routes.test.ts tests/project-assistant-runtime.test.ts tests/project-assistant-app.test.ts tests/project-chat-assistant.replica-set.test.ts tests/project-assistant-runtime.replica-set.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-pricing.test.ts
npm run typecheck
npm run build

# frontend/
npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/messages/ChatAssistantResult.test.tsx src/features/messages/ChatTimeline.test.tsx
# Run typecheck/build if frontend product sources change.

# repository root/
git diff --check
git status --short
```

Map final evidence to AC1–7. Use a small synthetic conversational quality matrix for greeting, angry/upset, neutral, uncertain and follow-up exchanges. Inspect actual generated wording when a live synthetic OpenAI check is available; report simulated versus live evidence accurately. Do not use customer data or publish responses to real project chats. Keep existing configured model/key and usage limits.

Rendered tests cover changed answer presentation. If product UI changes, also inspect a desktop and narrow-screen fixture; reuse the already verified chat layout. Never start the normal backend bootstrap solely for visual QA because it may seed demo records. Store temporary logs/screenshots outside the repository. No lint script exists, so do not report lint as passed.

Final handoff records exact checks/results, unrun checks, generated artifact paths, affected areas and any limitations. No deployment or external customer communication is implied. Mark this plan complete only after integrated verification succeeds.

## Parallel execution boundaries

In Mode A, T2A and T2B are the only concurrent implementation slices. Each writer is told that others are working in the same repository and must preserve their edits. The primary owns shared interfaces and T3. T4 and T5 follow writers sequentially. In Mode B, the primary performs all tasks inline without implementation subagents.

## Approval and execution record

Specification and task plan approved; Mode A selected. T1 baseline captured under `/tmp/lisno-tone-2026-10-10/`. T1–T5 are complete. Internal context remains bounded Client text; optional per-message `hasAttachments` conveys presence only, with no attachment metadata/content. No public contract, schema, model or credential change was needed.

With the unchanged public contract settled, a third non-overlapping frontend slice prepared T3's narrow presentation work alongside T2: retaining the last resolved project through account/social replies and omitting empty source disclosures for source-free social responses. It owned only `AskLisnoPanel.tsx`, `AskLisnoLauncher.test.tsx`, `ChatAssistantResult.tsx` and its test. Full integration and final review followed backend writers.

## Integrated result and review

- Shared provider policy now handles greetings, gratitude, distress and corrections with concise, grounded conversation. Pure social turns expose no project/profile tools. Current project claims, amounts, dates and workflow qualifiers remain validated.
- Every eligible Client text or attachment-only message enters automatic handling with a full 120,000 ms wait. Never-started pending runs adopt source-based timing; explicit requests, leases and retry accounting retain their existing semantics.
- Narrow question/detail combination retains the original thirty-second window and waits from the latest source. Linked social acknowledgments remain separate, so “Thanks” cannot suppress an unanswered question. Staff replies still suppress work before generation and publication.
- Private social turns retain the last resolved project only as a reauthorized hint. Source-free answers omit empty source disclosures. Shared preview and staff completion copy no longer imply that a social reply failed.
- Independent integrity review found and verified fixes for social “today” validation, gratitude/correction resolution, and linked acknowledgment suppression. Final read-only reproductions and source review reported no remaining confirmed blocker. All source writers stopped before final verification.

## Conversational and rendered evidence

Eight live synthetic OpenAI cases passed using the existing local configuration: shared/private greeting, frustrated project question, worried project question, neutral opening, contextual follow-up, thanks and attachment-only clarification. Greetings and thanks used no source reads; the follow-up did not repeat a greeting. Project answers preserved vendor-reported versus Site Manager-verified progress and the absence of a confirmed handover date. Attachment-only output requested text rather than claiming to inspect the attachment. No customer data or real project message was used. Evidence: `/tmp/lisno-tone-2026-10-10/live-quality-final.log`.

Browser checks used actual frontend components in an isolated synthetic fixture at widths 1440, 390 and 320 pixels. The panel/composer stayed within the viewport without horizontal overflow; social answers had no empty source/time disclosure; factual answers retained sources; project context survived thanks and the following question. No page errors occurred. Evidence: `/tmp/lisno-tone-2026-10-10/browser.log`, `greeting-1440.png`, `greeting-390.png`, `greeting-320.png`, and `followup-desktop.png` in the same directory. A fixture favicon 404 is unrelated to application behavior.

## Final verification record

The independent verification runner used the exact focused commands listed in T5 on the integrated sources:

| Check | Result |
| --- | --- |
| Backend focused tests, 13 files | 315 passed, including 24 replica-set tests; exit 0 |
| Frontend focused tests, 3 files | 49 passed; exit 0 |
| Backend `npm run typecheck` | Passed; exit 0 |
| Frontend `npm run typecheck` | Passed; exit 0 |
| Backend `npm run build` | Passed; exit 0 |
| Frontend `npm run build` | Passed; exit 0 |
| Root `git diff --check` | Passed; exit 0 |
| Root `git status --short` | Exit 0; no new status paths versus the captured initial status |

The first sandboxed backend attempt could not open local HTTP/Mongo ports (`EPERM`). The same tests passed on a properly escalated rerun; no tests or transaction requirements were weakened. Both attempts are retained under `/tmp/lisno-tone-2026-10-10/final/`. Non-blocking warnings: Mongoose `validateSync` deprecation and Vite chunks above 500 kB. The worktree remains dirty with pre-existing work preserved; the task-specific baseline comparison contains 22 changed paths including tests and documentation.

| Acceptance criteria | Evidence |
| --- | --- |
| AC1: considerate, continuous conversation in both chats | Provider/narrative/private-service/resolver cases; eight live synthetic outputs; rendered social/follow-up checks |
| AC2: all Client messages, no staff loop or attachment disclosure | Chat-service/runtime tests for tagged, ordinary, social and attachment-only sources; provider receives presence only |
| AC3: strict two-minute eligibility | Fake-clock 119,999/120,000 ms tests; owner/hours/legacy pending and fragment cases; explicit/private immediate cases |
| AC4: staff suppression, idempotency and lineage | Runtime and replica-set tests; linked acknowledgment regression; read-only integrity reproductions |
| AC5: social versus grounded project responses | Social tool restrictions, validator/date/qualification tests, private resolution tests and live verified/unknown-date samples |
| AC6: existing authorization, pricing and quotas | Source/pricing, route/app, private-service and runtime regressions; independent integrity review |
| AC7: integrated verification | Focused test lanes, typechecks, builds, rendered/browser checks and repository hygiene recorded here |

Full repository test suites, OCR tests and production checks were not run because their paths were unchanged. No lint script exists. No dependencies, lockfiles, schemas, migrations, seeds, production records, model/key settings, commits, pushes, deployment or real customer messages were changed. The temporary visual server was stopped. Temporary evidence remains under `/tmp/lisno-tone-2026-10-10/` for review and is not staged.

Conversational output remains generative: these deterministic regressions and live synthetic samples verify representative behavior, not every possible phrasing. Replies become eligible at two minutes; existing worker cadence, provider latency and quotas still apply. The browser fixture verifies actual components with synthetic data rather than a production session.
