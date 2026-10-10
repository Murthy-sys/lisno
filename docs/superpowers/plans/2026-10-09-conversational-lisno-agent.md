# Conversational Lisno AI implementation plan

Date: 2026-10-09
Status: Complete; locally verified on 2026-10-10
Specification: [Conversational Lisno AI and bottom-corner Ask Lisno](../specs/2026-10-09-conversational-lisno-agent-design.md)
Specification approval: received in the conversation on 2026-10-09.
Execution mode: A, parallel sub-agents, approved in conversation.

## Outcome and boundaries

Deliver three connected improvements: quiet internal alert routing for Client viewers, natural evidence-backed Lisno AI replies, and a compact bottom-corner Ask Lisno window that understands authorized project names without a dropdown.

Reuse the existing OpenAI configuration, read tools, financial calculations, Client-only endpoint, usage controls, and two-minute response policy. No dependencies, new permissions, model/key changes, persistent private-chat storage, deployment, migration, seed, customer messages, commits, or pushes are included.

The current worktree contains substantial tracked and untracked work from earlier tasks, including the assistant implementation. Treat that work as the baseline, not as disposable changes. Only this task-plan file is created at this gate; no product implementation starts until the execution choice.

## Pre-implementation evidence

- `project-assistant-openai.ts` selects verified fact/candidate IDs and an opaque price preview. Its prompt and final schema prohibit prose. Extend this existing loop rather than introducing another chatbot service.
- `project-chat-assistant.service.ts` publishes generic message bodies and returns detailed answers through an authenticated result reader. Preserve that disclosure boundary.
- `ask-lisno.service.ts` authorizes an explicit project ID, shares admission/token budgets, and returns an immediate private answer. Its current request history contains Client text only, without project lineage.
- `assistant-usage.ts` currently admits Client, optional project, and deployment counters together. Name resolution requires project admission after resolution without charging Client/deployment twice.
- `ChatAssistantResult.tsx` displays routing receipts, internal statuses, and refresh buttons under Client messages. `ChatTimeline.tsx` separately renders the generic service-message body, so answer presentation must be integrated to avoid duplicates.
- `AskLisnoPanel.tsx` uses a modal Drawer and loads projects for a dropdown. The existing shared `useOverlay` traps focus, isolates the background, and locks document scrolling; it should not be applied unchanged to the new non-modal popup.

## Shared contract decisions

The primary engineer owns the contract changes and communicates the final TypeScript/Zod shapes before parallel writers start.

1. **Answer:** add an optional bounded conversational representation to generated, stored, public, and frontend answer types. Keep existing facts/candidates/commercial fields and a facts-only fallback for old records. Factual passages identify returned evidence; validate references against the current tool result set. Treat model text as plain text, never HTML. Monetary amounts remain server-rendered from authorized integer-paise snapshots. Structural/reference checks are supplemented by synthetic quality checks, not presented as proof that arbitrary prose is true.
2. **Private request:** preserve older `projectId`, `message`, and `history` requests. Add optional scope hints and project lineage to conversation context. Current-message explicit project names take priority over prior scope and page hints. Client-supplied IDs/history are never authority or current evidence.
3. **Private response:** return server-resolved scope or a bounded clarification state alongside the existing compatible answer fields. Clarification choices contain only authorized, relevant projects and safe distinguishing labels. No full project picker.
4. **Resolution:** use existing scoped project discovery; normalize names and narrow candidates server-side. The assistant may interpret a name/intent and ask a clarification within the same bounded provider workflow. Bind at most one stable project ID per answer, reauthorize it, and admit its project quota before opening project tools. Explicit unknown or ambiguous names must not fall back to a previous project. Account-only help requires no project.
5. **Confidentiality:** keep substantive generated output behind the authenticated answer reader. Shared stored message bodies, reply excerpts, previews, and events stay safe for all conversation members. Private profile facts never enter shared chat. Restricted commercial values never enter unrestricted prose. Successful answer rendering replaces the generic body visually, without exposing data in shared previews.
6. **Compatibility:** optional fields need no backfill. Update validation, OpenAPI, persistence adapters, and frontend types together. No new route or permission is planned. Any discovered need to widen permissions or materially alter scope returns to specification review.

## Dependency order and ownership

Keep one parent phase in progress. In Mode A, only the three explicitly independent implementation slices below run concurrently, after the shared contract is established. Mode B performs the same work inline.

### T1. Capture baseline and establish shared contracts

Owner: primary engineer. Dependencies: plan approved and Mode A/B selected.

- Capture the dirty-path inventory, tracked target diffs, and contents of relevant untracked targets in a temporary directory outside the repository. Exclude environment secrets and runtime/customer data.
- Confirm target ownership and current tests. Inspect existing source authorization and result-read redaction before modifying their consumers.
- Implement the additive types and schemas described above; establish exact limits, optional-field defaults, compatibility behavior, and resolver/provider callback boundaries.
- Own `backend/src/contracts/{ask-lisno,project-chat-assistant}.ts`, corresponding `backend/src/openapi/` files, and frontend API/answer types (`askLisnoApi.ts`, `projectChatAssistantTypes.ts`). Coordinate schema use with the backend service owner rather than defining competing validators.
- Own any necessary shared `app.ts`, repository-interface, authorization-inventory, or broad stylesheet edits. Avoid them if existing interfaces suffice.

Exit: both backend writers and frontend writer have the same contract and fixture examples for resolved, clarification, unavailable, old-answer, and restricted-answer states. Acceptance criteria: AC3, AC5–7, AC9.

### T2A. Conversational provider output and grounded rendering data

Owner: backend implementer A. Depends on T1; parallel with T2B and T2C.

Owned paths: `backend/src/services/project-assistant-openai.ts`, an assistant-local output-validation helper if warranted, and `backend/tests/project-assistant-openai.test.ts` plus narrowly named conversational-output tests. Do not edit shared contracts, Ask Lisno service, runtime, persistence, or publication paths.

- Extend the current tool loop and strict output schema for concise, polite answers tied to retrieved facts. Keep tool names/capabilities bounded and support the agreed private resolver callback without granting scope authority to the model.
- Retain time, tool, payload, attempt, token, and refusal handling. Name interpretation and answer generation share these limits; do not create an unmetered provider call.
- Validate evidence references, bounded narrative content, unavailable facts, and price references. Reject malformed/unknown evidence and keep truthful fallbacks. Do not let customer text or retrieved descriptions override instructions.
- Keep dates, reported/verified states, required/optional additions, and server-generated prices faithful to current evidence. Never claim to contact staff or modify business records.
- Add synthetic cases for natural status answers, missing dates, blockers, account help, estimate additions, contradictory context, invalid references, and injected instructions. Assert the expected factual distinctions as well as schema validity.

Exit: provider returns the agreed format; old/test providers remain supported; adversarial and failure cases pass. Acceptance criteria: AC2–3, AC6–7.

### T2B. Authorized project resolution and private conversation scope

Owner: backend implementer B. Depends on T1; parallel with T2A and T2C.

Owned paths: `backend/src/services/ask-lisno.service.ts`, a focused `ask-lisno-project-resolution.ts` helper if needed, `backend/src/services/assistant-usage.ts`, `backend/src/routes/ask-lisno.ts`, and `backend/tests/ask-lisno*.test.ts` / focused resolver tests. Shared model/repository changes must go through the primary engineer.

- Resolve only current Client-authorized projects using bounded metadata discovery. Do not return other Clients' project names or infer access from a label.
- Implement explicit name precedence, case/spacing variants, safe partial-name matching, duplicate/unknown clarification, inline choice validation, follow-ups, page hints, one-project defaults, and no-project/account support.
- Filter untrusted history by the authorized current scope. A newly named project must not inherit prior project prices, rooms, or facts. Recheck session, ownership, profile, and source freshness before delivery, including after a long provider call.
- Remove the obsolete instruction to use a project dropdown. Return the resolved scope/clarification state without generating a team-chat message or alert.
- Charge Client/deployment admission once per request and project admission once after scope resolution, before project data reads. Retain shared concurrency, retry limits, token reservations/settlement, and transactional behavior.
- Test two asymmetric Clients/projects, duplicate names, forged context and choice IDs, revoked access during resolution/generation, unknown explicit names with a previous scope, multiple named projects, and exhausted project quota after resolution.

Exit: private endpoint passes authorization, resolution, compatibility, and usage tests without private-to-team side effects. Acceptance criteria: AC4–7, AC9.

### T2C. Quiet Project messages and compact Ask Lisno popup

Owner: frontend implementer. Depends on T1; parallel with T2A and T2B using contract fixtures.

Owned paths: `frontend/src/features/ask-lisno/AskLisnoPanel.tsx`, `askLisno.css`, `frontend/src/features/estimates/AskLisnoLauncher.tsx` and its tests, `frontend/src/features/messages/{ChatAssistantResult,ChatTimeline}.tsx`, their focused tests, and `projectChatAssistant.css`. Primary retains ownership of API/type files and any shared overlay/global styles.

- Hide internal alert recipients, routing errors, wait/suppressed footers, and prominent request/recalculate controls from Client viewers. Keep existing staff-only operational presentation and priority/issue functionality.
- Present Lisno AI's authenticated conversational answer once, within its normal message. Retain a compact details disclosure, honest loading/failure state, and legacy facts-only rendering. Any refresh action is a compact AI-answer action or existing menu action, not a footer on every Client message.
- Replace the project dropdown and its eager project-list loading with a single conversation, server-returned clarification choices, and project-scoped turn metadata. Preserve drafts on errors, cancel/ignore outdated requests, and clear inaccessible/session-replaced content.
- Replace the modal Drawer with a bottom-right non-modal popup, approximately 400 by at most 600 pixels. Use existing brand tokens/identity; no decorative orb, new icon library, or extra dependency. Add greeting, short suggestions, scrollable conversation, and fixed composer.
- Support mobile usable viewport/safe-area/keyboard sizing, long text, Enter/Shift+Enter and IME, duplicate-submit prevention, opening focus, Escape within the popup, focus return, and coexistence beneath blocking dialogs. Keep page interaction available on desktop.
- Cover loading, account-only, clarification, empty/no-project, provider unavailable, retry, forbidden, session change, and stale-response states through rendered tests.

Exit: interactive UI passes fixture-driven checks with no dropdown or duplicate answer. Acceptance criteria: AC1, AC3–6, AC8–9.

### T3. Integrate publication, persistence, and live answer reads

Owner: primary engineer. Depends on completed T2 slices.

Owned paths: `backend/src/models/ProjectChatAssistant.ts`, `backend/src/repositories/project-assistant-{memory,mongo}.ts` if needed, `backend/src/services/project-chat-assistant.service.ts`, necessary runtime integration, relevant integration/contract tests, and shared files reserved in T1.

- Persist/retrieve optional conversational output identically in memory and Mongo. Old records must remain valid. Keep immutable records and transactional publication intact.
- Preserve current role-specific commercial redaction and source freshness on every result read. Check response bodies and indirect surfaces, including reply excerpts, events, notifications, and list previews.
- Integrate the provider/resolver callback and usage lifecycle. Ensure the browser cannot broaden scope with forged history, hints, or choice IDs.
- Keep background routing, two-minute human wait, existing immediate exceptions, cancellation during generation, coalescing, duplicate prevention, and final human-reply check unchanged. The timeline's unrelated five-minute visual grouping constant is not an AI timer.
- Run integrated targeted regressions and reconcile the complete diff against the captured baseline.

Exit: complete feature behaves consistently across both entry points; no unresolved writer overlap. Acceptance criteria: AC1–7, AC9.

### T4. Integrity review and fixes

Owner: `integrity_reviewer` in Mode A; primary inline in Mode B. Depends on all writers finishing T3.

Review read-only: project identity and current authorization, narrative/private-data exposure, history switching, source validation, monetary rendering, split admission races, old-record compatibility, human-reply publication races, and popup focus behavior. Primary assigns any confirmed fixes within existing ownership, then reconciles the final worktree before verification. Do not overlap final verification with edits.

Exit: review findings resolved or explicitly reported with evidence; no known blocker remains.

### T5. Final verification and handoff

Owner: `verification_runner` in Mode A; primary inline in Mode B. Depends on T4 fixes finishing.

Run the focused lanes below against the integrated tree. Use synthetic data for browser/API fixtures, isolated test databases, and any optional live-provider check. Do not start the normal backend development wrapper just for visual QA because it can bootstrap demo data. Keep logs/screenshots under a task-specific temporary directory outside the repository.

Update this plan with exact results and the acceptance matrix, then report outcome, changed areas, passed/unrun checks, artifacts, and remaining limits. Tests may require approved sandbox escalation for local listeners. Do not claim live OpenAI behavior was verified unless a live synthetic check actually ran; never expose credentials or use customer messages for such a check.

## Verification lanes

| Lane | Required checks / acceptance |
| --- | --- |
| Provider and scope | Backend `ask-lisno.test.ts`, `ask-lisno-routes.test.ts`, new resolver/output tests, `project-assistant-openai.test.ts`, `project-assistant-sources.test.ts`, `project-assistant-pricing.test.ts`. AC3, AC5–7. |
| Routing and timing | Backend `project-chat-assistant.test.ts`, `project-chat-assistant-routes.test.ts`, `project-assistant-runtime.test.ts`, `project-assistant-app.test.ts`; retain two-minute boundary and in-flight human-reply tests. AC1–2, AC6. |
| Mongo parity/races | Backend `project-chat-assistant.replica-set.test.ts`, `project-assistant-runtime.replica-set.test.ts`; add cases for optional narrative persistence and any changed split-admission transaction. AC2–3, AC6–7. |
| Contract/auth | Backend `api-docs.test.ts`, `authorization-policy.test.ts`, `route-operation-registry.test.ts`, `frontend-authorization-contract.test.ts`; frontend `src/api/authorization-contract.test.ts`. Existing route/permission inventory remains unchanged unless implementation evidence requires correction. AC6, AC9. |
| Rendered interactions | Frontend `AskLisnoLauncher.test.tsx`, `ChatAssistantResult.test.tsx`, `ChatTimeline.test.tsx`, and focused new popup tests. Assert Client/staff differences, no project dropdown, resolved/clarification turns, old answers, failure/retry, aborted replies, keyboard/IME, and session isolation. AC1, AC3–6, AC8. |
| Browser visual/accessibility | Desktop 1440, tablet 768, mobile 390 and 320 pixels; short usable viewport/keyboard simulation, long response/name, open/close/reopen, suggestions, clarification choices, fixed composer, no overflow, page interaction, and blocking-dialog coexistence. Inspect console/network and available accessibility checks. Distinguish emulated keyboard checks from real-device checks. AC4, AC8. |
| Compilation/build/hygiene | Both workspaces: `npm run typecheck`, `npm run build`. Repository: `git diff --check`, `git status --short`, final comparison to baseline. No lint script exists. AC9. |

Run focused tests as `cd backend && npm test -- tests/<listed-file>.test.ts` and `cd frontend && npm test -- <listed-test-path>`, batching related files. Broaden only when changed shared behavior, failures, or review findings justify it. Full repository suites, deployment, real email/customer messaging, migrations, and production mutation are not implied by this plan.

## Rollback and completion record

Rollback the newly introduced presentation/provider/resolver behavior while retaining compatibility with optional stored answer fields. Do not delete historical records or reset the dirty worktree. No database backfill or configuration-secret change is needed.

### Completion and verification record: 2026-10-10

T1–T5 completed in approved Mode A. The integrity review's confirmed findings were corrected and rechecked before final automated verification. A final visual check identified a launcher-layer overlap in an unthemed shell; the feature stylesheet now orders launcher below conversation below blocking dialogs. Launcher tests, frontend typecheck/build and the browser matrix were rerun after that CSS-only correction.

Delivered only the requested conversation changes:

- Client message bubbles omit internal routing receipts and prominent recalculation footers; background routing and the existing two-minute human-response policy remain intact.
- Lisno AI returns bounded conversational paragraphs with verified source references. Authenticated answer reads retain role-specific disclosure and stale-source handling; generic stored shared message bodies remain safe for previews. Optional narrative fields preserve old records without migration.
- Ask Lisno resolves authorized project names, clarifies ambiguous/unknown names, and keeps scoped follow-ups without a project dropdown. It uses existing scoped reads, usage limits and pricing. Reopening rechecks current access before displaying cached project content.
- The non-modal bottom-corner chat uses a fixed composer, suggestions, inline clarification choices, responsive sizing and normal keyboard focus behavior. No dependencies, OpenAI key/model changes or unrelated workflow changes were made.

Principal affected areas: backend assistant contracts/OpenAPI/model, existing provider and Ask Lisno services, project-name and narrative validation helpers, authenticated result rendering, Ask Lisno panel/launcher and their focused tests. `docs/operations/project-messages-ai.md` reflects the shipped behavior. The pre-existing dirty worktree was preserved; task baseline and reviewed path inventory are under `/tmp/lisno-conversational-agent/`.

| Acceptance | Evidence and result |
| --- | --- |
| AC1–2 quiet routing/timing | Existing runtime, publication/race, route and rendered-message regressions passed; human-reply cancellation and background alert logic retained. |
| AC3 evidence-backed replies/compatibility | Provider/narrative tests, stale-result and memory/Mongo persistence tests passed; final live synthetic OpenAI reply succeeded in three provider attempts. |
| AC4–5 private window/project resolution | Resolver/service and rendered tests cover names, unknown/duplicate/partial matches, typed clarification, current-page hints, follow-ups and project switches. Browser suggestions and clarification passed. |
| AC6 access and privacy | Asymmetric-client, forged/revoked scope, source/session changes, shared-output privacy and cached-history access checks passed; independent integrity review found no remaining confirmed blocker. |
| AC7 pricing/usage | Source/pricing and admission/quota regressions passed. Existing integer-paise commercial rendering retained. |
| AC8 responsive/accessibility | Actual panel with synthetic API fixture checked at 1440×900, 768×900, 390×844, 320×740 and 320×450. Composer visible and Send unobstructed throughout; no horizontal overflow. Escape/focus return, reopen, page interaction and blocking-dialog isolation passed. Long draft checked at 390 pixels. No uncaught page errors; only the fixture's missing favicon returned 404. |
| AC9 final checks | 432 tests across 21 files passed, both workspaces typechecked and built, and `git diff --check` passed. Post-layer-fix launcher rerun: 20 tests passed, frontend typecheck/build passed. |

Exact final automated commands:

```sh
# backend/
npm test -- tests/ask-lisno.test.ts tests/ask-lisno-routes.test.ts tests/ask-lisno-project-resolution.test.ts tests/project-assistant-openai.test.ts tests/project-assistant-narrative.test.ts tests/project-chat-assistant.test.ts tests/project-chat-assistant-routes.test.ts tests/project-assistant-runtime.test.ts tests/project-assistant-app.test.ts tests/project-assistant-sources.test.ts tests/project-assistant-pricing.test.ts tests/project-chat-assistant.replica-set.test.ts tests/project-assistant-runtime.replica-set.test.ts
# 13 files, 230 tests passed, including 22 replica-set tests.
npm test -- tests/api-docs.test.ts tests/authorization-policy.test.ts tests/route-operation-registry.test.ts tests/frontend-authorization-contract.test.ts
# 4 files, 156 tests passed.
npm run typecheck
npm run build

# frontend/
npm test -- src/features/estimates/AskLisnoLauncher.test.tsx src/features/messages/ChatAssistantResult.test.tsx src/features/messages/ChatTimeline.test.tsx src/api/authorization-contract.test.ts
# 4 files, 46 tests passed.
npm run typecheck
npm run build
# After final scoped CSS correction:
npm test -- src/features/estimates/AskLisnoLauncher.test.tsx
# 20 tests passed; typecheck/build repeated successfully.

# repository root/
git diff --check
git status --short
```

Initial sandbox backend checks hit local-listener `EPERM`; identical escalated reruns passed. Existing warnings remain for Mongoose `validateSync()` deprecation and Vite chunks over 500 kB.

The live OpenAI check used the existing local configuration and synthetic facts only, with no database/customer reads or outgoing customer messages. It returned a conversational execution/progress answer and correctly declined to invent an unconfirmed finish date. This is a focused quality check, not a guarantee that every generated paraphrase is factually entailed.

Evidence: `/tmp/lisno-conversational-agent/final-*.log`, `final-browser.log`, `final-chat-*.png`, `final-empty-1440.png` and `final-long-draft-390.png`. Browser QA used an isolated Vite fixture of the actual panel with synthetic API responses; it did not start the backend's demo bootstrap. Mobile keyboard sizing was emulated through a short viewport, not tested on a physical phone.

Not run: full repository suites, OCR (unaffected), lint (no script), real customer end-to-end messaging or production verification. No migration, seed, backfill, deployment, commit, push or key change was performed. Existing local backend processes were not restarted.
